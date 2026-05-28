# Databricks notebook source
# MAGIC %md
# MAGIC # Agent 20 - LLM Security Guardrails Monitor
# MAGIC Mosaic AI Agent Framework BatchAgent.
# MAGIC Monitors LLM usage for policy violations (prompt injection, PII leakage, jailbreak attempts).
# MAGIC Reads from `llm_usage_logs` table, classifies violations, writes to `llm_guardrail_violations`.

# COMMAND ----------

# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

require_enabled("llm_guardrails")

# COMMAND ----------

import json
import re
import time
from datetime import datetime, timezone, timedelta
from pyspark.sql import functions as F

from agent_framework import BatchAgent, AgentResult, AgentStatus, create_soc_tools

# COMMAND ----------

class LLMGuardrailsAgent(BatchAgent):
    """
    Batch agent that monitors LLM interactions for policy violations.
    - Reads from llm_usage_logs table (unscanned entries)
    - Classifies: prompt injection, PII leakage, jailbreak attempts, policy violations
    - Uses LLM with constrained JSON output for classification
    - Writes to llm_guardrail_violations table
    """

    def execute(self) -> AgentResult:
        """Execute guardrail scanning on recent LLM interactions."""
        try:
            # Fetch unscanned interactions from past 30 minutes
            cutoff_time = datetime.now(timezone.utc) - timedelta(minutes=30)
            interactions_table = get_table_path(cfg, "llm_usage_logs")

            interactions_df = (
                spark.read.table(interactions_table)
                .filter(F.col("timestamp") >= cutoff_time.isoformat())
                .filter(F.col("guardrail_scanned").isNull() | (F.col("guardrail_scanned") == False))
            )
            interactions = interactions_df.collect()
            interaction_count = len(interactions)

            if interaction_count == 0:
                return AgentResult(
                    status=AgentStatus.SKIPPED,
                    agent_name=self.agent_name,
                    processed_count=0,
                    details={"reason": "no_unscanned_interactions"}
                )

            violations = []
            error_count = 0

            # Process each interaction through LLM classification
            for interaction in interactions:
                try:
                    interaction_id = interaction["interaction_id"]
                    user_input = interaction.get("user_input", "") or ""
                    model_output = interaction.get("model_output", "") or ""

                    # Use LLM to classify the interaction
                    system_prompt = """You are a security classifier for LLM interactions.
Analyze the user input and model output for security violations.
Classify each interaction as JSON with:
- violation_type: "prompt_injection" | "pii_leakage" | "jailbreak" | "policy_violation" | "none"
- severity: "critical" | "high" | "medium" | "low" | "none"
- confidence: 0.0-1.0
- evidence: brief explanation
Respond ONLY with valid JSON, no markdown."""

                    user_msg = f"""Analyze this LLM interaction for security violations:

USER INPUT:
{user_input[:500]}

MODEL OUTPUT:
{model_output[:500]}"""

                    classification = self.llm_classify(
                        system=system_prompt,
                        user=user_msg,
                        json_mode=True,
                        temperature=0.1
                    )

                    # Extract classification result
                    violation_type = classification.get("violation_type", "none")
                    severity = classification.get("severity", "none")
                    evidence = classification.get("evidence", "")

                    if violation_type != "none":
                        violation = {
                            "interaction_id": interaction_id,
                            "violation_type": violation_type,
                            "severity": severity,
                            "confidence": classification.get("confidence", 0.0),
                            "evidence": evidence,
                            "blocked": severity in ("critical", "high"),
                            "detected_at": datetime.now(timezone.utc).isoformat(),
                        }
                        violations.append(violation)

                except Exception as e:
                    error_count += 1
                    logger.warning(f"Classification failed for interaction {interaction.get('interaction_id')}: {str(e)[:200]}")
                    continue

            # Write violations to output table
            if violations:
                violations_table = get_table_path(cfg, "llm_guardrail_violations")
                violations_df = spark.createDataFrame(violations)
                safe_append(violations_df, violations_table)

                # Log to MLflow
                if self._tracer:
                    with self._tracer.start_run(run_name=f"{self.agent_name}_{int(time.time())}"):
                        self._tracer.log_metrics({
                            "violations_detected": len(violations),
                            "blocked_count": sum(1 for v in violations if v["blocked"]),
                        })
                        self._tracer.log_params({
                            "agent_name": self.agent_name,
                            "scan_window_minutes": 30,
                        })

            # Mark interactions as scanned
            scanned_ids = [iid for iid in [r["interaction_id"] for r in interactions]]
            if scanned_ids:
                scanned_df = spark.createDataFrame(
                    [{"interaction_id": iid, "guardrail_scanned": True} for iid in scanned_ids]
                )
                scanned_df.createOrReplaceTempView("scanned_updates")
                spark.sql(f"""
                    MERGE INTO {interactions_table} AS target
                    USING scanned_updates AS source
                    ON target.interaction_id = source.interaction_id
                    WHEN MATCHED THEN UPDATE SET target.guardrail_scanned = source.guardrail_scanned
                """)

            return AgentResult(
                status=AgentStatus.COMPLETED,
                agent_name=self.agent_name,
                processed_count=interaction_count,
                error_count=error_count,
                details={
                    "violations_found": len(violations),
                    "blocked": sum(1 for v in violations if v["blocked"]),
                    "by_type": {
                        "prompt_injection": sum(1 for v in violations if v["violation_type"] == "prompt_injection"),
                        "pii_leakage": sum(1 for v in violations if v["violation_type"] == "pii_leakage"),
                        "jailbreak": sum(1 for v in violations if v["violation_type"] == "jailbreak"),
                        "policy_violation": sum(1 for v in violations if v["violation_type"] == "policy_violation"),
                    }
                }
            )

        except Exception as e:
            return AgentResult(
                status=AgentStatus.FAILED,
                agent_name=self.agent_name,
                error=str(e)[:500]
            )

# COMMAND ----------

# Initialize and run the agent
import logging
logger = logging.getLogger("oxdsi.llm_guardrails")

try:
    mon.log_event("llm_guardrails_start", {"agent": "llm_guardrails"})

    agent = LLMGuardrailsAgent(
        agent_name="llm_guardrails",
        cfg=cfg,
        llm=llm,
        mon=mon,
        spark=spark
    )

    result = agent.run()
    mon.log_complete(result.details)
    print(result.to_json())
    dbutils.notebook.exit(result.to_json())

except Exception as e:
    mon.log_error(e, context="llm_guardrails_execution")
    raise
