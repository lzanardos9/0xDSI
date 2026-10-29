"""
Identity Timeline (Phase 1) property tests over the synthetic fixtures.

Run:  python3 databricks-native/tests/property/test_identity_timeline.py
"""

import os
import random
import sys

SHARED = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "notebooks", "_shared"))
sys.path.insert(0, SHARED)

import identity_resolution as R  # noqa: E402
import identity_timeline as T  # noqa: E402
from identity_event_fixtures import EVENTS  # noqa: E402
from identity_fixtures import ACCOUNTS, PEOPLE  # noqa: E402

XREFS = R.resolve(ACCOUNTS)["xrefs"]
LINKED = T.link_events(EVENTS, XREFS)
FINDINGS = T.timeline_findings(LINKED["events"], XREFS)


def _cid(person):
    eid = PEOPLE[person][0]
    cids = {x["canonical_id"] for x in XREFS if x["employee_id"] == eid}
    assert len(cids) == 1
    return cids.pop()


def _types(person):
    return sorted({f["finding_type"] for f in FINDINGS if f["canonical_id"] == _cid(person)})


def test_every_named_person_has_a_linked_timeline():
    for person in PEOPLE:
        evs = [e for e in LINKED["events"] if e["canonical_id"] == _cid(person)]
        assert len(evs) >= 3, person
        assert any(e["event_type"] == "hr_joiner" for e in evs), person


def test_hr_events_link_by_employee_id_and_directory_events_by_account():
    keith = [e for e in LINKED["events"] if e["canonical_id"] == _cid("keith.murry")]
    assert {e["provider"] for e in keith} >= {"workday", "saviynt", "entra_id"}


def test_unknown_account_stays_unlinked():
    assert LINKED["unlinked"] == 1
    assert [e for e in LINKED["events"] if not e["canonical_id"]][0]["link_status"] == "unlinked"


def test_invalid_events_are_quarantined_not_linked():
    bad = [{"event_type": "made_up", "occurred_at": "2026-10-01T00:00:00Z"},
           {"event_type": "hr_leaver", "occurred_at": "2026-10-01T00:00:00Z"},
           {"provider": "duo", "tenant": "duo-prod", "object_id": "x", "event_type": "mfa_denied"}]
    out = T.link_events(bad, XREFS)
    assert out["quarantined"] == 3 and out["events"] == []


def test_brian_mcdonald_leaver_findings():
    assert _types("brian.mcdonald") == ["leaver_access_remaining", "post_termination_activity"]


def test_departed_owner_flags_service_account():
    owned = [f for f in FINDINGS if f["finding_type"] == "owner_departed"]
    assert len(owned) == 1 and "svc-bag-reconcile" in owned[0]["detail"]


def test_keith_murry_mover_kept_old_access():
    f = [f for f in FINDINGS if f["canonical_id"] == _cid("keith.murry")]
    assert [x["finding_type"] for x in f] == ["mover_access_retained"]
    assert "Ramp-Control-Console" in f[0]["detail"]


def test_abhijit_tilak_mfa_reset_new_country():
    assert _types("abhijit.tilak") == ["mfa_reset_new_location"]


def test_todd_trncak_mfa_fatigue():
    f = [f for f in FINDINGS if f["canonical_id"] == _cid("todd.trncak")]
    assert [x["finding_type"] for x in f] == ["mfa_fatigue"] and len(f[0]["evidence_event_ids"]) == 5


def test_luiz_zanardo_privilege_without_ticket():
    assert _types("luiz.zanardo") == ["privilege_without_ticket"]


def test_clean_people_have_no_findings():
    for person in ("blessy.baby", "rudi.himawan", "priya.raman", "marcus.bell"):
        assert _types(person) == [], person


def test_order_and_duplicates_do_not_change_results():
    shuffled = list(EVENTS) + EVENTS[:5]
    random.Random(7).shuffle(shuffled)
    again = T.link_events(shuffled, XREFS)
    assert [e["event_id"] for e in again["events"]] == [e["event_id"] for e in LINKED["events"]]
    assert T.timeline_findings(again["events"], XREFS) == FINDINGS
    assert T.timeline_version(again["events"]) == T.timeline_version(LINKED["events"])


def test_rehire_clears_leaver_findings():
    extra = [{"provider": "workday", "tenant": "aa-hr", "employee_id": PEOPLE["brian.mcdonald"][0],
              "event_type": "hr_rehire", "occurred_at": "2026-10-23T13:00:00Z", "source_event_id": "wd-rehire"}]
    out = T.link_events(EVENTS + extra, XREFS)
    types = {f["finding_type"] for f in T.timeline_findings(out["events"], XREFS) if f["canonical_id"] == _cid("brian.mcdonald")}
    assert types == set()


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
