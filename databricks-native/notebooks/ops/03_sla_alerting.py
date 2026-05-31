# Databricks notebook source
# MAGIC %md
# MAGIC # Ops 03: SLA Breach Detection and Alerting
# MAGIC
# MAGIC Monitors alert response times against defined SLAs and generates escalations:
# MAGIC
# MAGIC - **Critical**: acknowledge within 15 min, resolve within 4 hours
# MAGIC - **High**: acknowledge within 1 hour, resolve within 8 hours
# MAGIC - **Medium**: acknowledge within 4 hours, resolve within 24 hours
# MAGIC
# MAGIC Detects breaches, creates deduplicated escalation entries, flags affected alerts,
# MAGIC and reports SLA compliance percentages per severity level.

# COMMAND ----------

# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

require_tables("alerts", "sla_breaches")

import json
from pyspark.sql.functions import (
    col, lit, current_timestamp, expr, when, coalesce, count, sum as spark_sum,
    round as spark_round
)
from pyspark.sql.types import StructType, StructField, StringType, IntegerType, TimestampType

# COMMAND ----------

# MAGIC %md
# MAGIC ## SLA Threshold Constants

# COMMAND ----------

# SLA definitions: (ack_minutes, resolve_minutes)
SLA_THRESHOLDS = {
    "critical": {"ack_minutes": 15, "resolve_minutes": 240},       # 15 min / 4 hours
    "high":     {"ack_minutes": 60, "resolve_minutes": 480},       # 1 hour / 8 hours
    "medium":   {"ack_minutes": 240, "resolve_minutes": 1440},     # 4 hours / 24 hours
}

MONITORED_SEVERITIES = list(SLA_THRESHOLDS.keys())

mon.log_info("SLA alerting started with thresholds: " + json.dumps(SLA_THRESHOLDS))

# COMMAND ----------

# MAGIC %md
# MAGIC ## Main Execution

# COMMAND ----------

try:
    # ---- Table references ----
    ALERTS_TABLE = cfg.get_table_path("alerts")
    SLA_BREACHES_TABLE = cfg.get_table_path("sla_breaches")

    # ---- Detect SLA breaches ----
    with mon.time("detect_breaches"):
        # Build CASE expressions for SLA thresholds based on severity
        breach_query = f"""
            SELECT
                a.id AS alert_id,
                a.severity,
                a.status,
                a.created_at,
                a.acknowledged_at,
                a.resolved_at,
                CASE
                    WHEN a.severity = 'critical' THEN {SLA_THRESHOLDS['critical']['ack_minutes']}
                    WHEN a.severity = 'high' THEN {SLA_THRESHOLDS['high']['ack_minutes']}
                    WHEN a.severity = 'medium' THEN {SLA_THRESHOLDS['medium']['ack_minutes']}
                END AS sla_ack_minutes,
                CASE
                    WHEN a.severity = 'critical' THEN {SLA_THRESHOLDS['critical']['resolve_minutes']}
                    WHEN a.severity = 'high' THEN {SLA_THRESHOLDS['high']['resolve_minutes']}
                    WHEN a.severity = 'medium' THEN {SLA_THRESHOLDS['medium']['resolve_minutes']}
                END AS sla_resolve_minutes,
                -- Check acknowledgement breach
                CASE
                    WHEN a.acknowledged_at IS NULL
                        AND timestampdiff(MINUTE, a.created_at, current_timestamp()) >
                            CASE
                                WHEN a.severity = 'critical' THEN {SLA_THRESHOLDS['critical']['ack_minutes']}
                                WHEN a.severity = 'high' THEN {SLA_THRESHOLDS['high']['ack_minutes']}
                                WHEN a.severity = 'medium' THEN {SLA_THRESHOLDS['medium']['ack_minutes']}
                            END
                        THEN true
                    ELSE false
                END AS ack_breached,
                -- Check resolution breach
                CASE
                    WHEN a.resolved_at IS NULL
                        AND timestampdiff(MINUTE, a.created_at, current_timestamp()) >
                            CASE
                                WHEN a.severity = 'critical' THEN {SLA_THRESHOLDS['critical']['resolve_minutes']}
                                WHEN a.severity = 'high' THEN {SLA_THRESHOLDS['high']['resolve_minutes']}
                                WHEN a.severity = 'medium' THEN {SLA_THRESHOLDS['medium']['resolve_minutes']}
                            END
                        THEN true
                    ELSE false
                END AS resolve_breached
            FROM {ALERTS_TABLE} a
            WHERE a.severity IN ('critical', 'high', 'medium')
              AND a.status NOT IN ('closed', 'false_positive')
              AND (a.sla_breached IS NULL OR a.sla_breached = false)
        """

        all_alerts_df = spark.sql(breach_query)

        # Filter to only actual breaches
        breached_df = all_alerts_df.filter(
            (col("ack_breached") == True) | (col("resolve_breached") == True)
        )

        breach_count = breached_df.count()
        mon.log_metric("breaches_detected", breach_count)
        print(f"Detected {breach_count} SLA breaches")

    if breach_count == 0:
        # Still compute compliance even when no new breaches
        with mon.time("compute_compliance_no_breach"):
            compliance_results = {}
            for severity in MONITORED_SEVERITIES:
                total = spark.sql(f"""
                    SELECT count(*) AS cnt FROM {ALERTS_TABLE}
                    WHERE severity = '{severity}'
                      AND created_at > current_timestamp() - INTERVAL 24 HOURS
                """).first().cnt
                breached_total = spark.sql(f"""
                    SELECT count(*) AS cnt FROM {ALERTS_TABLE}
                    WHERE severity = '{severity}'
                      AND sla_breached = true
                      AND created_at > current_timestamp() - INTERVAL 24 HOURS
                """).first().cnt
                compliance_pct = ((total - breached_total) / total * 100) if total > 0 else 100.0
                compliance_results[severity] = round(compliance_pct, 1)
                mon.log_metric(f"sla_compliance_{severity}_pct", compliance_results[severity])

        mon.log_complete(rows_processed=0)
        result = {
            "status": "success",
            "breaches_detected": 0,
            "escalations_created": 0,
            "compliance_pct": compliance_results,
        }
        dbutils.notebook.exit(json.dumps(result))

    # ---- Create breach detail records ----
    with mon.time("prepare_breach_records"):
        breach_records_df = breached_df.select(
            col("alert_id"),
            col("severity"),
            when(col("ack_breached") & col("resolve_breached"), lit("ack_and_resolve"))
            .when(col("ack_breached"), lit("acknowledgement"))
            .otherwise(lit("resolution"))
            .alias("breach_type"),
            col("sla_ack_minutes"),
            col("sla_resolve_minutes"),
            col("created_at").alias("alert_created_at"),
        ).withColumn("id", expr("uuid()")) \
         .withColumn("detected_at", current_timestamp()) \
         .withColumn("escalation_status", lit("new"))

    # ---- MERGE to avoid duplicate breach records ----
    with mon.time("merge_breach_records"):
        breach_records_df.createOrReplaceTempView("_new_sla_breaches")

        spark.sql(f"""
            MERGE INTO {SLA_BREACHES_TABLE} AS target
            USING _new_sla_breaches AS source
            ON target.alert_id = source.alert_id
               AND target.breach_type = source.breach_type
            WHEN NOT MATCHED THEN INSERT (
                id, alert_id, severity, breach_type,
                sla_ack_minutes, sla_resolve_minutes,
                alert_created_at, detected_at, escalation_status
            ) VALUES (
                source.id, source.alert_id, source.severity, source.breach_type,
                source.sla_ack_minutes, source.sla_resolve_minutes,
                source.alert_created_at, source.detected_at, source.escalation_status
            )
        """)

        spark.sql("DROP VIEW IF EXISTS _new_sla_breaches")
        mon.log_metric("escalations_merged", breach_count)

    # ---- Update alerts with sla_breached flag ----
    with mon.time("flag_breached_alerts"):
        breached_ids_df = breached_df.select(col("alert_id").alias("id"))
        breached_ids_df.createOrReplaceTempView("_breached_alert_ids")

        spark.sql(f"""
            MERGE INTO {ALERTS_TABLE} AS target
            USING _breached_alert_ids AS source
            ON target.id = source.id
            WHEN MATCHED THEN UPDATE SET
                target.sla_breached = true
        """)

        spark.sql("DROP VIEW IF EXISTS _breached_alert_ids")

    # ---- Generate summary by severity ----
    with mon.time("compute_summary"):
        # Breaches by severity
        breach_summary = (
            breached_df
            .groupBy("severity")
            .agg(
                count("*").alias("breach_count"),
                spark_sum(when(col("ack_breached"), 1).otherwise(0)).alias("ack_breaches"),
                spark_sum(when(col("resolve_breached"), 1).otherwise(0)).alias("resolve_breaches"),
            )
            .collect()
        )

        summary_by_severity = {}
        for row in breach_summary:
            summary_by_severity[row.severity] = {
                "total_breaches": row.breach_count,
                "ack_breaches": row.ack_breaches,
                "resolve_breaches": row.resolve_breaches,
            }
            print(f"  {row.severity}: {row.breach_count} breaches "
                  f"(ack={row.ack_breaches}, resolve={row.resolve_breaches})")

        # SLA compliance percentage per severity (last 24 hours)
        compliance_results = {}
        for severity in MONITORED_SEVERITIES:
            total = spark.sql(f"""
                SELECT count(*) AS cnt FROM {ALERTS_TABLE}
                WHERE severity = '{severity}'
                  AND created_at > current_timestamp() - INTERVAL 24 HOURS
            """).first().cnt
            breached_total = spark.sql(f"""
                SELECT count(*) AS cnt FROM {ALERTS_TABLE}
                WHERE severity = '{severity}'
                  AND sla_breached = true
                  AND created_at > current_timestamp() - INTERVAL 24 HOURS
            """).first().cnt
            compliance_pct = ((total - breached_total) / total * 100) if total > 0 else 100.0
            compliance_results[severity] = round(compliance_pct, 1)
            mon.log_metric(f"sla_compliance_{severity}_pct", compliance_results[severity])

        print(f"\nSLA Compliance (24h): {json.dumps(compliance_results)}")

    # ---- Complete ----
    mon.log_complete(rows_processed=breach_count)

    result = {
        "status": "success",
        "breaches_detected": breach_count,
        "escalations_created": breach_count,
        "summary_by_severity": summary_by_severity,
        "compliance_pct": compliance_results,
    }

except Exception as e:
    mon.log_error(e, context="sla_alerting")
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
