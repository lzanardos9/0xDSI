# Databricks notebook source
# MAGIC %md
# MAGIC # Agent 25 - ALHF Learning Agent (Analyst Learning from Human Feedback)
# MAGIC Captures analyst feedback on alert triage decisions, learns from corrections,
# MAGIC monitors model drift, and continuously improves detection quality.

# COMMAND ----------

dbutils.widgets.text("catalog", "soc_platform", "Unity Catalog")
dbutils.widgets.text("schema", "agentic_soc", "Schema")

catalog = dbutils.widgets.get("catalog")
schema = dbutils.widgets.get("schema")
spark.sql(f"USE CATALOG {catalog}")
spark.sql(f"USE SCHEMA {schema}")

# COMMAND ----------

from pyspark.sql import functions as F
import json
from datetime import datetime

# COMMAND ----------

# MAGIC %md
# MAGIC ## Collect Analyst Feedback

# COMMAND ----------

recent_feedback = spark.sql("""
    SELECT af.alert_id, af.analyst_verdict, af.analyst_notes,
           af.time_to_triage_seconds, af.feedback_at,
           a.severity, a.confidence_score, a.risk_score,
           a.mitre_tactic, a.rule_name,
           ag.triage_verdict as agent_verdict, ag.agent_confidence
    FROM analyst_feedback af
    JOIN alerts a ON af.alert_id = a.id
    LEFT JOIN agent_triage_results ag ON af.alert_id = ag.alert_id
    WHERE af.processed_for_learning = false
      AND af.feedback_at > current_timestamp() - INTERVAL 24 HOURS
""")

feedback_count = recent_feedback.count()
print(f"Processing {feedback_count} analyst feedback entries")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Calculate Agent Accuracy

# COMMAND ----------

if feedback_count > 0:
    accuracy_stats = recent_feedback.filter(F.col("agent_verdict").isNotNull()).groupBy().agg(
        F.count("*").alias("total_compared"),
        F.sum(F.when(F.col("analyst_verdict") == F.col("agent_verdict"), 1).otherwise(0)).alias("correct"),
        F.avg("time_to_triage_seconds").alias("avg_triage_time"),
        F.avg("agent_confidence").alias("avg_agent_confidence"),
    ).collect()[0]

    if accuracy_stats.total_compared > 0:
        accuracy = (accuracy_stats.correct / accuracy_stats.total_compared) * 100
        print(f"Agent Accuracy: {accuracy:.1f}% ({accuracy_stats.correct}/{accuracy_stats.total_compared})")
        print(f"Avg Triage Time: {accuracy_stats.avg_triage_time:.0f}s")

        # Track accuracy over time
        spark.createDataFrame([{
            "period_start": (datetime.utcnow()).isoformat(),
            "accuracy_pct": float(accuracy),
            "total_evaluated": int(accuracy_stats.total_compared),
            "correct_count": int(accuracy_stats.correct),
            "avg_confidence": float(accuracy_stats.avg_agent_confidence or 0),
            "avg_triage_seconds": float(accuracy_stats.avg_triage_time or 0),
        }]).write.mode("append").saveAsTable("agent_accuracy_history")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Identify False Positive Patterns

# COMMAND ----------

    fp_patterns = recent_feedback.filter(
        F.col("analyst_verdict") == "false_positive"
    ).groupBy("rule_name", "mitre_tactic").agg(
        F.count("*").alias("fp_count"),
        F.avg("confidence_score").alias("avg_confidence"),
    ).filter(F.col("fp_count") >= 3).orderBy(F.desc("fp_count"))

    fp_rules = fp_patterns.collect()
    if fp_rules:
        print(f"\nHigh FP rules ({len(fp_rules)}):")
        for rule in fp_rules[:5]:
            print(f"  - {rule.rule_name}: {rule.fp_count} FPs (avg confidence: {rule.avg_confidence:.2f})")

        # Auto-tune: reduce confidence for high-FP rules
        for rule in fp_rules:
            if rule.fp_count >= 5:
                spark.sql(f"""
                    UPDATE correlation_rules
                    SET confidence_adjustment = COALESCE(confidence_adjustment, 0) - 0.05
                    WHERE name = '{rule.rule_name}'
                """)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Mark Feedback as Processed

# COMMAND ----------

    spark.sql("""
        UPDATE analyst_feedback
        SET processed_for_learning = true
        WHERE processed_for_learning = false
          AND feedback_at > current_timestamp() - INTERVAL 24 HOURS
    """)

spark.sql("""
    MERGE INTO agent_status AS t
    USING (SELECT 'alhf-learning' as agent_id, current_timestamp() as last_run, 'active' as status) AS s
    ON t.agent_id = s.agent_id
    WHEN MATCHED THEN UPDATE SET last_run = s.last_run, status = s.status
    WHEN NOT MATCHED THEN INSERT (agent_id, last_run, status) VALUES (s.agent_id, s.last_run, s.status)
""")

print("ALHF Learning agent complete")
