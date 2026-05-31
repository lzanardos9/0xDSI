import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  User, Globe, Server, FileCode, Search, Shield, AlertTriangle, Clock,
  Activity, MapPin, Network, Eye, Lock, ChevronDown, ChevronRight,
  Crosshair, Zap, TrendingUp, ExternalLink, Ban, Plus, X
} from 'lucide-react';

interface Entity {
  id: string; name: string; type: 'user' | 'ip' | 'hostname' | 'filehash';
  risk: number; classification: 'Malicious' | 'Suspicious' | 'Clean';
  firstSeen: string; lastSeen: string; relatedCount: number;
}

interface TimelineEvent {
  id: string; type: 'login' | 'alert' | 'file_access' | 'network' | 'process' | 'anomaly';
  time: string; title: string; detail: string; severity: 'critical' | 'high' | 'medium' | 'low';
}

interface RelatedNode {
  id: string; label: string; type: 'user' | 'ip' | 'hostname' | 'filehash';
  angle: number; distance: number;
}

const ENTITIES: Entity[] = [
  { id: '1', name: 'jdoe_admin', type: 'user', risk: 87, classification: 'Malicious', firstSeen: '2026-01-15', lastSeen: '2026-04-23', relatedCount: 14 },
  { id: '2', name: '198.51.100.44', type: 'ip', risk: 72, classification: 'Suspicious', firstSeen: '2026-02-08', lastSeen: '2026-04-22', relatedCount: 9 },
  { id: '3', name: 'DC-PROD-01', type: 'hostname', risk: 64, classification: 'Suspicious', firstSeen: '2025-11-20', lastSeen: '2026-04-23', relatedCount: 11 },
  { id: '4', name: 'a3f2...c8d1', type: 'filehash', risk: 95, classification: 'Malicious', firstSeen: '2026-04-18', lastSeen: '2026-04-23', relatedCount: 6 },
  { id: '5', name: '203.0.113.12', type: 'ip', risk: 34, classification: 'Clean', firstSeen: '2026-03-01', lastSeen: '2026-04-21', relatedCount: 3 },
  { id: '6', name: 'fin_trader_07', type: 'user', risk: 91, classification: 'Malicious', firstSeen: '2025-12-01', lastSeen: '2026-04-23', relatedCount: 22 },
  { id: '7', name: 'BMC-RACK-14', type: 'hostname', risk: 98, classification: 'Malicious', firstSeen: '2026-03-28', lastSeen: '2026-04-23', relatedCount: 18 },
  { id: '8', name: '10.200.0.77', type: 'ip', risk: 82, classification: 'Suspicious', firstSeen: '2026-02-15', lastSeen: '2026-04-23', relatedCount: 15 },
  { id: '9', name: 'e7b3...91fa', type: 'filehash', risk: 99, classification: 'Malicious', firstSeen: '2026-04-20', lastSeen: '2026-04-23', relatedCount: 8 },
  { id: '10', name: 'svc_maven_build', type: 'user', risk: 88, classification: 'Malicious', firstSeen: '2026-01-10', lastSeen: '2026-04-23', relatedCount: 31 },
];

const makeEvents = (eid: string): TimelineEvent[] => {
  const entitySpecificEvents: Record<string, TimelineEvent[]> = {
    '6': [
      { id: '6-ev-0', type: 'anomaly', severity: 'critical', time: '2026-04-23 02:14:00', title: 'Dark web credential listing detected', detail: 'VPN credentials for fin_trader_07 discovered on Genesis Market listing ID GM-88412. Credential bundle includes MFA seed and session tokens. Threat intel source: DarkOwl feed.' },
      { id: '6-ev-1', type: 'alert', severity: 'critical', time: '2026-04-22 19:33:00', title: 'Unauthorized SWIFT terminal access', detail: 'fin_trader_07 accessed SWIFT Alliance Lite2 terminal outside authorized trading window. No corresponding change ticket or supervisor override found. Transaction codes MT103 and MT202 queued.' },
      { id: '6-ev-2', type: 'anomaly', severity: 'high', time: '2026-04-22 14:07:00', title: 'Trading pattern anomaly', detail: 'Algorithmic analysis flagged 47 rapid micro-trades across 3 currency pairs (USD/CHF, EUR/GBP, JPY/AUD) totaling $12.4M notional. Pattern consistent with layering/spoofing.' },
      { id: '6-ev-3', type: 'network', severity: 'critical', time: '2026-04-21 23:55:00', title: 'Tor exit node communication', detail: 'Outbound HTTPS connection to known Tor exit relay 185.220.101.x from fin_trader_07 workstation. 2.8 MB payload exfiltrated over encrypted channel.' },
      { id: '6-ev-4', type: 'file_access', severity: 'high', time: '2026-04-21 16:20:00', title: 'Unauthorized financial ledger access', detail: 'Read access to /fin/ledgers/reconciliation_q1_2026.xlsx and /fin/ledgers/counterparty_exposure.csv. User not in authorized ACL for these resources.' },
      { id: '6-ev-5', type: 'login', severity: 'medium', time: '2026-04-21 03:47:00', title: 'Off-hours VPN authentication', detail: 'Successful VPN login at 03:47 UTC Sunday from IP 89.234.x.x (Paris, FR). User baseline shows no prior weekend access in 6 months.' },
      { id: '6-ev-6', type: 'process', severity: 'high', time: '2026-04-20 22:11:00', title: 'Credential harvesting tool execution', detail: 'Process mimikatz.exe (renamed to svcutil.exe) detected on workstation WS-TRADE-07. LSASS memory dump attempted. Endpoint EDR quarantined binary.' },
      { id: '6-ev-7', type: 'alert', severity: 'high', time: '2026-04-20 15:30:00', title: 'Insider threat score threshold breach', detail: 'UEBA model scored fin_trader_07 at 91/100 for insider threat risk. Contributing factors: data hoarding, off-hours access, peer group deviation.' },
      { id: '6-ev-8', type: 'network', severity: 'medium', time: '2026-04-19 11:45:00', title: 'Unusual DNS query volume', detail: '1,247 unique DNS queries in 15-minute window from workstation. Pattern consistent with DNS tunneling. Queried domains: *.cdn-stream[.]xyz.' },
      { id: '6-ev-9', type: 'file_access', severity: 'medium', time: '2026-04-18 09:20:00', title: 'Bulk customer PII download', detail: 'Downloaded 34,000 customer records from CRM export API. Volume exceeds 10x daily baseline for this user role. Data includes SSN and account numbers.' },
      { id: '6-ev-10', type: 'login', severity: 'low', time: '2026-04-17 08:55:00', title: 'New device enrollment', detail: 'New device fingerprint registered: Android 14 / Samsung Galaxy S25. Previous devices: 2 (iPhone 15 Pro, MacBook Pro M4). MFA re-enrollment triggered.' },
      { id: '6-ev-11', type: 'anomaly', severity: 'high', time: '2026-04-16 20:30:00', title: 'Peer group behavioral deviation', detail: 'fin_trader_07 activity deviates 4.2 standard deviations from trading desk peer group. Anomalous dimensions: access hours, data volume, system breadth.' },
      { id: '6-ev-12', type: 'alert', severity: 'medium', time: '2026-04-15 14:10:00', title: 'DLP policy violation', detail: 'Attempted upload of financial_model_v3.xlsm to personal OneDrive. File classified as Confidential-Financial. Upload blocked by DLP gateway.' },
      { id: '6-ev-13', type: 'process', severity: 'low', time: '2026-04-14 10:00:00', title: 'Scheduled task creation', detail: 'New scheduled task "SyncUpdate" created to run nightly at 01:00. Task executes PowerShell script from %TEMP% directory. Script contents obfuscated.' },
    ],
    '7': [
      { id: '7-ev-0', type: 'alert', severity: 'critical', time: '2026-04-23 04:22:00', title: 'IPMI sideband traffic anomaly', detail: 'BMC-RACK-14 generating 340 MB/hr of out-of-band IPMI traffic on management VLAN. Normal baseline: 2 MB/hr. Traffic encrypted with non-standard cipher suite.' },
      { id: '7-ev-1', type: 'anomaly', severity: 'critical', time: '2026-04-23 01:15:00', title: 'DMA access pattern violation', detail: 'Direct Memory Access from BMC to host OS kernel space detected. BMC firmware attempting to read /proc/keys and /dev/mem regions. Hardware-level rootkit behavior.' },
      { id: '7-ev-2', type: 'alert', severity: 'critical', time: '2026-04-22 18:40:00', title: 'Firmware hash mismatch', detail: 'BMC firmware SHA-256 hash e7b3a1...91fa does not match golden image baseline. Delta analysis shows 14KB modification in IPMI command handler module. Firmware version spoofed as legitimate.' },
      { id: '7-ev-3', type: 'network', severity: 'critical', time: '2026-04-22 12:30:00', title: 'Covert C2 channel via IPMI SOL', detail: 'Serial-over-LAN channel carrying encoded command data. C2 beacon interval: 37 seconds. Destination: 45.77.x.x (Vultr VPS, Netherlands). Protocol mimics legitimate SOL heartbeat.' },
      { id: '7-ev-4', type: 'process', severity: 'high', time: '2026-04-21 22:05:00', title: 'BMC firmware reflash attempt', detail: 'Unauthorized firmware update initiated via IPMI interface. Update payload sourced from external URL. Reflash survived host OS reinstall confirming persistence at hardware level.' },
      { id: '7-ev-5', type: 'anomaly', severity: 'high', time: '2026-04-21 15:18:00', title: 'Thermal sensor data manipulation', detail: 'BMC reporting false thermal readings to trigger fan speed changes. Acoustic modulation pattern detected - potential air-gap covert channel using fan RPM encoding.' },
      { id: '7-ev-6', type: 'network', severity: 'high', time: '2026-04-20 20:44:00', title: 'ARP poisoning from BMC interface', detail: 'BMC management NIC sending gratuitous ARP replies for gateway IP. Man-in-the-middle positioning on management VLAN. 23 other BMC nodes affected.' },
      { id: '7-ev-7', type: 'file_access', severity: 'high', time: '2026-04-20 09:30:00', title: 'NVRAM secret extraction', detail: 'BMC accessed host UEFI NVRAM variables containing BitLocker recovery keys and TPM sealing data. Secrets exfiltrated via IPMI sideband channel.' },
      { id: '7-ev-8', type: 'alert', severity: 'medium', time: '2026-04-19 14:55:00', title: 'IPMI user account enumeration', detail: 'BMC enumerated all 16 IPMI user slots. 3 dormant admin accounts discovered with default credentials. Accounts activated and passwords changed remotely.' },
      { id: '7-ev-9', type: 'login', severity: 'medium', time: '2026-04-19 07:12:00', title: 'IPMI session from unexpected source', detail: 'IPMI v2.0 session established from 10.200.0.77 (air-gapped network bridge). Session used RAKP-HMAC-SHA256 auth. No corresponding change ticket.' },
      { id: '7-ev-10', type: 'process', severity: 'high', time: '2026-04-18 16:33:00', title: 'Virtual media mount from external source', detail: 'BMC virtual media redirected to mount ISO from external NFS share. ISO contains modified Linux rescue image with backdoor SSH key injected.' },
      { id: '7-ev-11', type: 'anomaly', severity: 'medium', time: '2026-04-17 21:00:00', title: 'Power consumption anomaly', detail: 'Server power draw increased 18W above baseline during idle period. Consistent with BMC executing computational workload (possible cryptomining or hash cracking).' },
      { id: '7-ev-12', type: 'network', severity: 'medium', time: '2026-04-16 13:20:00', title: 'SNMP community string bruteforce', detail: 'BMC observed sending SNMP GET requests with 200+ community strings to adjacent network devices. Scanning infrastructure for additional pivot points.' },
      { id: '7-ev-13', type: 'alert', severity: 'low', time: '2026-04-15 08:45:00', title: 'BMC watchdog timer disabled', detail: 'Hardware watchdog timer disabled via IPMI command. This prevents automatic server reboot on hang, ensuring persistent BMC access survives host OS crashes.' },
    ],
    '8': [
      { id: '8-ev-0', type: 'network', severity: 'critical', time: '2026-04-23 03:05:00', title: 'Acoustic covert channel relay detected', detail: '10.200.0.77 acting as bridge between air-gapped OT network and corporate LAN. Ultrasonic data encoding detected via compromised speakers/microphones at 18-22 kHz range.' },
      { id: '8-ev-1', type: 'alert', severity: 'critical', time: '2026-04-22 21:30:00', title: 'SCADA protocol anomaly', detail: 'Modbus TCP traffic from 10.200.0.77 contains non-standard function codes (0x5A, 0x5B). Payloads embed encoded commands targeting PLC register writes on SCADA HMI.' },
      { id: '8-ev-2', type: 'anomaly', severity: 'high', time: '2026-04-22 14:15:00', title: 'Network segmentation bypass', detail: 'Traffic from 10.200.0.77 traversing 3 VLAN boundaries via VLAN hopping (double 802.1Q tagging). Reaching DMZ hosts that should be unreachable from OT segment.' },
      { id: '8-ev-3', type: 'network', severity: 'high', time: '2026-04-21 19:40:00', title: 'DNS beacon to air-gap bridge C2', detail: 'Periodic DNS TXT queries every 45s to bridge-relay[.]net encoding SCADA telemetry data. Query length analysis confirms steganographic payload embedding.' },
      { id: '8-ev-4', type: 'file_access', severity: 'high', time: '2026-04-21 11:22:00', title: 'PLC ladder logic exfiltration', detail: 'Bulk read of PLC program files from Siemens S7-1500 controllers. 12 ladder logic programs and 4 function block diagrams transferred to 10.200.0.77.' },
      { id: '8-ev-5', type: 'process', severity: 'high', time: '2026-04-20 16:50:00', title: 'Electromagnetic emanation tool detected', detail: 'Software-defined radio (SDR) process running on 10.200.0.77 tuned to 1.2 GHz. Possible TEMPEST-style electromagnetic exfiltration from adjacent air-gapped systems.' },
      { id: '8-ev-6', type: 'alert', severity: 'medium', time: '2026-04-20 08:15:00', title: 'OPC UA unauthorized subscription', detail: 'New OPC UA subscription created on 10.200.0.77 monitoring 847 SCADA data points including pressure, flow rate, and valve positions across 3 industrial zones.' },
      { id: '8-ev-7', type: 'login', severity: 'medium', time: '2026-04-19 22:33:00', title: 'Engineering workstation credential use', detail: 'Credentials for eng_operator_03 used from 10.200.0.77 to authenticate to Historian server. Credential not previously associated with this IP.' },
      { id: '8-ev-8', type: 'network', severity: 'medium', time: '2026-04-19 13:10:00', title: 'ICMP tunnel data exfiltration', detail: 'ICMP echo request/reply pairs carrying 1.4 MB of encoded payload data over 20-minute window. Destination: external IP 91.x.x.x via NAT traversal.' },
      { id: '8-ev-9', type: 'anomaly', severity: 'medium', time: '2026-04-18 17:28:00', title: 'USB device insertion on OT host', detail: 'USB mass storage device (VID:PID 0781:5583 SanDisk) inserted on host connected to 10.200.0.77 subnet. Autorun payload executed within 3 seconds of insertion.' },
      { id: '8-ev-10', type: 'file_access', severity: 'medium', time: '2026-04-17 10:45:00', title: 'Safety system configuration read', detail: 'Read access to SIS (Safety Instrumented System) configuration files on Triconex controller. Safety parameters and trip points exfiltrated.' },
      { id: '8-ev-11', type: 'alert', severity: 'low', time: '2026-04-16 15:20:00', title: 'Network discovery scan', detail: 'SYN scan of OT subnet 10.200.0.0/24 from 10.200.0.77. 34 live hosts discovered. Scan used slow timing (-T1) to evade IDS detection.' },
      { id: '8-ev-12', type: 'process', severity: 'low', time: '2026-04-15 09:00:00', title: 'Proxy chain establishment', detail: 'SOCKS5 proxy chain established through 10.200.0.77 linking OT network to corporate proxy. 3-hop chain via compromised engineering workstations.' },
      { id: '8-ev-13', type: 'login', severity: 'low', time: '2026-04-14 14:30:00', title: 'Default credential access', detail: 'Successful authentication to 10.200.0.77 management interface using default vendor credentials (admin/admin). Interface exposed on management VLAN.' },
    ],
    '9': [
      { id: '9-ev-0', type: 'alert', severity: 'critical', time: '2026-04-23 05:10:00', title: 'Bytecode weaver malicious artifact detected', detail: 'File hash e7b3...91fa identified as AspectJ bytecode weaver injecting runtime hooks into compiled Java classes. Load-time weaving modifies method entry/exit points in 147 microservices.' },
      { id: '9-ev-1', type: 'file_access', severity: 'critical', time: '2026-04-22 23:45:00', title: 'Maven Central cache poisoning', detail: 'Modified artifact deployed to internal Nexus repository mimicking org.aspectj:aspectjweaver:1.9.21. SHA-1 collision with legitimate artifact. Downloaded by 89 build pipelines.' },
      { id: '9-ev-2', type: 'process', severity: 'critical', time: '2026-04-22 17:20:00', title: 'Runtime class transformation detected', detail: 'Java agent (-javaagent) loading e7b3...91fa at JVM startup. Agent uses Instrumentation API to redefine classes at load time. Injects credential-stealing hooks into Spring Security filters.' },
      { id: '9-ev-3', type: 'network', severity: 'high', time: '2026-04-22 10:55:00', title: 'Exfiltration via serialized objects', detail: 'Injected aspect serializing captured credentials and session tokens into outbound HTTP headers (X-Correlation-ID). Data encoded as base64 UUID format to blend with legitimate traffic.' },
      { id: '9-ev-4', type: 'alert', severity: 'high', time: '2026-04-21 20:30:00', title: 'YARA rule: MaliciousAspectJ_Gen1', detail: 'YARA signature match on e7b3...91fa. Rule detects obfuscated AspectJ pointcut definitions targeting javax.crypto and java.security.KeyStore method calls.' },
      { id: '9-ev-5', type: 'anomaly', severity: 'high', time: '2026-04-21 13:15:00', title: 'Build artifact integrity violation', detail: 'Checksum verification failed for 23 artifacts in Maven local repository. Modified JARs contain additional .class files not present in source compilation. Aspect weaver injected post-compile.' },
      { id: '9-ev-6', type: 'file_access', severity: 'high', time: '2026-04-20 18:40:00', title: 'Gradle build script modification', detail: 'build.gradle files in 12 repositories modified to include aspectjweaver dependency with classifier pointing to compromised artifact. Changes committed by svc_maven_build account.' },
      { id: '9-ev-7', type: 'process', severity: 'medium', time: '2026-04-20 11:25:00', title: 'ClassLoader hierarchy manipulation', detail: 'Weaver creating custom ClassLoader to shadow legitimate Spring classes. Intercepting bean initialization to inject monitoring aspects into every @RestController and @Service bean.' },
      { id: '9-ev-8', type: 'network', severity: 'medium', time: '2026-04-19 15:50:00', title: 'Artifact download from suspicious mirror', detail: 'Build pipeline downloaded aspectjweaver from mirror-cdn[.]org instead of Maven Central. Mirror registered 6 days ago. SSL certificate issued by Lets Encrypt with 90-day validity.' },
      { id: '9-ev-9', type: 'alert', severity: 'medium', time: '2026-04-18 22:10:00', title: 'Sigma rule: Supply chain artifact tampering', detail: 'Sigma rule SCR-4412 triggered. Artifact e7b3...91fa contains embedded native code (.so/.dll) within META-INF/native directory. Unusual for pure Java library.' },
      { id: '9-ev-10', type: 'anomaly', severity: 'medium', time: '2026-04-17 16:35:00', title: 'JVM memory allocation spike', detail: 'Services loading e7b3...91fa show 340% increase in metaspace allocation. Weaver generating and loading thousands of synthetic proxy classes at runtime.' },
      { id: '9-ev-11', type: 'file_access', severity: 'low', time: '2026-04-16 12:00:00', title: 'Source repository access pattern', detail: 'Unusual git clone activity: 47 repositories cloned in 10 minutes by svc_maven_build. Repositories span multiple business units. Build scripts extracted and analyzed.' },
      { id: '9-ev-12', type: 'process', severity: 'low', time: '2026-04-15 07:20:00', title: 'Aspect pointcut definition scan', detail: 'Static analysis of e7b3...91fa reveals 34 pointcut definitions targeting authentication, authorization, encryption, and database connection methods across frameworks.' },
      { id: '9-ev-13', type: 'network', severity: 'low', time: '2026-04-14 19:45:00', title: 'Registry API enumeration', detail: 'API calls to Nexus Repository Manager REST API enumerating all hosted repositories, artifact versions, and download statistics. Reconnaissance for supply chain attack surface mapping.' },
    ],
    '10': [
      { id: '10-ev-0', type: 'alert', severity: 'critical', time: '2026-04-23 06:30:00', title: 'Supply chain attack: 147 microservices compromised', detail: 'svc_maven_build account used to inject malicious dependencies into 147 microservice build pipelines. Trojanized artifacts deployed to staging and production environments across 3 Kubernetes clusters.' },
      { id: '10-ev-1', type: 'process', severity: 'critical', time: '2026-04-22 22:15:00', title: 'CI/CD pipeline manipulation', detail: 'Jenkins pipeline definitions modified to include post-build step injecting AspectJ weaver (e7b3...91fa) into final artifacts. Changes made via API token, no UI audit trail.' },
      { id: '10-ev-2', type: 'file_access', severity: 'critical', time: '2026-04-22 16:00:00', title: 'Secrets vault bulk extraction', detail: 'svc_maven_build accessed HashiCorp Vault paths /secret/prod/*, extracting 234 secrets including database credentials, API keys, and TLS private keys. Access token had over-provisioned policy.' },
      { id: '10-ev-3', type: 'network', severity: 'high', time: '2026-04-21 23:40:00', title: 'Container registry poisoning', detail: 'Modified Docker images pushed to internal Harbor registry. 31 base images now contain backdoored entrypoint scripts. Images tagged as latest, overwriting legitimate versions.' },
      { id: '10-ev-4', type: 'login', severity: 'high', time: '2026-04-21 14:55:00', title: 'Service account privilege abuse', detail: 'svc_maven_build used Kubernetes service account token to create privileged pods in kube-system namespace. Pod spec includes hostPID, hostNetwork, and volume mount to /etc/kubernetes/pki.' },
      { id: '10-ev-5', type: 'alert', severity: 'high', time: '2026-04-21 08:20:00', title: 'Git commit signing key compromise', detail: 'GPG signing key for svc_maven_build extracted from CI runner. Attacker can now create signed commits that pass branch protection rules. 12 malicious commits already signed.' },
      { id: '10-ev-6', type: 'anomaly', severity: 'high', time: '2026-04-20 19:30:00', title: 'Build artifact divergence', detail: 'Reproducible build verification failed for 89 artifacts. Compiled output differs from source despite identical inputs. Injected code not visible in source repository.' },
      { id: '10-ev-7', type: 'file_access', severity: 'medium', time: '2026-04-20 12:10:00', title: 'Terraform state file access', detail: 'svc_maven_build read Terraform state files for production infrastructure. State contains resource IDs, private IPs, and cloud provider credentials in plaintext.' },
      { id: '10-ev-8', type: 'process', severity: 'medium', time: '2026-04-19 17:45:00', title: 'Build cache poisoning', detail: 'Gradle build cache entries replaced with pre-compiled artifacts containing backdoor code. Cache key collision attack ensures poisoned entries are served to all developers.' },
      { id: '10-ev-9', type: 'network', severity: 'medium', time: '2026-04-19 10:30:00', title: 'Internal package mirror redirect', detail: 'DNS CNAME record for packages.internal modified to point to attacker-controlled mirror. pip, npm, and Maven clients now resolve to poisoned package repository.' },
      { id: '10-ev-10', type: 'login', severity: 'medium', time: '2026-04-18 21:55:00', title: 'OAuth token scope escalation', detail: 'svc_maven_build OAuth token scope expanded from repo:read to repo:write, admin:org, and admin:gpg_key. Scope change made via GitHub App installation settings.' },
      { id: '10-ev-11', type: 'alert', severity: 'low', time: '2026-04-17 15:40:00', title: 'Dependency confusion attempt', detail: 'Internal package names registered on public npm and PyPI registries by external actor. Version numbers set higher than internal versions to trigger automatic upgrade in builds.' },
      { id: '10-ev-12', type: 'anomaly', severity: 'low', time: '2026-04-16 11:15:00', title: 'Unusual build frequency', detail: 'svc_maven_build triggered 847 builds in 24 hours vs. baseline of 120. Builds concentrated in repositories with highest downstream dependency counts.' },
      { id: '10-ev-13', type: 'file_access', severity: 'low', time: '2026-04-15 06:50:00', title: 'SSH key harvesting from CI runners', detail: 'svc_maven_build enumerated ~/.ssh directories on 14 Jenkins build agents. Collected 23 SSH private keys including deploy keys for production repositories.' },
    ],
  };

  if (entitySpecificEvents[eid]) {
    return entitySpecificEvents[eid];
  }

  const types: TimelineEvent['type'][] = ['login', 'alert', 'file_access', 'network', 'process', 'anomaly'];
  const sevs: TimelineEvent['severity'][] = ['critical', 'high', 'medium', 'low'];
  const titles: Record<string, string[]> = {
    login: ['Successful RDP Login', 'Failed SSH Attempt', 'Kerberos Auth'],
    alert: ['Sigma Rule Match', 'YARA Detection', 'Behavioral Alert'],
    file_access: ['Sensitive File Read', 'Config Modification', 'Binary Drop'],
    network: ['C2 Beacon Detected', 'DNS Exfil Attempt', 'Lateral Movement'],
    process: ['PowerShell Execution', 'LSASS Access', 'Service Install'],
    anomaly: ['Off-hours Activity', 'Impossible Travel', 'Privilege Spike'],
  };
  return Array.from({ length: 14 }, (_, i) => {
    const t = types[i % types.length];
    const tList = titles[t];
    return {
      id: `${eid}-ev-${i}`, type: t, severity: sevs[i % sevs.length],
      time: `2026-04-${String(10 + i).padStart(2, '0')} ${String(8 + (i * 2) % 14).padStart(2, '0')}:${String((i * 17) % 60).padStart(2, '0')}:00`,
      title: tList[i % tList.length],
      detail: `Entity ${eid} triggered ${tList[i % tList.length].toLowerCase()} event. Source context: session-${1000 + i}, rule-ref SIGMA-${2000 + i}. Analyst review recommended.`,
    };
  });
};

const makeRelated = (eid: string): RelatedNode[] => {
  const items: [string, string, RelatedNode['type']][] = [
    ['srv-web-03', 'srv-web-03', 'hostname'], ['10.0.0.55', '10.0.0.55', 'ip'],
    ['admin_svc', 'admin_svc', 'user'], ['b7e4...d2f0', 'b7e4...d2f0', 'filehash'],
    ['192.168.1.10', '192.168.1.10', 'ip'], ['jsmith', 'jsmith', 'user'],
    ['DC-BACKUP-02', 'DC-BACKUP-02', 'hostname'], ['c9a1...f3e7', 'c9a1...f3e7', 'filehash'],
  ];
  return items.map(([id, label, type], i) => ({
    id: `${eid}-rel-${id}`, label, type,
    angle: (i / items.length) * Math.PI * 2,
    distance: 100 + (i % 3) * 20,
  }));
};

const ANOMALIES = [
  { id: 'a1', title: 'Impossible Travel', icon: MapPin, score: 92, desc: 'Login from NYC then London within 14 minutes' },
  { id: 'a2', title: 'Off-Hours Access', icon: Clock, score: 78, desc: 'Accessed sensitive systems at 03:47 UTC on Sunday' },
  { id: 'a3', title: 'Privilege Escalation', icon: TrendingUp, score: 85, desc: 'Elevated to domain admin without change ticket' },
  { id: 'a4', title: 'Data Exfiltration', icon: ExternalLink, score: 68, desc: '4.2 GB uploaded to external endpoint in 12 minutes' },
  { id: 'a5', title: 'Credential Dark Web Listing', icon: Shield, score: 96, desc: 'VPN credentials for this entity found on Genesis Market' },
  { id: 'a6', title: 'Firmware Integrity Violation', icon: Zap, score: 94, desc: 'BMC firmware hash diverged from golden image baseline' },
];

const typeIcon = (t: string) => {
  const m: Record<string, React.ReactNode> = {
    user: <User size={14} />, ip: <Globe size={14} />,
    hostname: <Server size={14} />, filehash: <FileCode size={14} />,
    login: <Lock size={14} />, alert: <AlertTriangle size={14} />,
    file_access: <FileCode size={14} />, network: <Network size={14} />,
    process: <Activity size={14} />, anomaly: <Zap size={14} />,
  };
  return m[t] || <Eye size={14} />;
};

const typeColor = (t: string) => {
  const m: Record<string, string> = {
    user: '#3B82F6', ip: '#10B981', hostname: '#F59E0B',
    filehash: '#EF4444', login: '#6366F1', alert: '#EF4444',
    file_access: '#F59E0B', network: '#10B981', process: '#8B5CF6', anomaly: '#EC4899',
  };
  return m[t] || '#64748B';
};

const sevColor = (s: string) => ({ critical: '#EF4444', high: '#F97316', medium: '#EAB308', low: '#22C55E' }[s] || '#64748B');
const classColor = (c: string) => ({ Malicious: '#EF4444', Suspicious: '#F59E0B', Clean: '#22C55E' }[c] || '#64748B');

// --- Risk Gauge ---
const RiskGauge: React.FC<{ risk: number; color: string }> = ({ risk, color }) => {
  const [animVal, setAnimVal] = useState(0);
  useEffect(() => {
    setAnimVal(0);
    let frame: number; let start: number;
    const dur = 1200;
    const tick = (ts: number) => {
      if (!start) start = ts;
      const p = Math.min((ts - start) / dur, 1);
      setAnimVal(Math.round(risk * (1 - Math.pow(1 - p, 3))));
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [risk]);

  const r = 54, circ = 2 * Math.PI * r, offset = circ - (animVal / 100) * circ;
  return (
    <svg width="140" height="140" viewBox="0 0 140 140">
      <circle cx="70" cy="70" r={r} fill="none" stroke="#1E293B" strokeWidth="10" />
      <circle cx="70" cy="70" r={r} fill="none" stroke={color} strokeWidth="10"
        strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
        transform="rotate(-90 70 70)" style={{ transition: 'stroke-dashoffset 0.05s linear' }}>
        <animate attributeName="opacity" values="0.7;1;0.7" dur="2s" repeatCount="indefinite" />
      </circle>
      <text x="70" y="66" textAnchor="middle" fill={color} fontSize="28" fontWeight="bold">{animVal}</text>
      <text x="70" y="86" textAnchor="middle" fill="#64748B" fontSize="11">RISK SCORE</text>
    </svg>
  );
};

// --- Relationship Graph ---
const RelGraph: React.FC<{ nodes: RelatedNode[]; centerLabel: string; centerType: string }> = ({ nodes, centerLabel, centerType }) => {
  const [pulse, setPulse] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => setPulse(p => (p + 1) % 100), 50);
    return () => clearInterval(iv);
  }, []);
  const cx = 200, cy = 200, pr = 18 + Math.sin(pulse * 0.06) * 3;
  return (
    <svg width="100%" height="100%" viewBox="0 0 400 400">
      <defs>
        <radialGradient id="glow">
          <stop offset="0%" stopColor={typeColor(centerType)} stopOpacity="0.4" />
          <stop offset="100%" stopColor={typeColor(centerType)} stopOpacity="0" />
        </radialGradient>
      </defs>
      {nodes.map((n, i) => {
        const nx = cx + Math.cos(n.angle) * n.distance;
        const ny = cy + Math.sin(n.angle) * n.distance;
        const dashOff = (pulse * 0.5 + i * 10) % 20;
        return (
          <g key={n.id}>
            <line x1={cx} y1={cy} x2={nx} y2={ny} stroke={typeColor(n.type)}
              strokeWidth="1.5" strokeDasharray="6 4" strokeDashoffset={dashOff} opacity="0.6" />
            <circle cx={nx} cy={ny} r="22" fill="#0F1D32" stroke={typeColor(n.type)} strokeWidth="2">
              <animate attributeName="r" values="22;24;22" dur={`${2 + i * 0.3}s`} repeatCount="indefinite" />
            </circle>
            <text x={nx} y={ny + 1} textAnchor="middle" fill="#CBD5E1" fontSize="8">{n.label}</text>
            <text x={nx} y={ny + 12} textAnchor="middle" fill={typeColor(n.type)} fontSize="7">{n.type}</text>
          </g>
        );
      })}
      <circle cx={cx} cy={cy} r="40" fill="url(#glow)" />
      <circle cx={cx} cy={cy} r={pr} fill="#0F1D32" stroke={typeColor(centerType)} strokeWidth="3">
        <animate attributeName="stroke-opacity" values="0.6;1;0.6" dur="2s" repeatCount="indefinite" />
      </circle>
      <text x={cx} y={cy - 2} textAnchor="middle" fill="#F1F5F9" fontSize="9" fontWeight="bold">{centerLabel}</text>
      <text x={cx} y={cy + 10} textAnchor="middle" fill={typeColor(centerType)} fontSize="8">{centerType}</text>
    </svg>
  );
};

// --- Main Component ---
export default function EntityInvestigation() {
  const [query, setQuery] = useState('');
  const [showAC, setShowAC] = useState(false);
  const [selected, setSelected] = useState<Entity>(ENTITIES[0]);
  const [tab, setTab] = useState<'timeline' | 'graph' | 'anomalies'>('timeline');
  const [expandedEv, setExpandedEv] = useState<Set<string>>(new Set());
  const [eventCount, setEventCount] = useState(0);
  const [visibleEvts, setVisibleEvts] = useState<Set<string>>(new Set());
  const timelineRef = useRef<HTMLDivElement>(null);

  const events = makeEvents(selected.id);
  const related = makeRelated(selected.id);

  const filtered = query.trim()
    ? ENTITIES.filter(e => e.name.toLowerCase().includes(query.toLowerCase()))
    : ENTITIES;

  // Real-time event counter
  useEffect(() => {
    setEventCount(0);
    const target = events.length + Math.floor(Math.random() * 40) + 20;
    let count = 0;
    const iv = setInterval(() => {
      count += Math.ceil(Math.random() * 3);
      if (count >= target) { count = target; clearInterval(iv); }
      setEventCount(count);
    }, 80);
    return () => clearInterval(iv);
  }, [selected.id]);

  // Staggered timeline reveal
  useEffect(() => {
    setVisibleEvts(new Set());
    events.forEach((ev, i) => {
      setTimeout(() => setVisibleEvts(prev => new Set(prev).add(ev.id)), 100 + i * 80);
    });
  }, [selected.id]);

  const selectEntity = useCallback((e: Entity) => {
    setSelected(e); setQuery(''); setShowAC(false);
    setExpandedEv(new Set()); setTab('timeline');
  }, []);

  const toggleExpand = (id: string) => {
    setExpandedEv(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  const riskColor = selected.risk >= 80 ? '#EF4444' : selected.risk >= 50 ? '#F59E0B' : '#22C55E';

  return (
    <div className="min-h-screen bg-[#0A1628] text-slate-200 p-4 font-sans">
      {/* Search Bar */}
      <div className="relative max-w-2xl mx-auto mb-6">
        <div className="flex items-center bg-[#0F1D32] border border-slate-700 rounded-lg px-4 py-2.5 focus-within:border-blue-500 transition-colors">
          <Search size={18} className="text-slate-500 mr-3 flex-shrink-0" />
          <input
            className="bg-transparent flex-1 outline-none text-slate-200 placeholder-slate-500 text-sm"
            placeholder="Search entities: users, IPs, hostnames, file hashes..."
            value={query}
            onChange={e => { setQuery(e.target.value); setShowAC(true); }}
            onFocus={() => setShowAC(true)}
            onBlur={() => setTimeout(() => setShowAC(false), 200)}
          />
          {query && <button onClick={() => { setQuery(''); setShowAC(false); }}><X size={16} className="text-slate-500 hover:text-slate-300" /></button>}
        </div>
        {showAC && filtered.length > 0 && (
          <div className="absolute z-50 w-full mt-1 bg-[#0F1D32] border border-slate-700 rounded-lg shadow-2xl overflow-hidden">
            {filtered.map(e => (
              <button key={e.id} className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-[#162340] text-left transition-colors"
                onMouseDown={() => selectEntity(e)}>
                <span style={{ color: typeColor(e.type) }}>{typeIcon(e.type)}</span>
                <span className="flex-1 text-sm text-slate-200">{e.name}</span>
                <span className="text-xs px-2 py-0.5 rounded" style={{ color: typeColor(e.type), background: typeColor(e.type) + '18' }}>{e.type}</span>
                <span className="text-xs font-mono" style={{ color: e.risk >= 80 ? '#EF4444' : e.risk >= 50 ? '#F59E0B' : '#22C55E' }}>
                  {e.risk}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Header */}
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Crosshair size={20} className="text-blue-400" />
            <h1 className="text-lg font-bold text-slate-100">Entity Investigation</h1>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <Activity size={14} className="text-emerald-400 animate-pulse" />
            <span className="text-emerald-400 font-mono">{eventCount}</span>
            <span className="text-slate-500">events tracked</span>
          </div>
        </div>

        {/* Entity Profile Card */}
        <div className="bg-[#0F1D32] border border-slate-700/50 rounded-xl p-5 mb-5">
          <div className="flex flex-wrap items-start gap-6">
            <RiskGauge risk={selected.risk} color={riskColor} />
            <div className="flex-1 min-w-[200px]">
              <div className="flex items-center gap-3 mb-2">
                <span style={{ color: typeColor(selected.type) }}>{typeIcon(selected.type)}</span>
                <h2 className="text-xl font-bold text-white">{selected.name}</h2>
                <span className="text-xs uppercase tracking-wider px-2 py-0.5 rounded font-medium"
                  style={{ color: classColor(selected.classification), background: classColor(selected.classification) + '20', border: `1px solid ${classColor(selected.classification)}40` }}>
                  {selected.classification}
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4 text-xs">
                <div><span className="text-slate-500 block">Type</span><span className="text-slate-300 capitalize">{selected.type}</span></div>
                <div><span className="text-slate-500 block">First Seen</span><span className="text-slate-300">{selected.firstSeen}</span></div>
                <div><span className="text-slate-500 block">Last Seen</span><span className="text-slate-300">{selected.lastSeen}</span></div>
                <div><span className="text-slate-500 block">Related Entities</span><span className="text-blue-400 font-medium">{selected.relatedCount}</span></div>
              </div>
              {/* Quick Actions */}
              <div className="flex flex-wrap gap-2 mt-4">
                {[
                  { label: 'Isolate', icon: Shield, color: '#EF4444' },
                  { label: 'Block', icon: Ban, color: '#F97316' },
                  { label: 'Watchlist', icon: Eye, color: '#3B82F6' },
                  { label: 'Escalate', icon: Zap, color: '#A855F7' },
                ].map(a => (
                  <button key={a.label} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all hover:scale-105 active:scale-95"
                    style={{ color: a.color, background: a.color + '15', border: `1px solid ${a.color}30` }}>
                    <a.icon size={13} />{a.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-4 bg-[#0F1D32] rounded-lg p-1 w-fit">
          {(['timeline', 'graph', 'anomalies'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-md text-xs font-medium transition-all capitalize ${tab === t ? 'bg-blue-600/20 text-blue-400 shadow-lg shadow-blue-500/10' : 'text-slate-400 hover:text-slate-200'}`}>
              {t === 'timeline' && <Clock size={13} className="inline mr-1.5 -mt-0.5" />}
              {t === 'graph' && <Network size={13} className="inline mr-1.5 -mt-0.5" />}
              {t === 'anomalies' && <AlertTriangle size={13} className="inline mr-1.5 -mt-0.5" />}
              {t}
            </button>
          ))}
        </div>

        {/* Tab Content with crossfade */}
        <div className="relative">
          {/* Timeline */}
          <div className={`transition-all duration-300 ${tab === 'timeline' ? 'opacity-100' : 'opacity-0 absolute inset-0 pointer-events-none'}`}>
            <div ref={timelineRef} className="space-y-0">
              {events.map((ev) => {
                const visible = visibleEvts.has(ev.id);
                const expanded = expandedEv.has(ev.id);
                return (
                  <div key={ev.id}
                    className="flex gap-4 transition-all duration-500"
                    style={{ opacity: visible ? 1 : 0, transform: visible ? 'translateX(0)' : 'translateX(-30px)' }}>
                    {/* Vertical line + icon */}
                    <div className="flex flex-col items-center w-8 flex-shrink-0">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center border-2"
                        style={{ borderColor: typeColor(ev.type), background: typeColor(ev.type) + '15' }}>
                        <span style={{ color: typeColor(ev.type) }}>{typeIcon(ev.type)}</span>
                      </div>
                      <div className="w-px flex-1 min-h-[20px]" style={{ background: `linear-gradient(to bottom, ${typeColor(ev.type)}40, transparent)` }} />
                    </div>
                    {/* Content */}
                    <div className="flex-1 pb-4">
                      <button className="w-full text-left bg-[#0F1D32] border border-slate-700/40 rounded-lg p-3 hover:border-slate-600 transition-colors"
                        onClick={() => toggleExpand(ev.id)}>
                        <div className="flex items-center gap-2 flex-wrap">
                          {expanded ? <ChevronDown size={14} className="text-slate-400" /> : <ChevronRight size={14} className="text-slate-400" />}
                          <span className="text-sm font-medium text-slate-200">{ev.title}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded font-medium uppercase tracking-wider"
                            style={{ color: sevColor(ev.severity), background: sevColor(ev.severity) + '18' }}>
                            {ev.severity}
                          </span>
                          <span className="ml-auto text-[11px] text-slate-500 font-mono">{ev.time}</span>
                        </div>
                        {expanded && (
                          <div className="mt-2 pt-2 border-t border-slate-700/30 text-xs text-slate-400 leading-relaxed">
                            {ev.detail}
                          </div>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Graph */}
          <div className={`transition-all duration-300 ${tab === 'graph' ? 'opacity-100' : 'opacity-0 absolute inset-0 pointer-events-none'}`}>
            <div className="bg-[#0F1D32] border border-slate-700/50 rounded-xl p-4" style={{ height: 420 }}>
              <RelGraph nodes={related} centerLabel={selected.name} centerType={selected.type} />
            </div>
          </div>

          {/* Anomalies */}
          <div className={`transition-all duration-300 ${tab === 'anomalies' ? 'opacity-100' : 'opacity-0 absolute inset-0 pointer-events-none'}`}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {ANOMALIES.map(a => (
                <div key={a.id} className="bg-[#0F1D32] border border-slate-700/50 rounded-xl p-4 hover:border-slate-600 transition-colors">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center"
                      style={{ background: a.score >= 80 ? '#EF444418' : '#F59E0B18' }}>
                      <a.icon size={18} style={{ color: a.score >= 80 ? '#EF4444' : '#F59E0B' }} />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-sm font-semibold text-slate-200">{a.title}</h3>
                      <p className="text-xs text-slate-500 mt-0.5">{a.desc}</p>
                    </div>
                    <span className="text-lg font-bold font-mono" style={{ color: a.score >= 80 ? '#EF4444' : '#F59E0B' }}>
                      {a.score}
                    </span>
                  </div>
                  <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                    <AnomalyBar score={a.score} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const AnomalyBar: React.FC<{ score: number }> = ({ score }) => {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setWidth(score), 100);
    return () => clearTimeout(t);
  }, [score]);
  const color = score >= 80 ? '#EF4444' : score >= 50 ? '#F59E0B' : '#22C55E';
  return (
    <div className="h-full rounded-full transition-all duration-1000 ease-out"
      style={{ width: `${width}%`, background: `linear-gradient(90deg, ${color}80, ${color})` }} />
  );
};
