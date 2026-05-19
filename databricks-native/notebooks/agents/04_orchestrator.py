# Databricks notebook source
# MAGIC %md
# MAGIC # Agent: Multi-Agent Orchestrator
# MAGIC Coordinates the pipeline: Triage -> Enrichment -> Hunt -> Response.
# MAGIC Manages handoffs, parallel execution, and consensus decisions.

# COMMAND ----------

dbutils.widgets.text("catalog", "soc_platform", "Catalog")
dbutils.widgets.text("schema", "agentic_soc", "Schema")
dbutils.widgets.text("pattern", "sequential", "Orchestration Pattern (sequential|parallel)")
dbutils.widgets.text("model_endpoint", "databricks-meta-llama-3-1-70b-instruct", "LLM Endpoint")

catalog = dbutils.widgets.get("catalog")
schema = dbutils.widgets.get("schema")
pattern = dbutils.widgets.get("pattern")
model_endpoint = dbutils.widgets.get("model_endpoint")

spark.sql(f"USE CATALOG `{catalog}`")
spark.sql(f"USE SCHEMA `{schema}`")

# COMMAND ----------

import json
import time
from pyspark.sql.functions import *

# COMMAND ----------

# MAGIC %md
# MAGIC ## Agent Pipeline Definition

# COMMAND ----------

AGENT_PIPELINE = {
    "sequential": [
        {"agent": "triage", "notebook": "agents/01_triage_agent", "timeout_seconds": 120},
        {"agent": "enrichment", "notebook": "agents/02_enrichment_agent", "timeout_seconds": 180},
        {"agent": "threat_hunter", "notebook": "agents/03_threat_hunter_agent", "timeout_seconds": 300},
        {"agent": "response", "notebook": "../response/01_automated_response", "timeout_seconds": 60},
        {"agent": "case_mgmt", "notebook": "../response/02_case_management", "timeout_seconds": 60},
    ],
    "parallel": [
        # Stage 1: Triage (sequential gate)
        [{"agent": "triage", "notebook": "agents/01_triage_agent", "timeout_seconds": 120}],
        # Stage 2: Enrichment + Hunting in parallel
        [
            {"agent": "enrichment", "notebook": "agents/02_enrichment_agent", "timeout_seconds": 180},
            {"agent": "threat_hunter", "notebook": "agents/03_threat_hunter_agent", "timeout_seconds": 300},
        ],
        # Stage 3: Response (after both complete)
        [{"agent": "response", "notebook": "../response/01_automated_response", "timeout_seconds": 60}],
    ]
}

# COMMAND ----------

# MAGIC %md
# MAGIC ## Orchestration Engine

# COMMAND ----------

def run_agent_notebook(notebook_path: str, params: dict, timeout: int = 300) -> dict:
    """Run an agent notebook and return results."""
    full_path = f"/Workspace/{{current_path}}/{notebook_path}"
    start_time = time.time()

    try:
        result = dbutils.notebook.run(
            notebook_path,
            timeout_seconds=timeout,
            arguments=params
        )
        elapsed = time.time() - start_time
        return {
            "status": "success",
            "result": result,
            "elapsed_seconds": elapsed,
            "notebook": notebook_path
        }
    except Exception as e:
        elapsed = time.time() - start_time
        return {
            "status": "error",
            "error": str(e)[:500],
            "elapsed_seconds": elapsed,
            "notebook": notebook_path
        }

# COMMAND ----------

# MAGIC %md
# MAGIC ## Execute Pipeline

# COMMAND ----------

base_params = {
    "catalog": catalog,
    "schema": schema,
    "model_endpoint": model_endpoint,
}

orchestration_log = []
pipeline_start = time.time()

if pattern == "sequential":
    stages = AGENT_PIPELINE["sequential"]
    for stage in stages:
        print(f"\n--- Running: {stage['agent']} ---")
        result = run_agent_notebook(
            stage["notebook"],
            base_params,
            stage["timeout_seconds"]
        )
        orchestration_log.append({
            "agent": stage["agent"],
            **result
        })
        print(f"  Status: {result['status']} ({result['elapsed_seconds']:.1f}s)")

        if result["status"] == "error":
            print(f"  ERROR: {result.get('error', 'Unknown')}")
            # Continue pipeline even on error (resilient)

elif pattern == "parallel":
    stages = AGENT_PIPELINE["parallel"]
    for stage_group in stages:
        if len(stage_group) == 1:
            # Single agent - run directly
            stage = stage_group[0]
            print(f"\n--- Running: {stage['agent']} ---")
            result = run_agent_notebook(stage["notebook"], base_params, stage["timeout_seconds"])
            orchestration_log.append({"agent": stage["agent"], **result})
        else:
            # Multiple agents - run via dbutils.notebook.run in parallel
            print(f"\n--- Running parallel: {[s['agent'] for s in stage_group]} ---")
            from concurrent.futures import ThreadPoolExecutor, as_completed

            with ThreadPoolExecutor(max_workers=len(stage_group)) as executor:
                futures = {
                    executor.submit(
                        run_agent_notebook, s["notebook"], base_params, s["timeout_seconds"]
                    ): s for s in stage_group
                }
                for future in as_completed(futures):
                    stage = futures[future]
                    result = future.result()
                    orchestration_log.append({"agent": stage["agent"], **result})
                    print(f"  {stage['agent']}: {result['status']} ({result['elapsed_seconds']:.1f}s)")

pipeline_elapsed = time.time() - pipeline_start

# COMMAND ----------

# MAGIC %md
# MAGIC ## Pipeline Summary

# COMMAND ----------

print(f"\n{'='*60}")
print(f"ORCHESTRATION COMPLETE ({pattern} pattern)")
print(f"Total time: {pipeline_elapsed:.1f}s")
print(f"{'='*60}")

success_count = sum(1 for r in orchestration_log if r["status"] == "success")
error_count = sum(1 for r in orchestration_log if r["status"] == "error")

print(f"Agents run: {len(orchestration_log)}")
print(f"Successful: {success_count}")
print(f"Errors: {error_count}")

for log in orchestration_log:
    status_icon = "OK" if log["status"] == "success" else "FAIL"
    print(f"  [{status_icon}] {log['agent']} - {log['elapsed_seconds']:.1f}s")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Log Orchestration Run

# COMMAND ----------

spark.sql(f"""
    INSERT INTO notebook_runs (id, notebook_path, status, started_at, completed_at, duration_seconds, output)
    VALUES (
        uuid(),
        'agents/04_orchestrator',
        '{"completed" if error_count == 0 else "completed_with_errors"}',
        current_timestamp() - INTERVAL {int(pipeline_elapsed)} SECONDS,
        current_timestamp(),
        {int(pipeline_elapsed)},
        map('pattern', '{pattern}', 'agents_run', '{len(orchestration_log)}',
            'success', '{success_count}', 'errors', '{error_count}')
    )
""")
