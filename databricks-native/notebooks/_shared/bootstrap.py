# Databricks notebook source
# MAGIC %md
# MAGIC # 0xDSI Bootstrap
# MAGIC Run this at the top of every notebook to initialize the shared infrastructure.
# MAGIC
# MAGIC ```python
# MAGIC %run ../_shared/bootstrap
# MAGIC ```
# MAGIC
# MAGIC After running, you have access to:
# MAGIC - `cfg` -- SOCConfig instance
# MAGIC - `llm` -- SOCLLMClient instance
# MAGIC - `mon` -- Monitor instance
# MAGIC - `secrets` -- SecretsManager instance
# MAGIC - `qb(table)` -- QueryBuilder factory
# MAGIC - All sql_safe and delta_helpers functions

# COMMAND ----------

# Import all shared modules
import sys
import os

# Ensure _shared is importable
notebook_dir = os.path.dirname(os.path.abspath(__file__)) if "__file__" in dir() else "."
if notebook_dir not in sys.path:
    sys.path.insert(0, notebook_dir)

from config import load_config, SOCConfig, activate_catalog, get_table_path, get_checkpoint_path, is_agent_enabled
from llm_client import SOCLLMClient, LLMResponse, LLMBudgetExhausted, LLMAllEndpointsFailed
from sql_safe import (
    QueryBuilder, SafeQuery, safe_identifier, safe_value, safe_in_list,
    build_insert, build_update,
)
from delta_helpers import (
    safe_append, safe_merge, safe_overwrite_partition,
    ensure_table_exists, optimize_table, vacuum_table,
    streaming_append, streaming_foreach_batch, add_metadata_columns,
)
from monitoring import Monitor, create_audit_table
from secrets import SecretsManager, SecretNotFound, KNOWN_SECRETS
from sdp_stream import create_sdp_stream, create_sdp_stream_with_fallback, SDPStreamConfig

# COMMAND ----------

# Initialize core services
cfg = load_config(dbutils, spark)
activate_catalog(spark, cfg)

mon = Monitor(spark, cfg)
mon.log_start()

secrets_mgr = SecretsManager(dbutils, cfg.secret_scope)

llm = SOCLLMClient(cfg)


def qb(table: str) -> QueryBuilder:
    """Convenience factory for QueryBuilder with catalog/schema pre-filled."""
    return QueryBuilder(table, catalog=cfg.catalog, schema=cfg.schema)


def require_enabled(agent_name: str):
    """
    Gate check: exit immediately if this agent is disabled in agent_configs.
    Call at the top of any agent notebook after bootstrap:
        require_enabled("triage")
    """
    if not is_agent_enabled(spark, cfg, agent_name):
        msg = f"Agent '{agent_name}' is disabled in agent_configs. Skipping execution."
        mon.log_event("agent_disabled_skip", {"agent": agent_name})
        mon.log_complete(details={"status": "skipped", "reason": "disabled_in_control_plane"})
        import json
        dbutils.notebook.exit(json.dumps({"status": "skipped", "reason": f"{agent_name} disabled"}))


# COMMAND ----------

# MAGIC %md
# MAGIC ## Available After Bootstrap
# MAGIC
# MAGIC | Variable | Type | Purpose |
# MAGIC |----------|------|---------|
# MAGIC | `cfg` | `SOCConfig` | All configuration values |
# MAGIC | `llm` | `SOCLLMClient` | LLM calls with retry/fallback |
# MAGIC | `mon` | `Monitor` | Audit logging and timing |
# MAGIC | `secrets_mgr` | `SecretsManager` | Secret access |
# MAGIC | `qb(table)` | `QueryBuilder` | Safe SQL construction |
# MAGIC
# MAGIC ### Helper Functions
# MAGIC | Function | Purpose |
# MAGIC |----------|---------|
# MAGIC | `get_table_path(cfg, "table")` | Full 3-part table name |
# MAGIC | `get_checkpoint_path(cfg, "stream")` | Checkpoint location |
# MAGIC | `create_sdp_stream(spark, secrets_mgr, cfg, group, ...)` | ZeroBus Kafka stream (sub-second) |
# MAGIC | `create_sdp_stream_with_fallback(...)` | ZeroBus with Delta fallback |
# MAGIC | `safe_append(df, table, ...)` | Safe Delta append |
# MAGIC | `safe_merge(spark, df, table, keys, ...)` | Safe MERGE/UPSERT |
# MAGIC | `streaming_append(df, table, ckpt, ...)` | Streaming write |
# MAGIC | `build_insert(table, cols, vals, ...)` | Safe INSERT SQL |
# MAGIC | `build_update(table, set, where, ...)` | Safe UPDATE SQL |
