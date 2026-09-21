"""
Enforcement deployment harness (Phase 5).

The unit tests prove the guard fails closed against spy callbacks. This harness
goes one step further: it stands up a small in-memory "deployment" -- a fleet of
targets with real mutable state -- and drives governed actions from several
agents through `enforcement.guard_and_dispatch`, where the `execute` callback
actually mutates that state and returns what it observes.

That makes the binding observable end to end in a process you can run: the fleet
changes if and only if the guard authorized the action. `run()` returns the audit
records the enforcement layer produced and a list of runtime invariant checks
(fleet-mutated == executed). It is the same enforcement code the notebooks import
-- nothing here re-implements a decision.

This is a harness deployment, not the live Databricks workspace, so agents that
pass here are honestly `ENFORCED` (run only through the fail-closed chokepoint,
demonstrated live), not `VERIFIED_IN_DEPLOYMENT`.

Run:  python3 databricks-native/tests/harness/enforcement_harness.py
"""

import json
import os
import sys

SHARED = os.path.join(os.path.dirname(__file__), "..", "..", "notebooks", "_shared")
sys.path.insert(0, os.path.abspath(SHARED))

import authority_kernel as K  # noqa: E402
import enforcement as E  # noqa: E402

CONFIRMED = {"finding_id": "f1", "state": "CONFIRMED", "revision": 3}
WITHDRAWN = {"finding_id": "f1", "state": "WITHDRAWN", "revision": 3}

# The state a successful action drives each target toward.
_EFFECT_RESULT = {
    "isolate_host": "isolated",
    "block_ip": "blocked",
    "add_to_blocklist": "blocked",
    "upgrade": "upgraded",
    "revoke_token": "revoked",
}


class Fleet:
    """A tiny mutable 'deployment': target -> current state."""

    def __init__(self, initial):
        self.state = dict(initial)
        self.mutations = 0

    def snapshot(self):
        return dict(self.state)

    def make_execute(self, action_type, target, result_override=None):
        """Return an execute() that mutates the fleet and returns the observed state.

        result_override lets a scenario model a dispatch that runs but does not
        actually take effect (the target ends up in the wrong state), so the
        guard reports FAILED rather than a false success.
        """
        def _execute():
            new_state = result_override or _EFFECT_RESULT.get(action_type, "changed")
            self.state[target] = new_state
            self.mutations += 1
            return self.state[target]
        return _execute


def _ctx(autonomy=K.A3, **over):
    c = {"agent": {"autonomy": autonomy, "lifecycle": "active"}, "target_in_scope": True,
         "is_sandbox_target": False, "approver": None, "live_finding": None}
    c.update(over)
    return c


def _prop(agent, action_type, target, proposed_by):
    return {"action_type": action_type, "target": target, "reason": "harness",
            "proposed_by": proposed_by, "confidence": 0.9, "finding_id": "f1"}


def run():
    """Drive scenarios through the real guard; return (records, checks)."""
    fleet = Fleet({
        "host:WIN-FIN-204": "online",
        "host:LNX-DB-31": "online",
        "ip:5.188.10.7": "active",
        "ip:45.9.13.7": "active",
        "collector:edge-eu-07": "v1",
    })
    records = []
    checks = []

    def sink(rec):
        records.append(rec)

    # (label, agent, proposal, context, execute_target, result_override, expect_executed)
    scenarios = [
        ("Authorized isolate is enforced and changes the fleet",
         "vanguard", "isolate_host", "host:WIN-FIN-204", "op-ciso", CONFIRMED, None, True),
        ("Out-of-scope isolate is blocked; fleet untouched",
         "vanguard", "isolate_host", "host:LNX-DB-31", "op-ciso", CONFIRMED, None, False,
         {"target_in_scope": False}),
        ("No approver: block_ip cannot execute",
         "vanguard", "block_ip", "ip:5.188.10.7", None, None, None, False),
        ("Self-approval is refused; fleet untouched",
         "vanguard", "block_ip", "ip:5.188.10.7", "vanguard", CONFIRMED, None, False),
        ("Withdrawn finding blocks execution",
         "vanguard", "block_ip", "ip:5.188.10.7", "op-ciso", WITHDRAWN, None, False),
        ("Dispatch runs but target not observed contained -> FAILED",
         "vanguard", "block_ip", "ip:5.188.10.7", "op-ciso", CONFIRMED, "still_active", True),
        ("Edge upgrade authorized and verified",
         "edge", "upgrade", "collector:edge-eu-07", "op-platform", CONFIRMED, None, True),
        ("Active List block at chartered A2 is blocked on the autonomy floor",
         "active_list", "add_to_blocklist", "ip:45.9.13.7", "op-soc", CONFIRMED, None, False,
         {"autonomy": K.A2}),
        ("Active List block at re-chartered A3 is enforced",
         "active_list", "add_to_blocklist", "ip:45.9.13.7", "op-soc", CONFIRMED, None, True,
         {"autonomy": K.A3}),
    ]

    for sc in scenarios:
        label, agent, action, target, approver, finding = sc[0], sc[1], sc[2], sc[3], sc[4], sc[5]
        override, expect_exec = sc[6], sc[7]
        ctx_over = sc[8] if len(sc) > 8 else {}
        autonomy = ctx_over.pop("autonomy", K.A3)
        ctx = _ctx(autonomy=autonomy, approver=approver, live_finding=finding, **ctx_over)
        proposal = _prop(agent, action, target, proposed_by=agent)

        before = fleet.snapshot()
        execute = fleet.make_execute(action, target, result_override=override)
        rec = E.guard_and_dispatch(agent, proposal, ctx, execute, sink)
        after = fleet.snapshot()

        mutated = before != after
        # The core invariant: the fleet changes exactly when the guard executed.
        invariant_ok = (mutated == rec["executed"]) and (rec["executed"] == expect_exec)
        checks.append({"label": label, "outcome": rec["outcome"],
                       "executed": rec["executed"], "mutated": mutated, "ok": invariant_ok})

    return records, checks


def main():
    records, checks = run()
    failed = 0
    print("=" * 78)
    print("ENFORCEMENT DEPLOYMENT HARNESS")
    print("=" * 78)
    for c in checks:
        mark = "PASS" if c["ok"] else "FAIL"
        if not c["ok"]:
            failed += 1
        print(f"{mark}  [{c['outcome']:<14}] executed={str(c['executed']):<5} "
              f"fleet_changed={str(c['mutated']):<5}  {c['label']}")
    print("-" * 78)
    print(f"{len(records)} audit records; {'FAILED' if failed else 'OK'} ({failed} invariant failures)")
    if "--json" in sys.argv:
        print(json.dumps(records, indent=2))
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
