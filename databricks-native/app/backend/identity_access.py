"""
Identity Datalake API, Phase 2: explainable risk, crown-jewel attack paths and
group context. Read-only; every route requires the analyst role. Data is written
only by the Identity 01 job's `score_access_risk` task.
"""

import json
from typing import Callable

from fastapi import APIRouter, HTTPException, Request

from backend.identity import FINDING_STATUSES, PRINCIPAL_TYPES, _lists, _page

BANDS = {"critical", "high", "medium", "low"}


def _json(rows: list, *cols: str) -> list:
    for row in rows:
        for col in cols:
            try:
                row[col] = json.loads(row.get(col) or "[]")
            except ValueError:
                row[col] = []
    return rows


def add_access_routes(router: APIRouter, query: Callable, fqn: Callable, analyst: Callable) -> None:

    @router.get("/risk")
    async def list_risk(request: Request, band: str = "", principal_type: str = "", search: str = "",
                        limit: int = 100, offset: int = 0):
        analyst(request)
        limit, offset = _page(limit, offset)
        where, params = ["1=1"], {}
        if band:
            if band not in BANDS:
                raise HTTPException(status_code=400, detail="Unknown band")
            where.append("band = :band")
            params["band"] = band
        if principal_type:
            if principal_type not in PRINCIPAL_TYPES:
                raise HTTPException(status_code=400, detail="Unknown principal_type")
            where.append("principal_type = :ptype")
            params["ptype"] = principal_type
        if search.strip():
            where.append("lower(display_name) LIKE :q")
            params["q"] = f"%{search.strip().lower()[:100]}%"
        clause = " AND ".join(where)
        rows = _json(query(f"""
            SELECT canonical_id, display_name, principal_type, score, band, exposure, behaviour, hygiene,
                   previous_score, delta, factors, weights_version, scored_at
            FROM {fqn('identity_risk_score')} WHERE {clause}
            ORDER BY score DESC, display_name LIMIT {limit} OFFSET {offset}
        """, params), "factors")
        total = query(f"SELECT COUNT(*) AS cnt FROM {fqn('identity_risk_score')} WHERE {clause}", params)
        bands = query(f"SELECT band, COUNT(*) AS cnt FROM {fqn('identity_risk_score')} GROUP BY band")
        meta = query(f"""SELECT MAX(scored_at) AS scored_at, MAX(weights_version) AS weights_version,
                                MAX(access_version) AS access_version FROM {fqn('identity_risk_score')}""")
        return {"scores": rows, "total": total[0]["cnt"] if total else 0,
                "bands": {b["band"]: b["cnt"] for b in bands}, "meta": meta[0] if meta else None}

    @router.get("/risk/{canonical_id}")
    async def risk_detail(canonical_id: str, request: Request):
        analyst(request)
        p = {"cid": canonical_id}
        score = _json(query(f"SELECT * FROM {fqn('identity_risk_score')} WHERE canonical_id = :cid", p), "factors")
        if not score:
            raise HTTPException(status_code=404, detail="No risk score for this identity")
        history = query(f"""
            SELECT score, band, weights_version, scored_at FROM {fqn('identity_risk_history')}
            WHERE canonical_id = :cid ORDER BY scored_at DESC LIMIT 30
        """, p)
        paths = _json(query(f"""
            SELECT p.path_id, p.resource_id, r.name AS resource_name, p.hops, p.via_takeover, p.permission, p.steps
            FROM {fqn('identity_attack_path')} p LEFT JOIN {fqn('identity_resource')} r ON r.resource_id = p.resource_id
            WHERE p.canonical_id = :cid AND p.status = 'open' ORDER BY p.via_takeover DESC, p.hops
        """, p), "steps")
        return {"score": score[0], "history": list(reversed(history)), "paths": paths}

    @router.get("/graph/resources")
    async def graph_resources(request: Request):
        analyst(request)
        rows = query(f"""
            SELECT r.resource_id, r.name, r.crown_jewel, r.tier, r.owner, r.description,
                   COUNT(DISTINCT p.canonical_id) AS identities,
                   COUNT(DISTINCT CASE WHEN p.via_takeover THEN p.canonical_id END) AS via_takeover,
                   MIN(p.hops) AS min_hops
            FROM {fqn('identity_resource')} r
            LEFT JOIN {fqn('identity_attack_path')} p ON p.resource_id = r.resource_id AND p.status = 'open'
            GROUP BY r.resource_id, r.name, r.crown_jewel, r.tier, r.owner, r.description
            ORDER BY r.crown_jewel DESC, identities DESC, r.name
        """)
        meta = query(f"""SELECT COUNT(*) AS edges, MAX(access_version) AS access_version, MAX(updated_at) AS updated_at
                         FROM {fqn('identity_access_edge')}""")
        return {"resources": rows, "meta": meta[0] if meta else None}

    @router.get("/graph/paths")
    async def graph_paths(request: Request, resource_id: str = "", canonical_id: str = "",
                          takeover_only: bool = False, status: str = "open", limit: int = 200, offset: int = 0):
        analyst(request)
        limit, offset = _page(limit, offset)
        if status not in FINDING_STATUSES:
            raise HTTPException(status_code=400, detail="Unknown status")
        where, params = ["p.status = :status"], {"status": status}
        if resource_id:
            where.append("p.resource_id = :rid")
            params["rid"] = resource_id[:128]
        if canonical_id:
            where.append("p.canonical_id = :cid")
            params["cid"] = canonical_id[:64]
        if takeover_only:
            where.append("p.via_takeover = true")
        rows = _json(query(f"""
            SELECT p.path_id, p.canonical_id, c.display_name, c.principal_type, p.resource_id, r.name AS resource_name,
                   p.hops, p.via_takeover, p.permission, p.steps, p.first_seen, p.last_seen,
                   s.score, s.band
            FROM {fqn('identity_attack_path')} p
            LEFT JOIN {fqn('identity_canonical')} c ON c.canonical_id = p.canonical_id
            LEFT JOIN {fqn('identity_resource')} r ON r.resource_id = p.resource_id
            LEFT JOIN {fqn('identity_risk_score')} s ON s.canonical_id = p.canonical_id
            WHERE {' AND '.join(where)}
            ORDER BY p.via_takeover DESC, p.hops, c.display_name LIMIT {limit} OFFSET {offset}
        """, params), "steps")
        return {"paths": rows}

    @router.get("/groups")
    async def list_groups(request: Request, search: str = "", findings_only: bool = False,
                          privileged_only: bool = False, limit: int = 200, offset: int = 0):
        analyst(request)
        limit, offset = _page(limit, offset)
        where, params = ["1=1"], {}
        if search.strip():
            where.append("(lower(g.name) LIKE :q OR lower(g.owner) LIKE :q OR lower(g.purpose) LIKE :q)")
            params["q"] = f"%{search.strip().lower()[:100]}%"
        if privileged_only:
            where.append("g.privileged = true")
        having = "HAVING COUNT(f.finding_id) > 0" if findings_only else ""
        rows = _lists(query(f"""
            SELECT g.group_key, g.provider, g.name, g.owner, g.owner_status, g.purpose, g.department, g.privileged,
                   g.direct_member_count, g.effective_member_count, g.nesting_depth, g.parent_groups, g.child_groups,
                   g.can_take_over,
                   COUNT(f.finding_id) AS open_findings,
                   MIN(CASE f.severity WHEN 'high' THEN 0 WHEN 'medium' THEN 1 WHEN 'low' THEN 2 END) AS worst
            FROM {fqn('identity_group')} g
            LEFT JOIN {fqn('identity_group_finding')} f ON f.group_key = g.group_key AND f.status = 'open'
            WHERE {' AND '.join(where)}
            GROUP BY g.group_key, g.provider, g.name, g.owner, g.owner_status, g.purpose, g.department, g.privileged,
                     g.direct_member_count, g.effective_member_count, g.nesting_depth, g.parent_groups,
                     g.child_groups, g.can_take_over
            {having}
            ORDER BY worst NULLS LAST, g.privileged DESC, g.name LIMIT {limit} OFFSET {offset}
        """, params), ("parent_groups", "child_groups", "can_take_over"))
        sev = {0: "high", 1: "medium", 2: "low"}
        for r in rows:
            r["worst_severity"] = sev.get(r.pop("worst", None))
        return {"groups": rows}

    @router.get("/groups/{group_key}")
    async def group_detail(group_key: str, request: Request):
        analyst(request)
        p = {"gk": group_key}
        group = _json(_lists(query(f"SELECT * FROM {fqn('identity_group')} WHERE group_key = :gk", p),
                             ("parent_groups", "child_groups", "can_take_over")), "grants")
        if not group:
            raise HTTPException(status_code=404, detail="Group not found")
        members = _lists(query(f"""
            SELECT account_key, canonical_id, display_name, username, principal_type, persona_type,
                   normalized_state, department, direct, via
            FROM {fqn('identity_group_member')} WHERE group_key = :gk ORDER BY direct DESC, display_name
        """, p), ("via",))
        findings = _lists(query(f"""
            SELECT finding_id, finding_type, severity, detail, evidence, status, first_seen, last_seen
            FROM {fqn('identity_group_finding')} WHERE group_key = :gk
            ORDER BY CASE status WHEN 'open' THEN 0 ELSE 1 END,
                     CASE severity WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END
        """, p), ("evidence",))
        return {"group": group[0], "members": members, "findings": findings}
