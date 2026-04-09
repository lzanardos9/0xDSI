import { useState } from 'react';
import { X, AlertTriangle, Shield, Clock, MapPin, Server, User, Activity, ChevronRight, ExternalLink, Terminal, Network, FileWarning, Layers } from 'lucide-react';

export interface DrilldownEvent {
  id: string;
  title: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  timestamp: string;
  source: string;
  sourceIP: string;
  destIP: string;
  category: string;
  description: string;
  rawLog: string;
  mitreTactic: string;
  mitreId: string;
  affectedAssets: string[];
  user: string;
  geoLocation: string;
  iocIndicators: string[];
  timeline: { time: string; action: string; detail: string }[];
  relatedAlerts: { id: string; title: string; severity: string }[];
  responseActions: { action: string; status: 'completed' | 'pending' | 'in_progress'; by: string }[];
}

const MOCK_EVENTS: DrilldownEvent[] = [
  {
    id: 'EVT-2024-0847',
    title: 'APT-29 Command & Control Beacon Detected',
    severity: 'critical',
    timestamp: '2024-03-15 14:32:47 UTC',
    source: 'NDR Sensor - DC-EAST',
    sourceIP: '10.42.18.105',
    destIP: '185.234.72.19',
    category: 'Command & Control',
    description: 'Encrypted beacon traffic detected matching APT-29 (Cozy Bear) TTP patterns. Outbound HTTPS connections to known C2 infrastructure with 120-second jitter interval. DNS-over-HTTPS tunneling observed.',
    rawLog: '[2024-03-15T14:32:47.331Z] NDR-ALERT severity=CRITICAL src=10.42.18.105:49821 dst=185.234.72.19:443 proto=TLS1.3 bytes_out=2847 bytes_in=512 ja3=e7d705a3286e19ea42f587b344ee6865 rule_id=APT29_C2_BEACON interval=120s jitter=15s',
    mitreTactic: 'Command and Control (TA0011)',
    mitreId: 'T1071.001',
    affectedAssets: ['WKS-FIN-042', 'SRV-DC-01', 'SRV-EXCH-01'],
    user: 'j.martinez@corp.local',
    geoLocation: 'Moscow, Russia',
    iocIndicators: ['185.234.72.19', 'e7d705a3286e19ea42f587b344ee6865 (JA3)', 'cozybeaR.top', 'SHA256: a8f5f167...'],
    timeline: [
      { time: '14:30:12', action: 'Initial DNS Query', detail: 'DNS-over-HTTPS query to cloudflare-dns.com resolving cozybeaR.top' },
      { time: '14:30:14', action: 'TLS Handshake', detail: 'TLS 1.3 connection established with suspicious JA3 fingerprint' },
      { time: '14:30:15', action: 'Beacon Start', detail: 'First outbound beacon with 2847 bytes payload' },
      { time: '14:32:15', action: 'Beacon Cycle', detail: 'Second beacon cycle detected, 120s interval confirmed' },
      { time: '14:32:47', action: 'Alert Triggered', detail: 'NDR correlation rule matched APT-29 C2 pattern' },
    ],
    relatedAlerts: [
      { id: 'ALT-0841', title: 'Suspicious Kerberoasting Activity', severity: 'high' },
      { id: 'ALT-0839', title: 'Abnormal AD Replication', severity: 'medium' },
      { id: 'ALT-0845', title: 'Lateral Movement via WMI', severity: 'critical' },
    ],
    responseActions: [
      { action: 'Block C2 IP at perimeter firewall', status: 'completed', by: 'SOC-AUTO' },
      { action: 'Isolate workstation WKS-FIN-042', status: 'completed', by: 'SOC-L2' },
      { action: 'Memory dump acquisition', status: 'in_progress', by: 'DFIR Team' },
      { action: 'Full AD audit initiated', status: 'pending', by: 'IAM Team' },
    ],
  },
  {
    id: 'EVT-2024-0852',
    title: 'Cobalt Strike Payload Execution Detected',
    severity: 'critical',
    timestamp: '2024-03-15 14:35:21 UTC',
    source: 'EDR Agent - WKS-FIN-042',
    sourceIP: '10.42.18.105',
    destIP: '10.42.1.5',
    category: 'Execution',
    description: 'Process injection detected via Cobalt Strike SMB beacon. rundll32.exe spawned with suspicious command line loading beacon DLL. Memory-only payload with no disk artifacts.',
    rawLog: '[2024-03-15T14:35:21.774Z] EDR-ALERT proc=rundll32.exe ppid=explorer.exe pid=7832 cmd="rundll32.exe C:\\Windows\\Temp\\tmp8A3F.dll,StartW" mem_injection=true cobalt_watermark=0x5FC3E daemon_type=smb_beacon',
    mitreTactic: 'Execution (TA0002)',
    mitreId: 'T1055.001',
    affectedAssets: ['WKS-FIN-042'],
    user: 'j.martinez@corp.local',
    geoLocation: 'Internal - Floor 4, Building A',
    iocIndicators: ['tmp8A3F.dll', 'Cobalt Strike watermark: 0x5FC3E', 'Named pipe: \\\\.\\.pipe\\msagent_12'],
    timeline: [
      { time: '14:35:18', action: 'DLL Drop', detail: 'Suspicious DLL written to C:\\Windows\\Temp\\' },
      { time: '14:35:19', action: 'Process Launch', detail: 'rundll32.exe spawned by explorer.exe with DLL parameter' },
      { time: '14:35:20', action: 'Memory Injection', detail: 'Process hollowing detected in svchost.exe (PID 4921)' },
      { time: '14:35:21', action: 'Beacon Active', detail: 'SMB beacon pipe established, lateral movement capability confirmed' },
    ],
    relatedAlerts: [
      { id: 'ALT-0847', title: 'APT-29 C2 Beacon', severity: 'critical' },
      { id: 'ALT-0853', title: 'Credential Dumping Attempt', severity: 'critical' },
    ],
    responseActions: [
      { action: 'Kill malicious process tree', status: 'completed', by: 'EDR-AUTO' },
      { action: 'Quarantine beacon DLL', status: 'completed', by: 'EDR-AUTO' },
      { action: 'Full disk forensic image', status: 'in_progress', by: 'DFIR Team' },
    ],
  },
  {
    id: 'EVT-2024-0861',
    title: 'Ransomware Pre-Encryption Behavior',
    severity: 'critical',
    timestamp: '2024-03-15 14:41:03 UTC',
    source: 'SIEM Correlation Engine',
    sourceIP: '10.42.22.87',
    destIP: '10.42.0.0/16',
    category: 'Impact',
    description: 'Volume Shadow Copy deletion followed by systematic file enumeration across network shares. Pattern matches BlackCat/ALPHV ransomware pre-encryption phase. 847 files enumerated in 12 seconds.',
    rawLog: '[2024-03-15T14:41:03.112Z] CORR-ALERT rule=RANSOMWARE_PRE_ENCRYPT events=[vssadmin_delete,file_enum_burst,smb_share_scan] confidence=97% src=10.42.22.87 files_enum=847 time_window=12s',
    mitreTactic: 'Impact (TA0040)',
    mitreId: 'T1486',
    affectedAssets: ['SRV-FILE-01', 'SRV-FILE-02', 'SRV-BACKUP-01'],
    user: 'svc_backup@corp.local',
    geoLocation: 'Internal - Server Room B',
    iocIndicators: ['vssadmin delete shadows /all /quiet', 'bcdedit /set {default} recoveryenabled no', '*.sphynx file extension'],
    timeline: [
      { time: '14:40:55', action: 'Shadow Delete', detail: 'vssadmin.exe delete shadows /all /quiet executed' },
      { time: '14:40:57', action: 'Recovery Disabled', detail: 'bcdedit recovery policy disabled' },
      { time: '14:40:59', action: 'Share Enumeration', detail: 'SMB share scan across 10.42.0.0/16 subnet' },
      { time: '14:41:01', action: 'File Enumeration', detail: '847 files enumerated across 3 file servers' },
      { time: '14:41:03', action: 'Correlation Alert', detail: 'SIEM rule triggered ransomware pre-encryption pattern' },
    ],
    relatedAlerts: [
      { id: 'ALT-0858', title: 'Privilege Escalation via Service Account', severity: 'high' },
      { id: 'ALT-0860', title: 'Mass File Access Anomaly', severity: 'critical' },
    ],
    responseActions: [
      { action: 'Network isolation of affected segment', status: 'completed', by: 'SOC-AUTO' },
      { action: 'Disable service account svc_backup', status: 'completed', by: 'IAM-AUTO' },
      { action: 'Verify backup integrity', status: 'in_progress', by: 'IT Ops' },
      { action: 'Activate incident response plan', status: 'in_progress', by: 'CISO Office' },
    ],
  },
  {
    id: 'EVT-2024-0855',
    title: 'Mimikatz Credential Harvesting',
    severity: 'high',
    timestamp: '2024-03-15 14:37:44 UTC',
    source: 'EDR Agent - SRV-DC-01',
    sourceIP: '10.42.1.5',
    destIP: 'N/A',
    category: 'Credential Access',
    description: 'LSASS process memory access detected matching Mimikatz sekurlsa::logonpasswords pattern. 14 credential sets potentially exfiltrated including domain admin hashes.',
    rawLog: '[2024-03-15T14:37:44.889Z] EDR-ALERT proc=lsass.exe access=PROCESS_VM_READ caller=rundll32.exe(7832) pattern=mimikatz_logonpass creds_extracted=14 domain_admin=true',
    mitreTactic: 'Credential Access (TA0006)',
    mitreId: 'T1003.001',
    affectedAssets: ['SRV-DC-01', 'All domain accounts'],
    user: 'j.martinez@corp.local (compromised)',
    geoLocation: 'Internal - Server Room A',
    iocIndicators: ['LSASS memory read by rundll32', 'sekurlsa::logonpasswords', '14 credential sets'],
    timeline: [
      { time: '14:37:40', action: 'Process Injection', detail: 'rundll32.exe injected into LSASS address space' },
      { time: '14:37:42', action: 'Memory Read', detail: 'PROCESS_VM_READ access to LSASS memory' },
      { time: '14:37:44', action: 'Credential Dump', detail: '14 credential sets extracted including 2 domain admin accounts' },
    ],
    relatedAlerts: [
      { id: 'ALT-0852', title: 'Cobalt Strike Payload', severity: 'critical' },
      { id: 'ALT-0857', title: 'Pass-the-Hash Detected', severity: 'high' },
    ],
    responseActions: [
      { action: 'Force password reset for all affected accounts', status: 'in_progress', by: 'IAM Team' },
      { action: 'Revoke all Kerberos tickets (krbtgt reset)', status: 'pending', by: 'AD Admin' },
    ],
  },
  {
    id: 'EVT-2024-0866',
    title: 'Data Exfiltration via DNS Tunneling',
    severity: 'high',
    timestamp: '2024-03-15 14:44:19 UTC',
    source: 'DNS Firewall - FW-PERIM-01',
    sourceIP: '10.42.18.105',
    destIP: '8.8.8.8',
    category: 'Exfiltration',
    description: 'High-entropy DNS TXT queries detected to suspicious domain. Approximately 4.2 MB of encoded data exfiltrated over 340 DNS queries in 8 minutes. Data likely contains stolen credentials and financial documents.',
    rawLog: '[2024-03-15T14:44:19.445Z] DNS-FW severity=HIGH src=10.42.18.105 qtype=TXT domain=*.exf1l.cozybeaR.top queries=340 entropy=0.94 est_data=4.2MB duration=480s',
    mitreTactic: 'Exfiltration (TA0010)',
    mitreId: 'T1048.003',
    affectedAssets: ['WKS-FIN-042', 'Financial data repository'],
    user: 'j.martinez@corp.local',
    geoLocation: 'Moscow, Russia (DNS resolver)',
    iocIndicators: ['*.exf1l.cozybeaR.top', 'DNS TXT queries with entropy > 0.9', 'Base64-encoded payloads'],
    timeline: [
      { time: '14:36:19', action: 'Tunneling Start', detail: 'First high-entropy DNS TXT query to exf1l.cozybeaR.top' },
      { time: '14:40:00', action: 'Volume Increase', detail: 'Query rate increased to 1.2 queries/second' },
      { time: '14:44:19', action: 'Detection', detail: 'DNS firewall entropy threshold exceeded, alert generated' },
    ],
    relatedAlerts: [
      { id: 'ALT-0847', title: 'APT-29 C2 Beacon', severity: 'critical' },
    ],
    responseActions: [
      { action: 'Block DNS queries to cozybeaR.top', status: 'completed', by: 'DNS-FW-AUTO' },
      { action: 'Assess scope of exfiltrated data', status: 'in_progress', by: 'DFIR Team' },
    ],
  },
  {
    id: 'EVT-2024-0870',
    title: 'Brute Force Attack on VPN Gateway',
    severity: 'medium',
    timestamp: '2024-03-15 14:48:33 UTC',
    source: 'VPN Gateway - GW-VPN-01',
    sourceIP: '91.108.44.200',
    destIP: '203.0.113.50',
    category: 'Initial Access',
    description: 'Distributed brute force attack targeting VPN gateway. 12,400 login attempts from 47 unique source IPs over 15 minutes. Password spraying pattern detected using common credential lists.',
    rawLog: '[2024-03-15T14:48:33.667Z] VPN-AUTH severity=MEDIUM type=brute_force attempts=12400 unique_src=47 duration=900s target=GW-VPN-01 pattern=password_spray top_user=admin',
    mitreTactic: 'Initial Access (TA0001)',
    mitreId: 'T1110.003',
    affectedAssets: ['GW-VPN-01', 'External attack surface'],
    user: 'Multiple (admin, root, vpnuser, etc.)',
    geoLocation: 'Distributed (Russia, China, Brazil)',
    iocIndicators: ['91.108.44.0/24', '103.24.77.0/24', '177.54.128.0/24'],
    timeline: [
      { time: '14:33:33', action: 'Attack Start', detail: 'First batch of authentication attempts from 91.108.44.200' },
      { time: '14:38:00', action: 'Escalation', detail: 'Additional source IPs join the attack, now 47 unique sources' },
      { time: '14:48:33', action: 'Threshold Alert', detail: '12,400 failed attempts threshold reached' },
    ],
    relatedAlerts: [],
    responseActions: [
      { action: 'Rate limiting enabled on VPN gateway', status: 'completed', by: 'FW-AUTO' },
      { action: 'GeoIP blocking for attack source ranges', status: 'completed', by: 'SOC-L1' },
    ],
  },
];

const sevColor = (s: string) => {
  switch (s) {
    case 'critical': return { bg: 'bg-red-500/10', border: 'border-red-500/30', text: 'text-red-400', dot: 'bg-red-500' };
    case 'high': return { bg: 'bg-orange-500/10', border: 'border-orange-500/30', text: 'text-orange-400', dot: 'bg-orange-500' };
    case 'medium': return { bg: 'bg-yellow-500/10', border: 'border-yellow-500/30', text: 'text-yellow-400', dot: 'bg-yellow-500' };
    default: return { bg: 'bg-cyan-500/10', border: 'border-cyan-500/30', text: 'text-cyan-400', dot: 'bg-cyan-500' };
  }
};

interface EventDrilldownModalProps {
  isOpen: boolean;
  onClose: () => void;
  eventId?: string;
  category?: string;
}

const CATEGORY_MAP: Record<string, string[]> = {
  'radar': ['EVT-2024-0847', 'EVT-2024-0852', 'EVT-2024-0861'],
  'heartbeat': ['EVT-2024-0855', 'EVT-2024-0866'],
  'killchain': ['EVT-2024-0852', 'EVT-2024-0861'],
  'weather': ['EVT-2024-0870', 'EVT-2024-0847'],
  'lowslow': ['EVT-2024-0866', 'EVT-2024-0855'],
  'embedding': ['EVT-2024-0847', 'EVT-2024-0870'],
};

export const getRandomEvent = (): DrilldownEvent => MOCK_EVENTS[Math.floor(Math.random() * MOCK_EVENTS.length)];
export const getEventById = (id: string): DrilldownEvent | undefined => MOCK_EVENTS.find(e => e.id === id);
export const getEventByCategory = (cat: string): DrilldownEvent => {
  const ids = CATEGORY_MAP[cat] || [];
  const id = ids[Math.floor(Math.random() * ids.length)];
  return getEventById(id) || MOCK_EVENTS[0];
};

const EventDrilldownModal = ({ isOpen, onClose, eventId, category }: EventDrilldownModalProps) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'timeline' | 'raw' | 'response'>('overview');
  const event = eventId ? getEventById(eventId) : category ? getEventByCategory(category) : getRandomEvent();

  if (!isOpen || !event) return null;

  const sc = sevColor(event.severity);
  const tabs = [
    { key: 'overview', label: 'Overview', icon: Layers },
    { key: 'timeline', label: 'Timeline', icon: Clock },
    { key: 'raw', label: 'Raw Log', icon: Terminal },
    { key: 'response', label: 'Response', icon: Shield },
  ] as const;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-4xl max-h-[85vh] bg-[#0a0e18] border border-slate-700/50 rounded-2xl shadow-2xl overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-3 bg-[#0c1020] border-b border-slate-800/50">
          <div className="flex items-center gap-3">
            <AlertTriangle className={`w-5 h-5 ${sc.text}`} />
            <span className="text-slate-200 font-mono font-bold text-sm">{event.id}</span>
            <div className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${sc.bg} ${sc.border} ${sc.text}`}>
              {event.severity.toUpperCase()}
            </div>
            <span className="text-slate-500 text-xs font-mono">{event.category}</span>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 transition-colors p-1 hover:bg-white/5 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-3 border-b border-slate-800/30">
          <h2 className={`text-lg font-semibold ${sc.text} mb-1`}>{event.title}</h2>
          <div className="flex items-center gap-4 text-xs font-mono text-slate-500">
            <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{event.timestamp}</span>
            <span className="flex items-center gap-1"><Server className="w-3 h-3" />{event.source}</span>
            <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{event.geoLocation}</span>
          </div>
        </div>

        <div className="flex border-b border-slate-800/30">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-mono font-bold transition-all border-b-2 ${
                activeTab === tab.key
                  ? 'text-cyan-400 border-cyan-400 bg-cyan-500/5'
                  : 'text-slate-500 border-transparent hover:text-slate-300 hover:bg-white/3'
              }`}
            >
              <tab.icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
          {activeTab === 'overview' && (
            <div className="space-y-5">
              <div>
                <h3 className="text-xs font-mono font-bold text-slate-400 mb-2 tracking-wider">DESCRIPTION</h3>
                <p className="text-sm text-slate-300 leading-relaxed">{event.description}</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-900/40 rounded-lg p-3 border border-slate-800/30">
                  <div className="text-[10px] font-mono text-slate-500 mb-1">SOURCE IP</div>
                  <div className="text-sm font-mono text-cyan-400">{event.sourceIP}</div>
                </div>
                <div className="bg-slate-900/40 rounded-lg p-3 border border-slate-800/30">
                  <div className="text-[10px] font-mono text-slate-500 mb-1">DESTINATION IP</div>
                  <div className="text-sm font-mono text-cyan-400">{event.destIP}</div>
                </div>
                <div className="bg-slate-900/40 rounded-lg p-3 border border-slate-800/30">
                  <div className="text-[10px] font-mono text-slate-500 mb-1">MITRE ATT&CK</div>
                  <div className="text-sm font-mono text-orange-400">{event.mitreId} - {event.mitreTactic}</div>
                </div>
                <div className="bg-slate-900/40 rounded-lg p-3 border border-slate-800/30">
                  <div className="text-[10px] font-mono text-slate-500 mb-1">USER</div>
                  <div className="text-sm font-mono text-slate-300 flex items-center gap-1"><User className="w-3 h-3" />{event.user}</div>
                </div>
              </div>

              <div>
                <h3 className="text-xs font-mono font-bold text-slate-400 mb-2 tracking-wider">AFFECTED ASSETS</h3>
                <div className="flex flex-wrap gap-2">
                  {event.affectedAssets.map(a => (
                    <span key={a} className="px-2.5 py-1 rounded bg-slate-800/50 text-slate-300 text-xs font-mono border border-slate-700/30 flex items-center gap-1">
                      <Server className="w-3 h-3 text-slate-500" />{a}
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="text-xs font-mono font-bold text-slate-400 mb-2 tracking-wider">IOC INDICATORS</h3>
                <div className="space-y-1.5">
                  {event.iocIndicators.map((ioc, i) => (
                    <div key={i} className="flex items-center gap-2 px-3 py-1.5 rounded bg-red-500/5 border border-red-500/15 text-xs font-mono text-red-300">
                      <FileWarning className="w-3 h-3 text-red-400 flex-shrink-0" />
                      {ioc}
                    </div>
                  ))}
                </div>
              </div>

              {event.relatedAlerts.length > 0 && (
                <div>
                  <h3 className="text-xs font-mono font-bold text-slate-400 mb-2 tracking-wider">RELATED ALERTS</h3>
                  <div className="space-y-1.5">
                    {event.relatedAlerts.map(alert => {
                      const ac = sevColor(alert.severity);
                      return (
                        <div key={alert.id} className="flex items-center gap-2 px-3 py-2 rounded bg-slate-900/40 border border-slate-800/30 cursor-pointer hover:bg-slate-800/40 transition-colors">
                          <div className={`w-2 h-2 rounded-full ${ac.dot}`} />
                          <span className="text-xs font-mono text-slate-500">{alert.id}</span>
                          <span className="text-xs text-slate-300 flex-1">{alert.title}</span>
                          <ChevronRight className="w-3 h-3 text-slate-600" />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'timeline' && (
            <div className="relative pl-6">
              <div className="absolute left-2 top-0 bottom-0 w-px bg-slate-800" />
              {event.timeline.map((t, i) => (
                <div key={i} className="relative mb-6 last:mb-0">
                  <div className={`absolute -left-[18px] top-1 w-3 h-3 rounded-full border-2 ${
                    i === event.timeline.length - 1 ? 'bg-red-500 border-red-400' : 'bg-slate-800 border-slate-600'
                  }`} />
                  <div className="text-[10px] font-mono text-slate-600 mb-1">{t.time} UTC</div>
                  <div className="text-sm font-semibold text-slate-200 mb-0.5">{t.action}</div>
                  <div className="text-xs text-slate-400">{t.detail}</div>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'raw' && (
            <div className="bg-black/50 rounded-lg border border-slate-800/50 p-4 overflow-x-auto">
              <pre className="text-xs font-mono text-emerald-400 whitespace-pre-wrap leading-relaxed">{event.rawLog}</pre>
            </div>
          )}

          {activeTab === 'response' && (
            <div className="space-y-4">
              {event.responseActions.map((ra, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3 rounded-lg bg-slate-900/40 border border-slate-800/30">
                  <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                    ra.status === 'completed' ? 'bg-emerald-500' : ra.status === 'in_progress' ? 'bg-yellow-500 animate-pulse' : 'bg-slate-600'
                  }`} />
                  <div className="flex-1">
                    <div className="text-sm text-slate-200">{ra.action}</div>
                    <div className="text-[10px] font-mono text-slate-500 mt-0.5">Assigned: {ra.by}</div>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                    ra.status === 'completed' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                    ra.status === 'in_progress' ? 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20' :
                    'bg-slate-600/10 text-slate-400 border border-slate-600/20'
                  }`}>
                    {ra.status.toUpperCase().replace('_', ' ')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="px-6 py-2.5 border-t border-slate-800/30 bg-[#080d1a] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Network className="w-3 h-3 text-slate-600" />
            <span className="text-[9px] font-mono text-slate-600">Correlation Engine v4.2</span>
          </div>
          <div className="flex items-center gap-2 text-[9px] font-mono text-slate-600">
            <span>OCSF v1.1</span>
            <span>|</span>
            <span className="flex items-center gap-1 text-cyan-500/60 cursor-pointer hover:text-cyan-400">
              <ExternalLink className="w-3 h-3" /> Export
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EventDrilldownModal;
