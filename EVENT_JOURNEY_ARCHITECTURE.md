# 0xDSI Event Journey Architecture

## The Complete Lifecycle of a Security Event on Databricks

Built 100% on Databricks-native features: Delta Lake, Spark Structured Streaming, GraphFrames, Unity Catalog, MLflow, and the open-source CET (Correlation Event Trends) engine.

---

## Architecture Overview

```
                              ┌─────────────────────────────────────────────┐
                              │          DATA SOURCES (ANY)                  │
                              │                                             │
                              │  EDR ─ SIEM ─ Cloud ─ SCADA ─ Mainframe    │
                              │  Firewall ─ IAM ─ NDR ─ IoT ─ Financial    │
                              │  Telecom (CDR/SS7) ─ Healthcare (HL7/FHIR) │
                              │  Custom Vibe-Coded ─ eBPF/XDP ─ PCAP       │
                              └─────────────────┬───────────────────────────┘
                                                │
                              ┌─────────────────▼───────────────────────────┐
                              │    CONNECTOR LAYER (70+ Protocols)           │
                              │                                             │
                              │  Transport: HTTPS/gRPC/Kafka/AMQP/MQTT     │
                              │  Physical: RS-485/CAN/MIL-STD-1553         │
                              │  Telecom: SS7/SIGTRAN/GTP/DIAMETER          │
                              │  Mainframe: EBCDIC/TN3270/SNA/MQ           │
                              │  SCADA: DNP3/IEC-61850/S7comm/Modbus       │
                              │                                             │
                              │  ┌─────────────────────────────────────┐    │
                              │  │  STATISTICAL SAMPLING ENGINE         │    │
                              │  │  (Priority-Aware Reservoir Sampling) │    │
                              │  │                                      │    │
                              │  │  12 Priority Rules → 100% Capture   │    │
                              │  │  Routine Telemetry → 1-50% Sampled  │    │
                              │  └─────────────────────────────────────┘    │
                              └─────────────────┬───────────────────────────┘
                                                │
                              ┌─────────────────▼───────────────────────────┐
                              │   INGESTION (Spark Structured Streaming)     │
                              │                                             │
                              │  Source Adapters: Kafka / Event Hubs / S3   │
                              │  Schema Enforcement → Quarantine Invalid    │
                              │  UUID Assignment + Ingestion Timestamp      │
                              │  Data Quality Validation (DQ Validator)     │
                              │                                             │
                              │  Output: Delta Table "events" (Bronze)      │
                              │  Trigger Interval: 10 seconds               │
                              │  Watermark: 5 minutes (late arrival)        │
                              └─────────────────┬───────────────────────────┘
                                                │
                         ╔══════════════════════╪════════════════════════════╗
                         ║     THE FORK: PRE-NORMALIZATION SPLIT            ║
                         ║                                                  ║
                         ║  Raw events are IMMEDIATELY forked into          ║
                         ║  THREE parallel Spark Streaming pipelines        ║
                         ║  BEFORE any normalization/schema mapping.        ║
                         ║                                                  ║
                         ║  This is the critical architectural decision:    ║
                         ║  CEP and CET operate on RAW data to detect       ║
                         ║  threats in real-time without the latency of     ║
                         ║  expensive schema transformations.               ║
                         ╚═══════╤═══════════════╤═══════════════╤══════════╝
                                 │               │               │
                    ┌────────────▼──┐   ┌────────▼──────┐   ┌───▼────────────────┐
                    │  CEP ENGINE   │   │  CET ENGINE   │   │ NORMALIZATION      │
                    │  (5s trigger) │   │  (5s trigger) │   │ (30s trigger)      │
                    │               │   │               │   │                    │
                    │  GraphFrames  │   │  Open Source  │   │  Schema Mapping    │
                    │  Pattern Match│   │  Trend Engine │   │  OCSF/ECS/CIM     │
                    └───────┬───────┘   └───────┬───────┘   └────────┬───────────┘
                            │                   │                     │
                            ▼                   ▼                     ▼
                    ┌───────────────┐   ┌───────────────┐   ┌────────────────────┐
                    │ cep_matches   │   │ cet_trends    │   │ normalized_events  │
                    │ (Delta Table) │   │ (Delta Table) │   │ (Delta Table)      │
                    └───────┬───────┘   └───────┬───────┘   └────────┬───────────┘
                            │                   │                     │
                            └─────────┬─────────┘                    │
                                      │                              │
                    ┌─────────────────▼──────────────────────────────▼───────────┐
                    │          CORRELATION & ALERT GENERATION                     │
                    │                                                            │
                    │  Threshold Correlation (5-min windows)                     │
                    │  Sequence Correlation (30-min attack chains)               │
                    │  Negative Correlation (absence detection)                  │
                    │  Graph Correlation (entity relationship scoring)           │
                    │  Supply Chain Risk (dependency graph)                      │
                    │  Cloud Posture (misconfiguration chains)                   │
                    │                                                            │
                    │  Output: alerts table + cep_pattern_matches               │
                    └─────────────────┬─────────────────────────────────────────┘
                                      │
                    ┌─────────────────▼─────────────────────────────────────────┐
                    │          AGENT ORCHESTRATION (31 Autonomous Agents)        │
                    │                                                            │
                    │  Triage → Enrichment → Threat Hunter → Response           │
                    │  CISO Assistant → Playbook Generator → Forensics          │
                    │  Malware Sandbox → Red Team → Model Poisoning Guard       │
                    │  Stateful Backdoor Defense → Connector Version Agent      │
                    └─────────────────┬─────────────────────────────────────────┘
                                      │
                    ┌─────────────────▼─────────────────────────────────────────┐
                    │          RESPONSE & CASE MANAGEMENT                        │
                    │                                                            │
                    │  Automated Response Actions (SOAR)                         │
                    │  Case Management with Evidence Chain                       │
                    │  Human-in-the-Loop Approvals                              │
                    │  Playbook Execution Engine                                 │
                    └───────────────────────────────────────────────────────────┘
```

---

## Component Deep Dive

### 1. Connector Layer

The connector layer is the entry point where security telemetry enters the platform. Every connector is defined as a deployable artifact with specific acquisition methods, transport protocols, and data format handling.

#### 1.1 Acquisition Methods (56+ methods, 10 categories)

| Category | Methods | Use Case |
|----------|---------|----------|
| **API** | REST Poll, REST Iterator, REST Stream, GraphQL, gRPC (Bidirectional/Unary) | Cloud API integration, vendor APIs |
| **Push** | Webhook, Webhook+HMAC, SSE, WebSocket | Real-time event delivery from sources |
| **Messaging** | MQTT, AMQP, ZeroMQ | IoT, message queue consumption |
| **Streaming** | Kafka, Kinesis, Event Hubs, Pub/Sub, NATS, Redis Streams | High-throughput event streaming |
| **Network** | Syslog, SNMP Trap, NetFlow/IPFIX, sFlow, PCAP, SPAN Mirror | Network telemetry and packet capture |
| **Kernel** | DPDK, eBPF (Tracepoints/Kprobes/XDP/TC/LSM/Uprobes), LKM, auditd, ETW, WFP | Ultra-low-latency OS-level capture |
| **Storage** | S3/GCS polling, S3 Event Notifications, FTP/SFTP, File Tail (inotify) | Batch file and log ingestion |
| **Database** | JDBC, Change Data Capture (CDC) | Direct database monitoring |
| **IoT** | CoAP, OPC-UA, Modbus | Resource-constrained device telemetry |
| **SCADA/ICS** | DNP3, IEC 61850, IEC 104/101, BACnet, EtherNet/IP, S7comm, MQTT Sparkplug B, PROFIBUS, OPC DA/HDA, PI AF | Industrial control system monitoring |
| **Mainframe** | SMF Records, RACF/Top Secret/ACF2, DB2 Log, CICS Journal, IMS, VSAM CDC, MQ Bridge, Zowe API | Legacy enterprise system extraction |

#### 1.2 Transport Protocols (70+ protocols, 13 categories)

The transport layer handles how bits move from source to connector. This ranges from modern encrypted channels to physical serial buses and legacy protocols still in production at utilities and government facilities.

**Why this matters for security**: Many critical infrastructure attacks exploit protocol-level weaknesses. Understanding the transport layer is essential for detecting man-in-the-middle attacks, replay attacks, and protocol-specific exploitation techniques.

#### 1.3 Data Format Support

The platform handles three classes of data:

**Structured Formats** (90+ formats across 8 industries):
- General: JSON, Avro, Parquet, Protobuf, Arrow, EBCDIC
- Financial: ISO 8583, ISO 20022, FIX, SWIFT MT/MX, ITCH, OUCH, PIX/Boleto
- Telecom: CDR, IPDR, TAP3, XDR, EDR, DIAMETER AVPs
- Healthcare: HL7v2, FHIR R4, DICOM SR, X12 EDI
- Energy: CIM (IEC 61970), DLMS/COSEM, IEEE C37.118
- Automotive: DBC, MDF4, NMEA, ASTERIX, J1939
- Manufacturing: MTConnect, ISA-95, GS1 EPCIS
- Government: NIEM, MIL-STD-6016, STANAG, CoT

**Semi-Structured Formats** (50+ formats):
- Log Formats: CEF, LEEF, Syslog, EVTX, GELF, CLF
- Financial: SWIFT FIN, FIX Session Log, BAI2, MT940, XBRL
- Telecom: TAP3 ASN.1, SS7 MSU, SIP/SDP, MML
- Healthcare: HL7v2 pipe-delimited, CCD/C-CDA
- SCADA: DNP3 Objects, IEC 104 ASDU, GOOSE/GSSE

**Unstructured Data** (32 types, 8 categories):
- Video, Audio, Images, Binaries/Executables, Documents, Code, Crypto/Certs, Network Captures
- Each analyzed by LLM-generated UDFs that extract both metadata AND content
- Security indicators automatically identified (macros, IOCs, steganography, obfuscation)

---

### 2. Statistical Sampling Engine

**Databricks Feature**: Spark Structured Streaming with custom `foreachBatch` sink

For high-EPS (Events Per Second) sources producing 50K-500K+ EPS, the platform implements intelligent statistical sampling that preserves critical security events while reducing storage costs.

#### Architecture:

```
Raw Event Stream (e.g., 200K EPS)
         │
         ▼
┌──────────────────────────────────┐
│   PRIORITY EVALUATION LAYER     │
│                                  │
│   12 SQL Filter Rules:           │
│   ┌────────────────────────┐     │
│   │ 1. High Severity       │─┐   │
│   │ 2. CEP Pattern Match   │ │   │
│   │ 3. Large Payloads      │ │   │
│   │ 4. Graph Escalated     │ │   │
│   │ 5. Micro-Patterns      │ │   │   ┌──────────────────┐
│   │ 6. Auth Events         │ ├───┼──▶│ 100% RETENTION   │
│   │ 7. Rare/First-Seen     │ │   │   │ (Priority Events)│
│   │ 8. Lateral Movement    │ │   │   │ ~15-30% of total │
│   │ 9. Data Exfiltration   │ │   │   └──────────────────┘
│   │ 10. TLS Anomalies      │ │   │
│   │ 11. Timing Anomalies   │─┘   │
│   │ 12. Honeypot Triggered │     │
│   └────────────────────────┘     │
│                                  │
│   Non-Priority Events:           │
│   ┌────────────────────────┐     │   ┌──────────────────┐
│   │ Reservoir Sampling     │─────┼──▶│ X% RETAINED      │
│   │ (Configurable 1-50%)   │     │   │ (Routine Traffic) │
│   └────────────────────────┘     │   └──────────────────┘
└──────────────────────────────────┘
```

**Key Principle**: ALL events (100%) still flow through CEP and CET engines for pattern matching and graph scoring. Sampling only affects which raw events are persisted to storage. This means even sampled-away events contribute to correlation detection before being discarded.

#### Priority Rules in SQL:

```sql
-- Example: Priority Rule for Graph-Escalated Entities
WHERE entity_id IN (
  SELECT entity_id FROM entity_risk_scores
  WHERE page_rank > 0.8
     OR betweenness_centrality > percentile(0.95)
     OR risk_score > 80
)

-- Example: Priority Rule for Timing Anomalies
WHERE (EXTRACT(HOUR FROM event_time) NOT BETWEEN 8 AND 18)
   OR time_anomaly_score > 0.8
   OR impossible_travel_flag = true
```

---

### 3. Ingestion Layer (Bronze)

**Databricks Feature**: Spark Structured Streaming + Delta Lake + Auto Loader

The ingestion layer is the first persistent storage point. It receives events from the connector layer and performs minimal validation before writing to the Bronze Delta table.

#### Processing Steps:

1. **Source Adapter Selection**: Reads from Kafka (`spark.readStream.format("kafka")`), Azure Event Hubs, or S3/ADLS via CloudFiles Auto Loader
2. **JSON Parsing**: Extracts structured fields from raw payload using `from_json()` with defined schema
3. **UUID Assignment**: Each event gets a globally unique `event_id` via `uuid()` UDF
4. **Ingestion Timestamp**: Records exact ingestion time (separate from event source time)
5. **Schema Validation**: Checks for required fields (event_type, timestamp)
6. **Quarantine Split**: Invalid events are routed to `quarantined_events` table with failure reason
7. **Delta Write**: Valid events written to `events` Bronze table with `append` mode

#### Streaming Configuration:

```python
# Bronze ingestion: low latency for security
spark.readStream \
    .format("kafka") \
    .option("kafka.bootstrap.servers", bootstrap_servers) \
    .option("subscribe", "security-events") \
    .option("maxOffsetsPerTrigger", 100000) \
    .load() \
    .writeStream \
    .trigger(processingTime="10 seconds") \
    .option("checkpointLocation", "/checkpoints/bronze_events") \
    .toTable("events")
```

#### Data Quality Validator (runs during ingestion):

- **Schema Validation**: Enforces field types and required fields
- **Field Presence Tracking**: Monitors % of events with each optional field
- **Timestamp Drift Detection**: Alerts when event timestamps deviate >5min from ingestion time
- **Schema Evolution Detection**: Identifies new/removed fields across batches
- **Duplicate Detection**: Sliding 10K hash window catches repeated events
- **Volume Anomaly Detection**: Z-score analysis (3-sigma threshold) flags sudden spikes/drops

---

### 4. The Fork: Pre-Normalization Split (ParallelCEPCETProcessor)

**Databricks Feature**: Multiple Spark Structured Streaming queries reading from the same Delta table with Change Data Feed

This is the most critical architectural decision in the platform. Rather than normalizing events first and then correlating, we fork the raw event stream into three independent Spark Streaming queries that execute simultaneously.

#### Why Fork Before Normalization?

1. **Latency**: Normalization is expensive (schema lookups, field mapping, enrichment). CEP/CET need sub-second response.
2. **Fidelity**: Normalization can lose information. Original field names, raw payloads, and vendor-specific attributes are preserved for pattern matching.
3. **Decoupling**: A normalization failure does not block security detection.
4. **Parallelism**: Databricks can schedule these on separate clusters/slots for guaranteed throughput.

#### Implementation:

```python
class ParallelCEPCETProcessor:
    def start_parallel_pipelines(self):
        # All three read from the SAME source (Bronze Delta table)
        raw_stream = spark.readStream.table("events")

        # Pipeline 1: CEP (5-second micro-batches)
        self.cep_query = raw_stream.writeStream \
            .foreachBatch(self._process_cep_batch) \
            .trigger(processingTime="5 seconds") \
            .start()

        # Pipeline 2: CET (5-second micro-batches)
        self.cet_query = raw_stream.writeStream \
            .foreachBatch(self._process_cet_batch) \
            .trigger(processingTime="5 seconds") \
            .start()

        # Pipeline 3: Normalization (30-second batches, less urgent)
        self.norm_query = raw_stream.writeStream \
            .foreachBatch(self._process_normalization_batch) \
            .trigger(processingTime="30 seconds") \
            .start()
```

---

### 5. CEP Engine (Complex Event Processing)

**Databricks Feature**: GraphFrames + Spark Structured Streaming + Delta Lake

The CEP engine detects multi-step attack patterns by analyzing sequences, thresholds, and correlations across event streams in real-time.

#### 5.1 Threshold-Based Correlation

Detects high-frequency repetitions of the same event type from the same source within a time window.

```python
# 5-minute tumbling window with 1-minute slide
threshold_matches = events \
    .withWatermark("timestamp", "5 minutes") \
    .groupBy(
        window("timestamp", "5 minutes", "1 minute"),
        "event_type",
        "source_ip"
    ) \
    .agg(
        count("*").alias("event_count"),
        collect_list("event_id").alias("correlated_ids"),
        max("severity").alias("max_severity")
    ) \
    .filter("event_count >= 5")
```

**Examples detected**:
- Brute force (50+ auth failures from same IP in 5 minutes)
- Port scan (100+ connection attempts to different ports)
- DDoS (10K+ requests from single source)

#### 5.2 Sequence-Based Correlation (Attack Chain Detection)

Detects multi-stage attack patterns where events follow a specific kill-chain sequence within a time window.

```python
# Define attack stages
ATTACK_STAGES = {
    "authentication_failure": ("TA0001", "Initial Access Attempt"),
    "privilege_escalation": ("TA0004", "Privilege Escalation"),
    "lateral_movement": ("TA0008", "Lateral Movement"),
    "data_exfiltration": ("TA0010", "Exfiltration"),
}

# 30-minute window: detect chains with 3+ stages
sequence_matches = events \
    .withWatermark("timestamp", "5 minutes") \
    .groupBy(
        window("timestamp", "30 minutes", "5 minutes"),
        "source_ip"
    ) \
    .agg(
        collect_set("event_type").alias("stages_observed"),
        count(distinct("event_type")).alias("num_stages")
    ) \
    .filter("num_stages >= 3")  # At least 3 kill-chain stages

# Confidence = num_stages / total_possible_stages
```

#### 5.3 GraphFrames-Based Pattern Matching

**Databricks Feature**: GraphFrames library for graph-parallel computation

The CEP engine uses GraphFrames to detect complex relational patterns that cannot be expressed as simple windowed aggregations.

```python
from graphframes import GraphFrame

# Build entity relationship graph from events
vertices = events.select(
    col("source_ip").alias("id"),
    col("username"),
    col("severity")
).distinct()

edges = events.select(
    col("source_ip").alias("src"),
    col("dest_ip").alias("dst"),
    col("event_type").alias("relationship"),
    col("timestamp")
)

g = GraphFrame(vertices, edges)

# Find connected components (related attack infrastructure)
components = g.connectedComponents()

# Find shortest paths (attack paths between assets)
paths = g.shortestPaths(landmarks=["critical_server_1", "dc_primary"])

# Motif finding: detect specific attack patterns
# "Source communicates with C2, then C2 communicates with target"
c2_pattern = g.find("(a)-[e1]->(b); (b)-[e2]->(c)") \
    .filter("e1.relationship = 'dns_query'") \
    .filter("e2.relationship = 'data_transfer'") \
    .filter("b.id IN (SELECT ip FROM threat_intel_iocs)")
```

#### 5.4 Output Schema (cep_pattern_matches):

| Column | Type | Description |
|--------|------|-------------|
| match_id | STRING | Unique correlation match identifier |
| rule_id | STRING | Correlation rule that triggered |
| confidence | DOUBLE | 0.0-1.0 confidence score |
| severity | STRING | critical/high/medium/low |
| matched_events | ARRAY[STRING] | Event IDs that form the pattern |
| attack_stage | STRING | MITRE ATT&CK tactic/technique |
| window_start | TIMESTAMP | Detection window start |
| window_end | TIMESTAMP | Detection window end |
| context | MAP[STRING, STRING] | Additional context (IPs, users, etc.) |

---

### 6. CET Engine (Correlation Event Trends)

**Open Source Project**: CET is a purpose-built real-time trend correlation engine designed to complement CEP by focusing on statistical trends, anomaly detection, and behavioral drift rather than discrete pattern matching.

#### What CET Does (vs. CEP):

| Aspect | CEP | CET |
|--------|-----|-----|
| **Focus** | Discrete patterns (sequences, thresholds) | Statistical trends and behavioral drift |
| **Time Scale** | Seconds to minutes (attack chains) | Minutes to hours (behavioral baselines) |
| **Output** | Binary match/no-match | Continuous score (0.0-1.0) |
| **Graph Usage** | Pattern motifs (find specific shapes) | PageRank, centrality, community detection |
| **Databricks Feature** | Spark Streaming + GraphFrames motifs | GraphFrames metrics + MLflow models |

#### 6.1 Trend Computation Pipeline:

```python
class CETEngine:
    def _process_cet_batch(self, batch_df, batch_id):
        # 1. Compute entity activity rates (events per entity per window)
        entity_rates = batch_df.groupBy("source_ip", "username") \
            .agg(
                count("*").alias("event_count"),
                countDistinct("event_type").alias("event_diversity"),
                countDistinct("dest_ip").alias("unique_destinations"),
                avg("severity_numeric").alias("avg_severity")
            )

        # 2. Compare against historical baselines (Delta table)
        baselines = spark.table("entity_baselines")
        drift_scores = entity_rates.join(baselines, "source_ip") \
            .withColumn("rate_zscore",
                (col("event_count") - col("baseline_mean")) / col("baseline_stddev")
            ) \
            .withColumn("diversity_drift",
                abs(col("event_diversity") - col("baseline_diversity")) / col("baseline_diversity")
            )

        # 3. Graph-based entity scoring
        g = GraphFrame(entity_vertices, event_edges)
        pagerank = g.pageRank(resetProbability=0.15, maxIter=10)
        betweenness = compute_betweenness(g)

        # 4. Combine into CET score
        cet_scores = drift_scores \
            .join(pagerank.vertices, "id") \
            .withColumn("cet_score",
                (col("rate_zscore") * 0.3) +
                (col("diversity_drift") * 0.2) +
                (col("pagerank") * 0.3) +
                (col("betweenness_norm") * 0.2)
            )

        # 5. Write trends to Delta
        cet_scores.write.mode("append").saveAsTable("cet_trends")
```

#### 6.2 CET Scoring Components:

1. **Rate Z-Score** (30% weight): How many standard deviations above/below normal activity rate
2. **Diversity Drift** (20% weight): Change in the variety of event types an entity produces
3. **PageRank** (30% weight): Importance in the entity communication graph (highly-connected = more interesting)
4. **Betweenness Centrality** (20% weight): How often an entity lies on the shortest path between others (potential pivot point)

#### 6.3 Baseline Management:

Baselines are maintained per-entity using MLflow-tracked sliding windows:

```python
# Update baselines every hour using Delta Lake merge
spark.sql("""
    MERGE INTO entity_baselines AS target
    USING (
        SELECT
            source_ip,
            AVG(event_count) as baseline_mean,
            STDDEV(event_count) as baseline_stddev,
            AVG(event_diversity) as baseline_diversity,
            current_timestamp() as last_updated
        FROM cet_trends
        WHERE window_start > current_timestamp() - INTERVAL 7 DAYS
        GROUP BY source_ip
    ) AS source
    ON target.source_ip = source.source_ip
    WHEN MATCHED THEN UPDATE SET *
    WHEN NOT MATCHED THEN INSERT *
""")
```

---

### 7. Normalization Pipeline (Silver)

**Databricks Feature**: Spark Structured Streaming + Delta Lake + Unity Catalog Lineage

The normalization pipeline runs on 30-second batches (less urgent than CEP/CET) and maps raw vendor-specific events to a common schema.

#### Supported Output Schemas:
- OCSF v1.3.0 (Open Cybersecurity Schema Framework)
- Elastic Common Schema (ECS)
- Splunk CIM (Common Information Model)
- Sigma (Detection Rule Format)
- STIX/TAXII 2.1
- Microsoft ASIM (Advanced Security Information Model)
- Google UDM (Unified Data Model)
- Custom Data Contracts (user-defined)

#### Pipeline Steps:

1. **Format Detection**: Identify source format (CEF, JSON, Syslog, EBCDIC, etc.)
2. **Field Extraction**: Parse vendor-specific fields into intermediate representation
3. **Schema Mapping**: Map intermediate fields to target schema using lookup tables
4. **Type Coercion**: Convert timestamps, normalize IP formats, standardize severity
5. **Enrichment**: Add GeoIP, ASN, threat intel, asset context from reference tables
6. **Validation**: Verify mapped event passes target schema constraints
7. **Delta Write**: Append to `normalized_events` Silver table

```python
def _process_normalization_batch(self, batch_df, batch_id):
    # Load mapping rules for each connector type
    mappings = spark.table("connector_field_mappings")

    # Join events with their connector's mapping rules
    mapped = batch_df.join(mappings, "connector_id") \
        .select(
            col("event_id"),
            expr(col("mapping_expression")).alias("ocsf_field"),
            col("ocsf_target_field")
        )

    # Pivot into OCSF structure
    normalized = mapped.groupBy("event_id").pivot("ocsf_target_field").agg(first("ocsf_field"))

    # Enrich with reference data
    enriched = normalized \
        .join(spark.table("geo_ip_ranges"), expr("ip_in_range(src_ip, range_start, range_end)")) \
        .join(spark.table("asset_inventory"), "dest_ip") \
        .join(spark.table("threat_intel_iocs"), col("src_ip") == col("ioc_value"), "left")

    enriched.write.mode("append").saveAsTable("normalized_events")
```

---

### 8. Correlation Engine (Post-Normalization)

**Databricks Feature**: Spark Structured Streaming + Delta Lake CDF (Change Data Feed)

After normalization, a second layer of correlation runs on the enriched, schema-compliant events. This provides deeper analysis that benefits from normalized field names and enrichment data.

#### 8.1 Correlation Types:

| Type | Window | Description |
|------|--------|-------------|
| **Threshold** | 5 min | Count-based triggers (brute force, scan detection) |
| **Sequence** | 30 min | Kill-chain attack patterns (multi-stage) |
| **Negative** | 1-24 hr | Detection by ABSENCE (expected events that didn't happen) |
| **Graph** | 15 min | Entity relationship patterns (C2 communication graphs) |
| **Supply Chain** | 6 hr | Dependency graph risk propagation |
| **Cloud Posture** | 1 hr | Misconfiguration chain detection |
| **Temporal Window** | Variable | Custom time windows with sliding offsets |

#### 8.2 Negative Correlation (Unique to 0xDSI):

Detects threats by identifying events that SHOULD have happened but DIDN'T:

```python
# Example: Firewall rule allows traffic but no corresponding log from target service
negative_rules = [
    {
        "name": "Missing Service Response",
        "expected": "service_response",
        "condition": "firewall_allow",
        "window": "5 minutes",
        "severity": "high"
    },
    {
        "name": "Missing Heartbeat",
        "expected": "agent_heartbeat",
        "condition": "agent_registered = true",
        "window": "10 minutes",
        "severity": "critical"
    }
]
```

---

### 9. Alert Generation & Scoring

**Databricks Feature**: Delta Lake + MLflow Served Models

Alerts are generated when correlation rules trigger. Each alert passes through an ML scoring pipeline before reaching analysts.

#### Scoring Pipeline:

```
Correlation Match → ML Risk Score → Priority Queue → Agent Triage → Analyst
        │                │                │               │
        ▼                ▼                ▼               ▼
  Raw pattern       MLflow model      Weighted by      Auto-enriched
  with context      (trained on       entity risk,     with context,
  and matched       analyst feedback)  asset value,     playbook
  event IDs                            time-of-day     suggestions
```

#### ML Risk Scoring (MLflow):

```python
import mlflow

# Load production model from MLflow Model Registry
model = mlflow.pyfunc.load_model("models:/alert_risk_scorer/Production")

# Score each alert
alert_features = extract_features(correlation_match)
risk_score = model.predict(alert_features)  # 0.0 - 1.0

# Features include:
# - Event count in pattern
# - Max severity of constituent events
# - Entity historical risk score (from CET)
# - Asset criticality of affected systems
# - Time-of-day anomaly score
# - MITRE ATT&CK technique prevalence
# - Analyst feedback loop (ALHF - Active Learning Human Feedback)
```

---

### 10. Agent Orchestration (31 Autonomous Agents)

**Databricks Feature**: Databricks Model Serving + Unity Catalog + Delta Sharing

The platform runs 31 specialized agents that autonomously process alerts, enrich context, and take response actions.

#### Agent Pipeline (for each alert):

```
Alert Generated
    │
    ▼
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│  SAGE Agent      │────▶│  NOVA Agent      │────▶│  VANGUARD Agent  │
│  (Enrichment)    │     │  (Investigation) │     │  (Response)      │
│                  │     │                  │     │                  │
│  • Threat Intel  │     │  • Entity Graph  │     │  • Block IP      │
│  • GeoIP/ASN     │     │  • Timeline      │     │  • Isolate Host  │
│  • Asset Context │     │  • Scope Impact  │     │  • Disable User  │
│  • WHOIS/DNS     │     │  • Root Cause    │     │  • SOAR Playbook │
└──────────────────┘     └──────────────────┘     └──────────────────┘
                                                           │
                                    ┌──────────────────────▼───────┐
                                    │  Human-in-the-Loop Approval  │
                                    │  (Required for critical)     │
                                    └──────────────────────────────┘
```

#### Full Agent Registry:

| # | Agent | Role |
|---|-------|------|
| 1 | Triage Agent | Initial alert classification and priority assignment |
| 2 | Enrichment Agent (SAGE) | Context enrichment from 15+ data sources |
| 3 | Threat Hunter | Proactive IOC and TTP hunting |
| 4 | Orchestrator | Multi-agent coordination and workflow |
| 5 | SAGE Enrichment | Deep threat intelligence correlation |
| 6 | NOVA Investigation | Full incident investigation and scoping |
| 7 | VANGUARD Response | Automated containment and remediation |
| 8 | CTI Attribution | Threat actor attribution and campaign linking |
| 9 | Pattern Discovery | Novel pattern identification (unsupervised) |
| 10 | Vector Memory | Semantic search across historical events |
| 11 | Red Team | Adversary simulation and control validation |
| 12 | Blue Team | Defensive posture assessment |
| 13 | Forensics | Deep forensic analysis of artifacts |
| 14 | Honeypot | Deception technology management |
| 15 | CISO Assistant | Executive risk summarization |
| 16 | Playbook Generator | Dynamic response playbook creation |
| 17 | Incident Summarizer | Natural language incident reports |
| 18 | Document Analyzer | Unstructured document intelligence |
| 19 | Malware Sandbox | Dynamic malware detonation and analysis |
| 20 | LLM Guardrails | AI usage monitoring and PII protection |
| 21 | Model Poisoning Guard | ML model integrity verification |
| 22 | Threat Simulator | Attack scenario simulation |
| 23 | Connector Adapter | Dynamic connector generation |
| 24 | Threat Radar | Real-time threat landscape monitoring |
| 25 | ALHF Learning | Active Learning from Human Feedback |
| 26 | Realtime Graph CEP | Live graph pattern detection |
| 27 | Vector Scoring | Embedding-based threat scoring |
| 28 | AI Correlation | LLM-powered correlation discovery |
| 29 | Connector Version Agent | Connector lifecycle management |
| 30 | Stateful Backdoor Defense | Persistent backdoor detection |
| 31 | Vibe Connector Builder | AI-generated connector code |

---

### 11. Delta Lake Storage Architecture

**Databricks Feature**: Delta Lake with Change Data Feed, Time Travel, and Z-Ordering

```
┌───────────────────────────────────────────────────────────────────────┐
│                         UNITY CATALOG                                  │
│                                                                       │
│  ┌─────────────────────────────────────────────────────────────────┐  │
│  │  Catalog: 0xdsi_security                                         │  │
│  │                                                                   │  │
│  │  ┌─────────────┐  ┌──────────────┐  ┌───────────────────────┐   │  │
│  │  │   BRONZE    │  │    SILVER    │  │        GOLD           │   │  │
│  │  │             │  │              │  │                       │   │  │
│  │  │ events      │  │ normalized   │  │ alerts               │   │  │
│  │  │ quarantined │  │ enriched     │  │ cases                │   │  │
│  │  │ raw_flows   │  │ entity_graph │  │ risk_scores          │   │  │
│  │  │             │  │              │  │ executive_dashboard   │   │  │
│  │  └─────────────┘  └──────────────┘  └───────────────────────┘   │  │
│  │                                                                   │  │
│  │  ┌──────────────────┐  ┌───────────────────────────────────┐     │  │
│  │  │   CEP / CET      │  │         REFERENCE                 │     │  │
│  │  │                  │  │                                   │     │  │
│  │  │ cep_matches      │  │ threat_intel_iocs                │     │  │
│  │  │ cet_trends       │  │ geo_ip_ranges                    │     │  │
│  │  │ entity_baselines │  │ asset_inventory                  │     │  │
│  │  │ correlation_rules│  │ connector_definitions            │     │  │
│  │  │ negative_alerts  │  │ entity_baselines                 │     │  │
│  │  └──────────────────┘  └───────────────────────────────────┘     │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                       │
│  Governance: Row/Column Filters, Audit Logs, Data Lineage, Tags      │
└───────────────────────────────────────────────────────────────────────┘
```

#### Delta Lake Features Used:

| Feature | Purpose |
|---------|---------|
| **Change Data Feed (CDF)** | Stream changes from Bronze to Silver/Gold without re-reading entire table |
| **Time Travel** | Forensic investigation: query state at any point in last 30 days |
| **Z-Ordering** | Optimize queries by `source_ip`, `timestamp`, `event_type` |
| **Liquid Clustering** | Auto-optimize data layout for common query patterns |
| **OPTIMIZE** | Compact small files from streaming into larger Parquet files |
| **VACUUM** | Clean up old files while respecting time travel retention |
| **Schema Evolution** | Gracefully handle new fields from connectors without migration |
| **Deletion Vectors** | Efficient GDPR/compliance record deletion without rewrite |

---

### 12. Edge Deployment & Bandwidth Control

For remote sites, satellite links, and constrained networks, connectors deploy in edge mode with intelligent bandwidth management.

#### Edge Architecture:

```
┌─────────────────────────────────────────────────────┐
│  REMOTE SITE (Satellite/Cellular/Constrained Link)  │
│                                                     │
│  ┌──────────────────────────────────────┐           │
│  │  Edge Connector                      │           │
│  │                                      │           │
│  │  ┌──────────────┐  ┌──────────────┐ │           │
│  │  │ Local Buffer │  │ Priority     │ │           │
│  │  │ (512MB disk) │  │ Queue        │ │           │
│  │  └──────┬───────┘  └──────┬───────┘ │           │
│  │         │                  │         │           │
│  │  ┌──────▼──────────────────▼──────┐  │           │
│  │  │  Bandwidth Controller          │  │           │
│  │  │  • Rate Limit (100 Mbps)       │  │           │
│  │  │  • Burst Allowance (150%)      │  │           │
│  │  │  • Compression (zstd 2.8x)    │  │           │
│  │  │  • Off-peak multiplier (3x)    │  │           │
│  │  │  • Backpressure (buffer/drop)  │  │           │
│  │  └──────────────┬─────────────────┘  │           │
│  │                 │                     │           │
│  └─────────────────┼─────────────────────┘           │
│                    │ Throttled, compressed stream     │
└────────────────────┼─────────────────────────────────┘
                     │
          ╔══════════╪════════════════╗
          ║  WAN LINK                 ║
          ║  (Satellite/4G/MPLS)     ║
          ╚══════════╪════════════════╝
                     │
┌────────────────────▼─────────────────────────────────┐
│  DATABRICKS CLOUD (Central)                          │
│                                                      │
│  Kafka/Event Hubs → Bronze → CEP/CET → Silver/Gold  │
└──────────────────────────────────────────────────────┘
```

#### Bandwidth Control Features:

- **Rate Limiting**: Token bucket algorithm with configurable max throughput (kbps/mbps/gbps)
- **Burst Allowance**: Temporary spike handling (% above limit)
- **Wire Compression**: zstd (2.8x), lz4 (2.1x), snappy (1.7x), gzip (3.2x)
- **Priority Queue**: Critical events transmitted first (security > telemetry > metrics)
- **Backpressure Actions**: Buffer to disk, drop lowest priority, apply sampling, throttle source, spill to object store
- **Time-of-Day Scheduling**: Multiplied bandwidth during off-peak hours to flush buffers
- **Link Quality Monitoring**: RTT latency, packet loss, utilization metrics

---

### 13. Vibe Connector Builder

**Databricks Feature**: Databricks Model Serving (LLM) + Delta Lake + Workflows

The Vibe Connector Builder is an AI-assisted system that generates production-ready connector code from natural language descriptions and sample data.

#### Builder Workflow:

1. **Paste Sample**: User provides raw event sample data
2. **Configure**: Select data format (structured/semi-structured/unstructured) from 150+ options
3. **Acquisition**: Choose ingestion method (56+ options across 10 categories)
4. **Transport**: Select wire protocol (70+ options across 13 categories)
5. **Quality**: Configure data quality rules (schema validation, dedup, drift detection)
6. **Sampling**: Set EPS control with priority-aware intelligent sampling
7. **Generate**: LLM generates connector code, parser, normalization mapping, and tests
8. **Deploy**: Compile to Docker, Wheel, K8s, Rust binary, or eBPF program

#### Unstructured Data UDF Generation:

For unstructured data (video, audio, images, binaries, documents), the builder generates custom Spark UDFs that extract both metadata AND content:

```python
# LLM generates UDFs like this for each unstructured type:
@udf(returnType=StructType([
    StructField("file_type", StringType()),
    StructField("architecture", StringType()),
    StructField("entropy", FloatType()),
    StructField("imports", ArrayType(StringType())),
    StructField("iocs_extracted", ArrayType(StringType())),
    StructField("yara_matches", ArrayType(StringType())),
    StructField("malware_family_guess", StringType()),
]))
def extract_binary_content(binary_data):
    """Disassemble and analyze PE/ELF/Mach-O binaries.
    Extracts IOCs, suspicious strings, YARA matches."""
    ...
```

---

### 14. ML Training & Model Management

**Databricks Feature**: MLflow + Feature Store + Model Serving + Mosaic AI

#### Models in Production:

| Model | Purpose | Training Data | Serving |
|-------|---------|---------------|---------|
| Alert Risk Scorer | Priority scoring for alerts | Historical analyst feedback | Real-time endpoint |
| UEBA Baseline | User behavior anomaly detection | 30-day behavioral profiles | Batch (hourly) |
| Threat Scoring | Entity risk classification | Labeled threat events | Real-time endpoint |
| GraphRAG Zero-Day | Novel attack pattern discovery | Graph embeddings + known attacks | Batch (daily) |
| Feature Engineering | Automated feature creation | Raw event statistics | Feature Store |

#### Active Learning Human Feedback (ALHF):

The platform implements a continuous improvement loop where analyst decisions feed back into model training:

```
Analyst Action → Label Capture → Feature Store → Model Retrain → MLflow Registry → Serving
     ↑                                                                              │
     └──────────────────────────────────────────────────────────────────────────────┘
```

---

### 15. Unity Catalog Governance

**Databricks Feature**: Unity Catalog + Information Schema + Audit Logs

All data access is governed through Unity Catalog, providing:

- **Fine-grained access control**: Table, column, and row-level security
- **Data lineage**: Automatic tracking of data transformations (events → normalized → alerts)
- **Audit logging**: Every query, access, and modification is logged
- **Data classification**: Automatic PII detection and tagging
- **Cross-workspace sharing**: Delta Sharing for multi-tenant deployments
- **Credential passthrough**: Identity-aware access to external systems

---

## Event Journey Timeline (End-to-End)

```
T+0ms       Event generated at source (EDR agent detects process creation)
T+5ms       Connector acquires event via gRPC stream
T+10ms      Statistical sampling: priority rule match → 100% retained
T+15ms      Event serialized and transmitted (zstd compressed)
T+50ms      Arrives at Kafka topic "security-events"
T+60ms      Spark Structured Streaming picks up in next micro-batch
T+70ms      Schema validation passes, UUID assigned
T+80ms      Written to Bronze Delta table (events)
T+85ms      THE FORK: Three streaming queries triggered simultaneously
│
├── T+90ms  CEP Engine receives batch
│   T+95ms  Threshold check: 47th auth failure from this IP in 5 minutes
│   T+100ms Pattern matched: "brute_force_active"
│   T+105ms Alert generated (severity: high, confidence: 0.92)
│
├── T+90ms  CET Engine receives batch (PARALLEL)
│   T+95ms  Entity rate computed: 94 events (baseline: 12 ± 4)
│   T+100ms Z-score: 20.5 (extreme anomaly)
│   T+105ms PageRank updated: 0.87 (hub node)
│   T+110ms CET score: 0.94 → entity escalated to "critical watch"
│
└── T+5030ms  Normalization Engine (30s batch, lower priority)
    T+5035ms  Field mapping: source_ip → ocsf.src_endpoint.ip
    T+5040ms  GeoIP enrichment: Russia (ASN: 12345)
    T+5045ms  Threat intel match: IP in known botnet
    T+5050ms  Written to Silver table (normalized_events)

T+110ms     Alert flows to Agent Orchestrator
T+120ms     Triage Agent: classified as "active brute force attack"
T+200ms     SAGE Agent: enriches with ASN, GeoIP, historical IOC matches
T+350ms     NOVA Agent: investigates scope (3 other targets from same IP)
T+500ms     VANGUARD Agent: proposes response (block IP at WAF + notify SOC)
T+510ms     Human-in-the-Loop: auto-approved (policy: block external brute force)
T+520ms     Response executed: IP blocked, case created, playbook triggered

TOTAL: Source event → Automated response: ~520ms
```

---

## Databricks Features Summary

Every component in this architecture maps to a native Databricks capability:

| Platform Component | Databricks Feature |
|-------------------|-------------------|
| Event Ingestion | Spark Structured Streaming + Auto Loader |
| Data Storage | Delta Lake (Bronze/Silver/Gold) |
| CEP Engine | GraphFrames + Structured Streaming |
| CET Engine | GraphFrames (PageRank/Centrality) + MLflow |
| Normalization | Spark SQL + DataFrame transformations |
| ML Models | MLflow Model Registry + Model Serving |
| Feature Engineering | Databricks Feature Store |
| Governance | Unity Catalog (lineage, access control, audit) |
| Scheduling | Databricks Workflows + Jobs |
| Agent Serving | Mosaic AI Model Serving (LLM endpoints) |
| Real-time Scoring | Databricks Serverless SQL + Model Serving |
| Data Sharing | Delta Sharing (multi-tenant) |
| Monitoring | Lakehouse Monitoring + System Tables |
| Compute | Serverless Compute + Photon Engine |
| Secret Management | Databricks Secrets (API keys, credentials) |
| Version Control | Databricks Repos + MLflow Experiments |

---

## Key Design Decisions

1. **Fork Before Normalize**: Security detection (CEP/CET) cannot wait for normalization. Raw events are immediately forked.

2. **CEP on GraphFrames**: Complex attack patterns are graph problems. GraphFrames provides distributed graph computation natively on Spark.

3. **CET as Open Source**: Trend detection and behavioral drift analysis is a novel contribution. Building it open-source enables community collaboration and academic validation.

4. **Priority Sampling over Blanket Retention**: Instead of storing everything (expensive) or sampling blindly (dangerous), we use 12 security-aware rules to guarantee critical event retention.

5. **Delta Lake as Single Source of Truth**: All state (events, alerts, baselines, models) lives in Delta Lake. Time travel enables forensic investigation of any historical state.

6. **Agents over Monoliths**: 31 specialized agents with clear responsibilities versus one monolithic SOAR engine. Each agent can be independently versioned, tested, and scaled.

7. **Edge-First Architecture**: Remote/constrained sites get first-class support with intelligent bandwidth management rather than being afterthoughts.

8. **Industry-Specific Formats**: Rather than forcing all data into one format, we support 150+ native formats and normalize on read, preserving original fidelity.
