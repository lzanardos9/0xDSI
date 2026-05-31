import { DatabricksNotebook } from '../databricksNotebooks';

export const behavioralNotebooks: DatabricksNotebook[] = [
  {
    id: 'ueba-engine',
    title: 'User & Entity Behavior Analytics (UEBA)',
    subtitle: 'Streaming behavioral baseline modeling with Z-score anomaly detection',
    category: 'behavioral',
    tags: ['UEBA', 'Insider Threat', 'Behavioral Baseline', 'Anomaly Score', 'Z-Score'],
    description: 'Builds rolling behavioral baselines from real authentication and activity logs in the silver layer, then computes multi-dimensional Z-score deviations to surface compromised accounts, insider threats, and policy violations.',
    estimatedRuntime: 'Continuous (streaming) or 8 min (batch)',
    clusterRequirements: 'DBR 14.3 LTS ML, 4+ workers, SSD state store',
    cells: [
      {
        type: 'markdown',
        content: `# User & Entity Behavior Analytics (UEBA) Engine
## Rolling Baseline Modeling & Anomaly Detection on Real Data

### Behavioral Dimensions
1. **Login Patterns** - Time-of-day, location, device, success/failure rates
2. **Data Access** - Volume, sensitivity level, access frequency
3. **Network Activity** - Connections, data transfers, protocol usage
4. **Temporal Patterns** - After-hours activity, weekend work, schedule deviations

### Scoring Model
\`\`\`
Risk Score = w1*Login_Z + w2*Data_Z + w3*Network_Z + w4*Temporal_Z
           = 0.25 * LZ + 0.30 * DZ + 0.25 * NZ + 0.20 * TZ
\`\`\`

### Data Sources
- \`silver_events\` (authentication, endpoint, network categories)
- \`user_profiles\` (department, role, peer group)
- \`asset_registry\` (host criticality)`
      },
      {
        type: 'code',
        content: `# Cell 1: Configuration & Data Ingest
dbutils.widgets.text("catalog", "main")
dbutils.widgets.text("schema", "security")
dbutils.widgets.text("baseline_days", "30")
dbutils.widgets.text("detection_days", "7")
dbutils.widgets.text("z_threshold_high", "3.0")
dbutils.widgets.text("z_threshold_critical", "5.0")

catalog = dbutils.widgets.get("catalog")
schema = dbutils.widgets.get("schema")
baseline_days = int(dbutils.widgets.get("baseline_days"))
detection_days = int(dbutils.widgets.get("detection_days"))
z_high = float(dbutils.widgets.get("z_threshold_high"))
z_critical = float(dbutils.widgets.get("z_threshold_critical"))

from pyspark.sql import functions as F
from pyspark.sql.window import Window
from datetime import datetime, timedelta

cutoff_baseline = (datetime.now() - timedelta(days=baseline_days + detection_days)).isoformat()
cutoff_detection = (datetime.now() - timedelta(days=detection_days)).isoformat()

events = spark.table(f"{catalog}.{schema}.silver_events")
auth_events = events.filter(
    (F.col("ocsf_category") == "authentication") &
    (F.col("time") >= cutoff_baseline)
)
activity_events = events.filter(
    (F.col("ocsf_category").isin(["endpoint", "network"])) &
    (F.col("time") >= cutoff_baseline)
)

print(f"Auth events loaded: {auth_events.count():,}")
print(f"Activity events loaded: {activity_events.count():,}")`
      },
      {
        type: 'code',
        content: `# Cell 2: Build Behavioral Baselines (Rolling Window)

baseline_auth = auth_events.filter(F.col("time") < cutoff_detection)
baseline_activity = activity_events.filter(F.col("time") < cutoff_detection)

user_baselines = (
    baseline_auth
    .groupBy("actor_user_id")
    .agg(
        F.avg(F.hour("time").cast("double")).alias("baseline_avg_login_hour"),
        F.stddev(F.hour("time").cast("double")).alias("baseline_std_login_hour"),
        F.count("*").alias("baseline_event_count"),
        F.countDistinct("src_ip").alias("baseline_unique_ips"),
        F.sum(F.when(F.col("status_id") == 0, 1).otherwise(0)).alias("baseline_failed_count"),
        F.avg(F.when(
            (F.hour("time") < 7) | (F.hour("time") > 20), 1
        ).otherwise(0).cast("double")).alias("baseline_after_hours_ratio"),
        F.collect_set("src_ip").alias("baseline_known_ips"),
        F.collect_set(F.col("src_geo_country")).alias("baseline_known_countries"),
    )
    .fillna({"baseline_std_login_hour": 1.0})
)

data_baselines = (
    baseline_activity
    .groupBy("actor_user_id")
    .agg(
        F.avg(F.when(F.col("ocsf_category") == "network",
              F.coalesce(F.col("bytes_out"), F.lit(0))).otherwise(0)).alias("baseline_avg_bytes"),
        F.stddev(F.when(F.col("ocsf_category") == "network",
                 F.coalesce(F.col("bytes_out"), F.lit(0))).otherwise(0)).alias("baseline_std_bytes"),
        F.avg(F.size(F.collect_set("dst_ip")).over(
            Window.partitionBy("actor_user_id").rangeBetween(Window.unboundedPreceding, Window.unboundedFollowing)
        )).alias("baseline_avg_unique_dests"),
    )
    .fillna({"baseline_std_bytes": 1.0})
)

baselines = user_baselines.join(data_baselines, "actor_user_id", "left")
baselines.write.format("delta").mode("overwrite").saveAsTable(f"{catalog}.{schema}.user_baselines")
print(f"Baselines computed for {baselines.count()} users")`
      },
      {
        type: 'code',
        content: `# Cell 3: Anomaly Detection - Z-Score Deviation from Baselines

detection_auth = auth_events.filter(F.col("time") >= cutoff_detection)
detection_activity = activity_events.filter(F.col("time") >= cutoff_detection)

det_agg = (
    detection_auth
    .groupBy("actor_user_id")
    .agg(
        F.avg(F.hour("time").cast("double")).alias("det_avg_login_hour"),
        F.countDistinct("src_ip").alias("det_unique_ips"),
        F.sum(F.when(F.col("status_id") == 0, 1).otherwise(0)).alias("det_failed_count"),
        F.avg(F.when(
            (F.hour("time") < 7) | (F.hour("time") > 20), 1
        ).otherwise(0).cast("double")).alias("det_after_hours_ratio"),
        F.count("*").alias("det_event_count"),
    )
)

baselines = spark.table(f"{catalog}.{schema}.user_baselines")

scored = (
    det_agg
    .join(baselines, "actor_user_id")
    .withColumn("login_z",
        F.abs(F.col("det_avg_login_hour") - F.col("baseline_avg_login_hour")) /
        F.greatest(F.col("baseline_std_login_hour"), F.lit(0.1)))
    .withColumn("ip_anomaly_z",
        (F.col("det_unique_ips") - F.col("baseline_unique_ips")).cast("double") /
        F.greatest(F.col("baseline_unique_ips").cast("double") * 0.3, F.lit(1.0)))
    .withColumn("after_hours_z",
        F.abs(F.col("det_after_hours_ratio") - F.col("baseline_after_hours_ratio")) / F.lit(0.1))
    .withColumn("failed_auth_z",
        (F.col("det_failed_count") - F.col("baseline_failed_count")).cast("double") /
        F.greatest(F.col("baseline_failed_count").cast("double") * 0.3, F.lit(1.0)))
    .withColumn("composite_risk_score",
        F.col("login_z") * 0.25 + F.col("ip_anomaly_z") * 0.20 +
        F.col("after_hours_z") * 0.20 + F.col("failed_auth_z") * 0.35)
    .withColumn("risk_level",
        F.when(F.col("composite_risk_score") > z_critical, "critical")
         .when(F.col("composite_risk_score") > z_high, "high")
         .when(F.col("composite_risk_score") > 1.5, "medium")
         .otherwise("low"))
    .orderBy(F.desc("composite_risk_score"))
)

scored.write.format("delta").mode("overwrite").saveAsTable(f"{catalog}.{schema}.ueba_risk_scores")

display(scored.select(
    "actor_user_id", "composite_risk_score", "risk_level",
    "login_z", "ip_anomaly_z", "after_hours_z", "failed_auth_z",
    "det_event_count"
).limit(25))

print(f"""
UEBA Analysis Complete:
  Total users scored:  {scored.count()}
  Critical risk:       {scored.filter(F.col('risk_level') == 'critical').count()}
  High risk:           {scored.filter(F.col('risk_level') == 'high').count()}
  Medium risk:         {scored.filter(F.col('risk_level') == 'medium').count()}
""")`
      },
    ],
  },

  {
    id: 'threat-escalation-engine',
    title: 'Automated Threat Escalation Engine',
    subtitle: 'Multi-factor escalation scoring with SLA tracking from real alert data',
    category: 'behavioral',
    tags: ['Escalation', 'SLA', 'Runbook', 'Prioritization', 'Triage'],
    description: 'Computes escalation scores for real alerts by combining alert severity, asset criticality, threat intelligence context, and historical pattern signals. Tracks SLA compliance per tier and analyst workload.',
    estimatedRuntime: '5 min (batch)',
    clusterRequirements: 'DBR 14.3 LTS, 2+ workers',
    cells: [
      {
        type: 'markdown',
        content: `# Automated Threat Escalation Engine
## Multi-Factor Alert Triage & Escalation from Production Alerts

### Escalation Score Formula
\`\`\`
Score = (severity_weight * 0.30) + (asset_criticality * 0.25) + (intel_context * 0.20)
      + (historical_pattern * 0.15) + (time_sensitivity * 0.10)
\`\`\`

### Escalation Tiers
- **Tier 1**: Score < 0.3 - Auto-close or low-priority queue
- **Tier 2**: Score 0.3-0.6 - Standard analyst review
- **Tier 3**: Score 0.6-0.8 - Senior analyst with SLA tracking
- **Tier 4**: Score > 0.8 - Immediate CISO notification + auto-runbook`
      },
      {
        type: 'code',
        content: `# Cell 1: Load Real Alerts & Enrich with Asset Criticality
dbutils.widgets.text("catalog", "main")
dbutils.widgets.text("schema", "security")
dbutils.widgets.text("lookback_hours", "72")

catalog = dbutils.widgets.get("catalog")
schema = dbutils.widgets.get("schema")
lookback = int(dbutils.widgets.get("lookback_hours"))

from pyspark.sql import functions as F
from datetime import datetime, timedelta

cutoff = (datetime.now() - timedelta(hours=lookback)).isoformat()

alerts = (
    spark.table(f"{catalog}.{schema}.alerts")
    .filter(F.col("created_at") >= cutoff)
)

assets = spark.table(f"{catalog}.{schema}.asset_registry").select(
    F.col("hostname"), F.col("criticality").alias("asset_criticality_label"),
    F.when(F.col("criticality") == "crown_jewel", 1.0)
     .when(F.col("criticality") == "critical", 0.8)
     .when(F.col("criticality") == "high", 0.6)
     .when(F.col("criticality") == "medium", 0.4)
     .otherwise(0.2).alias("asset_score")
)

ioc_hits = (
    spark.table(f"{catalog}.{schema}.threat_feed_items")
    .filter(F.col("is_active") == True)
    .select("ioc_value", "confidence")
    .withColumnRenamed("confidence", "intel_confidence")
)

severity_map = F.when(F.col("severity") == "critical", 1.0) \
    .when(F.col("severity") == "high", 0.75) \
    .when(F.col("severity") == "medium", 0.50) \
    .otherwise(0.25)

enriched = (
    alerts
    .withColumn("severity_score", severity_map)
    .join(assets, "hostname", "left")
    .withColumn("asset_score", F.coalesce("asset_score", F.lit(0.3)))
    .join(ioc_hits, alerts["source_ip"] == ioc_hits["ioc_value"], "left")
    .withColumn("intel_score", F.coalesce("intel_confidence", F.lit(0.0)))
)

print(f"Alerts loaded: {enriched.count()}")`
      },
      {
        type: 'code',
        content: `# Cell 2: Compute Escalation Scores & SLA Compliance

historical_counts = (
    spark.table(f"{catalog}.{schema}.correlation_matches")
    .groupBy("entity_value")
    .agg(F.count("*").alias("prior_match_count"))
)

hours_since = (F.unix_timestamp(F.current_timestamp()) - F.unix_timestamp("created_at")) / 3600.0

scored = (
    enriched
    .join(historical_counts,
          enriched["source_ip"] == historical_counts["entity_value"], "left")
    .withColumn("historical_score",
        F.least(F.coalesce("prior_match_count", F.lit(0)).cast("double") / 10.0, F.lit(1.0)))
    .withColumn("time_score",
        F.least(hours_since / 24.0, F.lit(1.0)))
    .withColumn("escalation_score", F.round(
        F.col("severity_score") * 0.30 +
        F.col("asset_score") * 0.25 +
        F.col("intel_score") * 0.20 +
        F.col("historical_score") * 0.15 +
        F.col("time_score") * 0.10, 3))
    .withColumn("escalation_tier",
        F.when(F.col("escalation_score") > 0.8, 4)
         .when(F.col("escalation_score") > 0.6, 3)
         .when(F.col("escalation_score") > 0.3, 2)
         .otherwise(1))
    .withColumn("sla_minutes",
        F.when(F.col("escalation_tier") == 4, 15)
         .when(F.col("escalation_tier") == 3, 60)
         .when(F.col("escalation_tier") == 2, 240)
         .otherwise(1440))
)

scored.write.format("delta").mode("overwrite").saveAsTable(
    f"{catalog}.{schema}.escalation_scored_alerts")

sla_summary = (
    scored
    .groupBy("escalation_tier")
    .agg(
        F.count("*").alias("total_alerts"),
        F.avg("escalation_score").alias("avg_score"),
        F.sum(F.when(F.col("status") == "resolved", 1).otherwise(0)).alias("resolved"),
    )
    .orderBy("escalation_tier")
)

display(sla_summary)
print(f"Tier 4 (Critical): {scored.filter(F.col('escalation_tier') == 4).count()} alerts")`
      },
    ],
  },

  {
    id: 'red-team-validation',
    title: 'Red Team Detection Validation Engine',
    subtitle: 'MITRE ATT&CK detection coverage analysis from real campaign telemetry',
    category: 'behavioral',
    tags: ['Red Team', 'MITRE ATT&CK', 'Purple Team', 'Detection Validation', 'Coverage'],
    description: 'Analyzes real red team campaign results stored in the red_team_campaigns table, correlates executed techniques against detection hits in alerts and correlation_matches, computes MTTD and detection coverage gaps per MITRE tactic.',
    estimatedRuntime: '5 min (batch)',
    clusterRequirements: 'DBR 14.3 LTS, 2+ workers',
    cells: [
      {
        type: 'markdown',
        content: `# Red Team Detection Validation Engine
## MITRE ATT&CK Coverage Analysis from Real Campaign Data

Analyzes actual red team campaigns against detection telemetry:
1. **Campaign Correlation** - Match campaign steps to alert/correlation hits
2. **Detection Coverage** - Percentage of techniques detected per tactic
3. **MTTD Measurement** - Mean Time to Detect per technique category
4. **Gap Analysis** - Identify undetected techniques for rule improvements`
      },
      {
        type: 'code',
        content: `# Cell 1: Load Real Campaign & Detection Data
dbutils.widgets.text("catalog", "main")
dbutils.widgets.text("schema", "security")

catalog = dbutils.widgets.get("catalog")
schema = dbutils.widgets.get("schema")

from pyspark.sql import functions as F

campaigns = spark.table(f"{catalog}.{schema}.red_team_campaigns")
alerts = spark.table(f"{catalog}.{schema}.alerts")
corr_matches = spark.table(f"{catalog}.{schema}.correlation_matches")

campaign_steps = (
    campaigns
    .select(
        "campaign_id", "campaign_name", "step_order",
        "technique_id", "tactic", "technique_name",
        "executed_at", "target_host", "operator"
    )
)

detection_hits = (
    alerts
    .select(
        F.explode("mitre_techniques").alias("detected_technique"),
        "created_at", "hostname", "severity"
    )
    .unionByName(
        corr_matches
        .filter(F.col("match_type") == "sequence")
        .select(
            F.lit("matched").alias("detected_technique"),
            F.col("fired_at").alias("created_at"),
            F.col("entity_value").alias("hostname"),
            "severity"
        ),
        allowMissingColumns=True
    )
)

print(f"Campaign steps: {campaign_steps.count()}")
print(f"Detection hits: {detection_hits.count()}")`
      },
      {
        type: 'code',
        content: `# Cell 2: Detection Coverage & MTTD Analysis

coverage = (
    campaign_steps.alias("c")
    .join(
        detection_hits.alias("d"),
        (F.col("c.technique_id") == F.col("d.detected_technique")) &
        (F.col("c.target_host") == F.col("d.hostname")) &
        (F.col("d.created_at") >= F.col("c.executed_at")) &
        (F.col("d.created_at") <= F.date_add(F.col("c.executed_at"), 1)),
        "left"
    )
    .withColumn("was_detected", F.col("d.created_at").isNotNull())
    .withColumn("detection_delay_min",
        F.when(F.col("was_detected"),
               (F.unix_timestamp("d.created_at") - F.unix_timestamp("c.executed_at")) / 60.0))
)

tactic_coverage = (
    coverage
    .groupBy("tactic")
    .agg(
        F.count("*").alias("total_tests"),
        F.sum(F.when(F.col("was_detected"), 1).otherwise(0)).alias("detected"),
        F.avg(F.col("detection_delay_min")).alias("avg_mttd_min"),
    )
    .withColumn("detection_rate_pct",
        F.round(F.col("detected") / F.col("total_tests") * 100, 1))
    .orderBy("tactic")
)

display(tactic_coverage)

gaps = (
    coverage
    .filter(~F.col("was_detected"))
    .groupBy("technique_id", "technique_name", "tactic")
    .agg(F.count("*").alias("undetected_count"))
    .orderBy(F.desc("undetected_count"))
)

print("\\n=== Detection Gaps (Undetected Techniques) ===")
display(gaps.limit(20))

overall_rate = coverage.filter(F.col("was_detected")).count() / max(coverage.count(), 1) * 100
print(f"\\nOverall Detection Rate: {overall_rate:.1f}%")`
      },
    ],
  },
];
