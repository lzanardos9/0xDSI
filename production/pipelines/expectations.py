# Databricks notebook source
# MAGIC %md
# MAGIC # DLT Pipeline: Data Quality Expectations
# MAGIC
# MAGIC Centralized data quality rules applied across all pipeline stages.
# MAGIC Implements Great Expectations-style validation for security data.

# COMMAND ----------

"""
Data Quality Contract Definitions

These expectations are applied via DLT @dlt.expect decorators
and also available for batch validation outside DLT.
"""

# Bronze expectations: minimal — just ensure data arrived intact
BRONZE_EXPECTATIONS = {
    "has_event_id": "event_id IS NOT NULL",
    "has_raw_payload": "raw_event IS NOT NULL AND LENGTH(raw_event) > 2",
    "has_ingest_time": "ingest_timestamp IS NOT NULL",
    "has_source": "source_name IS NOT NULL AND LENGTH(source_name) > 0",
    "valid_json": "from_json(raw_event, 'MAP<STRING,STRING>') IS NOT NULL",
    "reasonable_size": "LENGTH(raw_event) < 1048576",  # < 1MB per event
}

# Silver expectations: structural and semantic validation
SILVER_EXPECTATIONS = {
    "has_event_id": "event_id IS NOT NULL",
    "has_timestamp": "time IS NOT NULL",
    "valid_timestamp": "time > '2020-01-01' AND time < current_timestamp() + INTERVAL 1 DAY",
    "has_category": "category_uid IS NOT NULL AND category_uid BETWEEN 1 AND 99",
    "has_class": "class_uid IS NOT NULL",
    "has_severity": "severity_id IS NOT NULL AND severity_id BETWEEN 0 AND 6",
    "has_source": "source_name IS NOT NULL",
    "valid_ip_format_src": "src_ip IS NULL OR src_ip RLIKE '^[0-9]{1,3}\\.[0-9]{1,3}\\.[0-9]{1,3}\\.[0-9]{1,3}$'",
    "valid_ip_format_dst": "dst_ip IS NULL OR dst_ip RLIKE '^[0-9]{1,3}\\.[0-9]{1,3}\\.[0-9]{1,3}\\.[0-9]{1,3}$'",
    "valid_port_src": "src_port IS NULL OR (src_port >= 0 AND src_port <= 65535)",
    "valid_port_dst": "dst_port IS NULL OR (dst_port >= 0 AND dst_port <= 65535)",
    "non_negative_bytes": "bytes_in IS NULL OR bytes_in >= 0",
}

# Gold expectations: business logic validation
GOLD_EXPECTATIONS = {
    "positive_counts": "event_count > 0",
    "valid_risk_score": "risk_score IS NULL OR (risk_score >= 0 AND risk_score <= 10)",
    "valid_failure_rate": "failure_rate_pct IS NULL OR (failure_rate_pct >= 0 AND failure_rate_pct <= 100)",
}

# Cross-layer expectations (run as periodic batch checks)
CONSISTENCY_CHECKS = {
    "bronze_silver_count": """
        WITH bronze_count AS (
            SELECT COUNT(*) as bc FROM {catalog}.{schema}.bronze_events
            WHERE ingest_timestamp >= current_timestamp() - INTERVAL 1 HOUR
        ),
        silver_count AS (
            SELECT COUNT(*) as sc FROM {catalog}.{schema}.silver_events
            WHERE normalized_at >= current_timestamp() - INTERVAL 1 HOUR
        )
        SELECT
            bc, sc,
            CASE WHEN bc > 0 THEN (sc * 100.0 / bc) ELSE 100 END as completion_pct
        FROM bronze_count, silver_count
    """,
    "no_future_events": """
        SELECT COUNT(*) as future_events
        FROM {catalog}.{schema}.silver_events
        WHERE time > current_timestamp() + INTERVAL 1 HOUR
    """,
    "dedup_check": """
        SELECT event_id, COUNT(*) as dupes
        FROM {catalog}.{schema}.silver_events
        WHERE normalized_at >= current_timestamp() - INTERVAL 1 HOUR
        GROUP BY event_id
        HAVING COUNT(*) > 1
    """,
}


def validate_batch(spark, catalog: str, schema: str, layer: str = "silver"):
    """
    Run data quality expectations against a batch of data.
    Returns validation results for monitoring.
    """
    expectations = {
        "bronze": BRONZE_EXPECTATIONS,
        "silver": SILVER_EXPECTATIONS,
        "gold": GOLD_EXPECTATIONS,
    }.get(layer, SILVER_EXPECTATIONS)

    table = f"{catalog}.{schema}.{layer}_events"
    results = []

    for name, expression in expectations.items():
        try:
            total = spark.table(table).filter(
                "normalized_at >= current_timestamp() - INTERVAL 1 HOUR"
                if layer != "bronze" else
                "ingest_timestamp >= current_timestamp() - INTERVAL 1 HOUR"
            ).count()

            passing = spark.table(table).filter(
                f"({expression})"
            ).filter(
                "normalized_at >= current_timestamp() - INTERVAL 1 HOUR"
                if layer != "bronze" else
                "ingest_timestamp >= current_timestamp() - INTERVAL 1 HOUR"
            ).count()

            pass_rate = (passing / total * 100) if total > 0 else 100.0

            results.append({
                "expectation": name,
                "layer": layer,
                "total_records": total,
                "passing_records": passing,
                "pass_rate_pct": round(pass_rate, 2),
                "status": "PASS" if pass_rate >= 99.0 else "WARN" if pass_rate >= 95.0 else "FAIL",
            })
        except Exception as e:
            results.append({
                "expectation": name,
                "layer": layer,
                "total_records": 0,
                "passing_records": 0,
                "pass_rate_pct": 0,
                "status": f"ERROR: {str(e)[:100]}",
            })

    return results
