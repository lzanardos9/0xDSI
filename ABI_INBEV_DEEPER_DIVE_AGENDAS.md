# ABI-InBev -- Deeper Dive: Use Cases & Meeting Agendas

## Customer Profile

- **Company:** ABI-InBev (Anheuser-Busch InBev)
- **Industry:** CPG / Beverages (Global)
- **Footprint:** 500+ breweries, operations in 50+ countries
- **Tech Stack:** Databricks Lakehouse (existing investment), Azure/AWS multi-cloud, SAP, OT/SCADA in manufacturing
- **Key Characteristics:** Massive M&A history, complex supply chain, heavy OT/ICS in production lines, strict regulatory requirements (SOX, GDPR, local food safety)

---

## Strategic Positioning

> "Your data already lives in Databricks. 0xDSI turns it into autonomous detection without building a hunting program from scratch."

**Why NOT heavy hunting emphasis:** The platform's AI agents continuously surface threats through automated detection engineering and anomaly scoring. Manual hunting becomes a validation exercise, not the primary detection method. ABI gets better coverage with less analyst fatigue.

---

## Recommended Use Cases

| # | Use Case | Why It Matters for ABI |
|---|----------|----------------------|
| 1 | **OT/ICS Anomaly Detection** | Brewery PLCs, SCADA systems, packaging lines -- detect lateral movement from IT to OT without manual hunting |
| 2 | **Supply Chain Third-Party Risk** | Hundreds of suppliers, distributors, logistics partners -- automated correlation of third-party indicators against internal telemetry |
| 3 | **Insider Threat (Manufacturing & IP)** | Recipe IP, production formulas, M&A data exfiltration -- behavioral analytics on Lakehouse-scale data |
| 4 | **Multi-Cloud SOC Consolidation** | Unify alerts from Azure, AWS, GCP, SAP, and OT sensors into one detection fabric on Databricks |
| 5 | **Automated Compliance Evidence** | NIST, SOX, GDPR across 50+ countries -- continuous control validation, not periodic audits |
| 6 | **Intelligent Alert Triage & Response** | 0xDSI agents auto-triage, enrich, and recommend response -- reduce MTTR without adding headcount |

---

## Agenda 1: Cyber Audience (CISO, SOC Director, IR Lead)

### "Autonomous SOC Operations for Global Manufacturing"

**Duration:** 60 min

| Time | Topic |
|------|-------|
| 0-10 | ABI's current SOC challenges at scale (validate pain points) |
| 10-25 | **Demo: OT/ICS Anomaly Detection** -- brewery network simulation, automated alert triage, zero manual hunting required |
| 25-40 | **Demo: Insider Threat & Supply Chain Risk** -- behavioral baselines across 500+ sites, third-party correlation |
| 40-50 | **Automated Compliance** -- continuous NIST/SOX evidence generation from existing Lakehouse data |
| 50-60 | Deployment model, integration with existing SIEM/SOAR, next steps |

**Key message:** "Your data already lives in Databricks. 0xDSI turns it into autonomous detection without building a hunting program from scratch."

---

## Agenda 2: Data Audience (CDO, Data Engineering Lead, Analytics Director)

### "Unlocking Security Value from Your Existing Lakehouse Investment"

**Duration:** 60 min

| Time | Topic |
|------|-------|
| 0-10 | How security data fits into ABI's existing Databricks architecture |
| 10-25 | **Architecture Deep Dive:** Unity Catalog for security data governance, Delta Lake for log retention at brewery-scale |
| 25-40 | **Demo: Multi-Cloud Consolidation** -- ingesting Azure/AWS/SAP/OT telemetry, schema normalization, cost comparison vs. legacy SIEM |
| 40-50 | **Data Mesh for Security** -- letting regional teams self-serve detection while central team governs policies |
| 50-60 | ROI model: storage savings, reduced tool sprawl, data reuse across security + business analytics |

**Key message:** "You're already paying for the compute. Security telemetry is just another workload -- and it funds itself through SIEM replacement savings."

---

## Agenda 3: Combined (CISO + CDO + Engineering)

### "One Lakehouse, One SOC: Unified Security Intelligence for ABI-InBev"

**Duration:** 90 min

| Time | Topic |
|------|-------|
| 0-10 | Joint pain points: data silos between security & data teams, tool sprawl, M&A integration debt |
| 10-20 | 0xDSI vision: security as a Lakehouse-native workload (not a bolt-on) |
| 20-35 | **Demo: OT Anomaly Detection + Alert Triage** -- from raw brewery telemetry to auto-resolved incident, no manual hunting step |
| 35-50 | **Demo: Supply Chain & Insider Threat** -- cross-functional data (HR, procurement, network) unified for behavioral detection |
| 50-65 | **Architecture:** how this layers onto ABI's existing Databricks footprint, Unity Catalog security domains, cost model |
| 65-80 | **Compliance Automation** -- SOX/NIST evidence generated as a byproduct of detection, not a separate workflow |
| 80-90 | Joint roadmap discussion, pilot scope (suggest: 2-3 breweries + corporate SOC), success criteria |

**Key message:** "Stop choosing between security visibility and data platform ROI. They're the same investment."

---

## Pilot Recommendation

Start with **2 breweries (1 LatAm, 1 Europe) + corporate SOC** to prove:

1. OT anomaly detection on real brewery PLCs
2. Alert volume reduction through autonomous triage
3. Compliance evidence generation from day one

This gives ABI a cross-regional proof point without boiling the ocean.

---

## Why 0xDSI vs. Traditional SIEM for ABI

| Dimension | Traditional SIEM | 0xDSI on Databricks |
|-----------|-----------------|---------------------|
| OT/ICS coverage | Bolt-on, limited protocol support | Native ingestion via Structured Streaming, PLC protocol parsers |
| Scale | Per-GB pricing kills brewery telemetry economics | Lakehouse economics: store everything, query what matters |
| Hunting | Manual analyst effort, high skill bar | AI agents hunt autonomously, analysts validate |
| Compliance | Separate tool, periodic exports | Continuous evidence from detection pipeline |
| Multi-region | Separate instances per geography | Unity Catalog federation, single pane |
| Time to value | 12-18 month deployment | Pilot in 4-6 weeks on existing Databricks |

---

## Discovery Questions for the Call

1. How are you currently monitoring brewery OT networks? Any visibility into PLC/SCADA traffic?
2. What's your current SIEM spend, and how much of that is OT telemetry vs. IT?
3. How do you handle security for newly acquired brands/breweries during M&A integration?
4. What does your compliance evidence collection process look like today for SOX?
5. How many security analysts cover the global operation, and what's their regional distribution?
6. Are you using Databricks Unity Catalog today? What catalogs/schemas exist?
