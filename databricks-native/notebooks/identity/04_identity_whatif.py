# Databricks notebook source
# MAGIC %md
# MAGIC # Identity 04: What-If Simulator (Phase 3)
# MAGIC
# MAGIC Evaluates proposed access changes without touching any directory. Each scenario in
# MAGIC `identity_whatif_scenario` (sample scenarios from `landing/identity_whatif/scenarios.jsonl`
# MAGIC plus anything analysts submit from the app) is applied to a copy of today's access feeds,
# MAGIC the Phase 2 engine is re-run, and the before/after diff is stored in `identity_whatif_result`:
# MAGIC paths removed or added, score changes with the factors that cleared, memberships lost,
# MAGIC group findings resolved, and lockout warnings when a crown jewel would lose every human path.
# MAGIC
# MAGIC Pass `scenario_id` to evaluate one scenario on demand; leave it empty to refresh all of them
# MAGIC against the current access data.

# COMMAND ----------

# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

dbutils.widgets.text("access_subdir", "identity_access", "Subfolder of the landing volume holding access feeds")
dbutils.widgets.text("whatif_subdir", "identity_whatif", "Subfolder holding sample scenarios")
dbutils.widgets.text("scenario_id", "", "Evaluate only this scenario (empty = all)")
landing = f"/Volumes/{cfg.catalog}/{cfg.schema}/landing"
access_dir = f"{landing}/{dbutils.widgets.get('access_subdir').strip('/')}"
whatif_dir = f"{landing}/{dbutils.widgets.get('whatif_subdir').strip('/')}"
only = dbutils.widgets.get("scenario_id").strip()

require_tables(
    "identity_provider_xref", "identity_findings", "identity_event", "identity_timeline_finding",
    "identity_whatif_scenario", "identity_whatif_result",
)

# COMMAND ----------

import json
import os
from datetime import datetime, timezone

from delta.tables import DeltaTable
from identity_access import access_version, build_access_model
from identity_whatif import WHATIF_VERSION, result_id, scenario_hash, simulate

T = lambda name: get_table_path(cfg, name)  # noqa: E731
now = datetime.now(timezone.utc).replace(tzinfo=None)


def _jsonl(path):
    rows = []
    if os.path.isfile(path):
        with open(path) as fh:
            for line in fh:
                if line.strip():
                    try:
                        rows.append(json.loads(line))
                    except ValueError:
                        pass
    return rows


def _df(table, rows):
    schema = spark.table(T(table)).schema
    return spark.createDataFrame([tuple(r.get(f.name) for f in schema.fields) for r in rows], schema=schema)


resources, groups, edges = (_jsonl(f"{access_dir}/{n}.jsonl") for n in ("resources", "groups", "edges"))
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
av = access_version(build_access_model(xrefs, resources, groups, edges))

# COMMAND ----------

samples = []
for s in _jsonl(f"{whatif_dir}/scenarios.jsonl"):
    try:
        h = scenario_hash(s.get("changes"))
    except ValueError as exc:
        print(f"Skipping sample {s.get('scenario_id')}: {exc}")
        continue
    samples.append({"scenario_id": s["scenario_id"], "name": s["name"], "description": s.get("description", ""),
                    "changes": json.dumps(s["changes"]), "scenario_hash": h, "source": "sample", "status": "pending",
                    "error": None, "created_by": s.get("created_by"), "created_at": now, "evaluated_at": None})
if samples:
    (DeltaTable.forName(spark, T("identity_whatif_scenario")).alias("t")
        .merge(_df("identity_whatif_scenario", samples).alias("s"), "t.scenario_id = s.scenario_id")
        .whenNotMatchedInsertAll().execute())

sql = f"SELECT * FROM {T('identity_whatif_scenario')}"
scen = spark.sql(sql + " WHERE scenario_id = :sid", args={"sid": only}) if only else \
    spark.sql(sql + " ORDER BY created_at DESC LIMIT 200")
scenarios = [r.asDict() for r in scen.collect()]

results, statuses = [], []
for s in scenarios:
    try:
        out = simulate(xrefs, resources, groups, edges, json.loads(s["changes"]), events, timeline, id_findings, weights)
    except (ValueError, TypeError, KeyError) as exc:
        statuses.append(dict(s, status="failed", error=str(exc)[:500], evaluated_at=now))
        continue
    results.append({"result_id": result_id(s["scenario_id"], av), "scenario_id": s["scenario_id"], "access_version": av,
                    "whatif_version": WHATIF_VERSION, "summary": json.dumps(out["summary"]),
                    "result": json.dumps(out), "evaluated_at": now})
    statuses.append(dict(s, status="done", error=None, evaluated_at=now))

if results:
    (DeltaTable.forName(spark, T("identity_whatif_result")).alias("t")
        .merge(_df("identity_whatif_result", results).alias("s"), "t.result_id = s.result_id")
        .whenMatchedUpdateAll().whenNotMatchedInsertAll().execute())
if statuses:
    (DeltaTable.forName(spark, T("identity_whatif_scenario")).alias("t")
        .merge(_df("identity_whatif_scenario", statuses).alias("s"), "t.scenario_id = s.scenario_id")
        .whenMatchedUpdate(set={"status": "s.status", "error": "s.error", "evaluated_at": "s.evaluated_at"})
        .execute())

failed = sum(1 for s in statuses if s["status"] == "failed")
mon.log_metric("whatif_evaluated", len(results))
mon.log_metric("whatif_failed", failed)
print(f"{len(results)} scenario(s) evaluated at {av}; {failed} failed")
