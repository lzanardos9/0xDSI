"""
Identity Datalake Phase 0: conservative, reversible identity resolution.

Pure stdlib so the resolver is replayable offline and identical in notebooks
and tests. Inputs are provider account records; outputs are canonical
identities, typed personas, provider cross-references and an append-only
decision log.

Order of authority: steward decision > authoritative cross-reference >
scoped deterministic match > probabilistic candidate (review only, never
auto-merged). Cannot-link constraints are checked against whole components
before every union, so a weak transitive chain cannot collapse identities.
"""

import hashlib
import json
import re
import uuid
from dataclasses import dataclass, field
from typing import Iterable, Optional

RESOLVER_VERSION = "identity-resolver-v1"
STATE_MAPPING_VERSION = "state-map-v1"
IDENTITY_NAMESPACE = uuid.uuid5(uuid.NAMESPACE_URL, "0xdsi://identity/canonical")

PRINCIPAL_TYPES = ("person", "workload", "agent")
PERSONA_TYPES = ("standard", "privileged", "contractor", "guest", "workload", "agent")
NORMALIZED_STATES = ("ENABLED", "SUSPENDED", "DISABLED", "LOCKED", "DELETED", "UNKNOWN")

PROVIDER_STATE_MAP = {
    "active_directory": {"enabled": "ENABLED", "disabled": "DISABLED", "locked": "LOCKED", "expired": "SUSPENDED"},
    "entra_id": {"true": "ENABLED", "enabled": "ENABLED", "false": "DISABLED", "disabled": "DISABLED", "blocked": "LOCKED"},
    "ping_directory": {"active": "ENABLED", "inactive": "DISABLED", "locked": "LOCKED", "suspended": "SUSPENDED"},
    "saviynt": {"active": "ENABLED", "1": "ENABLED", "inactive": "DISABLED", "0": "DISABLED", "suspended": "SUSPENDED"},
    "duo": {"active": "ENABLED", "bypass": "ENABLED", "disabled": "DISABLED", "locked out": "LOCKED", "pending deletion": "SUSPENDED"},
    "app_local": {"active": "ENABLED", "enabled": "ENABLED", "disabled": "DISABLED", "locked": "LOCKED"},
}

DETERMINISTIC_CONFIDENCE = {"steward_accept": 1.0, "authoritative_xref": 1.0, "employee_id": 0.97, "upn_same_tenant": 0.95}
REVIEW_THRESHOLD = 0.5
# A steward may override only the soft same-source constraint; these never yield.
HARD_CONSTRAINTS = {
    "principal_type_mismatch", "non_human_requires_authoritative_xref",
    "conflicting_employee_id", "conflicting_authoritative_record", "steward_rejected",
}


def _clean(value) -> str:
    return str(value).strip() if value is not None else ""


def source_account_key(provider: str, tenant: str, object_id: str) -> str:
    """Provider + tenant + immutable object id. Two tenants never collide."""
    parts = [_clean(provider).lower(), _clean(tenant).lower(), _clean(object_id).lower()]
    if not all(parts):
        raise ValueError("provider, tenant and object_id are all required")
    return ":".join(parts)


def normalize_state(provider: str, raw_state, deleted: bool = False) -> str:
    if deleted:
        return "DELETED"
    mapping = PROVIDER_STATE_MAP.get(_clean(provider).lower(), {})
    return mapping.get(_clean(raw_state).lower(), "UNKNOWN")


def normalize_name(name) -> str:
    return re.sub(r"[^a-z]", "", _clean(name).lower())


def _local_part(email) -> str:
    e = _clean(email).lower()
    return e.split("@", 1)[0] if "@" in e else ""


def _pair(a: str, b: str) -> tuple:
    return (a, b) if a <= b else (b, a)


@dataclass
class Account:
    provider: str
    tenant: str
    object_id: str
    principal_type: str = "person"
    persona_type: str = "standard"
    username: str = ""
    upn: str = ""
    email: str = ""
    employee_id: str = ""
    authoritative_person_id: str = ""
    display_name: str = ""
    department: str = ""
    manager: str = ""
    raw_state: str = ""
    deleted: bool = False
    owner: str = ""
    grc_application_id: str = ""
    runtime_host: str = ""
    registration_source: str = ""
    credential_fingerprint: str = ""
    credential_expires_at: str = ""
    last_seen: str = ""
    prior_canonical_id: str = ""

    @property
    def key(self) -> str:
        return source_account_key(self.provider, self.tenant, self.object_id)

    @property
    def normalized_state(self) -> str:
        return normalize_state(self.provider, self.raw_state, self.deleted)

    @staticmethod
    def from_record(rec: dict) -> "Account":
        known = Account.__dataclass_fields__.keys()
        acc = Account(**{k: rec[k] for k in known if k in rec and rec[k] is not None})
        acc.principal_type = _clean(acc.principal_type).lower() or "person"
        if acc.principal_type not in PRINCIPAL_TYPES:
            raise ValueError(f"unknown principal_type {acc.principal_type!r} for {acc.key}")
        acc.persona_type = _clean(acc.persona_type).lower() or "standard"
        if acc.principal_type != "person":
            acc.persona_type = acc.principal_type
        if acc.persona_type not in PERSONA_TYPES:
            raise ValueError(f"unknown persona_type {acc.persona_type!r} for {acc.key}")
        acc.deleted = bool(acc.deleted)
        return acc


@dataclass
class Decision:
    left_key: str
    right_key: str
    rule: str
    verdict: str  # ACCEPTED | REJECTED | REVIEW_REQUIRED | BLOCKED_CANNOT_LINK
    confidence: float
    features: dict = field(default_factory=dict)

    @property
    def decision_id(self) -> str:
        return str(uuid.uuid5(IDENTITY_NAMESPACE, f"decision:{self.left_key}|{self.right_key}|{self.rule}|{self.verdict}"))


def cannot_link(a: Account, b: Account) -> Optional[str]:
    """Reason two accounts must never share a canonical identity, else None."""
    if a.principal_type != b.principal_type:
        return "principal_type_mismatch"
    if a.principal_type != "person":
        if not (a.authoritative_person_id and a.authoritative_person_id == b.authoritative_person_id):
            return "non_human_requires_authoritative_xref"
    if a.employee_id and b.employee_id and a.employee_id != b.employee_id:
        return "conflicting_employee_id"
    if (a.authoritative_person_id and b.authoritative_person_id
            and a.authoritative_person_id != b.authoritative_person_id):
        return "conflicting_authoritative_record"
    if a.provider == b.provider and a.tenant == b.tenant and a.persona_type == b.persona_type:
        return "same_source_same_persona"
    return None


def _deterministic_links(accounts: list) -> list:
    links = []
    by_xref, by_emp, by_upn = {}, {}, {}
    for acc in accounts:
        if acc.authoritative_person_id:
            by_xref.setdefault(acc.authoritative_person_id, []).append(acc)
        if acc.employee_id and acc.principal_type == "person" and acc.persona_type != "guest":
            by_emp.setdefault(acc.employee_id, []).append(acc)
        if acc.upn and acc.principal_type == "person" and acc.persona_type != "guest":
            by_upn.setdefault((acc.tenant.lower(), acc.upn.lower()), []).append(acc)
    for rule, groups in (("authoritative_xref", by_xref), ("employee_id", by_emp), ("upn_same_tenant", by_upn)):
        for members in groups.values():
            anchor = members[0]
            for other in members[1:]:
                links.append((rule, anchor, other))
    return links


def _candidate_score(a: Account, b: Account) -> tuple:
    features = {}
    if normalize_name(a.display_name) and normalize_name(a.display_name) == normalize_name(b.display_name):
        features["same_display_name"] = 0.4
    if _local_part(a.email) and _local_part(a.email) == _local_part(b.email):
        features["same_email_local_part"] = 0.3
    if a.department and a.department.lower() == b.department.lower():
        features["same_department"] = 0.1
    if a.manager and a.manager.lower() == b.manager.lower():
        features["same_manager"] = 0.2
    return round(sum(features.values()), 3), features


def _probabilistic_candidates(accounts: list) -> list:
    blocks = {}
    for acc in accounts:
        if acc.principal_type != "person":
            continue
        for block_key in (("n", normalize_name(acc.display_name)), ("e", _local_part(acc.email))):
            if block_key[1]:
                blocks.setdefault(block_key, []).append(acc)
    seen, out = set(), []
    for members in blocks.values():
        for i, a in enumerate(members):
            for b in members[i + 1:]:
                pk = _pair(a.key, b.key)
                if pk in seen or a.key == b.key:
                    continue
                seen.add(pk)
                score, features = _candidate_score(a, b)
                if score >= REVIEW_THRESHOLD:
                    out.append((score, features, a, b))
    return out


class _Components:
    def __init__(self, keys):
        self.parent = {k: k for k in keys}
        self.members = {k: {k} for k in keys}

    def find(self, k):
        while self.parent[k] != k:
            self.parent[k] = self.parent[self.parent[k]]
            k = self.parent[k]
        return k

    def union(self, a, b):
        ra, rb = self.find(a), self.find(b)
        if ra == rb:
            return
        if len(self.members[ra]) < len(self.members[rb]):
            ra, rb = rb, ra
        self.parent[rb] = ra
        self.members[ra] |= self.members.pop(rb)


def _component_violation(comp: _Components, a_key, b_key, by_key, rejected) -> Optional[str]:
    for x in comp.members[comp.find(a_key)]:
        for y in comp.members[comp.find(b_key)]:
            if _pair(x, y) in rejected:
                return "steward_rejected"
            reason = cannot_link(by_key[x], by_key[y])
            if reason:
                return reason
    return None


def _assign_canonical_ids(groups: list, by_key: dict) -> tuple:
    """Keep prior canonical ids stable; record merges and splits as impact."""
    claimed, assignment, impact = {}, {}, []
    ordered = sorted(groups, key=lambda g: (-len(g), min(g)))
    for group in ordered:
        priors = {}
        for k in group:
            pid = by_key[k].prior_canonical_id
            if pid:
                priors[pid] = priors.get(pid, 0) + 1
        chosen = None
        for pid, _ in sorted(priors.items(), key=lambda kv: (-kv[1], kv[0])):
            if pid not in claimed:
                chosen = pid
                break
        if chosen is None:
            chosen = str(uuid.uuid5(IDENTITY_NAMESPACE, "canonical:" + min(group)))
            if chosen in claimed:
                chosen = str(uuid.uuid5(IDENTITY_NAMESPACE, "canonical:" + "|".join(sorted(group))))
        claimed[chosen] = group
        for pid in priors:
            if pid != chosen:
                kind = "split" if pid in claimed else "merge"
                impact.append({"kind": kind, "superseded_canonical_id": pid, "canonical_id": chosen,
                               "account_keys": sorted(k for k in group if by_key[k].prior_canonical_id == pid)})
        for k in group:
            assignment[k] = chosen
    return assignment, impact


def persona_id_for(canonical_id: str, persona_type: str) -> str:
    return str(uuid.uuid5(IDENTITY_NAMESPACE, f"persona:{canonical_id}:{persona_type}"))


def resolve(records: Iterable[dict], steward_decisions: Iterable[dict] = ()) -> dict:
    accounts = [Account.from_record(r) for r in records]
    by_key = {}
    for acc in accounts:
        if acc.key in by_key:
            raise ValueError(f"duplicate source account {acc.key}")
        by_key[acc.key] = acc

    accepted, rejected = [], set()
    for sd in steward_decisions:
        a, b = _clean(sd.get("left_key")).lower(), _clean(sd.get("right_key")).lower()
        if a not in by_key or b not in by_key:
            continue
        if _clean(sd.get("verdict")).lower() == "reject":
            rejected.add(_pair(a, b))
        elif _clean(sd.get("verdict")).lower() == "accept":
            accepted.append(("steward_accept", by_key[a], by_key[b]))

    comp = _Components(by_key.keys())
    decisions = []
    for rule, a, b in accepted + _deterministic_links(accounts):
        left, right = _pair(a.key, b.key)
        if (left, right) in rejected:
            continue
        violation = _component_violation(comp, a.key, b.key, by_key, rejected)
        if violation and (rule != "steward_accept" or violation in HARD_CONSTRAINTS):
            decisions.append(Decision(left, right, rule, "BLOCKED_CANNOT_LINK", DETERMINISTIC_CONFIDENCE[rule], {"reason": violation}))
            continue
        comp.union(a.key, b.key)
        decisions.append(Decision(left, right, rule, "ACCEPTED", DETERMINISTIC_CONFIDENCE[rule]))

    for score, features, a, b in _probabilistic_candidates(accounts):
        left, right = _pair(a.key, b.key)
        if comp.find(a.key) == comp.find(b.key):
            continue
        if (left, right) in rejected:
            decisions.append(Decision(left, right, "probabilistic", "REJECTED", score, features))
            continue
        reason = cannot_link(a, b)
        if reason:
            features = dict(features, reason=reason)
        decisions.append(Decision(left, right, "probabilistic", "REVIEW_REQUIRED", score, features))

    groups = [sorted(m) for m in comp.members.values()]
    assignment, impact = _assign_canonical_ids(groups, by_key)

    identities, personas, xrefs = {}, {}, []
    for k, acc in sorted(by_key.items()):
        cid = assignment[k]
        pid = persona_id_for(cid, acc.persona_type)
        ident = identities.setdefault(cid, {
            "canonical_id": cid, "principal_type": acc.principal_type, "display_name": "",
            "account_count": 0, "states": set(), "providers": set(), "personas": set(),
        })
        if not ident["display_name"] or (acc.persona_type == "standard" and acc.display_name):
            ident["display_name"] = acc.display_name or ident["display_name"] or acc.username
        ident["account_count"] += 1
        ident["states"].add(acc.normalized_state)
        ident["providers"].add(acc.provider)
        ident["personas"].add(acc.persona_type)
        personas.setdefault(pid, {"persona_id": pid, "canonical_id": cid, "persona_type": acc.persona_type, "account_count": 0})
        personas[pid]["account_count"] += 1
        xrefs.append({
            "account_key": k, "canonical_id": cid, "persona_id": pid,
            "provider": acc.provider, "tenant": acc.tenant, "provider_object_id": acc.object_id,
            "principal_type": acc.principal_type, "persona_type": acc.persona_type,
            "username": acc.username, "upn": acc.upn, "email": acc.email, "display_name": acc.display_name,
            "provider_state": _clean(acc.raw_state), "normalized_state": acc.normalized_state,
            "state_mapping_version": STATE_MAPPING_VERSION, "employee_id": acc.employee_id,
            "owner": acc.owner, "grc_application_id": acc.grc_application_id, "runtime_host": acc.runtime_host,
            "registration_source": acc.registration_source, "credential_fingerprint": acc.credential_fingerprint,
            "credential_expires_at": acc.credential_expires_at, "last_seen": acc.last_seen,
        })

    findings = _findings(identities, xrefs, decisions)
    resolution_version = hashlib.sha256(
        json.dumps(sorted((x["account_key"], x["canonical_id"]) for x in xrefs)).encode()
    ).hexdigest()[:16]

    for ident in identities.values():
        ident["states"] = sorted(ident["states"])
        ident["providers"] = sorted(ident["providers"])
        ident["personas"] = sorted(ident["personas"])
        ident["state_conflict"] = _has_state_conflict(ident["states"])

    return {
        "resolver_version": RESOLVER_VERSION,
        "resolution_version": resolution_version,
        "identities": sorted(identities.values(), key=lambda i: i["canonical_id"]),
        "personas": sorted(personas.values(), key=lambda p: p["persona_id"]),
        "xrefs": xrefs,
        "decisions": decisions,
        "impact": impact,
        "findings": findings,
    }


def _has_state_conflict(states) -> bool:
    s = set(states)
    return "ENABLED" in s and bool(s & {"DISABLED", "DELETED", "SUSPENDED"})


def _findings(identities: dict, xrefs: list, decisions: list) -> list:
    out = []
    for cid, ident in identities.items():
        if _has_state_conflict(ident["states"]):
            out.append({"finding_type": "state_conflict", "canonical_id": cid, "account_key": "",
                        "detail": "Account disabled in one directory but still enabled in another"})
    for x in xrefs:
        if x["principal_type"] in ("workload", "agent") and not x["grc_application_id"]:
            detail = "No GRC application link" + ("" if x["owner"] else " and no owner")
            out.append({"finding_type": "orphan_nhi" if not x["owner"] else "unlinked_nhi",
                        "canonical_id": x["canonical_id"], "account_key": x["account_key"], "detail": detail})
        if x["principal_type"] == "agent" and x["registration_source"] != "authoritative":
            out.append({"finding_type": "unverified_agent", "canonical_id": x["canonical_id"],
                        "account_key": x["account_key"], "detail": "Discovered agent; registration and owner not verified"})
        if x["normalized_state"] == "UNKNOWN":
            out.append({"finding_type": "unmapped_state", "canonical_id": x["canonical_id"],
                        "account_key": x["account_key"], "detail": f"Provider state {x['provider_state']!r} has no mapping"})
    for d in decisions:
        if d.verdict == "BLOCKED_CANNOT_LINK":
            out.append({"finding_type": "blocked_match", "canonical_id": "", "account_key": d.left_key,
                        "detail": f"{d.rule} match to {d.right_key} blocked: {d.features.get('reason')}"})
    for f in out:
        f["finding_id"] = str(uuid.uuid5(IDENTITY_NAMESPACE, f"finding:{f['finding_type']}:{f['canonical_id']}:{f['account_key']}"))
    return out


def reconcile_snapshot(previous_keys: Iterable[str], current_keys: Iterable[str], snapshot_complete: bool) -> dict:
    """Absence from an incomplete snapshot is not a deletion."""
    prev, cur = set(previous_keys), set(current_keys)
    missing = sorted(prev - cur)
    if snapshot_complete:
        return {"tombstoned": missing, "stale": []}
    return {"tombstoned": [], "stale": missing}
