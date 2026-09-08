"""
Property tests for mandatory, fail-closed audit persistence (REV2-29).

audit.py is pure stdlib and dependency-injected (the primary writer is passed
in), so putting app/backend on sys.path makes it importable with no database.
These tests pin the guarantee the privileged-mutation routes rely on: a record
is persisted to the primary store when it works, falls back to a durable
append-only journal when the primary write fails, and raises (so the caller
refuses the mutation) only when neither sink accepts it. They also pin that an
incomplete, unattributable record is rejected before it is ever written.

Run:  python3 databricks-native/tests/property/test_audit_persistence.py
"""

import json
import os
import sys
import tempfile

BACKEND = os.path.join(os.path.dirname(__file__), "..", "..", "app", "backend")
sys.path.insert(0, os.path.abspath(BACKEND))

import audit as A  # noqa: E402

USER = {"email": "analyst@corp.example", "username": "analyst"}


def _record():
    return A.build_audit_record(USER, "update", "response_actions", "detail")


def _tmp_journal():
    d = tempfile.mkdtemp()
    return os.path.join(d, "nested", "audit_journal.jsonl")


def test_build_record_has_required_fields():
    r = _record()
    for f in A.REQUIRED_FIELDS:
        assert r.get(f), f"missing {f}"
    assert r["operation"] == "update"
    assert r["table_name"] == "response_actions"


def test_build_record_rejects_missing_operation():
    try:
        A.build_audit_record(USER, "", "t")
        raise AssertionError("expected ValueError")
    except ValueError:
        pass


def test_build_record_rejects_missing_table():
    try:
        A.build_audit_record(USER, "update", "")
        raise AssertionError("expected ValueError")
    except ValueError:
        pass


def test_build_record_defaults_unknown_user():
    r = A.build_audit_record(None, "delete", "cases")
    assert r["user_email"] == "unknown"
    assert r["username"] == "unknown"


def test_detail_is_truncated():
    r = A.build_audit_record(USER, "rpc", "fn", "x" * 5000)
    assert len(r["detail"]) == 1000


def test_persist_uses_primary_when_it_works():
    seen = []
    out = A.persist_audit(_record(), lambda rec: seen.append(rec), _tmp_journal())
    assert out["persisted"] and out["sink"] == "primary"
    assert len(seen) == 1


def test_persist_falls_back_to_journal_on_primary_failure():
    path = _tmp_journal()

    def broken_writer(_rec):
        raise RuntimeError("warehouse unavailable")

    out = A.persist_audit(_record(), broken_writer, path)
    assert out["persisted"] and out["sink"] == "journal"
    assert "warehouse unavailable" in out["primary_error"]
    with open(path, encoding="utf-8") as fh:
        lines = fh.read().strip().splitlines()
    assert len(lines) == 1
    assert json.loads(lines[0])["table_name"] == "response_actions"


def test_journal_is_append_only():
    path = _tmp_journal()

    def broken_writer(_rec):
        raise RuntimeError("down")

    A.persist_audit(_record(), broken_writer, path)
    A.persist_audit(_record(), broken_writer, path)
    with open(path, encoding="utf-8") as fh:
        assert len(fh.read().strip().splitlines()) == 2


def test_persist_raises_when_both_sinks_fail():
    def broken_writer(_rec):
        raise RuntimeError("primary down")

    # A path under an existing *file* cannot be created as a directory -> journal fails.
    fd, blocker = tempfile.mkstemp()
    os.close(fd)
    bad_path = os.path.join(blocker, "audit.jsonl")
    try:
        A.persist_audit(_record(), broken_writer, bad_path)
        raise AssertionError("expected AuditPersistenceError")
    except A.AuditPersistenceError as e:
        assert "primary down" in str(e)


def test_primary_failure_does_not_swallow_silently():
    # The whole point of REV2-29: a primary failure must be visible, never a no-op.
    calls = {"n": 0}

    def broken_writer(_rec):
        calls["n"] += 1
        raise RuntimeError("boom")

    out = A.persist_audit(_record(), broken_writer, _tmp_journal())
    assert calls["n"] == 1
    assert out["primary_error"] is not None


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
