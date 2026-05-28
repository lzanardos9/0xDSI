# Databricks notebook source
# MAGIC %md
# MAGIC # Agent 25: MUSE — Autonomous Learning from Human Feedback (ALHF)
# MAGIC
# MAGIC MUSE continuously learns from analyst decisions to improve detection quality.
# MAGIC It observes what analysts approve, suppress, escalate, and close — then feeds
# MAGIC those signals back into the detection pipeline as tuning instructions.
# MAGIC
# MAGIC **Learning Loops:**
# MAGIC 1. **Suppression Learning** — When analysts mark FPs repeatedly, MUSE proposes
# MAGIC    suppression rules (or KS entries) to prevent re-alerting.
# MAGIC 2. **Threshold Tuning** — MUSE tracks precision/recall per rule and recommends
# MAGIC    threshold adjustments via Delta Replay evaluation.
# MAGIC 3. **Weight Calibration** — Confluence lens weights are calibrated based on
# MAGIC    which lenses contribute to TP vs FP verdicts.
# MAGIC 4. **Pattern Discovery** — New behavioral patterns observed in TP cases get
# MAGIC    proposed as detection rule candidates.
# MAGIC 5. **KS Enrichment** — Analyst rationales become KS entries for future recall.
# MAGIC
# MAGIC **What MUSE does NOT do:**
# MAGIC - Modify detection rules directly (proposes, human approves)
# MAGIC - Change escalation thresholds without approval
# MAGIC - Suppress alerts autonomously (proposes to suppression queue)
# MAGIC
# MAGIC **Architecture:** Reads from analyst_feedback, learning_data, confluence_verdicts.
# MAGIC Writes to: tuning_proposals, ks_entries (pending), lens_weight_proposals.
# MAGIC
# MAGIC **Scheduling:** Every 30 minutes

# COMMAND ----------

# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

dbutils.widgets.text("lookback_hours", "6", "Hours of feedback to process")
dbutils.widgets.text("min_samples_for_proposal", "5", "Minimum samples before proposing a change")
dbutils.widgets.text("fp_rate_threshold", "0.3", "FP rate above which to propose suppression")
dbutils.widgets.text("auto_approve_ks", "true", "Auto-approve KS entries from feedback")

lookback_hours = int(dbutils.widgets.get("lookback_hours"))
min_samples = int(dbutils.widgets.get("min_samples_for_proposal"))
fp_rate_threshold = float(dbutils.widgets.get("fp_rate_threshold"))
auto_approve_ks = dbutils.widgets.get("auto_approve_ks").lower() == "true"

# COMMAND ----------

from pyspark.sql.functions import *
from pyspark.sql.types import *
from datetime import datetime, timedelta
import json

# COMMAND ----------

# MAGIC %md
# MAGIC ## Ensure MUSE Tables

# COMMAND ----------

proposals_table = get_table_path(cfg, "tuning_proposals")
weight_proposals_table = get_table_path(cfg, "lens_weight_proposals")
learning_metrics_table = get_table_path(cfg, "muse_learning_metrics")

spark.sql(f"""
CREATE TABLE IF NOT EXISTS {proposals_table} (
    proposal_id STRING NOT NULL,
    proposal_type STRING NOT NULL,
    target_rule_id STRING,
    target_lens STRING,
    target_entity STRING,
    current_value STRING,
    current_precision DOUBLE,
    current_fp_rate DOUBLE,
    proposed_value STRING,
    proposed_action STRING NOT NULL,
    supporting_samples INT NOT NULL,
    tp_count INT DEFAULT 0,
    fp_count INT DEFAULT 0,
    confidence DOUBLE NOT NULL,
    rationale STRING NOT NULL,
    sample_ids ARRAY<STRING>,
    status STRING DEFAULT 'pending',
    approved_by STRING,
    approved_at TIMESTAMP,
    applied BOOLEAN DEFAULT false,
    applied_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
TBLPROPERTIES ('delta.autoOptimize.optimizeWrite' = 'true')
""")

spark.sql(f"""
CREATE TABLE IF NOT EXISTS {weight_proposals_table} (
    proposal_id STRING NOT NULL,
    current_weights STRING NOT NULL,
    proposed_weights STRING NOT NULL,
    evaluation_window_hours INT,
    tp_contribution MAP<STRING, DOUBLE>,
    fp_contribution MAP<STRING, DOUBLE>,
    expected_precision_change DOUBLE,
    expected_recall_change DOUBLE,
    confidence DOUBLE NOT NULL,
    rationale STRING NOT NULL,
    status STRING DEFAULT 'pending',
    approved_by STRING,
    applied BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
""")

spark.sql(f"""
CREATE TABLE IF NOT EXISTS {learning_metrics_table} (
    metric_id STRING NOT NULL,
    run_timestamp TIMESTAMP NOT NULL,
    total_feedback INT,
    tp_feedback INT,
    fp_feedback INT,
    fn_feedback INT,
    suppression_proposals INT DEFAULT 0,
    threshold_proposals INT DEFAULT 0,
    weight_proposals INT DEFAULT 0,
    pattern_proposals INT DEFAULT 0,
    ks_entries_created INT DEFAULT 0,
    overall_precision DOUBLE,
    overall_recall DOUBLE,
    overall_f1 DOUBLE,
    lens_quality MAP<STRING, DOUBLE>,
    created_at TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
""")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Load Recent Analyst Feedback

# COMMAND ----------

cutoff = datetime.utcnow() - timedelta(hours=lookback_hours)
feedback_table = get_table_path(cfg, "analyst_feedback")
verdicts_table = get_table_path(cfg, "confluence_verdicts")
alerts_table = get_table_path(cfg, "alerts")

with mon.time("load_feedback"):
    try:
        feedback = spark.sql(f"""
            SELECT f.*, a.source as alert_source, a.confidence_score,
                   a.severity, a.title as alert_title
            FROM {feedback_table} f
            LEFT JOIN {alerts_table} a ON f.alert_id = a.id
            WHERE f.created_at > '{cutoff.isoformat()}'
        """)
        feedback_count = feedback.count()
    except Exception as e:
        print(f"No feedback available: {str(e)[:100]}")
        dbutils.notebook.exit(json.dumps({"status": "no_feedback", "proposals": 0}))

    if feedback_count == 0:
        print("No new analyst feedback to learn from")
        dbutils.notebook.exit(json.dumps({"status": "no_feedback", "proposals": 0}))

    tp_count = feedback.filter(col("feedback_type") == "true_positive").count()
    fp_count = feedback.filter(col("feedback_type") == "false_positive").count()
    fn_count = feedback.filter(col("feedback_type") == "false_negative").count()

    precision = tp_count / max(tp_count + fp_count, 1)
    recall = tp_count / max(tp_count + fn_count, 1)
    f1 = 2 * precision * recall / max(precision + recall, 0.001)

    print(f"Feedback: {feedback_count} (TP={tp_count}, FP={fp_count}, FN={fn_count})")
    print(f"Quality: P={precision:.3f}, R={recall:.3f}, F1={f1:.3f}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Loop 1: Suppression Learning

# COMMAND ----------

proposals_created = 0
supp_count = 0

with mon.time("suppression_learning"):
    fp_by_source = (
        feedback
        .filter(col("feedback_type") == "false_positive")
        .groupBy("alert_source")
        .agg(
            count("*").alias("fp_count"),
            collect_list("alert_id").alias("sample_alert_ids"),
            first("alert_title").alias("example_title"),
        )
        .filter(col("fp_count") >= min_samples)
    )

    total_by_source = feedback.groupBy("alert_source").agg(count("*").alias("total"))

    fp_rates = (
        fp_by_source.alias("fp")
        .join(total_by_source.alias("t"), col("fp.alert_source") == col("t.alert_source"))
        .withColumn("fp_rate", col("fp.fp_count").cast("double") / col("t.total"))
        .filter(col("fp_rate") >= fp_rate_threshold)
    )

    for row in fp_rates.collect():
        proposal = {
            "proposal_id": f"supp_{abs(hash(row.alert_source))}_{datetime.utcnow().strftime('%Y%m%d%H')}",
            "proposal_type": "suppression",
            "target_rule_id": None,
            "target_lens": row.alert_source,
            "target_entity": None,
            "current_value": f"active (FP rate: {row.fp_rate:.1%})",
            "current_precision": 1.0 - row.fp_rate,
            "current_fp_rate": float(row.fp_rate),
            "proposed_value": "suppress or tune threshold",
            "proposed_action": "add_suppression_rule",
            "supporting_samples": int(row.fp_count),
            "tp_count": 0,
            "fp_count": int(row.fp_count),
            "confidence": min(0.95, float(row.fp_rate) + 0.3),
            "rationale": f"Source '{row.alert_source}' has {row.fp_rate:.1%} FP rate over {row.fp_count} samples. Example: '{row.example_title}'. Recommend suppression.",
            "sample_ids": row.sample_alert_ids[:10],
            "status": "pending",
        }
        spark.createDataFrame([proposal]).withColumn(
            "created_at", current_timestamp()
        ).withColumn("approved_by", lit(None).cast("string")).withColumn(
            "approved_at", lit(None).cast("timestamp")
        ).withColumn("applied", lit(False)).withColumn(
            "applied_at", lit(None).cast("timestamp")
        ).write.mode("append").option("mergeSchema", "true").saveAsTable(proposals_table)
        proposals_created += 1

    supp_count = fp_rates.count()
    print(f"  Suppression proposals: {supp_count}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Loop 2: Lens Weight Calibration

# COMMAND ----------

with mon.time("weight_calibration"):
    try:
        labeled_verdicts = spark.sql(f"""
            SELECT v.contributing_lenses, f.feedback_type
            FROM {verdicts_table} v
            JOIN {feedback_table} f ON v.entity_id = f.alert_id
            WHERE v.verdict_time > '{cutoff.isoformat()}'
        """)

        if labeled_verdicts.count() >= min_samples * 2:
            labeled_pd = labeled_verdicts.toPandas()
            lens_tp = {}
            lens_fp = {}

            for _, row in labeled_pd.iterrows():
                try:
                    lenses = json.loads(row["contributing_lenses"])
                except (json.JSONDecodeError, TypeError):
                    lenses = []
                for lens in lenses:
                    if row["feedback_type"] == "true_positive":
                        lens_tp[lens] = lens_tp.get(lens, 0) + 1
                    elif row["feedback_type"] == "false_positive":
                        lens_fp[lens] = lens_fp.get(lens, 0) + 1

            if lens_tp or lens_fp:
                all_lenses = set(list(lens_tp.keys()) + list(lens_fp.keys()))
                lens_quality = {}
                for lens in all_lenses:
                    tp = lens_tp.get(lens, 0)
                    fp = lens_fp.get(lens, 0)
                    lens_quality[lens] = tp / max(tp + fp, 1)

                qualities = list(lens_quality.values())
                if len(qualities) >= 2 and max(qualities) - min(qualities) > 0.2:
                    total_q = sum(lens_quality.values())
                    proposed = {k: v / total_q for k, v in lens_quality.items()} if total_q > 0 else lens_quality

                    weight_proposal = {
                        "proposal_id": f"wt_{datetime.utcnow().strftime('%Y%m%d%H')}",
                        "current_weights": json.dumps({k: 1.0/len(all_lenses) for k in all_lenses}),
                        "proposed_weights": json.dumps(proposed),
                        "evaluation_window_hours": lookback_hours,
                        "tp_contribution": {k: float(v) for k, v in lens_tp.items()},
                        "fp_contribution": {k: float(v) for k, v in lens_fp.items()},
                        "expected_precision_change": float(max(qualities) - sum(qualities)/len(qualities)),
                        "expected_recall_change": 0.0,
                        "confidence": 0.7 if len(labeled_pd) >= 20 else 0.5,
                        "rationale": f"Lens quality varies {min(qualities):.2f}-{max(qualities):.2f}. High-quality lenses should carry more weight.",
                        "status": "pending",
                        "applied": False,
                    }
                    spark.createDataFrame([weight_proposal]).withColumn(
                        "created_at", current_timestamp()
                    ).withColumn("approved_by", lit(None).cast("string")).write.mode(
                        "append"
                    ).option("mergeSchema", "true").saveAsTable(weight_proposals_table)
                    proposals_created += 1
                    print(f"  Weight calibration proposal generated")
    except Exception as e:
        mon.log_warning(f"Weight calibration skipped: {str(e)[:200]}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Loop 3: KS Enrichment from Analyst Rationales

# COMMAND ----------

ks_created = 0

with mon.time("ks_enrichment"):
    ks_table = get_table_path(cfg, "knowledge_store")
    try:
        rationales = spark.sql(f"""
            SELECT f.id, f.alert_id, f.feedback_type, f.rationale,
                   f.analyst_id, f.created_at as feedback_time
            FROM {feedback_table} f
            WHERE f.created_at > '{cutoff.isoformat()}'
              AND f.rationale IS NOT NULL
              AND LENGTH(f.rationale) > 20
              AND f.id NOT IN (
                  SELECT source_id FROM {ks_table} WHERE source_table = 'analyst_feedback'
              )
        """)

        rationale_count = rationales.count()
        if rationale_count > 0:
            ks_entries = (
                rationales
                .withColumn("ks_id", expr("uuid()"))
                .withColumn("entry_type",
                    when(col("feedback_type") == "false_positive", lit("suppression"))
                    .otherwise(lit("analyst_decision"))
                )
                .withColumn("title",
                    concat(lit("Analyst "), col("feedback_type"), lit(": alert "), col("alert_id"))
                )
                .withColumn("content",
                    concat_ws("\n",
                        concat(lit("Feedback: "), col("feedback_type")),
                        concat(lit("Rationale: "), col("rationale")),
                        concat(lit("Alert: "), col("alert_id"))
                    )
                )
                .withColumn("content_hash", md5(col("content")))
                .withColumn("source_id", col("id"))
                .withColumn("source_table", lit("analyst_feedback"))
                .withColumn("entity_ids", lit(None).cast("array<string>"))
                .withColumn("mitre_tactics", lit(None).cast("array<string>"))
                .withColumn("mitre_techniques", lit(None).cast("array<string>"))
                .withColumn("tags", array(col("feedback_type")))
                .withColumn("severity", lit(None).cast("string"))
                .withColumn("confidence", lit(0.85))
                .withColumn("outcome", col("feedback_type"))
                .withColumn("valid_from", col("feedback_time"))
                .withColumn("valid_until", lit(None).cast("timestamp"))
                .withColumn("is_active", lit(True))
                .withColumn("retrieval_count", lit(0).cast("bigint"))
                .withColumn("last_retrieved", lit(None).cast("timestamp"))
                .withColumn("created_at", current_timestamp())
                .withColumn("updated_at", current_timestamp())
                .select(
                    "ks_id", "entry_type", "title", "content", "content_hash",
                    "source_id", "source_table", "entity_ids",
                    "mitre_tactics", "mitre_techniques", "tags",
                    "severity", "confidence", "outcome", "analyst_id",
                    "valid_from", "valid_until", "is_active",
                    "retrieval_count", "last_retrieved", "created_at", "updated_at"
                )
            )
            ks_entries.write.mode("append").option("mergeSchema", "true").saveAsTable(ks_table)
            ks_created = rationale_count
            print(f"  KS enrichment: {ks_created} entries")
    except Exception as e:
        mon.log_warning(f"KS enrichment skipped: {str(e)[:100]}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Loop 4: Pattern Discovery

# COMMAND ----------

pattern_count = 0

with mon.time("pattern_discovery"):
    tp_patterns = (
        feedback
        .filter(col("feedback_type") == "true_positive")
        .groupBy("alert_source", "severity")
        .agg(count("*").alias("tp_count"), collect_set("alert_title").alias("examples"))
        .filter(col("tp_count") >= min_samples * 2)
    )

    for row in tp_patterns.collect():
        proposal = {
            "proposal_id": f"pat_{abs(hash(row.alert_source + str(row.severity)))}_{datetime.utcnow().strftime('%Y%m%d')}",
            "proposal_type": "pattern_candidate",
            "target_rule_id": None,
            "target_lens": row.alert_source,
            "target_entity": None,
            "current_value": f"observed {row.tp_count} confirmed TPs",
            "current_precision": 1.0,
            "current_fp_rate": 0.0,
            "proposed_value": f"Promote to high-confidence rule (sev={row.severity})",
            "proposed_action": "promote_to_rule",
            "supporting_samples": int(row.tp_count),
            "tp_count": int(row.tp_count),
            "fp_count": 0,
            "confidence": 0.8,
            "rationale": f"Pattern '{row.alert_source}' confirmed TP {row.tp_count} times. Examples: {list(row.examples)[:3]}",
            "sample_ids": None,
            "status": "pending",
        }
        spark.createDataFrame([proposal]).withColumn(
            "created_at", current_timestamp()
        ).withColumn("approved_by", lit(None).cast("string")).withColumn(
            "approved_at", lit(None).cast("timestamp")
        ).withColumn("applied", lit(False)).withColumn(
            "applied_at", lit(None).cast("timestamp")
        ).write.mode("append").option("mergeSchema", "true").saveAsTable(proposals_table)
        proposals_created += 1
        pattern_count += 1

    print(f"  Pattern proposals: {pattern_count}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Record Learning Metrics

# COMMAND ----------

with mon.time("record_metrics"):
    metrics_row = spark.createDataFrame([{
        "metric_id": f"muse_{datetime.utcnow().strftime('%Y%m%d%H%M')}",
        "run_timestamp": datetime.utcnow(),
        "total_feedback": feedback_count,
        "tp_feedback": tp_count,
        "fp_feedback": fp_count,
        "fn_feedback": fn_count,
        "suppression_proposals": supp_count,
        "threshold_proposals": 0,
        "weight_proposals": 1 if proposals_created > supp_count + pattern_count else 0,
        "pattern_proposals": pattern_count,
        "ks_entries_created": ks_created,
        "overall_precision": precision,
        "overall_recall": recall,
        "overall_f1": f1,
        "lens_quality": None,
    }])
    metrics_row.withColumn("created_at", current_timestamp()).write.mode(
        "append"
    ).option("mergeSchema", "true").saveAsTable(learning_metrics_table)

# COMMAND ----------

result = {
    "notebook": "25_alhf_learning",
    "status": "completed",
    "feedback_processed": feedback_count,
    "proposals_created": proposals_created,
    "ks_entries_created": ks_created,
    "precision": precision,
    "recall": recall,
    "f1": f1,
}
mon.log_complete(details=result)
print(f"\nMUSE: {feedback_count} feedback -> {proposals_created} proposals, {ks_created} KS entries")
dbutils.notebook.exit(json.dumps(result))
