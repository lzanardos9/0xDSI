# Databricks notebook source
# MAGIC %md
# MAGIC # Agent 10: Behavioral Anomaly Detection (ML)
# MAGIC Uses Isolation Forest and statistical baselines to detect user anomalies.

# COMMAND ----------

dbutils.widgets.text("catalog", "soc_platform", "Catalog")
dbutils.widgets.text("schema", "agentic_soc", "Schema")
dbutils.widgets.text("lookback_hours", "24", "Lookback Hours")

catalog = dbutils.widgets.get("catalog")
schema = dbutils.widgets.get("schema")
lookback_hours = int(dbutils.widgets.get("lookback_hours"))

spark.sql(f"USE CATALOG `{catalog}`")
spark.sql(f"USE SCHEMA `{schema}`")

# COMMAND ----------

from pyspark.sql.functions import *
from pyspark.ml.feature import VectorAssembler, StandardScaler
from pyspark.ml.clustering import KMeans
import mlflow
import mlflow.spark
import numpy as np

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
# MAGIC ## Anomaly Scoring

# COMMAND ----------

feature_cols = ["event_count", "unique_ips", "unique_event_types",
                "failure_count", "high_severity_count", "off_hours_events"]

assembler = VectorAssembler(inputCols=feature_cols, outputCol="features_raw")
scaler = StandardScaler(inputCol="features_raw", outputCol="features", withMean=True, withStd=True)

assembled = assembler.transform(user_features)
scaler_model = scaler.fit(assembled)
scaled = scaler_model.transform(assembled)

with mlflow.start_run(run_name=f"behavioral_anomaly_{lookback_hours}h"):
    mlflow.log_param("lookback_hours", lookback_hours)
    mlflow.log_param("k_clusters", 3)
    mlflow.log_param("risk_threshold", 30)
    mlflow.log_metric("users_analyzed", scaled.count())

    kmeans = KMeans(k=3, featuresCol="features", predictionCol="cluster", seed=42)
    model = kmeans.fit(scaled)
    clustered = model.transform(scaled)

    # Log cluster quality metrics
    mlflow.log_metric("wssse", model.summary.trainingCost)
    cluster_sizes = clustered.groupBy("cluster").count().collect()
    for cs in cluster_sizes:
        mlflow.log_metric(f"cluster_{cs['cluster']}_size", cs["count"])

    smallest_cluster = min(cluster_sizes, key=lambda x: x["count"])
    anomaly_cluster = smallest_cluster["cluster"]
    mlflow.log_param("anomaly_cluster_id", anomaly_cluster)

    anomalies = (
        clustered
        .filter(col("cluster") == anomaly_cluster)
        .withColumn("risk_score",
            (col("failure_count") * 10 + col("off_hours_events") * 15 + col("unique_ips") * 5)
            .cast("int")
        )
        .filter(col("risk_score") > 30)
    )

    anomaly_count = anomalies.count()
    mlflow.log_metric("anomalies_detected", anomaly_count)
    mlflow.log_metric("anomaly_rate", anomaly_count / max(1, scaled.count()))

    # Log model to registry for versioning
    mlflow.spark.log_model(model, "kmeans_behavioral_model")

    print(f"Anomalous users detected: {anomaly_count}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Write Anomaly Detections

# COMMAND ----------

if anomalies.count() > 0:
    anomaly_records = (
        anomalies
        .withColumn("id", expr("uuid()"))
        .withColumn("anomaly_type", lit("behavioral_deviation"))
        .withColumn("description", concat(
            lit("User showed "), col("event_count"), lit(" events, "),
            col("unique_ips"), lit(" unique IPs, "),
            col("off_hours_events"), lit(" off-hours events")
        ))
        .withColumn("baseline_deviation", col("risk_score").cast("double") / lit(100.0))
        .withColumn("detected_at", current_timestamp())
        .withColumn("resolved", lit(False))
        .select("id", "user_id", "anomaly_type", "risk_score", "description",
                "baseline_deviation", "detected_at", "resolved")
    )
    anomaly_records.write.mode("append").saveAsTable("user_behavior_anomalies")

    high_risk = anomalies.filter(col("risk_score") > 70)
    if high_risk.count() > 0:
        alerts = (
            high_risk
            .withColumn("id", expr("uuid()"))
            .withColumn("title", concat(lit("Behavioral Anomaly: User "), col("user_id")))
            .withColumn("description", concat(
                lit("Risk score "), col("risk_score"),
                lit(" - Abnormal activity pattern detected")
            ))
            .withColumn("severity", when(col("risk_score") > 90, lit("critical")).otherwise(lit("high")))
            .withColumn("status", lit("new"))
            .withColumn("source", lit("behavioral_anomaly_detection"))
            .withColumn("confidence_score", col("risk_score").cast("double") / lit(100.0))
            .withColumn("created_at", current_timestamp())
            .select("id", "title", "description", "severity", "status", "source",
                    "confidence_score", "created_at")
        )
        alerts.write.mode("append").saveAsTable("alerts")
        print(f"Generated {high_risk.count()} high-risk behavioral alerts")

print("Behavioral anomaly detection complete")
