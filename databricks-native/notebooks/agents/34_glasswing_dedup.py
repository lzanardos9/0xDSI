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

# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

from pyspark.sql.functions import *
from pyspark.sql.types import *
from datetime import datetime, timedelta
import json
import uuid
import numpy as np
from collections import defaultdict
import mlflow.deployments

# COMMAND ----------

# Widget parameters specific to this notebook (bootstrap handles catalog/schema)
dbutils.widgets.text("similarity_threshold", "0.85", "Cosine similarity threshold for clustering")
dbutils.widgets.text("scan_run_id", "", "Optional: filter to specific scan run")
dbutils.widgets.text("embedding_model", "databricks-bge-large-en", "Embedding model endpoint")

similarity_threshold = float(dbutils.widgets.get("similarity_threshold"))
scan_run_id_filter = dbutils.widgets.get("scan_run_id")
embedding_model = dbutils.widgets.get("embedding_model")

now = datetime.utcnow()
run_id = str(uuid.uuid4())

print(f"Dedup run {run_id} | threshold={similarity_threshold} | model={embedding_model}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Load Ingested Findings

# COMMAND ----------

try:
    # Build query safely using QueryBuilder
    findings_query = qb("glasswing_findings").where_eq("status", "ingested")
    if scan_run_id_filter:
        findings_query = findings_query.where_eq("scan_run_id", scan_run_id_filter)
    query = findings_query.build()

    findings_df = spark.sql(query.sql)
    findings_count = findings_df.count()

    if findings_count == 0:
        print("No ingested findings to process. Exiting.")
        mon.log_complete(rows_processed=0)
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

    EMBEDDING_DIM = 1024
    MAX_RETRIES = 3
    RETRY_BACKOFF = [2, 5, 10]  # seconds

    def generate_embeddings(texts: list, batch_size: int = 64) -> tuple:
        """
        Generate embeddings for a list of texts using the configured endpoint.
        Returns (embeddings, valid_indices) - only includes successfully embedded items.
        Failed items are excluded from clustering rather than polluted with fake vectors.
        """
        import time
        client = mlflow.deployments.get_deploy_client("databricks")
        all_embeddings = []
        valid_indices = []
        consecutive_failures = 0

        for i in range(0, len(texts), batch_size):
            batch = texts[i:i + batch_size]
            batch_start_idx = i
            success = False

            # Circuit breaker: if 3 consecutive batch failures, abort remaining
            if consecutive_failures >= 3:
                mon.log_warning(
                    f"Circuit breaker triggered after {consecutive_failures} consecutive failures. "
                    f"Skipping remaining {len(texts) - i} texts."
                )
                break

            for retry in range(MAX_RETRIES):
                try:
                    response = client.predict(
                        endpoint=embedding_model,
                        inputs={"input": batch}
                    )
                    batch_embeddings = [item["embedding"] for item in response["data"]]
                    all_embeddings.extend(batch_embeddings)
                    for j in range(len(batch)):
                        valid_indices.append(batch_start_idx + j)
                    consecutive_failures = 0
                    success = True
                    break
                except Exception as e:
                    if retry < MAX_RETRIES - 1:
                        wait_time = RETRY_BACKOFF[retry]
                        mon.log_warning(
                            f"Embedding batch {i // batch_size} retry {retry + 1}/{MAX_RETRIES}",
                            details=f"{type(e).__name__}: {str(e)[:200]}. Retrying in {wait_time}s"
                        )
                        time.sleep(wait_time)
                    else:
                        mon.log_warning(
                            f"Embedding batch {i // batch_size} FAILED after {MAX_RETRIES} retries",
                            details=f"{type(e).__name__}: {str(e)[:200]}. Skipping {len(batch)} items."
                        )
                        consecutive_failures += 1

        skipped = len(texts) - len(valid_indices)
        if skipped > 0:
            mon.log_event("embeddings_partial", {
                "total_texts": len(texts),
                "embedded": len(valid_indices),
                "skipped": skipped,
                "skip_rate": round(skipped / len(texts) * 100, 1),
            })

        return all_embeddings, valid_indices


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
    with mon.time("generate_embeddings"):
        embeddings, valid_indices = generate_embeddings(embedding_texts)

    if len(embeddings) == 0:
        mon.log_warning("No embeddings generated - all batches failed")
        result = {"status": "embedding_failure", "findings_processed": 0, "root_causes_created": 0}
        dbutils.notebook.exit(json.dumps(result))

    # Filter findings_list to only those with successful embeddings
    if len(valid_indices) < len(findings_list):
        findings_list = [findings_list[i] for i in valid_indices]
        findings_count = len(findings_list)
        print(f"Proceeding with {findings_count} successfully embedded findings "
              f"(skipped {len(embedding_texts) - findings_count} due to embedding failures)")
    else:
        print(f"Generated {len(embeddings)} embedding vectors (dim={len(embeddings[0])})")

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


    with mon.time("clustering"):
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

    with mon.time("persist_root_causes"):
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

        # MERGE root causes to handle re-runs gracefully
        root_causes_table = get_table_path(cfg,"glasswing_root_causes")
        root_causes_df.createOrReplaceTempView("new_root_causes")
        spark.sql(f"""
            MERGE INTO {root_causes_table} AS target
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
        spark.catalog.dropTempView("new_root_causes")
        print(f"Persisted {len(root_causes)} root causes to glasswing_root_causes")

    # COMMAND ----------

    # MAGIC %md
    # MAGIC ## Update Finding Status

    # COMMAND ----------

    with mon.time("update_finding_status"):
        # Batch all finding status updates into a single MERGE operation
        # Build a list of (finding_id, root_cause_group_id) pairs
        finding_updates = []
        for cluster_id, member_indices in clusters.items():
            root_cause_id = root_causes[cluster_id]["id"]
            for idx in member_indices:
                finding_updates.append({
                    "id": findings_list[idx]["id"],
                    "status": "clustered",
                    "root_cause_group_id": root_cause_id,
                })

        if finding_updates:
            update_schema = StructType([
                StructField("id", StringType(), False),
                StructField("status", StringType(), False),
                StructField("root_cause_group_id", StringType(), False),
            ])
            updates_df = spark.createDataFrame(finding_updates, schema=update_schema)
            updates_df.createOrReplaceTempView("_finding_status_updates")

            findings_table = get_table_path(cfg,"glasswing_findings")
            spark.sql(f"""
                MERGE INTO {findings_table} AS target
                USING _finding_status_updates AS source
                ON target.id = source.id
                WHEN MATCHED THEN UPDATE SET
                    target.status = source.status,
                    target.root_cause_group_id = source.root_cause_group_id
            """)
            spark.catalog.dropTempView("_finding_status_updates")

        # Update scan run stats via MERGE
        if scan_run_id_filter:
            scan_update_df = spark.createDataFrame([{
                "id": scan_run_id_filter,
                "root_causes_found": len(root_causes),
                "status": "deduplicated",
            }])
            scan_update_df.createOrReplaceTempView("_scan_run_dedup_update")

            scan_runs_table = get_table_path(cfg,"glasswing_scan_runs")
            spark.sql(f"""
                MERGE INTO {scan_runs_table} AS target
                USING _scan_run_dedup_update AS source
                ON target.id = source.id
                WHEN MATCHED THEN UPDATE SET
                    target.root_causes_found = source.root_causes_found,
                    target.status = source.status
            """)
            spark.catalog.dropTempView("_scan_run_dedup_update")

    print(f"Updated {findings_count} findings with cluster assignments")

    # COMMAND ----------

    # MAGIC %md
    # MAGIC ## Update Agent Status and Exit

    # COMMAND ----------

    # Update agent status via safe_merge
    agent_status_df = spark.createDataFrame([{
        "agent_id": "glasswing_dedup",
        "last_heartbeat": datetime.utcnow(),
        "status": "running",
        "events_processed": findings_count,
        "alerts_generated": len(root_causes),
    }])
    safe_merge(
        spark, agent_status_df, "agent_status",
        merge_keys=["agent_id"],
        catalog=cfg.catalog, schema=cfg.schema,
    )

    mon.log_metric("findings_processed", findings_count)
    mon.log_metric("root_causes_created", len(root_causes))
    mon.log_metric("dedup_ratio", round((1 - len(root_causes) / max(findings_count, 1)) * 100, 1))
    mon.log_complete(rows_processed=findings_count)

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

except Exception as e:
    mon.log_error(e, context="glasswing_dedup pipeline")
    result = {"status": "error", "error": str(e)}
    dbutils.notebook.exit(json.dumps(result))
