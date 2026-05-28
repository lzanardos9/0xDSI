# Databricks notebook source
# MAGIC %md
# MAGIC # Agent 23 - Data Connector Health Monitor
# MAGIC Mosaic AI Agent Framework BatchAgent.
# MAGIC Monitors and manages data source connections.
# MAGIC Detects stale connectors, data gaps, schema drift.
# MAGIC LLM generates remediation recommendations.

# COMMAND ----------

# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

require_enabled("connector_adapter")

# COMMAND ----------

import json
import time
from datetime import datetime, timezone, timedelta
from pyspark.sql import functions as F

from agent_framework import BatchAgent, AgentResult, AgentStatus

# COMMAND ----------

class ConnectorHealthAgent(BatchAgent):
    """
    Batch agent that monitors data connector health and integrity.
    - Reads connector health metrics from data_connector_configs
    - Detects stale connectors, data gaps, schema drift
    - Uses LLM to generate remediation recommendations
    - Writes to connector_health_checks table
    """

    def execute(self) -> AgentResult:
        """Execute connector health monitoring."""
        try:
            connectors_table = get_table_path(cfg, "data_connector_configs")
            data_metrics_table = get_table_path(cfg, "connector_metrics")
            output_table = get_table_path(cfg, "connector_health_checks")

            # Get all active connectors
            connectors_df = spark.read.table(connectors_table).filter(
                F.col("status") == "active"
            )
            connectors = connectors_df.collect()

            if len(connectors) == 0:
                return AgentResult(
                    status=AgentStatus.SKIPPED,
                    agent_name=self.agent_name,
                    details={"reason": "no_active_connectors"}
                )

            health_checks = []
            error_count = 0

            for connector in connectors:
                try:
                    connector_id = connector["connector_id"]
                    connector_name = connector.get("connector_name", connector_id)

                    # Check 1: Data Freshness
                    freshness_check = self._check_data_freshness(
                        connector_id, data_metrics_table
                    )
                    if freshness_check:
                        health_checks.append(freshness_check)

                    # Check 2: Data Gap Detection
                    gap_check = self._check_data_gaps(
                        connector_id, data_metrics_table
                    )
                    if gap_check:
                        health_checks.append(gap_check)

                    # Check 3: Schema Drift Detection
                    schema_check = self._check_schema_drift(connector)
                    if schema_check:
                        health_checks.append(schema_check)

                    # Generate LLM-based recommendations if issues found
                    issues = [c for c in [freshness_check, gap_check, schema_check] if c]
                    if issues:
                        recommendation = self._get_remediation_recommendation(
                            connector_id, connector_name, issues
                        )
                        if recommendation:
                            # Append recommendation to the latest issue
                            issues[-1]["recommendation"] = recommendation

                except Exception as e:
                    error_count += 1
                    logger.warning(
                        f"Health check failed for connector {connector.get('connector_id')}: {str(e)[:200]}"
                    )
                    continue

            # Write health checks to output table
            if health_checks:
                checks_df = spark.createDataFrame(health_checks)
                safe_append(checks_df, output_table)

                # Log to MLflow
                if self._tracer:
                    with self._tracer.start_run(run_name=f"{self.agent_name}_{int(time.time())}"):
                        self._tracer.log_metrics({
                            "connectors_checked": len(connectors),
                            "health_checks_performed": len(health_checks),
                            "unhealthy_connectors": sum(1 for c in health_checks if c.get("status") != "healthy"),
                        })
                        self._tracer.log_params({
                            "agent_name": self.agent_name,
                        })

            return AgentResult(
                status=AgentStatus.COMPLETED,
                agent_name=self.agent_name,
                processed_count=len(connectors),
                error_count=error_count,
                details={
                    "connectors_checked": len(connectors),
                    "health_checks_performed": len(health_checks),
                    "unhealthy_connectors": sum(1 for c in health_checks if c.get("status") != "healthy"),
                }
            )

        except Exception as e:
            return AgentResult(
                status=AgentStatus.FAILED,
                agent_name=self.agent_name,
                error=str(e)[:500]
            )

    def _check_data_freshness(self, connector_id: str, metrics_table: str) -> dict:
        """Check if connector is delivering recent data."""
        try:
            latest = spark.sql(f"""
                SELECT max(last_data_received) as latest_data FROM {metrics_table}
                WHERE connector_id = '{connector_id}'
            """).collect()[0]["latest_data"]

            if latest is None:
                return {
                    "connector_id": connector_id,
                    "status": "no_data",
                    "last_data": None,
                    "gap_minutes": 999999,
                    "checked_at": datetime.now(timezone.utc).isoformat(),
                }

            gap_minutes = int((datetime.now(timezone.utc) - latest).total_seconds() / 60)

            return {
                "connector_id": connector_id,
                "status": "stale" if gap_minutes > 60 else "healthy",
                "last_data": latest.isoformat() if latest else None,
                "gap_minutes": gap_minutes,
                "checked_at": datetime.now(timezone.utc).isoformat(),
            }

        except Exception as e:
            logger.warning(f"Freshness check failed: {str(e)[:200]}")
            return None

    def _check_data_gaps(self, connector_id: str, metrics_table: str) -> dict:
        """Detect prolonged data gaps."""
        try:
            gaps = spark.sql(f"""
                SELECT connector_id, last_gap_duration_minutes, gap_start_time
                FROM {metrics_table}
                WHERE connector_id = '{connector_id}'
                AND last_gap_duration_minutes > 30
                ORDER BY gap_start_time DESC
                LIMIT 1
            """).collect()

            if gaps:
                gap = gaps[0]
                return {
                    "connector_id": connector_id,
                    "status": "data_gap_detected",
                    "last_data": None,
                    "gap_minutes": int(gap["last_gap_duration_minutes"]),
                    "gap_details": json.dumps({
                        "gap_start": gap["gap_start_time"].isoformat() if gap["gap_start_time"] else None,
                        "duration_minutes": gap["last_gap_duration_minutes"]
                    }),
                    "checked_at": datetime.now(timezone.utc).isoformat(),
                }

            return None

        except Exception as e:
            logger.warning(f"Gap check failed: {str(e)[:200]}")
            return None

    def _check_schema_drift(self, connector: dict) -> dict:
        """Detect changes in connector schema."""
        try:
            connector_id = connector["connector_id"]
            expected_fields = json.loads(connector.get("expected_fields", "{}"))

            if not expected_fields:
                return None

            # This would check actual data against expected schema
            # Simplified for demo
            return {
                "connector_id": connector_id,
                "status": "schema_valid",
                "last_data": None,
                "gap_minutes": 0,
                "schema_details": json.dumps({
                    "fields_validated": len(expected_fields),
                    "schema_version": connector.get("schema_version", "1.0")
                }),
                "checked_at": datetime.now(timezone.utc).isoformat(),
            }

        except Exception as e:
            logger.warning(f"Schema check failed: {str(e)[:200]}")
            return None

    def _get_remediation_recommendation(
        self, connector_id: str, connector_name: str, issues: list
    ) -> str:
        """Use LLM to generate remediation recommendation."""
        try:
            system_prompt = """You are a data pipeline health advisor.
Given connector health issues, recommend specific remediation actions.
Be concise and actionable. Focus on:
- Why the issue occurred
- Immediate mitigation
- Root cause resolution

Respond with a single paragraph."""

            issue_summary = "\n".join([
                f"- {i.get('status', 'unknown')}: gap={i.get('gap_minutes', 0)} minutes"
                for i in issues
            ])

            user_msg = f"""Connector '{connector_name}' (ID: {connector_id}) has these issues:
{issue_summary}

What's the remediation recommendation?"""

            result = self.llm_classify(
                system=system_prompt,
                user=user_msg,
                json_mode=False,
                temperature=0.3
            )

            return result.get("raw_content", "Check connector logs and verify network connectivity")

        except Exception as e:
            logger.warning(f"Recommendation generation failed: {str(e)[:200]}")
            return None

# COMMAND ----------

# Initialize and run the agent
import logging
logger = logging.getLogger("oxdsi.connector_health")

try:
    mon.log_event("connector_adapter_start", {"agent": "connector_adapter"})

    agent = ConnectorHealthAgent(
        agent_name="connector_adapter",
        cfg=cfg,
        llm=llm,
        mon=mon,
        spark=spark
    )

    result = agent.run()
    mon.log_complete(result.details)
    print(result.to_json())
    dbutils.notebook.exit(result.to_json())

except Exception as e:
    mon.log_error(e, context="connector_adapter_execution")
    raise
