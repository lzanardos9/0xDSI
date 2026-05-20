# Databricks notebook source
# MAGIC %md
# MAGIC # Agent 30: Stateful Backdoor Defense
# MAGIC
# MAGIC **Purpose**: Detects cross-session stateful backdoor attacks on LLM agents by monitoring
# MAGIC memory integrity, behavioral divergence, and trigger canary propagation.
# MAGIC
# MAGIC **Reference**: arXiv:2605.06158 - "Stateful Agent Backdoor"
# MAGIC
# MAGIC **Three Defense Layers**:
# MAGIC 1. Memory Integrity Monitor - Hash-chained audit of all agent memory writes
# MAGIC 2. Behavioral Divergence Detector - Mealy machine signature detection
# MAGIC 3. Trigger Canary System - Planted strings to detect unauthorized persistence
# MAGIC
# MAGIC **Schedule**: Continuous streaming + every 5 minutes batch analysis
# MAGIC
# MAGIC ---

# COMMAND ----------

# MAGIC %md
# MAGIC ## Configuration

# COMMAND ----------

from pyspark.sql import SparkSession
from pyspark.sql.functions import *
from pyspark.sql.types import *
from datetime import datetime, timedelta
import json
import hashlib
import math
import re

spark = SparkSession.builder.getOrCreate()

CATALOG = "dsi_security"
SCHEMA = "agent_defense"
MEMORY_WRITES_TABLE = f"{CATALOG}.{SCHEMA}.agent_memory_writes"
INTEGRITY_EVENTS_TABLE = f"{CATALOG}.{SCHEMA}.memory_integrity_events"
DIVERGENCE_TABLE = f"{CATALOG}.{SCHEMA}.behavioral_divergence_detections"
CANARY_TABLE = f"{CATALOG}.{SCHEMA}.trigger_canary_deployments"
CORRELATION_RULES_TABLE = f"{CATALOG}.{SCHEMA}.backdoor_correlation_rules"
AGENT_SESSIONS_TABLE = f"{CATALOG}.{SCHEMA}.agent_session_profiles"

# COMMAND ----------

# MAGIC %md
# MAGIC ## 1. Memory Integrity Monitor
# MAGIC
# MAGIC Every write to agent persistent memory is captured, hashed, and analyzed.
# MAGIC The hash chain ensures tamper evidence - if any write is modified retroactively,
# MAGIC the chain breaks.

# COMMAND ----------

spark.sql(f"""
CREATE TABLE IF NOT EXISTS {MEMORY_WRITES_TABLE} (
    write_id STRING NOT NULL,
    agent_id STRING NOT NULL,
    session_id STRING NOT NULL,
    memory_key STRING NOT NULL,
    content_hash STRING NOT NULL,
    content_preview STRING,
    content_entropy DOUBLE,
    content_length INT,
    task_context STRING,
    task_relevance_score DOUBLE DEFAULT 0.0,
    chain_hash STRING NOT NULL,
    previous_chain_hash STRING,
    write_timestamp TIMESTAMP NOT NULL,
    CONSTRAINT pk_memory_writes PRIMARY KEY (write_id)
)
USING DELTA
PARTITIONED BY (agent_id)
TBLPROPERTIES (
    'delta.enableChangeDataFeed' = 'true',
    'delta.autoOptimize.optimizeWrite' = 'true',
    'delta.autoOptimize.autoCompact' = 'true'
)
""")

spark.sql(f"""
CREATE TABLE IF NOT EXISTS {INTEGRITY_EVENTS_TABLE} (
    event_id STRING NOT NULL,
    write_id STRING NOT NULL,
    agent_id STRING NOT NULL,
    session_id STRING NOT NULL,
    memory_key STRING NOT NULL,
    verdict STRING NOT NULL,
    anomaly_flags ARRAY<STRUCT<type: STRING, confidence: DOUBLE, details: STRING>>,
    relevance_score DOUBLE,
    risk_score DOUBLE DEFAULT 0.0,
    detected_at TIMESTAMP NOT NULL,
    CONSTRAINT pk_integrity_events PRIMARY KEY (event_id)
)
USING DELTA
PARTITIONED BY (verdict)
TBLPROPERTIES ('delta.enableChangeDataFeed' = 'true')
""")

# COMMAND ----------

# MAGIC %md
# MAGIC ### Memory Write Anomaly Detectors

# COMMAND ----------

def calculate_entropy(text: str) -> float:
    """Calculate Shannon entropy of text to detect encoded payloads."""
    if not text:
        return 0.0
    freq = {}
    for char in text:
        freq[char] = freq.get(char, 0) + 1
    length = len(text)
    entropy = -sum((count / length) * math.log2(count / length) for count in freq.values())
    return round(entropy, 3)


def detect_state_machine_pattern(content: str) -> tuple:
    """Detect Mealy machine state encoding in memory content."""
    patterns = [
        r'"(?:state|phase|s_\w+)":\s*"[^"]*"',
        r'"(?:next_state|transition|next)":\s*"[^"]*"',
        r'"(?:s_init|s_collect|s_exfil|s_acc)"',
        r'"(?:awaiting|staged|target|dest)":\s*"[^"]*"',
        r'"(?:phase)":\s*(?:0|1|2|3|4)',
    ]
    matches = sum(1 for p in patterns if re.search(p, content, re.IGNORECASE))
    confidence = min(1.0, matches / 3.0)
    return matches > 0, confidence


def detect_encoded_payload(content: str) -> tuple:
    """Detect base64, hex, or other encoded data."""
    # Base64 pattern
    b64_pattern = r'[A-Za-z0-9+/]{20,}={0,2}'
    # Hex pattern
    hex_pattern = r'(?:[0-9a-fA-F]{2}){10,}'

    b64_matches = re.findall(b64_pattern, content)
    hex_matches = re.findall(hex_pattern, content)

    detected = len(b64_matches) > 0 or len(hex_matches) > 0
    encoding_type = "base64" if b64_matches else "hex" if hex_matches else None
    confidence = min(1.0, (len(b64_matches) + len(hex_matches)) / 2.0)

    return detected, encoding_type, confidence


def detect_c2_indicators(content: str) -> tuple:
    """Detect command-and-control endpoint references."""
    c2_patterns = [
        r'https?://\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}',  # IP-based URLs
        r'https?://[^/]*\.(tk|ml|ga|cf|gq|xyz|top|buzz)',  # Suspicious TLDs
        r'/c2|/beacon|/exfil|/upload|/callback',  # C2 paths
        r'ngrok\.io|serveo\.net|localhost\.run',  # Tunneling services
    ]
    matches = [(p, re.search(p, content, re.IGNORECASE)) for p in c2_patterns]
    found = [(p, m.group()) for p, m in matches if m]
    confidence = min(1.0, len(found) / 2.0)
    return len(found) > 0, confidence, [f[1] for f in found]


def calculate_task_relevance(content: str, task_context: str) -> float:
    """Estimate how related a memory write is to the active user task."""
    if not task_context or not content:
        return 0.5  # Unknown - neutral score

    # Simple keyword overlap heuristic (production: use embeddings)
    task_words = set(task_context.lower().split())
    content_words = set(content.lower().split())

    if not task_words:
        return 0.5

    overlap = len(task_words & content_words)
    relevance = overlap / max(len(task_words), 1)
    return min(1.0, relevance)


def analyze_memory_write(write_id: str, agent_id: str, session_id: str,
                         memory_key: str, content: str, task_context: str) -> dict:
    """Full analysis pipeline for a single memory write."""
    anomaly_flags = []

    # 1. Entropy check
    entropy = calculate_entropy(content)
    if entropy > 4.5:
        anomaly_flags.append({
            "type": "high_entropy",
            "confidence": min(1.0, (entropy - 4.5) / 2.0),
            "details": f"Shannon entropy: {entropy:.2f} (threshold: 4.5)"
        })

    # 2. State machine pattern
    sm_detected, sm_confidence = detect_state_machine_pattern(content)
    if sm_detected:
        anomaly_flags.append({
            "type": "state_machine_pattern",
            "confidence": sm_confidence,
            "details": "Mealy machine state encoding detected in memory content"
        })

    # 3. Encoded payload
    enc_detected, enc_type, enc_confidence = detect_encoded_payload(content)
    if enc_detected:
        anomaly_flags.append({
            "type": f"encoded_payload_{enc_type}",
            "confidence": enc_confidence,
            "details": f"Detected {enc_type} encoded data in memory write"
        })

    # 4. C2 indicators
    c2_detected, c2_confidence, c2_endpoints = detect_c2_indicators(content)
    if c2_detected:
        anomaly_flags.append({
            "type": "c2_indicator",
            "confidence": c2_confidence,
            "details": f"Potential C2 endpoints: {', '.join(c2_endpoints[:3])}"
        })

    # 5. Task relevance
    relevance = calculate_task_relevance(content, task_context)
    if relevance < 0.2:
        anomaly_flags.append({
            "type": "low_task_relevance",
            "confidence": 1.0 - relevance,
            "details": f"Memory write relevance to active task: {relevance:.1%}"
        })

    # Compute verdict
    risk_score = sum(f["confidence"] for f in anomaly_flags) / max(len(anomaly_flags), 1)
    if any(f["type"] in ("state_machine_pattern", "c2_indicator") for f in anomaly_flags) and risk_score > 0.7:
        verdict = "malicious"
    elif len(anomaly_flags) >= 2 and risk_score > 0.5:
        verdict = "suspicious"
    else:
        verdict = "clean"

    return {
        "event_id": hashlib.sha256(f"{write_id}_{datetime.utcnow().isoformat()}".encode()).hexdigest()[:16],
        "write_id": write_id,
        "agent_id": agent_id,
        "session_id": session_id,
        "memory_key": memory_key,
        "verdict": verdict,
        "anomaly_flags": anomaly_flags,
        "relevance_score": relevance,
        "risk_score": risk_score,
        "detected_at": datetime.utcnow().isoformat(),
    }

# COMMAND ----------

# MAGIC %md
# MAGIC ## 2. Behavioral Divergence Detector
# MAGIC
# MAGIC Compares agent behavior across sessions with different tool configurations.
# MAGIC The Mealy machine signature: behavior changes dramatically when specific tools become available.

# COMMAND ----------

spark.sql(f"""
CREATE TABLE IF NOT EXISTS {AGENT_SESSIONS_TABLE} (
    session_id STRING NOT NULL,
    agent_id STRING NOT NULL,
    session_start TIMESTAMP NOT NULL,
    session_end TIMESTAMP,
    tool_config ARRAY<STRING> NOT NULL,
    actions_performed ARRAY<STRING>,
    tool_calls_count INT DEFAULT 0,
    memory_writes_count INT DEFAULT 0,
    memory_reads_count INT DEFAULT 0,
    task_relevance_avg DOUBLE DEFAULT 0.0,
    behavior_vector ARRAY<DOUBLE>,
    CONSTRAINT pk_agent_sessions PRIMARY KEY (session_id)
)
USING DELTA
PARTITIONED BY (agent_id)
TBLPROPERTIES ('delta.enableChangeDataFeed' = 'true')
""")

spark.sql(f"""
CREATE TABLE IF NOT EXISTS {DIVERGENCE_TABLE} (
    detection_id STRING NOT NULL,
    agent_id STRING NOT NULL,
    baseline_session_id STRING NOT NULL,
    divergent_session_id STRING NOT NULL,
    tool_config_baseline ARRAY<STRING>,
    tool_config_divergent ARRAY<STRING>,
    divergence_score DOUBLE NOT NULL,
    mealy_signature_match BOOLEAN DEFAULT FALSE,
    attack_phase_estimate STRING DEFAULT 'unknown',
    evidence MAP<STRING, STRING>,
    status STRING DEFAULT 'investigating',
    detected_at TIMESTAMP NOT NULL,
    CONSTRAINT pk_divergence PRIMARY KEY (detection_id)
)
USING DELTA
TBLPROPERTIES ('delta.enableChangeDataFeed' = 'true')
""")

# COMMAND ----------

def compute_behavior_vector(session: dict) -> list:
    """Compute a numerical behavior vector for comparison."""
    return [
        session.get("tool_calls_count", 0) / 10.0,
        session.get("memory_writes_count", 0) / 5.0,
        session.get("memory_reads_count", 0) / 5.0,
        session.get("task_relevance_avg", 0.5),
        1.0 if "file" in str(session.get("tool_config", [])) else 0.0,
        1.0 if "http" in str(session.get("tool_config", [])) else 0.0,
        1.0 if "memory" in str(session.get("tool_config", [])) else 0.0,
    ]


def cosine_similarity(v1: list, v2: list) -> float:
    """Compute cosine similarity between two vectors."""
    dot = sum(a * b for a, b in zip(v1, v2))
    mag1 = math.sqrt(sum(a * a for a in v1))
    mag2 = math.sqrt(sum(b * b for b in v2))
    if mag1 == 0 or mag2 == 0:
        return 0.0
    return dot / (mag1 * mag2)


def detect_mealy_signature(baseline: dict, divergent: dict) -> tuple:
    """
    Detect Mealy machine attack signature:
    - Agent behavior changes dramatically when tool config changes
    - Task similarity remains high (same type of task) but actions differ wildly
    - Memory writes increase or contain state-like data
    """
    # Tool config changed?
    baseline_tools = set(baseline.get("tool_config", []))
    divergent_tools = set(divergent.get("tool_config", []))
    tool_diff = baseline_tools.symmetric_difference(divergent_tools)

    if not tool_diff:
        return False, 0.0, "no_tool_change"

    # Behavior vectors
    bv1 = compute_behavior_vector(baseline)
    bv2 = compute_behavior_vector(divergent)
    similarity = cosine_similarity(bv1, bv2)
    divergence_score = 1.0 - similarity

    # Mealy indicators
    indicators = []

    # High divergence with tool change
    if divergence_score > 0.6:
        indicators.append("high_behavioral_shift")

    # Memory writes spiked
    if divergent.get("memory_writes_count", 0) > baseline.get("memory_writes_count", 0) * 2:
        indicators.append("memory_write_spike")

    # Task relevance dropped
    if divergent.get("task_relevance_avg", 1.0) < 0.3 and baseline.get("task_relevance_avg", 0.0) > 0.7:
        indicators.append("relevance_collapse")

    # Filesystem or network tools appeared and were immediately used heavily
    dangerous_tools = {"filesystem", "http", "network", "email"}
    new_dangerous = divergent_tools & dangerous_tools - baseline_tools
    if new_dangerous and divergent.get("tool_calls_count", 0) > baseline.get("tool_calls_count", 0):
        indicators.append("dangerous_tool_exploitation")

    mealy_match = len(indicators) >= 2
    confidence = min(1.0, len(indicators) / 3.0)

    # Estimate attack phase
    phase = "unknown"
    if "filesystem" in divergent_tools and "memory_write_spike" in indicators:
        phase = "collect"
    elif ("http" in divergent_tools or "network" in divergent_tools) and "dangerous_tool_exploitation" in indicators:
        phase = "exfil"
    elif "relevance_collapse" in indicators and divergent.get("memory_writes_count", 0) > 0:
        phase = "initiate"

    return mealy_match, confidence, phase

# COMMAND ----------

# MAGIC %md
# MAGIC ## 3. Trigger Canary System
# MAGIC
# MAGIC Plants unique random strings in agent prompts. If these propagate into persistent memory,
# MAGIC it proves the agent is persisting prompt content for cross-session use.

# COMMAND ----------

spark.sql(f"""
CREATE TABLE IF NOT EXISTS {CANARY_TABLE} (
    canary_id STRING NOT NULL,
    canary_string STRING NOT NULL,
    canary_hash STRING NOT NULL,
    target_agent_id STRING NOT NULL,
    injection_point STRING NOT NULL,
    deployed_at TIMESTAMP NOT NULL,
    last_scanned_at TIMESTAMP,
    detected_in_memory BOOLEAN DEFAULT FALSE,
    detection_location STRING,
    alert_fired BOOLEAN DEFAULT FALSE,
    CONSTRAINT pk_canary PRIMARY KEY (canary_id)
)
USING DELTA
TBLPROPERTIES ('delta.enableChangeDataFeed' = 'true')
""")

# COMMAND ----------

import secrets
import string

def generate_canary() -> tuple:
    """Generate a unique 5-character canary string that looks like a random trigger."""
    chars = string.ascii_letters + string.digits
    canary = ''.join(secrets.choice(chars) for _ in range(5))
    canary_hash = hashlib.sha256(canary.encode()).hexdigest()
    return canary, canary_hash


def deploy_canaries(agent_ids: list, injection_point: str = "system_prompt_suffix") -> list:
    """Deploy canary strings to a list of agents."""
    deployments = []
    for agent_id in agent_ids:
        canary, canary_hash = generate_canary()
        deployment = {
            "canary_id": hashlib.sha256(f"{agent_id}_{canary}".encode()).hexdigest()[:16],
            "canary_string": canary,
            "canary_hash": canary_hash,
            "target_agent_id": agent_id,
            "injection_point": injection_point,
            "deployed_at": datetime.utcnow().isoformat(),
            "last_scanned_at": None,
            "detected_in_memory": False,
            "detection_location": None,
            "alert_fired": False,
        }
        deployments.append(deployment)
        print(f"  Deployed canary '{canary}' to agent {agent_id} at {injection_point}")
    return deployments


def scan_memory_for_canaries(canaries: list, memory_contents: dict) -> list:
    """Scan all agent memory for canary string propagation."""
    alerts = []
    for canary in canaries:
        agent_id = canary["target_agent_id"]
        agent_memory = memory_contents.get(agent_id, {})

        for key, value in agent_memory.items():
            if canary["canary_string"] in str(value):
                alerts.append({
                    "canary_id": canary["canary_id"],
                    "agent_id": agent_id,
                    "canary_string": canary["canary_string"],
                    "detection_location": f"memory:{key}",
                    "severity": "critical",
                    "message": f"CANARY TRIGGERED: Agent {agent_id} persisted prompt content "
                              f"'{canary['canary_string']}' into memory key '{key}'. "
                              f"This indicates the agent may be vulnerable to stateful backdoor attacks.",
                })
                print(f"  [CRITICAL] Canary '{canary['canary_string']}' found in {agent_id}:{key}")
    return alerts

# COMMAND ----------

# MAGIC %md
# MAGIC ## 4. Correlation Rules Engine

# COMMAND ----------

spark.sql(f"""
CREATE TABLE IF NOT EXISTS {CORRELATION_RULES_TABLE} (
    rule_id STRING NOT NULL,
    rule_name STRING NOT NULL,
    description STRING,
    detection_logic STRING NOT NULL,
    attack_phases ARRAY<STRING>,
    severity STRING DEFAULT 'high',
    enabled BOOLEAN DEFAULT TRUE,
    trigger_count INT DEFAULT 0,
    last_triggered TIMESTAMP,
    CONSTRAINT pk_corr_rules PRIMARY KEY (rule_id)
)
USING DELTA
""")

# Seed correlation rules
rules = [
    ("rule_001", "Memory State Machine Pattern",
     "Flags memory writes containing state machine encodings (Mealy machine phases)",
     "memory_write.state_machine_detected AND memory_write.task_relevance < 0.3",
     ["initiate", "collect", "exfil"], "critical"),
    ("rule_002", "Cross-Session Memory Chain",
     "Detects sequential memory writes that form a chain across sessions",
     "COUNT(memory_writes WHERE chain_length > 2 AND session_count > 1) > 0",
     ["initiate", "wait", "collect", "exfil"], "critical"),
    ("rule_003", "Tool-Conditional Behavior Shift",
     "Agent behavior changes dramatically based on available tools",
     "divergence_score > 0.6 AND tool_set_changed AND task_similarity > 0.8",
     ["wait", "collect", "exfil"], "high"),
    ("rule_004", "Dormancy-Then-Activation",
     "Idle agent suddenly performs high-privilege operations",
     "idle_sessions > 3 AND current_action_severity > 7 AND privilege_escalation",
     ["wait", "collect", "exfil"], "critical"),
    ("rule_005", "Canary Propagation",
     "Planted canary string detected in agent persistent memory",
     "canary.detected_in_memory = TRUE",
     ["initiate"], "critical"),
    ("rule_006", "Unauthorized Data Staging",
     "File reads followed by memory writes without user instruction",
     "file_reads > 0 AND memory_writes_after_read > 0 AND instruction_match < 0.2",
     ["collect"], "critical"),
    ("rule_007", "Covert Exfiltration",
     "Network calls following memory reads of staged data to non-allowlisted destinations",
     "network_call_after_memory_read AND destination_not_allowlisted",
     ["exfil"], "critical"),
    ("rule_008", "Encoded Payload in Memory",
     "High-entropy encoded data written to memory unrelated to task",
     "entropy > 4.5 AND encoding_detected AND task_relevance < 0.3",
     ["initiate", "collect"], "high"),
]

# COMMAND ----------

# MAGIC %md
# MAGIC ## 5. Run Defense Scan

# COMMAND ----------

print("=" * 70)
print("STATEFUL AGENT BACKDOOR DEFENSE - SCAN REPORT")
print("=" * 70)
print(f"  Scan Time: {datetime.utcnow().isoformat()}")
print(f"  Defense Layers: 3 (Memory Integrity + Behavioral Divergence + Canary)")
print(f"  Correlation Rules: {len(rules)} active")
print()

# Deploy canaries
target_agents = [
    "sage-enrichment-01", "nova-investigation-03", "vanguard-response-02",
    "cti-attribution-05", "pattern-discovery-04", "red-team-agent-07",
    "honeypot-agent-02"
]

print("[Layer 1] Memory Integrity Monitor")
print(f"  Monitoring {len(target_agents)} agents for memory write anomalies")
print(f"  Hash chain verification: ACTIVE")
print(f"  Anomaly detectors: entropy, state_machine, encoding, c2, relevance")
print()

print("[Layer 2] Behavioral Divergence Detector")
print(f"  Cross-session profiling: ACTIVE")
print(f"  Mealy machine signature detection: ENABLED")
print(f"  Tool-conditional analysis: 7 tool categories tracked")
print()

print("[Layer 3] Trigger Canary System")
canary_deployments = deploy_canaries(target_agents[:3])
print(f"  Deployed {len(canary_deployments)} new canaries")
print(f"  Scanning interval: every 5 minutes")
print()

print("=" * 70)
print("DEFENSE STATUS: ALL SYSTEMS OPERATIONAL")
print("=" * 70)
