# Operation Borrowed Trust — Live Demo Script (Where to Click)

A 12-15 minute presenter walkthrough that maps the 30-minute narrative
(`0xDSI_Operation_Borrowed_Trust_Narrative.md`) onto the actual running app.
Every step names the exact screen, tab, and control to click.

Cast of the scenario (one shared machine identity `release-service`, timeline 09:00-09:09):
- **Exec A** — benign application deploy. No trend. (The control case.)
- **Exec B** — financial reconciliation. Provisionally matches on an *absence* predicate
  (authorization not yet observed), then is **WITHDRAWN** when the late authorization
  event (arrives 09:09, earlier event-time) is validated for B's scope.
- **Exec C** — privilege escalation (09:01) -> restricted read (09:03) -> outbound
  transfer (09:04); the privilege-change record arrives LATE at 09:06. C **PERSISTS**
  as critical: authorization for B does not authorize C's export.

---

## ACT 0 - Set the stage (0:00-1:30)

1. Open the SOC app. Land on the **Overview / dashboard**.
2. One line: "Everything you'll see hangs off one machine identity, `release-service`,
   running three jobs in the same nine-minute window. One is fine, one looks bad then
   clears, one looks fine then turns critical. The point is *when* evidence arrives."

---

## ACT 1 - The complex-event engine (1:30-5:00)

Left nav -> **CET Trend Engine**.

3. **Overview** tab: state that this is the complex-event / trend engine — it matches
   *patterns across events*, not single alerts, and it keeps standing matches that can
   later be confirmed or cancelled.
4. **Kleene Queries** tab. Point out the two Operation Borrowed Trust queries:
   - `cet-obt-recon` — the reconciliation pattern that matches on the *absence* of an
     authorization event (this is B).
   - `cet-obt-export` — the escalation -> restricted-read -> outbound-transfer chain,
     with a "one or more reads" (Kleene +) repetition (this is C).
   Say: "Notice the recon query fires on an *absence*. That's the fragile one — absence
   is only true until the missing event shows up."
5. **Trends** tab. Show the two live standing matches:
   - `release-service -> external-dest` — **CRITICAL / PERSISTS** (Exec C).
   - `release-service -> recon-output` — **HIGH / WITHDRAWN** (Exec B).
   Say: "Both were raised. Watch which one survives once late evidence lands."

---

## ACT 2 - The visual proof (5:00-8:00)

6. **Live Graph** tab. Use the filter dropdown at the top to isolate **`obt-c-export`**.
   Walk the chain node by node: escalate (09:01) -> restricted read (09:03) ->
   outbound transfer (09:04). Highlight that the nodes are tied together by the same
   execution identity (the correlation key) — you cannot fake this chain by stitching
   unrelated events.
7. Switch the filter to **`obt-b-recon`**. Show B's provisional finding: it stands only
   because the authorization event has not been observed yet.
8. Say: "Same identity, two independent findings, different fates. Now let's bring in the
   late event."

---

## ACT 3 - Change the evidence (8:00-11:00)

This is the narrative's 24:00-27:00 core: "change the engine, then change the evidence."

9. Explain the mechanic in plain words: the authorization event actually happened at an
   *earlier* event-time but is *delivered late* (09:09). Delivered in **arrival order**,
   not sorted — that's what makes the withdrawal visible.
10. Back on the **Trends** tab, walk through the outcome:
    - `release-service -> recon-output` (B) flips to **WITHDRAWN** — the absence predicate
      is now false, so the provisional match is cancelled. History is retained; it's not
      deleted, it's *superseded*.
    - `release-service -> external-dest` (C) **stays CRITICAL**. The late authorization was
      scoped to B's reconciliation; it does not authorize C's export.
11. The money line: "The system didn't just alert. It *withdrew* a finding when better
    evidence arrived, and it *held* the one that still mattered. That's the difference
    between a rule that fires and an engine that reasons over time."

---

## ACT 4 - The model that learns this (11:00-14:00)

Left nav -> **Detection SLM (Beta)** -> **Ray Training Theater** tab.

12. Point at the live theater: "This is the small language model that learns the *grammar*
    of normal machine behavior so it can flag sequences like C. It's trained with Ray on a
    Databricks GPU cluster — 8 worker actors, 32 A100 GPUs, data-parallel."
13. Let it run: the step counter climbs, the loss curve falls, the eight worker cards pulse
    with live GPU utilisation and throughput, and the NCCL all-reduce indicator blinks each
    step. Use Pause / Restart to control the room.
14. Point at the **Curriculum weighting** card: "Proven incidents are up-weighted 3x. The
    model still reads *every* event to learn what normal looks like, but it leans hardest on
    the confirmed cases — that's the hybrid training answer."
15. Close: "So the engine caught it in real time, corrected itself when late evidence landed,
    and the model behind it is being trained — right now — to recognise the next Borrowed
    Trust before it completes."

---

## Optional deep-dive (for a technical audience)

- Databricks notebook: `databricks-native/notebooks/analytics/08_operation_borrowed_trust_replay.py`
  replays the exact A/B/C timeline event by event and shows the withdrawal lifecycle in code.

## Quick reference - exact click targets

| Beat | Nav item | Tab | Control |
|------|----------|-----|---------|
| Queries | CET Trend Engine | Kleene Queries | `cet-obt-recon`, `cet-obt-export` |
| Standing matches | CET Trend Engine | Trends | `release-service -> external-dest` (PERSISTS), `release-service -> recon-output` (WITHDRAWN) |
| Chain C | CET Trend Engine | Live Graph | filter dropdown -> `obt-c-export` |
| Finding B | CET Trend Engine | Live Graph | filter dropdown -> `obt-b-recon` |
| Training | Detection SLM (Beta) | Ray Training Theater | Pause / Restart |
