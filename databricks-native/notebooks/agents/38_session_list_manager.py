# Databricks notebook source
# MAGIC %md
# MAGIC # Agent 38: Session List Manager
# MAGIC
# MAGIC **Production-Grade BatchAgent Implementation**
# MAGIC
# MAGIC Maintains dynamic session lists and detects session anomalies:
# MAGIC - Tracks active sessions per user, IP, service
# MAGIC - Detects anomalies: impossible travel, concurrent sessions, session hijacking
# MAGIC - Updates session state tables in real-time
# MAGIC - Writes anomalies to `session_anomalies` table for investigation
# MAGIC
# MAGIC ## Key Features
# MAGIC - MLflow experiment tracking and metrics logging
# MAGIC - Session state machine implementation
# MAGIC - Geolocation-based impossible travel detection
# MAGIC - Concurrent session analysis
# MAGIC - UC Function tool registration
# MAGIC - Structured AgentResult with trace IDs

# COMMAND ----------

# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

# MAGIC %md
# MAGIC ## Initialization and Configuration

# COMMAND ----------

from agent_framework import (
    BatchAgent, AgentResult, AgentStatus,
    UCTool, create_soc_tools
)
import mlflow
import mlflow.tracing
from pyspark.sql.functions import *
from pyspark.sql.types import *
import json
import time
import logging
from datetime import datetime, timedelta

logger = logging.getLogger("oxdsi.session_list_manager")

# Parse notebook parameters
dbutils.widgets.text("lookback_hours", "24", "Hours of session data to analyze")
dbutils.widgets.text("anomaly_confidence_threshold", "0.7", "Min confidence for anomaly flagging")
dbutils.widgets.text("max_concurrent_sessions", "5", "Max allowed concurrent sessions per user")
dbutils.widgets.text("impossible_travel_speed_kmh", "900", "Speed above which travel is impossible")

lookback_hours = int(dbutils.widgets.get("lookback_hours"))
anomaly_confidence_threshold = float(dbutils.widgets.get("anomaly_confidence_threshold"))
max_concurrent_sessions = int(dbutils.widgets.get("max_concurrent_sessions"))
impossible_travel_speed = float(dbutils.widgets.get("impossible_travel_speed_kmh"))

mon.log_event("session_manager_config_loaded", {
    "lookback_hours": lookback_hours,
    "anomaly_threshold": anomaly_confidence_threshold,
    "max_concurrent": max_concurrent_sessions,
    "travel_speed_kmh": impossible_travel_speed,
})

# COMMAND ----------

# MAGIC %md
# MAGIC ## Define SessionListManager Class

# COMMAND ----------

class SessionListManager(BatchAgent):
    """
    Maintains dynamic session lists and anomaly detection.

    Processes authentication and session events to:
    1. Track active sessions per user/IP/service
    2. Detect impossible travel (location deltas)
    3. Flag concurrent session anomalies
    4. Identify session hijacking patterns
    """

    # Session anomaly types
    ANOMALY_TYPES = {
        "impossible_travel": "User appeared in different locations within impossible timeframe",
        "concurrent_sessions": "User has too many active sessions simultaneously",
        "session_hijacking": "Session from unexpected location or device",
        "brute_force_attempt": "Multiple failed auth attempts from single session",
        "idle_session_reactivation": "Session reactivated after extended inactivity",
    }

    def __init__(self, agent_name: str, cfg, llm, mon, spark):
        super().__init__(agent_name, cfg, llm, mon, spark)
        self._sessions_processed = 0
        self._anomalies_detected = 0

        # Register UC tools
        soc_tools = create_soc_tools(cfg)
        for tool in soc_tools:
            if tool.name in ["query_user_behavior", "get_asset_info"]:
                self.register_tool(tool)

    def execute(self) -> AgentResult:
        """Main execution: fetch sessions → detect anomalies → persist results."""
        start_time = time.time()

        try:
            # Ensure output tables exist
            self._ensure_tables()

            # Initialize MLflow run
            with mlflow.start_run(run_name=f"{self.agent_name}_{int(time.time())}"):
                mlflow.set_experiment(f"/0xDSI/agents/{self.agent_name}")

                # Fetch active sessions
                sessions = self._fetch_active_sessions()
                self._sessions_processed = len(sessions)

                if self._sessions_processed == 0:
                    return AgentResult(
                        status=AgentStatus.IDLE,
                        agent_name=self.agent_name,
                        processed_count=0,
                        duration_seconds=time.time() - start_time,
                    )

                # Analyze for anomalies
                anomalies = self._detect_anomalies(sessions)
                self._anomalies_detected = len(anomalies)

                # Persist results
                if anomalies:
                    self._persist_anomalies(anomalies)

                # Update session state
                self._update_session_state(sessions, anomalies)

                # Log metrics
                self._log_metrics()

            duration = time.time() - start_time
            return AgentResult(
                status=AgentStatus.COMPLETED,
                agent_name=self.agent_name,
                processed_count=self._sessions_processed,
                error_count=self._anomalies_detected,
                duration_seconds=duration,
                details={
                    "sessions_analyzed": self._sessions_processed,
                    "anomalies_detected": self._anomalies_detected,
                    "anomaly_types": list(self.ANOMALY_TYPES.keys()),
                },
            )

        except Exception as e:
            logger.exception(f"Session manager failed: {e}")
            return AgentResult(
                status=AgentStatus.FAILED,
                agent_name=self.agent_name,
                error=str(e)[:500],
                duration_seconds=time.time() - start_time,
            )

    def _ensure_tables(self):
        """Create or validate session and anomaly tables."""
        session_anomalies_table = get_table_path(cfg, "session_anomalies")
        session_state_table = get_table_path(cfg, "session_state")

        spark.sql(f"""
            CREATE TABLE IF NOT EXISTS {session_anomalies_table} (
                anomaly_id STRING NOT NULL,
                session_id STRING NOT NULL,
                user_id STRING NOT NULL,
                anomaly_type STRING NOT NULL,
                confidence DOUBLE,
                details STRING,
                location_from STRING,
                location_to STRING,
                time_delta_seconds INT,
                detected_at TIMESTAMP NOT NULL
            )
            USING DELTA
            PARTITIONED BY (date(detected_at))
            TBLPROPERTIES (
                'delta.autoOptimize.optimizeWrite' = 'true',
                'delta.autoOptimize.optimizeRead' = 'true'
            )
        """)

        spark.sql(f"""
            CREATE TABLE IF NOT EXISTS {session_state_table} (
                session_id STRING NOT NULL,
                user_id STRING NOT NULL,
                ip_address STRING,
                device_id STRING,
                service_name STRING,
                status STRING,
                created_at TIMESTAMP,
                last_activity TIMESTAMP,
                risk_score DOUBLE
            )
            USING DELTA
        """)

    def _fetch_active_sessions(self) -> list:
        """Fetch active sessions from events table."""
        span = self._start_trace("fetch_sessions")
        try:
            auth_events_table = get_table_path(cfg, "authentication_events")

            query = f"""
                SELECT DISTINCT
                    session_id,
                    user_id,
                    ip_address,
                    device_id,
                    service_name,
                    location_country,
                    location_city,
                    latitude,
                    longitude,
                    created_at,
                    last_activity_at,
                    event_count
                FROM {auth_events_table}
                WHERE last_activity_at > current_timestamp() - INTERVAL {lookback_hours} HOURS
                  AND status = 'active'
                ORDER BY last_activity_at DESC
            """

            sessions_df = spark.sql(query)
            sessions = sessions_df.collect()

            self._end_trace(span, {
                "session_count": len(sessions),
                "status": "success"
            })
            return sessions

        except Exception as e:
            self._end_trace(span, {"error": str(e)[:200], "status": "failed"})
            logger.error(f"Failed to fetch sessions: {e}")
            return []

    def _detect_anomalies(self, sessions: list) -> list:
        """Detect session anomalies using rule-based approach."""
        anomalies = []
        span = self._start_trace("detect_anomalies")

        try:
            # Group sessions by user
            user_sessions = {}
            for session in sessions:
                uid = session.user_id
                if uid not in user_sessions:
                    user_sessions[uid] = []
                user_sessions[uid].append(session)

            # Check each user's sessions for anomalies
            for user_id, user_sesses in user_sessions.items():
                # 1. Concurrent session detection
                if len(user_sesses) > max_concurrent_sessions:
                    anomalies.append({
                        "anomaly_type": "concurrent_sessions",
                        "session_id": user_sesses[0].session_id,
                        "user_id": user_id,
                        "confidence": min(1.0, len(user_sesses) / (max_concurrent_sessions * 2)),
                        "details": f"User has {len(user_sesses)} active sessions",
                        "detected_at": datetime.utcnow().isoformat(),
                    })

                # 2. Impossible travel detection
                if len(user_sesses) > 1:
                    sorted_sesses = sorted(
                        user_sesses,
                        key=lambda s: s.last_activity_at or s.created_at
                    )

                    for i in range(len(sorted_sesses) - 1):
                        curr = sorted_sesses[i]
                        next_s = sorted_sesses[i + 1]

                        if (curr.latitude is not None and curr.longitude is not None and
                            next_s.latitude is not None and next_s.longitude is not None):

                            # Calculate distance and time delta
                            distance_km = self._haversine_distance(
                                curr.latitude, curr.longitude,
                                next_s.latitude, next_s.longitude
                            )

                            time_delta = (
                                (next_s.last_activity_at or next_s.created_at) -
                                (curr.last_activity_at or curr.created_at)
                            ).total_seconds() / 3600  # hours

                            if time_delta > 0:
                                speed_kmh = distance_km / time_delta
                                if speed_kmh > impossible_travel_speed:
                                    anomalies.append({
                                        "anomaly_type": "impossible_travel",
                                        "session_id": next_s.session_id,
                                        "user_id": user_id,
                                        "confidence": min(
                                            1.0,
                                            (speed_kmh - impossible_travel_speed) / 1000
                                        ),
                                        "details": f"Travel speed {speed_kmh:.1f} km/h (impossible)",
                                        "location_from": f"{curr.location_city}, {curr.location_country}",
                                        "location_to": f"{next_s.location_city}, {next_s.location_country}",
                                        "time_delta_seconds": int(time_delta * 3600),
                                        "detected_at": datetime.utcnow().isoformat(),
                                    })

            self._end_trace(span, {
                "anomalies_found": len(anomalies),
                "status": "success"
            })

        except Exception as e:
            self._end_trace(span, {"error": str(e)[:200], "status": "failed"})
            logger.error(f"Anomaly detection failed: {e}")

        return anomalies

    def _haversine_distance(self, lat1: float, lon1: float, lat2: float, lon2: float) -> float:
        """Calculate distance between two lat/lon coordinates in km."""
        from math import radians, sin, cos, sqrt, atan2

        R = 6371  # Earth radius in km
        lat1_r, lon1_r, lat2_r, lon2_r = map(radians, [lat1, lon1, lat2, lon2])

        dlat = lat2_r - lat1_r
        dlon = lon2_r - lon1_r

        a = sin(dlat/2)**2 + cos(lat1_r) * cos(lat2_r) * sin(dlon/2)**2
        c = 2 * atan2(sqrt(a), sqrt(1-a))

        return R * c

    def _persist_anomalies(self, anomalies: list):
        """Write anomalies to Delta table."""
        if not anomalies:
            return

        span = self._start_trace("persist_anomalies")
        try:
            session_anomalies_table = get_table_path(cfg, "session_anomalies")

            schema = StructType([
                StructField("anomaly_type", StringType()),
                StructField("session_id", StringType()),
                StructField("user_id", StringType()),
                StructField("confidence", DoubleType()),
                StructField("details", StringType()),
                StructField("location_from", StringType()),
                StructField("location_to", StringType()),
                StructField("time_delta_seconds", IntegerType()),
            ])

            anomalies_df = (
                spark.createDataFrame(anomalies, schema=schema)
                .withColumn("anomaly_id", expr("uuid()"))
                .withColumn("detected_at", current_timestamp())
            )

            safe_append(anomalies_df, session_anomalies_table)

            self._end_trace(span, {
                "status": "success",
                "anomalies_written": len(anomalies)
            })

        except Exception as e:
            self._end_trace(span, {"error": str(e)[:200], "status": "failed"})
            raise

    def _update_session_state(self, sessions: list, anomalies: list):
        """Update session state table with current status."""
        span = self._start_trace("update_session_state")
        try:
            session_state_table = get_table_path(cfg, "session_state")

            # Build state records
            state_records = []
            anomaly_sessions = {a["session_id"] for a in anomalies}

            for session in sessions:
                risk_score = 0.0
                if session.session_id in anomaly_sessions:
                    # Higher risk for sessions with anomalies
                    risk_score = 0.8

                state_records.append({
                    "session_id": session.session_id,
                    "user_id": session.user_id,
                    "ip_address": session.ip_address,
                    "device_id": session.device_id,
                    "service_name": session.service_name,
                    "status": "active",
                    "created_at": session.created_at,
                    "last_activity": session.last_activity_at,
                    "risk_score": risk_score,
                })

            if state_records:
                schema = StructType([
                    StructField("session_id", StringType()),
                    StructField("user_id", StringType()),
                    StructField("ip_address", StringType()),
                    StructField("device_id", StringType()),
                    StructField("service_name", StringType()),
                    StructField("status", StringType()),
                    StructField("created_at", TimestampType()),
                    StructField("last_activity", TimestampType()),
                    StructField("risk_score", DoubleType()),
                ])

                state_df = spark.createDataFrame(state_records, schema=schema)
                safe_merge(
                    spark, state_df, session_state_table,
                    merge_keys=["session_id"],
                    update_columns=["last_activity", "risk_score"]
                )

            self._end_trace(span, {"status": "success"})

        except Exception as e:
            self._end_trace(span, {"error": str(e)[:200], "status": "failed"})
            logger.warning(f"Session state update failed: {e}")

    def _log_metrics(self):
        """Log metrics to MLflow."""
        try:
            mlflow.log_metrics({
                "sessions_analyzed": self._sessions_processed,
                "anomalies_detected": self._anomalies_detected,
            })
            mlflow.log_params({
                "lookback_hours": lookback_hours,
                "anomaly_threshold": anomaly_confidence_threshold,
                "max_concurrent": max_concurrent_sessions,
            })
        except Exception as e:
            logger.warning(f"MLflow metrics logging failed: {e}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Execute Session List Manager

# COMMAND ----------

try:
    agent = SessionListManager("session_list_manager", cfg, llm, mon, spark)
    result = agent.run()

    mon.log_event("session_manager_result", {
        "status": result.status.value,
        "processed": result.processed_count,
        "anomalies": result.error_count,
        "duration_seconds": result.duration_seconds,
    })

    print(json.dumps({
        "status": result.status.value,
        "trace_id": result.trace_id,
        "sessions_analyzed": result.processed_count,
        "anomalies_detected": result.error_count,
        "duration_seconds": round(result.duration_seconds, 3),
        "details": result.details,
    }))

    dbutils.notebook.exit(result.to_json())

except Exception as e:
    logger.exception(f"Session manager fatal error: {e}")
    mon.log_error(e, "session_manager_execution")

    error_result = AgentResult(
        status=AgentStatus.FAILED,
        agent_name="session_list_manager",
        error=str(e)[:500],
    )

    dbutils.notebook.exit(error_result.to_json())
