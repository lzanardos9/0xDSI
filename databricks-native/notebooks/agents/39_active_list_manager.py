# Databricks notebook source
# MAGIC %md
# MAGIC # Agent 39: Active List Manager
# MAGIC
# MAGIC **Production-Grade BatchAgent Implementation**
# MAGIC
# MAGIC Manages dynamic active lists with automatic lifecycle management:
# MAGIC - Watchlists, whitelists, and blocklists
# MAGIC - Auto-expires entries based on TTL
# MAGIC - Promotes/demotes entities based on behavioral signals
# MAGIC - Writes to `active_list_changes` with action audit trail
# MAGIC
# MAGIC ## Key Features
# MAGIC - MLflow experiment tracking and metrics logging
# MAGIC - TTL-based expiration with configurable retention
# MAGIC - Signal-driven promotion/demotion logic
# MAGIC - Change tracking with full audit trail
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
from datetime import datetime, timedelta

logger = logging.getLogger("oxdsi.active_list_manager")

# Parse notebook parameters
dbutils.widgets.text("promotion_threshold", "0.8", "Confidence threshold for promotion")
dbutils.widgets.text("demotion_threshold", "0.3", "Confidence threshold for demotion")
dbutils.widgets.text("default_ttl_days", "90", "Default TTL for list entries")
dbutils.widgets.text("watchlist_ttl_days", "30", "TTL for watchlist entries")

promotion_threshold = float(dbutils.widgets.get("promotion_threshold"))
demotion_threshold = float(dbutils.widgets.get("demotion_threshold"))
default_ttl_days = int(dbutils.widgets.get("default_ttl_days"))
watchlist_ttl_days = int(dbutils.widgets.get("watchlist_ttl_days"))

mon.log_event("active_list_config_loaded", {
    "promotion_threshold": promotion_threshold,
    "demotion_threshold": demotion_threshold,
    "default_ttl_days": default_ttl_days,
    "watchlist_ttl_days": watchlist_ttl_days,
})

# COMMAND ----------

# MAGIC %md
# MAGIC ## Define ActiveListManager Class

# COMMAND ----------

class ActiveListManager(BatchAgent):
    """
    Manages dynamic active lists with TTL and behavior-driven changes.

    Responsibilities:
    1. Process list entries and check TTL expiration
    2. Apply promotion/demotion based on behavioral signals
    3. Track all changes in audit table
    4. Update list membership with reason and TTL
    """

    LIST_TYPES = {
        "whitelist": {"ttl_days": default_ttl_days, "risk_threshold": 0.2},
        "watchlist": {"ttl_days": watchlist_ttl_days, "risk_threshold": 0.5},
        "blocklist": {"ttl_days": default_ttl_days, "risk_threshold": 0.9},
    }

    def __init__(self, agent_name: str, cfg, llm, mon, spark):
        super().__init__(agent_name, cfg, llm, mon, spark)
        self._entries_processed = 0
        self._entries_promoted = 0
        self._entries_demoted = 0
        self._entries_expired = 0

        # Register UC tools
        soc_tools = create_soc_tools(cfg)
        for tool in soc_tools:
            if tool.name in ["query_user_behavior"]:
                self.register_tool(tool)

    def execute(self) -> AgentResult:
        """Main execution: fetch list entries → check TTL → apply signals → persist."""
        start_time = time.time()

        try:
            # Ensure output tables exist
            self._ensure_tables()

            # Initialize MLflow run
            with mlflow.start_run(run_name=f"{self.agent_name}_{int(time.time())}"):
                mlflow.set_experiment(f"/0xDSI/agents/{self.agent_name}")

                # Fetch active list entries
                entries = self._fetch_active_entries()
                self._entries_processed = len(entries)

                if self._entries_processed == 0:
                    return AgentResult(
                        status=AgentStatus.IDLE,
                        agent_name=self.agent_name,
                        processed_count=0,
                        duration_seconds=time.time() - start_time,
                    )

                # Process entries for expiration and promotion/demotion
                changes = self._process_entries(entries)

                # Persist changes
                if changes:
                    self._persist_changes(changes)

                # Log metrics
                self._log_metrics()

            duration = time.time() - start_time
            return AgentResult(
                status=AgentStatus.COMPLETED,
                agent_name=self.agent_name,
                processed_count=self._entries_processed,
                error_count=0,
                duration_seconds=duration,
                details={
                    "entries_processed": self._entries_processed,
                    "promoted": self._entries_promoted,
                    "demoted": self._entries_demoted,
                    "expired": self._entries_expired,
                    "total_changes": (self._entries_promoted +
                                     self._entries_demoted +
                                     self._entries_expired),
                },
            )

        except Exception as e:
            logger.exception(f"Active list manager failed: {e}")
            return AgentResult(
                status=AgentStatus.FAILED,
                agent_name=self.agent_name,
                error=str(e)[:500],
                duration_seconds=time.time() - start_time,
            )

    def _ensure_tables(self):
        """Create or validate active list tables."""
        active_list_table = get_table_path(cfg, "active_lists")
        changes_table = get_table_path(cfg, "active_list_changes")

        spark.sql(f"""
            CREATE TABLE IF NOT EXISTS {active_list_table} (
                entity_id STRING NOT NULL,
                list_name STRING NOT NULL,
                entity_value STRING,
                reason STRING,
                confidence DOUBLE,
                ttl_remaining INT,
                expires_at TIMESTAMP,
                last_activity TIMESTAMP
            )
            USING DELTA
        """)

        spark.sql(f"""
            CREATE TABLE IF NOT EXISTS {changes_table} (
                change_id STRING NOT NULL,
                list_name STRING NOT NULL,
                entity STRING NOT NULL,
                action STRING NOT NULL,
                reason STRING,
                ttl_remaining INT,
                confidence DOUBLE,
                agent_name STRING,
                changed_at TIMESTAMP NOT NULL
            )
            USING DELTA
            PARTITIONED BY (date(changed_at))
        """)

    def _fetch_active_entries(self) -> list:
        """Fetch active list entries."""
        span = self._start_trace("fetch_entries")
        try:
            active_list_table = get_table_path(cfg, "active_lists")

            query = f"""
                SELECT *
                FROM {active_list_table}
                WHERE expires_at > current_timestamp()
            """

            entries_df = spark.sql(query)
            entries = entries_df.collect()

            self._end_trace(span, {
                "entry_count": len(entries),
                "status": "success"
            })
            return entries

        except Exception as e:
            self._end_trace(span, {"error": str(e)[:200], "status": "failed"})
            logger.error(f"Failed to fetch entries: {e}")
            return []

    def _process_entries(self, entries: list) -> list:
        """Process entries for expiration and promotion/demotion."""
        changes = []
        span = self._start_trace("process_entries")

        try:
            for entry in entries:
                current_time = datetime.utcnow()

                # Check expiration
                if entry.expires_at <= current_time:
                    changes.append({
                        "list_name": entry.list_name,
                        "entity": entry.entity_value,
                        "action": "remove",
                        "reason": "TTL expired",
                        "ttl_remaining": 0,
                    })
                    self._entries_expired += 1
                    continue

                # Apply behavioral signals for promotion/demotion
                signal_score = self._calculate_signal_score(entry)

                if signal_score >= promotion_threshold and entry.list_name == "watchlist":
                    changes.append({
                        "list_name": "blocklist",
                        "entity": entry.entity_value,
                        "action": "promote",
                        "reason": f"Signal score {signal_score:.2f}",
                        "ttl_remaining": self.LIST_TYPES["blocklist"]["ttl_days"] * 86400,
                        "confidence": signal_score,
                    })
                    self._entries_promoted += 1

                elif signal_score <= demotion_threshold and entry.list_name == "blocklist":
                    changes.append({
                        "list_name": "watchlist",
                        "entity": entry.entity_value,
                        "action": "demote",
                        "reason": f"Signal score {signal_score:.2f}",
                        "ttl_remaining": self.LIST_TYPES["watchlist"]["ttl_days"] * 86400,
                        "confidence": signal_score,
                    })
                    self._entries_demoted += 1

            self._end_trace(span, {
                "changes_generated": len(changes),
                "status": "success"
            })

        except Exception as e:
            self._end_trace(span, {"error": str(e)[:200], "status": "failed"})
            logger.error(f"Entry processing failed: {e}")

        return changes

    def _calculate_signal_score(self, entry) -> float:
        """Calculate behavioral signal score."""
        score = 0.5

        if entry.last_activity:
            days_since = (
                datetime.utcnow() - entry.last_activity
            ).total_seconds() / 86400

            if days_since < 1:
                score += 0.2
            elif days_since > 30:
                score -= 0.2

        if entry.confidence:
            score = (score + entry.confidence) / 2

        return min(1.0, max(0.0, score))

    def _persist_changes(self, changes: list):
        """Write list changes to Delta table."""
        if not changes:
            return

        span = self._start_trace("persist_changes")
        try:
            changes_table = get_table_path(cfg, "active_list_changes")

            schema = StructType([
                StructField("list_name", StringType()),
                StructField("entity", StringType()),
                StructField("action", StringType()),
                StructField("reason", StringType()),
                StructField("ttl_remaining", IntegerType()),
                StructField("confidence", DoubleType()),
            ])

            changes_df = (
                spark.createDataFrame(changes, schema=schema)
                .withColumn("change_id", expr("uuid()"))
                .withColumn("agent_name", lit(self.agent_name))
                .withColumn("changed_at", current_timestamp())
            )

            safe_append(changes_df, changes_table)

            self._end_trace(span, {
                "status": "success",
                "changes_written": len(changes)
            })

        except Exception as e:
            self._end_trace(span, {"error": str(e)[:200], "status": "failed"})
            raise

    def _log_metrics(self):
        """Log metrics to MLflow."""
        try:
            mlflow.log_metrics({
                "entries_processed": self._entries_processed,
                "entries_promoted": self._entries_promoted,
                "entries_demoted": self._entries_demoted,
                "entries_expired": self._entries_expired,
            })
            mlflow.log_params({
                "promotion_threshold": promotion_threshold,
                "demotion_threshold": demotion_threshold,
            })
        except Exception as e:
            logger.warning(f"MLflow metrics logging failed: {e}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Execute Active List Manager

# COMMAND ----------

try:
    agent = ActiveListManager("active_list_manager", cfg, llm, mon, spark)
    result = agent.run()

    mon.log_event("active_list_result", {
        "status": result.status.value,
        "processed": result.processed_count,
        "changes": result.details.get("total_changes", 0),
        "duration_seconds": result.duration_seconds,
    })

    print(json.dumps({
        "status": result.status.value,
        "trace_id": result.trace_id,
        "entries_processed": result.processed_count,
        "changes": result.details.get("total_changes", 0),
        "duration_seconds": round(result.duration_seconds, 3),
        "details": result.details,
    }))

    dbutils.notebook.exit(result.to_json())

except Exception as e:
    logger.exception(f"Active list manager fatal error: {e}")
    mon.log_error(e, "active_list_manager_execution")

    error_result = AgentResult(
        status=AgentStatus.FAILED,
        agent_name="active_list_manager",
        error=str(e)[:500],
    )

    dbutils.notebook.exit(error_result.to_json())
