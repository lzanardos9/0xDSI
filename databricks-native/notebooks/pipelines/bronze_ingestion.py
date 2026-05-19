# Databricks notebook source
# MAGIC %md
# MAGIC # DLT Pipeline: Bronze Layer
# MAGIC Raw event ingestion with data quality expectations.

# COMMAND ----------

import dlt
from pyspark.sql.functions import *

catalog = spark.conf.get("catalog", "soc_platform")
schema = spark.conf.get("schema", "agentic_soc")

# COMMAND ----------

@dlt.table(
    name="bronze_events",
    comment="Raw security events - unprocessed",
    table_properties={"quality": "bronze"}
)
@dlt.expect("valid_timestamp", "timestamp IS NOT NULL")
@dlt.expect("valid_event_type", "event_type IS NOT NULL")
@dlt.expect_or_drop("not_test_data", "source != 'test'")
def bronze_events():
    return (
        spark.readStream
        .format("delta")
        .table(f"{catalog}.{schema}.events")
    )

# COMMAND ----------

@dlt.table(
    name="bronze_alerts",
    comment="Raw alerts from all detection engines",
    table_properties={"quality": "bronze"}
)
@dlt.expect("valid_severity", "severity IN ('info', 'low', 'medium', 'high', 'critical')")
@dlt.expect("valid_title", "title IS NOT NULL AND LENGTH(title) > 0")
def bronze_alerts():
    return (
        spark.readStream
        .format("delta")
        .table(f"{catalog}.{schema}.alerts")
    )
