# 0xDSI Detection Engine: Engineering-Level Technical Explanation

> **Audience:** Technical decision-makers, investors, and engineers who may not have deep cybersecurity expertise. Each section explains WHAT the component does, HOW it works under the hood, WHY it matters, and WHAT value it adds on top of Databricks' acquired capabilities (Lakewatch, Panther Labs, SiftD.ai).

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [CET - Compounding Event Trends](#1-cet---compounding-event-trends)
3. [SDP + CEP Rules (Streaming Detection Pipeline)](#2-sdp--cep-rules-streaming-detection-pipeline)
4. [Detection Confluence (7-Lens Bayesian Fusion)](#3-detection-confluence-7-lens-bayesian-fusion)
5. [MC-RNN Behavioral Memory](#4-mc-rnn-behavioral-memory)
6. [Knowledge Store / Confluence Memory](#5-knowledge-store--confluence-memory)
7. [GraphRAG Reasoning (Zero-Day Detection)](#6-graphrag-reasoning-zero-day-detection)
8. [Negative Correlation Engine](#7-negative-correlation-engine)
9. [Model Disagreement Detection](#8-model-disagreement-detection)
10. [CET/CEP Fusion (Pre-Bronze Stream Processing)](#9-cetcep-fusion-pre-bronze-stream-processing)
11. [Swarm Crucible (Genetic Co-Evolution)](#10-swarm-crucible-genetic-co-evolution)
12. [Autonomous Response Learner](#11-autonomous-response-learner)
13. [All Agents (60 Specialized AI Workers)](#12-all-agents-60-specialized-ai-workers)

---

## Architecture Overview

```
Data Sources (130+ connectors, 35 protocols)
    |
    v
Edge Collector (Rust, 200K+ events/sec)
    |
    v
ZeroBus (Kafka backbone) ──────────────────────────────────────────────────
    |                                                                       |
    v                                                                       v
+=============================+                              +========================+
| LAYER 3: PRE-BRONZE STREAM |                              | Ingestion Pipeline     |
| PROCESSING (sub-second)    |                              | (Delta persistence)    |
|                            |                              +========================+
| CET (trend graphlets)      |                                          |
| CEP (pattern matching)     |                                          v
| Graph CEP (NetworkX)       |                              +========================+
| Threat Intel Match         |                              | BRONZE (raw + CET      |
+=============================+                              | signals)               |
    |                                                        +========================+
    |   Trend scores, matched patterns                                  |
    |   persist ALONGSIDE raw events                                    v
    +----> into Bronze ─────────────────────────────────>   +========================+
                                                            | SILVER (OCSF normalized)|
                                                            +========================+
                                                                        |
                                                                        v
                                                            +========================+
                                                            | DETECTION INTELLIGENCE |
                                                            | (7 lenses in parallel) |
                                                            |                        |
                                                            | 1. Correlation Rules   |
                                                            | 2. Negative Correlation|
                                                            | 3. Graph Patterns      |
                                                            | 4. Detection SLM       |
                                                            | 5. Vector Hunting      |
                                                            | 6. Formula Priority    |
                                                            | 7. UEBA Behavioral     |
                                                            +========================+
                                                                        |
                                                                        v
                                                            +========================+
                                                            | FUSE ENGINE            |
                                                            | (Dempster-Shafer       |
                                                            |  independence scoring) |
                                                            +========================+
                                                                        |
                                                                        v
                                                            +========================+
                                                            | DETECTION CONFLUENCE   |
                                                            | (Bayesian fusion +     |
                                                            |  novelty gating)       |
                                                            +========================+
                                                                        |
                                                                        v
                                                            +========================+
                                                            | AGENT ORCHESTRATION    |
                                                            | (60 specialized agents)|
                                                            +========================+
                                                                        |
                                                                        v
                                                            +========================+
                                                            | EVOLUTION & LEARNING   |
                                                            | - Swarm Crucible       |
                                                            | - MC-RNN Memory        |
                                                            | - Response Learner     |
                                                            +========================+
                                                                        |
                                                                        v
                                                            +========================+
                                                            | RESPONSE / COMMAND     |
                                                            | CENTER                 |
                                                            +========================+
```

---

## 1. CET - Compounding Event Trends

### What It Does (Plain English)

CET watches the STREAM of incoming security events and looks for **chains** -- sequences of related steps that, individually, might look innocent but collectively form an attack path. Think of it like connecting dots on a map: a single dot means nothing, but five dots forming a line toward the treasure vault tells a story.

### How It Works (Engineering)

**Algorithm:** GraphFrames + Kleene-closure BFS (Breadth-First Search)

1. **Graph Construction:** Every entity (IP address, username, hostname) becomes a node. Every event connecting two entities becomes a directed edge with a timestamp.

2. **Multi-hop Motif Finding:** CET defines "query patterns" -- for example, a Lateral Movement Chain requires 3-6 hops through edges labeled `lateral_movement`, `remote_execution`, or `pass_the_hash`. It uses GraphFrame's motif-finding API to detect 2-hop and 3-hop time-ordered paths within a sliding window (default 300 seconds).

3. **Scoring:** Each discovered path gets a composite score:
   ```
   Score = (hops / max_hops) * (max_severity / 5.0) * time_decay_factor
   ```
   Fast attack chains (under 60 seconds) score higher because speed indicates automation.

4. **Graphlet Segmentation:** Events are grouped into time-windowed sub-graphs ("graphlets"). Cross-window node reuse is measured -- if the same entities appear in consecutive windows, it signals persistent adversary activity.

5. **Connected Components:** The algorithm identifies isolated clusters of communicating entities. Large clusters (3+ entities) flag coordinated attack campaigns.

**Pre-defined Attack Patterns:**
- `lm_001`: Lateral Movement Chain (3-6 hops via remote execution, SMB, RDP)
- `pe_001`: Privilege Escalation Path (2-4 hops via token manipulation, credential access)
- `exfil_001`: Exfiltration Pipeline (2-5 hops via data staging, compression, DNS tunnel)
- `persist_001`: Persistence Installation (2-4 hops via scheduled tasks, registry mods, service creation)

### Why It Matters

Traditional security tools look at **individual events**. CET looks at **event relationships over time**. An attacker who moves slowly from one machine to another, then escalates privileges, then stages data -- each individual step might be below the alert threshold. CET catches the CHAIN, not just the links.

### Value Over Databricks Acquisitions

| Databricks Has | 0xDSI CET Adds |
|---|---|
| **Lakewatch:** Rule-based correlation on stored data | **Pre-Bronze graph analysis** on streaming data -- detects BEFORE events hit storage |
| **Panther Labs:** Pattern matching on individual log lines | **Multi-hop path discovery** across entities -- sees the forest, not just trees |
| **SiftD.ai:** Visual notebook exploration | **Automated Kleene-closure** mathematically finds ALL paths up to N hops |

---

## 2. SDP + CEP Rules (Streaming Detection Pipeline)

### What It Does (Plain English)

SDP is a "fast lane" that runs ALONGSIDE the normal data storage pipeline. While events are being written to permanent storage (which takes 30-60 seconds), SDP processes them in under 1 second. CEP (Complex Event Processing) rules look for specific combinations of events happening in specific time windows -- like "3 failed logins followed by a successful login from a new country within 5 minutes."

### How It Works (Engineering)

**Architecture:** Direct Kafka consumption from ZeroBus (the internal message bus), bypassing Delta table write latency entirely.

```
ZeroBus (Kafka) ──┬──> Normal ingestion (30-60s latency) --> Delta tables
                  │
                  └──> SDP Stream (sub-second latency)
                       ├── streaming_correlation_engine (temporal windows)
                       ├── temporal_window_correlator (multi-event patterns)
                       ├── threat_intel_matching (IOC lookups)
                       └── realtime_graph_cep (NetworkX in-memory graphs)
```

**CEP Pattern Language:** Rules define:
- **Event sequence:** Which event types must occur and in what order
- **Time window:** Maximum elapsed time for the pattern to be valid
- **Entity binding:** Events must share a common entity (same user, same IP)
- **Threshold:** Minimum event count to trigger
- **Negation:** Events that MUST NOT appear (e.g., "no VPN disconnect")

**Watermarking:** Spark Structured Streaming with configurable watermarks (default 5 minutes) handles late-arriving events gracefully.

### Why It Matters

In cybersecurity, **speed is survival**. An attacker who gains access can exfiltrate data in under 30 seconds. If your detection takes 60 seconds just to store the log, the theft is already complete. SDP catches attacks while they're HAPPENING, not after they've happened.

### Value Over Databricks Acquisitions

| Databricks Has | 0xDSI SDP Adds |
|---|---|
| **Lakewatch:** Processes from stored Delta tables (seconds to minutes delay) | **Direct Kafka consumption** -- sub-second detection on raw stream |
| **Panther Labs:** Cloud-native log processing (seconds latency) | **In-memory graph construction** -- real-time entity relationship tracking |
| Standard Structured Streaming | **Domain-specific CEP patterns** -- pre-built security event correlation language |

---

## 3. Detection Confluence (7-Lens Bayesian Fusion)

### What It Does (Plain English)

Imagine 7 different security experts each analyzing the same evidence from their own specialty. One expert specializes in patterns, another in missing events, another in network connections, another in AI classification, etc. Detection Confluence takes ALL their opinions and mathematically combines them into a single verdict with a confidence score. If multiple independent experts agree something is bad, the confidence skyrockets.

### How It Works (Engineering)

**The 7 Detection Lenses:**

1. **Correlation Rules** (weight: 0.25): Traditional multi-event pattern matches from CEP
2. **Negative Correlation** (weight: 0.10): Absence-based detection (what DIDN'T happen)
3. **Graph Patterns** (weight: 0.20): Entity relationship anomalies from GraphFrames
4. **Detection SLM** (weight: 0.15): Small Language Model rapid classification
5. **Vector Hunting** (weight: 0.10): Embedding similarity to known threat vectors
6. **Formula Prioritization** (weight: 0.05): Risk-score-based ranking
7. **UEBA Behavioral** (weight: 0.15): User/Entity baseline deviation (KS-validated)

**Fusion Algorithm:**

```python
# Bayesian Weighted Fusion with Diversity Bonus
for each signal:
    if KS-validated:  score *= 1.15  (reliability boost)
    else:             score *= 0.85  (penalty)
    weighted_sum += lens_weight * score

base_score = weighted_sum / total_weight
diversity_factor = 1.0 + (num_lenses - 1) * (0.067 + KS_bonus)
fused_score = min(1.0, base_score * diversity_factor)
```

**Key Design Choices:**

- **KS-Validated signals get a boost:** If a signal was validated using Kolmogorov-Smirnov statistical tests, it gets a 15% reliability increase. This means signals backed by rigorous statistics carry more weight.

- **Diversity bonus:** Each ADDITIONAL independent lens that agrees increases confidence non-linearly. 3 lenses agreeing is worth significantly more than 1 lens being very confident.

- **Novelty gating:** Before escalating, the system checks: "Has this entity scored this high before?" using a 7-day percentile history. This prevents **chronic re-alerting** -- if an entity is ALWAYS high-risk, we don't keep screaming about it.

- **Kill chain tracking:** Signals are mapped to the MITRE ATT&CK kill chain stages. If signals span multiple stages (reconnaissance + initial access + lateral movement), the system recognizes a multi-stage attack.

**Priority Assignment:**
- P1: Score >= 0.9 AND 3+ lenses agree
- P2: Score >= 0.78
- P3: Score >= 0.6
- P4: Everything else

### Why It Matters

Single-method detection systems have a fundamental problem: **each method has blind spots**. A signature-based system misses novel attacks. A behavioral system generates false positives during legitimate changes. A graph-based system misses isolated events. By requiring MULTIPLE independent methods to agree, Confluence dramatically reduces false positives while catching attacks that any single method would miss.

### Value Over Databricks Acquisitions

| Databricks Has | 0xDSI Confluence Adds |
|---|---|
| **Panther Labs:** Single detection engine (rules + Python detections) | **7 independent detection methods** fused with Bayesian math |
| **Lakewatch:** Agent-based analysis (single perspective) | **Diversity bonus** -- mathematically rewards independent corroboration |
| Standard alert prioritization | **Novelty gating** -- prevents the #1 SOC complaint: alert fatigue from chronic noisy entities |
| No statistical validation layer | **KS-validated confidence** -- only signals with mathematical backing get full weight |

---

## 4. MC-RNN Behavioral Memory

### What It Does (Plain English)

MC-RNN is the engine's "long-term memory." Traditional AI models have a fixed attention window -- they can only "remember" the last few thousand events. MC-RNN uses a clever caching trick: it takes snapshots of its understanding at regular intervals and stores them. When processing new events, it can quickly look back at those snapshots to recall what happened days or weeks ago, without having to re-read everything.

### How It Works (Engineering)

**Research Foundation:** Based on "Memory Caching: RNNs with Growing Memory" (arXiv 2602.24281)

**Architecture Components:**

1. **Linear Attention RNN Core:** Processes events in segments of 64 using a kernel-trick linear attention mechanism. Unlike standard transformers (O(n^2) cost), this runs in O(n) time per segment.

2. **Memory Cache Layer:** At each segment boundary, the hidden state (the model's "understanding" at that point) is saved as a checkpoint. These checkpoints accumulate over time, giving the model growing memory.

3. **Cache Query Mechanism:** When processing new events, the model queries all cached checkpoints using multi-head attention. A learned gate controls how much to rely on current context vs. cached memory:
   ```
   fused_state = gate * current_state + (1 - gate) * cached_context
   ```

4. **Importance-Based Eviction:** When the cache is full (32-64 slots depending on deployment tier), a learned importance scorer determines which checkpoint to evict. "Landmark" caches (high-severity segments) are protected from eviction.

**Model Configurations:**
| Preset | Layers | Hidden Dim | Cache Size | Parameters |
|--------|--------|-----------|-----------|------------|
| Lite (Edge/OT) | 2 | 128 | 16 | ~0.5M |
| Medium | 4 | 256 | 32 | ~4M |
| Production | 6 | 512 | 64 | ~25M |

**Multi-Objective Training Loss:**
- **40% Next-event prediction:** Can the model predict what happens next? (Anomalous events are unpredictable)
- **30% Reconstruction:** Can the model reconstruct what it saw? (Tests encoding quality)
- **20% Contrastive anomaly:** Push attack events UP in anomaly score, normal events DOWN
- **10% Cache utilization:** Regularization to ensure cache attention is spread (not collapsed onto one entry)

**Security Application:** Each entity (user, host, service) gets its own cache timeline. The model remembers "User X normally does these things at these times in this pattern." When behavior deviates after 30 days of consistent baseline, the model catches it because it can reference its cached memory of the baseline.

### Why It Matters

Attackers deliberately operate SLOWLY. Advanced Persistent Threats (APTs) spread their activities across days or weeks to avoid triggering time-window-based detections. MC-RNN defeats this because it maintains a 30-day behavioral memory with cache checkpoints -- it can compare today's behavior to behavior from 3 weeks ago without any fixed time window.

### Value Over Databricks Acquisitions

| Databricks Has | 0xDSI MC-RNN Adds |
|---|---|
| **Panther Labs:** Rule-based detection with fixed time windows (1h, 24h) | **30-day adaptive memory** that grows with the entity's history |
| **Lakewatch:** LLM-based analysis (no persistent per-entity memory) | **Per-entity hidden state caching** -- each user/host has a persistent behavioral model |
| Standard ML models retrain periodically | **Online learning** with segment-level checkpoints -- adapts continuously without retraining |
| No temporal sequence modeling | **Sequence-aware RNN** that understands event ORDER, not just event COUNT |

---

## 5. Knowledge Store / Confluence Memory

### What It Does (Plain English)

The Knowledge Store is the engine's "institutional memory." Every time a security incident is resolved, every time an analyst makes a decision, every time a playbook is executed -- the outcome is recorded with searchable embeddings. When a similar situation arises in the future, the system can instantly recall: "Last time we saw this pattern, it was a false positive because..." or "This attack technique was successfully contained by isolating the host and revoking credentials."

### How It Works (Engineering)

**Data Sources Ingested:**
1. **Closed incident cases** -- What was the outcome? What was the resolution?
2. **Analyst feedback** -- Was this a false positive? Why? What's the rationale?
3. **Threat intelligence feeds** -- New IOCs, campaign attributions, actor TTPs
4. **Response action outcomes** -- Did the containment work? Did it cause disruption?
5. **Detection pattern learnings** -- Which rules produce signal vs. noise?

**Storage Architecture:**
```sql
knowledge_store (Delta table):
    ks_id, entry_type, title, content, content_hash,
    source_id, entity_ids, mitre_tactics, mitre_techniques,
    confidence, outcome, analyst_id, tags,
    valid_from, valid_until, is_active,
    retrieval_count, last_retrieved

knowledge_store_embeddings (Delta table):
    ks_id, embedding (ARRAY<DOUBLE>), text_for_embedding, model_name
```

**Semantic Search Pipeline:**
1. New entries are hashed (SHA-256) for deduplication
2. Content is embedded using Databricks Foundation Model API (`ai_query()`)
3. Embeddings are stored in a separate index table
4. At query time, current alert context is embedded and compared via cosine similarity to find relevant past experiences

**Lifecycle Management:**
- **Ingestion:** Every 15-60 minutes, harvests new resolved cases, feedback, and CTI
- **Embedding:** Batch-processes unembedded entries via AI Functions
- **Garbage Collection:** Deactivates CTI entries older than 90 days with zero retrievals
- **Statistics:** Tracks retrieval counts to identify the most valuable knowledge entries

### Why It Matters

SOC teams lose institutional knowledge when analysts leave. They repeatedly investigate the same false positives. They don't learn from past mistakes. The Knowledge Store solves this by making ALL historical context instantly retrievable by any agent -- RAG (Retrieval-Augmented Generation) applied to security operations.

### Value Over Databricks Acquisitions

| Databricks Has | 0xDSI Knowledge Store Adds |
|---|---|
| **Lakewatch:** Agentic SIEM without persistent memory across incidents | **Cross-incident learning** -- every resolution teaches the system |
| **Panther Labs:** Detection-focused, no analyst decision capture | **Analyst decision embedding** -- captures the WHY behind human choices |
| Unity Catalog (data governance) | **Security-specific knowledge taxonomy** with confidence, outcome tracking, and auto-expiration |
| Vector Search (generic) | **Domain-tuned retrieval** prioritizing recency, relevance, and retrieval frequency |

---

## 6. GraphRAG Reasoning (Zero-Day Detection)

### What It Does (Plain English)

GraphRAG tackles the hardest problem in cybersecurity: detecting attacks that have NEVER been seen before (zero-days). It builds a knowledge graph of known attack techniques, threat actors, and indicators. When it finds high-severity events that DON'T match any known signature, it uses an LLM (Large Language Model) to reason about whether the PATTERN of unsigned events represents a genuinely novel attack.

### How It Works (Engineering)

**Step 1: Build Threat Knowledge Graph**
```sql
-- Nodes: Techniques, IOCs, and Actors
SELECT 'technique', mitre_technique, mitre_tactic, COUNT(*) as frequency
FROM alerts WHERE mitre_technique IS NOT NULL

UNION ALL

SELECT 'ioc', value, threat_type, confidence
FROM ioc_entries

UNION ALL

SELECT 'actor', attribution, status, confidence
FROM threat_campaigns WHERE attribution IS NOT NULL
```

**Step 2: Find "Unsigned" Events**
These are high-severity events that produced NO alert from any detection system. They exist in a blind spot.
```sql
SELECT e.* FROM events e
LEFT JOIN alerts a ON e.id = a.source_event_id
WHERE a.id IS NULL AND e.severity IN ('high', 'critical')
```

**Step 3: Group by Source IP**
Events from the same source IP are grouped together -- if a single IP is generating multiple unsigned high-severity events, that's suspicious.

**Step 4: LLM Reasoning**
For each IP group with 3+ events, an LLM analyzes the sequence:
```
System: "You are a zero-day threat analyst. Analyze event sequences that
didn't match known signatures. Determine if they represent novel attack
patterns."

User: "Here are 15 unsigned events from IP 10.0.4.22:
  [authentication_failure -> port_scan -> process_injection -> ...]
Is this a potential zero-day?"

Response: {
  "is_zero_day": true,
  "confidence": 85,
  "pattern_name": "Novel RCE via DNS rebinding",
  "reasoning": "The sequence shows...",
  "recommended_signature": "..."
}
```

**Step 5: Generate Detection Signatures**
If the LLM identifies a zero-day with confidence >= 60%, the system:
1. Creates a `critical` severity alert
2. Persists the candidate to `zero_day_detections`
3. Records the recommended signature for future automated detection
4. Logs everything to MLflow for audit and model improvement

### Why It Matters

Traditional security relies on KNOWN signatures. If an attack has never been seen before, signature-based systems are blind. GraphRAG combines structured knowledge (the graph of known threats) with reasoning ability (the LLM) to identify attacks that don't match ANY existing pattern. It's the difference between a detective who only solves cases with fingerprints on file vs. one who can reason about criminal behavior from first principles.

### Value Over Databricks Acquisitions

| Databricks Has | 0xDSI GraphRAG Adds |
|---|---|
| **Lakewatch:** Agent-based analysis of known patterns | **LLM reasoning about UNKNOWN patterns** -- genuine zero-day discovery |
| **Panther Labs:** Signature + Python detection rules (known threats only) | **Knowledge graph context** -- LLM reasons with awareness of known TTPs |
| Foundation Models API | **Security-specific RAG pipeline** -- retrieves threat graph context before LLM reasoning |
| MLflow experiment tracking | **Zero-day candidate tracking** with auto-signature generation for future detection |

---

## 7. Negative Correlation Engine

### What It Does (Plain English)

Most security systems look for BAD things happening. Negative Correlation looks for GOOD things NOT happening. If your backup system should report every hour but hasn't reported in 3 hours -- that's suspicious. If a security agent should send heartbeats every 5 minutes but went silent -- an attacker may have killed it. If a user's access token should have been renewed but wasn't -- something is wrong.

### How It Works (Engineering)

**Rule Definition:**
```python
# Each rule defines an expected event and a time window
{
    "name": "Security Agent Heartbeat",
    "expected_event_type": "agent_heartbeat",
    "absence_window_seconds": 600,  # Should see this every 10 min
    "severity": "high",
    "enabled": True
}
```

**Detection Logic:**
```python
for each active rule:
    # Count events of the expected type within the window
    count = SELECT COUNT(*) FROM events
            WHERE event_type = expected_type
            AND timestamp > NOW() - window_seconds

    if count == 0:
        # Check deduplication (don't alert if we already alerted recently)
        recent_detections = SELECT COUNT(*)
            FROM negative_correlation_detections
            WHERE rule_id = this_rule AND detected_at > NOW() - dedup_window

        if recent_detections == 0:
            GENERATE_ALERT()
```

**Deduplication:** Configurable suppression window (default 60 minutes) prevents alert storms when an absence condition persists.

**Example Rules:**
- No heartbeat from critical server in 600 seconds
- No backup confirmation after scheduled window (3600 seconds)
- No authentication renewal within token TTL
- Security agent stopped reporting (300 seconds)
- No DNS resolution activity from endpoint (signs of network isolation by attacker)

### Why It Matters

Sophisticated attackers know that security tools look for malicious ACTIONS. So instead of creating new processes or modifying files (which trigger alerts), they DISABLE security agents, SUPPRESS log forwarding, or INTERFERE with scheduled tasks. The absence of expected activity is often more revealing than the presence of suspicious activity.

### Value Over Databricks Acquisitions

| Databricks Has | 0xDSI Negative Correlation Adds |
|---|---|
| **Panther Labs:** Detection rules fire on events that OCCUR | **Absence-based detection** -- fires when expected events DON'T occur |
| **Lakewatch:** Monitors what happens | **Monitors what SHOULD happen but DIDN'T** -- catches stealth attacks |
| Standard alerting (event-triggered) | **Deduplication-aware absence monitoring** with configurable suppression windows |

---

## 8. Model Disagreement Detection

### What It Does (Plain English)

When multiple detection methods look at the same evidence and DISAGREE -- one says "attack" and another says "benign" -- that disagreement itself is highly informative. It often means: (a) the attack is sophisticated enough to fool some detectors but not others, OR (b) there's a novel situation the models weren't trained for. Either way, a human analyst should look at it.

### How It Works (Engineering)

**Implementation in the Fuse Engine (Dempster-Shafer Theory):**

When combining evidence from multiple independent detection lenses, the Fuse Engine computes **conflict mass (K)**:

```
K = Sum of all mass assigned to contradictory hypotheses
```

Example: 
- Correlation Rules say: "This is lateral movement" (belief = 0.8)
- UEBA says: "This user always does this at this time" (belief = 0.7 for benign)
- Conflict mass K = 0.8 * 0.7 = 0.56

**When K exceeds the conflict threshold (default 0.4):**
1. The Fuse Engine flags `has_disagreement = true`
2. The conflict mass value is recorded
3. Detection Confluence automatically escalates to minimum P2 priority
4. The disagreement is routed for human investigation regardless of the fused score

**Causal Chain Analysis:** The system also checks temporal ordering. If one model detects something BEFORE another contradicts it (e.g., graph patterns detect anomaly first, then UEBA later says "this is normal"), the temporal precedence gives weight to the earlier detection.

### Why It Matters

In machine learning, model disagreement is one of the strongest signals of **epistemic uncertainty** -- the system literally doesn't know the answer. In security, these uncertain cases are EXACTLY where analysts should focus their attention. The boring, clear-cut cases (all models agree) can be handled automatically. The contentious cases need human judgment.

### Value Over Databricks Acquisitions

| Databricks Has | 0xDSI Model Disagreement Adds |
|---|---|
| **Panther Labs:** Single detection pipeline (no disagreement possible) | **Multi-model arbitration** that explicitly surfaces uncertainty |
| **Lakewatch:** Single-agent decision making | **Conflict mass quantification** using Dempster-Shafer belief functions |
| Standard ML confidence scores | **Disagreement as a first-class signal** -- routes to human investigation |

---

## 9. CET/CEP Fusion (Pre-Bronze Stream Processing)

### What It Does (Plain English)

This is the architectural innovation that makes 0xDSI uniquely fast. BEFORE raw events are even stored in the database (Bronze layer), two engines process them simultaneously in a parallel "fast lane":

1. **CET** builds real-time entity graphs and finds attack chains
2. **CEP** matches complex event patterns in sub-second time

Their outputs (trend scores, matched patterns, entity drift signals) land in Bronze ALONGSIDE the raw events, so by the time data reaches the normalization layer, it's already enriched with behavioral intelligence.

### How It Works (Engineering)

```
Raw Kafka Stream ────┬────> CET Engine
                     |       - Builds entity graph (GraphFrames)
                     |       - Finds multi-hop paths (BFS/Kleene-closure)
                     |       - Computes trend scores
                     |       - Identifies attack clusters
                     |       
                     ├────> CEP Engine
                     |       - Pattern matching (temporal windows)
                     |       - Stateful sequence detection
                     |       - Threshold-based correlation
                     |       
                     ├────> Graph CEP (NetworkX)
                     |       - Real-time centrality tracking
                     |       - Community detection drift
                     |       - Path anomaly identification
                     |       
                     └────> Threat Intel Matching
                             - IOC lookup on streaming data
                             - Real-time blocklist enforcement

ALL outputs ──────────────> Bronze Delta Table
                             (raw events + enrichment signals)
```

**Key Design Principle:** The stream processing layer DOES NOT block ingestion. It runs in parallel. If CET takes 2 seconds to find a path, the raw event still lands in Bronze immediately. The CET signal joins it asynchronously.

**Sliding Window Configuration:**
- Default window: 300 seconds (5 minutes)
- Processing trigger: every 30 seconds
- Max files per trigger: 100 (backpressure control)
- Checkpoint: HDFS-backed for exactly-once semantics

### Why It Matters

This is the architectural decision that lets 0xDSI detect attacks BEFORE they're even "officially" in the database. By the time Lakewatch or any downstream tool queries the data, it's already been analyzed for trends and patterns. This isn't just faster -- it fundamentally changes what's possible because the Silver/Gold layers START with enriched data rather than having to re-process everything.

### Value Over Databricks Acquisitions

| Databricks Has | 0xDSI CET/CEP Fusion Adds |
|---|---|
| **Lakewatch:** Processes from Delta tables (storage latency included) | **Pre-storage stream processing** -- analysis happens BEFORE data is written |
| **Panther Labs:** Processes after ingestion | **Parallel enrichment** -- raw events arrive in Bronze ALREADY scored |
| Standard Medallion architecture (Bronze → Silver → Gold) | **Pre-Bronze intelligence layer** that feeds enriched data INTO the Medallion |
| Structured Streaming (generic) | **Security-specific CEP + graph analysis** optimized for attack chain detection |

---

## 10. Swarm Crucible (Genetic Co-Evolution)

### What It Does (Plain English)

Imagine a war game where attacking strategies and defending strategies evolve against each other, like an arms race compressed into minutes instead of years. The Swarm Crucible creates 100 simulated attackers and 100 simulated defenders. They fight. The best attackers and best defenders survive and "breed." After 50 generations of evolution, the Crucible produces:

1. **New attack strategies** the current defenses CAN'T catch (detection gaps)
2. **Improved defense configurations** that catch more attacks with fewer false positives

### How It Works (Engineering)

**Genetic Algorithm with Real Adversarial Evaluation:**

**Red Gene (Attack Strategy):**
```python
{
    "event_sequence": ["lateral_movement", "credential_access", ...],
    "timing_strategy": "slow_drip" | "burst" | "random_jitter",
    "inter_event_delay_s": 120.5,
    "severity_cap": "high",
    "technique": "T1021",
    "evasion_tactics": ["timestomping", "log_deletion", "encryption"],
    "source_rotation": 7  # num IPs to rotate through
}
```

**Blue Gene (Defense Configuration):**
```python
{
    "monitored_event_types": ["auth_failure", "lateral_movement", ...],
    "alert_threshold": 4,
    "time_window_s": 300,
    "min_severity": "medium",
    "correlation_depth": 3,
    "fp_tolerance": 0.08,
    "techniques_covered": ["T1021", "T1059", ...]
}
```

**Fitness Evaluation (REAL, not simulated):**
- Red fitness = evasion rate against ALL active correlation rules AND blue genes
- Blue fitness = detection rate - (2 * false_positive_rate) + technique_coverage_bonus
- Evasion modifiers: slow_drip timing (+20%), IP rotation > 5 (+15%), per evasion tactic (+15%)
- Detection modifiers: technique match (-50% evasion), severity match, threshold fit

**Evolutionary Operators:**
- **Selection:** Tournament (k=3) -- pick 3 random, keep the best
- **Crossover:** 70% probability of gene mixing between parents
- **Mutation:** 8% probability per gene (event sequence, timing, thresholds, etc.)

**50 Generations = 50 * 200 = 10,000 adversarial evaluations** against REAL production correlation rules.

**Output:** Top-5 Red champions (attacks your defenses can't catch) and Top-5 Blue champions (optimal defense configurations). Red champions become new detection test cases; Blue champions can be promoted to production rules.

### Why It Matters

Security teams play defense against an adversary that's constantly evolving. Swarm Crucible is the ONLY way to proactively discover detection gaps BEFORE attackers find them. Instead of waiting for a breach to reveal a weakness, the system manufactures attackers that specifically evolve to exploit your blind spots.

### Value Over Databricks Acquisitions

| Databricks Has | 0xDSI Swarm Crucible Adds |
|---|---|
| **Panther Labs:** Static detection rules written by humans | **Self-evolving detection** that improves without human authoring |
| **Lakewatch:** Agent-based analysis (reactive) | **Proactive gap discovery** -- finds weaknesses BEFORE attackers do |
| Standard ML model training (optimize against fixed dataset) | **Co-evolutionary adversarial training** where attacker and defender improve simultaneously |
| No red team automation | **Genetic algorithm** that generates novel attack strategies no human would think of |

---

## 11. Autonomous Response Learner

### What It Does (Plain English)

When a security alert fires, someone (or something) needs to decide: "What do we DO about this?" The Autonomous Response Learner is an AI that learns from experience which defensive action to take in which situation. It observes the network state (how many hosts are compromised? how many credentials are active?) and decides: wait, isolate a host, revoke credentials, or rebuild everything. Over time, through trial and error in simulation, it learns the optimal policy.

### How It Works (Engineering)

**Research Foundation:** Apple AISec '22 paper "Bridging Automated to Autonomous Cyber Defense"

**State Space:** Percentile-bucket encoding (topology-agnostic)
- s1 = percentile bucket of alerted hosts ratio
- s2 = percentile bucket of online hosts ratio
- s3 = percentile bucket of recent credential usage ratio
- s4 = percentile bucket of active credentials ratio
- Total state space: 5^4 = 625 states (regardless of network size)

**Action Space:** 4 abstract actions
- `wait` -- do nothing, continue monitoring
- `isolate_host` -- quarantine the most suspicious host
- `revoke_credentials` -- invalidate credentials used on compromised systems
- `rebuild_all` -- nuclear option, rebuild all hosts (high availability cost)

**High-Avoidance Update Function:**
```python
# Standard Bellman equation:
Q(s,a) += lr * (reward + gamma * max(Q(s',a')) - Q(s,a))

# High-Avoidance modification:
if episode_lost:
    Q(s,a) = -infinity  # PERMANENTLY blacklist this state-action pair
    for all a' != rebuild_all:
        Q(s_terminal, a') = -infinity  # Blacklist the losing state
```

This reduces loss probability from 40% (standard Q-learning) to 7%.

**Reward Function:**
```
reward = availability_score - compromise_penalty + defense_bonus
```
- availability_score: Fraction of hosts online and productive
- compromise_penalty: Compromised hosts count as offline
- defense_bonus: +1/total_hosts if defensive action removed attacker access

**Training:** 3-phase (paper Section 4.3):
1. **Exploration (70%):** Short episodes, 95% random actions (learn the state space)
2. **Epsilon-Greedy (25%):** Decay from 90% to 10% random (refine the policy)
3. **Exploitation (5%):** Pure greedy (polish the final policy)

**Safety Guarantees:**
- Critical actions (rebuild_all, isolate high-value assets) require human approval
- Confidence threshold: Only acts autonomously when Q-value confidence exceeds 0.7
- Full audit trail: Every decision logged with state, action, reward, and Q-value
- Analyst feedback loop: Human overrides feed back as negative reward signals

### Why It Matters

Today, most security response is either fully manual (slow) or fully scripted (rigid). ARL learns a FLEXIBLE policy that adapts to the specific network state. It knows when to be aggressive (high compromise, isolate immediately) and when to be patient (low confidence, wait for more data). It's the bridge between "alert fires and human investigates" and "alert fires and system automatically contains."

### Value Over Databricks Acquisitions

| Databricks Has | 0xDSI ARL Adds |
|---|---|
| **Panther Labs:** Manual response playbooks | **Learned response policy** that adapts to network state |
| **Lakewatch:** Agentic investigation (no action execution) | **Autonomous containment** with safety rails and human override |
| Standard automation (if-then scripting) | **Reinforcement learning** from simulated adversarial episodes |
| No feedback integration | **Analyst Learning from Human Feedback (ALHF)** -- corrections improve the policy online |

---

## 12. All Agents (60 Specialized AI Workers)

The 0xDSI engine deploys **60 specialized agents**, each responsible for a specific function. They're coordinated by a **Multi-Agent Orchestrator** using LangGraph-style routing. Think of them as a 60-person SOC team that never sleeps, never forgets, and processes millions of events per day.

### Agent Categories

#### SOC Operations Core (Agents 01-07)

| # | Agent | What It Does | Use Case |
|---|-------|-------------|----------|
| 01 | **Triage Agent** | Classifies alerts as True Positive, False Positive, or Needs Investigation using hybrid rule+LLM approach | Reduces analyst workload by 70-80% by auto-classifying obvious cases |
| 02 | **Enrichment Agent** | Adds threat intel, asset context, related events, and risk narrative to triaged alerts | Analyst sees full context without manual lookups |
| 03 | **Threat Hunter** | Generates hunt hypotheses from alerts + CTI feeds, executes structured SQL hunts | Proactive threat hunting without dedicated hunter staff |
| 04 | **Multi-Agent Orchestrator** | Coordinates all agents using dynamic routing and hybrid execution strategies | Central nervous system -- ensures right agent handles right task |
| 05 | **SAGE (Enrichment Specialist)** | Builds comprehensive context with threat intel and behavioral analysis | Deep enrichment for complex investigations |
| 06 | **NOVA (Investigation)** | Deep hypothesis-driven hunts, kill chain analysis, attack path reconstruction | Full investigation without human analyst |
| 07 | **VANGUARD (Response)** | Orchestrates containment and remediation with full audit trail | Executes response actions with rollback capability |

#### Intelligence & Attribution (Agents 08-10)

| # | Agent | What It Does | Use Case |
|---|-------|-------------|----------|
| 08 | **CTI Attribution** | Correlates IOCs across feeds, attributes campaigns, analyzes TTP overlap | "Who is behind this attack?" answered in seconds |
| 09 | **Pattern Discovery** | Statistical anomaly detection with analyst-friendly explanations + rule candidates | Discovers detection rules humans wouldn't write |
| 10 | **Vector Memory** | Embeds alerts into vector indices for semantic similarity and deduplication | "Have we seen something like this before?" |

#### Adversary Simulation (Agents 11-12)

| # | Agent | What It Does | Use Case |
|---|-------|-------------|----------|
| 11 | **Red Team** | Atomic Red Team integration, detection gap analysis against MITRE ATT&CK | Validates detection coverage continuously |
| 12 | **Blue Team Validation** | Analyzes coverage matrix, identifies gaps, calculates MTTD per severity | "Where are our blind spots?" |

#### Digital Forensics & Deception (Agents 13-14)

| # | Agent | What It Does | Use Case |
|---|-------|-------------|----------|
| 13 | **Forensics** | Automated evidence preservation, chain of custody, forensic report generation | Legal-grade evidence collection without forensics specialist |
| 14 | **Honeypot Monitor** | Monitors deception tech for high-fidelity attack detection, actor TTP correlation | Zero-false-positive detections from deception traps |

#### Executive & Documentation (Agents 15-18)

| # | Agent | What It Does | Use Case |
|---|-------|-------------|----------|
| 15 | **CISO Assistant** | Strategic briefings, risk posture assessment, board presentation generation | C-level security communication without translation effort |
| 16 | **Playbook Generator** | Creates incident response playbooks on demand with decision trees | New threat = instant playbook, no manual authoring |
| 17 | **Incident Summarizer** | Executive and technical summaries with business impact scoring | Stakeholder communication in minutes, not hours |
| 18 | **Document Analyzer** | Extracts security-relevant info from PDFs, reports, threat briefs | Automated threat brief processing |

#### Advanced Threat Detection (Agents 19-22)

| # | Agent | What It Does | Use Case |
|---|-------|-------------|----------|
| 19 | **Malware Sandbox** | Behavioral analysis of samples, YARA rule generation from execution results | Automated malware classification without reverse engineering |
| 20 | **LLM Guardrails** | Monitors LLM usage for prompt injection, PII leakage, jailbreak attempts | Protects AI infrastructure from weaponization |
| 21 | **Model Poisoning Guard** | Monitors ML model integrity for drift, data poisoning, prediction anomalies | Prevents attackers from corrupting AI defenses |
| 22 | **Threat Simulator** | MITRE ATT&CK-based multi-stage attack simulation planning | "What would a sophisticated attacker do to US?" |

#### Data Pipeline & Integration (Agents 23, 29, 31, 49)

| # | Agent | What It Does | Use Case |
|---|-------|-------------|----------|
| 23 | **Connector Health** | Monitors data sources for staleness, gaps, and schema drift | Ensures no blind spots from broken connectors |
| 29 | **Connector Versioning** | Checks for connector updates and breaking changes | Prevents data loss from version incompatibilities |
| 31 | **Vibe Connector Builder** | Generates connector code from natural language descriptions | "Connect to our custom API" without manual coding |
| 49 | **Edge Control Plane** | Manages edge collector lifecycle: registration, heartbeat, config sync, upgrades | Fleet management for distributed collectors |

#### Intelligence Feeds & Scoring (Agents 24-28)

| # | Agent | What It Does | Use Case |
|---|-------|-------------|----------|
| 24 | **Threat Radar** | Tracks emerging threats, assesses organizational exposure, correlates external+internal | "What's trending in the threat landscape that affects US?" |
| 25 | **ALHF Learning** | Learns from analyst feedback, generates updated classification rules | System gets smarter with every human interaction |
| 26 | **Real-Time Graph CEP** | In-memory entity graphs with centrality drift and path anomaly detection | Real-time relationship change detection |
| 27 | **Vector Scoring** | Composite threat scores via embedding distance to known-bad patterns | Mathematical similarity to known threats |
| 28 | **AI Correlation** | LLM-discovered correlations between alerts, generates rule candidates | AI finds patterns humans didn't program |

#### Advanced Security Domains (Agents 30, 38-40, 43-44)

| # | Agent | What It Does | Use Case |
|---|-------|-------------|----------|
| 30 | **Stateful Backdoor Defense** | State machines for C2 beaconing patterns with jitter and periodicity analysis | Catches slow-and-low command-and-control communication |
| 38 | **Session List Manager** | Detects session anomalies: impossible travel, concurrent sessions, hijacking | Identity-based attack detection |
| 39 | **Active List Manager** | Dynamic watchlists/whitelists/blocklists with auto-expiration and behavioral promotion | Adaptive access control based on behavior |
| 40 | **LLM Risk Profiler** | Profiles organizational LLM usage for sensitive data exposure and shadow AI | Visibility into AI-related risks |
| 43 | **Guardian Compliance** | Monitors against SOC2, ISO27001, PCI-DSS, HIPAA, NIST with gap identification | Continuous compliance without manual audits |
| 44 | **OT Protocol Security** | Monitors PLC/OT traffic for ICS-targeted attacks using behavioral baselines | Industrial control system protection |

#### Knowledge & Memory (Agent 42)

| # | Agent | What It Does | Use Case |
|---|-------|-------------|----------|
| 42 | **Knowledge Store** | Indexes resolved incidents, runbooks, and analyst notes for RAG retrieval | Institutional memory that never forgets |

#### Vulnerability Management (Agents 32-37, 41, 45)

| # | Agent | What It Does | Use Case |
|---|-------|-------------|----------|
| 32 | **Vector Search Index** | Maintains Vector Search indexes for semantic vulnerability search | "Find vulnerabilities similar to this one" |
| 33 | **Glasswing Ingest** | Normalizes vulnerability scan results from multiple scanners | Unified vulnerability view across all scanners |
| 34 | **Glasswing Dedup** | Deduplicates findings across scanners using semantic similarity | Eliminates duplicate work from overlapping scan tools |
| 35 | **Glasswing Reachability** | Determines if vulnerable assets are reachable from attack surfaces | "Is this vulnerability actually exploitable?" |
| 36 | **Glasswing Blast Radius** | Maps trust relationships and lateral movement paths from vulnerable assets | "If exploited, how far can the attacker go?" |
| 37 | **Glasswing Auto-Patch** | Generates patching priorities with compatibility assessment | Risk-based patch prioritization without manual analysis |
| 41 | **Glasswing Scanner Orchestrator** | Manages scanning schedules, scanner health, and completion tracking | Automated scan fleet management |
| 45 | **ExploitForge** | AI-driven exploit chain analysis with progressive primitive escalation | "How would an attacker chain these vulns together?" |

#### Human Factors & Phishing (Agents 46, 48, 53, 55)

| # | Agent | What It Does | Use Case |
|---|-------|-------------|----------|
| 46 | **Communication Analyzer** | Analyzes email/Slack/Teams for psychological and behavioral risk indicators | Insider threat detection via communication patterns |
| 48 | **UEBA Entity Onboarding** | Manages entity population via IdP sync, HR feeds, and deduplication | Complete user/entity inventory for behavioral analysis |
| 53 | **Phishing Campaign Engine** | Orchestrates red-team phishing campaigns correlating personality and threat TTPs | Tests human vulnerability to social engineering |
| 55 | **Phishing Response Analyzer** | Tracks campaign interactions, updates user vulnerability profiles | Measures and improves human security awareness |

#### AI Security (Agents 56-58)

| # | Agent | What It Does | Use Case |
|---|-------|-------------|----------|
| 56 | **AI Gateway Guardian** | Policy enforcement with jailbreak detection, drift monitoring, insider threat signals | Secures the AI infrastructure itself |
| 57 | **Shadow AI Detector** | Identifies unauthorized AI via DNS, network, and behavioral analysis | Finds employees using unapproved AI tools |
| 58 | **Prompt Forensics** | Indexes AI traffic for forensic analysis with topic classification and cost attribution | "Who asked the AI to do WHAT?" |

#### Predictive & Learning (Agents 47, 59-60)

| # | Agent | What It Does | Use Case |
|---|-------|-------------|----------|
| 47 | **Autonomous Response Learner** | RL-based defensive action selection with high-avoidance policy | Autonomous containment that learns from experience |
| 59 | **Vector Pattern Similarity** | Cosine similarity between current threats and historical embeddings | Pattern matching against the full threat history |
| 60 | **Attack Path Forecaster** | Monte Carlo simulation + vector similarity for real-time path prediction | "Where is this attack GOING next?" |

---

## Summary: Why This Matters for Databricks

Databricks has acquired world-class capabilities:
- **Lakewatch** (March 2026): Agentic SIEM with natural-language security operations
- **Panther Labs** ($1.4B, June 2026): Cloud-native AI SOC platform
- **SiftD.ai** (March 2026): Notebook-first security UX
- **Antimatter** (2025): Cryptographic privacy for sensitive data

**What 0xDSI adds that NONE of these acquisitions provide:**

| Capability Gap | 0xDSI Solution |
|---|---|
| Pre-storage detection (sub-second) | CET/CEP Fusion on raw Kafka stream |
| Multi-model fusion with disagreement routing | 7-lens Detection Confluence + Fuse Engine |
| Long-term per-entity behavioral memory | MC-RNN with 30-day cache checkpoints |
| Absence-based detection | Negative Correlation Engine |
| Self-evolving detection rules | Swarm Crucible genetic co-evolution |
| Autonomous response with safety rails | ARL (RL with High-Avoidance) |
| Zero-day discovery via reasoning | GraphRAG + LLM analysis |
| Institutional memory across incidents | Knowledge Store with RAG retrieval |
| 60-agent orchestrated workforce | Multi-Agent Orchestrator with dynamic routing |
| Proactive gap discovery | Red/Blue co-evolution before attackers find weaknesses |

The combined platform would represent the most comprehensive security analytics engine ever built on a lakehouse architecture -- detection intelligence that starts BEFORE data hits storage, learns from every interaction, and evolves its own defenses faster than adversaries can adapt.
