"""
Live driver for the entry-only E2E suite.

This turns a `Scenario` into real ingestion writes and real output assertions
against a Databricks workspace. It enforces the suite's contract at runtime, not
just structurally: `EntryWriter` refuses to write anywhere but an ingestion
surface, and `OutputReader` refuses to read anything but a published output
table. So even a buggy scenario cannot reach into the middle of the pipeline.

Spark and the platform config are imported lazily inside the functions that need
them, so this module imports cleanly with plain `python3` for the offline
contract check in `test_e2e_entry_only.py`.
"""

import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(__file__))

from scenarios import (  # noqa: E402
    ENTRY_SURFACES, OUTPUT_TABLES, Scenario, SCENARIOS, validate_suite,
)


class EntrySurfaceError(RuntimeError):
    """Raised when something tries to write outside the ingestion boundary."""


class OutputSurfaceError(RuntimeError):
    """Raised when an assertion tries to read a non-published table."""


class EntryWriter:
    """Writes scenario records to ingestion surfaces — and nowhere else.

    A landing_* record is dropped as a JSON file into the landing Volume zone so
    Autoloader ingests it exactly as a sensor's file would be picked up. A kafka
    record is produced to the configured topic. Any other surface raises before
    a single byte is written.
    """

    def __init__(self, spark, cfg, kafka_brokers=None):
        self.spark = spark
        self.cfg = cfg
        self.kafka_brokers = kafka_brokers
        self.landing_base = f"/Volumes/{cfg.catalog}/{cfg.schema}/landing"

    def write(self, record) -> None:
        if record.surface not in ENTRY_SURFACES:
            raise EntrySurfaceError(
                f"refusing to write to '{record.surface}': the harness may only "
                f"write to ingestion surfaces {sorted(ENTRY_SURFACES)}"
            )
        if record.surface == "kafka":
            self._produce_kafka(record)
        else:
            self._drop_file(record)

    def _drop_file(self, record) -> None:
        zone = os.path.basename(record.channel.strip("/"))
        path = f"{self.landing_base}/{zone}/e2e_{record.payload['probe']}_{int(time.time()*1000)}.json"
        # dbutils is ambient in a Databricks notebook; guarded so a plain driver
        # falls back to a normal file write against a mounted Volume path.
        body = json.dumps(record.payload)
        try:
            dbutils.fs.put(path, body, overwrite=True)  # noqa: F821
        except NameError:
            with open(path, "w", encoding="utf-8") as fh:
                fh.write(body)

    def _produce_kafka(self, record) -> None:
        if not self.kafka_brokers:
            raise EntrySurfaceError(
                "kafka entry requires kafka_brokers; none configured for this run"
            )
        df = self.spark.createDataFrame(
            [(record.payload["probe"], json.dumps(record.payload))],
            "key string, value string",
        )
        (df.write.format("kafka")
            .option("kafka.bootstrap.servers", self.kafka_brokers)
            .option("topic", record.channel)
            .save())


class OutputReader:
    """Reads published output tables — and only those — for assertions."""

    def __init__(self, spark, cfg):
        self.spark = spark
        self.cfg = cfg

    def count(self, table, where) -> int:
        if table not in OUTPUT_TABLES:
            raise OutputSurfaceError(
                f"refusing to read '{table}': assertions may only read published "
                f"outputs {sorted(OUTPUT_TABLES)}"
            )
        path = self.cfg.get_table_path(table)
        return self.spark.sql(
            f"SELECT COUNT(*) AS n FROM {path} WHERE {where}"
        ).first()["n"]


def run_scenario(spark, cfg, scenario: Scenario, *, kafka_brokers=None,
                 settle_seconds=90, poll_seconds=10) -> dict:
    """Drive one scenario end-to-end and return a structured result.

    Writes every entry at the ingestion boundary, then polls each expectation
    until it holds or the settle budget runs out — the pipeline is streaming, so
    outputs arrive asynchronously. Never reads or writes an intermediate table.
    """
    writer = EntryWriter(spark, cfg, kafka_brokers=kafka_brokers)
    reader = OutputReader(spark, cfg)

    for record in scenario.entries:
        writer.write(record)

    results = []
    deadline = time.time() + settle_seconds
    pending = list(scenario.expectations)
    while pending and time.time() < deadline:
        still = []
        for exp in pending:
            n = reader.count(exp.table, exp.where)
            ok = n >= exp.min_rows and (exp.max_rows is None or n <= exp.max_rows)
            if ok:
                results.append({"table": exp.table, "reason": exp.reason,
                                "rows": n, "passed": True})
            else:
                still.append(exp)
        pending = still
        if pending:
            time.sleep(poll_seconds)

    for exp in pending:  # timed out
        n = reader.count(exp.table, exp.where)
        results.append({
            "table": exp.table, "reason": exp.reason, "rows": n,
            "passed": False,
            "detail": f"expected >= {exp.min_rows}"
                      + (f" and <= {exp.max_rows}" if exp.max_rows is not None else "")
                      + f", got {n} within {settle_seconds}s",
        })

    return {
        "scenario": scenario.name,
        "passed": all(r["passed"] for r in results),
        "expectations": results,
    }


def run_suite(spark, cfg, scenarios=SCENARIOS, **kwargs) -> dict:
    """Run every scenario against a live workspace and summarise the outcome.

    Refuses to run a suite that violates the entry-only contract, so a malformed
    scenario is caught before it can touch the workspace.
    """
    problems = validate_suite(scenarios)
    if problems:
        raise EntrySurfaceError(
            "suite failed its entry-only contract; refusing to run:\n  - "
            + "\n  - ".join(problems)
        )
    outcomes = [run_scenario(spark, cfg, s, **kwargs) for s in scenarios]
    return {
        "total": len(outcomes),
        "passed": sum(1 for o in outcomes if o["passed"]),
        "failed": sum(1 for o in outcomes if not o["passed"]),
        "scenarios": outcomes,
    }
