# Databricks notebook source
# MAGIC %md
# MAGIC # 0xDSI Shared Configuration
# MAGIC Central configuration resolver for all SOC notebooks.
# MAGIC Handles catalog/schema resolution, environment detection, and widget defaults.

# COMMAND ----------

from dataclasses import dataclass, field
from typing import Optional
import os


@dataclass
class SOCConfig:
    """Immutable configuration for a single notebook run."""
    catalog: str
    schema: str
    environment: str  # "dev", "staging", "production"
    secret_scope: str
    checkpoint_base: str
    volume_base: str
    model_endpoint: str
    model_fallback_endpoint: str
    max_query_rows: int = 10000
    default_timeout_seconds: int = 300
    enable_monitoring: bool = True
    tags: dict = field(default_factory=dict)


def _detect_environment(catalog: str) -> str:
    """Infer environment from catalog naming convention."""
    if "prod" in catalog.lower():
        return "production"
    if "staging" in catalog.lower() or "stg" in catalog.lower():
        return "staging"
    return "dev"


def _resolve_checkpoint_base(environment: str, catalog: str, schema: str) -> str:
    """Resolve checkpoint path based on environment."""
    if environment == "production":
        return f"/Volumes/{catalog}/{schema}/checkpoints"
    return f"/tmp/checkpoints/{catalog}/{schema}"


def _resolve_volume_base(catalog: str, schema: str) -> str:
    return f"/Volumes/{catalog}/{schema}/data"


def load_config(dbutils) -> SOCConfig:
    """
    Load configuration from Databricks widgets with sensible defaults.
    Call this at the top of every notebook.

    Usage:
        from _shared.config import load_config
        cfg = load_config(dbutils)
        spark.sql(f"USE CATALOG {cfg.catalog}")
        spark.sql(f"USE SCHEMA {cfg.schema}")
    """
    # Register widgets with defaults (idempotent)
    dbutils.widgets.text("catalog", "oxdsi_soc", "Unity Catalog")
    dbutils.widgets.text("schema", "security", "Schema")
    dbutils.widgets.text("secret_scope", "soc-secrets", "Secret Scope")
    dbutils.widgets.text("model_endpoint", "databricks-meta-llama-3-1-70b-instruct", "LLM Endpoint")
    dbutils.widgets.text("model_fallback_endpoint", "databricks-meta-llama-3-1-8b-instruct", "Fallback LLM")
    dbutils.widgets.text("environment", "", "Environment Override")

    catalog = dbutils.widgets.get("catalog")
    schema = dbutils.widgets.get("schema")
    env_override = dbutils.widgets.get("environment")
    secret_scope = dbutils.widgets.get("secret_scope")
    model_endpoint = dbutils.widgets.get("model_endpoint")
    model_fallback = dbutils.widgets.get("model_fallback_endpoint")

    environment = env_override if env_override else _detect_environment(catalog)
    checkpoint_base = _resolve_checkpoint_base(environment, catalog, schema)
    volume_base = _resolve_volume_base(catalog, schema)

    tags = {
        "catalog": catalog,
        "schema": schema,
        "environment": environment,
        "notebook_path": _get_notebook_path(dbutils),
    }

    return SOCConfig(
        catalog=catalog,
        schema=schema,
        environment=environment,
        secret_scope=secret_scope,
        checkpoint_base=checkpoint_base,
        volume_base=volume_base,
        model_endpoint=model_endpoint,
        model_fallback_endpoint=model_fallback,
        enable_monitoring=(environment != "dev"),
        tags=tags,
    )


def _get_notebook_path(dbutils) -> str:
    """Get the current notebook path safely."""
    try:
        ctx = dbutils.notebook.entry_point.getDbutils().notebook().getContext()
        return ctx.notebookPath().get()
    except Exception:
        return "unknown"


def activate_catalog(spark, cfg: SOCConfig):
    """Set the active catalog and schema for the Spark session."""
    spark.sql(f"USE CATALOG `{cfg.catalog}`")
    spark.sql(f"USE SCHEMA `{cfg.schema}`")


def get_table_path(cfg: SOCConfig, table_name: str) -> str:
    """Return fully qualified three-part table name."""
    return f"`{cfg.catalog}`.`{cfg.schema}`.`{table_name}`"


def get_checkpoint_path(cfg: SOCConfig, stream_name: str) -> str:
    """Return checkpoint location for a named streaming query."""
    return f"{cfg.checkpoint_base}/{stream_name}"
