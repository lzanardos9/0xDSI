# Databricks notebook source
# MAGIC %md
# MAGIC # Vector Search Managed Index - Production Embedding Pipeline
# MAGIC
# MAGIC Creates and maintains Databricks Vector Search indexes for:
# MAGIC 1. Alert embeddings (semantic similarity for deduplication & hunting)
# MAGIC 2. IOC embeddings (threat intel pattern matching)
# MAGIC 3. Case embeddings (similar incident retrieval)
# MAGIC
# MAGIC Uses Databricks Vector Search endpoints for low-latency ANN queries.

# COMMAND ----------

# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

require_enabled("vector_search_index")

# COMMAND ----------

from pyspark.sql.functions import *
from pyspark.sql.types import *
from databricks.vector_search.client import VectorSearchClient
import mlflow.deployments
from datetime import datetime, timedelta
import json
import time

# COMMAND ----------

# Widget parameters specific to this notebook (bootstrap handles catalog/schema)
dbutils.widgets.text("embedding_model", "databricks-bge-large-en", "Embedding model endpoint")
dbutils.widgets.text("vector_search_endpoint", "0xdsi-vector-search", "Vector Search endpoint name")
dbutils.widgets.text("batch_size", "64", "Embedding batch size")
dbutils.widgets.text("lookback_hours", "24", "Hours to look back for new records")

embedding_model = dbutils.widgets.get("embedding_model")
vs_endpoint_name = dbutils.widgets.get("vector_search_endpoint")
batch_size = int(dbutils.widgets.get("batch_size"))
lookback_hours = int(dbutils.widgets.get("lookback_hours"))

# COMMAND ----------

# MAGIC %md
# MAGIC ## Initialize Clients

# COMMAND ----------

vsc = VectorSearchClient()
deploy_client = mlflow.deployments.get_deploy_client("databricks")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Ensure Vector Search Endpoint Exists

# COMMAND ----------

def ensure_endpoint_exists(endpoint_name):
    """Create or verify the Vector Search endpoint is online."""
    try:
        endpoint = vsc.get_endpoint(endpoint_name)
        print(f"Endpoint '{endpoint_name}' exists: status={endpoint.get('endpoint_status', {}).get('state')}")
        return endpoint
    except Exception:
        print(f"Creating Vector Search endpoint: {endpoint_name}")
        endpoint = vsc.create_endpoint(name=endpoint_name, endpoint_type="STANDARD")
        for i in range(30):
            status = vsc.get_endpoint(endpoint_name)
            state = status.get("endpoint_status", {}).get("state", "UNKNOWN")
            if state == "ONLINE":
                print(f"Endpoint online after {i * 10}s")
                return status
            time.sleep(10)
        raise TimeoutError(f"Endpoint {endpoint_name} not online after 300s")


with mon.time("ensure_endpoint"):
    ensure_endpoint_exists(vs_endpoint_name)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Create/Sync Indexes

# COMMAND ----------

alerts_table = get_table_path(cfg, "alerts")
ioc_table = get_table_path(cfg, "ioc_entries")
cases_table = get_table_path(cfg, "cases")

ALERT_INDEX = f"{cfg.catalog}.{cfg.schema}.alert_embeddings_vs_index"
IOC_INDEX = f"{cfg.catalog}.{cfg.schema}.ioc_embeddings_vs_index"
CASE_INDEX = f"{cfg.catalog}.{cfg.schema}.case_embeddings_vs_index"


def ensure_index(index_name, source_table, sync_columns):
    """Create a delta sync index if it does not already exist."""
    try:
        index = vsc.get_index(endpoint_name=vs_endpoint_name, index_name=index_name)
        print(f"Index {index_name}: exists")
        return index
    except Exception:
        print(f"Creating index: {index_name}")
        # Ensure embedding column exists
        table_short = source_table.split(".")[-1].strip("`")
        try:
            spark.sql(f"ALTER TABLE {source_table} ADD COLUMNS (embedding ARRAY<FLOAT>)")
        except Exception:
            pass
        index = vsc.create_delta_sync_index(
            endpoint_name=vs_endpoint_name, index_name=index_name,
            source_table_name=f"{cfg.catalog}.{cfg.schema}.{table_short}",
            pipeline_type="TRIGGERED",
            primary_key="id", embedding_dimension=1024,
            embedding_vector_column="embedding", columns_to_sync=sync_columns
        )
        return index


with mon.time("ensure_indexes"):
    ensure_index(ALERT_INDEX, alerts_table, ["id", "title", "description", "severity", "source", "mitre_tactic", "created_at"])
    ensure_index(IOC_INDEX, ioc_table, ["id", "value", "type", "threat_type", "confidence", "source_feed"])
    ensure_index(CASE_INDEX, cases_table, ["id", "title", "description", "severity", "status", "priority"])

# COMMAND ----------

# MAGIC %md
# MAGIC ## Generate Embeddings for New Records

# COMMAND ----------

def generate_embeddings_batch(texts):
    """Generate embeddings in batches using the configured model endpoint."""
    if not texts:
        return []
    results = []
    for i in range(0, len(texts), batch_size):
        batch = texts[i:i + batch_size]
        response = deploy_client.predict(endpoint=embedding_model, inputs={"input": batch})
        for item in response.data:
            results.append(item.embedding)
    return results


def batch_update_embeddings(table_name, rows, embeddings):
    """
    Batch update embeddings using MERGE via temp view instead of per-row f-string UPDATEs.
    Creates a DataFrame of (id, embedding) and merges into the target table.
    """
    if not rows or not embeddings:
        return

    # Build update records
    update_records = []
    for row, emb in zip(rows, embeddings):
        update_records.append({
            "id": row.id,
            "embedding": emb,
        })

    # Create DataFrame with proper schema
    update_schema = StructType([
        StructField("id", StringType(), False),
        StructField("embedding", ArrayType(FloatType()), False),
    ])
    updates_df = spark.createDataFrame(update_records, schema=update_schema)
    updates_df.createOrReplaceTempView("_embedding_updates")

    full_table = get_table_path(cfg, table_name)
    spark.sql(f"""
        MERGE INTO {full_table} AS target
        USING _embedding_updates AS source
        ON target.id = source.id
        WHEN MATCHED THEN UPDATE SET target.embedding = source.embedding
    """)
    spark.catalog.dropTempView("_embedding_updates")

# COMMAND ----------

# MAGIC %md
# MAGIC ### Embed New Alerts

# COMMAND ----------

try:
    cutoff = (datetime.utcnow() - timedelta(hours=lookback_hours)).strftime("%Y-%m-%dT%H:%M:%S")

    alerts_query = (
        qb("alerts")
        .select(["id", "title", "description", "severity", "source", "mitre_tactic"])
        .where_null("embedding")
        .where_gte("created_at", cutoff)
        .limit(1000)
        .build()
    )
    new_alerts = spark.sql(alerts_query.sql).collect()
    print(f"Alerts needing embeddings: {len(new_alerts)}")

    if new_alerts:
        texts = [
            f"[{row.severity}] {row.title}. {row.description or ''}. Source: {row.source or 'unknown'}. MITRE: {row.mitre_tactic or 'unknown'}"
            for row in new_alerts
        ]
        with mon.time("embed_alerts"):
            embeddings = generate_embeddings_batch(texts)
        with mon.time("merge_alert_embeddings"):
            batch_update_embeddings("alerts", new_alerts, embeddings)
        print(f"Embedded {len(new_alerts)} alerts")
    else:
        new_alerts = []

    # COMMAND ----------

    # MAGIC %md
    # MAGIC ### Embed New IOCs

    # COMMAND ----------

    ioc_query = (
        qb("ioc_entries")
        .select(["id", "value", "type", "threat_type", "source_feed"])
        .where_null("embedding")
        .limit(2000)
        .build()
    )
    new_iocs = spark.sql(ioc_query.sql).collect()
    print(f"IOCs needing embeddings: {len(new_iocs)}")

    if new_iocs:
        texts = [
            f"IOC [{row.type}]: {row.value}. Threat: {row.threat_type or 'unknown'}. Feed: {row.source_feed or 'unknown'}"
            for row in new_iocs
        ]
        with mon.time("embed_iocs"):
            embeddings = generate_embeddings_batch(texts)
        with mon.time("merge_ioc_embeddings"):
            batch_update_embeddings("ioc_entries", new_iocs, embeddings)
        print(f"Embedded {len(new_iocs)} IOCs")
    else:
        new_iocs = []

    # COMMAND ----------

    # MAGIC %md
    # MAGIC ### Embed New Cases

    # COMMAND ----------

    cases_query = (
        qb("cases")
        .select(["id", "title", "description", "severity", "priority"])
        .where_null("embedding")
        .limit(500)
        .build()
    )
    new_cases = spark.sql(cases_query.sql).collect()
    print(f"Cases needing embeddings: {len(new_cases)}")

    if new_cases:
        texts = [
            f"[{row.severity}/{row.priority}] {row.title}. {row.description or ''}"
            for row in new_cases
        ]
        with mon.time("embed_cases"):
            embeddings = generate_embeddings_batch(texts)
        with mon.time("merge_case_embeddings"):
            batch_update_embeddings("cases", new_cases, embeddings)
        print(f"Embedded {len(new_cases)} cases")
    else:
        new_cases = []

    # COMMAND ----------

    # MAGIC %md
    # MAGIC ## Trigger Index Sync

    # COMMAND ----------

    with mon.time("index_sync"):
        for index_name in [ALERT_INDEX, IOC_INDEX, CASE_INDEX]:
            try:
                index = vsc.get_index(endpoint_name=vs_endpoint_name, index_name=index_name)
                index.sync()
                print(f"Sync triggered: {index_name}")
            except Exception as e:
                mon.log_warning(f"Sync failed for {index_name}", details=str(e))

    # COMMAND ----------

    # MAGIC %md
    # MAGIC ## Semantic Search Functions (Used by Other Agents)

    # COMMAND ----------

    def search_similar_alerts(query_text, top_k=10, filters=None):
        """Search for semantically similar alerts."""
        index = vsc.get_index(endpoint_name=vs_endpoint_name, index_name=ALERT_INDEX)
        return index.similarity_search(
            query_text=query_text,
            columns=["id", "title", "severity", "source", "mitre_tactic", "created_at"],
            num_results=top_k, filters=filters
        )

    def search_similar_iocs(query_text, top_k=20, filters=None):
        """Search for semantically similar IOCs."""
        index = vsc.get_index(endpoint_name=vs_endpoint_name, index_name=IOC_INDEX)
        return index.similarity_search(
            query_text=query_text,
            columns=["id", "value", "type", "threat_type", "confidence"],
            num_results=top_k, filters=filters
        )

    def search_similar_cases(query_text, top_k=5, filters=None):
        """Search for semantically similar cases."""
        index = vsc.get_index(endpoint_name=vs_endpoint_name, index_name=CASE_INDEX)
        return index.similarity_search(
            query_text=query_text,
            columns=["id", "title", "severity", "status", "priority"],
            num_results=top_k, filters=filters
        )

    # COMMAND ----------

    # MAGIC %md
    # MAGIC ## Update Agent Status and Exit

    # COMMAND ----------

    total_embedded = len(new_alerts) + len(new_iocs) + len(new_cases)

    # Update agent_status via safe MERGE using temp view
    agent_status_df = spark.createDataFrame([{
        "agent_id": "vector_search_index",
        "last_heartbeat": datetime.utcnow(),
        "status": "running",
        "events_processed": total_embedded,
        "alerts_generated": 0,
    }])
    safe_merge(
        spark, agent_status_df, "agent_status",
        merge_keys=["agent_id"],
        catalog=cfg.catalog, schema=cfg.schema,
    )

    mon.log_metric("alerts_embedded", len(new_alerts))
    mon.log_metric("iocs_embedded", len(new_iocs))
    mon.log_metric("cases_embedded", len(new_cases))
    mon.log_metric("total_embedded", total_embedded)
    mon.log_complete(rows_processed=total_embedded)

    result = {
        "status": "completed",
        "alerts_embedded": len(new_alerts),
        "iocs_embedded": len(new_iocs),
        "cases_embedded": len(new_cases),
        "indexes_synced": 3,
    }
    print(json.dumps(result, indent=2))
    dbutils.notebook.exit(json.dumps(result))

except Exception as e:
    mon.log_error(e, context="vector_search_index pipeline")
    result = {"status": "error", "error": str(e)}
    dbutils.notebook.exit(json.dumps(result))
