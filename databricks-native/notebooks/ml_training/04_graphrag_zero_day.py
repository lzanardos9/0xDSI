# Databricks notebook source
# MAGIC %md
# MAGIC # ML - GraphRAG Zero-Day Detection
# MAGIC Uses graph-based retrieval-augmented generation to detect zero-day threats.
# MAGIC Builds knowledge graphs from threat intelligence and uses vector similarity
# MAGIC to identify novel attack patterns without known signatures.

# COMMAND ----------

# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

import mlflow
import json
import uuid
from pyspark.sql import functions as F
from pyspark.sql.types import StructType, StructField, StringType, DoubleType, TimestampType
from datetime import datetime
from collections import defaultdict

mlflow.set_experiment("/Shared/0xDSI/experiments/graphrag_zero_day_detection")
require_tables("alerts", "ioc_entries")

# COMMAND ----------

try:
    result = {"notebook": "04_graphrag_zero_day", "status": "success", "started_at": datetime.utcnow().isoformat()}

    # --- Build Threat Knowledge Graph ---
    with mon.time("knowledge_graph_build"):
        knowledge_graph = spark.sql("""
            SELECT
                'technique' as node_type, mitre_technique as node_id,
                mitre_tactic as parent, COUNT(*) as frequency
            FROM alerts
            WHERE mitre_technique IS NOT NULL
              AND created_at > current_timestamp() - INTERVAL 90 DAYS
            GROUP BY mitre_technique, mitre_tactic

            UNION ALL

            SELECT
                'ioc' as node_type, value as node_id,
                threat_type as parent, confidence as frequency
            FROM ioc_entries
            WHERE created_at > current_timestamp() - INTERVAL 30 DAYS

            UNION ALL

            SELECT
                'actor' as node_type, attribution as node_id,
                status as parent, confidence as frequency
            FROM threat_campaigns
            WHERE attribution IS NOT NULL AND attribution != 'unknown'
        """)

        graph_node_count = knowledge_graph.count()
        mon.log_metric("knowledge_graph_nodes", graph_node_count)
        print(f"Knowledge graph nodes: {graph_node_count}")

    # --- Detect Unsigned High-Severity Events ---
    with mon.time("unsigned_events_query"):
        unsigned_events = spark.sql("""
            SELECT e.id, e.event_type, e.action, e.source_ip, e.dest_ip,
                   e.username, e.severity, e.raw_log, e.timestamp
            FROM events e
            LEFT JOIN alerts a ON e.id = a.source_event_id
            WHERE a.id IS NULL
              AND e.severity IN ('high', 'critical')
              AND e.timestamp > current_timestamp() - INTERVAL 2 HOURS
            LIMIT 200
        """).collect()

        mon.log_metric("unsigned_events_count", len(unsigned_events))
        print(f"Analyzing {len(unsigned_events)} unsigned high-severity events")

    # --- Zero-Day Pattern Analysis via LLM ---
    zero_day_candidates = []
    ip_groups = defaultdict(list)
    for event in unsigned_events:
        ip_groups[event.source_ip].append(event)

    with mlflow.start_run(run_name=f"graphrag_zeroday_{datetime.utcnow().strftime('%Y%m%d_%H%M')}") as run:
        mlflow.log_param("model_endpoint", cfg.model_endpoint)
        mlflow.log_param("unsigned_events_count", len(unsigned_events))
        mlflow.log_metric("knowledge_graph_nodes", graph_node_count)

        with mon.time("llm_zero_day_analysis"):
            for source_ip, events in ip_groups.items():
                if len(events) < 3:
                    continue

                event_summary = [
                    {"type": e.event_type, "action": e.action, "dest": e.dest_ip, "ts": str(e.timestamp)}
                    for e in events[:15]
                ]

                system_prompt = (
                    "You are a zero-day threat analyst. Analyze event sequences that didn't "
                    "match known signatures. Determine if they represent novel attack patterns. "
                    "Only flag as potential zero-day if the pattern shows clear adversarial intent "
                    "without matching known TTPs."
                )
                user_prompt = (
                    f"Analyze these unsigned events from a single source IP "
                    f"({len(events)} total, showing up to 15):\n"
                    f"{json.dumps(event_summary, indent=1)}\n\n"
                    f"Is this a potential zero-day? Respond JSON: "
                    f'{{"is_zero_day": true/false, "confidence": 0-100, '
                    f'"pattern_name": "...", "reasoning": "...", "recommended_signature": "..."}}'
                )

                try:
                    response = llm.chat(
                        system=system_prompt,
                        user=user_prompt,
                        temperature=0.2,
                        max_tokens=300,
                        json_mode=True,
                    )

                    analysis = llm.extract_json(response)
                    if analysis is None:
                        mon.log_warning("Failed to parse LLM JSON for IP group analysis")
                        continue

                    if analysis.get("is_zero_day") and analysis.get("confidence", 0) >= 60:
                        zero_day_candidates.append({
                            "source_ip": source_ip,
                            "event_count": len(events),
                            "pattern_name": analysis.get("pattern_name", "unknown"),
                            "confidence": analysis.get("confidence", 0),
                            "reasoning": analysis.get("reasoning", ""),
                            "recommended_signature": analysis.get("recommended_signature", ""),
                            "detected_at": datetime.utcnow().isoformat(),
                            "agent_name": "graphrag-zero-day",
                        })

                except (LLMBudgetExhausted, LLMAllEndpointsFailed) as e:
                    mon.log_warning(f"LLM unavailable, stopping analysis: {type(e).__name__}: {e}")
                    break
                except Exception as e:
                    mon.log_warning(f"Error analyzing IP group: {type(e).__name__}: {e}")
                    continue

        # --- Persist Zero-Day Candidates ---
        with mon.time("persist_results"):
            if zero_day_candidates:
                # Write zero-day detections via DataFrame (safe, no f-string SQL)
                detections_df = spark.createDataFrame(zero_day_candidates)
                safe_append(
                    detections_df,
                    "zero_day_detections",
                    catalog=cfg.catalog,
                    schema=cfg.schema,
                )

                # Build alerts as a DataFrame - eliminates SQL injection risk
                alerts_data = []
                for candidate in zero_day_candidates:
                    alerts_data.append({
                        "id": f"zd-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}-{uuid.uuid4().hex[:8]}",
                        "title": f"Potential Zero-Day: {candidate['pattern_name'][:100]}",
                        "description": candidate["reasoning"][:500],
                        "severity": "critical",
                        "status": "new",
                        "source_ip": candidate["source_ip"],
                        "mitre_tactic": "initial-access",
                        "confidence_score": candidate["confidence"] / 100.0,
                        "risk_score": float(candidate["confidence"]),
                        "created_at": datetime.utcnow(),
                    })

                alerts_schema = StructType([
                    StructField("id", StringType(), False),
                    StructField("title", StringType(), False),
                    StructField("description", StringType(), True),
                    StructField("severity", StringType(), False),
                    StructField("status", StringType(), False),
                    StructField("source_ip", StringType(), True),
                    StructField("mitre_tactic", StringType(), True),
                    StructField("confidence_score", DoubleType(), True),
                    StructField("risk_score", DoubleType(), True),
                    StructField("created_at", TimestampType(), False),
                ])

                alerts_df = spark.createDataFrame(alerts_data, schema=alerts_schema)
                safe_append(
                    alerts_df,
                    "alerts",
                    catalog=cfg.catalog,
                    schema=cfg.schema,
                    deduplicate_on=["id"],
                )

                mon.log_info(f"Persisted {len(zero_day_candidates)} zero-day candidates and alerts")

        # --- Log MLflow Experiment Metrics ---
        mlflow.log_metric("zero_day_candidates", len(zero_day_candidates))
        mlflow.log_metric("ip_groups_analyzed", len(ip_groups))
        avg_confidence = (
            sum(c["confidence"] for c in zero_day_candidates) / max(1, len(zero_day_candidates))
        )
        mlflow.log_metric("avg_confidence", avg_confidence)
        if zero_day_candidates:
            mlflow.log_dict({"candidates": zero_day_candidates}, "zero_day_candidates.json")

    # --- Finalize ---
    result.update({
        "unsigned_events_analyzed": len(unsigned_events),
        "ip_groups_analyzed": len(ip_groups),
        "zero_day_candidates": len(zero_day_candidates),
        "knowledge_graph_nodes": graph_node_count,
        "avg_confidence": avg_confidence,
        "completed_at": datetime.utcnow().isoformat(),
    })
    mon.log_complete(rows_processed=len(unsigned_events))

except Exception as e:
    result = {
        "notebook": "04_graphrag_zero_day",
        "status": "error",
        "error": str(e)[:500],
        "error_type": type(e).__name__,
        "failed_at": datetime.utcnow().isoformat(),
    }
    mon.log_error(e, context="graphrag_zero_day_detection")
    raise

finally:
    print(json.dumps(result, indent=2))
    dbutils.notebook.exit(json.dumps(result))
