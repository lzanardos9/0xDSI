# Databricks notebook source
# MAGIC %md
# MAGIC # Agent 07 - Vanguard (Automated Response)
# MAGIC Evaluates pending response actions, uses LLM to decide between auto-execute,
# MAGIC require-approval, or reject based on confidence thresholds. Generates audit records.

# COMMAND ----------

# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

import json
from datetime import datetime, timezone
from pyspark.sql import functions as F
from pyspark.sql.types import StructType, StructField, StringType, TimestampType, FloatType

# COMMAND ----------

# MAGIC %md
# MAGIC ## Configuration and Thresholds

# COMMAND ----------

AGENT_NAME = "vanguard_response"
AGENT_VERSION = "1.0.0"
BATCH_SIZE = 30

# Confidence thresholds for automated decision-making
THRESHOLD_AUTO_EXECUTE = 0.90
THRESHOLD_APPROVAL_REQUIRED = 0.70
# Below 0.70 => reject

response_actions_table = cfg.get_table_path("response_actions")
audit_log_table = cfg.get_table_path("response_audit_log")
cases_table = cfg.get_table_path("cases")

# COMMAND ----------

spark.sql(f"""
    CREATE TABLE IF NOT EXISTS {audit_log_table} (
        audit_id STRING,
        action_id STRING,
        case_id STRING,
        decision STRING,
        confidence_score FLOAT,
        reasoning STRING,
        action_type STRING,
        decided_by STRING,
        decided_at TIMESTAMP,
        execution_status STRING
    )
""")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Retrieve Pending Response Actions

# COMMAND ----------

def get_pending_actions():
    """Query for response actions awaiting evaluation."""
    with mon.time("query_pending_actions"):
        actions_df = (
            qb()
            .table(response_actions_table)
            .where("status = 'pending'")
            .order_by("priority DESC, created_at ASC")
            .limit(BATCH_SIZE)
            .execute()
        )
        count = actions_df.count()
        mon.log_event("pending_actions_retrieved", {"count": count})
        return actions_df

# COMMAND ----------

# MAGIC %md
# MAGIC ## Gather Context for Decision

# COMMAND ----------

def get_action_context(action_data):
    """Gather additional context for the response action."""
    with mon.time("gather_action_context"):
        case_id = action_data.get("case_id")
        if not case_id:
            return {"case": None}

        case_df = (
            qb()
            .table(cases_table)
            .where("case_id = :case_id", case_id=case_id)
            .execute()
        )

        case_rows = case_df.collect()
        case_info = case_rows[0].asDict() if case_rows else None

        return {"case": case_info}

# COMMAND ----------

# MAGIC %md
# MAGIC ## LLM Decision Engine

# COMMAND ----------

def build_decision_prompt(action_data, context):
    """Construct the LLM prompt for response action evaluation."""
    case_info = context.get("case") or {}

    prompt = f"""You are an automated SOC response engine evaluating whether a proposed
response action should be executed automatically, require human approval, or be rejected.

Proposed Response Action:
- Action ID: {action_data.get('action_id', 'N/A')}
- Action Type: {action_data.get('action_type', 'N/A')}
- Target: {action_data.get('target', 'N/A')}
- Description: {action_data.get('description', 'N/A')}
- Priority: {action_data.get('priority', 'N/A')}
- Proposed By: {action_data.get('proposed_by', 'N/A')}

Associated Case:
- Case ID: {case_info.get('case_id', 'N/A')}
- Severity: {case_info.get('severity', 'N/A')}
- Title: {case_info.get('title', 'N/A')}

Evaluate the action considering:
1. Potential for business disruption
2. Reversibility of the action
3. Severity and certainty of the threat
4. Scope of impact (single host vs. network-wide)

Respond with JSON:
{{
    "decision": "auto_execute" | "require_approval" | "reject",
    "confidence_score": 0.0 to 1.0,
    "reasoning": "Explanation of the decision",
    "risk_assessment": "low" | "medium" | "high" | "critical",
    "reversible": true | false,
    "estimated_impact": "Description of expected impact"
}}"""
    return prompt

# COMMAND ----------

def evaluate_action(action_data, context):
    """Use LLM to evaluate whether a response action should proceed."""
    with mon.time("llm_decision_evaluation"):
        prompt = build_decision_prompt(action_data, context)
        result = llm.extract_json(prompt)

        if not result or "decision" not in result:
            mon.log_event("llm_evaluation_failed", {"action_id": action_data.get("action_id")})
            return None

        # Enforce threshold-based override of LLM decision
        confidence = float(result.get("confidence_score", 0.0))
        if confidence >= THRESHOLD_AUTO_EXECUTE:
            final_decision = "auto_execute"
        elif confidence >= THRESHOLD_APPROVAL_REQUIRED:
            final_decision = "require_approval"
        else:
            final_decision = "reject"

        result["decision"] = final_decision
        result["confidence_score"] = confidence

        mon.log_event("action_evaluated", {
            "action_id": action_data.get("action_id"),
            "decision": final_decision,
            "confidence": confidence
        })
        return result

# COMMAND ----------

# MAGIC %md
# MAGIC ## Apply Decision and Update Records

# COMMAND ----------

def apply_decision(action_id, decision_data):
    """Update the response action status based on the decision."""
    with mon.time("apply_decision"):
        decision = decision_data["decision"]

        status_map = {
            "auto_execute": "approved_auto",
            "require_approval": "pending_approval",
            "reject": "rejected"
        }
        new_status = status_map.get(decision, "pending_review")

        update_df = (
            spark.read.table(response_actions_table)
            .filter(F.col("action_id") == action_id)
            .withColumn("status", F.lit(new_status))
            .withColumn("evaluated_at", F.lit(datetime.now(timezone.utc)))
            .withColumn("evaluated_by", F.lit(AGENT_NAME))
        )

        update_df.write.mode("overwrite").option(
            "replaceWhere", f"action_id = '{action_id}'"
        ).saveAsTable(response_actions_table)

        mon.log_event("action_status_updated", {
            "action_id": action_id,
            "new_status": new_status
        })
        return new_status

# COMMAND ----------

def store_audit_record(action_data, decision_data):
    """Create an audit log entry for the decision."""
    with mon.time("store_audit_record"):
        now = datetime.now(timezone.utc)
        audit_id = f"AUD-{action_data['action_id']}-{now.strftime('%Y%m%d%H%M%S')}"

        audit_row = [(
            audit_id,
            action_data.get("action_id", ""),
            action_data.get("case_id", ""),
            decision_data["decision"],
            float(decision_data["confidence_score"]),
            decision_data.get("reasoning", ""),
            action_data.get("action_type", ""),
            AGENT_NAME,
            now,
            "recorded"
        )]

        schema = StructType([
            StructField("audit_id", StringType(), False),
            StructField("action_id", StringType(), False),
            StructField("case_id", StringType(), True),
            StructField("decision", StringType(), True),
            StructField("confidence_score", FloatType(), True),
            StructField("reasoning", StringType(), True),
            StructField("action_type", StringType(), True),
            StructField("decided_by", StringType(), True),
            StructField("decided_at", TimestampType(), True),
            StructField("execution_status", StringType(), True),
        ])

        audit_df = spark.createDataFrame(audit_row, schema)
        audit_df.write.mode("append").saveAsTable(audit_log_table)

        mon.log_event("audit_record_stored", {"audit_id": audit_id})
        return audit_id

# COMMAND ----------

# MAGIC %md
# MAGIC ## Main Execution

# COMMAND ----------

def run():
    """Main execution loop for the Vanguard Response agent."""
    results = {
        "agent": AGENT_NAME,
        "version": AGENT_VERSION,
        "started_at": datetime.now(timezone.utc).isoformat(),
        "actions_evaluated": 0,
        "decisions": {"auto_execute": 0, "require_approval": 0, "reject": 0},
        "errors": []
    }

    try:
        pending_actions = get_pending_actions()
        action_list = pending_actions.collect()
        results["total_pending"] = len(action_list)

        for action_row in action_list:
            action_data = action_row.asDict()
            action_id = action_data.get("action_id", "unknown")

            try:
                with mon.time(f"evaluate_action_{action_id}"):
                    context = get_action_context(action_data)
                    decision_data = evaluate_action(action_data, context)

                    if decision_data is None:
                        results["errors"].append(f"Evaluation failed for {action_id}")
                        continue

                    apply_decision(action_id, decision_data)
                    store_audit_record(action_data, decision_data)

                    decision = decision_data["decision"]
                    results["decisions"][decision] = results["decisions"].get(decision, 0) + 1
                    results["actions_evaluated"] += 1

            except Exception as action_err:
                mon.log_error(f"Error evaluating action {action_id}", exception=action_err)
                results["errors"].append(f"{action_id}: {str(action_err)}")

        results["completed_at"] = datetime.now(timezone.utc).isoformat()
        results["status"] = "success"
        mon.log_complete(results)

    except Exception as e:
        results["status"] = "failed"
        results["error"] = str(e)
        mon.log_error("Vanguard Response agent failed", exception=e)

    return results

# COMMAND ----------

result = run()
dbutils.notebook.exit(json.dumps(result, default=str))
