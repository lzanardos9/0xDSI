# Databricks notebook source
# MAGIC %md
# MAGIC # Detection 05: Per-Entity Behavioral Drift (CET)
# MAGIC
# MAGIC Complete Event Trend scoring at the entity level. Unlike the graph-path CET
# MAGIC (analytics/01_trend_engine_cet.py), this notebook detects SLOW CHANGE in
# MAGIC individual entities: a user drifting in behavior, a service account gaining
# MAGIC new capabilities, a CI runner bridging new domains.
# MAGIC
# MAGIC **Drift Dimensions Tracked:**
# MAGIC - `rate_drift` — Event volume changing (acceleration/deceleration)
# MAGIC - `diversity_drift` — Entity touching more/fewer distinct resources
# MAGIC - `temporal_drift` — Activity shifting to unusual hours/days
# MAGIC - `centrality_drift` — Entity becoming more central in the graph
# MAGIC - `pivot_potential` — Entity starting to bridge previously separate domains
# MAGIC - `destination_novelty` — Fraction of destinations never seen in baseline
# MAGIC
# MAGIC **Time Horizons:**
# MAGIC - Baseline: 30 days (configurable)
# MAGIC - Recent window: 24 hours (compared against baseline)
# MAGIC - Outputs: per-entity risk trajectory + composite drift score
# MAGIC
# MAGIC **Architecture Position:** Runs in parallel with CEP and detection lenses.
# MAGIC Outputs feed into UEO as `cet` signal class.
# MAGIC
# MAGIC **Scheduling:** Every 15 minutes

# COMMAND ----------

# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

dbutils.widgets.text("baseline_days", "30", "Baseline period (days)")
dbutils.widgets.text("recent_hours", "24", "Recent window (hours)")
dbutils.widgets.text("drift_threshold", "0.6", "Drift score threshold for signal emission")
dbutils.widgets.text("min_baseline_events", "50", "Minimum baseline events for entity to qualify")
dbutils.widgets.text("max_entities", "10000", "Max entities to evaluate per run")

baseline_days = int(dbutils.widgets.get("baseline_days"))
recent_hours = int(dbutils.widgets.get("recent_hours"))
drift_threshold = float(dbutils.widgets.get("drift_threshold"))
min_baseline_events = int(dbutils.widgets.get("min_baseline_events"))
max_entities = int(dbutils.widgets.get("max_entities"))

# COMMAND ----------

from pyspark.sql.functions import *
from pyspark.sql.window import Window
from pyspark.sql.types import *
from datetime import datetime, timedelta
import json
import math

# COMMAND ----------

# MAGIC %md
# MAGIC ## Ensure Drift Tables

# COMMAND ----------

drift_table = get_table_path(cfg, "entity_drift_scores")
drift_history = get_table_path(cfg, "entity_drift_history")

spark.sql(f"""
CREATE TABLE IF NOT EXISTS {drift_table} (
    drift_id STRING NOT NULL,
    entity_id STRING NOT NULL,
    entity_type STRING,
    entity_name STRING,
    -- Drift dimensions (0.0 = no change, 1.0 = extreme drift)
    rate_drift DOUBLE DEFAULT 0.0,
    diversity_drift DOUBLE DEFAULT 0.0,
    temporal_drift DOUBLE DEFAULT 0.0,
    centrality_drift DOUBLE DEFAULT 0.0,
    pivot_potential DOUBLE DEFAULT 0.0,
    destination_novelty DOUBLE DEFAULT 0.0,
    -- Composite
    composite_drift_score DOUBLE NOT NULL,
    drift_rank INT,
    -- Context
    baseline_event_count BIGINT,
    recent_event_count BIGINT,
    baseline_unique_dests INT,
    recent_unique_dests INT,
    new_destinations ARRAY<STRING>,
    -- Risk trajectory direction
    trajectory STRING,
    days_trending INT DEFAULT 1,
    -- State
    is_signal_emitted BOOLEAN DEFAULT false,
    signal_emitted_at TIMESTAMP,
    scored_at TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
TBLPROPERTIES (
    'delta.enableChangeDataFeed' = 'true',
    'delta.autoOptimize.optimizeWrite' = 'true'
)
""")

spark.sql(f"""
CREATE TABLE IF NOT EXISTS {drift_history} (
    entity_id STRING NOT NULL,
    scored_at TIMESTAMP NOT NULL,
    composite_drift_score DOUBLE NOT NULL,
    rate_drift DOUBLE,
    diversity_drift DOUBLE,
    temporal_drift DOUBLE,
    centrality_drift DOUBLE,
    pivot_potential DOUBLE,
    destination_novelty DOUBLE,
    trajectory STRING
)
USING DELTA
PARTITIONED BY (scored_at)
TBLPROPERTIES ('delta.autoOptimize.optimizeWrite' = 'true')
""")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Compute Baselines (30-day behavioral profile)

# COMMAND ----------

now = datetime.utcnow()
baseline_start = now - timedelta(days=baseline_days)
recent_start = now - timedelta(hours=recent_hours)

events_table = get_table_path(cfg, "events")
spine_table = get_table_path(cfg, "entity_spine")

with mon.time("compute_baselines"):
    # Identify active entities with enough baseline data
    # Use entity_spine for canonical names, fall back to raw user_id/source_ip
    baseline_entities = spark.sql(f"""
        SELECT
            COALESCE(user_id, source_ip) as entity_ref,
            COUNT(*) as baseline_event_count,
            COUNT(DISTINCT dest_ip) as baseline_unique_dests,
            COUNT(DISTINCT event_type) as baseline_unique_types,
            COUNT(DISTINCT HOUR(timestamp)) as baseline_active_hours,
            COUNT(DISTINCT DAYOFWEEK(timestamp)) as baseline_active_days,
            AVG(HOUR(timestamp)) as baseline_avg_hour,
            STDDEV(HOUR(timestamp)) as baseline_hour_stddev,
            -- Rate: events per day
            COUNT(*) / {baseline_days}.0 as baseline_daily_rate,
            -- Collect baseline destinations for novelty comparison
            collect_set(dest_ip) as baseline_destinations
        FROM {events_table}
        WHERE timestamp BETWEEN '{baseline_start.isoformat()}' AND '{recent_start.isoformat()}'
          AND (user_id IS NOT NULL OR source_ip IS NOT NULL)
        GROUP BY COALESCE(user_id, source_ip)
        HAVING COUNT(*) >= {min_baseline_events}
        ORDER BY baseline_event_count DESC
        LIMIT {max_entities}
    """)

    entity_count = baseline_entities.count()
    if entity_count == 0:
        print("No entities with sufficient baseline data")
        dbutils.notebook.exit(json.dumps({"status": "no_entities", "drifts": 0}))

    print(f"Computing drift for {entity_count} entities")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Compute Recent Activity (24h window)

# COMMAND ----------

with mon.time("compute_recent"):
    recent_activity = spark.sql(f"""
        SELECT
            COALESCE(user_id, source_ip) as entity_ref,
            COUNT(*) as recent_event_count,
            COUNT(DISTINCT dest_ip) as recent_unique_dests,
            COUNT(DISTINCT event_type) as recent_unique_types,
            COUNT(DISTINCT HOUR(timestamp)) as recent_active_hours,
            AVG(HOUR(timestamp)) as recent_avg_hour,
            STDDEV(HOUR(timestamp)) as recent_hour_stddev,
            COUNT(*) / ({recent_hours} / 24.0) as recent_daily_rate,
            collect_set(dest_ip) as recent_destinations
        FROM {events_table}
        WHERE timestamp > '{recent_start.isoformat()}'
          AND (user_id IS NOT NULL OR source_ip IS NOT NULL)
        GROUP BY COALESCE(user_id, source_ip)
    """)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Compute Drift Dimensions

# COMMAND ----------

with mon.time("compute_drift"):
    # Join baseline with recent
    drift_raw = (
        baseline_entities.alias("b")
        .join(recent_activity.alias("r"), col("b.entity_ref") == col("r.entity_ref"), "inner")
        .select(
            col("b.entity_ref"),
            col("b.baseline_event_count"),
            col("r.recent_event_count"),
            col("b.baseline_unique_dests"),
            col("r.recent_unique_dests"),
            col("b.baseline_unique_types"),
            col("r.recent_unique_types"),
            col("b.baseline_daily_rate"),
            col("r.recent_daily_rate"),
            col("b.baseline_avg_hour"),
            col("r.recent_avg_hour"),
            col("b.baseline_hour_stddev"),
            col("r.recent_hour_stddev"),
            col("b.baseline_active_hours"),
            col("r.recent_active_hours"),
            col("b.baseline_destinations"),
            col("r.recent_destinations"),
        )
    )

    # Compute each drift dimension
    drift_scored = (
        drift_raw
        # Rate drift: |log2(recent_rate / baseline_rate)| normalized to 0-1
        .withColumn("rate_ratio",
            col("recent_daily_rate") / greatest(col("baseline_daily_rate"), lit(0.1))
        )
        .withColumn("rate_drift",
            least(abs(log2(greatest(col("rate_ratio"), lit(0.01)))) / lit(3.0), lit(1.0))
        )
        # Diversity drift: normalized change in unique destinations
        .withColumn("diversity_drift",
            abs(col("recent_unique_dests") - col("baseline_unique_dests")) /
            greatest(col("baseline_unique_dests").cast("double"), lit(1.0))
        )
        .withColumn("diversity_drift", least(col("diversity_drift") / lit(2.0), lit(1.0)))
        # Temporal drift: shift in activity hours
        .withColumn("temporal_drift",
            abs(col("recent_avg_hour") - col("baseline_avg_hour")) /
            greatest(coalesce(col("baseline_hour_stddev"), lit(4.0)), lit(1.0))
        )
        .withColumn("temporal_drift", least(col("temporal_drift") / lit(3.0), lit(1.0)))
        # Destination novelty: fraction of recent dests not in baseline
        .withColumn("novel_dests",
            array_except(col("recent_destinations"), col("baseline_destinations"))
        )
        .withColumn("destination_novelty",
            size(col("novel_dests")).cast("double") /
            greatest(size(col("recent_destinations")).cast("double"), lit(1.0))
        )
        # Pivot potential: touching more distinct types of resources
        .withColumn("pivot_potential",
            when(
                col("recent_unique_types") > col("baseline_unique_types"),
                (col("recent_unique_types") - col("baseline_unique_types")).cast("double") /
                greatest(col("baseline_unique_types").cast("double"), lit(1.0))
            ).otherwise(lit(0.0))
        )
        .withColumn("pivot_potential", least(col("pivot_potential"), lit(1.0)))
    )

    # Centrality drift: requires entity spine
    try:
        spine_current = spark.table(spine_table).select(
            col("canonical_name").alias("entity_ref"),
            col("entity_id"),
            col("entity_type"),
            col("centrality_pagerank").alias("current_centrality"),
        )

        # Get historical centrality from drift_history (previous score)
        prev_centrality = spark.sql(f"""
            SELECT entity_id, centrality_drift as prev_centrality_drift
            FROM {drift_table}
            WHERE scored_at = (SELECT MAX(scored_at) FROM {drift_table})
        """)

        drift_scored = (
            drift_scored
            .join(spine_current, "entity_ref", "left")
            .withColumn("centrality_drift", coalesce(col("current_centrality"), lit(0.0)))
        )
    except Exception:
        drift_scored = (
            drift_scored
            .withColumn("entity_id", md5(col("entity_ref")))
            .withColumn("entity_type", lit("unknown"))
            .withColumn("centrality_drift", lit(0.0))
        )

    # Composite drift score: weighted combination
    drift_final = (
        drift_scored
        .withColumn("composite_drift_score",
            col("rate_drift") * lit(0.20) +
            col("diversity_drift") * lit(0.20) +
            col("temporal_drift") * lit(0.15) +
            col("centrality_drift") * lit(0.15) +
            col("pivot_potential") * lit(0.15) +
            col("destination_novelty") * lit(0.15)
        )
        .withColumn("composite_drift_score",
            least(greatest(col("composite_drift_score"), lit(0.0)), lit(1.0))
        )
        # Trajectory: increasing, stable, or decreasing
        .withColumn("trajectory",
            when(col("rate_ratio") > 1.5, lit("accelerating"))
            .when(col("rate_ratio") < 0.5, lit("decelerating"))
            .when(col("diversity_drift") > 0.3, lit("expanding"))
            .when(col("destination_novelty") > 0.5, lit("exploring"))
            .otherwise(lit("stable"))
        )
        .withColumn("drift_id", expr("uuid()"))
        .withColumn("entity_name", col("entity_ref"))
        .withColumn("is_signal_emitted", col("composite_drift_score") >= lit(drift_threshold))
        .withColumn("signal_emitted_at",
            when(col("is_signal_emitted"), current_timestamp()).otherwise(lit(None).cast("timestamp"))
        )
        .withColumn("scored_at", current_timestamp())
        .withColumn("days_trending", lit(1))
        .withColumn("new_destinations",
            when(size(col("novel_dests")) <= 20, col("novel_dests"))
            .otherwise(slice(col("novel_dests"), 1, 20))
        )
    )

    # Rank by drift score
    w = Window.orderBy(desc("composite_drift_score"))
    drift_final = drift_final.withColumn("drift_rank", row_number().over(w))

    drift_count = drift_final.filter(col("is_signal_emitted")).count()
    total_scored = drift_final.count()
    print(f"Scored {total_scored} entities, {drift_count} above threshold ({drift_threshold})")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Write Drift Scores

# COMMAND ----------

with mon.time("write_drift"):
    # Write current drift scores (overwrite — point-in-time snapshot)
    output = drift_final.select(
        "drift_id", "entity_id", "entity_type", "entity_name",
        "rate_drift", "diversity_drift", "temporal_drift",
        "centrality_drift", "pivot_potential", "destination_novelty",
        "composite_drift_score", "drift_rank",
        "baseline_event_count", "recent_event_count",
        "baseline_unique_dests", "recent_unique_dests",
        "new_destinations", "trajectory", "days_trending",
        "is_signal_emitted", "signal_emitted_at", "scored_at"
    )

    # MERGE: update existing entities, insert new ones
    output.createOrReplaceTempView("_drift_updates")
    spark.sql(f"""
        MERGE INTO {drift_table} t
        USING _drift_updates s
        ON t.entity_id = s.entity_id
        WHEN MATCHED THEN UPDATE SET
            t.drift_id = s.drift_id,
            t.rate_drift = s.rate_drift,
            t.diversity_drift = s.diversity_drift,
            t.temporal_drift = s.temporal_drift,
            t.centrality_drift = s.centrality_drift,
            t.pivot_potential = s.pivot_potential,
            t.destination_novelty = s.destination_novelty,
            t.composite_drift_score = s.composite_drift_score,
            t.drift_rank = s.drift_rank,
            t.baseline_event_count = s.baseline_event_count,
            t.recent_event_count = s.recent_event_count,
            t.baseline_unique_dests = s.baseline_unique_dests,
            t.recent_unique_dests = s.recent_unique_dests,
            t.new_destinations = s.new_destinations,
            t.trajectory = s.trajectory,
            t.days_trending = t.days_trending + 1,
            t.is_signal_emitted = s.is_signal_emitted,
            t.signal_emitted_at = s.signal_emitted_at,
            t.scored_at = s.scored_at
        WHEN NOT MATCHED THEN INSERT *
    """)

    # Append to history for trend analysis
    history = drift_final.select(
        "entity_id", "scored_at", "composite_drift_score",
        "rate_drift", "diversity_drift", "temporal_drift",
        "centrality_drift", "pivot_potential", "destination_novelty",
        "trajectory"
    )
    history.write.mode("append").saveAsTable(drift_history)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Emit CET Signals for UEO
# MAGIC
# MAGIC Entities above drift threshold get written as alerts that the UEO builder
# MAGIC will pick up as `cet` signal class.

# COMMAND ----------

with mon.time("emit_signals"):
    high_drift = drift_final.filter(col("is_signal_emitted"))

    if high_drift.count() > 0:
        alerts_table = get_table_path(cfg, "alerts")

        cet_alerts = (
            high_drift
            .select(
                expr("uuid()").alias("id"),
                col("entity_name").alias("title"),
                concat(
                    lit("CET Drift: "),
                    col("entity_name"),
                    lit(" (score="),
                    round(col("composite_drift_score"), 3).cast("string"),
                    lit(", trajectory="),
                    col("trajectory"),
                    lit(")")
                ).alias("description"),
                when(col("composite_drift_score") > 0.8, lit("high"))
                .when(col("composite_drift_score") > 0.6, lit("medium"))
                .otherwise(lit("low")).alias("severity"),
                lit("cet_drift_engine").alias("source"),
                col("entity_id"),
                col("composite_drift_score").alias("confidence_score"),
                lit("open").alias("status"),
                current_timestamp().alias("created_at"),
            )
        )

        cet_alerts.write.mode("append").option("mergeSchema", "true").saveAsTable(alerts_table)
        print(f"Emitted {high_drift.count()} CET drift signals to alerts table")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Summary

# COMMAND ----------

result = {
    "notebook": "05_entity_drift_cet",
    "status": "completed",
    "entities_scored": total_scored,
    "signals_emitted": drift_count,
    "drift_threshold": drift_threshold,
    "baseline_days": baseline_days,
    "recent_hours": recent_hours,
}
mon.log_complete(details=result)
print(f"\nCET Drift Summary: {total_scored} entities scored, {drift_count} drifting")
dbutils.notebook.exit(json.dumps(result))
