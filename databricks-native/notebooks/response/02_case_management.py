# Databricks notebook source
# MAGIC %md
# MAGIC # Agent 16: Automated Case Management
# MAGIC Groups related alerts into cases, tracks lifecycle, assigns analysts.

# COMMAND ----------

dbutils.widgets.text("catalog", "soc_platform", "Catalog")
dbutils.widgets.text("schema", "agentic_soc", "Schema")
dbutils.widgets.text("correlation_window_minutes", "60", "Alert grouping window")

catalog = dbutils.widgets.get("catalog")
schema = dbutils.widgets.get("schema")
window_minutes = int(dbutils.widgets.get("correlation_window_minutes"))

spark.sql(f"USE CATALOG `{catalog}`")
spark.sql(f"USE SCHEMA `{schema}`")

# COMMAND ----------

from pyspark.sql.functions import *

# COMMAND ----------

# MAGIC %md
# MAGIC ## Find Ungrouped Alerts

# COMMAND ----------

ungrouped_alerts = spark.sql("""
    SELECT a.*
    FROM alerts a
    LEFT JOIN cases c ON array_contains(c.alert_ids, a.id)
    WHERE c.id IS NULL
    AND a.status IN ('new', 'in_progress')
    AND a.created_at > current_timestamp() - INTERVAL 24 HOURS
    ORDER BY a.created_at
""")

print(f"Ungrouped alerts: {ungrouped_alerts.count()}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Group Alerts by Source and Time Window

# COMMAND ----------

alert_groups = (
    ungrouped_alerts
    .withColumn("time_bucket", window(col("created_at"), f"{window_minutes} minutes"))
    .groupBy("time_bucket", "source")
    .agg(
        collect_list("id").alias("alert_ids"),
        count("*").alias("alert_count"),
        max("severity").alias("max_severity"),
        collect_set("mitre_tactic").alias("tactics"),
        first("title").alias("first_alert_title")
    )
    .filter(col("alert_count") >= 1)
)

print(f"Alert groups to create cases for: {alert_groups.count()}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Create Cases

# COMMAND ----------

if alert_groups.count() > 0:
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
    cases.write.mode("append").saveAsTable("cases")
    print(f"Created {cases.count()} new cases")

    alert_ids_to_update = [row.alert_ids for row in alert_groups.collect()]
    flat_ids = [aid for group in alert_ids_to_update for aid in group]
    if flat_ids:
        ids_str = ",".join([f"'{x}'" for x in flat_ids[:500]])
        spark.sql(f"UPDATE alerts SET status = 'in_progress' WHERE id IN ({ids_str})")
        print(f"Updated {len(flat_ids)} alerts to in_progress")
else:
    print("No new cases needed")
