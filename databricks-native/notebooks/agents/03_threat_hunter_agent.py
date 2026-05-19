# Databricks notebook source
# MAGIC %md
# MAGIC # Agent: Autonomous Threat Hunter (LLM-Powered)
# MAGIC Proactive hypothesis-driven threat hunting using analytics and intelligence.

# COMMAND ----------

dbutils.widgets.text("catalog", "soc_platform", "Catalog")
dbutils.widgets.text("schema", "agentic_soc", "Schema")
dbutils.widgets.text("model_endpoint", "databricks-meta-llama-3-1-70b-instruct", "LLM Endpoint")
dbutils.widgets.text("hunt_type", "intelligence", "Hunt Type (intelligence|analytics|entity)")

catalog = dbutils.widgets.get("catalog")
schema = dbutils.widgets.get("schema")
model_endpoint = dbutils.widgets.get("model_endpoint")
hunt_type = dbutils.widgets.get("hunt_type")

spark.sql(f"USE CATALOG `{catalog}`")
spark.sql(f"USE SCHEMA `{schema}`")

# COMMAND ----------

import json
from pyspark.sql.functions import *
from databricks.sdk import WorkspaceClient

w = WorkspaceClient()

# COMMAND ----------

# MAGIC %md
# MAGIC ## Hunting Hypotheses

# COMMAND ----------

HUNTER_PROMPT = """You are an autonomous threat hunter for the 0xDSI SOC platform.
Your mission is to proactively discover threats that evade detection rules.

Hunting methodologies:
1. Intelligence-driven: Hunt for known TTPs from active campaigns
2. Analytics-driven: Investigate statistical anomalies
3. Entity-driven: Deep-dive on suspicious entities

Given the current threat landscape and data, generate hunting queries.
Respond in JSON:
{
  "hypothesis": "Description of what you're hunting for",
  "queries": [
    {"description": "what this query checks", "sql": "SELECT ..."}
  ],
  "indicators_to_check": ["list of IOCs or patterns"],
  "mitre_techniques": ["T1xxx"],
  "priority": "high|medium|low"
}"""

# COMMAND ----------

# MAGIC %md
# MAGIC ## Intelligence-Driven Hunt

# COMMAND ----------

def intelligence_driven_hunt():
    """Hunt based on active threat campaigns."""
    campaigns = spark.sql("""
        SELECT name, threat_actor, mitre_techniques, target_sectors
        FROM threat_campaigns
        WHERE status = 'active'
        ORDER BY last_seen DESC
        LIMIT 5
    """).collect()

    hunts = []
    for campaign in campaigns:
        techniques = campaign.mitre_techniques or []
        for technique in techniques[:3]:
            results = spark.sql(f"""
                SELECT source_ip, user_id, COUNT(*) as event_count,
                       collect_set(event_type) as event_types
                FROM events
                WHERE timestamp > current_timestamp() - INTERVAL 24 HOURS
                AND (mitre_technique = '{technique}' OR event_type LIKE '%{technique.lower()}%')
                GROUP BY source_ip, user_id
                HAVING COUNT(*) > 3
            """).collect()

            if results:
                hunts.append({
                    "campaign": campaign.name,
                    "technique": technique,
                    "findings": len(results),
                    "sources": [r.source_ip for r in results if r.source_ip]
                })

    return hunts

# COMMAND ----------

# MAGIC %md
# MAGIC ## Analytics-Driven Hunt

# COMMAND ----------

def analytics_driven_hunt():
    """Hunt based on statistical anomalies."""
    anomalies = []

    # Rare event types (potential novel attacks)
    rare_events = spark.sql("""
        SELECT event_type, COUNT(*) as cnt, collect_set(source_ip) as sources
        FROM events
        WHERE timestamp > current_timestamp() - INTERVAL 24 HOURS
        GROUP BY event_type
        HAVING COUNT(*) BETWEEN 1 AND 5
        ORDER BY cnt ASC
    """).collect()

    for evt in rare_events[:10]:
        anomalies.append({
            "type": "rare_event",
            "event_type": evt.event_type,
            "count": evt.cnt,
            "sources": evt.sources[:5]
        })

    # Unusual time patterns
    off_hours = spark.sql("""
        SELECT user_id, COUNT(*) as off_hours_count,
               AVG(HOUR(timestamp)) as avg_hour
        FROM events
        WHERE timestamp > current_timestamp() - INTERVAL 7 DAYS
        AND (HOUR(timestamp) < 5 OR HOUR(timestamp) > 23)
        AND user_id IS NOT NULL
        GROUP BY user_id
        HAVING COUNT(*) > 20
        ORDER BY off_hours_count DESC
        LIMIT 10
    """).collect()

    for user in off_hours:
        anomalies.append({
            "type": "off_hours_activity",
            "user_id": user.user_id,
            "count": user.off_hours_count,
            "avg_hour": user.avg_hour
        })

    # DNS tunneling indicators (high unique subdomain count)
    dns_suspect = spark.sql("""
        SELECT dest_ip, COUNT(DISTINCT action) as unique_queries,
               COUNT(*) as total_queries
        FROM events
        WHERE event_type = 'dns_query'
        AND timestamp > current_timestamp() - INTERVAL 24 HOURS
        GROUP BY dest_ip
        HAVING COUNT(DISTINCT action) > 100
    """).collect()

    for dns in dns_suspect:
        anomalies.append({
            "type": "dns_tunneling_suspect",
            "dest_ip": dns.dest_ip,
            "unique_queries": dns.unique_queries,
            "total_queries": dns.total_queries
        })

    return anomalies

# COMMAND ----------

# MAGIC %md
# MAGIC ## Entity-Driven Hunt

# COMMAND ----------

def entity_driven_hunt():
    """Deep investigation of high-risk entities."""
    high_risk_users = spark.sql("""
        SELECT user_id, MAX(risk_score) as max_risk,
               COUNT(*) as anomaly_count
        FROM user_behavior_anomalies
        WHERE detected_at > current_timestamp() - INTERVAL 7 DAYS
        AND resolved = false
        GROUP BY user_id
        HAVING MAX(risk_score) > 70
        ORDER BY max_risk DESC
        LIMIT 5
    """).collect()

    findings = []
    for user in high_risk_users:
        activity = spark.sql(f"""
            SELECT event_type, COUNT(*) as cnt,
                   collect_set(source_ip) as ips,
                   collect_set(action) as actions
            FROM events
            WHERE user_id = '{user.user_id}'
            AND timestamp > current_timestamp() - INTERVAL 7 DAYS
            GROUP BY event_type
            ORDER BY cnt DESC
        """).collect()

        findings.append({
            "user_id": user.user_id,
            "risk_score": user.max_risk,
            "anomaly_count": user.anomaly_count,
            "activity_types": len(activity),
            "total_events": sum(a.cnt for a in activity),
            "unique_ips": len(set(ip for a in activity for ip in (a.ips or [])))
        })

    return findings

# COMMAND ----------

# MAGIC %md
# MAGIC ## Execute Hunt

# COMMAND ----------

print(f"Starting {hunt_type}-driven hunt...")

if hunt_type == "intelligence":
    findings = intelligence_driven_hunt()
elif hunt_type == "analytics":
    findings = analytics_driven_hunt()
elif hunt_type == "entity":
    findings = entity_driven_hunt()
else:
    findings = intelligence_driven_hunt() + analytics_driven_hunt()

print(f"Hunt complete. Findings: {len(findings)}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Generate Hunting Alerts

# COMMAND ----------

if findings:
    from pyspark.sql import Row

    alert_rows = []
    for f in findings:
        finding_type = f.get("type", f.get("campaign", "unknown"))
        alert_rows.append(Row(
            title=f"Threat Hunt Finding: {finding_type}",
            description=json.dumps(f)[:500],
            severity="high" if f.get("risk_score", 0) > 80 else "medium",
            status="new",
            source="threat_hunter_agent",
            confidence_score=0.7,
            mitre_tactic=f.get("technique", None)
        ))

    if alert_rows:
        alerts_df = spark.createDataFrame(alert_rows)
        alerts_df = (alerts_df
            .withColumn("id", expr("uuid()"))
            .withColumn("created_at", current_timestamp())
        )
        alerts_df.write.mode("append").saveAsTable("alerts")
        print(f"Generated {len(alert_rows)} hunting alerts")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Log Hunt Results

# COMMAND ----------

spark.sql(f"""
    INSERT INTO notebook_runs (id, notebook_path, status, started_at, completed_at, output)
    VALUES (uuid(), 'agents/03_threat_hunter', 'completed', current_timestamp(),
            current_timestamp(), map('hunt_type', '{hunt_type}', 'findings', '{len(findings)}'))
""")

print(f"Threat hunt ({hunt_type}) complete: {len(findings)} findings")
