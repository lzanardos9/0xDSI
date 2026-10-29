# Databricks notebook source
# MAGIC %md
# MAGIC # Identity Datalake — Synthetic Source Snapshots
# MAGIC
# MAGIC Writes synthetic AD / Entra / Ping / Saviynt / Duo / app-local snapshots to
# MAGIC the identity landing path so the resolver has something to resolve before
# MAGIC real connectors are configured. Runs only when `seed_demo_data` is true.
# MAGIC Real feeds land in the same layout: `<provider>/accounts.jsonl` plus
# MAGIC `<provider>/manifest.json`.

# COMMAND ----------

dbutils.widgets.text("catalog", "soc_platform", "Unity Catalog Name")
dbutils.widgets.text("schema", "agentic_soc", "Schema Name")
dbutils.widgets.text("seed_demo_data", "false", "Seed demo data (true/false)")

catalog = dbutils.widgets.get("catalog")
schema = dbutils.widgets.get("schema")

if dbutils.widgets.get("seed_demo_data").strip().lower() != "true":
    dbutils.notebook.exit(f"Identity fixture seeding disabled for {catalog}.{schema} (seed_demo_data != true)")

# COMMAND ----------

import json
import os
import sys

sys.path.insert(0, os.path.abspath("../_shared"))
from identity_fixtures import ACCOUNTS, SOURCES, SNAPSHOT_AT

base = f"/Volumes/{catalog}/{schema}/landing/identity"

for provider, meta in SOURCES.items():
    rows = [a for a in ACCOUNTS if a["provider"] == provider]
    folder = f"{base}/{provider}"
    os.makedirs(folder, exist_ok=True)
    with open(f"{folder}/accounts.jsonl", "w") as fh:
        for r in rows:
            fh.write(json.dumps(r) + "\n")
    with open(f"{folder}/manifest.json", "w") as fh:
        json.dump({"provider": provider, "snapshot_at": SNAPSHOT_AT,
                   "snapshot_complete": meta["snapshot_complete"], "record_count": len(rows)}, fh)
    print(f"{provider}: {len(rows)} accounts -> {folder}")
