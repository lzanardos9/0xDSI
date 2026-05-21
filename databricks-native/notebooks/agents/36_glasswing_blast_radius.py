# Databricks notebook source
# MAGIC %md
# MAGIC # Agent 36: Glasswing Blast Radius Scorer
# MAGIC
# MAGIC **Purpose**: Computes blast radius for each reachable vulnerability using
# MAGIC asset graph, data sensitivity classification, and exploit chain depth.
# MAGIC Assigns priority (P1-P4) and feeds top findings into Detection Confluence
# MAGIC as a high-fidelity signal source (lens: "glasswing_mythos").
# MAGIC
# MAGIC **Architecture**:
# MAGIC ```
# MAGIC  glasswing_reachability (is_reachable=true)
# MAGIC         |
# MAGIC   [Join asset_registry]    [Join data_classification]
# MAGIC         |                          |
# MAGIC   [asset_count_factor]     [data_sensitivity_weight]
# MAGIC         |                          |
# MAGIC   blast_radius = reachability * sensitivity * assets * (1/chain) * confidence
# MAGIC         |
# MAGIC   [Priority Assignment P1-P4]
# MAGIC         |
# MAGIC   [Detection Confluence Feed]
# MAGIC         |
# MAGIC   glasswing_root_causes (updated priority + blast_radius)
# MAGIC ```
# MAGIC
# MAGIC **Schedule**: Runs after Agent 35 completes reachability analysis

# COMMAND ----------

from pyspark.sql.functions import *
from pyspark.sql.types import *
from datetime import datetime, timedelta
import json
import uuid
import math

# COMMAND ----------

dbutils.widgets.text("catalog", "soc_platform", "Unity Catalog name")
dbutils.widgets.text("schema", "agentic_soc", "Schema name")
dbutils.widgets.text("p1_threshold", "0.9", "Blast radius threshold for P1 priority")
dbutils.widgets.text("p2_threshold", "0.7", "Blast radius threshold for P2 priority")

catalog = dbutils.widgets.get("catalog")
schema = dbutils.widgets.get("schema")
p1_threshold = float(dbutils.widgets.get("p1_threshold"))
p2_threshold = float(dbutils.widgets.get("p2_threshold"))

spark.sql(f"USE CATALOG `{catalog}`")
spark.sql(f"USE SCHEMA `{schema}`")

now = datetime.utcnow()
run_id = str(uuid.uuid4())

# Derived thresholds
p3_threshold = p2_threshold * 0.5  # 0.35 by default
# Below p3_threshold -> P4

print(f"Blast radius run {run_id} | P1>={p1_threshold} | P2>={p2_threshold} | P3>={p3_threshold:.2f}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Load Reachable Findings

# COMMAND ----------

reachable_df = spark.sql("""
    SELECT r.*, rc.vuln_class, rc.title, rc.severity, rc.avg_confidence,
           rc.finding_count, rc.affected_files, rc.affected_codebases,
           rc.affected_file_count, rc.affected_codebase_count,
           rc.exploit_chain_id, rc.scan_run_id
    FROM glasswing_reachability r
    JOIN glasswing_root_causes rc ON r.root_cause_id = rc.id
    WHERE r.is_reachable = true
""")

reachable_count = reachable_df.count()
if reachable_count == 0:
    print("No reachable findings to score. Exiting.")
    result = {"status": "no_data", "scored_count": 0}
    dbutils.notebook.exit(json.dumps(result))

reachable_list = reachable_df.collect()
print(f"Loaded {reachable_count} reachable findings for blast radius scoring")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Load Asset Registry
# MAGIC
# MAGIC Maps codebases and file paths to production assets (hosts, containers, services).

# COMMAND ----------

try:
    asset_df = spark.sql("""
        SELECT asset_id, asset_name, asset_type, codebase, service_name,
               environment, criticality, data_sensitivity, host_count
        FROM asset_registry
        WHERE environment IN ('production', 'staging')
    """)
    asset_map = {}
    for row in asset_df.collect():
        key = row["codebase"]
        if key not in asset_map:
            asset_map[key] = []
        asset_map[key].append(row.asDict())
    print(f"Loaded asset registry with {len(asset_map)} codebase mappings")
except Exception as e:
    print(f"Asset registry not available: {e}")
    print("Generating synthetic asset data for pipeline validation...")

    # Synthetic asset data
    asset_map = {
        "kernel": [
            {"asset_id": "a1", "asset_name": "prod-kernel-fleet", "asset_type": "bare_metal",
             "codebase": "kernel", "service_name": "kernel-nfs", "environment": "production",
             "criticality": "critical", "data_sensitivity": "confidential", "host_count": 847},
        ],
        "src": [
            {"asset_id": "a2", "asset_name": "chromium-renderer-pool", "asset_type": "container",
             "codebase": "src", "service_name": "browser-engine", "environment": "production",
             "criticality": "critical", "data_sensitivity": "restricted", "host_count": 12500},
            {"asset_id": "a3", "asset_name": "api-gateway-cluster", "asset_type": "kubernetes",
             "codebase": "src", "service_name": "api-gateway", "environment": "production",
             "criticality": "high", "data_sensitivity": "confidential", "host_count": 64},
        ],
        "lib": [
            {"asset_id": "a4", "asset_name": "messaging-cluster", "asset_type": "kubernetes",
             "codebase": "lib", "service_name": "kafka-consumers", "environment": "production",
             "criticality": "high", "data_sensitivity": "internal", "host_count": 32},
            {"asset_id": "a5", "asset_name": "crypto-service", "asset_type": "container",
             "codebase": "lib", "service_name": "token-service", "environment": "production",
             "criticality": "critical", "data_sensitivity": "restricted", "host_count": 8},
        ],
        "pkg": [
            {"asset_id": "a6", "asset_name": "rbac-service", "asset_type": "kubernetes",
             "codebase": "pkg", "service_name": "auth-rbac", "environment": "production",
             "criticality": "critical", "data_sensitivity": "restricted", "host_count": 16},
            {"asset_id": "a7", "asset_name": "storage-service", "asset_type": "kubernetes",
             "codebase": "pkg", "service_name": "artifact-store", "environment": "production",
             "criticality": "high", "data_sensitivity": "confidential", "host_count": 24},
        ],
    }
    print(f"Using synthetic asset data for {len(asset_map)} codebases")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Load Data Classification

# COMMAND ----------

# Data sensitivity weights for blast radius calculation
DATA_SENSITIVITY_WEIGHTS = {
    "restricted": 1.0,      # PII, secrets, credentials, financial
    "confidential": 0.8,    # Internal business data, customer data
    "internal": 0.5,        # Internal operational data
    "public": 0.2,          # Publicly accessible data
}

ASSET_CRITICALITY_WEIGHTS = {
    "critical": 1.0,
    "high": 0.75,
    "medium": 0.5,
    "low": 0.25,
}

try:
    classification_df = spark.sql("""
        SELECT codebase, service_name, max_sensitivity, data_categories,
               pii_present, secrets_present, compliance_scope
        FROM data_classification
    """)
    classification_map = {row["codebase"]: row.asDict() for row in classification_df.collect()}
    print(f"Loaded data classification for {len(classification_map)} codebases")
except Exception as e:
    print(f"Data classification table not available: {e}")
    classification_map = {}

# COMMAND ----------

# MAGIC %md
# MAGIC ## Compute Blast Radius Scores

# COMMAND ----------

def compute_blast_radius(
    reachability_score: float,
    data_sensitivity: str,
    asset_criticality: str,
    host_count: int,
    chain_complexity: int,
    confidence: float,
    has_poc: bool,
) -> float:
    """
    Compute blast radius using the multi-factor formula.

    blast_radius = reachability_score
                 * data_sensitivity_weight
                 * asset_count_factor
                 * (1 / max(chain_complexity, 1))
                 * confidence
                 * poc_multiplier

    All factors normalized to [0, 1] range.
    """
    # Data sensitivity weight
    sensitivity_weight = DATA_SENSITIVITY_WEIGHTS.get(data_sensitivity, 0.5)

    # Asset count factor: logarithmic scaling, capped at 1.0
    # 1 host = 0.2, 10 hosts = 0.5, 100 hosts = 0.75, 1000+ hosts = 1.0
    asset_count_factor = min(1.0, 0.2 + 0.27 * math.log10(max(host_count, 1)))

    # Criticality bonus
    criticality_weight = ASSET_CRITICALITY_WEIGHTS.get(asset_criticality, 0.5)

    # Chain complexity: single-step vulns are worse (easier to exploit)
    # chain_complexity=1 means single bug, higher = multi-step
    chain_factor = 1.0 / max(chain_complexity, 1)

    # PoC availability multiplier
    poc_multiplier = 1.15 if has_poc else 1.0

    # Final formula
    blast_radius = (
        reachability_score
        * sensitivity_weight
        * asset_count_factor
        * criticality_weight
        * chain_factor
        * confidence
        * poc_multiplier
    )

    # Normalize to [0, 1]
    return round(min(1.0, blast_radius), 4)


def assign_priority(blast_radius: float) -> str:
    """Assign priority tier based on blast radius score."""
    if blast_radius >= p1_threshold:
        return "P1"
    elif blast_radius >= p2_threshold:
        return "P2"
    elif blast_radius >= p3_threshold:
        return "P3"
    else:
        return "P4"


# Score each reachable finding
scored_results = []

for row in reachable_list:
    root_cause_id = row["root_cause_id"]
    reachability_score = row["reachability_score"]
    vuln_class = row["vuln_class"]
    confidence = row["avg_confidence"]
    codebases = json.loads(row["affected_codebases"]) if row["affected_codebases"] else []
    chain_id = row["exploit_chain_id"]

    # Determine chain complexity
    chain_complexity = 1
    if chain_id:
        try:
            chain_df = spark.sql(f"SELECT total_steps FROM glasswing_exploit_chains WHERE id = '{chain_id}'")
            if chain_df.count() > 0:
                chain_complexity = chain_df.first()["total_steps"]
        except Exception:
            chain_complexity = 1

    # Lookup assets for affected codebases
    total_hosts = 0
    max_sensitivity = "internal"
    max_criticality = "medium"

    for codebase in codebases:
        assets = asset_map.get(codebase, [])
        for asset in assets:
            total_hosts += asset.get("host_count", 1)
            # Track max sensitivity
            asset_sens = asset.get("data_sensitivity", "internal")
            if DATA_SENSITIVITY_WEIGHTS.get(asset_sens, 0) > DATA_SENSITIVITY_WEIGHTS.get(max_sensitivity, 0):
                max_sensitivity = asset_sens
            # Track max criticality
            asset_crit = asset.get("criticality", "medium")
            if ASSET_CRITICALITY_WEIGHTS.get(asset_crit, 0) > ASSET_CRITICALITY_WEIGHTS.get(max_criticality, 0):
                max_criticality = asset_crit

    # Check data classification
    for codebase in codebases:
        if codebase in classification_map:
            cls = classification_map[codebase]
            cls_sens = cls.get("max_sensitivity", "internal")
            if DATA_SENSITIVITY_WEIGHTS.get(cls_sens, 0) > DATA_SENSITIVITY_WEIGHTS.get(max_sensitivity, 0):
                max_sensitivity = cls_sens

    # Default if no assets found
    if total_hosts == 0:
        total_hosts = 1

    # Check if PoC exists
    has_poc = row["ioc_correlation_count"] > 0 if row["ioc_correlation_count"] else False

    blast_radius = compute_blast_radius(
        reachability_score=reachability_score,
        data_sensitivity=max_sensitivity,
        asset_criticality=max_criticality,
        host_count=total_hosts,
        chain_complexity=chain_complexity,
        confidence=confidence,
        has_poc=has_poc,
    )

    priority = assign_priority(blast_radius)

    scored_results.append({
        "id": str(uuid.uuid4()),
        "root_cause_id": root_cause_id,
        "blast_radius": blast_radius,
        "priority": priority,
        "reachability_score": reachability_score,
        "data_sensitivity": max_sensitivity,
        "data_sensitivity_weight": DATA_SENSITIVITY_WEIGHTS.get(max_sensitivity, 0.5),
        "asset_criticality": max_criticality,
        "total_host_count": total_hosts,
        "chain_complexity": chain_complexity,
        "confidence": confidence,
        "vuln_class": vuln_class,
        "title": row["title"],
        "severity": row["severity"],
        "scan_run_id": row["scan_run_id"],
        "scored_at": now,
    })

# Sort by blast radius descending
scored_results.sort(key=lambda x: x["blast_radius"], reverse=True)

# Summary
priority_counts = {"P1": 0, "P2": 0, "P3": 0, "P4": 0}
for r in scored_results:
    priority_counts[r["priority"]] += 1

print(f"Scored {len(scored_results)} reachable findings:")
print(f"  P1 (critical): {priority_counts['P1']}")
print(f"  P2 (high):     {priority_counts['P2']}")
print(f"  P3 (medium):   {priority_counts['P3']}")
print(f"  P4 (low):      {priority_counts['P4']}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Persist Blast Radius Scores

# COMMAND ----------

score_schema = StructType([
    StructField("id", StringType(), False),
    StructField("root_cause_id", StringType(), False),
    StructField("blast_radius", DoubleType(), False),
    StructField("priority", StringType(), False),
    StructField("reachability_score", DoubleType(), True),
    StructField("data_sensitivity", StringType(), True),
    StructField("data_sensitivity_weight", DoubleType(), True),
    StructField("asset_criticality", StringType(), True),
    StructField("total_host_count", IntegerType(), True),
    StructField("chain_complexity", IntegerType(), True),
    StructField("confidence", DoubleType(), True),
    StructField("vuln_class", StringType(), True),
    StructField("title", StringType(), True),
    StructField("severity", StringType(), True),
    StructField("scan_run_id", StringType(), True),
    StructField("scored_at", TimestampType(), False),
])

scores_df = spark.createDataFrame(scored_results, schema=score_schema)
scores_df.createOrReplaceTempView("new_blast_scores")

spark.sql("""
    MERGE INTO glasswing_blast_scores AS target
    USING new_blast_scores AS source
    ON target.root_cause_id = source.root_cause_id
    WHEN MATCHED THEN UPDATE SET
        target.blast_radius = source.blast_radius,
        target.priority = source.priority,
        target.reachability_score = source.reachability_score,
        target.data_sensitivity = source.data_sensitivity,
        target.data_sensitivity_weight = source.data_sensitivity_weight,
        target.asset_criticality = source.asset_criticality,
        target.total_host_count = source.total_host_count,
        target.chain_complexity = source.chain_complexity,
        target.confidence = source.confidence,
        target.scored_at = source.scored_at
    WHEN NOT MATCHED THEN INSERT *
""")

print(f"Persisted {len(scored_results)} blast radius scores")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Update Root Causes with Priority

# COMMAND ----------

for result in scored_results:
    spark.sql(f"""
        UPDATE glasswing_root_causes
        SET priority = '{result['priority']}',
            blast_radius = {result['blast_radius']},
            status = 'scored',
            updated_at = current_timestamp()
        WHERE id = '{result['root_cause_id']}'
    """)

print(f"Updated {len(scored_results)} root causes with priority assignments")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Feed into Detection Confluence
# MAGIC
# MAGIC Top findings are injected as a signal into Detection Confluence (Agent 28)
# MAGIC using lens "glasswing_mythos". This allows the AI correlation engine to
# MAGIC combine code-level vulnerabilities with runtime signals.

# COMMAND ----------

# Feed top P1/P2 findings to Detection Confluence
confluence_signals = []
for result in scored_results:
    if result["priority"] in ("P1", "P2"):
        confluence_signals.append({
            "id": str(uuid.uuid4()),
            "lens": "glasswing_mythos",
            "signal_type": "vulnerability_reachable",
            "entity_type": "codebase",
            "entity_id": result["root_cause_id"],
            "confidence": result["blast_radius"],
            "severity": result["severity"],
            "title": f"[Glasswing {result['priority']}] {result['title'][:150]}",
            "metadata": json.dumps({
                "blast_radius": result["blast_radius"],
                "priority": result["priority"],
                "vuln_class": result["vuln_class"],
                "host_count": result["total_host_count"],
                "chain_complexity": result["chain_complexity"],
            }),
            "source": "glasswing_blast_radius",
            "created_at": now,
        })

if confluence_signals:
    try:
        signal_schema = StructType([
            StructField("id", StringType(), False),
            StructField("lens", StringType(), False),
            StructField("signal_type", StringType(), False),
            StructField("entity_type", StringType(), True),
            StructField("entity_id", StringType(), False),
            StructField("confidence", DoubleType(), False),
            StructField("severity", StringType(), True),
            StructField("title", StringType(), True),
            StructField("metadata", StringType(), True),
            StructField("source", StringType(), True),
            StructField("created_at", TimestampType(), False),
        ])
        signals_df = spark.createDataFrame(confluence_signals, schema=signal_schema)
        signals_df.write.mode("append").saveAsTable("detection_confluence_signals")
        print(f"Fed {len(confluence_signals)} signals to Detection Confluence (lens=glasswing_mythos)")
    except Exception as e:
        print(f"Detection Confluence table not available, skipping: {e}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Update Agent Status

# COMMAND ----------

spark.sql(f"""
    MERGE INTO agent_status AS target
    USING (SELECT
        'glasswing_blast_radius' as agent_id,
        current_timestamp() as last_heartbeat,
        'running' as status,
        {reachable_count} as events_processed,
        {priority_counts['P1'] + priority_counts['P2']} as alerts_generated
    ) AS source
    ON target.agent_id = source.agent_id
    WHEN MATCHED THEN UPDATE SET *
    WHEN NOT MATCHED THEN INSERT *
""")

result = {
    "status": "completed",
    "run_id": run_id,
    "findings_scored": len(scored_results),
    "priority_breakdown": priority_counts,
    "confluence_signals_sent": len(confluence_signals),
    "avg_blast_radius": round(
        sum(r["blast_radius"] for r in scored_results) / max(len(scored_results), 1), 4
    ),
    "max_blast_radius": scored_results[0]["blast_radius"] if scored_results else 0,
    "top_finding": scored_results[0]["title"] if scored_results else None,
}
print(json.dumps(result, indent=2))
dbutils.notebook.exit(json.dumps(result))
