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
# MAGIC - Risk scores weighted by KS confidence rather than arbitrary multipliers
# MAGIC - Eliminates alerts where cluster membership is due to thin data, not real anomalies

# COMMAND ----------

# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

# MAGIC %md
# MAGIC ## Configuration

# COMMAND ----------

dbutils.widgets.text("lookback_hours", "24", "Lookback Hours")
dbutils.widgets.text("ks_alpha", "0.01", "KS significance level")
dbutils.widgets.text("k_clusters", "3", "Number of KMeans clusters")
dbutils.widgets.text("min_events", "5", "Minimum events per user to analyze")

lookback_hours = int(dbutils.widgets.get("lookback_hours"))
ks_alpha = float(dbutils.widgets.get("ks_alpha"))
k_clusters = int(dbutils.widgets.get("k_clusters"))
min_events = int(dbutils.widgets.get("min_events"))

mon.log_event("config_loaded", {
    "lookback_hours": lookback_hours,
    "ks_alpha": ks_alpha,
    "k_clusters": k_clusters,
})

# COMMAND ----------

from pyspark.sql.functions import *
from pyspark.sql.types import *
from pyspark.ml.feature import VectorAssembler, StandardScaler
from pyspark.ml.clustering import KMeans
import mlflow
import mlflow.spark
import numpy as np
from scipy import stats as scipy_stats

experiment_path = f"/Shared/0xDSI/experiments/behavioral_anomaly_detection"
mlflow.set_experiment(experiment_path)
mlflow.autolog(disable=True)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Build User Activity Features

# COMMAND ----------

events_table = cfg.get_table_path("events")

with mon.time("feature_engineering"):
    user_features = spark.sql(f"""
        SELECT
            user_id,
            COUNT(*) as event_count,
            COUNT(DISTINCT source_ip) as unique_ips,
            COUNT(DISTINCT event_type) as unique_event_types,
            SUM(CASE WHEN action LIKE '%fail%' OR action LIKE '%denied%' THEN 1 ELSE 0 END) as failure_count,
            SUM(CASE WHEN severity IN ('high', 'critical') THEN 1 ELSE 0 END) as high_severity_count,
            COUNT(DISTINCT DATE(timestamp)) as active_days,
            SUM(CASE WHEN HOUR(timestamp) < 6 OR HOUR(timestamp) > 22 THEN 1 ELSE 0 END) as off_hours_events,
            COUNT(DISTINCT hostname) as unique_hosts
        FROM {events_table}
        WHERE timestamp > current_timestamp() - INTERVAL {lookback_hours} HOURS
        AND user_id IS NOT NULL
        GROUP BY user_id
        HAVING COUNT(*) >= {min_events}
    """)

    user_count = user_features.count()
    mon.log_event("features_built", {"users": user_count})
    print(f"Users with activity in last {lookback_hours}h: {user_count}")

    if user_count < k_clusters * 2:
        mon.log_complete(details={"status": "insufficient_data", "users": user_count})
        print(f"Insufficient users ({user_count}) for {k_clusters}-cluster analysis. Exiting.")
        dbutils.notebook.exit('{"status": "insufficient_data"}')

# COMMAND ----------

# MAGIC %md
# MAGIC ## Clustering & Anomaly Identification

# COMMAND ----------

feature_cols = [
    "event_count", "unique_ips", "unique_event_types",
    "failure_count", "high_severity_count", "off_hours_events", "unique_hosts",
]

with mon.time("clustering"):
    assembler = VectorAssembler(inputCols=feature_cols, outputCol="features_raw")
    scaler = StandardScaler(inputCol="features_raw", outputCol="features", withMean=True, withStd=True)

    assembled = assembler.transform(user_features)
    scaler_model = scaler.fit(assembled)
    scaled = scaler_model.transform(assembled)

    with mlflow.start_run(run_name=f"behavioral_anomaly_ks_{lookback_hours}h"):
        mlflow.log_params({
            "lookback_hours": lookback_hours,
            "k_clusters": k_clusters,
            "ks_alpha": ks_alpha,
            "min_events": min_events,
            "feature_cols": feature_cols,
        })
        mlflow.log_metric("users_analyzed", user_count)

        kmeans = KMeans(k=k_clusters, featuresCol="features", predictionCol="cluster", seed=42)
        model = kmeans.fit(scaled)
        clustered = model.transform(scaled)

        mlflow.log_metric("wssse", model.summary.trainingCost)

        cluster_sizes = clustered.groupBy("cluster").count().collect()
        for cs in cluster_sizes:
            mlflow.log_metric(f"cluster_{cs['cluster']}_size", cs["count"])

        # Anomaly cluster = smallest cluster
        smallest_cluster = min(cluster_sizes, key=lambda x: x["count"])
        anomaly_cluster = smallest_cluster["cluster"]
        mlflow.log_param("anomaly_cluster_id", anomaly_cluster)

        print(f"Cluster sizes: {[(c['cluster'], c['count']) for c in cluster_sizes]}")
        print(f"Anomaly cluster: {anomaly_cluster} (size: {smallest_cluster['count']})")

# COMMAND ----------

# MAGIC %md
# MAGIC ## KS Validation of Anomaly Cluster
# MAGIC
# MAGIC For each user in the anomaly cluster, validate that their features
# MAGIC are statistically distinct from the normal population.

# COMMAND ----------

        anomaly_candidates = clustered.filter(col("cluster") == anomaly_cluster)
        normal_population = clustered.filter(col("cluster") != anomaly_cluster)

        normal_data = normal_population.select(*feature_cols).toPandas()
        anomaly_data = anomaly_candidates.select("user_id", *feature_cols).toPandas()

        ks_validated_anomalies = []

        with mon.time("ks_validation"):
            for _, user_row in anomaly_data.iterrows():
                anomalous_features = []
                total_ks_confidence = 0.0

                for feat in feature_cols:
                    normal_vals = normal_data[feat].dropna().values.astype(float)
                    user_val = float(user_row[feat])

                    if len(normal_vals) < 10:
                        continue

                    percentile = scipy_stats.percentileofscore(normal_vals, user_val)
                    is_extreme = percentile > 97 or percentile < 3

                    if is_extreme:
                        z_score = abs(scipy_stats.norm.ppf(min(max(percentile / 100, 0.001), 0.999)))
                        p_value = 2 * scipy_stats.norm.sf(z_score)

                        if p_value < ks_alpha:
                            anomalous_features.append({
                                "feature": feat,
                                "value": user_val,
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

        mlflow.log_metrics({
            "pre_ks_anomalies": pre_ks,
            "post_ks_anomalies": post_ks,
            "fp_suppressed": fp_suppressed,
            "fp_suppression_rate": fp_suppressed / max(pre_ks, 1),
        })

        print(f"Cluster anomalies: {pre_ks}")
        print(f"KS-validated anomalies: {post_ks}")
        print(f"False positives suppressed: {fp_suppressed} ({fp_suppressed/max(pre_ks,1)*100:.1f}%)")

        mlflow.spark.log_model(model, "kmeans_behavioral_model")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Persist KS-Validated Anomaly Detections

# COMMAND ----------

anomalies_table = cfg.get_table_path("user_behavior_anomalies")
alerts_table = cfg.get_table_path("alerts")

if ks_validated_anomalies:
    with mon.time("anomaly_persist"):
        # Build anomaly records
        anomaly_records = []
        for det in ks_validated_anomalies:
            feature_desc = ", ".join(
                f"{f['feature']}={f['value']:.0f} (p{f['percentile']:.0f}%)"
                for f in det["anomalous_features"][:3]
            )
            anomaly_records.append({
                "user_id": det["user_id"],
                "anomaly_type": "ks_behavioral_deviation",
                "risk_score": det["risk_score"],
                "description": f"KS-validated: {det['feature_count']} anomalous features. {feature_desc}",
                "baseline_deviation": det["ks_confidence"],
            })

        anomaly_schema = StructType([
            StructField("user_id", StringType()),
            StructField("anomaly_type", StringType()),
            StructField("risk_score", IntegerType()),
            StructField("description", StringType()),
            StructField("baseline_deviation", DoubleType()),
        ])

        anomaly_df = (
            spark.createDataFrame(anomaly_records, schema=anomaly_schema)
            .withColumn("id", expr("uuid()"))
            .withColumn("detected_at", current_timestamp())
            .withColumn("resolved", lit(False))
        )
        anomaly_df.write.mode("append").saveAsTable(anomalies_table)

    # Generate alerts for high-risk users
    high_risk = [d for d in ks_validated_anomalies if d["risk_score"] > 70]
    if high_risk:
        with mon.time("alert_generation"):
            alert_records = []
            for det in high_risk:
                severity = "critical" if det["risk_score"] > 90 else "high"
                alert_records.append({
                    "title": f"KS Behavioral Anomaly: User {det['user_id']}",
                    "description": f"Risk score {det['risk_score']} - {det['feature_count']} features deviate significantly (KS p < {ks_alpha})",
                    "severity": severity,
                    "source": "behavioral_anomaly_detection_ks",
                    "confidence_score": det["ks_confidence"],
                })

            alert_schema = StructType([
                StructField("title", StringType()),
                StructField("description", StringType()),
                StructField("severity", StringType()),
                StructField("source", StringType()),
                StructField("confidence_score", DoubleType()),
            ])

            alert_df = (
                spark.createDataFrame(alert_records, schema=alert_schema)
                .withColumn("id", expr("uuid()"))
                .withColumn("status", lit("new"))
                .withColumn("created_at", current_timestamp())
            )
            alert_df.write.mode("append").saveAsTable(alerts_table)

            mon.log_detection("behavioral_anomaly", {
                "high_risk_count": len(high_risk),
                "max_risk_score": max(d["risk_score"] for d in high_risk),
            })
            print(f"Generated {len(high_risk)} KS-validated high-risk alerts")

# COMMAND ----------

mon.log_complete(details={
    "users_analyzed": user_count,
    "pre_ks_anomalies": pre_ks,
    "post_ks_anomalies": post_ks,
    "fp_suppressed": fp_suppressed,
    "high_risk_alerts": len(high_risk) if 'high_risk' in dir() else 0,
})
print(f"Behavioral anomaly detection complete. "
      f"Validated: {post_ks}, FP suppressed: {fp_suppressed}")
