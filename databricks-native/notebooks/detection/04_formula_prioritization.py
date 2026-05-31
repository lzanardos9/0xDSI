# Databricks notebook source
# MAGIC %md
# MAGIC # Formula-Based Priority Scoring Engine
# MAGIC
# MAGIC Computes entity-level priority scores using a deterministic weighted formula
# MAGIC across multiple risk dimensions. Produces `formula_priority_scores` consumed
# MAGIC by Detection Confluence (Lens 6/7).
# MAGIC
# MAGIC **Why a formula lens alongside ML models?**
# MAGIC - ML models (KMeans, Isolation Forest) detect unknown-unknowns
# MAGIC - Formula scoring catches known-knowns: high-value assets under attack,
# MAGIC   critical users with access to sensitive data, entities with active IOC matches
# MAGIC - Deterministic scoring is auditable, explainable, and does not drift
# MAGIC - Provides a stable anchor for the Bayesian fusion in Confluence
# MAGIC
# MAGIC **Scoring Dimensions (8):**
# MAGIC 1. Alert severity volume (critical/high alerts in window)
# MAGIC 2. Asset criticality (from asset registry)
# MAGIC 3. User privilege level (admin/service accounts score higher)
# MAGIC 4. IOC match count (active threat intel hits)
# MAGIC 5. Correlation rule match count (CEP patterns fired)
# MAGIC 6. Threat campaign association (linked to known APT campaigns)
# MAGIC 7. Temporal anomaly (activity outside business hours, weekends)
# MAGIC 8. Blast radius (number of connected entities in graph)
# MAGIC
# MAGIC **Formula:**
# MAGIC ```
# MAGIC score = SUM(dimension_score * dimension_weight) * velocity_multiplier
# MAGIC ```
# MAGIC
# MAGIC The velocity multiplier accounts for score acceleration:
# MAGIC entities whose risk is INCREASING get boosted.

# COMMAND ----------

# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

# MAGIC %md
# MAGIC ## Configuration

# COMMAND ----------

dbutils.widgets.text("lookback_minutes", "30", "Scoring window in minutes")
dbutils.widgets.text("min_score_threshold", "70", "Minimum score to persist (0-100)")
dbutils.widgets.text("velocity_window_hours", "6", "Hours for velocity calculation")
dbutils.widgets.text("max_entities", "2000", "Max entities to score per run")

lookback_minutes = int(dbutils.widgets.get("lookback_minutes"))
min_score_threshold = int(dbutils.widgets.get("min_score_threshold"))
velocity_window_hours = int(dbutils.widgets.get("velocity_window_hours"))
max_entities = int(dbutils.widgets.get("max_entities"))

require_tables("alerts", "events", "asset_registry")

mon.log_event("config_loaded", {
    "lookback_minutes": lookback_minutes,
    "min_score_threshold": min_score_threshold,
    "velocity_window_hours": velocity_window_hours,
    "max_entities": max_entities,
})

# COMMAND ----------

from pyspark.sql.functions import *
from pyspark.sql.types import *
from datetime import datetime, timedelta
import json

# COMMAND ----------

# MAGIC %md
# MAGIC ## Dimension Weights
# MAGIC
# MAGIC Weights are tunable per deployment. Store custom weights in
# MAGIC `system_settings` table under key `formula_priority_weights`.

# COMMAND ----------

DEFAULT_WEIGHTS = {
    "alert_severity": 0.20,
    "asset_criticality": 0.15,
    "user_privilege": 0.10,
    "ioc_matches": 0.15,
    "correlation_matches": 0.15,
    "campaign_association": 0.10,
    "temporal_anomaly": 0.05,
    "blast_radius": 0.10,
}

# Try to load custom weights
try:
    settings_table = cfg.get_table_path("system_settings")
    weight_row = spark.sql(f"""
        SELECT setting_value FROM {settings_table}
        WHERE setting_key = 'formula_priority_weights'
        LIMIT 1
    """).collect()
    if weight_row:
        weights = json.loads(weight_row[0].setting_value)
        # Validate keys match
        if set(weights.keys()) == set(DEFAULT_WEIGHTS.keys()):
            DEFAULT_WEIGHTS = weights
            print("Loaded custom formula weights from system_settings")
        else:
            print("Custom weights have mismatched keys, using defaults")
except Exception:
    pass

# Normalize
weight_sum = sum(DEFAULT_WEIGHTS.values())
WEIGHTS = {k: v / weight_sum for k, v in DEFAULT_WEIGHTS.items()}
print(f"Formula weights: {json.dumps({k: round(v, 3) for k, v in WEIGHTS.items()})}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Dimension 1: Alert Severity Volume
# MAGIC
# MAGIC Counts critical/high/medium alerts per entity in the scoring window.
# MAGIC Severity mapping: critical=25, high=15, medium=5, low=1

# COMMAND ----------

alerts_table = cfg.get_table_path("alerts")

with mon.time("dim_alert_severity"):
    alert_scores = spark.sql(f"""
        SELECT
            COALESCE(source_ip, user_id, id) as entity_id,
            SUM(CASE severity
                WHEN 'critical' THEN 25
                WHEN 'high' THEN 15
                WHEN 'medium' THEN 5
                ELSE 1
            END) as severity_points,
            COUNT(*) as alert_count,
            MAX(CASE WHEN severity = 'critical' THEN 1 ELSE 0 END) as has_critical
        FROM {alerts_table}
        WHERE created_at > current_timestamp() - INTERVAL {lookback_minutes} MINUTES
          AND status != 'closed'
        GROUP BY COALESCE(source_ip, user_id, id)
        HAVING COUNT(*) >= 1
        ORDER BY severity_points DESC
        LIMIT {max_entities}
    """)

    # Normalize to 0-100 scale
    max_points = alert_scores.agg({"severity_points": "max"}).collect()[0][0] or 1
    alert_scores = alert_scores.withColumn(
        "alert_severity_score",
        least(lit(100), (col("severity_points") / lit(max(max_points, 1)) * 100).cast("double"))
    )

    alert_entity_count = alert_scores.count()
    mon.log_event("dim_alert_severity", {"entities": alert_entity_count, "max_points": max_points})
    print(f"Dimension 1: {alert_entity_count} entities with alerts in window")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Dimension 2: Asset Criticality

# COMMAND ----------

asset_table = cfg.get_table_path("asset_registry")

with mon.time("dim_asset_criticality"):
    try:
        asset_scores = spark.sql(f"""
            SELECT
                COALESCE(ip_address, hostname, id) as entity_id,
                CASE criticality
                    WHEN 'critical' THEN 100
                    WHEN 'high' THEN 75
                    WHEN 'medium' THEN 40
                    WHEN 'low' THEN 15
                    ELSE 20
                END as asset_criticality_score
            FROM {asset_table}
            WHERE status = 'active'
        """)
        asset_count = asset_scores.count()
    except Exception:
        asset_scores = spark.createDataFrame([], "entity_id STRING, asset_criticality_score DOUBLE")
        asset_count = 0

    mon.log_event("dim_asset_criticality", {"assets": asset_count})
    print(f"Dimension 2: {asset_count} assets with criticality ratings")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Dimension 3: User Privilege Level

# COMMAND ----------

profiles_table = cfg.get_table_path("user_profiles")

with mon.time("dim_user_privilege"):
    try:
        privilege_scores = spark.sql(f"""
            SELECT
                COALESCE(email, id) as entity_id,
                CASE role
                    WHEN 'admin' THEN 90
                    WHEN 'security_admin' THEN 95
                    WHEN 'global_admin' THEN 100
                    WHEN 'service_account' THEN 85
                    WHEN 'analyst' THEN 50
                    WHEN 'manager' THEN 60
                    ELSE 30
                END as user_privilege_score
            FROM {profiles_table}
            WHERE status = 'active' OR status IS NULL
        """)
        priv_count = privilege_scores.count()
    except Exception:
        privilege_scores = spark.createDataFrame([], "entity_id STRING, user_privilege_score DOUBLE")
        priv_count = 0

    mon.log_event("dim_user_privilege", {"users": priv_count})
    print(f"Dimension 3: {priv_count} users with privilege scores")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Dimension 4: IOC Match Count

# COMMAND ----------

ioc_table = cfg.get_table_path("ioc_entries")
events_table = cfg.get_table_path("events")

with mon.time("dim_ioc_matches"):
    try:
        ioc_scores = spark.sql(f"""
            SELECT
                e.source_ip as entity_id,
                COUNT(DISTINCT i.id) as ioc_hit_count,
                LEAST(100, COUNT(DISTINCT i.id) * 20) as ioc_matches_score
            FROM {events_table} e
            JOIN {ioc_table} i ON (
                (i.indicator_type = 'ip' AND i.value = e.source_ip) OR
                (i.indicator_type = 'domain' AND i.value = e.hostname)
            )
            WHERE e.timestamp > current_timestamp() - INTERVAL {lookback_minutes} MINUTES
              AND i.is_active = true
            GROUP BY e.source_ip
            HAVING e.source_ip IS NOT NULL
        """)
        ioc_match_count = ioc_scores.count()
    except Exception:
        ioc_scores = spark.createDataFrame([], "entity_id STRING, ioc_hit_count LONG, ioc_matches_score DOUBLE")
        ioc_match_count = 0

    mon.log_event("dim_ioc_matches", {"entities_with_ioc_hits": ioc_match_count})
    print(f"Dimension 4: {ioc_match_count} entities matched IOCs")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Dimension 5: Correlation Rule Matches

# COMMAND ----------

cep_table = cfg.get_table_path("cep_pattern_matches")

with mon.time("dim_correlation_matches"):
    try:
        correlation_scores = spark.sql(f"""
            SELECT
                COALESCE(source_ip, entity_id, alert_id) as entity_id,
                COUNT(*) as correlation_count,
                LEAST(100, COUNT(*) * 15 + MAX(COALESCE(score, 0.5)) * 30) as correlation_matches_score
            FROM {cep_table}
            WHERE matched_at > current_timestamp() - INTERVAL {lookback_minutes} MINUTES
            GROUP BY COALESCE(source_ip, entity_id, alert_id)
            HAVING COALESCE(source_ip, entity_id, alert_id) IS NOT NULL
        """)
        corr_count = correlation_scores.count()
    except Exception:
        correlation_scores = spark.createDataFrame(
            [], "entity_id STRING, correlation_count LONG, correlation_matches_score DOUBLE"
        )
        corr_count = 0

    mon.log_event("dim_correlation_matches", {"entities": corr_count})
    print(f"Dimension 5: {corr_count} entities with correlation matches")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Dimension 6: Threat Campaign Association

# COMMAND ----------

campaigns_table = cfg.get_table_path("threat_campaigns")

with mon.time("dim_campaign_association"):
    try:
        campaign_scores = spark.sql(f"""
            SELECT
                ioc.value as entity_id,
                COUNT(DISTINCT tc.id) as campaign_count,
                LEAST(100, COUNT(DISTINCT tc.id) * 30 + MAX(tc.confidence) * 40) as campaign_association_score
            FROM {campaigns_table} tc
            JOIN {ioc_table} ioc ON ioc.campaign_id = tc.id OR ioc.source LIKE CONCAT('%', tc.name, '%')
            WHERE tc.status = 'active'
              AND ioc.is_active = true
            GROUP BY ioc.value
        """)
        campaign_hit_count = campaign_scores.count()
    except Exception:
        campaign_scores = spark.createDataFrame(
            [], "entity_id STRING, campaign_count LONG, campaign_association_score DOUBLE"
        )
        campaign_hit_count = 0

    mon.log_event("dim_campaign_association", {"entities": campaign_hit_count})
    print(f"Dimension 6: {campaign_hit_count} entities linked to active campaigns")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Dimension 7: Temporal Anomaly (Off-Hours Activity)

# COMMAND ----------

with mon.time("dim_temporal_anomaly"):
    try:
        temporal_scores = spark.sql(f"""
            SELECT
                COALESCE(source_ip, user_id) as entity_id,
                SUM(CASE
                    WHEN HOUR(timestamp) < 6 OR HOUR(timestamp) > 21 THEN 3
                    WHEN DAYOFWEEK(timestamp) IN (1, 7) THEN 2
                    ELSE 0
                END) as offhours_points,
                LEAST(100, SUM(CASE
                    WHEN HOUR(timestamp) < 6 OR HOUR(timestamp) > 21 THEN 3
                    WHEN DAYOFWEEK(timestamp) IN (1, 7) THEN 2
                    ELSE 0
                END) * 5) as temporal_anomaly_score
            FROM {events_table}
            WHERE timestamp > current_timestamp() - INTERVAL {lookback_minutes} MINUTES
              AND COALESCE(source_ip, user_id) IS NOT NULL
            GROUP BY COALESCE(source_ip, user_id)
            HAVING SUM(CASE
                WHEN HOUR(timestamp) < 6 OR HOUR(timestamp) > 21 THEN 3
                WHEN DAYOFWEEK(timestamp) IN (1, 7) THEN 2
                ELSE 0
            END) > 0
        """)
        temporal_count = temporal_scores.count()
    except Exception:
        temporal_scores = spark.createDataFrame(
            [], "entity_id STRING, offhours_points LONG, temporal_anomaly_score DOUBLE"
        )
        temporal_count = 0

    mon.log_event("dim_temporal_anomaly", {"entities": temporal_count})
    print(f"Dimension 7: {temporal_count} entities with off-hours activity")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Dimension 8: Blast Radius (Connected Entities)

# COMMAND ----------

graph_table = cfg.get_table_path("graph_streaming_edges")

with mon.time("dim_blast_radius"):
    try:
        blast_scores = spark.sql(f"""
            SELECT
                source_id as entity_id,
                COUNT(DISTINCT target_id) as connected_entities,
                LEAST(100, COUNT(DISTINCT target_id) * 8) as blast_radius_score
            FROM {graph_table}
            WHERE created_at > current_timestamp() - INTERVAL 24 HOURS
            GROUP BY source_id
            HAVING COUNT(DISTINCT target_id) >= 3
        """)
        blast_count = blast_scores.count()
    except Exception:
        blast_scores = spark.createDataFrame(
            [], "entity_id STRING, connected_entities LONG, blast_radius_score DOUBLE"
        )
        blast_count = 0

    mon.log_event("dim_blast_radius", {"entities": blast_count})
    print(f"Dimension 8: {blast_count} entities with significant blast radius")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Compute Composite Scores
# MAGIC
# MAGIC Join all dimensions on entity_id, compute weighted sum, apply velocity multiplier.

# COMMAND ----------

with mon.time("composite_scoring"):
    # Start from alert entities (primary driver)
    scored = alert_scores.select("entity_id", "alert_severity_score")

    # Left-join each dimension
    scored = scored.join(
        asset_scores.select("entity_id", "asset_criticality_score"),
        "entity_id", "left"
    ).join(
        privilege_scores.select("entity_id", "user_privilege_score"),
        "entity_id", "left"
    ).join(
        ioc_scores.select("entity_id", "ioc_matches_score"),
        "entity_id", "left"
    ).join(
        correlation_scores.select("entity_id", "correlation_matches_score"),
        "entity_id", "left"
    ).join(
        campaign_scores.select("entity_id", "campaign_association_score"),
        "entity_id", "left"
    ).join(
        temporal_scores.select("entity_id", "temporal_anomaly_score"),
        "entity_id", "left"
    ).join(
        blast_scores.select("entity_id", "blast_radius_score"),
        "entity_id", "left"
    )

    # Fill nulls with 0 and compute weighted sum
    dim_cols = [
        ("alert_severity_score", WEIGHTS["alert_severity"]),
        ("asset_criticality_score", WEIGHTS["asset_criticality"]),
        ("user_privilege_score", WEIGHTS["user_privilege"]),
        ("ioc_matches_score", WEIGHTS["ioc_matches"]),
        ("correlation_matches_score", WEIGHTS["correlation_matches"]),
        ("campaign_association_score", WEIGHTS["campaign_association"]),
        ("temporal_anomaly_score", WEIGHTS["temporal_anomaly"]),
        ("blast_radius_score", WEIGHTS["blast_radius"]),
    ]

    weighted_expr = sum(
        coalesce(col(dim_col), lit(0.0)) * lit(weight)
        for dim_col, weight in dim_cols
    )

    scored = scored.withColumn("priority_score", weighted_expr)

    # Filter by threshold
    high_priority = scored.filter(col("priority_score") >= min_score_threshold)
    scored_count = high_priority.count()

    mon.log_event("composite_scored", {"total_entities": alert_entity_count, "above_threshold": scored_count})
    print(f"Composite scoring: {scored_count}/{alert_entity_count} entities above threshold {min_score_threshold}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Velocity Multiplier
# MAGIC
# MAGIC Compare current score against the entity's score from the previous window.
# MAGIC Entities with INCREASING risk get a 10-20% boost.

# COMMAND ----------

formula_table = cfg.get_table_path("formula_priority_scores")

spark.sql(f"""
    CREATE TABLE IF NOT EXISTS {formula_table} (
        id STRING,
        entity_id STRING NOT NULL,
        priority_score DOUBLE NOT NULL,
        priority_reason STRING,
        scored_at TIMESTAMP,
        processed_by_confluence BOOLEAN DEFAULT false,
        dimension_breakdown STRING,
        velocity_multiplier DOUBLE DEFAULT 1.0
    )
    USING DELTA
    TBLPROPERTIES ('delta.autoOptimize.optimizeWrite' = 'true')
""")

with mon.time("velocity_calculation"):
    try:
        previous_scores = spark.sql(f"""
            SELECT entity_id, AVG(priority_score) as prev_avg_score
            FROM {formula_table}
            WHERE scored_at BETWEEN
                current_timestamp() - INTERVAL {velocity_window_hours} HOURS
                AND current_timestamp() - INTERVAL {lookback_minutes} MINUTES
            GROUP BY entity_id
        """)

        high_priority_with_velocity = high_priority.join(
            previous_scores, "entity_id", "left"
        ).withColumn(
            "velocity_multiplier",
            when(
                col("prev_avg_score").isNotNull() & (col("priority_score") > col("prev_avg_score") * 1.2),
                lit(1.15)  # 15% boost for accelerating risk
            ).when(
                col("prev_avg_score").isNotNull() & (col("priority_score") > col("prev_avg_score") * 1.5),
                lit(1.20)  # 20% boost for rapidly accelerating risk
            ).otherwise(lit(1.0))
        ).withColumn(
            "priority_score_final",
            least(lit(100.0), col("priority_score") * col("velocity_multiplier"))
        )

        velocity_boosted = high_priority_with_velocity.filter(col("velocity_multiplier") > 1.0).count()
        print(f"Velocity boost applied to {velocity_boosted} entities")

    except Exception as e:
        mon.log_event("velocity_fallback", {"error": str(e)[:200]})
        high_priority_with_velocity = high_priority.withColumn(
            "velocity_multiplier", lit(1.0)
        ).withColumn("priority_score_final", col("priority_score"))
        velocity_boosted = 0

# COMMAND ----------

# MAGIC %md
# MAGIC ## Build Priority Reasons

# COMMAND ----------

with mon.time("build_reasons"):
    final_scored = high_priority_with_velocity.withColumn(
        "priority_reason",
        concat_ws(" | ",
            when(coalesce(col("alert_severity_score"), lit(0)) > 50,
                 concat(lit("High-severity alerts ("), col("alert_severity_score").cast("int"), lit("/100)"))),
            when(coalesce(col("ioc_matches_score"), lit(0)) > 0,
                 lit("Active IOC matches")),
            when(coalesce(col("correlation_matches_score"), lit(0)) > 0,
                 lit("Correlation rule hits")),
            when(coalesce(col("campaign_association_score"), lit(0)) > 0,
                 lit("Linked to threat campaign")),
            when(coalesce(col("asset_criticality_score"), lit(0)) > 70,
                 lit("Critical asset")),
            when(coalesce(col("temporal_anomaly_score"), lit(0)) > 0,
                 lit("Off-hours activity")),
            when(col("velocity_multiplier") > 1.0,
                 lit("Risk accelerating")),
        )
    ).withColumn(
        "dimension_breakdown",
        to_json(struct(
            coalesce(col("alert_severity_score"), lit(0.0)).alias("alert_severity"),
            coalesce(col("asset_criticality_score"), lit(0.0)).alias("asset_criticality"),
            coalesce(col("user_privilege_score"), lit(0.0)).alias("user_privilege"),
            coalesce(col("ioc_matches_score"), lit(0.0)).alias("ioc_matches"),
            coalesce(col("correlation_matches_score"), lit(0.0)).alias("correlation_matches"),
            coalesce(col("campaign_association_score"), lit(0.0)).alias("campaign_association"),
            coalesce(col("temporal_anomaly_score"), lit(0.0)).alias("temporal_anomaly"),
            coalesce(col("blast_radius_score"), lit(0.0)).alias("blast_radius"),
        ))
    )

# COMMAND ----------

# MAGIC %md
# MAGIC ## Persist Results

# COMMAND ----------

with mon.time("persist"):
    output_df = (
        final_scored.select(
            col("entity_id"),
            col("priority_score_final").alias("priority_score"),
            col("priority_reason"),
            col("dimension_breakdown"),
            col("velocity_multiplier"),
        )
        .withColumn("id", expr("uuid()"))
        .withColumn("scored_at", current_timestamp())
        .withColumn("processed_by_confluence", lit(False))
    )

    output_df.select(
        "id", "entity_id", "priority_score", "priority_reason",
        "scored_at", "processed_by_confluence", "dimension_breakdown",
        "velocity_multiplier"
    ).write.mode("append").saveAsTable(formula_table)

    final_count = output_df.count()
    print(f"Persisted {final_count} priority scores to {formula_table}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Prune Old Scores (Keep 7 Days)

# COMMAND ----------

with mon.time("prune"):
    try:
        pruned = spark.sql(f"""
            DELETE FROM {formula_table}
            WHERE scored_at < current_timestamp() - INTERVAL 7 DAYS
        """)
        print("Pruned scores older than 7 days")
    except Exception:
        pass

# COMMAND ----------

result = {
    "notebook": "04_formula_prioritization",
    "status": "completed",
    "entities_scored": final_count if 'final_count' in dir() else 0,
    "velocity_boosted": velocity_boosted,
    "dimensions_active": sum(1 for v in [
        alert_entity_count, asset_count, priv_count,
        ioc_match_count, corr_count, campaign_hit_count,
        temporal_count, blast_count
    ] if v > 0),
    "weights": {k: round(v, 3) for k, v in WEIGHTS.items()},
}

mon.log_complete(details=result)
print(json.dumps(result, indent=2))
dbutils.notebook.exit(json.dumps(result))
