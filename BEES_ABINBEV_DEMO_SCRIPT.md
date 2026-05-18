# 0xDSI Demo Script — BEES (AB InBev)

> Audience: Executive leadership (BEES / AB InBev)
> Duration: 20 minutes
> Date: 2026-05-19
> Presenter Notes: [Talk] = what to say | [Click] = where to navigate | [Pause] = let them absorb

---

## Pre-Demo Setup

- Login as `igormiro` (password: `IgorMiro2024!`)
- Ensure browser is full-screen (F11)
- Start on the **Analytics Dashboard** (default landing)
- Have Command Center ready as second tab mentally

---

## Minute 0–2: Opening & Hook (Analytics Dashboard)

**[Talk]**

> "Good morning. What I'm about to show you is not a SIEM. It's not a ticketing system bolted onto log search. What you're looking at is a Detection-as-Data platform — a system where every security signal, every correlation, every decision an analyst or an AI agent makes becomes a permanent, queryable, learnable asset.
>
> For a company like BEES — operating across 20+ markets, processing millions of B2B transactions daily, running supply chain logistics at scale — the question isn't whether you'll be attacked. It's whether your security infrastructure can detect, reason, and respond faster than the attacker can pivot.
>
> Let me show you what that looks like."

**[Pause — let them see the live dashboard]**

**[Talk]** — point at the live metrics strip:

> "These are real-time metrics. Events per second flowing through our streaming pipeline. Active sessions. Critical alerts awaiting triage. And threats that were autonomously neutralized without a human touching them."

---

## Minute 2–5: Command Center (Executive Wow Factor)

**[Click]** the **Radar icon** (Command Center mode toggle) in the dashboard header.

**[Talk]**

> "This is the Command Center — the operational nerve center. Think of it as your security mission control."

**[Point out]** the following panels (don't click into each, just narrate):

1. **Risk Posture Gauge** — "Your organizational risk score, updated in real-time based on active threats, unpatched vulnerabilities, and behavioral anomalies."

2. **Kill Chain Waterfall** — "Every active attack mapped to its kill chain stage. You can see at a glance: are attackers in reconnaissance, or have they already achieved lateral movement?"

3. **Threat Weather Map** — "Geographic threat intelligence. For BEES operating in Latin America, Europe, Africa — you need to know which regions are under active targeting right now."

4. **Low-and-Slow Tracker** — "This is unique. Most SIEMs miss attacks that spread over days or weeks. This engine tracks attack continuity across time — the attacker who moves one step per day doesn't disappear between steps."

5. **Predictive Threat Analytics** — "Monte Carlo simulation of where threats are heading. Not just what happened — what's likely to happen next."

**[Talk]**

> "The key insight: everything here is connected. A signal in the Kill Chain feeds the Risk Gauge, informs the Weather Map, and trains the Predictive engine. Intelligence compounds."

---

## Minute 5–8: Detection Intelligence (Correlation Rules + Threat Radar)

**[Click]** sidebar: **Detection & Intelligence > Correlation Rules**

**[Talk]**

> "Traditional SIEMs give you rules. We give you a Detection-as-Code engine. Every rule is versioned like source code — you can see who changed it, when, why, and roll back if a rule causes false positives."

**[Point out]** the rule list — show variety:
- Graph-based rules (multi-entity relationships)
- Behavioral rules (ML-driven)
- Temporal rules (time-window correlation)
- Negative correlation (detecting what DIDN'T happen)

**[Talk]**

> "For BEES specifically — imagine a rule like: 'If a supplier account authenticates from a new geography AND accesses pricing data AND no MFA challenge was triggered within 5 minutes — escalate.' That's a three-signal temporal correlation that most platforms can't express, let alone automate."

**[Click]** sidebar: **Detection & Intelligence > Threat Radar Agent**

**[Talk]**

> "This is an autonomous agent. It continuously scans threat intelligence sources — dark web forums, OSINT feeds, vendor advisories — looking for anything relevant to your attack surface. It doesn't wait for a human to search. It hunts."

**[Show]** the feed stream and intelligence dossier.

> "When it finds something, it generates a full intelligence dossier and proposes new detection rules. Human-in-the-loop: your team reviews and approves before anything goes live."

---

## Minute 8–11: Supply Chain & Financial Relevance

**[Click]** sidebar: **Industry Threat Intel > Financial Threats**

**[Talk]**

> "BEES processes B2B payments at massive scale. Let me show you what purpose-built financial threat detection looks like."

**[Show]** the Financial Threat Intelligence dashboard — point out:
- **Transaction Risk Monitor** — "Real-time scoring of every transaction for fraud indicators."
- **Identity Graph Explorer** — "Mapping relationships between accounts, devices, and behaviors to detect identity fraud."
- **Credential Selling Graph** — "We monitor dark web marketplaces for your corporate credentials being sold."

**[Click]** into **Boleto Fraud Engine** or **Pix Fraud Intelligence** (whichever loads cleanly):

> "For operations in Brazil — Pix fraud and Boleto manipulation are the number one and two financial cyber threats. This engine detects fraudulent payment modifications before they clear."

**[Talk — business value]**

> "The ROI here is direct. One intercepted fraudulent Boleto batch for a company at BEES's scale can save millions in a single incident."

---

## Minute 11–14: Agentic SOC & Response Automation

**[Click]** sidebar: **Overview > SOC Agent Bricks**

**[Talk]**

> "This is where it gets fundamentally different from anything else on the market. These are AI agents — not chatbots, not copilots. Autonomous agents that perform real SOC work."

**[Point out]** the agent cards:

> "Each agent has a specialization: triage, enrichment, correlation, escalation, response. They communicate with each other, share context, and escalate to humans only when confidence is below threshold."

**[Click]** sidebar: **Response & Automation > Response Approvals**

**[Talk]**

> "Human-in-the-loop is not optional — it's architecturally enforced. When an agent recommends blocking an IP, isolating a user, or quarantining a file, it goes through an approval workflow. Your team maintains control. The agents handle the 95% of routine work that burns out analysts."

**[Business value]**

> "For BEES: you operate 24/7 across time zones. Agents don't sleep, don't have shift changes, don't lose context between handoffs. Your mean-time-to-respond drops from hours to seconds for automated actions, and from days to minutes for complex investigations."

---

## Minute 14–17: Cases & Executive Visibility

**[Click]** sidebar: **Response & Automation > Cases**

**[Talk]**

> "When something becomes a real incident, it becomes a Case. Full evidence chain, MITRE ATT&CK mapping, timeline reconstruction, collaboration, and audit trail."

**[Show]** a case — point out evidence graph, timeline, MITRE mapping.

> "Every decision is recorded. Every piece of evidence is linked. This is your chain of custody for regulatory and legal requirements."

**[Click]** the role selector in the header — switch to **CISO** role.

**[Click]** sidebar: **Executive > Executive Dashboard**

**[Talk]**

> "Now — what does the CISO or the board see? Not raw alerts. Not technical noise. Business metrics."

**[Point out]**:
- Cost avoidance
- Risk reduction trending
- Compliance posture
- Mean time to detect / respond
- Operational efficiency gains

> "This is the bridge between the SOC floor and the boardroom. Security as a business function, measurable and accountable."

---

## Minute 17–19: Differentiators & Why This Matters for BEES

**[Talk — no clicking, eye contact with audience]**

> "Let me summarize why this matters specifically for BEES and AB InBev:
>
> **One** — You operate at supply-chain scale across 20+ markets. Traditional security tools were built for single-site enterprises. This platform was built for distributed, multi-geography, multi-tenant operations.
>
> **Two** — Your B2B commerce platform processes financial transactions that are direct targets. We don't bolt financial fraud detection onto a SIEM as an afterthought. It's a first-class intelligence domain.
>
> **Three** — Your data lives in a Lakehouse. This platform is native to that architecture. Delta tables, Unity Catalog governance, MLflow model management, Databricks notebooks for custom detection logic. It doesn't fight your data strategy — it extends it.
>
> **Four** — Intelligence compounds. Every incident your team handles makes the system smarter. Every false positive you flag improves the models. Every agent decision becomes training data. Six months from now, this platform knows your environment better than any analyst who just joined the team.
>
> **Five** — Detection-as-Data is a new category. You're not buying a SIEM with AI features. You're building a security intelligence layer where detection logic, threat knowledge, and operational decisions are all first-class data assets — queryable, versionable, auditable, and learnable."

---

## Minute 19–20: Close & Next Steps

**[Talk]**

> "I have two questions for you:
>
> First — which of these capabilities maps most directly to the security challenges keeping your team up at night today?
>
> Second — would it be valuable to do a deeper technical session with your security engineering team to explore integration with your existing Databricks environment and data sources?"

**[Pause — let them respond]**

---

## Backup Slides (If Questions Arise)

### "How does this integrate with our existing tools?"
**[Click]** Data & Integration > Data Connectors — show the connector catalog. Mention Splunk/QRadar migration path.

### "What about compliance?"
**[Click]** Reports & Analytics > Compliance Dashboard — show framework coverage (SOC2, ISO27001, PCI-DSS, GDPR).

### "How does the AI actually work?"
**[Click]** Innovation > Detection Confluence — show multi-lens detection fusion, arbiter verdicts, confidence scoring.

### "What's the deployment model?"
**[Talk]** "Cloud-native on your existing Lakehouse. Supabase for operational state, Databricks for compute and storage. No new infrastructure to provision. Data never leaves your environment."

### "What about multi-tenancy for our different business units?"
**[Click]** Administration > Multi-Tenant Manager — show tenant isolation capabilities.

---

## Key Phrases to Use

- "Intelligence that compounds" (not "AI-powered")
- "Detection-as-Data" (not "next-gen SIEM")
- "Organizational security memory" (not "knowledge base")
- "Autonomous agents with human control" (not "automation")
- "Native to your Lakehouse" (not "integrates with Databricks")
- "Security as a business function" (not "threat detection platform")

## Things to AVOID Saying

- Don't say "SIEM replacement" — say "new category"
- Don't say "we use AI" generically — specify which agent does what
- Don't dive into technical architecture unless asked
- Don't mention "mock data" or "demo mode"
- Don't compare directly to Microsoft Sentinel, Splunk, etc. unless they ask
- Don't show the 3D visualizations unless they specifically ask (can look "too techy" for exec audience)

---

## Timing Checkpoint Summary

| Minute | Section | Energy Level |
|--------|---------|-------------|
| 0–2 | Hook + Live Dashboard | High — establish credibility |
| 2–5 | Command Center | Wow — visual impact |
| 5–8 | Detection Intelligence | Technical credibility |
| 8–11 | Financial/Supply Chain | Business relevance |
| 11–14 | Agentic SOC | Differentiation |
| 14–17 | Cases + Executive View | Governance + Board value |
| 17–19 | Summary Differentiators | Strategic close |
| 19–20 | Questions & Next Steps | Engagement |
