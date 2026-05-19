# Databricks notebook source
# MAGIC %md
# MAGIC # Agent 07: Negative Correlation Engine
# MAGIC Detects the ABSENCE of expected events (e.g., no heartbeat, missing backup confirmation).

# COMMAND ----------

dbutils.widgets.text("catalog", "soc_platform", "Catalog")
dbutils.widgets.text("schema", "agentic_soc", "Schema")

catalog = dbutils.widgets.get("catalog")
schema = dbutils.widgets.get("schema")

spark.sql(f"USE CATALOG `{catalog}`")
spark.sql(f"USE SCHEMA `{schema}`")

# COMMAND ----------

from pyspark.sql.functions import *
from datetime import datetime, timedelta

# COMMAND ----------

# MAGIC %md
# MAGIC ## Load Negative Correlation Rules

# COMMAND ----------

neg_rules = spark.table("negative_correlation_rules").filter(col("enabled") == True).collect()
print(f"Active negative correlation rules: {len(neg_rules)}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Check for Missing Events

# COMMAND ----------

detections = []

for rule in neg_rules:
    window_seconds = rule.absence_window_seconds
    expected_type = rule.expected_event_type

    recent_events = spark.sql(f"""
        SELECT COUNT(*) as cnt
        FROM events
        WHERE event_type = '{expected_type}'
        AND timestamp > current_timestamp() - INTERVAL {window_seconds} SECONDS
    """).collect()[0].cnt

    if recent_events == 0:
        detections.append({
            "rule_id": rule.id,
            "rule_name": rule.name,
            "expected_event_type": expected_type,
            "window_seconds": window_seconds,
            "severity": rule.severity
        })
        print(f"DETECTION: {rule.name} - No '{expected_type}' events in {window_seconds}s")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Generate Alerts for Detections

# COMMAND ----------

if detections:
    from pyspark.sql import Row

    alert_rows = []
    detection_rows = []

    for d in detections:
        detection_rows.append(Row(
            rule_id=d["rule_id"],
            detection_type="absence",
            severity=d["severity"],
            context={"expected_event": d["expected_event_type"], "window_seconds": str(d["window_seconds"])}
        ))

        alert_rows.append(Row(
            title=f"Negative Correlation: {d['rule_name']}",
            description=f"Expected event '{d['expected_event_type']}' not seen in {d['window_seconds']}s",
            severity=d["severity"],
            status="new",
            source="negative_correlation_engine",
            confidence_score=0.85
        ))

    detection_df = spark.createDataFrame(detection_rows)
    detection_df = detection_df.withColumn("id", expr("uuid()")).withColumn("detected_at", current_timestamp())
    detection_df.write.mode("append").saveAsTable("negative_correlation_detections")

    alert_df = spark.createDataFrame(alert_rows)
    alert_df = (alert_df
        .withColumn("id", expr("uuid()"))
        .withColumn("created_at", current_timestamp())
        .withColumn("rule_name", lit("negative_correlation"))
    )
    alert_df.write.mode("append").saveAsTable("alerts")

    print(f"Generated {len(detections)} negative correlation alerts")
else:
    print("No negative correlation detections - all expected events present")
