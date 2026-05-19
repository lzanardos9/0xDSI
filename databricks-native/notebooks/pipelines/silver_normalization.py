# Databricks notebook source
# MAGIC %md
# MAGIC # DLT Pipeline: Silver Layer
# MAGIC Normalized, deduplicated, enriched events.

# COMMAND ----------

import dlt
from pyspark.sql.functions import *

# COMMAND ----------

@dlt.table(
    name="silver_events",
    comment="Normalized and deduplicated security events",
    table_properties={"quality": "silver"}
)
@dlt.expect_all_or_drop({
    "valid_source_ip": "source_ip IS NOT NULL OR user_id IS NOT NULL",
    "valid_severity": "severity IN ('info', 'low', 'medium', 'high', 'critical')"
})
def silver_events():
    return (
        dlt.read_stream("bronze_events")
        .dropDuplicates(["id"])
        .withColumn("normalized_severity",
            when(col("severity") == "info", lit(1))
            .when(col("severity") == "low", lit(2))
            .when(col("severity") == "medium", lit(3))
            .when(col("severity") == "high", lit(4))
            .when(col("severity") == "critical", lit(5))
            .otherwise(lit(0))
        )
        .withColumn("is_enriched", col("enrichments").isNotNull())
        .withColumn("hour_of_day", hour(col("timestamp")))
        .withColumn("day_of_week", dayofweek(col("timestamp")))
        .withColumn("is_off_hours",
            (col("hour_of_day") < 6) | (col("hour_of_day") > 22)
        )
    )

# COMMAND ----------

@dlt.table(
    name="silver_alerts",
    comment="Deduplicated alerts with calculated metrics",
    table_properties={"quality": "silver"}
)
def silver_alerts():
    return (
        dlt.read_stream("bronze_alerts")
        .dropDuplicates(["id"])
        .withColumn("response_time_seconds",
            when(col("resolved_at").isNotNull(),
                 unix_timestamp(col("resolved_at")) - unix_timestamp(col("first_seen"))
            )
        )
        .withColumn("event_count", size(coalesce(col("event_ids"), array())))
        .withColumn("is_false_positive", col("false_positive") == True)
    )
