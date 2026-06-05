# Databricks notebook source
# MAGIC %md
# MAGIC # Agent 55: Phishing Response Analyzer
# MAGIC ## Real-time Response Tracking & Psychological Vulnerability Score Updates
# MAGIC
# MAGIC Processes campaign interaction events and updates user vulnerability profiles:
# MAGIC - Click tracking with time-to-click analysis
# MAGIC - Credential submission detection
# MAGIC - Report rate monitoring (positive security behavior)
# MAGIC - Psychological score recalculation based on actual behavior

# COMMAND ----------

import json
from datetime import datetime, timedelta
from pyspark.sql import functions as F
from pyspark.sql.types import *
from pyspark.sql.window import Window

# COMMAND ----------

CATALOG = "security_lakehouse"
SCHEMA = "red_team"
UEBA_SCHEMA = "ueba"

# COMMAND ----------

# MAGIC %md
# MAGIC ## Stream Processing: Response Events

# COMMAND ----------

response_schema = StructType([
    StructField("event_id", StringType(), False),
    StructField("lure_id", StringType(), False),
    StructField("user_id", StringType(), False),
    StructField("event_type", StringType(), False),  # click, credential_submit, attachment_open, report, ignore
    StructField("timestamp", TimestampType(), False),
    StructField("metadata", StringType(), True),  # JSON with browser, IP, time_to_action, etc.
])

def process_response_stream():
    """Process real-time phishing response events from Kafka/Event Hub."""
    responses = (
        spark.readStream
        .format("kafka")
        .option("kafka.bootstrap.servers", dbutils.secrets.get("kafka", "bootstrap_servers"))
        .option("subscribe", "phishing_responses")
        .option("startingOffsets", "latest")
        .load()
        .select(F.from_json(F.col("value").cast("string"), response_schema).alias("data"))
        .select("data.*")
    )
    return responses

# COMMAND ----------

# MAGIC %md
# MAGIC ## Vulnerability Score Recalculation

# COMMAND ----------

def recalculate_vulnerability(user_id, event_type, lure_details):
    """
    Recalculate user vulnerability based on their response to the phishing attempt.

    Factors:
    - Did they click? (negative indicator)
    - Did they submit credentials? (critical vulnerability)
    - Did they report? (positive security awareness)
    - Time to action (faster = more susceptible)
    - Bias that was exploited (updates specific bias score)
    """
    # Scoring weights
    weights = {
        "click": {"score_delta": 8, "bias_delta": 0.08},
        "credential_submit": {"score_delta": 25, "bias_delta": 0.20},
        "attachment_open": {"score_delta": 12, "bias_delta": 0.10},
        "report": {"score_delta": -15, "bias_delta": -0.12},
        "ignore": {"score_delta": -5, "bias_delta": -0.03},
    }

    weight = weights.get(event_type, {"score_delta": 0, "bias_delta": 0})
    bias_targeted = lure_details.get("cognitive_bias_targeted", "authority")

    # Time-to-click amplification
    # Users who click within 30 seconds are significantly more vulnerable
    time_to_action = lure_details.get("time_to_action_seconds", 300)
    time_amplifier = 1.0
    if time_to_action < 30:
        time_amplifier = 1.5
    elif time_to_action < 120:
        time_amplifier = 1.2

    # Stress amplification - stressed users who fall for phishing get higher scores
    stress_at_time = lure_details.get("stress_at_send", 0.5)
    stress_factor = 1 + (stress_at_time * 0.2)

    adjusted_score = weight["score_delta"] * time_amplifier * stress_factor
    adjusted_bias = weight["bias_delta"] * time_amplifier

    return {
        "user_id": user_id,
        "score_delta": adjusted_score,
        "bias_delta": adjusted_bias,
        "bias_targeted": bias_targeted,
        "event_type": event_type,
        "time_amplifier": time_amplifier,
        "stress_factor": stress_factor
    }

# COMMAND ----------

# MAGIC %md
# MAGIC ## Analytics & Reporting

# COMMAND ----------

def generate_campaign_analytics(campaign_id):
    """Generate comprehensive campaign analytics with psychological insights."""

    analytics = spark.sql(f"""
        WITH responses AS (
            SELECT
                r.*,
                l.cognitive_bias_targeted,
                l.threat_actor,
                l.sophistication_score,
                l.stress_at_send,
                l.bias_strength_at_send
            FROM {CATALOG}.{SCHEMA}.phishing_responses r
            JOIN {CATALOG}.{SCHEMA}.phishing_lures l ON r.lure_id = l.id
            WHERE l.campaign_id = '{campaign_id}'
        )
        SELECT
            cognitive_bias_targeted,
            threat_actor,
            COUNT(*) as total_sent,
            SUM(CASE WHEN event_type = 'click' THEN 1 ELSE 0 END) as clicks,
            SUM(CASE WHEN event_type = 'credential_submit' THEN 1 ELSE 0 END) as cred_harvested,
            SUM(CASE WHEN event_type = 'report' THEN 1 ELSE 0 END) as reported,
            AVG(bias_strength_at_send) as avg_bias_strength,
            AVG(stress_at_send) as avg_stress_level,
            ROUND(SUM(CASE WHEN event_type = 'click' THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 2) as click_rate,
            ROUND(SUM(CASE WHEN event_type = 'credential_submit' THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 2) as compromise_rate,
            ROUND(SUM(CASE WHEN event_type = 'report' THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 2) as report_rate
        FROM responses
        GROUP BY cognitive_bias_targeted, threat_actor
        ORDER BY click_rate DESC
    """)

    return analytics

# COMMAND ----------

def identify_high_risk_users(threshold=70):
    """Identify users with vulnerability scores above threshold for targeted training."""

    high_risk = spark.sql(f"""
        SELECT
            s.user_id,
            s.composite_score,
            s.dominant_bias,
            s.total_tests,
            p.department,
            p.role_level,
            p.stress_level_current,
            p.big_five_neuroticism,
            p.dark_triad_narcissism,
            CASE
                WHEN s.composite_score >= 90 THEN 'CRITICAL'
                WHEN s.composite_score >= 75 THEN 'HIGH'
                WHEN s.composite_score >= {threshold} THEN 'ELEVATED'
            END as risk_tier
        FROM {CATALOG}.{UEBA_SCHEMA}.social_engineering_risk_scores s
        JOIN {CATALOG}.{UEBA_SCHEMA}.user_psychological_profiles p
            ON s.user_id = p.user_id
        WHERE s.composite_score >= {threshold}
        ORDER BY s.composite_score DESC
    """)

    return high_risk

# COMMAND ----------

# MAGIC %md
# MAGIC ## Psychological Correlation Analysis

# COMMAND ----------

def analyze_psych_correlations():
    """
    Analyze correlations between psychological traits and phishing susceptibility.
    Used to refine the vulnerability scoring model.
    """

    correlations = spark.sql(f"""
        SELECT
            -- Big Five correlations with click-through
            CORR(p.big_five_neuroticism, r.clicked) as neuroticism_click_corr,
            CORR(p.big_five_conscientiousness, r.clicked) as conscientiousness_click_corr,
            CORR(p.big_five_openness, r.clicked) as openness_click_corr,
            CORR(p.big_five_agreeableness, r.clicked) as agreeableness_click_corr,
            CORR(p.big_five_extraversion, r.clicked) as extraversion_click_corr,

            -- Dark Triad correlations
            CORR(p.dark_triad_machiavellianism, r.clicked) as mach_click_corr,
            CORR(p.dark_triad_narcissism, r.clicked) as narc_click_corr,

            -- Stress correlation
            CORR(p.stress_level_current, r.clicked) as stress_click_corr,

            -- Training effectiveness
            CORR(DATEDIFF(current_date(), p.last_security_training), r.clicked) as training_decay_corr

        FROM {CATALOG}.{UEBA_SCHEMA}.user_psychological_profiles p
        JOIN (
            SELECT
                user_id,
                CASE WHEN event_type IN ('click', 'credential_submit') THEN 1 ELSE 0 END as clicked
            FROM {CATALOG}.{SCHEMA}.phishing_responses
        ) r ON p.user_id = r.user_id
    """)

    return correlations

# COMMAND ----------

# Execute analytics
print("=== Campaign Analytics ===")
high_risk_users = identify_high_risk_users(70)
print(f"High-risk users identified: {high_risk_users.count()}")
high_risk_users.show(10)
