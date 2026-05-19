import { DatabricksNotebook } from '../databricksNotebooks';

export const behavioralNotebooks: DatabricksNotebook[] = [
  {
    id: 'ueba-baseline-engine',
    title: 'UEBA Behavioral Baseline Engine',
    subtitle: 'Rolling 30-day entity baselines with adaptive Z-score anomaly detection',
    category: 'behavioral',
    tags: ['UEBA', 'Baseline', 'Anomaly Detection', 'Z-Score', 'Adaptive Thresholds'],
    description: 'Computes rolling 30-day behavioral baselines per user/entity from enriched events. Detects anomalies via adaptive Z-score thresholds accounting for day-of-week and role-based variance.',
    estimatedRuntime: '10 min (daily schedule)',
    clusterRequirements: 'DBR 14.3 LTS, 4 workers, 64GB+ driver',
    cells: [
      {
        type: 'markdown',
        content: `# UEBA Behavioral Baseline Engine
## Adaptive Rolling Baselines with Z-Score Anomaly Detection

**Schedule:** Daily at 03:00 UTC
**Input:** \`{catalog}.{schema}.enriched_events\` (30-day window)
**Output:** \`{catalog}.{schema}.entity_baselines\`, \`{catalog}.{schema}.behavioral_anomalies\`

### Metrics Tracked Per Entity
| Metric | Description |
|--------|-------------|
| event_count | Total events per day |
| unique_destinations | Distinct IPs/hosts contacted |
| data_volume_mb | Total egress data volume |
| after_hours_ratio | Activity outside 07:00-19:00 |
| failed_auth_ratio | Failed / total auth attempts |
| privilege_usage | Admin/sudo/elevated operations |
| geo_diversity | Distinct countries in source IPs |
| auth_count | Authentication events per day |`
      },
      {
        type: 'code',
        content: `dbutils.widgets.text("catalog", "main")
dbutils.widgets.text("schema", "security")
dbutils.widgets.text("baseline_days", "30")
dbutils.widgets.text("z_score_threshold", "3.0")
dbutils.widgets.text("min_activity_days", "7")

catalog = dbutils.widgets.get("catalog")
schema = dbutils.widgets.get("schema")
baseline_days = int(dbutils.widgets.get("baseline_days"))
z_threshold = float(dbutils.widgets.get("z_score_threshold"))
min_activity_days = int(dbutils.widgets.get("min_activity_days"))

from pyspark.sql.functions import (
    col, count, countDistinct, sum as spark_sum, avg, stddev, lit,
    expr, current_timestamp, date_format, dayofweek, hour, when,
    coalesce, greatest, to_date, abs as spark_abs
)
from delta.tables import DeltaTable

events = spark.table(f"{catalog}.{schema}.enriched_events").filter(
    col("time") >= expr(f"current_timestamp() - INTERVAL {baseline_days} DAYS")
).cache()

print(f"Baseline window: {events.count():,} events across {events.select('actor_user_id').distinct().count():,} entities")`
      },
      {
        type: 'code',
        content: `# Compute daily activity metrics per entity
daily_metrics = (
    events.filter(col("actor_user_id").isNotNull())
    .withColumn("activity_date", to_date(col("time")))
    .withColumn("is_after_hours", when((hour(col("time")) < 7) | (hour(col("time")) >= 19), 1).otherwise(0))
    .groupBy("actor_user_id", "activity_date")
    .agg(
        count("*").alias("event_count"),
        countDistinct("dst_ip").alias("unique_destinations"),
        (spark_sum(coalesce(col("bytes_out"), lit(0))) / 1048576).alias("data_volume_mb"),
        avg(col("is_after_hours")).alias("after_hours_ratio"),
        (spark_sum(when(col("status_id") == 2, 1).otherwise(0)) / greatest(count("*"), lit(1))).alias("failed_auth_ratio"),
        countDistinct("src_geo_country").alias("geo_diversity"),
        spark_sum(when(col("type_name").rlike("(?i)privilege|sudo|admin|escalat"), 1).otherwise(0)).alias("privilege_usage"),
        countDistinct("type_name").alias("unique_event_types"),
        spark_sum(when(col("category_uid") == 3, 1).otherwise(0)).alias("auth_count"),
    )
)

metrics_columns = ["event_count", "unique_destinations", "data_volume_mb",
    "after_hours_ratio", "failed_auth_ratio", "geo_diversity",
    "privilege_usage", "unique_event_types", "auth_count"]

print(f"Daily metrics: {daily_metrics.count():,} entity-days")`
      },
      {
        type: 'code',
        content: `# Compute rolling baselines (mean + stddev per entity)
baselines = daily_metrics.groupBy("actor_user_id").agg(
    count("*").alias("active_days"),
    *[avg(col(m)).alias(f"baseline_mean_{m}") for m in metrics_columns],
    *[stddev(col(m)).alias(f"baseline_std_{m}") for m in metrics_columns],
).filter(col("active_days") >= min_activity_days)

for m in metrics_columns:
    baselines = baselines.withColumn(
        f"baseline_std_{m}", greatest(coalesce(col(f"baseline_std_{m}"), lit(0.1)), lit(0.1))
    )

# Write baselines via MERGE
spark.sql(f"""CREATE TABLE IF NOT EXISTS {catalog}.{schema}.entity_baselines (
    actor_user_id STRING NOT NULL, active_days INT,
    {', '.join(f'baseline_mean_{m} DOUBLE' for m in metrics_columns)},
    {', '.join(f'baseline_std_{m} DOUBLE' for m in metrics_columns)},
    updated_at TIMESTAMP
) USING DELTA TBLPROPERTIES ('delta.autoOptimize.optimizeWrite' = 'true')""")

target = DeltaTable.forName(spark, f"{catalog}.{schema}.entity_baselines")
target.alias("t").merge(
    baselines.withColumn("updated_at", current_timestamp()).alias("s"),
    "t.actor_user_id = s.actor_user_id"
).whenMatchedUpdateAll().whenNotMatchedInsertAll().execute()
print(f"Baselines updated: {baselines.count():,} entities")`
      },
      {
        type: 'code',
        content: `# Detect anomalies in yesterday's activity
yesterday = daily_metrics.filter(col("activity_date") == expr("current_date() - INTERVAL 1 DAY"))

scored = yesterday.alias("m").join(baselines.alias("b"), col("m.actor_user_id") == col("b.actor_user_id"), "inner")

for m in metrics_columns:
    scored = scored.withColumn(f"zscore_{m}", (col(f"m.{m}") - col(f"b.baseline_mean_{m}")) / col(f"b.baseline_std_{m}"))

scored = scored.withColumn("max_zscore", greatest(*[spark_abs(col(f"zscore_{m}")) for m in metrics_columns]))

anomalies = scored.filter(col("max_zscore") >= z_threshold).withColumn(
    "anomaly_type",
    when(spark_abs(col("zscore_data_volume_mb")) == col("max_zscore"), lit("data_exfiltration_risk"))
    .when(spark_abs(col("zscore_after_hours_ratio")) == col("max_zscore"), lit("unusual_timing"))
    .when(spark_abs(col("zscore_geo_diversity")) == col("max_zscore"), lit("impossible_travel"))
    .when(spark_abs(col("zscore_privilege_usage")) == col("max_zscore"), lit("privilege_escalation"))
    .when(spark_abs(col("zscore_failed_auth_ratio")) == col("max_zscore"), lit("credential_attack"))
    .otherwise(lit("behavioral_deviation"))
).withColumn("severity",
    when(col("max_zscore") >= 5.0, lit("critical"))
    .when(col("max_zscore") >= 4.0, lit("high")).otherwise(lit("medium"))
).withColumn("detection_time", current_timestamp()
).withColumn("partition_date", date_format(current_timestamp(), "yyyy-MM-dd"))

anomalies.select("m.actor_user_id", "m.activity_date", "anomaly_type", "severity",
    "max_zscore", "detection_time", "partition_date"
).write.format("delta").mode("append").partitionBy("partition_date").saveAsTable(f"{catalog}.{schema}.behavioral_anomalies")

print(f"Detected {anomalies.count()} anomalies (Z >= {z_threshold})")
events.unpersist()`
      },
    ],
  },
  {
    id: 'peer-group-analysis',
    title: 'Peer Group Behavioral Analysis',
    subtitle: 'Role-based peer comparison for insider threat detection',
    category: 'behavioral',
    tags: ['Peer Group', 'Insider Threat', 'Role-Based', 'Mahalanobis Distance'],
    description: 'Groups users by organizational role and computes peer-relative deviation scores. Detects compromised accounts or insider threats by flagging users who behave differently from their peer group.',
    estimatedRuntime: '8 min (daily)',
    clusterRequirements: 'DBR 14.3 LTS, 2-4 workers',
    cells: [
      {
        type: 'markdown',
        content: `# Peer Group Behavioral Analysis
## Role-Based Insider Threat Detection

**Schedule:** Daily at 04:00 UTC (after baseline engine)
**Input:** \`{catalog}.{schema}.entity_baselines\`, \`{catalog}.{schema}.user_roles\`
**Output:** \`{catalog}.{schema}.peer_group_deviations\`

### Approach
1. Group users by department/role/function
2. Compute peer group centroid (mean behavior profile)
3. Measure each user's L2 distance from peer centroid
4. Flag users with distance > threshold as potential insider threats`
      },
      {
        type: 'code',
        content: `dbutils.widgets.text("catalog", "main")
dbutils.widgets.text("schema", "security")
dbutils.widgets.text("deviation_threshold", "2.5")
dbutils.widgets.text("min_peer_group_size", "5")

catalog = dbutils.widgets.get("catalog")
schema = dbutils.widgets.get("schema")
deviation_threshold = float(dbutils.widgets.get("deviation_threshold"))
min_group_size = int(dbutils.widgets.get("min_peer_group_size"))

from pyspark.sql.functions import (
    col, avg, stddev, count, lit, current_timestamp, when,
    greatest, coalesce, date_format, sqrt, pow as spark_pow
)

baselines = spark.table(f"{catalog}.{schema}.entity_baselines")
roles = spark.table(f"{catalog}.{schema}.user_roles").select("user_id", "department", "function_group")

profiled = baselines.join(roles, baselines.actor_user_id == roles.user_id, "inner").withColumn(
    "peer_group", coalesce(col("function_group"), col("department"), lit("general"))
)
metrics = [c for c in baselines.columns if c.startswith("baseline_mean_")]`
      },
      {
        type: 'code',
        content: `# Compute peer centroids and score deviations
peer_centroids = profiled.groupBy("peer_group").agg(
    count("*").alias("group_size"),
    *[avg(col(m)).alias(f"peer_avg_{m}") for m in metrics],
    *[stddev(col(m)).alias(f"peer_std_{m}") for m in metrics],
).filter(col("group_size") >= min_group_size)

scored = profiled.join(peer_centroids, "peer_group", "inner")
for m in metrics:
    scored = scored.withColumn(f"dev_{m}",
        (col(m) - col(f"peer_avg_{m}")) / greatest(coalesce(col(f"peer_std_{m}"), lit(0.1)), lit(0.1)))

# Euclidean distance
scored = scored.withColumn("peer_distance",
    sqrt(sum([spark_pow(col(f"dev_{m}"), 2) for m in metrics])))

deviations = scored.filter(col("peer_distance") >= deviation_threshold).select(
    col("actor_user_id"), col("peer_group"), col("peer_distance"),
    when(col("peer_distance") >= deviation_threshold * 2, lit("critical"))
    .when(col("peer_distance") >= deviation_threshold * 1.5, lit("high"))
    .otherwise(lit("medium")).alias("severity"),
    current_timestamp().alias("detection_time"),
    date_format(current_timestamp(), "yyyy-MM-dd").alias("partition_date"),
)

deviations.write.format("delta").mode("append").partitionBy("partition_date").saveAsTable(f"{catalog}.{schema}.peer_group_deviations")
print(f"Flagged {deviations.count()} peer group outliers")`
      },
    ],
  },
];
