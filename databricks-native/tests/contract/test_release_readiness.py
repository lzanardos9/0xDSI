"""
Guard: a release must not be reported READY while a critical gate is unvalidated.

Third-review Phase 0 truthfulness rule -- "a release summary must remain
NOT_READY when a critical gate is skipped, unavailable or failed; a developer
baseline can report partial progress without claiming a release passed."

These tests import the *shipped* `release_verdict` and the *shipped* `BLOCKED`
list from run_baseline (not a re-implementation), so they exercise the real
decision the release gate uses. In this environment all four critical
integration gates are blocked, so the release verdict must be NOT_READY even
when every runnable check passes -- that is the regression this locks down.

Run:  python3 databricks-native/tests/contract/test_release_readiness.py
"""

import os
import sys

TOOLS = os.path.join(os.path.dirname(__file__), "..", "..", "tools", "inventory")
sys.path.insert(0, os.path.abspath(TOOLS))

import run_baseline as B  # noqa: E402


def _passed(id_):
    return {"id": id_, "status": "passed"}


def test_all_passed_no_blocked_is_ready():
    v = B.release_verdict([_passed("a"), _passed("b")])
    assert v["release_ready"] is True
    assert v["verdict"] == "READY"
    assert v["blocking"] == []


def test_a_failed_check_is_not_ready():
    v = B.release_verdict([_passed("a"), {"id": "b", "status": "failed"}])
    assert v["release_ready"] is False
    assert any(x["id"] == "b" for x in v["blocking"])


def test_blocked_critical_gate_is_not_ready():
    v = B.release_verdict([
        _passed("a"),
        {"id": "spark", "status": "blocked", "critical": True, "reason": "no workspace"},
    ])
    assert v["release_ready"] is False
    assert v["blocking"][0]["id"] == "spark"


def test_blocked_non_critical_does_not_sink_release():
    v = B.release_verdict([
        _passed("a"),
        {"id": "helper", "status": "blocked", "critical": False},
    ])
    assert v["release_ready"] is True


def test_shipped_blocked_gates_are_all_critical():
    # If a real integration gate were silently marked non-critical it could pass
    # a release while unproven -- pin that every declared blocked gate is critical.
    assert B.BLOCKED, "expected declared blocked gates"
    for g in B.BLOCKED:
        assert g.get("critical") is True, f"blocked gate {g['id']} must be critical"


def test_real_environment_is_not_release_ready():
    # The actual shipped path: with the real blocked critical gates present and
    # every runnable check assumed green, the release is still NOT_READY.
    runnable_green = [_passed(f"runnable_{i}") for i in range(10)]
    blocked = [{**g, "status": "blocked"} for g in B.BLOCKED]
    v = B.release_verdict(runnable_green + blocked)
    assert v["release_ready"] is False
    assert {b["id"] for b in v["blocking"]} == {g["id"] for g in B.BLOCKED}


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
