"""
Mandatory, fail-closed audit persistence for privileged mutations (REV2-29).

A privileged action that cannot be recorded must not silently proceed as if it
had been. The prior `_audit_log` swallowed every exception, so if the audit
table was briefly unavailable the mutation still went through with no trace --
exactly the gap this module closes.

The guarantee here: an audit record is persisted to the primary store, or, if
that write fails, to a durable append-only local journal. Only if BOTH sinks
fail does `persist_audit` raise, so the caller (which audits write-ahead, before
the mutation) refuses the privileged action. An audited action is never lost and
an un-auditable action never runs.

Pure stdlib and dependency-injected (the primary writer is passed in), so the
decision and the journal are exercised by offline tests with no database.
"""

import json
import os
from datetime import datetime, timezone

# Fields every audit record must carry. A record missing any of these describes
# an action we cannot attribute or interpret, so it is rejected outright.
REQUIRED_FIELDS = ("user_email", "username", "operation", "table_name", "timestamp")


class AuditPersistenceError(Exception):
    """Raised when an audit record could not be persisted to any sink."""


def build_audit_record(user, operation, table, detail="", ts=None):
    """Assemble a complete audit record, raising if a required field is empty.

    `operation` and `table` are mandatory: an audit line that does not say what
    was done, to what, is not auditable.
    """
    if not operation:
        raise ValueError("audit record requires a non-empty operation")
    if not table:
        raise ValueError("audit record requires a non-empty table_name")
    record = {
        "user_email": (user or {}).get("email") or "unknown",
        "username": (user or {}).get("username") or "unknown",
        "operation": operation,
        "table_name": table,
        "detail": (detail or "")[:1000],
        "timestamp": ts or datetime.now(timezone.utc).isoformat(),
    }
    missing = [f for f in REQUIRED_FIELDS if not record.get(f)]
    if missing:
        raise ValueError(f"audit record missing required fields: {missing}")
    return record


def journal_append(record, journal_path):
    """Append one audit record as a JSON line to a durable local journal.

    The journal is the fallback sink when the primary store is unreachable. It
    is append-only (mode 'a') and flushed+fsync'd before returning so a crash
    right after cannot lose the line. Raises on any I/O failure so the caller
    can escalate.
    """
    directory = os.path.dirname(os.path.abspath(journal_path))
    os.makedirs(directory, exist_ok=True)
    line = json.dumps(record, sort_keys=True, separators=(",", ":"))
    with open(journal_path, "a", encoding="utf-8") as fh:
        fh.write(line + "\n")
        fh.flush()
        os.fsync(fh.fileno())
    return True


def persist_audit(record, primary_writer, journal_path):
    """Persist an audit record, fail-closed.

    Tries `primary_writer(record)` first; on failure falls back to the durable
    journal. Returns a dict describing which sink accepted the record and any
    primary error. Raises AuditPersistenceError only when neither sink accepts
    it -- that is the signal for the caller to refuse the privileged mutation.
    """
    try:
        primary_writer(record)
        return {"persisted": True, "sink": "primary", "primary_error": None}
    except Exception as primary_error:  # noqa: BLE001 - fall back, do not swallow
        try:
            journal_append(record, journal_path)
            return {
                "persisted": True,
                "sink": "journal",
                "primary_error": str(primary_error),
            }
        except Exception as journal_error:  # noqa: BLE001
            raise AuditPersistenceError(
                f"audit not persisted: primary failed ({primary_error}); "
                f"journal failed ({journal_error})"
            ) from journal_error
