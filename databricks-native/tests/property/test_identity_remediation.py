"""
Property tests for the Phase 4 remediation engine, on the sample people.

Run: python3 tests/property/test_identity_remediation.py
"""
import os
import sys
from datetime import datetime, timedelta

SHARED = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "notebooks", "_shared"))
sys.path.insert(0, SHARED)

import identity_access as A  # noqa: E402
import identity_federation as F  # noqa: E402
import identity_remediation as M  # noqa: E402
import identity_resolution as R  # noqa: E402
import identity_timeline as T  # noqa: E402
import identity_whatif as W  # noqa: E402
from identity_access_fixtures import EDGES, GROUPS, RESOURCES  # noqa: E402
from identity_event_fixtures import EVENTS  # noqa: E402
from identity_federation_fixtures import AS_OF, CHANGES, TRUSTS  # noqa: E402
from identity_fixtures import ACCOUNTS  # noqa: E402

RES = R.resolve(ACCOUNTS)
XREFS = RES["xrefs"]
LINKED = T.link_events(EVENTS, XREFS)["events"]
TL = T.timeline_findings(LINKED, XREFS)
MODEL = A.build_access_model(XREFS, RESOURCES, GROUPS, EDGES)
GG = F.guest_groups(MODEL, A.group_context(MODEL)["closure"])
FED = F.evaluate(TRUSTS, XREFS, AS_OF, A.leavers_from_events(LINKED), GG, CHANGES)["findings"]


def _propose(**kw):
    return M.propose(XREFS, RESOURCES, GROUPS, EDGES, LINKED, TL, RES["findings"], FED, None, "v1", **kw)


P = _propose()
BY_TITLE = {p["title"]: p for p in P}


def test_only_reversible_changes_are_proposed():
    assert P
    assert all(p["action_type"] in M.INVERSE for p in P)


def test_proposals_are_deterministic():
    again = _propose()
    assert [p["action_id"] for p in again] == [p["action_id"] for p in P]
    assert len({p["action_id"] for p in P}) == len(P)


def test_unnesting_noc_takes_rudi_to_zero_and_needs_two_approvers():
    p = BY_TITLE["Remove NOC-OnCall from Tier0-Operations"]
    rudi = next(s for s in p["impact"]["score_changes"] if s["display_name"].startswith("Rudi"))
    assert (rudi["score_before"], rudi["score_after"]) == (40, 0)
    assert p["required_approvals"] == 2 and p["status"] == "proposed"


def test_brian_leaver_findings_merge_into_one_action_per_account():
    brian = [p for p in P if p["display_name"] == "Brian McDonald" and p["action_type"] == "disable_account"]
    assert brian
    for p in brian:
        assert {r["finding_type"] for r in p["reasons"]} == {"leaver_access_remaining", "post_termination_activity"}


def test_lockout_blocks_the_proposal():
    blocked = [p for p in P if p["status"] == "blocked"]
    assert blocked
    assert all(p["impact"]["lockouts"] and "nobody" in p["blocked_reason"] for p in blocked)


def test_keith_sod_split_removes_vendor_duty():
    p = next(p for p in P if p["display_name"] == "Keith Murry" and "Vendor" in p["title"])
    assert p["reasons"][0]["finding_type"] == "sod_conflict"
    assert p["impact"]["summary"]["risk_points_removed"] == 20


def test_inverse_keeps_what_rollback_needs():
    c = {"type": "disable_account", "account": next(x["account_key"] for x in XREFS if x["normalized_state"] == "ENABLED")}
    before = M.before_state(c, MODEL)
    inv = M.inverse(c, before)
    assert inv["type"] == "enable_account" and inv["provider_state"] == before["provider_state"]
    take = BY_TITLE["Remove Helpdesk-Tier1's ability to take over adm-mbell"]["change"]
    tb = M.before_state(take, MODEL)
    assert M.inverse(take, tb)["type"] == "restore_takeover" and M.inverse(take, tb)["permissions"] == tb["permissions"]


def test_observed_and_precheck_detect_already_done_changes():
    change = BY_TITLE["Remove NOC-OnCall from Tier0-Operations"]["change"]
    assert not M.observed(change, XREFS, GROUPS, EDGES)
    assert M.precheck(change, XREFS, RESOURCES, GROUPS, EDGES)[0] == "ok"
    x1, g1, e1, applied, _ = W.apply_changes(XREFS, GROUPS, EDGES, [change])
    assert applied and M.observed(change, x1, g1, e1)
    assert M.precheck(change, x1, RESOURCES, g1, e1)[0] == "no_op"
    assert M.observed(M.inverse(change, {}), XREFS, GROUPS, EDGES)


def test_precheck_blocks_a_lockout_at_execution_time():
    blocked = next(p for p in P if p["status"] == "blocked")
    assert M.precheck(blocked["change"], XREFS, RESOURCES, GROUPS, EDGES)[0] == "blocked"


def test_approval_rule_excludes_requester_stale_hash_and_rejections():
    action = {"action_hash": "h1", "requested_by": "luiz@aa", "required_approvals": 2}
    ok = lambda who, h="h1", v="approve": {"approver": who, "action_hash": h, "verdict": v}  # noqa: E731
    assert not M.approvals_satisfied(action, [ok("luiz@aa"), ok("abhijit@aa")])[0]
    assert not M.approvals_satisfied(action, [ok("priya@aa"), ok("abhijit@aa", h="old")])[0]
    assert not M.approvals_satisfied(action, [ok("priya@aa"), ok("abhijit@aa"), ok("marcus@aa", v="reject")])[0]
    assert M.approvals_satisfied(action, [ok("priya@aa"), ok("abhijit@aa"), ok("Priya@aa")])[0]


def test_leases_expire_and_attempts_are_capped():
    now = datetime(2026, 10, 29, 7, 0)
    assert M.claimable({"status": "queued", "attempts": 0}, now)
    assert not M.claimable({"status": "leased", "attempts": 1, "lease_expires_at": now + timedelta(seconds=60)}, now)
    assert M.claimable({"status": "leased", "attempts": 1, "lease_expires_at": now - timedelta(seconds=1)}, now)
    assert not M.claimable({"status": "queued", "attempts": M.MAX_ATTEMPTS}, now)
    assert not M.claimable({"status": "done", "attempts": 1}, now)


def test_dry_run_records_and_live_without_connector_fails_closed():
    change = BY_TITLE["Remove NOC-OnCall from Tier0-Operations"]["change"]
    req = M.provider_request(change, "k1")
    assert req["command"] == "Remove-ADGroupMember" and req["idempotency_key"] == "k1"
    assert M.dispatch(req, "dry_run")["accepted"]
    try:
        M.dispatch(req, "live", {})
        raise AssertionError("live dispatch without a connector must fail")
    except M.ConnectorMissing:
        pass
    entra = M.provider_request({"type": "disable_account", "account": "entra_id:t:ent-1"}, "k2")
    assert entra["method"] == "PATCH" and entra["body"] == {"accountEnabled": False}


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    for t in tests:
        t()
        print(f"ok  {t.__name__}")
    print(f"{len(tests)} passed")
