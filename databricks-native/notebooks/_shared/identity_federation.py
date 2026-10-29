"""Federation posture: check partner trusts, IdP federations and AD trusts against a baseline and review guests.

Every failed rule becomes a finding that says what was expected, what was found and,
when the change log has it, who changed the setting and when.
"""
from datetime import datetime, timezone

from identity_access import INACTIVE_STATES, _owner_status, _uid

FEDERATION_VERSION = "identity-federation-v1"
TRUST_KINDS = {"cross_tenant", "idp_federation", "ad_trust"}
SEVERITY_RANK = {"high": 3, "medium": 2, "low": 1}
STRONG_ALGS = ["RS256", "RS384", "RS512", "ES256", "ES384"]

DEFAULT_BASELINE = (
    {"rule_id": "ct_allowed_apps", "kind": "cross_tenant", "setting": "allowed_apps", "op": "not_eq", "value": "all",
     "severity": "high", "label": "Partner access is limited to named apps"},
    {"rule_id": "ct_partner_mfa", "kind": "cross_tenant", "setting": "trust_partner_mfa", "op": "eq", "value": False,
     "severity": "medium", "label": "Partner MFA claims are not trusted as our own"},
    {"rule_id": "ct_auto_redeem", "kind": "cross_tenant", "setting": "auto_redeem", "op": "eq", "value": False,
     "severity": "low", "label": "Guest invitations need explicit consent"},
    {"rule_id": "ct_reviewed", "kind": "cross_tenant", "setting": "last_reviewed_at", "op": "max_age_days", "value": 365,
     "severity": "medium", "label": "Trust reviewed within the last year"},
    {"rule_id": "fed_signing_alg", "kind": "idp_federation", "setting": "signing_alg", "op": "in", "value": STRONG_ALGS,
     "severity": "high", "label": "Tokens are signed with a strong algorithm"},
    {"rule_id": "fed_cert_expiry", "kind": "idp_federation", "setting": "signing_cert_expires_at", "op": "min_days_ahead",
     "value": 30, "severity": "high", "label": "Signing certificate is valid for at least 30 more days"},
    {"rule_id": "fed_external_mfa", "kind": "idp_federation", "setting": "accept_external_mfa", "op": "eq", "value": False,
     "severity": "high", "label": "MFA from the federated provider is not accepted blindly"},
    {"rule_id": "ad_sid_filtering", "kind": "ad_trust", "setting": "sid_filtering", "op": "eq", "value": True,
     "severity": "high", "label": "SID filtering is on (blocks forged admin rights from the other forest)"},
    {"rule_id": "ad_selective_auth", "kind": "ad_trust", "setting": "selective_auth", "op": "eq", "value": True,
     "severity": "medium", "label": "Selective authentication limits who can sign in across the trust"},
    {"rule_id": "ad_direction", "kind": "ad_trust", "setting": "direction", "op": "not_eq", "value": "bidirectional",
     "severity": "medium", "label": "Forest trust is one-way"},
)

GUEST_SEVERITY = {"guest_privileged": "high", "guest_sponsor_departed": "high", "guest_no_sponsor": "medium",
                  "guest_stale": "medium", "guest_unknown_partner": "medium"}
TRUST_OWNER_SEVERITY = {"trust_no_owner": "medium", "trust_owner_departed": "high"}


def _ts(v):
    if isinstance(v, datetime):
        return v if v.tzinfo else v.replace(tzinfo=timezone.utc)
    try:
        d = datetime.fromisoformat(str(v).replace("Z", "+00:00"))
    except ValueError:
        return None
    return d if d.tzinfo else d.replace(tzinfo=timezone.utc)


def _show(v) -> str:
    if v is None:
        return "not reported"
    if isinstance(v, bool):
        return "on" if v else "off"
    if isinstance(v, list):
        return ", ".join(str(x) for x in v)
    return str(v)


def _check(rule, actual, as_of) -> bool:
    op, want = rule["op"], rule["value"]
    if actual is None:
        return False
    if op == "eq":
        return actual == want
    if op == "not_eq":
        return str(actual).lower() != str(want).lower()
    if op == "in":
        return str(actual).upper() in {str(w).upper() for w in want}
    when = _ts(actual)
    if when is None:
        return False
    days = (when - as_of).total_seconds() / 86400
    return -days <= want if op == "max_age_days" else days >= want


def _expected(rule) -> str:
    op, want = rule["op"], rule["value"]
    return {"eq": _show(want), "not_eq": f"not {_show(want)}", "in": f"one of {_show(want)}",
            "max_age_days": f"within {want} days", "min_days_ahead": f"at least {want} days ahead"}[op]


def diff_settings(prior, trusts, changed_at, changed_by="detected by posture scan") -> list:
    """Compare the previous settings snapshot {trust_id: settings} with today's trusts."""
    out = []
    for t in trusts:
        old = prior.get(t["trust_id"])
        if old is None:
            continue
        for k in sorted(set(old) | set(t.get("settings") or {})):
            a, b = old.get(k), (t.get("settings") or {}).get(k)
            if a != b:
                out.append({"trust_id": t["trust_id"], "setting": k, "before": a, "after": b,
                            "changed_at": changed_at, "changed_by": changed_by})
    return out


def guest_groups(model, closure) -> dict:
    """account_key -> [{name, privileged}] for guest accounts, from the Phase 2 access model."""
    out = {}
    for ak, chains in closure.items():
        if model["accounts"][ak].get("persona_type") == "guest":
            out[ak] = sorted(({"name": model["groups"][g]["name"], "privileged": model["groups"][g]["privileged"]}
                              for g in chains), key=lambda g: g["name"])
    return out


def evaluate(trusts, xrefs, as_of, leavers=(), groups_by_account=None, changes=(), baseline=DEFAULT_BASELINE,
             stale_days=90) -> dict:
    """Return {trusts, guests, findings, summary} for the given point in time."""
    as_of = _ts(as_of)
    leavers, groups_by_account = set(leavers), groups_by_account or {}
    email_to_cid = {}
    for x in xrefs:
        if x.get("principal_type") == "person" and x.get("email") and x.get("persona_type") != "guest":
            email_to_cid.setdefault(x["email"].lower(), set()).add(x["canonical_id"])
    last_change = {}
    for c in sorted(changes, key=lambda c: str(c.get("changed_at") or "")):
        last_change[(c["trust_id"], c["setting"])] = c

    findings, trust_rows, by_domain = [], [], {}
    for t in sorted(trusts, key=lambda t: t["trust_id"]):
        if t.get("kind") not in TRUST_KINDS:
            continue
        settings = t.get("settings") or {}
        for d in t.get("partner_domains") or []:
            by_domain[d.lower()] = t
        status, _ = _owner_status(t.get("owner") or "", email_to_cid, leavers)
        rules = [r for r in baseline if r["kind"] == t["kind"]]
        failed = []
        for r in rules:
            actual = settings.get(r["setting"])
            if _check(r, actual, as_of):
                continue
            ch = last_change.get((t["trust_id"], r["setting"]))
            detail = f"{t['partner_name']}: expected {r['setting']} {_expected(r)}, found {_show(actual)}"
            if ch:
                detail += f" (changed from {_show(ch['before'])} by {ch['changed_by']} on {str(ch['changed_at'])[:10]})"
            failed.append(r)
            findings.append({"finding_id": _uid("fedfind", r["rule_id"], t["trust_id"]), "scope": "trust",
                             "trust_id": t["trust_id"], "account_key": None, "canonical_id": None,
                             "finding_type": r["rule_id"], "severity": r["severity"], "title": r["label"],
                             "detail": detail, "setting": r["setting"], "expected": _expected(r),
                             "actual": _show(actual), "changed_by": ch["changed_by"] if ch else None,
                             "changed_at": str(ch["changed_at"]) if ch else None})
        if status in ("none", "departed"):
            ftype = "trust_no_owner" if status == "none" else "trust_owner_departed"
            findings.append({"finding_id": _uid("fedfind", ftype, t["trust_id"]), "scope": "trust",
                             "trust_id": t["trust_id"], "account_key": None, "canonical_id": None,
                             "finding_type": ftype, "severity": TRUST_OWNER_SEVERITY[ftype],
                             "title": "Trust has no owner" if status == "none" else "Trust owner has left the company",
                             "detail": f"{t['partner_name']}: " + ("nobody is accountable for this trust" if status == "none"
                                                                   else f"{t['owner']} has left; assign a new owner"),
                             "setting": None, "expected": None, "actual": None, "changed_by": None, "changed_at": None})
        sev = [r["severity"] for r in failed] + ([TRUST_OWNER_SEVERITY["trust_no_owner" if status == "none" else "trust_owner_departed"]]
                                                 if status in ("none", "departed") else [])
        trust_rows.append({"trust_id": t["trust_id"], "kind": t["kind"], "provider": t.get("provider"),
                           "tenant": t.get("tenant"), "partner_name": t["partner_name"],
                           "partner_tenant": t.get("partner_tenant"), "partner_domains": t.get("partner_domains") or [],
                           "owner": t.get("owner") or "", "owner_status": status,
                           "description": t.get("description") or "", "settings": settings,
                           "rules_total": len(rules), "rules_passed": len(rules) - len(failed),
                           "worst_severity": max(sev, key=SEVERITY_RANK.get) if sev else None,
                           "guests": 0, "active_guests": 0})

    trust_by_id = {t["trust_id"]: t for t in trust_rows}
    guests = []
    for x in sorted(xrefs, key=lambda x: x["account_key"]):
        if x.get("persona_type") != "guest":
            continue
        email = (x.get("email") or "").lower()
        trust = by_domain.get(email.split("@")[-1]) if "@" in email else None
        sponsor_status, _ = _owner_status(x.get("owner") or "", email_to_cid, leavers)
        seen = _ts(x.get("last_seen")) if x.get("last_seen") else None
        inactive_days = int((as_of - seen).total_seconds() // 86400) if seen else None
        active = x.get("normalized_state") not in INACTIVE_STATES
        groups = groups_by_account.get(x["account_key"], [])
        priv = [g["name"] for g in groups if g["privileged"]]
        row = {"account_key": x["account_key"], "canonical_id": x["canonical_id"],
               "display_name": x.get("display_name") or x.get("username"), "username": x.get("username"),
               "email": email, "home_tenant": x.get("tenant"), "trust_id": trust["trust_id"] if trust else None,
               "partner_name": trust["partner_name"] if trust else None, "sponsor": x.get("owner") or "",
               "sponsor_status": sponsor_status, "normalized_state": x.get("normalized_state"),
               "last_seen": str(x.get("last_seen") or "") or None, "days_inactive": inactive_days,
               "groups": [g["name"] for g in groups], "privileged_groups": priv}
        guests.append(row)
        if trust:
            trust_by_id[trust["trust_id"]]["guests"] += 1
            trust_by_id[trust["trust_id"]]["active_guests"] += int(active)
        if not active:
            continue
        who = row["display_name"] or x["account_key"]

        def gf(ftype, title, detail):
            findings.append({"finding_id": _uid("fedfind", ftype, x["account_key"]), "scope": "guest",
                             "trust_id": row["trust_id"], "account_key": x["account_key"],
                             "canonical_id": x["canonical_id"], "finding_type": ftype, "severity": GUEST_SEVERITY[ftype],
                             "title": title, "detail": detail, "setting": None, "expected": None, "actual": None,
                             "changed_by": None, "changed_at": None})

        if priv:
            gf("guest_privileged", "Guest holds privileged access", f"{who} is a member of {', '.join(priv)}")
        if sponsor_status == "none":
            gf("guest_no_sponsor", "Guest has no sponsor", f"Nobody inside the company vouches for {who}")
        elif sponsor_status == "departed":
            gf("guest_sponsor_departed", "Guest sponsor has left", f"{who}'s sponsor {row['sponsor']} has left the company")
        if inactive_days is not None and inactive_days > stale_days:
            gf("guest_stale", "Guest has not signed in recently",
               f"{who} last signed in {inactive_days} days ago but the account is still enabled")
        if not trust:
            gf("guest_unknown_partner", "Guest from an unrecognised organisation",
               f"{who} ({email or 'no email'}) does not belong to any partner with a reviewed trust")

    sev_counts = {s: sum(1 for f in findings if f["severity"] == s) for s in ("high", "medium", "low")}
    rules_total = sum(t["rules_total"] for t in trust_rows)
    rules_passed = sum(t["rules_passed"] for t in trust_rows)
    summary = {"trusts": len(trust_rows), "guests": len(guests),
               "active_guests": sum(1 for g in guests if g["normalized_state"] not in INACTIVE_STATES),
               "findings": len(findings), "by_severity": sev_counts, "rules_total": rules_total,
               "rules_passed": rules_passed,
               "posture_score": round(100 * rules_passed / rules_total) if rules_total else 100,
               "drift_events": len(changes)}
    findings.sort(key=lambda f: (-SEVERITY_RANK[f["severity"]], f["finding_id"]))
    return {"version": FEDERATION_VERSION, "trusts": trust_rows, "guests": guests, "findings": findings,
            "summary": summary}
