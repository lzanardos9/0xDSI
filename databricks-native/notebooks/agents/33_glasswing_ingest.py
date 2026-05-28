# Databricks notebook source
# MAGIC %md
# MAGIC # Glasswing Vulnerability Ingestion Agent
# MAGIC Ingests vulnerability scan results from multiple scanners (Qualys, Tenable, Rapid7).
# MAGIC Normalizes to common CVE-based schema and deduplicates across scanner overlap.

# COMMAND ----------

# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

require_enabled("glasswing_ingest")

# COMMAND ----------

from agent_framework import BatchAgent, AgentResult, AgentStatus, UCTool, create_soc_tools
from datetime import datetime, timedelta
from pyspark.sql.types import StructType, StructField, StringType, LongType, DoubleType
from pyspark.sql.functions import col, to_timestamp, hash, md5, concat_ws
import json
import uuid
import hashlib

# COMMAND ----------

# Widget parameters
dbutils.widgets.text("scanner_sources", "qualys,tenable,rapid7", "Comma-separated scanner names")
dbutils.widgets.text("lookback_hours", "24", "Hours to look back for new scans")
dbutils.widgets.text("batch_size", "1000", "Batch size for ingestion")

scanner_sources = [s.strip() for s in dbutils.widgets.get("scanner_sources").split(",")]
lookback_hours = int(dbutils.widgets.get("lookback_hours"))
batch_size = int(dbutils.widgets.get("batch_size"))

# COMMAND ----------

# COMMAND ----------

class GlasswingIngestAgent(BatchAgent):
    """Ingests vulnerability data from multiple scanners and normalizes to common schema."""

    def __init__(self, agent_name: str, cfg, llm, mon, spark, scanners: list):
        super().__init__(agent_name, cfg, llm, mon, spark)
        self.scanners = scanners
        self.processed_count = 0
        self.error_count = 0

    def execute(self) -> AgentResult:
        """Execute vulnerability ingestion pipeline."""
        try:
            # Ingest from each scanner
            all_findings = []
            for scanner in self.scanners:
                span = self._start_trace(f"ingest_{scanner}")
                findings = self._ingest_scanner(scanner)
                all_findings.extend(findings)
                self.processed_count += len(findings)
                self._end_trace(span, {"scanner": scanner, "count": len(findings)})

            # Normalize all findings
            span = self._start_trace("normalize_findings")
            normalized = self._normalize_findings(all_findings)
            self._end_trace(span, {"normalized_count": len(normalized)})

            # Deduplicate across scanners
            span = self._start_trace("deduplicate")
            deduped = self._deduplicate_findings(normalized)
            self._end_trace(span, {"deduplicated_count": len(deduped)})

            # Write to vulnerability_findings table
            span = self._start_trace("write_findings")
            self._write_findings(deduped)
            self._end_trace(span, {"written_count": len(deduped)})

            return AgentResult(
                status=AgentStatus.COMPLETED,
                agent_name=self.agent_name,
                processed_count=self.processed_count,
                error_count=self.error_count,
                details={
                    "total_ingested": len(all_findings),
                    "deduplicated_count": len(deduped),
                    "scanners_processed": len(self.scanners),
                },
            )

        except Exception as e:
            self.error_count += 1
            raise

    def _ingest_scanner(self, scanner: str) -> list:
        """Ingest findings from a specific scanner."""
        cutoff = (datetime.utcnow() - timedelta(hours=lookback_hours)).isoformat()

        findings = []
        try:
            if scanner == "qualys":
                findings = self._ingest_qualys(cutoff)
            elif scanner == "tenable":
                findings = self._ingest_tenable(cutoff)
            elif scanner == "rapid7":
                findings = self._ingest_rapid7(cutoff)
        except Exception as e:
            print(f"Error ingesting from {scanner}: {e}")
            self.error_count += 1

        return findings

    def _ingest_qualys(self, cutoff: str) -> list:
        """Ingest from Qualys scanner API."""
        findings = []
        try:
            qualys_table = f"{self.cfg.catalog}.{self.cfg.schema}.qualys_raw_findings"
            df = self.spark.sql(f"""
                SELECT * FROM {qualys_table}
                WHERE ingested_at > '{cutoff}' AND processed = false
                LIMIT {batch_size}
            """)

            for row in df.collect():
                findings.append({
                    "scanner": "qualys",
                    "qid": row.get("qid"),
                    "cve_id": row.get("cve_id"),
                    "asset_id": row.get("asset_id"),
                    "asset_ip": row.get("asset_ip"),
                    "severity": row.get("severity", "medium"),
                    "title": row.get("title", ""),
                    "description": row.get("description", ""),
                    "raw_data": json.dumps(row.asDict()),
                })
        except Exception as e:
            print(f"Qualys ingestion error: {e}")

        return findings

    def _ingest_tenable(self, cutoff: str) -> list:
        """Ingest from Tenable scanner API."""
        findings = []
        try:
            tenable_table = f"{self.cfg.catalog}.{self.cfg.schema}.tenable_raw_findings"
            df = self.spark.sql(f"""
                SELECT * FROM {tenable_table}
                WHERE ingested_at > '{cutoff}' AND processed = false
                LIMIT {batch_size}
            """)

            for row in df.collect():
                findings.append({
                    "scanner": "tenable",
                    "plugin_id": row.get("plugin_id"),
                    "cve_id": row.get("cve_id"),
                    "asset_id": row.get("asset_id"),
                    "asset_ip": row.get("asset_ip"),
                    "severity": row.get("severity", "medium"),
                    "title": row.get("title", ""),
                    "description": row.get("description", ""),
                    "raw_data": json.dumps(row.asDict()),
                })
        except Exception as e:
            print(f"Tenable ingestion error: {e}")

        return findings

    def _ingest_rapid7(self, cutoff: str) -> list:
        """Ingest from Rapid7 scanner API."""
        findings = []
        try:
            rapid7_table = f"{self.cfg.catalog}.{self.cfg.schema}.rapid7_raw_findings"
            df = self.spark.sql(f"""
                SELECT * FROM {rapid7_table}
                WHERE ingested_at > '{cutoff}' AND processed = false
                LIMIT {batch_size}
            """)

            for row in df.collect():
                findings.append({
                    "scanner": "rapid7",
                    "plugin_id": row.get("plugin_id"),
                    "cve_id": row.get("cve_id"),
                    "asset_id": row.get("asset_id"),
                    "asset_ip": row.get("asset_ip"),
                    "severity": row.get("severity", "medium"),
                    "title": row.get("title", ""),
                    "description": row.get("description", ""),
                    "raw_data": json.dumps(row.asDict()),
                })
        except Exception as e:
            print(f"Rapid7 ingestion error: {e}")

        return findings

    def _normalize_findings(self, findings: list) -> list:
        """Normalize findings to common schema."""
        normalized = []
        for f in findings:
            cve_id = f.get("cve_id", "")
            if not cve_id:
                cve_id = f"{f['scanner']}-{f.get('qid', f.get('plugin_id', 'unknown'))}"

            severity = f.get("severity", "medium").lower()
            if severity not in ["critical", "high", "medium", "low", "info"]:
                severity = "medium"

            normalized.append({
                "id": str(uuid.uuid4()),
                "cve_id": cve_id,
                "asset_id": f.get("asset_id", ""),
                "asset_ip": f.get("asset_ip", ""),
                "scanner": f["scanner"],
                "severity": severity,
                "title": f.get("title", "")[:500],
                "description": f.get("description", ""),
                "first_seen": datetime.utcnow().isoformat(),
                "last_seen": datetime.utcnow().isoformat(),
                "status": "open",
                "raw_data": f.get("raw_data", "{}"),
            })

        return normalized

    def _deduplicate_findings(self, findings: list) -> list:
        """Deduplicate findings across scanners."""
        seen = {}
        deduped = []

        for f in findings:
            key = (f["cve_id"], f["asset_id"])
            if key in seen:
                seen[key]["last_seen"] = f["last_seen"]
                scanners = json.loads(seen[key].get("scanners_reporting", "[]"))
                if f["scanner"] not in scanners:
                    scanners.append(f["scanner"])
                    seen[key]["scanners_reporting"] = json.dumps(scanners)
            else:
                f["scanners_reporting"] = json.dumps([f["scanner"]])
                seen[key] = f
                deduped.append(f)

        return deduped

    def _write_findings(self, findings: list):
        """Write normalized findings to vulnerability_findings table."""
        if not findings:
            return

        schema = StructType([
            StructField("id", StringType(), False),
            StructField("cve_id", StringType(), False),
            StructField("asset_id", StringType(), False),
            StructField("asset_ip", StringType(), False),
            StructField("scanner", StringType(), False),
            StructField("severity", StringType(), False),
            StructField("title", StringType(), False),
            StructField("description", StringType(), False),
            StructField("first_seen", StringType(), False),
            StructField("last_seen", StringType(), False),
            StructField("status", StringType(), False),
            StructField("scanners_reporting", StringType(), False),
            StructField("raw_data", StringType(), False),
        ])

        df = self.spark.createDataFrame(findings, schema=schema)

        safe_merge(
            self.spark,
            df,
            "vulnerability_findings",
            merge_keys=["cve_id", "asset_id", "scanner"],
            catalog=self.cfg.catalog,
            schema=self.cfg.schema,
        )

# COMMAND ----------

# Register Agent Status
try:
    agent = GlasswingIngestAgent(
        agent_name="glasswing_ingest",
        cfg=cfg,
        llm=llm,
        mon=mon,
        spark=spark,
        scanners=scanner_sources,
    )

    result = agent.run()
    mon.log_event("glasswing_ingest_completed", {
        "processed": result.processed_count,
        "errors": result.error_count,
        "deduplicated": result.details.get("deduplicated_count", 0),
    })
    print(json.dumps(result.to_json()))
    dbutils.notebook.exit(result.to_json())

except Exception as e:
    mon.log_error(e, context="glasswing_ingest agent")
    result = {
        "status": "error",
        "error": str(e),
        "agent": "glasswing_ingest",
    }
    dbutils.notebook.exit(json.dumps(result))
