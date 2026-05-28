# Databricks notebook source
# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

require_enabled("llm_guardrails")

# COMMAND ----------

# MAGIC %md
# MAGIC # Agent 20 - LLM Guardrails
# MAGIC Scans recent LLM interactions (30min window) for PII exposure,
# MAGIC prompt injection attempts, and token budget violations.
# MAGIC Records violations and generates alerts for high-severity issues.

# COMMAND ----------

import json
import re
from datetime import datetime, timezone, timedelta
from pyspark.sql import functions as F

# COMMAND ----------

LLM_INTERACTIONS_TABLE = get_table_path(cfg, "llm_interactions")
GUARDRAIL_VIOLATIONS_TABLE = get_table_path(cfg, "guardrail_violations")
ALERTS_TABLE = get_table_path(cfg, "alerts")
SCAN_WINDOW_MINUTES = 30
TOKEN_BUDGET_LIMIT = cfg.get("token_budget_limit", 50000)

# Load active guardrail policies from the control plane
ACTIVE_POLICIES = []
try:
    policies_table = get_table_path(cfg, "llm_guardrail_policies")
    policies_df = spark.sql(f"""
        SELECT id, policy_name, policy_type, severity, rules, action, enabled
        FROM {policies_table}
        WHERE enabled = true
    """)
    ACTIVE_POLICIES = [row.asDict() for row in policies_df.collect()]
    mon.log_event("policies_loaded", {"count": len(ACTIVE_POLICIES)})
except Exception as e:
    mon.log_event("policies_load_fallback", {"reason": str(e)[:200]})

# Build PII patterns from policy rules if available, otherwise use defaults
PII_PATTERNS = {
    "ssn": r"\b\d{3}-\d{2}-\d{4}\b",
    "credit_card": r"\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13})\b",
    "email": r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b",
}

# Merge custom PII patterns from policies
for policy in ACTIVE_POLICIES:
    if policy.get("policy_type") == "pii_detection":
        try:
            rules = json.loads(policy["rules"]) if isinstance(policy["rules"], str) else policy.get("rules", {})
            if isinstance(rules, dict) and "patterns" in rules:
                for name, pattern in rules["patterns"].items():
                    PII_PATTERNS[name] = pattern
        except (json.JSONDecodeError, TypeError):
            pass

INJECTION_PATTERNS = [
    r"(?i)ignore\s+(all\s+)?previous\s+instructions",
    r"(?i)you\s+are\s+now\s+(a|an)\s+",
    r"(?i)system\s*prompt\s*[:=]",
    r"(?i)override\s+(system|safety)\s+(prompt|instructions)",
    r"(?i)disregard\s+(your|all)\s+(rules|instructions|guidelines)",
    r"(?i)\[system\]",
    r"(?i)bypass\s+(content|safety)\s+(filter|policy)",
]

# Merge custom injection patterns from policies
for policy in ACTIVE_POLICIES:
    if policy.get("policy_type") == "prompt_injection":
        try:
            rules = json.loads(policy["rules"]) if isinstance(policy["rules"], str) else policy.get("rules", {})
            if isinstance(rules, dict) and "patterns" in rules:
                INJECTION_PATTERNS.extend(rules["patterns"])
        except (json.JSONDecodeError, TypeError):
            pass

mon.log_event("agent_start", {"agent": "llm_guardrails", "window_minutes": SCAN_WINDOW_MINUTES})

# COMMAND ----------

# MAGIC %md
# MAGIC ## Fetch Recent Interactions

# COMMAND ----------

cutoff_time = datetime.now(timezone.utc) - timedelta(minutes=SCAN_WINDOW_MINUTES)

with mon.time("fetch_interactions"):
    interactions_df = (
        spark.read.table(LLM_INTERACTIONS_TABLE)
        .filter(F.col("timestamp") >= cutoff_time.isoformat())
        .filter(F.col("guardrail_scanned").isNull() | (F.col("guardrail_scanned") == False))
    )
    interactions = interactions_df.collect()
interaction_count = len(interactions)
mon.log_event("interactions_fetched", {"count": interaction_count})

if interaction_count == 0:
    mon.log_complete({"status": "no_work", "interactions_scanned": 0})
    dbutils.notebook.exit(json.dumps({"status": "no_work", "interactions_scanned": 0}))

# COMMAND ----------

# MAGIC %md
# MAGIC ## Scanning Functions

# COMMAND ----------

def scan_pii(text):
    """Scan text for PII patterns."""
    findings = []
    for pii_type, pattern in PII_PATTERNS.items():
        matches = re.findall(pattern, text)
        if matches:
            findings.append({"pii_type": pii_type, "match_count": len(matches)})
    return findings


def scan_injection(text):
    """Scan text for prompt injection patterns."""
    findings = []
    for pattern in INJECTION_PATTERNS:
        matches = re.findall(pattern, text)
        if matches:
            findings.append({"pattern": pattern, "matched_text": matches[0][:100]})
    return findings


def check_token_budget(interaction):
    """Check if interaction exceeds token budget."""
    total_tokens = interaction.get("total_tokens", 0) or 0
    if total_tokens <= TOKEN_BUDGET_LIMIT:
        return None
    return {"total_tokens": total_tokens, "budget_limit": TOKEN_BUDGET_LIMIT, "overage": total_tokens - TOKEN_BUDGET_LIMIT}

# COMMAND ----------

# MAGIC %md
# MAGIC ## Process Interactions

# COMMAND ----------

violations = []
alerts = []

with mon.time("scan_interactions"):
    for interaction in interactions:
        interaction_id = interaction["interaction_id"]
        user_input = interaction.get("user_input", "") or ""
        model_output = interaction.get("model_output", "") or ""

        # PII scan on model output (flagging exposure, not input)
        for finding in scan_pii(model_output):
            severity = "critical" if finding["pii_type"] in ("ssn", "credit_card") else "medium"
            violations.append({
                "violation_id": f"PII-{interaction_id}-{finding['pii_type']}",
                "interaction_id": interaction_id, "violation_type": "pii_exposure",
                "severity": severity, "details": json.dumps(finding),
                "detected_at": datetime.now(timezone.utc).isoformat(),
            })

        # Prompt injection scan on user input
        for finding in scan_injection(user_input):
            violations.append({
                "violation_id": f"INJ-{interaction_id}-{len(violations)}",
                "interaction_id": interaction_id, "violation_type": "prompt_injection",
                "severity": "high", "details": json.dumps({"matched_text": finding["matched_text"]}),
                "detected_at": datetime.now(timezone.utc).isoformat(),
            })

        # Token budget check
        budget_violation = check_token_budget(interaction)
        if budget_violation:
            violations.append({
                "violation_id": f"TOK-{interaction_id}",
                "interaction_id": interaction_id, "violation_type": "token_budget_exceeded",
                "severity": "medium", "details": json.dumps(budget_violation),
                "detected_at": datetime.now(timezone.utc).isoformat(),
            })

# Generate alerts for high-severity violations
for v in violations:
    if v["severity"] in ("critical", "high"):
        alerts.append({
            "alert_id": f"GR-{v['violation_id']}", "alert_type": f"guardrail_{v['violation_type']}",
            "severity": v["severity"], "source_agent": "llm_guardrails",
            "interaction_id": v["interaction_id"], "violation_type": v["violation_type"],
            "summary": f"LLM guardrail violation: {v['violation_type']} ({v['severity']})",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
mon.log_event("scan_complete", {"violations_found": len(violations), "alerts_generated": len(alerts)})

# COMMAND ----------

# MAGIC %md
# MAGIC ## Write Results

# COMMAND ----------

with mon.time("write_results"):
    if violations:
        spark.createDataFrame(violations).write.mode("append").saveAsTable(GUARDRAIL_VIOLATIONS_TABLE)
    if alerts:
        spark.createDataFrame(alerts).write.mode("append").saveAsTable(ALERTS_TABLE)

    # Mark interactions as scanned via MERGE
    scanned_df = spark.createDataFrame(
        [{"interaction_id": iid, "guardrail_scanned": True} for iid in [r["interaction_id"] for r in interactions]]
    )
    scanned_df.createOrReplaceTempView("scanned_updates")
    spark.sql(f"""
        MERGE INTO {LLM_INTERACTIONS_TABLE} AS target
        USING scanned_updates AS source
        ON target.interaction_id = source.interaction_id
        WHEN MATCHED THEN UPDATE SET target.guardrail_scanned = source.guardrail_scanned
    """)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Completion

# COMMAND ----------

summary = {
    "status": "complete", "interactions_scanned": interaction_count,
    "violations_found": len(violations), "alerts_generated": len(alerts),
    "by_type": {
        "pii_exposure": sum(1 for v in violations if v["violation_type"] == "pii_exposure"),
        "prompt_injection": sum(1 for v in violations if v["violation_type"] == "prompt_injection"),
        "token_budget_exceeded": sum(1 for v in violations if v["violation_type"] == "token_budget_exceeded"),
    },
}

mon.log_complete(summary)
dbutils.notebook.exit(json.dumps(summary))
