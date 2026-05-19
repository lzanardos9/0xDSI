# Databricks notebook source
# MAGIC %md
# MAGIC # ML - User & Entity Behavior Analytics (UEBA) Baseline
# MAGIC Builds behavioral baselines for users and entities. Detects deviations
# MAGIC from normal patterns using statistical methods and ML clustering.

# COMMAND ----------

dbutils.widgets.text("catalog", "soc_platform", "Unity Catalog")
dbutils.widgets.text("schema", "agentic_soc", "Schema")

catalog = dbutils.widgets.get("catalog")
schema = dbutils.widgets.get("schema")
spark.sql(f"USE CATALOG {catalog}")
spark.sql(f"USE SCHEMA {schema}")

# COMMAND ----------

from pyspark.sql import functions as F
from pyspark.ml.feature import VectorAssembler, StandardScaler
from pyspark.ml.clustering import KMeans
from pyspark.ml import Pipeline
from datetime import datetime

# COMMAND ----------

# MAGIC %md
# MAGIC ## Build User Behavioral Profiles

# COMMAND ----------

user_profiles = spark.sql("""
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
    WHERE timestamp > current_timestamp() - INTERVAL 30 DAYS
      AND username IS NOT NULL AND username != ''
    GROUP BY username
    HAVING COUNT(*) >= 20
""")

print(f"Building baselines for {user_profiles.count()} users")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Cluster Users by Behavior

# COMMAND ----------

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

# COMMAND ----------

# MAGIC %md
# MAGIC ## Detect Anomalous Behavior (Last Hour)

# COMMAND ----------

recent_behavior = spark.sql("""
    SELECT username,
           COUNT(*) as recent_events,
           COUNT(DISTINCT dest_ip) as recent_unique_dests,
           SUM(CASE WHEN outcome = 'failure' THEN 1 ELSE 0 END) as recent_failures,
           SUM(CASE WHEN severity IN ('high', 'critical') THEN 1 ELSE 0 END) as recent_high_sev
    FROM events
    WHERE timestamp > current_timestamp() - INTERVAL 1 HOUR
      AND username IS NOT NULL
    GROUP BY username
""")

# Compare to baseline
anomalies = recent_behavior.join(
    user_profiles.select("username", "total_events", "unique_dest_ips", "failure_rate", "active_days"),
    "username"
).withColumn(
    "daily_avg_events", F.col("total_events") / F.greatest(F.col("active_days"), F.lit(1))
).withColumn(
    "event_ratio", F.col("recent_events") / F.greatest(F.col("daily_avg_events") / 24, F.lit(1))
).withColumn(
    "dest_ratio", F.col("recent_unique_dests") / F.greatest(F.col("unique_dest_ips") / F.col("active_days"), F.lit(1))
).filter(
    (F.col("event_ratio") > 5) | (F.col("dest_ratio") > 10) | (F.col("recent_failures") > 20)
)

anomaly_count = anomalies.count()
if anomaly_count > 0:
    print(f"UEBA detected {anomaly_count} behavioral anomalies")
    for row in anomalies.collect():
        spark.sql(f"""
            INSERT INTO user_behavior_anomalies (username, anomaly_type, risk_level, detected_at, details)
            VALUES ('{row.username}', 'behavioral_deviation', 'high', current_timestamp(),
                    'Event ratio: {row.event_ratio:.1f}x, Dest ratio: {row.dest_ratio:.1f}x')
        """)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Save Baseline Model

# COMMAND ----------

import mlflow

with mlflow.start_run(run_name="ueba_baseline"):
    mlflow.spark.log_model(model, "ueba_behavior_model")
    mlflow.log_metric("users_profiled", user_profiles.count())
    mlflow.log_metric("anomalies_detected", anomaly_count)
    mlflow.log_param("baseline_days", 30)
    mlflow.log_param("clusters", 5)

print(f"UEBA baseline complete. Users: {user_profiles.count()}, Anomalies: {anomaly_count}")
