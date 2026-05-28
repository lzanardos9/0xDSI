# Databricks notebook source
# MAGIC %md
# MAGIC # Agent 28: AI-Powered Correlation Agent
# MAGIC
# MAGIC **Production-Grade BatchAgent Implementation**
# MAGIC
# MAGIC Uses LLM to discover correlations between alerts and events that human analysts
# MAGIC might miss. Generates new correlation rule candidates from AI-discovered patterns.
# MAGIC
# MAGIC ## Key Features
# MAGIC - LLM-driven correlation discovery
# MAGIC - Reads recent alerts and events for context
# MAGIC - Generates correlation rule candidates with reasoning
# MAGIC - MLflow experiment tracking and metrics logging
# MAGIC - UC Function tool registration
# MAGIC - Writes to ai_correlation_discoveries table

# COMMAND ----------

# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

# MAGIC %md
# MAGIC ## Initialization and Configuration

# COMMAND ----------

from agent_framework import (
    BatchAgent, AgentResult, AgentStatus, UCTool, create_soc_tools
)
import mlflow
import mlflow.tracing
from pyspark.sql.functions import *
from pyspark.sql.types import *
import json
import time
import logging
from datetime import datetime, timedelta

logger = logging.getLogger("oxdsi.ai_correlation_agent")

# Parse notebook parameters
dbutils.widgets.text("batch_size", "10", "Max discovery batches per run")
dbutils.widgets.text("lookback_hours", "6", "Time window for correlation analysis")
dbutils.widgets.text("min_confidence", "0.65", "Minimum confidence for discovery")

batch_size = int(dbutils.widgets.get("batch_size"))
lookback_hours = int(dbutils.widgets.get("lookback_hours"))
min_confidence = float(dbutils.widgets.get("min_confidence"))

mon.log_event("ai_correlation_config_loaded", {
    "batch_size": batch_size,
    "lookback_hours": lookback_hours,
    "min_confidence": min_confidence,
})

# COMMAND ----------

# MAGIC %md
# MAGIC ## Define AICorrelationAgent Class

# COMMAND ----------

class AICorrelationAgent(BatchAgent):
    """
    AI-powered correlation discovery using LLM reasoning.

    Workflow:
    1. Fetch recent alerts and raw events
    2. Group related events by time window and entity
    3. Ask LLM to identify non-obvious correlations
    4. Extract reasoning and suggested rules
    5. Persist discoveries for analyst review
    """

    def __init__(self, agent_name: str, cfg, llm, mon, spark):
        super().__init__(agent_name, cfg, llm, mon, spark)
        self._discoveries = []
        self._discovery_count = 0

        # Register UC tools
        soc_tools = create_soc_tools(cfg)
        for tool in soc_tools:
            if tool.name in ["search_events", "get_alert_context"]:
                self.register_tool(tool)

    def execute(self) -> AgentResult:
        """Main execution: fetch data → analyze with LLM → extract rules → persist."""
        start_time = time.time()

        try:
            # Ensure output table exists
            self._ensure_output_table()

            # Fetch recent alerts
            alerts = self._fetch_recent_alerts()
            alert_count = alerts.count()

            if alert_count == 0:
                return AgentResult(
                    status=AgentStatus.IDLE,
                    agent_name=self.agent_name,
                    processed_count=0,
                    duration_seconds=time.time() - start_time,
                )

            # Fetch supporting events
            events = self._fetch_supporting_events()

            # Perform AI-driven correlation analysis
            alerts_data = alerts.collect()[:batch_size]
            for alert_group in self._group_alerts(alerts_data):
                discovery = self._analyze_correlation(alert_group, events.collect())
                if discovery and discovery.get("confidence", 0) >= min_confidence:
                    self._discoveries.append(discovery)

            # Persist discoveries
            if len(self._discoveries) > 0:
                self._write_discoveries()

            return AgentResult(
                status=AgentStatus.COMPLETED,
                agent_name=self.agent_name,
                processed_count=alert_count,
                error_count=0,
                duration_seconds=time.time() - start_time,
                details={
                    "alerts_analyzed": alert_count,
                    "discoveries_made": len(self._discoveries),
                    "min_confidence": min_confidence,
                    "avg_confidence": round(
                        sum(d.get("confidence", 0) for d in self._discoveries) / max(len(self._discoveries), 1), 3
                    ) if self._discoveries else 0,
                }
            )

        except Exception as e:
            duration = time.time() - start_time
            logger.exception(f"AICorrelationAgent failed: {e}")
            mon.log_event(f"{self.agent_name}_failed", {"error": str(e)[:500]})
            return AgentResult(
                status=AgentStatus.FAILED,
                agent_name=self.agent_name,
                duration_seconds=duration,
                error=str(e)[:500],
            )

    def _ensure_output_table(self):
        """Create ai_correlation_discoveries table if it doesn't exist."""
        table_name = get_table_path(cfg, "ai_correlation_discoveries")
        ensure_table_exists(
            spark, table_name,
            schema=StructType([
                StructField("discovery_id", StringType()),
                StructField("correlated_events", ArrayType(StringType())),
                StructField("reasoning", StringType()),
                StructField("confidence", DoubleType()),
                StructField("suggested_rule", StringType()),
                StructField("rule_condition", StringType()),
                StructField("timestamp", TimestampType()),
            ])
        )

    def _fetch_recent_alerts(self):
        """Fetch recent alerts for analysis."""
        table_name = get_table_path(cfg, "alerts")
        cutoff_time = f"current_timestamp() - interval {lookback_hours} hours"

        query = f"""
            SELECT
                alert_id, alert_type, source_entity, dest_entity,
                severity, created_at, rule_id
            FROM {table_name}
            WHERE created_at > {cutoff_time}
            ORDER BY severity DESC
            LIMIT {batch_size * 10}
        """

        return spark.sql(query)

    def _fetch_supporting_events(self):
        """Fetch raw events that might correlate with alerts."""
        table_name = get_table_path(cfg, "raw_events")
        cutoff_time = f"current_timestamp() - interval {lookback_hours} hours"

        query = f"""
            SELECT
                event_id, event_type, source_entity, dest_entity,
                source_ip, dest_ip, timestamp, event_data
            FROM {table_name}
            WHERE timestamp > {cutoff_time}
            LIMIT {batch_size * 100}
        """

        return spark.sql(query)

    def _group_alerts(self, alerts_data):
        """Group alerts by time window and entity for correlation analysis."""
        groups = []
        current_group = []
        cutoff_time = datetime.utcnow() - timedelta(minutes=5)

        for alert in sorted(alerts_data, key=lambda a: a.created_at):
            if len(current_group) > 0:
                last_alert = current_group[-1]
                time_diff = (alert.created_at - last_alert.created_at).total_seconds()
                if time_diff > 300:  # 5 minute window
                    groups.append(current_group)
                    current_group = []

            current_group.append(alert)

        if current_group:
            groups.append(current_group)

        return groups

    def _analyze_correlation(self, alert_group, all_events):
        """
        Use LLM to analyze correlations in an alert group.
        Returns a discovery dict or None if no significant correlation found.
        """
        if not alert_group:
            return None

        # Prepare context for LLM
        alert_summary = self._summarize_alerts(alert_group)
        event_summary = self._summarize_events(all_events, alert_group)

        system_prompt = """You are a cybersecurity analyst expert at finding subtle correlations.
Analyze the provided alerts and events to identify non-obvious connections that might indicate:
- Multi-stage attack campaigns
- Lateral movement patterns
- Supply chain attacks
- Insider threat indicators
- APT tradecraft

Return your analysis as JSON with:
- discovered_correlation: String describing the correlation
- confidence: Float 0-1
- reasoning: String explaining why this correlation matters
- suggested_rule: String for a new detection rule
- affected_entities: List of entities involved"""

        user_prompt = f"""Analyze these alerts and events for correlations:

ALERTS:
{alert_summary}

SUPPORTING EVENTS:
{event_summary}

Find correlations I might have missed."""

        try:
            # Use LLM to analyze
            response = self.llm_classify(
                system=system_prompt,
                user=user_prompt,
                json_mode=True,
                temperature=0.3
            )

            # Extract correlation details
            if "tool_calls" in response:
                # Tool was called - use that result
                return None  # For now, skip tool-based responses

            # Parse LLM response
            result = response
            if isinstance(result, dict) and "discovered_correlation" in result:
                confidence = float(result.get("confidence", 0))
                if confidence >= min_confidence:
                    return {
                        "discovery_id": f"disc_{int(time.time())}_{len(self._discoveries)}",
                        "correlated_events": self._extract_event_ids(alert_group),
                        "reasoning": result.get("reasoning", ""),
                        "confidence": confidence,
                        "suggested_rule": result.get("suggested_rule", ""),
                        "rule_condition": self._build_rule_condition(alert_group),
                    }
        except Exception as e:
            logger.warning(f"LLM correlation analysis failed: {e}")

        return None

    def _summarize_alerts(self, alerts):
        """Create a text summary of alerts for LLM context."""
        lines = []
        for alert in alerts[:5]:  # Limit to first 5
            lines.append(f"- {alert.alert_type} from {alert.source_entity} to {alert.dest_entity} (severity: {alert.severity})")
        return "\n".join(lines)

    def _summarize_events(self, events, alerts):
        """Create a text summary of related events."""
        # Filter events that mention source/dest entities from alerts
        alert_entities = set()
        for alert in alerts:
            alert_entities.add(alert.source_entity)
            alert_entities.add(alert.dest_entity)

        related_events = [e for e in events if (
            hasattr(e, 'source_entity') and e.source_entity in alert_entities or
            hasattr(e, 'dest_entity') and e.dest_entity in alert_entities
        )]

        lines = []
        for event in related_events[:10]:
            lines.append(f"- {event.event_type} from {getattr(event, 'source_entity', '?')} (at {event.timestamp})")
        return "\n".join(lines)

    def _extract_event_ids(self, alerts):
        """Extract event identifiers from an alert group."""
        event_ids = []
        for alert in alerts:
            event_ids.append(alert.alert_id)
        return event_ids

    def _build_rule_condition(self, alerts):
        """Build a correlation rule condition from alert patterns."""
        alert_types = [a.alert_type for a in alerts]
        condition_parts = [f"alert_type IN ({','.join(set(alert_types))})" if alert_types else "1=1"]
        return " AND ".join(condition_parts)

    def _write_discoveries(self):
        """Write discoveries to the output table."""
        table_name = get_table_path(cfg, "ai_correlation_discoveries")

        discovery_rows = []
        for discovery in self._discoveries:
            discovery_rows.append({
                "discovery_id": discovery["discovery_id"],
                "correlated_events": discovery["correlated_events"],
                "reasoning": discovery["reasoning"],
                "confidence": discovery["confidence"],
                "suggested_rule": discovery["suggested_rule"],
                "rule_condition": discovery["rule_condition"],
                "timestamp": datetime.utcnow(),
            })

        if discovery_rows:
            df = spark.createDataFrame(discovery_rows, schema=StructType([
                StructField("discovery_id", StringType()),
                StructField("correlated_events", ArrayType(StringType())),
                StructField("reasoning", StringType()),
                StructField("confidence", DoubleType()),
                StructField("suggested_rule", StringType()),
                StructField("rule_condition", StringType()),
                StructField("timestamp", TimestampType()),
            ]))
            safe_append(df, table_name)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Execution

# COMMAND ----------

# Initialize agent
agent = AICorrelationAgent("ai_correlation_discovery", cfg, llm, mon, spark)

# Execute
result = agent.run()

# Log result
mon.log_event("ai_correlation_execution_complete", {
    "status": result.status.value,
    "processed": result.processed_count,
    "errors": result.error_count,
    "duration": result.duration_seconds,
    "discoveries": result.details.get("discoveries_made", 0),
})

# Display result
print(result.to_json())
mlflow.log_dict(json.loads(result.to_json()), "execution_result")

# Exit with status
dbutils.notebook.exit(result.to_json())
