# Databricks notebook source
# MAGIC %md
# MAGIC # Detection SLM: Small Language Model Alert Classifier
# MAGIC
# MAGIC Rapid alert classification using a lightweight Foundation Model endpoint.
# MAGIC Produces `slm_classifications` records consumed by Detection Confluence (Lens 4/7).
# MAGIC
# MAGIC **Architecture:**
# MAGIC - Fetches unclassified alerts from the `alerts` table
# MAGIC - Classifies each alert into: MALICIOUS, SUSPICIOUS, BENIGN, NOISY
# MAGIC - Maps classifications to MITRE tactics where applicable
# MAGIC - Writes results to `slm_classifications` for confluence fusion
# MAGIC
# MAGIC **Why a separate SLM lens?**
# MAGIC - The triage agent (Agent 01) classifies for SOC workflow (TP/FP/INVESTIGATE)
# MAGIC - The SLM lens classifies for detection confidence (MALICIOUS/BENIGN)
# MAGIC - Different perspectives improve fusion accuracy through disagreement detection
# MAGIC - SLM runs faster (smaller model, no tool use) for near-real-time scoring
# MAGIC
# MAGIC **KS Enhancement:** Confidence scores are calibrated against historical classification
# MAGIC distributions to detect model drift.

# COMMAND ----------

# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

# MAGIC %md
# MAGIC ## Configuration

# COMMAND ----------

dbutils.widgets.text("batch_size", "100", "Max alerts to classify per run")
dbutils.widgets.text("lookback_minutes", "15", "Alert age window in minutes")
dbutils.widgets.text("min_confidence_threshold", "0.4", "Minimum confidence to persist")
dbutils.widgets.text("calibration_days", "7", "Days of history for confidence calibration")

batch_size = int(dbutils.widgets.get("batch_size"))
lookback_minutes = int(dbutils.widgets.get("lookback_minutes"))
min_confidence_threshold = float(dbutils.widgets.get("min_confidence_threshold"))
calibration_days = int(dbutils.widgets.get("calibration_days"))

require_tables("alerts", "slm_classifications")

mon.log_event("config_loaded", {
    "batch_size": batch_size,
    "lookback_minutes": lookback_minutes,
    "min_confidence_threshold": min_confidence_threshold,
})

# COMMAND ----------

from pyspark.sql.functions import *
from pyspark.sql.types import *
from datetime import datetime, timedelta
import json
import numpy as np
from scipy import stats as scipy_stats

# COMMAND ----------

# MAGIC %md
# MAGIC ## Classification Schema

# COMMAND ----------

VALID_CLASSIFICATIONS = {"MALICIOUS", "SUSPICIOUS", "BENIGN", "NOISY"}

MITRE_TACTIC_MAP = {
    "brute_force": "credential-access",
    "credential_access": "credential-access",
    "exfiltration": "exfiltration",
    "data_exfiltration": "exfiltration",
    "lateral_movement": "lateral-movement",
    "privilege_escalation": "privilege-escalation",
    "persistence": "persistence",
    "command_and_control": "command-and-control",
    "c2": "command-and-control",
    "malware": "execution",
    "phishing": "initial-access",
    "reconnaissance": "reconnaissance",
    "discovery": "discovery",
    "defense_evasion": "defense-evasion",
    "impact": "impact",
    "ransomware": "impact",
    "port_scan": "reconnaissance",
    "dns_tunnel": "command-and-control",
}

SLM_SYSTEM_PROMPT = """You are a security detection classifier. Classify alerts rapidly and accurately.

For each alert, output JSON with:
- classification: MALICIOUS | SUSPICIOUS | BENIGN | NOISY
- confidence: 0.0 to 1.0
- mitre_tactic: MITRE ATT&CK tactic if applicable, else null
- reasoning: one sentence

Classification guide:
- MALICIOUS: Clear indicators of compromise, high-confidence threat activity
- SUSPICIOUS: Anomalous behavior requiring investigation, possibly malicious
- BENIGN: Legitimate activity that triggered a rule, no threat
- NOISY: Known false-positive pattern, infrastructure noise, health checks

Respond with JSON only."""

# COMMAND ----------

# MAGIC %md
# MAGIC ## Load Historical Calibration Data
# MAGIC
# MAGIC Build per-classification confidence distributions from recent history
# MAGIC to detect when the model's confidence scores drift.

# COMMAND ----------

slm_table = cfg.get_table_path("slm_classifications")

spark.sql(f"""
    CREATE TABLE IF NOT EXISTS {slm_table} (
        id STRING,
        alert_id STRING NOT NULL,
        classification STRING NOT NULL,
        confidence DOUBLE,
        mitre_tactic STRING,
        classified_at TIMESTAMP,
        processed_by_confluence BOOLEAN DEFAULT false,
        model_endpoint STRING,
        raw_reasoning STRING,
        calibrated_confidence DOUBLE
    )
    USING DELTA
    TBLPROPERTIES ('delta.autoOptimize.optimizeWrite' = 'true')
""")

# Load calibration baselines
calibration_baselines = {}
try:
    cal_df = spark.sql(f"""
        SELECT classification, confidence
        FROM {slm_table}
        WHERE classified_at > current_timestamp() - INTERVAL {calibration_days} DAYS
          AND confidence IS NOT NULL
    """).toPandas()

    if len(cal_df) >= 50:
        for cls, group in cal_df.groupby("classification"):
            calibration_baselines[cls] = group["confidence"].values.astype(float)
        print(f"Loaded calibration baselines: {len(cal_df)} records across {len(calibration_baselines)} classes")
    else:
        print(f"Insufficient calibration history ({len(cal_df)} records). Using raw confidence.")
except Exception as e:
    print(f"Calibration load skipped: {e}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Fetch Unclassified Alerts

# COMMAND ----------

alerts_table = cfg.get_table_path("alerts")

with mon.time("fetch_alerts"):
    unclassified = spark.sql(f"""
        SELECT a.id, a.title, a.description, a.severity, a.source,
               a.source_ip, a.event_type, a.mitre_tactic as existing_mitre,
               a.created_at
        FROM {alerts_table} a
        LEFT JOIN {slm_table} s ON a.id = s.alert_id
        WHERE a.created_at > current_timestamp() - INTERVAL {lookback_minutes} MINUTES
          AND s.alert_id IS NULL
        ORDER BY
            CASE a.severity
                WHEN 'critical' THEN 1 WHEN 'high' THEN 2
                WHEN 'medium' THEN 3 ELSE 4
            END,
            a.created_at DESC
        LIMIT {batch_size}
    """)

    alert_count = unclassified.count()
    mon.log_event("alerts_fetched", {"count": alert_count})

    if alert_count == 0:
        mon.log_complete(details={"status": "idle", "alerts": 0})
        print("No unclassified alerts in window.")
        dbutils.notebook.exit('{"status": "idle", "classified": 0}')

print(f"Fetched {alert_count} alerts for SLM classification")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Classify via Foundation Model

# COMMAND ----------

alerts_data = unclassified.collect()
classifications = []

with mon.time("slm_classification"):
    for alert in alerts_data:
        user_prompt = (
            f"Alert ID: {alert.id}\n"
            f"Title: {alert.title or 'N/A'}\n"
            f"Description: {(alert.description or 'N/A')[:400]}\n"
            f"Severity: {alert.severity or 'unknown'}\n"
            f"Source: {alert.source or 'unknown'}\n"
            f"Source IP: {alert.source_ip or 'N/A'}\n"
            f"Event Type: {alert.event_type or 'N/A'}\n"
        )

        try:
            response = llm.chat(
                system=SLM_SYSTEM_PROMPT,
                user=user_prompt,
                temperature=0.05,
                max_tokens=256,
                json_mode=True,
            )

            parsed = llm.extract_json(response)

            if parsed and isinstance(parsed, dict):
                classification = str(parsed.get("classification", "SUSPICIOUS")).upper()
                if classification not in VALID_CLASSIFICATIONS:
                    classification = "SUSPICIOUS"

                raw_confidence = min(1.0, max(0.0, float(parsed.get("confidence", 0.5))))

                # Infer MITRE tactic from response or alert context
                mitre = parsed.get("mitre_tactic")
                if not mitre and alert.event_type:
                    event_lower = alert.event_type.lower()
                    for pattern, tactic in MITRE_TACTIC_MAP.items():
                        if pattern in event_lower:
                            mitre = tactic
                            break
                if not mitre and alert.existing_mitre:
                    mitre = alert.existing_mitre

                reasoning = str(parsed.get("reasoning", ""))[:300]

                classifications.append({
                    "alert_id": alert.id,
                    "classification": classification,
                    "confidence": raw_confidence,
                    "mitre_tactic": mitre,
                    "reasoning": reasoning,
                    "model_endpoint": response.model,
                    "tokens_used": response.tokens_total,
                })
            else:
                classifications.append({
                    "alert_id": alert.id,
                    "classification": "SUSPICIOUS",
                    "confidence": 0.3,
                    "mitre_tactic": alert.existing_mitre,
                    "reasoning": "SLM returned unparseable response",
                    "model_endpoint": response.model if response else "unknown",
                    "tokens_used": response.tokens_total if response else 0,
                })

        except Exception as e:
            mon.log_event("slm_error", {"alert_id": alert.id, "error": str(e)[:200]})
            classifications.append({
                "alert_id": alert.id,
                "classification": "SUSPICIOUS",
                "confidence": 0.2,
                "mitre_tactic": None,
                "reasoning": f"SLM error: {str(e)[:100]}",
                "model_endpoint": "error",
                "tokens_used": 0,
            })

print(f"Classified {len(classifications)} alerts")
class_dist = {}
for c in classifications:
    class_dist[c["classification"]] = class_dist.get(c["classification"], 0) + 1
print(f"Distribution: {class_dist}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Confidence Calibration (KS-Based Drift Detection)
# MAGIC
# MAGIC If historical baselines exist, check whether new confidence scores
# MAGIC follow the expected distribution. Flag drift if KS test rejects.

# COMMAND ----------

calibrated_classifications = []
drift_detected = False

with mon.time("calibration"):
    for cls_record in classifications:
        classification = cls_record["classification"]
        raw_conf = cls_record["confidence"]
        calibrated_conf = raw_conf

        if classification in calibration_baselines:
            baseline = calibration_baselines[classification]
            if len(baseline) >= 20:
                percentile = scipy_stats.percentileofscore(baseline, raw_conf) / 100.0
                # Calibrated confidence: blend raw with percentile rank
                calibrated_conf = 0.7 * raw_conf + 0.3 * percentile
                calibrated_conf = round(min(1.0, max(0.0, calibrated_conf)), 4)

        cls_record["calibrated_confidence"] = calibrated_conf
        calibrated_classifications.append(cls_record)

    # Batch drift detection: compare this batch's confidences against history
    if calibration_baselines and len(classifications) >= 10:
        batch_confidences = np.array([c["confidence"] for c in classifications])
        all_historical = np.concatenate(list(calibration_baselines.values()))

        if len(all_historical) >= 30:
            ks_stat, p_value = scipy_stats.ks_2samp(batch_confidences, all_historical)
            if p_value < 0.01:
                drift_detected = True
                mon.log_event("slm_drift_detected", {
                    "ks_stat": float(ks_stat),
                    "p_value": float(p_value),
                    "batch_mean": float(np.mean(batch_confidences)),
                    "historical_mean": float(np.mean(all_historical)),
                })
                print(f"MODEL DRIFT DETECTED: KS={ks_stat:.4f}, p={p_value:.6f}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Persist Classifications

# COMMAND ----------

# Filter by minimum confidence threshold (benign below threshold still persisted to avoid re-processing)
persist_records = [
    c for c in calibrated_classifications
    if c["calibrated_confidence"] >= min_confidence_threshold or c["classification"] == "BENIGN"
]

if persist_records:
    with mon.time("persist"):
        schema = StructType([
            StructField("alert_id", StringType(), False),
            StructField("classification", StringType(), False),
            StructField("confidence", DoubleType(), True),
            StructField("mitre_tactic", StringType(), True),
            StructField("model_endpoint", StringType(), True),
            StructField("reasoning", StringType(), True),
            StructField("calibrated_confidence", DoubleType(), True),
        ])

        persist_data = [{
            "alert_id": r["alert_id"],
            "classification": r["classification"],
            "confidence": r["calibrated_confidence"],
            "mitre_tactic": r["mitre_tactic"],
            "model_endpoint": r["model_endpoint"],
            "reasoning": r["reasoning"],
            "calibrated_confidence": r["calibrated_confidence"],
        } for r in persist_records]

        cls_df = (
            spark.createDataFrame(persist_data, schema=schema)
            .withColumn("id", expr("uuid()"))
            .withColumn("classified_at", current_timestamp())
            .withColumn("processed_by_confluence", lit(False))
            .withColumn("raw_reasoning", col("reasoning"))
        )

        cls_df.select(
            "id", "alert_id", "classification", "confidence",
            "mitre_tactic", "classified_at", "processed_by_confluence",
            "model_endpoint", "raw_reasoning", "calibrated_confidence"
        ).write.mode("append").saveAsTable(slm_table)

        print(f"Persisted {len(persist_records)} classifications to {slm_table}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Summary

# COMMAND ----------

result = {
    "notebook": "03_detection_slm",
    "status": "completed",
    "alerts_classified": len(classifications),
    "persisted": len(persist_records) if persist_records else 0,
    "distribution": class_dist,
    "drift_detected": drift_detected,
    "mean_confidence": round(float(np.mean([c["calibrated_confidence"] for c in calibrated_classifications])), 4) if calibrated_classifications else 0,
}

mon.log_complete(details=result)
print(json.dumps(result, indent=2))
dbutils.notebook.exit(json.dumps(result))
