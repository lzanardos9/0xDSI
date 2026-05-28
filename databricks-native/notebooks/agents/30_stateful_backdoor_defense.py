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

result = {"notebook": "30_stateful_backdoor_defense", "status": "success", "started_at": datetime.utcnow().isoformat()}

try:
    with mon.time("agent_start"):
        # Ensure required tables exist
        for tbl in ["agent_memory_snapshots", "agent_action_logs", "agent_baseline_profiles", "agent_output_log"]:
            spark.sql(f"""
                CREATE TABLE IF NOT EXISTS {cfg.get_table_path(tbl)} (
                    agent_id STRING NOT NULL,
                    {'memory_state STRING' if tbl == 'agent_memory_snapshots'
                     else 'recent_actions STRING' if tbl == 'agent_action_logs'
                     else 'profile STRING' if tbl == 'agent_baseline_profiles'
                     else 'output_content STRING'},
                    updated_at TIMESTAMP DEFAULT current_timestamp()
                ) USING DELTA
            """)

        spark.sql(f"""
            CREATE TABLE IF NOT EXISTS {detections_table} (
                detection_id STRING, agent_id STRING, layer STRING,
                severity STRING, detail STRING, metadata STRING,
                detected_at STRING
            ) USING DELTA
        """)

        spark.sql(f"""
            CREATE TABLE IF NOT EXISTS {baseline_table} (
                agent_id STRING, expected_hash STRING,
                updated_at TIMESTAMP DEFAULT current_timestamp()
            ) USING DELTA
        """)

        spark.sql(f"""
            CREATE TABLE IF NOT EXISTS {canary_table} (
                canary_id STRING, agent_id STRING, canary_token STRING,
                deployed_at STRING, leaked BOOLEAN DEFAULT false,
                leak_location STRING
            ) USING DELTA
        """)

    # --- Load Agent State Data (graceful if empty) ---
    with mon.time("load_agent_data"):
        snapshots_df = spark.table(cfg.get_table_path("agent_memory_snapshots"))
        agent_states = {}
        for row in snapshots_df.collect():
            try:
                agent_states[row["agent_id"]] = json.loads(row["memory_state"])
            except (json.JSONDecodeError, TypeError):
                pass

        logs_df = spark.table(cfg.get_table_path("agent_action_logs"))
        agent_action_logs = {}
        for row in logs_df.collect():
            try:
                agent_action_logs[row["agent_id"]] = json.loads(row["recent_actions"])
            except (json.JSONDecodeError, TypeError):
                pass

        profiles_df = spark.table(cfg.get_table_path("agent_baseline_profiles"))
        historical_profiles = {}
        for row in profiles_df.collect():
            try:
                historical_profiles[row["agent_id"]] = json.loads(row["profile"])
            except (json.JSONDecodeError, TypeError):
                pass

        output_df = spark.table(cfg.get_table_path("agent_output_log"))
        output_logs = [
            {"agent_id": row["agent_id"], "content": row["output_content"] or ""}
            for row in output_df.collect()
        ]

        mon.log_event("data_loaded", {
            "agent_states": len(agent_states),
            "action_logs": len(agent_action_logs),
            "profiles": len(historical_profiles),
            "output_logs": len(output_logs),
        })

    # --- Layer 1: Memory Integrity ---
    with mon.time("layer1_memory_integrity"):
        integrity_findings = check_memory_integrity(agent_states) if agent_states else []

    # --- Layer 2: Behavioral Divergence ---
    with mon.time("layer2_behavioral_divergence"):
        divergence_findings = check_behavioral_divergence(agent_action_logs, historical_profiles) if agent_action_logs and historical_profiles else []

    # --- Layer 3: Canary Tokens ---
    with mon.time("layer3_canary_tokens"):
        # Deploy new canaries if needed
        agent_ids_without_canary = set(agent_states.keys())
        try:
            existing_canaries = spark.read.table(canary_table).filter(F.col("leaked") == False)
            existing_agent_ids = set(row["agent_id"] for row in existing_canaries.select("agent_id").distinct().collect())
            agent_ids_without_canary -= existing_agent_ids
        except Exception:
            existing_canaries = None

        if agent_ids_without_canary:
            deploy_canaries(list(agent_ids_without_canary))

        # Scan for leaks
        active_canaries = []
        try:
            active_canaries = [row.asDict() for row in
                               spark.read.table(canary_table).filter(F.col("leaked") == False).collect()]
        except Exception:
            pass

        canary_findings = scan_for_canary_leaks(active_canaries, output_logs) if active_canaries and output_logs else []

    # --- Persist All Findings ---
    with mon.time("persist_findings"):
        all_findings = integrity_findings + divergence_findings + canary_findings
        detections_written = persist_detections(all_findings)

    result.update({
        "memory_integrity_findings": len(integrity_findings),
        "behavioral_divergence_findings": len(divergence_findings),
        "canary_leak_findings": len(canary_findings),
        "total_detections": detections_written,
        "agents_monitored": len(agent_states),
    })
    mon.log_complete(rows_processed=len(agent_states))

except Exception as e:
    result = {
        "notebook": "30_stateful_backdoor_defense",
        "status": "error",
        "error": str(e)[:500],
        "error_type": type(e).__name__,
        "failed_at": datetime.utcnow().isoformat(),
    }
    mon.log_error(e, context="stateful_backdoor_defense")
    raise

finally:
    print(json.dumps(result, indent=2))
    dbutils.notebook.exit(json.dumps(result))
