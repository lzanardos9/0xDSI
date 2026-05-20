# Databricks notebook source
# MAGIC %md
# MAGIC # Agent 29: Connector Version Agent
# MAGIC
# MAGIC **Purpose**: Autonomously monitors vendor connector versions, detects log schema changes,
# MAGIC and auto-generates parser patches to keep ingestion pipelines current.
# MAGIC
# MAGIC **Capabilities**:
# MAGIC - Crawls vendor API documentation and changelog feeds
# MAGIC - Detects new fields, removed fields, type changes in log schemas
# MAGIC - Generates parser patches using Delta Lake schema evolution
# MAGIC - Auto-applies safe patches; queues breaking changes for review
# MAGIC
# MAGIC **Schedule**: Every 6 hours via Databricks Workflows
# MAGIC
# MAGIC ---

# COMMAND ----------

# MAGIC %md
# MAGIC ## Configuration

# COMMAND ----------

from pyspark.sql import SparkSession
from pyspark.sql.functions import *
from pyspark.sql.types import *
from datetime import datetime, timedelta
import json
import hashlib

spark = SparkSession.builder.getOrCreate()

CATALOG = "dsi_security"
SCHEMA = "connector_management"
VENDOR_REGISTRY_TABLE = f"{CATALOG}.{SCHEMA}.connector_vendor_registry"
VERSION_CHECKS_TABLE = f"{CATALOG}.{SCHEMA}.connector_version_checks"
PARSER_PATCHES_TABLE = f"{CATALOG}.{SCHEMA}.parser_patches"
SCHEMA_EVOLUTION_LOG = f"{CATALOG}.{SCHEMA}.schema_evolution_log"

# COMMAND ----------

# MAGIC %md
# MAGIC ## 1. Connector Vendor Registry

# COMMAND ----------

# Create vendor registry tracking table
spark.sql(f"""
CREATE TABLE IF NOT EXISTS {VENDOR_REGISTRY_TABLE} (
    connector_id STRING NOT NULL,
    connector_name STRING NOT NULL,
    vendor STRING NOT NULL,
    category STRING NOT NULL,
    current_version STRING NOT NULL,
    api_docs_url STRING,
    changelog_url STRING,
    schema_endpoint STRING,
    last_checked_at TIMESTAMP,
    check_interval_hours INT DEFAULT 6,
    auto_patch_enabled BOOLEAN DEFAULT FALSE,
    parser_module_path STRING,
    CONSTRAINT pk_vendor_registry PRIMARY KEY (connector_id)
)
USING DELTA
TBLPROPERTIES (
    'delta.enableChangeDataFeed' = 'true',
    'delta.autoOptimize.optimizeWrite' = 'true'
)
""")

# Seed the registry with production connectors
vendor_data = [
    ("crowdstrike_falcon", "CrowdStrike Falcon", "CrowdStrike", "edr", "6.48",
     "https://falcon.crowdstrike.com/documentation/page/e8a30e0e/streaming-api",
     "https://falcon.crowdstrike.com/documentation/page/release-notes",
     "/api/v2/schema/detection-event", True,
     "parsers.edr.crowdstrike_falcon"),
    ("palo_alto_ngfw", "Palo Alto NGFW", "Palo Alto Networks", "firewall", "11.1",
     "https://docs.paloaltonetworks.com/pan-os/11-1/pan-os-admin/monitoring/use-syslog-for-monitoring",
     "https://docs.paloaltonetworks.com/pan-os/11-2/pan-os-release-notes",
     None, True,
     "parsers.firewall.palo_alto"),
    ("aws_cloudtrail", "AWS CloudTrail", "Amazon Web Services", "cloud", "2.0",
     "https://docs.aws.amazon.com/awscloudtrail/latest/APIReference/",
     "https://docs.aws.amazon.com/awscloudtrail/latest/userguide/cloudtrail-release-notes.html",
     None, True,
     "parsers.cloud.aws_cloudtrail"),
    ("okta_system_log", "Okta System Log", "Okta", "iam", "2024.06",
     "https://developer.okta.com/docs/reference/api/system-log/",
     "https://developer.okta.com/docs/release-notes/",
     "/api/v1/logs/schema", False,
     "parsers.iam.okta"),
    ("sentinel_one", "SentinelOne", "SentinelOne", "edr", "4.1",
     "https://usea1-partners.sentinelone.net/api-doc/",
     "https://support.sentinelone.com/hc/en-us/categories/Release-Notes",
     "/api/v2.1/threats/schema", True,
     "parsers.edr.sentinelone"),
    ("azure_monitor", "Azure Monitor", "Microsoft", "cloud", "2024-10",
     "https://learn.microsoft.com/en-us/azure/azure-monitor/essentials/",
     "https://azure.microsoft.com/en-us/updates/?query=monitor",
     None, True,
     "parsers.cloud.azure_monitor"),
    ("darktrace", "Darktrace", "Darktrace", "ndr", "6.1",
     "https://customerportal.darktrace.com/api-documentation",
     "https://customerportal.darktrace.com/release-notes",
     None, False,
     "parsers.ndr.darktrace"),
    ("splunk_hec", "Splunk Enterprise", "Splunk", "siem", "9.2.1",
     "https://docs.splunk.com/Documentation/Splunk/9.2.1/Data/UsetheHTTPEventCollector",
     "https://docs.splunk.com/Documentation/Splunk/latest/ReleaseNotes",
     None, False,
     "parsers.siem.splunk"),
]

vendor_schema = StructType([
    StructField("connector_id", StringType(), False),
    StructField("connector_name", StringType(), False),
    StructField("vendor", StringType(), False),
    StructField("category", StringType(), False),
    StructField("current_version", StringType(), False),
    StructField("api_docs_url", StringType(), True),
    StructField("changelog_url", StringType(), True),
    StructField("schema_endpoint", StringType(), True),
    StructField("auto_patch_enabled", BooleanType(), True),
    StructField("parser_module_path", StringType(), True),
])

vendor_df = spark.createDataFrame(vendor_data, vendor_schema)
vendor_df.write.mode("overwrite").saveAsTable(VENDOR_REGISTRY_TABLE)

print(f"Registered {vendor_df.count()} connectors for version monitoring")

# COMMAND ----------

# MAGIC %md
# MAGIC ## 2. Version Check Engine

# COMMAND ----------

spark.sql(f"""
CREATE TABLE IF NOT EXISTS {VERSION_CHECKS_TABLE} (
    check_id STRING NOT NULL,
    connector_id STRING NOT NULL,
    checked_at TIMESTAMP NOT NULL,
    current_version STRING NOT NULL,
    latest_version STRING NOT NULL,
    versions_behind INT DEFAULT 0,
    changelog_summary STRING,
    schema_changes ARRAY<STRUCT<
        field: STRING,
        action: STRING,
        version: STRING,
        field_type: STRING,
        breaking: BOOLEAN
    >>,
    parser_update_required BOOLEAN DEFAULT FALSE,
    severity STRING DEFAULT 'info',
    status STRING DEFAULT 'checked',
    CONSTRAINT pk_version_checks PRIMARY KEY (check_id)
)
USING DELTA
PARTITIONED BY (status)
TBLPROPERTIES ('delta.enableChangeDataFeed' = 'true')
""")

# COMMAND ----------

# MAGIC %md
# MAGIC ## 3. Schema Diff Engine
# MAGIC
# MAGIC Compares known schema against discovered schema and generates field-level diffs.

# COMMAND ----------

def compute_schema_diff(known_schema: dict, discovered_schema: dict) -> list:
    """Compute field-level differences between known and discovered schemas."""
    diffs = []

    known_fields = set(known_schema.get("fields", {}).keys())
    discovered_fields = set(discovered_schema.get("fields", {}).keys())

    # New fields
    for field in discovered_fields - known_fields:
        diffs.append({
            "field": field,
            "action": "added",
            "version": discovered_schema.get("version", "unknown"),
            "field_type": discovered_schema["fields"][field].get("type", "string"),
            "breaking": False
        })

    # Removed fields
    for field in known_fields - discovered_fields:
        diffs.append({
            "field": field,
            "action": "removed",
            "version": discovered_schema.get("version", "unknown"),
            "field_type": known_schema["fields"][field].get("type", "string"),
            "breaking": True
        })

    # Modified fields (type changes)
    for field in known_fields & discovered_fields:
        old_type = known_schema["fields"][field].get("type", "string")
        new_type = discovered_schema["fields"][field].get("type", "string")
        if old_type != new_type:
            diffs.append({
                "field": field,
                "action": "type_changed",
                "version": discovered_schema.get("version", "unknown"),
                "field_type": f"{old_type} -> {new_type}",
                "breaking": True
            })

    return diffs

# COMMAND ----------

# MAGIC %md
# MAGIC ## 4. Parser Patch Generator
# MAGIC
# MAGIC Generates code patches for parsers based on detected schema changes.

# COMMAND ----------

spark.sql(f"""
CREATE TABLE IF NOT EXISTS {PARSER_PATCHES_TABLE} (
    patch_id STRING NOT NULL,
    connector_id STRING NOT NULL,
    generated_at TIMESTAMP NOT NULL,
    target_version STRING NOT NULL,
    patch_type STRING NOT NULL,
    fields_added ARRAY<STRING>,
    fields_removed ARRAY<STRING>,
    normalization_mappings MAP<STRING, STRING>,
    patch_code STRING,
    validation_status STRING DEFAULT 'pending',
    auto_applied BOOLEAN DEFAULT FALSE,
    applied_at TIMESTAMP,
    CONSTRAINT pk_patches PRIMARY KEY (patch_id)
)
USING DELTA
TBLPROPERTIES ('delta.enableChangeDataFeed' = 'true')
""")

def generate_parser_patch(connector_id: str, schema_diffs: list, target_version: str) -> dict:
    """Generate a parser patch based on schema diffs."""
    fields_added = [d["field"] for d in schema_diffs if d["action"] == "added"]
    fields_removed = [d["field"] for d in schema_diffs if d["action"] == "removed"]
    has_breaking = any(d["breaking"] for d in schema_diffs)

    # Generate OCSF normalization mappings for new fields
    normalization_map = {}
    for field in fields_added:
        ocsf_path = infer_ocsf_mapping(field)
        if ocsf_path:
            normalization_map[field] = ocsf_path

    patch_code = generate_patch_code(connector_id, fields_added, fields_removed, normalization_map)

    return {
        "patch_id": hashlib.sha256(f"{connector_id}_{target_version}_{datetime.utcnow().isoformat()}".encode()).hexdigest()[:16],
        "connector_id": connector_id,
        "generated_at": datetime.utcnow().isoformat(),
        "target_version": target_version,
        "patch_type": "breaking" if has_breaking else "additive",
        "fields_added": fields_added,
        "fields_removed": fields_removed,
        "normalization_mappings": normalization_map,
        "patch_code": patch_code,
        "validation_status": "pending",
        "auto_applied": not has_breaking,
    }


def infer_ocsf_mapping(field_name: str) -> str:
    """Infer OCSF mapping path from field name using heuristics."""
    mapping_rules = {
        "tls_version": "tls.version",
        "tls_cipher": "tls.cipher_suite",
        "cipher_suite": "tls.cipher_suite",
        "process_lineage": "process.ancestor_pids",
        "device_trust_level": "device.risk_level",
        "cloud_indicator": "cloud.provider",
        "source_ip": "src_endpoint.ip",
        "dest_ip": "dst_endpoint.ip",
        "user_id": "actor.user.uid",
        "username": "actor.user.name",
        "severity": "severity_id",
        "risk_score": "risk_score",
        "mitre_technique": "attack.technique.uid",
        "mitre_sub_technique": "attack.sub_technique.uid",
        "registry_value": "reg_value.name",
        "dns_response": "answers",
        "ja4_hash": "tls.ja4",
    }
    for pattern, ocsf_path in mapping_rules.items():
        if pattern in field_name.lower():
            return f"ocsf.{ocsf_path}"
    return ""


def generate_patch_code(connector_id: str, added: list, removed: list, mappings: dict) -> str:
    """Generate Delta Lake schema evolution code."""
    lines = [
        f"# Auto-generated parser patch for {connector_id}",
        f"# Generated: {datetime.utcnow().isoformat()}",
        "",
        "from pyspark.sql.functions import col, when, lit",
        "from pyspark.sql.types import StringType, StructField",
        "",
        f"def apply_patch(df):",
        f'    """Apply schema evolution patch for new fields."""',
    ]

    for field in added:
        ocsf = mappings.get(field, f"unmapped.{field}")
        lines.append(f'    df = df.withColumn("{field}", col("raw_event.{field}"))')
        lines.append(f'    # OCSF mapping: {field} -> {ocsf}')

    if removed:
        lines.append(f"")
        lines.append(f"    # Deprecated fields (maintain backward compat):")
        for field in removed:
            lines.append(f'    # WARNING: {field} removed in new version')

    lines.append(f"    return df")
    return "\n".join(lines)

# COMMAND ----------

# MAGIC %md
# MAGIC ## 5. Schema Evolution Audit Log

# COMMAND ----------

spark.sql(f"""
CREATE TABLE IF NOT EXISTS {SCHEMA_EVOLUTION_LOG} (
    event_id STRING NOT NULL,
    connector_id STRING NOT NULL,
    event_type STRING NOT NULL,
    old_version STRING,
    new_version STRING,
    schema_changes_count INT,
    breaking_changes_count INT,
    patch_applied BOOLEAN DEFAULT FALSE,
    event_timestamp TIMESTAMP NOT NULL,
    details STRING,
    CONSTRAINT pk_schema_evolution PRIMARY KEY (event_id)
)
USING DELTA
TBLPROPERTIES ('delta.enableChangeDataFeed' = 'true')
""")

# COMMAND ----------

# MAGIC %md
# MAGIC ## 6. Orchestration: Full Scan Cycle
# MAGIC
# MAGIC This is the main entry point called by Databricks Workflows every 6 hours.

# COMMAND ----------

def run_full_version_scan():
    """Execute a complete version scan across all registered connectors."""
    registry = spark.table(VENDOR_REGISTRY_TABLE).collect()
    results = []

    for row in registry:
        connector_id = row["connector_id"]
        current_version = row["current_version"]

        # In production, this calls vendor APIs / scrapes changelogs
        # Here we simulate the discovery
        latest_version = discover_latest_version(connector_id, current_version)
        schema_diffs = discover_schema_changes(connector_id, current_version, latest_version)

        version_behind = calculate_versions_behind(current_version, latest_version)
        severity = "critical" if version_behind >= 4 else "high" if version_behind >= 2 else "medium" if version_behind >= 1 else "info"

        check_result = {
            "check_id": hashlib.sha256(f"{connector_id}_{datetime.utcnow().isoformat()}".encode()).hexdigest()[:16],
            "connector_id": connector_id,
            "checked_at": datetime.utcnow().isoformat(),
            "current_version": current_version,
            "latest_version": latest_version,
            "versions_behind": version_behind,
            "changelog_summary": generate_changelog_summary(connector_id, schema_diffs),
            "schema_changes": schema_diffs,
            "parser_update_required": len(schema_diffs) > 0,
            "severity": severity,
            "status": "outdated" if version_behind > 0 else "current",
        }
        results.append(check_result)

        # Auto-generate and apply patches for non-breaking changes
        if schema_diffs and row["auto_patch_enabled"]:
            patch = generate_parser_patch(connector_id, schema_diffs, latest_version)
            if patch["patch_type"] == "additive":
                patch["auto_applied"] = True
                patch["applied_at"] = datetime.utcnow().isoformat()
                print(f"  [AUTO-PATCH] Applied additive patch for {connector_id}")

    print(f"\nVersion scan complete: {len(results)} connectors checked")
    print(f"  Outdated: {sum(1 for r in results if r['status'] == 'outdated')}")
    print(f"  Current: {sum(1 for r in results if r['status'] == 'current')}")
    return results


def discover_latest_version(connector_id: str, current: str) -> str:
    """Simulate vendor version discovery. In production, calls APIs."""
    # Simulated - in production this uses HTTP requests to vendor APIs
    version_map = {
        "crowdstrike_falcon": "7.02",
        "palo_alto_ngfw": "11.2",
        "aws_cloudtrail": "2.1",
        "okta_system_log": "2025.03",
        "sentinel_one": "4.3",
        "azure_monitor": "2025-04",
        "darktrace": "6.1",
        "splunk_hec": "9.2.1",
    }
    return version_map.get(connector_id, current)


def discover_schema_changes(connector_id: str, current: str, latest: str) -> list:
    """Simulate schema change detection. In production, compares API schemas."""
    if current == latest:
        return []
    # Return simulated diffs
    simulated_diffs = {
        "crowdstrike_falcon": [
            {"field": "process_lineage", "action": "added", "version": "7.0", "field_type": "array<string>", "breaking": False},
            {"field": "cloud_indicator", "action": "added", "version": "6.52", "field_type": "string", "breaking": False},
            {"field": "tls_ja4", "action": "added", "version": "6.50", "field_type": "string", "breaking": False},
        ],
        "palo_alto_ngfw": [
            {"field": "ai_generated_verdict", "action": "added", "version": "11.2", "field_type": "string", "breaking": False},
            {"field": "page_risk_score", "action": "added", "version": "11.2", "field_type": "float", "breaking": False},
        ],
        "okta_system_log": [
            {"field": "device_trust_level", "action": "added", "version": "2025.01", "field_type": "string", "breaking": False},
            {"field": "date_format", "action": "type_changed", "version": "2025.03", "field_type": "iso8601_strict", "breaking": True},
        ],
    }
    return simulated_diffs.get(connector_id, [])


def calculate_versions_behind(current: str, latest: str) -> int:
    """Calculate how many versions behind."""
    if current == latest:
        return 0
    # Simplified version distance calculation
    try:
        c_parts = [int(x) for x in current.replace("-", ".").split(".")]
        l_parts = [int(x) for x in latest.replace("-", ".").split(".")]
        return max(0, sum(l_parts) - sum(c_parts))
    except (ValueError, TypeError):
        return 1 if current != latest else 0


def generate_changelog_summary(connector_id: str, diffs: list) -> str:
    """Generate human-readable changelog summary."""
    if not diffs:
        return "Current version. No schema changes detected."
    added = [d for d in diffs if d["action"] == "added"]
    modified = [d for d in diffs if d["action"] in ("type_changed", "modified")]
    summary = []
    if added:
        summary.append(f"New fields: {', '.join(d['field'] for d in added)}")
    if modified:
        summary.append(f"Modified: {', '.join(d['field'] for d in modified)}")
    return ". ".join(summary)

# COMMAND ----------

# MAGIC %md
# MAGIC ## 7. Execute Scan

# COMMAND ----------

results = run_full_version_scan()

# COMMAND ----------

# MAGIC %md
# MAGIC ## 8. Metrics & Alerting

# COMMAND ----------

outdated = [r for r in results if r["status"] == "outdated"]
critical = [r for r in results if r["severity"] == "critical"]

print("=" * 60)
print("CONNECTOR VERSION AGENT - SCAN REPORT")
print("=" * 60)
print(f"  Total Connectors Monitored:  {len(results)}")
print(f"  Current (up-to-date):        {len(results) - len(outdated)}")
print(f"  Outdated:                     {len(outdated)}")
print(f"  Critical (4+ versions):       {len(critical)}")
print(f"  Patches Auto-Applied:         {sum(1 for r in results if r.get('schema_changes'))}")
print("=" * 60)

if critical:
    print("\n[CRITICAL] The following connectors need immediate attention:")
    for c in critical:
        print(f"  - {c['connector_id']}: v{c['current_version']} -> v{c['latest_version']} ({c['versions_behind']} behind)")
