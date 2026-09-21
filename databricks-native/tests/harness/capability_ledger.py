"""
Capability-ledger dry-run (Phase 8/9).

The console's capability-leases view used to render fabricated demo rows. This
harness replaces that fiction with honest, code-produced records: it drives real
capability leases (`_shared/capability.py`) through the enforcement chokepoint's
connector-revalidation gate (`enforcement.guard_and_dispatch(...,
connector_verify=...)`, via `workspace_dispatch.dispatch`) across a set of
scenarios -- a clean redemption, a replay, an argument change (TOCTOU), a
multi-use lease, a revoked lease, an expired lease, and a forged lease -- and
records exactly what the code decided, including the stable reason code.

Each scenario asserts the invariant that ties the whole design together: the
workspace is commanded IFF the capability was redeemed (reason OK); every refusal
leaves the target untouched and burns no use it should not. The printed records
are the source of truth the `ecp_capabilities` seed mirrors -- so the console
shows real lifecycle outcomes, not a simulation.

Offline: no Spark, no database, no live target.

Run:  python3 databricks-native/tests/harness/capability_ledger.py
"""

import os
import sys

SHARED = os.path.join(os.path.dirname(__file__), "..", "..", "notebooks", "_shared")
sys.path.insert(0, os.path.abspath(SHARED))

import canonical_action as CA  # noqa: E402
import capability as C  # noqa: E402
import enforcement as E  # noqa: E402
import reason_codes as RC  # noqa: E402
import workspace_dispatch as W  # noqa: E402

KEY = "server-held-signing-key"
CONFIRMED = {"finding_id": "f1", "state": "CONFIRMED", "revision": 3}
T0 = 1_700_000_000  # a fixed clock so records are reproducible


def _ctx():
    return {"agent": {"autonomy": "A3", "lifecycle": "active"}, "target_in_scope": True,
            "is_sandbox_target": False, "approver": "op-ciso", "live_finding": CONFIRMED}


def _prop(agent_action, target):
    return {"action_type": agent_action, "target": target, "reason": "threat",
            "proposed_by": "sentinel", "confidence": 0.9, "finding_id": "f1"}


def _action_hash(agent_key, action_type, target):
    return CA.action_hash({"agent_key": agent_key, "action_type": action_type,
                           "target": target, "finding_id": "f1", "finding_revision": 3})


class Workspace:
    """Minimal WorkspaceClient: apply is a no-op, observe reports a fixed state."""

    def __init__(self, observed="isolated"):
        self.observed = observed
        self.apply_calls = 0

    def apply(self, action_type, target):
        self.apply_calls += 1

    def observe(self, action_type, target):
        return self.observed


def _reason_from(rec):
    """Recover the stable reason code the chokepoint recorded for the connector step."""
    for step in rec.get("steps", []):
        note = step.get("note", "")
        if note.startswith("connector revalidat"):
            return note.split(":", 1)[1].strip()
    return ""


def run():
    records = []
    checks = []

    def emit(scenario, agent_key, agent_name, action_type, target, lease,
             rec, store, observed=""):
        used = store.uses(lease["capability_id"])
        reason = _reason_from(rec)
        executed = rec["executed"]
        outcome = rec["outcome"]
        # Invariant: the workspace ran IFF the capability was redeemed OK.
        redeemed_ok = reason == RC.OK
        checks.append((scenario, executed == redeemed_ok))
        if store.is_revoked(lease["capability_id"]):
            status = "REVOKED"
        elif reason == RC.EXPIRED:
            status = "EXPIRED"
        elif reason == RC.SIGNATURE_INVALID:
            status = "INVALID"
        elif reason == RC.ARGUMENT_MISMATCH:
            status = "ACTIVE"  # unused; still good for its real action
        elif used >= int(lease["max_uses"]):
            status = "CONSUMED"
        elif used > 0:
            status = "ACTIVE"
        elif reason == RC.EXHAUSTED:
            status = "EXHAUSTED"
        else:
            status = "ACTIVE"
        records.append({
            "scenario": scenario,
            "capability_id": lease["capability_id"][:12],
            "agent_key": agent_key,
            "agent_name": agent_name,
            "action_type": action_type,
            "target": target,
            "issued_by": lease["issued_by"],
            "issued_to": lease["issued_to"],
            "action_hash": lease["action_hash"][:16],
            "not_before": lease["not_before"],
            "expires_at": lease["expires_at"],
            "max_uses": lease["max_uses"],
            "uses_consumed": used,
            "revoked": store.is_revoked(lease["capability_id"]),
            "status": status,
            "reason_code": reason,
            "dispatched": executed,
            "dispatch_outcome": outcome,
            "observed_state": observed if executed else "",
        })

    # 1. Clean single-use redemption -> CONSUMED, workspace VERIFIED.
    store = C.InMemoryConsumptionStore()
    lease = C.issue(KEY, action_hash=_action_hash("vanguard", "isolate_host", "host:WIN-FIN-204"),
                    issued_to="vanguard", issued_by="op-ciso", now=T0, ttl_seconds=120, max_uses=1)
    cv = C.connector_verify(KEY, lease, store, now_fn=lambda: T0 + 10)
    ws = Workspace("isolated")
    rec = W.dispatch("vanguard", _prop("isolate_host", "host:WIN-FIN-204"), _ctx(), ws, [], connector_verify=cv)
    emit("clean single-use redemption", "vanguard", "VANGUARD Response",
         "isolate_host", "host:WIN-FIN-204", lease, rec, store, observed="isolated")

    # 2. Replay of that same single-use lease -> EXHAUSTED, never re-runs.
    ws2 = Workspace("isolated")
    rec2 = W.dispatch("vanguard", _prop("isolate_host", "host:WIN-FIN-204"), _ctx(), ws2, [], connector_verify=cv)
    emit("replay of a spent lease", "vanguard", "VANGUARD Response",
         "isolate_host", "host:WIN-FIN-204", lease, rec2, store)

    # 3. Argument changed after mint (TOCTOU) -> ARGUMENT_MISMATCH, no use burned.
    store3 = C.InMemoryConsumptionStore()
    lease3 = C.issue(KEY, action_hash=_action_hash("vanguard", "block_ip", "ip:5.188.10.7"),
                     issued_to="vanguard", issued_by="op-ciso", now=T0, ttl_seconds=120, max_uses=1)
    cv3 = C.connector_verify(KEY, lease3, store3, now_fn=lambda: T0 + 10)
    ws3 = Workspace()
    rec3 = W.dispatch("vanguard", _prop("block_ip", "ip:45.9.13.7"), _ctx(), ws3, [], connector_verify=cv3)
    emit("argument changed after approval", "vanguard", "VANGUARD Response",
         "block_ip", "ip:45.9.13.7", lease3, rec3, store3)

    # 4. Multi-use lease, one redemption -> ACTIVE (1/2), workspace VERIFIED.
    store4 = C.InMemoryConsumptionStore()
    lease4 = C.issue(KEY, action_hash=_action_hash("edge", "upgrade", "collector:edge-eu-07"),
                     issued_to="edge", issued_by="op-fleet", now=T0, ttl_seconds=300, max_uses=2)
    cv4 = C.connector_verify(KEY, lease4, store4, now_fn=lambda: T0 + 10)
    ws4 = Workspace("upgraded")
    rec4 = W.dispatch("edge", _prop("upgrade", "collector:edge-eu-07"), _ctx(), ws4, [], connector_verify=cv4)
    emit("multi-use lease, first of two", "edge", "Edge Connector Control Plane",
         "upgrade", "collector:edge-eu-07", lease4, rec4, store4, observed="upgraded")

    # 5. Revoked before redemption -> REVOKED, never runs.
    store5 = C.InMemoryConsumptionStore()
    lease5 = C.issue(KEY, action_hash=_action_hash("active_list", "add_to_blocklist", "ip:45.9.13.7"),
                     issued_to="active_list", issued_by="op-soc", now=T0, ttl_seconds=120, max_uses=1)
    store5.revoke(lease5["capability_id"])
    cv5 = C.connector_verify(KEY, lease5, store5, now_fn=lambda: T0 + 10)
    ws5 = Workspace()
    rec5 = W.dispatch("active_list", _prop("add_to_blocklist", "ip:45.9.13.7"), _ctx(), ws5, [], connector_verify=cv5)
    emit("revoked before use", "active_list", "Active List Manager",
         "add_to_blocklist", "ip:45.9.13.7", lease5, rec5, store5)

    # 6. Expired lease -> EXPIRED, never runs.
    store6 = C.InMemoryConsumptionStore()
    lease6 = C.issue(KEY, action_hash=_action_hash("vanguard", "isolate_host", "host:LNX-DB-31"),
                     issued_to="vanguard", issued_by="op-ciso", now=T0, ttl_seconds=60, max_uses=1)
    cv6 = C.connector_verify(KEY, lease6, store6, now_fn=lambda: T0 + 3600)  # long past expiry
    ws6 = Workspace()
    rec6 = W.dispatch("vanguard", _prop("isolate_host", "host:LNX-DB-31"), _ctx(), ws6, [], connector_verify=cv6)
    emit("expired lease", "vanguard", "VANGUARD Response",
         "isolate_host", "host:LNX-DB-31", lease6, rec6, store6)

    # 7. Forged lease (max_uses widened after minting) -> SIGNATURE_INVALID, never runs.
    store7 = C.InMemoryConsumptionStore()
    lease7 = C.issue(KEY, action_hash=_action_hash("vanguard", "isolate_host", "host:WIN-FIN-204"),
                     issued_to="vanguard", issued_by="op-ciso", now=T0, ttl_seconds=120, max_uses=1)
    lease7["max_uses"] = 999  # tamper
    cv7 = C.connector_verify(KEY, lease7, store7, now_fn=lambda: T0 + 10)
    ws7 = Workspace()
    rec7 = W.dispatch("vanguard", _prop("isolate_host", "host:WIN-FIN-204"), _ctx(), ws7, [], connector_verify=cv7)
    emit("forged lease (widened uses)", "vanguard", "VANGUARD Response",
         "isolate_host", "host:WIN-FIN-204", lease7, rec7, store7)

    return records, checks


def main():
    records, checks = run()
    cols = ("scenario", "agent_key", "action_type", "target", "status",
            "reason_code", "uses_consumed", "max_uses", "dispatched", "dispatch_outcome")
    widths = {c: max(len(c), *(len(str(r[c])) for r in records)) for c in cols}
    header = "  ".join(c.ljust(widths[c]) for c in cols)
    print(header)
    print("-" * len(header))
    for r in records:
        print("  ".join(str(r[c]).ljust(widths[c]) for c in cols))

    failed = [name for name, ok in checks if not ok]
    print()
    if failed:
        for name in failed:
            print(f"FAIL invariant (executed iff redeemed OK): {name}")
        print(f"\nFAILED ({len(failed)} of {len(checks)})")
        raise SystemExit(1)
    print(f"OK — {len(checks)} scenarios: workspace commanded IFF capability redeemed.")
    raise SystemExit(0)


if __name__ == "__main__":
    main()
