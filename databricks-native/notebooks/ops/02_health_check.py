# Databricks notebook source
# MAGIC %md
# MAGIC # Ops 02: Inter-Notebook Health Check with Circuit Breaker
# MAGIC
# MAGIC Monitors agent health via the `agent_status` table and implements circuit-breaker logic:
# MAGIC
# MAGIC - Checks each agent's `last_heartbeat` against a staleness threshold
# MAGIC - Increments `consecutive_failures` for stale agents
# MAGIC - Opens the circuit (stops agent) when failures exceed threshold
# MAGIC - Resets counter and closes circuit when agent recovers
# MAGIC - Generates alerts for circuit-open agents
# MAGIC - Reports overall system health: healthy / degraded / critical

# COMMAND ----------

# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

import json
from datetime import datetime, timezone
from pyspark.sql.functions import (
    col, lit, current_timestamp, expr, when, coalesce, count
)
from pyspark.sql.types import StructType, StructField, StringType, IntegerType, TimestampType

# COMMAND ----------

# MAGIC %md
# MAGIC ## Configuration

# COMMAND ----------

dbutils.widgets.text("staleness_minutes", "30", "Heartbeat staleness threshold (minutes)")
dbutils.widgets.text("circuit_breaker_threshold", "3", "Consecutive failures to open circuit")

staleness_minutes = int(dbutils.widgets.get("staleness_minutes"))
circuit_breaker_threshold = int(dbutils.widgets.get("circuit_breaker_threshold"))

require_tables("agent_status", "health_alerts")

mon.log_info(
    f"Health check started: staleness={staleness_minutes}m, "
    f"circuit_breaker_threshold={circuit_breaker_threshold}"
)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Main Execution

# COMMAND ----------

try:
    # ---- Table references ----
    AGENT_STATUS_TABLE = cfg.get_table_path("agent_status")
    HEALTH_ALERTS_TABLE = cfg.get_table_path("health_alerts")

    # ---- Fetch current agent statuses ----
    with mon.time("fetch_agent_status"):
        agents_df = spark.sql(f"""
            SELECT
                agent_id,
                agent_name,
                last_heartbeat,
                status,
                consecutive_failures,
                circuit_state,
                metadata
            FROM {AGENT_STATUS_TABLE}
        """)
        total_agents = agents_df.count()
        mon.log_metric("total_agents", total_agents)

    if total_agents == 0:
        mon.log_info("No agents registered in agent_status table")
        mon.log_complete(rows_processed=0)
        result = {"status": "success", "total_agents": 0, "health": "unknown"}
        dbutils.notebook.exit(json.dumps(result))

    # ---- Evaluate agent health ----
    with mon.time("evaluate_health"):
        staleness_threshold = f"INTERVAL {staleness_minutes} MINUTES"

        evaluated_df = agents_df.withColumn(
            "is_stale",
            when(
                col("last_heartbeat") < expr(f"current_timestamp() - {staleness_threshold}"),
                lit(True)
            ).otherwise(lit(False))
        ).withColumn(
            "new_consecutive_failures",
            when(col("is_stale"), coalesce(col("consecutive_failures"), lit(0)) + 1)
            .otherwise(lit(0))
        ).withColumn(
            "new_circuit_state",
            when(
                col("is_stale") & (col("new_consecutive_failures") > lit(circuit_breaker_threshold)),
                lit("circuit_open")
            ).when(
                ~col("is_stale") & (col("circuit_state") == lit("circuit_open")),
                lit("circuit_closed")
            ).otherwise(
                when(~col("is_stale"), lit("circuit_closed"))
                .otherwise(coalesce(col("circuit_state"), lit("circuit_closed")))
            )
        ).withColumn(
            "new_status",
            when(col("new_circuit_state") == lit("circuit_open"), lit("stopped"))
            .when(~col("is_stale"), lit("healthy"))
            .otherwise(lit("degraded"))
        )

    # ---- Count by health state ----
    healthy_count = evaluated_df.filter(col("new_status") == "healthy").count()
    degraded_count = evaluated_df.filter(col("new_status") == "degraded").count()
    stopped_count = evaluated_df.filter(col("new_status") == "stopped").count()

    # Determine overall system health
    healthy_pct = (healthy_count / total_agents) * 100 if total_agents > 0 else 0
    if healthy_pct >= 80:
        system_health = "healthy"
    elif healthy_pct >= 50:
        system_health = "degraded"
    else:
        system_health = "critical"

    mon.log_metric("healthy_agents", healthy_count)
    mon.log_metric("degraded_agents", degraded_count)
    mon.log_metric("stopped_agents", stopped_count)
    mon.log_metric("healthy_pct", round(healthy_pct, 1))

    print(f"System health: {system_health} "
          f"(healthy={healthy_count}, degraded={degraded_count}, stopped={stopped_count})")

    # ---- Update agent_status table via MERGE ----
    with mon.time("update_agent_status"):
        update_df = evaluated_df.select(
            col("agent_id"),
            col("new_consecutive_failures").alias("consecutive_failures"),
            col("new_circuit_state").alias("circuit_state"),
            col("new_status").alias("status"),
        )
        update_df.createOrReplaceTempView("_health_check_updates")

        spark.sql(f"""
            MERGE INTO {AGENT_STATUS_TABLE} AS target
            USING _health_check_updates AS source
            ON target.agent_id = source.agent_id
            WHEN MATCHED THEN UPDATE SET
                target.consecutive_failures = source.consecutive_failures,
                target.circuit_state = source.circuit_state,
                target.status = source.status,
                target.last_checked = current_timestamp()
        """)

        spark.sql("DROP VIEW IF EXISTS _health_check_updates")

    # ---- Generate alerts for newly circuit-open agents ----
    with mon.time("generate_alerts"):
        newly_opened = evaluated_df.filter(
            (col("new_circuit_state") == "circuit_open") &
            (coalesce(col("circuit_state"), lit("circuit_closed")) != "circuit_open")
        ).collect()

        alerts_generated = 0
        if newly_opened:
            alert_rows = []
            for agent_row in newly_opened:
                alert_rows.append({
                    "agent_id": agent_row.agent_id,
                    "agent_name": agent_row.agent_name,
                    "alert_type": "circuit_breaker_open",
                    "severity": "high",
                    "message": (
                        f"Circuit breaker OPEN for agent '{agent_row.agent_name}' "
                        f"({agent_row.agent_id}): {agent_row.new_consecutive_failures} "
                        f"consecutive failures (threshold={circuit_breaker_threshold})"
                    ),
                })

            alert_schema = StructType([
                StructField("agent_id", StringType()),
                StructField("agent_name", StringType()),
                StructField("alert_type", StringType()),
                StructField("severity", StringType()),
                StructField("message", StringType()),
            ])

            alerts_df = (
                spark.createDataFrame(alert_rows, schema=alert_schema)
                .withColumn("id", expr("uuid()"))
                .withColumn("status", lit("new"))
                .withColumn("created_at", current_timestamp())
            )
            alerts_df.write.mode("append").saveAsTable(HEALTH_ALERTS_TABLE)
            alerts_generated = len(alert_rows)
            mon.log_metric("alerts_generated", alerts_generated)

            # Write to notification_log for downstream delivery
            NOTIFICATION_TABLE = cfg.get_table_path("notification_log")
            notif_rows = [{
                "channel": "pagerduty",
                "severity": "high",
                "subject": f"Circuit Breaker OPEN: {a['agent_name']}",
                "body": a["message"],
                "source": "ops/02_health_check",
            } for a in alert_rows]
            notif_schema = StructType([
                StructField("channel", StringType()),
                StructField("severity", StringType()),
                StructField("subject", StringType()),
                StructField("body", StringType()),
                StructField("source", StringType()),
            ])
            notif_df = (
                spark.createDataFrame(notif_rows, schema=notif_schema)
                .withColumn("id", expr("uuid()"))
                .withColumn("status", lit("pending"))
                .withColumn("created_at", current_timestamp())
            )
            notif_df.write.mode("append").saveAsTable(NOTIFICATION_TABLE)

            for alert in alert_rows:
                mon.log_warning(alert["message"])

    # ---- Log recovery events ----
    recovered = evaluated_df.filter(
        (col("new_circuit_state") == "circuit_closed") &
        (col("circuit_state") == "circuit_open")
    ).collect()

    for agent_row in recovered:
        mon.log_info(
            f"Circuit CLOSED (recovered): agent '{agent_row.agent_name}' ({agent_row.agent_id})"
        )

    mon.log_metric("recovered_agents", len(recovered))

    # ---- Complete ----
    mon.log_complete(rows_processed=total_agents)

    result = {
        "status": "success",
        "system_health": system_health,
        "total_agents": total_agents,
        "healthy": healthy_count,
        "degraded": degraded_count,
        "stopped": stopped_count,
        "healthy_pct": round(healthy_pct, 1),
        "alerts_generated": alerts_generated,
        "recovered": len(recovered),
        "staleness_minutes": staleness_minutes,
        "circuit_breaker_threshold": circuit_breaker_threshold,
    }

except Exception as e:
    mon.log_error(e, context="health_check")
    result = {
        "status": "error",
        "error": str(e),
        "error_type": type(e).__name__,
    }

# COMMAND ----------

# MAGIC %md
# MAGIC ## Exit

# COMMAND ----------

dbutils.notebook.exit(json.dumps(result))
