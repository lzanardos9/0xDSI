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

# Canonical detection-signal shape. Every detection lens the Unified Evidence
# Object builder (correlation/09) harvests is projected onto EXACTLY this
# ordered set of columns before the lenses are combined. The builder never
# reaches into a lens's private column names anywhere else, and it unions the
# lenses by name — so a lens that renames one of its own columns fails this
# projection loudly (logged, one lens skipped) instead of silently dropping its
# whole contribution to every downstream decision.
DETECTION_SIGNAL_COLUMNS = (
    "source_alert_id",   # id of the originating row in the lens's own table
    "entity_ref",        # who/what the signal is about (resolved to entity spine)
    "signal_class",      # one of DETECTION_SIGNAL_CLASSES
    "signal_source",     # logical name of the producing engine
    "raw_score",         # DOUBLE in 0..1 (confidence / severity)
    "signal_timestamp",  # event-time the signal was produced
    "source_event_ids",  # ARRAY<STRING> raw event lineage (nullable)
    "explanation",       # human-readable one-line summary
)

# The signal classes the evidence builder understands. A lens emitting anything
# outside this set will not contribute to a presence flag downstream.
DETECTION_SIGNAL_CLASSES = (
    "cep",
    "cet",
    "graph",
    "negative_correlation",
    "ks_recall",
    "slm_classification",
    "formula_score",
    "behavioral_anomaly",
    "threat_intel",
)

# Canonical shape of the cep_pattern_matches table — the CEP boundary where a
# complex-event/correlation producer hands a match to the Unified Evidence Object
# builder (correlation/09). This table historically had THREE disagreeing shapes
# (the setup DDL, what streaming_correlation_engine wrote, and what the UEO lens
# read), and the producer explicitly dropped event_ids + MITRE — destroying event
# lineage and technique attribution at the boundary (REV2-B4). Every CEP producer
# MUST write at least these columns, and the UEO CEP lens reads only these.
CEP_PATTERN_MATCH_COLUMNS = (
    "id",              # source_alert_id
    "entity_id",       # resolved entity the match is about (entity_ref)
    "pattern_name",    # human name of the rule/pattern (entity_ref fallback + explanation)
    "confidence",      # DOUBLE 0..1 (raw_score)
    "severity",        # STRING
    "matched_at",      # TIMESTAMP (signal_timestamp)
    "event_ids",       # ARRAY<STRING> raw event lineage — MUST survive to the UEO
    "mitre_tactic",    # STRING technique attribution — MUST survive to the UEO
    "mitre_technique",  # STRING
    "rule_id",         # STRING lineage back to the rule
)

# Fields a CEP producer must NOT strip before writing cep_pattern_matches. The
# regression asserts no producer drops these (the exact bug B4 fixed).
CEP_LINEAGE_FIELDS = ("event_ids", "mitre_tactic", "mitre_technique")
