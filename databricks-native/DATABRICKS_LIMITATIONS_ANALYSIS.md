# Databricks-Native Limitations: How 0xDSI Addresses Them

**Scope:** This document answers a specific architecture question raised while reviewing the GitHub
codebase and the well-known limitations of building a security platform natively on Databricks:

> *Can Real-Time Mode solve limitation #1 (no true real-time streaming agents)?
> Can Lakebase solve limitation #4 (no persistent agent state between runs)?
> And where does the CET (Trend Engine) fit?*

Every claim below is grounded in the actual `databricks-native/` code. File paths and the relevant
constructs are cited inline so the analysis can be verified against source.

---

## Executive Summary

| # | Common Databricks-Native Limitation | Status in 0xDSI | Primary Mechanism |
|---|-------------------------------------|-----------------|-------------------|
| 1 | No true real-time streaming agents (batch micro-windows) | **Mostly solved on the detection plane** | SDP ZeroBus/Kafka bypass (`_shared/sdp_stream.py`); Real-Time Mode is an *accelerator*, not the mechanism |
| 2 | UC Function call overhead (200–500 ms) | **Mitigated** | In-notebook helpers + cached lookups instead of per-call UC functions |
| 3 | Foundation Model rate limits | **Mitigated** | Tiered primary/fallback routing + token budgets (`_shared/llm_client.py`) |
| 4 | No persistent agent state between runs | **Solved** | Delta baseline snapshot/reload (Agent 26) + Lakebase CDC serving tables (`ingestion/07_lakebase_sync.py`) + MC-RNN online state (`memory_cache/70`) |
| 5 | Cold start for scale-to-zero endpoints | **Accepted trade-off, managed** | `scale_to_zero_enabled=True` on serving endpoints; hot paths kept on always-on streams |
| 6 | Network isolation in managed VPCs | **Solved by design** | Edge collectors push in; no inbound polling from the lakehouse |

**The two headline answers:**

- **Real-Time Mode → limitation #1: a qualified yes.** Real-Time Mode lowers the micro-batch floor
  toward sub-second, but the codebase *already* achieves sub-second detection through a different
  mechanism — the **SDP path reads straight from ZeroBus (Kafka), bypassing the Delta events table**.
  Real-Time Mode makes the *streaming detectors* faster; it does **not** convert the LLM *reasoning*
  agents into real-time components (those are bounded by inference latency, not the stream trigger).

- **Lakebase → limitation #4: yes.** Lakebase gives agents a low-latency, persistent serving store
  for hot state, and the codebase already scaffolds it (`ingestion/07_lakebase_sync.py`). Today the
  *actual* cross-run persistence is done via Delta snapshot-and-reload (Agent 26's
  `graph_cep_baseline`); Lakebase upgrades that hot-state path from high-latency Delta I/O to
  point-lookup latency. Keep syncing back to Delta for the audit trail.

---

## Architectural Context: Two Planes

0xDSI is not a single batch pipeline. It splits into two planes with very different latency profiles,
and most confusion about "real-time on Databricks" comes from conflating them.

```
                     ┌─────────────────────────────────────────────┐
                     │  DETECTION PLANE  (sub-second → 30 s)         │
   ZeroBus / Kafka ─▶│  sdp_stream.py → correlation, temporal,      │
                     │  threat-intel matching, realtime_graph_cep,  │
                     │  CET trend engine                            │
                     └───────────────┬─────────────────────────────┘
                                     │ writes findings to Delta
                                     ▼
                     ┌─────────────────────────────────────────────┐
                     │  COGNITIVE PLANE  (seconds → minutes)        │
                     │  TRIAGE, SAGE, NOVA, VANGUARD LLM agents     │
                     │  bounded by inference + tool-call latency    │
                     └─────────────────────────────────────────────┘
```

The detection plane can be real-time. The cognitive plane cannot be *forced* real-time by any stream
setting, because its latency is dominated by Foundation Model inference. This distinction drives every
answer below.

---

## Limitation #1 — No True Real-Time Streaming Agents

### The limitation as stated
Databricks notebooks execute in batch micro-windows with a practical ~1–5 minute minimum interval;
truly sub-second processing usually pushes teams toward Flink/Kafka Streams.

### What the codebase actually does
The limitation is only true for the **scheduled-notebook** model. 0xDSI sidesteps it on the detection
plane with a dedicated Kafka-bypass path.

- **`_shared/sdp_stream.py`** — the Streaming Detection Pipeline reads *directly from ZeroBus/Kafka*
  via `spark.readStream.format("kafka")`, parses the `ZEROBUS_EVENT_SCHEMA`, normalizes, and applies a
  watermark. Its explicit purpose is to *bypass Delta table latency for sub-second detection*.
  `create_sdp_stream_with_fallback(...)` returns a `(stream, source)` tuple where `source` is
  `"kafka"` when ZeroBus is reachable and `"delta"` (30–90 s) as a graceful fallback.
- This SDP stream feeds the streaming correlation engine, the temporal window correlator, threat-intel
  matching, and the real-time graph CEP (Agent 26).

So the platform's real-time answer is **not** "run notebooks faster" — it is "read the event bus
directly, the way a Flink/Kafka Streams job would, but inside Structured Streaming."

### Where the current micro-batch floor sits
The graph and trend layers currently run at a **30-second micro-batch trigger**, not sub-second:

- `agents/26_realtime_graph_cep.py` uses `.trigger(processingTime="30 seconds")`.
- `analytics/01_trend_engine_cet.py` (CET) also uses `.trigger(processingTime="30 seconds")`.

These are deliberate: graph construction and multi-hop path search are heavier than single-event
matching, and 30 s balances freshness against cluster cost.

### Can Real-Time Mode solve #1?
**Qualified yes — for the detection plane.**

- **What Real-Time Mode fixes:** It collapses the Structured Streaming micro-batch trigger toward
  continuous, sub-second execution. Applied to the SDP stream, the correlation engine, and the graph
  CEP, it turns the current 30-second cadence into sub-second **without** leaving Databricks or
  bolting on external Flink/Kafka Streams infrastructure. This is a genuine, material win for the
  detectors.

- **What Real-Time Mode does NOT fix:** The LLM *reasoning* agents (TRIAGE, SAGE, NOVA, VANGUARD) are
  gated by Foundation Model inference time and tool-call round-trips (limitations #2 and #3), not by
  the stream trigger. Real-Time Mode cannot make a multi-step, multi-tool LLM investigation loop
  sub-second. Those agents stay in the seconds-to-minutes range regardless of stream settings.

**Bottom line:** Real-Time Mode is an accelerator for the mechanism the codebase already relies on
(the SDP Kafka bypass), moving detection from ~30 s to sub-second. It is not, by itself, "true
real-time agents" end-to-end, because the cognitive plane is inference-bound.

### Where CET fits limitation #1
CET (`analytics/01_trend_engine_cet.py`) is the multi-hop **trend/graph analytic layer** on top of the
stream, and it is central to why "real-time" here means more than single-event alerting:

- It uses **GraphFrames** — `GraphFrame(vertices, all_edges)`, `connectedComponents()`, and motif
  matching (`.find("(a)-[e1]->(b); (b)-[e2]->(c)")`) — to detect 2-hop and 3-hop attack paths
  (lateral movement T1021/T1076/T1550, privilege escalation T1068/T1134/T1548, exfiltration
  T1041/T1048/T1567, persistence T1053/T1547/T1543) over a sliding window.
- It scores paths (`hops/max_h × severity/5 × time-decay`) and thresholds on `min_score`.
- It is MLflow-tracked and emits `trend_complete`, `trend_partial`, `trend_graphlets`,
  `trend_graph_nodes`, `trend_graph_edges`, and `trend_runtime_metrics`.

Two honest caveats for CET under Real-Time Mode:
1. CET answers "real-time *pattern* detection" (compounding multi-event chains), which is what a
   "streaming agent" is usually really wanted for — not just faster single-event matching.
2. CET rebuilds its GraphFrames vertices/edges per window (immutable rebuild). To make CET itself
   sub-second, the right move is to push its motif detection onto the **incremental driver-side graph**
   that Agent 26 already maintains (see #4), rather than re-materializing GraphFrames every batch.
   Real-Time Mode helps, but the graph-rebuild cost is the real ceiling for sub-second CET.

---

## Limitation #2 — UC Function Call Overhead (200–500 ms)

### The limitation
Each Unity Catalog function invocation routes through the SQL Warehouse and adds 200–500 ms —
crippling when an agent needs many lookups per event.

### What the codebase does
Agents avoid the per-call UC-function tax by using **in-notebook Python helpers and cached lookups**
against Delta rather than round-tripping through UC functions inside hot loops. Shared logic lives in
`_shared/` (e.g. `delta_helpers.py`, `sql_safe.py`) and is called in-process. Enrichment reference
data is loaded once per micro-batch and joined, not fetched row-by-row.

**Impact on #1:** this is why Real-Time Mode alone can't make the cognitive plane real-time — even
without UC-function overhead, inference latency dominates. But for the detection plane, keeping lookups
in-process is what makes a 30 s (soon sub-second) trigger feasible at all.

---

## Limitation #3 — Foundation Model Rate Limits

### The limitation
Shared Foundation Model endpoints impose rate limits; a burst of alerts can exhaust throughput and
stall agents.

### What the codebase does
`_shared/llm_client.py` is a single wrapper every agent uses instead of calling model endpoints
directly. It implements:

- **Tiered routing** — a Tier 1 primary endpoint for general SOC reasoning and a Tier 2
  cost-effective **fallback** endpoint, with `fallback_used` surfaced on the normalized response.
- **Automatic retry with exponential backoff** (3 attempts) on the primary before falling back.
- **Token budget management** (`TokenBudget`) tracked per run, so a runaway agent can't exhaust the
  shared quota.
- **Specialized endpoint routing** for psychological/NLP analysis (`PSYCH_ENDPOINT_DEFAULT`) and
  embeddings (`EMBEDDING_ENDPOINT_DEFAULT`), overridable via `system_settings`.

This turns rate limits from a hard failure into graceful degradation (slower / cheaper model) rather
than a stalled pipeline.

---

## Limitation #4 — No Persistent Agent State Between Runs

### The limitation
Each notebook run starts fresh; there is no built-in memory across runs, so any agent state must be
explicitly persisted (typically to Delta) and reloaded.

### What the codebase does today (Delta snapshot + reload)
This is **solved**, and Agent 26 is the clearest proof:

- `agents/26_realtime_graph_cep.py` maintains a **driver-side persistent NetworkX graph**
  (`StreamingGraphState`, a thread-safe `DiGraph` with TTL edge decay and `max_graph_nodes=500000`).
  This in-memory graph is volatile — exactly the limitation.
- On startup it **rehydrates from Delta**: it reads the latest `metrics_json` row from the
  `graph_cep_baseline` table and restores `_baseline_centrality` and `_baseline_edges`. Spark
  checkpointing (`checkpointLocation`) restores stream offsets. So a restarted run resumes with its
  prior baseline instead of starting cold.
- The broader agent framework (`_shared/agent_framework.py`) follows the same discipline: fetch
  unprocessed items from Delta → process → write results back to Delta. State lives in Delta between
  runs; there is no reliance on in-memory persistence surviving a restart.

There is also a **model-serving flavor** of persistent state in the Memory-Cache RNN:
`memory_cache/70_mc_serving_endpoint.py` wraps the MC-RNN as an MLflow PyFunc that performs
**per-entity state load/save on each request** (`entity_states` keyed by `entity_id`), returning
`anomaly_scores + cache_attention + updated_state`. That is agent memory carried across invocations at
serving time.

### Can Lakebase solve #4?
**Yes — and the scaffold already exists.**

`ingestion/07_lakebase_sync.py` materializes Delta tables into low-latency `lakebase_*` serving tables
via **Delta Change Data Feed (CDF)**:

- `LAKEBASE_SYNC_CONFIG` classifies tables into **CDC/real-time** (session_lists, active_lists, alerts,
  cases), **incremental/1-min** (events, threat_feeds), and **full/hourly** (correlation_rules).
- `start_cdc_stream` reads `.option("readChangeFeed", "true")`, MERGE-upserts by key, handles
  soft/hard deletes, and runs at `.trigger(processingTime="10 seconds")`.
- `ensure_serving_table` sets `delta.enableChangeDataFeed=true` plus auto-optimize; `run_full_sync`
  runs `OPTIMIZE ... ZORDER BY` for fast point lookups. Serving tables are Delta by default, with an
  optional JDBC/Postgres target (disabled unless secrets are present).

**Why Lakebase is the right tool for #4:** Delta snapshot-and-reload works and gives you time-travel
auditability, but Delta reload is high-latency, coarse (snapshot-per-N-batches) I/O. For state that
changes *every* batch — session lists, active lists, per-entity counters, "last seen" timestamps, and
CET partial-trend chains — round-tripping through Delta is the bottleneck. Lakebase provides the
low-latency read/write serving layer agents want for **hot** state.

**Recommended pattern:**
1. Use **Lakebase as the hot-state store** for fast point-lookup/upsert of agent memory between runs.
2. Keep the **Delta CDF sync** (`07_lakebase_sync.py` already does this) so the versioned audit trail
   is preserved. Do not replace Delta with Lakebase — pair them.

So the precise answer: **Lakebase solves #4 for hot serving state, provided you keep syncing back to
Delta for audit.** It is not "replace Delta," it is "add a low-latency serving tier in front of it."

### Where CET fits limitation #4
CET is the best stress test for the Lakebase decision. Its `trend_graphlets` **reuse-ratio** metric
exists precisely because graphlets are meant to *persist and be reused across windows*. Today that is a
Delta append. But CET's `trend_partial` chains — partial lateral-movement paths waiting to reach
`min_hops` — are exactly the cross-run agent memory that belongs in Lakebase: a partial chain detected
at time *T* should still be "warm" at *T+1* without a full Delta scan. Moving `trend_partial` and
graphlet state into a `lakebase_*` table is the concrete win, and it compounds with the incremental
graph improvement noted under #1.

---

## Limitation #5 — Cold Start for Scale-to-Zero Endpoints

### The limitation
Serving endpoints configured to scale to zero incur a cold-start penalty (seconds to tens of seconds)
on the first request after idling.

### What the codebase does
`setup/04_register_model_serving.py` registers the agent endpoints (e.g. `0xdsi_vanguard_response`
for Agent 07) with `workload_size="Small"` and **`scale_to_zero_enabled=True`** — an explicit,
accepted cost trade-off, logged as "scale-to-zero enabled" at creation.

The mitigation is architectural: **the latency-critical paths do not depend on scale-to-zero
endpoints.** Detection runs on always-on Structured Streaming (the SDP path), so first-event latency
is never gated by an endpoint cold start. Scale-to-zero applies to the on-demand cognitive/serving
endpoints, where a cold start on an occasional invocation is acceptable. If a given endpoint must stay
warm, the fix is a provisioned floor (disable scale-to-zero or set a minimum) for that endpoint only —
a per-endpoint decision, not a platform-wide one.

---

## Limitation #6 — Network Isolation in Managed VPCs

### The limitation
Managed Databricks VPCs restrict outbound/inbound connectivity, making it hard for the lakehouse to
reach into customer networks to pull telemetry.

### What the codebase does
This is **solved by inverting the direction of data flow.** Instead of the lakehouse polling into
isolated networks, the **edge collectors push data out** to the event bus:

- The `edge-collector/` and `0xdsi-edge/` Rust fleets run *inside* the customer environment, normalize
  to OCSF at the edge, and ship to ZeroBus/Kafka/Event Hub (`edge-collector/crates/transport/`:
  `kafka.rs`, `eventhub.rs`, `http.rs`).
- Ingestion notebooks (`ingestion/05_kafka_eventhub_connector.py`, `09_edge_collector_framework.py`)
  and the SDP stream then consume from that bus.

Because the lakehouse only ever *receives* from the bus and never initiates inbound connections into
customer VPCs, managed-VPC network isolation stops being a blocker — the isolation boundary is
respected by design.

---

## Consolidated Recommendations

1. **Enable Real-Time Mode on the SDP-fed streams first** (correlation engine, `realtime_graph_cep`,
   CET). This is where it pays off — sub-second detection with no new infrastructure. Do **not** expect
   it to make the LLM agents real-time.
2. **Adopt Lakebase for hot agent state**, starting with session/active lists and CET
   `trend_partial`/graphlet state. Keep the Delta CDF sync for audit/time-travel. `07_lakebase_sync.py`
   is the foundation to build on.
3. **Make CET incremental.** Move CET's motif detection onto Agent 26's driver-side incremental graph
   instead of per-window GraphFrames rebuilds — this is the true ceiling for sub-second CET, above and
   beyond Real-Time Mode.
4. **Keep the cognitive plane honest.** Continue leaning on `llm_client.py` tiered fallback + token
   budgets; treat agent reasoning as seconds-to-minutes, not real-time, and design SLAs accordingly.
5. **Leave hot paths off scale-to-zero.** Detection stays on always-on streams; reserve scale-to-zero
   for on-demand endpoints and add a warm floor only where a specific endpoint's cold start hurts.

---

## Source Map (for verification)

| Concern | File | Key construct |
|---------|------|---------------|
| Sub-second ingest (real #1 mechanism) | `_shared/sdp_stream.py` | `create_sdp_stream_with_fallback`, Kafka `readStream` |
| Trend/graph analytics (CET) | `analytics/01_trend_engine_cet.py` | GraphFrames motifs, `trigger(processingTime="30 seconds")` |
| Persistent graph state (#4) | `agents/26_realtime_graph_cep.py` | `StreamingGraphState`, `graph_cep_baseline` reload |
| Lakebase serving state (#4) | `ingestion/07_lakebase_sync.py` | CDF `readChangeFeed`, MERGE, `ZORDER`, 10 s trigger |
| Online per-entity memory (#4) | `memory_cache/70_mc_serving_endpoint.py` | `entity_states` load/save per request |
| FM rate-limit handling (#3) | `_shared/llm_client.py` | tiered primary/fallback, retry, `TokenBudget` |
| Scale-to-zero endpoints (#5) | `setup/04_register_model_serving.py` | `scale_to_zero_enabled=True` |
| Edge push ingest (#6) | `edge-collector/crates/transport/` | `kafka.rs`, `eventhub.rs`, `http.rs` |
| Delta-backed agent loop | `_shared/agent_framework.py` | fetch-from-Delta → process → write-back |
