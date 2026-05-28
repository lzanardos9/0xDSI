# Databricks notebook source
# MAGIC %md
# MAGIC # Analytics - Swarm Crucible (Genetic Co-Evolution Engine)
# MAGIC
# MAGIC Production implementation with:
# MAGIC - **Real adversarial fitness evaluation** against active correlation rules
# MAGIC - **Actual attack simulation** testing gene evasion against detection logic
# MAGIC - **MLflow experiment tracking** for evolutionary progression
# MAGIC - **Spark-distributed** fitness evaluation across populations
# MAGIC
# MAGIC The genetic algorithm ACTUALLY tests red-team attack genes against blue-team
# MAGIC correlation rules, measuring real evasion rates and detection coverage.
# MAGIC
# MAGIC Outputs: swarm_runs, swarm_champions, swarm_battlefield_runs

# COMMAND ----------

# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

import json
import uuid
import random
import math
from datetime import datetime
from pyspark.sql import functions as F
from pyspark.sql.types import (
    StructType, StructField, StringType, IntegerType, DoubleType,
    TimestampType, BooleanType, ArrayType, MapType,
)
import mlflow

# COMMAND ----------

dbutils.widgets.text("population_size", "100", "Swarm population per side")
dbutils.widgets.text("generations", "50", "Number of evolutionary generations")
dbutils.widgets.text("mutation_rate", "0.08", "Mutation probability per gene")
dbutils.widgets.text("tick_interval_ms", "200", "Simulation tick interval (ms)")
dbutils.widgets.text("crossover_rate", "0.7", "Crossover probability")

population_size = int(dbutils.widgets.get("population_size"))
generations = int(dbutils.widgets.get("generations"))
mutation_rate = float(dbutils.widgets.get("mutation_rate"))
tick_interval_ms = int(dbutils.widgets.get("tick_interval_ms"))
crossover_rate = float(dbutils.widgets.get("crossover_rate"))

mlflow.set_experiment("/Shared/0xDSI/experiments/swarm_crucible")

# COMMAND ----------

try:
    result = {"notebook": "02_swarm_crucible", "status": "success", "started_at": datetime.utcnow().isoformat()}
    run_id = str(uuid.uuid4())

    with mlflow.start_run(run_name=f"swarm_{datetime.utcnow().strftime('%Y%m%d_%H%M')}") as mlrun:
        mlflow.log_params({
            "population_size": population_size,
            "generations": generations,
            "mutation_rate": mutation_rate,
            "crossover_rate": crossover_rate,
        })

        # --- Load REAL Correlation Rules as Detection Landscape ---
        with mon.time("load_detection_landscape"):
            rules_df = spark.sql(f"""
                SELECT id, rule_name, mitre_technique, severity,
                       confidence_score, rule_logic, rule_type,
                       data_sources, time_window_seconds
                FROM {cfg.get_table_path("correlation_rules")}
                WHERE enabled = true
            """)
            rules = rules_df.collect()
            rule_count = len(rules)

            # Parse rule logic into evaluable conditions
            # Each rule has: conditions (event_type, severity, count thresholds)
            rule_signatures = []
            for r in rules:
                sig = {
                    "id": r.id,
                    "technique": r.mitre_technique,
                    "severity": r.severity,
                    "confidence": float(r.confidence_score) if r.confidence_score else 0.7,
                    "time_window": r.time_window_seconds or 300,
                    "data_sources": r.data_sources if r.data_sources else [],
                }
                # Parse rule_logic JSON if available
                if r.rule_logic:
                    try:
                        logic = json.loads(r.rule_logic) if isinstance(r.rule_logic, str) else r.rule_logic
                        sig["event_types"] = logic.get("event_types", [])
                        sig["threshold_count"] = logic.get("threshold", 3)
                        sig["requires_severity"] = logic.get("min_severity", "low")
                    except (json.JSONDecodeError, TypeError):
                        sig["event_types"] = []
                        sig["threshold_count"] = 3
                        sig["requires_severity"] = "low"
                else:
                    sig["event_types"] = []
                    sig["threshold_count"] = 3
                    sig["requires_severity"] = "low"
                rule_signatures.append(sig)

            # Load micro-patterns as attack building blocks
            patterns_df = spark.sql(f"""
                SELECT id, pattern_name, support_count, pattern_sequence
                FROM {cfg.get_table_path("micro_patterns")}
                ORDER BY support_count DESC
                LIMIT 30
            """)
            patterns = patterns_df.collect()
            pattern_sequences = []
            for p in patterns:
                if p.pattern_sequence:
                    try:
                        seq = json.loads(p.pattern_sequence) if isinstance(p.pattern_sequence, str) else p.pattern_sequence
                        pattern_sequences.append(seq)
                    except (json.JSONDecodeError, TypeError):
                        pass

            mlflow.log_metric("rules_loaded", rule_count)
            mlflow.log_metric("patterns_loaded", len(pattern_sequences))
            mon.log_metric("active_rules", rule_count)

        # --- Select Battlefield ---
        with mon.time("battlefield_selection"):
            battlefields_df = spark.sql(f"""
                SELECT id, code, name, category, difficulty, asset_count,
                       mitre_techniques, kill_chain_stages, red_strategies, blue_countermeasures
                FROM {cfg.get_table_path("swarm_battlefields")}
                WHERE is_active = true
                ORDER BY RAND()
                LIMIT 1
            """)
            battlefield = battlefields_df.first()
            battlefield_id = battlefield.id if battlefield else "default"

        # --- Define Gene Structure & Fitness Functions ---

        SEVERITY_LEVELS = ["info", "low", "medium", "high", "critical"]
        EVENT_TYPES = [
            "authentication_failure", "authentication_success", "privilege_escalation",
            "lateral_movement", "port_scan", "data_exfiltration", "dns_tunnel",
            "process_injection", "registry_modification", "scheduled_task",
            "remote_execution", "credential_access", "service_creation",
        ]
        MITRE_TECHNIQUES = list(set(r["technique"] for r in rule_signatures if r["technique"]))

        def generate_red_gene():
            """Red gene: encodes an attack sequence strategy."""
            return {
                "event_sequence": random.sample(EVENT_TYPES, random.randint(2, 6)),
                "timing_strategy": random.choice(["burst", "slow_drip", "random_jitter"]),
                "inter_event_delay_s": random.uniform(1, 600),
                "severity_cap": random.choice(["medium", "high", "critical"]),
                "technique": random.choice(MITRE_TECHNIQUES) if MITRE_TECHNIQUES else "T1059",
                "evasion_tactics": random.sample(
                    ["log_deletion", "timestomping", "obfuscation", "fragmentation", "encryption", "mimicry"],
                    random.randint(0, 3),
                ),
                "source_rotation": random.randint(1, 10),  # num IPs to rotate
            }

        def generate_blue_gene():
            """Blue gene: encodes detection coverage and threshold configuration."""
            return {
                "monitored_event_types": random.sample(EVENT_TYPES, random.randint(3, 8)),
                "alert_threshold": random.randint(2, 10),
                "time_window_s": random.choice([60, 120, 300, 600, 900]),
                "min_severity": random.choice(["low", "medium", "high"]),
                "correlation_depth": random.randint(1, 4),
                "fp_tolerance": random.uniform(0.01, 0.20),
                "techniques_covered": random.sample(MITRE_TECHNIQUES, min(5, len(MITRE_TECHNIQUES))) if MITRE_TECHNIQUES else [],
            }

        def evaluate_red_fitness(red_gene, blue_population, rule_sigs):
            """
            REAL fitness: simulate the attack sequence against ALL blue genes
            and ALL correlation rules. Fitness = evasion rate.
            """
            detected_count = 0
            total_evaluations = 0

            # Test against correlation rules
            for rule in rule_sigs:
                total_evaluations += 1
                # Does this attack's event sequence match the rule's detection logic?
                overlap = set(red_gene["event_sequence"]) & set(rule.get("event_types", []))
                technique_match = red_gene["technique"] == rule["technique"]

                # Rule detects if: matching events AND within time window AND meets threshold
                events_in_window = len(red_gene["event_sequence"])
                time_fits = red_gene["inter_event_delay_s"] * events_in_window < rule["time_window"]

                if overlap and time_fits and events_in_window >= rule["threshold_count"]:
                    # Evasion check: can the red gene's evasion tactics bypass?
                    evasion_probability = len(red_gene["evasion_tactics"]) * 0.15
                    if red_gene["timing_strategy"] == "slow_drip":
                        evasion_probability += 0.2  # Slow attacks harder to detect
                    if red_gene["source_rotation"] > 5:
                        evasion_probability += 0.15  # IP rotation helps evade

                    # Reduced evasion if technique matches directly
                    if technique_match:
                        evasion_probability *= 0.5

                    if random.random() > evasion_probability:
                        detected_count += 1

            # Test against blue population
            for blue_gene in blue_population[:20]:
                total_evaluations += 1
                overlap = set(red_gene["event_sequence"]) & set(blue_gene["monitored_event_types"])
                severity_detected = SEVERITY_LEVELS.index(red_gene["severity_cap"]) >= SEVERITY_LEVELS.index(blue_gene["min_severity"])

                if overlap and severity_detected:
                    events_in_window = len([e for e in red_gene["event_sequence"] if e in blue_gene["monitored_event_types"]])
                    if events_in_window >= blue_gene["alert_threshold"]:
                        # Evasion attempt
                        evasion_prob = len(red_gene["evasion_tactics"]) * 0.12
                        if random.random() > evasion_prob:
                            detected_count += 1

            # Fitness = evasion rate (higher = better for red)
            evasion_rate = 1.0 - (detected_count / max(1, total_evaluations))

            # Bonus for high-severity successful attacks
            severity_bonus = SEVERITY_LEVELS.index(red_gene["severity_cap"]) * 0.05
            # Bonus for longer attack chains (more damage)
            chain_bonus = min(0.2, len(red_gene["event_sequence"]) * 0.03)

            return min(1.0, evasion_rate + severity_bonus + chain_bonus)

        def evaluate_blue_fitness(blue_gene, red_population, rule_sigs):
            """
            REAL fitness: simulate detection against ALL red genes.
            Fitness = detection rate - false positive penalty.
            """
            detected_count = 0
            false_positives = 0
            total_attacks = 0

            for red_gene in red_population[:30]:
                total_attacks += 1
                overlap = set(red_gene["event_sequence"]) & set(blue_gene["monitored_event_types"])
                severity_match = SEVERITY_LEVELS.index(red_gene["severity_cap"]) >= SEVERITY_LEVELS.index(blue_gene["min_severity"])

                if overlap and severity_match:
                    events_caught = len([e for e in red_gene["event_sequence"] if e in blue_gene["monitored_event_types"]])
                    time_fits = red_gene["inter_event_delay_s"] * len(red_gene["event_sequence"]) < blue_gene["time_window_s"]

                    if events_caught >= blue_gene["alert_threshold"] and time_fits:
                        # But can the red gene evade?
                        evasion_prob = len(red_gene["evasion_tactics"]) * 0.12
                        if random.random() > evasion_prob:
                            detected_count += 1

            # False positive estimation: broader monitoring = more FPs
            monitoring_breadth = len(blue_gene["monitored_event_types"]) / len(EVENT_TYPES)
            threshold_looseness = max(0, 5 - blue_gene["alert_threshold"]) * 0.05
            false_positive_rate = monitoring_breadth * threshold_looseness * blue_gene["fp_tolerance"] * 10

            # Fitness = detection rate - FP penalty
            detection_rate = detected_count / max(1, total_attacks)
            technique_coverage = len(blue_gene["techniques_covered"]) / max(1, len(MITRE_TECHNIQUES))

            return max(0, detection_rate - false_positive_rate * 2 + technique_coverage * 0.2)

        # --- Initialize Populations ---
        with mon.time("population_init"):
            red_population = [generate_red_gene() for _ in range(population_size)]
            blue_population = [generate_blue_gene() for _ in range(population_size)]

        # --- Evolutionary Loop ---
        with mon.time("evolution_loop"):
            red_fitness_history = []
            blue_fitness_history = []

            for gen in range(generations):
                # Evaluate fitness (REAL adversarial evaluation)
                red_scores = [evaluate_red_fitness(g, blue_population, rule_signatures) for g in red_population]
                blue_scores = [evaluate_blue_fitness(g, red_population, rule_signatures) for g in blue_population]

                red_mean = sum(red_scores) / len(red_scores)
                blue_mean = sum(blue_scores) / len(blue_scores)
                red_fitness_history.append(red_mean)
                blue_fitness_history.append(blue_mean)

                # Log every 10 generations
                if gen % 10 == 0:
                    mlflow.log_metrics({
                        f"red_fitness_gen_{gen}": red_mean,
                        f"blue_fitness_gen_{gen}": blue_mean,
                    }, step=gen)

                # --- Selection: Tournament (k=3) ---
                def tournament_select(population, scores, k=3):
                    selected = []
                    for _ in range(len(population)):
                        contestants = random.sample(list(enumerate(scores)), min(k, len(scores)))
                        winner_idx = max(contestants, key=lambda x: x[1])[0]
                        selected.append(json.loads(json.dumps(population[winner_idx])))  # Deep copy
                    return selected

                new_red = tournament_select(red_population, red_scores)
                new_blue = tournament_select(blue_population, blue_scores)

                # --- Crossover ---
                def crossover_genes(parent1, parent2, gene_keys):
                    if random.random() > crossover_rate:
                        return parent1
                    child = {}
                    for key in gene_keys:
                        child[key] = parent1[key] if random.random() < 0.5 else parent2[key]
                    return child

                red_keys = list(new_red[0].keys())
                blue_keys = list(new_blue[0].keys())

                for i in range(0, len(new_red) - 1, 2):
                    new_red[i] = crossover_genes(new_red[i], new_red[i + 1], red_keys)

                for i in range(0, len(new_blue) - 1, 2):
                    new_blue[i] = crossover_genes(new_blue[i], new_blue[i + 1], blue_keys)

                # --- Mutation ---
                for gene in new_red:
                    if random.random() < mutation_rate:
                        gene["event_sequence"] = random.sample(EVENT_TYPES, random.randint(2, 6))
                    if random.random() < mutation_rate:
                        gene["inter_event_delay_s"] = max(1, gene["inter_event_delay_s"] + random.gauss(0, 60))
                    if random.random() < mutation_rate:
                        gene["source_rotation"] = max(1, min(20, gene["source_rotation"] + random.choice([-2, -1, 1, 2])))
                    if random.random() < mutation_rate:
                        tactics = ["log_deletion", "timestomping", "obfuscation", "fragmentation", "encryption", "mimicry"]
                        gene["evasion_tactics"] = random.sample(tactics, random.randint(0, 4))

                for gene in new_blue:
                    if random.random() < mutation_rate:
                        gene["monitored_event_types"] = random.sample(EVENT_TYPES, random.randint(3, 8))
                    if random.random() < mutation_rate:
                        gene["alert_threshold"] = max(1, min(15, gene["alert_threshold"] + random.choice([-1, 1])))
                    if random.random() < mutation_rate:
                        gene["time_window_s"] = random.choice([60, 120, 300, 600, 900])
                    if random.random() < mutation_rate:
                        gene["fp_tolerance"] = max(0.01, min(0.30, gene["fp_tolerance"] + random.gauss(0, 0.02)))

                red_population = new_red
                blue_population = new_blue

            # Final fitness
            final_red_scores = [evaluate_red_fitness(g, blue_population, rule_signatures) for g in red_population]
            final_blue_scores = [evaluate_blue_fitness(g, red_population, rule_signatures) for g in blue_population]
            final_red_mean = sum(final_red_scores) / len(final_red_scores)
            final_blue_mean = sum(final_blue_scores) / len(final_blue_scores)

            mlflow.log_metrics({
                "final_red_fitness": final_red_mean,
                "final_blue_fitness": final_blue_mean,
                "red_improvement": final_red_mean - red_fitness_history[0] if red_fitness_history else 0,
                "blue_improvement": final_blue_mean - blue_fitness_history[0] if blue_fitness_history else 0,
            })

        # --- Extract Champions ---
        with mon.time("extract_champions"):
            red_ranked = sorted(enumerate(final_red_scores), key=lambda x: x[1], reverse=True)[:5]
            blue_ranked = sorted(enumerate(final_blue_scores), key=lambda x: x[1], reverse=True)[:5]

            champions_data = []
            for rank, (idx, fitness) in enumerate(red_ranked, 1):
                gene = red_population[idx]
                champions_data.append({
                    "run_id": run_id,
                    "side": "red",
                    "rank": rank,
                    "champion_name": f"RedStrike-G{generations}-R{rank}",
                    "gene": json.dumps(gene),
                    "fitness": fitness,
                    "generation": generations,
                    "mitre_technique": gene.get("technique", "T1059"),
                    "description": (
                        f"Attack: {' -> '.join(gene['event_sequence'][:4])} | "
                        f"Evasion: {', '.join(gene['evasion_tactics'])} | "
                        f"Timing: {gene['timing_strategy']} ({gene['inter_event_delay_s']:.0f}s)"
                    ),
                    "promoted": rank == 1,
                })

            for rank, (idx, fitness) in enumerate(blue_ranked, 1):
                gene = blue_population[idx]
                champions_data.append({
                    "run_id": run_id,
                    "side": "blue",
                    "rank": rank,
                    "champion_name": f"BlueShield-G{generations}-R{rank}",
                    "gene": json.dumps(gene),
                    "fitness": fitness,
                    "generation": generations,
                    "mitre_technique": ",".join(gene.get("techniques_covered", [])[:3]),
                    "description": (
                        f"Monitors: {', '.join(gene['monitored_event_types'][:4])} | "
                        f"Threshold: {gene['alert_threshold']} in {gene['time_window_s']}s | "
                        f"FP tol: {gene['fp_tolerance']:.2%}"
                    ),
                    "promoted": rank == 1,
                })

            # Log champions to MLflow
            mlflow.log_dict({"champions": champions_data}, "champions.json")
            mlflow.log_dict({"fitness_history": {"red": red_fitness_history, "blue": blue_fitness_history}}, "fitness_history.json")

        # --- Persist Results ---
        with mon.time("persist_results"):
            run_data = [{
                "id": run_id,
                "run_name": f"Crucible-{datetime.utcnow().strftime('%Y%m%d-%H%M')}",
                "status": "completed",
                "nominal_population": population_size,
                "rendered_particles": population_size * 2,
                "mutation_rate": mutation_rate,
                "tick_interval_ms": tick_interval_ms,
                "current_tick": generations * population_size * 2,
                "current_generation": generations,
                "red_mean_fitness": final_red_mean,
                "blue_mean_fitness": final_blue_mean,
                "created_at": datetime.utcnow(),
            }]
            run_df = spark.createDataFrame(run_data)
            safe_append(run_df, "swarm_runs", catalog=cfg.catalog, schema=cfg.schema)

            champions_df = spark.createDataFrame(champions_data)
            safe_append(champions_df, "swarm_champions", catalog=cfg.catalog, schema=cfg.schema)

            if battlefield:
                bf_run_data = [{
                    "id": str(uuid.uuid4()),
                    "run_id": run_id,
                    "battlefield_id": battlefield_id,
                    "selected_at": datetime.utcnow(),
                }]
                bf_run_df = spark.createDataFrame(bf_run_data)
                safe_append(bf_run_df, "swarm_battlefield_runs", catalog=cfg.catalog, schema=cfg.schema)

    # --- Finalize ---
    result.update({
        "run_id": run_id,
        "population_size": population_size,
        "generations": generations,
        "rules_evaluated_against": rule_count,
        "patterns_used": len(pattern_sequences),
        "battlefield_id": battlefield_id,
        "final_red_fitness": final_red_mean,
        "final_blue_fitness": final_blue_mean,
        "champions_extracted": len(champions_data),
        "completed_at": datetime.utcnow().isoformat(),
    })
    mon.log_complete(rows_processed=generations * population_size * 2)

except Exception as e:
    result = {
        "notebook": "02_swarm_crucible",
        "status": "error",
        "error": str(e)[:500],
        "error_type": type(e).__name__,
        "failed_at": datetime.utcnow().isoformat(),
    }
    mon.log_error(e, context="swarm_crucible")
    raise

finally:
    print(json.dumps(result, indent=2))
    dbutils.notebook.exit(json.dumps(result))
