# Databricks notebook source
# MAGIC %md
# MAGIC # Identity 05: Federation Posture (Phase 3)
# MAGIC
# MAGIC Reads `landing/identity_federation/trusts.jsonl` (partner tenant trusts, IdP federations,
# MAGIC AD forest trusts), the optional `changes.jsonl` change log from the directory audit feed and
# MAGIC an optional `baseline.json`, then checks every trust against the baseline with
# MAGIC `_shared/identity_federation.py`. Guest accounts on the identity spine are matched to their
# MAGIC partner and checked for sponsor, staleness and privileged access.
# MAGIC
# MAGIC Settings that differ from the previous run are recorded as changes, so drift is visible even
# MAGIC without an audit feed. Findings that no longer reproduce are marked resolved.

# COMMAND ----------

# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

dbutils.widgets.text("access_subdir", "identity_access", "Subfolder of the landing volume holding access feeds")
dbutils.widgets.text("federation_subdir", "identity_federation", "Subfolder holding federation feeds")
landing = f"/Volumes/{cfg.catalog}/{cfg.schema}/landing"
access_dir = f"{landing}/{dbutils.widgets.get('access_subdir').strip('/')}"
fed_dir = f"{landing}/{dbutils.widgets.get('federation_subdir').strip('/')}"

require_tables(
    "identity_provider_xref", "identity_event", "identity_federation_trust", "identity_federation_guest",
    "identity_federation_finding", "identity_federation_change",
)

# COMMAND ----------

import json
import os
from datetime import datetime, timezone

from delta.tables import DeltaTable
from identity_access import _uid, build_access_model, group_context, leavers_from_events
from identity_federation import DEFAULT_BASELINE, FEDERATION_VERSION, diff_settings, evaluate, guest_groups

T = lambda name: get_table_path(cfg, name)  # noqa: E731
now = datetime.now(timezone.utc).replace(tzinfo=None)


def _jsonl(path):
    rows, bad = [], 0
    if os.path.isfile(path):
        with open(path) as fh:
            for line in fh:
                if line.strip():
                    try:
                        rows.append(json.loads(line))
                    except ValueError:
                        bad += 1
    return rows, bad


def _df(table, rows):
    schema = spark.table(T(table)).schema
    return spark.createDataFrame([tuple(r.get(f.name) for f in schema.fields) for r in rows], schema=schema)


trusts, bad_t = _jsonl(f"{fed_dir}/trusts.jsonl")
logged, bad_c = _jsonl(f"{fed_dir}/changes.jsonl")
baseline = DEFAULT_BASELINE
if os.path.isfile(f"{fed_dir}/baseline.json"):
    with open(f"{fed_dir}/baseline.json") as fh:
        baseline = tuple(json.load(fh))

xrefs = [r.asDict() for r in spark.table(T("identity_provider_xref")).where("source_status <> 'tombstoned'").collect()]
if not xrefs:
    dbutils.notebook.exit("No resolved identities yet; run the identity spine first")
events = [dict(r.asDict(), occurred_at=r["occurred_at"].isoformat()) for r in
          spark.table(T("identity_event")).where("event_type IN ('hr_leaver','hr_rehire')").collect()]
access = {n: _jsonl(f"{access_dir}/{n}.jsonl")[0] for n in ("resources", "groups", "edges")}
model = build_access_model(xrefs, access["resources"], access["groups"], access["edges"])
groups_by_account = guest_groups(model, group_context(model)["closure"])

prior = {r["trust_id"]: json.loads(r["settings"] or "{}")
         for r in spark.table(T("identity_federation_trust")).select("trust_id", "settings").collect()}
detected = diff_settings(prior, trusts, now.isoformat() + "Z")
logged_keys = {(c.get("trust_id"), c.get("setting"), json.dumps(c.get("after"))) for c in logged}
changes = logged + [c for c in detected if (c["trust_id"], c["setting"], json.dumps(c["after"])) not in logged_keys]

out = evaluate(trusts, xrefs, now.replace(tzinfo=timezone.utc), leavers_from_events(events), groups_by_account,
               changes, baseline)
s = out["summary"]
mon.log_metric("federation_findings_high", s["by_severity"]["high"])
mon.log_metric("federation_posture_score", s["posture_score"])
print(f"{s['trusts']} trusts, {s['guests']} guests, {s['findings']} findings, posture {s['posture_score']}% "
      f"(unreadable lines: {bad_t + bad_c})")

# COMMAND ----------

def _replace(table, rows, key):
    tbl = DeltaTable.forName(spark, T(table)).alias("t")
    if rows:
        tbl.merge(_df(table, rows).alias("s"), f"t.{key} = s.{key}").whenMatchedUpdateAll() \
           .whenNotMatchedInsertAll().whenNotMatchedBySourceDelete().execute()
    else:
        spark.sql(f"DELETE FROM {T(table)}")


_replace("identity_federation_trust", [dict(t, partner_domains=json.dumps(t["partner_domains"]),
                                            settings=json.dumps(t["settings"]), federation_version=FEDERATION_VERSION,
                                            updated_at=now) for t in out["trusts"]], "trust_id")
_replace("identity_federation_guest", [dict(g, groups=json.dumps(g["groups"]),
                                            privileged_groups=json.dumps(g["privileged_groups"]), updated_at=now)
                                       for g in out["guests"]], "account_key")

ts = f"timestamp'{now.isoformat()}'"
src = _df("identity_federation_finding", [dict(f, status="open", first_seen=now, last_seen=now) for f in out["findings"]])
(DeltaTable.forName(spark, T("identity_federation_finding")).alias("t")
    .merge(src.alias("s"), "t.finding_id = s.finding_id")
    .whenMatchedUpdate(set={"status": "'open'", "last_seen": "s.last_seen", "resolved_at": "NULL",
                            **{c: f"s.{c}" for c in ("severity", "title", "detail", "expected", "actual",
                                                      "changed_by", "changed_at")}})
    .whenNotMatchedInsertAll()
    .whenNotMatchedBySourceUpdate(condition="t.status = 'open'",
                                  set={"status": "'resolved'", "last_seen": ts, "resolved_at": ts})
    .execute())

change_rows = [{"change_id": _uid("fedchange", c["trust_id"], c["setting"], c.get("changed_at"), json.dumps(c.get("after"))),
                "trust_id": c["trust_id"], "setting": c["setting"], "before_value": json.dumps(c.get("before")),
                "after_value": json.dumps(c.get("after")), "changed_at": str(c.get("changed_at") or ""),
                "changed_by": c.get("changed_by"), "recorded_at": now} for c in changes if c.get("trust_id") and c.get("setting")]
if change_rows:
    (DeltaTable.forName(spark, T("identity_federation_change")).alias("t")
        .merge(_df("identity_federation_change", change_rows).alias("s"), "t.change_id = s.change_id")
        .whenNotMatchedInsertAll().execute())

print(f"Federation posture written; {len(detected)} setting change(s) detected since the last run")
