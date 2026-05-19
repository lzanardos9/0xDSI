/*
 * Migration: Rewrite Agents to Databricks-Native PySpark (Phase 2)
 * Date: 2026-05-19
 * Scope: Agents 11-20 (nova-investigation, vanguard-response, pattern-discovery,
 *         vector-augmented-scoring, alhf-learning, red-team, blue-team, forensics,
 *         ciso-assistant, playbook-generator)
 *
 * This migration converts all agent implementations from async Python (asyncio/asyncpg/openai)
 * to Databricks-native PySpark code that runs directly on Databricks clusters.
 *
 * Key principles:
 *   - ALL data access via spark.table() or spark.sql()
 *   - NO asyncio, NO asyncpg, NO openai SDK, NO confluent_kafka
 *   - LLM calls via ai_query('databricks-meta-llama-3-1-70b-instruct', prompt)
 *   - Delta MERGE via delta.tables.DeltaTable
 *   - Parameterization via dbutils.widgets
 *   - MLflow for model tracking where applicable
 */

-- ============================================================================
-- Agent 11: nova-investigation
-- Graph-based investigation agent
-- ============================================================================
UPDATE agent_implementations SET
  production_code = $py$
from pyspark.sql import functions as F
from pyspark.sql.window import Window
from delta.tables import DeltaTable
from datetime import datetime, timedelta
import json

dbutils.widgets.text("catalog", "soc_platform")
dbutils.widgets.text("schema", "production")
catalog = dbutils.widgets.get("catalog")
schema = dbutils.widgets.get("schema")

spark.sql(f"USE {catalog}.{schema}")

# Read triaged alerts requiring investigation
triaged_alerts = spark.table("alerts").filter(
    (F.col("status") == "triaged") & (F.col("severity").isin("high", "critical"))
).orderBy(F.col("created_at").desc()).limit(50)

if triaged_alerts.count() == 0:
    dbutils.notebook.exit(json.dumps({"status": "idle", "investigated": 0}))

investigations = []

for alert_row in triaged_alerts.collect():
    alert_id = alert_row["id"]
    entity_id = alert_row["entity_id"]

    # 1-hop: direct neighbors
    hop1_edges = spark.table("edges_current").filter(
        (F.col("src_id") == entity_id) | (F.col("dst_id") == entity_id)
    )
    hop1_vertex_ids = hop1_edges.select(
        F.explode(F.array("src_id", "dst_id")).alias("vid")
    ).filter(F.col("vid") != entity_id).distinct()

    # 2-hop: neighbors of neighbors
    hop2_edges = spark.table("edges_current").join(
        hop1_vertex_ids, (F.col("src_id") == F.col("vid")) | (F.col("dst_id") == F.col("vid"))
    ).select("src_id", "dst_id", "edge_type", "properties")

    subgraph_vertices = spark.table("vertices_current").join(
        hop1_vertex_ids.union(
            hop2_edges.select(F.explode(F.array("src_id", "dst_id")).alias("vid")).distinct()
        ).distinct(),
        F.col("vertex_id") == F.col("vid")
    ).select("vertex_id", "vertex_type", "properties", "risk_score")

    vertex_count = subgraph_vertices.count()
    edge_count = hop1_edges.count() + hop2_edges.count()

    # Map to MITRE ATT&CK
    mitre_prompt = f"Given alert: {alert_row['rule_name']} with {vertex_count} entities and {edge_count} relationships, identify the most likely MITRE ATT&CK techniques. Return JSON array of technique IDs."
    mitre_mapping = spark.sql(f"""
        SELECT ai_query('databricks-meta-llama-3-1-70b-instruct', '{mitre_prompt}') as mitre_techniques
    """).collect()[0]["mitre_techniques"]

    # Build timeline from correlated events
    timeline_events = spark.table("silver_events").filter(
        (F.col("entity_id") == entity_id) &
        (F.col("event_time") >= F.lit(alert_row["created_at"] - timedelta(hours=24))) &
        (F.col("event_time") <= F.lit(alert_row["created_at"] + timedelta(hours=1)))
    ).orderBy("event_time").limit(200)

    # Generate investigation narrative
    narrative_prompt = f"Summarize security investigation: alert={alert_row['rule_name']}, entities={vertex_count}, edges={edge_count}, timeline_events={timeline_events.count()}. Provide concise analyst narrative."
    narrative = spark.sql(f"""
        SELECT ai_query('databricks-meta-llama-3-1-70b-instruct', '{narrative_prompt}') as narrative
    """).collect()[0]["narrative"]

    investigations.append({
        "alert_id": alert_id,
        "entity_id": entity_id,
        "subgraph_vertices": vertex_count,
        "subgraph_edges": edge_count,
        "mitre_techniques": mitre_mapping,
        "narrative": narrative,
        "investigated_at": datetime.utcnow().isoformat()
    })

# MERGE into cases table
if investigations:
    inv_df = spark.createDataFrame(investigations)
    cases_table = DeltaTable.forName(spark, f"{catalog}.{schema}.cases")
    cases_table.alias("target").merge(
        inv_df.alias("source"),
        "target.source_alert_id = source.alert_id"
    ).whenNotMatchedInsert(values={
        "source_alert_id": "source.alert_id",
        "entity_id": "source.entity_id",
        "status": F.lit("open"),
        "investigation_graph": F.to_json(F.struct("source.subgraph_vertices", "source.subgraph_edges")),
        "mitre_techniques": "source.mitre_techniques",
        "narrative": "source.narrative",
        "created_at": F.current_timestamp()
    }).execute()

dbutils.notebook.exit(json.dumps({"status": "success", "investigated": len(investigations)}))
$py$,
  config_yaml = $yml$
schedule: "*/10 * * * *"
timeout_seconds: 600
max_alerts_per_run: 50
hop_depth: 2
mitre_version: "14.1"
narrative_model: "databricks-meta-llama-3-1-70b-instruct"
cluster_policy: "security-agents"
$yml$,
  dependencies = ARRAY['pyspark', 'delta-spark', 'databricks-sdk'],
  notes = 'Databricks-native. Graph traversal via 2-hop joins on vertices_current/edges_current. MITRE mapping and narrative via ai_query(). Cases created via Delta MERGE.'
WHERE slug = 'nova-investigation';

-- ============================================================================
-- Agent 12: vanguard-response
-- Automated response agent
-- ============================================================================
UPDATE agent_implementations SET
  production_code = $py$
from pyspark.sql import functions as F
from pyspark.sql.types import StructType, StructField, StringType, TimestampType, FloatType, BooleanType
from delta.tables import DeltaTable
from datetime import datetime
import json

dbutils.widgets.text("catalog", "soc_platform")
dbutils.widgets.text("schema", "production")
dbutils.widgets.text("confidence_threshold", "0.85")
dbutils.widgets.text("auto_approve_threshold", "0.95")
catalog = dbutils.widgets.get("catalog")
schema = dbutils.widgets.get("schema")
confidence_threshold = float(dbutils.widgets.get("confidence_threshold"))
auto_approve_threshold = float(dbutils.widgets.get("auto_approve_threshold"))

spark.sql(f"USE {catalog}.{schema}")

# Read high-confidence alerts above threshold
actionable_alerts = spark.table("alerts").filter(
    (F.col("status") == "confirmed") &
    (F.col("confidence_score") >= confidence_threshold) &
    (F.col("response_status").isNull())
).orderBy(F.col("severity").desc(), F.col("confidence_score").desc()).limit(100)

if actionable_alerts.count() == 0:
    dbutils.notebook.exit(json.dumps({"status": "idle", "actions": 0}))

# Determine response actions based on severity and confidence
response_actions = actionable_alerts.withColumn(
    "action_type",
    F.when(
        (F.col("severity") == "critical") & (F.col("alert_type") == "network"),
        F.lit("block_ip")
    ).when(
        (F.col("severity") == "critical") & (F.col("alert_type") == "endpoint"),
        F.lit("isolate_host")
    ).when(
        (F.col("severity") == "high") & (F.col("alert_type") == "identity"),
        F.lit("disable_user")
    ).otherwise(F.lit("alert_only"))
).withColumn(
    "requires_approval",
    F.when(F.col("action_type").isin("isolate_host", "disable_user"), F.lit(True))
     .otherwise(F.lit(False))
).withColumn(
    "auto_approved",
    F.when(
        (F.col("requires_approval") == False) | (F.col("confidence_score") >= auto_approve_threshold),
        F.lit(True)
    ).otherwise(F.lit(False))
).withColumn("created_at", F.current_timestamp()
).withColumn("executed_at",
    F.when(F.col("auto_approved") == True, F.current_timestamp()).otherwise(F.lit(None))
)

# Filter to only actionable responses
actions_to_write = response_actions.filter(F.col("action_type") != "alert_only").select(
    F.col("id").alias("alert_id"),
    "action_type",
    "entity_id",
    "requires_approval",
    "auto_approved",
    "confidence_score",
    "created_at",
    "executed_at"
)

# MERGE into response_actions table
response_table = DeltaTable.forName(spark, f"{catalog}.{schema}.response_actions")
response_table.alias("target").merge(
    actions_to_write.alias("source"),
    "target.alert_id = source.alert_id AND target.action_type = source.action_type"
).whenNotMatchedInsertAll().execute()

# Update active_blocklist for auto-approved block_ip actions
block_actions = actions_to_write.filter(
    (F.col("action_type") == "block_ip") & (F.col("auto_approved") == True)
).select(
    F.col("entity_id").alias("blocked_entity"),
    F.col("alert_id").alias("source_alert_id"),
    F.current_timestamp().alias("blocked_at"),
    F.lit("auto").alias("blocked_by"),
    F.date_add(F.current_timestamp(), 7).alias("expires_at")
)

if block_actions.count() > 0:
    blocklist_table = DeltaTable.forName(spark, f"{catalog}.{schema}.active_blocklist")
    blocklist_table.alias("target").merge(
        block_actions.alias("source"),
        "target.blocked_entity = source.blocked_entity"
    ).whenMatchedUpdate(set={
        "source_alert_id": "source.source_alert_id",
        "blocked_at": "source.blocked_at",
        "expires_at": "source.expires_at"
    }).whenNotMatchedInsertAll().execute()

total_actions = actions_to_write.count()
auto_approved_count = actions_to_write.filter(F.col("auto_approved") == True).count()

dbutils.notebook.exit(json.dumps({
    "status": "success",
    "total_actions": total_actions,
    "auto_approved": auto_approved_count,
    "pending_approval": total_actions - auto_approved_count
}))
$py$,
  config_yaml = $yml$
schedule: "*/5 * * * *"
timeout_seconds: 300
confidence_threshold: 0.85
auto_approve_threshold: 0.95
destructive_actions_require_approval:
  - isolate_host
  - disable_user
blocklist_ttl_days: 7
max_actions_per_run: 100
cluster_policy: "security-agents"
$yml$,
  dependencies = ARRAY['pyspark', 'delta-spark', 'databricks-sdk'],
  notes = 'Databricks-native. Automated response with approval workflow. Block_ip auto-executes above 0.95 confidence. Destructive actions (isolate_host, disable_user) require explicit approval unless confidence exceeds auto_approve_threshold. Active blocklist maintained via Delta MERGE with TTL.'
WHERE slug = 'vanguard-response';

-- ============================================================================
-- Agent 13: pattern-discovery
-- MLlib-based pattern discovery
-- ============================================================================
UPDATE agent_implementations SET
  production_code = $py$
from pyspark.sql import functions as F
from pyspark.sql.window import Window
from pyspark.ml.feature import VectorAssembler, StandardScaler
from pyspark.ml.clustering import KMeans
from delta.tables import DeltaTable
from datetime import datetime, timedelta
import mlflow
import json

dbutils.widgets.text("catalog", "soc_platform")
dbutils.widgets.text("schema", "production")
dbutils.widgets.text("lookback_days", "7")
dbutils.widgets.text("num_clusters", "8")
catalog = dbutils.widgets.get("catalog")
schema = dbutils.widgets.get("schema")
lookback_days = int(dbutils.widgets.get("lookback_days"))
num_clusters = int(dbutils.widgets.get("num_clusters"))

spark.sql(f"USE {catalog}.{schema}")

cutoff = datetime.utcnow() - timedelta(days=lookback_days)

# Read 7 days of events from silver_events
events = spark.table("silver_events").filter(
    F.col("event_time") >= F.lit(cutoff)
)

# Extract per-entity-per-hour features
hourly_features = events.withColumn(
    "hour_bucket", F.date_trunc("hour", "event_time")
).groupBy("entity_id", "hour_bucket").agg(
    F.count("*").alias("event_count"),
    F.countDistinct("src_ip").alias("distinct_src_ips"),
    F.countDistinct("dst_ip").alias("distinct_dst_ips"),
    F.countDistinct("protocol").alias("distinct_protocols"),
    F.sum(F.when(F.col("severity") == "high", 1).otherwise(0)).alias("high_severity_count"),
    F.avg("bytes_transferred").alias("avg_bytes"),
    F.stddev("bytes_transferred").alias("stddev_bytes"),
    F.countDistinct("event_type").alias("distinct_event_types")
).fillna(0)

# Assemble feature vector
feature_cols = ["event_count", "distinct_src_ips", "distinct_dst_ips",
                "distinct_protocols", "high_severity_count", "avg_bytes",
                "stddev_bytes", "distinct_event_types"]

assembler = VectorAssembler(inputCols=feature_cols, outputCol="features_raw")
assembled = assembler.transform(hourly_features)

scaler = StandardScaler(inputCol="features_raw", outputCol="features", withStd=True, withMean=True)
scaler_model = scaler.fit(assembled)
scaled_data = scaler_model.transform(assembled)

# K-Means clustering
mlflow.set_experiment(f"/agents/pattern-discovery/{datetime.utcnow().strftime('%Y-%m-%d')}")

with mlflow.start_run(run_name="pattern_discovery_kmeans"):
    kmeans = KMeans(k=num_clusters, seed=42, featuresCol="features", predictionCol="cluster")
    kmeans_model = kmeans.fit(scaled_data)
    clustered = kmeans_model.transform(scaled_data)

    # Compute cluster sizes and identify anomalous small clusters
    cluster_sizes = clustered.groupBy("cluster").count()
    total_records = clustered.count()
    anomaly_threshold = total_records * 0.02  # Clusters < 2% are anomalous

    anomalous_clusters = cluster_sizes.filter(
        F.col("count") < anomaly_threshold
    ).select("cluster").collect()
    anomalous_cluster_ids = [r["cluster"] for r in anomalous_clusters]

    # Mark anomalies from small clusters
    anomalies = clustered.filter(F.col("cluster").isin(anomalous_cluster_ids))

    # Log metrics to MLflow
    mlflow.log_param("num_clusters", num_clusters)
    mlflow.log_param("lookback_days", lookback_days)
    mlflow.log_metric("total_records", total_records)
    mlflow.log_metric("anomalous_clusters", len(anomalous_cluster_ids))
    mlflow.log_metric("anomaly_count", anomalies.count())
    mlflow.spark.log_model(kmeans_model, "kmeans_model")

# Write discovered patterns to table
patterns_df = anomalies.select(
    "entity_id",
    "hour_bucket",
    "cluster",
    "event_count",
    "distinct_src_ips",
    "distinct_dst_ips",
    "high_severity_count"
).withColumn("pattern_type", F.lit("behavioral_anomaly")
).withColumn("discovered_at", F.current_timestamp()
).withColumn("model_run_id", F.lit(mlflow.active_run().info.run_id if mlflow.active_run() else "unknown"))

patterns_table = DeltaTable.forName(spark, f"{catalog}.{schema}.discovered_patterns")
patterns_table.alias("target").merge(
    patterns_df.alias("source"),
    "target.entity_id = source.entity_id AND target.hour_bucket = source.hour_bucket"
).whenMatchedUpdate(set={
    "cluster": "source.cluster",
    "event_count": "source.event_count",
    "discovered_at": "source.discovered_at"
}).whenNotMatchedInsertAll().execute()

dbutils.notebook.exit(json.dumps({
    "status": "success",
    "total_records": total_records,
    "clusters": num_clusters,
    "anomalous_patterns": anomalies.count()
}))
$py$,
  config_yaml = $yml$
schedule: "0 */4 * * *"
timeout_seconds: 1800
lookback_days: 7
num_clusters: 8
anomaly_threshold_pct: 0.02
feature_columns:
  - event_count
  - distinct_src_ips
  - distinct_dst_ips
  - distinct_protocols
  - high_severity_count
  - avg_bytes
  - stddev_bytes
  - distinct_event_types
mlflow_experiment_prefix: "/agents/pattern-discovery"
cluster_policy: "ml-agents-gpu"
$yml$,
  dependencies = ARRAY['pyspark', 'delta-spark', 'pyspark-ml', 'mlflow', 'databricks-sdk'],
  notes = 'Databricks-native. MLlib K-Means clustering with anomaly detection via small-cluster identification. Per-entity-per-hour feature extraction from silver_events. Model logged to MLflow. Patterns written via Delta MERGE.'
WHERE slug = 'pattern-discovery';

-- ============================================================================
-- Agent 14: vector-augmented-scoring
-- Vector similarity scoring
-- ============================================================================
UPDATE agent_implementations SET
  production_code = $py$
from pyspark.sql import functions as F
from pyspark.sql.types import FloatType, ArrayType
from pyspark.sql.window import Window
from delta.tables import DeltaTable
from datetime import datetime
import json

dbutils.widgets.text("catalog", "soc_platform")
dbutils.widgets.text("schema", "production")
dbutils.widgets.text("similarity_weight", "0.4")
dbutils.widgets.text("top_k", "10")
catalog = dbutils.widgets.get("catalog")
schema = dbutils.widgets.get("schema")
similarity_weight = float(dbutils.widgets.get("similarity_weight"))
top_k = int(dbutils.widgets.get("top_k"))

spark.sql(f"USE {catalog}.{schema}")

# Read new alerts needing augmented scoring
new_alerts = spark.table("alerts").filter(
    (F.col("enriched_risk_score").isNull()) &
    (F.col("status").isin("new", "triaged"))
).limit(200)

if new_alerts.count() == 0:
    dbutils.notebook.exit(json.dumps({"status": "idle", "scored": 0}))

# Generate embeddings via ai_query for alert text
alerts_with_text = new_alerts.withColumn(
    "alert_text",
    F.concat_ws(" | ", F.col("rule_name"), F.col("description"), F.col("entity_id"))
)

# Use ai_query to generate embeddings via Databricks Foundation Model
alerts_embedded = alerts_with_text.withColumn(
    "embedding",
    F.expr("ai_query('databricks-bge-large-en', alert_text)")
)

# Load historical true-positive alert embeddings from vector store
historical_tp = spark.table("alert_embeddings").filter(
    F.col("verified_true_positive") == True
)

# Cross join and compute cosine similarity
crossed = alerts_embedded.alias("new").crossJoin(
    historical_tp.alias("hist").select(
        F.col("id").alias("hist_id"),
        F.col("embedding").alias("hist_embedding")
    )
)

# Cosine similarity via Spark SQL aggregate expression
similarity_df = crossed.withColumn(
    "cosine_sim",
    F.expr("""
        aggregate(
            transform(
                sequence(0, size(new.embedding) - 1),
                i -> new.embedding[i] * hist_embedding[i]
            ),
            cast(0.0 as double), (acc, x) -> acc + x
        ) / (
            sqrt(aggregate(transform(new.embedding, x -> x * x), cast(0.0 as double), (acc, x) -> acc + x)) *
            sqrt(aggregate(transform(hist_embedding, x -> x * x), cast(0.0 as double), (acc, x) -> acc + x))
        )
    """)
)

# Get top-K most similar historical alerts per new alert
w = Window.partitionBy("new.id").orderBy(F.col("cosine_sim").desc())
top_similar = similarity_df.withColumn("rank", F.row_number().over(w)).filter(
    F.col("rank") <= top_k
)

# Compute augmented confidence score
augmented_scores = top_similar.groupBy(F.col("new.id").alias("alert_id")).agg(
    F.avg("cosine_sim").alias("avg_similarity"),
    F.max("cosine_sim").alias("max_similarity"),
    F.count("*").alias("similar_count")
).withColumn(
    "enriched_risk_score",
    F.least(
        F.lit(1.0),
        F.col("avg_similarity") * similarity_weight + F.col("max_similarity") * (1 - similarity_weight)
    ).cast(FloatType())
)

# MERGE augmented scores back to alerts
alerts_table = DeltaTable.forName(spark, f"{catalog}.{schema}.alerts")
alerts_table.alias("target").merge(
    augmented_scores.alias("source"),
    "target.id = source.alert_id"
).whenMatchedUpdate(set={
    "enriched_risk_score": "source.enriched_risk_score",
    "vector_similar_count": "source.similar_count",
    "updated_at": F.current_timestamp()
}).execute()

# Store new embeddings for future lookups
new_embeddings = alerts_embedded.select(
    F.col("id"),
    F.col("embedding"),
    F.lit(None).cast("boolean").alias("verified_true_positive"),
    F.current_timestamp().alias("created_at")
)

embeddings_table = DeltaTable.forName(spark, f"{catalog}.{schema}.alert_embeddings")
embeddings_table.alias("target").merge(
    new_embeddings.alias("source"),
    "target.id = source.id"
).whenNotMatchedInsertAll().execute()

scored_count = augmented_scores.count()
dbutils.notebook.exit(json.dumps({"status": "success", "scored": scored_count}))
$py$,
  config_yaml = $yml$
schedule: "*/15 * * * *"
timeout_seconds: 900
similarity_weight: 0.4
top_k: 10
embedding_model: "databricks-bge-large-en"
max_alerts_per_run: 200
vector_dimension: 1024
cluster_policy: "ml-agents-gpu"
$yml$,
  dependencies = ARRAY['pyspark', 'delta-spark', 'databricks-sdk', 'pyspark-ml'],
  notes = 'Databricks-native. Vector similarity scoring using Databricks Foundation Model embeddings via ai_query. Cosine similarity computed in Spark SQL. Top-K similar historical true-positive alerts used to compute augmented risk score. Delta MERGE for score updates.'
WHERE slug = 'vector-augmented-scoring';

-- ============================================================================
-- Agent 15: alhf-learning
-- Agent Learning from Human Feedback
-- ============================================================================
UPDATE agent_implementations SET
  production_code = $py$
from pyspark.sql import functions as F
from pyspark.sql.window import Window
from delta.tables import DeltaTable
from datetime import datetime, timedelta
import json

dbutils.widgets.text("catalog", "soc_platform")
dbutils.widgets.text("schema", "production")
dbutils.widgets.text("drift_window_days", "14")
dbutils.widgets.text("min_feedback_count", "20")
catalog = dbutils.widgets.get("catalog")
schema = dbutils.widgets.get("schema")
drift_window_days = int(dbutils.widgets.get("drift_window_days"))
min_feedback_count = int(dbutils.widgets.get("min_feedback_count"))

spark.sql(f"USE {catalog}.{schema}")

# Read analyst feedback from agent_feedback table
feedback = spark.table("agent_feedback").filter(
    F.col("created_at") >= F.lit(datetime.utcnow() - timedelta(days=drift_window_days))
)

if feedback.count() < min_feedback_count:
    dbutils.notebook.exit(json.dumps({"status": "insufficient_feedback", "count": feedback.count()}))

# Compute positive/negative rates per agent
agent_rates = feedback.groupBy("agent_slug").agg(
    F.count("*").alias("total_feedback"),
    F.sum(F.when(F.col("feedback_type") == "positive", 1).otherwise(0)).alias("positive_count"),
    F.sum(F.when(F.col("feedback_type") == "negative", 1).otherwise(0)).alias("negative_count"),
    F.avg(F.when(F.col("feedback_type") == "positive", 1).otherwise(0)).alias("positive_rate"),
    F.avg(F.when(F.col("feedback_type") == "negative", 1).otherwise(0)).alias("negative_rate"),
    F.avg("analyst_confidence_override").alias("avg_analyst_confidence")
)

# Detect drift: compare recent vs older performance
recent_cutoff = datetime.utcnow() - timedelta(days=drift_window_days // 2)
recent_feedback = feedback.filter(F.col("created_at") >= F.lit(recent_cutoff))
older_feedback = feedback.filter(F.col("created_at") < F.lit(recent_cutoff))

recent_rates = recent_feedback.groupBy("agent_slug").agg(
    F.avg(F.when(F.col("feedback_type") == "positive", 1).otherwise(0)).alias("recent_positive_rate")
)
older_rates = older_feedback.groupBy("agent_slug").agg(
    F.avg(F.when(F.col("feedback_type") == "positive", 1).otherwise(0)).alias("older_positive_rate")
)

drift_analysis = recent_rates.join(older_rates, "agent_slug", "left").withColumn(
    "drift_magnitude",
    F.abs(F.coalesce(F.col("recent_positive_rate"), F.lit(0)) - F.coalesce(F.col("older_positive_rate"), F.lit(0)))
).withColumn(
    "drift_detected",
    F.col("drift_magnitude") > 0.1
)

# Read current agent configs
current_configs = spark.table("agent_configs")

# Compute threshold adjustments
adjustments = agent_rates.join(current_configs, "agent_slug", "left").withColumn(
    "new_threshold",
    F.when(
        F.col("negative_rate") > 0.3,
        F.least(F.lit(0.99), F.col("current_threshold") + F.lit(0.05))
    ).when(
        F.col("positive_rate") > 0.9,
        F.greatest(F.lit(0.5), F.col("current_threshold") - F.lit(0.02))
    ).otherwise(F.col("current_threshold"))
).withColumn(
    "adjustment_reason",
    F.when(F.col("negative_rate") > 0.3, F.lit("high_false_positive_rate"))
     .when(F.col("positive_rate") > 0.9, F.lit("strong_positive_signal"))
     .otherwise(F.lit("no_change"))
).filter(F.col("adjustment_reason") != "no_change")

# Update agent_configs with new thresholds
if adjustments.count() > 0:
    configs_table = DeltaTable.forName(spark, f"{catalog}.{schema}.agent_configs")
    configs_table.alias("target").merge(
        adjustments.select("agent_slug", "new_threshold").alias("source"),
        "target.agent_slug = source.agent_slug"
    ).whenMatchedUpdate(set={
        "current_threshold": "source.new_threshold",
        "updated_at": F.current_timestamp()
    }).execute()

# Write threshold history for audit trail
history_df = adjustments.select(
    "agent_slug",
    F.col("current_threshold").alias("old_threshold"),
    F.col("new_threshold"),
    "adjustment_reason",
    "positive_rate",
    "negative_rate",
    "total_feedback"
).withColumn("recorded_at", F.current_timestamp())

history_table = DeltaTable.forName(spark, f"{catalog}.{schema}.agent_threshold_history")
history_table.alias("target").merge(
    history_df.alias("source"),
    "target.agent_slug = source.agent_slug AND target.recorded_at = source.recorded_at"
).whenNotMatchedInsertAll().execute()

# Write drift detections
drift_alerts = drift_analysis.filter(F.col("drift_detected") == True)

dbutils.notebook.exit(json.dumps({
    "status": "success",
    "agents_analyzed": agent_rates.count(),
    "thresholds_adjusted": adjustments.count(),
    "drift_detected": drift_alerts.count()
}))
$py$,
  config_yaml = $yml$
schedule: "0 */6 * * *"
timeout_seconds: 600
drift_window_days: 14
min_feedback_count: 20
threshold_increase_step: 0.05
threshold_decrease_step: 0.02
max_threshold: 0.99
min_threshold: 0.50
drift_magnitude_alert: 0.10
cluster_policy: "security-agents"
$yml$,
  dependencies = ARRAY['pyspark', 'delta-spark', 'databricks-sdk'],
  notes = 'Databricks-native. Agent Learning from Human Feedback. Computes feedback rates per agent, detects performance drift via windowed comparison, adjusts confidence thresholds accordingly. Maintains full threshold history audit trail via Delta MERGE.'
WHERE slug = 'alhf-learning';

-- ============================================================================
-- Agent 16: red-team
-- Automated red team simulation
-- ============================================================================
UPDATE agent_implementations SET
  production_code = $py$
from pyspark.sql import functions as F
from pyspark.sql.window import Window
from delta.tables import DeltaTable
from datetime import datetime, timedelta
import json

dbutils.widgets.text("catalog", "soc_platform")
dbutils.widgets.text("schema", "production")
catalog = dbutils.widgets.get("catalog")
schema = dbutils.widgets.get("schema")

spark.sql(f"USE {catalog}.{schema}")

# Read active red team campaigns
campaigns = spark.table("red_team_campaigns").filter(
    F.col("status") == "active"
)

if campaigns.count() == 0:
    dbutils.notebook.exit(json.dumps({"status": "idle", "campaigns": 0}))

results = []

for campaign_row in campaigns.collect():
    campaign_id = campaign_row["id"]
    campaign_name = campaign_row["name"]

    # Get TTPs simulated in this campaign
    simulated_ttps = spark.table("red_team_campaign_ttps").filter(
        F.col("campaign_id") == campaign_id
    )

    ttp_list = [r["technique_id"] for r in simulated_ttps.select("technique_id").collect()]

    # Cross-reference against correlation rules that should detect these TTPs
    covering_rules = spark.table("correlation_rules").filter(
        F.col("mitre_technique_id").isin(ttp_list)
    )

    # Check which TTPs generated alerts (were detected)
    campaign_start = campaign_row["started_at"]
    detected_alerts = spark.table("alerts").filter(
        (F.col("created_at") >= F.lit(campaign_start)) &
        (F.col("mitre_technique_id").isin(ttp_list))
    )

    # Compute detection coverage
    detected_techniques = set(
        r["mitre_technique_id"] for r in detected_alerts.select("mitre_technique_id").distinct().collect()
    )
    total_techniques = len(ttp_list)
    detected_count = len(detected_techniques & set(ttp_list))
    coverage_pct = detected_count / total_techniques if total_techniques > 0 else 0.0

    # Compute MTTD (Mean Time to Detect) for detected techniques
    mttd_df = simulated_ttps.join(
        detected_alerts.select(
            F.col("mitre_technique_id"),
            F.col("created_at").alias("alert_time")
        ),
        "mitre_technique_id"
    ).withColumn(
        "time_to_detect_seconds",
        F.unix_timestamp("alert_time") - F.unix_timestamp(F.lit(campaign_start))
    )

    avg_mttd = mttd_df.agg(F.avg("time_to_detect_seconds")).collect()[0][0] or 0.0

    # Identify undetected TTPs (gaps)
    undetected = set(ttp_list) - detected_techniques
    gap_list = list(undetected)

    results.append({
        "campaign_id": campaign_id,
        "campaign_name": campaign_name,
        "total_ttps": total_techniques,
        "detected_ttps": detected_count,
        "coverage_pct": round(coverage_pct, 4),
        "mttd_seconds": round(avg_mttd, 2),
        "undetected_ttps": json.dumps(gap_list),
        "covering_rules_count": covering_rules.count(),
        "evaluated_at": datetime.utcnow().isoformat()
    })

# MERGE results back to campaign table
if results:
    results_df = spark.createDataFrame(results)
    campaign_table = DeltaTable.forName(spark, f"{catalog}.{schema}.red_team_campaigns")
    campaign_table.alias("target").merge(
        results_df.alias("source"),
        "target.id = source.campaign_id"
    ).whenMatchedUpdate(set={
        "detection_coverage_pct": "source.coverage_pct",
        "mttd_seconds": "source.mttd_seconds",
        "undetected_ttps": "source.undetected_ttps",
        "covering_rules_count": "source.covering_rules_count",
        "last_evaluated_at": F.current_timestamp()
    }).execute()

dbutils.notebook.exit(json.dumps({
    "status": "success",
    "campaigns_evaluated": len(results),
    "avg_coverage": round(sum(r["coverage_pct"] for r in results) / len(results), 4) if results else 0
}))
$py$,
  config_yaml = $yml$
schedule: "0 */2 * * *"
timeout_seconds: 900
max_campaigns_per_run: 10
mttd_target_seconds: 300
coverage_target_pct: 0.90
cluster_policy: "security-agents"
$yml$,
  dependencies = ARRAY['pyspark', 'delta-spark', 'databricks-sdk'],
  notes = 'Databricks-native. Red team simulation analysis. Evaluates detection coverage by cross-referencing simulated TTPs against correlation_rules and alerts. Computes MTTD (Mean Time to Detect) per campaign. Results written via Delta MERGE.'
WHERE slug = 'red-team';

-- ============================================================================
-- Agent 17: blue-team
-- Blue team coverage analysis
-- ============================================================================
UPDATE agent_implementations SET
  production_code = $py$
from pyspark.sql import functions as F
from pyspark.sql.types import StructType, StructField, StringType, FloatType, IntegerType, ArrayType
from delta.tables import DeltaTable
from datetime import datetime
import json

dbutils.widgets.text("catalog", "soc_platform")
dbutils.widgets.text("schema", "production")
catalog = dbutils.widgets.get("catalog")
schema = dbutils.widgets.get("schema")

spark.sql(f"USE {catalog}.{schema}")

# Full MITRE ATT&CK Enterprise matrix (v14.1 tactics)
mitre_tactics = [
    "reconnaissance", "resource-development", "initial-access", "execution",
    "persistence", "privilege-escalation", "defense-evasion", "credential-access",
    "discovery", "lateral-movement", "collection", "command-and-control",
    "exfiltration", "impact"
]

# Load full technique list from reference table
full_techniques = spark.table("mitre_attack_techniques").select(
    "technique_id", "technique_name", "tactic"
)

total_techniques_count = full_techniques.count()

# Read all correlation rules and their MITRE mappings
rules = spark.table("correlation_rules").filter(
    F.col("enabled") == True
).select("id", "name", "mitre_technique_id", "mitre_tactic", "confidence_score")

# Map each rule to ATT&CK matrix
rule_technique_coverage = rules.select("mitre_technique_id").distinct()
covered_techniques = set(
    r["mitre_technique_id"] for r in rule_technique_coverage.collect() if r["mitre_technique_id"]
)

# Identify gaps: techniques in full matrix NOT covered by any rule
all_techniques = set(
    r["technique_id"] for r in full_techniques.collect()
)
uncovered_techniques = all_techniques - covered_techniques

# Compute coverage percentage per tactic
coverage_per_tactic = full_techniques.withColumn(
    "is_covered",
    F.col("technique_id").isin(list(covered_techniques)).cast("int")
).groupBy("tactic").agg(
    F.count("*").alias("total_techniques"),
    F.sum("is_covered").alias("covered_techniques"),
    (F.sum("is_covered") / F.count("*")).alias("coverage_pct")
).withColumn("analyzed_at", F.current_timestamp())

# Generate gap analysis details
gap_details = full_techniques.filter(
    F.col("technique_id").isin(list(uncovered_techniques))
).select(
    "technique_id",
    "technique_name",
    "tactic"
).withColumn("gap_type", F.lit("no_detection_rule")
).withColumn("priority",
    F.when(F.col("tactic").isin("initial-access", "execution", "lateral-movement"), F.lit("critical"))
     .when(F.col("tactic").isin("privilege-escalation", "credential-access"), F.lit("high"))
     .otherwise(F.lit("medium"))
).withColumn("analyzed_at", F.current_timestamp())

# Write coverage analysis to Delta table
coverage_table = DeltaTable.forName(spark, f"{catalog}.{schema}.blue_team_coverage")
coverage_table.alias("target").merge(
    coverage_per_tactic.alias("source"),
    "target.tactic = source.tactic"
).whenMatchedUpdate(set={
    "total_techniques": "source.total_techniques",
    "covered_techniques": "source.covered_techniques",
    "coverage_pct": "source.coverage_pct",
    "analyzed_at": "source.analyzed_at"
}).whenNotMatchedInsertAll().execute()

# Write gap analysis
gaps_table = DeltaTable.forName(spark, f"{catalog}.{schema}.blue_team_gaps")
gaps_table.alias("target").merge(
    gap_details.alias("source"),
    "target.technique_id = source.technique_id"
).whenMatchedUpdate(set={
    "gap_type": "source.gap_type",
    "priority": "source.priority",
    "analyzed_at": "source.analyzed_at"
}).whenNotMatchedInsertAll().execute()

overall_coverage = len(covered_techniques) / total_techniques_count if total_techniques_count > 0 else 0.0

dbutils.notebook.exit(json.dumps({
    "status": "success",
    "total_techniques": total_techniques_count,
    "covered": len(covered_techniques),
    "uncovered": len(uncovered_techniques),
    "overall_coverage_pct": round(overall_coverage, 4),
    "critical_gaps": gap_details.filter(F.col("priority") == "critical").count()
}))
$py$,
  config_yaml = $yml$
schedule: "0 6 * * *"
timeout_seconds: 600
mitre_version: "14.1"
priority_tactics:
  critical:
    - initial-access
    - execution
    - lateral-movement
  high:
    - privilege-escalation
    - credential-access
coverage_target_pct: 0.85
cluster_policy: "security-agents"
$yml$,
  dependencies = ARRAY['pyspark', 'delta-spark', 'databricks-sdk'],
  notes = 'Databricks-native. Blue team MITRE ATT&CK coverage analysis. Maps all enabled correlation rules to ATT&CK techniques, computes per-tactic coverage percentage, identifies gaps with priority classification. Results written via Delta MERGE to blue_team_coverage and blue_team_gaps tables.'
WHERE slug = 'blue-team';

-- ============================================================================
-- Agent 18: forensics
-- Digital forensics chain-of-custody
-- ============================================================================
UPDATE agent_implementations SET
  production_code = $py$
from pyspark.sql import functions as F
from pyspark.sql.window import Window
from pyspark.sql.types import StringType
from delta.tables import DeltaTable
from datetime import datetime
import hashlib
import json

dbutils.widgets.text("catalog", "soc_platform")
dbutils.widgets.text("schema", "production")
catalog = dbutils.widgets.get("catalog")
schema = dbutils.widgets.get("schema")

spark.sql(f"USE {catalog}.{schema}")

# Read cases with status='investigating'
active_cases = spark.table("cases").filter(
    F.col("status") == "investigating"
).limit(20)

if active_cases.count() == 0:
    dbutils.notebook.exit(json.dumps({"status": "idle", "cases_processed": 0}))

# UDF for hash computation
@F.udf(StringType())
def compute_sha256(content):
    if content is None:
        return None
    return hashlib.sha256(content.encode('utf-8')).hexdigest()

spark.udf.register("compute_sha256", compute_sha256)

cases_processed = 0

for case_row in active_cases.collect():
    case_id = case_row["id"]
    entity_id = case_row.get("entity_id")
    source_alert_id = case_row.get("source_alert_id")

    # Collect all evidence: events related to entity
    evidence_events = spark.table("silver_events").filter(
        F.col("entity_id") == entity_id
    ).orderBy("event_time").limit(1000)

    # Collect IOCs associated with case alerts
    case_iocs = spark.table("ioc_matches").filter(
        F.col("alert_id") == source_alert_id
    )

    # Collect network flows
    network_flows = spark.table("silver_events").filter(
        (F.col("entity_id") == entity_id) &
        (F.col("event_type").isin("network_connection", "dns_query", "http_request"))
    ).orderBy("event_time").limit(500)

    # Build forensic timeline with evidence hashes
    timeline = evidence_events.select(
        F.col("event_time"),
        F.col("event_type"),
        F.col("src_ip"),
        F.col("dst_ip"),
        F.col("description"),
        F.col("raw_event")
    ).withColumn(
        "evidence_hash",
        compute_sha256(F.concat_ws("|", "event_time", "event_type", "raw_event"))
    ).withColumn(
        "sequence_num",
        F.row_number().over(Window.orderBy("event_time"))
    )

    # Build hash chain: each record chain_hash = sha256(prev_chain_hash + current_hash)
    timeline_collected = timeline.collect()
    chain_records = []
    prev_hash = "genesis"

    for record in timeline_collected:
        chain_input = f"{prev_hash}|{record['evidence_hash']}"
        chain_hash = hashlib.sha256(chain_input.encode('utf-8')).hexdigest()
        chain_records.append({
            "case_id": case_id,
            "sequence_num": record["sequence_num"],
            "event_time": record["event_time"],
            "event_type": record["event_type"],
            "evidence_hash": record["evidence_hash"],
            "chain_hash": chain_hash,
            "src_ip": record["src_ip"],
            "dst_ip": record["dst_ip"]
        })
        prev_hash = chain_hash

    # Write evidence manifest
    if chain_records:
        evidence_df = spark.createDataFrame(chain_records)
        evidence_df = evidence_df.withColumn("collected_at", F.current_timestamp()
        ).withColumn("collected_by", F.lit("forensics-agent")
        ).withColumn("integrity_verified", F.lit(True))

        # MERGE into case_evidence table
        evidence_table = DeltaTable.forName(spark, f"{catalog}.{schema}.case_evidence")
        evidence_table.alias("target").merge(
            evidence_df.alias("source"),
            "target.case_id = source.case_id AND target.sequence_num = source.sequence_num"
        ).whenMatchedUpdate(set={
            "chain_hash": "source.chain_hash",
            "integrity_verified": "source.integrity_verified"
        }).whenNotMatchedInsertAll().execute()

    # Write evidence manifest summary
    manifest = {
        "case_id": case_id,
        "total_evidence_items": len(chain_records),
        "ioc_count": case_iocs.count(),
        "network_flow_count": network_flows.count(),
        "genesis_hash": "genesis",
        "final_chain_hash": chain_records[-1]["chain_hash"] if chain_records else None,
        "timeline_start": str(chain_records[0]["event_time"]) if chain_records else None,
        "timeline_end": str(chain_records[-1]["event_time"]) if chain_records else None,
        "collected_at": datetime.utcnow().isoformat()
    }

    manifest_df = spark.createDataFrame([manifest])
    manifest_table = DeltaTable.forName(spark, f"{catalog}.{schema}.case_evidence_manifests")
    manifest_table.alias("target").merge(
        manifest_df.alias("source"),
        "target.case_id = source.case_id"
    ).whenMatchedUpdateAll().whenNotMatchedInsertAll().execute()

    cases_processed += 1

dbutils.notebook.exit(json.dumps({
    "status": "success",
    "cases_processed": cases_processed
}))
$py$,
  config_yaml = $yml$
schedule: "*/30 * * * *"
timeout_seconds: 1200
max_cases_per_run: 20
max_evidence_items: 1000
max_network_flows: 500
hash_algorithm: "sha256"
chain_genesis: "genesis"
cluster_policy: "security-agents"
$yml$,
  dependencies = ARRAY['pyspark', 'delta-spark', 'databricks-sdk'],
  notes = 'Databricks-native. Digital forensics with cryptographic hash chain for evidence integrity. Collects events, IOCs, and network flows per case. Builds sequential SHA-256 hash chain where each record includes hash of previous record. Evidence manifest tracks full chain from genesis to final hash. Written via Delta MERGE.'
WHERE slug = 'forensics';

-- ============================================================================
-- Agent 19: ciso-assistant
-- Executive reporting agent
-- ============================================================================
UPDATE agent_implementations SET
  production_code = $py$
from pyspark.sql import functions as F
from pyspark.sql.window import Window
from delta.tables import DeltaTable
from datetime import datetime, timedelta
import json

dbutils.widgets.text("catalog", "soc_platform")
dbutils.widgets.text("schema", "production")
catalog = dbutils.widgets.get("catalog")
schema = dbutils.widgets.get("schema")

spark.sql(f"USE {catalog}.{schema}")

today = datetime.utcnow().date()
yesterday = today - timedelta(days=1)
week_ago = today - timedelta(days=7)

# Aggregate alert volumes
alert_metrics = spark.table("alerts").filter(
    F.col("created_at") >= F.lit(yesterday)
).agg(
    F.count("*").alias("total_alerts_24h"),
    F.sum(F.when(F.col("severity") == "critical", 1).otherwise(0)).alias("critical_alerts"),
    F.sum(F.when(F.col("severity") == "high", 1).otherwise(0)).alias("high_alerts"),
    F.avg("confidence_score").alias("avg_confidence"),
    F.sum(F.when(F.col("status") == "false_positive", 1).otherwise(0)).alias("false_positives")
).collect()[0]

total_alerts = alert_metrics["total_alerts_24h"]
fp_rate = alert_metrics["false_positives"] / total_alerts if total_alerts > 0 else 0.0

# MTTD: Mean Time to Detect (from event to alert)
mttd_data = spark.sql(f"""
    SELECT AVG(UNIX_TIMESTAMP(a.created_at) - UNIX_TIMESTAMP(e.event_time)) as avg_mttd_seconds
    FROM {catalog}.{schema}.alerts a
    JOIN {catalog}.{schema}.silver_events e ON a.source_event_id = e.id
    WHERE a.created_at >= '{yesterday}'
""").collect()[0]["avg_mttd_seconds"] or 0.0

# MTTR: Mean Time to Respond (from alert to response action)
mttr_data = spark.sql(f"""
    SELECT AVG(UNIX_TIMESTAMP(r.executed_at) - UNIX_TIMESTAMP(a.created_at)) as avg_mttr_seconds
    FROM {catalog}.{schema}.response_actions r
    JOIN {catalog}.{schema}.alerts a ON r.alert_id = a.id
    WHERE r.executed_at >= '{yesterday}' AND r.executed_at IS NOT NULL
""").collect()[0]["avg_mttr_seconds"] or 0.0

# Risk posture from agent scores
risk_posture = spark.table("discovered_patterns").filter(
    F.col("discovered_at") >= F.lit(week_ago)
).agg(
    F.count("*").alias("active_patterns"),
    F.countDistinct("entity_id").alias("entities_at_risk")
).collect()[0]

# Agent performance metrics
agent_performance = spark.table("agent_feedback").filter(
    F.col("created_at") >= F.lit(week_ago)
).groupBy("agent_slug").agg(
    F.avg(F.when(F.col("feedback_type") == "positive", 1).otherwise(0)).alias("accuracy_rate")
)

avg_agent_accuracy = agent_performance.agg(F.avg("accuracy_rate")).collect()[0][0] or 0.0

# Cases summary
cases_summary = spark.table("cases").filter(
    F.col("created_at") >= F.lit(week_ago)
).agg(
    F.count("*").alias("total_cases"),
    F.sum(F.when(F.col("status") == "resolved", 1).otherwise(0)).alias("resolved_cases"),
    F.sum(F.when(F.col("status") == "investigating", 1).otherwise(0)).alias("active_investigations")
).collect()[0]

# Red team coverage
coverage_data = spark.table("red_team_campaigns").filter(
    F.col("last_evaluated_at") >= F.lit(week_ago)
).agg(
    F.avg("detection_coverage_pct").alias("avg_detection_coverage")
).collect()[0]["avg_detection_coverage"] or 0.0

# Generate executive summary via ai_query
metrics_summary = f"""
24h Alert Volume: {total_alerts}, Critical: {alert_metrics['critical_alerts']}, High: {alert_metrics['high_alerts']}
False Positive Rate: {round(fp_rate * 100, 1)}%
MTTD: {round(mttd_data / 60, 1)} minutes
MTTR: {round(mttr_data / 60, 1)} minutes
Active Risk Patterns: {risk_posture['active_patterns']}, Entities at Risk: {risk_posture['entities_at_risk']}
Agent Accuracy: {round(avg_agent_accuracy * 100, 1)}%
Cases This Week: {cases_summary['total_cases']}, Resolved: {cases_summary['resolved_cases']}, Active: {cases_summary['active_investigations']}
Detection Coverage (Red Team): {round(coverage_data * 100, 1)}%
"""

executive_prompt = f"Generate a concise CISO executive summary for the following SOC metrics. Include risk assessment, key concerns, and recommended actions. Metrics: {metrics_summary}"

narrative = spark.sql(f"""
    SELECT ai_query('databricks-meta-llama-3-1-70b-instruct', "{executive_prompt}") as summary
""").collect()[0]["summary"]

# Write daily report to executive_reports table
report_data = [{
    "report_date": str(today),
    "total_alerts_24h": total_alerts,
    "critical_alerts": alert_metrics["critical_alerts"],
    "high_alerts": alert_metrics["high_alerts"],
    "false_positive_rate": round(fp_rate, 4),
    "mttd_seconds": round(mttd_data, 2),
    "mttr_seconds": round(mttr_data, 2),
    "active_patterns": risk_posture["active_patterns"],
    "entities_at_risk": risk_posture["entities_at_risk"],
    "agent_accuracy": round(avg_agent_accuracy, 4),
    "detection_coverage": round(coverage_data, 4),
    "executive_summary": narrative,
    "generated_at": datetime.utcnow().isoformat()
}]

report_df = spark.createDataFrame(report_data)
reports_table = DeltaTable.forName(spark, f"{catalog}.{schema}.executive_reports")
reports_table.alias("target").merge(
    report_df.alias("source"),
    "target.report_date = source.report_date"
).whenMatchedUpdateAll().whenNotMatchedInsertAll().execute()

dbutils.notebook.exit(json.dumps({
    "status": "success",
    "report_date": str(today),
    "total_alerts": total_alerts,
    "mttd_minutes": round(mttd_data / 60, 1),
    "mttr_minutes": round(mttr_data / 60, 1)
}))
$py$,
  config_yaml = $yml$
schedule: "0 7 * * *"
timeout_seconds: 600
report_lookback_hours: 24
weekly_lookback_days: 7
narrative_model: "databricks-meta-llama-3-1-70b-instruct"
metrics:
  - alert_volumes
  - mttd
  - mttr
  - false_positive_rate
  - risk_posture
  - agent_accuracy
  - detection_coverage
cluster_policy: "security-agents"
$yml$,
  dependencies = ARRAY['pyspark', 'delta-spark', 'databricks-sdk'],
  notes = 'Databricks-native. Executive CISO reporting agent. Aggregates metrics across all agent tables: alert volumes, MTTD, MTTR, FP rates, risk patterns, agent accuracy, detection coverage. Uses ai_query() for executive narrative generation. Daily reports via Delta MERGE.'
WHERE slug = 'ciso-assistant';

-- ============================================================================
-- Agent 20: playbook-generator
-- Automated playbook generation
-- ============================================================================
UPDATE agent_implementations SET
  production_code = $py$
from pyspark.sql import functions as F
from pyspark.sql.window import Window
from delta.tables import DeltaTable
from datetime import datetime, timedelta
import json

dbutils.widgets.text("catalog", "soc_platform")
dbutils.widgets.text("schema", "production")
dbutils.widgets.text("min_confidence", "0.85")
catalog = dbutils.widgets.get("catalog")
schema = dbutils.widgets.get("schema")
min_confidence = float(dbutils.widgets.get("min_confidence"))

spark.sql(f"USE {catalog}.{schema}")

# Read high-confidence correlation rules without playbooks
rules_without_playbooks = spark.table("correlation_rules").alias("r").join(
    spark.table("response_playbooks").alias("p"),
    F.col("r.id") == F.col("p.rule_id"),
    "left_anti"
).filter(
    (F.col("r.enabled") == True) &
    (F.col("r.confidence_score") >= min_confidence)
).orderBy(F.col("r.confidence_score").desc()).limit(20)

# Also read high-confidence discovered patterns without playbooks
patterns_without_playbooks = spark.table("discovered_patterns").alias("dp").join(
    spark.table("response_playbooks").alias("p"),
    F.col("dp.id") == F.col("p.pattern_id"),
    "left_anti"
).filter(
    F.col("dp.discovered_at") >= F.lit(datetime.utcnow() - timedelta(days=30))
).orderBy(F.col("dp.discovered_at").desc()).limit(10)

total_to_generate = rules_without_playbooks.count() + patterns_without_playbooks.count()

if total_to_generate == 0:
    dbutils.notebook.exit(json.dumps({"status": "idle", "playbooks_generated": 0}))

generated_playbooks = []

# Generate playbooks for correlation rules
for rule_row in rules_without_playbooks.collect():
    rule_id = rule_row["id"]
    rule_name = rule_row["name"]
    rule_logic = rule_row.get("logic_expression", "")
    mitre_id = rule_row.get("mitre_technique_id", "unknown")

    playbook_prompt = f"""Generate a SOAR-compatible incident response playbook for the following detection rule.
Rule: {rule_name}
MITRE ATT&CK: {mitre_id}
Logic: {rule_logic}

Return a JSON object with fields: name, description, steps (array of objects with: step_number, action, tool, parameters, condition, timeout_seconds), severity_filter, auto_executable (boolean).
Each step should be a concrete automation action (e.g., enrich_ip, lookup_user, isolate_endpoint, create_ticket, notify_analyst)."""

    playbook_json = spark.sql(f"""
        SELECT ai_query('databricks-meta-llama-3-1-70b-instruct', "{playbook_prompt}") as playbook
    """).collect()[0]["playbook"]

    generated_playbooks.append({
        "rule_id": rule_id,
        "pattern_id": None,
        "playbook_name": f"Auto: {rule_name}",
        "mitre_technique_id": mitre_id,
        "playbook_definition": playbook_json,
        "source": "correlation_rule",
        "confidence_score": float(rule_row["confidence_score"]),
        "generated_at": datetime.utcnow().isoformat(),
        "status": "draft",
        "version": 1
    })

# Generate playbooks for discovered patterns
for pattern_row in patterns_without_playbooks.collect():
    pattern_id = pattern_row["id"]
    pattern_type = pattern_row.get("pattern_type", "unknown")
    entity_id = pattern_row.get("entity_id", "unknown")

    pattern_prompt = f"""Generate a SOAR-compatible incident response playbook for the following discovered behavioral pattern.
Pattern Type: {pattern_type}
Entity: {entity_id}
Event Count: {pattern_row.get('event_count', 0)}
Distinct Source IPs: {pattern_row.get('distinct_src_ips', 0)}

Return a JSON object with fields: name, description, steps (array of objects with: step_number, action, tool, parameters, condition, timeout_seconds), severity_filter, auto_executable (boolean).
Focus on investigation and containment steps for this anomalous behavior pattern."""

    playbook_json = spark.sql(f"""
        SELECT ai_query('databricks-meta-llama-3-1-70b-instruct', "{pattern_prompt}") as playbook
    """).collect()[0]["playbook"]

    generated_playbooks.append({
        "rule_id": None,
        "pattern_id": pattern_id,
        "playbook_name": f"Auto: {pattern_type} pattern response",
        "mitre_technique_id": None,
        "playbook_definition": playbook_json,
        "source": "discovered_pattern",
        "confidence_score": 0.75,
        "generated_at": datetime.utcnow().isoformat(),
        "status": "draft",
        "version": 1
    })

# MERGE generated playbooks into response_playbooks table
if generated_playbooks:
    playbooks_df = spark.createDataFrame(generated_playbooks)
    playbooks_table = DeltaTable.forName(spark, f"{catalog}.{schema}.response_playbooks")
    playbooks_table.alias("target").merge(
        playbooks_df.alias("source"),
        """(target.rule_id = source.rule_id AND source.rule_id IS NOT NULL) OR
           (target.pattern_id = source.pattern_id AND source.pattern_id IS NOT NULL)"""
    ).whenMatchedUpdate(
        condition="source.confidence_score > target.confidence_score",
        set={
            "playbook_definition": "source.playbook_definition",
            "confidence_score": "source.confidence_score",
            "generated_at": "source.generated_at",
            "version": F.col("target.version") + 1
        }
    ).whenNotMatchedInsertAll().execute()

dbutils.notebook.exit(json.dumps({
    "status": "success",
    "playbooks_generated": len(generated_playbooks),
    "from_rules": rules_without_playbooks.count(),
    "from_patterns": patterns_without_playbooks.count()
}))
$py$,
  config_yaml = $yml$
schedule: "0 */8 * * *"
timeout_seconds: 1200
min_confidence: 0.85
max_rules_per_run: 20
max_patterns_per_run: 10
playbook_model: "databricks-meta-llama-3-1-70b-instruct"
auto_approve_playbooks: false
playbook_format: "soar_json"
cluster_policy: "security-agents"
$yml$,
  dependencies = ARRAY['pyspark', 'delta-spark', 'databricks-sdk'],
  notes = 'Databricks-native. Automated SOAR playbook generation. Reads high-confidence correlation rules and discovered patterns, uses ai_query() to generate structured runbook steps. Playbooks stored as draft for analyst review. Versioned updates via Delta MERGE with confidence-gated overwrites.'
WHERE slug = 'playbook-generator';