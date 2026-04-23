import { useState, useEffect, useRef, useCallback } from "react";
import {
  Brain, Sparkles, MessageSquare, Shield, AlertTriangle, Clock, User, Server,
  Globe, ChevronRight, Target, Zap, Send, CheckCircle2, XCircle, TrendingUp,
  Eye, FileText, Activity, X,
} from "lucide-react";

// --- Data ---
const incidents = [
  { id: 1, title: "Credential Theft Campaign", severity: "Critical", status: "Active", alerts: 47, icon: Shield, color: "#EF4444",
    summary: "A sophisticated credential theft campaign targeting executive accounts was detected across multiple authentication systems. The attacker leveraged phishing emails with convincing Microsoft 365 login pages to harvest credentials from 12 senior staff members. Lateral movement was observed within 30 minutes of initial compromise, indicating automated tooling.",
    triage: { severity: "Critical", category: "Credential Access", owner: "Sarah Chen, SOC Lead", reasoning: "Multiple executive accounts compromised with evidence of lateral movement. Immediate containment required." },
    technical: ["Phishing emails originated from compromised partner domain partner-corp[.]com", "Harvested credentials used from TOR exit nodes within 4 minutes", "OAuth tokens generated for persistent mailbox access", "PowerShell scripts deployed via compromised accounts for reconnaissance"],
    mitre: ["T1566.001 - Spearphishing Attachment", "T1078 - Valid Accounts", "T1550.001 - Application Access Token"],
    entities: ["Exchange Online", "Azure AD", "VPN Gateway", "12 Executive Accounts"],
    timeline: [{ t: "09:14", label: "Phish Sent", color: "#F59E0B" }, { t: "09:22", label: "Creds Harvested", color: "#EF4444" }, { t: "09:26", label: "TOR Login", color: "#EF4444" }, { t: "09:52", label: "Lateral Move", color: "#DC2626" }, { t: "10:15", label: "Detected", color: "#22C55E" }],
    actions: ["Revoke all compromised OAuth tokens immediately", "Force password reset for affected accounts", "Block identified TOR exit nodes at firewall", "Enable conditional access policies for executives", "Initiate forensic imaging of affected endpoints"],
    confidence: 94 },
  { id: 2, title: "Ransomware Pre-Deployment", severity: "Critical", status: "Contained", alerts: 83, icon: AlertTriangle, color: "#DC2626",
    summary: "Early-stage ransomware deployment detected and contained before encryption began. The threat actor gained initial access through an exposed RDP server and deployed Cobalt Strike beacons across 8 systems. Volume shadow copy deletion commands were intercepted, triggering automated containment.",
    triage: { severity: "Critical", category: "Impact - Ransomware", owner: "Marcus Webb, IR Team", reasoning: "Pre-encryption stage ransomware with active C2 channels. Containment successful but full remediation needed." },
    technical: ["Initial access via exposed RDP on port 3389", "Cobalt Strike beacon deployed with malleable C2 profile", "PsExec used for lateral movement across subnet 10.1.4.0/24", "vssadmin delete shadows command blocked by EDR"],
    mitre: ["T1133 - External Remote Services", "T1059.001 - PowerShell", "T1490 - Inhibit System Recovery"],
    entities: ["RDP Server (10.1.4.50)", "Domain Controller", "File Server", "8 Workstations"],
    timeline: [{ t: "02:30", label: "RDP Brute Force", color: "#F59E0B" }, { t: "03:15", label: "Access Gained", color: "#EF4444" }, { t: "03:45", label: "Cobalt Strike", color: "#EF4444" }, { t: "04:20", label: "Lateral Move", color: "#DC2626" }, { t: "04:55", label: "Contained", color: "#22C55E" }],
    actions: ["Isolate all 8 affected workstations from network", "Reset krbtgt account password twice", "Scan all endpoints for Cobalt Strike indicators", "Patch RDP server and restrict access via VPN only"],
    confidence: 97 },
  { id: 3, title: "Data Exfiltration via DNS", severity: "High", status: "Investigating", alerts: 31, icon: Globe, color: "#F59E0B",
    summary: "Anomalous DNS tunneling activity detected exfiltrating data to external infrastructure. Encoded payloads embedded in DNS TXT queries suggest use of custom tooling. Approximately 2.3 GB of data transferred over 72 hours through high-frequency subdomain queries.",
    triage: { severity: "High", category: "Exfiltration", owner: "James Park, Threat Intel", reasoning: "Active data exfiltration channel confirmed. Volume suggests database or document repository targeted." },
    technical: ["DNS queries to *.data.evil-dns[.]net averaging 500 queries/min", "Base64-encoded payloads in TXT record responses", "Source identified as database server DB-PROD-03", "Query patterns match known iodine DNS tunnel signatures"],
    mitre: ["T1048.003 - Exfiltration Over Alternative Protocol", "T1071.004 - Application Layer Protocol: DNS"],
    entities: ["DB-PROD-03", "Internal DNS Resolver", "Customer Database"],
    timeline: [{ t: "Mon 08:00", label: "Tunnel Start", color: "#F59E0B" }, { t: "Tue 14:00", label: "Volume Spike", color: "#EF4444" }, { t: "Wed 09:30", label: "Alert Fired", color: "#22C55E" }, { t: "Wed 11:00", label: "Investigation", color: "#3B82F6" }],
    actions: ["Block DNS queries to evil-dns[.]net at DNS resolver", "Isolate DB-PROD-03 for forensic analysis", "Audit database access logs for unauthorized queries", "Deploy DNS monitoring rules for TXT record anomalies"],
    confidence: 88 },
  { id: 4, title: "APT-29 Infrastructure Detected", severity: "High", status: "Monitoring", alerts: 19, icon: Target, color: "#A855F7",
    summary: "Network telemetry matches known APT-29 command and control infrastructure. Beacon traffic identified communicating with IP addresses linked to recent CISA advisory AA24-057A. Traffic originates from a developer workstation with elevated privileges.",
    triage: { severity: "High", category: "Command & Control", owner: "Sarah Chen, SOC Lead", reasoning: "Nation-state threat actor indicators warrant immediate investigation despite low alert volume." },
    technical: ["HTTPS beaconing to 185.220.101[.]42 every 60s with jitter", "JA3 fingerprint matches known APT-29 loader", "Traffic originates from DEV-WS-127 (developer workstation)", "Workstation has admin access to CI/CD pipeline"],
    mitre: ["T1071.001 - Web Protocols", "T1573.002 - Encrypted Channel: Asymmetric Crypto", "T1195.002 - Compromise Software Supply Chain"],
    entities: ["DEV-WS-127", "CI/CD Pipeline", "Source Code Repository"],
    timeline: [{ t: "Apr 10", label: "First Beacon", color: "#F59E0B" }, { t: "Apr 15", label: "Pattern Match", color: "#A855F7" }, { t: "Apr 20", label: "TI Correlation", color: "#3B82F6" }, { t: "Apr 22", label: "SOC Alerted", color: "#22C55E" }],
    actions: ["Isolate DEV-WS-127 immediately", "Audit CI/CD pipeline for unauthorized changes", "Review all recent code commits from affected developer", "Engage threat intelligence team for APT-29 IOC sweep"],
    confidence: 79 },
  { id: 5, title: "DDoS Attack on API Gateway", severity: "Medium", status: "Mitigated", alerts: 156, icon: Zap, color: "#3B82F6",
    summary: "Volumetric DDoS attack targeting the primary API gateway reached 45 Gbps before automated mitigation engaged. Attack traffic consisted of amplified DNS and NTP reflection vectors originating from approximately 12,000 unique source IPs across 40 countries.",
    triage: { severity: "Medium", category: "Availability", owner: "Ops Team", reasoning: "Automated mitigation effective. No service disruption to end users. Post-incident review recommended." },
    technical: ["Peak traffic: 45 Gbps via DNS amplification + NTP reflection", "12,000 unique source IPs across 40 countries", "API gateway response time peaked at 2.3s (SLA: 500ms)", "CDN auto-scaling absorbed 92% of attack traffic"],
    mitre: ["T1498.002 - Reflection Amplification", "T1499 - Endpoint Denial of Service"],
    entities: ["API Gateway", "CDN Edge Nodes", "DNS Infrastructure"],
    timeline: [{ t: "14:00", label: "Traffic Spike", color: "#F59E0B" }, { t: "14:02", label: "45 Gbps Peak", color: "#EF4444" }, { t: "14:03", label: "Auto-Mitigate", color: "#22C55E" }, { t: "14:30", label: "Traffic Normal", color: "#3B82F6" }],
    actions: ["Review and update DDoS mitigation thresholds", "Add identified source IPs to threat intelligence feed", "Conduct capacity planning review for API gateway", "Update incident response playbook for DDoS scenarios"],
    confidence: 92 },
  { id: 6, title: "Insider Threat - Data Staging", severity: "Medium", status: "Active", alerts: 22, icon: User, color: "#F97316",
    summary: "Behavioral analytics flagged unusual data access patterns from a finance department employee. Over 14 days, the user accessed 340% more sensitive files than baseline, with access occurring during non-business hours. Data was staged in a personal OneDrive folder before partial upload to external storage.",
    triage: { severity: "Medium", category: "Insider Threat", owner: "HR Security Liaison", reasoning: "Pattern consistent with data theft preparation. User has submitted resignation effective next month." },
    technical: ["User accessed 847 sensitive files vs 195 baseline (30-day avg)", "Access times: 11 PM - 3 AM local, outside normal 9-5 pattern", "15.7 GB staged in personal OneDrive sync folder", "Partial upload (3.2 GB) to mega[.]nz detected and blocked"],
    mitre: ["T1074.001 - Local Data Staging", "T1567.002 - Exfiltration to Cloud Storage"],
    entities: ["Finance User (ID: FIN-0847)", "OneDrive", "Mega.nz", "Financial Reports"],
    timeline: [{ t: "Apr 8", label: "Anomaly Start", color: "#F59E0B" }, { t: "Apr 14", label: "Staging Begins", color: "#EF4444" }, { t: "Apr 19", label: "Upload Blocked", color: "#22C55E" }, { t: "Apr 22", label: "HR Notified", color: "#3B82F6" }],
    actions: ["Restrict user access to sensitive file shares immediately", "Preserve forensic copy of OneDrive staging folder", "Coordinate with HR and Legal for investigation", "Review DLP policies for OneDrive sync folders"],
    confidence: 85 },
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
