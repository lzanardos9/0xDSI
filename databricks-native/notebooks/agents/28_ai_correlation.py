# Databricks notebook source
# MAGIC %md
# MAGIC # Agent 28 - AI Correlation Agent
# MAGIC Evaluates correlation rules using LLM reasoning, synthesizes new rules
# MAGIC from observed attack patterns, and auto-tunes rule thresholds based
# MAGIC on detection performance metrics.

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
from datetime import datetime

client = mlflow.deployments.get_deploy_client("databricks")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Identify Undetected Attack Patterns

# COMMAND ----------

# Events that didn't trigger any rules but look suspicious
uncorrelated_suspicious = spark.sql("""
    SELECT e.event_type, e.action, e.source_ip, e.dest_ip, e.username,
           e.severity, COUNT(*) as event_count,
           COUNT(DISTINCT e.dest_ip) as unique_targets,
           COUNT(DISTINCT e.username) as unique_users
    FROM events e
    LEFT JOIN alerts a ON e.id = a.source_event_id
    WHERE a.id IS NULL
      AND e.severity IN ('high', 'critical')
      AND e.timestamp > current_timestamp() - INTERVAL 6 HOURS
    GROUP BY e.event_type, e.action, e.source_ip, e.dest_ip, e.username, e.severity
    HAVING COUNT(*) >= 5
    ORDER BY event_count DESC
    LIMIT 20
""").collect()

print(f"Found {len(uncorrelated_suspicious)} suspicious uncorrelated event patterns")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Generate New Correlation Rules

# COMMAND ----------

generated_rules = []

for pattern in uncorrelated_suspicious[:5]:
    response = client.predict(
        endpoint="databricks-meta-llama-3-1-70b-instruct",
        inputs={
            "messages": [
                {"role": "system", "content": "You are a detection engineer. Generate correlation rules in structured format for security event patterns. Rules must be specific enough to avoid false positives but broad enough to catch variants."},
                {"role": "user", "content": f"""Generate a correlation rule for this uncorrelated pattern:
Event Type: {pattern.event_type}
Action: {pattern.action}
Source: {pattern.source_ip}
Occurrences: {pattern.event_count} in 6 hours
Unique Targets: {pattern.unique_targets}
Severity: {pattern.severity}

Output JSON: {{"name": "...", "description": "...", "conditions": [{{"field": "...", "operator": "...", "value": "..."}}], "threshold": N, "window_minutes": N, "severity": "...", "mitre_tactic": "...", "mitre_technique": "...", "confidence": 0.X}}"""}
            ],
            "max_tokens": 500,
            "temperature": 0.2
        }
    )

    try:
        content = response.choices[0].message.content
        rule = json.loads(content[content.find("{"):content.rfind("}")+1])
        rule["created_by"] = "ai-correlation-agent"
        rule["created_at"] = datetime.utcnow().isoformat()
        rule["status"] = "pending_review"
        generated_rules.append(rule)
    except Exception as e:
        print(f"Error generating rule: {e}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Auto-Tune Existing Rules

# COMMAND ----------

# Find rules with high false positive rates
high_fp_rules = spark.sql("""
    SELECT cr.id, cr.name, cr.threshold, cr.confidence_score,
           COUNT(CASE WHEN af.analyst_verdict = 'false_positive' THEN 1 END) as fp_count,
           COUNT(CASE WHEN af.analyst_verdict = 'true_positive' THEN 1 END) as tp_count,
           COUNT(*) as total_fires
    FROM correlation_rules cr
    JOIN alerts a ON cr.id = a.rule_id
    LEFT JOIN analyst_feedback af ON a.id = af.alert_id
    WHERE a.created_at > current_timestamp() - INTERVAL 7 DAYS
    GROUP BY cr.id, cr.name, cr.threshold, cr.confidence_score
    HAVING COUNT(CASE WHEN af.analyst_verdict = 'false_positive' THEN 1 END) > 3
    ORDER BY fp_count DESC
""").collect()

for rule in high_fp_rules:
    fp_rate = rule.fp_count / max(rule.total_fires, 1)
    if fp_rate > 0.5:
        new_threshold = int(rule.threshold * 1.5)
        new_confidence = max(0.3, rule.confidence_score - 0.1)
        spark.sql(f"""
            UPDATE correlation_rules
            SET threshold = {new_threshold},
                confidence_score = {new_confidence},
                updated_at = current_timestamp()
            WHERE id = '{rule.id}'
        """)
        print(f"Auto-tuned rule '{rule.name}': threshold {rule.threshold}->{new_threshold}, confidence {rule.confidence_score:.2f}->{new_confidence:.2f}")

# COMMAND ----------

if generated_rules:
    flat_rules = [{
        "name": r.get("name", ""),
        "description": r.get("description", ""),
        "conditions_json": json.dumps(r.get("conditions", [])),
        "threshold": r.get("threshold", 5),
        "window_minutes": r.get("window_minutes", 15),
        "severity": r.get("severity", "high"),
        "mitre_tactic": r.get("mitre_tactic", ""),
        "mitre_technique": r.get("mitre_technique", ""),
        "confidence_score": r.get("confidence", 0.7),
        "status": "pending_review",
        "created_by": "ai-correlation-agent",
        "created_at": datetime.utcnow().isoformat(),
    } for r in generated_rules]
    spark.createDataFrame(flat_rules).write.mode("append").saveAsTable("correlation_rules")

print(f"Generated {len(generated_rules)} new rules, tuned {len(high_fp_rules)} existing rules")
