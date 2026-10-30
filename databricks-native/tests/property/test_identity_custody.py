"""
Property tests for chain-of-custody sealing of identity events.

Run: python3 tests/property/test_identity_custody.py
"""
import os
import sys
from datetime import datetime, timezone, timedelta
from decimal import Decimal

BACKEND = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "app", "backend"))
sys.path.insert(0, BACKEND)

import identity_custody as C  # noqa: E402

KEY = b"k" * 40
ROW = {
    "event_id": "evt-1", "occurred_at": datetime(2026, 10, 30, 14, 2, 5, tzinfo=timezone.utc),
    "ingested_at": datetime(2026, 10, 30, 14, 2, 7), "provider": "entra_id", "tenant": None,
    "detail": '{"country":"BR","application":"Crew Portal"}', "rows": Decimal("4200"), "score": 3.0, "name": "Jo\u00e3o",
}


def test_canonical_is_sorted_compact_utf8():
    s = C.canonical({"b": 1, "a": [2.0, None], "c": "\u00e9"})
    assert s == '{"a":[2,null],"b":1,"c":"\u00e9"}'


def test_timestamps_normalize_to_utc_z():
    n = C.normalize(ROW)
    assert n["occurred_at"] == "2026-10-30T14:02:05Z"
    assert n["ingested_at"] == "2026-10-30T14:02:07Z"
    other = datetime(2026, 10, 30, 16, 2, 5, tzinfo=timezone(timedelta(hours=2)))
    assert C.normalize(other) == "2026-10-30T14:02:05Z"
    assert n["rows"] == 4200 and isinstance(n["rows"], int) and n["score"] == 3


def test_digest_is_stable_and_order_independent():
    a = C.digest(ROW)
    b = C.digest(dict(reversed(list(ROW.items()))))
    assert a == b and len(a) == 64
    assert C.digest(C.normalize(ROW)) == a


def test_any_change_breaks_the_digest():
    base = C.digest(ROW)
    for k, v in (("provider", "okta"), ("detail", '{"country":"US","application":"Crew Portal"}'), ("tenant", "")):
        assert C.digest({**ROW, k: v}) != base, k


def test_seal_signs_and_verifies():
    s = C.seal(ROW, KEY, "2026-10-30T15:00:00Z")
    assert s["algorithm"] == "HMAC-SHA256" and s["key_id"].startswith("k-") and len(s["signature"]) == 64
    assert C.verify(KEY, "evt-1", s["digest"], s["signed_at"], s["signature"])
    assert not C.verify(KEY, "evt-2", s["digest"], s["signed_at"], s["signature"])
    assert not C.verify(KEY, "evt-1", "0" * 64, s["signed_at"], s["signature"])
    assert not C.verify(KEY, "evt-1", s["digest"], "2026-10-30T15:00:01Z", s["signature"])
    assert not C.verify(b"x" * 40, "evt-1", s["digest"], s["signed_at"], s["signature"])
    assert not C.verify(KEY, "evt-1", s["digest"], s["signed_at"], "")


def test_unsigned_without_key():
    s = C.seal(ROW, None)
    assert s["signature"] is None and s["key_id"] is None and s["algorithm"] is None and len(s["digest"]) == 64


def test_short_keys_are_refused():
    os.environ[C.KEY_ENV] = "too-short"
    assert C.load_key() is None
    os.environ[C.KEY_ENV] = "y" * 32
    assert C.load_key() == b"y" * 32
    del os.environ[C.KEY_ENV]


if __name__ == "__main__":
    failed = 0
    for name, fn in list(globals().items()):
        if name.startswith("test_") and callable(fn):
            try:
                fn()
                print(f"PASS {name}")
            except Exception as e:  # noqa: BLE001
                failed += 1
                print(f"FAIL {name}: {e!r}")
    print(f"\n{'FAILED' if failed else 'OK'} ({failed} failed)")
    raise SystemExit(1 if failed else 0)
