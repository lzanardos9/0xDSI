# Databricks notebook source
# MAGIC %md
# MAGIC # Agent 24 - Threat Radar Agent
# MAGIC Fetches and analyzes external threat intelligence feeds.
# MAGIC Correlates external threats with internal telemetry to produce
# MAGIC actionable intelligence and early warning indicators.

# COMMAND ----------

dbutils.widgets.text("catalog", "soc_platform", "Unity Catalog")
dbutils.widgets.text("schema", "agentic_soc", "Schema")

catalog = dbutils.widgets.get("catalog")
schema = dbutils.widgets.get("schema")
spark.sql(f"USE CATALOG {catalog}")
spark.sql(f"USE SCHEMA {schema}")

# COMMAND ----------

import mlflow.deployments
import json
from datetime import datetime

client = mlflow.deployments.get_deploy_client("databricks")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Fetch Latest Threat Feeds

# COMMAND ----------

active_feeds = spark.sql("""
    SELECT id, feed_name, feed_url, feed_type, last_fetched,
           update_frequency_minutes
    FROM threat_feeds
    WHERE enabled = true
      AND (last_fetched IS NULL OR
           last_fetched < current_timestamp() - make_interval(0,0,0,0,0,update_frequency_minutes,0))
    ORDER BY last_fetched ASC NULLS FIRST
    LIMIT 10
""").collect()

print(f"Fetching {len(active_feeds)} threat feeds")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Process Feed Data

# COMMAND ----------

new_indicators = spark.sql("""
    SELECT i.*, tf.feed_name
    FROM ioc_entries i
    JOIN threat_feeds tf ON i.source = tf.feed_name
    WHERE i.created_at > current_timestamp() - INTERVAL 1 HOUR
      AND i.correlated = false
    ORDER BY i.confidence DESC
    LIMIT 100
""").collect()

print(f"Found {len(new_indicators)} new uncorrelated indicators")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Correlate with Internal Telemetry

# COMMAND ----------

correlation_hits = []

for indicator in new_indicators:
    if indicator.indicator_type == "ipv4":
        matches = spark.sql(f"""
            SELECT 'event' as match_type, id, timestamp, event_type, username
            FROM events
            WHERE (source_ip = '{indicator.value}' OR dest_ip = '{indicator.value}')
              AND timestamp > current_timestamp() - INTERVAL 7 DAYS
            LIMIT 10
        """).collect()
    elif indicator.indicator_type == "domain":
        matches = spark.sql(f"""
            SELECT 'dns_query' as match_type, id, timestamp, event_type, username
            FROM events
            WHERE action LIKE '%{indicator.value}%'
              AND timestamp > current_timestamp() - INTERVAL 7 DAYS
            LIMIT 10
        """).collect()
    else:
        matches = []

    if matches:
        correlation_hits.append({
            "ioc_id": indicator.id,
            "ioc_value": indicator.value,
            "ioc_type": indicator.indicator_type,
            "feed_name": indicator.feed_name,
            "match_count": len(matches),
            "match_details": json.dumps([{"type": m.match_type, "id": m.id, "user": m.username} for m in matches[:5]]),
            "correlated_at": datetime.utcnow().isoformat(),
            "agent_name": "threat-radar",
        })

        # Generate alert for confirmed IOC matches
        spark.sql(f"""
            INSERT INTO alerts (id, title, description, severity, status,
                source_ip, mitre_tactic, confidence_score, risk_score, created_at)
            VALUES (
                'tr-{indicator.id[:12]}',
                'Threat Intel Match: {indicator.indicator_type} from {indicator.feed_name}',
                'IOC {indicator.value} found in internal telemetry. {len(matches)} matches in last 7 days.',
                'high', 'new', 'command-and-control',
                {indicator.confidence / 100.0}, {min(95, indicator.confidence)}, current_timestamp()
            )
        """)

print(f"Found {len(correlation_hits)} IOC correlations with internal data")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Threat Landscape Analysis (LLM)

# COMMAND ----------

if new_indicators:
    indicator_summary = {}
    for ind in new_indicators[:50]:
        t = ind.threat_type or "unknown"
        indicator_summary[t] = indicator_summary.get(t, 0) + 1

    response = client.predict(
        endpoint="databricks-meta-llama-3-1-70b-instruct",
        inputs={
            "messages": [
                {"role": "system", "content": "You are a threat intelligence analyst. Summarize the current threat landscape based on incoming feed data."},
                {"role": "user", "content": f"""Analyze today's threat feed intake:
New indicators: {len(new_indicators)}
By threat type: {json.dumps(indicator_summary)}
Internal correlations: {len(correlation_hits)}
Top feeds: {list(set(i.feed_name for i in new_indicators[:20]))}

Provide: 1) Current threat level (1-10), 2) Top 3 active threats, 3) Recommended defensive actions"""}
            ],
            "max_tokens": 400,
            "temperature": 0.3
        }
    )

    landscape = {
        "analysis_date": datetime.utcnow().isoformat(),
        "new_indicators": len(new_indicators),
        "correlations_found": len(correlation_hits),
        "landscape_summary": response.choices[0].message.content,
        "agent_name": "threat-radar",
    }
    spark.createDataFrame([landscape]).write.mode("append").saveAsTable("threat_landscape_reports")

# COMMAND ----------

if correlation_hits:
    spark.createDataFrame(correlation_hits).write.mode("append").saveAsTable("ioc_correlations")

    # Mark IOCs as correlated
    for hit in correlation_hits:
        spark.sql(f"UPDATE ioc_entries SET correlated = true WHERE id = '{hit['ioc_id']}'")

spark.sql("""
    MERGE INTO agent_status AS t
    USING (SELECT 'threat-radar' as agent_id, current_timestamp() as last_run, 'active' as status) AS s
    ON t.agent_id = s.agent_id
    WHEN MATCHED THEN UPDATE SET last_run = s.last_run, status = s.status
    WHEN NOT MATCHED THEN INSERT (agent_id, last_run, status) VALUES (s.agent_id, s.last_run, s.status)
""")
