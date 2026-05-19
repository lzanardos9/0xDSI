# Databricks notebook source
# MAGIC %md
# MAGIC # Agent 09 - Pattern Discovery Agent
# MAGIC Mines emergent attack patterns from event telemetry using unsupervised ML.
# MAGIC Discovers novel attack sequences not covered by existing correlation rules.

# COMMAND ----------

dbutils.widgets.text("catalog", "soc_platform", "Unity Catalog")
dbutils.widgets.text("schema", "agentic_soc", "Schema")

catalog = dbutils.widgets.get("catalog")
schema = dbutils.widgets.get("schema")
spark.sql(f"USE CATALOG {catalog}")
spark.sql(f"USE SCHEMA {schema}")

# COMMAND ----------

from pyspark.ml.feature import VectorAssembler, StringIndexer
from pyspark.ml.clustering import KMeans, BisectingKMeans
from pyspark.ml import Pipeline
from pyspark.sql import functions as F
import json
from datetime import datetime

# COMMAND ----------

# MAGIC %md
# MAGIC ## Feature Extraction from Events

# COMMAND ----------

event_features = spark.sql("""
    SELECT
        source_ip,
        dest_ip,
        event_type,
        username,
        COUNT(*) as event_count,
        COUNT(DISTINCT dest_ip) as unique_destinations,
        COUNT(DISTINCT event_type) as unique_event_types,
        SUM(CASE WHEN outcome = 'failure' THEN 1 ELSE 0 END) as failure_count,
        SUM(CASE WHEN severity = 'critical' THEN 4
                 WHEN severity = 'high' THEN 3
                 WHEN severity = 'medium' THEN 2
                 ELSE 1 END) as severity_score,
        MAX(UNIX_TIMESTAMP(timestamp)) - MIN(UNIX_TIMESTAMP(timestamp)) as time_span_seconds,
        COUNT(DISTINCT DATE(timestamp)) as active_days,
        HOUR(MIN(timestamp)) as first_hour,
        HOUR(MAX(timestamp)) as last_hour
    FROM events
    WHERE timestamp > current_timestamp() - INTERVAL 24 HOURS
    GROUP BY source_ip, dest_ip, event_type, username
    HAVING COUNT(*) >= 3
""")

print(f"Extracted features from {event_features.count()} event groups")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Clustering for Pattern Discovery

# COMMAND ----------

indexer_event = StringIndexer(inputCol="event_type", outputCol="event_type_idx", handleInvalid="keep")

assembler = VectorAssembler(
    inputCols=["event_count", "unique_destinations", "unique_event_types",
               "failure_count", "severity_score", "time_span_seconds",
               "active_days", "first_hour", "last_hour", "event_type_idx"],
    outputCol="features"
)

kmeans = KMeans(k=8, seed=42, maxIter=20, featuresCol="features", predictionCol="cluster")

pipeline = Pipeline(stages=[indexer_event, assembler, kmeans])
model = pipeline.fit(event_features)
clustered = model.transform(event_features)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Identify Anomalous Clusters

# COMMAND ----------

cluster_stats = clustered.groupBy("cluster").agg(
    F.count("*").alias("size"),
    F.avg("event_count").alias("avg_events"),
    F.avg("severity_score").alias("avg_severity"),
    F.avg("failure_count").alias("avg_failures"),
    F.avg("unique_destinations").alias("avg_destinations"),
    F.avg("time_span_seconds").alias("avg_time_span"),
).orderBy("avg_severity", ascending=False)

cluster_stats.show()

# Small clusters with high severity = potential novel attack patterns
anomalous_clusters = cluster_stats.filter(
    (F.col("size") < 20) & (F.col("avg_severity") > 2.5)
).collect()

print(f"Found {len(anomalous_clusters)} anomalous clusters (potential novel patterns)")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Extract and Describe Patterns

# COMMAND ----------

import mlflow.deployments
llm_client = mlflow.deployments.get_deploy_client("databricks")

discovered_patterns = []

for cluster_row in anomalous_clusters:
    cluster_id = cluster_row.cluster

    cluster_events = clustered.filter(F.col("cluster") == cluster_id).select(
        "source_ip", "dest_ip", "event_type", "username",
        "event_count", "unique_destinations", "failure_count", "severity_score"
    ).limit(50).collect()

    pattern_data = [{"src": e.source_ip, "dst": e.dest_ip, "type": e.event_type,
                     "user": e.username, "count": e.event_count,
                     "dests": e.unique_destinations, "fails": e.failure_count}
                    for e in cluster_events]

    response = llm_client.predict(
        endpoint="databricks-meta-llama-3-1-70b-instruct",
        inputs={
            "messages": [
                {"role": "system", "content": "You are a threat pattern analyst. Describe discovered attack patterns concisely. Identify the likely attack technique, severity, and recommended detection rule."},
                {"role": "user", "content": f"Describe this anomalous cluster pattern:\n{json.dumps(pattern_data[:10], indent=2)}\n\nCluster stats: size={cluster_row.size}, avg_severity={cluster_row.avg_severity:.1f}, avg_failures={cluster_row.avg_failures:.1f}\n\nRespond as JSON: {{\"pattern_name\": \"...\", \"description\": \"...\", \"attack_type\": \"...\", \"severity\": \"...\", \"recommended_rule\": \"...\"}}"}
            ],
            "max_tokens": 400,
            "temperature": 0.3
        }
    )

    try:
        content = response.choices[0].message.content
        start = content.find("{")
        end = content.rfind("}") + 1
        pattern_info = json.loads(content[start:end])
    except:
        pattern_info = {"pattern_name": f"Cluster-{cluster_id}", "description": "Anomalous pattern", "attack_type": "unknown", "severity": "medium", "recommended_rule": "manual review"}

    discovered_patterns.append({
        "cluster_id": cluster_id,
        "pattern_name": pattern_info.get("pattern_name", ""),
        "description": pattern_info.get("description", ""),
        "attack_type": pattern_info.get("attack_type", ""),
        "severity": pattern_info.get("severity", "medium"),
        "recommended_rule": pattern_info.get("recommended_rule", ""),
        "cluster_size": int(cluster_row.size),
        "avg_severity_score": float(cluster_row.avg_severity),
        "discovered_at": datetime.utcnow().isoformat(),
        "agent_name": "pattern-discovery",
    })

print(f"Discovered {len(discovered_patterns)} novel patterns")

# COMMAND ----------

if discovered_patterns:
    patterns_df = spark.createDataFrame(discovered_patterns)
    patterns_df.write.mode("append").saveAsTable("discovered_patterns")
