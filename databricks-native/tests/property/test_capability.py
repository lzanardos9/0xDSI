"""
Adversarial property tests for capability leases (Phase 8).

A capability lease is the authorization currency: authorized intent is not the
same as an executable capability. These tests are written as an attacker would
probe them -- each one is an attempt to get an effect the lease should no longer
(or never) grant:

  - argument changed after authorization (TOCTOU)      -> ARGUMENT_MISMATCH
  - forged / edited lease (widen uses, push expiry)     -> SIGNATURE_INVALID
  - out of the time window                              -> EXPIRED / NOT_YET_VALID
  - revoked before or between checks                    -> REVOKED
  - replay of a single-use lease                        -> EXHAUSTED
  - concurrent race for one single-use lease            -> exactly one winner
  - presented by the wrong holder                       -> HOLDER_MISMATCH
  - malformed lease                                     -> MALFORMED

The final block drives the same properties end-to-end through the enforcement
chokepoint's connector-revalidation hook (Gate 2): a bad capability must mean the
workspace is never touched and the attempt is recorded NOT_AUTHORIZED.

Everything runs offline: no Spark, no database, no live target.

Run:  python3 databricks-native/tests/property/test_capability.py
"""

import os
import sys
import threading

SHARED = os.path.join(os.path.dirname(__file__), "..", "..", "notebooks", "_shared")
sys.path.insert(0, os.path.abspath(SHARED))

import canonical_action as CA  # noqa: E402
import capability as C  # noqa: E402
import enforcement as E  # noqa: E402
import reason_codes as RC  # noqa: E402
import workspace_dispatch as W  # noqa: E402

KEY = "server-held-secret-key"
WRONG_KEY = "attacker-guessed-key"

# The action a lease is minted for. finding_revision matches the CONFIRMED
# finding the chokepoint binds to, so the Gate 2 tests line up exactly.
ACTION = {"agent_key": "vanguard", "action_type": "isolate_host",
          "target": "host:1", "finding_id": "f1", "finding_revision": 3}


def _hash(**over):
    a = dict(ACTION)
    a.update(over)
    return CA.action_hash(a)


def _lease(store=None, **over):
    kw = {"action_hash": _hash(), "issued_to": "vanguard", "issued_by": "op-ciso"}
    kw.update(over)
    return C.issue(KEY, **kw)


# --- canonical action hashing -------------------------------------------------

def test_same_action_same_hash():
    assert _hash() == _hash()


def test_changed_target_changes_hash():
    assert _hash(target="host:2") != _hash()


def test_agent_and_action_are_case_folded_but_target_is_not():
    assert _hash(agent_key="VANGUARD", action_type="ISOLATE_HOST") == _hash()
    assert _hash(target="HOST:1") != _hash()


def test_cosmetic_fields_do_not_affect_hash():
    # Fields outside the canonical set never change the fingerprint.
    a = dict(ACTION)
    a.update({"reason": "whatever", "confidence": 0.99, "recorded_at": "now"})
    assert CA.action_hash(a) == _hash()


# --- lease happy path ---------------------------------------------------------

def test_verify_then_redeem_then_replay_exhausted():
    store = C.InMemoryConsumptionStore()
    lease = _lease()
    ok, r = C.verify(KEY, lease, expected_action_hash=_hash(), store=store)
    assert ok and r == RC.OK
    # verify did not consume: still redeemable.
    ok, r = C.redeem(KEY, lease, expected_action_hash=_hash(), store=store)
    assert ok and r == RC.OK
    # replay of a single-use lease is refused.
    ok, r = C.redeem(KEY, lease, expected_action_hash=_hash(), store=store)
    assert not ok and r == RC.EXHAUSTED


def test_multi_use_lease_grants_exactly_max_uses():
    store = C.InMemoryConsumptionStore()
    lease = _lease(store=store, max_uses=2)
    assert C.redeem(KEY, lease, expected_action_hash=_hash(), store=store)[0] is True
    assert C.redeem(KEY, lease, expected_action_hash=_hash(), store=store)[0] is True
    ok, r = C.redeem(KEY, lease, expected_action_hash=_hash(), store=store)
    assert not ok and r == RC.EXHAUSTED


# --- adversarial: argument binding (TOCTOU) -----------------------------------

def test_argument_change_after_mint_is_mismatch_and_consumes_nothing():
    store = C.InMemoryConsumptionStore()
    lease = _lease()  # minted for host:1
    # Attacker redeems for a different target.
    ok, r = C.redeem(KEY, lease, expected_action_hash=_hash(target="host:2"), store=store)
    assert not ok and r == RC.ARGUMENT_MISMATCH
    assert store.uses(lease["capability_id"]) == 0  # no use burned
    # The lease is still good for its real action.
    assert C.redeem(KEY, lease, expected_action_hash=_hash(), store=store)[0] is True


# --- adversarial: forgery / tampering -----------------------------------------

def test_wrong_key_fails_signature():
    lease = _lease()
    ok, r = C.verify(WRONG_KEY, lease, expected_action_hash=_hash())
    assert not ok and r == RC.SIGNATURE_INVALID


def test_widening_max_uses_breaks_signature():
    lease = _lease()
    lease["max_uses"] = 999
    ok, r = C.verify(KEY, lease, expected_action_hash=_hash())
    assert not ok and r == RC.SIGNATURE_INVALID


def test_pushing_out_expiry_breaks_signature():
    lease = _lease()
    lease["expires_at"] = lease["expires_at"] + 10 ** 9
    ok, r = C.verify(KEY, lease, expected_action_hash=_hash())
    assert not ok and r == RC.SIGNATURE_INVALID


def test_swapping_action_hash_breaks_signature():
    # Editing the bound hash to match a different action is caught as forgery,
    # not merely as a mismatch.
    lease = _lease()
    lease["action_hash"] = _hash(target="host:2")
    ok, r = C.verify(KEY, lease, expected_action_hash=_hash(target="host:2"))
    assert not ok and r == RC.SIGNATURE_INVALID


# --- adversarial: time window -------------------------------------------------

def test_expired_lease_is_refused():
    lease = _lease(now=1000, ttl_seconds=60)  # valid [1000, 1060)
    ok, r = C.verify(KEY, lease, expected_action_hash=_hash(), now=1060)
    assert not ok and r == RC.EXPIRED


def test_not_yet_valid_lease_is_refused():
    lease = _lease(now=1000, ttl_seconds=60)
    ok, r = C.verify(KEY, lease, expected_action_hash=_hash(), now=999)
    assert not ok and r == RC.NOT_YET_VALID


# --- adversarial: revocation --------------------------------------------------

def test_revoked_before_use_is_refused():
    store = C.InMemoryConsumptionStore()
    lease = _lease()
    store.revoke(lease["capability_id"])
    ok, r = C.redeem(KEY, lease, expected_action_hash=_hash(), store=store)
    assert not ok and r == RC.REVOKED


def test_authorize_then_revoke_then_execute_is_refused():
    # verify succeeds, operator revokes, redemption must now fail closed.
    store = C.InMemoryConsumptionStore()
    lease = _lease()
    assert C.verify(KEY, lease, expected_action_hash=_hash(), store=store)[0] is True
    store.revoke(lease["capability_id"])
    ok, r = C.redeem(KEY, lease, expected_action_hash=_hash(), store=store)
    assert not ok and r == RC.REVOKED


# --- adversarial: holder + shape ----------------------------------------------

def test_holder_mismatch_is_refused():
    lease = _lease(issued_to="vanguard")
    ok, r = C.verify(KEY, lease, expected_action_hash=_hash(), holder="sentinel")
    assert not ok and r == RC.HOLDER_MISMATCH


def test_malformed_lease_is_refused():
    ok, r = C.verify(KEY, {"nope": True}, expected_action_hash=_hash())
    assert not ok and r == RC.MALFORMED
    ok, r = C.verify(KEY, "not-a-lease", expected_action_hash=_hash())
    assert not ok and r == RC.MALFORMED


# --- adversarial: concurrency race --------------------------------------------

def test_concurrent_redemption_of_single_use_has_exactly_one_winner():
    store = C.InMemoryConsumptionStore()
    lease = _lease()
    h = _hash()
    results = []
    lock = threading.Lock()

    def worker():
        ok, _ = C.redeem(KEY, lease, expected_action_hash=h, store=store)
        with lock:
            results.append(ok)

    threads = [threading.Thread(target=worker) for _ in range(50)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert sum(1 for ok in results if ok) == 1, results
    assert store.uses(lease["capability_id"]) == 1


# --- Gate 2: connector revalidation through the enforcement chokepoint --------

class FakeWorkspace:
    def __init__(self, observed="isolated"):
        self.observed = observed
        self.apply_calls = 0
        self.observe_calls = 0

    def apply(self, action_type, target):
        self.apply_calls += 1

    def observe(self, action_type, target):
        self.observe_calls += 1
        return self.observed


CONFIRMED = {"finding_id": "f1", "state": "CONFIRMED", "revision": 3}


def _prop(**over):
    p = {"action_type": "isolate_host", "target": "host:1", "reason": "threat",
         "proposed_by": "vanguard", "confidence": 0.9, "finding_id": "f1"}
    p.update(over)
    return p


def _ctx():
    return {"agent": {"autonomy": "A3", "lifecycle": "active"}, "target_in_scope": True,
            "is_sandbox_target": False, "approver": "op-ciso", "live_finding": CONFIRMED}


def test_gate2_valid_capability_permits_the_effect():
    store = C.InMemoryConsumptionStore()
    lease = _lease()  # bound to ACTION, whose finding_revision=3 matches CONFIRMED
    cv = C.connector_verify(KEY, lease, store)
    ws = FakeWorkspace(observed="isolated")
    ledger = []
    rec = W.dispatch("vanguard", _prop(), _ctx(), ws, ledger, connector_verify=cv)
    assert rec["outcome"] == E.VERIFIED
    assert ws.apply_calls == 1
    assert store.uses(lease["capability_id"]) == 1
    assert len(ledger) == 1


def test_gate2_argument_mismatch_never_touches_workspace():
    # Lease minted for host:2, but the proposal (and its recomputed hash) is host:1.
    store = C.InMemoryConsumptionStore()
    lease = _lease(action_hash=_hash(target="host:2"))
    cv = C.connector_verify(KEY, lease, store)
    ws = FakeWorkspace()
    ledger = []
    rec = W.dispatch("vanguard", _prop(target="host:1"), _ctx(), ws, ledger, connector_verify=cv)
    assert rec["outcome"] == E.NOT_AUTHORIZED
    assert rec["executed"] is False
    assert ws.apply_calls == 0
    assert store.uses(lease["capability_id"]) == 0
    assert len(ledger) == 1


def test_gate2_replayed_capability_second_dispatch_is_blocked():
    store = C.InMemoryConsumptionStore()
    lease = _lease()
    cv = C.connector_verify(KEY, lease, store)
    ws1, ws2 = FakeWorkspace(observed="isolated"), FakeWorkspace(observed="isolated")
    rec1 = W.dispatch("vanguard", _prop(), _ctx(), ws1, [], connector_verify=cv)
    rec2 = W.dispatch("vanguard", _prop(), _ctx(), ws2, [], connector_verify=cv)
    assert rec1["outcome"] == E.VERIFIED and ws1.apply_calls == 1
    assert rec2["outcome"] == E.NOT_AUTHORIZED and ws2.apply_calls == 0


def test_gate2_revoked_capability_blocks_the_effect():
    store = C.InMemoryConsumptionStore()
    lease = _lease()
    cv = C.connector_verify(KEY, lease, store)
    store.revoke(lease["capability_id"])
    ws = FakeWorkspace()
    rec = W.dispatch("vanguard", _prop(), _ctx(), ws, [], connector_verify=cv)
    assert rec["outcome"] == E.NOT_AUTHORIZED
    assert ws.apply_calls == 0


def test_gate2_absent_hook_preserves_prior_behaviour():
    # No connector_verify supplied: dispatch behaves exactly as before Phase 8.
    ws = FakeWorkspace(observed="isolated")
    rec = W.dispatch("vanguard", _prop(), _ctx(), ws, [])
    assert rec["outcome"] == E.VERIFIED and ws.apply_calls == 1


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
