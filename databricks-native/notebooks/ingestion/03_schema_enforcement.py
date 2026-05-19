# Databricks notebook source
# MAGIC %md
# MAGIC # Agent: Schema Enforcement & Validation
# MAGIC Validates incoming events against OCSF schema, normalizes fields.

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
# MAGIC ## OCSF Schema Validation Rules

# COMMAND ----------

REQUIRED_FIELDS = ["event_type", "timestamp"]
VALID_SEVERITIES = ["info", "low", "medium", "high", "critical"]
VALID_OUTCOMES = ["success", "failure", "unknown"]

OCSF_CLASS_MAPPING = {
    "authentication_failure": 3002,
    "authentication_success": 3002,
    "process_creation": 1001,
    "file_modification": 1004,
    "network_connection": 4001,
    "dns_query": 4003,
    "registry_modification": 1006,
    "privilege_escalation": 3004,
    "lateral_movement": 4002,
    "data_exfiltration": 4010,
}

# COMMAND ----------

# MAGIC %md
# MAGIC ## Validate and Normalize Unnormalized Events

# COMMAND ----------

unnormalized_events = spark.sql("""
    SELECT * FROM events
    WHERE ocsf_class_uid IS NULL
    AND timestamp > current_timestamp() - INTERVAL 1 HOUR
""")

print(f"Events needing normalization: {unnormalized_events.count()}")

# COMMAND ----------

if unnormalized_events.count() > 0:
    normalized = (
        unnormalized_events
        .withColumn("severity",
            when(col("severity").isin(VALID_SEVERITIES), col("severity"))
            .otherwise(lit("info"))
        )
        .withColumn("outcome",
            when(col("outcome").isin(VALID_OUTCOMES), col("outcome"))
            .otherwise(lit("unknown"))
        )
        .withColumn("ocsf_class_uid",
            when(col("event_type") == "authentication_failure", lit(3002))
            .when(col("event_type") == "authentication_success", lit(3002))
            .when(col("event_type") == "process_creation", lit(1001))
            .when(col("event_type") == "file_modification", lit(1004))
            .when(col("event_type") == "network_connection", lit(4001))
            .when(col("event_type") == "dns_query", lit(4003))
            .when(col("event_type") == "privilege_escalation", lit(3004))
            .when(col("event_type") == "lateral_movement", lit(4002))
            .when(col("event_type") == "data_exfiltration", lit(4010))
            .otherwise(lit(0))
        )
        .withColumn("ocsf_category_uid",
            (col("ocsf_class_uid") / lit(1000)).cast("int")
        )
    )

    # Merge back
    normalized.createOrReplaceTempView("normalized_batch")
    spark.sql("""
        MERGE INTO events t
        USING normalized_batch s
        ON t.id = s.id
        WHEN MATCHED THEN UPDATE SET
            t.severity = s.severity,
            t.outcome = s.outcome,
            t.ocsf_class_uid = s.ocsf_class_uid,
            t.ocsf_category_uid = s.ocsf_category_uid
    """)

    print(f"Normalized {normalized.count()} events")
else:
    print("All events already normalized")
