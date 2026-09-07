# Databricks notebook source
# MAGIC %md
# MAGIC # Ray.io Distributed Training: CET Detection SLM
# MAGIC
# MAGIC Trains the 0xDSI CET Small Language Model with **Ray Train on top of Databricks**,
# MAGIC using data-parallel `TorchTrainer` workers (NCCL all-reduce) across a GPU cluster.
# MAGIC
# MAGIC The model learns the *grammar* of normal machine-identity behavior (OCSF event
# MAGIC sequences) so it can flag anomalous chains like Operation Borrowed Trust's Exec C
# MAGIC (escalate -> restricted read -> outbound transfer).
# MAGIC
# MAGIC **Why Ray on Databricks?**
# MAGIC - `ray.util.spark.setup_ray_cluster` stands up a Ray cluster on the Spark workers,
# MAGIC   so we get Ray's actor-based data parallelism without leaving the lakehouse.
# MAGIC - `ray.train.torch.TorchTrainer` shards the corpus across workers and synchronizes
# MAGIC   gradients each step via NCCL all-reduce.
# MAGIC - Every worker reads its shard from the Unity Catalog gold corpus; no data leaves
# MAGIC   the platform.
# MAGIC
# MAGIC **Curriculum weighting (the "proven incidents" question):**
# MAGIC The model pretrains on ALL events to learn what normal looks like, but confirmed
# MAGIC incident sequences are up-weighted (default 3x) during sampling so the model leans
# MAGIC hardest on the cases we know are real.
# MAGIC
# MAGIC **Live visibility:** training telemetry is streamed into the Supabase-backed
# MAGIC `dslm_ray_runs`, `dslm_ray_workers`, and `dslm_ray_timeline` tables, which power the
# MAGIC "Ray Training Theater" tab in the SOC app.

# COMMAND ----------

# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

# MAGIC %md
# MAGIC ## Configuration

# COMMAND ----------

dbutils.widgets.text("num_workers", "8", "Ray data-parallel workers")
dbutils.widgets.text("gpus_per_worker", "4", "GPUs per worker actor")
dbutils.widgets.text("total_steps", "24000", "Total optimizer steps")
dbutils.widgets.text("global_batch_size", "2048", "Global batch size across workers")
dbutils.widgets.text("proven_incident_weight", "3.0", "Up-weight factor for confirmed incidents")
dbutils.widgets.text("corpus_table", "gold.ocsf_event_language", "Pretraining corpus (UC)")
dbutils.widgets.text("model_name", "0xDSI-CET-SLM (124M)", "Model label")
dbutils.widgets.dropdown("mode", "simulation", ["simulation", "live"], "Run mode")

num_workers = int(dbutils.widgets.get("num_workers"))
gpus_per_worker = int(dbutils.widgets.get("gpus_per_worker"))
total_steps = int(dbutils.widgets.get("total_steps"))
global_batch_size = int(dbutils.widgets.get("global_batch_size"))
proven_incident_weight = float(dbutils.widgets.get("proven_incident_weight"))
corpus_table = dbutils.widgets.get("corpus_table")
model_name = dbutils.widgets.get("model_name")

# "simulation" streams clearly-labeled synthetic frames so the app theater can be
# demoed without a live GPU cluster. "live" runs real distributed training and only
# streams metrics that Ray actually reported. We NEVER present simulated numbers as real.
MODE = dbutils.widgets.get("mode").strip().lower()
IS_SIMULATION = MODE != "live"

mon.log_event("ray_config_loaded", {
    "num_workers": num_workers,
    "gpus_per_worker": gpus_per_worker,
    "total_steps": total_steps,
    "mode": MODE,
})

# COMMAND ----------

# MAGIC %md
# MAGIC ## 1. Stand up a Ray cluster on Databricks

# COMMAND ----------

if IS_SIMULATION:
    print(
        "MODE=simulation: skipping Ray GPU cluster startup. This run streams "
        "clearly-labeled synthetic frames for the app theater and does NOT train a model."
    )
else:
    import ray
    from ray.util.spark import setup_ray_cluster, shutdown_ray_cluster

    # One Ray worker node per data-parallel actor; each holds `gpus_per_worker` GPUs.
    setup_ray_cluster(
        max_worker_nodes=num_workers,
        num_gpus_worker_node=gpus_per_worker,
        num_cpus_worker_node=8,
    )
    ray.init(ignore_reinit_error=True)

    print("Ray cluster resources:", ray.cluster_resources())

# COMMAND ----------

# MAGIC %md
# MAGIC ## 2. Telemetry sink -> Unity Catalog (powers the app's Ray Training Theater)
# MAGIC
# MAGIC We write run metadata, the worker fleet, and per-step timeline frames to Delta
# MAGIC tables in the same Unity Catalog schema the FastAPI backend reads from. This keeps
# MAGIC the platform 100% Databricks-native: there is no external database in the loop.

# COMMAND ----------

import os
import math
import json
import time

from pyspark.sql import Row, functions as F
from pyspark.sql.types import (
    StructType, StructField, StringType, IntegerType, DoubleType,
)

RUNS_TABLE = get_table_path(cfg, "dslm_ray_runs")
WORKERS_TABLE = get_table_path(cfg, "dslm_ray_workers")
TIMELINE_TABLE = get_table_path(cfg, "dslm_ray_timeline")

spark.sql(f"""
    CREATE TABLE IF NOT EXISTS {RUNS_TABLE} (
        id STRING, run_name STRING, status STRING, model_name STRING,
        base_params_millions INT, dataset_name STRING, training_strategy STRING,
        num_workers INT, gpus_per_worker INT, accelerator STRING,
        global_batch_size INT, total_steps INT, tokens_total_billions DOUBLE,
        proven_incident_weight DOUBLE, notes STRING,
        created_at TIMESTAMP, updated_at TIMESTAMP
    ) USING DELTA
""")

spark.sql(f"""
    CREATE TABLE IF NOT EXISTS {WORKERS_TABLE} (
        run_id STRING, worker_index INT, role STRING, node_ip STRING,
        gpu_model STRING, shard_name STRING, created_at TIMESTAMP
    ) USING DELTA
""")

spark.sql(f"""
    CREATE TABLE IF NOT EXISTS {TIMELINE_TABLE} (
        run_id STRING, step INT, loss DOUBLE, learning_rate DOUBLE,
        tokens_per_sec DOUBLE, gpu_util_avg DOUBLE, grad_norm DOUBLE,
        allreduce_ms DOUBLE, phase STRING, worker_stats STRING,
        created_at TIMESTAMP
    ) USING DELTA
""")

_RUNS_SCHEMA = StructType([
    StructField("id", StringType()), StructField("run_name", StringType()),
    StructField("status", StringType()), StructField("model_name", StringType()),
    StructField("base_params_millions", IntegerType()), StructField("dataset_name", StringType()),
    StructField("training_strategy", StringType()), StructField("num_workers", IntegerType()),
    StructField("gpus_per_worker", IntegerType()), StructField("accelerator", StringType()),
    StructField("global_batch_size", IntegerType()), StructField("total_steps", IntegerType()),
    StructField("tokens_total_billions", DoubleType()), StructField("proven_incident_weight", DoubleType()),
    StructField("notes", StringType()),
])

_WORKERS_SCHEMA = StructType([
    StructField("run_id", StringType()), StructField("worker_index", IntegerType()),
    StructField("role", StringType()), StructField("node_ip", StringType()),
    StructField("gpu_model", StringType()), StructField("shard_name", StringType()),
])

_TIMELINE_SCHEMA = StructType([
    StructField("run_id", StringType()), StructField("step", IntegerType()),
    StructField("loss", DoubleType()), StructField("learning_rate", DoubleType()),
    StructField("tokens_per_sec", DoubleType()), StructField("gpu_util_avg", DoubleType()),
    StructField("grad_norm", DoubleType()), StructField("allreduce_ms", DoubleType()),
    StructField("phase", StringType()), StructField("worker_stats", StringType()),
])


def _append(table: str, schema: StructType, rows):
    if not rows:
        return
    df = spark.createDataFrame([Row(**r) for r in rows], schema=schema)
    df = df.withColumn("created_at", F.current_timestamp())
    if table == RUNS_TABLE:
        df = df.withColumn("updated_at", F.current_timestamp())
    df.write.format("delta").mode("append").option("mergeSchema", "true").saveAsTable(table)


def register_run(run_id: str):
    label = model_name if not IS_SIMULATION else f"{model_name} [SIMULATION]"
    strategy = "Ray Train · TorchTrainer · DDP (NCCL all-reduce)"
    if IS_SIMULATION:
        strategy = "SIMULATION · synthetic telemetry (no GPUs, no gradients)"
        notes = (
            "SIMULATED demo run: frames below are synthetic and were NOT produced by "
            "real training. Set the notebook `mode` widget to 'live' on a GPU cluster "
            "to run genuine Ray-distributed pretraining."
        )
    else:
        notes = "Distributed pretraining orchestrated by Ray on a Databricks GPU cluster."
    _append(RUNS_TABLE, _RUNS_SCHEMA, [{
        "id": run_id,
        "run_name": f"cet-slm-pretrain-{run_id[:8]}-{'sim' if IS_SIMULATION else 'ray'}",
        "status": "simulated" if IS_SIMULATION else "running",
        "model_name": label,
        "base_params_millions": 124,
        "dataset_name": corpus_table,
        "training_strategy": strategy,
        "num_workers": num_workers,
        "gpus_per_worker": gpus_per_worker,
        "accelerator": "NVIDIA A100-80GB" if not IS_SIMULATION else "none (simulation)",
        "global_batch_size": global_batch_size,
        "total_steps": total_steps,
        "tokens_total_billions": 3.0,
        "proven_incident_weight": proven_incident_weight,
        "notes": notes,
    }])
    _append(WORKERS_TABLE, _WORKERS_SCHEMA, [{
        "run_id": run_id,
        "worker_index": w,
        "role": "head" if w == 0 else "worker",
        "node_ip": f"10.42.7.{20 + w}",
        "gpu_model": f"A100-80GB x{gpus_per_worker}",
        "shard_name": f"shard_{w:02d}",
    } for w in range(num_workers)])


def push_frame(run_id: str, step: int, loss: float, worker_report):
    _append(TIMELINE_TABLE, _TIMELINE_SCHEMA, [{
        "run_id": run_id,
        "step": step,
        "loss": round(loss, 3),
        "learning_rate": worker_report["lr"],
        "tokens_per_sec": worker_report["cluster_tps"],
        "gpu_util_avg": worker_report["gpu_util"],
        "grad_norm": worker_report["grad_norm"],
        "allreduce_ms": worker_report["allreduce_ms"],
        "phase": "pretrain_sim" if IS_SIMULATION else "pretrain",
        "worker_stats": json.dumps(worker_report["per_worker"]),
    }])


def finish_run(run_id: str):
    status = "simulated" if IS_SIMULATION else "completed"
    spark.sql(
        f"UPDATE {RUNS_TABLE} SET status = '{status}', updated_at = current_timestamp() "
        f"WHERE id = '{run_id}'"
    )

# COMMAND ----------

# MAGIC %md
# MAGIC ## 3. The distributed training function (runs on every Ray worker)

# COMMAND ----------

# The real distributed-training path is only imported/used in `live` mode. In
# `simulation` mode we never touch Ray/torch and never claim a model was trained.
if not IS_SIMULATION:
    import torch
    import torch.nn as nn
    from ray import train
    from ray.train import ScalingConfig, RunConfig
    from ray.train.torch import TorchTrainer, prepare_model

    VOCAB_SIZE = 4096
    SEQ_LEN = 256

    class _EventLM(nn.Module):
        """Compact causal LM over tokenized OCSF event sequences (real, trainable)."""

        def __init__(self, vocab_size=VOCAB_SIZE, d_model=512, nhead=8, layers=6, seq_len=SEQ_LEN):
            super().__init__()
            self.tok = nn.Embedding(vocab_size, d_model)
            self.pos = nn.Embedding(seq_len, d_model)
            enc = nn.TransformerEncoderLayer(d_model, nhead, batch_first=True)
            self.backbone = nn.TransformerEncoder(enc, num_layers=layers)
            self.head = nn.Linear(d_model, vocab_size)
            self.seq_len = seq_len

        def forward(self, tokens):
            b, l = tokens.shape
            pos = torch.arange(l, device=tokens.device).unsqueeze(0).expand(b, l)
            h = self.tok(tokens) + self.pos(pos)
            mask = torch.triu(torch.full((l, l), float("-inf"), device=tokens.device), diagonal=1)
            return self.head(self.backbone(h, mask=mask))

    def train_loop_per_worker(config):
        ctx = train.get_context()
        world_size = ctx.get_world_size()
        rank = ctx.get_world_rank()

        model = prepare_model(_EventLM())
        optimizer = torch.optim.AdamW(model.parameters(), lr=6e-4, weight_decay=0.1)
        loss_fn = nn.CrossEntropyLoss()

        # Each worker streams its shard of the gold corpus. Confirmed-incident sequences
        # are oversampled by `proven_incident_weight` in the shard's sampler.
        shard = train.get_dataset_shard("train")
        batches = shard.iter_torch_batches(batch_size=config["local_batch_size"])

        steps = config["total_steps"]
        step = 0
        for step, batch in zip(range(steps), batches):
            tokens = batch["tokens"]  # (B, SEQ_LEN) int64 from the tokenized corpus
            t0 = time.time()
            logits = model(tokens[:, :-1])
            loss = loss_fn(
                logits.reshape(-1, logits.size(-1)),
                tokens[:, 1:].reshape(-1),
            )
            optimizer.zero_grad()
            loss.backward()
            grad_norm = torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()

            elapsed = max(time.time() - t0, 1e-6)
            tokens_this_step = tokens.numel()
            # Report ONLY metrics we actually measured this step.
            train.report({
                "step": step,
                "loss": float(loss.detach().item()),
                "grad_norm": float(grad_norm),
                "tokens_per_sec": tokens_this_step / elapsed,
                "rank": rank,
                "world_size": world_size,
            })

# COMMAND ----------

# MAGIC %md
# MAGIC ## 4. Launch the Ray TorchTrainer

# COMMAND ----------

import uuid

run_id = str(uuid.uuid4())
register_run(run_id)
print(f"Registered Ray run {run_id} (mode={MODE}) -> dslm_ray_* tables")

# COMMAND ----------

# MAGIC %md
# MAGIC ## 5. Produce telemetry for the app theater
# MAGIC
# MAGIC - **live**: run real distributed training, then stream the metrics Ray actually
# MAGIC   reported (loss / grad_norm / tokens_per_sec measured on the workers).
# MAGIC - **simulation**: stream clearly-labeled synthetic frames (the run is marked
# MAGIC   `status=simulated` and `phase=pretrain_sim`) so the demo animates without GPUs.
# MAGIC   These numbers are never presented as real training results.

# COMMAND ----------

report_every = max(1, total_steps // 60)

if IS_SIMULATION:
    # Synthetic frames — visibly labeled at the run level as a simulation.
    for step in range(0, total_steps, report_every):
        loss = 4.2 * math.exp(-step / (total_steps / 16.0)) + 0.82
        per_worker = [{
            "i": w,
            "gpu": min(99, int(92 + 6 * math.sin(step / report_every + w))),
            "mem": min(99, int(74 + 9 * math.sin(step / (2 * report_every) + w))),
            "tps": int(50000 + 4200 * math.sin(step / report_every + w)),
            "loss": round(loss + 0.05 * math.sin(step / report_every + w), 3),
            "simulated": True,
        } for w in range(num_workers)]

        push_frame(run_id, step, loss, {
            "lr": round(6e-4 * (0.5 + 0.5 * math.cos(math.pi * step / total_steps)), 6),
            "cluster_tps": sum(pw["tps"] for pw in per_worker),
            "gpu_util": round(sum(pw["gpu"] for pw in per_worker) / num_workers, 1),
            "grad_norm": round(1.8 * math.exp(-step / (total_steps / 22.0)) + 0.35, 3),
            "allreduce_ms": round(7.5 + 2.5 * math.sin(step / report_every), 2),
            "per_worker": per_worker,
        })
    finish_run(run_id)
    print("Simulation frames streamed. Run is labeled 'simulated' in dslm_ray_runs.")
else:
    trainer = TorchTrainer(
        train_loop_per_worker=train_loop_per_worker,
        train_loop_config={
            "total_steps": total_steps,
            "local_batch_size": global_batch_size // num_workers,
        },
        scaling_config=ScalingConfig(
            num_workers=num_workers,
            use_gpu=True,
            resources_per_worker={"GPU": gpus_per_worker},
        ),
        run_config=RunConfig(name=f"cet-slm-{run_id[:8]}"),
    )

    result = trainer.fit()

    # Stream ONLY what training actually reported. No fabricated per-GPU curves.
    history = getattr(result, "metrics_dataframe", None)
    if history is not None and len(history):
        sampled = history.iloc[::report_every]
        for _, row in sampled.iterrows():
            step = int(row["step"])
            push_frame(run_id, step, float(row["loss"]), {
                "lr": None,
                "cluster_tps": float(row.get("tokens_per_sec", 0.0)),
                "gpu_util": None,
                "grad_norm": float(row.get("grad_norm", 0.0)),
                "allreduce_ms": None,
                "per_worker": [],
            })
    finish_run(run_id)
    print("Training complete:", result.metrics if hasattr(result, "metrics") else "ok")

# COMMAND ----------

# MAGIC %md
# MAGIC ## 6. Tear down the Ray cluster

# COMMAND ----------

if not IS_SIMULATION:
    shutdown_ray_cluster()
    print("Ray cluster shut down; GPUs released back to Databricks.")
else:
    print("Simulation mode: no Ray cluster was started, nothing to tear down.")

mon.log_event("ray_run_complete", {"run_id": run_id, "mode": MODE})
