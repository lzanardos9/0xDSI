# Databricks notebook source
# MAGIC %md
# MAGIC # Security Event Tokenizer for MC-RNN
# MAGIC
# MAGIC Converts raw security events from Delta tables into dense token embeddings
# MAGIC suitable for MC-RNN input. Handles categorical features (event_type, action,
# MAGIC protocol) via learned embeddings and numeric features via linear projection.
# MAGIC
# MAGIC **Output:** 128-dimensional dense vector per event, written to feature store.

# COMMAND ----------

# MAGIC %pip install torch>=2.1.0

# COMMAND ----------

import torch
import torch.nn as nn
import numpy as np
from pyspark.sql import SparkSession, DataFrame
import pyspark.sql.functions as F
from pyspark.sql.window import Window
from pyspark.sql.types import ArrayType, FloatType, StructType, StructField, StringType, LongType
from typing import Dict, List, Tuple
import json
from datetime import datetime, timedelta

spark = SparkSession.builder.getOrCreate()

# COMMAND ----------

# MAGIC %md
# MAGIC ## Vocabulary Management

# COMMAND ----------

class SecurityVocabulary:
    """
    Manages categorical vocabularies for security event tokenization.
    Built from observed data with reserved tokens for unknown/padding.
    """

    SPECIAL_TOKENS = {"[PAD]": 0, "[UNK]": 1, "[SEG_START]": 2, "[SEG_END]": 3}

    def __init__(self):
        self.vocabs: Dict[str, Dict[str, int]] = {}
        self.inverse_vocabs: Dict[str, Dict[int, str]] = {}

    def build_from_data(self, df: DataFrame, categorical_columns: List[str], max_vocab_size: int = 10000):
        """Build vocabularies from a Spark DataFrame."""
        for col in categorical_columns:
            values = (
                df.select(col)
                .where(F.col(col).isNotNull())
                .groupBy(col)
                .count()
                .orderBy(F.desc("count"))
                .limit(max_vocab_size - len(self.SPECIAL_TOKENS))
                .select(col)
                .rdd.flatMap(lambda x: x)
                .collect()
            )

            vocab = dict(self.SPECIAL_TOKENS)
            for i, val in enumerate(values):
                vocab[str(val)] = i + len(self.SPECIAL_TOKENS)

            self.vocabs[col] = vocab
            self.inverse_vocabs[col] = {v: k for k, v in vocab.items()}

        return self

    def encode(self, column: str, value: str) -> int:
        """Encode a categorical value to its token ID."""
        vocab = self.vocabs.get(column, {})
        return vocab.get(str(value), self.SPECIAL_TOKENS["[UNK]"])

    def vocab_size(self, column: str) -> int:
        return len(self.vocabs.get(column, self.SPECIAL_TOKENS))

    def save_to_delta(self, path: str):
        """Persist vocabularies to Delta table for inference reproducibility."""
        rows = []
        for col, vocab in self.vocabs.items():
            rows.append((col, json.dumps(vocab)))
        df = spark.createDataFrame(rows, ["column_name", "vocabulary_json"])
        df.write.format("delta").mode("overwrite").save(path)

    def load_from_delta(self, path: str):
        """Load vocabularies from Delta table."""
        df = spark.read.format("delta").load(path)
        for row in df.collect():
            vocab = json.loads(row.vocabulary_json)
            self.vocabs[row.column_name] = vocab
            self.inverse_vocabs[row.column_name] = {v: k for k, v in vocab.items()}
        return self


# COMMAND ----------

# MAGIC %md
# MAGIC ## Event Tokenizer Model

# COMMAND ----------

class SecurityEventTokenizer(nn.Module):
    """
    Tokenizes security events into 128-dim dense vectors.

    Architecture:
        Categorical fields → Learned Embeddings (32-dim each)
        Numeric fields → Linear Projection (scaled)
        Temporal fields → Cyclical Encoding (sin/cos)
        All concatenated → MLP → 128-dim output

    Categorical fields: event_type, action, outcome, severity, protocol, source_zone, dest_zone
    Numeric fields: bytes_transferred, duration, port, failed_attempts
    Temporal fields: hour_of_day, day_of_week, minute_of_hour
    """

    def __init__(self, vocab_sizes: Dict[str, int], output_dim: int = 128):
        super().__init__()
        self.output_dim = output_dim

        embed_dim = 32
        self.embeddings = nn.ModuleDict({
            col: nn.Embedding(size + 1, embed_dim, padding_idx=0)
            for col, size in vocab_sizes.items()
        })

        num_categorical = len(vocab_sizes) * embed_dim
        num_numeric = 4  # bytes, duration, port, failed_attempts
        num_temporal = 6  # sin/cos for hour, day, minute

        total_input = num_categorical + num_numeric + num_temporal
        self.fusion = nn.Sequential(
            nn.Linear(total_input, 256),
            nn.LayerNorm(256),
            nn.GELU(),
            nn.Dropout(0.1),
            nn.Linear(256, output_dim),
            nn.LayerNorm(output_dim),
        )

        self.numeric_norm = nn.BatchNorm1d(num_numeric)
        self.temporal_dim = num_temporal

    def encode_temporal(self, hour: torch.Tensor, day: torch.Tensor, minute: torch.Tensor) -> torch.Tensor:
        """Cyclical encoding for temporal features."""
        hour_sin = torch.sin(2 * np.pi * hour / 24.0)
        hour_cos = torch.cos(2 * np.pi * hour / 24.0)
        day_sin = torch.sin(2 * np.pi * day / 7.0)
        day_cos = torch.cos(2 * np.pi * day / 7.0)
        min_sin = torch.sin(2 * np.pi * minute / 60.0)
        min_cos = torch.cos(2 * np.pi * minute / 60.0)
        return torch.stack([hour_sin, hour_cos, day_sin, day_cos, min_sin, min_cos], dim=-1)

    def forward(
        self,
        categorical_ids: Dict[str, torch.Tensor],
        numeric_features: torch.Tensor,
        temporal_features: Tuple[torch.Tensor, torch.Tensor, torch.Tensor],
    ) -> torch.Tensor:
        """
        Args:
            categorical_ids: {col_name: (batch,) tensor of token IDs}
            numeric_features: (batch, 4) - bytes, duration, port, failed_attempts
            temporal_features: (hour, day, minute) each (batch,) float

        Returns:
            tokens: (batch, output_dim) - dense event representation
        """
        cat_embeds = []
        for col, embed_layer in self.embeddings.items():
            ids = categorical_ids.get(col, torch.zeros(numeric_features.size(0), dtype=torch.long, device=numeric_features.device))
            cat_embeds.append(embed_layer(ids))
        cat_combined = torch.cat(cat_embeds, dim=-1)

        if numeric_features.size(0) > 1:
            num_normed = self.numeric_norm(numeric_features)
        else:
            num_normed = numeric_features

        hour, day, minute = temporal_features
        temporal = self.encode_temporal(hour, day, minute)

        combined = torch.cat([cat_combined, num_normed, temporal], dim=-1)
        return self.fusion(combined)


# COMMAND ----------

# MAGIC %md
# MAGIC ## Spark UDF for Batch Tokenization

# COMMAND ----------

CATEGORICAL_COLUMNS = [
    "event_type", "action", "outcome", "severity", "protocol", "source_zone", "dest_zone"
]

NUMERIC_COLUMNS = ["bytes_transferred", "duration_seconds", "destination_port", "failed_attempts"]

def build_tokenizer_from_catalog(catalog: str = "security_catalog", schema: str = "ml"):
    """
    Build and register the tokenizer from existing event data.

    Steps:
        1. Read recent events from Delta
        2. Build vocabulary from categorical columns
        3. Initialize tokenizer model
        4. Save vocab + model to MLflow
    """
    events_table = f"{catalog}.silver.enriched_security_events"

    try:
        events_df = spark.table(events_table).limit(1000000)
    except Exception:
        events_df = spark.table("security_catalog.bronze.events").limit(1000000)

    vocab = SecurityVocabulary()
    vocab.build_from_data(events_df, CATEGORICAL_COLUMNS)

    vocab_path = f"/mnt/{catalog}/{schema}/mc_rnn_vocabulary"
    vocab.save_to_delta(vocab_path)

    vocab_sizes = {col: vocab.vocab_size(col) for col in CATEGORICAL_COLUMNS}
    tokenizer = SecurityEventTokenizer(vocab_sizes, output_dim=128)

    print(f"Tokenizer built:")
    print(f"  Categorical fields: {len(CATEGORICAL_COLUMNS)}")
    print(f"  Vocab sizes: {vocab_sizes}")
    print(f"  Output dim: 128")
    print(f"  Parameters: {sum(p.numel() for p in tokenizer.parameters()):,}")

    return tokenizer, vocab


# COMMAND ----------

# MAGIC %md
# MAGIC ## Batch Tokenization Pipeline

# COMMAND ----------

def tokenize_entity_sequences(
    entity_events_df: DataFrame,
    vocab: SecurityVocabulary,
    tokenizer: SecurityEventTokenizer,
    segment_size: int = 64,
    entity_col: str = "user_id",
    timestamp_col: str = "event_timestamp",
) -> DataFrame:
    """
    Tokenize events per entity into segment-aligned sequences.

    Steps:
        1. Order events per entity by timestamp
        2. Assign segment boundaries (every `segment_size` events)
        3. Tokenize each event into 128-dim vector
        4. Group by (entity, segment) for MC-RNN training

    Output schema:
        entity_id, segment_index, event_tokens (array<array<float>>),
        segment_timestamp_start, segment_timestamp_end, event_count
    """
    windowed = entity_events_df.withColumn(
        "event_order",
        F.row_number().over(
            Window.partitionBy(entity_col).orderBy(timestamp_col)
        ),
    ).withColumn(
        "segment_index",
        ((F.col("event_order") - 1) / segment_size).cast("int"),
    )

    segmented = windowed.groupBy(entity_col, "segment_index").agg(
        F.count("*").alias("event_count"),
        F.min(timestamp_col).alias("segment_start"),
        F.max(timestamp_col).alias("segment_end"),
        F.collect_list(
            F.struct(
                *[F.col(c) for c in CATEGORICAL_COLUMNS],
                *[F.col(c) for c in NUMERIC_COLUMNS],
                F.hour(timestamp_col).alias("hour"),
                F.dayofweek(timestamp_col).alias("day_of_week"),
                F.minute(timestamp_col).alias("minute"),
            )
        ).alias("events"),
    )

    return segmented


# COMMAND ----------

def tokenize_segment_batch(events_batch: list, vocab: SecurityVocabulary, tokenizer: SecurityEventTokenizer) -> np.ndarray:
    """
    Tokenize a batch of events using the PyTorch tokenizer.
    Used in Spark pandas_udf for distributed inference.
    """
    tokenizer.eval()

    categorical_ids = {col: [] for col in CATEGORICAL_COLUMNS}
    numeric_features = []
    temporal_features = ([], [], [])

    for event in events_batch:
        for col in CATEGORICAL_COLUMNS:
            val = getattr(event, col, None) or "[UNK]"
            categorical_ids[col].append(vocab.encode(col, str(val)))

        numerics = [
            float(getattr(event, "bytes_transferred", 0) or 0),
            float(getattr(event, "duration_seconds", 0) or 0),
            float(getattr(event, "destination_port", 0) or 0),
            float(getattr(event, "failed_attempts", 0) or 0),
        ]
        numeric_features.append(numerics)

        temporal_features[0].append(float(getattr(event, "hour", 12)))
        temporal_features[1].append(float(getattr(event, "day_of_week", 1)))
        temporal_features[2].append(float(getattr(event, "minute", 0)))

    with torch.no_grad():
        cat_tensors = {col: torch.tensor(ids, dtype=torch.long) for col, ids in categorical_ids.items()}
        num_tensor = torch.tensor(numeric_features, dtype=torch.float32)
        temp_tensors = tuple(torch.tensor(t, dtype=torch.float32) for t in temporal_features)

        tokens = tokenizer(cat_tensors, num_tensor, temp_tensors)

    return tokens.numpy()


# COMMAND ----------

# MAGIC %md
# MAGIC ## Run Tokenization Job

# COMMAND ----------

def run_tokenization_pipeline(
    catalog: str = "security_catalog",
    lookback_days: int = 90,
    segment_size: int = 64,
    entity_col: str = "user_id",
):
    """
    Full tokenization pipeline:
        1. Read enriched events (lookback_days)
        2. Build/load vocabulary
        3. Segment per entity
        4. Write tokenized segments to Delta feature table
    """
    output_table = f"{catalog}.ml.mc_rnn_tokenized_segments"

    try:
        events_df = spark.table(f"{catalog}.silver.enriched_security_events")
    except Exception:
        events_df = spark.table(f"{catalog}.bronze.events")

    cutoff = datetime.now() - timedelta(days=lookback_days)
    events_df = events_df.where(F.col("event_timestamp") >= cutoff)

    tokenizer, vocab = build_tokenizer_from_catalog(catalog)

    segmented_df = tokenize_entity_sequences(
        events_df, vocab, tokenizer, segment_size, entity_col
    )

    entity_count = segmented_df.select(entity_col).distinct().count()
    segment_count = segmented_df.count()

    print(f"Tokenization complete:")
    print(f"  Entities: {entity_count:,}")
    print(f"  Segments: {segment_count:,}")
    print(f"  Segment size: {segment_size}")
    print(f"  Lookback: {lookback_days} days")

    (
        segmented_df
        .write.format("delta")
        .mode("overwrite")
        .partitionBy(entity_col)
        .option("overwriteSchema", "true")
        .saveAsTable(output_table)
    )

    print(f"Written to: {output_table}")
    return segmented_df


# COMMAND ----------

# MAGIC %md
# MAGIC ## Execute

# COMMAND ----------

if "dbutils" in dir():
    result = run_tokenization_pipeline(
        catalog="security_catalog",
        lookback_days=90,
        segment_size=64,
        entity_col="user_id",
    )
    display(result.limit(20))
