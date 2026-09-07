# Databricks notebook source
# MAGIC %md
# MAGIC # MC-RNN UEBA Behavioral Baseline
# MAGIC
# MAGIC Replaces/augments the KS-test UEBA baseline with Memory Caching RNN.
# MAGIC Per-entity inference: the hidden state IS the baseline, caches are
# MAGIC weekly behavioral checkpoints.
# MAGIC
# MAGIC **Detection Method:**
# MAGIC - Reconstruction error: if MC-RNN can't predict next event → anomaly
# MAGIC - Hidden state divergence: current h drifts from cached h → behavioral shift
# MAGIC - Cache retrieval anomaly: model queries very old caches → regression pattern

# COMMAND ----------

# MAGIC %pip install torch>=2.1.0 einops>=0.7.0 mlflow>=2.10.0

# COMMAND ----------

# MAGIC %run ./61_mc_rnn_architecture

# COMMAND ----------

import torch
import torch.nn.functional as F
import mlflow
import numpy as np
from pyspark.sql import SparkSession
import pyspark.sql.functions as SF
from pyspark.sql.types import StructType, StructField, StringType, FloatType, ArrayType, TimestampType
from datetime import datetime, timedelta
from typing import Dict, List, Tuple, Optional

spark = SparkSession.builder.getOrCreate()

# COMMAND ----------

# MAGIC %md
# MAGIC ## Entity State Manager

# COMMAND ----------

class EntityStateManager:
    """
    Manages per-entity MC-RNN states in Delta tables.

    Each entity has:
        - Current recurrent state (updated every micro-batch)
        - Cache of historical hidden state checkpoints
        - Metadata: cache timestamps, landmark flags, importance scores
    """

    def __init__(self, catalog: str = "security_catalog", schema: str = "ml"):
        self.state_table = f"{catalog}.{schema}.mc_entity_states"
        self.cache_table = f"{catalog}.{schema}.mc_entity_caches"

    def load_entity_state(self, entity_id: str, device: torch.device) -> Dict:
        """Load an entity's current recurrent state and cache from Delta."""
        try:
            state_df = spark.table(self.state_table).where(
                SF.col("entity_id") == entity_id
            ).limit(1).collect()

            if not state_df:
                return self._empty_state(device)

            state_row = state_df[0]
            recurrent_state = self._deserialize_tensor(state_row.recurrent_state_blob, device)

            cache_df = (
                spark.table(self.cache_table)
                .where(SF.col("entity_id") == entity_id)
                .orderBy(SF.desc("segment_timestamp"))
                .limit(32)
                .collect()
            )

            caches = []
            cache_metadata = {"timestamps": [], "is_landmark": [], "importance": []}
            for row in cache_df:
                cache_tensor = self._deserialize_tensor(row.hidden_state_blob, device)
                caches.append(cache_tensor)
                cache_metadata["timestamps"].append(row.segment_timestamp)
                cache_metadata["is_landmark"].append(row.is_landmark)
                cache_metadata["importance"].append(row.importance_score)

            cache_states = torch.stack(caches).unsqueeze(0) if caches else torch.zeros(1, 0, 256, device=device)

            return {
                "recurrent_state": recurrent_state,
                "cache_states": cache_states,
                "cache_metadata": cache_metadata,
                "last_updated": state_row.last_updated,
            }
        except Exception:
            return self._empty_state(device)

    def save_entity_state(self, entity_id: str, state: Dict, checkpoint: torch.Tensor, timestamp: datetime):
        """Persist updated entity state and new cache checkpoint."""
        state_data = [(
            entity_id,
            self._serialize_tensor(state["recurrent_state"]),
            timestamp,
        )]
        state_df = spark.createDataFrame(state_data, ["entity_id", "recurrent_state_blob", "last_updated"])
        state_df.write.format("delta").mode("overwrite").option(
            "replaceWhere", f"entity_id = '{entity_id}'"
        ).saveAsTable(self.state_table)

        importance = float(torch.norm(checkpoint).item())
        cache_data = [(
            entity_id,
            self._serialize_tensor(checkpoint),
            timestamp,
            False,
            importance,
        )]
        cache_df = spark.createDataFrame(
            cache_data,
            ["entity_id", "hidden_state_blob", "segment_timestamp", "is_landmark", "importance_score"]
        )
        cache_df.write.format("delta").mode("append").saveAsTable(self.cache_table)

    def _empty_state(self, device: torch.device) -> Dict:
        return {
            "recurrent_state": None,
            "cache_states": torch.zeros(1, 0, 256, device=device),
            "cache_metadata": {"timestamps": [], "is_landmark": [], "importance": []},
            "last_updated": None,
        }

    def _serialize_tensor(self, tensor: torch.Tensor) -> bytes:
        if tensor is None:
            return b""
        return tensor.cpu().numpy().tobytes()

    def _deserialize_tensor(self, blob: bytes, device: torch.device) -> torch.Tensor:
        if not blob:
            return None
        arr = np.frombuffer(blob, dtype=np.float32)
        return torch.from_numpy(arr.copy()).to(device)


# COMMAND ----------

# MAGIC %md
# MAGIC ## Anomaly Detection Engine

# COMMAND ----------

class MCUEBAAnomalyDetector:
    """
    MC-RNN based UEBA anomaly detection.

    Three anomaly signals:
        1. Reconstruction Error - model can't predict entity's behavior
        2. Hidden State Divergence - current behavior differs from cached baseline
        3. Cache Retrieval Pattern - model accessing unusually old memories
    """

    ANOMALY_TYPES = {
        "reconstruction_anomaly": "Entity behavior deviates from learned patterns",
        "state_divergence": "Current behavior diverges from historical baseline",
        "regression_pattern": "Entity reverting to old behavioral patterns",
        "temporal_anomaly": "Unusual activity timing detected via cache comparison",
        "escalation_pattern": "Progressive deviation across multiple cache epochs",
    }

    def __init__(
        self,
        model: MemoryCachingRNN,
        recon_threshold: float = 2.5,
        divergence_threshold: float = 0.7,
        regression_threshold: float = 0.6,
        escalation_window: int = 5,
    ):
        self.model = model
        self.model.eval()
        self.recon_threshold = recon_threshold
        self.divergence_threshold = divergence_threshold
        self.regression_threshold = regression_threshold
        self.escalation_window = escalation_window

    @torch.no_grad()
    def detect_anomalies(
        self,
        entity_id: str,
        event_tokens: torch.Tensor,
        entity_state: Dict,
        config: MCConfig,
    ) -> List[Dict]:
        """
        Run anomaly detection on new events for an entity.

        Args:
            entity_id: the entity being analyzed
            event_tokens: (1, segment_len, input_dim) - new tokenized events
            entity_state: loaded state from EntityStateManager
            config: MC-RNN config

        Returns:
            List of anomaly dicts with type, confidence, evidence
        """
        anomalies = []

        cache_states = entity_state["cache_states"]
        num_cached = cache_states.size(1)
        cache_mask = torch.ones(1, num_cached, dtype=torch.bool, device=event_tokens.device) if num_cached > 0 else None

        output = self.model(
            event_tokens,
            recurrent_states=entity_state.get("recurrent_state"),
            cache_states_per_layer=[cache_states] * config.num_layers if num_cached > 0 else None,
            cache_masks=[cache_mask] * config.num_layers if cache_mask is not None else None,
            segment_index=num_cached,
        )

        recon_error = F.mse_loss(output["reconstruction"], event_tokens, reduction="none").mean(dim=-1)
        mean_recon = recon_error.mean().item()
        max_recon = recon_error.max().item()

        if mean_recon > self.recon_threshold:
            confidence = min(100.0, (mean_recon / self.recon_threshold) * 50 + 30)
            anomalies.append({
                "entity_id": entity_id,
                "anomaly_type": "reconstruction_anomaly",
                "confidence": confidence,
                "score": mean_recon,
                "threshold": self.recon_threshold,
                "evidence": f"Reconstruction error {mean_recon:.3f} exceeds threshold {self.recon_threshold}",
                "peak_position": int(recon_error.argmax().item()),
            })

        if num_cached >= 3:
            current_state = output["segment_checkpoint"]
            recent_caches = cache_states[0, -3:]
            recent_mean = recent_caches.mean(dim=0)
            divergence = 1.0 - F.cosine_similarity(
                current_state, recent_mean.unsqueeze(0), dim=-1
            ).item()

            if divergence > self.divergence_threshold:
                confidence = min(100.0, (divergence / self.divergence_threshold) * 45 + 35)
                anomalies.append({
                    "entity_id": entity_id,
                    "anomaly_type": "state_divergence",
                    "confidence": confidence,
                    "score": divergence,
                    "threshold": self.divergence_threshold,
                    "evidence": f"Behavioral divergence {divergence:.3f} from recent baseline",
                    "cache_epochs_compared": 3,
                })

        if num_cached >= 5:
            cache_attn = output["cache_attention_weights"][0]
            if cache_attn is not None:
                attn_weights = cache_attn[0]
                total_caches = len(attn_weights)
                old_boundary = total_caches // 3
                old_attention = attn_weights[:old_boundary].sum().item()
                recent_attention = attn_weights[-old_boundary:].sum().item()

                if old_attention > self.regression_threshold and old_attention > recent_attention:
                    confidence = min(95.0, old_attention * 80 + 20)
                    anomalies.append({
                        "entity_id": entity_id,
                        "anomaly_type": "regression_pattern",
                        "confidence": confidence,
                        "score": old_attention,
                        "threshold": self.regression_threshold,
                        "evidence": f"Model retrieving old caches ({old_attention:.2%} attention on oldest third)",
                        "old_cache_indices": list(range(old_boundary)),
                    })

            if num_cached >= self.escalation_window:
                states_sequence = cache_states[0, -self.escalation_window:]
                diffs = []
                for i in range(1, len(states_sequence)):
                    diff = torch.norm(states_sequence[i] - states_sequence[i-1]).item()
                    diffs.append(diff)

                if len(diffs) >= 3:
                    trend = np.polyfit(range(len(diffs)), diffs, 1)[0]
                    if trend > 0.5:
                        confidence = min(90.0, trend * 40 + 30)
                        anomalies.append({
                            "entity_id": entity_id,
                            "anomaly_type": "escalation_pattern",
                            "confidence": confidence,
                            "score": trend,
                            "threshold": 0.5,
                            "evidence": f"Progressive behavioral escalation (trend={trend:.3f})",
                            "window_size": self.escalation_window,
                        })

        return anomalies


# COMMAND ----------

# MAGIC %md
# MAGIC ## Batch Detection Job

# COMMAND ----------

def _featurize_events(events, segment_size: int, token_dim: int, device):
    """Deterministically hash real event fields into a fixed-width feature tensor
    (mirrors the streaming detector). No random noise: identical events map to
    identical features so the model scores actual content, not fabricated data."""
    import zlib
    seg = min(len(events), segment_size)
    feats = torch.zeros(1, segment_size, token_dim, device=device)
    for i in range(seg):
        ev = events[i]
        fields = ev.asDict() if hasattr(ev, "asDict") else dict(ev)
        for key, value in fields.items():
            if value is None:
                continue
            idx = zlib.crc32(f"{key}={value}".encode("utf-8")) % token_dim
            feats[0, i, idx] += 1.0
    norm = feats.norm(dim=-1, keepdim=True).clamp(min=1e-6)
    return feats / norm


def run_mc_ueba_detection(
    catalog: str = "security_catalog",
    model_name: str = "security_catalog_mc_rnn_security",
    lookback_hours: int = 24,
    min_events_per_entity: int = 10,
):
    """
    Production MC-UEBA detection job.

    Steps:
        1. Load registered MC-RNN model from MLflow
        2. Get entities with recent activity
        3. For each entity: load state, tokenize events, detect anomalies
        4. Write anomalies to Delta table
        5. Generate alerts for high-confidence detections
    """
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

    try:
        model_uri = f"models:/{model_name}/Production"
        model = mlflow.pytorch.load_model(model_uri).to(device)
    except Exception:
        print("No registered model found. Using fresh model for demo.")
        model = create_mc_rnn(input_dim=128, preset="medium").to(device)

    config = model.config
    state_manager = EntityStateManager(catalog)
    detector = MCUEBAAnomalyDetector(model)

    cutoff = datetime.now() - timedelta(hours=lookback_hours)

    try:
        events_df = (
            spark.table(f"{catalog}.silver.enriched_security_events")
            .where(SF.col("event_timestamp") >= cutoff)
        )
    except Exception:
        events_df = (
            spark.table(f"{catalog}.bronze.events")
            .where(SF.col("event_timestamp") >= cutoff)
        )

    active_entities = (
        events_df
        .groupBy("user_id")
        .count()
        .where(SF.col("count") >= min_events_per_entity)
        .select("user_id")
        .collect()
    )

    print(f"MC-UEBA Detection: {len(active_entities)} active entities (last {lookback_hours}h)")

    all_anomalies = []

    for entity_row in active_entities:
        entity_id = entity_row.user_id

        entity_state = state_manager.load_entity_state(entity_id, device)

        # Deterministically featurize the entity's REAL recent events instead of
        # feeding random noise into the model.
        entity_events = (
            events_df.where(SF.col("user_id") == entity_id)
            .orderBy("event_timestamp")
            .limit(config.segment_size)
            .collect()
        )
        if not entity_events:
            continue
        event_tokens = _featurize_events(
            entity_events, config.segment_size, config.input_dim, device
        )

        anomalies = detector.detect_anomalies(entity_id, event_tokens, entity_state, config)

        if anomalies:
            all_anomalies.extend(anomalies)
            for a in anomalies:
                if a["confidence"] >= 70:
                    print(f"  HIGH: {entity_id} - {a['anomaly_type']} ({a['confidence']:.1f}%)")

        new_checkpoint = model(
            event_tokens,
            cache_states_per_layer=[entity_state["cache_states"]] * config.num_layers if entity_state["cache_states"].size(1) > 0 else None,
            cache_masks=None,
            segment_index=entity_state["cache_states"].size(1),
        )["segment_checkpoint"][0]

        state_manager.save_entity_state(entity_id, entity_state, new_checkpoint, datetime.now())

    if all_anomalies:
        anomaly_rows = [
            (
                a["entity_id"], a["anomaly_type"], float(a["confidence"]),
                float(a["score"]), a["evidence"], datetime.now(),
            )
            for a in all_anomalies
        ]
        anomaly_df = spark.createDataFrame(
            anomaly_rows,
            ["entity_id", "anomaly_type", "confidence", "score", "evidence", "detected_at"]
        )
        anomaly_df.write.format("delta").mode("append").saveAsTable(
            f"{catalog}.gold.mc_ueba_anomalies"
        )

    print(f"\nDetection complete:")
    print(f"  Entities analyzed: {len(active_entities)}")
    print(f"  Anomalies detected: {len(all_anomalies)}")
    print(f"  High confidence (>=70%): {sum(1 for a in all_anomalies if a['confidence'] >= 70)}")

    return all_anomalies


# COMMAND ----------

# MAGIC %md
# MAGIC ## Execute

# COMMAND ----------

if "dbutils" in dir():
    anomalies = run_mc_ueba_detection(
        catalog="security_catalog",
        lookback_hours=24,
        min_events_per_entity=10,
    )
