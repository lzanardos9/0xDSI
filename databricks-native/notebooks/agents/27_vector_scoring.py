# Databricks notebook source
# MAGIC %md
# MAGIC # Agent 27 - Vector Augmented Scoring Agent
# MAGIC Re-scores alerts using embedding similarity to known attack patterns.
# MAGIC Enhances confidence scores by comparing new alerts to historically
# MAGIC confirmed true positives via cosine similarity.

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

client = mlflow.deployments.get_deploy_client("databricks")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Load Confirmed True Positive Embeddings

# COMMAND ----------

tp_embeddings = spark.sql("""
    SELECT ae.alert_id, ae.embedding, a.mitre_tactic, a.mitre_technique, a.severity
    FROM alert_embeddings ae
    JOIN alerts a ON ae.alert_id = a.id
    JOIN analyst_feedback af ON a.id = af.alert_id
    WHERE af.analyst_verdict = 'true_positive'
    ORDER BY af.feedback_at DESC
    LIMIT 500
""").collect()

print(f"Loaded {len(tp_embeddings)} confirmed TP embeddings as scoring baseline")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Score New Alerts via Similarity

# COMMAND ----------

unscored_alerts = spark.sql("""
    SELECT ae.alert_id, ae.embedding, a.confidence_score as original_confidence
    FROM alert_embeddings ae
    JOIN alerts a ON ae.alert_id = a.id
    WHERE a.vector_score IS NULL
      AND a.created_at > current_timestamp() - INTERVAL 2 HOURS
    LIMIT 100
""").collect()

import numpy as np

scoring_results = []

for alert in unscored_alerts:
    alert_vec = np.array(alert.embedding)
    max_sim = 0.0
    best_match_tactic = ""

    for tp in tp_embeddings:
        tp_vec = np.array(tp.embedding)
        sim = float(np.dot(alert_vec, tp_vec) / (np.linalg.norm(alert_vec) * np.linalg.norm(tp_vec) + 1e-8))
        if sim > max_sim:
            max_sim = sim
            best_match_tactic = tp.mitre_tactic

    # Blend original confidence with vector similarity
    vector_score = (alert.original_confidence * 0.6) + (max_sim * 100 * 0.4)

    scoring_results.append({
        "alert_id": alert.alert_id,
        "vector_score": float(min(100, vector_score)),
        "max_similarity": float(max_sim),
        "best_match_tactic": best_match_tactic,
        "scored_at": datetime.utcnow().isoformat(),
    })

    spark.sql(f"""
        UPDATE alerts SET vector_score = {min(100, vector_score)}
        WHERE id = '{alert.alert_id}'
    """)

print(f"Vector-scored {len(scoring_results)} alerts")

# COMMAND ----------

if scoring_results:
    spark.createDataFrame(scoring_results).write.mode("append").saveAsTable("vector_scoring_history")

spark.sql("""
    MERGE INTO agent_status AS t
    USING (SELECT 'vector-augmented-scoring' as agent_id, current_timestamp() as last_run, 'active' as status) AS s
    ON t.agent_id = s.agent_id
    WHEN MATCHED THEN UPDATE SET last_run = s.last_run, status = s.status
    WHEN NOT MATCHED THEN INSERT (agent_id, last_run, status) VALUES (s.agent_id, s.last_run, s.status)
""")
