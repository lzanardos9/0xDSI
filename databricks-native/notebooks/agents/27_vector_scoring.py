# Databricks notebook source
# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

# MAGIC %md
# MAGIC # Agent 27 - Vector Augmented Scoring
# MAGIC Re-scores alerts using embedding similarity to confirmed true positives.
# MAGIC Blends original confidence with vector similarity for improved accuracy.

# COMMAND ----------

import json
import numpy as np
from datetime import datetime
from pyspark.sql import functions as F
from pyspark.sql.types import FloatType

# COMMAND ----------

# MAGIC %md
# MAGIC ## Configuration

# COMMAND ----------

TP_REFERENCE_LIMIT = 500
BLEND_ORIGINAL_WEIGHT = 0.6
BLEND_VECTOR_WEIGHT = 0.4
SIMILARITY_THRESHOLD = 0.3
alerts_table = cfg.get_table_path("alerts")
scoring_log_table = cfg.get_table_path("vector_scoring_log")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Load Top 500 Confirmed TP Embeddings

# COMMAND ----------

mon.time("load_tp_reference")
tp_alerts_df = (
    spark.read.table(alerts_table)
    .filter(F.col("disposition") == "true_positive")
    .filter(F.col("embedding").isNotNull())
    .orderBy(F.col("confirmed_at").desc())
    .limit(TP_REFERENCE_LIMIT)
    .select("alert_id", "embedding", "alert_type", "severity")
    .cache()
)
tp_count = tp_alerts_df.count()
mon.log_event("tp_reference_loaded", {"count": tp_count})

if tp_count == 0:
    result = {"agent": "27_vector_scoring", "status": "skipped",
              "reason": "no confirmed TP embeddings", "timestamp": datetime.utcnow().isoformat()}
    mon.log_complete(result)
    dbutils.notebook.exit(json.dumps(result))

# COMMAND ----------

# MAGIC %md
# MAGIC ## Build Normalized Reference Matrix and Broadcast

# COMMAND ----------

mon.time("prepare_reference_matrix")
tp_rows = tp_alerts_df.select("embedding").collect()
tp_matrix = np.array([row["embedding"] for row in tp_rows])
tp_norms = np.linalg.norm(tp_matrix, axis=1, keepdims=True)
tp_norms = np.where(tp_norms == 0, 1, tp_norms)
tp_matrix_normalized = tp_matrix / tp_norms
broadcast_tp_matrix = sc.broadcast(tp_matrix_normalized)
mon.log_event("reference_matrix_prepared", {"shape": list(tp_matrix_normalized.shape)})

# COMMAND ----------

# MAGIC %md
# MAGIC ## Load Unscored Alerts

# COMMAND ----------

mon.time("load_unscored")
unscored_df = (
    spark.read.table(alerts_table)
    .filter(F.col("vector_score").isNull())
    .filter(F.col("embedding").isNotNull())
    .filter(F.col("status").isin("open", "triaging"))
    .select("alert_id", "embedding", "confidence_score")
    .cache()
)
unscored_count = unscored_df.count()
mon.log_event("unscored_alerts_loaded", {"count": unscored_count})

# COMMAND ----------

# MAGIC %md
# MAGIC ## Compute Cosine Similarity and Blended Score

# COMMAND ----------

mon.time("compute_similarity")

def compute_max_cosine_similarity(embedding):
    """Max cosine similarity against TP reference set."""
    if embedding is None:
        return 0.0
    vec = np.array(embedding)
    norm = np.linalg.norm(vec)
    if norm == 0:
        return 0.0
    similarities = np.dot(broadcast_tp_matrix.value, vec / norm)
    return float(np.max(similarities))

cosine_sim_udf = F.udf(compute_max_cosine_similarity, FloatType())

scored_df = (
    unscored_df
    .withColumn("max_vector_similarity", cosine_sim_udf(F.col("embedding")))
    .withColumn("vector_score",
        (F.lit(BLEND_ORIGINAL_WEIGHT) * F.col("confidence_score"))
        + (F.lit(BLEND_VECTOR_WEIGHT) * F.col("max_vector_similarity")))
    .withColumn("vector_score", F.round(F.col("vector_score"), 4))
    .withColumn("scored_at", F.current_timestamp())
    .select("alert_id", "confidence_score", "max_vector_similarity", "vector_score", "scored_at")
    .cache()
)
scored_count = scored_df.count()
mon.log_event("scores_computed", {"count": scored_count})

# COMMAND ----------

# MAGIC %md
# MAGIC ## MERGE Updated Scores into Alerts

# COMMAND ----------

mon.time("merge_scores")
if scored_count > 0:
    scored_df.createOrReplaceTempView("scored_updates")
    merge_sql = f"""
        MERGE INTO {alerts_table} AS target
        USING scored_updates AS source
        ON target.alert_id = source.alert_id
        WHEN MATCHED THEN UPDATE SET
            target.vector_score = source.vector_score,
            target.vector_similarity = source.max_vector_similarity,
            target.vector_scored_at = source.scored_at
    """
    spark.sql(merge_sql)
    mon.log_event("alerts_merged", {"updated": scored_count})

# COMMAND ----------

# MAGIC %md
# MAGIC ## Store Scoring History

# COMMAND ----------

mon.time("store_scoring_log")
if scored_count > 0:
    scoring_log_df = (
        scored_df
        .withColumn("blend_weight_original", F.lit(BLEND_ORIGINAL_WEIGHT))
        .withColumn("blend_weight_vector", F.lit(BLEND_VECTOR_WEIGHT))
        .withColumn("tp_reference_count", F.lit(tp_count))
        .withColumn("run_id", F.expr("uuid()"))
    )
    scoring_log_df.write.mode("append").saveAsTable(scoring_log_table)
    mon.log_event("scoring_log_stored", {"records": scored_count})

# COMMAND ----------

# MAGIC %md
# MAGIC ## Summary and Finalize

# COMMAND ----------

stats = {}
if scored_count > 0:
    stats_row = scored_df.agg(
        F.avg("vector_score").alias("avg_score"),
        F.avg("max_vector_similarity").alias("avg_similarity"),
        F.count(F.when(F.col("max_vector_similarity") >= SIMILARITY_THRESHOLD, True)).alias("high_sim"),
    ).collect()[0]
    stats = {"avg_vector_score": round(float(stats_row["avg_score"]), 4),
             "avg_similarity": round(float(stats_row["avg_similarity"]), 4),
             "high_similarity_alerts": int(stats_row["high_sim"])}

result = {
    "agent": "27_vector_scoring", "status": "success",
    "tp_reference_count": tp_count, "unscored_alerts": unscored_count,
    "alerts_scored": scored_count,
    "blend_weights": {"original": BLEND_ORIGINAL_WEIGHT, "vector": BLEND_VECTOR_WEIGHT},
    "statistics": stats, "timestamp": datetime.utcnow().isoformat(),
}
mon.log_complete(result)
dbutils.notebook.exit(json.dumps(result))
