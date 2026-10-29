"""
Property tests for the Phase 3 what-if simulator, on the sample people.

Run: python3 tests/property/test_identity_whatif.py
"""
import os
import sys

SHARED = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "notebooks", "_shared"))
sys.path.insert(0, SHARED)

import identity_resolution as R  # noqa: E402
import identity_timeline as T  # noqa: E402
import identity_whatif as W  # noqa: E402
from identity_access_fixtures import EDGES, GROUPS, RESOURCES  # noqa: E402
from identity_event_fixtures import EVENTS  # noqa: E402
from identity_fixtures import ACCOUNTS  # noqa: E402
from identity_whatif_fixtures import SCENARIOS  # noqa: E402

RES = R.resolve(ACCOUNTS)
XREFS = RES["xrefs"]
LINKED = T.link_events(EVENTS, XREFS)
TL = T.timeline_findings(LINKED["events"], XREFS)
SC = {s["scenario_id"]: s for s in SCENARIOS}


def _sim(changes):
    return W.simulate(XREFS, RESOURCES, GROUPS, EDGES, changes, LINKED["events"], TL, RES["findings"])


def _change(result, name):
    return next(c for c in result["score_changes"] if c["display_name"] == name)


def test_unnest_noc_clears_rudi():
    r = _sim(SC["wi-unnest-noc"]["changes"])
    assert [(p["display_name"], p["resource_id"]) for p in r["paths_removed"]] == [("Rudi Himawan", "res-dc")]
    rudi = _change(r, "Rudi Himawan")
    assert rudi["score_before"] == 40 and rudi["score_after"] == 0
    assert [f["finding_type"] for f in r["group_findings_resolved"]] == ["hidden_privilege_nesting"]
    assert r["summary"]["lockouts"] == 0


def test_helpdesk_takeover_removed_clears_blessy():
    r = _sim(SC["wi-helpdesk-takeover"]["changes"])
    assert len(r["paths_removed"]) == 1 and r["paths_removed"][0]["via_takeover"]
    assert _change(r, "Blessy Baby")["score_after"] == 0


def test_keith_sod_split_drops_out_of_critical():
    r = _sim(SC["wi-keith-sod"]["changes"])
    keith = _change(r, "Keith Murry")
    assert keith["delta"] == -20 and keith["band_after"] != "critical"
    assert any("Toxic combination" in f for f in keith["factors_cleared"])
    assert r["summary"]["critical_after"] == r["summary"]["critical_before"] - 1


def test_brian_offboarding_clears_inactive_member_finding():
    r = _sim(SC["wi-offboard-brian"]["changes"])
    assert r["summary"]["changes_applied"] == 2 and not r["rejected"]
    assert "inactive_members" in [f["finding_type"] for f in r["group_findings_resolved"]]


def test_deleting_domain_admins_warns_of_lockout():
    r = _sim(SC["wi-drop-domain-admins"]["changes"])
    assert [l["resource_id"] for l in r["lockouts"]] == ["res-dc"]
    assert r["summary"]["paths_removed"] == 3


def test_feeds_are_not_mutated():
    snap = (repr(XREFS), repr(GROUPS), repr(EDGES))
    for s in SCENARIOS:
        _sim(s["changes"])
    assert snap == (repr(XREFS), repr(GROUPS), repr(EDGES))


def test_unmatched_change_is_rejected_not_guessed():
    r = _sim([{"type": "revoke_grant", "source": "active_directory:corp.aa.example:grp-noc-oncall",
               "resource_id": "res-dc"}])
    assert r["summary"]["changes_applied"] == 0 and len(r["rejected"]) == 1
    assert r["summary"]["paths_removed"] == 0 and not r["score_changes"]


def test_validation_rejects_bad_input():
    for bad in ([], [{"type": "drop_table"}], [{"type": "disable_account"}], [{"type": "disable_account", "account": "x"}],
                [{"type": "disable_account", "account": "a:b:c"}] * (W.MAX_CHANGES + 1)):
        try:
            W.validate_changes(bad)
        except ValueError:
            continue
        raise AssertionError(f"accepted {bad!r}")


def test_scenario_hash_is_stable_and_normalised():
    a = [{"type": "disable_account", "account": "Entra_ID:aa-entra-tenant:ent-e7004 "}]
    b = [{"type": "disable_account", "account": "entra_id:aa-entra-tenant:ent-e7004", "noise": 1}]
    assert W.scenario_hash(a) == W.scenario_hash(b)


def test_empty_effect_is_an_empty_diff():
    r = _sim([{"type": "disable_account", "account": "active_directory:corp.aa.example:ad-e7004"}])
    assert r["rejected"] and not r["paths_removed"] and not r["paths_added"] and not r["memberships_lost"]


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
