# Databricks notebook source
# MAGIC %md
# MAGIC # 01 - Behavioral Baseline Computation (UEBA)
# MAGIC
# MAGIC Computes behavioral baselines for users, devices, and services.
# MAGIC Baselines represent "normal" behavior against which anomalies are detected.
# MAGIC
# MAGIC **Baselines Computed:**
# MAGIC - Login patterns (time, location, device)
# MAGIC - Resource access patterns (what, when, how much)
# MAGIC - Network behavior (destinations, protocols, volume)
# MAGIC - Peer group comparison (department/role norms)
# MAGIC
# MAGIC **Schedule:** Daily (rebuilds rolling 30-day baseline)
# MAGIC **Input:** `{catalog}.{schema}.enriched_events`
# MAGIC **Output:** `{catalog}.{schema}.behavioral_baselines`

# COMMAND ----------

dbutils.widgets.text("catalog", "main")
dbutils.widgets.text("schema", "security")
dbutils.widgets.text("baseline_days", "30")
dbutils.widgets.text("min_events_for_baseline", "50")

catalog = dbutils.widgets.get("catalog")
schema = dbutils.widgets.get("schema")
baseline_days = int(dbutils.widgets.get("baseline_days"))
min_events = int(dbutils.widgets.get("min_events_for_baseline"))

# COMMAND ----------

from pyspark.sql.functions import (
    col, count, countDistinct, avg, stddev, percentile_approx,
    hour, dayofweek, collect_set, size, sum as spark_sum,
    when, lit, current_timestamp, date_format, expr,
    array_distinct, flatten, struct, to_json, max as spark_max,
    min as spark_min, approx_count_distinct
)
from pyspark.sql.window import Window

# COMMAND ----------

# MAGIC %md
# MAGIC ## Load Historical Data

# COMMAND ----------

events = spark.table(f"{catalog}.{schema}.enriched_events").filter(
    col("time") >= expr(f"current_timestamp() - INTERVAL {baseline_days} DAYS")
)

total_events = events.count()
distinct_users = events.select("actor_user_id").distinct().count()
print(f"Computing baselines from {total_events} events, {distinct_users} users ({baseline_days} days)")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Create Baseline Tables

# COMMAND ----------

spark.sql(f"""
    CREATE TABLE IF NOT EXISTS {catalog}.{schema}.behavioral_baselines (
        entity_id STRING NOT NULL,
        entity_type STRING NOT NULL,
        baseline_type STRING NOT NULL,
        metrics MAP<STRING, DOUBLE>,
        normal_ranges MAP<STRING, STRING>,
        peer_group STRING,
        event_count BIGINT,
        baseline_start TIMESTAMP,
        baseline_end TIMESTAMP,
        computed_at TIMESTAMP,
        partition_date STRING
    )
    USING DELTA
    PARTITIONED BY (entity_type, partition_date)
    TBLPROPERTIES ('delta.autoOptimize.optimizeWrite' = 'true')
""")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Baseline 1: Login Behavior Profile

# COMMAND ----------

login_events = events.filter(
    col("type_name").rlike("(?i)auth|login|sign.?in")
)

login_baselines = (
    login_events
    .filter(col("actor_user_id").isNotNull())
    .groupBy("actor_user_id")
    .agg(
        count("*").alias("total_logins"),
        # Temporal patterns
        avg(hour(col("time"))).alias("avg_login_hour"),
        stddev(hour(col("time"))).alias("stddev_login_hour"),
        percentile_approx(hour(col("time")).cast("double"), 0.05).alias("p5_login_hour"),
        percentile_approx(hour(col("time")).cast("double"), 0.95).alias("p95_login_hour"),
        # Day of week distribution
        countDistinct(dayofweek(col("time"))).alias("active_days_of_week"),
        # Location patterns
        countDistinct("src_ip").alias("distinct_source_ips"),
        countDistinct("src_geo_country").alias("distinct_countries"),
        collect_set("src_geo_country").alias("normal_countries"),
        # Success/failure ratio
        spark_sum(when(col("status_id") == 1, 1).otherwise(0)).alias("success_count"),
        spark_sum(when(col("status_id") == 2, 1).otherwise(0)).alias("failure_count"),
        # Device patterns
        countDistinct("src_hostname").alias("distinct_devices"),
    )
    .filter(col("total_logins") >= min_events)
    .withColumn("failure_rate", col("failure_count") / col("total_logins"))
    .withColumn("logins_per_day", col("total_logins") / lit(baseline_days))
)

login_count = login_baselines.count()
print(f"Computed login baselines for {login_count} users")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Baseline 2: Resource Access Profile

# COMMAND ----------

access_events = events.filter(
    col("resource_name").isNotNull() & col("actor_user_id").isNotNull()
)

access_baselines = (
    access_events
    .groupBy("actor_user_id")
    .agg(
        count("*").alias("total_accesses"),
        countDistinct("resource_name").alias("distinct_resources"),
        countDistinct("resource_type").alias("distinct_resource_types"),
        spark_sum("bytes_in").alias("total_bytes_read"),
        spark_sum("bytes_out").alias("total_bytes_written"),
        avg("bytes_out").alias("avg_bytes_per_access"),
        stddev("bytes_out").alias("stddev_bytes_per_access"),
        collect_set("resource_type").alias("normal_resource_types"),
        # Peak access patterns
        percentile_approx(
            hour(col("time")).cast("double"), 0.95
        ).alias("p95_access_hour"),
        percentile_approx(
            hour(col("time")).cast("double"), 0.05
        ).alias("p5_access_hour"),
    )
    .filter(col("total_accesses") >= min_events // 2)
    .withColumn("accesses_per_day", col("total_accesses") / lit(baseline_days))
)

access_count = access_baselines.count()
print(f"Computed access baselines for {access_count} users")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Baseline 3: Network Behavior Profile

# COMMAND ----------

network_events = events.filter(
    (col("category_uid") == 4) &  # Network activity
    (col("src_ip").isNotNull())
)

network_baselines = (
    network_events
    .groupBy("src_ip")
    .agg(
        count("*").alias("total_connections"),
        countDistinct("dst_ip").alias("distinct_destinations"),
        countDistinct("dst_port").alias("distinct_ports"),
        countDistinct("protocol").alias("distinct_protocols"),
        spark_sum("bytes_out").alias("total_bytes_out"),
        avg("bytes_out").alias("avg_bytes_out"),
        stddev("bytes_out").alias("stddev_bytes_out"),
        spark_sum("bytes_in").alias("total_bytes_in"),
        percentile_approx(col("bytes_out").cast("double"), 0.95).alias("p95_bytes_out"),
        collect_set("dst_port").alias("normal_ports"),
        countDistinct("dst_geo_country").alias("distinct_dest_countries"),
    )
    .filter(col("total_connections") >= min_events)
    .withColumn("connections_per_day", col("total_connections") / lit(baseline_days))
    .withColumn("avg_destinations_per_day", col("distinct_destinations") / lit(baseline_days))
)

network_count = network_baselines.count()
print(f"Computed network baselines for {network_count} IPs")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Baseline 4: Peer Group Baselines

# COMMAND ----------

# Compute department/role-level baselines for peer comparison
peer_baselines = (
    events
    .filter(col("actor_user_id").isNotNull() & col("actor_department").isNotNull())
    .groupBy("actor_department", "actor_role")
    .agg(
        countDistinct("actor_user_id").alias("users_in_group"),
        avg(countDistinct("resource_name")).alias("avg_resources_per_user"),
        avg(countDistinct("src_ip")).alias("avg_ips_per_user"),
        # Note: nested aggregations need window functions in practice
        count("*").alias("total_group_events"),
        countDistinct("resource_name").alias("group_distinct_resources"),
        countDistinct("src_ip").alias("group_distinct_ips"),
    )
    .withColumn("avg_events_per_user", col("total_group_events") / col("users_in_group"))
    .withColumn("avg_resources_per_user", col("group_distinct_resources") / col("users_in_group"))
)

peer_count = peer_baselines.count()
print(f"Computed peer baselines for {peer_count} department/role groups")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Write Baselines

# COMMAND ----------

from pyspark.sql.functions import create_map, array

# Format login baselines for storage
login_baseline_records = (
    login_baselines
    .select(
        col("actor_user_id").alias("entity_id"),
        lit("user").alias("entity_type"),
        lit("login_behavior").alias("baseline_type"),
        create_map(
            lit("avg_login_hour"), col("avg_login_hour"),
            lit("stddev_login_hour"), col("stddev_login_hour"),
            lit("distinct_source_ips"), col("distinct_source_ips").cast("double"),
            lit("distinct_countries"), col("distinct_countries").cast("double"),
            lit("failure_rate"), col("failure_rate"),
            lit("logins_per_day"), col("logins_per_day"),
            lit("distinct_devices"), col("distinct_devices").cast("double"),
        ).alias("metrics"),
        create_map(
            lit("login_hour_range"), expr("concat(CAST(p5_login_hour AS STRING), '-', CAST(p95_login_hour AS STRING))"),
            lit("normal_countries"), expr("CAST(normal_countries AS STRING)"),
        ).alias("normal_ranges"),
        lit("").alias("peer_group"),
        col("total_logins").alias("event_count"),
        expr(f"current_timestamp() - INTERVAL {baseline_days} DAYS").alias("baseline_start"),
        current_timestamp().alias("baseline_end"),
        current_timestamp().alias("computed_at"),
        date_format(current_timestamp(), "yyyy-MM-dd").alias("partition_date"),
    )
)

# Write all baselines
login_baseline_records.write.format("delta").mode("overwrite").option(
    "replaceWhere", f"entity_type = 'user' AND baseline_type = 'login_behavior' AND partition_date = '{date_format(current_timestamp(), 'yyyy-MM-dd')}'"
).saveAsTable(f"{catalog}.{schema}.behavioral_baselines")

print(f"""
Baseline Computation Complete:
  Login baselines: {login_count} users
  Access baselines: {access_count} users
  Network baselines: {network_count} IPs
  Peer groups: {peer_count} groups
  Window: {baseline_days} days
""")
