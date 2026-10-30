"""
Identity Datalake API, Phase 5: governed natural-language answers. A question is parsed by fixed rules
(backend.identity_answer_parser), answered only from identity datalake rows, and every answer lists the rows it
used. Each question is logged before it is answered; if the log write fails the question is not answered.
"""

import json
import uuid
from typing import Callable

from fastapi import APIRouter, HTTPException, Request

from backend.identity_answer_parser import ANSWERS_VERSION, MAX_QUESTION, catalog, lexicon_entry, parse

MAX_ROWS = 25
LEAVER_FINDINGS = ("leaver_access_remaining", "post_termination_activity")


def _j(v, default):
    try:
        out = json.loads(v) if isinstance(v, str) else v
    except ValueError:
        return default
    return default if out is None else out


def _route(steps) -> str:
    return " > ".join(s.get("label", "") if isinstance(s, dict) else str(s) for s in _j(steps, []))


def _answer(headline, sentences=(), columns=(), rows=(), citations=(), link=None) -> dict:
    rows = list(rows)
    return {"headline": headline, "sentences": [s for s in sentences if s], "columns": list(columns),
            "rows": rows[:MAX_ROWS], "truncated": max(0, len(rows) - MAX_ROWS), "citations": list(citations)[:MAX_ROWS],
            "link": link}


def build_lexicon(query: Callable, fqn: Callable) -> list:
    names = {}
    for x in query(f"SELECT canonical_id, username, email FROM {fqn('identity_provider_xref')} LIMIT 20000"):
        bag = names.setdefault(x["canonical_id"], set())
        bag.update(v for v in (x["username"], (x["email"] or "").split("@")[0]) if v)
    out = [lexicon_entry("identity", c["canonical_id"], c["display_name"] or c["canonical_id"],
                         [c["display_name"]] + sorted(names.get(c["canonical_id"], ())))
           for c in query(f"SELECT canonical_id, display_name FROM {fqn('identity_canonical')} LIMIT 20000")]
    out += [lexicon_entry("resource", r["resource_id"], r["name"], [r["name"], r["resource_id"]])
            for r in query(f"SELECT resource_id, name FROM {fqn('identity_resource')} LIMIT 5000")]
    out += [lexicon_entry("group", g["group_key"], g["name"], [g["name"]])
            for g in query(f"SELECT group_key, name FROM {fqn('identity_group')} LIMIT 5000")]
    out += [lexicon_entry("trust", t["trust_id"], t["partner_name"] or t["trust_id"], [t["partner_name"], t["trust_id"]])
            for t in query(f"SELECT trust_id, partner_name FROM {fqn('identity_federation_trust')} LIMIT 2000")]
    return [e for e in out if e["aliases"]]


def build_answer(query: Callable, fqn: Callable, intent: str, entity) -> dict:
    """Answer one approved intent from datalake rows. `entity` is {kind, id, label} or None."""
    eid, label = (entity or {}).get("id"), (entity or {}).get("label")
    p = {"id": eid}

    if intent == "top_risk":
        rows = query(f"""SELECT canonical_id, display_name, principal_type, score, band, factors FROM {fqn('identity_risk_score')}
                         ORDER BY score DESC, display_name LIMIT 10""")
        crit = sum(1 for r in rows if r["band"] == "critical")
        return _answer(f"{crit} critical identit{'y' if crit == 1 else 'ies'} in the top {len(rows)}",
                       ["Scores add up exposure, behaviour and hygiene factors; each point has evidence on Identity Risk."],
                       ["Identity", "Type", "Score", "Band", "Biggest factor"],
                       [[r["display_name"], r["principal_type"], r["score"], r["band"],
                         (_j(r["factors"], []) or [{}])[0].get("label", "")] for r in rows],
                       [{"source": "identity_risk_score", "key": r["canonical_id"], "label": r["display_name"]} for r in rows],
                       {"view": "id_risk"})

    if intent == "why_risky":
        found = query(f"SELECT * FROM {fqn('identity_risk_score')} WHERE canonical_id = :id", p)
        if not found:
            return _answer(f"{label} has no risk score yet", ["The Identity 01 job scores identities daily."])
        r = found[0]
        factors = _j(r["factors"], [])
        return _answer(f"{label} scores {r['score']} ({r['band']})",
                       [f"Exposure {r['exposure']}, behaviour {r['behaviour']}, hygiene {r['hygiene']}."]
                       + ([] if factors else ["No risk factors apply."]),
                       ["Factor", "Points", "Evidence"],
                       [[f["label"], f["points"], "; ".join(f.get("evidence", [])[:3])] for f in factors],
                       [{"source": "identity_risk_score", "key": eid, "label": label}], {"view": "id_risk"})

    if intent == "what_access":
        rows = query(f"""SELECT p.path_id, p.resource_id, r.name, p.permission, p.via_takeover, p.steps
                         FROM {fqn('identity_attack_path')} p LEFT JOIN {fqn('identity_resource')} r ON r.resource_id = p.resource_id
                         WHERE p.canonical_id = :id AND p.status = 'open' ORDER BY r.name""", p)
        take = sum(1 for r in rows if r["via_takeover"])
        return _answer(f"{label} can reach {len(rows)} crown-jewel system{'' if len(rows) == 1 else 's'}",
                       [f"{take} of these go through taking over another account." if take else ""],
                       ["System", "Permission", "Route", "Takeover"],
                       [[r["name"] or r["resource_id"], r["permission"] or "access", _route(r["steps"]),
                         "yes" if r["via_takeover"] else "no"] for r in rows],
                       [{"source": "identity_attack_path", "key": r["path_id"], "label": r["name"]} for r in rows],
                       {"view": "id_graph"})

    if intent == "who_can_reach":
        rows = query(f"""SELECT p.path_id, p.canonical_id, c.display_name, c.principal_type, p.permission, p.via_takeover, p.steps
                         FROM {fqn('identity_attack_path')} p LEFT JOIN {fqn('identity_canonical')} c ON c.canonical_id = p.canonical_id
                         WHERE p.resource_id = :id AND p.status = 'open' ORDER BY c.display_name""", p)
        people = sum(1 for r in rows if r["principal_type"] == "person")
        return _answer(f"{len(rows)} identit{'y' if len(rows) == 1 else 'ies'} can reach {label} ({people} people)",
                       ["Routes follow group membership, nesting, grants and account takeover rights."],
                       ["Identity", "Type", "Permission", "Route", "Takeover"],
                       [[r["display_name"] or r["canonical_id"], r["principal_type"], r["permission"] or "access",
                         _route(r["steps"]), "yes" if r["via_takeover"] else "no"] for r in rows],
                       [{"source": "identity_attack_path", "key": r["path_id"], "label": r["display_name"]} for r in rows],
                       {"view": "id_graph"})

    if intent == "recent_activity":
        events = query(f"""SELECT event_id, event_type, category, occurred_at, provider, actor FROM {fqn('identity_event')}
                           WHERE canonical_id = :id ORDER BY occurred_at DESC LIMIT 10""", p)
        findings = query(f"""SELECT finding_id, severity, detail FROM {fqn('identity_timeline_finding')}
                             WHERE canonical_id = :id AND status = 'open' ORDER BY severity""", p)
        return _answer(f"{len(events)} recent event{'' if len(events) == 1 else 's'} for {label}, "
                       f"{len(findings)} open finding{'' if len(findings) == 1 else 's'}",
                       [f"{f['severity'].capitalize()}: {f['detail']}" for f in findings],
                       ["When", "Event", "Category", "Source", "By"],
                       [[str(e["occurred_at"])[:16].replace("T", " "), e["event_type"].replace("_", " "), e["category"],
                         e["provider"], e["actor"] or ""] for e in events],
                       [{"source": "identity_event", "key": e["event_id"], "label": e["event_type"]} for e in events]
                       + [{"source": "identity_timeline_finding", "key": f["finding_id"], "label": f["detail"]} for f in findings],
                       {"view": "id_timeline"})

    if intent == "leavers":
        rows = query(f"""SELECT f.finding_id, f.canonical_id, c.display_name, f.finding_type, f.severity, f.detail
                         FROM {fqn('identity_timeline_finding')} f LEFT JOIN {fqn('identity_canonical')} c ON c.canonical_id = f.canonical_id
                         WHERE f.status = 'open' AND f.finding_type IN ('{LEAVER_FINDINGS[0]}', '{LEAVER_FINDINGS[1]}')
                         ORDER BY c.display_name, f.finding_type""")
        people = len({r["canonical_id"] for r in rows})
        return _answer(f"{people} leaver{'' if people == 1 else 's'} still {'has' if people == 1 else 'have'} live access or activity",
                       ["Each one has a proposed fix on Identity Remediation." if rows else "No leaver has live access."],
                       ["Person", "Finding", "Severity", "Detail"],
                       [[r["display_name"], r["finding_type"].replace("_", " "), r["severity"], r["detail"]] for r in rows],
                       [{"source": "identity_timeline_finding", "key": r["finding_id"], "label": r["display_name"]} for r in rows],
                       {"view": "id_remediation"})

    if intent == "guests":
        rows = query(f"""SELECT f.finding_id, g.display_name, g.partner_name, f.title, f.severity, f.detail
                         FROM {fqn('identity_federation_finding')} f LEFT JOIN {fqn('identity_federation_guest')} g ON g.account_key = f.account_key
                         WHERE f.status = 'open' AND f.scope = 'guest'
                         ORDER BY CASE f.severity WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, g.display_name""")
        guests = len({r["display_name"] for r in rows})
        return _answer(f"{guests} guest account{'' if guests == 1 else 's'} with {len(rows)} open finding{'' if len(rows) == 1 else 's'}",
                       [], ["Guest", "Partner", "Finding", "Severity", "Detail"],
                       [[r["display_name"], r["partner_name"] or "unknown", r["title"], r["severity"], r["detail"]] for r in rows],
                       [{"source": "identity_federation_finding", "key": r["finding_id"], "label": r["display_name"]} for r in rows],
                       {"view": "id_federation"})

    if intent == "mfa_gaps":
        rows = query(f"""SELECT canonical_id, display_name, score, band FROM {fqn('identity_risk_score')}
                         WHERE factors LIKE '%"no_mfa"%' ORDER BY score DESC, display_name""")
        return _answer(f"{len(rows)} {'person has' if len(rows) == 1 else 'people have'} no active MFA enrolment",
                       ["Based on the Duo feed; a missing Duo account counts as not enrolled."],
                       ["Person", "Risk score", "Band"], [[r["display_name"], r["score"], r["band"]] for r in rows],
                       [{"source": "identity_risk_score", "key": r["canonical_id"], "label": r["display_name"]} for r in rows],
                       {"view": "id_risk"})

    if intent == "pending_remediation":
        rows = query(f"""SELECT action_id, title, severity, status, required_approvals, requested_by
                         FROM {fqn('identity_remediation_action')} WHERE status IN ('pending_approval', 'queued', 'proposed')
                         ORDER BY CASE status WHEN 'pending_approval' THEN 0 WHEN 'queued' THEN 1 ELSE 2 END,
                                  CASE severity WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, title""")
        waiting = sum(1 for r in rows if r["status"] == "pending_approval")
        return _answer(f"{waiting} change{'' if waiting == 1 else 's'} waiting for approval",
                       [f"{sum(1 for r in rows if r['status'] == 'proposed')} more proposed and not yet requested."],
                       ["Change", "Severity", "Status", "Approvals needed", "Requested by"],
                       [[r["title"], r["severity"], r["status"].replace("_", " "), r["required_approvals"], r["requested_by"] or ""]
                        for r in rows],
                       [{"source": "identity_remediation_action", "key": r["action_id"], "label": r["title"]} for r in rows],
                       {"view": "id_remediation"})

    if intent == "group_issues":
        g = query(f"""SELECT name, owner, owner_status, privileged, effective_member_count, parent_groups
                      FROM {fqn('identity_group')} WHERE group_key = :id""", p)
        if not g:
            return _answer(f"No group data for {label}")
        g = g[0]
        findings = query(f"""SELECT finding_id, finding_type, severity, detail FROM {fqn('identity_group_finding')}
                             WHERE group_key = :id AND status = 'open'
                             ORDER BY CASE severity WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END""", p)
        parents = _j(g["parent_groups"], [])
        return _answer(f"{label}: {len(findings)} open finding{'' if len(findings) == 1 else 's'}",
                       [f"{g['effective_member_count']} effective member(s); owner {g['owner'] or 'none'} ({g['owner_status']})"
                        + ("; marked privileged" if g["privileged"] else "") + "."]
                       + ([f"Nested in {', '.join(parents)}."] if parents else []),
                       ["Finding", "Severity", "Detail"],
                       [[f["finding_type"].replace("_", " "), f["severity"], f["detail"]] for f in findings],
                       [{"source": "identity_group", "key": eid, "label": label}]
                       + [{"source": "identity_group_finding", "key": f["finding_id"], "label": f["finding_type"]} for f in findings],
                       {"view": "id_groups"})

    if intent == "trust_posture":
        t = query(f"""SELECT kind, partner_name, owner, owner_status, rules_passed, rules_total, worst_severity, guests
                      FROM {fqn('identity_federation_trust')} WHERE trust_id = :id""", p)
        if not t:
            return _answer(f"No trust data for {label}")
        t = t[0]
        findings = query(f"""SELECT finding_id, title, severity, expected, actual FROM {fqn('identity_federation_finding')}
                             WHERE trust_id = :id AND scope = 'trust' AND status = 'open'
                             ORDER BY CASE severity WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END""", p)
        safe = not findings
        return _answer(f"{label} {'passes' if safe else 'fails'} the baseline: {t['rules_passed']} of {t['rules_total']} checks pass",
                       [f"Owner {t['owner'] or 'none'} ({t['owner_status']}); {t['guests'] or 0} guest(s) arrive through it."],
                       ["Check", "Severity", "Expected", "Actual"],
                       [[f["title"], f["severity"], f["expected"] or "", f["actual"] or ""] for f in findings],
                       [{"source": "identity_federation_trust", "key": eid, "label": label}]
                       + [{"source": "identity_federation_finding", "key": f["finding_id"], "label": f["title"]} for f in findings],
                       {"view": "id_federation"})

    if intent == "owner_of":
        kind = entity["kind"]
        if kind == "identity":
            rows = query(f"""SELECT DISTINCT owner FROM {fqn('identity_provider_xref')}
                             WHERE canonical_id = :id AND owner IS NOT NULL AND owner <> ''""", p)
            owners, status = [r["owner"] for r in rows], None
        else:
            table, key = {"group": ("identity_group", "group_key"), "resource": ("identity_resource", "resource_id"),
                          "trust": ("identity_federation_trust", "trust_id")}[kind]
            status_col = ", owner_status" if kind != "resource" else ""
            rows = query(f"SELECT owner{status_col} FROM {fqn(table)} WHERE {key} = :id", p)
            owners = [r["owner"] for r in rows if r["owner"]]
            status = rows[0].get("owner_status") if rows else None
        if not owners:
            return _answer(f"{label} has no owner of record", ["Assign one in the source directory or GRC register."],
                           citations=[{"source": kind, "key": eid, "label": label}])
        note = {"departed": "This owner has left the company.", "none": "", "active": "The owner is a current employee."}
        return _answer(f"{label} is owned by {', '.join(owners)}", [note.get(status or "", "")],
                       citations=[{"source": kind, "key": eid, "label": label}])

    raise ValueError(f"unknown intent {intent}")


def add_answer_routes(router: APIRouter, query: Callable, execute_write: Callable, fqn: Callable,
                      analyst: Callable) -> None:

    def _as_of():
        r = query(f"SELECT MAX(scored_at) AS t FROM {fqn('identity_risk_score')}")
        return r[0]["t"] if r else None

    @router.get("/answers/catalog")
    async def answer_catalog(request: Request):
        analyst(request)
        return {**catalog(), "lexicon": build_lexicon(query, fqn)}

    @router.post("/answers/ask")
    async def ask(request: Request):
        user = analyst(request)
        body = await request.json()
        question = str(body.get("question") or "").strip()
        if not question:
            raise HTTPException(status_code=400, detail="Type a question")
        if len(question) > MAX_QUESTION:
            raise HTTPException(status_code=400, detail=f"Keep questions under {MAX_QUESTION} characters")
        lexicon = build_lexicon(query, fqn)
        parsed = parse(question, lexicon)
        answer = build_answer(query, fqn, parsed["intent"], parsed.get("entity")) if parsed["status"] == "answer" else None
        entity = parsed.get("entity") or {}
        qid = str(uuid.uuid4())
        execute_write(f"""
            INSERT INTO {fqn('identity_answer_log')}
              (question_id, asked_by, question, status, intent, entity_kind, entity_id, row_count, answers_version, asked_at)
            VALUES (:qid, :who, :q, :status, :intent, :kind, :eid, :n, :v, current_timestamp())
        """, {"qid": qid, "who": (user.get("email") or user.get("username") or "unknown").lower(), "q": question,
              "status": parsed["status"], "intent": parsed.get("intent"), "kind": entity.get("kind"),
              "eid": entity.get("id"), "n": len(answer["rows"]) if answer else 0, "v": ANSWERS_VERSION})
        return {"question_id": qid, "question": question, **parsed, "answer": answer, "as_of": _as_of(),
                "version": ANSWERS_VERSION}

    @router.get("/answers/history")
    async def history(request: Request, limit: int = 20):
        user = analyst(request)
        limit = max(1, min(int(limit), 50))
        who = (user.get("email") or user.get("username") or "unknown").lower()
        rows = query(f"""SELECT question_id, question, status, intent, asked_at FROM {fqn('identity_answer_log')}
                         WHERE asked_by = :who ORDER BY asked_at DESC LIMIT {limit}""", {"who": who})
        return {"questions": rows}
