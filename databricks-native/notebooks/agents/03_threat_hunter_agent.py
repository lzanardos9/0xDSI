# Databricks notebook source
# MAGIC %md
# MAGIC # Agent 03: Autonomous Threat Hunter
# MAGIC
# MAGIC Proactive hypothesis-driven threat hunting using three strategies:
# MAGIC - Intelligence-driven (known campaign TTPs)
# MAGIC - Analytics-driven (statistical anomalies)
# MAGIC - Entity-driven (high-risk users/hosts)

# COMMAND ----------

# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

require_enabled("threat_hunter_agent")

# COMMAND ----------

dbutils.widgets.text("lookback_hours", "24", "Hunting window")
dbutils.widgets.text("max_hypotheses", "10", "Max hypotheses per run")

lookback_hours = int(dbutils.widgets.get("lookback_hours"))
max_hypotheses = int(dbutils.widgets.get("max_hypotheses"))

# COMMAND ----------

from pyspark.sql.functions import *
from pyspark.sql.types import *
import json

# COMMAND ----------

# MAGIC %md
# MAGIC ## Intelligence-Driven Hunting

# COMMAND ----------

events_table = cfg.get_table_path("events")
campaigns_table = cfg.get_table_path("threat_campaigns")
alerts_table = cfg.get_table_path("alerts")
hunts_table = cfg.get_table_path("threat_hunt_results")

spark.sql(f"""
    CREATE TABLE IF NOT EXISTS {hunts_table} (
        id STRING, hunt_type STRING, hypothesis STRING,
        findings STRING, evidence_count INT, risk_score INT,
        recommendation STRING, agent_name STRING, hunted_at TIMESTAMP
    ) USING DELTA
    TBLPROPERTIES ('delta.autoOptimize.optimizeWrite' = 'true')
""")

hunt_results = []

with mon.time("intel_driven_hunting"):
    try:
        active_campaigns = spark.sql(f"""
            SELECT name, techniques, indicators, description
            FROM {campaigns_table}
            WHERE status = 'active'
            LIMIT {max_hypotheses}
        """).collect()
    except Exception:
        active_campaigns = []

    for campaign in active_campaigns:
        techniques = campaign.techniques or ""
        query = (
            qb().select("COUNT(*) as cnt, collect_set(source_ip) as ips")
            .from_table(events_table)
            .where_raw(f"timestamp > current_timestamp() - INTERVAL {lookback_hours} HOURS")
            .where_raw(f"event_type LIKE '%{techniques.split(',')[0].strip().lower() if techniques else 'lateral'}%'")
            .build()
        )
        try:
            result = spark.sql(query).collect()[0]
            if result.cnt > 0:
                hunt_results.append({
                    "hunt_type": "intelligence_driven",
                    "hypothesis": f"Campaign '{campaign.name}' activity present",
                    "findings": f"Found {result.cnt} events matching campaign TTPs",
                    "evidence_count": result.cnt,
                    "risk_score": min(90, 50 + result.cnt),
                    "recommendation": "Investigate matching IPs for campaign indicators",
                })
        except Exception as e:
            mon.log_event("hunt_query_error", {"campaign": campaign.name, "error": str(e)[:100]})

# COMMAND ----------

# MAGIC %md
# MAGIC ## Analytics-Driven Hunting (Statistical Anomalies)

# COMMAND ----------

with mon.time("analytics_driven_hunting"):
    anomalies = spark.sql(f"""
        SELECT source_ip, COUNT(*) as event_count,
               COUNT(DISTINCT event_type) as unique_types,
               COUNT(DISTINCT dest_ip) as unique_dests
        FROM {events_table}
        WHERE timestamp > current_timestamp() - INTERVAL {lookback_hours} HOURS
          AND source_ip IS NOT NULL
        GROUP BY source_ip
        HAVING COUNT(*) > 100 AND COUNT(DISTINCT dest_ip) > 20
        ORDER BY COUNT(*) DESC
        LIMIT 5
    """).collect()

    for anomaly in anomalies:
        hunt_results.append({
            "hunt_type": "analytics_driven",
            "hypothesis": f"High-volume source {anomaly.source_ip} is scanning/exfiltrating",
            "findings": f"{anomaly.event_count} events to {anomaly.unique_dests} destinations",
            "evidence_count": anomaly.event_count,
            "risk_score": min(85, 40 + anomaly.unique_dests),
            "recommendation": "Check for lateral movement or data exfiltration",
        })

# COMMAND ----------

# MAGIC %md
# MAGIC ## Entity-Driven Hunting (High-Risk Users)

# COMMAND ----------

with mon.time("entity_driven_hunting"):
    try:
        high_risk_users = spark.sql(f"""
            SELECT user_id, risk_score, anomaly_type
            FROM {cfg.get_table_path("user_behavior_anomalies")}
            WHERE detected_at > current_timestamp() - INTERVAL {lookback_hours} HOURS
              AND risk_score >= 70
            ORDER BY risk_score DESC
            LIMIT 5
        """).collect()
    except Exception:
        high_risk_users = []

    for user in high_risk_users:
        event_query = (
            qb().select("COUNT(*) as cnt, COUNT(DISTINCT event_type) as types")
            .from_table(events_table)
            .where_eq("user_id", user.user_id)
            .where_raw(f"timestamp > current_timestamp() - INTERVAL {lookback_hours} HOURS")
            .build()
        )
        try:
            stats = spark.sql(event_query).collect()[0]
            hunt_results.append({
                "hunt_type": "entity_driven",
                "hypothesis": f"User {user.user_id} exhibiting anomalous behavior (score: {user.risk_score})",
                "findings": f"{stats.cnt} events across {stats.types} event types. Anomaly: {user.anomaly_type}",
                "evidence_count": stats.cnt,
                "risk_score": user.risk_score,
                "recommendation": "Review user activity timeline and check for insider threat indicators",
            })
        except Exception:
            pass

# COMMAND ----------

# MAGIC %md
# MAGIC ## LLM Hypothesis Generation

# COMMAND ----------

if hunt_results:
    with mon.time("llm_hypothesis"):
        try:
            summary = "\n".join(f"- {r['hypothesis']}: {r['findings']}" for r in hunt_results[:5])
            prompt = f"""Based on these threat hunting findings, generate a follow-up investigation recommendation:

{summary}

Respond with JSON:
{{"priority_finding": "most critical finding", "next_steps": ["step1", "step2"], "confidence": 0.0-1.0}}"""

            llm_response = llm.extract_json(prompt)
            if llm_response:
                mon.log_event("llm_hypothesis", llm_response)
        except Exception as e:
            mon.log_event("llm_hypothesis_error", {"error": str(e)[:200]})

# COMMAND ----------

# MAGIC %md
# MAGIC ## Persist Hunt Results

# COMMAND ----------

if hunt_results:
    schema = StructType([
        StructField("hunt_type", StringType()),
        StructField("hypothesis", StringType()),
        StructField("findings", StringType()),
        StructField("evidence_count", IntegerType()),
        StructField("risk_score", IntegerType()),
        StructField("recommendation", StringType()),
    ])

    df = (
        spark.createDataFrame(hunt_results, schema=schema)
        .withColumn("id", expr("uuid()"))
        .withColumn("agent_name", lit("threat_hunter"))
        .withColumn("hunted_at", current_timestamp())
    )
    df.write.mode("append").saveAsTable(hunts_table)

    # Generate alerts for high-risk findings
    high_risk = [r for r in hunt_results if r["risk_score"] >= 75]
    if high_risk:
        alert_schema = StructType([
            StructField("title", StringType()),
            StructField("description", StringType()),
            StructField("severity", StringType()),
            StructField("confidence_score", DoubleType()),
        ])
        alert_rows = [{
            "title": f"Threat Hunt: {r['hypothesis'][:80]}",
            "description": r["findings"][:300],
            "severity": "high" if r["risk_score"] < 85 else "critical",
            "confidence_score": r["risk_score"] / 100.0,
        } for r in high_risk]

        alert_df = (
            spark.createDataFrame(alert_rows, schema=alert_schema)
            .withColumn("id", expr("uuid()"))
            .withColumn("status", lit("new"))
            .withColumn("source", lit("threat_hunter_agent"))
            .withColumn("created_at", current_timestamp())
        )
        alert_df.write.mode("append").saveAsTable(alerts_table)

mon.log_complete(details={"hunts": len(hunt_results), "high_risk": len([r for r in hunt_results if r["risk_score"] >= 75])})
dbutils.notebook.exit(json.dumps({"status": "completed", "hunts": len(hunt_results)}))
