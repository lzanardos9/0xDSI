# Databricks notebook source
# MAGIC %md
# MAGIC # ML - User & Entity Behavior Analytics (UEBA) Baseline
# MAGIC
# MAGIC Builds behavioral baselines for users and entities using Kolmogorov-Smirnov
# MAGIC (KS) two-sample testing for statistically rigorous anomaly detection.
# MAGIC
# MAGIC **False Positive Reduction Strategy:**
# MAGIC - Replace hardcoded ratio thresholds with KS p-value significance
# MAGIC - Per-user adaptive baselines that account for natural variance
# MAGIC - Dual-gate: anomaly must be both cluster-outlier AND KS-significant
# MAGIC - Bonferroni correction for multi-feature testing

# COMMAND ----------

dbutils.widgets.text("catalog", "soc_platform", "Unity Catalog")
dbutils.widgets.text("schema", "agentic_soc", "Schema")
dbutils.widgets.text("baseline_days", "30", "Days of history for baseline")
dbutils.widgets.text("ks_alpha", "0.01", "KS test significance level (lower = fewer FP)")
dbutils.widgets.text("min_samples", "20", "Minimum samples for KS validity")

catalog = dbutils.widgets.get("catalog")
schema = dbutils.widgets.get("schema")
baseline_days = int(dbutils.widgets.get("baseline_days"))
ks_alpha = float(dbutils.widgets.get("ks_alpha"))
min_samples = int(dbutils.widgets.get("min_samples"))

spark.sql(f"USE CATALOG {catalog}")
spark.sql(f"USE SCHEMA {schema}")

# COMMAND ----------

from pyspark.sql import functions as F
from pyspark.sql.types import *
from pyspark.ml.feature import VectorAssembler, StandardScaler
from pyspark.ml.clustering import KMeans
from pyspark.ml import Pipeline
from datetime import datetime
import numpy as np
from scipy import stats
import json

# COMMAND ----------

# MAGIC %md
# MAGIC ## Build Per-User Behavioral Distributions
# MAGIC
# MAGIC Instead of single aggregate values, we collect *distributions* of daily behavior
# MAGIC per user over the baseline window. This enables KS testing against recent activity.

# COMMAND ----------

user_daily_profiles = spark.sql(f"""
    SELECT
        username,
        DATE(timestamp) as activity_date,
        DAYOFWEEK(timestamp) as day_of_week,
        COUNT(*) as daily_events,
        COUNT(DISTINCT source_ip) as daily_unique_ips,
        COUNT(DISTINCT dest_ip) as daily_unique_dests,
        COUNT(DISTINCT event_type) as daily_event_types,
        AVG(HOUR(timestamp)) as avg_hour,
        SUM(CASE WHEN outcome = 'failure' THEN 1 ELSE 0 END) as daily_failures,
        SUM(CASE WHEN severity IN ('high', 'critical') THEN 1 ELSE 0 END) as daily_high_sev,
        SUM(CASE WHEN HOUR(timestamp) < 6 OR HOUR(timestamp) > 22 THEN 1 ELSE 0 END) as daily_offhours,
        COUNT(DISTINCT CASE WHEN event_type = 'authentication' THEN dest_ip END) as daily_auth_targets
    FROM events
    WHERE timestamp > current_timestamp() - INTERVAL {baseline_days} DAYS
      AND username IS NOT NULL AND username != ''
    GROUP BY username, DATE(timestamp), DAYOFWEEK(timestamp)
""")

users_with_baseline = user_daily_profiles.groupBy("username").agg(
    F.count("*").alias("baseline_days_active")
).filter(F.col("baseline_days_active") >= min_samples)

print(f"Users with sufficient baseline data (>={min_samples} days): {users_with_baseline.count()}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Kolmogorov-Smirnov Anomaly Detection Engine
# MAGIC
# MAGIC For each user, we compare their recent behavior distribution (last 4 hours)
# MAGIC against their historical baseline distribution using the KS two-sample test.
# MAGIC
# MAGIC The KS test answers: "Do these two samples come from the same distribution?"
# MAGIC - p < alpha: Reject null hypothesis -> behavior has genuinely shifted
# MAGIC - p >= alpha: Cannot reject -> behavior is within normal variance
# MAGIC
# MAGIC This eliminates false positives from:
# MAGIC - Naturally bursty users (their bursts appear in their baseline distribution)
# MAGIC - Periodic patterns (Monday spikes match historical Monday distribution)
# MAGIC - Seasonal variance (distribution shape stays consistent even if mean shifts)

# COMMAND ----------

def ks_anomaly_score(baseline_values, recent_values, alpha=0.01):
    """
    Perform KS two-sample test and return anomaly assessment.
    """
    if len(baseline_values) < 5 or len(recent_values) < 2:
        return {"ks_statistic": 0, "p_value": 1.0, "is_anomalous": False,
                "confidence": 0, "effect_size": 0}

    ks_stat, p_value = stats.ks_2samp(baseline_values, recent_values)
    n_eff = (len(baseline_values) * len(recent_values)) / (len(baseline_values) + len(recent_values))
    effect_size = ks_stat * np.sqrt(n_eff)

    return {
        "ks_statistic": float(ks_stat),
        "p_value": float(p_value),
        "is_anomalous": p_value < alpha,
        "confidence": float(1 - p_value),
        "effect_size": float(effect_size),
    }


def multi_feature_ks_test(baseline_df, recent_df, features, alpha=0.01):
    """
    Run KS test across multiple behavioral features for a single user.
    Uses Bonferroni-corrected alpha to control family-wise error rate.
    """
    n_features = len(features)
    corrected_alpha = alpha / n_features

    results = {}
    anomalous_features = []

    for feature in features:
        baseline_vals = np.array([row[feature] for row in baseline_df if row[feature] is not None])
        recent_vals = np.array([row[feature] for row in recent_df if row[feature] is not None])

        result = ks_anomaly_score(baseline_vals, recent_vals, corrected_alpha)
        results[feature] = result

        if result["is_anomalous"]:
            anomalous_features.append(feature)

    composite_confidence = 0
    if anomalous_features:
        confidences = [results[f]["confidence"] for f in anomalous_features]
        composite_confidence = 1 - np.prod([1 - c for c in confidences])

    return {
        "feature_results": results,
        "anomalous_features": anomalous_features,
        "anomalous_count": len(anomalous_features),
        "total_features": n_features,
        "composite_confidence": float(composite_confidence),
        "is_anomalous": len(anomalous_features) >= 2,
    }

# COMMAND ----------

# MAGIC %md
# MAGIC ## Run KS Tests Per User Against Recent Activity

# COMMAND ----------

BEHAVIORAL_FEATURES = [
    "daily_events", "daily_unique_ips", "daily_unique_dests",
    "daily_failures", "daily_high_sev", "daily_offhours", "daily_auth_targets"
]

recent_activity = spark.sql("""
    SELECT
        username,
        DATE(timestamp) as activity_date,
        COUNT(*) as daily_events,
        COUNT(DISTINCT source_ip) as daily_unique_ips,
        COUNT(DISTINCT dest_ip) as daily_unique_dests,
        SUM(CASE WHEN outcome = 'failure' THEN 1 ELSE 0 END) as daily_failures,
        SUM(CASE WHEN severity IN ('high', 'critical') THEN 1 ELSE 0 END) as daily_high_sev,
        SUM(CASE WHEN HOUR(timestamp) < 6 OR HOUR(timestamp) > 22 THEN 1 ELSE 0 END) as daily_offhours,
        COUNT(DISTINCT CASE WHEN event_type = 'authentication' THEN dest_ip END) as daily_auth_targets
    FROM events
    WHERE timestamp > current_timestamp() - INTERVAL 4 HOURS
      AND username IS NOT NULL
    GROUP BY username, DATE(timestamp)
""")

qualified_users = users_with_baseline.select("username").collect()
qualified_set = {row.username for row in qualified_users}

anomaly_detections = []

for user_row in recent_activity.collect():
    username = user_row.username
    if username not in qualified_set:
        continue

    baseline_data = (
        user_daily_profiles
        .filter(F.col("username") == username)
        .select(*BEHAVIORAL_FEATURES)
        .collect()
    )

    recent_data = [user_row]

    if len(baseline_data) < min_samples:
        continue

    ks_result = multi_feature_ks_test(
        baseline_data, recent_data, BEHAVIORAL_FEATURES, ks_alpha
    )

    if ks_result["is_anomalous"]:
        anomaly_detections.append({
            "username": username,
            "anomalous_features": ks_result["anomalous_features"],
            "composite_confidence": ks_result["composite_confidence"],
            "feature_details": {
                f: {
                    "ks_stat": ks_result["feature_results"][f]["ks_statistic"],
                    "p_value": ks_result["feature_results"][f]["p_value"],
                }
                for f in ks_result["anomalous_features"]
            },
            "recent_events": user_row.daily_events,
            "recent_failures": user_row.daily_failures,
        })

print(f"KS-validated anomalies: {len(anomaly_detections)} (from {recent_activity.count()} active users)")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Cluster-Based Validation (Dual-Gate)
# MAGIC
# MAGIC A user must be BOTH KS-anomalous AND cluster-outlier to generate an alert.

# COMMAND ----------

user_profiles = spark.sql(f"""
    SELECT username,
           COUNT(*) as total_events,
           COUNT(DISTINCT DATE(timestamp)) as active_days,
           COUNT(DISTINCT source_ip) as unique_source_ips,
           COUNT(DISTINCT dest_ip) as unique_dest_ips,
           COUNT(DISTINCT event_type) as unique_event_types,
           AVG(HOUR(timestamp)) as avg_active_hour,
           STDDEV(HOUR(timestamp)) as hour_stddev,
           SUM(CASE WHEN outcome = 'failure' THEN 1 ELSE 0 END) / COUNT(*) as failure_rate,
           SUM(CASE WHEN severity IN ('high', 'critical') THEN 1 ELSE 0 END) as high_sev_count,
           COUNT(DISTINCT CASE WHEN event_type = 'authentication' THEN dest_ip END) as auth_targets,
           MAX(UNIX_TIMESTAMP(timestamp)) - MIN(UNIX_TIMESTAMP(timestamp)) as session_span_seconds
    FROM events
    WHERE timestamp > current_timestamp() - INTERVAL {baseline_days} DAYS
      AND username IS NOT NULL AND username != ''
    GROUP BY username
    HAVING COUNT(*) >= {min_samples}
""")

assembler = VectorAssembler(
    inputCols=["total_events", "unique_source_ips", "unique_dest_ips",
               "unique_event_types", "avg_active_hour", "failure_rate",
               "high_sev_count", "auth_targets"],
    outputCol="raw_features"
)

scaler = StandardScaler(inputCol="raw_features", outputCol="features", withStd=True, withMean=True)
kmeans = KMeans(k=5, seed=42, featuresCol="features", predictionCol="behavior_cluster")

pipeline = Pipeline(stages=[assembler, scaler, kmeans])
model = pipeline.fit(user_profiles)
clustered_users = model.transform(user_profiles)

cluster_sizes = clustered_users.groupBy("behavior_cluster").count().collect()
smallest_cluster = min(cluster_sizes, key=lambda x: x["count"])
anomaly_cluster_id = smallest_cluster["cluster"]

outlier_users = set(
    row.username for row in
    clustered_users.filter(F.col("behavior_cluster") == anomaly_cluster_id).select("username").collect()
)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Apply Dual-Gate: KS Significant AND Cluster Outlier

# COMMAND ----------

dual_gate_anomalies = [
    det for det in anomaly_detections
    if det["username"] in outlier_users
]

ks_only = len(anomaly_detections)
dual_gate = len(dual_gate_anomalies)
fp_reduction = (1 - dual_gate / max(ks_only, 1)) * 100

print(f"KS-only anomalies: {ks_only}")
print(f"Dual-gate anomalies (KS + cluster): {dual_gate}")
print(f"False positive reduction from dual-gate: {fp_reduction:.1f}%")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Persist Validated Anomalies

# COMMAND ----------

import uuid

if dual_gate_anomalies:
    for det in dual_gate_anomalies:
        risk_level = "critical" if det["composite_confidence"] > 0.95 else \
                     "high" if det["composite_confidence"] > 0.8 else "medium"

        feature_summary = ", ".join(
            f"{f} (KS={det['feature_details'][f]['ks_stat']:.3f}, p={det['feature_details'][f]['p_value']:.4f})"
            for f in det["anomalous_features"]
        )

        spark.sql(f"""
            INSERT INTO user_behavior_anomalies
            (username, anomaly_type, risk_level, detected_at, details)
            VALUES (
                '{det["username"]}',
                'ks_validated_behavioral_deviation',
                '{risk_level}',
                current_timestamp(),
                'KS dual-gate anomaly. Confidence: {det["composite_confidence"]:.3f}. Features: {feature_summary}'
            )
        """)

    print(f"Persisted {len(dual_gate_anomalies)} KS-validated anomalies")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Save Baseline Model & KS Calibration Metadata

# COMMAND ----------

import mlflow

with mlflow.start_run(run_name="ueba_ks_baseline"):
    mlflow.spark.log_model(model, "ueba_behavior_model")
    mlflow.log_metric("users_profiled", user_profiles.count())
    mlflow.log_metric("ks_anomalies_detected", ks_only)
    mlflow.log_metric("dual_gate_anomalies", dual_gate)
    mlflow.log_metric("fp_reduction_pct", fp_reduction)
    mlflow.log_param("baseline_days", baseline_days)
    mlflow.log_param("ks_alpha", ks_alpha)
    mlflow.log_param("bonferroni_corrected_alpha", ks_alpha / len(BEHAVIORAL_FEATURES))
    mlflow.log_param("clusters", 5)
    mlflow.log_param("min_samples", min_samples)
    mlflow.log_param("dual_gate_enabled", True)

print(f"UEBA KS baseline complete. Users: {user_profiles.count()}, "
      f"Anomalies: {dual_gate} (reduced from {ks_only} via dual-gate)")
