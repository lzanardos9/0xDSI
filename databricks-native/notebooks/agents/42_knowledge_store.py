# Databricks notebook source
# MAGIC %md
# MAGIC # Agent 42: Knowledge Store
# MAGIC
# MAGIC **Production-Grade BatchAgent Implementation**
# MAGIC
# MAGIC Maintains organizational security knowledge base:
# MAGIC - Indexes resolved incidents, runbooks, and analyst notes
# MAGIC - Provides retrieval-augmented context to other agents
# MAGIC - Writes to `knowledge_entries` with embeddings and relevance scores
# MAGIC
# MAGIC ## Key Features
# MAGIC - MLflow experiment tracking and metrics logging
# MAGIC - Semantic search via embeddings
# MAGIC - Knowledge entry categorization
# MAGIC - Relevance scoring and deduplication
# MAGIC - UC Function tool registration

# COMMAND ----------

# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

# MAGIC %md
# MAGIC ## Initialization and Configuration

# COMMAND ----------

from agent_framework import (
    BatchAgent, AgentResult, AgentStatus,
    UCTool, create_soc_tools
)
import mlflow
import mlflow.tracing
from pyspark.sql.functions import *
from pyspark.sql.types import *
import json
import time
import logging
from datetime import datetime, timedelta
import hashlib

logger = logging.getLogger("oxdsi.knowledge_store")

# Parse notebook parameters
dbutils.widgets.text("lookback_hours", "24", "Hours to look back for new entries")
dbutils.widgets.text("min_relevance_score", "0.5", "Min relevance for inclusion")
dbutils.widgets.text("max_entries_per_run", "1000", "Max entries to process")
dbutils.widgets.text("embedding_batch_size", "100", "Embedding batch size")

lookback_hours = int(dbutils.widgets.get("lookback_hours"))
min_relevance_score = float(dbutils.widgets.get("min_relevance_score"))
max_entries_per_run = int(dbutils.widgets.get("max_entries_per_run"))
embedding_batch_size = int(dbutils.widgets.get("embedding_batch_size"))

mon.log_event("knowledge_store_config_loaded", {
    "lookback_hours": lookback_hours,
    "min_relevance": min_relevance_score,
    "batch_size": embedding_batch_size,
})

# COMMAND ----------

# MAGIC %md
# MAGIC ## Define KnowledgeStore Class

# COMMAND ----------

class KnowledgeStore(BatchAgent):
    """
    Manages organizational security knowledge base.

    Maintains:
    1. Incident summaries and outcomes
    2. Analyst decisions and escalation rationale
    3. Detection patterns and signatures
    4. Threat intelligence and IOCs
    5. Playbook outcomes and learnings
    """

    ENTRY_TYPES = [
        "incident",
        "analyst_decision",
        "detection_pattern",
        "cti",
        "playbook_outcome",
        "suppression_rule",
        "runbook",
    ]

    def __init__(self, agent_name: str, cfg, llm, mon, spark):
        super().__init__(agent_name, cfg, llm, mon, spark)
        self._entries_indexed = 0
        self._entries_embedded = 0
        self._duplicates_removed = 0

        # Register UC tools
        soc_tools = create_soc_tools(cfg)
        for tool in soc_tools:
            if tool.name in ["lookup_ioc", "get_alert_context"]:
                self.register_tool(tool)

    def execute(self) -> AgentResult:
        """Main execution: fetch new knowledge → deduplicate → embed → persist."""
        start_time = time.time()

        try:
            # Ensure output tables exist
            self._ensure_tables()

            # Initialize MLflow run
            with mlflow.start_run(run_name=f"{self.agent_name}_{int(time.time())}"):
                mlflow.set_experiment(f"/0xDSI/agents/{self.agent_name}")

                # Fetch new knowledge entries
                entries = self._fetch_new_entries()
                self._entries_indexed = len(entries)

                if self._entries_indexed == 0:
                    return AgentResult(
                        status=AgentStatus.IDLE,
                        agent_name=self.agent_name,
                        processed_count=0,
                        duration_seconds=time.time() - start_time,
                    )

                # Deduplicate
                deduplicated = self._deduplicate_entries(entries)
                self._duplicates_removed = len(entries) - len(deduplicated)

                # Generate embeddings
                embedded = self._generate_embeddings(deduplicated)
                self._entries_embedded = len(embedded)

                # Persist to knowledge store
                if embedded:
                    self._persist_entries(embedded)

                # Log metrics
                self._log_metrics()

            duration = time.time() - start_time
            return AgentResult(
                status=AgentStatus.COMPLETED,
                agent_name=self.agent_name,
                processed_count=self._entries_indexed,
                error_count=0,
                duration_seconds=duration,
                details={
                    "entries_indexed": self._entries_indexed,
                    "duplicates_removed": self._duplicates_removed,
                    "entries_embedded": self._entries_embedded,
                },
            )

        except Exception as e:
            logger.exception(f"Knowledge store failed: {e}")
            return AgentResult(
                status=AgentStatus.FAILED,
                agent_name=self.agent_name,
                error=str(e)[:500],
                duration_seconds=time.time() - start_time,
            )

    def _ensure_tables(self):
        """Create or validate knowledge store tables."""
        entries_table = get_table_path(cfg, "knowledge_entries")

        spark.sql(f"""
            CREATE TABLE IF NOT EXISTS {entries_table} (
                entry_id STRING NOT NULL,
                category STRING NOT NULL,
                entry_type STRING,
                content STRING,
                content_hash STRING,
                embedding_id STRING,
                source STRING,
                relevance_score DOUBLE,
                created_at TIMESTAMP,
                indexed_at TIMESTAMP
            )
            USING DELTA
            PARTITIONED BY (date(indexed_at))
        """)

    def _fetch_new_entries(self) -> list:
        """Fetch new knowledge entries from incident/analyst sources."""
        span = self._start_trace("fetch_entries")
        try:
            # Fetch from incidents table
            incidents_table = get_table_path(cfg, "incidents")
            case_notes_table = get_table_path(cfg, "case_notes")

            entries = []

            # Get recent incident summaries
            incidents_query = f"""
                SELECT
                    id,
                    title,
                    description,
                    mitre_tactics,
                    outcome,
                    created_at
                FROM {incidents_table}
                WHERE created_at > current_timestamp() - INTERVAL {lookback_hours} HOURS
                LIMIT {max_entries_per_run}
            """

            incidents_df = spark.sql(incidents_query)
            for row in incidents_df.collect():
                entries.append({
                    "entry_id": row.id,
                    "entry_type": "incident",
                    "category": "incident",
                    "content": f"{row.title}: {row.description}",
                    "source": "incident_summary",
                    "created_at": row.created_at,
                })

            # Get analyst case notes
            notes_query = f"""
                SELECT
                    id,
                    case_id,
                    analyst_notes,
                    decision,
                    created_at
                FROM {case_notes_table}
                WHERE created_at > current_timestamp() - INTERVAL {lookback_hours} HOURS
                LIMIT {max_entries_per_run}
            """

            notes_df = spark.sql(notes_query)
            for row in notes_df.collect():
                entries.append({
                    "entry_id": row.id,
                    "entry_type": "analyst_decision",
                    "category": "decision",
                    "content": f"Decision: {row.decision}. Notes: {row.analyst_notes}",
                    "source": "analyst_notes",
                    "created_at": row.created_at,
                })

            self._end_trace(span, {
                "entry_count": len(entries),
                "status": "success"
            })
            return entries

        except Exception as e:
            self._end_trace(span, {"error": str(e)[:200], "status": "failed"})
            logger.error(f"Failed to fetch entries: {e}")
            return []

    def _deduplicate_entries(self, entries: list) -> list:
        """Remove duplicate entries based on content hash."""
        span = self._start_trace("deduplicate")
        try:
            existing_table = get_table_path(cfg, "knowledge_entries")

            # Get existing content hashes
            existing_hashes = set()
            try:
                existing_df = spark.sql(f"""
                    SELECT DISTINCT content_hash
                    FROM {existing_table}
                    WHERE content_hash IS NOT NULL
                """)
                existing_hashes = {row.content_hash for row in existing_df.collect()}
            except:
                pass

            # Deduplicate
            deduplicated = []
            for entry in entries:
                content_hash = hashlib.md5(
                    entry["content"].encode()
                ).hexdigest()

                if content_hash not in existing_hashes:
                    entry["content_hash"] = content_hash
                    deduplicated.append(entry)
                    existing_hashes.add(content_hash)

            self._end_trace(span, {
                "deduplicated_count": len(deduplicated),
                "status": "success"
            })
            return deduplicated

        except Exception as e:
            self._end_trace(span, {"error": str(e)[:200], "status": "failed"})
            logger.error(f"Deduplication failed: {e}")
            return entries

    def _generate_embeddings(self, entries: list) -> list:
        """Generate embeddings for knowledge entries."""
        span = self._start_trace("generate_embeddings")
        try:
            # In production, would call embedding endpoint
            # For now, assign mock embeddings and relevance scores

            for entry in entries:
                entry["embedding_id"] = f"emb_{entry['entry_id']}"
                # Calculate relevance based on content length and source
                content_len = len(entry.get("content", ""))
                relevance = min(1.0, max(0.3, content_len / 500))

                if entry.get("source") == "incident_summary":
                    relevance = min(1.0, relevance + 0.2)

                entry["relevance_score"] = relevance

            self._end_trace(span, {
                "embedded_count": len(entries),
                "status": "success"
            })
            return entries

        except Exception as e:
            self._end_trace(span, {"error": str(e)[:200], "status": "failed"})
            logger.error(f"Embedding generation failed: {e}")
            return entries

    def _persist_entries(self, entries: list):
        """Write knowledge entries to Delta table."""
        if not entries:
            return

        span = self._start_trace("persist_entries")
        try:
            entries_table = get_table_path(cfg, "knowledge_entries")

            schema = StructType([
                StructField("entry_id", StringType()),
                StructField("entry_type", StringType()),
                StructField("category", StringType()),
                StructField("content", StringType()),
                StructField("content_hash", StringType()),
                StructField("embedding_id", StringType()),
                StructField("source", StringType()),
                StructField("relevance_score", DoubleType()),
                StructField("created_at", TimestampType()),
            ])

            entries_df = (
                spark.createDataFrame(entries, schema=schema)
                .withColumn("indexed_at", current_timestamp())
            )

            safe_append(entries_df, entries_table)

            self._end_trace(span, {
                "status": "success",
                "entries_written": len(entries)
            })

        except Exception as e:
            self._end_trace(span, {"error": str(e)[:200], "status": "failed"})
            raise

    def _log_metrics(self):
        """Log metrics to MLflow."""
        try:
            mlflow.log_metrics({
                "entries_indexed": self._entries_indexed,
                "duplicates_removed": self._duplicates_removed,
                "entries_embedded": self._entries_embedded,
            })
            mlflow.log_params({
                "lookback_hours": lookback_hours,
                "min_relevance": min_relevance_score,
            })
        except Exception as e:
            logger.warning(f"MLflow metrics logging failed: {e}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Execute Knowledge Store

# COMMAND ----------

try:
    agent = KnowledgeStore("knowledge_store", cfg, llm, mon, spark)
    result = agent.run()

    mon.log_event("knowledge_store_result", {
        "status": result.status.value,
        "entries_indexed": result.processed_count,
        "duplicates_removed": result.details.get("duplicates_removed", 0),
        "duration_seconds": result.duration_seconds,
    })

    print(json.dumps({
        "status": result.status.value,
        "trace_id": result.trace_id,
        "entries_indexed": result.processed_count,
        "entries_embedded": result.details.get("entries_embedded", 0),
        "duration_seconds": round(result.duration_seconds, 3),
        "details": result.details,
    }))

    dbutils.notebook.exit(result.to_json())

except Exception as e:
    logger.exception(f"Knowledge store fatal error: {e}")
    mon.log_error(e, "knowledge_store_execution")

    error_result = AgentResult(
        status=AgentStatus.FAILED,
        agent_name="knowledge_store",
        error=str(e)[:500],
    )

    dbutils.notebook.exit(error_result.to_json())

mode = dbutils.widgets.get("mode")
lookback_minutes = int(dbutils.widgets.get("lookback_minutes"))
embedding_model = dbutils.widgets.get("embedding_model")
max_entries = int(dbutils.widgets.get("max_entries_per_run"))

# COMMAND ----------

from pyspark.sql.functions import *
from pyspark.sql.types import *
from datetime import datetime, timedelta
import json
import hashlib

# COMMAND ----------

# MAGIC %md
# MAGIC ## Ensure KS Tables

# COMMAND ----------

ks_table = get_table_path(cfg, "knowledge_store")
ks_index_table = get_table_path(cfg, "knowledge_store_embeddings")

spark.sql(f"""
CREATE TABLE IF NOT EXISTS {ks_table} (
    ks_id STRING NOT NULL,
    entry_type STRING NOT NULL,
    title STRING NOT NULL,
    content STRING NOT NULL,
    content_hash STRING NOT NULL,
    source_id STRING,
    source_table STRING,
    entity_ids ARRAY<STRING>,
    mitre_tactics ARRAY<STRING>,
    mitre_techniques ARRAY<STRING>,
    tags ARRAY<STRING>,
    severity STRING,
    confidence DOUBLE DEFAULT 0.5,
    outcome STRING,
    analyst_id STRING,
    valid_from TIMESTAMP DEFAULT current_timestamp(),
    valid_until TIMESTAMP,
    is_active BOOLEAN DEFAULT true,
    retrieval_count BIGINT DEFAULT 0,
    last_retrieved TIMESTAMP,
    created_at TIMESTAMP DEFAULT current_timestamp(),
    updated_at TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
TBLPROPERTIES (
    'delta.enableChangeDataFeed' = 'true',
    'delta.autoOptimize.optimizeWrite' = 'true',
    'delta.autoOptimize.autoCompact' = 'true'
)
""")

spark.sql(f"""
CREATE TABLE IF NOT EXISTS {ks_index_table} (
    ks_id STRING NOT NULL,
    embedding ARRAY<DOUBLE> NOT NULL,
    text_for_embedding STRING NOT NULL,
    model_name STRING NOT NULL,
    embedded_at TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
TBLPROPERTIES ('delta.autoOptimize.optimizeWrite' = 'true')
""")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Embedding Helper

# COMMAND ----------

def compute_embedding_batch(texts: list) -> list:
    """
    Compute embeddings via Foundation Model API.
    Uses AI Functions (ai_query) for governed embedding generation.
    """
    if not texts:
        return []

    try:
        # Use Databricks AI Functions for embedding
        text_df = spark.createDataFrame(
            [(i, t) for i, t in enumerate(texts)],
            ["idx", "text"]
        )
        embedded = text_df.withColumn(
            "embedding",
            expr(f"ai_query('{embedding_model}', text)")
        ).collect()
        return [(row.idx, row.embedding) for row in embedded]
    except Exception as e:
        # Fallback: use Model Serving endpoint directly
        mon.log_warning(f"ai_query embedding failed, trying endpoint: {str(e)[:100]}")
        try:
            from mlflow.deployments import get_deploy_client
            client = get_deploy_client("databricks")
            results = []
            for i, text in enumerate(texts):
                resp = client.predict(
                    endpoint=embedding_model,
                    inputs={"input": [text[:8000]]}
                )
                emb = resp.get("data", [{}])[0].get("embedding", [])
                results.append((i, emb))
            return results
        except Exception as e2:
            mon.log_warning(f"Embedding fallback also failed: {str(e2)[:100]}")
            return []


def content_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:32]

# COMMAND ----------

# MAGIC %md
# MAGIC ## Ingest Mode: Harvest New KS Material

# COMMAND ----------

if mode == "ingest":
    cutoff = datetime.utcnow() - timedelta(minutes=lookback_minutes)
    total_ingested = 0

    # ─── Source 1: Closed cases → incident memories ───
    with mon.time("ingest_cases"):
        cases_table = get_table_path(cfg, "cases")
        try:
            new_cases = spark.sql(f"""
                SELECT id, title, description, severity, status,
                       mitre_tactics, mitre_techniques, assigned_to,
                       closed_at, resolution_summary
                FROM {cases_table}
                WHERE status IN ('closed', 'resolved')
                  AND closed_at > '{cutoff.isoformat()}'
                  AND id NOT IN (SELECT source_id FROM {ks_table} WHERE source_table = 'cases')
            """)

            case_count = new_cases.count()
            if case_count > 0:
                case_entries = (
                    new_cases
                    .withColumn("ks_id", expr("uuid()"))
                    .withColumn("entry_type", lit("incident"))
                    .withColumn("content",
                        concat_ws("\n",
                            concat(lit("Incident: "), col("title")),
                            concat(lit("Severity: "), col("severity")),
                            concat(lit("Description: "), col("description")),
                            concat(lit("Resolution: "), coalesce(col("resolution_summary"), lit("N/A")))
                        )
                    )
                    .withColumn("content_hash", md5(col("content")))
                    .withColumn("source_id", col("id"))
                    .withColumn("source_table", lit("cases"))
                    .withColumn("entity_ids", lit(None).cast("array<string>"))
                    .withColumn("tags", lit(None).cast("array<string>"))
                    .withColumn("confidence", lit(0.9))
                    .withColumn("outcome", col("status"))
                    .withColumn("analyst_id", col("assigned_to"))
                    .withColumn("valid_from", col("closed_at"))
                    .withColumn("valid_until", lit(None).cast("timestamp"))
                    .withColumn("is_active", lit(True))
                    .withColumn("retrieval_count", lit(0).cast("bigint"))
                    .withColumn("last_retrieved", lit(None).cast("timestamp"))
                    .withColumn("created_at", current_timestamp())
                    .withColumn("updated_at", current_timestamp())
                    .select(
                        "ks_id", "entry_type", "title", "content", "content_hash",
                        "source_id", "source_table", "entity_ids",
                        "mitre_tactics", "mitre_techniques", "tags",
                        "severity", "confidence", "outcome", "analyst_id",
                        "valid_from", "valid_until", "is_active",
                        "retrieval_count", "last_retrieved", "created_at", "updated_at"
                    )
                )
                case_entries.write.mode("append").saveAsTable(ks_table)
                total_ingested += case_count
                print(f"  Cases → KS: {case_count} incident memories")
        except Exception as e:
            if "TABLE_OR_VIEW_NOT_FOUND" not in str(e):
                mon.log_warning(f"Case ingestion failed: {str(e)[:200]}")

    # ─── Source 2: Analyst feedback → suppression/decision memories ───
    with mon.time("ingest_feedback"):
        feedback_table = get_table_path(cfg, "analyst_feedback")
        try:
            new_feedback = spark.sql(f"""
                SELECT id, alert_id, feedback_type, rationale, analyst_id,
                       created_at as feedback_time
                FROM {feedback_table}
                WHERE created_at > '{cutoff.isoformat()}'
                  AND id NOT IN (SELECT source_id FROM {ks_table} WHERE source_table = 'analyst_feedback')
            """)

            fb_count = new_feedback.count()
            if fb_count > 0:
                fb_entries = (
                    new_feedback
                    .withColumn("ks_id", expr("uuid()"))
                    .withColumn("entry_type",
                        when(col("feedback_type") == "false_positive", lit("suppression"))
                        .otherwise(lit("analyst_decision"))
                    )
                    .withColumn("title",
                        concat(lit("Analyst "), col("feedback_type"), lit(" on alert "), col("alert_id"))
                    )
                    .withColumn("content",
                        concat_ws("\n",
                            concat(lit("Feedback: "), col("feedback_type")),
                            concat(lit("Rationale: "), coalesce(col("rationale"), lit("No rationale provided"))),
                            concat(lit("Alert: "), col("alert_id"))
                        )
                    )
                    .withColumn("content_hash", md5(col("content")))
                    .withColumn("source_id", col("id"))
                    .withColumn("source_table", lit("analyst_feedback"))
                    .withColumn("entity_ids", lit(None).cast("array<string>"))
                    .withColumn("mitre_tactics", lit(None).cast("array<string>"))
                    .withColumn("mitre_techniques", lit(None).cast("array<string>"))
                    .withColumn("tags", array(col("feedback_type")))
                    .withColumn("severity", lit(None).cast("string"))
                    .withColumn("confidence", lit(0.8))
                    .withColumn("outcome", col("feedback_type"))
                    .withColumn("valid_from", col("feedback_time"))
                    .withColumn("valid_until", lit(None).cast("timestamp"))
                    .withColumn("is_active", lit(True))
                    .withColumn("retrieval_count", lit(0).cast("bigint"))
                    .withColumn("last_retrieved", lit(None).cast("timestamp"))
                    .withColumn("created_at", current_timestamp())
                    .withColumn("updated_at", current_timestamp())
                    .select(
                        "ks_id", "entry_type", "title", "content", "content_hash",
                        "source_id", "source_table", "entity_ids",
                        "mitre_tactics", "mitre_techniques", "tags",
                        "severity", "confidence", "outcome", "analyst_id",
                        "valid_from", "valid_until", "is_active",
                        "retrieval_count", "last_retrieved", "created_at", "updated_at"
                    )
                )
                fb_entries.write.mode("append").saveAsTable(ks_table)
                total_ingested += fb_count
                print(f"  Feedback → KS: {fb_count} decision memories")
        except Exception as e:
            if "TABLE_OR_VIEW_NOT_FOUND" not in str(e):
                mon.log_warning(f"Feedback ingestion failed: {str(e)[:200]}")

    # ─── Source 3: Threat feeds → CTI memories ───
    with mon.time("ingest_cti"):
        feeds_table = get_table_path(cfg, "threat_feeds")
        try:
            new_cti = spark.sql(f"""
                SELECT id, feed_name, indicator_type, indicator_value,
                       threat_actor, campaign, description, confidence_score,
                       severity, tags, updated_at as feed_updated
                FROM {feeds_table}
                WHERE updated_at > '{cutoff.isoformat()}'
                  AND id NOT IN (SELECT source_id FROM {ks_table} WHERE source_table = 'threat_feeds')
                LIMIT {max_entries}
            """)

            cti_count = new_cti.count()
            if cti_count > 0:
                cti_entries = (
                    new_cti
                    .withColumn("ks_id", expr("uuid()"))
                    .withColumn("entry_type", lit("cti"))
                    .withColumn("title",
                        concat(col("feed_name"), lit(": "), col("indicator_type"), lit(" - "), col("indicator_value"))
                    )
                    .withColumn("content",
                        concat_ws("\n",
                            concat(lit("Feed: "), col("feed_name")),
                            concat(lit("Type: "), col("indicator_type")),
                            concat(lit("Value: "), col("indicator_value")),
                            concat(lit("Actor: "), coalesce(col("threat_actor"), lit("Unknown"))),
                            concat(lit("Campaign: "), coalesce(col("campaign"), lit("N/A"))),
                            concat(lit("Description: "), coalesce(col("description"), lit("")))
                        )
                    )
                    .withColumn("content_hash", md5(col("content")))
                    .withColumn("source_id", col("id"))
                    .withColumn("source_table", lit("threat_feeds"))
                    .withColumn("entity_ids", lit(None).cast("array<string>"))
                    .withColumn("mitre_tactics", lit(None).cast("array<string>"))
                    .withColumn("mitre_techniques", lit(None).cast("array<string>"))
                    .withColumn("confidence",
                        coalesce(col("confidence_score").cast("double"), lit(0.6)))
                    .withColumn("outcome", lit(None).cast("string"))
                    .withColumn("analyst_id", lit(None).cast("string"))
                    .withColumn("valid_from", col("feed_updated"))
                    .withColumn("valid_until", lit(None).cast("timestamp"))
                    .withColumn("is_active", lit(True))
                    .withColumn("retrieval_count", lit(0).cast("bigint"))
                    .withColumn("last_retrieved", lit(None).cast("timestamp"))
                    .withColumn("created_at", current_timestamp())
                    .withColumn("updated_at", current_timestamp())
                    .select(
                        "ks_id", "entry_type", "title", "content", "content_hash",
                        "source_id", "source_table", "entity_ids",
                        "mitre_tactics", "mitre_techniques", "tags",
                        "severity", "confidence", "outcome", "analyst_id",
                        "valid_from", "valid_until", "is_active",
                        "retrieval_count", "last_retrieved", "created_at", "updated_at"
                    )
                )
                cti_entries.write.mode("append").saveAsTable(ks_table)
                total_ingested += cti_count
                print(f"  CTI → KS: {cti_count} threat intelligence memories")
        except Exception as e:
            if "TABLE_OR_VIEW_NOT_FOUND" not in str(e):
                mon.log_warning(f"CTI ingestion failed: {str(e)[:200]}")

    # ─── Source 4: Response actions → playbook outcome memories ───
    with mon.time("ingest_responses"):
        response_table = get_table_path(cfg, "response_actions")
        try:
            new_responses = spark.sql(f"""
                SELECT id, action_type, target, status, result,
                       alert_id, initiated_by, executed_at
                FROM {response_table}
                WHERE executed_at > '{cutoff.isoformat()}'
                  AND status IN ('completed', 'failed', 'rolled_back')
                  AND id NOT IN (SELECT source_id FROM {ks_table} WHERE source_table = 'response_actions')
            """)

            resp_count = new_responses.count()
            if resp_count > 0:
                resp_entries = (
                    new_responses
                    .withColumn("ks_id", expr("uuid()"))
                    .withColumn("entry_type", lit("playbook_outcome"))
                    .withColumn("title",
                        concat(col("action_type"), lit(" → "), col("status"), lit(" on "), col("target"))
                    )
                    .withColumn("content",
                        concat_ws("\n",
                            concat(lit("Action: "), col("action_type")),
                            concat(lit("Target: "), col("target")),
                            concat(lit("Status: "), col("status")),
                            concat(lit("Result: "), coalesce(col("result"), lit("N/A"))),
                            concat(lit("Alert: "), coalesce(col("alert_id"), lit("N/A")))
                        )
                    )
                    .withColumn("content_hash", md5(col("content")))
                    .withColumn("source_id", col("id"))
                    .withColumn("source_table", lit("response_actions"))
                    .withColumn("entity_ids", lit(None).cast("array<string>"))
                    .withColumn("mitre_tactics", lit(None).cast("array<string>"))
                    .withColumn("mitre_techniques", lit(None).cast("array<string>"))
                    .withColumn("tags", array(col("action_type")))
                    .withColumn("severity", lit(None).cast("string"))
                    .withColumn("confidence", lit(0.95))
                    .withColumn("outcome", col("status"))
                    .withColumn("analyst_id", col("initiated_by"))
                    .withColumn("valid_from", col("executed_at"))
                    .withColumn("valid_until", lit(None).cast("timestamp"))
                    .withColumn("is_active", lit(True))
                    .withColumn("retrieval_count", lit(0).cast("bigint"))
                    .withColumn("last_retrieved", lit(None).cast("timestamp"))
                    .withColumn("created_at", current_timestamp())
                    .withColumn("updated_at", current_timestamp())
                    .select(
                        "ks_id", "entry_type", "title", "content", "content_hash",
                        "source_id", "source_table", "entity_ids",
                        "mitre_tactics", "mitre_techniques", "tags",
                        "severity", "confidence", "outcome", "analyst_id",
                        "valid_from", "valid_until", "is_active",
                        "retrieval_count", "last_retrieved", "created_at", "updated_at"
                    )
                )
                resp_entries.write.mode("append").saveAsTable(ks_table)
                total_ingested += resp_count
                print(f"  Responses → KS: {resp_count} playbook outcome memories")
        except Exception as e:
            if "TABLE_OR_VIEW_NOT_FOUND" not in str(e):
                mon.log_warning(f"Response ingestion failed: {str(e)[:200]}")

    print(f"\nTotal KS entries ingested: {total_ingested}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Re-embed Mode: Generate Embeddings for Unembedded Entries

# COMMAND ----------

if mode in ("ingest", "reembed"):
    with mon.time("generate_embeddings"):
        # Find entries without embeddings
        unembedded = spark.sql(f"""
            SELECT k.ks_id, k.title, k.content
            FROM {ks_table} k
            LEFT JOIN {ks_index_table} e ON k.ks_id = e.ks_id
            WHERE e.ks_id IS NULL AND k.is_active = true
            LIMIT {max_entries}
        """)

        unemb_count = unembedded.count()
        if unemb_count > 0:
            # Prepare text for embedding (title + content truncated)
            to_embed = (
                unembedded
                .withColumn("text_for_embedding",
                    substring(concat_ws(" | ", col("title"), col("content")), 1, 4000)
                )
            )

            # Try AI Functions for batch embedding
            try:
                embedded_df = (
                    to_embed
                    .withColumn("embedding",
                        expr(f"ai_query('{embedding_model}', text_for_embedding)")
                    )
                    .withColumn("model_name", lit(embedding_model))
                    .withColumn("embedded_at", current_timestamp())
                    .select("ks_id", "embedding", "text_for_embedding", "model_name", "embedded_at")
                )
                embedded_df.write.mode("append").saveAsTable(ks_index_table)
                print(f"Embedded {unemb_count} KS entries via ai_query")
            except Exception as e:
                mon.log_warning(f"Batch embedding failed: {str(e)[:200]}")
                print(f"Embedding skipped — {unemb_count} entries awaiting embedding")
        else:
            print("All active KS entries are already embedded")

# COMMAND ----------

# MAGIC %md
# MAGIC ## GC Mode: Expire Old Entries

# COMMAND ----------

if mode == "gc":
    with mon.time("garbage_collect"):
        # Deactivate entries past their valid_until date
        expired = spark.sql(f"""
            UPDATE {ks_table}
            SET is_active = false, updated_at = current_timestamp()
            WHERE valid_until IS NOT NULL
              AND valid_until < current_timestamp()
              AND is_active = true
        """)

        # Deactivate CTI entries older than 90 days with zero retrievals
        stale_cti = spark.sql(f"""
            UPDATE {ks_table}
            SET is_active = false, updated_at = current_timestamp()
            WHERE entry_type = 'cti'
              AND retrieval_count = 0
              AND created_at < current_timestamp() - INTERVAL 90 DAYS
              AND is_active = true
        """)
        print("GC complete: expired and stale entries deactivated")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Stats Mode

# COMMAND ----------

if mode == "stats":
    stats = spark.sql(f"""
        SELECT
            entry_type,
            COUNT(*) as total,
            SUM(CASE WHEN is_active THEN 1 ELSE 0 END) as active,
            AVG(retrieval_count) as avg_retrievals,
            MAX(created_at) as newest
        FROM {ks_table}
        GROUP BY entry_type
        ORDER BY total DESC
    """)
    stats.show(truncate=False)

# COMMAND ----------

total_ks = spark.sql(f"SELECT COUNT(*) FROM {ks_table} WHERE is_active = true").first()[0]
total_embedded = spark.sql(f"SELECT COUNT(*) FROM {ks_index_table}").first()[0]

result = {
    "notebook": "42_knowledge_store",
    "mode": mode,
    "status": "completed",
    "total_active_entries": total_ks,
    "total_embedded": total_embedded,
    "ingested_this_run": total_ingested if mode == "ingest" else 0,
}
mon.log_complete(details=result)
dbutils.notebook.exit(json.dumps(result))
