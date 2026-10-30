# Databricks notebook source
# MAGIC %md
# MAGIC # Identity 06: Remediation (Phase 4)
# MAGIC
# MAGIC Two stages share this notebook:
# MAGIC - **plan** (daily, in Identity 01): turns today's open timeline, group, risk and federation findings into
# MAGIC   reversible proposals, simulates each one (score changes, paths removed, lockouts), refreshes proposals
# MAGIC   nobody has acted on, retires proposals whose finding no longer reproduces, and marks executed actions
# MAGIC   **verified** once the directory feeds show the change.
# MAGIC - **execute** (Identity 03, triggered by the app on approval or rollback): leases outbox rows with a
# MAGIC   compare-and-swap token, re-checks the approvals and re-validates the change against today's data, then
# MAGIC   dispatches it. `execution_mode = dry_run` (default) records the exact provider request without sending it;
# MAGIC   `live` requires a configured connector for the provider and fails closed otherwise.

# COMMAND ----------

# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

dbutils.widgets.text("access_subdir", "identity_access", "Subfolder of the landing volume holding access feeds")
dbutils.widgets.text("stage", "plan", "plan | execute")
dbutils.widgets.text("execution_mode", "dry_run", "dry_run | live")
landing = f"/Volumes/{cfg.catalog}/{cfg.schema}/landing"
access_dir = f"{landing}/{dbutils.widgets.get('access_subdir').strip('/')}"
stage = dbutils.widgets.get("stage").strip().lower()
mode = dbutils.widgets.get("execution_mode").strip().lower()
if stage not in ("plan", "execute") or mode not in ("dry_run", "live"):
    raise ValueError("stage must be plan|execute and execution_mode dry_run|live")

require_tables(
    "identity_provider_xref", "identity_findings", "identity_event", "identity_timeline_finding",
    "identity_federation_finding", "identity_remediation_action", "identity_remediation_approval",
    "identity_remediation_outbox",
)

# COMMAND ----------

import json
import os
import uuid
from datetime import datetime, timezone

from delta.tables import DeltaTable
from identity_access import access_version, build_access_model
from identity_remediation import (MAX_ATTEMPTS, REMEDIATION_VERSION, ConnectorMissing, approvals_satisfied,
                                  before_state, claimable, dispatch, inverse, lease_until, observed, precheck,
                                  propose, provider_request)

T = lambda name: get_table_path(cfg, name)  # noqa: E731
now = datetime.now(timezone.utc).replace(tzinfo=None)
CONNECTORS = {}  # provider -> callable(request) -> response; none are configured yet, so live mode fails closed


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
fed_findings = [r.asDict() for r in spark.table(T("identity_federation_finding")).where("status = 'open'").collect()]
model = build_access_model(xrefs, resources, groups, edges)
av = access_version(model)

# COMMAND ----------

if stage == "plan":
    proposals = propose(xrefs, resources, groups, edges, events, timeline, id_findings, fed_findings, weights, av)
    rows = [{**{k: p[k] for k in ("action_id", "action_type", "title", "severity", "canonical_id", "display_name",
                                   "provider", "required_approvals", "status", "blocked_reason", "access_version",
                                   "action_hash")},
             "change": json.dumps(p["change"], sort_keys=True), "reasons": json.dumps(p["reasons"]),
             "impact": json.dumps(p["impact"]), "remediation_version": REMEDIATION_VERSION,
             "created_at": now, "updated_at": now} for p in proposals]
    refresh = {c: f"s.{c}" for c in ("title", "reasons", "severity", "impact", "required_approvals", "status",
                                      "blocked_reason", "access_version", "action_hash", "remediation_version",
                                      "updated_at")}
    if rows:
        (DeltaTable.forName(spark, T("identity_remediation_action")).alias("t")
            .merge(_df("identity_remediation_action", rows).alias("s"), "t.action_id = s.action_id")
            .whenMatchedUpdate(condition="t.status IN ('proposed', 'blocked', 'superseded')", set=refresh)
            .whenNotMatchedInsertAll().execute())

    current = {r["action_id"] for r in rows}
    existing = [r.asDict() for r in spark.table(T("identity_remediation_action"))
                .where("status IN ('proposed', 'blocked', 'executed')").collect()]
    stale = [dict(r, status="superseded", updated_at=now) for r in existing
             if r["status"] in ("proposed", "blocked") and r["action_id"] not in current]
    verified = [dict(r, status="verified", verified_at=now, updated_at=now) for r in existing
                if r["status"] == "executed" and observed(json.loads(r["change"]), xrefs, groups, edges)]
    for batch, cond, cols in ((stale, "t.status IN ('proposed', 'blocked')", ("status", "updated_at")),
                              (verified, "t.status = 'executed'", ("status", "verified_at", "updated_at"))):
        if batch:
            (DeltaTable.forName(spark, T("identity_remediation_action")).alias("t")
                .merge(_df("identity_remediation_action", batch).alias("s"), "t.action_id = s.action_id")
                .whenMatchedUpdate(condition=cond, set={c: f"s.{c}" for c in cols}).execute())

    mon.log_metric("remediation_proposals", len(rows))
    mon.log_metric("remediation_verified", len(verified))
    print(f"{len(rows)} proposal(s) at {av} ({sum(1 for r in rows if r['status'] == 'blocked')} blocked); "
          f"{len(stale)} superseded; {len(verified)} verified")
    dbutils.notebook.exit("plan done")

# COMMAND ----------

OUTBOX, ACTIONS = T("identity_remediation_outbox"), T("identity_remediation_action")
worker = f"identity-executor-{uuid.uuid4()}"


def _lease(row):
    """Compare-and-swap lease: only one worker's token survives; everyone else re-reads and skips."""
    token = str(uuid.uuid4())
    try:
        spark.sql(f"""UPDATE {OUTBOX} SET status = 'leased', lease_owner = :w, lease_token = :tok,
                          lease_expires_at = :exp, attempts = COALESCE(attempts, 0) + 1, updated_at = :now
                      WHERE outbox_id = :id AND status = :st AND COALESCE(lease_token, '') = :old""",
                  args={"w": worker, "tok": token, "exp": lease_until(now), "now": now, "id": row["outbox_id"],
                        "st": row["status"], "old": row.get("lease_token") or ""})
    except Exception as exc:  # concurrent commit conflict: another worker won this row
        print(f"Lease lost on {row['outbox_id']}: {type(exc).__name__}")
        return None
    got = spark.sql(f"SELECT lease_token, attempts FROM {OUTBOX} WHERE outbox_id = :id", args={"id": row["outbox_id"]}).collect()
    return (token, got[0]["attempts"]) if got and got[0]["lease_token"] == token else None


def _finish_outbox(oid, token, status, request=None, response=None, error=None):
    spark.sql(f"""UPDATE {OUTBOX} SET status = :st, execution_mode = :mode, request = :req, response = :resp,
                      error = :err, lease_expires_at = NULL, updated_at = :now
                  WHERE outbox_id = :id AND lease_token = :tok""",
              args={"st": status, "mode": mode, "req": json.dumps(request) if request else None,
                    "resp": json.dumps(response) if response else None, "err": error, "now": now, "id": oid,
                    "tok": token})


def _set_action(aid, expected, **cols):
    cols["updated_at"] = now
    sets = ", ".join(f"{c} = :{c}" for c in cols)
    spark.sql(f"UPDATE {ACTIONS} SET {sets} WHERE action_id = :aid AND status = :expected",
              args={**cols, "aid": aid, "expected": expected})


candidates = [r.asDict() for r in spark.table(OUTBOX).where("status IN ('queued', 'leased')").collect()]
done = failed = 0
for row in sorted((r for r in candidates if claimable(r, now)), key=lambda r: r["created_at"] or now):
    lease = _lease(row)
    if not lease:
        continue
    token, attempts = lease
    oid, aid, op = row["outbox_id"], row["action_id"], row["operation"]
    found = spark.sql(f"SELECT * FROM {ACTIONS} WHERE action_id = :aid", args={"aid": aid}).collect()
    action = found[0].asDict() if found else None
    expected = "queued" if op == "execute" else "rollback_queued"
    if not action or action["status"] != expected:
        _finish_outbox(oid, token, "failed", error=f"Action is not {expected}; nothing was sent")
        failed += 1
        continue
    approvals = [r.asDict() for r in spark.sql(
        f"SELECT * FROM {T('identity_remediation_approval')} WHERE action_id = :aid", args={"aid": aid}).collect()]
    ok, why = approvals_satisfied(action, approvals)
    if not ok:
        _finish_outbox(oid, token, "failed", error=why)
        _set_action(aid, expected, status="failed" if op == "execute" else "rollback_failed", error=why)
        failed += 1
        continue

    change = json.loads(action["change"] if op == "execute" else action["inverse"])
    try:
        if op == "execute":
            verdict, why = precheck(change, xrefs, resources, groups, edges, events, timeline, id_findings)
            if verdict != "ok":
                _finish_outbox(oid, token, "done" if verdict == "no_op" else "failed", response={"result": verdict}, error=why)
                if verdict == "no_op":
                    _set_action(aid, expected, status="no_longer_needed", error=why)
                else:
                    _set_action(aid, expected, status="blocked", blocked_reason=why)
                continue
            before = before_state(change, model)
            request = provider_request(change, row["idempotency_key"])
            response = dispatch(request, mode, CONNECTORS)
            _finish_outbox(oid, token, "done", request, response)
            _set_action(aid, expected, status="executed", execution_mode=mode, executed_at=now,
                        before_state=json.dumps(before), inverse=json.dumps(inverse(change, before), sort_keys=True),
                        provider_request=json.dumps(request), error=None)
        else:
            request = provider_request(change, row["idempotency_key"])
            response = {"result": "no_op", "note": "The directory already shows the original state"} \
                if mode == "live" and observed(change, xrefs, groups, edges) else dispatch(request, mode, CONNECTORS)
            _finish_outbox(oid, token, "done", request, response)
            _set_action(aid, expected, status="rolled_back", rolled_back_at=now, error=None)
        done += 1
    except ConnectorMissing as exc:
        _finish_outbox(oid, token, "failed", error=str(exc))
        _set_action(aid, expected, status="failed" if op == "execute" else "rollback_failed", error=str(exc))
        failed += 1
    except Exception as exc:
        final = attempts >= MAX_ATTEMPTS
        _finish_outbox(oid, token, "failed" if final else "queued", error=f"{type(exc).__name__}: {str(exc)[:400]}")
        if final:
            _set_action(aid, expected, status="failed" if op == "execute" else "rollback_failed", error=str(exc)[:500])
        failed += 1

mon.log_metric("remediation_dispatched", done)
mon.log_metric("remediation_failed", failed)
print(f"{done} outbox item(s) completed in {mode} mode; {failed} failed or deferred")
