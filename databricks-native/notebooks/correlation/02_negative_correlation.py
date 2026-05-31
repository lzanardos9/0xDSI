# Databricks notebook source
# MAGIC %md
# MAGIC # Negative Correlation Engine
# MAGIC
# MAGIC Detects the ABSENCE of expected events. Examples:
# MAGIC - No heartbeat from a critical server
# MAGIC - Missing backup confirmation after scheduled window
# MAGIC - No authentication renewal within token TTL
# MAGIC - Security agent stopped reporting
# MAGIC
# MAGIC Uses Delta-backed rules with deduplication to prevent alert storms.

# COMMAND ----------

# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

# MAGIC %md
# MAGIC ## Configuration

# COMMAND ----------

dbutils.widgets.text("dedup_window_minutes", "60", "Suppress duplicate alerts within N minutes")
dbutils.widgets.text("max_alerts_per_run", "50", "Max alerts generated per execution")

dedup_window = int(dbutils.widgets.get("dedup_window_minutes"))
max_alerts = int(dbutils.widgets.get("max_alerts_per_run"))

require_tables("events", "negative_correlation_rules", "alerts")

# COMMAND ----------

from pyspark.sql.functions import *
from pyspark.sql.types import *

# COMMAND ----------

# MAGIC %md
# MAGIC ## Load Negative Correlation Rules

# COMMAND ----------

rules_table = cfg.get_table_path("negative_correlation_rules")
rules_df = spark.table(rules_table).filter(col("enabled") == True)
neg_rules = rules_df.collect()

mon.log_event("rules_loaded", {"active_count": len(neg_rules)})
print(f"Active negative correlation rules: {len(neg_rules)}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Check for Missing Events

# COMMAND ----------

events_table = cfg.get_table_path("events")
detections_table = cfg.get_table_path("negative_correlation_detections")
alerts_table = cfg.get_table_path("alerts")

# Ensure detections table exists
spark.sql(f"""
    CREATE TABLE IF NOT EXISTS {detections_table} (
        id STRING,
        rule_id STRING,
        rule_name STRING,
        detection_type STRING,
        expected_event_type STRING,
        window_seconds INT,
        severity STRING,
        context MAP<STRING, STRING>,
        detected_at TIMESTAMP
    )
    USING DELTA
    TBLPROPERTIES ('delta.autoOptimize.optimizeWrite' = 'true')
""")

detections = []

with mon.time("absence_check"):
    for rule in neg_rules:
        window_seconds = rule.absence_window_seconds
        expected_type = rule.expected_event_type
        rule_id = rule.id
        rule_name = rule.name

        # Use parameterized query via safe SQL
        count_query = (
            qb()
            .select("COUNT(*) as cnt")
            .from_table(events_table)
            .where_eq("event_type", expected_type)
            .where_raw(f"timestamp > current_timestamp() - INTERVAL {int(window_seconds)} SECONDS")
            .limit(1)
            .build()
        )
        recent_count = spark.sql(count_query).collect()[0].cnt

        if recent_count == 0:
            # Check dedup: was this rule already fired recently?
            dedup_query = (
                qb()
                .select("COUNT(*) as cnt")
                .from_table(detections_table)
                .where_eq("rule_id", rule_id)
                .where_raw(f"detected_at > current_timestamp() - INTERVAL {dedup_window} MINUTES")
                .limit(1)
                .build()
            )
            recent_detections = spark.sql(dedup_query).collect()[0].cnt

            if recent_detections == 0:
                detections.append({
                    "rule_id": rule_id,
                    "rule_name": rule_name,
                    "expected_event_type": expected_type,
                    "window_seconds": window_seconds,
                    "severity": rule.severity,
                })
                print(f"DETECTION: {rule_name} - No '{expected_type}' events in {window_seconds}s")
            else:
                print(f"SUPPRESSED (dedup): {rule_name} already fired within {dedup_window}min")

mon.log_event("absence_scan_complete", {
    "rules_checked": len(neg_rules),
    "detections": len(detections),
})

# COMMAND ----------

# MAGIC %md
# MAGIC ## Persist Detections and Generate Alerts

# COMMAND ----------

if detections:
    detections_capped = detections[:max_alerts]

    # Write detection records
    detection_schema = StructType([
        StructField("rule_id", StringType()),
        StructField("rule_name", StringType()),
        StructField("detection_type", StringType()),
        StructField("expected_event_type", StringType()),
        StructField("window_seconds", IntegerType()),
        StructField("severity", StringType()),
    ])

    detection_rows = [
        {
            "rule_id": d["rule_id"],
            "rule_name": d["rule_name"],
            "detection_type": "absence",
            "expected_event_type": d["expected_event_type"],
            "window_seconds": d["window_seconds"],
            "severity": d["severity"],
        }
        for d in detections_capped
    ]

    detection_df = (
        spark.createDataFrame(detection_rows, schema=detection_schema)
        .withColumn("id", expr("uuid()"))
        .withColumn("detected_at", current_timestamp())
        .withColumn("context", map_from_arrays(
            array(lit("expected_event"), lit("window_seconds")),
            array(col("expected_event_type"), col("window_seconds").cast("string"))
        ))
    )
    detection_df.write.mode("append").saveAsTable(detections_table)

    # Generate alerts
    alert_schema = StructType([
        StructField("title", StringType()),
        StructField("description", StringType()),
        StructField("severity", StringType()),
        StructField("source", StringType()),
        StructField("confidence_score", DoubleType()),
    ])

    alert_rows = [
        {
            "title": f"Negative Correlation: {d['rule_name']}",
            "description": f"Expected event '{d['expected_event_type']}' not seen in {d['window_seconds']}s",
            "severity": d["severity"],
            "source": "negative_correlation_engine",
            "confidence_score": 0.85,
        }
        for d in detections_capped
    ]

    alert_df = (
        spark.createDataFrame(alert_rows, schema=alert_schema)
        .withColumn("id", expr("uuid()"))
        .withColumn("status", lit("new"))
        .withColumn("created_at", current_timestamp())
    )
    alert_df.write.mode("append").saveAsTable(alerts_table)

    mon.log_detection("negative_correlation", {
        "count": len(detections_capped),
        "severities": [d["severity"] for d in detections_capped],
    })
    print(f"Generated {len(detections_capped)} negative correlation alerts")

else:
    print("No negative correlation detections - all expected events present")

# COMMAND ----------

mon.log_complete(details={
    "rules_evaluated": len(neg_rules),
    "detections_generated": len(detections),
    "dedup_window_minutes": dedup_window,
})
