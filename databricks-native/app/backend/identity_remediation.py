"""
Identity Datalake API, Phase 4: approved, reversible remediation. Proposals are written by the Identity 06
plan job; this API lets analysts request one, lets other analysts approve or reject it (the requester can never
approve), queues approved changes and rollbacks in the leased outbox, and triggers the executor. Every state
change is audited before it is recorded and only moves forward from the expected state.
"""

import json
import uuid
from typing import Callable

from fastapi import APIRouter, HTTPException, Request

from backend.identity import _page

REMEDIATION_JOB = "[0xDSI] Identity 03 - Remediation Executor"
STAGES = {
    "review": ("proposed", "blocked"),
    "approval": ("pending_approval",),
    "in_progress": ("queued", "rollback_queued"),
    "done": ("executed", "verified", "rolled_back", "no_longer_needed"),
    "closed": ("rejected", "dismissed", "superseded", "failed", "rollback_failed"),
}
JSON_COLS = ("change", "reasons", "impact", "before_state", "inverse", "provider_request")
LIST_COLS = ("action_id, action_type, title, severity, canonical_id, display_name, provider, impact, "
             "required_approvals, status, blocked_reason, requested_by, requested_at, executed_at, verified_at, "
             "rolled_back_at, updated_at, action_hash")
_NS = uuid.uuid5(uuid.NAMESPACE_URL, "0xdsi://identity/remediation")


def _parse(row: dict, cols=JSON_COLS) -> dict:
    for col in cols:
        if col in row:
            try:
                row[col] = json.loads(row.get(col) or "null")
            except ValueError:
                row[col] = None
    return row


def _who(user: dict) -> str:
    return (user.get("email") or user.get("username") or "").strip().lower()


def _text(body: dict, key: str, limit: int) -> str:
    return str(body.get(key) or "").strip()[:limit]


def add_remediation_routes(router: APIRouter, query: Callable, execute_write: Callable, fqn: Callable,
                           analyst: Callable, audit: Callable, trigger_job: Callable) -> None:
    A, AP, OB = fqn("identity_remediation_action"), fqn("identity_remediation_approval"), fqn("identity_remediation_outbox")

    def _load(aid: str) -> dict:
        rows = query(f"SELECT * FROM {A} WHERE action_id = :aid", {"aid": aid})
        if not rows:
            raise HTTPException(status_code=404, detail="Remediation action not found")
        return rows[0]

    def _approvals(aid: str) -> list:
        return query(f"""SELECT approval_id, approver, verdict, comment, action_hash, decided_at FROM {AP}
                         WHERE action_id = :aid ORDER BY decided_at""", {"aid": aid})

    def _approvers(action: dict, approvals: list) -> set:
        requester = (action.get("requested_by") or "").lower()
        return {a["approver"].lower() for a in approvals if a["verdict"] == "approve"
                and a["action_hash"] == action["action_hash"] and a["approver"].lower() != requester}

    def _move(aid: str, expected: str, target: str, stamp: str = "", **cols) -> None:
        """Forward-only transition: applies only if the action is still in the expected state."""
        sets = ", ".join([f"{c} = :{c}" for c in cols] + [f"{c} = current_timestamp()" for c in (stamp, "updated_at") if c]
                         + ["status = :target"])
        execute_write(f"UPDATE {A} SET {sets} WHERE action_id = :aid AND status = :expected",
                      {**cols, "target": target, "aid": aid, "expected": expected})
        if _load(aid)["status"] != target:
            raise HTTPException(status_code=409, detail="Someone else changed this action first; reload and try again")

    def _enqueue(aid: str, op: str) -> dict:
        oid = str(uuid.uuid5(_NS, f"{aid}/{op}"))
        execute_write(f"""
            INSERT INTO {OB} (outbox_id, action_id, operation, idempotency_key, status, attempts, lease_owner,
                              lease_token, lease_expires_at, execution_mode, request, response, error, created_at, updated_at)
            SELECT :oid, :aid, :op, :oid, 'queued', 0, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
                   current_timestamp(), current_timestamp()
            WHERE NOT EXISTS (SELECT 1 FROM {OB} WHERE outbox_id = :oid)
        """, {"oid": oid, "aid": aid, "op": op})
        result = trigger_job(REMEDIATION_JOB, {})
        return {"triggered": bool(result.get("triggered")), "run_id": result.get("run_id"),
                "reason": None if result.get("triggered") else result.get("reason")}

    @router.get("/remediation")
    async def list_actions(request: Request, stage: str = "review", limit: int = 100, offset: int = 0):
        analyst(request)
        if stage not in STAGES:
            raise HTTPException(status_code=400, detail=f"stage must be one of {', '.join(STAGES)}")
        limit, offset = _page(limit, offset)
        counts = {r["status"]: int(r["cnt"]) for r in query(f"SELECT status, COUNT(*) AS cnt FROM {A} GROUP BY status")}
        statuses = ", ".join(f"'{s}'" for s in STAGES[stage])
        rows = query(f"""SELECT {LIST_COLS} FROM {A} WHERE status IN ({statuses})
                         ORDER BY CASE severity WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, updated_at DESC, title
                         LIMIT {limit} OFFSET {offset}""")
        ids = [r["action_id"] for r in rows]
        votes = {}
        if ids:
            marks = ", ".join(f":a{i}" for i in range(len(ids)))
            for v in query(f"SELECT action_id, approver, verdict, action_hash FROM {AP} WHERE action_id IN ({marks})",
                           {f"a{i}": a for i, a in enumerate(ids)}):
                votes.setdefault(v["action_id"], []).append(v)
        for r in rows:
            impact = (_parse(r, ("impact",))["impact"] or {}).get("summary") or {}
            r["impact"] = impact
            r["approvals"] = len(_approvers(r, votes.get(r["action_id"], [])))
            r.pop("action_hash", None)
        return {"stage": stage, "actions": rows,
                "stages": {k: sum(counts.get(s, 0) for s in v) for k, v in STAGES.items()},
                "pending_points": sum(r["impact"].get("risk_points_removed", 0) for r in rows) if stage == "review" else None}

    @router.get("/remediation/{action_id}")
    async def action_detail(action_id: str, request: Request):
        user = analyst(request)
        me = _who(user)
        action = _parse(_load(action_id))
        approvals = _approvals(action_id)
        outbox = [_parse(r, ("request", "response")) for r in query(
            f"""SELECT outbox_id, operation, status, attempts, execution_mode, request, response, error, created_at,
                       updated_at FROM {OB} WHERE action_id = :aid ORDER BY created_at""", {"aid": action_id})]
        st = action["status"]
        decided = {a["approver"].lower() for a in approvals if a["action_hash"] == action["action_hash"]}
        action["approvals_count"] = len(_approvers(action, approvals))
        return {"action": action, "approvals": approvals, "outbox": outbox, "can": {
            "request": st == "proposed",
            "dismiss": st in ("proposed", "blocked"),
            "decide": st == "pending_approval" and me != (action.get("requested_by") or "").lower() and me not in decided,
            "rollback": st in ("executed", "verified"),
        }, "you": me}

    @router.post("/remediation/{action_id}/request")
    async def request_action(action_id: str, request: Request):
        user = analyst(request)
        body = await request.json()
        action = _load(action_id)
        if action["status"] != "proposed":
            raise HTTPException(status_code=409, detail=f"Only a proposed action can be requested; this one is {action['status']}")
        note = _text(body, "note", 1000)
        audit(user, "identity_remediation_request", "identity_remediation_action",
              json.dumps({"action_id": action_id, "action_hash": action["action_hash"], "note": note}))
        _move(action_id, "proposed", "pending_approval", stamp="requested_at", requested_by=_who(user), request_note=note)
        return {"action_id": action_id, "status": "pending_approval", "required_approvals": action["required_approvals"]}

    @router.post("/remediation/{action_id}/decide")
    async def decide_action(action_id: str, request: Request):
        user = analyst(request)
        me = _who(user)
        body = await request.json()
        verdict = body.get("verdict")
        if verdict not in ("approve", "reject"):
            raise HTTPException(status_code=400, detail="verdict must be approve or reject")
        comment = _text(body, "comment", 1000)
        if verdict == "reject" and not comment:
            raise HTTPException(status_code=400, detail="Say why you are rejecting it")
        action = _load(action_id)
        if action["status"] != "pending_approval":
            raise HTTPException(status_code=409, detail=f"This action is {action['status']}, not awaiting approval")
        if me == (action.get("requested_by") or "").lower():
            raise HTTPException(status_code=403, detail="Separation of duties: you cannot approve an action you requested")
        if any(a["approver"].lower() == me and a["action_hash"] == action["action_hash"] for a in _approvals(action_id)):
            raise HTTPException(status_code=409, detail="You have already decided on this action")
        audit(user, f"identity_remediation_{verdict}", "identity_remediation_approval",
              json.dumps({"action_id": action_id, "action_hash": action["action_hash"], "comment": comment}))
        execute_write(f"""INSERT INTO {AP} (approval_id, action_id, approver, verdict, comment, action_hash, decided_at)
                          VALUES (:id, :aid, :who, :verdict, :comment, :hash, current_timestamp())""",
                      {"id": str(uuid.uuid4()), "aid": action_id, "who": me, "verdict": verdict, "comment": comment,
                       "hash": action["action_hash"]})
        if verdict == "reject":
            _move(action_id, "pending_approval", "rejected", error=f"Rejected by {me}: {comment}")
            return {"action_id": action_id, "status": "rejected"}
        have, need = len(_approvers(action, _approvals(action_id))), action["required_approvals"] or 1
        if have < need:
            return {"action_id": action_id, "status": "pending_approval", "approvals": have, "required": need}
        _move(action_id, "pending_approval", "queued")
        return {"action_id": action_id, "status": "queued", "approvals": have, "required": need,
                **_enqueue(action_id, "execute")}

    @router.post("/remediation/{action_id}/rollback")
    async def rollback_action(action_id: str, request: Request):
        user = analyst(request)
        body = await request.json()
        reason = _text(body, "reason", 1000)
        if not reason:
            raise HTTPException(status_code=400, detail="Say why this change is being rolled back")
        action = _load(action_id)
        if action["status"] not in ("executed", "verified") or not action.get("inverse"):
            raise HTTPException(status_code=409, detail="Only an executed change can be rolled back")
        audit(user, "identity_remediation_rollback", "identity_remediation_action",
              json.dumps({"action_id": action_id, "reason": reason, "inverse": action["inverse"]}))
        _move(action_id, action["status"], "rollback_queued", rollback_requested_by=_who(user), rollback_reason=reason)
        return {"action_id": action_id, "status": "rollback_queued", **_enqueue(action_id, "rollback")}

    @router.post("/remediation/{action_id}/dismiss")
    async def dismiss_action(action_id: str, request: Request):
        user = analyst(request)
        body = await request.json()
        reason = _text(body, "reason", 1000)
        if not reason:
            raise HTTPException(status_code=400, detail="Say why this proposal is not needed")
        action = _load(action_id)
        if action["status"] not in ("proposed", "blocked"):
            raise HTTPException(status_code=409, detail="Only a proposal can be dismissed")
        audit(user, "identity_remediation_dismiss", "identity_remediation_action",
              json.dumps({"action_id": action_id, "reason": reason}))
        _move(action_id, action["status"], "dismissed", requested_by=_who(user), request_note=reason)
        return {"action_id": action_id, "status": "dismissed"}
