# Databricks notebook source
# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

# MAGIC %md
# MAGIC # Agent 24 - Threat Radar
# MAGIC Fetches latest IOCs from threat feeds, correlates against recent events (1h window),
# MAGIC generates alerts for high-confidence correlations, and produces a threat landscape summary.

# COMMAND ----------

import json
from datetime import datetime, timedelta
from pyspark.sql import functions as F
from functools import reduce

CORRELATION_WINDOW_HOURS = 1
HIGH_CONFIDENCE_THRESHOLD = 0.75
MAX_IOCS_PER_BATCH = 5000

events_table = cfg.get_table_path("security_events")
threat_feeds_table = cfg.get_table_path("threat_feed_iocs")
correlations_table = cfg.get_table_path("threat_radar_correlations")
alerts_table = cfg.get_table_path("soc_alerts")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Fetch Active IOCs from Threat Feeds

# COMMAND ----------

mon.time("fetch_iocs")
window_start = datetime.utcnow() - timedelta(hours=CORRELATION_WINDOW_HOURS)

iocs_df = (
    spark.read.table(threat_feeds_table)
    .filter(F.col("is_active") == True)
    .filter(F.col("last_seen") >= F.lit(window_start))
    .select("ioc_value", "ioc_type", "confidence", "source_feed", "threat_category")
    .limit(MAX_IOCS_PER_BATCH)
)

ip_iocs_df = iocs_df.filter(F.col("ioc_type") == "ip")
domain_iocs_df = iocs_df.filter(F.col("ioc_type") == "domain")
ioc_counts = {"total": iocs_df.count(), "ip": ip_iocs_df.count(), "domain": domain_iocs_df.count()}
mon.log_event("iocs_fetched", ioc_counts)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Load Recent Security Events

# COMMAND ----------

mon.time("load_events")
events_df = spark.read.table(events_table).filter(F.col("event_time") >= F.lit(window_start))
network_events_df = events_df.filter(F.col("event_type").isin("network_connection", "firewall"))
dns_http_events_df = events_df.filter(F.col("event_type").isin("dns_query", "http_request"))
mon.log_event("events_loaded", {"network": network_events_df.count(), "dns_http": dns_http_events_df.count()})

# COMMAND ----------

# MAGIC %md
# MAGIC ## Correlate IP IOCs Against Network Events

# COMMAND ----------

mon.time("correlate_ips")
ip_values = [row.ioc_value for row in ip_iocs_df.select("ioc_value").collect()]

ip_correlations_df = None
if ip_values:
    safe_ip_filter = qb().field("source_ip").is_in(ip_values)
    ip_correlations_df = (
        network_events_df
        .filter(F.col("source_ip").isin(ip_values) | F.col("dest_ip").isin(ip_values))
        .join(ip_iocs_df,
              (F.col("source_ip") == ip_iocs_df["ioc_value"]) |
              (F.col("dest_ip") == ip_iocs_df["ioc_value"]), "inner")
        .select(
            F.col("event_id"), F.col("event_time"), F.col("source_ip"), F.col("dest_ip"),
            ip_iocs_df["ioc_value"].alias("matched_ioc"), F.lit("ip").alias("ioc_type"),
            ip_iocs_df["confidence"], ip_iocs_df["source_feed"], ip_iocs_df["threat_category"],
        )
    )
mon.log_event("ip_correlation_complete", {"ip_ioc_count": len(ip_values)})

# COMMAND ----------

# MAGIC %md
# MAGIC ## Correlate Domain IOCs Against DNS/HTTP Events

# COMMAND ----------

mon.time("correlate_domains")
domain_values = [row.ioc_value for row in domain_iocs_df.select("ioc_value").collect()]

domain_correlations_df = None
if domain_values:
    safe_domain_filter = qb().field("query_domain").is_in(domain_values)
    domain_correlations_df = (
        dns_http_events_df
        .filter(F.col("query_domain").isin(domain_values) | F.col("request_host").isin(domain_values))
        .join(domain_iocs_df,
              (F.col("query_domain") == domain_iocs_df["ioc_value"]) |
              (F.col("request_host") == domain_iocs_df["ioc_value"]), "inner")
        .select(
            F.col("event_id"), F.col("event_time"), F.col("source_ip"),
            F.lit(None).cast("string").alias("dest_ip"),
            domain_iocs_df["ioc_value"].alias("matched_ioc"), F.lit("domain").alias("ioc_type"),
            domain_iocs_df["confidence"], domain_iocs_df["source_feed"],
            domain_iocs_df["threat_category"],
        )
    )
mon.log_event("domain_correlation_complete", {"domain_ioc_count": len(domain_values)})

# COMMAND ----------

# MAGIC %md
# MAGIC ## Store Correlations and Generate Alerts

# COMMAND ----------

mon.time("store_correlations")
correlation_frames = [df for df in [ip_correlations_df, domain_correlations_df] if df is not None]
total_correlations = 0
high_confidence_count = 0

if correlation_frames:
    all_correlations_df = (
        reduce(lambda a, b: a.unionByName(b), correlation_frames)
        .withColumn("correlation_id", F.expr("uuid()"))
        .withColumn("detected_at", F.current_timestamp())
    )
    all_correlations_df.write.mode("append").saveAsTable(correlations_table)

    total_correlations = all_correlations_df.count()
    high_confidence_df = all_correlations_df.filter(F.col("confidence") >= HIGH_CONFIDENCE_THRESHOLD)
    high_confidence_count = high_confidence_df.count()

    if high_confidence_count > 0:
        alerts_df = high_confidence_df.select(
            F.expr("uuid()").alias("alert_id"),
            F.lit("threat_radar").alias("source_agent"),
            F.lit("ioc_correlation").alias("alert_type"),
            F.col("matched_ioc"), F.col("ioc_type"), F.col("threat_category"),
            F.col("confidence"), F.col("event_id").alias("source_event_id"),
            F.current_timestamp().alias("created_at"), F.lit("new").alias("status"),
        )
        alerts_df.write.mode("append").saveAsTable(alerts_table)

mon.log_event("correlations_stored", {
    "total": total_correlations, "high_confidence_alerts": high_confidence_count,
})

# COMMAND ----------

# MAGIC %md
# MAGIC ## Generate Threat Landscape Summary via LLM

# COMMAND ----------

mon.time("llm_summary")
summary_prompt = f"""Analyze these threat radar results and return JSON:
- IOCs evaluated: {ioc_counts['total']} (IPs: {ioc_counts['ip']}, Domains: {ioc_counts['domain']})
- Correlations: {total_correlations}, High-confidence alerts: {high_confidence_count}
- Window: {CORRELATION_WINDOW_HOURS}h
Return: overall_risk_level (low/medium/high/critical), summary (2-3 sentences), top_threat_categories, recommended_actions (up to 3).
"""
landscape_summary = llm.extract_json(summary_prompt)
mon.log_event("landscape_summary_generated", {"risk_level": landscape_summary.get("overall_risk_level", "unknown")})

# COMMAND ----------

# MAGIC %md
# MAGIC ## Finalize

# COMMAND ----------

result = {
    "agent": "24_threat_radar",
    "status": "success",
    "iocs_evaluated": ioc_counts,
    "correlations_found": total_correlations,
    "high_confidence_alerts": high_confidence_count,
    "landscape_summary": landscape_summary,
    "window_hours": CORRELATION_WINDOW_HOURS,
    "timestamp": datetime.utcnow().isoformat(),
}

mon.log_complete(result)
dbutils.notebook.exit(json.dumps(result))
