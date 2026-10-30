"""
Identity Datalake API, Phase 3: what-if simulator. Analysts compose a scenario of proposed
access changes; the Identity 02 job evaluates it against a copy of today's access data and
stores the diff. Nothing here changes any directory.
"""

import json
import re
import uuid
from typing import Callable

from fastapi import APIRouter, HTTPException, Request

from backend.identity import _page

WHATIF_JOB = "[0xDSI] Identity 02 - What-If Simulator"
MAX_CHANGES = 20
CHANGE_FIELDS = {
    "remove_membership": ("group", "member"),
    "revoke_grant": ("source", "resource_id"),
    "remove_takeover": ("source", "target"),
    "disable_account": ("account",),
    "delete_group": ("group",),
}
_KEY = re.compile(r"^[^:\s]+:[^:\s]+:\S+$")


def _clean_changes(raw) -> list:
    if not isinstance(raw, list) or not raw:
        raise HTTPException(status_code=400, detail="Add at least one change")
    if len(raw) > MAX_CHANGES:
        raise HTTPException(status_code=400, detail=f"A scenario can hold at most {MAX_CHANGES} changes")
    out = []
    for i, c in enumerate(raw, 1):
        if not isinstance(c, dict) or c.get("type") not in CHANGE_FIELDS:
            raise HTTPException(status_code=400, detail=f"Change {i} has an unknown type")
        norm = {"type": c["type"]}
        for f in CHANGE_FIELDS[c["type"]]:
            v = str(c.get(f) or "").strip()[:300]
            if not v or (f != "resource_id" and not _KEY.match(v)):
                raise HTTPException(status_code=400, detail=f"Change {i} needs a valid '{f}'")
            norm[f] = v
        if c["type"] == "revoke_grant" and c.get("permission"):
            norm["permission"] = str(c["permission"]).strip().lower()[:100]
        out.append(norm)
    return out


def _parse(row: dict, *cols: str) -> dict:
    for col in cols:
        try:
            row[col] = json.loads(row.get(col) or "null")
        except ValueError:
            row[col] = None
    return row


def add_whatif_routes(router: APIRouter, query: Callable, execute_write: Callable, fqn: Callable,
                      analyst: Callable, audit: Callable, trigger_job: Callable) -> None:

    def _latest_results():
        return query(f"""
            SELECT scenario_id, summary, access_version, evaluated_at FROM (
              SELECT *, ROW_NUMBER() OVER (PARTITION BY scenario_id ORDER BY evaluated_at DESC) AS rn
              FROM {fqn('identity_whatif_result')}) WHERE rn = 1
        """)

    @router.get("/whatif/scenarios")
    async def list_scenarios(request: Request, limit: int = 100, offset: int = 0):
        analyst(request)
        limit, offset = _page(limit, offset)
        rows = [_parse(r, "changes") for r in query(f"""
            SELECT scenario_id, name, description, changes, source, status, error, created_by, created_at, evaluated_at
            FROM {fqn('identity_whatif_scenario')} ORDER BY created_at DESC, name LIMIT {limit} OFFSET {offset}
        """)]
        latest = {r["scenario_id"]: _parse(r, "summary") for r in _latest_results()}
        for r in rows:
            res = latest.get(r["scenario_id"])
            r["summary"] = res["summary"] if res else None
            r["access_version"] = res["access_version"] if res else None
        current = query(f"SELECT MAX(access_version) AS v FROM {fqn('identity_risk_score')}")
        return {"scenarios": rows, "current_access_version": current[0]["v"] if current else None}

    @router.get("/whatif/scenarios/{scenario_id}")
    async def scenario_detail(scenario_id: str, request: Request):
        analyst(request)
        found = query(f"""SELECT scenario_id, name, description, changes, source, status, error, created_by,
                                 created_at, evaluated_at
                          FROM {fqn('identity_whatif_scenario')} WHERE scenario_id = :sid""", {"sid": scenario_id})
        if not found:
            raise HTTPException(status_code=404, detail="Scenario not found")
        res = query(f"""SELECT result, access_version, evaluated_at FROM {fqn('identity_whatif_result')}
                        WHERE scenario_id = :sid ORDER BY evaluated_at DESC LIMIT 1""", {"sid": scenario_id})
        result = _parse(res[0], "result")["result"] if res else None
        if isinstance(result, dict):
            result = {**result, "access_version": res[0]["access_version"], "evaluated_at": res[0]["evaluated_at"]}
        return {"scenario": _parse(found[0], "changes"), "result": result if isinstance(result, dict) else None}

    @router.get("/whatif/options")
    async def scenario_options(request: Request):
        analyst(request)
        groups = query(f"""SELECT group_key, name, privileged, effective_member_count
                           FROM {fqn('identity_group')} ORDER BY name LIMIT 2000""")
        names = {g["group_key"]: g["name"] for g in groups}
        members = query(f"""SELECT group_key, account_key, username, display_name, normalized_state
                            FROM {fqn('identity_group_member')} WHERE direct = true
                            ORDER BY display_name LIMIT 5000""")
        edges = query(f"""SELECT e.source_id, e.source_kind, e.edge_type, e.target_id, e.target_kind, e.permission,
                                 x.username AS target_username, sx.username AS source_username
                          FROM {fqn('identity_access_edge')} e
                          LEFT JOIN {fqn('identity_provider_xref')} x ON e.target_kind = 'a' AND x.account_key = e.target_id
                          LEFT JOIN {fqn('identity_provider_xref')} sx ON e.source_kind = 'a' AND sx.account_key = e.source_id
                          WHERE e.edge_type IN ('grants', 'can_take_over', 'nested_in') LIMIT 5000""")
        resources = {r["resource_id"]: r["name"] for r in
                     query(f"SELECT resource_id, name FROM {fqn('identity_resource')} LIMIT 2000")}

        def label(kind, key, username=None):
            return names.get(key, key) if kind == "g" else (username or key)

        memberships = [{"group": m["group_key"], "group_name": names.get(m["group_key"], m["group_key"]),
                        "member": m["account_key"], "member_name": m["display_name"] or m["username"],
                        "member_kind": "account"} for m in members]
        memberships += [{"group": e["target_id"], "group_name": names.get(e["target_id"], e["target_id"]),
                         "member": e["source_id"], "member_name": names.get(e["source_id"], e["source_id"]),
                         "member_kind": "group"} for e in edges if e["edge_type"] == "nested_in"]
        grants = [{"source": e["source_id"], "source_name": label(e["source_kind"], e["source_id"], e["source_username"]),
                   "resource_id": e["target_id"], "resource": resources.get(e["target_id"], e["target_id"]),
                   "permission": e["permission"]} for e in edges if e["edge_type"] == "grants"]
        takeovers = [{"source": e["source_id"], "source_name": label(e["source_kind"], e["source_id"], e["source_username"]),
                      "target": e["target_id"], "target_name": e["target_username"] or e["target_id"],
                      "permission": e["permission"]} for e in edges if e["edge_type"] == "can_take_over"]
        accounts = {}
        for m in members:
            if m["normalized_state"] not in ("DISABLED", "DELETED", "SUSPENDED"):
                accounts[m["account_key"]] = {"account": m["account_key"], "username": m["username"],
                                              "display_name": m["display_name"]}
        for t in takeovers:
            accounts.setdefault(t["target"], {"account": t["target"], "username": t["target_name"], "display_name": None})
        return {"groups": groups, "memberships": sorted(memberships, key=lambda m: (m["group_name"], m["member_name"] or "")),
                "grants": grants, "takeovers": takeovers,
                "accounts": sorted(accounts.values(), key=lambda a: a["display_name"] or a["username"] or "")}

    def _run(scenario_id: str) -> dict:
        result = trigger_job(WHATIF_JOB, {"scenario_id": scenario_id})
        return {"triggered": bool(result.get("triggered")), "run_id": result.get("run_id"),
                "reason": None if result.get("triggered") else result.get("reason")}

    @router.post("/whatif/scenarios")
    async def create_scenario(request: Request):
        user = analyst(request)
        body = await request.json()
        name = str(body.get("name", "")).strip()[:200]
        if not name:
            raise HTTPException(status_code=400, detail="Give the scenario a name")
        description = str(body.get("description", "")).strip()[:1000]
        changes = _clean_changes(body.get("changes"))
        sid = str(uuid.uuid4())
        author = user.get("email") or user.get("username")
        audit(user, "identity_whatif_create", "identity_whatif_scenario",
              json.dumps({"scenario_id": sid, "name": name, "changes": changes}))
        execute_write(f"""
            INSERT INTO {fqn('identity_whatif_scenario')}
              (scenario_id, name, description, changes, scenario_hash, source, status, error, created_by, created_at, evaluated_at)
            VALUES (:sid, :name, :descr, :changes, NULL, 'analyst', 'pending', NULL, :by, current_timestamp(), NULL)
        """, {"sid": sid, "name": name, "descr": description, "changes": json.dumps(changes), "by": author})
        return {"scenario_id": sid, **_run(sid)}

    @router.post("/whatif/scenarios/{scenario_id}/evaluate")
    async def evaluate_scenario(scenario_id: str, request: Request):
        user = analyst(request)
        if not query(f"SELECT 1 FROM {fqn('identity_whatif_scenario')} WHERE scenario_id = :sid", {"sid": scenario_id}):
            raise HTTPException(status_code=404, detail="Scenario not found")
        audit(user, "identity_whatif_evaluate", "identity_whatif_scenario", json.dumps({"scenario_id": scenario_id}))
        execute_write(f"""UPDATE {fqn('identity_whatif_scenario')} SET status = 'pending', error = NULL
                          WHERE scenario_id = :sid""", {"sid": scenario_id})
        return {"scenario_id": scenario_id, **_run(scenario_id)}

    @router.delete("/whatif/scenarios/{scenario_id}")
    async def delete_scenario(scenario_id: str, request: Request):
        user = analyst(request)
        found = query(f"SELECT source FROM {fqn('identity_whatif_scenario')} WHERE scenario_id = :sid", {"sid": scenario_id})
        if not found:
            raise HTTPException(status_code=404, detail="Scenario not found")
        if found[0].get("source") == "sample":
            raise HTTPException(status_code=400, detail="Sample scenarios are part of the demo data and can't be deleted")
        audit(user, "identity_whatif_delete", "identity_whatif_scenario", json.dumps({"scenario_id": scenario_id}))
        execute_write(f"DELETE FROM {fqn('identity_whatif_result')} WHERE scenario_id = :sid", {"sid": scenario_id})
        execute_write(f"DELETE FROM {fqn('identity_whatif_scenario')} WHERE scenario_id = :sid", {"sid": scenario_id})
        return {"scenario_id": scenario_id, "deleted": True}
