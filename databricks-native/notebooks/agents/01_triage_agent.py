# Databricks notebook source
# MAGIC %md
# MAGIC # Agent 01: SOC L1 Triage Agent
# MAGIC
# MAGIC **Production-Grade BatchAgent Implementation**
# MAGIC
# MAGIC Classifies incoming alerts as TRUE_POSITIVE, FALSE_POSITIVE, or NEEDS_INVESTIGATION
# MAGIC using a hybrid approach:
# MAGIC - **Fast Path**: Rule-based FP detection (known patterns: health checks, monitoring, scheduled scans)
# MAGIC - **Slow Path**: LLM classification with JSON mode and automatic tracing
# MAGIC
# MAGIC ## Key Features
# MAGIC - MLflow experiment tracking and metrics logging
# MAGIC - Automatic span instrumentation on all LLM calls
# MAGIC - UC Function tool registration (lookup_ioc, get_alert_context)
# MAGIC - Safe Delta writes with MERGE for auto-close
# MAGIC - Structured AgentResult with trace IDs
# MAGIC - Token budget management

# COMMAND ----------

# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

# MAGIC %md
# MAGIC ## Initialization and Configuration

# COMMAND ----------

from agent_framework import (
    BaseAgent, BatchAgent, AgentResult, AgentStatus,
    UCTool, create_soc_tools
)
import mlflow
import mlflow.tracing
from pyspark.sql.functions import *
from pyspark.sql.types import *
import json
import time
import logging
from datetime import datetime

logger = logging.getLogger("oxdsi.triage_agent")

# Parse notebook parameters
dbutils.widgets.text("batch_size", "50", "Max alerts to process per run")
dbutils.widgets.text("lookback_hours", "1", "Alert age window")
dbutils.widgets.text("auto_close_confidence", "0.95", "Confidence threshold for auto-close")

batch_size = int(dbutils.widgets.get("batch_size"))
lookback_hours = int(dbutils.widgets.get("lookback_hours"))
auto_close_confidence = float(dbutils.widgets.get("auto_close_confidence"))

mon.log_event("triage_config_loaded", {
    "batch_size": batch_size,
    "lookback_hours": lookback_hours,
    "auto_close_confidence": auto_close_confidence,
})

# COMMAND ----------

# MAGIC %md
# MAGIC ## Define TriageAgent Class

# COMMAND ----------

class TriageAgent(BatchAgent):
    """
    L1 SOC Triage Agent - hybrid rule + LLM classification.

    Processes unenriched alerts and produces structured triage decisions.
    Results include classification, confidence, reasoning, and MITRE mappings.
    """

    # Rule-based false-positive patterns (fast path)
    FP_PATTERNS = [
        {
            "event_type": "authentication_failure",
            "source_contains": "health-check",
            "reason": "Health check probe - expected",
        },
        {
            "event_type": "authentication_failure",
            "source_contains": "health_check",
            "reason": "Health check probe - expected",
        },
        {
            "event_type": "network_connection",
            "source_contains": "monitoring",
            "reason": "Monitoring system activity - expected",
        },
        {
            "event_type": "dns_query",
            "dest_contains": "internal.corp",
            "reason": "Internal DNS resolution - expected",
        },
        {
            "event_type": "authentication_failure",
            "source_contains": "load-balancer",
            "reason": "Load balancer health probe - expected",
        },
        {
            "event_type": "authentication_failure",
            "source_contains": "load_balancer",
            "reason": "Load balancer health probe - expected",
        },
        {
            "event_type": "port_scan",
            "source_contains": "vulnerability-scanner",
            "reason": "Scheduled vulnerability scan - expected",
        },
        {
            "event_type": "port_scan",
            "source_contains": "vulnerability_scanner",
            "reason": "Scheduled vulnerability scan - expected",
        },
    ]

    def __init__(self, agent_name: str, cfg, llm, mon, spark):
        super().__init__(agent_name, cfg, llm, mon, spark)
        self._alert_count = 0
        self._fp_closed_count = 0
        self._llm_classified_count = 0

        # Register UC tools
        soc_tools = create_soc_tools(cfg)
        for tool in soc_tools:
            if tool.name in ["lookup_ioc", "get_alert_context"]:
                self.register_tool(tool)

    def execute(self) -> AgentResult:
        """Main execution flow: fetch → fast path → slow path → persist."""
        start_time = time.time()

        try:
            # Ensure output table exists
            self._ensure_output_table()

            # Fetch unprocessed alerts
            alerts = self._fetch_new_alerts()
            self._alert_count = len(alerts)

            if self._alert_count == 0:
                return AgentResult(
                    status=AgentStatus.IDLE,
                    agent_name=self.agent_name,
                    processed_count=0,
                    duration_seconds=time.time() - start_time,
                )

            # Process in two passes: fast path (rules) and slow path (LLM)
            with self._tracer.start_run(run_name=f"{self.agent_name}_{int(time.time())}"):
                mlflow.set_experiment(f"/0xDSI/agents/{self.agent_name}")

                fp_results = self._fast_path_triage(alerts)
                self._fp_closed_count = len(fp_results)

                # Filter alerts that need LLM
                needs_llm = [
                    a for a in alerts
                    if a.id not in [r["alert_id"] for r in fp_results]
                ]

                llm_results = []
                if needs_llm:
                    llm_results = self._slow_path_triage(needs_llm)
                    self._llm_classified_count = len(llm_results)

                # Combine results
                all_results = fp_results + llm_results

                # Persist to Delta
                self._persist_results(all_results, fp_results)

                # Log metrics
                self._log_metrics(all_results)

            duration = time.time() - start_time
            return AgentResult(
                status=AgentStatus.COMPLETED,
                agent_name=self.agent_name,
                processed_count=len(all_results),
                error_count=0,
                duration_seconds=duration,
                details={
                    "auto_closed_count": self._fp_closed_count,
                    "llm_classified_count": self._llm_classified_count,
                    "tokens_used": self.llm.budget.used_total,
                    "tokens_remaining": self.llm.budget.remaining,
                },
            )

        except Exception as e:
            logger.exception(f"Triage agent failed: {e}")
            return AgentResult(
                status=AgentStatus.FAILED,
                agent_name=self.agent_name,
                error=str(e)[:500],
                duration_seconds=time.time() - start_time,
            )

    def _ensure_output_table(self):
        """Create or validate triage results table."""
        triage_table = get_table_path(cfg, "agent_triage_results")
        spark.sql(f"""
            CREATE TABLE IF NOT EXISTS {triage_table} (
                id STRING NOT NULL,
                alert_id STRING NOT NULL,
                classification STRING NOT NULL,
                confidence DOUBLE,
                reasoning STRING,
                triage_method STRING,
                mitre_tactic STRING,
                recommended_severity STRING,
                agent_name STRING,
                trace_id STRING,
                triaged_at TIMESTAMP NOT NULL
            )
            USING DELTA
            PARTITIONED BY (date(triaged_at))
            TBLPROPERTIES (
                'delta.autoOptimize.optimizeWrite' = 'true',
                'delta.autoOptimize.optimizeRead' = 'true'
            )
        """)

    def _fetch_new_alerts(self) -> list:
        """Fetch unprocessed alerts using LEFT JOIN pattern."""
        alerts_table = get_table_path(cfg, "alerts")
        triage_table = get_table_path(cfg, "agent_triage_results")

        span = self._start_trace("fetch_alerts")
        try:
            query = f"""
                SELECT a.*
                FROM {alerts_table} a
                LEFT JOIN {triage_table} t ON a.id = t.alert_id
                WHERE a.status = 'new'
                  AND a.created_at > current_timestamp() - INTERVAL {lookback_hours} HOURS
                  AND t.alert_id IS NULL
                ORDER BY
                    CASE a.severity
                        WHEN 'critical' THEN 1 WHEN 'high' THEN 2
                        WHEN 'medium' THEN 3 ELSE 4
                    END,
                    a.created_at DESC
                LIMIT {batch_size}
            """
            alerts_df = spark.sql(query)
            alerts = alerts_df.collect()
            self._end_trace(span, {"alert_count": len(alerts), "status": "success"})
            return alerts
        except Exception as e:
            self._end_trace(span, {"error": str(e)[:200], "status": "failed"})
            logger.error(f"Failed to fetch alerts: {e}")
            return []

    def _fast_path_triage(self, alerts: list) -> list:
        """Rule-based detection of obvious false positives."""
        span = self._start_trace("fast_path_triage")
        fp_results = []

        try:
            for alert in alerts:
                for pattern in self.FP_PATTERNS:
                    # Check event type match
                    if alert.event_type != pattern.get("event_type"):
                        continue

                    # Check string contains in title/description
                    alert_text = (
                        f"{(alert.description or '').lower()} {(alert.title or '').lower()}"
                    )

                    search_key = (
                        pattern.get("source_contains") or pattern.get("dest_contains", "")
                    )
                    if search_key and search_key in alert_text:
                        fp_results.append({
                            "alert_id": alert.id,
                            "classification": "FALSE_POSITIVE",
                            "confidence": 0.97,
                            "reasoning": pattern["reason"],
                            "triage_method": "rule_based",
                            "mitre_tactic": None,
                            "recommended_severity": "low",
                        })
                        break

            self._end_trace(span, {"fp_count": len(fp_results), "status": "success"})

        except Exception as e:
            self._end_trace(span, {"error": str(e)[:200], "status": "failed"})
            logger.error(f"Fast path triage failed: {e}")

        return fp_results

    def _slow_path_triage(self, alerts: list) -> list:
        """LLM-based classification with JSON mode and structured extraction."""
        llm_results = []

        system_prompt = """You are a SOC Level 1 Analyst with 10+ years of experience.
Your task is to classify security alerts with precision and explain your reasoning.

Classification outcomes:
- TRUE_POSITIVE: Genuine security incident requiring investigation
- FALSE_POSITIVE: Expected/benign activity, safe to close
- NEEDS_INVESTIGATION: Ambiguous, requires human review

Respond with valid JSON only. No markdown, no explanation outside JSON."""

        for alert in alerts:
            span = self._start_trace(f"llm_classify.{alert.id}")
            try:
                user_prompt = f"""Classify this alert:

Title: {alert.title or 'N/A'}
Description: {(alert.description or 'N/A')[:500]}
Severity: {alert.severity or 'unknown'}
Source: {alert.source or 'unknown'}
Created: {str(alert.created_at)}

Respond with JSON:
{{
  "classification": "TRUE_POSITIVE" | "FALSE_POSITIVE" | "NEEDS_INVESTIGATION",
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation",
  "recommended_severity": "critical" | "high" | "medium" | "low",
  "mitre_tactic": "TA00XX" or null
}}"""

                response = self.llm_classify(
                    system=system_prompt,
                    user=user_prompt,
                    json_mode=True,
                    temperature=0.1,
                )

                # Extract JSON from response
                if response and isinstance(response, dict):
                    llm_results.append({
                        "alert_id": alert.id,
                        "classification": response.get(
                            "classification", "NEEDS_INVESTIGATION"
                        ),
                        "confidence": min(
                            1.0, max(0.0, float(response.get("confidence", 0.5)))
                        ),
                        "reasoning": str(response.get("reasoning", ""))[:500],
                        "triage_method": "llm",
                        "mitre_tactic": response.get("mitre_tactic"),
                        "recommended_severity": response.get(
                            "recommended_severity", "medium"
                        ),
                    })
                else:
                    # Fallback on parse error
                    llm_results.append({
                        "alert_id": alert.id,
                        "classification": "NEEDS_INVESTIGATION",
                        "confidence": 0.3,
                        "reasoning": "LLM returned unparseable response",
                        "triage_method": "llm_fallback",
                        "mitre_tactic": None,
                        "recommended_severity": "medium",
                    })

                self._end_trace(
                    span,
                    {
                        "status": "success",
                        "classification": llm_results[-1]["classification"],
                    },
                )

            except Exception as e:
                logger.error(f"LLM triage failed for alert {alert.id}: {e}")
                self._end_trace(span, {"error": str(e)[:200], "status": "failed"})
                llm_results.append({
                    "alert_id": alert.id,
                    "classification": "NEEDS_INVESTIGATION",
                    "confidence": 0.2,
                    "reasoning": f"LLM error: {str(e)[:100]}",
                    "triage_method": "llm_error",
                    "mitre_tactic": None,
                    "recommended_severity": "medium",
                })

        return llm_results

    def _persist_results(self, all_results: list, fp_results: list):
        """Write triage results to Delta with UPSERT pattern."""
        if not all_results:
            return

        span = self._start_trace("persist_results")
        try:
            triage_table = get_table_path(cfg, "agent_triage_results")
            alerts_table = get_table_path(cfg, "alerts")

            # Build results DataFrame
            schema = StructType([
                StructField("alert_id", StringType()),
                StructField("classification", StringType()),
                StructField("confidence", DoubleType()),
                StructField("reasoning", StringType()),
                StructField("triage_method", StringType()),
                StructField("mitre_tactic", StringType()),
                StructField("recommended_severity", StringType()),
            ])

            results_df = (
                spark.createDataFrame(all_results, schema=schema)
                .withColumn("id", expr("uuid()"))
                .withColumn("agent_name", lit(self.agent_name))
                .withColumn("trace_id", lit(self._tracer._tracer if self._tracer else ""))
                .withColumn("triaged_at", current_timestamp())
            )

            # Write to triage results table
            safe_append(results_df, triage_table, mode="append")

            # Auto-close high-confidence false positives
            auto_close_ids = [
                r["alert_id"]
                for r in all_results
                if r["classification"] == "FALSE_POSITIVE"
                and r.get("confidence", 0) >= auto_close_confidence
            ]

            if auto_close_ids:
                ids_df = spark.createDataFrame([(i,) for i in auto_close_ids], ["id"])
                safe_merge(
                    spark,
                    ids_df,
                    alerts_table,
                    on_keys=["id"],
                    updates={"status": "closed", "false_positive": True},
                )

            self._end_trace(
                span,
                {
                    "status": "success",
                    "results_written": len(all_results),
                    "auto_closed": len(auto_close_ids),
                },
            )

        except Exception as e:
            self._end_trace(span, {"error": str(e)[:200], "status": "failed"})
            raise

    def _log_metrics(self, all_results: list):
        """Log metrics to MLflow experiment."""
        try:
            mlflow.log_metrics({
                "processed_count": self._alert_count,
                "auto_closed_count": self._fp_closed_count,
                "llm_classified_count": self._llm_classified_count,
                "tokens_used": self.llm.budget.used_total,
                "tokens_remaining": self.llm.budget.remaining,
            })

            mlflow.log_params({
                "batch_size": batch_size,
                "lookback_hours": lookback_hours,
                "auto_close_confidence": auto_close_confidence,
                "environment": cfg.environment,
            })
        except Exception as e:
            logger.warning(f"MLflow metrics logging failed: {e}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Execute Triage Agent

# COMMAND ----------

try:
    # Initialize agent
    agent = TriageAgent("triage_agent", cfg, llm, mon, spark)

    # Run agent with full lifecycle management
    result = agent.run()

    # Log result
    mon.log_event("triage_agent_result", {
        "status": result.status.value,
        "processed": result.processed_count,
        "errors": result.error_count,
        "duration_seconds": result.duration_seconds,
        "details": json.dumps(result.details),
    })

    # Exit with structured result
    print(json.dumps({
        "status": result.status.value,
        "trace_id": result.trace_id,
        "processed": result.processed_count,
        "errors": result.error_count,
        "duration_seconds": round(result.duration_seconds, 3),
        "details": result.details,
        "error": result.error,
    }))

    dbutils.notebook.exit(result.to_json())

except Exception as e:
    logger.exception(f"Triage agent fatal error: {e}")
    mon.log_error(e, "triage_agent_execution")

    error_result = AgentResult(
        status=AgentStatus.FAILED,
        agent_name="triage_agent",
        error=str(e)[:500],
    )

    dbutils.notebook.exit(error_result.to_json())
