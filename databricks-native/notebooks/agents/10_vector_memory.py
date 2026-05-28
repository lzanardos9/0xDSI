# Databricks notebook source
# MAGIC %md
# MAGIC # Agent 10: Vector Search Memory
# MAGIC
# MAGIC **Type:** BatchAgent (scheduled via Databricks Workflows)
# MAGIC
# MAGIC ## Purpose
# MAGIC Embeds alert and event context into vector indices using MLflow embeddings,
# MAGIC maintains a persistent agent memory of previous investigations and known-good patterns,
# MAGIC and enables semantic similarity search for deduplication and pattern matching.
# MAGIC
# MAGIC ## Workflow
# MAGIC 1. Fetch recent alerts and investigation outcomes
# MAGIC 2. Extract and prepare text context for embedding
# MAGIC 3. Call MLflow embeddings endpoint (e.g., BGE or OpenAI embeddings)
# MAGIC 4. Store embeddings in `agent_vector_memory` Delta table with APPROX_NEAREST_NEIGHBORS
# MAGIC 5. Maintain memory lifecycle: archive old, deduplicate similar entries
# MAGIC 6. Provide semantic search interface for other agents
# MAGIC
# MAGIC ## Tools Registered
# MAGIC - None (this agent IS the embedding/search tool for other agents)
# MAGIC
# MAGIC ## Output Table: `agent_vector_memory`
# MAGIC Columns: memory_id, context_type, context_text, embedding (array of floats),
# MAGIC context_metadata (campaign, ioc, etc), similarity_score, agent_name, created_at
# MAGIC
# MAGIC ## Usage by Other Agents
# MAGIC Other agents can search this table: SELECT * FROM memory_table WHERE
# MAGIC APPROX_NEAREST_NEIGHBORS(embedding, query_vector, 10) to find similar past investigations.

# COMMAND ----------

# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

require_enabled("vector_memory_agent")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Imports and Framework Setup

# COMMAND ----------

import json
import time
from typing import Optional, Any, Dict, List
from datetime import datetime, timedelta
import logging
import uuid
import base64

from agent_framework import (
    BatchAgent, AgentResult, AgentStatus, UCTool
)
from pyspark.sql.functions import (
    col, lit, current_timestamp, when, count as spark_count,
    concat, concat_ws, array, struct, collect_list, size
)

logger = logging.getLogger("vector_memory_agent")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Configuration & Parameters

# COMMAND ----------

dbutils.widgets.text("lookback_days", "30", "Days of memories to maintain")
dbutils.widgets.text("embedding_endpoint", "dbfs_embedding", "MLflow embedding endpoint")
dbutils.widgets.text("max_memory_age_days", "90", "Max age before archiving")
dbutils.widgets.text("similarity_threshold", "0.85", "Threshold for deduplication")

lookback_days = int(dbutils.widgets.get("lookback_days"))
embedding_endpoint = dbutils.widgets.get("embedding_endpoint")
max_memory_age_days = int(dbutils.widgets.get("max_memory_age_days"))
similarity_threshold = float(dbutils.widgets.get("similarity_threshold"))

mon.log_event("vector_memory_config", {
    "lookback_days": lookback_days,
    "embedding_endpoint": embedding_endpoint,
    "max_memory_age_days": max_memory_age_days,
})

# COMMAND ----------

# MAGIC %md
# MAGIC ## Delta Table Schema

# COMMAND ----------

memory_table = cfg.get_table_path("agent_vector_memory")
memory_archive_table = cfg.get_table_path("agent_vector_memory_archive")

spark.sql(f"""
CREATE TABLE IF NOT EXISTS {memory_table} (
    memory_id STRING,
    context_type STRING,
    context_text STRING,
    embedding ARRAY<FLOAT>,
    embedding_model STRING,
    context_metadata MAP<STRING, STRING>,
    source_alert_id STRING,
    source_investigation_id STRING,
    relevance_score DOUBLE,
    access_count INT,
    last_accessed TIMESTAMP,
    trace_id STRING,
    agent_name STRING,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
)
USING DELTA
WITH CHANGE DATA FEED
TBLPROPERTIES ('delta.autoOptimize.optimizeWrite' = 'true')
""")

spark.sql(f"""
CREATE TABLE IF NOT EXISTS {memory_archive_table} (
    memory_id STRING,
    context_type STRING,
    context_text STRING,
    embedding ARRAY<FLOAT>,
    embedding_model STRING,
    context_metadata MAP<STRING, STRING>,
    access_count INT,
    archived_at TIMESTAMP,
    archived_reason STRING
)
USING DELTA
TBLPROPERTIES ('delta.autoOptimize.optimizeWrite' = 'true')
""")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Vector Memory Agent Implementation

# COMMAND ----------

class VectorMemoryAgent(BatchAgent):
    """
    Manages semantic embeddings of security investigations and alert contexts
    for agent memory and similarity-based deduplication.
    """

    def __init__(self, agent_name: str, cfg, llm, mon, spark):
        super().__init__(agent_name, cfg, llm, mon, spark)
        self.memory_table = cfg.get_table_path("agent_vector_memory")
        self.memory_archive_table = cfg.get_table_path("agent_vector_memory_archive")
        self.alerts_table = cfg.get_table_path("agent_triage_results")
        self.hunt_table = cfg.get_table_path("threat_hunt_results")
        self.investigations_table = cfg.get_table_path("investigations")
        self.embedding_client = None
        self.embedding_model = "bge-large-en-v1.5"

    def get_tools(self) -> list[UCTool]:
        """Vector memory provides semantic search, not called via tools."""
        return []

    def execute(self) -> AgentResult:
        """Main vector memory workflow."""
        span = self._start_trace("vector_memory_execute")
        processed = 0
        errors = 0

        try:
            # Initialize embedding client
            self._init_embedding_client()

            # Fetch memories needing update
            new_items = self._fetch_new_items(lookback_days)
            if len(new_items) == 0:
                logger.info("No new items to embed")
                return AgentResult(
                    status=AgentStatus.COMPLETED,
                    agent_name=self.agent_name,
                    processed_count=0,
                    details={"reason": "no_new_items"},
                )

            processed = len(new_items)
            logger.info(f"Processing {processed} new items for embedding")

            # Generate embeddings
            embeddings = self._generate_embeddings(new_items)
            if not embeddings:
                logger.warning("Embedding generation failed")
                errors += 1
                return AgentResult(
                    status=AgentStatus.DEGRADED,
                    agent_name=self.agent_name,
                    processed_count=processed,
                    error_count=1,
                    error="Embedding generation failed",
                )

            # Deduplicate similar items
            deduplicated = self._deduplicate_similar(embeddings, similarity_threshold)
            logger.info(f"After dedup: {len(deduplicated)}/{len(embeddings)} items")

            # Store in vector table
            stored = self._store_embeddings(deduplicated)

            # Archive old memories
            archived = self._archive_old_memories(max_memory_age_days)
            logger.info(f"Archived {archived} old memories")

            # Log metrics
            self._log_memory_stats()

            return AgentResult(
                status=AgentStatus.COMPLETED if errors == 0 else AgentStatus.DEGRADED,
                agent_name=self.agent_name,
                processed_count=processed,
                error_count=errors,
                details={
                    "new_items": len(new_items),
                    "embeddings_generated": len(embeddings),
                    "after_dedup": len(deduplicated),
                    "stored": stored,
                    "archived": archived,
                },
            )

        except Exception as e:
            logger.exception("Execute failed")
            raise

    def _init_embedding_client(self):
        """Initialize MLflow embeddings client."""
        try:
            import mlflow.deployments
            self.embedding_client = mlflow.deployments.get_deploy_client("databricks")
            logger.info(f"Initialized embedding client: {embedding_endpoint}")
        except Exception as e:
            logger.error(f"Failed to init embedding client: {e}")
            raise

    def _fetch_new_items(self, days: int) -> List[Dict]:
        """Fetch recent alerts and investigations not yet embedded."""
        items = []

        try:
            # Fetch recent triaged alerts
            alert_results = spark.sql(f"""
                SELECT
                    alert_id as source_id,
                    'alert' as context_type,
                    CONCAT(event_type, ': ', reasoning) as context_text,
                    MAP('severity', severity, 'classification', classification) as metadata,
                    triaged_at as created_at
                FROM {self.alerts_table}
                WHERE triaged_at > current_timestamp() - INTERVAL {days} DAYS
                  AND alert_id NOT IN (SELECT source_alert_id FROM {self.memory_table} WHERE source_alert_id IS NOT NULL)
                ORDER BY triaged_at DESC
                LIMIT 500
            """).collect()

            for row in alert_results:
                items.append({
                    "source_id": row.source_id,
                    "context_type": row.context_type,
                    "context_text": row.context_text,
                    "metadata": row.metadata,
                    "created_at": row.created_at,
                })

            # Fetch hunt results
            hunt_results = spark.sql(f"""
                SELECT
                    hunt_id as source_id,
                    'hunt' as context_type,
                    CONCAT(hunt_type, ': ', hypothesis, ' - ', reasoning) as context_text,
                    MAP('hunt_type', hunt_type, 'confirmed', CAST(confirmed AS STRING)) as metadata,
                    created_at
                FROM {self.hunt_table}
                WHERE created_at > current_timestamp() - INTERVAL {days} DAYS
                  AND hunt_id NOT IN (SELECT source_investigation_id FROM {self.memory_table} WHERE source_investigation_id IS NOT NULL)
                ORDER BY created_at DESC
                LIMIT 500
            """).collect()

            for row in hunt_results:
                items.append({
                    "source_id": row.source_id,
                    "context_type": row.context_type,
                    "context_text": row.context_text,
                    "metadata": row.metadata,
                    "created_at": row.created_at,
                })

            logger.info(f"Fetched {len(items)} new items for embedding")

        except Exception as e:
            logger.error(f"Failed to fetch new items: {e}")

        return items

    def _generate_embeddings(self, items: List[Dict]) -> List[Dict]:
        """Generate embeddings for items using MLflow endpoint."""
        if not items or not self.embedding_client:
            return []

        embeddings = []

        try:
            # Batch embed texts
            texts = [item["context_text"][:512] for item in items]  # Truncate to 512 chars

            logger.info(f"Embedding {len(texts)} texts via {embedding_endpoint}")

            # Call MLflow embeddings endpoint
            response = self.embedding_client.predict(
                endpoint=embedding_endpoint,
                inputs={"input": texts},
            )

            # Extract embeddings from response
            if "data" in response and isinstance(response["data"], list):
                for i, item in enumerate(items):
                    if i < len(response["data"]):
                        embedding_data = response["data"][i]
                        if isinstance(embedding_data, dict) and "embedding" in embedding_data:
                            vec = embedding_data["embedding"]
                        elif isinstance(embedding_data, list):
                            vec = embedding_data
                        else:
                            vec = None

                        if vec:
                            item["embedding"] = vec
                            item["embedding_model"] = self.embedding_model
                            embeddings.append(item)

            logger.info(f"Generated {len(embeddings)} embeddings")

        except Exception as e:
            logger.error(f"Embedding generation failed: {e}")

        return embeddings

    def _deduplicate_similar(self, embeddings: List[Dict], threshold: float) -> List[Dict]:
        """Remove near-duplicate items based on embedding similarity."""
        if len(embeddings) < 2:
            return embeddings

        deduplicated = []
        seen_indices = set()

        try:
            for i, item_i in enumerate(embeddings):
                if i in seen_indices:
                    continue

                deduplicated.append(item_i)
                seen_indices.add(i)

                # Check similarity with remaining items
                if "embedding" in item_i:
                    vec_i = item_i["embedding"]
                    for j in range(i + 1, len(embeddings)):
                        if j not in seen_indices:
                            item_j = embeddings[j]
                            if "embedding" in item_j:
                                vec_j = item_j["embedding"]
                                sim = self._cosine_similarity(vec_i, vec_j)
                                if sim > threshold:
                                    logger.debug(f"Dedup: Items {i},{j} similar ({sim:.3f})")
                                    seen_indices.add(j)

        except Exception as e:
            logger.warning(f"Deduplication failed: {e}")
            deduplicated = embeddings

        return deduplicated

    def _cosine_similarity(self, vec_a: List[float], vec_b: List[float]) -> float:
        """Compute cosine similarity between two vectors."""
        if len(vec_a) != len(vec_b):
            return 0.0

        dot_product = sum(a * b for a, b in zip(vec_a, vec_b))
        mag_a = sum(x ** 2 for x in vec_a) ** 0.5
        mag_b = sum(x ** 2 for x in vec_b) ** 0.5

        if mag_a == 0 or mag_b == 0:
            return 0.0

        return dot_product / (mag_a * mag_b)

    def _store_embeddings(self, items: List[Dict]) -> int:
        """Store embeddings in vector memory table."""
        if not items:
            return 0

        try:
            rows = []
            for item in items:
                rows.append({
                    "memory_id": str(uuid.uuid4()),
                    "context_type": item["context_type"],
                    "context_text": item["context_text"],
                    "embedding": item.get("embedding", []),
                    "embedding_model": item.get("embedding_model", self.embedding_model),
                    "context_metadata": item.get("metadata", {}),
                    "source_alert_id": item["source_id"] if item["context_type"] == "alert" else None,
                    "source_investigation_id": item["source_id"] if item["context_type"] != "alert" else None,
                    "relevance_score": 1.0,
                    "access_count": 0,
                    "last_accessed": datetime.now(),
                    "trace_id": self.agent_name,
                    "agent_name": self.agent_name,
                    "created_at": datetime.now(),
                    "updated_at": datetime.now(),
                })

            df = spark.createDataFrame(rows)
            safe_append(df, self.memory_table, idempotency_key="memory_id")

            logger.info(f"Stored {len(rows)} embeddings")
            return len(rows)

        except Exception as e:
            logger.error(f"Failed to store embeddings: {e}")
            return 0

    def _archive_old_memories(self, max_age_days: int) -> int:
        """Archive old memories beyond retention period."""
        try:
            # Find old memories
            old_results = spark.sql(f"""
                SELECT *
                FROM {self.memory_table}
                WHERE created_at < current_timestamp() - INTERVAL {max_age_days} DAYS
            """).collect()

            if len(old_results) == 0:
                return 0

            # Move to archive
            archive_rows = []
            for row in old_results:
                archive_rows.append({
                    "memory_id": row.memory_id,
                    "context_type": row.context_type,
                    "context_text": row.context_text,
                    "embedding": row.embedding,
                    "embedding_model": row.embedding_model,
                    "context_metadata": row.context_metadata,
                    "access_count": row.access_count,
                    "archived_at": datetime.now(),
                    "archived_reason": "retention_expired",
                })

            # Delete from active table
            spark.sql(f"""
                DELETE FROM {self.memory_table}
                WHERE memory_id IN ({','.join(repr(r['memory_id']) for r in old_results)})
            """)

            # Insert into archive
            if archive_rows:
                df = spark.createDataFrame(archive_rows)
                safe_append(df, self.memory_archive_table, idempotency_key="memory_id")

            logger.info(f"Archived {len(old_results)} old memories")
            return len(old_results)

        except Exception as e:
            logger.warning(f"Archival failed: {e}")
            return 0

    def _log_memory_stats(self):
        """Log memory statistics to monitoring."""
        try:
            stats = spark.sql(f"""
                SELECT
                    COUNT(*) as total_memories,
                    COUNT(DISTINCT context_type) as context_types,
                    SUM(access_count) as total_accesses,
                    MAX(last_accessed) as most_recent_access
                FROM {self.memory_table}
            """).collect()

            if stats:
                row = stats[0]
                mon.log_event("vector_memory_stats", {
                    "total_memories": row.total_memories,
                    "context_types": row.context_types,
                    "total_accesses": row.total_accesses or 0,
                })

        except Exception as e:
            logger.warning(f"Stats logging failed: {e}")


# COMMAND ----------

# MAGIC %md
# MAGIC ## Agent Execution

# COMMAND ----------

try:
    import mlflow
    mlflow.set_experiment(f"/0xDSI/agents/vector_memory")
except Exception as e:
    logger.warning(f"MLflow unavailable: {e}")

# Create and configure agent
agent = VectorMemoryAgent("vector_memory", cfg, llm, mon, spark)

# Execute
result = agent.run()

# COMMAND ----------

# MAGIC %md
# MAGIC ## Results Summary

# COMMAND ----------

mon.log_event("vector_memory_complete", {
    "status": result.status.value,
    "processed": result.processed_count,
    "errors": result.error_count,
    "duration": result.duration_seconds,
})

logger.info(f"Vector Memory: {result.to_json()}")
dbutils.notebook.exit(result.to_json())
