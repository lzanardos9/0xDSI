"""
Canonical action identity and hashing (Phase 8).

A capability lease authorizes *one action*, not a moment in time. To bind a lease
to an action, both the issuer (at authorization) and the connector (immediately
before the effect) must agree on a single, stable fingerprint of that action.
This module produces it.

`action_hash(action)` canonicalizes the fields that define what is about to
happen -- which agent, doing what, to which target, under which finding revision
-- and returns a SHA-256 over a deterministic serialization. Two calls agree iff
the action is the same; if the target (or any bound field) is changed after the
lease is minted, the recomputed hash differs and redemption fails
ARGUMENT_MISMATCH. That is the time-of-check/time-of-use guard: the connector
never trusts that the action it is executing is the action that was authorized --
it re-derives the fingerprint and compares.

Canonicalization is intentionally narrow and total: unknown fields are ignored,
missing fields normalize to "" (not an error), and identity-like fields are
case-folded, so cosmetic differences never change the hash while a real argument
change always does. Pure stdlib.
"""

import hashlib
import json

# The fields that define an action's identity for authorization. Anything not in
# this tuple (reason text, confidence, timestamps) is deliberately excluded: it
# does not change *what* is being done and must not change the fingerprint.
CANONICAL_FIELDS = ("agent_key", "action_type", "target", "finding_id", "finding_revision")

# Identity-like fields are case-insensitive; targets and ids are compared exactly
# (after trimming) because case can be significant in a hostname or resource id.
_CASEFOLDED = frozenset({"agent_key", "action_type"})


def _norm(value) -> str:
    return "" if value is None else str(value).strip()


def canonicalize(action) -> dict:
    """Return the canonical, hashable view of an action.

    Missing fields normalize to "" so a partially-specified action still hashes
    deterministically; only the CANONICAL_FIELDS participate.
    """
    out = {}
    for field in CANONICAL_FIELDS:
        v = _norm(action.get(field))
        out[field] = v.lower() if field in _CASEFOLDED else v
    return out


def action_hash(action) -> str:
    """Return the stable SHA-256 fingerprint of an action's identity."""
    payload = json.dumps(canonicalize(action), sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()
