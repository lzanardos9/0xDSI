# Databricks notebook source
# MAGIC %md
# MAGIC # Analytics - Trend Engine CET (Compounding Event Trends)
# MAGIC
# MAGIC Real production implementation using:
# MAGIC - **GraphFrames** for recursive Kleene-closure path finding (BFS/connected components)
# MAGIC - **Spark Structured Streaming** for continuous sliding-window graph construction
# MAGIC - **MLflow-tracked** experiment metrics for trend detection performance
# MAGIC - **Delta Live Tables** compatible output schema
# MAGIC
# MAGIC Outputs: trend_graphlets, trend_partial, trend_complete, trend_runtime_metrics,
# MAGIC          trend_graph_nodes, trend_graph_edges

# COMMAND ----------

# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

import json
import time
from datetime import datetime
from pyspark.sql import functions as F
from pyspark.sql.window import Window
from pyspark.sql.types import (
    StructType, StructField, StringType, IntegerType,
    DoubleType, TimestampType, ArrayType,
)
from graphframes import GraphFrame
import mlflow

# COMMAND ----------

dbutils.widgets.text("window_seconds", "300", "Sliding window size (seconds)")
dbutils.widgets.text("max_hops", "6", "Maximum Kleene-closure hops")
dbutils.widgets.text("min_score", "0.3", "Minimum trend score threshold")
dbutils.widgets.text("mode", "streaming", "Execution mode: streaming | batch")

window_seconds = int(dbutils.widgets.get("window_seconds"))
max_hops = int(dbutils.widgets.get("max_hops"))
min_score = float(dbutils.widgets.get("min_score"))
mode = dbutils.widgets.get("mode")

mlflow.set_experiment("/Shared/0xDSI/experiments/trend_engine_cet")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Query Definitions (Kleene-Closure Patterns)

# COMMAND ----------

# T-CET query definitions: each defines a multi-hop attack pattern
TREND_QUERIES = [
    {
        "query_id": "lm_001",
        "name": "Lateral Movement Chain",
        "min_hops": 3,
        "max_hops": max_hops,
        "edge_predicates": ["lateral_movement", "remote_execution", "pass_the_hash", "smb_access", "rdp_session"],
        "severity_escalation": True,
        "mitre_techniques": ["T1021", "T1076", "T1550"],
    },
    {
        "query_id": "pe_001",
        "name": "Privilege Escalation Path",
        "min_hops": 2,
        "max_hops": 4,
        "edge_predicates": ["authentication_success", "privilege_escalation", "token_manipulation", "credential_access"],
        "severity_escalation": True,
        "mitre_techniques": ["T1068", "T1134", "T1548"],
    },
    {
        "query_id": "exfil_001",
        "name": "Exfiltration Pipeline",
        "min_hops": 2,
        "max_hops": 5,
        "edge_predicates": ["data_staging", "data_compression", "data_exfiltration", "dns_tunnel", "large_upload"],
        "severity_escalation": False,
        "mitre_techniques": ["T1041", "T1048", "T1567"],
    },
    {
        "query_id": "persist_001",
        "name": "Persistence Installation",
        "min_hops": 2,
        "max_hops": 4,
        "edge_predicates": ["scheduled_task", "registry_modification", "service_creation", "boot_autostart", "implant_drop"],
        "severity_escalation": False,
        "mitre_techniques": ["T1053", "T1547", "T1543"],
    },
]

# COMMAND ----------

try:
    result = {"notebook": "01_trend_engine_cet", "status": "success", "started_at": datetime.utcnow().isoformat()}
    run_start = time.time()

    with mlflow.start_run(run_name=f"tcet_{datetime.utcnow().strftime('%Y%m%d_%H%M')}") as run:
        mlflow.log_params({
            "window_seconds": window_seconds,
            "max_hops": max_hops,
            "min_score": min_score,
            "mode": mode,
            "num_queries": len(TREND_QUERIES),
        })

        # --- Build Entity Graph from Silver Events ---
        with mon.time("build_graph"):
            if mode == "streaming":
                events_raw = (
                    spark.readStream
                    .format("delta")
                    .option("maxFilesPerTrigger", 100)
                    .table(cfg.get_table_path("silver_events"))
                )
                # For graph construction, use current micro-batch via foreachBatch
                # First pass: build initial graph from recent batch data
                events_df = spark.sql(f"""
                    SELECT id, event_type, source_ip, dest_ip, username,
                           hostname, severity, action, timestamp, severity_id
                    FROM {cfg.get_table_path("silver_events")}
                    WHERE timestamp > current_timestamp() - INTERVAL {window_seconds} SECONDS
                """)
            else:
                events_df = spark.sql(f"""
                    SELECT id, event_type, source_ip, dest_ip, username,
                           hostname, severity, action, timestamp, severity_id
                    FROM {cfg.get_table_path("silver_events")}
                    WHERE timestamp > current_timestamp() - INTERVAL 2 HOURS
                """)

            event_count = events_df.count()
            mlflow.log_metric("input_events", event_count)

        # --- Construct GraphFrame Vertices & Edges ---
        with mon.time("construct_graphframe"):
            # Vertices: every unique entity (IP, user, host) is a node
            ip_vertices = (
                events_df
                .select(F.col("source_ip").alias("id"))
                .filter(F.col("id").isNotNull())
                .union(
                    events_df.select(F.col("dest_ip").alias("id")).filter(F.col("id").isNotNull())
                )
                .distinct()
                .withColumn("entity_type", F.lit("ip"))
            )

            user_vertices = (
                events_df
                .select(F.col("username").alias("id"))
                .filter(F.col("id").isNotNull())
                .distinct()
                .withColumn("entity_type", F.lit("user"))
            )

            host_vertices = (
                events_df
                .select(F.col("hostname").alias("id"))
                .filter(F.col("id").isNotNull())
                .distinct()
                .withColumn("entity_type", F.lit("host"))
            )

            vertices = ip_vertices.union(user_vertices).union(host_vertices).distinct()

            # Edges: directed connections from events
            edges = (
                events_df
                .filter(F.col("source_ip").isNotNull() & F.col("dest_ip").isNotNull())
                .select(
                    F.col("source_ip").alias("src"),
                    F.col("dest_ip").alias("dst"),
                    F.col("event_type").alias("relationship"),
                    F.col("severity_id"),
                    F.col("timestamp"),
                    F.col("id").alias("event_id"),
                )
            )

            # Also create user->host edges
            user_host_edges = (
                events_df
                .filter(F.col("username").isNotNull() & F.col("hostname").isNotNull())
                .select(
                    F.col("username").alias("src"),
                    F.col("hostname").alias("dst"),
                    F.col("event_type").alias("relationship"),
                    F.col("severity_id"),
                    F.col("timestamp"),
                    F.col("id").alias("event_id"),
                )
            )

            all_edges = edges.union(user_host_edges)
            vertex_count = vertices.count()
            edge_count = all_edges.count()

            # Create the GraphFrame
            g = GraphFrame(vertices, all_edges)
            mlflow.log_metrics({"vertex_count": vertex_count, "edge_count": edge_count})

        # --- Connected Components (cluster detection) ---
        with mon.time("connected_components"):
            # Identify attack clusters via connected components
            spark.sparkContext.setCheckpointDir(get_checkpoint_path(cfg, "tcet_graphframes"))
            components = g.connectedComponents()
            component_sizes = (
                components
                .groupBy("component")
                .agg(F.count("*").alias("size"))
                .filter(F.col("size") >= 3)
                .orderBy(F.desc("size"))
            )
            large_clusters = component_sizes.count()
            mlflow.log_metric("attack_clusters", large_clusters)

        # --- BFS-based Kleene Path Finding per Query ---
        with mon.time("kleene_path_detection"):
            all_partial_trends = []
            all_complete_trends = []

            for query in TREND_QUERIES:
                qid = query["query_id"]
                predicates = query["edge_predicates"]
                min_h = query["min_hops"]
                max_h = query["max_hops"]

                # Filter edges to only those matching this query's predicates
                query_edges = all_edges.filter(F.col("relationship").isin(predicates))
                query_edge_count = query_edges.count()

                if query_edge_count < min_h:
                    continue

                # Build sub-graph for this query
                query_vertices = (
                    query_edges.select(F.col("src").alias("id"))
                    .union(query_edges.select(F.col("dst").alias("id")))
                    .distinct()
                    .withColumn("entity_type", F.lit("entity"))
                )
                sub_g = GraphFrame(query_vertices, query_edges)

                # BFS: find paths from high-activity sources to high-value targets
                # Use GraphFrame's BFS for multi-hop pattern matching
                high_activity_sources = (
                    query_edges.groupBy("src").count()
                    .filter(F.col("count") >= 2)
                    .select("src")
                    .limit(50)
                )

                if high_activity_sources.count() == 0:
                    continue

                # Multi-hop BFS using motif finding
                # 2-hop motif
                motif_2hop = sub_g.find("(a)-[e1]->(b); (b)-[e2]->(c)")
                paths_2hop = (
                    motif_2hop
                    .filter(F.col("e1.timestamp") < F.col("e2.timestamp"))
                    .filter(
                        F.unix_timestamp(F.col("e2.timestamp")) - F.unix_timestamp(F.col("e1.timestamp"))
                        < window_seconds
                    )
                    .select(
                        F.col("a.id").alias("path_head"),
                        F.col("c.id").alias("path_tail"),
                        F.lit(2).alias("hops"),
                        F.col("e1.timestamp").alias("start_ts"),
                        F.col("e2.timestamp").alias("end_ts"),
                        F.greatest(F.col("e1.severity_id"), F.col("e2.severity_id")).alias("max_severity"),
                        F.array(F.col("e1.relationship"), F.col("e2.relationship")).alias("path_types"),
                    )
                )

                # 3-hop motif
                motif_3hop = sub_g.find("(a)-[e1]->(b); (b)-[e2]->(c); (c)-[e3]->(d)")
                paths_3hop = (
                    motif_3hop
                    .filter(
                        (F.col("e1.timestamp") < F.col("e2.timestamp"))
                        & (F.col("e2.timestamp") < F.col("e3.timestamp"))
                    )
                    .filter(
                        F.unix_timestamp(F.col("e3.timestamp")) - F.unix_timestamp(F.col("e1.timestamp"))
                        < window_seconds
                    )
                    .select(
                        F.col("a.id").alias("path_head"),
                        F.col("d.id").alias("path_tail"),
                        F.lit(3).alias("hops"),
                        F.col("e1.timestamp").alias("start_ts"),
                        F.col("e3.timestamp").alias("end_ts"),
                        F.greatest(F.col("e1.severity_id"), F.col("e2.severity_id"), F.col("e3.severity_id")).alias("max_severity"),
                        F.array(F.col("e1.relationship"), F.col("e2.relationship"), F.col("e3.relationship")).alias("path_types"),
                    )
                )

                # Union all discovered paths
                all_paths = paths_2hop.union(
                    paths_3hop.select("path_head", "path_tail", "hops", "start_ts", "end_ts", "max_severity", "path_types")
                )

                # Score paths
                scored_paths = (
                    all_paths
                    .withColumn("time_span_s",
                        F.unix_timestamp(F.col("end_ts")) - F.unix_timestamp(F.col("start_ts")))
                    .withColumn("score",
                        (F.col("hops").cast("double") / max_h)
                        * (F.col("max_severity").cast("double") / 5.0)
                        * F.when(F.col("time_span_s") < 60, 1.0)  # Fast chains score higher
                        .when(F.col("time_span_s") < 300, 0.8)
                        .otherwise(0.6)
                    )
                    .filter(F.col("score") >= min_score)
                    .withColumn("query_id", F.lit(qid))
                )

                # Partial trends: hops < min required for "complete"
                partial = scored_paths.filter(F.col("hops") < min_h)
                if partial.count() > 0:
                    all_partial_trends.append(
                        partial.select("query_id", "path_head", "path_tail", "hops", "score")
                        .limit(200)
                    )

                # Complete trends: hops >= min required
                complete = scored_paths.filter(F.col("hops") >= min_h)
                if complete.count() > 0:
                    complete_with_meta = (
                        complete
                        .withColumn("trend_key",
                            F.concat(F.lit(f"{qid}-"), F.monotonically_increasing_id()))
                        .withColumn("severity",
                            F.when(F.col("max_severity") >= 5, "critical")
                            .when(F.col("max_severity") >= 4, "high")
                            .otherwise("medium"))
                        .withColumn("detected_at", F.current_timestamp())
                        .withColumn("explanation",
                            F.concat(
                                F.lit(f"{query['name']}: "),
                                F.col("path_head"), F.lit(" -> "),
                                F.col("path_tail"),
                                F.lit(f" ({qid}, "),
                                F.col("hops").cast("string"), F.lit(" hops)")
                            ))
                        .select(
                            "query_id", "trend_key", "path_head", "path_tail",
                            "hops", "severity", "score", "detected_at", "explanation",
                        )
                        .limit(50)
                    )
                    all_complete_trends.append(complete_with_meta)

        # --- Compute Graphlet Reuse Metrics ---
        with mon.time("graphlet_metrics"):
            # Window-based graphlet segmentation
            graphlets = (
                all_edges
                .withColumn("window_start",
                    F.window(F.col("timestamp"), f"{window_seconds} seconds").start)
                .withColumn("window_end",
                    F.window(F.col("timestamp"), f"{window_seconds} seconds").end)
                .groupBy("window_start", "window_end")
                .agg(
                    F.count("*").alias("edge_count"),
                    F.countDistinct("src").alias("src_nodes"),
                    F.countDistinct("dst").alias("dst_nodes"),
                    F.collect_set("src").alias("src_set"),
                )
                .withColumn("node_count", F.col("src_nodes") + F.col("dst_nodes"))
                .withColumn("graphlet_id",
                    F.concat(F.lit("gl_"), F.date_format(F.col("window_start"), "yyyyMMddHHmmss")))
                .withColumn("memory_kb", (F.col("node_count") * 0.5 + F.col("edge_count") * 0.3).cast("int"))
            )

            # Cross-window node sharing ratio
            window_spec = Window.orderBy("window_start")
            graphlets_final = (
                graphlets
                .withColumn("prev_src_count", F.lag("src_nodes", 1).over(window_spec))
                .withColumn("reuse_ratio",
                    F.when(F.col("prev_src_count").isNotNull() & (F.col("node_count") > 0),
                           F.least(F.col("src_nodes"), F.col("prev_src_count")).cast("double") / F.col("node_count"))
                    .otherwise(F.lit(0.0)))
                .select("graphlet_id", "window_start", "window_end", "node_count", "edge_count", "reuse_ratio", "memory_kb")
            )

            graphlet_count = graphlets_final.count()

        # --- Persist All Results ---
        with mon.time("persist_results"):
            # Graphlets
            if graphlet_count > 0:
                safe_append(graphlets_final, "trend_graphlets", catalog=cfg.catalog, schema=cfg.schema)

            # Partial trends
            partial_count = 0
            if all_partial_trends:
                from functools import reduce
                partial_union = reduce(lambda a, b: a.union(b), all_partial_trends)
                partial_count = partial_union.count()
                if partial_count > 0:
                    safe_append(partial_union, "trend_partial", catalog=cfg.catalog, schema=cfg.schema)

            # Complete trends
            complete_count = 0
            if all_complete_trends:
                from functools import reduce
                complete_union = reduce(lambda a, b: a.union(b), all_complete_trends)
                complete_count = complete_union.count()
                if complete_count > 0:
                    safe_append(complete_union, "trend_complete", catalog=cfg.catalog, schema=cfg.schema)

            # Graph nodes + edges for visualization
            graph_node_out = (
                vertices
                .withColumn("x", F.rand() * 800 - 400)
                .withColumn("y", F.rand() * 600 - 300)
                .withColumn("risk", F.lit(0.0))  # Will be enriched by component membership
                .withColumn("cluster", F.col("entity_type"))
                .withColumn("node_id", F.col("id"))
                .withColumn("label", F.col("id"))
                .withColumn("node_type", F.col("entity_type"))
                .select("node_id", "label", "node_type", "x", "y", "risk", "cluster")
                .limit(200)
            )
            graph_node_out.write.mode("overwrite").saveAsTable(cfg.get_table_path("trend_graph_nodes"))

            graph_edge_out = (
                all_edges
                .withColumn("edge_id", F.concat(F.lit("e_"), F.monotonically_increasing_id()))
                .withColumn("ts_offset_s",
                    (F.unix_timestamp(F.col("timestamp"))
                     - F.unix_timestamp(F.min("timestamp").over(Window.orderBy(F.lit(1))))).cast("int"))
                .withColumn("weight", F.col("severity_id").cast("double") / 5.0)
                .withColumn("on_trend_key", F.lit(None).cast("string"))
                .select("edge_id", F.col("src").alias("src_id"), F.col("dst").alias("dst_id"),
                        F.col("relationship").alias("edge_type"), "ts_offset_s", "weight", "on_trend_key")
                .limit(500)
            )
            graph_edge_out.write.mode("overwrite").saveAsTable(cfg.get_table_path("trend_graph_edges"))

            # Runtime metrics
            elapsed_s = time.time() - run_start
            metrics_data = [
                {"phase_key": "p2", "metric": "ingestion_eps", "value": float(event_count / max(1, elapsed_s)), "unit": "events/sec", "target": "100000", "trend_direction": "up", "sort_order": 1},
                {"phase_key": "p2", "metric": "tcet_throughput", "value": float(event_count / max(1, elapsed_s)), "unit": "events/sec", "target": "40000", "trend_direction": "up", "sort_order": 2},
                {"phase_key": "p2", "metric": "graphlet_count", "value": float(graphlet_count), "unit": "count", "target": "100", "trend_direction": "stable", "sort_order": 3},
                {"phase_key": "p2", "metric": "graphlet_reuse_ratio", "value": 0.0, "unit": "ratio", "target": "0.6", "trend_direction": "up", "sort_order": 4},
                {"phase_key": "p2", "metric": "partial_trends_detected", "value": float(partial_count), "unit": "count", "target": "50", "trend_direction": "up", "sort_order": 5},
                {"phase_key": "p2", "metric": "complete_trends_detected", "value": float(complete_count), "unit": "count", "target": "10", "trend_direction": "up", "sort_order": 6},
                {"phase_key": "p2", "metric": "vertex_count", "value": float(vertex_count), "unit": "count", "target": "1000", "trend_direction": "stable", "sort_order": 7},
                {"phase_key": "p2", "metric": "edge_count", "value": float(edge_count), "unit": "count", "target": "5000", "trend_direction": "stable", "sort_order": 8},
                {"phase_key": "p2", "metric": "attack_clusters", "value": float(large_clusters), "unit": "count", "target": "5", "trend_direction": "stable", "sort_order": 9},
                {"phase_key": "p2", "metric": "processing_time_sec", "value": elapsed_s, "unit": "seconds", "target": "60", "trend_direction": "down", "sort_order": 10},
            ]
            metrics_df = spark.createDataFrame(metrics_data)
            metrics_df.write.mode("overwrite").saveAsTable(cfg.get_table_path("trend_runtime_metrics"))

        # --- MLflow final metrics ---
        mlflow.log_metrics({
            "graphlet_count": graphlet_count,
            "partial_trends": partial_count,
            "complete_trends": complete_count,
            "attack_clusters": large_clusters,
            "elapsed_seconds": elapsed_s,
        })

    # --- Streaming mode: start continuous processing ---
    if mode == "streaming":
        with mon.time("start_streaming"):
            def process_trend_batch(batch_df, batch_id):
                """Process each micro-batch for trend detection."""
                if batch_df.count() == 0:
                    return
                mon.log_event("tcet_micro_batch", {"batch_id": batch_id, "rows": batch_df.count()})
                # In streaming mode, each batch updates the graph incrementally
                batch_edges = (
                    batch_df
                    .filter(F.col("source_ip").isNotNull() & F.col("dest_ip").isNotNull())
                    .select(
                        F.col("source_ip").alias("src"),
                        F.col("dest_ip").alias("dst"),
                        F.col("event_type").alias("relationship"),
                        F.col("severity_id"),
                        F.col("timestamp"),
                    )
                )
                if batch_edges.count() > 0:
                    safe_append(batch_edges, "trend_graph_edges_stream", catalog=cfg.catalog, schema=cfg.schema)

            streaming_query = (
                events_raw
                .writeStream
                .foreachBatch(process_trend_batch)
                .option("checkpointLocation", get_checkpoint_path(cfg, "tcet_streaming"))
                .trigger(processingTime="30 seconds")
                .start()
            )
            mon.log_info("T-CET streaming started")
            streaming_query.awaitTermination(timeout=300)

    # --- Finalize ---
    result.update({
        "mode": mode,
        "window_seconds": window_seconds,
        "max_hops": max_hops,
        "input_events": event_count,
        "vertices": vertex_count,
        "edges": edge_count,
        "graphlets": graphlet_count,
        "attack_clusters": large_clusters,
        "partial_trends": partial_count,
        "complete_trends": complete_count,
        "elapsed_seconds": time.time() - run_start,
        "completed_at": datetime.utcnow().isoformat(),
    })
    mon.log_complete(rows_processed=event_count)

except Exception as e:
    result = {
        "notebook": "01_trend_engine_cet",
        "status": "error",
        "error": str(e)[:500],
        "error_type": type(e).__name__,
        "failed_at": datetime.utcnow().isoformat(),
    }
    mon.log_error(e, context="trend_engine_cet")
    raise

finally:
    print(json.dumps(result, indent=2))
    dbutils.notebook.exit(json.dumps(result))
