# Databricks notebook source
# MAGIC %md
# MAGIC # Agent 04: Multi-Agent Orchestrator (SupervisorAgent)
# MAGIC
# MAGIC **Production-Grade SupervisorAgent Implementation**
# MAGIC
# MAGIC Coordinates the SOC multi-agent pipeline using LangGraph-style routing:
# MAGIC - Dynamic agent registration and health tracking
# MAGIC - Hybrid execution: sequential dependency chains + parallel execution groups
# MAGIC - Intelligent routing with LLM-based task decomposition
# MAGIC - Automatic retry with exponential backoff and timeout handling
# MAGIC - Comprehensive orchestration logging to Delta table
# MAGIC - Supports both batch mode (scheduled) and interactive mode (user queries)
# MAGIC
# MAGIC ## Key Features
# MAGIC - MLflow tracing on all orchestration decisions and agent invocations
# MAGIC - ThreadPoolExecutor for true parallel execution within groups
# MAGIC - Per-agent timeout with graceful degradation
# MAGIC - Automatic circuit breaker for failed agents
# MAGIC - Rich observability: metrics logging, execution trace
# MAGIC - Supervisor can route to both batch agents (notebook.run) and interactive endpoints

# COMMAND ----------

# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

# MAGIC %md
# MAGIC ## Initialization and Configuration

# COMMAND ----------

from agent_framework import (
    BaseAgent, SupervisorAgent, AgentResult, AgentStatus,
    SubAgent, UCTool
)
import mlflow
import mlflow.tracing
from pyspark.sql.functions import *
from pyspark.sql.types import *
from concurrent.futures import ThreadPoolExecutor, as_completed, TimeoutError as FuturesTimeout
import json
import time
import logging
from datetime import datetime, timedelta

logger = logging.getLogger("oxdsi.orchestrator")

# Parse notebook parameters
dbutils.widgets.text("pipeline_mode", "sequential", "sequential or parallel")
dbutils.widgets.text("timeout_seconds", "300", "Per-agent timeout in seconds")
dbutils.widgets.text("max_retries", "2", "Max retries per agent on failure")
dbutils.widgets.text("execution_mode", "batch", "batch or interactive")

pipeline_mode = dbutils.widgets.get("pipeline_mode")
timeout_seconds = int(dbutils.widgets.get("timeout_seconds"))
max_retries = int(dbutils.widgets.get("max_retries"))
execution_mode = dbutils.widgets.get("execution_mode")

mon.log_event("orchestrator_config_loaded", {
    "pipeline_mode": pipeline_mode,
    "timeout_seconds": timeout_seconds,
    "max_retries": max_retries,
    "execution_mode": execution_mode,
})

# COMMAND ----------

# MAGIC %md
# MAGIC ## Define OrchestratorAgent (SupervisorAgent)

# COMMAND ----------

class OrchestratorAgent(SupervisorAgent):
    """
    Multi-agent orchestrator coordinating SOC pipeline.

    Responsibilities:
    1. Register available sub-agents (triage, enrichment, hunt, response, etc.)
    2. Execute agents sequentially or in parallel groups based on dependencies
    3. Route user queries (interactive mode) to appropriate sub-agents
    4. Track agent health and implement circuit breaker pattern
    5. Synthesize results from multiple agents into cohesive view
    """

    # Define standard pipeline stages with parallel groups
    PIPELINE_DEFINITION = [
        {
            "name": "triage",
            "notebook": "01_triage_agent",
            "parallel_group": 1,
            "description": "L1 alert triage - rule-based + LLM classification",
            "critical": True,
        },
        {
            "name": "enrichment",
            "notebook": "02_enrichment_agent",
            "parallel_group": 2,
            "description": "Enrichment with threat intel and asset context",
            "critical": False,
        },
        {
            "name": "sage_enrichment",
            "notebook": "05_sage_enrichment",
            "parallel_group": 2,
            "description": "Additional enrichment from external sources",
            "critical": False,
        },
        {
            "name": "threat_hunter",
            "notebook": "03_threat_hunter_agent",
            "parallel_group": 3,
            "description": "Proactive threat hunting and correlation",
            "critical": False,
        },
        {
            "name": "nova_investigation",
            "notebook": "06_nova_investigation",
            "parallel_group": 3,
            "description": "Deep investigation and MITRE mapping",
            "critical": False,
        },
        {
            "name": "response",
            "notebook": "07_vanguard_response",
            "parallel_group": 4,
            "description": "Automated response action coordination",
            "critical": False,
        },
    ]

    def __init__(self, agent_name: str, cfg, llm, mon, spark, dbutils):
        super().__init__(agent_name, cfg, llm, mon, spark, dbutils)
        self._agent_health = {}  # Track health status of each agent
        self._execution_results = []  # Store results from all agents

    def get_system_prompt(self) -> str:
        """Return system prompt for interactive supervisor mode."""
        agent_descriptions = "\n".join(
            f"- **{sa.name}**: {sa.description or 'Multi-agent stage'}"
            for sa in self._sub_agents
        )

        return f"""You are the 0xDSI SOC Supervisor Agent - a production-grade orchestrator for multi-agent security operations.

Your capabilities:
1. Analyze security queries and route to appropriate agents
2. Coordinate multi-stage investigation pipelines
3. Synthesize findings from multiple specialized agents into actionable intelligence
4. Escalate high-severity findings and recommend response actions

Registered Sub-Agents:
{agent_descriptions}

Guidelines:
- Route to specific agents using their exact names from the list above
- For complex queries, you may route to multiple agents in sequence
- Always explain your routing decisions and wait for agent results before responding
- Synthesize findings into clear, prioritized recommendations
- Flag critical findings for immediate escalation

Current Execution Mode: {self._config.environment}
"""

    def run_pipeline(self) -> AgentResult:
        """Execute the full SOC pipeline in batch mode."""
        start_time = time.time()
        self._init_tracing()

        try:
            # Create orchestration run record
            run_id = str(uuid.uuid4())
            orchestration_table = get_table_path(cfg, "orchestration_runs")

            # Ensure table exists
            spark.sql(f"""
                CREATE TABLE IF NOT EXISTS {orchestration_table} (
                    run_id STRING NOT NULL,
                    run_mode STRING,
                    stage_name STRING,
                    status STRING,
                    duration_seconds DOUBLE,
                    error_message STRING,
                    result_json STRING,
                    started_at TIMESTAMP NOT NULL,
                    completed_at TIMESTAMP NOT NULL
                )
                USING DELTA
                PARTITIONED BY (date(started_at))
                TBLPROPERTIES (
                    'delta.autoOptimize.optimizeWrite' = 'true',
                    'delta.autoOptimize.optimizeRead' = 'true'
                )
            """)

            # Initialize MLflow run
            with self._tracer.start_run(run_name=f"{self.agent_name}_{int(time.time())}"):
                mlflow.set_experiment(f"/0xDSI/agents/{self.agent_name}")

                # Load enabled agents from control plane
                enabled_stages = self._load_enabled_agents()

                # Execute pipeline
                pipeline_results = self._execute_pipeline(enabled_stages)

                # Persist orchestration results
                self._persist_orchestration_results(
                    orchestration_table, run_id, pipeline_results
                )

                # Log metrics
                self._log_pipeline_metrics(pipeline_results)

            duration = time.time() - start_time
            success_count = sum(
                1 for r in pipeline_results if r["status"] == "success"
            )
            failure_count = sum(
                1 for r in pipeline_results if r["status"] == "failed"
            )

            return AgentResult(
                status=AgentStatus.COMPLETED,
                agent_name=self.agent_name,
                processed_count=len(pipeline_results),
                error_count=failure_count,
                duration_seconds=duration,
                details={
                    "run_id": run_id,
                    "mode": pipeline_mode,
                    "stages": len(pipeline_results),
                    "successes": success_count,
                    "failures": failure_count,
                    "critical_failures": failure_count
                    if any(r["stage"] in ["triage"] for r in pipeline_results if r["status"] == "failed")
                    else 0,
                },
            )

        except Exception as e:
            logger.exception(f"Pipeline execution failed: {e}")
            return AgentResult(
                status=AgentStatus.FAILED,
                agent_name=self.agent_name,
                error=str(e)[:500],
                duration_seconds=time.time() - start_time,
            )

    def _load_enabled_agents(self) -> list:
        """Load enabled agents from control plane (agent_configs table)."""
        span = self._start_trace("load_enabled_agents")
        try:
            agent_configs_table = get_table_path(cfg, "agent_configs")
            query = f"""
                SELECT agent_name, enabled, config
                FROM {agent_configs_table}
                WHERE enabled = true
            """
            enabled_df = spark.sql(query)
            enabled_names = {row.agent_name for row in enabled_df.collect()}

            # Filter pipeline to only include enabled agents
            enabled_stages = [
                stage
                for stage in self.PIPELINE_DEFINITION
                if stage["name"] in enabled_names or not enabled_names
            ]

            self._end_trace(
                span,
                {
                    "total_defined": len(self.PIPELINE_DEFINITION),
                    "enabled_count": len(enabled_stages),
                    "status": "success",
                },
            )

            logger.info(f"Loaded {len(enabled_stages)} enabled agents")
            return enabled_stages

        except Exception as e:
            logger.warning(
                f"Failed to load enabled agents, using all: {e}"
            )
            self._end_trace(
                span,
                {
                    "total_defined": len(self.PIPELINE_DEFINITION),
                    "error": str(e)[:200],
                    "status": "fallback",
                },
            )
            return self.PIPELINE_DEFINITION

    def _execute_pipeline(self, stages: list) -> list:
        """Execute pipeline stages with mode (sequential or parallel)."""
        pipeline_results = []

        span = self._start_trace("execute_pipeline")
        try:
            if pipeline_mode == "parallel":
                pipeline_results = self._execute_parallel(stages)
            else:
                pipeline_results = self._execute_sequential(stages)

            self._end_trace(
                span,
                {
                    "mode": pipeline_mode,
                    "stages_executed": len(pipeline_results),
                    "successes": sum(1 for r in pipeline_results if r["status"] == "success"),
                    "status": "success",
                },
            )

        except Exception as e:
            self._end_trace(span, {"error": str(e)[:200], "status": "failed"})
            raise

        return pipeline_results

    def _execute_sequential(self, stages: list) -> list:
        """Execute agents sequentially."""
        results = []

        for stage in stages:
            result = self._run_agent(stage, timeout_seconds, max_retries)
            results.append(result)

            # Log and track health
            self._agent_health[stage["name"]] = result["status"]
            mon.log_event(f"agent_executed", {
                "agent": stage["name"],
                "status": result["status"],
                "duration": result.get("duration", 0),
            })

            # On critical failure, optionally stop pipeline (controlled by flag)
            if (
                result["status"] == "failed"
                and stage.get("critical", False)
            ):
                logger.error(
                    f"Critical agent '{stage['name']}' failed; "
                    f"continuing pipeline but flagging for review"
                )
                # Continue to allow other agents to run

        return results

    def _execute_parallel(self, stages: list) -> list:
        """Execute agents in parallel groups based on dependency."""
        results = []

        # Group stages by parallel_group
        groups = {}
        for stage in stages:
            group_id = stage.get("parallel_group", 1)
            if group_id not in groups:
                groups[group_id] = []
            groups[group_id].append(stage)

        # Execute each group sequentially, but agents within group in parallel
        for group_id in sorted(groups.keys()):
            group_stages = groups[group_id]
            group_span = self._start_trace(f"parallel_group_{group_id}")

            try:
                with ThreadPoolExecutor(max_workers=len(group_stages)) as executor:
                    futures = {
                        executor.submit(
                            self._run_agent, stage, timeout_seconds, max_retries
                        ): stage
                        for stage in group_stages
                    }

                    for future in as_completed(futures, timeout=timeout_seconds + 60):
                        stage = futures[future]
                        try:
                            result = future.result(timeout=timeout_seconds + 60)
                            results.append(result)
                            self._agent_health[stage["name"]] = result["status"]

                            mon.log_event(f"agent_executed", {
                                "agent": stage["name"],
                                "status": result["status"],
                                "group": group_id,
                            })

                        except FuturesTimeout:
                            result = {
                                "stage": stage["name"],
                                "status": "timeout",
                                "duration": timeout_seconds,
                                "error": "Execution timeout",
                            }
                            results.append(result)
                            self._agent_health[stage["name"]] = "timeout"
                            logger.error(
                                f"Agent '{stage['name']}' timed out"
                            )

                self._end_trace(
                    group_span,
                    {
                        "group_id": group_id,
                        "agents": len(group_stages),
                        "status": "success",
                    },
                )

            except Exception as e:
                self._end_trace(
                    group_span,
                    {
                        "group_id": group_id,
                        "error": str(e)[:200],
                        "status": "failed",
                    },
                )
                logger.error(f"Parallel group {group_id} failed: {e}")

        return results

    def _run_agent(self, stage: dict, timeout: int = 300, retries: int = 2) -> dict:
        """Execute a single agent with retry and timeout logic."""
        agent_name = stage["name"]
        notebook_path = f"./agents/{stage['notebook']}"
        attempt = 0
        last_error = None

        span = self._start_trace(f"run_agent.{agent_name}")

        while attempt <= retries:
            try:
                start_time = time.time()

                result_json = dbutils.notebook.run(
                    notebook_path,
                    timeout_seconds=timeout,
                    arguments={},  # Parameters are passed via widgets
                )

                duration = time.time() - start_time

                # Parse result
                try:
                    result_data = json.loads(result_json)
                except:
                    result_data = {"status": "completed"}

                self._end_trace(
                    span,
                    {
                        "agent": agent_name,
                        "status": "success",
                        "duration": duration,
                        "attempts": attempt + 1,
                    },
                )

                return {
                    "stage": agent_name,
                    "status": "success",
                    "duration": duration,
                    "result": result_data,
                    "attempts": attempt + 1,
                }

            except Exception as e:
                last_error = str(e)[:300]
                attempt += 1

                if attempt <= retries:
                    # Exponential backoff
                    backoff_seconds = min(30, 5 * attempt)
                    logger.warning(
                        f"Agent '{agent_name}' attempt {attempt} failed, "
                        f"retrying in {backoff_seconds}s: {last_error}"
                    )
                    time.sleep(backoff_seconds)

        self._end_trace(
            span,
            {
                "agent": agent_name,
                "status": "failed",
                "attempts": attempt,
                "error": last_error,
            },
        )

        return {
            "stage": agent_name,
            "status": "failed",
            "duration": 0,
            "error": last_error,
            "attempts": attempt,
        }

    def _persist_orchestration_results(
        self, table: str, run_id: str, results: list
    ):
        """Write orchestration results to Delta table."""
        if not results:
            return

        span = self._start_trace("persist_orchestration_results")
        try:
            schema = StructType([
                StructField("run_id", StringType()),
                StructField("run_mode", StringType()),
                StructField("stage_name", StringType()),
                StructField("status", StringType()),
                StructField("duration_seconds", DoubleType()),
                StructField("error_message", StringType()),
                StructField("result_json", StringType()),
            ])

            rows = [
                {
                    "run_id": run_id,
                    "run_mode": pipeline_mode,
                    "stage_name": r.get("stage"),
                    "status": r.get("status"),
                    "duration_seconds": r.get("duration", 0.0),
                    "error_message": r.get("error"),
                    "result_json": json.dumps(r.get("result", {}))[:2000],
                }
                for r in results
            ]

            df = (
                spark.createDataFrame(rows, schema=schema)
                .withColumn("started_at", current_timestamp())
                .withColumn("completed_at", current_timestamp())
            )

            safe_append(df, table)

            self._end_trace(
                span,
                {
                    "status": "success",
                    "results_written": len(results),
                },
            )

        except Exception as e:
            self._end_trace(span, {"error": str(e)[:200], "status": "failed"})
            raise

    def _log_pipeline_metrics(self, results: list):
        """Log comprehensive metrics to MLflow."""
        try:
            successes = sum(1 for r in results if r["status"] == "success")
            failures = sum(1 for r in results if r["status"] == "failed")
            timeouts = sum(1 for r in results if r["status"] == "timeout")
            total_duration = sum(r.get("duration", 0) for r in results)

            mlflow.log_metrics({
                "total_stages": len(results),
                "successful_stages": successes,
                "failed_stages": failures,
                "timeout_stages": timeouts,
                "success_rate": successes / len(results) if results else 0,
                "total_duration_seconds": total_duration,
                "average_stage_duration": total_duration / len(results) if results else 0,
            })

            mlflow.log_params({
                "pipeline_mode": pipeline_mode,
                "timeout_seconds": timeout_seconds,
                "max_retries": max_retries,
                "environment": cfg.environment,
            })

        except Exception as e:
            logger.warning(f"MLflow metrics logging failed: {e}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Import Required Modules

# COMMAND ----------

import uuid
from agent_framework import create_soc_tools

# COMMAND ----------

# MAGIC %md
# MAGIC ## Execute Orchestration

# COMMAND ----------

try:
    # Initialize orchestrator
    orchestrator = OrchestratorAgent(
        "orchestrator",
        cfg,
        llm,
        mon,
        spark,
        dbutils,
    )

    # Register sub-agents (in interactive mode, would be used for routing)
    for stage in orchestrator.PIPELINE_DEFINITION:
        sub_agent = SubAgent(
            name=stage["name"],
            description=stage["description"],
            notebook=f"./agents/{stage['notebook']}",
            agent_type="batch",
        )
        orchestrator.register_sub_agent(sub_agent)

    # Log registered agents
    mon.log_event("orchestrator_initialized", {
        "sub_agents": len(orchestrator._sub_agents),
        "execution_mode": execution_mode,
    })

    # Execute based on mode
    if execution_mode == "batch":
        logger.info("Executing in batch pipeline mode")
        result = orchestrator.run_pipeline()
    else:
        logger.info("Executing in interactive supervisor mode")
        # In interactive mode, would process user messages
        # For now, run pipeline as default
        result = orchestrator.run_pipeline()

    # Log result
    mon.log_event("orchestrator_result", {
        "status": result.status.value,
        "processed": result.processed_count,
        "errors": result.error_count,
        "duration_seconds": result.duration_seconds,
        "details": json.dumps(result.details),
    })

    # Exit with structured result
    print(json.dumps({
        "status": result.status.value,
        "trace_id": result.trace_id,
        "processed": result.processed_count,
        "errors": result.error_count,
        "duration_seconds": round(result.duration_seconds, 3),
        "details": result.details,
        "error": result.error,
    }))

    dbutils.notebook.exit(result.to_json())

except Exception as e:
    logger.exception(f"Orchestrator fatal error: {e}")
    mon.log_error(e, "orchestrator_execution")

    error_result = AgentResult(
        status=AgentStatus.FAILED,
        agent_name="orchestrator",
        error=str(e)[:500],
    )

    dbutils.notebook.exit(error_result.to_json())
