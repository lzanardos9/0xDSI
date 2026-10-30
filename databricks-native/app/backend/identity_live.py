"""
Identity Datalake API: the latest identity activity for the live feed on the Access Graph and Overview.
Read-only; requires the analyst role. Events are written by the Identity 01 job's timeline task.
"""

import json
from typing import Callable

from fastapi import APIRouter, Request

LIVE_LIMIT = 25
POLL_MS = 15000


def add_live_routes(router: APIRouter, query: Callable, fqn: Callable, analyst: Callable) -> None:

    @router.get("/live")
    async def live(request: Request):
        analyst(request)
        rows = query(f"""
            SELECT e.event_id, e.occurred_at, e.event_type, e.category, e.provider, e.canonical_id,
                   c.display_name, c.principal_type, e.account_key, x.username, e.actor, e.detail
            FROM {fqn('identity_event')} e
            LEFT JOIN {fqn('identity_canonical')} c ON c.canonical_id = e.canonical_id
            LEFT JOIN {fqn('identity_provider_xref')} x ON x.account_key = e.account_key
            ORDER BY e.occurred_at DESC, e.event_id LIMIT {LIVE_LIMIT}
        """)
        for r in rows:
            try:
                detail = json.loads(r.get("detail") or "{}")
            except ValueError:
                detail = {}
            r["detail"] = detail if isinstance(detail, dict) else {}
        recent = query(f"""
            SELECT COUNT(*) AS cnt FROM {fqn('identity_event')}
            WHERE occurred_at >= (SELECT MAX(occurred_at) FROM {fqn('identity_event')}) - INTERVAL 24 HOURS
        """)
        as_of = query(f"SELECT MAX(ingested_at) AS t FROM {fqn('identity_event')}")
        return {"events": rows, "events_24h": recent[0]["cnt"] if recent else 0,
                "as_of": as_of[0]["t"] if as_of else None, "mode": "live", "poll_ms": POLL_MS}
