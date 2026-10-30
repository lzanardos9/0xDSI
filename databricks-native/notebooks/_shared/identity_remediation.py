"""Remediation: turn open findings into approved, reversible access changes.

Proposals come only from findings. Each one is simulated first (blast radius, lockouts), needs approval from
someone other than the requester, and is executed through a leased outbox. Every executed change keeps its
before-state and inverse so it can be rolled back. Deleting a group is never proposed: it cannot be undone.
"""
import hashlib
import json
import re
from datetime import timedelta

from identity_access import (INACTIVE_STATES, _uid, attack_paths, build_access_model, departments_from_events,
                             group_context, leavers_from_events, ref_key, score_identities)
from identity_whatif import _describe, _names, _safe_key, apply_changes, simulate

REMEDIATION_VERSION = "identity-remediation-v1"
INVERSE = {"remove_membership": "add_membership", "revoke_grant": "restore_grant",
           "remove_takeover": "restore_takeover", "disable_account": "enable_account"}
LEASE_SECONDS = 300
MAX_ATTEMPTS = 3
MAX_PROPOSALS = 200
SEVERITY_RANK = {"high": 3, "medium": 2, "low": 1}
LEAVER_FINDINGS = {"leaver_access_remaining", "post_termination_activity"}
GUEST_DISABLE_FINDINGS = {"guest_stale", "guest_sponsor_departed", "guest_no_sponsor", "guest_unknown_partner"}


class ConnectorMissing(Exception):
    """No live connector is configured for this provider. Never retried."""


def action_id(change) -> str:
    return _uid("remediation", json.dumps(change, sort_keys=True))


def action_hash(change, access_version) -> str:
    return hashlib.sha256(f"{json.dumps(change, sort_keys=True)}|{access_version}".encode()).hexdigest()[:16]


def provider_of(change) -> str:
    key = change.get("group") if change["type"] in ("remove_membership", "add_membership") else \
        change.get("account") or change.get("source")
    return key.split(":", 1)[0]


def _quoted(text):
    m = re.search(r"'([^']+)'", text or "")
    return m.group(1).strip().lower() if m else ""


def _reason(kind, f, detail=None):
    return {"source_kind": kind, "finding_id": f["finding_id"], "finding_type": f["finding_type"],
            "severity": f.get("severity") or "medium", "detail": detail or f.get("detail") or ""}


def _candidates(model, ctx, paths, scores, timeline_findings, federation_findings, sod_rules):
    """Yield (change, reason) pairs. Only reversible change types are ever produced."""
    accounts, groups, closure = model["accounts"], model["groups"], ctx["closure"]
    by_cid = {}
    for x in accounts.values():
        by_cid.setdefault(x["canonical_id"], []).append(x)
    direct_groups = {ak: [gk for gk, chain in chains.items() if len(chain) == 1] for ak, chains in closure.items()}

    for f in timeline_findings:
        if f.get("status", "open") != "open":
            continue
        cid = f["canonical_id"]
        if f["finding_type"] in LEAVER_FINDINGS:
            for x in by_cid.get(cid, []):
                if x.get("normalized_state") == "ENABLED":
                    yield {"type": "disable_account", "account": x["account_key"]}, _reason("timeline", f)
        elif f["finding_type"] in ("privilege_without_ticket", "mover_access_retained"):
            ent = _quoted(f.get("detail"))
            for x in by_cid.get(cid, []):
                for gk in direct_groups.get(x["account_key"], []):
                    if groups[gk]["name"].lower() == ent:
                        yield {"type": "remove_membership", "group": gk, "member": x["account_key"]}, _reason("timeline", f)
                for etype, dst, perm in model["out"].get(f"a:{x['account_key']}", []):
                    if etype == "grants" and model["resources"][dst[2:]]["name"].lower() == ent:
                        c = {"type": "revoke_grant", "source": x["account_key"], "resource_id": dst[2:]}
                        yield (dict(c, permission=perm) if perm else c), _reason("timeline", f)

    for f in ctx["findings"]:
        gk, ftype = f["group_key"], f["finding_type"]
        if ftype == "hidden_privilege_nesting":
            for parent in f["evidence"]:
                yield {"type": "remove_membership", "group": parent, "member": gk}, _reason("group", f)
        elif ftype in ("member_outside_purpose", "inactive_members"):
            for ak in f["evidence"]:
                if gk in direct_groups.get(ak, []):
                    yield {"type": "remove_membership", "group": gk, "member": ak}, _reason("group", f)

    rules = {r["label"]: r for r in sod_rules}
    for s in scores:
        for fac in s["factors"]:
            if fac["factor"] != "sod_conflict":
                continue
            rule = rules.get(fac["label"].split(": ", 1)[-1])
            if not rule:
                continue
            perm, rid = rule["permissions"][-1], rule["resource_id"]
            reason = {"source_kind": "risk", "finding_id": _uid("sod", s["canonical_id"], rule["rule"]),
                      "finding_type": "sod_conflict", "severity": "high",
                      "detail": f"{s['display_name']}: {fac['label']}. Removing the '{perm}' duty splits it."}
            for x in by_cid.get(s["canonical_id"], []):
                ak = x["account_key"]
                if x.get("normalized_state") in INACTIVE_STATES:
                    continue
                for etype, dst, p in model["out"].get(f"a:{ak}", []):
                    if etype == "grants" and dst == f"r:{rid}" and p == perm:
                        yield {"type": "revoke_grant", "source": ak, "resource_id": rid, "permission": perm}, reason
                for gk, chain in closure.get(ak, {}).items():
                    if any(t == "grants" and d == f"r:{rid}" and p == perm for t, d, p in model["out"].get(f"g:{gk}", [])):
                        yield {"type": "remove_membership", "group": chain[0], "member": ak}, reason

    for p in paths:
        if not p["via_takeover"]:
            continue
        steps = p["steps"]
        for i in range(1, len(steps)):
            if steps[i]["edge"] == "can_take_over":
                res = model["resources"][p["resource_id"]]["name"]
                reason = {"source_kind": "risk", "finding_id": p["path_id"], "finding_type": "takeover_path",
                          "severity": "high",
                          "detail": f"{steps[i - 1]['label']} can take over {steps[i]['label']} and so reach {res}"}
                yield {"type": "remove_takeover", "source": steps[i - 1]["id"], "target": steps[i]["id"]}, reason

    for f in federation_findings:
        ak = f.get("account_key")
        if f.get("status", "open") != "open" or f.get("scope") != "guest" or ak not in accounts:
            continue
        if f["finding_type"] in GUEST_DISABLE_FINDINGS and accounts[ak].get("normalized_state") == "ENABLED":
            yield {"type": "disable_account", "account": ak}, _reason("federation", f, f.get("detail"))
        elif f["finding_type"] == "guest_privileged":
            for gk, chain in closure.get(ak, {}).items():
                if groups[gk]["privileged"]:
                    yield {"type": "remove_membership", "group": chain[0], "member": ak}, _reason("federation", f)


def _subject(change, accounts):
    key = change.get("account") or change.get("member") or change.get("source")
    x = accounts.get(key)
    return (x["canonical_id"], x.get("display_name") or x.get("username")) if x else (None, None)


def required_approvals(change, model, summary) -> int:
    """Two approvers for privileged groups, admin or non-human accounts, or wide blast radius; otherwise one."""
    g = model["groups"].get(change.get("group", ""))
    if g and g["privileged"]:
        return 2
    for k in ("account", "member", "target"):
        x = model["accounts"].get(change.get(k, ""))
        if x and (x.get("persona_type") == "privileged" or x.get("principal_type") in ("workload", "agent")):
            return 2
    return 2 if summary["identities_affected"] > 3 else 1


def propose(xrefs, resources, groups, edges, events=(), timeline_findings=(), identity_findings=(),
            federation_findings=(), weights=None, access_version="", sod_rules=None) -> list:
    """Deduplicated, simulated remediation proposals from today's open findings."""
    from identity_access import DEFAULT_SOD_RULES
    sod_rules = sod_rules or DEFAULT_SOD_RULES
    departments, leavers = departments_from_events(events), leavers_from_events(events)
    model = build_access_model(xrefs, resources, groups, edges)
    ctx = group_context(model, departments, leavers)
    paths = attack_paths(model)
    scores = score_identities(model, paths, ctx["closure"], timeline_findings, identity_findings, None, weights, sod_rules)
    names = _names(xrefs, resources, groups)

    merged = {}
    for change, reason in _candidates(model, ctx, paths, scores, timeline_findings, federation_findings, sod_rules):
        change = {k: (v if k in ("type", "resource_id", "permission") else ref_key(v)) for k, v in change.items()}
        aid = action_id(change)
        entry = merged.setdefault(aid, {"change": change, "reasons": []})
        if reason["finding_id"] not in {r["finding_id"] for r in entry["reasons"]}:
            entry["reasons"].append(reason)

    out = []
    for aid, entry in sorted(merged.items())[:MAX_PROPOSALS]:
        change = entry["change"]
        sim = simulate(xrefs, resources, groups, edges, [change], events, timeline_findings, identity_findings, weights)
        if not sim["applied"]:
            continue
        summary = sim["summary"]
        cid, display = _subject(change, model["accounts"])
        lockouts = sim["lockouts"]
        reasons = sorted(entry["reasons"], key=lambda r: (-SEVERITY_RANK.get(r["severity"], 0), r["finding_id"]))
        out.append({
            "action_id": aid, "action_type": change["type"], "change": change, "title": _describe(change, names),
            "reasons": reasons, "severity": reasons[0]["severity"], "canonical_id": cid,
            "display_name": display or names.get(change.get("member") or change.get("source") or "", ""),
            "provider": provider_of(change),
            "impact": {"summary": summary, "score_changes": sim["score_changes"][:10], "lockouts": lockouts,
                       "memberships_lost": sim["memberships_lost"][:20], "paths_removed": sim["paths_removed"][:20]},
            "required_approvals": required_approvals(change, model, summary),
            "status": "blocked" if lockouts else "proposed",
            "blocked_reason": ("Would leave nobody able to reach " + ", ".join(lk["resource"] for lk in lockouts))
            if lockouts else None,
            "access_version": access_version, "action_hash": action_hash(change, access_version),
        })
    return sorted(out, key=lambda a: (-SEVERITY_RANK.get(a["severity"], 0),
                                      -a["impact"]["summary"]["risk_points_removed"], a["title"]))


def before_state(change, model) -> dict:
    t = change["type"]
    if t == "disable_account":
        x = model["accounts"][change["account"]]
        return {"normalized_state": x.get("normalized_state"), "provider_state": x.get("provider_state")}
    if t == "revoke_grant":
        node = f"g:{change['source']}" if change["source"] in model["groups"] else f"a:{change['source']}"
        perms = sorted(p for e, d, p in model["out"].get(node, []) if e == "grants" and d == f"r:{change['resource_id']}"
                       and (not change.get("permission") or p == change["permission"]))
        return {"permissions": perms}
    if t == "remove_takeover":
        node = f"g:{change['source']}" if change["source"] in model["groups"] else f"a:{change['source']}"
        perms = sorted(p for e, d, p in model["out"].get(node, []) if e == "can_take_over" and d == f"a:{change['target']}")
        return {"permissions": perms}
    return {"member_of": True}


def inverse(change, before) -> dict:
    inv = dict(change, type=INVERSE[change["type"]])
    if change["type"] in ("revoke_grant", "remove_takeover"):
        inv["permissions"] = before.get("permissions") or []
        inv.pop("permission", None)
    if change["type"] == "disable_account":
        inv["provider_state"] = before.get("provider_state")
    return inv


def provider_request(change, idempotency_key) -> dict:
    """The exact call a live connector would make. In dry-run mode this is recorded, not sent."""
    t, prov = change["type"], provider_of(change)
    oid = lambda k: change[k].split(":", 2)[2]  # noqa: E731
    head = {"provider": prov, "idempotency_key": idempotency_key}
    if prov == "entra_id":
        if t in ("disable_account", "enable_account"):
            return dict(head, method="PATCH", path=f"/v1.0/users/{oid('account')}",
                        body={"accountEnabled": t == "enable_account"})
        if t == "remove_membership":
            return dict(head, method="DELETE", path=f"/v1.0/groups/{oid('group')}/members/{oid('member')}/$ref")
        if t == "add_membership":
            return dict(head, method="POST", path=f"/v1.0/groups/{oid('group')}/members/$ref",
                        body={"@odata.id": f"https://graph.microsoft.com/v1.0/directoryObjects/{oid('member')}"})
    if prov == "active_directory":
        cmd = {"disable_account": ("Disable-ADAccount", {"Identity": "account"}),
               "enable_account": ("Enable-ADAccount", {"Identity": "account"}),
               "remove_membership": ("Remove-ADGroupMember", {"Identity": "group", "Members": "member"}),
               "add_membership": ("Add-ADGroupMember", {"Identity": "group", "Members": "member"})}.get(t)
        if cmd:
            return dict(head, command=cmd[0], args={a: oid(f) for a, f in cmd[1].items()})
    if prov == "saviynt" and t in ("remove_membership", "add_membership"):
        return dict(head, method="POST", path="/ECM/api/v5/createrequest",
                    body={"requesttype": "REMOVEACCESS" if t == "remove_membership" else "ADDACCESS",
                          "entitlementvalue": oid("group"), "accountname": oid("member")})
    return dict(head, operation=t, params={k: v for k, v in change.items() if k != "type"})


def dispatch(request, mode, connectors=None) -> dict:
    """Send a request through a live connector, or record it in dry-run mode."""
    if mode == "dry_run":
        return {"mode": "dry_run", "accepted": True, "note": "Recorded only; nothing was sent to the directory"}
    connector = (connectors or {}).get(request["provider"])
    if not connector:
        raise ConnectorMissing(f"No live connector is configured for {request['provider']}")
    return dict(connector(request), mode="live")


def observed(change, xrefs, groups, edges) -> bool:
    """True when today's feeds already show the state this change aims for (used to verify and to skip no-ops)."""
    t = change["type"]
    if t in ("disable_account", "enable_account"):
        x = next((x for x in xrefs if x["account_key"] == change["account"]), None)
        inactive = bool(x) and x.get("normalized_state") in INACTIVE_STATES
        return inactive if t == "disable_account" else bool(x) and not inactive
    if t in ("remove_membership", "add_membership"):
        g = next((g for g in groups if _safe_key(g) == change["group"]), None)
        present = bool(g) and any(_safe_key(m) == change["member"] for m in g.get("members") or [])
        return not present if t == "remove_membership" else present
    etype = "grants" if t in ("revoke_grant", "restore_grant") else "can_take_over"
    target = change.get("resource_id") or change.get("target")
    perms = [change["permission"]] if change.get("permission") else change.get("permissions") or []
    hits = [e for e in edges if e.get("edge_type") == etype and _safe_key(e.get("source")) == change["source"]
            and (str(e.get("target")) == target or _safe_key(e.get("target")) == target)
            and (not perms or str(e.get("permission") or "").lower() in perms)]
    return not hits if t in ("revoke_grant", "remove_takeover") else bool(hits)


def precheck(change, xrefs, resources, groups, edges, events=(), timeline_findings=(), identity_findings=()) -> tuple:
    """Re-validate an approved change against today's data. Returns ('ok'|'no_op'|'blocked', reason)."""
    if observed(change, xrefs, groups, edges):
        return "no_op", "The directory already shows this change"
    if change["type"] in INVERSE:
        _, _, _, applied, _ = apply_changes(xrefs, groups, edges, [change])
        if not applied:
            return "no_op", "Nothing in today's access data matches this change any more"
        sim = simulate(xrefs, resources, groups, edges, [change], events, timeline_findings, identity_findings)
        if sim["lockouts"]:
            return "blocked", "Would now leave nobody able to reach " + ", ".join(lk["resource"] for lk in sim["lockouts"])
    return "ok", None


def claimable(row, now) -> bool:
    """An outbox row can be leased when queued, or when a previous worker's lease has expired."""
    if (row.get("attempts") or 0) >= MAX_ATTEMPTS:
        return False
    if row["status"] == "queued":
        return True
    return row["status"] == "leased" and row.get("lease_expires_at") is not None and row["lease_expires_at"] < now


def lease_until(now):
    return now + timedelta(seconds=LEASE_SECONDS)


def approvals_satisfied(action, approvals) -> tuple:
    """Re-check the approval rule at execution time: enough distinct approvers, none of them the requester,
    all bound to the same action hash, and no rejection."""
    rel = [a for a in approvals if a["action_hash"] == action["action_hash"]]
    if any(a["verdict"] == "reject" for a in rel):
        return False, "The action was rejected"
    requester = (action.get("requested_by") or "").lower()
    approvers = {a["approver"].lower() for a in rel if a["verdict"] == "approve" and a["approver"].lower() != requester}
    need = action.get("required_approvals") or 1
    if len(approvers) < need:
        return False, f"Needs {need} approval(s) from people other than the requester; has {len(approvers)}"
    return True, None
