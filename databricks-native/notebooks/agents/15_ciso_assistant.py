# Databricks notebook source
# MAGIC %md
# MAGIC # Agent 15 - CISO Assistant (AI Security Advisor)
# MAGIC Executive-level AI assistant powered by Databricks Foundation Models + Genie.
# MAGIC Provides strategic security insights, risk posture analysis, and natural
# MAGIC language querying across the entire security data lake via Genie Spaces.

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
# MAGIC ## Security Data Lake Query Catalog
# MAGIC These queries form the knowledge base for the CISO Assistant.
# MAGIC In production, Databricks Genie Spaces handles ad-hoc NL2SQL queries
# MAGIC against the full Unity Catalog. This notebook precomputes key metrics
# MAGIC for low-latency responses.

# COMMAND ----------

# MAGIC %md
# MAGIC ### Risk Posture Metrics

# COMMAND ----------

risk_posture = spark.sql("""
    SELECT
        (SELECT COUNT(*) FROM alerts WHERE status = 'new' AND severity = 'critical') as critical_open,
        (SELECT COUNT(*) FROM alerts WHERE status = 'new' AND severity = 'high') as high_open,
        (SELECT COUNT(*) FROM cases WHERE status IN ('open', 'investigating')) as active_cases,
        (SELECT AVG(risk_score) FROM alerts WHERE created_at > current_timestamp() - INTERVAL 24 HOURS) as avg_risk_24h,
        (SELECT COUNT(DISTINCT source_ip) FROM events WHERE severity = 'critical' AND timestamp > current_timestamp() - INTERVAL 1 HOUR) as critical_sources_1h,
        (SELECT COUNT(*) FROM response_actions WHERE status = 'awaiting_approval') as pending_approvals,
        (SELECT COUNT(DISTINCT mitre_technique) FROM alerts WHERE created_at > current_timestamp() - INTERVAL 7 DAYS) as techniques_seen_7d,
        (SELECT COUNT(*) FROM user_behavior_anomalies WHERE risk_level = 'critical' AND detected_at > current_timestamp() - INTERVAL 24 HOURS) as critical_user_anomalies
""").collect()[0]

# COMMAND ----------

# MAGIC %md
# MAGIC ### Trend Analysis

# COMMAND ----------

trend_data = spark.sql("""
    SELECT
        DATE(created_at) as date,
        COUNT(*) as total_alerts,
        SUM(CASE WHEN severity = 'critical' THEN 1 ELSE 0 END) as critical,
        AVG(risk_score) as avg_risk,
        COUNT(DISTINCT mitre_tactic) as unique_tactics
    FROM alerts
    WHERE created_at > current_timestamp() - INTERVAL 30 DAYS
    GROUP BY DATE(created_at)
    ORDER BY date DESC
    LIMIT 30
""").collect()

# COMMAND ----------

# MAGIC %md
# MAGIC ### MITRE ATT&CK Heat Map

# COMMAND ----------

mitre_heat = spark.sql("""
    SELECT mitre_tactic, mitre_technique,
           COUNT(*) as detections,
           AVG(confidence_score) as avg_confidence
    FROM alerts
    WHERE created_at > current_timestamp() - INTERVAL 30 DAYS
    AND mitre_tactic IS NOT NULL
    GROUP BY mitre_tactic, mitre_technique
    ORDER BY detections DESC
    LIMIT 50
""").collect()

# COMMAND ----------

# MAGIC %md
# MAGIC ## Genie Integration Layer
# MAGIC Databricks Genie provides natural language to SQL translation over the
# MAGIC full security data lake. The CISO Assistant uses it for ad-hoc questions
# MAGIC that go beyond the precomputed metrics above.

# COMMAND ----------

def query_via_genie(question, context_metrics):
    """
    In production, this calls the Databricks Genie Spaces API for NL2SQL.
    Genie translates natural language to SQL over Unity Catalog tables,
    executes the query, and returns structured results.

    Architecture:
    1. User asks CISO Assistant a question
    2. CISO Assistant determines if precomputed metrics suffice
    3. If not, delegates to Genie for ad-hoc SQL generation
    4. Genie queries petabytes of security data in Delta Lake
    5. Results flow back to Foundation Model for synthesis
    """
    # Step 1: Use Foundation Model to plan the query approach
    planning_response = client.predict(
        endpoint="databricks-meta-llama-3-1-70b-instruct",
        inputs={
            "messages": [
                {"role": "system", "content": f"""You are a security data query planner. Given a question and available precomputed metrics, decide if you need additional SQL queries.

Available precomputed metrics:
- critical_open_alerts: {context_metrics.get('critical_open', 0)}
- high_open_alerts: {context_metrics.get('high_open', 0)}
- active_cases: {context_metrics.get('active_cases', 0)}
- avg_risk_24h: {context_metrics.get('avg_risk_24h', 0):.1f}
- critical_sources_1h: {context_metrics.get('critical_sources_1h', 0)}
- pending_approvals: {context_metrics.get('pending_approvals', 0)}
- techniques_seen_7d: {context_metrics.get('techniques_seen_7d', 0)}

Available tables: events, alerts, cases, correlation_rules, ioc_entries, threat_feeds,
user_behavior_anomalies, network_flows, assets, response_actions, threat_campaigns

If precomputed metrics suffice, respond with: {{"needs_query": false}}
If additional SQL is needed, respond with: {{"needs_query": true, "sql": "SELECT ..."}}"""},
                {"role": "user", "content": question}
            ],
            "max_tokens": 300,
            "temperature": 0.1
        }
    )

    plan = planning_response.choices[0].message.content
    additional_data = None

    try:
        plan_json = json.loads(plan[plan.find("{"):plan.rfind("}")+1])
        if plan_json.get("needs_query") and plan_json.get("sql"):
            # Execute the generated SQL (Genie NL2SQL in production)
            additional_data = spark.sql(plan_json["sql"]).limit(50).collect()
    except:
        pass

    return additional_data

# COMMAND ----------

# MAGIC %md
# MAGIC ## Generate Executive Briefing

# COMMAND ----------

def generate_executive_briefing():
    """Generate daily executive security briefing."""

    metrics = {
        "critical_open": risk_posture.critical_open,
        "high_open": risk_posture.high_open,
        "active_cases": risk_posture.active_cases,
        "avg_risk_24h": risk_posture.avg_risk_24h or 0,
        "critical_sources_1h": risk_posture.critical_sources_1h,
        "pending_approvals": risk_posture.pending_approvals,
        "techniques_seen_7d": risk_posture.techniques_seen_7d,
        "critical_user_anomalies": risk_posture.critical_user_anomalies,
    }

    trend_summary = [{"date": str(t.date), "total": t.total_alerts, "critical": t.critical}
                     for t in trend_data[:7]]

    top_techniques = [{"tactic": m.mitre_tactic, "technique": m.mitre_technique,
                       "count": m.detections} for m in mitre_heat[:10]]

    response = client.predict(
        endpoint="databricks-meta-llama-3-1-70b-instruct",
        inputs={
            "messages": [
                {"role": "system", "content": "You are the CISO Assistant for a large enterprise. Produce executive security briefings that are concise, actionable, and risk-focused. Use business language, not technical jargon. Highlight what changed, what needs attention, and what decisions are required."},
                {"role": "user", "content": f"""Generate today's executive security briefing.

Current Risk Posture:
{json.dumps(metrics, indent=2)}

7-Day Alert Trend:
{json.dumps(trend_summary, indent=2)}

Top MITRE Techniques Observed:
{json.dumps(top_techniques, indent=2)}

Structure:
1. Risk Level Assessment (Green/Yellow/Orange/Red)
2. Key Findings (top 3-5 bullet points)
3. Trending Threats (what's increasing)
4. Pending Decisions (items requiring CISO approval)
5. Recommended Actions (prioritized)"""}
            ],
            "max_tokens": 1500,
            "temperature": 0.3
        }
    )

    return response.choices[0].message.content

# COMMAND ----------

briefing = generate_executive_briefing()

briefing_record = {
    "briefing_date": datetime.utcnow().isoformat(),
    "briefing_content": briefing,
    "metrics_snapshot": json.dumps({
        "critical_open": risk_posture.critical_open,
        "high_open": risk_posture.high_open,
        "active_cases": risk_posture.active_cases,
        "avg_risk_24h": float(risk_posture.avg_risk_24h or 0),
    }),
    "agent_name": "ciso-assistant",
}

spark.createDataFrame([briefing_record]).write.mode("append").saveAsTable("executive_briefings")

print("CISO Assistant briefing generated")
print(briefing[:500] + "...")
