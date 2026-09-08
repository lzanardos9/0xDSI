"""Phase 2 contract tests: producer/consumer schema + config-API drift.

These run fully offline. They import the pure `contracts` and `config` modules
directly from the notebook _shared/ directory (both are stdlib-only at import
time) and scan the tree for the specific drift Phase 2 removed, so the same
mismatch cannot silently return.

Covers REV2-01 (config API drift), REV2-11 (system_settings column drift) and
the REV2-05 identity-kernel vocabulary.

Run:  python3 databricks-native/tests/contract/test_phase2_contracts.py
"""

import importlib.util
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SHARED = ROOT / "notebooks" / "_shared"


def _load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


contracts = _load("soc_contracts", SHARED / "contracts.py")
config = _load("soc_config", SHARED / "config.py")


def _sources(*globs):
    files = []
    for g in globs:
        files.extend(ROOT.glob(g))
    return {f: f.read_text(encoding="utf-8") for f in files if f.is_file()}


# ── REV2-01: config public API is exactly what consumers import ─────────────

def test_config_exposes_public_api():
    for name in contracts.CONFIG_PUBLIC_API:
        assert hasattr(config, name), f"config.py is missing contract symbol '{name}'"


def test_socconfig_has_get_table_path():
    cfg = config.SOCConfig(
        catalog="c", schema="s", environment="dev", secret_scope="x",
        checkpoint_base="/tmp", volume_base="/tmp", model_endpoint="m",
        model_fallback_endpoint="m2",
    )
    assert cfg.get_table_path("events") == "`c`.`s`.`events`"


def test_no_reference_to_removed_platformconfig():
    hits = [
        str(p.relative_to(ROOT))
        for p, src in _sources("notebooks/**/*.py", "tests/**/*.py", "app/**/*.py").items()
        if not p.name.startswith("test_phase2") and re.search(r"\bPlatformConfig\b", src)
    ]
    assert not hits, f"PlatformConfig no longer exists; still referenced in: {hits}"


# ── REV2-11: system_settings column names agree everywhere ──────────────────

def test_forbidden_column_aliases_absent_everywhere():
    aliases = [a for names in contracts.FORBIDDEN_COLUMN_ALIASES.values() for a in names]
    pattern = re.compile(r"\b(" + "|".join(re.escape(a) for a in aliases) + r")\b")
    hits = {}
    for p, src in _sources("notebooks/**/*.py", "tests/**/*.py", "app/**/*.py").items():
        if p.name == "contracts.py" or p.name.startswith("test_phase2"):
            continue
        found = sorted(set(pattern.findall(src)))
        if found:
            hits[str(p.relative_to(ROOT))] = found
    assert not hits, f"forbidden system_settings column aliases still present: {hits}"


def test_ddl_matches_canonical_columns():
    ddl = (ROOT / "notebooks" / "setup" / "01_create_catalog_schema.py").read_text(encoding="utf-8")
    block = ddl.split("CREATE TABLE IF NOT EXISTS system_settings", 1)[1].split("USING DELTA", 1)[0]
    for col in contracts.TABLE_COLUMNS["system_settings"]:
        assert re.search(rf"\b{col}\b", block), f"system_settings DDL missing canonical column '{col}'"


def test_config_loader_uses_canonical_columns():
    src = (SHARED / "config.py").read_text(encoding="utf-8")
    assert "SELECT key, value" in src, "config loader must read canonical key/value columns"


# ── REV2-05: identity kernel vocabulary is coherent ─────────────────────────

def test_identity_fields_are_valid_identifiers():
    assert contracts.EXECUTION_IDENTITY_FIELDS, "identity kernel must declare fields"
    ident = re.compile(r"^[a-z_][a-z0-9_]*$")
    for f in contracts.EXECUTION_IDENTITY_FIELDS:
        assert ident.match(f), f"identity field '{f}' is not a valid column identifier"
    assert "execution_id" in contracts.EXECUTION_IDENTITY_FIELDS


def test_schema_version_declared():
    assert re.match(r"^\d+\.\d+\.\d+$", contracts.SCHEMA_VERSION)


if __name__ == "__main__":
    passed = failed = 0
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
