# Databricks notebook source
# MAGIC %md
# MAGIC # Agent: Quarantine Handler
# MAGIC Reviews quarantined events, attempts auto-fix, generates data quality reports.

# COMMAND ----------

dbutils.widgets.text("catalog", "soc_platform", "Catalog")
dbutils.widgets.text("schema", "agentic_soc", "Schema")

catalog = dbutils.widgets.get("catalog")
schema = dbutils.widgets.get("schema")

spark.sql(f"USE CATALOG `{catalog}`")
spark.sql(f"USE SCHEMA `{schema}`")

# COMMAND ----------

from pyspark.sql.functions import *

# COMMAND ----------

# MAGIC %md
# MAGIC ## Check Quarantined Events

# COMMAND ----------

# Create quarantine table if not exists
spark.sql("""
    CREATE TABLE IF NOT EXISTS quarantined_events (
        id STRING DEFAULT uuid(),
        original_data STRING,
        quarantine_reason STRING,
        source STRING,
        quarantined_at TIMESTAMP DEFAULT current_timestamp(),
        recovered BOOLEAN DEFAULT false,
        recovered_at TIMESTAMP
    ) USING DELTA
""")

quarantined = spark.sql("""
    SELECT * FROM quarantined_events
    WHERE recovered = false
    AND quarantined_at > current_timestamp() - INTERVAL 24 HOURS
""")

print(f"Quarantined events to review: {quarantined.count()}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Attempt Auto-Recovery

# COMMAND ----------

if quarantined.count() > 0:
    # Try to parse and fix common issues
    recoverable = (
        quarantined
        .filter(col("original_data").isNotNull())
        .withColumn("parsed", from_json(col("original_data"), "event_type STRING, timestamp STRING, source STRING, source_ip STRING"))
        .filter(col("parsed.event_type").isNotNull())
    )

    if recoverable.count() > 0:
        recovered_events = (
            recoverable
            .select(
                expr("uuid()").alias("id"),
                col("parsed.event_type").alias("event_type"),
                coalesce(to_timestamp(col("parsed.timestamp")), current_timestamp()).alias("timestamp"),
                col("parsed.source").alias("source"),
                col("parsed.source_ip").alias("source_ip"),
                lit("info").alias("severity"),
                current_timestamp().alias("ingested_at")
            )
        )
        recovered_events.write.mode("append").saveAsTable("events")

        # Mark as recovered
        recovered_ids = [r.id for r in recoverable.select("id").collect()]
        if recovered_ids:
            ids_str = ",".join([f"'{i}'" for i in recovered_ids[:100]])
            spark.sql(f"""
                UPDATE quarantined_events
                SET recovered = true, recovered_at = current_timestamp()
                WHERE id IN ({ids_str})
            """)

        print(f"Recovered {recoverable.count()} events from quarantine")
    else:
        print("No events recoverable in this batch")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Data Quality Metrics

# COMMAND ----------

quality_stats = spark.sql("""
    SELECT
        (SELECT COUNT(*) FROM events WHERE timestamp > current_timestamp() - INTERVAL 1 HOUR) as events_1h,
        (SELECT COUNT(*) FROM quarantined_events WHERE quarantined_at > current_timestamp() - INTERVAL 1 HOUR) as quarantined_1h,
        (SELECT COUNT(*) FROM events WHERE ocsf_class_uid IS NULL AND timestamp > current_timestamp() - INTERVAL 1 HOUR) as unnormalized_1h
""").collect()[0]

total = quality_stats.events_1h + quality_stats.quarantined_1h
quality_rate = (quality_stats.events_1h / max(total, 1)) * 100

print(f"\nData Quality Report (last 1 hour):")
print(f"  Valid events: {quality_stats.events_1h}")
print(f"  Quarantined: {quality_stats.quarantined_1h}")
print(f"  Unnormalized: {quality_stats.unnormalized_1h}")
print(f"  Quality rate: {quality_rate:.1f}%")
