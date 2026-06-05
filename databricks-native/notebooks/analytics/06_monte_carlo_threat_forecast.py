# Databricks notebook source
# MAGIC %md
# MAGIC # Monte Carlo Threat Forecast Engine
# MAGIC Runs Monte Carlo simulations over attack path probabilities using historical event data.
# MAGIC Produces probability distributions for predicted attack vectors, lateral movement paths,
# MAGIC and time-to-compromise estimates for the Attack Universe visualization.
# MAGIC
# MAGIC ## Outputs:
# MAGIC - Probability distributions for each attack path
# MAGIC - Confidence intervals for time-to-breach
# MAGIC - Risk-weighted impact scores per domain
# MAGIC - Serialized forecast payloads for the 3D frontend

# COMMAND ----------

# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

import json
import time
import uuid
import numpy as np
from datetime import datetime, timezone, timedelta
from typing import Optional
from dataclasses import dataclass, field
from concurrent.futures import ThreadPoolExecutor

# COMMAND ----------

# MAGIC %md
# MAGIC ## Configuration

# COMMAND ----------

SIMULATION_RUNS = 10000
CONFIDENCE_INTERVAL = 0.95
TIME_HORIZON_HOURS = 24
DOMAIN_NAMES = ["Identity", "Endpoint", "Network", "Application", "Cloud", "Data", "Physical"]

# Attack flow definitions matching the 3D universe
ATTACK_FLOWS = [
    {"from_idx": 0, "to_idx": 1, "label": "Credential theft lateral to endpoint", "base_prob": 0.42},
    {"from_idx": 1, "to_idx": 4, "label": "Endpoint beacon to cloud C2", "base_prob": 0.35},
    {"from_idx": 4, "to_idx": 5, "label": "Cloud exfil targeting data stores", "base_prob": 0.28},
    {"from_idx": 0, "to_idx": 4, "label": "Identity token reuse in cloud", "base_prob": 0.31},
    {"from_idx": 2, "to_idx": 1, "label": "Network exploit pivoting to endpoint", "base_prob": 0.22},
]

# COMMAND ----------

# MAGIC %md
# MAGIC ## Historical Event Loading

# COMMAND ----------

def load_historical_events(hours_back: int = 168) -> list[dict]:
    """Load recent events from the gold analytics layer for probability calibration."""
    try:
        df = spark.sql(f"""
            SELECT event_type, source_domain, target_domain, severity,
                   event_timestamp, mitre_technique, confidence_score
            FROM {cfg.catalog}.{cfg.schema}.gold_events
            WHERE event_timestamp > current_timestamp() - INTERVAL {hours_back} HOURS
            AND event_type IN ('lateral_movement', 'credential_abuse', 'exfiltration',
                              'c2_callback', 'privilege_escalation', 'exploitation')
            ORDER BY event_timestamp DESC
            LIMIT 50000
        """)
        return [row.asDict() for row in df.collect()]
    except Exception as e:
        logger.warning(f"Historical event load failed, using baseline priors: {e}")
        return []

# COMMAND ----------

# MAGIC %md
# MAGIC ## Probability Calibration from Historical Data

# COMMAND ----------

def calibrate_probabilities(events: list[dict], flows: list[dict]) -> list[dict]:
    """
    Adjust base probabilities using observed event frequency.
    Uses Bayesian updating: posterior = prior * likelihood / evidence.
    """
    domain_map = {name.lower(): idx for idx, name in enumerate(DOMAIN_NAMES)}

    # Count transitions observed in historical data
    transition_counts = {}
    total_events = max(len(events), 1)

    for evt in events:
        src = domain_map.get(str(evt.get("source_domain", "")).lower(), -1)
        dst = domain_map.get(str(evt.get("target_domain", "")).lower(), -1)
        if src >= 0 and dst >= 0:
            key = f"{src}->{dst}"
            transition_counts[key] = transition_counts.get(key, 0) + 1

    calibrated = []
    for flow in flows:
        key = f"{flow['from_idx']}->{flow['to_idx']}"
        observed_count = transition_counts.get(key, 0)

        # Bayesian update: blend prior with observed frequency
        observed_freq = observed_count / total_events
        prior = flow["base_prob"]

        # Weight: more data = more trust in observed frequency
        data_weight = min(observed_count / 100, 0.8)
        posterior = prior * (1 - data_weight) + observed_freq * data_weight

        calibrated.append({
            **flow,
            "calibrated_prob": round(min(max(posterior, 0.05), 0.95), 4),
            "observed_count": observed_count,
            "data_weight": round(data_weight, 3),
        })

    return calibrated

# COMMAND ----------

# MAGIC %md
# MAGIC ## Monte Carlo Simulation Core

# COMMAND ----------

@dataclass
class SimulationResult:
    """Single Monte Carlo simulation run result."""
    run_id: str
    path_taken: list[int]
    total_time_hours: float
    domains_compromised: int
    max_severity: float
    final_impact: float
    technique_chain: list[str]

def run_single_simulation(
    calibrated_flows: list[dict],
    severity_weights: dict[int, float],
) -> SimulationResult:
    """Execute one Monte Carlo simulation through the attack graph."""
    run_id = str(uuid.uuid4())[:8]

    # Start from a random entry point (weighted by domain pressure)
    entry_weights = [0.35, 0.25, 0.15, 0.05, 0.15, 0.04, 0.01]
    current_domain = np.random.choice(len(DOMAIN_NAMES), p=entry_weights)

    path = [current_domain]
    total_time = 0.0
    max_severity = 0.0
    techniques = []

    # Simulate propagation through attack graph
    max_hops = 6
    for hop in range(max_hops):
        # Find available transitions from current domain
        available = [f for f in calibrated_flows if f["from_idx"] == current_domain]

        if not available:
            break

        # Attempt each available transition
        moved = False
        np.random.shuffle(available)

        for flow in available:
            # Add noise to calibrated probability
            noise = np.random.normal(0, 0.05)
            effective_prob = flow["calibrated_prob"] + noise

            if np.random.random() < effective_prob:
                current_domain = flow["to_idx"]
                path.append(current_domain)

                # Time between hops: exponential distribution
                dwell_time = np.random.exponential(scale=2.0)
                total_time += dwell_time

                # Severity increases with depth
                hop_severity = min(1.0, 0.3 + hop * 0.15 + np.random.uniform(0, 0.2))
                max_severity = max(max_severity, hop_severity)

                techniques.append(flow["label"])
                moved = True
                break

        if not moved:
            break

    # Impact = domains compromised * max severity * time factor
    domains_hit = len(set(path))
    time_factor = min(1.0, total_time / TIME_HORIZON_HOURS)
    impact = domains_hit * max_severity * (1 - time_factor * 0.3)

    return SimulationResult(
        run_id=run_id,
        path_taken=path,
        total_time_hours=round(total_time, 2),
        domains_compromised=domains_hit,
        max_severity=round(max_severity, 3),
        final_impact=round(impact, 3),
        technique_chain=techniques,
    )

# COMMAND ----------

# MAGIC %md
# MAGIC ## Batch Simulation Execution

# COMMAND ----------

def run_monte_carlo_batch(
    calibrated_flows: list[dict],
    num_simulations: int = SIMULATION_RUNS,
) -> list[SimulationResult]:
    """Run full Monte Carlo simulation batch with parallel execution."""
    severity_weights = {i: 1.0 + i * 0.2 for i in range(len(DOMAIN_NAMES))}

    results = []

    # Parallel execution in chunks
    chunk_size = 1000
    with ThreadPoolExecutor(max_workers=8) as executor:
        for chunk_start in range(0, num_simulations, chunk_size):
            chunk_end = min(chunk_start + chunk_size, num_simulations)
            futures = [
                executor.submit(run_single_simulation, calibrated_flows, severity_weights)
                for _ in range(chunk_end - chunk_start)
            ]
            results.extend([f.result() for f in futures])

    return results

# COMMAND ----------

# MAGIC %md
# MAGIC ## Statistical Analysis & Forecast Generation

# COMMAND ----------

def generate_forecast(results: list[SimulationResult]) -> dict:
    """Aggregate simulation results into actionable forecast payload."""

    # Path frequency analysis
    path_strings = [" -> ".join(DOMAIN_NAMES[d] for d in r.path_taken) for r in results]
    path_counts = {}
    for p in path_strings:
        path_counts[p] = path_counts.get(p, 0) + 1

    # Sort by frequency
    sorted_paths = sorted(path_counts.items(), key=lambda x: x[1], reverse=True)
    top_paths = sorted_paths[:10]

    # Domain compromise frequency
    domain_hit_counts = [0] * len(DOMAIN_NAMES)
    for r in results:
        for d in set(r.path_taken):
            domain_hit_counts[d] += 1

    # Time distribution
    times = [r.total_time_hours for r in results]
    impacts = [r.final_impact for r in results]
    severities = [r.max_severity for r in results]

    # Confidence intervals
    time_sorted = sorted(times)
    impact_sorted = sorted(impacts)
    ci_low = int(len(time_sorted) * (1 - CONFIDENCE_INTERVAL) / 2)
    ci_high = int(len(time_sorted) * (1 + CONFIDENCE_INTERVAL) / 2)

    # Generate predictions for the Attack Universe frontend
    predictions = []
    for path_str, count in top_paths:
        probability = count / len(results)
        domains_in_path = path_str.split(" -> ")

        # Determine impact level
        if probability > 0.15:
            impact = "CRITICAL"
        elif probability > 0.08:
            impact = "HIGH"
        elif probability > 0.04:
            impact = "MEDIUM"
        else:
            impact = "LOW"

        predictions.append({
            "label": f"{domains_in_path[0]} -> {domains_in_path[-1]} chain",
            "probability": round(probability, 4),
            "impact": impact,
            "path": path_str,
            "technique_count": len(domains_in_path) - 1,
        })

    forecast = {
        "forecast_id": str(uuid.uuid4()),
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "simulation_runs": len(results),
        "time_horizon_hours": TIME_HORIZON_HOURS,
        "confidence_interval": CONFIDENCE_INTERVAL,
        "summary": {
            "mean_time_to_breach_hours": round(np.mean(times), 2),
            "median_time_to_breach_hours": round(np.median(times), 2),
            "ci_time_low": round(time_sorted[ci_low], 2),
            "ci_time_high": round(time_sorted[ci_high], 2),
            "mean_impact": round(np.mean(impacts), 3),
            "max_impact": round(max(impacts), 3),
            "mean_severity": round(np.mean(severities), 3),
            "domains_at_risk": sum(1 for c in domain_hit_counts if c > len(results) * 0.1),
        },
        "domain_risk_scores": {
            DOMAIN_NAMES[i]: round(domain_hit_counts[i] / len(results), 4)
            for i in range(len(DOMAIN_NAMES))
        },
        "predictions": predictions,
    }

    return forecast

# COMMAND ----------

# MAGIC %md
# MAGIC ## Main Execution Pipeline

# COMMAND ----------

def run_forecast_pipeline() -> dict:
    """End-to-end forecast pipeline: load data -> calibrate -> simulate -> analyze."""
    import mlflow

    with mlflow.start_run(run_name="monte_carlo_threat_forecast"):
        start = time.time()

        # Step 1: Load historical events
        mlflow.log_param("simulation_runs", SIMULATION_RUNS)
        mlflow.log_param("time_horizon_hours", TIME_HORIZON_HOURS)
        mlflow.log_param("confidence_interval", CONFIDENCE_INTERVAL)

        events = load_historical_events(hours_back=168)
        mlflow.log_metric("historical_events_loaded", len(events))

        # Step 2: Calibrate probabilities
        calibrated_flows = calibrate_probabilities(events, ATTACK_FLOWS)
        for flow in calibrated_flows:
            mlflow.log_metric(
                f"calibrated_prob_{flow['from_idx']}_{flow['to_idx']}",
                flow["calibrated_prob"]
            )

        # Step 3: Run Monte Carlo simulations
        results = run_monte_carlo_batch(calibrated_flows, SIMULATION_RUNS)

        # Step 4: Generate forecast
        forecast = generate_forecast(results)

        # Log results
        duration = time.time() - start
        mlflow.log_metric("pipeline_duration_seconds", duration)
        mlflow.log_metric("mean_time_to_breach", forecast["summary"]["mean_time_to_breach_hours"])
        mlflow.log_metric("mean_impact", forecast["summary"]["mean_impact"])
        mlflow.log_metric("domains_at_risk", forecast["summary"]["domains_at_risk"])

        # Save forecast to Delta
        forecast_json = json.dumps(forecast)
        mlflow.log_text(forecast_json, "forecast_payload.json")

        logger.info(f"Monte Carlo forecast complete: {SIMULATION_RUNS} simulations in {duration:.1f}s")
        logger.info(f"Mean time-to-breach: {forecast['summary']['mean_time_to_breach_hours']:.1f}h")
        logger.info(f"Domains at risk: {forecast['summary']['domains_at_risk']}/7")

    return forecast

# COMMAND ----------

# MAGIC %md
# MAGIC ## Persist Forecast to Delta Lake

# COMMAND ----------

def persist_forecast(forecast: dict):
    """Write forecast to gold layer for frontend consumption."""
    from pyspark.sql import Row
    from pyspark.sql.types import StructType, StructField, StringType, FloatType, TimestampType

    rows = []
    for pred in forecast["predictions"]:
        rows.append(Row(
            forecast_id=forecast["forecast_id"],
            generated_at=forecast["generated_at"],
            path_label=pred["label"],
            probability=float(pred["probability"]),
            impact=pred["impact"],
            full_path=pred["path"],
            technique_count=int(pred["technique_count"]),
            mean_time_to_breach=float(forecast["summary"]["mean_time_to_breach_hours"]),
            simulation_runs=int(forecast["simulation_runs"]),
        ))

    df = spark.createDataFrame(rows)

    df.write.format("delta").mode("append").saveAsTable(
        f"{cfg.catalog}.{cfg.schema}.gold_threat_forecasts"
    )

    logger.info(f"Persisted {len(rows)} forecast predictions to gold_threat_forecasts")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Execute

# COMMAND ----------

forecast = run_forecast_pipeline()
persist_forecast(forecast)

# Display summary
print(f"\n{'='*60}")
print(f"MONTE CARLO THREAT FORECAST COMPLETE")
print(f"{'='*60}")
print(f"Simulations: {forecast['simulation_runs']:,}")
print(f"Mean Time-to-Breach: {forecast['summary']['mean_time_to_breach_hours']:.1f} hours")
print(f"Domains at Risk: {forecast['summary']['domains_at_risk']}/7")
print(f"\nTop Predicted Paths:")
for i, pred in enumerate(forecast['predictions'][:5], 1):
    print(f"  {i}. [{pred['impact']}] {pred['label']} (p={pred['probability']:.1%})")
print(f"{'='*60}")
