# Databricks notebook source
# MAGIC %md
# MAGIC # 04 - Negative Correlation Engine
# MAGIC
# MAGIC Detects threats by identifying what DIDN'T happen — expected events that are
# MAGIC absent indicate potential compromise or evasion.
# MAGIC
# MAGIC **Detection Patterns:**
# MAGIC - Successful auth without MFA challenge (MFA bypass)
# MAGIC - Privilege escalation without prior approval workflow
# MAGIC - Data access without preceding search/navigation (direct URL access)
# MAGIC - Process execution without parent process chain (injection)
# MAGIC - Network connection without DNS resolution (hardcoded C2)
# MAGIC - Account used after offboarding event
# MAGIC - Service account active outside maintenance window
# MAGIC
# MAGIC **Input:** `{catalog}.{schema}.enriched_events`
# MAGIC **Output:** `{catalog}.{schema}.negative_correlation_detections`

# COMMAND ----------

dbutils.widgets.text("catalog", "main")
dbutils.widgets.text("schema", "security")
dbutils.widgets.text("lookback_hours", "24")

catalog = dbutils.widgets.get("catalog")
schema = dbutils.widgets.get("schema")
lookback_hours = int(dbutils.widgets.get("lookback_hours"))

# COMMAND ----------

from pyspark.sql.functions import (
    col, count, countDistinct, lit, current_timestamp, expr,
    date_format, when, collect_set, array_contains, size,
    min as spark_min, max as spark_max, sum as spark_sum
)
import uuid

# COMMAND ----------

# MAGIC %md
# MAGIC ## Load Recent Events

# COMMAND ----------

events = spark.table(f"{catalog}.{schema}.enriched_events").filter(
    col("time") >= expr(f"current_timestamp() - INTERVAL {lookback_hours} HOURS")
).cache()

event_count = events.count()
print(f"Analyzing {event_count} events for negative correlations ({lookback_hours}h)")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Create Output Table

# COMMAND ----------

spark.sql(f"""
    CREATE TABLE IF NOT EXISTS {catalog}.{schema}.negative_correlation_detections (
        detection_id STRING NOT NULL,
        detection_type STRING NOT NULL,
        rule_name STRING NOT NULL,
        severity STRING NOT NULL,
        entity_key STRING,
        entity_value STRING,
        expected_event STRING,
        actual_event STRING,
        description STRING,
        evidence MAP<STRING, STRING>,
        mitre_technique STRING,
        confidence DOUBLE,
        created_at TIMESTAMP,
        partition_date STRING
    )
    USING DELTA
    PARTITIONED BY (partition_date)
    TBLPROPERTIES ('delta.autoOptimize.optimizeWrite' = 'true')
""")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Detection 1: Authentication Without MFA Challenge

# COMMAND ----------

# Find successful auths
successful_auths = events.filter(
    (col("type_name").rlike("(?i)auth|login|sign.?in")) &
    (col("status_id") == 1)
)

# Find MFA challenges
mfa_events = events.filter(
    col("type_name").rlike("(?i)mfa|2fa|two.?factor|challenge|verify")
)

# Users who authenticated but never had MFA challenge
auth_users = successful_auths.select(
    col("actor_user_id"),
    col("time").alias("auth_time"),
    col("src_ip"),
    col("src_geo_country"),
    col("event_id"),
).filter(col("actor_user_id").isNotNull())

mfa_users = mfa_events.select(
    col("actor_user_id").alias("mfa_user"),
    col("time").alias("mfa_time"),
).filter(col("actor_user_id").isNotNull())

# Left anti join — users with auth but NO MFA
no_mfa = auth_users.join(
    mfa_users,
    (auth_users.actor_user_id == mfa_users.mfa_user) &
    (mfa_users.mfa_time.between(
        auth_users.auth_time - expr("INTERVAL 5 MINUTES"),
        auth_users.auth_time + expr("INTERVAL 1 MINUTE")
    )),
    "left_anti"
)

# Exclude service accounts and known exceptions
no_mfa_suspicious = no_mfa.filter(
    ~col("actor_user_id").rlike("(?i)^(svc|service|system|app)[-_]")
)

no_mfa_count = no_mfa_suspicious.count()
print(f"Auth without MFA: {no_mfa_count} events")

if no_mfa_count > 0:
    mfa_bypass_detections = (
        no_mfa_suspicious
        .groupBy("actor_user_id")
        .agg(
            count("*").alias("auth_count"),
            collect_set("src_ip").alias("source_ips"),
            collect_set("src_geo_country").alias("countries"),
            spark_min("auth_time").alias("first_auth"),
            spark_max("auth_time").alias("last_auth"),
        )
        .select(
            expr("uuid()").alias("detection_id"),
            lit("negative_correlation").alias("detection_type"),
            lit("mfa_bypass").alias("rule_name"),
            when(col("auth_count") >= 5, lit("critical"))
            .otherwise(lit("high")).alias("severity"),
            lit("actor_user_id").alias("entity_key"),
            col("actor_user_id").alias("entity_value"),
            lit("MFA challenge").alias("expected_event"),
            lit("Successful authentication").alias("actual_event"),
            expr("""
                concat('User ', actor_user_id, ' authenticated ', auth_count,
                       ' times without MFA from ', size(source_ips), ' IPs in ',
                       size(countries), ' countries')
            """).alias("description"),
            expr("""
                map('auth_count', CAST(auth_count AS STRING),
                    'source_ips', CAST(source_ips AS STRING),
                    'countries', CAST(countries AS STRING))
            """).alias("evidence"),
            lit("T1556").alias("mitre_technique"),
            lit(0.85).alias("confidence"),
            current_timestamp().alias("created_at"),
            date_format(current_timestamp(), "yyyy-MM-dd").alias("partition_date"),
        )
    )

# COMMAND ----------

# MAGIC %md
# MAGIC ## Detection 2: Network Connection Without DNS Resolution

# COMMAND ----------

# Find outbound network connections
outbound_connections = events.filter(
    (col("category_uid") == 4) &
    (col("dst_ip").isNotNull()) &
    (~col("dst_ip").rlike("^(10\\.|172\\.(1[6-9]|2|3[01])\\.|192\\.168\\.)"))  # Exclude RFC1918
)

# Find DNS queries
dns_queries = events.filter(
    col("type_name").rlike("(?i)dns|resolve|lookup")
).select(
    col("src_ip").alias("dns_client"),
    col("resource_name").alias("resolved_domain"),
    col("dst_ip").alias("resolved_ip"),
    col("time").alias("dns_time"),
)

# Connections to external IPs with no prior DNS resolution (hardcoded C2)
connections_with_dns = outbound_connections.join(
    dns_queries,
    (outbound_connections.src_ip == dns_queries.dns_client) &
    (outbound_connections.dst_ip == dns_queries.resolved_ip) &
    (dns_queries.dns_time.between(
        outbound_connections.time - expr("INTERVAL 10 MINUTES"),
        outbound_connections.time
    )),
    "left_anti"
)

no_dns_count = connections_with_dns.count()
print(f"Connections without DNS: {no_dns_count} events")

if no_dns_count > 0:
    no_dns_detections = (
        connections_with_dns
        .groupBy("src_ip", "dst_ip")
        .agg(
            count("*").alias("connection_count"),
            countDistinct("dst_port").alias("distinct_ports"),
            spark_sum("bytes_out").alias("total_bytes"),
        )
        .filter(col("connection_count") >= 3)
        .select(
            expr("uuid()").alias("detection_id"),
            lit("negative_correlation").alias("detection_type"),
            lit("no_dns_resolution").alias("rule_name"),
            when(col("connection_count") >= 20, lit("high"))
            .otherwise(lit("medium")).alias("severity"),
            lit("src_ip").alias("entity_key"),
            col("src_ip").alias("entity_value"),
            lit("DNS resolution").alias("expected_event"),
            lit("Direct IP connection").alias("actual_event"),
            expr("""
                concat(src_ip, ' connected to ', dst_ip, ' ',
                       connection_count, ' times without DNS resolution (possible hardcoded C2)')
            """).alias("description"),
            expr("""
                map('src_ip', src_ip, 'dst_ip', dst_ip,
                    'connections', CAST(connection_count AS STRING),
                    'total_bytes', CAST(total_bytes AS STRING))
            """).alias("evidence"),
            lit("T1071").alias("mitre_technique"),
            lit(0.7).alias("confidence"),
            current_timestamp().alias("created_at"),
            date_format(current_timestamp(), "yyyy-MM-dd").alias("partition_date"),
        )
    )

# COMMAND ----------

# MAGIC %md
# MAGIC ## Detection 3: Privilege Use Without Approval Workflow

# COMMAND ----------

# Find privilege escalation events
priv_events = events.filter(
    col("type_name").rlike("(?i)privilege|escalat|admin|role.?assign|grant|sudo")
)

# Find approval/change request events
approval_events = events.filter(
    col("type_name").rlike("(?i)approv|ticket|change.?request|jira|servicenow")
).select(
    col("actor_user_id").alias("approved_user"),
    col("time").alias("approval_time"),
)

# Privilege events without preceding approval
unauth_priv = priv_events.join(
    approval_events,
    (priv_events.actor_user_id == approval_events.approved_user) &
    (approval_events.approval_time.between(
        priv_events.time - expr("INTERVAL 24 HOURS"),
        priv_events.time
    )),
    "left_anti"
)

unauth_priv_count = unauth_priv.count()
print(f"Privilege escalation without approval: {unauth_priv_count} events")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Detection 4: Service Account Active Outside Maintenance Window

# COMMAND ----------

from pyspark.sql.functions import hour, dayofweek

# Service accounts should only be active during specific windows
service_account_activity = events.filter(
    col("actor_user_id").rlike("(?i)^(svc|service|app)[-_]")
).withColumn(
    "hour_of_day", hour(col("time"))
).withColumn(
    "day_of_week", dayofweek(col("time"))
)

# Off-hours: weekends or outside 6am-10pm
off_hours_svc = service_account_activity.filter(
    (col("day_of_week").isin(1, 7)) |  # Sunday, Saturday
    (col("hour_of_day") < 6) |
    (col("hour_of_day") > 22)
)

off_hours_count = off_hours_svc.count()
print(f"Service account off-hours activity: {off_hours_count} events")

if off_hours_count > 0:
    svc_detections = (
        off_hours_svc
        .groupBy("actor_user_id")
        .agg(
            count("*").alias("event_count"),
            countDistinct("dst_ip").alias("distinct_destinations"),
            collect_set("type_name").alias("event_types"),
        )
        .filter(col("event_count") >= 5)
        .select(
            expr("uuid()").alias("detection_id"),
            lit("negative_correlation").alias("detection_type"),
            lit("svc_off_hours").alias("rule_name"),
            lit("medium").alias("severity"),
            lit("actor_user_id").alias("entity_key"),
            col("actor_user_id").alias("entity_value"),
            lit("Maintenance window activity only").alias("expected_event"),
            lit("Off-hours service account activity").alias("actual_event"),
            expr("""
                concat('Service account ', actor_user_id, ' active outside maintenance window: ',
                       event_count, ' events to ', distinct_destinations, ' destinations')
            """).alias("description"),
            expr("""
                map('service_account', actor_user_id,
                    'event_count', CAST(event_count AS STRING),
                    'distinct_destinations', CAST(distinct_destinations AS STRING))
            """).alias("evidence"),
            lit("T1078.004").alias("mitre_technique"),
            lit(0.65).alias("confidence"),
            current_timestamp().alias("created_at"),
            date_format(current_timestamp(), "yyyy-MM-dd").alias("partition_date"),
        )
    )

# COMMAND ----------

# MAGIC %md
# MAGIC ## Write All Negative Correlation Detections

# COMMAND ----------

from functools import reduce

detections_to_write = []

if no_mfa_count > 0:
    detections_to_write.append(mfa_bypass_detections)
if no_dns_count > 0 and connections_with_dns.groupBy("src_ip", "dst_ip").count().filter(col("count") >= 3).count() > 0:
    detections_to_write.append(no_dns_detections)
if off_hours_count > 0 and off_hours_svc.groupBy("actor_user_id").count().filter(col("count") >= 5).count() > 0:
    detections_to_write.append(svc_detections)

if detections_to_write:
    combined = reduce(lambda a, b: a.unionByName(b, allowMissingColumns=True), detections_to_write)
    combined.write.format("delta").mode("append").option("mergeSchema", "true").saveAsTable(
        f"{catalog}.{schema}.negative_correlation_detections"
    )
    print(f"Wrote {combined.count()} negative correlation detections")
else:
    print("No negative correlation detections in this run")

events.unpersist()
