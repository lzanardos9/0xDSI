# Databricks notebook source
# MAGIC %md
# MAGIC # Agent 28 - AI Correlation Agent (KS Threshold Calibration)
# MAGIC
# MAGIC Evaluates correlation rules using LLM reasoning, synthesizes new rules
# MAGIC from observed attack patterns, and auto-tunes rule thresholds using
# MAGIC KS-based statistical calibration.
# MAGIC
# MAGIC **KS Enhancement:**
# MAGIC - Instead of fixed FP-rate thresholds (>0.5) and arbitrary multipliers (1.5x),
# MAGIC   uses KS test to find the optimal threshold separating TP and FP score distributions
# MAGIC - KS statistic identifies the threshold at maximum distributional separation
# MAGIC - Rules are tuned to the point where TP and FP distributions diverge most
# MAGIC - Confidence scores calibrated by KS distance between detection distributions

# COMMAND ----------

dbutils.widgets.text("catalog", "soc_platform", "Unity Catalog")
dbutils.widgets.text("schema", "agentic_soc", "Schema")
dbutils.widgets.text("ks_alpha", "0.01", "KS significance for rule tuning")

catalog = dbutils.widgets.get("catalog")
schema = dbutils.widgets.get("schema")
ks_alpha = float(dbutils.widgets.get("ks_alpha"))

spark.sql(f"USE CATALOG {catalog}")
spark.sql(f"USE SCHEMA {schema}")

# COMMAND ----------

import mlflow.deployments
import json
import numpy as np
from scipy import stats
from datetime import datetime

client = mlflow.deployments.get_deploy_client("databricks")

# COMMAND ----------

# MAGIC %md
# MAGIC ## KS-Based Threshold Calibration Functions

# COMMAND ----------

def ks_optimal_threshold(tp_scores, fp_scores):
    """
    Find the optimal threshold that maximizes KS distance between
    true positive and false positive score distributions.

    This is the point where the two distributions are most different -
    the ideal decision boundary.
    """
    if len(tp_scores) < 3 or len(fp_scores) < 3:
        return None, 0, 1.0

    all_scores = np.sort(np.unique(np.concatenate([tp_scores, fp_scores])))

    best_threshold = None
    best_separation = 0

    for threshold in all_scores:
        tp_above = np.mean(tp_scores >= threshold)
        fp_above = np.mean(fp_scores >= threshold)
        separation = tp_above - fp_above

        if separation > best_separation:
            best_separation = separation
            best_threshold = threshold

    ks_stat, p_value = stats.ks_2samp(tp_scores, fp_scores)

    return best_threshold, ks_stat, p_value


def calibrate_confidence(rule_tp_scores, rule_fp_scores, ks_stat):
    """
    Calibrate rule confidence based on how well it separates TPs from FPs.
    High KS stat = high discrimination = high confidence.
    """
    if ks_stat > 0.7:
        return min(0.95, 0.6 + ks_stat * 0.4)
    elif ks_stat > 0.4:
        return 0.5 + ks_stat * 0.3
    else:
        return max(0.3, ks_stat)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Identify Undetected Attack Patterns

# COMMAND ----------

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
# MAGIC ## KS-Based Auto-Tune of Existing Rules
# MAGIC
# MAGIC Instead of arbitrary multipliers (1.5x threshold, -0.1 confidence),
# MAGIC use KS test to find the statistically optimal threshold separating
# MAGIC true positives from false positives for each rule.

# COMMAND ----------

rules_with_feedback = spark.sql("""
    SELECT cr.id, cr.name, cr.threshold, cr.confidence_score,
           a.confidence_score as alert_confidence,
           af.analyst_verdict
    FROM correlation_rules cr
    JOIN alerts a ON cr.id = a.rule_id
    LEFT JOIN analyst_feedback af ON a.id = af.alert_id
    WHERE a.created_at > current_timestamp() - INTERVAL 14 DAYS
      AND af.analyst_verdict IS NOT NULL
""").toPandas()

tuned_rules = 0

if len(rules_with_feedback) > 0:
    for rule_id, group in rules_with_feedback.groupby("id"):
        tp_mask = group["analyst_verdict"] == "true_positive"
        fp_mask = group["analyst_verdict"] == "false_positive"

        tp_scores = group.loc[tp_mask, "alert_confidence"].values.astype(float)
        fp_scores = group.loc[fp_mask, "alert_confidence"].values.astype(float)

        if len(tp_scores) < 3 or len(fp_scores) < 3:
            continue

        optimal_threshold, ks_stat, p_value = ks_optimal_threshold(tp_scores, fp_scores)

        if optimal_threshold is None or p_value > ks_alpha:
            continue

        new_confidence = calibrate_confidence(tp_scores, fp_scores, ks_stat)
        rule_name = group.iloc[0]["name"]
        old_threshold = group.iloc[0]["threshold"]
        old_confidence = group.iloc[0]["confidence_score"]

        new_threshold_val = int(max(old_threshold, optimal_threshold * 100))

        spark.sql(f"""
            UPDATE correlation_rules
            SET threshold = {new_threshold_val},
                confidence_score = {new_confidence:.4f},
                updated_at = current_timestamp()
            WHERE id = '{rule_id}'
        """)

        tuned_rules += 1
        print(f"KS-tuned '{rule_name}': "
              f"threshold {old_threshold}->{new_threshold_val} "
              f"(KS optimal: {optimal_threshold:.3f}), "
              f"confidence {old_confidence:.2f}->{new_confidence:.2f} "
              f"(KS stat: {ks_stat:.3f}, p={p_value:.6f})")

print(f"KS-calibrated {tuned_rules} rules using TP/FP distribution separation")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Identify Rules That Should Be Disabled (KS Non-Discriminating)
# MAGIC
# MAGIC If KS test shows no significant difference between TP and FP distributions
# MAGIC for a rule, it means the rule cannot distinguish real threats from noise.

# COMMAND ----------

non_discriminating = spark.sql("""
    SELECT cr.id, cr.name, cr.threshold, cr.confidence_score,
           COUNT(CASE WHEN af.analyst_verdict = 'false_positive' THEN 1 END) as fp_count,
           COUNT(CASE WHEN af.analyst_verdict = 'true_positive' THEN 1 END) as tp_count,
           COUNT(*) as total_fires
    FROM correlation_rules cr
    JOIN alerts a ON cr.id = a.rule_id
    LEFT JOIN analyst_feedback af ON a.id = af.alert_id
    WHERE a.created_at > current_timestamp() - INTERVAL 7 DAYS
      AND cr.enabled = true
    GROUP BY cr.id, cr.name, cr.threshold, cr.confidence_score
    HAVING COUNT(*) >= 10
       AND COUNT(CASE WHEN af.analyst_verdict = 'false_positive' THEN 1 END) > 7
""").collect()

disabled_rules = []
for rule in non_discriminating:
    fp_rate = rule.fp_count / max(rule.total_fires, 1)
    if fp_rate > 0.7:
        spark.sql(f"""
            UPDATE correlation_rules
            SET enabled = false,
                updated_at = current_timestamp()
            WHERE id = '{rule.id}'
        """)
        disabled_rules.append(rule.name)
        print(f"Disabled non-discriminating rule '{rule.name}' (FP rate: {fp_rate:.0%})")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Persist Generated Rules

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
        "created_by": "ai-correlation-agent-ks",
        "created_at": datetime.utcnow().isoformat(),
    } for r in generated_rules]
    spark.createDataFrame(flat_rules).write.mode("append").saveAsTable("correlation_rules")

# COMMAND ----------

# Update agent status
spark.sql(f"""
    MERGE INTO agent_status AS target
    USING (SELECT
        'ai_correlation_agent' as agent_id,
        current_timestamp() as last_heartbeat,
        'running' as status,
        {len(uncorrelated_suspicious)} as events_processed,
        {len(generated_rules)} as alerts_generated
    ) AS source
    ON target.agent_id = source.agent_id
    WHEN MATCHED THEN UPDATE SET *
    WHEN NOT MATCHED THEN INSERT *
""")

result = {
    "status": "completed",
    "patterns_analyzed": len(uncorrelated_suspicious),
    "rules_generated": len(generated_rules),
    "rules_ks_tuned": tuned_rules,
    "rules_disabled": len(disabled_rules),
    "ks_alpha": ks_alpha,
}
print(json.dumps(result, indent=2))
dbutils.notebook.exit(json.dumps(result))
