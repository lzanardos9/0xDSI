# Databricks notebook source
# MAGIC %md
# MAGIC # Agent 05 - Sage (Enrichment Agent)
# MAGIC Enriches alerts with threat intel cross-referencing, asset context, geo-IP,
# MAGIC and behavioral baselines. Uses Foundation Model APIs for intelligent summarization.

# COMMAND ----------

# MAGIC %md
# MAGIC ## Configuration

# COMMAND ----------

dbutils.widgets.text("catalog", "soc_platform", "Unity Catalog")
dbutils.widgets.text("schema", "agentic_soc", "Schema")

catalog = dbutils.widgets.get("catalog")
schema = dbutils.widgets.get("schema")

spark.sql(f"USE CATALOG {catalog}")
spark.sql(f"USE SCHEMA {schema}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Sage Enrichment Pipeline

# COMMAND ----------

from pyspark.sql import functions as F
from pyspark.sql.types import StringType, StructType, StructField, FloatType
import json

# Get unenriched alerts
unenriched = spark.sql("""
    SELECT a.*
    FROM alerts a
    LEFT JOIN alert_enrichments ae ON a.id = ae.alert_id
    WHERE ae.alert_id IS NULL
    AND a.created_at > current_timestamp() - INTERVAL 1 HOUR
    ORDER BY a.risk_score DESC
    LIMIT 50
""")

print(f"Found {unenriched.count()} unenriched alerts")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Threat Intel Cross-Reference

# COMMAND ----------

def enrich_with_threat_intel(alert_row):
    """Cross-reference alert IOCs against threat feed database."""
    ioc_matches = spark.sql(f"""
        SELECT ti.indicator_type, ti.value, ti.threat_type, ti.confidence,
               ti.source, ti.tags, ti.last_seen
        FROM ioc_entries ti
        WHERE ti.value IN ('{alert_row.source_ip}', '{alert_row.dest_ip}')
           OR ti.value LIKE '%{alert_row.source_ip}%'
        ORDER BY ti.confidence DESC
        LIMIT 10
    """).collect()
    return ioc_matches

# COMMAND ----------

# MAGIC %md
# MAGIC ## Asset Context Enrichment

# COMMAND ----------

def enrich_with_asset_context(alert_row):
    """Pull asset registry info for involved IPs/hosts."""
    assets = spark.sql(f"""
        SELECT asset_id, asset_name, asset_type, criticality, owner,
               department, location, os_type, last_seen
        FROM assets
        WHERE ip_address IN ('{alert_row.source_ip}', '{alert_row.dest_ip}')
           OR hostname = '{alert_row.hostname}'
        LIMIT 5
    """).collect()
    return assets

# COMMAND ----------

# MAGIC %md
# MAGIC ## Geo-IP and Network Context

# COMMAND ----------

def enrich_with_network_context(alert_row):
    """Get network topology and geo-IP context."""
    network = spark.sql(f"""
        SELECT source_ip, dest_ip, protocol, bytes_sent, bytes_received,
               source_country, dest_country, source_asn, dest_asn
        FROM network_flows
        WHERE (source_ip = '{alert_row.source_ip}' OR dest_ip = '{alert_row.dest_ip}')
          AND timestamp > current_timestamp() - INTERVAL 1 HOUR
        ORDER BY timestamp DESC
        LIMIT 20
    """).collect()
    return network

# COMMAND ----------

# MAGIC %md
# MAGIC ## Foundation Model Summarization

# COMMAND ----------

import mlflow.deployments

client = mlflow.deployments.get_deploy_client("databricks")

def generate_enrichment_summary(alert, ti_matches, assets, network):
    """Use Foundation Model to create human-readable enrichment summary."""

    context = {
        "alert": {
            "title": alert.title,
            "severity": alert.severity,
            "source_ip": alert.source_ip,
            "dest_ip": alert.dest_ip,
            "mitre_tactic": alert.mitre_tactic,
            "mitre_technique": alert.mitre_technique,
        },
        "threat_intel_matches": len(ti_matches),
        "ti_sources": [m.source for m in ti_matches[:5]],
        "asset_criticality": [a.criticality for a in assets],
        "network_countries": list(set([n.source_country for n in network] + [n.dest_country for n in network])),
    }

    response = client.predict(
        endpoint="databricks-meta-llama-3-1-70b-instruct",
        inputs={
            "messages": [
                {"role": "system", "content": "You are Sage, a security enrichment analyst. Provide concise enrichment summaries for SOC analysts. Include risk assessment, key findings, and recommended next steps."},
                {"role": "user", "content": f"Enrich this alert with context:\n{json.dumps(context, indent=2)}"}
            ],
            "max_tokens": 500,
            "temperature": 0.3
        }
    )

    return response.choices[0].message.content

# COMMAND ----------

# MAGIC %md
# MAGIC ## Execute Enrichment Pipeline

# COMMAND ----------

from datetime import datetime

enrichment_results = []

for row in unenriched.collect():
    try:
        ti_matches = enrich_with_threat_intel(row)
        assets = enrich_with_asset_context(row)
        network = enrich_with_network_context(row)

        summary = generate_enrichment_summary(row, ti_matches, assets, network)

        enrichment = {
            "alert_id": row.id,
            "enriched_at": datetime.utcnow().isoformat(),
            "threat_intel_hits": len(ti_matches),
            "asset_criticality": max([a.criticality for a in assets], default="unknown"),
            "geo_context": json.dumps(list(set([n.source_country for n in network]))),
            "network_flows_count": len(network),
            "llm_summary": summary,
            "enrichment_score": min(100, len(ti_matches) * 20 + len(assets) * 15 + len(network) * 2),
            "agent_name": "sage",
        }
        enrichment_results.append(enrichment)

    except Exception as e:
        print(f"Error enriching alert {row.id}: {e}")

print(f"Enriched {len(enrichment_results)} alerts")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Write Enrichments to Delta

# COMMAND ----------

if enrichment_results:
    enrichment_df = spark.createDataFrame(enrichment_results)
    enrichment_df.write.mode("append").saveAsTable("alert_enrichments")

    # Update agent status
    spark.sql("""
        MERGE INTO agent_status AS t
        USING (SELECT 'sage' as agent_id, current_timestamp() as last_run, 'active' as status) AS s
        ON t.agent_id = s.agent_id
        WHEN MATCHED THEN UPDATE SET last_run = s.last_run, status = s.status
        WHEN NOT MATCHED THEN INSERT (agent_id, last_run, status) VALUES (s.agent_id, s.last_run, s.status)
    """)

print("Sage enrichment pipeline complete")
