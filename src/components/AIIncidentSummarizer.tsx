import { useState, useEffect, useRef, useCallback } from "react";
import {
  Brain, Sparkles, MessageSquare, Shield, AlertTriangle, Clock, User, Server,
  Globe, ChevronRight, Target, Zap, Send, CheckCircle2, XCircle, TrendingUp,
  Eye, FileText, Activity, X,
} from "lucide-react";

// --- Data ---
const incidents = [
  { id: 1, title: "Credential Theft Campaign", severity: "Critical", status: "Active", alerts: 47, icon: Shield, color: "#EF4444",
    summary: "A sophisticated credential theft campaign targeting executive accounts was detected across multiple authentication systems, employing adversary-in-the-middle (AiTM) proxy infrastructure to bypass MFA protections in real time. The attacker leveraged phishing emails with convincing Microsoft 365 login pages hosted on compromised Azure tenants to harvest credentials from 12 senior staff members. Lateral movement was observed within 30 minutes of initial compromise, indicating automated post-exploitation tooling with pre-staged scripts. Forensic analysis of email headers reveals the phishing kit used EvilProxy framework with session cookie replay capabilities, allowing persistent access even after password resets.",
    triage: { severity: "Critical", category: "Credential Access", owner: "Sarah Chen, SOC Lead", reasoning: "Multiple executive accounts compromised with evidence of lateral movement and MFA bypass. Immediate containment required with full token revocation across all identity providers." },
    technical: ["Phishing emails originated from compromised partner domain partner-corp[.]com using exact-domain spoofing via misconfigured SPF record", "Harvested credentials used from TOR exit nodes within 4 minutes, with session cookies replayed to bypass Conditional Access", "OAuth tokens generated for persistent mailbox access with Mail.ReadWrite and Files.ReadWrite.All scopes", "PowerShell scripts deployed via compromised accounts for AD reconnaissance using BloodHound ingestors", "AiTM proxy infrastructure hosted on Azure tenant ID 7f3a2c19-* with valid SSL certificates from Let's Encrypt", "Attacker registered Azure AD application 'MS Graph Helper' with delegated permissions to maintain persistence"],
    mitre: ["T1566.001 - Spearphishing Attachment", "T1078 - Valid Accounts", "T1550.001 - Application Access Token", "T1557.001 - LLMNR/NBT-NS Poisoning", "T1556.006 - Multi-Factor Authentication Interception"],
    entities: ["Exchange Online", "Azure AD", "VPN Gateway", "12 Executive Accounts", "Partner Tenant (partner-corp)", "Azure AD Application 'MS Graph Helper'"],
    timeline: [{ t: "09:14", label: "Phish Sent", color: "#F59E0B" }, { t: "09:22", label: "Creds Harvested", color: "#EF4444" }, { t: "09:26", label: "TOR Login", color: "#EF4444" }, { t: "09:52", label: "Lateral Move", color: "#DC2626" }, { t: "10:15", label: "Detected", color: "#22C55E" }],
    actions: ["Revoke all compromised OAuth tokens and registered Azure AD applications immediately", "Force password reset for affected accounts and invalidate all active sessions across identity providers", "Block identified TOR exit nodes at firewall and add AiTM proxy IPs to blocklist", "Enable conditional access policies requiring compliant device and risk-based authentication for executives", "Initiate forensic imaging of affected endpoints and mailbox audit log review", "Notify partner-corp[.]com of domain compromise and coordinate SPF/DMARC remediation", "Deploy phishing-resistant FIDO2 authentication for all executive accounts"],
    confidence: 94 },
  { id: 2, title: "Ransomware Pre-Deployment", severity: "Critical", status: "Contained", alerts: 83, icon: AlertTriangle, color: "#DC2626",
    summary: "Early-stage ransomware deployment detected and contained before encryption began, attributed with moderate confidence to the BlackCat/ALPHV affiliate ecosystem based on tooling and TTPs observed. The threat actor gained initial access through an exposed RDP server using credential stuffing with credentials sourced from a recent third-party breach dump. Cobalt Strike beacons with custom malleable C2 profiles were deployed across 8 systems using a combination of PsExec and WMI for lateral movement. Volume shadow copy deletion commands and bcdedit safe mode manipulation were intercepted by EDR, triggering automated network isolation that prevented the encryption payload from executing.",
    triage: { severity: "Critical", category: "Impact - Ransomware", owner: "Marcus Webb, IR Team", reasoning: "Pre-encryption stage ransomware with active C2 channels and evidence of domain-wide compromise. Containment successful but krbtgt reset and full AD remediation needed to prevent re-entry." },
    technical: ["Initial access via exposed RDP on port 3389 using credentials from BreachDB-2024Q1 dump", "Cobalt Strike beacon deployed with malleable C2 profile mimicking Slack API traffic on TCP/443", "PsExec and WMI used for lateral movement across subnet 10.1.4.0/24 with pass-the-hash", "vssadmin delete shadows command blocked by EDR on 6 of 8 compromised systems", "Attacker deployed ADFind.exe and SharpHound for Active Directory enumeration", "Ransomware payload (SHA256: 8a3f7b...) identified as BlackCat v2.1 with intermittent encryption mode"],
    mitre: ["T1133 - External Remote Services", "T1059.001 - PowerShell", "T1490 - Inhibit System Recovery", "T1021.002 - SMB/Windows Admin Shares", "T1003.001 - LSASS Memory"],
    entities: ["RDP Server (10.1.4.50)", "Domain Controller (DC-01)", "File Server (FS-PROD-01)", "8 Workstations", "Active Directory", "Backup Server (BKP-01)"],
    timeline: [{ t: "02:30", label: "RDP Brute Force", color: "#F59E0B" }, { t: "03:15", label: "Access Gained", color: "#EF4444" }, { t: "03:45", label: "Cobalt Strike", color: "#EF4444" }, { t: "04:20", label: "Lateral Move", color: "#DC2626" }, { t: "04:55", label: "Contained", color: "#22C55E" }],
    actions: ["Isolate all 8 affected workstations from network and verify containment via EDR telemetry", "Reset krbtgt account password twice with 12-hour interval to invalidate all Kerberos tickets", "Scan all endpoints for Cobalt Strike indicators (named pipes, malleable C2 JA3 hashes)", "Patch RDP server and restrict access exclusively via VPN with MFA", "Conduct full Active Directory security assessment for golden ticket and DCSync artifacts", "Verify backup integrity on BKP-01 and ensure offline backup copies are uncompromised"],
    confidence: 97 },
  { id: 3, title: "Data Exfiltration via DNS", severity: "High", status: "Investigating", alerts: 31, icon: Globe, color: "#F59E0B",
    summary: "Anomalous DNS tunneling activity detected exfiltrating sensitive customer data to external infrastructure using a custom-built DNS tunnel that evaded standard DLP controls by fragmenting payloads across thousands of subdomain queries. Encoded payloads embedded in DNS TXT queries and CNAME responses suggest use of bespoke tooling rather than off-the-shelf frameworks like iodine or dnscat2. Approximately 2.3 GB of data was transferred over 72 hours through high-frequency subdomain queries averaging 500 per minute. The exfiltration source was traced to database server DB-PROD-03, which had been compromised via a SQL injection vulnerability in the customer portal three weeks prior to detection.",
    triage: { severity: "High", category: "Exfiltration", owner: "James Park, Threat Intel", reasoning: "Active data exfiltration channel confirmed with customer PII at risk. Volume and duration suggest systematic database extraction. Breach notification clock may have started." },
    technical: ["DNS queries to *.data.evil-dns[.]net averaging 500 queries/min with 32-byte subdomain labels", "Base64-encoded payloads in TXT record responses with XOR layer using rotating 4-byte key", "Source identified as database server DB-PROD-03 via netflow correlation", "Query patterns partially match iodine DNS tunnel signatures but with custom framing protocol", "SQL injection entry point identified in /api/customer/search endpoint (parameterized query bypass)", "Database audit logs show SELECT * FROM customers WHERE 1=1 queries spanning all 2.1M records"],
    mitre: ["T1048.003 - Exfiltration Over Alternative Protocol", "T1071.004 - Application Layer Protocol: DNS", "T1190 - Exploit Public-Facing Application", "T1030 - Data Transfer Size Limits"],
    entities: ["DB-PROD-03", "Internal DNS Resolver", "Customer Database (2.1M records)", "Customer Portal Web App", "Authoritative DNS for evil-dns[.]net"],
    timeline: [{ t: "Mon 08:00", label: "Tunnel Start", color: "#F59E0B" }, { t: "Tue 14:00", label: "Volume Spike", color: "#EF4444" }, { t: "Wed 09:30", label: "Alert Fired", color: "#22C55E" }, { t: "Wed 11:00", label: "Investigation", color: "#3B82F6" }],
    actions: ["Block DNS queries to evil-dns[.]net at DNS resolver and deploy RPZ sinkhole for the domain", "Isolate DB-PROD-03 for forensic analysis and deploy replacement database from clean backup", "Audit database access logs for unauthorized queries and identify full scope of exfiltrated records", "Deploy DNS monitoring rules for TXT record anomalies and high-entropy subdomain detection", "Patch SQL injection vulnerability in customer portal and conduct full application security audit", "Engage legal counsel for breach notification assessment under GDPR and state privacy laws"],
    confidence: 88 },
  { id: 4, title: "APT-29 Infrastructure Detected", severity: "High", status: "Monitoring", alerts: 19, icon: Target, color: "#A855F7",
    summary: "Network telemetry matches known APT-29 (Cozy Bear) command and control infrastructure with high-fidelity indicators correlating to CISA advisory AA24-057A and recent NCSC reporting on SolarWinds-adjacent campaigns. Beacon traffic identified communicating with IP addresses and domains linked to APT-29 operational infrastructure using HTTPS with certificate pinning and domain fronting through legitimate CDN providers. Traffic originates from a developer workstation (DEV-WS-127) with elevated privileges including admin access to the CI/CD pipeline and production Kubernetes clusters. The workstation was likely compromised via a trojanized VS Code extension downloaded from a typosquatted marketplace listing.",
    triage: { severity: "High", category: "Command & Control", owner: "Sarah Chen, SOC Lead", reasoning: "Nation-state threat actor indicators with supply chain compromise potential warrant immediate investigation. Developer access to CI/CD pipeline creates critical blast radius." },
    technical: ["HTTPS beaconing to 185.220.101[.]42 every 60s with 20% jitter, using domain fronting through cdn.cloudflare[.]com", "JA3 fingerprint (e7d705a3286e19ea) matches known APT-29 WellMess loader variant", "Traffic originates from DEV-WS-127 (developer workstation) running compromised VS Code extension 'Python Lint Pro v2.1.4'", "Workstation has admin access to CI/CD pipeline (Jenkins) and kubectl credentials for 3 production clusters", "DNS-over-HTTPS queries to dns.google/resolve observed tunneling C2 metadata alongside legitimate traffic", "Memory forensics on DEV-WS-127 revealed reflectively loaded DLL with XOR-encoded configuration blob"],
    mitre: ["T1071.001 - Web Protocols", "T1573.002 - Encrypted Channel: Asymmetric Crypto", "T1195.002 - Compromise Software Supply Chain", "T1090.004 - Domain Fronting", "T1059.007 - JavaScript"],
    entities: ["DEV-WS-127", "CI/CD Pipeline (Jenkins)", "Source Code Repository (GitLab)", "3 Production K8s Clusters", "VS Code Extension Marketplace"],
    timeline: [{ t: "Apr 10", label: "First Beacon", color: "#F59E0B" }, { t: "Apr 15", label: "Pattern Match", color: "#A855F7" }, { t: "Apr 20", label: "TI Correlation", color: "#3B82F6" }, { t: "Apr 22", label: "SOC Alerted", color: "#22C55E" }],
    actions: ["Isolate DEV-WS-127 immediately and capture full memory dump before remediation", "Audit CI/CD pipeline for unauthorized changes, injected build steps, and modified Jenkinsfiles", "Review all recent code commits from affected developer and scan artifacts for backdoors", "Engage threat intelligence team for APT-29 IOC sweep across all endpoints and network telemetry", "Rotate all credentials accessible from DEV-WS-127 including kubectl tokens and SSH keys", "Scan all developer workstations for the trojanized VS Code extension and audit marketplace installs"],
    confidence: 79 },
  { id: 5, title: "DDoS Attack on API Gateway", severity: "Medium", status: "Mitigated", alerts: 156, icon: Zap, color: "#3B82F6",
    summary: "Volumetric DDoS attack targeting the primary API gateway reached 45 Gbps before automated mitigation engaged, combining layer-3/4 amplification floods with a sophisticated layer-7 slowloris component designed to exhaust connection pools on backend services. Attack traffic consisted of amplified DNS and NTP reflection vectors originating from approximately 12,000 unique source IPs across 40 countries, with the layer-7 component using randomized HTTP headers and legitimate-looking API calls to evade rate limiting. Post-mitigation analysis revealed the attack was preceded by reconnaissance probes against the API schema endpoint 48 hours earlier, suggesting a targeted rather than opportunistic campaign.",
    triage: { severity: "Medium", category: "Availability", owner: "Ops Team", reasoning: "Automated mitigation effective for volumetric component. No significant service disruption to end users. The layer-7 component warrants deeper investigation as it suggests targeted reconnaissance." },
    technical: ["Peak traffic: 45 Gbps via DNS amplification + NTP reflection from 12,000 unique source IPs", "Layer-7 slowloris component opened 15,000 concurrent connections with randomized User-Agent strings", "API gateway response time peaked at 2.3s (SLA: 500ms) for 47 seconds before CDN mitigation", "CDN auto-scaling absorbed 92% of attack traffic; remaining 8% handled by origin rate limiting", "Reconnaissance probes against /api/v2/schema and /api/v2/health detected 48 hours prior from same ASN", "Attack traffic sourced from known booter/stresser infrastructure (AS-BULLETPROOF-7331)"],
    mitre: ["T1498.002 - Reflection Amplification", "T1499 - Endpoint Denial of Service", "T1595.002 - Vulnerability Scanning", "T1499.002 - Service Exhaustion Flood"],
    entities: ["API Gateway (api.prod.internal)", "CDN Edge Nodes (23 PoPs)", "DNS Infrastructure", "Backend Microservices (connection pools)", "AS-BULLETPROOF-7331"],
    timeline: [{ t: "14:00", label: "Traffic Spike", color: "#F59E0B" }, { t: "14:02", label: "45 Gbps Peak", color: "#EF4444" }, { t: "14:03", label: "Auto-Mitigate", color: "#22C55E" }, { t: "14:30", label: "Traffic Normal", color: "#3B82F6" }],
    actions: ["Review and update DDoS mitigation thresholds to account for blended layer-3/4 and layer-7 vectors", "Add identified source IPs and ASN to threat intelligence feed and upstream blackhole routing", "Conduct capacity planning review for API gateway connection pools and implement connection timeouts", "Update incident response playbook for DDoS scenarios with layer-7 detection criteria", "Deploy API schema endpoint behind authentication and rate-limit reconnaissance-pattern requests", "Coordinate with upstream ISP for flowspec rules targeting amplification reflection ports"],
    confidence: 92 },
  { id: 6, title: "Insider Threat - Data Staging", severity: "Medium", status: "Active", alerts: 22, icon: User, color: "#F97316",
    summary: "Behavioral analytics flagged unusual data access patterns from a finance department employee who has submitted resignation effective next month, indicating potential intellectual property theft in progress. Over 14 days, the user accessed 340% more sensitive files than their 30-day baseline, with access occurring exclusively during non-business hours (11 PM - 3 AM) using VPN from a personal device not enrolled in MDM. Data was systematically staged in a personal OneDrive folder before partial upload to Mega.nz, with the user employing password-protected ZIP archives to evade DLP content inspection. The staging pattern mirrors a known corporate espionage playbook where departing employees harvest competitive intelligence for their next employer.",
    triage: { severity: "Medium", category: "Insider Threat", owner: "HR Security Liaison", reasoning: "Pattern consistent with data theft preparation by departing employee. User has submitted resignation effective next month to join a direct competitor. Legal hold and forensic preservation required." },
    technical: ["User accessed 847 sensitive files vs 195 baseline (30-day avg), focused on Q3/Q4 financial projections and M&A documents", "Access times: 11 PM - 3 AM local, outside normal 9-5 pattern, exclusively via personal device VPN sessions", "15.7 GB staged in personal OneDrive sync folder using password-protected ZIP archives (7z, AES-256)", "Partial upload (3.2 GB) to mega[.]nz detected and blocked by CASB; user attempted fallback to Dropbox", "User disabled Windows indexing and cleared recent file history after each staging session", "Browser forensics show searches for 'how to transfer large files anonymously' and 'DLP bypass techniques'"],
    mitre: ["T1074.001 - Local Data Staging", "T1567.002 - Exfiltration to Cloud Storage", "T1027 - Obfuscated Files or Information", "T1070.004 - File Deletion"],
    entities: ["Finance User (ID: FIN-0847)", "OneDrive (Personal)", "Mega.nz", "Dropbox (Attempted)", "Financial Reports (M&A)", "Personal Unmanaged Device"],
    timeline: [{ t: "Apr 8", label: "Anomaly Start", color: "#F59E0B" }, { t: "Apr 14", label: "Staging Begins", color: "#EF4444" }, { t: "Apr 19", label: "Upload Blocked", color: "#22C55E" }, { t: "Apr 22", label: "HR Notified", color: "#3B82F6" }],
    actions: ["Restrict user access to sensitive file shares immediately and revoke VPN access for personal devices", "Preserve forensic copy of OneDrive staging folder and all ZIP archives with chain of custody documentation", "Coordinate with HR and Legal for formal investigation and issue litigation hold notice", "Review DLP policies for OneDrive sync folders to detect password-protected archive staging", "Implement CASB policy to block all cloud storage uploads from users in resignation notice period", "Engage digital forensics firm for full endpoint and cloud account examination"],
    confidence: 85 },
  { id: 7, title: "Air-Gapped Breach via Acoustic Channel", severity: "Critical", status: "Active", alerts: 38, icon: Brain, color: "#EF4444",
    summary: "A highly sophisticated covert exfiltration attack was detected targeting an air-gapped SCADA workstation in the ICS control room, leveraging ultrasonic audio signals as a bridge between the isolated network and an internet-connected smartphone. The attacker first compromised the building's conference room speaker system through its networked AV controller, then used inaudible ultrasonic frequencies (18-22kHz) to transmit encoded commands to a malware implant on a field engineer's personal smartphone. The phone, carried unknowingly into the air-gapped facility, relayed stolen ICS firmware signing keys via cellular data to an external C2 server. Detection occurred when an RF anomaly sensor in the SCADA room flagged unexpected ultrasonic energy patterns correlating with cellular data bursts from the engineer's device.",
    triage: { severity: "Critical", category: "Exfiltration - Air-Gap Bypass", owner: "ICS Security Team Lead", reasoning: "Compromise of firmware signing keys for SCADA PLCs represents existential risk to industrial control systems. Air-gap integrity violated through novel acoustic covert channel requiring immediate physical security and cryptographic remediation." },
    technical: ["Ultrasonic data channel operating at 18-22kHz with FSK modulation, ~200 bps throughput confirmed via spectrum analysis", "Conference room Crestron AV controller (firmware v3.2.1) compromised via default credentials on management port TCP/41794", "Smartphone malware identified as modified variant of Mosquito framework with acoustic reception module using device microphone", "ICS firmware signing keys (ECDSA P-384) for Allen-Bradley ControlLogix PLCs exfiltrated in 47-minute session", "Cellular C2 traffic relayed via HTTPS to cdn-static.analytics-update[.]net on Cloudflare-fronted infrastructure", "Air-gap policy violation: personal smartphones permitted within 10m of SCADA workstations without RF shielding"],
    mitre: ["T1092 - Communication Through Removable Media", "T1020 - Automated Exfiltration", "T1071 - Application Layer Protocol", "T1123 - Audio Capture", "T1052 - Exfiltration Over Physical Medium"],
    entities: ["SCADA Workstation (HMI-CTL-07)", "Conference Room AV System", "Engineer's Smartphone", "Allen-Bradley ControlLogix PLCs", "Firmware Signing Key Vault", "RF Anomaly Sensor Array"],
    timeline: [{ t: "Mar 28", label: "Speaker Pwned", color: "#F59E0B" }, { t: "Apr 12", label: "Engineer Enters", color: "#EF4444" }, { t: "Apr 12", label: "Acoustic Link", color: "#DC2626" }, { t: "Apr 12", label: "Keys Exfiltrated", color: "#DC2626" }, { t: "Apr 13", label: "C2 Relay", color: "#EF4444" }, { t: "Apr 14", label: "RF Detected", color: "#22C55E" }],
    actions: ["Immediately revoke and rotate all ICS firmware signing keys and issue new certificates to all PLCs", "Enforce strict no-personal-device policy within air-gapped facility perimeter with RF-shielded lockers", "Isolate and forensically image the compromised Crestron AV controller and engineer's smartphone", "Deploy ultrasonic jamming countermeasures in all rooms adjacent to air-gapped facilities", "Audit all firmware images currently deployed on PLCs for integrity using known-good hashes", "Install audio spectrum monitoring sensors in SCADA room to detect future acoustic covert channels", "Engage ICS-CERT for coordinated vulnerability disclosure on Crestron default credential issue"],
    confidence: 71 },
  { id: 8, title: "JVM Bytecode Weaving Supply Chain", severity: "Critical", status: "Investigating", alerts: 94, icon: Target, color: "#DC2626",
    summary: "A sophisticated supply chain attack was discovered targeting the internal Nexus Maven repository mirror, where an attacker injected malicious AspectJ bytecode weavers into widely-used Java library artifacts at build time. The weavers inserted invisible runtime hooks into every compiled class during the Maven build lifecycle, creating backdoors that only activated when specific X-Debug-Token HTTP headers were present in incoming requests. The compromise affected 147 microservices across 3 Kubernetes clusters over a 3-week window before detection. The malicious aspect was designed to intercept Spring Security authentication filters and exfiltrate JWT signing secrets, and included a polymorphic re-weaving mechanism that reinjected itself during each CI build cycle to maintain persistence.",
    triage: { severity: "Critical", category: "Supply Chain Compromise", owner: "AppSec & Platform Engineering", reasoning: "Systemic compromise of build pipeline affecting 147 production microservices. All JWT signing secrets must be considered compromised. Full rebuild from verified sources required." },
    technical: ["Malicious AspectJ weaver injected into org.internal:common-logging:4.2.1 artifact in Nexus repository at 2026-04-02T03:17Z", "Weaver bytecode used ASM library to instrument all classes implementing javax.servlet.Filter at load time", "Backdoor activation triggered by HTTP header X-Debug-Token: 7f3a8b2c-e91d-4a5f matching hardcoded HMAC", "JWT signing secrets (RS256) exfiltrated via DNS-over-HTTPS to resolver.cloudflare-dns[.]com with encoded TXT payloads", "Nexus admin account compromised via credential reuse from LinkedIn breach dump (password: Summer2025!)", "Polymorphic re-weaving mechanism hooked into maven-compiler-plugin execution phase to reinfect clean builds"],
    mitre: ["T1195.002 - Compromise Software Supply Chain", "T1027.002 - Software Packing", "T1059.004 - Unix Shell", "T1554 - Compromise Client Software Binary", "T1550.001 - Application Access Token"],
    entities: ["Nexus Maven Repository", "147 Microservices", "3 Kubernetes Clusters (prod-us, prod-eu, staging)", "Jenkins CI/CD Pipeline", "Spring Security Filters", "JWT Signing Keys (RS256)"],
    timeline: [{ t: "Apr 2", label: "Nexus Compromised", color: "#EF4444" }, { t: "Apr 3", label: "Weaver Injected", color: "#DC2626" }, { t: "Apr 5", label: "First Build Hit", color: "#EF4444" }, { t: "Apr 12", label: "147 Services", color: "#DC2626" }, { t: "Apr 20", label: "JWT Exfil Found", color: "#F59E0B" }, { t: "Apr 22", label: "Investigation", color: "#22C55E" }],
    actions: ["Immediately rotate all JWT signing keys across all 3 clusters and invalidate all existing tokens", "Quarantine the compromised Nexus repository and rebuild from upstream Maven Central with checksum verification", "Trigger full rebuild and redeployment of all 147 affected microservices from verified clean source", "Implement artifact signing with Sigstore/cosign and enforce signature verification in build pipeline", "Reset Nexus admin credentials and enforce MFA with hardware tokens for all repository administrators", "Deploy bytecode analysis scanning in CI pipeline to detect AspectJ weaver injection in future builds", "Conduct full audit of all library artifacts published in the 3-week compromise window"],
    confidence: 83 },
  { id: 9, title: "Quantum-Safe Key Harvest Campaign", severity: "High", status: "Monitoring", alerts: 12, icon: Shield, color: "#A855F7",
    summary: "Threat intelligence from a Five Eyes partner indicates a nation-state actor is systematically intercepting and archiving encrypted TLS 1.2 traffic from high-value financial transaction endpoints in a classic 'harvest now, decrypt later' campaign targeting RSA-2048 key exchanges. Approximately 14 TB of encrypted session data has been captured at an ISP-level optical tap point identified through anomalous fiber signal splitting detected during routine physical plant inspection. The actor has combined the captured ciphertext with stolen session metadata from a compromised load balancer to catalog and prioritize high-value financial transactions for future quantum decryption. While no immediate decryption capability exists, intelligence assessments project adversary quantum computing timelines of 5-8 years for RSA-2048 factoring.",
    triage: { severity: "High", category: "Collection - Future Cryptanalytic Threat", owner: "CISO / Crypto Architecture Team", reasoning: "While no immediate data exposure exists, the strategic capture of encrypted financial data represents an unacceptable long-term risk. Migration to quantum-resistant cryptography must be accelerated." },
    technical: ["ISP fiber tap identified on dark fiber segment between datacenter IX-7 and colocation facility COL-3 via optical power budget anomaly (-0.3dB unexpected loss)", "14 TB of captured TLS 1.2 sessions using RSA-2048 key exchange (non-PFS cipher suites TLS_RSA_WITH_AES_256_CBC_SHA256)", "Compromised F5 load balancer (CVE-2025-20188) provided session metadata including SNI values and client certificate DNs", "Traffic analysis shows selective capture focused on /api/v1/transactions and /api/v1/wire-transfer endpoints", "Nation-state attribution based on SIGINT sharing from allied intelligence service (TLP:RED indicator set)", "Current deployment uses 73% PFS-enabled cipher suites; 27% of connections fall back to static RSA key exchange"],
    mitre: ["T1040 - Network Sniffing", "T1557 - Adversary-in-the-Middle", "T1119 - Automated Collection", "T1565.002 - Transmitted Data Manipulation", "T1600 - Weaken Encryption"],
    entities: ["Financial API Endpoints", "ISP Fiber Segment (IX-7 to COL-3)", "F5 Load Balancer", "14 TB Encrypted Session Archive", "RSA-2048 Key Pairs", "Wire Transfer Processing System"],
    timeline: [{ t: "Jan 2026", label: "Tap Installed", color: "#F59E0B" }, { t: "Feb 2026", label: "LB Compromised", color: "#EF4444" }, { t: "Mar 2026", label: "14 TB Captured", color: "#DC2626" }, { t: "Apr 15", label: "Intel Received", color: "#3B82F6" }, { t: "Apr 18", label: "Tap Confirmed", color: "#22C55E" }, { t: "Apr 22", label: "Monitoring", color: "#A855F7" }],
    actions: ["Immediately disable all non-PFS cipher suites and enforce TLS 1.3 with X25519 key exchange across all endpoints", "Coordinate with ISP to physically inspect and remove the optical fiber tap device with law enforcement chain of custody", "Patch and forensically image the compromised F5 load balancer (CVE-2025-20188) and rotate all associated certificates", "Initiate quantum-resistant cryptography migration roadmap with ML-KEM (Kyber) hybrid key exchange for all financial APIs", "Engage national CERT and intelligence liaison for coordinated response to nation-state collection operation", "Conduct cryptographic inventory audit to identify all remaining RSA-2048 static key exchange deployments"],
    confidence: 62 },
  { id: 10, title: "BMC Firmware Implant via IPMI", severity: "Critical", status: "Contained", alerts: 67, icon: Server, color: "#EF4444",
    summary: "A persistent firmware-level implant was discovered on 23 bare-metal servers after an attacker exploited vulnerable Baseboard Management Controllers (BMC) running outdated Supermicro IPMI firmware with known authentication bypass vulnerabilities. The implant was injected directly into the BMC SPI flash, surviving full OS reinstalls and physical disk replacements, while maintaining command-and-control communication through the dedicated IPMI sideband management network that operates independently of the host operating system. At boot time, the implant leveraged DMA (Direct Memory Access) to inject a custom kernel module into the host OS that established a reverse shell and disabled security monitoring agents. Detection came from a convergence of anomalous IPMI network traffic patterns flagged by OT security monitoring and unexpected DMA memory access patterns identified during a routine firmware integrity audit.",
    triage: { severity: "Critical", category: "Persistence - Firmware Implant", owner: "Infrastructure Security & Hardware Team", reasoning: "Sub-OS firmware persistence on 23 production servers represents maximum-severity compromise that cannot be remediated through software alone. Physical BMC reflashing with verified firmware required for each affected server." },
    technical: ["BMC exploitation via CVE-2024-36435 (Supermicro IPMI authentication bypass, CVSS 9.8) on firmware version 3.72", "Firmware implant written to BMC SPI flash at offset 0x00F80000, persists across OS reinstall and BIOS updates", "C2 communication via IPMI sideband network (VLAN 99, 10.254.0.0/24) using RMCP+ protocol on UDP/623 with custom encapsulation", "DMA-based kernel module injection at boot time targeting Linux kernel 5.15.x, hooking sys_call_table entries for open/read/write", "Injected kernel module (sha256: 4e2f9a...) disabled auditd, Falcon sensor, and osquery processes via signal masking", "23 of 340 bare-metal servers confirmed compromised; all share same BMC firmware version and IPMI VLAN exposure"],
    mitre: ["T1542.001 - System Firmware", "T1601 - Modify System Image", "T1205 - Traffic Signaling", "T1014 - Rootkit", "T1562.001 - Disable or Modify Tools"],
    entities: ["23 Bare-Metal Servers (Supermicro X12SPi)", "BMC/IPMI Controllers", "IPMI Sideband Network (VLAN 99)", "Host Linux Kernels (5.15.x)", "Falcon EDR Agents", "SPI Flash Storage"],
    timeline: [{ t: "Mar 1", label: "IPMI Exploited", color: "#EF4444" }, { t: "Mar 5", label: "Firmware Flashed", color: "#DC2626" }, { t: "Mar 10", label: "Kernel Injected", color: "#DC2626" }, { t: "Apr 1", label: "EDR Disabled", color: "#EF4444" }, { t: "Apr 18", label: "DMA Anomaly", color: "#F59E0B" }, { t: "Apr 21", label: "Contained", color: "#22C55E" }],
    actions: ["Physically disconnect all 23 compromised servers from both production and IPMI sideband networks immediately", "Reflash BMC firmware on each affected server using vendor-verified firmware image via direct SPI flash programmer (not network update)", "Segment IPMI sideband network with strict ACLs and deploy dedicated OT monitoring for RMCP+ protocol anomalies", "Update BMC firmware to patched version on all remaining 317 servers and disable IPMI remote access where not required", "Deploy firmware integrity monitoring solution with TPM-based attestation for continuous BMC state verification", "Conduct full forensic analysis of host OS on all 23 servers to determine scope of data access during compromise window", "Implement hardware security module (HSM) validation of boot chain with measured launch for all bare-metal infrastructure"],
    confidence: 88 },
];

const suggestedQuestions = [
  "What is the blast radius of this incident?",
  "What similar incidents occurred in the past 90 days?",
  "What regulatory notifications are required?",
];

// --- Component ---
export default function AIIncidentSummarizer() {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [phase, setPhase] = useState<"idle" | "processing" | "typing" | "done">("idle");
  const [typedText, setTypedText] = useState("");
  const [visibleSections, setVisibleSections] = useState<number>(0);
  const [showRaw, setShowRaw] = useState(false);
  const [chatMessages, setChatMessages] = useState<{ role: string; text: string }[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatTyping, setChatTyping] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const typingRef = useRef(false);

  const selected = incidents.find((i) => i.id === selectedId) ?? null;

  // Neural-net background
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let animId: number;
    const dots: { x: number; y: number; vx: number; vy: number }[] = [];
    const resize = () => { canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight; };
    resize();
    window.addEventListener("resize", resize);
    for (let i = 0; i < 60; i++) dots.push({ x: Math.random() * canvas.width, y: Math.random() * canvas.height, vx: (Math.random() - 0.5) * 0.4, vy: (Math.random() - 0.5) * 0.4 });
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      dots.forEach((d) => { d.x += d.vx; d.y += d.vy; if (d.x < 0 || d.x > canvas.width) d.vx *= -1; if (d.y < 0 || d.y > canvas.height) d.vy *= -1; });
      for (let i = 0; i < dots.length; i++) for (let j = i + 1; j < dots.length; j++) {
        const dist = Math.hypot(dots[i].x - dots[j].x, dots[i].y - dots[j].y);
        if (dist < 120) { ctx.strokeStyle = `rgba(59,130,246,${0.08 * (1 - dist / 120)})`; ctx.beginPath(); ctx.moveTo(dots[i].x, dots[i].y); ctx.lineTo(dots[j].x, dots[j].y); ctx.stroke(); }
      }
      dots.forEach((d) => { ctx.fillStyle = "rgba(59,130,246,0.25)"; ctx.beginPath(); ctx.arc(d.x, d.y, 1.5, 0, Math.PI * 2); ctx.fill(); });
      animId = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(animId); window.removeEventListener("resize", resize); };
  }, []);

  // Typewriter
  useEffect(() => {
    if (phase !== "typing" || !selected) return;
    typingRef.current = true;
    let i = 0;
    const iv = setInterval(() => {
      if (!typingRef.current) { clearInterval(iv); return; }
      i++;
      setTypedText(selected.summary.slice(0, i));
      if (i >= selected.summary.length) { clearInterval(iv); setPhase("done"); }
    }, 18);
    return () => { clearInterval(iv); typingRef.current = false; };
  }, [phase, selected]);

  // Sequential fade-in
  useEffect(() => {
    if (phase !== "done") return;
    let count = 0;
    const iv = setInterval(() => { count++; setVisibleSections(count); if (count >= 7) clearInterval(iv); }, 350);
    return () => clearInterval(iv);
  }, [phase]);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chatMessages, chatTyping]);

  const selectIncident = useCallback((id: number) => {
    typingRef.current = false;
    setSelectedId(id); setPhase("processing"); setTypedText(""); setVisibleSections(0);
    setChatMessages([]); setChatInput(""); setShowRaw(false);
    setTimeout(() => setPhase("typing"), 1800);
  }, []);

  const sendChat = useCallback((text: string) => {
    if (!text.trim() || chatTyping) return;
    const q = text.trim();
    setChatInput("");
    setChatMessages((prev) => [...prev, { role: "user", text: q }]);
    setChatTyping(true);
    const response = `Based on the incident analysis, ${q.toLowerCase().includes("blast") ? "the blast radius encompasses 3 network segments, 47 user accounts, and 2 critical business applications. Secondary impact includes potential supply chain exposure through the CI/CD pipeline." : q.toLowerCase().includes("similar") ? "there were 3 similar incidents in the past 90 days: INC-2847 (Mar 15), INC-2691 (Feb 28), and INC-2534 (Jan 30). Pattern analysis suggests a coordinated campaign with increasing sophistication." : "regulatory review indicates GDPR Article 33 notification required within 72 hours, SEC Form 8-K may apply if material impact confirmed, and state breach notification laws triggered for 3 jurisdictions."}`;
    let i = 0;
    const partial = { role: "ai", text: "" };
    setChatMessages((prev) => [...prev, partial]);
    const iv = setInterval(() => {
      i++;
      setChatMessages((prev) => { const copy = [...prev]; copy[copy.length - 1] = { role: "ai", text: response.slice(0, i) }; return copy; });
      if (i >= response.length) { clearInterval(iv); setChatTyping(false); }
    }, 14);
  }, [chatTyping]);

  const sevColor = (s: string) => s === "Critical" ? "text-red-400 bg-red-500/15 border-red-500/30" : s === "High" ? "text-amber-400 bg-amber-500/15 border-amber-500/30" : "text-blue-400 bg-blue-500/15 border-blue-500/30";
  const statusColor = (s: string) => s === "Active" ? "text-red-400" : s === "Contained" ? "text-green-400" : s === "Mitigated" ? "text-emerald-400" : s === "Investigating" ? "text-amber-400" : "text-blue-400";

  // Confidence ring
  const ConfidenceRing = ({ value }: { value: number }) => {
    const r = 40, c = 2 * Math.PI * r, offset = c * (1 - value / 100);
    return (
      <div className="relative w-28 h-28 flex items-center justify-center">
        <svg width="112" height="112" className="rotate-[-90deg]">
          <defs><filter id="glow"><feGaussianBlur stdDeviation="3" result="g" /><feMerge><feMergeNode in="g" /><feMergeNode in="SourceGraphic" /></feMerge></filter></defs>
          <circle cx="56" cy="56" r={r} fill="none" stroke="#1E293B" strokeWidth="6" />
          <circle cx="56" cy="56" r={r} fill="none" stroke={value > 90 ? "#22C55E" : value > 75 ? "#3B82F6" : "#F59E0B"} strokeWidth="6" strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round" filter="url(#glow)" className="transition-all duration-1000" />
        </svg>
        <div className="absolute flex flex-col items-center">
          <span className="text-2xl font-bold text-white">{value}%</span>
          <span className="text-[10px] text-slate-400 uppercase tracking-wider">Confidence</span>
        </div>
      </div>
    );
  };

  const Section = ({ visible, children, delay }: { visible: boolean; children: React.ReactNode; delay?: number }) => (
    <div className={`transition-all duration-500 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none"}`} style={{ transitionDelay: `${delay ?? 0}ms` }}>
      {children}
    </div>
  );

  return (
    <div className="relative h-screen w-full bg-[#0A1628] text-slate-200 flex overflow-hidden font-sans">
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none z-0" />

      {/* Left Panel */}
      <div className="relative z-10 w-[380px] min-w-[380px] border-r border-slate-700/50 flex flex-col">
        <div className="p-4 border-b border-slate-700/50 flex items-center gap-2">
          <Brain className="w-5 h-5 text-blue-400" />
          <h1 className="text-lg font-semibold text-white">AI Incident Summarizer</h1>
          <Sparkles className="w-4 h-4 text-amber-400 ml-auto" />
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {incidents.map((inc) => {
            const Icon = inc.icon;
            const active = selectedId === inc.id;
            return (
              <button key={inc.id} onClick={() => selectIncident(inc.id)}
                className={`w-full text-left rounded-lg p-3 border transition-all duration-200 ${active ? "bg-blue-500/10 border-blue-500/40 shadow-lg shadow-blue-500/5" : "bg-slate-800/40 border-slate-700/30 hover:bg-slate-800/70 hover:border-slate-600/50"}`}>
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-slate-700/40" style={{ color: inc.color }}><Icon className="w-4 h-4" /></div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium text-white truncate">{inc.title}</span>
                      <span className="shrink-0 px-1.5 py-0.5 text-[10px] font-bold rounded bg-blue-500/20 text-blue-400 border border-blue-500/30">AI</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <span className={`px-1.5 py-0.5 rounded border text-[10px] font-semibold ${sevColor(inc.severity)}`}>{inc.severity}</span>
                      <span className={`${statusColor(inc.status)} flex items-center gap-1`}>
                        {inc.status === "Active" && <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />}
                        {inc.status}
                      </span>
                      <span className="text-slate-500 ml-auto">{inc.alerts} alerts</span>
                    </div>
                  </div>
                  <ChevronRight className={`w-4 h-4 mt-1 shrink-0 transition-colors ${active ? "text-blue-400" : "text-slate-600"}`} />
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Right Panel */}
      <div className="relative z-10 flex-1 overflow-y-auto">
        {!selected ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-500 gap-3">
            <Brain className="w-12 h-12 text-slate-600" />
            <p className="text-sm">Select an incident to generate AI summary</p>
          </div>
        ) : phase === "processing" ? (
          <div className="h-full flex flex-col items-center justify-center gap-4">
            <Brain className="w-10 h-10 text-blue-400 animate-spin" />
            <p className="text-blue-400 text-sm animate-pulse font-medium">AI Processing Incident Data...</p>
            <div className="flex gap-1">{[0, 1, 2].map((i) => <span key={i} className="w-2 h-2 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: `${i * 150}ms` }} />)}</div>
          </div>
        ) : (
          <div className="p-6 space-y-5 max-w-4xl mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <selected.icon className="w-5 h-5" style={{ color: selected.color }} />
                <h2 className="text-xl font-bold text-white">{selected.title}</h2>
                <span className={`px-2 py-0.5 rounded border text-xs font-semibold ${sevColor(selected.severity)}`}>{selected.severity}</span>
              </div>
              <button onClick={() => { typingRef.current = false; setSelectedId(null); setPhase("idle"); }} className="p-1 rounded hover:bg-slate-700/50 text-slate-400"><X className="w-4 h-4" /></button>
            </div>

            {/* Executive Summary */}
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-3"><FileText className="w-4 h-4 text-blue-400" /><span className="text-sm font-semibold text-blue-400 uppercase tracking-wider">Executive Summary</span></div>
              <p className="text-sm text-slate-300 leading-relaxed">
                {typedText}
                {phase === "typing" && <span className="inline-block w-0.5 h-4 bg-blue-400 ml-0.5 align-middle animate-pulse" />}
              </p>
            </div>

            {/* Before/After Toggle */}
            <Section visible={visibleSections >= 1}>
              <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2"><Eye className="w-4 h-4 text-purple-400" /><span className="text-sm font-semibold text-purple-400 uppercase tracking-wider">Before / After AI</span></div>
                  <button onClick={() => setShowRaw(!showRaw)} className="text-xs px-3 py-1 rounded-full border border-slate-600 text-slate-300 hover:bg-slate-700/50 transition-colors">{showRaw ? "Show AI Output" : "Show Raw Alerts"}</button>
                </div>
                {showRaw ? (
                  <div className="font-mono text-xs text-slate-400 space-y-1 bg-slate-900/50 p-3 rounded-lg max-h-32 overflow-y-auto">
                    {selected.technical.map((t, i) => <div key={i} className="flex items-start gap-2"><XCircle className="w-3 h-3 text-red-400 mt-0.5 shrink-0" /><span>{`[ALERT-${String(i + 1).padStart(3, "0")}] RAW: ${t}`}</span></div>)}
                    <div className="text-slate-500 mt-2">... +{selected.alerts - 4} more unstructured alerts</div>
                  </div>
                ) : (
                  <div className="text-xs text-slate-300 space-y-1 bg-slate-900/30 p-3 rounded-lg">
                    {selected.technical.map((t, i) => <div key={i} className="flex items-start gap-2"><CheckCircle2 className="w-3 h-3 text-green-400 mt-0.5 shrink-0" /><span>{t}</span></div>)}
                  </div>
                )}
              </div>
            </Section>

            {/* Auto-Triage + Confidence */}
            <Section visible={visibleSections >= 2}>
              <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
                <div className="flex items-center gap-2 mb-4"><Target className="w-4 h-4 text-amber-400" /><span className="text-sm font-semibold text-amber-400 uppercase tracking-wider">Auto-Triage</span></div>
                <div className="flex gap-6">
                  <div className="flex-1 grid grid-cols-2 gap-3 text-xs">
                    {[["Severity", selected.triage.severity, AlertTriangle], ["Category", selected.triage.category, Shield], ["Owner", selected.triage.owner, User], ["Reasoning", selected.triage.reasoning, Brain]].map(([label, val, Ic]) => {
                      const LIcon = Ic as typeof Brain;
                      return (
                        <div key={label as string} className={`bg-slate-900/40 rounded-lg p-3 ${label === "Reasoning" ? "col-span-2" : ""}`}>
                          <div className="flex items-center gap-1.5 text-slate-400 mb-1"><LIcon className="w-3 h-3" />{label as string}</div>
                          <div className="text-slate-200 font-medium">{val as string}</div>
                        </div>
                      );
                    })}
                  </div>
                  <ConfidenceRing value={selected.confidence} />
                </div>
              </div>
            </Section>

            {/* Technical Analysis */}
            <Section visible={visibleSections >= 3}>
              <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
                <div className="flex items-center gap-2 mb-3"><Activity className="w-4 h-4 text-cyan-400" /><span className="text-sm font-semibold text-cyan-400 uppercase tracking-wider">Technical Analysis</span></div>
                <div className="space-y-2">
                  {selected.technical.map((t, i) => <div key={i} className="flex items-start gap-2 text-xs text-slate-300"><Server className="w-3 h-3 text-cyan-400 mt-0.5 shrink-0" /><span>{t}</span></div>)}
                </div>
              </div>
            </Section>

            {/* MITRE + Entities */}
            <Section visible={visibleSections >= 4}>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
                  <div className="flex items-center gap-2 mb-3"><Shield className="w-4 h-4 text-red-400" /><span className="text-sm font-semibold text-red-400 uppercase tracking-wider">MITRE ATT&CK</span></div>
                  <div className="space-y-1.5">{selected.mitre.map((m, i) => <div key={i} className="text-xs bg-red-500/10 text-red-300 px-2 py-1.5 rounded border border-red-500/20">{m}</div>)}</div>
                </div>
                <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
                  <div className="flex items-center gap-2 mb-3"><Globe className="w-4 h-4 text-emerald-400" /><span className="text-sm font-semibold text-emerald-400 uppercase tracking-wider">Affected Entities</span></div>
                  <div className="space-y-1.5">{selected.entities.map((e, i) => <div key={i} className="flex items-center gap-2 text-xs text-slate-300"><Server className="w-3 h-3 text-emerald-400" />{e}</div>)}</div>
                </div>
              </div>
            </Section>

            {/* Timeline */}
            <Section visible={visibleSections >= 5}>
              <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
                <div className="flex items-center gap-2 mb-4"><Clock className="w-4 h-4 text-blue-400" /><span className="text-sm font-semibold text-blue-400 uppercase tracking-wider">Attack Timeline</span></div>
                <div className="relative flex items-center justify-between px-4">
                  <div className="absolute left-8 right-8 top-1/2 -translate-y-1/2 h-0.5 bg-gradient-to-r from-amber-500/40 via-red-500/40 to-green-500/40" />
                  {selected.timeline.map((step, i) => (
                    <div key={i} className="relative flex flex-col items-center gap-2 z-10">
                      <div className="w-8 h-8 rounded-full border-2 flex items-center justify-center text-[10px] font-bold shadow-lg" style={{ borderColor: step.color, backgroundColor: `${step.color}20`, color: step.color, boxShadow: `0 0 12px ${step.color}40` }}>
                        {i + 1}
                      </div>
                      <span className="text-[10px] font-medium text-slate-400 whitespace-nowrap">{step.t}</span>
                      <span className="text-[10px] text-slate-300 whitespace-nowrap font-medium">{step.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </Section>

            {/* Recommended Actions */}
            <Section visible={visibleSections >= 6}>
              <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
                <div className="flex items-center gap-2 mb-3"><TrendingUp className="w-4 h-4 text-green-400" /><span className="text-sm font-semibold text-green-400 uppercase tracking-wider">Recommended Actions</span></div>
                <div className="space-y-2">
                  {selected.actions.map((a, i) => (
                    <div key={i} className="flex items-start gap-3 text-xs">
                      <span className={`shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${i === 0 ? "bg-red-500/20 text-red-400 border border-red-500/30" : i < 3 ? "bg-amber-500/20 text-amber-400 border border-amber-500/30" : "bg-slate-700/50 text-slate-400 border border-slate-600/30"}`}>{i + 1}</span>
                      <span className="text-slate-300 pt-0.5">{a}</span>
                    </div>
                  ))}
                </div>
              </div>
            </Section>

            {/* Q&A Chat */}
            <Section visible={visibleSections >= 7}>
              <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
                <div className="flex items-center gap-2 mb-3"><MessageSquare className="w-4 h-4 text-violet-400" /><span className="text-sm font-semibold text-violet-400 uppercase tracking-wider">Ask AI About This Incident</span></div>
                <div className="flex flex-wrap gap-2 mb-3">
                  {suggestedQuestions.map((q, i) => (
                    <button key={i} onClick={() => sendChat(q)} className="text-[11px] px-3 py-1.5 rounded-full border border-violet-500/30 text-violet-300 bg-violet-500/10 hover:bg-violet-500/20 transition-colors">{q}</button>
                  ))}
                </div>
                <div className="bg-slate-900/50 rounded-lg p-3 max-h-48 overflow-y-auto space-y-3 mb-3 min-h-[60px]">
                  {chatMessages.length === 0 && <p className="text-xs text-slate-500 italic">Ask a question or click a suggestion above...</p>}
                  {chatMessages.map((msg, i) => (
                    <div key={i} className={`flex gap-2 text-xs ${msg.role === "user" ? "justify-end" : ""}`}>
                      {msg.role === "ai" && <Brain className="w-3.5 h-3.5 text-violet-400 mt-0.5 shrink-0" />}
                      <span className={`inline-block px-3 py-2 rounded-lg max-w-[80%] ${msg.role === "user" ? "bg-blue-500/20 text-blue-200" : "bg-slate-800/80 text-slate-300"}`}>
                        {msg.text}
                        {msg.role === "ai" && chatTyping && i === chatMessages.length - 1 && <span className="inline-block w-0.5 h-3 bg-violet-400 ml-0.5 align-middle animate-pulse" />}
                      </span>
                    </div>
                  ))}
                  <div ref={chatEndRef} />
                </div>
                <div className="flex gap-2">
                  <input value={chatInput} onChange={(e) => setChatInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && sendChat(chatInput)}
                    placeholder="Ask about this incident..." className="flex-1 bg-slate-900/60 border border-slate-700/50 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder-slate-500 outline-none focus:border-violet-500/50 transition-colors" />
                  <button onClick={() => sendChat(chatInput)} className="p-2 rounded-lg bg-violet-500/20 border border-violet-500/30 text-violet-400 hover:bg-violet-500/30 transition-colors"><Send className="w-4 h-4" /></button>
                </div>
              </div>
            </Section>
          </div>
        )}
      </div>
    </div>
  );
}
