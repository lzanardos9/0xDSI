# Databricks notebook source
# MAGIC %md
# MAGIC # Smoke Test: Schema Validation
# MAGIC
# MAGIC Validates that all required tables exist in Unity Catalog with correct schemas.
# MAGIC Run this after `01_create_catalog_schema.py` to prove the setup is complete.
# MAGIC
# MAGIC **Usage:** Run as a Databricks notebook or via `databricks jobs run-now`.

# COMMAND ----------

import sys
sys.path.insert(0, "../_shared")

from config import PlatformConfig
from monitoring import Monitor

cfg = PlatformConfig()
mon = Monitor(spark, cfg, "smoke_validate_schema")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Required Tables

# COMMAND ----------

REQUIRED_TABLES = [
    "events",
    "alerts",
    "cases",
    "response_actions",
    "response_approvals",
    "threat_intel_iocs",
    "threat_intel_matches",
    "correlation_rules",
    "correlation_matches",
    "user_profiles",
    "user_sessions",
    "user_behavior_anomalies",
    "agent_status",
    "agent_triage_results",
    "notebook_audit_events",
    "system_audit_log",
]

REQUIRED_EVENTS_COLUMNS = [
    "id", "event_type", "timestamp", "source_ip", "dest_ip",
    "user_id", "username", "hostname", "domain", "file_hash",
    "action", "outcome", "severity", "raw_log", "geo_location",
    "enrichments", "enrichment_risk_score", "ingested_at",
]

REQUIRED_USER_PROFILES_COLUMNS = [
    "id", "display_name", "email", "username", "title",
    "department", "role", "risk_level",
]

# COMMAND ----------

# MAGIC %md
# MAGIC ## Validate Table Existence

# COMMAND ----------

results = {"passed": [], "failed": []}

for table_name in REQUIRED_TABLES:
    full_path = cfg.get_table_path(table_name)
    try:
        spark.sql(f"DESCRIBE TABLE {full_path}")
        results["passed"].append(table_name)
        print(f"  PASS  {table_name}")
    except Exception as e:
        results["failed"].append({"table": table_name, "error": str(e)[:100]})
        print(f"  FAIL  {table_name}: {str(e)[:100]}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Validate Critical Column Schemas

# COMMAND ----------

def validate_columns(table_name, required_cols):
    full_path = cfg.get_table_path(table_name)
    try:
        df = spark.table(full_path)
        actual_cols = set(df.columns)
        missing = [c for c in required_cols if c not in actual_cols]
        if missing:
            results["failed"].append({
                "table": table_name,
                "error": f"Missing columns: {missing}"
            })
            print(f"  FAIL  {table_name} schema: missing {missing}")
        else:
            results["passed"].append(f"{table_name}_schema")
            print(f"  PASS  {table_name} schema ({len(required_cols)} columns verified)")
    except Exception as e:
        results["failed"].append({"table": table_name, "error": str(e)[:100]})
        print(f"  FAIL  {table_name} schema: {str(e)[:100]}")

validate_columns("events", REQUIRED_EVENTS_COLUMNS)
validate_columns("user_profiles", REQUIRED_USER_PROFILES_COLUMNS)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Validate geo_location Struct

# COMMAND ----------

events_path = cfg.get_table_path("events")
try:
    geo_schema = spark.table(events_path).schema["geo_location"].dataType
    geo_fields = {f.name for f in geo_schema.fields}
    required_geo = {"country", "city", "lat", "lon", "asn"}
    missing_geo = required_geo - geo_fields
    if missing_geo:
        results["failed"].append({"table": "events.geo_location", "error": f"Missing: {missing_geo}"})
        print(f"  FAIL  events.geo_location missing: {missing_geo}")
    else:
        results["passed"].append("events.geo_location_schema")
        print(f"  PASS  events.geo_location has all 5 fields")
except Exception as e:
    results["failed"].append({"table": "events.geo_location", "error": str(e)[:100]})
    print(f"  FAIL  events.geo_location: {str(e)[:100]}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Summary

# COMMAND ----------

total_pass = len(results["passed"])
total_fail = len(results["failed"])

print("\n" + "=" * 50)
print(f" SMOKE TEST RESULTS: {total_pass} passed, {total_fail} failed")
print("=" * 50)

if total_fail > 0:
    print("\nFailed items:")
    for f in results["failed"]:
        print(f"  - {f['table']}: {f['error']}")

mon.log_complete(details={
    "passed": total_pass,
    "failed": total_fail,
    "failures": results["failed"],
})

if total_fail > 0:
    dbutils.notebook.exit(f'{{"status": "FAILED", "passed": {total_pass}, "failed": {total_fail}}}')
else:
    print("\nALL SMOKE TESTS PASSED")
    dbutils.notebook.exit(f'{{"status": "PASSED", "passed": {total_pass}, "failed": 0}}')
