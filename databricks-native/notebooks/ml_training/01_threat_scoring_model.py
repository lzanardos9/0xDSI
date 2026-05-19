# Databricks notebook source
# MAGIC %md
# MAGIC # Agent 20: Threat Scoring ML Model Training
# MAGIC Trains a gradient-boosted model to score threat likelihood on events.
# MAGIC Registered in Unity Catalog Model Registry for serving.

# COMMAND ----------

dbutils.widgets.text("catalog", "soc_platform", "Catalog")
dbutils.widgets.text("schema", "agentic_soc", "Schema")
dbutils.widgets.text("training_days", "30", "Training Lookback Days")

catalog = dbutils.widgets.get("catalog")
schema = dbutils.widgets.get("schema")
training_days = int(dbutils.widgets.get("training_days"))

spark.sql(f"USE CATALOG `{catalog}`")
spark.sql(f"USE SCHEMA `{schema}`")

# COMMAND ----------

import mlflow
from pyspark.sql.functions import *
from pyspark.ml.feature import VectorAssembler, StringIndexer, OneHotEncoder
from pyspark.ml.classification import GBTClassifier
from pyspark.ml.evaluation import BinaryClassificationEvaluator
from pyspark.ml import Pipeline

mlflow.set_registry_uri("databricks-uc")
experiment_name = f"/Users/{spark.sql('SELECT current_user()').collect()[0][0]}/0xdsi_threat_scoring"
mlflow.set_experiment(experiment_name)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Build Training Dataset

# COMMAND ----------

training_data = spark.sql(f"""
    SELECT
        e.event_type,
        e.source,
        e.severity,
        e.action,
        e.outcome,
        HOUR(e.timestamp) as hour_of_day,
        DAYOFWEEK(e.timestamp) as day_of_week,
        CASE WHEN e.enrichments['ioc_match'] = 'true' THEN 1 ELSE 0 END as ioc_match,
        CASE WHEN e.enrichments['asset_criticality'] = 'critical' THEN 1 ELSE 0 END as critical_asset,
        CASE WHEN a.id IS NOT NULL THEN 1 ELSE 0 END as is_threat
    FROM events e
    LEFT JOIN alerts a ON array_contains(a.event_ids, e.id) AND a.false_positive = false
    WHERE e.timestamp > current_timestamp() - INTERVAL {training_days} DAYS
    AND e.event_type IS NOT NULL
""")

print(f"Training samples: {training_data.count()}")
print(f"Threat ratio: {training_data.filter(col('is_threat') == 1).count() / max(training_data.count(), 1):.4f}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Feature Engineering & Model Training

# COMMAND ----------

categorical_cols = ["event_type", "source", "severity", "action", "outcome"]
numeric_cols = ["hour_of_day", "day_of_week", "ioc_match", "critical_asset"]

indexers = [StringIndexer(inputCol=c, outputCol=f"{c}_idx", handleInvalid="keep")
            for c in categorical_cols]
encoders = [OneHotEncoder(inputCol=f"{c}_idx", outputCol=f"{c}_vec")
            for c in categorical_cols]

feature_cols = [f"{c}_vec" for c in categorical_cols] + numeric_cols
assembler = VectorAssembler(inputCols=feature_cols, outputCol="features")

gbt = GBTClassifier(
    featuresCol="features",
    labelCol="is_threat",
    maxDepth=6,
    maxIter=50,
    seed=42
)

pipeline = Pipeline(stages=indexers + encoders + [assembler, gbt])

# COMMAND ----------

# MAGIC %md
# MAGIC ## Train and Evaluate

# COMMAND ----------

train_df, test_df = training_data.randomSplit([0.8, 0.2], seed=42)

with mlflow.start_run(run_name="threat_scoring_gbt"):
    model = pipeline.fit(train_df)
    predictions = model.transform(test_df)

    evaluator = BinaryClassificationEvaluator(
        labelCol="is_threat",
        rawPredictionCol="rawPrediction",
        metricName="areaUnderROC"
    )
    auc = evaluator.evaluate(predictions)

    mlflow.log_param("training_days", training_days)
    mlflow.log_param("training_samples", training_data.count())
    mlflow.log_param("max_depth", 6)
    mlflow.log_param("max_iter", 50)
    mlflow.log_metric("auc_roc", auc)

    mlflow.spark.log_model(
        model,
        artifact_path="threat_scoring_model",
        registered_model_name=f"{catalog}.{schema}.threat_scoring_model"
    )

    print(f"Model AUC-ROC: {auc:.4f}")
    print(f"Model registered: {catalog}.{schema}.threat_scoring_model")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Score Recent Events

# COMMAND ----------

recent_events = spark.sql("""
    SELECT * FROM events
    WHERE timestamp > current_timestamp() - INTERVAL 1 HOUR
    AND event_type IS NOT NULL
""")

if recent_events.count() > 0:
    scored = model.transform(recent_events)
    high_threat = scored.filter(col("prediction") == 1.0)
    print(f"High-threat events in last hour: {high_threat.count()}")
else:
    print("No recent events to score")
