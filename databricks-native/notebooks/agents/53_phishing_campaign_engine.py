# Databricks notebook source
# MAGIC %md
# MAGIC # Agent 53: Red Team Phishing Campaign Engine
# MAGIC ## AI-Powered Adversarial Phishing Simulation with Psychological Exploitation
# MAGIC
# MAGIC This agent orchestrates hyper-personalized phishing campaigns by correlating:
# MAGIC - Big Five personality traits & Dark Triad indicators from UEBA
# MAGIC - Cognitive bias susceptibility scores per user
# MAGIC - Threat actor TTP emulation (APT29, Lazarus, Scattered Spider, Fancy Bear, FIN7)
# MAGIC - Real-time stress levels and behavioral baselines

# COMMAND ----------

import json
import hashlib
from datetime import datetime, timedelta
from pyspark.sql import functions as F
from pyspark.sql.types import *

# COMMAND ----------

# MAGIC %md
# MAGIC ## Configuration

# COMMAND ----------

CATALOG = "security_lakehouse"
SCHEMA = "red_team"
UEBA_SCHEMA = "ueba"

THREAT_ACTORS = {
    "APT29": {
        "name": "Cozy Bear",
        "style": "sophisticated_spearphish",
        "preferred_biases": ["authority", "fear", "curiosity"],
        "lure_themes": ["government_briefing", "security_alert", "classified_intel"],
        "sophistication": 0.95
    },
    "LAZARUS": {
        "name": "Lazarus Group",
        "style": "recruitment_lure",
        "preferred_biases": ["curiosity", "flattery", "scarcity"],
        "lure_themes": ["job_offer", "exclusive_opportunity", "award_nomination"],
        "sophistication": 0.85
    },
    "SCATTERED_SPIDER": {
        "name": "Scattered Spider",
        "style": "it_helpdesk_impersonation",
        "preferred_biases": ["authority", "urgency", "social_proof"],
        "lure_themes": ["mfa_reset", "password_expiry", "it_maintenance"],
        "sophistication": 0.80
    },
    "FANCY_BEAR": {
        "name": "APT28",
        "style": "military_government",
        "preferred_biases": ["authority", "fear", "urgency"],
        "lure_themes": ["military_intel", "sanctions_notice", "diplomatic_cable"],
        "sophistication": 0.90
    },
    "FIN7": {
        "name": "FIN7",
        "style": "financial_social_engineering",
        "preferred_biases": ["fear", "urgency", "authority"],
        "lure_themes": ["invoice_fraud", "wire_transfer", "tax_notice"],
        "sophistication": 0.88
    }
}

COGNITIVE_BIASES = [
    "authority", "urgency", "curiosity", "fear",
    "reciprocity", "social_proof", "scarcity", "flattery"
]

# COMMAND ----------

# MAGIC %md
# MAGIC ## Psychological Profile Ingestion

# COMMAND ----------

def load_psychological_profiles():
    """Load user psychological profiles from UEBA behavioral analysis."""
    profiles_df = spark.sql(f"""
        SELECT
            user_id,
            big_five_openness,
            big_five_conscientiousness,
            big_five_extraversion,
            big_five_agreeableness,
            big_five_neuroticism,
            dark_triad_machiavellianism,
            dark_triad_narcissism,
            dark_triad_psychopathy,
            stress_level_current,
            stress_level_7d_avg,
            cognitive_load_score,
            department,
            role_level,
            last_security_training,
            phishing_susceptibility_historical
        FROM {CATALOG}.{UEBA_SCHEMA}.user_psychological_profiles
        WHERE is_active = true
    """)
    return profiles_df

# COMMAND ----------

# MAGIC %md
# MAGIC ## Vulnerability Scoring Engine

# COMMAND ----------

def calculate_vulnerability_score(profile):
    """
    Calculate composite vulnerability score based on psychological traits.

    Scoring factors:
    - High neuroticism + stress = Fear/Urgency susceptibility
    - High narcissism + extraversion = Flattery/Authority susceptibility
    - Low conscientiousness + high openness = Curiosity/Scarcity susceptibility
    - High agreeableness = Social Proof/Reciprocity susceptibility
    """
    scores = {}

    # Fear vector susceptibility
    scores["fear"] = (
        profile["big_five_neuroticism"] * 0.4 +
        profile["stress_level_current"] * 0.3 +
        (1 - profile["big_five_conscientiousness"]) * 0.2 +
        profile["dark_triad_psychopathy"] * 0.1
    )

    # Authority vector susceptibility
    scores["authority"] = (
        profile["big_five_agreeableness"] * 0.3 +
        profile["dark_triad_machiavellianism"] * 0.2 +
        (1 - profile["big_five_openness"]) * 0.2 +
        profile["stress_level_current"] * 0.3
    )

    # Curiosity vector susceptibility
    scores["curiosity"] = (
        profile["big_five_openness"] * 0.4 +
        (1 - profile["big_five_conscientiousness"]) * 0.3 +
        profile["big_five_extraversion"] * 0.2 +
        profile["dark_triad_narcissism"] * 0.1
    )

    # Urgency vector susceptibility
    scores["urgency"] = (
        profile["big_five_neuroticism"] * 0.35 +
        profile["stress_level_current"] * 0.35 +
        (1 - profile["big_five_conscientiousness"]) * 0.2 +
        profile["cognitive_load_score"] * 0.1
    )

    # Flattery vector susceptibility
    scores["flattery"] = (
        profile["dark_triad_narcissism"] * 0.4 +
        profile["big_five_extraversion"] * 0.3 +
        (1 - profile["big_five_agreeableness"]) * 0.2 +
        profile["dark_triad_machiavellianism"] * 0.1
    )

    # Social Proof vector susceptibility
    scores["social_proof"] = (
        profile["big_five_agreeableness"] * 0.4 +
        profile["big_five_extraversion"] * 0.3 +
        (1 - profile["big_five_openness"]) * 0.2 +
        profile["stress_level_current"] * 0.1
    )

    # Scarcity vector susceptibility
    scores["scarcity"] = (
        profile["big_five_openness"] * 0.3 +
        profile["dark_triad_machiavellianism"] * 0.3 +
        (1 - profile["big_five_conscientiousness"]) * 0.2 +
        profile["stress_level_current"] * 0.2
    )

    # Reciprocity vector susceptibility
    scores["reciprocity"] = (
        profile["big_five_agreeableness"] * 0.5 +
        (1 - profile["dark_triad_psychopathy"]) * 0.2 +
        profile["big_five_conscientiousness"] * 0.2 +
        profile["stress_level_current"] * 0.1
    )

    # Determine dominant bias
    dominant_bias = max(scores, key=scores.get)
    composite_score = sum(scores.values()) / len(scores) * 100

    # Stress amplification factor
    stress_amplifier = 1 + (profile["stress_level_current"] * 0.3)
    composite_score *= stress_amplifier

    return {
        "bias_scores": scores,
        "dominant_bias": dominant_bias,
        "composite_vulnerability": min(composite_score, 99),
        "stress_amplifier": stress_amplifier,
        "recommended_ttp": select_threat_actor(scores, dominant_bias)
    }

def select_threat_actor(scores, dominant_bias):
    """Select optimal threat actor TTP based on user's vulnerabilities."""
    best_actor = None
    best_score = 0

    for actor_id, actor in THREAT_ACTORS.items():
        match_score = sum(
            scores.get(bias, 0) for bias in actor["preferred_biases"]
        ) / len(actor["preferred_biases"])

        if match_score > best_score:
            best_score = match_score
            best_actor = actor_id

    return best_actor

# COMMAND ----------

# MAGIC %md
# MAGIC ## Campaign Orchestration

# COMMAND ----------

def create_campaign(name, threat_actor_id, target_criteria, config=None):
    """
    Create a new phishing simulation campaign.

    Parameters:
    - name: Campaign identifier
    - threat_actor_id: Which TTP to emulate
    - target_criteria: SQL-like filter for target selection
    - config: Additional campaign configuration
    """
    config = config or {}
    actor = THREAT_ACTORS[threat_actor_id]

    campaign = {
        "id": hashlib.sha256(f"{name}_{datetime.now().isoformat()}".encode()).hexdigest()[:16],
        "name": name,
        "threat_actor": threat_actor_id,
        "actor_name": actor["name"],
        "style": actor["style"],
        "status": "draft",
        "created_at": datetime.now().isoformat(),
        "config": {
            "sophistication_level": actor["sophistication"],
            "preferred_biases": actor["preferred_biases"],
            "lure_themes": actor["lure_themes"],
            "personalization_depth": config.get("personalization_depth", "deep"),
            "delivery_schedule": config.get("delivery_schedule", "staggered"),
            "tracking_pixels": True,
            "credential_harvesting": True,
            "attachment_simulation": config.get("attachment_simulation", False),
            "multi_stage": config.get("multi_stage", False),
        }
    }

    return campaign

# COMMAND ----------

def generate_personalized_lure(target_profile, campaign, vulnerability_assessment):
    """
    Generate hyper-personalized phishing lure using LLM with psychological targeting.

    The lure is crafted to exploit the target's specific cognitive biases
    amplified by their current stress levels and personality traits.
    """
    actor = THREAT_ACTORS[campaign["threat_actor"]]
    dominant_bias = vulnerability_assessment["dominant_bias"]

    # Build psychological context for LLM prompt
    psych_context = {
        "target_dominant_bias": dominant_bias,
        "bias_strength": vulnerability_assessment["bias_scores"][dominant_bias],
        "stress_level": target_profile.get("stress_level_current", 0.5),
        "personality_summary": {
            "openness": target_profile.get("big_five_openness", 0.5),
            "conscientiousness": target_profile.get("big_five_conscientiousness", 0.5),
            "extraversion": target_profile.get("big_five_extraversion", 0.5),
        },
        "department": target_profile.get("department", "unknown"),
        "role_level": target_profile.get("role_level", "individual_contributor"),
    }

    # LLM system prompt for lure generation
    system_prompt = f"""You are a red team phishing simulation engine emulating {actor['name']} ({actor['style']}).

Generate a realistic phishing lure targeting cognitive bias: {dominant_bias}
Theme options: {', '.join(actor['lure_themes'])}
Sophistication level: {actor['sophistication']}

Target psychological profile:
- Dominant vulnerability: {dominant_bias} (strength: {psych_context['bias_strength']:.2f})
- Current stress: {psych_context['stress_level']:.2f}
- Department: {psych_context['department']}
- Role: {psych_context['role_level']}

Generate ONLY the email content (subject + body). Include a realistic call-to-action link placeholder [CTA_LINK].
The lure must be indistinguishable from a real {actor['name']} campaign to test organizational resilience."""

    # In production, this would call the LLM via AI Gateway
    # For simulation, return template-based lure
    lure = {
        "id": hashlib.sha256(f"{target_profile.get('user_id', '')}_{campaign['id']}".encode()).hexdigest()[:16],
        "campaign_id": campaign["id"],
        "target_user_id": target_profile.get("user_id"),
        "threat_actor": campaign["threat_actor"],
        "cognitive_bias_targeted": dominant_bias,
        "psychological_vector": f"{dominant_bias}_exploitation",
        "bias_strength_at_send": vulnerability_assessment["bias_scores"][dominant_bias],
        "stress_at_send": target_profile.get("stress_level_current", 0.5),
        "sophistication_score": actor["sophistication"],
        "personalization_depth": campaign["config"]["personalization_depth"],
        "system_prompt_used": system_prompt,
        "generated_at": datetime.now().isoformat(),
        "status": "pending_review"
    }

    return lure

# COMMAND ----------

# MAGIC %md
# MAGIC ## Campaign Execution Pipeline

# COMMAND ----------

def execute_campaign(campaign_id):
    """
    Execute a phishing campaign:
    1. Load target profiles
    2. Calculate vulnerability scores for each target
    3. Generate personalized lures via LLM
    4. Schedule delivery with staggered timing
    5. Initialize tracking (pixels, link clicks, credential entry, report rate)
    """
    campaign = spark.sql(f"""
        SELECT * FROM {CATALOG}.{SCHEMA}.phishing_campaigns
        WHERE id = '{campaign_id}'
    """).first()

    if not campaign:
        raise ValueError(f"Campaign {campaign_id} not found")

    # Load targets with psychological profiles
    targets = spark.sql(f"""
        SELECT
            t.user_id,
            t.email,
            p.*
        FROM {CATALOG}.{SCHEMA}.campaign_targets t
        JOIN {CATALOG}.{UEBA_SCHEMA}.user_psychological_profiles p
            ON t.user_id = p.user_id
        WHERE t.campaign_id = '{campaign_id}'
    """).collect()

    lures_generated = []

    for target in targets:
        target_dict = target.asDict()

        # Calculate real-time vulnerability
        vuln = calculate_vulnerability_score(target_dict)

        # Generate personalized lure
        lure = generate_personalized_lure(
            target_dict,
            campaign.asDict(),
            vuln
        )
        lures_generated.append(lure)

    # Write lures to Delta table
    lures_df = spark.createDataFrame(lures_generated)
    lures_df.write.format("delta").mode("append").saveAsTable(
        f"{CATALOG}.{SCHEMA}.phishing_lures"
    )

    # Update campaign status
    spark.sql(f"""
        UPDATE {CATALOG}.{SCHEMA}.phishing_campaigns
        SET status = 'active',
            started_at = current_timestamp(),
            targets_count = {len(targets)},
            lures_generated = {len(lures_generated)}
        WHERE id = '{campaign_id}'
    """)

    return {
        "campaign_id": campaign_id,
        "targets_processed": len(targets),
        "lures_generated": len(lures_generated),
        "status": "active"
    }

# COMMAND ----------

# MAGIC %md
# MAGIC ## Results Tracking & Scoring

# COMMAND ----------

def process_campaign_response(event):
    """
    Process a campaign response event (click, credential entry, report).
    Updates user vulnerability scores based on actual behavior.
    """
    event_type = event["type"]  # click, credential_submit, attachment_open, report
    lure_id = event["lure_id"]
    user_id = event["user_id"]

    # Load the original lure details
    lure = spark.sql(f"""
        SELECT * FROM {CATALOG}.{SCHEMA}.phishing_lures
        WHERE id = '{lure_id}'
    """).first()

    if not lure:
        return

    # Score the response
    response_scores = {
        "click": 0.3,
        "credential_submit": 1.0,
        "attachment_open": 0.5,
        "report": -0.5,  # Reporting reduces vulnerability score
        "ignore": -0.2   # Ignoring is mildly positive
    }

    score_delta = response_scores.get(event_type, 0)
    bias_targeted = lure["cognitive_bias_targeted"]

    # Update the user's vulnerability profile
    spark.sql(f"""
        MERGE INTO {CATALOG}.{UEBA_SCHEMA}.social_engineering_risk_scores target
        USING (SELECT '{user_id}' as user_id) source
        ON target.user_id = source.user_id
        WHEN MATCHED THEN UPDATE SET
            {bias_targeted}_susceptibility = LEAST(1.0, GREATEST(0.0,
                target.{bias_targeted}_susceptibility + {score_delta * 0.1})),
            composite_score = target.composite_score + {score_delta * 5},
            last_tested = current_timestamp(),
            total_tests = target.total_tests + 1
        WHEN NOT MATCHED THEN INSERT (
            user_id, {bias_targeted}_susceptibility, composite_score, last_tested, total_tests
        ) VALUES (
            '{user_id}', {max(0, score_delta)}, {score_delta * 50 + 50}, current_timestamp(), 1
        )
    """)

    # Log the response
    spark.sql(f"""
        INSERT INTO {CATALOG}.{SCHEMA}.phishing_responses
        VALUES (
            '{hashlib.sha256(f"{lure_id}_{user_id}_{event_type}".encode()).hexdigest()[:16]}',
            '{lure_id}',
            '{user_id}',
            '{event_type}',
            current_timestamp(),
            {score_delta},
            '{bias_targeted}',
            {lure['stress_at_send']},
            '{lure['threat_actor']}'
        )
    """)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Scheduled Execution

# COMMAND ----------

# Run campaign pipeline on schedule
active_campaigns = spark.sql(f"""
    SELECT id FROM {CATALOG}.{SCHEMA}.phishing_campaigns
    WHERE status = 'active'
    AND next_batch_time <= current_timestamp()
""").collect()

for campaign in active_campaigns:
    try:
        result = execute_campaign(campaign["id"])
        print(f"Campaign {campaign['id']}: {result['lures_generated']} lures sent")
    except Exception as e:
        print(f"Campaign {campaign['id']} failed: {e}")
