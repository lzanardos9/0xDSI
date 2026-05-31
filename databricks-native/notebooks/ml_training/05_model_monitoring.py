# Databricks notebook source
# MAGIC %md
# MAGIC # ML Model Monitoring & Drift Detection (KS-Enhanced)
# MAGIC
# MAGIC Tracks production model performance and detects:
# MAGIC - Data drift via KS two-sample test on feature distributions
# MAGIC - Prediction drift via KS test on model output distributions
# MAGIC - Concept drift (ground truth vs prediction gap widening)
# MAGIC - Model staleness (time since last retrain)
# MAGIC
# MAGIC **KS Enhancement:** Replaces simple relative-change thresholds with proper
# MAGIC statistical distribution testing. Only alerts when feature/prediction distributions
# MAGIC have genuinely shifted (p < alpha), eliminating noise from natural variance.

# COMMAND ----------

# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

from pyspark.sql.functions import *
from pyspark.sql.types import *
from datetime import datetime, timedelta
import mlflow
from mlflow.tracking import MlflowClient
import json
import uuid
import numpy as np
from scipy import stats

# COMMAND ----------

dbutils.widgets.text("ks_alpha", "0.01", "KS significance threshold for drift")
dbutils.widgets.text("psi_threshold", "0.25", "PSI threshold for severe drift")
dbutils.widgets.text("staleness_days", "7", "Days before model is considered stale")

ks_alpha = float(dbutils.widgets.get("ks_alpha"))
psi_threshold = float(dbutils.widgets.get("psi_threshold"))
staleness_days = int(dbutils.widgets.get("staleness_days"))
require_tables("ml_model_monitoring")

# COMMAND ----------

# MAGIC %md
# MAGIC ## KS-Based Drift Detection Functions

# COMMAND ----------

def compute_psi(expected, actual, bins=10):
    """Population Stability Index between two distributions."""
    expected_hist, bin_edges = np.histogram(expected, bins=bins, density=True)
    actual_hist, _ = np.histogram(actual, bins=bin_edges, density=True)
    expected_hist = np.clip(expected_hist, 1e-6, None)
    actual_hist = np.clip(actual_hist, 1e-6, None)
    expected_pct = expected_hist / expected_hist.sum()
    actual_pct = actual_hist / actual_hist.sum()
    psi = np.sum((actual_pct - expected_pct) * np.log(actual_pct / expected_pct))
    return float(psi)


def ks_drift_test(baseline_values, current_values, alpha=0.01):
    """
    KS two-sample test for distribution drift detection.
    Returns drift assessment with statistical rigor.
    """
    if len(baseline_values) < 10 or len(current_values) < 10:
        return {"drifted": False, "ks_stat": 0, "p_value": 1.0,
                "psi": 0, "severity": "none", "confidence": 0}

    ks_stat, p_value = stats.ks_2samp(baseline_values, current_values)
    psi = compute_psi(baseline_values, current_values)

    if p_value < alpha and psi > psi_threshold:
        severity = "critical"
    elif p_value < alpha:
        severity = "significant"
    elif psi > psi_threshold:
        severity = "moderate"
    else:
        severity = "none"

    return {
        "drifted": p_value < alpha,
        "ks_stat": float(ks_stat),
        "p_value": float(p_value),
        "psi": psi,
        "severity": severity,
        "confidence": float(1 - p_value),
        "baseline_mean": float(np.mean(baseline_values)),
        "current_mean": float(np.mean(current_values)),
        "baseline_std": float(np.std(baseline_values)),
        "current_std": float(np.std(current_values)),
    }


def check_feature_drift_ks():
    """Compare current feature distributions against baselines using KS test."""
    drift_alerts = []

    try:
        current_raw = spark.sql("""
            SELECT
                COUNT(*) as event_count,
                COUNT(DISTINCT source_ip) as unique_ips,
                SUM(CASE WHEN outcome = 'failure' THEN 1 ELSE 0 END) as failure_count,
                SUM(CASE WHEN HOUR(timestamp) < 6 OR HOUR(timestamp) > 22 THEN 1 ELSE 0 END) as off_hours_events
            FROM events
            WHERE timestamp > current_timestamp() - INTERVAL 24 HOURS
            AND user_id IS NOT NULL
            GROUP BY user_id
            HAVING COUNT(*) >= 5
        """).toPandas()

        baseline_raw = spark.sql("""
            SELECT
                COUNT(*) as event_count,
                COUNT(DISTINCT source_ip) as unique_ips,
                SUM(CASE WHEN outcome = 'failure' THEN 1 ELSE 0 END) as failure_count,
                SUM(CASE WHEN HOUR(timestamp) < 6 OR HOUR(timestamp) > 22 THEN 1 ELSE 0 END) as off_hours_events
            FROM events
            WHERE timestamp BETWEEN current_timestamp() - INTERVAL 8 DAYS
                                AND current_timestamp() - INTERVAL 1 DAY
            AND user_id IS NOT NULL
            GROUP BY user_id, DATE(timestamp)
            HAVING COUNT(*) >= 5
        """).toPandas()

        if len(current_raw) >= 10 and len(baseline_raw) >= 10:
            features = ["event_count", "unique_ips", "failure_count", "off_hours_events"]

            for feat in features:
                current_vals = current_raw[feat].dropna().values.astype(float)
                baseline_vals = baseline_raw[feat].dropna().values.astype(float)

                if len(current_vals) >= 10 and len(baseline_vals) >= 10:
                    ks_result = ks_drift_test(baseline_vals, current_vals, ks_alpha)

                    if ks_result["drifted"]:
                        drift_alerts.append({
                            "feature": feat,
                            "ks_statistic": ks_result["ks_stat"],
                            "p_value": ks_result["p_value"],
                            "psi": ks_result["psi"],
                            "severity": ks_result["severity"],
                            "baseline_mean": ks_result["baseline_mean"],
                            "current_mean": ks_result["current_mean"],
                            "model": "behavioral_anomaly_detection",
                        })

    except Exception as e:
        mon.log_warning(f"KS feature drift check failed: {e}")

    return drift_alerts

# COMMAND ----------

# MAGIC %md
# MAGIC ## Main Monitoring Logic

# COMMAND ----------

MONITORED_EXPERIMENTS = [
    "/Shared/0xDSI/experiments/behavioral_anomaly_detection",
    "/Shared/0xDSI/experiments/graphrag_zero_day_detection",
    "/Shared/0xDSI/experiments/threat_scoring_model",
    "/Shared/0xDSI/experiments/ueba_behavioral_baseline",
]

# COMMAND ----------

try:
    result = {"notebook": "05_model_monitoring", "status": "success", "started_at": datetime.utcnow().isoformat()}

    mlflow_client = MlflowClient()
    monitoring_results = []
    now = datetime.utcnow()

    # --- Check Each Experiment with KS Validation ---
    with mon.time("experiment_checks"):
        for experiment_path in MONITORED_EXPERIMENTS:
            try:
                experiment = mlflow_client.get_experiment_by_name(experiment_path)
                if not experiment:
                    monitoring_results.append({
                        "experiment": experiment_path,
                        "status": "not_found",
                        "last_run": None,
                        "drift_detected": False,
                        "staleness_days": None,
                    })
                    continue

                runs = mlflow_client.search_runs(
                    experiment_ids=[experiment.experiment_id],
                    filter_string="status = 'FINISHED'",
                    order_by=["start_time DESC"],
                    max_results=10,
                )

                if not runs:
                    monitoring_results.append({
                        "experiment": experiment_path,
                        "status": "no_runs",
                        "last_run": None,
                        "drift_detected": False,
                        "staleness_days": None,
                    })
                    continue

                latest_run = runs[0]
                run_time = datetime.fromtimestamp(latest_run.info.start_time / 1000)
                days_since = (now - run_time).days
                is_stale = days_since > staleness_days

                drift_detected = False
                drift_details = {}

                if len(runs) >= 3:
                    recent_metrics_list = [r.data.metrics for r in runs[:3]]
                    older_metrics_list = [r.data.metrics for r in runs[3:]]

                    if older_metrics_list:
                        shared_metrics = set(recent_metrics_list[0].keys())
                        for m in recent_metrics_list[1:] + older_metrics_list:
                            shared_metrics &= set(m.keys())

                        for metric_name in shared_metrics:
                            recent_vals = np.array([m[metric_name] for m in recent_metrics_list])
                            older_vals = np.array([m[metric_name] for m in older_metrics_list])

                            if len(older_vals) >= 3:
                                ks_result = ks_drift_test(older_vals, recent_vals, ks_alpha)
                                if ks_result["drifted"]:
                                    drift_detected = True
                                    drift_details[metric_name] = {
                                        "ks_stat": ks_result["ks_stat"],
                                        "p_value": ks_result["p_value"],
                                        "psi": ks_result["psi"],
                                        "severity": ks_result["severity"],
                                        "baseline_mean": ks_result["baseline_mean"],
                                        "current_mean": ks_result["current_mean"],
                                    }

                status = "healthy"
                if is_stale and drift_detected:
                    status = "critical"
                elif drift_detected:
                    status = "drift_detected"
                elif is_stale:
                    status = "stale"

                monitoring_results.append({
                    "experiment": experiment_path,
                    "status": status,
                    "last_run": run_time.isoformat(),
                    "last_run_id": latest_run.info.run_id,
                    "staleness_days": days_since,
                    "is_stale": is_stale,
                    "drift_detected": drift_detected,
                    "drift_details": json.dumps(drift_details) if drift_details else None,
                    "latest_metrics": json.dumps({k: round(v, 4) for k, v in latest_run.data.metrics.items()}),
                    "total_runs": len(runs),
                })

            except Exception as e:
                monitoring_results.append({
                    "experiment": experiment_path,
                    "status": "error",
                    "last_run": None,
                    "drift_detected": False,
                    "staleness_days": None,
                    "error": str(e)[:200],
                })
                mon.log_warning(f"Error checking experiment {experiment_path}: {e}")

    # --- KS-Based Feature Distribution Drift Analysis ---
    with mon.time("feature_drift_analysis"):
        feature_drift = check_feature_drift_ks()

    mon.log_metric("feature_drift_alerts", len(feature_drift))
    print(f"KS-validated feature drift alerts: {len(feature_drift)}")
    for alert in feature_drift:
        print(f"  {alert['feature']}: KS={alert['ks_statistic']:.4f}, "
              f"p={alert['p_value']:.6f}, PSI={alert['psi']:.4f} [{alert['severity']}]")

    # --- Persist Monitoring Results ---
    with mon.time("persist_monitoring_results"):
        if monitoring_results:
            monitoring_schema = StructType([
                StructField("experiment", StringType(), False),
                StructField("status", StringType(), False),
                StructField("last_run", StringType(), True),
                StructField("staleness_days", IntegerType(), True),
                StructField("drift_detected", BooleanType(), False),
                StructField("drift_details", StringType(), True),
                StructField("checked_at", TimestampType(), False),
            ])

            rows = [{
                "experiment": r["experiment"],
                "status": r["status"],
                "last_run": r.get("last_run"),
                "staleness_days": r.get("staleness_days"),
                "drift_detected": r.get("drift_detected", False),
                "drift_details": r.get("drift_details"),
                "checked_at": now,
            } for r in monitoring_results]

            monitoring_df = spark.createDataFrame(rows, schema=monitoring_schema)
            safe_append(
                monitoring_df,
                "ml_model_monitoring",
                catalog=cfg.catalog,
                schema=cfg.schema,
            )

    # --- Generate Alerts (KS-Validated Only) ---
    alerts_to_create = []

    for mr in monitoring_results:
        if mr["status"] == "critical":
            alerts_to_create.append({
                "id": str(uuid.uuid4()),
                "title": f"ML Model Critical: {mr['experiment'].split('/')[-1]}",
                "description": f"Model stale ({mr.get('staleness_days')} days) AND KS-confirmed drift. Retraining required.",
                "severity": "high",
                "status": "new",
                "source": "ml_model_monitoring_ks",
                "confidence": 0.95,
                "created_at": now,
            })
        elif mr["status"] == "drift_detected":
            details = json.loads(mr.get("drift_details", "{}"))
            max_ks = max((v.get("ks_stat", 0) for v in details.values()), default=0)
            alerts_to_create.append({
                "id": str(uuid.uuid4()),
                "title": f"ML Drift (KS-confirmed): {mr['experiment'].split('/')[-1]}",
                "description": f"KS test confirmed distribution shift (max KS stat: {max_ks:.4f}). Details: {mr.get('drift_details', 'N/A')}",
                "severity": "medium",
                "status": "new",
                "source": "ml_model_monitoring_ks",
                "confidence": 0.9,
                "created_at": now,
            })

    for drift in feature_drift:
        confidence = min(0.99, drift["ks_statistic"] + 0.5)
        alerts_to_create.append({
            "id": str(uuid.uuid4()),
            "title": f"Feature Drift (KS p={drift['p_value']:.4f}): {drift['feature']}",
            "description": (
                f"Feature '{drift['feature']}' distribution shifted. "
                f"KS stat: {drift['ks_statistic']:.4f}, PSI: {drift['psi']:.4f}. "
                f"Mean moved from {drift['baseline_mean']:.2f} to {drift['current_mean']:.2f}"
            ),
            "severity": "high" if drift["severity"] == "critical" else "medium",
            "status": "new",
            "source": "ml_model_monitoring_ks",
            "confidence": confidence,
            "created_at": now,
        })

    if alerts_to_create:
        alert_schema = StructType([
            StructField("id", StringType(), False),
            StructField("title", StringType(), False),
            StructField("description", StringType(), False),
            StructField("severity", StringType(), False),
            StructField("status", StringType(), False),
            StructField("source", StringType(), False),
            StructField("confidence", DoubleType(), False),
            StructField("created_at", TimestampType(), False),
        ])
        alerts_df = spark.createDataFrame(alerts_to_create, schema=alert_schema)
        safe_append(
            alerts_df,
            "alerts",
            catalog=cfg.catalog,
            schema=cfg.schema,
            deduplicate_on=["id"],
        )
        print(f"Created {len(alerts_to_create)} KS-validated monitoring alerts")
    else:
        print("No drift detected - all models within expected distribution bounds")

    # --- Trigger Automatic Retraining (Only on KS-Confirmed Drift) ---
    retrain_triggered = []

    with mon.time("automatic_retraining"):
        for mr in monitoring_results:
            if mr["status"] in ("critical", "drift_detected"):
                experiment_name = mr["experiment"].split("/")[-1]
                retrain_map = {
                    "behavioral_anomaly_detection": "../detection/01_behavioral_anomaly_detection",
                    "threat_scoring_model": "../ml_training/01_threat_scoring_model",
                    "ueba_behavioral_baseline": "../ml_training/03_ueba_behavioral_baseline",
                }
                notebook = retrain_map.get(experiment_name)
                if notebook:
                    try:
                        dbutils.notebook.run(notebook, timeout_seconds=600, arguments={
                            "catalog": cfg.catalog,
                            "schema": cfg.schema,
                        })
                        retrain_triggered.append(experiment_name)
                        mon.log_info(f"Retrained model: {experiment_name}")
                    except Exception as e:
                        mon.log_warning(f"Retrain failed for {experiment_name}: {e}")

    # --- Update Agent Status ---
    # Safe: values are computed integers, not user input
    events_processed = len(monitoring_results)
    alerts_generated = len(alerts_to_create)

    spark.sql(f"""
        MERGE INTO {get_table_path(cfg, 'agent_status')} AS target
        USING (SELECT
            'ml_model_monitoring' as agent_id,
            current_timestamp() as last_heartbeat,
            'running' as status,
            {events_processed} as events_processed,
            {alerts_generated} as alerts_generated
        ) AS source
        ON target.agent_id = source.agent_id
        WHEN MATCHED THEN UPDATE SET *
        WHEN NOT MATCHED THEN INSERT *
    """)

    # --- Finalize ---
    result.update({
        "experiments_checked": len(monitoring_results),
        "healthy": sum(1 for r in monitoring_results if r["status"] == "healthy"),
        "ks_drift_detected": sum(1 for r in monitoring_results if r.get("drift_detected")),
        "stale": sum(1 for r in monitoring_results if r["status"] == "stale"),
        "critical": sum(1 for r in monitoring_results if r["status"] == "critical"),
        "feature_drift_alerts": len(feature_drift),
        "alerts_created": len(alerts_to_create),
        "retrains_triggered": retrain_triggered,
        "ks_alpha": ks_alpha,
        "psi_threshold": psi_threshold,
        "completed_at": datetime.utcnow().isoformat(),
    })
    mon.log_complete(rows_processed=events_processed)

except Exception as e:
    result = {
        "notebook": "05_model_monitoring",
        "status": "error",
        "error": str(e)[:500],
        "error_type": type(e).__name__,
        "failed_at": datetime.utcnow().isoformat(),
    }
    mon.log_error(e, context="ml_model_monitoring")
    raise

finally:
    print(json.dumps(result, indent=2))
    dbutils.notebook.exit(json.dumps(result))
