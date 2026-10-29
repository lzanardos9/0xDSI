"""
Property tests for the Phase 3 federation posture checks, on the sample trusts and guests.

Run: python3 tests/property/test_identity_federation.py
"""
import os
import sys

SHARED = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "notebooks", "_shared"))
sys.path.insert(0, SHARED)

import identity_access as A  # noqa: E402
import identity_federation as F  # noqa: E402
import identity_resolution as R  # noqa: E402
import identity_timeline as T  # noqa: E402
from identity_access_fixtures import EDGES, GROUPS, RESOURCES  # noqa: E402
from identity_event_fixtures import EVENTS  # noqa: E402
from identity_federation_fixtures import AS_OF, CHANGES, TRUSTS  # noqa: E402
from identity_fixtures import ACCOUNTS  # noqa: E402

XREFS = R.resolve(ACCOUNTS)["xrefs"]
LEAVERS = A.leavers_from_events(T.link_events(EVENTS, XREFS)["events"])
MODEL = A.build_access_model(XREFS, RESOURCES, GROUPS, EDGES)
GG = F.guest_groups(MODEL, A.group_context(MODEL)["closure"])


def _eval(trusts=TRUSTS, changes=CHANGES, xrefs=XREFS):
    return F.evaluate(trusts, xrefs, AS_OF, LEAVERS, GG, changes)


OUT = _eval()


def _types(trust_id=None, account_name=None):
    return {f["finding_type"] for f in OUT["findings"]
            if (trust_id and f["trust_id"] == trust_id and f["scope"] == "trust")
            or (account_name and f["scope"] == "guest" and
                next(g for g in OUT["guests"] if g["account_key"] == f["account_key"])["display_name"] == account_name)}


def _trust(tid):
    return next(t for t in OUT["trusts"] if t["trust_id"] == tid)


def test_ba_trust_is_clean():
    assert _types("ct-ba") == set() and _trust("ct-ba")["worst_severity"] is None


def test_deloitte_fails_everything_and_owner_left():
    assert _types("ct-deloitte") == {"ct_allowed_apps", "ct_partner_mfa", "ct_auto_redeem", "ct_reviewed",
                                     "trust_owner_departed"}


def test_drift_names_who_and_when():
    f = next(f for f in OUT["findings"] if f["trust_id"] == "ct-envoy" and f["finding_type"] == "ct_partner_mfa")
    assert f["changed_by"] == "abhijit.tilak@aa.example" and f["changed_at"].startswith("2026-10-24")
    sid = next(f for f in OUT["findings"] if f["finding_type"] == "ad_sid_filtering")
    assert sid["changed_by"] == "rudi.himawan@aa.example"


def test_cert_expiry_and_weak_signing():
    assert _types("fed-ping-entra") == {"fed_cert_expiry"}
    assert _types("fed-partner-sso") == {"fed_signing_alg", "fed_external_mfa", "trust_no_owner"}


def test_guest_findings():
    assert _types(account_name="Sarah Okafor") == set()
    assert _types(account_name="Tom Ellis") == {"guest_sponsor_departed"}
    assert _types(account_name="Nina Park") == {"guest_no_sponsor", "guest_stale", "guest_unknown_partner"}
    assert _types(account_name="Carlos Mendes") == {"guest_privileged"}
    assert _types(account_name="Jordan Rivera") == {"guest_no_sponsor"}


def test_guests_are_attached_to_their_partner():
    assert _trust("ct-envoy")["guests"] == 1 and _trust("ct-ba")["active_guests"] == 1


def test_disabled_guest_raises_nothing():
    xrefs = [dict(x, normalized_state="DISABLED") if x.get("display_name") == "Nina Park" else x for x in XREFS]
    out = _eval(xrefs=xrefs)
    assert not [f for f in out["findings"] if f["scope"] == "guest" and "Nina" in f["detail"]]


def test_missing_setting_fails_closed():
    trusts = [dict(TRUSTS[0], settings={k: v for k, v in TRUSTS[0]["settings"].items() if k != "allowed_apps"})]
    f = [f for f in _eval(trusts=trusts)["findings"] if f["scope"] == "trust"]
    assert [x["finding_type"] for x in f] == ["ct_allowed_apps"] and f[0]["actual"] == "not reported"


def test_diff_settings_detects_changes():
    prior = {"ct-ba": dict(TRUSTS[0]["settings"], auto_redeem=True)}
    d = F.diff_settings(prior, TRUSTS, "2026-10-29T06:00:00Z")
    assert [(c["trust_id"], c["setting"], c["before"], c["after"]) for c in d] == [("ct-ba", "auto_redeem", True, False)]


def test_ids_are_deterministic_and_summary_adds_up():
    again = _eval()
    assert [f["finding_id"] for f in again["findings"]] == [f["finding_id"] for f in OUT["findings"]]
    s = OUT["summary"]
    assert sum(s["by_severity"].values()) == s["findings"] == len(OUT["findings"])
    assert 0 <= s["posture_score"] <= 100 and s["trusts"] == len(TRUSTS)


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
