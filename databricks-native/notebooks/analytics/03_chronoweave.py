# Databricks notebook source
# MAGIC %md
# MAGIC # Analytics - ChronoWeave (Compounding Threat Graph)
# MAGIC
# MAGIC Builds a real-time compounding threat graph by:
# MAGIC - Ingesting security events as graph nodes with 8-D embeddings
# MAGIC - Computing cosine similarity against known threat actor centroids
# MAGIC - Detecting pattern matches when similarity exceeds threshold
# MAGIC - Maintaining session lifecycle for visual graph exploration
# MAGIC
# MAGIC Outputs: chronoweave_sessions, chronoweave_nodes, chronoweave_edges, chronoweave_similarity_hits

# COMMAND ----------

# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

import json
import uuid
import math
import random
from datetime import datetime
from pyspark.sql import functions as F
from pyspark.sql.types import (
    StructType, StructField, StringType, DoubleType,
    TimestampType, BooleanType, IntegerType, ArrayType,
)

# COMMAND ----------

dbutils.widgets.text("similarity_threshold", "0.72", "Cosine similarity threshold for centroid match")
dbutils.widgets.text("max_nodes", "400", "Maximum nodes per session")
dbutils.widgets.text("max_edges", "800", "Maximum edges per session")
dbutils.widgets.text("lookback_minutes", "30", "Event lookback window (minutes)")

similarity_threshold = float(dbutils.widgets.get("similarity_threshold"))
max_nodes = int(dbutils.widgets.get("max_nodes"))
max_edges = int(dbutils.widgets.get("max_edges"))
lookback_minutes = int(dbutils.widgets.get("lookback_minutes"))

# COMMAND ----------

try:
    result = {"notebook": "03_chronoweave", "status": "success", "started_at": datetime.utcnow().isoformat()}
    session_id = str(uuid.uuid4())

    # --- Load Threat Actor Centroids ---
    with mon.time("load_centroids"):
        centroids_df = spark.sql(f"""
            SELECT id, name, actor_class, actor_country, embedding,
                   severity, mitre_tactics, color
            FROM {cfg.get_table_path("chronoweave_bad_centroids")}
        """)
        centroids = centroids_df.collect()
        centroid_count = len(centroids)
        mon.log_metric("centroid_count", centroid_count)

    # --- Load Recent Security Events ---
    with mon.time("load_events"):
        events_df = spark.sql(f"""
            SELECT id, event_type, source_ip, dest_ip, username,
                   hostname, severity, action, timestamp
            FROM {cfg.get_table_path("silver_events")}
            WHERE timestamp > current_timestamp() - INTERVAL {lookback_minutes} MINUTES
            ORDER BY timestamp
            LIMIT {max_nodes}
        """)
        event_count = events_df.count()
        mon.log_metric("input_events", event_count)

    # --- Generate 8-D Embeddings for Events ---
    with mon.time("generate_embeddings"):
        # Embedding dimensions encode behavioral features:
        # [severity, network_activity, auth_activity, lateral_movement,
        #  exfil_risk, persistence, evasion, time_anomaly]
        def compute_embedding(event_type, severity, hour=None):
            sev_map = {"info": 0.1, "low": 0.3, "medium": 0.5, "high": 0.8, "critical": 1.0}
            sev_val = sev_map.get(severity, 0.3)

            network = 0.8 if event_type in ("network_connection", "dns_query", "port_scan", "http_request") else 0.2
            auth = 0.9 if event_type in ("authentication_failure", "authentication_success", "privilege_escalation") else 0.1
            lateral = 0.85 if event_type in ("lateral_movement", "remote_execution", "pass_the_hash") else 0.15
            exfil = 0.9 if event_type in ("data_exfiltration", "large_upload", "dns_tunnel") else 0.1
            persist = 0.8 if event_type in ("scheduled_task", "registry_modification", "service_creation") else 0.1
            evasion = 0.75 if event_type in ("log_deletion", "timestomping", "process_injection") else 0.1
            time_anom = 0.7 if hour and (hour < 6 or hour > 22) else 0.2

            return [sev_val, network, auth, lateral, exfil, persist, evasion, time_anom]

        events = events_df.collect()
        nodes_data = []
        for i, event in enumerate(events):
            hour = event.timestamp.hour if event.timestamp else None
            emb = compute_embedding(event.event_type, event.severity, hour)

            # 3D positions using force-directed-like layout
            angle = (i / max(1, event_count)) * 2 * math.pi
            radius = 150 + random.uniform(-50, 50)
            x = radius * math.cos(angle) + random.gauss(0, 20)
            y = radius * math.sin(angle) + random.gauss(0, 20)
            z = (emb[0] - 0.5) * 200 + random.gauss(0, 10)

            nodes_data.append({
                "id": str(uuid.uuid4()),
                "session_id": session_id,
                "label": f"{event.event_type}@{event.source_ip or event.hostname or 'unknown'}",
                "entity_type": event.event_type,
                "embedding": emb,
                "x": x, "y": y, "z": z,
                "is_benign": event.severity in ("info", "low"),
                "tick_index": i,
                "created_at": datetime.utcnow(),
                "best_centroid_id": None,
                "best_similarity": 0.0,
            })

    # --- Compute Cosine Similarity Against Centroids ---
    with mon.time("similarity_computation"):
        def cosine_similarity(vec_a, vec_b):
            dot = sum(a * b for a, b in zip(vec_a, vec_b))
            mag_a = math.sqrt(sum(a * a for a in vec_a))
            mag_b = math.sqrt(sum(b * b for b in vec_b))
            if mag_a == 0 or mag_b == 0:
                return 0.0
            return dot / (mag_a * mag_b)

        similarity_hits = []
        for node in nodes_data:
            best_sim = 0.0
            best_centroid = None

            for centroid in centroids:
                centroid_emb = centroid.embedding if centroid.embedding else [0.5] * 8
                sim = cosine_similarity(node["embedding"], centroid_emb)

                if sim > best_sim:
                    best_sim = sim
                    best_centroid = centroid

            node["best_similarity"] = best_sim
            if best_centroid:
                node["best_centroid_id"] = best_centroid.id

            if best_sim >= similarity_threshold and best_centroid:
                similarity_hits.append({
                    "id": str(uuid.uuid4()),
                    "session_id": session_id,
                    "node_id": node["id"],
                    "centroid_id": best_centroid.id,
                    "similarity": best_sim,
                    "created_at": datetime.utcnow(),
                })

        hit_count = len(similarity_hits)
        mon.log_metric("similarity_hits", hit_count)

    # --- Build Edges (temporal + entity relationships) ---
    with mon.time("edge_construction"):
        edges_data = []
        for i in range(1, len(nodes_data)):
            prev = nodes_data[i - 1]
            curr = nodes_data[i]

            # Temporal edge (sequential events)
            edges_data.append({
                "id": str(uuid.uuid4()),
                "session_id": session_id,
                "source_id": prev["id"],
                "target_id": curr["id"],
                "weight": 0.5,
                "kind": "temporal",
                "created_at": datetime.utcnow(),
            })

            # High-similarity nodes get attack-chain edges
            if curr["best_similarity"] >= similarity_threshold and prev["best_similarity"] >= similarity_threshold:
                if curr["best_centroid_id"] == prev["best_centroid_id"]:
                    edges_data.append({
                        "id": str(uuid.uuid4()),
                        "session_id": session_id,
                        "source_id": prev["id"],
                        "target_id": curr["id"],
                        "weight": (curr["best_similarity"] + prev["best_similarity"]) / 2,
                        "kind": "attack-chain",
                        "created_at": datetime.utcnow(),
                    })

        # Trim to max edges
        edges_data = edges_data[:max_edges]
        edge_count_out = len(edges_data)
        mon.log_metric("edges_created", edge_count_out)

    # --- Persist Results ---
    with mon.time("persist_results"):
        # Session record
        session_data = [{
            "id": session_id,
            "name": f"ChronoWeave-{datetime.utcnow().strftime('%Y%m%d-%H%M')}",
            "started_at": datetime.utcnow(),
            "last_tick_at": datetime.utcnow(),
            "status": "completed",
            "node_count": len(nodes_data),
            "edge_count": edge_count_out,
            "tick_count": len(nodes_data),
            "created_at": datetime.utcnow(),
        }]
        session_df = spark.createDataFrame(session_data)
        safe_append(session_df, "chronoweave_sessions", catalog=cfg.catalog, schema=cfg.schema)

        # Nodes (remove embedding list for Delta compatibility - store as string)
        for n in nodes_data:
            n["embedding"] = json.dumps(n["embedding"])
            n.pop("payload", None)
        nodes_df = spark.createDataFrame(nodes_data)
        safe_append(nodes_df, "chronoweave_nodes", catalog=cfg.catalog, schema=cfg.schema)

        # Edges
        if edges_data:
            edges_df = spark.createDataFrame(edges_data)
            safe_append(edges_df, "chronoweave_edges", catalog=cfg.catalog, schema=cfg.schema)

        # Similarity hits
        if similarity_hits:
            hits_df = spark.createDataFrame(similarity_hits)
            safe_append(hits_df, "chronoweave_similarity_hits", catalog=cfg.catalog, schema=cfg.schema)

        mon.log_info(f"Session {session_id}: {len(nodes_data)} nodes, {edge_count_out} edges, {hit_count} hits")

    # --- Finalize ---
    result.update({
        "session_id": session_id,
        "input_events": event_count,
        "nodes_created": len(nodes_data),
        "edges_created": edge_count_out,
        "similarity_hits": hit_count,
        "centroids_loaded": centroid_count,
        "threshold": similarity_threshold,
        "completed_at": datetime.utcnow().isoformat(),
    })
    mon.log_complete(rows_processed=event_count)

except Exception as e:
    result = {
        "notebook": "03_chronoweave",
        "status": "error",
        "error": str(e)[:500],
        "error_type": type(e).__name__,
        "failed_at": datetime.utcnow().isoformat(),
    }
    mon.log_error(e, context="chronoweave")
    raise

finally:
    print(json.dumps(result, indent=2))
    dbutils.notebook.exit(json.dumps(result))
