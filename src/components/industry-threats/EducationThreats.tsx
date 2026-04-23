import { useState, useEffect } from 'react';
import {
  BookOpen, Shield, AlertTriangle, Users, Lock, Wifi, Server,
  Clock, Database, Globe, FileText, Eye, Zap, Radio, Activity
} from 'lucide-react';

interface StudentDataThreat {
  id: string;
  type: string;
  target: string;
  records: number;
  dataTypes: string[];
  severity: 'critical' | 'high' | 'medium';
  ferpaViolation: string;
  description: string;
  institution: string;
  timestamp: string;
  status: 'active' | 'contained' | 'investigating';
}

interface ResearchIPThreat {
  id: string;
  researchArea: string;
  institution: string;
  threatActor: string;
  attribution: string;
  targetedData: string;
  fundingSource: string;
  grantValue: string;
  severity: 'critical' | 'high' | 'medium';
  technique: string;
  description: string;
  status: 'active' | 'mitigated' | 'investigating';
}

interface CampusNetworkThreat {
  id: string;
  type: string;
  source: string;
  affectedSystems: string;
  severity: 'critical' | 'high' | 'medium';
  protocol: string;
  trafficVolume: string;
  description: string;
  campus: string;
  status: 'active' | 'blocked' | 'monitoring';
}

interface EduRansomwareEvent {
  id: string;
  institution: string;
  type: 'K-12' | 'Higher Ed' | 'Community College';
  strain: string;
  ransom: string;
  studentsAffected: number;
  systemsEncrypted: string;
  entryVector: string;
  recoveryDays: number;
  description: string;
  status: 'active' | 'recovered' | 'negotiating';
}

const STUDENT_DATA_THREATS: StudentDataThreat[] = [
  {
    id: 'sd-001', type: 'SIS Database Breach', target: 'PowerSchool Student Information System',
    records: 87_432, dataTypes: ['SSN', 'DOB', 'Grades', 'Disciplinary Records', 'IEP Documents'],
    severity: 'critical', ferpaViolation: '34 CFR 99.31 - Unauthorized Disclosure',
    description: 'SQL injection via parent portal exposed full SIS database. Attacker exfiltrated student PII including protected disability records (IEPs) and behavioral incident reports across 14 schools.',
    institution: 'Clark County School District', timestamp: '8m ago', status: 'active'
  },
  {
    id: 'sd-002', type: 'Transcript Fraud Ring', target: 'Ellucian Banner Self-Service',
    records: 2_340, dataTypes: ['Transcripts', 'GPA Records', 'Degree Audits', 'Course History'],
    severity: 'high', ferpaViolation: '34 CFR 99.33 - Record Integrity',
    description: 'Compromised registrar credentials used to modify 2,340 transcripts across 3 semesters. GPA inflation and fabricated course completions sold on dark web markets for $500-$2,000 per transcript.',
    institution: 'Arizona State University', timestamp: '24m ago', status: 'investigating'
  },
  {
    id: 'sd-003', type: 'Financial Aid Theft', target: 'Oracle PeopleSoft Campus Solutions',
    records: 15_890, dataTypes: ['FAFSA Data', 'Tax Returns', 'Bank Accounts', 'Pell Grant IDs'],
    severity: 'critical', ferpaViolation: '34 CFR 99.31(a)(4) - Financial Aid Fraud',
    description: 'Threat actor redirected $3.2M in Pell Grant disbursements via modified direct deposit routing numbers. Automated bot submitted 15,890 fraudulent FAFSA corrections using stolen student identities.',
    institution: 'CUNY System (12 campuses)', timestamp: '1h ago', status: 'contained'
  },
  {
    id: 'sd-004', type: 'FAFSA Data Exfiltration', target: 'Federal Student Aid Integration API',
    records: 234_000, dataTypes: ['EFC Data', 'Parent Tax Info', 'Dependency Status', 'SAR Reports'],
    severity: 'critical', ferpaViolation: '34 CFR 99.35 - Audit & Compliance',
    description: 'Misconfigured API gateway between institutional FAFSA processing and Department of Education endpoint allowed bulk extraction of Student Aid Reports. Data appeared on Russian-language forums within 48 hours.',
    institution: 'California Community Colleges', timestamp: '2h ago', status: 'investigating'
  },
  {
    id: 'sd-005', type: 'Grade Manipulation Attack', target: 'Canvas LMS Gradebook API',
    records: 456, dataTypes: ['Final Grades', 'Assignment Scores', 'Rubric Data'],
    severity: 'high', ferpaViolation: '34 CFR 99.20 - Record Amendment',
    description: 'Student threat actor exploited OAuth token leakage in Canvas LTI integration to gain instructor-level gradebook access. Modified final grades for 456 students across STEM courses before detection.',
    institution: 'University of Michigan', timestamp: '3h ago', status: 'contained'
  },
  {
    id: 'sd-006', type: 'Directory Info Harvesting', target: 'LDAP Student Directory Service',
    records: 42_000, dataTypes: ['Student Emails', 'Phone Numbers', 'Enrollment Status', 'Major/Minor'],
    severity: 'medium', ferpaViolation: '34 CFR 99.37 - Directory Information Opt-Out Bypass',
    description: 'Automated scraper bypassed LDAP rate limiting to harvest directory info for 42,000 students including those who opted out of disclosure. Data used in targeted spear-phishing campaign impersonating financial aid office.',
    institution: 'Penn State University', timestamp: '4h ago', status: 'active'
  },
];

const RESEARCH_IP_THREATS: ResearchIPThreat[] = [
  {
    id: 'ri-001', researchArea: 'Semiconductor / Chip Design', institution: 'MIT Lincoln Laboratory',
    threatActor: 'APT41 (Winnti Group)', attribution: 'PRC / MSS',
    targetedData: 'GaN transistor fabrication processes & EDA tool configs',
    fundingSource: 'DARPA CHIPS Program', grantValue: '$14.2M',
    severity: 'critical', technique: 'Supply chain compromise via SolarWinds-style trojan in EDA software update',
    description: 'Nation-state actor implanted backdoor in Cadence Virtuoso update distributed to lab workstations. Exfiltrated 3 months of chip design files and simulation results for next-gen radar components.',
    status: 'active'
  },
  {
    id: 'ri-002', researchArea: 'Quantum Computing', institution: 'University of Chicago / Argonne',
    threatActor: 'APT40 (Leviathan)', attribution: 'PRC / Navy',
    targetedData: 'Quantum error correction algorithms & qubit coherence data',
    fundingSource: 'NSF Quantum Leap Challenge', grantValue: '$25M',
    severity: 'critical', technique: 'Compromised visiting researcher credentials + zero-day in Jupyter Hub',
    description: 'Visiting scholar account used to pivot from shared JupyterHub to isolated quantum lab network. Research data on topological qubit stability transferred via DNS tunneling to C2 in Singapore.',
    status: 'investigating'
  },
  {
    id: 'ri-003', researchArea: 'mRNA Vaccine Research', institution: 'Johns Hopkins Bloomberg SPH',
    threatActor: 'APT29 (Cozy Bear)', attribution: 'Russia / SVR',
    targetedData: 'Clinical trial data & lipid nanoparticle formulation specs',
    fundingSource: 'NIH / NIAID R01 Grant', grantValue: '$8.5M',
    severity: 'high', technique: 'Spear-phishing via fake Nature peer review invitation',
    description: 'Targeted researchers received fake manuscript review requests from spoofed Nature Medicine domain. Malicious Word doc deployed custom RAT that exfiltrated clinical trial datasets from shared OneDrive.',
    status: 'mitigated'
  },
  {
    id: 'ri-004', researchArea: 'Autonomous Vehicles / LiDAR', institution: 'Carnegie Mellon Robotics Institute',
    threatActor: 'Lazarus Group', attribution: 'DPRK / RGB',
    targetedData: 'LiDAR point cloud processing algorithms & SLAM implementations',
    fundingSource: 'DOD / DARPA RACER', grantValue: '$11.7M',
    severity: 'high', technique: 'Fake LinkedIn recruiter + trojanized coding challenge',
    description: 'Graduate researchers received LinkedIn messages from fake autonomous vehicle startup recruiter. Coding challenge zip contained modified VS Code extension that provided persistent access to lab Git repositories.',
    status: 'active'
  },
  {
    id: 'ri-005', researchArea: 'AI / Large Language Models', institution: 'Stanford HAI / NLP Group',
    threatActor: 'Unknown APT', attribution: 'Suspected PRC',
    targetedData: 'Training methodologies, RLHF datasets, model weight checkpoints',
    fundingSource: 'NSF AI Institute + Industry Partners', grantValue: '$20M',
    severity: 'critical', technique: 'Compromised PyPI package dependency in research pipeline',
    description: 'Typosquatted PyPI package "torch-utils-ext" installed on 47 lab machines harvested SSH keys and AWS credentials. Attacker accessed S3 buckets containing 3 months of training runs and evaluation datasets.',
    status: 'investigating'
  },
  {
    id: 'ri-006', researchArea: 'Nuclear Fusion / Plasma Physics', institution: 'Princeton Plasma Physics Lab',
    threatActor: 'Turla (Venomous Bear)', attribution: 'Russia / FSB',
    targetedData: 'Tokamak confinement simulation data & plasma diagnostics',
    fundingSource: 'DOE Office of Science', grantValue: '$32M',
    severity: 'high', technique: 'Watering hole attack on ITER collaboration portal',
    description: 'Compromised ITER international collaboration wiki used to deliver browser exploit targeting Firefox ESR on lab machines. Malware profiled research network and staged data for exfiltration via encrypted HTTPS to Tor.',
    status: 'mitigated'
  },
];

const CAMPUS_NETWORK_THREATS: CampusNetworkThreat[] = [
  {
    id: 'cn-001', type: 'IoT Device Storm', source: 'Residence Hall Network - Building C',
    affectedSystems: 'Core router, DHCP servers, DNS resolvers',
    severity: 'critical', protocol: 'mDNS / SSDP amplification',
    trafficVolume: '34 Gbps (2.1M pps)',
    description: 'Compromised smart TVs, gaming consoles, and IoT devices in dorm rooms recruited into Mirai variant botnet. Internal DDoS from 847 devices saturated campus backbone, causing 4-hour outage of all academic services.',
    campus: 'Ohio State University', status: 'active'
  },
  {
    id: 'cn-002', type: 'Open WiFi Exploitation', source: 'Library Public WiFi (Guest-Net)',
    affectedSystems: 'Student credentials, LMS sessions, email',
    severity: 'high', protocol: 'Evil Twin / KARMA attack',
    trafficVolume: '12,400 intercepted sessions',
    description: 'Rogue access point mimicking "UNC-Guest" WiFi deployed in Davis Library captured 12,400 student sessions over 3 weeks. Harvested 3,200 SSO credentials via captive portal phishing page identical to university Shibboleth login.',
    campus: 'UNC Chapel Hill', status: 'contained'
  },
  {
    id: 'cn-003', type: 'VPN Abuse by Threat Actor', source: 'GlobalProtect VPN Endpoint',
    affectedSystems: 'Research VLANs, HPC cluster, admin networks',
    severity: 'critical', protocol: 'SSL VPN + LDAP credential stuffing',
    trafficVolume: '890 GB exfiltrated over 6 weeks',
    description: 'Threat actor used credential stuffing against Palo Alto GlobalProtect VPN using breached passwords from LinkedIn dump. Gained split-tunnel access to research network and pivoted to HPC cluster containing export-controlled data.',
    campus: 'Georgia Institute of Technology', status: 'investigating'
  },
  {
    id: 'cn-004', type: 'eduroam Federation Attack', source: 'eduroam RADIUS Federation',
    affectedSystems: 'Cross-institutional authentication, roaming users',
    severity: 'high', protocol: 'EAP-TTLS / PAP downgrade',
    trafficVolume: '5,600 credential pairs harvested',
    description: 'Rogue RADIUS proxy inserted into eduroam federation exploited institutions still using PAP inner authentication. Intercepted credentials from roaming users across 23 participating universities during conference season.',
    campus: 'Multi-institution (Big Ten Conference)', status: 'active'
  },
  {
    id: 'cn-005', type: 'Cryptocurrency Mining Farm', source: 'Computer Science Lab Cluster',
    affectedSystems: 'GPU compute nodes, HVAC, power grid',
    severity: 'medium', protocol: 'Stratum mining protocol over TLS',
    trafficVolume: '4.2 kW excess power consumption',
    description: 'Graduate student installed XMRig cryptominer on 34 NVIDIA A100 GPU nodes in CS department HPC cluster. Mining activity consumed $28,000 in electricity over 2 months and caused thermal throttling affecting legitimate research workloads.',
    campus: 'UC Berkeley', status: 'contained'
  },
  {
    id: 'cn-006', type: 'DNS Tunneling Exfiltration', source: 'Student Health Services Network',
    affectedSystems: 'Health center EHR, counseling records, immunization DB',
    severity: 'critical', protocol: 'DNS TXT/CNAME record encoding',
    trafficVolume: '2.3 GB encoded in 14M DNS queries',
    description: 'Malware on Student Health Services workstation used DNS tunneling to exfiltrate FERPA/HIPAA protected health records. Custom DNS encoder split records across TXT queries to attacker-controlled nameserver, bypassing DLP controls.',
    campus: 'University of Virginia', status: 'investigating'
  },
];

const EDU_RANSOMWARE_EVENTS: EduRansomwareEvent[] = [
  {
    id: 'rw-001', institution: 'Los Angeles Unified School District',
    type: 'K-12', strain: 'Vice Society', ransom: '$2.5M BTC',
    studentsAffected: 640_000, systemsEncrypted: 'Student SIS, HR/Payroll, Email, Transportation routing',
    entryVector: 'Phishing email to district IT admin with fake DocuSign',
    recoveryDays: 45,
    description: 'Vice Society encrypted critical systems across 1,400+ schools. Student records, bus routing, and payroll systems offline for 6 weeks. District refused to pay ransom; 500GB of data leaked on dark web including student SSNs and psychological evaluations.',
    status: 'recovered'
  },
  {
    id: 'rw-002', institution: 'University of California San Francisco',
    type: 'Higher Ed', strain: 'Netwalker', ransom: '$3.0M BTC (paid $1.14M)',
    studentsAffected: 35_000, systemsEncrypted: 'School of Medicine research servers, epidemiology databases',
    entryVector: 'CVE in Accellion FTA file transfer appliance',
    recoveryDays: 21,
    description: 'Netwalker operators encrypted COVID-19 research data and epidemiological models critical to pandemic response. University negotiated ransom down from $3M to $1.14M and paid to recover irreplaceable research data.',
    status: 'recovered'
  },
  {
    id: 'rw-003', institution: 'Baltimore County Public Schools',
    type: 'K-12', strain: 'Ryuk', ransom: '$1.8M BTC',
    studentsAffected: 115_000, systemsEncrypted: 'Grading systems, virtual learning platform, email, network shares',
    entryVector: 'Trickbot malware via malicious attachment in staff email',
    recoveryDays: 67,
    description: 'Attack launched on eve of Thanksgiving break encrypted all Windows systems. Remote learning for 115,000 students disrupted for 2+ months. Teachers lost gradebooks and lesson plans. District spent $9.7M on recovery without paying ransom.',
    status: 'recovered'
  },
  {
    id: 'rw-004', institution: 'Howard University',
    type: 'Higher Ed', strain: 'BlackCat/ALPHV v3', ransom: '$4.2M Monero',
    studentsAffected: 9_600, systemsEncrypted: 'ERP (Ellucian Banner), WiFi auth, research drives, email',
    entryVector: 'Compromised service account via exposed API endpoint',
    recoveryDays: 34,
    description: 'ALPHV operators encrypted university ERP and authentication infrastructure. Classes cancelled for 1 week. WiFi, email, and student portal unavailable for 5 weeks. Financial aid disbursements delayed affecting 6,200 students receiving federal aid.',
    status: 'recovered'
  },
  {
    id: 'rw-005', institution: 'Tucson Unified School District',
    type: 'K-12', strain: 'Royal Ransomware', ransom: '$1.1M BTC',
    studentsAffected: 47_000, systemsEncrypted: 'Student records, special education IEPs, HR, financial systems',
    entryVector: 'Compromised VPN credentials (no MFA)',
    recoveryDays: 0,
    description: 'Royal ransomware actively encrypting district systems. Special education records, IEPs, and 504 plans for 4,200 students with disabilities now inaccessible. Manual paper processes implemented. FBI and CISA providing on-site incident response.',
    status: 'active'
  },
  {
    id: 'rw-006', institution: 'Des Moines Area Community College',
    type: 'Community College', strain: 'LockBit 3.0', ransom: '$750K BTC',
    studentsAffected: 22_000, systemsEncrypted: 'Registration system, financial aid portal, LMS (Blackboard)',
    entryVector: 'RDP brute force on exposed management interface',
    recoveryDays: 28,
    description: 'LockBit affiliates encrypted registration and financial aid systems during peak enrollment period. 3,400 students unable to register for spring semester. Financial aid processing halted for 4 weeks. College deployed backup LMS within 72 hours.',
    status: 'negotiating'
  },
];

export default function EducationThreats() {
  const [tab, setTab] = useState<'student' | 'research' | 'campus' | 'ransomware'>('student');
  const [pulsePhase, setPulsePhase] = useState(0);

  useEffect(() => {
    const iv = setInterval(() => setPulsePhase(p => p + 1), 1500);
    return () => clearInterval(iv);
  }, []);

  const TABS = [
    { id: 'student' as const, label: 'Student Data', icon: Users },
    { id: 'research' as const, label: 'Research IP', icon: Globe },
    { id: 'campus' as const, label: 'Campus Network', icon: Wifi },
    { id: 'ransomware' as const, label: 'Ransomware Tracker', icon: Lock },
  ];

  const severityBadge = (severity: 'critical' | 'high' | 'medium') => {
    const styles = {
      critical: 'bg-red-500/10 text-red-400 border-red-500/30',
      high: 'bg-orange-500/10 text-orange-400 border-orange-500/30',
      medium: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
    };
    return `px-2 py-0.5 text-[10px] rounded-full border ${styles[severity]}`;
  };

  const statusBadge = (status: string) => {
    const styles: Record<string, string> = {
      active: 'bg-red-500/10 text-red-400 border-red-500/20',
      contained: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
      mitigated: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
      investigating: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
      blocked: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
      monitoring: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
      recovered: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
      negotiating: 'bg-red-500/10 text-red-400 border-red-500/20',
    };
    return `px-2 py-0.5 text-[10px] rounded border ${styles[status] || 'bg-slate-500/10 text-slate-400 border-slate-500/20'}`;
  };

  const k12Count = EDU_RANSOMWARE_EVENTS.filter(e => e.type === 'K-12').length;
  const higherEdCount = EDU_RANSOMWARE_EVENTS.filter(e => e.type === 'Higher Ed' || e.type === 'Community College').length;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500/20 to-emerald-500/20 border border-blue-500/30 flex items-center justify-center">
            <BookOpen size={20} className="text-blue-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Education Sector Threat Intelligence</h2>
            <p className="text-xs text-slate-500">FERPA compliance, research IP protection, campus network security</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/30">
            <BookOpen size={12} className="text-blue-400 animate-pulse" />
            <span className="text-[10px] font-bold font-mono text-blue-400 tracking-wider">FERPA WATCH</span>
          </span>
          <span className="px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[10px] font-mono font-bold text-emerald-400 tracking-wider">0xDSI EDU</span>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-5 gap-3">
        {[
          { l: 'Student Records at Risk', v: '381,122', c: 'text-red-400', bg: 'from-red-500/5 to-red-500/0' },
          { l: 'Research IP Incidents', v: '6', c: 'text-blue-400', bg: 'from-blue-500/5 to-blue-500/0' },
          { l: 'Campus Threats Active', v: '14', c: 'text-amber-400', bg: 'from-amber-500/5 to-amber-500/0' },
          { l: 'Institutions Targeted', v: '47', c: 'text-emerald-400', bg: 'from-emerald-500/5 to-emerald-500/0' },
          { l: 'Avg Recovery (days)', v: '39', c: 'text-cyan-400', bg: 'from-cyan-500/5 to-cyan-500/0' },
        ].map((s, i) => (
          <div key={i} className={`bg-gradient-to-b ${s.bg} border border-[#1e293b] rounded-xl p-3 text-center`}>
            <div className="text-[10px] text-slate-500">{s.l}</div>
            <div className={`text-2xl font-bold ${s.c}`}>{s.v}</div>
          </div>
        ))}
      </div>

      {/* Tab Navigation */}
      <div className="flex items-center gap-1 border-b border-[#1e293b]">
        {TABS.map(t => {
          const Icon = t.icon;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium transition-all border-b-2 ${tab === t.id ? 'text-blue-300 border-blue-400 bg-blue-500/5' : 'text-slate-500 border-transparent hover:text-slate-300'}`}>
              <Icon size={14} />{t.label}
            </button>
          );
        })}
      </div>

      {/* Student Data Tab */}
      {tab === 'student' && (
        <div className="space-y-3">
          {STUDENT_DATA_THREATS.map(d => (
            <div key={d.id} className={`bg-[#0b0f1e] border rounded-xl p-4 ${d.severity === 'critical' ? 'border-red-500/30' : 'border-[#1e293b]'}`}>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <Users size={14} className="text-blue-400" />
                    <span className="text-sm font-bold text-white">{d.type}</span>
                    <span className="text-[10px] text-slate-500">{d.institution}</span>
                    <span className={severityBadge(d.severity)}>{d.severity}</span>
                    <span className={statusBadge(d.status)}>{d.status}</span>
                  </div>
                  <div className="text-xs text-slate-500 mb-1">Target: {d.target}</div>
                  <p className="text-xs text-slate-400 leading-relaxed">{d.description}</p>
                  <div className="mt-2 flex items-center gap-3 text-[10px] flex-wrap">
                    <span className="text-red-400 font-semibold">{d.records.toLocaleString()} records exposed</span>
                    <span className="text-amber-400">{d.ferpaViolation}</span>
                    <span className="text-slate-500">{d.timestamp}</span>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {d.dataTypes.map(dt => (
                      <span key={dt} className="px-2 py-0.5 text-[10px] rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">{dt}</span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Research IP Tab */}
      {tab === 'research' && (
        <div className="space-y-3">
          {RESEARCH_IP_THREATS.map(r => (
            <div key={r.id} className={`bg-[#0b0f1e] border rounded-xl p-4 ${r.severity === 'critical' ? 'border-red-500/30' : 'border-[#1e293b]'}`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <Globe size={14} className="text-emerald-400" />
                  <span className="text-sm font-bold text-white">{r.researchArea}</span>
                  <span className="text-[10px] text-slate-500">{r.institution}</span>
                  <span className={severityBadge(r.severity)}>{r.severity}</span>
                </div>
                <span className={statusBadge(r.status)}>{r.status}</span>
              </div>
              <div className="grid grid-cols-2 gap-3 text-[11px] mb-2">
                <div><span className="text-slate-500">Threat Actor:</span> <span className="text-red-400 font-mono font-semibold">{r.threatActor}</span></div>
                <div><span className="text-slate-500">Attribution:</span> <span className="text-amber-400">{r.attribution}</span></div>
                <div><span className="text-slate-500">Funding:</span> <span className="text-slate-300">{r.fundingSource}</span></div>
                <div><span className="text-slate-500">Grant Value:</span> <span className="text-emerald-400 font-bold">{r.grantValue}</span></div>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed mb-2">{r.description}</p>
              <div className="flex items-center gap-3 text-[10px] flex-wrap">
                <span className="px-2 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20">
                  <Eye size={10} className="inline mr-1" />{r.targetedData}
                </span>
              </div>
              <div className="mt-2 px-3 py-2 bg-blue-500/5 border border-blue-500/20 rounded-lg">
                <span className="text-[10px] text-blue-400 font-semibold">TECHNIQUE: </span>
                <span className="text-[10px] text-blue-300">{r.technique}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Campus Network Tab */}
      {tab === 'campus' && (
        <div className="space-y-3">
          {CAMPUS_NETWORK_THREATS.map(n => (
            <div key={n.id} className={`bg-[#0b0f1e] border rounded-xl p-4 ${n.severity === 'critical' ? 'border-red-500/30' : 'border-[#1e293b]'}`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <Wifi size={14} className="text-cyan-400" />
                  <span className="text-sm font-bold text-white">{n.type}</span>
                  <span className="text-[10px] text-slate-500">{n.campus}</span>
                  <span className={severityBadge(n.severity)}>{n.severity}</span>
                </div>
                <span className={statusBadge(n.status)}>{n.status}</span>
              </div>
              <div className="grid grid-cols-2 gap-3 text-[11px] mb-2">
                <div><span className="text-slate-500">Source:</span> <span className="text-slate-300">{n.source}</span></div>
                <div><span className="text-slate-500">Protocol:</span> <span className="text-cyan-400 font-mono">{n.protocol}</span></div>
                <div><span className="text-slate-500">Affected:</span> <span className="text-amber-400">{n.affectedSystems}</span></div>
                <div><span className="text-slate-500">Traffic:</span> <span className="text-red-400 font-bold">{n.trafficVolume}</span></div>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">{n.description}</p>
            </div>
          ))}
        </div>
      )}

      {/* Ransomware Tracker Tab */}
      {tab === 'ransomware' && (
        <div className="space-y-4">
          {/* K-12 vs Higher Ed comparison bar */}
          <div className="bg-[#0b0f1e] border border-[#1e293b] rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-white">Sector Breakdown</span>
              <div className="flex items-center gap-4 text-[10px]">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-400"></span> K-12 ({k12Count})</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-400"></span> Higher Ed / CC ({higherEdCount})</span>
              </div>
            </div>
            <div className="h-3 bg-slate-800 rounded-full overflow-hidden flex">
              <div className="h-full bg-gradient-to-r from-orange-500 to-orange-400" style={{ width: `${(k12Count / EDU_RANSOMWARE_EVENTS.length) * 100}%` }} />
              <div className="h-full bg-gradient-to-r from-blue-500 to-blue-400" style={{ width: `${(higherEdCount / EDU_RANSOMWARE_EVENTS.length) * 100}%` }} />
            </div>
            <div className="grid grid-cols-3 gap-3 mt-3 text-center">
              <div>
                <div className="text-[10px] text-slate-500">Avg K-12 Recovery</div>
                <div className="text-sm font-bold text-orange-400">
                  {Math.round(EDU_RANSOMWARE_EVENTS.filter(e => e.type === 'K-12' && e.recoveryDays > 0).reduce((a, b) => a + b.recoveryDays, 0) / EDU_RANSOMWARE_EVENTS.filter(e => e.type === 'K-12' && e.recoveryDays > 0).length)} days
                </div>
              </div>
              <div>
                <div className="text-[10px] text-slate-500">Avg Higher Ed Recovery</div>
                <div className="text-sm font-bold text-blue-400">
                  {Math.round(EDU_RANSOMWARE_EVENTS.filter(e => (e.type === 'Higher Ed' || e.type === 'Community College') && e.recoveryDays > 0).reduce((a, b) => a + b.recoveryDays, 0) / EDU_RANSOMWARE_EVENTS.filter(e => (e.type === 'Higher Ed' || e.type === 'Community College') && e.recoveryDays > 0).length)} days
                </div>
              </div>
              <div>
                <div className="text-[10px] text-slate-500">Total Students Impacted</div>
                <div className="text-sm font-bold text-red-400">
                  {EDU_RANSOMWARE_EVENTS.reduce((a, b) => a + b.studentsAffected, 0).toLocaleString()}
                </div>
              </div>
            </div>
          </div>

          {/* Individual ransomware events */}
          {EDU_RANSOMWARE_EVENTS.map(r => (
            <div key={r.id} className={`bg-[#0b0f1e] border rounded-xl p-5 ${r.status === 'active' ? 'border-red-500/40' : 'border-[#1e293b]'}`}>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <Lock size={14} className="text-red-400" />
                    <h4 className="text-sm font-bold text-white">{r.institution}</h4>
                    <span className={`px-2 py-0.5 text-[10px] rounded border ${r.type === 'K-12' ? 'bg-orange-500/10 text-orange-400 border-orange-500/20' : r.type === 'Community College' ? 'bg-purple-500/10 text-purple-400 border-purple-500/20' : 'bg-blue-500/10 text-blue-400 border-blue-500/20'}`}>{r.type}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-lg font-bold text-red-400">{r.ransom}</span>
                  <span className={statusBadge(r.status)}>{r.status}</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-[11px] mb-2">
                <div><span className="text-slate-500">Strain:</span> <span className="text-red-400 font-mono">{r.strain}</span></div>
                <div><span className="text-slate-500">Entry Vector:</span> <span className="text-amber-400">{r.entryVector}</span></div>
                <div><span className="text-slate-500">Systems:</span> <span className="text-slate-300">{r.systemsEncrypted}</span></div>
                <div><span className="text-slate-500">Students Affected:</span> <span className="text-slate-300">{r.studentsAffected.toLocaleString()}</span></div>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed mb-2">{r.description}</p>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1">
                  <Clock size={12} className="text-cyan-400" />
                  <span className="text-[10px] text-cyan-400 font-semibold">
                    {r.recoveryDays === 0 ? 'ONGOING - NOT RECOVERED' : `Recovery: ${r.recoveryDays} days`}
                  </span>
                </div>
                {r.recoveryDays > 0 && (
                  <div className="flex-1 max-w-[200px]">
                    <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${r.recoveryDays <= 21 ? 'bg-emerald-500' : r.recoveryDays <= 35 ? 'bg-amber-500' : 'bg-red-500'}`}
                        style={{ width: `${Math.min(100, (r.recoveryDays / 70) * 100)}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
