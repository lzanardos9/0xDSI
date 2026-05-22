# Databricks notebook source
# MAGIC %md
# MAGIC # 0xDSI Monitoring & Observability
# MAGIC Structured logging to Delta audit table, MLflow metrics, and execution timing.
# MAGIC Every notebook should create a Monitor instance at startup and log key events.

# COMMAND ----------

import time
import logging
import traceback
from datetime import datetime, timezone
from dataclasses import dataclass, field, asdict
from typing import Optional, Any
from pyspark.sql import SparkSession, Row
from pyspark.sql.types import (
    StructType, StructField, StringType, TimestampType,
    DoubleType, LongType, MapType,
)

logger = logging.getLogger("oxdsi.monitoring")

AUDIT_TABLE = "notebook_audit_events"
METRICS_TABLE = "notebook_metrics"

AUDIT_SCHEMA = StructType([
    StructField("event_id", StringType(), False),
    StructField("notebook_path", StringType(), False),
    StructField("event_type", StringType(), False),
    StructField("severity", StringType(), False),
    StructField("message", StringType(), False),
    StructField("details", StringType(), True),
    StructField("environment", StringType(), True),
    StructField("catalog", StringType(), True),
    StructField("schema_name", StringType(), True),
    StructField("duration_ms", DoubleType(), True),
    StructField("row_count", LongType(), True),
    StructField("created_at", TimestampType(), False),
])


@dataclass
class TimingContext:
    """Context manager for timing operations."""
    operation: str
    start_time: float = field(default_factory=time.time)
    end_time: float = 0.0

    @property
    def elapsed_ms(self) -> float:
        if self.end_time == 0.0:
            return (time.time() - self.start_time) * 1000
        return (self.end_time - self.start_time) * 1000


class Monitor:
    """
    Production monitoring for SOC notebooks.

    Usage:
        from _shared.monitoring import Monitor
        from _shared.config import load_config

        cfg = load_config(dbutils)
        mon = Monitor(spark, cfg)

        mon.log_start()

        with mon.time("enrichment"):
            # ... do work ...
            pass

        mon.log_metric("alerts_processed", 42)
        mon.log_metric("false_positive_rate", 0.12)

        mon.log_complete(rows_processed=42)
    """

    def __init__(self, spark: SparkSession, config):
        self._spark = spark
        self._config = config
        self._notebook_path = config.tags.get("notebook_path", "unknown")
        self._environment = config.environment
        self._start_time = time.time()
        self._timings: dict = {}
        self._metrics: dict = {}
        self._events: list = []
        self._enabled = config.enable_monitoring

    def log_start(self):
        """Log notebook execution start."""
        self._start_time = time.time()
        self._log_event("notebook_start", "info", "Notebook execution started")

    def log_complete(self, rows_processed: int = 0):
        """Log successful notebook completion with summary metrics."""
        elapsed = (time.time() - self._start_time) * 1000
        self._log_event(
            "notebook_complete", "info",
            f"Notebook completed in {elapsed:.0f}ms, {rows_processed} rows processed",
            duration_ms=elapsed,
            row_count=rows_processed,
        )
        self._flush()

    def log_error(self, error: Exception, context: str = ""):
        """Log an error with full traceback."""
        tb = traceback.format_exc()
        message = f"{context}: {type(error).__name__}: {error}" if context else str(error)
        self._log_event(
            "notebook_error", "error",
            message,
            details=tb,
        )
        self._flush()

    def log_warning(self, message: str, details: str = ""):
        """Log a warning event."""
        self._log_event("warning", "warning", message, details=details)

    def log_info(self, message: str, details: str = ""):
        """Log an informational event."""
        self._log_event("info", "info", message, details=details)

    def log_metric(self, name: str, value: float):
        """Record a named metric for this run."""
        self._metrics[name] = value

    def log_detection(
        self,
        detection_type: str,
        entity: str,
        confidence: float,
        details: str = "",
    ):
        """Log a detection event (alert generated, anomaly found, etc.)."""
        message = f"Detection: {detection_type} on entity '{entity}' (confidence={confidence:.2f})"
        self._log_event(
            "detection", "warning" if confidence > 0.7 else "info",
            message,
            details=details,
        )

    def log_agent_decision(
        self,
        agent_name: str,
        decision: str,
        confidence: float,
        alert_id: str = "",
    ):
        """Log an agent decision for audit trail."""
        message = (
            f"Agent '{agent_name}' decided '{decision}' "
            f"(confidence={confidence:.2f}) for alert={alert_id}"
        )
        self._log_event("agent_decision", "info", message)

    def log_llm_call(
        self,
        endpoint: str,
        tokens_used: int,
        latency_ms: float,
        fallback: bool = False,
    ):
        """Log an LLM call for cost and performance tracking."""
        message = (
            f"LLM call to '{endpoint}': {tokens_used} tokens, "
            f"{latency_ms:.0f}ms{' (FALLBACK)' if fallback else ''}"
        )
        self._log_event("llm_call", "info", message)

    def time(self, operation: str) -> "TimingContextManager":
        """
        Context manager for timing an operation.

        Usage:
            with mon.time("enrichment"):
                df = enrich(df)
        """
        return TimingContextManager(self, operation)

    def get_timing(self, operation: str) -> float:
        """Get elapsed time in ms for a named operation."""
        return self._timings.get(operation, 0.0)

    def get_summary(self) -> dict:
        """Get a summary of all metrics and timings."""
        return {
            "notebook_path": self._notebook_path,
            "environment": self._environment,
            "total_elapsed_ms": (time.time() - self._start_time) * 1000,
            "timings": self._timings,
            "metrics": self._metrics,
            "event_count": len(self._events),
        }

    def _log_event(
        self,
        event_type: str,
        severity: str,
        message: str,
        details: str = "",
        duration_ms: float = 0.0,
        row_count: int = 0,
    ):
        """Buffer an audit event."""
        event = {
            "event_type": event_type,
            "severity": severity,
            "message": message,
            "details": details,
            "duration_ms": duration_ms,
            "row_count": row_count,
            "created_at": datetime.now(timezone.utc),
        }
        self._events.append(event)

        # Also log to Python logger for notebook output
        log_fn = getattr(logger, severity if severity != "error" else "error", logger.info)
        log_fn(f"[{event_type}] {message}")

    def _flush(self):
        """Write buffered events to the audit Delta table."""
        if not self._enabled or not self._events:
            return

        try:
            from pyspark.sql import functions as F

            rows = []
            for event in self._events:
                rows.append(Row(
                    event_id=None,  # Will be filled by uuid()
                    notebook_path=self._notebook_path,
                    event_type=event["event_type"],
                    severity=event["severity"],
                    message=event["message"],
                    details=event["details"] or None,
                    environment=self._environment,
                    catalog=self._config.catalog,
                    schema_name=self._config.schema,
                    duration_ms=event["duration_ms"] or None,
                    row_count=event["row_count"] or None,
                    created_at=event["created_at"],
                ))

            df = self._spark.createDataFrame(rows, schema=AUDIT_SCHEMA)
            df = df.withColumn("event_id", F.expr("uuid()"))

            full_table = (
                f"`{self._config.catalog}`.`{self._config.schema}`.`{AUDIT_TABLE}`"
            )

            (
                df.write
                .format("delta")
                .mode("append")
                .option("mergeSchema", "true")
                .saveAsTable(full_table)
            )

            self._events.clear()

        except Exception as e:
            # Never let monitoring failures crash the notebook
            logger.error(f"Failed to flush audit events: {e}")

    def _record_timing(self, operation: str, elapsed_ms: float):
        """Record a timing measurement."""
        self._timings[operation] = elapsed_ms


class TimingContextManager:
    """Context manager returned by Monitor.time()."""

    def __init__(self, monitor: Monitor, operation: str):
        self._monitor = monitor
        self._operation = operation
        self._start = 0.0

    def __enter__(self):
        self._start = time.time()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        elapsed_ms = (time.time() - self._start) * 1000
        self._monitor._record_timing(self._operation, elapsed_ms)
        if exc_type is not None:
            self._monitor.log_warning(
                f"Operation '{self._operation}' failed after {elapsed_ms:.0f}ms: {exc_val}"
            )
        return False  # Don't suppress exceptions


def create_audit_table(spark: SparkSession, catalog: str, schema: str):
    """
    Create the audit events table if it doesn't exist.
    Call this from the setup notebook.
    """
    full_table = f"`{catalog}`.`{schema}`.`{AUDIT_TABLE}`"
    spark.sql(f"""
        CREATE TABLE IF NOT EXISTS {full_table} (
            event_id STRING DEFAULT uuid(),
            notebook_path STRING NOT NULL,
            event_type STRING NOT NULL,
            severity STRING NOT NULL DEFAULT 'info',
            message STRING NOT NULL,
            details STRING,
            environment STRING,
            catalog STRING,
            schema_name STRING,
            duration_ms DOUBLE,
            row_count BIGINT,
            created_at TIMESTAMP NOT NULL DEFAULT current_timestamp()
        )
        USING DELTA
        PARTITIONED BY (event_type)
        COMMENT 'Audit trail for all notebook executions'
    """)
    logger.info(f"Ensured audit table exists: {full_table}")
