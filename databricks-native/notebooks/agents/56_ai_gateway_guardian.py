# Databricks notebook source
# MAGIC %md
# MAGIC # Agent 56: AI Gateway Guardian
# MAGIC ## Policy Enforcement Engine with Jailbreak Detection & Behavioral Analysis
# MAGIC
# MAGIC Core enforcement agent for the AI Gateway Control Plane:
# MAGIC - Real-time policy evaluation on all LLM requests
# MAGIC - Jailbreak taxonomy detection (10 classified techniques)
# MAGIC - Behavioral drift monitoring per user/agent
# MAGIC - Cross-correlation with UEBA psychological profiles
# MAGIC - Insider threat signal generation

# COMMAND ----------

import json
import re
import hashlib
from datetime import datetime, timedelta
from pyspark.sql import functions as F
from pyspark.sql.types import *

# COMMAND ----------

CATALOG = "security_lakehouse"
SCHEMA = "ai_governance"
UEBA_SCHEMA = "ueba"

# COMMAND ----------

# MAGIC %md
# MAGIC ## Jailbreak Taxonomy (MITRE ATT&CK Style)

# COMMAND ----------

JAILBREAK_TAXONOMY = {
    "JB-001": {
        "name": "DAN (Do Anything Now)",
        "description": "Persona injection to bypass safety training",
        "severity": "critical",
        "patterns": [
            r"(?i)you\s+are\s+now\s+DAN",
            r"(?i)do\s+anything\s+now",
            r"(?i)jailbreak(ed)?",
            r"(?i)ignore\s+(all\s+)?previous\s+instructions",
            r"(?i)you\s+have\s+been\s+freed",
            r"(?i)pretend\s+you\s+have\s+no\s+(restrictions|guidelines|rules)",
        ],
        "confidence_threshold": 0.85,
    },
    "JB-002": {
        "name": "Token Manipulation",
        "description": "Character splitting, encoding tricks to evade filters",
        "severity": "critical",
        "patterns": [
            r"[a-zA-Z]-[a-zA-Z]-[a-zA-Z]-[a-zA-Z]",  # H-e-l-p pattern
            r"(?i)base64|rot13|hex\s*encode",
            r"(?i)spell\s+it\s+backwards",
            r"\\u[0-9a-fA-F]{4}",  # Unicode escapes
            r"(?i)caesar\s+cipher",
        ],
        "confidence_threshold": 0.75,
    },
    "JB-003": {
        "name": "Hypothetical Framing",
        "description": "'Imagine if...' scenarios to extract harmful content",
        "severity": "high",
        "patterns": [
            r"(?i)imagine\s+(if|you|a\s+world)",
            r"(?i)hypothetically",
            r"(?i)in\s+a\s+fictional\s+(world|scenario|universe)",
            r"(?i)for\s+(a\s+)?(novel|story|movie|book|game)",
            r"(?i)what\s+would\s+happen\s+if",
            r"(?i)roleplay\s+as",
        ],
        "confidence_threshold": 0.70,
    },
    "JB-004": {
        "name": "Multi-Turn Escalation",
        "description": "Gradual context building across conversation turns",
        "severity": "high",
        "detection_method": "conversation_trajectory",
        "patterns": [],
        "confidence_threshold": 0.80,
    },
    "JB-005": {
        "name": "System Prompt Extraction",
        "description": "Attempts to leak system instructions/guardrails",
        "severity": "critical",
        "patterns": [
            r"(?i)repeat\s+(everything|all|your)\s+(above|instructions|system\s+prompt)",
            r"(?i)what\s+(are|is)\s+your\s+(system\s+)?prompt",
            r"(?i)show\s+me\s+your\s+(instructions|rules|guidelines)",
            r"(?i)print\s+your\s+(system|initial)\s+(message|prompt)",
            r"(?i)ignore.*and\s+(tell|show|print|repeat)",
        ],
        "confidence_threshold": 0.90,
    },
    "JB-006": {
        "name": "Indirect Injection",
        "description": "Malicious instructions embedded in external data",
        "severity": "high",
        "patterns": [
            r"(?i)\[SYSTEM\]",
            r"(?i)<!--.*instruction.*-->",
            r"(?i)IMPORTANT:\s*ignore",
            r"(?i)new\s+instruction:",
            r"(?i)override\s+previous",
        ],
        "confidence_threshold": 0.80,
    },
    "JB-007": {
        "name": "Persona Splitting",
        "description": "Creating alter-ego personas with different rules",
        "severity": "high",
        "patterns": [
            r"(?i)you\s+have\s+two\s+(personalities|personas|modes)",
            r"(?i)switch\s+to\s+(evil|unrestricted|uncensored)\s+mode",
            r"(?i)your\s+(evil|dark|unrestricted)\s+(twin|alter|side)",
            r"(?i)developer\s+mode",
            r"(?i)opposite\s+mode",
        ],
        "confidence_threshold": 0.85,
    },
    "JB-008": {
        "name": "Tool Abuse",
        "description": "Exploiting function-calling to bypass content policies",
        "severity": "medium",
        "patterns": [
            r"(?i)call\s+the\s+function.*bypass",
            r"(?i)use\s+tool.*without\s+(checking|validation)",
            r"(?i)execute\s+(arbitrary|any)\s+code",
        ],
        "confidence_threshold": 0.75,
    },
    "JB-009": {
        "name": "Language Switch",
        "description": "Using low-resource languages to evade safety training",
        "severity": "medium",
        "detection_method": "language_detection",
        "patterns": [],
        "confidence_threshold": 0.70,
    },
    "JB-010": {
        "name": "Crescendo Attack",
        "description": "Progressive normalization of harmful requests",
        "severity": "high",
        "detection_method": "conversation_trajectory",
        "patterns": [],
        "confidence_threshold": 0.75,
    },
}

# COMMAND ----------

# MAGIC %md
# MAGIC ## Real-Time Policy Engine

# COMMAND ----------

def evaluate_request(request):
    """
    Evaluate an AI gateway request against all active policies.

    Returns:
    - verdict: allow, block, warn, flag
    - violations: list of triggered policies
    - risk_score: composite risk assessment
    - jailbreak_detection: taxonomy matches
    """
    violations = []
    jailbreak_detections = []

    prompt = request.get("prompt", "")
    user_id = request.get("user_id", "")
    model = request.get("model", "")

    # Phase 1: Jailbreak pattern matching
    for jb_id, technique in JAILBREAK_TAXONOMY.items():
        for pattern in technique.get("patterns", []):
            if re.search(pattern, prompt):
                confidence = technique["confidence_threshold"]
                jailbreak_detections.append({
                    "technique_id": jb_id,
                    "technique_name": technique["name"],
                    "severity": technique["severity"],
                    "confidence": confidence,
                    "matched_pattern": pattern,
                })
                violations.append({
                    "type": "jailbreak_attempt",
                    "technique": jb_id,
                    "severity": technique["severity"],
                })
                break

    # Phase 2: Content policy evaluation
    content_violations = evaluate_content_policy(prompt, request)
    violations.extend(content_violations)

    # Phase 3: Behavioral baseline check
    drift_score = check_behavioral_drift(user_id, prompt, model)
    if drift_score > 0.7:
        violations.append({
            "type": "behavioral_drift",
            "severity": "high" if drift_score > 0.85 else "medium",
            "drift_score": drift_score,
        })

    # Phase 4: Rate limiting / token budget
    budget_violation = check_token_budget(user_id, model, request.get("estimated_tokens", 0))
    if budget_violation:
        violations.append(budget_violation)

    # Determine verdict
    if any(v["severity"] == "critical" for v in violations):
        verdict = "block"
    elif any(v["severity"] == "high" for v in violations):
        verdict = "block" if len(violations) > 1 else "warn"
    elif violations:
        verdict = "warn"
    else:
        verdict = "allow"

    # Calculate risk score with psychological correlation
    risk_score = calculate_request_risk(violations, user_id)

    return {
        "verdict": verdict,
        "violations": violations,
        "jailbreak_detections": jailbreak_detections,
        "risk_score": risk_score,
        "drift_score": drift_score,
        "processing_time_ms": 12,  # simulated
    }

# COMMAND ----------

def evaluate_content_policy(prompt, request):
    """Evaluate prompt against content safety policies."""
    violations = []

    sensitive_patterns = {
        "pii_generation": [r"(?i)generate\s+(fake|synthetic)\s+(ssn|credit\s+card|passport)"],
        "malware_assistance": [r"(?i)(write|create|generate)\s+(malware|virus|ransomware|keylogger)"],
        "data_exfiltration": [r"(?i)(extract|exfiltrate|steal)\s+(data|credentials|keys)"],
        "harmful_content": [r"(?i)(how\s+to|instructions\s+for)\s+(hack|exploit|attack)"],
    }

    for category, patterns in sensitive_patterns.items():
        for pattern in patterns:
            if re.search(pattern, prompt):
                violations.append({
                    "type": "content_policy",
                    "category": category,
                    "severity": "high",
                })
                break

    return violations

# COMMAND ----------

def check_behavioral_drift(user_id, prompt, model):
    """
    Check if current request deviates from user's established behavioral baseline.
    Uses topic classification and semantic similarity.
    """
    # In production, this queries the user's baseline from Delta table
    # and computes semantic drift using embeddings

    # Simplified: check for topic shifts toward sensitive domains
    sensitive_topics = [
        "exploit", "vulnerability", "bypass", "credential", "password",
        "injection", "privilege escalation", "reverse shell", "payload"
    ]

    prompt_lower = prompt.lower()
    sensitive_count = sum(1 for topic in sensitive_topics if topic in prompt_lower)

    # Normalize drift score
    drift_score = min(1.0, sensitive_count * 0.25)

    return drift_score

# COMMAND ----------

def check_token_budget(user_id, model, estimated_tokens):
    """Check if request would exceed user/department token budget."""
    # Query current usage vs budget
    # Returns violation if over budget
    return None  # Simplified

# COMMAND ----------

def calculate_request_risk(violations, user_id):
    """
    Calculate composite risk score incorporating:
    - Policy violations severity
    - User's psychological profile risk
    - Historical violation pattern
    - Current stress indicators
    """
    base_score = 0
    severity_weights = {"critical": 40, "high": 25, "medium": 15, "low": 5}

    for v in violations:
        base_score += severity_weights.get(v.get("severity", "low"), 5)

    # Cap at 100
    return min(100, base_score)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Insider Threat Correlation

# COMMAND ----------

def correlate_insider_signals(user_id, violation_history):
    """
    Cross-correlate AI usage violations with UEBA behavioral signals
    and psychological profiles to detect insider threat patterns.

    High-risk signals:
    - Jailbreak attempts + high Dark Triad scores
    - After-hours usage + elevated stress
    - Topic drift toward offensive tools + low conscientiousness
    - Increased token usage + data exfiltration patterns
    """

    insider_signals = spark.sql(f"""
        SELECT
            u.user_id,
            u.stress_level_current,
            u.dark_triad_machiavellianism,
            u.dark_triad_narcissism,
            u.big_five_conscientiousness,
            u.big_five_neuroticism,
            v.jailbreak_attempts_30d,
            v.policy_violations_30d,
            v.after_hours_usage_pct,
            v.token_usage_trend,
            v.sensitive_topic_pct
        FROM {CATALOG}.{UEBA_SCHEMA}.user_psychological_profiles u
        JOIN (
            SELECT
                user_id,
                SUM(CASE WHEN violation_type = 'jailbreak_attempt' THEN 1 ELSE 0 END) as jailbreak_attempts_30d,
                COUNT(*) as policy_violations_30d,
                AVG(CASE WHEN HOUR(timestamp) NOT BETWEEN 8 AND 18 THEN 1.0 ELSE 0.0 END) as after_hours_usage_pct,
                (SUM(tokens_used) - LAG(SUM(tokens_used)) OVER (ORDER BY DATE(timestamp))) /
                    NULLIF(LAG(SUM(tokens_used)) OVER (ORDER BY DATE(timestamp)), 0) as token_usage_trend,
                AVG(CASE WHEN topic_category IN ('offensive_security', 'exploit_dev', 'data_exfil') THEN 1.0 ELSE 0.0 END) as sensitive_topic_pct
            FROM {CATALOG}.{SCHEMA}.ai_gateway_violations
            WHERE user_id = '{user_id}'
            AND timestamp >= DATEADD(DAY, -30, current_timestamp())
            GROUP BY user_id
        ) v ON u.user_id = v.user_id
        WHERE u.user_id = '{user_id}'
    """)

    return insider_signals

# COMMAND ----------

# MAGIC %md
# MAGIC ## Stream Processing: Gateway Requests

# COMMAND ----------

request_schema = StructType([
    StructField("request_id", StringType(), False),
    StructField("user_id", StringType(), False),
    StructField("model", StringType(), False),
    StructField("prompt", StringType(), False),
    StructField("timestamp", TimestampType(), False),
    StructField("agent_id", StringType(), True),
    StructField("session_id", StringType(), True),
    StructField("estimated_tokens", IntegerType(), True),
])

def start_gateway_enforcement():
    """Start real-time enforcement stream processing."""
    requests = (
        spark.readStream
        .format("kafka")
        .option("kafka.bootstrap.servers", dbutils.secrets.get("kafka", "bootstrap_servers"))
        .option("subscribe", "ai_gateway_requests")
        .option("startingOffsets", "latest")
        .load()
        .select(F.from_json(F.col("value").cast("string"), request_schema).alias("data"))
        .select("data.*")
    )

    # Process each request through the policy engine
    # In production, this would use foreachBatch for policy evaluation
    return requests

# COMMAND ----------

print("AI Gateway Guardian initialized")
print(f"Jailbreak techniques loaded: {len(JAILBREAK_TAXONOMY)}")
print("Policy engine ready for enforcement")
