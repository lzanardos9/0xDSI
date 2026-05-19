# Databricks notebook source
# MAGIC %md
# MAGIC # 01 - Streaming Correlation Engine
# MAGIC
# MAGIC Stateful Spark Structured Streaming job that evaluates correlation rules
# MAGIC against incoming enriched events in real-time.
# MAGIC
# MAGIC **Architecture:**
# MAGIC - Reads enriched events as a stream
# MAGIC - Maintains state per correlation rule (sliding windows, counters, entity tracking)
# MAGIC - Uses `flatMapGroupsWithState` for custom stateful processing
# MAGIC - Outputs correlation matches to alerts table
# MAGIC
# MAGIC **Input:** `{catalog}.{schema}.enriched_events`
# MAGIC **Output:** `{catalog}.{schema}.correlation_matches`, `{catalog}.{schema}.alerts`

# COMMAND ----------

dbutils.widgets.text("catalog", "main")
dbutils.widgets.text("schema", "security")
dbutils.widgets.text("checkpoint_path", "")
dbutils.widgets.text("processing_time", "10 seconds")
dbutils.widgets.text("state_timeout_hours", "24")

catalog = dbutils.widgets.get("catalog")
schema = dbutils.widgets.get("schema")
checkpoint_path = dbutils.widgets.get("checkpoint_path") or f"/Volumes/{catalog}/{schema}/checkpoints/correlation"
processing_time = dbutils.widgets.get("processing_time")
state_timeout_hours = int(dbutils.widgets.get("state_timeout_hours"))

# COMMAND ----------

# MAGIC %md
# MAGIC ## Correlation Rule Definitions

# COMMAND ----------

from dataclasses import dataclass, field
from typing import Optional
import json


@dataclass
class CorrelationRule:
    """A correlation rule that detects multi-event attack patterns."""
    rule_id: str
    name: str
    description: str
    severity: str  # critical, high, medium, low
    mitre_techniques: list
    conditions: list  # Ordered conditions that must be met
    time_window_seconds: int  # Max time between first and last condition
    entity_key: str  # Field to group events by (e.g., "actor_user_id", "src_ip")
    threshold: int = 1  # Min occurrences within window
    dedupe_window_seconds: int = 900  # Don't re-fire within this window
    enabled: bool = True


# Load rules from Delta table (allows dynamic rule management)
def load_correlation_rules(catalog: str, schema: str) -> list:
    """Load active correlation rules from the rules table."""
    rules_df = spark.table(f"{catalog}.{schema}.correlation_rules").filter(
        col("enabled") == True
    ).collect()

    rules = []
    for row in rules_df:
        rules.append(CorrelationRule(
            rule_id=row["id"],
            name=row["name"],
            description=row.get("description", ""),
            severity=row["severity"],
            mitre_techniques=row.get("mitre_techniques", []),
            conditions=json.loads(row["conditions"]) if isinstance(row["conditions"], str) else row["conditions"],
            time_window_seconds=row.get("time_window_seconds", 300),
            entity_key=row.get("entity_key", "actor_user_id"),
            threshold=row.get("threshold", 1),
            dedupe_window_seconds=row.get("dedupe_window_seconds", 900),
            enabled=True,
        ))

    return rules


from pyspark.sql.functions import col
rules = load_correlation_rules(catalog, schema)
print(f"Loaded {len(rules)} active correlation rules")

# COMMAND ----------

# MAGIC %md
# MAGIC ## State Schema for Stateful Processing

# COMMAND ----------

from pyspark.sql.types import (
    StructType, StructField, StringType, TimestampType,
    IntegerType, LongType, ArrayType, MapType, BooleanType
)

# State maintained per entity per rule
state_schema = StructType([
    StructField("entity_key", StringType()),
    StructField("rule_id", StringType()),
    StructField("matched_conditions", ArrayType(IntegerType())),
    StructField("matched_event_ids", ArrayType(StringType())),
    StructField("first_event_time", TimestampType()),
    StructField("last_event_time", TimestampType()),
    StructField("event_count", IntegerType()),
    StructField("last_fired_time", TimestampType()),
])

# Output schema for correlation matches
match_schema = StructType([
    StructField("match_id", StringType()),
    StructField("rule_id", StringType()),
    StructField("rule_name", StringType()),
    StructField("entity_key", StringType()),
    StructField("entity_value", StringType()),
    StructField("severity", StringType()),
    StructField("confidence_score", LongType()),
    StructField("matched_event_ids", ArrayType(StringType())),
    StructField("matched_conditions", ArrayType(IntegerType())),
    StructField("time_span_seconds", LongType()),
    StructField("mitre_techniques", ArrayType(StringType())),
    StructField("created_at", TimestampType()),
])

# COMMAND ----------

# MAGIC %md
# MAGIC ## Condition Evaluator

# COMMAND ----------

def evaluate_condition(event: dict, condition: dict) -> bool:
    """
    Evaluate if an event matches a correlation rule condition.

    Condition format:
    {
        "field": "type_name",
        "operator": "equals|contains|regex|gt|lt|in|not_null",
        "value": "authentication_failure",
        "optional": false
    }
    """
    field_value = event.get(condition["field"])
    if field_value is None:
        return condition.get("optional", False)

    operator = condition["operator"]
    expected = condition["value"]

    if operator == "equals":
        return str(field_value) == str(expected)
    elif operator == "contains":
        return str(expected).lower() in str(field_value).lower()
    elif operator == "regex":
        import re
        return bool(re.search(expected, str(field_value), re.IGNORECASE))
    elif operator == "gt":
        return float(field_value) > float(expected)
    elif operator == "lt":
        return float(field_value) < float(expected)
    elif operator == "gte":
        return float(field_value) >= float(expected)
    elif operator == "in":
        return str(field_value) in (expected if isinstance(expected, list) else [expected])
    elif operator == "not_null":
        return field_value is not None and str(field_value) != ""
    elif operator == "not_equals":
        return str(field_value) != str(expected)

    return False

# COMMAND ----------

# MAGIC %md
# MAGIC ## Stateful Correlation Processor

# COMMAND ----------

from pyspark.sql.streaming import GroupState, GroupStateTimeout
from pyspark.sql.functions import (
    col, current_timestamp, lit, expr, struct, array, to_json,
    from_json, explode, udf, pandas_udf
)
import uuid
from datetime import datetime, timedelta


def correlation_state_function(key, events, state: GroupState):
    """
    Stateful processing function for correlation.
    Called per entity_key group with new events and existing state.

    State tracks which conditions have been met for each rule.
    When all conditions are met within the time window → emit match.
    """
    # Parse existing state
    if state.exists:
        current_state = state.get
    else:
        current_state = {}

    # Convert events iterator to list for multiple passes
    event_list = list(events)
    if not event_list:
        # Check for state timeout
        if state.hasTimedOut:
            state.remove()
        return iter([])

    matches = []
    entity_value = key[0]  # The entity grouping key value

    for rule in rules:
        rule_state_key = rule.rule_id

        # Get or initialize rule state
        if rule_state_key not in current_state:
            current_state[rule_state_key] = {
                "matched_conditions": set(),
                "matched_event_ids": [],
                "first_event_time": None,
                "last_event_time": None,
                "event_count": 0,
                "last_fired_time": None,
            }

        rs = current_state[rule_state_key]

        for event in event_list:
            event_dict = event.asDict()
            event_time = event_dict.get("time")

            # Check time window — reset if too old
            if rs["first_event_time"] and event_time:
                elapsed = (event_time - rs["first_event_time"]).total_seconds()
                if elapsed > rule.time_window_seconds:
                    # Window expired — reset state for this rule
                    rs["matched_conditions"] = set()
                    rs["matched_event_ids"] = []
                    rs["first_event_time"] = None
                    rs["event_count"] = 0

            # Evaluate each condition
            for idx, condition in enumerate(rule.conditions):
                if idx not in rs["matched_conditions"]:
                    if evaluate_condition(event_dict, condition):
                        rs["matched_conditions"].add(idx)
                        rs["matched_event_ids"].append(event_dict.get("event_id", ""))
                        if rs["first_event_time"] is None:
                            rs["first_event_time"] = event_time
                        rs["last_event_time"] = event_time
                        rs["event_count"] += 1

            # Check if all conditions met
            if len(rs["matched_conditions"]) >= len(rule.conditions):
                # Check threshold
                if rs["event_count"] >= rule.threshold:
                    # Check dedupe window
                    should_fire = True
                    if rs["last_fired_time"]:
                        since_last = (event_time - rs["last_fired_time"]).total_seconds()
                        if since_last < rule.dedupe_window_seconds:
                            should_fire = False

                    if should_fire:
                        time_span = 0
                        if rs["first_event_time"] and rs["last_event_time"]:
                            time_span = int((rs["last_event_time"] - rs["first_event_time"]).total_seconds())

                        match = {
                            "match_id": str(uuid.uuid4()),
                            "rule_id": rule.rule_id,
                            "rule_name": rule.name,
                            "entity_key": rule.entity_key,
                            "entity_value": entity_value,
                            "severity": rule.severity,
                            "confidence_score": min(95, 60 + len(rs["matched_event_ids"]) * 5),
                            "matched_event_ids": rs["matched_event_ids"][:20],
                            "matched_conditions": list(rs["matched_conditions"]),
                            "time_span_seconds": time_span,
                            "mitre_techniques": rule.mitre_techniques,
                            "created_at": datetime.utcnow(),
                        }
                        matches.append(match)

                        # Update state: mark as fired, reset conditions
                        rs["last_fired_time"] = event_time
                        rs["matched_conditions"] = set()
                        rs["matched_event_ids"] = []
                        rs["first_event_time"] = None
                        rs["event_count"] = 0

    # Update state
    state.update(current_state)
    state.setTimeoutDuration(f"{state_timeout_hours} hours")

    return iter(matches)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Create Output Tables

# COMMAND ----------

spark.sql(f"""
    CREATE TABLE IF NOT EXISTS {catalog}.{schema}.correlation_matches (
        match_id STRING NOT NULL,
        rule_id STRING NOT NULL,
        rule_name STRING,
        entity_key STRING,
        entity_value STRING,
        severity STRING,
        confidence_score INT,
        matched_event_ids ARRAY<STRING>,
        matched_conditions ARRAY<INT>,
        time_span_seconds BIGINT,
        mitre_techniques ARRAY<STRING>,
        created_at TIMESTAMP NOT NULL,
        partition_date STRING
    )
    USING DELTA
    PARTITIONED BY (partition_date)
    TBLPROPERTIES ('delta.autoOptimize.optimizeWrite' = 'true')
""")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Start Correlation Stream

# COMMAND ----------

# Read enriched events stream
enriched_stream = (
    spark.readStream
    .format("delta")
    .option("maxFilesPerTrigger", 100)
    .table(f"{catalog}.{schema}.enriched_events")
)

# Group by primary entity key (user_id for most rules)
# In production, you'd run multiple streams for different entity keys
grouped = enriched_stream.groupBy(col("actor_user_id"))

# Apply stateful correlation
# Note: flatMapGroupsWithState requires specific API usage
# For production, use foreachBatch with explicit state management:

def correlation_batch(batch_df, batch_id):
    """Process batch with correlation logic."""
    if batch_df.isEmpty():
        return

    count = batch_df.count()
    print(f"Correlation batch {batch_id}: {count} events")

    # For each entity in this batch, check against rules
    entities = batch_df.select("actor_user_id").distinct().collect()
    all_matches = []

    for entity_row in entities:
        entity_value = entity_row["actor_user_id"]
        if not entity_value:
            continue

        entity_events = batch_df.filter(col("actor_user_id") == entity_value).collect()

        for rule in rules:
            matched_conditions = set()
            matched_events = []
            first_time = None
            last_time = None

            for event in entity_events:
                event_dict = event.asDict()
                for idx, condition in enumerate(rule.conditions):
                    if evaluate_condition(event_dict, condition):
                        matched_conditions.add(idx)
                        matched_events.append(event_dict.get("event_id", ""))
                        if first_time is None:
                            first_time = event_dict.get("time")
                        last_time = event_dict.get("time")

            # Check if all conditions met
            if len(matched_conditions) >= len(rule.conditions) and len(matched_events) >= rule.threshold:
                time_span = 0
                if first_time and last_time:
                    time_span = int((last_time - first_time).total_seconds())

                if time_span <= rule.time_window_seconds:
                    all_matches.append({
                        "match_id": str(uuid.uuid4()),
                        "rule_id": rule.rule_id,
                        "rule_name": rule.name,
                        "entity_key": rule.entity_key,
                        "entity_value": entity_value,
                        "severity": rule.severity,
                        "confidence_score": min(95, 60 + len(matched_events) * 5),
                        "matched_event_ids": matched_events[:20],
                        "matched_conditions": list(matched_conditions),
                        "time_span_seconds": time_span,
                        "mitre_techniques": rule.mitre_techniques,
                        "created_at": datetime.utcnow(),
                        "partition_date": datetime.utcnow().strftime("%Y-%m-%d"),
                    })

    if all_matches:
        matches_df = spark.createDataFrame(all_matches)
        matches_df.write.format("delta").mode("append").saveAsTable(
            f"{catalog}.{schema}.correlation_matches"
        )
        print(f"  → {len(all_matches)} correlation matches detected!")

        # Generate alerts for high/critical matches
        critical_matches = [m for m in all_matches if m["severity"] in ("critical", "high")]
        if critical_matches:
            alerts = [{
                "id": str(uuid.uuid4()),
                "title": f"Correlation: {m['rule_name']}",
                "description": f"Rule matched on {m['entity_key']}={m['entity_value']} "
                              f"({len(m['matched_event_ids'])} events in {m['time_span_seconds']}s)",
                "severity": m["severity"],
                "source": "correlation_engine",
                "correlation_match_id": m["match_id"],
                "entity_type": m["entity_key"],
                "entity_value": m["entity_value"],
                "mitre_techniques": m["mitre_techniques"],
                "status": "open",
                "created_at": datetime.utcnow(),
            } for m in critical_matches]

            alerts_df = spark.createDataFrame(alerts)
            alerts_df.write.format("delta").mode("append").option("mergeSchema", "true").saveAsTable(
                f"{catalog}.{schema}.alerts"
            )
            print(f"  → Generated {len(alerts)} alerts")


# Start the stream
query = (
    enriched_stream
    .writeStream
    .foreachBatch(correlation_batch)
    .option("checkpointLocation", checkpoint_path)
    .trigger(processingTime=processing_time)
    .queryName("streaming_correlation")
    .start()
)

print(f"Correlation engine started: {query.id}")
