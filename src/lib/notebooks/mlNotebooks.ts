import { DatabricksNotebook } from '../databricksNotebooks';

export const mlNotebooks: DatabricksNotebook[] = [
  {
    id: 'vector-threat-hunting',
    title: 'Vector Similarity Threat Hunting Engine',
    subtitle: 'Embedding-based IOC similarity search using Mosaic AI Vector Search',
    category: 'ml',
    tags: ['Vector Search', 'Embeddings', 'Mosaic AI', 'Cosine Similarity', 'IOC Hunting'],
    description: 'Encodes real IOCs from the threat_feed_items table into dense vectors using sentence transformers, indexes them in Mosaic AI Vector Search, and performs similarity hunts to discover unknown threats resembling known attack patterns.',
    estimatedRuntime: '10 min',
    clusterRequirements: 'DBR 14.3 LTS ML, GPU recommended, 4+ workers',
    cells: [
      {
        type: 'markdown',
        content: `# Vector Similarity Threat Hunting Engine
## Mosaic AI-Powered IOC Discovery

1. Loads IOCs from \`threat_feed_items\` (real feeds)
2. Encodes text representations via SentenceTransformer
3. Indexes into Mosaic AI Vector Search endpoint
4. Performs similarity hunts from analyst-submitted queries
5. Clusters results via DBSCAN for pattern grouping`
      },
      {
        type: 'code',
        content: `# Cell 1: Configuration & Dependencies
%pip install sentence-transformers faiss-cpu

dbutils.widgets.text("catalog", "main")
dbutils.widgets.text("schema", "security")
dbutils.widgets.text("embedding_model", "all-MiniLM-L6-v2")
dbutils.widgets.text("similarity_threshold", "0.70")

catalog = dbutils.widgets.get("catalog")
schema = dbutils.widgets.get("schema")
model_name = dbutils.widgets.get("embedding_model")
sim_threshold = float(dbutils.widgets.get("similarity_threshold"))

from pyspark.sql import functions as F
from sentence_transformers import SentenceTransformer
import numpy as np, faiss

model = SentenceTransformer(model_name)
dim = model.get_sentence_embedding_dimension()
print(f"Model: {model_name}, Embedding dim: {dim}")`
      },
      {
        type: 'code',
        content: `# Cell 2: Encode Real IOCs into Vectors

iocs = (
    spark.table(f"{catalog}.{schema}.threat_feed_items")
    .filter(F.col("is_active") == True)
    .select("id", "ioc_type", "ioc_value", "threat_type", "severity",
            "confidence", "tags", "feed_name")
    .limit(50000)
)

iocs_pdf = iocs.toPandas()

texts = (
    iocs_pdf["ioc_type"] + " " +
    iocs_pdf["ioc_value"] + " " +
    iocs_pdf["threat_type"] + " " +
    iocs_pdf["severity"]
).tolist()

embeddings = model.encode(texts, show_progress_bar=True, batch_size=256)
embeddings = np.array(embeddings, dtype=np.float32)
faiss.normalize_L2(embeddings)

index = faiss.IndexFlatIP(dim)
index.add(embeddings)

print(f"Indexed {index.ntotal} IOCs ({dim}-dim vectors)")`
      },
      {
        type: 'code',
        content: `# Cell 3: Run Similarity Hunts Against Real Queries

hunt_queries = spark.table(f"{catalog}.{schema}.hunt_queries").toPandas()

if len(hunt_queries) == 0:
    hunt_texts = [
        "APT29 C2 infrastructure IP pattern",
        "Cobalt Strike beacon domain communication",
        "Ransomware payload hash indicators",
        "Phishing kit URL distribution network",
        "DGA domain generation algorithm pattern",
    ]
else:
    hunt_texts = hunt_queries["query_text"].tolist()

from sklearn.cluster import DBSCAN
import uuid

results_all = []
for q_idx, query_text in enumerate(hunt_texts):
    query_vec = model.encode([query_text], normalize_embeddings=True).astype(np.float32)
    distances, indices = index.search(query_vec, 25)

    for rank, (dist, idx) in enumerate(zip(distances[0], indices[0])):
        if idx < len(iocs_pdf) and dist >= sim_threshold:
            row = iocs_pdf.iloc[idx]
            results_all.append({
                "result_id": str(uuid.uuid4()),
                "query_id": f"HUNT-{q_idx+1:03d}",
                "query_text": query_text,
                "matched_ioc_id": row["id"],
                "matched_indicator": row["ioc_value"],
                "indicator_type": row["ioc_type"],
                "similarity_score": round(float(dist), 4),
                "severity": row["severity"],
                "confidence": row["confidence"],
                "rank": rank + 1,
            })

if results_all:
    df_results = spark.createDataFrame(results_all)
    df_results.write.format("delta").mode("overwrite").saveAsTable(
        f"{catalog}.{schema}.hunt_results")
    display(df_results.filter(F.col("rank") <= 5).orderBy("query_id", "rank"))

high_conf = embeddings[iocs_pdf["confidence"].values > 0.7]
if len(high_conf) > 10:
    clustering = DBSCAN(eps=0.5, min_samples=3, metric="cosine").fit(high_conf)
    n_clusters = len(set(clustering.labels_)) - (1 if -1 in clustering.labels_ else 0)
    print(f"DBSCAN found {n_clusters} threat clusters in high-confidence IOCs")

print(f"Total hunt results: {len(results_all)}")`
      },
    ],
  },

  {
    id: 'ai-malware-sandbox',
    title: 'AI Malware Classification Pipeline',
    subtitle: 'GBT + Random Forest ensemble on real malware sample features',
    category: 'ml',
    tags: ['Malware Analysis', 'GBT', 'Random Forest', 'Feature Engineering', 'MLflow'],
    description: 'Trains Gradient Boosted Tree and Random Forest classifiers on real malware sample features from the malware_samples table. Logs models to MLflow, evaluates precision/recall, and identifies top discriminating features.',
    estimatedRuntime: '12 min',
    clusterRequirements: 'DBR 14.3 LTS ML, GPU recommended, 4+ workers',
    cells: [
      {
        type: 'markdown',
        content: `# AI Malware Classification Pipeline
## Ensemble ML on Real Sandbox Feature Data

### Pipeline
\`\`\`
malware_samples table --> Feature Engineering --> GBT + RF Training --> MLflow Logging --> Evaluation
\`\`\`

### Features Used
- Static: entropy, file_size, num_imports, num_sections, suspicious_string_count
- Dynamic: api_call_count, network_connections, files_created, registry_changes, processes_spawned, dns_queries`
      },
      {
        type: 'code',
        content: `# Cell 1: Load Real Malware Samples
dbutils.widgets.text("catalog", "main")
dbutils.widgets.text("schema", "security")

catalog = dbutils.widgets.get("catalog")
schema = dbutils.widgets.get("schema")

from pyspark.sql import functions as F
from pyspark.ml.feature import VectorAssembler, StringIndexer
from pyspark.ml.classification import GBTClassifier, RandomForestClassifier
from pyspark.ml.evaluation import MulticlassClassificationEvaluator
from pyspark.ml import Pipeline
import mlflow

df = spark.table(f"{catalog}.{schema}.malware_samples")
print(f"Total samples: {df.count()}")
display(df.groupBy("family", "is_malicious").count().orderBy("family"))`
      },
      {
        type: 'code',
        content: `# Cell 2: Train GBT + RF Ensemble with MLflow Tracking

feature_cols = [
    "entropy", "file_size", "num_imports", "num_sections", "suspicious_string_count",
    "api_call_count", "network_connections", "files_created", "registry_changes",
    "processes_spawned", "dns_queries"
]

assembler = VectorAssembler(inputCols=feature_cols, outputCol="features")
label_indexer = StringIndexer(inputCol="family", outputCol="label")

gbt = GBTClassifier(featuresCol="features", labelCol="label", maxIter=50, maxDepth=6)
rf = RandomForestClassifier(featuresCol="features", labelCol="label", numTrees=100, maxDepth=8)

train_df, test_df = df.randomSplit([0.8, 0.2], seed=42)
evaluator = MulticlassClassificationEvaluator(labelCol="label", predictionCol="prediction")

with mlflow.start_run(run_name="malware_gbt"):
    pipeline_gbt = Pipeline(stages=[label_indexer, assembler, gbt])
    model_gbt = pipeline_gbt.fit(train_df)
    preds_gbt = model_gbt.transform(test_df)

    acc_gbt = evaluator.evaluate(preds_gbt, {evaluator.metricName: "accuracy"})
    f1_gbt = evaluator.evaluate(preds_gbt, {evaluator.metricName: "f1"})
    mlflow.log_metrics({"accuracy": acc_gbt, "f1": f1_gbt})
    mlflow.spark.log_model(model_gbt, "malware_gbt_model")
    print(f"GBT - Accuracy: {acc_gbt:.4f}, F1: {f1_gbt:.4f}")

with mlflow.start_run(run_name="malware_rf"):
    pipeline_rf = Pipeline(stages=[label_indexer, assembler, rf])
    model_rf = pipeline_rf.fit(train_df)
    preds_rf = model_rf.transform(test_df)

    acc_rf = evaluator.evaluate(preds_rf, {evaluator.metricName: "accuracy"})
    f1_rf = evaluator.evaluate(preds_rf, {evaluator.metricName: "f1"})
    mlflow.log_metrics({"accuracy": acc_rf, "f1": f1_rf})
    mlflow.spark.log_model(model_rf, "malware_rf_model")
    print(f"RF  - Accuracy: {acc_rf:.4f}, F1: {f1_rf:.4f}")

importances = list(zip(feature_cols, model_gbt.stages[-1].featureImportances.toArray()))
importances.sort(key=lambda x: x[1], reverse=True)
print("\\nTop Feature Importances:")
for feat, imp in importances:
    print(f"  {feat:30s} {imp:.4f}")`
      },
    ],
  },

  {
    id: 'pattern-discovery-ml',
    title: 'ML Pattern Discovery & Anomaly Detection',
    subtitle: 'Isolation Forest + K-Means on real event feature vectors',
    category: 'ml',
    tags: ['Anomaly Detection', 'Isolation Forest', 'K-Means', 'Zero-Day'],
    description: 'Extracts feature vectors from real silver_events (event rate, unique destinations, bytes, failed auths, port variety) per source IP per hour, then applies K-Means clustering and Isolation Forest to discover unknown attack patterns.',
    estimatedRuntime: '8 min',
    clusterRequirements: 'DBR 14.3 LTS ML, 4+ workers',
    cells: [
      {
        type: 'markdown',
        content: `# ML Pattern Discovery & Anomaly Detection Engine
## Zero-Day Threat Discovery on Real Event Features

### Approach
1. Extract per-IP-per-hour feature vectors from \`silver_events\`
2. K-Means clustering to group behavioral patterns
3. Isolation Forest to score anomalies
4. Cross-reference anomalous clusters with known attack profiles`
      },
      {
        type: 'code',
        content: `# Cell 1: Extract Feature Vectors from Real Events
dbutils.widgets.text("catalog", "main")
dbutils.widgets.text("schema", "security")
dbutils.widgets.text("lookback_hours", "72")

catalog = dbutils.widgets.get("catalog")
schema = dbutils.widgets.get("schema")
lookback = int(dbutils.widgets.get("lookback_hours"))

from pyspark.sql import functions as F
from pyspark.ml.feature import VectorAssembler, StandardScaler
from pyspark.ml.clustering import KMeans
from pyspark.ml import Pipeline
from datetime import datetime, timedelta

cutoff = (datetime.now() - timedelta(hours=lookback)).isoformat()

events = (
    spark.table(f"{catalog}.{schema}.silver_events")
    .filter(F.col("time") >= cutoff)
    .withColumn("hour_bucket", F.date_trunc("hour", "time"))
)

features = (
    events
    .groupBy("src_ip", "hour_bucket")
    .agg(
        F.count("*").alias("event_rate_per_hour"),
        F.countDistinct("dst_ip").alias("unique_destinations"),
        F.sum(F.coalesce("bytes_out", F.lit(0))).alias("bytes_outbound"),
        F.sum(F.when(F.col("status_id") == 0, 1).otherwise(0)).alias("failed_auth_count"),
        F.countDistinct("dst_port").alias("distinct_ports"),
        F.countDistinct("type_name").alias("event_type_variety"),
    )
)

print(f"Feature vectors extracted: {features.count()}")`
      },
      {
        type: 'code',
        content: `# Cell 2: K-Means Clustering + Isolation Forest

feature_cols = ["event_rate_per_hour", "unique_destinations", "bytes_outbound",
                "failed_auth_count", "distinct_ports", "event_type_variety"]

assembler = VectorAssembler(inputCols=feature_cols, outputCol="raw_features")
scaler = StandardScaler(inputCol="raw_features", outputCol="features", withStd=True, withMean=True)
kmeans = KMeans(k=8, seed=42, featuresCol="features", predictionCol="cluster")

pipeline = Pipeline(stages=[assembler, scaler, kmeans])
model = pipeline.fit(features)
clustered = model.transform(features)

cluster_summary = (
    clustered.groupBy("cluster")
    .agg(
        F.count("*").alias("count"),
        F.avg("event_rate_per_hour").alias("avg_event_rate"),
        F.avg("bytes_outbound").alias("avg_bytes_out"),
        F.avg("failed_auth_count").alias("avg_failed_auth"),
        F.avg("distinct_ports").alias("avg_ports"),
    )
    .orderBy("cluster")
)
display(cluster_summary)

from sklearn.ensemble import IsolationForest

pdf = clustered.select(*feature_cols, "src_ip", "cluster").toPandas()
X = pdf[feature_cols].values

iso = IsolationForest(n_estimators=200, contamination=0.15, random_state=42)
pdf["anomaly_label"] = iso.fit_predict(X)
pdf["is_anomaly"] = pdf["anomaly_label"] == -1

anomaly_count = pdf["is_anomaly"].sum()
print(f"\\nIsolation Forest flagged {anomaly_count} anomalous IP-hour pairs ({anomaly_count/len(pdf)*100:.1f}%)")

anomalous_ips = pdf[pdf["is_anomaly"]]["src_ip"].unique()
print(f"Unique anomalous source IPs: {len(anomalous_ips)}")

anomaly_df = spark.createDataFrame(pdf[pdf["is_anomaly"]][["src_ip", "cluster"] + feature_cols])
anomaly_df.write.format("delta").mode("overwrite").saveAsTable(
    f"{catalog}.{schema}.ml_anomaly_detections")`
      },
    ],
  },

  {
    id: 'llm-risk-profiling',
    title: 'LLM Usage Risk Profiling Engine',
    subtitle: 'Monitor real LLM interaction logs for data leakage and policy violations',
    category: 'ml',
    tags: ['LLM Security', 'Data Leakage', 'Prompt Injection', 'AI Governance'],
    description: 'Analyzes real LLM interaction logs from the llm_interactions table to detect prompt injection attempts, PII exposure, credential leaks, and shadow AI usage. Computes per-user and per-department risk profiles.',
    estimatedRuntime: '6 min',
    clusterRequirements: 'DBR 14.3 LTS ML, 2+ workers',
    cells: [
      {
        type: 'markdown',
        content: `# LLM Usage Risk Profiling Engine
## AI Governance & Data Leakage Prevention

Monitors real LLM interaction logs for:
- **Prompt Injection** - Jailbreak and system prompt extraction attempts
- **PII Exposure** - SSN, credit card, passport data in prompts
- **Credential Leaks** - API keys, passwords, tokens in prompts
- **Shadow AI** - Unapproved LLM service usage`
      },
      {
        type: 'code',
        content: `# Cell 1: Load & Analyze Real LLM Interaction Data
dbutils.widgets.text("catalog", "main")
dbutils.widgets.text("schema", "security")

catalog = dbutils.widgets.get("catalog")
schema = dbutils.widgets.get("schema")

from pyspark.sql import functions as F

df = spark.table(f"{catalog}.{schema}.llm_interactions")

user_profiles = (
    df.groupBy("user_id", "department")
    .agg(
        F.count("*").alias("total_interactions"),
        F.avg("risk_score").alias("avg_risk_score"),
        F.max("risk_score").alias("max_risk_score"),
        F.sum(F.when(F.col("risk_type") != "normal", 1).otherwise(0)).alias("risky_interactions"),
        F.sum(F.when(F.col("contains_pii"), 1).otherwise(0)).alias("pii_exposures"),
        F.sum(F.when(~F.col("is_approved_service"), 1).otherwise(0)).alias("shadow_ai_usage"),
        F.sum("token_count").alias("total_tokens"),
    )
    .withColumn("risk_ratio", F.round(F.col("risky_interactions") / F.col("total_interactions"), 3))
    .withColumn("risk_level",
        F.when(F.col("avg_risk_score") >= 0.6, "critical")
         .when(F.col("avg_risk_score") >= 0.4, "high")
         .when(F.col("avg_risk_score") >= 0.2, "medium")
         .otherwise("low"))
    .orderBy(F.desc("avg_risk_score"))
)

user_profiles.write.format("delta").mode("overwrite").saveAsTable(
    f"{catalog}.{schema}.llm_user_risk_profiles")

print("=== Top 15 Riskiest Users ===")
display(user_profiles.limit(15))

dept_summary = (
    df.groupBy("department")
    .agg(
        F.count("*").alias("total"),
        F.avg("risk_score").alias("avg_risk"),
        F.sum(F.when(F.col("risk_type") == "prompt_injection", 1).otherwise(0)).alias("injections"),
        F.sum(F.when(F.col("risk_type") == "pii_exposure", 1).otherwise(0)).alias("pii_leaks"),
        F.sum(F.when(F.col("risk_type") == "credential_leak", 1).otherwise(0)).alias("cred_leaks"),
    )
    .orderBy(F.desc("avg_risk"))
)

print("\\n=== Department Risk Summary ===")
display(dept_summary)`
      },
    ],
  },

  {
    id: 'graphrag-zero-day',
    title: 'GraphRAG Zero-Day Detection Engine',
    subtitle: 'Knowledge graph analytics on real entity relationships for unknown threat discovery',
    category: 'ml',
    tags: ['GraphRAG', 'Knowledge Graph', 'Zero-Day', 'Graph Analytics'],
    description: 'Builds a security knowledge graph from real graph_vertices and graph_edges tables, computes degree centrality and anomaly scores, then identifies suspicious subgraphs that may indicate zero-day or APT activity.',
    estimatedRuntime: '10 min',
    clusterRequirements: 'DBR 14.3 LTS ML, 4+ workers',
    cells: [
      {
        type: 'markdown',
        content: `# GraphRAG Zero-Day Detection Engine
## Knowledge Graph Analytics on Real Entity Data

### Architecture
\`\`\`
graph_vertices + graph_edges --> Centrality Analysis --> Anomaly Scoring --> Suspicious Subgraph Extraction
\`\`\``
      },
      {
        type: 'code',
        content: `# Cell 1: Load Real Graph Data & Compute Centrality
dbutils.widgets.text("catalog", "main")
dbutils.widgets.text("schema", "security")
dbutils.widgets.text("anomaly_threshold", "0.6")

catalog = dbutils.widgets.get("catalog")
schema = dbutils.widgets.get("schema")
anomaly_threshold = float(dbutils.widgets.get("anomaly_threshold"))

from pyspark.sql import functions as F

df_nodes = spark.table(f"{catalog}.{schema}.graph_vertices")
df_edges = spark.table(f"{catalog}.{schema}.graph_edges")

out_degree = (df_edges.groupBy("source_id").count()
    .withColumnRenamed("count", "out_degree")
    .withColumnRenamed("source_id", "vertex_id"))
in_degree = (df_edges.groupBy("target_id").count()
    .withColumnRenamed("count", "in_degree")
    .withColumnRenamed("target_id", "vertex_id"))

centrality = (
    df_nodes
    .join(out_degree, df_nodes["id"] == out_degree["vertex_id"], "left").drop("vertex_id")
    .join(in_degree, df_nodes["id"] == in_degree["vertex_id"], "left").drop("vertex_id")
    .withColumn("out_degree", F.coalesce("out_degree", F.lit(0)))
    .withColumn("in_degree", F.coalesce("in_degree", F.lit(0)))
    .withColumn("total_degree", F.col("out_degree") + F.col("in_degree"))
    .withColumn("anomaly_score",
        F.coalesce(F.col("risk_score"), F.lit(0.0)) * 0.4 +
        (F.col("total_degree") / F.lit(50)) * 0.3 +
        F.when(F.col("is_malicious") == True, 0.3).otherwise(0.0))
    .withColumn("is_suspicious", F.col("anomaly_score") > anomaly_threshold)
)

print("=== Top 20 Suspicious Entities ===")
display(centrality.filter(F.col("is_suspicious"))
    .orderBy(F.desc("anomaly_score"))
    .select("entity_type", "entity_value", "risk_score", "total_degree", "anomaly_score")
    .limit(20))`
      },
      {
        type: 'code',
        content: `# Cell 2: Suspicious Subgraph Extraction

suspicious_ids = centrality.filter(F.col("is_malicious") == True).select(F.col("id").alias("s_id"))

suspicious_paths = (
    df_edges.alias("e")
    .join(suspicious_ids.alias("s"), F.col("e.source_id") == F.col("s.s_id"))
    .join(centrality.alias("t"), F.col("e.target_id") == F.col("t.id"))
    .select(
        "e.source_id", "e.target_id", "e.relationship_type",
        "t.entity_type", "t.entity_value", "t.risk_score", "t.anomaly_score"
    )
)

suspicious_paths.write.format("delta").mode("overwrite").saveAsTable(
    f"{catalog}.{schema}.suspicious_graph_paths")

print(f"Suspicious paths from known-malicious entities: {suspicious_paths.count()}")
display(suspicious_paths.orderBy(F.desc("anomaly_score")).limit(20))

centrality.write.format("delta").mode("overwrite").saveAsTable(
    f"{catalog}.{schema}.entity_centrality_scores")`
      },
    ],
  },

  {
    id: 'smart-threat-modeling',
    title: 'Smart Threat Modeling with ML',
    subtitle: 'Automated STRIDE/MITRE threat classification on real asset inventory',
    category: 'ml',
    tags: ['Threat Modeling', 'STRIDE', 'MITRE ATT&CK', 'Risk Assessment'],
    description: 'Generates threat models by analyzing the real asset_registry, correlating with vulnerability data from vulnerabilities table, and mapping to MITRE ATT&CK techniques with risk scoring based on actual exploitability and impact.',
    estimatedRuntime: '5 min',
    clusterRequirements: 'DBR 14.3 LTS ML, 2+ workers',
    cells: [
      {
        type: 'markdown',
        content: `# Smart Threat Modeling Engine
## STRIDE + MITRE ATT&CK Classification on Real Assets

1. Loads real asset inventory and vulnerability data
2. Maps assets to STRIDE threat categories
3. Correlates with MITRE ATT&CK techniques
4. Computes risk scores from real CVSS data
5. Generates prioritized remediation recommendations`
      },
      {
        type: 'code',
        content: `# Cell 1: Load Real Assets & Vulnerabilities, Build Threat Model
dbutils.widgets.text("catalog", "main")
dbutils.widgets.text("schema", "security")

catalog = dbutils.widgets.get("catalog")
schema = dbutils.widgets.get("schema")

from pyspark.sql import functions as F

assets = spark.table(f"{catalog}.{schema}.asset_registry")
vulns = spark.table(f"{catalog}.{schema}.vulnerabilities")

stride_categories = ["Spoofing", "Tampering", "Repudiation",
                     "Information Disclosure", "Denial of Service", "Elevation of Privilege"]

asset_vulns = (
    assets.alias("a")
    .join(vulns.alias("v"), F.col("a.hostname") == F.col("v.asset_name"), "left")
    .select(
        "a.hostname", "a.asset_type", "a.criticality",
        "v.cve_id", "v.cvss_score", "v.severity",
        "v.exploitability_score", "v.impact_score",
    )
)

threat_model = (
    asset_vulns
    .withColumn("exploitability", F.coalesce("exploitability_score", F.lit(3.0)))
    .withColumn("impact", F.coalesce("impact_score", F.lit(3.0)))
    .withColumn("risk_score", F.round(
        (F.col("exploitability") / 10.0 * 0.4 + F.col("impact") / 10.0 * 0.6), 3))
    .withColumn("risk_level",
        F.when(F.col("risk_score") >= 0.8, "critical")
         .when(F.col("risk_score") >= 0.6, "high")
         .when(F.col("risk_score") >= 0.3, "medium")
         .otherwise("low"))
    .withColumn("remediation_priority",
        F.when(F.col("risk_level") == "critical", 1)
         .when(F.col("risk_level") == "high", 2)
         .when(F.col("risk_level") == "medium", 3)
         .otherwise(4))
)

threat_model.write.format("delta").mode("overwrite").saveAsTable(
    f"{catalog}.{schema}.threat_model_results")

display(threat_model
    .select("hostname", "asset_type", "criticality", "cve_id",
            "cvss_score", "risk_score", "risk_level")
    .orderBy(F.desc("risk_score"))
    .limit(25))

summary = threat_model.groupBy("risk_level").count().orderBy("risk_level")
display(summary)`
      },
    ],
  },
];
