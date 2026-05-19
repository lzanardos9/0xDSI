# Databricks notebook source
# MAGIC %md
# MAGIC # 03 - Graph Correlation Engine
# MAGIC
# MAGIC Uses GraphFrames to detect attack patterns based on entity relationships.
# MAGIC Identifies lateral movement, privilege escalation paths, and coordinated attacks
# MAGIC by analyzing graph structure (not just individual events).
# MAGIC
# MAGIC **Techniques:**
# MAGIC - Motif finding (multi-hop patterns)
# MAGIC - PageRank for anomalous entity importance
# MAGIC - Connected components for campaign clustering
# MAGIC - Triangle counting for insider threat rings
# MAGIC
# MAGIC **Input:** `{catalog}.{schema}.enriched_events`
# MAGIC **Output:** `{catalog}.{schema}.graph_detections`

# COMMAND ----------

dbutils.widgets.text("catalog", "main")
dbutils.widgets.text("schema", "security")
dbutils.widgets.text("lookback_hours", "24")
dbutils.widgets.text("min_confidence", "0.6")

catalog = dbutils.widgets.get("catalog")
schema = dbutils.widgets.get("schema")
lookback_hours = int(dbutils.widgets.get("lookback_hours"))
min_confidence = float(dbutils.widgets.get("min_confidence"))

# COMMAND ----------

from pyspark.sql.functions import (
    col, count, countDistinct, collect_set, expr, lit,
    current_timestamp, date_format, concat, when, size,
    array_distinct, flatten, struct
)
from graphframes import GraphFrame
import uuid

# COMMAND ----------

# MAGIC %md
# MAGIC ## Build Security Entity Graph from Recent Events

# COMMAND ----------

# Load recent enriched events
events = spark.table(f"{catalog}.{schema}.enriched_events").filter(
    col("time") >= expr(f"current_timestamp() - INTERVAL {lookback_hours} HOURS")
)

event_count = events.count()
print(f"Building graph from {event_count} events (last {lookback_hours}h)")

# Extract vertices (entities)
user_vertices = (
    events
    .filter(col("actor_user_id").isNotNull())
    .select(col("actor_user_id").alias("id"))
    .withColumn("entity_type", lit("user"))
    .distinct()
)

ip_vertices = (
    events
    .filter(col("src_ip").isNotNull())
    .select(col("src_ip").alias("id"))
    .withColumn("entity_type", lit("ip"))
    .union(
        events.filter(col("dst_ip").isNotNull())
        .select(col("dst_ip").alias("id"))
        .withColumn("entity_type", lit("ip"))
    )
    .distinct()
)

host_vertices = (
    events
    .filter(col("src_hostname").isNotNull())
    .select(col("src_hostname").alias("id"))
    .withColumn("entity_type", lit("host"))
    .union(
        events.filter(col("dst_hostname").isNotNull())
        .select(col("dst_hostname").alias("id"))
        .withColumn("entity_type", lit("host"))
    )
    .distinct()
)

resource_vertices = (
    events
    .filter(col("resource_name").isNotNull())
    .select(col("resource_name").alias("id"))
    .withColumn("entity_type", lit("resource"))
    .distinct()
)

vertices = user_vertices.union(ip_vertices).union(host_vertices).union(resource_vertices).distinct()

# Extract edges (relationships)
# User → IP (authenticated from)
user_ip_edges = (
    events
    .filter(col("actor_user_id").isNotNull() & col("src_ip").isNotNull())
    .select(
        col("actor_user_id").alias("src"),
        col("src_ip").alias("dst"),
        lit("authenticated_from").alias("relationship"),
        col("time").alias("timestamp"),
    )
    .groupBy("src", "dst", "relationship")
    .agg(count("*").alias("weight"), collect_set("timestamp").alias("timestamps"))
)

# IP → IP (connection)
ip_ip_edges = (
    events
    .filter(col("src_ip").isNotNull() & col("dst_ip").isNotNull())
    .select(
        col("src_ip").alias("src"),
        col("dst_ip").alias("dst"),
        lit("connected_to").alias("relationship"),
        col("time").alias("timestamp"),
    )
    .groupBy("src", "dst", "relationship")
    .agg(count("*").alias("weight"), collect_set("timestamp").alias("timestamps"))
)

# User → Resource (accessed)
user_resource_edges = (
    events
    .filter(col("actor_user_id").isNotNull() & col("resource_name").isNotNull())
    .select(
        col("actor_user_id").alias("src"),
        col("resource_name").alias("dst"),
        lit("accessed").alias("relationship"),
        col("time").alias("timestamp"),
    )
    .groupBy("src", "dst", "relationship")
    .agg(count("*").alias("weight"), collect_set("timestamp").alias("timestamps"))
)

# User → Host (logged_into)
user_host_edges = (
    events
    .filter(col("actor_user_id").isNotNull() & col("dst_hostname").isNotNull())
    .select(
        col("actor_user_id").alias("src"),
        col("dst_hostname").alias("dst"),
        lit("logged_into").alias("relationship"),
        col("time").alias("timestamp"),
    )
    .groupBy("src", "dst", "relationship")
    .agg(count("*").alias("weight"), collect_set("timestamp").alias("timestamps"))
)

edges = (
    user_ip_edges
    .union(ip_ip_edges)
    .union(user_resource_edges)
    .union(user_host_edges)
)

print(f"Graph: {vertices.count()} vertices, {edges.count()} edges")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Build GraphFrame

# COMMAND ----------

graph = GraphFrame(vertices, edges)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Detection 1: Lateral Movement via Motif Finding

# COMMAND ----------

# Find patterns: User → Host A → Host B → Host C (3-hop lateral movement)
lateral_movement_motif = graph.find(
    "(user)-[e1]->(host1); (user)-[e2]->(host2); (user)-[e3]->(host3)"
).filter(
    (col("e1.relationship") == "logged_into") &
    (col("e2.relationship") == "logged_into") &
    (col("e3.relationship") == "logged_into") &
    (col("host1.entity_type") == "host") &
    (col("host2.entity_type") == "host") &
    (col("host3.entity_type") == "host") &
    (col("host1.id") != col("host2.id")) &
    (col("host2.id") != col("host3.id")) &
    (col("host1.id") != col("host3.id")) &
    (col("user.entity_type") == "user")
)

lateral_count = lateral_movement_motif.count()
print(f"Lateral movement patterns detected: {lateral_count}")

if lateral_count > 0:
    lateral_detections = (
        lateral_movement_motif
        .select(
            expr("uuid()").alias("detection_id"),
            lit("lateral_movement_graph").alias("detection_type"),
            lit("high").alias("severity"),
            col("user.id").alias("entity_value"),
            lit("user").alias("entity_key"),
            col("host1.id").alias("hop1"),
            col("host2.id").alias("hop2"),
            col("host3.id").alias("hop3"),
        )
        .withColumn("description", expr("""
            concat('Graph lateral movement: user ', entity_value,
                   ' accessed hosts: ', hop1, ' → ', hop2, ' → ', hop3)
        """))
        .withColumn("mitre_technique", lit("T1021"))
        .withColumn("confidence", lit(0.8))
        .withColumn("created_at", current_timestamp())
        .withColumn("partition_date", date_format(current_timestamp(), "yyyy-MM-dd"))
    )

# COMMAND ----------

# MAGIC %md
# MAGIC ## Detection 2: Anomalous Entity Importance (PageRank)

# COMMAND ----------

# PageRank identifies entities with unusually high connectivity
# An attacker pivot point will have abnormally high PageRank
pagerank = graph.pageRank(resetProbability=0.15, maxIter=10)

# Find entities with PageRank significantly above average
pr_stats = pagerank.vertices.select(
    col("pagerank")
).summary("mean", "stddev").collect()

mean_pr = float(pr_stats[0]["pagerank"])
stddev_pr = float(pr_stats[1]["pagerank"]) if pr_stats[1]["pagerank"] else 1.0

# Anomalous = more than 3 standard deviations above mean
anomalous_entities = (
    pagerank.vertices
    .filter(col("pagerank") > mean_pr + (3 * stddev_pr))
    .orderBy(col("pagerank").desc())
    .limit(20)
)

anomalous_count = anomalous_entities.count()
print(f"PageRank anomalies: {anomalous_count} entities")

if anomalous_count > 0:
    pagerank_detections = (
        anomalous_entities
        .select(
            expr("uuid()").alias("detection_id"),
            lit("anomalous_centrality").alias("detection_type"),
            when(col("pagerank") > mean_pr + (5 * stddev_pr), lit("high"))
            .otherwise(lit("medium")).alias("severity"),
            col("id").alias("entity_value"),
            col("entity_type").alias("entity_key"),
            col("pagerank"),
        )
        .withColumn("description", expr("""
            concat('Anomalous graph centrality: ', entity_key, ' ', entity_value,
                   ' has PageRank ', ROUND(pagerank, 4),
                   ' (mean=', ROUND(""" + str(mean_pr) + """, 4), ')')
        """))
        .withColumn("mitre_technique", lit("T1570"))
        .withColumn("confidence", lit(0.7))
        .withColumn("created_at", current_timestamp())
        .withColumn("partition_date", date_format(current_timestamp(), "yyyy-MM-dd"))
    )

# COMMAND ----------

# MAGIC %md
# MAGIC ## Detection 3: Connected Components (Campaign Clustering)

# COMMAND ----------

# Find clusters of connected entities that may represent a single campaign
components = graph.connectedComponents()

# Large connected components may indicate coordinated activity
campaign_clusters = (
    components
    .groupBy("component")
    .agg(
        count("*").alias("cluster_size"),
        countDistinct(when(col("entity_type") == "user", col("id"))).alias("users"),
        countDistinct(when(col("entity_type") == "ip", col("id"))).alias("ips"),
        countDistinct(when(col("entity_type") == "host", col("id"))).alias("hosts"),
        collect_set(when(col("entity_type") == "user", col("id"))).alias("user_ids"),
    )
    .filter(
        (col("cluster_size") >= 10) &  # Minimum cluster size
        (col("users") >= 2) &          # Multiple users involved
        (col("hosts") >= 3)            # Multiple hosts
    )
    .orderBy(col("cluster_size").desc())
)

campaign_count = campaign_clusters.count()
print(f"Potential campaign clusters: {campaign_count}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Detection 4: Triangle Counting (Collusion Detection)

# COMMAND ----------

# Triangles in a user-resource graph may indicate insider collaboration
# (User A accesses same resources as User B, and both connect to User C)
triangles = graph.triangleCount()

# Users with high triangle count relative to their degree are suspicious
suspicious_triangles = (
    triangles
    .filter(
        (col("entity_type") == "user") &
        (col("count") >= 5)
    )
    .orderBy(col("count").desc())
    .limit(10)
)

triangle_detections_count = suspicious_triangles.count()
print(f"Suspicious triangle patterns: {triangle_detections_count}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Write All Graph Detections

# COMMAND ----------

spark.sql(f"""
    CREATE TABLE IF NOT EXISTS {catalog}.{schema}.graph_detections (
        detection_id STRING NOT NULL,
        detection_type STRING NOT NULL,
        severity STRING NOT NULL,
        entity_key STRING,
        entity_value STRING,
        description STRING,
        mitre_technique STRING,
        confidence DOUBLE,
        graph_metrics MAP<STRING, STRING>,
        related_entities ARRAY<STRING>,
        created_at TIMESTAMP,
        partition_date STRING
    )
    USING DELTA
    PARTITIONED BY (partition_date)
    TBLPROPERTIES ('delta.autoOptimize.optimizeWrite' = 'true')
""")

# Collect and write detections
all_graph_detections = []

if lateral_count > 0:
    all_graph_detections.append(lateral_detections.select(
        "detection_id", "detection_type", "severity", "entity_key",
        "entity_value", "description", "mitre_technique", "confidence",
        "created_at", "partition_date"
    ))

if anomalous_count > 0:
    all_graph_detections.append(pagerank_detections.select(
        "detection_id", "detection_type", "severity", "entity_key",
        "entity_value", "description", "mitre_technique", "confidence",
        "created_at", "partition_date"
    ))

if all_graph_detections:
    from functools import reduce
    combined = reduce(lambda a, b: a.unionByName(b, allowMissingColumns=True), all_graph_detections)
    combined.write.format("delta").mode("append").option("mergeSchema", "true").saveAsTable(
        f"{catalog}.{schema}.graph_detections"
    )
    print(f"Wrote {combined.count()} graph detections")
else:
    print("No graph detections in this run")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Summary

# COMMAND ----------

print(f"""
Graph Correlation Summary ({lookback_hours}h window):
  Vertices: {vertices.count()}
  Edges: {edges.count()}
  Lateral Movement Patterns: {lateral_count}
  PageRank Anomalies: {anomalous_count}
  Campaign Clusters: {campaign_count}
  Triangle Patterns: {triangle_detections_count}
""")
