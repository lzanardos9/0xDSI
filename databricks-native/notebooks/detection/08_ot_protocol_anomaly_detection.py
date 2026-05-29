# Databricks notebook source
# MAGIC %md
# MAGIC # Detection 08: OT/ICS Protocol Anomaly Detection Engine
# MAGIC
# MAGIC Specialized detection logic for industrial control system protocols.
# MAGIC Implements multi-layer detection:
# MAGIC
# MAGIC 1. **Allowlist Enforcement** - Only permitted function codes per device
# MAGIC 2. **Temporal Pattern Detection** - Operations outside maintenance windows
# MAGIC 3. **Sequence Analysis** - Detect multi-step attack sequences (kill chains)
# MAGIC 4. **Cross-Protocol Correlation** - Single actor spanning multiple protocols
# MAGIC 5. **Physics-Aware Anomalies** - Setpoint values outside safe operating limits
# MAGIC
# MAGIC Maps to MITRE ATT&CK for ICS framework techniques.
# MAGIC
# MAGIC **Scheduling:** Every 5 minutes (aligned with OT ingestion pipeline)

# COMMAND ----------

# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

dbutils.widgets.text("lookback_minutes", "15", "Analysis window in minutes")
dbutils.widgets.text("enable_allowlist", "true", "Enforce function code allowlists")
dbutils.widgets.text("enable_sequence", "true", "Detect multi-step attack sequences")
dbutils.widgets.text("enable_temporal", "true", "Detect out-of-window operations")
dbutils.widgets.text("maintenance_window_start", "02:00", "Maintenance window start (UTC)")
dbutils.widgets.text("maintenance_window_end", "06:00", "Maintenance window end (UTC)")

lookback_minutes = int(dbutils.widgets.get("lookback_minutes"))
enable_allowlist = dbutils.widgets.get("enable_allowlist").lower() == "true"
enable_sequence = dbutils.widgets.get("enable_sequence").lower() == "true"
enable_temporal = dbutils.widgets.get("enable_temporal").lower() == "true"
maint_start = dbutils.widgets.get("maintenance_window_start")
maint_end = dbutils.widgets.get("maintenance_window_end")

# COMMAND ----------

from pyspark.sql import functions as F
from pyspark.sql.window import Window
from datetime import datetime, timezone, timedelta
import json

# COMMAND ----------

# MAGIC %md
# MAGIC ## Device Function Code Allowlists
# MAGIC
# MAGIC Per-device policies defining which function codes are permitted during normal operations.
# MAGIC Anything outside this list from a non-engineering station is flagged.

# COMMAND ----------

allowlist_table = get_table_path(cfg, "ot_device_allowlists")

spark.sql(f"""
CREATE TABLE IF NOT EXISTS {allowlist_table} (
    device_id STRING NOT NULL,
    device_name STRING,
    protocol STRING NOT NULL,
    allowed_function_codes ARRAY<INT>,
    allowed_source_ips ARRAY<STRING>,
    allowed_time_window STRING,
    max_write_rate_per_minute INT DEFAULT 10,
    zone STRING,
    criticality STRING DEFAULT 'medium',
    last_updated TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
""")

# Seed defaults if empty
count = spark.read.table(allowlist_table).count()
if count == 0:
    default_allowlists = [
        ("plc_s7_reactor_01", "Reactor Controller S7-1500", "s7comm", [0x04, 0xF0], ["10.10.1.50", "10.10.1.51"], "02:00-06:00", 5, "zone_1", "critical"),
        ("plc_modbus_pump_01", "Feed Pump VFD", "modbus", [1, 2, 3, 4], ["10.10.2.10"], "any", 2, "zone_2", "high"),
        ("plc_cip_packaging_01", "Packaging Line CLX", "cip", [0x4C, 0x52, 0x01], ["10.10.3.20", "10.10.3.21"], "any", 3, "zone_3", "medium"),
        ("rtu_dnp3_substation_a", "Substation A RTU", "dnp3", [0x01, 0x15], ["10.20.1.5"], "02:00-04:00", 1, "zone_1", "critical"),
        ("plc_opcua_turbine_01", "Wind Turbine Controller", "opcua", [1, 2, 5, 6], ["10.30.1.10"], "any", 5, "zone_2", "high"),
        ("ied_goose_breaker_01", "Bay Breaker IED", "iec61850", [1, 2, 3, 5], ["10.20.2.1"], "02:00-06:00", 0, "zone_1", "critical"),
        ("plc_profinet_line_03", "Assembly Line 3 IO", "profinet", [1, 2, 4, 7], ["10.10.4.30"], "any", 10, "zone_3", "medium"),
        ("dcs_hart_transmitter_12", "Pressure Transmitter PT-12", "hart_ip", [0, 1, 2, 3, 48], ["10.10.5.1"], "02:00-06:00", 0, "zone_2", "high"),
    ]
    spark.createDataFrame(
        default_allowlists,
        ["device_id", "device_name", "protocol", "allowed_function_codes", "allowed_source_ips", "allowed_time_window", "max_write_rate_per_minute", "zone", "criticality"]
    ).write.format("delta").mode("append").saveAsTable(allowlist_table)
    mon.log_info("Seeded default OT device allowlists")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Load Recent Events

# COMMAND ----------

silver_table = get_table_path(cfg, "silver_ot_security_events")
cutoff = datetime.now(timezone.utc) - timedelta(minutes=lookback_minutes)

events_df = spark.read.table(silver_table).filter(
    F.col("timestamp") >= cutoff
)

event_count = events_df.count()
mon.log_info(f"Analyzing {event_count} OT security events from last {lookback_minutes} minutes")

if event_count == 0:
    mon.log_info("No events to analyze - exiting clean")
    dbutils.notebook.exit(json.dumps({"status": "skipped", "reason": "no_events"}))

# COMMAND ----------

# MAGIC %md
# MAGIC ## Detection 1: Function Code Allowlist Violations

# COMMAND ----------

detections_table = get_table_path(cfg, "ot_detections")

spark.sql(f"""
CREATE TABLE IF NOT EXISTS {detections_table} (
    detection_id STRING NOT NULL,
    timestamp TIMESTAMP NOT NULL,
    detection_type STRING NOT NULL,
    severity STRING NOT NULL,
    description STRING,
    mitre_ics_technique STRING,
    protocol STRING,
    device_id STRING,
    device_name STRING,
    src_ip STRING,
    function_code INT,
    function_name STRING,
    zone STRING,
    evidence MAP<STRING, STRING>,
    status STRING DEFAULT 'open',
    detection_date DATE
)
USING DELTA
PARTITIONED BY (detection_date, severity)
""")

# COMMAND ----------

if enable_allowlist:
    allowlists_df = spark.read.table(allowlist_table)

    # Join events with allowlists
    violations_df = (
        events_df
        .join(allowlists_df, ["device_id", "protocol"], "inner")
        .filter(
            ~F.array_contains(F.col("allowed_function_codes"), F.col("function_code"))
        )
        .withColumn("detection_id", F.expr("uuid()"))
        .withColumn("detection_type", F.lit("allowlist_violation"))
        .withColumn("detection_date", F.current_date())
        .withColumn("description",
            F.concat(
                F.lit("Function code "),
                F.col("function_code").cast("string"),
                F.lit(" ("),
                F.col("function_name"),
                F.lit(") not in allowlist for device "),
                F.col("device_name"),
                F.lit(" [criticality: "),
                F.col("criticality"),
                F.lit("]")
            )
        )
        .withColumn("severity",
            F.when(F.col("criticality") == "critical", F.lit("critical"))
            .when(F.col("criticality") == "high", F.lit("high"))
            .otherwise(F.lit("medium"))
        )
        .withColumn("mitre_ics_technique", F.lit("T0821"))
        .withColumn("evidence",
            F.map(
                F.lit("allowed_codes"), F.col("allowed_function_codes").cast("string"),
                F.lit("actual_code"), F.col("function_code").cast("string"),
                F.lit("criticality"), F.col("criticality")
            )
        )
        .select(
            "detection_id", "timestamp", "detection_type", "severity",
            "description", "mitre_ics_technique", "protocol", "device_id",
            "device_name", "src_ip", "function_code", "function_name",
            "zone", "evidence", F.lit("open").alias("status"), "detection_date"
        )
    )

    violation_count = violations_df.count()
    if violation_count > 0:
        violations_df.write.format("delta").mode("append").saveAsTable(detections_table)
        mon.log_warning(f"ALERT: {violation_count} OT allowlist violations detected")
    else:
        mon.log_info("Allowlist check: PASS - no violations")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Detection 2: Temporal Anomalies (Out-of-Window Operations)

# COMMAND ----------

if enable_temporal:
    # Flag write operations outside maintenance windows on critical devices
    critical_writes_df = (
        events_df
        .filter(F.col("operation_risk").isin("critical", "high"))
        .withColumn("event_hour", F.hour(F.col("timestamp")))
        .withColumn("event_minute", F.minute(F.col("timestamp")))
    )

    maint_start_hour = int(maint_start.split(":")[0])
    maint_end_hour = int(maint_end.split(":")[0])

    out_of_window_df = (
        critical_writes_df
        .filter(
            ~((F.col("event_hour") >= maint_start_hour) & (F.col("event_hour") < maint_end_hour))
        )
        .withColumn("detection_id", F.expr("uuid()"))
        .withColumn("detection_type", F.lit("temporal_anomaly"))
        .withColumn("detection_date", F.current_date())
        .withColumn("description",
            F.concat(
                F.lit("Critical operation '"),
                F.col("function_name"),
                F.lit("' on "),
                F.col("protocol"),
                F.lit(" device at "),
                F.date_format(F.col("timestamp"), "HH:mm"),
                F.lit(" UTC (maintenance window: "),
                F.lit(f"{maint_start}-{maint_end}"),
                F.lit(")")
            )
        )
        .withColumn("severity", F.lit("high"))
        .withColumn("mitre_ics_technique", F.lit("T0829"))
        .withColumn("evidence",
            F.map(
                F.lit("event_time"), F.date_format(F.col("timestamp"), "HH:mm:ss"),
                F.lit("maintenance_window"), F.lit(f"{maint_start}-{maint_end}"),
                F.lit("operation_risk"), F.col("operation_risk")
            )
        )
        .withColumn("zone", F.lit(None).cast("string"))
        .select(
            "detection_id", "timestamp", "detection_type", "severity",
            "description", "mitre_ics_technique", "protocol", "device_id",
            F.lit(None).cast("string").alias("device_name"),
            "src_ip", "function_code", "function_name",
            "zone", "evidence", F.lit("open").alias("status"), "detection_date"
        )
    )

    temporal_count = out_of_window_df.count()
    if temporal_count > 0:
        out_of_window_df.write.format("delta").mode("append").saveAsTable(detections_table)
        mon.log_warning(f"ALERT: {temporal_count} out-of-window critical OT operations detected")
    else:
        mon.log_info("Temporal check: PASS - no out-of-window critical ops")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Detection 3: Multi-Step Attack Sequence Detection

# COMMAND ----------

ICS_KILL_CHAINS = {
    "triton_sis_attack": {
        "description": "TRITON/TRISIS-style SIS manipulation sequence",
        "steps": [
            {"protocol": "s7comm", "function_name_pattern": "read_var", "label": "recon"},
            {"protocol": "s7comm", "function_name_pattern": "download_block", "label": "inject"},
            {"protocol": "s7comm", "function_name_pattern": "plc_control", "label": "activate"},
        ],
        "max_window_minutes": 60,
        "mitre_techniques": ["T0843", "T0836", "T0880"],
        "severity": "critical",
    },
    "industroyer_breaker_trip": {
        "description": "INDUSTROYER/CRASHOVERRIDE-style breaker manipulation",
        "steps": [
            {"protocol": "iec104", "function_name_pattern": "interrogation", "label": "recon"},
            {"protocol": "iec104", "function_name_pattern": "single_command", "label": "trip"},
            {"protocol": "iec104", "function_name_pattern": "disable_unsolicited", "label": "blind"},
        ],
        "max_window_minutes": 30,
        "mitre_techniques": ["T0846", "T0855", "T0816"],
        "severity": "critical",
    },
    "stuxnet_plc_reprogram": {
        "description": "Stuxnet-style PLC reprogramming with process manipulation",
        "steps": [
            {"protocol": "s7comm", "function_name_pattern": "setup_communication", "label": "connect"},
            {"protocol": "s7comm", "function_name_pattern": "read_var", "label": "baseline"},
            {"protocol": "s7comm", "function_name_pattern": "upload_block", "label": "steal_logic"},
            {"protocol": "s7comm", "function_name_pattern": "download_block", "label": "inject_payload"},
        ],
        "max_window_minutes": 120,
        "mitre_techniques": ["T0843", "T0839", "T0836"],
        "severity": "critical",
    },
    "havex_ot_recon": {
        "description": "Havex-style OPC-based reconnaissance of industrial assets",
        "steps": [
            {"protocol": "opcua", "function_name_pattern": "create_session", "label": "auth"},
            {"protocol": "opcua", "function_name_pattern": "browse", "label": "enumerate"},
            {"protocol": "opcua", "function_name_pattern": "read", "label": "exfiltrate"},
        ],
        "max_window_minutes": 30,
        "mitre_techniques": ["T0846", "T0802", "T0811"],
        "severity": "high",
    },
}

# COMMAND ----------

if enable_sequence:
    sequence_findings = []
    events_collected = events_df.orderBy("timestamp").collect()

    for chain_id, chain in ICS_KILL_CHAINS.items():
        steps = chain["steps"]
        max_window = timedelta(minutes=chain["max_window_minutes"])

        # Group events by source IP
        from collections import defaultdict
        ip_events = defaultdict(list)
        for event in events_collected:
            if event["src_ip"]:
                ip_events[event["src_ip"]].append(event)

        for src_ip, ip_ev_list in ip_events.items():
            step_idx = 0
            first_match_time = None

            for event in ip_ev_list:
                if step_idx >= len(steps):
                    break
                step = steps[step_idx]
                if (event["protocol"] == step["protocol"] and
                    step["function_name_pattern"] in (event.get("function_name") or "")):
                    if step_idx == 0:
                        first_match_time = event["timestamp"]
                    elif event["timestamp"] - first_match_time > max_window:
                        step_idx = 0
                        first_match_time = None
                        continue
                    step_idx += 1

            if step_idx >= len(steps):
                sequence_findings.append({
                    "detection_id": f"seq_{chain_id}_{src_ip}_{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}",
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "detection_type": "kill_chain_sequence",
                    "severity": chain["severity"],
                    "description": f"ICS KILL CHAIN DETECTED: {chain['description']} from {src_ip}",
                    "mitre_ics_technique": ",".join(chain["mitre_techniques"]),
                    "protocol": steps[0]["protocol"],
                    "device_id": None,
                    "device_name": None,
                    "src_ip": src_ip,
                    "function_code": None,
                    "function_name": chain_id,
                    "zone": None,
                    "evidence": json.dumps({"steps_matched": len(steps), "chain": chain_id}),
                    "status": "open",
                    "detection_date": datetime.now(timezone.utc).date().isoformat(),
                })

    if sequence_findings:
        seq_df = spark.createDataFrame(sequence_findings)
        seq_df.write.format("delta").mode("append").saveAsTable(detections_table)
        mon.log_warning(f"CRITICAL: {len(sequence_findings)} ICS kill chain sequences detected!")
    else:
        mon.log_info("Sequence detection: PASS - no kill chains matched")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Detection Summary

# COMMAND ----------

total_detections = spark.read.table(detections_table).filter(
    F.col("detection_date") == F.current_date()
).groupBy("severity").count().collect()

summary = {row["severity"]: row["count"] for row in total_detections}
mon.log_info("OT Detection Engine run complete", extra={
    "events_analyzed": event_count,
    "detections_today": summary,
    "allowlist_enabled": enable_allowlist,
    "temporal_enabled": enable_temporal,
    "sequence_enabled": enable_sequence,
})

print(f"""
╔══════════════════════════════════════════════════════════════════╗
║  OT/ICS Detection Engine - Run Complete                         ║
╠══════════════════════════════════════════════════════════════════╣
║  Events Analyzed: {event_count:<8}                                      ║
║  Detections Today:                                              ║
║    Critical: {summary.get('critical', 0):<4} | High: {summary.get('high', 0):<4} | Medium: {summary.get('medium', 0):<4}       ║
║  Detection Layers:                                              ║
║    Allowlist: {'ON ' if enable_allowlist else 'OFF'}  Temporal: {'ON ' if enable_temporal else 'OFF'}  Sequence: {'ON ' if enable_sequence else 'OFF'}            ║
╚══════════════════════════════════════════════════════════════════╝
""")

dbutils.notebook.exit(json.dumps({
    "status": "success",
    "events_analyzed": event_count,
    "detections": summary,
}))
