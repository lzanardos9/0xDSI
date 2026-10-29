"""
Property tests for Identity Datalake Phase 0 resolution (identity_resolution.py).

Pins the exit-gate behaviors: deterministic replay, duplicate names stay
separate, rehire with a reused employee id is blocked, cross-tenant guests are
review-only, personas stay distinct under one person, non-human identities
never merge without an authoritative link, merges/splits keep prior canonical
ids and report impact, and an incomplete snapshot never tombstones accounts.

Run:  python3 databricks-native/tests/property/test_identity_resolution.py
"""

import os
import random
import sys

SHARED = os.path.join(os.path.dirname(__file__), "..", "..", "notebooks", "_shared")
sys.path.insert(0, os.path.abspath(SHARED))

import identity_resolution as R  # noqa: E402
from identity_fixtures import ACCOUNTS  # noqa: E402


def _key(provider, tenant, oid):
    return R.source_account_key(provider, tenant, oid)


def _cid(result, account_key):
    return next(x["canonical_id"] for x in result["xrefs"] if x["account_key"] == account_key)


BASE = R.resolve(ACCOUNTS)
AD = "corp.aa.example"


def test_replay_in_any_order_is_identical():
    shuffled = list(ACCOUNTS)
    random.Random(7).shuffle(shuffled)
    again = R.resolve(shuffled)
    assert again["resolution_version"] == BASE["resolution_version"]
    assert again["identities"] == BASE["identities"]


def test_tenants_never_collide():
    assert _key("entra_id", "a", "x") != _key("entra_id", "b", "x")


def test_missing_key_part_is_rejected():
    try:
        R.source_account_key("entra_id", "", "x")
    except ValueError:
        return
    raise AssertionError("empty tenant accepted")


def test_person_links_across_providers_with_separate_personas():
    std = _cid(BASE, _key("active_directory", AD, "ad-0001"))
    adm = _cid(BASE, _key("active_directory", AD, "ad-0002"))
    ent = _cid(BASE, _key("entra_id", "aa-entra-tenant", "ent-0001"))
    assert std == adm == ent
    personas = {x["persona_id"] for x in BASE["xrefs"] if x["canonical_id"] == std}
    assert len(personas) == 2


def test_duplicate_names_stay_separate():
    a = _cid(BASE, _key("active_directory", AD, "ad-0201"))
    b = _cid(BASE, _key("active_directory", AD, "ad-0202"))
    local = _cid(BASE, _key("app_local", "crew-portal", "crew-0201"))
    assert len({a, b, local}) == 3


def test_name_only_match_goes_to_review_never_auto_merge():
    reviews = [d for d in BASE["decisions"] if d.verdict == "REVIEW_REQUIRED"]
    assert reviews
    assert all(d.rule == "probabilistic" for d in reviews)


def test_rehire_with_reused_employee_id_is_blocked():
    old = _cid(BASE, _key("active_directory", AD, "ad-0301"))
    new = _cid(BASE, _key("saviynt", "saviynt-prod", "sav-0302"))
    assert old != new
    assert any(f["finding_type"] == "blocked_match" for f in BASE["findings"])


def test_cross_tenant_guest_is_not_merged():
    guest = _cid(BASE, _key("entra_id", "aa-partner-tenant", "ent-guest-01"))
    assert guest != _cid(BASE, _key("active_directory", AD, "ad-0001"))


def test_renamed_user_keeps_one_identity():
    assert _cid(BASE, _key("active_directory", AD, "ad-0101")) == _cid(BASE, _key("entra_id", "aa-entra-tenant", "ent-0101"))


def test_disabled_vs_active_is_a_visible_conflict():
    cid = _cid(BASE, _key("active_directory", AD, "ad-0401"))
    ident = next(i for i in BASE["identities"] if i["canonical_id"] == cid)
    assert ident["state_conflict"] is True


def test_unknown_provider_state_is_not_invented():
    assert R.normalize_state("ping_directory", "pending_review") == "UNKNOWN"
    assert any(f["finding_type"] == "unmapped_state" for f in BASE["findings"])


def test_non_humans_never_merge_without_authoritative_xref():
    a = R.Account.from_record({"provider": "entra_id", "tenant": "t", "object_id": "1", "principal_type": "workload",
                               "employee_id": "X1", "display_name": "svc"})
    b = R.Account.from_record({"provider": "active_directory", "tenant": "t2", "object_id": "2",
                               "principal_type": "workload", "employee_id": "X1", "display_name": "svc"})
    assert R.cannot_link(a, b) == "non_human_requires_authoritative_xref"


def test_orphan_and_unverified_agent_findings():
    kinds = {f["finding_type"] for f in BASE["findings"]}
    assert {"orphan_nhi", "unlinked_nhi", "unverified_agent"} <= kinds


def test_steward_reject_splits_and_reports_impact():
    prior = [dict(r, prior_canonical_id=_cid(BASE, R.source_account_key(r["provider"], r["tenant"], r["object_id"])))
             for r in ACCOUNTS]
    left = _key("active_directory", AD, "ad-0101")
    right = _key("entra_id", "aa-entra-tenant", "ent-0101")
    after = R.resolve(prior, [{"left_key": left, "right_key": right, "verdict": "reject"}])
    assert _cid(after, left) != _cid(after, right)
    assert _cid(BASE, left) in {_cid(after, left), _cid(after, right)}
    assert any(i["kind"] == "split" for i in after["impact"])


def test_steward_accept_merges_and_keeps_a_prior_id():
    prior = [dict(r, prior_canonical_id=_cid(BASE, R.source_account_key(r["provider"], r["tenant"], r["object_id"])))
             for r in ACCOUNTS]
    duo = _key("duo", "duo-prod", "duo-0001")
    ad = _key("active_directory", AD, "ad-0001")
    after = R.resolve(prior, [{"left_key": duo, "right_key": ad, "verdict": "accept"}])
    assert _cid(after, duo) == _cid(after, ad) == _cid(BASE, ad)
    assert any(i["kind"] == "merge" for i in after["impact"])


def test_steward_cannot_override_hard_constraints():
    old = _key("active_directory", AD, "ad-0301")
    new = _key("saviynt", "saviynt-prod", "sav-0302")
    after = R.resolve(ACCOUNTS, [{"left_key": old, "right_key": new, "verdict": "accept"}])
    assert _cid(after, old) != _cid(after, new)


def test_stable_ids_across_reruns():
    prior = [dict(r, prior_canonical_id=_cid(BASE, R.source_account_key(r["provider"], r["tenant"], r["object_id"])))
             for r in ACCOUNTS]
    assert R.resolve(prior)["resolution_version"] == BASE["resolution_version"]


def test_incomplete_snapshot_never_tombstones():
    assert R.reconcile_snapshot({"a", "b"}, {"a"}, snapshot_complete=False) == {"tombstoned": [], "stale": ["b"]}
    assert R.reconcile_snapshot({"a", "b"}, {"a"}, snapshot_complete=True) == {"tombstoned": ["b"], "stale": []}


def test_duplicate_source_account_rejected():
    try:
        R.resolve([ACCOUNTS[0], ACCOUNTS[0]])
    except ValueError:
        return
    raise AssertionError("duplicate account accepted")


if __name__ == "__main__":
    failed = 0
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            try:
                fn()
                print(f"PASS {name}")
            except Exception as e:  # noqa: BLE001
                failed += 1
                print(f"FAIL {name}: {e!r}")
    print(f"\n{'FAILED' if failed else 'OK'} ({failed} failed)")
    raise SystemExit(1 if failed else 0)
