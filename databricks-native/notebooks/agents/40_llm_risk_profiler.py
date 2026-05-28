# Databricks notebook source
# MAGIC %md
# MAGIC # Agent 40: LLM Usage Risk Profiler
# MAGIC
# MAGIC **Production-Grade BatchAgent Implementation**
# MAGIC
# MAGIC Profiles organizational LLM usage patterns for risk analysis:
# MAGIC - Identifies risky usage: sensitive data in prompts, excessive tokens, shadow AI
# MAGIC - Generates per-user and per-department risk scores
# MAGIC - Writes to `llm_risk_profiles` with top risk factors and recommendations
# MAGIC
# MAGIC ## Key Features
# MAGIC - MLflow experiment tracking and metrics logging
# MAGIC - Pattern-based sensitive data detection
# MAGIC - Anomaly detection for token consumption
# MAGIC - Department-level risk aggregation
# MAGIC - UC Function tool registration

# COMMAND ----------

# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

# MAGIC %md
# MAGIC ## Initialization and Configuration

# COMMAND ----------

from agent_framework import (
    BatchAgent, AgentResult, AgentStatus,
    UCTool, create_soc_tools
)
import mlflow
import mlflow.tracing
from pyspark.sql.functions import *
from pyspark.sql.types import *
import json
import time
import logging
import re
from datetime import datetime, timedelta

logger = logging.getLogger("oxdsi.llm_risk_profiler")

# Parse notebook parameters
dbutils.widgets.text("lookback_hours", "24", "Analysis window")
dbutils.widgets.text("token_anomaly_threshold", "2.0", "Std devs for token anomaly")
dbutils.widgets.text("risk_score_threshold", "0.7", "Risk threshold for flagging")
dbutils.widgets.text("min_usage_events", "5", "Min events to profile user")

lookback_hours = int(dbutils.widgets.get("lookback_hours"))
token_anomaly_threshold = float(dbutils.widgets.get("token_anomaly_threshold"))
risk_score_threshold = float(dbutils.widgets.get("risk_score_threshold"))
min_usage_events = int(dbutils.widgets.get("min_usage_events"))

mon.log_event("llm_profiler_config_loaded", {
    "lookback_hours": lookback_hours,
    "token_threshold": token_anomaly_threshold,
    "risk_threshold": risk_score_threshold,
})

# COMMAND ----------

# MAGIC %md
# MAGIC ## Define LLMRiskProfiler Class

# COMMAND ----------

class LLMRiskProfiler(BatchAgent):
    """
    Profiles LLM usage for security risk indicators.

    Analyzes:
    1. Prompt content for sensitive data patterns
    2. Token consumption anomalies per user/department
    3. Unusual API usage patterns (time, frequency, models)
    4. Potential prompt injection attempts
    """

    # Regex patterns for sensitive data detection
    SENSITIVE_PATTERNS = {
        "credit_card": r"\b\d{4}[\s\-]?\d{4}[\s\-]?\d{4}[\s\-]?\d{4}\b",
        "ssn": r"\b\d{3}\-\d{2}\-\d{4}\b",
        "api_key": r"(api_key|apikey|sk-|pk-)[a-zA-Z0-9_\-]{20,}",
        "password": r"(password|passwd|pwd)\s*[:=]\s*[^\s]+",
        "email": r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b",
        "phone": r"\b\d{3}[\s\-]?\d{3}[\s\-]?\d{4}\b",
    }

    def __init__(self, agent_name: str, cfg, llm, mon, spark):
        super().__init__(agent_name, cfg, llm, mon, spark)
        self._users_profiled = 0
        self._risk_users = 0
        self._sensitive_detections = 0

        # Register UC tools
        soc_tools = create_soc_tools(cfg)
        for tool in soc_tools:
            if tool.name in ["query_user_behavior"]:
                self.register_tool(tool)

    def execute(self) -> AgentResult:
        """Main execution: fetch usage → analyze risk → persist profiles."""
        start_time = time.time()

        try:
            # Ensure output tables exist
            self._ensure_tables()

            # Initialize MLflow run
            with mlflow.start_run(run_name=f"{self.agent_name}_{int(time.time())}"):
                mlflow.set_experiment(f"/0xDSI/agents/{self.agent_name}")

                # Fetch LLM usage logs
                usage_logs = self._fetch_usage_logs()

                if len(usage_logs) == 0:
                    return AgentResult(
                        status=AgentStatus.IDLE,
                        agent_name=self.agent_name,
                        processed_count=0,
                        duration_seconds=time.time() - start_time,
                    )

                # Analyze for risk
                profiles = self._analyze_usage(usage_logs)
                self._users_profiled = len(profiles)

                # Persist profiles
                if profiles:
                    self._persist_profiles(profiles)

                # Log metrics
                self._log_metrics()

            duration = time.time() - start_time
            return AgentResult(
                status=AgentStatus.COMPLETED,
                agent_name=self.agent_name,
                processed_count=self._users_profiled,
                error_count=self._risk_users,
                duration_seconds=duration,
                details={
                    "users_profiled": self._users_profiled,
                    "high_risk_users": self._risk_users,
                    "sensitive_detections": self._sensitive_detections,
                },
            )

        except Exception as e:
            logger.exception(f"LLM profiler failed: {e}")
            return AgentResult(
                status=AgentStatus.FAILED,
                agent_name=self.agent_name,
                error=str(e)[:500],
                duration_seconds=time.time() - start_time,
            )

    def _ensure_tables(self):
        """Create or validate output tables."""
        profiles_table = get_table_path(cfg, "llm_risk_profiles")

        spark.sql(f"""
            CREATE TABLE IF NOT EXISTS {profiles_table} (
                profile_id STRING NOT NULL,
                user_id STRING NOT NULL,
                department STRING,
                risk_score DOUBLE,
                top_risk_factors ARRAY<STRING>,
                sensitive_data_detections INT,
                token_consumption_avg DOUBLE,
                token_anomaly_count INT,
                unusual_patterns ARRAY<STRING>,
                recommendations ARRAY<STRING>,
                profiled_at TIMESTAMP NOT NULL
            )
            USING DELTA
            PARTITIONED BY (date(profiled_at))
        """)

    def _fetch_usage_logs(self) -> list:
        """Fetch recent LLM usage logs."""
        span = self._start_trace("fetch_usage_logs")
        try:
            usage_table = get_table_path(cfg, "llm_usage_logs")

            query = f"""
                SELECT
                    user_id,
                    department,
                    prompt_text,
                    model,
                    tokens_used,
                    timestamp,
                    endpoint
                FROM {usage_table}
                WHERE timestamp > current_timestamp() - INTERVAL {lookback_hours} HOURS
                ORDER BY timestamp DESC
            """

            usage_df = spark.sql(query)
            logs = usage_df.collect()

            self._end_trace(span, {
                "log_count": len(logs),
                "status": "success"
            })
            return logs

        except Exception as e:
            self._end_trace(span, {"error": str(e)[:200], "status": "failed"})
            logger.error(f"Failed to fetch usage logs: {e}")
            return []

    def _analyze_usage(self, logs: list) -> list:
        """Analyze usage logs for risk indicators."""
        profiles = []
        span = self._start_trace("analyze_usage")

        try:
            # Group by user
            user_logs = {}
            for log in logs:
                uid = log.user_id
                if uid not in user_logs:
                    user_logs[uid] = []
                user_logs[uid].append(log)

            # Analyze each user's usage
            for user_id, user_usage in user_logs.items():
                if len(user_usage) < min_usage_events:
                    continue

                # Calculate risk factors
                risk_factors = []
                sensitive_count = 0
                recommendations = []

                # 1. Check for sensitive data in prompts
                for usage in user_usage:
                    if usage.prompt_text:
                        for pattern_name, pattern in self.SENSITIVE_PATTERNS.items():
                            if re.search(pattern, usage.prompt_text, re.IGNORECASE):
                                risk_factors.append(f"sensitive_data:{pattern_name}")
                                sensitive_count += 1
                                self._sensitive_detections += 1
                                recommendations.append(
                                    f"Review {pattern_name} exposure in prompts"
                                )

                # 2. Token consumption anomalies
                tokens = [u.tokens_used for u in user_usage if u.tokens_used]
                if tokens:
                    avg_tokens = sum(tokens) / len(tokens)
                    std_dev = (sum((t - avg_tokens) ** 2 for t in tokens) / len(tokens)) ** 0.5

                    high_token_events = sum(
                        1 for t in tokens
                        if std_dev > 0 and (t - avg_tokens) > token_anomaly_threshold * std_dev
                    )

                    if high_token_events > 0:
                        risk_factors.append(f"token_anomaly:{high_token_events}")
                        recommendations.append("Investigate unusual token consumption")

                # 3. Calculate overall risk score
                risk_score = min(1.0, len(risk_factors) * 0.15 + sensitive_count * 0.25)

                if risk_score >= risk_score_threshold:
                    self._risk_users += 1

                dept = user_usage[0].department if user_usage else "unknown"

                profiles.append({
                    "user_id": user_id,
                    "department": dept,
                    "risk_score": risk_score,
                    "top_risk_factors": risk_factors[:5],
                    "sensitive_data_detections": sensitive_count,
                    "token_consumption_avg": sum(tokens) / len(tokens) if tokens else 0.0,
                    "token_anomaly_count": high_token_events if tokens else 0,
                    "recommendations": recommendations[:3],
                })

            self._end_trace(span, {
                "profiles_generated": len(profiles),
                "status": "success"
            })

        except Exception as e:
            self._end_trace(span, {"error": str(e)[:200], "status": "failed"})
            logger.error(f"Analysis failed: {e}")

        return profiles

    def _persist_profiles(self, profiles: list):
        """Write profiles to Delta table."""
        if not profiles:
            return

        span = self._start_trace("persist_profiles")
        try:
            profiles_table = get_table_path(cfg, "llm_risk_profiles")

            schema = StructType([
                StructField("user_id", StringType()),
                StructField("department", StringType()),
                StructField("risk_score", DoubleType()),
                StructField("top_risk_factors", ArrayType(StringType())),
                StructField("sensitive_data_detections", IntegerType()),
                StructField("token_consumption_avg", DoubleType()),
                StructField("token_anomaly_count", IntegerType()),
                StructField("recommendations", ArrayType(StringType())),
            ])

            profiles_df = (
                spark.createDataFrame(profiles, schema=schema)
                .withColumn("profile_id", expr("uuid()"))
                .withColumn("profiled_at", current_timestamp())
            )

            safe_append(profiles_df, profiles_table, mode="append")

            self._end_trace(span, {
                "status": "success",
                "profiles_written": len(profiles)
            })

        except Exception as e:
            self._end_trace(span, {"error": str(e)[:200], "status": "failed"})
            raise

    def _log_metrics(self):
        """Log metrics to MLflow."""
        try:
            mlflow.log_metrics({
                "users_profiled": self._users_profiled,
                "high_risk_users": self._risk_users,
                "sensitive_detections": self._sensitive_detections,
            })
            mlflow.log_params({
                "lookback_hours": lookback_hours,
                "risk_threshold": risk_score_threshold,
            })
        except Exception as e:
            logger.warning(f"MLflow metrics logging failed: {e}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Execute LLM Risk Profiler

# COMMAND ----------

try:
    agent = LLMRiskProfiler("llm_risk_profiler", cfg, llm, mon, spark)
    result = agent.run()

    mon.log_event("llm_profiler_result", {
        "status": result.status.value,
        "users_profiled": result.processed_count,
        "high_risk": result.error_count,
        "duration_seconds": result.duration_seconds,
    })

    print(json.dumps({
        "status": result.status.value,
        "trace_id": result.trace_id,
        "users_profiled": result.processed_count,
        "high_risk_users": result.error_count,
        "duration_seconds": round(result.duration_seconds, 3),
        "details": result.details,
    }))

    dbutils.notebook.exit(result.to_json())

except Exception as e:
    logger.exception(f"LLM profiler fatal error: {e}")
    mon.log_error(e, "llm_risk_profiler_execution")

    error_result = AgentResult(
        status=AgentStatus.FAILED,
        agent_name="llm_risk_profiler",
        error=str(e)[:500],
    )

    dbutils.notebook.exit(error_result.to_json())
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
