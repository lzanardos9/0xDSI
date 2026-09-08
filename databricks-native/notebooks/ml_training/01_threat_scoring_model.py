# Databricks notebook source
# MAGIC %md
# MAGIC # Threat Scoring Model Training
# MAGIC
# MAGIC Trains a Gradient Boosted Tree classifier to score security threats.
# MAGIC Uses pipeline with StringIndexer, OneHotEncoder, VectorAssembler, and GBTClassifier.
# MAGIC Tracks experiments via MLflow and registers production models.

# COMMAND ----------

# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

import json
from datetime import datetime

import mlflow
import mlflow.spark
from pyspark.ml import Pipeline
from pyspark.ml.classification import GBTClassifier
from pyspark.ml.evaluation import BinaryClassificationEvaluator
from pyspark.ml.feature import OneHotEncoder, StringIndexer, VectorAssembler
from pyspark.sql import functions as F

from model_eval import promotion_gate

# COMMAND ----------

dbutils.widgets.text("training_days", "90", "Training Window (days)")
training_days = int(dbutils.widgets.get("training_days"))
require_tables("enriched_security_events")

# COMMAND ----------

try:
    result = {"notebook": "01_threat_scoring_model", "status": "success", "started_at": datetime.utcnow().isoformat()}

    # --- Load Training Data ---
    with mon.time("load_training_data"):
        training_query = f"""
        SELECT
            event_date,
            event_type,
            source_ip_category,
            destination_port_category,
            hour_of_day,
            day_of_week,
            bytes_transferred_bucket,
            session_duration_bucket,
            failed_attempts_last_hour,
            distinct_targets_last_hour,
            geo_velocity_flag,
            user_risk_tier,
            is_threat_label
        FROM {cfg.get_table_path("enriched_security_events")}
        WHERE event_date >= date_sub(current_date(), {training_days})
          AND is_threat_label IS NOT NULL
        """
        raw_df = spark.sql(training_query)
        record_count = raw_df.count()
        mon.log_event("training_data_loaded", {"records": record_count, "training_days": training_days})

    # --- Build Pipeline ---
    with mon.time("build_pipeline"):
        categorical_cols = [
            "event_type",
            "source_ip_category",
            "destination_port_category",
            "user_risk_tier",
        ]
        numeric_cols = [
            "hour_of_day",
            "day_of_week",
            "bytes_transferred_bucket",
            "session_duration_bucket",
            "failed_attempts_last_hour",
            "distinct_targets_last_hour",
            "geo_velocity_flag",
        ]

        indexers = [
            StringIndexer(inputCol=col, outputCol=f"{col}_idx", handleInvalid="keep")
            for col in categorical_cols
        ]
        encoders = [
            OneHotEncoder(inputCol=f"{col}_idx", outputCol=f"{col}_vec")
            for col in categorical_cols
        ]

        assembler_inputs = [f"{col}_vec" for col in categorical_cols] + numeric_cols
        assembler = VectorAssembler(inputCols=assembler_inputs, outputCol="features", handleInvalid="skip")

        gbt = GBTClassifier(
            labelCol="is_threat_label",
            featuresCol="features",
            maxIter=100,
            maxDepth=5,
            stepSize=0.1,
            subsamplingRate=0.8,
        )

        pipeline = Pipeline(stages=indexers + encoders + [assembler, gbt])

    # --- Train/Test Split (leakage-safe, temporal) ---
    # A random row split leaks the same entity/time into both partitions and
    # inflates the score (REV2-14). Split on time instead: train on the past,
    # test strictly on the most recent slice, so the score measures forecasting
    # of unseen future events.
    with mon.time("train_test_split"):
        raw_df = raw_df.withColumn(
            "_event_ts", F.unix_timestamp(F.col("event_date").cast("timestamp"))
        )
        cutoff_ts = raw_df.approxQuantile("_event_ts", [0.8], 0.001)[0]
        train_df = raw_df.filter(F.col("_event_ts") < cutoff_ts).drop("_event_ts")
        test_df = raw_df.filter(F.col("_event_ts") >= cutoff_ts).drop("_event_ts")
        train_count = train_df.count()
        test_count = test_df.count()
        mon.log_event(
            "data_split",
            {"train": train_count, "test": test_count, "split": "temporal",
             "cutoff_ts": cutoff_ts},
        )

    # --- Model Training with MLflow ---
    with mon.time("model_training"):
        mlflow.set_experiment("/Shared/security/threat_scoring_model")

        with mlflow.start_run(run_name=f"gbt_threat_scoring_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}") as run:
            mlflow.log_param("training_days", training_days)
            mlflow.log_param("training_records", train_count)
            mlflow.log_param("test_records", test_count)
            mlflow.log_param("max_iter", 100)
            mlflow.log_param("max_depth", 5)
            mlflow.log_param("step_size", 0.1)
            mlflow.log_param("subsampling_rate", 0.8)

            model = pipeline.fit(train_df)

    # --- Evaluation ---
    with mon.time("model_evaluation"):
        predictions = model.transform(test_df)
        train_predictions = model.transform(train_df)

        evaluator_auc = BinaryClassificationEvaluator(
            labelCol="is_threat_label",
            rawPredictionCol="rawPrediction",
            metricName="areaUnderROC",
        )
        evaluator_pr = BinaryClassificationEvaluator(
            labelCol="is_threat_label",
            rawPredictionCol="rawPrediction",
            metricName="areaUnderPR",
        )

        auc = evaluator_auc.evaluate(predictions)
        auc_pr = evaluator_pr.evaluate(predictions)
        train_auc = evaluator_auc.evaluate(train_predictions)

        test_pos = test_df.filter(F.col("is_threat_label") == 1).count()
        test_base_rate = (test_pos / test_count) if test_count else 0.0

        mlflow.log_metric("auc_roc", auc)
        mlflow.log_metric("auc_pr", auc_pr)
        mlflow.log_metric("train_auc_roc", train_auc)

        mon.log_event(
            "model_evaluated",
            {"auc_roc": auc, "auc_pr": auc_pr, "train_auc_roc": train_auc,
             "test_base_rate": test_base_rate},
        )

    # --- Promotion Gate (REV2-14 / REV2-28) ---
    # Refuse to register or serve a model that cannot beat a coin flip, is
    # overfit, or was measured on a single-class test slice.
    with mon.time("promotion_gate"):
        gate = promotion_gate(
            test_auc=auc, train_auc=train_auc, labels_base_rate=test_base_rate
        )
        mlflow.log_metric("promoted", 1 if gate["promote"] else 0)
        mon.log_event("promotion_decision", gate["checks"])
        if not gate["promote"]:
            mon.log_event(
                "model_promotion_rejected",
                {"reasons": gate["reasons"]},
                severity="warning",
            )

    # --- Register Model (only if the gate passed) ---
    run_id = run.info.run_id
    with mon.time("model_registration"):
        if gate["promote"]:
            mlflow.spark.log_model(
                model,
                "threat_scoring_model",
                registered_model_name="security_threat_scoring_gbt",
            )
            mon.log_event("model_registered", {"run_id": run_id, "auc_roc": auc})
        else:
            # Keep the artifact for audit but never promote it to the serving name.
            mlflow.spark.log_model(model, "threat_scoring_model")
            mon.log_event(
                "model_not_registered",
                {"run_id": run_id, "auc_roc": auc, "reasons": gate["reasons"]},
            )

    # --- Score Recent Events (only with a promoted model) ---
    scored_count = 0
    if gate["promote"]:
        with mon.time("score_recent_events"):
            scoring_query = f"""
            SELECT *
            FROM {cfg.get_table_path("enriched_security_events")}
            WHERE event_date >= date_sub(current_date(), 1)
              AND is_threat_label IS NULL
            """
            recent_df = spark.sql(scoring_query)
            scored_df = model.transform(recent_df)

            scored_output = scored_df.select(
                "event_id", "event_type", "source_ip_category",
                "prediction", "probability"
            )
            scored_output.write.mode("overwrite").saveAsTable(
                cfg.get_table_path("threat_scores_latest")
            )
            scored_count = scored_output.count()
            mon.log_event("scoring_complete", {"scored_records": scored_count})
    else:
        mon.log_event(
            "scoring_skipped_not_promoted",
            {"reason": "model failed promotion gate"},
        )

    # --- Finalize ---
    result.update({
        "auc_roc": auc,
        "auc_pr": auc_pr,
        "train_auc_roc": train_auc,
        "promoted": gate["promote"],
        "promotion_reasons": gate["reasons"],
        "training_records": train_count,
        "test_records": test_count,
        "scored_records": scored_count,
        "mlflow_run_id": run_id,
        "completed_at": datetime.utcnow().isoformat(),
    })
    mon.log_complete(result)

except Exception as e:
    result = {
        "notebook": "01_threat_scoring_model",
        "status": "error",
        "error": str(e),
        "error_type": type(e).__name__,
        "failed_at": datetime.utcnow().isoformat(),
    }
    mon.log_error(e, context={"training_days": training_days})
    raise

finally:
    dbutils.notebook.exit(json.dumps(result))
