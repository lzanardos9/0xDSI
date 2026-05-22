# Databricks notebook source
# MAGIC %md
# MAGIC # Feature Engineering Pipeline
# MAGIC
# MAGIC Computes user behavior features, IP features, and event sequences
# MAGIC for the threat scoring model. Writes feature tables for downstream consumption.

# COMMAND ----------

# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

import json
from datetime import datetime

# COMMAND ----------

dbutils.widgets.text("lookback_days", "30", "Feature Lookback Window (days)")
lookback_days = int(dbutils.widgets.get("lookback_days"))

# COMMAND ----------

try:
    result = {"notebook": "02_feature_engineering", "status": "success", "started_at": datetime.utcnow().isoformat()}

    # --- User Behavior Features ---
    with mon.time("user_behavior_features"):
        user_features_query = f"""
        SELECT
            username,
            COUNT(*) AS total_events,
            COUNT(DISTINCT event_type) AS distinct_event_types,
            COUNT(DISTINCT source_ip) AS distinct_source_ips,
            COUNT(DISTINCT destination_host) AS distinct_destinations,
            SUM(CASE WHEN event_type = 'authentication_failure' THEN 1 ELSE 0 END) AS failed_auth_count,
            SUM(CASE WHEN event_type = 'privilege_escalation' THEN 1 ELSE 0 END) AS priv_escalation_count,
            SUM(CASE WHEN hour(event_timestamp) BETWEEN 0 AND 5 THEN 1 ELSE 0 END) AS off_hours_events,
            AVG(bytes_transferred) AS avg_bytes_transferred,
            MAX(bytes_transferred) AS max_bytes_transferred,
            STDDEV(bytes_transferred) AS stddev_bytes_transferred,
            COUNT(DISTINCT date(event_timestamp)) AS active_days,
            COUNT(*) / COUNT(DISTINCT date(event_timestamp)) AS avg_daily_events,
            SUM(CASE WHEN geo_country != primary_country THEN 1 ELSE 0 END) AS foreign_country_events,
            MAX(DATEDIFF(current_date(), date(event_timestamp))) AS days_since_first_event,
            MIN(DATEDIFF(current_date(), date(event_timestamp))) AS days_since_last_event,
            APPROX_PERCENTILE(session_duration_seconds, 0.5) AS median_session_duration,
            APPROX_PERCENTILE(session_duration_seconds, 0.95) AS p95_session_duration
        FROM {cfg.get_table_path("enriched_security_events")}
        WHERE event_date >= date_sub(current_date(), {lookback_days})
          AND username IS NOT NULL
        GROUP BY username
        """
        user_features_df = spark.sql(user_features_query)
        user_feature_count = user_features_df.count()
        mon.log_event("user_features_computed", {"user_count": user_feature_count})

    # --- IP Reputation Features ---
    with mon.time("ip_features"):
        ip_features_query = f"""
        SELECT
            source_ip,
            COUNT(*) AS total_events_from_ip,
            COUNT(DISTINCT username) AS distinct_users_from_ip,
            COUNT(DISTINCT destination_host) AS distinct_targets_from_ip,
            SUM(CASE WHEN event_type = 'authentication_failure' THEN 1 ELSE 0 END) AS failed_auths_from_ip,
            SUM(CASE WHEN event_type = 'port_scan' THEN 1 ELSE 0 END) AS port_scans_from_ip,
            SUM(CASE WHEN event_type = 'brute_force' THEN 1 ELSE 0 END) AS brute_force_from_ip,
            COUNT(DISTINCT geo_country) AS distinct_countries,
            MAX(threat_intel_score) AS max_threat_intel_score,
            AVG(threat_intel_score) AS avg_threat_intel_score,
            SUM(CASE WHEN is_known_tor_exit THEN 1 ELSE 0 END) AS tor_exit_hits,
            SUM(CASE WHEN is_known_vpn THEN 1 ELSE 0 END) AS vpn_hits,
            COUNT(DISTINCT hour(event_timestamp)) AS distinct_active_hours,
            COUNT(DISTINCT date(event_timestamp)) AS active_days
        FROM {cfg.get_table_path("enriched_security_events")}
        WHERE event_date >= date_sub(current_date(), {lookback_days})
          AND source_ip IS NOT NULL
        GROUP BY source_ip
        """
        ip_features_df = spark.sql(ip_features_query)
        ip_feature_count = ip_features_df.count()
        mon.log_event("ip_features_computed", {"ip_count": ip_feature_count})

    # --- Event Sequence Features ---
    with mon.time("event_sequence_features"):
        sequence_features_query = f"""
        WITH user_sessions AS (
            SELECT
                username,
                event_type,
                event_timestamp,
                LAG(event_type) OVER (PARTITION BY username ORDER BY event_timestamp) AS prev_event_type,
                LAG(event_timestamp) OVER (PARTITION BY username ORDER BY event_timestamp) AS prev_timestamp,
                LEAD(event_type) OVER (PARTITION BY username ORDER BY event_timestamp) AS next_event_type
            FROM {cfg.get_table_path("enriched_security_events")}
            WHERE event_date >= date_sub(current_date(), {lookback_days})
              AND username IS NOT NULL
        )
        SELECT
            username,
            COUNT(CASE WHEN event_type = 'authentication_failure'
                        AND next_event_type = 'authentication_success' THEN 1 END) AS fail_then_success_count,
            COUNT(CASE WHEN event_type = 'authentication_success'
                        AND next_event_type = 'privilege_escalation' THEN 1 END) AS auth_then_escalation_count,
            COUNT(CASE WHEN event_type = 'port_scan'
                        AND next_event_type = 'lateral_movement' THEN 1 END) AS scan_then_lateral_count,
            AVG(UNIX_TIMESTAMP(event_timestamp) - UNIX_TIMESTAMP(prev_timestamp)) AS avg_inter_event_seconds,
            MIN(UNIX_TIMESTAMP(event_timestamp) - UNIX_TIMESTAMP(prev_timestamp)) AS min_inter_event_seconds,
            COUNT(CASE WHEN UNIX_TIMESTAMP(event_timestamp) - UNIX_TIMESTAMP(prev_timestamp) < 1 THEN 1 END) AS rapid_fire_events,
            COUNT(DISTINCT CONCAT(prev_event_type, '->', event_type)) AS distinct_event_transitions
        FROM user_sessions
        GROUP BY username
        """
        sequence_features_df = spark.sql(sequence_features_query)
        sequence_feature_count = sequence_features_df.count()
        mon.log_event("sequence_features_computed", {"user_count": sequence_feature_count})

    # --- Create/Overwrite Feature Tables ---
    with mon.time("persist_feature_tables"):
        # User behavior features table
        user_features_table = cfg.get_table_path("user_behavior_features")
        spark.sql(f"""
        CREATE TABLE IF NOT EXISTS {user_features_table} (
            username STRING,
            total_events BIGINT,
            distinct_event_types BIGINT,
            distinct_source_ips BIGINT,
            distinct_destinations BIGINT,
            failed_auth_count BIGINT,
            priv_escalation_count BIGINT,
            off_hours_events BIGINT,
            avg_bytes_transferred DOUBLE,
            max_bytes_transferred BIGINT,
            stddev_bytes_transferred DOUBLE,
            active_days BIGINT,
            avg_daily_events DOUBLE,
            foreign_country_events BIGINT,
            days_since_first_event INT,
            days_since_last_event INT,
            median_session_duration DOUBLE,
            p95_session_duration DOUBLE
        ) USING DELTA
        """)
        user_features_df.write.mode("overwrite").saveAsTable(user_features_table)

        # IP features table
        ip_features_table = cfg.get_table_path("ip_reputation_features")
        spark.sql(f"""
        CREATE TABLE IF NOT EXISTS {ip_features_table} (
            source_ip STRING,
            total_events_from_ip BIGINT,
            distinct_users_from_ip BIGINT,
            distinct_targets_from_ip BIGINT,
            failed_auths_from_ip BIGINT,
            port_scans_from_ip BIGINT,
            brute_force_from_ip BIGINT,
            distinct_countries BIGINT,
            max_threat_intel_score DOUBLE,
            avg_threat_intel_score DOUBLE,
            tor_exit_hits BIGINT,
            vpn_hits BIGINT,
            distinct_active_hours BIGINT,
            active_days BIGINT
        ) USING DELTA
        """)
        ip_features_df.write.mode("overwrite").saveAsTable(ip_features_table)

        # Event sequence features table
        sequence_features_table = cfg.get_table_path("event_sequence_features")
        spark.sql(f"""
        CREATE TABLE IF NOT EXISTS {sequence_features_table} (
            username STRING,
            fail_then_success_count BIGINT,
            auth_then_escalation_count BIGINT,
            scan_then_lateral_count BIGINT,
            avg_inter_event_seconds DOUBLE,
            min_inter_event_seconds DOUBLE,
            rapid_fire_events BIGINT,
            distinct_event_transitions BIGINT
        ) USING DELTA
        """)
        sequence_features_df.write.mode("overwrite").saveAsTable(sequence_features_table)

        mon.log_event("feature_tables_persisted", {
            "user_features": user_feature_count,
            "ip_features": ip_feature_count,
            "sequence_features": sequence_feature_count,
        })

    # --- Finalize ---
    result.update({
        "lookback_days": lookback_days,
        "user_features_count": user_feature_count,
        "ip_features_count": ip_feature_count,
        "sequence_features_count": sequence_feature_count,
        "completed_at": datetime.utcnow().isoformat(),
    })
    mon.log_complete(result)

except Exception as e:
    result = {
        "notebook": "02_feature_engineering",
        "status": "error",
        "error": str(e),
        "error_type": type(e).__name__,
        "failed_at": datetime.utcnow().isoformat(),
    }
    mon.log_error(e, context={"lookback_days": lookback_days})
    raise

finally:
    dbutils.notebook.exit(json.dumps(result))
