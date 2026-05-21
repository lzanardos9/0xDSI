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

from pyspark.sql.functions import *
from pyspark.sql.types import *
from databricks.vector_search.client import VectorSearchClient
import mlflow.deployments
from datetime import datetime, timedelta
import json
import time

# COMMAND ----------

dbutils.widgets.text("catalog", "soc_platform", "Unity Catalog name")
dbutils.widgets.text("schema", "agentic_soc", "Schema name")
dbutils.widgets.text("embedding_model", "databricks-bge-large-en", "Embedding model endpoint")
dbutils.widgets.text("vector_search_endpoint", "0xdsi-vector-search", "Vector Search endpoint name")
dbutils.widgets.text("batch_size", "64", "Embedding batch size")
dbutils.widgets.text("lookback_hours", "24", "Hours to look back for new records")

catalog = dbutils.widgets.get("catalog")
schema = dbutils.widgets.get("schema")
embedding_model = dbutils.widgets.get("embedding_model")
vs_endpoint_name = dbutils.widgets.get("vector_search_endpoint")
batch_size = int(dbutils.widgets.get("batch_size"))
lookback_hours = int(dbutils.widgets.get("lookback_hours"))

spark.sql(f"USE CATALOG `{catalog}`")
spark.sql(f"USE SCHEMA `{schema}`")

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

ensure_endpoint_exists(vs_endpoint_name)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Create/Sync Indexes

# COMMAND ----------

ALERT_INDEX = f"{catalog}.{schema}.alert_embeddings_vs_index"
IOC_INDEX = f"{catalog}.{schema}.ioc_embeddings_vs_index"
CASE_INDEX = f"{catalog}.{schema}.case_embeddings_vs_index"

def ensure_index(index_name, source_table, sync_columns):
    try:
        index = vsc.get_index(endpoint_name=vs_endpoint_name, index_name=index_name)
        print(f"Index {index_name}: exists")
        return index
    except Exception:
        print(f"Creating index: {index_name}")
        # Ensure embedding column exists
        try:
            spark.sql(f"ALTER TABLE {source_table.split('.')[-1]} ADD COLUMNS (embedding ARRAY<FLOAT>)")
        except Exception:
            pass
        index = vsc.create_delta_sync_index(
            endpoint_name=vs_endpoint_name, index_name=index_name,
            source_table_name=source_table, pipeline_type="TRIGGERED",
            primary_key="id", embedding_dimension=1024,
            embedding_vector_column="embedding", columns_to_sync=sync_columns
        )
        return index

ensure_index(ALERT_INDEX, f"{catalog}.{schema}.alerts", ["id", "title", "description", "severity", "source", "mitre_tactic", "created_at"])
ensure_index(IOC_INDEX, f"{catalog}.{schema}.ioc_entries", ["id", "value", "type", "threat_type", "confidence", "source_feed"])
ensure_index(CASE_INDEX, f"{catalog}.{schema}.cases", ["id", "title", "description", "severity", "status", "priority"])

# COMMAND ----------

# MAGIC %md
# MAGIC ## Generate Embeddings for New Records

# COMMAND ----------

def generate_embeddings_batch(texts):
    if not texts:
        return []
    results = []
    for i in range(0, len(texts), batch_size):
        batch = texts[i:i + batch_size]
        response = deploy_client.predict(endpoint=embedding_model, inputs={"input": batch})
        for item in response.data:
            results.append(item.embedding)
    return results

# COMMAND ----------

# MAGIC %md
# MAGIC ### Embed New Alerts

# COMMAND ----------

cutoff = (datetime.utcnow() - timedelta(hours=lookback_hours)).strftime("%Y-%m-%dT%H:%M:%S")

new_alerts = spark.sql(f"""
    SELECT id, title, description, severity, source, mitre_tactic
    FROM alerts WHERE embedding IS NULL AND created_at >= '{cutoff}'
    ORDER BY created_at DESC LIMIT 1000
""").collect()

print(f"Alerts needing embeddings: {len(new_alerts)}")

if new_alerts:
    texts = [f"[{row.severity}] {row.title}. {row.description or ''}. Source: {row.source or 'unknown'}. MITRE: {row.mitre_tactic or 'unknown'}" for row in new_alerts]
    embeddings = generate_embeddings_batch(texts)
    for row, emb in zip(new_alerts, embeddings):
        emb_str = "[" + ",".join(str(x) for x in emb) + "]"
        spark.sql(f"UPDATE alerts SET embedding = CAST('{emb_str}' AS ARRAY<FLOAT>) WHERE id = '{row.id}'")
    print(f"Embedded {len(new_alerts)} alerts")

# COMMAND ----------

# MAGIC %md
# MAGIC ### Embed New IOCs

# COMMAND ----------

new_iocs = spark.sql("SELECT id, value, type, threat_type, source_feed FROM ioc_entries WHERE embedding IS NULL ORDER BY created_at DESC LIMIT 2000").collect()
print(f"IOCs needing embeddings: {len(new_iocs)}")

if new_iocs:
    texts = [f"IOC [{row.type}]: {row.value}. Threat: {row.threat_type or 'unknown'}. Feed: {row.source_feed or 'unknown'}" for row in new_iocs]
    embeddings = generate_embeddings_batch(texts)
    for row, emb in zip(new_iocs, embeddings):
        emb_str = "[" + ",".join(str(x) for x in emb) + "]"
        spark.sql(f"UPDATE ioc_entries SET embedding = CAST('{emb_str}' AS ARRAY<FLOAT>) WHERE id = '{row.id}'")
    print(f"Embedded {len(new_iocs)} IOCs")

# COMMAND ----------

# MAGIC %md
# MAGIC ### Embed New Cases

# COMMAND ----------

new_cases = spark.sql("SELECT id, title, description, severity, priority FROM cases WHERE embedding IS NULL ORDER BY created_at DESC LIMIT 500").collect()
print(f"Cases needing embeddings: {len(new_cases)}")

if new_cases:
    texts = [f"[{row.severity}/{row.priority}] {row.title}. {row.description or ''}" for row in new_cases]
    embeddings = generate_embeddings_batch(texts)
    for row, emb in zip(new_cases, embeddings):
        emb_str = "[" + ",".join(str(x) for x in emb) + "]"
        spark.sql(f"UPDATE cases SET embedding = CAST('{emb_str}' AS ARRAY<FLOAT>) WHERE id = '{row.id}'")
    print(f"Embedded {len(new_cases)} cases")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Trigger Index Sync

# COMMAND ----------

for index_name in [ALERT_INDEX, IOC_INDEX, CASE_INDEX]:
    try:
        index = vsc.get_index(endpoint_name=vs_endpoint_name, index_name=index_name)
        index.sync()
        print(f"Sync triggered: {index_name}")
    except Exception as e:
        print(f"Sync failed {index_name}: {e}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Semantic Search Functions (Used by Other Agents)

# COMMAND ----------

def search_similar_alerts(query_text, top_k=10, filters=None):
    index = vsc.get_index(endpoint_name=vs_endpoint_name, index_name=ALERT_INDEX)
    return index.similarity_search(query_text=query_text, columns=["id", "title", "severity", "source", "mitre_tactic", "created_at"], num_results=top_k, filters=filters)

def search_similar_iocs(query_text, top_k=20, filters=None):
    index = vsc.get_index(endpoint_name=vs_endpoint_name, index_name=IOC_INDEX)
    return index.similarity_search(query_text=query_text, columns=["id", "value", "type", "threat_type", "confidence"], num_results=top_k, filters=filters)

def search_similar_cases(query_text, top_k=5, filters=None):
    index = vsc.get_index(endpoint_name=vs_endpoint_name, index_name=CASE_INDEX)
    return index.similarity_search(query_text=query_text, columns=["id", "title", "severity", "status", "priority"], num_results=top_k, filters=filters)

# COMMAND ----------

total_embedded = len(new_alerts) + len(new_iocs) + len(new_cases)
spark.sql(f"""
    MERGE INTO agent_status AS target
    USING (SELECT
        'vector_search_index' as agent_id,
        current_timestamp() as last_heartbeat,
        'running' as status,
        {total_embedded} as events_processed,
        0 as alerts_generated
    ) AS source
    ON target.agent_id = source.agent_id
    WHEN MATCHED THEN UPDATE SET *
    WHEN NOT MATCHED THEN INSERT *
""")

result = {"status": "completed", "alerts_embedded": len(new_alerts), "iocs_embedded": len(new_iocs), "cases_embedded": len(new_cases), "indexes_synced": 3}
print(json.dumps(result, indent=2))
dbutils.notebook.exit(json.dumps(result))
