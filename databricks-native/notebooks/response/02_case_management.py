# Databricks notebook source
# MAGIC %md
# MAGIC # Agent 16: Automated Case Management
# MAGIC Groups related alerts into cases, tracks lifecycle, assigns analysts.
# MAGIC
# MAGIC **Inputs:** Ungrouped alerts from the last 24 hours
# MAGIC **Outputs:** New cases with grouped alert IDs, updated alert statuses
# MAGIC **Pattern:** Bootstrap + monitoring + MERGE-based updates (no raw f-string SQL)

# COMMAND ----------

# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

import json
from pyspark.sql.functions import (
    col, collect_list, collect_set, concat, count, current_timestamp,
    expr, first, lit, max as spark_max, when, window
)
from pyspark.sql.types import StructType, StructField, StringType

# COMMAND ----------

# Widget for correlation window (catalog/schema handled by bootstrap)
dbutils.widgets.text("correlation_window_minutes", "60", "Alert grouping window")
window_minutes = int(dbutils.widgets.get("correlation_window_minutes"))

# Table paths
ALERTS_TABLE = get_table_path(cfg, "alerts")
CASES_TABLE = get_table_path(cfg, "cases")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Main Execution

# COMMAND ----------

try:
    # ---- Find ungrouped alerts ----
    with mon.time("fetch_ungrouped_alerts"):
        ungrouped_alerts = spark.sql(f"""
            SELECT a.*
            FROM {ALERTS_TABLE} a
            LEFT JOIN {CASES_TABLE} c ON array_contains(c.alert_ids, a.id)
            WHERE c.id IS NULL
            AND a.status IN ('new', 'in_progress')
            AND a.created_at > current_timestamp() - INTERVAL 24 HOURS
            ORDER BY a.created_at
        """)
        ungrouped_count = ungrouped_alerts.count()
        mon.log_metric("ungrouped_alerts", ungrouped_count)

    print(f"Ungrouped alerts: {ungrouped_count}")

    # ---- Group alerts by source and time window ----
    with mon.time("group_alerts"):
        alert_groups = (
            ungrouped_alerts
            .withColumn("time_bucket", window(col("created_at"), f"{window_minutes} minutes"))
            .groupBy("time_bucket", "source")
            .agg(
                collect_list("id").alias("alert_ids"),
                count("*").alias("alert_count"),
                spark_max("severity").alias("max_severity"),
                collect_set("mitre_tactic").alias("tactics"),
                first("title").alias("first_alert_title"),
            )
            .filter(col("alert_count") >= 1)
        )
        group_count = alert_groups.count()
        mon.log_metric("alert_groups", group_count)

    print(f"Alert groups to create cases for: {group_count}")

    # ---- Create cases ----
    cases_created = 0
    flat_ids = []

    with mon.time("create_cases"):
        if group_count > 0:
            cases = (
                alert_groups
                .withColumn("id", expr("uuid()"))
                .withColumn("title", concat(
                    lit("Case: "), col("first_alert_title"),
                    when(col("alert_count") > 1, concat(lit(" (+"), col("alert_count") - 1, lit(" related)")))
                    .otherwise(lit(""))
                ))
                .withColumn("description", concat(
                    lit("Auto-grouped "), col("alert_count"), lit(" alerts from "),
                    col("source"), lit(" within "), lit(str(window_minutes)), lit(" min window")
                ))
                .withColumn("status", lit("open"))
                .withColumn("priority",
                    when(col("max_severity") == "critical", lit("critical"))
                    .when(col("max_severity") == "high", lit("high"))
                    .otherwise(lit("medium"))
                )
                .withColumn("severity", col("max_severity"))
                .withColumn("case_type", lit("incident"))
                .withColumn("mitre_tactics", col("tactics"))
                .withColumn("created_at", current_timestamp())
                .withColumn("updated_at", current_timestamp())
                .select("id", "title", "description", "status", "priority", "severity",
                        "case_type", "alert_ids", "mitre_tactics", "created_at", "updated_at")
            )

            cases.write.mode("append").saveAsTable(CASES_TABLE)
            cases_created = cases.count()
            mon.log_metric("cases_created", cases_created)
            print(f"Created {cases_created} new cases")
        else:
            mon.log_info("No new cases needed")
            print("No new cases needed")

    # ---- Update alert statuses via MERGE ----
    if group_count > 0:
        with mon.time("update_alert_statuses"):
            alert_ids_to_update = [row.alert_ids for row in alert_groups.collect()]
            flat_ids = [aid for group in alert_ids_to_update for aid in group]

            if flat_ids:
                update_schema = StructType([
                    StructField("alert_id", StringType(), False),
                ])
                update_data = [(aid,) for aid in flat_ids]
                update_df = spark.createDataFrame(update_data, schema=update_schema)
                update_df.createOrReplaceTempView("_tmp_case_alert_ids")

                spark.sql(f"""
                    MERGE INTO {ALERTS_TABLE} AS target
                    USING _tmp_case_alert_ids AS source
                    ON target.id = source.alert_id
                    WHEN MATCHED THEN UPDATE SET
                        target.status = 'in_progress'
                """)

                mon.log_metric("alerts_updated", len(flat_ids))
                print(f"Updated {len(flat_ids)} alerts to in_progress")

    # ---- Summary ----
    mon.log_complete(rows_processed=group_count)

    result = {
        "status": "success",
        "ungrouped_alerts": ungrouped_count,
        "alert_groups": group_count,
        "cases_created": cases_created,
        "alerts_updated": len(flat_ids),
        "correlation_window_minutes": window_minutes,
    }

except Exception as e:
    mon.log_error(e, context="case_management")
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
