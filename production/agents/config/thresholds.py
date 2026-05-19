"""
Production Confidence Thresholds and Decision Parameters
Configurable per deployment environment and risk appetite.
"""

# Agent confidence thresholds
CONFIDENCE = {
    "auto_close_false_positive": 0.95,  # Must be this confident to auto-close
    "auto_route_to_enrichment": 0.7,    # Route without human check above this
    "require_human_review": 0.5,        # Below this, always involve human
    "escalate_immediately": 0.3,        # Below this, escalate to senior analyst

    "correlation_minimum": 0.6,         # Minimum confidence for a correlation to be actionable
    "hunting_finding_minimum": 0.5,     # Minimum confidence for a hunting finding

    "response_auto_execute": 0.9,       # Auto-execute response above this (low-risk only)
    "response_require_approval": 0.7,   # Require approval below this
}

# Time windows for correlation
TIME_WINDOWS = {
    "immediate_correlation_seconds": 300,       # 5 minutes
    "short_correlation_minutes": 60,            # 1 hour
    "medium_correlation_hours": 24,             # 1 day
    "long_correlation_days": 7,                 # 1 week
    "low_and_slow_days": 30,                    # 30 days
    "campaign_tracking_days": 90,               # 90 days

    "alert_dedup_window_minutes": 15,           # Deduplicate same alert within this window
    "enrichment_cache_minutes": 60,             # Cache enrichment results
    "threat_intel_refresh_hours": 4,            # Refresh threat intel every 4 hours
}

# Rate limits per agent type
RATE_LIMITS = {
    "triage_agent": {
        "max_concurrent_alerts": 50,
        "max_alerts_per_minute": 100,
        "llm_calls_per_minute": 30,
    },
    "enrichment_agent": {
        "max_concurrent_enrichments": 20,
        "max_api_calls_per_minute": 60,
        "llm_calls_per_minute": 20,
    },
    "correlation_agent": {
        "max_concurrent_correlations": 10,
        "max_query_window_hours": 168,  # 7 days max lookback per query
        "llm_calls_per_minute": 15,
    },
    "investigation_agent": {
        "max_concurrent_investigations": 5,
        "max_queries_per_investigation": 50,
        "llm_calls_per_minute": 20,
    },
    "response_agent": {
        "max_concurrent_responses": 3,
        "max_actions_per_incident": 20,
        "llm_calls_per_minute": 10,
    },
    "threat_hunter_agent": {
        "max_concurrent_hunts": 3,
        "max_queries_per_hunt": 100,
        "max_time_range_days": 90,
        "llm_calls_per_minute": 15,
    },
}

# Escalation timing (minutes before escalating to next tier)
ESCALATION_TIMING = {
    "critical_severity": {
        "l1_timeout": 5,
        "l2_timeout": 15,
        "l3_timeout": 30,
        "auto_notify_ciso": True,
    },
    "high_severity": {
        "l1_timeout": 15,
        "l2_timeout": 45,
        "l3_timeout": 120,
        "auto_notify_ciso": False,
    },
    "medium_severity": {
        "l1_timeout": 60,
        "l2_timeout": 240,
        "l3_timeout": 480,
        "auto_notify_ciso": False,
    },
    "low_severity": {
        "l1_timeout": 240,
        "l2_timeout": 1440,  # 24 hours
        "l3_timeout": None,  # No further escalation
        "auto_notify_ciso": False,
    },
}

# Response action risk classification
RESPONSE_RISK = {
    "block_ip": "low",
    "quarantine_file": "low",
    "add_to_watchlist": "low",
    "force_password_reset": "medium",
    "disable_user_account": "medium",
    "isolate_workstation": "medium",
    "revoke_api_key": "medium",
    "disable_service_account": "high",
    "modify_firewall_rule": "high",
    "isolate_network_segment": "critical",
    "shutdown_production_service": "critical",
    "wipe_device": "critical",
}

# Model parameters per agent
MODEL_PARAMS = {
    "triage_agent": {
        "model": "databricks-meta-llama-3-1-70b-instruct",
        "temperature": 0.1,
        "max_tokens": 2048,
        "fallback_model": "databricks-meta-llama-3-1-8b-instruct",
    },
    "enrichment_agent": {
        "model": "databricks-meta-llama-3-1-70b-instruct",
        "temperature": 0.1,
        "max_tokens": 4096,
        "fallback_model": "databricks-meta-llama-3-1-8b-instruct",
    },
    "correlation_agent": {
        "model": "databricks-meta-llama-3-1-70b-instruct",
        "temperature": 0.2,
        "max_tokens": 4096,
        "fallback_model": "databricks-meta-llama-3-1-8b-instruct",
    },
    "investigation_agent": {
        "model": "databricks-meta-llama-3-1-70b-instruct",
        "temperature": 0.2,
        "max_tokens": 8192,
        "fallback_model": "databricks-meta-llama-3-1-70b-instruct",
    },
    "response_agent": {
        "model": "databricks-meta-llama-3-1-70b-instruct",
        "temperature": 0.0,
        "max_tokens": 4096,
        "fallback_model": None,  # No fallback for response — escalate instead
    },
    "threat_hunter_agent": {
        "model": "databricks-meta-llama-3-1-70b-instruct",
        "temperature": 0.3,  # Slightly higher for creative hypothesis generation
        "max_tokens": 8192,
        "fallback_model": "databricks-meta-llama-3-1-8b-instruct",
    },
}
