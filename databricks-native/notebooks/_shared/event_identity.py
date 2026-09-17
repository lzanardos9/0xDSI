# Databricks notebook source
# MAGIC %md
# MAGIC # 0xDSI Event Identity
# MAGIC
# MAGIC Single source of truth for a security event's stable, source-scoped id.
# MAGIC Every deployed path that persists or detects on a raw event derives the id
# MAGIC through `derive_event_id` so one physical source record resolves to ONE id
# MAGIC everywhere (Bronze ingestion, the realtime SDP stream, replay, and
# MAGIC investigation) and a replay of that record is not a new logical observation.

# COMMAND ----------

import logging

from pyspark.sql.functions import col, coalesce, sha2, concat_ws, lit

logger = logging.getLogger("oxdsi.event_identity")

# Namespace baked into every derived id. Bump only with a deliberate migration:
# changing it re-derives every non-native id and breaks joins to already-persisted
# Bronze rows.
IDENTITY_SCOPE = "0xdsi:v1"
IDENTITY_SEPARATOR = "||"


def derive_event_id(
    event_id_col,
    topic_col,
    partition_col,
    offset_col,
    payload_col,
    scope: str = IDENTITY_SCOPE,
):
    """Return a Column giving each event a stable, source-scoped id.

    Rules (identical on every path, which is the whole point of this helper):

    * A native ``event_id`` supplied by the producing connector always wins, so
      upstream correlation identity is preserved end to end.
    * Otherwise the id is a SHA-256 over the scope namespace, the transport
      coordinate (topic / partition / offset) and the raw payload. Two paths that
      read the SAME Kafka record therefore compute the SAME id and can be joined
      on ``id``; a redelivered record collapses onto its existing row under an
      idempotent MERGE instead of becoming a duplicate observation.
    * The payload is included so transports whose coordinate is degenerate (e.g.
      Autoloader files, which report partition/offset 0) still disambiguate
      distinct records, while byte-identical redeliveries stay idempotent.

    Callers MUST pass the same ``scope`` and semantically identical coordinate /
    payload columns on every path for the ids to line up.
    """
    return coalesce(
        event_id_col,
        sha2(
            concat_ws(
                IDENTITY_SEPARATOR,
                lit(scope),
                coalesce(topic_col.cast("string"), lit("")),
                coalesce(partition_col.cast("string"), lit("")),
                coalesce(offset_col.cast("string"), lit("")),
                coalesce(payload_col.cast("string"), lit("")),
            ),
            256,
        ),
    )


# Columns every raw-event writer must expose so downstream domain/hash detectors
# and the UEO evidence join have a stable, uniform shape regardless of source.
ENRICHMENT_COLUMNS = ("dest_domain", "url", "file_hash", "process_hash", "sha256")
