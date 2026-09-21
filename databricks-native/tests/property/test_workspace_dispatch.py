"""
Property tests for the production dispatch binding (Phase 6).

`workspace_dispatch` builds the enforcement chokepoint's `execute` callback out
of a WorkspaceClient whose `apply` (issue the command) and `observe` (read the
state back) are separate. These tests pin the property that makes the binding
honest for deployment: verification uses the *independent read-back*, never the
command's own claim, and the workspace is touched only on a fully authorized
path.

A FakeWorkspace records how many times apply/observe were called and lets a test
force a read-back that disagrees with the command, modelling a dispatch that ran
but did not take effect. Everything runs offline: no Spark, no live SDK.

Run:  python3 databricks-native/tests/property/test_workspace_dispatch.py
"""

import os
import sys

SHARED = os.path.join(os.path.dirname(__file__), "..", "..", "notebooks", "_shared")
sys.path.insert(0, os.path.abspath(SHARED))

import authority_kernel as K  # noqa: E402
import enforcement as E  # noqa: E402
import workspace_dispatch as W  # noqa: E402

CONFIRMED = {"finding_id": "f1", "state": "CONFIRMED", "revision": 3}
WITHDRAWN = {"finding_id": "f1", "state": "WITHDRAWN", "revision": 3}


class FakeWorkspace:
    """In-memory stand-in for the WorkspaceClient contract.

    `observed` is what observe() reports, independent of what apply() did, so a
    test can model a command that runs but does not take effect. `raise_on_apply`
    models the command itself failing.
    """

    def __init__(self, observed="isolated", raise_on_apply=False):
        self.observed = observed
        self.raise_on_apply = raise_on_apply
        self.apply_calls = 0
        self.observe_calls = 0

    def apply(self, action_type, target):
        self.apply_calls += 1
        if self.raise_on_apply:
            raise RuntimeError("workspace refused the command")
        return "apply-said-ok"  # deliberately ignored by the binding

    def observe(self, action_type, target):
        self.observe_calls += 1
        return self.observed


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


def _authorized_ctx():
    return _ctx(approver="op-ciso", live_finding=CONFIRMED)


def test_apply_then_observe_verified():
    ws = FakeWorkspace(observed="isolated")
    ledger = []
    rec = W.dispatch("vanguard", _prop(), _authorized_ctx(), ws, ledger)
    assert ws.apply_calls == 1
    assert ws.observe_calls == 1
    assert rec["outcome"] == E.VERIFIED
    assert rec["executed"] is True
    assert rec["observed_state"] == "isolated"
    assert len(ledger) == 1


def test_command_succeeds_but_readback_disagrees_is_failed():
    # apply() returns without error, but the workspace read-back shows the target
    # never actually changed. The binding must report FAILED, not a false success.
    ws = FakeWorkspace(observed="online")
    ledger = []
    rec = W.dispatch("vanguard", _prop(), _authorized_ctx(), ws, ledger)
    assert ws.apply_calls == 1
    assert ws.observe_calls == 1
    assert rec["executed"] is True
    assert rec["outcome"] == E.FAILED
    assert rec["observed_state"] == "online"


def test_verification_ignores_the_commands_own_return_value():
    # apply() returns "apply-said-ok"; verification must key off observe(), so a
    # matching read-back verifies and a mismatching one fails regardless.
    good = FakeWorkspace(observed="isolated")
    bad = FakeWorkspace(observed="isolated-ish")
    assert W.dispatch("vanguard", _prop(), _authorized_ctx(), good, [])["outcome"] == E.VERIFIED
    assert W.dispatch("vanguard", _prop(), _authorized_ctx(), bad, [])["outcome"] == E.FAILED


def test_apply_error_is_execute_error_and_readback_never_trusted():
    ws = FakeWorkspace(observed="isolated", raise_on_apply=True)
    ledger = []
    rec = W.dispatch("vanguard", _prop(), _authorized_ctx(), ws, ledger)
    assert ws.apply_calls == 1
    assert ws.observe_calls == 0  # read-back is unreachable once the command failed
    assert rec["outcome"] == E.EXECUTE_ERROR
    assert rec["executed"] is True
    assert len(ledger) == 1


def test_denied_never_touches_workspace():
    ws = FakeWorkspace()
    ledger = []
    rec = W.dispatch("vanguard", _prop(), _ctx(target_in_scope=False), ws, ledger)
    assert ws.apply_calls == 0
    assert ws.observe_calls == 0
    assert rec["executed"] is False
    assert rec["outcome"] == E.BLOCKED
    assert len(ledger) == 1


def test_no_approval_never_touches_workspace():
    ws = FakeWorkspace()
    ledger = []
    rec = W.dispatch("vanguard", _prop(), _ctx(), ws, ledger)  # no approver
    assert ws.apply_calls == 0
    assert ws.observe_calls == 0
    assert rec["outcome"] == E.NOT_AUTHORIZED
    assert len(ledger) == 1


def test_self_approval_never_touches_workspace():
    ws = FakeWorkspace()
    rec = W.dispatch("vanguard", _prop(proposed_by="vanguard"),
                     _ctx(approver="vanguard", live_finding=CONFIRMED), ws, [])
    assert ws.apply_calls == 0
    assert rec["executed"] is False


def test_withdrawn_finding_never_touches_workspace():
    ws = FakeWorkspace()
    rec = W.dispatch("vanguard", _prop(),
                     _ctx(approver="op-ciso", live_finding=WITHDRAWN), ws, [])
    assert ws.apply_calls == 0
    assert rec["outcome"] == E.NOT_AUTHORIZED


def test_unknown_action_denied_no_workspace_call():
    ws = FakeWorkspace()
    ledger = []
    rec = W.dispatch("vanguard", _prop(action_type="launch_missiles"), _authorized_ctx(), ws, ledger)
    assert ws.apply_calls == 0
    assert rec["outcome"] == E.BLOCKED
    assert len(ledger) == 1


def test_client_missing_methods_raises():
    class Bad:
        pass
    try:
        W.dispatch("vanguard", _prop(), _authorized_ctx(), Bad(), [])
        assert False, "expected WorkspaceBindingError"
    except W.WorkspaceBindingError:
        pass


def test_ledger_sink_must_be_appendable():
    ws = FakeWorkspace()
    try:
        W.dispatch("vanguard", _prop(), _authorized_ctx(), ws, "not-a-sink")
        assert False, "expected WorkspaceBindingError"
    except W.WorkspaceBindingError:
        pass


def test_every_path_records_exactly_one_row():
    scenarios = [
        (_prop(), _ctx(target_in_scope=False), FakeWorkspace()),
        (_prop(), _ctx(), FakeWorkspace()),
        (_prop(), _ctx(approver="op-ciso", live_finding=WITHDRAWN), FakeWorkspace()),
        (_prop(), _authorized_ctx(), FakeWorkspace(observed="isolated")),
        (_prop(), _authorized_ctx(), FakeWorkspace(observed="online")),
        (_prop(), _authorized_ctx(), FakeWorkspace(raise_on_apply=True)),
    ]
    for proposal, ctx, ws in scenarios:
        ledger = []
        W.dispatch("vanguard", proposal, ctx, ws, ledger)
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
