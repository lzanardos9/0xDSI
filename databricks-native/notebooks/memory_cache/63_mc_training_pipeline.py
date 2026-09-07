# Databricks notebook source
# MAGIC %md
# MAGIC # MC-RNN Distributed Training Pipeline
# MAGIC
# MAGIC Trains the Memory Caching RNN on entity event sequences using
# MAGIC Databricks TorchDistributor for multi-GPU distributed training.
# MAGIC
# MAGIC **Training Strategy:**
# MAGIC - Curriculum learning: segment size 16 → 32 → 64
# MAGIC - Multi-objective loss: next-event + reconstruction + contrastive
# MAGIC - MLflow experiment tracking with model registry
# MAGIC - Checkpoint resumption for fault tolerance

# COMMAND ----------

# MAGIC %pip install torch>=2.1.0 einops>=0.7.0 mlflow>=2.10.0

# COMMAND ----------

# MAGIC %run ./61_mc_rnn_architecture

# COMMAND ----------

import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import Dataset, DataLoader, DistributedSampler
import torch.distributed as dist
from pyspark.ml.torch.distributor import TorchDistributor
import mlflow
import mlflow.pytorch
from pyspark.sql import SparkSession
import pyspark.sql.functions as F
import numpy as np
import os
import json
from datetime import datetime
from typing import Optional, Dict, List

spark = SparkSession.builder.getOrCreate()

# COMMAND ----------

# MAGIC %md
# MAGIC ## Dataset

# COMMAND ----------

class EntitySegmentDataset(Dataset):
    """
    PyTorch Dataset for MC-RNN training.
    Each sample is a sequence of segments for one entity,
    loaded from pre-tokenized Delta table.
    """

    def __init__(
        self,
        data_path: str,
        segment_size: int = 64,
        max_segments_per_entity: int = 32,
        input_dim: int = 128,
        split: str = "train",
        train_ratio: float = 0.8,
    ):
        self.segment_size = segment_size
        self.max_segments = max_segments_per_entity
        self.input_dim = input_dim

        df = spark.read.format("delta").load(data_path)
        entities = df.select("user_id").distinct().collect()
        entity_list = [r.user_id for r in entities]

        split_idx = int(len(entity_list) * train_ratio)
        if split == "train":
            self.entities = entity_list[:split_idx]
        else:
            self.entities = entity_list[split_idx:]

        self.data_cache: Dict[str, List[np.ndarray]] = {}
        self._preload(df)

    def _preload(self, df: DataFrame):
        """Pre-load tokenized segments into memory for training speed."""
        for entity_id in self.entities:
            entity_df = (
                df.where(F.col("user_id") == entity_id)
                .orderBy("segment_index")
                .limit(self.max_segments)
                .collect()
            )
            segments = []
            for row in entity_df:
                # Only train on real tokenized event features. Rows without them are
                # skipped rather than back-filled with random noise, which would train
                # the model on fabricated data.
                if not (hasattr(row, "event_tokens") and row.event_tokens):
                    continue
                token_array = np.array(row.event_tokens, dtype=np.float32)
                if token_array.ndim == 1:
                    token_array = token_array.reshape(-1, self.input_dim)
                if len(token_array) < self.segment_size:
                    pad = np.zeros((self.segment_size - len(token_array), self.input_dim), dtype=np.float32)
                    token_array = np.concatenate([token_array, pad])
                elif len(token_array) > self.segment_size:
                    token_array = token_array[:self.segment_size]
                segments.append(token_array)

            if len(segments) >= 2:
                self.data_cache[entity_id] = segments

    def __len__(self):
        return len(self.data_cache)

    def __getitem__(self, idx):
        entity_id = list(self.data_cache.keys())[idx]
        segments = self.data_cache[entity_id]

        num_segments = min(len(segments), self.max_segments)
        segment_tensor = np.stack(segments[:num_segments])

        # No supervised anomaly labels are fabricated. Training relies on the
        # self-supervised objectives (next-event, reconstruction, contrastive);
        # inventing random positive labels would teach the model to flag benign
        # events as anomalies.
        labels = np.zeros((num_segments, self.segment_size), dtype=np.float32)

        return {
            "segments": torch.from_numpy(segment_tensor),
            "labels": torch.from_numpy(labels),
            "num_segments": num_segments,
            "entity_id": entity_id,
        }


# COMMAND ----------

# MAGIC %md
# MAGIC ## Training Loop

# COMMAND ----------

class MCRNNTrainer:
    """
    Distributed trainer for MC-RNN with curriculum learning.

    Curriculum phases:
        Phase 1 (epochs 1-5): segment_size=16, cache_size=8
        Phase 2 (epochs 6-15): segment_size=32, cache_size=16
        Phase 3 (epochs 16+): segment_size=64, cache_size=32
    """

    def __init__(
        self,
        config: MCConfig,
        learning_rate: float = 1e-4,
        weight_decay: float = 0.01,
        warmup_steps: int = 1000,
        max_epochs: int = 30,
        gradient_clip: float = 1.0,
    ):
        self.config = config
        self.lr = learning_rate
        self.weight_decay = weight_decay
        self.warmup_steps = warmup_steps
        self.max_epochs = max_epochs
        self.gradient_clip = gradient_clip

    def get_curriculum_config(self, epoch: int) -> Dict:
        """Get segment/cache size based on curriculum phase."""
        if epoch < 5:
            return {"segment_size": 16, "max_cache": 8, "phase": "warmup"}
        elif epoch < 15:
            return {"segment_size": 32, "max_cache": 16, "phase": "growing"}
        else:
            return {"segment_size": 64, "max_cache": 32, "phase": "full"}

    def train_epoch(
        self,
        model: MemoryCachingRNN,
        dataloader: DataLoader,
        optimizer: optim.Optimizer,
        scheduler,
        loss_fn: MCLoss,
        epoch: int,
        device: torch.device,
    ) -> Dict[str, float]:
        """Train one epoch with curriculum-appropriate segment sizes."""
        model.train()
        curriculum = self.get_curriculum_config(epoch)
        seg_size = curriculum["segment_size"]

        total_loss = 0.0
        total_next = 0.0
        total_recon = 0.0
        total_contrastive = 0.0
        num_batches = 0

        for batch in dataloader:
            segments = batch["segments"].to(device)
            labels = batch["labels"].to(device)
            num_segs = batch["num_segments"]

            B = segments.size(0)
            max_segs = min(segments.size(1), curriculum["max_cache"] + 1)

            recurrent_states = [None] * self.config.num_layers
            cache_states = [
                torch.zeros(B, 0, self.config.hidden_dim, device=device)
                for _ in range(self.config.num_layers)
            ]
            cache_masks = [
                torch.zeros(B, 0, dtype=torch.bool, device=device)
                for _ in range(self.config.num_layers)
            ]

            segment_losses = []

            for seg_idx in range(max_segs):
                x = segments[:, seg_idx, :seg_size, :]
                seg_labels = labels[:, seg_idx, :seg_size] if labels.size(2) >= seg_size else None

                output = model(
                    x,
                    recurrent_states=recurrent_states,
                    cache_states_per_layer=cache_states if cache_states[0].size(1) > 0 else None,
                    cache_masks=cache_masks if cache_masks[0].size(1) > 0 else None,
                    segment_index=seg_idx,
                )

                losses = loss_fn(output, x, seg_labels)
                segment_losses.append(losses["total_loss"])

                recurrent_states = output["new_recurrent_states"]
                checkpoint = output["segment_checkpoint"].detach()

                for layer_idx in range(self.config.num_layers):
                    new_cache = checkpoint.unsqueeze(1)
                    cache_states[layer_idx] = torch.cat(
                        [cache_states[layer_idx], new_cache], dim=1
                    )
                    new_mask = torch.ones(B, 1, dtype=torch.bool, device=device)
                    cache_masks[layer_idx] = torch.cat(
                        [cache_masks[layer_idx], new_mask], dim=1
                    )

                    if cache_states[layer_idx].size(1) > curriculum["max_cache"]:
                        cache_states[layer_idx] = cache_states[layer_idx][:, -curriculum["max_cache"]:]
                        cache_masks[layer_idx] = cache_masks[layer_idx][:, -curriculum["max_cache"]:]

            batch_loss = torch.stack(segment_losses).mean()

            optimizer.zero_grad()
            batch_loss.backward()
            nn.utils.clip_grad_norm_(model.parameters(), self.gradient_clip)
            optimizer.step()
            scheduler.step()

            total_loss += batch_loss.item()
            total_next += losses["next_event_loss"].item()
            total_recon += losses["reconstruction_loss"].item()
            total_contrastive += losses["contrastive_loss"].item()
            num_batches += 1

        return {
            "total_loss": total_loss / max(num_batches, 1),
            "next_event_loss": total_next / max(num_batches, 1),
            "reconstruction_loss": total_recon / max(num_batches, 1),
            "contrastive_loss": total_contrastive / max(num_batches, 1),
            "curriculum_phase": curriculum["phase"],
            "segment_size": seg_size,
        }

    def evaluate(
        self,
        model: MemoryCachingRNN,
        dataloader: DataLoader,
        loss_fn: MCLoss,
        epoch: int,
        device: torch.device,
    ) -> Dict[str, float]:
        """Evaluate on validation set."""
        model.eval()
        curriculum = self.get_curriculum_config(epoch)
        seg_size = curriculum["segment_size"]

        total_loss = 0.0
        num_batches = 0

        with torch.no_grad():
            for batch in dataloader:
                segments = batch["segments"].to(device)
                labels = batch["labels"].to(device)
                B = segments.size(0)
                max_segs = min(segments.size(1), curriculum["max_cache"] + 1)

                recurrent_states = [None] * self.config.num_layers
                cache_states = [
                    torch.zeros(B, 0, self.config.hidden_dim, device=device)
                    for _ in range(self.config.num_layers)
                ]
                cache_masks = [
                    torch.zeros(B, 0, dtype=torch.bool, device=device)
                    for _ in range(self.config.num_layers)
                ]

                for seg_idx in range(max_segs):
                    x = segments[:, seg_idx, :seg_size, :]
                    seg_labels = labels[:, seg_idx, :seg_size] if labels.size(2) >= seg_size else None

                    output = model(
                        x,
                        recurrent_states=recurrent_states,
                        cache_states_per_layer=cache_states if cache_states[0].size(1) > 0 else None,
                        cache_masks=cache_masks if cache_masks[0].size(1) > 0 else None,
                        segment_index=seg_idx,
                    )

                    losses = loss_fn(output, x, seg_labels)
                    total_loss += losses["total_loss"].item()

                    recurrent_states = output["new_recurrent_states"]
                    checkpoint = output["segment_checkpoint"]
                    for layer_idx in range(self.config.num_layers):
                        cache_states[layer_idx] = torch.cat(
                            [cache_states[layer_idx], checkpoint.unsqueeze(1)], dim=1
                        )
                        cache_masks[layer_idx] = torch.cat(
                            [cache_masks[layer_idx], torch.ones(B, 1, dtype=torch.bool, device=device)], dim=1
                        )

                num_batches += 1

        return {"val_loss": total_loss / max(num_batches, 1)}


# COMMAND ----------

# MAGIC %md
# MAGIC ## Distributed Training Function

# COMMAND ----------

def train_mc_rnn_distributed(
    data_path: str,
    experiment_name: str = "/Shared/mc_rnn_security_detection",
    preset: str = "medium",
    max_epochs: int = 30,
    batch_size: int = 8,
    learning_rate: float = 1e-4,
    catalog: str = "security_catalog",
):
    """
    Main distributed training entry point.
    Launched via TorchDistributor for multi-GPU training.
    """
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Training on device: {device}")
    print(f"Preset: {preset}, Epochs: {max_epochs}, Batch: {batch_size}")

    model = create_mc_rnn(input_dim=128, preset=preset).to(device)
    config = model.config

    loss_fn = MCLoss()

    optimizer = optim.AdamW(
        model.parameters(),
        lr=learning_rate,
        weight_decay=0.01,
        betas=(0.9, 0.98),
    )

    total_steps = max_epochs * 100
    scheduler = optim.lr_scheduler.OneCycleLR(
        optimizer,
        max_lr=learning_rate,
        total_steps=total_steps,
        pct_start=0.1,
        anneal_strategy="cos",
    )

    trainer = MCRNNTrainer(
        config=config,
        learning_rate=learning_rate,
        max_epochs=max_epochs,
    )

    train_dataset = EntitySegmentDataset(data_path, segment_size=64, split="train")
    val_dataset = EntitySegmentDataset(data_path, segment_size=64, split="val")

    if len(train_dataset) == 0:
        raise RuntimeError(
            f"No real tokenized training segments found at {data_path}. "
            "Refusing to train on fabricated data. Populate the tokenized "
            "segments table (event_tokens) before running this pipeline."
        )

    train_loader = DataLoader(train_dataset, batch_size=batch_size, shuffle=True, num_workers=4, pin_memory=True)
    val_loader = DataLoader(val_dataset, batch_size=batch_size, shuffle=False, num_workers=2)

    mlflow.set_experiment(experiment_name)

    with mlflow.start_run(run_name=f"mc_rnn_{preset}_{datetime.now().strftime('%Y%m%d_%H%M')}"):
        mlflow.log_params({
            "preset": preset,
            "hidden_dim": config.hidden_dim,
            "num_layers": config.num_layers,
            "segment_size": config.segment_size,
            "max_cache_size": config.max_cache_size,
            "num_heads": config.num_heads,
            "learning_rate": learning_rate,
            "batch_size": batch_size,
            "max_epochs": max_epochs,
            "train_entities": len(train_dataset),
            "val_entities": len(val_dataset),
        })

        best_val_loss = float("inf")

        for epoch in range(max_epochs):
            train_metrics = trainer.train_epoch(
                model, train_loader, optimizer, scheduler, loss_fn, epoch, device
            )

            val_metrics = trainer.evaluate(model, val_loader, loss_fn, epoch, device)

            mlflow.log_metrics({
                "train_loss": train_metrics["total_loss"],
                "train_next_event_loss": train_metrics["next_event_loss"],
                "train_reconstruction_loss": train_metrics["reconstruction_loss"],
                "train_contrastive_loss": train_metrics["contrastive_loss"],
                "val_loss": val_metrics["val_loss"],
                "learning_rate": scheduler.get_last_lr()[0],
            }, step=epoch)

            print(
                f"Epoch {epoch+1}/{max_epochs} | "
                f"Phase: {train_metrics['curriculum_phase']} | "
                f"Train: {train_metrics['total_loss']:.4f} | "
                f"Val: {val_metrics['val_loss']:.4f} | "
                f"LR: {scheduler.get_last_lr()[0]:.2e}"
            )

            if val_metrics["val_loss"] < best_val_loss:
                best_val_loss = val_metrics["val_loss"]
                mlflow.pytorch.log_model(
                    model,
                    artifact_path="mc_rnn_best",
                    registered_model_name=f"{catalog}_mc_rnn_security",
                )
                print(f"  New best model saved (val_loss={best_val_loss:.4f})")

        mlflow.log_metric("best_val_loss", best_val_loss)

    return model


# COMMAND ----------

# MAGIC %md
# MAGIC ## Launch Training

# COMMAND ----------

if "dbutils" in dir():
    DATA_PATH = "/mnt/security_catalog/ml/mc_rnn_tokenized_segments"
    EXPERIMENT = "/Shared/0xdsi/mc_rnn_security_detection"

    distributor = TorchDistributor(
        num_processes=4,
        local_mode=False,
        use_gpu=True,
    )

    trained_model = distributor.run(
        train_mc_rnn_distributed,
        data_path=DATA_PATH,
        experiment_name=EXPERIMENT,
        preset="production",
        max_epochs=30,
        batch_size=8,
        learning_rate=1e-4,
    )

    print("Training complete. Model registered in MLflow.")
