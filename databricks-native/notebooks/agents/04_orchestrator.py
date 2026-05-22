# Databricks notebook source
# MAGIC %md
# MAGIC # Agent 04: Multi-Agent Orchestrator
# MAGIC
# MAGIC Coordinates the SOC agent pipeline: Triage -> Enrichment -> Hunt -> Response.
# MAGIC Manages sequential/parallel execution, timeouts, and health tracking.

# COMMAND ----------

# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

dbutils.widgets.text("pipeline_mode", "sequential", "sequential or parallel")
dbutils.widgets.text("timeout_seconds", "300", "Per-agent timeout")
dbutils.widgets.text("max_retries", "2", "Max retries per agent")

pipeline_mode = dbutils.widgets.get("pipeline_mode")
timeout_seconds = int(dbutils.widgets.get("timeout_seconds"))
max_retries = int(dbutils.widgets.get("max_retries"))

# COMMAND ----------

from pyspark.sql.functions import *
from pyspark.sql.types import *
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeout
import json, time

# COMMAND ----------

# MAGIC %md
# MAGIC ## Pipeline Definition

# COMMAND ----------

PIPELINE_STAGES = [
    {"name": "triage", "notebook": "01_triage_agent", "parallel_group": 1},
    {"name": "enrichment", "notebook": "02_enrichment_agent", "parallel_group": 2},
    {"name": "sage_enrichment", "notebook": "05_sage_enrichment", "parallel_group": 2},
    {"name": "threat_hunter", "notebook": "03_threat_hunter_agent", "parallel_group": 3},
    {"name": "vector_memory", "notebook": "10_vector_memory", "parallel_group": 3},
]

orchestration_table = cfg.get_table_path("orchestration_runs")
spark.sql(f"""
    CREATE TABLE IF NOT EXISTS {orchestration_table} (
        id STRING, run_mode STRING, stage_name STRING,
        status STRING, duration_seconds DOUBLE, error_message STRING,
        result_json STRING, started_at TIMESTAMP, completed_at TIMESTAMP
    ) USING DELTA
    TBLPROPERTIES ('delta.autoOptimize.optimizeWrite' = 'true')
""")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Agent Execution with Timeout and Retry

# COMMAND ----------

def run_agent(stage, timeout=300, retries=2):
    """Execute an agent notebook with timeout and retry logic."""
    notebook_path = f"./agents/{stage['notebook']}"
    attempt = 0
    last_error = None

    while attempt <= retries:
        try:
            start = time.time()
            result = dbutils.notebook.run(
                notebook_path,
                timeout_seconds=timeout,
                arguments={"catalog": cfg.catalog, "schema": cfg.schema}
            )
            duration = time.time() - start
            return {
                "stage": stage["name"],
                "status": "success",
                "duration": duration,
                "result": result,
                "attempts": attempt + 1,
            }
        except Exception as e:
            last_error = str(e)[:300]
            attempt += 1
            if attempt <= retries:
                time.sleep(min(30, 5 * attempt))

    return {
        "stage": stage["name"],
        "status": "failed",
        "duration": 0,
        "error": last_error,
        "attempts": attempt,
    }

# COMMAND ----------

# MAGIC %md
# MAGIC ## Execute Pipeline

# COMMAND ----------

pipeline_results = []

with mon.time("pipeline_execution"):
    if pipeline_mode == "parallel":
        # Group by parallel_group, execute groups sequentially, agents within group in parallel
        groups = {}
        for stage in PIPELINE_STAGES:
            groups.setdefault(stage["parallel_group"], []).append(stage)

        for group_id in sorted(groups.keys()):
            group_stages = groups[group_id]
            with ThreadPoolExecutor(max_workers=len(group_stages)) as executor:
                futures = {
                    executor.submit(run_agent, stage, timeout_seconds, max_retries): stage
                    for stage in group_stages
                }
                for future in futures:
                    try:
                        result = future.result(timeout=timeout_seconds + 60)
                        pipeline_results.append(result)
                    except FuturesTimeout:
                        stage = futures[future]
                        pipeline_results.append({
                            "stage": stage["name"], "status": "timeout",
                            "duration": timeout_seconds, "error": "Execution timeout",
                        })
    else:
        # Sequential execution
        for stage in PIPELINE_STAGES:
            result = run_agent(stage, timeout_seconds, max_retries)
            pipeline_results.append(result)

            if result["status"] == "failed":
                mon.log_event("stage_failed", {"stage": stage["name"], "error": result.get("error")})
                # Continue pipeline - don't block on single failure

# COMMAND ----------

# MAGIC %md
# MAGIC ## Persist Orchestration Results

# COMMAND ----------

if pipeline_results:
    schema = StructType([
        StructField("run_mode", StringType()),
        StructField("stage_name", StringType()),
        StructField("status", StringType()),
        StructField("duration_seconds", DoubleType()),
        StructField("error_message", StringType()),
        StructField("result_json", StringType()),
    ])

    rows = [{
        "run_mode": pipeline_mode,
        "stage_name": r["stage"],
        "status": r["status"],
        "duration_seconds": r.get("duration", 0.0),
        "error_message": r.get("error"),
        "result_json": r.get("result"),
    } for r in pipeline_results]

    df = (
        spark.createDataFrame(rows, schema=schema)
        .withColumn("id", expr("uuid()"))
        .withColumn("started_at", current_timestamp())
        .withColumn("completed_at", current_timestamp())
    )
    df.write.mode("append").saveAsTable(orchestration_table)

# COMMAND ----------

successes = sum(1 for r in pipeline_results if r["status"] == "success")
failures = sum(1 for r in pipeline_results if r["status"] == "failed")

mon.log_complete(details={
    "mode": pipeline_mode,
    "stages": len(PIPELINE_STAGES),
    "successes": successes,
    "failures": failures,
})

result = {"status": "completed", "successes": successes, "failures": failures, "mode": pipeline_mode}
print(json.dumps(result))
dbutils.notebook.exit(json.dumps(result))
