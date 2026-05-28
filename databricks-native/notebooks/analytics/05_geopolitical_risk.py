# Databricks notebook source
# MAGIC %md
# MAGIC # Analytics - Geopolitical Risk Correlation
# MAGIC
# MAGIC Correlates geopolitical events with cyber threat posture:
# MAGIC - Ingests geopolitical event feeds (armed conflicts, sanctions, disasters)
# MAGIC - Maps events to organization exposure zones (offices, DCs, suppliers)
# MAGIC - Computes exposure scores based on proximity and criticality
# MAGIC - Correlates geopolitical activity spikes with cyber attack patterns
# MAGIC
# MAGIC Outputs: geopolitical_events, geopolitical_fetch_runs, cyber_geo_correlations

# COMMAND ----------

# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

import json
import uuid
import math
from datetime import datetime, timedelta
from pyspark.sql import functions as F
from pyspark.sql.types import (
    StructType, StructField, StringType, DoubleType,
    TimestampType, IntegerType, BooleanType,
)

# COMMAND ----------

dbutils.widgets.text("correlation_window_hours", "72", "Window for geo-cyber correlation (hours)")
dbutils.widgets.text("proximity_radius_km", "500", "Max proximity radius for exposure scoring (km)")

correlation_window_hours = int(dbutils.widgets.get("correlation_window_hours"))
proximity_radius_km = int(dbutils.widgets.get("proximity_radius_km"))

# COMMAND ----------

try:
    result = {"notebook": "05_geopolitical_risk", "status": "success", "started_at": datetime.utcnow().isoformat()}
    fetch_run_id = str(uuid.uuid4())

    # --- Load Geopolitical Events ---
    with mon.time("load_geo_events"):
        geo_events_df = spark.sql(f"""
            SELECT id, title, category, severity, lat, lon, country,
                   source_feed, event_timestamp, description
            FROM {cfg.get_table_path("geopolitical_events")}
            WHERE event_timestamp > current_timestamp() - INTERVAL {correlation_window_hours} HOURS
        """)
        geo_event_count = geo_events_df.count()
        mon.log_metric("geo_events_loaded", geo_event_count)

    # --- Load Exposure Zones ---
    with mon.time("load_exposure_zones"):
        zones_df = spark.sql(f"""
            SELECT id, name, asset_type, criticality, lat, lon,
                   radius_km, headcount, revenue_share_pct
            FROM {cfg.get_table_path("acmeco_exposure_zones")}
        """)
        zone_count = zones_df.count()
        mon.log_metric("exposure_zones", zone_count)

    # --- Compute Proximity-Based Exposure Scores ---
    with mon.time("exposure_scoring"):
        # Haversine distance UDF via cross join and formula
        exposure_scores = (
            geo_events_df.alias("e")
            .crossJoin(zones_df.alias("z"))
            .withColumn("dlat",
                F.radians(F.col("z.lat") - F.col("e.lat")))
            .withColumn("dlon",
                F.radians(F.col("z.lon") - F.col("e.lon")))
            .withColumn("a",
                F.sin(F.col("dlat") / 2) ** 2
                + F.cos(F.radians(F.col("e.lat")))
                * F.cos(F.radians(F.col("z.lat")))
                * F.sin(F.col("dlon") / 2) ** 2)
            .withColumn("distance_km",
                2 * 6371 * F.asin(F.sqrt(F.col("a"))))
            .filter(F.col("distance_km") <= proximity_radius_km)
            .withColumn("proximity_score",
                1.0 - (F.col("distance_km") / proximity_radius_km))
            .withColumn("exposure_score",
                F.col("proximity_score")
                * F.col("e.severity")
                * F.col("z.criticality")
                * (1 + F.col("z.revenue_share_pct") / 100.0)
            )
            .select(
                F.col("e.id").alias("geo_event_id"),
                F.col("z.id").alias("zone_id"),
                F.col("z.name").alias("zone_name"),
                F.col("z.asset_type"),
                "distance_km",
                "proximity_score",
                "exposure_score",
                F.col("e.category").alias("event_category"),
                F.col("e.severity").alias("event_severity"),
            )
        )

        high_exposure = exposure_scores.filter(F.col("exposure_score") > 5.0)
        high_exposure_count = high_exposure.count()
        mon.log_metric("high_exposure_pairs", high_exposure_count)

    # --- Correlate with Cyber Attacks ---
    with mon.time("cyber_geo_correlation"):
        # Load recent cyber alerts
        cyber_alerts = spark.sql(f"""
            SELECT id, title, severity, source_ip, mitre_tactic,
                   confidence_score, created_at, geo_country
            FROM {cfg.get_table_path("alerts")}
            WHERE created_at > current_timestamp() - INTERVAL {correlation_window_hours} HOURS
              AND severity IN ('high', 'critical')
        """)
        cyber_alert_count = cyber_alerts.count()

        # Correlate: geo events in same country/region as cyber attacks
        correlations = (
            geo_events_df.alias("g")
            .join(
                cyber_alerts.alias("c"),
                F.col("g.country") == F.col("c.geo_country"),
                "inner",
            )
            .filter(
                F.abs(F.unix_timestamp(F.col("c.created_at")) - F.unix_timestamp(F.col("g.event_timestamp"))) < correlation_window_hours * 3600
            )
            .withColumn("time_delta_hours",
                F.abs(F.unix_timestamp(F.col("c.created_at")) - F.unix_timestamp(F.col("g.event_timestamp"))) / 3600)
            .withColumn("correlation_strength",
                F.when(F.col("time_delta_hours") < 6, 0.9)
                .when(F.col("time_delta_hours") < 24, 0.7)
                .when(F.col("time_delta_hours") < 48, 0.5)
                .otherwise(0.3)
            )
            .select(
                F.lit(str(uuid.uuid4())).alias("id"),
                F.col("g.id").alias("geo_event_id"),
                F.col("c.id").alias("alert_id"),
                F.col("g.category").alias("geo_category"),
                F.col("c.mitre_tactic"),
                F.col("g.country"),
                "time_delta_hours",
                "correlation_strength",
                F.col("g.severity").alias("geo_severity"),
                F.col("c.severity").alias("cyber_severity"),
                F.current_timestamp().alias("correlated_at"),
            )
        )

        correlation_count = correlations.count()
        mon.log_metric("geo_cyber_correlations", correlation_count)

    # --- Persist Results ---
    with mon.time("persist_results"):
        # Fetch run audit record
        fetch_run_data = [{
            "id": fetch_run_id,
            "feed": "databricks_analytics",
            "status": "completed",
            "events_ingested": geo_event_count,
            "duration_ms": 0,
            "error": None,
            "created_at": datetime.utcnow(),
        }]
        fetch_run_df = spark.createDataFrame(fetch_run_data)
        safe_append(fetch_run_df, "geopolitical_fetch_runs", catalog=cfg.catalog, schema=cfg.schema)

        # Cyber-geo correlations
        if correlation_count > 0:
            safe_append(correlations, "cyber_geo_correlations", catalog=cfg.catalog, schema=cfg.schema)

        # Update exposure scores on geo events (write aggregated view)
        if high_exposure_count > 0:
            exposure_summary = (
                exposure_scores
                .groupBy("geo_event_id")
                .agg(
                    F.max("exposure_score").alias("max_exposure_score"),
                    F.count("*").alias("zones_affected"),
                    F.collect_set("zone_name").alias("affected_zones"),
                )
            )
            exposure_summary.write.mode("overwrite").saveAsTable(
                cfg.get_table_path("geo_event_exposure_summary")
            )

        mon.log_info(f"Geo risk: {geo_event_count} events, {high_exposure_count} high-exposure, {correlation_count} correlations")

    # --- Finalize ---
    result.update({
        "geo_events_analyzed": geo_event_count,
        "exposure_zones": zone_count,
        "high_exposure_pairs": high_exposure_count,
        "cyber_alerts_in_window": cyber_alert_count,
        "geo_cyber_correlations": correlation_count,
        "correlation_window_hours": correlation_window_hours,
        "completed_at": datetime.utcnow().isoformat(),
    })
    mon.log_complete(rows_processed=geo_event_count)

except Exception as e:
    result = {
        "notebook": "05_geopolitical_risk",
        "status": "error",
        "error": str(e)[:500],
        "error_type": type(e).__name__,
        "failed_at": datetime.utcnow().isoformat(),
    }
    mon.log_error(e, context="geopolitical_risk")
    raise

finally:
    print(json.dumps(result, indent=2))
    dbutils.notebook.exit(json.dumps(result))
