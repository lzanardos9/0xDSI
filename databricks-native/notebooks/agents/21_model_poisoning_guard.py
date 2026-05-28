# Databricks notebook source
# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

require_enabled("model_poisoning_guard")

# COMMAND ----------

# MAGIC %md
# MAGIC # Agent 21 - Model Poisoning Guard
# MAGIC Monitors ML model predictions for distribution drift and potential poisoning.
# MAGIC Compares recent (24h) distributions against 7-day baseline via z-score analysis.
# MAGIC Checks training data integrity via label hash comparison.

# COMMAND ----------

import json
from datetime import datetime, timedelta
from pyspark.sql import functions as F

# COMMAND ----------

DRIFT_THRESHOLD_SIGMA = 2.0
BASELINE_WINDOW_DAYS = 7
RECENT_WINDOW_HOURS = 24

notebook_start = datetime.utcnow()
mon.time("model_poisoning_guard_total")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Load Prediction Data

# COMMAND ----------

predictions_path = cfg.get_table_path("model_predictions")
baseline_cutoff = datetime.utcnow() - timedelta(days=BASELINE_WINDOW_DAYS)
recent_cutoff = datetime.utcnow() - timedelta(hours=RECENT_WINDOW_HOURS)

mon.time("load_predictions")
predictions_df = spark.read.table(predictions_path)

baseline_df = predictions_df.filter(
    (F.col("prediction_ts") >= F.lit(baseline_cutoff)) &
    (F.col("prediction_ts") < F.lit(recent_cutoff))
)
recent_df = predictions_df.filter(F.col("prediction_ts") >= F.lit(recent_cutoff))

mon.log_event("predictions_loaded", {
    "baseline_count": baseline_df.count(),
    "recent_count": recent_df.count()
})

# COMMAND ----------

# MAGIC %md
# MAGIC ## Compute Statistics and Drift Z-Scores

# COMMAND ----------

mon.time("compute_stats")

baseline_stats = baseline_df.groupBy("model_id").agg(
    F.mean("confidence_score").alias("baseline_mean"),
    F.stddev("confidence_score").alias("baseline_stddev"),
    F.count("*").alias("baseline_count"),
    F.mean("prediction_value").alias("baseline_pred_mean"),
    F.stddev("prediction_value").alias("baseline_pred_stddev")
)

recent_stats = recent_df.groupBy("model_id").agg(
    F.mean("confidence_score").alias("recent_mean"),
    F.count("*").alias("recent_count"),
    F.mean("prediction_value").alias("recent_pred_mean")
)

drift_df = baseline_stats.join(recent_stats, on="model_id", how="inner")

drift_analysis = drift_df.withColumn(
    "confidence_z_score",
    F.when(F.col("baseline_stddev") > 0,
           F.abs(F.col("recent_mean") - F.col("baseline_mean")) / F.col("baseline_stddev")
    ).otherwise(F.lit(0.0))
).withColumn(
    "prediction_z_score",
    F.when(F.col("baseline_pred_stddev") > 0,
           F.abs(F.col("recent_pred_mean") - F.col("baseline_pred_mean")) / F.col("baseline_pred_stddev")
    ).otherwise(F.lit(0.0))
).withColumn(
    "drift_detected",
    (F.col("confidence_z_score") > DRIFT_THRESHOLD_SIGMA) |
    (F.col("prediction_z_score") > DRIFT_THRESHOLD_SIGMA)
).withColumn(
    "max_z_score",
    F.greatest(F.col("confidence_z_score"), F.col("prediction_z_score"))
)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Training Data Integrity Check

# COMMAND ----------

mon.time("integrity_check")

training_meta_df = spark.read.table(cfg.get_table_path("model_training_metadata"))
current_hashes = training_meta_df.select("model_id", "label_distribution_hash", "feature_hash")

stored_hashes = spark.read.table(cfg.get_table_path("model_integrity_baseline")).select(
    "model_id",
    F.col("label_distribution_hash").alias("expected_label_hash"),
    F.col("feature_hash").alias("expected_feature_hash")
)

integrity_df = current_hashes.join(stored_hashes, on="model_id", how="inner").withColumn(
    "label_hash_mismatch",
    F.col("label_distribution_hash") != F.col("expected_label_hash")
).withColumn(
    "feature_hash_mismatch",
    F.col("feature_hash") != F.col("expected_feature_hash")
).withColumn(
    "integrity_compromised",
    F.col("label_hash_mismatch") | F.col("feature_hash_mismatch")
)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Generate Alerts with LLM Analysis

# COMMAND ----------

mon.time("generate_alerts")

drifted_models = drift_analysis.filter(F.col("drift_detected") == True)
compromised_models = integrity_df.filter(F.col("integrity_compromised") == True)
alerts = []

for row in drifted_models.collect():
    prompt = (
        f"Analyze ML model drift and assess poisoning risk. "
        f"Model: {row['model_id']}, Confidence Z-Score: {row['confidence_z_score']:.3f}, "
        f"Prediction Z-Score: {row['prediction_z_score']:.3f}, "
        f"Baseline mean: {row['baseline_mean']:.4f}, Recent mean: {row['recent_mean']:.4f}. "
        f"Respond JSON: {{\"risk_level\": \"high|medium|low\", \"assessment\": \"...\", "
        f"\"recommended_action\": \"...\"}}"
    )
    analysis = llm.extract_json(prompt)
    alerts.append({
        "model_id": row["model_id"],
        "alert_type": "prediction_drift",
        "confidence_z_score": float(row["confidence_z_score"]),
        "prediction_z_score": float(row["prediction_z_score"]),
        "risk_level": analysis.get("risk_level", "medium"),
        "assessment": analysis.get("assessment", ""),
        "recommended_action": analysis.get("recommended_action", ""),
        "detected_at": datetime.utcnow().isoformat()
    })

for row in compromised_models.collect():
    alerts.append({
        "model_id": row["model_id"],
        "alert_type": "integrity_violation",
        "confidence_z_score": 0.0,
        "prediction_z_score": 0.0,
        "risk_level": "high",
        "assessment": "Training data hash mismatch - possible data poisoning",
        "recommended_action": "Quarantine model and audit training pipeline",
        "detected_at": datetime.utcnow().isoformat()
    })

mon.log_event("alerts_generated", {"count": len(alerts)})

# COMMAND ----------

# MAGIC %md
# MAGIC ## Write Results

# COMMAND ----------

mon.time("write_results")
results_path = cfg.get_table_path("model_integrity_checks")

if alerts:
    alerts_df = spark.createDataFrame(alerts)
    alerts_df = alerts_df.withColumn("check_run_ts", F.lit(notebook_start))
    alerts_df.write.mode("append").saveAsTable(results_path)

drift_summary = drift_analysis.withColumn("check_run_ts", F.lit(notebook_start))
drift_summary.write.mode("append").saveAsTable(results_path + "_drift_history")

mon.log_event("results_written", {
    "alerts_stored": len(alerts),
    "models_checked": drift_analysis.count()
})

# COMMAND ----------

# MAGIC %md
# MAGIC ## Finalize

# COMMAND ----------

mon.log_complete()

result = {
    "status": "success",
    "agent": "21_model_poisoning_guard",
    "models_analyzed": drift_analysis.count(),
    "drift_detected_count": drifted_models.count(),
    "integrity_violations": compromised_models.count(),
    "alerts_generated": len(alerts),
    "execution_time_sec": (datetime.utcnow() - notebook_start).total_seconds()
}

dbutils.notebook.exit(json.dumps(result))
