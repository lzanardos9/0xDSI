# Databricks notebook source
# MAGIC %md
# MAGIC # Analytics - Financial Threat Intelligence
# MAGIC
# MAGIC Detects financial fraud patterns across Brazilian banking ecosystem:
# MAGIC - PIX instant payment fraud detection
# MAGIC - Banking trojan behavioral analysis
# MAGIC - Boleto manipulation detection
# MAGIC - Credential selling and dark web monitoring
# MAGIC - Identity trust scoring and graph exploration
# MAGIC - Transaction risk monitoring with ML scoring
# MAGIC
# MAGIC Outputs: financial_transactions, financial_threat_detections, financial_identity_profiles,
# MAGIC          financial_identity_graph_edges, financial_threat_simulations, financial_response_decisions,
# MAGIC          credential_selling_cases, credential_dark_web_hits

# COMMAND ----------

# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

import json
import uuid
import random
from datetime import datetime, timedelta
from pyspark.sql import functions as F
from pyspark.sql.types import (
    StructType, StructField, StringType, DoubleType,
    TimestampType, BooleanType, IntegerType,
)

# COMMAND ----------

dbutils.widgets.text("lookback_hours", "4", "Transaction lookback window (hours)")
dbutils.widgets.text("risk_threshold", "0.75", "Transaction risk score threshold")
dbutils.widgets.text("velocity_window_minutes", "10", "Velocity check window (minutes)")

lookback_hours = int(dbutils.widgets.get("lookback_hours"))
risk_threshold = float(dbutils.widgets.get("risk_threshold"))
velocity_window_minutes = int(dbutils.widgets.get("velocity_window_minutes"))

# COMMAND ----------

try:
    result = {"notebook": "04_financial_threat_intel", "status": "success", "started_at": datetime.utcnow().isoformat()}

    # --- Load Recent Transactions ---
    with mon.time("load_transactions"):
        transactions_df = spark.sql(f"""
            SELECT id, payer_id, payee_id, amount, currency, channel,
                   pix_key_type, device_fingerprint, geo_lat, geo_lon,
                   timestamp, ip_address, user_agent
            FROM {cfg.get_table_path("financial_transactions")}
            WHERE timestamp > current_timestamp() - INTERVAL {lookback_hours} HOURS
            ORDER BY timestamp DESC
        """)
        txn_count = transactions_df.count()
        mon.log_metric("transactions_loaded", txn_count)

    # --- PIX Fraud Detection ---
    with mon.time("pix_fraud_detection"):
        # Velocity analysis: too many PIX transfers in short window
        pix_velocity = (
            transactions_df
            .filter(F.col("channel") == "pix")
            .groupBy(
                F.col("payer_id"),
                F.window(F.col("timestamp"), f"{velocity_window_minutes} minutes"),
            )
            .agg(
                F.count("*").alias("txn_count"),
                F.sum("amount").alias("total_amount"),
                F.countDistinct("payee_id").alias("unique_payees"),
                F.countDistinct("device_fingerprint").alias("unique_devices"),
            )
            .filter(
                (F.col("txn_count") >= 5)
                | (F.col("total_amount") > 50000)
                | (F.col("unique_payees") >= 4)
            )
        )

        pix_fraud_count = pix_velocity.count()
        mon.log_metric("pix_velocity_alerts", pix_fraud_count)

    # --- Banking Trojan Pattern Detection ---
    with mon.time("trojan_detection"):
        # Detect overlay attack patterns: device fingerprint changes mid-session
        trojan_indicators = (
            transactions_df
            .groupBy("payer_id")
            .agg(
                F.countDistinct("device_fingerprint").alias("devices_used"),
                F.countDistinct("ip_address").alias("ips_used"),
                F.count("*").alias("txn_total"),
                F.sum(F.when(F.col("amount") > 10000, 1).otherwise(0)).alias("high_value_txns"),
            )
            .filter(
                (F.col("devices_used") >= 3)
                | ((F.col("ips_used") >= 4) & (F.col("high_value_txns") >= 2))
            )
            .withColumn("trojan_confidence",
                F.least(F.lit(1.0),
                    (F.col("devices_used") * 0.2 + F.col("ips_used") * 0.15 + F.col("high_value_txns") * 0.25))
            )
        )

        trojan_count = trojan_indicators.count()
        mon.log_metric("trojan_indicators", trojan_count)

    # --- Identity Trust Scoring ---
    with mon.time("identity_trust_scoring"):
        identity_profiles = (
            transactions_df
            .groupBy("payer_id")
            .agg(
                F.count("*").alias("total_transactions"),
                F.sum("amount").alias("total_volume"),
                F.avg("amount").alias("avg_transaction"),
                F.countDistinct("payee_id").alias("unique_counterparties"),
                F.countDistinct("device_fingerprint").alias("known_devices"),
                F.countDistinct("ip_address").alias("known_ips"),
                F.min("timestamp").alias("first_seen"),
                F.max("timestamp").alias("last_seen"),
            )
            .withColumn("account_age_days",
                F.datediff(F.current_date(), F.to_date(F.col("first_seen"))))
            .withColumn("trust_score",
                F.least(F.lit(100.0),
                    F.col("account_age_days") * 0.3
                    + F.least(F.col("total_transactions"), F.lit(100)) * 0.4
                    + F.when(F.col("known_devices") <= 3, F.lit(20.0)).otherwise(F.lit(5.0))
                    + F.when(F.col("unique_counterparties") >= 5, F.lit(10.0)).otherwise(F.lit(0.0))
                )
            )
            .withColumn("risk_level",
                F.when(F.col("trust_score") < 30, "high")
                .when(F.col("trust_score") < 60, "medium")
                .otherwise("low"))
        )

        profile_count = identity_profiles.count()
        mon.log_metric("identity_profiles", profile_count)

    # --- Identity Graph Edge Detection ---
    with mon.time("identity_graph"):
        # Shared device fingerprints link different payer IDs
        device_edges = (
            transactions_df
            .select("payer_id", "device_fingerprint")
            .distinct()
            .alias("a")
            .join(
                transactions_df.select("payer_id", "device_fingerprint").distinct().alias("b"),
                (F.col("a.device_fingerprint") == F.col("b.device_fingerprint"))
                & (F.col("a.payer_id") < F.col("b.payer_id")),
            )
            .select(
                F.col("a.payer_id").alias("source_id"),
                F.col("b.payer_id").alias("target_id"),
                F.lit("shared_device").alias("edge_type"),
                F.col("a.device_fingerprint").alias("shared_value"),
            )
        )

        # Shared IP links
        ip_edges = (
            transactions_df
            .select("payer_id", "ip_address")
            .distinct()
            .alias("a")
            .join(
                transactions_df.select("payer_id", "ip_address").distinct().alias("b"),
                (F.col("a.ip_address") == F.col("b.ip_address"))
                & (F.col("a.payer_id") < F.col("b.payer_id")),
            )
            .select(
                F.col("a.payer_id").alias("source_id"),
                F.col("b.payer_id").alias("target_id"),
                F.lit("shared_ip").alias("edge_type"),
                F.col("a.ip_address").alias("shared_value"),
            )
        )

        identity_edges = device_edges.union(ip_edges).distinct()
        edge_count = identity_edges.count()
        mon.log_metric("identity_graph_edges", edge_count)

    # --- Generate Threat Detections ---
    with mon.time("threat_detections"):
        detections_data = []

        # PIX velocity detections
        if pix_fraud_count > 0:
            pix_alerts = pix_velocity.collect()
            for alert in pix_alerts[:20]:
                detections_data.append({
                    "id": str(uuid.uuid4()),
                    "detection_type": "pix_velocity_anomaly",
                    "severity": "high" if alert.total_amount > 100000 else "medium",
                    "entity_id": alert.payer_id,
                    "description": f"PIX velocity anomaly: {alert.txn_count} txns, R${alert.total_amount:.2f} in {velocity_window_minutes}min",
                    "confidence": min(0.95, 0.6 + alert.txn_count * 0.05),
                    "mitre_technique": "T1657",
                    "created_at": datetime.utcnow(),
                })

        # Trojan detections
        if trojan_count > 0:
            trojan_alerts = trojan_indicators.collect()
            for alert in trojan_alerts[:10]:
                detections_data.append({
                    "id": str(uuid.uuid4()),
                    "detection_type": "banking_trojan_overlay",
                    "severity": "critical",
                    "entity_id": alert.payer_id,
                    "description": f"Possible trojan: {alert.devices_used} devices, {alert.ips_used} IPs in window",
                    "confidence": float(alert.trojan_confidence),
                    "mitre_technique": "T1185",
                    "created_at": datetime.utcnow(),
                })

        detection_count = len(detections_data)
        mon.log_metric("detections_generated", detection_count)

    # --- Credential Selling Detection ---
    with mon.time("credential_selling"):
        # Detect accounts being tested from multiple geographic locations rapidly
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
            )
            .filter(F.col("distinct_geo_cells") >= 3)
            .withColumn("time_span_hours",
                (F.unix_timestamp(F.col("last_txn")) - F.unix_timestamp(F.col("first_txn"))) / 3600)
            .filter(F.col("time_span_hours") < 2)
        )

        cred_case_count = credential_cases.count()
        mon.log_metric("credential_selling_cases", cred_case_count)

    # --- Persist Results ---
    with mon.time("persist_results"):
        # Identity profiles
        if profile_count > 0:
            identity_profiles.write.mode("overwrite").saveAsTable(
                cfg.get_table_path("financial_identity_profiles")
            )

        # Identity graph edges
        if edge_count > 0:
            identity_edges.write.mode("overwrite").saveAsTable(
                cfg.get_table_path("financial_identity_graph_edges")
            )

        # Threat detections
        if detections_data:
            detections_df = spark.createDataFrame(detections_data)
            safe_append(detections_df, "financial_threat_detections", catalog=cfg.catalog, schema=cfg.schema)

        # Credential selling cases
        if cred_case_count > 0:
            cred_cases_collected = credential_cases.collect()
            cred_data = [{
                "id": str(uuid.uuid4()),
                "payer_id": row.payer_id,
                "distinct_geo_cells": row.distinct_geo_cells,
                "txn_count": row.txn_count,
                "time_span_hours": float(row.time_span_hours),
                "risk_level": "critical" if row.distinct_geo_cells >= 5 else "high",
                "status": "new",
                "detected_at": datetime.utcnow(),
            } for row in cred_cases_collected[:50]]

            cred_df = spark.createDataFrame(cred_data)
            safe_append(cred_df, "credential_selling_cases", catalog=cfg.catalog, schema=cfg.schema)

        mon.log_info(f"Financial intel: {detection_count} detections, {profile_count} profiles, {cred_case_count} cred cases")

    # --- Finalize ---
    result.update({
        "transactions_analyzed": txn_count,
        "pix_velocity_alerts": pix_fraud_count,
        "trojan_indicators": trojan_count,
        "identity_profiles": profile_count,
        "identity_graph_edges": edge_count,
        "threat_detections": detection_count,
        "credential_selling_cases": cred_case_count,
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
