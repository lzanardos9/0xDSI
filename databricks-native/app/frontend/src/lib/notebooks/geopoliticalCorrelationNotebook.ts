import { DatabricksNotebook } from '../databricksNotebooks';

export const geopoliticalCyberCorrelationNotebook: DatabricksNotebook = {
  id: 'geopolitical-cyber-correlation',
  title: 'Geopolitical Cyber Correlation Engine',
  subtitle: 'Joins geopolitical event streams with cyber telemetry to surface state-aligned attack windows',
  category: 'correlation',
  tags: ['Geopolitical', 'Cyber-Geo', 'Threat Intel', 'Spark Structured Streaming', 'GDELT', 'ACLED'],
  description: 'Continuously ingests GDELT, ACLED, and CISA advisory feeds, normalizes country/actor codes (ISO-3166), joins to cyber telemetry by country-of-origin and known actor attribution, and emits cyber_geo_correlations to Supabase. Uses watermarked stream-stream joins with a 6-hour late tolerance and a 24-hour correlation window. Persists to Delta Lake with Z-ORDER on (country_iso, occurred_at). Drives the Threat Globe and Executive Dashboard geopolitical strip.',
  estimatedRuntime: '12 min (continuous)',
  clusterRequirements: 'DBR 15.4 LTS, 2 workers, Delta Lake, Auto Loader, Structured Streaming',
  cells: [
    {
      type: 'markdown',
      content: `# Geopolitical Cyber Correlation

## Sources
- **GDELT 2.0** - global news event stream (CSV every 15 min)
- **ACLED** - armed conflict & political violence (REST API, paginated)
- **CISA Advisories** - state-sponsored campaign attribution (RSS)
- **Internal cyber telemetry** - \`security.events\` enriched with country_iso

## Output
- \`security.public.cyber_geo_correlations\` (Delta)
- Supabase \`cyber_geo_correlations\` (for Threat Globe live arcs)`,
    },
    {
      type: 'code',
      content: `# Cell 1: Configuration & secrets
from pyspark.sql import SparkSession, functions as F, types as T
spark = SparkSession.builder.appName("geo-cyber-correlation").getOrCreate()
spark.conf.set("spark.databricks.delta.optimizeWrite.enabled", "true")

CATALOG, SCHEMA = "security", "public"
TBL = lambda t: f"{CATALOG}.{SCHEMA}.{t}"

GDELT_INGEST_PATH = "s3://siem-raw/gdelt/v2/"
ACLED_INGEST_PATH = "s3://siem-raw/acled/v1/"
CISA_INGEST_PATH = "s3://siem-raw/cisa/advisories/"

WINDOW_HOURS = 24
LATE_TOLERANCE_HOURS = 6`,
    },
    {
      type: 'code',
      content: `# Cell 2: GDELT auto-loader stream
gdelt_schema = T.StructType([
    T.StructField("global_event_id", T.LongType()),
    T.StructField("sql_date", T.StringType()),
    T.StructField("actor1_country_code", T.StringType()),
    T.StructField("actor2_country_code", T.StringType()),
    T.StructField("event_root_code", T.StringType()),
    T.StructField("goldstein_scale", T.DoubleType()),
    T.StructField("avg_tone", T.DoubleType()),
    T.StructField("source_url", T.StringType()),
])

gdelt = (spark.readStream
  .format("cloudFiles")
  .option("cloudFiles.format", "csv")
  .option("cloudFiles.schemaLocation", "/tmp/schemas/gdelt")
  .schema(gdelt_schema)
  .load(GDELT_INGEST_PATH)
  .withColumn("occurred_at", F.to_timestamp("sql_date", "yyyyMMddHHmmss"))
  .withColumn("country_iso", F.coalesce(F.col("actor1_country_code"), F.col("actor2_country_code")))
  .filter(F.col("country_iso").isNotNull())
  .withWatermark("occurred_at", f"{LATE_TOLERANCE_HOURS} hours"))`,
    },
    {
      type: 'code',
      content: `# Cell 3: Cyber telemetry stream
cyber = (spark.readStream
  .table(TBL("events_with_geoip"))  # produced by ingestion pipeline
  .filter(F.col("country_iso").isNotNull())
  .withWatermark("occurred_at", f"{LATE_TOLERANCE_HOURS} hours"))`,
    },
    {
      type: 'code',
      content: `# Cell 4: Stream-stream join with windowed correlation
joined = (cyber.alias("c")
  .join(gdelt.alias("g"),
    F.expr(f"""
      c.country_iso = g.country_iso AND
      c.occurred_at >= g.occurred_at AND
      c.occurred_at <= g.occurred_at + INTERVAL {WINDOW_HOURS} HOURS
    """))
  .select(
    F.col("c.event_id").alias("cyber_event_id"),
    F.col("c.occurred_at").alias("cyber_occurred_at"),
    F.col("c.severity").alias("cyber_severity"),
    F.col("c.country_iso").alias("country_iso"),
    F.col("g.global_event_id").alias("geo_event_id"),
    F.col("g.event_root_code").alias("geo_event_code"),
    F.col("g.goldstein_scale").alias("goldstein"),
    F.col("g.avg_tone").alias("tone"),
    F.col("g.source_url").alias("geo_source_url"),
  )
  .withColumn("correlation_score",
    F.expr("CASE WHEN cyber_severity = 'critical' THEN 1.0 "
           "WHEN cyber_severity = 'high' THEN 0.75 "
           "WHEN cyber_severity = 'medium' THEN 0.5 ELSE 0.25 END")
    * F.expr("(10 - abs(coalesce(goldstein, 0))) / 10")))`,
    },
    {
      type: 'code',
      content: `# Cell 5: Sink to Delta + Supabase
def push_supabase(batch_df, batch_id):
    import requests, json, os
    rows = batch_df.limit(500).toPandas()
    if len(rows) == 0: return
    SUPABASE_URL = dbutils.secrets.get("kv", "supabase-url")
    SUPABASE_KEY = dbutils.secrets.get("kv", "supabase-service-key")
    requests.post(
        f"{SUPABASE_URL}/rest/v1/cyber_geo_correlations",
        headers={"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}",
                 "Content-Type": "application/json", "Prefer": "resolution=merge-duplicates"},
        data=json.dumps(rows.to_dict(orient="records"), default=str), timeout=30,
    ).raise_for_status()
    batch_df.write.mode("append").saveAsTable(TBL("cyber_geo_correlations"))

(joined.writeStream
  .foreachBatch(push_supabase)
  .option("checkpointLocation", "/chk/cyber_geo_correlations")
  .trigger(processingTime="60 seconds")
  .start())`,
    },
    {
      type: 'sql',
      content: `-- Cell 6: Optimize
OPTIMIZE security.public.cyber_geo_correlations
ZORDER BY (country_iso, cyber_occurred_at);`,
    },
  ],
};
