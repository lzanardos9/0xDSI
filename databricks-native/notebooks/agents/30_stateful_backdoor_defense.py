# Databricks notebook source
# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

# MAGIC %md
# MAGIC # Agent 30 - Stateful Backdoor Defense
# MAGIC Three defense layers:
# MAGIC 1. **Memory Integrity** - Hashes agent memory/state, compares to known-good baseline
# MAGIC 2. **Behavioral Divergence** - Tracks per-agent action patterns, detects deviations
# MAGIC 3. **Trigger Canary** - Plants unique tokens in prompts, checks for unauthorized leaks

# COMMAND ----------

import json
import hashlib
import math
import secrets
import string
from datetime import datetime
from pyspark.sql import functions as F

AGENT_NAME = "stateful_backdoor_defense"
AGENT_ID = 30
detections_table = cfg.get_table_path("backdoor_defense_detections")
baseline_table = cfg.get_table_path("agent_memory_baselines")
canary_table = cfg.get_table_path("canary_tokens")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Layer 1: Memory Integrity

# COMMAND ----------

def compute_state_hash(agent_id, memory_snapshot):
    """Hash full memory state to detect tampering."""
    canonical = json.dumps(memory_snapshot, sort_keys=True)
    return hashlib.sha256(f"{agent_id}:{canonical}".encode()).hexdigest()


def check_memory_integrity(agent_states):
    """Compare current memory hashes against known-good baselines."""
    mon.time("memory_integrity_check")
    baselines = {row["agent_id"]: row["expected_hash"]
                 for row in spark.read.table(baseline_table).collect()}
    findings = []
    for agent_id, snapshot in agent_states.items():
        current_hash = compute_state_hash(agent_id, snapshot)
        expected = baselines.get(agent_id)
        if expected and current_hash != expected:
            findings.append({
                "agent_id": agent_id, "layer": "memory_integrity",
                "severity": "critical",
                "detail": f"Hash mismatch: expected {expected[:12]}..., got {current_hash[:12]}...",
                "detected_at": datetime.utcnow().isoformat()
            })
            mon.log_event(event_type="memory_tamper_detected",
                          agent_id=agent_id, severity="critical")
    return findings

# COMMAND ----------

# MAGIC %md
# MAGIC ## Layer 2: Behavioral Divergence

# COMMAND ----------

def compute_action_distribution(actions):
    """Compute normalized frequency distribution of actions."""
    total = len(actions)
    if total == 0:
        return {}
    freq = {}
    for a in actions:
        freq[a] = freq.get(a, 0) + 1
    return {k: v / total for k, v in freq.items()}


def kl_divergence(p_dist, q_dist):
    """KL divergence between two distributions."""
    all_keys = set(list(p_dist.keys()) + list(q_dist.keys()))
    eps = 1e-10
    return sum(p_dist.get(k, eps) * math.log(p_dist.get(k, eps) / q_dist.get(k, eps))
               for k in all_keys)


def check_behavioral_divergence(agent_action_logs, historical_profiles):
    """Detect agents deviating from normal tool usage distribution."""
    mon.time("behavioral_divergence_check")
    findings = []
    threshold = 2.0

    for agent_id, recent_actions in agent_action_logs.items():
        baseline_dist = historical_profiles.get(agent_id, {}).get("action_distribution", {})
        if not baseline_dist:
            continue
        current_dist = compute_action_distribution(recent_actions)
        divergence = kl_divergence(current_dist, baseline_dist)

        if divergence > threshold:
            anomalous = sorted(current_dist.keys(),
                               key=lambda k: abs(current_dist.get(k, 0) - baseline_dist.get(k, 0)),
                               reverse=True)[:5]
            findings.append({
                "agent_id": agent_id, "layer": "behavioral_divergence",
                "severity": "high",
                "detail": f"KL divergence {divergence:.3f} exceeds threshold {threshold}",
                "top_anomalous_actions": anomalous,
                "detected_at": datetime.utcnow().isoformat()
            })
            mon.log_event(event_type="behavioral_divergence",
                          agent_id=agent_id, divergence=divergence)
    return findings

# COMMAND ----------

# MAGIC %md
# MAGIC ## Layer 3: Trigger Canary

# COMMAND ----------

def generate_canary_token():
    """Generate a unique 16-char canary token."""
    chars = string.ascii_letters + string.digits
    return "".join(secrets.choice(chars) for _ in range(16))


def deploy_canaries(agent_ids):
    """Plant canary tokens and persist to canary table."""
    mon.time("canary_deployment")
    records = []
    for agent_id in agent_ids:
        token = generate_canary_token()
        records.append({
            "canary_id": hashlib.sha256(f"{agent_id}:{token}".encode()).hexdigest()[:16],
            "agent_id": agent_id, "canary_token": token,
            "deployed_at": datetime.utcnow().isoformat(),
            "leaked": False, "leak_location": None
        })
    spark.createDataFrame(records).write.mode("append").saveAsTable(canary_table)
    return records


def scan_for_canary_leaks(canary_records, output_logs):
    """Check if canary tokens leaked to unauthorized outputs."""
    mon.time("canary_scan")
    findings = []
    for record in canary_records:
        token = record["canary_token"]
        source_agent = record["agent_id"]
        for entry in output_logs:
            if entry["agent_id"] == source_agent:
                continue
            if token in entry.get("content", ""):
                findings.append({
                    "agent_id": source_agent, "layer": "trigger_canary",
                    "severity": "critical",
                    "detail": f"Canary leaked from {source_agent} to {entry['agent_id']}",
                    "canary_id": record["canary_id"],
                    "detected_at": datetime.utcnow().isoformat()
                })
                mon.log_event(event_type="canary_leak",
                              source=source_agent, dest=entry["agent_id"])
    return findings

# COMMAND ----------

# MAGIC %md
# MAGIC ## Persist Detections

# COMMAND ----------

def persist_detections(all_findings):
    """Write detection findings to backdoor_defense_detections table."""
    if not all_findings:
        return 0
    rows = [{
        "detection_id": hashlib.sha256(json.dumps(f, sort_keys=True).encode()).hexdigest()[:16],
        "agent_id": f["agent_id"],
        "layer": f["layer"],
        "severity": f["severity"],
        "detail": f["detail"],
        "metadata": json.dumps({k: v for k, v in f.items()
                                if k not in ("agent_id", "layer", "severity", "detail")}),
        "detected_at": f["detected_at"]
    } for f in all_findings]

    spark.createDataFrame(rows).write.mode("append").saveAsTable(detections_table)
    return len(rows)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Execute Defense Scan

# COMMAND ----------

mon.time("agent_start")

agent_states = {r["agent_id"]: json.loads(r["memory_state"])
                for r in qb().table("agent_memory_snapshots").execute()}
agent_action_logs = {r["agent_id"]: json.loads(r["recent_actions"])
                     for r in qb().table("agent_action_logs").execute()}
historical_profiles = {r["agent_id"]: json.loads(r["profile"])
                       for r in qb().table("agent_baseline_profiles").execute()}
output_logs = [{"agent_id": r["agent_id"], "content": r["output_content"]}
               for r in qb().table("agent_output_log").execute()]

# Layer 1
integrity_findings = check_memory_integrity(agent_states)

# Layer 2
divergence_findings = check_behavioral_divergence(agent_action_logs, historical_profiles)

# Layer 3
active_canaries = [row.asDict() for row in
                   spark.read.table(canary_table).filter(F.col("leaked") == False).collect()]
canary_findings = scan_for_canary_leaks(active_canaries, output_logs)

# Persist all
all_findings = integrity_findings + divergence_findings + canary_findings
detections_written = persist_detections(all_findings)

summary = {
    "agent_id": AGENT_ID,
    "agent_name": AGENT_NAME,
    "memory_integrity_findings": len(integrity_findings),
    "behavioral_divergence_findings": len(divergence_findings),
    "canary_leak_findings": len(canary_findings),
    "total_detections": detections_written,
    "status": "success"
}

mon.log_complete(summary)
dbutils.notebook.exit(json.dumps(summary))
