"""
Capability leases -- authorization as single-use, argument-bound currency (Phase 8).

Up to Phase 7 an authorized action was a boolean state: the response-action
lifecycle recorded that a different operator approved a proposal bound to a
finding revision. That is necessary but it is not *currency*: nothing stopped the
same approval from being replayed, raced, or reused after the target argument
changed. This module turns authorization into a lease that is:

  - Bound to one action. The lease carries the `action_hash` (see
    `canonical_action`) it was minted for. The connector recomputes the hash of
    the action it is about to perform and refuses (ARGUMENT_MISMATCH) if it
    differs -- a time-of-check/time-of-use guard.
  - Unforgeable. The lease is signed with a server-held HMAC key the agent never
    sees. Any edit -- widening `max_uses`, pushing out `expires_at`, swapping the
    `action_hash` -- breaks the signature (SIGNATURE_INVALID).
  - Single-use by default and race-safe. Redemption consumes a use atomically
    through an injected store; two concurrent redemptions of a single-use lease
    resolve to exactly one OK and the rest EXHAUSTED. Replays are EXHAUSTED.
  - Time-boxed and revocable. Outside its window it is EXPIRED / NOT_YET_VALID;
    an operator can REVOKE it before use.

`verify` is a read-only check (does not consume); `redeem` verifies *and*
atomically claims one use -- it is the only function that grants an effect, so
"authorized intent" (a verify) and "an executable capability" (a redeem) are
distinct on purpose.

The consumption store is injected (duck-typed: `uses`, `is_revoked`, `revoke`,
`try_consume`). `InMemoryConsumptionStore` is the offline/test implementation and
is thread-safe; deployment supplies a Delta/Supabase-backed store with the same
contract. Pure stdlib, so the whole lease lifecycle is exercised offline with no
database.
"""

import hashlib
import hmac
import json
import os
import threading
import time

import canonical_action as CA
import reason_codes as RC

# Fields covered by the signature. `signature` itself is excluded (it is the
# output); everything an attacker might want to change to widen the grant is in.
_SIGNED_FIELDS = (
    "capability_id", "action_hash", "issued_to", "issued_by",
    "not_before", "expires_at", "max_uses", "nonce",
)

DEFAULT_TTL_SECONDS = 300


class CapabilityError(Exception):
    """Raised for misuse of the lease API (bad key, non-positive max_uses)."""


def _now() -> int:
    return int(time.time())


def _norm(value) -> str:
    return "" if value is None else str(value).strip()


def _key_bytes(key) -> bytes:
    if isinstance(key, str):
        key = key.encode("utf-8")
    if not key:
        raise CapabilityError("signing key must be a non-empty bytes/str")
    return key


def _canonical_signing_bytes(lease) -> bytes:
    payload = {f: lease.get(f) for f in _SIGNED_FIELDS}
    return json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")


def _sign(key, lease) -> str:
    return hmac.new(_key_bytes(key), _canonical_signing_bytes(lease), hashlib.sha256).hexdigest()


def _token(n_bytes) -> str:
    return os.urandom(n_bytes).hex()


def issue(key, *, action_hash, issued_to, issued_by,
          ttl_seconds=DEFAULT_TTL_SECONDS, max_uses=1, now=None, nonce=None) -> dict:
    """Mint a signed lease binding `action_hash` to `issued_to` for `max_uses`.

    `key` is the server-held signing secret (never given to the agent). The
    returned lease is a plain dict safe to persist and hand to the holder; only
    the server key can produce or alter its signature.
    """
    if int(max_uses) < 1:
        raise CapabilityError("max_uses must be >= 1")
    if int(ttl_seconds) <= 0:
        raise CapabilityError("ttl_seconds must be > 0")
    base = _now() if now is None else int(now)
    lease = {
        "capability_id": _token(16),
        "action_hash": action_hash,
        "issued_to": _norm(issued_to),
        "issued_by": _norm(issued_by),
        "not_before": base,
        "expires_at": base + int(ttl_seconds),
        "max_uses": int(max_uses),
        "nonce": nonce or _token(8),
    }
    lease["signature"] = _sign(key, lease)
    return lease


def _signature_ok(key, lease) -> bool:
    sig = lease.get("signature")
    if not isinstance(sig, str):
        return False
    # Constant-time compare so a wrong signature leaks no timing information.
    return hmac.compare_digest(sig, _sign(key, lease))


def verify(key, lease, *, expected_action_hash, holder=None, now=None, store=None):
    """Return (ok, reason_code) for a lease WITHOUT consuming a use.

    Checks, in order: shape, signature (tamper), argument binding (TOCTOU),
    holder, time window, and -- if a store is given -- revocation and remaining
    uses. Read-only: two verifies never change state.
    """
    if not isinstance(lease, dict):
        return False, RC.MALFORMED
    if any(f not in lease for f in _SIGNED_FIELDS) or "signature" not in lease:
        return False, RC.MALFORMED

    # Signature first: reject a forged/edited lease before trusting any field.
    if not _signature_ok(key, lease):
        return False, RC.SIGNATURE_INVALID

    # Argument binding: the effect must be the one the lease was minted for.
    if lease["action_hash"] != expected_action_hash:
        return False, RC.ARGUMENT_MISMATCH

    if holder is not None and _norm(holder) != lease["issued_to"]:
        return False, RC.HOLDER_MISMATCH

    moment = _now() if now is None else int(now)
    if moment < int(lease["not_before"]):
        return False, RC.NOT_YET_VALID
    if moment >= int(lease["expires_at"]):
        return False, RC.EXPIRED

    if store is not None:
        if store.is_revoked(lease["capability_id"]):
            return False, RC.REVOKED
        if store.uses(lease["capability_id"]) >= int(lease["max_uses"]):
            return False, RC.EXHAUSTED

    return True, RC.OK


def redeem(key, lease, *, expected_action_hash, store, holder=None, now=None):
    """Verify a lease and atomically claim one use. The only grant of an effect.

    Returns (True, OK) iff the lease verifies and a use was successfully claimed.
    The claim is atomic in the store, so concurrent redemptions of a single-use
    lease yield exactly one success; every other caller gets EXHAUSTED.
    """
    ok, reason = verify(key, lease, expected_action_hash=expected_action_hash,
                        holder=holder, now=now, store=store)
    if not ok:
        return False, reason
    if not store.try_consume(lease["capability_id"], int(lease["max_uses"])):
        # Lost a race, or revoked between verify and consume: fail closed.
        return False, RC.EXHAUSTED
    return True, RC.OK


def connector_verify(key, lease, store, *, holder=None, now_fn=None):
    """Build the connector-side revalidation callback for the enforcement chokepoint.

    The returned callable takes the action dict the connector is about to execute,
    recomputes its `action_hash`, and redeems the lease against it -- so the
    connector independently re-checks authorization at the moment of effect rather
    than trusting the decision made earlier. Returns (ok, reason_code).
    """
    def _verify(action):
        expected = CA.action_hash(action)
        now = None if now_fn is None else now_fn()
        return redeem(key, lease, expected_action_hash=expected, store=store,
                      holder=holder, now=now)

    return _verify


class InMemoryConsumptionStore:
    """Thread-safe, in-memory consumption store: the offline/test implementation.

    Deployment replaces this with a Delta/Supabase-backed store exposing the same
    four methods; the atomicity that makes single-use safe lives in `try_consume`.
    """

    def __init__(self):
        self._lock = threading.Lock()
        self._uses = {}
        self._revoked = set()

    def uses(self, capability_id) -> int:
        with self._lock:
            return self._uses.get(capability_id, 0)

    def is_revoked(self, capability_id) -> bool:
        with self._lock:
            return capability_id in self._revoked

    def revoke(self, capability_id) -> None:
        with self._lock:
            self._revoked.add(capability_id)

    def try_consume(self, capability_id, max_uses) -> bool:
        """Atomically grant one use if any remain and the lease is not revoked."""
        with self._lock:
            if capability_id in self._revoked:
                return False
            used = self._uses.get(capability_id, 0)
            if used >= int(max_uses):
                return False
            self._uses[capability_id] = used + 1
            return True
