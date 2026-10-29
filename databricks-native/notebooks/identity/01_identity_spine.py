# Databricks notebook source
# MAGIC %md
# MAGIC # Identity 01: Canonical Identity Spine (Phase 0)
# MAGIC
# MAGIC Reads provider snapshots from the identity landing path
# MAGIC (`<provider>/accounts.jsonl` + `manifest.json`), validates them, and runs the
# MAGIC conservative resolver in `_shared/identity_resolution.py`:
# MAGIC
# MAGIC - provider + tenant + immutable object id is the source key; tenants never collide
# MAGIC - authoritative xref > scoped deterministic match > probabilistic candidate (review only)
# MAGIC - cannot-link rules are checked across whole components before every merge
# MAGIC - prior canonical ids are kept stable; merges and splits are recorded as impact
# MAGIC - absence from an incomplete snapshot marks accounts stale, never deleted
# MAGIC - invalid records are counted as quarantined; record bodies are not persisted
# MAGIC
# MAGIC Steward accept/reject decisions from the Resolution Review page are applied on each run.

# COMMAND ----------

# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

dbutils.widgets.text("landing_subdir", "identity", "Subfolder of the landing volume holding identity snapshots")
landing_base = f"/Volumes/{cfg.catalog}/{cfg.schema}/landing/{dbutils.widgets.get('landing_subdir').strip('/')}"

require_tables(
    "identity_canonical", "identity_persona", "identity_provider_xref", "identity_xref_history",
    "identity_resolution_decision", "identity_steward_decision", "identity_resolution_impact",
    "identity_findings", "identity_relation", "identity_source_health",
)

# COMMAND ----------

import json
import os
import uuid
from datetime import datetime, timezone

from delta.tables import DeltaTable
from identity_resolution import (
    Account, IDENTITY_NAMESPACE, RESOLVER_VERSION, reconcile_snapshot, resolve, source_account_key,
)

T = lambda name: get_table_path(cfg, name)  # noqa: E731
now = datetime.now(timezone.utc).replace(tzinfo=None)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Load and validate snapshots

# COMMAND ----------

records, health = [], []
providers = sorted(d for d in os.listdir(landing_base) if os.path.isdir(f"{landing_base}/{d}")) if os.path.isdir(landing_base) else []
if not providers:
    dbutils.notebook.exit(f"No identity snapshots under {landing_base}; nothing to resolve")

prior_rows = {r["account_key"]: r.asDict() for r in spark.table(T("identity_provider_xref")).collect()}

for provider in providers:
    folder = f"{landing_base}/{provider}"
    try:
        with open(f"{folder}/manifest.json") as fh:
            manifest = json.load(fh)
    except (OSError, ValueError):
        health.append({"provider": provider, "tenant": "*", "status": "failed", "error_category": "missing_or_invalid_manifest"})
        continue
    received, accepted, quarantined, keys = 0, 0, 0, set()
    try:
        with open(f"{folder}/accounts.jsonl") as fh:
            for line in fh:
                if not line.strip():
                    continue
                received += 1
                try:
                    rec = json.loads(line)
                    rec["provider"] = provider
                    acc = Account.from_record(rec)
                    keys.add(acc.key)
                    records.append(rec)
                    accepted += 1
                except (ValueError, TypeError):
                    quarantined += 1
    except OSError:
        health.append({"provider": provider, "tenant": "*", "status": "failed", "error_category": "missing_accounts_file"})
        continue

    complete = bool(manifest.get("snapshot_complete")) and quarantined == 0
    previous = {k for k, r in prior_rows.items() if r["provider"] == provider and r["source_status"] != "tombstoned"}
    rec_state = reconcile_snapshot(previous, keys, complete)
    for k in rec_state["tombstoned"] + rec_state["stale"]:
        p = prior_rows[k]
        records.append({
            "provider": p["provider"], "tenant": p["tenant"], "object_id": p["provider_object_id"],
            "principal_type": p["principal_type"], "persona_type": p["persona_type"], "username": p["username"] or "",
            "upn": p["upn"] or "", "email": p["email"] or "", "employee_id": p["employee_id"] or "",
            "display_name": p["display_name"] or "", "raw_state": p["provider_state"] or "",
            "deleted": k in rec_state["tombstoned"], "owner": p["owner"] or "",
            "grc_application_id": p["grc_application_id"] or "", "runtime_host": p["runtime_host"] or "",
            "registration_source": p["registration_source"] or "", "last_seen": p["last_seen"] or "",
            "_status": "tombstoned" if k in rec_state["tombstoned"] else "stale",
        })
    health.append({
        "provider": provider, "tenant": ",".join(sorted({k.split(":")[1] for k in keys})) or "*",
        "snapshot_at": manifest.get("snapshot_at"), "snapshot_complete": complete,
        "records_received": received, "records_accepted": accepted, "records_quarantined": quarantined,
        "tombstoned": len(rec_state["tombstoned"]), "stale": len(rec_state["stale"]),
        "status": "healthy" if complete else "incomplete",
        "error_category": None if quarantined == 0 else "invalid_records",
        "last_success_at": now,
    })

status_by_key = {}
for rec in records:
    k = source_account_key(rec["provider"], rec["tenant"], rec["object_id"])
    status_by_key[k] = rec.pop("_status", "current")
    if k in prior_rows:
        rec["prior_canonical_id"] = prior_rows[k]["canonical_id"]

print(f"Loaded {len(records)} accounts from {len(providers)} sources")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Resolve

# COMMAND ----------

steward = [r.asDict() for r in spark.sql(f"""
    SELECT left_key, right_key, verdict FROM (
      SELECT *, row_number() OVER (PARTITION BY least(left_key, right_key), greatest(left_key, right_key)
                                   ORDER BY decided_at DESC) AS rn
      FROM {T('identity_steward_decision')}) WHERE rn = 1
""").collect()]

result = resolve(records, steward)
rv = result["resolution_version"]
mon.log_metric("identities", len(result["identities"]))
mon.log_metric("review_required", sum(1 for d in result["decisions"] if d.verdict == "REVIEW_REQUIRED"))
print(f"Resolution {rv}: {len(result['identities'])} identities, {len(result['personas'])} personas, "
      f"{len(result['impact'])} merge/split impacts")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Persist

# COMMAND ----------

def _df(table, rows):
    schema = spark.table(T(table)).schema
    return spark.createDataFrame([tuple(r.get(f.name) for f in schema.fields) for r in rows], schema=schema)


def _merge(table, rows, keys, update=True, delete_missing=False):
    src = _df(table, rows)
    cond = " AND ".join(f"t.{k} = s.{k}" for k in keys)
    m = DeltaTable.forName(spark, T(table)).alias("t").merge(src.alias("s"), cond)
    if update:
        m = m.whenMatchedUpdateAll()
    m = m.whenNotMatchedInsertAll()
    if delete_missing:
        m = m.whenNotMatchedBySourceDelete()
    m.execute()


def _id(*parts):
    return str(uuid.uuid5(IDENTITY_NAMESPACE, "|".join(str(p) for p in parts)))


first_seen = {r["canonical_id"]: r["first_resolved_at"] for r in
              spark.table(T("identity_canonical")).select("canonical_id", "first_resolved_at").collect()}

_merge("identity_canonical", [{
    "canonical_id": i["canonical_id"], "principal_type": i["principal_type"], "display_name": i["display_name"],
    "account_count": i["account_count"], "providers": i["providers"], "personas": i["personas"],
    "normalized_states": i["states"], "state_conflict": i["state_conflict"], "resolution_version": rv,
    "resolver_version": RESOLVER_VERSION, "first_resolved_at": first_seen.get(i["canonical_id"], now), "updated_at": now,
} for i in result["identities"]], ["canonical_id"], delete_missing=True)

_merge("identity_persona", [dict(p, resolution_version=rv, updated_at=now) for p in result["personas"]],
       ["persona_id"], delete_missing=True)

_merge("identity_provider_xref", [dict(
    x, source_status=status_by_key[x["account_key"]], resolution_version=rv,
    valid_from=now if prior_rows.get(x["account_key"], {}).get("canonical_id") != x["canonical_id"]
    else prior_rows[x["account_key"]]["valid_from"], updated_at=now,
) for x in result["xrefs"]], ["account_key"])

_merge("identity_xref_history", [{
    "history_id": _id("xref", x["account_key"], x["canonical_id"], x["persona_id"]), "account_key": x["account_key"],
    "canonical_id": x["canonical_id"], "persona_id": x["persona_id"], "resolution_version": rv, "recorded_at": now,
} for x in result["xrefs"]], ["history_id"], update=False)

_merge("identity_resolution_decision", [{
    "decision_id": d.decision_id, "left_key": d.left_key, "right_key": d.right_key, "rule": d.rule,
    "verdict": d.verdict, "confidence": float(d.confidence), "features": json.dumps(d.features, sort_keys=True),
    "resolver_version": RESOLVER_VERSION, "resolution_version": rv, "decided_at": now,
} for d in result["decisions"]], ["decision_id"], update=False)

if result["impact"]:
    _merge("identity_resolution_impact", [dict(
        i, impact_id=_id("impact", i["kind"], i["superseded_canonical_id"], i["canonical_id"], rv),
        resolution_version=rv, recorded_at=now,
    ) for i in result["impact"]], ["impact_id"], update=False)

# Findings: refresh current ones, close any that no longer reproduce.
fdf = _df("identity_findings", [dict(f, status="open", first_seen=now, last_seen=now, resolution_version=rv)
                                 for f in result["findings"]])
(DeltaTable.forName(spark, T("identity_findings")).alias("t")
    .merge(fdf.alias("s"), "t.finding_id = s.finding_id")
    .whenMatchedUpdate(set={"status": "'open'", "detail": "s.detail", "last_seen": "s.last_seen",
                            "resolution_version": "s.resolution_version"})
    .whenNotMatchedInsertAll()
    .whenNotMatchedBySourceUpdate(condition="t.status = 'open'", set={"status": "'resolved'", "last_seen": f"timestamp'{now.isoformat()}'"})
    .execute())

relations = []
for x in result["xrefs"]:
    relations.append(("account", x["account_key"], "acts_as", x["persona_id"], "resolver", "verified"))
    relations.append(("persona", x["persona_id"], "belongs_to", x["canonical_id"], "resolver", "verified"))
    if x["owner"]:
        relations.append(("nhi", x["canonical_id"], "owned_by", x["owner"], "source_attribute",
                          "verified" if x["grc_application_id"] else "provisional"))
    if x["grc_application_id"]:
        relations.append(("nhi", x["canonical_id"], "belongs_to_application", x["grc_application_id"], "source_attribute", "provisional"))
    if x["runtime_host"]:
        relations.append(("nhi", x["canonical_id"], "runs_on", x["runtime_host"], "observed", "provisional"))
_merge("identity_relation", [{
    "relation_id": _id("rel", s, rt, t), "source_id": s, "relation_type": rt, "target_id": t,
    "provenance": prov, "verification": ver, "resolution_version": rv, "updated_at": now,
} for _, s, rt, t, prov, ver in relations], ["relation_id"], delete_missing=True)

_merge("identity_source_health", [dict(h, last_run_at=now) for h in health], ["provider", "tenant"])

print(f"Identity spine written at resolution {rv}")
