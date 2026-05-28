# Databricks notebook source
# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

require_enabled("vibe_connector_builder")

# COMMAND ----------

# MAGIC %md
# MAGIC # Agent 31 - Vibe Connector Builder
# MAGIC LLM-powered connector generation. Takes specs from connector_requests and generates
# MAGIC production-grade code with auth, pagination, rate limiting, error retry, and OCSF
# MAGIC schema mapping. Stores in generated_connectors for review. Does NOT auto-deploy.

# COMMAND ----------

import json
import hashlib
from datetime import datetime
from pyspark.sql import functions as F

AGENT_NAME = "vibe_connector_builder"
AGENT_ID = 31
requests_table = cfg.get_table_path("connector_requests")
generated_table = cfg.get_table_path("generated_connectors")

# COMMAND ----------

# MAGIC %md
# MAGIC ## LLM Connector Generation

# COMMAND ----------

def build_generation_prompt(spec):
    """Construct the LLM prompt for generating connector code."""
    endpoints = json.loads(spec["endpoints"]) if isinstance(spec["endpoints"], str) else spec["endpoints"]
    return f"""Generate a production-grade Python connector for source_type='{spec["source_type"]}'.

Auth: {spec["auth_method"]}
Endpoints: {json.dumps(endpoints)}

The connector MUST include:
1. Authentication handling ({spec["auth_method"]}) with token refresh
2. Pagination (cursor-based and offset-based)
3. Rate limiting with exponential backoff
4. Error retry with configurable max attempts and jitter
5. Schema mapping to OCSF format

Return JSON:
{{
  "class_name": "PascalCase connector class",
  "module_name": "snake_case module filename",
  "code": "full Python source",
  "config_schema": {{"required_fields": [], "optional_fields": []}},
  "ocsf_mappings": {{"source_field": "ocsf_field"}},
  "test_stub": "pytest stub code"
}}"""


def generate_connector(spec):
    """Use LLM to generate connector code from a spec."""
    mon.time("llm_generation")
    return llm.extract_json(build_generation_prompt(spec))

# COMMAND ----------

# MAGIC %md
# MAGIC ## Validation

# COMMAND ----------

def validate_generated_code(result):
    """Validate the LLM output contains required components."""
    required_keys = ["class_name", "module_name", "code", "config_schema", "ocsf_mappings"]
    missing = [k for k in required_keys if k not in result]
    if missing:
        return False, f"Missing keys: {missing}"

    code = result.get("code", "")
    required_methods = ["def authenticate", "def paginate", "def fetch"]
    missing_methods = [m for m in required_methods if m not in code]
    if missing_methods:
        return False, f"Missing methods: {missing_methods}"

    return True, "valid"

# COMMAND ----------

# MAGIC %md
# MAGIC ## Process Requests

# COMMAND ----------

def process_requests(requests):
    """Generate connectors for all pending requests."""
    results = []
    for spec in requests:
        request_id = spec["request_id"]
        mon.log_event(event_type="generation_started", request_id=request_id)
        try:
            generation = generate_connector(spec)
            is_valid, msg = validate_generated_code(generation)
            results.append({
                "connector_id": hashlib.sha256(
                    f"{request_id}:{datetime.utcnow().isoformat()}".encode()).hexdigest()[:16],
                "request_id": request_id,
                "source_type": spec["source_type"],
                "auth_method": spec["auth_method"],
                "class_name": generation.get("class_name", ""),
                "module_name": generation.get("module_name", ""),
                "generated_code": generation.get("code", ""),
                "config_schema": json.dumps(generation.get("config_schema", {})),
                "ocsf_mappings": json.dumps(generation.get("ocsf_mappings", {})),
                "test_stub": generation.get("test_stub", ""),
                "is_valid": is_valid,
                "validation_message": msg,
                "status": "ready_for_review" if is_valid else "generation_failed",
                "generated_at": datetime.utcnow().isoformat()
            })
            mon.log_event(event_type="generation_complete",
                          request_id=request_id, valid=is_valid)
        except Exception as e:
            results.append({
                "connector_id": hashlib.sha256(f"{request_id}:err".encode()).hexdigest()[:16],
                "request_id": request_id,
                "source_type": spec["source_type"],
                "auth_method": spec["auth_method"],
                "class_name": "", "module_name": "",
                "generated_code": "", "config_schema": "{}",
                "ocsf_mappings": "{}", "test_stub": "",
                "is_valid": False, "validation_message": str(e),
                "status": "generation_error",
                "generated_at": datetime.utcnow().isoformat()
            })
            mon.log_event(event_type="generation_error",
                          request_id=request_id, error=str(e))
    return results

# COMMAND ----------

# MAGIC %md
# MAGIC ## Persist and Update Status

# COMMAND ----------

def persist_generated(results):
    """Write generated connectors to review table."""
    if not results:
        return 0
    spark.createDataFrame(results).write.mode("append").saveAsTable(generated_table)
    return len(results)


def update_request_status(results):
    """Mark processed requests as complete."""
    if not results:
        return
    processed_ids = [r["request_id"] for r in results]
    requests_df = spark.read.table(requests_table)
    updated_df = requests_df.withColumn(
        "status",
        F.when(F.col("request_id").isin(processed_ids),
               F.lit("processed")).otherwise(F.col("status"))
    )
    updated_df.write.mode("overwrite").saveAsTable(requests_table)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Execute Agent

# COMMAND ----------

mon.time("agent_start")

pending = spark.read.table(requests_table).filter(F.col("status") == "pending").collect()

if not pending:
    summary = {
        "agent_id": AGENT_ID, "agent_name": AGENT_NAME,
        "requests_processed": 0, "connectors_generated": 0,
        "valid_connectors": 0, "status": "no_pending_requests"
    }
    mon.log_complete(summary)
    dbutils.notebook.exit(json.dumps(summary))

results = process_requests(pending)
written = persist_generated(results)
update_request_status(results)

summary = {
    "agent_id": AGENT_ID,
    "agent_name": AGENT_NAME,
    "requests_processed": len(pending),
    "connectors_generated": written,
    "valid_connectors": sum(1 for r in results if r["is_valid"]),
    "failed_generations": sum(1 for r in results if not r["is_valid"]),
    "status": "success"
}

mon.log_complete(summary)
dbutils.notebook.exit(json.dumps(summary))
