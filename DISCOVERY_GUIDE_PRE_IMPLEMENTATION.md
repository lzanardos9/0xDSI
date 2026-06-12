# 0xDSI Platform Discovery Guide

## Pre-Implementation Questionnaire

> This document must be completed and returned to your 0xDSI implementation team **before** project kickoff. Accurate answers ensure a smooth deployment, proper sizing, and alignment with your security operations goals.

---

## Section 1: Organization Profile

### 1.1 Company Overview

| Question | Your Answer |
|----------|-------------|
| Organization name | |
| Industry vertical | |
| Number of employees | |
| Number of IT/Security staff | |
| Geographic presence (countries/regions) | |
| Regulatory frameworks applicable (SOX, PCI-DSS, HIPAA, LGPD, GDPR, etc.) | |
| Current fiscal year security budget range | |

### 1.2 Organizational Structure

| Question | Your Answer |
|----------|-------------|
| Who is the executive sponsor for this project? | |
| Who is the day-to-day project owner? | |
| How many SOC analysts (L1/L2/L3)? | |
| How many threat hunters? | |
| How many security engineers? | |
| Is there a dedicated incident response team? | |
| Is there a dedicated threat intelligence team? | |
| Does a CISO or equivalent role exist? Who do they report to? | |

---

## Section 2: Current Security Stack

### 2.1 Existing SIEM/SOAR

| Question | Your Answer |
|----------|-------------|
| Current SIEM solution(s) in use | |
| SIEM license type and expiration date | |
| Current daily log ingestion volume (GB/day or EPS) | |
| Peak ingestion volume observed | |
| Are you replacing or augmenting the existing SIEM? | |
| Current SOAR platform (if any) | |
| Number of automated playbooks in production | |
| Average alert volume per day | |
| Current false positive rate (estimated %) | |
| Mean time to detect (MTTD) | |
| Mean time to respond (MTTR) | |

### 2.2 Security Tools Inventory

Please indicate which tools are currently deployed:

| Category | Tool(s) in Use | Version | Cloud/On-Prem |
|----------|---------------|---------|---------------|
| Endpoint Detection (EDR/XDR) | | | |
| Network Detection (NDR/IDS/IPS) | | | |
| Firewall / Next-Gen Firewall | | | |
| Email Security Gateway | | | |
| Identity & Access Management | | | |
| Privileged Access Management | | | |
| Vulnerability Scanner | | | |
| Cloud Security Posture (CSPM) | | | |
| Data Loss Prevention (DLP) | | | |
| Threat Intelligence Platform | | | |
| Deception / Honeypots | | | |
| Web Application Firewall | | | |
| CASB / SaaS Security | | | |
| OT/ICS Security | | | |
| Container/Kubernetes Security | | | |

### 2.3 Logging & Data Sources

List all log sources you intend to ingest (add rows as needed):

| Source | Type | Format | Volume (GB/day) | Priority (High/Med/Low) |
|--------|------|--------|-----------------|------------------------|
| | | | | |
| | | | | |
| | | | | |
| | | | | |
| | | | | |

Common sources to consider:
- Windows Event Logs (DCs, servers, workstations)
- Linux/Unix syslogs
- Firewall/proxy logs
- VPN/remote access logs
- DNS query logs
- Cloud audit trails (AWS CloudTrail, Azure Activity, GCP Audit)
- SaaS audit logs (O365, Google Workspace, Salesforce)
- Database audit logs
- Application logs (custom apps)
- Authentication/SSO logs
- Email gateway logs
- Endpoint telemetry
- Network flow data (NetFlow/sFlow)
- OT/SCADA logs

---

## Section 3: Infrastructure & Environment

### 3.1 Cloud & Data Platform

| Question | Your Answer |
|----------|-------------|
| Primary cloud provider(s) | |
| Multi-cloud? If yes, which providers? | |
| Current Databricks environment? (Workspace URL if applicable) | |
| Databricks tier (Standard/Premium/Enterprise) | |
| Existing Unity Catalog deployment? | |
| Preferred deployment region(s) | |
| Data residency requirements or restrictions | |
| Existing data lake/lakehouse architecture? | |
| Current storage layer (S3, ADLS, GCS, etc.) | |

### 3.2 Network Architecture

| Question | Your Answer |
|----------|-------------|
| Number of physical locations/offices | |
| Number of data centers | |
| Network segmentation strategy (VLANs, microsegmentation, etc.) | |
| VPN/ZTNA solution for remote access | |
| SD-WAN deployment? | |
| Internal DNS infrastructure | |
| Proxy/web gateway solution | |
| Any air-gapped or isolated networks? | |
| OT/ICS networks present? If yes, describe topology | |

### 3.3 Identity Infrastructure

| Question | Your Answer |
|----------|-------------|
| Primary directory service (AD, Azure AD, Okta, etc.) | |
| Total number of user accounts (human) | |
| Total number of service accounts | |
| Total number of privileged accounts | |
| MFA coverage (% of users) | |
| SSO provider | |
| Federation with external partners? | |

---

## Section 4: Threat Landscape & Priorities

### 4.1 Threat Profile

| Question | Your Answer |
|----------|-------------|
| Top 3 threat scenarios you are most concerned about | |
| Have you experienced a significant breach in the past 24 months? | |
| Known threat actors targeting your industry | |
| Crown jewel assets (most critical to protect) | |
| Most valuable data types in your environment | |
| Insider threat program maturity (None/Basic/Mature) | |
| Fraud detection requirements? | |

### 4.2 Detection Priorities

Rank the following use case categories (1 = highest priority, 10 = lowest):

| Use Case | Rank |
|----------|------|
| External intrusion detection | |
| Insider threat / UEBA | |
| Cloud security monitoring | |
| Compliance monitoring & reporting | |
| Fraud detection | |
| Data exfiltration prevention | |
| Supply chain risk | |
| OT/ICS threat detection | |
| Brand/reputation monitoring | |
| Third-party/vendor risk | |

### 4.3 MITRE ATT&CK Coverage

| Question | Your Answer |
|----------|-------------|
| Do you currently map detections to MITRE ATT&CK? | |
| Which ATT&CK tactics have the weakest coverage today? | |
| Target detection coverage % across the matrix | |
| Do you have a red team or purple team program? | |

---

## Section 5: Operational Requirements

### 5.1 SOC Operations Model

| Question | Your Answer |
|----------|-------------|
| SOC operating hours (24x7, 16x5, 8x5, etc.) | |
| SOC location(s) | |
| Follow-the-sun model? | |
| Managed security service provider (MSSP) involvement? | |
| Tiered analyst model (L1/L2/L3)? Describe | |
| On-call/escalation procedures today | |
| Case/ticket management system | |
| Communication tools (Slack, Teams, PagerDuty, etc.) | |

### 5.2 Incident Response

| Question | Your Answer |
|----------|-------------|
| Documented IR plan? When last tested? | |
| IR retainer with external firm? | |
| Average incidents per month | |
| Severity classification system | |
| Escalation matrix defined? | |
| Executive notification thresholds | |
| Legal/privacy team involvement triggers | |
| Evidence preservation procedures | |

### 5.3 Compliance & Reporting

| Question | Your Answer |
|----------|-------------|
| Required compliance frameworks | |
| Audit frequency and next audit date | |
| Board-level reporting cadence | |
| Executive KPIs currently tracked | |
| Regulatory reporting obligations (breach notification, etc.) | |
| Log retention requirements (days/months/years) | |
| Evidence chain-of-custody requirements | |

---

## Section 6: Integration Requirements

### 6.1 Automation & Orchestration

| Question | Your Answer |
|----------|-------------|
| Desired automation level (Advisory/Semi-auto/Full-auto) | |
| Approved automated response actions (block IP, disable user, isolate host, etc.) | |
| Human-in-the-loop requirements for which actions? | |
| Change management approval needed for response actions? | |
| Existing workflow/automation tools (n8n, Tines, XSOAR, etc.) | |

### 6.2 Ticketing & Collaboration

| Question | Your Answer |
|----------|-------------|
| Primary ticketing system (ServiceNow, Jira, etc.) | |
| Bi-directional sync required? | |
| Notification channels (email, Slack, Teams, PagerDuty) | |
| War room / major incident process | |

### 6.3 Threat Intelligence Feeds

| Question | Your Answer |
|----------|-------------|
| Commercial TI subscriptions | |
| ISAC/ISAO memberships | |
| STIX/TAXII feeds in use | |
| Internal TI production capability | |
| TI sharing agreements with partners | |

---

## Section 7: AI & Agent Configuration

### 7.1 AI/ML Preferences

| Question | Your Answer |
|----------|-------------|
| Comfort level with AI-driven decisions (1-10) | |
| Maximum autonomy level for agents (observe/advise/act) | |
| Require explainability for all AI decisions? | |
| Data allowed for model training (internal only, anonymized, etc.) | |
| Concerns about AI/LLM usage in security operations | |
| Approved LLM providers (if any restrictions) | |

### 7.2 Agent Deployment Preferences

| Question | Your Answer |
|----------|-------------|
| Which agent capabilities are highest priority? | |
| Agents that require human approval before action | |
| SLA requirements for agent response time | |
| Agent audit/explainability requirements | |
| Blast radius limits for automated actions | |

---

## Section 8: Success Criteria

### 8.1 Project Goals

| Question | Your Answer |
|----------|-------------|
| Primary business outcome expected | |
| Target MTTD after implementation | |
| Target MTTR after implementation | |
| Target false positive reduction % | |
| Target analyst productivity improvement | |
| Expected ROI timeline | |

### 8.2 Phased Deployment Preferences

| Question | Your Answer |
|----------|-------------|
| Preferred go-live date | |
| Acceptable deployment phases (how many?) | |
| Which capabilities must be in Phase 1? | |
| Parallel run with existing SIEM required? Duration? | |
| User acceptance testing requirements | |
| Training needs (how many users, preferred format) | |

### 8.3 Ongoing Operations

| Question | Your Answer |
|----------|-------------|
| Preferred support tier (Standard/Premium/Dedicated) | |
| Expected monthly platform review cadence | |
| Content update/tuning frequency expected | |
| Expansion plans (new data sources, regions, use cases) | |

---

## Section 9: Access & Permissions

> Required for implementation team to begin work.

### 9.1 Environment Access

| Requirement | Provided? | Details |
|-------------|-----------|---------|
| Databricks workspace admin access | | |
| Cloud provider console access (read) | | |
| Network diagram / architecture docs | | |
| Firewall rule change process | | |
| Service account creation process | | |
| API keys for existing security tools | | |
| Sample log data (1 week minimum) | | |
| VPN/access for implementation engineers | | |

### 9.2 Key Contacts

| Role | Name | Email | Phone |
|------|------|-------|-------|
| Executive Sponsor | | | |
| Project Manager | | | |
| SOC Lead | | | |
| Infrastructure/Cloud Lead | | | |
| Network Engineering | | | |
| Identity/IAM Lead | | | |
| Compliance Officer | | | |
| Data Engineering | | | |

---

## Section 10: Constraints & Risks

| Question | Your Answer |
|----------|-------------|
| Known project risks or blockers | |
| Change freeze windows | |
| Competing projects that may impact resources | |
| Budget constraints or approval gates | |
| Organizational changes expected during implementation | |
| Technical debt that may affect integration | |
| Data quality concerns | |
| Political/organizational sensitivities | |

---

## Submission Instructions

1. Complete all sections as thoroughly as possible
2. Mark any items as "TBD" if information is not yet available
3. Attach supporting documents where referenced (network diagrams, architecture docs, compliance reports)
4. Return to your assigned implementation lead within **10 business days**
5. Schedule a 90-minute discovery review session with your implementation team

---

## Next Steps After Submission

| Step | Timeline |
|------|----------|
| Discovery review session | Within 5 days of submission |
| Architecture design document delivered | Within 10 days of review |
| Implementation plan and timeline | Within 5 days of architecture approval |
| Phase 1 kickoff | Within 5 days of plan approval |

---

*Document Version: 2.0 | Last Updated: June 2026*
*Classification: Customer Confidential*
