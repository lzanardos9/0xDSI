/*
 * Migration: Rewrite BMAD Agents to Databricks-Native PySpark (Phase 4)
 * Date: 2026-05-19
 *
 * This migration rewrites 6 BMAD (Build-Measure-Analyze-Decide) agents
 * (IDs 30-35) from their original asyncio/asyncpg/openai implementations
 * to fully Databricks-native PySpark code.
 *
 * Key changes:
 *   - All data access via spark.table() on Delta tables
 *   - No asyncio, no asyncpg, no openai SDK
 *   - LLM calls via ai_query('databricks-meta-llama-3-1-70b-instruct', ...)
 *   - MERGE operations via delta.tables.DeltaTable
 *   - Parameterization via dbutils.widgets
 *   - MLflow tracking for metrics and model artifacts
 *
 * Agents rewritten:
 *   30. bmad-mary   - Product Analyst
 *   31. bmad-john   - Architect
 *   32. bmad-winston - Tech Lead
 *   33. bmad-sally  - Developer
 *   34. bmad-amelia - QA Specialist
 *   35. bmad-paige  - Scrum Master
 */

-- ============================================================
-- 30. bmad-mary (Product Analyst)
-- ============================================================
UPDATE agent_implementations SET
  production_code = $py$
from pyspark.sql import SparkSession
from pyspark.sql import functions as F
from pyspark.sql.window import Window
from delta.tables import DeltaTable
import mlflow
from datetime import datetime, timedelta

spark = SparkSession.builder.getOrCreate()
dbutils.widgets.text("catalog", "soc_platform")
dbutils.widgets.text("lookback_days", "30")

catalog = dbutils.widgets.get("catalog")
lookback_days = int(dbutils.widgets.get("lookback_days"))

mlflow.set_experiment(f"/{catalog}/bmad_mary_product_analyst")

with mlflow.start_run(run_name=f"product_analysis_{datetime.now().strftime('%Y%m%d_%H%M')}"):
    # Read feature usage telemetry
    telemetry = spark.table(f"{catalog}.feature_telemetry") \
        .filter(F.col("event_timestamp") >= F.date_sub(F.current_date(), lookback_days))

    # Compute adoption rates per feature
    total_users = telemetry.select("user_id").distinct().count()

    adoption = telemetry.groupBy("feature_name").agg(
        F.countDistinct("user_id").alias("unique_users"),
        F.count("*").alias("total_events"),
        F.avg("session_duration_sec").alias("avg_session_duration"),
        F.countDistinct("session_id").alias("total_sessions")
    ).withColumn("adoption_rate", F.col("unique_users") / F.lit(total_users)) \
     .withColumn("engagement_score",
        (F.col("total_events") / F.col("unique_users")) *
        F.log1p(F.col("avg_session_duration"))
    )

    # Compute feature health based on trend (week-over-week)
    weekly_window = Window.partitionBy("feature_name").orderBy("week_start")

    weekly_usage = telemetry.withColumn("week_start", F.date_trunc("week", "event_timestamp")) \
        .groupBy("feature_name", "week_start").agg(
            F.countDistinct("user_id").alias("weekly_users")
        ).withColumn("prev_week_users", F.lag("weekly_users").over(weekly_window)) \
         .withColumn("wow_growth",
            F.when(F.col("prev_week_users") > 0,
                (F.col("weekly_users") - F.col("prev_week_users")) / F.col("prev_week_users")
            ).otherwise(F.lit(0.0))
        )

    feature_health = weekly_usage.groupBy("feature_name").agg(
        F.avg("wow_growth").alias("avg_wow_growth"),
        F.last("weekly_users").alias("latest_weekly_users")
    )

    # Identify underperforming features (adoption < 10%, negative growth)
    underperforming = adoption.join(feature_health, "feature_name") \
        .filter((F.col("adoption_rate") < 0.10) | (F.col("avg_wow_growth") < -0.1))

    # Generate PRD recommendations via ai_query for underperforming features
    recommendations = underperforming.withColumn("recommendation",
        F.expr("""ai_query(
            'databricks-meta-llama-3-1-70b-instruct',
            concat('As a product analyst, this feature has low adoption (',
                   round(adoption_rate * 100, 1), '%) and growth trend of ',
                   round(avg_wow_growth * 100, 1), '%. Feature: ', feature_name,
                   '. Provide a concise PRD recommendation to improve adoption in 2-3 sentences.')
        )""")
    )

    # Write product metrics
    product_metrics = adoption.join(feature_health, "feature_name", "left") \
        .join(recommendations.select("feature_name", "recommendation"), "feature_name", "left") \
        .withColumn("analyzed_at", F.current_timestamp()) \
        .withColumn("lookback_days", F.lit(lookback_days))

    target = DeltaTable.forName(spark, f"{catalog}.product_metrics")
    target.alias("t").merge(
        product_metrics.alias("s"),
        "t.feature_name = s.feature_name"
    ).whenMatchedUpdateAll() \
     .whenNotMatchedInsertAll() \
     .execute()

    # Log metrics to MLflow
    mlflow.log_metric("total_features_analyzed", adoption.count())
    mlflow.log_metric("underperforming_count", underperforming.count())
    mlflow.log_metric("avg_adoption_rate", adoption.agg(F.avg("adoption_rate")).collect()[0][0] or 0)

    print(f"Product analysis complete. {adoption.count()} features analyzed, "
          f"{underperforming.count()} underperforming.")
$py$,
  config_yaml = $yml$
agent:
  name: bmad-mary
  role: Product Analyst
  schedule: "0 8 * * *"
  timeout_minutes: 30
  cluster:
    node_type: Standard_DS3_v2
    min_workers: 1
    max_workers: 4
  parameters:
    lookback_days: 30
    adoption_threshold: 0.10
    growth_threshold: -0.10
  alerts:
    underperforming_features_threshold: 5
$yml$,
  dependencies = ARRAY['pyspark', 'delta-spark', 'mlflow'],
  notes = 'Databricks-native. Reads feature_telemetry, computes adoption/engagement/health metrics, uses ai_query() for PRD recommendations, writes to product_metrics via MERGE. MLflow tracked.'
WHERE slug = 'bmad-mary';

-- ============================================================
-- 31. bmad-john (Architect)
-- ============================================================
UPDATE agent_implementations SET
  production_code = $py$
from pyspark.sql import SparkSession
from pyspark.sql import functions as F
from pyspark.sql.types import StructType, StructField, StringType, FloatType, ArrayType
from delta.tables import DeltaTable
import mlflow
from datetime import datetime

spark = SparkSession.builder.getOrCreate()
dbutils.widgets.text("catalog", "soc_platform")
dbutils.widgets.text("complexity_threshold", "0.7")

catalog = dbutils.widgets.get("catalog")
complexity_threshold = float(dbutils.widgets.get("complexity_threshold"))

mlflow.set_experiment(f"/{catalog}/bmad_john_architect")

with mlflow.start_run(run_name=f"architecture_assessment_{datetime.now().strftime('%Y%m%d_%H%M')}"):
    # Read system configuration and pattern data
    agent_configs = spark.table(f"{catalog}.agent_configs")
    correlation_rules = spark.table(f"{catalog}.correlation_rules")
    discovered_patterns = spark.table(f"{catalog}.discovered_patterns")

    # Build dependency graph from agent configs
    # Extract agent dependencies from config references
    agent_deps = agent_configs.select(
        F.col("agent_id"),
        F.col("agent_name"),
        F.explode_outer(F.col("depends_on")).alias("dependency")
    )

    # Compute coupling metrics (fan-in, fan-out per agent)
    fan_out = agent_deps.groupBy("agent_id", "agent_name").agg(
        F.count("dependency").alias("fan_out"),
        F.collect_set("dependency").alias("outbound_deps")
    )

    fan_in = agent_deps.groupBy("dependency").agg(
        F.count("agent_id").alias("fan_in"),
        F.collect_set("agent_id").alias("inbound_deps")
    ).withColumnRenamed("dependency", "agent_id")

    coupling = fan_out.join(fan_in, "agent_id", "full_outer") \
        .fillna(0, subset=["fan_in", "fan_out"]) \
        .withColumn("coupling_score",
            (F.col("fan_in") + F.col("fan_out")) /
            (2.0 * F.lit(agent_configs.count()).cast("double"))
        )

    # Detect circular dependencies using self-join
    circular = agent_deps.alias("a").join(
        agent_deps.alias("b"),
        (F.col("a.agent_id") == F.col("b.dependency")) &
        (F.col("a.dependency") == F.col("b.agent_id"))
    ).select(
        F.col("a.agent_id").alias("agent_a"),
        F.col("a.dependency").alias("agent_b")
    ).distinct()

    circular_count = circular.count()

    # Assess pattern complexity
    pattern_complexity = discovered_patterns.groupBy("pattern_type").agg(
        F.count("*").alias("pattern_count"),
        F.avg("confidence_score").alias("avg_confidence")
    )

    # Compute rule density per agent
    rule_density = correlation_rules.groupBy("source_agent").agg(
        F.count("*").alias("rule_count"),
        F.avg("complexity_score").alias("avg_rule_complexity")
    ).withColumnRenamed("source_agent", "agent_id")

    # Generate architecture health score
    architecture_scores = coupling.join(rule_density, "agent_id", "left") \
        .fillna(0) \
        .withColumn("health_score",
            F.lit(1.0) - (
                F.col("coupling_score") * 0.4 +
                F.least(F.col("avg_rule_complexity") / 10.0, F.lit(1.0)) * 0.3 +
                F.when(F.col("agent_id").isin(
                    [r[0] for r in circular.select("agent_a").collect()]
                ), 0.3).otherwise(0.0)
            )
        ).withColumn("assessed_at", F.current_timestamp()) \
         .withColumn("circular_dependency_flag",
            F.col("agent_id").isin([r[0] for r in circular.select("agent_a").collect()])
        )

    # Use ai_query for architecture recommendations on high-complexity agents
    high_complexity = architecture_scores.filter(F.col("health_score") < complexity_threshold)

    assessed_with_recs = architecture_scores.withColumn("recommendation",
        F.when(F.col("health_score") < complexity_threshold,
            F.expr("""ai_query(
                'databricks-meta-llama-3-1-70b-instruct',
                concat('As a software architect, agent "', agent_name,
                       '" has coupling_score=', round(coupling_score, 3),
                       ', fan_in=', fan_in, ', fan_out=', fan_out,
                       '. Suggest 1-2 architectural improvements in one sentence.')
            )""")
        ).otherwise(F.lit(None))
    )

    # Write architecture assessments
    target = DeltaTable.forName(spark, f"{catalog}.architecture_assessments")
    target.alias("t").merge(
        assessed_with_recs.alias("s"),
        "t.agent_id = s.agent_id"
    ).whenMatchedUpdateAll() \
     .whenNotMatchedInsertAll() \
     .execute()

    # MLflow logging
    mlflow.log_metric("total_agents_assessed", architecture_scores.count())
    mlflow.log_metric("circular_dependencies", circular_count)
    mlflow.log_metric("high_complexity_agents", high_complexity.count())
    avg_health = architecture_scores.agg(F.avg("health_score")).collect()[0][0] or 0
    mlflow.log_metric("avg_health_score", avg_health)

    print(f"Architecture assessment complete. {architecture_scores.count()} agents assessed. "
          f"Circular deps: {circular_count}. Avg health: {avg_health:.3f}")
$py$,
  config_yaml = $yml$
agent:
  name: bmad-john
  role: Architect
  schedule: "0 6 * * 1"
  timeout_minutes: 45
  cluster:
    node_type: Standard_DS4_v2
    min_workers: 2
    max_workers: 8
  parameters:
    complexity_threshold: 0.7
  alerts:
    circular_dependency_detected: true
    health_below_threshold: 0.5
$yml$,
  dependencies = ARRAY['pyspark', 'delta-spark', 'mlflow'],
  notes = 'Databricks-native. Reads agent_configs, correlation_rules, discovered_patterns to compute dependency graphs, coupling metrics, circular dependency detection. Writes architecture_assessments via MERGE. ai_query() for recommendations.'
WHERE slug = 'bmad-john';

-- ============================================================
-- 32. bmad-winston (Tech Lead)
-- ============================================================
UPDATE agent_implementations SET
  production_code = $py$
from pyspark.sql import SparkSession
from pyspark.sql import functions as F
from pyspark.sql.window import Window
from delta.tables import DeltaTable
import mlflow
from datetime import datetime, timedelta

spark = SparkSession.builder.getOrCreate()
dbutils.widgets.text("catalog", "soc_platform")
dbutils.widgets.text("lookback_days", "14")
dbutils.widgets.text("debt_threshold", "0.6")

catalog = dbutils.widgets.get("catalog")
lookback_days = int(dbutils.widgets.get("lookback_days"))
debt_threshold = float(dbutils.widgets.get("debt_threshold"))

mlflow.set_experiment(f"/{catalog}/bmad_winston_tech_lead")

with mlflow.start_run(run_name=f"tech_debt_assessment_{datetime.now().strftime('%Y%m%d_%H%M')}"):
    cutoff = datetime.now() - timedelta(days=lookback_days)

    # Read agent performance metrics
    perf_metrics = spark.table(f"{catalog}.agent_performance_metrics") \
        .filter(F.col("recorded_at") >= F.lit(cutoff))

    # Read orchestration logs for error patterns
    orch_logs = spark.table(f"{catalog}.agent_orchestration_logs") \
        .filter(F.col("created_at") >= F.lit(cutoff))

    # Identify slow agents (p95 execution time)
    slow_agents = perf_metrics.groupBy("agent_id", "agent_name").agg(
        F.percentile_approx("execution_time_ms", 0.95).alias("p95_exec_ms"),
        F.percentile_approx("execution_time_ms", 0.50).alias("p50_exec_ms"),
        F.avg("execution_time_ms").alias("avg_exec_ms"),
        F.count("*").alias("total_executions"),
        F.avg("memory_usage_mb").alias("avg_memory_mb")
    ).withColumn("slowness_score",
        F.when(F.col("p95_exec_ms") > 30000, 1.0)
         .when(F.col("p95_exec_ms") > 15000, 0.7)
         .when(F.col("p95_exec_ms") > 5000, 0.4)
         .otherwise(0.1)
    )

    # Analyze error patterns from orchestration logs
    error_analysis = orch_logs.filter(F.col("status").isin(["failed", "error", "timeout"])) \
        .groupBy("agent_id").agg(
            F.count("*").alias("error_count"),
            F.countDistinct("error_type").alias("unique_error_types"),
            F.collect_set("error_type").alias("error_types")
        )

    total_runs = orch_logs.groupBy("agent_id").agg(
        F.count("*").alias("total_runs")
    )

    failure_rates = error_analysis.join(total_runs, "agent_id", "right") \
        .fillna(0, subset=["error_count", "unique_error_types"]) \
        .withColumn("failure_rate", F.col("error_count") / F.col("total_runs"))

    # Compute retry frequency
    retries = orch_logs.filter(F.col("is_retry") == True) \
        .groupBy("agent_id").agg(
            F.count("*").alias("retry_count")
        )

    retry_rates = retries.join(total_runs, "agent_id", "right") \
        .fillna(0, subset=["retry_count"]) \
        .withColumn("retry_rate", F.col("retry_count") / F.col("total_runs"))

    # Compute technical debt score
    tech_debt = slow_agents.join(failure_rates, "agent_id", "left") \
        .join(retry_rates.select("agent_id", "retry_rate", "retry_count"), "agent_id", "left") \
        .fillna(0) \
        .withColumn("tech_debt_score",
            F.col("slowness_score") * 0.3 +
            F.least(F.col("failure_rate") * 2.0, F.lit(1.0)) * 0.4 +
            F.least(F.col("retry_rate") * 3.0, F.lit(1.0)) * 0.3
        ).withColumn("debt_category",
            F.when(F.col("tech_debt_score") >= 0.8, "critical")
             .when(F.col("tech_debt_score") >= 0.6, "high")
             .when(F.col("tech_debt_score") >= 0.3, "moderate")
             .otherwise("low")
        ).withColumn("assessed_at", F.current_timestamp()) \
         .withColumn("lookback_days", F.lit(lookback_days))

    # Generate remediation suggestions for high-debt agents
    high_debt = tech_debt.filter(F.col("tech_debt_score") >= debt_threshold)

    tech_debt_final = tech_debt.withColumn("remediation",
        F.when(F.col("tech_debt_score") >= debt_threshold,
            F.expr("""ai_query(
                'databricks-meta-llama-3-1-70b-instruct',
                concat('As a tech lead, agent "', agent_name,
                       '" has tech debt score ', round(tech_debt_score, 2),
                       '. Failure rate: ', round(failure_rate * 100, 1), '%',
                       ', p95 latency: ', p95_exec_ms, 'ms',
                       ', retry rate: ', round(retry_rate * 100, 1), '%',
                       '. Suggest top remediation action in one sentence.')
            )""")
        ).otherwise(F.lit(None))
    )

    # Write tech debt assessments via MERGE
    target = DeltaTable.forName(spark, f"{catalog}.tech_debt_assessments")
    target.alias("t").merge(
        tech_debt_final.alias("s"),
        "t.agent_id = s.agent_id"
    ).whenMatchedUpdateAll() \
     .whenNotMatchedInsertAll() \
     .execute()

    # MLflow logging
    mlflow.log_metric("agents_assessed", tech_debt.count())
    mlflow.log_metric("critical_debt_agents", tech_debt.filter(F.col("debt_category") == "critical").count())
    mlflow.log_metric("high_debt_agents", high_debt.count())
    avg_debt = tech_debt.agg(F.avg("tech_debt_score")).collect()[0][0] or 0
    mlflow.log_metric("avg_tech_debt_score", avg_debt)

    print(f"Tech debt assessment complete. {tech_debt.count()} agents assessed. "
          f"Avg debt score: {avg_debt:.3f}. Critical: "
          f"{tech_debt.filter(F.col('debt_category') == 'critical').count()}")
$py$,
  config_yaml = $yml$
agent:
  name: bmad-winston
  role: Tech Lead
  schedule: "0 7 * * *"
  timeout_minutes: 35
  cluster:
    node_type: Standard_DS3_v2
    min_workers: 1
    max_workers: 4
  parameters:
    lookback_days: 14
    debt_threshold: 0.6
  alerts:
    critical_debt_agents_threshold: 3
    avg_debt_score_threshold: 0.5
$yml$,
  dependencies = ARRAY['pyspark', 'delta-spark', 'mlflow'],
  notes = 'Databricks-native. Reads agent_performance_metrics and agent_orchestration_logs for error/retry/latency patterns. Computes tech debt scores, writes tech_debt_assessments via MERGE. ai_query() for remediation suggestions.'
WHERE slug = 'bmad-winston';

-- ============================================================
-- 33. bmad-sally (Developer)
-- ============================================================
UPDATE agent_implementations SET
  production_code = $py$
from pyspark.sql import SparkSession
from pyspark.sql import functions as F
from pyspark.sql.window import Window
from delta.tables import DeltaTable
import mlflow
from datetime import datetime, timedelta

spark = SparkSession.builder.getOrCreate()
dbutils.widgets.text("catalog", "soc_platform")
dbutils.widgets.text("lookback_days", "30")

catalog = dbutils.widgets.get("catalog")
lookback_days = int(dbutils.widgets.get("lookback_days"))

mlflow.set_experiment(f"/{catalog}/bmad_sally_developer")

with mlflow.start_run(run_name=f"dev_velocity_{datetime.now().strftime('%Y%m%d_%H%M')}"):
    cutoff = datetime.now() - timedelta(days=lookback_days)

    # Read discovered patterns (patterns not yet converted to rules)
    patterns = spark.table(f"{catalog}.discovered_patterns")

    # Read correlation rules (rules created over time)
    rules = spark.table(f"{catalog}.correlation_rules")

    # Read agent feedback for quality signals
    feedback = spark.table(f"{catalog}.agent_feedback") \
        .filter(F.col("created_at") >= F.lit(cutoff))

    # Compute pattern-to-rule conversion tracking
    # Match patterns that have been converted to rules
    converted = patterns.alias("p").join(
        rules.alias("r"),
        F.col("p.pattern_id") == F.col("r.source_pattern_id"),
        "left"
    ).withColumn("is_converted", F.col("r.rule_id").isNotNull()) \
     .withColumn("conversion_time_hours",
        F.when(F.col("is_converted"),
            (F.unix_timestamp("r.created_at") - F.unix_timestamp("p.discovered_at")) / 3600.0
        )
    )

    # Conversion rate overall
    total_patterns = converted.count()
    converted_count = converted.filter(F.col("is_converted")).count()
    conversion_rate = converted_count / max(total_patterns, 1)

    # Weekly throughput (rules created per week)
    weekly_window = Window.orderBy("week_start")

    weekly_rules = rules.filter(F.col("created_at") >= F.lit(cutoff)) \
        .withColumn("week_start", F.date_trunc("week", "created_at")) \
        .groupBy("week_start").agg(
            F.count("*").alias("rules_created"),
            F.countDistinct("source_pattern_id").alias("patterns_converted")
        ).withColumn("cumulative_rules", F.sum("rules_created").over(weekly_window))

    # Time-to-production metrics
    time_to_prod = converted.filter(F.col("is_converted")).agg(
        F.avg("conversion_time_hours").alias("avg_time_to_prod_hours"),
        F.percentile_approx("conversion_time_hours", 0.5).alias("median_time_to_prod_hours"),
        F.percentile_approx("conversion_time_hours", 0.95).alias("p95_time_to_prod_hours")
    ).collect()[0]

    # Feedback-based quality score
    quality_metrics = feedback.groupBy("target_agent").agg(
        F.avg("rating").alias("avg_rating"),
        F.count("*").alias("feedback_count"),
        F.sum(F.when(F.col("sentiment") == "positive", 1).otherwise(0)).alias("positive_count")
    ).withColumn("quality_score",
        F.col("avg_rating") / 5.0 * 0.7 +
        (F.col("positive_count") / F.col("feedback_count")) * 0.3
    )

    # Build velocity summary
    velocity_data = spark.createDataFrame([{
        "period_start": cutoff,
        "period_end": datetime.now(),
        "total_patterns_discovered": total_patterns,
        "patterns_converted": converted_count,
        "conversion_rate": conversion_rate,
        "avg_time_to_prod_hours": float(time_to_prod["avg_time_to_prod_hours"] or 0),
        "median_time_to_prod_hours": float(time_to_prod["median_time_to_prod_hours"] or 0),
        "p95_time_to_prod_hours": float(time_to_prod["p95_time_to_prod_hours"] or 0),
        "assessed_at": datetime.now()
    }])

    # Write weekly throughput detail
    weekly_rules_output = weekly_rules.withColumn("assessed_at", F.current_timestamp()) \
        .withColumn("lookback_days", F.lit(lookback_days))

    # Write to development_velocity via MERGE
    target = DeltaTable.forName(spark, f"{catalog}.development_velocity")
    target.alias("t").merge(
        velocity_data.alias("s"),
        "t.period_start = s.period_start AND t.period_end = s.period_end"
    ).whenMatchedUpdateAll() \
     .whenNotMatchedInsertAll() \
     .execute()

    # Also append weekly detail
    weekly_rules_output.write.mode("append").saveAsTable(
        f"{catalog}.development_velocity_weekly"
    )

    # MLflow logging
    mlflow.log_metric("conversion_rate", conversion_rate)
    mlflow.log_metric("total_patterns", total_patterns)
    mlflow.log_metric("converted_patterns", converted_count)
    mlflow.log_metric("avg_time_to_prod_hours", float(time_to_prod["avg_time_to_prod_hours"] or 0))
    mlflow.log_metric("rules_created_in_period", rules.filter(F.col("created_at") >= F.lit(cutoff)).count())

    print(f"Development velocity analysis complete. Conversion rate: {conversion_rate:.1%}. "
          f"Avg time-to-prod: {time_to_prod['avg_time_to_prod_hours']:.1f}h. "
          f"Patterns: {total_patterns}, Converted: {converted_count}")
$py$,
  config_yaml = $yml$
agent:
  name: bmad-sally
  role: Developer
  schedule: "0 9 * * 1"
  timeout_minutes: 25
  cluster:
    node_type: Standard_DS3_v2
    min_workers: 1
    max_workers: 4
  parameters:
    lookback_days: 30
  alerts:
    conversion_rate_below: 0.3
    time_to_prod_above_hours: 168
$yml$,
  dependencies = ARRAY['pyspark', 'delta-spark', 'mlflow'],
  notes = 'Databricks-native. Reads discovered_patterns, correlation_rules, agent_feedback to compute implementation velocity. Tracks pattern-to-rule conversion rate, time-to-production. Writes development_velocity via MERGE.'
WHERE slug = 'bmad-sally';

-- ============================================================
-- 34. bmad-amelia (QA Specialist)
-- ============================================================
UPDATE agent_implementations SET
  production_code = $py$
from pyspark.sql import SparkSession
from pyspark.sql import functions as F
from pyspark.sql.window import Window
from delta.tables import DeltaTable
import mlflow
from datetime import datetime, timedelta

spark = SparkSession.builder.getOrCreate()
dbutils.widgets.text("catalog", "soc_platform")
dbutils.widgets.text("lookback_days", "14")
dbutils.widgets.text("min_alerts_for_eval", "10")

catalog = dbutils.widgets.get("catalog")
lookback_days = int(dbutils.widgets.get("lookback_days"))
min_alerts = int(dbutils.widgets.get("min_alerts_for_eval"))

mlflow.set_experiment(f"/{catalog}/bmad_amelia_qa_specialist")

with mlflow.start_run(run_name=f"detection_qa_{datetime.now().strftime('%Y%m%d_%H%M')}"):
    cutoff = datetime.now() - timedelta(days=lookback_days)

    # Read correlation rules
    rules = spark.table(f"{catalog}.correlation_rules")

    # Read alerts with true/false positive labels
    alerts = spark.table(f"{catalog}.alerts") \
        .filter(F.col("created_at") >= F.lit(cutoff))

    # Cross-reference rules against alerts for effectiveness
    rule_alerts = alerts.filter(F.col("source_rule_id").isNotNull()) \
        .groupBy("source_rule_id").agg(
            F.count("*").alias("total_alerts"),
            F.sum(F.when(F.col("is_true_positive") == True, 1).otherwise(0)).alias("true_positives"),
            F.sum(F.when(F.col("is_true_positive") == False, 1).otherwise(0)).alias("false_positives"),
            F.sum(F.when(F.col("is_true_positive").isNull(), 1).otherwise(0)).alias("unlabeled")
        )

    # Compute known positives that rules SHOULD have caught (for recall)
    # True incidents not caught by any rule
    all_true_incidents = alerts.filter(F.col("is_true_positive") == True) \
        .select("incident_id").distinct().count()

    caught_by_rule = alerts.filter(
        (F.col("is_true_positive") == True) & (F.col("source_rule_id").isNotNull())
    ).groupBy("source_rule_id").agg(
        F.countDistinct("incident_id").alias("incidents_caught")
    )

    # Compute precision, recall, F1 per rule
    rule_effectiveness = rules.join(
        rule_alerts, rules.rule_id == rule_alerts.source_rule_id, "left"
    ).join(
        caught_by_rule, rules.rule_id == caught_by_rule.source_rule_id, "left"
    ).fillna(0, subset=["total_alerts", "true_positives", "false_positives", "unlabeled", "incidents_caught"]) \
     .withColumn("precision",
        F.when(F.col("total_alerts") > 0,
            F.col("true_positives") / (F.col("true_positives") + F.col("false_positives"))
        ).otherwise(F.lit(None))
    ).withColumn("recall",
        F.when(F.lit(all_true_incidents) > 0,
            F.col("incidents_caught") / F.lit(all_true_incidents)
        ).otherwise(F.lit(None))
    ).withColumn("f1_score",
        F.when((F.col("precision") > 0) & (F.col("recall") > 0),
            2.0 * (F.col("precision") * F.col("recall")) / (F.col("precision") + F.col("recall"))
        ).otherwise(F.lit(0.0))
    )

    # Filter to rules with sufficient alert volume for meaningful evaluation
    evaluable_rules = rule_effectiveness.filter(F.col("total_alerts") >= min_alerts)

    # Identify rules needing tuning (low precision or low F1)
    needs_tuning = evaluable_rules.filter(
        (F.col("precision") < 0.5) | (F.col("f1_score") < 0.4)
    )

    # Generate tuning recommendations via ai_query
    qa_report = rule_effectiveness.withColumn("tuning_recommendation",
        F.when((F.col("total_alerts") >= min_alerts) &
               ((F.col("precision") < 0.5) | (F.col("f1_score") < 0.4)),
            F.expr("""ai_query(
                'databricks-meta-llama-3-1-70b-instruct',
                concat('As a QA specialist for detection rules, rule "', rule_name,
                       '" has precision=', round(precision, 3),
                       ', recall=', round(coalesce(recall, 0), 3),
                       ', F1=', round(f1_score, 3),
                       ', total_alerts=', total_alerts,
                       ', false_positives=', false_positives,
                       '. Suggest a specific tuning action in one sentence.')
            )""")
        ).otherwise(F.lit(None))
    ).withColumn("assessed_at", F.current_timestamp()) \
     .withColumn("lookback_days", F.lit(lookback_days)) \
     .withColumn("quality_tier",
        F.when(F.col("f1_score") >= 0.8, "excellent")
         .when(F.col("f1_score") >= 0.6, "good")
         .when(F.col("f1_score") >= 0.4, "needs_improvement")
         .otherwise("critical")
    )

    # Write QA reports via MERGE
    target = DeltaTable.forName(spark, f"{catalog}.detection_quality_reports")
    target.alias("t").merge(
        qa_report.alias("s"),
        "t.rule_id = s.rule_id"
    ).whenMatchedUpdateAll() \
     .whenNotMatchedInsertAll() \
     .execute()

    # MLflow logging
    mlflow.log_metric("total_rules_evaluated", evaluable_rules.count())
    mlflow.log_metric("rules_needing_tuning", needs_tuning.count())
    avg_precision = evaluable_rules.agg(F.avg("precision")).collect()[0][0] or 0
    avg_f1 = evaluable_rules.agg(F.avg("f1_score")).collect()[0][0] or 0
    mlflow.log_metric("avg_precision", avg_precision)
    mlflow.log_metric("avg_f1_score", avg_f1)

    print(f"Detection QA complete. {evaluable_rules.count()} rules evaluated. "
          f"Avg precision: {avg_precision:.3f}, Avg F1: {avg_f1:.3f}. "
          f"Rules needing tuning: {needs_tuning.count()}")
$py$,
  config_yaml = $yml$
agent:
  name: bmad-amelia
  role: QA Specialist
  schedule: "0 10 * * *"
  timeout_minutes: 40
  cluster:
    node_type: Standard_DS4_v2
    min_workers: 2
    max_workers: 8
  parameters:
    lookback_days: 14
    min_alerts_for_eval: 10
    precision_threshold: 0.5
    f1_threshold: 0.4
  alerts:
    rules_needing_tuning_threshold: 10
    avg_precision_below: 0.6
$yml$,
  dependencies = ARRAY['pyspark', 'delta-spark', 'mlflow'],
  notes = 'Databricks-native. Reads correlation_rules cross-referenced against alerts for true/false positive rates. Computes precision, recall, F1 per rule. Identifies rules needing tuning. Writes detection_quality_reports via MERGE. ai_query() for tuning recommendations.'
WHERE slug = 'bmad-amelia';

-- ============================================================
-- 35. bmad-paige (Scrum Master)
-- ============================================================
UPDATE agent_implementations SET
  production_code = $py$
from pyspark.sql import SparkSession
from pyspark.sql import functions as F
from pyspark.sql.window import Window
from delta.tables import DeltaTable
import mlflow
from datetime import datetime, timedelta

spark = SparkSession.builder.getOrCreate()
dbutils.widgets.text("catalog", "soc_platform")
dbutils.widgets.text("sprint_days", "14")
dbutils.widgets.text("wip_limit", "5")

catalog = dbutils.widgets.get("catalog")
sprint_days = int(dbutils.widgets.get("sprint_days"))
wip_limit = int(dbutils.widgets.get("wip_limit"))

mlflow.set_experiment(f"/{catalog}/bmad_paige_scrum_master")

with mlflow.start_run(run_name=f"sprint_report_{datetime.now().strftime('%Y%m%d_%H%M')}"):
    sprint_start = datetime.now() - timedelta(days=sprint_days)

    # Read agent tasks (backlog)
    tasks = spark.table(f"{catalog}.agent_tasks")

    # Read orchestration logs (completed work)
    orch_logs = spark.table(f"{catalog}.agent_orchestration_logs") \
        .filter(F.col("created_at") >= F.lit(sprint_start))

    # Sprint task metrics
    sprint_tasks = tasks.filter(
        (F.col("sprint_start_date") >= F.lit(sprint_start)) |
        (F.col("status").isin(["in_progress", "completed"]))
    )

    task_summary = sprint_tasks.groupBy("status").agg(
        F.count("*").alias("task_count")
    )

    total_planned = sprint_tasks.count()
    completed_tasks = sprint_tasks.filter(F.col("status") == "completed").count()
    completion_rate = completed_tasks / max(total_planned, 1)

    # Cycle time: time from "in_progress" to "completed"
    cycle_times = sprint_tasks.filter(
        (F.col("status") == "completed") &
        F.col("started_at").isNotNull() &
        F.col("completed_at").isNotNull()
    ).withColumn("cycle_time_hours",
        (F.unix_timestamp("completed_at") - F.unix_timestamp("started_at")) / 3600.0
    )

    cycle_stats = cycle_times.agg(
        F.avg("cycle_time_hours").alias("avg_cycle_time_hours"),
        F.percentile_approx("cycle_time_hours", 0.5).alias("median_cycle_time_hours"),
        F.percentile_approx("cycle_time_hours", 0.95).alias("p95_cycle_time_hours")
    ).collect()[0]

    # Throughput: completed tasks per day
    daily_throughput = orch_logs.filter(F.col("status") == "completed") \
        .withColumn("day", F.to_date("created_at")) \
        .groupBy("day").agg(
            F.count("*").alias("tasks_completed")
        )

    avg_daily_throughput = daily_throughput.agg(
        F.avg("tasks_completed")
    ).collect()[0][0] or 0

    # WIP analysis per agent
    wip_by_agent = tasks.filter(F.col("status") == "in_progress") \
        .groupBy("assigned_agent").agg(
            F.count("*").alias("wip_count")
        ).withColumn("exceeds_wip_limit", F.col("wip_count") > F.lit(wip_limit))

    agents_over_wip = wip_by_agent.filter(F.col("exceeds_wip_limit")).count()

    # Identify bottleneck agents (high WIP, long cycle times)
    agent_cycle = cycle_times.groupBy("assigned_agent").agg(
        F.avg("cycle_time_hours").alias("agent_avg_cycle_hours"),
        F.count("*").alias("agent_completed_count")
    )

    bottlenecks = wip_by_agent.join(agent_cycle, "assigned_agent", "left") \
        .withColumn("bottleneck_score",
            F.coalesce(F.col("wip_count") / F.lit(wip_limit), F.lit(0)) * 0.5 +
            F.coalesce(
                F.col("agent_avg_cycle_hours") /
                F.lit(float(cycle_stats["avg_cycle_time_hours"] or 1)),
                F.lit(0)
            ) * 0.5
        ).filter(F.col("bottleneck_score") > 1.0)

    # Build sprint report
    sprint_report = spark.createDataFrame([{
        "sprint_start": sprint_start,
        "sprint_end": datetime.now(),
        "sprint_days": sprint_days,
        "total_planned": total_planned,
        "completed": completed_tasks,
        "completion_rate": completion_rate,
        "avg_cycle_time_hours": float(cycle_stats["avg_cycle_time_hours"] or 0),
        "median_cycle_time_hours": float(cycle_stats["median_cycle_time_hours"] or 0),
        "p95_cycle_time_hours": float(cycle_stats["p95_cycle_time_hours"] or 0),
        "avg_daily_throughput": float(avg_daily_throughput),
        "agents_over_wip_limit": agents_over_wip,
        "bottleneck_agents_count": bottlenecks.count(),
        "assessed_at": datetime.now()
    }])

    # Generate sprint summary via ai_query
    sprint_report = sprint_report.withColumn("sprint_summary",
        F.expr(f"""ai_query(
            'databricks-meta-llama-3-1-70b-instruct',
            concat('As a scrum master, summarize this sprint in 2 sentences: ',
                   'Completion rate: {completion_rate:.1%}, ',
                   'Avg cycle time: {cycle_stats["avg_cycle_time_hours"]:.1f}h, ',
                   'Daily throughput: {avg_daily_throughput:.1f} tasks/day, ',
                   'Bottleneck agents: {bottlenecks.count()}, ',
                   'WIP violations: {agents_over_wip}. ',
                   'Include one actionable recommendation.')
        )""")
    )

    # Write workflow metrics via MERGE
    target = DeltaTable.forName(spark, f"{catalog}.workflow_metrics")
    target.alias("t").merge(
        sprint_report.alias("s"),
        "t.sprint_start = s.sprint_start AND t.sprint_end = s.sprint_end"
    ).whenMatchedUpdateAll() \
     .whenNotMatchedInsertAll() \
     .execute()

    # Write bottleneck detail
    if bottlenecks.count() > 0:
        bottlenecks.withColumn("sprint_start", F.lit(sprint_start)) \
            .withColumn("assessed_at", F.current_timestamp()) \
            .write.mode("append").saveAsTable(f"{catalog}.workflow_bottlenecks")

    # MLflow logging
    mlflow.log_metric("completion_rate", completion_rate)
    mlflow.log_metric("avg_cycle_time_hours", float(cycle_stats["avg_cycle_time_hours"] or 0))
    mlflow.log_metric("avg_daily_throughput", float(avg_daily_throughput))
    mlflow.log_metric("bottleneck_agents", bottlenecks.count())
    mlflow.log_metric("wip_violations", agents_over_wip)

    print(f"Sprint report complete. Completion: {completion_rate:.1%}. "
          f"Avg cycle: {cycle_stats['avg_cycle_time_hours']:.1f}h. "
          f"Throughput: {avg_daily_throughput:.1f}/day. "
          f"Bottlenecks: {bottlenecks.count()}")
$py$,
  config_yaml = $yml$
agent:
  name: bmad-paige
  role: Scrum Master
  schedule: "0 9 * * 5"
  timeout_minutes: 20
  cluster:
    node_type: Standard_DS3_v2
    min_workers: 1
    max_workers: 4
  parameters:
    sprint_days: 14
    wip_limit: 5
  alerts:
    completion_rate_below: 0.6
    bottleneck_agents_above: 3
    avg_cycle_time_above_hours: 72
$yml$,
  dependencies = ARRAY['pyspark', 'delta-spark', 'mlflow'],
  notes = 'Databricks-native. Reads agent_tasks and agent_orchestration_logs to compute sprint metrics: completion rate, cycle time, throughput, WIP limits. Identifies bottleneck agents. Writes workflow_metrics via MERGE. ai_query() for sprint summaries.'
WHERE slug = 'bmad-paige';
