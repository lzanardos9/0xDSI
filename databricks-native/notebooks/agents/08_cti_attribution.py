# Databricks notebook source
# MAGIC %md
# MAGIC # Agent 08: Cyber Threat Intelligence & Attribution
# MAGIC
# MAGIC **Type:** BatchAgent (scheduled via Databricks Workflows)
# MAGIC
# MAGIC ## Purpose
# MAGIC Correlates Indicators of Compromise (IOCs) across multiple threat intel feeds,
# MAGIC performs campaign attribution by mapping IOCs to threat actor groups,
# MAGIC and analyzes TTP (Tactics, Techniques, Procedures) overlap for confidence scoring.
# MAGIC
# MAGIC ## Workflow
# MAGIC 1. Fetch recent IOCs from multiple threat intel sources and observed events
# MAGIC 2. Cross-correlate IOCs: find which feed(s) report each indicator
# MAGIC 3. LLM analyzes IOC patterns and known threat actor TTPs for attribution
# MAGIC 4. Score attribution confidence based on TTP match quality
# MAGIC 5. Write results to `cti_attribution_results` with campaign tracking
# MAGIC 6. Log metrics to MLflow experiment tracking
# MAGIC
# MAGIC ## Tools Registered
# MAGIC - `lookup_ioc`: Query threat intel feeds for IOC context
# MAGIC - `search_events`: Find events matching IOCs in our environment
# MAGIC
# MAGIC ## Output Table: `cti_attribution_results`
# MAGIC Columns: campaign_name, threat_actor, threat_actor_aliases, confidence,
# MAGIC ttp_overlap, ioc_matches, evidence_summary, created_at

# COMMAND ----------

# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

require_enabled("cti_attribution_agent")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Imports and Framework Setup

# COMMAND ----------

import json
import time
from typing import Optional, Any, Dict, List
from datetime import datetime, timedelta
import logging
import uuid

from agent_framework import (
    BatchAgent, AgentResult, AgentStatus, UCTool
)
from pyspark.sql.functions import (
    col, lit, current_timestamp, when, count as spark_count,
    struct, collect_list
)

logger = logging.getLogger("cti_attribution_agent")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Configuration & Parameters

# COMMAND ----------

dbutils.widgets.text("lookback_days", "7", "Days back to analyze IOCs")
dbutils.widgets.text("min_confidence", "0.6", "Min attribution confidence")
dbutils.widgets.text("max_actors", "10", "Max threat actors to identify")

lookback_days = int(dbutils.widgets.get("lookback_days"))
min_confidence = float(dbutils.widgets.get("min_confidence"))
max_actors = int(dbutils.widgets.get("max_actors"))

mon.log_event("cti_attribution_config", {
    "lookback_days": lookback_days,
    "min_confidence": min_confidence,
})

# COMMAND ----------

# MAGIC %md
# MAGIC ## Delta Table Schema

# COMMAND ----------

results_table = cfg.get_table_path("cti_attribution_results")

spark.sql(f"""
CREATE TABLE IF NOT EXISTS {results_table} (
    attribution_id STRING,
    campaign_name STRING,
    threat_actor STRING,
    threat_actor_aliases ARRAY<STRING>,
    confidence DOUBLE,
    ttp_overlap ARRAY<STRING>,
    ioc_matches INT,
    ioc_types MAP<STRING, INT>,
    evidence_summary STRING,
    first_observed TIMESTAMP,
    last_observed TIMESTAMP,
    trace_id STRING,
    agent_name STRING,
    created_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES ('delta.autoOptimize.optimizeWrite' = 'true')
""")

# COMMAND ----------

# MAGIC %md
# MAGIC ## CTI Attribution Agent Implementation

# COMMAND ----------

class CTIAttributionAgent(BatchAgent):
    """
    Cyber Threat Intelligence agent that performs IOC correlation and
    threat actor attribution with confidence scoring.
    """

    def __init__(self, agent_name: str, cfg, llm, mon, spark):
        super().__init__(agent_name, cfg, llm, mon, spark)
        self.results_table = cfg.get_table_path("cti_attribution_results")
        self.threat_intel_table = cfg.get_table_path("threat_intel_iocs")
        self.events_table = cfg.get_table_path("events")

    def get_tools(self) -> list[UCTool]:
        """Return CTI specific tools."""
        return [
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
                        "indicator_type": {
                            "type": "string",
                            "enum": ["ip", "domain", "hash", "url", "email"],
                        },
                    },
                    "required": ["indicator", "indicator_type"],
                },
            ),
            UCTool(
                name="search_events",
                description="Search events matching IOC patterns",
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
        ]

    def execute(self) -> AgentResult:
        """Main CTI attribution workflow."""
        span = self._start_trace("cti_attribution_execute")
        processed = 0
        errors = 0

        try:
            # Fetch recent IOCs
            iocs = self._fetch_iocs(lookback_days)
            if len(iocs) == 0:
                logger.info("No recent IOCs found")
                return AgentResult(
                    status=AgentStatus.COMPLETED,
                    agent_name=self.agent_name,
                    processed_count=0,
                    details={"reason": "no_iocs"},
                )

            processed = len(iocs)
            logger.info(f"Found {processed} IOCs")

            # Correlate IOCs
            correlations = self._correlate_iocs(iocs)
            logger.info(f"Found {len(correlations)} correlations")

            # Perform attribution
            attributions = self._perform_attribution(correlations)
            if not attributions:
                logger.warning("Attribution failed")
                errors += 1
                return AgentResult(
                    status=AgentStatus.DEGRADED,
                    agent_name=self.agent_name,
                    processed_count=processed,
                    error_count=1,
                    error="Attribution failed",
                )

            # Filter by confidence
            high_conf = [
                a for a in attributions
                if a.get("confidence", 0) >= min_confidence
            ]
            logger.info(f"{len(high_conf)}/{len(attributions)} high confidence")

            # Write results
            if high_conf:
                self._write_results(high_conf)
                logger.info(f"Wrote {len(high_conf)} results")

            return AgentResult(
                status=AgentStatus.COMPLETED if errors == 0 else AgentStatus.DEGRADED,
                agent_name=self.agent_name,
                processed_count=processed,
                error_count=errors,
                details={
                    "iocs_analyzed": processed,
                    "correlations": len(correlations),
                    "attributions": len(attributions),
                    "high_confidence": len(high_conf),
                },
            )

        except Exception as e:
            logger.exception("Execute failed")
            raise

    def _fetch_iocs(self, days: int) -> List[Dict[str, Any]]:
        """Fetch recent IOCs from threat intel feeds."""
        try:
            results = spark.sql(f"""
                SELECT
                    indicator_id,
                    indicator_value,
                    indicator_type,
                    feed_source,
                    threat_actor,
                    campaign_name,
                    severity,
                    first_seen,
                    last_seen,
                    COALESCE(tlp, 'WHITE') as tlp
                FROM {self.threat_intel_table}
                WHERE first_seen > current_timestamp() - INTERVAL {days} DAYS
                  OR last_seen > current_timestamp() - INTERVAL {days} DAYS
                ORDER BY last_seen DESC
                LIMIT 1000
            """).collect()

            return [row.asDict() for row in results]

        except Exception as e:
            logger.error(f"Failed to fetch IOCs: {e}")
            return []

    def _correlate_iocs(self, iocs: List[Dict]) -> List[Dict]:
        """Group IOCs by value to find correlations."""
        if not iocs:
            return []

        correlations = {}

        for ioc in iocs:
            key = (ioc["indicator_value"], ioc["indicator_type"])
            if key not in correlations:
                correlations[key] = {
                    "value": ioc["indicator_value"],
                    "type": ioc["indicator_type"],
                    "feeds": [],
                    "threat_actors": set(),
                    "campaigns": set(),
                    "severity": ioc.get("severity", "unknown"),
                }

            correlations[key]["feeds"].append(ioc["feed_source"])
            if ioc.get("threat_actor"):
                correlations[key]["threat_actors"].add(ioc["threat_actor"])
            if ioc.get("campaign_name"):
                correlations[key]["campaigns"].add(ioc["campaign_name"])

        result = []
        for corr in correlations.values():
            corr["threat_actors"] = list(corr["threat_actors"])
            corr["campaigns"] = list(corr["campaigns"])
            corr["feed_count"] = len(corr["feeds"])
            result.append(corr)

        return result

    def _perform_attribution(self, correlations: List[Dict]) -> List[Dict]:
        """Use LLM to perform threat actor attribution."""
        if not correlations:
            return []

        correlation_summary = self._summarize_correlations(correlations)

        system_prompt = """You are a cyber threat intelligence analyst. Analyze IOC correlations
and threat actor patterns to determine likely campaign attribution.

For each IOC group:
1. Check for TTP consistency
2. Evaluate confidence based on feed agreement
3. Identify campaign if applicable
4. Rate confidence 0.0-1.0

Return ONLY valid JSON array, no markdown."""

        user_prompt = f"""Perform threat actor attribution:

{correlation_summary}

Return JSON array where each element is:
{{
  "campaign_name": "Campaign name or Unknown",
  "threat_actor": "Attribution",
  "aliases": ["Names"],
  "confidence": 0.0-1.0,
  "ttp_overlap": ["TTPs"],
  "evidence": "Summary"
}}"""

        try:
            response = self.llm_classify(
                system=system_prompt,
                user=user_prompt,
                json_mode=True,
                temperature=0.2,
            )

            if isinstance(response, dict) and "raw_content" in response:
                attributions = json.loads(response["raw_content"])
            else:
                attributions = response

            if not isinstance(attributions, list):
                attributions = [attributions]

            return attributions[:max_actors]

        except Exception as e:
            logger.error(f"Attribution LLM failed: {e}")
            return []

    def _summarize_correlations(self, correlations: List[Dict]) -> str:
        """Create correlation summary for LLM."""
        lines = []
        for i, corr in enumerate(correlations[:15], 1):
            lines.append(
                f"{i}. {corr['type'].upper()}: {corr['value'][:50]} "
                f"({len(corr['feeds'])} feeds) "
                f"Actors: {','.join(corr['threat_actors'][:2]) or 'Unknown'}"
            )
        return "\n".join(lines)

    def _write_results(self, attributions: List[Dict]):
        """Write attribution results to Delta."""
        try:
            rows = []
            for attr in attributions:
                rows.append({
                    "attribution_id": str(uuid.uuid4()),
                    "campaign_name": attr.get("campaign_name", "Unknown"),
                    "threat_actor": attr.get("threat_actor", "Unknown"),
                    "threat_actor_aliases": attr.get("aliases", []),
                    "confidence": attr.get("confidence", 0.0),
                    "ttp_overlap": attr.get("ttp_overlap", []),
                    "ioc_matches": 0,
                    "ioc_types": {},
                    "evidence_summary": attr.get("evidence", ""),
                    "first_observed": datetime.now(),
                    "last_observed": datetime.now(),
                    "trace_id": self.agent_name,
                    "agent_name": self.agent_name,
                    "created_at": datetime.now(),
                })

            df = spark.createDataFrame(rows)
            safe_append(df, self.results_table, idempotency_key="attribution_id")

        except Exception as e:
            logger.error(f"Failed to write results: {e}")
            raise


# COMMAND ----------

# MAGIC %md
# MAGIC ## Agent Execution

# COMMAND ----------

try:
    import mlflow
    mlflow.set_experiment(f"/0xDSI/agents/cti_attribution")
except Exception as e:
    logger.warning(f"MLflow unavailable: {e}")

# Create and configure agent
agent = CTIAttributionAgent("cti_attribution", cfg, llm, mon, spark)
for tool in agent.get_tools():
    agent.register_tool(tool)

# Execute
result = agent.run()

# COMMAND ----------

# MAGIC %md
# MAGIC ## Results Summary

# COMMAND ----------

mon.log_event("cti_attribution_complete", {
    "status": result.status.value,
    "processed": result.processed_count,
    "errors": result.error_count,
    "duration": result.duration_seconds,
})

logger.info(f"CTI Attribution: {result.to_json()}")
dbutils.notebook.exit(result.to_json())
