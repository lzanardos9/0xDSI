"""
Identity access, attack path, group context and risk property tests (Phase 2).

Run:  python3 databricks-native/tests/property/test_identity_access.py
"""

import os
import random
import sys

SHARED = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "notebooks", "_shared"))
sys.path.insert(0, SHARED)

import identity_access as A  # noqa: E402
import identity_resolution as R  # noqa: E402
import identity_timeline as T  # noqa: E402
from identity_access_fixtures import EDGES, GROUPS, RESOURCES  # noqa: E402
from identity_event_fixtures import EVENTS  # noqa: E402
from identity_fixtures import ACCOUNTS, PEOPLE  # noqa: E402

RES = R.resolve(ACCOUNTS)
XREFS = RES["xrefs"]
LINKED = T.link_events(EVENTS, XREFS)
TL = T.timeline_findings(LINKED["events"], XREFS)


def _run(groups=GROUPS, edges=EDGES, resources=RESOURCES, prior=None, weights=None):
    model = A.build_access_model(XREFS, resources, groups, edges)
    paths = A.attack_paths(model)
    ctx = A.group_context(model, A.departments_from_events(LINKED["events"]), A.leavers_from_events(LINKED["events"]))
    scores = A.score_identities(model, paths, ctx["closure"], TL, RES["findings"], prior, weights)
    return model, paths, ctx, scores


MODEL, PATHS, CTX, SCORES = _run()


def _cid(person):
    return next(x["canonical_id"] for x in XREFS if x["employee_id"] == PEOPLE[person][0])


def _score(person):
    return next(s for s in SCORES if s["canonical_id"] == _cid(person))


def _factors(person):
    return {f["factor"] for f in _score(person)["factors"]}


def _group(name):
    return next(g for g in CTX["groups"] if g["name"] == name)


def _gfind(name):
    gk = _group(name)["group_key"]
    return {f["finding_type"] for f in CTX["findings"] if f["group_key"] == gk}


def test_feeds_load_without_quarantine():
    assert MODEL["quarantined"] == {"resources": 0, "groups": 0, "edges": 0, "members": 0}


def test_bad_rows_are_quarantined_not_guessed():
    model = A.build_access_model(
        XREFS, RESOURCES + [{"resource_id": "", "name": "x"}],
        GROUPS + [{"provider": "active_directory", "tenant": "", "object_id": "g", "name": "bad"},
                  {"provider": "active_directory", "tenant": "corp.aa.example", "object_id": "grp-x", "name": "X",
                   "members": ["active_directory:corp.aa.example:nobody", 42]}],
        EDGES + [{"source": "entra_id:aa-entra-tenant:ent-e7001", "edge_type": "grants", "target": "res-unknown"},
                 {"source": "nope", "edge_type": "grants", "target": "res-dc"}])
    assert model["quarantined"] == {"resources": 1, "groups": 1, "edges": 2, "members": 2}


def test_rudi_reaches_domain_controllers_through_nesting():
    p = [p for p in PATHS if p["canonical_id"] == _cid("rudi.himawan") and p["resource_id"] == "res-dc"]
    assert len(p) == 1 and not p[0]["via_takeover"]
    assert [s["label"] for s in p[0]["steps"]] == ["rhimawan", "NOC-OnCall", "Tier0-Operations", "Domain Admins", "Domain Controllers"]
    assert "hidden_privilege_nesting" in _gfind("NOC-OnCall")
    assert "privileged_via_standard_account" in _factors("rudi.himawan")


def test_blessy_takeover_path_to_loyalty_db():
    p = [p for p in PATHS if p["canonical_id"] == _cid("blessy.baby")]
    assert [(x["resource_id"], x["via_takeover"]) for x in p] == [("res-loyalty-db", True)]
    assert any(s["edge"] == "can_take_over" and s["permission"] == "reset_password" for s in p[0]["steps"])
    assert "takeover_path" in _factors("blessy.baby")
    assert "group_no_owner" in _gfind("Helpdesk-Tier1")


def test_keith_has_toxic_payments_combination():
    assert "sod_conflict" in _factors("keith.murry")
    assert {p["resource_id"] for p in PATHS if p["canonical_id"] == _cid("keith.murry")} == {"res-sap-fi", "res-flight-ops"}
    assert "member_outside_purpose" in _gfind("Airport-Ramp-Ops")


def test_departed_owner_and_disabled_member():
    assert _group("Airport-Ramp-Ops")["owner_status"] == "departed"
    assert {"group_owner_departed", "inactive_members"} <= _gfind("Airport-Ramp-Ops")
    assert not [p for p in PATHS if p["canonical_id"] == _cid("brian.mcdonald")]
    assert "inactive_account_in_group" in _factors("brian.mcdonald")


def test_abhijit_is_critical_from_exposure_plus_behaviour():
    s = _score("abhijit.tilak")
    assert s["band"] == "critical" and s["behaviour"] > 0 and s["exposure"] >= 45


def test_clean_person_scores_low():
    s = _score("priya.raman")
    assert s["score"] == 0 and s["band"] == "low" and s["factors"] == []


def test_disabled_accounts_cannot_be_traversed():
    groups = [dict(g, members=g["members"] + [{"provider": "active_directory", "tenant": "corp.aa.example",
                                               "object_id": "ad-e7004"}]) if g["name"] == "Domain Admins" else g for g in GROUPS]
    _, paths, _, _ = _run(groups=groups)
    assert not [p for p in paths if p["canonical_id"] == _cid("brian.mcdonald")]


def test_score_is_sum_of_factors_and_bounded():
    for s in SCORES:
        assert 0 <= s["score"] <= 100
        assert s["score"] == min(100, s["exposure"] + s["behaviour"] + s["hygiene"])
        assert s["band"] == A.band_for(s["score"])
        assert all(f["points"] > 0 and f["label"] for f in s["factors"])


def test_weights_override_and_drift():
    prior = {s["canonical_id"]: s["score"] for s in SCORES}
    _, _, _, again = _run(prior=prior, weights={"version": "aa-1", "takeover_path": 30})
    b = next(s for s in again if s["canonical_id"] == _cid("blessy.baby"))
    assert b["score"] == 30 and b["previous_score"] == 20 and b["delta"] == 10 and b["weights_version"] == "aa-1"


def test_order_does_not_change_results():
    g, e = list(GROUPS), list(EDGES)
    random.Random(3).shuffle(g)
    random.Random(4).shuffle(e)
    model, paths, ctx, scores = _run(groups=g, edges=e)
    assert A.access_version(model) == A.access_version(MODEL)
    assert sorted(p["path_id"] for p in paths) == sorted(p["path_id"] for p in PATHS)
    assert ctx["findings"] == CTX["findings"]
    assert [(s["canonical_id"], s["score"]) for s in scores] == [(s["canonical_id"], s["score"]) for s in SCORES]


def test_nesting_cycle_terminates():
    groups = [dict(g, members=g["members"] + [{"provider": "active_directory", "tenant": "corp.aa.example",
                                               "object_id": "grp-domain-admins"}]) if g["name"] == "NOC-OnCall" else g for g in GROUPS]
    _, paths, ctx, _ = _run(groups=groups)
    assert any(p["resource_id"] == "res-dc" for p in paths)
    assert len(ctx["groups"]) == len(GROUPS)


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
