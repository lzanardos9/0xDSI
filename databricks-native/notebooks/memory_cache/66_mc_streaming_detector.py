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
import zlib
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
                buffered_events_json STRING,
                buffered_event_count INT DEFAULT 0,
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
        min_events_for_inference: int = 8,
        max_buffer_events: int = 256,
        catalog: str = "security_catalog",
    ):
        self.model = model
        self.config = config
        self.segment_size = segment_size
        self.anomaly_threshold = anomaly_threshold
        self.alert_min_confidence = alert_min_confidence
        self.min_events_for_inference = min_events_for_inference
        self.max_buffer_events = max_buffer_events
        self.state_store = StreamingStateStore(catalog)
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.model.to(self.device)
        self.model.eval()

    @staticmethod
    def _event_to_dict(ev):
        """Serialize a collected event Row to a JSON-safe dict for cross-batch buffering."""
        d = ev.asDict() if hasattr(ev, "asDict") else dict(ev)
        ts = d.get("event_timestamp")
        if hasattr(ts, "isoformat"):
            d["event_timestamp"] = ts.isoformat()
        return d

    def _load_buffers(self, entity_ids):
        """Load each entity's persisted event buffer from the state store.

        This is the real cross-batch state: low-rate entities that never reach the
        inference threshold within a single 10s micro-batch keep accumulating here
        instead of being silently discarded every batch.
        """
        if not entity_ids:
            return {}
        id_list = ",".join("'" + e.replace("'", "''") + "'" for e in entity_ids)
        try:
            rows = spark.sql(
                f"SELECT entity_id, buffered_events_json FROM {self.state_store.states_table} "
                f"WHERE entity_id IN ({id_list})"
            ).collect()
        except Exception:
            return {}
        buffers = {}
        for r in rows:
            try:
                buffers[r["entity_id"]] = json.loads(r["buffered_events_json"]) if r["buffered_events_json"] else []
            except Exception:
                buffers[r["entity_id"]] = []
        return buffers

    def process_micro_batch(self, batch_df: DataFrame, batch_id: int):
        """
        foreachBatch handler for Structured Streaming.
        Called once per micro-batch with new events.

        Events are accumulated per entity across micro-batches. An entity is scored
        once its accumulated buffer (persisted prior events + new events) reaches
        min_events_for_inference; entities below that keep their events buffered
        rather than losing them, so a slow attacker spread over many batches is not
        invisible to the detector.
        """
        if batch_df.isEmpty():
            return

        event_count = batch_df.count()

        entity_events = (
            batch_df
            .groupBy("user_id")
            .agg(
                F.sort_array(
                    F.collect_list(
                        F.struct("event_timestamp", "event_type", "action", "outcome",
                                 "severity", "source_ip", "destination_ip")
                    )
                ).alias("events"),
                F.max("event_timestamp").alias("latest_event"),
            )
        )

        new_rows = [r for r in entity_events.collect() if r.user_id is not None]
        if not new_rows:
            return

        buffers = self._load_buffers([r.user_id for r in new_rows])

        alerts = []
        state_updates = []
        scored_entities = 0

        for entity_row in new_rows:
            entity_id = entity_row.user_id
            latest_ts = entity_row.latest_event

            new_events = [self._event_to_dict(e) for e in entity_row.events]
            combined = buffers.get(entity_id, []) + new_events
            combined.sort(key=lambda d: str(d.get("event_timestamp")))
            if len(combined) > self.max_buffer_events:
                combined = combined[-self.max_buffer_events:]

            if len(combined) >= self.min_events_for_inference:
                # Enough accumulated context to score; consume the buffer afterwards
                # so the same events are not re-alerted on the next batch.
                window = combined[-self.segment_size:]
                entity_anomalies, new_state = self._infer_entity(entity_id, window)
                remaining_buffer = []
                scored_entities += 1

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
                            "source_events_count": len(window),
                            "segment_index": new_state.get("segment_index", 0),
                            "acknowledged": False,
                        })
            else:
                # Not enough yet: hold the events for a future batch.
                new_state = {"events_count": len(combined), "cache_count": 0, "segment_index": 0}
                remaining_buffer = combined

            state_updates.append({
                "entity_id": entity_id,
                "events_since_checkpoint": new_state.get("events_count", 0),
                "cache_count": new_state.get("cache_count", 0),
                "buffered_events_json": json.dumps(remaining_buffer),
                "buffered_event_count": len(remaining_buffer),
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
                    target.buffered_events_json = source.buffered_events_json,
                    target.buffered_event_count = source.buffered_event_count,
                    target.last_event_timestamp = source.last_event_timestamp,
                    target.updated_at = source.updated_at
                WHEN NOT MATCHED THEN INSERT (
                    entity_id, events_since_checkpoint, cache_count,
                    buffered_events_json, buffered_event_count,
                    last_event_timestamp, updated_at
                ) VALUES (
                    source.entity_id, source.events_since_checkpoint, source.cache_count,
                    source.buffered_events_json, source.buffered_event_count,
                    source.last_event_timestamp, source.updated_at
                )
            """)

        if batch_id % 10 == 0:
            print(
                f"Batch {batch_id}: {event_count} events, "
                f"{scored_entities} entities scored, "
                f"{len(alerts)} alerts generated"
            )

    def _featurize(self, events: list, token_dim: int) -> torch.Tensor:
        """
        Deterministically encode real event payloads into a feature tensor.

        This replaces the previous placeholder that fed random noise into the model
        (which produced fabricated "anomalies"). Each event's OCSF-ish fields are
        hashed into a fixed-width, L2-normalized vector so identical events map to
        identical features and the model scores actual content, not noise.
        """
        seg = min(len(events), self.segment_size)
        feats = torch.zeros(1, seg, token_dim, device=self.device)
        for i in range(seg):
            ev = events[i]
            fields = ev.asDict() if hasattr(ev, "asDict") else dict(ev)
            for key, value in fields.items():
                if value is None:
                    continue
                token = f"{key}={value}".encode("utf-8")
                idx = zlib.crc32(token) % token_dim
                feats[0, i, idx] += 1.0
        norm = feats.norm(dim=-1, keepdim=True).clamp(min=1e-6)
        return feats / norm

    @torch.no_grad()
    def _infer_entity(self, entity_id: str, events: list) -> Tuple[List[Dict], Dict]:
        """Run MC-RNN inference for a single entity's new events."""
        num_events = len(events)
        token_dim = self.config.input_dim

        # Real, deterministic featurization of the actual events (no random noise).
        event_tokens = self._featurize(events, token_dim)

        # The entity's temporal context is carried in the accumulated event window
        # (persisted across micro-batches in the state store), not in a hidden tensor.
        # The cache therefore starts from zeros for this window rather than
        # fabricating memory the detector never actually stored.
        cache_size = min(8, self.config.max_cache_size)
        cache_states = torch.zeros(1, cache_size, self.config.hidden_dim, device=self.device)
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
    trigger_mode: str = "processingTime",
    min_events_for_inference: int = 8,
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
        min_events_for_inference=min_events_for_inference,
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

    # Pick a supported Structured Streaming trigger. processingTime runs a
    # micro-batch on a fixed clock; availableNow drains all currently-available
    # data in one bounded pass (useful for backfills / scheduled catch-up).
    writer = (
        events_stream
        .writeStream
        .foreachBatch(processor.process_micro_batch)
        .option("checkpointLocation", checkpoint_path)
        .queryName("mc_rnn_streaming_detector")
    )
    if trigger_mode == "availableNow":
        writer = writer.trigger(availableNow=True)
    else:
        writer = writer.trigger(processingTime=trigger_interval)
    query = writer.start()

    print(f"MC-RNN Streaming Detection started:")
    print(f"  Source: {source_table}")
    print(f"  Trigger: {trigger_mode} ({trigger_interval})")
    print(f"  Min events for inference: {min_events_for_inference}")
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
