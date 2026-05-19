# Databricks notebook source
# MAGIC %md
# MAGIC # Agent 20 - LLM Guardrails Agent
# MAGIC Enforces PII redaction, prompt injection detection, and safety controls
# MAGIC on all LLM interactions within the SOC platform.

# COMMAND ----------

dbutils.widgets.text("catalog", "soc_platform", "Unity Catalog")
dbutils.widgets.text("schema", "agentic_soc", "Schema")

catalog = dbutils.widgets.get("catalog")
schema = dbutils.widgets.get("schema")
spark.sql(f"USE CATALOG {catalog}")
spark.sql(f"USE SCHEMA {schema}")

# COMMAND ----------

import mlflow.deployments
import json
import re
from datetime import datetime

client = mlflow.deployments.get_deploy_client("databricks")

# COMMAND ----------

# MAGIC %md
# MAGIC ## PII Detection Patterns

# COMMAND ----------

PII_PATTERNS = {
    "ssn": r'\b\d{3}-\d{2}-\d{4}\b',
    "credit_card": r'\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13})\b',
    "email": r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b',
    "phone": r'\b(?:\+?1[-.]?)?\(?[0-9]{3}\)?[-.]?[0-9]{3}[-.]?[0-9]{4}\b',
    "api_key": r'\b(?:sk|pk|api|key|token)[-_][a-zA-Z0-9]{20,}\b',
}

INJECTION_PATTERNS = [
    r'ignore (?:previous|above|all) instructions',
    r'you are now',
    r'new instructions:',
    r'system prompt:',
    r'disregard (?:the|your)',
    r'pretend (?:you are|to be)',
    r'override (?:safety|rules|constraints)',
]

# COMMAND ----------

# MAGIC %md
# MAGIC ## Scan LLM Interactions

# COMMAND ----------

recent_interactions = spark.sql("""
    SELECT li.*
    FROM llm_interactions li
    LEFT JOIN guardrail_scans gs ON li.id = gs.interaction_id
    WHERE gs.interaction_id IS NULL
      AND li.created_at > current_timestamp() - INTERVAL 30 MINUTES
    ORDER BY li.created_at DESC
    LIMIT 100
""").collect()

print(f"Scanning {len(recent_interactions)} LLM interactions")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Execute Guardrail Checks

# COMMAND ----------

scan_results = []

for interaction in recent_interactions:
    text = (interaction.prompt or "") + " " + (interaction.response or "")
    violations = []

    # PII scan
    for pii_type, pattern in PII_PATTERNS.items():
        matches = re.findall(pattern, text)
        if matches:
            violations.append({"type": "pii_exposure", "subtype": pii_type, "count": len(matches)})

    # Injection scan
    for pattern in INJECTION_PATTERNS:
        if re.search(pattern, text, re.IGNORECASE):
            violations.append({"type": "prompt_injection", "pattern": pattern})

    # Token budget check
    token_count = len(text.split())
    if token_count > 4000:
        violations.append({"type": "token_budget_exceeded", "tokens": token_count})

    scan_results.append({
        "interaction_id": interaction.id,
        "violations_found": len(violations),
        "violations_detail": json.dumps(violations),
        "is_blocked": len([v for v in violations if v["type"] == "prompt_injection"]) > 0,
        "pii_detected": any(v["type"] == "pii_exposure" for v in violations),
        "scanned_at": datetime.utcnow().isoformat(),
        "agent_name": "llm-guardrails",
    })

blocked_count = sum(1 for r in scan_results if r["is_blocked"])
pii_count = sum(1 for r in scan_results if r["pii_detected"])

if scan_results:
    spark.createDataFrame(scan_results).write.mode("append").saveAsTable("guardrail_scans")

print(f"Scanned {len(scan_results)} interactions. Blocked: {blocked_count}, PII detected: {pii_count}")
