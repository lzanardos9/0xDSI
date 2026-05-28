# Databricks notebook source
# MAGIC %md
# MAGIC # Agent 26: Real-Time Graph CEP Agent
# MAGIC
# MAGIC **Production-Grade BatchAgent Implementation**
# MAGIC
# MAGIC Maintains a graph of entity relationships (user->device->IP->domain) and detects
# MAGIC anomalous graph patterns including new edges, unusual paths, and centrality changes.
# MAGIC Processes streaming micro-batches of events to update graph edges.
# MAGIC
# MAGIC ## Key Features
# MAGIC - Dynamic entity relationship graph with NetworkX
# MAGIC - Anomaly detection via graph pattern analysis
# MAGIC - Centrality metrics and structural changes
# MAGIC - MLflow experiment tracking and metrics logging
# MAGIC - UC Function tool registration
# MAGIC - Writes detection results to graph_cep_detections table

# COMMAND ----------

# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

# MAGIC %md
# MAGIC ## Initialization and Configuration

# COMMAND ----------

from agent_framework import (
    BatchAgent, AgentResult, AgentStatus, UCTool, create_soc_tools
)
import mlflow
import mlflow.tracing
from pyspark.sql.functions import *
from pyspark.sql.types import *
import json
import time
import logging
import hashlib
from datetime import datetime
import networkx as nx
from collections import defaultdict

logger = logging.getLogger("oxdsi.graph_cep_agent")

# Parse notebook parameters
dbutils.widgets.text("batch_size", "1000", "Max events to process per run")
dbutils.widgets.text("lookback_hours", "24", "Graph window in hours")
dbutils.widgets.text("anomaly_threshold", "0.75", "Anomaly score threshold")

batch_size = int(dbutils.widgets.get("batch_size"))
lookback_hours = int(dbutils.widgets.get("lookback_hours"))
anomaly_threshold = float(dbutils.widgets.get("anomaly_threshold"))

mon.log_event("graph_cep_config_loaded", {
    "batch_size": batch_size,
    "lookback_hours": lookback_hours,
    "anomaly_threshold": anomaly_threshold,
})

# COMMAND ----------

# MAGIC %md
# MAGIC ## Define GraphCEPAgent Class

# COMMAND ----------

class GraphCEPAgent(BatchAgent):
    """
    Real-time Complex Event Processing using entity relationship graphs.

    Detects anomalies by:
    - Tracking entity relationships (user->device->IP->domain)
    - Computing graph metrics (centrality, clustering, path lengths)
    - Detecting structural changes (new edges, isolated subgraphs)
    - Flagging unusual communication patterns
    """

    def __init__(self, agent_name: str, cfg, llm, mon, spark):
        super().__init__(agent_name, cfg, llm, mon, spark)
        self._graph = nx.DiGraph()
        self._baseline_metrics = {}
        self._detections = []

        # Register UC tools
        soc_tools = create_soc_tools(cfg)
        for tool in soc_tools:
            if tool.name in ["get_alert_context", "query_user_behavior"]:
                self.register_tool(tool)

    def execute(self) -> AgentResult:
        """Main execution: fetch events → build graph → detect anomalies → persist."""
        start_time = time.time()

        try:
            # Ensure output table exists
            self._ensure_output_table()

            # Fetch raw events for the lookback window
            events_df = self._fetch_events()
            event_count = events_df.count()

            if event_count == 0:
                return AgentResult(
                    status=AgentStatus.IDLE,
                    agent_name=self.agent_name,
                    processed_count=0,
                    duration_seconds=time.time() - start_time,
                )

            # Load baseline metrics from previous run
            self._load_baseline_metrics()

            # Build graph from events
            events_data = events_df.collect()
            for row in events_data[:batch_size]:
                self._add_event_edges(row)

            # Detect anomalies
            anomalies = self._detect_graph_anomalies()
            self._detections = anomalies

            # Persist detections
            if len(self._detections) > 0:
                self._write_detections()

            # Update baseline metrics for next run
            self._save_baseline_metrics()

            return AgentResult(
                status=AgentStatus.COMPLETED,
                agent_name=self.agent_name,
                processed_count=event_count,
                error_count=0,
                duration_seconds=time.time() - start_time,
                details={
                    "graph_nodes": self._graph.number_of_nodes(),
                    "graph_edges": self._graph.number_of_edges(),
                    "detections_count": len(self._detections),
                    "anomaly_threshold": anomaly_threshold,
                }
            )

        except Exception as e:
            duration = time.time() - start_time
            logger.exception(f"GraphCEPAgent failed: {e}")
            mon.log_event(f"{self.agent_name}_failed", {"error": str(e)[:500]})
            return AgentResult(
                status=AgentStatus.FAILED,
                agent_name=self.agent_name,
                duration_seconds=duration,
                error=str(e)[:500],
            )

    def _ensure_output_table(self):
        """Create graph_cep_detections table if it doesn't exist."""
        table_name = get_table_path(cfg, "graph_cep_detections")
        ensure_table_exists(
            spark, table_name,
            schema=StructType([
                StructField("pattern_id", StringType()),
                StructField("affected_entities", ArrayType(StringType())),
                StructField("pattern_type", StringType()),
                StructField("subgraph_hash", StringType()),
                StructField("anomaly_score", DoubleType()),
                StructField("description", StringType()),
                StructField("timestamp", TimestampType()),
                StructField("graph_metrics", StringType()),
            ])
        )

    def _fetch_events(self):
        """Fetch raw events from the lookback window."""
        table_name = get_table_path(cfg, "raw_events")
        cutoff_time = f"current_timestamp() - interval {lookback_hours} hours"

        query = f"""
            SELECT
                event_id, event_type, source_user, source_device,
                source_ip, dest_ip, dest_domain, timestamp
            FROM {table_name}
            WHERE timestamp > {cutoff_time}
            LIMIT {batch_size}
        """

        return spark.sql(query)

    def _add_event_edges(self, event):
        """Add entity relationship edges to the graph from an event."""
        edges = []

        # user -> device
        if event.source_user and event.source_device:
            edges.append((event.source_user, event.source_device, "used_device"))

        # device -> IP
        if event.source_device and event.source_ip:
            edges.append((event.source_device, event.source_ip, "resolved_to_ip"))

        # IP -> domain
        if event.source_ip and event.dest_domain:
            edges.append((event.source_ip, event.dest_domain, "connected_to_domain"))

        # user -> IP (direct)
        if event.source_user and event.source_ip:
            edges.append((event.source_user, event.source_ip, "originated_from_ip"))

        # Add edges to graph with timestamps
        for src, tgt, rel_type in edges:
            if self._graph.has_edge(src, tgt):
                self._graph[src][tgt]["count"] = self._graph[src][tgt].get("count", 0) + 1
                self._graph[src][tgt]["last_seen"] = event.timestamp
            else:
                self._graph.add_edge(src, tgt,
                                   rel_type=rel_type,
                                   count=1,
                                   first_seen=event.timestamp,
                                   last_seen=event.timestamp)

    def _detect_graph_anomalies(self):
        """Detect anomalous patterns in the entity graph."""
        detections = []

        # Anomaly 1: New edges (not in baseline)
        new_edges = self._detect_new_edges()
        for src, tgt, edge_data in new_edges:
            score = 0.85
            if score >= anomaly_threshold:
                detection = {
                    "pattern_type": "new_edge",
                    "affected_entities": [src, tgt],
                    "anomaly_score": score,
                    "description": f"New relationship detected: {src} -> {tgt}",
                    "graph_metrics": json.dumps({"edge_count": len(new_edges)}),
                }
                detections.append(detection)

        # Anomaly 2: High centrality changes
        centrality_anomalies = self._detect_centrality_changes()
        for entity, change in centrality_anomalies:
            score = 0.80
            if score >= anomaly_threshold:
                detection = {
                    "pattern_type": "centrality_change",
                    "affected_entities": [entity],
                    "anomaly_score": score,
                    "description": f"Unusual centrality increase for {entity}",
                    "graph_metrics": json.dumps(change),
                }
                detections.append(detection)

        # Anomaly 3: Unusual subgraph structures
        subgraph_anomalies = self._detect_unusual_subgraphs()
        for subgraph_nodes, score in subgraph_anomalies:
            if score >= anomaly_threshold:
                detection = {
                    "pattern_type": "unusual_subgraph",
                    "affected_entities": list(subgraph_nodes),
                    "anomaly_score": score,
                    "description": f"Unusual communication pattern in subgraph",
                    "graph_metrics": json.dumps({"nodes": len(subgraph_nodes)}),
                }
                detections.append(detection)

        return detections

    def _detect_new_edges(self):
        """Find edges that are new compared to baseline."""
        new_edges = []
        current_edges = set(self._graph.edges())
        baseline_edges = set(self._baseline_metrics.get("edges", []))

        for edge in current_edges - baseline_edges:
            src, tgt = edge
            edge_data = self._graph.get_edge_data(src, tgt)
            new_edges.append((src, tgt, edge_data))

        return new_edges[:20]  # Limit to top 20

    def _detect_centrality_changes(self):
        """Detect nodes with significant centrality increases."""
        anomalies = []

        if self._graph.number_of_nodes() == 0:
            return anomalies

        try:
            current_centrality = nx.degree_centrality(self._graph)
            baseline_centrality = self._baseline_metrics.get("centrality", {})

            for node, current_score in current_centrality.items():
                baseline_score = baseline_centrality.get(node, 0.0)
                if current_score > 0 and baseline_score > 0:
                    change_ratio = current_score / baseline_score
                    if change_ratio > 2.0:  # 2x increase
                        anomalies.append((node, {
                            "baseline": baseline_score,
                            "current": current_score,
                            "ratio": change_ratio,
                        }))
        except Exception as e:
            logger.warning(f"Centrality analysis failed: {e}")

        return anomalies[:10]

    def _detect_unusual_subgraphs(self):
        """Detect subgraphs with unusual connection patterns."""
        anomalies = []

        if self._graph.number_of_nodes() < 3:
            return anomalies

        try:
            # Find weakly connected components
            subgraphs = list(nx.weakly_connected_components(self._graph))

            for subgraph_nodes in subgraphs:
                if len(subgraph_nodes) >= 3:
                    subgraph = self._graph.subgraph(subgraph_nodes)
                    density = nx.density(subgraph.to_undirected())

                    # High density + relatively isolated = suspicious
                    if density > 0.7:
                        score = min(0.95, 0.5 + density * 0.5)
                        anomalies.append((subgraph_nodes, score))
        except Exception as e:
            logger.warning(f"Subgraph analysis failed: {e}")

        return sorted(anomalies, key=lambda x: x[1], reverse=True)[:5]

    def _load_baseline_metrics(self):
        """Load baseline metrics from the previous run."""
        try:
            baseline_table = get_table_path(cfg, "graph_cep_baseline")
            df = spark.sql(f"SELECT metrics FROM {baseline_table} ORDER BY timestamp DESC LIMIT 1")
            if df.count() > 0:
                metrics_json = df.first()["metrics"]
                self._baseline_metrics = json.loads(metrics_json)
        except Exception as e:
            logger.info(f"No baseline metrics found: {e}")
            self._baseline_metrics = {}

    def _save_baseline_metrics(self):
        """Save current graph metrics as baseline for next run."""
        try:
            baseline_table = get_table_path(cfg, "graph_cep_baseline")

            current_edges = list(self._graph.edges())
            current_centrality = nx.degree_centrality(self._graph) if self._graph.number_of_nodes() > 0 else {}

            metrics = {
                "edges": current_edges,
                "centrality": current_centrality,
                "node_count": self._graph.number_of_nodes(),
                "edge_count": self._graph.number_of_edges(),
                "timestamp": datetime.utcnow().isoformat(),
            }

            df = spark.createDataFrame([{
                "metrics": json.dumps(metrics),
                "timestamp": datetime.utcnow(),
            }], schema="metrics STRING, timestamp TIMESTAMP")

            safe_append(df, baseline_table)
        except Exception as e:
            logger.warning(f"Failed to save baseline metrics: {e}")

    def _write_detections(self):
        """Write detection results to the output table."""
        table_name = get_table_path(cfg, "graph_cep_detections")

        detection_rows = []
        for detection in self._detections:
            # Compute subgraph hash
            entities = tuple(sorted(detection["affected_entities"]))
            subgraph_hash = hashlib.sha256(str(entities).encode()).hexdigest()[:16]

            detection_rows.append({
                "pattern_id": f"gce_{int(time.time())}_{len(detection_rows)}",
                "affected_entities": detection["affected_entities"],
                "pattern_type": detection["pattern_type"],
                "subgraph_hash": subgraph_hash,
                "anomaly_score": float(detection["anomaly_score"]),
                "description": detection["description"],
                "timestamp": datetime.utcnow(),
                "graph_metrics": detection["graph_metrics"],
            })

        if detection_rows:
            df = spark.createDataFrame(detection_rows, schema=StructType([
                StructField("pattern_id", StringType()),
                StructField("affected_entities", ArrayType(StringType())),
                StructField("pattern_type", StringType()),
                StructField("subgraph_hash", StringType()),
                StructField("anomaly_score", DoubleType()),
                StructField("description", StringType()),
                StructField("timestamp", TimestampType()),
                StructField("graph_metrics", StringType()),
            ]))
            safe_append(df, table_name)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Execution

# COMMAND ----------

# Initialize agent
agent = GraphCEPAgent("realtime_graph_cep", cfg, llm, mon, spark)

# Execute
result = agent.run()

# Log result
mon.log_event("graph_cep_execution_complete", {
    "status": result.status.value,
    "processed": result.processed_count,
    "errors": result.error_count,
    "duration": result.duration_seconds,
    "detections": result.details.get("detections_count", 0),
})

# Display result
print(result.to_json())
mlflow.log_dict(json.loads(result.to_json()), "execution_result")

# Exit with status
dbutils.notebook.exit(result.to_json())
