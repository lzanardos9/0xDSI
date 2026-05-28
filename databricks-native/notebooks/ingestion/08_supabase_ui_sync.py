# Databricks notebook source
# MAGIC %md
# MAGIC # Ingestion 08: Databricks → Supabase UI Sync
# MAGIC
# MAGIC Bridges the gap between Databricks analytics (Delta Lake) and the React UI (Supabase).
# MAGIC Reads from Unity Catalog Delta tables and writes to Supabase PostgreSQL via REST API.
# MAGIC
# MAGIC **Why this exists:** The frontend reads from Supabase for low-latency UI rendering.
# MAGIC Notebooks produce results in Delta Lake. This notebook syncs the 12 critical tables
# MAGIC that the UI queries directly.
# MAGIC
# MAGIC **Sync Strategy:**
# MAGIC - Incremental UPSERT based on `updated_at` or `created_at` watermarks
# MAGIC - Batch size limited to avoid Supabase rate limits (1000 rows/request)
# MAGIC - Idempotent: safe to re-run without duplication
# MAGIC - Handles schema differences gracefully (extra Delta columns are dropped)
# MAGIC
# MAGIC **Scheduling:** Every 30 seconds for critical tables, every 5 minutes for reference data.

# COMMAND ----------

# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

dbutils.widgets.text("sync_tier", "all", "Sync tier: critical | reference | all")
dbutils.widgets.text("batch_size", "500", "Max rows per Supabase API call")
dbutils.widgets.text("lookback_minutes", "5", "Minutes to look back for changes")

sync_tier = dbutils.widgets.get("sync_tier")
batch_size = int(dbutils.widgets.get("batch_size"))
lookback_minutes = int(dbutils.widgets.get("lookback_minutes"))

mon.log_event("config_loaded", {
    "sync_tier": sync_tier,
    "batch_size": batch_size,
    "lookback_minutes": lookback_minutes,
})

# COMMAND ----------

from pyspark.sql.functions import *
from pyspark.sql.types import *
from datetime import datetime, timedelta
import json
import time
import urllib.request
import urllib.error

# COMMAND ----------

# MAGIC %md
# MAGIC ## Supabase Connection Setup

# COMMAND ----------

SUPABASE_URL = secrets_mgr.get("supabase_url")
SUPABASE_SERVICE_KEY = secrets_mgr.get("supabase_service_role_key")

HEADERS = {
    "apikey": SUPABASE_SERVICE_KEY,
    "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates",
}


def supabase_upsert(table: str, rows: list, on_conflict: str = "id") -> dict:
    """
    Upsert rows to Supabase via PostgREST.
    Uses Prefer: resolution=merge-duplicates for UPSERT semantics.
    """
    if not rows:
        return {"status": "skipped", "count": 0}

    url = f"{SUPABASE_URL}/rest/v1/{table}"
    headers = {**HEADERS, "Prefer": f"resolution=merge-duplicates,return=minimal"}

    results = {"inserted": 0, "errors": 0}

    for i in range(0, len(rows), batch_size):
        batch = rows[i:i + batch_size]
        payload = json.dumps(batch, default=str).encode("utf-8")

        req = urllib.request.Request(url, data=payload, headers=headers, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                results["inserted"] += len(batch)
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", errors="replace")[:500]
            mon.log_warning(f"Supabase upsert failed for {table}: {e.code} - {body}")
            results["errors"] += len(batch)
        except Exception as e:
            mon.log_warning(f"Supabase upsert error for {table}: {str(e)[:200]}")
            results["errors"] += len(batch)

        # Respect rate limits
        if i + batch_size < len(rows):
            time.sleep(0.1)

    return results

# COMMAND ----------

# MAGIC %md
# MAGIC ## Sync Table Configuration
# MAGIC
# MAGIC Maps Delta tables to their Supabase equivalents with column projections.

# COMMAND ----------

# Critical tables: these power the main UI views (alerts, cases, events dashboard)
CRITICAL_TABLES = [
    {
        "delta_table": "alerts",
        "supabase_table": "alerts",
        "watermark_col": "created_at",
        "columns": ["id", "title", "description", "severity", "status", "source",
                    "confidence_score", "mitre_tactic", "mitre_technique",
                    "assigned_to", "created_at", "updated_at"],
    },
    {
        "delta_table": "cases",
        "supabase_table": "cases",
        "watermark_col": "updated_at",
        "columns": ["id", "title", "description", "severity", "status", "priority",
                    "assigned_to", "created_at", "updated_at", "closed_at"],
    },
    {
        "delta_table": "events",
        "supabase_table": "events",
        "watermark_col": "timestamp",
        "columns": ["id", "event_type", "timestamp", "source_ip", "dest_ip",
                    "user_id", "username", "hostname", "action", "outcome",
                    "severity", "description", "raw_log", "source"],
        "max_rows": 5000,
    },
    {
        "delta_table": "user_behavior_anomalies",
        "supabase_table": "user_behavior_anomalies",
        "watermark_col": "detected_at",
        "columns": ["id", "user_id", "anomaly_type", "anomaly_score",
                    "risk_level", "description", "detected_at"],
    },
    {
        "delta_table": "cep_pattern_matches",
        "supabase_table": "cep_pattern_matches",
        "watermark_col": "matched_at",
        "columns": ["id", "pattern_id", "pattern_name", "severity",
                    "matched_events", "confidence", "matched_at"],
    },
    {
        "delta_table": "confluence_verdicts",
        "supabase_table": "confluence_verdicts",
        "watermark_col": "created_at",
        "columns": ["id", "entity_id", "entity_type", "fused_score",
                    "verdict", "lens_scores", "escalated", "created_at"],
    },
    {
        "delta_table": "response_actions",
        "supabase_table": "response_actions",
        "watermark_col": "executed_at",
        "columns": ["id", "action_type", "target", "status", "initiated_by",
                    "alert_id", "executed_at", "result"],
    },
    {
        "delta_table": "llm_risk_profiles",
        "supabase_table": "llm_risk_profiles",
        "watermark_col": "assessed_at",
        "columns": ["id", "user_id", "risk_score", "total_queries",
                    "sensitive_queries", "policy_violations",
                    "prompt_injection_attempts", "data_exfil_risk", "assessed_at"],
    },
]

# Reference tables: slower-changing data synced less frequently
REFERENCE_TABLES = [
    {
        "delta_table": "correlation_rules",
        "supabase_table": "correlation_rules",
        "watermark_col": "updated_at",
        "columns": ["id", "name", "description", "severity", "rule_type",
                    "pattern", "enabled", "confidence_score", "created_at", "updated_at"],
    },
    {
        "delta_table": "glasswing_vulnerabilities",
        "supabase_table": "glasswing_vulnerabilities",
        "watermark_col": "first_detected",
        "columns": ["id", "cve_id", "title", "severity", "cvss_score",
                    "affected_assets", "status", "exploitability",
                    "remediation", "first_detected"],
    },
    {
        "delta_table": "glasswing_scans",
        "supabase_table": "glasswing_scans",
        "watermark_col": "started_at",
        "columns": ["id", "scan_type", "status", "assets_scanned",
                    "vulnerabilities_found", "critical_count", "high_count",
                    "duration_seconds", "started_at", "completed_at"],
    },
    {
        "delta_table": "reports",
        "supabase_table": "reports",
        "watermark_col": "generated_at",
        "columns": ["id", "title", "report_type", "frequency", "status",
                    "format", "generated_by", "content", "generated_at", "created_at"],
    },
]

# COMMAND ----------

# MAGIC %md
# MAGIC ## Sync Engine

# COMMAND ----------

def sync_table(config: dict, cutoff_time) -> dict:
    """
    Sync a single table from Delta to Supabase.
    Returns sync result metrics.
    """
    delta_table = config["delta_table"]
    supabase_table = config["supabase_table"]
    watermark_col = config["watermark_col"]
    columns = config["columns"]
    max_rows = config.get("max_rows", 2000)

    full_path = get_table_path(cfg, delta_table)

    try:
        # Read only new/updated rows since cutoff
        available_cols = spark.table(full_path).columns
        select_cols = [c for c in columns if c in available_cols]

        if not select_cols:
            return {"table": delta_table, "status": "no_matching_columns", "rows": 0}

        df = (
            spark.table(full_path)
            .select(select_cols)
        )

        # Apply watermark filter if column exists
        if watermark_col in available_cols:
            df = df.filter(col(watermark_col) >= lit(cutoff_time))

        df = df.limit(max_rows)
        row_count = df.count()

        if row_count == 0:
            return {"table": delta_table, "status": "no_changes", "rows": 0}

        # Convert to Python dicts for API call
        rows = [row.asDict() for row in df.collect()]

        # Serialize timestamps/dates to ISO strings
        for row in rows:
            for k, v in row.items():
                if hasattr(v, "isoformat"):
                    row[k] = v.isoformat()
                elif v is None:
                    row[k] = None

        # Upsert to Supabase
        result = supabase_upsert(supabase_table, rows)
        return {
            "table": delta_table,
            "status": "synced",
            "rows": result["inserted"],
            "errors": result.get("errors", 0),
        }

    except Exception as e:
        error_msg = str(e)[:200]
        # Table might not exist yet in Delta — that's OK
        if "TABLE_OR_VIEW_NOT_FOUND" in error_msg or "AnalysisException" in error_msg:
            return {"table": delta_table, "status": "table_not_found", "rows": 0}
        mon.log_warning(f"Sync failed for {delta_table}: {error_msg}")
        return {"table": delta_table, "status": "error", "error": error_msg, "rows": 0}

# COMMAND ----------

# MAGIC %md
# MAGIC ## Execute Sync

# COMMAND ----------

cutoff_time = datetime.utcnow() - timedelta(minutes=lookback_minutes)
sync_results = []
total_synced = 0

with mon.time("sync_execution"):
    tables_to_sync = []
    if sync_tier in ("critical", "all"):
        tables_to_sync.extend(CRITICAL_TABLES)
    if sync_tier in ("reference", "all"):
        tables_to_sync.extend(REFERENCE_TABLES)

    for config in tables_to_sync:
        result = sync_table(config, cutoff_time)
        sync_results.append(result)
        total_synced += result.get("rows", 0)

        status_icon = "OK" if result["status"] in ("synced", "no_changes") else "WARN"
        print(f"  [{status_icon}] {result['table']}: {result['status']} ({result.get('rows', 0)} rows)")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Summary

# COMMAND ----------

synced_tables = [r for r in sync_results if r["status"] == "synced"]
failed_tables = [r for r in sync_results if r["status"] == "error"]
skipped_tables = [r for r in sync_results if r["status"] in ("no_changes", "table_not_found", "no_matching_columns")]

print(f"\n{'='*60}")
print(f"Supabase UI Sync Complete")
print(f"{'='*60}")
print(f"  Synced:  {len(synced_tables)} tables ({total_synced} total rows)")
print(f"  Skipped: {len(skipped_tables)} tables (no changes or not found)")
print(f"  Failed:  {len(failed_tables)} tables")
if failed_tables:
    for f in failed_tables:
        print(f"    - {f['table']}: {f.get('error', 'unknown')}")
print(f"{'='*60}")

# COMMAND ----------

result = {
    "notebook": "08_supabase_ui_sync",
    "status": "completed",
    "tier": sync_tier,
    "tables_synced": len(synced_tables),
    "tables_skipped": len(skipped_tables),
    "tables_failed": len(failed_tables),
    "total_rows": total_synced,
    "cutoff_time": cutoff_time.isoformat(),
}
mon.log_complete(details=result)
dbutils.notebook.exit(json.dumps(result, default=str))
