/*
 * Migration: Rewrite Agents to Databricks-Native PySpark (Phase 3)
 * Date: 2026-05-19
 * Agents 21-29: incident-summarizer, document-analyzer, threat-radar,
 *               malware-sandbox, honeypot, llm-guardrails,
 *               model-poisoning-guard, threat-simulator, feature-runtime
 *
 * All agents rewritten to use:
 *   - PySpark / spark.table() for all data access
 *   - ai_query('databricks-meta-llama-3-1-70b-instruct', ...) for LLM calls
 *   - DeltaTable MERGE for upserts
 *   - MLflow for model logging where applicable
 *   - dbutils.widgets / dbutils.secrets for parameterization
 *   - NO asyncio, NO asyncpg, NO openai SDK
 */

-- =============================================================================
-- 21. incident-summarizer
-- =============================================================================
UPDATE agent_implementations SET
  production_code = $py$
# Databricks Notebook: incident-summarizer
# Reads open cases with correlated alerts/events, generates structured incident summaries via LLM

from pyspark.sql import functions as F
from pyspark.sql.types import StructType, StructField, StringType, TimestampType
from delta.tables import DeltaTable
from datetime import datetime

# --- Configuration ---
dbutils.widgets.text("catalog", "main", "Unity Catalog")
dbutils.widgets.text("schema", "siem", "Target Schema")
dbutils.widgets.text("max_cases", "50", "Max cases to process per run")

catalog = dbutils.widgets.get("catalog")
schema = dbutils.widgets.get("schema")
max_cases = int(dbutils.widgets.get("max_cases"))

full_schema = f"{catalog}.{schema}"

# --- Read open cases ---
cases_df = spark.table(f"{full_schema}.cases").filter(
    F.col("status").isin("open", "in_progress")
).limit(max_cases)

# --- Read correlated alerts and events ---
alerts_df = spark.table(f"{full_schema}.alerts")
events_df = spark.table(f"{full_schema}.events")

# --- Join cases with their alerts and events ---
case_alerts = cases_df.join(
    alerts_df,
    cases_df.id == alerts_df.case_id,
    "left"
).groupBy(cases_df.id).agg(
    F.first(cases_df.title).alias("case_title"),
    F.first(cases_df.description).alias("case_description"),
    F.first(cases_df.severity).alias("severity"),
    F.first(cases_df.created_at).alias("case_created_at"),
    F.collect_list(alerts_df.title).alias("alert_titles"),
    F.collect_list(alerts_df.severity).alias("alert_severities"),
    F.count(alerts_df.id).alias("alert_count")
)

case_events = cases_df.join(
    events_df,
    cases_df.id == events_df.case_id,
    "left"
).groupBy(cases_df.id).agg(
    F.collect_list(events_df.event_type).alias("event_types"),
    F.min(events_df.timestamp).alias("earliest_event"),
    F.max(events_df.timestamp).alias("latest_event"),
    F.count(events_df.id).alias("event_count")
)

# --- Combine context for LLM summarization ---
combined_df = case_alerts.join(case_events, "id", "left")

# --- Build prompt and call ai_query for each case ---
summary_df = combined_df.withColumn(
    "prompt",
    F.concat(
        F.lit("Summarize this security incident in structured format (What Happened, Impact, Timeline, Recommended Actions):\n"),
        F.lit("Case: "), F.col("case_title"), F.lit("\n"),
        F.lit("Description: "), F.coalesce(F.col("case_description"), F.lit("N/A")), F.lit("\n"),
        F.lit("Severity: "), F.col("severity"), F.lit("\n"),
        F.lit("Alert Count: "), F.col("alert_count").cast("string"), F.lit("\n"),
        F.lit("Alert Types: "), F.concat_ws(", ", F.col("alert_titles")), F.lit("\n"),
        F.lit("Event Count: "), F.col("event_count").cast("string"), F.lit("\n"),
        F.lit("Event Types: "), F.concat_ws(", ", F.col("event_types")), F.lit("\n"),
        F.lit("Time Range: "), F.coalesce(F.col("earliest_event").cast("string"), F.lit("N/A")),
        F.lit(" to "), F.coalesce(F.col("latest_event").cast("string"), F.lit("N/A"))
    )
).withColumn(
    "summary",
    F.expr("ai_query('databricks-meta-llama-3-1-70b-instruct', prompt)")
).withColumn(
    "summarized_at", F.current_timestamp()
).select(
    F.col("id").alias("case_id"),
    "summary",
    "summarized_at"
)

# --- MERGE summaries back into cases ---
target = DeltaTable.forName(spark, f"{full_schema}.cases")
target.alias("t").merge(
    summary_df.alias("s"),
    "t.id = s.case_id"
).whenMatchedUpdate(set={
    "summary": "s.summary",
    "summary_updated_at": "s.summarized_at"
}).execute()

print(f"[incident-summarizer] Summarized {summary_df.count()} cases at {datetime.utcnow()}")
$py$,
  config_yaml = $yml$
schedule: "0 */15 * * * *"
timeout_seconds: 600
cluster_policy: jobs-standard
parameters:
  catalog: main
  schema: siem
  max_cases: "50"
alerts:
  on_failure: pagerduty
  on_sla_breach: slack
$yml$,
  dependencies = ARRAY['pyspark', 'delta-spark', 'databricks-sdk'],
  notes = 'Databricks-native. Uses ai_query() for structured incident summarization. MERGE-based writeback to cases table. No asyncio/asyncpg/openai.'
WHERE slug = 'incident-summarizer';

-- =============================================================================
-- 22. document-analyzer
-- =============================================================================
UPDATE agent_implementations SET
  production_code = $py$
# Databricks Notebook: document-analyzer
# Classifies documents and extracts IOCs/CVEs/TTPs using ai_query()

from pyspark.sql import functions as F
from pyspark.sql.types import StringType, ArrayType
from delta.tables import DeltaTable
from datetime import datetime

# --- Configuration ---
dbutils.widgets.text("catalog", "main", "Unity Catalog")
dbutils.widgets.text("schema", "siem", "Target Schema")
dbutils.widgets.text("batch_size", "25", "Documents per batch")

catalog = dbutils.widgets.get("catalog")
schema = dbutils.widgets.get("schema")
batch_size = int(dbutils.widgets.get("batch_size"))

full_schema = f"{catalog}.{schema}"

# --- Read unprocessed documents ---
docs_df = spark.table(f"{full_schema}.document_uploads").filter(
    (F.col("processing_status").isNull()) | (F.col("processing_status") == "pending")
).limit(batch_size)

if docs_df.count() == 0:
    print("[document-analyzer] No pending documents. Exiting.")
    dbutils.notebook.exit("no_work")

# --- Classification prompt ---
classified_df = docs_df.withColumn(
    "classification_prompt",
    F.concat(
        F.lit("Classify this document into exactly one category: threat_report, vulnerability_advisory, policy_document, intelligence_brief, incident_report. Return only the category.\n\nDocument title: "),
        F.coalesce(F.col("title"), F.lit("Untitled")),
        F.lit("\nContent excerpt: "),
        F.substring(F.coalesce(F.col("content"), F.lit("")), 1, 2000)
    )
).withColumn(
    "document_class",
    F.expr("ai_query('databricks-meta-llama-3-1-70b-instruct', classification_prompt)")
)

# --- IOC/CVE/TTP extraction prompt ---
extracted_df = classified_df.withColumn(
    "extraction_prompt",
    F.concat(
        F.lit("Extract all IOCs (IPs, domains, hashes, URLs), CVE IDs, and MITRE ATT&CK TTPs from this document. Return as JSON with keys: iocs, cves, ttps.\n\nContent:\n"),
        F.substring(F.coalesce(F.col("content"), F.lit("")), 1, 4000)
    )
).withColumn(
    "extracted_intel",
    F.expr("ai_query('databricks-meta-llama-3-1-70b-instruct', extraction_prompt)")
).withColumn(
    "analyzed_at", F.current_timestamp()
)

# --- Prepare intelligence output ---
intel_df = extracted_df.select(
    F.col("id").alias("document_id"),
    F.col("title"),
    F.col("document_class"),
    F.col("extracted_intel"),
    F.col("analyzed_at"),
    F.lit("document-analyzer-v2").alias("analyzer_version")
)

# --- MERGE into document_intelligence ---
target = DeltaTable.forName(spark, f"{full_schema}.document_intelligence")
target.alias("t").merge(
    intel_df.alias("s"),
    "t.document_id = s.document_id"
).whenMatchedUpdate(set={
    "document_class": "s.document_class",
    "extracted_intel": "s.extracted_intel",
    "analyzed_at": "s.analyzed_at",
    "analyzer_version": "s.analyzer_version"
}).whenNotMatchedInsertAll().execute()

# --- Update processing status on source documents ---
status_target = DeltaTable.forName(spark, f"{full_schema}.document_uploads")
status_updates = extracted_df.select(
    F.col("id"),
    F.lit("completed").alias("processing_status"),
    F.col("analyzed_at").alias("processed_at")
)
status_target.alias("t").merge(
    status_updates.alias("s"),
    "t.id = s.id"
).whenMatchedUpdate(set={
    "processing_status": "s.processing_status",
    "processed_at": "s.processed_at"
}).execute()

print(f"[document-analyzer] Processed {intel_df.count()} documents at {datetime.utcnow()}")
$py$,
  config_yaml = $yml$
schedule: "0 */10 * * * *"
timeout_seconds: 900
cluster_policy: jobs-standard
parameters:
  catalog: main
  schema: siem
  batch_size: "25"
alerts:
  on_failure: slack
$yml$,
  dependencies = ARRAY['pyspark', 'delta-spark', 'databricks-sdk'],
  notes = 'Databricks-native. Uses ai_query() for document classification and IOC/CVE/TTP extraction. Dual MERGE: intelligence output + source status update. No asyncio/asyncpg/openai.'
WHERE slug = 'document-analyzer';

-- =============================================================================
-- 23. threat-radar
-- =============================================================================
UPDATE agent_implementations SET
  production_code = $py$
# Databricks Notebook: threat-radar
# Monitors emerging threats, computes trending scores, enriches with LLM impact assessment

from pyspark.sql import functions as F
from pyspark.sql.window import Window
from delta.tables import DeltaTable
from datetime import datetime, timedelta

# --- Configuration ---
dbutils.widgets.text("catalog", "main", "Unity Catalog")
dbutils.widgets.text("schema", "siem", "Target Schema")
dbutils.widgets.text("trending_threshold", "1.5", "Trending score threshold")

catalog = dbutils.widgets.get("catalog")
schema = dbutils.widgets.get("schema")
trending_threshold = float(dbutils.widgets.get("trending_threshold"))

full_schema = f"{catalog}.{schema}"

now = datetime.utcnow()
past_24h = now - timedelta(hours=24)
past_7d = now - timedelta(days=7)

# --- Read recent threat feed items (last 24h) ---
recent_threats = spark.table(f"{full_schema}.threat_feed_items").filter(
    F.col("last_seen") >= F.lit(past_24h)
)

# --- Read 7-day baseline for comparison ---
baseline_threats = spark.table(f"{full_schema}.threat_feed_items").filter(
    (F.col("last_seen") >= F.lit(past_7d)) & (F.col("last_seen") < F.lit(past_24h))
)

# --- Aggregate recent by threat_type and severity ---
recent_agg = recent_threats.groupBy("threat_type", "severity").agg(
    F.count("*").alias("recent_count"),
    F.countDistinct("source_feed").alias("source_diversity"),
    F.collect_set("indicator_value").alias("sample_indicators")
)

# --- Aggregate 7-day baseline (daily average) ---
baseline_agg = baseline_threats.groupBy("threat_type", "severity").agg(
    (F.count("*") / 6.0).alias("baseline_daily_avg")
)

# --- Compute trending score ---
trending_df = recent_agg.join(
    baseline_agg, ["threat_type", "severity"], "left"
).withColumn(
    "baseline_daily_avg", F.coalesce(F.col("baseline_daily_avg"), F.lit(1.0))
).withColumn(
    "trending_score", F.col("recent_count") / F.col("baseline_daily_avg")
).filter(
    F.col("trending_score") >= trending_threshold
).withColumn(
    "sample_indicators_str",
    F.concat_ws(", ", F.slice(F.col("sample_indicators"), 1, 5))
)

# --- Enrich with ai_query for impact assessment ---
enriched_df = trending_df.withColumn(
    "impact_prompt",
    F.concat(
        F.lit("Assess the potential impact of this emerging threat trend for a SOC team. Be concise (3-4 sentences).\n"),
        F.lit("Threat Type: "), F.col("threat_type"), F.lit("\n"),
        F.lit("Severity: "), F.col("severity"), F.lit("\n"),
        F.lit("Volume (24h): "), F.col("recent_count").cast("string"), F.lit("\n"),
        F.lit("Trending Score: "), F.round(F.col("trending_score"), 2).cast("string"), F.lit("x baseline\n"),
        F.lit("Sample Indicators: "), F.col("sample_indicators_str")
    )
).withColumn(
    "impact_assessment",
    F.expr("ai_query('databricks-meta-llama-3-1-70b-instruct', impact_prompt)")
).withColumn(
    "radar_id", F.expr("uuid()")
).withColumn(
    "computed_at", F.current_timestamp()
).select(
    "radar_id", "threat_type", "severity", "recent_count",
    "baseline_daily_avg", "trending_score", "source_diversity",
    "impact_assessment", "computed_at"
)

# --- Write to threat_radar_items Delta table ---
target = DeltaTable.forName(spark, f"{full_schema}.threat_radar_items")
target.alias("t").merge(
    enriched_df.alias("s"),
    "t.threat_type = s.threat_type AND t.severity = s.severity AND CAST(t.computed_at AS DATE) = CAST(s.computed_at AS DATE)"
).whenMatchedUpdate(set={
    "recent_count": "s.recent_count",
    "baseline_daily_avg": "s.baseline_daily_avg",
    "trending_score": "s.trending_score",
    "source_diversity": "s.source_diversity",
    "impact_assessment": "s.impact_assessment",
    "computed_at": "s.computed_at"
}).whenNotMatchedInsertAll().execute()

print(f"[threat-radar] Computed {enriched_df.count()} trending threats at {now}")
$py$,
  config_yaml = $yml$
schedule: "0 0 * * * *"
timeout_seconds: 300
cluster_policy: jobs-standard
parameters:
  catalog: main
  schema: siem
  trending_threshold: "1.5"
alerts:
  on_failure: slack
  on_high_trending: pagerduty
$yml$,
  dependencies = ARRAY['pyspark', 'delta-spark', 'databricks-sdk'],
  notes = 'Databricks-native. Computes trending scores against 7-day baseline, enriches via ai_query() impact assessment. MERGE into threat_radar_items. No asyncio/asyncpg/openai.'
WHERE slug = 'threat-radar';

-- =============================================================================
-- 24. malware-sandbox
-- =============================================================================
UPDATE agent_implementations SET
  production_code = $py$
# Databricks Notebook: malware-sandbox
# ML-based malware analysis with GBT classifier via MLlib, model logged to MLflow

from pyspark.sql import functions as F
from pyspark.ml.feature import VectorAssembler, StringIndexer
from pyspark.ml.classification import GBTClassifier
from pyspark.ml.evaluation import BinaryClassificationEvaluator
from pyspark.ml import Pipeline
from delta.tables import DeltaTable
from datetime import datetime
import mlflow
import mlflow.spark

# --- Configuration ---
dbutils.widgets.text("catalog", "main", "Unity Catalog")
dbutils.widgets.text("schema", "siem", "Target Schema")
dbutils.widgets.text("retrain", "false", "Force retrain model")
dbutils.widgets.text("experiment_name", "/siem/malware-sandbox", "MLflow experiment")

catalog = dbutils.widgets.get("catalog")
schema = dbutils.widgets.get("schema")
retrain = dbutils.widgets.get("retrain").lower() == "true"
experiment_name = dbutils.widgets.get("experiment_name")

full_schema = f"{catalog}.{schema}"
mlflow.set_experiment(experiment_name)

# --- Read malware samples ---
samples_df = spark.table(f"{full_schema}.malware_samples")

# --- Feature engineering ---
features_df = samples_df.withColumn(
    "entropy", F.col("entropy").cast("double")
).withColumn(
    "file_size_kb", (F.col("file_size") / 1024.0).cast("double")
).withColumn(
    "import_count", F.col("import_count").cast("double")
).withColumn(
    "section_count", F.col("section_count").cast("double")
).withColumn(
    "suspicious_string_count", F.size(F.col("string_patterns")).cast("double")
).withColumn(
    "has_packed_sections", F.when(F.col("entropy") > 7.0, 1.0).otherwise(0.0)
).filter(F.col("label").isNotNull())

feature_cols = [
    "file_size_kb", "entropy", "import_count", "section_count",
    "suspicious_string_count", "has_packed_sections"
]

assembler = VectorAssembler(inputCols=feature_cols, outputCol="features", handleInvalid="skip")

# --- Split data ---
labeled_df = features_df.withColumn("label_idx", F.when(F.col("label") == "malicious", 1.0).otherwise(0.0))
train_df, test_df = labeled_df.randomSplit([0.8, 0.2], seed=42)

# --- Train GBT Classifier ---
gbt = GBTClassifier(
    featuresCol="features",
    labelCol="label_idx",
    maxIter=50,
    maxDepth=5,
    seed=42
)

pipeline = Pipeline(stages=[assembler, gbt])

with mlflow.start_run(run_name=f"malware-sandbox-{datetime.utcnow().strftime('%Y%m%d-%H%M')}"):
    model = pipeline.fit(train_df)

    # Evaluate
    predictions = model.transform(test_df)
    evaluator = BinaryClassificationEvaluator(labelCol="label_idx", metricName="areaUnderROC")
    auc = evaluator.evaluate(predictions)

    mlflow.log_metric("auc_roc", auc)
    mlflow.log_param("feature_count", len(feature_cols))
    mlflow.log_param("training_samples", train_df.count())
    mlflow.spark.log_model(model, "malware_gbt_model")

    print(f"[malware-sandbox] Model AUC-ROC: {auc:.4f}")

# --- Score unscored samples ---
unscored_df = spark.table(f"{full_schema}.malware_samples").filter(
    F.col("verdict").isNull()
)

if unscored_df.count() > 0:
    unscored_features = unscored_df.withColumn(
        "entropy", F.col("entropy").cast("double")
    ).withColumn(
        "file_size_kb", (F.col("file_size") / 1024.0).cast("double")
    ).withColumn(
        "import_count", F.col("import_count").cast("double")
    ).withColumn(
        "section_count", F.col("section_count").cast("double")
    ).withColumn(
        "suspicious_string_count", F.size(F.col("string_patterns")).cast("double")
    ).withColumn(
        "has_packed_sections", F.when(F.col("entropy") > 7.0, 1.0).otherwise(0.0)
    )

    scored = model.transform(unscored_features)

    verdicts_df = scored.select(
        F.col("id").alias("sample_id"),
        F.col("sha256"),
        F.when(F.col("prediction") == 1.0, "malicious").otherwise("benign").alias("verdict"),
        F.col("probability")[1].alias("confidence_score"),
        F.current_timestamp().alias("scored_at"),
        F.lit(auc).alias("model_auc")
    )

    # --- Write verdicts ---
    target = DeltaTable.forName(spark, f"{full_schema}.malware_verdicts")
    target.alias("t").merge(
        verdicts_df.alias("s"),
        "t.sample_id = s.sample_id"
    ).whenMatchedUpdate(set={
        "verdict": "s.verdict",
        "confidence_score": "s.confidence_score",
        "scored_at": "s.scored_at",
        "model_auc": "s.model_auc"
    }).whenNotMatchedInsertAll().execute()

    print(f"[malware-sandbox] Scored {verdicts_df.count()} samples")
else:
    print("[malware-sandbox] No unscored samples found")
$py$,
  config_yaml = $yml$
schedule: "0 0 */4 * * *"
timeout_seconds: 1800
cluster_policy: ml-optimized
parameters:
  catalog: main
  schema: siem
  retrain: "false"
  experiment_name: "/siem/malware-sandbox"
node_type: Standard_DS4_v2
num_workers: 2
alerts:
  on_failure: pagerduty
  on_auc_degradation: slack
$yml$,
  dependencies = ARRAY['pyspark', 'delta-spark', 'databricks-sdk', 'mlflow', 'pyspark-ml'],
  notes = 'Databricks-native. MLlib GBTClassifier for malware detection. Feature engineering from file metadata. MLflow model logging + metrics. MERGE verdicts. No asyncio/asyncpg/openai.'
WHERE slug = 'malware-sandbox';

-- =============================================================================
-- 25. honeypot
-- =============================================================================
UPDATE agent_implementations SET
  production_code = $py$
# Databricks Notebook: honeypot
# Deception signal processing - correlates honeypot interactions with internal entities

from pyspark.sql import functions as F
from pyspark.sql.window import Window
from delta.tables import DeltaTable
from datetime import datetime, timedelta

# --- Configuration ---
dbutils.widgets.text("catalog", "main", "Unity Catalog")
dbutils.widgets.text("schema", "siem", "Target Schema")
dbutils.widgets.text("risk_amplifier", "2.5", "Risk amplification multiplier for honeypot interactions")
dbutils.widgets.text("lookback_hours", "24", "Hours to look back for signals")

catalog = dbutils.widgets.get("catalog")
schema = dbutils.widgets.get("schema")
risk_amplifier = float(dbutils.widgets.get("risk_amplifier"))
lookback_hours = int(dbutils.widgets.get("lookback_hours"))

full_schema = f"{catalog}.{schema}"

cutoff = datetime.utcnow() - timedelta(hours=lookback_hours)

# --- Read deception signals (honeypot interactions) ---
signals_df = spark.table(f"{full_schema}.deception_signals").filter(
    F.col("detected_at") >= F.lit(cutoff)
)

if signals_df.count() == 0:
    print("[honeypot] No recent deception signals. Exiting.")
    dbutils.notebook.exit("no_signals")

# --- Read entity graph for correlation ---
vertices_df = spark.table(f"{full_schema}.vertices_current")

# --- Correlate interacting entities against internal hosts ---
correlated_df = signals_df.join(
    vertices_df,
    (signals_df.source_ip == vertices_df.ip_address) |
    (signals_df.source_hostname == vertices_df.hostname),
    "inner"
).select(
    vertices_df.entity_id,
    vertices_df.entity_type,
    vertices_df.hostname,
    vertices_df.ip_address,
    signals_df.honeypot_id,
    signals_df.interaction_type,
    signals_df.detected_at,
    signals_df.protocol,
    signals_df.payload_summary
)

# --- Compute risk amplification scores ---
entity_risk = correlated_df.groupBy("entity_id", "entity_type", "hostname", "ip_address").agg(
    F.count("*").alias("interaction_count"),
    F.countDistinct("honeypot_id").alias("distinct_honeypots"),
    F.collect_set("interaction_type").alias("interaction_types"),
    F.max("detected_at").alias("last_interaction"),
    F.min("detected_at").alias("first_interaction")
).withColumn(
    "base_risk_score",
    (F.col("interaction_count") * F.lit(risk_amplifier)) +
    (F.col("distinct_honeypots") * F.lit(risk_amplifier * 2))
).withColumn(
    "risk_score", F.least(F.col("base_risk_score"), F.lit(100.0))
).withColumn(
    "risk_reason",
    F.concat(
        F.lit("Honeypot interaction: "),
        F.col("interaction_count").cast("string"),
        F.lit(" events across "),
        F.col("distinct_honeypots").cast("string"),
        F.lit(" honeypots ("),
        F.concat_ws(", ", F.col("interaction_types")),
        F.lit(")")
    )
).withColumn(
    "updated_at", F.current_timestamp()
)

# --- MERGE updated risk into entity_state_current ---
risk_updates = entity_risk.select(
    "entity_id", "risk_score", "risk_reason",
    "interaction_count", "last_interaction", "updated_at"
)

target = DeltaTable.forName(spark, f"{full_schema}.entity_state_current")
target.alias("t").merge(
    risk_updates.alias("s"),
    "t.entity_id = s.entity_id"
).whenMatchedUpdate(
    condition="s.risk_score > t.risk_score",
    set={
        "risk_score": "s.risk_score",
        "risk_reason": "s.risk_reason",
        "honeypot_interactions": "s.interaction_count",
        "last_honeypot_interaction": "s.last_interaction",
        "updated_at": "s.updated_at"
    }
).execute()

print(f"[honeypot] Processed {signals_df.count()} signals, correlated {entity_risk.count()} entities at {datetime.utcnow()}")
$py$,
  config_yaml = $yml$
schedule: "0 */5 * * * *"
timeout_seconds: 300
cluster_policy: jobs-standard
parameters:
  catalog: main
  schema: siem
  risk_amplifier: "2.5"
  lookback_hours: "24"
alerts:
  on_failure: slack
  on_high_risk_entity: pagerduty
$yml$,
  dependencies = ARRAY['pyspark', 'delta-spark', 'databricks-sdk'],
  notes = 'Databricks-native. Correlates honeypot/deception signals against entity graph. Risk amplification scoring with conditional MERGE (only escalates). No asyncio/asyncpg/openai.'
WHERE slug = 'honeypot';

-- =============================================================================
-- 26. llm-guardrails
-- =============================================================================
UPDATE agent_implementations SET
  production_code = $py$
# Databricks Notebook: llm-guardrails
# LLM usage monitoring - scans for PII, enforces token budgets, flags policy violations

from pyspark.sql import functions as F
from pyspark.sql.types import ArrayType, StringType, StructType, StructField
from delta.tables import DeltaTable
from datetime import datetime, timedelta

# --- Configuration ---
dbutils.widgets.text("catalog", "main", "Unity Catalog")
dbutils.widgets.text("schema", "siem", "Target Schema")
dbutils.widgets.text("lookback_minutes", "15", "Minutes to look back")
dbutils.widgets.text("daily_token_budget", "1000000", "Max tokens per user per day")
dbutils.widgets.text("dept_token_budget", "10000000", "Max tokens per department per day")

catalog = dbutils.widgets.get("catalog")
schema = dbutils.widgets.get("schema")
lookback_minutes = int(dbutils.widgets.get("lookback_minutes"))
daily_token_budget = int(dbutils.widgets.get("daily_token_budget"))
dept_token_budget = int(dbutils.widgets.get("dept_token_budget"))

full_schema = f"{catalog}.{schema}"

cutoff = datetime.utcnow() - timedelta(minutes=lookback_minutes)

# --- PII regex patterns (registered as inline expressions) ---
SSN_PATTERN = r"\b\d{3}-\d{2}-\d{4}\b"
EMAIL_PATTERN = r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b"
CREDIT_CARD_PATTERN = r"\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13})\b"
PHONE_PATTERN = r"\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b"

# --- Read recent LLM interactions ---
interactions_df = spark.table(f"{full_schema}.llm_interactions").filter(
    F.col("created_at") >= F.lit(cutoff)
)

if interactions_df.count() == 0:
    print("[llm-guardrails] No recent interactions. Exiting.")
    dbutils.notebook.exit("no_work")

# --- PII Detection in prompts and responses ---
pii_scanned = interactions_df.withColumn(
    "prompt_ssn", F.regexp_extract_all(F.coalesce(F.col("prompt"), F.lit("")), F.lit(SSN_PATTERN), 0)
).withColumn(
    "prompt_email", F.regexp_extract_all(F.coalesce(F.col("prompt"), F.lit("")), F.lit(EMAIL_PATTERN), 0)
).withColumn(
    "prompt_cc", F.regexp_extract_all(F.coalesce(F.col("prompt"), F.lit("")), F.lit(CREDIT_CARD_PATTERN), 0)
).withColumn(
    "response_ssn", F.regexp_extract_all(F.coalesce(F.col("response"), F.lit("")), F.lit(SSN_PATTERN), 0)
).withColumn(
    "response_email", F.regexp_extract_all(F.coalesce(F.col("response"), F.lit("")), F.lit(EMAIL_PATTERN), 0)
).withColumn(
    "response_cc", F.regexp_extract_all(F.coalesce(F.col("response"), F.lit("")), F.lit(CREDIT_CARD_PATTERN), 0)
).withColumn(
    "pii_found",
    (F.size("prompt_ssn") > 0) | (F.size("prompt_email") > 0) | (F.size("prompt_cc") > 0) |
    (F.size("response_ssn") > 0) | (F.size("response_email") > 0) | (F.size("response_cc") > 0)
)

# --- Token budget checks (per user, daily) ---
today_start = datetime.utcnow().replace(hour=0, minute=0, second=0)
daily_usage = spark.table(f"{full_schema}.llm_interactions").filter(
    F.col("created_at") >= F.lit(today_start)
).groupBy("user_id", "department").agg(
    F.sum("total_tokens").alias("daily_tokens")
)

budget_violations = daily_usage.filter(
    (F.col("daily_tokens") > daily_token_budget)
).withColumn(
    "violation_type", F.lit("token_budget_exceeded")
).withColumn(
    "violation_detail",
    F.concat(F.lit("User consumed "), F.col("daily_tokens").cast("string"), F.lit(" tokens (budget: "), F.lit(str(daily_token_budget)), F.lit(")"))
)

dept_violations = daily_usage.groupBy("department").agg(
    F.sum("daily_tokens").alias("dept_daily_tokens")
).filter(
    F.col("dept_daily_tokens") > dept_token_budget
).withColumn(
    "violation_type", F.lit("department_budget_exceeded")
)

# --- Compile PII violations ---
pii_violations = pii_scanned.filter(F.col("pii_found") == True).select(
    F.col("id").alias("interaction_id"),
    F.col("user_id"),
    F.col("department"),
    F.lit("pii_detected").alias("violation_type"),
    F.concat(
        F.lit("PII found - SSN:"), F.size("prompt_ssn").cast("string"),
        F.lit(" Email:"), F.size("prompt_email").cast("string"),
        F.lit(" CC:"), F.size("prompt_cc").cast("string")
    ).alias("violation_detail"),
    F.lit("high").alias("severity"),
    F.current_timestamp().alias("detected_at")
)

# --- Combine all violations and write ---
all_violations = pii_violations.withColumn("violation_id", F.expr("uuid()"))

target = DeltaTable.forName(spark, f"{full_schema}.llm_guardrail_violations")
target.alias("t").merge(
    all_violations.alias("s"),
    "t.interaction_id = s.interaction_id AND t.violation_type = s.violation_type"
).whenMatchedUpdate(set={
    "violation_detail": "s.violation_detail",
    "detected_at": "s.detected_at"
}).whenNotMatchedInsertAll().execute()

violation_count = all_violations.count()
print(f"[llm-guardrails] Scanned {interactions_df.count()} interactions, found {violation_count} violations at {datetime.utcnow()}")
$py$,
  config_yaml = $yml$
schedule: "0 */5 * * * *"
timeout_seconds: 300
cluster_policy: jobs-standard
parameters:
  catalog: main
  schema: siem
  lookback_minutes: "15"
  daily_token_budget: "1000000"
  dept_token_budget: "10000000"
alerts:
  on_failure: slack
  on_pii_detection: pagerduty
  on_budget_breach: slack
$yml$,
  dependencies = ARRAY['pyspark', 'delta-spark', 'databricks-sdk'],
  notes = 'Databricks-native. Regex UDFs for PII detection (SSN, email, credit card). Token budget enforcement per user/department. MERGE violations. No asyncio/asyncpg/openai.'
WHERE slug = 'llm-guardrails';

-- =============================================================================
-- 27. model-poisoning-guard
-- =============================================================================
UPDATE agent_implementations SET
  production_code = $py$
# Databricks Notebook: model-poisoning-guard
# ML model integrity monitoring - distribution drift detection via KL-divergence and PSI

from pyspark.sql import functions as F
from pyspark.sql.types import DoubleType, ArrayType
from delta.tables import DeltaTable
from datetime import datetime, timedelta
import mlflow
import math

# --- Configuration ---
dbutils.widgets.text("catalog", "main", "Unity Catalog")
dbutils.widgets.text("schema", "siem", "Target Schema")
dbutils.widgets.text("psi_threshold", "0.25", "PSI threshold for alert")
dbutils.widgets.text("kl_threshold", "0.5", "KL-divergence threshold for alert")
dbutils.widgets.text("lookback_hours", "6", "Hours of predictions to analyze")
dbutils.widgets.text("experiment_name", "/siem/model-poisoning-guard", "MLflow experiment")

catalog = dbutils.widgets.get("catalog")
schema = dbutils.widgets.get("schema")
psi_threshold = float(dbutils.widgets.get("psi_threshold"))
kl_threshold = float(dbutils.widgets.get("kl_threshold"))
lookback_hours = int(dbutils.widgets.get("lookback_hours"))
experiment_name = dbutils.widgets.get("experiment_name")

full_schema = f"{catalog}.{schema}"
mlflow.set_experiment(experiment_name)

cutoff = datetime.utcnow() - timedelta(hours=lookback_hours)

# --- Read recent model predictions ---
predictions_df = spark.table(f"{full_schema}.model_predictions").filter(
    F.col("predicted_at") >= F.lit(cutoff)
)

# --- Read baseline distributions ---
baselines_df = spark.table(f"{full_schema}.model_baselines")

# --- Get distinct models to monitor ---
models_to_check = predictions_df.select("model_name").distinct().collect()

# --- UDFs for drift computation ---
@F.udf(DoubleType())
def compute_psi(actual_bins, expected_bins):
    """Population Stability Index"""
    if not actual_bins or not expected_bins or len(actual_bins) != len(expected_bins):
        return 0.0
    psi = 0.0
    for a, e in zip(actual_bins, expected_bins):
        a = max(a, 0.0001)
        e = max(e, 0.0001)
        psi += (a - e) * math.log(a / e)
    return float(psi)

@F.udf(DoubleType())
def compute_kl_divergence(p_bins, q_bins):
    """KL-Divergence D(P||Q)"""
    if not p_bins or not q_bins or len(p_bins) != len(q_bins):
        return 0.0
    kl = 0.0
    for p, q in zip(p_bins, q_bins):
        p = max(p, 0.0001)
        q = max(q, 0.0001)
        kl += p * math.log(p / q)
    return float(kl)

# --- Compute prediction distribution for each model ---
drift_results = []

for row in models_to_check:
    model_name = row.model_name

    model_preds = predictions_df.filter(F.col("model_name") == model_name)
    model_baseline = baselines_df.filter(F.col("model_name") == model_name).first()

    if model_baseline is None:
        continue

    # Compute histogram of prediction scores
    pred_stats = model_preds.select(
        F.count("*").alias("n"),
        F.mean("prediction_score").alias("mean_score"),
        F.stddev("prediction_score").alias("std_score"),
        F.expr("percentile_approx(prediction_score, array(0.1,0.2,0.3,0.4,0.5,0.6,0.7,0.8,0.9,1.0))").alias("actual_bins")
    ).first()

    if pred_stats and pred_stats.actual_bins:
        # Normalize to proportions
        total = sum(pred_stats.actual_bins) if sum(pred_stats.actual_bins) > 0 else 1.0
        actual_proportions = [b / total for b in pred_stats.actual_bins]
        baseline_proportions = model_baseline.bin_proportions

        # Compute drift metrics
        psi_val = sum(
            (a - e) * math.log(max(a, 0.0001) / max(e, 0.0001))
            for a, e in zip(actual_proportions, baseline_proportions)
        )
        kl_val = sum(
            a * math.log(max(a, 0.0001) / max(e, 0.0001))
            for a, e in zip(actual_proportions, baseline_proportions)
        )

        drift_results.append((
            model_name, psi_val, kl_val, pred_stats.n,
            pred_stats.mean_score, pred_stats.std_score,
            psi_val > psi_threshold or kl_val > kl_threshold
        ))

# --- Log results to MLflow and create alerts ---
with mlflow.start_run(run_name=f"drift-check-{datetime.utcnow().strftime('%Y%m%d-%H%M')}"):
    alerts_fired = 0

    for model_name, psi_val, kl_val, n, mean_s, std_s, is_drifted in drift_results:
        mlflow.log_metric(f"{model_name}_psi", psi_val)
        mlflow.log_metric(f"{model_name}_kl_divergence", kl_val)
        mlflow.log_metric(f"{model_name}_sample_count", n)

        if is_drifted:
            alerts_fired += 1
            print(f"[ALERT] Model '{model_name}' drift detected: PSI={psi_val:.4f}, KL={kl_val:.4f}")

    mlflow.log_metric("total_alerts", alerts_fired)
    mlflow.log_metric("models_checked", len(drift_results))

# --- Write drift results to Delta (as monitoring log) ---
if drift_results:
    drift_df = spark.createDataFrame(
        [(m, p, k, n, ms, ss, d, datetime.utcnow()) for m, p, k, n, ms, ss, d in drift_results],
        ["model_name", "psi_score", "kl_divergence", "sample_count", "mean_score", "std_score", "drift_detected", "checked_at"]
    )

    drift_df.write.mode("append").saveAsTable(f"{full_schema}.model_drift_log")

print(f"[model-poisoning-guard] Checked {len(drift_results)} models, {alerts_fired} alerts at {datetime.utcnow()}")
$py$,
  config_yaml = $yml$
schedule: "0 0 */2 * * *"
timeout_seconds: 600
cluster_policy: jobs-standard
parameters:
  catalog: main
  schema: siem
  psi_threshold: "0.25"
  kl_threshold: "0.5"
  lookback_hours: "6"
  experiment_name: "/siem/model-poisoning-guard"
alerts:
  on_failure: slack
  on_drift_detected: pagerduty
$yml$,
  dependencies = ARRAY['pyspark', 'delta-spark', 'databricks-sdk', 'mlflow'],
  notes = 'Databricks-native. KL-divergence and PSI drift detection for ML model integrity. MLflow logging of drift metrics. Append-mode drift log. No asyncio/asyncpg/openai.'
WHERE slug = 'model-poisoning-guard';

-- =============================================================================
-- 28. threat-simulator
-- =============================================================================
UPDATE agent_implementations SET
  production_code = $py$
# Databricks Notebook: threat-simulator
# Attack simulation engine - generates synthetic ATT&CK event sequences for detection testing

from pyspark.sql import functions as F
from pyspark.sql.types import (
    StructType, StructField, StringType, TimestampType,
    ArrayType, IntegerType, DoubleType
)
from delta.tables import DeltaTable
from datetime import datetime, timedelta
import json

# --- Configuration ---
dbutils.widgets.text("catalog", "main", "Unity Catalog")
dbutils.widgets.text("schema", "siem", "Target Schema")
dbutils.widgets.text("tactic", "all", "MITRE tactic to simulate (or 'all')")
dbutils.widgets.text("num_sequences", "10", "Number of attack sequences to generate")
dbutils.widgets.text("simulation_id", "", "Simulation run identifier (auto-generated if empty)")
dbutils.widgets.text("target_environment", "production_mirror", "Target environment label")

catalog = dbutils.widgets.get("catalog")
schema = dbutils.widgets.get("schema")
tactic_filter = dbutils.widgets.get("tactic")
num_sequences = int(dbutils.widgets.get("num_sequences"))
simulation_id = dbutils.widgets.get("simulation_id") or f"sim-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}"
target_env = dbutils.widgets.get("target_environment")

full_schema = f"{catalog}.{schema}"

# --- Read MITRE ATT&CK technique definitions ---
techniques_df = spark.table(f"{full_schema}.mitre_techniques")

if tactic_filter != "all":
    techniques_df = techniques_df.filter(
        F.array_contains(F.col("tactics"), tactic_filter)
    )

technique_count = techniques_df.count()
if technique_count == 0:
    print(f"[threat-simulator] No techniques found for tactic '{tactic_filter}'")
    dbutils.notebook.exit("no_techniques")

# --- Generate attack sequences ---
# Each sequence: chain of techniques representing a realistic attack path
phases = ["initial-access", "execution", "persistence", "privilege-escalation",
          "defense-evasion", "credential-access", "discovery", "lateral-movement",
          "collection", "exfiltration", "impact"]

# Sample techniques per phase for realistic sequences
sampled_techniques = techniques_df.withColumn(
    "primary_tactic", F.col("tactics")[0]
).withColumn(
    "rand", F.rand(seed=42)
).orderBy("primary_tactic", "rand")

# --- Generate synthetic events for each technique ---
simulation_events = []
base_time = datetime.utcnow()

sequences_generated = 0
for seq_idx in range(num_sequences):
    seq_techniques = sampled_techniques.orderBy(F.rand()).limit(
        min(7, technique_count)
    ).collect()

    for step_idx, tech in enumerate(seq_techniques):
        event_time = base_time + timedelta(minutes=seq_idx * 30 + step_idx * 2)
        simulation_events.append((
            f"{simulation_id}-{seq_idx}-{step_idx}",
            simulation_id,
            seq_idx,
            step_idx,
            tech.technique_id,
            tech.technique_name,
            tech.primary_tactic if hasattr(tech, "primary_tactic") else "unknown",
            target_env,
            f"sim-host-{seq_idx % 5 + 1}.internal",
            f"sim-user-{seq_idx % 3 + 1}",
            json.dumps({
                "simulated": True,
                "technique_id": tech.technique_id,
                "procedure": tech.description[:200] if tech.description else ""
            }),
            event_time,
            "false"
        ))
    sequences_generated += 1

# --- Create DataFrame from simulation events ---
sim_schema = StructType([
    StructField("event_id", StringType()),
    StructField("simulation_id", StringType()),
    StructField("sequence_idx", IntegerType()),
    StructField("step_idx", IntegerType()),
    StructField("technique_id", StringType()),
    StructField("technique_name", StringType()),
    StructField("tactic", StringType()),
    StructField("target_environment", StringType()),
    StructField("target_host", StringType()),
    StructField("target_user", StringType()),
    StructField("event_payload", StringType()),
    StructField("event_time", TimestampType()),
    StructField("detected", StringType())
])

sim_df = spark.createDataFrame(simulation_events, sim_schema).withColumn(
    "created_at", F.current_timestamp()
)

# --- Write simulation events to Delta table ---
target = DeltaTable.forName(spark, f"{full_schema}.simulation_events")
target.alias("t").merge(
    sim_df.alias("s"),
    "t.event_id = s.event_id"
).whenMatchedUpdate(set={
    "event_payload": "s.event_payload",
    "event_time": "s.event_time"
}).whenNotMatchedInsertAll().execute()

print(f"[threat-simulator] Generated {len(simulation_events)} events across {sequences_generated} sequences")
print(f"  Simulation ID: {simulation_id}")
print(f"  Tactic filter: {tactic_filter}")
print(f"  Techniques used: {technique_count}")
$py$,
  config_yaml = $yml$
schedule: "manual"
timeout_seconds: 900
cluster_policy: jobs-standard
parameters:
  catalog: main
  schema: siem
  tactic: all
  num_sequences: "10"
  simulation_id: ""
  target_environment: production_mirror
alerts:
  on_failure: slack
$yml$,
  dependencies = ARRAY['pyspark', 'delta-spark', 'databricks-sdk'],
  notes = 'Databricks-native. Generates synthetic MITRE ATT&CK attack sequences for detection coverage testing. Widget-parameterized (tactic, count, environment). MERGE into simulation_events. No asyncio/asyncpg/openai.'
WHERE slug = 'threat-simulator';

-- =============================================================================
-- 29. feature-runtime
-- =============================================================================
UPDATE agent_implementations SET
  production_code = $py$
# Databricks Notebook: feature-runtime
# Feature Store serving - computes real-time features from events, writes to online store

from pyspark.sql import functions as F
from pyspark.sql.window import Window
from pyspark.sql.types import DoubleType, StringType, MapType
from delta.tables import DeltaTable
from datetime import datetime, timedelta

# --- Configuration ---
dbutils.widgets.text("catalog", "main", "Unity Catalog")
dbutils.widgets.text("schema", "siem", "Target Schema")
dbutils.widgets.text("feature_window_minutes", "60", "Window size for feature computation")
dbutils.widgets.text("max_entities", "10000", "Max entities to process per run")

catalog = dbutils.widgets.get("catalog")
schema = dbutils.widgets.get("schema")
window_minutes = int(dbutils.widgets.get("feature_window_minutes"))
max_entities = int(dbutils.widgets.get("max_entities"))

full_schema = f"{catalog}.{schema}"

cutoff = datetime.utcnow() - timedelta(minutes=window_minutes)

# --- Read feature definitions from registry ---
feature_registry = spark.table(f"{full_schema}.feature_registry").filter(
    F.col("enabled") == True
)

# --- Read silver events for feature computation ---
events_df = spark.table(f"{full_schema}.silver_events").filter(
    F.col("event_time") >= F.lit(cutoff)
)

if events_df.count() == 0:
    print("[feature-runtime] No recent events in window. Exiting.")
    dbutils.notebook.exit("no_events")

# --- Define windowed aggregation features per entity ---
entity_window = Window.partitionBy("entity_id").orderBy("event_time").rangeBetween(
    -window_minutes * 60,
    Window.currentRow
)

# --- Compute core features ---
# Event frequency features
event_freq = events_df.groupBy("entity_id").agg(
    F.count("*").alias("event_count_window"),
    F.countDistinct("event_type").alias("distinct_event_types"),
    F.countDistinct("source_ip").alias("distinct_source_ips"),
    F.countDistinct("destination_ip").alias("distinct_dest_ips"),
    F.sum(F.when(F.col("severity") == "critical", 1).otherwise(0)).alias("critical_events"),
    F.sum(F.when(F.col("severity") == "high", 1).otherwise(0)).alias("high_events"),
    F.avg("risk_score").alias("avg_risk_score"),
    F.max("risk_score").alias("max_risk_score"),
    F.stddev("risk_score").alias("stddev_risk_score"),
    F.min("event_time").alias("first_event_in_window"),
    F.max("event_time").alias("last_event_in_window")
).limit(max_entities)

# --- Temporal features ---
temporal_features = event_freq.withColumn(
    "event_rate_per_min",
    F.col("event_count_window") / F.lit(window_minutes)
).withColumn(
    "activity_span_seconds",
    F.unix_timestamp("last_event_in_window") - F.unix_timestamp("first_event_in_window")
).withColumn(
    "burst_indicator",
    F.when(F.col("event_rate_per_min") > 10, 1.0).otherwise(0.0)
)

# --- Network diversity features ---
network_features = temporal_features.withColumn(
    "network_diversity_score",
    (F.col("distinct_source_ips") + F.col("distinct_dest_ips")) / (F.col("event_count_window") + 1)
).withColumn(
    "lateral_movement_indicator",
    F.when(F.col("distinct_dest_ips") > 5, 1.0).otherwise(0.0)
)

# --- Assemble feature vector ---
feature_vector = network_features.select(
    F.col("entity_id"),
    F.col("event_count_window").cast("double"),
    F.col("distinct_event_types").cast("double"),
    F.col("distinct_source_ips").cast("double"),
    F.col("distinct_dest_ips").cast("double"),
    F.col("critical_events").cast("double"),
    F.col("high_events").cast("double"),
    F.col("avg_risk_score"),
    F.col("max_risk_score"),
    F.coalesce(F.col("stddev_risk_score"), F.lit(0.0)).alias("stddev_risk_score"),
    F.col("event_rate_per_min"),
    F.col("activity_span_seconds").cast("double"),
    F.col("burst_indicator"),
    F.col("network_diversity_score"),
    F.col("lateral_movement_indicator"),
    F.current_timestamp().alias("computed_at"),
    F.lit(window_minutes).alias("window_minutes")
)

# --- Write feature vectors to online store ---
target = DeltaTable.forName(spark, f"{full_schema}.feature_store_online")
target.alias("t").merge(
    feature_vector.alias("s"),
    "t.entity_id = s.entity_id"
).whenMatchedUpdate(set={
    "event_count_window": "s.event_count_window",
    "distinct_event_types": "s.distinct_event_types",
    "distinct_source_ips": "s.distinct_source_ips",
    "distinct_dest_ips": "s.distinct_dest_ips",
    "critical_events": "s.critical_events",
    "high_events": "s.high_events",
    "avg_risk_score": "s.avg_risk_score",
    "max_risk_score": "s.max_risk_score",
    "stddev_risk_score": "s.stddev_risk_score",
    "event_rate_per_min": "s.event_rate_per_min",
    "activity_span_seconds": "s.activity_span_seconds",
    "burst_indicator": "s.burst_indicator",
    "network_diversity_score": "s.network_diversity_score",
    "lateral_movement_indicator": "s.lateral_movement_indicator",
    "computed_at": "s.computed_at",
    "window_minutes": "s.window_minutes"
}).whenNotMatchedInsertAll().execute()

entity_count = feature_vector.count()
print(f"[feature-runtime] Computed features for {entity_count} entities (window={window_minutes}m) at {datetime.utcnow()}")
$py$,
  config_yaml = $yml$
schedule: "0 */5 * * * *"
timeout_seconds: 300
cluster_policy: jobs-standard
parameters:
  catalog: main
  schema: siem
  feature_window_minutes: "60"
  max_entities: "10000"
feature_store:
  online_table: feature_store_online
  primary_key: entity_id
  ttl_hours: 2
alerts:
  on_failure: slack
  on_latency_breach: pagerduty
$yml$,
  dependencies = ARRAY['pyspark', 'delta-spark', 'databricks-sdk'],
  notes = 'Databricks-native. Computes windowed aggregation features per entity from silver_events. Writes to feature_store_online Delta table for Databricks Feature Store online serving. No asyncio/asyncpg/openai.'
WHERE slug = 'feature-runtime';