# Databricks notebook source
# MAGIC %md
# MAGIC # Identity 02: Identity Timeline (Phase 1)
# MAGIC
# MAGIC Reads lifecycle (HR), account, access, sign-in, MFA and credential events from
# MAGIC `landing/identity_events/*.jsonl`, links each one to a canonical identity using the
# MAGIC spine's provider cross-references, and evaluates timeline detections in
# MAGIC `_shared/identity_timeline.py`:
# MAGIC
# MAGIC - leavers with sign-ins after termination or accounts still enabled
# MAGIC - movers still holding access scoped to their previous department
# MAGIC - MFA fatigue (repeated push denials) and MFA resets followed by a new-country sign-in
# MAGIC - privileged grants with no change ticket
# MAGIC - workload identities whose owner has left
# MAGIC
# MAGIC Events link only by exact account key or by a unique HR employee id; anything else stays
# MAGIC `unlinked` and is still stored. Findings that no longer reproduce are marked resolved.

# COMMAND ----------

# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

dbutils.widgets.text("events_subdir", "identity_events", "Subfolder of the landing volume holding identity events")
events_dir = f"/Volumes/{cfg.catalog}/{cfg.schema}/landing/{dbutils.widgets.get('events_subdir').strip('/')}"

require_tables("identity_provider_xref", "identity_event", "identity_timeline_finding")

# COMMAND ----------

import json
import os
from datetime import datetime, timezone

from delta.tables import DeltaTable
from identity_timeline import link_events, timeline_findings, timeline_version

T = lambda name: get_table_path(cfg, name)  # noqa: E731
now = datetime.now(timezone.utc).replace(tzinfo=None)

files = sorted(f for f in os.listdir(events_dir) if f.endswith(".jsonl")) if os.path.isdir(events_dir) else []
if not files:
    dbutils.notebook.exit(f"No identity events under {events_dir}; nothing to link")

raw, unreadable = [], 0
for name in files:
    with open(f"{events_dir}/{name}") as fh:
        for line in fh:
            if not line.strip():
                continue
            try:
                raw.append(json.loads(line))
            except ValueError:
                unreadable += 1

xrefs = [r.asDict() for r in spark.table(T("identity_provider_xref")).where("source_status <> 'tombstoned'").collect()]
linked = link_events(raw, xrefs)
events = linked["events"]
findings = timeline_findings(events, xrefs)
tv = timeline_version(events)

mon.log_metric("timeline_events", len(events))
mon.log_metric("timeline_unlinked", linked["unlinked"])
mon.log_metric("timeline_quarantined", linked["quarantined"] + unreadable)
mon.log_metric("timeline_findings", len(findings))
print(f"{len(events)} events ({linked['unlinked']} unlinked, {linked['quarantined'] + unreadable} quarantined), "
      f"{len(findings)} findings, version {tv}")

# COMMAND ----------

def _ts(value):
    return datetime.fromisoformat(value.replace("Z", "+00:00")).replace(tzinfo=None) if value else None


def _df(table, rows):
    schema = spark.table(T(table)).schema
    return spark.createDataFrame([tuple(r.get(f.name) for f in schema.fields) for r in rows], schema=schema)


event_rows = [dict(e, occurred_at=_ts(e["occurred_at"]), detail=json.dumps(e["detail"], sort_keys=True),
                   timeline_version=tv, ingested_at=now) for e in events]
if event_rows:
    (DeltaTable.forName(spark, T("identity_event")).alias("t")
        .merge(_df("identity_event", event_rows).alias("s"), "t.event_id = s.event_id")
        .whenMatchedUpdate(set={c: f"s.{c}" for c in ("canonical_id", "persona_id", "link_status", "timeline_version")})
        .whenNotMatchedInsertAll()
        .execute())

finding_rows = [dict(f, occurred_at=_ts(f["occurred_at"]), status="open", first_seen=now, last_seen=now) for f in findings]
(DeltaTable.forName(spark, T("identity_timeline_finding")).alias("t")
    .merge(_df("identity_timeline_finding", finding_rows).alias("s"), "t.finding_id = s.finding_id")
    .whenMatchedUpdate(set={"status": "'open'", "detail": "s.detail", "severity": "s.severity",
                            "evidence_event_ids": "s.evidence_event_ids", "last_seen": "s.last_seen"})
    .whenNotMatchedInsertAll()
    .whenNotMatchedBySourceUpdate(condition="t.status = 'open'",
                                  set={"status": "'resolved'", "last_seen": f"timestamp'{now.isoformat()}'"})
    .execute())

print(f"Identity timeline written at {tv}")
