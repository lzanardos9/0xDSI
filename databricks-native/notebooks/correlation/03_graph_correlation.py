# Databricks notebook source
# MAGIC %md
# MAGIC # Graph-Based Correlation Engine
# MAGIC
# MAGIC Uses graph traversal to discover multi-hop attack paths and lateral movement.
# MAGIC Builds entity graphs from events and detects:
# MAGIC - 2-hop and 3-hop lateral movement paths
# MAGIC - High-severity multi-hop chains
# MAGIC - Unusual fan-out patterns (single source reaching many targets)
# MAGIC
# MAGIC Persists graph state to Delta for UI visualization.

# COMMAND ----------

# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

# MAGIC %md
# MAGIC ## Configuration

# COMMAND ----------

dbutils.widgets.text("lookback_hours", "24", "Lookback Hours")
dbutils.widgets.text("min_hops", "2", "Minimum hops for alert")
dbutils.widgets.text("min_weight", "10", "Minimum edge weight for suspicious path")
dbutils.widgets.text("max_alerts", "20", "Maximum alerts per run")

lookback_hours = int(dbutils.widgets.get("lookback_hours"))
min_hops = int(dbutils.widgets.get("min_hops"))
min_weight = int(dbutils.widgets.get("min_weight"))
max_alerts = int(dbutils.widgets.get("max_alerts"))

mon.log_event("config_loaded", {
    "lookback_hours": lookback_hours,
    "min_hops": min_hops,
    "min_weight": min_weight,
})

# COMMAND ----------

from pyspark.sql.functions import *
from pyspark.sql import Window

# COMMAND ----------

# MAGIC %md
# MAGIC ## Build Event Graph (Nodes & Edges)

# COMMAND ----------

events_table = cfg.get_table_path("events")

with mon.time("graph_construction"):
    # Nodes: IPs, Users, Hosts
    ip_nodes = spark.sql(f"""
        SELECT DISTINCT source_ip as node_id, 'ip' as node_type
        FROM {events_table}
        WHERE timestamp > current_timestamp() - INTERVAL {lookback_hours} HOURS
        AND source_ip IS NOT NULL
        UNION
        SELECT DISTINCT dest_ip as node_id, 'ip' as node_type
        FROM {events_table}
        WHERE timestamp > current_timestamp() - INTERVAL {lookback_hours} HOURS
        AND dest_ip IS NOT NULL
    """)

    user_nodes = spark.sql(f"""
        SELECT DISTINCT user_id as node_id, 'user' as node_type
        FROM {events_table}
        WHERE timestamp > current_timestamp() - INTERVAL {lookback_hours} HOURS
        AND user_id IS NOT NULL
    """)

    host_nodes = spark.sql(f"""
        SELECT DISTINCT hostname as node_id, 'host' as node_type
        FROM {events_table}
        WHERE timestamp > current_timestamp() - INTERVAL {lookback_hours} HOURS
        AND hostname IS NOT NULL
    """)

    nodes = ip_nodes.union(user_nodes).union(host_nodes).distinct().cache()
    node_count = nodes.count()

    # Edges: Connections between entities in the same events
    edges = spark.sql(f"""
        SELECT
            source_ip as src,
            dest_ip as dst,
            'network_connection' as edge_type,
            COUNT(*) as weight,
            MAX(severity) as max_severity,
            collect_set(event_type) as event_types,
            MIN(timestamp) as first_seen,
            MAX(timestamp) as last_seen
        FROM {events_table}
        WHERE timestamp > current_timestamp() - INTERVAL {lookback_hours} HOURS
        AND source_ip IS NOT NULL AND dest_ip IS NOT NULL
        AND source_ip != dest_ip
        GROUP BY source_ip, dest_ip

        UNION ALL

        SELECT
            user_id as src,
            source_ip as dst,
            'user_to_ip' as edge_type,
            COUNT(*) as weight,
            MAX(severity) as max_severity,
            collect_set(event_type) as event_types,
            MIN(timestamp) as first_seen,
            MAX(timestamp) as last_seen
        FROM {events_table}
        WHERE timestamp > current_timestamp() - INTERVAL {lookback_hours} HOURS
        AND user_id IS NOT NULL AND source_ip IS NOT NULL
        GROUP BY user_id, source_ip
    """).cache()

    edge_count = edges.count()
    mon.log_event("graph_built", {"nodes": node_count, "edges": edge_count})
    print(f"Graph: {node_count} nodes, {edge_count} edges")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Detect Multi-Hop Paths (Lateral Movement)

# COMMAND ----------

with mon.time("path_detection"):
    # 2-hop paths
    two_hop_paths = (
        edges.alias("e1")
        .join(edges.alias("e2"), col("e1.dst") == col("e2.src"))
        .filter(col("e1.src") != col("e2.dst"))
        .select(
            col("e1.src").alias("origin"),
            col("e1.dst").alias("hop1"),
            col("e2.dst").alias("hop2"),
            (col("e1.weight") + col("e2.weight")).alias("total_weight"),
            greatest(col("e1.max_severity"), col("e2.max_severity")).alias("max_severity"),
            col("e1.last_seen").alias("first_hop_time"),
            col("e2.last_seen").alias("second_hop_time"),
        )
        # Temporal ordering: hop1 should happen before or near hop2
        .filter(col("first_hop_time") <= col("second_hop_time") + expr("INTERVAL 5 MINUTES"))
    ).cache()

    two_hop_count = two_hop_paths.count()

    # 3-hop paths (only if 2-hop paths exist)
    three_hop_count = 0
    three_hop_paths = None

    if two_hop_count > 0 and min_hops >= 3:
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
                greatest(col("p2.max_severity"), col("e3.max_severity")).alias("max_severity"),
            )
            .filter(col("total_weight") > min_weight)
            .filter(col("max_severity").isin("high", "critical"))
            .orderBy(col("total_weight").desc())
            .limit(max_alerts)
        ).cache()
        three_hop_count = three_hop_paths.count()

    mon.log_event("paths_detected", {
        "two_hop": two_hop_count,
        "three_hop": three_hop_count,
    })
    print(f"2-hop paths: {two_hop_count}, 3-hop paths: {three_hop_count}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Fan-Out Detection (Single Source -> Many Targets)

# COMMAND ----------

with mon.time("fanout_detection"):
    fanout_threshold = 10

    fanout_sources = (
        edges
        .filter(col("edge_type") == "network_connection")
        .groupBy("src")
        .agg(
            countDistinct("dst").alias("unique_targets"),
            sum("weight").alias("total_connections"),
            max("max_severity").alias("max_severity"),
        )
        .filter(col("unique_targets") >= fanout_threshold)
        .orderBy(col("unique_targets").desc())
        .limit(10)
    )

    fanout_count = fanout_sources.count()
    if fanout_count > 0:
        mon.log_detection("high_fanout", {"sources": fanout_count})
        print(f"High fan-out sources detected: {fanout_count}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Generate Alerts

# COMMAND ----------

alerts_table = cfg.get_table_path("alerts")
alert_count = 0

with mon.time("alert_generation"):
    # Alerts from 3-hop paths
    if three_hop_paths is not None and three_hop_count > 0:
        path_alerts = (
            three_hop_paths
            .withColumn("id", expr("uuid()"))
            .withColumn("title", concat(
                lit("Lateral Movement: "),
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
        path_alerts.write.mode("append").saveAsTable(alerts_table)
        alert_count += three_hop_count

    # Alerts from high fan-out (potential scanning/C2)
    if fanout_count > 0:
        fanout_alerts = (
            fanout_sources
            .withColumn("id", expr("uuid()"))
            .withColumn("title", concat(lit("High Fan-Out: "), col("src"), lit(" -> "), col("unique_targets"), lit(" targets")))
            .withColumn("description", concat(
                lit("Source "), col("src"), lit(" connected to "),
                col("unique_targets"), lit(" unique targets ("),
                col("total_connections"), lit(" total connections)")
            ))
            .withColumn("severity",
                when(col("max_severity") == "critical", lit("critical"))
                .otherwise(lit("high"))
            )
            .withColumn("status", lit("new"))
            .withColumn("source", lit("graph_correlation_engine"))
            .withColumn("mitre_tactic", lit("TA0007"))
            .withColumn("confidence_score", least(col("unique_targets") / lit(20.0), lit(1.0)))
            .withColumn("created_at", current_timestamp())
            .select("id", "title", "description", "severity", "status",
                    "source", "mitre_tactic", "confidence_score", "created_at")
        )
        fanout_alerts.write.mode("append").saveAsTable(alerts_table)
        alert_count += fanout_count

    print(f"Generated {alert_count} graph correlation alerts")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Persist Graph for UI Visualization

# COMMAND ----------

with mon.time("graph_persist"):
    nodes_table = cfg.get_table_path("graph_streaming_nodes")
    edges_table_out = cfg.get_table_path("graph_streaming_edges")

    # Compute per-node risk based on edge severity
    node_risk = (
        edges
        .select(col("src").alias("node_id"), col("max_severity"))
        .union(edges.select(col("dst").alias("node_id"), col("max_severity")))
        .groupBy("node_id")
        .agg(
            max(
                when(col("max_severity") == "critical", lit(1.0))
                .when(col("max_severity") == "high", lit(0.75))
                .when(col("max_severity") == "medium", lit(0.5))
                .otherwise(lit(0.25))
            ).alias("risk_score")
        )
    )

    nodes_to_write = (
        nodes
        .join(node_risk, nodes.node_id == node_risk.node_id, "left")
        .select(
            nodes.node_id.alias("id"),
            nodes.node_type,
            nodes.node_id.alias("label"),
            map_from_arrays(array(lit("type")), array(nodes.node_type)).alias("properties"),
            coalesce(node_risk.risk_score, lit(0.0)).alias("risk_score"),
            current_timestamp().alias("updated_at"),
        )
    )

    edges_to_write = (
        edges
        .withColumn("id", expr("uuid()"))
        .withColumn("source_id", col("src"))
        .withColumn("target_id", col("dst"))
        .withColumn("weight", col("weight").cast("double"))
        .withColumn("properties", map_from_arrays(
            array(lit("event_types"), lit("first_seen"), lit("last_seen")),
            array(
                array_join(col("event_types"), ","),
                col("first_seen").cast("string"),
                col("last_seen").cast("string"),
            )
        ))
        .withColumn("created_at", current_timestamp())
        .select("id", "source_id", "target_id", "edge_type", "weight", "properties", "created_at")
    )

    nodes_to_write.write.mode("overwrite").saveAsTable(nodes_table)
    edges_to_write.write.mode("overwrite").saveAsTable(edges_table_out)

    print(f"Graph persisted: {node_count} nodes, {edge_count} edges")

# COMMAND ----------

# Clean up cached DataFrames
nodes.unpersist()
edges.unpersist()
if three_hop_paths is not None:
    three_hop_paths.unpersist()
two_hop_paths.unpersist()

mon.log_complete(details={
    "nodes": node_count,
    "edges": edge_count,
    "two_hop_paths": two_hop_count,
    "three_hop_paths": three_hop_count,
    "alerts_generated": alert_count,
    "lookback_hours": lookback_hours,
})
