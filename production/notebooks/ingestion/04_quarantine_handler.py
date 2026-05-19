# Databricks notebook source
# MAGIC %md
# MAGIC # 04 - Quarantine Handler
# MAGIC
# MAGIC Manages events that failed validation during normalization.
# MAGIC Provides retry logic, diagnostics, and escalation for persistent failures.
# MAGIC
# MAGIC **Input:** `{catalog}.{schema}.quarantine_events`
# MAGIC **Actions:**
# MAGIC - Retry with relaxed parsing
# MAGIC - Classify failure patterns
# MAGIC - Alert on new failure modes (connector misconfiguration)
# MAGIC - Provide data quality metrics

# COMMAND ----------

dbutils.widgets.text("catalog", "main", "Unity Catalog name")
dbutils.widgets.text("schema", "security", "Schema name")
dbutils.widgets.text("retry_max_age_hours", "24", "Only retry events newer than this")
dbutils.widgets.text("alert_threshold_percent", "5", "Alert if quarantine rate exceeds this %")

catalog = dbutils.widgets.get("catalog")
schema = dbutils.widgets.get("schema")
retry_max_age = int(dbutils.widgets.get("retry_max_age_hours"))
alert_threshold = float(dbutils.widgets.get("alert_threshold_percent"))

# COMMAND ----------

# MAGIC %md
# MAGIC ## Quarantine Diagnostics

# COMMAND ----------

from pyspark.sql.functions import (
    col, count, lit, current_timestamp, expr,
    date_format, hour, when, desc, collect_list, first
)

# Load quarantine table
quarantine_df = spark.table(f"{catalog}.{schema}.quarantine_events")

# Recent quarantined events (within retry window)
recent_quarantine = quarantine_df.filter(
    col("quarantine_timestamp") >= expr(f"current_timestamp() - INTERVAL {retry_max_age} HOURS")
)

total_quarantined = recent_quarantine.count()
print(f"Quarantined events (last {retry_max_age}h): {total_quarantined}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Failure Pattern Analysis

# COMMAND ----------

# Categorize failures by reason and source
failure_summary = (
    recent_quarantine
    .groupBy("source_name", "quarantine_reason")
    .agg(
        count("*").alias("failure_count"),
        first("raw_event").alias("sample_event"),
    )
    .orderBy(desc("failure_count"))
)

display(failure_summary)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Data Quality Metrics

# COMMAND ----------

# Compare quarantine rate to total ingestion
bronze_recent = spark.table(f"{catalog}.{schema}.bronze_events").filter(
    col("ingest_timestamp") >= expr(f"current_timestamp() - INTERVAL {retry_max_age} HOURS")
)
total_ingested = bronze_recent.count()

if total_ingested > 0:
    quarantine_rate = (total_quarantined / total_ingested) * 100
    print(f"Quarantine rate: {quarantine_rate:.2f}% ({total_quarantined}/{total_ingested})")

    if quarantine_rate > alert_threshold:
        print(f"WARNING: Quarantine rate {quarantine_rate:.2f}% exceeds threshold {alert_threshold}%!")

        # Write alert to alerts table
        alert_data = [{
            "alert_type": "data_quality",
            "severity": "high" if quarantine_rate > 10 else "medium",
            "title": f"High quarantine rate: {quarantine_rate:.1f}%",
            "description": f"{total_quarantined} events quarantined out of {total_ingested} in last {retry_max_age}h",
            "source": "quarantine_handler",
            "created_at": str(current_timestamp()),
        }]
        spark.createDataFrame(alert_data).write.format("delta").mode("append").saveAsTable(
            f"{catalog}.{schema}.system_alerts"
        )
else:
    print("No recent events in bronze (pipeline may be stopped)")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Retry Logic for Recoverable Failures

# COMMAND ----------

def retry_with_relaxed_parsing(quarantine_batch):
    """
    Attempt to parse quarantined events with relaxed rules:
    - Try multiple timestamp formats
    - Accept partial records (fill missing fields with defaults)
    - Use generic parser as fallback
    """
    from pyspark.sql.functions import from_json, to_timestamp, coalesce

    retried = (
        quarantine_batch
        .withColumn("_json", from_json(col("raw_event"), "MAP<STRING, STRING>"))
        .filter(col("_json").isNotNull())  # At least valid JSON
        .withColumn("event_id", coalesce(
            col("_json._id"), col("_json.id"), col("_json.event_id"),
            expr("uuid()")
        ))
        .withColumn("time", coalesce(
            to_timestamp(col("_json.timestamp")),
            to_timestamp(col("_json.@timestamp")),
            to_timestamp(col("_json.event_time")),
            to_timestamp(col("_json.time")),
            col("quarantine_timestamp"),  # Fallback to quarantine time
        ))
        .withColumn("type_name", coalesce(
            col("_json.event_type"), col("_json.type"), col("_json.action"),
            lit("unknown"),
        ))
        .withColumn("source_name", coalesce(col("source_name"), lit("recovered")))
        .withColumn("category_uid", lit(1))
        .withColumn("class_uid", lit(1001))
        .withColumn("severity_id", lit(1))
        .withColumn("status_id", lit(0))
        .withColumn("normalized_at", current_timestamp())
        .withColumn("normalization_version", lit("2.0.0-relaxed"))
        .withColumn("confidence", lit(0.6))  # Lower confidence for recovered events
        .withColumn("partition_date", date_format(col("time"), "yyyy-MM-dd"))
        .withColumn("raw_event_id", col("event_id"))
    )

    # Only recover events that now have valid required fields
    recovered = retried.filter(
        col("event_id").isNotNull() &
        col("time").isNotNull()
    )

    return recovered


# Retry recent quarantined events
if total_quarantined > 0:
    # Only retry parser errors (not schema violations)
    retryable = recent_quarantine.filter(
        col("quarantine_reason").rlike("(?i)parser|parse|json|format")
    )

    if retryable.count() > 0:
        recovered = retry_with_relaxed_parsing(retryable)
        recovered_count = recovered.count()

        if recovered_count > 0:
            # Write recovered events to silver
            silver_columns = ["event_id", "category_uid", "class_uid", "severity_id",
                            "status_id", "type_name", "time", "source_name",
                            "raw_event_id", "normalized_at", "normalization_version",
                            "confidence", "partition_date"]

            available = [c for c in silver_columns if c in recovered.columns]
            (
                recovered
                .select(*available)
                .write
                .format("delta")
                .mode("append")
                .option("mergeSchema", "true")
                .saveAsTable(f"{catalog}.{schema}.silver_events")
            )
            print(f"Recovered {recovered_count} events from quarantine")
        else:
            print("No events could be recovered with relaxed parsing")
    else:
        print("No retryable events in quarantine")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Quarantine Cleanup (age out old entries)

# COMMAND ----------

# Remove quarantine entries older than 30 days
spark.sql(f"""
    DELETE FROM {catalog}.{schema}.quarantine_events
    WHERE quarantine_timestamp < current_timestamp() - INTERVAL 30 DAYS
""")

# Optimize quarantine table
spark.sql(f"OPTIMIZE {catalog}.{schema}.quarantine_events")

print("Quarantine maintenance complete")
