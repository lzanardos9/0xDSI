"""
Identity Datalake API, Phase 3: federation posture. Read-only; every route requires the
analyst role. Data is written only by the Identity 01 job's `federation_posture` task.
"""

import json
from typing import Callable

from fastapi import APIRouter, HTTPException, Request

from backend.identity import FINDING_STATUSES

SEVERITIES = {"high", "medium", "low"}
SCOPES = {"trust", "guest"}


def _parse(rows: list, cols: dict) -> list:
    for row in rows:
        for col, empty in cols.items():
            try:
                row[col] = json.loads(row.get(col) or "null") or empty
            except ValueError:
                row[col] = empty
    return rows


def add_federation_routes(router: APIRouter, query: Callable, fqn: Callable, analyst: Callable) -> None:

    def _trusts(where="1=1", params=None):
        return _parse(query(f"""
            SELECT trust_id, kind, provider, tenant, partner_name, partner_tenant, partner_domains, owner, owner_status,
                   description, settings, rules_total, rules_passed, worst_severity, guests, active_guests, updated_at
            FROM {fqn('identity_federation_trust')} WHERE {where}
            ORDER BY CASE worst_severity WHEN 'high' THEN 0 WHEN 'medium' THEN 1 WHEN 'low' THEN 2 ELSE 3 END, partner_name
        """, params or {}), {"partner_domains": [], "settings": {}})

    def _guests(where="1=1", params=None):
        return _parse(query(f"""
            SELECT account_key, canonical_id, display_name, username, email, home_tenant, trust_id, partner_name,
                   sponsor, sponsor_status, normalized_state, last_seen, days_inactive, groups, privileged_groups
            FROM {fqn('identity_federation_guest')} WHERE {where} ORDER BY display_name LIMIT 1000
        """, params or {}), {"groups": [], "privileged_groups": []})

    @router.get("/federation")
    async def federation_overview(request: Request):
        analyst(request)
        trusts = _trusts()
        counts = query(f"""SELECT severity, COUNT(*) AS cnt FROM {fqn('identity_federation_finding')}
                           WHERE status = 'open' GROUP BY severity""")
        open_by = query(f"""SELECT trust_id, COUNT(*) AS cnt FROM {fqn('identity_federation_finding')}
                            WHERE status = 'open' AND trust_id IS NOT NULL GROUP BY trust_id""")
        per_trust = {r["trust_id"]: r["cnt"] for r in open_by}
        for t in trusts:
            t["open_findings"] = per_trust.get(t["trust_id"], 0)
        guests = _guests()
        drift = query(f"""SELECT change_id, trust_id, setting, before_value, after_value, changed_at, changed_by
                          FROM {fqn('identity_federation_change')} ORDER BY changed_at DESC LIMIT 20""")
        rules_total = sum(t["rules_total"] or 0 for t in trusts)
        rules_passed = sum(t["rules_passed"] or 0 for t in trusts)
        return {"trusts": trusts, "guests": guests, "recent_changes": drift,
                "summary": {"trusts": len(trusts), "guests": len(guests),
                            "active_guests": sum(1 for g in guests if g["normalized_state"] == "ENABLED"),
                            "open_by_severity": {r["severity"]: r["cnt"] for r in counts},
                            "rules_total": rules_total, "rules_passed": rules_passed,
                            "posture_score": round(100 * rules_passed / rules_total) if rules_total else None,
                            "updated_at": max((t["updated_at"] for t in trusts if t.get("updated_at")), default=None)}}

    @router.get("/federation/trusts/{trust_id}")
    async def trust_detail(trust_id: str, request: Request):
        analyst(request)
        found = _trusts("trust_id = :tid", {"tid": trust_id})
        if not found:
            raise HTTPException(status_code=404, detail="Trust not found")
        findings = query(f"""
            SELECT finding_id, scope, account_key, finding_type, severity, title, detail, setting, expected, actual,
                   changed_by, changed_at, status, first_seen, last_seen, resolved_at
            FROM {fqn('identity_federation_finding')} WHERE trust_id = :tid
            ORDER BY status, CASE severity WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, finding_type
        """, {"tid": trust_id})
        changes = query(f"""SELECT change_id, setting, before_value, after_value, changed_at, changed_by
                            FROM {fqn('identity_federation_change')} WHERE trust_id = :tid
                            ORDER BY changed_at DESC LIMIT 50""", {"tid": trust_id})
        return {"trust": found[0], "findings": findings, "changes": changes,
                "guests": _guests("trust_id = :tid", {"tid": trust_id})}

    @router.get("/federation/findings")
    async def federation_findings(request: Request, status: str = "open", severity: str = "", scope: str = ""):
        analyst(request)
        where, params = ["1=1"], {}
        for name, value, allowed in (("status", status, FINDING_STATUSES), ("severity", severity, SEVERITIES),
                                     ("scope", scope, SCOPES)):
            if value:
                if value not in allowed:
                    raise HTTPException(status_code=400, detail=f"Unknown {name}")
                where.append(f"f.{name} = :{name}")
                params[name] = value
        rows = query(f"""
            SELECT f.finding_id, f.scope, f.trust_id, t.partner_name, f.account_key, g.display_name AS guest_name,
                   f.canonical_id, f.finding_type, f.severity, f.title, f.detail, f.setting, f.expected, f.actual,
                   f.changed_by, f.changed_at, f.status, f.first_seen, f.last_seen, f.resolved_at
            FROM {fqn('identity_federation_finding')} f
            LEFT JOIN {fqn('identity_federation_trust')} t ON t.trust_id = f.trust_id
            LEFT JOIN {fqn('identity_federation_guest')} g ON g.account_key = f.account_key
            WHERE {' AND '.join(where)}
            ORDER BY CASE f.severity WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, f.last_seen DESC LIMIT 500
        """, params)
        return {"findings": rows}
