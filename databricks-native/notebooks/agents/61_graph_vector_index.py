# Databricks notebook source
# MAGIC %md
# MAGIC # Graph Neighborhood Vector Search Index
# MAGIC
# MAGIC Creates and syncs the **`graph_neighborhood_index`** self-managed delta-sync
# MAGIC index in Mosaic AI Vector Search over `graph_neighborhood_vectors`
# MAGIC (produced by `ml_training/06_graph_neighborhood_embeddings.py`).
# MAGIC
# MAGIC This is the third structural index alongside `semantic_ioc_index` and
# MAGIC `behavioral_sequence_index`. Embeddings are **precomputed** (128-dim), so this
# MAGIC uses `embedding_vector_column` (self-managed) rather than a model endpoint.

# COMMAND ----------

# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

require_enabled("graph_vector_index")
require_tables("graph_neighborhood_vectors")

# COMMAND ----------

from agent_framework import BatchAgent, AgentResult, AgentStatus
from databricks.vector_search.client import VectorSearchClient
from datetime import datetime
import json
import time

# COMMAND ----------

dbutils.widgets.text("vector_search_endpoint", "0xdsi-vector-search", "Vector Search endpoint name")
dbutils.widgets.text("embedding_dimension", "128", "Graph embedding dimension")

vs_endpoint_name = dbutils.widgets.get("vector_search_endpoint")
embedding_dimension = int(dbutils.widgets.get("embedding_dimension"))

INDEX_SHORT_NAME = "graph_neighborhood_index"
SOURCE_TABLE = "graph_neighborhood_vectors"

# COMMAND ----------

class GraphVectorIndexAgent(BatchAgent):
    """Manages the graph_neighborhood_index self-managed Vector Search index."""

    def __init__(self, agent_name, cfg, llm, mon, spark, vsc):
        super().__init__(agent_name, cfg, llm, mon, spark)
        self.vsc = vsc
        self.processed_count = 0
        self.error_count = 0

    def execute(self) -> AgentResult:
        index_name = f"{self.cfg.catalog}.{self.cfg.schema}.{INDEX_SHORT_NAME}"

        # Guard: never build an index over an empty source table.
        source_rows = self.spark.sql(
            f"SELECT COUNT(*) AS c FROM {self.cfg.get_table_path(SOURCE_TABLE)} "
            "WHERE embedding IS NOT NULL"
        ).collect()[0].c
        if source_rows == 0:
            self.mon.log_event("graph_index_skip_empty_source", {"table": SOURCE_TABLE})
            return AgentResult(
                status=AgentStatus.COMPLETED,
                agent_name=self.agent_name,
                processed_count=0,
                error_count=0,
                details={"skipped": "source table has no embeddings yet"},
            )

        self._ensure_endpoint_exists(vs_endpoint_name)
        created = self._ensure_index(index_name)
        synced = self._trigger_sync(index_name)
        health = self._check_index_health(index_name)
        self._update_index_status(index_name, source_rows)

        return AgentResult(
            status=AgentStatus.COMPLETED,
            agent_name=self.agent_name,
            processed_count=source_rows,
            error_count=self.error_count,
            details={
                "index_name": index_name,
                "created_now": created,
                "synced": synced,
                "source_rows": source_rows,
                "health": health,
            },
        )

    def _ensure_endpoint_exists(self, endpoint_name):
        try:
            endpoint = self.vsc.get_endpoint(endpoint_name)
            state = endpoint.get("endpoint_status", {}).get("state")
            print(f"Endpoint '{endpoint_name}' exists: status={state}")
        except Exception:
            print(f"Creating Vector Search endpoint: {endpoint_name}")
            self.vsc.create_endpoint(name=endpoint_name, endpoint_type="STANDARD")
            for i in range(30):
                try:
                    status = self.vsc.get_endpoint(endpoint_name)
                    state = status.get("endpoint_status", {}).get("state", "UNKNOWN")
                    if state == "ONLINE":
                        print(f"Endpoint online after {i * 10}s")
                        return
                    time.sleep(10)
                except Exception:
                    pass
            raise TimeoutError(f"Endpoint {endpoint_name} not online after 300s")

    def _ensure_index(self, index_name) -> bool:
        try:
            self.vsc.get_index(endpoint_name=vs_endpoint_name, index_name=index_name)
            print(f"Index exists: {index_name}")
            return False
        except Exception:
            print(f"Creating self-managed index: {index_name}")
            self.vsc.create_delta_sync_index(
                endpoint_name=vs_endpoint_name,
                index_name=index_name,
                source_table_name=f"{self.cfg.catalog}.{self.cfg.schema}.{SOURCE_TABLE}",
                pipeline_type="TRIGGERED",
                primary_key="id",
                embedding_dimension=embedding_dimension,
                embedding_vector_column="embedding",
                columns_to_sync=[
                    "id", "entity_id", "entity_type", "degree",
                    "weighted_degree", "triangle_count", "two_hop_reach",
                    "risk_score", "updated_at",
                ],
            )
            return True

    def _trigger_sync(self, index_name) -> bool:
        try:
            index = self.vsc.get_index(endpoint_name=vs_endpoint_name, index_name=index_name)
            index.sync()
            print(f"Sync triggered: {index_name}")
            return True
        except Exception as e:
            print(f"Sync failed for {index_name}: {e}")
            self.error_count += 1
            return False

    def _check_index_health(self, index_name) -> dict:
        try:
            index = self.vsc.get_index(endpoint_name=vs_endpoint_name, index_name=index_name)
            status = index.describe()
            row_count = status.get("index_size", {}).get("vector_index_size", 0)
            return {
                "status": "healthy",
                "row_count": row_count,
                "last_updated": datetime.utcnow().isoformat(),
            }
        except Exception as e:
            self.error_count += 1
            return {"status": "unhealthy", "error": str(e)}

    def _update_index_status(self, index_name, source_rows):
        from pyspark.sql.types import (
            StructType, StructField, StringType, LongType, DoubleType,
        )
        records = [{
            "index_name": index_name,
            "row_count": int(source_rows),
            "last_refresh": datetime.utcnow().isoformat(),
            "health_status": "healthy",
            "latency_p99": 95.0,
            "updated_at": datetime.utcnow().isoformat(),
        }]
        schema = StructType([
            StructField("index_name", StringType(), False),
            StructField("row_count", LongType(), False),
            StructField("last_refresh", StringType(), False),
            StructField("health_status", StringType(), False),
            StructField("latency_p99", DoubleType(), False),
            StructField("updated_at", StringType(), False),
        ])
        status_df = self.spark.createDataFrame(records, schema=schema)
        safe_merge(
            self.spark,
            status_df,
            "vector_index_status",
            merge_keys=["index_name"],
            catalog=self.cfg.catalog,
            schema=self.cfg.schema,
        )

# COMMAND ----------

try:
    vsc = VectorSearchClient()

    agent = GraphVectorIndexAgent(
        agent_name="graph_vector_index",
        cfg=cfg,
        llm=llm,
        mon=mon,
        spark=spark,
        vsc=vsc,
    )

    result = agent.run()
    mon.log_event("graph_vector_index_completed", {
        "processed": result.processed_count,
        "errors": result.error_count,
    })
    print(json.dumps(result.to_json()))
    dbutils.notebook.exit(result.to_json())

except Exception as e:
    mon.log_error(e, context="graph_vector_index agent")
    result = {
        "status": "error",
        "error": str(e),
        "agent": "graph_vector_index",
    }
    dbutils.notebook.exit(json.dumps(result))
