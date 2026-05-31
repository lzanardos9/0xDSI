# Databricks notebook source
# MAGIC %md
# MAGIC # 0xDSI Shared Configuration
# MAGIC Central configuration resolver for all SOC notebooks.
# MAGIC Handles catalog/schema resolution, environment detection, widget defaults,
# MAGIC and runtime settings from the system_settings Delta table.

# COMMAND ----------

from dataclasses import dataclass, field
from typing import Optional, Any
import os
import json


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
    _runtime_settings: dict = field(default_factory=dict, repr=False)

    def get(self, key: str, default: Any = None) -> Any:
        """Read a setting from runtime system_settings (loaded from Delta)."""
        return self._runtime_settings.get(key, default)

    def get_table_path(self, table_name: str) -> str:
        """Return fully qualified three-part table name."""
        return f"`{self.catalog}`.`{self.schema}`.`{table_name}`"


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


def _load_system_settings(spark, catalog: str, schema: str) -> dict:
    """Load key-value settings from the system_settings Delta table."""
    settings = {}
    try:
        table = f"`{catalog}`.`{schema}`.`system_settings`"
        rows = spark.sql(f"SELECT setting_key, setting_value FROM {table}").collect()
        for row in rows:
            val = row.setting_value
            # Auto-coerce JSON values
            try:
                val = json.loads(val)
            except (json.JSONDecodeError, TypeError):
                pass
            settings[row.setting_key] = val
    except Exception:
        pass  # Table may not exist yet during initial setup
    return settings


def load_config(dbutils, spark=None) -> SOCConfig:
    """
    Load configuration from Databricks widgets with sensible defaults,
    then overlay runtime settings from the system_settings Delta table.

    Usage:
        from _shared.config import load_config
        cfg = load_config(dbutils, spark)
        spark.sql(f"USE CATALOG {cfg.catalog}")
        spark.sql(f"USE SCHEMA {cfg.schema}")
    """
    # Register widgets with defaults (aligned with databricks.yml variables)
    dbutils.widgets.text("catalog", "soc_platform", "Unity Catalog")
    dbutils.widgets.text("schema", "agentic_soc", "Schema")
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

    # Load runtime settings from Delta table
    runtime_settings = {}
    if spark is not None:
        runtime_settings = _load_system_settings(spark, catalog, schema)

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
        _runtime_settings=runtime_settings,
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


def is_agent_enabled(spark, cfg: SOCConfig, agent_name: str) -> bool:
    """Check if a specific agent is enabled in the agent_configs table."""
    try:
        table = get_table_path(cfg, "agent_configs")
        row = spark.sql(
            f"SELECT enabled FROM {table} WHERE name = '{agent_name}' OR agent_type = '{agent_name}' LIMIT 1"
        ).collect()
        if row:
            return bool(row[0].enabled)
        return True  # Default to enabled if not in table
    except Exception:
        return True  # Default to enabled if table doesn't exist
