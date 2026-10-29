"""
Identity Timeline (Phase 1): link lifecycle, access, sign-in and MFA events to
the canonical identity spine and derive lifecycle findings.

Pure standard library so the scheduled job and the offline tests run the same
code. Events are linked through the resolver's provider cross-reference:
directory events by provider + tenant + object id, HR events by employee id.
An event that cannot be linked is kept as unlinked, never guessed.
"""

import hashlib
import json
import uuid
from datetime import datetime, timedelta, timezone

from identity_resolution import source_account_key

TIMELINE_VERSION = "identity-timeline-v1"
_NS = uuid.uuid5(uuid.NAMESPACE_URL, "0xdsi://identity/timeline")

EVENT_CATEGORY = {
    "hr_joiner": "lifecycle", "hr_mover": "lifecycle", "hr_leaver": "lifecycle",
    "hr_rehire": "lifecycle", "hr_conversion": "lifecycle",
    "account_created": "account", "account_enabled": "account", "account_disabled": "account",
    "entitlement_granted": "access", "entitlement_revoked": "access", "privilege_granted": "access",
    "privilege_revoked": "access",
    "sign_in_success": "sign_in", "sign_in_failure": "sign_in",
    "mfa_enrolled": "mfa", "mfa_device_added": "mfa", "mfa_reset": "mfa", "mfa_denied": "mfa", "mfa_lockout": "mfa",
    "password_reset": "credential", "credential_rotated": "credential",
}
HR_EVENTS = {"hr_joiner", "hr_mover", "hr_leaver", "hr_rehire", "hr_conversion"}

MFA_FATIGUE_COUNT = 3
MFA_FATIGUE_WINDOW = timedelta(minutes=10)
MFA_RESET_WINDOW = timedelta(hours=24)

FINDING_SEVERITY = {
    "post_termination_activity": "high",
    "leaver_access_remaining": "high",
    "mfa_fatigue": "high",
    "owner_departed": "high",
    "mover_access_retained": "medium",
    "mfa_reset_new_location": "medium",
    "privilege_without_ticket": "medium",
}


def _ts(value) -> datetime:
    if not value:
        raise ValueError("occurred_at is required")
    dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def event_id_for(ev: dict) -> str:
    """Stable id: the source's own event id when present, else a content hash."""
    basis = ev.get("source_event_id") or json.dumps(
        {k: ev.get(k) for k in ("provider", "tenant", "object_id", "employee_id", "event_type", "occurred_at")},
        sort_keys=True)
    return str(uuid.uuid5(_NS, f"{ev.get('provider', '')}|{basis}"))


def validate_event(ev: dict) -> dict:
    etype = str(ev.get("event_type", "")).strip().lower()
    if etype not in EVENT_CATEGORY:
        raise ValueError(f"unknown event_type {etype!r}")
    occurred = _ts(ev.get("occurred_at"))
    detail = ev.get("detail") or {}
    if not isinstance(detail, dict):
        raise ValueError("detail must be an object")
    if etype in HR_EVENTS:
        if not str(ev.get("employee_id", "")).strip():
            raise ValueError("HR events require employee_id")
        key = None
    else:
        key = source_account_key(ev.get("provider"), ev.get("tenant"), ev.get("object_id"))
    return {
        "event_id": event_id_for(ev),
        "source_event_id": str(ev.get("source_event_id") or ""),
        "provider": str(ev.get("provider", "")).strip().lower(),
        "tenant": str(ev.get("tenant", "") or ""),
        "account_key": key,
        "employee_id": str(ev.get("employee_id", "") or "").strip(),
        "event_type": etype,
        "category": EVENT_CATEGORY[etype],
        "occurred_at": _iso(occurred),
        "actor": str(ev.get("actor", "") or ""),
        "detail": detail,
    }


def link_events(raw_events, xrefs) -> dict:
    """Return {"events": [...], "quarantined": n, "unlinked": n}."""
    by_key = {x["account_key"]: x for x in xrefs}
    by_emp = {}
    for x in xrefs:
        if x.get("employee_id") and x.get("principal_type") == "person" and x.get("persona_type") != "guest":
            by_emp.setdefault(x["employee_id"], set()).add(x["canonical_id"])
    events, quarantined, seen = [], 0, set()
    for raw in raw_events:
        try:
            ev = validate_event(raw)
        except (ValueError, TypeError):
            quarantined += 1
            continue
        if ev["event_id"] in seen:
            continue
        seen.add(ev["event_id"])
        cid, persona = None, None
        if ev["account_key"]:
            x = by_key.get(ev["account_key"])
            if x:
                cid, persona = x["canonical_id"], x.get("persona_id")
        else:
            cids = by_emp.get(ev["employee_id"], set())
            if len(cids) == 1:
                cid = next(iter(cids))
        ev["canonical_id"] = cid
        ev["persona_id"] = persona
        ev["link_status"] = "linked" if cid else "unlinked"
        events.append(ev)
    events.sort(key=lambda e: (e["occurred_at"], e["event_id"]))
    return {"events": events, "quarantined": quarantined,
            "unlinked": sum(1 for e in events if not e["canonical_id"])}


def _finding(ftype, cid, evidence, detail):
    ids = sorted(e["event_id"] for e in evidence)
    fid = str(uuid.uuid5(_NS, f"{ftype}|{cid}|{'|'.join(ids)}"))
    return {"finding_id": fid, "finding_type": ftype, "severity": FINDING_SEVERITY[ftype],
            "canonical_id": cid, "evidence_event_ids": ids, "detail": detail,
            "occurred_at": max(e["occurred_at"] for e in evidence) if evidence else None}


def timeline_findings(events, xrefs) -> list:
    by_cid = {}
    for e in events:
        if e["canonical_id"]:
            by_cid.setdefault(e["canonical_id"], []).append(e)
    accounts_by_cid = {}
    for x in xrefs:
        accounts_by_cid.setdefault(x["canonical_id"], []).append(x)
    out = []
    leavers = {}

    for cid, evs in by_cid.items():
        evs = sorted(evs, key=lambda e: e["occurred_at"])
        leaver = next((e for e in reversed(evs) if e["event_type"] == "hr_leaver"), None)
        rehired = leaver and any(e["event_type"] == "hr_rehire" and e["occurred_at"] > leaver["occurred_at"] for e in evs)
        if leaver and not rehired:
            leavers[cid] = leaver
            after = [e for e in evs if e["event_type"] == "sign_in_success" and e["occurred_at"] > leaver["occurred_at"]]
            if after:
                out.append(_finding("post_termination_activity", cid, [leaver] + after,
                                    f"{len(after)} successful sign-in(s) after termination on {leaver['occurred_at'][:10]}"))
            enabled = [x for x in accounts_by_cid.get(cid, []) if x.get("normalized_state") == "ENABLED"]
            if enabled:
                names = ", ".join(sorted(f"{x['provider']}:{x.get('username') or x['provider_object_id']}" for x in enabled))
                out.append(_finding("leaver_access_remaining", cid, [leaver],
                                    f"Terminated but still enabled in {names}"))

        movers = [e for e in evs if e["event_type"] == "hr_mover"]
        for mv in movers:
            old = str(mv["detail"].get("from_department", "")).strip().lower()
            if not old:
                continue
            for g in evs:
                if g["event_type"] not in ("entitlement_granted", "privilege_granted") or g["occurred_at"] > mv["occurred_at"]:
                    continue
                if str(g["detail"].get("scope_department", "")).strip().lower() != old:
                    continue
                ent = g["detail"].get("entitlement")
                revoked = any(r["event_type"] in ("entitlement_revoked", "privilege_revoked")
                              and r["detail"].get("entitlement") == ent and r["occurred_at"] > g["occurred_at"] for r in evs)
                if not revoked:
                    out.append(_finding("mover_access_retained", cid, [mv, g],
                                        f"Still holds '{ent}' from previous department {mv['detail'].get('from_department')}"))

        denied = [e for e in evs if e["event_type"] == "mfa_denied"]
        i = 0
        while i < len(denied):
            start = _ts(denied[i]["occurred_at"])
            burst = [d for d in denied[i:] if _ts(d["occurred_at"]) - start <= MFA_FATIGUE_WINDOW]
            if len(burst) >= MFA_FATIGUE_COUNT:
                out.append(_finding("mfa_fatigue", cid, burst,
                                    f"{len(burst)} MFA push denials within {int(MFA_FATIGUE_WINDOW.total_seconds() // 60)} minutes"))
                i += len(burst)
            else:
                i += 1

        for rs in (e for e in evs if e["event_type"] == "mfa_reset"):
            t0 = _ts(rs["occurred_at"])
            prior = {str(e["detail"].get("country", "")).upper() for e in evs
                     if e["event_type"] == "sign_in_success" and e["occurred_at"] < rs["occurred_at"]} - {""}
            for s in evs:
                if s["event_type"] != "sign_in_success":
                    continue
                dt = _ts(s["occurred_at"]) - t0
                country = str(s["detail"].get("country", "")).upper()
                if timedelta(0) < dt <= MFA_RESET_WINDOW and country and prior and country not in prior:
                    out.append(_finding("mfa_reset_new_location", cid, [rs, s],
                                        f"Sign-in from {country} within {int(dt.total_seconds() // 3600)}h of an MFA reset; usual: {', '.join(sorted(prior))}"))
                    break

        for p in (e for e in evs if e["event_type"] == "privilege_granted"):
            if not str(p["detail"].get("ticket", "")).strip():
                out.append(_finding("privilege_without_ticket", cid, [p],
                                    f"'{p['detail'].get('entitlement', 'privilege')}' granted by {p['actor'] or 'unknown'} with no change ticket"))

    email_to_cid = {}
    for x in xrefs:
        if x.get("email") and x.get("principal_type") == "person":
            email_to_cid.setdefault(x["email"].lower(), set()).add(x["canonical_id"])
    for x in xrefs:
        owner = str(x.get("owner") or "").lower()
        if x.get("principal_type") == "person" or "@" not in owner:
            continue
        cids = email_to_cid.get(owner, set())
        if len(cids) == 1:
            ocid = next(iter(cids))
            if ocid in leavers:
                out.append(_finding("owner_departed", x["canonical_id"], [leavers[ocid]],
                                    f"Owner {owner} left on {leavers[ocid]['occurred_at'][:10]}; {x.get('username')} needs a new owner"))

    uniq = {f["finding_id"]: f for f in out}
    return sorted(uniq.values(), key=lambda f: (f["occurred_at"] or "", f["finding_id"]))


def timeline_version(events) -> str:
    return hashlib.sha256(json.dumps(sorted(e["event_id"] for e in events)).encode()).hexdigest()[:16]
