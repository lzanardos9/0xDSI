# Databricks notebook source
# MAGIC %md
# MAGIC # Analytics 12 - Industry Threat Posture
# MAGIC
# MAGIC Computes the per-vertical threat counts behind the "All Industries" hub,
# MAGIC whose tiles previously showed hard-coded numbers. This notebook aggregates
# MAGIC `threat_campaigns` by `target_sectors` (plus their IOCs and techniques) into
# MAGIC one row per industry and writes `industry_threat_posture`, read by the
# MAGIC frontend via `/api/query/industry_threat_posture`.
# MAGIC
# MAGIC **Derived from:** `threat_campaigns` (target_sectors, status, confidence,
# MAGIC mitre_techniques, ioc_ids).

# COMMAND ----------

# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

import json
from collections import Counter

# COMMAND ----------

require_tables("threat_campaigns")
posture_table = cfg.get_table_path("industry_threat_posture")

# Maps the hub's 8 verticals to sector keywords matched against target_sectors.
INDUSTRIES = [
    ("telco", "Telecom", ["telecom", "telco", "5g", "mobile", "communication"]),
    ("manufacturing", "Manufacturing", ["manufactur", "industrial", "ot", "scada", "ics", "plc"]),
    ("healthcare", "Healthcare & Life Sciences", ["health", "medical", "pharma", "life science", "hospital"]),
    ("energy", "Energy & Utilities", ["energy", "utilit", "power", "grid", "oil", "gas", "nuclear"]),
    ("retail", "Retail & E-Commerce", ["retail", "commerce", "pos", "merchant", "shopping"]),
    ("aviation", "Aviation & Maritime", ["aviation", "maritime", "airline", "shipping", "transport", "aerospace"]),
    ("education", "Education", ["education", "academic", "universit", "school", "research"]),
    ("cpg", "Consumer Packaged Goods", ["consumer", "cpg", "food", "beverage", "packaged", "supply chain"]),
]

# COMMAND ----------

spark.sql(f"""
CREATE TABLE IF NOT EXISTS {posture_table} (
    id STRING DEFAULT uuid(),
    industry_id STRING,
    label STRING,
    threat_count BIGINT,
    critical_count BIGINT,
    active_campaigns BIGINT,
    ioc_count BIGINT,
    top_techniques STRING,
    top_actors STRING,
    calculated_at TIMESTAMP DEFAULT current_timestamp()
) USING DELTA
""")

# COMMAND ----------

campaigns_t = cfg.get_table_path("threat_campaigns")
campaigns = spark.sql(f"""
    SELECT name, threat_actor, status, confidence,
           mitre_techniques, target_sectors, ioc_ids
    FROM {campaigns_t}
""").collect()


def sectors_match(sectors, keywords):
    if not sectors:
        return False
    joined = " ".join(str(s).lower() for s in sectors)
    return any(k in joined for k in keywords)


rows = []
for industry_id, label, keywords in INDUSTRIES:
    matched = [c for c in campaigns if sectors_match(c["target_sectors"], keywords)]
    threat_count = len(matched)
    critical_count = sum(
        1 for c in matched
        if c["status"] == "active" and (c["confidence"] or 0) >= 0.8
    )
    active_campaigns = sum(1 for c in matched if c["status"] == "active")
    ioc_count = sum(len(c["ioc_ids"] or []) for c in matched)

    tech_counter = Counter()
    actor_counter = Counter()
    for c in matched:
        for t in (c["mitre_techniques"] or []):
            tech_counter[t] += 1
        if c["threat_actor"]:
            actor_counter[c["threat_actor"]] += 1
    top_techniques = [t for t, _ in tech_counter.most_common(5)]
    top_actors = [a for a, _ in actor_counter.most_common(5)]

    rows.append((
        industry_id, label, int(threat_count), int(critical_count),
        int(active_campaigns), int(ioc_count),
        json.dumps(top_techniques), json.dumps(top_actors),
    ))

# COMMAND ----------

# MAGIC %md
# MAGIC ## Persist (replace latest posture snapshot per industry)

# COMMAND ----------

cols = [
    "industry_id", "label", "threat_count", "critical_count",
    "active_campaigns", "ioc_count", "top_techniques", "top_actors",
]
df = spark.createDataFrame(rows, cols)

# Keep only the newest posture row per industry: clear then insert this batch.
spark.sql(f"DELETE FROM {posture_table}")
with mon.time("persist"):
    df.write.mode("append").saveAsTable(posture_table)

# COMMAND ----------

result = {
    "notebook": "12_industry_threat_posture",
    "status": "completed",
    "industries": len(rows),
    "total_threats": sum(r[2] for r in rows),
    "total_critical": sum(r[3] for r in rows),
}
mon.log_complete(details=result)
print(json.dumps(result, indent=2))
dbutils.notebook.exit(json.dumps(result))
