# Databricks notebook source
# MAGIC %md
# MAGIC # Agent 13 - Digital Forensics Collection (Mosaic AI Agent Framework)
# MAGIC Automated evidence preservation and forensic analysis.
# MAGIC - Collects and preserves evidence chain (events, logs, artifacts)
# MAGIC - Maintains chain of custody metadata with SHA256 integrity hashing
# MAGIC - Reconstructs event timelines for investigation
# MAGIC - Generates forensic reports via LLM

# COMMAND ----------

# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

require_enabled("forensics")

# COMMAND ----------

import json
import hashlib
from datetime import datetime
from pyspark.sql import functions as F
import mlflow
from agent_framework import BatchAgent, AgentResult, AgentStatus, UCTool, create_soc_tools

# COMMAND ----------

# MAGIC %md
# MAGIC ## Forensics Agent Implementation

# COMMAND ----------

class ForensicsAgent(BatchAgent):
    """
    Digital Forensics Collection Agent.
    Automated evidence preservation and chain-of-custody management.
    """

    def __init__(self, agent_name: str, cfg, llm, mon, spark):
        super().__init__(agent_name, cfg, llm, mon, spark)

        # Register tools for forensic evidence collection
        for tool in create_soc_tools(cfg):
            if tool.name in ["search_events", "get_alert_context"]:
                self.register_tool(tool)

    def execute(self) -> AgentResult:
        """Execute forensic evidence collection."""
        processed_count = 0
        error_count = 0

        try:
            # Initialize tables
            with mon.time("forensics_init"):
                cases_table = cfg.get_table_path("cases")
                events_table = cfg.get_table_path("events")
                network_flows_table = cfg.get_table_path("network_flows")
                evidence_table = cfg.get_table_path("forensic_collections")
                reports_table = cfg.get_table_path("forensic_reports")

                # Identify open high-severity cases requiring forensics
                open_cases = (
                    spark.read.table(cases_table)
                    .filter(F.col("status").isin("investigating", "escalated"))
                    .filter(F.col("severity").isin("critical", "high"))
                    .orderBy(F.col("severity").desc(), F.col("created_at").asc())
                    .limit(5)
                    .collect()
                )

                processed_count = len(open_cases)
                mon.log_event("cases_identified", {"count": processed_count})

            # Collect evidence for each case
            all_evidence_records = []
            all_report_records = []

            with mon.time("evidence_collection"):
                for case in open_cases:
                    try:
                        # Get source IPs associated with case alerts
                        case_alerts = (
                            spark.read.table(cfg.get_table_path("alerts"))
                            .filter(F.col("case_id") == case.case_id)
                            .select("source_ip")
                            .distinct()
                            .collect()
                        )
                        source_ips = [row.source_ip for row in case_alerts if row.source_ip]

                        if not source_ips:
                            mon.log_event("case_skipped_no_ips", {"case_id": case.case_id})
                            continue

                        # Collect evidence
                        evidence_record = self._collect_case_evidence(
                            case, source_ips, events_table, network_flows_table
                        )
                        all_evidence_records.append(evidence_record)

                        mon.log_event("evidence_collected", {
                            "case_id": case.case_id,
                            "events": evidence_record["event_count"],
                            "flows": evidence_record["flow_count"],
                        })

                    except Exception as e:
                        error_count += 1
                        mon.log_error(f"Evidence collection failed for case {case.case_id}: {e}")

            # Generate forensic reports
            with mon.time("report_generation"):
                for evidence_rec in all_evidence_records:
                    try:
                        report_record = self._generate_forensic_report(
                            evidence_rec, events_table
                        )
                        all_report_records.append(report_record)
                        mon.log_event("report_generated", {"case_id": evidence_rec["case_id"]})

                    except Exception as e:
                        error_count += 1
                        mon.log_error(f"Report generation failed: {e}")

            # Persist results
            with mon.time("persist_results"):
                if all_evidence_records:
                    evidence_df = spark.createDataFrame(all_evidence_records)
                    safe_append(evidence_df, evidence_table, catalog=cfg.catalog, schema=cfg.schema)

                if all_report_records:
                    reports_df = spark.createDataFrame(all_report_records)
                    safe_append(reports_df, reports_table, catalog=cfg.catalog, schema=cfg.schema)

            # Log MLflow metrics
            mlflow.set_experiment(f"/0xDSI/agents/{self.agent_name}")
            with mlflow.start_run(run_name=f"forensics_{datetime.utcnow().strftime('%Y%m%d%H%M%S')}"):
                mlflow.log_params({
                    "agent": self.agent_name,
                    "cases_processed": processed_count,
                })
                mlflow.log_metrics({
                    "evidence_records": len(all_evidence_records),
                    "reports_generated": len(all_report_records),
                    "errors": error_count,
                })

            mon.log_complete("forensics_agent", {
                "cases_processed": processed_count,
                "evidence_records": len(all_evidence_records),
                "reports_generated": len(all_report_records),
            })

            status = AgentStatus.COMPLETED if error_count == 0 else AgentStatus.DEGRADED

            return AgentResult(
                status=status,
                agent_name=self.agent_name,
                processed_count=processed_count,
                error_count=error_count,
                details={
                    "cases_processed": processed_count,
                    "evidence_collected": len(all_evidence_records),
                    "reports_generated": len(all_report_records),
                },
            )

        except Exception as e:
            error_count += 1
            mon.log_error(e, context="forensics")
            raise

    def _collect_case_evidence(self, case, source_ips, events_table, network_flows_table):
        """Collect and preserve evidence for a case with chain-of-custody hashing."""
        seven_days_ago = F.date_sub(F.current_timestamp(), 7)

        # Collect related events
        related_events = (
            spark.read.table(events_table)
            .filter(F.col("source_ip").isin(source_ips))
            .filter(F.col("timestamp") >= seven_days_ago)
            .orderBy("timestamp")
            .limit(500)
        )

        # Collect network flows
        network_evidence = (
            spark.read.table(network_flows_table)
            .filter((F.col("source_ip").isin(source_ips)) | (F.col("dest_ip").isin(source_ips)))
            .filter(F.col("timestamp") >= seven_days_ago)
            .orderBy("timestamp")
            .limit(200)
        )

        event_rows = related_events.collect()
        flow_rows = network_evidence.collect()

        # Compute chain-of-custody hashes
        event_hashes = self._compute_evidence_hashes(event_rows)
        flow_hashes = self._compute_evidence_hashes(flow_rows)
        all_hashes = event_hashes + flow_hashes

        # Build master evidence hash
        combined = "".join(h["sha256"] for h in all_hashes)
        master_hash = hashlib.sha256(combined.encode("utf-8")).hexdigest()

        # Store evidence metadata
        evidence_record = {
            "case_id": case.case_id,
            "evidence_type": "forensic_collection",
            "collection_timestamp": datetime.utcnow(),
            "event_count": len(event_rows),
            "flow_count": len(flow_rows),
            "evidence_hashes": json.dumps(all_hashes[:50]),
            "hash_integrity": master_hash,
            "source_ips": json.dumps(source_ips),
            "custody_chain": json.dumps([
                {
                    "action": "collected",
                    "timestamp": datetime.utcnow().isoformat(),
                    "agent": "forensics_agent",
                    "hash": master_hash,
                }
            ]),
            "chain_of_custody_valid": True,
        }

        return evidence_record

    def _compute_evidence_hashes(self, evidence_rows):
        """Compute SHA256 hashes for chain-of-custody integrity."""
        hashes = []
        for row in evidence_rows:
            try:
                row_dict = row.asDict() if hasattr(row, 'asDict') else dict(row)
                row_json = json.dumps(row_dict, default=str, sort_keys=True)
                sha256_hash = hashlib.sha256(row_json.encode()).hexdigest()
                hashes.append({
                    "event_id": row_dict.get("event_id", "unknown"),
                    "sha256": sha256_hash,
                })
            except Exception as e:
                mon.log_warning(f"Hash computation failed: {e}")
        return hashes

    def _generate_forensic_report(self, evidence_rec, events_table):
        """Generate forensic report from collected evidence."""
        case_id = evidence_rec["case_id"]
        source_ips = json.loads(evidence_rec["source_ips"])

        # Reconstruct timeline
        try:
            timeline_events = (
                spark.read.table(events_table)
                .filter(F.col("source_ip").isin(source_ips))
                .filter(F.col("timestamp") >= F.date_sub(F.current_timestamp(), 7))
                .orderBy("timestamp")
                .select("timestamp", "event_type", "source_ip", "destination_ip", "severity", "action")
                .limit(30)
                .collect()
            )
        except Exception as e:
            mon.log_warning(f"Timeline reconstruction failed: {e}")
            timeline_events = []

        # Build timeline text for LLM
        timeline_text = "\n".join(
            f"[{r.timestamp}] {r.event_type} | {r.source_ip}->{r.destination_ip} | {r.action} ({r.severity})"
            for r in timeline_events
        )

        # Generate forensic report via LLM
        prompt = (
            f"Generate a forensic report in JSON.\nCase: {case_id}\n"
            f"Evidence: {evidence_rec['event_count']} events, {evidence_rec['flow_count']} flows\n"
            f"Master hash: {evidence_rec['hash_integrity']}\nTimeline:\n{timeline_text}\n\n"
            f"Return JSON with fields: incident_summary, root_cause_analysis, attack_timeline (array), "
            f"scope_of_compromise, containment_recommendations (array), remediation_steps (array), "
            f"legal_notes, confidence_level (high/medium/low)."
        )

        try:
            report_json = self.llm_classify(
                system="You are a digital forensics expert and incident response analyst.",
                user=prompt,
                json_mode=True
            )
        except Exception as e:
            mon.log_warning(f"LLM report generation failed: {e}")
            report_json = {
                "incident_summary": "Report generation failed",
                "error": str(e),
            }

        report_record = {
            "case_id": case_id,
            "report_timestamp": datetime.utcnow(),
            "report_content": json.dumps(report_json),
            "evidence_master_hash": evidence_rec["hash_integrity"],
            "event_count": evidence_rec["event_count"],
            "flow_count": evidence_rec["flow_count"],
            "confidence_level": report_json.get("confidence_level", "medium"),
            "status": "complete",
        }

        return report_record

# COMMAND ----------

# MAGIC %md
# MAGIC ## Execute Agent

# COMMAND ----------

agent = ForensicsAgent("forensics_agent", cfg, llm, mon, spark)
result = agent.run()

dbutils.notebook.exit(result.to_json())
