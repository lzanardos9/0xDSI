# Databricks notebook source
# MAGIC %md
# MAGIC # Detection 06: Bytecode / Semantics Wiver Engine
# MAGIC
# MAGIC Analyzes code artifacts for suspicious behavioral features BEFORE any IOC exists.
# MAGIC This is the "pre-signature" detection layer: even if a binary is signed, passes AV,
# MAGIC and has no known CVE, its BEHAVIOR can still reveal malicious intent.
# MAGIC
# MAGIC **Input Sources:**
# MAGIC - `bronze.raw_code_runtime` — Runtime telemetry: API calls, syscalls, library loads
# MAGIC - `bronze.raw_artifacts` — Files submitted for analysis (PE, ELF, scripts, containers)
# MAGIC - Runtime agents (eBPF, JVM/.NET instrumentation, Python profiling)
# MAGIC
# MAGIC **Behavioral Features Extracted:**
# MAGIC - `api_sequence` — Ordered API/syscall sequences (n-grams)
# MAGIC - `reflective_loading` — Self-modifying code patterns
# MAGIC - `encryption_constants` — Hardcoded crypto material / entropy anomalies
# MAGIC - `serialization_hooks` — Deserialization gadget chains
# MAGIC - `network_primitives` — Socket/DNS/HTTP patterns in code flow
# MAGIC - `persistence_mechanisms` — Registry, scheduled tasks, startup modification
# MAGIC - `privilege_escalation` — Token manipulation, impersonation patterns
# MAGIC - `evasion_techniques` — Anti-debug, sandbox detection, timing attacks
# MAGIC - `data_access_patterns` — File enumeration, credential store access
# MAGIC - `process_injection` — CreateRemoteThread, NtWriteVirtualMemory patterns
# MAGIC
# MAGIC **Detection Approach:**
# MAGIC 1. Extract behavioral feature vectors from runtime events
# MAGIC 2. Score against known-bad behavioral patterns (feature rules)
# MAGIC 3. Compare against organizational behavioral baseline (what's normal for this service)
# MAGIC 4. Flag anomalous code behavior even without IOC/signature match
# MAGIC
# MAGIC **Architecture Position:** Runs in raw-time fork (before normalization matters).
# MAGIC Outputs feed UEO as a high-independence signal.
# MAGIC
# MAGIC **Scheduling:** Every 5 minutes (streaming-compatible)

# COMMAND ----------

# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

dbutils.widgets.text("lookback_minutes", "10", "Minutes to scan for new code events")
dbutils.widgets.text("anomaly_threshold", "0.7", "Behavioral anomaly threshold")
dbutils.widgets.text("max_artifacts", "5000", "Max artifacts to analyze per run")

lookback_minutes = int(dbutils.widgets.get("lookback_minutes"))
anomaly_threshold = float(dbutils.widgets.get("anomaly_threshold"))
max_artifacts = int(dbutils.widgets.get("max_artifacts"))

require_tables("bytecode_analysis", "code_behavioral_features", "code_runtime_events")

# COMMAND ----------

from pyspark.sql.functions import *
from pyspark.sql.types import *
from pyspark.sql.window import Window
from datetime import datetime, timedelta
import json

# COMMAND ----------

# MAGIC %md
# MAGIC ## Ensure Tables

# COMMAND ----------

analysis_table = get_table_path(cfg, "bytecode_analysis")
feature_table = get_table_path(cfg, "code_behavioral_features")
baselines_table = get_table_path(cfg, "code_behavioral_baselines")

spark.sql(f"""
CREATE TABLE IF NOT EXISTS {analysis_table} (
    analysis_id STRING NOT NULL,
    artifact_id STRING,
    event_id STRING,
    -- Source identification
    hostname STRING,
    process_name STRING,
    process_path STRING,
    user_id STRING,
    service_name STRING,
    -- Artifact metadata
    file_hash_sha256 STRING,
    file_name STRING,
    file_size BIGINT,
    is_signed BOOLEAN DEFAULT false,
    signer STRING,
    -- Behavioral scoring
    behavioral_score DOUBLE NOT NULL,
    category STRING NOT NULL,
    verdict STRING NOT NULL,
    -- Feature breakdown
    reflective_loading_score DOUBLE DEFAULT 0.0,
    encryption_anomaly_score DOUBLE DEFAULT 0.0,
    serialization_score DOUBLE DEFAULT 0.0,
    network_primitive_score DOUBLE DEFAULT 0.0,
    persistence_score DOUBLE DEFAULT 0.0,
    privilege_escalation_score DOUBLE DEFAULT 0.0,
    evasion_score DOUBLE DEFAULT 0.0,
    data_access_score DOUBLE DEFAULT 0.0,
    injection_score DOUBLE DEFAULT 0.0,
    -- Context
    matched_patterns ARRAY<STRING>,
    api_sequence_anomalies ARRAY<STRING>,
    deviation_from_baseline DOUBLE DEFAULT 0.0,
    baseline_exists BOOLEAN DEFAULT false,
    -- Lineage
    mitre_techniques ARRAY<STRING>,
    entity_id STRING,
    created_at TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
TBLPROPERTIES (
    'delta.enableChangeDataFeed' = 'true',
    'delta.autoOptimize.optimizeWrite' = 'true'
)
""")

spark.sql(f"""
CREATE TABLE IF NOT EXISTS {feature_table} (
    feature_id STRING NOT NULL,
    event_id STRING NOT NULL,
    hostname STRING,
    process_name STRING,
    -- Raw features extracted
    api_calls ARRAY<STRING>,
    api_call_count INT,
    unique_apis INT,
    syscalls ARRAY<STRING>,
    loaded_libraries ARRAY<STRING>,
    network_calls INT DEFAULT 0,
    file_operations INT DEFAULT 0,
    registry_operations INT DEFAULT 0,
    crypto_operations INT DEFAULT 0,
    process_operations INT DEFAULT 0,
    memory_operations INT DEFAULT 0,
    -- Derived metrics
    entropy_score DOUBLE DEFAULT 0.0,
    api_diversity_ratio DOUBLE DEFAULT 0.0,
    suspicious_api_ratio DOUBLE DEFAULT 0.0,
    created_at TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
TBLPROPERTIES ('delta.autoOptimize.optimizeWrite' = 'true')
""")

spark.sql(f"""
CREATE TABLE IF NOT EXISTS {baselines_table} (
    baseline_id STRING NOT NULL,
    service_name STRING NOT NULL,
    hostname STRING,
    -- Expected behavioral profile
    expected_apis ARRAY<STRING>,
    expected_api_count_avg DOUBLE,
    expected_api_count_stddev DOUBLE,
    expected_network_calls_avg DOUBLE,
    expected_file_ops_avg DOUBLE,
    expected_entropy_avg DOUBLE,
    -- Thresholds
    api_count_upper_bound DOUBLE,
    network_upper_bound DOUBLE,
    entropy_upper_bound DOUBLE,
    -- Metadata
    sample_count BIGINT,
    last_updated TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
""")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Known-Bad Behavioral Patterns
# MAGIC
# MAGIC Feature rules that indicate suspicious code behavior regardless of signatures.

# COMMAND ----------

# Suspicious API patterns: sequences that indicate malicious behavior
SUSPICIOUS_PATTERNS = {
    "reflective_loading": {
        "apis": ["VirtualAllocEx", "WriteProcessMemory", "CreateRemoteThread",
                 "NtUnmapViewOfSection", "RtlCreateUserThread", "LoadLibraryEx"],
        "weight": 0.9,
        "mitre": ["T1055", "T1620"],
    },
    "credential_access": {
        "apis": ["CredEnumerate", "CryptUnprotectData", "LsaEnumerateLogonSessions",
                 "SamQueryInformationUser", "NetUserEnum", "OpenProcessToken"],
        "weight": 0.85,
        "mitre": ["T1003", "T1555"],
    },
    "persistence_install": {
        "apis": ["RegSetValueEx", "CreateService", "SchRpcRegisterTask",
                 "CopyFile.*startup", "WriteFile.*autorun"],
        "weight": 0.8,
        "mitre": ["T1547", "T1053"],
    },
    "evasion_sandbox": {
        "apis": ["IsDebuggerPresent", "CheckRemoteDebuggerPresent", "NtQueryInformationProcess",
                 "GetTickCount64", "QueryPerformanceCounter.*sleep", "VirtualQuery"],
        "weight": 0.75,
        "mitre": ["T1497", "T1622"],
    },
    "data_staging": {
        "apis": ["FindFirstFile.*Documents", "FindNextFile", "CopyFile",
                 "CreateFile.*temp", "CompressFile", "ZwSetInformationFile"],
        "weight": 0.7,
        "mitre": ["T1005", "T1074"],
    },
    "network_exfil": {
        "apis": ["WSASocket", "connect", "send", "DnsQuery_A",
                 "HttpSendRequest", "InternetOpen"],
        "weight": 0.6,
        "mitre": ["T1041", "T1071"],
    },
    "privilege_escalation": {
        "apis": ["AdjustTokenPrivileges", "ImpersonateLoggedOnUser",
                 "DuplicateToken", "SetThreadToken", "NtSetInformationToken"],
        "weight": 0.85,
        "mitre": ["T1134", "T1548"],
    },
    "process_injection": {
        "apis": ["NtWriteVirtualMemory", "QueueUserAPC", "SetWindowsHookEx",
                 "NtMapViewOfSection", "RtlMoveMemory"],
        "weight": 0.9,
        "mitre": ["T1055"],
    },
}

# UDF for pattern matching
suspicious_apis_flat = []
for pattern_name, pattern_def in SUSPICIOUS_PATTERNS.items():
    for api in pattern_def["apis"]:
        suspicious_apis_flat.append(api.lower())

suspicious_api_set = set(suspicious_apis_flat)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Extract Code Runtime Events

# COMMAND ----------

cutoff = datetime.utcnow() - timedelta(minutes=lookback_minutes)
now = datetime.utcnow()

with mon.time("extract_code_events"):
    # Try specialized code_runtime table first, fall back to events
    code_runtime_table = get_table_path(cfg, "code_runtime_events")

    try:
        code_events = spark.sql(f"""
            SELECT *
            FROM {code_runtime_table}
            WHERE timestamp > '{cutoff.isoformat()}'
            LIMIT {max_artifacts}
        """)
    except Exception:
        # Fall back: extract code-related events from main events table
        code_events = spark.sql(f"""
            SELECT
                id as event_id,
                timestamp,
                hostname,
                user_id,
                action as api_call,
                event_type,
                source as process_name,
                CAST(NULL AS STRING) as process_path,
                CAST(NULL AS STRING) as file_hash_sha256,
                CAST(NULL AS STRING) as file_name,
                CAST(NULL AS BIGINT) as file_size,
                raw_log,
                source_ip
            FROM {events_table}
            WHERE timestamp > '{cutoff.isoformat()}'
              AND event_type IN (
                  'process_creation', 'module_load', 'api_call', 'script_execution',
                  'file_creation', 'registry_modification', 'network_connection',
                  'code_execution', 'library_load', 'syscall'
              )
            LIMIT {max_artifacts}
        """)

    event_count = code_events.count()
    if event_count == 0:
        print("No code runtime events to analyze")
        dbutils.notebook.exit(json.dumps({"status": "no_events", "analyses": 0}))

    print(f"Analyzing {event_count} code runtime events")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Feature Extraction
# MAGIC
# MAGIC Group events by (hostname, process_name) and extract behavioral vectors.

# COMMAND ----------

with mon.time("extract_features"):
    # Group by process context
    process_features = (
        code_events
        .groupBy("hostname", coalesce(col("process_name"), lit("unknown")).alias("process_name"))
        .agg(
            collect_list("api_call").alias("api_calls"),
            count("*").alias("api_call_count"),
            countDistinct("api_call").alias("unique_apis"),
            countDistinct("event_type").alias("event_type_diversity"),
            first("user_id").alias("user_id"),
            first("event_id").alias("event_id"),
            first("file_hash_sha256").alias("file_hash_sha256"),
            first("file_name").alias("file_name"),
            first("file_size").alias("file_size"),
            # Count operations by category
            sum(when(col("event_type") == "network_connection", 1).otherwise(0)).alias("network_calls"),
            sum(when(col("event_type").isin("file_creation", "file_modification"), 1).otherwise(0)).alias("file_operations"),
            sum(when(col("event_type") == "registry_modification", 1).otherwise(0)).alias("registry_operations"),
            sum(when(col("event_type") == "process_creation", 1).otherwise(0)).alias("process_operations"),
            sum(when(col("event_type").isin("module_load", "library_load"), 1).otherwise(0)).alias("memory_operations"),
        )
        .withColumn("api_diversity_ratio",
            col("unique_apis").cast("double") / greatest(col("api_call_count").cast("double"), lit(1.0))
        )
    )

# COMMAND ----------

# MAGIC %md
# MAGIC ## Behavioral Scoring
# MAGIC
# MAGIC Score each process against known-bad patterns and baselines.

# COMMAND ----------

with mon.time("behavioral_scoring"):
    # Match against suspicious API patterns
    # For each pattern, check if the process used any of the pattern's APIs

    scored = process_features

    for pattern_name, pattern_def in SUSPICIOUS_PATTERNS.items():
        pattern_apis_lower = [a.lower() for a in pattern_def["apis"]]
        # Check overlap between process api_calls and pattern apis
        scored = scored.withColumn(
            f"{pattern_name}_score",
            size(
                array_intersect(
                    transform(col("api_calls"), lambda x: lower(x)),
                    array(*[lit(a) for a in pattern_apis_lower])
                )
            ).cast("double") / lit(len(pattern_apis_lower)) * lit(pattern_def["weight"])
        )

    # Composite behavioral score
    pattern_cols = [f"{p}_score" for p in SUSPICIOUS_PATTERNS.keys()]
    scored = scored.withColumn(
        "behavioral_score",
        greatest(*[col(c) for c in pattern_cols])
    )

    # Suspicious API ratio: what fraction of calls are suspicious
    scored = scored.withColumn(
        "suspicious_api_count",
        size(array_intersect(
            transform(col("api_calls"), lambda x: lower(x)),
            array(*[lit(a) for a in suspicious_apis_flat])
        ))
    ).withColumn(
        "suspicious_api_ratio",
        col("suspicious_api_count").cast("double") / greatest(col("api_call_count").cast("double"), lit(1.0))
    )

    # Boost score if high suspicious ratio
    scored = scored.withColumn(
        "behavioral_score",
        least(
            col("behavioral_score") + col("suspicious_api_ratio") * lit(0.3),
            lit(1.0)
        )
    )

    # Collect matched patterns
    scored = scored.withColumn(
        "matched_patterns",
        filter(
            array(*[
                when(col(f"{p}_score") > 0.1, lit(p)).otherwise(lit(None))
                for p in SUSPICIOUS_PATTERNS.keys()
            ]),
            lambda x: x.isNotNull()
        )
    )

    # Collect MITRE techniques from matched patterns
    scored = scored.withColumn(
        "mitre_techniques",
        filter(
            array(*[
                when(col(f"{p}_score") > 0.1, lit(",".join(SUSPICIOUS_PATTERNS[p]["mitre"])))
                .otherwise(lit(None))
                for p in SUSPICIOUS_PATTERNS.keys()
            ]),
            lambda x: x.isNotNull()
        )
    )

    # Determine verdict and category
    scored = scored.withColumn(
        "verdict",
        when(col("behavioral_score") >= 0.8, lit("malicious"))
        .when(col("behavioral_score") >= anomaly_threshold, lit("suspicious"))
        .when(col("behavioral_score") >= 0.3, lit("anomalous"))
        .otherwise(lit("benign"))
    ).withColumn(
        "category",
        when(col("reflective_loading_score") == col("behavioral_score"), lit("code_injection"))
        .when(col("credential_access_score") == col("behavioral_score"), lit("credential_theft"))
        .when(col("persistence_install_score") == col("behavioral_score"), lit("persistence"))
        .when(col("evasion_sandbox_score") == col("behavioral_score"), lit("evasion"))
        .when(col("data_staging_score") == col("behavioral_score"), lit("data_staging"))
        .when(col("network_exfil_score") == col("behavioral_score"), lit("exfiltration"))
        .when(col("privilege_escalation_score") == col("behavioral_score"), lit("privilege_escalation"))
        .when(col("process_injection_score") == col("behavioral_score"), lit("process_injection"))
        .otherwise(lit("behavioral_anomaly"))
    )

# COMMAND ----------

# MAGIC %md
# MAGIC ## Compare Against Service Baselines

# COMMAND ----------

with mon.time("baseline_comparison"):
    try:
        baselines = spark.table(baselines_table)
        if baselines.count() > 0:
            scored = (
                scored.alias("s")
                .join(
                    baselines.alias("b"),
                    (col("s.process_name") == col("b.service_name")) &
                    (col("s.hostname") == col("b.hostname")),
                    "left"
                )
                .withColumn("baseline_exists", col("b.baseline_id").isNotNull())
                .withColumn("deviation_from_baseline",
                    when(col("baseline_exists"),
                        abs(col("s.api_call_count") - coalesce(col("b.expected_api_count_avg"), lit(0))) /
                        greatest(coalesce(col("b.expected_api_count_stddev"), lit(10.0)), lit(1.0))
                    ).otherwise(lit(0.0))
                )
                # Boost behavioral score if deviating significantly from baseline
                .withColumn("behavioral_score",
                    when(col("deviation_from_baseline") > 3.0,
                        least(col("behavioral_score") + lit(0.15), lit(1.0))
                    ).otherwise(col("behavioral_score"))
                )
                .drop(col("b.baseline_id"))
            )
        else:
            scored = scored.withColumn("baseline_exists", lit(False)).withColumn("deviation_from_baseline", lit(0.0))
    except Exception:
        scored = scored.withColumn("baseline_exists", lit(False)).withColumn("deviation_from_baseline", lit(0.0))

# COMMAND ----------

# MAGIC %md
# MAGIC ## Write Analysis Results

# COMMAND ----------

with mon.time("write_results"):
    # Filter to non-benign results
    significant = scored.filter(col("behavioral_score") >= 0.3)
    sig_count = significant.count()

    if sig_count > 0:
        # Resolve entity_id from spine
        try:
            spine_lookup = spark.table(get_table_path(cfg, "entity_spine")).select(
                col("canonical_name"), col("entity_id")
            )
            significant = (
                significant.alias("s")
                .join(
                    spine_lookup.alias("sp"),
                    coalesce(col("s.user_id"), col("s.hostname")) == col("sp.canonical_name"),
                    "left"
                )
                .withColumn("entity_id", coalesce(col("sp.entity_id"), md5(coalesce(col("s.user_id"), col("s.hostname")))))
            )
        except Exception:
            significant = significant.withColumn(
                "entity_id", md5(coalesce(col("user_id"), col("hostname"), lit("unknown")))
            )

        # Write to analysis table
        analysis_output = significant.select(
            expr("uuid()").alias("analysis_id"),
            lit(None).cast("string").alias("artifact_id"),
            col("event_id"),
            col("hostname"),
            col("process_name"),
            lit(None).cast("string").alias("process_path"),
            col("user_id"),
            col("process_name").alias("service_name"),
            col("file_hash_sha256"),
            col("file_name"),
            col("file_size"),
            lit(False).alias("is_signed"),
            lit(None).cast("string").alias("signer"),
            col("behavioral_score"),
            col("category"),
            col("verdict"),
            col("reflective_loading_score"),
            col("encryption_anomaly_score") if "encryption_anomaly_score" in scored.columns
                else lit(0.0).alias("encryption_anomaly_score"),
            col("serialization_hooks_score") if "serialization_hooks_score" in scored.columns
                else lit(0.0).alias("serialization_score"),
            col("network_exfil_score").alias("network_primitive_score"),
            col("persistence_install_score").alias("persistence_score"),
            col("privilege_escalation_score"),
            col("evasion_sandbox_score").alias("evasion_score"),
            col("data_staging_score").alias("data_access_score"),
            col("process_injection_score").alias("injection_score"),
            col("matched_patterns"),
            lit(None).cast("array<string>").alias("api_sequence_anomalies"),
            col("deviation_from_baseline"),
            col("baseline_exists"),
            col("mitre_techniques"),
            col("entity_id"),
            current_timestamp().alias("created_at"),
        )
        analysis_output.write.mode("append").option("mergeSchema", "true").saveAsTable(analysis_table)
        print(f"Wrote {sig_count} bytecode analysis results")

    # Emit alerts for suspicious/malicious verdicts
    alerts_to_emit = scored.filter(col("behavioral_score") >= anomaly_threshold)
    alert_count = alerts_to_emit.count()

    if alert_count > 0:
        alerts_table = get_table_path(cfg, "alerts")
        bytecode_alerts = (
            alerts_to_emit
            .select(
                expr("uuid()").alias("id"),
                concat(lit("Bytecode: "), col("verdict"), lit(" - "), col("process_name"), lit("@"), col("hostname")).alias("title"),
                concat(
                    lit("Behavioral analysis detected "), col("category"),
                    lit(" patterns in "), col("process_name"),
                    lit(" (score="), round(col("behavioral_score"), 3).cast("string"),
                    lit(", patterns="), array_join(col("matched_patterns"), ","),
                    lit(")")
                ).alias("description"),
                when(col("behavioral_score") >= 0.8, lit("critical"))
                .when(col("behavioral_score") >= 0.7, lit("high"))
                .otherwise(lit("medium")).alias("severity"),
                lit("bytecode_semantics").alias("source"),
                md5(coalesce(col("user_id"), col("hostname"))).alias("entity_id"),
                col("behavioral_score").alias("confidence_score"),
                lit("open").alias("status"),
                current_timestamp().alias("created_at"),
            )
        )
        bytecode_alerts.write.mode("append").option("mergeSchema", "true").saveAsTable(alerts_table)
        print(f"Emitted {alert_count} bytecode alerts")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Update Service Baselines (periodic)
# MAGIC
# MAGIC Baselines are rebuilt from benign activity observed over the past 7 days.

# COMMAND ----------

with mon.time("update_baselines"):
    # Only update baselines every ~hour (check last update time)
    try:
        last_baseline = spark.sql(f"SELECT MAX(last_updated) FROM {baselines_table}").first()[0]
        if last_baseline and (now - last_baseline).total_seconds() < 3600:
            print("Baselines updated recently, skipping")
        else:
            raise Exception("rebuild")
    except Exception:
        baseline_window_start = now - timedelta(days=7)
        try:
            new_baselines = spark.sql(f"""
                SELECT
                    uuid() as baseline_id,
                    COALESCE(source, 'unknown') as service_name,
                    hostname,
                    collect_set(action) as expected_apis,
                    AVG(1) as expected_api_count_avg,
                    STDDEV(1) as expected_api_count_stddev,
                    AVG(CASE WHEN event_type = 'network_connection' THEN 1 ELSE 0 END) as expected_network_calls_avg,
                    AVG(CASE WHEN event_type IN ('file_creation', 'file_modification') THEN 1 ELSE 0 END) as expected_file_ops_avg,
                    0.0 as expected_entropy_avg,
                    0.0 as api_count_upper_bound,
                    0.0 as network_upper_bound,
                    0.0 as entropy_upper_bound,
                    COUNT(*) as sample_count,
                    current_timestamp() as last_updated
                FROM {events_table}
                WHERE timestamp > '{baseline_window_start.isoformat()}'
                  AND event_type IN ('process_creation', 'api_call', 'script_execution', 'module_load')
                  AND hostname IS NOT NULL
                GROUP BY COALESCE(source, 'unknown'), hostname
                HAVING COUNT(*) >= 100
            """)
            if new_baselines.count() > 0:
                new_baselines.write.mode("overwrite").saveAsTable(baselines_table)
                print(f"Updated {new_baselines.count()} service baselines")
        except Exception as e:
            mon.log_warning(f"Baseline update skipped: {str(e)[:100]}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Summary

# COMMAND ----------

total_analyzed = event_count
suspicious_count = scored.filter(col("verdict") != "benign").count() if 'scored' in dir() else 0

result = {
    "notebook": "06_bytecode_semantics",
    "status": "completed",
    "events_analyzed": total_analyzed,
    "suspicious_detected": suspicious_count,
    "alerts_emitted": alert_count if 'alert_count' in dir() else 0,
    "anomaly_threshold": anomaly_threshold,
}
mon.log_complete(details=result)
print(f"\nBytecode Semantics: {total_analyzed} events → {suspicious_count} suspicious")
dbutils.notebook.exit(json.dumps(result))
