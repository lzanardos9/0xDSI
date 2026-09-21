"""
Property tests for the enforcement chokepoint (Phase 5).

enforcement.guard_and_dispatch is the single sanctioned path from a proposed
action to a real side effect. These tests pin the guarantee that makes it
enforcement rather than advice: the `execute` callback -- the only thing that
touches the real world -- is unreachable on any path the kernel or the approval
lifecycle rejects, and every attempt leaves exactly one append-only audit record.

A spy `execute` records whether it was called; a list `record` sink captures the
ledger. Both are injected, so the whole thing runs offline with no Spark,
database or live target.

Run:  python3 databricks-native/tests/property/test_enforcement.py
"""

import os
import sys

SHARED = os.path.join(os.path.dirname(__file__), "..", "..", "notebooks", "_shared")
sys.path.insert(0, os.path.abspath(SHARED))

import authority_kernel as K  # noqa: E402
import enforcement as E  # noqa: E402

CONFIRMED = {"finding_id": "f1", "state": "CONFIRMED", "revision": 3}
WITHDRAWN = {"finding_id": "f1", "state": "WITHDRAWN", "revision": 3}


class Spy:
    def __init__(self, returns="isolated"):
        self.calls = 0
        self.returns = returns

    def __call__(self):
        self.calls += 1
        return self.returns


def _ctx(**over):
    c = {"agent": {"autonomy": K.A3, "lifecycle": "active"}, "target_in_scope": True,
         "is_sandbox_target": False, "approver": None, "live_finding": None}
    c.update(over)
    return c


def _prop(**over):
    p = {"action_type": "isolate_host", "target": "host:1", "reason": "threat",
         "proposed_by": "vanguard", "confidence": 0.9, "finding_id": "f1"}
    p.update(over)
    return p


def _run(proposal, context, execute):
    ledger = []
    rec = E.guard_and_dispatch("vanguard", proposal, context, execute, ledger.append)
    return rec, ledger


def test_denied_action_never_executes_but_is_recorded():
    spy = Spy()
    rec, ledger = _run(_prop(), _ctx(target_in_scope=False), spy)
    assert spy.calls == 0
    assert rec["executed"] is False
    assert rec["outcome"] == E.BLOCKED
    assert rec["kernel_decision"] == K.DENY
    assert len(ledger) == 1


def test_unknown_action_never_executes_but_is_recorded():
    spy = Spy()
    ledger = []
    rec = E.guard_and_dispatch("vanguard", _prop(action_type="launch_missiles"), _ctx(), spy, ledger.append)
    assert spy.calls == 0
    assert rec["outcome"] == E.BLOCKED
    assert len(ledger) == 1


def test_no_approval_means_no_execution():
    spy = Spy()
    rec, ledger = _run(_prop(), _ctx(), spy)  # no approver / finding
    assert spy.calls == 0
    assert rec["executed"] is False
    assert rec["outcome"] == E.NOT_AUTHORIZED
    assert len(ledger) == 1


def test_self_approval_blocks_execution():
    spy = Spy()
    rec, ledger = _run(_prop(proposed_by="vanguard"), _ctx(approver="vanguard", live_finding=CONFIRMED), spy)
    assert spy.calls == 0
    assert rec["outcome"] == K.DENY or rec["outcome"] == E.BLOCKED
    assert len(ledger) == 1


def test_unconfirmed_finding_blocks_execution():
    spy = Spy()
    rec, ledger = _run(_prop(), _ctx(approver="ciso", live_finding=WITHDRAWN), spy)
    assert spy.calls == 0
    assert rec["outcome"] == E.NOT_AUTHORIZED
    assert len(ledger) == 1


def test_authorized_and_verified_executes_once():
    spy = Spy(returns="isolated")
    rec, ledger = _run(_prop(), _ctx(approver="ciso", live_finding=CONFIRMED), spy)
    assert spy.calls == 1
    assert rec["executed"] is True
    assert rec["outcome"] == E.VERIFIED
    assert rec["observed_state"] == "isolated"
    assert rec["approved_by"] == "ciso"
    assert len(ledger) == 1


def test_executed_but_unverified_is_failed_not_success():
    spy = Spy(returns="still_online")
    rec, ledger = _run(_prop(), _ctx(approver="ciso", live_finding=CONFIRMED), spy)
    assert spy.calls == 1
    assert rec["executed"] is True
    assert rec["outcome"] == E.FAILED
    assert len(ledger) == 1


def test_execute_exception_fails_closed_and_is_recorded():
    def boom():
        raise RuntimeError("connector unreachable")
    ledger = []
    rec = E.guard_and_dispatch("vanguard", _prop(), _ctx(approver="ciso", live_finding=CONFIRMED), boom, ledger.append)
    assert rec["outcome"] == E.EXECUTE_ERROR
    assert rec["executed"] is True
    assert len(ledger) == 1


def test_bad_sinks_raise():
    try:
        E.guard_and_dispatch("vanguard", _prop(), _ctx(), None, lambda r: None)
        assert False, "expected EnforcementError"
    except E.EnforcementError:
        pass
    try:
        E.guard_and_dispatch("vanguard", _prop(), _ctx(), Spy(), "not-callable")
        assert False, "expected EnforcementError"
    except E.EnforcementError:
        pass


def test_every_path_records_exactly_one_row():
    scenarios = [
        (_prop(), _ctx(target_in_scope=False)),
        (_prop(), _ctx()),
        (_prop(), _ctx(approver="ciso", live_finding=WITHDRAWN)),
        (_prop(), _ctx(approver="ciso", live_finding=CONFIRMED)),
    ]
    for proposal, ctx in scenarios:
        _, ledger = _run(proposal, ctx, Spy())
        assert len(ledger) == 1, (proposal, ctx)


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
