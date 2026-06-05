# Databricks notebook source
# MAGIC %md
# MAGIC # Attack Universe Real-Time Intelligence Pipeline
# MAGIC Delta Live Tables pipeline that continuously processes security events into the
# MAGIC domain health metrics, attack flow statistics, and real-time intercepts consumed
# MAGIC by the Attack Universe 3D visualization.
# MAGIC
# MAGIC ## Pipeline Layers:
# MAGIC - **Bronze**: Raw events from SIEM, EDR, IAM, Cloud, DLP
# MAGIC - **Silver**: Normalized events with domain classification and MITRE mapping
# MAGIC - **Gold**: Aggregated domain health, flow metrics, intercepts, and predictions
# MAGIC
# MAGIC ## Outputs (consumed by Attack Universe frontend):
# MAGIC - `gold_domain_health` - Real-time health/pressure per security domain
# MAGIC - `gold_attack_flows` - Cross-domain attack flow statistics
# MAGIC - `gold_scene_intercepts` - Live event intercepts for the HUD overlay
# MAGIC - `gold_threat_forecasts` - Monte Carlo prediction results
# MAGIC - `gold_attack_path_predictions` - Combined forecast + vector similarity predictions

# COMMAND ----------

# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

import dlt
from pyspark.sql import functions as F
from pyspark.sql.window import Window
from datetime import datetime, timezone

# COMMAND ----------

# MAGIC %md
# MAGIC ## Bronze Layer - Raw Event Ingestion

# COMMAND ----------

@dlt.table(
    name="bronze_security_events_universe",
    comment="Raw security events for Attack Universe consumption",
    table_properties={"quality": "bronze", "pipelines.autoOptimize.managed": "true"},
)
def bronze_security_events():
    """Stream raw events from the main event ingestion."""
    return (
        spark.readStream
        .format("delta")
        .table(f"{cfg.catalog}.{cfg.schema}.bronze_events")
        .select(
            "event_id",
            "event_type",
            "source_ip",
            "destination_ip",
            "source_domain",
            "target_domain",
            "severity",
            "mitre_tactic",
            "mitre_technique",
            "timestamp",
            "raw_payload",
        )
    )

# COMMAND ----------

# MAGIC %md
# MAGIC ## Silver Layer - Domain Classification & Normalization

# COMMAND ----------

DOMAIN_CLASSIFICATION_RULES = {
    "identity": ["authentication", "credential", "kerberos", "oauth", "saml", "ldap", "mfa", "sso"],
    "endpoint": ["process", "file", "registry", "driver", "memory", "edr", "agent"],
    "network": ["dns", "http", "tcp", "udp", "firewall", "proxy", "vpn", "packet"],
    "application": ["api", "webapp", "service", "container", "serverless", "microservice"],
    "cloud": ["aws", "azure", "gcp", "s3", "blob", "iam_cloud", "lambda", "function"],
    "data": ["database", "storage", "dlp", "encryption", "backup", "exfiltration"],
    "physical": ["badge", "camera", "cctv", "access_control", "biometric"],
}

@dlt.table(
    name="silver_domain_classified_events",
    comment="Events classified by security domain with MITRE mapping",
    table_properties={"quality": "silver"},
)
@dlt.expect_or_drop("valid_domain", "classified_domain IS NOT NULL")
def silver_domain_classified():
    """Classify events into security domains and normalize severity."""
    bronze = dlt.read_stream("bronze_security_events_universe")

    # Domain classification UDF
    domain_expr = F.when(F.lit(False), F.lit(""))
    for domain, keywords in DOMAIN_CLASSIFICATION_RULES.items():
        condition = F.lit(False)
        for kw in keywords:
            condition = condition | F.lower(F.col("event_type")).contains(kw) | \
                       F.lower(F.coalesce(F.col("source_domain"), F.lit(""))).contains(kw)
        domain_expr = domain_expr.when(condition, F.lit(domain))
    domain_expr = domain_expr.otherwise(F.coalesce(F.col("source_domain"), F.lit("network")))

    # Severity normalization (0-100 scale)
    severity_expr = (
        F.when(F.col("severity") == "critical", F.lit(95))
        .when(F.col("severity") == "high", F.lit(75))
        .when(F.col("severity") == "medium", F.lit(50))
        .when(F.col("severity") == "low", F.lit(25))
        .otherwise(F.lit(10))
    )

    return (
        bronze
        .withColumn("classified_domain", domain_expr)
        .withColumn("target_classified_domain",
                    F.coalesce(F.col("target_domain"), F.col("classified_domain")))
        .withColumn("severity_score", severity_expr)
        .withColumn("processing_time", F.current_timestamp())
    )

# COMMAND ----------

# MAGIC %md
# MAGIC ## Gold Layer - Domain Health Aggregation

# COMMAND ----------

@dlt.table(
    name="gold_domain_health",
    comment="Real-time domain health and pressure metrics for Attack Universe",
    table_properties={"quality": "gold", "pipelines.autoOptimize.managed": "true"},
)
def gold_domain_health():
    """
    Aggregate per-domain health and pressure scores.
    Health = inverse of severity-weighted event rate.
    Pressure = normalized alert volume and velocity.
    """
    silver = dlt.read("silver_domain_classified_events")

    # Window for time-based aggregation (last hour)
    recent_window = F.col("timestamp") > F.expr("current_timestamp() - INTERVAL 1 HOUR")

    domain_stats = (
        silver
        .filter(recent_window)
        .groupBy("classified_domain")
        .agg(
            F.count("*").alias("event_count"),
            F.avg("severity_score").alias("avg_severity"),
            F.max("severity_score").alias("max_severity"),
            F.countDistinct("source_ip").alias("unique_sources"),
            F.sum(F.when(F.col("severity") == "critical", 1).otherwise(0)).alias("critical_count"),
            F.max("timestamp").alias("last_event_time"),
        )
    )

    # Calculate health and pressure scores
    return (
        domain_stats
        .withColumn("domain_name", F.col("classified_domain"))
        .withColumn(
            "health_score",
            F.greatest(
                F.lit(0),
                F.lit(100) - (F.col("avg_severity") * 0.5 + F.col("critical_count") * 5)
            ).cast("int")
        )
        .withColumn(
            "pressure_score",
            F.least(
                F.lit(100),
                (F.col("event_count") / F.lit(10) + F.col("unique_sources") * 2 + F.col("critical_count") * 10)
            ).cast("int")
        )
        .withColumn("active_alerts", F.col("critical_count") + (F.col("event_count") / F.lit(5)).cast("int"))
        .withColumn("last_incident_time", F.col("last_event_time"))
        .withColumn("updated_at", F.current_timestamp())
        .select(
            "domain_name", "health_score", "pressure_score",
            "active_alerts", "event_count", "avg_severity",
            "unique_sources", "last_incident_time", "updated_at",
        )
    )

# COMMAND ----------

# MAGIC %md
# MAGIC ## Gold Layer - Cross-Domain Attack Flows

# COMMAND ----------

@dlt.table(
    name="gold_attack_flows",
    comment="Cross-domain attack flow statistics for 3D particle visualization",
    table_properties={"quality": "gold"},
)
def gold_attack_flows():
    """
    Track cross-domain transitions (attack flows between security domains).
    These feed the particle flows between domain spheres in the 3D universe.
    """
    silver = dlt.read("silver_domain_classified_events")

    # Only cross-domain events
    cross_domain = silver.filter(
        F.col("classified_domain") != F.col("target_classified_domain")
    )

    return (
        cross_domain
        .groupBy("classified_domain", "target_classified_domain")
        .agg(
            F.count("*").alias("flow_count"),
            F.avg("severity_score").alias("avg_flow_severity"),
            F.max("severity_score").alias("max_flow_severity"),
            F.max("timestamp").alias("last_flow_time"),
            F.collect_set("mitre_technique").alias("techniques_observed"),
            F.first("event_type").alias("primary_event_type"),
        )
        .withColumn("from_domain", F.col("classified_domain"))
        .withColumn("to_domain", F.col("target_classified_domain"))
        .withColumn("flow_label",
            F.concat(
                F.col("primary_event_type"), F.lit(" ("),
                F.col("from_domain"), F.lit(" -> "), F.col("to_domain"), F.lit(")")
            )
        )
        .withColumn("flow_intensity",
            F.least(F.lit(1.0), F.col("flow_count") / F.lit(100)))
        .withColumn("updated_at", F.current_timestamp())
        .select(
            "from_domain", "to_domain", "flow_label", "flow_count",
            "avg_flow_severity", "max_flow_severity", "flow_intensity",
            "techniques_observed", "last_flow_time", "updated_at",
        )
    )

# COMMAND ----------

# MAGIC %md
# MAGIC ## Gold Layer - Scene Intercepts (Live HUD Events)

# COMMAND ----------

@dlt.table(
    name="gold_scene_intercepts",
    comment="Real-time high-severity events for the Attack Universe Scene Intercepts HUD",
    table_properties={"quality": "gold", "pipelines.autoOptimize.managed": "true"},
)
def gold_scene_intercepts():
    """
    Surface the most critical real-time events as "scene intercepts"
    displayed below the 3D universe visualization.
    Only critical/high severity events from the last 5 minutes.
    """
    silver = dlt.read_stream("silver_domain_classified_events")

    return (
        silver
        .filter(F.col("severity_score") >= 70)
        .filter(F.col("timestamp") > F.expr("current_timestamp() - INTERVAL 5 MINUTES"))
        .withColumn("intercept_id", F.expr("uuid()"))
        .withColumn("display_time", F.date_format(F.col("timestamp"), "HH:mm:ss"))
        .withColumn("event_label",
            F.concat(
                F.upper(F.col("event_type")), F.lit(" | "),
                F.col("source_ip"), F.lit(" -> "), F.col("destination_ip")
            )
        )
        .withColumn("severity_label",
            F.when(F.col("severity_score") >= 90, F.lit("CRITICAL"))
            .otherwise(F.lit("HIGH"))
        )
        .select(
            "intercept_id", "display_time", "event_type", "event_label",
            "source_ip", "destination_ip", "classified_domain",
            "severity_label", "severity_score", "mitre_technique", "timestamp",
        )
        .orderBy(F.col("timestamp").desc())
        .limit(20)
    )

# COMMAND ----------

# MAGIC %md
# MAGIC ## Gold Layer - Voice Command Log

# COMMAND ----------

@dlt.table(
    name="gold_voice_commands",
    comment="Logged voice commands from the Attack Universe speech interface",
    table_properties={"quality": "gold"},
)
def gold_voice_commands():
    """Track voice commands issued through the Attack Universe interface."""
    return (
        spark.readStream
        .format("delta")
        .option("ignoreChanges", "true")
        .table(f"{cfg.catalog}.{cfg.schema}.bronze_voice_commands")
        .select(
            "command_id",
            "transcript",
            "intent_classified",
            "confidence",
            "user_id",
            "session_id",
            "timestamp",
        )
        .filter(F.col("confidence") > 0.6)
    )

# COMMAND ----------

# MAGIC %md
# MAGIC ## Gold Layer - Hand Tracking Analytics

# COMMAND ----------

@dlt.table(
    name="gold_gesture_analytics",
    comment="Aggregated hand gesture analytics from the 3D universe interface",
    table_properties={"quality": "gold"},
)
def gold_gesture_analytics():
    """Track gesture usage patterns for UX optimization."""
    try:
        return (
            spark.read
            .format("delta")
            .table(f"{cfg.catalog}.{cfg.schema}.bronze_gesture_events")
            .groupBy("gesture_type", F.window("timestamp", "1 hour"))
            .agg(
                F.count("*").alias("gesture_count"),
                F.avg("duration_ms").alias("avg_duration_ms"),
                F.countDistinct("user_id").alias("unique_users"),
            )
            .select(
                "gesture_type",
                F.col("window.start").alias("window_start"),
                "gesture_count",
                "avg_duration_ms",
                "unique_users",
            )
        )
    except Exception:
        # Table may not exist yet - return empty schema
        from pyspark.sql.types import StructType, StructField, StringType, LongType, DoubleType, TimestampType
        schema = StructType([
            StructField("gesture_type", StringType()),
            StructField("window_start", TimestampType()),
            StructField("gesture_count", LongType()),
            StructField("avg_duration_ms", DoubleType()),
            StructField("unique_users", LongType()),
        ])
        return spark.createDataFrame([], schema)
