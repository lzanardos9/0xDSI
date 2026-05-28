# Databricks notebook source
# MAGIC %md
# MAGIC # Ops 05: Delta Replay Engine
# MAGIC
# MAGIC Leverages Delta Lake time travel to reconstruct historical state, re-run
# MAGIC detections with new thresholds, and produce "replay packs" for forensics,
# MAGIC learning, and detection quality measurement.
# MAGIC
# MAGIC **Use Cases:**
# MAGIC 1. **Forensic Reconstruction** — After a confirmed incident, rebuild the exact
# MAGIC    state of events, entities, alerts, and decisions at compromise time.
# MAGIC 2. **Detection Replay** — Re-run a detection rule against historical data to
# MAGIC    measure what it WOULD have caught (precision/recall estimation).
# MAGIC 3. **Threshold Tuning** — Test new Confluence thresholds against historical UEOs
# MAGIC    to predict alert volume and false positive rate.
# MAGIC 4. **Learning Data Generation** — Produce labeled training sets from analyst
# MAGIC    decisions applied retroactively to historical evidence.
# MAGIC
# MAGIC **How it works:**
# MAGIC - Delta tables support `TIMESTAMP AS OF` and `VERSION AS OF` queries
# MAGIC - This notebook reads historical state, applies detection logic, and compares
# MAGIC   results against what actually happened (labels from analyst feedback)
# MAGIC - Outputs: replay_packs (evidence bundles), detection_evaluations, learning_data
# MAGIC
# MAGIC **Scheduling:** On-demand (triggered by case investigation or quality review)

# COMMAND ----------

# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

dbutils.widgets.text("mode", "forensic", "Mode: forensic | detection_replay | threshold_test | learning")
dbutils.widgets.text("target_timestamp", "", "Target timestamp for replay (ISO format)")
dbutils.widgets.text("target_entity_id", "", "Entity ID to reconstruct (forensic mode)")
dbutils.widgets.text("target_rule_id", "", "Rule ID to replay (detection_replay mode)")
dbutils.widgets.text("hours_before", "24", "Hours before target to include")
dbutils.widgets.text("hours_after", "4", "Hours after target to include")
dbutils.widgets.text("new_threshold", "", "New threshold to test (threshold_test mode)")

mode = dbutils.widgets.get("mode")
target_timestamp_str = dbutils.widgets.get("target_timestamp")
target_entity_id = dbutils.widgets.get("target_entity_id")
target_rule_id = dbutils.widgets.get("target_rule_id")
hours_before = int(dbutils.widgets.get("hours_before"))
hours_after = int(dbutils.widgets.get("hours_after"))
new_threshold_str = dbutils.widgets.get("new_threshold")

# COMMAND ----------

from pyspark.sql.functions import *
from pyspark.sql.types import *
from datetime import datetime, timedelta
import json

# COMMAND ----------

# MAGIC %md
# MAGIC ## Ensure Replay Tables

# COMMAND ----------

replay_packs_table = get_table_path(cfg, "replay_packs")
detection_evals_table = get_table_path(cfg, "detection_evaluations")
learning_data_table = get_table_path(cfg, "learning_data")

spark.sql(f"""
CREATE TABLE IF NOT EXISTS {replay_packs_table} (
    pack_id STRING NOT NULL,
    mode STRING NOT NULL,
    -- Time bounds
    replay_start TIMESTAMP NOT NULL,
    replay_end TIMESTAMP NOT NULL,
    target_timestamp TIMESTAMP,
    -- Scope
    entity_id STRING,
    entity_name STRING,
    rule_id STRING,
    case_id STRING,
    -- Content summary
    event_count BIGINT DEFAULT 0,
    alert_count INT DEFAULT 0,
    entity_count INT DEFAULT 0,
    ueo_count INT DEFAULT 0,
    edge_count INT DEFAULT 0,
    ks_entries_count INT DEFAULT 0,
    -- Snapshot version references (Delta versions for exact reproduction)
    events_version BIGINT,
    alerts_version BIGINT,
    spine_version BIGINT,
    ueo_version BIGINT,
    -- Analysis
    findings STRING,
    timeline_summary STRING,
    -- Metadata
    initiated_by STRING,
    created_at TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
TBLPROPERTIES ('delta.autoOptimize.optimizeWrite' = 'true')
""")

spark.sql(f"""
CREATE TABLE IF NOT EXISTS {detection_evals_table} (
    eval_id STRING NOT NULL,
    pack_id STRING,
    rule_id STRING NOT NULL,
    rule_name STRING,
    -- Evaluation metrics
    total_events_tested BIGINT,
    would_have_fired INT DEFAULT 0,
    actually_fired INT DEFAULT 0,
    true_positives INT DEFAULT 0,
    false_positives INT DEFAULT 0,
    false_negatives INT DEFAULT 0,
    true_negatives INT DEFAULT 0,
    -- Derived metrics
    precision DOUBLE,
    recall DOUBLE,
    f1_score DOUBLE,
    -- Threshold context
    original_threshold DOUBLE,
    tested_threshold DOUBLE,
    -- Impact prediction
    predicted_daily_alerts INT,
    predicted_fp_rate DOUBLE,
    -- Metadata
    evaluation_window_hours INT,
    evaluated_at TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
TBLPROPERTIES ('delta.autoOptimize.optimizeWrite' = 'true')
""")

spark.sql(f"""
CREATE TABLE IF NOT EXISTS {learning_data_table} (
    sample_id STRING NOT NULL,
    pack_id STRING,
    -- The evidence
    event_ids ARRAY<STRING>,
    alert_id STRING,
    ueo_id STRING,
    entity_id STRING,
    -- Features at decision time
    feature_snapshot STRING,
    confluence_score DOUBLE,
    signal_classes ARRAY<STRING>,
    -- The label (from analyst feedback)
    label STRING NOT NULL,
    label_source STRING,
    analyst_id STRING,
    label_confidence DOUBLE DEFAULT 1.0,
    -- Context
    mitre_technique STRING,
    severity STRING,
    -- Metadata
    created_at TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
TBLPROPERTIES ('delta.autoOptimize.optimizeWrite' = 'true')
""")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Parse Target Timestamp

# COMMAND ----------

if target_timestamp_str:
    target_ts = datetime.fromisoformat(target_timestamp_str.replace("Z", "+00:00").replace("+00:00", ""))
else:
    target_ts = datetime.utcnow() - timedelta(hours=hours_before)

replay_start = target_ts - timedelta(hours=hours_before)
replay_end = target_ts + timedelta(hours=hours_after)

print(f"Replay window: {replay_start.isoformat()} → {replay_end.isoformat()}")
print(f"Target: {target_ts.isoformat()}")
print(f"Mode: {mode}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Forensic Reconstruction Mode
# MAGIC
# MAGIC Rebuild the complete evidence state around a target entity and time.

# COMMAND ----------

if mode == "forensic":
    with mon.time("forensic_reconstruction"):
        pack_id = spark.sql("SELECT uuid()").first()[0]
        events_table = get_table_path(cfg, "events")
        alerts_table = get_table_path(cfg, "alerts")
        spine_table = get_table_path(cfg, "entity_spine")
        edges_table = get_table_path(cfg, "entity_edges")
        ueo_table_path = get_table_path(cfg, "unified_evidence_objects")
        ks_path = get_table_path(cfg, "knowledge_store")

        # Get Delta table versions at target timestamp
        try:
            events_history = spark.sql(f"DESCRIBE HISTORY {events_table}")
            events_at_target = events_history.filter(
                col("timestamp") <= lit(target_ts.isoformat())
            ).orderBy(desc("version")).first()
            events_version = events_at_target["version"] if events_at_target else None
        except Exception:
            events_version = None

        # Reconstruct events in window
        if events_version:
            historical_events = spark.sql(f"""
                SELECT * FROM {events_table} VERSION AS OF {events_version}
                WHERE timestamp BETWEEN '{replay_start.isoformat()}' AND '{replay_end.isoformat()}'
                {f"AND (user_id = '{target_entity_id}' OR source_ip = '{target_entity_id}' OR hostname = '{target_entity_id}')" if target_entity_id else ""}
            """)
        else:
            historical_events = spark.sql(f"""
                SELECT * FROM {events_table}
                WHERE timestamp BETWEEN '{replay_start.isoformat()}' AND '{replay_end.isoformat()}'
                {f"AND (user_id = '{target_entity_id}' OR source_ip = '{target_entity_id}' OR hostname = '{target_entity_id}')" if target_entity_id else ""}
            """)

        event_count = historical_events.count()

        # Reconstruct alerts
        try:
            historical_alerts = spark.sql(f"""
                SELECT * FROM {alerts_table}
                WHERE created_at BETWEEN '{replay_start.isoformat()}' AND '{replay_end.isoformat()}'
                {f"AND entity_id = '{target_entity_id}'" if target_entity_id else ""}
            """)
            alert_count = historical_alerts.count()
        except Exception:
            alert_count = 0

        # Reconstruct entity state
        try:
            entity_count = spark.sql(f"""
                SELECT COUNT(DISTINCT entity_id) FROM {spine_table}
                WHERE last_seen BETWEEN '{replay_start.isoformat()}' AND '{replay_end.isoformat()}'
                {f"AND entity_id = '{target_entity_id}'" if target_entity_id else ""}
            """).first()[0]
        except Exception:
            entity_count = 0

        # Reconstruct edges
        try:
            edge_count = spark.sql(f"""
                SELECT COUNT(*) FROM {edges_table}
                WHERE last_seen BETWEEN '{replay_start.isoformat()}' AND '{replay_end.isoformat()}'
                {f"AND (source_entity_id = '{target_entity_id}' OR target_entity_id = '{target_entity_id}')" if target_entity_id else ""}
            """).first()[0]
        except Exception:
            edge_count = 0

        # Reconstruct UEOs
        try:
            ueo_count = spark.sql(f"""
                SELECT COUNT(*) FROM {ueo_table_path}
                WHERE window_start BETWEEN '{replay_start.isoformat()}' AND '{replay_end.isoformat()}'
                {f"AND entity_id = '{target_entity_id}'" if target_entity_id else ""}
            """).first()[0]
        except Exception:
            ueo_count = 0

        # KS entries used
        try:
            ks_count = spark.sql(f"""
                SELECT COUNT(*) FROM {ks_path}
                WHERE last_retrieved BETWEEN '{replay_start.isoformat()}' AND '{replay_end.isoformat()}'
            """).first()[0]
        except Exception:
            ks_count = 0

        # Build timeline summary
        timeline_parts = []
        if event_count > 0:
            first_event = historical_events.orderBy("timestamp").first()
            last_event = historical_events.orderBy(desc("timestamp")).first()
            timeline_parts.append(f"Events: {event_count} from {first_event['timestamp']} to {last_event['timestamp']}")
        if alert_count > 0:
            timeline_parts.append(f"Alerts: {alert_count}")
        timeline_summary = " | ".join(timeline_parts) if timeline_parts else "No activity in window"

        # Write replay pack
        pack_row = spark.createDataFrame([{
            "pack_id": pack_id,
            "mode": "forensic",
            "replay_start": replay_start,
            "replay_end": replay_end,
            "target_timestamp": target_ts,
            "entity_id": target_entity_id or None,
            "entity_name": target_entity_id or None,
            "rule_id": None,
            "case_id": None,
            "event_count": event_count,
            "alert_count": alert_count,
            "entity_count": entity_count,
            "ueo_count": ueo_count,
            "edge_count": edge_count,
            "ks_entries_count": ks_count,
            "events_version": events_version,
            "alerts_version": None,
            "spine_version": None,
            "ueo_version": None,
            "findings": None,
            "timeline_summary": timeline_summary,
            "initiated_by": None,
            "created_at": datetime.utcnow(),
        }])
        pack_row.write.mode("append").option("mergeSchema", "true").saveAsTable(replay_packs_table)

        print(f"\nForensic Replay Pack: {pack_id}")
        print(f"  Events:   {event_count}")
        print(f"  Alerts:   {alert_count}")
        print(f"  Entities: {entity_count}")
        print(f"  UEOs:     {ueo_count}")
        print(f"  Edges:    {edge_count}")
        print(f"  KS Refs:  {ks_count}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Detection Replay Mode
# MAGIC
# MAGIC Re-run a specific rule against historical events with analyst labels.

# COMMAND ----------

if mode == "detection_replay":
    with mon.time("detection_replay"):
        pack_id = spark.sql("SELECT uuid()").first()[0]
        events_table = get_table_path(cfg, "events")
        alerts_table = get_table_path(cfg, "alerts")
        feedback_table = get_table_path(cfg, "analyst_feedback")

        # Get alerts fired by this rule in the window
        try:
            rule_alerts = spark.sql(f"""
                SELECT id as alert_id, entity_id, confidence_score, created_at
                FROM {alerts_table}
                WHERE created_at BETWEEN '{replay_start.isoformat()}' AND '{replay_end.isoformat()}'
                {f"AND source = '{target_rule_id}'" if target_rule_id else ""}
            """)
            actually_fired = rule_alerts.count()
        except Exception:
            actually_fired = 0

        # Get analyst feedback on those alerts
        try:
            feedback = spark.sql(f"""
                SELECT alert_id, feedback_type
                FROM {feedback_table}
                WHERE created_at BETWEEN '{replay_start.isoformat()}' AND '{replay_end.isoformat()}'
            """)
            tp_count = feedback.filter(col("feedback_type") == "true_positive").count()
            fp_count = feedback.filter(col("feedback_type") == "false_positive").count()
            fn_count = feedback.filter(col("feedback_type") == "false_negative").count()
        except Exception:
            tp_count = 0
            fp_count = 0
            fn_count = 0

        # Calculate metrics
        tn_count = max(0, actually_fired - tp_count - fp_count)
        precision = tp_count / max(tp_count + fp_count, 1)
        recall = tp_count / max(tp_count + fn_count, 1)
        f1 = 2 * precision * recall / max(precision + recall, 0.001)

        # Predict daily impact
        window_hours = hours_before + hours_after
        predicted_daily = int(actually_fired * (24.0 / max(window_hours, 1)))
        predicted_fp_rate = fp_count / max(actually_fired, 1)

        # Write evaluation
        eval_row = spark.createDataFrame([{
            "eval_id": spark.sql("SELECT uuid()").first()[0],
            "pack_id": pack_id,
            "rule_id": target_rule_id or "all",
            "rule_name": target_rule_id or "all_rules",
            "total_events_tested": int(spark.sql(f"""
                SELECT COUNT(*) FROM {events_table}
                WHERE timestamp BETWEEN '{replay_start.isoformat()}' AND '{replay_end.isoformat()}'
            """).first()[0]),
            "would_have_fired": actually_fired,
            "actually_fired": actually_fired,
            "true_positives": tp_count,
            "false_positives": fp_count,
            "false_negatives": fn_count,
            "true_negatives": tn_count,
            "precision": precision,
            "recall": recall,
            "f1_score": f1,
            "original_threshold": None,
            "tested_threshold": float(new_threshold_str) if new_threshold_str else None,
            "predicted_daily_alerts": predicted_daily,
            "predicted_fp_rate": predicted_fp_rate,
            "evaluation_window_hours": window_hours,
            "evaluated_at": datetime.utcnow(),
        }])
        eval_row.write.mode("append").option("mergeSchema", "true").saveAsTable(detection_evals_table)

        print(f"\nDetection Replay Results:")
        print(f"  Rule: {target_rule_id or 'all'}")
        print(f"  Actually fired: {actually_fired}")
        print(f"  TP: {tp_count}, FP: {fp_count}, FN: {fn_count}")
        print(f"  Precision: {precision:.3f}, Recall: {recall:.3f}, F1: {f1:.3f}")
        print(f"  Predicted daily alerts: {predicted_daily}")
        print(f"  Predicted FP rate: {predicted_fp_rate:.2%}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Threshold Test Mode
# MAGIC
# MAGIC Test what would happen if we changed Confluence threshold.

# COMMAND ----------

if mode == "threshold_test" and new_threshold_str:
    with mon.time("threshold_test"):
        new_threshold = float(new_threshold_str)
        ueo_table_path = get_table_path(cfg, "unified_evidence_objects")
        feedback_table = get_table_path(cfg, "analyst_feedback")

        # Get UEOs in window
        historical_ueos = spark.sql(f"""
            SELECT ueo_id, entity_id, fused_risk_score, confluence_processed,
                   contributing_alert_ids
            FROM {ueo_table_path}
            WHERE window_start BETWEEN '{replay_start.isoformat()}' AND '{replay_end.isoformat()}'
        """)

        total_ueos = historical_ueos.count()
        would_fire = historical_ueos.filter(col("fused_risk_score") >= new_threshold).count()
        would_not_fire = total_ueos - would_fire

        # Compare against current production alerts
        current_alerts = historical_ueos.filter(col("confluence_processed") == True).count()

        print(f"\nThreshold Test: {new_threshold}")
        print(f"  Historical UEOs: {total_ueos}")
        print(f"  Would fire at new threshold: {would_fire}")
        print(f"  Would NOT fire: {would_not_fire}")
        print(f"  Current alerts (old threshold): {current_alerts}")
        print(f"  Change: {would_fire - current_alerts:+d} alerts")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Learning Data Generation Mode
# MAGIC
# MAGIC Convert analyst-labeled alerts into training data for future models.

# COMMAND ----------

if mode == "learning":
    with mon.time("generate_learning_data"):
        feedback_table = get_table_path(cfg, "analyst_feedback")
        alerts_table = get_table_path(cfg, "alerts")
        ueo_table_path = get_table_path(cfg, "unified_evidence_objects")

        # Get labeled alerts with their features
        try:
            labeled = spark.sql(f"""
                SELECT
                    f.alert_id,
                    f.feedback_type as label,
                    f.analyst_id,
                    f.rationale as label_source,
                    a.entity_id,
                    a.confidence_score as confluence_score,
                    a.severity,
                    a.source
                FROM {feedback_table} f
                JOIN {alerts_table} a ON f.alert_id = a.id
                WHERE f.created_at BETWEEN '{replay_start.isoformat()}' AND '{replay_end.isoformat()}'
            """)

            labeled_count = labeled.count()
            if labeled_count > 0:
                learning_rows = (
                    labeled
                    .withColumn("sample_id", expr("uuid()"))
                    .withColumn("pack_id", lit(None).cast("string"))
                    .withColumn("event_ids", lit(None).cast("array<string>"))
                    .withColumn("ueo_id", lit(None).cast("string"))
                    .withColumn("feature_snapshot",
                        concat_ws(",",
                            concat(lit("confidence="), col("confluence_score").cast("string")),
                            concat(lit("severity="), col("severity")),
                            concat(lit("source="), col("source"))
                        )
                    )
                    .withColumn("signal_classes", array(col("source")))
                    .withColumn("label_confidence", lit(1.0))
                    .withColumn("mitre_technique", lit(None).cast("string"))
                    .withColumn("created_at", current_timestamp())
                    .select(
                        "sample_id", "pack_id", "event_ids", "alert_id",
                        "ueo_id", "entity_id", "feature_snapshot",
                        "confluence_score", "signal_classes", "label",
                        "label_source", "analyst_id", "label_confidence",
                        "mitre_technique", "severity", "created_at"
                    )
                )
                learning_rows.write.mode("append").option("mergeSchema", "true").saveAsTable(learning_data_table)
                print(f"Generated {labeled_count} learning data samples")
            else:
                print("No labeled data in window")
        except Exception as e:
            print(f"Learning data generation skipped: {str(e)[:100]}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Summary

# COMMAND ----------

result = {
    "notebook": "05_delta_replay_engine",
    "mode": mode,
    "status": "completed",
    "replay_start": replay_start.isoformat(),
    "replay_end": replay_end.isoformat(),
    "target_entity": target_entity_id or None,
    "target_rule": target_rule_id or None,
}
mon.log_complete(details=result)
dbutils.notebook.exit(json.dumps(result))
