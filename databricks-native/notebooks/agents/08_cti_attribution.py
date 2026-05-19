# Databricks notebook source
# MAGIC %md
# MAGIC # Agent 08 - CTI Attribution Agent
# MAGIC Maps observed TTPs to known threat actor groups using Foundation Models
# MAGIC and the MITRE ATT&CK knowledge base. Produces attribution confidence scores.

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
# MAGIC ## Gather Unattributed Campaigns

# COMMAND ----------

unattributed = spark.sql("""
    SELECT tc.*,
           COLLECT_SET(a.mitre_tactic) as observed_tactics,
           COLLECT_SET(a.mitre_technique) as observed_techniques,
           COLLECT_SET(i.value) as iocs,
           COUNT(DISTINCT a.id) as alert_count
    FROM threat_campaigns tc
    LEFT JOIN campaign_alerts ca ON tc.id = ca.campaign_id
    LEFT JOIN alerts a ON ca.alert_id = a.id
    LEFT JOIN campaign_iocs ci ON tc.id = ci.campaign_id
    LEFT JOIN ioc_entries i ON ci.ioc_id = i.id
    WHERE tc.attribution IS NULL OR tc.attribution = 'unknown'
    GROUP BY tc.id, tc.name, tc.description, tc.first_seen, tc.last_seen,
             tc.status, tc.attribution, tc.confidence
    HAVING COUNT(DISTINCT a.id) >= 3
    ORDER BY tc.last_seen DESC
    LIMIT 10
""").collect()

print(f"Found {len(unattributed)} campaigns needing attribution")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Attribution via Foundation Model

# COMMAND ----------

KNOWN_THREAT_ACTORS = [
    "APT28 (Fancy Bear)", "APT29 (Cozy Bear)", "APT41 (Double Dragon)",
    "Lazarus Group", "Sandworm", "Turla", "FIN7", "FIN11",
    "Hafnium", "Nobelium", "DarkSide", "REvil", "Conti",
    "LockBit", "BlackCat (ALPHV)", "Scattered Spider",
    "Volt Typhoon", "Storm-0558", "Midnight Blizzard",
    "Kimsuky", "MuddyWater", "OilRig (APT34)",
]

def attribute_campaign(campaign):
    prompt = f"""Analyze these TTPs and IOCs to attribute this campaign to a known threat actor.

Campaign: {campaign.name}
Description: {campaign.description}
First Seen: {campaign.first_seen}
Observed Tactics: {campaign.observed_tactics}
Observed Techniques: {campaign.observed_techniques}
IOCs: {campaign.iocs[:20]}
Alert Count: {campaign.alert_count}

Known Threat Actors: {json.dumps(KNOWN_THREAT_ACTORS)}

Provide attribution analysis:
1. Primary attribution (most likely threat actor)
2. Secondary attribution (alternative hypothesis)
3. Confidence score (0-100)
4. Key evidence supporting attribution
5. Diamond Model assessment (adversary, capability, infrastructure, victim)

Respond in JSON: {{"primary": "...", "secondary": "...", "confidence": N, "evidence": [...], "diamond_model": {{...}}}}"""

    response = client.predict(
        endpoint="databricks-meta-llama-3-1-70b-instruct",
        inputs={
            "messages": [
                {"role": "system", "content": "You are a Cyber Threat Intelligence analyst specializing in adversary attribution. Use TTP overlap, infrastructure reuse, victimology, and timing to attribute campaigns. Be rigorous - only attribute with high confidence when multiple indicators align."},
                {"role": "user", "content": prompt}
            ],
            "max_tokens": 800,
            "temperature": 0.2
        }
    )

    try:
        content = response.choices[0].message.content
        start = content.find("{")
        end = content.rfind("}") + 1
        return json.loads(content[start:end])
    except:
        return {"primary": "unknown", "secondary": "unknown", "confidence": 0, "evidence": [], "diamond_model": {}}

# COMMAND ----------

# MAGIC %md
# MAGIC ## Execute Attribution

# COMMAND ----------

attribution_results = []

for campaign in unattributed:
    try:
        attribution = attribute_campaign(campaign)

        result = {
            "campaign_id": campaign.id,
            "primary_attribution": attribution.get("primary", "unknown"),
            "secondary_attribution": attribution.get("secondary", "unknown"),
            "confidence": attribution.get("confidence", 0),
            "evidence": json.dumps(attribution.get("evidence", [])),
            "diamond_model": json.dumps(attribution.get("diamond_model", {})),
            "attributed_at": datetime.utcnow().isoformat(),
            "agent_name": "cti-attribution",
        }
        attribution_results.append(result)

        if attribution.get("confidence", 0) >= 60:
            spark.sql(f"""
                UPDATE threat_campaigns
                SET attribution = '{attribution.get("primary", "unknown")}',
                    confidence = {attribution.get("confidence", 0)},
                    updated_at = current_timestamp()
                WHERE id = '{campaign.id}'
            """)

    except Exception as e:
        print(f"Error attributing campaign {campaign.id}: {e}")

print(f"Attributed {len(attribution_results)} campaigns")

# COMMAND ----------

if attribution_results:
    attr_df = spark.createDataFrame(attribution_results)
    attr_df.write.mode("append").saveAsTable("campaign_attributions")
