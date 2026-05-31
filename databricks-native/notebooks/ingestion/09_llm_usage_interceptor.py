# Databricks notebook source
# MAGIC %md
# MAGIC # Ingestion 09: LLM Usage Interceptor
# MAGIC
# MAGIC Captures LLM usage events from Foundation Model API endpoints and internal
# MAGIC agent calls, writing structured logs to the `llm_usage_logs` table.
# MAGIC
# MAGIC **Why this exists:** Agent 40 (LLM Risk Profiler) reads from `llm_usage_logs`
# MAGIC to compute per-user risk profiles. Without this interceptor, that table is empty.
# MAGIC
# MAGIC **Data Sources:**
# MAGIC 1. System tables: `system.serving.served_models_traffic` (if Unity Catalog system tables enabled)
# MAGIC 2. Inference table logs: auto-captured by Model Serving endpoints with inference logging enabled
# MAGIC 3. Agent audit trail: our own agents log their LLM calls via `mon.log_event`
# MAGIC
# MAGIC **Writes to:** `llm_usage_logs`
# MAGIC
# MAGIC **Scheduling:** Every 5 minutes

# COMMAND ----------

# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

dbutils.widgets.text("lookback_minutes", "10", "Minutes to look back for new logs")
dbutils.widgets.text("inference_table_prefix", "", "Inference table name prefix (optional)")

lookback_minutes = int(dbutils.widgets.get("lookback_minutes"))
inference_table_prefix = dbutils.widgets.get("inference_table_prefix")
require_tables("llm_usage_logs")

mon.log_event("config_loaded", {"lookback_minutes": lookback_minutes})

# COMMAND ----------

from pyspark.sql.functions import *
from pyspark.sql.types import *
from datetime import datetime, timedelta
import json

# COMMAND ----------

# MAGIC %md
# MAGIC ## Ensure Target Table

# COMMAND ----------

usage_table = get_table_path(cfg, "llm_usage_logs")

spark.sql(f"""
CREATE TABLE IF NOT EXISTS {usage_table} (
    id STRING,
    user_id STRING,
    agent_name STRING,
    model_endpoint STRING,
    prompt STRING,
    response_preview STRING,
    tokens_used INT,
    prompt_tokens INT,
    completion_tokens INT,
    latency_ms INT,
    status STRING,
    timestamp TIMESTAMP,
    metadata STRING
)
USING DELTA
TBLPROPERTIES (
    'delta.autoOptimize.optimizeWrite' = 'true',
    'delta.autoOptimize.autoCompact' = 'true'
)
""")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Source 1: System Serving Traffic Tables
# MAGIC
# MAGIC Databricks automatically logs all Foundation Model API calls to system tables
# MAGIC when the serving endpoint has inference logging enabled.

# COMMAND ----------

cutoff = datetime.utcnow() - timedelta(minutes=lookback_minutes)
total_ingested = 0

with mon.time("ingest_system_tables"):
    try:
        system_traffic = spark.sql(f"""
            SELECT
                request_id as id,
                COALESCE(
                    get_json_object(request, '$.user_id'),
                    get_json_object(request, '$.extra_params.user_id'),
                    'system'
                ) as user_id,
                COALESCE(
                    get_json_object(request, '$.extra_params.agent_name'),
                    'direct_api'
                ) as agent_name,
                served_entity_name as model_endpoint,
                SUBSTRING(get_json_object(request, '$.messages[0].content'), 1, 2000) as prompt,
                SUBSTRING(get_json_object(response, '$.choices[0].message.content'), 1, 500) as response_preview,
                COALESCE(
                    CAST(get_json_object(response, '$.usage.total_tokens') AS INT),
                    0
                ) as tokens_used,
                COALESCE(
                    CAST(get_json_object(response, '$.usage.prompt_tokens') AS INT),
                    0
                ) as prompt_tokens,
                COALESCE(
                    CAST(get_json_object(response, '$.usage.completion_tokens') AS INT),
                    0
                ) as completion_tokens,
                CAST(execution_time_ms AS INT) as latency_ms,
                CASE WHEN status_code = 200 THEN 'success' ELSE 'error' END as status,
                request_time as timestamp,
                to_json(struct(
                    status_code,
                    served_entity_name,
                    request_time
                )) as metadata
            FROM system.serving.served_models_traffic
            WHERE request_time > '{cutoff.isoformat()}'
              AND served_entity_name LIKE '%llama%' OR served_entity_name LIKE '%meta%'
                  OR served_entity_name LIKE '%dbrx%' OR served_entity_name LIKE '%mixtral%'
        """)

        system_count = system_traffic.count()
        if system_count > 0:
            system_traffic.write.mode("append").saveAsTable(usage_table)
            total_ingested += system_count
            print(f"Source 1 (system tables): {system_count} LLM calls captured")
        else:
            print("Source 1 (system tables): no new traffic")

    except Exception as e:
        # System tables may not be available in all environments
        err_msg = str(e)[:200]
        if "TABLE_OR_VIEW_NOT_FOUND" in err_msg or "SCHEMA_NOT_FOUND" in err_msg:
            print("Source 1 (system tables): not available in this workspace")
        else:
            mon.log_warning(f"System table read failed: {err_msg}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Source 2: Inference Table Logs (Auto-Captured)
# MAGIC
# MAGIC When Model Serving endpoints have inference logging enabled, they write to
# MAGIC a Delta table named `<catalog>.<schema>.<endpoint_name>_inference_log`.

# COMMAND ----------

with mon.time("ingest_inference_tables"):
    # Discover inference log tables in our schema
    try:
        tables_in_schema = spark.sql(f"""
            SHOW TABLES IN `{cfg.catalog}`.`{cfg.schema}` LIKE '*inference*'
        """).collect()

        inference_tables = [
            f"`{cfg.catalog}`.`{cfg.schema}`.`{row.tableName}`"
            for row in tables_in_schema
        ]

        for inf_table in inference_tables:
            try:
                inf_df = spark.sql(f"""
                    SELECT
                        CAST(request_id AS STRING) as id,
                        COALESCE(
                            get_json_object(request, '$.user_id'),
                            'inference_user'
                        ) as user_id,
                        'model_serving' as agent_name,
                        '{inf_table.split(".")[-1].replace("_inference_log", "")}' as model_endpoint,
                        SUBSTRING(request, 1, 2000) as prompt,
                        SUBSTRING(response, 1, 500) as response_preview,
                        COALESCE(total_tokens, 0) as tokens_used,
                        COALESCE(prompt_tokens, 0) as prompt_tokens,
                        COALESCE(completion_tokens, 0) as completion_tokens,
                        COALESCE(CAST(latency_ms AS INT), 0) as latency_ms,
                        'success' as status,
                        timestamp_ms as timestamp,
                        NULL as metadata
                    FROM {inf_table}
                    WHERE timestamp_ms > '{cutoff.isoformat()}'
                """)

                inf_count = inf_df.count()
                if inf_count > 0:
                    inf_df.write.mode("append").saveAsTable(usage_table)
                    total_ingested += inf_count
                    print(f"Source 2 ({inf_table}): {inf_count} records")
            except Exception:
                pass

    except Exception as e:
        print(f"Source 2 (inference tables): discovery failed - {str(e)[:100]}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Source 3: Agent Audit Trail
# MAGIC
# MAGIC Our agents log LLM calls via the monitoring system. Extract from `agent_audit_log`.

# COMMAND ----------

with mon.time("ingest_agent_audit"):
    audit_table = get_table_path(cfg, "agent_audit_log")
    try:
        agent_llm_calls = spark.sql(f"""
            SELECT
                id,
                COALESCE(
                    get_json_object(details, '$.user_id'),
                    'agent_system'
                ) as user_id,
                COALESCE(notebook_name, 'unknown_agent') as agent_name,
                COALESCE(
                    get_json_object(details, '$.model'),
                    get_json_object(details, '$.endpoint'),
                    'unknown'
                ) as model_endpoint,
                COALESCE(
                    get_json_object(details, '$.prompt'),
                    get_json_object(details, '$.input'),
                    ''
                ) as prompt,
                SUBSTRING(COALESCE(
                    get_json_object(details, '$.response'),
                    get_json_object(details, '$.output'),
                    ''
                ), 1, 500) as response_preview,
                COALESCE(
                    CAST(get_json_object(details, '$.tokens_used') AS INT),
                    CAST(get_json_object(details, '$.total_tokens') AS INT),
                    0
                ) as tokens_used,
                0 as prompt_tokens,
                0 as completion_tokens,
                COALESCE(
                    CAST(get_json_object(details, '$.latency_ms') AS INT),
                    CAST(duration_ms AS INT),
                    0
                ) as latency_ms,
                'success' as status,
                created_at as timestamp,
                details as metadata
            FROM {audit_table}
            WHERE created_at > '{cutoff.isoformat()}'
              AND event_type IN ('llm_call', 'llm_chat', 'foundation_model_call')
        """)

        agent_count = agent_llm_calls.count()
        if agent_count > 0:
            agent_llm_calls.write.mode("append").saveAsTable(usage_table)
            total_ingested += agent_count
            print(f"Source 3 (agent audit): {agent_count} LLM calls from agents")
        else:
            print("Source 3 (agent audit): no new agent LLM calls")

    except Exception as e:
        err = str(e)[:200]
        if "TABLE_OR_VIEW_NOT_FOUND" in err:
            print("Source 3 (agent audit): audit table not yet created")
        else:
            mon.log_warning(f"Agent audit read failed: {err}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Deduplication Pass
# MAGIC
# MAGIC Remove any duplicate entries that may have been ingested from multiple sources.

# COMMAND ----------

with mon.time("deduplicate"):
    try:
        dedup_count = spark.sql(f"""
            SELECT COUNT(*) - COUNT(DISTINCT id) as dupes
            FROM {usage_table}
            WHERE timestamp > '{cutoff.isoformat()}'
        """).first().dupes

        if dedup_count and dedup_count > 0:
            # Use MERGE to deduplicate (keep latest)
            spark.sql(f"""
                CREATE OR REPLACE TEMP VIEW _llm_dedup AS
                SELECT *, ROW_NUMBER() OVER (PARTITION BY id ORDER BY timestamp DESC) as rn
                FROM {usage_table}
                WHERE timestamp > '{cutoff.isoformat()}'
            """)
            spark.sql(f"""
                DELETE FROM {usage_table}
                WHERE id IN (
                    SELECT id FROM _llm_dedup WHERE rn > 1
                )
                AND timestamp > '{cutoff.isoformat()}'
            """)
            print(f"Deduplication: removed {dedup_count} duplicate entries")
    except Exception:
        pass

# COMMAND ----------

print(f"\nLLM Usage Interceptor Complete: {total_ingested} new records ingested")

result = {
    "notebook": "09_llm_usage_interceptor",
    "status": "completed",
    "total_ingested": total_ingested,
    "lookback_minutes": lookback_minutes,
}
mon.log_complete(details=result)
dbutils.notebook.exit(json.dumps(result, default=str))
