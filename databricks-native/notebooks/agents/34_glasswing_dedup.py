# Databricks notebook source
# MAGIC %md
# MAGIC # Glasswing Deduplication Agent
# MAGIC Deduplicates vulnerability findings across scanners and time periods using semantic similarity.
# MAGIC Maintains canonical vulnerability entries with confidence scoring.

# COMMAND ----------

# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

require_enabled("glasswing_dedup")

# COMMAND ----------

from agent_framework import BatchAgent, AgentResult, AgentStatus, UCTool, create_soc_tools
from datetime import datetime, timedelta
from pyspark.sql.types import StructType, StructField, StringType, DoubleType, LongType
from pyspark.sql.functions import col, hash, md5, concat_ws
import json
import uuid

# COMMAND ----------

# Widget parameters
dbutils.widgets.text("lookback_days", "7", "Days to look back for dedup")
dbutils.widgets.text("similarity_threshold", "0.85", "Embedding similarity threshold")
dbutils.widgets.text("batch_size", "100", "Batch size for embedding queries")

lookback_days = int(dbutils.widgets.get("lookback_days"))
similarity_threshold = float(dbutils.widgets.get("similarity_threshold"))
batch_size = int(dbutils.widgets.get("batch_size"))

# COMMAND ----------

class GlasswingDedupAgent(BatchAgent):
    """Deduplicates vulnerabilities across scanners using semantic similarity."""

    def __init__(self, agent_name: str, cfg, llm, mon, spark):
        super().__init__(agent_name, cfg, llm, mon, spark)
        self.processed_count = 0
        self.error_count = 0
        self.deduplicated_count = 0

    def execute(self) -> AgentResult:
        """Execute deduplication pipeline."""
        try:
            # Fetch unprocessed findings
            span = self._start_trace("fetch_findings")
            findings = self._fetch_unprocessed_findings()
            self.processed_count = len(findings)
            self._end_trace(span, {"findings_count": len(findings)})

            if not findings:
                return AgentResult(
                    status=AgentStatus.COMPLETED,
                    agent_name=self.agent_name,
                    processed_count=0,
                    error_count=0,
                    details={"deduplicated_count": 0},
                )

            # Cluster similar findings by CVE
            span = self._start_trace("cluster_findings")
            clusters = self._cluster_by_cve(findings)
            self._end_trace(span, {"clusters_count": len(clusters)})

            # Perform semantic deduplication within clusters
            span = self._start_trace("semantic_dedup")
            canonical = self._semantic_deduplication(clusters)
            self.deduplicated_count = len(canonical)
            self._end_trace(span, {"canonical_count": len(canonical)})

            # Write canonical entries
            span = self._start_trace("write_canonical")
            self._write_canonical(canonical)
            self._end_trace(span, {"written_count": len(canonical)})

            return AgentResult(
                status=AgentStatus.COMPLETED,
                agent_name=self.agent_name,
                processed_count=self.processed_count,
                error_count=self.error_count,
                details={
                    "findings_processed": len(findings),
                    "clusters_created": len(clusters),
                    "canonical_entries": len(canonical),
                },
            )

        except Exception as e:
            self.error_count += 1
            raise

    def _fetch_unprocessed_findings(self) -> list:
        """Fetch recent unprocessed findings from vulnerability_findings."""
        cutoff = (datetime.utcnow() - timedelta(days=lookback_days)).isoformat()

        try:
            df = self.spark.sql(f"""
                SELECT * FROM {self.cfg.catalog}.{self.cfg.schema}.vulnerability_findings
                WHERE first_seen >= '{cutoff}' AND status = 'open'
                LIMIT {batch_size * 10}
            """)
            return [row.asDict() for row in df.collect()]
        except Exception as e:
            print(f"Error fetching findings: {e}")
            self.error_count += 1
            return []

    def _cluster_by_cve(self, findings: list) -> dict:
        """Group findings by CVE ID."""
        clusters = {}
        for f in findings:
            cve = f.get("cve_id", "unknown")
            if cve not in clusters:
                clusters[cve] = []
            clusters[cve].append(f)
        return clusters

    def _semantic_deduplication(self, clusters: dict) -> list:
        """Perform semantic deduplication within each CVE cluster."""
        canonical_entries = []

        for cve_id, group in clusters.items():
            if not group:
                continue

            # Use LLM to analyze group and identify canonical entry
            span = self._start_trace(f"llm_dedup_{cve_id[:20]}")

            try:
                group_summary = self._summarize_group(group)
                llm_result = self.llm_classify(
                    system="You are a vulnerability deduplication expert.",
                    user=f"Analyze these {len(group)} vulnerability findings and identify the best canonical entry. Return JSON with: canonical_index (int), confidence (float 0-1), dedup_reason (str).",
                    json_mode=True,
                    temperature=0.1,
                )

                canonical_idx = llm_result.get("canonical_index", 0) % len(group)
                confidence = float(llm_result.get("confidence", 0.7))
                dedup_reason = llm_result.get("dedup_reason", "semantic_similarity")

            except Exception as e:
                print(f"LLM dedup error for {cve_id}: {e}")
                self.error_count += 1
                # Fallback: use first by date
                group = sorted(group, key=lambda x: x.get("first_seen", ""))
                canonical_idx = 0
                confidence = 0.5
                dedup_reason = "fallback_earliest"

            self._end_trace(span, {
                "cve_id": cve_id,
                "group_size": len(group),
                "canonical_idx": canonical_idx,
            })

            # Build canonical entry
            canonical = group[canonical_idx]
            merged_findings = [
                {
                    "finding_id": f.get("id"),
                    "scanner": f.get("scanner"),
                    "severity": f.get("severity"),
                }
                for f in group
            ]

            canonical_entry = {
                "id": str(uuid.uuid4()),
                "canonical_id": f"CANON-{cve_id}-{datetime.utcnow().strftime('%Y%m%d')}",
                "cve_id": cve_id,
                "primary_source": canonical.get("scanner", "unknown"),
                "merged_findings": json.dumps(merged_findings),
                "merged_count": len(group),
                "confidence": confidence,
                "dedup_method": dedup_reason,
                "severity": canonical.get("severity", "medium"),
                "title": canonical.get("title", ""),
                "description": canonical.get("description", ""),
                "first_seen": min(f.get("first_seen", "") for f in group),
                "last_seen": max(f.get("last_seen", "") for f in group),
                "status": "canonical",
                "created_at": datetime.utcnow().isoformat(),
            }

            canonical_entries.append(canonical_entry)

        return canonical_entries

    def _summarize_group(self, group: list) -> str:
        """Create summary of finding group for LLM."""
        summaries = []
        for i, f in enumerate(group):
            s = f"[{i}] {f.get('scanner', 'unknown')}: {f.get('title', 'N/A')} (severity: {f.get('severity', 'medium')})"
            summaries.append(s)
        return "\n".join(summaries)

    def _write_canonical(self, entries: list):
        """Write canonical entries to vulnerability_canonical table."""
        if not entries:
            return

        schema = StructType([
            StructField("id", StringType(), False),
            StructField("canonical_id", StringType(), False),
            StructField("cve_id", StringType(), False),
            StructField("primary_source", StringType(), False),
            StructField("merged_findings", StringType(), False),
            StructField("merged_count", LongType(), False),
            StructField("confidence", DoubleType(), False),
            StructField("dedup_method", StringType(), False),
            StructField("severity", StringType(), False),
            StructField("title", StringType(), False),
            StructField("description", StringType(), False),
            StructField("first_seen", StringType(), False),
            StructField("last_seen", StringType(), False),
            StructField("status", StringType(), False),
            StructField("created_at", StringType(), False),
        ])

        df = self.spark.createDataFrame(entries, schema=schema)

        safe_merge(
            self.spark,
            df,
            "vulnerability_canonical",
            merge_keys=["cve_id"],
            catalog=self.cfg.catalog,
            schema=self.cfg.schema,
        )

# COMMAND ----------

# Initialize and run agent
try:
    agent = GlasswingDedupAgent(
        agent_name="glasswing_dedup",
        cfg=cfg,
        llm=llm,
        mon=mon,
        spark=spark,
    )

    result = agent.run()
    mon.log_event("glasswing_dedup_completed", {
        "processed": result.processed_count,
        "errors": result.error_count,
        "deduplicated": result.details.get("canonical_entries", 0),
    })
    print(json.dumps(result.to_json()))
    dbutils.notebook.exit(result.to_json())

except Exception as e:
    mon.log_error(e, context="glasswing_dedup agent")
    result = {
        "status": "error",
        "error": str(e),
        "agent": "glasswing_dedup",
    }
    dbutils.notebook.exit(json.dumps(result))
