# Databricks notebook source
# MAGIC %md
# MAGIC # Agent 12 - Blue Team Agent
# MAGIC Validates blue-team detection coverage against MITRE ATT&CK matrix.
# MAGIC Identifies gaps in detection rules, measures mean-time-to-detect (MTTD),
# MAGIC and recommends new rules for uncovered techniques.

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
# MAGIC ## MITRE ATT&CK Coverage Analysis

# COMMAND ----------

mitre_coverage = spark.sql("""
    WITH all_techniques AS (
        SELECT DISTINCT mitre_technique, mitre_tactic
        FROM alerts
        WHERE mitre_technique IS NOT NULL
        UNION
        SELECT DISTINCT unnested.technique as mitre_technique, unnested.tactic as mitre_tactic
        FROM correlation_rules,
        LATERAL VIEW explode(from_json(mitre_mapping, 'array<struct<technique:string,tactic:string>>')) as unnested
    ),
    covered AS (
        SELECT DISTINCT mitre_technique
        FROM correlation_rules
        WHERE status = 'active'
    ),
    detected_last_30d AS (
        SELECT mitre_technique, COUNT(*) as detection_count,
               AVG(UNIX_TIMESTAMP(created_at) - UNIX_TIMESTAMP(
                   (SELECT MIN(timestamp) FROM events e WHERE e.source_ip = alerts.source_ip
                    AND e.timestamp > alerts.created_at - INTERVAL 1 HOUR)
               )) as avg_mttd_seconds
        FROM alerts
        WHERE created_at > current_timestamp() - INTERVAL 30 DAYS
        AND mitre_technique IS NOT NULL
        GROUP BY mitre_technique
    )
    SELECT at.mitre_technique, at.mitre_tactic,
           CASE WHEN c.mitre_technique IS NOT NULL THEN true ELSE false END as has_rule,
           COALESCE(d.detection_count, 0) as detections_30d,
           d.avg_mttd_seconds
    FROM all_techniques at
    LEFT JOIN covered c ON at.mitre_technique = c.mitre_technique
    LEFT JOIN detected_last_30d d ON at.mitre_technique = d.mitre_technique
    ORDER BY has_rule ASC, detections_30d ASC
""")

total_techniques = mitre_coverage.count()
covered_count = mitre_coverage.filter("has_rule = true").count()
coverage_pct = (covered_count / max(total_techniques, 1)) * 100

print(f"MITRE Coverage: {coverage_pct:.1f}% ({covered_count}/{total_techniques} techniques)")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Identify Coverage Gaps

# COMMAND ----------

gaps = mitre_coverage.filter("has_rule = false").collect()
print(f"Found {len(gaps)} uncovered techniques")

# Generate rule recommendations for top gaps
gap_recommendations = []

for gap in gaps[:10]:
    response = client.predict(
        endpoint="databricks-meta-llama-3-1-70b-instruct",
        inputs={
            "messages": [
                {"role": "system", "content": "You are a detection engineer. Write concise correlation rule descriptions for MITRE ATT&CK techniques."},
                {"role": "user", "content": f"Write a detection rule for MITRE technique {gap.mitre_technique} (tactic: {gap.mitre_tactic}). Include: rule name, detection logic (1-2 sentences), data sources needed, and false positive considerations. Keep it under 100 words."}
            ],
            "max_tokens": 200,
            "temperature": 0.3
        }
    )

    gap_recommendations.append({
        "technique": gap.mitre_technique,
        "tactic": gap.mitre_tactic,
        "recommendation": response.choices[0].message.content,
        "priority": "high" if gap.mitre_tactic in ["initial-access", "execution", "impact"] else "medium",
    })

# COMMAND ----------

# MAGIC %md
# MAGIC ## MTTD Analysis

# COMMAND ----------

mttd_stats = spark.sql("""
    SELECT mitre_tactic,
           COUNT(*) as total_detections,
           AVG(CASE WHEN avg_mttd_seconds IS NOT NULL THEN avg_mttd_seconds END) as avg_mttd,
           PERCENTILE(CASE WHEN avg_mttd_seconds IS NOT NULL THEN avg_mttd_seconds END, 0.95) as p95_mttd
    FROM (
        SELECT mitre_tactic, mitre_technique, avg_mttd_seconds
        FROM (
            SELECT mitre_tactic, mitre_technique,
                   AVG(UNIX_TIMESTAMP(created_at)) as avg_mttd_seconds
            FROM alerts
            WHERE created_at > current_timestamp() - INTERVAL 30 DAYS
            GROUP BY mitre_tactic, mitre_technique
        )
    )
    GROUP BY mitre_tactic
    ORDER BY avg_mttd DESC
""")

mttd_stats.show()

# COMMAND ----------

# MAGIC %md
# MAGIC ## Write Coverage Report

# COMMAND ----------

report = {
    "report_date": datetime.utcnow().isoformat(),
    "total_techniques_known": total_techniques,
    "techniques_with_rules": covered_count,
    "coverage_percentage": coverage_pct,
    "gap_count": len(gaps),
    "top_gap_recommendations": json.dumps(gap_recommendations),
    "agent_name": "blue-team",
}

report_df = spark.createDataFrame([report])
report_df.write.mode("append").saveAsTable("blue_team_reports")

spark.sql("""
    MERGE INTO agent_status AS t
    USING (SELECT 'blue-team' as agent_id, current_timestamp() as last_run, 'active' as status) AS s
    ON t.agent_id = s.agent_id
    WHEN MATCHED THEN UPDATE SET last_run = s.last_run, status = s.status
    WHEN NOT MATCHED THEN INSERT (agent_id, last_run, status) VALUES (s.agent_id, s.last_run, s.status)
""")

print(f"Blue Team report complete. Coverage: {coverage_pct:.1f}%")
