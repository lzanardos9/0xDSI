# Databricks notebook source
# MAGIC %md
# MAGIC # Agent 44 - OT Protocol Security Monitor
# MAGIC Mosaic AI Agent Framework BatchAgent.
# MAGIC Monitors PLC/OT protocol traffic for security anomalies,
# MAGIC unauthorized operations, and potential ICS-targeted attacks.
# MAGIC Uses behavioral baselines + LLM reasoning to classify threats.

# COMMAND ----------

# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

require_enabled("ot_protocol_monitor")

# COMMAND ----------

import json
from datetime import datetime, timezone, timedelta
from pyspark.sql import functions as F
from pyspark.sql.window import Window

from agent_framework import BatchAgent, AgentResult, AgentStatus

# COMMAND ----------

# MAGIC %md
# MAGIC ## OT Attack Pattern Definitions

# COMMAND ----------

OT_ATTACK_PATTERNS = {
    "plc_program_injection": {
        "description": "Unauthorized PLC logic download or program modification (Stuxnet-style)",
        "mitre_ics": "T0843",
        "protocols": ["s7comm", "cip", "codesys_v3", "ge_srtp", "melsec"],
        "indicators": ["download_block", "upload_block", "write_program_block", "download_application", "online_change"],
        "severity": "critical",
    },
    "plc_stop_attack": {
        "description": "Unauthorized CPU halt / mode change causing process disruption",
        "mitre_ics": "T0816",
        "protocols": ["s7comm", "fins", "melsec", "codesys_v3", "ge_srtp"],
        "indicators": ["plc_stop", "stop_mode", "remote_stop", "stop_application", "stop_cpu"],
        "severity": "critical",
    },
    "setpoint_manipulation": {
        "description": "Manipulation of process control setpoints outside safe ranges",
        "mitre_ics": "T0836",
        "protocols": ["modbus", "dnp3", "iec104", "opcua", "hart_ip"],
        "indicators": ["write_single_register", "write_multiple_registers", "setpoint_normalized", "setpoint_scaled", "write_range_values"],
        "severity": "critical",
    },
    "unauthorized_write_burst": {
        "description": "Abnormal burst of write operations indicating automated attack or wiper",
        "mitre_ics": "T0882",
        "protocols": ["*"],
        "indicators": ["write_ratio_anomaly"],
        "severity": "high",
    },
    "reconnaissance_scanning": {
        "description": "Systematic enumeration of OT assets, tags, and registers",
        "mitre_ics": "T0846",
        "protocols": ["s7comm", "cip", "opcua", "modbus", "profinet"],
        "indicators": ["read_var_burst", "browse", "read_tag_fragmented", "who_is", "identification"],
        "severity": "medium",
    },
    "firmware_manipulation": {
        "description": "Firmware upload/modification attempt on PLC or field device",
        "mitre_ics": "T0839",
        "protocols": ["s7comm", "cip", "codesys_v3", "ethercat"],
        "indicators": ["upload_block", "download_block", "foe_file_access", "create_boot_project"],
        "severity": "critical",
    },
    "safety_system_interference": {
        "description": "Operations targeting safety instrumented systems (SIS)",
        "mitre_ics": "T0880",
        "protocols": ["iec61850", "profinet", "dnp3"],
        "indicators": ["goose_publish", "setting_group_confirm", "direct_operate", "alarm_notification"],
        "severity": "critical",
    },
    "broadcast_flood": {
        "description": "Broadcast/multicast flood potentially causing network disruption",
        "mitre_ics": "T0814",
        "protocols": ["*"],
        "indicators": ["is_broadcast_true"],
        "severity": "high",
    },
    "clock_desync_attack": {
        "description": "Time synchronization manipulation affecting event sequencing and safety timers",
        "mitre_ics": "T0820",
        "protocols": ["dnp3", "iec104", "fins", "ge_srtp"],
        "indicators": ["record_current_time", "clock_sync", "clock_write", "set_datetime"],
        "severity": "high",
    },
    "rogue_engineering_station": {
        "description": "Communications from previously unseen IP performing engineering operations",
        "mitre_ics": "T0848",
        "protocols": ["*"],
        "indicators": ["new_src_ip_critical_op"],
        "severity": "high",
    },
}

# COMMAND ----------

# MAGIC %md
# MAGIC ## Agent Implementation

# COMMAND ----------

class OTProtocolSecurityAgent(BatchAgent):
    """
    Batch agent that detects security anomalies in OT/ICS protocol traffic.
    - Reads from silver_ot_security_events and ot_behavioral_baseline
    - Detects known attack patterns (MITRE ICS ATT&CK mapped)
    - Identifies behavioral anomalies vs. established baselines
    - Uses LLM to contextualize and classify detections
    - Writes findings to ot_security_findings table
    """

    def execute(self) -> AgentResult:
        """Execute OT security analysis."""
        try:
            silver_table = get_table_path(cfg, "silver_ot_security_events")
            baseline_table = get_table_path(cfg, "ot_behavioral_baseline")
            findings_table = get_table_path(cfg, "ot_security_findings")
            audit_table = get_table_path(cfg, "ot_command_audit_log")

            self._ensure_findings_table(findings_table)

            lookback_minutes = self.config.get("lookback_minutes", 15)
            cutoff = datetime.now(timezone.utc) - timedelta(minutes=lookback_minutes)

            # Get recent security events
            events_df = spark.read.table(silver_table).filter(
                F.col("timestamp") >= cutoff
            )
            events = events_df.collect()

            if len(events) == 0:
                return AgentResult(
                    status=AgentStatus.SKIPPED,
                    agent_name=self.agent_name,
                    details={"reason": "no_recent_ot_events", "lookback_minutes": lookback_minutes}
                )

            findings = []

            # Detection 1: Pattern-based detection
            pattern_findings = self._detect_attack_patterns(events)
            findings.extend(pattern_findings)

            # Detection 2: Behavioral baseline anomalies
            baseline_findings = self._detect_baseline_anomalies(events, baseline_table)
            findings.extend(baseline_findings)

            # Detection 3: Rogue engineering station detection
            rogue_findings = self._detect_rogue_stations(events)
            findings.extend(rogue_findings)

            # Detection 4: Protocol-level anomalies
            protocol_findings = self._detect_protocol_anomalies(events)
            findings.extend(protocol_findings)

            if len(findings) == 0:
                return AgentResult(
                    status=AgentStatus.SUCCESS,
                    agent_name=self.agent_name,
                    details={
                        "events_analyzed": len(events),
                        "findings": 0,
                        "status": "all_clear"
                    }
                )

            # Use LLM to contextualize critical findings
            critical_findings = [f for f in findings if f["severity"] == "critical"]
            if critical_findings and self.llm:
                enriched = self._enrich_with_llm(critical_findings[:5], events)
                for i, ef in enumerate(enriched):
                    if i < len(critical_findings):
                        critical_findings[i]["llm_analysis"] = ef

            # Write findings
            self._write_findings(findings, findings_table)

            return AgentResult(
                status=AgentStatus.SUCCESS,
                agent_name=self.agent_name,
                details={
                    "events_analyzed": len(events),
                    "findings_total": len(findings),
                    "critical": len([f for f in findings if f["severity"] == "critical"]),
                    "high": len([f for f in findings if f["severity"] == "high"]),
                    "medium": len([f for f in findings if f["severity"] == "medium"]),
                    "protocols_seen": list(set(e["protocol"] for e in events)),
                }
            )

        except Exception as e:
            mon.log_error(f"OT Protocol Security Agent error: {e}")
            return AgentResult(
                status=AgentStatus.ERROR,
                agent_name=self.agent_name,
                details={"error": str(e)}
            )

    def _detect_attack_patterns(self, events) -> list:
        """Match events against known OT attack patterns."""
        findings = []
        for pattern_id, pattern in OT_ATTACK_PATTERNS.items():
            matching_events = []
            for event in events:
                proto = event["protocol"]
                fn_name = event.get("function_name", "")
                if pattern["protocols"] != ["*"] and proto not in pattern["protocols"]:
                    continue
                if any(ind in fn_name for ind in pattern["indicators"] if ind != "write_ratio_anomaly" and ind != "is_broadcast_true" and ind != "new_src_ip_critical_op" and ind != "read_var_burst"):
                    matching_events.append(event)

            if matching_events:
                findings.append({
                    "finding_id": f"{pattern_id}_{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}",
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "pattern_id": pattern_id,
                    "description": pattern["description"],
                    "mitre_ics_technique": pattern["mitre_ics"],
                    "severity": pattern["severity"],
                    "evidence_count": len(matching_events),
                    "protocols_involved": list(set(e["protocol"] for e in matching_events)),
                    "source_ips": list(set(e.get("src_ip", "") for e in matching_events if e.get("src_ip"))),
                    "target_devices": list(set(e.get("device_name", "") for e in matching_events if e.get("device_name"))),
                    "sites_affected": list(set(e.get("site_name", "") for e in matching_events if e.get("site_name"))),
                    "detection_method": "pattern_match",
                    "llm_analysis": None,
                })

        return findings

    def _detect_baseline_anomalies(self, events, baseline_table: str) -> list:
        """Detect deviations from behavioral baselines."""
        findings = []
        try:
            # Get recent baseline stats (last 24h average)
            baseline_df = spark.read.table(baseline_table).filter(
                F.col("baseline_date") >= (datetime.now(timezone.utc) - timedelta(hours=24)).date()
            )
            if baseline_df.count() == 0:
                return findings

            baselines = baseline_df.groupBy("protocol", "device_id").agg(
                F.avg("write_ratio").alias("avg_write_ratio"),
                F.avg("critical_ratio").alias("avg_critical_ratio"),
                F.avg("total_operations").alias("avg_operations"),
                F.stddev("write_ratio").alias("stddev_write_ratio"),
            ).collect()

            baseline_map = {}
            for b in baselines:
                key = f"{b['protocol']}:{b['device_id']}"
                baseline_map[key] = b

            # Check current window against baseline
            from collections import defaultdict
            current_stats = defaultdict(lambda: {"writes": 0, "total": 0, "critical": 0})
            for event in events:
                key = f"{event['protocol']}:{event.get('device_id', 'unknown')}"
                current_stats[key]["total"] += 1
                if event.get("operation_risk") == "critical":
                    current_stats[key]["critical"] += 1
                if "write" in (event.get("function_name", "") or "").lower():
                    current_stats[key]["writes"] += 1

            for key, stats in current_stats.items():
                if key not in baseline_map:
                    continue
                baseline = baseline_map[key]
                if stats["total"] == 0:
                    continue

                current_write_ratio = stats["writes"] / stats["total"]
                avg_wr = baseline["avg_write_ratio"] or 0
                stddev_wr = baseline["stddev_write_ratio"] or 0.1

                # Flag if write ratio exceeds 3 sigma
                if stddev_wr > 0 and current_write_ratio > avg_wr + (3 * stddev_wr):
                    proto, device = key.split(":", 1)
                    findings.append({
                        "finding_id": f"write_anomaly_{proto}_{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}",
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                        "pattern_id": "unauthorized_write_burst",
                        "description": f"Write ratio anomaly on {proto} device {device}: {current_write_ratio:.2%} vs baseline {avg_wr:.2%} (+{((current_write_ratio - avg_wr) / stddev_wr):.1f} sigma)",
                        "mitre_ics_technique": "T0882",
                        "severity": "high",
                        "evidence_count": stats["writes"],
                        "protocols_involved": [proto],
                        "source_ips": [],
                        "target_devices": [device],
                        "sites_affected": [],
                        "detection_method": "behavioral_baseline",
                        "llm_analysis": None,
                    })
        except Exception as e:
            mon.log_warning(f"Baseline anomaly detection failed: {e}")

        return findings

    def _detect_rogue_stations(self, events) -> list:
        """Detect previously unseen IPs performing critical operations."""
        findings = []
        try:
            # Get known engineering station IPs (last 7 days of critical ops)
            silver_table = get_table_path(cfg, "silver_ot_security_events")
            known_ips_df = spark.read.table(silver_table).filter(
                (F.col("operation_risk") == "critical") &
                (F.col("timestamp") >= (datetime.now(timezone.utc) - timedelta(days=7)))
            ).select("src_ip").distinct()
            known_ips = set(row["src_ip"] for row in known_ips_df.collect() if row["src_ip"])

            # Check current critical events for new IPs
            for event in events:
                if event.get("operation_risk") != "critical":
                    continue
                src_ip = event.get("src_ip")
                if src_ip and src_ip not in known_ips:
                    findings.append({
                        "finding_id": f"rogue_station_{src_ip}_{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}",
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                        "pattern_id": "rogue_engineering_station",
                        "description": f"Previously unseen IP {src_ip} performing critical operation '{event.get('function_name', 'unknown')}' on protocol {event['protocol']}",
                        "mitre_ics_technique": "T0848",
                        "severity": "high",
                        "evidence_count": 1,
                        "protocols_involved": [event["protocol"]],
                        "source_ips": [src_ip],
                        "target_devices": [event.get("device_name", "unknown")],
                        "sites_affected": [event.get("site_name", "")] if event.get("site_name") else [],
                        "detection_method": "new_entity_detection",
                        "llm_analysis": None,
                    })
                    known_ips.add(src_ip)  # Don't alert multiple times per run
        except Exception as e:
            mon.log_warning(f"Rogue station detection failed: {e}")

        return findings

    def _detect_protocol_anomalies(self, events) -> list:
        """Detect protocol-level anomalies (invalid function codes, error bursts)."""
        findings = []
        error_events = [e for e in events if e.get("error_flag")]

        if len(error_events) > 10:
            protocols_with_errors = list(set(e["protocol"] for e in error_events))
            findings.append({
                "finding_id": f"error_burst_{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}",
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "pattern_id": "protocol_error_burst",
                "description": f"Burst of {len(error_events)} protocol errors across {protocols_with_errors} - possible fuzzing or malformed packet injection",
                "mitre_ics_technique": "T0830",
                "severity": "medium",
                "evidence_count": len(error_events),
                "protocols_involved": protocols_with_errors,
                "source_ips": list(set(e.get("src_ip", "") for e in error_events if e.get("src_ip")))[:10],
                "target_devices": list(set(e.get("device_name", "") for e in error_events if e.get("device_name")))[:10],
                "sites_affected": list(set(e.get("site_name", "") for e in error_events if e.get("site_name")))[:5],
                "detection_method": "statistical",
                "llm_analysis": None,
            })

        return findings

    def _enrich_with_llm(self, findings: list, events: list) -> list:
        """Use LLM to provide attack context and response recommendations."""
        enrichments = []
        for finding in findings:
            prompt = f"""You are an ICS/OT security analyst. Analyze this finding:

Pattern: {finding['pattern_id']}
Description: {finding['description']}
MITRE ICS Technique: {finding['mitre_ics_technique']}
Protocols: {finding['protocols_involved']}
Source IPs: {finding['source_ips']}
Target Devices: {finding['target_devices']}
Evidence Count: {finding['evidence_count']}

Provide:
1. Attack impact assessment (what could go wrong in the physical process)
2. Confidence level (high/medium/low) that this is a real attack vs. legitimate maintenance
3. Recommended immediate response actions
4. Relevant ICS-CERT advisories or known campaigns with similar TTPs

Keep response under 200 words. Be specific to industrial environments."""

            try:
                response = self.llm.invoke(prompt)
                enrichments.append(response)
            except Exception as e:
                enrichments.append(f"LLM analysis unavailable: {e}")

        return enrichments

    def _ensure_findings_table(self, table_path: str):
        """Create findings table if not exists."""
        spark.sql(f"""
        CREATE TABLE IF NOT EXISTS {table_path} (
            finding_id STRING NOT NULL,
            timestamp TIMESTAMP NOT NULL,
            pattern_id STRING NOT NULL,
            description STRING,
            mitre_ics_technique STRING,
            severity STRING,
            evidence_count INT,
            protocols_involved ARRAY<STRING>,
            source_ips ARRAY<STRING>,
            target_devices ARRAY<STRING>,
            sites_affected ARRAY<STRING>,
            detection_method STRING,
            llm_analysis STRING,
            status STRING DEFAULT 'open',
            assigned_to STRING,
            resolved_at TIMESTAMP,
            finding_date DATE
        )
        USING DELTA
        PARTITIONED BY (finding_date, severity)
        """)

    def _write_findings(self, findings: list, table_path: str):
        """Write findings to Delta table."""
        if not findings:
            return
        rows = []
        for f in findings:
            rows.append({
                "finding_id": f["finding_id"],
                "timestamp": f["timestamp"],
                "pattern_id": f["pattern_id"],
                "description": f["description"],
                "mitre_ics_technique": f.get("mitre_ics_technique", ""),
                "severity": f["severity"],
                "evidence_count": f["evidence_count"],
                "protocols_involved": f["protocols_involved"],
                "source_ips": f["source_ips"],
                "target_devices": f["target_devices"],
                "sites_affected": f["sites_affected"],
                "detection_method": f["detection_method"],
                "llm_analysis": f.get("llm_analysis"),
                "status": "open",
                "assigned_to": None,
                "resolved_at": None,
                "finding_date": datetime.now(timezone.utc).date().isoformat(),
            })

        findings_df = spark.createDataFrame(rows)
        findings_df.write.format("delta").mode("append").saveAsTable(table_path)
        mon.log_info(f"Wrote {len(rows)} OT security findings to {table_path}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Execute Agent

# COMMAND ----------

agent = OTProtocolSecurityAgent(
    agent_name="ot_protocol_security_monitor",
    config={
        "lookback_minutes": 15,
        "schedule": "every_5_minutes",
    }
)

result = agent.run()
mon.log_info(f"Agent result: {result.status.value}", extra=result.details)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Summary Output

# COMMAND ----------

if result.status == AgentStatus.SUCCESS:
    details = result.details
    print(f"""
╔══════════════════════════════════════════════════════════════════╗
║  OT Protocol Security Monitor - Complete                        ║
╠══════════════════════════════════════════════════════════════════╣
║  Events Analyzed: {details.get('events_analyzed', 0):<6}                                    ║
║  Findings:                                                      ║
║    Critical: {details.get('critical', 0):<4}  High: {details.get('high', 0):<4}  Medium: {details.get('medium', 0):<4}           ║
║  Protocols: {', '.join(details.get('protocols_seen', [])[:5]):<50}║
╚══════════════════════════════════════════════════════════════════╝
    """)
elif result.status == AgentStatus.SKIPPED:
    print("Agent skipped: No recent OT events to analyze.")
else:
    print(f"Agent error: {result.details}")

# COMMAND ----------

import json
dbutils.notebook.exit(json.dumps({
    "status": result.status.value,
    "processed": result.details.get("events_analyzed", 0),
    "findings": result.details.get("critical", 0) + result.details.get("high", 0),
}))
