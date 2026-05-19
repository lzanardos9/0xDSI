# Databricks notebook source
# MAGIC %md
# MAGIC # Agent 02: Event Enrichment Pipeline
# MAGIC Enriches raw events with geo-IP, threat intel, asset context, and user info.

# COMMAND ----------

dbutils.widgets.text("catalog", "soc_platform", "Catalog")
dbutils.widgets.text("schema", "agentic_soc", "Schema")
dbutils.widgets.text("checkpoint_path", "/tmp/checkpoints/enrichment", "Checkpoint")

catalog = dbutils.widgets.get("catalog")
schema = dbutils.widgets.get("schema")
checkpoint_path = dbutils.widgets.get("checkpoint_path")

spark.sql(f"USE CATALOG `{catalog}`")
spark.sql(f"USE SCHEMA `{schema}`")

# COMMAND ----------

from pyspark.sql.functions import *
from pyspark.sql.types import *

# COMMAND ----------

# MAGIC %md
# MAGIC ## Load Reference Data for Enrichment

# COMMAND ----------

ioc_df = spark.table("ioc_entries").select(
    col("value").alias("ioc_value"),
    col("indicator_type").alias("ioc_type"),
    col("threat_type"),
    col("confidence").alias("ioc_confidence")
).cache()

asset_df = spark.table("asset_registry").select(
    col("ip_address"),
    col("hostname"),
    col("asset_type"),
    col("criticality"),
    col("owner"),
    col("department")
).cache()

user_df = spark.table("user_profiles").select(
    col("id").alias("user_profile_id"),
    col("display_name"),
    col("department").alias("user_department"),
    col("risk_level")
).cache()

# COMMAND ----------

# MAGIC %md
# MAGIC ## Streaming Enrichment

# COMMAND ----------

events_stream = (
    spark.readStream
    .format("delta")
    .option("ignoreChanges", "true")
    .table("events")
    .filter(col("enrichments").isNull())
)

# COMMAND ----------

# Enrich with asset context
enriched = (
    events_stream
    .join(asset_df, events_stream.source_ip == asset_df.ip_address, "left")
    .join(user_df, events_stream.user_id == user_df.user_profile_id, "left")
)

# IOC matching on source_ip
enriched_with_ioc = (
    enriched
    .join(
        ioc_df.filter(col("ioc_type") == "ip"),
        enriched.source_ip == ioc_df.ioc_value,
        "left"
    )
    .withColumn("enrichments", map_from_arrays(
        array(lit("asset_criticality"), lit("asset_owner"), lit("user_risk"), lit("ioc_match")),
        array(
            coalesce(col("criticality"), lit("unknown")),
            coalesce(col("owner"), lit("unknown")),
            coalesce(col("risk_level"), lit("unknown")),
            when(col("ioc_value").isNotNull(), lit("true")).otherwise(lit("false"))
        )
    ))
    .select("id", "enrichments", "geo_location")
)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Write Enrichments Back (Merge)

# COMMAND ----------

def merge_enrichments(batch_df, batch_id):
    batch_df.createOrReplaceTempView("enrichment_updates")
    spark.sql("""
        MERGE INTO events t
        USING enrichment_updates s
        ON t.id = s.id
        WHEN MATCHED THEN UPDATE SET
            t.enrichments = s.enrichments
    """)

enrichment_query = (
    enriched_with_ioc.writeStream
    .foreachBatch(merge_enrichments)
    .option("checkpointLocation", f"{checkpoint_path}/merge")
    .trigger(processingTime="30 seconds")
    .start()
)

# COMMAND ----------

print("Enrichment pipeline running.")
print("Sources: asset_registry, ioc_entries, user_profiles")
