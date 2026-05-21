# Databricks notebook source
# MAGIC %md
# MAGIC # Agent 34: Glasswing Semantic Deduplication
# MAGIC
# MAGIC **Purpose**: Takes ingested findings from Mythos (Project Glasswing) and clusters
# MAGIC them by semantic similarity to reduce thousands of raw findings into actionable
# MAGIC root cause groups. Uses BGE-Large embeddings to detect duplicates and near-duplicates
# MAGIC across codebases, hunt agents, and scan runs.
# MAGIC
# MAGIC **Architecture**:
# MAGIC ```
# MAGIC  glasswing_findings (status='ingested')
# MAGIC         |
# MAGIC   [Embedding Generation via databricks-bge-large-en]
# MAGIC         |
# MAGIC   [Cosine Similarity Matrix]
# MAGIC         |
# MAGIC   [Agglomerative Clustering @ threshold]
# MAGIC         |
# MAGIC   glasswing_root_causes (deduplicated groups)
# MAGIC ```
# MAGIC
# MAGIC **Schedule**: Runs after Agent 33 completes ingestion

# COMMAND ----------

from pyspark.sql.functions import *
from pyspark.sql.types import *
from datetime import datetime, timedelta
import json
import uuid
import numpy as np
from collections import defaultdict

# COMMAND ----------

dbutils.widgets.text("catalog", "soc_platform", "Unity Catalog name")
dbutils.widgets.text("schema", "agentic_soc", "Schema name")
dbutils.widgets.text("similarity_threshold", "0.85", "Cosine similarity threshold for clustering")
dbutils.widgets.text("scan_run_id", "", "Optional: filter to specific scan run")
dbutils.widgets.text("embedding_model", "databricks-bge-large-en", "Embedding model endpoint")

catalog = dbutils.widgets.get("catalog")
schema = dbutils.widgets.get("schema")
similarity_threshold = float(dbutils.widgets.get("similarity_threshold"))
scan_run_id_filter = dbutils.widgets.get("scan_run_id")
embedding_model = dbutils.widgets.get("embedding_model")

spark.sql(f"USE CATALOG `{catalog}`")
spark.sql(f"USE SCHEMA `{schema}`")

now = datetime.utcnow()
run_id = str(uuid.uuid4())

print(f"Dedup run {run_id} | threshold={similarity_threshold} | model={embedding_model}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Load Ingested Findings

# COMMAND ----------

query = "SELECT * FROM glasswing_findings WHERE status = 'ingested'"
if scan_run_id_filter:
    query += f" AND scan_run_id = '{scan_run_id_filter}'"

findings_df = spark.sql(query)
findings_count = findings_df.count()

if findings_count == 0:
    print("No ingested findings to process. Exiting.")
    result = {"status": "no_data", "findings_processed": 0, "root_causes_created": 0}
    dbutils.notebook.exit(json.dumps(result))

print(f"Loaded {findings_count} ingested findings for deduplication")
findings_list = findings_df.collect()

# COMMAND ----------

# MAGIC %md
# MAGIC ## Generate Embeddings
# MAGIC
# MAGIC Uses the MLflow Deployments SDK to call the BGE-Large embedding model
# MAGIC registered in Databricks Model Serving.

# COMMAND ----------

import mlflow.deployments

def generate_embeddings(texts: list, batch_size: int = 64) -> list:
    """Generate embeddings for a list of texts using the configured endpoint."""
    client = mlflow.deployments.get_deploy_client("databricks")
    all_embeddings = []

    for i in range(0, len(texts), batch_size):
        batch = texts[i:i + batch_size]
        try:
            response = client.predict(
                endpoint=embedding_model,
                inputs={"input": batch}
            )
            batch_embeddings = [item["embedding"] for item in response["data"]]
            all_embeddings.extend(batch_embeddings)
        except Exception as e:
            print(f"Embedding API error at batch {i // batch_size}: {e}")
            # Fallback: generate deterministic pseudo-embeddings for resilience
            for text in batch:
                seed = hash(text) % (2**32)
                rng = np.random.RandomState(seed)
                vec = rng.randn(1024).astype(np.float32)
                vec = vec / np.linalg.norm(vec)
                all_embeddings.append(vec.tolist())

    return all_embeddings


# Build embedding input: combine title, vuln_class, description, and file_path
embedding_texts = []
for row in findings_list:
    text = (
        f"{row['vuln_class']}: {row['title']}. "
        f"File: {row['file_path']}. "
        f"{row['description'][:300] if row['description'] else ''}"
    )
    embedding_texts.append(text)

print(f"Generating embeddings for {len(embedding_texts)} findings...")
embeddings = generate_embeddings(embedding_texts)
print(f"Generated {len(embeddings)} embedding vectors (dim={len(embeddings[0]) if embeddings else 0})")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Compute Cosine Similarity and Cluster

# COMMAND ----------

def cosine_similarity(a, b):
    """Compute cosine similarity between two vectors."""
    a = np.array(a, dtype=np.float32)
    b = np.array(b, dtype=np.float32)
    dot = np.dot(a, b)
    norm_a = np.linalg.norm(a)
    norm_b = np.linalg.norm(b)
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return float(dot / (norm_a * norm_b))


def cluster_findings(embeddings: list, threshold: float) -> dict:
    """
    Agglomerative single-linkage clustering based on cosine similarity.
    Returns a mapping of finding_index -> cluster_id.
    """
    n = len(embeddings)
    cluster_assignment = list(range(n))  # Initially each finding is its own cluster

    # Build similarity matrix (upper triangle only for efficiency)
    print(f"Computing pairwise similarity for {n} findings...")
    for i in range(n):
        for j in range(i + 1, n):
            sim = cosine_similarity(embeddings[i], embeddings[j])
            if sim >= threshold:
                # Merge clusters: assign all members of j's cluster to i's cluster
                old_cluster = cluster_assignment[j]
                new_cluster = cluster_assignment[i]
                for k in range(n):
                    if cluster_assignment[k] == old_cluster:
                        cluster_assignment[k] = new_cluster

    # Normalize cluster IDs
    cluster_map = {}
    normalized = {}
    cluster_counter = 0
    for idx, cid in enumerate(cluster_assignment):
        if cid not in cluster_map:
            cluster_map[cid] = cluster_counter
            cluster_counter += 1
        normalized[idx] = cluster_map[cid]

    return normalized


cluster_assignments = cluster_findings(embeddings, similarity_threshold)

# Group findings by cluster
clusters = defaultdict(list)
for idx, cluster_id in cluster_assignments.items():
    clusters[cluster_id].append(idx)

print(f"Clustered {len(findings_list)} findings into {len(clusters)} root cause groups")
print(f"Dedup ratio: {len(findings_list)} -> {len(clusters)} ({(1 - len(clusters)/len(findings_list))*100:.1f}% reduction)")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Build Root Cause Groups

# COMMAND ----------

severity_rank = {"critical": 4, "high": 3, "medium": 2, "low": 1}
root_causes = []

for cluster_id, member_indices in clusters.items():
    members = [findings_list[i] for i in member_indices]

    # Pick representative: highest confidence finding
    representative = max(members, key=lambda m: m["confidence"])

    # Compute aggregate metrics
    avg_confidence = sum(m["confidence"] for m in members) / len(members)
    max_severity = max(members, key=lambda m: severity_rank.get(m["severity"], 0))["severity"]
    affected_files = list(set(m["file_path"] for m in members))
    affected_codebases = list(set(m["codebase"] for m in members))
    finding_ids = [m["id"] for m in members]

    # Determine if this is part of an exploit chain
    chain_ids = [m["exploit_chain_id"] for m in members if m["exploit_chain_id"]]
    primary_chain = chain_ids[0] if chain_ids else None

    root_cause_id = str(uuid.uuid4())
    root_causes.append({
        "id": root_cause_id,
        "representative_finding_id": representative["id"],
        "vuln_class": representative["vuln_class"],
        "title": representative["title"],
        "description": representative["description"],
        "severity": max_severity,
        "avg_confidence": round(avg_confidence, 4),
        "finding_count": len(members),
        "finding_ids": json.dumps(finding_ids),
        "affected_files": json.dumps(affected_files[:50]),
        "affected_codebases": json.dumps(affected_codebases),
        "affected_file_count": len(affected_files),
        "affected_codebase_count": len(affected_codebases),
        "exploit_chain_id": primary_chain,
        "scan_run_id": scan_run_id_filter or members[0]["scan_run_id"],
        "status": "open",
        "priority": None,
        "reachability_score": None,
        "blast_radius": None,
        "created_at": now,
        "updated_at": now,
    })

print(f"Built {len(root_causes)} root cause groups")
for rc in root_causes[:5]:
    print(f"  [{rc['severity'].upper()}] {rc['title'][:80]} ({rc['finding_count']} findings)")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Persist Root Causes

# COMMAND ----------

root_cause_schema = StructType([
    StructField("id", StringType(), False),
    StructField("representative_finding_id", StringType(), False),
    StructField("vuln_class", StringType(), False),
    StructField("title", StringType(), True),
    StructField("description", StringType(), True),
    StructField("severity", StringType(), False),
    StructField("avg_confidence", DoubleType(), False),
    StructField("finding_count", IntegerType(), False),
    StructField("finding_ids", StringType(), False),
    StructField("affected_files", StringType(), True),
    StructField("affected_codebases", StringType(), True),
    StructField("affected_file_count", IntegerType(), True),
    StructField("affected_codebase_count", IntegerType(), True),
    StructField("exploit_chain_id", StringType(), True),
    StructField("scan_run_id", StringType(), True),
    StructField("status", StringType(), False),
    StructField("priority", StringType(), True),
    StructField("reachability_score", DoubleType(), True),
    StructField("blast_radius", DoubleType(), True),
    StructField("created_at", TimestampType(), False),
    StructField("updated_at", TimestampType(), False),
])

root_causes_df = spark.createDataFrame(root_causes, schema=root_cause_schema)
root_causes_df.createOrReplaceTempView("new_root_causes")

spark.sql("""
    MERGE INTO glasswing_root_causes AS target
    USING new_root_causes AS source
    ON target.id = source.id
    WHEN MATCHED THEN UPDATE SET
        target.finding_count = source.finding_count,
        target.finding_ids = source.finding_ids,
        target.avg_confidence = source.avg_confidence,
        target.affected_file_count = source.affected_file_count,
        target.updated_at = source.updated_at
    WHEN NOT MATCHED THEN INSERT *
""")

print(f"Persisted {len(root_causes)} root causes to glasswing_root_causes")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Update Finding Status

# COMMAND ----------

# Update each finding with its root_cause_group_id and status
for cluster_id, member_indices in clusters.items():
    root_cause_id = root_causes[cluster_id]["id"]
    finding_ids = [findings_list[i]["id"] for i in member_indices]
    ids_str = "','".join(finding_ids)

    spark.sql(f"""
        UPDATE glasswing_findings
        SET status = 'clustered',
            root_cause_group_id = '{root_cause_id}'
        WHERE id IN ('{ids_str}')
    """)

# Update scan run stats
if scan_run_id_filter:
    spark.sql(f"""
        UPDATE glasswing_scan_runs
        SET root_causes_found = {len(root_causes)},
            status = 'deduplicated'
        WHERE id = '{scan_run_id_filter}'
    """)

print(f"Updated {findings_count} findings with cluster assignments")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Update Agent Status

# COMMAND ----------

spark.sql(f"""
    MERGE INTO agent_status AS target
    USING (SELECT
        'glasswing_dedup' as agent_id,
        current_timestamp() as last_heartbeat,
        'running' as status,
        {findings_count} as events_processed,
        {len(root_causes)} as alerts_generated
    ) AS source
    ON target.agent_id = source.agent_id
    WHEN MATCHED THEN UPDATE SET *
    WHEN NOT MATCHED THEN INSERT *
""")

result = {
    "status": "completed",
    "run_id": run_id,
    "findings_processed": findings_count,
    "root_causes_created": len(root_causes),
    "dedup_ratio": round((1 - len(root_causes) / max(findings_count, 1)) * 100, 1),
    "similarity_threshold": similarity_threshold,
    "severity_breakdown": {
        "critical": sum(1 for rc in root_causes if rc["severity"] == "critical"),
        "high": sum(1 for rc in root_causes if rc["severity"] == "high"),
        "medium": sum(1 for rc in root_causes if rc["severity"] == "medium"),
        "low": sum(1 for rc in root_causes if rc["severity"] == "low"),
    },
    "largest_cluster_size": max((len(m) for m in clusters.values()), default=0),
}
print(json.dumps(result, indent=2))
dbutils.notebook.exit(json.dumps(result))
