# Estee Lauder CISO Demo — The Great Demo Methodology

**Audience:** CISO + Security Leadership
**Duration:** 25 minutes + 10 min Q&A
**Method:** Peter Cohan's "Great Demo" — Do The Last Thing First (DTLTF), then peel back layers tied to a Critical Business Issue (CBI).

---

## The Critical Business Issue (CBI)

> "On April 8, 2023, Estee Lauder confirmed two simultaneous ransomware attacks (Cl0p exploiting GoIP-MFT zero-day, BlackCat). The breach exposed 570GB of data, disrupted operations across 150+ countries, and triggered an $80M+ remediation. Reports surfaced through external channels — not the SOC. The 2am pager went off **after** the data was already on a leak site."

**The CBI we anchor to:**
"How do we collapse the time from first weak signal to executive-grade narrative — so the CISO walks into the boardroom with the story, not chasing it?"

**Specific, Measurable, Painful Outcomes the customer wants:**
- MTTD on multi-vector campaigns: **days -> minutes**
- Analyst toil per incident: **40 Slack pages -> 1 paragraph**
- Cross-domain correlation (cyber + geo + insider + supply chain): **manual -> automatic**
- CISO 2am wake-up: **"What's happening?" -> "Here's what we already contained"**

---

## The Great Demo Structure

### 1. ILLUSTRATION (The Last Thing First) — 3 min
**Show the "money slide" — the AI Incident Summarizer reading the master case narrative.**

### 2. DO IT AGAIN, PEEL BACK ONE LAYER — 18 min
Walk backward through the kill chain from "we contained it" to "first weak signal," showing the capabilities that produced each layer of the narrative.

### 3. SUMMARY + Q&A — 4 min
Recap delta value, hand off CBI ownership.

---

## ACT 1 — The Last Thing First (3 min)

### Scene: AI Incident Summarizer -> Master Case CASE-AC2023-MASTER

**What you do on screen:**
1. Open **AI Incident Summarizer**.
2. The featured master case is already pinned at the top with a star and red "CRITICAL — $42.8M Impact" banner.
3. Click it. Read the single-paragraph narrative aloud verbatim.
4. Pan to the SVG attack graph below — phase columns light up (Recon -> Initial Access -> Lateral -> Exfil -> Impact -> Response).

**Talking Points — say these:**
- "This is what lands in the CISO's inbox at 2am — not 40 Slack pages, not a 60-tab investigation board. **One paragraph. Zero ambiguity.**"
- "Notice it's not a generic LLM summary. Every clause is grounded in a case-ref pill, an MITRE technique, an evidence link. The CISO can drill any phrase into the underlying telemetry."
- "The dashed purple line on the graph — that's the exfil channel **after** containment. We didn't just detect it; we cut it. The green node is the agent action that did it, with the human approval ID stamped on it."
- "**This is the destination.** Now let me show you the 90 minutes that produced this paragraph — collapsed from what was a 6-week investigation."

**Pause. Let them sit with it.**

---

## ACT 2 — Peel Back The Layers (18 min)

We walk **backwards** through the kill chain. Each capability answers: "How did we know? How did we act? How did we prove it?"

---

### Layer 1 — The Containment (Response Approvals) — 2 min

**Open:** Response Approvals panel. Filter to `executed`.

**Click:** the row for `isolate-host-mfg-fileserver-04`.

**Talking Points:**
- "Every autonomous action is gated. The agent proposes, the human approves, the system executes. Full chain of custody."
- "Click the row — you see **WHY**: the trigger event, the MITRE technique it maps to, the blast radius (1 host, 0 users), the reversibility class, the estimated latency, the requesting agent name, and the evidence links."
- "This is what your auditors and your legal team have been asking for: **provable accountability** between AI decisions and human authorization."
- "Notice the risk score is 87 but the reversibility is 'fully-reversible-in-15-min.' That asymmetry is what unlocks autonomy. We don't ask permission to do reversible, low-blast-radius things — we ask permission to do **destructive** things."

**Delta value:** "Your current SOAR fires-and-forgets. Ours fires-with-receipts."

---

### Layer 2 — The Escalation Decision (Threat Escalation) — 2 min

**Open:** Threat Escalation panel.

**Talking Points:**
- "Before we contained, an agent had to decide this was worth waking the CISO for. Most SIEMs use static severity. We use **graph pattern scoring** — does this signal participate in a known attack pattern when joined to identity, asset criticality, and recent geo events?"
- "Watch this rule fire: 'Cl0p-pattern + crown-jewel-tagged asset + after-hours + outbound to TOR exit' = score 97. That's why this woke the CISO instead of the L1 analyst."
- "The data contracts on the right — every upstream signal has an SLA. If a feed misses its SLA, the score is automatically de-risked. **No silent garbage-in-garbage-out.**"

**Delta value:** "Splunk Risk-Based Alerting is additive scoring. Ours is graph-based: it knows that an alert on host A and an alert on identity B mean something **only when** A is the laptop B uses."

---

### Layer 3 — The Detection (Detection Confluence) — 2 min

**Open:** Detection Confluence.

**Talking Points:**
- "We didn't catch this with one detection. We caught it with **seven** — three from rule-based correlation, two from ML, two from negative-correlation."
- "**Negative correlation** is the unlock. Most platforms alert when a thing happens. We alert when a thing **stops** happening — when the EDR agent on a finance laptop suddenly goes quiet for 11 minutes during a known attacker dwell window. Absence is signal."
- "Each detection contributes a vote. The confluence engine resolves them into one incident — not seven tickets."

**Delta value:** "Your team isn't drowning in alerts because they have too many bad detections. They're drowning because nobody **fuses** the good detections into one story."

---

### Layer 4 — The Behavioral Anomaly (User Behavior + Insider Credential Selling) — 2 min

**Open:** User Behavior Lineage -> click the compromised contractor identity.

**Talking Points:**
- "Eleven days before exfil, this contractor's typing biometrics drifted. Cadence variance went from 12ms to 47ms. We flagged it as 'identity-shift candidate' — not an alert, just a watchlist promotion."
- "Three days later, that identity appeared on a credential marketplace we monitor. We had the link **before** the buyer did anything."
- "Combine biometric drift + dark-web listing + privileged access = the agent escalated this to 'pre-attack staging.' This is what your UEBA can't do alone — it needs the dark-web feed joined in graph-space."

**Delta value:** "UEBA tells you the user is weird. We tell you the user **is no longer the user.**"

---

### Layer 5 — The Geopolitical Context (Threat Globe — Geopolitical Mode) — 3 min

**Open:** Threat Globe -> toggle to **Geopolitical mode**.

**Talking Points:**
- "Cyber doesn't happen in a vacuum. The week of this attack, there was a labor strike at a Sao Paulo logistics partner, a sanctions update affecting one of our payment processors, and a state-sponsored cyber advisory targeting beauty/luxury supply chains."
- "We pull from seven live feeds — GDELT, ReliefWeb, USGS, NASA EONET, ACLED, country financial risk, OFAC/EU sanctions. Each event is scored against your **31 actual Acmeco exposure zones** using haversine proximity to your real assets."
- "Click this red marker over Sao Paulo. Exposure score 84. Why? Because your HQ has 4,200 headcount, 18% revenue share, and the event is 12km from the building. That number is **defensible** — it's not a vibe, it's geometry."
- "The toggle back to Cyber view — same globe, different lens. Same UI muscle memory for your analysts."

**Delta value:** "Your threat-intel platform tells you about threats. Ours tells you about **threats to you, weighted by your geography, payroll, and revenue.**"

---

### Layer 6 — The Initial Signal (CEP Live Graph + Lucene Fast Search) — 2 min

**Open:** CEP Live Graph -> show the streaming pattern that fired first.

**Talking Points:**
- "First weak signal: a single failed MFA + a single anomalous SaaS app authorization, 47 seconds apart. By themselves, both are noise. Together, in our streaming graph, they form a 'consent-phishing-handoff' pattern."
- "We process this in Quine — streaming graph CEP. The pattern is evaluated **as data arrives**, not in a 5-minute batch. End-to-end latency from event-time to graph-match: 800ms."
- "If your analyst wants to pivot, **Lucene Fast Search** queries 4.2 billion events in under 300ms. They never leave the workflow to context-switch into a query language."

**Delta value:** "Your SIEM does correlation in batch. Ours does it on the wire. By the time your batch job runs, our agent has already isolated the host."

---

### Layer 7 — The Receipts (Chain of Custody) — 1 min

**Open:** any case -> Chain of Custody tab.

**Talking Points:**
- "Every byte of evidence has a hash, a collection time, a collector identity, and a tamper-evident log entry. SOX, GDPR, LGPD, NYDFS — same chain, different report templates."
- "If this case goes to litigation or to a regulator, you don't reconstruct the story. You **export** it."

**Delta value:** "We're not a SIEM with a compliance bolt-on. The evidentiary record is the primary data structure."

---

### Layer 8 — The Cost (ROI / Platform Economics) — 2 min

**Open:** Platform Economics.

**Talking Points:**
- "Estee's current Splunk + SOAR + UEBA + TIP stack: roughly $11M/year, 14 vendors, 6 separate UIs."
- "On Databricks Lakehouse: one platform, one storage layer, one governance plane. We model your TCO at $4.2M/year — and that includes the agent compute."
- "But the real number isn't license savings. It's the 73% reduction in MTTD on multi-vector campaigns. **The Cl0p attack you just watched would have been contained in 47 minutes instead of 6 weeks.**"

**Delta value:** "We're not selling you a SIEM. We're selling you the SOC budget back."

---

## ACT 3 — Summary + Hand-off (4 min)

**Recap, in this order:**

1. **The destination:** "One paragraph at 2am, with receipts."
2. **The path:** "Streaming graph -> negative correlation -> behavioral biometrics -> geopolitical context -> human-gated autonomy -> evidentiary export."
3. **The proof:** "All of what you just saw ran on **your data shape**, not a sandbox. We can stand this up against your last 30 days of telemetry in 14 days."
4. **The ask:** "Give us 14 days and your last major incident. We'll replay it through this stack and show you what the 2am paragraph would have said."

**Closing line, slow:**
> "You don't need another tool that finds things. You need a system that finishes things. That's what this is."

---

## Demo Operator Cheat Sheet

| Time | Screen | Click Sequence | Watch For |
|---|---|---|---|
| 0:00 | AI Incident Summarizer | Master case (pinned) -> read narrative -> point at graph | Featured star, $42.8M banner |
| 3:00 | Response Approvals | Filter `executed` -> click `isolate-host-mfg-fileserver-04` | Drilldown shows WHY, MITRE, blast radius |
| 5:00 | Threat Escalation | Show graph score 97 + data contracts SLA | Score breakdown |
| 7:00 | Detection Confluence | Show 7 detections fused into 1 incident | Negative correlation row |
| 9:00 | User Behavior | Click contractor identity -> typing biometrics drift | 11-day pre-attack window |
| 11:00 | Threat Globe | Toggle to Geopolitical -> click Sao Paulo marker | Exposure score 84 panel |
| 14:00 | CEP Live Graph | Show consent-phishing pattern firing | 800ms latency badge |
| 16:00 | Chain of Custody | Open any case -> evidence tab | Hash + collector + timestamp |
| 17:00 | Platform Economics | TCO comparison + MTTD chart | $4.2M vs $11M |
| 19:00 | Back to AI Incident Summarizer | Re-read paragraph | "Now you know what every clause means." |

---

## Failure-Mode Recovery Lines

If a feature is slow to load:
> "While that loads — this is exactly the lag your analysts feel today across 14 vendors. We're collapsing it onto one platform."

If a number on screen looks wrong:
> "Live data — that's what you're looking at. Let me drill it." (Then drill it.)

If a CISO challenges a claim:
> "Fair challenge. Let me pull the underlying record." (Click into the evidence.)

---

## What NOT To Do (Great Demo discipline)

- Do **not** start with architecture slides. Architecture is layer 9 in their head, not layer 1.
- Do **not** show every feature. Show the seven that ladder to the CBI.
- Do **not** read the UI aloud. Read the **value** aloud.
- Do **not** demo features the customer didn't ask for. Park them in the "also available" appendix.
- Do **not** end with "any questions?" End with **the ask**.
