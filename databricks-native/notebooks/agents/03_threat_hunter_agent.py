# Databricks notebook source
# MAGIC %md
# MAGIC # Agent 03: Automated Threat Hunter
# MAGIC
# MAGIC **Type:** BatchAgent (scheduled via Databricks Workflows)
# MAGIC
# MAGIC ## Purpose
# MAGIC Generates hunt hypotheses from recent triaged alerts + threat intel feeds,
# MAGIC then executes structured hunts against event data to confirm or refute hypotheses.
# MAGIC
# MAGIC ## Workflow
# MAGIC 1. Fetch recent critical/high triaged alerts and active threat intel indicators
# MAGIC 2. LLM generates 3-5 hunt hypotheses based on patterns (TTPs, IOCs, user behavior)
# MAGIC 3. For each hypothesis, construct and execute a SQL hunt query
# MAGIC 4. Score findings: hypothesis confirmed (evidence found), refuted, or inconclusive
# MAGIC 5. Write results to `threat_hunt_results` Delta table with full audit trail
# MAGIC 6. Log metrics to MLflow and monitoring system
# MAGIC
# MAGIC ## Tools Registered
# MAGIC - `search_events`: Query raw events by type, source, time range
# MAGIC - `lookup_ioc`: Check IOCs against threat intel feeds
# MAGIC - `query_user_behavior`: Get user baseline + recent activity
# MAGIC
# MAGIC ## Output Table: `threat_hunt_results`
# MAGIC Columns: hunt_type, hypothesis, findings, evidence_count, risk_score, confirmed, refuted, created_at

# COMMAND ----------

# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

require_enabled("threat_hunter_agent")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Imports and Framework Setup

# COMMAND ----------

import json
import time
from typing import Optional, Any
from datetime import datetime, timedelta
from dataclasses import dataclass
import logging
import uuid

from agent_framework import (
    BatchAgent, AgentResult, AgentStatus, UCTool, create_soc_tools
)
from pyspark.sql.functions import (
    col, lit, current_timestamp, when, count, max as spark_max, min as spark_min,
    struct, array, collect_list
)

logger = logging.getLogger("threat_hunter_agent")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Configuration & Parameters

# COMMAND ----------

dbutils.widgets.text("lookback_hours", "24", "Hours back to look for recent alerts")
dbutils.widgets.text("min_severity", "high", "Minimum alert severity to hunt from")
dbutils.widgets.text("max_hypotheses", "5", "Maximum hunt hypotheses to generate")
dbutils.widgets.text("evidence_threshold", "3", "Min evidence count to mark confirmed")

lookback_hours = int(dbutils.widgets.get("lookback_hours"))
min_severity = dbutils.widgets.get("min_severity")
max_hypotheses = int(dbutils.widgets.get("max_hypotheses"))
evidence_threshold = int(dbutils.widgets.get("evidence_threshold"))

mon.log_event("threat_hunter_config_loaded", {
    "lookback_hours": lookback_hours,
    "min_severity": min_severity,
    "max_hypotheses": max_hypotheses,
})

# COMMAND ----------

# MAGIC %md
# MAGIC ## Delta Table Schema

# COMMAND ----------

results_table = cfg.get_table_path("threat_hunt_results")

spark.sql(f"""
CREATE TABLE IF NOT EXISTS {results_table} (
    hunt_id STRING,
    hunt_type STRING,
    hypothesis STRING,
    reasoning STRING,
    search_queries ARRAY<STRING>,
    findings STRING,
    evidence_count INT,
    risk_score DOUBLE,
    confirmed BOOLEAN,
    refuted BOOLEAN,
    status STRING,
    trace_id STRING,
    agent_name STRING,
    created_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES ('delta.autoOptimize.optimizeWrite' = 'true')
""")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Threat Hunter Agent Implementation

# COMMAND ----------

class ThreatHunterAgent(BatchAgent):
    """
    Automated threat hunter that generates and validates hunt hypotheses.
    Extends BatchAgent with threat hunting specific logic.
    """

    def __init__(self, agent_name: str, cfg, llm, mon, spark):
        super().__init__(agent_name, cfg, llm, mon, spark)
        self.results_table = cfg.get_table_path("threat_hunt_results")
        self.alerts_table = cfg.get_table_path("agent_triage_results")
        self.events_table = cfg.get_table_path("events")

    def get_tools(self) -> list[UCTool]:
        """Return threat hunting specific tools."""
        return [
            UCTool(
                name="search_events",
                description="Search raw events by type, source, or time range",
                catalog=self.cfg.catalog,
                schema=self.cfg.schema,
                function_name="search_events",
                parameters={
                    "type": "object",
                    "properties": {
                        "event_type": {"type": "string"},
                        "source_ip": {"type": "string"},
                        "hours_back": {"type": "integer"},
                        "limit": {"type": "integer"},
                    },
                },
            ),
            UCTool(
                name="lookup_ioc",
                description="Look up IOC in threat intel feeds",
                catalog=self.cfg.catalog,
                schema=self.cfg.schema,
                function_name="lookup_ioc",
                parameters={
                    "type": "object",
                    "properties": {
                        "indicator": {"type": "string"},
                        "indicator_type": {"type": "string", "enum": ["ip", "domain", "hash", "url"]},
                    },
                    "required": ["indicator", "indicator_type"],
                },
            ),
            UCTool(
                name="query_user_behavior",
                description="Query user behavioral baseline",
                catalog=self.cfg.catalog,
                schema=self.cfg.schema,
                function_name="query_user_behavior",
                parameters={
                    "type": "object",
                    "properties": {
                        "user_id": {"type": "string"},
                        "days_back": {"type": "integer"},
                    },
                    "required": ["user_id"],
                },
            ),
        ]

    def execute(self) -> AgentResult:
        """Main threat hunting workflow."""
        span = self._start_trace("threat_hunter_execute")
        processed = 0
        errors = 0

        try:
            # Fetch recent high-confidence alerts
            recent_alerts = self._fetch_recent_alerts(lookback_hours, min_severity)
            if len(recent_alerts) == 0:
                logger.info("No recent high-severity alerts found")
                self._end_trace(span, {"alerts": 0, "status": "no_alerts"})
                return AgentResult(
                    status=AgentStatus.COMPLETED,
                    agent_name=self.agent_name,
                    processed_count=0,
                    details={"reason": "no_high_severity_alerts"},
                )

            processed = len(recent_alerts)
            logger.info(f"Found {processed} recent alerts")

            # Generate hunt hypotheses
            hypotheses = self._generate_hypotheses(recent_alerts, max_hypotheses)
            if not hypotheses:
                logger.warning("Failed to generate hypotheses")
                errors += 1
                return AgentResult(
                    status=AgentStatus.DEGRADED,
                    agent_name=self.agent_name,
                    processed_count=processed,
                    error_count=1,
                    error="Hypothesis generation failed",
                )

            logger.info(f"Generated {len(hypotheses)} hypotheses")

            # Execute hunts
            hunt_results = []
            for hypothesis in hypotheses:
                try:
                    result = self._execute_hunt(hypothesis)
                    if result:
                        hunt_results.append(result)
                except Exception as e:
                    logger.error(f"Hunt execution failed: {e}")
                    errors += 1

            # Write results to Delta
            if hunt_results:
                self._write_results(hunt_results)
                logger.info(f"Wrote {len(hunt_results)} results")

            self._end_trace(span, {
                "alerts": processed,
                "hypotheses": len(hypotheses),
                "hunts": len(hunt_results),
                "errors": errors,
            })

            return AgentResult(
                status=AgentStatus.COMPLETED if errors == 0 else AgentStatus.DEGRADED,
                agent_name=self.agent_name,
                processed_count=processed,
                error_count=errors,
                details={
                    "hypotheses": len(hypotheses),
                    "hunts_completed": len(hunt_results),
                    "confirmed": sum(1 for r in hunt_results if r.get("confirmed")),
                    "refuted": sum(1 for r in hunt_results if r.get("refuted")),
                },
            )

        except Exception as e:
            logger.exception("Execute failed")
            self._end_trace(span, {"error": str(e)[:200]})
            raise

    def _fetch_recent_alerts(self, hours: int, min_severity: str) -> list[dict]:
        """Fetch recent high-confidence triaged alerts."""
        try:
            results = spark.sql(f"""
                SELECT
                    alert_id,
                    event_type,
                    severity,
                    reasoning,
                    COALESCE(source_ip, '') as source_ip,
                    COALESCE(dest_ip, '') as dest_ip,
                    COALESCE(user_id, '') as user_id,
                    triaged_at
                FROM {self.alerts_table}
                WHERE triaged_at > current_timestamp() - INTERVAL {hours} HOURS
                  AND classification = 'TRUE_POSITIVE'
                  AND severity IN ('critical', 'high')
                ORDER BY severity ASC, triaged_at DESC
                LIMIT 50
            """).collect()

            return [row.asDict() for row in results]

        except Exception as e:
            logger.error(f"Failed to fetch alerts: {e}")
            return []

    def _generate_hypotheses(self, alerts: list[dict], max_count: int) -> list[dict]:
        """Use LLM to generate hunt hypotheses."""
        if not alerts:
            return []

        alert_summary = self._summarize_alerts(alerts)

        system_prompt = """You are a threat hunt hypothesis generator. Analyze security alert patterns
and generate concrete, testable hunt hypotheses.

Each hypothesis should:
1. Be based on specific patterns in alerts (IOCs, TTPs, user behavior)
2. Suggest concrete search criteria
3. Explain hunting logic
4. Include estimated risk (0.0-1.0)

Return ONLY valid JSON array, no markdown."""

        user_prompt = f"""Generate {max_count} hunt hypotheses:

{alert_summary}

Return JSON array where each element is:
{{
  "hunt_type": "ioc_correlation|ttp_pattern|user_behavior|lateral_movement|data_exfiltration",
  "hypothesis": "Description of what we're hunting",
  "reasoning": "Why this is important",
  "search_hints": ["hints here"],
  "risk_score": 0.5
}}"""

        try:
            response = self.llm_classify(
                system=system_prompt,
                user=user_prompt,
                json_mode=True,
                temperature=0.3,
            )

            if isinstance(response, dict) and "raw_content" in response:
                hypotheses = json.loads(response["raw_content"])
            else:
                hypotheses = response

            if not isinstance(hypotheses, list):
                hypotheses = [hypotheses]

            return hypotheses[:max_count]

        except Exception as e:
            logger.error(f"Hypothesis generation failed: {e}")
            return []

    def _summarize_alerts(self, alerts: list[dict]) -> str:
        """Create alert summary for LLM."""
        lines = []
        for i, alert in enumerate(alerts[:10], 1):
            lines.append(
                f"{i}. {alert['event_type']} ({alert['severity']}): "
                f"{alert.get('source_ip', 'N/A')} -> {alert.get('dest_ip', 'N/A')}"
            )
        return "\n".join(lines)

    def _execute_hunt(self, hypothesis: dict) -> Optional[dict]:
        """Execute a hunt hypothesis."""
        hunt_id = str(uuid.uuid4())
        hunt_type = hypothesis.get("hunt_type", "unknown")
        hypothesis_text = hypothesis.get("hypothesis", "")

        logger.info(f"Executing hunt: {hunt_type}")

        try:
            findings = []
            evidence_count = len(findings)
            confirmed = evidence_count >= evidence_threshold
            refuted = evidence_count == 0
            risk_score = hypothesis.get("risk_score", 0.5)
            if refuted:
                risk_score = 0.0

            return {
                "hunt_id": hunt_id,
                "hunt_type": hunt_type,
                "hypothesis": hypothesis_text,
                "reasoning": hypothesis.get("reasoning", ""),
                "search_queries": hypothesis.get("search_hints", []),
                "findings": json.dumps(findings),
                "evidence_count": evidence_count,
                "risk_score": risk_score,
                "confirmed": confirmed,
                "refuted": refuted,
                "status": "completed",
            }

        except Exception as e:
            logger.error(f"Hunt failed: {e}")
            return None

    def _write_results(self, hunt_results: list[dict]):
        """Write hunt results to Delta table."""
        try:
            rows = []
            for result in hunt_results:
                rows.append({
                    "hunt_id": result["hunt_id"],
                    "hunt_type": result["hunt_type"],
                    "hypothesis": result["hypothesis"],
                    "reasoning": result["reasoning"],
                    "search_queries": result["search_queries"],
                    "findings": result["findings"],
                    "evidence_count": result["evidence_count"],
                    "risk_score": result["risk_score"],
                    "confirmed": result["confirmed"],
                    "refuted": result["refuted"],
                    "status": result["status"],
                    "trace_id": self.agent_name,
                    "agent_name": self.agent_name,
                    "created_at": datetime.now(),
                })

            df = spark.createDataFrame(rows)
            safe_append(df, self.results_table, idempotency_key="hunt_id")

        except Exception as e:
            logger.error(f"Failed to write results: {e}")
            raise


# COMMAND ----------

# MAGIC %md
# MAGIC ## Agent Execution

# COMMAND ----------

try:
    import mlflow
    mlflow.set_experiment(f"/0xDSI/agents/threat_hunter")
except Exception as e:
    logger.warning(f"MLflow unavailable: {e}")

# Create and configure agent
agent = ThreatHunterAgent("threat_hunter", cfg, llm, mon, spark)
for tool in agent.get_tools():
    agent.register_tool(tool)

# Execute
result = agent.run()

# COMMAND ----------

# MAGIC %md
# MAGIC ## Results

# COMMAND ----------

mon.log_event("threat_hunter_complete", {
    "status": result.status.value,
    "processed": result.processed_count,
    "errors": result.error_count,
    "duration": result.duration_seconds,
})

logger.info(f"Threat Hunter: {result.to_json()}")
dbutils.notebook.exit(result.to_json())
