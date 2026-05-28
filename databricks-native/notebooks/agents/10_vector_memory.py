# Databricks notebook source
# MAGIC %md
# MAGIC # Agent 10 - Vector Memory
# MAGIC
# MAGIC Production vector memory using:
# MAGIC - **Databricks Foundation Model** (BGE-large) for embedding generation
# MAGIC - **Databricks Vector Search** (delta-sync index) for scalable ANN similarity
# MAGIC - **Delta Lake** as the source-of-truth for embeddings
# MAGIC - No `.collect()` for search -- all queries go through Vector Search API
# MAGIC
# MAGIC Architecture:
# MAGIC 1. New alerts are embedded via BGE model
# MAGIC 2. Embeddings stored to Delta table (source-of-truth)
# MAGIC 3. Delta-sync Vector Search index auto-syncs from Delta
# MAGIC 4. Similarity queries use Vector Search ANN (not brute-force)

# COMMAND ----------

# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

import json
import numpy as np
from datetime import datetime, timedelta
from pyspark.sql import functions as F
from pyspark.sql.types import ArrayType, FloatType, StringType, StructType, StructField, TimestampType
from databricks.vector_search.client import VectorSearchClient
import mlflow.deployments

# COMMAND ----------

dbutils.widgets.text("lookback_hours", "6", "Alert lookback window")
dbutils.widgets.text("batch_size", "20", "Embedding batch size")
dbutils.widgets.text("similarity_threshold", "0.80", "Min cosine similarity for matches")
dbutils.widgets.text("top_k", "10", "Number of similar results to return")

lookback_hours = int(dbutils.widgets.get("lookback_hours"))
BATCH_SIZE = int(dbutils.widgets.get("batch_size"))
SIMILARITY_THRESHOLD = float(dbutils.widgets.get("similarity_threshold"))
TOP_K = int(dbutils.widgets.get("top_k"))
EMBEDDING_MODEL = "databricks-bge-large-en"
VS_ENDPOINT = "0xdsi_vector_memory_endpoint"
EMBEDDINGS_TABLE = cfg.get_table_path("alert_embeddings")
INDEX_NAME = f"{cfg.catalog}.{cfg.schema}.alert_embeddings_index"

mon.log_event("config_loaded", {
    "lookback_hours": lookback_hours,
    "batch_size": BATCH_SIZE,
    "embedding_model": EMBEDDING_MODEL,
    "vs_endpoint": VS_ENDPOINT,
})

# COMMAND ----------

# MAGIC %md
# MAGIC ## Initialize Vector Search Infrastructure

# COMMAND ----------

# Ensure Delta table exists
spark.sql(f"""
CREATE TABLE IF NOT EXISTS {EMBEDDINGS_TABLE} (
    alert_id STRING,
    alert_text STRING,
    embedding ARRAY<FLOAT>,
    created_at TIMESTAMP,
    alert_type STRING,
    severity STRING,
    source STRING
)
USING DELTA
TBLPROPERTIES ('delta.enableChangeDataFeed' = 'true')
""")

# Initialize Vector Search client
vsc = VectorSearchClient()
deploy_client = mlflow.deployments.get_deploy_client("databricks")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Ensure Vector Search Index Exists (Delta-Sync)

# COMMAND ----------

def ensure_vector_search_index():
    """Create VS endpoint and delta-sync index if they don't exist."""
    # Endpoint
    try:
        vsc.get_endpoint(VS_ENDPOINT)
    except Exception:
        mon.log_info(f"Creating Vector Search endpoint: {VS_ENDPOINT}")
        vsc.create_endpoint(name=VS_ENDPOINT, endpoint_type="STANDARD")
        import time
        time.sleep(60)  # Wait for endpoint provisioning

    # Delta-sync index (auto-updates as Delta table changes)
    try:
        index = vsc.get_index(VS_ENDPOINT, INDEX_NAME)
        mon.log_event("vector_index_exists", {"index": INDEX_NAME})
        return index
    except Exception:
        mon.log_info(f"Creating delta-sync index: {INDEX_NAME}")
        index = vsc.create_delta_sync_index(
            endpoint_name=VS_ENDPOINT,
            index_name=INDEX_NAME,
            source_table_name=EMBEDDINGS_TABLE,
            pipeline_type="TRIGGERED",
            primary_key="alert_id",
            embedding_dimension=1024,  # BGE-large output dimension
            embedding_vector_column="embedding",
        )
        mon.log_event("vector_index_created", {"index": INDEX_NAME})
        return index

vs_index = ensure_vector_search_index()

# COMMAND ----------

# MAGIC %md
# MAGIC ## Embedding Generation (Real Databricks BGE Model)

# COMMAND ----------

def generate_embeddings_batch(texts):
    """Generate embeddings via Databricks Foundation Model endpoint."""
    response = deploy_client.predict(
        endpoint=EMBEDDING_MODEL,
        inputs={"input": texts},
    )
    return [item["embedding"] for item in response.data]

# COMMAND ----------

# MAGIC %md
# MAGIC ## Fetch Unprocessed Alerts

# COMMAND ----------

def get_unprocessed_alerts():
    """Retrieve alerts that do not yet have embeddings (anti-join)."""
    alerts_table = cfg.get_table_path("alerts")
    cutoff = datetime.utcnow() - timedelta(hours=lookback_hours)

    alerts_df = spark.table(alerts_table).filter(F.col("created_at") >= F.lit(cutoff))
    existing_ids = spark.table(EMBEDDINGS_TABLE).select(F.col("alert_id"))

    return (
        alerts_df
        .join(existing_ids, alerts_df["id"] == existing_ids["alert_id"], "left_anti")
        .select(
            F.col("id").alias("alert_id"),
            F.concat_ws(" | ",
                F.coalesce(F.col("title"), F.lit("")),
                F.coalesce(F.col("description"), F.lit("")),
                F.coalesce(F.col("mitre_tactic"), F.lit("")),
                F.coalesce(F.col("severity"), F.lit("")),
                F.coalesce(F.col("source_ip"), F.lit("")),
            ).alias("alert_text"),
            F.col("mitre_tactic").alias("alert_type"),
            F.col("severity"),
            F.coalesce(F.col("source"), F.lit("unknown")).alias("source"),
        )
        .filter(F.length(F.col("alert_text")) > 10)
    )

# COMMAND ----------

# MAGIC %md
# MAGIC ## Batch Embedding Processor

# COMMAND ----------

def process_alerts_in_batches(alerts_df):
    """Process alerts in batches with retry and circuit-breaker logic."""
    alerts = alerts_df.collect()
    all_results = []
    failed_batches = 0
    consecutive_failures = 0

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
                    "created_at": datetime.utcnow(),
                    "alert_type": row["alert_type"],
                    "severity": row["severity"],
                    "source": row["source"],
                })

            consecutive_failures = 0
            mon.log_event("batch_embedded", {"batch_idx": i // BATCH_SIZE, "count": len(batch)})

        except Exception as e:
            failed_batches += 1
            consecutive_failures += 1
            mon.log_warning(f"Batch {i // BATCH_SIZE} failed: {str(e)[:200]}")

            # Circuit breaker: 3 consecutive failures = stop
            if consecutive_failures >= 3:
                mon.log_warning("Circuit breaker tripped: 3 consecutive embedding failures")
                break

    return all_results, failed_batches

# COMMAND ----------

# MAGIC %md
# MAGIC ## Vector Search Similarity (Scalable ANN)

# COMMAND ----------

def find_similar_alerts(query_text=None, query_embedding=None, top_k=None, min_similarity=None):
    """
    Find similar alerts using Databricks Vector Search (ANN).
    Supports both text query (auto-embedded) and pre-computed embedding.

    This uses the Vector Search index -- NO .collect() or O(n) scan.
    """
    k = top_k or TOP_K
    threshold = min_similarity or SIMILARITY_THRESHOLD

    if query_text and not query_embedding:
        # Generate embedding for the query text
        embeddings = generate_embeddings_batch([query_text])
        query_embedding = embeddings[0]

    if query_embedding is None:
        return []

    # ANN search via Databricks Vector Search
    try:
        results = vs_index.similarity_search(
            query_vector=query_embedding,
            columns=["alert_id", "alert_text", "alert_type", "severity", "source"],
            num_results=k,
            filters=None,
        )

        if not results or not results.get("result", {}).get("data_array"):
            return []

        # Parse results (columns are returned in order requested + score)
        matches = []
        columns = results["result"].get("column_names", ["alert_id", "alert_text", "alert_type", "severity", "source", "score"])
        for row in results["result"]["data_array"]:
            score = float(row[-1])  # Score is always last
            if score >= threshold:
                match = dict(zip(columns[:-1], row[:-1]))
                match["similarity"] = score
                matches.append(match)

        return matches

    except Exception as e:
        mon.log_warning(f"Vector search query failed: {str(e)[:200]}")
        return []


def find_similar_to_alert(alert_id, top_k=None):
    """Find alerts similar to an existing alert by its ID."""
    # Fetch the existing embedding from Delta
    existing = (
        spark.table(EMBEDDINGS_TABLE)
        .filter(F.col("alert_id") == alert_id)
        .select("embedding")
        .first()
    )
    if existing and existing.embedding:
        return find_similar_alerts(query_embedding=existing.embedding, top_k=top_k)
    return []

# COMMAND ----------

# MAGIC %md
# MAGIC ## Main Execution

# COMMAND ----------

result = {"notebook": "10_vector_memory", "status": "failed", "started_at": datetime.utcnow().isoformat()}

try:
    with mon.time("vector_memory_total"):
        # Step 1: Get unprocessed alerts
        with mon.time("fetch_unprocessed"):
            unprocessed_df = get_unprocessed_alerts()
            alert_count = unprocessed_df.count()
            mon.log_metric("unprocessed_alerts", alert_count)

        if alert_count == 0:
            result = {"notebook": "10_vector_memory", "status": "success", "alerts_processed": 0, "message": "no_new_alerts"}
            mon.log_info("No new alerts to embed")
        else:
            # Step 2: Generate embeddings in batches
            with mon.time("generate_embeddings"):
                embedded_results, failed_batches = process_alerts_in_batches(unprocessed_df)
                mon.log_metric("embeddings_generated", len(embedded_results))
                mon.log_metric("failed_batches", failed_batches)

            # Step 3: Store embeddings in Delta (this auto-triggers VS index sync)
            if embedded_results:
                with mon.time("store_embeddings"):
                    embeddings_df = spark.createDataFrame(embedded_results)
                    safe_append(
                        embeddings_df,
                        "alert_embeddings",
                        catalog=cfg.catalog,
                        schema=cfg.schema,
                    )
                    mon.log_event("embeddings_stored", {"count": len(embedded_results)})

                # Step 4: Trigger Vector Search index sync
                with mon.time("trigger_index_sync"):
                    try:
                        vs_index.sync()
                        mon.log_event("index_sync_triggered", {"index": INDEX_NAME})
                    except Exception as sync_err:
                        mon.log_warning(f"Index sync trigger failed (will auto-sync): {sync_err}")

            # Step 5: Validate by running similarity queries on sample
            enriched_count = 0
            with mon.time("similarity_validation"):
                for alert in embedded_results[:5]:
                    similar = find_similar_alerts(
                        query_embedding=alert["embedding"],
                        top_k=5,
                    )
                    if similar:
                        enriched_count += 1
                        mon.log_event("similarity_validated", {
                            "alert_id": alert["alert_id"],
                            "match_count": len(similar),
                            "top_score": similar[0]["similarity"] if similar else 0,
                        })

            result = {
                "notebook": "10_vector_memory",
                "status": "success",
                "alerts_processed": len(embedded_results),
                "failed_batches": failed_batches,
                "enriched_sample": enriched_count,
                "total_candidates": alert_count,
                "index_name": INDEX_NAME,
                "completed_at": datetime.utcnow().isoformat(),
            }

    mon.log_complete(rows_processed=result.get("alerts_processed", 0))

except Exception as e:
    result["status"] = "error"
    result["error"] = str(e)[:500]
    result["error_type"] = type(e).__name__
    mon.log_error(e, context="vector_memory_main")
    raise

finally:
    print(json.dumps(result, indent=2))
    dbutils.notebook.exit(json.dumps(result))
