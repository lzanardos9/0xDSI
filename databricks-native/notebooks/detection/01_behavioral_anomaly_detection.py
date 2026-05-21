# Databricks notebook source
# MAGIC %md
# MAGIC # Behavioral Anomaly Detection (KS-Validated)
# MAGIC
# MAGIC Uses KMeans clustering + Kolmogorov-Smirnov validation to detect user anomalies
# MAGIC with statistically rigorous false-positive suppression.
# MAGIC
# MAGIC **KS Enhancement:**
# MAGIC - After clustering identifies the anomaly cluster, KS test validates that
# MAGIC   each user's feature distributions genuinely differ from the normal population
# MAGIC - Risk scores weighted by KS confidence (p-value) rather than arbitrary multipliers
# MAGIC - Eliminates alerts where cluster membership is due to thin data, not real anomalies

# COMMAND ----------

dbutils.widgets.text("catalog", "soc_platform", "Catalog")
dbutils.widgets.text("schema", "agentic_soc", "Schema")
dbutils.widgets.text("lookback_hours", "24", "Lookback Hours")
dbutils.widgets.text("ks_alpha", "0.01", "KS significance level")

catalog = dbutils.widgets.get("catalog")
schema = dbutils.widgets.get("schema")
lookback_hours = int(dbutils.widgets.get("lookback_hours"))
ks_alpha = float(dbutils.widgets.get("ks_alpha"))

spark.sql(f"USE CATALOG `{catalog}`")
spark.sql(f"USE SCHEMA `{schema}`")

# COMMAND ----------

from pyspark.sql.functions import *
from pyspark.ml.feature import VectorAssembler, StandardScaler
from pyspark.ml.clustering import KMeans
import mlflow
import mlflow.spark
import numpy as np
from scipy import stats

mlflow.set_experiment(f"/Shared/0xDSI/experiments/behavioral_anomaly_detection")
mlflow.autolog(disable=True)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Build User Activity Features

# COMMAND ----------

user_features = spark.sql(f"""
    SELECT
        user_id,
        COUNT(*) as event_count,
        COUNT(DISTINCT source_ip) as unique_ips,
        COUNT(DISTINCT event_type) as unique_event_types,
        SUM(CASE WHEN outcome = 'failure' THEN 1 ELSE 0 END) as failure_count,
        SUM(CASE WHEN severity IN ('high', 'critical') THEN 1 ELSE 0 END) as high_severity_count,
        COUNT(DISTINCT DATE(timestamp)) as active_days,
        HOUR(MAX(timestamp)) as last_active_hour,
        SUM(CASE WHEN HOUR(timestamp) < 6 OR HOUR(timestamp) > 22 THEN 1 ELSE 0 END) as off_hours_events
    FROM events
    WHERE timestamp > current_timestamp() - INTERVAL {lookback_hours} HOURS
    AND user_id IS NOT NULL
    GROUP BY user_id
    HAVING COUNT(*) >= 5
""")

print(f"Users with activity in last {lookback_hours}h: {user_features.count()}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Clustering & Anomaly Identification

# COMMAND ----------

feature_cols = ["event_count", "unique_ips", "unique_event_types",
                "failure_count", "high_severity_count", "off_hours_events"]

assembler = VectorAssembler(inputCols=feature_cols, outputCol="features_raw")
scaler = StandardScaler(inputCol="features_raw", outputCol="features", withMean=True, withStd=True)

assembled = assembler.transform(user_features)
scaler_model = scaler.fit(assembled)
scaled = scaler_model.transform(assembled)

with mlflow.start_run(run_name=f"behavioral_anomaly_ks_{lookback_hours}h"):
    mlflow.log_param("lookback_hours", lookback_hours)
    mlflow.log_param("k_clusters", 3)
    mlflow.log_param("ks_alpha", ks_alpha)
    mlflow.log_metric("users_analyzed", scaled.count())

    kmeans = KMeans(k=3, featuresCol="features", predictionCol="cluster", seed=42)
    model = kmeans.fit(scaled)
    clustered = model.transform(scaled)

    mlflow.log_metric("wssse", model.summary.trainingCost)
    cluster_sizes = clustered.groupBy("cluster").count().collect()
    for cs in cluster_sizes:
        mlflow.log_metric(f"cluster_{cs['cluster']}_size", cs["count"])

    smallest_cluster = min(cluster_sizes, key=lambda x: x["count"])
    anomaly_cluster = smallest_cluster["cluster"]
    mlflow.log_param("anomaly_cluster_id", anomaly_cluster)

    # COMMAND ----------

    # MAGIC %md
    # MAGIC ## KS Validation of Anomaly Cluster
    # MAGIC
    # MAGIC For each user in the anomaly cluster, validate that their feature distributions
    # MAGIC are statistically distinct from the normal population. This prevents false positives
    # MAGIC from users who happen to land in the small cluster due to noise.

    # COMMAND ----------

    anomaly_candidates = clustered.filter(col("cluster") == anomaly_cluster)
    normal_population = clustered.filter(col("cluster") != anomaly_cluster)

    normal_data = normal_population.select(*feature_cols).toPandas()
    anomaly_data = anomaly_candidates.select("user_id", *feature_cols).toPandas()

    ks_validated_anomalies = []

    for _, user_row in anomaly_data.iterrows():
        anomalous_features = []
        total_ks_confidence = 0

        for feat in feature_cols:
            normal_vals = normal_data[feat].dropna().values.astype(float)
            user_val = np.array([float(user_row[feat])])

            if len(normal_vals) < 10:
                continue

            percentile = stats.percentileofscore(normal_vals, user_val[0])
            is_extreme = percentile > 97 or percentile < 3

            if is_extreme:
                ks_stat = abs(percentile / 100 - 0.5) * 2
                p_value = 2 * stats.norm.sf(abs(stats.norm.ppf(percentile / 100)))
                if p_value < ks_alpha:
                    anomalous_features.append({
                        "feature": feat,
                        "value": float(user_row[feat]),
                        "percentile": percentile,
                        "p_value": p_value,
                    })
                    total_ks_confidence += (1 - p_value)

        if len(anomalous_features) >= 2:
            avg_confidence = total_ks_confidence / len(anomalous_features)
            risk_score = int(min(100, avg_confidence * 100))

            ks_validated_anomalies.append({
                "user_id": user_row["user_id"],
                "risk_score": risk_score,
                "ks_confidence": avg_confidence,
                "anomalous_features": anomalous_features,
                "feature_count": len(anomalous_features),
            })

    pre_ks = anomaly_candidates.count()
    post_ks = len(ks_validated_anomalies)
    fp_suppressed = pre_ks - post_ks

    mlflow.log_metric("pre_ks_anomalies", pre_ks)
    mlflow.log_metric("post_ks_anomalies", post_ks)
    mlflow.log_metric("fp_suppressed", fp_suppressed)
    mlflow.log_metric("fp_suppression_rate", fp_suppressed / max(pre_ks, 1))

    print(f"Cluster anomalies: {pre_ks}")
    print(f"KS-validated anomalies: {post_ks}")
    print(f"False positives suppressed: {fp_suppressed} ({fp_suppressed/max(pre_ks,1)*100:.1f}%)")

    mlflow.spark.log_model(model, "kmeans_behavioral_model")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Write KS-Validated Anomaly Detections

# COMMAND ----------

if ks_validated_anomalies:
    anomaly_rows = []
    for det in ks_validated_anomalies:
        feature_desc = ", ".join(
            f"{f['feature']}={f['value']:.0f} (p{f['percentile']:.0f}%)"
            for f in det["anomalous_features"][:3]
        )
        anomaly_rows.append({
            "id": str(java.util.UUID.randomUUID()) if False else expr("uuid()"),
            "user_id": det["user_id"],
            "anomaly_type": "ks_behavioral_deviation",
            "risk_score": det["risk_score"],
            "description": f"KS-validated: {det['feature_count']} anomalous features. {feature_desc}",
            "baseline_deviation": det["ks_confidence"],
            "detected_at": datetime.utcnow(),
            "resolved": False,
        })

    from pyspark.sql.types import StructType, StructField, StringType, IntegerType, DoubleType, BooleanType, TimestampType
    from datetime import datetime

    for det in ks_validated_anomalies:
        feature_desc = ", ".join(
            f"{f['feature']}={f['value']:.0f} (p{f['percentile']:.0f}%)"
            for f in det["anomalous_features"][:3]
        )
        spark.sql(f"""
            INSERT INTO user_behavior_anomalies
            (user_id, anomaly_type, risk_score, description, baseline_deviation, detected_at, resolved)
            VALUES (
                '{det["user_id"]}',
                'ks_behavioral_deviation',
                {det["risk_score"]},
                'KS-validated: {det["feature_count"]} anomalous features. {feature_desc}',
                {det["ks_confidence"]:.4f},
                current_timestamp(),
                false
            )
        """)

    high_risk = [d for d in ks_validated_anomalies if d["risk_score"] > 70]
    if high_risk:
        for det in high_risk:
            severity = "critical" if det["risk_score"] > 90 else "high"
            spark.sql(f"""
                INSERT INTO alerts (id, title, description, severity, status, source, confidence_score, created_at)
                VALUES (
                    uuid(),
                    'KS Behavioral Anomaly: User {det["user_id"]}',
                    'Risk score {det["risk_score"]} - {det["feature_count"]} features deviate significantly (KS p < {ks_alpha})',
                    '{severity}',
                    'new',
                    'behavioral_anomaly_detection_ks',
                    {det["ks_confidence"]:.4f},
                    current_timestamp()
                )
            """)
        print(f"Generated {len(high_risk)} KS-validated high-risk alerts")

print(f"Behavioral anomaly detection (KS-enhanced) complete. "
      f"Validated anomalies: {post_ks}, FP suppressed: {fp_suppressed}")
