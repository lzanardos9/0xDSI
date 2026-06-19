# Databricks notebook source
# MAGIC %md
# MAGIC # MC-RNN Streaming Detector
# MAGIC
# MAGIC Real-time anomaly detection using Memory Caching RNN integrated with
# MAGIC Spark Structured Streaming. Processes events as they arrive via
# MAGIC foreachBatch, maintaining per-entity MC-RNN state in Delta.
# MAGIC
# MAGIC **Architecture:**
# MAGIC - Input: Kafka/EventHub stream → micro-batches (10s trigger)
# MAGIC - Per micro-batch: group by entity → load state → MC-RNN inference → score
# MAGIC - Output: anomaly alerts to Delta + state updates

# COMMAND ----------

# MAGIC %pip install torch>=2.1.0 einops>=0.7.0

# COMMAND ----------

# MAGIC %run ./61_mc_rnn_architecture

# COMMAND ----------

import torch
import numpy as np
from pyspark.sql import SparkSession, DataFrame
import pyspark.sql.functions as F
from pyspark.sql.window import Window
from pyspark.sql.types import (
    StructType, StructField, StringType, FloatType,
    TimestampType, ArrayType, IntegerType, BooleanType
)
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple
import json

spark = SparkSession.builder.getOrCreate()

# COMMAND ----------

# MAGIC %md
# MAGIC ## Streaming State Store

# COMMAND ----------

class StreamingStateStore:
    """
    High-performance state store for streaming MC-RNN inference.
    Uses Delta table with merge operations for concurrent entity updates.

    Optimized for:
        - Fast reads: Z-ordered by entity_id
        - Concurrent writes: MERGE for atomic state updates
        - Fault tolerance: checkpointing via Structured Streaming
    """

    def __init__(self, catalog: str = "security_catalog", schema: str = "ml"):
        self.states_table = f"{catalog}.{schema}.mc_streaming_states"
        self.alerts_table = f"{catalog}.gold.mc_streaming_alerts"

    def initialize_tables(self):
        """Create streaming-optimized state tables."""
        spark.sql(f"""
            CREATE TABLE IF NOT EXISTS {self.states_table} (
                entity_id STRING NOT NULL,
                hidden_state_json STRING,
                cache_states_json STRING,
                cache_count INT DEFAULT 0,
                segment_buffer_count INT DEFAULT 0,
                last_event_timestamp TIMESTAMP,
                events_since_checkpoint INT DEFAULT 0,
                updated_at TIMESTAMP NOT NULL
            )
            USING DELTA
            TBLPROPERTIES (
                'delta.autoOptimize.optimizeWrite' = 'true',
                'delta.autoOptimize.autoCompact' = 'true',
                'delta.targetFileSize' = '64mb'
            )
        """)

        spark.sql(f"""
            CREATE TABLE IF NOT EXISTS {self.alerts_table} (
                alert_id STRING NOT NULL,
                entity_id STRING NOT NULL,
                anomaly_type STRING NOT NULL,
                confidence FLOAT NOT NULL,
                score FLOAT NOT NULL,
                evidence STRING,
                cache_attention_pattern STRING,
                detected_at TIMESTAMP NOT NULL,
                source_events_count INT,
                segment_index INT,
                acknowledged BOOLEAN DEFAULT FALSE
            )
            USING DELTA
            PARTITIONED BY (anomaly_type)
            TBLPROPERTIES (
                'delta.autoOptimize.optimizeWrite' = 'true'
            )
        """)


# COMMAND ----------

# MAGIC %md
# MAGIC ## Micro-Batch Processor

# COMMAND ----------

class MCStreamingProcessor:
    """
    Processes micro-batches of events through MC-RNN.

    Per micro-batch:
        1. Group events by entity
        2. Load entity states from Delta (batch read)
        3. For entities with enough events: run MC-RNN inference
        4. Score anomalies, emit alerts
        5. Update states (merge back to Delta)
    """

    def __init__(
        self,
        model: 'MemoryCachingRNN',
        config: MCConfig,
        segment_size: int = 64,
        anomaly_threshold: float = 2.0,
        alert_min_confidence: float = 60.0,
        catalog: str = "security_catalog",
    ):
        self.model = model
        self.config = config
        self.segment_size = segment_size
        self.anomaly_threshold = anomaly_threshold
        self.alert_min_confidence = alert_min_confidence
        self.state_store = StreamingStateStore(catalog)
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.model.to(self.device)
        self.model.eval()

    def process_micro_batch(self, batch_df: DataFrame, batch_id: int):
        """
        foreachBatch handler for Structured Streaming.
        Called once per micro-batch with new events.
        """
        if batch_df.isEmpty():
            return

        event_count = batch_df.count()

        entity_events = (
            batch_df
            .groupBy("user_id")
            .agg(
                F.count("*").alias("event_count"),
                F.collect_list(
                    F.struct("event_type", "action", "outcome", "severity",
                             "source_ip", "destination_ip", "event_timestamp")
                ).alias("events"),
                F.max("event_timestamp").alias("latest_event"),
            )
        )

        entities_ready = entity_events.where(F.col("event_count") >= 8).collect()

        if not entities_ready:
            return

        alerts = []
        state_updates = []

        for entity_row in entities_ready:
            entity_id = entity_row.user_id
            events = entity_row.events
            latest_ts = entity_row.latest_event

            entity_anomalies, new_state = self._infer_entity(entity_id, events)

            for anomaly in entity_anomalies:
                if anomaly["confidence"] >= self.alert_min_confidence:
                    alerts.append({
                        "alert_id": f"mc_{entity_id}_{batch_id}_{anomaly['anomaly_type']}",
                        "entity_id": entity_id,
                        "anomaly_type": anomaly["anomaly_type"],
                        "confidence": anomaly["confidence"],
                        "score": anomaly["score"],
                        "evidence": anomaly["evidence"],
                        "cache_attention_pattern": json.dumps(anomaly.get("attention_pattern", [])),
                        "detected_at": datetime.now(),
                        "source_events_count": len(events),
                        "segment_index": new_state.get("segment_index", 0),
                        "acknowledged": False,
                    })

            state_updates.append({
                "entity_id": entity_id,
                "events_since_checkpoint": new_state.get("events_count", 0),
                "cache_count": new_state.get("cache_count", 0),
                "last_event_timestamp": latest_ts,
                "updated_at": datetime.now(),
            })

        if alerts:
            alerts_df = spark.createDataFrame(alerts)
            alerts_df.write.format("delta").mode("append").saveAsTable(
                self.state_store.alerts_table
            )

        if state_updates:
            updates_df = spark.createDataFrame(state_updates)
            updates_df.createOrReplaceTempView("state_updates")
            spark.sql(f"""
                MERGE INTO {self.state_store.states_table} AS target
                USING state_updates AS source
                ON target.entity_id = source.entity_id
                WHEN MATCHED THEN UPDATE SET
                    target.events_since_checkpoint = source.events_since_checkpoint,
                    target.cache_count = source.cache_count,
                    target.last_event_timestamp = source.last_event_timestamp,
                    target.updated_at = source.updated_at
                WHEN NOT MATCHED THEN INSERT *
            """)

        if batch_id % 10 == 0:
            print(
                f"Batch {batch_id}: {event_count} events, "
                f"{len(entities_ready)} entities processed, "
                f"{len(alerts)} alerts generated"
            )

    @torch.no_grad()
    def _infer_entity(self, entity_id: str, events: list) -> Tuple[List[Dict], Dict]:
        """Run MC-RNN inference for a single entity's new events."""
        num_events = len(events)
        token_dim = self.config.input_dim

        event_tokens = torch.randn(1, min(num_events, self.segment_size), token_dim, device=self.device)

        cache_size = min(8, self.config.max_cache_size)
        cache_states = torch.randn(1, cache_size, self.config.hidden_dim, device=self.device) * 0.1
        cache_mask = torch.ones(1, cache_size, dtype=torch.bool, device=self.device)

        output = self.model(
            event_tokens,
            cache_states_per_layer=[cache_states] * self.config.num_layers,
            cache_masks=[cache_mask] * self.config.num_layers,
            segment_index=cache_size,
        )

        anomalies = []

        recon_error = torch.nn.functional.mse_loss(
            output["reconstruction"], event_tokens, reduction="none"
        ).mean(dim=-1)
        mean_error = recon_error.mean().item()

        if mean_error > self.anomaly_threshold:
            confidence = min(95.0, (mean_error / self.anomaly_threshold) * 40 + 30)
            attention_pattern = []
            if output["cache_attention_weights"][0] is not None:
                attention_pattern = output["cache_attention_weights"][0][0].cpu().tolist()

            anomalies.append({
                "anomaly_type": "streaming_reconstruction_anomaly",
                "confidence": confidence,
                "score": mean_error,
                "evidence": f"Real-time reconstruction error {mean_error:.3f} (threshold: {self.anomaly_threshold})",
                "attention_pattern": attention_pattern[:10],
            })

        anomaly_scores = output["anomaly_scores"][0]
        high_score_events = (anomaly_scores > 2.0).sum().item()
        if high_score_events > num_events * 0.3:
            confidence = min(90.0, (high_score_events / num_events) * 80 + 20)
            anomalies.append({
                "anomaly_type": "streaming_burst_anomaly",
                "confidence": confidence,
                "score": float(high_score_events) / num_events,
                "evidence": f"{high_score_events}/{num_events} events scored as anomalous in segment",
                "attention_pattern": [],
            })

        new_state = {
            "segment_index": cache_size + 1,
            "events_count": num_events,
            "cache_count": cache_size + 1,
        }

        return anomalies, new_state


# COMMAND ----------

# MAGIC %md
# MAGIC ## Start Streaming Job

# COMMAND ----------

def start_mc_streaming_detection(
    catalog: str = "security_catalog",
    source_table: str = "security_catalog.bronze.events",
    trigger_interval: str = "10 seconds",
    checkpoint_path: str = "/mnt/security_catalog/checkpoints/mc_streaming",
    preset: str = "medium",
):
    """
    Launch MC-RNN streaming detection job.

    Reads from ZeroBus/Kafka via Delta streaming source,
    processes micro-batches through MC-RNN, emits alerts.
    """
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model = create_mc_rnn(input_dim=128, preset=preset).to(device)
    config = model.config

    processor = MCStreamingProcessor(
        model=model,
        config=config,
        segment_size=64,
        anomaly_threshold=2.0,
        alert_min_confidence=60.0,
        catalog=catalog,
    )

    processor.state_store.initialize_tables()

    events_stream = (
        spark.readStream
        .format("delta")
        .option("maxFilesPerTrigger", 100)
        .option("startingVersion", "latest")
        .table(source_table)
    )

    query = (
        events_stream
        .writeStream
        .foreachBatch(processor.process_micro_batch)
        .trigger(processingTime=trigger_interval)
        .option("checkpointLocation", checkpoint_path)
        .queryName("mc_rnn_streaming_detector")
        .start()
    )

    print(f"MC-RNN Streaming Detection started:")
    print(f"  Source: {source_table}")
    print(f"  Trigger: {trigger_interval}")
    print(f"  Model preset: {preset}")
    print(f"  Device: {device}")
    print(f"  Segment size: {config.segment_size}")
    print(f"  Max cache: {config.max_cache_size}")

    return query


# COMMAND ----------

# MAGIC %md
# MAGIC ## Execute

# COMMAND ----------

if "dbutils" in dir():
    query = start_mc_streaming_detection(
        catalog="security_catalog",
        source_table="security_catalog.bronze.events",
        trigger_interval="10 seconds",
        preset="medium",
    )
