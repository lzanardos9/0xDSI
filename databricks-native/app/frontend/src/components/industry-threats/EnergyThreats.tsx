import { useState, useEffect } from 'react';
import {
  Zap, Activity, AlertTriangle, Shield, Server, Wifi, Lock,
  Radio, Gauge, Thermometer, Eye, Clock, Database, GitBranch
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────

interface SCADAThreat {
  id: string;
  target: string;
  protocol: string;
  attackType: string;
  severity: 'critical' | 'high' | 'medium';
  cve: string;
  description: string;
  gridImpact: string;
  attribution: string;
  affectedAssets: number;
  status: 'active' | 'mitigated' | 'investigating';
  timestamp: string;
}

interface PipelineThreat {
  id: string;
  segment: string;
  protocol: string;
  attackVector: string;
  severity: 'critical' | 'high' | 'medium';
  description: string;
  operationalImpact: string;
  location: string;
  milePost: string;
  status: 'active' | 'contained' | 'monitoring';
  malwareFamily: string;
  timestamp: string;
}

interface SmartMeterThreat {
  id: string;
  meterType: string;
  vendor: string;
  attackType: string;
  severity: 'critical' | 'high' | 'medium';
  cve: string;
  description: string;
  affectedMeters: number;
  revenueImpact: string;
  region: string;
  status: 'active' | 'patched' | 'investigating';
  timestamp: string;
}

interface NERCViolation {
  id: string;
  standard: string;
  requirement: string;
  entity: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  penalty: string;
  description: string;
  dueDate: string;
  status: 'open' | 'remediation' | 'closed';
}

// ── Mock Data ──────────────────────────────────────────────────────────────

const SCADA_THREATS: SCADAThreat[] = [
  {
    id: 'scada-001',
    target: 'Substation 14 Bay Controller',
    protocol: 'IEC 61850 GOOSE',
    attackType: 'GOOSE Message Spoofing',
    severity: 'critical',
    cve: 'CVE-2026-52341',
    description: 'CRASHOVERRIDE/Industroyer2 variant detected injecting forged GOOSE frames into the station bus. Malicious GOOSE messages flip circuit breaker states by overriding stNum/sqNum sequence counters, bypassing IED authentication. Capable of triggering cascading relay trips across 345kV transmission line.',
    gridImpact: 'Cascading blackout risk -- 2.1M customers across 3 balancing authorities',
    attribution: 'SANDWORM (GRU Unit 74455)',
    affectedAssets: 47,
    status: 'active',
    timestamp: '2m ago',
  },
  {
    id: 'scada-002',
    target: 'EMS/SCADA Master Station',
    protocol: 'IEC 60870-5-104',
    attackType: 'Man-in-the-Middle Injection',
    severity: 'critical',
    cve: 'CVE-2026-48872',
    description: 'ARP poisoning on OT VLAN enables IEC 104 ASDU manipulation. Attacker is injecting false measurement values (ASDU Type 13 - M_ME_NC_1) to mask real-time frequency deviations. Control center displays nominal 60.00Hz while actual grid frequency drifts to 59.82Hz, approaching UFLS threshold.',
    gridImpact: 'Under-Frequency Load Shedding cascade -- potential 8GW generation loss',
    attribution: 'ELECTRUM (Linked to Sandworm)',
    affectedAssets: 12,
    status: 'investigating',
    timestamp: '8m ago',
  },
  {
    id: 'scada-003',
    target: 'DNP3 Outstation Cluster (Region 7)',
    protocol: 'DNP3 Secure Auth v5',
    attackType: 'Authentication Bypass',
    severity: 'critical',
    cve: 'CVE-2026-51003',
    description: 'Vulnerability in DNP3 Secure Authentication v5 HMAC challenge-response allows replay of session key change messages. Attacker gained CRITICAL (Level 4) authority, issuing direct-operate commands to open 138kV disconnect switches. Matches PIPEDREAM/INCONTROLLER ICS toolkit signatures.',
    gridImpact: 'Forced islanding of 3 generating stations -- 1,400MW at risk',
    attribution: 'CHERNOVITE (PIPEDREAM/INCONTROLLER)',
    affectedAssets: 23,
    status: 'active',
    timestamp: '14m ago',
  },
  {
    id: 'scada-004',
    target: 'SEL-751 Feeder Protection Relay',
    protocol: 'IEC 61850 MMS',
    attackType: 'Relay Configuration Tampering',
    severity: 'high',
    cve: 'CVE-2026-44917',
    description: 'MMS file transfer exploit overwrites SEL relay setting groups, modifying overcurrent pickup values from 600A to 6000A. Protection coordination completely defeated -- fault current will flow uninterrupted through 69kV feeders. Technique mirrors Industroyer OPC DA component.',
    gridImpact: 'Equipment damage from uncleared faults -- transformer replacement 18-24 months',
    attribution: 'Unknown APT (Industroyer TTP overlap)',
    affectedAssets: 8,
    status: 'mitigated',
    timestamp: '34m ago',
  },
  {
    id: 'scada-005',
    target: 'AGC/LFC System Interface',
    protocol: 'ICCP/TASE.2',
    attackType: 'Automatic Generation Control Manipulation',
    severity: 'critical',
    cve: 'CVE-2026-53287',
    description: 'Compromised ICCP bilateral table injects fraudulent ACE (Area Control Error) signals into AGC loop. False ACE values force generators to ramp down simultaneously while demand increases. 45-second attack window sufficient to destabilize interconnection frequency.',
    gridImpact: 'Multi-area frequency instability -- risk of interconnection separation',
    attribution: 'VOLT TYPHOON (PRC MSS)',
    affectedAssets: 5,
    status: 'investigating',
    timestamp: '1h ago',
  },
  {
    id: 'scada-006',
    target: 'Substation RTU Fleet (GE D25)',
    protocol: 'Modbus TCP',
    attackType: 'Firmware Rootkit Persistence',
    severity: 'high',
    cve: 'CVE-2026-46550',
    description: 'Custom firmware implant injected via Modbus function code 90 (vendor diagnostic) persists across reboots in GE D25 RTUs. Implant intercepts and modifies analog telemetry before transmission to SCADA master. 17 RTUs confirmed infected across Eastern Interconnection.',
    gridImpact: 'Blind spot in grid visibility -- operators making decisions on spoofed data',
    attribution: 'KAMACITE (GRU)',
    affectedAssets: 17,
    status: 'active',
    timestamp: '2h ago',
  },
  {
    id: 'scada-007',
    target: 'Wind Farm SCADA Controller',
    protocol: 'OPC UA',
    attackType: 'Load Manipulation Attack',
    severity: 'medium',
    cve: 'CVE-2026-41280',
    description: 'OPC UA session hijacking via stolen X.509 certificate allows pitch angle modification on 120 wind turbines. Coordinated blade feathering reduces output by 340MW during peak demand. Attack timed to coincide with gas pipeline maintenance window for maximum impact.',
    gridImpact: 'Generation shortfall during peak -- rolling blackouts possible',
    attribution: 'Unattributed (state-sponsored indicators)',
    affectedAssets: 120,
    status: 'mitigated',
    timestamp: '3h ago',
  },
];

const PIPELINE_THREATS: PipelineThreat[] = [
  {
    id: 'pipe-001',
    segment: 'Gulf Coast Mainline (36" NPS)',
    protocol: 'MODBUS RTU',
    attackVector: 'Serial Line Injection via RF',
    severity: 'critical',
    description: 'Rogue radio transmitter intercepting and modifying MODBUS RTU frames on 900MHz SCADA radio link. Holding register writes (FC 0x06) changing compressor setpoints from 850 PSI to 1,450 PSI -- exceeding MAOP by 70%. Safety valve SCADA alarms simultaneously suppressed via coil writes.',
    operationalImpact: 'Pipeline rupture risk -- 42" mainline serving 4 LNG export terminals',
    location: 'Houston Ship Channel Corridor',
    milePost: 'MP 247.3 - MP 312.8',
    status: 'active',
    malwareFamily: 'PIPEDREAM/MOUSEHOLE',
    timestamp: '5m ago',
  },
  {
    id: 'pipe-002',
    segment: 'Compressor Station CS-14',
    protocol: 'EtherNet/IP (CIP)',
    attackVector: 'IT/OT Pivot via Historian',
    severity: 'critical',
    description: 'Lateral movement from corporate historian to OT network through misconfigured firewall rule. Attacker deployed custom PLC payload targeting Allen-Bradley ControlLogix L82ES. Modified compressor surge control logic -- anti-surge valve response time changed from 200ms to 5000ms. Compressor surge will cause catastrophic mechanical failure.',
    operationalImpact: 'Compressor destruction -- $40M replacement, 6-month outage for 2 BCF/day pipeline',
    location: 'Permian Basin Hub',
    milePost: 'CS-14 (Lat: 31.82, Lon: -102.34)',
    status: 'contained',
    malwareFamily: 'INCONTROLLER/BADOMEN',
    timestamp: '22m ago',
  },
  {
    id: 'pipe-003',
    segment: 'NGL Fractionation Plant',
    protocol: 'HART Protocol',
    attackVector: 'HART Command Injection',
    severity: 'high',
    description: 'Wireless HART gateway compromise enables injection of HART universal commands to recalibrate pressure transmitters on debutanizer column. Zero-point shifted by +45 PSI -- actual column pressure 15% higher than displayed. Mirrors technique from 2021 Oldsmar water treatment attack methodology applied to petrochemical.',
    operationalImpact: 'Overpressure event risk in fractionation column -- explosion/fire hazard',
    location: 'Mont Belvieu, TX',
    milePost: 'Plant Section D (Fractionation)',
    status: 'active',
    malwareFamily: 'Custom tooling',
    timestamp: '45m ago',
  },
  {
    id: 'pipe-004',
    segment: 'Offshore Platform FPSO-7',
    protocol: 'PROFIBUS DP',
    attackVector: 'Safety Instrumented System Override',
    severity: 'critical',
    description: 'TRITON/TRISIS-derivative malware targeting Schneider Triconex SIS on offshore platform. Firmware payload replaces safety logic for ESD (Emergency Shutdown) and F&G (Fire and Gas) systems. SIS reports healthy state while actual safety functions disabled. Matches XENOTIME actor TTP.',
    operationalImpact: 'Loss of safety shutdown -- 100,000 bbl/day production platform, crew of 180',
    location: 'Gulf of Mexico, Deepwater',
    milePost: 'FPSO-7 (Block GC-640)',
    status: 'active',
    malwareFamily: 'TRITON/TRISIS v3',
    timestamp: '1h ago',
  },
  {
    id: 'pipe-005',
    segment: 'Cross-Country Pipeline (24" Crude)',
    protocol: 'DNP3 over Satellite',
    attackVector: 'Leak Detection Sensor Spoofing',
    severity: 'high',
    description: 'Satellite communication link compromise enables injection of false negative-pressure-wave data into Computational Pipeline Monitoring (CPM) system. Real-time model now blind to actual leak events. Simultaneously, valve position feedback spoofed to show closed state while MOVs remain open. Colonial Pipeline-style ransomware pre-positioning detected.',
    operationalImpact: 'Undetected crude oil spill risk -- 450,000 bbl/day pipeline crossing 6 watersheds',
    location: 'Cushing, OK to Patoka, IL',
    milePost: 'MP 0 - MP 694',
    status: 'monitoring',
    malwareFamily: 'DarkSide variant + custom OT',
    timestamp: '2h ago',
  },
  {
    id: 'pipe-006',
    segment: 'LNG Terminal Jetty Controls',
    protocol: 'Foundation Fieldbus H1',
    attackVector: 'Loading Arm Manipulation',
    severity: 'high',
    description: 'Foundation Fieldbus segment compromise via rogue device on H1 bus. Manipulating LNG loading arm position feedback and ESD interlock signals. Could force loading arm disconnect during active transfer, causing LNG spill. Cryogenic hazard from -162C methane release at marine terminal.',
    operationalImpact: 'LNG spill/vapor cloud risk -- Sabine Pass terminal, 4 liquefaction trains',
    location: 'Sabine Pass, LA',
    milePost: 'Jetty 2, Loading Arms 3-4',
    status: 'contained',
    malwareFamily: 'Unknown (nation-state)',
    timestamp: '3h ago',
  },
];

const SMART_METER_THREATS: SmartMeterThreat[] = [
  {
    id: 'ami-001',
    meterType: 'Itron OpenWay Riva',
    vendor: 'Itron',
    attackType: 'Firmware Downgrade Attack',
    severity: 'critical',
    cve: 'CVE-2026-55102',
    description: 'Exploiting unsigned firmware update mechanism to push modified metrology firmware. Tampered code reduces reported kWh by 40% while actual consumption unchanged. Attack propagates via NAN mesh -- single compromised meter can reflash neighbors using IPv6 link-local multicast. 12,000 meters reflashed in 48 hours.',
    affectedMeters: 12_000,
    revenueImpact: '$2.4M/month in unrecovered energy',
    region: 'Southeast Distribution (GA, SC, NC)',
    status: 'active',
    timestamp: '10m ago',
  },
  {
    id: 'ami-002',
    meterType: 'Landis+Gyr Revelo',
    vendor: 'Landis+Gyr',
    attackType: 'NAN Mesh Routing Attack',
    severity: 'critical',
    cve: 'CVE-2026-53847',
    description: 'RPL (Routing Protocol for Low-Power Networks) poisoning attack on 802.15.4g mesh network. Attacker injects false DODAG Information Objects to redirect all meter telemetry through rogue node. Man-in-the-middle position allows selective modification of interval data and demand response signals. Sinkhole attack affecting entire mesh segment.',
    affectedMeters: 34_500,
    revenueImpact: '$890K in billing discrepancies',
    region: 'Midwest ISO Territory',
    status: 'investigating',
    timestamp: '25m ago',
  },
  {
    id: 'ami-003',
    meterType: 'Aclara I-210+c',
    vendor: 'Hubbell/Aclara',
    attackType: 'Remote Disconnect Abuse',
    severity: 'critical',
    cve: 'CVE-2026-49331',
    description: 'Authentication bypass in DLMS/COSEM management interface allows unauthorized remote disconnect commands. Attacker can mass-disconnect meters via head-end system compromise. Coordinated disconnection of 50,000+ meters during extreme heat event would cause cascading demand destruction and grid instability.',
    affectedMeters: 50_000,
    revenueImpact: 'Grid stability impact -- lives at risk',
    region: 'ERCOT (Texas)',
    status: 'active',
    timestamp: '38m ago',
  },
  {
    id: 'ami-004',
    meterType: 'Honeywell Elster A3',
    vendor: 'Honeywell',
    attackType: 'Demand Response Manipulation',
    severity: 'high',
    cve: 'CVE-2026-47763',
    description: 'Compromised OpenADR 2.0b VEN (Virtual End Node) client in meter firmware accepts and amplifies false DR events. Injecting fabricated DR signals causes simultaneous air conditioning shutdown across 28,000 commercial meters, followed by coordinated restart creating demand spike. Weaponized demand response for grid destabilization.',
    affectedMeters: 28_000,
    revenueImpact: '$12M peak demand penalty charges',
    region: 'PJM Interconnection (Mid-Atlantic)',
    status: 'investigating',
    timestamp: '1h ago',
  },
  {
    id: 'ami-005',
    meterType: 'Kamstrup OMNIPOWER',
    vendor: 'Kamstrup',
    attackType: 'Cryptographic Key Extraction',
    severity: 'high',
    cve: 'CVE-2026-50219',
    description: 'Side-channel power analysis attack extracts AES-128 encryption keys from meter SoC via electromagnetic emanation. Recovered keys enable decryption and modification of all DLMS/COSEM communication. Complete loss of data integrity and confidentiality for utility AMI network. Published as proof-of-concept by university researchers.',
    affectedMeters: 8_500,
    revenueImpact: '$340K in energy theft identified',
    region: 'New England ISO',
    status: 'patched',
    timestamp: '2h ago',
  },
  {
    id: 'ami-006',
    meterType: 'GE Kv2c (C2SOD)',
    vendor: 'GE Grid Solutions',
    attackType: 'Optical Port Exploitation',
    severity: 'medium',
    cve: 'CVE-2026-44890',
    description: 'ANSI C12.18 optical port accepts unauthenticated table reads/writes. Attacker with physical access reads Table 23 (Current Register Data) and writes Table 64 (Load Profile) to erase evidence of energy theft. Custom optical probe with Bluetooth enables drive-by extraction of billing data from meter sockets. 230 meters compromised in targeted cannabis grow operation ring.',
    affectedMeters: 230,
    revenueImpact: '$1.8M annual theft from grow operations',
    region: 'Pacific Northwest (OR, WA)',
    status: 'investigating',
    timestamp: '4h ago',
  },
  {
    id: 'ami-007',
    meterType: 'Sensus FlexNet',
    vendor: 'Xylem/Sensus',
    attackType: 'RF Network Jamming + Spoofing',
    severity: 'high',
    cve: 'CVE-2026-52004',
    description: 'Software-defined radio attack on 900MHz FlexNet RF network. Selective jamming of meter reads combined with spoofed replacement data. Billing system receives fabricated low-consumption reads while actual usage is 3-5x higher. Attack coordinated across industrial customers for maximum revenue impact. SDR hardware costs under $300.',
    affectedMeters: 4_200,
    revenueImpact: '$560K/month industrial energy theft',
    region: 'CAISO (California)',
    status: 'active',
    timestamp: '5h ago',
  },
];

const NERC_VIOLATIONS: NERCViolation[] = [
  {
    id: 'nerc-001',
    standard: 'CIP-005-7',
    requirement: 'R1 - Electronic Security Perimeter',
    entity: 'Regional Transmission Org',
    severity: 'critical',
    penalty: '$1,200,000',
    description: 'ESP boundary not enforced -- 14 OT devices directly routable from corporate network. Missing IDS/IPS at ESP access points. EACMS logging gaps of 72+ hours. Interactive Remote Access sessions without multi-factor authentication.',
    dueDate: '2026-06-15',
    status: 'open',
  },
  {
    id: 'nerc-002',
    standard: 'CIP-007-6',
    requirement: 'R2 - Security Patch Management',
    entity: 'Generation Owner/Operator',
    severity: 'critical',
    penalty: '$890,000',
    description: 'Critical security patches for BES Cyber Assets not applied within 35 calendar days. 47 high-impact BCS running Windows Server 2016 with 128 unpatched CVEs. Mitigation plans expired without implementation. Patch assessment documentation incomplete for 3 consecutive quarters.',
    dueDate: '2026-05-01',
    status: 'remediation',
  },
  {
    id: 'nerc-003',
    standard: 'CIP-010-4',
    requirement: 'R1 - Configuration Change Management',
    entity: 'Transmission Owner',
    severity: 'high',
    penalty: '$650,000',
    description: 'Baseline configurations not established for 23 Protected Cyber Assets. Configuration changes made without authorization or documentation. No vulnerability assessment performed after significant changes. Transient Cyber Assets connected without security verification.',
    dueDate: '2026-07-30',
    status: 'open',
  },
  {
    id: 'nerc-004',
    standard: 'CIP-013-2',
    requirement: 'R1 - Supply Chain Risk Management',
    entity: 'Balancing Authority',
    severity: 'high',
    penalty: '$475,000',
    description: 'Supply chain risk management plan missing vendor risk assessments for 8 critical OT suppliers. No verification of software integrity for SCADA system updates. Vendor remote access not logged or monitored. SolarWinds-style supply chain attack vector unaddressed.',
    dueDate: '2026-08-15',
    status: 'remediation',
  },
  {
    id: 'nerc-005',
    standard: 'CIP-003-8',
    requirement: 'R2 - Cyber Security Policy',
    entity: 'Distribution Provider',
    severity: 'medium',
    penalty: '$180,000',
    description: 'Cyber security policy not reviewed and approved by CIP Senior Manager within 15 calendar months. Delegation of authority documents expired. Personnel risk assessment incomplete for 12 employees with BES Cyber System access. Security awareness training records missing for Q3-Q4.',
    dueDate: '2026-09-01',
    status: 'remediation',
  },
  {
    id: 'nerc-006',
    standard: 'CIP-011-3',
    requirement: 'R1 - Information Protection',
    entity: 'Reliability Coordinator',
    severity: 'high',
    penalty: '$725,000',
    description: 'BES Cyber System Information (BCSI) found on unprotected SharePoint site accessible to 340 unauthorized users. Network diagrams, firewall rules, and authentication credentials for 12 substations exposed. BCSI storage locations not included in information protection program. No BCSI access revocation for 45 terminated employees.',
    dueDate: '2026-05-30',
    status: 'open',
  },
  {
    id: 'nerc-007',
    standard: 'CIP-008-6',
    requirement: 'R1 - Cyber Security Incident Response',
    entity: 'Generation Owner',
    severity: 'medium',
    penalty: '$320,000',
    description: 'Incident response plan not tested within 15 calendar months. No documented roles and responsibilities for Cyber Security Incident response team. EMS/SCADA compromise scenario not included in IRP. Notification to ES-ISAC not made within 1 hour for reportable incident. Lessons learned from 2025 incident not incorporated.',
    dueDate: '2026-10-15',
    status: 'open',
  },
];

// ── Component ──────────────────────────────────────────────────────────────

export default function EnergyThreats() {
  const [tab, setTab] = useState<'scada' | 'pipeline' | 'meters' | 'nerc'>('scada');
  const [pulsePhase, setPulsePhase] = useState(0);

  useEffect(() => {
    const iv = setInterval(() => setPulsePhase(p => p + 1), 1500);
    return () => clearInterval(iv);
  }, []);

  const TABS = [
    { id: 'scada' as const, label: 'Grid SCADA Threats', icon: Zap },
    { id: 'pipeline' as const, label: 'Pipeline Security', icon: GitBranch },
    { id: 'meters' as const, label: 'Smart Meter Fraud', icon: Gauge },
    { id: 'nerc' as const, label: 'NERC CIP Compliance', icon: Shield },
  ];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-emerald-500/20 to-green-500/20 border border-emerald-500/30 flex items-center justify-center">
            <Zap size={20} className="text-emerald-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Energy & Utilities Threat Intelligence</h2>
            <p className="text-xs text-slate-500">ICS/SCADA protection, pipeline security, AMI fraud detection, NERC CIP compliance</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[10px] font-bold font-mono text-emerald-400 tracking-wider">LIVE</span>
          </span>
          <span className="px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[10px] font-mono font-bold text-emerald-400 tracking-wider">
            0xDSI ENERGY
          </span>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-6 gap-3">
        {[
          { l: 'SCADA Alerts', v: '34', c: 'text-red-400', bg: 'from-red-500/5 to-red-500/0' },
          { l: 'Pipeline Threats', v: '12', c: 'text-orange-400', bg: 'from-orange-500/5 to-orange-500/0' },
          { l: 'Compromised Meters', v: '137,430', c: 'text-amber-400', bg: 'from-amber-500/5 to-amber-500/0' },
          { l: 'NERC Violations', v: '7', c: 'text-red-400', bg: 'from-red-500/5 to-red-500/0' },
          { l: 'Revenue Loss/mo', v: '$6.1M', c: 'text-emerald-400', bg: 'from-emerald-500/5 to-emerald-500/0' },
          { l: 'Grid Stability', v: '94.2%', c: 'text-cyan-400', bg: 'from-cyan-500/5 to-cyan-500/0' },
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
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium transition-all border-b-2 ${
                tab === t.id
                  ? 'text-emerald-300 border-emerald-400 bg-emerald-500/5'
                  : 'text-slate-500 border-transparent hover:text-slate-300'
              }`}
            >
              <Icon size={14} />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* ── Grid SCADA Threats ───────────────────────────────────────── */}
      {tab === 'scada' && (
        <div className="space-y-3">
          {SCADA_THREATS.map(t => (
            <div
              key={t.id}
              className={`bg-[#0b0f1e] border rounded-xl p-4 ${
                t.severity === 'critical' ? 'border-red-500/30' : 'border-[#1e293b]'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <Zap size={14} className="text-emerald-400" />
                    <span className="text-sm font-bold text-white">{t.target}</span>
                    <span className="px-2 py-0.5 text-[10px] rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">
                      {t.protocol}
                    </span>
                    <span
                      className={`px-2 py-0.5 text-[10px] rounded-full border ${
                        t.severity === 'critical'
                          ? 'bg-red-500/10 text-red-400 border-red-500/30'
                          : t.severity === 'high'
                          ? 'bg-orange-500/10 text-orange-400 border-orange-500/30'
                          : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                      }`}
                    >
                      {t.severity}
                    </span>
                    <span className="text-[10px] text-slate-600">{t.timestamp}</span>
                  </div>
                  <div className="text-xs text-slate-500 mb-1">
                    {t.attackType} -- {t.affectedAssets} assets affected
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">{t.description}</p>
                  <div className="mt-2 px-3 py-2 bg-red-500/5 border border-red-500/20 rounded-lg">
                    <span className="text-[10px] text-red-400 font-semibold">GRID IMPACT: </span>
                    <span className="text-[10px] text-red-300">{t.gridImpact}</span>
                  </div>
                  <div className="mt-2 flex items-center gap-3 text-[10px] flex-wrap">
                    <span className="text-amber-400 font-semibold">APT: {t.attribution}</span>
                    <span className="text-cyan-400 font-mono">{t.cve}</span>
                    <span
                      className={`px-2 py-0.5 rounded border ${
                        t.status === 'active'
                          ? 'bg-red-500/10 text-red-400 border-red-500/20'
                          : t.status === 'mitigated'
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                          : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                      }`}
                    >
                      {t.status}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Pipeline Security ────────────────────────────────────────── */}
      {tab === 'pipeline' && (
        <div className="space-y-3">
          {PIPELINE_THREATS.map(t => (
            <div
              key={t.id}
              className={`bg-[#0b0f1e] border rounded-xl p-4 ${
                t.severity === 'critical' ? 'border-orange-500/30' : 'border-[#1e293b]'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <GitBranch size={14} className="text-orange-400" />
                  <span className="text-sm font-bold text-white">{t.segment}</span>
                  <span className="px-2 py-0.5 text-[10px] rounded bg-orange-500/10 text-orange-400 border border-orange-500/20 font-mono">
                    {t.protocol}
                  </span>
                  <span
                    className={`px-2 py-0.5 text-[10px] rounded-full border ${
                      t.severity === 'critical'
                        ? 'bg-red-500/10 text-red-400 border-red-500/30'
                        : t.severity === 'high'
                        ? 'bg-orange-500/10 text-orange-400 border-orange-500/30'
                        : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                    }`}
                  >
                    {t.severity}
                  </span>
                </div>
                <span
                  className={`px-2 py-0.5 text-[10px] rounded border ${
                    t.status === 'active'
                      ? 'bg-red-500/10 text-red-400 border-red-500/20'
                      : t.status === 'contained'
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                      : 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20'
                  }`}
                >
                  {t.status}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3 text-[11px] mb-2">
                <div>
                  <span className="text-slate-500">Attack Vector:</span>{' '}
                  <span className="text-amber-400">{t.attackVector}</span>
                </div>
                <div>
                  <span className="text-slate-500">Location:</span>{' '}
                  <span className="text-slate-300">{t.location}</span>
                </div>
                <div>
                  <span className="text-slate-500">Mile Post:</span>{' '}
                  <span className="text-slate-300 font-mono">{t.milePost}</span>
                </div>
                <div>
                  <span className="text-slate-500">Malware:</span>{' '}
                  <span className="text-red-400 font-mono">{t.malwareFamily}</span>
                </div>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed mb-2">{t.description}</p>
              <div className="px-3 py-2 bg-orange-500/5 border border-orange-500/20 rounded-lg">
                <span className="text-[10px] text-orange-400 font-semibold">OPERATIONAL IMPACT: </span>
                <span className="text-[10px] text-orange-300">{t.operationalImpact}</span>
              </div>
              <div className="mt-2 text-[10px] text-slate-600">{t.timestamp}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Smart Meter Fraud ────────────────────────────────────────── */}
      {tab === 'meters' && (
        <div className="space-y-3">
          {SMART_METER_THREATS.map(t => (
            <div
              key={t.id}
              className={`bg-[#0b0f1e] border rounded-xl p-4 ${
                t.severity === 'critical' ? 'border-amber-500/30' : 'border-[#1e293b]'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <Gauge size={14} className="text-amber-400" />
                  <span className="text-sm font-bold text-white">{t.meterType}</span>
                  <span className="text-[10px] text-slate-500">{t.vendor}</span>
                  <span
                    className={`px-2 py-0.5 text-[10px] rounded-full border ${
                      t.severity === 'critical'
                        ? 'bg-red-500/10 text-red-400 border-red-500/30'
                        : t.severity === 'high'
                        ? 'bg-orange-500/10 text-orange-400 border-orange-500/30'
                        : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                    }`}
                  >
                    {t.severity}
                  </span>
                </div>
                <span
                  className={`px-2 py-0.5 text-[10px] rounded border ${
                    t.status === 'active'
                      ? 'bg-red-500/10 text-red-400 border-red-500/20'
                      : t.status === 'patched'
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                      : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                  }`}
                >
                  {t.status}
                </span>
              </div>
              <div className="text-xs text-slate-500 mb-1">
                {t.attackType} -- {t.region}
              </div>
              <p className="text-xs text-slate-400 leading-relaxed mb-2">{t.description}</p>
              <div className="grid grid-cols-3 gap-3 text-[11px] mb-2">
                <div>
                  <span className="text-slate-500">Affected Meters:</span>{' '}
                  <span className="text-red-400 font-bold">{t.affectedMeters.toLocaleString()}</span>
                </div>
                <div>
                  <span className="text-slate-500">Revenue Impact:</span>{' '}
                  <span className="text-amber-400 font-semibold">{t.revenueImpact}</span>
                </div>
                <div>
                  <span className="text-slate-500">CVE:</span>{' '}
                  <span className="text-cyan-400 font-mono">{t.cve}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 text-[10px] text-slate-600">
                <Clock size={10} />
                {t.timestamp}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── NERC CIP Compliance ──────────────────────────────────────── */}
      {tab === 'nerc' && (
        <div className="space-y-6">
          {/* Compliance Overview */}
          <div className="grid grid-cols-2 gap-4">
            {[
              {
                framework: 'CIP-005 Electronic Security',
                score: 62,
                findings: 14,
                critical: 3,
                color: 'text-red-400',
                sections: [
                  'ESP Boundary Definition',
                  'Inbound/Outbound Access',
                  'IDS/IPS Deployment',
                  'Interactive Remote Access',
                  'Vendor Remote Access',
                ],
              },
              {
                framework: 'CIP-007 System Security Mgmt',
                score: 71,
                findings: 18,
                critical: 4,
                color: 'text-amber-400',
                sections: [
                  'Ports & Services',
                  'Security Patch Mgmt',
                  'Malicious Code Prevention',
                  'Security Event Monitoring',
                  'System Access Control',
                ],
              },
              {
                framework: 'CIP-010 Config Change Mgmt',
                score: 78,
                findings: 11,
                critical: 2,
                color: 'text-amber-400',
                sections: [
                  'Baseline Configuration',
                  'Config Change Authorization',
                  'Vulnerability Assessment',
                  'Transient Cyber Assets',
                  'Removable Media',
                ],
              },
              {
                framework: 'CIP-013 Supply Chain Risk',
                score: 54,
                findings: 22,
                critical: 6,
                color: 'text-red-400',
                sections: [
                  'Vendor Risk Assessment',
                  'Software Integrity Verification',
                  'Vendor Remote Access Control',
                  'Incident Notification',
                  'Coordinated Disclosure',
                ],
              },
            ].map((f, i) => (
              <div key={i} className="bg-[#0b0f1e] border border-[#1e293b] rounded-xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-bold text-white">{f.framework}</h4>
                  <div className={`text-2xl font-bold ${f.color}`}>{f.score}%</div>
                </div>
                <div className="h-2 bg-slate-800 rounded-full overflow-hidden mb-3">
                  <div
                    className={`h-full rounded-full ${
                      f.score >= 80 ? 'bg-emerald-500' : f.score >= 70 ? 'bg-amber-500' : 'bg-red-500'
                    }`}
                    style={{ width: `${f.score}%` }}
                  />
                </div>
                <div className="flex items-center gap-4 text-[10px] text-slate-500 mb-3">
                  <span>{f.findings} findings</span>
                  <span className="text-red-400">{f.critical} critical</span>
                </div>
                <div className="space-y-1.5">
                  {f.sections.map((s, j) => {
                    const val = f.score + ((j * 7 - 15) % 20);
                    return (
                      <div key={j} className="flex items-center gap-2 text-[10px]">
                        <span className="w-40 text-slate-400 truncate">{s}</span>
                        <div className="flex-1 h-1 bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              val >= 80 ? 'bg-emerald-500' : val >= 60 ? 'bg-amber-500' : 'bg-red-500'
                            }`}
                            style={{ width: `${Math.min(100, Math.max(30, val))}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Violation Tracker */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle size={16} className="text-red-400" />
              <h3 className="text-sm font-bold text-white">Active NERC CIP Violations</h3>
              <span className="px-2 py-0.5 text-[10px] rounded bg-red-500/10 text-red-400 border border-red-500/20">
                {NERC_VIOLATIONS.length} OPEN
              </span>
            </div>
            <div className="space-y-3">
              {NERC_VIOLATIONS.map(v => (
                <div
                  key={v.id}
                  className={`bg-[#0b0f1e] border rounded-xl p-4 ${
                    v.severity === 'critical' ? 'border-red-500/30' : 'border-[#1e293b]'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Shield size={14} className="text-emerald-400" />
                      <span className="text-sm font-bold text-white">{v.standard}</span>
                      <span className="px-2 py-0.5 text-[10px] rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">
                        {v.requirement}
                      </span>
                      <span
                        className={`px-2 py-0.5 text-[10px] rounded-full border ${
                          v.severity === 'critical'
                            ? 'bg-red-500/10 text-red-400 border-red-500/30'
                            : v.severity === 'high'
                            ? 'bg-orange-500/10 text-orange-400 border-orange-500/30'
                            : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                        }`}
                      >
                        {v.severity}
                      </span>
                    </div>
                    <span
                      className={`px-2 py-0.5 text-[10px] rounded border ${
                        v.status === 'open'
                          ? 'bg-red-500/10 text-red-400 border-red-500/20'
                          : v.status === 'remediation'
                          ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                          : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                      }`}
                    >
                      {v.status}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 mb-1">{v.entity}</div>
                  <p className="text-xs text-slate-400 leading-relaxed mb-2">{v.description}</p>
                  <div className="flex items-center gap-4 text-[10px]">
                    <span>
                      <span className="text-slate-500">Penalty:</span>{' '}
                      <span className="text-red-400 font-bold">{v.penalty}</span>
                    </span>
                    <span>
                      <span className="text-slate-500">Due:</span>{' '}
                      <span className="text-amber-400">{v.dueDate}</span>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
