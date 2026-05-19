# Databricks notebook source
# MAGIC %md
# MAGIC # Agent 10 - Vector Memory Agent
# MAGIC Manages the vector embedding store for semantic similarity search.
# MAGIC Generates embeddings for alerts, events, and threat intel using
# MAGIC Foundation Model Embeddings API. Powers similarity-based threat hunting.

# COMMAND ----------

dbutils.widgets.text("catalog", "soc_platform", "Unity Catalog")
dbutils.widgets.text("schema", "agentic_soc", "Schema")

catalog = dbutils.widgets.get("catalog")
schema = dbutils.widgets.get("schema")
spark.sql(f"USE CATALOG {catalog}")
spark.sql(f"USE SCHEMA {schema}")

# COMMAND ----------

import mlflow.deployments
import json
from datetime import datetime
from pyspark.sql import functions as F
from pyspark.sql.types import ArrayType, FloatType

client = mlflow.deployments.get_deploy_client("databricks")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Generate Embeddings for New Alerts

# COMMAND ----------

unembedded_alerts = spark.sql("""
    SELECT a.id, a.title, a.description, a.severity, a.mitre_tactic,
           a.mitre_technique, a.source_ip, a.dest_ip
    FROM alerts a
    LEFT JOIN alert_embeddings ae ON a.id = ae.alert_id
    WHERE ae.alert_id IS NULL
      AND a.created_at > current_timestamp() - INTERVAL 6 HOURS
    ORDER BY a.created_at DESC
    LIMIT 100
""").collect()

print(f"Found {len(unembedded_alerts)} alerts needing embeddings")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Embedding Generation

# COMMAND ----------

def generate_embedding(text):
    """Generate embedding using Databricks Foundation Model Embeddings."""
    response = client.predict(
        endpoint="databricks-bge-large-en",
        inputs={"input": [text]}
    )
    return response.data[0].embedding

def alert_to_text(alert):
    """Convert alert to semantic text for embedding."""
    return f"{alert.title}. {alert.description}. Tactic: {alert.mitre_tactic}. Technique: {alert.mitre_technique}. Severity: {alert.severity}. Source: {alert.source_ip}. Target: {alert.dest_ip}."

# COMMAND ----------

# MAGIC %md
# MAGIC ## Batch Embed Alerts

# COMMAND ----------

embeddings_data = []
BATCH_SIZE = 20

for i in range(0, len(unembedded_alerts), BATCH_SIZE):
    batch = unembedded_alerts[i:i+BATCH_SIZE]
    texts = [alert_to_text(a) for a in batch]

    try:
        response = client.predict(
            endpoint="databricks-bge-large-en",
            inputs={"input": texts}
        )

        for j, alert in enumerate(batch):
            embeddings_data.append({
                "alert_id": alert.id,
                "embedding": response.data[j].embedding,
                "text_repr": texts[j][:500],
                "embedded_at": datetime.utcnow().isoformat(),
            })
    except Exception as e:
        print(f"Batch {i} failed: {e}")

print(f"Generated {len(embeddings_data)} embeddings")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Store Embeddings in Delta

# COMMAND ----------

if embeddings_data:
    embeddings_df = spark.createDataFrame([
        {
            "alert_id": e["alert_id"],
            "embedding": e["embedding"],
            "text_repr": e["text_repr"],
            "embedded_at": e["embedded_at"],
        }
        for e in embeddings_data
    ])
    embeddings_df.write.mode("append").saveAsTable("alert_embeddings")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Similarity Search Function

# COMMAND ----------

def find_similar_alerts(query_text, top_k=10):
    """Find alerts semantically similar to a query."""
    query_embedding = generate_embedding(query_text)

    # Load all embeddings and compute cosine similarity
    all_embeddings = spark.sql("SELECT alert_id, embedding FROM alert_embeddings").collect()

    import numpy as np

    query_vec = np.array(query_embedding)
    similarities = []

    for row in all_embeddings:
        doc_vec = np.array(row.embedding)
        cosine_sim = np.dot(query_vec, doc_vec) / (np.linalg.norm(query_vec) * np.linalg.norm(doc_vec))
        similarities.append((row.alert_id, float(cosine_sim)))

    similarities.sort(key=lambda x: x[1], reverse=True)
    return similarities[:top_k]

# COMMAND ----------

# MAGIC %md
# MAGIC ## Embed Threat Intel for Cross-Reference

# COMMAND ----------

unembedded_ti = spark.sql("""
    SELECT i.id, i.indicator_type, i.value, i.threat_type, i.tags, i.source
    FROM ioc_entries i
    LEFT JOIN ioc_embeddings ie ON i.id = ie.ioc_id
    WHERE ie.ioc_id IS NULL
      AND i.created_at > current_timestamp() - INTERVAL 24 HOURS
    LIMIT 200
""").collect()

ti_embeddings = []
for i in range(0, len(unembedded_ti), BATCH_SIZE):
    batch = unembedded_ti[i:i+BATCH_SIZE]
    texts = [f"{t.indicator_type}: {t.value}. Type: {t.threat_type}. Tags: {t.tags}. Source: {t.source}" for t in batch]

    try:
        response = client.predict(
            endpoint="databricks-bge-large-en",
            inputs={"input": texts}
        )
        for j, ti in enumerate(batch):
            ti_embeddings.append({
                "ioc_id": ti.id,
                "embedding": response.data[j].embedding,
                "text_repr": texts[j][:500],
                "embedded_at": datetime.utcnow().isoformat(),
            })
    except Exception as e:
        print(f"TI batch failed: {e}")

if ti_embeddings:
    ti_df = spark.createDataFrame(ti_embeddings)
    ti_df.write.mode("append").saveAsTable("ioc_embeddings")

print(f"Embedded {len(ti_embeddings)} threat intel indicators")

# COMMAND ----------

spark.sql("""
    MERGE INTO agent_status AS t
    USING (SELECT 'vector-memory' as agent_id, current_timestamp() as last_run, 'active' as status) AS s
    ON t.agent_id = s.agent_id
    WHEN MATCHED THEN UPDATE SET last_run = s.last_run, status = s.status
    WHEN NOT MATCHED THEN INSERT (agent_id, last_run, status) VALUES (s.agent_id, s.last_run, s.status)
""")
