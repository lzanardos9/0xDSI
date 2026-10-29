"""
Identity Datalake API (Phase 0): read-only identity views plus steward
match decisions. Every route requires analyst role (identity data is
sensitive) and the steward write is audited before it is recorded. The
resolver applies steward decisions on its next run; this API never edits the
canonical tables directly.
"""

import json
import uuid
from typing import Callable

from fastapi import APIRouter, HTTPException, Request

IDENTITY_TABLES = (
    "identity_canonical", "identity_persona", "identity_provider_xref", "identity_xref_history",
    "identity_resolution_decision", "identity_steward_decision", "identity_resolution_impact",
    "identity_findings", "identity_relation", "identity_source_health",
)
PRINCIPAL_TYPES = {"person", "workload", "agent"}
VERDICTS = {"accept", "reject"}
MAX_PAGE = 200


def _page(limit: int, offset: int) -> tuple:
    if limit < 1 or limit > MAX_PAGE or offset < 0:
        raise HTTPException(status_code=400, detail=f"limit must be 1..{MAX_PAGE} and offset >= 0")
    return int(limit), int(offset)


ARRAY_COLUMNS = ("providers", "personas", "normalized_states")


def _lists(rows: list) -> list:
    for row in rows:
        for col in ARRAY_COLUMNS:
            v = row.get(col)
            if v is None:
                row[col] = []
            elif isinstance(v, str):
                row[col] = json.loads(v) if v.startswith("[") else [v]
            elif not isinstance(v, list):
                row[col] = list(v.tolist() if hasattr(v, "tolist") else v)
    return rows


def build_identity_router(
    query: Callable, execute_write: Callable, fqn: Callable,
    get_user: Callable, require_analyst: Callable, audit: Callable, trigger_job: Callable,
) -> APIRouter:
    router = APIRouter(prefix="/api/identity")

    def _analyst(request: Request) -> dict:
        user = get_user(request)
        require_analyst(user)
        return user

    @router.get("/overview")
    async def overview(request: Request):
        _analyst(request)
        by_type = query(f"""
            SELECT principal_type, COUNT(*) AS identities, SUM(account_count) AS accounts,
                   SUM(CASE WHEN state_conflict THEN 1 ELSE 0 END) AS state_conflicts
            FROM {fqn('identity_canonical')} GROUP BY principal_type
        """)
        findings = query(f"""
            SELECT finding_type, COUNT(*) AS cnt FROM {fqn('identity_findings')}
            WHERE status = 'open' GROUP BY finding_type
        """)
        reviews = query(f"""
            SELECT COUNT(*) AS cnt FROM {fqn('identity_resolution_decision')} d
            WHERE d.verdict = 'REVIEW_REQUIRED' AND NOT EXISTS (
              SELECT 1 FROM {fqn('identity_steward_decision')} s
              WHERE s.left_key = d.left_key AND s.right_key = d.right_key)
        """)
        sources = query(f"""
            SELECT provider, tenant, snapshot_at, snapshot_complete, records_received, records_accepted,
                   records_quarantined, tombstoned, stale, status, error_category, last_run_at, last_success_at
            FROM {fqn('identity_source_health')} ORDER BY provider
        """)
        version = query(f"""
            SELECT resolution_version, resolver_version, MAX(updated_at) AS resolved_at
            FROM {fqn('identity_canonical')} GROUP BY resolution_version, resolver_version
            ORDER BY resolved_at DESC LIMIT 1
        """)
        return {
            "by_type": by_type, "findings": findings,
            "open_reviews": reviews[0]["cnt"] if reviews else 0,
            "sources": sources, "resolution": version[0] if version else None,
        }

    @router.get("/identities")
    async def list_identities(request: Request, search: str = "", principal_type: str = "",
                              conflicts_only: bool = False, limit: int = 50, offset: int = 0):
        _analyst(request)
        limit, offset = _page(limit, offset)
        where, params = ["1=1"], {}
        if principal_type:
            if principal_type not in PRINCIPAL_TYPES:
                raise HTTPException(status_code=400, detail="Unknown principal_type")
            where.append("c.principal_type = :ptype")
            params["ptype"] = principal_type
        if conflicts_only:
            where.append("c.state_conflict = true")
        if search.strip():
            where.append(f"""(lower(c.display_name) LIKE :q OR EXISTS (
                SELECT 1 FROM {fqn('identity_provider_xref')} x WHERE x.canonical_id = c.canonical_id AND (
                  lower(x.username) LIKE :q OR lower(x.upn) LIKE :q OR lower(x.email) LIKE :q
                  OR lower(x.employee_id) LIKE :q OR lower(x.provider_object_id) LIKE :q)))""")
            params["q"] = f"%{search.strip().lower()[:100]}%"
        clause = " AND ".join(where)
        total = query(f"SELECT COUNT(*) AS cnt FROM {fqn('identity_canonical')} c WHERE {clause}", params)
        rows = query(f"""
            SELECT c.canonical_id, c.principal_type, c.display_name, c.account_count, c.providers, c.personas,
                   c.normalized_states, c.state_conflict, c.updated_at
            FROM {fqn('identity_canonical')} c WHERE {clause}
            ORDER BY c.state_conflict DESC, c.account_count DESC, c.display_name
            LIMIT {limit} OFFSET {offset}
        """, params)
        return {"identities": _lists(rows), "total": total[0]["cnt"] if total else 0}

    @router.get("/identities/{canonical_id}")
    async def identity_detail(canonical_id: str, request: Request):
        _analyst(request)
        p = {"cid": canonical_id}
        ident = _lists(query(f"SELECT * FROM {fqn('identity_canonical')} WHERE canonical_id = :cid", p))
        if not ident:
            raise HTTPException(status_code=404, detail="Identity not found")
        accounts = query(f"""
            SELECT account_key, persona_id, persona_type, provider, tenant, provider_object_id, username, upn,
                   email, display_name, employee_id, provider_state, normalized_state, state_mapping_version,
                   owner, grc_application_id, runtime_host, registration_source, credential_fingerprint,
                   credential_expires_at, last_seen, source_status, valid_from
            FROM {fqn('identity_provider_xref')} WHERE canonical_id = :cid ORDER BY persona_type, provider
        """, p)
        personas = query(f"SELECT persona_id, persona_type, account_count FROM {fqn('identity_persona')} WHERE canonical_id = :cid", p)
        findings = query(f"""
            SELECT finding_id, finding_type, account_key, detail, status, first_seen, last_seen
            FROM {fqn('identity_findings')} WHERE canonical_id = :cid ORDER BY status, last_seen DESC
        """, p)
        relations = query(f"""
            SELECT relation_type, target_id, provenance, verification FROM {fqn('identity_relation')}
            WHERE source_id = :cid
        """, p)
        decisions = query(f"""
            SELECT d.decision_id, d.left_key, d.right_key, d.rule, d.verdict, d.confidence, d.features, d.decided_at
            FROM {fqn('identity_resolution_decision')} d
            WHERE d.left_key IN (SELECT account_key FROM {fqn('identity_provider_xref')} WHERE canonical_id = :cid)
               OR d.right_key IN (SELECT account_key FROM {fqn('identity_provider_xref')} WHERE canonical_id = :cid)
            ORDER BY d.decided_at DESC LIMIT 100
        """, p)
        history = query(f"""
            SELECT h.account_key, h.canonical_id, h.resolution_version, h.recorded_at
            FROM {fqn('identity_xref_history')} h
            WHERE h.account_key IN (SELECT account_key FROM {fqn('identity_provider_xref')} WHERE canonical_id = :cid)
            ORDER BY h.recorded_at DESC LIMIT 100
        """, p)
        return {"identity": ident[0], "accounts": accounts, "personas": personas, "findings": findings,
                "relations": relations, "decisions": decisions, "history": history}

    @router.get("/reviews")
    async def list_reviews(request: Request, limit: int = 50, offset: int = 0):
        _analyst(request)
        limit, offset = _page(limit, offset)
        rows = query(f"""
            SELECT d.decision_id, d.left_key, d.right_key, d.rule, d.confidence, d.features, d.decided_at,
                   l.display_name AS left_name, l.provider AS left_provider, l.tenant AS left_tenant,
                   l.email AS left_email, l.persona_type AS left_persona, l.normalized_state AS left_state,
                   r.display_name AS right_name, r.provider AS right_provider, r.tenant AS right_tenant,
                   r.email AS right_email, r.persona_type AS right_persona, r.normalized_state AS right_state
            FROM {fqn('identity_resolution_decision')} d
            JOIN {fqn('identity_provider_xref')} l ON l.account_key = d.left_key
            JOIN {fqn('identity_provider_xref')} r ON r.account_key = d.right_key
            WHERE d.verdict = 'REVIEW_REQUIRED' AND l.canonical_id <> r.canonical_id AND NOT EXISTS (
              SELECT 1 FROM {fqn('identity_steward_decision')} s
              WHERE s.left_key = d.left_key AND s.right_key = d.right_key)
            ORDER BY d.confidence DESC, d.decided_at DESC
            LIMIT {limit} OFFSET {offset}
        """)
        recent = query(f"""
            SELECT steward_decision_id, left_key, right_key, verdict, reviewer, note, decided_at
            FROM {fqn('identity_steward_decision')} ORDER BY decided_at DESC LIMIT 20
        """)
        return {"reviews": rows, "recent_decisions": recent}

    @router.post("/reviews/{decision_id}")
    async def decide_review(decision_id: str, request: Request):
        user = _analyst(request)
        body = await request.json()
        verdict = str(body.get("verdict", "")).strip().lower()
        note = str(body.get("note", "")).strip()[:1000]
        if verdict not in VERDICTS:
            raise HTTPException(status_code=400, detail="verdict must be 'accept' or 'reject'")
        if verdict == "accept" and not note:
            raise HTTPException(status_code=400, detail="A note explaining the evidence is required to accept a match")
        found = query(f"""
            SELECT left_key, right_key FROM {fqn('identity_resolution_decision')}
            WHERE decision_id = :id AND verdict = 'REVIEW_REQUIRED'
        """, {"id": decision_id})
        if not found:
            raise HTTPException(status_code=404, detail="Review item not found")
        pair = found[0]
        if query(f"""SELECT 1 FROM {fqn('identity_steward_decision')}
                     WHERE left_key = :l AND right_key = :r LIMIT 1""", {"l": pair["left_key"], "r": pair["right_key"]}):
            raise HTTPException(status_code=409, detail="This match has already been decided")
        reviewer = user.get("email") or user.get("username")
        audit(user, f"identity_steward_{verdict}", "identity_steward_decision",
              json.dumps({"decision_id": decision_id, **pair}))
        sid = str(uuid.uuid4())
        execute_write(f"""
            INSERT INTO {fqn('identity_steward_decision')}
              (steward_decision_id, review_of_decision_id, left_key, right_key, verdict, reviewer, note, decided_at)
            VALUES (:sid, :did, :l, :r, :v, :reviewer, :note, current_timestamp())
        """, {"sid": sid, "did": decision_id, "l": pair["left_key"], "r": pair["right_key"],
              "v": verdict, "reviewer": reviewer, "note": note})
        return {"steward_decision_id": sid, "verdict": verdict, "applies": "on the next resolver run"}

    @router.get("/nhi")
    async def list_nhi(request: Request, limit: int = 100, offset: int = 0):
        _analyst(request)
        limit, offset = _page(limit, offset)
        rows = query(f"""
            SELECT x.account_key, x.canonical_id, x.principal_type, x.provider, x.tenant, x.username, x.display_name,
                   x.normalized_state, x.owner, x.grc_application_id, x.runtime_host, x.registration_source,
                   x.credential_fingerprint, x.credential_expires_at, x.last_seen, x.source_status,
                   CASE WHEN x.credential_expires_at IS NOT NULL AND x.credential_expires_at <> ''
                             AND try_cast(x.credential_expires_at AS TIMESTAMP) < current_timestamp()
                        THEN true ELSE false END AS credential_expired
            FROM {fqn('identity_provider_xref')} x
            WHERE x.principal_type IN ('workload', 'agent')
            ORDER BY (x.grc_application_id IS NULL OR x.grc_application_id = '') DESC, x.display_name
            LIMIT {limit} OFFSET {offset}
        """)
        return {"nhis": rows}

    @router.post("/run-resolver")
    async def run_resolver(request: Request):
        user = _analyst(request)
        audit(user, "identity_run_resolver", "identity_canonical", "")
        result = trigger_job("[0xDSI] Identity 01 - Canonical Identity Spine", {})
        if not result.get("triggered"):
            raise HTTPException(status_code=503, detail=result.get("reason", "Resolver job could not be started"))
        return result

    return router
