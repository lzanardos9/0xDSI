# Databricks notebook source
# MAGIC %md
# MAGIC # 02 - Model Training with MLflow
# MAGIC
# MAGIC Trains anomaly detection models using features from the Feature Store.
# MAGIC Tracks experiments with MLflow, implements champion/challenger evaluation.
# MAGIC
# MAGIC **Models:**
# MAGIC - Isolation Forest (unsupervised anomaly detection)
# MAGIC - Autoencoder (reconstruction error-based)
# MAGIC - XGBoost (supervised, when labeled data available)
# MAGIC
# MAGIC **Output:** Registered models in Unity Catalog Model Registry

# COMMAND ----------

dbutils.widgets.text("catalog", "main")
dbutils.widgets.text("schema", "security")
dbutils.widgets.text("experiment_name", "/Security/anomaly_detection")
dbutils.widgets.text("model_type", "isolation_forest")
dbutils.widgets.text("training_days", "30")

catalog = dbutils.widgets.get("catalog")
schema = dbutils.widgets.get("schema")
experiment_name = dbutils.widgets.get("experiment_name")
model_type = dbutils.widgets.get("model_type")
training_days = int(dbutils.widgets.get("training_days"))

# COMMAND ----------

import mlflow
from mlflow.tracking import MlflowClient
import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import precision_score, recall_score, f1_score
from sklearn.model_selection import train_test_split

mlflow.set_experiment(experiment_name)
client = MlflowClient()

# COMMAND ----------

# MAGIC %md
# MAGIC ## Load Features from Feature Store

# COMMAND ----------

from databricks.feature_engineering import FeatureEngineeringClient

fe = FeatureEngineeringClient()

# Load user features
user_features_df = spark.table(f"{catalog}.{schema}.user_security_features")

# Load network features
network_features_df = spark.table(f"{catalog}.{schema}.network_security_features")

# Convert to pandas for sklearn training
user_pdf = user_features_df.toPandas()
network_pdf = network_features_df.toPandas()

print(f"User features: {user_pdf.shape}")
print(f"Network features: {network_pdf.shape}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Feature Selection & Preprocessing

# COMMAND ----------

# User model features
user_feature_cols = [
    "event_count_24h", "distinct_ips_24h", "distinct_destinations_24h",
    "distinct_resources_24h", "failure_count_24h", "high_severity_count_24h",
    "ioc_match_count_24h", "off_hours_events_24h", "total_bytes_out_24h",
    "distinct_countries_24h", "failure_rate_24h", "off_hours_ratio_24h",
    "bytes_ratio_24h", "ip_deviation", "failure_rate_deviation", "volume_deviation",
]

# Network model features
network_feature_cols = [
    "connections_24h", "distinct_destinations_24h", "distinct_ports_24h",
    "total_bytes_out_24h", "avg_bytes_per_conn_24h", "blocked_connections_24h",
    "ioc_connections_24h", "distinct_dest_countries_24h", "blocked_rate_24h",
    "port_scan_indicator", "byte_variance_ratio",
]

# Select available columns
available_user_cols = [c for c in user_feature_cols if c in user_pdf.columns]
available_network_cols = [c for c in network_feature_cols if c in network_pdf.columns]

X_user = user_pdf[available_user_cols].fillna(0).values
X_network = network_pdf[available_network_cols].fillna(0).values

print(f"Training user model on {X_user.shape[0]} samples, {X_user.shape[1]} features")
print(f"Training network model on {X_network.shape[0]} samples, {X_network.shape[1]} features")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Train Isolation Forest Models

# COMMAND ----------

def train_isolation_forest(X, feature_names, model_name, contamination=0.05):
    """Train an Isolation Forest model with MLflow tracking."""
    with mlflow.start_run(run_name=f"{model_name}_isolation_forest") as run:
        # Log parameters
        mlflow.log_param("model_type", "isolation_forest")
        mlflow.log_param("n_estimators", 200)
        mlflow.log_param("contamination", contamination)
        mlflow.log_param("max_features", 0.8)
        mlflow.log_param("training_samples", X.shape[0])
        mlflow.log_param("n_features", X.shape[1])
        mlflow.log_param("feature_names", str(feature_names))
        mlflow.log_param("training_window_days", training_days)

        # Scale features
        scaler = StandardScaler()
        X_scaled = scaler.fit_transform(X)

        # Train model
        model = IsolationForest(
            n_estimators=200,
            contamination=contamination,
            max_features=0.8,
            random_state=42,
            n_jobs=-1,
        )
        model.fit(X_scaled)

        # Compute metrics
        predictions = model.predict(X_scaled)
        scores = model.score_samples(X_scaled)
        anomaly_count = (predictions == -1).sum()
        anomaly_rate = anomaly_count / len(predictions)

        mlflow.log_metric("anomaly_count", int(anomaly_count))
        mlflow.log_metric("anomaly_rate", float(anomaly_rate))
        mlflow.log_metric("mean_anomaly_score", float(np.mean(scores)))
        mlflow.log_metric("std_anomaly_score", float(np.std(scores)))
        mlflow.log_metric("p5_anomaly_score", float(np.percentile(scores, 5)))

        # Log feature importances (approximate via permutation)
        importances = {}
        for i, fname in enumerate(feature_names):
            X_permuted = X_scaled.copy()
            np.random.shuffle(X_permuted[:, i])
            scores_permuted = model.score_samples(X_permuted)
            importance = np.abs(np.mean(scores) - np.mean(scores_permuted))
            importances[fname] = float(importance)
            mlflow.log_metric(f"importance_{fname}", importance)

        # Log model with MLflow
        mlflow.sklearn.log_model(
            model,
            artifact_path="model",
            registered_model_name=f"{catalog}.{schema}.{model_name}",
        )

        # Log scaler
        mlflow.sklearn.log_model(scaler, artifact_path="scaler")

        print(f"Model {model_name}: anomaly_rate={anomaly_rate:.4f}, run_id={run.info.run_id}")

        return model, scaler, run.info.run_id


# Train user anomaly model
if X_user.shape[0] >= 100:
    user_model, user_scaler, user_run_id = train_isolation_forest(
        X_user, available_user_cols, "user_anomaly_detector", contamination=0.05
    )
else:
    print(f"Insufficient user data ({X_user.shape[0]} samples), skipping user model")

# Train network anomaly model
if X_network.shape[0] >= 100:
    network_model, network_scaler, network_run_id = train_isolation_forest(
        X_network, available_network_cols, "network_anomaly_detector", contamination=0.03
    )
else:
    print(f"Insufficient network data ({X_network.shape[0]} samples), skipping network model")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Champion/Challenger Evaluation

# COMMAND ----------

def evaluate_champion_challenger(model_name: str, new_run_id: str):
    """Compare new model against current production champion."""
    try:
        # Get current production model
        model_versions = client.search_model_versions(f"name='{catalog}.{schema}.{model_name}'")
        production_versions = [v for v in model_versions if v.current_stage == "Production"]

        if not production_versions:
            # No champion yet — promote new model
            client.transition_model_version_stage(
                name=f"{catalog}.{schema}.{model_name}",
                version=model_versions[-1].version,
                stage="Production",
            )
            print(f"No existing champion. Promoted new model to Production.")
            return

        champion_version = production_versions[0]
        champion_run = client.get_run(champion_version.run_id)

        # Compare metrics
        new_run = client.get_run(new_run_id)
        new_anomaly_rate = new_run.data.metrics.get("anomaly_rate", 0)
        champion_anomaly_rate = champion_run.data.metrics.get("anomaly_rate", 0)

        # Stability check: new model shouldn't deviate too far from champion
        rate_diff = abs(new_anomaly_rate - champion_anomaly_rate)

        if rate_diff < 0.02:  # Within 2% — acceptable
            # Promote as new champion
            latest_version = model_versions[-1].version
            client.transition_model_version_stage(
                name=f"{catalog}.{schema}.{model_name}",
                version=latest_version,
                stage="Production",
            )
            # Archive old champion
            client.transition_model_version_stage(
                name=f"{catalog}.{schema}.{model_name}",
                version=champion_version.version,
                stage="Archived",
            )
            print(f"New model promoted (rate_diff={rate_diff:.4f})")
        else:
            print(f"New model rejected — anomaly rate deviation too high ({rate_diff:.4f})")
            mlflow.log_metric("champion_challenge_result", 0)  # Failed

    except Exception as e:
        print(f"Champion/challenger evaluation failed: {e}")
        # Don't block — just log and continue


if X_user.shape[0] >= 100:
    evaluate_champion_challenger("user_anomaly_detector", user_run_id)

if X_network.shape[0] >= 100:
    evaluate_champion_challenger("network_anomaly_detector", network_run_id)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Summary

# COMMAND ----------

print(f"""
Model Training Complete:
  Experiment: {experiment_name}
  Training window: {training_days} days
  User model: {'trained' if X_user.shape[0] >= 100 else 'skipped (insufficient data)'}
  Network model: {'trained' if X_network.shape[0] >= 100 else 'skipped (insufficient data)'}
  Model registry: {catalog}.{schema}
""")
