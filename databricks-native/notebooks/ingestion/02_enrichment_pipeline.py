# Databricks notebook source
# MAGIC %md
# MAGIC # 02: Event Enrichment Pipeline (Production Streaming)
# MAGIC
# MAGIC Enriches raw Bronze events with contextual data:
# MAGIC - Asset registry (criticality, owner, department)
# MAGIC - IOC matching (threat intel correlation)
# MAGIC - User profile (risk level, department)
# MAGIC - GeoIP resolution (country, city, ASN)
# MAGIC - Threat scoring from reference data
# MAGIC
# MAGIC Uses foreachBatch to MERGE enrichments back into the events table.

# COMMAND ----------

# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

dbutils.widgets.text("trigger_interval", "30 seconds", "Trigger processing time")
dbutils.widgets.text("batch_size", "5000", "Max events per enrichment batch")
dbutils.widgets.text("enable_geoip", "true", "Enable GeoIP enrichment")

trigger_interval = dbutils.widgets.get("trigger_interval")
batch_size = int(dbutils.widgets.get("batch_size"))
enable_geoip = dbutils.widgets.get("enable_geoip").lower() == "true"

# COMMAND ----------

from pyspark.sql.functions import *
from pyspark.sql.types import *
import json

# COMMAND ----------

# MAGIC %md
# MAGIC ## Load Reference Data (Broadcast for Performance)

# COMMAND ----------

with mon.time("load_reference_data"):
    # IOC entries for threat matching
    ioc_df = (
        spark.table(get_table_path(cfg, "ioc_entries"))
        .filter(col("active") == True)
        .select(
            col("value").alias("ioc_value"),
            col("indicator_type").alias("ioc_type"),
            col("threat_type").alias("ioc_threat_type"),
            col("confidence").alias("ioc_confidence"),
            col("source_feed").alias("ioc_source"),
        )
        .cache()
    )

    # Asset registry
    asset_df = (
        spark.table(get_table_path(cfg, "asset_registry"))
        .select(
            col("ip_address").alias("asset_ip"),
            col("hostname").alias("asset_hostname"),
            col("asset_type"),
            col("criticality").alias("asset_criticality"),
            col("owner").alias("asset_owner"),
            col("department").alias("asset_department"),
            col("environment").alias("asset_environment"),
        )
        .cache()
    )

    # User profiles
    user_df = (
        spark.table(get_table_path(cfg, "user_profiles"))
        .select(
            col("id").alias("user_profile_id"),
            col("display_name").alias("user_display_name"),
            col("department").alias("user_department"),
            col("risk_level").alias("user_risk_level"),
            col("title").alias("user_title"),
        )
        .cache()
    )

    ioc_ip_df = ioc_df.filter(col("ioc_type") == "ip")
    ioc_domain_df = ioc_df.filter(col("ioc_type") == "domain")

    mon.log_info(
        f"Reference data loaded: {ioc_df.count()} IOCs, "
        f"{asset_df.count()} assets, {user_df.count()} users"
    )

# COMMAND ----------

# MAGIC %md
# MAGIC ## GeoIP Resolution
# MAGIC Uses MaxMind GeoLite2 database stored on a Volume, or falls back to
# MAGIC a simple ASN/country lookup table.

# COMMAND ----------

# GeoIP lookup table (lightweight alternative to MaxMind binary)
# This table should be populated by a separate job from MaxMind CSV exports
GEOIP_TABLE = get_table_path(cfg, "geoip_blocks")

geoip_available = False
try:
    geoip_df = (
        spark.table(GEOIP_TABLE)
        .select("network_start_int", "network_end_int", "country_code", "city", "asn", "org")
        .cache()
    )
    geoip_available = enable_geoip and geoip_df.count() > 0
    if geoip_available:
        mon.log_info(f"GeoIP data available: {geoip_df.count()} blocks")
except Exception:
    mon.log_warning("GeoIP table not available; geo enrichment disabled")
    geoip_available = False

# COMMAND ----------

# MAGIC %md
# MAGIC ## Enrichment Logic

# COMMAND ----------

def enrich_batch(batch_df, batch_id):
    """Enrich a micro-batch of events and MERGE back."""
    if batch_df.isEmpty():
        return

    batch_df.cache()
    event_count = batch_df.count()

    with mon.time(f"enrich_batch_{batch_id}"):
        # --- Asset Enrichment (join on source_ip) ---
        enriched = (
            batch_df
            .join(
                broadcast(asset_df),
                batch_df.source_ip == asset_df.asset_ip,
                "left"
            )
        )

        # --- User Enrichment (join on user_id) ---
        enriched = (
            enriched
            .join(
                broadcast(user_df),
                enriched.user_id == user_df.user_profile_id,
                "left"
            )
        )

        # --- IOC Matching on source_ip ---
        enriched = (
            enriched
            .join(
                broadcast(ioc_ip_df),
                enriched.source_ip == ioc_ip_df.ioc_value,
                "left"
            )
        )

        # --- GeoIP Enrichment ---
        if geoip_available:
            # Convert IP to integer for range lookup
            enriched = enriched.withColumn(
                "_ip_int",
                expr("""
                    CAST(split(source_ip, '\\\\.')[0] AS BIGINT) * 16777216 +
                    CAST(split(source_ip, '\\\\.')[1] AS BIGINT) * 65536 +
                    CAST(split(source_ip, '\\\\.')[2] AS BIGINT) * 256 +
                    CAST(split(source_ip, '\\\\.')[3] AS BIGINT)
                """)
            )
            enriched = (
                enriched
                .join(
                    broadcast(geoip_df),
                    (enriched._ip_int >= geoip_df.network_start_int) &
                    (enriched._ip_int <= geoip_df.network_end_int),
                    "left"
                )
                .drop("_ip_int", "network_start_int", "network_end_int")
            )
        else:
            enriched = (
                enriched
                .withColumn("country_code", lit(None).cast("string"))
                .withColumn("city", lit(None).cast("string"))
                .withColumn("asn", lit(None).cast("string"))
                .withColumn("org", lit(None).cast("string"))
            )

        # --- Build enrichments map ---
        enrichment_result = (
            enriched
            .select(
                col("id"),
                # Enrichments as a structured map
                map_from_arrays(
                    array(
                        lit("asset_criticality"), lit("asset_owner"),
                        lit("asset_department"), lit("asset_type"),
                        lit("user_risk_level"), lit("user_department"),
                        lit("ioc_match"), lit("ioc_confidence"),
                        lit("ioc_threat_type"), lit("ioc_source"),
                        lit("geo_country"), lit("geo_city"),
                        lit("geo_asn"), lit("geo_org"),
                    ),
                    array(
                        coalesce(col("asset_criticality"), lit("unknown")),
                        coalesce(col("asset_owner"), lit("unknown")),
                        coalesce(col("asset_department"), lit("unknown")),
                        coalesce(col("asset_type"), lit("unknown")),
                        coalesce(col("user_risk_level"), lit("unknown")),
                        coalesce(col("user_department"), lit("unknown")),
                        when(col("ioc_value").isNotNull(), lit("true")).otherwise(lit("false")),
                        coalesce(col("ioc_confidence").cast("string"), lit("0")),
                        coalesce(col("ioc_threat_type"), lit("none")),
                        coalesce(col("ioc_source"), lit("none")),
                        coalesce(col("country_code"), lit("unknown")),
                        coalesce(col("city"), lit("unknown")),
                        coalesce(col("asn"), lit("unknown")),
                        coalesce(col("org"), lit("unknown")),
                    ),
                ).alias("enrichments"),
                # Compute a risk multiplier based on enrichments
                (
                    when(col("ioc_value").isNotNull(), lit(50)).otherwise(lit(0)) +
                    when(col("asset_criticality") == "critical", lit(30))
                    .when(col("asset_criticality") == "high", lit(20))
                    .otherwise(lit(0)) +
                    when(col("user_risk_level") == "critical", lit(20))
                    .when(col("user_risk_level") == "high", lit(15))
                    .otherwise(lit(0))
                ).alias("enrichment_risk_score"),
                # GeoIP as a separate field
                struct(
                    coalesce(col("country_code"), lit("unknown")).alias("country"),
                    coalesce(col("city"), lit("unknown")).alias("city"),
                    lit(None).cast("double").alias("lat"),
                    lit(None).cast("double").alias("lon"),
                    coalesce(col("asn"), lit("unknown")).alias("asn"),
                ).alias("geo_location"),
            )
        )

        # --- MERGE enrichments back into events table ---
        enrichment_result.createOrReplaceTempView(f"_enrich_batch_{batch_id}")

        events_table = get_table_path(cfg, "events")
        spark.sql(f"""
            MERGE INTO {events_table} AS target
            USING _enrich_batch_{batch_id} AS source
            ON target.id = source.id
            WHEN MATCHED AND target.enrichments IS NULL THEN
                UPDATE SET
                    target.enrichments = source.enrichments,
                    target.enrichment_risk_score = source.enrichment_risk_score,
                    target.geo_location = source.geo_location
        """)

        spark.catalog.dropTempView(f"_enrich_batch_{batch_id}")
        mon.log_metric("enriched_events", event_count)

    batch_df.unpersist()

# COMMAND ----------

# MAGIC %md
# MAGIC ## Start Streaming Enrichment

# COMMAND ----------

# Read un-enriched events from the events table
events_stream = (
    spark.readStream
    .format("delta")
    .option("ignoreChanges", "true")
    .option("maxFilesPerTrigger", str(batch_size))
    .table(get_table_path(cfg, "events"))
    .filter(col("enrichments").isNull())
    .select("id", "source_ip", "dest_ip", "user_id", "hostname")
)

checkpoint_location = get_checkpoint_path(cfg, "enrichment_pipeline")

enrichment_query = (
    events_stream
    .writeStream
    .foreachBatch(enrich_batch)
    .option("checkpointLocation", checkpoint_location)
    .trigger(processingTime=trigger_interval)
    .queryName("0xdsi_enrichment")
    .start()
)

mon.log_info(
    f"Enrichment pipeline started: checkpoint={checkpoint_location}, "
    f"trigger={trigger_interval}, geoip={'enabled' if geoip_available else 'disabled'}"
)

# COMMAND ----------

try:
    enrichment_query.awaitTermination()
except Exception as e:
    mon.log_error(e, context="Enrichment pipeline terminated")
    raise
finally:
    mon.log_complete()
