"""
Durable-health regression for the Monitor (H-060).

Reproduces the Phase 6 finding: `Monitor.report_health` referenced `self._cfg`
while `__init__` stored the config as `self._config`, so every call raised
AttributeError. That exception was then swallowed by a bare `except: pass`, so
the pipeline_health table was NEVER written yet `log_complete` believed it had
reported "healthy". A broken health writer looked identical to a healthy run.

This imports the REAL production `monitoring` module and exercises the REAL
`report_health` method. pyspark is not installed in the offline sandbox, and the
module only needs it for a type annotation, a couple of function symbols, and the
type constructors used to build a static schema at import time. A minimal import
shim satisfies those names so the production logic under test is unchanged; the
Spark session itself is a fake that records the SQL it is asked to run.

Run:  python3 databricks-native/tests/property/test_monitor_health.py
"""

import logging
import os
import sys
import types

SHARED = os.path.join(os.path.dirname(__file__), "..", "..", "notebooks", "_shared")
sys.path.insert(0, os.path.abspath(SHARED))


# ── Minimal pyspark import shim (import-boundary only) ────────────────────
class _Callable:
    """Accepts any construction/call; stands in for pyspark type + fn symbols."""
    def __init__(self, *a, **k):
        pass

    def __call__(self, *a, **k):
        return self


def _install_pyspark_shim():
    if "pyspark" in sys.modules:
        return
    pyspark = types.ModuleType("pyspark")
    sql = types.ModuleType("pyspark.sql")
    sqltypes = types.ModuleType("pyspark.sql.types")
    sqlfunctions = types.ModuleType("pyspark.sql.functions")
    for name in ("SparkSession", "Row"):
        setattr(sql, name, _Callable)
    for name in ("StructType", "StructField", "StringType", "TimestampType",
                 "DoubleType", "LongType", "MapType"):
        setattr(sqltypes, name, _Callable)
    for name in ("current_timestamp", "lit", "expr"):
        setattr(sqlfunctions, name, _Callable)
    sql.types = sqltypes
    sql.functions = sqlfunctions
    pyspark.sql = sql
    sys.modules["pyspark"] = pyspark
    sys.modules["pyspark.sql"] = sql
    sys.modules["pyspark.sql.types"] = sqltypes
    sys.modules["pyspark.sql.functions"] = sqlfunctions


_install_pyspark_shim()
import monitoring as M  # noqa: E402


class _FakeConfig:
    def __init__(self):
        self.tags = {"notebook_path": "detection/02_threat_intel_matching"}
        self.environment = "dev"
        self.enable_monitoring = True
        self.catalog = "soc_platform_dev"
        self.schema = "agentic_soc"


class _RecordingSpark:
    def __init__(self, raise_on_sql=False):
        self.sql_calls = []
        self._raise = raise_on_sql

    def sql(self, query):
        self.sql_calls.append(query)
        if self._raise:
            raise RuntimeError("simulated Delta write failure")
        return None


def test_report_health_actually_writes_to_the_health_table():
    """Before the fix this called self._cfg (AttributeError, swallowed), so no
    SQL ran at all. The health write must reach the SQL runtime."""
    spark = _RecordingSpark()
    mon = M.Monitor(spark, _FakeConfig())
    mon.report_health("healthy", events_processed=7)
    assert len(spark.sql_calls) == 1, (
        f"report_health must issue exactly one SQL write, got {len(spark.sql_calls)}"
    )
    sql = spark.sql_calls[0]
    assert "pipeline_health" in sql
    assert "soc_platform_dev" in sql and "agentic_soc" in sql
    assert "MERGE INTO" in sql


def test_report_health_does_not_silently_swallow_a_write_failure():
    """A failing health write must be logged (visible), not silenced."""
    spark = _RecordingSpark(raise_on_sql=True)
    mon = M.Monitor(spark, _FakeConfig())

    records = []

    class _Capture(logging.Handler):
        def emit(self, record):
            records.append(record)

    handler = _Capture()
    M.logger.addHandler(handler)
    try:
        mon.report_health("error", error_message="boom")  # must not raise
    finally:
        M.logger.removeHandler(handler)

    assert any(r.levelno >= logging.ERROR for r in records), (
        "a health-write failure must be logged at ERROR, not swallowed silently"
    )


def test_log_complete_reports_health():
    """log_complete calls report_health('healthy', ...); the write must land."""
    spark = _RecordingSpark()
    mon = M.Monitor(spark, _FakeConfig())
    mon.log_start()
    mon.log_complete(rows_processed=3)
    assert any("pipeline_health" in q for q in spark.sql_calls), (
        "log_complete must produce a pipeline_health write"
    )


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
