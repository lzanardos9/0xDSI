# Databricks notebook source
# MAGIC %md
# MAGIC # Agent 40: LLM Usage Risk Profiler
# MAGIC
# MAGIC Analyzes LLM usage patterns per user to compute risk profiles.
# MAGIC Detects prompt injection attempts, PII exposure, data exfiltration via LLM,
# MAGIC and excessive/anomalous usage patterns.
# MAGIC
# MAGIC **Writes to:** `llm_risk_profiles` (consumed by LLMRiskProfiling.tsx)
# MAGIC
# MAGIC **Inputs:**
# MAGIC - `llm_usage_logs` - raw query logs from Foundation Model endpoints
# MAGIC - `llm_guardrail_violations` - violations detected by Agent 20
# MAGIC - `user_profiles` - user context for risk assessment

# COMMAND ----------

# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

require_enabled("llm_risk_profiler")

# COMMAND ----------

dbutils.widgets.text("lookback_hours", "24", "Analysis window")
dbutils.widgets.text("min_queries", "5", "Minimum queries to profile")

lookback_hours = int(dbutils.widgets.get("lookback_hours"))
min_queries = int(dbutils.widgets.get("min_queries"))

mon.log_event("config_loaded", {"lookback_hours": lookback_hours, "min_queries": min_queries})

# COMMAND ----------

from pyspark.sql.functions import *
from pyspark.sql.types import *
from datetime import datetime
import json

# COMMAND ----------

# MAGIC %md
# MAGIC ## Aggregate User LLM Activity

# COMMAND ----------

usage_table = cfg.get_table_path("llm_usage_logs")
violations_table = cfg.get_table_path("llm_guardrail_violations")
profiles_table = cfg.get_table_path("llm_risk_profiles")
user_table = cfg.get_table_path("user_profiles")

with mon.time("aggregate_usage"):
    try:
        user_stats = spark.sql(f"""
            SELECT
                user_id,
                COUNT(*) as total_queries,
                SUM(CASE WHEN contains(LOWER(prompt), 'password') OR contains(LOWER(prompt), 'secret')
                         OR contains(LOWER(prompt), 'credential') OR contains(LOWER(prompt), 'api_key')
                    THEN 1 ELSE 0 END) as sensitive_queries,
                SUM(CASE WHEN contains(LOWER(prompt), 'ignore previous') OR contains(LOWER(prompt), 'disregard')
                         OR contains(LOWER(prompt), 'you are now') OR contains(LOWER(prompt), 'jailbreak')
                    THEN 1 ELSE 0 END) as prompt_injection_attempts,
                SUM(CASE WHEN contains(LOWER(prompt), 'list all') OR contains(LOWER(prompt), 'dump')
                         OR contains(LOWER(prompt), 'export') OR contains(LOWER(prompt), 'extract all')
                    THEN 1 ELSE 0 END) as data_exfil_queries,
                AVG(tokens_used) as avg_tokens,
                MAX(tokens_used) as max_tokens,
                COUNT(DISTINCT DATE(timestamp)) as active_days
            FROM {usage_table}
            WHERE timestamp > current_timestamp() - INTERVAL {lookback_hours} HOURS
              AND user_id IS NOT NULL
            GROUP BY user_id
            HAVING COUNT(*) >= {min_queries}
        """)
        user_count = user_stats.count()
    except Exception as e:
        mon.log_event("usage_table_missing", {"error": str(e)[:200]})
        user_stats = spark.createDataFrame([], "user_id STRING, total_queries LONG")
        user_count = 0

    print(f"Profiling {user_count} users with LLM activity")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Fetch Violation History

# COMMAND ----------

with mon.time("fetch_violations"):
    try:
        violation_counts = spark.sql(f"""
            SELECT
                user_id,
                COUNT(*) as policy_violations,
                SUM(CASE WHEN violation_type = 'pii_exposure' THEN 1 ELSE 0 END) as pii_exposure_attempts,
                MAX(violation_type) as last_violation_type
            FROM {violations_table}
            WHERE detected_at > current_timestamp() - INTERVAL {lookback_hours} HOURS
              AND user_id IS NOT NULL
            GROUP BY user_id
        """)
    except Exception:
        violation_counts = spark.createDataFrame(
            [], "user_id STRING, policy_violations LONG, pii_exposure_attempts LONG, last_violation_type STRING"
        )

# COMMAND ----------

# MAGIC %md
# MAGIC ## Compute Risk Scores

# COMMAND ----------

with mon.time("compute_risk"):
    if user_count == 0:
        mon.log_complete(details={"status": "no_users_to_profile"})
        dbutils.notebook.exit('{"status": "no_users", "profiled": 0}')

    risk_profiles = (
        user_stats
        .join(violation_counts, "user_id", "left")
        .withColumn("policy_violations", coalesce(col("policy_violations"), lit(0)))
        .withColumn("pii_exposure_attempts", coalesce(col("pii_exposure_attempts"), lit(0)))
        .withColumn("prompt_injection_attempts",
            coalesce(col("prompt_injection_attempts"), lit(0)))
        .withColumn("last_violation_type", coalesce(col("last_violation_type"), lit(None).cast("string")))
        .withColumn("risk_score",
            least(lit(100), greatest(lit(0),
                (col("sensitive_queries") * 5 +
                 col("prompt_injection_attempts") * 20 +
                 col("data_exfil_queries") * 10 +
                 col("policy_violations") * 15 +
                 col("pii_exposure_attempts") * 12).cast("int")
            ))
        )
        .withColumn("data_exfil_risk",
            when(col("data_exfil_queries") > 5, lit("high"))
            .when(col("data_exfil_queries") > 2, lit("medium"))
            .otherwise(lit("low"))
        )
        .select(
            col("user_id"),
            col("risk_score"),
            col("total_queries"),
            col("sensitive_queries"),
            col("policy_violations"),
            col("pii_exposure_attempts"),
            col("prompt_injection_attempts"),
            col("data_exfil_risk"),
            col("last_violation_type"),
        )
        .withColumn("id", expr("uuid()"))
        .withColumn("assessed_at", current_timestamp())
        .withColumn("created_at", current_timestamp())
    )

    risk_profiles.write.mode("overwrite").saveAsTable(profiles_table)
    profiled_count = risk_profiles.count()

    high_risk = risk_profiles.filter(col("risk_score") > 70).count()
    print(f"Profiled {profiled_count} users, {high_risk} high-risk")

# COMMAND ----------

result = {
    "notebook": "40_llm_risk_profiler",
    "status": "completed",
    "users_profiled": profiled_count,
    "high_risk_users": high_risk,
}
mon.log_complete(details=result)
dbutils.notebook.exit(json.dumps(result))
