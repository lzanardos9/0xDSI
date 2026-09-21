"""
Deployment dry-run harness (Phase 6).

The enforcement harness (Phase 5) proved the guard fails closed and that a fleet
mutates iff the guard executed. This dry-run goes one step closer to deployment:
it drives governed actions through `workspace_dispatch.dispatch`, the production
binding, against a SimulatedWorkspace whose `apply` and `observe` are *separate*
-- exactly the shape of the real Unity Catalog `execute_response_action` plus a
status read-back.

That lets it demonstrate the property the live binding depends on: verification
uses the independent read-back, so a command that runs but does not take effect
is FAILED, not a false success. The `apply-succeeds-but-readback-disagrees`
scenario models precisely that.

IMPORTANT -- this is a *simulated* workspace client, not the live Databricks
workspace. Agents exercised here have a written, dry-run-proven deployment
binding: honestly `DEPLOYMENT_READY`. Promotion to `VERIFIED_IN_DEPLOYMENT`
requires running this same binding against the real workspace and observing the
read-back there. This harness does not and cannot make that claim.

Run:  python3 databricks-native/tests/harness/deployment_dryrun.py [--json]
"""

import json
import os
import sys

SHARED = os.path.join(os.path.dirname(__file__), "..", "..", "notebooks", "_shared")
sys.path.insert(0, os.path.abspath(SHARED))

import authority_kernel as K  # noqa: E402
import enforcement as E  # noqa: E402
import workspace_dispatch as W  # noqa: E402

CONFIRMED = {"finding_id": "f1", "state": "CONFIRMED", "revision": 3}

# What the workspace should report once an action has genuinely taken effect.
_EFFECT_RESULT = {
    "isolate_host": "isolated",
    "block_ip": "blocked",
    "add_to_blocklist": "blocked",
    "upgrade": "upgraded",
}


class SimulatedWorkspace:
    """A stand-in workspace: apply() mutates state, observe() reads it back.

    `silent_drop` names targets whose command is accepted but never actually
    changes state (a firewall that dropped the rule), so observe() keeps
    reporting the old value and verification must report FAILED.
    """

    def __init__(self, initial, silent_drop=()):
        self.state = dict(initial)
        self.silent_drop = set(silent_drop)
        self.applies = 0

    def snapshot(self):
        return dict(self.state)

    def apply(self, action_type, target):
        self.applies += 1
        if target in self.silent_drop:
            return  # command accepted but has no effect
        self.state[target] = _EFFECT_RESULT.get(action_type, "changed")

    def observe(self, action_type, target):
        return self.state.get(target)


def _ctx(autonomy=K.A3, **over):
    c = {"agent": {"autonomy": autonomy, "lifecycle": "active"}, "target_in_scope": True,
         "is_sandbox_target": False, "approver": None, "live_finding": None}
    c.update(over)
    return c


def _prop(action_type, target, proposed_by):
    return {"action_type": action_type, "target": target, "reason": "dry-run",
            "proposed_by": proposed_by, "confidence": 0.9, "finding_id": "f1"}


def run():
    """Drive scenarios through the production binding; return (records, checks)."""
    ws = SimulatedWorkspace(
        {
            "host:WIN-FIN-204": "online",
            "host:LNX-DB-31": "online",
            "ip:5.188.10.7": "active",
            "ip:45.9.13.7": "active",
            "collector:edge-eu-07": "v1",
        },
        silent_drop={"ip:5.188.10.7"},  # this IP block will be silently dropped
    )
    records = []
    checks = []

    # (label, agent, action, target, approver, finding, expect_exec, expect_outcome, ctx_over)
    scenarios = [
        ("VANGUARD isolate: authorized, read-back confirms -> VERIFIED",
         "vanguard", "isolate_host", "host:WIN-FIN-204", "op-ciso", CONFIRMED, True, E.VERIFIED, {}),
        ("VANGUARD isolate out-of-scope: blocked, workspace untouched",
         "vanguard", "isolate_host", "host:LNX-DB-31", "op-ciso", CONFIRMED, False, E.BLOCKED,
         {"target_in_scope": False}),
        ("VANGUARD block_ip: no approver, workspace untouched",
         "vanguard", "block_ip", "ip:45.9.13.7", None, None, False, E.NOT_AUTHORIZED, {}),
        ("VANGUARD block_ip: command runs but firewall silently drops -> FAILED",
         "vanguard", "block_ip", "ip:5.188.10.7", "op-ciso", CONFIRMED, True, E.FAILED, {}),
        ("Edge upgrade: authorized, read-back confirms -> VERIFIED",
         "edge", "upgrade", "collector:edge-eu-07", "op-platform", CONFIRMED, True, E.VERIFIED, {}),
        ("Active List block at chartered A2: denied on the autonomy floor",
         "active_list", "add_to_blocklist", "ip:45.9.13.7", "op-soc", CONFIRMED, False, E.BLOCKED,
         {"autonomy": K.A2}),
        ("Active List block at re-chartered A3: authorized, read-back confirms -> VERIFIED",
         "active_list", "add_to_blocklist", "ip:45.9.13.7", "op-soc", CONFIRMED, True, E.VERIFIED,
         {"autonomy": K.A3}),
    ]

    for label, agent, action, target, approver, finding, expect_exec, expect_outcome, ctx_over in scenarios:
        autonomy = ctx_over.pop("autonomy", K.A3)
        ctx = _ctx(autonomy=autonomy, approver=approver, live_finding=finding, **ctx_over)
        proposal = _prop(action, target, proposed_by=agent)

        before = ws.snapshot()
        applies_before = ws.applies
        rec = W.dispatch(agent, proposal, ctx, ws, records)
        after = ws.snapshot()

        commanded = ws.applies > applies_before
        # Invariants: the workspace is commanded exactly when the guard executed,
        # and the recorded outcome matches what the read-back should imply.
        invariant_ok = (
            commanded == rec["executed"] == expect_exec
            and rec["outcome"] == expect_outcome
            # A change to persisted state can only happen when we commanded it.
            and (before != after) <= commanded  # implication: changed => commanded
        )
        checks.append({"label": label, "outcome": rec["outcome"], "executed": rec["executed"],
                       "commanded": commanded, "ok": invariant_ok})

    return records, checks


def main():
    records, checks = run()
    failed = 0
    print("=" * 82)
    print("DEPLOYMENT DRY-RUN  (simulated workspace client -- NOT the live workspace)")
    print("=" * 82)
    for c in checks:
        mark = "PASS" if c["ok"] else "FAIL"
        if not c["ok"]:
            failed += 1
        print(f"{mark}  [{c['outcome']:<14}] executed={str(c['executed']):<5} "
              f"commanded={str(c['commanded']):<5}  {c['label']}")
    print("-" * 82)
    print(f"{len(records)} audit records; {'FAILED' if failed else 'OK'} ({failed} invariant failures)")
    print("Status earned here: DEPLOYMENT_READY. Live promotion to VERIFIED_IN_DEPLOYMENT "
          "requires the real workspace.")
    if "--json" in sys.argv:
        print(json.dumps(records, indent=2))
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
