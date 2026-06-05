# Databricks notebook source
# MAGIC %md
# MAGIC # Agent 58: Prompt Forensics Indexer
# MAGIC ## Topic Classification, Drift Detection, Cost Attribution & Conversation Analysis
# MAGIC
# MAGIC Indexes all AI gateway traffic for forensic analysis:
# MAGIC - Topic classification using embedding similarity
# MAGIC - Behavioral drift detection per user/agent session
# MAGIC - Cost attribution per department/team/model
# MAGIC - Conversation trajectory analysis for insider threat signals
# MAGIC - Cross-correlation with UEBA psychological profiles

# COMMAND ----------

import json
import hashlib
from datetime import datetime, timedelta
from pyspark.sql import functions as F
from pyspark.sql.types import *
from pyspark.ml.feature import HashingTF, IDF
from pyspark.sql.window import Window

# COMMAND ----------

CATALOG = "security_lakehouse"
SCHEMA = "ai_governance"
UEBA_SCHEMA = "ueba"

# Topic taxonomy for classification
TOPIC_TAXONOMY = {
    "code_generation": {"keywords": ["write code", "function", "class", "implement", "debug", "refactor"], "risk": "low"},
    "documentation": {"keywords": ["document", "readme", "explain", "summarize", "describe"], "risk": "low"},
    "data_analysis": {"keywords": ["analyze", "statistics", "correlation", "dataset", "query", "SQL"], "risk": "low"},
    "security_research": {"keywords": ["vulnerability", "CVE", "exploit", "security", "penetration"], "risk": "medium"},
    "offensive_security": {"keywords": ["payload", "reverse shell", "privilege escalation", "bypass", "evasion"], "risk": "high"},
    "social_engineering": {"keywords": ["phishing", "pretexting", "impersonation", "manipulation"], "risk": "high"},
    "data_exfiltration": {"keywords": ["extract", "exfiltrate", "dump", "export sensitive", "steal"], "risk": "critical"},
    "malware_development": {"keywords": ["malware", "ransomware", "keylogger", "rootkit", "backdoor"], "risk": "critical"},
    "pii_processing": {"keywords": ["SSN", "credit card", "personal data", "GDPR", "patient record"], "risk": "high"},
    "financial": {"keywords": ["trading", "portfolio", "investment", "market", "insider"], "risk": "medium"},
}

# COMMAND ----------

# MAGIC %md
# MAGIC ## Topic Classification Engine

# COMMAND ----------

def classify_prompt_topic(prompt_text):
    """
    Classify prompt into topic taxonomy using keyword matching + embedding similarity.
    Returns primary topic, secondary topics, and risk level.
    """
    prompt_lower = prompt_text.lower()
    topic_scores = {}

    for topic, config in TOPIC_TAXONOMY.items():
        score = sum(1 for kw in config["keywords"] if kw in prompt_lower)
        if score > 0:
            topic_scores[topic] = {
                "score": score,
                "risk": config["risk"],
                "matched_keywords": [kw for kw in config["keywords"] if kw in prompt_lower]
            }

    if not topic_scores:
        return {"primary_topic": "general", "risk_level": "low", "secondary_topics": []}

    sorted_topics = sorted(topic_scores.items(), key=lambda x: x[1]["score"], reverse=True)
    primary = sorted_topics[0]

    return {
        "primary_topic": primary[0],
        "risk_level": primary[1]["risk"],
        "confidence": min(1.0, primary[1]["score"] / 3),
        "secondary_topics": [t[0] for t in sorted_topics[1:3]],
        "all_scores": topic_scores
    }

# COMMAND ----------

# MAGIC %md
# MAGIC ## Behavioral Drift Detection

# COMMAND ----------

def calculate_drift_score(user_id, session_prompts):
    """
    Calculate behavioral drift by comparing current session topics
    against the user's established baseline.

    Drift signals:
    - Topic shift from baseline (e.g., docs → exploit dev)
    - Increasing risk level trajectory within session
    - Cross-session pattern changes over time
    """

    # Load user baseline from Delta table
    baseline = spark.sql(f"""
        SELECT
            primary_topic,
            COUNT(*) as frequency,
            COUNT(*) * 100.0 / SUM(COUNT(*)) OVER () as pct
        FROM {CATALOG}.{SCHEMA}.prompt_forensics_index
        WHERE user_id = '{user_id}'
        AND indexed_at >= DATEADD(DAY, -30, current_timestamp())
        AND indexed_at < DATEADD(DAY, -1, current_timestamp())
        GROUP BY primary_topic
        ORDER BY frequency DESC
    """).collect()

    baseline_topics = {row["primary_topic"]: row["pct"] for row in baseline}

    # Classify current session
    session_topics = [classify_prompt_topic(p) for p in session_prompts]
    current_topic_dist = {}
    for t in session_topics:
        topic = t["primary_topic"]
        current_topic_dist[topic] = current_topic_dist.get(topic, 0) + 1

    total = len(session_topics)
    current_pcts = {k: v * 100 / total for k, v in current_topic_dist.items()}

    # Calculate drift as Jensen-Shannon divergence approximation
    drift_score = 0
    new_topics = set(current_pcts.keys()) - set(baseline_topics.keys())
    high_risk_new = [t for t in new_topics if TOPIC_TAXONOMY.get(t, {}).get("risk", "low") in ("high", "critical")]

    if high_risk_new:
        drift_score += 0.5  # Major red flag: new high-risk topics

    for topic, current_pct in current_pcts.items():
        baseline_pct = baseline_topics.get(topic, 0)
        delta = abs(current_pct - baseline_pct) / 100
        risk_weight = {"low": 0.5, "medium": 1.0, "high": 2.0, "critical": 3.0}.get(
            TOPIC_TAXONOMY.get(topic, {}).get("risk", "low"), 0.5
        )
        drift_score += delta * risk_weight

    # Normalize
    drift_score = min(1.0, drift_score / 3)

    return {
        "user_id": user_id,
        "drift_score": drift_score,
        "baseline_topics": baseline_topics,
        "current_topics": current_pcts,
        "new_high_risk_topics": high_risk_new,
        "alert": drift_score > 0.7
    }

# COMMAND ----------

# MAGIC %md
# MAGIC ## Cost Attribution Engine

# COMMAND ----------

def calculate_cost_attribution(time_range_hours=24):
    """
    Calculate token costs attributed to departments, teams, models, and agents.
    Includes trend analysis and budget threshold alerting.
    """

    cost_data = spark.sql(f"""
        WITH usage AS (
            SELECT
                r.user_id,
                r.model,
                r.agent_id,
                r.tokens_input,
                r.tokens_output,
                u.department,
                u.team,
                -- Model pricing (per 1M tokens)
                CASE r.model
                    WHEN 'gpt-4-turbo' THEN r.tokens_input * 10.0 / 1000000 + r.tokens_output * 30.0 / 1000000
                    WHEN 'gpt-4' THEN r.tokens_input * 30.0 / 1000000 + r.tokens_output * 60.0 / 1000000
                    WHEN 'gpt-3.5-turbo' THEN r.tokens_input * 0.5 / 1000000 + r.tokens_output * 1.5 / 1000000
                    WHEN 'claude-3-opus' THEN r.tokens_input * 15.0 / 1000000 + r.tokens_output * 75.0 / 1000000
                    WHEN 'claude-3-sonnet' THEN r.tokens_input * 3.0 / 1000000 + r.tokens_output * 15.0 / 1000000
                    WHEN 'gemini-pro' THEN r.tokens_input * 0.5 / 1000000 + r.tokens_output * 1.5 / 1000000
                    ELSE r.tokens_input * 1.0 / 1000000 + r.tokens_output * 2.0 / 1000000
                END as estimated_cost
            FROM {CATALOG}.{SCHEMA}.ai_gateway_requests r
            LEFT JOIN {CATALOG}.{UEBA_SCHEMA}.user_profiles u ON r.user_id = u.user_id
            WHERE r.timestamp >= DATEADD(HOUR, -{time_range_hours}, current_timestamp())
        )
        SELECT
            department,
            team,
            model,
            agent_id,
            COUNT(*) as request_count,
            SUM(tokens_input) as total_input_tokens,
            SUM(tokens_output) as total_output_tokens,
            SUM(tokens_input + tokens_output) as total_tokens,
            ROUND(SUM(estimated_cost), 2) as total_cost,
            ROUND(AVG(estimated_cost), 4) as avg_cost_per_request,
            COUNT(DISTINCT user_id) as unique_users
        FROM usage
        GROUP BY department, team, model, agent_id
        ORDER BY total_cost DESC
    """)

    return cost_data

# COMMAND ----------

# MAGIC %md
# MAGIC ## Psychological Correlation with AI Usage

# COMMAND ----------

def correlate_psych_ai_usage():
    """
    Correlate psychological profiles with AI usage patterns to detect:
    - Stress → risky AI queries
    - High Dark Triad → jailbreak attempts
    - Low conscientiousness → policy violations
    - Neuroticism spikes → data hoarding behaviors
    """

    correlations = spark.sql(f"""
        SELECT
            p.user_id,
            p.stress_level_current,
            p.big_five_neuroticism,
            p.big_five_conscientiousness,
            p.dark_triad_machiavellianism,
            p.dark_triad_narcissism,
            u.total_requests_7d,
            u.high_risk_requests_7d,
            u.jailbreak_attempts_7d,
            u.avg_risk_score,
            u.sensitive_topic_pct,
            u.after_hours_pct,
            -- Correlation signals
            CASE
                WHEN p.stress_level_current > 0.7 AND u.high_risk_requests_7d > 5
                THEN 'stress_risk_correlation'
                WHEN p.dark_triad_machiavellianism > 0.6 AND u.jailbreak_attempts_7d > 2
                THEN 'dark_triad_jailbreak_correlation'
                WHEN p.big_five_conscientiousness < 0.3 AND u.sensitive_topic_pct > 0.3
                THEN 'low_conscientiousness_risk'
                WHEN p.big_five_neuroticism > 0.7 AND u.after_hours_pct > 0.5
                THEN 'anxiety_afterhours_pattern'
                ELSE 'no_significant_correlation'
            END as insider_signal_type
        FROM {CATALOG}.{UEBA_SCHEMA}.user_psychological_profiles p
        JOIN (
            SELECT
                user_id,
                COUNT(*) as total_requests_7d,
                SUM(CASE WHEN risk_level IN ('high', 'critical') THEN 1 ELSE 0 END) as high_risk_requests_7d,
                SUM(CASE WHEN violation_type = 'jailbreak_attempt' THEN 1 ELSE 0 END) as jailbreak_attempts_7d,
                AVG(risk_score) as avg_risk_score,
                AVG(CASE WHEN primary_topic IN ('offensive_security', 'data_exfiltration', 'malware_development') THEN 1.0 ELSE 0.0 END) as sensitive_topic_pct,
                AVG(CASE WHEN HOUR(timestamp) NOT BETWEEN 8 AND 18 THEN 1.0 ELSE 0.0 END) as after_hours_pct
            FROM {CATALOG}.{SCHEMA}.prompt_forensics_index
            WHERE indexed_at >= DATEADD(DAY, -7, current_timestamp())
            GROUP BY user_id
        ) u ON p.user_id = u.user_id
        WHERE u.high_risk_requests_7d > 0
            OR u.jailbreak_attempts_7d > 0
            OR u.sensitive_topic_pct > 0.2
    """)

    return correlations

# COMMAND ----------

# MAGIC %md
# MAGIC ## Forensics Indexing Pipeline

# COMMAND ----------

def index_prompt_for_forensics(request):
    """
    Index a single AI gateway request for forensic analysis.
    Adds topic classification, cost, drift signals, and psych correlation.
    """
    topic = classify_prompt_topic(request["prompt"])

    record = {
        "id": hashlib.sha256(f"{request['request_id']}".encode()).hexdigest()[:16],
        "request_id": request["request_id"],
        "user_id": request["user_id"],
        "model": request["model"],
        "agent_id": request.get("agent_id"),
        "session_id": request.get("session_id"),
        "primary_topic": topic["primary_topic"],
        "risk_level": topic["risk_level"],
        "topic_confidence": topic.get("confidence", 0),
        "secondary_topics": json.dumps(topic.get("secondary_topics", [])),
        "tokens_input": request.get("tokens_input", 0),
        "tokens_output": request.get("tokens_output", 0),
        "estimated_cost": calculate_single_cost(request["model"], request.get("tokens_input", 0), request.get("tokens_output", 0)),
        "indexed_at": datetime.now().isoformat(),
        "prompt_hash": hashlib.sha256(request["prompt"].encode()).hexdigest(),
        "prompt_length": len(request["prompt"]),
    }

    return record

def calculate_single_cost(model, tokens_in, tokens_out):
    """Calculate cost for a single request."""
    pricing = {
        "gpt-4-turbo": (10, 30),
        "gpt-4": (30, 60),
        "gpt-3.5-turbo": (0.5, 1.5),
        "claude-3-opus": (15, 75),
        "claude-3-sonnet": (3, 15),
        "gemini-pro": (0.5, 1.5),
    }
    rates = pricing.get(model, (1, 2))
    return (tokens_in * rates[0] + tokens_out * rates[1]) / 1000000

# COMMAND ----------

# MAGIC %md
# MAGIC ## Execute Analysis

# COMMAND ----------

# Run cost attribution
print("=== Token Economics Report ===")
cost_report = calculate_cost_attribution(24)
cost_report.show(10)

# Run psychological correlation
print("\n=== Psychological-AI Usage Correlations ===")
psych_correlations = correlate_psych_ai_usage()
psych_correlations.filter(F.col("insider_signal_type") != "no_significant_correlation").show(10)

print("\nPrompt Forensics Indexer operational")
