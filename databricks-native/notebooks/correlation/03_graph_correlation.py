# Databricks notebook source
# MAGIC %md
# MAGIC # Agent: Graph-Based Correlation Engine
# MAGIC Uses graph traversal to discover multi-hop attack paths and lateral movement.

# COMMAND ----------

dbutils.widgets.text("catalog", "soc_platform", "Catalog")
dbutils.widgets.text("schema", "agentic_soc", "Schema")
dbutils.widgets.text("lookback_hours", "24", "Lookback Hours")
dbutils.widgets.text("min_hops", "2", "Minimum hops for alert")

catalog = dbutils.widgets.get("catalog")
schema = dbutils.widgets.get("schema")
lookback_hours = int(dbutils.widgets.get("lookback_hours"))
min_hops = int(dbutils.widgets.get("min_hops"))

spark.sql(f"USE CATALOG `{catalog}`")
spark.sql(f"USE SCHEMA `{schema}`")

# COMMAND ----------

from pyspark.sql.functions import *
from pyspark.sql import Window
import json

# COMMAND ----------

# MAGIC %md
# MAGIC ## Build Event Graph (Nodes & Edges)

# COMMAND ----------

# Nodes: IPs, Users, Hosts
ip_nodes = spark.sql(f"""
    SELECT DISTINCT source_ip as node_id, 'ip' as node_type
    FROM events
    WHERE timestamp > current_timestamp() - INTERVAL {lookback_hours} HOURS
    AND source_ip IS NOT NULL
    UNION
    SELECT DISTINCT dest_ip as node_id, 'ip' as node_type
    FROM events
    WHERE timestamp > current_timestamp() - INTERVAL {lookback_hours} HOURS
    AND dest_ip IS NOT NULL
""")

user_nodes = spark.sql(f"""
    SELECT DISTINCT user_id as node_id, 'user' as node_type
    FROM events
    WHERE timestamp > current_timestamp() - INTERVAL {lookback_hours} HOURS
    AND user_id IS NOT NULL
""")

nodes = ip_nodes.union(user_nodes).distinct()
print(f"Graph nodes: {nodes.count()}")

# COMMAND ----------

# Edges: Connection between entities that participated in same events
edges = spark.sql(f"""
    SELECT
        source_ip as src,
        dest_ip as dst,
        'network_connection' as edge_type,
        COUNT(*) as weight,
        MAX(severity) as max_severity,
        collect_set(event_type) as event_types
    FROM events
    WHERE timestamp > current_timestamp() - INTERVAL {lookback_hours} HOURS
    AND source_ip IS NOT NULL AND dest_ip IS NOT NULL
    GROUP BY source_ip, dest_ip

    UNION ALL

    SELECT
        user_id as src,
        source_ip as dst,
        'user_to_ip' as edge_type,
        COUNT(*) as weight,
        MAX(severity) as max_severity,
        collect_set(event_type) as event_types
    FROM events
    WHERE timestamp > current_timestamp() - INTERVAL {lookback_hours} HOURS
    AND user_id IS NOT NULL AND source_ip IS NOT NULL
    GROUP BY user_id, source_ip
""")

print(f"Graph edges: {edges.count()}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Detect Multi-Hop Paths (Lateral Movement)

# COMMAND ----------

# Self-join to find 2-hop paths
two_hop_paths = (
    edges.alias("e1")
    .join(edges.alias("e2"), col("e1.dst") == col("e2.src"))
    .filter(col("e1.src") != col("e2.dst"))
    .select(
        col("e1.src").alias("origin"),
        col("e1.dst").alias("hop1"),
        col("e2.dst").alias("hop2"),
        (col("e1.weight") + col("e2.weight")).alias("total_weight"),
        greatest(col("e1.max_severity"), col("e2.max_severity")).alias("max_severity")
    )
)

# 3-hop paths
three_hop_paths = (
    two_hop_paths.alias("p2")
    .join(edges.alias("e3"), col("p2.hop2") == col("e3.src"))
    .filter(col("p2.origin") != col("e3.dst"))
    .filter(col("p2.hop1") != col("e3.dst"))
    .select(
        col("p2.origin"),
        col("p2.hop1"),
        col("p2.hop2"),
        col("e3.dst").alias("hop3"),
        (col("p2.total_weight") + col("e3.weight")).alias("total_weight"),
        greatest(col("p2.max_severity"), col("e3.max_severity")).alias("max_severity")
    )
)

print(f"2-hop paths: {two_hop_paths.count()}")
print(f"3-hop paths: {three_hop_paths.count()}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Score Paths and Generate Alerts

# COMMAND ----------

# Suspicious multi-hop paths (high weight + high severity)
suspicious_paths = (
    three_hop_paths
    .filter(col("total_weight") > 10)
    .filter(col("max_severity").isin("high", "critical"))
    .orderBy(col("total_weight").desc())
    .limit(20)
)

if suspicious_paths.count() > 0:
    alerts = (
        suspicious_paths
        .withColumn("id", expr("uuid()"))
        .withColumn("title", concat(
            lit("Graph Correlation: Lateral Movement Path "),
            col("origin"), lit(" -> "), col("hop1"),
            lit(" -> "), col("hop2"), lit(" -> "), col("hop3")
        ))
        .withColumn("description", concat(
            lit("Multi-hop attack path detected with weight "),
            col("total_weight"), lit(". Max severity: "), col("max_severity")
        ))
        .withColumn("severity", lit("critical"))
        .withColumn("status", lit("new"))
        .withColumn("source", lit("graph_correlation_engine"))
        .withColumn("mitre_tactic", lit("TA0008"))
        .withColumn("confidence_score", least(col("total_weight") / lit(50.0), lit(1.0)))
        .withColumn("created_at", current_timestamp())
        .select("id", "title", "description", "severity", "status",
                "source", "mitre_tactic", "confidence_score", "created_at")
    )
    alerts.write.mode("append").saveAsTable("alerts")
    print(f"Generated {alerts.count()} graph correlation alerts")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Persist Graph for UI Visualization

# COMMAND ----------

# Update graph streaming tables for the frontend
nodes_to_write = (
    nodes
    .withColumn("id", col("node_id"))
    .withColumn("label", col("node_id"))
    .withColumn("properties", map_from_arrays(array(lit("type")), array(col("node_type"))))
    .withColumn("risk_score", lit(0.0))
    .withColumn("updated_at", current_timestamp())
    .select("id", "node_type", "label", "properties", "risk_score", "updated_at")
)

edges_to_write = (
    edges
    .withColumn("id", expr("uuid()"))
    .withColumn("source_id", col("src"))
    .withColumn("target_id", col("dst"))
    .withColumn("weight", col("weight").cast("double"))
    .withColumn("properties", map_from_arrays(
        array(lit("event_types")),
        array(array_join(col("event_types"), ","))
    ))
    .withColumn("created_at", current_timestamp())
    .select("id", "source_id", "target_id", "edge_type", "weight", "properties", "created_at")
)

nodes_to_write.write.mode("overwrite").saveAsTable("graph_streaming_nodes")
edges_to_write.write.mode("overwrite").saveAsTable("graph_streaming_edges")

print("Graph persisted for UI visualization")
