# Databricks-Native Artifacts — Blunt Production-Readiness Assessment

**Question 1:** Are the databricks-native notebooks/agents *really* production-grade?
**Question 2:** If a customer downloads the git and installs the asset bundle, will they catch real threats?

**One-line answer:** The **engineering is production-grade; the out-of-the-box deployment is a demo.** A customer who installs the bundle as-is will detect threats in *synthetic seed data*, not in their environment. Getting to real detections is weeks of onboarding — real, but not "download-and-go."

---

## What IS genuinely production-grade (verified in the code)

These are not mocks. I read the actual files.

- **Ingestion (`ingestion/01_raw_event_ingestion.py`, 532 lines):** Real Spark Structured Streaming from Kafka / Event Hubs / Kinesis / Autoloader, SASL_SSL auth pulled from a secrets manager, PERMISSIVE parsing with a dead-letter queue for corrupt records, backpressure via `maxOffsetsPerTrigger`, checkpointing. This is how you actually build production ingestion.
- **Agent framework (`_shared/agent_framework.py`, 701 lines):** Real base classes (`BatchAgent`, interactive `ChatModel` agents, supervisor pattern), standardized `AgentResult` with trace IDs, graceful degradation on LLM failure, Unity Catalog function tools, MLflow tracing.
- **Detection ML (`detection/01_behavioral_anomaly_detection.py`, 498 lines):** A genuine KMeans + Kolmogorov-Smirnov + Isolation Forest ensemble over generic behavioral features (event counts, unique IPs, off-hours activity, failure ratios). Critically, this is **unsupervised and data-agnostic** — it runs on *any* events in the bronze table, not hardcoded to demo rows.
- **Threat-intel matching (`detection/02_threat_intel_matching.py`):** Real streaming IOC join with confidence decay, dedup, broadcast optimization, and a `require_tables` guard.
- **LLM triage (`agents/01_triage_agent.py`, 526 lines):** Hybrid fast-path rule FP-suppression + LLM slow-path classification with JSON mode, MERGE-based auto-close, token budgeting.
- **Asset bundle (`resources/jobs.yml`, 2,609 lines):** ~60 jobs wired correctly — continuous streaming jobs with health rules, cron-scheduled batch jobs, and a **dependency-ordered master pipeline** (detection → unified-evidence → Dempster-Shafer fuse → confluence → triage → dedup → response). This is real orchestration.

**Verdict on Q1:** As a codebase / reference architecture, yes — this is well above typical "accelerator" quality. It would pass an engineering review.

---

## What makes it NOT a working threat-detection deployment yet

The gap is not code quality — it's everything that turns code into a live SOC.

1. **It seeds fake data by default.** `setup/02_seed_demo_data.py` populates fake users ("Carlos Silva", "Ana Torres", …) and synthetic events. The `initial_setup` job in the bundle runs this seed. So immediately after `databricks bundle deploy`, every "alert" is about a fictional person. It's a convincing demo, not a detection.

2. **No real data is connected.** The bronze `events` table is fed by streaming sources the customer must stand up: their Kafka/Event Hub topics, or the Rust edge-collector connectors pointed at their Splunk / Sentinel / Defender / Palo Alto / cloud logs. None of that is wired by the bundle. Until real telemetry lands in `events`, the detections have nothing real to analyze.

3. **Secrets and endpoints are unset.** Kafka credentials, threat-intel API keys (OTX / VirusTotal / MISP), Foundation Model endpoints for the LLM agents, notification/ticketing tokens — all read from a secret scope the customer must create and populate. Missing secrets = jobs that no-op or fail.

4. **Detections are untuned.** Isolation Forest contamination (0.05), KS alpha (0.01), fusion/escalation thresholds (0.78), auto-response threshold (0.9) are sensible *defaults*, not values calibrated to a customer's baseline. On real traffic, day one, unsupervised models produce noise until they've learned a normal baseline and the thresholds are tuned. This is the single biggest "it detects, but is it *right*?" risk.

5. **Efficacy is unproven, only wiring is tested.** The smoke test (`tests/smoke_test_e2e_pipeline.py`) injects one synthetic event with a known IOC and checks that an alert → triage → response row appears. That proves the plumbing moves data end-to-end. It does **not** measure detection accuracy, false-positive rate, or coverage against real attack techniques. There is no labeled evaluation set or detection-efficacy harness.

6. **Auto-response is armed.** The master pipeline ends in `automated_response` at a 0.9 threshold. Pointed at real infrastructure before tuning, that can take real actions on false positives. It must start in dry-run/approval-only mode.

**Verdict on Q2:** As shipped, a customer catches *demo* threats. To catch *real* threats they must complete the onboarding below. The good news: because the ML and correlation are data-agnostic, once real data flows and thresholds are tuned, the same artifacts genuinely will surface real anomalies and IOC hits — no rewrite needed.

---

## Productionization plan (what "necessary" looks like)

**Phase 0 — Honest framing (immediately).** In the README and any customer-facing deck, label the seed path "DEMO MODE" and state plainly that live detection requires the steps below. Do not let "download the bundle" imply "catching threats."

**Phase 1 — Connect one real source (1–2 weeks).**
- Stand up a secret scope; populate Kafka/Event Hub creds and FM endpoint names.
- Point ONE high-value source (e.g., Sentinel export or Defender via the edge-collector) at the bronze `events` table. Confirm OCSF normalization on real records.
- Disable / skip the `seed_demo_data` task for the production target so real and fake data never mix.

**Phase 2 — Baseline & tune (2–4 weeks, overlapping).**
- Run behavioral + UEBA baseline jobs in **observe-only** mode for 2–4 weeks to learn normal.
- Keep `automated_response` in dry-run (approvals only). No automated actions until FP rate is acceptable.
- Tune contamination, KS alpha, and escalation/auto-response thresholds against the customer's actual alert volume.

**Phase 3 — Prove detection works (parallel).**
- Build a real efficacy harness: replay known-bad datasets and run an atomic/red-team technique set through the pipeline; measure true-positive coverage and false-positive rate. The current smoke test is wiring-only and must be supplemented.
- Validate threat-intel feeds are live (keys valid, IOCs fresh).

**Phase 4 — Scale sources & operationalize (ongoing).**
- Onboard remaining sources one at a time, re-baselining as volume grows.
- Wire notifications/ticketing to the customer's tools.
- Only then flip selected high-confidence responses from approval to automated.

---

## Bottom line

- **Is the code production-grade?** Yes — genuinely. It's a strong reference implementation, not a facade.
- **Will "download + deploy" catch real threats?** No. It runs a polished demo on synthetic data. Real detection needs: real source(s) connected, secrets set, seed disabled, a baseline-and-tune period, and an efficacy test the current smoke test doesn't provide.
- **Effort to real value:** roughly 4–8 weeks of integration and tuning for a first live source — not a rebuild. Sell it as an accelerator that shortcuts months of platform engineering, with a clearly scoped onboarding, not as a turnkey SIEM.
