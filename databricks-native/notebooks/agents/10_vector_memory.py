# Databricks notebook source
# MAGIC %md
# MAGIC # Agent 10 - Vector Memory
# MAGIC Manages vector embeddings for semantic similarity search across security alerts.
# MAGIC Generates embeddings using Databricks BGE model, stores them in Delta, and
# MAGIC provides cosine-similarity search for finding related historical alerts.

# COMMAND ----------

# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

import json
import numpy as np
from datetime import datetime, timedelta
from pyspark.sql import functions as F
from pyspark.sql.types import ArrayType, FloatType
import mlflow.deployments

# COMMAND ----------

# MAGIC %md
# MAGIC ## Configuration

# COMMAND ----------

dbutils.widgets.text("lookback_hours", "6", "Alert lookback window")
dbutils.widgets.text("batch_size", "20", "Embedding batch size")
dbutils.widgets.text("similarity_threshold", "0.80", "Min cosine similarity for matches")

lookback_hours = int(dbutils.widgets.get("lookback_hours"))
BATCH_SIZE = int(dbutils.widgets.get("batch_size"))
SIMILARITY_THRESHOLD = float(dbutils.widgets.get("similarity_threshold"))
EMBEDDING_MODEL = "databricks-bge-large-en"

mon.log_event("config_loaded", {
    "lookback_hours": lookback_hours,
    "batch_size": BATCH_SIZE,
    "embedding_model": EMBEDDING_MODEL,
})

# COMMAND ----------

# MAGIC %md
# MAGIC ## Ensure Output Table Exists

# COMMAND ----------

spark.sql(f"""
CREATE TABLE IF NOT EXISTS {cfg.get_table_path('alert_embeddings')} (
    alert_id STRING,
    alert_text STRING,
    embedding ARRAY<FLOAT>,
    created_at TIMESTAMP,
    alert_type STRING,
    severity STRING,
    source STRING
)
USING DELTA
""")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Embedding Client

# COMMAND ----------

deploy_client = mlflow.deployments.get_deploy_client("databricks")


def generate_embeddings_batch(texts):
    """Generate embeddings for a batch of texts via Databricks BGE model."""
    response = deploy_client.predict(
        endpoint=EMBEDDING_MODEL,
        inputs={"input": texts}
    )
    return [item["embedding"] for item in response["data"]]

# COMMAND ----------

# MAGIC %md
# MAGIC ## Fetch Unprocessed Alerts

# COMMAND ----------

def get_unprocessed_alerts():
    """Retrieve alerts that do not yet have embeddings."""
    alerts_table = cfg.get_table_path("alerts")
    embeddings_table = cfg.get_table_path("alert_embeddings")
    cutoff = datetime.utcnow() - timedelta(hours=lookback_hours)

    alerts_df = spark.table(alerts_table).filter(F.col("created_at") >= F.lit(cutoff))
    existing_ids = spark.table(embeddings_table).select("alert_id")

    unprocessed = (
        alerts_df
        .join(existing_ids, on="alert_id", how="left_anti")
        .select(
            F.col("alert_id"),
            F.concat_ws(" | ",
                F.coalesce(F.col("title"), F.lit("")),
                F.coalesce(F.col("description"), F.lit("")),
                F.coalesce(F.col("alert_type"), F.lit("")),
                F.coalesce(F.col("severity"), F.lit("")),
            ).alias("alert_text"),
            F.col("alert_type"),
            F.col("severity"),
            F.coalesce(F.col("source"), F.lit("unknown")).alias("source"),
        )
        .filter(F.length(F.col("alert_text")) > 10)
    )
    return unprocessed

# COMMAND ----------

# MAGIC %md
# MAGIC ## Batch Embedding Processor

# COMMAND ----------

def process_alerts_in_batches(alerts_df):
    """Process alerts in batches of BATCH_SIZE with per-batch error handling."""
    alerts = alerts_df.collect()
    all_results = []
    failed_batches = 0

    for i in range(0, len(alerts), BATCH_SIZE):
        batch = alerts[i:i + BATCH_SIZE]
        batch_texts = [row["alert_text"] for row in batch]

        try:
            with mon.time(f"embedding_batch_{i // BATCH_SIZE}"):
                embeddings = generate_embeddings_batch(batch_texts)

            for row, embedding in zip(batch, embeddings):
                all_results.append({
                    "alert_id": row["alert_id"],
                    "alert_text": row["alert_text"][:500],
                    "embedding": embedding,
                    "created_at": datetime.utcnow().isoformat(),
                    "alert_type": row["alert_type"],
                    "severity": row["severity"],
                    "source": row["source"],
                })

            mon.log_event("batch_embedded", {"batch_idx": i // BATCH_SIZE, "count": len(batch)})

        except Exception as e:
            failed_batches += 1
            mon.log_warning(
                f"Batch {i // BATCH_SIZE} failed: {str(e)[:200]}",
                details=json.dumps({"alert_ids": [r["alert_id"] for r in batch]}),
            )
            if failed_batches > 5:
                raise RuntimeError(f"Too many batch failures ({failed_batches}), aborting")

    return all_results, failed_batches

# COMMAND ----------

# MAGIC %md
# MAGIC ## Cosine Similarity Search

# COMMAND ----------

def cosine_similarity(vec_a, vec_b):
    """Compute cosine similarity between two vectors."""
    a = np.array(vec_a, dtype=np.float32)
    b = np.array(vec_b, dtype=np.float32)
    norm_a = np.linalg.norm(a)
    norm_b = np.linalg.norm(b)
    if norm_a == 0.0 or norm_b == 0.0:
        return 0.0
    return float(np.dot(a, b) / (norm_a * norm_b))


def find_similar_alerts(query_embedding, top_k=10, min_similarity=None):
    """Find most similar historical alerts for a given embedding vector."""
    threshold = min_similarity or SIMILARITY_THRESHOLD
    embeddings_table = cfg.get_table_path("alert_embeddings")
    historical = spark.table(embeddings_table).select(
        "alert_id", "alert_text", "embedding", "alert_type", "severity"
    ).collect()

    similarities = []
    for row in historical:
        sim = cosine_similarity(query_embedding, row["embedding"])
        if sim >= threshold:
            similarities.append({
                "alert_id": row["alert_id"],
                "alert_text": row["alert_text"],
                "similarity": round(sim, 4),
                "alert_type": row["alert_type"],
                "severity": row["severity"],
            })

    similarities.sort(key=lambda x: x["similarity"], reverse=True)
    return similarities[:top_k]

# COMMAND ----------

# MAGIC %md
# MAGIC ## Main Execution

# COMMAND ----------

result = {"status": "failed", "alerts_processed": 0, "failed_batches": 0, "errors": []}

try:
    with mon.time("vector_memory_total"):
        # Step 1: Get unprocessed alerts
        with mon.time("fetch_unprocessed"):
            unprocessed_df = get_unprocessed_alerts()
            alert_count = unprocessed_df.count()
            mon.log_event("unprocessed_alerts_found", {"count": alert_count})

        if alert_count == 0:
            result = {"status": "success", "alerts_processed": 0, "message": "no_new_alerts"}
            mon.log_info("No new alerts to embed")
        else:
            # Step 2: Generate embeddings in batches
            with mon.time("generate_embeddings"):
                embedded_results, failed_batches = process_alerts_in_batches(unprocessed_df)
                mon.log_event("embeddings_generated", {
                    "success_count": len(embedded_results),
                    "failed_batches": failed_batches,
                })

            # Step 3: Store embeddings in Delta
            if embedded_results:
                with mon.time("store_embeddings"):
                    embeddings_df = spark.createDataFrame(embedded_results)
                    embeddings_df.write.mode("append").saveAsTable(cfg.get_table_path("alert_embeddings"))
                    mon.log_event("embeddings_stored", {"count": len(embedded_results)})

            # Step 4: Similarity enrichment on a sample of new alerts
            enriched_count = 0
            with mon.time("similarity_enrichment"):
                for alert in embedded_results[:5]:
                    try:
                        similar = find_similar_alerts(alert["embedding"], top_k=5)
                        if similar:
                            enriched_count += 1
                            mon.log_event("similar_alerts_found", {
                                "alert_id": alert["alert_id"],
                                "match_count": len(similar),
                                "top_score": similar[0]["similarity"],
                            })
                    except Exception as e:
                        mon.log_warning(f"Similarity search failed for {alert['alert_id']}: {str(e)[:200]}")

            result["status"] = "success"
            result["alerts_processed"] = len(embedded_results)
            result["failed_batches"] = failed_batches
            result["enriched_sample"] = enriched_count
            result["total_candidates"] = alert_count

    mon.log_complete(rows_processed=result.get("alerts_processed", 0))

except Exception as e:
    mon.log_error(e, context="vector_memory_main")
    result["status"] = "failed"
    result["errors"].append(str(e)[:500])

# COMMAND ----------

dbutils.notebook.exit(json.dumps(result))
