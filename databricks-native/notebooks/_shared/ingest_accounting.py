# Databricks notebook source
# MAGIC %md
# MAGIC # Ingestion Accounting
# MAGIC
# MAGIC Every record pulled from a source in a micro-batch must end up in exactly
# MAGIC one place: written to Bronze, or quarantined. A record that is neither is
# MAGIC a silent drop — the failure mode behind REV2-21 ("ingestion drops tail
# MAGIC events"). This module makes drops impossible to hide:
# MAGIC
# MAGIC * ``reconcile`` proves, per batch, that received == written + quarantined,
# MAGIC   and reports any ``unaccounted`` remainder instead of swallowing it.
# MAGIC * ``build_accounting_row`` turns that reconciliation into a durable ledger
# MAGIC   row, so the received/written/quarantined counts survive a restart rather
# MAGIC   than living only in in-memory counters that reset to zero.
# MAGIC
# MAGIC Pure and stdlib-only, so notebooks import it on a cluster and the offline
# MAGIC property tests exercise the exact shipped logic without a Spark session.

# COMMAND ----------

# Ledger schema version. Bump when the accounting row shape changes so old and
# new rows in the ledger table can be told apart.
ACCOUNTING_SCHEMA_VERSION = "1.0.0"

# Reason attached to records that reach the ingestion sink classified as neither
# valid nor corrupt. They are routed to quarantine rather than dropped, so the
# batch still balances and an operator can inspect why they fell through.
UNCLASSIFIED_REASON = "unclassified_no_bucket"


def reconcile(received, valid, quarantined):
    """Account for every record in a micro-batch.

    Args:
        received:    count of records read from the source for this batch.
        valid:       count written to the Bronze events table.
        quarantined: count written to the dead-letter / quarantine table.

    Returns a dict::

        {
          "received": int, "valid": int, "quarantined": int,
          "unaccounted": int,   # received - valid - quarantined
          "balanced": bool,     # True iff nothing was dropped or over-counted
        }

    ``unaccounted`` > 0 means records were silently lost (a real drop).
    ``unaccounted`` < 0 means more were written than read (double-count / bug).
    Either way ``balanced`` is False and the caller must surface it, never
    swallow it. Negative inputs are themselves a contract violation and force
    ``balanced`` False.
    """
    received = int(received)
    valid = int(valid)
    quarantined = int(quarantined)

    unaccounted = received - valid - quarantined
    inputs_sane = received >= 0 and valid >= 0 and quarantined >= 0
    balanced = inputs_sane and unaccounted == 0

    return {
        "received": received,
        "valid": valid,
        "quarantined": quarantined,
        "unaccounted": unaccounted,
        "balanced": balanced,
    }


def build_accounting_row(batch_id, source_type, received, valid, quarantined):
    """Build a durable ledger row for one ingestion micro-batch.

    Carries the reconciliation result plus enough lineage (batch id, source,
    schema version) to audit ingestion after the fact. The caller adds the
    write timestamp (server-side ``current_timestamp()``), which is why it is
    not set here — keeping this function pure and unit-testable."""
    acct = reconcile(received, valid, quarantined)
    return {
        "batch_id": str(batch_id),
        "source_type": str(source_type),
        "received": acct["received"],
        "valid": acct["valid"],
        "quarantined": acct["quarantined"],
        "unaccounted": acct["unaccounted"],
        "balanced": acct["balanced"],
        "schema_version": ACCOUNTING_SCHEMA_VERSION,
    }
