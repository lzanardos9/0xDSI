# Databricks notebook source
# MAGIC %md
# MAGIC # Agent 25 - Active Learning from Human Feedback
# MAGIC Mosaic AI Agent Framework BatchAgent.
# MAGIC Improves agent accuracy over time by learning from analyst feedback.
# MAGIC Reads analyst feedback (triage corrections, FP/TP labels), identifies patterns.
# MAGIC Generates updated classification rules, writes to `alhf_feedback_patterns`.

# COMMAND ----------

# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

require_enabled("alhf_learning")

# COMMAND ----------

import json
import time
from datetime import datetime, timezone, timedelta
from pyspark.sql import functions as F
from collections import defaultdict

from agent_framework import BatchAgent, AgentResult, AgentStatus

# COMMAND ----------

class ALHFLearningAgent(BatchAgent):
    """
    Batch agent that learns from analyst feedback to improve detection and classification.
    - Reads analyst feedback (triage corrections, FP/TP labels)
    - Identifies patterns in analyst overrides
    - Generates updated classification rules
    - Writes to alhf_feedback_patterns table
    """

    def execute(self) -> AgentResult:
        """Execute active learning from human feedback."""
        try:
            feedback_table = get_table_path(cfg, "analyst_feedback")
            classifications_table = get_table_path(cfg, "alert_classifications")
            output_table = get_table_path(cfg, "alhf_feedback_patterns")

            # Fetch recent analyst feedback (last 24 hours)
            cutoff_time = datetime.now(timezone.utc) - timedelta(hours=24)

            feedback_df = (
                spark.read.table(feedback_table)
                .filter(F.col("feedback_timestamp") >= cutoff_time.isoformat())
                .filter(F.col("feedback_type").isin(["fp_override", "tp_override", "triage_correction"]))
            )

            feedback_records = feedback_df.collect()

            if len(feedback_records) == 0:
                return AgentResult(
                    status=AgentStatus.SKIPPED,
                    agent_name=self.agent_name,
                    details={"reason": "no_feedback_records"}
                )

            patterns = []
            error_count = 0

            # Group feedback by original classification
            feedback_by_classification = defaultdict(list)
            for record in feedback_records:
                original = record.get("original_classification", "unknown")
                feedback_by_classification[original].append(record)

            # Analyze each classification pattern
            for original_classification, records in feedback_by_classification.items():
                try:
                    pattern = self._analyze_feedback_pattern(
                        original_classification, records
                    )
                    if pattern:
                        patterns.append(pattern)

                except Exception as e:
                    error_count += 1
                    logger.warning(f"Pattern analysis failed: {str(e)[:200]}")
                    continue

            # Write patterns to output table
            if patterns:
                patterns_df = spark.createDataFrame(patterns)
                safe_append(patterns_df, output_table)

                # Log to MLflow
                if self._tracer:
                    with self._tracer.start_run(run_name=f"{self.agent_name}_{int(time.time())}"):
                        self._tracer.log_metrics({
                            "feedback_records_processed": len(feedback_records),
                            "patterns_identified": len(patterns),
                            "overrides_total": len([r for r in feedback_records if r.get("override_confidence", 0) > 0.8]),
                        })
                        self._tracer.log_params({
                            "agent_name": self.agent_name,
                            "lookback_hours": 24,
                        })

            return AgentResult(
                status=AgentStatus.COMPLETED,
                agent_name=self.agent_name,
                processed_count=len(feedback_records),
                error_count=error_count,
                details={
                    "feedback_records_processed": len(feedback_records),
                    "patterns_identified": len(patterns),
                    "classifications_reviewed": len(feedback_by_classification),
                }
            )

        except Exception as e:
            return AgentResult(
                status=AgentStatus.FAILED,
                agent_name=self.agent_name,
                error=str(e)[:500]
            )

    def _analyze_feedback_pattern(
        self, original_classification: str, records: list
    ) -> dict:
        """Analyze pattern in analyst feedback for a classification."""
        try:
            if len(records) < 3:
                return None

            # Count correction directions
            corrections = defaultdict(int)
            override_reasons = []
            feature_mentions = []

            for record in records:
                corrected = record.get("corrected_classification")
                if corrected:
                    corrections[corrected] += 1

                reason = record.get("override_reason", "")
                if reason:
                    override_reasons.append(reason)

                # Extract feature mentions from feedback
                features = record.get("relevant_features", [])
                if features:
                    feature_mentions.extend(features)

            # Find dominant correction pattern
            dominant_correction = max(corrections, key=corrections.get) if corrections else None
            correction_frequency = max(corrections.values()) if corrections else 0

            if correction_frequency < 2:
                return None

            # Generate rule suggestion using LLM
            rule_suggestion = self._generate_rule_from_feedback(
                original_classification, dominant_correction, override_reasons, feature_mentions
            )

            pattern = {
                "pattern_type": "classification_override",
                "original_classification": original_classification,
                "corrected_classification": dominant_correction,
                "frequency": int(correction_frequency),
                "total_samples": len(records),
                "frequency_rate": float(correction_frequency / len(records)),
                "confidence": min(1.0, float(correction_frequency / len(records))),
                "new_rule": rule_suggestion,
                "identified_at": datetime.now(timezone.utc).isoformat(),
                "common_reasons": json.dumps(
                    list(set(override_reasons[:5]))
                ),
                "relevant_features": json.dumps(
                    list(set(feature_mentions[:10]))
                ),
            }

            return pattern

        except Exception as e:
            logger.warning(f"Pattern analysis error: {str(e)[:200]}")
            return None

    def _generate_rule_from_feedback(
        self, original: str, corrected: str, reasons: list, features: list
    ) -> str:
        """Use LLM to generate an updated classification rule."""
        try:
            system_prompt = """You are a detection rule tuner. Based on analyst feedback patterns,
suggest improved classification rules in JSON format.

Generate a single JSON object with:
- condition: boolean expression for when to apply this rule
- action: the classification to apply
- priority: 1-10 (higher = check this first)
- description: brief explanation

Keep conditions simple and precise."""

            reason_summary = " ".join(reasons[:3]) if reasons else "pattern recognized"
            feature_str = ", ".join(features[:5]) if features else "various signals"

            user_msg = f"""Analysts repeatedly corrected '{original}' to '{corrected}'.

Key feedback:
- Reasons: {reason_summary}
- Relevant features: {feature_str}
- Pattern frequency: high confidence

Suggest a new classification rule to catch this pattern automatically."""

            result = self.llm_classify(
                system=system_prompt,
                user=user_msg,
                json_mode=True,
                temperature=0.2
            )

            rule_json = json.dumps({
                "condition": result.get("condition", ""),
                "action": corrected,
                "priority": result.get("priority", 5),
                "description": result.get("description", f"Auto-generated from {original} → {corrected} feedback")
            })

            return rule_json

        except Exception as e:
            logger.warning(f"Rule generation failed: {str(e)[:200]}")
            return json.dumps({
                "condition": "true",
                "action": corrected,
                "priority": 5,
                "description": f"Fallback rule: {original} → {corrected}"
            })

# COMMAND ----------

# Initialize and run the agent
import logging
logger = logging.getLogger("oxdsi.alhf_learning")

try:
    mon.log_event("alhf_learning_start", {"agent": "alhf_learning"})

    agent = ALHFLearningAgent(
        agent_name="alhf_learning",
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
    mon.log_error(e, context="alhf_learning_execution")
    raise
