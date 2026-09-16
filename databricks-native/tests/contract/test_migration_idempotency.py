"""
Migration-idempotency guard for the setup / schema notebooks.

The platform has no separate migration tool: the `notebooks/setup/*` notebooks
are both the clean install and the upgrade path, so they must be safe to re-run
against an existing catalog without losing data. This test pins that property on
the real setup notebooks:

  * every `CREATE TABLE` uses `IF NOT EXISTS` (re-run does not error);
  * no `CREATE OR REPLACE TABLE` and no `DROP TABLE` (both destroy existing
    rows on an upgrade run);
  * every `ALTER TABLE ... ADD COLUMN[S]` uses `IF NOT EXISTS` (additive,
    idempotent column upgrades — the established in-place upgrade pattern).

Views and functions are intentionally allowed to use `CREATE OR REPLACE`: they
hold no data, so replacing them on re-run is non-destructive.

Run:  python3 databricks-native/tests/contract/test_migration_idempotency.py
"""

import glob
import os
import re

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SETUP_GLOB = os.path.join(ROOT, "notebooks", "setup", "*.py")

# Anchored at (indented) line start so prose/markdown mentions don't match.
BARE_CREATE_TABLE = re.compile(r"^\s*CREATE\s+TABLE\s+(?!IF\s+NOT\s+EXISTS)", re.IGNORECASE)
REPLACE_TABLE = re.compile(r"^\s*CREATE\s+OR\s+REPLACE\s+TABLE\b", re.IGNORECASE)
DROP_TABLE = re.compile(r"^\s*DROP\s+TABLE\b", re.IGNORECASE)
ADD_COLUMN_UNGUARDED = re.compile(
    r"^\s*ALTER\s+TABLE\s+\S+\s+ADD\s+COLUMNS?\s+(?!IF\s+NOT\s+EXISTS)", re.IGNORECASE
)


def _setup_files():
    files = sorted(glob.glob(SETUP_GLOB))
    assert files, "no setup notebooks found; test wiring is wrong"
    return files


def _scan(pattern):
    hits = []
    for path in _setup_files():
        with open(path, encoding="utf-8") as fh:
            for i, line in enumerate(fh, 1):
                if pattern.search(line):
                    hits.append(f"{os.path.relpath(path, ROOT)}:{i}: {line.strip()}")
    return hits


def test_every_create_table_is_if_not_exists():
    hits = _scan(BARE_CREATE_TABLE)
    assert not hits, ("CREATE TABLE without IF NOT EXISTS breaks re-run/upgrade:\n  - "
                      + "\n  - ".join(hits))


def test_no_destructive_create_or_replace_table():
    hits = _scan(REPLACE_TABLE)
    assert not hits, ("CREATE OR REPLACE TABLE destroys existing rows on upgrade:\n  - "
                      + "\n  - ".join(hits))


def test_no_drop_table_in_setup():
    hits = _scan(DROP_TABLE)
    assert not hits, ("DROP TABLE in setup destroys data on re-run:\n  - "
                      + "\n  - ".join(hits))


def test_add_column_is_idempotent():
    hits = _scan(ADD_COLUMN_UNGUARDED)
    assert not hits, ("ALTER TABLE ADD COLUMN must use IF NOT EXISTS:\n  - "
                      + "\n  - ".join(hits))


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
