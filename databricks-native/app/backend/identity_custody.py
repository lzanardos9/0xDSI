"""
Chain-of-custody sealing for identity events: a SHA-256 digest of the canonical record plus an HMAC-SHA256
signature binding the event id, digest and sealing time to a server-held key. Pure stdlib so it is testable alone.

Canonical form: JSON with keys sorted, no whitespace, UTF-8 (not ASCII-escaped). Timestamps are ISO strings,
decimals and integral floats become integers, so the browser can rebuild the exact same bytes from the response.
"""

import hashlib
import hmac
import json
import os
from datetime import date, datetime, timezone
from decimal import Decimal

ALGORITHM = "HMAC-SHA256"
DIGEST_ALGORITHM = "SHA-256"
CANONICALIZATION = "JSON, keys sorted, no whitespace, UTF-8"
KEY_ENV = "IDENTITY_CUSTODY_KEY"


def normalize(v):
    if isinstance(v, dict):
        return {str(k): normalize(x) for k, x in v.items()}
    if isinstance(v, (list, tuple)):
        return [normalize(x) for x in v]
    if isinstance(v, datetime):
        if v.tzinfo is None:
            v = v.replace(tzinfo=timezone.utc)
        return v.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
    if isinstance(v, date):
        return v.isoformat()
    if isinstance(v, Decimal):
        return int(v) if v == v.to_integral_value() else float(v)
    if isinstance(v, float) and v.is_integer() and abs(v) < 2 ** 53:
        return int(v)
    if hasattr(v, "tolist"):
        return normalize(v.tolist())
    return v


def canonical(record: dict) -> str:
    return json.dumps(normalize(record), sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False)


def digest(record: dict) -> str:
    return hashlib.sha256(canonical(record).encode("utf-8")).hexdigest()


def seal_message(event_id: str, record_digest: str, signed_at: str) -> str:
    return f"{event_id}\n{record_digest}\n{signed_at}"


def key_id(key: bytes) -> str:
    return "k-" + hashlib.sha256(key).hexdigest()[:12]


def sign(key: bytes, event_id: str, record_digest: str, signed_at: str) -> str:
    return hmac.new(key, seal_message(event_id, record_digest, signed_at).encode("utf-8"), hashlib.sha256).hexdigest()


def verify(key: bytes, event_id: str, record_digest: str, signed_at: str, signature: str) -> bool:
    return hmac.compare_digest(sign(key, event_id, record_digest, signed_at), str(signature or ""))


def load_key():
    raw = os.environ.get(KEY_ENV, "").strip()
    return raw.encode("utf-8") if len(raw) >= 32 else None


def seal(record: dict, key, signed_at: str = None) -> dict:
    signed_at = signed_at or datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    d = digest(record)
    return {
        "algorithm": ALGORITHM if key else None,
        "digest_algorithm": DIGEST_ALGORITHM,
        "canonicalization": CANONICALIZATION,
        "digest": d,
        "signature": sign(key, str(record.get("event_id")), d, signed_at) if key else None,
        "key_id": key_id(key) if key else None,
        "signed_at": signed_at,
    }
