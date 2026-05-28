# Databricks notebook source
# MAGIC %md
# MAGIC # Agent 09 - Pattern Discovery
# MAGIC Uses unsupervised ML (KMeans clustering) to discover novel attack patterns
# MAGIC not covered by existing detection rules. Identifies anomalous clusters and
# MAGIC uses LLM to describe discovered patterns and recommend new detection rules.

# COMMAND ----------

# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

require_enabled("pattern_discovery")

# COMMAND ----------

import json
import numpy as np
from datetime import datetime, timedelta
from pyspark.sql import functions as F
from pyspark.ml.feature import VectorAssembler, StandardScaler
from pyspark.ml.clustering import KMeans

# COMMAND ----------

# MAGIC %md
# MAGIC ## Configuration

# COMMAND ----------

dbutils.widgets.text("lookback_hours", "24", "Event lookback window")
dbutils.widgets.text("num_clusters", "8", "Max KMeans clusters")
dbutils.widgets.text("min_events_per_ip", "5", "Min events to include IP")

lookback_hours = int(dbutils.widgets.get("lookback_hours"))
num_clusters = int(dbutils.widgets.get("num_clusters"))
min_events_per_ip = int(dbutils.widgets.get("min_events_per_ip"))

mon.log_event("config_loaded", {
    "lookback_hours": lookback_hours,
    "num_clusters": num_clusters,
    "min_events_per_ip": min_events_per_ip,
})

# COMMAND ----------

# MAGIC %md
# MAGIC ## Ensure Output Table Exists

# COMMAND ----------

spark.sql(f"""
CREATE TABLE IF NOT EXISTS {cfg.get_table_path('discovered_patterns')} (
    pattern_id STRING,
    discovered_at TIMESTAMP,
    cluster_id INT,
    cluster_size INT,
    avg_severity FLOAT,
    unique_ips INT,
    unique_event_types INT,
    description STRING,
    recommended_rules STRING,
    threat_category STRING,
    confidence FLOAT,
    status STRING
)
USING DELTA
""")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Feature Engineering

# COMMAND ----------

def build_feature_matrix(lookback_hours, min_events):
    """Build per-source_ip feature vectors from recent security events."""
    events_table = cfg.get_table_path("events")
    cutoff = datetime.utcnow() - timedelta(hours=lookback_hours)

    features_df = (
        spark.table(events_table)
        .filter(F.col("timestamp") >= F.lit(cutoff))
        .groupBy("source_ip")
        .agg(
            F.count("*").alias("event_count"),
            F.countDistinct("dest_ip").alias("unique_ips"),
            F.countDistinct("event_type").alias("unique_event_types"),
            F.avg(
                F.when(F.col("severity") == "critical", 4)
                .when(F.col("severity") == "high", 3)
                .when(F.col("severity") == "medium", 2)
                .otherwise(1)
            ).alias("avg_severity"),
            F.max(
                F.when(F.col("severity") == "critical", 4)
                .when(F.col("severity") == "high", 3)
                .when(F.col("severity") == "medium", 2)
                .otherwise(1)
            ).alias("max_severity"),
            F.countDistinct(F.hour("timestamp")).alias("active_hours"),
            F.collect_set("event_type").alias("event_type_list"),
        )
        .filter(F.col("event_count") >= min_events)
    )
    return features_df

# COMMAND ----------

# MAGIC %md
# MAGIC ## KMeans Clustering

# COMMAND ----------

def run_clustering(features_df, k):
    """Run KMeans clustering on scaled feature vectors."""
    feature_cols = [
        "event_count", "unique_ips", "unique_event_types",
        "avg_severity", "max_severity", "active_hours",
    ]
    assembler = VectorAssembler(inputCols=feature_cols, outputCol="features_raw")
    assembled_df = assembler.transform(features_df)

    scaler = StandardScaler(inputCol="features_raw", outputCol="features", withStd=True, withMean=True)
    scaled_df = scaler.fit(assembled_df).transform(assembled_df)

    kmeans = KMeans(k=k, seed=42, featuresCol="features", predictionCol="cluster")
    model = kmeans.fit(scaled_df)
    return model.transform(scaled_df), model

# COMMAND ----------

# MAGIC %md
# MAGIC ## Anomalous Cluster Detection

# COMMAND ----------

def identify_anomalous_clusters(clustered_df, top_n=3):
    """Find smallest clusters with highest severity -- likely novel attacks."""
    total_ips = clustered_df.count()

    cluster_stats = (
        clustered_df.groupBy("cluster")
        .agg(
            F.count("*").alias("cluster_size"),
            F.avg("avg_severity").alias("cluster_avg_severity"),
            F.max("max_severity").alias("cluster_max_severity"),
            F.sum("event_count").alias("total_events"),
            F.collect_list("source_ip").alias("source_ips"),
            F.flatten(F.collect_list("event_type_list")).alias("all_event_types"),
        )
        .withColumn("size_ratio", F.col("cluster_size") / F.lit(total_ips))
        .withColumn("anomaly_score", (F.lit(1.0) - F.col("size_ratio")) * F.col("cluster_avg_severity"))
        .orderBy(F.col("anomaly_score").desc())
        .limit(top_n)
    )
    return cluster_stats.collect()

# COMMAND ----------

# MAGIC %md
# MAGIC ## LLM Pattern Description

# COMMAND ----------

def describe_pattern_with_llm(cluster_row):
    """Use LLM to describe discovered pattern and recommend detection rules."""
    event_types = list(set(cluster_row["all_event_types"]))[:15]
    sample_ips = cluster_row["source_ips"][:5]

    prompt = (
        "Analyze this anomalous cluster from SOC event data. Provide:\n"
        "1. A concise description of the likely attack pattern\n"
        "2. Recommended detection rules\n\n"
        f"Cluster statistics:\n"
        f"- Size: {cluster_row['cluster_size']} unique source IPs\n"
        f"- Average severity: {cluster_row['cluster_avg_severity']:.2f}\n"
        f"- Max severity: {cluster_row['cluster_max_severity']:.2f}\n"
        f"- Total events: {cluster_row['total_events']}\n"
        f"- Event types: {event_types}\n"
        f"- Sample IPs: {sample_ips}\n\n"
        'Respond as JSON: {"description": "...", "recommended_rules": ["rule1", "rule2"], '
        '"threat_category": "...", "confidence": 0.0-1.0}'
    )
    return llm.extract_json(prompt)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Main Execution

# COMMAND ----------

result = {"status": "failed", "patterns_discovered": 0, "errors": []}

try:
    with mon.time("pattern_discovery_total"):
        # Step 1: Build feature matrix
        with mon.time("feature_engineering"):
            features_df = build_feature_matrix(lookback_hours, min_events_per_ip)
            ip_count = features_df.count()
            mon.log_event("features_built", {"unique_ips": ip_count})

        if ip_count < 10:
            result = {"status": "skipped", "reason": "insufficient_data", "unique_ips": ip_count}
            mon.log_info(f"Skipping: only {ip_count} IPs (need >= 10)")
        else:
            # Step 2: Cluster
            with mon.time("clustering"):
                k = min(num_clusters, max(3, ip_count // 10))
                clustered_df, model = run_clustering(features_df, k)
                mon.log_event("clustering_complete", {"k": k, "ip_count": ip_count})

            # Step 3: Find anomalous clusters
            with mon.time("anomaly_detection"):
                anomalous = identify_anomalous_clusters(clustered_df, top_n=3)
                mon.log_event("anomalous_clusters_found", {"count": len(anomalous)})

            # Step 4: Describe each pattern via LLM
            patterns = []
            for cluster_row in anomalous:
                try:
                    with mon.time("llm_describe_pattern"):
                        llm_result = describe_pattern_with_llm(cluster_row)

                    patterns.append({
                        "pattern_id": f"PAT-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}-C{cluster_row['cluster']}",
                        "discovered_at": datetime.utcnow().isoformat(),
                        "cluster_id": int(cluster_row["cluster"]),
                        "cluster_size": int(cluster_row["cluster_size"]),
                        "avg_severity": float(cluster_row["cluster_avg_severity"]),
                        "unique_ips": int(cluster_row["cluster_size"]),
                        "unique_event_types": len(set(cluster_row["all_event_types"])),
                        "description": llm_result.get("description", "Unknown pattern"),
                        "recommended_rules": json.dumps(llm_result.get("recommended_rules", [])),
                        "threat_category": llm_result.get("threat_category", "unknown"),
                        "confidence": float(llm_result.get("confidence", 0.5)),
                        "status": "new",
                    })
                except Exception as e:
                    mon.log_warning(f"LLM failed for cluster {cluster_row['cluster']}: {str(e)[:200]}")
                    result["errors"].append(str(e)[:200])

            # Step 5: Persist discovered patterns
            if patterns:
                with mon.time("store_patterns"):
                    patterns_df = spark.createDataFrame(patterns)
                    patterns_df.write.mode("append").saveAsTable(cfg.get_table_path("discovered_patterns"))
                    mon.log_event("patterns_stored", {"count": len(patterns)})

            result["status"] = "success"
            result["patterns_discovered"] = len(patterns)
            result["ips_analyzed"] = ip_count
            result["clusters_formed"] = k

    mon.log_complete(rows_processed=result.get("patterns_discovered", 0))

except Exception as e:
    mon.log_error(e, context="pattern_discovery_main")
    result["status"] = "failed"
    result["errors"].append(str(e)[:500])

# COMMAND ----------

dbutils.notebook.exit(json.dumps(result))
