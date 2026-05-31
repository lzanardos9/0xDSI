import { DatabricksNotebook } from '../databricksNotebooks';

export const detectionConfluenceNotebook: DatabricksNotebook = {
  id: 'detection-confluence-engine',
  title: 'Detection Confluence Engine',
  subtitle: 'Fuses ML scores, MITRE behavior, IOC matches, UEBA anomalies, and geopolitical risk into single confluence events',
  category: 'correlation',
  tags: ['Detection Confluence', 'Multi-Signal', 'MITRE', 'UEBA', 'IOC', 'Geopolitical'],
  description: 'Streaming pipeline that joins ML anomaly scores, MITRE ATT&CK behavior tags, IOC sighting events, UEBA risk deltas, and geopolitical correlation hits on a common entity (user/host/IP) within a 30-minute tumbling window. Computes a weighted confluence score, persists detection_confluence_events, and triggers escalation when score crosses 0.78. Replaces the batch confluence notebook with sub-minute streaming.',
  estimatedRuntime: '10 min (continuous)',
  clusterRequirements: 'DBR 15.4 LTS, 4 workers, Structured Streaming, Delta Lake',
  cells: [
    {
      type: 'markdown',
      content: `# Detection Confluence Engine

## Signal weights (tuned in production)
| signal | weight |
|---|---|
| ML anomaly z-score >= 3 | 0.30 |
| MITRE behavior match | 0.20 |
| IOC sighting (high-conf) | 0.20 |
| UEBA risk delta >= 25 | 0.15 |
| Geopolitical correlation | 0.15 |

Confluence fires at >= 0.78.`,
    },
    {
      type: 'code',
      content: `# Cell 1: Setup + 5 input streams
from pyspark.sql import SparkSession, functions as F, types as T
spark = SparkSession.builder.appName("detection-confluence").getOrCreate()
TBL = lambda t: f"security.public.{t}"
WIN = "30 minutes"

def stream(t): return spark.readStream.table(TBL(t)).withWatermark("occurred_at", "10 minutes")

ml = stream("ml_anomaly_scores").filter(F.col("z_score") >= 3).withColumn("w", F.lit(0.30))
mitre = stream("mitre_behavior_matches").withColumn("w", F.lit(0.20))
ioc = stream("ioc_sightings").filter(F.col("confidence") >= 0.7).withColumn("w", F.lit(0.20))
ueba = stream("ueba_risk_deltas").filter(F.col("delta") >= 25).withColumn("w", F.lit(0.15))
geo = stream("cyber_geo_correlations").filter(F.col("correlation_score") >= 0.5).withColumn("w", F.lit(0.15))`,
    },
    {
      type: 'code',
      content: `# Cell 2: Union and aggregate per entity
def norm(df, label):
    return df.select(F.col("entity_id").alias("entity_id"),
                     F.col("entity_kind").alias("entity_kind"),
                     F.col("occurred_at").alias("occurred_at"),
                     F.lit(label).alias("signal"),
                     F.col("w").alias("w"))

unioned = norm(ml, "ml").union(norm(mitre, "mitre")).union(norm(ioc, "ioc")) \\
                          .union(norm(ueba, "ueba")).union(norm(geo, "geo"))

confluence = (unioned
  .groupBy(F.window("occurred_at", WIN), "entity_id", "entity_kind")
  .agg(F.sum("w").alias("confluence_score"),
       F.collect_set("signal").alias("signals"))
  .filter(F.col("confluence_score") >= 0.78)
  .select(
    F.col("window.start").alias("window_start"),
    F.col("window.end").alias("window_end"),
    "entity_id", "entity_kind", "signals", "confluence_score",
  ))`,
    },
    {
      type: 'code',
      content: `# Cell 3: Sink + escalate
def sink(batch_df, batch_id):
    rows = batch_df.toPandas()
    if not len(rows): return
    batch_df.write.mode("append").saveAsTable(TBL("detection_confluence_events"))
    # escalate to Supabase escalation queue
    import requests, json
    SUPA_URL = dbutils.secrets.get("kv", "supabase-url")
    SUPA_KEY = dbutils.secrets.get("kv", "supabase-service-key")
    payload = rows.to_dict(orient="records")
    requests.post(
        f"{SUPA_URL}/rest/v1/threat_escalations",
        headers={"apikey": SUPA_KEY, "Authorization": f"Bearer {SUPA_KEY}",
                 "Content-Type": "application/json"},
        data=json.dumps(payload, default=str), timeout=30,
    ).raise_for_status()

(confluence.writeStream
  .foreachBatch(sink)
  .option("checkpointLocation", "/chk/detection_confluence")
  .trigger(processingTime="60 seconds")
  .start())`,
    },
  ],
};
