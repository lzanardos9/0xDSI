# Databricks notebook source
# MAGIC %md
# MAGIC # UEBA Behavioral Baseline & Anomaly Detection
# MAGIC
# MAGIC Builds per-user behavioral distributions and detects anomalies using a dual-gate approach:
# MAGIC 1. Kolmogorov-Smirnov two-sample test against historical baselines
# MAGIC 2. KMeans clustering with outlier detection
# MAGIC
# MAGIC Applies Bonferroni correction and composite confidence scoring.
# MAGIC Persists detected anomalies via DataFrame write (no raw SQL INSERT).

# COMMAND ----------

# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

import json
from datetime import datetime
from typing import Dict, List, Tuple

import numpy as np
import mlflow
from scipy import stats
from pyspark.ml import Pipeline
from pyspark.ml.clustering import KMeans
from pyspark.ml.feature import StandardScaler, VectorAssembler
from pyspark.sql import Row
from pyspark.sql import functions as F
from pyspark.sql.types import (
    DoubleType,
    FloatType,
    StringType,
    StructField,
    StructType,
    TimestampType,
)

# COMMAND ----------

dbutils.widgets.text("baseline_days", "60", "Baseline Window (days)")
dbutils.widgets.text("detection_days", "1", "Detection Window (days)")
dbutils.widgets.text("ks_alpha", "0.05", "KS Test Significance Level")
dbutils.widgets.text("cluster_outlier_percentile", "95", "Cluster Outlier Percentile")

baseline_days = int(dbutils.widgets.get("baseline_days"))
detection_days = int(dbutils.widgets.get("detection_days"))
ks_alpha = float(dbutils.widgets.get("ks_alpha"))
cluster_outlier_percentile = int(dbutils.widgets.get("cluster_outlier_percentile"))
require_tables("enriched_security_events", "user_behavior_anomalies")

# COMMAND ----------

# --- Statistical Functions ---

def ks_anomaly_score(baseline_sample: np.ndarray, current_sample: np.ndarray) -> Tuple[float, float]:
    """
    Compute KS two-sample test statistic and p-value.
    Returns (ks_statistic, p_value).
    """
    if len(baseline_sample) < 5 or len(current_sample) < 3:
        return (0.0, 1.0)
    statistic, p_value = stats.ks_2samp(baseline_sample, current_sample)
    return (float(statistic), float(p_value))


def multi_feature_ks_test(
    baseline_features: Dict[str, np.ndarray],
    current_features: Dict[str, np.ndarray],
    alpha: float = 0.05,
) -> Dict[str, dict]:
    """
    Run KS test across multiple features with Bonferroni correction.
    Returns dict of feature -> {statistic, p_value, is_anomalous, corrected_alpha}.
    """
    n_features = len(baseline_features)
    corrected_alpha = alpha / n_features if n_features > 0 else alpha

    results = {}
    for feature_name in baseline_features:
        if feature_name not in current_features:
            continue
        ks_stat, p_val = ks_anomaly_score(
            baseline_features[feature_name],
            current_features[feature_name],
        )
        results[feature_name] = {
            "statistic": ks_stat,
            "p_value": p_val,
            "is_anomalous": p_val < corrected_alpha,
            "corrected_alpha": corrected_alpha,
        }
    return results


def compute_composite_confidence(ks_results: Dict[str, dict], cluster_distance_percentile: float) -> float:
    """
    Compute composite confidence score from KS test results and cluster distance.
    Combines statistical significance with cluster outlier status.
    """
    if not ks_results:
        return 0.0

    anomalous_features = sum(1 for r in ks_results.values() if r["is_anomalous"])
    total_features = len(ks_results)
    ks_confidence = anomalous_features / total_features if total_features > 0 else 0.0

    # Average KS statistic for anomalous features (higher = more divergent)
    anomalous_stats = [r["statistic"] for r in ks_results.values() if r["is_anomalous"]]
    avg_ks_stat = np.mean(anomalous_stats) if anomalous_stats else 0.0

    # Cluster distance contribution (normalized to 0-1)
    cluster_confidence = min(cluster_distance_percentile / 100.0, 1.0)

    # Composite: weighted combination
    composite = 0.4 * ks_confidence + 0.3 * avg_ks_stat + 0.3 * cluster_confidence
    return float(min(composite, 1.0))

# COMMAND ----------

try:
    result = {"notebook": "03_ueba_behavioral_baseline", "status": "success", "started_at": datetime.utcnow().isoformat()}

    # --- Build Behavioral Baselines ---
    with mon.time("build_baselines"):
        baseline_query = f"""
        SELECT
            username,
            CAST(hour(event_timestamp) AS DOUBLE) AS event_hour,
            CAST(COUNT(*) OVER (PARTITION BY username, date(event_timestamp)) AS DOUBLE) AS daily_event_count,
            CAST(bytes_transferred AS DOUBLE) AS bytes_transferred,
            CAST(session_duration_seconds AS DOUBLE) AS session_duration,
            CAST(failed_attempts_last_hour AS DOUBLE) AS failed_attempts,
            CAST(distinct_targets_last_hour AS DOUBLE) AS distinct_targets
        FROM {cfg.get_table_path("enriched_security_events")}
        WHERE event_date >= date_sub(current_date(), {baseline_days + detection_days})
          AND event_date < date_sub(current_date(), {detection_days})
          AND username IS NOT NULL
        """
        baseline_df = spark.sql(baseline_query)
        baseline_pandas = baseline_df.toPandas()

        # Build per-user distribution dictionaries
        feature_columns = [
            "event_hour", "daily_event_count", "bytes_transferred",
            "session_duration", "failed_attempts", "distinct_targets",
        ]

        user_baselines = {}
        for username, group in baseline_pandas.groupby("username"):
            user_baselines[username] = {
                col: group[col].dropna().values for col in feature_columns
            }

        baseline_user_count = len(user_baselines)
        mon.log_event("baselines_built", {"user_count": baseline_user_count, "baseline_days": baseline_days})

    # --- Load Detection Window Data ---
    with mon.time("load_detection_window"):
        detection_query = f"""
        SELECT
            username,
            CAST(hour(event_timestamp) AS DOUBLE) AS event_hour,
            CAST(COUNT(*) OVER (PARTITION BY username, date(event_timestamp)) AS DOUBLE) AS daily_event_count,
            CAST(bytes_transferred AS DOUBLE) AS bytes_transferred,
            CAST(session_duration_seconds AS DOUBLE) AS session_duration,
            CAST(failed_attempts_last_hour AS DOUBLE) AS failed_attempts,
            CAST(distinct_targets_last_hour AS DOUBLE) AS distinct_targets
        FROM {cfg.get_table_path("enriched_security_events")}
        WHERE event_date >= date_sub(current_date(), {detection_days})
          AND username IS NOT NULL
        """
        detection_df = spark.sql(detection_query)
        detection_pandas = detection_df.toPandas()

        detection_users = {}
        for username, group in detection_pandas.groupby("username"):
            detection_users[username] = {
                col: group[col].dropna().values for col in feature_columns
            }

        mon.log_event("detection_window_loaded", {"user_count": len(detection_users)})

    # --- KS Two-Sample Testing ---
    with mon.time("ks_testing"):
        ks_anomalies = []

        for username, current_features in detection_users.items():
            if username not in user_baselines:
                continue

            baseline_features = user_baselines[username]
            ks_results = multi_feature_ks_test(baseline_features, current_features, alpha=ks_alpha)

            # Check if user passes KS gate
            anomalous_count = sum(1 for r in ks_results.values() if r["is_anomalous"])
            if anomalous_count >= 2:  # At least 2 features anomalous
                ks_anomalies.append({
                    "username": username,
                    "ks_results": ks_results,
                    "anomalous_feature_count": anomalous_count,
                })

        mon.log_event("ks_testing_complete", {
            "users_tested": len(detection_users),
            "ks_anomalies_found": len(ks_anomalies),
        })

    # --- KMeans Clustering for Outlier Detection ---
    with mon.time("clustering"):
        mlflow.set_experiment("/Shared/security/ueba_behavioral_baseline")

        with mlflow.start_run(run_name=f"ueba_baseline_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}") as run:
            mlflow.log_param("baseline_days", baseline_days)
            mlflow.log_param("detection_days", detection_days)
            mlflow.log_param("ks_alpha", ks_alpha)
            mlflow.log_param("cluster_outlier_percentile", cluster_outlier_percentile)

            # Build user-level aggregate features for clustering
            user_agg_query = f"""
            SELECT
                username,
                CAST(COUNT(*) AS DOUBLE) AS total_events,
                CAST(COUNT(DISTINCT source_ip) AS DOUBLE) AS distinct_ips,
                CAST(AVG(bytes_transferred) AS DOUBLE) AS avg_bytes,
                CAST(STDDEV(bytes_transferred) AS DOUBLE) AS stddev_bytes,
                CAST(AVG(session_duration_seconds) AS DOUBLE) AS avg_session_duration,
                CAST(SUM(CASE WHEN hour(event_timestamp) BETWEEN 0 AND 5 THEN 1 ELSE 0 END) AS DOUBLE) AS off_hours_count,
                CAST(SUM(CASE WHEN event_type = 'authentication_failure' THEN 1 ELSE 0 END) AS DOUBLE) AS failed_auths
            FROM {cfg.get_table_path("enriched_security_events")}
            WHERE event_date >= date_sub(current_date(), {detection_days})
              AND username IS NOT NULL
            GROUP BY username
            """
            user_agg_df = spark.sql(user_agg_query).na.fill(0.0)

            cluster_feature_cols = [
                "total_events", "distinct_ips", "avg_bytes", "stddev_bytes",
                "avg_session_duration", "off_hours_count", "failed_auths",
            ]

            assembler = VectorAssembler(
                inputCols=cluster_feature_cols,
                outputCol="raw_features",
                handleInvalid="skip",
            )
            scaler = StandardScaler(
                inputCol="raw_features",
                outputCol="scaled_features",
                withStd=True,
                withMean=True,
            )
            kmeans = KMeans(
                featuresCol="scaled_features",
                predictionCol="cluster",
                k=5,
                seed=42,
                maxIter=50,
            )

            cluster_pipeline = Pipeline(stages=[assembler, scaler, kmeans])
            cluster_model = cluster_pipeline.fit(user_agg_df)
            clustered_df = cluster_model.transform(user_agg_df)

            # Compute distances to cluster centers
            kmeans_model = cluster_model.stages[-1]
            centers = kmeans_model.clusterCenters()

            mlflow.log_metric("num_clusters", len(centers))
            mlflow.log_metric("ks_anomalies_pre_filter", len(ks_anomalies))

    # --- Compute Cluster Distances and Apply Dual Gate ---
    with mon.time("dual_gate_detection"):
        # Collect clustered data for distance computation
        clustered_pandas = clustered_df.select("username", "cluster", "scaled_features").toPandas()

        # Compute distance from each user to their assigned cluster center
        user_distances = {}
        for _, row in clustered_pandas.iterrows():
            cluster_id = row["cluster"]
            features = row["scaled_features"].toArray()
            center = centers[cluster_id]
            distance = float(np.linalg.norm(features - center))
            user_distances[row["username"]] = distance

        # Determine outlier threshold
        all_distances = list(user_distances.values())
        if all_distances:
            outlier_threshold = float(np.percentile(all_distances, cluster_outlier_percentile))
        else:
            outlier_threshold = float("inf")

        # Apply dual gate: KS anomalous AND cluster outlier
        confirmed_anomalies = []
        for anomaly in ks_anomalies:
            username = anomaly["username"]
            distance = user_distances.get(username, 0.0)
            distance_percentile = (
                float(np.searchsorted(np.sort(all_distances), distance) / len(all_distances) * 100)
                if all_distances else 0.0
            )

            is_cluster_outlier = distance > outlier_threshold

            if is_cluster_outlier:
                # Both gates passed - confirmed anomaly
                composite_confidence = compute_composite_confidence(
                    anomaly["ks_results"], distance_percentile
                )

                # Determine anomaly type based on which features are anomalous
                anomalous_features = [
                    f for f, r in anomaly["ks_results"].items() if r["is_anomalous"]
                ]
                if "failed_attempts" in anomalous_features or "distinct_targets" in anomalous_features:
                    anomaly_type = "lateral_movement_pattern"
                elif "event_hour" in anomalous_features and "daily_event_count" in anomalous_features:
                    anomaly_type = "temporal_anomaly"
                elif "bytes_transferred" in anomalous_features:
                    anomaly_type = "data_exfiltration_pattern"
                else:
                    anomaly_type = "behavioral_deviation"

                # Determine risk level from composite confidence
                if composite_confidence >= 0.8:
                    risk_level = "critical"
                elif composite_confidence >= 0.6:
                    risk_level = "high"
                elif composite_confidence >= 0.4:
                    risk_level = "medium"
                else:
                    risk_level = "low"

                confirmed_anomalies.append({
                    "username": username,
                    "anomaly_type": anomaly_type,
                    "risk_level": risk_level,
                    "composite_confidence": composite_confidence,
                    "cluster_distance": distance,
                    "cluster_distance_percentile": distance_percentile,
                    "anomalous_features": ",".join(anomalous_features),
                    "anomalous_feature_count": anomaly["anomalous_feature_count"],
                    "detected_at": datetime.utcnow(),
                })

        mlflow.log_metric("confirmed_anomalies", len(confirmed_anomalies))
        mlflow.log_metric("outlier_threshold", outlier_threshold)

        mon.log_event("dual_gate_complete", {
            "ks_candidates": len(ks_anomalies),
            "confirmed_anomalies": len(confirmed_anomalies),
            "outlier_threshold": outlier_threshold,
        })

    # --- Persist Anomalies via DataFrame Write (safe - no raw SQL INSERT) ---
    with mon.time("persist_anomalies"):
        anomalies_table = cfg.get_table_path("user_behavior_anomalies")

        if confirmed_anomalies:
            # Build details JSON for each anomaly
            anomaly_rows = []
            for det in confirmed_anomalies:
                details_json = json.dumps({
                    "composite_confidence": det["composite_confidence"],
                    "cluster_distance": det["cluster_distance"],
                    "cluster_distance_percentile": det["cluster_distance_percentile"],
                    "anomalous_features": det["anomalous_features"],
                    "anomalous_feature_count": det["anomalous_feature_count"],
                    "detection_method": "dual_gate_ks_cluster",
                    "baseline_days": baseline_days,
                    "detection_days": detection_days,
                })
                anomaly_rows.append(Row(
                    username=det["username"],
                    anomaly_type=det["anomaly_type"],
                    risk_level=det["risk_level"],
                    detected_at=det["detected_at"],
                    details=details_json,
                ))

            anomaly_schema = StructType([
                StructField("username", StringType(), False),
                StructField("anomaly_type", StringType(), False),
                StructField("risk_level", StringType(), False),
                StructField("detected_at", TimestampType(), False),
                StructField("details", StringType(), True),
            ])

            anomalies_df = spark.createDataFrame(anomaly_rows, schema=anomaly_schema)
            anomalies_df.write.mode("append").saveAsTable(anomalies_table)

            mon.log_event("anomalies_persisted", {"count": len(confirmed_anomalies)})
        else:
            mon.log_event("no_anomalies_detected", {})

    # --- Log MLflow Model Artifact ---
    with mon.time("log_cluster_model"):
        mlflow.spark.log_model(
            cluster_model,
            "ueba_cluster_model",
            registered_model_name="security_ueba_clustering",
        )
        run_id = run.info.run_id

    # --- Finalize ---
    result.update({
        "baseline_days": baseline_days,
        "detection_days": detection_days,
        "baseline_users": baseline_user_count,
        "detection_users": len(detection_users),
        "ks_anomalies": len(ks_anomalies),
        "confirmed_anomalies": len(confirmed_anomalies),
        "outlier_threshold": outlier_threshold,
        "mlflow_run_id": run_id,
        "completed_at": datetime.utcnow().isoformat(),
    })
    mon.log_complete(result)

except Exception as e:
    result = {
        "notebook": "03_ueba_behavioral_baseline",
        "status": "error",
        "error": str(e),
        "error_type": type(e).__name__,
        "failed_at": datetime.utcnow().isoformat(),
    }
    mon.log_error(e, context={
        "baseline_days": baseline_days,
        "detection_days": detection_days,
    })
    raise

finally:
    dbutils.notebook.exit(json.dumps(result))
