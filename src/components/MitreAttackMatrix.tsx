import { useState, useEffect } from "react";
import { Shield, Target, AlertTriangle, CheckCircle2, XCircle, TrendingUp, ChevronRight, Eye, Zap, Activity, Filter, Grid3x3 as Grid3X3, X } from "lucide-react";

type Status = "covered" | "partial" | "gap" | "detected";
interface Technique {
  id: string; name: string; status: Status; rules: number;
  risk: number; description: string;
  activeRules: string[]; recentDetections: number; recommendedRules: string[];
}
interface Tactic { name: string; short: string; techniques: Technique[]; }

const TACTICS: Tactic[] = [
  { name: "Reconnaissance", short: "Recon", techniques: [
    { id: "T1595", name: "Active Scanning", status: "covered", rules: 8, risk: 6, description: "Adversaries scan victim IP blocks to gather information for targeting.", activeRules: ["Port Scan Detector", "Nmap Sig Match", "Sweep Alert"], recentDetections: 14, recommendedRules: [] },
    { id: "T1592", name: "Gather Victim Host Info", status: "partial", rules: 3, risk: 5, description: "Adversaries gather information about victim hosts for targeting.", activeRules: ["Host Enum Alert"], recentDetections: 2, recommendedRules: ["OS Fingerprint Rule"] },
    { id: "T1589", name: "Gather Victim Identity", status: "gap", rules: 0, risk: 8, description: "Adversaries gather identity information for use during targeting.", activeRules: [], recentDetections: 0, recommendedRules: ["Identity Harvest Monitor", "OSINT Scrape Detect"] },
    { id: "T1590", name: "Gather Network Info", status: "detected", rules: 5, risk: 7, description: "Adversaries gather information about victim networks.", activeRules: ["DNS Recon Alert", "Whois Monitor"], recentDetections: 7, recommendedRules: ["BGP Leak Detect"] },
    { id: "T1591", name: "Gather Org Info", status: "covered", rules: 4, risk: 4, description: "Adversaries gather organization information for targeting.", activeRules: ["LinkedIn Scrape", "Job Post Monitor"], recentDetections: 3, recommendedRules: [] },
    { id: "T1598", name: "Phishing for Info", status: "partial", rules: 2, risk: 9, description: "Adversaries send phishing messages to elicit sensitive information.", activeRules: ["Spearphish Alert"], recentDetections: 1, recommendedRules: ["Reply-To Mismatch", "Credential Harvest Page"] },
  ]},
  { name: "Resource Development", short: "ResDev", techniques: [
    { id: "T1583", name: "Acquire Infrastructure", status: "gap", rules: 0, risk: 7, description: "Adversaries acquire infrastructure for operations.", activeRules: [], recentDetections: 0, recommendedRules: ["New Domain Monitor", "VPS Provision Alert"] },
    { id: "T1586", name: "Compromise Accounts", status: "partial", rules: 2, risk: 8, description: "Adversaries compromise accounts for use in operations.", activeRules: ["Cred Stuff Alert"], recentDetections: 1, recommendedRules: ["Dark Web Monitor"] },
    { id: "T1587", name: "Develop Capabilities", status: "covered", rules: 5, risk: 6, description: "Adversaries develop custom capabilities for targeting.", activeRules: ["Malware Sandbox", "Exploit Kit Sig"], recentDetections: 4, recommendedRules: [] },
    { id: "T1585", name: "Establish Accounts", status: "detected", rules: 3, risk: 5, description: "Adversaries create accounts for use in operations.", activeRules: ["Fake Account Detect"], recentDetections: 9, recommendedRules: ["Social Eng Monitor"] },
    { id: "T1588", name: "Obtain Capabilities", status: "gap", rules: 0, risk: 7, description: "Adversaries obtain capabilities rather than developing them.", activeRules: [], recentDetections: 0, recommendedRules: ["Tool Download Alert", "Exploit Market Watch"] },
  ]},
  { name: "Initial Access", short: "InitAcc", techniques: [
    { id: "T1566", name: "Phishing", status: "covered", rules: 12, risk: 9, description: "Adversaries send phishing messages to gain access to victim systems.", activeRules: ["Email Gateway Rule", "Attachment Sandbox", "URL Detonation", "SPF/DKIM Fail"], recentDetections: 23, recommendedRules: [] },
    { id: "T1190", name: "Exploit Public-Facing App", status: "detected", rules: 7, risk: 10, description: "Adversaries exploit vulnerabilities in internet-facing applications.", activeRules: ["WAF Rule Set", "CVE-2024 Sig", "SQLi Detect"], recentDetections: 18, recommendedRules: ["Zero-Day Heuristic"] },
    { id: "T1133", name: "External Remote Services", status: "partial", rules: 4, risk: 8, description: "Adversaries leverage external-facing remote services to access networks.", activeRules: ["VPN Anomaly", "RDP Brute"], recentDetections: 5, recommendedRules: ["Geo-Impossible Travel"] },
    { id: "T1200", name: "Hardware Additions", status: "gap", rules: 0, risk: 6, description: "Adversaries introduce hardware devices to gain access.", activeRules: [], recentDetections: 0, recommendedRules: ["USB Device Policy", "Network Tap Detect"] },
    { id: "T1078", name: "Valid Accounts", status: "covered", rules: 9, risk: 9, description: "Adversaries obtain and abuse credentials of existing accounts.", activeRules: ["Impossible Travel", "Cred Anomaly", "MFA Bypass Detect"], recentDetections: 11, recommendedRules: [] },
    { id: "T1199", name: "Trusted Relationship", status: "partial", rules: 2, risk: 7, description: "Adversaries abuse trusted third-party relationships.", activeRules: ["Vendor Access Alert"], recentDetections: 1, recommendedRules: ["Supply Chain Monitor"] },
  ]},
  { name: "Execution", short: "Exec", techniques: [
    { id: "T1059", name: "Command & Scripting", status: "covered", rules: 11, risk: 8, description: "Adversaries abuse command and script interpreters to execute commands.", activeRules: ["PowerShell Monitor", "Bash Alert", "Python Exec", "WMI Detect"], recentDetections: 31, recommendedRules: [] },
    { id: "T1203", name: "Exploit for Client Exec", status: "partial", rules: 3, risk: 9, description: "Adversaries exploit client application vulnerabilities for execution.", activeRules: ["Office Macro Block"], recentDetections: 4, recommendedRules: ["Browser Exploit Detect"] },
    { id: "T1047", name: "WMI", status: "detected", rules: 6, risk: 7, description: "Adversaries abuse WMI to execute malicious commands.", activeRules: ["WMI Process Create", "WMI Lateral"], recentDetections: 12, recommendedRules: [] },
    { id: "T1053", name: "Scheduled Task/Job", status: "covered", rules: 5, risk: 6, description: "Adversaries abuse task scheduling to execute malicious code.", activeRules: ["Schtask Monitor", "Cron Anomaly"], recentDetections: 8, recommendedRules: [] },
    { id: "T1204", name: "User Execution", status: "partial", rules: 2, risk: 8, description: "Adversaries rely on users to execute malicious content.", activeRules: ["Click-Jacking Alert"], recentDetections: 3, recommendedRules: ["Social Eng Sim"] },
  ]},
  { name: "Persistence", short: "Persist", techniques: [
    { id: "T1547", name: "Boot Autostart Exec", status: "covered", rules: 7, risk: 8, description: "Adversaries configure system settings to execute programs on boot.", activeRules: ["Registry Run Key", "Startup Folder", "Service Install"], recentDetections: 6, recommendedRules: [] },
    { id: "T1136", name: "Create Account", status: "detected", rules: 4, risk: 7, description: "Adversaries create accounts to maintain access.", activeRules: ["New Admin Account", "Shadow Account"], recentDetections: 5, recommendedRules: [] },
    { id: "T1543", name: "Create/Modify System Process", status: "partial", rules: 3, risk: 8, description: "Adversaries create or modify system processes for persistence.", activeRules: ["Service Modify Alert"], recentDetections: 2, recommendedRules: ["Systemd Unit Monitor"] },
    { id: "T1546", name: "Event Triggered Execution", status: "gap", rules: 0, risk: 7, description: "Adversaries establish persistence via event-triggered execution.", activeRules: [], recentDetections: 0, recommendedRules: ["WMI Sub Monitor", "AppInit DLL Watch"] },
    { id: "T1098", name: "Account Manipulation", status: "covered", rules: 6, risk: 9, description: "Adversaries manipulate accounts to maintain access.", activeRules: ["Priv Escalation", "Group Add Alert", "MFA Reset"], recentDetections: 4, recommendedRules: [] },
  ]},
  { name: "Privilege Escalation", short: "PrivEsc", techniques: [
    { id: "T1548", name: "Abuse Elevation Control", status: "covered", rules: 6, risk: 9, description: "Adversaries bypass elevation controls to gain higher privileges.", activeRules: ["UAC Bypass", "Sudo Abuse", "SUID Alert"], recentDetections: 7, recommendedRules: [] },
    { id: "T1134", name: "Access Token Manipulation", status: "partial", rules: 2, risk: 8, description: "Adversaries manipulate access tokens to operate under different contexts.", activeRules: ["Token Impersonation"], recentDetections: 1, recommendedRules: ["Runas Alert"] },
    { id: "T1068", name: "Exploitation for Priv Esc", status: "gap", rules: 0, risk: 10, description: "Adversaries exploit software vulnerabilities to elevate privileges.", activeRules: [], recentDetections: 0, recommendedRules: ["Kernel Exploit Sig", "CVE-Priv-Esc Monitor"] },
    { id: "T1484", name: "Domain Policy Modification", status: "detected", rules: 4, risk: 8, description: "Adversaries modify domain policies for privilege escalation.", activeRules: ["GPO Modify Alert", "Trust Modify"], recentDetections: 3, recommendedRules: [] },
    { id: "T1055", name: "Process Injection", status: "covered", rules: 8, risk: 9, description: "Adversaries inject code into processes to evade defenses and escalate.", activeRules: ["DLL Injection", "Process Hollow", "Thread Hijack"], recentDetections: 15, recommendedRules: [] },
  ]},
  { name: "Defense Evasion", short: "DefEvas", techniques: [
    { id: "T1070", name: "Indicator Removal", status: "covered", rules: 5, risk: 8, description: "Adversaries delete or modify artifacts to remove evidence.", activeRules: ["Log Tamper Alert", "Timestomp Detect"], recentDetections: 9, recommendedRules: [] },
    { id: "T1036", name: "Masquerading", status: "detected", rules: 6, risk: 7, description: "Adversaries manipulate features to make artifacts appear legitimate.", activeRules: ["Name Mismatch", "Sig Spoof Alert"], recentDetections: 11, recommendedRules: [] },
    { id: "T1027", name: "Obfuscated Files", status: "partial", rules: 3, risk: 8, description: "Adversaries obfuscate files or information to evade detection.", activeRules: ["Entropy Analysis"], recentDetections: 4, recommendedRules: ["Packer Detect", "Base64 Chain"] },
    { id: "T1562", name: "Impair Defenses", status: "covered", rules: 9, risk: 10, description: "Adversaries disable or modify security tools to avoid detection.", activeRules: ["EDR Tamper", "FW Disable Alert", "AV Kill Detect"], recentDetections: 6, recommendedRules: [] },
    { id: "T1218", name: "System Binary Proxy", status: "partial", rules: 2, risk: 7, description: "Adversaries abuse signed binaries to proxy execution.", activeRules: ["LOLBAS Alert"], recentDetections: 3, recommendedRules: ["Rundll32 Monitor", "Mshta Detect"] },
    { id: "T1112", name: "Modify Registry", status: "covered", rules: 4, risk: 6, description: "Adversaries modify the registry to hide configuration or persist.", activeRules: ["Reg Key Monitor", "Hidden Key Alert"], recentDetections: 5, recommendedRules: [] },
  ]},
  { name: "Credential Access", short: "CredAcc", techniques: [
    { id: "T1110", name: "Brute Force", status: "covered", rules: 7, risk: 7, description: "Adversaries use brute force techniques to gain credentials.", activeRules: ["Lockout Alert", "Spray Detect", "Rate Limit"], recentDetections: 19, recommendedRules: [] },
    { id: "T1003", name: "OS Credential Dumping", status: "detected", rules: 5, risk: 10, description: "Adversaries dump credentials from OS to obtain account logins.", activeRules: ["LSASS Access", "SAM Dump Alert"], recentDetections: 8, recommendedRules: ["Mimikatz Sig"] },
    { id: "T1558", name: "Steal Kerberos Tickets", status: "partial", rules: 3, risk: 9, description: "Adversaries steal Kerberos tickets for lateral movement.", activeRules: ["Kerberoast Alert"], recentDetections: 2, recommendedRules: ["Golden Ticket Detect"] },
    { id: "T1552", name: "Unsecured Credentials", status: "gap", rules: 0, risk: 8, description: "Adversaries search for unsecured credentials on compromised systems.", activeRules: [], recentDetections: 0, recommendedRules: ["Secrets Scanner", "Cloud Key Audit"] },
    { id: "T1539", name: "Steal Web Session Cookie", status: "partial", rules: 2, risk: 7, description: "Adversaries steal web session cookies for access.", activeRules: ["Cookie Exfil Alert"], recentDetections: 1, recommendedRules: ["Session Hijack Rule"] },
  ]},
  { name: "Discovery", short: "Disc", techniques: [
    { id: "T1087", name: "Account Discovery", status: "covered", rules: 4, risk: 5, description: "Adversaries enumerate accounts on a system or domain.", activeRules: ["Net User Enum", "AD Query Alert"], recentDetections: 7, recommendedRules: [] },
    { id: "T1046", name: "Network Service Scan", status: "detected", rules: 5, risk: 6, description: "Adversaries scan for services running on remote hosts.", activeRules: ["Internal Scan Alert", "Port Sweep"], recentDetections: 13, recommendedRules: [] },
    { id: "T1057", name: "Process Discovery", status: "partial", rules: 2, risk: 4, description: "Adversaries enumerate running processes for information.", activeRules: ["Tasklist Enum"], recentDetections: 3, recommendedRules: ["Process List Baseline"] },
    { id: "T1082", name: "System Info Discovery", status: "covered", rules: 3, risk: 4, description: "Adversaries gather detailed system information.", activeRules: ["Sysinfo Enum Alert"], recentDetections: 5, recommendedRules: [] },
    { id: "T1518", name: "Software Discovery", status: "gap", rules: 0, risk: 5, description: "Adversaries enumerate software installed on endpoints.", activeRules: [], recentDetections: 0, recommendedRules: ["Installed SW Enum Alert"] },
  ]},
  { name: "Lateral Movement", short: "LatMov", techniques: [
    { id: "T1021", name: "Remote Services", status: "covered", rules: 8, risk: 8, description: "Adversaries use remote services to move laterally within a network.", activeRules: ["RDP Lateral", "SSH Anomaly", "WinRM Alert"], recentDetections: 14, recommendedRules: [] },
    { id: "T1570", name: "Lateral Tool Transfer", status: "partial", rules: 3, risk: 7, description: "Adversaries transfer tools between systems within a network.", activeRules: ["SMB Copy Alert"], recentDetections: 4, recommendedRules: ["PsExec Detect"] },
    { id: "T1563", name: "Remote Service Hijacking", status: "gap", rules: 0, risk: 8, description: "Adversaries hijack remote sessions for lateral movement.", activeRules: [], recentDetections: 0, recommendedRules: ["RDP Hijack Rule", "Session Steal Alert"] },
    { id: "T1550", name: "Use Alternate Auth", status: "detected", rules: 4, risk: 9, description: "Adversaries use alternate authentication material for access.", activeRules: ["Pass-the-Hash", "PtT Detect"], recentDetections: 6, recommendedRules: [] },
    { id: "T1080", name: "Taint Shared Content", status: "partial", rules: 2, risk: 6, description: "Adversaries taint shared content to move laterally.", activeRules: ["Share Modify Alert"], recentDetections: 1, recommendedRules: ["Content Integrity Check"] },
  ]},
  { name: "Collection", short: "Collect", techniques: [
    { id: "T1560", name: "Archive Collected Data", status: "covered", rules: 4, risk: 6, description: "Adversaries compress and encrypt collected data prior to exfil.", activeRules: ["7zip CLI Alert", "RAR Create Monitor"], recentDetections: 5, recommendedRules: [] },
    { id: "T1123", name: "Audio Capture", status: "gap", rules: 0, risk: 7, description: "Adversaries capture audio to collect information.", activeRules: [], recentDetections: 0, recommendedRules: ["Mic Access Alert", "Audio API Monitor"] },
    { id: "T1119", name: "Automated Collection", status: "partial", rules: 2, risk: 7, description: "Adversaries use automated techniques to collect data.", activeRules: ["Bulk File Access"], recentDetections: 2, recommendedRules: ["Data Staging Alert"] },
    { id: "T1005", name: "Data from Local System", status: "covered", rules: 5, risk: 6, description: "Adversaries collect data from the local system.", activeRules: ["Sensitive File Access", "Bulk Read Alert"], recentDetections: 8, recommendedRules: [] },
    { id: "T1114", name: "Email Collection", status: "detected", rules: 4, risk: 8, description: "Adversaries collect email data from user mailboxes.", activeRules: ["Mailbox Export Alert", "EWS Abuse"], recentDetections: 6, recommendedRules: [] },
  ]},
  { name: "Command & Control", short: "C2", techniques: [
    { id: "T1071", name: "Application Layer Proto", status: "covered", rules: 7, risk: 8, description: "Adversaries communicate using application layer protocols.", activeRules: ["DNS Tunnel Detect", "HTTPS Beacon", "Slack C2 Alert"], recentDetections: 16, recommendedRules: [] },
    { id: "T1573", name: "Encrypted Channel", status: "partial", rules: 3, risk: 7, description: "Adversaries encrypt C2 communications to avoid detection.", activeRules: ["JA3 Anomaly"], recentDetections: 5, recommendedRules: ["TLS Cert Anomaly", "Cipher Mismatch"] },
    { id: "T1008", name: "Fallback Channels", status: "gap", rules: 0, risk: 7, description: "Adversaries use fallback communication channels.", activeRules: [], recentDetections: 0, recommendedRules: ["Multi-Channel Detect", "DNS Failover Alert"] },
    { id: "T1105", name: "Ingress Tool Transfer", status: "detected", rules: 5, risk: 8, description: "Adversaries transfer tools from external systems.", activeRules: ["Download Alert", "Certutil Abuse"], recentDetections: 9, recommendedRules: [] },
    { id: "T1572", name: "Protocol Tunneling", status: "covered", rules: 6, risk: 8, description: "Adversaries tunnel network communications through another protocol.", activeRules: ["SSH Tunnel Alert", "ICMP Tunnel", "DNS over HTTPS"], recentDetections: 7, recommendedRules: [] },
    { id: "T1090", name: "Proxy", status: "partial", rules: 2, risk: 6, description: "Adversaries use proxy infrastructure to manage C2.", activeRules: ["Tor Exit Node"], recentDetections: 3, recommendedRules: ["Multi-hop Detect"] },
  ]},
  { name: "Exfiltration", short: "Exfil", techniques: [
    { id: "T1041", name: "Exfil Over C2 Channel", status: "covered", rules: 5, risk: 9, description: "Adversaries exfiltrate data over C2 channels.", activeRules: ["Large Upload Alert", "Beacon Data Vol"], recentDetections: 4, recommendedRules: [] },
    { id: "T1048", name: "Exfil Over Alt Protocol", status: "partial", rules: 3, risk: 8, description: "Adversaries exfiltrate data over different protocols.", activeRules: ["DNS Exfil Detect"], recentDetections: 2, recommendedRules: ["ICMP Exfil Rule", "FTP Alert"] },
    { id: "T1567", name: "Exfil Over Web Service", status: "detected", rules: 4, risk: 8, description: "Adversaries exfiltrate data to cloud storage services.", activeRules: ["Cloud Upload Alert", "Mega.nz Detect"], recentDetections: 7, recommendedRules: [] },
    { id: "T1029", name: "Scheduled Transfer", status: "gap", rules: 0, risk: 7, description: "Adversaries schedule data exfiltration at certain times.", activeRules: [], recentDetections: 0, recommendedRules: ["Off-Hours Transfer Alert", "Periodic Exfil Detect"] },
    { id: "T1537", name: "Transfer to Cloud Account", status: "partial", rules: 2, risk: 8, description: "Adversaries exfiltrate data to another cloud account.", activeRules: ["Cross-Account Copy"], recentDetections: 1, recommendedRules: ["S3 Exfil Alert"] },
  ]},
  { name: "Impact", short: "Impact", techniques: [
    { id: "T1485", name: "Data Destruction", status: "covered", rules: 6, risk: 10, description: "Adversaries destroy data on specific systems or networks.", activeRules: ["Wiper Detect", "Mass Delete Alert", "MBR Overwrite"], recentDetections: 2, recommendedRules: [] },
    { id: "T1486", name: "Data Encrypted for Impact", status: "detected", rules: 8, risk: 10, description: "Adversaries encrypt data on target systems (ransomware).", activeRules: ["Ransomware Sig", "Mass Encrypt Alert", "Ransom Note Detect"], recentDetections: 3, recommendedRules: [] },
    { id: "T1565", name: "Data Manipulation", status: "partial", rules: 2, risk: 9, description: "Adversaries modify data to influence business processes.", activeRules: ["DB Integrity Alert"], recentDetections: 1, recommendedRules: ["Financial Data Monitor"] },
    { id: "T1499", name: "Endpoint DoS", status: "covered", rules: 5, risk: 7, description: "Adversaries perform denial of service against endpoint resources.", activeRules: ["Resource Exhaust", "Fork Bomb Alert"], recentDetections: 4, recommendedRules: [] },
    { id: "T1491", name: "Defacement", status: "gap", rules: 0, risk: 6, description: "Adversaries modify visual content for intimidation.", activeRules: [], recentDetections: 0, recommendedRules: ["Web Integrity Check", "Content Hash Monitor"] },
    { id: "T1529", name: "System Shutdown/Reboot", status: "partial", rules: 2, risk: 7, description: "Adversaries shut down or reboot systems to disrupt operations.", activeRules: ["Unplanned Reboot Alert"], recentDetections: 2, recommendedRules: ["Shutdown Command Monitor"] },
  ]},
];

const SPARKLINE = [52, 55, 59, 63, 68, 73];

const statusColor = (s: Status) =>
  s === "covered" ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-400"
  : s === "partial" ? "bg-amber-500/20 border-amber-500/40 text-amber-400"
  : s === "gap" ? "bg-red-500/20 border-red-500/40 text-red-400"
  : "bg-blue-500/20 border-blue-500/40 text-blue-400";

const statusIcon = (s: Status) =>
  s === "covered" ? <CheckCircle2 size={12} /> : s === "partial" ? <AlertTriangle size={12} /> : s === "gap" ? <XCircle size={12} /> : <Zap size={12} />;

export default function MitreAttackMatrix() {
  const [filter, setFilter] = useState<Status | "all">("all");
  const [selected, setSelected] = useState<Technique | null>(null);
  const [panelTactic, setPanelTactic] = useState("");
  const [coveragePct, setCoveragePct] = useState(0);
  const [tactics, setTactics] = useState(() => JSON.parse(JSON.stringify(TACTICS)) as Tactic[]);
  const [showAgentLog, setShowAgentLog] = useState(false);
  const [agentLog, setAgentLog] = useState<{time: string; msg: string; type: 'deploy' | 'detect' | 'resolve'}[]>([]);
  const [rippleCol, setRippleCol] = useState(-1);

  const allTechniques = tactics.flatMap((t) => t.techniques);
  const totalCov = allTechniques.filter((t) => t.status === "covered" || t.status === "detected").length;
  const targetPct = Math.round((totalCov / allTechniques.length) * 100);

  useEffect(() => {
    let frame: number; let start: number | null = null;
    const duration = 1400;
    const animate = (ts: number) => {
      if (!start) start = ts;
      const progress = Math.min((ts - start) / duration, 1);
      setCoveragePct(Math.round(progress * targetPct));
      if (progress < 1) frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [targetPct]);

  useEffect(() => {
    const interval = setInterval(() => {
      setRippleCol((prev) => (prev >= tactics.length ? -1 : prev + 1));
    }, 600);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const iv = setInterval(() => {
      const now = new Date().toLocaleTimeString();
      setTactics(prev => {
        const next = JSON.parse(JSON.stringify(prev)) as Tactic[];
        const allTechs = next.flatMap(t => t.techniques);
        const roll = Math.random();
        if (roll < 0.4) {
          const gaps = allTechs.filter(t => t.status === 'gap');
          if (gaps.length > 0) {
            const target = gaps[Math.floor(Math.random() * gaps.length)];
            target.status = 'partial';
            target.rules = 1;
            const ruleName = target.recommendedRules[0] || 'Auto-Generated Rule';
            target.activeRules.push(ruleName);
            setAgentLog(p => [{time: now, msg: `Agent deployed "${ruleName}" for ${target.id} - ${target.name}`, type: 'deploy'}, ...p].slice(0, 15));
          }
        } else if (roll < 0.7) {
          const partials = allTechs.filter(t => t.status === 'partial');
          if (partials.length > 0) {
            const target = partials[Math.floor(Math.random() * partials.length)];
            target.status = 'covered';
            target.rules += 2;
            setAgentLog(p => [{time: now, msg: `Agent achieved full coverage for ${target.id} - ${target.name} (${target.rules} rules)`, type: 'deploy'}, ...p].slice(0, 15));
          }
        } else if (roll < 0.85) {
          const covered = allTechs.filter(t => t.status === 'covered' && t.rules >= 3);
          if (covered.length > 0) {
            const target = covered[Math.floor(Math.random() * covered.length)];
            target.status = 'detected';
            target.recentDetections += Math.floor(Math.random() * 5) + 1;
            setAgentLog(p => [{time: now, msg: `Live detection on ${target.id} - ${target.name} (${target.recentDetections} hits)`, type: 'detect'}, ...p].slice(0, 15));
          }
        } else {
          const detected = allTechs.filter(t => t.status === 'detected');
          if (detected.length > 0) {
            const target = detected[Math.floor(Math.random() * detected.length)];
            target.status = 'covered';
            setAgentLog(p => [{time: now, msg: `Agent resolved detection for ${target.id} - ${target.name}`, type: 'resolve'}, ...p].slice(0, 15));
          }
        }
        return next;
      });
    }, 5000);
    return () => clearInterval(iv);
  }, []);

  const filtered = (techniques: Technique[]) =>
    filter === "all" ? techniques : techniques.filter((t) => t.status === filter);

  const gaps = allTechniques.filter((t) => t.status === "gap").sort((a, b) => b.risk - a.risk).slice(0, 6);
  const circumference = 2 * Math.PI * 54;
  const strokeOffset = circumference - (circumference * coveragePct) / 100;

  const miniBar = (tactic: Tactic) => {
    const total = tactic.techniques.length;
    const c = tactic.techniques.filter((t) => t.status === "covered" || t.status === "detected").length;
    return Math.round((c / total) * 100);
  };

  const sparkPoints = SPARKLINE.map((v, i) => `${i * 28},${40 - (v / 100) * 36}`).join(" ");

  return (
    <div className="min-h-screen bg-[#0A1628] text-gray-200 p-4 font-sans">
      {/* Top Banner */}
      <div className="bg-[#0F1D32] border border-[#1E3A5F] rounded-xl p-5 mb-5">
        <div className="flex items-center gap-6 flex-wrap">
          {/* Progress Ring */}
          <div className="relative flex-shrink-0">
            <svg width="120" height="120" viewBox="0 0 120 120">
              <circle cx="60" cy="60" r="54" fill="none" stroke="#1E3A5F" strokeWidth="8" />
              <circle cx="60" cy="60" r="54" fill="none" stroke="#10B981" strokeWidth="8"
                strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={strokeOffset}
                transform="rotate(-90 60 60)" className="transition-all duration-300" />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-bold text-emerald-400">{coveragePct}%</span>
              <span className="text-[10px] text-gray-500 uppercase tracking-wider">Coverage</span>
            </div>
          </div>

          {/* Tactic Mini Bars */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-3">
              <Shield size={18} className="text-cyan-400" />
              <h1 className="text-lg font-semibold text-white">MITRE ATT&CK Coverage Matrix</h1>
              <span className="ml-auto text-xs text-gray-500">{allTechniques.length} techniques tracked</span>
            </div>
            <div className="grid grid-cols-7 gap-1.5">
              {tactics.map((tac) => {
                const pct = miniBar(tac);
                return (
                  <div key={tac.short} className="text-center">
                    <div className="text-[9px] text-gray-500 truncate mb-0.5">{tac.short}</div>
                    <div className="h-2 bg-[#1A2942] rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${pct}%`, background: pct > 70 ? "#10B981" : pct > 40 ? "#F59E0B" : "#EF4444" }} />
                    </div>
                    <div className="text-[9px] text-gray-600 mt-0.5">{pct}%</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Sparkline */}
          <div className="flex-shrink-0">
            <div className="text-[10px] text-gray-500 mb-1 flex items-center gap-1"><TrendingUp size={12} className="text-emerald-400" /> 6-Month Trend</div>
            <svg width="140" height="44" className="overflow-visible">
              <defs>
                <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10B981" stopOpacity="0.3" />
                  <stop offset="100%" stopColor="#10B981" stopOpacity="0" />
                </linearGradient>
              </defs>
              <polygon points={`0,40 ${sparkPoints} 140,40`} fill="url(#sparkGrad)" />
              <polyline points={sparkPoints} fill="none" stroke="#10B981" strokeWidth="2" />
              {SPARKLINE.map((v, i) => (
                <circle key={i} cx={i * 28} cy={40 - (v / 100) * 36} r="3" fill="#10B981" />
              ))}
            </svg>
            <div className="flex justify-between text-[9px] text-gray-600 mt-0.5">
              <span>Nov</span><span>Apr</span>
            </div>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-1 text-sm text-gray-400"><Filter size={14} /> Filter:</div>
        {(["all", "covered", "partial", "gap", "detected"] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-all duration-200 ${filter === f ? "bg-cyan-500/20 border-cyan-500/50 text-cyan-300" : "bg-[#0F1D32] border-[#1E3A5F] text-gray-500 hover:text-gray-300 hover:border-gray-500"}`}>
            {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => setShowAgentLog(!showAgentLog)}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border transition-all duration-300 ${showAgentLog ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-300" : "bg-[#0F1D32] border-[#1E3A5F] text-gray-500 hover:text-gray-300"}`}>
            <Activity size={12} /> Agent Activity
          </button>
          <div className="flex items-center gap-1 px-2 py-1 text-[10px] text-gray-600">
            <Grid3X3 size={12} /> {allTechniques.length} techniques
          </div>
        </div>
      </div>

      {/* Agent Activity Log */}
      {showAgentLog && (
        <div className="bg-[#0F1D32] border border-emerald-500/30 rounded-xl p-4 mb-5 animate-[fadeIn_0.3s_ease-out]">
          <div className="flex items-center gap-2 mb-3">
            <Activity size={16} className="text-emerald-400" />
            <span className="text-sm font-semibold text-white">SOC Agent Activity</span>
            <span className="flex items-center gap-1 ml-2"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /><span className="text-[10px] text-emerald-400">LIVE</span></span>
            <span className="ml-auto text-[10px] text-gray-500">Agents autonomously improving coverage</span>
          </div>
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {agentLog.length === 0 ? (
              <div className="text-xs text-gray-600 italic py-2">Agents are analyzing coverage gaps... activity will appear shortly</div>
            ) : agentLog.map((entry, i) => (
              <div key={i} className="flex items-start gap-2 text-xs py-1 border-b border-[#1A2942] last:border-0">
                <span className="text-[10px] text-gray-600 font-mono w-20 flex-shrink-0">{entry.time}</span>
                <span className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${entry.type === 'deploy' ? 'bg-emerald-400' : entry.type === 'detect' ? 'bg-blue-400' : 'bg-amber-400'}`} />
                <span className="text-gray-400">{entry.msg}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Matrix Grid */}
      <div className="overflow-x-auto pb-2">
        <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${tactics.length}, minmax(120px, 1fr))` }}>
          {tactics.map((tac, ci) => (
            <div key={tac.name} className="flex flex-col gap-1">
              {/* Tactic Header */}
              <div className="bg-[#0F1D32] border border-[#1E3A5F] rounded-lg p-2 text-center sticky top-0 z-10">
                <div className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider truncate">{tac.name}</div>
                <div className="text-[9px] text-gray-600">{tac.techniques.length} techniques</div>
              </div>
              {/* Technique Cells */}
              {filtered(tac.techniques).map((tech) => (
                <button key={tech.id} onClick={() => { setSelected(tech); setPanelTactic(tac.name); }}
                  className={`relative group border rounded-lg p-2 text-left transition-all duration-300 cursor-pointer overflow-hidden ${statusColor(tech.status)} ${ci === rippleCol ? "scale-[1.03] shadow-lg shadow-cyan-500/10" : ""}`}
                  style={{ transition: "all 0.3s ease, transform 0.4s ease" }}>
                  {/* Gradient hover overlay */}
                  <div className="absolute inset-0 bg-gradient-to-br from-white/0 to-white/0 group-hover:from-white/5 group-hover:to-white/10 transition-all duration-500 rounded-lg" />
                  {/* Pulse indicator for detected */}
                  {tech.status === "detected" && (
                    <span className="absolute top-1 right-1 flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
                    </span>
                  )}
                  <div className="relative z-10">
                    <div className="flex items-center gap-1 mb-0.5">
                      {statusIcon(tech.status)}
                      <span className="text-[9px] font-mono text-gray-500">{tech.id}</span>
                    </div>
                    <div className="text-[10px] font-medium leading-tight truncate">{tech.name}</div>
                    {tech.rules > 0 && (
                      <div className="text-[9px] mt-1 opacity-70">{tech.rules} rules</div>
                    )}
                  </div>
                  <ChevronRight size={10} className="absolute bottom-1.5 right-1.5 opacity-0 group-hover:opacity-60 transition-opacity text-gray-400" />
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Critical Gaps */}
      <div className="mt-5 bg-[#0F1D32] border border-red-500/20 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <Target size={16} className="text-red-400" />
          <span className="text-sm font-semibold text-white">Critical Coverage Gaps</span>
          <span className="ml-auto text-[10px] text-gray-500">{gaps.length} high-risk uncovered techniques</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {gaps.map((g) => (
            <button key={g.id} onClick={() => { setSelected(g); setPanelTactic(""); }}
              className="flex items-center gap-3 p-3 bg-red-500/5 border border-red-500/20 rounded-lg hover:bg-red-500/10 hover:border-red-500/30 transition-all text-left group">
              <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-red-500/10 flex items-center justify-center">
                <AlertTriangle size={16} className="text-red-400" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-medium text-red-300 truncate">{g.name}</div>
                <div className="text-[10px] text-gray-500">{g.id}</div>
              </div>
              <div className="text-right flex-shrink-0">
                <div className="text-sm font-bold text-red-400">{g.risk}</div>
                <div className="text-[9px] text-gray-600">risk</div>
              </div>
              <ChevronRight size={14} className="text-gray-600 group-hover:text-red-400 transition-colors" />
            </button>
          ))}
        </div>
      </div>

      {/* Slide-out Panel */}
      {selected && (
        <>
          <div className="fixed inset-0 bg-black/40 z-40" onClick={() => setSelected(null)} />
          <div className="fixed top-0 right-0 h-full w-full max-w-md bg-[#0C1829] border-l border-[#1E3A5F] z-50 overflow-y-auto shadow-2xl animate-[slideIn_0.3s_ease-out]"
            style={{ animation: "slideIn 0.3s ease-out" }}>
            <div className="p-5">
              {/* Panel Header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className={`p-1.5 rounded-lg ${statusColor(selected.status)}`}>
                    {statusIcon(selected.status)}
                  </div>
                  <div>
                    <div className="text-sm font-bold text-white">{selected.name}</div>
                    <div className="text-[10px] text-gray-500">{selected.id} {panelTactic && `/ ${panelTactic}`}</div>
                  </div>
                </div>
                <button onClick={() => setSelected(null)} className="p-1.5 rounded-lg hover:bg-white/5 transition-colors">
                  <X size={18} className="text-gray-500" />
                </button>
              </div>

              {/* Status Badge */}
              <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border mb-4 ${statusColor(selected.status)}`}>
                {statusIcon(selected.status)}
                {selected.status.charAt(0).toUpperCase() + selected.status.slice(1)}
                {selected.status === "detected" && " (24h)"}
              </div>

              {/* Description */}
              <div className="mb-5">
                <div className="text-[10px] uppercase tracking-wider text-gray-600 mb-1">Description</div>
                <p className="text-xs text-gray-400 leading-relaxed">{selected.description}</p>
              </div>

              {/* Risk Score */}
              <div className="mb-5 p-3 bg-[#0F1D32] rounded-lg border border-[#1E3A5F]">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase tracking-wider text-gray-600">Risk Score</span>
                  <span className={`text-lg font-bold ${selected.risk >= 8 ? "text-red-400" : selected.risk >= 5 ? "text-amber-400" : "text-emerald-400"}`}>{selected.risk}/10</span>
                </div>
                <div className="h-1.5 bg-[#1A2942] rounded-full mt-2 overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${selected.risk * 10}%`, background: selected.risk >= 8 ? "#EF4444" : selected.risk >= 5 ? "#F59E0B" : "#10B981" }} />
                </div>
              </div>

              {/* Active Rules */}
              <div className="mb-5">
                <div className="flex items-center gap-1 mb-2">
                  <Eye size={12} className="text-cyan-400" />
                  <span className="text-[10px] uppercase tracking-wider text-gray-600">Active Rules ({selected.activeRules.length})</span>
                </div>
                {selected.activeRules.length > 0 ? (
                  <div className="space-y-1">
                    {selected.activeRules.map((rule) => (
                      <div key={rule} className="flex items-center gap-2 p-2 bg-emerald-500/5 border border-emerald-500/20 rounded text-xs text-emerald-400">
                        <CheckCircle2 size={12} /> {rule}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-gray-600 italic p-2">No active rules</div>
                )}
              </div>

              {/* Recent Detections */}
              <div className="mb-5 p-3 bg-[#0F1D32] rounded-lg border border-[#1E3A5F]">
                <div className="flex items-center gap-1 mb-1">
                  <Activity size={12} className="text-blue-400" />
                  <span className="text-[10px] uppercase tracking-wider text-gray-600">Recent Detections (24h)</span>
                </div>
                <div className="text-2xl font-bold text-white">{selected.recentDetections}</div>
              </div>

              {/* Recommended Rules */}
              <div>
                <div className="flex items-center gap-1 mb-2">
                  <Zap size={12} className="text-amber-400" />
                  <span className="text-[10px] uppercase tracking-wider text-gray-600">Recommended Rules ({selected.recommendedRules.length})</span>
                </div>
                {selected.recommendedRules.length > 0 ? (
                  <div className="space-y-1">
                    {selected.recommendedRules.map((rule) => (
                      <div key={rule} className="flex items-center justify-between p-2 bg-amber-500/5 border border-amber-500/20 rounded text-xs">
                        <span className="text-amber-400 flex items-center gap-2"><AlertTriangle size={12} /> {rule}</span>
                        <button className="px-2 py-0.5 bg-amber-500/20 text-amber-300 rounded text-[10px] hover:bg-amber-500/30 transition-colors">Enable</button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-emerald-500 italic p-2 flex items-center gap-1"><CheckCircle2 size={12} /> Full coverage achieved</div>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Inline keyframes */}
      <style>{`
        @keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}
