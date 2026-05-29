export interface CatalogConnector {
  id: string;
  name: string;
  vendor: string;
  category: string;
  description: string;
  status: 'connected' | 'available' | 'beta';
  protocol: string;
}

export const CONNECTOR_CATEGORIES: Record<string, string> = {
  siem: 'SIEM Platforms',
  cloud_aws: 'Cloud Security - AWS',
  cloud_azure: 'Cloud Security - Azure',
  cloud_gcp: 'Cloud Security - GCP',
  edr: 'Endpoint Detection & Response',
  firewall: 'Network Security / Firewalls',
  iam: 'Identity & Access Management',
  email: 'Email Security',
  vuln: 'Vulnerability Management',
  threat_intel: 'Threat Intelligence Platforms',
  waf: 'Web Application Firewall',
  dlp: 'Data Loss Prevention',
  container: 'Container & Kubernetes Security',
  devsecops: 'DevSecOps & CI/CD Security',
  ndr: 'Network Detection & Response',
  casb: 'Cloud Access Security Broker',
  soar: 'Security Orchestration (SOAR)',
  observability: 'Log Management & Observability',
  ics_ot: 'ICS / OT Security',
  plc_ot_protocols: 'PLC & OT Native Protocols',
  dns: 'DNS Security',
  endpoint_mgmt: 'Endpoint Management',
  grc: 'Compliance & GRC',
  collaboration: 'Messaging & Collaboration',
  database: 'Database Security',
  zero_trust: 'Zero Trust & Secure Access',
};

export const CATALOG_CONNECTORS: CatalogConnector[] = [
  // ── SIEM Platforms ──
  { id: 'siem-1', name: 'Splunk Enterprise', vendor: 'Splunk (Cisco)', category: 'siem', description: 'Full enterprise SIEM with HTTP Event Collector, heavy forwarders, and universal forwarder agents for log aggregation and real-time search.', status: 'connected', protocol: 'HEC / Syslog / REST API' },
  { id: 'siem-2', name: 'IBM QRadar', vendor: 'IBM', category: 'siem', description: 'Enterprise SIEM with offense management, flow analysis, and built-in AI analytics for threat detection via log source protocols.', status: 'connected', protocol: 'Log Source Protocol / STIX' },
  { id: 'siem-3', name: 'Microsoft Sentinel', vendor: 'Microsoft', category: 'siem', description: 'Cloud-native SIEM and SOAR built on Azure Log Analytics with KQL query language and automated playbooks.', status: 'connected', protocol: 'Log Analytics API / CEF' },
  { id: 'siem-4', name: 'Elastic Security', vendor: 'Elastic', category: 'siem', description: 'Open-source SIEM built on Elasticsearch with Fleet-managed agents, detection rules, and timeline investigation.', status: 'connected', protocol: 'Fleet Agent / Logstash / Beats' },
  { id: 'siem-5', name: 'ArcSight ESM', vendor: 'OpenText (Micro Focus)', category: 'siem', description: 'Enterprise security manager with SmartConnectors for 450+ data sources and real-time correlation engine.', status: 'available', protocol: 'SmartConnector / CEF / Syslog' },
  { id: 'siem-6', name: 'LogRhythm SIEM', vendor: 'LogRhythm', category: 'siem', description: 'NextGen SIEM with embedded SOAR, UEBA, and NDR capabilities plus SmartResponse automation.', status: 'available', protocol: 'System Monitor Agent / Syslog' },

  // ── Cloud Security - AWS ──
  { id: 'aws-1', name: 'AWS CloudTrail', vendor: 'Amazon Web Services', category: 'cloud_aws', description: 'Governance, compliance, and audit service recording all API calls across AWS accounts and regions.', status: 'connected', protocol: 'S3 / SNS / EventBridge' },
  { id: 'aws-2', name: 'Amazon GuardDuty', vendor: 'Amazon Web Services', category: 'cloud_aws', description: 'Intelligent threat detection service that monitors for malicious activity and unauthorized behavior.', status: 'connected', protocol: 'EventBridge / S3 Export' },
  { id: 'aws-3', name: 'AWS Security Hub', vendor: 'Amazon Web Services', category: 'cloud_aws', description: 'Centralized security findings aggregator from GuardDuty, Inspector, Macie, and third-party tools.', status: 'connected', protocol: 'ASFF / EventBridge' },
  { id: 'aws-4', name: 'AWS VPC Flow Logs', vendor: 'Amazon Web Services', category: 'cloud_aws', description: 'Captures IP traffic metadata for VPC network interfaces, subnets, and VPCs at scale.', status: 'connected', protocol: 'CloudWatch Logs / S3 / Kinesis' },
  { id: 'aws-5', name: 'AWS WAF Logs', vendor: 'Amazon Web Services', category: 'cloud_aws', description: 'Web application firewall request logs with rule match details for CloudFront, ALB, and API Gateway.', status: 'available', protocol: 'S3 / Kinesis Firehose' },

  // ── Cloud Security - Azure ──
  { id: 'az-1', name: 'Azure Monitor', vendor: 'Microsoft', category: 'cloud_azure', description: 'Platform metrics, activity logs, and diagnostic logs from all Azure resources and subscriptions.', status: 'connected', protocol: 'Log Analytics API / Event Hub' },
  { id: 'az-2', name: 'Microsoft Defender for Cloud', vendor: 'Microsoft', category: 'cloud_azure', description: 'Cloud security posture management and workload protection across Azure, AWS, and GCP.', status: 'connected', protocol: 'REST API / Event Hub' },
  { id: 'az-3', name: 'Azure Active Directory / Entra ID', vendor: 'Microsoft', category: 'cloud_azure', description: 'Sign-in logs, audit logs, provisioning logs, and risky user detections from Entra ID.', status: 'connected', protocol: 'Graph API / Event Hub' },
  { id: 'az-4', name: 'Azure Network Watcher', vendor: 'Microsoft', category: 'cloud_azure', description: 'NSG flow logs, packet captures, and network diagnostic tools for Azure virtual networks.', status: 'available', protocol: 'REST API / Storage Account' },

  // ── Cloud Security - GCP ──
  { id: 'gcp-1', name: 'Google Cloud Logging', vendor: 'Google Cloud', category: 'cloud_gcp', description: 'Centralized logging for all GCP services including admin activity, data access, and system events.', status: 'connected', protocol: 'Pub/Sub / REST API' },
  { id: 'gcp-2', name: 'Security Command Center', vendor: 'Google Cloud', category: 'cloud_gcp', description: 'Centralized vulnerability and threat reporting for GCP with asset inventory and attack path simulation.', status: 'connected', protocol: 'Pub/Sub / REST API' },
  { id: 'gcp-3', name: 'Google Chronicle', vendor: 'Google Cloud', category: 'cloud_gcp', description: 'Cloud-native security analytics platform with petabyte-scale ingestion and YARA-L detection rules.', status: 'available', protocol: 'Ingestion API / Forwarder' },
  { id: 'gcp-4', name: 'GCP VPC Flow Logs', vendor: 'Google Cloud', category: 'cloud_gcp', description: 'Network flow telemetry for VPC subnetworks including 5-tuple data and geolocation metadata.', status: 'available', protocol: 'Pub/Sub / BigQuery Export' },

  // ── Endpoint Detection & Response ──
  { id: 'edr-1', name: 'CrowdStrike Falcon', vendor: 'CrowdStrike', category: 'edr', description: 'Cloud-delivered endpoint protection with real-time IoA detection, threat graph, and Falcon Data Replicator streaming.', status: 'connected', protocol: 'Streaming API / FDR (S3)' },
  { id: 'edr-2', name: 'SentinelOne Singularity', vendor: 'SentinelOne', category: 'edr', description: 'Autonomous AI-driven endpoint, cloud, and identity protection with Deep Visibility hunting.', status: 'connected', protocol: 'REST API / Syslog CEF' },
  { id: 'edr-3', name: 'VMware Carbon Black', vendor: 'Broadcom (VMware)', category: 'edr', description: 'Cloud-native endpoint detection with continuous recording and unfiltered process-level visibility.', status: 'available', protocol: 'REST API / Syslog / Event Forwarder' },
  { id: 'edr-4', name: 'Microsoft Defender for Endpoint', vendor: 'Microsoft', category: 'edr', description: 'Enterprise endpoint security platform with automated investigation, threat analytics, and attack surface reduction.', status: 'connected', protocol: 'Streaming API / Graph Security API' },
  { id: 'edr-5', name: 'Cybereason', vendor: 'Cybereason', category: 'edr', description: 'Operation-centric security platform that detects and responds to advanced attacks across the enterprise.', status: 'available', protocol: 'REST API / Syslog' },

  // ── Network Security / Firewalls ──
  { id: 'fw-1', name: 'Palo Alto Networks NGFW', vendor: 'Palo Alto Networks', category: 'firewall', description: 'Next-gen firewall with App-ID, User-ID, and Threat Prevention logging via Cortex Data Lake or Panorama.', status: 'connected', protocol: 'Syslog / Cortex Data Lake API' },
  { id: 'fw-2', name: 'Fortinet FortiGate', vendor: 'Fortinet', category: 'firewall', description: 'Network security appliance with UTM, SD-WAN, and FortiGuard threat intelligence feeds.', status: 'connected', protocol: 'Syslog / FortiAnalyzer API' },
  { id: 'fw-3', name: 'Check Point Quantum', vendor: 'Check Point', category: 'firewall', description: 'Enterprise firewall with ThreatCloud AI, SandBlast zero-day protection, and SmartEvent logging.', status: 'available', protocol: 'LEA / OPSEC / Syslog' },
  { id: 'fw-4', name: 'Cisco Secure Firewall', vendor: 'Cisco', category: 'firewall', description: 'Next-gen firewall (FTD/ASA) with Snort 3 IPS, encrypted traffic analytics, and SecureX integration.', status: 'connected', protocol: 'eStreamer / Syslog / REST API' },
  { id: 'fw-5', name: 'Juniper SRX Series', vendor: 'Juniper Networks', category: 'firewall', description: 'Services gateway with advanced threat prevention, IDP, and Security Director centralized management.', status: 'available', protocol: 'Syslog / NETCONF / REST API' },

  // ── Identity & Access Management ──
  { id: 'iam-1', name: 'Okta', vendor: 'Okta', category: 'iam', description: 'Cloud identity platform with SSO, MFA, and lifecycle management. Streams system log events for security monitoring.', status: 'connected', protocol: 'System Log API / Event Hook' },
  { id: 'iam-2', name: 'CyberArk Privileged Access', vendor: 'CyberArk', category: 'iam', description: 'Privileged access management for credentials, sessions, and secrets with full session recording.', status: 'connected', protocol: 'REST API / Syslog / SIEM Integration' },
  { id: 'iam-3', name: 'Ping Identity', vendor: 'Ping Identity', category: 'iam', description: 'Enterprise identity security with PingFederate SSO, PingAccess API security, and PingDirectory.', status: 'available', protocol: 'REST API / Audit Log Export' },
  { id: 'iam-4', name: 'OneLogin', vendor: 'OneLogin (One Identity)', category: 'iam', description: 'Cloud IAM with unified SSO, VLDAP, SmartFactor Authentication, and real-time event webhooks.', status: 'available', protocol: 'Events API / Webhook' },
  { id: 'iam-5', name: 'SailPoint IdentityNow', vendor: 'SailPoint', category: 'iam', description: 'Identity governance platform with AI-driven access decisions, certifications, and separation of duties.', status: 'beta', protocol: 'REST API / Event Trigger' },

  // ── Email Security ──
  { id: 'email-1', name: 'Proofpoint TAP', vendor: 'Proofpoint', category: 'email', description: 'Targeted Attack Protection with URL defense, attachment sandboxing, and threat insight dashboard.', status: 'connected', protocol: 'SIEM API / Syslog CEF' },
  { id: 'email-2', name: 'Mimecast', vendor: 'Mimecast', category: 'email', description: 'Email security with threat protection, data leak prevention, URL rewriting, and impersonation protection.', status: 'connected', protocol: 'SIEM Integration API / Syslog' },
  { id: 'email-3', name: 'Microsoft Defender for Office 365', vendor: 'Microsoft', category: 'email', description: 'Advanced threat protection for Exchange Online with Safe Links, Safe Attachments, and anti-phishing.', status: 'connected', protocol: 'Management Activity API / Streaming' },
  { id: 'email-4', name: 'Barracuda Email Protection', vendor: 'Barracuda Networks', category: 'email', description: 'AI-powered email threat detection covering phishing, business email compromise, and account takeover.', status: 'available', protocol: 'Syslog / REST API' },

  // ── Vulnerability Management ──
  { id: 'vuln-1', name: 'Qualys VMDR', vendor: 'Qualys', category: 'vuln', description: 'Vulnerability Management, Detection and Response with continuous asset discovery, TruRisk scoring, and patch prioritization.', status: 'connected', protocol: 'REST API v2 / Qualys Agent' },
  { id: 'vuln-2', name: 'Tenable Vulnerability Management', vendor: 'Tenable', category: 'vuln', description: 'Nessus-powered vulnerability assessment with predictive prioritization and exposure analytics.', status: 'connected', protocol: 'REST API / Syslog CEF' },
  { id: 'vuln-3', name: 'Rapid7 InsightVM', vendor: 'Rapid7', category: 'vuln', description: 'Live vulnerability and endpoint analytics with risk-prioritized view and built-in remediation workflows.', status: 'available', protocol: 'REST API / Syslog' },
  { id: 'vuln-4', name: 'Snyk', vendor: 'Snyk', category: 'vuln', description: 'Developer-first security for open source dependencies, containers, IaC, and code with CI/CD integration.', status: 'available', protocol: 'REST API / Webhook' },
  { id: 'vuln-5', name: 'Wiz', vendor: 'Wiz', category: 'vuln', description: 'Agentless cloud security platform with full-stack visibility across VMs, containers, serverless, and data stores.', status: 'beta', protocol: 'REST API / Webhook / S3 Export' },

  // ── Threat Intelligence Platforms ──
  { id: 'ti-1', name: 'MISP', vendor: 'MISP Project (Open Source)', category: 'threat_intel', description: 'Open-source threat intelligence sharing platform with STIX/TAXII support and automated correlation.', status: 'connected', protocol: 'REST API / STIX/TAXII / ZMQ' },
  { id: 'ti-2', name: 'Recorded Future', vendor: 'Recorded Future', category: 'threat_intel', description: 'Intelligence cloud with real-time threat analysis covering the open, deep, and dark web.', status: 'connected', protocol: 'Connect API / STIX/TAXII' },
  { id: 'ti-3', name: 'Mandiant Threat Intelligence', vendor: 'Google (Mandiant)', category: 'threat_intel', description: 'Frontline intelligence from incident response engagements with actor profiles and campaign tracking.', status: 'available', protocol: 'REST API v4 / STIX 2.1' },
  { id: 'ti-4', name: 'AlienVault OTX', vendor: 'AT&T Cybersecurity', category: 'threat_intel', description: 'Open Threat Exchange with community-driven threat data including pulses, IoCs, and adversary analysis.', status: 'connected', protocol: 'DirectConnect API / STIX/TAXII' },
  { id: 'ti-5', name: 'VirusTotal Enterprise', vendor: 'Google (VirusTotal)', category: 'threat_intel', description: 'Malware and URL analysis platform with hunting, retrohunt, and live network traffic context.', status: 'connected', protocol: 'REST API v3 / VT Hunting' },

  // ── Web Application Firewall ──
  { id: 'waf-1', name: 'Cloudflare WAF', vendor: 'Cloudflare', category: 'waf', description: 'Edge-deployed web application firewall with managed rulesets, bot management, and rate limiting.', status: 'connected', protocol: 'Logpush (S3/R2) / GraphQL API' },
  { id: 'waf-2', name: 'AWS WAF', vendor: 'Amazon Web Services', category: 'waf', description: 'Web application firewall for CloudFront, ALB, and API Gateway with managed rule groups.', status: 'available', protocol: 'Kinesis Firehose / S3 / CloudWatch' },
  { id: 'waf-3', name: 'Akamai App & API Protector', vendor: 'Akamai', category: 'waf', description: 'Adaptive security for web apps and APIs with automated policy tuning and bot visibility.', status: 'available', protocol: 'SIEM Integration / Datastream' },
  { id: 'waf-4', name: 'Imperva WAF', vendor: 'Imperva (Thales)', category: 'waf', description: 'Cloud and on-prem WAF with virtual patching, API security, and advanced bot protection.', status: 'available', protocol: 'Syslog CEF / REST API / S3' },

  // ── Data Loss Prevention ──
  { id: 'dlp-1', name: 'Symantec DLP', vendor: 'Broadcom (Symantec)', category: 'dlp', description: 'Enterprise DLP for endpoints, network, storage, and cloud apps with content-aware detection policies.', status: 'connected', protocol: 'Syslog / REST API / ICAP' },
  { id: 'dlp-2', name: 'Digital Guardian', vendor: 'Fortra (Digital Guardian)', category: 'dlp', description: 'Data-centric security platform with endpoint DLP, network DLP, and cloud data protection.', status: 'available', protocol: 'REST API / Syslog CEF' },
  { id: 'dlp-3', name: 'Microsoft Purview DLP', vendor: 'Microsoft', category: 'dlp', description: 'Unified data loss prevention across Microsoft 365, endpoints, on-premises, and non-Microsoft cloud apps.', status: 'connected', protocol: 'Management Activity API / Graph API' },
  { id: 'dlp-4', name: 'Forcepoint DLP', vendor: 'Forcepoint', category: 'dlp', description: 'Risk-adaptive data protection with behavioral analytics, OCR, and pre-defined compliance templates.', status: 'available', protocol: 'Syslog / REST API' },

  // ── Container & Kubernetes Security ──
  { id: 'k8s-1', name: 'Aqua Security', vendor: 'Aqua Security', category: 'container', description: 'Full lifecycle container security with image scanning, runtime protection, and Kubernetes admission control.', status: 'connected', protocol: 'REST API / Webhook / Syslog' },
  { id: 'k8s-2', name: 'Prisma Cloud', vendor: 'Palo Alto Networks', category: 'container', description: 'Cloud-native application protection platform covering host, container, serverless, and IaC security.', status: 'connected', protocol: 'REST API / Webhook' },
  { id: 'k8s-3', name: 'Sysdig Secure', vendor: 'Sysdig', category: 'container', description: 'Runtime security and compliance for containers and Kubernetes using syscall-level visibility.', status: 'available', protocol: 'REST API / Syslog / Event Forwarding' },
  { id: 'k8s-4', name: 'Falco', vendor: 'Falco (CNCF)', category: 'container', description: 'Open-source cloud-native runtime security using kernel-level system call monitoring with custom rules.', status: 'available', protocol: 'gRPC / Webhook / Syslog' },

  // ── DevSecOps & CI/CD Security ──
  { id: 'dev-1', name: 'GitHub Advanced Security', vendor: 'GitHub (Microsoft)', category: 'devsecops', description: 'Code scanning (CodeQL), secret scanning, and dependency review integrated directly into GitHub workflows.', status: 'connected', protocol: 'Webhook / REST API / SARIF' },
  { id: 'dev-2', name: 'GitLab Ultimate Security', vendor: 'GitLab', category: 'devsecops', description: 'Built-in SAST, DAST, dependency scanning, container scanning, and license compliance in CI pipelines.', status: 'available', protocol: 'REST API / Webhook' },
  { id: 'dev-3', name: 'SonarQube', vendor: 'SonarSource', category: 'devsecops', description: 'Continuous code quality and security analysis for 30+ languages with taint analysis and hotspot review.', status: 'available', protocol: 'REST API / Webhook' },
  { id: 'dev-4', name: 'Checkmarx One', vendor: 'Checkmarx', category: 'devsecops', description: 'Application security testing platform with SAST, SCA, DAST, API security, and IaC scanning.', status: 'beta', protocol: 'REST API / Webhook / SARIF' },

  // ── Network Detection & Response ──
  { id: 'ndr-1', name: 'Darktrace', vendor: 'Darktrace', category: 'ndr', description: 'Self-learning AI for network detection using unsupervised ML to model normal behavior and detect anomalies.', status: 'connected', protocol: 'REST API / Syslog CEF / STIX' },
  { id: 'ndr-2', name: 'Vectra AI', vendor: 'Vectra AI', category: 'ndr', description: 'AI-driven threat detection and response for network, cloud, and identity with attack signal intelligence.', status: 'connected', protocol: 'REST API / Syslog CEF' },
  { id: 'ndr-3', name: 'ExtraHop Reveal(x)', vendor: 'ExtraHop', category: 'ndr', description: 'Network detection and response with real-time wire data analysis, encrypted traffic analysis, and ML-based detections.', status: 'available', protocol: 'REST API / Syslog / Webhook' },
  { id: 'ndr-4', name: 'Corelight', vendor: 'Corelight', category: 'ndr', description: 'Open NDR platform built on Zeek with smart PCAP, encrypted traffic collection, and entity analytics.', status: 'available', protocol: 'Zeek Logs / Kafka / REST API' },

  // ── Cloud Access Security Broker ──
  { id: 'casb-1', name: 'Netskope Intelligent SSE', vendor: 'Netskope', category: 'casb', description: 'Inline CASB, SWG, ZTNA and SSPM with real-time DLP, threat protection, and user behavior analytics across cloud apps, web, and private apps. Ingests network, application, alert, page, infrastructure, and connection events via REST API v2 iterator/time-range endpoints and Cloud Exchange Log Shipper (CEF/JSON over Syslog/S3).', status: 'connected', protocol: 'REST API v2 Iterator + Time-Range / CEF Syslog / Cloud Exchange Log Shipper / S3 Export' },
  { id: 'casb-2', name: 'Zscaler Internet Access', vendor: 'Zscaler', category: 'casb', description: 'Cloud security service edge with inline inspection, sandboxing, and cloud app visibility for all traffic.', status: 'connected', protocol: 'Nanolog Streaming / REST API' },
  { id: 'casb-3', name: 'Microsoft Defender for Cloud Apps', vendor: 'Microsoft', category: 'casb', description: 'Cloud app security broker with shadow IT discovery, information protection, and threat detection for SaaS.', status: 'available', protocol: 'REST API / SIEM Agent / Streaming' },
  { id: 'casb-4', name: 'Cisco Cloudlock', vendor: 'Cisco', category: 'casb', description: 'API-based CASB for SaaS app control with DLP, user behavior analytics, and OAuth app governance.', status: 'available', protocol: 'REST API / Syslog' },

  // ── Security Orchestration (SOAR) ──
  { id: 'soar-1', name: 'Cortex XSOAR', vendor: 'Palo Alto Networks', category: 'soar', description: 'Security orchestration, automation, and response with 700+ integrations, playbooks, and case management.', status: 'connected', protocol: 'REST API / Webhook / Demisto SDK' },
  { id: 'soar-2', name: 'Splunk SOAR', vendor: 'Splunk (Cisco)', category: 'soar', description: 'Security orchestration platform (formerly Phantom) with visual playbook editor and 350+ app integrations.', status: 'connected', protocol: 'REST API / Webhook' },
  { id: 'soar-3', name: 'Swimlane Turbine', vendor: 'Swimlane', category: 'soar', description: 'Low-code security automation platform with AI-enhanced playbooks and case management for SOC teams.', status: 'available', protocol: 'REST API / Webhook' },
  { id: 'soar-4', name: 'Tines', vendor: 'Tines', category: 'soar', description: 'No-code automation platform for security teams with story-based workflows and smart API integrations.', status: 'available', protocol: 'REST API / Webhook' },

  // ── Log Management & Observability ──
  { id: 'obs-1', name: 'Datadog Security Monitoring', vendor: 'Datadog', category: 'observability', description: 'Cloud-scale security monitoring with threat detection rules, Cloud SIEM, and unified observability.', status: 'connected', protocol: 'REST API / Agent / Syslog' },
  { id: 'obs-2', name: 'Sumo Logic', vendor: 'Sumo Logic', category: 'observability', description: 'Cloud-native log analytics and security intelligence with ML-driven anomaly detection.', status: 'available', protocol: 'REST API / Hosted Collector / Syslog' },
  { id: 'obs-3', name: 'New Relic', vendor: 'New Relic', category: 'observability', description: 'Full-stack observability with APM, infrastructure monitoring, log management, and vulnerability management.', status: 'available', protocol: 'REST API / Agent / OpenTelemetry' },
  { id: 'obs-4', name: 'Grafana Loki', vendor: 'Grafana Labs', category: 'observability', description: 'Horizontally-scalable log aggregation system with LogQL query language and Grafana visualization.', status: 'available', protocol: 'REST API / Promtail / Fluentd' },

  // ── ICS / OT Security ──
  { id: 'ics-1', name: 'Claroty', vendor: 'Claroty', category: 'ics_ot', description: 'Industrial cybersecurity for OT, IoT, and IIoT with asset discovery, threat detection, and vulnerability management.', status: 'connected', protocol: 'REST API / Syslog CEF / STIX' },
  { id: 'ics-2', name: 'Dragos Platform', vendor: 'Dragos', category: 'ics_ot', description: 'OT cybersecurity platform with asset visibility, threat detection, and ICS-specific threat intelligence.', status: 'available', protocol: 'REST API / Syslog / STIX/TAXII' },
  { id: 'ics-3', name: 'Nozomi Networks', vendor: 'Nozomi Networks', category: 'ics_ot', description: 'OT and IoT security with AI-powered anomaly detection, asset intelligence, and protocol analysis.', status: 'available', protocol: 'REST API / Syslog / SNMP' },
  { id: 'ics-4', name: 'Tenable OT Security', vendor: 'Tenable', category: 'ics_ot', description: 'Comprehensive OT security with deep packet inspection for ICS protocols (Modbus, DNP3, S7, EtherNet/IP).', status: 'beta', protocol: 'REST API / Syslog CEF' },

  // ── PLC & OT Native Protocols ──
  { id: 'plc-1', name: 'Siemens S7comm / S7comm-Plus', vendor: 'Siemens', category: 'plc_ot_protocols', description: 'Native connector for Siemens S7-300/400/1200/1500 PLCs using S7comm and S7comm-Plus protocols over ISO-on-TCP (RFC 1006). Captures read/write variable access, program uploads/downloads, CPU state changes, and diagnostic buffer events.', status: 'connected', protocol: 'S7comm / S7comm-Plus (TCP/102)' },
  { id: 'plc-2', name: 'Modbus TCP/RTU', vendor: 'Modicon (Schneider Electric)', category: 'plc_ot_protocols', description: 'Universal Modbus protocol connector supporting TCP (port 502) and serial RTU/ASCII modes. Monitors register read/write operations, coil manipulations, function code anomalies, and unauthorized slave address access across PLCs, RTUs, and field devices.', status: 'connected', protocol: 'Modbus TCP (502) / Modbus RTU (Serial)' },
  { id: 'plc-3', name: 'EtherNet/IP & CIP', vendor: 'Rockwell Automation / ODVA', category: 'plc_ot_protocols', description: 'Common Industrial Protocol (CIP) over EtherNet/IP for Allen-Bradley ControlLogix, CompactLogix, and third-party devices. Monitors implicit/explicit messaging, tag read/write, firmware changes, and controller mode transitions.', status: 'connected', protocol: 'EtherNet/IP (TCP/44818, UDP/2222) / CIP' },
  { id: 'plc-4', name: 'OPC UA', vendor: 'OPC Foundation', category: 'plc_ot_protocols', description: 'OPC Unified Architecture protocol connector for secure, cross-platform industrial interoperability. Captures node browse operations, subscription data changes, method calls, certificate exchanges, and session authentication events.', status: 'connected', protocol: 'OPC UA Binary (TCP/4840) / OPC UA HTTPS' },
  { id: 'plc-5', name: 'DNP3 (IEEE 1815)', vendor: 'IEEE / DNP Users Group', category: 'plc_ot_protocols', description: 'Distributed Network Protocol for electric utilities, water systems, and SCADA. Monitors binary/analog I/O points, unsolicited responses, file transfers, secure authentication (SA v5), and broadcast commands.', status: 'connected', protocol: 'DNP3 TCP (20000) / DNP3 Serial' },
  { id: 'plc-6', name: 'IEC 61850 / GOOSE / MMS', vendor: 'IEC', category: 'plc_ot_protocols', description: 'Power substation automation protocol suite. Captures GOOSE multicast events (breaker trips, interlocking), MMS file transfers, report control blocks, and Setting Group changes for protective relay monitoring.', status: 'connected', protocol: 'GOOSE (Ethernet L2) / MMS (TCP/102) / SV' },
  { id: 'plc-7', name: 'IEC 60870-5-104', vendor: 'IEC', category: 'plc_ot_protocols', description: 'Telecontrol protocol for power grid SCADA and utility RTUs. Monitors single/double point indications, setpoint commands, interrogation cycles, clock synchronization, and file directory operations.', status: 'available', protocol: 'IEC 104 (TCP/2404)' },
  { id: 'plc-8', name: 'PROFINET / PROFIBUS', vendor: 'Siemens / PROFIBUS & PROFINET International', category: 'plc_ot_protocols', description: 'Fieldbus and real-time Ethernet protocols for Siemens and multi-vendor factory automation. Captures cyclic I/O data exchanges, acyclic parameter access, diagnostics alarms, and device identification changes.', status: 'connected', protocol: 'PROFINET IO (Ethernet RT/IRT) / PROFIBUS DP (Serial)' },
  { id: 'plc-9', name: 'BACnet/IP', vendor: 'ASHRAE', category: 'plc_ot_protocols', description: 'Building Automation and Control network protocol for HVAC, lighting, fire, and access systems. Monitors property value changes, schedule modifications, trend log data, and life safety point states.', status: 'available', protocol: 'BACnet/IP (UDP/47808) / BACnet MS/TP' },
  { id: 'plc-10', name: 'HART-IP', vendor: 'FieldComm Group', category: 'plc_ot_protocols', description: 'Highway Addressable Remote Transducer protocol for smart field instruments (sensors, transmitters, valve positioners). Captures device diagnostics, calibration changes, configuration writes, and burst-mode process variables.', status: 'available', protocol: 'HART-IP (UDP/5094, TCP/5094) / HART (4-20mA FSK)' },
  { id: 'plc-11', name: 'FINS (Omron)', vendor: 'Omron', category: 'plc_ot_protocols', description: 'Factory Interface Network Service protocol for Omron CJ/CS/NJ/NX-series PLCs. Monitors memory area read/write, CPU mode changes, forced bit operations, program area transfers, and error log access.', status: 'available', protocol: 'FINS TCP/UDP (9600) / FINS Serial' },
  { id: 'plc-12', name: 'MELSEC (Mitsubishi)', vendor: 'Mitsubishi Electric', category: 'plc_ot_protocols', description: 'MC Protocol and SLMP connector for Mitsubishi MELSEC iQ-R, iQ-F, Q, and L-series PLCs. Captures device batch read/write, buffer memory access, CPU monitoring, and remote RUN/STOP commands.', status: 'available', protocol: 'MC Protocol / SLMP (TCP/5000-5010)' },
  { id: 'plc-13', name: 'CC-Link IE / CC-Link', vendor: 'Mitsubishi Electric / CLPA', category: 'plc_ot_protocols', description: 'Open industrial network for factory and process automation. Captures cyclic transmission data, transient message exchanges, station status changes, and network health diagnostics.', status: 'beta', protocol: 'CC-Link IE (Gigabit Ethernet) / CC-Link (Serial)' },
  { id: 'plc-14', name: 'GE SRTP / EGD', vendor: 'GE Vernova (Emerson)', category: 'plc_ot_protocols', description: 'Service Request Transport Protocol for GE PACSystems (RX3i, RXi) and Series 90 PLCs. Captures privileged operations, logic downloads, I/O forcing, and Ethernet Global Data multicast exchanges.', status: 'beta', protocol: 'SRTP (TCP/18245) / EGD (UDP multicast)' },
  { id: 'plc-15', name: 'CODESYS V3 Protocol', vendor: 'CODESYS GmbH', category: 'plc_ot_protocols', description: 'Runtime protocol for 500+ PLC manufacturers using CODESYS (Wago, Beckhoff, ABB, Festo). Monitors application downloads, online changes, variable forcing, boot project changes, and user authentication events.', status: 'beta', protocol: 'CODESYS V3 (TCP/11740, UDP/1740-1743)' },
  { id: 'plc-16', name: 'EtherCAT', vendor: 'Beckhoff / ETG', category: 'plc_ot_protocols', description: 'High-performance real-time Ethernet fieldbus for motion control and I/O. Captures process data telegrams, mailbox CoE/SoE exchanges, topology changes, and distributed clock synchronization events.', status: 'available', protocol: 'EtherCAT (Ethernet L2, EtherType 0x88A4)' },
  { id: 'plc-17', name: 'Foundation Fieldbus / FF-HSE', vendor: 'FieldComm Group', category: 'plc_ot_protocols', description: 'Process automation fieldbus for refineries, chemical plants, and oil/gas. Monitors function block execution, link active scheduler changes, device alerts, and fieldbus diagnostic counters.', status: 'beta', protocol: 'FF H1 (31.25 kbit/s) / FF HSE (Ethernet)' },
  { id: 'plc-18', name: 'Yokogawa CENTUM VP / Vnet/IP', vendor: 'Yokogawa', category: 'plc_ot_protocols', description: 'Integrated DCS communication for Yokogawa CENTUM VP and ProSafe-RS safety systems. Captures SOE (Sequence of Events), batch operation changes, field device diagnostics, and operator action logging.', status: 'beta', protocol: 'Vnet/IP (Proprietary Ethernet) / OPC UA Gateway' },
  { id: 'plc-19', name: 'ABB AC 800M / Freelance', vendor: 'ABB', category: 'plc_ot_protocols', description: 'DCS controller communication for ABB Ability Symphony Plus and Freelance systems. Monitors MMS-based object access, control module state changes, sequence logic execution, and safety interlock events.', status: 'beta', protocol: 'MMS (TCP/102) / OPC UA / ABB Proprietary' },
  { id: 'plc-20', name: 'Honeywell Experion CDA', vendor: 'Honeywell', category: 'plc_ot_protocols', description: 'Control Data Access protocol for Honeywell Experion PKS C300/ACE controllers. Captures point value changes, control strategy downloads, sequence operations, and SIS (Safety Instrumented System) events.', status: 'beta', protocol: 'CDA (Proprietary) / OPC UA / FTE (Fault Tolerant Ethernet)' },

  // ── DNS Security ──
  { id: 'dns-1', name: 'Cisco Umbrella', vendor: 'Cisco', category: 'dns', description: 'Cloud-delivered DNS security with threat intelligence, web filtering, and DNS-layer protection.', status: 'connected', protocol: 'S3 Log Export / REST API' },
  { id: 'dns-2', name: 'Infoblox BloxOne Threat Defense', vendor: 'Infoblox', category: 'dns', description: 'DNS-based threat defense with threat intelligence feeds, DNS tunneling detection, and response policy zones.', status: 'available', protocol: 'REST API / Syslog / STIX/TAXII' },
  { id: 'dns-3', name: 'DNSFilter', vendor: 'DNSFilter', category: 'dns', description: 'AI-powered DNS threat protection with domain categorization, content filtering, and roaming client.', status: 'available', protocol: 'REST API / Syslog' },
  { id: 'dns-4', name: 'Cloudflare Gateway', vendor: 'Cloudflare', category: 'dns', description: 'Secure DNS gateway with DNS filtering, HTTP inspection, and zero trust network access controls.', status: 'available', protocol: 'Logpush / REST API' },

  // ── Endpoint Management ──
  { id: 'em-1', name: 'Microsoft Intune', vendor: 'Microsoft', category: 'endpoint_mgmt', description: 'Cloud-based unified endpoint management for device compliance, configuration, and conditional access.', status: 'connected', protocol: 'Graph API / Log Analytics' },
  { id: 'em-2', name: 'Jamf Pro', vendor: 'Jamf', category: 'endpoint_mgmt', description: 'Apple device management with compliance enforcement, app management, and security configuration baselines.', status: 'available', protocol: 'REST API / Webhook / Syslog' },
  { id: 'em-3', name: 'Tanium', vendor: 'Tanium', category: 'endpoint_mgmt', description: 'Real-time endpoint visibility and control with sub-15-second query response across millions of endpoints.', status: 'connected', protocol: 'REST API / Connect Module / Syslog' },
  { id: 'em-4', name: 'CrowdStrike Falcon Discover', vendor: 'CrowdStrike', category: 'endpoint_mgmt', description: 'IT hygiene and asset inventory with real-time visibility into managed and unmanaged devices.', status: 'available', protocol: 'REST API / FDR' },

  // ── Compliance & GRC ──
  { id: 'grc-1', name: 'ServiceNow GRC', vendor: 'ServiceNow', category: 'grc', description: 'Governance, risk, and compliance platform with policy management, risk assessment, and continuous monitoring.', status: 'connected', protocol: 'REST API / MID Server / Syslog' },
  { id: 'grc-2', name: 'RSA Archer', vendor: 'RSA (Archer)', category: 'grc', description: 'Integrated risk management platform with risk quantification, compliance tracking, and third-party risk assessment.', status: 'available', protocol: 'REST API / Data Feed' },
  { id: 'grc-3', name: 'Drata', vendor: 'Drata', category: 'grc', description: 'Continuous compliance automation for SOC 2, ISO 27001, HIPAA, and PCI DSS with evidence collection.', status: 'available', protocol: 'REST API / Webhook' },
  { id: 'grc-4', name: 'Vanta', vendor: 'Vanta', category: 'grc', description: 'Automated security and compliance monitoring with continuous assessment and audit-ready evidence.', status: 'beta', protocol: 'REST API / Agent' },

  // ── Messaging & Collaboration ──
  { id: 'collab-1', name: 'Slack Enterprise Audit', vendor: 'Salesforce (Slack)', category: 'collaboration', description: 'Enterprise Grid audit logs capturing user actions, app installations, workspace changes, and file activities.', status: 'connected', protocol: 'Audit Logs API / Event API' },
  { id: 'collab-2', name: 'Microsoft 365 Audit Log', vendor: 'Microsoft', category: 'collaboration', description: 'Unified audit logging for Exchange, SharePoint, Teams, OneDrive, and Azure AD activities.', status: 'connected', protocol: 'Management Activity API / Streaming' },
  { id: 'collab-3', name: 'Google Workspace Audit', vendor: 'Google', category: 'collaboration', description: 'Admin audit, login, Drive, and token activity reports for Google Workspace enterprise accounts.', status: 'available', protocol: 'Reports API / Alert Center API' },

  // ── Database Security ──
  { id: 'db-1', name: 'IBM Guardium', vendor: 'IBM', category: 'database', description: 'Database activity monitoring and compliance with real-time alerting, vulnerability assessment, and data classification.', status: 'connected', protocol: 'S-TAP Agent / REST API / Syslog' },
  { id: 'db-2', name: 'Imperva Data Security', vendor: 'Imperva (Thales)', category: 'database', description: 'Database security with activity monitoring, data masking, vulnerability scanning, and compliance reporting.', status: 'available', protocol: 'Agent / REST API / Syslog CEF' },
  { id: 'db-3', name: 'Oracle Audit Vault', vendor: 'Oracle', category: 'database', description: 'Database firewall and audit vault with consolidated audit data from Oracle, SQL Server, MySQL, and more.', status: 'available', protocol: 'Audit Collection Agent / REST API' },

  // ── Zero Trust & Secure Access ──
  { id: 'zt-1', name: 'Zscaler Private Access', vendor: 'Zscaler', category: 'zero_trust', description: 'Zero trust network access replacing VPN with app-specific micro-tunnels and identity-based policies.', status: 'connected', protocol: 'Nanolog Streaming / REST API' },
  { id: 'zt-2', name: 'Cloudflare Access', vendor: 'Cloudflare', category: 'zero_trust', description: 'Zero trust access control for internal applications with identity provider integration and device posture checks.', status: 'available', protocol: 'Logpush / REST API' },
  { id: 'zt-3', name: 'Palo Alto Prisma Access', vendor: 'Palo Alto Networks', category: 'zero_trust', description: 'SASE platform delivering consistent security for remote users, branches, and cloud-delivered enterprise security.', status: 'available', protocol: 'Cortex Data Lake / Syslog / REST API' },
  { id: 'zt-4', name: 'Tailscale', vendor: 'Tailscale', category: 'zero_trust', description: 'WireGuard-based mesh VPN with zero-config deployment, ACLs, and audit logging for secure connectivity.', status: 'beta', protocol: 'REST API / Webhook / Audit Log' },
];
