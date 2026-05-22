# Databricks notebook source
# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

# MAGIC %md
# MAGIC # Agent 13 - Digital Forensics
# MAGIC Collects evidence for open cases, computes SHA256 hashes for chain-of-custody,
# MAGIC reconstructs event timelines, and generates forensic reports via LLM.

# COMMAND ----------

import json
import hashlib
from datetime import datetime
from pyspark.sql import functions as F

# COMMAND ----------

# MAGIC %md
# MAGIC ## Identify Open Cases Requiring Forensics

# COMMAND ----------

mon.time("forensics_init")

cases_table = cfg.get_table_path("cases")
events_table = cfg.get_table_path("events")
network_flows_table = cfg.get_table_path("network_flows")
evidence_table = cfg.get_table_path("forensic_evidence")
reports_table = cfg.get_table_path("forensic_reports")

open_cases = (
    spark.read.table(cases_table)
    .filter(F.col("status").isin("investigating", "escalated"))
    .filter(F.col("severity").isin("critical", "high"))
    .orderBy(F.col("severity").desc(), F.col("created_at").asc())
    .limit(5)
    .collect()
)

mon.log_event("cases_identified", {"count": len(open_cases)})

# COMMAND ----------

# MAGIC %md
# MAGIC ## Evidence Collection Functions

# COMMAND ----------

def collect_case_evidence(source_ips):
    """Collect related events and network flows for a case."""
    seven_days_ago = F.date_sub(F.current_timestamp(), 7)
    related_events = (
        spark.read.table(events_table)
        .filter(F.col("source_ip").isin(source_ips))
        .filter(F.col("timestamp") >= seven_days_ago)
        .orderBy("timestamp").limit(500)
    )
    network_evidence = (
        spark.read.table(network_flows_table)
        .filter(F.col("source_ip").isin(source_ips) | F.col("dest_ip").isin(source_ips))
        .filter(F.col("timestamp") >= seven_days_ago)
        .orderBy("timestamp").limit(200)
    )
    return related_events, network_evidence


def compute_evidence_hash(evidence_rows):
    """Compute SHA256 hashes for chain-of-custody integrity."""
    return [
        {"event_id": row.get("event_id", "unknown"),
         "sha256": hashlib.sha256(json.dumps(row.asDict(), default=str, sort_keys=True).encode()).hexdigest()}
        for row in evidence_rows
    ]

# COMMAND ----------

# MAGIC %md
# MAGIC ## Process Each Case

# COMMAND ----------

all_evidence_records = []
all_report_records = []

for case in open_cases:
    mon.time(f"case_{case.case_id}")

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
        events_df, flows_df = collect_case_evidence(source_ips)
        event_rows = events_df.collect()
        flow_rows = flows_df.collect()

        # Compute chain-of-custody hashes
        event_hashes = compute_evidence_hash(event_rows)
        flow_hashes = compute_evidence_hash(flow_rows)
        all_hashes = event_hashes + flow_hashes

        # Build master evidence hash
        combined = "".join(h["sha256"] for h in all_hashes)
        master_hash = hashlib.sha256(combined.encode("utf-8")).hexdigest()

        # Store evidence metadata
        all_evidence_records.append({
            "case_id": case.case_id,
            "collection_timestamp": datetime.utcnow(),
            "event_count": len(event_rows),
            "flow_count": len(flow_rows),
            "evidence_hashes": json.dumps(all_hashes[:50]),
            "master_hash": master_hash,
            "source_ips": json.dumps(source_ips),
            "chain_of_custody_valid": True,
        })

        mon.log_event("evidence_collected", {"case_id": case.case_id, "events": len(event_rows), "flows": len(flow_rows)})

    except Exception as e:
        mon.log_error("evidence_collection_failed", {"case_id": case.case_id, "error": str(e)})

# COMMAND ----------

# MAGIC %md
# MAGIC ## Reconstruct Timelines and Generate Forensic Reports

# COMMAND ----------

mon.time("report_generation")

for case in open_cases:
    matching = [r for r in all_evidence_records if r["case_id"] == case.case_id]
    if not matching:
        continue
    evidence_rec = matching[0]

    timeline_events = (
        spark.read.table(events_table)
        .filter(F.col("source_ip").isin(json.loads(evidence_rec["source_ips"])))
        .filter(F.col("timestamp") >= F.date_sub(F.current_timestamp(), 7))
        .orderBy("timestamp")
        .select("timestamp", "event_type", "source_ip", "destination_ip", "severity", "action")
        .limit(30).collect()
    )
    timeline_text = "\n".join(
        f"[{r.timestamp}] {r.event_type} | {r.source_ip}->{r.destination_ip} | {r.action} ({r.severity})"
        for r in timeline_events
    )

    prompt = (
        f"Generate a forensic report in JSON.\nCase: {case.title} (severity: {case.severity})\n"
        f"Evidence: {evidence_rec['event_count']} events, {evidence_rec['flow_count']} flows\n"
        f"Master hash: {evidence_rec['master_hash']}\nTimeline:\n{timeline_text}\n\n"
        f"Return JSON: incident_summary, root_cause_analysis, attack_timeline (array), "
        f"scope_of_compromise, containment_recommendations (array), remediation_steps (array), "
        f"legal_notes, confidence_level (high/medium/low)."
    )
    try:
        report_json = llm.extract_json(prompt)
        all_report_records.append({
            "case_id": case.case_id,
            "report_timestamp": datetime.utcnow(),
            "report_content": json.dumps(report_json),
            "evidence_master_hash": evidence_rec["master_hash"],
            "event_count": evidence_rec["event_count"],
            "flow_count": evidence_rec["flow_count"],
            "confidence_level": report_json.get("confidence_level", "medium"),
            "status": "complete",
        })
        mon.log_event("report_generated", {"case_id": case.case_id})
    except Exception as e:
        mon.log_error("report_generation_failed", {"case_id": case.case_id, "error": str(e)})

# COMMAND ----------

# MAGIC %md
# MAGIC ## Persist Results and Exit

# COMMAND ----------

mon.time("persist_results")

if all_evidence_records:
    evidence_df = spark.createDataFrame(all_evidence_records)
    evidence_df.write.format("delta").mode("append").saveAsTable(evidence_table)

if all_report_records:
    reports_df = spark.createDataFrame(all_report_records)
    reports_df.write.format("delta").mode("append").saveAsTable(reports_table)

mon.log_complete("forensics_agent", {
    "cases_processed": len(open_cases),
    "evidence_records": len(all_evidence_records),
    "reports_generated": len(all_report_records),
})

result = {
    "agent": "13_forensics",
    "cases_processed": len(open_cases),
    "evidence_collected": len(all_evidence_records),
    "reports_generated": len(all_report_records),
    "status": "complete" if all_report_records else "no_cases",
}

dbutils.notebook.exit(json.dumps(result))
