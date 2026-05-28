# Databricks notebook source
# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

require_enabled("connector_version_agent")

# COMMAND ----------

# MAGIC %md
# MAGIC # Agent 29 - Connector Version Agent
# MAGIC Monitors connector vendor versions, detects schema changes between versions,
# MAGIC classifies as additive (safe) or breaking, generates LLM evolution patches.

# COMMAND ----------

import json
import hashlib
from datetime import datetime
from pyspark.sql import functions as F

AGENT_NAME = "connector_version_agent"
AGENT_ID = 29
registry_table = cfg.get_table_path("connector_registry")
patches_table = cfg.get_table_path("connector_patches")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Schema Classification

# COMMAND ----------

def compute_field_hash(fields):
    """Deterministic hash of a sorted field list for change detection."""
    return hashlib.sha256("|".join(sorted(fields)).encode()).hexdigest()


def classify_schema_change(old_fields, new_fields):
    """Classify change as additive, breaking, or none."""
    old_set, new_set = set(old_fields), set(new_fields)
    added, removed = list(new_set - old_set), list(old_set - new_set)
    if removed:
        return "breaking", added, removed
    elif added:
        return "additive", added, removed
    return "none", [], []

# COMMAND ----------

# MAGIC %md
# MAGIC ## LLM Patch Generation

# COMMAND ----------

def generate_evolution_patch(connector_name, old_fields, new_fields, added_fields):
    """Use LLM to generate a schema evolution patch for additive changes."""
    prompt = f"""Generate a schema evolution patch for connector '{connector_name}'.
Current fields: {json.dumps(old_fields)}
New fields: {json.dumps(new_fields)}
Added fields: {json.dumps(added_fields)}

Return JSON with: patch_type, columns (list of name/type/nullable/default), migration_hint, backwards_compatible."""
    return llm.extract_json(prompt)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Version Check Engine

# COMMAND ----------

def check_connector_versions():
    """Check active connectors for version updates and classify changes."""
    mon.time("version_check")
    connectors = spark.read.table(registry_table).filter(F.col("status") == "active").collect()
    results = []

    for conn in connectors:
        current_version = conn["current_version"]
        latest_version = conn["latest_available_version"]
        if latest_version == current_version:
            continue

        current_fields = json.loads(conn["schema_fields"])
        latest_fields = json.loads(conn["latest_schema_fields"])
        change_type, added, removed = classify_schema_change(current_fields, latest_fields)

        mon.log_event(event_type="version_update_detected",
                      connector=conn["connector_name"],
                      old_version=current_version, new_version=latest_version)

        result = {
            "connector_name": conn["connector_name"],
            "old_version": current_version,
            "new_version": latest_version,
            "change_type": change_type,
            "added_fields": added,
            "removed_fields": removed,
            "field_hash": compute_field_hash(latest_fields),
            "processed_at": datetime.utcnow().isoformat()
        }

        if change_type == "additive":
            result["patch"] = generate_evolution_patch(
                conn["connector_name"], current_fields, latest_fields, added)
            result["auto_apply"] = True
        elif change_type == "breaking":
            result["patch"] = None
            result["auto_apply"] = False
            result["review_required"] = True

        results.append(result)
    return results

# COMMAND ----------

# MAGIC %md
# MAGIC ## Persist Patches

# COMMAND ----------

def persist_patches(results):
    """Write patch recommendations to connector_patches table."""
    if not results:
        return 0
    rows = [{
        "connector_name": r["connector_name"],
        "old_version": r["old_version"],
        "new_version": r["new_version"],
        "change_type": r["change_type"],
        "added_fields": json.dumps(r["added_fields"]),
        "removed_fields": json.dumps(r["removed_fields"]),
        "patch_payload": json.dumps(r.get("patch")),
        "auto_apply": r.get("auto_apply", False),
        "review_required": r.get("review_required", False),
        "field_hash": r["field_hash"],
        "processed_at": r["processed_at"]
    } for r in results]

    spark.createDataFrame(rows).write.mode("append").saveAsTable(patches_table)
    return len(rows)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Auto-Apply Additive Patches

# COMMAND ----------

def apply_additive_patches(results):
    """Auto-apply additive patches by updating the registry version."""
    applied = 0
    for r in results:
        if not r.get("auto_apply") or r["change_type"] != "additive":
            continue
        registry_df = spark.read.table(registry_table)
        updated_df = registry_df.withColumn(
            "current_version",
            F.when(F.col("connector_name") == r["connector_name"],
                   F.lit(r["new_version"])).otherwise(F.col("current_version"))
        ).withColumn(
            "schema_fields",
            F.when(F.col("connector_name") == r["connector_name"],
                   F.lit(json.dumps(r["added_fields"]))).otherwise(F.col("schema_fields"))
        )
        updated_df.write.mode("overwrite").saveAsTable(registry_table)
        applied += 1
        mon.log_event(event_type="patch_auto_applied",
                      connector=r["connector_name"], new_version=r["new_version"])
    return applied

# COMMAND ----------

# MAGIC %md
# MAGIC ## Execute Agent

# COMMAND ----------

mon.time("agent_start")

results = check_connector_versions()
patches_written = persist_patches(results)
patches_applied = apply_additive_patches(results)

summary = {
    "agent_id": AGENT_ID,
    "agent_name": AGENT_NAME,
    "updates_found": len(results),
    "additive_changes": sum(1 for r in results if r["change_type"] == "additive"),
    "breaking_changes": sum(1 for r in results if r["change_type"] == "breaking"),
    "patches_written": patches_written,
    "patches_auto_applied": patches_applied,
    "status": "success"
}

mon.log_complete(summary)
dbutils.notebook.exit(json.dumps(summary))
