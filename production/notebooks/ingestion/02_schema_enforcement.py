# Databricks notebook source
# MAGIC %md
# MAGIC # 02 - Schema Enforcement & OCSF Normalization (Silver Layer)
# MAGIC
# MAGIC Reads raw events from Bronze, applies schema detection, normalizes to OCSF
# MAGIC (Open Cybersecurity Schema Framework), and writes to Silver Delta tables.
# MAGIC
# MAGIC **Input:** `{catalog}.{schema}.bronze_events`
# MAGIC **Output:** `{catalog}.{schema}.silver_events` (normalized OCSF format)
# MAGIC **Quarantine:** `{catalog}.{schema}.quarantine_events` (failed validation)
# MAGIC
# MAGIC **OCSF Categories Supported:**
# MAGIC - 1: System Activity
# MAGIC - 2: Findings (Alerts/Detections)
# MAGIC - 3: Identity & Access Management
# MAGIC - 4: Network Activity
# MAGIC - 5: Discovery
# MAGIC - 6: Application Activity

# COMMAND ----------

# Parameters
dbutils.widgets.text("catalog", "main", "Unity Catalog name")
dbutils.widgets.text("schema", "security", "Schema name")
dbutils.widgets.text("checkpoint_path", "", "Checkpoint location")
dbutils.widgets.text("processing_time", "30 seconds", "Trigger interval")
dbutils.widgets.text("max_records_per_batch", "100000", "Max records per micro-batch")

catalog = dbutils.widgets.get("catalog")
schema = dbutils.widgets.get("schema")
checkpoint_path = dbutils.widgets.get("checkpoint_path") or f"/Volumes/{catalog}/{schema}/checkpoints/silver_normalize"
processing_time = dbutils.widgets.get("processing_time")
max_records = int(dbutils.widgets.get("max_records_per_batch"))

# COMMAND ----------

# MAGIC %md
# MAGIC ## OCSF Schema Definition

# COMMAND ----------

from pyspark.sql.types import (
    StructType, StructField, StringType, TimestampType,
    IntegerType, LongType, DoubleType, ArrayType, MapType, BooleanType
)

# Unified OCSF Silver schema
silver_schema = StructType([
    # Core OCSF fields
    StructField("event_id", StringType(), False),
    StructField("category_uid", IntegerType(), False),      # OCSF category
    StructField("class_uid", IntegerType(), False),         # OCSF class
    StructField("activity_id", IntegerType(), True),        # OCSF activity
    StructField("severity_id", IntegerType(), True),        # 0=Unknown, 1=Info, 2=Low, 3=Medium, 4=High, 5=Critical
    StructField("status_id", IntegerType(), True),          # 0=Unknown, 1=Success, 2=Failure
    StructField("type_name", StringType(), True),           # Human-readable event type

    # Temporal
    StructField("time", TimestampType(), False),            # Event time
    StructField("start_time", TimestampType(), True),
    StructField("end_time", TimestampType(), True),

    # Actor (who)
    StructField("actor_user_id", StringType(), True),
    StructField("actor_user_name", StringType(), True),
    StructField("actor_email", StringType(), True),
    StructField("actor_process_name", StringType(), True),
    StructField("actor_process_pid", LongType(), True),

    # Source (where from)
    StructField("src_ip", StringType(), True),
    StructField("src_port", IntegerType(), True),
    StructField("src_hostname", StringType(), True),
    StructField("src_geo_country", StringType(), True),
    StructField("src_geo_city", StringType(), True),

    # Destination (where to)
    StructField("dst_ip", StringType(), True),
    StructField("dst_port", IntegerType(), True),
    StructField("dst_hostname", StringType(), True),
    StructField("dst_geo_country", StringType(), True),

    # Network
    StructField("protocol", StringType(), True),
    StructField("bytes_in", LongType(), True),
    StructField("bytes_out", LongType(), True),
    StructField("packets_in", LongType(), True),
    StructField("packets_out", LongType(), True),
    StructField("duration_ms", LongType(), True),

    # Resource (what was accessed)
    StructField("resource_type", StringType(), True),
    StructField("resource_name", StringType(), True),
    StructField("resource_uid", StringType(), True),

    # Enrichment (added during normalization)
    StructField("mitre_technique_id", StringType(), True),
    StructField("mitre_tactic", StringType(), True),

    # Metadata
    StructField("source_name", StringType(), False),
    StructField("raw_event_id", StringType(), False),
    StructField("normalized_at", TimestampType(), False),
    StructField("normalization_version", StringType(), False),
    StructField("confidence", DoubleType(), True),
    StructField("tags", ArrayType(StringType()), True),
    StructField("unmapped_fields", MapType(StringType(), StringType()), True),

    # Partitioning
    StructField("partition_date", StringType(), False),
])

# COMMAND ----------

# MAGIC %md
# MAGIC ## Source-Specific Parsers

# COMMAND ----------

from pyspark.sql.functions import (
    col, from_json, get_json_object, when, lit, coalesce,
    current_timestamp, to_timestamp, regexp_extract, array,
    create_map, date_format, expr
)
import json

# Parser registry: source_name → parsing logic
# Each parser extracts fields from raw_event JSON into OCSF columns


def parse_generic_json(df):
    """Generic JSON parser — extracts common fields by convention."""
    return (
        df
        .withColumn("_parsed", from_json(col("raw_event"), "MAP<STRING, STRING>"))
        .withColumn("actor_user_id", coalesce(
            col("_parsed.user_id"), col("_parsed.userId"), col("_parsed.user"),
            col("_parsed.username"), col("_parsed.actor"),
        ))
        .withColumn("actor_user_name", coalesce(
            col("_parsed.user_name"), col("_parsed.userName"), col("_parsed.username"),
        ))
        .withColumn("src_ip", coalesce(
            col("_parsed.source_ip"), col("_parsed.sourceIp"), col("_parsed.src_ip"),
            col("_parsed.srcAddr"), col("_parsed.client_ip"), col("_parsed.remote_addr"),
        ))
        .withColumn("dst_ip", coalesce(
            col("_parsed.dest_ip"), col("_parsed.destIp"), col("_parsed.dst_ip"),
            col("_parsed.dstAddr"), col("_parsed.destination_ip"),
        ))
        .withColumn("src_port", coalesce(
            col("_parsed.source_port"), col("_parsed.srcPort"),
        ).cast("int"))
        .withColumn("dst_port", coalesce(
            col("_parsed.dest_port"), col("_parsed.dstPort"), col("_parsed.port"),
        ).cast("int"))
        .withColumn("protocol", coalesce(
            col("_parsed.protocol"), col("_parsed.proto"),
        ))
        .withColumn("type_name", coalesce(
            col("_parsed.event_type"), col("_parsed.eventType"), col("_parsed.type"),
            col("_parsed.action"), col("_parsed.eventName"),
        ))
        .withColumn("resource_name", coalesce(
            col("_parsed.resource"), col("_parsed.resource_name"),
            col("_parsed.object"), col("_parsed.file_path"),
        ))
        .withColumn("status_id", when(
            coalesce(col("_parsed.status"), col("_parsed.result"), col("_parsed.outcome"))
            .isin("success", "Success", "200", "allowed", "ALLOW"), lit(1)
        ).when(
            coalesce(col("_parsed.status"), col("_parsed.result"), col("_parsed.outcome"))
            .isin("failure", "Failure", "denied", "DENY", "blocked"), lit(2)
        ).otherwise(lit(0)))
        .withColumn("bytes_in", coalesce(
            col("_parsed.bytes_in"), col("_parsed.bytesIn"), col("_parsed.recv_bytes"),
        ).cast("long"))
        .withColumn("bytes_out", coalesce(
            col("_parsed.bytes_out"), col("_parsed.bytesOut"), col("_parsed.sent_bytes"),
        ).cast("long"))
        .drop("_parsed")
    )


def parse_cloudtrail(df):
    """AWS CloudTrail log parser."""
    return (
        df
        .withColumn("actor_user_id", get_json_object(col("raw_event"), "$.userIdentity.arn"))
        .withColumn("actor_user_name", get_json_object(col("raw_event"), "$.userIdentity.userName"))
        .withColumn("src_ip", get_json_object(col("raw_event"), "$.sourceIPAddress"))
        .withColumn("type_name", get_json_object(col("raw_event"), "$.eventName"))
        .withColumn("resource_name", get_json_object(col("raw_event"), "$.requestParameters.resourceArn"))
        .withColumn("resource_type", get_json_object(col("raw_event"), "$.eventSource"))
        .withColumn("category_uid", lit(6))  # Application Activity
        .withColumn("class_uid", lit(6001))  # API Activity
        .withColumn("status_id", when(
            get_json_object(col("raw_event"), "$.errorCode").isNotNull(), lit(2)
        ).otherwise(lit(1)))
        .withColumn("src_geo_country", lit(None).cast("string"))
        .withColumn("dst_ip", lit(None).cast("string"))
        .withColumn("dst_port", lit(None).cast("int"))
        .withColumn("src_port", lit(None).cast("int"))
        .withColumn("protocol", lit("https"))
        .withColumn("bytes_in", lit(None).cast("long"))
        .withColumn("bytes_out", lit(None).cast("long"))
    )


def parse_vpc_flow_logs(df):
    """AWS VPC Flow Log parser."""
    return (
        df
        .withColumn("src_ip", get_json_object(col("raw_event"), "$.srcAddr"))
        .withColumn("dst_ip", get_json_object(col("raw_event"), "$.dstAddr"))
        .withColumn("src_port", get_json_object(col("raw_event"), "$.srcPort").cast("int"))
        .withColumn("dst_port", get_json_object(col("raw_event"), "$.dstPort").cast("int"))
        .withColumn("protocol", get_json_object(col("raw_event"), "$.protocol"))
        .withColumn("bytes_in", get_json_object(col("raw_event"), "$.bytes").cast("long"))
        .withColumn("packets_in", get_json_object(col("raw_event"), "$.packets").cast("long"))
        .withColumn("category_uid", lit(4))  # Network Activity
        .withColumn("class_uid", lit(4001))  # Network Activity
        .withColumn("status_id", when(
            get_json_object(col("raw_event"), "$.action") == "ACCEPT", lit(1)
        ).otherwise(lit(2)))
        .withColumn("type_name", lit("network_flow"))
        .withColumn("actor_user_id", lit(None).cast("string"))
        .withColumn("actor_user_name", lit(None).cast("string"))
        .withColumn("resource_name", get_json_object(col("raw_event"), "$.interface_id"))
        .withColumn("bytes_out", lit(None).cast("long"))
    )


def parse_crowdstrike(df):
    """CrowdStrike Falcon event parser."""
    return (
        df
        .withColumn("actor_user_id", get_json_object(col("raw_event"), "$.UserName"))
        .withColumn("actor_user_name", get_json_object(col("raw_event"), "$.UserName"))
        .withColumn("actor_process_name", get_json_object(col("raw_event"), "$.FileName"))
        .withColumn("actor_process_pid", get_json_object(col("raw_event"), "$.ProcessId").cast("long"))
        .withColumn("src_ip", get_json_object(col("raw_event"), "$.LocalIP"))
        .withColumn("dst_ip", get_json_object(col("raw_event"), "$.RemoteIP"))
        .withColumn("dst_port", get_json_object(col("raw_event"), "$.RemotePort").cast("int"))
        .withColumn("type_name", get_json_object(col("raw_event"), "$.DetectName"))
        .withColumn("category_uid", lit(2))  # Findings
        .withColumn("class_uid", lit(2001))  # Security Finding
        .withColumn("severity_id", when(
            get_json_object(col("raw_event"), "$.Severity").isin("5", "Critical"), lit(5)
        ).when(
            get_json_object(col("raw_event"), "$.Severity").isin("4", "High"), lit(4)
        ).when(
            get_json_object(col("raw_event"), "$.Severity").isin("3", "Medium"), lit(3)
        ).otherwise(lit(2)))
        .withColumn("src_hostname", get_json_object(col("raw_event"), "$.ComputerName"))
        .withColumn("status_id", lit(1))
        .withColumn("src_port", lit(None).cast("int"))
        .withColumn("protocol", lit(None).cast("string"))
        .withColumn("bytes_in", lit(None).cast("long"))
        .withColumn("bytes_out", lit(None).cast("long"))
        .withColumn("resource_name", get_json_object(col("raw_event"), "$.FileName"))
    )


# Parser dispatch table
PARSERS = {
    "cloudtrail": parse_cloudtrail,
    "vpc_flow_logs": parse_vpc_flow_logs,
    "crowdstrike": parse_crowdstrike,
    "generic": parse_generic_json,
}

# COMMAND ----------

# MAGIC %md
# MAGIC ## Severity Classification

# COMMAND ----------

def classify_severity(df):
    """Assign OCSF severity_id if not already set by parser."""
    return df.withColumn("severity_id", coalesce(
        col("severity_id"),
        when(col("type_name").rlike("(?i)(critical|emergency|breach)"), lit(5)),
        when(col("type_name").rlike("(?i)(high|alert|intrusion|malware)"), lit(4)),
        when(col("type_name").rlike("(?i)(medium|warning|suspicious)"), lit(3)),
        when(col("type_name").rlike("(?i)(low|notice|info)"), lit(2)),
        lit(1),  # Informational by default
    ))


def classify_category(df):
    """Assign OCSF category_uid if not already set by parser."""
    return df.withColumn("category_uid", coalesce(
        col("category_uid"),
        when(col("type_name").rlike("(?i)(auth|login|logout|session|password)"), lit(3)),
        when(col("type_name").rlike("(?i)(network|connection|flow|dns|http)"), lit(4)),
        when(col("type_name").rlike("(?i)(file|process|registry|service)"), lit(1)),
        when(col("type_name").rlike("(?i)(alert|detection|finding|threat)"), lit(2)),
        when(col("type_name").rlike("(?i)(api|application|request)"), lit(6)),
        lit(1),  # System Activity by default
    )).withColumn("class_uid", coalesce(
        col("class_uid"),
        (col("category_uid") * 1000 + lit(1)),  # Default class within category
    ))

# COMMAND ----------

# MAGIC %md
# MAGIC ## Streaming Normalization Pipeline

# COMMAND ----------

# Read from bronze
bronze_stream = (
    spark.readStream
    .format("delta")
    .option("maxFilesPerTrigger", 100)
    .table(f"{catalog}.{schema}.bronze_events")
)

# COMMAND ----------

def normalize_batch(batch_df, batch_id):
    """Process each micro-batch: parse, normalize, validate, write."""
    if batch_df.isEmpty():
        return

    record_count = batch_df.count()
    print(f"Batch {batch_id}: Processing {record_count} events")

    # Get distinct sources in this batch
    sources = [row.source_name for row in batch_df.select("source_name").distinct().collect()]

    normalized_frames = []
    quarantine_frames = []

    for src in sources:
        source_df = batch_df.filter(col("source_name") == src)
        parser = PARSERS.get(src, PARSERS["generic"])

        try:
            parsed = parser(source_df)
            parsed = classify_severity(parsed)
            parsed = classify_category(parsed)

            # Add standard metadata
            parsed = (
                parsed
                .withColumn("normalized_at", current_timestamp())
                .withColumn("normalization_version", lit("2.0.0"))
                .withColumn("raw_event_id", col("event_id"))
                .withColumn("time", coalesce(col("event_timestamp"), col("ingest_timestamp")))
                .withColumn("partition_date", date_format(col("time"), "yyyy-MM-dd"))
                .withColumn("confidence", lit(1.0))
                .withColumn("tags", array())
                .withColumn("unmapped_fields", lit(None).cast("map<string,string>"))
            )

            # Validate required fields
            valid = parsed.filter(
                col("event_id").isNotNull() &
                col("time").isNotNull() &
                col("source_name").isNotNull()
            )
            invalid = parsed.filter(
                col("event_id").isNull() |
                col("time").isNull() |
                col("source_name").isNull()
            )

            normalized_frames.append(valid)
            if invalid.count() > 0:
                quarantine_frames.append(invalid)

        except Exception as e:
            print(f"Parser failed for source {src}: {e}")
            quarantine_frames.append(
                source_df.withColumn("quarantine_reason", lit(f"Parser error: {str(e)[:200]}"))
            )

    # Write normalized events to Silver
    if normalized_frames:
        from functools import reduce
        silver_df = reduce(lambda a, b: a.unionByName(b, allowMissingColumns=True), normalized_frames)

        # Select only silver schema columns
        silver_columns = [f.name for f in silver_schema.fields]
        available = [c for c in silver_columns if c in silver_df.columns]

        (
            silver_df
            .select(*available)
            .write
            .format("delta")
            .mode("append")
            .option("mergeSchema", "true")
            .saveAsTable(f"{catalog}.{schema}.silver_events")
        )
        print(f"  → Wrote {silver_df.count()} events to silver")

    # Write quarantined events
    if quarantine_frames:
        from functools import reduce
        quarantine_df = reduce(lambda a, b: a.unionByName(b, allowMissingColumns=True), quarantine_frames)
        (
            quarantine_df
            .withColumn("quarantine_timestamp", current_timestamp())
            .withColumn("quarantine_batch_id", lit(str(batch_id)))
            .write
            .format("delta")
            .mode("append")
            .option("mergeSchema", "true")
            .saveAsTable(f"{catalog}.{schema}.quarantine_events")
        )
        print(f"  → Quarantined {quarantine_df.count()} events")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Create Silver Table

# COMMAND ----------

spark.sql(f"""
    CREATE TABLE IF NOT EXISTS {catalog}.{schema}.silver_events (
        event_id STRING NOT NULL,
        category_uid INT NOT NULL,
        class_uid INT NOT NULL,
        activity_id INT,
        severity_id INT,
        status_id INT,
        type_name STRING,
        time TIMESTAMP NOT NULL,
        start_time TIMESTAMP,
        end_time TIMESTAMP,
        actor_user_id STRING,
        actor_user_name STRING,
        actor_email STRING,
        actor_process_name STRING,
        actor_process_pid BIGINT,
        src_ip STRING,
        src_port INT,
        src_hostname STRING,
        src_geo_country STRING,
        src_geo_city STRING,
        dst_ip STRING,
        dst_port INT,
        dst_hostname STRING,
        dst_geo_country STRING,
        protocol STRING,
        bytes_in BIGINT,
        bytes_out BIGINT,
        packets_in BIGINT,
        packets_out BIGINT,
        duration_ms BIGINT,
        resource_type STRING,
        resource_name STRING,
        resource_uid STRING,
        mitre_technique_id STRING,
        mitre_tactic STRING,
        source_name STRING NOT NULL,
        raw_event_id STRING NOT NULL,
        normalized_at TIMESTAMP NOT NULL,
        normalization_version STRING NOT NULL,
        confidence DOUBLE,
        tags ARRAY<STRING>,
        unmapped_fields MAP<STRING, STRING>,
        partition_date STRING NOT NULL
    )
    USING DELTA
    PARTITIONED BY (partition_date, source_name)
    TBLPROPERTIES (
        'delta.autoOptimize.optimizeWrite' = 'true',
        'delta.autoOptimize.autoCompact' = 'true'
    )
""")

spark.sql(f"""
    CREATE TABLE IF NOT EXISTS {catalog}.{schema}.quarantine_events (
        event_id STRING,
        raw_event STRING,
        source_name STRING,
        quarantine_reason STRING,
        quarantine_timestamp TIMESTAMP,
        quarantine_batch_id STRING
    )
    USING DELTA
    TBLPROPERTIES ('delta.autoOptimize.optimizeWrite' = 'true')
""")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Start Streaming

# COMMAND ----------

query = (
    bronze_stream
    .writeStream
    .foreachBatch(normalize_batch)
    .option("checkpointLocation", checkpoint_path)
    .trigger(processingTime=processing_time)
    .queryName("silver_normalization")
    .start()
)

print(f"Silver normalization stream started: {query.id}")
