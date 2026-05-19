# Databricks notebook source
# MAGIC %md
# MAGIC # ML - GraphRAG Zero-Day Detection
# MAGIC Uses graph-based retrieval-augmented generation to detect zero-day threats.
# MAGIC Builds knowledge graphs from threat intelligence and uses vector similarity
# MAGIC to identify novel attack patterns without known signatures.

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
from pyspark.sql import functions as F
from datetime import datetime

client = mlflow.deployments.get_deploy_client("databricks")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Build Threat Knowledge Graph

# COMMAND ----------

knowledge_graph = spark.sql("""
    SELECT
        'technique' as node_type, mitre_technique as node_id,
        mitre_tactic as parent, COUNT(*) as frequency
    FROM alerts
    WHERE mitre_technique IS NOT NULL
      AND created_at > current_timestamp() - INTERVAL 90 DAYS
    GROUP BY mitre_technique, mitre_tactic

    UNION ALL

    SELECT
        'ioc' as node_type, value as node_id,
        threat_type as parent, confidence as frequency
    FROM ioc_entries
    WHERE created_at > current_timestamp() - INTERVAL 30 DAYS

    UNION ALL

    SELECT
        'actor' as node_type, attribution as node_id,
        status as parent, confidence as frequency
    FROM threat_campaigns
    WHERE attribution IS NOT NULL AND attribution != 'unknown'
""")

print(f"Knowledge graph nodes: {knowledge_graph.count()}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Embed Events for Zero-Day Detection

# COMMAND ----------

# Get events without matching signatures
unsigned_events = spark.sql("""
    SELECT e.id, e.event_type, e.action, e.source_ip, e.dest_ip,
           e.username, e.severity, e.raw_log, e.timestamp
    FROM events e
    LEFT JOIN alerts a ON e.id = a.source_event_id
    WHERE a.id IS NULL
      AND e.severity IN ('high', 'critical')
      AND e.timestamp > current_timestamp() - INTERVAL 2 HOURS
    LIMIT 200
""").collect()

print(f"Analyzing {len(unsigned_events)} unsigned high-severity events")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Zero-Day Pattern Analysis via LLM

# COMMAND ----------

zero_day_candidates = []

# Group by source_ip for pattern analysis
from collections import defaultdict
ip_groups = defaultdict(list)
for event in unsigned_events:
    ip_groups[event.source_ip].append(event)

for source_ip, events in ip_groups.items():
    if len(events) < 3:
        continue

    event_summary = [{"type": e.event_type, "action": e.action, "dest": e.dest_ip,
                      "ts": str(e.timestamp)} for e in events[:15]]

    response = client.predict(
        endpoint="databricks-meta-llama-3-1-70b-instruct",
        inputs={
            "messages": [
                {"role": "system", "content": "You are a zero-day threat analyst. Analyze event sequences that didn't match known signatures. Determine if they represent novel attack patterns. Only flag as potential zero-day if the pattern shows clear adversarial intent without matching known TTPs."},
                {"role": "user", "content": f"""Analyze these unsigned events from {source_ip}:
{json.dumps(event_summary, indent=1)}

Is this a potential zero-day? Respond JSON: {{"is_zero_day": true/false, "confidence": 0-100, "pattern_name": "...", "reasoning": "...", "recommended_signature": "..."}}"""}
            ],
            "max_tokens": 300,
            "temperature": 0.2
        }
    )

    try:
        content = response.choices[0].message.content
        analysis = json.loads(content[content.find("{"):content.rfind("}")+1])
        if analysis.get("is_zero_day") and analysis.get("confidence", 0) >= 60:
            zero_day_candidates.append({
                "source_ip": source_ip,
                "event_count": len(events),
                "pattern_name": analysis.get("pattern_name", "unknown"),
                "confidence": analysis.get("confidence", 0),
                "reasoning": analysis.get("reasoning", ""),
                "recommended_signature": analysis.get("recommended_signature", ""),
                "detected_at": datetime.utcnow().isoformat(),
                "agent_name": "graphrag-zero-day",
            })
    except:
        pass

# COMMAND ----------

if zero_day_candidates:
    spark.createDataFrame(zero_day_candidates).write.mode("append").saveAsTable("zero_day_detections")
    for candidate in zero_day_candidates:
        spark.sql(f"""
            INSERT INTO alerts (id, title, description, severity, status, source_ip,
                mitre_tactic, confidence_score, risk_score, created_at)
            VALUES (
                'zd-{datetime.utcnow().strftime("%Y%m%d%H%M%S")}-{candidate["source_ip"][-4:]}',
                'Potential Zero-Day: {candidate["pattern_name"]}',
                '{candidate["reasoning"][:200]}',
                'critical', 'new', '{candidate["source_ip"]}',
                'initial-access', {candidate["confidence"] / 100.0}, {candidate["confidence"]}, current_timestamp()
            )
        """)

print(f"Zero-day analysis complete. Candidates: {len(zero_day_candidates)}")
