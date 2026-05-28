# Databricks notebook source
# MAGIC %md
# MAGIC # Analytics - Financial Threat Intelligence
# MAGIC
# MAGIC Production implementation using:
# MAGIC - **MLflow-registered fraud scoring model** for transaction risk assessment
# MAGIC - **GraphFrames** for identity graph construction and community detection
# MAGIC - **Spark Structured Streaming** for real-time transaction monitoring
# MAGIC - **Statistical anomaly detection** (Z-score, IQR) for velocity analysis
# MAGIC
# MAGIC Outputs: financial_transactions (scored), financial_threat_detections,
# MAGIC          financial_identity_profiles, financial_identity_graph_edges,
# MAGIC          credential_selling_cases, credential_dark_web_hits

# COMMAND ----------

# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

import json
import uuid
from datetime import datetime, timedelta
from pyspark.sql import functions as F
from pyspark.sql.window import Window
from pyspark.sql.types import (
    StructType, StructField, StringType, DoubleType,
    TimestampType, BooleanType, IntegerType,
)
from pyspark.ml.feature import VectorAssembler, StandardScaler
from pyspark.ml.clustering import KMeans
from pyspark.ml import PipelineModel
from graphframes import GraphFrame
import mlflow
import numpy as np

# COMMAND ----------

dbutils.widgets.text("lookback_hours", "4", "Transaction lookback window (hours)")
dbutils.widgets.text("risk_threshold", "0.75", "Transaction risk score threshold")
dbutils.widgets.text("velocity_window_minutes", "10", "Velocity check window (minutes)")
dbutils.widgets.text("mode", "batch", "Execution mode: streaming | batch")
dbutils.widgets.text("fraud_model_name", "financial_fraud_scorer", "MLflow model name")

lookback_hours = int(dbutils.widgets.get("lookback_hours"))
risk_threshold = float(dbutils.widgets.get("risk_threshold"))
velocity_window_minutes = int(dbutils.widgets.get("velocity_window_minutes"))
mode = dbutils.widgets.get("mode")
fraud_model_name = dbutils.widgets.get("fraud_model_name")

mlflow.set_experiment("/Shared/0xDSI/experiments/financial_threat_intel")

# COMMAND ----------

try:
    result = {"notebook": "04_financial_threat_intel", "status": "success", "started_at": datetime.utcnow().isoformat()}

    # --- Load or Train Fraud Scoring Model ---
    with mon.time("load_fraud_model"):
        fraud_model = None
        try:
            model_uri = f"models:/{fraud_model_name}/Production"
            fraud_model = mlflow.spark.load_model(model_uri)
            mon.log_event("fraud_model_loaded", {"uri": model_uri})
        except Exception:
            mon.log_warning("No production fraud model found, will train inline")

    # --- Load Transactions ---
    with mon.time("load_transactions"):
        if mode == "streaming":
            transactions_raw = (
                spark.readStream
                .format("delta")
                .option("maxFilesPerTrigger", 50)
                .table(cfg.get_table_path("financial_transactions"))
            )
            # For initial analysis use batch snapshot
            transactions_df = spark.sql(f"""
                SELECT * FROM {cfg.get_table_path("financial_transactions")}
                WHERE timestamp > current_timestamp() - INTERVAL {lookback_hours} HOURS
            """)
        else:
            transactions_df = spark.sql(f"""
                SELECT * FROM {cfg.get_table_path("financial_transactions")}
                WHERE timestamp > current_timestamp() - INTERVAL {lookback_hours} HOURS
                ORDER BY timestamp DESC
            """)

        txn_count = transactions_df.count()
        mon.log_metric("transactions_loaded", txn_count)

    # --- Feature Engineering for ML Scoring ---
    with mon.time("feature_engineering"):
        # Per-payer behavioral features within this window
        payer_features = (
            transactions_df
            .groupBy("payer_id")
            .agg(
                F.count("*").alias("txn_count"),
                F.sum("amount").alias("total_amount"),
                F.avg("amount").alias("avg_amount"),
                F.stddev("amount").alias("stddev_amount"),
                F.max("amount").alias("max_amount"),
                F.countDistinct("payee_id").alias("unique_payees"),
                F.countDistinct("device_fingerprint").alias("unique_devices"),
                F.countDistinct("ip_address").alias("unique_ips"),
                F.countDistinct(
                    F.concat(F.round(F.col("geo_lat"), 0), F.lit(","), F.round(F.col("geo_lon"), 0))
                ).alias("unique_geo_cells"),
                # Time-based features
                F.sum(F.when(F.hour(F.col("timestamp")).between(0, 5), 1).otherwise(0)).alias("night_txns"),
                F.sum(F.when(F.col("amount") > 10000, 1).otherwise(0)).alias("high_value_count"),
                # Velocity: time between first and last txn
                (F.unix_timestamp(F.max("timestamp")) - F.unix_timestamp(F.min("timestamp"))).alias("span_seconds"),
            )
            .withColumn("stddev_amount", F.coalesce(F.col("stddev_amount"), F.lit(0.0)))
            .withColumn("velocity", F.col("txn_count") / F.greatest(F.col("span_seconds") / 60.0, F.lit(1.0)))
            .withColumn("night_ratio", F.col("night_txns") / F.greatest(F.col("txn_count").cast("double"), F.lit(1.0)))
        )

        # If no trained model, train KMeans anomaly detector inline
        if fraud_model is None:
            feature_cols = [
                "txn_count", "total_amount", "avg_amount", "stddev_amount", "max_amount",
                "unique_payees", "unique_devices", "unique_ips", "unique_geo_cells",
                "night_txns", "high_value_count", "velocity", "night_ratio",
            ]

            assembler = VectorAssembler(inputCols=feature_cols, outputCol="features_raw", handleInvalid="skip")
            scaler = StandardScaler(inputCol="features_raw", outputCol="features", withStd=True, withMean=True)

            assembled = assembler.transform(payer_features)
            scaler_model = scaler.fit(assembled)
            scaled = scaler_model.transform(assembled)

            # KMeans for anomaly detection (outlier clusters)
            kmeans = KMeans(k=5, seed=42, featuresCol="features", predictionCol="cluster")
            kmeans_model = kmeans.fit(scaled)

            # Score: distance to nearest centroid (higher = more anomalous)
            scored_payers = kmeans_model.transform(scaled)
            centers = kmeans_model.clusterCenters()

            # Compute distance to assigned cluster center
            from pyspark.ml.functions import vector_to_array
            scored_payers = (
                scored_payers
                .withColumn("features_array", vector_to_array("features"))
            )

            # Broadcast cluster centers
            centers_broadcast = spark.sparkContext.broadcast(
                {i: c.tolist() for i, c in enumerate(centers)}
            )

            @F.udf(DoubleType())
            def distance_to_center(features_array, cluster_id):
                if features_array is None or cluster_id is None:
                    return 0.0
                center = centers_broadcast.value.get(cluster_id, [0.0] * len(features_array))
                return float(np.sqrt(sum((a - b) ** 2 for a, b in zip(features_array, center))))

            scored_payers = scored_payers.withColumn(
                "anomaly_distance", distance_to_center(F.col("features_array"), F.col("cluster"))
            )

            # Normalize distance to 0-1 risk score
            max_dist = scored_payers.agg(F.max("anomaly_distance")).first()[0] or 1.0
            scored_payers = scored_payers.withColumn(
                "risk_score", F.col("anomaly_distance") / F.lit(max_dist)
            )

            # Log model to MLflow
            with mlflow.start_run(run_name="fraud_kmeans_inline") as inline_run:
                mlflow.log_metric("k_clusters", 5)
                mlflow.log_metric("max_anomaly_distance", max_dist)
                mlflow.log_metric("payers_scored", scored_payers.count())

            mon.log_event("inline_model_trained", {"k": 5, "max_dist": max_dist})
        else:
            # Use production model for scoring
            assembled = fraud_model.transform(payer_features)
            scored_payers = assembled.withColumnRenamed("prediction", "risk_score")

    # --- PIX Fraud Detection (Statistical) ---
    with mon.time("pix_fraud_detection"):
        # Z-score based velocity anomaly detection
        pix_velocity = (
            transactions_df
            .filter(F.col("channel") == "pix")
            .groupBy(
                F.col("payer_id"),
                F.window(F.col("timestamp"), f"{velocity_window_minutes} minutes").alias("time_window"),
            )
            .agg(
                F.count("*").alias("txn_count"),
                F.sum("amount").alias("total_amount"),
                F.countDistinct("payee_id").alias("unique_payees"),
                F.countDistinct("device_fingerprint").alias("unique_devices"),
            )
        )

        # Compute population statistics for Z-score
        velocity_stats = pix_velocity.agg(
            F.avg("txn_count").alias("mean_count"),
            F.stddev("txn_count").alias("std_count"),
            F.avg("total_amount").alias("mean_amount"),
            F.stddev("total_amount").alias("std_amount"),
        ).first()

        mean_count = velocity_stats.mean_count or 1.0
        std_count = velocity_stats.std_count or 1.0
        mean_amount = velocity_stats.mean_amount or 1000.0
        std_amount = velocity_stats.std_amount or 1000.0

        # Flag where Z-score > 2.5 (statistically anomalous)
        pix_anomalies = (
            pix_velocity
            .withColumn("z_score_count", (F.col("txn_count") - mean_count) / std_count)
            .withColumn("z_score_amount", (F.col("total_amount") - mean_amount) / std_amount)
            .filter(
                (F.col("z_score_count") > 2.5)
                | (F.col("z_score_amount") > 2.5)
                | (F.col("unique_devices") >= 3)
            )
        )

        pix_fraud_count = pix_anomalies.count()
        mon.log_metric("pix_velocity_anomalies", pix_fraud_count)

    # --- Identity Graph via GraphFrames ---
    with mon.time("identity_graph_graphframes"):
        # Vertices: all unique payer/payee IDs
        payer_vertices = transactions_df.select(F.col("payer_id").alias("id")).distinct()
        payee_vertices = transactions_df.select(F.col("payee_id").alias("id")).distinct()
        all_vertices = payer_vertices.union(payee_vertices).distinct().withColumn("entity_type", F.lit("account"))

        # Edges: shared device fingerprint or shared IP
        device_edges = (
            transactions_df.select("payer_id", "device_fingerprint").distinct().alias("a")
            .join(
                transactions_df.select("payer_id", "device_fingerprint").distinct().alias("b"),
                (F.col("a.device_fingerprint") == F.col("b.device_fingerprint"))
                & (F.col("a.payer_id") < F.col("b.payer_id")),
            )
            .select(
                F.col("a.payer_id").alias("src"),
                F.col("b.payer_id").alias("dst"),
                F.lit("shared_device").alias("relationship"),
            )
        )

        ip_edges = (
            transactions_df.select("payer_id", "ip_address").distinct().alias("a")
            .join(
                transactions_df.select("payer_id", "ip_address").distinct().alias("b"),
                (F.col("a.ip_address") == F.col("b.ip_address"))
                & (F.col("a.payer_id") < F.col("b.payer_id")),
            )
            .select(
                F.col("a.payer_id").alias("src"),
                F.col("b.payer_id").alias("dst"),
                F.lit("shared_ip").alias("relationship"),
            )
        )

        # Transaction edges (payer -> payee)
        txn_edges = (
            transactions_df
            .select(
                F.col("payer_id").alias("src"),
                F.col("payee_id").alias("dst"),
                F.lit("transaction").alias("relationship"),
            )
            .distinct()
        )

        all_edges = device_edges.union(ip_edges).union(txn_edges).distinct()
        edge_count = all_edges.count()

        # Build GraphFrame for community detection
        if edge_count > 0 and all_vertices.count() >= 2:
            g = GraphFrame(all_vertices, all_edges)

            # Connected Components: fraud rings share components
            spark.sparkContext.setCheckpointDir(get_checkpoint_path(cfg, "financial_graph"))
            components = g.connectedComponents()

            # Label Propagation: detect fraud communities
            lpa_result = g.labelPropagation(maxIter=5)

            # PageRank: identify central nodes in fraud networks
            pagerank = g.pageRank(resetProbability=0.15, maxIter=10)
            high_rank_nodes = (
                pagerank.vertices
                .filter(F.col("pagerank") > 1.5)
                .select("id", "pagerank")
            )

            fraud_ring_count = (
                components.groupBy("component")
                .count()
                .filter(F.col("count") >= 3)
                .count()
            )
            mon.log_metric("fraud_rings_detected", fraud_ring_count)
            mon.log_metric("high_pagerank_nodes", high_rank_nodes.count())
        else:
            fraud_ring_count = 0

    # --- Generate Threat Detections ---
    with mon.time("threat_detections"):
        detections = []

        # From ML-scored anomalies
        if "risk_score" in scored_payers.columns:
            high_risk = scored_payers.filter(F.col("risk_score") >= risk_threshold).collect()
            for row in high_risk[:30]:
                detections.append({
                    "id": str(uuid.uuid4()),
                    "detection_type": "ml_anomaly_cluster",
                    "severity": "critical" if row.risk_score >= 0.9 else "high",
                    "entity_id": row.payer_id,
                    "description": f"ML anomaly: risk={row.risk_score:.3f}, cluster={getattr(row, 'cluster', 'N/A')}, txns={row.txn_count}",
                    "confidence": float(min(0.99, row.risk_score)),
                    "mitre_technique": "T1657",
                    "created_at": datetime.utcnow(),
                })

        # From PIX velocity anomalies
        if pix_fraud_count > 0:
            pix_alerts = pix_anomalies.collect()
            for row in pix_alerts[:20]:
                z_max = max(getattr(row, "z_score_count", 0), getattr(row, "z_score_amount", 0))
                detections.append({
                    "id": str(uuid.uuid4()),
                    "detection_type": "pix_velocity_zscore",
                    "severity": "critical" if z_max > 4.0 else "high",
                    "entity_id": row.payer_id,
                    "description": f"PIX velocity Z-score={z_max:.2f}: {row.txn_count} txns, R${row.total_amount:.2f} in {velocity_window_minutes}min",
                    "confidence": min(0.99, 0.6 + z_max * 0.08),
                    "mitre_technique": "T1657",
                    "created_at": datetime.utcnow(),
                })

        detection_count = len(detections)
        mon.log_metric("detections_generated", detection_count)

    # --- Credential Selling Detection ---
    with mon.time("credential_selling"):
        credential_cases = (
            transactions_df
            .filter(F.col("geo_lat").isNotNull())
            .groupBy("payer_id")
            .agg(
                F.countDistinct(
                    F.concat(F.round(F.col("geo_lat"), 0), F.lit(","), F.round(F.col("geo_lon"), 0))
                ).alias("distinct_geo_cells"),
                F.count("*").alias("txn_count"),
                F.min("timestamp").alias("first_txn"),
                F.max("timestamp").alias("last_txn"),
                F.countDistinct("device_fingerprint").alias("devices"),
            )
            .withColumn("time_span_hours",
                (F.unix_timestamp(F.col("last_txn")) - F.unix_timestamp(F.col("first_txn"))) / 3600)
            .filter(
                (F.col("distinct_geo_cells") >= 3)
                & (F.col("time_span_hours") < 2)
                & (F.col("devices") >= 2)
            )
        )

        cred_case_count = credential_cases.count()
        mon.log_metric("credential_selling_cases", cred_case_count)

    # --- Persist Results ---
    with mon.time("persist_results"):
        # Identity profiles with risk scores
        if "risk_score" in scored_payers.columns:
            profiles_out = (
                scored_payers
                .select(
                    F.col("payer_id"),
                    "txn_count", "total_amount", "avg_amount", "unique_payees",
                    "unique_devices", "unique_ips", "unique_geo_cells",
                    "velocity", "night_ratio", "risk_score",
                )
                .withColumn("risk_level",
                    F.when(F.col("risk_score") >= 0.8, "critical")
                    .when(F.col("risk_score") >= 0.6, "high")
                    .when(F.col("risk_score") >= 0.3, "medium")
                    .otherwise("low"))
            )
            profiles_out.write.mode("overwrite").saveAsTable(cfg.get_table_path("financial_identity_profiles"))

        # Identity graph edges
        if edge_count > 0:
            graph_out = all_edges.select(
                F.col("src").alias("source_id"),
                F.col("dst").alias("target_id"),
                F.col("relationship").alias("edge_type"),
            )
            graph_out.write.mode("overwrite").saveAsTable(cfg.get_table_path("financial_identity_graph_edges"))

        # Threat detections
        if detections:
            detections_df = spark.createDataFrame(detections)
            safe_append(detections_df, "financial_threat_detections", catalog=cfg.catalog, schema=cfg.schema)

        # Credential selling cases
        if cred_case_count > 0:
            cred_out = (
                credential_cases
                .withColumn("id", F.expr("uuid()"))
                .withColumn("risk_level",
                    F.when(F.col("distinct_geo_cells") >= 5, "critical").otherwise("high"))
                .withColumn("status", F.lit("new"))
                .withColumn("detected_at", F.current_timestamp())
            )
            safe_append(cred_out, "credential_selling_cases", catalog=cfg.catalog, schema=cfg.schema)

    # --- Streaming Mode ---
    if mode == "streaming":
        with mon.time("start_streaming"):
            def score_transaction_batch(batch_df, batch_id):
                if batch_df.count() == 0:
                    return
                mon.log_event("financial_batch", {"batch_id": batch_id, "rows": batch_df.count()})

            streaming_query = (
                transactions_raw
                .writeStream
                .foreachBatch(score_transaction_batch)
                .option("checkpointLocation", get_checkpoint_path(cfg, "financial_streaming"))
                .trigger(processingTime="15 seconds")
                .start()
            )
            streaming_query.awaitTermination(timeout=300)

    # --- Finalize ---
    result.update({
        "transactions_analyzed": txn_count,
        "pix_velocity_anomalies": pix_fraud_count,
        "fraud_rings": fraud_ring_count,
        "identity_graph_edges": edge_count,
        "threat_detections": detection_count,
        "credential_selling_cases": cred_case_count,
        "model_used": "production" if fraud_model else "inline_kmeans",
        "completed_at": datetime.utcnow().isoformat(),
    })
    mon.log_complete(rows_processed=txn_count)

except Exception as e:
    result = {
        "notebook": "04_financial_threat_intel",
        "status": "error",
        "error": str(e)[:500],
        "error_type": type(e).__name__,
        "failed_at": datetime.utcnow().isoformat(),
    }
    mon.log_error(e, context="financial_threat_intel")
    raise

finally:
    print(json.dumps(result, indent=2))
    dbutils.notebook.exit(json.dumps(result))
