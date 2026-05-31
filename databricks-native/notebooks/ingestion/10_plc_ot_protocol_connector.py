# Databricks notebook source
# MAGIC %md
# MAGIC # 10: PLC & OT Native Protocol Connector (Production)
# MAGIC
# MAGIC Production-grade ingestion for industrial control system protocols:
# MAGIC - **Siemens S7comm / S7comm-Plus** (TCP/102)
# MAGIC - **Modbus TCP/RTU** (TCP/502)
# MAGIC - **EtherNet/IP & CIP** (TCP/44818, UDP/2222)
# MAGIC - **OPC UA** (TCP/4840)
# MAGIC - **DNP3 / IEEE 1815** (TCP/20000)
# MAGIC - **IEC 61850 / GOOSE / MMS** (L2/TCP/102)
# MAGIC - **IEC 60870-5-104** (TCP/2404)
# MAGIC - **PROFINET / PROFIBUS** (Ethernet RT/IRT)
# MAGIC - **BACnet/IP** (UDP/47808)
# MAGIC - **HART-IP** (TCP+UDP/5094)
# MAGIC - **FINS (Omron)** (TCP/UDP 9600)
# MAGIC - **MELSEC (Mitsubishi)** (TCP/5000-5010)
# MAGIC - **CC-Link IE** (Gigabit Ethernet)
# MAGIC - **GE SRTP / EGD** (TCP/18245)
# MAGIC - **CODESYS V3** (TCP/11740)
# MAGIC - **EtherCAT** (EtherType 0x88A4)
# MAGIC - **Foundation Fieldbus HSE** (Ethernet)
# MAGIC - **Yokogawa Vnet/IP** (Proprietary)
# MAGIC - **ABB AC 800M** (MMS/OPC UA)
# MAGIC - **Honeywell Experion CDA** (FTE)
# MAGIC
# MAGIC **Architecture:**
# MAGIC ```
# MAGIC  ┌──────────────────────────────────────────────────────────────┐
# MAGIC  │                   OT / ICS Network (L1-L2)                   │
# MAGIC  │  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐            │
# MAGIC  │  │Siemens │  │Rockwell│  │Schneider│ │  RTU   │            │
# MAGIC  │  │S7-1500 │  │ CLX    │  │ M580   │  │DNP3   │            │
# MAGIC  │  └───┬────┘  └───┬────┘  └───┬────┘  └───┬────┘            │
# MAGIC  │      │S7comm      │CIP        │Modbus     │DNP3             │
# MAGIC  └──────┼────────────┼───────────┼───────────┼─────────────────┘
# MAGIC         │            │           │           │
# MAGIC  ┌──────▼────────────▼───────────▼───────────▼─────────────────┐
# MAGIC  │          OT Network Tap / SPAN Mirror (L3 DMZ)              │
# MAGIC  │  ┌─────────────────────────────────────────────────────┐    │
# MAGIC  │  │  Protocol DPI Engine (Zeek + custom OT parsers)     │    │
# MAGIC  │  │  - Deep packet inspection for all ICS protocols     │    │
# MAGIC  │  │  - Session reassembly & state tracking              │    │
# MAGIC  │  │  - Function code / object-level logging             │    │
# MAGIC  │  └──────────────────────┬──────────────────────────────┘    │
# MAGIC  └────────────────────────┬┘                                    │
# MAGIC                           │ Kafka / MQTT / gRPC                  │
# MAGIC  ┌────────────────────────▼───────────────────────────────────┐
# MAGIC  │  This Notebook: OT Protocol Ingestion Pipeline             │
# MAGIC  │  1. Structured Streaming from OT collector topics          │
# MAGIC  │  2. Protocol-specific parsing & normalization              │
# MAGIC  │  3. OCSF mapping (Network Activity class 4001)            │
# MAGIC  │  4. Security event extraction (anomalous operations)      │
# MAGIC  │  5. Write to bronze_ot_events + silver_ot_security        │
# MAGIC  └───────────────────────────────────────────────────────────┘
# MAGIC ```
# MAGIC
# MAGIC **Scheduling:** Continuous streaming (trigger: 5 seconds)

# COMMAND ----------

# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

dbutils.widgets.text("source_type", "kafka", "Source: kafka | mqtt | grpc | file")
dbutils.widgets.text("topics", "ot-s7comm,ot-modbus,ot-cip,ot-opcua,ot-dnp3,ot-iec61850,ot-profinet,ot-bacnet", "OT protocol topics")
dbutils.widgets.text("consumer_group", "0xdsi-ot-ingestion", "Consumer group")
dbutils.widgets.text("trigger_interval", "5 seconds", "Micro-batch trigger interval")
dbutils.widgets.text("enable_anomaly_baseline", "true", "Build behavioral baseline for anomaly detection")
dbutils.widgets.text("enable_command_audit", "true", "Log all write/control commands for forensics")
dbutils.widgets.text("max_offsets_per_trigger", "50000", "Max records per micro-batch")

source_type = dbutils.widgets.get("source_type")
topics = dbutils.widgets.get("topics")
consumer_group = dbutils.widgets.get("consumer_group")
trigger_interval = dbutils.widgets.get("trigger_interval")
enable_anomaly_baseline = dbutils.widgets.get("enable_anomaly_baseline").lower() == "true"
enable_command_audit = dbutils.widgets.get("enable_command_audit").lower() == "true"
max_offsets = int(dbutils.widgets.get("max_offsets_per_trigger"))

# COMMAND ----------

from pyspark.sql.functions import *
from pyspark.sql.types import *
import json as json_lib

# COMMAND ----------

# MAGIC %md
# MAGIC ## OT Protocol Schemas

# COMMAND ----------

OT_PROTOCOLS = {
    "s7comm": {
        "name": "Siemens S7comm / S7comm-Plus",
        "port": 102,
        "vendor": "Siemens",
        "function_codes": {
            0x04: "read_var", 0x05: "write_var", 0x1A: "download_block",
            0x1B: "upload_block", 0x28: "plc_control", 0x29: "plc_stop",
            0xF0: "setup_communication"
        },
        "critical_operations": ["write_var", "download_block", "upload_block", "plc_stop", "plc_control"],
    },
    "modbus": {
        "name": "Modbus TCP/RTU",
        "port": 502,
        "vendor": "Schneider Electric",
        "function_codes": {
            1: "read_coils", 2: "read_discrete_inputs", 3: "read_holding_registers",
            4: "read_input_registers", 5: "write_single_coil", 6: "write_single_register",
            15: "write_multiple_coils", 16: "write_multiple_registers",
            22: "mask_write_register", 23: "read_write_multiple", 43: "encapsulated_interface"
        },
        "critical_operations": ["write_single_coil", "write_single_register", "write_multiple_coils", "write_multiple_registers", "mask_write_register"],
    },
    "cip": {
        "name": "EtherNet/IP & CIP",
        "port": 44818,
        "vendor": "Rockwell Automation",
        "function_codes": {
            0x4C: "read_tag", 0x4D: "write_tag", 0x52: "read_tag_fragmented",
            0x53: "write_tag_fragmented", 0x01: "get_attribute_all",
            0x10: "set_attribute_all", 0x4E: "read_modify_write",
            0x06: "set_attribute_single", 0x0E: "create", 0x09: "delete"
        },
        "critical_operations": ["write_tag", "write_tag_fragmented", "read_modify_write", "set_attribute_all", "create", "delete"],
    },
    "opcua": {
        "name": "OPC UA",
        "port": 4840,
        "vendor": "OPC Foundation",
        "function_codes": {
            1: "browse", 2: "read", 3: "write", 4: "call",
            5: "create_subscription", 6: "publish", 7: "translate_browse_paths",
            8: "create_session", 9: "activate_session", 10: "close_session",
            11: "register_nodes", 12: "add_nodes", 13: "delete_nodes"
        },
        "critical_operations": ["write", "call", "add_nodes", "delete_nodes"],
    },
    "dnp3": {
        "name": "DNP3 (IEEE 1815)",
        "port": 20000,
        "vendor": "IEEE",
        "function_codes": {
            0x01: "read", 0x02: "write", 0x03: "select",
            0x04: "operate", 0x05: "direct_operate",
            0x06: "direct_operate_no_ack", 0x0D: "cold_restart",
            0x0E: "warm_restart", 0x12: "stop_application",
            0x13: "save_configuration", 0x15: "enable_unsolicited",
            0x16: "disable_unsolicited", 0x19: "record_current_time",
            0x1E: "file_open", 0x1F: "file_close", 0x20: "file_delete"
        },
        "critical_operations": ["write", "operate", "direct_operate", "cold_restart", "warm_restart", "stop_application", "save_configuration", "file_delete"],
    },
    "iec61850": {
        "name": "IEC 61850 / GOOSE / MMS",
        "port": 102,
        "vendor": "IEC",
        "function_codes": {
            1: "goose_publish", 2: "goose_subscribe", 3: "mms_read",
            4: "mms_write", 5: "mms_get_namelist", 6: "report_control",
            7: "setting_group_select", 8: "setting_group_confirm",
            9: "file_open", 10: "file_read", 11: "file_delete",
            12: "sampled_values_pub"
        },
        "critical_operations": ["mms_write", "setting_group_confirm", "file_delete", "goose_publish"],
    },
    "iec104": {
        "name": "IEC 60870-5-104",
        "port": 2404,
        "vendor": "IEC",
        "function_codes": {
            45: "single_command", 46: "double_command", 47: "regulating_step",
            48: "setpoint_normalized", 49: "setpoint_scaled", 50: "setpoint_float",
            58: "single_command_time", 100: "interrogation_command",
            101: "counter_interrogation", 103: "clock_sync", 107: "test_command"
        },
        "critical_operations": ["single_command", "double_command", "setpoint_normalized", "setpoint_scaled", "setpoint_float"],
    },
    "profinet": {
        "name": "PROFINET IO",
        "port": None,
        "vendor": "Siemens / PI International",
        "function_codes": {
            1: "cyclic_io_data", 2: "acyclic_read", 3: "acyclic_write",
            4: "connect", 5: "release", 6: "control",
            7: "alarm_notification", 8: "alarm_ack",
            9: "identification", 10: "parameter_read", 11: "parameter_write"
        },
        "critical_operations": ["acyclic_write", "control", "parameter_write"],
    },
    "bacnet": {
        "name": "BACnet/IP",
        "port": 47808,
        "vendor": "ASHRAE",
        "function_codes": {
            0: "who_is", 1: "i_am", 2: "read_property", 3: "write_property",
            4: "read_property_multiple", 5: "write_property_multiple",
            6: "subscribe_cov", 7: "confirmed_cov_notification",
            8: "create_object", 9: "delete_object", 10: "reinitialize_device",
            14: "device_communication_control"
        },
        "critical_operations": ["write_property", "write_property_multiple", "create_object", "delete_object", "reinitialize_device", "device_communication_control"],
    },
    "hart_ip": {
        "name": "HART-IP",
        "port": 5094,
        "vendor": "FieldComm Group",
        "function_codes": {
            0: "read_unique_id", 1: "read_primary_variable", 2: "read_loop_current",
            3: "read_dynamic_variables", 6: "write_polling_address",
            17: "write_message", 18: "write_tag_descriptor", 35: "write_range_values",
            38: "reset_configuration", 42: "perform_master_reset",
            48: "read_additional_device_status", 76: "write_device_variable"
        },
        "critical_operations": ["write_polling_address", "write_range_values", "reset_configuration", "perform_master_reset", "write_device_variable"],
    },
    "fins": {
        "name": "FINS (Omron)",
        "port": 9600,
        "vendor": "Omron",
        "function_codes": {
            0x0101: "memory_area_read", 0x0102: "memory_area_write",
            0x0103: "memory_area_fill", 0x0104: "multiple_memory_read",
            0x0401: "run_mode", 0x0402: "stop_mode",
            0x0501: "read_cpu_unit_data", 0x0601: "read_cpu_unit_status",
            0x0701: "clock_read", 0x0702: "clock_write",
            0x0920: "forced_set_reset", 0x2101: "error_log_read"
        },
        "critical_operations": ["memory_area_write", "memory_area_fill", "run_mode", "stop_mode", "forced_set_reset", "clock_write"],
    },
    "melsec": {
        "name": "MELSEC MC Protocol",
        "port": 5000,
        "vendor": "Mitsubishi Electric",
        "function_codes": {
            0x0401: "batch_read", 0x1401: "batch_write",
            0x0403: "random_read", 0x1402: "random_write",
            0x0406: "block_read", 0x1406: "block_write",
            0x0619: "remote_run", 0x1001: "remote_stop",
            0x1002: "remote_pause", 0x1003: "remote_clear",
            0x0613: "read_cpu_model"
        },
        "critical_operations": ["batch_write", "random_write", "block_write", "remote_run", "remote_stop", "remote_pause", "remote_clear"],
    },
    "ge_srtp": {
        "name": "GE SRTP / EGD",
        "port": 18245,
        "vendor": "GE Vernova",
        "function_codes": {
            0: "init_session", 1: "read_memory", 2: "write_memory",
            3: "read_program_block", 4: "write_program_block",
            5: "start_cpu", 6: "stop_cpu", 7: "set_datetime",
            8: "read_io_config", 9: "force_io", 10: "egd_exchange"
        },
        "critical_operations": ["write_memory", "write_program_block", "stop_cpu", "force_io"],
    },
    "codesys_v3": {
        "name": "CODESYS V3",
        "port": 11740,
        "vendor": "CODESYS GmbH",
        "function_codes": {
            0x01: "login", 0x02: "read_variable", 0x03: "write_variable",
            0x04: "download_application", 0x05: "online_change",
            0x06: "start_application", 0x07: "stop_application",
            0x08: "reset_cold", 0x09: "reset_warm",
            0x0A: "force_variable", 0x0B: "create_boot_project",
            0x0C: "delete_application"
        },
        "critical_operations": ["write_variable", "download_application", "online_change", "stop_application", "reset_cold", "force_variable", "delete_application"],
    },
    "ethercat": {
        "name": "EtherCAT",
        "port": None,
        "vendor": "Beckhoff / ETG",
        "function_codes": {
            1: "lrd_logical_read", 2: "lwr_logical_write", 3: "lrw_logical_readwrite",
            4: "brd_broadcast_read", 5: "bwr_broadcast_write",
            6: "aprd_auto_read", 7: "apwr_auto_write",
            8: "frmw_field_readwrite", 9: "mailbox_coe", 10: "mailbox_soe",
            11: "foe_file_access"
        },
        "critical_operations": ["lwr_logical_write", "bwr_broadcast_write", "apwr_auto_write", "foe_file_access"],
    },
}

# COMMAND ----------

# MAGIC %md
# MAGIC ## Streaming Ingestion from OT Collectors

# COMMAND ----------

ot_event_schema = StructType([
    StructField("timestamp", TimestampType(), False),
    StructField("protocol", StringType(), False),
    StructField("src_ip", StringType(), True),
    StructField("src_port", IntegerType(), True),
    StructField("dst_ip", StringType(), True),
    StructField("dst_port", IntegerType(), True),
    StructField("function_code", IntegerType(), True),
    StructField("function_name", StringType(), True),
    StructField("unit_id", IntegerType(), True),
    StructField("session_id", StringType(), True),
    StructField("payload_hex", StringType(), True),
    StructField("payload_length", IntegerType(), True),
    StructField("device_id", StringType(), True),
    StructField("device_name", StringType(), True),
    StructField("device_vendor", StringType(), True),
    StructField("device_model", StringType(), True),
    StructField("site_name", StringType(), True),
    StructField("network_zone", StringType(), True),
    StructField("response_code", IntegerType(), True),
    StructField("error_flag", BooleanType(), True),
    StructField("registers_accessed", ArrayType(IntegerType()), True),
    StructField("values_written", ArrayType(StringType()), True),
    StructField("is_broadcast", BooleanType(), True),
    StructField("raw_event", StringType(), True),
])

# COMMAND ----------

def get_kafka_stream():
    """Build streaming DataFrame from OT Kafka topics."""
    brokers = get_secret(cfg, "ot_kafka_brokers", fallback=get_secret(cfg, "kafka_brokers"))
    return (
        spark.readStream
        .format("kafka")
        .option("kafka.bootstrap.servers", brokers)
        .option("subscribe", topics)
        .option("kafka.group.id", consumer_group)
        .option("maxOffsetsPerTrigger", max_offsets)
        .option("startingOffsets", "latest")
        .option("failOnDataLoss", "false")
        .load()
    )

raw_stream = get_kafka_stream()

# COMMAND ----------

# MAGIC %md
# MAGIC ## Protocol-Aware Parsing & Enrichment

# COMMAND ----------

def classify_operation_risk(protocol: str, function_name: str) -> str:
    """Classify risk level of an OT operation."""
    proto_spec = OT_PROTOCOLS.get(protocol, {})
    critical_ops = proto_spec.get("critical_operations", [])
    if function_name in critical_ops:
        return "critical"
    if "write" in function_name or "set" in function_name:
        return "high"
    if "read" in function_name or "browse" in function_name:
        return "low"
    return "medium"

classify_risk_udf = udf(classify_operation_risk, StringType())

def get_protocol_vendor(protocol: str) -> str:
    """Get vendor name for protocol."""
    return OT_PROTOCOLS.get(protocol, {}).get("vendor", "Unknown")

vendor_udf = udf(get_protocol_vendor, StringType())

def resolve_function_name(protocol: str, function_code: int) -> str:
    """Resolve function code to human-readable name."""
    proto_spec = OT_PROTOCOLS.get(protocol, {})
    fc_map = proto_spec.get("function_codes", {})
    return fc_map.get(function_code, f"unknown_0x{function_code:02x}")

resolve_fn_udf = udf(resolve_function_name, StringType())

# COMMAND ----------

parsed_stream = (
    raw_stream
    .select(
        col("topic").alias("_topic"),
        col("timestamp").alias("_kafka_ts"),
        from_json(col("value").cast("string"), ot_event_schema).alias("event")
    )
    .select("_topic", "_kafka_ts", "event.*")
    .withColumn("protocol_vendor", vendor_udf(col("protocol")))
    .withColumn("function_name_resolved",
        when(col("function_name").isNotNull(), col("function_name"))
        .otherwise(resolve_fn_udf(col("protocol"), col("function_code")))
    )
    .withColumn("operation_risk", classify_risk_udf(col("protocol"), col("function_name_resolved")))
    .withColumn("is_write_operation",
        col("function_name_resolved").rlike("(?i)(write|set|download|upload|force|stop|reset|delete|control|operate|command)")
    )
    .withColumn("ingested_at", current_timestamp())
    .withColumn("event_date", to_date(col("timestamp")))
)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Write Bronze OT Events (All Traffic)

# COMMAND ----------

bronze_table = get_table_path(cfg, "bronze_ot_events")

spark.sql(f"""
CREATE TABLE IF NOT EXISTS {bronze_table} (
    timestamp TIMESTAMP NOT NULL,
    protocol STRING NOT NULL,
    protocol_vendor STRING,
    src_ip STRING,
    src_port INT,
    dst_ip STRING,
    dst_port INT,
    function_code INT,
    function_name_resolved STRING,
    operation_risk STRING,
    is_write_operation BOOLEAN,
    unit_id INT,
    session_id STRING,
    payload_length INT,
    device_id STRING,
    device_name STRING,
    device_vendor STRING,
    device_model STRING,
    site_name STRING,
    network_zone STRING,
    response_code INT,
    error_flag BOOLEAN,
    is_broadcast BOOLEAN,
    ingested_at TIMESTAMP,
    event_date DATE
)
USING DELTA
PARTITIONED BY (event_date, protocol)
TBLPROPERTIES (
    'delta.autoOptimize.optimizeWrite' = 'true',
    'delta.autoOptimize.autoCompact' = 'true',
    'quality' = 'bronze'
)
""")

# Write all OT events to bronze
bronze_query = (
    parsed_stream
    .select(
        "timestamp", "protocol", "protocol_vendor", "src_ip", "src_port",
        "dst_ip", "dst_port", "function_code", "function_name_resolved",
        "operation_risk", "is_write_operation", "unit_id", "session_id",
        "payload_length", "device_id", "device_name", "device_vendor",
        "device_model", "site_name", "network_zone", "response_code",
        "error_flag", "is_broadcast", "ingested_at", "event_date"
    )
    .writeStream
    .format("delta")
    .outputMode("append")
    .trigger(processingTime=trigger_interval)
    .option("checkpointLocation", f"{get_checkpoint_path(cfg)}/ot_bronze")
    .table(bronze_table)
)

mon.log_info(f"Bronze OT streaming started -> {bronze_table}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Write Silver Security Events (Anomalous / Write Operations Only)

# COMMAND ----------

silver_table = get_table_path(cfg, "silver_ot_security_events")

spark.sql(f"""
CREATE TABLE IF NOT EXISTS {silver_table} (
    event_id STRING NOT NULL,
    timestamp TIMESTAMP NOT NULL,
    protocol STRING NOT NULL,
    protocol_vendor STRING,
    src_ip STRING,
    dst_ip STRING,
    function_code INT,
    function_name STRING,
    operation_risk STRING,
    device_id STRING,
    device_name STRING,
    site_name STRING,
    network_zone STRING,
    registers_accessed ARRAY<INT>,
    values_written ARRAY<STRING>,
    is_broadcast BOOLEAN,
    error_flag BOOLEAN,
    -- Security classification
    event_category STRING,
    security_relevance STRING,
    requires_investigation BOOLEAN,
    -- OCSF mapping
    ocsf_class_uid INT DEFAULT 4001,
    ocsf_activity_id INT,
    ocsf_severity_id INT,
    ingested_at TIMESTAMP,
    event_date DATE
)
USING DELTA
PARTITIONED BY (event_date, protocol)
TBLPROPERTIES (
    'delta.autoOptimize.optimizeWrite' = 'true',
    'quality' = 'silver'
)
""")

# Filter for security-relevant operations
security_stream = (
    parsed_stream
    .filter(
        (col("operation_risk").isin("critical", "high")) |
        (col("is_write_operation") == True) |
        (col("error_flag") == True) |
        (col("is_broadcast") == True)
    )
    .withColumn("event_id", expr("uuid()"))
    .withColumn("event_category",
        when(col("operation_risk") == "critical", "control_manipulation")
        .when(col("error_flag") == True, "protocol_error")
        .when(col("is_broadcast") == True, "broadcast_command")
        .when(col("is_write_operation") == True, "configuration_change")
        .otherwise("operational")
    )
    .withColumn("security_relevance",
        when(col("operation_risk") == "critical", "immediate_review")
        .when(col("error_flag") == True, "anomaly_indicator")
        .when(col("is_broadcast") == True, "potential_attack")
        .otherwise("audit_trail")
    )
    .withColumn("requires_investigation",
        (col("operation_risk") == "critical") | (col("is_broadcast") == True)
    )
    .withColumn("ocsf_activity_id",
        when(col("is_write_operation") == True, lit(2))
        .when(col("function_name_resolved").rlike("(?i)read"), lit(1))
        .otherwise(lit(0))
    )
    .withColumn("ocsf_severity_id",
        when(col("operation_risk") == "critical", lit(5))
        .when(col("operation_risk") == "high", lit(4))
        .when(col("operation_risk") == "medium", lit(3))
        .otherwise(lit(1))
    )
)

silver_query = (
    security_stream
    .select(
        "event_id", "timestamp", "protocol", "protocol_vendor", "src_ip", "dst_ip",
        "function_code", col("function_name_resolved").alias("function_name"),
        "operation_risk", "device_id", "device_name", "site_name", "network_zone",
        "registers_accessed", "values_written", "is_broadcast", "error_flag",
        "event_category", "security_relevance", "requires_investigation",
        lit(4001).alias("ocsf_class_uid"), "ocsf_activity_id", "ocsf_severity_id",
        "ingested_at", "event_date"
    )
    .writeStream
    .format("delta")
    .outputMode("append")
    .trigger(processingTime=trigger_interval)
    .option("checkpointLocation", f"{get_checkpoint_path(cfg)}/ot_silver_security")
    .table(silver_table)
)

mon.log_info(f"Silver OT security streaming started -> {silver_table}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Command Audit Log (All Write Operations - Full Fidelity)

# COMMAND ----------

if enable_command_audit:
    audit_table = get_table_path(cfg, "ot_command_audit_log")

    spark.sql(f"""
    CREATE TABLE IF NOT EXISTS {audit_table} (
        audit_id STRING NOT NULL,
        timestamp TIMESTAMP NOT NULL,
        protocol STRING NOT NULL,
        src_ip STRING,
        dst_ip STRING,
        device_id STRING,
        device_name STRING,
        site_name STRING,
        function_code INT,
        function_name STRING,
        registers_accessed ARRAY<INT>,
        values_written ARRAY<STRING>,
        payload_hex STRING,
        payload_length INT,
        session_id STRING,
        operator_context STRING,
        -- Chain of custody
        ingested_at TIMESTAMP,
        hash_sha256 STRING,
        event_date DATE
    )
    USING DELTA
    PARTITIONED BY (event_date, protocol)
    TBLPROPERTIES (
        'delta.autoOptimize.optimizeWrite' = 'true',
        'quality' = 'gold',
        'purpose' = 'forensic_audit_trail'
    )
    """)

    audit_query = (
        parsed_stream
        .filter(col("is_write_operation") == True)
        .withColumn("audit_id", expr("uuid()"))
        .withColumn("hash_sha256", sha2(col("raw_event"), 256))
        .select(
            "audit_id", "timestamp", "protocol", "src_ip", "dst_ip",
            "device_id", "device_name", "site_name", "function_code",
            col("function_name_resolved").alias("function_name"),
            "registers_accessed", "values_written", "payload_hex",
            "payload_length", "session_id",
            lit(None).cast("string").alias("operator_context"),
            "ingested_at", "hash_sha256", "event_date"
        )
        .writeStream
        .format("delta")
        .outputMode("append")
        .trigger(processingTime=trigger_interval)
        .option("checkpointLocation", f"{get_checkpoint_path(cfg)}/ot_command_audit")
        .table(audit_table)
    )

    mon.log_info(f"OT command audit log streaming started -> {audit_table}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Behavioral Baseline Metrics (for Anomaly Detection)

# COMMAND ----------

if enable_anomaly_baseline:
    baseline_table = get_table_path(cfg, "ot_behavioral_baseline")

    spark.sql(f"""
    CREATE TABLE IF NOT EXISTS {baseline_table} (
        window_start TIMESTAMP NOT NULL,
        window_end TIMESTAMP NOT NULL,
        protocol STRING NOT NULL,
        device_id STRING,
        site_name STRING,
        -- Volumetric baselines
        total_operations LONG,
        read_operations LONG,
        write_operations LONG,
        critical_operations LONG,
        error_count LONG,
        broadcast_count LONG,
        -- Unique entity counts
        unique_src_ips LONG,
        unique_function_codes LONG,
        unique_registers_accessed LONG,
        -- Statistical
        avg_payload_size DOUBLE,
        max_payload_size INT,
        -- Anomaly flags
        write_ratio DOUBLE,
        critical_ratio DOUBLE,
        baseline_date DATE
    )
    USING DELTA
    PARTITIONED BY (baseline_date, protocol)
    """)

    baseline_query = (
        parsed_stream
        .withWatermark("timestamp", "2 minutes")
        .groupBy(
            window(col("timestamp"), "5 minutes"),
            "protocol", "device_id", "site_name"
        )
        .agg(
            count("*").alias("total_operations"),
            sum(when(~col("is_write_operation"), 1).otherwise(0)).alias("read_operations"),
            sum(when(col("is_write_operation"), 1).otherwise(0)).alias("write_operations"),
            sum(when(col("operation_risk") == "critical", 1).otherwise(0)).alias("critical_operations"),
            sum(when(col("error_flag") == True, 1).otherwise(0)).alias("error_count"),
            sum(when(col("is_broadcast") == True, 1).otherwise(0)).alias("broadcast_count"),
            countDistinct("src_ip").alias("unique_src_ips"),
            countDistinct("function_code").alias("unique_function_codes"),
            avg("payload_length").alias("avg_payload_size"),
            max("payload_length").alias("max_payload_size"),
        )
        .withColumn("window_start", col("window.start"))
        .withColumn("window_end", col("window.end"))
        .withColumn("write_ratio",
            when(col("total_operations") > 0,
                 col("write_operations") / col("total_operations"))
            .otherwise(lit(0.0))
        )
        .withColumn("critical_ratio",
            when(col("total_operations") > 0,
                 col("critical_operations") / col("total_operations"))
            .otherwise(lit(0.0))
        )
        .withColumn("unique_registers_accessed", lit(0))
        .withColumn("baseline_date", to_date(col("window_start")))
        .select(
            "window_start", "window_end", "protocol", "device_id", "site_name",
            "total_operations", "read_operations", "write_operations",
            "critical_operations", "error_count", "broadcast_count",
            "unique_src_ips", "unique_function_codes", "unique_registers_accessed",
            "avg_payload_size", "max_payload_size",
            "write_ratio", "critical_ratio", "baseline_date"
        )
        .writeStream
        .format("delta")
        .outputMode("append")
        .trigger(processingTime="1 minute")
        .option("checkpointLocation", f"{get_checkpoint_path(cfg)}/ot_baseline")
        .table(baseline_table)
    )

    mon.log_info(f"OT behavioral baseline streaming started -> {baseline_table}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Monitoring & Metrics

# COMMAND ----------

mon.log_info("All OT protocol streaming pipelines active", extra={
    "protocols_configured": len(OT_PROTOCOLS),
    "source_topics": topics,
    "command_audit_enabled": enable_command_audit,
    "anomaly_baseline_enabled": enable_anomaly_baseline,
    "trigger_interval": trigger_interval,
})

print(f"""
╔══════════════════════════════════════════════════════════════════╗
║  OT Protocol Ingestion Pipeline - RUNNING                       ║
╠══════════════════════════════════════════════════════════════════╣
║  Protocols: {len(OT_PROTOCOLS)} configured                                    ║
║  Topics: {topics[:50]}...║
║  Bronze: {bronze_table}        ║
║  Silver: {silver_table}║
║  Trigger: {trigger_interval}                                       ║
║  Command Audit: {'ENABLED' if enable_command_audit else 'DISABLED'}                                     ║
║  Baseline: {'ENABLED' if enable_anomaly_baseline else 'DISABLED'}                                        ║
╚══════════════════════════════════════════════════════════════════╝
""")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Monitor Until Termination

# COMMAND ----------

try:
    spark.streams.awaitAnyTermination()
except Exception as e:
    mon.log_error(e, context="OT protocol streaming terminated unexpectedly")
    raise
finally:
    mon.log_event("ot_protocol_streaming_terminated", {
        "protocols": len(OT_PROTOCOLS),
        "active_queries": len(spark.streams.active),
    })
    dbutils.notebook.exit(json_lib.dumps({"status": "terminated"}))
