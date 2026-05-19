# Databricks notebook source
# MAGIC %md
# MAGIC # Agent 21 - Model Poisoning Guard
# MAGIC Detects training-data poisoning, model drift, and adversarial attacks
# MAGIC against ML models deployed in the SOC pipeline.

# COMMAND ----------

dbutils.widgets.text("catalog", "soc_platform", "Unity Catalog")
dbutils.widgets.text("schema", "agentic_soc", "Schema")

catalog = dbutils.widgets.get("catalog")
schema = dbutils.widgets.get("schema")
spark.sql(f"USE CATALOG {catalog}")
spark.sql(f"USE SCHEMA {schema}")

# COMMAND ----------

from pyspark.sql import functions as F
from pyspark.ml.stat import Summarizer
import json
from datetime import datetime

# COMMAND ----------

# MAGIC %md
# MAGIC ## Monitor Model Predictions for Drift

# COMMAND ----------

recent_predictions = spark.sql("""
    SELECT model_name, prediction, confidence, features_hash, predicted_at
    FROM ml_predictions
    WHERE predicted_at > current_timestamp() - INTERVAL 1 HOUR
""")

baseline_stats = spark.sql("""
    SELECT model_name,
           AVG(confidence) as baseline_confidence,
           STDDEV(confidence) as baseline_stddev,
           COUNT(*) as baseline_count
    FROM ml_predictions
    WHERE predicted_at BETWEEN current_timestamp() - INTERVAL 7 DAYS
                           AND current_timestamp() - INTERVAL 1 HOUR
    GROUP BY model_name
""")

# Detect statistical drift
drift_report = recent_predictions.groupBy("model_name").agg(
    F.avg("confidence").alias("current_confidence"),
    F.stddev("confidence").alias("current_stddev"),
    F.count("*").alias("current_count"),
).join(baseline_stats, "model_name", "left")

drift_alerts = drift_report.filter(
    F.abs(F.col("current_confidence") - F.col("baseline_confidence")) > 2 * F.col("baseline_stddev")
).collect()

if drift_alerts:
    print(f"DRIFT DETECTED in {len(drift_alerts)} models!")
    for alert in drift_alerts:
        spark.sql(f"""
            INSERT INTO alerts (id, title, description, severity, status, mitre_tactic, confidence_score, risk_score, created_at)
            VALUES (
                'mpg-{datetime.utcnow().strftime("%Y%m%d%H%M%S")}',
                'ML Model Drift Detected: {alert.model_name}',
                'Model confidence shifted from {alert.baseline_confidence:.3f} to {alert.current_confidence:.3f} (>{2*alert.baseline_stddev:.3f} deviation)',
                'high', 'new', 'defense-evasion', 0.85, 75, current_timestamp()
            )
        """)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Check Training Data Integrity

# COMMAND ----------

training_integrity = spark.sql("""
    SELECT td.dataset_name,
           COUNT(*) as total_samples,
           SUM(CASE WHEN td.label_hash != td.expected_hash THEN 1 ELSE 0 END) as tampered_samples,
           MAX(td.modified_at) as last_modified
    FROM training_datasets td
    WHERE td.last_verified < current_timestamp() - INTERVAL 1 HOUR
    GROUP BY td.dataset_name
    HAVING SUM(CASE WHEN td.label_hash != td.expected_hash THEN 1 ELSE 0 END) > 0
""").collect()

if training_integrity:
    for dataset in training_integrity:
        print(f"POISONING ALERT: {dataset.dataset_name} has {dataset.tampered_samples} tampered samples")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Write Guard Report

# COMMAND ----------

report = {
    "check_time": datetime.utcnow().isoformat(),
    "models_monitored": drift_report.count() if drift_report else 0,
    "drift_alerts": len(drift_alerts) if drift_alerts else 0,
    "poisoned_datasets": len(training_integrity) if training_integrity else 0,
    "agent_name": "model-poisoning-guard",
}

spark.createDataFrame([report]).write.mode("append").saveAsTable("model_guard_reports")

spark.sql("""
    MERGE INTO agent_status AS t
    USING (SELECT 'model-poisoning-guard' as agent_id, current_timestamp() as last_run, 'active' as status) AS s
    ON t.agent_id = s.agent_id
    WHEN MATCHED THEN UPDATE SET last_run = s.last_run, status = s.status
    WHEN NOT MATCHED THEN INSERT (agent_id, last_run, status) VALUES (s.agent_id, s.last_run, s.status)
""")
