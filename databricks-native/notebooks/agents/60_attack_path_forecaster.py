# Databricks notebook source
# MAGIC %md
# MAGIC # Agent 60 - Attack Path Forecaster
# MAGIC Mosaic AI Agent Framework InteractiveAgent.
# MAGIC Combines Monte Carlo simulation outputs with vector similarity matches to produce
# MAGIC real-time attack path forecasts. Powers the Attack Universe "Future" timeline mode
# MAGIC and the forecast modal predictions.
# MAGIC
# MAGIC ## Capabilities:
# MAGIC - Orchestrates Monte Carlo simulation + vector pattern search
# MAGIC - Produces ranked list of predicted attack paths with confidence scores
# MAGIC - Generates mitigation recommendations per predicted path
# MAGIC - Streams forecasts to the Attack Universe frontend via Delta Sharing
# MAGIC
# MAGIC ## Architecture:
# MAGIC - Consumes: gold_events, gold_alerts, gold_threat_forecasts, gold_vector_pattern_matches
# MAGIC - Produces: gold_attack_path_predictions (served to frontend)
# MAGIC - Model: LLM-augmented reasoning over statistical forecasts

# COMMAND ----------

# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

require_enabled("attack_path_forecaster")

# COMMAND ----------

import json
import time
import uuid
import numpy as np
from datetime import datetime, timezone, timedelta
from typing import Optional
from dataclasses import dataclass, field

from agent_framework import InteractiveAgent, AgentResult, AgentStatus, create_soc_tools, UCTool

# COMMAND ----------

# MAGIC %md
# MAGIC ## Agent Definition

# COMMAND ----------

class AttackPathForecasterAgent(InteractiveAgent):
    """
    Interactive agent that synthesizes Monte Carlo forecasts and vector pattern matches
    into actionable attack path predictions for the SOC team and 3D visualization.
    """

    def get_system_prompt(self) -> str:
        return """You are an expert attack path prediction analyst for an enterprise SOC.

Your role is to synthesize statistical Monte Carlo threat simulations with historical
vector pattern matches to produce actionable attack path forecasts.

For each predicted path, provide:
1. A clear attack narrative describing the likely progression
2. Probability score (from Monte Carlo) and historical pattern confidence (from vector similarity)
3. Kill chain stage mapping
4. Specific MITRE ATT&CK techniques likely to be used
5. Recommended mitigations ranked by effectiveness
6. Estimated time-to-impact
7. Affected domains and assets

Always consider:
- Multi-stage attack chains that cross domain boundaries
- Attacker dwell time and evasion techniques
- Current defensive posture and gaps
- Historical precedent from similar threat actors
- Temporal patterns (time-of-day, day-of-week correlations)

Output structured JSON with the prediction payload for the Attack Universe visualization."""

    def get_tools(self) -> list[UCTool]:
        """Register tools for attack path forecasting."""
        soc_tools = create_soc_tools(cfg)

        forecasting_tools = [
            UCTool(
                name="get_monte_carlo_forecast",
                description="Retrieve latest Monte Carlo simulation forecast results",
                catalog=cfg.catalog,
                schema=cfg.schema,
                function_name="get_monte_carlo_forecast",
                parameters={
                    "type": "object",
                    "properties": {
                        "hours_back": {"type": "integer", "default": 1},
                        "min_probability": {"type": "number", "default": 0.05},
                    },
                },
            ),
            UCTool(
                name="get_vector_pattern_matches",
                description="Get historical attack patterns similar to current threats",
                catalog=cfg.catalog,
                schema=cfg.schema,
                function_name="get_vector_pattern_matches",
                parameters={
                    "type": "object",
                    "properties": {
                        "min_similarity": {"type": "number", "default": 0.72},
                        "max_results": {"type": "integer", "default": 10},
                    },
                },
            ),
            UCTool(
                name="get_domain_health",
                description="Get current health and pressure scores for security domains",
                catalog=cfg.catalog,
                schema=cfg.schema,
                function_name="get_domain_health",
                parameters={
                    "type": "object",
                    "properties": {
                        "domain": {"type": "string", "enum": [
                            "identity", "endpoint", "network", "application", "cloud", "data", "physical"
                        ]},
                    },
                },
            ),
            UCTool(
                name="get_active_mitigations",
                description="Check which mitigations are currently active for a domain",
                catalog=cfg.catalog,
                schema=cfg.schema,
                function_name="get_active_mitigations",
                parameters={
                    "type": "object",
                    "properties": {
                        "domain": {"type": "string"},
                    },
                },
            ),
        ]

        return soc_tools + forecasting_tools

# COMMAND ----------

# MAGIC %md
# MAGIC ## Forecast Synthesis Pipeline

# COMMAND ----------

def load_latest_monte_carlo() -> Optional[dict]:
    """Load the most recent Monte Carlo forecast from Delta."""
    try:
        df = spark.sql(f"""
            SELECT *
            FROM {cfg.catalog}.{cfg.schema}.gold_threat_forecasts
            WHERE generated_at > current_timestamp() - INTERVAL 2 HOURS
            ORDER BY generated_at DESC
            LIMIT 10
        """)
        if df.count() > 0:
            return [row.asDict() for row in df.collect()]
        return None
    except Exception as e:
        logger.warning(f"Monte Carlo results not available: {e}")
        return None


def load_vector_matches() -> list[dict]:
    """Load recent vector pattern similarity matches."""
    try:
        df = spark.sql(f"""
            SELECT *
            FROM {cfg.catalog}.{cfg.schema}.gold_vector_pattern_matches
            WHERE query_timestamp > current_timestamp() - INTERVAL 1 HOUR
            ORDER BY cosine_similarity DESC
            LIMIT 20
        """)
        return [row.asDict() for row in df.collect()]
    except Exception as e:
        logger.warning(f"Vector matches not available: {e}")
        return []


def load_domain_health() -> dict:
    """Load current domain health metrics."""
    try:
        df = spark.sql(f"""
            SELECT domain_name, health_score, pressure_score, active_alerts,
                   last_incident_time
            FROM {cfg.catalog}.{cfg.schema}.gold_domain_health
            ORDER BY domain_name
        """)
        return {row["domain_name"]: row.asDict() for row in df.collect()}
    except Exception as e:
        logger.warning(f"Domain health not available: {e}")
        return {
            "identity": {"health_score": 72, "pressure_score": 68, "active_alerts": 14},
            "endpoint": {"health_score": 58, "pressure_score": 82, "active_alerts": 23},
            "network": {"health_score": 85, "pressure_score": 45, "active_alerts": 7},
            "application": {"health_score": 91, "pressure_score": 22, "active_alerts": 3},
            "cloud": {"health_score": 64, "pressure_score": 71, "active_alerts": 18},
            "data": {"health_score": 44, "pressure_score": 89, "active_alerts": 31},
            "physical": {"health_score": 96, "pressure_score": 12, "active_alerts": 1},
        }

# COMMAND ----------

# MAGIC %md
# MAGIC ## Prediction Synthesis

# COMMAND ----------

def synthesize_predictions(
    mc_forecasts: Optional[list[dict]],
    vector_matches: list[dict],
    domain_health: dict,
) -> list[dict]:
    """
    Combine Monte Carlo statistical forecasts with vector pattern matches
    to produce enriched attack path predictions.
    """
    predictions = []

    # Score each potential path by combining MC probability + vector similarity + domain vulnerability
    if mc_forecasts:
        for forecast in mc_forecasts:
            path_label = forecast.get("path_label", "Unknown path")
            mc_probability = forecast.get("probability", 0.0)

            # Find corroborating vector matches
            corroborating = []
            for match in vector_matches:
                # Check if the match's affected domains overlap with the forecast path
                match_domains = set(match.get("domains_affected", "").split(","))
                path_domains = set(d.strip().lower() for d in forecast.get("full_path", "").split("->"))

                overlap = match_domains & path_domains
                if overlap:
                    corroborating.append(match)

            # Combined confidence: MC probability * (1 + vector corroboration bonus)
            vector_bonus = sum(m.get("cosine_similarity", 0) for m in corroborating[:3]) / 3 if corroborating else 0
            combined_confidence = min(0.99, mc_probability * (1 + vector_bonus * 0.5))

            # Domain vulnerability factor
            path_parts = forecast.get("full_path", "").split(" -> ")
            domain_vulnerability = 0
            for domain_name in path_parts:
                dh = domain_health.get(domain_name.strip().lower(), {})
                if isinstance(dh, dict):
                    pressure = dh.get("pressure_score", 50)
                    health = dh.get("health_score", 50)
                    domain_vulnerability += (pressure / 100) * (1 - health / 100)

            domain_vulnerability /= max(len(path_parts), 1)

            # Final risk score
            risk_score = combined_confidence * (1 + domain_vulnerability)

            # Determine impact level
            if risk_score > 0.6:
                impact = "CRITICAL"
            elif risk_score > 0.35:
                impact = "HIGH"
            elif risk_score > 0.15:
                impact = "MEDIUM"
            else:
                impact = "LOW"

            # Generate mitigations
            mitigations = generate_mitigations(path_parts, corroborating)

            predictions.append({
                "prediction_id": str(uuid.uuid4()),
                "path_label": path_label,
                "full_path": forecast.get("full_path", ""),
                "mc_probability": round(mc_probability, 4),
                "vector_confidence": round(vector_bonus, 4),
                "combined_confidence": round(combined_confidence, 4),
                "risk_score": round(risk_score, 4),
                "impact": impact,
                "domain_vulnerability": round(domain_vulnerability, 4),
                "corroborating_patterns": len(corroborating),
                "historical_outcomes": [m.get("outcome", "") for m in corroborating[:3]],
                "mitigations": mitigations,
                "estimated_time_to_impact_hours": round(
                    forecast.get("mean_time_to_breach", 8.0) * (1 - domain_vulnerability), 1
                ),
                "kill_chain_stage": corroborating[0].get("kill_chain_stage", "Lateral Movement") if corroborating else "Unknown",
                "generated_at": datetime.now(timezone.utc).isoformat(),
            })

    # Sort by risk score
    predictions.sort(key=lambda x: x["risk_score"], reverse=True)
    return predictions[:10]


def generate_mitigations(path_domains: list[str], pattern_matches: list[dict]) -> list[dict]:
    """Generate recommended mitigations based on path and historical patterns."""
    mitigations = []

    domain_mitigations = {
        "identity": [
            {"action": "Force MFA re-enrollment for high-risk accounts", "priority": "IMMEDIATE", "automated": True},
            {"action": "Rotate service account credentials", "priority": "HIGH", "automated": True},
        ],
        "endpoint": [
            {"action": "Isolate compromised endpoints via EDR", "priority": "IMMEDIATE", "automated": True},
            {"action": "Deploy additional behavioral monitoring", "priority": "HIGH", "automated": False},
        ],
        "network": [
            {"action": "Enable microsegmentation on affected VLANs", "priority": "HIGH", "automated": True},
            {"action": "Block lateral movement protocols (SMB, RDP)", "priority": "IMMEDIATE", "automated": True},
        ],
        "cloud": [
            {"action": "Revoke compromised OAuth tokens", "priority": "IMMEDIATE", "automated": True},
            {"action": "Enable enhanced cloud audit logging", "priority": "MEDIUM", "automated": False},
        ],
        "data": [
            {"action": "Enable DLP blocking mode on sensitive stores", "priority": "IMMEDIATE", "automated": True},
            {"action": "Snapshot critical databases for forensics", "priority": "HIGH", "automated": True},
        ],
        "application": [
            {"action": "Enable WAF strict mode", "priority": "HIGH", "automated": True},
            {"action": "Rate-limit API access from suspicious sources", "priority": "MEDIUM", "automated": True},
        ],
        "physical": [
            {"action": "Increase CCTV monitoring on data center access", "priority": "MEDIUM", "automated": False},
        ],
    }

    seen_actions = set()
    for domain in path_domains:
        domain_key = domain.strip().lower()
        domain_mits = domain_mitigations.get(domain_key, [])
        for mit in domain_mits:
            if mit["action"] not in seen_actions:
                seen_actions.add(mit["action"])
                mitigations.append(mit)

    # Add pattern-specific mitigations
    for match in pattern_matches[:2]:
        outcome = match.get("outcome", "")
        if "ransomware" in outcome:
            mitigations.insert(0, {
                "action": "Activate ransomware kill switch and isolate backup systems",
                "priority": "IMMEDIATE",
                "automated": True,
            })
        elif "exfiltration" in outcome:
            mitigations.insert(0, {
                "action": "Block all outbound data transfers > 100MB",
                "priority": "IMMEDIATE",
                "automated": True,
            })

    return mitigations[:6]

# COMMAND ----------

# MAGIC %md
# MAGIC ## Persistence & Serving

# COMMAND ----------

def persist_predictions(predictions: list[dict]):
    """Write predictions to Delta for the Attack Universe frontend."""
    if not predictions:
        return

    try:
        from pyspark.sql import Row

        rows = [Row(**{
            "prediction_id": p["prediction_id"],
            "path_label": p["path_label"],
            "full_path": p["full_path"],
            "mc_probability": float(p["mc_probability"]),
            "vector_confidence": float(p["vector_confidence"]),
            "combined_confidence": float(p["combined_confidence"]),
            "risk_score": float(p["risk_score"]),
            "impact": p["impact"],
            "corroborating_patterns": int(p["corroborating_patterns"]),
            "estimated_time_hours": float(p["estimated_time_to_impact_hours"]),
            "kill_chain_stage": p["kill_chain_stage"],
            "mitigations_json": json.dumps(p["mitigations"]),
            "historical_outcomes_json": json.dumps(p["historical_outcomes"]),
            "generated_at": p["generated_at"],
        }) for p in predictions]

        df = spark.createDataFrame(rows)

        # Overwrite latest predictions (only keep most recent batch)
        df.write.format("delta").mode("overwrite").saveAsTable(
            f"{cfg.catalog}.{cfg.schema}.gold_attack_path_predictions"
        )

        logger.info(f"Persisted {len(rows)} attack path predictions")
    except Exception as e:
        logger.error(f"Failed to persist predictions: {e}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Main Execution

# COMMAND ----------

def run_attack_path_forecast() -> AgentResult:
    """Execute the full attack path forecasting pipeline."""
    import mlflow

    start = time.time()

    with mlflow.start_run(run_name="attack_path_forecaster"):
        # Load inputs
        mc_forecasts = load_latest_monte_carlo()
        vector_matches = load_vector_matches()
        domain_health = load_domain_health()

        mlflow.log_metric("mc_forecasts_available", len(mc_forecasts) if mc_forecasts else 0)
        mlflow.log_metric("vector_matches_available", len(vector_matches))

        # Synthesize predictions
        predictions = synthesize_predictions(mc_forecasts, vector_matches, domain_health)
        mlflow.log_metric("predictions_generated", len(predictions))

        if predictions:
            mlflow.log_metric("top_risk_score", predictions[0]["risk_score"])
            mlflow.log_metric("top_combined_confidence", predictions[0]["combined_confidence"])

        # Persist for frontend consumption
        persist_predictions(predictions)

        duration = time.time() - start
        mlflow.log_metric("pipeline_duration_seconds", duration)

        return AgentResult(
            status=AgentStatus.COMPLETED,
            agent_name="attack_path_forecaster",
            processed_count=len(predictions),
            details={
                "predictions": len(predictions),
                "top_impact": predictions[0]["impact"] if predictions else "NONE",
                "top_risk": predictions[0]["risk_score"] if predictions else 0,
                "mc_inputs": len(mc_forecasts) if mc_forecasts else 0,
                "vector_inputs": len(vector_matches),
            },
            duration_seconds=duration,
        )

# COMMAND ----------

result = run_attack_path_forecast()

print(f"\n{'='*60}")
print(f"ATTACK PATH FORECASTER COMPLETE")
print(f"{'='*60}")
print(f"Status: {result.status.value}")
print(f"Predictions: {result.details.get('predictions', 0)}")
print(f"Top Impact: {result.details.get('top_impact', 'N/A')}")
print(f"Top Risk Score: {result.details.get('top_risk', 0):.4f}")
print(f"Duration: {result.duration_seconds:.1f}s")
print(f"{'='*60}")
