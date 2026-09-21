"""
Property tests for the deployment promotion gate (Phase 7).

The gate exists to make one lie impossible: calling a simulated success
`VERIFIED_IN_DEPLOYMENT`. These tests pin that only a live-provenance, executed,
verified row promotes, that unmarked rows fail closed as simulated, and that a
live failure never promotes.

Run:  python3 databricks-native/tests/property/test_deployment_promotion.py
"""

import os
import sys

SHARED = os.path.join(os.path.dirname(__file__), "..", "..", "notebooks", "_shared")
sys.path.insert(0, os.path.abspath(SHARED))

import deployment_promotion as P  # noqa: E402


def _row(outcome="VERIFIED", provenance="simulated", executed=True, agent_key="vanguard"):
    return {"agent_key": agent_key, "outcome": outcome, "executed": executed,
            "provenance": provenance}


def test_simulated_verified_never_promotes():
    rows = [_row(outcome="VERIFIED", provenance="simulated")]
    assert P.honest_status("DEPLOYMENT_READY", rows) == "DEPLOYMENT_READY"


def test_live_verified_promotes():
    rows = [_row(outcome="VERIFIED", provenance="live")]
    assert P.honest_status("DEPLOYMENT_READY", rows) == "VERIFIED_IN_DEPLOYMENT"


def test_live_failed_does_not_promote():
    rows = [_row(outcome="FAILED", provenance="live")]
    assert P.honest_status("DEPLOYMENT_READY", rows) == "DEPLOYMENT_READY"


def test_live_execute_error_does_not_promote():
    rows = [_row(outcome="EXECUTE_ERROR", provenance="live", executed=True)]
    assert P.honest_status("DEPLOYMENT_READY", rows) == "DEPLOYMENT_READY"


def test_live_verified_but_not_executed_does_not_promote():
    # A VERIFIED outcome should always be executed; guard against a malformed row.
    rows = [_row(outcome="VERIFIED", provenance="live", executed=False)]
    assert P.honest_status("DEPLOYMENT_READY", rows) == "DEPLOYMENT_READY"


def test_missing_provenance_treated_as_simulated():
    rows = [{"agent_key": "vanguard", "outcome": "VERIFIED", "executed": True}]
    assert P.honest_status("DEPLOYMENT_READY", rows) == "DEPLOYMENT_READY"


def test_blank_provenance_treated_as_simulated():
    rows = [_row(outcome="VERIFIED", provenance="   ")]
    assert P.honest_status("DEPLOYMENT_READY", rows) == "DEPLOYMENT_READY"


def test_live_verified_mixed_with_simulated_promotes():
    rows = [_row(provenance="simulated"), _row(outcome="FAILED", provenance="live"),
            _row(outcome="VERIFIED", provenance="live")]
    assert P.honest_status("DEPLOYMENT_READY", rows) == "VERIFIED_IN_DEPLOYMENT"


def test_no_rows_keeps_base():
    assert P.honest_status("DEPLOYMENT_READY", []) == "DEPLOYMENT_READY"
    assert P.honest_status("VERIFIED_IN_CODE", []) == "VERIFIED_IN_CODE"


def test_non_promotable_base_is_never_promoted():
    # A live-verified row cannot lift a status that never had a proven binding.
    rows = [_row(outcome="VERIFIED", provenance="live")]
    assert P.honest_status("VERIFIED_IN_CODE", rows) == "VERIFIED_IN_CODE"
    assert P.honest_status("PROPOSED", rows) == "PROPOSED"


def test_enforced_base_can_promote():
    rows = [_row(outcome="VERIFIED", provenance="live")]
    assert P.honest_status("ENFORCED", rows) == "VERIFIED_IN_DEPLOYMENT"


def test_promote_all_labels_each_agent_independently():
    rows = [
        _row(agent_key="vanguard", outcome="VERIFIED", provenance="live"),
        _row(agent_key="edge", outcome="VERIFIED", provenance="simulated"),
        _row(agent_key="active_list", outcome="FAILED", provenance="live"),
    ]
    base = {"vanguard": "DEPLOYMENT_READY", "edge": "DEPLOYMENT_READY",
            "active_list": "DEPLOYMENT_READY", "scanner": "VERIFIED_IN_CODE"}
    out = P.promote_all(base, rows)
    assert out["vanguard"] == "VERIFIED_IN_DEPLOYMENT"
    assert out["edge"] == "DEPLOYMENT_READY"
    assert out["active_list"] == "DEPLOYMENT_READY"
    assert out["scanner"] == "VERIFIED_IN_CODE"  # no rows, base kept


def test_current_ledger_is_all_simulated_so_nothing_promotes():
    # Mirrors the real world today: every ledger row is a dry-run, so the gate
    # must hold every agent at its base -- zero VERIFIED_IN_DEPLOYMENT.
    simulated_rows = [_row(agent_key=a, outcome="VERIFIED", provenance="simulated")
                      for a in ("vanguard", "edge", "active_list")]
    base = {a: "DEPLOYMENT_READY" for a in ("vanguard", "edge", "active_list")}
    out = P.promote_all(base, simulated_rows)
    assert all(v == "DEPLOYMENT_READY" for v in out.values())


if __name__ == "__main__":
    failed = 0
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            try:
                fn()
                print(f"PASS {name}")
            except Exception as e:  # noqa: BLE001
                failed += 1
                print(f"FAIL {name}: {e}")
    print(f"\n{'FAILED' if failed else 'OK'} ({failed} failed)")
    raise SystemExit(1 if failed else 0)
