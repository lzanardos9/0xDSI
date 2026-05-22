# Databricks notebook source
# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

# MAGIC %md
# MAGIC # Agent 25 - ALHF Learning (Analyst Learning from Human Feedback)
# MAGIC Collects analyst feedback on triage decisions, computes accuracy metrics per rule,
# MAGIC identifies high-FP rules, and auto-tunes confidence. Never auto-disables rules.

# COMMAND ----------

import json
from datetime import datetime, timedelta
from pyspark.sql import functions as F

FEEDBACK_WINDOW_HOURS = 24
HIGH_FP_THRESHOLD = 5
CONFIDENCE_REDUCTION_FACTOR = 0.10
MIN_CONFIDENCE_FLOOR = 0.20

feedback_table = cfg.get_table_path("analyst_feedback")
accuracy_table = cfg.get_table_path("agent_accuracy_metrics")
rules_table = cfg.get_table_path("detection_rules")
audit_log_table = cfg.get_table_path("rule_tuning_audit")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Collect Recent Analyst Feedback

# COMMAND ----------

mon.time("collect_feedback")
window_start = datetime.utcnow() - timedelta(hours=FEEDBACK_WINDOW_HOURS)
feedback_df = (
    spark.read.table(feedback_table)
    .filter(F.col("feedback_time") >= F.lit(window_start))
    .filter(F.col("feedback_type").isin("true_positive", "false_positive", "false_negative"))
)
feedback_count = feedback_df.count()
mon.log_event("feedback_collected", {"total": feedback_count, "window_hours": FEEDBACK_WINDOW_HOURS})

if feedback_count == 0:
    result = {"agent": "25_alhf_learning", "status": "success",
              "message": "No new feedback in window", "timestamp": datetime.utcnow().isoformat()}
    mon.log_complete(result)
    dbutils.notebook.exit(json.dumps(result))

# COMMAND ----------

# MAGIC %md
# MAGIC ## Compute Accuracy Metrics Per Rule

# COMMAND ----------

mon.time("compute_metrics")
rule_metrics_df = (
    feedback_df.groupBy("rule_id").agg(
        F.count("*").alias("total_decisions"),
        F.sum(F.when(F.col("feedback_type") == "true_positive", 1).otherwise(0)).alias("tp_count"),
        F.sum(F.when(F.col("feedback_type") == "false_positive", 1).otherwise(0)).alias("fp_count"),
        F.sum(F.when(F.col("feedback_type") == "false_negative", 1).otherwise(0)).alias("fn_count"),
    )
    .withColumn("tp_rate", F.col("tp_count") / F.col("total_decisions"))
    .withColumn("fp_rate", F.col("fp_count") / F.col("total_decisions"))
    .withColumn("precision", F.when(
        (F.col("tp_count") + F.col("fp_count")) > 0,
        F.col("tp_count") / (F.col("tp_count") + F.col("fp_count"))
    ).otherwise(F.lit(0.0)))
    .withColumn("computed_at", F.current_timestamp())
    .withColumn("window_start", F.lit(window_start))
    .withColumn("window_end", F.lit(datetime.utcnow()))
)

rules_evaluated = rule_metrics_df.count()
mon.log_event("metrics_computed", {"rules_evaluated": rules_evaluated})

# COMMAND ----------

# MAGIC %md
# MAGIC ## Store Metrics and Identify High-FP Rules

# COMMAND ----------

mon.time("store_metrics")
metrics_with_id = rule_metrics_df.withColumn("metric_id", F.expr("uuid()"))
metrics_with_id.write.mode("append").saveAsTable(accuracy_table)

high_fp_rules_df = rule_metrics_df.filter(F.col("fp_count") >= HIGH_FP_THRESHOLD)
high_fp_count = high_fp_rules_df.count()
mon.log_event("metrics_stored_and_fp_identified", {
    "records_written": rules_evaluated, "high_fp_count": high_fp_count, "threshold": HIGH_FP_THRESHOLD,
})

# COMMAND ----------

# MAGIC %md
# MAGIC ## Auto-Tune Rule Confidence via MERGE
# MAGIC Reduces confidence by 10% for high-FP rules. Never disables -- flags for human review.

# COMMAND ----------

mon.time("auto_tune_confidence")
rules_tuned = 0

if high_fp_count > 0:
    high_fp_rule_ids = [row.rule_id for row in high_fp_rules_df.select("rule_id").collect()]
    current_rules_df = (
        spark.read.table(rules_table)
        .filter(F.col("rule_id").isin(high_fp_rule_ids))
        .filter(F.col("is_enabled") == True)
    )
    tuned_rules_df = (
        current_rules_df
        .withColumn("new_confidence", F.greatest(
            F.col("confidence") * F.lit(1.0 - CONFIDENCE_REDUCTION_FACTOR), F.lit(MIN_CONFIDENCE_FLOOR)))
        .withColumn("tuning_reason", F.lit("high_fp_auto_adjustment"))
        .withColumn("tuned_at", F.current_timestamp())
        .withColumn("requires_human_review",
                    F.when(F.col("new_confidence") <= F.lit(MIN_CONFIDENCE_FLOOR + 0.05), True).otherwise(False))
    )
    tuned_rules_df.createOrReplaceTempView("tuned_rules_source")
    spark.sql(f"""
        MERGE INTO {rules_table} AS target
        USING tuned_rules_source AS source
        ON target.rule_id = source.rule_id
        WHEN MATCHED AND source.new_confidence > {MIN_CONFIDENCE_FLOOR} THEN UPDATE SET
            target.confidence = source.new_confidence,
            target.last_tuned_at = source.tuned_at,
            target.tuning_reason = source.tuning_reason,
            target.requires_human_review = source.requires_human_review
    """)
    rules_tuned = tuned_rules_df.count()
    # Write audit trail via DataFrame operations
    audit_df = tuned_rules_df.select(
        F.expr("uuid()").alias("audit_id"), F.col("rule_id"),
        F.col("confidence").alias("old_confidence"), F.col("new_confidence"),
        F.col("tuning_reason"), F.col("tuned_at"),
        F.col("requires_human_review"), F.lit("25_alhf_learning").alias("tuned_by"),
    )
    audit_df.write.mode("append").saveAsTable(audit_log_table)

mon.log_event("confidence_tuned", {"rules_tuned": rules_tuned, "reduction_pct": CONFIDENCE_REDUCTION_FACTOR})

# COMMAND ----------

# MAGIC %md
# MAGIC ## Compute 7-Day Accuracy Trends

# COMMAND ----------

mon.time("accuracy_trends")
historical_metrics_df = (
    spark.read.table(accuracy_table)
    .filter(F.col("computed_at") >= F.lit(datetime.utcnow() - timedelta(days=7)))
)
trend_df = historical_metrics_df.groupBy("rule_id").agg(
    F.avg("tp_rate").alias("avg_tp_rate_7d"),
    F.avg("fp_rate").alias("avg_fp_rate_7d"),
    F.avg("precision").alias("avg_precision_7d"),
    F.count("*").alias("measurement_count"),
)
improving_rules = trend_df.filter(F.col("avg_precision_7d") >= 0.8).count()
degrading_rules = trend_df.filter(F.col("avg_precision_7d") < 0.5).count()
mon.log_event("accuracy_trends", {"improving": improving_rules, "degrading": degrading_rules})

# COMMAND ----------

# MAGIC %md
# MAGIC ## Generate Learning Summary via LLM

# COMMAND ----------

mon.time("llm_summary")
summary_prompt = f"""Summarize this SOC learning cycle as JSON:
- Feedback: {feedback_count}, Rules evaluated: {rules_evaluated}
- High-FP rules: {high_fp_count} (>= {HIGH_FP_THRESHOLD} FPs in {FEEDBACK_WINDOW_HOURS}h)
- Tuned: {rules_tuned} rules (confidence -{int(CONFIDENCE_REDUCTION_FACTOR * 100)}%)
- 7d trend: {improving_rules} improving, {degrading_rules} degrading
Return: health_status (healthy/needs_attention/degraded), key_findings (up to 3), recommendations (up to 2).
"""
learning_summary = llm.extract_json(summary_prompt)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Finalize

# COMMAND ----------

result = {
    "agent": "25_alhf_learning",
    "status": "success",
    "feedback_processed": feedback_count,
    "rules_evaluated": rules_evaluated,
    "high_fp_rules": high_fp_count,
    "rules_tuned": rules_tuned,
    "accuracy_trends": {"improving": improving_rules, "degrading": degrading_rules},
    "learning_summary": learning_summary,
    "timestamp": datetime.utcnow().isoformat(),
}

mon.log_complete(result)
dbutils.notebook.exit(json.dumps(result))
