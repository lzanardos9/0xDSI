import { DatabricksNotebook } from '../databricksNotebooks';

export const incidentDrilldownEnrichmentNotebook: DatabricksNotebook = {
  id: 'incident-drilldown-enrichment',
  title: 'AI Incident Drilldown - Raw Alert Enrichment',
  subtitle: 'Materializes per-alert enrichment so the AI Incident Summary drilldown loads instantly',
  category: 'threat-intel',
  tags: ['Incident Response', 'IOC Extraction', 'Enrichment', 'Materialized View', 'Delta Lake'],
  description: 'Pre-computes the enrichment payload that the AI Incident Summarizer drilldown surface needs (extracted IOCs, MITRE technique mapping, correlated event IDs, asset attribution, tag set). Runs on a 5-minute schedule, writes to alert_drilldown_enrichment, and exposes the rows to Supabase via FDW. Replaces the on-click async query so the modal opens with zero latency.',
  estimatedRuntime: '6 min',
  clusterRequirements: 'DBR 15.4 LTS, 2 workers, Delta Lake, Unity Catalog, regex UDFs',
  cells: [
    {
      type: 'markdown',
      content: `# Incident Drilldown Enrichment

The UI used to async-fetch correlated events on click. This notebook **materializes** the enrichment so the drilldown opens instantly.

## Output schema (\`security.public.alert_drilldown_enrichment\`)
| col | type | notes |
|---|---|---|
| alert_id | string | PK |
| raw | string | original alert text |
| iocs | array<struct<type, value>> | IPv4, domain, hash, CVE |
| tags | array<string> | ransomware, c2, exfil, etc. |
| mitre_technique | string | inferred T-code |
| primary_entity | string | host/user/IP |
| correlated_event_ids | array<bigint> | up to 6 |
| computed_at | timestamp | |`,
    },
    {
      type: 'code',
      content: `# Cell 1: Setup
from pyspark.sql import SparkSession, functions as F, types as T
import re
spark = SparkSession.builder.appName("alert-drilldown-enrich").getOrCreate()
TBL = lambda t: f"security.public.{t}"

IPV4_RE = r"\\b(?:\\d{1,3}\\.){3}\\d{1,3}\\b"
DOMAIN_RE = r"\\b[a-z0-9-]+(?:\\[?\\.\\]?[a-z0-9-]+)+\\.[a-z]{2,}\\b"
HASH_RE = r"\\b[a-f0-9]{32,64}\\b"
CVE_RE = r"CVE-\\d{4}-\\d{4,7}"`,
    },
    {
      type: 'code',
      content: `# Cell 2: IOC extractor UDF
@F.udf(T.ArrayType(T.StructType([
    T.StructField("type", T.StringType()),
    T.StructField("value", T.StringType()),
])))
def extract_iocs(text):
    if not text: return []
    out = []
    for ip in re.findall(IPV4_RE, text): out.append(("ipv4", ip))
    for d in re.findall(DOMAIN_RE, text, re.I)[:4]: out.append(("domain", d.replace("[.]", ".")))
    for h in re.findall(HASH_RE, text, re.I)[:2]: out.append(("hash", h))
    for c in re.findall(CVE_RE, text): out.append(("cve", c))
    return out

TAG_RULES = [
    ("ransomware", ["ransom", "encrypt"]),
    ("phishing", ["phish"]),
    ("c2", ["c2", "beacon"]),
    ("exfiltration", ["exfil"]),
    ("lateral-movement", ["lateral"]),
    ("identity", ["mfa", "sso", "okta"]),
    ("dns-tunneling", ["dns"]),
    ("supply-chain", ["supply chain", "nexus", "maven"]),
    ("firmware", ["firmware", "ipmi", "bmc"]),
    ("apt", ["apt"]),
]

@F.udf(T.ArrayType(T.StringType()))
def extract_tags(text):
    if not text: return []
    t = text.lower()
    return [tag for tag, kws in TAG_RULES if any(k in t for k in kws)]`,
    },
    {
      type: 'code',
      content: `# Cell 3: Build enrichment + correlate to events
alerts = spark.table(TBL("alerts")).filter(F.col("created_at") >= F.current_timestamp() - F.expr("INTERVAL 30 DAYS"))
events = spark.table(TBL("events")).select("event_id", "source_ip", "dest_ip", "hostname", "occurred_at")

enriched = (alerts
  .withColumn("iocs", extract_iocs(F.col("raw")))
  .withColumn("tags", extract_tags(F.col("raw"))))

# Explode IOCs to join
ioc_exploded = enriched.withColumn("ioc", F.explode_outer("iocs")).select(
    "alert_id", F.col("ioc.value").alias("ioc_value"), F.col("ioc.type").alias("ioc_type")
)

# Join IPv4 IOCs to events
ip_corr = (ioc_exploded.filter(F.col("ioc_type") == "ipv4")
  .join(events, (F.col("ioc_value") == events.source_ip) | (F.col("ioc_value") == events.dest_ip), "inner")
  .groupBy("alert_id").agg(F.collect_set("event_id").alias("correlated_event_ids")))

final = (enriched.join(ip_corr, "alert_id", "left")
  .withColumn("computed_at", F.current_timestamp())
  .select("alert_id", "raw", "iocs", "tags", "mitre_technique", "primary_entity", "correlated_event_ids", "computed_at"))

final.createOrReplaceTempView("v_drilldown")`,
    },
    {
      type: 'sql',
      content: `-- Cell 4: MERGE
MERGE INTO security.public.alert_drilldown_enrichment AS tgt
USING v_drilldown AS src
ON tgt.alert_id = src.alert_id
WHEN MATCHED THEN UPDATE SET *
WHEN NOT MATCHED THEN INSERT *`,
    },
  ],
};
