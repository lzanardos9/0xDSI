import { DatabricksNotebook } from '../databricksNotebooks';

export const correlationNotebooks: DatabricksNotebook[] = [
  {
    id: 'cep-correlation-engine',
    title: 'Complex Event Processing Correlation Engine',
    subtitle: 'Stateful streaming rule evaluation with temporal windows and kill-chain tracking',
    category: 'correlation',
    tags: ['CEP', 'Stateful Streaming', 'Kill Chain', 'Temporal Windows', 'Rule Engine'],
    description: 'Production streaming correlation engine that evaluates security rules against real-time event streams using Spark Structured Streaming with stateful processing. Supports temporal sequence detection, threshold rules, and multi-stage kill-chain tracking.',
    estimatedRuntime: 'Continuous (streaming)',
    clusterRequirements: 'DBR 14.3 LTS, 4-8 workers, 128GB+ driver, SSD state store',
    cells: [
      {
        type: 'markdown',
        content: `# Complex Event Processing (CEP) Correlation Engine
## Production Stateful Streaming Rule Evaluation

### Supported Rule Types
| Type | Description | Example |
|------|-------------|---------|
| Threshold | N events in time window | >5 failed logins in 10 min |
| Sequence | Ordered event pattern | Recon -> Exploit -> C2 |
| Absence | Expected event missing | Auth without MFA |
| Aggregation | Statistical deviation | Bytes out > 3x baseline |
| Graph | Relationship pattern | Lateral movement chain |

### Architecture
- **State Store:** RocksDB (local SSD)
- **Checkpointing:** Every micro-batch to cloud storage
- **Output Mode:** Append (matches are immutable)
- **Watermark:** 30 minutes (late event tolerance)`
      },
      {
        type: 'code',
        content: `dbutils.widgets.text("catalog", "main")
dbutils.widgets.text("schema", "security")
dbutils.widgets.text("checkpoint_path", "")
dbutils.widgets.text("processing_time", "10 seconds")
dbutils.widgets.text("watermark_duration", "30 minutes")
dbutils.widgets.text("max_state_ttl_hours", "24")

catalog = dbutils.widgets.get("catalog")
schema = dbutils.widgets.get("schema")
checkpoint_path = dbutils.widgets.get("checkpoint_path") or f"/Volumes/{catalog}/{schema}/checkpoints/cep_engine"
processing_time = dbutils.widgets.get("processing_time")
watermark_duration = dbutils.widgets.get("watermark_duration")
max_state_ttl = int(dbutils.widgets.get("max_state_ttl_hours"))

from pyspark.sql.functions import (
    col, count, countDistinct, collect_list, collect_set,
    sum as spark_sum, first, last, lit, expr,
    current_timestamp, window, when, broadcast, date_format
)
import json

# Load active correlation rules (broadcast for efficiency)
rules_df = spark.table(f"{catalog}.{schema}.correlation_rules").filter(col("is_active") == True).cache()
print(f"Active correlation rules: {rules_df.count()}")`
      },
      {
        type: 'code',
        content: `# Read silver events as streaming source
event_stream = (
    spark.readStream.format("delta")
    .option("maxFilesPerTrigger", 1000)
    .option("ignoreChanges", "true")
    .table(f"{catalog}.{schema}.silver_events")
    .withWatermark("time", watermark_duration)
    .select("event_id", "time", "category_uid", "class_uid", "type_name",
            "severity_id", "status_id", "actor_user_id", "src_ip", "dst_ip",
            "dst_port", "resource_name", "source_name", "file_hash", "src_geo_country")
)

# Evaluate threshold rules: aggregate events by entity within tumbling windows
threshold_rules = rules_df.filter(col("rule_type") == "threshold").collect()
threshold_matches = None

for rule in threshold_rules:
    conditions = json.loads(rule["conditions"]) if isinstance(rule["conditions"], str) else rule["conditions"]
    time_window = rule["time_window_seconds"]
    threshold = rule["threshold"]

    filtered = event_stream
    for cond in conditions:
        field, op, value = cond["field"], cond["operator"], cond["value"]
        if op == "equals": filtered = filtered.filter(col(field) == value)
        elif op == "contains": filtered = filtered.filter(col(field).contains(value))
        elif op == "regex": filtered = filtered.filter(col(field).rlike(value))
        elif op == "in": filtered = filtered.filter(col(field).isin(value))
        elif op == "gte": filtered = filtered.filter(col(field) >= value)

    entity_key = conditions[0].get("group_by", "actor_user_id") if conditions else "actor_user_id"

    windowed = (
        filtered
        .groupBy(col(entity_key).alias("entity_value"), window(col("time"), f"{time_window} seconds"))
        .agg(count("*").alias("event_count"), collect_set("event_id").alias("contributing_events"),
             collect_set("src_ip").alias("source_ips"), first("time").alias("first_event_time"),
             last("time").alias("last_event_time"))
        .filter(col("event_count") >= threshold)
        .select(lit(rule["id"]).alias("rule_id"), lit(rule["name"]).alias("rule_name"),
                lit("threshold").alias("match_type"), lit(rule["severity"]).alias("severity"),
                col("entity_value"), col("event_count"), col("contributing_events"),
                col("source_ips"), col("first_event_time"), col("last_event_time"),
                col("window.start").alias("window_start"), col("window.end").alias("window_end"))
    )
    threshold_matches = windowed if threshold_matches is None else threshold_matches.unionByName(windowed, allowMissingColumns=True)

print(f"Configured {len(threshold_rules)} threshold rules for streaming evaluation")`
      },
      {
        type: 'code',
        content: `# Create output table and start streaming write
spark.sql(f"""CREATE TABLE IF NOT EXISTS {catalog}.{schema}.correlation_matches (
    match_id STRING NOT NULL, rule_id STRING, rule_name STRING, match_type STRING,
    severity STRING, entity_value STRING, event_count INT,
    contributing_events ARRAY<STRING>, source_ips ARRAY<STRING>,
    first_event_time TIMESTAMP, last_event_time TIMESTAMP,
    window_start TIMESTAMP, window_end TIMESTAMP,
    confidence DOUBLE, fired_at TIMESTAMP, partition_date STRING
) USING DELTA PARTITIONED BY (partition_date)
TBLPROPERTIES ('delta.autoOptimize.optimizeWrite' = 'true', 'delta.autoOptimize.autoCompact' = 'true')""")

if threshold_matches is not None:
    query = (
        threshold_matches
        .withColumn("match_id", expr("uuid()"))
        .withColumn("confidence", lit(0.85))
        .withColumn("fired_at", current_timestamp())
        .withColumn("partition_date", date_format(current_timestamp(), "yyyy-MM-dd"))
        .writeStream.format("delta").outputMode("append")
        .option("checkpointLocation", f"{checkpoint_path}/threshold_rules")
        .trigger(processingTime=processing_time)
        .queryName("cep_threshold_correlation")
        .toTable(f"{catalog}.{schema}.correlation_matches")
    )
    print(f"CEP stream started: {query.id}")`
      },
    ],
  },
  {
    id: 'temporal-sequence-correlator',
    title: 'Temporal Sequence Correlation Engine',
    subtitle: 'Ordered event pattern detection with applyInPandasWithState',
    category: 'correlation',
    tags: ['Sequence Detection', 'Stateful Streaming', 'Attack Patterns', 'Kill Chain'],
    description: 'Detects ordered sequences of security events indicating multi-stage attacks using applyInPandasWithState for arbitrary stateful processing with configurable TTL.',
    estimatedRuntime: 'Continuous (streaming)',
    clusterRequirements: 'DBR 14.3 LTS, 4 workers, SSD for RocksDB state',
    cells: [
      {
        type: 'markdown',
        content: `# Temporal Sequence Correlation Engine
## Stateful Multi-Stage Attack Pattern Detection

Detects ordered sequences indicating progressive attacks:
- **Reconnaissance -> Exploitation -> Persistence** (initial compromise)
- **Credential Access -> Lateral Movement -> Collection** (propagation)
- **Discovery -> Privilege Escalation -> Exfiltration** (objective)

Uses \`applyInPandasWithState\` for full state management with
partial match tracking, configurable TTL, and timeout expiration.`
      },
      {
        type: 'code',
        content: `dbutils.widgets.text("catalog", "main")
dbutils.widgets.text("schema", "security")
dbutils.widgets.text("checkpoint_path", "")
dbutils.widgets.text("sequence_ttl_hours", "4")
dbutils.widgets.text("processing_time", "10 seconds")

catalog = dbutils.widgets.get("catalog")
schema = dbutils.widgets.get("schema")
checkpoint_path = dbutils.widgets.get("checkpoint_path") or f"/Volumes/{catalog}/{schema}/checkpoints/sequence_engine"
sequence_ttl = int(dbutils.widgets.get("sequence_ttl_hours"))
processing_time = dbutils.widgets.get("processing_time")

from pyspark.sql.functions import col, struct, current_timestamp, expr, lit, date_format
from pyspark.sql.streaming import GroupStateTimeout
from pyspark.sql.types import StructType, StructField, StringType, TimestampType, ArrayType, IntegerType, DoubleType
import json

# Load sequence patterns from correlation rules
sequence_rules = spark.table(f"{catalog}.{schema}.correlation_rules").filter(
    (col("rule_type") == "sequence") & (col("is_active") == True)
).collect()

SEQUENCES = []
for rule in sequence_rules:
    conditions = json.loads(rule["conditions"]) if isinstance(rule["conditions"], str) else rule["conditions"]
    SEQUENCES.append({
        "rule_id": rule["id"], "rule_name": rule["name"], "severity": rule["severity"],
        "stages": conditions.get("stages", []), "time_window_seconds": rule["time_window_seconds"],
    })
print(f"Loaded {len(SEQUENCES)} sequence patterns")`
      },
      {
        type: 'code',
        content: `# Stateful sequence processor
import pandas as pd
from typing import Iterator, Tuple

output_schema = StructType([
    StructField("entity_id", StringType()),
    StructField("rule_id", StringType()),
    StructField("rule_name", StringType()),
    StructField("severity", StringType()),
    StructField("contributing_events", ArrayType(StringType())),
    StructField("first_event_time", TimestampType()),
    StructField("last_event_time", TimestampType()),
    StructField("stages_matched", IntegerType()),
    StructField("confidence", DoubleType()),
])

state_schema = StructType([StructField("active_sequences", StringType())])

def process_sequences(key: Tuple, events_iter: Iterator[pd.DataFrame], state) -> Iterator[pd.DataFrame]:
    """Process events for a single entity, tracking partial sequences in state."""
    import json
    from datetime import datetime, timedelta

    # Load or initialize state
    if state.exists:
        active = json.loads(state.get[0])
    else:
        active = {}

    completed = []

    for events_df in events_iter:
        for _, event in events_df.iterrows():
            for seq in SEQUENCES:
                rid = seq["rule_id"]
                stages = seq["stages"]
                ttl = seq["time_window_seconds"]

                if rid not in active:
                    active[rid] = {"idx": 0, "events": [], "first": None}

                s = active[rid]
                if s["idx"] < len(stages):
                    stage = stages[s["idx"]]
                    match = all(event.get(k) == v for k, v in stage.items() if k in event.index)
                    if match:
                        s["events"].append(event.get("event_id", ""))
                        if s["first"] is None:
                            s["first"] = str(event.get("time", ""))
                        s["idx"] += 1
                        if s["idx"] >= len(stages):
                            completed.append({
                                "entity_id": key[0],
                                "rule_id": rid, "rule_name": seq["rule_name"],
                                "severity": seq["severity"],
                                "contributing_events": s["events"],
                                "first_event_time": pd.Timestamp(s["first"]),
                                "last_event_time": event.get("time"),
                                "stages_matched": len(stages),
                                "confidence": 0.9,
                            })
                            active[rid] = {"idx": 0, "events": [], "first": None}

    state.update((json.dumps(active),))
    state.setTimeoutDuration(f"{sequence_ttl} hours")

    if completed:
        yield pd.DataFrame(completed)
    else:
        yield pd.DataFrame(columns=[f.name for f in output_schema.fields])

# Start streaming with stateful processing
event_stream = (
    spark.readStream.format("delta")
    .option("maxFilesPerTrigger", 500)
    .table(f"{catalog}.{schema}.silver_events")
    .withWatermark("time", "30 minutes")
)

sequence_matches = event_stream.groupBy("actor_user_id").applyInPandasWithState(
    process_sequences, outputStructType=output_schema,
    stateStructType=state_schema, outputMode="append",
    timeoutConf=GroupStateTimeout.ProcessingTimeTimeout,
)

query = (
    sequence_matches
    .withColumn("match_id", expr("uuid()"))
    .withColumn("match_type", lit("sequence"))
    .withColumn("fired_at", current_timestamp())
    .withColumn("partition_date", date_format(current_timestamp(), "yyyy-MM-dd"))
    .writeStream.format("delta").outputMode("append")
    .option("checkpointLocation", f"{checkpoint_path}/sequence_rules")
    .trigger(processingTime=processing_time)
    .queryName("cep_sequence_correlation")
    .toTable(f"{catalog}.{schema}.correlation_matches")
)
print(f"Sequence correlation stream started: {query.id}")`
      },
    ],
  },
];
