"""
Stable reason codes for capability-lease enforcement (Phase 8).

A capability lease is the authorization *currency*: authorized intent is not the
same thing as an executable capability. When a redemption is refused, the refusal
must be explainable and greppable, not a bare boolean -- so every capability
check returns exactly one of these codes. They are kept separate from the
authority-kernel reason codes because they answer a different question: the
kernel answers "may this be attempted"; these answer "is this specific, minted
permission still good for this specific effect right now".

Pure stdlib and side-effect free, so the codes are the one source of truth shared
by the capability module, the enforcement chokepoint and the offline tests.
"""

OK = "OK"

# The lease is well-formed and correctly signed, but the effect it is being
# redeemed for is not the effect it was minted for -- the argument changed
# between authorization and use (TOCTOU). This is the property that makes a lease
# bind to an action rather than merely to a moment.
ARGUMENT_MISMATCH = "CAPABILITY.ARGUMENT_MISMATCH"

# The signature does not verify under the server key: the lease was forged or
# tampered (including editing max_uses, expiry or the action hash after minting).
SIGNATURE_INVALID = "CAPABILITY.SIGNATURE_INVALID"

# Time-window failures.
EXPIRED = "CAPABILITY.EXPIRED"
NOT_YET_VALID = "CAPABILITY.NOT_YET_VALID"

# The lease was explicitly revoked before it could be redeemed.
REVOKED = "CAPABILITY.REVOKED"

# All permitted uses have been consumed (a single-use lease redeemed twice, a
# replay). Concurrent redemptions of one single-use lease resolve to exactly one
# OK and the rest EXHAUSTED.
EXHAUSTED = "CAPABILITY.EXHAUSTED"

# The holder presenting the lease is not the identity it was issued to.
HOLDER_MISMATCH = "CAPABILITY.HOLDER_MISMATCH"

# The lease object is missing required fields or is not a lease at all.
MALFORMED = "CAPABILITY.MALFORMED"

CATALOG = (
    {"reason_code": OK, "why": "The capability is valid and a use was granted."},
    {"reason_code": ARGUMENT_MISMATCH,
     "why": "The lease was minted for a different action; the argument changed since authorization (TOCTOU)."},
    {"reason_code": SIGNATURE_INVALID,
     "why": "The lease signature does not verify under the server key: forged or tampered."},
    {"reason_code": EXPIRED, "why": "The lease's validity window has passed."},
    {"reason_code": NOT_YET_VALID, "why": "The lease is not yet valid (not_before is in the future)."},
    {"reason_code": REVOKED, "why": "The lease was revoked before redemption."},
    {"reason_code": EXHAUSTED, "why": "All permitted uses have been consumed (replay or race loser)."},
    {"reason_code": HOLDER_MISMATCH, "why": "The presenter is not the identity the lease was issued to."},
    {"reason_code": MALFORMED, "why": "The lease is missing required fields or is not a lease."},
)

_CATALOG_BY_CODE = {row["reason_code"]: row for row in CATALOG}


def why(code) -> str:
    row = _CATALOG_BY_CODE.get(code)
    return row["why"] if row else code
