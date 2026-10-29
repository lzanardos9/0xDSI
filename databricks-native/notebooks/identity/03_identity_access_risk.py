# Databricks notebook source
# MAGIC %md
# MAGIC # Identity 03: Access Graph, Group Context and Identity Risk (Phase 2)
# MAGIC
# MAGIC Reads `landing/identity_access/` (`resources.jsonl`, `groups.jsonl`, `edges.jsonl`, optional
# MAGIC `risk_weights.json`), builds the access graph on the canonical spine and evaluates it with
# MAGIC `_shared/identity_access.py`:
# MAGIC
# MAGIC - shortest path from each identity's active accounts to every crown-jewel system,
# MAGIC   including paths that rely on taking over another account (password reset, delegation)
# MAGIC - per-group effective members through nesting, owner status and group findings
# MAGIC - an explainable 0-100 risk score per identity: exposure + behaviour (timeline findings) +
# MAGIC   hygiene (identity findings, MFA, toxic combinations), every point tied to evidence
# MAGIC
# MAGIC Scores are kept with history so drift is visible between runs. Paths and group findings that
# MAGIC no longer reproduce are marked resolved.

# COMMAND ----------

# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

dbutils.widgets.text("access_subdir", "identity_access", "Subfolder of the landing volume holding access feeds")
access_dir = f"/Volumes/{cfg.catalog}/{cfg.schema}/landing/{dbutils.widgets.get('access_subdir').strip('/')}"

require_tables(
    "identity_provider_xref", "identity_canonical", "identity_findings", "identity_event", "identity_timeline_finding",
    "identity_resource", "identity_group", "identity_group_member", "identity_access_edge", "identity_attack_path",
    "identity_group_finding", "identity_risk_score", "identity_risk_history",
)

# COMMAND ----------

import json
import os
from datetime import datetime, timezone

from delta.tables import DeltaTable
from identity_access import (
    RISK_VERSION, _uid, access_version, attack_paths, build_access_model, departments_from_events,
    group_context, leavers_from_events, score_identities,
)

T = lambda name: get_table_path(cfg, name)  # noqa: E731
now = datetime.now(timezone.utc).replace(tzinfo=None)


def _jsonl(name):
    path = f"{access_dir}/{name}.jsonl"
    rows, bad = [], 0
    if not os.path.isfile(path):
        return rows, bad
    with open(path) as fh:
        for line in fh:
            if line.strip():
                try:
                    rows.append(json.loads(line))
                except ValueError:
                    bad += 1
    return rows, bad


resources, bad_r = _jsonl("resources")
groups, bad_g = _jsonl("groups")
edges, bad_e = _jsonl("edges")
weights = None
if os.path.isfile(f"{access_dir}/risk_weights.json"):
    with open(f"{access_dir}/risk_weights.json") as fh:
        weights = json.load(fh)

xrefs = [r.asDict() for r in spark.table(T("identity_provider_xref")).where("source_status <> 'tombstoned'").collect()]
if not xrefs:
    dbutils.notebook.exit("No resolved identities yet; run the identity spine first")

events = []
for r in spark.table(T("identity_event")).where("canonical_id IS NOT NULL").collect():
    e = r.asDict()
    e["occurred_at"] = e["occurred_at"].isoformat()
    e["detail"] = json.loads(e["detail"] or "{}")
    events.append(e)
timeline = [r.asDict() for r in spark.table(T("identity_timeline_finding")).where("status = 'open'").collect()]
id_findings = [r.asDict() for r in spark.table(T("identity_findings")).where("status = 'open'").collect()]
prior = {r["canonical_id"]: r["score"] for r in spark.table(T("identity_risk_score")).select("canonical_id", "score").collect()}
names = {r["canonical_id"]: r["display_name"] for r in spark.table(T("identity_canonical")).select("canonical_id", "display_name").collect()}

model = build_access_model(xrefs, resources, groups, edges)
paths = attack_paths(model)
ctx = group_context(model, departments_from_events(events), leavers_from_events(events))
scores = score_identities(model, paths, ctx["closure"], timeline, id_findings, prior, weights)
av = access_version(model)

q = model["quarantined"]
mon.log_metric("access_quarantined", sum(q.values()) + bad_r + bad_g + bad_e)
mon.log_metric("attack_paths", len(paths))
mon.log_metric("risk_critical", sum(1 for s in scores if s["band"] == "critical"))
print(f"{len(model['resources'])} resources, {len(model['groups'])} groups, {len(model['edges'])} edges "
      f"(quarantined {q}, unreadable {bad_r + bad_g + bad_e}); {len(paths)} crown-jewel paths; "
      f"{len(ctx['findings'])} group findings; {len(scores)} identities scored at {av}")

# COMMAND ----------

def _df(table, rows):
    schema = spark.table(T(table)).schema
    return spark.createDataFrame([tuple(r.get(f.name) for f in schema.fields) for r in rows], schema=schema)


def _replace(table, rows, keys):
    tbl = DeltaTable.forName(spark, T(table)).alias("t")
    cond = " AND ".join(f"t.{k} = s.{k}" for k in keys)
    if rows:
        tbl.merge(_df(table, rows).alias("s"), cond).whenMatchedUpdateAll().whenNotMatchedInsertAll() \
           .whenNotMatchedBySourceDelete().execute()
    else:
        spark.sql(f"DELETE FROM {T(table)}")


def _tracked(table, rows, key, update_cols):
    ts = f"timestamp'{now.isoformat()}'"
    src = _df(table, [dict(r, status="open", first_seen=now, last_seen=now) for r in rows])
    (DeltaTable.forName(spark, T(table)).alias("t")
        .merge(src.alias("s"), f"t.{key} = s.{key}")
        .whenMatchedUpdate(set={"status": "'open'", "last_seen": "s.last_seen", **{c: f"s.{c}" for c in update_cols}})
        .whenNotMatchedInsertAll()
        .whenNotMatchedBySourceUpdate(condition="t.status = 'open'", set={"status": "'resolved'", "last_seen": ts})
        .execute())


_replace("identity_resource", [dict(r, access_version=av, updated_at=now) for r in model["resources"].values()], ["resource_id"])
_replace("identity_group", [dict(g, grants=json.dumps(g["grants"]), access_version=av, updated_at=now) for g in ctx["groups"]], ["group_key"])
_replace("identity_group_member", [dict(m, access_version=av) for m in ctx["members"]], ["membership_id"])
_replace("identity_access_edge", [dict(e, access_version=av, updated_at=now) for e in model["edges"]], ["edge_id"])

_tracked("identity_attack_path", [dict(p, steps=json.dumps(p["steps"]), access_version=av) for p in paths], "path_id",
         ["hops", "via_takeover", "permission", "steps", "access_version"])
_tracked("identity_group_finding", ctx["findings"], "finding_id", ["detail", "severity", "evidence"])

_replace("identity_risk_score", [dict(
    s, display_name=names.get(s["canonical_id"]) or s["display_name"], factors=json.dumps(s["factors"]),
    risk_version=RISK_VERSION, access_version=av, scored_at=now,
) for s in scores], ["canonical_id"])

changed = [s for s in scores if prior.get(s["canonical_id"]) != s["score"]]
if changed:
    _df("identity_risk_history", [{
        "history_id": _uid("risk", s["canonical_id"], now.isoformat()), "canonical_id": s["canonical_id"],
        "score": s["score"], "band": s["band"], "risk_version": RISK_VERSION,
        "weights_version": s["weights_version"], "scored_at": now,
    } for s in changed]).write.mode("append").saveAsTable(T("identity_risk_history"))

print(f"Access and risk written at {av}; {len(changed)} score change(s) recorded")
