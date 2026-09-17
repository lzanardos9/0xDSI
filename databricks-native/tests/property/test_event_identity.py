"""
Determinism + native-id contract for the shared event identity helper.

`derive_event_id` (notebooks/_shared/event_identity.py) is the single source of a
security event's stable id. Every deployed path (Bronze ingestion, the realtime
SDP stream, replay, investigation) derives ids through it so one physical source
record resolves to ONE logical id everywhere and a redelivery collapses onto its
existing row instead of duplicating.

The helper builds Spark Columns, so this test injects a small FUNCTIONAL fake for
the pyspark functions it uses (coalesce / sha2 / concat_ws / lit / cast) that
computes real Python values. That lets us prove the actual hashing semantics --
ordering, separator, scope, payload disambiguation, native-id precedence -- with
no Spark session, and pins the exact hash basis against an independent hashlib
reference so the identity can never silently change.

Run:  python3 databricks-native/tests/property/test_event_identity.py
"""

import hashlib
import os
import sys
import types


def _install_functions_fake():
    """Register a functional fake of pyspark.sql.functions that evaluates to real
    values, so derive_event_id can be imported and exercised offline."""

    class Val:
        __slots__ = ("v",)

        def __init__(self, v):
            self.v = v

        def cast(self, _t):
            return Val(None if self.v is None else str(self.v))

    def lit(v):
        return Val(v)

    def col(name):
        return Val(name)

    def coalesce(*cols):
        for c in cols:
            val = c.v if isinstance(c, Val) else c
            if val is not None:
                return Val(val)
        return Val(None)

    def concat_ws(sep, *cols):
        parts = [(c.v if isinstance(c, Val) else c) for c in cols]
        return Val(sep.join("" if p is None else str(p) for p in parts))

    def sha2(colv, _nbits):
        s = colv.v if isinstance(colv, Val) else colv
        return Val(hashlib.sha256(("" if s is None else str(s)).encode("utf-8")).hexdigest())

    fake = types.ModuleType("pyspark.sql.functions")
    fake.Val = Val
    fake.lit = lit
    fake.col = col
    fake.coalesce = coalesce
    fake.concat_ws = concat_ws
    fake.sha2 = sha2

    pyspark = types.ModuleType("pyspark")
    pyspark_sql = types.ModuleType("pyspark.sql")
    sys.modules.setdefault("pyspark", pyspark)
    sys.modules.setdefault("pyspark.sql", pyspark_sql)
    sys.modules["pyspark.sql.functions"] = fake
    return fake


_F = _install_functions_fake()
SHARED = os.path.join(os.path.dirname(__file__), "..", "..", "notebooks", "_shared")
sys.path.insert(0, os.path.abspath(SHARED))

import event_identity as E  # noqa: E402


def _derive(event_id, topic, partition, offset, payload, scope=E.IDENTITY_SCOPE):
    return E.derive_event_id(
        _F.lit(event_id), _F.lit(topic), _F.lit(partition),
        _F.lit(offset), _F.lit(payload), scope,
    ).v


def test_native_event_id_always_wins():
    assert _derive("native-123", "t", 1, 2, "payload") == "native-123"


def test_derivation_is_deterministic():
    a = _derive(None, "topic-a", 3, 99, "payload-x")
    b = _derive(None, "topic-a", 3, 99, "payload-x")
    assert a == b


def test_hash_basis_matches_independent_reference():
    """Pin the exact basis: scope || topic || partition || offset || payload."""
    got = _derive(None, "topic-a", 3, 99, "payload-x")
    expected = hashlib.sha256(
        E.IDENTITY_SEPARATOR.join(
            [E.IDENTITY_SCOPE, "topic-a", "3", "99", "payload-x"]
        ).encode("utf-8")
    ).hexdigest()
    assert got == expected


def test_payload_disambiguates_identical_coordinates():
    a = _derive(None, "files", 0, 0, "record-A")
    b = _derive(None, "files", 0, 0, "record-B")
    assert a != b, "degenerate partition/offset must still separate distinct payloads"


def test_identical_redelivery_is_idempotent():
    a = _derive(None, "files", 0, 0, "same-bytes")
    b = _derive(None, "files", 0, 0, "same-bytes")
    assert a == b, "a byte-identical redelivery must collapse onto one id"


def test_scope_change_changes_identity():
    a = _derive(None, "t", 1, 2, "p", scope="0xdsi:v1")
    b = _derive(None, "t", 1, 2, "p", scope="0xdsi:v2")
    assert a != b


def test_enrichment_columns_are_the_expected_shape():
    assert E.ENRICHMENT_COLUMNS == ("dest_domain", "url", "file_hash", "process_hash", "sha256")


if __name__ == "__main__":
    passed = 0
    failed = 0
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            try:
                fn()
                passed += 1
                print(f"PASS {name}")
            except AssertionError as e:
                failed += 1
                print(f"FAIL {name}: {e}")
    print(f"\n{passed} passed, {failed} failed")
    raise SystemExit(1 if failed else 0)
