"""
Deterministic idempotency keys and execution-identity stamping for evidence
writes (REV2-04, REV2-05).

REV2-04: evidence producers derive a content-addressed key from the fields that
identify a row, so a replayed or retried batch re-inserts nothing instead of
duplicating rows. The key is stable across runs and processes because it depends
only on the content, never on wall-clock time or a random uuid.

REV2-05: every persisted evidence row carries the execution-identity kernel
(execution_id, run_id, producer, schema_version, produced_at) so its provenance
is auditable long after the run that wrote it has ended.

This module is pure stdlib: it is importable inside notebooks (bare import, since
_shared is on sys.path) and exercised directly by offline tests with no Spark
session.
"""

import hashlib
from datetime import datetime, timezone

from contracts import EXECUTION_IDENTITY_FIELDS, SCHEMA_VERSION

# Sentinels used only inside the pre-hash encoding. A None part encodes to _NULL,
# which no length-prefixed string can produce, so None never collides with "".
_NULL = "\x00"
_SEP = "\x1f"

# The three fields a caller must supply; schema_version and produced_at are
# filled from the contract vocabulary when absent.
IDENTITY_REQUIRED = ("execution_id", "run_id", "producer")

# Re-exported so producers and tests name the identity columns from one place.
EVIDENCE_IDENTITY_COLUMNS = EXECUTION_IDENTITY_FIELDS


def idempotency_key(*parts):
    """Return a stable 64-char hex key derived from the ordered parts.

    The derivation is injective over part boundaries: each part is length-
    prefixed before it is joined, so ("a", "bc") and ("ab", "c") produce
    different keys. None is encoded distinctly from the empty string. The result
    depends only on the parts, so the same content always yields the same key.
    """
    if not parts:
        raise ValueError("idempotency_key requires at least one part")
    encoded = []
    for part in parts:
        if part is None:
            encoded.append(_NULL)
        else:
            text = str(part)
            encoded.append(f"{len(text)}:{text}")
    joined = _SEP.join(encoded)
    return hashlib.sha256(joined.encode("utf-8")).hexdigest()


def is_replay(key, seen_keys):
    """True when key is already present, i.e. an idempotent write is a no-op."""
    return key in seen_keys


def stamp_execution_identity(row, identity, produced_at=None):
    """Return a copy of row with the execution-identity kernel fields set.

    identity must carry execution_id, run_id and producer. schema_version and
    produced_at default to the contract vocabulary and the current UTC instant
    when not supplied. The input row is not mutated.
    """
    missing = [field for field in IDENTITY_REQUIRED if not identity.get(field)]
    if missing:
        raise ValueError(f"identity missing required fields: {missing}")
    if produced_at is None:
        produced_at = datetime.now(timezone.utc).isoformat()
    stamped = dict(row)
    stamped["execution_id"] = identity["execution_id"]
    stamped["run_id"] = identity["run_id"]
    stamped["producer"] = identity["producer"]
    stamped["schema_version"] = identity.get("schema_version", SCHEMA_VERSION)
    stamped["produced_at"] = produced_at
    # Guard against drift between this stamper and the contract kernel.
    assert set(EXECUTION_IDENTITY_FIELDS) <= set(stamped), "identity columns incomplete"
    return stamped
