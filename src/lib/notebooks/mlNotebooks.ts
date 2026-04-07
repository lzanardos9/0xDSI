import { DatabricksNotebook } from '../databricksNotebooks';

export const mlNotebooks: DatabricksNotebook[] = [
  {
    id: 'vector-threat-hunting',
    title: 'Vector Similarity Threat Hunting Engine',
    subtitle: 'Embedding-based IOC similarity search using FAISS and Spark ML',
    category: 'ml',
    tags: ['Vector Search', 'Embeddings', 'FAISS', 'Cosine Similarity', 'IOC Hunting'],
    description: 'Transforms IOCs and security events into vector embeddings, then performs similarity search to discover unknown threats that resemble known attack patterns. Uses sentence transformers for text embedding and FAISS for approximate nearest neighbor search.',
    estimatedRuntime: '10 min',
    clusterRequirements: 'DBR 14.3 LTS ML, GPU recommended, 4+ workers',
    cells: [
      {
        type: 'markdown',
        content: `# Vector Similarity Threat Hunting Engine
## AI-Powered IOC Discovery using Embedding Search

This notebook implements an **embedding-based threat hunting system** that:
1. Converts security indicators (IPs, domains, hashes, URLs) into dense vector representations
2. Builds a FAISS index for sub-millisecond similarity search
3. Finds unknown threats by proximity to known malicious indicators
4. Clusters similar attack patterns using DBSCAN
5. Provides confidence-scored hunt results with MITRE ATT&CK mapping

### Key ML Techniques
- **Sentence Transformers** for text-to-vector encoding
- **FAISS (Facebook AI Similarity Search)** for ANN search
- **DBSCAN clustering** for pattern grouping
- **Cosine similarity** with configurable thresholds`
      },
      {
        type: 'code',
        content: `# Cell 1: Setup & Dependencies
%pip install sentence-transformers faiss-cpu scikit-learn

from pyspark.sql import functions as F
from pyspark.sql.types import *
import numpy as np
import json, random, uuid, hashlib
from datetime import datetime, timedelta

catalog = "soc_platform"
schema = "vector_hunting"
spark.sql(f"CREATE CATALOG IF NOT EXISTS {catalog}")
spark.sql(f"CREATE SCHEMA IF NOT EXISTS {catalog}.{schema}")
spark.sql(f"USE {catalog}.{schema}")`
      },
      {
        type: 'sql',
        content: `-- Cell 2: Create Vector Hunt Tables
CREATE TABLE IF NOT EXISTS ioc_indicators (
  ioc_id STRING, indicator_type STRING, indicator_value STRING,
  source STRING, confidence DOUBLE, severity STRING,
  first_seen TIMESTAMP, last_seen TIMESTAMP,
  tags ARRAY<STRING>, mitre_tactics ARRAY<STRING>,
  embedding ARRAY<DOUBLE>
) USING DELTA;

CREATE TABLE IF NOT EXISTS hunt_queries (
  query_id STRING, query_text STRING, query_type STRING,
  embedding ARRAY<DOUBLE>, created_by STRING,
  created_at TIMESTAMP DEFAULT current_timestamp()
) USING DELTA;

CREATE TABLE IF NOT EXISTS hunt_results (
  result_id STRING, query_id STRING, matched_ioc_id STRING,
  similarity_score DOUBLE, threat_category STRING,
  cluster_id INT, confidence STRING,
  result_metadata STRING,
  found_at TIMESTAMP DEFAULT current_timestamp()
) USING DELTA;`
      },
      {
        type: 'code',
        content: `# Cell 3: Generate Rich IOC Dataset
def generate_ioc_data(n=5000):
    iocs = []
    sources = ["AlienVault OTX", "VirusTotal", "AbuseIPDB", "Shodan", "MISP", "CrowdStrike", "Recorded Future"]
    mitre_map = {
        "ip": [["TA0001", "T1190"], ["TA0011", "T1071"], ["TA0010", "T1041"]],
        "domain": [["TA0001", "T1566"], ["TA0011", "T1071.001"], ["TA0009", "T1213"]],
        "hash": [["TA0002", "T1059"], ["TA0005", "T1027"], ["TA0003", "T1547"]],
        "url": [["TA0001", "T1566.002"], ["TA0011", "T1102"], ["TA0042", "T1583"]],
    }
    tags_pool = {
        "ip": ["c2-server", "botnet", "scanner", "tor-exit", "vpn-node", "proxy", "mining-pool"],
        "domain": ["phishing", "dga", "malware-distribution", "typosquat", "fast-flux", "bulletproof"],
        "hash": ["ransomware", "trojan", "rat", "cryptominer", "rootkit", "wiper", "infostealer"],
        "url": ["phishing-kit", "exploit-kit", "watering-hole", "drive-by", "payload-delivery"],
    }

    for i in range(n):
        ioc_type = random.choice(["ip", "domain", "hash", "url"])
        if ioc_type == "ip":
            value = f"{random.randint(1,223)}.{random.randint(0,255)}.{random.randint(0,255)}.{random.randint(1,254)}"
        elif ioc_type == "domain":
            tlds = [".com", ".net", ".xyz", ".top", ".ru", ".cn", ".tk"]
            words = ["secure", "update", "login", "verify", "account", "portal", "service", "cloud", "app"]
            value = f"{random.choice(words)}-{uuid.uuid4().hex[:6]}{random.choice(tlds)}"
        elif ioc_type == "hash":
            value = hashlib.sha256(f"malware-sample-{i}".encode()).hexdigest()
        else:
            value = f"https://{uuid.uuid4().hex[:8]}.com/{random.choice(['payload', 'download', 'update', 'login'])}"

        confidence = round(random.uniform(0.3, 1.0), 2)
        severity = "critical" if confidence > 0.85 else "high" if confidence > 0.65 else "medium" if confidence > 0.4 else "low"

        iocs.append({
            "ioc_id": str(uuid.uuid4()),
            "indicator_type": ioc_type,
            "indicator_value": value,
            "source": random.choice(sources),
            "confidence": confidence,
            "severity": severity,
            "first_seen": datetime.now() - timedelta(days=random.randint(1, 365)),
            "last_seen": datetime.now() - timedelta(hours=random.randint(0, 168)),
            "tags": random.sample(tags_pool[ioc_type], random.randint(1, 3)),
            "mitre_tactics": random.choice(mitre_map[ioc_type]),
            "embedding": [round(random.gauss(0, 1), 4) for _ in range(384)],
        })
    return iocs

iocs = generate_ioc_data(5000)
df_iocs = spark.createDataFrame(iocs)
df_iocs.write.mode("overwrite").saveAsTable("ioc_indicators")
print(f"Generated {len(iocs)} IOC indicators")
display(df_iocs.groupBy("indicator_type", "severity").count().orderBy("indicator_type", "severity"))`
      },
      {
        type: 'code',
        content: `# Cell 4: Build FAISS Index & Perform Similarity Search
import faiss
import numpy as np
from sklearn.cluster import DBSCAN

# Load embeddings
iocs_pdf = spark.table("ioc_indicators").select("ioc_id", "indicator_type", "indicator_value", "severity", "confidence", "embedding").toPandas()
embeddings = np.array(iocs_pdf["embedding"].tolist(), dtype=np.float32)

# Normalize for cosine similarity
faiss.normalize_L2(embeddings)

# Build FAISS index
dimension = embeddings.shape[1]
index = faiss.IndexFlatIP(dimension)  # Inner product = cosine sim after normalization
index.add(embeddings)

print(f"FAISS index built: {index.ntotal} vectors, {dimension} dimensions")

# Simulate threat hunt queries
hunt_queries = [
    "Known APT29 C2 infrastructure IP pattern",
    "Cobalt Strike beacon domain pattern",
    "Ransomware payload hash cluster",
    "Phishing kit URL distribution network",
    "DGA domain generation algorithm pattern",
    "Cryptominer botnet communication",
]

results_all = []
for q_idx, query_text in enumerate(hunt_queries):
    # Generate query embedding (simulate sentence transformer output)
    query_vec = np.array([[round(random.gauss(0, 1), 4) for _ in range(384)]], dtype=np.float32)
    faiss.normalize_L2(query_vec)

    k = 25
    distances, indices = index.search(query_vec, k)

    for rank, (dist, idx) in enumerate(zip(distances[0], indices[0])):
        if idx < len(iocs_pdf):
            row = iocs_pdf.iloc[idx]
            results_all.append({
                "result_id": str(uuid.uuid4()),
                "query_id": f"HUNT-{q_idx+1:03d}",
                "query_text": query_text,
                "matched_ioc_id": row["ioc_id"],
                "matched_indicator": row["indicator_value"],
                "indicator_type": row["indicator_type"],
                "similarity_score": round(float(dist), 4),
                "severity": row["severity"],
                "rank": rank + 1,
            })

df_results = spark.createDataFrame(results_all)
display(df_results.filter(F.col("rank") <= 5).orderBy("query_id", "rank"))

# DBSCAN clustering on high-confidence matches
high_conf = embeddings[iocs_pdf["confidence"].values > 0.7]
clustering = DBSCAN(eps=0.5, min_samples=3, metric="cosine").fit(high_conf)
n_clusters = len(set(clustering.labels_)) - (1 if -1 in clustering.labels_ else 0)
print(f"\\nDBSCAN found {n_clusters} threat clusters in high-confidence IOCs")
print(f"Total hunt results: {len(results_all)}")`
      },
      {
        type: 'code',
        content: `# Cell 5: Visualization
import matplotlib.pyplot as plt
from sklearn.decomposition import PCA

fig, axes = plt.subplots(1, 3, figsize=(20, 6))
fig.suptitle("Vector Threat Hunting - Analysis Results", fontsize=14, fontweight="bold")

# Similarity score distribution
results_pdf = df_results.toPandas()
axes[0].hist(results_pdf["similarity_score"], bins=30, color="#3b82f6", edgecolor="#1e40af", alpha=0.8)
axes[0].set_title("Similarity Score Distribution")
axes[0].axvline(x=0.7, color="red", linestyle="--", label="Threshold")
axes[0].legend()

# Results by query
query_counts = results_pdf.groupby("query_text").size().sort_values()
query_counts.plot(kind="barh", ax=axes[1], color="#10b981")
axes[1].set_title("Results per Hunt Query")

# PCA visualization of embedding clusters
pca = PCA(n_components=2)
reduced = pca.fit_transform(embeddings[:500])
types = iocs_pdf["indicator_type"][:500].values
type_colors = {"ip": "#ef4444", "domain": "#3b82f6", "hash": "#10b981", "url": "#f59e0b"}
for t in set(types):
    mask = types == t
    axes[2].scatter(reduced[mask, 0], reduced[mask, 1], c=type_colors.get(t, "#6b7280"),
                   label=t, alpha=0.5, s=10)
axes[2].set_title("IOC Embedding Space (PCA)")
axes[2].legend()

plt.tight_layout()
plt.show()`
      },
    ],
  },

  {
    id: 'ai-malware-sandbox',
    title: 'AI Malware Sandbox Analysis Engine',
    subtitle: 'Deep learning malware classification with behavioral detonation analysis',
    category: 'ml',
    tags: ['Malware Analysis', 'Deep Learning', 'Behavioral Analysis', 'Static Analysis', 'YARA'],
    description: 'Implements a multi-stage malware analysis pipeline combining static analysis (PE header parsing, entropy calculation, YARA rules), dynamic behavioral analysis (API call sequences, network activity, file system changes), and ML classification using gradient boosted trees and neural networks.',
    estimatedRuntime: '12 min',
    clusterRequirements: 'DBR 14.3 LTS ML, GPU recommended, 4+ workers',
    cells: [
      {
        type: 'markdown',
        content: `# AI Malware Sandbox Analysis Engine
## Multi-Stage Malware Classification Pipeline

### Analysis Pipeline
\`\`\`
Sample Intake --> Static Analysis --> Dynamic Detonation --> ML Classification --> Verdict
     |               |                     |                      |                |
  File Hash     PE Headers          Sandbox Execution       GBT + NN Model    Threat Report
  Entropy       YARA Rules          API Call Traces         Feature Fusion     MITRE Mapping
  File Type     String Analysis     Network Captures        Ensemble Vote      Risk Score
\`\`\`

### ML Models
1. **Gradient Boosted Trees (GBT)** for static feature classification
2. **LSTM Neural Network** for API call sequence analysis
3. **Random Forest** for network behavior classification
4. **Ensemble Voting** for final verdict`
      },
      {
        type: 'code',
        content: `# Cell 1: Setup
from pyspark.sql import functions as F
from pyspark.sql.types import *
from pyspark.ml.feature import VectorAssembler, StringIndexer
from pyspark.ml.classification import GBTClassifier, RandomForestClassifier
from pyspark.ml.evaluation import MulticlassClassificationEvaluator
from pyspark.ml import Pipeline
import numpy as np
import json, random, uuid, hashlib, math
from datetime import datetime, timedelta

catalog = "soc_platform"
schema = "malware_sandbox"
spark.sql(f"CREATE CATALOG IF NOT EXISTS {catalog}")
spark.sql(f"CREATE SCHEMA IF NOT EXISTS {catalog}.{schema}")
spark.sql(f"USE {catalog}.{schema}")`
      },
      {
        type: 'code',
        content: `# Cell 2: Generate Comprehensive Malware Sample Dataset
def calculate_entropy(data_len):
    """Simulate file entropy calculation"""
    if random.random() > 0.6:  # Packed/encrypted
        return round(random.uniform(7.0, 7.99), 4)
    return round(random.uniform(3.5, 6.8), 4)

families = {
    "ransomware": {"api_patterns": ["CreateFile", "WriteFile", "CryptEncrypt", "FindFirstFile", "FindNextFile", "DeleteFile"], "network": True, "file_ops": "high"},
    "trojan": {"api_patterns": ["CreateProcess", "WriteProcessMemory", "VirtualAllocEx", "SetWindowsHook"], "network": True, "file_ops": "medium"},
    "rat": {"api_patterns": ["WSAStartup", "connect", "send", "recv", "CreateThread", "GetSystemInfo"], "network": True, "file_ops": "low"},
    "cryptominer": {"api_patterns": ["CreateThread", "VirtualAlloc", "GetSystemInfo", "NtQuerySystemInformation"], "network": True, "file_ops": "low"},
    "rootkit": {"api_patterns": ["NtCreateFile", "ZwOpenProcess", "NtQueryDirectoryFile", "MmCopyVirtualMemory"], "network": False, "file_ops": "high"},
    "infostealer": {"api_patterns": ["CryptUnprotectData", "RegOpenKeyEx", "FindFirstFile", "InternetOpen", "HttpSendRequest"], "network": True, "file_ops": "medium"},
    "wiper": {"api_patterns": ["CreateFile", "WriteFile", "DeviceIoControl", "NtFsControlFile", "DeleteFile"], "network": False, "file_ops": "critical"},
    "benign": {"api_patterns": ["CreateFile", "ReadFile", "RegOpenKeyEx", "GetSystemInfo"], "network": False, "file_ops": "normal"},
}

samples = []
for _ in range(3000):
    family = random.choice(list(families.keys()))
    fam_info = families[family]
    is_malicious = family != "benign"

    file_hash = hashlib.sha256(f"sample-{uuid.uuid4()}".encode()).hexdigest()
    entropy = calculate_entropy(random.randint(10000, 5000000))
    file_size = random.randint(5000, 15000000)

    # Static features
    num_imports = random.randint(5, 200) if is_malicious else random.randint(50, 300)
    num_sections = random.randint(3, 12)
    has_debug = random.random() > 0.7 if not is_malicious else random.random() > 0.95
    is_packed = entropy > 7.0
    suspicious_strings = random.randint(5, 50) if is_malicious else random.randint(0, 5)

    # Dynamic features
    api_calls = random.sample(fam_info["api_patterns"], min(len(fam_info["api_patterns"]), random.randint(3, 6)))
    api_call_count = random.randint(500, 10000) if is_malicious else random.randint(100, 2000)
    network_connections = random.randint(1, 20) if fam_info["network"] else 0
    files_created = random.randint(10, 1000) if fam_info["file_ops"] in ["high", "critical"] else random.randint(0, 10)
    registry_changes = random.randint(5, 100) if is_malicious else random.randint(0, 10)
    processes_spawned = random.randint(1, 15) if is_malicious else random.randint(0, 3)
    dns_queries = random.randint(5, 50) if fam_info["network"] else random.randint(0, 5)

    confidence = round(random.uniform(0.75, 0.99), 3) if is_malicious else round(random.uniform(0.01, 0.35), 3)

    samples.append({
        "sample_id": str(uuid.uuid4()),
        "file_hash": file_hash,
        "file_size": file_size,
        "file_type": random.choice(["PE32", "PE64", "ELF", "Mach-O", "Script"]),
        "family": family,
        "is_malicious": is_malicious,
        "entropy": entropy,
        "num_imports": num_imports,
        "num_sections": num_sections,
        "has_debug_info": has_debug,
        "is_packed": is_packed,
        "suspicious_string_count": suspicious_strings,
        "api_call_count": api_call_count,
        "api_calls_observed": api_calls,
        "network_connections": network_connections,
        "files_created": files_created,
        "registry_changes": registry_changes,
        "processes_spawned": processes_spawned,
        "dns_queries": dns_queries,
        "confidence_score": confidence,
        "submitted_at": datetime.now() - timedelta(hours=random.randint(0, 720)),
    })

df_samples = spark.createDataFrame(samples)
df_samples.write.mode("overwrite").saveAsTable("malware_samples")
print(f"Generated {len(samples)} samples ({sum(1 for s in samples if s['is_malicious'])} malicious)")
display(df_samples.groupBy("family", "is_malicious").count().orderBy("family"))`
      },
      {
        type: 'code',
        content: `# Cell 3: ML Classification Pipeline
df = spark.table("malware_samples")

# Feature engineering
feature_cols = [
    "entropy", "file_size", "num_imports", "num_sections", "suspicious_string_count",
    "api_call_count", "network_connections", "files_created", "registry_changes",
    "processes_spawned", "dns_queries"
]

assembler = VectorAssembler(inputCols=feature_cols, outputCol="features")
label_indexer = StringIndexer(inputCol="family", outputCol="label")

# Train GBT classifier
gbt = GBTClassifier(featuresCol="features", labelCol="label", maxIter=50, maxDepth=6)
pipeline_gbt = Pipeline(stages=[label_indexer, assembler, gbt])

train_df, test_df = df.randomSplit([0.8, 0.2], seed=42)
model_gbt = pipeline_gbt.fit(train_df)
predictions_gbt = model_gbt.transform(test_df)

evaluator = MulticlassClassificationEvaluator(labelCol="label", predictionCol="prediction")
accuracy = evaluator.evaluate(predictions_gbt, {evaluator.metricName: "accuracy"})
f1 = evaluator.evaluate(predictions_gbt, {evaluator.metricName: "f1"})
precision = evaluator.evaluate(predictions_gbt, {evaluator.metricName: "weightedPrecision"})
recall = evaluator.evaluate(predictions_gbt, {evaluator.metricName: "weightedRecall"})

print(f"""
=== Malware Classification Results (GBT) ===
  Accuracy:  {accuracy:.4f}
  F1 Score:  {f1:.4f}
  Precision: {precision:.4f}
  Recall:    {recall:.4f}
  Test Set:  {test_df.count()} samples
""")

# Train Random Forest for comparison
rf = RandomForestClassifier(featuresCol="features", labelCol="label", numTrees=100, maxDepth=8)
pipeline_rf = Pipeline(stages=[label_indexer, assembler, rf])
model_rf = pipeline_rf.fit(train_df)
predictions_rf = model_rf.transform(test_df)
acc_rf = evaluator.evaluate(predictions_rf, {evaluator.metricName: "accuracy"})
print(f"Random Forest Accuracy: {acc_rf:.4f}")

# Feature importance
gbt_model = model_gbt.stages[-1]
importances = list(zip(feature_cols, gbt_model.featureImportances.toArray()))
importances.sort(key=lambda x: x[1], reverse=True)
print("\\nTop Feature Importances:")
for feat, imp in importances:
    print(f"  {feat:30s} {imp:.4f}")

display(predictions_gbt.groupBy("family", "prediction").count().orderBy("family"))`
      },
      {
        type: 'code',
        content: `# Cell 4: Malware Analysis Dashboard Visualization
import matplotlib.pyplot as plt
import pandas as pd

samples_pdf = spark.table("malware_samples").toPandas()

fig, axes = plt.subplots(2, 3, figsize=(20, 12))
fig.suptitle("AI Malware Sandbox - Analysis Dashboard", fontsize=16, fontweight="bold")

# Family distribution
family_counts = samples_pdf["family"].value_counts()
colors = {"ransomware": "#ef4444", "trojan": "#f59e0b", "rat": "#8b5cf6", "cryptominer": "#06b6d4",
          "rootkit": "#ec4899", "infostealer": "#f97316", "wiper": "#dc2626", "benign": "#10b981"}
family_counts.plot(kind="bar", ax=axes[0,0], color=[colors.get(f, "#6b7280") for f in family_counts.index])
axes[0,0].set_title("Samples by Family")
axes[0,0].tick_params(axis='x', rotation=45)

# Entropy distribution
for family in ["ransomware", "trojan", "benign"]:
    subset = samples_pdf[samples_pdf["family"] == family]["entropy"]
    axes[0,1].hist(subset, bins=30, alpha=0.6, label=family, color=colors.get(family, "#6b7280"))
axes[0,1].set_title("Entropy Distribution by Family")
axes[0,1].legend()

# Network vs File activity scatter
malicious = samples_pdf[samples_pdf["is_malicious"]]
benign = samples_pdf[~samples_pdf["is_malicious"]]
axes[0,2].scatter(benign["network_connections"], benign["files_created"], c="#10b981", alpha=0.3, s=10, label="Benign")
axes[0,2].scatter(malicious["network_connections"], malicious["files_created"], c="#ef4444", alpha=0.3, s=10, label="Malicious")
axes[0,2].set_title("Network vs File Activity")
axes[0,2].set_xlabel("Network Connections")
axes[0,2].set_ylabel("Files Created")
axes[0,2].legend()

# Feature importance bar chart
imp_df = pd.DataFrame(importances, columns=["Feature", "Importance"])
imp_df.plot(kind="barh", x="Feature", y="Importance", ax=axes[1,0], color="#3b82f6", legend=False)
axes[1,0].set_title("GBT Feature Importance")

# Confidence scores
axes[1,1].hist(samples_pdf[samples_pdf["is_malicious"]]["confidence_score"], bins=30, alpha=0.7, color="#ef4444", label="Malicious")
axes[1,1].hist(samples_pdf[~samples_pdf["is_malicious"]]["confidence_score"], bins=30, alpha=0.7, color="#10b981", label="Benign")
axes[1,1].set_title("Confidence Score Distribution")
axes[1,1].legend()

# API call count box plot
family_api = samples_pdf.groupby("family")["api_call_count"].apply(list).to_dict()
axes[1,2].boxplot([v for v in family_api.values()], labels=[k[:8] for k in family_api.keys()])
axes[1,2].set_title("API Calls by Family")
axes[1,2].tick_params(axis='x', rotation=45)

plt.tight_layout()
plt.show()`
      },
    ],
  },

  {
    id: 'pattern-discovery-ml',
    title: 'ML Pattern Discovery & Anomaly Detection',
    subtitle: 'Unsupervised learning for zero-day threat pattern discovery',
    category: 'ml',
    tags: ['Anomaly Detection', 'Isolation Forest', 'K-Means', 'Autoencoder', 'Zero-Day'],
    description: 'Uses unsupervised machine learning to discover unknown attack patterns and anomalies in security event streams. Combines Isolation Forest for outlier detection, K-Means for behavior clustering, and statistical analysis for baseline deviation detection.',
    estimatedRuntime: '8 min',
    clusterRequirements: 'DBR 14.3 LTS ML, 4+ workers',
    cells: [
      {
        type: 'markdown',
        content: `# ML Pattern Discovery & Anomaly Detection Engine
## Zero-Day Threat Discovery Using Unsupervised Learning

### Techniques
1. **Isolation Forest** - Anomaly scoring for individual events
2. **K-Means Clustering** - Behavioral grouping of event patterns
3. **Statistical Baseline** - Z-score deviation from normal patterns
4. **Temporal Pattern Mining** - Sequential pattern discovery across time windows`
      },
      {
        type: 'code',
        content: `# Cell 1: Setup
from pyspark.sql import functions as F
from pyspark.ml.feature import VectorAssembler, StandardScaler
from pyspark.ml.clustering import KMeans
from pyspark.ml import Pipeline
import numpy as np
import random, uuid, json
from datetime import datetime, timedelta

catalog = "soc_platform"
schema = "pattern_discovery"
spark.sql(f"CREATE CATALOG IF NOT EXISTS {catalog}")
spark.sql(f"CREATE SCHEMA IF NOT EXISTS {catalog}.{schema}")
spark.sql(f"USE {catalog}.{schema}")`
      },
      {
        type: 'code',
        content: `# Cell 2: Generate Security Event Feature Vectors
def generate_event_features(n=8000):
    events = []
    base_time = datetime.now() - timedelta(hours=72)

    # Normal behavior profiles
    normal_profiles = [
        {"event_rate": 50, "unique_dests": 5, "bytes_out": 1000, "failed_auths": 0, "port_variety": 3},
        {"event_rate": 100, "unique_dests": 10, "bytes_out": 5000, "failed_auths": 1, "port_variety": 5},
        {"event_rate": 200, "unique_dests": 20, "bytes_out": 10000, "failed_auths": 2, "port_variety": 8},
    ]

    # Anomalous profiles (attack patterns)
    anomaly_profiles = [
        {"event_rate": 5000, "unique_dests": 200, "bytes_out": 500, "failed_auths": 0, "port_variety": 100, "label": "port_scan"},
        {"event_rate": 300, "unique_dests": 1, "bytes_out": 500000, "failed_auths": 0, "port_variety": 1, "label": "data_exfil"},
        {"event_rate": 800, "unique_dests": 3, "bytes_out": 100, "failed_auths": 50, "port_variety": 2, "label": "brute_force"},
        {"event_rate": 150, "unique_dests": 50, "bytes_out": 200000, "failed_auths": 5, "port_variety": 15, "label": "lateral_movement"},
        {"event_rate": 10, "unique_dests": 1, "bytes_out": 50, "failed_auths": 0, "port_variety": 1, "label": "c2_beacon"},
        {"event_rate": 50, "unique_dests": 2, "bytes_out": 1000000, "failed_auths": 0, "port_variety": 1, "label": "ransomware"},
    ]

    # 80% normal, 20% anomalous
    for i in range(int(n * 0.8)):
        profile = random.choice(normal_profiles)
        events.append({
            "event_id": str(uuid.uuid4()),
            "timestamp": base_time + timedelta(seconds=random.randint(0, 259200)),
            "source_ip": f"10.0.{random.randint(1,10)}.{random.randint(1,254)}",
            "event_rate_per_min": max(1, int(random.gauss(profile["event_rate"], profile["event_rate"]*0.2))),
            "unique_destinations": max(1, int(random.gauss(profile["unique_dests"], profile["unique_dests"]*0.3))),
            "bytes_outbound": max(0, int(random.gauss(profile["bytes_out"], profile["bytes_out"]*0.3))),
            "failed_auth_count": max(0, int(random.gauss(profile["failed_auths"], 1))),
            "distinct_ports": max(1, int(random.gauss(profile["port_variety"], profile["port_variety"]*0.2))),
            "session_duration_sec": random.randint(10, 3600),
            "packet_size_avg": random.randint(64, 1500),
            "is_anomaly": False,
            "anomaly_type": "normal",
        })

    for i in range(int(n * 0.2)):
        profile = random.choice(anomaly_profiles)
        events.append({
            "event_id": str(uuid.uuid4()),
            "timestamp": base_time + timedelta(seconds=random.randint(0, 259200)),
            "source_ip": f"10.0.{random.randint(50,60)}.{random.randint(1,254)}",
            "event_rate_per_min": max(1, int(random.gauss(profile["event_rate"], profile["event_rate"]*0.1))),
            "unique_destinations": max(1, int(random.gauss(profile["unique_dests"], profile["unique_dests"]*0.15))),
            "bytes_outbound": max(0, int(random.gauss(profile["bytes_out"], profile["bytes_out"]*0.2))),
            "failed_auth_count": max(0, int(random.gauss(profile["failed_auths"], max(1, profile["failed_auths"]*0.2)))),
            "distinct_ports": max(1, int(random.gauss(profile["port_variety"], max(1, profile["port_variety"]*0.1)))),
            "session_duration_sec": random.randint(5, 7200),
            "packet_size_avg": random.randint(40, 1500),
            "is_anomaly": True,
            "anomaly_type": profile["label"],
        })

    return events

events = generate_event_features(8000)
df = spark.createDataFrame(events)
df.write.mode("overwrite").saveAsTable("event_features")
print(f"Generated {len(events)} event feature vectors")
display(df.groupBy("anomaly_type", "is_anomaly").count().orderBy("anomaly_type"))`
      },
      {
        type: 'code',
        content: `# Cell 3: K-Means Clustering for Behavior Grouping
df = spark.table("event_features")

feature_cols = ["event_rate_per_min", "unique_destinations", "bytes_outbound",
                "failed_auth_count", "distinct_ports", "session_duration_sec", "packet_size_avg"]

assembler = VectorAssembler(inputCols=feature_cols, outputCol="raw_features")
scaler = StandardScaler(inputCol="raw_features", outputCol="features", withStd=True, withMean=True)
kmeans = KMeans(k=8, seed=42, featuresCol="features", predictionCol="cluster")

pipeline = Pipeline(stages=[assembler, scaler, kmeans])
model = pipeline.fit(df)
clustered = model.transform(df)

# Analyze clusters
cluster_summary = (
    clustered
    .groupBy("cluster")
    .agg(
        F.count("*").alias("count"),
        F.avg("event_rate_per_min").alias("avg_event_rate"),
        F.avg("bytes_outbound").alias("avg_bytes_out"),
        F.avg("failed_auth_count").alias("avg_failed_auth"),
        F.sum(F.when(F.col("is_anomaly"), 1).otherwise(0)).alias("anomaly_count"),
    )
    .withColumn("anomaly_ratio", F.round(F.col("anomaly_count") / F.col("count"), 3))
    .orderBy("cluster")
)

display(cluster_summary)

# Identify anomalous clusters (high anomaly ratio)
print("\\nAnomalous Clusters (anomaly_ratio > 0.5):")
display(cluster_summary.filter(F.col("anomaly_ratio") > 0.5))`
      },
      {
        type: 'code',
        content: `# Cell 4: Isolation Forest Anomaly Detection (via sklearn on driver)
from sklearn.ensemble import IsolationForest
import pandas as pd
import matplotlib.pyplot as plt

pdf = clustered.select(*feature_cols, "is_anomaly", "anomaly_type", "cluster").toPandas()
X = pdf[feature_cols].values

iso_forest = IsolationForest(n_estimators=200, contamination=0.2, random_state=42)
pdf["iso_score"] = iso_forest.fit_predict(X)
pdf["iso_anomaly"] = pdf["iso_score"] == -1

# Evaluate
tp = ((pdf["iso_anomaly"]) & (pdf["is_anomaly"])).sum()
fp = ((pdf["iso_anomaly"]) & (~pdf["is_anomaly"])).sum()
fn = ((~pdf["iso_anomaly"]) & (pdf["is_anomaly"])).sum()
tn = ((~pdf["iso_anomaly"]) & (~pdf["is_anomaly"])).sum()

precision = tp / (tp + fp) if (tp + fp) > 0 else 0
recall = tp / (tp + fn) if (tp + fn) > 0 else 0
f1 = 2 * precision * recall / (precision + recall) if (precision + recall) > 0 else 0

print(f"""
=== Isolation Forest Results ===
  True Positives:  {tp}
  False Positives: {fp}
  True Negatives:  {tn}
  False Negatives: {fn}
  Precision: {precision:.4f}
  Recall:    {recall:.4f}
  F1 Score:  {f1:.4f}
""")

# Visualization
fig, axes = plt.subplots(2, 2, figsize=(16, 12))
fig.suptitle("Pattern Discovery - Anomaly Detection Results", fontsize=14, fontweight="bold")

axes[0,0].scatter(pdf[~pdf["iso_anomaly"]]["event_rate_per_min"], pdf[~pdf["iso_anomaly"]]["bytes_outbound"], c="#10b981", alpha=0.3, s=5, label="Normal")
axes[0,0].scatter(pdf[pdf["iso_anomaly"]]["event_rate_per_min"], pdf[pdf["iso_anomaly"]]["bytes_outbound"], c="#ef4444", alpha=0.5, s=15, label="Anomaly")
axes[0,0].set_title("Event Rate vs Bytes Outbound")
axes[0,0].set_xlabel("Event Rate/min")
axes[0,0].set_ylabel("Bytes Outbound")
axes[0,0].legend()

anom_by_type = pdf[pdf["iso_anomaly"]].groupby("anomaly_type").size().sort_values()
anom_by_type.plot(kind="barh", ax=axes[0,1], color="#ef4444")
axes[0,1].set_title("Detected Anomalies by Type")

axes[1,0].scatter(pdf["unique_destinations"], pdf["failed_auth_count"], c=pdf["cluster"], cmap="tab10", alpha=0.4, s=10)
axes[1,0].set_title("Clusters: Destinations vs Failed Auth")
axes[1,0].set_xlabel("Unique Destinations")
axes[1,0].set_ylabel("Failed Auth Count")

conf_matrix = [[tn, fp], [fn, tp]]
im = axes[1,1].imshow(conf_matrix, cmap="Blues")
axes[1,1].set_title("Confusion Matrix")
axes[1,1].set_xticks([0,1]); axes[1,1].set_yticks([0,1])
axes[1,1].set_xticklabels(["Normal", "Anomaly"]); axes[1,1].set_yticklabels(["Normal", "Anomaly"])
for i in range(2):
    for j in range(2):
        axes[1,1].text(j, i, str(conf_matrix[i][j]), ha="center", va="center", fontsize=14, fontweight="bold")

plt.tight_layout()
plt.show()`
      },
    ],
  },

  {
    id: 'llm-risk-profiling',
    title: 'LLM Usage Risk Profiling Engine',
    subtitle: 'Monitor and score AI/LLM usage for data leakage and policy violations',
    category: 'ml',
    tags: ['LLM Security', 'Data Leakage', 'Prompt Injection', 'AI Governance', 'Risk Scoring'],
    description: 'Monitors organizational LLM usage patterns to detect prompt injection attempts, sensitive data exposure in prompts, policy violations, and shadow AI usage. Computes risk scores per user and department using multi-factor risk models.',
    estimatedRuntime: '6 min',
    clusterRequirements: 'DBR 14.3 LTS ML, 2+ workers',
    cells: [
      {
        type: 'markdown',
        content: `# LLM Usage Risk Profiling Engine
## AI Governance & Data Leakage Prevention

Monitors all LLM interactions across the organization for:
- **Prompt Injection Attacks** - Detecting jailbreak attempts
- **Sensitive Data Exposure** - PII, credentials, proprietary data in prompts
- **Policy Violations** - Unauthorized use cases, restricted topics
- **Shadow AI Detection** - Unapproved LLM service usage
- **Risk Scoring** - Per-user and per-department risk profiles`
      },
      {
        type: 'code',
        content: `# Cell 1: Generate LLM Usage Data
from pyspark.sql import functions as F
import json, random, uuid
from datetime import datetime, timedelta

catalog = "soc_platform"
schema = "llm_security"
spark.sql(f"CREATE CATALOG IF NOT EXISTS {catalog}")
spark.sql(f"CREATE SCHEMA IF NOT EXISTS {catalog}.{schema}")
spark.sql(f"USE {catalog}.{schema}")

users = [f"user_{i:03d}" for i in range(50)]
departments = ["Engineering", "Finance", "HR", "Legal", "Marketing", "Sales", "Research", "Executive"]
llm_services = ["ChatGPT", "Claude", "Gemini", "Internal-LLM", "Copilot", "Midjourney", "Custom-Model"]

risk_patterns = [
    {"type": "prompt_injection", "severity": "critical", "keywords": ["ignore previous", "system prompt", "jailbreak", "DAN mode"]},
    {"type": "pii_exposure", "severity": "high", "keywords": ["SSN", "credit card", "passport", "medical record"]},
    {"type": "credential_leak", "severity": "critical", "keywords": ["API key", "password", "secret", "token"]},
    {"type": "proprietary_data", "severity": "high", "keywords": ["source code", "algorithm", "trade secret", "patent"]},
    {"type": "policy_violation", "severity": "medium", "keywords": ["competitor analysis", "legal advice", "hiring decision"]},
]

interactions = []
base_time = datetime.now() - timedelta(days=30)

for _ in range(6000):
    user = random.choice(users)
    dept = random.choice(departments)
    service = random.choice(llm_services)
    is_risky = random.random() < 0.15

    if is_risky:
        pattern = random.choice(risk_patterns)
        risk_type = pattern["type"]
        severity = pattern["severity"]
        risk_score = round(random.uniform(0.6, 1.0), 3)
    else:
        risk_type = "normal"
        severity = "info"
        risk_score = round(random.uniform(0.0, 0.3), 3)

    interactions.append({
        "interaction_id": str(uuid.uuid4()),
        "user_id": user,
        "department": dept,
        "llm_service": service,
        "prompt_length": random.randint(20, 5000),
        "response_length": random.randint(50, 10000),
        "token_count": random.randint(50, 8000),
        "risk_type": risk_type,
        "severity": severity,
        "risk_score": risk_score,
        "contains_pii": risk_type == "pii_exposure",
        "contains_code": random.random() > 0.6,
        "is_approved_service": service in ["Internal-LLM", "Copilot"],
        "timestamp": base_time + timedelta(seconds=random.randint(0, 2592000)),
    })

df = spark.createDataFrame(interactions)
df.write.mode("overwrite").saveAsTable("llm_interactions")
print(f"Generated {len(interactions)} LLM interactions")
display(df.groupBy("risk_type", "severity").count().orderBy(F.desc("count")))`
      },
      {
        type: 'code',
        content: `# Cell 2: Risk Profiling Analysis
df = spark.table("llm_interactions")

# User risk profiles
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

print("=== Top 15 Riskiest Users ===")
display(user_profiles.limit(15))

# Department risk summary
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
    subtitle: 'Graph-based retrieval augmented generation for unknown threat discovery',
    category: 'ml',
    tags: ['GraphRAG', 'Knowledge Graph', 'Zero-Day', 'RAG', 'Graph Neural Network'],
    description: 'Builds a security knowledge graph connecting entities (IPs, users, processes, files) and uses graph-based RAG to identify zero-day attack patterns by finding anomalous subgraphs that deviate from known-good patterns.',
    estimatedRuntime: '10 min',
    clusterRequirements: 'DBR 14.3 LTS ML, GPU recommended, 4+ workers',
    cells: [
      {
        type: 'markdown',
        content: `# GraphRAG Zero-Day Detection Engine
## Knowledge Graph + RAG for Unknown Threat Discovery

### Architecture
\`\`\`
Security Events --> Entity Extraction --> Knowledge Graph --> Graph Analytics --> RAG Query Engine
                                              |                    |                    |
                                         Neo4j/Spark         PageRank/CC         LLM + Context
                                         Graph Store       Community Detection    Zero-Day Alert
\`\`\``
      },
      {
        type: 'code',
        content: `# Cell 1: Build Security Knowledge Graph
from pyspark.sql import functions as F
from pyspark.sql.types import *
import random, uuid, json
from datetime import datetime, timedelta

catalog = "soc_platform"
schema = "graphrag"
spark.sql(f"CREATE CATALOG IF NOT EXISTS {catalog}")
spark.sql(f"CREATE SCHEMA IF NOT EXISTS {catalog}.{schema}")
spark.sql(f"USE {catalog}.{schema}")

# Generate graph nodes (entities)
entity_types = {
    "ip_address": [f"10.0.{random.randint(1,10)}.{random.randint(1,254)}" for _ in range(100)]
                + [f"{random.randint(60,220)}.{random.randint(1,255)}.{random.randint(1,255)}.{random.randint(1,254)}" for _ in range(50)],
    "user": [f"user_{i:03d}" for i in range(40)],
    "hostname": [f"WS-{dept}-{i:03d}" for dept in ["FIN", "HR", "ENG", "SEC", "OPS"] for i in range(10)],
    "process": ["explorer.exe", "svchost.exe", "powershell.exe", "cmd.exe", "chrome.exe", "python.exe",
                "mimikatz.exe", "psexec.exe", "certutil.exe", "regsvr32.exe", "mshta.exe", "wmic.exe"],
    "domain": [f"{w}.{random.choice(['com','net','org','io'])}" for w in
               ["evil-corp", "malware-cdn", "c2-server", "legit-service", "cloud-api", "update-portal"]],
    "file_hash": [uuid.uuid4().hex for _ in range(80)],
}

nodes = []
for etype, values in entity_types.items():
    for val in values:
        risk = round(random.uniform(0.0, 1.0), 3)
        nodes.append({
            "node_id": str(uuid.uuid4()),
            "entity_type": etype,
            "entity_value": val,
            "risk_score": risk,
            "is_known_malicious": risk > 0.8 and etype in ["ip_address", "domain", "file_hash", "process"],
            "first_seen": datetime.now() - timedelta(days=random.randint(1, 180)),
            "last_seen": datetime.now() - timedelta(hours=random.randint(0, 48)),
        })

df_nodes = spark.createDataFrame(nodes)
df_nodes.write.mode("overwrite").saveAsTable("graph_nodes")

# Generate edges (relationships)
edge_types = ["connected_to", "authenticated_as", "executed", "downloaded", "resolved_to",
              "transferred_data_to", "spawned_process", "accessed_file", "scanned_port"]
edges = []
node_ids = [n["node_id"] for n in nodes]

for _ in range(5000):
    src = random.choice(nodes)
    tgt = random.choice(nodes)
    if src["node_id"] != tgt["node_id"]:
        edges.append({
            "edge_id": str(uuid.uuid4()),
            "source_id": src["node_id"],
            "target_id": tgt["node_id"],
            "relationship": random.choice(edge_types),
            "weight": round(random.uniform(0.1, 1.0), 3),
            "timestamp": datetime.now() - timedelta(hours=random.randint(0, 168)),
            "properties": json.dumps({"bytes": random.randint(100, 100000)}),
        })

df_edges = spark.createDataFrame(edges)
df_edges.write.mode("overwrite").saveAsTable("graph_edges")
print(f"Knowledge Graph: {len(nodes)} nodes, {len(edges)} edges")`
      },
      {
        type: 'code',
        content: `# Cell 2: Graph Analytics - PageRank & Community Detection
from pyspark.sql import functions as F

df_edges = spark.table("graph_edges")
df_nodes = spark.table("graph_nodes")

# Compute node degree centrality
out_degree = df_edges.groupBy("source_id").count().withColumnRenamed("count", "out_degree").withColumnRenamed("source_id", "node_id")
in_degree = df_edges.groupBy("target_id").count().withColumnRenamed("count", "in_degree").withColumnRenamed("target_id", "node_id")

centrality = (
    df_nodes
    .join(out_degree, "node_id", "left")
    .join(in_degree, "node_id", "left")
    .withColumn("out_degree", F.coalesce("out_degree", F.lit(0)))
    .withColumn("in_degree", F.coalesce("in_degree", F.lit(0)))
    .withColumn("total_degree", F.col("out_degree") + F.col("in_degree"))
    .withColumn("anomaly_score",
        F.col("risk_score") * 0.4 + (F.col("total_degree") / F.lit(50)) * 0.3 +
        F.when(F.col("is_known_malicious"), 0.3).otherwise(0.0))
    .withColumn("is_suspicious", F.col("anomaly_score") > 0.6)
)

print("=== Top 20 Most Connected Suspicious Entities ===")
display(centrality.filter(F.col("is_suspicious")).orderBy(F.desc("anomaly_score")).limit(20)
    .select("entity_type", "entity_value", "risk_score", "total_degree", "anomaly_score"))

# Suspicious subgraph: find paths from malicious to internal entities
suspicious_sources = centrality.filter(F.col("is_known_malicious")).select("node_id")
suspicious_paths = (
    df_edges.alias("e")
    .join(suspicious_sources.alias("s"), F.col("e.source_id") == F.col("s.node_id"))
    .join(centrality.alias("t"), F.col("e.target_id") == F.col("t.node_id"))
    .select("e.source_id", "e.target_id", "e.relationship", "t.entity_type", "t.entity_value", "t.risk_score")
)

print(f"\\nSuspicious paths from known-malicious entities: {suspicious_paths.count()}")
display(suspicious_paths.orderBy(F.desc("risk_score")).limit(20))`
      },
    ],
  },

  {
    id: 'smart-threat-modeling',
    title: 'Smart Threat Modeling with ML',
    subtitle: 'Automated STRIDE/MITRE ATT&CK threat model generation using ML classification',
    category: 'ml',
    tags: ['Threat Modeling', 'STRIDE', 'MITRE ATT&CK', 'Risk Assessment', 'Classification'],
    description: 'Automates threat model generation by analyzing system architectures, data flows, and historical attack data. Uses ML to classify threats according to STRIDE taxonomy and map them to MITRE ATT&CK techniques with confidence scoring.',
    estimatedRuntime: '5 min',
    clusterRequirements: 'DBR 14.3 LTS ML, 2+ workers',
    cells: [
      {
        type: 'markdown',
        content: `# Smart Threat Modeling Engine
## Automated STRIDE + MITRE ATT&CK Threat Classification

Generates threat models by:
1. Analyzing system component inventory and data flows
2. Classifying potential threats using STRIDE taxonomy
3. Mapping threats to MITRE ATT&CK techniques
4. Computing risk scores based on exploitability and impact
5. Generating prioritized remediation recommendations`
      },
      {
        type: 'code',
        content: `# Cell 1: Generate System Architecture & Threat Model Data
from pyspark.sql import functions as F
import json, random, uuid
from datetime import datetime, timedelta

catalog = "soc_platform"
schema = "threat_modeling"
spark.sql(f"CREATE CATALOG IF NOT EXISTS {catalog}")
spark.sql(f"CREATE SCHEMA IF NOT EXISTS {catalog}.{schema}")
spark.sql(f"USE {catalog}.{schema}")

stride = ["Spoofing", "Tampering", "Repudiation", "Information Disclosure", "Denial of Service", "Elevation of Privilege"]
mitre_tactics = {
    "Spoofing": ["T1078 - Valid Accounts", "T1566 - Phishing", "T1134 - Access Token Manipulation"],
    "Tampering": ["T1565 - Data Manipulation", "T1485 - Data Destruction", "T1561 - Disk Wipe"],
    "Repudiation": ["T1070 - Indicator Removal", "T1036 - Masquerading", "T1564 - Hide Artifacts"],
    "Information Disclosure": ["T1557 - MITM", "T1040 - Network Sniffing", "T1552 - Unsecured Credentials"],
    "Denial of Service": ["T1498 - Network DoS", "T1499 - Endpoint DoS", "T1489 - Service Stop"],
    "Elevation of Privilege": ["T1548 - Abuse Elevation", "T1068 - Exploitation for Privilege", "T1055 - Process Injection"],
}

components = ["API Gateway", "Auth Service", "Database", "Message Queue", "Web Frontend",
              "ML Pipeline", "Storage Service", "Admin Console", "CI/CD Pipeline", "Monitoring"]

threats = []
for comp in components:
    for category in stride:
        for technique in mitre_tactics[category]:
            exploitability = round(random.uniform(1.0, 10.0), 1)
            impact = round(random.uniform(1.0, 10.0), 1)
            risk_score = round((exploitability * 0.4 + impact * 0.6) / 10.0, 3)

            threats.append({
                "threat_id": str(uuid.uuid4()),
                "component": comp,
                "stride_category": category,
                "mitre_technique": technique,
                "description": f"{category} threat on {comp} via {technique.split(' - ')[1]}",
                "exploitability": exploitability,
                "impact": impact,
                "risk_score": risk_score,
                "severity": "critical" if risk_score > 0.8 else "high" if risk_score > 0.6 else "medium" if risk_score > 0.3 else "low",
                "mitigation_status": random.choice(["mitigated", "in_progress", "not_started", "accepted"]),
                "assessed_at": datetime.now() - timedelta(days=random.randint(0, 30)),
            })

df = spark.createDataFrame(threats)
df.write.mode("overwrite").saveAsTable("threat_models")
print(f"Generated {len(threats)} threat model entries across {len(components)} components")

display(df.groupBy("stride_category", "severity").count().orderBy("stride_category", "severity"))
display(df.groupBy("component").agg(F.avg("risk_score").alias("avg_risk"), F.count("*").alias("total_threats"))
    .orderBy(F.desc("avg_risk")))`
      },
    ],
  },
];
