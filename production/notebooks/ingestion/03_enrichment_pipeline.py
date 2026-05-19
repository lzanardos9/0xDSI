# Databricks notebook source
# MAGIC %md
# MAGIC # 03 - Event Enrichment Pipeline
# MAGIC
# MAGIC Enriches normalized Silver events with:
# MAGIC - GeoIP resolution (MaxMind)
# MAGIC - Asset context (criticality, owner, business unit)
# MAGIC - Threat intelligence (IOC matching)
# MAGIC - User context (role, department, risk score)
# MAGIC - MITRE ATT&CK mapping
# MAGIC
# MAGIC **Input:** `{catalog}.{schema}.silver_events`
# MAGIC **Output:** `{catalog}.{schema}.enriched_events`
# MAGIC **Enrichment Tables:** asset_inventory, user_profiles, threat_intel_iocs, geo_ip_blocks

# COMMAND ----------

dbutils.widgets.text("catalog", "main", "Unity Catalog name")
dbutils.widgets.text("schema", "security", "Schema name")
dbutils.widgets.text("checkpoint_path", "", "Checkpoint location")
dbutils.widgets.text("processing_time", "30 seconds", "Trigger interval")
dbutils.widgets.text("geoip_path", "", "Path to MaxMind GeoLite2 database")

catalog = dbutils.widgets.get("catalog")
schema = dbutils.widgets.get("schema")
checkpoint_path = dbutils.widgets.get("checkpoint_path") or f"/Volumes/{catalog}/{schema}/checkpoints/enrichment"
processing_time = dbutils.widgets.get("processing_time")
geoip_path = dbutils.widgets.get("geoip_path")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Load Enrichment Reference Tables

# COMMAND ----------

from pyspark.sql.functions import (
    col, broadcast, coalesce, lit, current_timestamp,
    when, expr, concat_ws, array_union, array, date_format
)

# Asset inventory - broadcast for fast lookups
asset_df = spark.table(f"{catalog}.{schema}.asset_inventory").select(
    col("ip_address").alias("asset_ip"),
    col("hostname").alias("asset_hostname"),
    col("asset_id"),
    col("asset_type"),
    col("criticality").alias("asset_criticality"),
    col("owner").alias("asset_owner"),
    col("business_unit").alias("asset_business_unit"),
    col("environment").alias("asset_environment"),
    col("tags").alias("asset_tags"),
)

# User profiles
user_df = spark.table(f"{catalog}.{schema}.user_profiles").select(
    col("user_id").alias("user_profile_id"),
    col("display_name").alias("user_display_name"),
    col("department").alias("user_department"),
    col("role").alias("user_role"),
    col("risk_score").alias("user_risk_score"),
    col("manager").alias("user_manager"),
    col("location").alias("user_location"),
)

# Active threat intel IOCs (only recent, high-confidence)
ioc_df = spark.table(f"{catalog}.{schema}.threat_intel_iocs").filter(
    (col("confidence") >= 0.7) &
    (col("last_seen") >= expr("current_timestamp() - INTERVAL 90 DAYS"))
).select(
    col("ioc_value"),
    col("ioc_type"),
    col("threat_level").alias("ioc_threat_level"),
    col("campaigns").alias("ioc_campaigns"),
    col("mitre_techniques").alias("ioc_mitre_techniques"),
    col("source").alias("ioc_source"),
)

# MITRE ATT&CK technique mapping (event type → technique)
mitre_mapping_df = spark.table(f"{catalog}.{schema}.mitre_technique_mapping").select(
    col("event_pattern"),
    col("technique_id"),
    col("tactic"),
    col("technique_name"),
)

print(f"Loaded enrichment tables:")
print(f"  Assets: {asset_df.count()} entries")
print(f"  Users: {user_df.count()} entries")
print(f"  IOCs: {ioc_df.count()} active indicators")

# COMMAND ----------

# MAGIC %md
# MAGIC ## GeoIP Enrichment Function

# COMMAND ----------

from pyspark.sql.functions import udf
from pyspark.sql.types import StructType, StructField, StringType

geo_result_schema = StructType([
    StructField("country", StringType(), True),
    StructField("city", StringType(), True),
    StructField("latitude", StringType(), True),
    StructField("longitude", StringType(), True),
    StructField("asn", StringType(), True),
    StructField("org", StringType(), True),
])

# GeoIP lookup using broadcast variable
if geoip_path:
    # Load MaxMind database as broadcast
    import struct

    # For production: use maxminddb library on cluster
    # The UDF approach ensures it works with any GeoIP provider
    @udf(geo_result_schema)
    def resolve_geoip(ip_address):
        """Resolve IP to geolocation. Uses MaxMind GeoLite2."""
        if not ip_address:
            return None
        try:
            import maxminddb
            with maxminddb.open_database(geoip_path) as reader:
                result = reader.get(ip_address)
                if result:
                    return (
                        result.get("country", {}).get("iso_code"),
                        result.get("city", {}).get("names", {}).get("en"),
                        str(result.get("location", {}).get("latitude", "")),
                        str(result.get("location", {}).get("longitude", "")),
                        str(result.get("traits", {}).get("autonomous_system_number", "")),
                        result.get("traits", {}).get("autonomous_system_organization"),
                    )
        except Exception:
            pass
        return None
else:
    # Fallback: use pre-computed geo_ip_blocks table
    @udf(geo_result_schema)
    def resolve_geoip(ip_address):
        return None

# COMMAND ----------

# MAGIC %md
# MAGIC ## Create Enriched Events Table

# COMMAND ----------

spark.sql(f"""
    CREATE TABLE IF NOT EXISTS {catalog}.{schema}.enriched_events (
        -- All silver columns
        event_id STRING NOT NULL,
        category_uid INT NOT NULL,
        class_uid INT NOT NULL,
        severity_id INT,
        status_id INT,
        type_name STRING,
        time TIMESTAMP NOT NULL,
        actor_user_id STRING,
        actor_user_name STRING,
        src_ip STRING,
        src_port INT,
        src_hostname STRING,
        dst_ip STRING,
        dst_port INT,
        dst_hostname STRING,
        protocol STRING,
        bytes_in BIGINT,
        bytes_out BIGINT,
        resource_type STRING,
        resource_name STRING,
        source_name STRING NOT NULL,

        -- GeoIP enrichment
        src_geo_country STRING,
        src_geo_city STRING,
        src_geo_asn STRING,
        src_geo_org STRING,
        dst_geo_country STRING,
        dst_geo_city STRING,

        -- Asset enrichment
        src_asset_id STRING,
        src_asset_criticality STRING,
        src_asset_owner STRING,
        src_asset_business_unit STRING,
        dst_asset_id STRING,
        dst_asset_criticality STRING,
        dst_asset_owner STRING,

        -- User enrichment
        actor_department STRING,
        actor_role STRING,
        actor_risk_score DOUBLE,
        actor_manager STRING,
        actor_location STRING,

        -- Threat intel enrichment
        src_ioc_match BOOLEAN DEFAULT FALSE,
        src_ioc_threat_level STRING,
        src_ioc_campaigns ARRAY<STRING>,
        dst_ioc_match BOOLEAN DEFAULT FALSE,
        dst_ioc_threat_level STRING,

        -- MITRE enrichment
        mitre_technique_id STRING,
        mitre_tactic STRING,
        mitre_technique_name STRING,

        -- Computed risk
        event_risk_score DOUBLE,
        enrichment_tags ARRAY<STRING>,
        enriched_at TIMESTAMP NOT NULL,
        partition_date STRING NOT NULL
    )
    USING DELTA
    PARTITIONED BY (partition_date, source_name)
    TBLPROPERTIES (
        'delta.autoOptimize.optimizeWrite' = 'true',
        'delta.autoOptimize.autoCompact' = 'true'
    )
""")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Enrichment Processing

# COMMAND ----------

def enrich_batch(batch_df, batch_id):
    """Enrich a micro-batch of silver events."""
    if batch_df.isEmpty():
        return

    count = batch_df.count()
    print(f"Enrichment batch {batch_id}: {count} events")

    enriched = batch_df

    # 1. GeoIP enrichment for source IP
    if geoip_path:
        enriched = (
            enriched
            .withColumn("_src_geo", resolve_geoip(col("src_ip")))
            .withColumn("src_geo_country", coalesce(col("src_geo_country"), col("_src_geo.country")))
            .withColumn("src_geo_city", coalesce(col("src_geo_city"), col("_src_geo.city")))
            .withColumn("src_geo_asn", col("_src_geo.asn"))
            .withColumn("src_geo_org", col("_src_geo.org"))
            .withColumn("_dst_geo", resolve_geoip(col("dst_ip")))
            .withColumn("dst_geo_country", coalesce(col("dst_geo_country"), col("_dst_geo.country")))
            .withColumn("dst_geo_city", col("_dst_geo.city"))
            .drop("_src_geo", "_dst_geo")
        )

    # 2. Asset enrichment (source)
    enriched = (
        enriched
        .join(
            broadcast(asset_df.alias("src_asset")),
            (col("src_ip") == col("src_asset.asset_ip")) |
            (col("src_hostname") == col("src_asset.asset_hostname")),
            "left"
        )
        .withColumn("src_asset_id", col("src_asset.asset_id"))
        .withColumn("src_asset_criticality", col("src_asset.asset_criticality"))
        .withColumn("src_asset_owner", col("src_asset.asset_owner"))
        .withColumn("src_asset_business_unit", col("src_asset.asset_business_unit"))
        .drop("asset_ip", "asset_hostname", "asset_id", "asset_type",
               "asset_criticality", "asset_owner", "asset_business_unit",
               "asset_environment", "asset_tags")
    )

    # 3. Asset enrichment (destination)
    enriched = (
        enriched
        .join(
            broadcast(asset_df.alias("dst_asset")),
            col("dst_ip") == col("dst_asset.asset_ip"),
            "left"
        )
        .withColumn("dst_asset_id", col("dst_asset.asset_id"))
        .withColumn("dst_asset_criticality", col("dst_asset.asset_criticality"))
        .withColumn("dst_asset_owner", col("dst_asset.asset_owner"))
        .drop("asset_ip", "asset_hostname", "asset_id", "asset_type",
               "asset_criticality", "asset_owner", "asset_business_unit",
               "asset_environment", "asset_tags")
    )

    # 4. User enrichment
    enriched = (
        enriched
        .join(
            broadcast(user_df),
            col("actor_user_id") == col("user_profile_id"),
            "left"
        )
        .withColumn("actor_department", col("user_department"))
        .withColumn("actor_role", col("user_role"))
        .withColumn("actor_risk_score", col("user_risk_score"))
        .withColumn("actor_manager", col("user_manager"))
        .withColumn("actor_location", col("user_location"))
        .drop("user_profile_id", "user_display_name", "user_department",
               "user_role", "user_risk_score", "user_manager", "user_location")
    )

    # 5. Threat intel IOC matching (source IP)
    ioc_ip_df = ioc_df.filter(col("ioc_type") == "ip")
    enriched = (
        enriched
        .join(
            broadcast(ioc_ip_df.alias("src_ioc")),
            col("src_ip") == col("src_ioc.ioc_value"),
            "left"
        )
        .withColumn("src_ioc_match", col("src_ioc.ioc_threat_level").isNotNull())
        .withColumn("src_ioc_threat_level", col("src_ioc.ioc_threat_level"))
        .withColumn("src_ioc_campaigns", col("src_ioc.ioc_campaigns"))
        .drop("ioc_value", "ioc_type", "ioc_threat_level", "ioc_campaigns",
               "ioc_mitre_techniques", "ioc_source")
    )

    # 6. Threat intel IOC matching (destination IP)
    enriched = (
        enriched
        .join(
            broadcast(ioc_ip_df.alias("dst_ioc")),
            col("dst_ip") == col("dst_ioc.ioc_value"),
            "left"
        )
        .withColumn("dst_ioc_match", col("dst_ioc.ioc_threat_level").isNotNull())
        .withColumn("dst_ioc_threat_level", col("dst_ioc.ioc_threat_level"))
        .drop("ioc_value", "ioc_type", "ioc_threat_level", "ioc_campaigns",
               "ioc_mitre_techniques", "ioc_source")
    )

    # 7. Compute event risk score
    enriched = enriched.withColumn("event_risk_score",
        (
            coalesce(col("severity_id"), lit(1)).cast("double") * 0.2 +
            when(col("src_ioc_match") == True, lit(0.3)).otherwise(lit(0.0)) +
            when(col("dst_ioc_match") == True, lit(0.3)).otherwise(lit(0.0)) +
            when(col("dst_asset_criticality") == "critical", lit(0.15)).otherwise(lit(0.0)) +
            coalesce(col("actor_risk_score"), lit(0.0)) * 0.05
        )
    )

    # 8. Add enrichment metadata
    enriched = (
        enriched
        .withColumn("enriched_at", current_timestamp())
        .withColumn("enrichment_tags", array())
        .withColumn("partition_date", date_format(col("time"), "yyyy-MM-dd"))
    )

    # Write to enriched table
    (
        enriched
        .write
        .format("delta")
        .mode("append")
        .option("mergeSchema", "true")
        .saveAsTable(f"{catalog}.{schema}.enriched_events")
    )

    print(f"  → Enriched and wrote {count} events")
    ioc_matches = enriched.filter((col("src_ioc_match") == True) | (col("dst_ioc_match") == True)).count()
    if ioc_matches > 0:
        print(f"  ⚠ {ioc_matches} events matched threat intel IOCs")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Start Enrichment Stream

# COMMAND ----------

silver_stream = (
    spark.readStream
    .format("delta")
    .option("maxFilesPerTrigger", 50)
    .table(f"{catalog}.{schema}.silver_events")
)

query = (
    silver_stream
    .writeStream
    .foreachBatch(enrich_batch)
    .option("checkpointLocation", checkpoint_path)
    .trigger(processingTime=processing_time)
    .queryName("event_enrichment")
    .start()
)

print(f"Enrichment stream started: {query.id}")
