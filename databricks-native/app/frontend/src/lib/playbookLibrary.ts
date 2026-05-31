// Procedural playbook library - generates 1000+ unique playbooks from category templates

export interface Playbook {
  id: number;
  name: string;
  category: string;
  subcategory: string;
  severity: 'Critical' | 'High' | 'Medium' | 'Low';
  prompt: string;
  mitre: string[];
  executions: number;
  avgTime: string;
  successRate: number;
  lastTriggered: string;
  steps: number;
  author: string;
  tags: string[];
  status: 'Active' | 'Draft' | 'Deprecated' | 'Testing';
}

interface CategoryDef {
  category: string;
  subcategories: {
    name: string;
    templates: {
      name: string;
      severity: Playbook['severity'];
      prompt: string;
      mitre: string[];
      tags: string[];
      steps: number;
    }[];
  }[];
}

const CATEGORIES: CategoryDef[] = [
  {
    category: 'Credential & Identity',
    subcategories: [
      { name: 'Brute Force', templates: [
        { name: 'Password Spray Response', severity: 'Critical', prompt: 'When password spray detected across 10+ accounts, lock targeted accounts, block source IP, reset passwords for compromised accounts, notify SOC.', mitre: ['T1110.003'], tags: ['identity', 'lockout'], steps: 6 },
        { name: 'RDP Brute Force Block', severity: 'High', prompt: 'When RDP brute force exceeds 50 attempts, block source at firewall, disable RDP for target, create case.', mitre: ['T1110.001'], tags: ['rdp', 'firewall'], steps: 5 },
        { name: 'SSH Brute Force Containment', severity: 'High', prompt: 'When SSH login failures exceed threshold from single IP, add to denylist, enable fail2ban rule, alert sysadmin.', mitre: ['T1110.001'], tags: ['ssh', 'linux'], steps: 5 },
        { name: 'Kerberos Brute Force', severity: 'Critical', prompt: 'When Kerberos pre-auth failures spike, identify targeted service accounts, rotate keys, escalate to Tier 2.', mitre: ['T1110.002'], tags: ['kerberos', 'ad'], steps: 6 },
        { name: 'API Key Brute Force', severity: 'High', prompt: 'When API authentication failures exceed rate limit from single client, revoke API key, block client IP, audit API access logs.', mitre: ['T1110'], tags: ['api', 'cloud'], steps: 5 },
      ]},
      { name: 'Credential Theft', templates: [
        { name: 'LSASS Memory Dump Response', severity: 'Critical', prompt: 'When LSASS access detected from non-system process, isolate endpoint, kill process, force password reset for all cached credentials.', mitre: ['T1003.001'], tags: ['memory', 'mimikatz'], steps: 7 },
        { name: 'Kerberoasting Detection', severity: 'High', prompt: 'When anomalous TGS requests detected for service accounts, reset service account passwords, audit SPNs, enable AES-only auth.', mitre: ['T1558.003'], tags: ['kerberos', 'spn'], steps: 6 },
        { name: 'Golden Ticket Response', severity: 'Critical', prompt: 'When golden ticket usage detected, reset krbtgt twice, rebuild trust relationships, full AD audit, engage IR team.', mitre: ['T1558.001'], tags: ['kerberos', 'ad'], steps: 8 },
        { name: 'DCSync Attack Response', severity: 'Critical', prompt: 'When DCSync replication request from non-DC detected, block source, audit AD replication, reset compromised accounts.', mitre: ['T1003.006'], tags: ['ad', 'replication'], steps: 7 },
        { name: 'Cookie Theft Response', severity: 'High', prompt: 'When session cookie exfiltration detected, invalidate all sessions for user, enforce re-authentication, scan for malware.', mitre: ['T1539'], tags: ['session', 'browser'], steps: 5 },
      ]},
      { name: 'Account Compromise', templates: [
        { name: 'Impossible Travel Alert', severity: 'High', prompt: 'When login from geographically impossible location detected, suspend account, require MFA re-enrollment, verify with user.', mitre: ['T1078'], tags: ['geo', 'mfa'], steps: 5 },
        { name: 'OAuth Token Abuse', severity: 'High', prompt: 'When suspicious OAuth consent grant detected, revoke tokens, remove malicious app registration, audit mailbox rules.', mitre: ['T1550.001'], tags: ['oauth', 'cloud'], steps: 6 },
        { name: 'MFA Fatigue Response', severity: 'Critical', prompt: 'When MFA push spam detected, disable push notifications for user, switch to FIDO2, investigate source of credential compromise.', mitre: ['T1621'], tags: ['mfa', 'social'], steps: 6 },
        { name: 'Service Account Compromise', severity: 'Critical', prompt: 'When service account used interactively, disable account, rotate credentials, audit all actions performed, check lateral movement.', mitre: ['T1078.001'], tags: ['service', 'audit'], steps: 7 },
      ]},
      { name: 'Privilege Escalation', templates: [
        { name: 'UAC Bypass Response', severity: 'High', prompt: 'When UAC bypass technique detected, kill process, scan endpoint, review user privileges, patch bypass vector.', mitre: ['T1548.002'], tags: ['uac', 'windows'], steps: 5 },
        { name: 'sudo Abuse Detection', severity: 'High', prompt: 'When unauthorized sudo escalation detected on Linux host, lock user account, audit sudoers file, review command history.', mitre: ['T1548.003'], tags: ['linux', 'sudo'], steps: 5 },
        { name: 'AD Group Policy Abuse', severity: 'Critical', prompt: 'When unauthorized GPO modification detected, revert changes, audit GPO history, restrict GPO edit permissions.', mitre: ['T1484.001'], tags: ['gpo', 'ad'], steps: 6 },
        { name: 'Kernel Exploit Containment', severity: 'Critical', prompt: 'When kernel exploitation detected, isolate system, capture memory dump, patch vulnerability, scan fleet for similar exposure.', mitre: ['T1068'], tags: ['kernel', 'exploit'], steps: 7 },
      ]},
    ],
  },
  {
    category: 'Malware & Ransomware',
    subcategories: [
      { name: 'Ransomware', templates: [
        { name: 'Ransomware Pre-Encryption Block', severity: 'Critical', prompt: 'When ransomware indicators detected pre-encryption, isolate host, kill malicious processes, snapshot disk, block C2.', mitre: ['T1486'], tags: ['ransomware', 'isolation'], steps: 8 },
        { name: 'Mass File Encryption Alert', severity: 'Critical', prompt: 'When mass file rename/encryption detected, disable network for affected subnet, preserve evidence, activate BCP.', mitre: ['T1486'], tags: ['encryption', 'bcp'], steps: 9 },
        { name: 'Ransomware Negotiation Protocol', severity: 'Critical', prompt: 'When ransomware note discovered, engage legal counsel, contact law enforcement, assess backup viability, prepare communications.', mitre: ['T1486'], tags: ['legal', 'recovery'], steps: 10 },
        { name: 'VSS Deletion Response', severity: 'Critical', prompt: 'When volume shadow copy deletion detected, isolate host immediately, check backup integrity, scan for ransomware IOCs.', mitre: ['T1490'], tags: ['vss', 'backup'], steps: 6 },
      ]},
      { name: 'Malware Delivery', templates: [
        { name: 'Macro-Enabled Document Block', severity: 'High', prompt: 'When Office macro execution detected from email attachment, quarantine document, scan endpoint, check other recipients.', mitre: ['T1204.002'], tags: ['macro', 'email'], steps: 6 },
        { name: 'DLL Sideloading Response', severity: 'High', prompt: 'When DLL sideloading detected in legitimate process, kill process tree, quarantine malicious DLL, scan for persistence.', mitre: ['T1574.002'], tags: ['dll', 'sideload'], steps: 6 },
        { name: 'Dropper Detection & Cleanup', severity: 'Critical', prompt: 'When malware dropper identified, isolate endpoint, kill dropper process, remove dropped files, scan for C2 beacons.', mitre: ['T1105'], tags: ['dropper', 'c2'], steps: 7 },
        { name: 'Drive-by Download Response', severity: 'High', prompt: 'When drive-by download detected from watering hole site, block domain, scan all visitors, check browser exploits used.', mitre: ['T1189'], tags: ['browser', 'waterhole'], steps: 6 },
      ]},
      { name: 'C2 Communication', templates: [
        { name: 'Cobalt Strike Beacon Response', severity: 'Critical', prompt: 'When Cobalt Strike beacon detected, isolate host, decode C2 config, block team server IP, sweep network for other beacons.', mitre: ['T1071.001'], tags: ['cobaltstrike', 'c2'], steps: 8 },
        { name: 'DNS Tunneling Block', severity: 'High', prompt: 'When DNS tunneling detected, block malicious domain, isolate source host, audit DNS logs for data volume assessment.', mitre: ['T1071.004'], tags: ['dns', 'tunnel'], steps: 6 },
        { name: 'Encrypted C2 Channel Detection', severity: 'High', prompt: 'When anomalous encrypted traffic patterns detected, capture traffic sample, block destination, check certificate anomalies.', mitre: ['T1573'], tags: ['tls', 'encrypted'], steps: 6 },
        { name: 'Domain Fronting Response', severity: 'High', prompt: 'When domain fronting via CDN detected, block specific CDN edge, analyze traffic patterns, identify actual C2 endpoint.', mitre: ['T1090.004'], tags: ['cdn', 'fronting'], steps: 6 },
      ]},
      { name: 'Persistence', templates: [
        { name: 'Registry Run Key Removal', severity: 'Medium', prompt: 'When malicious registry run key detected, remove key, scan for associated malware, check other persistence mechanisms.', mitre: ['T1547.001'], tags: ['registry', 'autostart'], steps: 5 },
        { name: 'Scheduled Task Cleanup', severity: 'Medium', prompt: 'When malicious scheduled task detected, remove task, quarantine payload, audit all scheduled tasks on host.', mitre: ['T1053.005'], tags: ['schtask', 'persistence'], steps: 5 },
        { name: 'WMI Persistence Removal', severity: 'High', prompt: 'When WMI event subscription persistence detected, remove subscription, clean associated scripts, monitor for recreation.', mitre: ['T1546.003'], tags: ['wmi', 'persistence'], steps: 6 },
        { name: 'Bootkit Detection Response', severity: 'Critical', prompt: 'When MBR/VBR modification detected, isolate system, boot from clean media, reimage drive, verify firmware integrity.', mitre: ['T1542.003'], tags: ['bootkit', 'firmware'], steps: 8 },
      ]},
    ],
  },
  {
    category: 'Phishing & Social Engineering',
    subcategories: [
      { name: 'Email Phishing', templates: [
        { name: 'Spearphishing Containment', severity: 'High', prompt: 'When spearphishing email detected, quarantine across all inboxes, extract IOCs, check who clicked, isolate affected endpoints.', mitre: ['T1566.001'], tags: ['email', 'quarantine'], steps: 7 },
        { name: 'BEC Wire Fraud Prevention', severity: 'Critical', prompt: 'When business email compromise detected targeting wire transfer, freeze transaction, verify with sender via phone, alert finance.', mitre: ['T1566.002'], tags: ['bec', 'finance'], steps: 6 },
        { name: 'Credential Harvesting Page Block', severity: 'High', prompt: 'When phishing page mimicking corporate login detected, block URL across proxies, check access logs, reset exposed credentials.', mitre: ['T1566.003'], tags: ['credential', 'proxy'], steps: 6 },
        { name: 'QR Code Phishing (Quishing)', severity: 'Medium', prompt: 'When malicious QR code in email detected, quarantine email, block destination URL, alert users who received it.', mitre: ['T1566.001'], tags: ['qrcode', 'mobile'], steps: 5 },
      ]},
      { name: 'Social Engineering', templates: [
        { name: 'Vishing Call Response', severity: 'Medium', prompt: 'When voice phishing campaign reported, alert all employees, update IVR with warning, log reported numbers, engage telco.', mitre: ['T1598.001'], tags: ['voice', 'phone'], steps: 5 },
        { name: 'Smishing Campaign Block', severity: 'Medium', prompt: 'When SMS phishing campaign detected, report to carrier, block sender, scan for submitted credentials, alert affected users.', mitre: ['T1566'], tags: ['sms', 'mobile'], steps: 5 },
        { name: 'Deepfake CEO Fraud Response', severity: 'Critical', prompt: 'When deepfake audio/video used for CEO impersonation detected, halt requested transaction, verify identity through secure channel.', mitre: ['T1598'], tags: ['deepfake', 'fraud'], steps: 7 },
      ]},
    ],
  },
  {
    category: 'Network & Infrastructure',
    subcategories: [
      { name: 'DDoS', templates: [
        { name: 'Volumetric DDoS Mitigation', severity: 'Critical', prompt: 'When volumetric DDoS exceeds threshold, enable scrubbing center, rate limit, reroute through clean pipes, notify ISP.', mitre: ['T1498'], tags: ['ddos', 'volumetric'], steps: 7 },
        { name: 'Application Layer DDoS', severity: 'High', prompt: 'When HTTP flood detected on API endpoints, enable WAF rate limiting, challenge suspicious clients, scale backend.', mitre: ['T1499'], tags: ['http', 'waf'], steps: 6 },
        { name: 'DNS Amplification Response', severity: 'High', prompt: 'When DNS amplification attack detected, null-route spoofed traffic, notify upstream providers, activate BGP blackhole.', mitre: ['T1498.002'], tags: ['dns', 'amplification'], steps: 6 },
      ]},
      { name: 'Lateral Movement', templates: [
        { name: 'PsExec Lateral Movement Block', severity: 'Critical', prompt: 'When PsExec lateral movement detected, isolate source and target, disable admin shares, reset compromised credentials.', mitre: ['T1570'], tags: ['psexec', 'admin'], steps: 7 },
        { name: 'RDP Lateral Movement', severity: 'High', prompt: 'When unauthorized RDP session between internal hosts detected, terminate session, restrict RDP via GPO, investigate source.', mitre: ['T1021.001'], tags: ['rdp', 'internal'], steps: 6 },
        { name: 'WMI Remote Execution Block', severity: 'High', prompt: 'When WMI remote execution detected, block WMI traffic between hosts, investigate executed commands, scan target host.', mitre: ['T1047'], tags: ['wmi', 'remote'], steps: 6 },
        { name: 'SMB Relay Attack Response', severity: 'Critical', prompt: 'When SMB relay attack detected, enable SMB signing, disable NTLM where possible, isolate affected segment.', mitre: ['T1557.001'], tags: ['smb', 'relay'], steps: 7 },
      ]},
      { name: 'Network Attacks', templates: [
        { name: 'ARP Spoofing Response', severity: 'High', prompt: 'When ARP spoofing detected, isolate rogue device, enable dynamic ARP inspection, alert network team.', mitre: ['T1557.002'], tags: ['arp', 'spoofing'], steps: 5 },
        { name: 'VLAN Hopping Prevention', severity: 'High', prompt: 'When VLAN hopping attempt detected, disable DTP, configure trunk ports explicitly, audit switch configurations.', mitre: ['T1599'], tags: ['vlan', 'switch'], steps: 5 },
        { name: 'BGP Hijack Response', severity: 'Critical', prompt: 'When BGP route anomaly detected, verify with upstream, activate RPKI validation, notify affected peers.', mitre: ['T1557'], tags: ['bgp', 'routing'], steps: 7 },
        { name: 'Rogue DHCP Server', severity: 'Medium', prompt: 'When rogue DHCP server detected, identify and disable port, enable DHCP snooping, scan affected clients.', mitre: ['T1557'], tags: ['dhcp', 'rogue'], steps: 5 },
      ]},
      { name: 'Wireless', templates: [
        { name: 'Evil Twin AP Response', severity: 'High', prompt: 'When evil twin access point detected, locate and disable rogue AP, alert connected users, force re-authentication.', mitre: ['T1557'], tags: ['wifi', 'rogue'], steps: 6 },
        { name: 'WPA3 Downgrade Attack', severity: 'High', prompt: 'When WPA downgrade detected, block rogue AP, enforce WPA3 minimum, scan for PMKID captures.', mitre: ['T1557'], tags: ['wifi', 'downgrade'], steps: 5 },
      ]},
    ],
  },
  {
    category: 'Cloud & SaaS',
    subcategories: [
      { name: 'AWS Security', templates: [
        { name: 'S3 Bucket Exposure Response', severity: 'Critical', prompt: 'When public S3 bucket detected with sensitive data, make private immediately, audit access logs, assess data exposure scope.', mitre: ['T1530'], tags: ['s3', 'exposure'], steps: 6 },
        { name: 'IAM Key Compromise', severity: 'Critical', prompt: 'When compromised IAM access key detected, rotate key immediately, audit CloudTrail, revoke temporary credentials.', mitre: ['T1078.004'], tags: ['iam', 'key'], steps: 7 },
        { name: 'EC2 Crypto Mining', severity: 'High', prompt: 'When crypto mining on EC2 detected, terminate instance, review launch configuration, check IAM for unauthorized access.', mitre: ['T1496'], tags: ['ec2', 'mining'], steps: 6 },
        { name: 'Lambda Function Abuse', severity: 'High', prompt: 'When malicious Lambda execution detected, disable function, review execution logs, check IAM role permissions.', mitre: ['T1648'], tags: ['lambda', 'serverless'], steps: 5 },
      ]},
      { name: 'Azure Security', templates: [
        { name: 'Azure AD Conditional Access Bypass', severity: 'Critical', prompt: 'When conditional access bypass detected, enforce stricter policies, revoke sessions, audit sign-in logs.', mitre: ['T1078.004'], tags: ['azure', 'conditional'], steps: 6 },
        { name: 'Azure Key Vault Access Anomaly', severity: 'Critical', prompt: 'When unauthorized Key Vault access detected, rotate affected secrets, restrict access policies, audit diagnostic logs.', mitre: ['T1552.005'], tags: ['keyvault', 'secrets'], steps: 7 },
        { name: 'Azure Storage Account Exposure', severity: 'High', prompt: 'When public Azure blob storage detected, set private access, regenerate SAS tokens, audit access logs.', mitre: ['T1530'], tags: ['blob', 'storage'], steps: 5 },
      ]},
      { name: 'GCP Security', templates: [
        { name: 'GCP Service Account Key Leak', severity: 'Critical', prompt: 'When GCP service account key found in public repo, revoke key, audit IAM activity, scan for data access.', mitre: ['T1552.001'], tags: ['gcp', 'serviceaccount'], steps: 6 },
        { name: 'GCP Firewall Rule Tampering', severity: 'High', prompt: 'When unauthorized firewall rule change detected, revert rule, audit admin activity, restrict IAM permissions.', mitre: ['T1562.007'], tags: ['gcp', 'firewall'], steps: 5 },
      ]},
      { name: 'SaaS & M365', templates: [
        { name: 'Mailbox Forwarding Rule', severity: 'High', prompt: 'When suspicious mailbox forwarding rule detected, remove rule, check for data exfiltration, reset user credentials.', mitre: ['T1114.003'], tags: ['email', 'forwarding'], steps: 5 },
        { name: 'SharePoint Mass Download', severity: 'High', prompt: 'When unusual mass file download from SharePoint detected, restrict user access, audit downloaded files, alert DLP team.', mitre: ['T1213.002'], tags: ['sharepoint', 'dlp'], steps: 5 },
        { name: 'Teams External Sharing Block', severity: 'Medium', prompt: 'When sensitive file shared externally via Teams, revoke link, notify user, enforce DLP policy, log compliance event.', mitre: ['T1567'], tags: ['teams', 'sharing'], steps: 5 },
      ]},
    ],
  },
  {
    category: 'Insider Threat',
    subcategories: [
      { name: 'Data Theft', templates: [
        { name: 'USB Mass Copy Detection', severity: 'High', prompt: 'When mass file copy to USB detected, disable USB ports, alert manager, preserve forensic evidence, restrict access.', mitre: ['T1052.001'], tags: ['usb', 'exfil'], steps: 6 },
        { name: 'Cloud Storage Exfiltration', severity: 'High', prompt: 'When upload to personal cloud storage detected, block upload, restrict cloud access, notify HR, preserve evidence.', mitre: ['T1567.002'], tags: ['cloud', 'personal'], steps: 6 },
        { name: 'Print Job Anomaly', severity: 'Medium', prompt: 'When unusual bulk printing of sensitive documents detected, disable print access, alert security, audit printed content.', mitre: ['T1074'], tags: ['print', 'physical'], steps: 5 },
        { name: 'Email Auto-Forward Exfil', severity: 'High', prompt: 'When auto-forward rule to personal email detected, remove rule, audit forwarded content, restrict mailbox rules.', mitre: ['T1114.003'], tags: ['email', 'forward'], steps: 5 },
      ]},
      { name: 'Behavioral', templates: [
        { name: 'After-Hours Access Response', severity: 'Medium', prompt: 'When sensitive system access outside business hours by non-exempt employee, log activity, alert manager, increase monitoring.', mitre: ['T1078'], tags: ['hours', 'behavioral'], steps: 4 },
        { name: 'Resignation Risk Monitoring', severity: 'Medium', prompt: 'When employee submits resignation, increase DLP monitoring, restrict access to sensitive projects, audit recent file access.', mitre: ['T1074'], tags: ['hr', 'resignation'], steps: 5 },
        { name: 'Privilege Abuse Detection', severity: 'High', prompt: 'When admin accessing resources outside job scope detected, restrict access, audit activity trail, escalate to management.', mitre: ['T1078'], tags: ['abuse', 'admin'], steps: 5 },
      ]},
    ],
  },
  {
    category: 'Data Protection',
    subcategories: [
      { name: 'DLP', templates: [
        { name: 'PII Exposure Response', severity: 'High', prompt: 'When PII data exposure detected in logs or storage, redact data, restrict access, notify privacy officer, assess GDPR impact.', mitre: ['T1530'], tags: ['pii', 'gdpr'], steps: 6 },
        { name: 'Credit Card Data Leak', severity: 'Critical', prompt: 'When credit card numbers detected in unencrypted storage, encrypt immediately, audit access, notify PCI compliance team.', mitre: ['T1530'], tags: ['pci', 'payment'], steps: 7 },
        { name: 'Source Code Leak Response', severity: 'Critical', prompt: 'When proprietary source code found on public platform, request takedown, rotate exposed secrets, audit repo for more leaks.', mitre: ['T1567'], tags: ['code', 'ip'], steps: 7 },
      ]},
      { name: 'Encryption', templates: [
        { name: 'TLS Certificate Expiry', severity: 'Medium', prompt: 'When TLS certificate nearing expiration, auto-renew via ACME, verify deployment, test SSL configuration.', mitre: [], tags: ['tls', 'certificate'], steps: 4 },
        { name: 'Weak Cipher Detection', severity: 'High', prompt: 'When weak cipher suite negotiated, update server config, enforce TLS 1.3 minimum, scan fleet for similar issues.', mitre: ['T1573'], tags: ['cipher', 'tls'], steps: 5 },
      ]},
    ],
  },
  {
    category: 'Endpoint Security',
    subcategories: [
      { name: 'EDR Alerts', templates: [
        { name: 'EDR Agent Tampering', severity: 'Critical', prompt: 'When EDR agent disabled or tampered with, isolate endpoint via network, push agent reinstall, investigate root cause.', mitre: ['T1562.001'], tags: ['edr', 'tamper'], steps: 6 },
        { name: 'Process Injection Response', severity: 'High', prompt: 'When process injection detected, kill injected process, dump memory for analysis, scan for other injected processes.', mitre: ['T1055'], tags: ['injection', 'memory'], steps: 6 },
        { name: 'AMSI Bypass Detection', severity: 'High', prompt: 'When AMSI bypass technique detected, kill PowerShell session, enable constrained language mode, scan for payloads.', mitre: ['T1562.001'], tags: ['amsi', 'powershell'], steps: 5 },
      ]},
      { name: 'LOLBins', templates: [
        { name: 'Certutil Abuse Response', severity: 'High', prompt: 'When certutil used for file download, block execution, quarantine downloaded file, audit certutil usage fleet-wide.', mitre: ['T1218'], tags: ['certutil', 'lolbin'], steps: 5 },
        { name: 'Mshta.exe Execution', severity: 'High', prompt: 'When mshta.exe executing remote HTA detected, kill process, block URL, scan endpoint for payloads.', mitre: ['T1218.005'], tags: ['mshta', 'lolbin'], steps: 5 },
        { name: 'Rundll32 Proxy Execution', severity: 'Medium', prompt: 'When rundll32 used to proxy-execute malicious DLL, kill process, quarantine DLL, check parent process chain.', mitre: ['T1218.011'], tags: ['rundll32', 'lolbin'], steps: 5 },
        { name: 'BITSAdmin Abuse', severity: 'Medium', prompt: 'When BITSAdmin used for file transfer, cancel BITS job, block destination, audit all BITS transfers.', mitre: ['T1197'], tags: ['bits', 'transfer'], steps: 4 },
      ]},
    ],
  },
  {
    category: 'Supply Chain & CI/CD',
    subcategories: [
      { name: 'Supply Chain', templates: [
        { name: 'Dependency Confusion Response', severity: 'Critical', prompt: 'When dependency confusion attack detected in package registry, remove malicious package, audit builds, scan deployed artifacts.', mitre: ['T1195.002'], tags: ['npm', 'pypi'], steps: 7 },
        { name: 'Compromised Package Detection', severity: 'Critical', prompt: 'When known-compromised package detected in build, halt pipeline, rollback deployments, scan all environments.', mitre: ['T1195.002'], tags: ['package', 'rollback'], steps: 8 },
        { name: 'Maven Repository Poisoning', severity: 'Critical', prompt: 'When malicious artifact in Maven repo detected, quarantine artifact, rebuild clean versions, audit all consumers.', mitre: ['T1195.002'], tags: ['maven', 'java'], steps: 7 },
      ]},
      { name: 'CI/CD Pipeline', templates: [
        { name: 'Pipeline Secret Exposure', severity: 'Critical', prompt: 'When secrets exposed in CI/CD logs, rotate all exposed credentials, purge logs, restrict log access, audit pipeline config.', mitre: ['T1552.001'], tags: ['cicd', 'secrets'], steps: 7 },
        { name: 'Unauthorized Pipeline Modification', severity: 'High', prompt: 'When pipeline config modified without approval, revert changes, audit modifier access, enforce branch protection.', mitre: ['T1195.002'], tags: ['pipeline', 'config'], steps: 5 },
        { name: 'Container Image Tampering', severity: 'Critical', prompt: 'When container image hash mismatch detected, halt deployments, scan image layers, rebuild from trusted base.', mitre: ['T1525'], tags: ['container', 'docker'], steps: 7 },
      ]},
    ],
  },
  {
    category: 'ICS/OT & Physical',
    subcategories: [
      { name: 'SCADA/ICS', templates: [
        { name: 'PLC Firmware Modification', severity: 'Critical', prompt: 'When unauthorized PLC firmware change detected, halt process safely, revert firmware, isolate OT network segment.', mitre: ['T0839'], tags: ['plc', 'firmware'], steps: 8 },
        { name: 'HMI Unauthorized Access', severity: 'High', prompt: 'When unauthorized HMI access detected, lock terminal, review CCTV footage, audit process changes made.', mitre: ['T0823'], tags: ['hmi', 'scada'], steps: 6 },
        { name: 'Modbus Anomaly Response', severity: 'High', prompt: 'When anomalous Modbus traffic detected, isolate affected segment, verify PLC state, check for unauthorized commands.', mitre: ['T0831'], tags: ['modbus', 'protocol'], steps: 6 },
      ]},
      { name: 'Physical Security', templates: [
        { name: 'Badge Cloning Detection', severity: 'High', prompt: 'When badge cloning detected via duplicate scan patterns, disable cloned badge, alert physical security, review CCTV.', mitre: ['T1200'], tags: ['badge', 'physical'], steps: 5 },
        { name: 'Tailgating Alert Response', severity: 'Medium', prompt: 'When tailgating detected at secure area, alert security guard, review camera footage, verify occupancy count.', mitre: ['T1200'], tags: ['tailgate', 'access'], steps: 4 },
        { name: 'Server Room Thermal Alert', severity: 'High', prompt: 'When server room temperature exceeds threshold, check HVAC, verify no fire hazard, prepare controlled shutdown plan.', mitre: [], tags: ['thermal', 'datacenter'], steps: 5 },
      ]},
    ],
  },
  {
    category: 'AI/ML Security',
    subcategories: [
      { name: 'Model Attacks', templates: [
        { name: 'Model Poisoning Response', severity: 'Critical', prompt: 'When training data poisoning detected, halt training pipeline, quarantine poisoned data, retrain from clean checkpoint.', mitre: ['T1565'], tags: ['ml', 'poisoning'], steps: 7 },
        { name: 'Adversarial Input Detection', severity: 'High', prompt: 'When adversarial input detected targeting ML model, block input source, log attack pattern, update input validation.', mitre: ['T1565'], tags: ['adversarial', 'evasion'], steps: 5 },
        { name: 'Model Extraction Response', severity: 'High', prompt: 'When model extraction attempt detected via query patterns, rate limit API, add watermark checks, block attacker.', mitre: ['T1530'], tags: ['extraction', 'api'], steps: 6 },
      ]},
      { name: 'LLM Security', templates: [
        { name: 'Prompt Injection Block', severity: 'High', prompt: 'When prompt injection detected in LLM input, block request, log attack payload, update guardrail rules.', mitre: ['T1059'], tags: ['llm', 'prompt'], steps: 5 },
        { name: 'PII Leakage from LLM', severity: 'Critical', prompt: 'When LLM outputs PII from training data, block response, add PII filter, audit training data, notify privacy team.', mitre: ['T1530'], tags: ['llm', 'pii'], steps: 6 },
        { name: 'LLM Jailbreak Response', severity: 'High', prompt: 'When LLM jailbreak technique detected, block conversation, update system prompt defenses, log bypass technique.', mitre: ['T1059'], tags: ['llm', 'jailbreak'], steps: 5 },
      ]},
    ],
  },
  {
    category: 'Compliance & Governance',
    subcategories: [
      { name: 'Regulatory', templates: [
        { name: 'GDPR Breach Notification', severity: 'Critical', prompt: 'When personal data breach confirmed, assess scope, notify DPA within 72 hours, prepare data subject notifications.', mitre: [], tags: ['gdpr', 'breach'], steps: 8 },
        { name: 'PCI DSS Violation Response', severity: 'Critical', prompt: 'When PCI compliance violation detected, isolate CDE, engage QSA, remediate finding, update scan schedule.', mitre: [], tags: ['pci', 'compliance'], steps: 7 },
        { name: 'HIPAA Breach Protocol', severity: 'Critical', prompt: 'When PHI exposure detected, secure data, notify privacy officer, assess breach scope, prepare HHS notification.', mitre: [], tags: ['hipaa', 'phi'], steps: 8 },
        { name: 'SOX Audit Finding Response', severity: 'High', prompt: 'When SOX control failure detected, document finding, implement compensating control, notify audit committee.', mitre: [], tags: ['sox', 'audit'], steps: 6 },
      ]},
      { name: 'Policy Enforcement', templates: [
        { name: 'Shadow IT Discovery', severity: 'Medium', prompt: 'When unauthorized SaaS application detected, block access, assess data exposure, offer sanctioned alternative.', mitre: ['T1567'], tags: ['shadow', 'saas'], steps: 5 },
        { name: 'Encryption Policy Violation', severity: 'High', prompt: 'When unencrypted data at rest detected, encrypt immediately, audit access logs, update encryption policy enforcement.', mitre: ['T1530'], tags: ['encryption', 'policy'], steps: 5 },
        { name: 'Access Review Overdue', severity: 'Medium', prompt: 'When access review deadline missed, notify reviewer, restrict flagged access, escalate to manager after 48h.', mitre: [], tags: ['access', 'review'], steps: 4 },
      ]},
    ],
  },
  {
    category: 'Financial Security',
    subcategories: [
      { name: 'Fraud Detection', templates: [
        { name: 'Wire Transfer Fraud Block', severity: 'Critical', prompt: 'When fraudulent wire transfer detected, freeze transaction, verify with sender via callback, alert fraud team.', mitre: [], tags: ['wire', 'fraud'], steps: 6 },
        { name: 'Account Takeover Response', severity: 'Critical', prompt: 'When customer account takeover detected, lock account, reverse unauthorized transactions, notify customer securely.', mitre: ['T1078'], tags: ['ato', 'customer'], steps: 7 },
        { name: 'Synthetic Identity Detection', severity: 'High', prompt: 'When synthetic identity detected in new account, flag account, block transactions, report to fraud consortium.', mitre: [], tags: ['synthetic', 'identity'], steps: 5 },
        { name: 'Card Skimming Alert', severity: 'High', prompt: 'When POS terminal tampering detected, take terminal offline, notify acquiring bank, alert affected cardholders.', mitre: ['T1200'], tags: ['pos', 'skimming'], steps: 6 },
      ]},
      { name: 'Transaction Monitoring', templates: [
        { name: 'Suspicious Transaction Pattern', severity: 'High', prompt: 'When structuring/smurfing pattern detected, file SAR, freeze accounts, alert compliance and legal teams.', mitre: [], tags: ['aml', 'structuring'], steps: 6 },
        { name: 'SWIFT Anomaly Response', severity: 'Critical', prompt: 'When anomalous SWIFT message detected, halt message, verify with originator, check for compromise indicators.', mitre: [], tags: ['swift', 'banking'], steps: 7 },
        { name: 'Cryptocurrency Mixer Detection', severity: 'High', prompt: 'When funds traced to crypto mixer, flag transaction, file CTR, engage blockchain analytics, escalate to FinCEN.', mitre: [], tags: ['crypto', 'mixer'], steps: 6 },
      ]},
    ],
  },
];

const AUTHORS = [
  'SOC Automation Engine', 'Sarah Chen', 'Marcus Webb', 'AI Agent Alpha', 'Detection Engineering',
  'James Park', 'Cloud Security Team', 'IR Playbook Bot', 'Threat Intel Unit', 'OT Security Team',
  'Compliance Engine', 'DLP Auto-Responder', 'ML Security Lab', 'Financial Crime Unit', 'Red Team Automation',
];

const TIME_AGO = [
  '2 min ago', '5 min ago', '12 min ago', '28 min ago', '1 hr ago', '2 hrs ago', '4 hrs ago',
  '6 hrs ago', '12 hrs ago', '1 day ago', '2 days ago', '3 days ago', '5 days ago', '1 week ago',
  '2 weeks ago', '1 month ago', '3 months ago', 'Never',
];

const STATUSES: Playbook['status'][] = ['Active', 'Active', 'Active', 'Active', 'Active', 'Active', 'Draft', 'Testing', 'Deprecated'];

function seededRandom(seed: number) {
  let s = seed;
  return () => { s = (s * 16807 + 0) % 2147483647; return s / 2147483647; };
}

function generateVariantName(baseName: string, variantIndex: number): string {
  const prefixes = ['Enhanced', 'Automated', 'Multi-Stage', 'Cross-Platform', 'Zero-Trust', 'AI-Driven', 'Adaptive', 'Real-Time'];
  const suffixes = ['v2', 'v3', 'with Enrichment', 'with Rollback', 'Multi-Tenant', 'HA Mode', 'with Forensics', 'Lite'];
  const envs = ['On-Prem', 'Cloud', 'Hybrid', 'Air-Gapped', 'Multi-Cloud', 'Containerized', 'Edge'];
  const rand = seededRandom(variantIndex * 7919 + baseName.length);

  if (variantIndex === 0) return baseName;
  const choice = Math.floor(rand() * 3);
  if (choice === 0) return `${prefixes[Math.floor(rand() * prefixes.length)]} ${baseName}`;
  if (choice === 1) return `${baseName} (${suffixes[Math.floor(rand() * suffixes.length)]})`;
  return `${baseName} - ${envs[Math.floor(rand() * envs.length)]}`;
}

let _cache: Playbook[] | null = null;

export function getAllPlaybooks(): Playbook[] {
  if (_cache) return _cache;

  const playbooks: Playbook[] = [];
  let id = 1;

  for (const cat of CATEGORIES) {
    for (const sub of cat.subcategories) {
      for (const tmpl of sub.templates) {
        const variantsNeeded = Math.ceil(1100 / CATEGORIES.reduce((a, c) => a + c.subcategories.reduce((b, s) => b + s.templates.length, 0), 0));
        const numVariants = Math.max(4, Math.min(8, variantsNeeded));

        for (let v = 0; v < numVariants; v++) {
          const rand = seededRandom(id * 31 + v * 97);
          playbooks.push({
            id: id++,
            name: generateVariantName(tmpl.name, v),
            category: cat.category,
            subcategory: sub.name,
            severity: v === 0 ? tmpl.severity : (['Critical', 'High', 'Medium', 'Low'] as const)[Math.floor(rand() * 3)],
            prompt: tmpl.prompt,
            mitre: tmpl.mitre,
            executions: Math.floor(rand() * 15000) + 10,
            avgTime: `${(rand() * 8 + 0.5).toFixed(1)}s`,
            successRate: parseFloat((90 + rand() * 10).toFixed(1)),
            lastTriggered: TIME_AGO[Math.floor(rand() * TIME_AGO.length)],
            steps: tmpl.steps + Math.floor(rand() * 3) - 1,
            author: AUTHORS[Math.floor(rand() * AUTHORS.length)],
            tags: [...tmpl.tags, ...(v > 0 ? ['variant'] : [])],
            status: STATUSES[Math.floor(rand() * STATUSES.length)],
          });
        }
      }
    }
  }

  _cache = playbooks;
  return playbooks;
}

export function getCategories(): string[] {
  return CATEGORIES.map(c => c.category);
}

export function getSubcategories(category: string): string[] {
  const cat = CATEGORIES.find(c => c.category === category);
  return cat ? cat.subcategories.map(s => s.name) : [];
}

export function getPlaybookStats() {
  const all = getAllPlaybooks();
  const active = all.filter(p => p.status === 'Active').length;
  const totalExec = all.reduce((a, p) => a + p.executions, 0);
  const avgSuccess = all.reduce((a, p) => a + p.successRate, 0) / all.length;
  return { total: all.length, active, totalExec, avgSuccess: avgSuccess.toFixed(1) };
}
