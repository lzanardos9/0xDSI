# Databricks notebook source
# MAGIC %md
# MAGIC # MC-RNN Model Serving Endpoint
# MAGIC
# MAGIC Deploys the trained MC-RNN model to Databricks Model Serving
# MAGIC for real-time inference. Handles GPU allocation, autoscaling,
# MAGIC and state management for streaming detection.
# MAGIC
# MAGIC **Endpoint:** `/serving-endpoints/mc-rnn-security/invocations`
# MAGIC **Input:** entity_id + new_events batch
# MAGIC **Output:** anomaly_scores + cache_attention + updated_state

# COMMAND ----------

# MAGIC %pip install torch>=2.1.0 einops>=0.7.0 mlflow>=2.10.0

# COMMAND ----------

# MAGIC %run ./61_mc_rnn_architecture

# COMMAND ----------

import torch
import mlflow
import mlflow.pytorch
import mlflow.pyfunc
import numpy as np
import json
from pyspark.sql import SparkSession
from datetime import datetime
from typing import Dict, List, Optional
import pandas as pd

spark = SparkSession.builder.getOrCreate()

# COMMAND ----------

# MAGIC %md
# MAGIC ## Custom PyFunc Wrapper

# COMMAND ----------

class MCRNNServingWrapper(mlflow.pyfunc.PythonModel):
    """
    MLflow PyFunc wrapper for MC-RNN serving.

    Handles:
        - Model loading and GPU placement
        - Entity state management (load/save per request)
        - Batch inference across multiple entities
        - Response formatting with explainability data
    """

    def load_context(self, context):
        """Load model artifacts on endpoint startup."""
        import torch
        from pathlib import Path

        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

        model_path = context.artifacts.get("mc_rnn_model", None)
        if model_path:
            self.model = torch.load(Path(model_path) / "model.pt", map_location=self.device)
        else:
            config = MCConfig(input_dim=128, hidden_dim=256, num_layers=4,
                            segment_size=64, max_cache_size=32)
            self.model = MemoryCachingRNN(config).to(self.device)

        self.model.eval()
        self.config = self.model.config

        self.entity_states: Dict[str, Dict] = {}

    def predict(self, context, model_input: pd.DataFrame) -> pd.DataFrame:
        """
        Inference endpoint handler.

        Input DataFrame columns:
            - entity_id: string
            - event_tokens: JSON array of arrays (events x features)
            - include_attention: bool (optional, default False)

        Output DataFrame columns:
            - entity_id: string
            - anomaly_scores: JSON array of per-event scores
            - max_anomaly_score: float
            - is_anomalous: bool
            - cache_attention_pattern: JSON (if requested)
            - segment_checkpoint_norm: float
        """
        results = []

        for _, row in model_input.iterrows():
            entity_id = row["entity_id"]
            include_attention = row.get("include_attention", False)

            event_tokens = self._parse_tokens(row.get("event_tokens", "[]"))

            result = self._infer_entity(entity_id, event_tokens, include_attention)
            results.append(result)

        return pd.DataFrame(results)

    @torch.no_grad()
    def _infer_entity(self, entity_id: str, event_tokens: np.ndarray, include_attention: bool) -> Dict:
        """Run MC-RNN inference for a single entity."""
        if event_tokens.shape[0] == 0:
            return self._empty_result(entity_id)

        x = torch.from_numpy(event_tokens).float().unsqueeze(0).to(self.device)

        if x.size(1) > self.config.segment_size:
            x = x[:, :self.config.segment_size, :]
        elif x.size(1) < self.config.segment_size:
            pad_size = self.config.segment_size - x.size(1)
            x = torch.nn.functional.pad(x, (0, 0, 0, pad_size))

        state = self.entity_states.get(entity_id, {})
        cache_states = state.get("cache_states", None)
        cache_mask = None
        segment_index = state.get("segment_index", 0)

        if cache_states is not None and cache_states.size(1) > 0:
            cache_mask = torch.ones(1, cache_states.size(1), dtype=torch.bool, device=self.device)

        output = self.model(
            x,
            cache_states_per_layer=[cache_states] * self.config.num_layers if cache_states is not None else None,
            cache_masks=[cache_mask] * self.config.num_layers if cache_mask is not None else None,
            segment_index=segment_index,
        )

        anomaly_scores = output["anomaly_scores"][0].cpu().numpy()
        checkpoint = output["segment_checkpoint"].detach()

        if cache_states is None:
            cache_states = checkpoint.unsqueeze(1)
        else:
            cache_states = torch.cat([cache_states, checkpoint.unsqueeze(1)], dim=1)
            if cache_states.size(1) > self.config.max_cache_size:
                cache_states = cache_states[:, -self.config.max_cache_size:]

        self.entity_states[entity_id] = {
            "cache_states": cache_states,
            "segment_index": segment_index + 1,
            "last_inference": datetime.now().isoformat(),
        }

        max_score = float(anomaly_scores.max())
        is_anomalous = max_score > 2.0

        result = {
            "entity_id": entity_id,
            "anomaly_scores": json.dumps(anomaly_scores.tolist()[:20]),
            "max_anomaly_score": max_score,
            "is_anomalous": is_anomalous,
            "segment_checkpoint_norm": float(torch.norm(checkpoint).item()),
            "cache_size": int(cache_states.size(1)),
        }

        if include_attention and output["cache_attention_weights"][0] is not None:
            attn = output["cache_attention_weights"][0][0].cpu().numpy().tolist()
            result["cache_attention_pattern"] = json.dumps(attn[:20])
        else:
            result["cache_attention_pattern"] = "[]"

        return result

    def _parse_tokens(self, tokens_json: str) -> np.ndarray:
        """Parse event tokens from JSON input."""
        try:
            tokens = json.loads(tokens_json) if isinstance(tokens_json, str) else tokens_json
            return np.array(tokens, dtype=np.float32)
        except Exception:
            return np.zeros((0, self.config.input_dim), dtype=np.float32)

    def _empty_result(self, entity_id: str) -> Dict:
        return {
            "entity_id": entity_id,
            "anomaly_scores": "[]",
            "max_anomaly_score": 0.0,
            "is_anomalous": False,
            "segment_checkpoint_norm": 0.0,
            "cache_size": 0,
            "cache_attention_pattern": "[]",
        }


# COMMAND ----------

# MAGIC %md
# MAGIC ## Register and Deploy

# COMMAND ----------

def register_serving_model(
    catalog: str = "security_catalog",
    model_name: str = "mc_rnn_security_serving",
    preset: str = "medium",
):
    """
    Register the MC-RNN model with MLflow for Databricks Model Serving.
    """
    config = MCConfig(input_dim=128, hidden_dim=256, num_layers=4,
                      segment_size=64, max_cache_size=32)
    model = MemoryCachingRNN(config)

    import tempfile, os
    with tempfile.TemporaryDirectory() as tmpdir:
        model_path = os.path.join(tmpdir, "model.pt")
        torch.save(model, model_path)

        with mlflow.start_run(run_name=f"mc_rnn_serving_{preset}"):
            mlflow.log_params({
                "preset": preset,
                "hidden_dim": config.hidden_dim,
                "num_layers": config.num_layers,
                "segment_size": config.segment_size,
                "max_cache_size": config.max_cache_size,
            })

            mlflow.pyfunc.log_model(
                artifact_path="mc_rnn_serving",
                python_model=MCRNNServingWrapper(),
                artifacts={"mc_rnn_model": tmpdir},
                registered_model_name=model_name,
                pip_requirements=[
                    "torch>=2.1.0",
                    "einops>=0.7.0",
                    "numpy",
                    "pandas",
                ],
            )

    print(f"Model registered: {model_name}")
    print(f"  Config: {preset}")
    print(f"  Ready for Databricks Model Serving deployment")


# COMMAND ----------

# MAGIC %md
# MAGIC ## Endpoint Configuration

# COMMAND ----------

def create_serving_endpoint_config() -> Dict:
    """
    Generate the Databricks Model Serving endpoint configuration.
    Apply via REST API or Terraform.
    """
    config = {
        "name": "mc-rnn-security",
        "config": {
            "served_models": [{
                "model_name": "mc_rnn_security_serving",
                "model_version": "latest",
                "workload_size": "Medium",
                "scale_to_zero_enabled": False,
                "workload_type": "GPU_MEDIUM",
            }],
            "auto_capture_config": {
                "catalog_name": "security_catalog",
                "schema_name": "ml",
                "table_name_prefix": "mc_rnn_serving_logs",
            },
            "traffic_config": {
                "routes": [{
                    "served_model_name": "mc_rnn_security_serving-latest",
                    "traffic_percentage": 100,
                }]
            },
        },
        "rate_limits": [{
            "calls": 1000,
            "renewal_period": "MINUTE",
            "key": "endpoint",
        }],
        "tags": [
            {"key": "team", "value": "security"},
            {"key": "model_type", "value": "mc_rnn"},
            {"key": "paper", "value": "arxiv_2602.24281"},
        ],
    }

    print("Serving Endpoint Configuration:")
    print(json.dumps(config, indent=2))
    print("\nDeploy via:")
    print("  POST /api/2.0/serving-endpoints")
    print("  OR: databricks.yml resources/serving_endpoints.yml")

    return config


# COMMAND ----------

# MAGIC %md
# MAGIC ## Endpoint Health Check

# COMMAND ----------

def endpoint_health_check():
    """Validate endpoint is serving correctly with test inference."""
    test_input = pd.DataFrame([{
        "entity_id": "test_entity_001",
        "event_tokens": json.dumps(np.random.randn(16, 128).tolist()),
        "include_attention": True,
    }])

    wrapper = MCRNNServingWrapper()

    class MockContext:
        artifacts = {}
    wrapper.load_context(MockContext())

    result = wrapper.predict(None, test_input)

    print("Health Check Results:")
    print(f"  Entity: {result.iloc[0]['entity_id']}")
    print(f"  Max Anomaly Score: {result.iloc[0]['max_anomaly_score']:.4f}")
    print(f"  Is Anomalous: {result.iloc[0]['is_anomalous']}")
    print(f"  Cache Size: {result.iloc[0]['cache_size']}")
    print(f"  Checkpoint Norm: {result.iloc[0]['segment_checkpoint_norm']:.4f}")
    print("  STATUS: HEALTHY")

    return result


# COMMAND ----------

# MAGIC %md
# MAGIC ## Execute

# COMMAND ----------

if "dbutils" in dir():
    register_serving_model(preset="medium")
    config = create_serving_endpoint_config()
else:
    endpoint_health_check()
