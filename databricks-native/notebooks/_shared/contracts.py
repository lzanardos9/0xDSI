# Databricks notebook source
# MAGIC %md
# MAGIC # 0xDSI Shared Contracts
# MAGIC Single source of truth for cross-boundary names that producers and
# MAGIC consumers must agree on: the public config API, the column names of
# MAGIC tables written by one component and read by another, and the identity /
# MAGIC execution-binding fields that keep separate runs from collapsing.
# MAGIC
# MAGIC Pure stdlib so it can be imported by the offline contract test as well as
# MAGIC by notebooks on a cluster. Declaring these here means drift shows up as a
# MAGIC failing test (`tests/contract/test_phase2_contracts.py`) instead of a
# MAGIC silent runtime mismatch.

# COMMAND ----------

# Public API that notebook and test consumers import from `config`. Renaming or
# removing any of these is a breaking contract change (see REV2-01).
CONFIG_PUBLIC_API = (
    "SOCConfig",
    "load_config",
    "activate_catalog",
    "get_table_path",
    "get_checkpoint_path",
    "is_agent_enabled",
)

# Canonical column names for tables that cross a component boundary. The DDL in
# notebooks/setup/01_create_catalog_schema.py is authoritative; every writer and
# reader (the backend API, the seed job, and the notebook loaders) must use
# exactly these names (see REV2-11).
TABLE_COLUMNS = {
    "system_settings": ("id", "key", "value", "category", "updated_at"),
}

# Column names that were previously used in some places for the same tables and
# must never reappear — they are the concrete drift this phase removed.
FORBIDDEN_COLUMN_ALIASES = {
    "system_settings": ("setting_key", "setting_value"),
}

# Execution / identity binding kernel (REV2-05). Every row a producer emits for
# a run — evidence, a finding, a triage result, a response action — must carry
# these fields so two distinct executions are never merged into one. Phases 5
# and 6 enforce and persist them; Phase 2 fixes the vocabulary so producers and
# consumers cannot disagree on what identifies an execution.
EXECUTION_IDENTITY_FIELDS = (
    "execution_id",   # unique id for a single producer invocation
    "run_id",         # id of the orchestrating job/notebook run
    "producer",       # logical name of the component that emitted the row
    "schema_version",  # contract version the row was written against
    "produced_at",    # event-time the row was emitted
)

# Current contract version. Bump when a breaking change to any contract above is
# made; producers stamp this into `schema_version`.
SCHEMA_VERSION = "2.0.0"
