# Databricks notebook source
# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

# MAGIC %md
# MAGIC # Agent 26 - Real-time Graph CEP
# MAGIC Builds entity relationship graph from 1-hour event window.
# MAGIC Detects multi-hop lateral movement and temporal attack sequences.

# COMMAND ----------

import json
from datetime import datetime, timedelta
from pyspark.sql import functions as F

# COMMAND ----------

# MAGIC %md
# MAGIC ## Configuration

# COMMAND ----------

LOOKBACK_HOURS = 1
TEMPORAL_WINDOW_MINUTES = 30
ATTACK_PHASES = ["reconnaissance", "exploitation", "persistence"]
events_table = cfg.get_table_path("security_events")
graph_detections_table = cfg.get_table_path("graph_cep_detections")
alerts_table = cfg.get_table_path("alerts")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Build Entity Relationship Graph

# COMMAND ----------

mon.time("build_graph")
cutoff_time = datetime.utcnow() - timedelta(hours=LOOKBACK_HOURS)

events_df = (
    spark.read.table(events_table)
    .filter(F.col("event_time") >= F.lit(cutoff_time))
    .filter(F.col("src_entity").isNotNull() & F.col("dst_entity").isNotNull())
    .select("event_id", "event_time", "src_entity", "dst_entity",
            "event_type", "mitre_tactic", "severity")
    .cache()
)

edges_df = events_df.select(
    F.col("src_entity").alias("src"), F.col("dst_entity").alias("dst"),
    F.col("event_time"), F.col("event_type"), F.col("mitre_tactic"), F.col("event_id"),
)
event_count = events_df.count()
edge_count = edges_df.count()
mon.log_event("graph_built", {"events": event_count, "edges": edge_count})

# COMMAND ----------

# MAGIC %md
# MAGIC ## Detect Multi-Hop Lateral Movement (A->B->C->D)

# COMMAND ----------

mon.time("lateral_movement_detection")
hop1 = edges_df.alias("h1")
hop2 = edges_df.alias("h2")
hop3 = edges_df.alias("h3")

two_hop = (
    hop1.join(hop2, (F.col("h1.dst") == F.col("h2.src"))
              & (F.col("h2.event_time") > F.col("h1.event_time")))
    .select(
        F.col("h1.src").alias("origin"), F.col("h1.dst").alias("hop1_node"),
        F.col("h2.dst").alias("hop2_node"), F.col("h1.event_time").alias("t1"),
        F.col("h2.event_time").alias("t2"),
        F.col("h1.event_id").alias("eid_1"), F.col("h2.event_id").alias("eid_2"))
)

three_hop = (
    two_hop.join(hop3, (F.col("hop2_node") == F.col("h3.src"))
                 & (F.col("h3.event_time") > F.col("t2")))
    .select("origin", "hop1_node", "hop2_node",
            F.col("h3.dst").alias("hop3_node"), "t1", "t2",
            F.col("h3.event_time").alias("t3"),
            F.array("eid_1", "eid_2", F.col("h3.event_id")).alias("event_chain"))
    .filter(F.col("origin") != F.col("hop3_node"))
)

lateral_chains = three_hop.withColumn(
    "chain_path", F.concat_ws(" -> ", "origin", "hop1_node", "hop2_node", "hop3_node")
).withColumn("detection_type", F.lit("multi_hop_lateral_movement"))
lateral_count = lateral_chains.count()
mon.log_event("lateral_chains_detected", {"count": lateral_count})

# COMMAND ----------

# MAGIC %md
# MAGIC ## Detect Temporal Sequences (Recon -> Exploit -> Persist within 30min)

# COMMAND ----------

mon.time("temporal_sequence_detection")
phase_events = (
    events_df.filter(F.col("mitre_tactic").isin(ATTACK_PHASES))
    .select("src_entity", "event_time", "mitre_tactic", "event_id")
)
recon_df = phase_events.filter(F.col("mitre_tactic") == "reconnaissance").alias("recon")
exploit_df = phase_events.filter(F.col("mitre_tactic") == "exploitation").alias("exploit")
persist_df = phase_events.filter(F.col("mitre_tactic") == "persistence").alias("persist")
tw = F.expr(f"INTERVAL {TEMPORAL_WINDOW_MINUTES} MINUTES")

temporal_sequences = (
    recon_df.join(exploit_df,
        (F.col("recon.src_entity") == F.col("exploit.src_entity"))
        & (F.col("exploit.event_time") > F.col("recon.event_time"))
        & (F.col("exploit.event_time") <= F.col("recon.event_time") + tw))
    .join(persist_df,
        (F.col("recon.src_entity") == F.col("persist.src_entity"))
        & (F.col("persist.event_time") > F.col("exploit.event_time"))
        & (F.col("persist.event_time") <= F.col("recon.event_time") + tw))
    .select(
        F.col("recon.src_entity").alias("entity"),
        F.col("recon.event_time").alias("recon_time"),
        F.col("exploit.event_time").alias("exploit_time"),
        F.col("persist.event_time").alias("persist_time"),
        F.array(F.col("recon.event_id"), F.col("exploit.event_id"),
                F.col("persist.event_id")).alias("event_chain"),
        F.lit("temporal_attack_sequence").alias("detection_type"))
)
sequence_count = temporal_sequences.count()
mon.log_event("temporal_sequences_detected", {"count": sequence_count})

# COMMAND ----------

# MAGIC %md
# MAGIC ## Store Detections and Generate Alerts

# COMMAND ----------

mon.time("store_detections")
run_timestamp = datetime.utcnow()

lateral_det = lateral_chains.select(
    F.lit("lateral_movement").alias("detection_type"),
    F.col("chain_path").alias("description"),
    F.col("origin").alias("primary_entity"), "event_chain",
    F.col("t1").alias("first_seen"), F.col("t3").alias("last_seen"),
    F.lit("critical").alias("severity"), F.lit(run_timestamp).alias("detected_at"))

temporal_det = temporal_sequences.select(
    F.lit("temporal_sequence").alias("detection_type"),
    F.concat_ws(" | ", F.lit("recon->exploit->persist"), F.col("entity")).alias("description"),
    F.col("entity").alias("primary_entity"), "event_chain",
    F.col("recon_time").alias("first_seen"), F.col("persist_time").alias("last_seen"),
    F.lit("high").alias("severity"), F.lit(run_timestamp).alias("detected_at"))

all_detections = lateral_det.unionByName(temporal_det)
detection_total = all_detections.count()

if detection_total > 0:
    all_detections.write.mode("append").saveAsTable(graph_detections_table)
    alerts_df = all_detections.select(
        F.expr("uuid()").alias("alert_id"), F.col("detection_type").alias("source"),
        F.col("description").alias("title"), "primary_entity", "severity",
        F.col("detected_at").alias("created_at"), F.lit("open").alias("status"),
        F.col("event_chain").alias("related_events"))
    alerts_df.write.mode("append").saveAsTable(alerts_table)
mon.log_event("detections_stored", {"total": detection_total})

# COMMAND ----------

# MAGIC %md
# MAGIC ## Finalize

# COMMAND ----------

result = {
    "agent": "26_realtime_graph_cep",
    "status": "success",
    "events_processed": event_count,
    "edges_built": edge_count,
    "lateral_chains_detected": lateral_count,
    "temporal_sequences_detected": sequence_count,
    "total_detections": detection_total,
    "timestamp": run_timestamp.isoformat(),
}
mon.log_complete(result)
dbutils.notebook.exit(json.dumps(result))
