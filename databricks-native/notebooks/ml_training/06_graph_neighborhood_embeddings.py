# Databricks notebook source
# MAGIC %md
# MAGIC # Graph Neighborhood Embeddings
# MAGIC
# MAGIC Builds the entity interaction graph from `events`, extracts 1-hop / 2-hop
# MAGIC structural features per entity, and encodes each entity's neighborhood
# MAGIC topology into a **128-dim vector** written to a Delta source table.
# MAGIC
# MAGIC This is the producer for the `graph_neighborhood_index` Vector Search index
# MAGIC (built by `agents/61_graph_vector_index.py`). Vectors are an *augmentation*
# MAGIC to correlation, never a replacement.
# MAGIC
# MAGIC Approach (Tier 1, databricks-native, dependency-light):
# MAGIC  - Entity graph built with pure Spark DataFrame joins (no GraphFrames
# MAGIC    dependency required; falls back cleanly on serverless clusters).
# MAGIC  - Structural features: in/out/weighted degree, fan-out ratio, triangle
# MAGIC    count, clustering coefficient, 2-hop reach, neighbor degree/risk stats,
# MAGIC    entity-type one-hot, recency.
# MAGIC  - A **deterministic** random projection (fixed seed, Johnson-Lindenstrauss)
# MAGIC    maps the structural feature vector into 128 dims and L2-normalizes it, so
# MAGIC    cosine similarity in the index reflects neighborhood similarity and stays
# MAGIC    stable across runs.

# COMMAND ----------

# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

import json
from datetime import datetime

import numpy as np
import mlflow
from pyspark.sql import functions as F
from pyspark.sql.types import ArrayType, FloatType

# COMMAND ----------

dbutils.widgets.text("lookback_hours", "24", "Graph Lookback Window (hours)")
dbutils.widgets.text("embedding_dim", "128", "Embedding Dimension")
dbutils.widgets.text("max_degree_for_triangles", "200", "Skip triangle enum above this degree")
dbutils.widgets.text("min_degree", "1", "Minimum degree to embed an entity")

lookback_hours = int(dbutils.widgets.get("lookback_hours"))
embedding_dim = int(dbutils.widgets.get("embedding_dim"))
max_degree_for_triangles = int(dbutils.widgets.get("max_degree_for_triangles"))
min_degree = int(dbutils.widgets.get("min_degree"))

# The projection seed MUST stay constant across runs, otherwise embeddings from
# different runs are not comparable and the ANN index becomes meaningless.
PROJECTION_SEED = 20240517
NUM_STRUCTURAL_FEATURES = 24

require_tables("events")

TARGET_TABLE = "graph_neighborhood_vectors"

# COMMAND ----------

result = {
    "notebook": "06_graph_neighborhood_embeddings",
    "status": "success",
    "started_at": datetime.utcnow().isoformat(),
    "lookback_hours": lookback_hours,
    "embedding_dim": embedding_dim,
}

try:
    # ------------------------------------------------------------------
    # 1. Build the undirected entity edge list from events
    #    Entities: source_ip, dest_ip, user_id, hostname.
    #    An event connects the entities that co-occur within it.
    # ------------------------------------------------------------------
    with mon.time("build_edges"):
        events = spark.sql(f"""
            SELECT source_ip, dest_ip, user_id, hostname, event_type, severity, timestamp
            FROM {cfg.get_table_path("events")}
            WHERE timestamp >= current_timestamp() - INTERVAL {lookback_hours} HOURS
        """)

        # Numeric severity for risk features.
        sev = F.when(F.lower(F.col("severity")) == "critical", F.lit(1.0)) \
            .when(F.lower(F.col("severity")) == "high", F.lit(0.75)) \
            .when(F.lower(F.col("severity")) == "medium", F.lit(0.5)) \
            .when(F.lower(F.col("severity")) == "low", F.lit(0.25)) \
            .otherwise(F.lit(0.1))
        events = events.withColumn("sev_num", sev)

        # Typed entity endpoints: (id, type) pairs present on each event row.
        def typed(colname, tname):
            return (
                events
                .where(F.col(colname).isNotNull() & (F.col(colname) != ""))
                .select(
                    F.concat(F.lit(f"{tname}:"), F.col(colname)).alias("node"),
                    F.lit(tname).alias("node_type"),
                    F.col("event_type"),
                    F.col("sev_num"),
                    F.col("timestamp"),
                    F.monotonically_increasing_id().alias("_row"),
                )
            )

        # Rebuild per-row endpoints keyed by event row so we can pair them.
        endpoints = (
            events
            .withColumn("_row", F.monotonically_increasing_id())
            .select(
                "_row", "event_type", "sev_num", "timestamp",
                F.array(
                    F.when(F.col("source_ip").isNotNull() & (F.col("source_ip") != ""),
                           F.concat(F.lit("ip:"), F.col("source_ip"))),
                    F.when(F.col("dest_ip").isNotNull() & (F.col("dest_ip") != ""),
                           F.concat(F.lit("ip:"), F.col("dest_ip"))),
                    F.when(F.col("user_id").isNotNull() & (F.col("user_id") != ""),
                           F.concat(F.lit("user:"), F.col("user_id"))),
                    F.when(F.col("hostname").isNotNull() & (F.col("hostname") != ""),
                           F.concat(F.lit("host:"), F.col("hostname"))),
                ).alias("nodes"),
            )
            .withColumn("nodes", F.array_distinct(F.filter(F.col("nodes"), lambda x: x.isNotNull())))
        )

        # Explode into directed pairs (src < dst) to form undirected edges.
        pair = (
            endpoints
            .select("_row", "event_type", "sev_num", "timestamp",
                    F.explode("nodes").alias("a"))
            .join(
                endpoints.select("_row", F.explode("nodes").alias("b")),
                on="_row", how="inner",
            )
            .where(F.col("a") < F.col("b"))
        )

        edges = (
            pair.groupBy("a", "b")
            .agg(
                F.count(F.lit(1)).alias("weight"),
                F.max("sev_num").alias("edge_risk"),
                F.countDistinct("event_type").alias("edge_type_diversity"),
                F.max("timestamp").alias("last_seen"),
            )
        )
        edges.cache()
        edge_count = edges.count()
        mon.log_event("edges_built", {"edge_count": edge_count})

    if edge_count == 0:
        # Real-event safety: an empty window is not an error. Exit clean so the
        # downstream index keeps its last-good state.
        result["status"] = "no_data"
        result["entities_embedded"] = 0
        mon.log_complete(result)
        dbutils.notebook.exit(json.dumps(result))

    # ------------------------------------------------------------------
    # 2. Undirected adjacency + per-node degree / neighbor statistics
    # ------------------------------------------------------------------
    with mon.time("node_features"):
        adj = (
            edges.select(F.col("a").alias("node"), F.col("b").alias("neighbor"),
                         "weight", "edge_risk", "edge_type_diversity", "last_seen")
            .union(edges.select(F.col("b").alias("node"), F.col("a").alias("neighbor"),
                                "weight", "edge_risk", "edge_type_diversity", "last_seen"))
        ).cache()

        deg = (
            adj.groupBy("node")
            .agg(
                F.countDistinct("neighbor").alias("degree"),
                F.sum("weight").alias("weighted_degree"),
                F.max("edge_risk").alias("own_risk"),
                F.avg("edge_risk").alias("mean_edge_risk"),
                F.max("edge_type_diversity").alias("edge_type_diversity"),
                F.max("last_seen").alias("last_seen"),
            )
        )

        # Neighbor-of-neighbor stats (1-hop aggregation of neighbor degrees/risk).
        neigh_stats = (
            adj.join(deg.select(F.col("node").alias("neighbor"),
                                F.col("degree").alias("n_degree"),
                                F.col("own_risk").alias("n_risk")),
                     on="neighbor", how="left")
            .groupBy("node")
            .agg(
                F.avg("n_degree").alias("neighbor_mean_degree"),
                F.max("n_degree").alias("neighbor_max_degree"),
                F.avg("n_risk").alias("neighbor_mean_risk"),
                F.max("n_risk").alias("neighbor_max_risk"),
            )
        )

        # 2-hop reach: distinct nodes reachable in exactly two hops.
        two_hop = (
            adj.select("node", "neighbor")
            .join(adj.select(F.col("node").alias("neighbor"),
                             F.col("neighbor").alias("hop2")),
                  on="neighbor", how="inner")
            .where(F.col("node") != F.col("hop2"))
            .groupBy("node")
            .agg(F.countDistinct("hop2").alias("two_hop_reach"))
        )

    # ------------------------------------------------------------------
    # 3. Triangle count / clustering coefficient (degree-capped for safety)
    # ------------------------------------------------------------------
    with mon.time("triangles"):
        safe_nodes = deg.where(F.col("degree") <= max_degree_for_triangles).select("node")
        safe_adj = adj.join(safe_nodes, on="node", how="inner").select("node", "neighbor")

        # For node v: count neighbor pairs (a,b) that are themselves connected.
        tri = (
            safe_adj.alias("e1")
            .join(safe_adj.alias("e2"),
                  (F.col("e1.node") == F.col("e2.node")) &
                  (F.col("e1.neighbor") < F.col("e2.neighbor")))
            .join(edges.alias("e3"),
                  (F.col("e1.neighbor") == F.col("e3.a")) &
                  (F.col("e2.neighbor") == F.col("e3.b")))
            .groupBy(F.col("e1.node").alias("node"))
            .agg(F.count(F.lit(1)).alias("triangle_count"))
        )

    # ------------------------------------------------------------------
    # 4. Assemble the ordered structural feature vector
    # ------------------------------------------------------------------
    with mon.time("assemble_features"):
        feats = (
            deg
            .join(neigh_stats, on="node", how="left")
            .join(two_hop, on="node", how="left")
            .join(tri, on="node", how="left")
            .where(F.col("degree") >= min_degree)
            .fillna(0.0)
            .withColumn("node_type", F.split(F.col("node"), ":").getItem(0))
            .withColumn("entity_id", F.expr("substring(node, instr(node, ':') + 1)"))
        )

        max_possible_tri = (F.col("degree") * (F.col("degree") - 1) / 2)
        clustering = F.when(max_possible_tri > 0,
                            F.col("triangle_count") / max_possible_tri).otherwise(F.lit(0.0))
        fan_ratio = F.when(F.col("degree") > 0,
                           F.col("weighted_degree") / F.col("degree")).otherwise(F.lit(0.0))
        recency = F.when(
            F.col("last_seen").isNotNull(),
            1.0 / (1.0 + (F.unix_timestamp(F.current_timestamp()) - F.unix_timestamp("last_seen")) / 3600.0),
        ).otherwise(F.lit(0.0))

        # log1p on count-like features stabilizes magnitude before projection.
        def lg(c):
            return F.log1p(F.col(c).cast("double"))

        feats = feats.select(
            "entity_id",
            "node_type",
            F.col("degree").cast("int").alias("degree"),
            F.col("weighted_degree").cast("double").alias("weighted_degree"),
            F.coalesce(F.col("triangle_count"), F.lit(0)).cast("int").alias("triangle_count"),
            F.coalesce(F.col("two_hop_reach"), F.lit(0)).cast("int").alias("two_hop_reach"),
            F.col("own_risk").cast("double").alias("risk_score"),
            F.array(
                lg("degree"),
                lg("weighted_degree"),
                lg("two_hop_reach"),
                lg("triangle_count"),
                clustering.cast("double"),
                fan_ratio.cast("double"),
                F.col("neighbor_mean_degree").cast("double"),
                lg("neighbor_max_degree"),
                F.col("neighbor_mean_risk").cast("double"),
                F.col("neighbor_max_risk").cast("double"),
                F.col("own_risk").cast("double"),
                F.col("mean_edge_risk").cast("double"),
                F.col("edge_type_diversity").cast("double"),
                recency.cast("double"),
                (F.col("node_type") == "ip").cast("double"),
                (F.col("node_type") == "user").cast("double"),
                (F.col("node_type") == "host").cast("double"),
                (~F.col("node_type").isin("ip", "user", "host")).cast("double"),
                lg("degree"),                       # padding / redundancy slots
                clustering.cast("double"),
                F.col("neighbor_mean_risk").cast("double"),
                lg("two_hop_reach"),
                fan_ratio.cast("double"),
                recency.cast("double"),
            ).alias("structural_features"),
        )

    # ------------------------------------------------------------------
    # 5. Deterministic random projection -> 128-dim L2-normalized embedding
    # ------------------------------------------------------------------
    with mon.time("project_embeddings"):
        rng = np.random.default_rng(PROJECTION_SEED)
        projection = rng.standard_normal(
            (NUM_STRUCTURAL_FEATURES, embedding_dim)
        ).astype(np.float32) / np.sqrt(embedding_dim)
        b_projection = spark.sparkContext.broadcast(projection)

        @F.pandas_udf(ArrayType(FloatType()))
        def project(features_series):
            import pandas as pd
            P = b_projection.value
            out = []
            for vec in features_series:
                x = np.asarray(vec, dtype=np.float32)
                if x.shape[0] != P.shape[0]:
                    x = np.resize(x, P.shape[0])
                y = x @ P
                norm = np.linalg.norm(y)
                if norm > 0:
                    y = y / norm
                out.append(y.astype(np.float32).tolist())
            return pd.Series(out)

        embedded = (
            feats
            .withColumn("embedding", project(F.col("structural_features")))
            .withColumn("id", F.concat(F.col("node_type"), F.lit(":"), F.col("entity_id")))
            .withColumn("entity_type", F.col("node_type"))
            .withColumn("lookback_hours", F.lit(lookback_hours))
            .withColumn("updated_at", F.current_timestamp())
            .select(
                "id", "entity_id", "entity_type", "embedding",
                "degree", "weighted_degree", "triangle_count",
                "two_hop_reach", "risk_score", "lookback_hours", "updated_at",
            )
        )
        embedded.cache()
        entity_count = embedded.count()

    # ------------------------------------------------------------------
    # 6. Persist to the Delta source table (Change Data Feed ON for delta-sync)
    # ------------------------------------------------------------------
    with mon.time("write_table"):
        ensure_table_exists(
            spark,
            TARGET_TABLE,
            schema_ddl="""
                id STRING,
                entity_id STRING,
                entity_type STRING,
                embedding ARRAY<FLOAT>,
                degree INT,
                weighted_degree DOUBLE,
                triangle_count INT,
                two_hop_reach INT,
                risk_score DOUBLE,
                lookback_hours INT,
                updated_at TIMESTAMP
            """,
            catalog=cfg.catalog,
            schema=cfg.schema,
            comment="Graph neighborhood structural embeddings (128-dim) for Vector Search.",
        )
        # Vector Search delta-sync requires Change Data Feed on the source table.
        spark.sql(
            f"ALTER TABLE {cfg.get_table_path(TARGET_TABLE)} "
            "SET TBLPROPERTIES (delta.enableChangeDataFeed = true)"
        )

        safe_merge(
            spark,
            embedded,
            TARGET_TABLE,
            merge_keys=["id"],
            update_columns=[
                "entity_id", "entity_type", "embedding", "degree",
                "weighted_degree", "triangle_count", "two_hop_reach",
                "risk_score", "lookback_hours", "updated_at",
            ],
            catalog=cfg.catalog,
            schema=cfg.schema,
        )

    # ------------------------------------------------------------------
    # 7. MLflow run log (repro + drift monitoring)
    # ------------------------------------------------------------------
    with mon.time("mlflow_log"):
        try:
            with mlflow.start_run(run_name="graph_neighborhood_embeddings"):
                mlflow.log_params({
                    "projection_seed": PROJECTION_SEED,
                    "embedding_dim": embedding_dim,
                    "num_structural_features": NUM_STRUCTURAL_FEATURES,
                    "lookback_hours": lookback_hours,
                    "max_degree_for_triangles": max_degree_for_triangles,
                })
                mlflow.log_metrics({
                    "edge_count": float(edge_count),
                    "entities_embedded": float(entity_count),
                })
        except Exception as mlf_err:
            mon.log_event("mlflow_skipped", {"error": str(mlf_err)})

    result["entities_embedded"] = entity_count
    result["edge_count"] = edge_count
    mon.log_complete(result)

except Exception as e:
    result["status"] = "failed"
    result["error"] = str(e)
    mon.log_event("notebook_failed", {"error": str(e)})
    raise

# COMMAND ----------

dbutils.notebook.exit(json.dumps(result))
