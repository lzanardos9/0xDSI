import { DatabricksNotebook } from '../databricksNotebooks';

export const negativeCorrelationNotebook: DatabricksNotebook = {
  id: 'negative-correlation-streaming',
  title: 'Negative Correlation Streaming Detector',
  subtitle: 'Detects the ABSENCE of expected events (missed heartbeats, dropped audit logs)',
  category: 'streaming',
  tags: ['Negative Correlation', 'Heartbeat', 'Audit Log Loss', 'Watermarking', 'Structured Streaming'],
  description: 'Implements absence-of-event detection. For each negative_correlation_rule, we track the most recent observation per entity and emit a detection when the gap exceeds the rule SLA. Uses a stateful Spark Structured Streaming flatMapGroupsWithState job with a 24h max state TTL. Persists negative_correlation_detections to Delta + Supabase, and escalates per the rule severity.',
  estimatedRuntime: 'continuous',
  clusterRequirements: 'DBR 15.4 LTS, 4 workers, RocksDB state store, Structured Streaming',
  cells: [
    {
      type: 'markdown',
      content: `# Negative Correlation - "What should be there but isn't"

| rule_id | description | sla_seconds |
|---|---|---|
| nc-1 | EDR heartbeat from every endpoint | 600 |
| nc-2 | Domain controller security log shipped to SIEM | 300 |
| nc-3 | Backup job success per server per day | 86400 |
| nc-4 | Cloud audit log per enabled account per hour | 3600 |
| nc-5 | TLS handshake from monitored payment gateway | 120 |`,
    },
    {
      type: 'code',
      content: `# Cell 1: Setup
from pyspark.sql import SparkSession, functions as F, types as T
spark = SparkSession.builder.appName("negative-correlation").getOrCreate()
spark.conf.set("spark.sql.streaming.stateStore.providerClass",
               "org.apache.spark.sql.execution.streaming.state.RocksDBStateStoreProvider")
TBL = lambda t: f"security.public.{t}"

rules = spark.table(TBL("negative_correlation_rules")).collect()
rule_map = {r.rule_id: r.asDict() for r in rules}`,
    },
    {
      type: 'code',
      content: `# Cell 2: Source: heartbeat-bearing events tagged with rule_id by ingestion
heartbeats = (spark.readStream.table(TBL("heartbeat_events"))
  .select("rule_id", "entity_id", "occurred_at")
  .withWatermark("occurred_at", "10 minutes"))`,
    },
    {
      type: 'code',
      content: `# Cell 3: Stateful absence detector
from pyspark.sql.streaming.state import GroupStateTimeout, GroupState

state_schema = T.StructType([
    T.StructField("last_seen", T.TimestampType()),
    T.StructField("rule_id", T.StringType()),
])
output_schema = T.StructType([
    T.StructField("rule_id", T.StringType()),
    T.StructField("entity_id", T.StringType()),
    T.StructField("missing_for_seconds", T.LongType()),
    T.StructField("first_missed_at", T.TimestampType()),
])

def absence_fn(key, values, state):
    rule_id, entity_id = key
    sla = rule_map.get(rule_id, {}).get("sla_seconds", 600)
    rows = list(values)
    last_seen = state.get["last_seen"] if state.exists else None
    for r in rows:
        ts = r["occurred_at"]
        if last_seen is None or ts > last_seen:
            last_seen = ts
    if last_seen is not None:
        state.update({"last_seen": last_seen, "rule_id": rule_id})
        state.setTimeoutDuration(sla * 1000)
    if state.hasTimedOut:
        first_missed = last_seen
        state.remove()
        yield (rule_id, entity_id, sla, first_missed)

detections = (heartbeats
  .groupBy("rule_id", "entity_id")
  .applyInPandasWithState(
    absence_fn,
    outputStructType=output_schema,
    stateStructType=state_schema,
    outputMode="append",
    timeoutConf=GroupStateTimeout.ProcessingTimeTimeout,
  ))`,
    },
    {
      type: 'code',
      content: `# Cell 4: Sink + escalate
def sink(batch_df, batch_id):
    if batch_df.rdd.isEmpty(): return
    batch_df.write.mode("append").saveAsTable(TBL("negative_correlation_detections"))
    rows = batch_df.toPandas().to_dict(orient="records")
    import requests, json
    SUPA_URL = dbutils.secrets.get("kv", "supabase-url")
    SUPA_KEY = dbutils.secrets.get("kv", "supabase-service-key")
    requests.post(f"{SUPA_URL}/rest/v1/negative_correlation_detections",
                  headers={"apikey": SUPA_KEY, "Authorization": f"Bearer {SUPA_KEY}",
                           "Content-Type": "application/json",
                           "Prefer": "resolution=merge-duplicates"},
                  data=json.dumps(rows, default=str), timeout=30).raise_for_status()

(detections.writeStream.foreachBatch(sink)
  .option("checkpointLocation", "/chk/negative_correlation")
  .trigger(processingTime="30 seconds").start())`,
    },
  ],
};
