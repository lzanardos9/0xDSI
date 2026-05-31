# Databricks notebook source
# MAGIC %md
# MAGIC # Agent 26: Real-Time Graph CEP (Streaming + NetworkX)
# MAGIC
# MAGIC **Production Structured Streaming Implementation**
# MAGIC
# MAGIC Maintains a dynamic entity relationship graph (user->device->IP->domain) and detects
# MAGIC anomalous patterns in real-time as events flow through Spark Structured Streaming.
# MAGIC Each micro-batch incrementally updates the persistent NetworkX graph on the driver.
# MAGIC
# MAGIC ## Architecture
# MAGIC - **Input**: Structured Streaming from `events` table (Delta CDF)
# MAGIC - **Graph Engine**: NetworkX (driver-side, persistent across micro-batches)
# MAGIC - **Detection**: Centrality drift, new edges, fan-out, dense subgraphs, path anomalies
# MAGIC - **Output**: `graph_cep_detections` + `alerts` tables
# MAGIC - **Baseline**: Rolling baseline metrics persisted to `graph_cep_baseline` (Delta)
# MAGIC - **Decay**: Edges older than TTL are pruned each batch (bounded memory)
# MAGIC
# MAGIC ## Why NetworkX over GraphFrames
# MAGIC - Dynamic: add/remove edges incrementally without rebuilding
# MAGIC - Sub-millisecond per-batch graph updates
# MAGIC - Rich algorithms: betweenness, personalized PageRank, community detection
# MAGIC - SOC-scale graphs (10K-500K nodes) fit comfortably in driver memory
# MAGIC - GraphFrames requires full RDD rebuild per batch (immutable)

# COMMAND ----------

# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

# MAGIC %md
# MAGIC ## Configuration

# COMMAND ----------

import mlflow
import mlflow.tracing
from pyspark.sql.functions import *
from pyspark.sql.types import *
import json
import time
import logging
import hashlib
from datetime import datetime, timedelta
import networkx as nx
from collections import defaultdict
import threading

logger = logging.getLogger("oxdsi.graph_cep_streaming")

dbutils.widgets.text("trigger_interval", "30 seconds", "Streaming trigger interval")
dbutils.widgets.text("edge_ttl_hours", "24", "Edge time-to-live in hours")
dbutils.widgets.text("anomaly_threshold", "0.70", "Anomaly score threshold")
dbutils.widgets.text("max_graph_nodes", "500000", "Max nodes before forced pruning")
dbutils.widgets.text("baseline_refresh_batches", "20", "Batches between baseline snapshots")
dbutils.widgets.text("fan_out_threshold", "15", "Fan-out degree triggering alert")

trigger_interval = dbutils.widgets.get("trigger_interval")
edge_ttl_hours = int(dbutils.widgets.get("edge_ttl_hours"))
anomaly_threshold = float(dbutils.widgets.get("anomaly_threshold"))
max_graph_nodes = int(dbutils.widgets.get("max_graph_nodes"))
baseline_refresh_batches = int(dbutils.widgets.get("baseline_refresh_batches"))
fan_out_threshold = int(dbutils.widgets.get("fan_out_threshold"))

mon.log_event("graph_cep_streaming_config", {
    "trigger_interval": trigger_interval,
    "edge_ttl_hours": edge_ttl_hours,
    "anomaly_threshold": anomaly_threshold,
    "max_graph_nodes": max_graph_nodes,
})

# COMMAND ----------

# MAGIC %md
# MAGIC ## Persistent Graph State (Driver-Side)

# COMMAND ----------

class StreamingGraphState:
    """
    Thread-safe, persistent graph state maintained across streaming micro-batches.
    Uses NetworkX DiGraph with edge timestamps for TTL-based decay.
    """

    def __init__(self, ttl_hours: int, max_nodes: int):
        self._graph = nx.DiGraph()
        self._lock = threading.Lock()
        self._ttl = timedelta(hours=ttl_hours)
        self._max_nodes = max_nodes
        self._batch_count = 0
        self._baseline_centrality = {}
        self._baseline_edges = set()
        self._total_events_processed = 0
        self._total_detections = 0

    @property
    def graph(self) -> nx.DiGraph:
        return self._graph

    @property
    def batch_count(self) -> int:
        return self._batch_count

    def increment_batch(self):
        self._batch_count += 1

    def add_edge(self, src: str, tgt: str, rel_type: str, timestamp):
        """Add or update an edge with timestamp."""
        with self._lock:
            if self._graph.has_edge(src, tgt):
                data = self._graph[src][tgt]
                data["count"] = data.get("count", 0) + 1
                data["last_seen"] = timestamp
            else:
                self._graph.add_edge(
                    src, tgt,
                    rel_type=rel_type,
                    count=1,
                    first_seen=timestamp,
                    last_seen=timestamp,
                )

    def prune_expired_edges(self, now):
        """Remove edges older than TTL."""
        cutoff = now - self._ttl
        edges_to_remove = []

        with self._lock:
            for u, v, data in self._graph.edges(data=True):
                last_seen = data.get("last_seen")
                if last_seen and last_seen < cutoff:
                    edges_to_remove.append((u, v))

            for u, v in edges_to_remove:
                self._graph.remove_edge(u, v)

            # Remove isolated nodes after edge pruning
            isolates = list(nx.isolates(self._graph))
            self._graph.remove_nodes_from(isolates)

        return len(edges_to_remove)

    def force_prune_if_oversized(self):
        """Emergency pruning if graph exceeds max size."""
        with self._lock:
            if self._graph.number_of_nodes() <= self._max_nodes:
                return 0

            # Remove oldest edges until under limit
            edges_by_time = sorted(
                self._graph.edges(data=True),
                key=lambda e: e[2].get("last_seen", datetime.min)
            )
            remove_count = self._graph.number_of_nodes() - int(self._max_nodes * 0.8)
            removed = 0
            for u, v, _ in edges_by_time:
                if removed >= remove_count:
                    break
                self._graph.remove_edge(u, v)
                removed += 1

            isolates = list(nx.isolates(self._graph))
            self._graph.remove_nodes_from(isolates)
            return removed

    def snapshot_baseline(self):
        """Take a snapshot of current graph metrics as baseline."""
        with self._lock:
            self._baseline_edges = set(self._graph.edges())
            if self._graph.number_of_nodes() > 0:
                self._baseline_centrality = nx.degree_centrality(self._graph)
            else:
                self._baseline_centrality = {}

    def get_new_edges(self):
        """Return edges present now but absent from baseline."""
        current = set(self._graph.edges())
        return current - self._baseline_edges

    def get_centrality_drift(self, threshold_ratio=2.0):
        """Detect nodes whose centrality increased beyond threshold."""
        if self._graph.number_of_nodes() == 0:
            return []

        current_centrality = nx.degree_centrality(self._graph)
        drifts = []
        for node, score in current_centrality.items():
            baseline = self._baseline_centrality.get(node, 0.0)
            if baseline > 0 and score / baseline > threshold_ratio:
                drifts.append((node, baseline, score, score / baseline))
            elif baseline == 0 and score > 0.1:
                drifts.append((node, 0.0, score, float("inf")))

        return sorted(drifts, key=lambda x: x[3], reverse=True)[:20]

    def get_fan_out_anomalies(self, threshold: int):
        """Detect nodes with abnormally high out-degree."""
        anomalies = []
        for node in self._graph.nodes():
            out_degree = self._graph.out_degree(node)
            if out_degree >= threshold:
                successors = list(self._graph.successors(node))[:10]
                anomalies.append((node, out_degree, successors))
        return sorted(anomalies, key=lambda x: x[1], reverse=True)[:15]

    def get_dense_subgraphs(self, min_size=4, density_threshold=0.6):
        """Detect unusually dense weakly-connected components."""
        anomalies = []
        try:
            components = list(nx.weakly_connected_components(self._graph))
            for comp_nodes in components:
                if len(comp_nodes) < min_size:
                    continue
                subgraph = self._graph.subgraph(comp_nodes)
                density = nx.density(subgraph.to_undirected())
                if density >= density_threshold:
                    score = min(0.95, 0.4 + density * 0.6)
                    anomalies.append((frozenset(comp_nodes), density, score))
        except Exception:
            pass
        return sorted(anomalies, key=lambda x: x[2], reverse=True)[:10]

    def get_lateral_movement_paths(self, max_hops=4):
        """
        Detect multi-hop paths that cross entity types
        (user -> device -> IP -> domain) indicating lateral movement.
        """
        suspicious_paths = []
        try:
            # Find paths from user-type nodes to domain-type nodes
            user_nodes = [n for n in self._graph.nodes() if self._is_user_node(n)]
            domain_nodes = [n for n in self._graph.nodes() if self._is_domain_node(n)]

            for user in user_nodes[:50]:
                for domain in domain_nodes[:50]:
                    try:
                        paths = list(nx.all_simple_paths(
                            self._graph, user, domain, cutoff=max_hops
                        ))
                        for path in paths:
                            if len(path) >= 3:
                                suspicious_paths.append((path, len(path)))
                    except (nx.NodeNotFound, nx.NetworkXNoPath):
                        continue
        except Exception:
            pass

        return sorted(suspicious_paths, key=lambda x: x[1], reverse=True)[:10]

    def _is_user_node(self, node: str) -> bool:
        return node.startswith("user:") or "@" in node

    def _is_domain_node(self, node: str) -> bool:
        return "." in node and not node.replace(".", "").isdigit()

    def get_metrics_summary(self):
        """Return current graph health metrics."""
        return {
            "nodes": self._graph.number_of_nodes(),
            "edges": self._graph.number_of_edges(),
            "components": nx.number_weakly_connected_components(self._graph) if self._graph.number_of_nodes() > 0 else 0,
            "batch_count": self._batch_count,
            "total_events": self._total_events_processed,
            "total_detections": self._total_detections,
        }


# Initialize persistent graph state
graph_state = StreamingGraphState(ttl_hours=edge_ttl_hours, max_nodes=max_graph_nodes)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Ensure Output Tables

# COMMAND ----------

detections_table = get_table_path(cfg, "graph_cep_detections")
baseline_table = get_table_path(cfg, "graph_cep_baseline")
alerts_table = get_table_path(cfg, "alerts")

spark.sql(f"""
CREATE TABLE IF NOT EXISTS {detections_table} (
    pattern_id STRING,
    batch_id LONG,
    affected_entities ARRAY<STRING>,
    pattern_type STRING,
    subgraph_hash STRING,
    anomaly_score DOUBLE,
    description STRING,
    graph_snapshot STRING,
    detected_at TIMESTAMP
)
USING DELTA
PARTITIONED BY (pattern_type)
""")

spark.sql(f"""
CREATE TABLE IF NOT EXISTS {baseline_table} (
    batch_id LONG,
    node_count INT,
    edge_count INT,
    component_count INT,
    top_centrality STRING,
    metrics_json STRING,
    snapshot_at TIMESTAMP
)
USING DELTA
""")

mon.log_event("graph_cep_tables_ensured", {"detections": detections_table, "baseline": baseline_table})

# COMMAND ----------

# MAGIC %md
# MAGIC ## Load Previous Baseline (Cold Start Recovery)

# COMMAND ----------

try:
    latest_baseline = spark.sql(f"""
        SELECT metrics_json FROM {baseline_table}
        ORDER BY snapshot_at DESC LIMIT 1
    """)
    if latest_baseline.count() > 0:
        metrics = json.loads(latest_baseline.first()["metrics_json"])
        graph_state._baseline_centrality = metrics.get("centrality", {})
        graph_state._baseline_edges = set(
            tuple(e) for e in metrics.get("edge_sample", [])
        )
        logger.info(f"Loaded baseline: {len(graph_state._baseline_centrality)} centrality entries")
except Exception as e:
    logger.info(f"No prior baseline found (cold start): {e}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Streaming Source from ZeroBus (Sub-Second Latency)

# COMMAND ----------

checkpoint_location = get_checkpoint_path(cfg, "graph_cep_streaming")

events_stream, sdp_source = create_sdp_stream_with_fallback(
    spark, secrets_mgr, cfg,
    consumer_group="0xdsi-sdp-graph-cep",
    watermark="5 minutes",
    max_offsets_per_trigger=50000,
)

# Select only the columns needed for graph construction
events_stream = events_stream.select(
    col("id").alias("event_id"),
    col("event_type"),
    col("user_id").alias("source_user"),
    col("hostname").alias("source_device"),
    col("source_ip"),
    col("dest_ip"),
    coalesce(col("description"), lit("")).alias("dest_domain"),
    col("timestamp"),
    col("severity"),
)

mon.log_event("graph_cep_stream_initialized", {"source": sdp_source, "consumer_group": "0xdsi-sdp-graph-cep"})

# COMMAND ----------

# MAGIC %md
# MAGIC ## foreachBatch: Incremental Graph Update + Detection

# COMMAND ----------

def process_graph_cep_batch(batch_df, batch_id):
    """
    Process a streaming micro-batch:
    1. Extract entity edges from events
    2. Add to persistent NetworkX graph
    3. Prune expired edges (TTL)
    4. Run anomaly detection
    5. Write detections to Delta
    6. Periodically snapshot baseline
    """
    if batch_df.isEmpty():
        return

    batch_start = time.time()
    graph_state.increment_batch()
    now = datetime.utcnow()

    # --- 1. Extract edges from events ---
    events = batch_df.collect()
    graph_state._total_events_processed += len(events)

    for event in events:
        src_user = event.source_user
        src_device = event.source_device
        src_ip = event.source_ip
        dst_ip = event.dest_ip
        dst_domain = event.dest_domain
        ts = event.timestamp or now

        # user -> device
        if src_user and src_device:
            graph_state.add_edge(f"user:{src_user}", f"device:{src_device}", "used_device", ts)
        # device -> source IP
        if src_device and src_ip:
            graph_state.add_edge(f"device:{src_device}", f"ip:{src_ip}", "resolved_to_ip", ts)
        # source IP -> dest IP
        if src_ip and dst_ip:
            graph_state.add_edge(f"ip:{src_ip}", f"ip:{dst_ip}", "connected_to", ts)
        # source IP -> domain
        if src_ip and dst_domain and "." in dst_domain:
            graph_state.add_edge(f"ip:{src_ip}", f"domain:{dst_domain}", "resolved_domain", ts)
        # user -> source IP (direct)
        if src_user and src_ip:
            graph_state.add_edge(f"user:{src_user}", f"ip:{src_ip}", "originated_from", ts)

    # --- 2. Prune expired edges ---
    pruned_count = graph_state.prune_expired_edges(now)
    overflow_pruned = graph_state.force_prune_if_oversized()

    # --- 3. Anomaly detection ---
    detections = []

    # 3a: New edges not in baseline
    new_edges = graph_state.get_new_edges()
    if len(new_edges) > 5:
        sample_edges = list(new_edges)[:10]
        entities = set()
        for src, tgt in sample_edges:
            entities.add(src)
            entities.add(tgt)
        score = min(0.95, 0.6 + len(new_edges) * 0.005)
        if score >= anomaly_threshold:
            detections.append({
                "pattern_type": "new_edges_burst",
                "affected_entities": list(entities)[:20],
                "anomaly_score": score,
                "description": f"{len(new_edges)} new entity relationships in single batch",
                "graph_snapshot": json.dumps({"new_edge_count": len(new_edges)}),
            })

    # 3b: Centrality drift
    centrality_drifts = graph_state.get_centrality_drift(threshold_ratio=2.5)
    for node, baseline, current, ratio in centrality_drifts[:5]:
        score = min(0.95, 0.6 + (ratio - 2.5) * 0.1)
        if score >= anomaly_threshold:
            detections.append({
                "pattern_type": "centrality_drift",
                "affected_entities": [node],
                "anomaly_score": score,
                "description": f"Node {node} centrality spiked {ratio:.1f}x (baseline={baseline:.3f}, current={current:.3f})",
                "graph_snapshot": json.dumps({"baseline": baseline, "current": current, "ratio": ratio}),
            })

    # 3c: Fan-out detection (lateral movement indicator)
    fan_out_anomalies = graph_state.get_fan_out_anomalies(threshold=fan_out_threshold)
    for node, degree, successors in fan_out_anomalies:
        score = min(0.95, 0.65 + (degree - fan_out_threshold) * 0.02)
        if score >= anomaly_threshold:
            detections.append({
                "pattern_type": "fan_out_lateral",
                "affected_entities": [node] + successors[:5],
                "anomaly_score": score,
                "description": f"High fan-out: {node} connected to {degree} targets (possible lateral movement)",
                "graph_snapshot": json.dumps({"out_degree": degree, "targets_sample": successors}),
            })

    # 3d: Dense subgraphs (command & control clusters)
    dense_subs = graph_state.get_dense_subgraphs(min_size=4, density_threshold=0.65)
    for nodes, density, score in dense_subs:
        if score >= anomaly_threshold:
            node_list = list(nodes)[:20]
            detections.append({
                "pattern_type": "dense_cluster",
                "affected_entities": node_list,
                "anomaly_score": score,
                "description": f"Dense communication cluster ({len(nodes)} nodes, density={density:.2f})",
                "graph_snapshot": json.dumps({"size": len(nodes), "density": density}),
            })

    # 3e: Lateral movement paths (multi-hop user->domain)
    lat_paths = graph_state.get_lateral_movement_paths(max_hops=4)
    for path, hop_count in lat_paths[:3]:
        score = min(0.95, 0.7 + hop_count * 0.05)
        if score >= anomaly_threshold:
            detections.append({
                "pattern_type": "lateral_movement_path",
                "affected_entities": path,
                "anomaly_score": score,
                "description": f"Multi-hop path detected ({hop_count} hops): {' -> '.join(path[:5])}",
                "graph_snapshot": json.dumps({"path": path, "hops": hop_count}),
            })

    # --- 4. Write detections ---
    if detections:
        detection_rows = []
        for det in detections:
            entities = det["affected_entities"]
            subgraph_hash = hashlib.sha256(
                json.dumps(sorted(entities)).encode()
            ).hexdigest()[:16]

            detection_rows.append({
                "pattern_id": f"gcep_{batch_id}_{len(detection_rows)}",
                "batch_id": int(batch_id),
                "affected_entities": entities,
                "pattern_type": det["pattern_type"],
                "subgraph_hash": subgraph_hash,
                "anomaly_score": float(det["anomaly_score"]),
                "description": det["description"],
                "graph_snapshot": det["graph_snapshot"],
                "detected_at": now,
            })

        det_df = spark.createDataFrame(detection_rows)
        det_df.write.mode("append").saveAsTable(detections_table)
        graph_state._total_detections += len(detection_rows)

        # Also write high-confidence detections as alerts
        high_confidence = [d for d in detection_rows if d["anomaly_score"] >= 0.85]
        if high_confidence:
            alert_rows = [{
                "id": f"alert_gcep_{d['pattern_id']}",
                "title": f"[Graph CEP] {d['description'][:100]}",
                "severity": "high" if d["anomaly_score"] >= 0.9 else "medium",
                "source": "graph_cep_streaming",
                "event_type": d["pattern_type"],
                "source_ip": next((e for e in d["affected_entities"] if e.startswith("ip:")), None),
                "user_id": next((e.replace("user:", "") for e in d["affected_entities"] if e.startswith("user:")), None),
                "description": d["description"],
                "created_at": now,
                "mitre_tactic": "Lateral Movement" if "lateral" in d["pattern_type"] else "Discovery",
                "mitre_technique": _get_mitre_technique(d["pattern_type"]),
            } for d in high_confidence]

            alert_df = spark.createDataFrame(alert_rows)
            alert_df.write.mode("append").option("mergeSchema", "true").saveAsTable(alerts_table)

    # --- 5. Periodic baseline snapshot ---
    if graph_state.batch_count % baseline_refresh_batches == 0:
        graph_state.snapshot_baseline()
        _persist_baseline(batch_id, now)

    # --- 6. Log batch metrics ---
    batch_duration = time.time() - batch_start
    metrics = graph_state.get_metrics_summary()
    metrics["batch_id"] = batch_id
    metrics["batch_duration_ms"] = int(batch_duration * 1000)
    metrics["events_in_batch"] = len(events)
    metrics["detections_in_batch"] = len(detections)
    metrics["edges_pruned"] = pruned_count + overflow_pruned

    mon.log_event("graph_cep_batch_complete", metrics)

    if batch_id % 10 == 0:
        logger.info(
            f"Batch {batch_id}: {len(events)} events, "
            f"{metrics['nodes']} nodes, {metrics['edges']} edges, "
            f"{len(detections)} detections, {batch_duration*1000:.0f}ms"
        )


def _get_mitre_technique(pattern_type: str) -> str:
    """Map pattern type to MITRE ATT&CK technique."""
    mapping = {
        "new_edges_burst": "T1021 - Remote Services",
        "centrality_drift": "T1071 - Application Layer Protocol",
        "fan_out_lateral": "T1021.001 - Remote Desktop Protocol",
        "dense_cluster": "T1571 - Non-Standard Port",
        "lateral_movement_path": "T1550 - Use Alternate Authentication Material",
    }
    return mapping.get(pattern_type, "T1046 - Network Service Discovery")


def _persist_baseline(batch_id, now):
    """Save baseline snapshot to Delta for crash recovery."""
    try:
        metrics = graph_state.get_metrics_summary()
        centrality = {}
        if graph_state.graph.number_of_nodes() > 0:
            centrality = nx.degree_centrality(graph_state.graph)

        # Sample edges for baseline comparison (limit serialization size)
        edge_sample = list(graph_state.graph.edges())[:5000]

        metrics_json = json.dumps({
            "centrality": {k: round(v, 4) for k, v in list(centrality.items())[:1000]},
            "edge_sample": edge_sample,
            "node_count": metrics["nodes"],
            "edge_count": metrics["edges"],
        })

        top_centrality = json.dumps(
            sorted(centrality.items(), key=lambda x: x[1], reverse=True)[:20]
        )

        df = spark.createDataFrame([{
            "batch_id": int(batch_id),
            "node_count": metrics["nodes"],
            "edge_count": metrics["edges"],
            "component_count": metrics["components"],
            "top_centrality": top_centrality,
            "metrics_json": metrics_json,
            "snapshot_at": now,
        }])
        df.write.mode("append").saveAsTable(baseline_table)
        logger.info(f"Baseline snapshot saved at batch {batch_id}")
    except Exception as e:
        logger.warning(f"Baseline persist failed: {e}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Start Streaming Query

# COMMAND ----------

# Take initial baseline snapshot
graph_state.snapshot_baseline()

query = (
    events_stream
    .writeStream
    .foreachBatch(process_graph_cep_batch)
    .option("checkpointLocation", checkpoint_location)
    .trigger(processingTime=trigger_interval)
    .queryName("0xdsi_graph_cep_streaming")
    .start()
)

mon.log_event("graph_cep_streaming_started", {
    "checkpoint": checkpoint_location,
    "trigger": trigger_interval,
    "query_name": query.name,
    "query_id": str(query.id),
})

print(f"Graph CEP streaming started: trigger={trigger_interval}, checkpoint={checkpoint_location}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Monitor Until Termination

# COMMAND ----------

try:
    query.awaitTermination()
except Exception as e:
    mon.log_error(e, context="Graph CEP streaming terminated unexpectedly")
    metrics = graph_state.get_metrics_summary()
    mlflow.log_metrics({
        "final_nodes": metrics["nodes"],
        "final_edges": metrics["edges"],
        "total_batches": metrics["batch_count"],
        "total_events": metrics["total_events"],
        "total_detections": metrics["total_detections"],
    })
    raise
finally:
    final_metrics = graph_state.get_metrics_summary()
    mon.log_event("graph_cep_streaming_terminated", final_metrics)
    print(f"Final state: {json.dumps(final_metrics, indent=2)}")
    dbutils.notebook.exit(json.dumps(final_metrics))
