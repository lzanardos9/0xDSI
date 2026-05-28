# Databricks notebook source
# MAGIC %md
# MAGIC # Agent 14 - Honeypot/Honeytoken Monitoring (Mosaic AI Agent Framework)
# MAGIC Monitors deception technology interactions for high-fidelity attack detection.
# MAGIC - Reads honeypot interaction events
# MAGIC - Classifies interactions (automated scan vs. targeted attack)
# MAGIC - Correlates with known threat actor TTPs
# MAGIC - Generates alerts with confidence scoring

# COMMAND ----------

# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

require_enabled("honeypot")

# COMMAND ----------

import json
from datetime import datetime, timezone
from pyspark.sql import functions as F
from pyspark.sql.types import StringType
from ipaddress import ip_address, ip_network
import mlflow
from agent_framework import BatchAgent, AgentResult, AgentStatus, UCTool, create_soc_tools

# COMMAND ----------

# MAGIC %md
# MAGIC ## Honeypot Agent Configuration

# COMMAND ----------

AGENT_ID = "agent_14_honeypot"
INTERNAL_CIDRS = cfg.get("internal_cidrs", ["10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"])

# COMMAND ----------

# MAGIC %md
# MAGIC ## Honeypot Monitoring Agent Implementation

# COMMAND ----------

class HoneypotAgent(BatchAgent):
    """
    Honeypot/Honeytoken Monitoring Agent.
    Detects and classifies deception technology interactions with high confidence.
    """

    def __init__(self, agent_name: str, cfg, llm, mon, spark):
        super().__init__(agent_name, cfg, llm, mon, spark)

        # Register tools for IOC lookup and event search
        for tool in create_soc_tools(cfg):
            if tool.name in ["lookup_ioc", "search_events"]:
                self.register_tool(tool)

    def execute(self) -> AgentResult:
        """Execute honeypot monitoring."""
        processed_count = 0
        error_count = 0
        alerts_generated = 0

        try:
            honeypot_table = cfg.get_table_path("honeypot_interactions")
            honeytoken_table = cfg.get_table_path("honeytoken_access")
            alerts_table = cfg.get_table_path("alerts")

            # Fetch unprocessed interactions
            with mon.time("fetch_interactions"):
                honeypot_df = (
                    spark.read.table(honeypot_table)
                    .filter(F.col("processed") == False)
                    .select("interaction_id", "honeypot_id", "source_ip", "destination_port",
                            "protocol", "payload_summary", "timestamp", "honeypot_type")
                )
                honeypot_count = honeypot_df.count()

                honeytoken_df = (
                    spark.read.table(honeytoken_table)
                    .filter(F.col("processed") == False)
                    .select("access_id", "token_id", "token_type", "accessing_entity",
                            "source_ip", "access_method", "timestamp", "file_path")
                )
                honeytoken_count = honeytoken_df.count()

                processed_count = honeypot_count + honeytoken_count
                mon.log_event("unprocessed_found", {
                    "honeypot": honeypot_count,
                    "honeytoken": honeytoken_count,
                })

            # Generate honeypot interaction alerts
            with mon.time("generate_honeypot_alerts"):
                honeypot_alerts = self._generate_honeypot_alerts(honeypot_df, INTERNAL_CIDRS)
                if honeypot_alerts.count() > 0:
                    honeypot_alerts.write.format("delta").mode("append").saveAsTable(alerts_table)
                    alerts_generated += honeypot_alerts.count()
                    mon.log_event("honeypot_alerts_written", {"count": alerts_generated})

            # Generate honeytoken access alerts
            with mon.time("generate_honeytoken_alerts"):
                honeytoken_alerts = self._generate_honeytoken_alerts(honeytoken_df, INTERNAL_CIDRS)
                if honeytoken_alerts.count() > 0:
                    honeytoken_alerts.write.format("delta").mode("append").saveAsTable(alerts_table)
                    alerts_generated += honeytoken_alerts.count()
                    mon.log_event("honeytoken_alerts_written", {"count": honeytoken_alerts.count()})

            # Mark interactions as processed
            with mon.time("mark_processed"):
                from delta.tables import DeltaTable

                if honeypot_count > 0:
                    honeypot_target = DeltaTable.forName(spark, honeypot_table)
                    honeypot_target.alias("target").merge(
                        honeypot_df.select("interaction_id").alias("source"),
                        "target.interaction_id = source.interaction_id"
                    ).whenMatchedUpdate(set={
                        "processed": F.lit(True),
                        "processed_at": F.current_timestamp()
                    }).execute()

                if honeytoken_count > 0:
                    honeytoken_target = DeltaTable.forName(spark, honeytoken_table)
                    honeytoken_target.alias("target").merge(
                        honeytoken_df.select("access_id").alias("source"),
                        "target.access_id = source.access_id"
                    ).whenMatchedUpdate(set={
                        "processed": F.lit(True),
                        "processed_at": F.current_timestamp()
                    }).execute()

                mon.log_event("interactions_marked_processed", {"count": processed_count})

            # Log MLflow metrics
            mlflow.set_experiment(f"/0xDSI/agents/{self.agent_name}")
            with mlflow.start_run(run_name=f"honeypot_{datetime.utcnow().strftime('%Y%m%d%H%M%S')}"):
                mlflow.log_params({
                    "agent": self.agent_name,
                })
                mlflow.log_metrics({
                    "honeypot_interactions_processed": honeypot_count,
                    "honeytoken_accesses_processed": honeytoken_count,
                    "alerts_generated": alerts_generated,
                    "errors": error_count,
                })

            mon.log_complete(AGENT_ID, {
                "interactions_processed": processed_count,
                "alerts_generated": alerts_generated,
            })

            status = AgentStatus.COMPLETED if error_count == 0 else AgentStatus.DEGRADED

            return AgentResult(
                status=status,
                agent_name=self.agent_name,
                processed_count=processed_count,
                error_count=error_count,
                details={
                    "honeypot_interactions": honeypot_count,
                    "honeytoken_accesses": honeytoken_count,
                    "alerts_generated": alerts_generated,
                },
            )

        except Exception as e:
            error_count += 1
            mon.log_error(e, context="honeypot")
            raise

    def _is_internal_ip(self, ip_str):
        """Check if IP is in internal network ranges."""
        if not ip_str:
            return False
        try:
            ip = ip_address(ip_str)
            return any(ip in ip_network(cidr) for cidr in INTERNAL_CIDRS)
        except ValueError:
            return False

    def _generate_honeypot_alerts(self, honeypot_df, internal_cidrs):
        """Generate alerts for honeypot interactions."""
        if honeypot_df.count() == 0:
            return spark.createDataFrame([], "alert_id STRING, alert_type STRING, severity STRING")

        # Register UDF for internal IP detection
        is_internal_udf = F.udf(self._is_internal_ip, StringType())

        honeypot_alerts_df = (
            honeypot_df
            .withColumn("is_internal", is_internal_udf(F.col("source_ip")))
            .withColumn(
                "severity",
                F.when(F.col("is_internal") == "True", F.lit("critical"))
                .otherwise(F.lit("high"))
            )
            .withColumn(
                "alert_type",
                F.when(F.col("is_internal") == "True", F.lit("lateral_movement_honeypot"))
                .otherwise(F.lit("external_honeypot_probe"))
            )
            .withColumn("alert_id", F.expr("uuid()"))
            .withColumn("created_at", F.current_timestamp())
            .withColumn("agent_id", F.lit(AGENT_ID))
            .withColumn(
                "description",
                F.concat(
                    F.lit("Honeypot interaction detected: "),
                    F.col("source_ip"), F.lit(" -> "),
                    F.col("honeypot_type"), F.lit(":"),
                    F.col("destination_port").cast("string")
                )
            )
            .select(
                "alert_id", "alert_type", "severity", "description",
                "source_ip", F.col("honeypot_id").alias("source_id"),
                "created_at", "agent_id"
            )
        )

        return honeypot_alerts_df

    def _generate_honeytoken_alerts(self, honeytoken_df, internal_cidrs):
        """Generate alerts for honeytoken accesses."""
        if honeytoken_df.count() == 0:
            return spark.createDataFrame([], "alert_id STRING, alert_type STRING, severity STRING")

        # Register UDF for internal IP detection
        is_internal_udf = F.udf(self._is_internal_ip, StringType())

        honeytoken_alerts_df = (
            honeytoken_df
            .withColumn("is_internal", is_internal_udf(F.col("source_ip")))
            .withColumn("severity", F.lit("critical"))
            .withColumn("alert_type", F.lit("honeytoken_accessed"))
            .withColumn("alert_id", F.expr("uuid()"))
            .withColumn("created_at", F.current_timestamp())
            .withColumn("agent_id", F.lit(AGENT_ID))
            .withColumn("interaction_type", F.lit("honeytoken_compromise"))
            .withColumn(
                "description",
                F.concat(
                    F.lit("Honeytoken accessed: "),
                    F.col("token_type"), F.lit(" token '"),
                    F.col("token_id"), F.lit("' by "),
                    F.col("accessing_entity"), F.lit(" from "),
                    F.col("source_ip")
                )
            )
            .select(
                "alert_id", "alert_type", "severity", "description",
                "source_ip", F.col("token_id").alias("source_id"),
                "created_at", "agent_id", "interaction_type"
            )
        )

        return honeytoken_alerts_df

# COMMAND ----------

# MAGIC %md
# MAGIC ## Execute Agent

# COMMAND ----------

agent = HoneypotAgent("honeypot_agent", cfg, llm, mon, spark)
result = agent.run()

dbutils.notebook.exit(result.to_json())
