# Databricks notebook source
# MAGIC %md
# MAGIC # Analytics - Native CET Bridge (optional 0xDSI-CET engine)
# MAGIC
# MAGIC Optional integration path that lets the platform run its Complete/Compounding
# MAGIC Event Trend detection on the **native 0xDSI-CET engine**
# MAGIC (https://github.com/lzanardo/0xDSI-CET) instead of the built-in GraphFrames
# MAGIC engine in `analytics/01_trend_engine_cet.py`.
# MAGIC
# MAGIC The native engine provides the C runtime matcher, the M-CET / T-CET / H-CET
# MAGIC strategy family, standing queries, the temporal knowledge graph and the
# MAGIC additive explainable risk scorer. This notebook is a thin, **capability-detected**
# MAGIC adapter: when the engine package is attached it hands trend detection to it and
# MAGIC writes results into the same Delta tables (`trend_complete`, `trend_partial`,
# MAGIC `trend_runtime_metrics`); when it is not attached, it transparently falls back to
# MAGIC the built-in GraphFrames engine so there is never a dead end.
# MAGIC
# MAGIC Enable it by setting `engine_mode=native` (or `auto`) and, if needed,
# MAGIC `cet_install_spec` to the pip source for the engine.

# COMMAND ----------

# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

import importlib
import json
import time
from datetime import datetime
from pyspark.sql import functions as F

# COMMAND ----------

dbutils.widgets.text("engine_mode", "auto", "auto | native | graphframes")
dbutils.widgets.text("cet_install_spec", "git+https://github.com/lzanardo/0xDSI-CET.git", "pip source for the native CET engine")
dbutils.widgets.text("cet_import_candidates", "dsi_cet,cet,bindings.python,0xdsi_cet", "Comma-separated import names to probe")
dbutils.widgets.text("window_seconds", "300", "Sliding window size (seconds)")
dbutils.widgets.text("max_hops", "6", "Maximum Kleene-closure hops")
dbutils.widgets.text("min_score", "0.3", "Minimum trend score threshold")
dbutils.widgets.text("source_table", "silver_events", "Source events table")

engine_mode = dbutils.widgets.get("engine_mode").strip().lower()
cet_install_spec = dbutils.widgets.get("cet_install_spec").strip()
cet_import_candidates = [c.strip() for c in dbutils.widgets.get("cet_import_candidates").split(",") if c.strip()]
window_seconds = int(dbutils.widgets.get("window_seconds"))
max_hops = int(dbutils.widgets.get("max_hops"))
min_score = float(dbutils.widgets.get("min_score"))
source_table = dbutils.widgets.get("source_table")

run_start = time.time()
result = {"notebook": "07_cet_native_bridge", "status": "running", "engine_mode": engine_mode}

# COMMAND ----------

# MAGIC %md
# MAGIC ## Capability detection
# MAGIC Probe for the native engine; optionally pip-install it when `engine_mode` allows.

# COMMAND ----------


def _probe_engine(candidates):
    """Return (module, import_name) for the first importable candidate, else (None, None)."""
    for name in candidates:
        try:
            mod = importlib.import_module(name)
            return mod, name
        except Exception:
            continue
    return None, None


native_engine, native_import_name = _probe_engine(cet_import_candidates)

if native_engine is None and engine_mode in ("native", "auto") and cet_install_spec:
    # Try a best-effort install, then re-probe. Never fatal: fallback covers failure.
    try:
        mon.log_event("cet_native_install_attempt", {"spec": cet_install_spec})
        import subprocess
        import sys as _sys
        subprocess.run(
            [_sys.executable, "-m", "pip", "install", "--quiet", cet_install_spec],
            check=True, capture_output=True, timeout=600,
        )
        importlib.invalidate_caches()
        native_engine, native_import_name = _probe_engine(cet_import_candidates)
    except Exception as install_err:
        mon.log_event("cet_native_install_failed", {"error": str(install_err)[:300]})

native_available = native_engine is not None
mon.log_info(f"native CET engine available={native_available} import={native_import_name}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Engine selection
# MAGIC `native` requires the engine; `graphframes` forces the built-in; `auto` prefers native.

# COMMAND ----------

if engine_mode == "native" and not native_available:
    # Explicit native request that cannot be honored: fail loudly rather than silently.
    msg = (
        "engine_mode=native but the 0xDSI-CET engine could not be imported. "
        f"Tried: {cet_import_candidates}. Set cet_install_spec or attach the "
        "engine to the cluster, or use engine_mode=auto to allow fallback."
    )
    mon.log_event("cet_native_unavailable", {"candidates": cet_import_candidates}, severity="error")
    result.update({"status": "error", "error": msg})
    print(json.dumps(result, indent=2))
    dbutils.notebook.exit(json.dumps(result))

use_native = native_available and engine_mode in ("native", "auto")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Native path
# MAGIC Convert `silver_events` into the engine's event contract, run the standing
# MAGIC multi-query runtime, and write complete/partial trends into the shared tables.
# MAGIC
# MAGIC The engine's public surface is probed defensively so a minor API rename produces
# MAGIC an actionable diagnostic (and fallback) instead of a crash.

# COMMAND ----------


def _resolve_source_df():
    for tbl in (source_table, "silver_events", "events"):
        try:
            df = spark.table(get_table_path(cfg, tbl))
            return df, tbl
        except Exception:
            continue
    raise RuntimeError("No source events table found (tried silver_events, events).")


def _get_attr_path(mod, dotted):
    """Resolve a possibly dotted attribute path off a module, else None."""
    obj = mod
    for part in dotted.split("."):
        try:
            obj = getattr(obj, part)
        except AttributeError:
            # Allow submodule import (e.g. bridge.run_standing).
            try:
                obj = importlib.import_module(f"{obj.__name__}.{part}")
            except Exception:
                return None
    return obj


def _find_entry_point(mod, names):
    for n in names:
        fn = _get_attr_path(mod, n)
        if callable(fn):
            return fn, n
    return None, None


def run_native_cet():
    """Drive the native engine and return (complete_rows, partial_rows, meta)."""
    src_df, src_name = _resolve_source_df()

    # Normalize into a generic contract the engine adapters understand.
    events = (
        src_df
        .filter(F.col("source_ip").isNotNull() | F.col("user_id").isNotNull())
        .select(
            F.coalesce(F.col("event_id"), F.monotonically_increasing_id().cast("string")).alias("event_id"),
            F.col("event_type").alias("event_type"),
            F.col("source_ip").alias("source"),
            F.coalesce(F.col("dest_ip"), F.col("user_id")).alias("target"),
            F.col("user_id").alias("actor"),
            F.col("severity_id").alias("severity"),
            F.col("timestamp").cast("timestamp").alias("ts"),
        )
        .orderBy("ts")
        .limit(cfg.max_query_rows)
    )
    contract_rows = [
        {
            "event_id": r["event_id"],
            "event_type": r["event_type"],
            "source": r["source"],
            "target": r["target"],
            "actor": r["actor"],
            "severity": int(r["severity"]) if r["severity"] is not None else 1,
            "ts": r["ts"].isoformat() if r["ts"] is not None else None,
        }
        for r in events.collect()
    ]

    # Probe the documented engine surface for a batch/standing entry point.
    entry, entry_name = _find_entry_point(
        native_engine,
        [
            "run_standing", "run_batch", "detect_trends", "run",
            "bridge.run_standing", "bridge.run_batch",
            "multi_query_runtime.run", "multi_query_runtime.detect",
        ],
    )
    if entry is None:
        raise RuntimeError(
            f"0xDSI-CET imported as '{native_import_name}' but no known entry point was found. "
            "Expected one of run_standing/run_batch/detect_trends/run. "
            "Update cet_import_candidates or pin the engine version."
        )

    engine_out = entry(contract_rows)  # engine returns its own trend objects

    # Coerce the engine output into our trend_complete / trend_partial shape.
    complete_rows, partial_rows = [], []
    trends = engine_out.get("trends", engine_out) if isinstance(engine_out, dict) else engine_out
    for t in (trends or []):
        g = t.get if isinstance(t, dict) else (lambda k, d=None: getattr(t, k, d))
        hops = int(g("hops", g("length", 0)) or 0)
        score = float(g("score", g("risk", 0.0)) or 0.0)
        if score < min_score:
            continue
        is_complete = bool(g("complete", g("is_complete", hops >= 3)))
        row = {
            "query_id": str(g("query_id", g("query", "native_cet"))),
            "trend_key": str(g("trend_id", g("id", g("trend_key", "")))) or f"native-{len(complete_rows)+len(partial_rows)}",
            "path_head": str(g("head", g("path_head", ""))),
            "path_tail": str(g("tail", g("path_tail", ""))),
            "hops": hops,
            "severity": str(g("severity", "medium")),
            "score": score,
            "detected_at": datetime.utcnow().isoformat(),
            "explanation": str(g("explanation", g("summary", "native CET trend"))),
        }
        (complete_rows if is_complete else partial_rows).append(row)

    meta = {"source_table": src_name, "entry_point": entry_name, "input_events": len(contract_rows)}
    return complete_rows, partial_rows, meta


# COMMAND ----------

engine_used = None

try:
    if use_native:
        with mon.time("native_cet_run"):
            complete_rows, partial_rows, meta = run_native_cet()

        if complete_rows:
            spark.createDataFrame(complete_rows).write.mode("append").saveAsTable(
                cfg.get_table_path("trend_complete"))
        if partial_rows:
            spark.createDataFrame(partial_rows).write.mode("append").saveAsTable(
                cfg.get_table_path("trend_partial"))

        engine_used = "native_cet"
        result.update({
            "status": "success",
            "engine_used": engine_used,
            "native_import": native_import_name,
            "complete_trends": len(complete_rows),
            "partial_trends": len(partial_rows),
            **meta,
        })
        mon.log_complete(rows_processed=meta.get("input_events", 0))
    else:
        # Fallback: delegate to the built-in GraphFrames engine so the path always works.
        with mon.time("graphframes_fallback"):
            child = dbutils.notebook.run(
                "./01_trend_engine_cet",
                int(cfg.default_timeout_seconds),
                {
                    "catalog": cfg.catalog,
                    "schema": cfg.schema,
                    "mode": "batch",
                    "window_seconds": str(window_seconds),
                    "max_hops": str(max_hops),
                    "min_score": str(min_score),
                },
            )
        engine_used = "graphframes"
        result.update({
            "status": "success",
            "engine_used": engine_used,
            "native_available": native_available,
            "delegated_result": json.loads(child) if child else None,
        })

except Exception as e:
    # If the native path breaks and mode allows, fall back once before failing.
    if use_native and engine_mode == "auto":
        mon.log_event("cet_native_failed_fallback", {"error": str(e)[:300]})
        child = dbutils.notebook.run(
            "./01_trend_engine_cet",
            int(cfg.default_timeout_seconds),
            {"catalog": cfg.catalog, "schema": cfg.schema, "mode": "batch",
             "window_seconds": str(window_seconds), "max_hops": str(max_hops), "min_score": str(min_score)},
        )
        engine_used = "graphframes"
        result.update({
            "status": "success",
            "engine_used": engine_used,
            "native_error": str(e)[:300],
            "delegated_result": json.loads(child) if child else None,
        })
    else:
        mon.log_error(e, context="cet_native_bridge")
        result.update({"status": "error", "error": str(e)[:500], "error_type": type(e).__name__})
        print(json.dumps(result, indent=2))
        dbutils.notebook.exit(json.dumps(result))

# COMMAND ----------

# MAGIC %md
# MAGIC ## Provenance metric
# MAGIC Record which engine served this run so dashboards can show native vs built-in.

# COMMAND ----------

elapsed_s = time.time() - run_start
provenance = [{
    "phase_key": "p2",
    "metric": "cet_engine_active",
    "value": 1.0 if engine_used == "native_cet" else 0.0,
    "unit": "bool",
    "target": "1",
    "trend_direction": "stable",
    "sort_order": 11,
}]
try:
    spark.createDataFrame(provenance).write.mode("append").saveAsTable(
        cfg.get_table_path("trend_runtime_metrics"))
except Exception as metric_err:
    mon.log_event("cet_provenance_metric_failed", {"error": str(metric_err)[:200]})

result["elapsed_seconds"] = elapsed_s
result["completed_at"] = datetime.utcnow().isoformat()
print(json.dumps(result, indent=2))
dbutils.notebook.exit(json.dumps(result))
