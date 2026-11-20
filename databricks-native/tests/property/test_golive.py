"""Go-live readiness rules: verdicts never go green on an open, unknown or unsigned blocker.

Run:  python3 databricks-native/tests/property/test_golive.py
"""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "app"))

from backend import golive  # noqa: E402

AUTO_IDS = [c[0] for c in golive.CHECKS if c[3] == "auto"]


def _all_pass():
    return {cid: ("pass", "") for cid in AUTO_IDS}


def _signed_all():
    return {cid: {"check_id": cid, "decision": "signed", "note": "evidence ok", "decided_at": "2026-01-01"}
            for cid in golive.SIGNOFF_IDS}


def test_fresh_deployment_is_no_go():
    r = golive.evaluate({}, {})
    assert r["verdict"] == "no_go"
    assert all(i["state"] in ("unknown", "pending") for i in r["items"])
    assert r["score"] == 0


def test_everything_cleared_is_go():
    r = golive.evaluate(_all_pass(), _signed_all())
    assert r["verdict"] == "go" and r["score"] == 100 and not r["blockers_open"]


def test_open_advisory_gives_go_with_risks_and_waiver_clears_it():
    auto = _all_pass()
    auto["lakewatch"] = ("warn", "not configured")
    r = golive.evaluate(auto, _signed_all())
    assert r["verdict"] == "go_with_risks" and r["advisories_open"] == ["lakewatch"]
    decisions = {**_signed_all(), "lakewatch": {"check_id": "lakewatch", "decision": "waived", "note": "phase 2 scope", "decided_at": "x"}}
    assert golive.evaluate(auto, decisions)["verdict"] == "go"


def test_unknown_blocker_is_never_green():
    auto = _all_pass()
    auto["warehouse"] = ("unknown", "not measured")
    assert golive.evaluate(auto, _signed_all())["verdict"] == "no_go"


def test_blocker_waiver_has_no_effect_and_is_rejected():
    auto = _all_pass()
    auto["custody_key"] = ("fail", "missing")
    decisions = {**_signed_all(), "custody_key": {"check_id": "custody_key", "decision": "waived", "note": "trust me please", "decided_at": "x"}}
    assert golive.evaluate(auto, decisions)["verdict"] == "no_go"
    assert golive.validate_decision("custody_key", "waived", "trust me please") == "Blockers cannot be waived"


def test_decision_validation():
    assert golive.validate_decision("nope", "signed", "x" * 20) == "Unknown check"
    assert "cannot be signed" in golive.validate_decision("config", "signed", "x" * 20)
    assert "10 characters" in golive.validate_decision("runbook", "signed", "short")
    assert golive.validate_decision("runbook", "signed", "PagerDuty rota SOC-1") == ""
    assert golive.validate_decision("runbook", "revoked", "") == ""


def test_latest_decision_wins_and_revoke_clears():
    rows = [
        {"check_id": "runbook", "decision": "signed", "note": "v1 runbook", "decided_at": "2026-01-01T00:00:00"},
        {"check_id": "runbook", "decision": "revoked", "note": "", "decided_at": "2026-01-02T00:00:00"},
        {"check_id": "uc_grants", "decision": "signed", "note": "grants ok", "decided_at": "2026-01-01T00:00:00"},
    ]
    latest = golive.latest_decisions(rows)
    assert "runbook" not in latest and "uc_grants" in latest


def test_catalog_ids_unique():
    ids = [c[0] for c in golive.CHECKS]
    assert len(ids) == len(set(ids))


if __name__ == "__main__":
    passed = failed = 0
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            try:
                fn()
                passed += 1
                print(f"PASS {name}")
            except AssertionError as e:
                failed += 1
                print(f"FAIL {name}: {e}")
    print(f"\n{passed} passed, {failed} failed")
    raise SystemExit(1 if failed else 0)
