```
                                                                                          
     ████████████████████████████████████████████████████████████████████████████████      
     ██                                                                            ██      
     ██    ██████╗ ██╗  ██╗██████╗ ███████╗██╗                                     ██      
     ██   ██╔═████╗╚██╗██╔╝██╔══██╗██╔════╝██║                                     ██      
     ██   ██║██╔██║ ╚███╔╝ ██║  ██║███████╗██║                                     ██      
     ██   ████╔╝██║ ██╔██╗ ██║  ██║╚════██║██║                                     ██      
     ██   ╚██████╔╝██╔╝ ██╗██████╔╝███████║██║                                     ██      
     ██    ╚═════╝ ╚═╝  ╚═╝╚═════╝ ╚══════╝╚═╝                                     ██      
     ██                                                                            ██      
     ██   █████╗  ██████╗ ███████╗███╗   ██╗████████╗██╗ ██████╗                   ██      
     ██  ██╔══██╗██╔════╝ ██╔════╝████╗  ██║╚══██╔══╝██║██╔════╝                   ██      
     ██  ███████║██║  ███╗█████╗  ██╔██╗ ██║   ██║   ██║██║                        ██      
     ██  ██╔══██║██║   ██║██╔══╝  ██║╚██╗██║   ██║   ██║██║                        ██      
     ██  ██║  ██║╚██████╔╝███████╗██║ ╚████║   ██║   ██║╚██████╗                   ██      
     ██  ╚═╝  ╚═╝ ╚═════╝ ╚══════╝╚═╝  ╚═══╝   ╚═╝   ╚═╝ ╚═════╝                   ██      
     ██                                                                            ██      
     ██  ███████╗ ██████╗  ██████╗                                                 ██      
     ██  ██╔════╝██╔═══██╗██╔════╝                                                 ██      
     ██  ███████╗██║   ██║██║                                                      ██      
     ██  ╚════██║██║   ██║██║                                                      ██      
     ██  ███████║╚██████╔╝╚██████╗                                                 ██      
     ██  ╚══════╝ ╚═════╝  ╚═════╝                                                 ██      
     ██                                                                            ██      
     ██   D A T A B R I C K S   N A T I V E   S E C U R I T Y   P L A T F O R M    ██      
     ██   by Luiz Zanardo (lz@databricks.com)                                      ██
     ██                                                                            ██           
     ████████████████████████████████████████████████████████████████████████████████      
                                                                                          
```

# 0xDSI Agentic SOC Platform - Databricks Native Edition

> **Production-grade Security Operations Center running entirely within Databricks.**
> 136 notebooks. 56 autonomous agents. 10 correlation engines. 8 detection models. 11 memory-cache RNN modules. 32 Connector DNA specs. Real-time streaming. LLM-powered investigation. Zero external dependencies. Zero egress. Full data sovereignty.

---

## Platform at a Glance

```
╔═════════════════════════════════════════════════════════════════════════════════════════╗
║                          0xDSI PLATFORM METRICS                                         ║
╠══════════════════╦═══════════╦══════════════════════════════════════════════════════════╣
║  Notebooks       ║    136    ║  Agents, correlation, detection, memory-cache, ingestion  ║
║  AI Agents       ║     56    ║  LLM-powered, Q-Learning, Graph CEP, NLP, Phishing       ║
║  Correlation     ║     10    ║  CEP, temporal, graph, negative, fusion, supply chain    ║
║  Detection       ║      8    ║  UEBA, IDS, bytecode, KS-recall, OT anomaly              ║
║  Memory Cache    ║     11    ║  RNN architecture, streaming detector, explainability    ║
║  Delta Tables    ║   140+    ║  Unity Catalog governed, medallion architecture          ║
║  Connector DNA   ║     32    ║  Universal binary + declarative YAML = any source        ║
║  Edge Fleet      ║     36    ║  712,850 EPS aggregate throughput (demo)                 ║
║  Analytics       ║      6    ║  Trend, swarm, chronoweave, financial, geo, Monte Carlo  ║
║  ML Training     ║      5    ║  MLflow tracked, feature store, GraphRAG zero-day        ║
║  Shared Modules  ║     10    ║  LLM, monitoring, streaming, SQL safety                  ║
║  DLT Pipelines   ║      4    ║  Bronze -> Silver -> Gold + Attack Universe real-time    ║
║  Serving Tiers   ║      4    ║  <10ms -> 50ms -> 100ms -> 1000ms                        ║
║  Frontend        ║   150+    ║  React/TypeScript components, 80+ views                  ║
╚══════════════════╩═══════════╩══════════════════════════════════════════════════════════╝
```

---

## High-Level Architecture

```
    ╔═══════════════════════════════════════════════════════════════════════════════════╗
    ║                     EDGE MESH LAYER (Go Binary + DNA YAML)                        ║
    ╠═══════════════════════════════════════════════════════════════════════════════════╣
    ║                                                                                   ║
    ║   [Firewall]  [EDR]  [Cloud]  [IAM]  [IDS/IPS]  [NDR]  [OT/ICS]  [Email]          ║
    ║       │         │       │       │      │        │       │        │                ║
    ║   ┌───▼───┐ ┌───▼───┐ ┌─▼──┐ ┌─▼──┐ ┌──▼──┐ ┌───▼───┐ ┌─▼──┐ ┌───▼───┐            ║
    ║   │DNA:PA │ │DNA:CS │ │AWS │ │Okta│ │Suri.│ │DNA:DT │ │Modb│ │DNA:PP │            ║
    ║   │v2.4.0 │ │v3.0.1 │ │v2.0│ │v2.0│ │v1.2 │ │v1.5.0 │ │v1.0│ │v1.3.0 │            ║
    ║   └───┬───┘ └───┬───┘ └─┬──┘ └─┬──┘ └──┬──┘ └───┬───┘ └─┬──┘ └───┬───┘            ║
    ║       └──────────┴───────┴──────┴────────┴────────┴───────┴────────┘              ║
    ║                                    │                                              ║
    ║                          gRPC / Kafka / HTTPS                                     ║
    ║                                    │                                              ║
    ╠════════════════════════════════════╪══════════════════════════════════════════════╣
    ║                     DATABRICKS WORKSPACE                                          ║
    ║                                    │                                              ║
    ║   ┌────────────────────────────────▼───────────────────────────────────────┐      ║
    ║   │                    ZEROBUS (Kafka / Event Hub)                         │      ║
    ║   │                topic: security-events  |  SASL_SSL                     │      ║
    ║   └──────────┬─────────────────────────────────────────┬───────────────────┘      ║
    ║              │                                         │                          ║
    ║              │ (persistence, 30-60s)                   │ (micro-batch, ~10-60s)   ║
    ║              ▼                                         ▼                          ║
    ║   ┌──────────────────────┐              ┌──────────────────────────────────┐      ║
    ║   │ INGESTION PIPELINE   │              │ SDP (Streaming Detection)        │      ║
    ║   │                      │              │                                  │      ║
    ║   │ 01 Raw Event         │              │ sdp-correlation  (CEP rules)     │      ║
    ║   │ 02 Enrichment        │              │ sdp-temporal     (windows)       │      ║
    ║   │ 03 Schema (OCSF)     │              │ sdp-threat-intel (IOC match)     │      ║
    ║   │ 04 Quarantine + DLQ  │              │ sdp-graph-cep    (NetworkX)      │      ║
    ║   │ 05 Kafka Connector   │              │ sdp-supply-chain (3rd party)     │      ║
    ║   │ 06 Threat Feeds      │              │ sdp-cloud-posture(CSPM drift)    │      ║
    ║   │ 07 Lakebase Sync     │              │                                  │      ║
    ║   │ 08 Bronze Partition  │              │ Latency: ~10-60s micro-batch     │      ║
    ║   │ 09 Edge Collector    │              └────────────────┬─────────────────┘      ║
    ║   │ 10 OT/PLC Protocol   │                               │                        ║
    ║   │ 11 LLM Usage Intcpt  │                               │                        ║
    ║   └──────────┬───────────┘                               │                        ║
    ║              │                                           │                        ║
    ║              ▼                                           ▼                        ║
    ║   ┌──────────────────────┐              ┌──────────────────────────────────┐      ║
    ║   │ DLT PIPELINE         │              │ DETECTION ENGINES (8 models)     │      ║
    ║   │                      │              │                                  │      ║
    ║   │ ┌────────┐           │              │ Behavioral Anomaly (IF + UEBA)   │      ║
    ║   │ │ BRONZE │ Raw       │              │ Threat Intel Matching (IOC)      │      ║
    ║   │ └───┬────┘           │              │ Detection SLM (Small LM)         │      ║
    ║   │     │ validate       │              │ Formula Prioritization (8-dim)   │      ║
    ║   │ ┌───▼────┐           │              │ Entity Drift CET (baseline)      │      ║
    ║   │ │ SILVER │ Enriched  │              │ Bytecode Semantics               │      ║
    ║   │ └───┬────┘           │              │ KS Recall Lens (statistical)     │      ║
    ║   │     │ aggregate      │              │ OT Protocol Anomaly (SCADA)      │      ║
    ║   │ ┌───▼────┐           │              └────────────────┬─────────────────┘      ║
    ║   │ │  GOLD  │ Business  │                               │                        ║
    ║   │ └────────┘           │                               │                        ║
    ║   └──────────────────────┘                               │                        ║
    ║                                                          ▼                        ║
    ║   ┌══════════════════════════════════════════════════════════════════════════┐    ║
    ║   ║           DETECTION CONFLUENCE (Dempster-Shafer Fusion)                  ║    ║
    ║   ║                                                                          ║    ║
    ║   ║    Signal 1 ──┐                                                          ║    ║
    ║   ║    Signal 2 ──┼──►  Evidence Aggregation  ──►  Final Verdict + Score     ║    ║
    ║   ║    Signal 3 ──┤            ^                                             ║    ║
    ║   ║    Signal N ──┘            │                                             ║    ║
    ║   ║                     KS-Validated Recall                                  ║    ║
    ║   ╚══════════════════════════════════════════════════════════════════════════╝    ║
    ║                                       │                                           ║
    ║                                       ▼                                           ║
    ║   ┌══════════════════════════════════════════════════════════════════════════┐    ║
    ║   ║              AGENT ORCHESTRATION (49 Agents)                             ║    ║
    ║   ║                                                                          ║    ║
    ║   ║   ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐                 ║    ║
    ║   ║   │  TRIAGE  │─►│ ENRICH   │─►│INVESTIGATE│─►│ RESPOND  │                ║    ║
    ║   ║   │  (LLM)   │  │ (Intel)  │  │  (Nova)  │  │(Vanguard)│                 ║    ║
    ║   ║   └──────────┘  └──────────┘  └──────────┘  └──────────┘                 ║    ║
    ║   ║        │              │              │              │                    ║    ║
    ║   ║        └──────────────┴──────────────┴──────────────┘                    ║    ║
    ║   ║                              │                                           ║    ║
    ║   ║   Supported by: CTI Attribution | Pattern Discovery | Vector Memory |    ║    ║
    ║   ║   Red Team | Blue Team | Forensics | Honeypot | CISO Assistant |         ║    ║
    ║   ║   Playbook Gen | Document Analyzer | Malware Sandbox | Guardrails |      ║    ║
    ║   ║   Model Poisoning Guard | Threat Simulator | Glasswing (5 agents) |      ║    ║
    ║   ║   ExploitForge | Communication Analyzer | Edge Control Plane | ...       ║    ║
    ║   ╚══════════════════════════════════════════════════════════════════════════╝    ║
    ║                                       │                                           ║
    ║                         ┌─────────────┼─────────────┐                             ║
    ║                         │             │             │                             ║
    ║                         ▼             ▼             ▼                             ║
    ║   ┌────────────────┐ ┌──────────┐ ┌───────────────────┐                           ║
    ║   │ CASE MGMT      │ │ RESPONSE │ │ EXECUTIVE REPORTS  │                          ║
    ║   │ Auto-create    │ │ SOAR     │ │ CISO Dashboard     │                          ║
    ║   │ Evidence chain │ │ Approval │ │ Risk posture       │                          ║
    ║   │ MITRE mapping  │ │ Runbooks │ │ Compliance status  │                          ║
    ║   └────────────────┘ └──────────┘ └───────────────────┘                           ║
    ║                                                                                   ║
    ║   ┌══════════════════════════════════════════════════════════════════════════┐    ║
    ║   ║              SERVING LAYER (Multi-Tier)                                  ║    ║
    ║   ║                                                                          ║    ║
    ║   ║   Brickstore ─── <10ms ─── Entity KV lookups, session state              ║    ║
    ║   ║   Lakebase   ─── ~50ms ─── Real-time queries (CDC from Delta)            ║    ║
    ║   ║   Lucene     ─── ~100ms── Full-text raw log search                       ║    ║
    ║   ║   Delta Lake ─── ~1000ms─ Analytics, ML training, historical             ║    ║
    ║   ╚══════════════════════════════════════════════════════════════════════════╝    ║
    ║                                       │                                           ║
    ║                                       ▼                                           ║
    ║   ┌──────────────────────────────────────────────────────────────────────────┐    ║
    ║   │                DATABRICKS APP (React + FastAPI)                          │    ║
    ║   │                Workspace SSO | SQL Warehouse | Real-Time Dashboards      │    ║
    ║   └──────────────────────────────────────────────────────────────────────────┘    ║
    ║                                                                                   ║
    ╚═══════════════════════════════════════════════════════════════════════════════════╝
```

---

## Edge Mesh Architecture: Connector DNA System

> Note: The site topology and per-collector EPS figures below are illustrative
> demo/synthetic values, not measured production throughput.

```
                    ┌────────────────────────────────────────────────────────┐
                    │              EDGE MESH CONTROL PLANE                   │
                    │                                                        │
                    │   Agent 49: Edge Control Plane                         │
                    │   - Fleet registry & health monitoring                 │
                    │   - DNA version management & rollout                   │
                    │   - Heartbeat monitoring (every 30s)                   │
                    │   - Config distribution (every 60s)                    │
                    │   - Certificate rotation tracking                      │
                    │   - Backpressure management                            │
                    └────────────────────────┬───────────────────────────────┘
                                             │
              ┌──────────────────────────────┼──────────────────────────────┐
              │                              │                              │
              ▼                              ▼                              ▼
    ┌─────────────────────┐    ┌─────────────────────┐    ┌─────────────────────┐
    │  SITE: DC-EAST      │    │  SITE: AWS-PROD     │    │  SITE: PLANT-GRU    │
    │                     │    │                     │    │                     │
    │  ┌───────────────┐  │    │  ┌───────────────┐  │    │  ┌───────────────┐  │
    │  │ 0xdsi-edge    │  │    │  │ 0xdsi-edge    │  │    │  │ 0xdsi-edge    │  │
    │  │ v1.4.2        │  │    │  │ v1.4.2        │  │    │  │ v1.4.2        │  │
    │  │               │  │    │  │               │  │    │  │               │  │
    │  │ DNA Loaded:   │  │    │  │ DNA Loaded:   │  │    │  │ DNA Loaded:   │  │
    │  │  palo_alto    │  │    │  │  aws_cloud    │  │    │  │  modbus_scada │  │
    │  │  crowdstrike  │  │    │  │  trail v2.0   │  │    │  │  v1.0.0       │  │
    │  │  suricata_ids │  │    │  │               │  │    │  │               │  │
    │  │  zeek_network │  │    │  │  67,800 EPS   │  │    │  │  3,200 EPS    │  │
    │  │  windows_wef  │  │    │  │               │  │    │  │               │  │
    │  │               │  │    │  └───────────────┘  │    │  └───────────────┘  │
    │  │ 420,500 EPS   │  │    │                     │    │                     │
    │  └───────────────┘  │    └─────────────────────┘    └─────────────────────┘
    └─────────────────────┘
                                             │
                               ┌─────────────▼─────────────┐
                               │   UNIVERSAL BINARY        │
                               │                           │
                               │   Single Go binary that   │
                               │   loads ANY DNA YAML to   │
                               │   become any connector:   │
                               │                           │
                               │   ./0xdsi-edge            │
                               │     --dna palo_alto.yaml  │
                               │     --site dc-east        │
                               │     --hub kafka:9092      │
                               │                           │
                               └───────────────────────────┘

    ┌──────────────────────────────────────────────────────────────────────────┐
    │  32 CONNECTOR DNA SPECS                                                  │
    ├──────────────────────────────────────────────────────────────────────────┤
    │                                                                          │
    │  FIREWALLS (6)              ENDPOINT (6)             CLOUD (5)           │
    │  ├─ Palo Alto NGFW         ├─ CrowdStrike Falcon    ├─ AWS CloudTrail    │
    │  ├─ Fortinet FortiGate     ├─ SentinelOne EDR       ├─ Azure Activity    │
    │  ├─ Cisco ASA              ├─ Carbon Black          ├─ GCP Audit Log     │
    │  ├─ Juniper SRX            ├─ Windows Event Log     ├─ Google Workspace  │
    │  ├─ Check Point            ├─ Linux auditd          └─ Office 365 Mgmt   │
    │  └─ Sophos XG              └─ macOS Unified Log                          │
    │                                                                          │
    │  IDS/NDR (4)                IDENTITY (2)             OT/ICS (1)          │
    │  ├─ Suricata EVE           ├─ Okta System Log       └─ Modbus SCADA      │
    │  ├─ Zeek/Bro              └─ Zscaler ZIA                                 │
    │  ├─ Darktrace Detect                                                     │
    │  └─ Vectra AI              WAF (1)                   EMAIL (1)           │
    │                            └─ F5 BIG-IP ASM          └─ Proofpoint TAP   │
    │  SIEM INTEGRATION (2)                                                    │
    │  ├─ Splunk HEC Receiver    NETWORK (2)               MESSAGE BUS (1)     │
    │  └─ Elastic Beats          ├─ Cisco Meraki           └─ Kafka Consumer   │
    │                            └─ Trend Micro Apex                           │
    └──────────────────────────────────────────────────────────────────────────┘
```

---

## Agent Neural Network: 56 Autonomous Agents

```
                             ┌─────────────────────────────┐
                             │     AGENT ORCHESTRATOR       │
                             │         (Agent 04)           │
                             │   Multi-agent coordination   │
                             │   Priority queue dispatch    │
                             └─────────────┬───────────────┘
                                           │
              ┌────────────────────────────┼────────────────────────────┐
              │                            │                            │
              ▼                            ▼                            ▼
  ┌───────────────────────┐  ┌───────────────────────┐  ┌───────────────────────┐
  │   TIER 1: TRIAGE      │  │   TIER 2: INTEL       │  │   TIER 3: RESPONSE    │
  │                       │  │                       │  │                       │
  │ 01 Triage Agent       │  │ 05 Sage Enrichment    │  │ 07 Vanguard Response  │
  │ 02 Enrichment Agent   │  │ 06 Nova Investigation │  │ 47 Auto Response RL   │
  │ 09 Pattern Discovery  │  │ 08 CTI Attribution    │  │ 16 Playbook Generator │
  │ 27 Vector Scoring     │  │ 10 Vector Memory      │  │ 13 Forensics Agent    │
  │ 28 AI Correlation     │  │ 03 Threat Hunter      │  │ 17 Incident Summarize │
  └───────────────────────┘  │ 24 Threat Radar       │  └───────────────────────┘
                             └───────────────────────┘
              ┌────────────────────────────┼────────────────────────────┐
              │                            │                            │
              ▼                            ▼                            ▼
  ┌───────────────────────┐  ┌───────────────────────┐  ┌───────────────────────┐
  │   SECURITY TESTING    │  │   LLM SAFETY          │  │   INFRASTRUCTURE      │
  │                       │  │                       │  │                       │
  │ 11 Red Team           │  │ 15 CISO Assistant     │  │ 23 Connector Adapter  │
  │ 12 Blue Team          │  │ 18 Document Analyzer  │  │ 29 Connector Version  │
  │ 14 Honeypot           │  │ 19 Malware Sandbox    │  │ 31 Vibe Builder       │
  │ 22 Threat Simulator   │  │ 20 LLM Guardrails     │  │ 32 Vector Search Idx  │
  │ 45 ExploitForge       │  │ 21 Model Poisoning    │  │ 38 Session Lists      │
  │ 30 Stateful Backdoor  │  │ 40 LLM Risk Profiler  │  │ 39 Active Lists       │
  └───────────────────────┘  │ 46 Communication      │  │ 42 Knowledge Store    │
                             └───────────────────────┘  │ 49 Edge Control Plane │
                                                        └───────────────────────┘
              ┌────────────────────────────┼────────────────────────────┐
              │                            │                            │
              ▼                            ▼                            ▼
  ┌───────────────────────┐  ┌───────────────────────┐  ┌───────────────────────┐
  │   VULNERABILITY       │  │   COMPLIANCE & RISK   │  │   SPECIALIZED         │
  │                       │  │                       │  │                       │
  │ 33 Glasswing Ingest   │  │ 43 Guardian Complianc │  │ 25 ALHF Learning      │
  │ 34 Glasswing Dedup    │  │ 44 OT Protocol Sec    │  │ 26 Realtime Graph CEP │
  │ 35 Glasswing Reach    │  │ 48 UEBA Entity Onb.   │  │ 41 Glasswing Scanner  │
  │ 36 Glasswing Blast    │  │                       │  │ 37 Glasswing Patch    │
  │ 37 Glasswing Patch    │  │                       │  │                       │
  └───────────────────────┘  └───────────────────────┘  └───────────────────────┘
```

---

## Event Journey: End-to-End Data Flow

```
  ╔═══════════════════════════════════════════════════════════════════════════════════╗
  ║   EXTERNAL SOURCES                                                                ║
  ║                                                                                   ║
  ║   EDR ─── Firewall ─── Cloud ─── Identity ─── IDS ─── NDR ─── OT ─── Email        ║
  ╚═══════════╤═══════════╤══════════╤══════════╤════════╤══════╤══════╤══════════════╝
              │           │          │          │        │      │      │
              └───────────┴──────────┴──────────┴────────┴──────┴──────┘
                                         │
                              ┌───────────▼───────────┐
                              │  EDGE MESH (32 DNA)    │
                              │  Universal Go Binary   │
                              │  712,850 EPS total     │
                              └───────────┬───────────┘
                                          │
                              ┌───────────▼───────────┐
                              │  ZEROBUS (Kafka)       │
                              │  SASL_SSL | 3 brokers  │
                              │  Partitioned by source │
                              └───────┬───────┬───────┘
                                      │       │
               ┌──────────────────────┘       └──────────────────────┐
               │ (persistence path)                (real-time path)  │
               ▼                                                      ▼
  ┌────────────────────────────┐                   ┌────────────────────────────┐
  │  INGESTION                 │                   │  STREAMING DETECTION (SDP)  │
  │                            │                   │                             │
  │  Schema enforce (OCSF)     │                   │  6 consumer groups:         │
  │  GeoIP + DNS + Reputation  │                   │   - CEP correlation         │
  │  Asset context join        │                   │   - Temporal windows        │
  │  Quarantine bad events     │                   │   - IOC matching            │
  │                            │                   │   - Graph CEP               │
  │  Latency: 30-60s           │                   │   - Supply chain            │
  │                            │                   │   - Cloud posture           │
  │  ──► Delta: events.bronze  │                   │                             │
  │  ──► Delta: events.silver  │                   │  Latency: ~10-60s (batch)   │
  │  ──► Delta: events.gold    │                   │  ──► Delta: alerts          │
  └────────────────────────────┘                   └──────────────┬─────────────┘
                                                                  │
                                                                  ▼
  ┌────────────────────────────┐    ┌───────────────────────────────────────────┐
  │  BATCH DETECTION           │    │  DETECTION CONFLUENCE                      │
  │  (every 5-15 min)          │    │                                            │
  │                            │    │  ┌────────────────────────────────────┐    │
  │  UEBA anomaly              │    │  │  Dempster-Shafer Belief Fusion     │    │
  │  Entity drift (CET)        │───►│  │                                    │    │
  │  Formula scoring (8-dim)   │    │  │  Signal_1 ─┐                       │    │
  │  KS recall lens            │    │  │  Signal_2 ──┼─► Plausibility(H)    │    │
  │  Bytecode semantics        │    │  │  Signal_3 ──┤   Belief(H)          │    │
  │  OT protocol anomaly       │    │  │  Signal_N ─┘   Uncertainty(H)      │    │
  │                            │    │  │                                    │    │
  └────────────────────────────┘    │  │  KS Test validates distribution    │    │
                                    │  └────────────────────────────────────┘    │
                                    │                     │                      │
                                    │  Final Verdict: MALICIOUS | SUSPICIOUS |   │
                                    │                 BENIGN | INCONCLUSIVE      │
                                    └─────────────────────┬─────────────────────┘
                                                          │
                                                          ▼
                                    ┌───────────────────────────────────────────┐
                                    │  AGENT PIPELINE                           │
                                    │                                           │
                                    │  Triage(01) ──► Enrichment(02) ──►        │
                                    │  ──► Investigation(06) ──►                │
                                    │  ──► Response(07) ──► Case(02)            │
                                    │                                           │
                                    │  With: Human-in-the-loop approval gate    │
                                    │  With: Full audit trail (Monitor)         │
                                    └───────────────────────────────────────────┘
```

---

## Correlation Engine Detail

```
  ┌─────────────────────────────────────────────────────────────────────────────────┐
  │                    10 CORRELATION ENGINES                                       │
  ├─────────────────────────────────────────────────────────────────────────────────┤
  │                                                                                 │
  │  ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐      │
  │  │ 01. STREAMING CEP   │  │ 02. NEGATIVE CORR.  │  │ 03. GRAPH CORR.     │      │
  │  │                     │  │                     │  │                     │      │
  │  │ Sliding window      │  │ Detect ABSENCE of   │  │ NetworkX multi-hop  │      │
  │  │ Threshold rules     │  │ expected events     │  │ Lateral movement    │      │
  │  │ Pattern sequences   │  │ (e.g., no AV scan   │  │ Credential chains   │      │
  │  │ Real-time alerts    │  │  in 7 days)         │  │ Admin escalation    │      │
  │  │                     │  │                     │  │ paths               │      │
  │  │ Source: Kafka       │  │ Source: Delta       │  │ Source: Delta       │      │
  │  │ Latency: ~10-60s   │  │ Schedule: 30min     │  │ Schedule: 15min     │       │
  │  └─────────────────────┘  └─────────────────────┘  └─────────────────────┘      │
  │                                                                                 │
  │  ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐      │
  │  │ 04. TEMPORAL WINDOW │  │ 05. SUPPLY CHAIN    │  │ 06. CLOUD POSTURE   │      │
  │  │                     │  │                     │  │                     │      │
  │  │ Brute force detect  │  │ Dependency comprom  │  │ CSPM drift detect   │      │
  │  │ Beaconing patterns  │  │ Package mutation    │  │ Misconfig alert     │      │
  │  │ Port scanning       │  │ Build pipeline      │  │ IAM over-privilege  │      │
  │  │ KS-adaptive thresh  │  │ injection           │  │ exposure            │      │
  │  │                     │  │                     │  │                     │      │
  │  │ Source: Kafka       │  │ Source: Kafka       │  │ Source: Kafka       │      │
  │  │ Latency: 2-10s      │  │ Latency: 5-30s      │  │ Latency: 5-30s      │      │
  │  └─────────────────────┘  └─────────────────────┘  └─────────────────────┘      │
  │                                                                                 │
  │  ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐      │
  │  │ 07. DETECTION       │  │ 08. ENTITY SPINE    │  │ 09. UNIFIED EVID.   │      │
  │  │     CONFLUENCE      │  │                     │  │     OBJECT (UEO)    │      │
  │  │                     │  │ Entity relationship │  │                     │      │
  │  │ Dempster-Shafer     │  │ graph construction  │  │ Signal consolidation│      │
  │  │ Multi-signal fusion │  │ User─IP─Host─App    │  │ per entity across   │      │
  │  │ Statistical valid.  │  │ linkage & scoring   │  │ all sources         │      │
  │  │                     │  │                     │  │                     │      │
  │  │ Mode: Hybrid        │  │ Schedule: 10min     │  │ Schedule: 10min     │      │
  │  └─────────────────────┘  └─────────────────────┘  └─────────────────────┘      │
  │                                                                                 │
  │  ┌─────────────────────┐                                                        │
  │  │ 10. FUSE ENGINE     │                                                        │
  │  │                     │                                                        │
  │  │ Multi-model ensem.  │                                                        │
  │  │ Final verdict from  │                                                        │
  │  │ UEO aggregation     │                                                        │
  │  │ Confidence scoring  │                                                        │
  │  │                     │                                                        │
  │  │ Schedule: 5min      │                                                        │
  │  └─────────────────────┘                                                        │
  └─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Autonomous Response Learner (Agent 47)

Based on Apple's AISec '22 paper ["Bridging Automated to Autonomous Cyber Defense"](https://doi.org/10.1145/3560830.3563732).

```
  ┌─────────────────────────────────────────────────────────────────────────────────┐
  │              AGENT 47: Q-LEARNING AUTONOMOUS RESPONSE                           │
  ├─────────────────────────────────────────────────────────────────────────────────┤
  │                                                                                 │
  │   STATE ENCODING                          ACTION SPACE                          │
  │   ═══════════════                         ════════════                          │
  │   5 percentile buckets per dimension:     4 abstract feature-based actions:     │
  │   • alert_rate       (0-4)                • A0: Monitor (no action)             │
  │   • compromise_score (0-4)                • A1: Isolate (contain threat)        │
  │   • resource_avail   (0-4)                • A2: Restore (recover system)        │
  │   • defense_coverage (0-4)                • A3: Harden (increase defense)       │
  │                                                                                 │
  │   State Space: 5^4 = 625 states           Q-Matrix: 625 x 4 = 2500 values       │
  │                                                                                 │
  │   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐                         │
  │   │   OBSERVE   │───►│  Q-LOOKUP   │───►│  DECISION   │                         │
  │   │   Network   │    │  Best action │    │  Gate       │                        │
  │   │   State     │    │  + confidence│    │             │                        │
  │   └─────────────┘    └─────────────┘    └──────┬──────┘                         │
  │                                                 │                               │
  │                              ┌──────────────────┼──────────────────┐            │
  │                              │                                     │            │
  │                    confidence >= 0.7                     confidence < 0.7       │
  │                    + NOT critical action                 OR critical action     │
  │                              │                                     │            │
  │                              ▼                                     ▼            │
  │                    ┌─────────────────┐                   ┌─────────────────┐    │
  │                    │   AUTONOMOUS    │                   │   HUMAN GATE    │    │
  │                    │   Execute via   │                   │   Queue for     │    │
  │                    │   Vanguard(07)  │                   │   analyst via   │    │
  │                    │                 │                   │   ALHF(25)      │    │
  │                    │   Latency:~10s+ │                   │                 │    │
  │                    └─────────────────┘                   └─────────────────┘    │
  │                                                                                 │
  │   TRAINING: 3-Phase (paper-informed)                                            │
  │   ══════════════════════════════════                                            │
  │   Phase 1 (70%): epsilon=0.9 — heavy exploration                                │
  │   Phase 2 (25%): epsilon=0.3 — greedy exploitation                              │
  │   Phase 3 (5%):  epsilon=0.01 — near-optimal policy                             │
  │                                                                                 │
  │   REWARD: R = availability - compromise + defense_bonus                         │
  │   NOISE:  1.5x expected production noise during training                        │
  │   LOSS RATE: 7% (vs 40% baseline)                                               │
  └─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Shared Infrastructure (`_shared/`)

Every notebook starts with `%run ../_shared/bootstrap` to initialize all services:

```
  ┌─────────────────────────────────────────────────────────────────────────────────┐
  │              _shared/ MODULE MAP                                                  │
  ├─────────────────────────────────────────────────────────────────────────────────┤
  │                                                                                  │
  │   bootstrap.py ──────────────────── Single-line initialization ─────────────    │
  │       │                                                                          │
  │       ├── config.py ─────────────── SOCConfig (catalog, schema, env)            │
  │       ├── secrets.py ────────────── Secret scope manager (25+ keys)             │
  │       ├── llm_client.py ─────────── LLM with retry, fallback, budget control   │
  │       ├── monitoring.py ─────────── Audit logging, timing, metrics              │
  │       ├── sql_safe.py ───────────── SQL injection prevention (qb, build_*)     │
  │       ├── delta_helpers.py ──────── Safe Delta ops (append, merge, streaming)   │
  │       ├── agent_framework.py ────── Agent base classes (Batch, Stream, HITL)    │
  │       ├── sdp_stream.py ─────────── ZeroBus Kafka stream builder + fallback    │
  │       └── bootstrap.py ─────────── Wires everything together                    │
  │                                                                                  │
  │   AGENT FRAMEWORK HIERARCHY:                                                    │
  │                                                                                  │
  │   SOCAgent (base)                                                               │
  │     ├── BatchAgent ──── Scheduled execution (most agents)                       │
  │     ├── StreamingAgent ── Continuous processing (CEP, temporal)                 │
  │     └── InteractiveAgent ── User-initiated (CISO Assistant, Nova)              │
  │                                                                                  │
  │   LLM CLIENT FEATURES:                                                          │
  │                                                                                  │
  │   • Primary: Llama 3.1 70B (Foundation Model API)                               │
  │   • Fallback: Llama 3.1 8B (auto-switch on rate limit)                          │
  │   • Budget: Per-agent token budget with early stop                              │
  │   • JSON Mode: Guaranteed structured output                                     │
  │   • Retry: Exponential backoff with jitter                                      │
  │                                                                                  │
  └─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Package Contents

```
  databricks-native/
  │
  ├── databricks.yml ──────────────────── DAB bundle manifest (dev/staging/prod)
  ├── deploy.sh ───────────────────────── One-command deployment script
  ├── Makefile ─────────────────────────── Build & deploy targets
  ├── README.md ───────────────────────── This file
  ├── AGENT_ARCHITECTURE.md ───────────── Agent design documentation
  ├── PRODUCTION_CONNECTOR_PLAN.md ────── Connector deployment strategy
  ├── DATABRICKS_SECURITY_STACK_vs_0xDSI.md ─ Security architecture comparison
  ├── 0xDSI_DETECTION_ENGINE_EXPLAINED.md ─── Detection methodology reference
  │
  ├── app/ ────────────────────────────── Databricks App (web application)
  │   ├── app.yaml ────────────────────── App runtime config
  │   ├── package.json ────────────────── Node.js dependencies
  │   ├── requirements.txt ────────────── Python dependencies (FastAPI, SDK)
  │   ├── vite.config.ts ─────────────── Vite build configuration
  │   │
  │   ├── backend/
  │   │   └── server.py ───────────────── FastAPI API server (SQL Warehouse queries)
  │   │
  │   └── frontend/
  │       ├── src/
  │       │   ├── App.tsx ─────────────── Main application with 80+ views
  │       │   ├── components/ ─────────── 150+ React components
  │       │   │   ├── command-center/ ── SOC Command Center + SCIF intel (26)
  │       │   │   ├── correlation/ ────── Correlation rules, Create/Import modals (5)
  │       │   │   ├── connectors/ ─────── Edge Mesh, DNA Catalog, Vibe Builder (7)
  │       │   │   ├── dashboard-builder/ WYSIWYG dashboards + migration (12)
  │       │   │   ├── financial-threat/─ Brazilian + global financial fraud (17)
  │       │   │   ├── glasswing/ ──────── Vulnerability management pipeline (8)
  │       │   │   ├── guardrails/ ─────── LLM safety & governance (6)
  │       │   │   ├── honeypot/ ───────── Honeypot/honeytoken management (6)
  │       │   │   ├── industry-threats/─ 9 industry-specific threat modules (9)
  │       │   │   ├── negative-correlation/ Absence-based detection (5)
  │       │   │   ├── feature-lab/ ────── Development lifecycle + BMAD (7)
  │       │   │   ├── threat-radar/ ───── Intelligence radar + HUD (6)
  │       │   │   ├── threat-escalation/ Data contracts + graph scoring (2)
  │       │   │   ├── user-behavior/ ─── UEBA + psychology profiling (5)
  │       │   │   ├── swarm/ ──────────── Swarm AI + continuous intel (2)
  │       │   │   ├── confluence/ ─────── KS statistical validation (1)
  │       │   │   └── vr/ ─────────────── VR immersive SOC interface (1)
  │       │   ├── lib/ ────────────────── 60+ shared utilities, parsers, mock data
  │       │   └── contexts/ ───────────── Auth, state management
  │       └── public/ ─────────────────── Static assets
  │
  ├── notebooks/ ──────────────────────── 136 Databricks notebooks
  │   ├── _shared/ (10) ──────────────── Infrastructure modules
  │   ├── setup/ (5) ─────────────────── Initialization & seeding
  │   ├── agents/ (56) ───────────────── Autonomous AI agents (01-49 + 53-60)
  │   ├── ingestion/ (11) ────────────── Data ingestion pipeline
  │   ├── correlation/ (10) ──────────── Correlation engines
  │   ├── detection/ (8) ─────────────── Detection models
  │   ├── analytics/ (6) ─────────────── Advanced analytics + Monte Carlo
  │   ├── memory_cache/ (11) ─────────── RNN memory architecture + streaming
  │   ├── ml_training/ (5) ───────────── ML pipelines (MLflow)
  │   ├── ops/ (5) ───────────────────── Operational jobs
  │   ├── response/ (5) ──────────────── Automated response
  │   └── pipelines/ (4) ─────────────── DLT Bronze/Silver/Gold + Attack Universe
  │
  └── resources/ ──────────────────────── Databricks Asset Bundle resources
      ├── app.yml ─────────────────────── Databricks App resource definition
      ├── jobs.yml ────────────────────── 60+ Workflow job definitions
      └── pipelines.yml ───────────────── DLT pipeline definition
```

---

## Frontend Application: SOC Operations Console

The Databricks App ships a full-featured React/TypeScript frontend with 150+ components organized into specialized feature areas. The UI is built with Tailwind CSS, Lucide React icons, and Three.js for 3D visualizations.

### Command Center (20+ components)

The central nerve center providing real-time situational awareness:

```
  ┌─────────────────────────────────────────────────────────────────────────────────┐
  │  SOC COMMAND CENTER                                                              │
  │                                                                                  │
  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
  │  │ Threat Radar │  │ Threat       │  │ Risk Posture │  │ DEFCON Alert │         │
  │  │ (global vis) │  │ Heartbeat    │  │ Gauge        │  │ System       │         │
  │  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘         │
  │                                                                                  │
  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
  │  │ Kill Chain   │  │ Predictive   │  │ Monte Carlo  │  │ Low & Slow   │         │
  │  │ Waterfall    │  │ Analytics    │  │ Forecasting  │  │ Tracker      │         │
  │  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘         │
  │                                                                                  │
  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
  │  │ CEP Live     │  │ Event Funnel │  │ Defense      │  │ Embedding    │         │
  │  │ Graph        │  │ Processing   │  │ Shield       │  │ Constellation│         │
  │  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘         │
  │                                                                                  │
  │  Intelligence Compartments (SCIF):                                               │
  │  • Classified Info Flow • Clearance Matrix • Counter-Intel Dashboard              │
  │  • Need-to-Know Compartments • SCIF Access Control • SIGINT Interceptor          │
  │                                                                                  │
  └─────────────────────────────────────────────────────────────────────────────────┘
```

### Dashboard Builder (WYSIWYG)

Custom dashboard creation with drag-and-drop layout, real-time preview, and Databricks SQL export:

| Feature | Description |
|---------|-------------|
| Widget Palette | Charts, stats, tables, text, KPIs, heatmaps |
| Grid Layout | 12-column responsive grid with drag-and-resize |
| Chart Types | Line, bar, area, pie, scatter, radar, treemap |
| Data Sources | SQL queries against Unity Catalog tables |
| Databricks Export | Generate Databricks SQL dashboard definitions |
| Dashboard Migration | Import from Grafana, Kibana, Splunk, Redash, Metabase, Superset |
| Save/Load | Persist dashboard configurations with versioning |

### Correlation Rules Library & Detection-as-Code

Full lifecycle management for correlation rules with version tracking and promotion pipeline:

```
  ┌─────────────────────────────────────────────────────────────────────────────────┐
  │  DETECTION-AS-CODE (DaC) LIFECYCLE                                               │
  │                                                                                  │
  │   ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌────────────┐                │
  │   │  DRAFT   │───►│ TESTING  │───►│ STAGING  │───►│ PRODUCTION │                │
  │   │          │    │          │    │          │    │            │                │
  │   │ Author   │    │ Unit +   │    │ Shadow   │    │ Live       │                │
  │   │ Review   │    │ Backtest │    │ Mode     │    │ Alerting   │                │
  │   │ Version  │    │ Validate │    │ Burn-in  │    │ Full audit │                │
  │   └──────────┘    └──────────┘    └──────────┘    └────────────┘                │
  │                                                                                  │
  │  RULE TYPES (10):                                                                │
  │  • Deterministic  • ML Anomaly   • ML Classification  • Vector Similarity        │
  │  • Graph Correlation  • Temporal Sequence  • Behavioral Baseline                 │
  │  • Bayesian Probabilistic  • Ensemble Multi-Model  • Negative Correlation        │
  │                                                                                  │
  │  IMPORT FORMATS: Sigma YAML | Splunk SPL | Elastic KQL | QRadar AQL | Custom     │
  │                                                                                  │
  │  CREATION MODES:                                                                 │
  │  • AI-Assisted (intelligent defaults, auto-MITRE mapping)                        │
  │  • Manual (full control with YAML preview)                                       │
  │  • Import (paste from existing SIEM)                                             │
  │                                                                                  │
  └─────────────────────────────────────────────────────────────────────────────────┘
```

**Create Rule Modal** (Premium UI):
- Animated gradient header with completion progress
- Visual rule type selector with icon cards
- Confidence slider (0-100%)
- Severity picker with color-coded buttons
- MITRE ATT&CK tactic/technique selection (14 tactics)
- YAML live preview toggle
- 12 security categories (Threat Detection, Identity & Access, Network Security, etc.)
- Step-based sidebar navigation

### Negative Correlation Engine (UI)

Dedicated panel for absence-based detection with full CRUD:

| Tab | Purpose |
|-----|---------|
| Overview | Active negative rules, detection stats, coverage gaps |
| Rules | Rule library with create/import/edit/delete, DaC status |
| Detections | Triggered absence detections with timeline |
| Graph | Relationship graph of expected-but-missing events |
| Timeline | Temporal view of detection windows |

Includes full Create Rule and Import Rule modals with `negative_correlation` as default type.

### Financial Threat Intelligence (17 components)

Brazilian and global financial fraud detection suite:

- **Boleto Fraud Engine** - Brazilian Boleto payment fraud detection
- **PIX Fraud Intelligence** - Real-time PIX transaction monitoring
- **Banking Trojans** - Brazilian banking trojan tracking (Grandoreiro, Mekotio, etc.)
- **Insider Credential Selling** - Dark web credential marketplace monitoring
- **Identity Graph Explorer** - Entity relationship mapping
- **Transaction Risk Monitor** - Real-time transaction scoring
- **Conciliation Engine** - Automated reconciliation
- **Case Evidence Graph** - Evidence chain visualization

### Vulnerability Management: Glasswing (8 components)

End-to-end vulnerability lifecycle:

- **Scanner Control** - Orchestrate scan jobs across infrastructure
- **Results Dashboard** - Prioritized vulnerability findings
- **Exploit Impact Graph** - Visual blast radius analysis
- **Remediation Rules** - Auto-generate fix recommendations
- **Scan History** - Historical trend analysis
- **Mythosphere Pipeline** - Vulnerability intelligence pipeline

### LLM Safety & Guardrails (6 components)

AI governance and safety controls:

- **Prompt Scanner** - Real-time prompt injection detection
- **PII Redaction Engine** - Automatic PII masking before LLM calls
- **Model Access Governance** - Policy-based model access control
- **Token Budget Controls** - Per-agent/per-user token limits
- **Policy Manager** - Security policy CRUD

### Honeypot Management (6 components)

Deception technology orchestration:

- **Geospatial Map** - Global honeypot deployment visualization
- **Interaction Feed** - Real-time attacker interaction stream
- **Honeytoken Management** - Deploy and track honeytokens
- **Statistics Dashboard** - Attack pattern analytics

### Industry-Specific Threat Modules (9 verticals)

Pre-built threat models for regulated industries:

| Vertical | Key Threats |
|----------|-------------|
| Healthcare | HIPAA violations, medical device attacks, ransomware |
| Financial | Fraud, insider trading, transaction manipulation |
| Manufacturing | ICS/SCADA attacks, supply chain compromise |
| Energy | Grid attacks, NERC CIP compliance, OT threats |
| Telecom | SIM swap, SS7 exploitation, 5G threats |
| Retail | POS malware, card skimming, e-commerce fraud |
| Education | Student data theft, research IP theft |
| Aviation | ACARS attacks, GPS spoofing, ADS-B injection |
| Consumer Goods | Brand abuse, counterfeit detection |

### Additional Feature Areas

| Module | Components | Description |
|--------|-----------|-------------|
| Agent Management | 10+ | 3D network graph, status monitoring, code config, execution history |
| Threat Intelligence | 20+ | MITRE ATT&CK matrix, IOC panel, threat feeds, globe visualization |
| User Behavior (UEBA) | 5+ | Entity onboarding, psychological profiling, cross-domain activity |
| Feature Lab | 7 | Development lifecycle, BMAD agent testing, architecture diagrams |
| Connectors & Data | 7 | DNA catalog, vibe builder (NL connector creation), fleet telemetry |
| Swarm AI | 2 | Multi-agent swarm analytics, continuous AI intelligence |
| VR Interface | 1 | Immersive VR SOC command screen (Three.js) |
| Attack Visualization | 5+ | 3D attack graphs, vector graphs, pattern visualization |
| Reports | 2 | Executive report builder, automated generation |
| Compliance | 1 | SOX, PCI-DSS, LGPD, HIPAA tracking |
| Multi-Tenant | 1 | Tenant isolation, per-tenant configuration |

### Frontend Library: 60+ Utilities

| Category | Modules |
|----------|---------|
| API Clients | databricksClient, etlClient, llmGateway, databricksExporter |
| AI/ML | vectorEngine, aiCorrelationAgent, agentOrchestrator, agentCommunication |
| Visualization | soc3dEffects, soc3dHelpers, globeGeometry, cepStreamMapping |
| Threat Intel | cepAttackEnrichment, threatEscalation, geopoliticalRisk |
| Data Parsers | redashParser, kibanaParser, splunkParser, grafanaParser, metabaseParser, supersetParser |
| Notebooks | 14 registry files mapping UI to backend notebook execution |
| Security | guardrailsData, responseApprovals, playbookLibrary |
| Voice/NL | voiceConversation (voice-based SOC interaction) |

---

## Complete Agent Registry

### Tier 1: Core SOC Pipeline (01-04)
| # | Agent | Type | Schedule | Purpose |
|---|-------|------|----------|---------|
| 01 | Triage | Batch | 3min | LLM-powered L1 alert classification |
| 02 | Enrichment | Batch | 5min | Context: GeoIP, TI, asset, reputation |
| 03 | Threat Hunter | Batch | 4hr | Autonomous hypothesis-driven hunting |
| 04 | Orchestrator | Batch | 10min | Multi-agent coordination & dispatch |

### Tier 2: Intelligence Agents (05-10)
| # | Agent | Type | Purpose |
|---|-------|------|---------|
| 05 | Sage Enrichment | Batch | Deep threat intel (MISP, OTX, VT) |
| 06 | Nova Investigation | Interactive | Deep investigation & network forensics |
| 07 | Vanguard Response | Batch | Automated response execution |
| 08 | CTI Attribution | Batch | APT group attribution analysis |
| 09 | Pattern Discovery | Batch | Cross-alert pattern mining |
| 10 | Vector Memory | Batch | Embedding-based similar incident recall |

### Tier 3: Offensive / Defensive (11-14)
| # | Agent | Type | Purpose |
|---|-------|------|---------|
| 11 | Red Team | Batch | Automated attack simulation (MITRE ATT&CK) |
| 12 | Blue Team | Batch | Defensive posture validation |
| 13 | Forensics | Batch | Timeline reconstruction & evidence preservation |
| 14 | Honeypot | Batch | Honeypot/honeytoken deployment & monitoring |

### Tier 4: LLM Assistants (15-22)
| # | Agent | Type | Purpose |
|---|-------|------|---------|
| 15 | CISO Assistant | Interactive | Executive-level security Q&A |
| 16 | Playbook Generator | Batch | Incident-specific playbook creation |
| 17 | Incident Summarizer | Batch | Executive summary generation |
| 18 | Document Analyzer | Batch | Document/email threat analysis |
| 19 | Malware Sandbox | Batch | Behavioral detonation analysis |
| 20 | LLM Guardrails | Batch | Prompt injection & data leakage detection |
| 21 | Model Poisoning Guard | Batch | ML model integrity monitoring |
| 22 | Threat Simulator | Batch | Attack scenario simulation engine |

### Tier 5: Infrastructure & Platform (23-32)
| # | Agent | Type | Purpose |
|---|-------|------|---------|
| 23 | Connector Adapter | Batch | Data source normalization (OCSF) |
| 24 | Threat Radar | Batch | Emerging threat monitoring |
| 25 | ALHF Learning | Batch | Analyst feedback loop (reinforcement) |
| 26 | Realtime Graph CEP | Streaming | Near-real-time (micro-batch) graph-based detection |
| 27 | Vector Scoring | Batch | Entity risk scoring via embeddings |
| 28 | AI Correlation | Batch | LLM-assisted rule generation |
| 29 | Connector Version | Batch | DNA health & version tracking |
| 30 | Stateful Backdoor | Batch | Persistent threat state tracking |
| 31 | Vibe Connector Builder | Interactive | Natural language connector creation |
| 32 | Vector Search Index | Batch | Embedding index maintenance |

### Tier 6: Vulnerability Management - Glasswing (33-41)
| # | Agent | Type | Purpose |
|---|-------|------|---------|
| 33 | Glasswing Ingest | Batch | CVE/advisory data ingestion |
| 34 | Glasswing Dedup | Batch | Cross-scanner deduplication |
| 35 | Glasswing Reachability | Batch | Network reachability analysis |
| 36 | Glasswing Blast Radius | Batch | Impact radius calculation |
| 37 | Glasswing Auto Patch | Batch | Automated patch recommendation |
| 38 | Session List Manager | Batch | Session-based entity tracking |
| 39 | Active List Manager | Batch | Dynamic watchlist management |
| 40 | LLM Risk Profiler | Batch | AI/LLM usage risk scoring |
| 41 | Glasswing Scanner | Batch | Full vulnerability scan orchestration |

### Tier 7: Specialized & Advanced (42-49)
| # | Agent | Type | Purpose |
|---|-------|------|---------|
| 42 | Knowledge Store | Batch | Vector knowledge base management |
| 43 | Guardian Compliance | Batch | SOX, PCI-DSS, LGPD compliance monitoring |
| 44 | OT Protocol Security | Batch | ICS/SCADA protocol anomaly (Modbus, S7) |
| 45 | ExploitForge | Batch | AI-driven exploit chain analysis |
| 46 | Communication Analyzer | Batch | Communication pattern profiling |
| 47 | Autonomous Response Learner | Batch | Q-Learning response (paper-informed) |
| 48 | UEBA Entity Onboarding | Batch | Behavioral baseline initialization |
| 49 | Edge Control Plane | Batch | Fleet management, DNA versioning, heartbeats |

### Tier 8: AI Security & Predictive (53-60)
| # | Agent | Type | Purpose |
|---|-------|------|---------|
| 53 | Phishing Campaign Engine | Batch | Phishing simulation & detection |
| 55 | Phishing Response Analyzer | Batch | Phishing response effectiveness analysis |
| 56 | AI Gateway Guardian | Batch | AI/LLM gateway protection & monitoring |
| 57 | Shadow AI Detector | Batch | Unauthorized AI usage detection |
| 58 | Prompt Forensics Indexer | Batch | Prompt history indexing & forensics |
| 59 | Vector Pattern Similarity | Batch | Embedding-based pattern matching |
| 60 | Attack Path Forecaster | Batch | Predictive attack path analysis |

---

## Memory Cache: RNN Architecture (11 modules)

Neural memory caching system for near-real-time (micro-batch) threat detection using recurrent neural networks:

```
  ┌─────────────────────────────────────────────────────────────────────────────────┐
  │  MEMORY CACHE PIPELINE (RNN-Based Threat Memory)                                 │
  │                                                                                  │
  │  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐   │
  │  │ 61. RNN      │───►│ 62. Feature  │───►│ 63. Training │───►│ 64. UEBA     │   │
  │  │ Architecture │    │ Tokenizer    │    │ Pipeline     │    │ Baseline     │   │
  │  └──────────────┘    └──────────────┘    └──────────────┘    └──────────────┘   │
  │                                                                                  │
  │  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐   │
  │  │ 65. Cache    │───►│ 66. Streaming│───►│ 67. Attack   │───►│ 68. Response │   │
  │  │ Manager      │    │ Detector     │    │ Chain Recall │    │ Policy       │   │
  │  └──────────────┘    └──────────────┘    └──────────────┘    └──────────────┘   │
  │                                                                                  │
  │  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐                       │
  │  │ 69. Model    │───►│ 70. Serving  │───►│ 71. Explain- │                       │
  │  │ Monitoring   │    │ Endpoint     │    │ ability      │                       │
  │  └──────────────┘    └──────────────┘    └──────────────┘                       │
  │                                                                                  │
  │  PURPOSE: Maintain neural "memory" of entity behavior patterns for instant       │
  │  anomaly detection. The RNN encodes temporal sequences of user/entity actions    │
  │  and fires on deviation from learned behavioral baselines.                       │
  │                                                                                  │
  │  LATENCY: <50ms inference (cached model) | Training: every 24hr (incremental)    │
  └─────────────────────────────────────────────────────────────────────────────────┘
```

| # | Module | Purpose |
|---|--------|---------|
| 61 | RNN Architecture | LSTM/GRU network definition for sequence modeling |
| 62 | Feature Tokenizer | Event-to-token conversion for neural input |
| 63 | Training Pipeline | MLflow-tracked incremental model training |
| 64 | UEBA Baseline | Per-entity behavioral baseline from RNN embeddings |
| 65 | Cache Manager | In-memory model cache with LRU eviction |
| 66 | Streaming Detector | Real-time inference on event streams |
| 67 | Attack Chain Recall | Historical attack pattern retrieval via embeddings |
| 68 | Response Policy | Automated response decisions from model output |
| 69 | Model Monitoring | Drift detection and performance degradation alerts |
| 70 | Serving Endpoint | Model serving endpoint registration |
| 71 | Explainability | SHAP/attention-based explanation of detections |

---

## Performance Characteristics

> Note: The latency and throughput figures below are demo/target values from a
> synthetic load generator and representative runs, not measured production SLAs.
> Streaming stages run as serverless micro-batches (`availableNow` triggers), so
> end-to-end detection latency is bounded by the batch/restart cadence (tens of
> seconds), and windowed correlation only emits once its window closes.

```
  ╔════════════════════════════════════════════════════════════════════════════════════╗
  ║                        LATENCY BENCHMARKS                                         ║
  ╠════════════════════════════════════╦═══════════════╦═══════════════════════════════╣
  ║  Operation                         ║   Latency     ║   Method                      ║
  ╠════════════════════════════════════╬═══════════════╬═══════════════════════════════╣
  ║  Known IOC match (IP/domain/hash)  ║   10-60 sec   ║   SDP Streaming + Bloom       ║
  ║  Multi-stage attack (CEP)          ║   10-60 sec   ║   Windowed correlation        ║
  ║  Behavioral anomaly (UEBA)         ║   5-10 min    ║   Batch detection             ║
  ║  Full investigation + response     ║   1-5 min     ║   Agent pipeline              ║
  ║  LLM triage classification         ║   3-8 sec     ║   Foundation Model API        ║
  ║  Entity risk re-scoring            ║   30-60 sec   ║   Vector scoring              ║
  ║  Entity KV lookup (Brickstore)     ║   <10 ms      ║   In-memory KV cache          ║
  ║  Operational query (Lakebase)      ║   ~50 ms      ║   CDC-synced Postgres         ║
  ║  Full-text log search (Lucene)     ║   ~100 ms     ║   Inverted index              ║
  ║  Historical analytics (Delta)      ║   ~1000 ms    ║   Columnar scan               ║
  ╚════════════════════════════════════╩═══════════════╩═══════════════════════════════╝
```

---

## Security Model

```
  ┌─────────────────────────────────────────────────────────────────────────────────┐
  │                    SECURITY ARCHITECTURE                                          │
  ├─────────────────────────────────────────────────────────────────────────────────┤
  │                                                                                  │
  │   DATA AT REST                            DATA IN TRANSIT                       │
  │   ════════════                            ════════════════                       │
  │   • Delta Lake AES-256 encryption         • SASL_SSL to ZeroBus/Kafka           │
  │   • Unity Catalog RBAC (table-level)      • mTLS for edge collectors            │
  │   • Column-level masking for PII          • HTTPS/gRPC for all APIs             │
  │   • Row-level security via views          • Certificate rotation tracking       │
  │                                                                                  │
  │   ACCESS CONTROL                          AUDIT & COMPLIANCE                    │
  │   ══════════════                          ══════════════════                     │
  │   • Workspace SSO (SAML/OIDC)            • Full audit trail (Monitor framework) │
  │   • Secret scope for credentials          • Agent execution logging             │
  │   • Human-in-the-loop approval gate       • Chain of custody for evidence       │
  │   • Agent confidence thresholds           • SOX, PCI-DSS, LGPD controls         │
  │   • Per-agent token budget limits         • Detection-as-Code versioning        │
  │                                                                                  │
  │   LLM SAFETY                              EDGE SECURITY                         │
  │   ══════════                              ═════════════                          │
  │   • Prompt injection detection (Agent 20) • mTLS certificate management         │
  │   • Model poisoning guard (Agent 21)      • API key hash verification           │
  │   • PII redaction before LLM calls        • Heartbeat-based liveness            │
  │   • Token budget enforcement              • Automatic quarantine on anomaly     │
  │   • Output validation & sanitization      • Config version pinning              │
  │                                                                                  │
  └─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Installation Manual

### Prerequisites

| Requirement | Minimum | Recommended |
|-------------|---------|-------------|
| Databricks Workspace | Premium | Enterprise |
| Unity Catalog | Enabled | Enabled + Volumes |
| Compute | DBR 14.3+ | DBR 15.0+ |
| SQL Warehouse | Pro | Serverless |
| Foundation Model APIs | Enabled | Llama 3.1 70B + 8B |
| MLflow | Included | Included |
| Kafka / Event Hub | 3 brokers | 6 brokers (HA) |
| Storage | 500 GB | 2 TB |

### Step 1: Deploy with Databricks Asset Bundles (Recommended)

```bash
# ─────────────────────────────────────────────────────────────────────────────
# OPTION A: One-Command Deployment
# ─────────────────────────────────────────────────────────────────────────────

cd databricks-native
./deploy.sh production

# This script will:
#   1. Validate Databricks CLI authentication
#   2. Deploy all 116 notebooks preserving directory structure
#   3. Create 60+ Workflow jobs with correct schedules
#   4. Configure the DLT pipeline (Bronze/Silver/Gold)
#   5. Deploy the Databricks App (React + FastAPI)
#   6. Print connection URLs and next steps
```

### Step 2: Manual Deployment (Alternative)

```bash
# ─────────────────────────────────────────────────────────────────────────────
# OPTION B: Manual Step-by-Step
# ─────────────────────────────────────────────────────────────────────────────

# 1. Authenticate
databricks auth login --host https://YOUR-WORKSPACE.cloud.databricks.com

# 2. Upload notebooks
databricks workspace import-dir ./notebooks /Workspace/0xDSI --overwrite

# 3. Create catalog and schema
databricks jobs run-now --notebook-path /Workspace/0xDSI/setup/01_create_catalog_schema

# 4. Seed demo data
databricks jobs run-now --notebook-path /Workspace/0xDSI/setup/02_seed_demo_data
databricks jobs run-now --notebook-path /Workspace/0xDSI/setup/03_seed_all_platform_data

# 5. Register ML models
databricks jobs run-now --notebook-path /Workspace/0xDSI/setup/04_register_model_serving

# 6. Seed correlation rules library
databricks jobs run-now --notebook-path /Workspace/0xDSI/setup/05_seed_correlation_rules_library

# 7. Deploy the Databricks App
databricks apps create --name 0xdsi-soc \
  --source-code-path ./app \
  --config ./app/app.yaml
```

### Step 3: Configure Secrets

```bash
# ─────────────────────────────────────────────────────────────────────────────
# SECRET SCOPE SETUP
# ─────────────────────────────────────────────────────────────────────────────

# Create the scope
databricks secrets create-scope soc-secrets

# ═══════════════════════════════════════════════════════════════════════════════
# REQUIRED SECRETS (Platform will not start without these)
# ═══════════════════════════════════════════════════════════════════════════════

databricks secrets put-secret soc-secrets kafka_brokers       # Kafka broker list
databricks secrets put-secret soc-secrets kafka_sasl_username # SASL username
databricks secrets put-secret soc-secrets kafka_sasl_password # SASL password

# ═══════════════════════════════════════════════════════════════════════════════
# THREAT INTELLIGENCE (Strongly recommended for production)
# ═══════════════════════════════════════════════════════════════════════════════

databricks secrets put-secret soc-secrets virustotal_api_key  # VirusTotal API
databricks secrets put-secret soc-secrets abuseipdb_api_key   # AbuseIPDB
databricks secrets put-secret soc-secrets otx_api_key         # AlienVault OTX
databricks secrets put-secret soc-secrets misp_url            # MISP instance URL
databricks secrets put-secret soc-secrets misp_api_key        # MISP API key
databricks secrets put-secret soc-secrets shodan_api_key      # Shodan

# ═══════════════════════════════════════════════════════════════════════════════
# RESPONSE INTEGRATIONS (Optional, enables automated response)
# ═══════════════════════════════════════════════════════════════════════════════

databricks secrets put-secret soc-secrets crowdstrike_client_id
databricks secrets put-secret soc-secrets crowdstrike_client_secret
databricks secrets put-secret soc-secrets pagerduty_api_key
databricks secrets put-secret soc-secrets slack_webhook_url
databricks secrets put-secret soc-secrets servicenow_url
databricks secrets put-secret soc-secrets servicenow_username
databricks secrets put-secret soc-secrets servicenow_password
databricks secrets put-secret soc-secrets jira_url
databricks secrets put-secret soc-secrets jira_api_token
databricks secrets put-secret soc-secrets teams_webhook_url

# ═══════════════════════════════════════════════════════════════════════════════
# EDGE COLLECTOR (Required for Edge Mesh)
# ═══════════════════════════════════════════════════════════════════════════════

databricks secrets put-secret soc-secrets edge_mtls_ca_cert   # CA certificate PEM
databricks secrets put-secret soc-secrets edge_mtls_ca_key    # CA private key
databricks secrets put-secret soc-secrets edge_jwt_secret     # JWT signing secret
```

### Step 4: Configure SQL Warehouse

```bash
# Set the warehouse ID in the App environment
# Navigate to: Apps > 0xdsi-soc > Settings > Environment Variables
# Add: DATABRICKS_WAREHOUSE_ID = <your-warehouse-id>

# Or via CLI:
databricks apps update 0xdsi-soc \
  --env DATABRICKS_WAREHOUSE_ID=<warehouse-id>
```

### Step 5: Start Streaming Jobs

```bash
# ─────────────────────────────────────────────────────────────────────────────
# ALWAYS-ON STREAMING JOBS (Start in this order)
# ─────────────────────────────────────────────────────────────────────────────

# Core Ingestion (start first)
databricks jobs run-now --job-name "0xDSI-Ingestion-01-RawEvent"
databricks jobs run-now --job-name "0xDSI-Ingestion-02-Enrichment"
databricks jobs run-now --job-name "0xDSI-Ingestion-07-LakebaseSync"
databricks jobs run-now --job-name "0xDSI-Ingestion-08-BronzePartition"

# Streaming Detection (start after ingestion is healthy)
databricks jobs run-now --job-name "0xDSI-Correlation-01-StreamingCEP"
databricks jobs run-now --job-name "0xDSI-Correlation-04-TemporalWindow"
databricks jobs run-now --job-name "0xDSI-Detection-02-ThreatIntelMatch"

# Graph CEP (start last, needs warm data)
databricks jobs run-now --job-name "0xDSI-Agents-26-RealtimeGraphCEP"
```

### Step 6: Verify Deployment

```bash
# ─────────────────────────────────────────────────────────────────────────────
# HEALTH CHECK
# ─────────────────────────────────────────────────────────────────────────────

# Run the health check notebook
databricks jobs run-now --notebook-path /Workspace/0xDSI/ops/02_health_check

# Expected output:
#   Platform Status: HEALTHY
#   Catalog: oxdsi_soc (140+ tables)
#   Streaming Jobs: 7/7 running
#   Agent Jobs: 42/42 scheduled
#   ML Models: 5/5 registered
#   Edge Collectors: 0 (pending deployment)
#   DLT Pipeline: RUNNING
```

### Step 7: Deploy Edge Collectors

```bash
# ─────────────────────────────────────────────────────────────────────────────
# EDGE COLLECTOR DEPLOYMENT
# ─────────────────────────────────────────────────────────────────────────────

# From the 0xDSI UI: Data Connectors > Edge Mesh > Deploy Collector
# Or manually:

# Linux (bare metal or VM)
curl -sSL https://<workspace>/apps/0xdsi-soc/api/edge-connectors/install.sh | \
  bash -s -- \
    --dna palo_alto_firewall \
    --site datacenter-east \
    --token <generated-token>

# Docker
docker run -d --name 0xdsi-edge \
  -e DNA_NAME=crowdstrike_falcon \
  -e SITE_NAME=datacenter-east \
  -e HUB_URL=kafka.internal:9092 \
  -e AUTH_TOKEN=<generated-token> \
  0xdsi/edge-collector:1.4.2

# Kubernetes (Helm)
helm install 0xdsi-edge ./charts/edge-collector \
  --set dna.name=aws_cloudtrail \
  --set site.name=aws-us-east-1 \
  --set hub.url=kafka.internal:9092 \
  --set auth.token=<generated-token>
```

---

## Deployment Targets

| Target | Catalog | Purpose | Compute |
|--------|---------|---------|---------|
| `dev` | `oxdsi_soc_dev` | Development & testing | Single-node, spot |
| `staging` | `oxdsi_soc_staging` | Pre-production validation | 2-node cluster |
| `production` | `oxdsi_soc` | Live operations | Auto-scale 1-16 workers |

```bash
# Deploy to specific target
databricks bundle deploy --target dev
databricks bundle deploy --target staging
databricks bundle deploy --target production
```

---

## Databricks Features Utilized

```
  ╔════════════════════════════════════════════════════════════════════════════════════╗
  ║                    DATABRICKS FEATURE UTILIZATION                                  ║
  ╠═══════════════════════════╦════════════════════════════════════════════════════════╣
  ║  Unity Catalog            ║  140+ Delta tables, ML models, Feature Store, Volumes  ║
  ║  Databricks Apps          ║  React + FastAPI with Workspace SSO                    ║
  ║  Serverless SQL Warehouse ║  Backend API queries (<100ms p95)                      ║
  ║  Structured Streaming     ║  8+ real-time ingestion/detection jobs                 ║
  ║  Workflows                ║  60+ scheduled agent and operational jobs              ║
  ║  Delta Live Tables        ║  Bronze/Silver/Gold medallion with expectations        ║
  ║  Foundation Model APIs    ║  49 LLM-powered agents (Llama 3.1 70B/8B)             ║
  ║  MLflow                   ║  5+ ML models with training, registry, monitoring      ║
  ║  Secrets                  ║  25+ external service credentials                      ║
  ║  Volumes                  ║  Checkpoints, model artifacts, exported data           ║
  ║  Vector Search            ║  Embedding-based similarity for threat hunting         ║
  ║  Auto-Scaling Compute     ║  Job clusters scale 1-16 workers                      ║
  ║  Change Data Feed         ║  CDC for serving layer synchronization                 ║
  ║  Photon Engine            ║  Accelerated SQL for Gold analytics                    ║
  ║  Delta Sharing            ║  Cross-org threat intelligence sharing                 ║
  ╚═══════════════════════════╩════════════════════════════════════════════════════════╝
```

---

## Troubleshooting

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| Streaming job fails on start | Kafka brokers unreachable | Verify `soc-secrets/kafka_brokers` |
| LLM agent returns empty | Foundation Model API not enabled | Enable in workspace admin settings |
| No data in Gold tables | DLT pipeline paused | Resume via Workflows > DLT |
| Edge collector "offline" | Heartbeat timeout (300s default) | Check network connectivity |
| "Table not found" errors | Setup not run | Execute `01_create_catalog_schema` |
| High latency on queries | SQL Warehouse hibernated | Switch to "Always On" or reduce idle timeout |
| Agent confidence too low | Insufficient training data | Run `02_seed_demo_data` for initial baseline |
| Model serving 404 | Model not registered | Run `04_register_model_serving` |

---

## Architecture Decision Records

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Compute | Databricks-native only | Zero egress, data sovereignty, single-vendor SLA |
| LLM | Foundation Model APIs | No external API calls, governed by workspace policies |
| Streaming | Structured Streaming + Kafka | Near-real-time (micro-batch) detection with Delta persistence |
| Storage | Delta Lake (medallion) | ACID transactions, time travel, Z-Order optimization |
| Detection | Multi-model ensemble | No single-point-of-failure in detection logic |
| Response | Human-in-the-loop | Safety for critical actions; autonomous for low-risk |
| Edge | Universal binary + DNA | One binary handles 32 source types; update via YAML |
| Auth | Workspace SSO | No separate identity system; leverages existing IAM |
| Serving | 4-tier (KV/SQL/FTS/Analytics) | Right latency for right use case |
| ML | MLflow + Feature Store | Reproducible experiments, model governance |

---

## Contributing

```
  ┌─────────────────────────────────────────────────────────────────────────────────┐
  │  DEVELOPMENT WORKFLOW                                                            │
  │                                                                                  │
  │  1. Create feature branch                                                       │
  │  2. Develop locally (notebooks + frontend)                                      │
  │  3. Deploy to dev target: databricks bundle deploy --target dev                 │
  │  4. Run smoke tests: python tests/smoke_test_e2e_pipeline.py                    │
  │  5. Run schema validation: python tests/smoke_validate_schema.py                │
  │  6. PR review + merge                                                           │
  │  7. Auto-deploy to staging via CI                                               │
  │  8. Manual promotion to production                                              │
  │                                                                                  │
  │  NOTEBOOK CONVENTIONS                                                           │
  │  • First cell: %run ../_shared/bootstrap                                        │
  │  • Second cell: dbutils.widgets for parameters                                  │
  │  • Use require_tables() for dependency declaration                              │
  │  • Use mon.time() for all timed operations                                     │
  │  • Use mon.log_complete() at notebook exit                                      │
  │  • Use dbutils.notebook.exit(json.dumps(result)) for structured output          │
  │                                                                                  │
  └─────────────────────────────────────────────────────────────────────────────────┘
```

---

## License

Proprietary. All rights reserved. Databricks Inc.

---

```
  ═══════════════════════════════════════════════════════════════════════════════════

              "The best SOC is one where machines handle the noise
               and humans handle the judgment."

                                              — 0xDSI Platform Philosophy

  ═══════════════════════════════════════════════════════════════════════════════════
```
