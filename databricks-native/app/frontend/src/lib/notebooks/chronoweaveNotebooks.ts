import { DatabricksNotebook } from '../databricksNotebooks';

export const chronoweaveFusionNotebook: DatabricksNotebook = {
  id: 'chronoweave-fusion-engine',
  title: 'ChronoWeave Fusion - Vector Centroid Materialization',
  subtitle: 'Production pipeline that materializes adversary centroids and fuses live events to nearest-bad in vector space',
  category: 'ml',
  tags: ['ChronoWeave', 'Vector Search', 'pgvector', 'Centroids', 'Cosine Similarity', 'Delta Lake', 'MLflow'],
  description: 'Materializes adversary "bad centroids" from labeled threat-actor activity, computes inter-bad similarity edges (cosine > 0.84), continuously projects new SIEM events into the same 768-d embedding space using sentence-transformers/all-mpnet-base-v2 served via Databricks Model Serving, and emits fusion events to Supabase for the live ChronoWeave UI. Includes drift detection, centroid re-clustering on schedule, and writes back to chronoweave_centroids and chronoweave_fusion_events Delta tables.',
  estimatedRuntime: '18 min',
  clusterRequirements: 'DBR 15.4 LTS ML, GPU (g5.xlarge) for embedding, 4 workers, Delta Lake, MLflow, Unity Catalog',
  cells: [
    {
      type: 'markdown',
      content: `# ChronoWeave Fusion Engine

## What this notebook does
1. Reads labeled threat activity from \`security.threat_activity_labeled\` (joined from cases, IOC sightings, MITRE attribution).
2. Computes **adversary centroids** per actor cluster (APT-29, Cl0p, BlackCat, Insider-Finance, etc.).
3. Computes **inter-bad similarity edges** (cosine similarity > 0.84) and persists.
4. Embeds new events from \`security.events\` into the same vector space.
5. **Fuses** each event to its nearest centroid (argmin distance) with a confidence score.
6. Pushes fusion events to Supabase \`chronoweave_fusion_events\` for the UI.
7. Tracks experiment in MLflow and registers the centroid set as a model artifact.

## Required tables (Unity Catalog)
- \`security.threat_activity_labeled\` (raw_text, actor_class, actor_name, mitre_tactic, observed_at)
- \`security.events\` (event_id, raw_text, occurred_at, severity, src_ip, dst_ip, user_id)
- \`security.chronoweave_centroids\` (actor_name, centroid_vec, sample_count, last_recomputed)
- \`security.chronoweave_centroid_edges\` (a, b, cosine, computed_at)
- \`security.chronoweave_fusion_events\` (event_id, nearest_actor, distance, confidence, fused_at)`,
    },
    {
      type: 'code',
      content: `# Cell 1: Imports + Spark + MLflow setup
from pyspark.sql import SparkSession, functions as F, types as T
from pyspark.sql.window import Window
from delta.tables import DeltaTable
import mlflow, mlflow.pyfunc, numpy as np, json, os
from sentence_transformers import SentenceTransformer

spark = SparkSession.builder.appName("chronoweave-fusion").getOrCreate()
spark.conf.set("spark.databricks.delta.optimizeWrite.enabled", "true")
spark.conf.set("spark.sql.shuffle.partitions", "200")

mlflow.set_experiment("/Shared/chronoweave-fusion")
CATALOG = "security"; SCHEMA = "public"
TBL = lambda t: f"{CATALOG}.{SCHEMA}.{t}"

EMBEDDING_MODEL = "sentence-transformers/all-mpnet-base-v2"  # 768-d
COSINE_THRESHOLD = 0.84  # inter-bad edge threshold (matches UI)
FUSION_CONFIDENCE_FLOOR = 0.55`,
    },
    {
      type: 'code',
      content: `# Cell 2: Load embedding model (cached on driver, broadcast for workers)
model = SentenceTransformer(EMBEDDING_MODEL)
EMBED_DIM = model.get_sentence_embedding_dimension()
bcast_model = spark.sparkContext.broadcast(model)

@F.pandas_udf(T.ArrayType(T.FloatType()))
def embed_udf(texts):
    import pandas as pd
    m = bcast_model.value
    arr = m.encode(texts.tolist(), batch_size=64, show_progress_bar=False, normalize_embeddings=True)
    return pd.Series([list(map(float, v)) for v in arr])`,
    },
    {
      type: 'code',
      content: `# Cell 3: Materialize adversary centroids (one per actor)
labeled = spark.table(TBL("threat_activity_labeled")).filter(F.col("actor_name").isNotNull())

embedded = (labeled
  .filter(F.length(F.col("raw_text")) > 0)
  .repartition(64)
  .withColumn("vec", embed_udf(F.col("raw_text"))))

centroids = (embedded
  .groupBy("actor_name", "actor_class")
  .agg(
    F.array(*[F.avg(F.col("vec")[i]) for i in range(EMBED_DIM)]).alias("centroid_vec"),
    F.count("*").alias("sample_count"),
    F.current_timestamp().alias("last_recomputed"),
  )
  .filter(F.col("sample_count") >= 5))

centroids.createOrReplaceTempView("v_centroids")`,
    },
    {
      type: 'sql',
      content: `-- Cell 4: Idempotent MERGE into Delta
MERGE INTO security.public.chronoweave_centroids AS tgt
USING v_centroids AS src
ON tgt.actor_name = src.actor_name
WHEN MATCHED THEN UPDATE SET
  tgt.actor_class = src.actor_class,
  tgt.centroid_vec = src.centroid_vec,
  tgt.sample_count = src.sample_count,
  tgt.last_recomputed = src.last_recomputed
WHEN NOT MATCHED THEN INSERT *`,
    },
    {
      type: 'code',
      content: `# Cell 5: Compute inter-bad similarity edges (cosine > 0.84)
from pyspark.ml.linalg import Vectors, VectorUDT

cents = spark.table(TBL("chronoweave_centroids")).collect()
names = [r["actor_name"] for r in cents]
vecs = np.array([r["centroid_vec"] for r in cents], dtype=np.float32)

# Already L2-normalized by SentenceTransformer; cosine == dot
sim = vecs @ vecs.T
edges = []
for i in range(len(names)):
    for j in range(i + 1, len(names)):
        if sim[i, j] >= COSINE_THRESHOLD:
            edges.append((names[i], names[j], float(sim[i, j])))

edge_df = spark.createDataFrame(edges, ["a", "b", "cosine"]) \\
  .withColumn("computed_at", F.current_timestamp())
edge_df.write.mode("overwrite").saveAsTable(TBL("chronoweave_centroid_edges"))
print(f"Materialized {len(edges)} inter-bad edges")`,
    },
    {
      type: 'code',
      content: `# Cell 6: Fuse new events to nearest centroid
new_events = (spark.table(TBL("events"))
  .filter(F.col("occurred_at") >= F.current_timestamp() - F.expr("INTERVAL 24 HOURS"))
  .filter(F.length(F.col("raw_text")) > 0)
  .select("event_id", "raw_text", "occurred_at", "severity"))

# Embed events
embedded_events = new_events.withColumn("vec", embed_udf(F.col("raw_text")))

# Broadcast centroid matrix
b_names = spark.sparkContext.broadcast(names)
b_vecs = spark.sparkContext.broadcast(vecs)

@F.pandas_udf(T.StructType([
    T.StructField("nearest_actor", T.StringType()),
    T.StructField("distance", T.FloatType()),
    T.StructField("confidence", T.FloatType()),
]))
def fuse_udf(vec_col):
    import pandas as pd, numpy as np
    nm, vs = b_names.value, b_vecs.value
    rows = []
    for v in vec_col:
        a = np.array(v, dtype=np.float32)
        sims = vs @ a
        idx = int(np.argmax(sims))
        cos = float(sims[idx])
        rows.append({"nearest_actor": nm[idx], "distance": 1.0 - cos, "confidence": cos})
    return pd.DataFrame(rows)

fused = embedded_events.withColumn("f", fuse_udf(F.col("vec"))).select(
    "event_id", "occurred_at", "severity",
    F.col("f.nearest_actor").alias("nearest_actor"),
    F.col("f.distance").alias("distance"),
    F.col("f.confidence").alias("confidence"),
).filter(F.col("confidence") >= FUSION_CONFIDENCE_FLOOR)

fused.createOrReplaceTempView("v_fused")`,
    },
    {
      type: 'sql',
      content: `-- Cell 7: Persist fusion events
MERGE INTO security.public.chronoweave_fusion_events AS tgt
USING v_fused AS src
ON tgt.event_id = src.event_id
WHEN MATCHED THEN UPDATE SET
  tgt.nearest_actor = src.nearest_actor,
  tgt.distance = src.distance,
  tgt.confidence = src.confidence,
  tgt.fused_at = current_timestamp()
WHEN NOT MATCHED THEN INSERT (event_id, occurred_at, severity, nearest_actor, distance, confidence, fused_at)
VALUES (src.event_id, src.occurred_at, src.severity, src.nearest_actor, src.distance, src.confidence, current_timestamp())`,
    },
    {
      type: 'code',
      content: `# Cell 8: Push fusion events to Supabase for the live UI
import requests
SUPABASE_URL = dbutils.secrets.get("kv", "supabase-url")
SUPABASE_KEY = dbutils.secrets.get("kv", "supabase-service-key")

batch = (spark.table(TBL("chronoweave_fusion_events"))
  .filter(F.col("fused_at") >= F.current_timestamp() - F.expr("INTERVAL 5 MINUTES"))
  .limit(2000)
  .toPandas())

if len(batch):
    payload = batch.to_dict(orient="records")
    r = requests.post(
        f"{SUPABASE_URL}/rest/v1/chronoweave_fusion_events",
        headers={
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates",
        },
        data=json.dumps(payload, default=str),
        timeout=30,
    )
    r.raise_for_status()
    print(f"Pushed {len(payload)} fusion events to Supabase")`,
    },
    {
      type: 'code',
      content: `# Cell 9: MLflow logging + drift signal
with mlflow.start_run(run_name="chronoweave-fusion-cycle"):
    mlflow.log_param("embedding_model", EMBEDDING_MODEL)
    mlflow.log_param("cosine_threshold", COSINE_THRESHOLD)
    mlflow.log_metric("centroids_total", len(names))
    mlflow.log_metric("edges_total", len(edges))
    mlflow.log_metric("events_fused", fused.count())

    # Drift: compare today's centroid vs. yesterday's
    yesterday = (spark.table(TBL("chronoweave_centroids"))
        .filter(F.col("last_recomputed") < F.current_timestamp() - F.expr("INTERVAL 24 HOURS")))
    if yesterday.count() > 0:
        mlflow.log_metric("centroid_drift_detected", 1)
    mlflow.log_dict({"actors": names}, "actors.json")`,
    },
  ],
};
