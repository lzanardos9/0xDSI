# Databricks notebook source
# MAGIC %md
# MAGIC # Analytics - Swarm Crucible (Genetic Co-Evolution Engine)
# MAGIC
# MAGIC Evolves adversarial and defensive strategies via genetic algorithms:
# MAGIC - Red team particles (attack strategies) compete against blue team (defense)
# MAGIC - Fitness evaluation based on correlation rule evasion/detection
# MAGIC - Champion extraction for top-performing genes each generation
# MAGIC - Battlefield selection from pre-defined attack scenarios
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
    TimestampType, BooleanType, ArrayType,
)

# COMMAND ----------

dbutils.widgets.text("population_size", "100", "Swarm population per side")
dbutils.widgets.text("generations", "50", "Number of evolutionary generations")
dbutils.widgets.text("mutation_rate", "0.08", "Mutation probability per gene")
dbutils.widgets.text("tick_interval_ms", "200", "Simulation tick interval (ms)")

population_size = int(dbutils.widgets.get("population_size"))
generations = int(dbutils.widgets.get("generations"))
mutation_rate = float(dbutils.widgets.get("mutation_rate"))
tick_interval_ms = int(dbutils.widgets.get("tick_interval_ms"))

# COMMAND ----------

try:
    result = {"notebook": "02_swarm_crucible", "status": "success", "started_at": datetime.utcnow().isoformat()}
    run_id = str(uuid.uuid4())

    # --- Load correlation rules as fitness landscape ---
    with mon.time("load_fitness_landscape"):
        rules_df = spark.sql(f"""
            SELECT id, rule_name, mitre_technique, severity,
                   confidence_score, rule_logic
            FROM {cfg.get_table_path("correlation_rules")}
            WHERE enabled = true
            LIMIT 60
        """)
        rules = rules_df.collect()
        rule_count = len(rules)
        mon.log_metric("active_rules", rule_count)

        # Load micro-patterns for attack gene construction
        patterns_df = spark.sql(f"""
            SELECT id, pattern_name, support_count, pattern_sequence
            FROM {cfg.get_table_path("micro_patterns")}
            ORDER BY support_count DESC
            LIMIT 30
        """)
        patterns = patterns_df.collect()

    # --- Select Battlefield ---
    with mon.time("battlefield_selection"):
        battlefields_df = spark.sql(f"""
            SELECT id, code, name, category, difficulty, asset_count,
                   mitre_techniques, kill_chain_stages
            FROM {cfg.get_table_path("swarm_battlefields")}
            WHERE is_active = true
            ORDER BY RAND()
            LIMIT 1
        """)
        battlefield = battlefields_df.first()
        battlefield_id = battlefield.id if battlefield else "default"
        mon.log_event("battlefield_selected", {"id": battlefield_id})

    # --- Initialize Population ---
    with mon.time("population_init"):
        mitre_techniques = [r.mitre_technique for r in rules if r.mitre_technique]
        severities = ["low", "medium", "high", "critical"]

        def generate_gene(side: str) -> dict:
            if side == "red":
                return {
                    "evasion_weight": random.uniform(0.3, 1.0),
                    "speed_weight": random.uniform(0.2, 0.9),
                    "stealth_weight": random.uniform(0.4, 1.0),
                    "technique": random.choice(mitre_techniques) if mitre_techniques else "T1059",
                    "chain_length": random.randint(2, 6),
                    "dwell_time_hours": random.uniform(0.5, 72.0),
                }
            else:
                return {
                    "detection_breadth": random.uniform(0.3, 1.0),
                    "response_speed": random.uniform(0.2, 0.9),
                    "false_positive_tolerance": random.uniform(0.01, 0.15),
                    "coverage_techniques": random.sample(mitre_techniques, min(5, len(mitre_techniques))) if mitre_techniques else ["T1059"],
                    "alert_threshold": random.uniform(0.5, 0.95),
                }

        red_population = [generate_gene("red") for _ in range(population_size)]
        blue_population = [generate_gene("blue") for _ in range(population_size)]

    # --- Evolutionary Loop ---
    with mon.time("evolution_loop"):
        red_fitness_history = []
        blue_fitness_history = []

        for gen in range(generations):
            # Evaluate red fitness: how well they evade detection
            red_scores = []
            for gene in red_population:
                evasion_score = gene["evasion_weight"] * gene["stealth_weight"]
                speed_penalty = max(0, 1.0 - gene["speed_weight"] * 0.3)
                chain_bonus = min(1.0, gene["chain_length"] / 5.0)
                fitness = evasion_score * speed_penalty * chain_bonus
                red_scores.append(fitness)

            # Evaluate blue fitness: detection rate minus false positives
            blue_scores = []
            for gene in blue_population:
                detection_rate = gene["detection_breadth"] * gene["response_speed"]
                fp_penalty = gene["false_positive_tolerance"] * 2.0
                threshold_bonus = gene["alert_threshold"] * 0.5
                fitness = detection_rate - fp_penalty + threshold_bonus
                blue_scores.append(max(0, fitness))

            red_fitness_history.append(sum(red_scores) / len(red_scores))
            blue_fitness_history.append(sum(blue_scores) / len(blue_scores))

            # Selection (tournament)
            def tournament_select(population, scores, k=3):
                selected = []
                for _ in range(len(population)):
                    contestants = random.sample(list(enumerate(scores)), k)
                    winner_idx = max(contestants, key=lambda x: x[1])[0]
                    selected.append(population[winner_idx].copy())
                return selected

            red_population = tournament_select(red_population, red_scores)
            blue_population = tournament_select(blue_population, blue_scores)

            # Mutation
            for gene in red_population:
                if random.random() < mutation_rate:
                    gene["evasion_weight"] = min(1.0, max(0.1, gene["evasion_weight"] + random.gauss(0, 0.1)))
                if random.random() < mutation_rate:
                    gene["stealth_weight"] = min(1.0, max(0.1, gene["stealth_weight"] + random.gauss(0, 0.1)))
                if random.random() < mutation_rate:
                    gene["chain_length"] = max(1, min(8, gene["chain_length"] + random.choice([-1, 1])))

            for gene in blue_population:
                if random.random() < mutation_rate:
                    gene["detection_breadth"] = min(1.0, max(0.1, gene["detection_breadth"] + random.gauss(0, 0.1)))
                if random.random() < mutation_rate:
                    gene["alert_threshold"] = min(0.99, max(0.3, gene["alert_threshold"] + random.gauss(0, 0.05)))

        final_red_mean = red_fitness_history[-1]
        final_blue_mean = blue_fitness_history[-1]
        mon.log_metric("final_red_fitness", final_red_mean)
        mon.log_metric("final_blue_fitness", final_blue_mean)

    # --- Extract Champions ---
    with mon.time("extract_champions"):
        # Re-evaluate final generation
        final_red_scores = []
        for gene in red_population:
            fitness = gene["evasion_weight"] * gene["stealth_weight"] * min(1.0, gene["chain_length"] / 5.0)
            final_red_scores.append(fitness)

        final_blue_scores = []
        for gene in blue_population:
            fitness = max(0, gene["detection_breadth"] * gene["response_speed"] - gene["false_positive_tolerance"] * 2.0)
            final_blue_scores.append(fitness)

        # Top 5 from each side
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
                "description": f"Evasion specialist (stealth={gene['stealth_weight']:.2f}, chain={gene['chain_length']})",
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
                "mitre_technique": ",".join(gene.get("coverage_techniques", [])[:3]),
                "description": f"Detection breadth={gene['detection_breadth']:.2f}, threshold={gene['alert_threshold']:.2f}",
                "promoted": rank == 1,
            })

    # --- Persist Results ---
    with mon.time("persist_results"):
        # Swarm run record
        run_data = [{
            "id": run_id,
            "run_name": f"Crucible-{datetime.utcnow().strftime('%Y%m%d-%H%M')}",
            "status": "completed",
            "nominal_population": population_size,
            "rendered_particles": population_size * 2,
            "mutation_rate": mutation_rate,
            "tick_interval_ms": tick_interval_ms,
            "current_tick": generations * population_size,
            "current_generation": generations,
            "red_mean_fitness": final_red_mean,
            "blue_mean_fitness": final_blue_mean,
            "created_at": datetime.utcnow(),
        }]
        run_df = spark.createDataFrame(run_data)
        safe_append(run_df, "swarm_runs", catalog=cfg.catalog, schema=cfg.schema)

        # Champions
        champions_df = spark.createDataFrame(champions_data)
        safe_append(champions_df, "swarm_champions", catalog=cfg.catalog, schema=cfg.schema)

        # Battlefield run link
        if battlefield:
            bf_run_data = [{
                "id": str(uuid.uuid4()),
                "run_id": run_id,
                "battlefield_id": battlefield_id,
                "selected_at": datetime.utcnow(),
            }]
            bf_run_df = spark.createDataFrame(bf_run_data)
            safe_append(bf_run_df, "swarm_battlefield_runs", catalog=cfg.catalog, schema=cfg.schema)

        mon.log_info(f"Swarm run {run_id}: {len(champions_data)} champions extracted")

    # --- Finalize ---
    result.update({
        "run_id": run_id,
        "population_size": population_size,
        "generations": generations,
        "mutation_rate": mutation_rate,
        "battlefield_id": battlefield_id,
        "rules_loaded": rule_count,
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
