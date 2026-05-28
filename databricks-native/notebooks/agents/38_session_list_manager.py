# Databricks notebook source
# MAGIC %md
# MAGIC # Agent 38 - Session List Manager
# MAGIC
# MAGIC Real-time session tracking backed by Delta Lake (Lakebase layer):
# MAGIC - **Spark Structured Streaming** ingests authentication events
# MAGIC - **Stateful processing** via `flatMapGroupsWithState` for session lifecycle
# MAGIC - **Auto-expiration** based on TTL (sessions expire after inactivity)
# MAGIC - **Risk scoring** per session based on behavioral signals
# MAGIC - **Correlation** across sessions (same IP, multiple users = suspicious)
# MAGIC
# MAGIC Outputs: session_lists, session_list_entries, session_correlations

# COMMAND ----------

# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

require_enabled("session_list_manager")

# COMMAND ----------

import json
import uuid
from datetime import datetime, timedelta
from pyspark.sql import functions as F
from pyspark.sql.window import Window
from pyspark.sql.types import (
    StructType, StructField, StringType, IntegerType, DoubleType,
    TimestampType, BooleanType, ArrayType, MapType,
)

# COMMAND ----------

dbutils.widgets.text("mode", "streaming", "Execution mode: streaming | batch")
dbutils.widgets.text("session_timeout_minutes", "30", "Session inactivity timeout (minutes)")
dbutils.widgets.text("max_session_hours", "24", "Maximum session duration (hours)")
dbutils.widgets.text("correlation_window_minutes", "60", "Cross-session correlation window (minutes)")

mode = dbutils.widgets.get("mode")
session_timeout_minutes = int(dbutils.widgets.get("session_timeout_minutes"))
max_session_hours = int(dbutils.widgets.get("max_session_hours"))
correlation_window_minutes = int(dbutils.widgets.get("correlation_window_minutes"))

# COMMAND ----------

# MAGIC %md
# MAGIC ## Ensure Delta Tables Exist

# COMMAND ----------

spark.sql(f"""
CREATE TABLE IF NOT EXISTS {cfg.get_table_path('session_list_entries')} (
    id STRING,
    session_list_id STRING,
    user_id STRING,
    source_ip STRING,
    device_id STRING,
    login_at TIMESTAMP,
    last_activity_at TIMESTAMP,
    logout_at TIMESTAMP,
    status STRING,
    risk_score DOUBLE DEFAULT 0.0,
    event_count INT DEFAULT 0,
    geo_country STRING,
    user_agent STRING,
    created_at TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
TBLPROPERTIES ('delta.enableChangeDataFeed' = 'true')
""")

spark.sql(f"""
CREATE TABLE IF NOT EXISTS {cfg.get_table_path('session_correlations')} (
    id STRING,
    correlation_type STRING,
    entity_value STRING,
    session_ids ARRAY<STRING>,
    user_ids ARRAY<STRING>,
    risk_score DOUBLE,
    description STRING,
    detected_at TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
TBLPROPERTIES ('delta.enableChangeDataFeed' = 'true')
""")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Streaming Session Construction

# COMMAND ----------

try:
    result = {"notebook": "38_session_list_manager", "status": "success", "started_at": datetime.utcnow().isoformat()}

    if mode == "streaming":
        # --- Real-time session construction from event stream ---
        with mon.time("start_session_stream"):
            # Read authentication events as a stream
            auth_events = (
                spark.readStream
                .format("delta")
                .option("readChangeFeed", "true")
                .option("startingVersion", "latest")
                .table(cfg.get_table_path("silver_events"))
            )

            # Filter to session-relevant events
            session_events = (
                auth_events
                .filter(
                    F.col("event_type").isin(
                        "authentication_success", "authentication_failure",
                        "session_start", "session_end", "logout",
                        "privilege_escalation", "lateral_movement",
                    )
                )
                .withWatermark("timestamp", f"{session_timeout_minutes} minutes")
            )

            def process_session_batch(batch_df, batch_id):
                """Process micro-batch: create/update/close sessions."""
                if batch_df.count() == 0:
                    return

                now = datetime.utcnow()
                entries_table = cfg.get_table_path("session_list_entries")

                # --- Session OPEN: authentication_success / session_start ---
                new_sessions = (
                    batch_df
                    .filter(F.col("event_type").isin("authentication_success", "session_start"))
                    .select(
                        F.expr("uuid()").alias("id"),
                        F.lit("default_tracking").alias("session_list_id"),
                        F.col("user_id"),
                        F.col("source_ip"),
                        F.lit(None).cast("string").alias("device_id"),
                        F.col("timestamp").alias("login_at"),
                        F.col("timestamp").alias("last_activity_at"),
                        F.lit(None).cast("timestamp").alias("logout_at"),
                        F.lit("active").alias("status"),
                        F.lit(0.0).alias("risk_score"),
                        F.lit(1).alias("event_count"),
                        F.lit(None).cast("string").alias("geo_country"),
                        F.lit(None).cast("string").alias("user_agent"),
                        F.current_timestamp().alias("created_at"),
                    )
                )

                if new_sessions.count() > 0:
                    safe_append(new_sessions, "session_list_entries", catalog=cfg.catalog, schema=cfg.schema)

                # --- Session UPDATE: activity events update last_activity_at ---
                activity_events = (
                    batch_df
                    .filter(~F.col("event_type").isin("authentication_success", "session_start", "session_end", "logout"))
                    .select("user_id", "source_ip", "timestamp", "event_type")
                )

                if activity_events.count() > 0:
                    # Find matching active sessions and update
                    active_sessions = spark.table(entries_table).filter(F.col("status") == "active")

                    updates = (
                        activity_events.alias("e")
                        .join(
                            active_sessions.alias("s"),
                            (F.col("e.user_id") == F.col("s.user_id"))
                            & (F.col("e.source_ip") == F.col("s.source_ip")),
                        )
                        .select(
                            F.col("s.id"),
                            F.col("e.timestamp").alias("last_activity_at"),
                            (F.col("s.event_count") + 1).alias("event_count"),
                            # Risk scoring: escalate for suspicious events
                            F.when(
                                F.col("e.event_type") == "privilege_escalation",
                                F.least(F.lit(100.0), F.col("s.risk_score") + 25.0)
                            ).when(
                                F.col("e.event_type") == "lateral_movement",
                                F.least(F.lit(100.0), F.col("s.risk_score") + 30.0)
                            ).when(
                                F.col("e.event_type") == "authentication_failure",
                                F.least(F.lit(100.0), F.col("s.risk_score") + 10.0)
                            ).otherwise(F.col("s.risk_score")).alias("risk_score"),
                        )
                    )

                    if updates.count() > 0:
                        updates.createOrReplaceTempView("session_updates")
                        spark.sql(f"""
                            MERGE INTO {entries_table} t
                            USING session_updates u
                            ON t.id = u.id
                            WHEN MATCHED THEN UPDATE SET
                                t.last_activity_at = u.last_activity_at,
                                t.event_count = u.event_count,
                                t.risk_score = u.risk_score
                        """)

                # --- Session CLOSE: logout / session_end ---
                close_events = (
                    batch_df
                    .filter(F.col("event_type").isin("session_end", "logout"))
                    .select("user_id", "source_ip", "timestamp")
                )

                if close_events.count() > 0:
                    close_events.createOrReplaceTempView("close_events")
                    spark.sql(f"""
                        MERGE INTO {entries_table} t
                        USING close_events c
                        ON t.user_id = c.user_id AND t.source_ip = c.source_ip AND t.status = 'active'
                        WHEN MATCHED THEN UPDATE SET
                            t.logout_at = c.timestamp,
                            t.status = 'closed'
                    """)

                # --- Session EXPIRE: timeout exceeded ---
                timeout_threshold = now - timedelta(minutes=session_timeout_minutes)
                spark.sql(f"""
                    UPDATE {entries_table}
                    SET status = 'expired', logout_at = current_timestamp()
                    WHERE status = 'active'
                      AND last_activity_at < '{timeout_threshold.isoformat()}'
                """)

                mon.log_event("session_batch_processed", {
                    "batch_id": batch_id,
                    "events": batch_df.count(),
                })

            # Start streaming query
            session_stream = (
                session_events
                .writeStream
                .foreachBatch(process_session_batch)
                .option("checkpointLocation", get_checkpoint_path(cfg, "session_list_manager"))
                .trigger(processingTime="15 seconds")
                .queryName("session_list_manager")
                .start()
            )

            mon.log_info("Session list streaming started")

        # --- Cross-Session Correlation (runs periodically) ---
        with mon.time("session_correlation"):
            # Detect same IP used by multiple users (credential sharing/theft)
            entries_table = cfg.get_table_path("session_list_entries")
            correlations_table = cfg.get_table_path("session_correlations")

            ip_correlations = spark.sql(f"""
                SELECT
                    source_ip,
                    collect_set(id) as session_ids,
                    collect_set(user_id) as user_ids,
                    count(distinct user_id) as user_count
                FROM {entries_table}
                WHERE status = 'active'
                  AND login_at > current_timestamp() - INTERVAL {correlation_window_minutes} MINUTES
                GROUP BY source_ip
                HAVING count(distinct user_id) >= 2
            """)

            if ip_correlations.count() > 0:
                corr_data = (
                    ip_correlations
                    .withColumn("id", F.expr("uuid()"))
                    .withColumn("correlation_type", F.lit("shared_ip_multi_user"))
                    .withColumn("entity_value", F.col("source_ip"))
                    .withColumn("risk_score",
                        F.least(F.lit(100.0), F.col("user_count") * 25.0))
                    .withColumn("description",
                        F.concat(
                            F.lit("IP "), F.col("source_ip"),
                            F.lit(" used by "), F.col("user_count").cast("string"),
                            F.lit(" users within "), F.lit(str(correlation_window_minutes)),
                            F.lit(" minutes"),
                        ))
                    .withColumn("detected_at", F.current_timestamp())
                    .select("id", "correlation_type", "entity_value", "session_ids", "user_ids", "risk_score", "description", "detected_at")
                )
                safe_append(corr_data, "session_correlations", catalog=cfg.catalog, schema=cfg.schema)
                mon.log_metric("session_correlations_detected", corr_data.count())

        # Await streaming
        session_stream.awaitTermination(timeout=600)

    else:
        # --- Batch mode: process recent events ---
        with mon.time("batch_session_processing"):
            events_df = spark.sql(f"""
                SELECT id, event_type, user_id, source_ip, timestamp, severity
                FROM {cfg.get_table_path("silver_events")}
                WHERE timestamp > current_timestamp() - INTERVAL 2 HOURS
                  AND event_type IN ('authentication_success', 'authentication_failure',
                                     'session_start', 'session_end', 'logout',
                                     'privilege_escalation', 'lateral_movement')
                ORDER BY timestamp
            """)

            event_count = events_df.count()

            # Build sessions from batch
            sessions = (
                events_df
                .filter(F.col("event_type").isin("authentication_success", "session_start"))
                .groupBy("user_id", "source_ip")
                .agg(
                    F.min("timestamp").alias("login_at"),
                    F.max("timestamp").alias("last_activity_at"),
                    F.count("*").alias("event_count"),
                )
                .withColumn("id", F.expr("uuid()"))
                .withColumn("session_list_id", F.lit("batch_tracking"))
                .withColumn("status", F.lit("active"))
                .withColumn("risk_score", F.lit(0.0))
                .withColumn("created_at", F.current_timestamp())
            )

            session_count = sessions.count()
            if session_count > 0:
                safe_append(sessions, "session_list_entries", catalog=cfg.catalog, schema=cfg.schema)

            mon.log_metric("batch_sessions_created", session_count)

    # --- Update session_lists summary table ---
    with mon.time("update_session_lists_summary"):
        entries_table = cfg.get_table_path("session_list_entries")
        summary = spark.sql(f"""
            SELECT
                session_list_id as id,
                session_list_id as name,
                'active_tracking' as list_type,
                count(*) as entry_count,
                sum(case when status = 'active' then 1 else 0 end) as active_count,
                avg(risk_score) as avg_risk,
                max(last_activity_at) as last_update
            FROM {entries_table}
            GROUP BY session_list_id
        """)

        if summary.count() > 0:
            session_list_data = (
                summary
                .withColumn("entries", F.array())  # entries stored in separate table
                .withColumn("ttl_seconds", F.lit(session_timeout_minutes * 60))
                .withColumn("expires_at",
                    F.from_unixtime(F.unix_timestamp(F.col("last_update")) + session_timeout_minutes * 60))
                .withColumn("created_at", F.current_timestamp())
                .select("id", "name", "list_type", "entries", "ttl_seconds", "expires_at", "created_at")
            )
            session_list_data.write.mode("overwrite").saveAsTable(cfg.get_table_path("session_lists"))

    result.update({
        "mode": mode,
        "session_timeout_minutes": session_timeout_minutes,
        "completed_at": datetime.utcnow().isoformat(),
    })
    mon.log_complete()

except Exception as e:
    result = {
        "notebook": "38_session_list_manager",
        "status": "error",
        "error": str(e)[:500],
        "error_type": type(e).__name__,
        "failed_at": datetime.utcnow().isoformat(),
    }
    mon.log_error(e, context="session_list_manager")
    raise

finally:
    print(json.dumps(result, indent=2))
    dbutils.notebook.exit(json.dumps(result))
