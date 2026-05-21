# Databricks notebook source
# MAGIC %md
# MAGIC # ML Model Monitoring & Drift Detection
# MAGIC
# MAGIC Tracks production model performance and detects:
# MAGIC - Data drift (input feature distribution changes)
# MAGIC - Prediction drift (model output distribution changes)
# MAGIC - Concept drift (ground truth vs prediction gap widening)
# MAGIC - Model staleness (time since last retrain)
# MAGIC
# MAGIC Monitors all registered ML experiments and triggers retraining when needed.

# COMMAND ----------

from pyspark.sql.functions import *
from pyspark.sql.types import *
from datetime import datetime, timedelta
import mlflow
from mlflow.tracking import MlflowClient
import json
import numpy as np

# COMMAND ----------

dbutils.widgets.text("catalog", "soc_platform", "Unity Catalog name")
dbutils.widgets.text("schema", "agentic_soc", "Schema name")
dbutils.widgets.text("drift_threshold", "0.15", "KL-divergence threshold for drift alert")
dbutils.widgets.text("staleness_days", "7", "Days before model is considered stale")

catalog = dbutils.widgets.get("catalog")
schema = dbutils.widgets.get("schema")
drift_threshold = float(dbutils.widgets.get("drift_threshold"))
staleness_days = int(dbutils.widgets.get("staleness_days"))

spark.sql(f"USE CATALOG `{catalog}`")
spark.sql(f"USE SCHEMA `{schema}`")

# COMMAND ----------

# MAGIC %md
# MAGIC ## List Monitored Experiments

# COMMAND ----------

MONITORED_EXPERIMENTS = [
    "/Shared/0xDSI/experiments/behavioral_anomaly_detection",
    "/Shared/0xDSI/experiments/graphrag_zero_day_detection",
    "/Shared/0xDSI/experiments/threat_scoring_model",
    "/Shared/0xDSI/experiments/ueba_behavioral_baseline",
]

mlflow_client = MlflowClient()
monitoring_results = []
now = datetime.utcnow()

# COMMAND ----------

# MAGIC %md
# MAGIC ## Check Each Experiment

# COMMAND ----------

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

        # Get latest successful run
        runs = mlflow_client.search_runs(
            experiment_ids=[experiment.experiment_id],
            filter_string="status = 'FINISHED'",
            order_by=["start_time DESC"],
            max_results=5,
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

        # Check staleness
        is_stale = days_since > staleness_days

        # Check for drift by comparing metrics between recent runs
        drift_detected = False
        drift_details = {}

        if len(runs) >= 2:
            latest_metrics = latest_run.data.metrics
            prev_run = runs[1]
            prev_metrics = prev_run.data.metrics

            # Compare key metrics between runs
            for metric_name in latest_metrics:
                if metric_name in prev_metrics:
                    current_val = latest_metrics[metric_name]
                    prev_val = prev_metrics[metric_name]
                    if prev_val != 0:
                        relative_change = abs(current_val - prev_val) / abs(prev_val)
                        if relative_change > drift_threshold:
                            drift_detected = True
                            drift_details[metric_name] = {
                                "previous": prev_val,
                                "current": current_val,
                                "change_pct": round(relative_change * 100, 1),
                            }

        # Determine overall status
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
            "latest_metrics": json.dumps({k: round(v, 4) for k, v in latest_metrics.items()}) if runs else None,
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

# COMMAND ----------

# MAGIC %md
# MAGIC ## Data Drift Analysis (Feature Distribution)

# COMMAND ----------

def check_feature_drift():
    """Compare current feature distributions against training baselines."""
    drift_alerts = []

    # Check behavioral anomaly features
    try:
        current_features = spark.sql("""
            SELECT
                AVG(event_count) as avg_events,
                STDDEV(event_count) as std_events,
                AVG(unique_ips) as avg_ips,
                AVG(failure_count) as avg_failures,
                AVG(off_hours_events) as avg_offhours,
                COUNT(*) as sample_size
            FROM (
                SELECT
                    user_id,
                    COUNT(*) as event_count,
                    COUNT(DISTINCT source_ip) as unique_ips,
                    SUM(CASE WHEN outcome = 'failure' THEN 1 ELSE 0 END) as failure_count,
                    SUM(CASE WHEN HOUR(timestamp) < 6 OR HOUR(timestamp) > 22 THEN 1 ELSE 0 END) as off_hours_events
                FROM events
                WHERE timestamp > current_timestamp() - INTERVAL 24 HOURS
                AND user_id IS NOT NULL
                GROUP BY user_id
                HAVING COUNT(*) >= 5
            )
        """).collect()

        baseline_features = spark.sql("""
            SELECT
                AVG(event_count) as avg_events,
                STDDEV(event_count) as std_events,
                AVG(unique_ips) as avg_ips,
                AVG(failure_count) as avg_failures,
                AVG(off_hours_events) as avg_offhours,
                COUNT(*) as sample_size
            FROM (
                SELECT
                    user_id,
                    COUNT(*) as event_count,
                    COUNT(DISTINCT source_ip) as unique_ips,
                    SUM(CASE WHEN outcome = 'failure' THEN 1 ELSE 0 END) as failure_count,
                    SUM(CASE WHEN HOUR(timestamp) < 6 OR HOUR(timestamp) > 22 THEN 1 ELSE 0 END) as off_hours_events
                FROM events
                WHERE timestamp BETWEEN current_timestamp() - INTERVAL 8 DAYS
                                    AND current_timestamp() - INTERVAL 1 DAY
                AND user_id IS NOT NULL
                GROUP BY user_id
                HAVING COUNT(*) >= 5
            )
        """).collect()

        if current_features and baseline_features:
            curr = current_features[0]
            base = baseline_features[0]

            features_to_check = ["avg_events", "avg_ips", "avg_failures", "avg_offhours"]
            for feat in features_to_check:
                curr_val = getattr(curr, feat) or 0
                base_val = getattr(base, feat) or 0
                if base_val > 0:
                    change = abs(curr_val - base_val) / base_val
                    if change > drift_threshold:
                        drift_alerts.append({
                            "feature": feat,
                            "baseline": round(base_val, 2),
                            "current": round(curr_val, 2),
                            "drift_pct": round(change * 100, 1),
                            "model": "behavioral_anomaly_detection",
                        })
    except Exception as e:
        print(f"Feature drift check failed: {e}")

    return drift_alerts

feature_drift = check_feature_drift()
print(f"Feature drift alerts: {len(feature_drift)}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Persist Monitoring Results

# COMMAND ----------

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
    monitoring_df.write.mode("append").saveAsTable("ml_model_monitoring")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Generate Alerts for Critical Issues

# COMMAND ----------

import uuid

alerts_to_create = []

for result in monitoring_results:
    if result["status"] == "critical":
        alerts_to_create.append({
            "id": str(uuid.uuid4()),
            "title": f"ML Model Critical: {result['experiment'].split('/')[-1]}",
            "description": f"Model is stale ({result.get('staleness_days')} days) AND showing drift. Immediate retraining required.",
            "severity": "high",
            "status": "new",
            "source": "ml_model_monitoring",
            "confidence": 0.9,
            "created_at": now,
        })
    elif result["status"] == "drift_detected":
        alerts_to_create.append({
            "id": str(uuid.uuid4()),
            "title": f"ML Drift Detected: {result['experiment'].split('/')[-1]}",
            "description": f"Model showing prediction drift. Details: {result.get('drift_details', 'N/A')}",
            "severity": "medium",
            "status": "new",
            "source": "ml_model_monitoring",
            "confidence": 0.85,
            "created_at": now,
        })

for drift in feature_drift:
    alerts_to_create.append({
        "id": str(uuid.uuid4()),
        "title": f"Feature Drift: {drift['feature']} ({drift['model']})",
        "description": f"Feature '{drift['feature']}' drifted {drift['drift_pct']}% from baseline ({drift['baseline']} -> {drift['current']})",
        "severity": "medium",
        "status": "new",
        "source": "ml_model_monitoring",
        "confidence": 0.8,
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
    alerts_df.write.mode("append").saveAsTable("alerts")
    print(f"Created {len(alerts_to_create)} ML monitoring alerts")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Trigger Automatic Retraining (if configured)

# COMMAND ----------

retrain_triggered = []

for result in monitoring_results:
    if result["status"] in ("critical", "drift_detected"):
        experiment_name = result["experiment"].split("/")[-1]
        # Map experiments to their retraining notebooks
        retrain_map = {
            "behavioral_anomaly_detection": "../detection/01_behavioral_anomaly_detection",
            "threat_scoring_model": "../ml_training/01_threat_scoring_model",
            "ueba_behavioral_baseline": "../ml_training/03_ueba_behavioral_baseline",
        }
        notebook = retrain_map.get(experiment_name)
        if notebook:
            try:
                dbutils.notebook.run(notebook, timeout_seconds=600, arguments={
                    "catalog": catalog,
                    "schema": schema,
                })
                retrain_triggered.append(experiment_name)
                print(f"Retrained: {experiment_name}")
            except Exception as e:
                print(f"Retrain failed for {experiment_name}: {e}")

# COMMAND ----------

# Update agent status
spark.sql(f"""
    MERGE INTO agent_status AS target
    USING (SELECT
        'ml_model_monitoring' as agent_id,
        current_timestamp() as last_heartbeat,
        'running' as status,
        {len(monitoring_results)} as events_processed,
        {len(alerts_to_create)} as alerts_generated
    ) AS source
    ON target.agent_id = source.agent_id
    WHEN MATCHED THEN UPDATE SET *
    WHEN NOT MATCHED THEN INSERT *
""")

result = {
    "status": "completed",
    "experiments_checked": len(monitoring_results),
    "healthy": sum(1 for r in monitoring_results if r["status"] == "healthy"),
    "drift_detected": sum(1 for r in monitoring_results if r.get("drift_detected")),
    "stale": sum(1 for r in monitoring_results if r["status"] == "stale"),
    "critical": sum(1 for r in monitoring_results if r["status"] == "critical"),
    "feature_drift_alerts": len(feature_drift),
    "retrains_triggered": retrain_triggered,
}
print(json.dumps(result, indent=2))
dbutils.notebook.exit(json.dumps(result))
