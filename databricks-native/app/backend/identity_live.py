"""
Identity Datalake API: the latest identity activity for the live feed on the Access Graph and Overview, an
activity histogram for time-window selection, and a per-event drill-down whose raw record is sealed for chain of
custody (SHA-256 digest + HMAC-SHA256 signature) and can be re-verified against the stored row.
Requires the analyst role. Events are written by the Identity 01 job's timeline task.
"""

import json
from datetime import datetime, timezone
from typing import Callable

from fastapi import APIRouter, HTTPException, Request

from backend import identity_custody as custody

LIVE_LIMIT = 25
RANGE_LIMIT = 300
POLL_MS = 15000
BUCKETS = 24
WINDOWS = {"10m": 600, "1h": 3600, "24h": 86400}

RISKY_SQL = """(
    e.event_type IN ('mfa_denied', 'mfa_lockout', 'mfa_reset', 'hr_leaver')
    OR (e.event_type = 'sign_in_failure' AND get_json_object(e.detail, '$.country') NOT IN ('', 'US'))
    OR (e.event_type IN ('entitlement_granted', 'privilege_granted') AND coalesce(get_json_object(e.detail, '$.ticket'), '') = '')
    OR (e.event_type = 'password_reset' AND coalesce(get_json_object(e.detail, '$.path_id'), '') <> '')
    OR (e.event_type = 'resource_access' AND get_json_object(e.detail, '$.operation') = 'export')
)"""


def _epoch(value: str, name: str) -> int:
    try:
        dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        raise HTTPException(status_code=400, detail=f"'{name}' must be an ISO timestamp")
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return int(dt.timestamp())


def _iso(epoch: int) -> str:
    return datetime.fromtimestamp(epoch, tz=timezone.utc).isoformat().replace("+00:00", "Z")


def _parse_detail(rows: list) -> list:
    for r in rows:
        try:
            detail = json.loads(r.get("detail") or "{}")
        except (TypeError, ValueError):
            detail = {}
        r["detail"] = detail if isinstance(detail, dict) else {}
    return rows


def add_live_routes(router: APIRouter, query: Callable, fqn: Callable, analyst: Callable, audit: Callable) -> None:
    evt = fqn('identity_event')
    select = f"""
        SELECT e.event_id, e.occurred_at, e.event_type, e.category, e.provider, e.canonical_id,
               c.display_name, c.principal_type, e.account_key, x.username, e.actor, e.detail
        FROM {evt} e
        LEFT JOIN {fqn('identity_canonical')} c ON c.canonical_id = e.canonical_id
        LEFT JOIN {fqn('identity_provider_xref')} x ON x.account_key = e.account_key
    """

    @router.get("/live")
    async def live(request: Request, since: str = "", until: str = ""):
        analyst(request)
        if since or until:
            lo = _epoch(since, "since") if since else 0
            hi = _epoch(until, "until") if until else 4102444800
            if hi <= lo:
                raise HTTPException(status_code=400, detail="'until' must be after 'since'")
            rows = query(f"""{select}
                WHERE unix_timestamp(e.occurred_at) > {lo} AND unix_timestamp(e.occurred_at) <= {hi}
                ORDER BY e.occurred_at DESC, e.event_id LIMIT {RANGE_LIMIT + 1}""")
            truncated = len(rows) > RANGE_LIMIT
            rows = rows[:RANGE_LIMIT]
        else:
            rows = query(f"{select} ORDER BY e.occurred_at DESC, e.event_id LIMIT {LIVE_LIMIT}")
            truncated = False
        recent = query(f"""
            SELECT COUNT(*) AS cnt FROM {evt}
            WHERE occurred_at >= (SELECT MAX(occurred_at) FROM {evt}) - INTERVAL 24 HOURS
        """)
        as_of = query(f"SELECT MAX(ingested_at) AS t FROM {evt}")
        return {"events": _parse_detail(rows), "events_24h": recent[0]["cnt"] if recent else 0,
                "as_of": as_of[0]["t"] if as_of else None, "mode": "live", "poll_ms": POLL_MS, "truncated": truncated}

    @router.get("/live/histogram")
    async def histogram(request: Request, window: str = "10m"):
        analyst(request)
        span = WINDOWS.get(window)
        if not span:
            raise HTTPException(status_code=400, detail=f"window must be one of {', '.join(WINDOWS)}")
        size = span // BUCKETS
        anchor = query(f"SELECT unix_timestamp(MAX(occurred_at)) AS t FROM {evt}")
        top = int(anchor[0]["t"]) if anchor and anchor[0].get("t") is not None else int(datetime.now(timezone.utc).timestamp())
        counts = {int(r["b"]): r for r in query(f"""
            SELECT CAST(FLOOR(({top} - unix_timestamp(e.occurred_at)) / {size}) AS INT) AS b,
                   COUNT(*) AS total, SUM(CASE WHEN {RISKY_SQL} THEN 1 ELSE 0 END) AS risky
            FROM {evt} e
            WHERE unix_timestamp(e.occurred_at) > {top - span} AND unix_timestamp(e.occurred_at) <= {top}
            GROUP BY 1
        """)}
        buckets = []
        for i in range(BUCKETS):
            b = BUCKETS - 1 - i
            row = counts.get(b, {})
            buckets.append({"start": _iso(top - (b + 1) * size), "end": _iso(top - b * size),
                            "total": int(row.get("total") or 0), "risky": int(row.get("risky") or 0)})
        return {"window": window, "since": _iso(top - span), "until": _iso(top), "buckets": buckets}

    def _raw(event_id: str) -> dict:
        rows = query(f"SELECT * FROM {evt} WHERE event_id = :id LIMIT 1", {"id": event_id})
        if not rows:
            raise HTTPException(status_code=404, detail="Event not found")
        return custody.normalize(rows[0])

    @router.get("/live/events/{event_id}")
    async def event_detail(event_id: str, request: Request):
        user = analyst(request)
        raw = _raw(event_id)
        event = _parse_detail(query(f"{select} WHERE e.event_id = :id LIMIT 1", {"id": event_id}))
        if not event:
            raise HTTPException(status_code=404, detail="Event not found")
        related = []
        if raw.get("canonical_id"):
            related = _parse_detail(query(f"""{select} WHERE e.canonical_id = :cid AND e.event_id <> :id
                ORDER BY e.occurred_at DESC LIMIT 8""", {"cid": raw["canonical_id"], "id": event_id}))
        key = custody.load_key()
        seal = custody.seal(raw, key)
        viewer = user.get("email") or user.get("username") or "analyst"
        audit(user, "identity_event_view", "identity_event", json.dumps({"event_id": event_id, "digest": seal["digest"]}))
        trail = [
            {"step": "received", "at": raw.get("occurred_at"), "by": raw.get("provider"),
             "detail": f"Source event {raw.get('source_event_id') or 'without id'}" + (f" from tenant {raw['tenant']}" if raw.get("tenant") else "")},
            {"step": "ingested", "at": raw.get("ingested_at"), "by": "Identity 01 job", "detail": "Landed in the identity_event Delta table"},
            {"step": "linked", "at": raw.get("ingested_at"), "by": "Identity resolver",
             "detail": f"Link status {raw.get('link_status')}" + (f", timeline {raw['timeline_version']}" if raw.get("timeline_version") else "")},
            {"step": "sealed", "at": seal["signed_at"], "by": seal["key_id"] or "unsigned",
             "detail": "Digest and signature computed from the stored row" if key else f"Digest only. Set {custody.KEY_ENV} to sign"},
            {"step": "accessed", "at": seal["signed_at"], "by": viewer, "detail": "View recorded in the audit log"},
        ]
        return {"event": event[0], "raw": raw, "custody": {**seal, "signer": "Databricks app" if key else None, "trail": trail},
                "related": related}

    @router.post("/live/events/{event_id}/verify")
    async def verify(event_id: str, request: Request):
        user = analyst(request)
        body = await request.json()
        given_digest = str(body.get("digest") or "")
        signed_at = str(body.get("signed_at") or "")
        signature = str(body.get("signature") or "")
        stored = custody.digest(_raw(event_id))
        key = custody.load_key()
        signature_valid = bool(key and signature and signed_at) and custody.verify(key, event_id, given_digest, signed_at, signature)
        result = {"record_matches": stored == given_digest, "signature_valid": signature_valid if key else None,
                  "stored_digest": stored, "checked_at": _iso(int(datetime.now(timezone.utc).timestamp())), "checked_by": "Databricks app"}
        audit(user, "identity_event_verify", "identity_event", json.dumps({"event_id": event_id, **result}))
        return result
