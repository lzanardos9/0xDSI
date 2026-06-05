# Databricks notebook source
# MAGIC %md
# MAGIC # Agent 57: Shadow AI Detector
# MAGIC ## Unauthorized AI Usage Detection via Network & Behavioral Analysis
# MAGIC
# MAGIC Identifies shadow AI usage through:
# MAGIC - DNS pattern analysis for known AI provider domains
# MAGIC - Network traffic inspection (HTTPS certificate analysis)
# MAGIC - Browser extension audits (unauthorized Copilot/GPT extensions)
# MAGIC - Behavioral anomalies (sudden topic expertise without training)
# MAGIC - Token volume spikes from unregistered sources

# COMMAND ----------

import json
import re
from datetime import datetime, timedelta
from pyspark.sql import functions as F
from pyspark.sql.types import *

# COMMAND ----------

CATALOG = "security_lakehouse"
SCHEMA = "ai_governance"

# Known AI provider domains and patterns
AI_PROVIDER_DOMAINS = {
    "openai": {
        "domains": ["api.openai.com", "chat.openai.com", "platform.openai.com"],
        "patterns": [r".*openai.*\.com", r".*chatgpt.*"],
        "category": "commercial_llm",
        "risk_if_unauthorized": "high"
    },
    "anthropic": {
        "domains": ["api.anthropic.com", "claude.ai", "console.anthropic.com"],
        "patterns": [r".*anthropic.*\.com", r".*claude\.ai"],
        "category": "commercial_llm",
        "risk_if_unauthorized": "high"
    },
    "google_ai": {
        "domains": ["generativelanguage.googleapis.com", "aistudio.google.com", "gemini.google.com"],
        "patterns": [r".*gemini.*google.*", r".*generativelanguage.*"],
        "category": "commercial_llm",
        "risk_if_unauthorized": "high"
    },
    "huggingface": {
        "domains": ["api-inference.huggingface.co", "huggingface.co"],
        "patterns": [r".*huggingface.*"],
        "category": "open_source_hub",
        "risk_if_unauthorized": "medium"
    },
    "deepseek": {
        "domains": ["api.deepseek.com", "chat.deepseek.com"],
        "patterns": [r".*deepseek.*"],
        "category": "foreign_llm",
        "risk_if_unauthorized": "critical"
    },
    "local_llm": {
        "domains": [],
        "patterns": [r".*:11434.*", r".*ollama.*", r".*localai.*", r".*text-generation.*:8080"],
        "category": "self_hosted",
        "risk_if_unauthorized": "medium"
    },
    "proxy_services": {
        "domains": [],
        "patterns": [r".*openai-proxy.*", r".*gpt-proxy.*", r".*llm-api.*", r".*ai-gateway(?!\.corp).*"],
        "category": "proxy",
        "risk_if_unauthorized": "critical"
    }
}

# Registered/authorized AI services
AUTHORIZED_SERVICES = {
    "corporate_openai": "api.openai.com",
    "corporate_anthropic": "api.anthropic.com",
    "internal_gateway": "ai-gateway.corp.internal",
}

# COMMAND ----------

# MAGIC %md
# MAGIC ## DNS-Based Detection

# COMMAND ----------

def analyze_dns_traffic():
    """
    Analyze DNS query logs for AI provider domain resolutions.
    Flags any resolution not going through the corporate AI gateway.
    """
    shadow_detections = spark.sql(f"""
        WITH dns_ai_queries AS (
            SELECT
                source_ip,
                queried_domain,
                query_timestamp,
                response_ip,
                client_hostname,
                user_id
            FROM {CATALOG}.network.dns_query_logs
            WHERE query_timestamp >= DATEADD(HOUR, -24, current_timestamp())
            AND (
                queried_domain RLIKE '(?i)(openai|anthropic|claude|gemini|deepseek|huggingface|ollama)'
                OR queried_domain RLIKE '(?i)(ai-proxy|gpt-api|llm-endpoint)'
                OR response_ip IN (SELECT ip FROM {CATALOG}.{SCHEMA}.known_ai_provider_ips)
            )
        ),
        authorized_filter AS (
            SELECT
                d.*,
                CASE
                    WHEN d.queried_domain IN (SELECT endpoint FROM {CATALOG}.{SCHEMA}.authorized_ai_endpoints)
                    THEN 'authorized'
                    ELSE 'unauthorized'
                END as authorization_status
            FROM dns_ai_queries d
        )
        SELECT
            user_id,
            client_hostname,
            queried_domain,
            authorization_status,
            COUNT(*) as query_count,
            MIN(query_timestamp) as first_seen,
            MAX(query_timestamp) as last_seen,
            COLLECT_SET(source_ip) as source_ips
        FROM authorized_filter
        WHERE authorization_status = 'unauthorized'
        GROUP BY user_id, client_hostname, queried_domain, authorization_status
        HAVING COUNT(*) >= 3
        ORDER BY query_count DESC
    """)

    return shadow_detections

# COMMAND ----------

# MAGIC %md
# MAGIC ## Network Traffic Analysis

# COMMAND ----------

def analyze_network_patterns():
    """
    Deep packet inspection patterns for AI API traffic:
    - TLS certificate analysis (SNI field inspection)
    - Request/response size patterns typical of LLM calls
    - Streaming response detection (SSE patterns)
    """

    network_signals = spark.sql(f"""
        SELECT
            source_ip,
            dest_ip,
            dest_port,
            sni_hostname,
            bytes_sent,
            bytes_received,
            connection_duration_ms,
            user_id,
            CASE
                WHEN bytes_sent BETWEEN 500 AND 50000
                    AND bytes_received BETWEEN 1000 AND 500000
                    AND connection_duration_ms > 2000
                THEN 'likely_llm_interaction'
                WHEN bytes_received > 500000 AND connection_duration_ms > 10000
                THEN 'likely_llm_streaming'
                ELSE 'unknown'
            END as traffic_classification
        FROM {CATALOG}.network.tls_connection_logs
        WHERE timestamp >= DATEADD(HOUR, -24, current_timestamp())
        AND sni_hostname RLIKE '(?i)(openai|anthropic|deepseek|huggingface|gemini|ollama)'
        AND sni_hostname NOT IN (SELECT endpoint FROM {CATALOG}.{SCHEMA}.authorized_ai_endpoints)
    """)

    return network_signals

# COMMAND ----------

# MAGIC %md
# MAGIC ## Browser Extension Audit

# COMMAND ----------

def audit_browser_extensions():
    """
    Detect unauthorized AI-related browser extensions across managed endpoints.
    Correlates with EDR telemetry.
    """

    unauthorized_extensions = spark.sql(f"""
        SELECT
            hostname,
            user_id,
            extension_name,
            extension_id,
            permissions,
            install_date,
            last_active,
            CASE
                WHEN extension_name RLIKE '(?i)(copilot|chatgpt|claude|gemini|ai\s+assistant|gpt)'
                    AND extension_id NOT IN (SELECT extension_id FROM {CATALOG}.{SCHEMA}.approved_extensions)
                THEN 'unauthorized_ai_extension'
                ELSE 'approved'
            END as status
        FROM {CATALOG}.endpoint.browser_extensions
        WHERE extension_name RLIKE '(?i)(copilot|chatgpt|claude|gemini|ai|gpt|llm|bard)'
    """)

    return unauthorized_extensions.filter(F.col("status") == "unauthorized_ai_extension")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Behavioral Anomaly Detection

# COMMAND ----------

def detect_behavioral_anomalies():
    """
    Detect sudden expertise shifts that may indicate unauthorized AI assistance:
    - Code quality sudden improvement without training
    - Email writing style changes
    - Document complexity jumps
    - Response time anomalies (too fast for complexity)
    """

    anomalies = spark.sql(f"""
        WITH user_baselines AS (
            SELECT
                user_id,
                AVG(code_complexity_score) as baseline_code_complexity,
                AVG(writing_sophistication) as baseline_writing,
                AVG(response_time_seconds) as baseline_response_time,
                STDDEV(code_complexity_score) as stddev_complexity
            FROM {CATALOG}.{SCHEMA}.user_productivity_metrics
            WHERE measurement_date BETWEEN DATEADD(DAY, -90, current_date()) AND DATEADD(DAY, -7, current_date())
            GROUP BY user_id
        ),
        recent_metrics AS (
            SELECT
                user_id,
                AVG(code_complexity_score) as recent_code_complexity,
                AVG(writing_sophistication) as recent_writing,
                AVG(response_time_seconds) as recent_response_time
            FROM {CATALOG}.{SCHEMA}.user_productivity_metrics
            WHERE measurement_date >= DATEADD(DAY, -7, current_date())
            GROUP BY user_id
        )
        SELECT
            r.user_id,
            b.baseline_code_complexity,
            r.recent_code_complexity,
            (r.recent_code_complexity - b.baseline_code_complexity) / NULLIF(b.stddev_complexity, 0) as complexity_z_score,
            r.recent_writing - b.baseline_writing as writing_delta,
            b.baseline_response_time - r.recent_response_time as speed_improvement,
            CASE
                WHEN (r.recent_code_complexity - b.baseline_code_complexity) / NULLIF(b.stddev_complexity, 0) > 3
                THEN 'high_confidence_ai_assistance'
                WHEN (r.recent_code_complexity - b.baseline_code_complexity) / NULLIF(b.stddev_complexity, 0) > 2
                THEN 'moderate_confidence_ai_assistance'
                ELSE 'within_normal_range'
            END as detection_confidence
        FROM recent_metrics r
        JOIN user_baselines b ON r.user_id = b.user_id
        WHERE (r.recent_code_complexity - b.baseline_code_complexity) / NULLIF(b.stddev_complexity, 0) > 2
    """)

    return anomalies

# COMMAND ----------

# MAGIC %md
# MAGIC ## Consolidated Shadow AI Report

# COMMAND ----------

def generate_shadow_ai_report():
    """Generate comprehensive shadow AI detection report."""

    dns_detections = analyze_dns_traffic()
    network_signals = analyze_network_patterns()
    extension_audit = audit_browser_extensions()
    behavioral_anomalies = detect_behavioral_anomalies()

    # Combine and score
    report = {
        "timestamp": datetime.now().isoformat(),
        "dns_shadow_endpoints": dns_detections.count(),
        "network_ai_traffic": network_signals.count(),
        "unauthorized_extensions": extension_audit.count(),
        "behavioral_anomalies": behavioral_anomalies.count(),
    }

    # Write consolidated findings to Delta
    # This feeds the UI dashboard and alerting pipelines

    print(f"Shadow AI Report Generated:")
    print(f"  DNS detections: {report['dns_shadow_endpoints']}")
    print(f"  Network signals: {report['network_ai_traffic']}")
    print(f"  Unauthorized extensions: {report['unauthorized_extensions']}")
    print(f"  Behavioral anomalies: {report['behavioral_anomalies']}")

    return report

# COMMAND ----------

# Execute detection pipeline
report = generate_shadow_ai_report()
