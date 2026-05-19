import { DatabricksNotebook } from '../databricksNotebooks';

export const mlNotebooks: DatabricksNotebook[] = [
  {
    id: 'vector-threat-hunting',
    title: 'Vector Similarity Threat Hunting Engine',
    subtitle: 'Production embedding-based IOC similarity search using Mosaic AI Vector Search',
    category: 'ml',
    tags: ['Vector Search', 'Embeddings', 'Mosaic AI', 'Cosine Similarity', 'IOC Hunting'],
    description: 'Production pipeline that transforms IOCs and security events into vector embeddings, indexes them in Databricks Mosaic AI Vector Search, and performs continuous similarity queries to discover unknown threats.',
    estimatedRuntime: '15 min (initial index), continuous thereafter',
    clusterRequirements: 'DBR 14.3 LTS ML, GPU (A10G+), 4+ workers',
    cells: [
      {
        type: 'markdown',
        content: `# Vector Similarity Threat Hunting Engine
## Production Embedding-Based IOC Discovery

This notebook implements a **production embedding-based threat hunting system** that:
1. Reads IOCs from \`{catalog}.{schema}.threat_intel_iocs\` (populated by feed ingestion)
2. Computes dense vector representations using sentence-transformers
3. Indexes vectors in Mosaic AI Vector Search for sub-millisecond ANN queries
4. Runs continuous hunting jobs to flag unknown artifacts similar to known-bad
5. Writes discoveries to \`{catalog}.{schema}.vector_hunt_findings\`

### Architecture
- **Embedding Model:** all-MiniLM-L6-v2 (384-dim) or custom fine-tuned model from MLflow
- **Index:** Mosaic AI Vector Search (Delta Sync mode for auto-refresh)
- **Query Mode:** Batch (scheduled) + Online (API endpoint for ad-hoc hunts)
- **Output:** Scored findings with explainability metadata`
      },
      {
        type: 'code',
        content: `# Configuration
dbutils.widgets.text("catalog", "main", "Unity Catalog")
dbutils.widgets.text("schema", "security", "Schema")
dbutils.widgets.text("embedding_model", "all-MiniLM-L6-v2", "Sentence transformer model")
dbutils.widgets.text("similarity_threshold", "0.82", "Minimum cosine similarity for findings")
dbutils.widgets.text("index_name", "threat_ioc_vectors", "Vector search index name")
dbutils.widgets.text("batch_size", "512", "Embedding batch size")

catalog = dbutils.widgets.get("catalog")
schema = dbutils.widgets.get("schema")
embedding_model = dbutils.widgets.get("embedding_model")
similarity_threshold = float(dbutils.widgets.get("similarity_threshold"))
index_name = dbutils.widgets.get("index_name")
batch_size = int(dbutils.widgets.get("batch_size"))

ENDPOINT_NAME = f"{catalog}_{schema}_vector_hunting"
TABLE_NAME = f"{catalog}.{schema}.threat_intel_iocs"
FINDINGS_TABLE = f"{catalog}.{schema}.vector_hunt_findings"`
      },
      {
        type: 'code',
        content: `from pyspark.sql.functions import (
    col, lit, current_timestamp, expr, concat_ws, coalesce,
    when, size, array, struct, date_format
)
from pyspark.sql.types import ArrayType, FloatType, StringType
import mlflow
from sentence_transformers import SentenceTransformer
import numpy as np
from databricks.vector_search.client import VectorSearchClient

model = SentenceTransformer(embedding_model)
vsc = VectorSearchClient()

print(f"Embedding model: {embedding_model} ({model.get_sentence_embedding_dimension()}-dim)")
print(f"Target table: {TABLE_NAME}")
print(f"Similarity threshold: {similarity_threshold}")`
      },
      {
        type: 'markdown',
        content: `## Step 1: Prepare IOC Corpus for Embedding

Build a text representation of each IOC that captures its full context:
indicator value, MITRE techniques, threat actor attribution, campaign tags,
and historical detection context.`
      },
      {
        type: 'code',
        content: `# Load IOCs with full context for embedding
iocs_df = spark.table(TABLE_NAME).filter(col("is_active") == True).select(
    col("id"), col("indicator_type"), col("indicator_value"),
    col("threat_level"), col("confidence_score"), col("source_feed"),
    col("mitre_techniques"), col("threat_actor"), col("campaigns"),
    col("first_seen"), col("last_seen"), col("context_description"),
)

# Build composite text representation for embedding
iocs_with_text = iocs_df.withColumn(
    "embedding_text",
    concat_ws(" | ",
        col("indicator_type"), col("indicator_value"),
        coalesce(col("threat_actor"), lit("")),
        coalesce(col("context_description"), lit("")),
        when(col("mitre_techniques").isNotNull(),
             concat_ws(", ", col("mitre_techniques"))).otherwise(lit("")),
        when(col("campaigns").isNotNull(),
             concat_ws(", ", col("campaigns"))).otherwise(lit("")),
    )
)

total_iocs = iocs_with_text.count()
print(f"IOC corpus size: {total_iocs:,} active indicators")`
      },
      {
        type: 'markdown',
        content: `## Step 2: Compute Embeddings via Pandas UDF`
      },
      {
        type: 'code',
        content: `import pandas as pd
from pyspark.sql.functions import pandas_udf

@pandas_udf(ArrayType(FloatType()))
def compute_embeddings(texts: pd.Series) -> pd.Series:
    """Batch-embed text using sentence-transformers on each worker."""
    embeddings = model.encode(
        texts.tolist(), batch_size=batch_size,
        show_progress_bar=False, normalize_embeddings=True,
    )
    return pd.Series([emb.tolist() for emb in embeddings])

# Compute embeddings for entire IOC corpus
iocs_embedded = iocs_with_text.withColumn("embedding", compute_embeddings(col("embedding_text")))

# Write to Delta table for Vector Search sync
(
    iocs_embedded
    .select("id", "indicator_type", "indicator_value", "threat_level",
            "confidence_score", "embedding_text", "embedding",
            "mitre_techniques", "threat_actor", "campaigns")
    .write.format("delta").mode("overwrite")
    .option("overwriteSchema", "true")
    .saveAsTable(f"{catalog}.{schema}.ioc_embeddings")
)

print(f"Wrote {total_iocs:,} IOC embeddings to {catalog}.{schema}.ioc_embeddings")`
      },
      {
        type: 'markdown',
        content: `## Step 3: Create/Sync Mosaic AI Vector Search Index`
      },
      {
        type: 'code',
        content: `source_table = f"{catalog}.{schema}.ioc_embeddings"

try:
    index = vsc.get_index(endpoint_name=ENDPOINT_NAME, index_name=index_name)
    print(f"Index '{index_name}' exists, triggering sync...")
    index.sync()
except Exception:
    print(f"Creating new Vector Search index: {index_name}")
    index = vsc.create_delta_sync_index(
        endpoint_name=ENDPOINT_NAME,
        index_name=index_name,
        source_table_name=source_table,
        pipeline_type="TRIGGERED",
        primary_key="id",
        embedding_dimension=model.get_sentence_embedding_dimension(),
        embedding_vector_column="embedding",
        columns_to_sync=["indicator_type", "indicator_value", "threat_level",
                         "confidence_score", "embedding_text", "mitre_techniques",
                         "threat_actor", "campaigns"],
    )
    print(f"Index created. Initial sync in progress...")`
      },
      {
        type: 'markdown',
        content: `## Step 4: Hunt - Query Recent Observables Against Index`
      },
      {
        type: 'code',
        content: `# Load recent unclassified observables (last 24h)
from pyspark.sql.functions import explode, array as spark_array

observables = spark.table(f"{catalog}.{schema}.enriched_events").filter(
    (col("time") >= expr("current_timestamp() - INTERVAL 24 HOURS")) &
    (col("threat_classification").isNull() | (col("threat_classification") == "unknown"))
).select("event_id", "src_ip", "dst_ip", "resource_name", "file_hash", "time").distinct()

# Build query texts from observables
observable_texts = observables.select(
    col("event_id"),
    explode(spark_array(
        when(col("src_ip").isNotNull(), concat_ws(" | ", lit("ip"), col("src_ip"))),
        when(col("dst_ip").isNotNull(), concat_ws(" | ", lit("ip"), col("dst_ip"))),
        when(col("resource_name").isNotNull(), concat_ws(" | ", lit("domain"), col("resource_name"))),
        when(col("file_hash").isNotNull(), concat_ws(" | ", lit("hash"), col("file_hash"))),
    )).alias("query_text"),
).filter(col("query_text").isNotNull())

hunt_count = observable_texts.count()
print(f"Hunting across {hunt_count:,} observables from last 24h")`
      },
      {
        type: 'code',
        content: `# Batch similarity search against the vector index
def hunt_batch(query_texts: list, top_k: int = 5) -> list:
    query_embeddings = model.encode(query_texts, normalize_embeddings=True)
    results = []
    for i, emb in enumerate(query_embeddings):
        matches = index.similarity_search(
            query_vector=emb.tolist(), num_results=top_k,
            columns=["indicator_type", "indicator_value", "threat_level",
                     "confidence_score", "mitre_techniques", "threat_actor"],
        )
        for match in matches.get("result", {}).get("data_array", []):
            score = match[-1]
            if score >= similarity_threshold:
                results.append({
                    "query_text": query_texts[i],
                    "matched_indicator": match[1],
                    "matched_type": match[0],
                    "threat_level": match[2],
                    "ioc_confidence": match[3],
                    "similarity_score": score,
                })
    return results

# Process in batches
query_list = [r.query_text for r in observable_texts.select("query_text").distinct().collect()]
all_findings = []
for i in range(0, len(query_list), batch_size):
    all_findings.extend(hunt_batch(query_list[i:i + batch_size]))

print(f"Found {len(all_findings)} similarity matches above threshold {similarity_threshold}")

# Write findings
if all_findings:
    findings_df = spark.createDataFrame(all_findings).withColumn(
        "detection_time", current_timestamp()
    ).withColumn("hunt_method", lit("vector_similarity")
    ).withColumn("partition_date", date_format(current_timestamp(), "yyyy-MM-dd"))
    findings_df.write.format("delta").mode("append").partitionBy("partition_date").saveAsTable(FINDINGS_TABLE)
    print(f"Wrote {len(all_findings)} findings to {FINDINGS_TABLE}")`
      },
    ],
  },
  {
    id: 'anomaly-detection-training',
    title: 'Anomaly Detection Model Training Pipeline',
    subtitle: 'Isolation Forest + MLflow experiment tracking with champion/challenger promotion',
    category: 'ml',
    tags: ['MLflow', 'Isolation Forest', 'Model Registry', 'Feature Store', 'Champion/Challenger'],
    description: 'Production ML training pipeline that builds Isolation Forest models from Feature Store data, tracks experiments in MLflow, evaluates against labeled holdout sets, and automatically promotes champion models.',
    estimatedRuntime: '12 min (weekly schedule)',
    clusterRequirements: 'DBR 14.3 LTS ML, 2-4 workers, 32GB+ driver',
    cells: [
      {
        type: 'markdown',
        content: `# Anomaly Detection Model Training Pipeline
## Isolation Forest with MLflow + Champion/Challenger

**Schedule:** Weekly (Sunday 02:00 UTC)
**Input:** Feature Store table \`{catalog}.{schema}.security_features\`
**Output:** Registered model in Unity Catalog Model Registry

### Pipeline Stages
1. Load features from Databricks Feature Store
2. Train Isolation Forest with hyperparameter search
3. Evaluate on labeled holdout (known incidents from closed cases)
4. Compare against current champion model
5. Promote if new model outperforms by 2%+ on F1-score
6. Deploy model endpoint for online inference`
      },
      {
        type: 'code',
        content: `dbutils.widgets.text("catalog", "main")
dbutils.widgets.text("schema", "security")
dbutils.widgets.text("experiment_name", "/security/anomaly_detection")
dbutils.widgets.text("model_name", "security_anomaly_detector")
dbutils.widgets.text("holdout_days", "90")

catalog = dbutils.widgets.get("catalog")
schema = dbutils.widgets.get("schema")
experiment_name = dbutils.widgets.get("experiment_name")
model_name = f"{catalog}.{schema}.{dbutils.widgets.get('model_name')}"
holdout_days = int(dbutils.widgets.get("holdout_days"))

import mlflow
from mlflow.models import infer_signature
from sklearn.ensemble import IsolationForest
from sklearn.metrics import f1_score, precision_score, recall_score
from sklearn.model_selection import ParameterGrid
from databricks.feature_engineering import FeatureEngineeringClient
import numpy as np
import pandas as pd

mlflow.set_experiment(experiment_name)
fe = FeatureEngineeringClient()`
      },
      {
        type: 'code',
        content: `# Load training features (last N days, excluding recent 7 for holdout)
from pyspark.sql.functions import col, expr, coalesce, lit

features_df = spark.table(f"{catalog}.{schema}.security_features").filter(
    (col("feature_time") >= expr(f"current_timestamp() - INTERVAL {holdout_days} DAYS")) &
    (col("feature_time") < expr("current_timestamp() - INTERVAL 7 DAYS"))
)

# Holdout: last 7 days joined with known incident labels
holdout_df = spark.table(f"{catalog}.{schema}.security_features").filter(
    col("feature_time") >= expr("current_timestamp() - INTERVAL 7 DAYS")
)

labeled_incidents = spark.table(f"{catalog}.{schema}.cases").filter(
    (col("status") == "closed") & (col("classification").isin("true_positive", "confirmed_incident"))
).select(col("entity_id"), col("created_at").alias("incident_time"), lit(1).alias("is_anomaly"))

holdout_labeled = holdout_df.join(
    labeled_incidents,
    (holdout_df.entity_id == labeled_incidents.entity_id) &
    (holdout_df.feature_time.between(
        labeled_incidents.incident_time - expr("INTERVAL 1 HOUR"),
        labeled_incidents.incident_time + expr("INTERVAL 1 HOUR"))),
    "left"
).withColumn("is_anomaly", coalesce(col("is_anomaly"), lit(0)))

feature_columns = [c for c in features_df.columns if c.startswith("feat_")]
print(f"Training: {features_df.count():,} samples | Holdout: {holdout_labeled.count():,} | Features: {len(feature_columns)}")`
      },
      {
        type: 'code',
        content: `# Convert to numpy for sklearn
train_pd = features_df.select(*feature_columns).toPandas()
holdout_pd = holdout_labeled.select(*feature_columns, "is_anomaly").toPandas()

X_train = np.nan_to_num(train_pd[feature_columns].values, nan=0.0)
X_holdout = np.nan_to_num(holdout_pd[feature_columns].values, nan=0.0)
y_holdout = holdout_pd["is_anomaly"].values

# Hyperparameter search
param_grid = ParameterGrid({
    "n_estimators": [100, 200, 300],
    "contamination": [0.01, 0.03, 0.05, 0.08],
    "max_features": [0.5, 0.7, 0.8, 1.0],
    "max_samples": ["auto", 0.8],
})

best_f1, best_model, best_params = 0.0, None, {}

for params in param_grid:
    with mlflow.start_run(nested=True):
        clf = IsolationForest(**params, random_state=42, n_jobs=-1)
        clf.fit(X_train)
        y_pred = (clf.predict(X_holdout) == -1).astype(int)
        f1 = f1_score(y_holdout, y_pred, zero_division=0)
        mlflow.log_params(params)
        mlflow.log_metric("f1_score", f1)
        if f1 > best_f1:
            best_f1, best_model, best_params = f1, clf, params

print(f"Best F1: {best_f1:.4f} | Params: {best_params}")`
      },
      {
        type: 'code',
        content: `# Champion/Challenger evaluation and promotion
with mlflow.start_run(run_name="champion_challenger"):
    mlflow.log_params(best_params)
    mlflow.log_metric("best_f1", best_f1)
    signature = infer_signature(X_holdout[:5], best_model.predict(X_holdout[:5]))
    mlflow.sklearn.log_model(best_model, "model", signature=signature, registered_model_name=model_name)

    from mlflow.tracking import MlflowClient
    client = MlflowClient()
    try:
        champion = client.get_model_version_by_alias(model_name, "champion")
        champion_f1 = client.get_run(champion.run_id).data.metrics.get("f1_score", 0)
        if best_f1 > champion_f1 * 1.02:
            latest = client.get_latest_versions(model_name, stages=["None"])[-1]
            client.set_registered_model_alias(model_name, "champion", latest.version)
            print(f"NEW CHAMPION: v{latest.version} (F1: {best_f1:.4f} > {champion_f1:.4f})")
        else:
            print(f"No promotion (challenger {best_f1:.4f} vs champion {champion_f1:.4f})")
    except Exception:
        latest = client.get_latest_versions(model_name, stages=["None"])[-1]
        client.set_registered_model_alias(model_name, "champion", latest.version)
        print(f"First champion: v{latest.version} (F1: {best_f1:.4f})")`
      },
    ],
  },
  {
    id: 'feature-engineering-pipeline',
    title: 'Security Feature Engineering Pipeline',
    subtitle: 'Databricks Feature Store population from enriched security events',
    category: 'ml',
    tags: ['Feature Store', 'Feature Engineering', 'Entity Features', 'Hourly Schedule'],
    description: 'Computes and maintains security-relevant ML features per entity-hour from enriched events. Populates the Databricks Feature Store for downstream model training and online serving.',
    estimatedRuntime: '8 min (hourly schedule)',
    clusterRequirements: 'DBR 14.3 LTS, 4 workers',
    cells: [
      {
        type: 'markdown',
        content: `# Security Feature Engineering Pipeline
## Databricks Feature Store Population

**Schedule:** Hourly
**Input:** \`{catalog}.{schema}.enriched_events\`
**Output:** Feature Store table \`{catalog}.{schema}.security_features\`

### Feature Categories
1. **Volume** - Event counts, byte volumes, connection counts per entity
2. **Temporal** - Hour-of-day, day-of-week, deviation from baseline
3. **Diversity** - Unique destinations, protocols, event types
4. **Behavioral** - Failed/success ratios, new-destination ratio, privilege usage
5. **Network** - Internal vs external ratio, port entropy, geo-diversity`
      },
      {
        type: 'code',
        content: `dbutils.widgets.text("catalog", "main")
dbutils.widgets.text("schema", "security")
dbutils.widgets.text("lookback_hours", "2")

catalog = dbutils.widgets.get("catalog")
schema = dbutils.widgets.get("schema")
lookback_hours = int(dbutils.widgets.get("lookback_hours"))

from pyspark.sql.functions import (
    col, count, countDistinct, sum as spark_sum, avg, stddev,
    hour, dayofweek, when, lit, expr, current_timestamp,
    log2, window, date_format, coalesce, greatest
)
from databricks.feature_engineering import FeatureEngineeringClient
fe = FeatureEngineeringClient()

events = spark.table(f"{catalog}.{schema}.enriched_events").filter(
    col("time") >= expr(f"current_timestamp() - INTERVAL {lookback_hours} HOURS")
)
print(f"Computing features from {events.count():,} events")`
      },
      {
        type: 'code',
        content: `# Compute features per entity per 1-hour window
entity_features = (
    events.filter(col("actor_user_id").isNotNull())
    .withColumn("feature_window", window(col("time"), "1 hour"))
    .groupBy(col("actor_user_id").alias("entity_id"), col("feature_window.start").alias("feature_time"))
    .agg(
        count("*").alias("feat_event_count"),
        spark_sum("bytes_out").alias("feat_bytes_out_total"),
        countDistinct("dst_ip").alias("feat_unique_destinations"),
        countDistinct("dst_port").alias("feat_unique_ports"),
        countDistinct("type_name").alias("feat_unique_event_types"),
        countDistinct("src_geo_country").alias("feat_geo_diversity"),
        spark_sum(when(col("status_id") == 2, 1).otherwise(0)).alias("feat_failed_count"),
        spark_sum(when(col("status_id") == 1, 1).otherwise(0)).alias("feat_success_count"),
        spark_sum(when(col("category_uid") == 3, 1).otherwise(0)).alias("feat_auth_events"),
        spark_sum(when(col("severity_id") >= 4, 1).otherwise(0)).alias("feat_high_severity_count"),
        avg(hour(col("time"))).alias("feat_avg_hour"),
        spark_sum(when(~col("dst_ip").rlike("^(10\\\\.|172\\\\.(1[6-9]|2|3[01])\\\\.|192\\\\.168\\\\.)"), 1).otherwise(0)).alias("feat_external_connections"),
    )
    .withColumn("feat_failure_ratio", col("feat_failed_count") / (col("feat_event_count") + 1))
    .withColumn("feat_external_ratio", col("feat_external_connections") / (col("feat_event_count") + 1))
    .withColumn("feat_port_entropy", log2(col("feat_unique_ports") + 1))
)

FEATURE_TABLE = f"{catalog}.{schema}.security_features"
fe.write_table(name=FEATURE_TABLE, df=entity_features, mode="merge")
print(f"Feature Store updated: {entity_features.count():,} entity-windows")`
      },
    ],
  },
];
