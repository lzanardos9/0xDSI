"""
Identity access model, attack paths, group context and explainable risk (Phase 2).

Pure standard library so the scheduled job and the offline tests run the same
code. Inputs are the resolver's provider cross-references plus three feeds:
resources (with the crown-jewel flag), groups (members are account or group
references) and access edges (`grants` to a resource, `can_take_over` an account).
Every score is the sum of named factors with their evidence; nothing is opaque.
"""

import hashlib
import json
import uuid
from collections import deque

from identity_resolution import source_account_key

ACCESS_VERSION = "identity-access-v1"
RISK_VERSION = "identity-risk-v1"
_NS = uuid.uuid5(uuid.NAMESPACE_URL, "0xdsi://identity/access")

EDGE_TYPES = {"grants", "can_take_over"}
INACTIVE_STATES = {"DISABLED", "DELETED", "SUSPENDED"}

# Placeholder weights until the identity team agrees its own; override with risk_weights.json.
DEFAULT_WEIGHTS = {
    "version": "default-1",
    "crown_jewel_access": 15, "crown_jewel_cap": 45,
    "takeover_path": 20, "takeover_cap": 40,
    "privileged_via_standard_account": 15,
    "standing_privilege": 5, "standing_privilege_cap": 15,
    "timeline_high": 25, "timeline_medium": 10, "behaviour_cap": 50,
    "identity_finding": 10, "no_mfa": 10, "sod_conflict": 20,
    "inactive_account_in_group": 5, "hygiene_cap": 40,
}
BANDS = ((70, "critical"), (40, "high"), (20, "medium"), (0, "low"))

DEFAULT_SOD_RULES = (
    {"rule": "payments_approve_and_vendor_create", "resource_id": "res-sap-fi",
     "permissions": ("approve_payment", "create_vendor"), "label": "Approve payments and create vendors"},
)

GROUP_FINDING_SEVERITY = {
    "hidden_privilege_nesting": "high",
    "group_owner_departed": "high",
    "group_no_owner": "medium",
    "member_outside_purpose": "medium",
    "inactive_members": "low",
}
HYGIENE_FINDINGS = {"state_conflict", "orphan_nhi", "unlinked_nhi", "unverified_agent", "unmapped_state"}


def _uid(*parts) -> str:
    return str(uuid.uuid5(_NS, "|".join(str(p) for p in parts)))


def ref_key(ref) -> str:
    if isinstance(ref, dict):
        return source_account_key(ref.get("provider", ""), ref.get("tenant", ""), ref.get("object_id", ""))
    if isinstance(ref, str) and ref.count(":") >= 2 and all(ref.split(":", 2)):
        return ref.strip().lower()
    raise ValueError("reference must be {provider, tenant, object_id} or 'provider:tenant:object_id'")


def build_access_model(xrefs, resources, groups, edges) -> dict:
    """Validate the feeds and build the directed access graph. Bad rows are counted, not guessed."""
    accounts = {x["account_key"]: x for x in xrefs}
    quarantined = {"resources": 0, "groups": 0, "edges": 0, "members": 0}

    res = {}
    for r in resources:
        rid = str(r.get("resource_id", "")).strip()
        if not rid or not str(r.get("name", "")).strip():
            quarantined["resources"] += 1
            continue
        res[rid] = {"resource_id": rid, "name": str(r["name"]).strip(), "crown_jewel": bool(r.get("crown_jewel")),
                    "tier": str(r.get("tier") or ""), "owner": str(r.get("owner") or ""),
                    "description": str(r.get("description") or "")}

    grp = {}
    for g in groups:
        try:
            key = source_account_key(g.get("provider", ""), g.get("tenant", ""), g.get("object_id", ""))
        except ValueError:
            quarantined["groups"] += 1
            continue
        if not str(g.get("name", "")).strip():
            quarantined["groups"] += 1
            continue
        grp[key] = {"group_key": key, "provider": g["provider"], "tenant": g["tenant"], "object_id": g["object_id"],
                    "name": str(g["name"]).strip(), "owner": str(g.get("owner") or "").strip(),
                    "purpose": str(g.get("purpose") or ""), "department": str(g.get("department") or ""),
                    "privileged": bool(g.get("privileged")), "raw_members": g.get("members") or []}

    out = {}
    edge_rows = []

    def add(src, etype, dst, perm=""):
        out.setdefault(src, []).append((etype, dst, perm))
        s_kind, s_id = src.split(":", 1)
        d_kind, d_id = dst.split(":", 1)
        edge_rows.append({"edge_id": _uid("edge", src, etype, dst, perm), "source_id": s_id, "source_kind": s_kind,
                          "edge_type": etype, "target_id": d_id, "target_kind": d_kind, "permission": perm})

    for key, g in grp.items():
        g["child_groups"], g["direct_accounts"] = [], []
        for m in g.pop("raw_members"):
            try:
                mk = ref_key(m)
            except ValueError:
                quarantined["members"] += 1
                continue
            if mk in grp and mk != key:
                g["child_groups"].append(mk)
                add(f"g:{mk}", "nested_in", f"g:{key}")
            elif mk in accounts:
                g["direct_accounts"].append(mk)
                add(f"a:{mk}", "member_of", f"g:{key}")
            else:
                quarantined["members"] += 1
    for g in grp.values():
        g["parent_groups"] = sorted(k for k, p in grp.items() if g["group_key"] in p["child_groups"])

    for e in edges:
        etype = str(e.get("edge_type", "")).strip()
        try:
            src = ref_key(e.get("source"))
        except ValueError:
            quarantined["edges"] += 1
            continue
        s_node = f"g:{src}" if src in grp else f"a:{src}" if src in accounts else None
        perm = str(e.get("permission") or "").strip().lower()
        if etype == "grants" and s_node and str(e.get("target", "")) in res:
            add(s_node, "grants", f"r:{e['target']}", perm)
        elif etype == "can_take_over" and s_node:
            try:
                dst = ref_key(e.get("target"))
            except ValueError:
                dst = ""
            if dst in accounts:
                add(s_node, "can_take_over", f"a:{dst}", perm)
            else:
                quarantined["edges"] += 1
        else:
            quarantined["edges"] += 1

    for adj in out.values():
        adj.sort()
    for g in grp.values():
        g["child_groups"].sort()
        g["direct_accounts"].sort()
    edge_rows = sorted({r["edge_id"]: r for r in edge_rows}.values(), key=lambda r: r["edge_id"])
    return {"accounts": accounts, "resources": res, "groups": grp, "out": out, "edges": edge_rows,
            "quarantined": quarantined}


def _group_closure(model) -> dict:
    """account_key -> {group_key: [group chain from the direct group to this one]} via membership and nesting only."""
    closure = {}
    for akey in model["accounts"]:
        seen = {}
        q = deque()
        for etype, dst, _ in model["out"].get(f"a:{akey}", []):
            if etype == "member_of":
                gk = dst[2:]
                if gk not in seen:
                    seen[gk] = [gk]
                    q.append(gk)
        while q:
            gk = q.popleft()
            for etype, dst, _ in model["out"].get(f"g:{gk}", []):
                if etype == "nested_in" and dst[2:] not in seen:
                    seen[dst[2:]] = seen[gk] + [dst[2:]]
                    q.append(dst[2:])
        if seen:
            closure[akey] = seen
    return closure


def _label(model, node) -> str:
    kind, key = node.split(":", 1)
    if kind == "r":
        return model["resources"][key]["name"]
    if kind == "g":
        return model["groups"][key]["name"]
    if kind == "a":
        x = model["accounts"][key]
        return x.get("username") or x.get("display_name") or x.get("provider_object_id") or key
    return key


def attack_paths(model) -> list:
    """Shortest path from every canonical identity's active accounts to every reachable crown jewel."""
    by_cid = {}
    for x in model["accounts"].values():
        if x.get("normalized_state") not in INACTIVE_STATES and x.get("normalized_state") != "UNKNOWN":
            by_cid.setdefault(x["canonical_id"], []).append(x["account_key"])
    jewels = {k for k, r in model["resources"].items() if r["crown_jewel"]}
    paths = []
    for cid, akeys in sorted(by_cid.items()):
        prev = {}
        q = deque()
        for ak in sorted(akeys):
            prev[f"a:{ak}"] = (None, "has_account", "")
            q.append(f"a:{ak}")
        while q:
            node = q.popleft()
            for etype, dst, perm in model["out"].get(node, []):
                if dst in prev:
                    continue
                if dst.startswith("a:") and model["accounts"][dst[2:]].get("normalized_state") in INACTIVE_STATES:
                    continue
                prev[dst] = (node, etype, perm)
                if not dst.startswith("r:"):
                    q.append(dst)
        for rid in sorted(jewels):
            node = f"r:{rid}"
            if node not in prev:
                continue
            steps = []
            while node:
                parent, etype, perm = prev[node]
                kind = {"a": "account", "g": "group", "r": "resource"}[node[0]]
                step = {"kind": kind, "id": node[2:], "label": _label(model, node), "edge": etype, "permission": perm}
                if kind == "account":
                    step["persona_type"] = model["accounts"][node[2:]].get("persona_type", "")
                steps.append(step)
                node = parent
            steps.reverse()
            takeover = any(s["edge"] == "can_take_over" for s in steps)
            paths.append({"path_id": _uid("path", cid, rid, *[s["id"] for s in steps]), "canonical_id": cid,
                          "resource_id": rid, "hops": len(steps) - 1, "via_takeover": takeover,
                          "permission": steps[-1]["permission"], "steps": steps})
    return paths


def departments_from_events(events) -> dict:
    dept = {}
    for e in sorted(events, key=lambda e: e["occurred_at"]):
        cid, d = e.get("canonical_id"), e.get("detail") or {}
        if not cid:
            continue
        if e["event_type"] in ("hr_joiner", "hr_rehire") and d.get("department"):
            dept[cid] = d["department"]
        elif e["event_type"] == "hr_mover" and d.get("to_department"):
            dept[cid] = d["to_department"]
    return dept


def leavers_from_events(events) -> set:
    last = {}
    for e in sorted(events, key=lambda e: e["occurred_at"]):
        if e.get("canonical_id") and e["event_type"] in ("hr_leaver", "hr_rehire"):
            last[e["canonical_id"]] = e["event_type"]
    return {cid for cid, t in last.items() if t == "hr_leaver"}


def _owner_status(owner, email_to_cid, leavers) -> tuple:
    if not owner:
        return "none", None
    if "@" not in owner:
        return "team", None
    cids = email_to_cid.get(owner.lower(), set())
    if len(cids) != 1:
        return "unresolved", None
    cid = next(iter(cids))
    return ("departed" if cid in leavers else "active"), cid


def group_context(model, departments=None, leavers=None) -> dict:
    """Per-group effective membership, nesting, grants, owner status and findings."""
    departments, leavers = departments or {}, leavers or set()
    closure = _group_closure(model)
    email_to_cid = {}
    for x in model["accounts"].values():
        if x.get("principal_type") == "person" and x.get("email"):
            email_to_cid.setdefault(x["email"].lower(), set()).add(x["canonical_id"])

    def depth(gk, seen=()):
        parents = model["groups"][gk]["parent_groups"]
        return 0 if not parents or gk in seen else 1 + max(depth(p, seen + (gk,)) for p in parents)

    out_groups, members, findings = [], [], []
    for gk, g in sorted(model["groups"].items()):
        grants = sorted(({"resource_id": d[2:], "resource": model["resources"][d[2:]]["name"],
                          "crown_jewel": model["resources"][d[2:]]["crown_jewel"], "permission": p}
                         for t, d, p in model["out"].get(f"g:{gk}", []) if t == "grants"), key=lambda r: r["resource_id"])
        takeovers = sorted({_label(model, d) for t, d, _ in model["out"].get(f"g:{gk}", []) if t == "can_take_over"})
        eff = []
        for ak, chains in closure.items():
            if gk in chains:
                x = model["accounts"][ak]
                chain = chains[gk]
                eff.append({"membership_id": _uid("member", gk, ak), "group_key": gk, "account_key": ak,
                            "canonical_id": x["canonical_id"], "display_name": x.get("display_name") or x.get("username"),
                            "username": x.get("username"), "principal_type": x.get("principal_type"),
                            "persona_type": x.get("persona_type"), "normalized_state": x.get("normalized_state"),
                            "department": departments.get(x["canonical_id"], ""), "direct": len(chain) == 1,
                            "via": [model["groups"][c]["name"] for c in chain[:-1]]})
        eff.sort(key=lambda m: (not m["direct"], m["display_name"] or ""))
        members.extend(eff)
        status, owner_cid = _owner_status(g["owner"], email_to_cid, leavers)

        def finding(ftype, detail, evidence):
            findings.append({"finding_id": _uid("gfind", ftype, gk), "group_key": gk, "finding_type": ftype,
                             "severity": GROUP_FINDING_SEVERITY[ftype], "detail": detail, "evidence": sorted(evidence)})

        if status == "none":
            finding("group_no_owner", f"{g['name']} has no owner of record"
                    + (" and controls privileged access" if g["privileged"] or takeovers else ""), [])
        elif status == "departed":
            finding("group_owner_departed", f"Owner {g['owner']} has left the company; {g['name']} needs a new owner", [g["owner"]])
        if not g["privileged"]:
            priv_parents = [model["groups"][p] for p in g["parent_groups"] if model["groups"][p]["privileged"]]
            if priv_parents:
                names = ", ".join(sorted(p["name"] for p in priv_parents))
                finding("hidden_privilege_nesting",
                        f"{g['name']} is not marked privileged but is nested in {names}; its {len(eff)} member(s) inherit that access",
                        [p["group_key"] for p in priv_parents])
        if g["department"]:
            outside = [m for m in eff if m["direct"] and m["principal_type"] == "person" and m["department"]
                       and m["department"].lower() != g["department"].lower()]
            if outside:
                who = ", ".join(sorted(f"{m['display_name']} ({m['department']})" for m in outside))
                finding("member_outside_purpose", f"Members outside {g['department']}: {who}", [m["account_key"] for m in outside])
        inactive = [m for m in eff if m["normalized_state"] in INACTIVE_STATES]
        if inactive:
            finding("inactive_members", f"{len(inactive)} disabled or deleted account(s) still in the group: "
                    + ", ".join(sorted(m["username"] or m["account_key"] for m in inactive)), [m["account_key"] for m in inactive])

        out_groups.append({
            "group_key": gk, "provider": g["provider"], "tenant": g["tenant"], "object_id": g["object_id"],
            "name": g["name"], "owner": g["owner"], "owner_status": status, "owner_canonical_id": owner_cid,
            "purpose": g["purpose"], "department": g["department"], "privileged": g["privileged"],
            "direct_member_count": len(g["direct_accounts"]) + len(g["child_groups"]),
            "effective_member_count": len(eff), "nesting_depth": depth(gk),
            "parent_groups": [model["groups"][p]["name"] for p in g["parent_groups"]],
            "child_groups": sorted(model["groups"][c]["name"] for c in g["child_groups"]),
            "grants": grants, "can_take_over": takeovers,
        })
    return {"groups": out_groups, "members": members, "findings": sorted(findings, key=lambda f: f["finding_id"]),
            "closure": closure}


def _held_permissions(model, closure, akeys) -> dict:
    held = {}
    for ak in akeys:
        sources = [f"a:{ak}"] + [f"g:{g}" for g in closure.get(ak, {})]
        for s in sources:
            for t, d, p in model["out"].get(s, []):
                if t == "grants":
                    held.setdefault(d[2:], set()).add(p)
    return held


def band_for(score: int) -> str:
    return next(b for floor, b in BANDS if score >= floor)


def score_identities(model, paths, closure, timeline_findings=(), identity_findings=(),
                     prior_scores=None, weights=None, sod_rules=DEFAULT_SOD_RULES) -> list:
    """Explainable 0-100 score per canonical identity: exposure + behaviour + hygiene, each capped."""
    w = dict(DEFAULT_WEIGHTS, **(weights or {}))
    prior_scores = prior_scores or {}
    by_cid = {}
    for x in model["accounts"].values():
        by_cid.setdefault(x["canonical_id"], []).append(x)
    paths_by = {}
    for p in paths:
        paths_by.setdefault(p["canonical_id"], []).append(p)
    tl_by, id_by = {}, {}
    for f in timeline_findings:
        if f.get("status", "open") == "open":
            tl_by.setdefault(f["canonical_id"], []).append(f)
    for f in identity_findings:
        if f.get("canonical_id") and f["finding_type"] in HYGIENE_FINDINGS and f.get("status", "open") == "open":
            id_by.setdefault(f["canonical_id"], []).append(f)

    def jewel(rid):
        return model["resources"][rid]["name"]

    scores = []
    for cid, accts in sorted(by_cid.items()):
        active = [x for x in accts if x.get("normalized_state") not in INACTIVE_STATES]
        factors = []

        def add(factor, category, points, label, evidence):
            if points:
                factors.append({"factor": factor, "category": category, "points": points, "label": label,
                                "evidence": evidence})

        mine = paths_by.get(cid, [])
        direct = [p for p in mine if not p["via_takeover"]]
        takeover = [p for p in mine if p["via_takeover"]]
        add("crown_jewel_access", "exposure", min(w["crown_jewel_cap"], w["crown_jewel_access"] * len(direct)),
            f"Can reach {len(direct)} crown-jewel system(s)",
            [f"{jewel(p['resource_id'])} ({p['permission'] or 'access'}) via " + " > ".join(s["label"] for s in p["steps"][1:-1] or [p["steps"][0]]) for p in direct])
        add("takeover_path", "exposure", min(w["takeover_cap"], w["takeover_path"] * len(takeover)),
            f"Can take over another account to reach {len(takeover)} crown-jewel system(s)",
            [" > ".join(s["label"] for s in p["steps"]) for p in takeover])

        priv_groups, priv_on_standard = set(), set()
        for x in active:
            for gk in closure.get(x["account_key"], {}):
                g = model["groups"][gk]
                if g["privileged"]:
                    priv_groups.add(g["name"])
                    if x.get("principal_type") == "person" and x.get("persona_type") == "standard":
                        priv_on_standard.add(f"{x.get('username')} in {g['name']}")
        add("privileged_via_standard_account", "exposure", w["privileged_via_standard_account"] if priv_on_standard else 0,
            "Everyday account holds privileged access", sorted(priv_on_standard))
        add("standing_privilege", "exposure", min(w["standing_privilege_cap"], w["standing_privilege"] * len(priv_groups)),
            f"Standing member of {len(priv_groups)} privileged group(s)", sorted(priv_groups))

        held = _held_permissions(model, closure, [x["account_key"] for x in active])
        for rule in sod_rules:
            if set(rule["permissions"]) <= held.get(rule["resource_id"], set()):
                add("sod_conflict", "hygiene", w["sod_conflict"], f"Toxic combination: {rule['label']}",
                    [f"{rule['resource_id']}: {', '.join(rule['permissions'])}"])

        tl = tl_by.get(cid, [])
        high = [f for f in tl if f["severity"] == "high"]
        med = [f for f in tl if f["severity"] == "medium"]
        behaviour = min(w["behaviour_cap"], w["timeline_high"] * len(high) + w["timeline_medium"] * len(med))
        add("timeline_findings", "behaviour", behaviour, f"{len(tl)} open timeline finding(s)",
            [f"{f['severity']}: {f['detail']}" for f in high + med])

        idf = id_by.get(cid, [])
        add("identity_findings", "hygiene", w["identity_finding"] * len(idf), f"{len(idf)} identity hygiene finding(s)",
            [f"{f['finding_type']}: {f['detail']}" for f in idf])
        home = [x for x in active if x.get("persona_type") != "guest"]
        if accts[0].get("principal_type") == "person" and home and not any(
                x["provider"] == "duo" and x.get("normalized_state") == "ENABLED" for x in accts):
            add("no_mfa", "hygiene", w["no_mfa"], "No active MFA enrolment found", [])
        stale = sorted({f"{x.get('username')} in {model['groups'][g]['name']}" for x in accts
                        if x.get("normalized_state") in INACTIVE_STATES for g in closure.get(x["account_key"], {})})
        add("inactive_account_in_group", "hygiene", min(2 * w["inactive_account_in_group"], w["inactive_account_in_group"] * len(stale)),
            "Disabled account still holds group memberships", stale)

        totals = {c: sum(f["points"] for f in factors if f["category"] == c) for c in ("exposure", "behaviour", "hygiene")}
        totals["hygiene"] = min(w["hygiene_cap"], totals["hygiene"])
        score = min(100, sum(totals.values()))
        prev = prior_scores.get(cid)
        names = sorted({x.get("display_name") or x.get("username") or "" for x in accts} - {""})
        scores.append({"canonical_id": cid, "display_name": names[0] if names else cid,
                       "principal_type": accts[0].get("principal_type"), "score": score, "band": band_for(score),
                       "exposure": totals["exposure"], "behaviour": totals["behaviour"], "hygiene": totals["hygiene"],
                       "previous_score": prev, "delta": None if prev is None else score - prev,
                       "factors": sorted(factors, key=lambda f: -f["points"]), "weights_version": str(w["version"])})
    return sorted(scores, key=lambda s: (-s["score"], s["canonical_id"]))


def access_version(model) -> str:
    digest = hashlib.sha256(json.dumps([e["edge_id"] for e in model["edges"]] + sorted(model["resources"]),
                                       sort_keys=True).encode()).hexdigest()[:16]
    return f"{ACCESS_VERSION}:{digest}"
