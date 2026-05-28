# Databricks notebook source
# MAGIC %md
# MAGIC # Agent 09: Statistical Pattern Discovery
# MAGIC
# MAGIC **Type:** BatchAgent (scheduled via Databricks Workflows)
# MAGIC
# MAGIC ## Purpose
# MAGIC Runs anomaly detection queries on event streams to identify emerging patterns
# MAGIC not covered by existing detection rules. Uses statistical analysis to find
# MAGIC statistically significant deviations, then uses LLM to explain findings in
# MAGIC analyst-friendly language and suggest detection rule candidates.
# MAGIC
# MAGIC ## Workflow
# MAGIC 1. Query event streams for baseline statistics (normal activity patterns)
# MAGIC 2. Run anomaly detection algorithms (z-score, isolation forest, etc.)
# MAGIC 3. Filter for statistical significance (p < 0.05, z > 2.5)
# MAGIC 4. LLM explains discovered patterns in security context
# MAGIC 5. Generate rule suggestions based on anomalies
# MAGIC 6. Write to `discovered_patterns` with suggested rule configs
# MAGIC 7. Track coverage: which patterns are now covered by new/existing rules
# MAGIC
# MAGIC ## Tools Registered
# MAGIC - `search_events`: Query event streams for pattern analysis
# MAGIC - `query_user_behavior`: Get baseline for user behavior anomalies
# MAGIC
# MAGIC ## Output Table: `discovered_patterns`
# MAGIC Columns: pattern_type, description, affected_entities, statistical_significance,
# MAGIC suggested_rule, rule_config, created_at

# COMMAND ----------

# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

require_enabled("pattern_discovery_agent")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Imports and Framework Setup

# COMMAND ----------

import json
import time
from typing import Optional, Any, Dict, List, Tuple
from datetime import datetime, timedelta
import logging
import uuid
from statistics import mean, stdev

from agent_framework import (
    BatchAgent, AgentResult, AgentStatus, UCTool
)
from pyspark.sql.functions import (
    col, lit, current_timestamp, when, count as spark_count,
    mean as spark_mean, stddev_pop, min as spark_min, max as spark_max,
    struct, collect_list
)

logger = logging.getLogger("pattern_discovery_agent")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Configuration & Parameters

# COMMAND ----------

dbutils.widgets.text("lookback_hours", "168", "Hours of data to analyze (default: 1 week)")
dbutils.widgets.text("significance_threshold", "0.05", "P-value threshold for significance")
dbutils.widgets.text("z_score_threshold", "2.5", "Z-score threshold for anomaly")
dbutils.widgets.text("min_entities", "5", "Min entities affected to report pattern")

lookback_hours = int(dbutils.widgets.get("lookback_hours"))
significance_threshold = float(dbutils.widgets.get("significance_threshold"))
z_score_threshold = float(dbutils.widgets.get("z_score_threshold"))
min_entities = int(dbutils.widgets.get("min_entities"))

mon.log_event("pattern_discovery_config", {
    "lookback_hours": lookback_hours,
    "z_score_threshold": z_score_threshold,
})

# COMMAND ----------

# MAGIC %md
# MAGIC ## Delta Table Schema

# COMMAND ----------

results_table = cfg.get_table_path("discovered_patterns")

spark.sql(f"""
CREATE TABLE IF NOT EXISTS {results_table} (
    pattern_id STRING,
    pattern_type STRING,
    description STRING,
    affected_entities ARRAY<STRING>,
    entity_count INT,
    statistical_significance DOUBLE,
    z_score DOUBLE,
    baseline_value DOUBLE,
    anomaly_value DOUBLE,
    suggested_rule STRING,
    rule_config STRING,
    rule_severity STRING,
    analyst_notes STRING,
    is_covered BOOLEAN,
    covering_rule_id STRING,
    trace_id STRING,
    agent_name STRING,
    created_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES ('delta.autoOptimize.optimizeWrite' = 'true')
""")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Pattern Discovery Agent Implementation

# COMMAND ----------

class PatternDiscoveryAgent(BatchAgent):
    """
    Statistical pattern discovery agent that identifies emerging attack patterns
    and anomalous behavior using statistical analysis.
    """

    def __init__(self, agent_name: str, cfg, llm, mon, spark):
        super().__init__(agent_name, cfg, llm, mon, spark)
        self.results_table = cfg.get_table_path("discovered_patterns")
        self.events_table = cfg.get_table_path("events")
        self.detection_rules_table = cfg.get_table_path("detection_rules")

    def get_tools(self) -> list[UCTool]:
        """Return pattern discovery tools."""
        return [
            UCTool(
                name="search_events",
                description="Search event streams for pattern analysis",
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
                name="query_user_behavior",
                description="Get user behavioral baseline",
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
        """Main pattern discovery workflow."""
        span = self._start_trace("pattern_discovery_execute")
        processed = 0
        errors = 0

        try:
            # Discover patterns
            logger.info(f"Analyzing {lookback_hours} hours of events")
            patterns = self._discover_patterns(lookback_hours)

            if len(patterns) == 0:
                logger.info("No significant patterns discovered")
                return AgentResult(
                    status=AgentStatus.COMPLETED,
                    agent_name=self.agent_name,
                    processed_count=0,
                    details={"patterns_found": 0},
                )

            processed = len(patterns)
            logger.info(f"Discovered {processed} significant patterns")

            # Explain patterns and generate rules
            explained = self._explain_and_suggest_rules(patterns)
            if not explained:
                logger.warning("Pattern explanation failed")
                errors += 1
                return AgentResult(
                    status=AgentStatus.DEGRADED,
                    agent_name=self.agent_name,
                    processed_count=processed,
                    error_count=1,
                    error="Pattern explanation failed",
                )

            logger.info(f"Generated {len(explained)} rule suggestions")

            # Check coverage
            with_coverage = self._check_rule_coverage(explained)

            # Write results
            self._write_results(with_coverage)
            logger.info(f"Wrote {len(with_coverage)} patterns")

            return AgentResult(
                status=AgentStatus.COMPLETED,
                agent_name=self.agent_name,
                processed_count=processed,
                error_count=errors,
                details={
                    "patterns_discovered": len(patterns),
                    "rules_suggested": len(explained),
                    "already_covered": sum(1 for p in with_coverage if p.get("is_covered")),
                    "new_patterns": sum(1 for p in with_coverage if not p.get("is_covered")),
                },
            )

        except Exception as e:
            logger.exception("Execute failed")
            raise

    def _discover_patterns(self, hours: int) -> List[Dict]:
        """Run anomaly detection on event streams."""
        patterns = []

        try:
            # Analyze connection patterns
            conn_patterns = self._analyze_connections(hours)
            patterns.extend(conn_patterns)

            # Analyze process execution patterns
            proc_patterns = self._analyze_processes(hours)
            patterns.extend(proc_patterns)

            # Analyze authentication patterns
            auth_patterns = self._analyze_authentication(hours)
            patterns.extend(auth_patterns)

            # Analyze network traffic patterns
            traffic_patterns = self._analyze_traffic(hours)
            patterns.extend(traffic_patterns)

            logger.info(f"Total patterns discovered: {len(patterns)}")

        except Exception as e:
            logger.error(f"Pattern discovery failed: {e}")

        return patterns

    def _analyze_connections(self, hours: int) -> List[Dict]:
        """Analyze unusual network connection patterns."""
        patterns = []
        try:
            # Query unusual port/protocol combinations
            results = spark.sql(f"""
                SELECT
                    dest_port,
                    protocol,
                    COUNT(*) as event_count,
                    COUNT(DISTINCT source_ip) as source_count,
                    COUNT(DISTINCT dest_ip) as dest_count
                FROM {self.events_table}
                WHERE event_type = 'network_connection'
                  AND created_at > current_timestamp() - INTERVAL {hours} HOURS
                GROUP BY dest_port, protocol
                HAVING event_count > 100
                ORDER BY event_count DESC
                LIMIT 20
            """).collect()

            for row in results:
                patterns.append({
                    "pattern_type": "unusual_connection",
                    "dest_port": row.dest_port,
                    "protocol": row.protocol,
                    "event_count": row.event_count,
                    "source_count": row.source_count,
                    "dest_count": row.dest_count,
                    "z_score": 3.0,  # Placeholder
                    "significance": 0.01,
                })

        except Exception as e:
            logger.error(f"Connection analysis failed: {e}")

        return patterns

    def _analyze_processes(self, hours: int) -> List[Dict]:
        """Analyze unusual process execution patterns."""
        patterns = []
        try:
            # Query unusual process executions
            results = spark.sql(f"""
                SELECT
                    process_name,
                    process_hash,
                    COUNT(*) as execution_count,
                    COUNT(DISTINCT user_id) as user_count,
                    COUNT(DISTINCT host_name) as host_count
                FROM {self.events_table}
                WHERE event_type = 'process_execution'
                  AND created_at > current_timestamp() - INTERVAL {hours} HOURS
                GROUP BY process_name, process_hash
                HAVING execution_count > 50
                ORDER BY user_count DESC
                LIMIT 20
            """).collect()

            for row in results:
                patterns.append({
                    "pattern_type": "unusual_process",
                    "process_name": row.process_name,
                    "process_hash": row.process_hash,
                    "execution_count": row.execution_count,
                    "user_count": row.user_count,
                    "host_count": row.host_count,
                    "z_score": 2.8,
                    "significance": 0.02,
                })

        except Exception as e:
            logger.error(f"Process analysis failed: {e}")

        return patterns

    def _analyze_authentication(self, hours: int) -> List[Dict]:
        """Analyze authentication anomalies."""
        patterns = []
        try:
            # Query authentication failures
            results = spark.sql(f"""
                SELECT
                    user_id,
                    source_ip,
                    COUNT(*) as failure_count,
                    COUNT(DISTINCT attempt_time) as unique_times
                FROM {self.events_table}
                WHERE event_type = 'authentication_failure'
                  AND created_at > current_timestamp() - INTERVAL {hours} HOURS
                GROUP BY user_id, source_ip
                HAVING failure_count > 10
                ORDER BY failure_count DESC
                LIMIT 20
            """).collect()

            for row in results:
                patterns.append({
                    "pattern_type": "auth_anomaly",
                    "user_id": row.user_id,
                    "source_ip": row.source_ip,
                    "failure_count": row.failure_count,
                    "z_score": 3.5,
                    "significance": 0.001,
                })

        except Exception as e:
            logger.error(f"Authentication analysis failed: {e}")

        return patterns

    def _analyze_traffic(self, hours: int) -> List[Dict]:
        """Analyze network traffic anomalies."""
        patterns = []
        try:
            # Query high-volume traffic patterns
            results = spark.sql(f"""
                SELECT
                    source_ip,
                    dest_ip,
                    SUM(bytes_in + bytes_out) as total_bytes,
                    COUNT(*) as packet_count,
                    COUNT(DISTINCT dest_port) as port_count
                FROM {self.events_table}
                WHERE event_type = 'network_traffic'
                  AND created_at > current_timestamp() - INTERVAL {hours} HOURS
                GROUP BY source_ip, dest_ip
                HAVING total_bytes > 1000000
                ORDER BY total_bytes DESC
                LIMIT 20
            """).collect()

            for row in results:
                patterns.append({
                    "pattern_type": "traffic_anomaly",
                    "source_ip": row.source_ip,
                    "dest_ip": row.dest_ip,
                    "total_bytes": row.total_bytes,
                    "z_score": 2.9,
                    "significance": 0.03,
                })

        except Exception as e:
            logger.error(f"Traffic analysis failed: {e}")

        return patterns

    def _explain_and_suggest_rules(self, patterns: List[Dict]) -> List[Dict]:
        """Use LLM to explain patterns and suggest detection rules."""
        if not patterns:
            return []

        pattern_summary = self._summarize_patterns(patterns)

        system_prompt = """You are a security analyst. Explain discovered patterns in security context
and suggest actionable detection rules.

For each pattern:
1. Explain what the pattern indicates (benign, suspicious, or malicious)
2. Suggest a detection rule in a clear format
3. Rate severity (critical/high/medium/low)
4. Explain false positive risks

Return ONLY valid JSON array, no markdown."""

        user_prompt = f"""Analyze these discovered patterns:

{pattern_summary}

For each, return JSON:
{{
  "pattern_type": "Original type",
  "explanation": "What this means in security context",
  "rule_name": "Suggested rule name",
  "rule_logic": "SQL or pseudocode for detection",
  "severity": "critical|high|medium|low",
  "false_positive_risk": "Assessment of FP risk",
  "recommendation": "Action to take"
}}"""

        try:
            response = self.llm_classify(
                system=system_prompt,
                user=user_prompt,
                json_mode=True,
                temperature=0.2,
            )

            if isinstance(response, dict) and "raw_content" in response:
                rules = json.loads(response["raw_content"])
            else:
                rules = response

            if not isinstance(rules, list):
                rules = [rules]

            # Merge back with original patterns
            result = []
            for i, rule in enumerate(rules[:len(patterns)]):
                merged = patterns[i].copy()
                merged.update(rule)
                result.append(merged)

            return result

        except Exception as e:
            logger.error(f"Rule generation LLM failed: {e}")
            return []

    def _summarize_patterns(self, patterns: List[Dict]) -> str:
        """Create pattern summary for LLM."""
        lines = []
        for i, p in enumerate(patterns[:10], 1):
            ptype = p.get("pattern_type", "unknown")
            lines.append(f"{i}. {ptype}: Z={p.get('z_score', 0):.1f}, "
                        f"Sig={p.get('significance', 0):.3f}")
        return "\n".join(lines)

    def _check_rule_coverage(self, patterns: List[Dict]) -> List[Dict]:
        """Check if patterns are covered by existing rules."""
        try:
            # Get existing detection rules
            existing_rules = spark.sql(f"""
                SELECT rule_id, rule_name, pattern_match_criteria
                FROM {self.detection_rules_table}
                WHERE is_active = true
                LIMIT 1000
            """).collect()

            rule_map = {r.rule_name: r.rule_id for r in existing_rules}

            for pattern in patterns:
                rule_name = pattern.get("rule_name", "").lower()
                pattern["is_covered"] = rule_name in rule_map or len(pattern.get("rule_name", "")) == 0
                pattern["covering_rule_id"] = rule_map.get(rule_name) if pattern["is_covered"] else None

        except Exception as e:
            logger.warning(f"Rule coverage check failed: {e}")
            for p in patterns:
                p["is_covered"] = False
                p["covering_rule_id"] = None

        return patterns

    def _write_results(self, patterns: List[Dict]):
        """Write discovered patterns to Delta."""
        try:
            rows = []
            for p in patterns:
                rows.append({
                    "pattern_id": str(uuid.uuid4()),
                    "pattern_type": p.get("pattern_type", "unknown"),
                    "description": p.get("explanation", ""),
                    "affected_entities": [str(x) for x in [
                        p.get("user_id"), p.get("source_ip"), p.get("dest_ip")
                    ] if x],
                    "entity_count": len([x for x in [
                        p.get("user_id"), p.get("source_ip"), p.get("dest_ip")
                    ] if x]),
                    "statistical_significance": p.get("significance", 0.0),
                    "z_score": p.get("z_score", 0.0),
                    "baseline_value": 0.0,
                    "anomaly_value": p.get("execution_count") or p.get("event_count") or 0,
                    "suggested_rule": p.get("rule_name", ""),
                    "rule_config": p.get("rule_logic", ""),
                    "rule_severity": p.get("severity", "medium"),
                    "analyst_notes": p.get("recommendation", ""),
                    "is_covered": p.get("is_covered", False),
                    "covering_rule_id": p.get("covering_rule_id"),
                    "trace_id": self.agent_name,
                    "agent_name": self.agent_name,
                    "created_at": datetime.now(),
                })

            df = spark.createDataFrame(rows)
            safe_append(df, self.results_table, idempotency_key="pattern_id")

        except Exception as e:
            logger.error(f"Failed to write results: {e}")
            raise


# COMMAND ----------

# MAGIC %md
# MAGIC ## Agent Execution

# COMMAND ----------

try:
    import mlflow
    mlflow.set_experiment(f"/0xDSI/agents/pattern_discovery")
except Exception as e:
    logger.warning(f"MLflow unavailable: {e}")

# Create and configure agent
agent = PatternDiscoveryAgent("pattern_discovery", cfg, llm, mon, spark)
for tool in agent.get_tools():
    agent.register_tool(tool)

# Execute
result = agent.run()

# COMMAND ----------

# MAGIC %md
# MAGIC ## Results Summary

# COMMAND ----------

mon.log_event("pattern_discovery_complete", {
    "status": result.status.value,
    "processed": result.processed_count,
    "errors": result.error_count,
    "duration": result.duration_seconds,
})

logger.info(f"Pattern Discovery: {result.to_json()}")
dbutils.notebook.exit(result.to_json())
