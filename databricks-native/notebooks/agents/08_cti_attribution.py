# Databricks notebook source
# MAGIC %md
# MAGIC # Agent 08 - CTI Attribution
# MAGIC Maps unattributed threat campaigns to known threat actors using LLM analysis
# MAGIC of TTPs, IOCs, and target profiles. Produces Diamond Model assessments.

# COMMAND ----------

# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

import json
from datetime import datetime, timezone
from pyspark.sql import functions as F
from pyspark.sql.types import StructType, StructField, StringType, TimestampType, FloatType

# COMMAND ----------

# MAGIC %md
# MAGIC ## Configuration and Table Setup

# COMMAND ----------

AGENT_NAME = "cti_attribution"
AGENT_VERSION = "1.0.0"
BATCH_SIZE = 15

threat_campaigns_table = cfg.get_table_path("threat_campaigns")
threat_actors_table = cfg.get_table_path("threat_actors")
iocs_table = cfg.get_table_path("iocs")
attribution_results_table = cfg.get_table_path("attribution_results")

# COMMAND ----------

spark.sql(f"""
    CREATE TABLE IF NOT EXISTS {attribution_results_table} (
        attribution_id STRING,
        campaign_id STRING,
        attributed_actor STRING,
        confidence_score FLOAT,
        diamond_adversary STRING,
        diamond_capability STRING,
        diamond_infrastructure STRING,
        diamond_victim STRING,
        ttp_overlap_json STRING,
        reasoning STRING,
        attributed_by STRING,
        attributed_at TIMESTAMP,
        status STRING
    )
""")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Retrieve Unattributed Campaigns

# COMMAND ----------

def get_unattributed_campaigns():
    """Query campaigns lacking threat actor attribution."""
    with mon.time("query_unattributed_campaigns"):
        campaigns_df = (
            qb()
            .table(threat_campaigns_table)
            .where("attributed_actor IS NULL OR attributed_actor = ''")
            .where("status = 'active'")
            .order_by("first_seen DESC")
            .limit(BATCH_SIZE)
            .execute()
        )
        count = campaigns_df.count()
        mon.log_event("unattributed_campaigns_retrieved", {"count": count})
        return campaigns_df

# COMMAND ----------

# MAGIC %md
# MAGIC ## Gather Intelligence for Attribution

# COMMAND ----------

def get_known_threat_actors():
    """Retrieve the catalog of known threat actors and their profiles."""
    with mon.time("query_threat_actors"):
        actors_df = (
            qb()
            .table(threat_actors_table)
            .where("status = 'active'")
            .execute()
        )
        return [row.asDict() for row in actors_df.collect()]

# COMMAND ----------

def get_campaign_iocs(campaign_id):
    """Retrieve IOCs associated with a campaign."""
    with mon.time("query_campaign_iocs"):
        iocs_df = (
            qb()
            .table(iocs_table)
            .where("campaign_id = :campaign_id", campaign_id=campaign_id)
            .execute()
        )
        return [row.asDict() for row in iocs_df.collect()]

# COMMAND ----------

# MAGIC %md
# MAGIC ## LLM Attribution Analysis

# COMMAND ----------

def build_attribution_prompt(campaign_data, campaign_iocs, known_actors):
    """Construct the LLM prompt for threat attribution via Diamond Model."""
    actors_summary = json.dumps(
        [{"name": a.get("actor_name"), "ttps": a.get("known_ttps"),
          "targets": a.get("typical_targets"), "infrastructure": a.get("known_infrastructure")}
         for a in known_actors[:20]],
        default=str, indent=2
    )[:4000]

    iocs_summary = json.dumps(campaign_iocs[:50], default=str, indent=2)[:2000]

    prompt = f"""You are a senior Cyber Threat Intelligence analyst performing threat attribution
using the Diamond Model framework.

Campaign Under Analysis:
- Campaign ID: {campaign_data.get('campaign_id', 'N/A')}
- Campaign Name: {campaign_data.get('campaign_name', 'N/A')}
- First Seen: {campaign_data.get('first_seen', 'N/A')}
- TTPs Observed: {campaign_data.get('observed_ttps', 'N/A')}
- Target Sectors: {campaign_data.get('target_sectors', 'N/A')}
- Target Regions: {campaign_data.get('target_regions', 'N/A')}
- Malware Families: {campaign_data.get('malware_families', 'N/A')}

Campaign IOCs ({len(campaign_iocs)} indicators):
{iocs_summary}

Known Threat Actors Database:
{actors_summary}

Perform attribution analysis using the Diamond Model. Consider:
1. TTP overlap with known actors (MITRE ATT&CK alignment)
2. Infrastructure reuse or similarity
3. Victimology patterns (sector, region targeting)
4. Malware family associations
5. Operational tempo and tradecraft consistency

Respond with JSON:
{{
    "attributed_actor": "Name of the most likely threat actor or 'unattributed' if confidence is too low",
    "confidence_score": 0.0 to 1.0,
    "diamond_model": {{
        "adversary": "Assessed threat actor identity and motivation",
        "capability": "Tools, malware, and techniques employed",
        "infrastructure": "C2 servers, domains, hosting providers used",
        "victim": "Targeted organizations, sectors, and regions"
    }},
    "ttp_overlap": [
        {{"technique_id": "T1xxx", "technique_name": "name", "shared_with": "actor_name"}}
    ],
    "alternative_candidates": [
        {{"actor": "name", "confidence": 0.0, "rationale": "brief reason"}}
    ],
    "reasoning": "Detailed explanation of attribution rationale"
}}"""
    return prompt

# COMMAND ----------

def perform_attribution(campaign_data, campaign_iocs, known_actors):
    """Use LLM to attribute a campaign to a threat actor."""
    with mon.time("llm_attribution_analysis"):
        prompt = build_attribution_prompt(campaign_data, campaign_iocs, known_actors)
        result = llm.extract_json(prompt)

        if not result or "attributed_actor" not in result:
            mon.log_event("llm_attribution_failed", {
                "campaign_id": campaign_data.get("campaign_id")
            })
            return None

        mon.log_event("llm_attribution_complete", {
            "campaign_id": campaign_data.get("campaign_id"),
            "attributed_actor": result.get("attributed_actor", "unattributed"),
            "confidence": result.get("confidence_score", 0.0)
        })
        return result

# COMMAND ----------

# MAGIC %md
# MAGIC ## Store Attribution Results

# COMMAND ----------

def store_attribution(campaign_id, attribution):
    """Persist the attribution result."""
    with mon.time("store_attribution"):
        now = datetime.now(timezone.utc)
        attribution_id = f"ATTR-{campaign_id}-{now.strftime('%Y%m%d%H%M%S')}"

        diamond = attribution.get("diamond_model", {})

        row_data = [(
            attribution_id,
            campaign_id,
            attribution.get("attributed_actor", "unattributed"),
            float(attribution.get("confidence_score", 0.0)),
            diamond.get("adversary", ""),
            diamond.get("capability", ""),
            diamond.get("infrastructure", ""),
            diamond.get("victim", ""),
            json.dumps(attribution.get("ttp_overlap", []), default=str),
            attribution.get("reasoning", ""),
            AGENT_NAME,
            now,
            "completed"
        )]

        schema = StructType([
            StructField("attribution_id", StringType(), False),
            StructField("campaign_id", StringType(), False),
            StructField("attributed_actor", StringType(), True),
            StructField("confidence_score", FloatType(), True),
            StructField("diamond_adversary", StringType(), True),
            StructField("diamond_capability", StringType(), True),
            StructField("diamond_infrastructure", StringType(), True),
            StructField("diamond_victim", StringType(), True),
            StructField("ttp_overlap_json", StringType(), True),
            StructField("reasoning", StringType(), True),
            StructField("attributed_by", StringType(), True),
            StructField("attributed_at", TimestampType(), True),
            StructField("status", StringType(), True),
        ])

        result_df = spark.createDataFrame(row_data, schema)
        result_df.write.mode("append").saveAsTable(attribution_results_table)

        mon.log_event("attribution_stored", {
            "attribution_id": attribution_id,
            "campaign_id": campaign_id
        })
        return attribution_id

# COMMAND ----------

def update_campaign_attribution(campaign_id, attribution):
    """Update the threat_campaigns table with the attribution."""
    with mon.time("update_campaign_attribution"):
        actor = attribution.get("attributed_actor", "unattributed")
        confidence = float(attribution.get("confidence_score", 0.0))

        # Only update if confidence meets minimum threshold
        if confidence < 0.4 or actor == "unattributed":
            mon.log_event("attribution_below_threshold", {
                "campaign_id": campaign_id,
                "confidence": confidence
            })
            return False

        campaign_df = (
            spark.read.table(threat_campaigns_table)
            .filter(F.col("campaign_id") == campaign_id)
            .withColumn("attributed_actor", F.lit(actor))
            .withColumn("attribution_confidence", F.lit(confidence))
            .withColumn("attributed_at", F.lit(datetime.now(timezone.utc)))
        )

        campaign_df.write.mode("overwrite").option(
            "replaceWhere", f"campaign_id = '{campaign_id}'"
        ).saveAsTable(threat_campaigns_table)

        mon.log_event("campaign_attribution_updated", {
            "campaign_id": campaign_id,
            "actor": actor,
            "confidence": confidence
        })
        return True

# COMMAND ----------

# MAGIC %md
# MAGIC ## Main Execution

# COMMAND ----------

def run():
    """Main execution loop for the CTI Attribution agent."""
    results = {
        "agent": AGENT_NAME,
        "version": AGENT_VERSION,
        "started_at": datetime.now(timezone.utc).isoformat(),
        "campaigns_analyzed": 0,
        "attributions_made": 0,
        "campaigns_updated": 0,
        "errors": []
    }

    try:
        # Load known threat actors once for all evaluations
        known_actors = get_known_threat_actors()
        results["known_actors_count"] = len(known_actors)

        if not known_actors:
            mon.log_event("no_threat_actors_in_database")
            results["status"] = "skipped"
            results["reason"] = "No known threat actors available for comparison"
            return results

        unattributed = get_unattributed_campaigns()
        campaign_list = unattributed.collect()
        results["total_unattributed"] = len(campaign_list)

        for campaign_row in campaign_list:
            campaign_data = campaign_row.asDict()
            campaign_id = campaign_data.get("campaign_id", "unknown")

            try:
                with mon.time(f"attribute_campaign_{campaign_id}"):
                    campaign_iocs = get_campaign_iocs(campaign_id)
                    attribution = perform_attribution(campaign_data, campaign_iocs, known_actors)

                    if attribution is None:
                        results["errors"].append(f"Attribution failed for {campaign_id}")
                        continue

                    store_attribution(campaign_id, attribution)
                    results["attributions_made"] += 1

                    if update_campaign_attribution(campaign_id, attribution):
                        results["campaigns_updated"] += 1

                    results["campaigns_analyzed"] += 1

            except Exception as campaign_err:
                mon.log_error(f"Error attributing campaign {campaign_id}", exception=campaign_err)
                results["errors"].append(f"{campaign_id}: {str(campaign_err)}")

        results["completed_at"] = datetime.now(timezone.utc).isoformat()
        results["status"] = "success"
        mon.log_complete(results)

    except Exception as e:
        results["status"] = "failed"
        results["error"] = str(e)
        mon.log_error("CTI Attribution agent failed", exception=e)

    return results

# COMMAND ----------

result = run()
dbutils.notebook.exit(json.dumps(result, default=str))
