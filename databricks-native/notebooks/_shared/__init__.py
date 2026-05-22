# Databricks notebook source
# MAGIC %md
# MAGIC # 0xDSI Shared Utilities
# MAGIC Single import point for all shared modules.
# MAGIC
# MAGIC ## Quick Start
# MAGIC ```python
# MAGIC # At the top of every notebook:
# MAGIC %run ./_shared/bootstrap
# MAGIC ```
# MAGIC
# MAGIC ## Individual imports (when you need specific components):
# MAGIC ```python
# MAGIC from _shared.config import load_config, SOCConfig
# MAGIC from _shared.llm_client import SOCLLMClient, LLMResponse
# MAGIC from _shared.sql_safe import QueryBuilder, safe_value, safe_identifier
# MAGIC from _shared.delta_helpers import safe_append, safe_merge, streaming_append
# MAGIC from _shared.monitoring import Monitor, create_audit_table
# MAGIC from _shared.secrets import SecretsManager, KNOWN_SECRETS
# MAGIC ```
