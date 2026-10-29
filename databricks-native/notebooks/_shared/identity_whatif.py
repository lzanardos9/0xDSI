"""What-if simulation: apply proposed access changes to copies of the feeds, re-run the access engine, diff the outcome.

Nothing is written to any directory. The simulator only answers "what would change if we did this?".
"""
import hashlib
import json

from identity_access import (INACTIVE_STATES, _uid, attack_paths, build_access_model, departments_from_events,
                             group_context, leavers_from_events, ref_key, score_identities)

WHATIF_VERSION = "identity-whatif-v1"
MAX_CHANGES = 20
CHANGE_FIELDS = {
    "remove_membership": ("group", "member"),
    "revoke_grant": ("source", "resource_id"),
    "remove_takeover": ("source", "target"),
    "disable_account": ("account",),
    "delete_group": ("group",),
}


def validate_changes(changes) -> list:
    """Normalise a proposed change list. Raises ValueError with a readable reason."""
    if not isinstance(changes, list) or not changes:
        raise ValueError("a scenario needs at least one change")
    if len(changes) > MAX_CHANGES:
        raise ValueError(f"a scenario can hold at most {MAX_CHANGES} changes")
    out = []
    for i, c in enumerate(changes, 1):
        if not isinstance(c, dict) or c.get("type") not in CHANGE_FIELDS:
            raise ValueError(f"change {i}: type must be one of {', '.join(sorted(CHANGE_FIELDS))}")
        norm = {"type": c["type"]}
        for f in CHANGE_FIELDS[c["type"]]:
            v = str(c.get(f) or "").strip()
            if not v:
                raise ValueError(f"change {i}: '{f}' is required")
            norm[f] = v if f == "resource_id" else ref_key(v)
        if c["type"] == "revoke_grant" and c.get("permission"):
            norm["permission"] = str(c["permission"]).strip().lower()
        out.append(norm)
    return out


def scenario_hash(changes) -> str:
    return hashlib.sha256(json.dumps(validate_changes(changes), sort_keys=True).encode()).hexdigest()[:16]


def _describe(c, names) -> str:
    n = lambda k: names.get(k, k)
    t = c["type"]
    if t == "remove_membership":
        return f"Remove {n(c['member'])} from {n(c['group'])}"
    if t == "revoke_grant":
        perm = f" '{c['permission']}'" if c.get("permission") else ""
        return f"Revoke{perm} access to {n(c['resource_id'])} from {n(c['source'])}"
    if t == "remove_takeover":
        return f"Remove {n(c['source'])}'s ability to take over {n(c['target'])}"
    if t == "disable_account":
        return f"Disable account {n(c['account'])}"
    return f"Delete group {n(c['group'])}"


def _names(xrefs, resources, groups) -> dict:
    names = {r["resource_id"]: r["name"] for r in resources}
    for g in groups:
        try:
            names[ref_key(g)] = g["name"]
        except ValueError:
            pass
    for x in xrefs:
        names[x["account_key"]] = x.get("username") or x.get("display_name") or x["account_key"]
    return names


def _safe_key(ref):
    try:
        return ref_key(ref)
    except ValueError:
        return None


def apply_changes(xrefs, groups, edges, changes, names=None) -> tuple:
    """Return (xrefs, groups, edges, applied, rejected) with the changes applied to copies."""
    names = names or {}
    xrefs = [dict(x) for x in xrefs]
    groups = [dict(g, members=list(g.get("members") or [])) for g in groups]
    edges = [dict(e) for e in edges]
    acc_by = {x["account_key"]: x for x in xrefs}
    grp_by = {k: g for g in groups if (k := _safe_key(g))}
    applied, rejected = [], []

    for c in validate_changes(changes):
        t, hit = c["type"], 0
        if t == "disable_account" and c["account"] in acc_by:
            x = acc_by[c["account"]]
            hit = int(x.get("normalized_state") not in INACTIVE_STATES)
            x["normalized_state"] = "DISABLED"
        elif t == "remove_membership" and c["group"] in grp_by:
            g = grp_by[c["group"]]
            before = len(g["members"])
            g["members"] = [m for m in g["members"] if _safe_key(m) != c["member"]]
            hit = before - len(g["members"])
        elif t == "delete_group" and c["group"] in grp_by:
            groups.remove(grp_by.pop(c["group"]))
            for g in groups:
                g["members"] = [m for m in g["members"] if _safe_key(m) != c["group"]]
            kept = [e for e in edges if _safe_key(e.get("source")) != c["group"]]
            edges[:] = kept
            hit = 1
        elif t in ("revoke_grant", "remove_takeover"):
            def match(e):
                if _safe_key(e.get("source")) != c["source"]:
                    return False
                if t == "revoke_grant":
                    return (e.get("edge_type") == "grants" and str(e.get("target")) == c["resource_id"]
                            and (not c.get("permission") or str(e.get("permission") or "").lower() == c["permission"]))
                return e.get("edge_type") == "can_take_over" and _safe_key(e.get("target")) == c["target"]
            kept = [e for e in edges if not match(e)]
            hit = len(edges) - len(kept)
            edges[:] = kept
        entry = dict(c, description=_describe(c, names))
        if hit:
            applied.append(entry)
        else:
            rejected.append(dict(entry, reason="Nothing matched this change in the current access data"))
    return xrefs, groups, edges, applied, rejected


def _run(xrefs, resources, groups, edges, departments, leavers, timeline, id_findings, weights):
    model = build_access_model(xrefs, resources, groups, edges)
    paths = attack_paths(model)
    ctx = group_context(model, departments, leavers)
    scores = score_identities(model, paths, ctx["closure"], timeline, id_findings, None, weights)
    return model, paths, ctx, scores


def _path_row(p, model, display):
    return {"canonical_id": p["canonical_id"], "display_name": display.get(p["canonical_id"], p["canonical_id"]),
            "resource_id": p["resource_id"], "resource": model["resources"][p["resource_id"]]["name"],
            "permission": p["permission"], "hops": p["hops"], "via_takeover": p["via_takeover"],
            "steps": [s["label"] for s in p["steps"]]}


def simulate(xrefs, resources, groups, edges, changes, events=(), timeline_findings=(), identity_findings=(),
             weights=None) -> dict:
    """Run the access engine before and after the proposed changes and return an explainable diff."""
    departments, leavers = departments_from_events(events), leavers_from_events(events)
    names = _names(xrefs, resources, groups)
    args = (departments, leavers, timeline_findings, identity_findings, weights)
    m0, p0, c0, s0 = _run(xrefs, resources, groups, edges, *args)
    x1, g1, e1, applied, rejected = apply_changes(xrefs, groups, edges, changes, names)
    m1, p1, c1, s1 = _run(x1, resources, g1, e1, *args)

    display = {s["canonical_id"]: s["display_name"] for s in s0}
    before = {(p["canonical_id"], p["resource_id"]): p for p in p0}
    after = {(p["canonical_id"], p["resource_id"]): p for p in p1}
    removed = [_path_row(before[k], m0, display) for k in sorted(before.keys() - after.keys())]
    added = [_path_row(after[k], m1, display) for k in sorted(after.keys() - before.keys())]
    rerouted = []
    for k in sorted(before.keys() & after.keys()):
        old, new = _path_row(before[k], m0, display), _path_row(after[k], m1, display)
        if old["steps"] != new["steps"]:
            rerouted.append(dict(new, previous_steps=old["steps"]))

    s_after = {s["canonical_id"]: s for s in s1}
    score_changes = []
    for s in s0:
        a = s_after.get(s["canonical_id"])
        if not a:
            continue
        f0 = {f["factor"]: f for f in s["factors"]}
        f1 = {f["factor"]: f for f in a["factors"]}
        cleared = [f0[k]["label"] for k in sorted(f0.keys() - f1.keys())]
        new = [f1[k]["label"] for k in sorted(f1.keys() - f0.keys())]
        changed = [{"before": f0[k]["label"], "after": f1[k]["label"], "points_before": f0[k]["points"],
                    "points_after": f1[k]["points"]} for k in sorted(f0.keys() & f1.keys())
                   if f0[k]["points"] != f1[k]["points"] or f0[k]["label"] != f1[k]["label"]]
        if a["score"] != s["score"] or cleared or new or changed:
            score_changes.append({"canonical_id": s["canonical_id"], "display_name": s["display_name"],
                                  "principal_type": s["principal_type"], "score_before": s["score"],
                                  "score_after": a["score"], "delta": a["score"] - s["score"],
                                  "band_before": s["band"], "band_after": a["band"],
                                  "factors_cleared": cleared, "factors_added": new, "factors_changed": changed})
    score_changes.sort(key=lambda r: (r["delta"], r["display_name"]))

    memberships_lost = []
    for ak, chains in c0["closure"].items():
        lost = sorted(set(chains) - set(c1["closure"].get(ak, {})))
        x = m0["accounts"][ak]
        for gk in lost:
            g = m0["groups"][gk]
            memberships_lost.append({"canonical_id": x["canonical_id"],
                                     "display_name": display.get(x["canonical_id"], x["canonical_id"]),
                                     "account_key": ak, "username": x.get("username"), "group_key": gk,
                                     "group": g["name"], "privileged": g["privileged"], "direct": len(chains[gk]) == 1})
    memberships_lost.sort(key=lambda m: (m["display_name"], m["group"]))

    gname = {g["group_key"]: g["name"] for g in c0["groups"]}
    f_before = {f["finding_id"]: f for f in c0["findings"]}
    f_after = {f["finding_id"]: f for f in c1["findings"]}
    fmt = lambda f: {"finding_type": f["finding_type"], "severity": f["severity"], "group": gname.get(f["group_key"], f["group_key"]),
                     "detail": f["detail"]}
    findings_resolved = [fmt(f_before[k]) for k in sorted(f_before.keys() - f_after.keys())]
    findings_added = [fmt(f_after[k]) for k in sorted(f_after.keys() - f_before.keys())]

    # Lockout guard: a crown jewel that had at least one person path and would have none afterwards.
    def reachable_by_people(paths, model):
        out = {}
        for p in paths:
            if any(x["canonical_id"] == p["canonical_id"] and x.get("principal_type") == "person"
                   for x in model["accounts"].values()):
                out.setdefault(p["resource_id"], set()).add(p["canonical_id"])
        return out
    r0, r1 = reachable_by_people(p0, m0), reachable_by_people(p1, m1)
    lockouts = [{"resource_id": rid, "resource": m0["resources"][rid]["name"], "people_before": len(r0[rid])}
                for rid in sorted(r0) if not r1.get(rid)]

    affected = {r["canonical_id"] for r in score_changes} | {m["canonical_id"] for m in memberships_lost}
    summary = {
        "changes_applied": len(applied), "changes_rejected": len(rejected),
        "paths_before": len(p0), "paths_after": len(p1), "paths_removed": len(removed), "paths_added": len(added),
        "identities_affected": len(affected),
        "risk_points_removed": -sum(r["delta"] for r in score_changes if r["delta"] < 0),
        "risk_points_added": sum(r["delta"] for r in score_changes if r["delta"] > 0),
        "critical_before": sum(1 for s in s0 if s["band"] == "critical"),
        "critical_after": sum(1 for s in s1 if s["band"] == "critical"),
        "group_findings_resolved": len(findings_resolved), "group_findings_added": len(findings_added),
        "memberships_lost": len(memberships_lost), "lockouts": len(lockouts),
    }
    return {"version": WHATIF_VERSION, "applied": applied, "rejected": rejected, "summary": summary,
            "paths_removed": removed, "paths_added": added, "paths_rerouted": rerouted,
            "score_changes": score_changes, "memberships_lost": memberships_lost,
            "group_findings_resolved": findings_resolved, "group_findings_added": findings_added,
            "lockouts": lockouts}


def result_id(scenario_id, access_version) -> str:
    return _uid("whatif", scenario_id, access_version)
