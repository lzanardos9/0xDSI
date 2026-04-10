import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Crosshair, Zap, Shield, AlertTriangle, Clock, Target, Brain,
  Users, ChevronRight, X, Check, Download, Plus, Cpu, Activity,
  Layers, ArrowRight, Search, FileText, GitBranch, Gauge, Radar,
  ShieldAlert, ShieldCheck, Lock, Unlock, Server,
  Network, CircleDot, ChevronDown, Minus, Play, BarChart3
} from 'lucide-react';
import PSOEnginePanels from './PSOEnginePanels';
import { PSO_TEMPLATES } from '../lib/psoTemplateData';

interface AgentResult {
  name: string;
  icon: any;
  status: 'waiting' | 'processing' | 'done';
  result: string;
  color: string;
}

interface MitreMapping {
  id: string;
  name: string;
}

interface Countermeasure {
  text: string;
  priority: 'Critical' | 'High' | 'Medium';
}

interface MonteCarloRun {
  runId: number;
  feasibilityScore: number;
  detectionTimeMinutes: number;
  attackSuccessRate: number;
  defenseHoldRate: number;
}

interface AttackPath {
  id: number;
  name: string;
  steps: string[];
  likelihood: number;
  impact: number;
  riskScore: number;
  timeToCompromiseMinutes: number;
  detectionProbability: number;
}

interface HighRiskNode {
  node: string;
  type: 'identity' | 'endpoint' | 'service' | 'cloud' | 'data';
  riskCentrality: number;
  vulnerabilityScore: number;
  exposureLevel: 'Critical' | 'High' | 'Medium' | 'Low';
  simulationAppearanceRate: string;
  controlCoverage: number;
}

interface CoverageAnalysis {
  overallCoverage: number;
  coveredPaths: number;
  totalPaths: number;
  coverageByStage: {
    reconnaissance: number;
    initialAccess: number;
    execution: number;
    persistence: number;
    lateralMovement: number;
    exfiltration: number;
  };
  improvementPotential: string;
}

interface ControlFailure {
  control: string;
  currentEffectiveness: number;
  failureImpact: string;
  attackSuccessIncrease: number;
  recommendation: string;
}

interface PredictedStep {
  step: string;
  probability: number;
  mitreTechnique: string;
  timeframeMinutes: number;
  indicator: string;
}

interface GraphEdge {
  from: string;
  to: string;
  edgeType: 'lateral_movement' | 'privilege_escalation' | 'data_access' | 'trust_relationship' | 'network_path';
  transitionProbability: number;
  modifiers: string[];
}

interface SimulationData {
  feasibility: number;
  mitre: MitreMapping[];
  killChainStage: number;
  killChainLabel: string;
  detectionTimeCurrent: string;
  detectionTimeRecommended: string;
  defenseEffectiveness: number;
  countermeasures: Countermeasure[];
  detectionGaps: string[];
  correlationRule: {
    name: string;
    logic: string;
    severity: string;
    mitre: string;
  };
  microPattern: {
    name: string;
    type: string;
    conditions: string[];
    timeWindow: string;
    minOccurrences: number;
  };
  monteCarloRuns: MonteCarloRun[];
  scenarioNarrative: string;
  topAttackPaths: AttackPath[];
  highRiskNodes: HighRiskNode[];
  coverageAnalysis: CoverageAnalysis | null;
  controlFailureSensitivity: ControlFailure[];
  predictedNextSteps: PredictedStep[];
  graphEdges: GraphEdge[];
}

function boxMullerRandom(): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function generateMonteCarloRuns(baseFeasibility: number, baseDefenseEff: number): MonteCarloRun[] {
  const runs: MonteCarloRun[] = [];
  for (let i = 0; i < 10; i++) {
    const feasibilityScore = clamp(
      baseFeasibility + boxMullerRandom() * 12,
      0,
      100
    );
    const detectionTimeMinutes = clamp(
      Math.round((feasibilityScore / 100) * 450 + 30 + boxMullerRandom() * 40),
      2,
      480
    );
    const attackSuccessRate = clamp(
      feasibilityScore * 0.85 + boxMullerRandom() * 10,
      0,
      100
    );
    const defenseHoldRate = clamp(
      baseDefenseEff + (100 - feasibilityScore) * 0.3 + boxMullerRandom() * 8,
      0,
      100
    );
    runs.push({
      runId: i + 1,
      feasibilityScore: Math.round(feasibilityScore * 10) / 10,
      detectionTimeMinutes,
      attackSuccessRate: Math.round(attackSuccessRate * 10) / 10,
      defenseHoldRate: Math.round(defenseHoldRate * 10) / 10,
    });
  }
  return runs;
}

const TEMPLATES: Record<string, { label: string; scenario: string; data: SimulationData }> = {
  insider: {
    label: 'Insider Data Exfiltration',
    scenario: 'An insider with admin access exfiltrates sensitive data via encrypted DNS tunneling while disabling endpoint monitoring',
    data: {
      feasibility: 72,
      mitre: [
        { id: 'T1048', name: 'Exfiltration Over Alternative Protocol' },
        { id: 'T1071.004', name: 'Application Layer Protocol: DNS' },
        { id: 'T1078', name: 'Valid Accounts' },
        { id: 'T1562.001', name: 'Impair Defenses: Disable or Modify Tools' },
      ],
      killChainStage: 7,
      killChainLabel: 'Actions on Objectives',
      detectionTimeCurrent: '6h 12m',
      detectionTimeRecommended: '18m',
      defenseEffectiveness: 31,
      countermeasures: [
        { text: 'Enable DLP monitoring on DNS traffic with entropy analysis', priority: 'Critical' },
        { text: 'Monitor admin after-hours access patterns with behavioral baselines', priority: 'Critical' },
        { text: 'Enforce MFA for all data access and export operations', priority: 'High' },
        { text: 'Add DNS entropy analysis correlation rule', priority: 'High' },
        { text: 'Deploy canary tokens in sensitive data repositories', priority: 'Medium' },
      ],
      detectionGaps: [
        'No DNS payload inspection for encrypted tunneling',
        'Admin accounts bypass DLP policies',
        'No correlation between endpoint status changes and data access',
        'After-hours access not flagged for privileged accounts',
      ],
      correlationRule: {
        name: 'Insider DNS Exfiltration Detection',
        logic: "IF dns_query_entropy > 4.5 AND user_role = 'admin' AND time = 'after_hours' AND endpoint_monitoring_status = 'disabled' THEN alert = CRITICAL",
        severity: 'Critical',
        mitre: 'T1048, T1071.004, T1078, T1562.001',
      },
      microPattern: {
        name: 'Admin DNS Exfil Behavioral Cluster',
        type: 'Composite',
        conditions: [
          'High-entropy DNS queries > 50 per minute',
          'Admin account active outside business hours',
          'Endpoint monitoring service stopped',
          'Large volume data access preceding DNS spike',
        ],
        timeWindow: '15 minutes',
        minOccurrences: 3,
      },
      monteCarloRuns: generateMonteCarloRuns(72, 31),
      ...PSO_TEMPLATES.insider,
      scenarioNarrative: 'A trusted administrator turns rogue under the cover of night, weaponizing their privileged access to siphon terabytes through encrypted DNS channels. As endpoint sensors go dark one by one, the data bleeds out in a stream of high-entropy queries invisible to traditional monitoring.',
    },
  },
  ransomware: {
    label: 'Ransomware via Supply Chain',
    scenario: 'A trusted software vendor update is compromised to deliver ransomware that encrypts critical systems while evading detection through signed binaries',
    data: {
      feasibility: 58,
      mitre: [
        { id: 'T1195.002', name: 'Supply Chain Compromise: Software Supply Chain' },
        { id: 'T1059', name: 'Command and Scripting Interpreter' },
        { id: 'T1486', name: 'Data Encrypted for Impact' },
        { id: 'T1036.001', name: 'Masquerading: Invalid Code Signature' },
      ],
      killChainStage: 6,
      killChainLabel: 'Command & Control',
      detectionTimeCurrent: '2h 45m',
      detectionTimeRecommended: '8m',
      defenseEffectiveness: 44,
      countermeasures: [
        { text: 'Implement binary allowlisting with hash verification', priority: 'Critical' },
        { text: 'Supply chain integrity verification via SBOM analysis', priority: 'Critical' },
        { text: 'Network segmentation to limit lateral movement', priority: 'High' },
        { text: 'Immutable backup strategy with air-gapped copies', priority: 'High' },
        { text: 'Behavioral analysis for anomalous process execution chains', priority: 'Medium' },
      ],
      detectionGaps: [
        'Signed binaries bypass application control policies',
        'No SBOM verification for third-party updates',
        'Lateral movement detection limited to known patterns',
      ],
      correlationRule: {
        name: 'Supply Chain Ransomware Detection',
        logic: "IF process_signer = 'trusted_vendor' AND child_process IN ('cmd.exe','powershell.exe') AND file_encryption_rate > threshold AND network_beacon_interval < 60s THEN alert = CRITICAL",
        severity: 'Critical',
        mitre: 'T1195.002, T1059, T1486',
      },
      microPattern: {
        name: 'Supply Chain Execution Anomaly',
        type: 'Temporal',
        conditions: [
          'Trusted vendor process spawns scripting interpreter',
          'File encryption operations detected on multiple volumes',
          'Network beaconing to unclassified external host',
        ],
        timeWindow: '10 minutes',
        minOccurrences: 2,
      },
      monteCarloRuns: generateMonteCarloRuns(58, 44),
      ...PSO_TEMPLATES.ransomware,
      scenarioNarrative: 'The poison arrives disguised as medicine. A routine software update from a trusted vendor carries a devastating payload, its malicious code hidden behind legitimate digital signatures. By the time the encryption begins, the kill chain has already bypassed every checkpoint in the defense perimeter.',
    },
  },
  physical: {
    label: 'Physical Breach + Cyber Attack',
    scenario: 'An attacker clones an employee badge to gain physical access, then connects a rogue device to the internal network to perform man-in-the-middle attacks',
    data: {
      feasibility: 45,
      mitre: [
        { id: 'T1200', name: 'Hardware Additions' },
        { id: 'T1078', name: 'Valid Accounts' },
        { id: 'T1557', name: 'Adversary-in-the-Middle' },
        { id: 'T1040', name: 'Network Sniffing' },
      ],
      killChainStage: 5,
      killChainLabel: 'Installation',
      detectionTimeCurrent: '1h 30m',
      detectionTimeRecommended: '5m',
      defenseEffectiveness: 52,
      countermeasures: [
        { text: 'Badge-to-network correlation: match physical access to network auth', priority: 'Critical' },
        { text: 'Physical access monitoring with camera-badge event fusion', priority: 'High' },
        { text: 'Network anomaly detection for unauthorized device fingerprints', priority: 'High' },
        { text: '802.1X port-based authentication enforcement', priority: 'High' },
        { text: 'Deploy network access control with device profiling', priority: 'Medium' },
      ],
      detectionGaps: [
        'No correlation between physical badge swipes and network authentication events',
        'Rogue device detection relies on MAC address which can be spoofed',
        'ARP poisoning detection not active on all VLANs',
      ],
      correlationRule: {
        name: 'Physical-Cyber Hybrid Breach Detection',
        logic: "IF badge_access = 'granted' AND network_new_device = true AND arp_anomaly = true AND badge_owner != device_user THEN alert = CRITICAL",
        severity: 'Critical',
        mitre: 'T1200, T1078, T1557',
      },
      microPattern: {
        name: 'Badge-Network Correlation Anomaly',
        type: 'Behavioral',
        conditions: [
          'Badge access event at physical entry point',
          'New device appears on network within proximity window',
          'ARP table changes detected on local switch',
          'Credential mismatch between badge holder and network session',
        ],
        timeWindow: '5 minutes',
        minOccurrences: 2,
      },
      monteCarloRuns: generateMonteCarloRuns(45, 52),
      ...PSO_TEMPLATES.physical,
      scenarioNarrative: 'The attacker walks through the front door wearing a cloned identity, blending seamlessly with the morning rush. Within minutes, a tiny device plugged into an under-desk port begins intercepting credentials, turning the trusted internal network into a hunting ground.',
    },
  },
  zeroday: {
    label: 'Zero-Day Exploitation',
    scenario: 'An unknown vulnerability in a public-facing web application is exploited to gain initial access, followed by privilege escalation through kernel exploitation',
    data: {
      feasibility: 34,
      mitre: [
        { id: 'T1190', name: 'Exploit Public-Facing Application' },
        { id: 'T1210', name: 'Exploitation of Remote Services' },
        { id: 'T1068', name: 'Exploitation for Privilege Escalation' },
      ],
      killChainStage: 5,
      killChainLabel: 'Installation',
      detectionTimeCurrent: '8h+',
      detectionTimeRecommended: '35m',
      defenseEffectiveness: 22,
      countermeasures: [
        { text: 'Deploy WAF with behavioral anomaly detection', priority: 'Critical' },
        { text: 'Enable runtime application self-protection (RASP)', priority: 'Critical' },
        { text: 'Network microsegmentation around public-facing assets', priority: 'High' },
        { text: 'Kernel integrity monitoring on critical servers', priority: 'High' },
        { text: 'Establish baseline syscall patterns for anomaly detection', priority: 'Medium' },
      ],
      detectionGaps: [
        'Signature-based WAF cannot detect zero-day payloads',
        'No behavioral baseline for web application process activity',
        'Kernel-level exploitation bypasses user-space monitoring',
        'No memory corruption detection for runtime exploitation',
      ],
      correlationRule: {
        name: 'Zero-Day Exploitation Chain Detection',
        logic: "IF web_request_anomaly_score > 0.85 AND process_spawn_from_webserver = true AND privilege_escalation_indicator = true THEN alert = CRITICAL",
        severity: 'Critical',
        mitre: 'T1190, T1210, T1068',
      },
      microPattern: {
        name: 'Exploitation Chain Behavioral Pattern',
        type: 'Temporal',
        conditions: [
          'Anomalous HTTP request pattern to public application',
          'Web server process spawns unexpected child process',
          'Privilege context change detected',
          'Unusual kernel syscall sequence',
        ],
        timeWindow: '3 minutes',
        minOccurrences: 1,
      },
      monteCarloRuns: generateMonteCarloRuns(34, 22),
      ...PSO_TEMPLATES.zeroday,
      scenarioNarrative: 'An invisible blade strikes at the heart of the perimeter. A zero-day vulnerability, unknown to every signature database on earth, is exploited with surgical precision. The attacker escalates from web shell to kernel root in under ninety seconds, leaving no trace in conventional logs.',
    },
  },
  cloud: {
    label: 'Cloud Account Takeover',
    scenario: 'An attacker uses stolen OAuth tokens to take over a cloud admin account, modifies IAM policies, and exfiltrates data from S3 buckets',
    data: {
      feasibility: 61,
      mitre: [
        { id: 'T1078.004', name: 'Valid Accounts: Cloud Accounts' },
        { id: 'T1528', name: 'Steal Application Access Token' },
        { id: 'T1098', name: 'Account Manipulation' },
        { id: 'T1530', name: 'Data from Cloud Storage Object' },
      ],
      killChainStage: 6,
      killChainLabel: 'Command & Control',
      detectionTimeCurrent: '3h 15m',
      detectionTimeRecommended: '12m',
      defenseEffectiveness: 38,
      countermeasures: [
        { text: 'Enforce short-lived tokens with automatic rotation', priority: 'Critical' },
        { text: 'Implement impossible travel detection for cloud logins', priority: 'Critical' },
        { text: 'Monitor IAM policy changes with mandatory approval workflow', priority: 'High' },
        { text: 'Enable S3 access logging with anomaly detection', priority: 'High' },
        { text: 'Deploy cloud security posture management (CSPM)', priority: 'Medium' },
      ],
      detectionGaps: [
        'Long-lived OAuth tokens persist beyond session',
        'IAM policy changes not monitored in real-time',
        'No geolocation correlation for cloud API calls',
      ],
      correlationRule: {
        name: 'Cloud Account Takeover Detection',
        logic: "IF cloud_login_location != user_baseline AND iam_policy_modified = true AND s3_bulk_download = true AND token_age > expected_ttl THEN alert = CRITICAL",
        severity: 'Critical',
        mitre: 'T1078.004, T1528, T1098, T1530',
      },
      microPattern: {
        name: 'Cloud Takeover Sequence',
        type: 'Temporal',
        conditions: [
          'Cloud authentication from anomalous location',
          'IAM policy modification by recently authenticated session',
          'Bulk data access from cloud storage',
        ],
        timeWindow: '30 minutes',
        minOccurrences: 1,
      },
      monteCarloRuns: generateMonteCarloRuns(61, 38),
      ...PSO_TEMPLATES.cloud,
      scenarioNarrative: 'Stolen tokens become skeleton keys to the kingdom in the cloud. The attacker silently rewrites IAM policies to grant themselves god-mode access, then methodically drains S3 buckets while the security team chases phantom alerts from a continent away.',
    },
  },
  aipoison: {
    label: 'AI Model Poisoning',
    scenario: 'An attacker with access to the training pipeline injects adversarial samples to poison a production ML model, causing systematic misclassification of threats',
    data: {
      feasibility: 28,
      mitre: [
        { id: 'T1565.001', name: 'Data Manipulation: Stored Data Manipulation' },
        { id: 'T1195', name: 'Supply Chain Compromise' },
        { id: 'T1059', name: 'Command and Scripting Interpreter' },
      ],
      killChainStage: 4,
      killChainLabel: 'Exploitation',
      detectionTimeCurrent: '48h+',
      detectionTimeRecommended: '4h',
      defenseEffectiveness: 18,
      countermeasures: [
        { text: 'Implement training data integrity validation with checksums', priority: 'Critical' },
        { text: 'Deploy model drift detection with statistical monitoring', priority: 'Critical' },
        { text: 'Enforce access controls on ML pipeline with audit logging', priority: 'High' },
        { text: 'A/B test model outputs against known-good baseline', priority: 'High' },
        { text: 'Implement adversarial sample detection in training pipeline', priority: 'Medium' },
      ],
      detectionGaps: [
        'No integrity verification on training data ingestion',
        'Model performance degradation not monitored in real-time',
        'ML pipeline access logs not correlated with model behavior',
        'Adversarial samples indistinguishable from normal data without specialized detection',
      ],
      correlationRule: {
        name: 'AI Model Poisoning Detection',
        logic: "IF training_data_modified = true AND model_accuracy_drift > 0.05 AND pipeline_access_anomaly = true THEN alert = HIGH",
        severity: 'High',
        mitre: 'T1565.001, T1195',
      },
      microPattern: {
        name: 'ML Pipeline Integrity Violation',
        type: 'Behavioral',
        conditions: [
          'Training dataset modification outside scheduled window',
          'Model accuracy metric deviation beyond threshold',
          'Unauthorized access to ML pipeline components',
        ],
        timeWindow: '24 hours',
        minOccurrences: 2,
      },
      monteCarloRuns: generateMonteCarloRuns(28, 18),
      ...PSO_TEMPLATES.aipoison,
      scenarioNarrative: 'The most insidious attack targets the mind itself. Carefully crafted adversarial samples slip into the training pipeline, subtly corrupting the ML model until it learns to see threats as benign. The poisoned guardian now holds the gate open for the enemy.',
    },
  },
  badge: {
    label: 'Badge Cloning + Lateral Movement',
    scenario: 'An attacker clones an RFID badge to access restricted areas, then uses harvested credentials from a compromised workstation to move laterally through the network',
    data: {
      feasibility: 52,
      mitre: [
        { id: 'T1200', name: 'Hardware Additions' },
        { id: 'T1078', name: 'Valid Accounts' },
        { id: 'T1021', name: 'Remote Services' },
        { id: 'T1550', name: 'Use Alternate Authentication Material' },
      ],
      killChainStage: 5,
      killChainLabel: 'Installation',
      detectionTimeCurrent: '45m',
      detectionTimeRecommended: '3m',
      defenseEffectiveness: 55,
      countermeasures: [
        { text: 'Deploy anti-cloning badge technology with rolling codes', priority: 'Critical' },
        { text: 'Correlate physical access events with network authentications', priority: 'Critical' },
        { text: 'Implement network segmentation with jump-box requirements', priority: 'High' },
        { text: 'Deploy credential guard on all workstations', priority: 'High' },
        { text: 'Enable lateral movement detection via honeytokens', priority: 'Medium' },
      ],
      detectionGaps: [
        'Legacy RFID badges susceptible to cloning',
        'Physical and logical access systems not correlated',
        'Lateral movement using valid credentials difficult to distinguish',
      ],
      correlationRule: {
        name: 'Badge Clone Lateral Movement Detection',
        logic: "IF badge_duplicate_read = true AND network_auth_from_new_device = true AND lateral_connection_count > 3 AND time_between_badge_network < 120s THEN alert = CRITICAL",
        severity: 'Critical',
        mitre: 'T1200, T1078, T1021, T1550',
      },
      microPattern: {
        name: 'Physical-to-Lateral Movement Chain',
        type: 'Composite',
        conditions: [
          'Duplicate badge read from different proximity reader',
          'Network authentication from previously unseen device',
          'Multiple remote service connections in rapid succession',
          'Credential usage pattern inconsistent with user baseline',
        ],
        timeWindow: '10 minutes',
        minOccurrences: 2,
      },
      monteCarloRuns: generateMonteCarloRuns(52, 55),
      ...PSO_TEMPLATES.badge,
      scenarioNarrative: 'A cloned badge grants passage into the fortress. The attacker harvests credentials from an unattended workstation and begins hopping laterally through the network, each jump bringing them closer to the crown jewels while appearing as a legitimate employee.',
    },
  },
  ddos: {
    label: 'DDoS + Data Theft Diversion',
    scenario: 'A coordinated DDoS attack is launched as a smokescreen while a secondary team exfiltrates sensitive data through a previously established backdoor',
    data: {
      feasibility: 65,
      mitre: [
        { id: 'T1498', name: 'Network Denial of Service' },
        { id: 'T1048', name: 'Exfiltration Over Alternative Protocol' },
        { id: 'T1036', name: 'Masquerading' },
        { id: 'T1572', name: 'Protocol Tunneling' },
      ],
      killChainStage: 7,
      killChainLabel: 'Actions on Objectives',
      detectionTimeCurrent: '15m',
      detectionTimeRecommended: '2m',
      defenseEffectiveness: 48,
      countermeasures: [
        { text: 'Maintain full monitoring during DDoS mitigation', priority: 'Critical' },
        { text: 'Separate DDoS response from security monitoring teams', priority: 'Critical' },
        { text: 'Monitor all egress channels during volumetric attacks', priority: 'High' },
        { text: 'Deploy automated exfiltration detection on all egress points', priority: 'High' },
        { text: 'Implement bandwidth anomaly detection for non-DDoS traffic', priority: 'Medium' },
      ],
      detectionGaps: [
        'DDoS response diverts SOC attention from other alerts',
        'Exfiltration hidden within high-volume traffic noise',
        'Backdoor channels not detected by perimeter monitoring',
        'Alert fatigue during volumetric attack overwhelms analysts',
      ],
      correlationRule: {
        name: 'DDoS Diversion Data Theft Detection',
        logic: "IF ddos_active = true AND egress_anomaly = true AND data_transfer_volume > baseline AND destination NOT IN approved_list THEN alert = CRITICAL",
        severity: 'Critical',
        mitre: 'T1498, T1048, T1572',
      },
      microPattern: {
        name: 'Diversion Attack Coordination',
        type: 'Temporal',
        conditions: [
          'Volumetric DDoS attack detected on perimeter',
          'Simultaneous anomalous egress traffic to unknown destination',
          'Data access patterns inconsistent with DDoS incident response',
        ],
        timeWindow: '5 minutes',
        minOccurrences: 1,
      },
      monteCarloRuns: generateMonteCarloRuns(65, 48),
      ...PSO_TEMPLATES.ddos,
      scenarioNarrative: 'A wall of traffic crashes against the perimeter like a tidal wave, consuming every analyst and every resource. But the flood is merely a distraction. Behind the noise, a second team moves with precision, draining sensitive data through a backdoor while the SOC fights the wrong battle.',
    },
  },
};

const KILL_CHAIN_STAGES = [
  'Reconnaissance',
  'Weaponization',
  'Delivery',
  'Exploitation',
  'Installation',
  'Command & Control',
  'Actions on Objectives',
];

const ATTACKER_PROFILES = ['Script Kiddie', 'Insider', 'APT Group', 'Nation-State'];

function getFeasibilityColor(score: number): string {
  if (score <= 20) return '#22d3ee';
  if (score <= 40) return '#3b82f6';
  if (score <= 60) return '#eab308';
  if (score <= 80) return '#f97316';
  return '#ef4444';
}

function getFeasibilityLabel(score: number): string {
  if (score <= 20) return 'Very Low';
  if (score <= 40) return 'Low';
  if (score <= 60) return 'Moderate';
  if (score <= 80) return 'High';
  return 'Critical';
}

function getPriorityColor(priority: string): string {
  switch (priority) {
    case 'Critical': return 'bg-red-500/20 text-red-400 border-red-500/30';
    case 'High': return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
    case 'Medium': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
    default: return 'bg-slate-500/20 text-slate-400 border-slate-500/30';
  }
}

function getHistogramBinColor(binCenter: number): string {
  if (binCenter <= 25) return '#22d3ee';
  if (binCenter <= 50) return '#3b82f6';
  if (binCenter <= 75) return '#f59e0b';
  return '#ef4444';
}

function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export default function ThreatSimulator() {
  const [scenario, setScenario] = useState('');
  const [attackDomain, setAttackDomain] = useState<'Logical' | 'Physical' | 'Hybrid'>('Logical');
  const [attackerProfile, setAttackerProfile] = useState('APT Group');
  const [targetAssets, setTargetAssets] = useState<string[]>(['Domain Controller']);
  const [targetInput, setTargetInput] = useState('');
  const [simulationDepth, setSimulationDepth] = useState(5);
  const [isRunning, setIsRunning] = useState(false);
  const [simulationComplete, setSimulationComplete] = useState(false);
  const [activeData, setActiveData] = useState<SimulationData | null>(null);
  const [agents, setAgents] = useState<AgentResult[]>([]);
  const [animatedFeasibility, setAnimatedFeasibility] = useState(0);
  const [showCorrelationRule, setShowCorrelationRule] = useState(false);
  const [showMicroPattern, setShowMicroPattern] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [editableRule, setEditableRule] = useState({ name: '', logic: '', severity: '', mitre: '' });
  const [editablePattern, setEditablePattern] = useState({ name: '', type: '', conditions: [] as string[], timeWindow: '', minOccurrences: 1 });
  const [llmLoading, setLlmLoading] = useState(false);
  const [llmStep, setLlmStep] = useState(0);
  const [llmError, setLlmError] = useState<string | null>(null);
  const [isLlmGenerated, setIsLlmGenerated] = useState(false);
  const timerRefs = useRef<ReturnType<typeof setTimeout>[]>([]);
  const feasibilityRef = useRef<ReturnType<typeof requestAnimationFrame> | null>(null);
  const monteCarloCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const monteCarloAnimRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      timerRefs.current.forEach(clearTimeout);
      if (feasibilityRef.current) cancelAnimationFrame(feasibilityRef.current);
      if (monteCarloAnimRef.current) clearTimeout(monteCarloAnimRef.current);
    };
  }, []);

  useEffect(() => {
    if (!simulationComplete || !activeData || !monteCarloCanvasRef.current) return;
    const canvas = monteCarloCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    const w = rect.width;
    const h = rect.height;

    const runs = activeData.monteCarloRuns;
    const numBins = 20;
    const bins = new Array(numBins).fill(0);
    runs.forEach(run => {
      const binIdx = Math.min(Math.floor(run.feasibilityScore / (100 / numBins)), numBins - 1);
      bins[binIdx]++;
    });
    const maxBin = Math.max(...bins, 1);

    const padding = { top: 10, bottom: 28, left: 32, right: 10 };
    const chartW = w - padding.left - padding.right;
    const chartH = h - padding.top - padding.bottom;
    const barW = chartW / numBins;

    const meanFeasibility = runs.reduce((s, r) => s + r.feasibilityScore, 0) / runs.length;

    ctx.clearRect(0, 0, w, h);

    let barsDrawn = 0;
    const drawNextBar = () => {
      if (barsDrawn >= numBins) return;
      const i = barsDrawn;
      const binCenter = (i + 0.5) * (100 / numBins);
      const barH = (bins[i] / maxBin) * chartH;
      const x = padding.left + i * barW;
      const y = padding.top + chartH - barH;

      ctx.fillStyle = getHistogramBinColor(binCenter);
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      const radius = 2;
      ctx.moveTo(x + 1 + radius, y);
      ctx.lineTo(x + barW - 1 - radius, y);
      ctx.quadraticCurveTo(x + barW - 1, y, x + barW - 1, y + radius);
      ctx.lineTo(x + barW - 1, y + barH);
      ctx.lineTo(x + 1, y + barH);
      ctx.lineTo(x + 1, y + radius);
      ctx.quadraticCurveTo(x + 1, y, x + 1 + radius, y);
      ctx.fill();
      ctx.globalAlpha = 1;

      barsDrawn++;
      if (barsDrawn < numBins) {
        monteCarloAnimRef.current = setTimeout(drawNextBar, 25);
      } else {
        drawOverlays();
      }
    };

    const drawOverlays = () => {
      const meanX = padding.left + (meanFeasibility / 100) * chartW;
      ctx.setLineDash([4, 3]);
      ctx.strokeStyle = '#f8fafc';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(meanX, padding.top);
      ctx.lineTo(meanX, padding.top + chartH);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = '#f8fafc';
      ctx.font = '9px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`Mean: ${meanFeasibility.toFixed(1)}%`, meanX, padding.top - 1);

      ctx.fillStyle = '#64748b';
      ctx.font = '9px system-ui, sans-serif';
      ctx.textAlign = 'center';
      for (let i = 0; i <= 4; i++) {
        const val = i * 25;
        const x = padding.left + (val / 100) * chartW;
        ctx.fillText(`${val}`, x, h - 6);
      }
      ctx.fillText('100', padding.left + chartW, h - 6);

      ctx.textAlign = 'right';
      const ySteps = 4;
      for (let i = 0; i <= ySteps; i++) {
        const val = Math.round((maxBin / ySteps) * i);
        const y = padding.top + chartH - (i / ySteps) * chartH;
        ctx.fillText(`${val}`, padding.left - 4, y + 3);
      }
    };

    drawNextBar();

    return () => {
      if (monteCarloAnimRef.current) clearTimeout(monteCarloAnimRef.current);
    };
  }, [simulationComplete, activeData]);

  const getDefaultData = useCallback((): SimulationData => {
    const lowerScenario = scenario.toLowerCase();
    for (const [key, template] of Object.entries(TEMPLATES)) {
      if (lowerScenario.includes(key) || lowerScenario.includes(template.label.toLowerCase().split(' ')[0])) {
        return template.data;
      }
    }
    return TEMPLATES.insider.data;
  }, [scenario]);

  const runAgentAnimation = useCallback((simData: SimulationData) => {
    setIsRunning(true);
    setSimulationComplete(false);
    setShowCorrelationRule(false);
    setShowMicroPattern(false);
    setAnimatedFeasibility(0);

    const initialAgents: AgentResult[] = [
      { name: 'Threat Modeler', icon: Brain, status: 'waiting', result: '', color: 'text-cyan-400' },
      { name: 'Red Team Agent', icon: Target, status: 'waiting', result: '', color: 'text-red-400' },
      { name: 'Blue Team Agent', icon: Shield, status: 'waiting', result: '', color: 'text-blue-400' },
      { name: 'Risk Assessor', icon: Gauge, status: 'waiting', result: '', color: 'text-amber-400' },
      { name: 'Countermeasure Planner', icon: ShieldCheck, status: 'waiting', result: '', color: 'text-emerald-400' },
      { name: 'Forensics Agent', icon: Search, status: 'waiting', result: '', color: 'text-orange-400' },
    ];
    setAgents(initialAgents);

    const agentResults = [
      `Mapped to ${simData.mitre.length} MITRE ATT&CK techniques. Primary vector: ${simData.mitre[0]?.name || 'Unknown'}.`,
      `Attack reaches ${simData.killChainLabel} (stage ${simData.killChainStage}/7). ${simData.feasibility > 50 ? 'High success probability with current defenses.' : 'Partial success likely, blocked at key chokepoints.'}`,
      `Current defense stack catches ${simData.defenseEffectiveness}% of attack chain. ${simData.detectionGaps.length} critical gaps identified.`,
      `Feasibility score: ${simData.feasibility}% (${getFeasibilityLabel(simData.feasibility)}). ${simData.feasibility > 60 ? 'Immediate action recommended.' : 'Monitoring enhancement advised.'}`,
      `${simData.countermeasures.filter(c => c.priority === 'Critical').length} critical countermeasures identified. Priority: ${simData.countermeasures[0]?.text.substring(0, 60)}...`,
      `Estimated detection: ${simData.detectionTimeCurrent} current vs ${simData.detectionTimeRecommended} with recommendations. Evidence artifacts mapped.`,
    ];

    timerRefs.current.forEach(clearTimeout);
    timerRefs.current = [];

    initialAgents.forEach((_, i) => {
      const startDelay = i * 400;
      const t1 = setTimeout(() => {
        setAgents(prev => prev.map((a, idx) => idx === i ? { ...a, status: 'processing' } : a));
      }, startDelay);
      timerRefs.current.push(t1);

      const t2 = setTimeout(() => {
        setAgents(prev => prev.map((a, idx) => idx === i ? { ...a, status: 'done', result: agentResults[i] } : a));
      }, startDelay + 350);
      timerRefs.current.push(t2);
    });

    const completionTimer = setTimeout(() => {
      setActiveData(simData);
      setIsRunning(false);
      setSimulationComplete(true);
      setEditableRule({ ...simData.correlationRule });
      setEditablePattern({ ...simData.microPattern });

      let current = 0;
      const targetVal = simData.feasibility;
      const duration = 1200;
      const startTime = performance.now();

      const animate = (now: number) => {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        current = Math.round(eased * targetVal);
        setAnimatedFeasibility(current);
        if (progress < 1) {
          feasibilityRef.current = requestAnimationFrame(animate);
        }
      };
      feasibilityRef.current = requestAnimationFrame(animate);
    }, 2800);
    timerRefs.current.push(completionTimer);
  }, []);

  const callSimulationStep = useCallback(async (
    stepNum: number,
    basePayload: Record<string, unknown>,
    context?: Record<string, unknown>,
    signal?: AbortSignal
  ): Promise<Record<string, unknown>> => {
    const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/simulate-threat`;
    const response = await fetch(apiUrl, {
      method: 'POST',
      signal,
      headers: {
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ...basePayload, step: stepNum, context }),
    });
    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      throw new Error(`Step ${stepNum} failed (${response.status}): ${errBody || response.statusText}`);
    }
    const result = await response.json();
    return result.data || result;
  }, []);

  const runSimulation = useCallback(async (data?: SimulationData) => {
    if (data) {
      setIsLlmGenerated(false);
      setLlmError(null);
      runAgentAnimation(data);
      return;
    }

    const isTemplateScenario = Object.values(TEMPLATES).some(t => t.scenario === scenario);

    if (isTemplateScenario) {
      const simData = getDefaultData();
      setIsLlmGenerated(false);
      setLlmError(null);
      runAgentAnimation(simData);
      return;
    }

    setLlmLoading(true);
    setLlmStep(0);
    setLlmError(null);
    setIsLlmGenerated(false);
    setIsRunning(false);
    setSimulationComplete(false);

    const controller = new AbortController();
    const basePayload = { scenario, attackDomain, attackerProfile, targetAssets, depth: simulationDepth };

    try {
      setLlmStep(1);
      const step1 = await callSimulationStep(1, basePayload, undefined, controller.signal);

      const step1Context = {
        feasibility: step1.feasibility,
        killChainLabel: step1.killChainLabel,
        mitre: step1.mitre,
        defenseEffectiveness: step1.defenseEffectiveness,
      };

      setLlmStep(2);
      const step2 = await callSimulationStep(2, basePayload, step1Context, controller.signal);

      setLlmStep(3);
      const step3 = await callSimulationStep(3, basePayload, step1Context, controller.signal);

      const merged: SimulationData = {
        feasibility: (step1.feasibility as number) ?? 50,
        mitre: Array.isArray(step1.mitre) ? step1.mitre as MitreMapping[] : [],
        killChainStage: (step1.killChainStage as number) ?? 4,
        killChainLabel: (step1.killChainLabel as string) ?? 'Exploitation',
        detectionTimeCurrent: (step1.detectionTimeCurrent as string) ?? '2h',
        detectionTimeRecommended: (step1.detectionTimeRecommended as string) ?? '15m',
        defenseEffectiveness: (step1.defenseEffectiveness as number) ?? 40,
        scenarioNarrative: (step1.scenarioNarrative as string) ?? '',
        countermeasures: Array.isArray(step2.countermeasures) ? step2.countermeasures as Countermeasure[] : [],
        detectionGaps: Array.isArray(step2.detectionGaps) ? step2.detectionGaps as string[] : [],
        correlationRule: (step2.correlationRule as SimulationData['correlationRule']) ?? { name: '', logic: '', severity: 'High', mitre: '' },
        microPattern: (step2.microPattern as SimulationData['microPattern']) ?? { name: '', type: 'Behavioral', conditions: [], timeWindow: '10 minutes', minOccurrences: 1 },
        monteCarloRuns: Array.isArray(step2.monteCarloRuns) && step2.monteCarloRuns.length > 0
          ? step2.monteCarloRuns as MonteCarloRun[]
          : generateMonteCarloRuns((step1.feasibility as number) ?? 50, (step1.defenseEffectiveness as number) ?? 40),
        topAttackPaths: Array.isArray(step3.topAttackPaths) ? step3.topAttackPaths as AttackPath[] : [],
        highRiskNodes: Array.isArray(step3.highRiskNodes) ? step3.highRiskNodes as HighRiskNode[] : [],
        coverageAnalysis: (step3.coverageAnalysis as CoverageAnalysis) ?? null,
        controlFailureSensitivity: Array.isArray(step3.controlFailureSensitivity) ? step3.controlFailureSensitivity as ControlFailure[] : [],
        predictedNextSteps: Array.isArray(step3.predictedNextSteps) ? step3.predictedNextSteps as PredictedStep[] : [],
        graphEdges: Array.isArray(step3.graphEdges) ? step3.graphEdges as GraphEdge[] : [],
      };

      setLlmLoading(false);
      setLlmStep(0);
      setIsLlmGenerated(true);
      runAgentAnimation(merged);
    } catch (err: unknown) {
      const error = err as Error;
      const errorMsg = error?.name === 'AbortError'
        ? 'Request aborted'
        : error?.message || 'Unknown error connecting to AI engine';
      setLlmError(errorMsg);
      setLlmLoading(false);
      setLlmStep(0);
      setIsLlmGenerated(false);
      const fallback = getDefaultData();
      runAgentAnimation(fallback);
    }
  }, [scenario, attackDomain, attackerProfile, targetAssets, simulationDepth, getDefaultData, runAgentAnimation, callSimulationStep]);

  const exportReport = useCallback(() => {
    if (!activeData) return;
    const d = activeData;
    const now = new Date().toISOString();
    const avgSuccess = d.monteCarloRuns.length > 0
      ? (d.monteCarloRuns.reduce((s, r) => s + r.attackSuccessRate, 0) / d.monteCarloRuns.length * 100).toFixed(1)
      : 'N/A';
    const avgDefense = d.monteCarloRuns.length > 0
      ? (d.monteCarloRuns.reduce((s, r) => s + r.defenseHoldRate, 0) / d.monteCarloRuns.length * 100).toFixed(1)
      : 'N/A';

    const lines = [
      '═══════════════════════════════════════════════════════════════',
      '                  THREAT SIMULATION REPORT',
      '         PSO Engine — 0xDSI Converged SOC Platform',
      '═══════════════════════════════════════════════════════════════',
      '',
      `Generated: ${now}`,
      `Source: ${isLlmGenerated ? 'AI-Generated (GPT-4o-mini)' : 'Template / Fallback'}`,
      '',
      '───────────────────────────────────────────────────────────────',
      '  SCENARIO PARAMETERS',
      '───────────────────────────────────────────────────────────────',
      `  Scenario:         ${scenario || '(template)'}`,
      `  Attack Domain:    ${attackDomain}`,
      `  Attacker Profile: ${attackerProfile}`,
      `  Target Assets:    ${targetAssets.join(', ')}`,
      `  Simulation Depth: ${simulationDepth}/10`,
      '',
      '───────────────────────────────────────────────────────────────',
      '  EXECUTIVE SUMMARY',
      '───────────────────────────────────────────────────────────────',
      `  Feasibility Score:        ${d.feasibility}/100`,
      `  Defense Effectiveness:     ${d.defenseEffectiveness}/100`,
      `  Kill Chain Stage:          ${d.killChainStage} — ${d.killChainLabel}`,
      `  Detection Time (Current):  ${d.detectionTimeCurrent}`,
      `  Detection Time (Target):   ${d.detectionTimeRecommended}`,
      '',
    ];

    if (d.scenarioNarrative) {
      lines.push(
        '───────────────────────────────────────────────────────────────',
        '  SCENARIO NARRATIVE',
        '───────────────────────────────────────────────────────────────',
        `  ${d.scenarioNarrative}`,
        ''
      );
    }

    lines.push(
      '───────────────────────────────────────────────────────────────',
      '  MITRE ATT&CK MAPPING',
      '───────────────────────────────────────────────────────────────',
    );
    d.mitre.forEach(m => lines.push(`  [${m.id}] ${m.name}`));
    lines.push('');

    lines.push(
      '───────────────────────────────────────────────────────────────',
      '  COUNTERMEASURES',
      '───────────────────────────────────────────────────────────────',
    );
    d.countermeasures.forEach((c, i) => lines.push(`  ${i + 1}. [${c.priority}] ${c.text}`));
    lines.push('');

    lines.push(
      '───────────────────────────────────────────────────────────────',
      '  DETECTION GAPS',
      '───────────────────────────────────────────────────────────────',
    );
    d.detectionGaps.forEach((g, i) => lines.push(`  ${i + 1}. ${g}`));
    lines.push('');

    lines.push(
      '───────────────────────────────────────────────────────────────',
      '  CORRELATION RULE',
      '───────────────────────────────────────────────────────────────',
      `  Name:     ${d.correlationRule.name}`,
      `  Severity: ${d.correlationRule.severity}`,
      `  MITRE:    ${d.correlationRule.mitre}`,
      `  Logic:    ${d.correlationRule.logic}`,
      ''
    );

    lines.push(
      '───────────────────────────────────────────────────────────────',
      '  MICRO-PATTERN',
      '───────────────────────────────────────────────────────────────',
      `  Name:            ${d.microPattern.name}`,
      `  Type:            ${d.microPattern.type}`,
      `  Time Window:     ${d.microPattern.timeWindow}`,
      `  Min Occurrences: ${d.microPattern.minOccurrences}`,
      `  Conditions:`,
    );
    d.microPattern.conditions.forEach(c => lines.push(`    - ${c}`));
    lines.push('');

    lines.push(
      '───────────────────────────────────────────────────────────────',
      '  MONTE CARLO ANALYSIS  (' + d.monteCarloRuns.length + ' runs)',
      '───────────────────────────────────────────────────────────────',
      `  Avg Attack Success Rate:  ${avgSuccess}%`,
      `  Avg Defense Hold Rate:    ${avgDefense}%`,
      '',
      '  Run | Feasibility | Detection(min) | Attack% | Defense%',
      '  ----+-----------+----------------+---------+---------',
    );
    d.monteCarloRuns.forEach(r => {
      lines.push(
        `  ${String(r.runId).padStart(3)} |  ${String(r.feasibilityScore).padStart(8)} | ${String(r.detectionTimeMinutes).padStart(14)} | ${(r.attackSuccessRate * 100).toFixed(1).padStart(6)}% | ${(r.defenseHoldRate * 100).toFixed(1).padStart(6)}%`
      );
    });

    if (d.topAttackPaths.length > 0) {
      lines.push(
        '───────────────────────────────────────────────────────────────',
        '  PSO ENGINE — TOP ATTACK PATHS',
        '───────────────────────────────────────────────────────────────',
      );
      d.topAttackPaths.forEach((p, i) => {
        lines.push(`  Path #${p.id}: ${p.name}`);
        lines.push(`    Risk Score: ${p.riskScore}  |  Likelihood: ${p.likelihood}%  |  Impact: ${p.impact}%`);
        lines.push(`    Time to Compromise: ${p.timeToCompromiseMinutes}min  |  Detection Probability: ${(p.detectionProbability * 100).toFixed(0)}%`);
        lines.push(`    Steps:`);
        p.steps.forEach((s, j) => lines.push(`      ${j + 1}. ${s}`));
        if (i < d.topAttackPaths.length - 1) lines.push('');
      });
      lines.push('');
    }

    if (d.highRiskNodes.length > 0) {
      lines.push(
        '───────────────────────────────────────────────────────────────',
        '  PSO ENGINE — HIGH-RISK NODES (Graph Centrality)',
        '───────────────────────────────────────────────────────────────',
      );
      d.highRiskNodes.forEach(n => {
        lines.push(`  ${n.node} (${n.type})`);
        lines.push(`    Risk Centrality: ${n.riskCentrality}%  |  Vuln: ${n.vulnerabilityScore}/10  |  Exposure: ${n.exposureLevel}`);
        lines.push(`    Appears in: ${n.simulationAppearanceRate}  |  Control Coverage: ${n.controlCoverage}%`);
      });
      lines.push('');
    }

    if (d.coverageAnalysis) {
      const ca = d.coverageAnalysis;
      lines.push(
        '───────────────────────────────────────────────────────────────',
        '  PSO ENGINE — DETECTION COVERAGE ANALYSIS',
        '───────────────────────────────────────────────────────────────',
        `  Overall Coverage: ${ca.overallCoverage}% (${ca.coveredPaths}/${ca.totalPaths} paths)`,
        `  Coverage by Stage:`,
        `    Reconnaissance:    ${ca.coverageByStage.reconnaissance}%`,
        `    Initial Access:    ${ca.coverageByStage.initialAccess}%`,
        `    Execution:         ${ca.coverageByStage.execution}%`,
        `    Persistence:       ${ca.coverageByStage.persistence}%`,
        `    Lateral Movement:  ${ca.coverageByStage.lateralMovement}%`,
        `    Exfiltration:      ${ca.coverageByStage.exfiltration}%`,
        `  Improvement: ${ca.improvementPotential}`,
        '',
      );
    }

    if (d.controlFailureSensitivity.length > 0) {
      lines.push(
        '───────────────────────────────────────────────────────────────',
        '  PSO ENGINE — CONTROL FAILURE SENSITIVITY',
        '───────────────────────────────────────────────────────────────',
      );
      d.controlFailureSensitivity.forEach(c => {
        lines.push(`  ${c.control} [${c.failureImpact}]`);
        lines.push(`    Effectiveness: ${c.currentEffectiveness}%  |  If fails: +${c.attackSuccessIncrease}% attack success`);
        lines.push(`    Recommendation: ${c.recommendation}`);
      });
      lines.push('');
    }

    if (d.predictedNextSteps.length > 0) {
      lines.push(
        '───────────────────────────────────────────────────────────────',
        '  PSO ENGINE — PREDICTED NEXT STEPS',
        '───────────────────────────────────────────────────────────────',
      );
      d.predictedNextSteps.forEach((s, i) => {
        lines.push(`  ${i + 1}. ${s.step}`);
        lines.push(`     Probability: ${s.probability}%  |  MITRE: ${s.mitreTechnique}  |  ETA: ${s.timeframeMinutes}min`);
        lines.push(`     Indicator: ${s.indicator}`);
      });
      lines.push('');
    }

    if (d.graphEdges.length > 0) {
      lines.push(
        '───────────────────────────────────────────────────────────────',
        '  PSO ENGINE — ATTACK GRAPH EDGES',
        '───────────────────────────────────────────────────────────────',
      );
      d.graphEdges.forEach(e => {
        lines.push(`  ${e.from} -> ${e.to} [${e.edgeType}] P=${(e.transitionProbability * 100).toFixed(0)}%`);
        if (e.modifiers.length > 0) lines.push(`    Modifiers: ${e.modifiers.join(', ')}`);
      });
      lines.push('');
    }

    lines.push(
      '═══════════════════════════════════════════════════════════════',
      '                      END OF REPORT',
      '              PSO Engine — 0xDSI Converged SOC',
      '═══════════════════════════════════════════════════════════════',
    );

    const text = lines.join('\n');
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `threat-simulation-report-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [activeData, scenario, attackDomain, attackerProfile, targetAssets, simulationDepth, isLlmGenerated]);

  const handleTemplateClick = (key: string) => {
    const template = TEMPLATES[key];
    setScenario(template.scenario);
    runSimulation(template.data);
  };

  const addTargetAsset = () => {
    if (targetInput.trim() && !targetAssets.includes(targetInput.trim())) {
      setTargetAssets(prev => [...prev, targetInput.trim()]);
      setTargetInput('');
    }
  };

  const removeTargetAsset = (asset: string) => {
    setTargetAssets(prev => prev.filter(a => a !== asset));
  };

  const depthLabel = simulationDepth <= 3 ? 'Quick' : simulationDepth <= 7 ? 'Standard' : 'Deep';

  const gaugeCircumference = 2 * Math.PI * 54;
  const gaugeOffset = gaugeCircumference - (gaugeCircumference * animatedFeasibility) / 100;

  const monteCarloStats = activeData ? (() => {
    const runs = activeData.monteCarloRuns;
    if (!runs || runs.length === 0) return null;
    const scores = runs.map(r => r.feasibilityScore).sort((a, b) => a - b);
    const mean = scores.reduce((s, v) => s + v, 0) / scores.length;
    const median = scores.length % 2 === 0
      ? (scores[scores.length / 2 - 1] + scores[scores.length / 2]) / 2
      : scores[Math.floor(scores.length / 2)];
    const variance = scores.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / scores.length;
    const stdDev = Math.sqrt(variance);
    const p95 = scores[Math.floor(scores.length * 0.95)];
    const successProb = (scores.filter(s => s > 50).length / scores.length) * 100;

    const detTimes = runs.map(r => r.detectionTimeMinutes);
    const avgDetTime = detTimes.reduce((s, v) => s + v, 0) / detTimes.length;
    const avgDefHold = runs.reduce((s, r) => s + r.defenseHoldRate, 0) / runs.length;

    const bestRun = runs.reduce((best, r) => r.feasibilityScore < best.feasibilityScore ? r : best, runs[0]);
    const worstRun = runs.reduce((worst, r) => r.feasibilityScore > worst.feasibilityScore ? r : worst, runs[0]);

    return { mean, median, stdDev, p95, successProb, avgDetTime, avgDefHold, bestRun, worstRun };
  })() : null;

  return (
    <div className="h-full flex flex-col overflow-hidden bg-[#0A1628]">
      <div className="flex-shrink-0 px-6 py-4 border-b border-slate-700/50 bg-slate-900/80 backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20">
              <Crosshair className="w-6 h-6 text-cyan-400" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-wide text-slate-100">PSO ENGINE — THREAT SIMULATOR</h1>
              <p className="text-xs text-slate-400 mt-0.5">Predictive Security Operations — Monte Carlo Simulation & Graph-Based Attack Modeling</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="px-3 py-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/20">
              <span className="text-xs font-semibold text-cyan-400 tracking-wider">PSO ENGINE v2.0</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700/50">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              <span className="text-xs font-medium text-slate-300">6 AGENTS READY</span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden flex gap-4 p-4">
        <div className="w-[40%] flex-shrink-0 flex flex-col gap-4 overflow-y-auto pr-1 custom-scrollbar">
          <div className="enterprise-card p-4">
            <div className="flex items-center gap-2 mb-3">
              <FileText className="w-4 h-4 text-cyan-400" />
              <span className="text-sm font-semibold text-slate-200">Scenario Description</span>
            </div>
            <textarea
              value={scenario}
              onChange={(e) => setScenario(e.target.value)}
              placeholder="Describe a hypothetical threat scenario... e.g., 'An insider with admin access exfiltrates sensitive data via encrypted DNS tunneling while disabling endpoint monitoring'"
              className="w-full h-32 bg-slate-800/60 border border-slate-700/50 rounded-lg px-3.5 py-2.5 text-sm text-slate-200 placeholder-slate-500 resize-none focus:outline-none focus:border-cyan-500/40 focus:ring-1 focus:ring-cyan-500/20 transition-all"
            />
          </div>

          <div className="enterprise-card p-4">
            <div className="flex items-center gap-2 mb-3">
              <Layers className="w-4 h-4 text-cyan-400" />
              <span className="text-sm font-semibold text-slate-200">Quick Scenario Templates</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {Object.entries(TEMPLATES).map(([key, template]) => (
                <button
                  key={key}
                  onClick={() => handleTemplateClick(key)}
                  className="px-3 py-1.5 text-xs font-medium bg-slate-800/60 border border-slate-700/50 rounded-full text-slate-300 hover:bg-cyan-500/10 hover:border-cyan-500/30 hover:text-cyan-300 transition-all"
                >
                  {template.label}
                </button>
              ))}
            </div>
          </div>

          <div className="enterprise-card p-4">
            <div className="flex items-center gap-2 mb-4">
              <Activity className="w-4 h-4 text-cyan-400" />
              <span className="text-sm font-semibold text-slate-200">Configuration</span>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-slate-400 mb-2 block">Attack Domain</label>
                <div className="flex gap-2">
                  {(['Logical', 'Physical', 'Hybrid'] as const).map(domain => (
                    <button
                      key={domain}
                      onClick={() => setAttackDomain(domain)}
                      className={`flex-1 px-3 py-2 text-xs font-medium rounded-lg border transition-all ${
                        attackDomain === domain
                          ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-300'
                          : 'bg-slate-800/40 border-slate-700/50 text-slate-400 hover:border-slate-600'
                      }`}
                    >
                      {domain === 'Logical' && <Network className="w-3.5 h-3.5 inline mr-1.5" />}
                      {domain === 'Physical' && <Lock className="w-3.5 h-3.5 inline mr-1.5" />}
                      {domain === 'Hybrid' && <GitBranch className="w-3.5 h-3.5 inline mr-1.5" />}
                      {domain}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-400 mb-2 block">Attacker Profile</label>
                <div className="relative">
                  <button
                    onClick={() => setProfileOpen(!profileOpen)}
                    className="w-full flex items-center justify-between px-3 py-2 bg-slate-800/60 border border-slate-700/50 rounded-lg text-sm text-slate-200 hover:border-slate-600 transition-all"
                  >
                    <span className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-slate-400" />
                      {attackerProfile}
                    </span>
                    <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${profileOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {profileOpen && (
                    <div className="absolute z-20 w-full mt-1 bg-slate-800 border border-slate-700 rounded-lg shadow-xl overflow-hidden">
                      {ATTACKER_PROFILES.map(profile => (
                        <button
                          key={profile}
                          onClick={() => { setAttackerProfile(profile); setProfileOpen(false); }}
                          className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-700/60 transition-colors ${
                            attackerProfile === profile ? 'text-cyan-400 bg-cyan-500/10' : 'text-slate-300'
                          }`}
                        >
                          {profile}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-400 mb-2 block">Target Assets</label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {targetAssets.map(asset => (
                    <span key={asset} className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-slate-800/60 border border-slate-700/50 rounded-full text-slate-300">
                      <Server className="w-3 h-3 text-slate-500" />
                      {asset}
                      <button onClick={() => removeTargetAsset(asset)} className="ml-0.5 hover:text-red-400 transition-colors">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    value={targetInput}
                    onChange={(e) => setTargetInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addTargetAsset()}
                    placeholder="Add target asset..."
                    className="flex-1 px-3 py-1.5 bg-slate-800/60 border border-slate-700/50 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500/40 transition-all"
                  />
                  <button onClick={addTargetAsset} className="px-2.5 py-1.5 bg-slate-700/60 border border-slate-600/50 rounded-lg hover:bg-slate-600/60 transition-all">
                    <Plus className="w-3.5 h-3.5 text-slate-300" />
                  </button>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-medium text-slate-400">Simulation Depth</label>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded ${
                    depthLabel === 'Quick' ? 'bg-cyan-500/15 text-cyan-400' :
                    depthLabel === 'Standard' ? 'bg-blue-500/15 text-blue-400' :
                    'bg-amber-500/15 text-amber-400'
                  }`}>
                    {depthLabel} ({simulationDepth}/10)
                  </span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={10}
                  value={simulationDepth}
                  onChange={(e) => setSimulationDepth(Number(e.target.value))}
                  className="w-full h-1.5 bg-slate-700 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-cyan-400 [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-cyan-300 [&::-webkit-slider-thumb]:shadow-[0_0_8px_rgba(34,211,238,0.4)]"
                />
              </div>
            </div>
          </div>

          <button
            onClick={() => runSimulation()}
            disabled={isRunning || llmLoading || !scenario.trim()}
            className={`w-full flex items-center justify-center gap-2.5 px-6 py-3.5 rounded-xl font-bold text-sm tracking-wider transition-all ${
              isRunning || llmLoading || !scenario.trim()
                ? 'bg-slate-800/60 border border-slate-700/50 text-slate-500 cursor-not-allowed'
                : 'bg-cyan-500/15 border border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/25 hover:shadow-[0_0_25px_rgba(34,211,238,0.2)] active:scale-[0.98]'
            }`}
          >
            {isRunning || llmLoading ? (
              <>
                <Cpu className="w-5 h-5 animate-spin" />
                {llmLoading ? `AI STEP ${llmStep || '...'}/3` : 'SIMULATING...'}
              </>
            ) : (
              <>
                <Zap className="w-5 h-5" />
                RUN SIMULATION
              </>
            )}
          </button>
        </div>

        <div className="w-[35%] flex-shrink-0 flex flex-col gap-4 overflow-y-auto pr-1 custom-scrollbar">
          {!isRunning && !simulationComplete && !llmLoading && (
            <div className="flex-1 flex flex-col items-center justify-center enterprise-card">
              <div className="relative w-32 h-32 mb-6">
                <div className="absolute inset-0 rounded-full border-2 border-cyan-500/20 animate-ping" style={{ animationDuration: '3s' }} />
                <div className="absolute inset-3 rounded-full border border-cyan-500/15 animate-ping" style={{ animationDuration: '2.5s', animationDelay: '0.5s' }} />
                <div className="absolute inset-6 rounded-full border border-cyan-500/10 animate-ping" style={{ animationDuration: '2s', animationDelay: '1s' }} />
                <div className="absolute inset-0 flex items-center justify-center">
                  <Radar className="w-10 h-10 text-cyan-500/40" />
                </div>
                <svg className="absolute inset-0 w-full h-full animate-spin" style={{ animationDuration: '8s' }}>
                  <line x1="64" y1="64" x2="64" y2="8" stroke="rgba(34,211,238,0.3)" strokeWidth="1" />
                </svg>
              </div>
              <p className="text-sm font-medium text-slate-400">Awaiting Scenario Input</p>
              <p className="text-xs text-slate-500 mt-1">Describe a threat or select a template</p>
            </div>
          )}

          {llmLoading && !isRunning && (
            <div className="enterprise-card p-6">
              <div className="flex flex-col items-center gap-4">
                <div className="p-4 rounded-full bg-cyan-500/10 border border-cyan-500/20">
                  <Brain className="w-8 h-8 text-cyan-400 animate-spin" style={{ animationDuration: '2s' }} />
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold text-cyan-300">
                    {llmStep === 1 && 'Step 1/3 -- Analyzing Scenario & MITRE Mapping...'}
                    {llmStep === 2 && 'Step 2/3 -- Generating Countermeasures & Correlation Rules...'}
                    {llmStep === 3 && 'Step 3/3 -- Building Attack Paths & Risk Graph...'}
                    {llmStep === 0 && 'Initializing AI Simulation Engine...'}
                  </p>
                  <p className="text-xs text-slate-500 mt-2">Each step uses a focused AI prompt for reliable results</p>
                </div>
                <div className="w-full space-y-2 mt-2">
                  {[1, 2, 3].map(s => (
                    <div key={s} className="flex items-center gap-3">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold border transition-all duration-500 ${
                        llmStep > s ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400' :
                        llmStep === s ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-400 animate-pulse' :
                        'bg-slate-800 border-slate-600 text-slate-500'
                      }`}>
                        {llmStep > s ? <Check className="w-3 h-3" /> : s}
                      </div>
                      <span className={`text-xs transition-colors duration-300 ${
                        llmStep > s ? 'text-emerald-400' : llmStep === s ? 'text-cyan-300' : 'text-slate-500'
                      }`}>
                        {s === 1 && 'Threat Analysis & MITRE ATT&CK'}
                        {s === 2 && 'Countermeasures & Monte Carlo'}
                        {s === 3 && 'Attack Paths & Risk Graph'}
                      </span>
                      {llmStep === s && (
                        <div className="ml-auto">
                          <Activity className="w-3 h-3 text-cyan-400 animate-pulse" />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <div className="w-full h-1 bg-slate-700 rounded-full overflow-hidden mt-1">
                  <div
                    className="h-full bg-gradient-to-r from-cyan-500 to-emerald-500 rounded-full transition-all duration-700 ease-out"
                    style={{ width: `${Math.max(5, (llmStep / 3) * 100)}%` }}
                  />
                </div>
              </div>
            </div>
          )}

          {llmError && (
            <div className="enterprise-card p-3 border-amber-500/30 bg-amber-500/5">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
                <span className="text-xs font-semibold text-amber-300">AI engine unavailable: using local simulation</span>
              </div>
              <p className="text-[10px] text-amber-500/70 mt-1 ml-6">{llmError}</p>
            </div>
          )}

          {(isRunning || simulationComplete) && (
            <>
              <div className="enterprise-card p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Cpu className="w-4 h-4 text-cyan-400" />
                  <span className="text-sm font-semibold text-slate-200">Agent Processing</span>
                  {isRunning && (
                    <span className="ml-auto flex items-center gap-1.5 text-xs text-cyan-400">
                      <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                      Processing
                    </span>
                  )}
                </div>
                <div className="space-y-2">
                  {agents.map((agent, i) => {
                    const Icon = agent.icon;
                    return (
                      <div
                        key={agent.name}
                        className={`p-2.5 rounded-lg border transition-all duration-300 ${
                          agent.status === 'done'
                            ? 'bg-slate-800/40 border-slate-700/40'
                            : agent.status === 'processing'
                            ? 'bg-slate-800/60 border-cyan-500/30 shadow-[0_0_12px_rgba(34,211,238,0.08)]'
                            : 'bg-slate-800/20 border-slate-700/20 opacity-50'
                        }`}
                        style={{ transitionDelay: `${i * 50}ms` }}
                      >
                        <div className="flex items-center gap-2">
                          <div className={`p-1.5 rounded-md ${
                            agent.status === 'processing' ? 'bg-cyan-500/15' :
                            agent.status === 'done' ? 'bg-slate-700/40' : 'bg-slate-800/30'
                          }`}>
                            <Icon className={`w-3.5 h-3.5 ${
                              agent.status === 'processing' ? 'text-cyan-400 animate-pulse' : agent.color
                            }`} />
                          </div>
                          <span className="text-xs font-semibold text-slate-300 flex-1">{agent.name}</span>
                          <span className={`w-2 h-2 rounded-full ${
                            agent.status === 'done' ? 'bg-emerald-400' :
                            agent.status === 'processing' ? 'bg-amber-400 animate-pulse' :
                            'bg-slate-600'
                          }`} />
                        </div>
                        {agent.status === 'processing' && (
                          <div className="mt-2 flex gap-1">
                            <div className="h-0.5 w-full bg-slate-700 rounded-full overflow-hidden">
                              <div className="h-full bg-cyan-500/60 rounded-full animate-pulse" style={{ width: '60%' }} />
                            </div>
                          </div>
                        )}
                        {agent.status === 'done' && agent.result && (
                          <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">{agent.result}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {simulationComplete && activeData && (
                <>
                  <div className="enterprise-card p-4">
                    <div className="flex items-center gap-2 mb-4">
                      <Gauge className="w-4 h-4 text-cyan-400" />
                      <span className="text-sm font-semibold text-slate-200">Feasibility Score</span>
                    </div>
                    <div className="flex items-center justify-center">
                      <div className="relative w-32 h-32">
                        <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
                          <circle cx="60" cy="60" r="54" fill="none" stroke="rgba(51,65,85,0.5)" strokeWidth="8" />
                          <circle
                            cx="60" cy="60" r="54" fill="none"
                            stroke={getFeasibilityColor(animatedFeasibility)}
                            strokeWidth="8"
                            strokeLinecap="round"
                            strokeDasharray={gaugeCircumference}
                            strokeDashoffset={gaugeOffset}
                            style={{ transition: 'stroke 0.3s ease' }}
                          />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                          <span className="text-2xl font-bold" style={{ color: getFeasibilityColor(activeData.feasibility) }}>
                            {animatedFeasibility}%
                          </span>
                          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                            {getFeasibilityLabel(activeData.feasibility)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="enterprise-card p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Target className="w-4 h-4 text-cyan-400" />
                      <span className="text-sm font-semibold text-slate-200">MITRE ATT&CK Mapping</span>
                    </div>
                    <div className="space-y-1.5">
                      {activeData.mitre.map(technique => (
                        <div key={technique.id} className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-slate-800/40 border border-slate-700/30">
                          <span className="text-[10px] font-mono font-bold text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded">{technique.id}</span>
                          <span className="text-xs text-slate-300">{technique.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="enterprise-card p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <ArrowRight className="w-4 h-4 text-cyan-400" />
                      <span className="text-sm font-semibold text-slate-200">Kill Chain Progression</span>
                    </div>
                    <div className="flex gap-1 mb-2">
                      {KILL_CHAIN_STAGES.map((stage, i) => (
                        <div
                          key={stage}
                          className={`flex-1 h-2 rounded-full transition-all ${
                            i < activeData.killChainStage
                              ? i < activeData.killChainStage - 1
                                ? 'bg-red-500/60'
                                : 'bg-red-400 shadow-[0_0_8px_rgba(248,113,113,0.4)]'
                              : 'bg-slate-700/50'
                          }`}
                          title={stage}
                        />
                      ))}
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-slate-500">Reconnaissance</span>
                      <span className="text-xs font-semibold text-red-400">
                        Reaches: {activeData.killChainLabel} ({activeData.killChainStage}/7)
                      </span>
                    </div>
                  </div>

                  <div className="enterprise-card p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Clock className="w-4 h-4 text-cyan-400" />
                      <span className="text-sm font-semibold text-slate-200">Detection Timeline</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="p-3 rounded-lg bg-red-500/5 border border-red-500/20 text-center">
                        <p className="text-[10px] font-medium text-red-400/70 uppercase tracking-wider mb-1">Current Rules</p>
                        <p className="text-lg font-bold text-red-400">{activeData.detectionTimeCurrent}</p>
                      </div>
                      <div className="p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20 text-center">
                        <p className="text-[10px] font-medium text-emerald-400/70 uppercase tracking-wider mb-1">Recommended</p>
                        <p className="text-lg font-bold text-emerald-400">{activeData.detectionTimeRecommended}</p>
                      </div>
                    </div>
                  </div>

                  <div className="enterprise-card p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <ShieldAlert className="w-4 h-4 text-cyan-400" />
                      <span className="text-sm font-semibold text-slate-200">Current Defenses Effectiveness</span>
                    </div>
                    <div className="relative h-3 bg-slate-700/50 rounded-full overflow-hidden">
                      <div
                        className="absolute inset-y-0 left-0 rounded-full transition-all duration-1000"
                        style={{
                          width: `${activeData.defenseEffectiveness}%`,
                          background: activeData.defenseEffectiveness > 60
                            ? 'linear-gradient(90deg, #10b981, #34d399)'
                            : activeData.defenseEffectiveness > 35
                            ? 'linear-gradient(90deg, #f59e0b, #fbbf24)'
                            : 'linear-gradient(90deg, #ef4444, #f87171)',
                        }}
                      />
                    </div>
                    <div className="flex items-center justify-between mt-1.5">
                      <span className="text-[10px] text-slate-500">Attack coverage by current defenses</span>
                      <span className={`text-xs font-bold ${
                        activeData.defenseEffectiveness > 60 ? 'text-emerald-400' :
                        activeData.defenseEffectiveness > 35 ? 'text-amber-400' : 'text-red-400'
                      }`}>
                        {activeData.defenseEffectiveness}%
                      </span>
                    </div>
                  </div>

                  {activeData.scenarioNarrative && (
                    <div className="enterprise-card p-4 border-l-2 border-l-cyan-500/40">
                      <div className="flex items-center gap-2 mb-2">
                        <FileText className="w-3.5 h-3.5 text-cyan-400" />
                        <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Scenario Narrative</span>
                        {isLlmGenerated && (
                          <span className="ml-auto px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider bg-cyan-500/15 border border-cyan-500/30 rounded text-cyan-400">
                            AI GENERATED
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 leading-relaxed italic">{activeData.scenarioNarrative}</p>
                    </div>
                  )}

                  {monteCarloStats && (
                    <>
                      <div className="enterprise-card p-4">
                        <div className="flex items-center gap-2 mb-3">
                          <BarChart3 className="w-4 h-4 text-cyan-400" />
                          <span className="text-sm font-semibold text-slate-200">MONTE CARLO ANALYSIS</span>
                          <span className="ml-auto px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider bg-slate-700/60 border border-slate-600/40 rounded text-slate-400">
                            10 RUNS
                          </span>
                        </div>
                        <canvas
                          ref={monteCarloCanvasRef}
                          className="w-full rounded-lg bg-slate-800/30"
                          style={{ height: '180px' }}
                        />
                        <div className="grid grid-cols-5 gap-2 mt-3">
                          <div className="text-center">
                            <p className="text-[9px] font-medium text-slate-500 uppercase tracking-wider">Mean</p>
                            <p className="text-xs font-bold text-slate-200">{monteCarloStats.mean.toFixed(1)}%</p>
                          </div>
                          <div className="text-center">
                            <p className="text-[9px] font-medium text-slate-500 uppercase tracking-wider">Median</p>
                            <p className="text-xs font-bold text-slate-200">{monteCarloStats.median.toFixed(1)}%</p>
                          </div>
                          <div className="text-center">
                            <p className="text-[9px] font-medium text-slate-500 uppercase tracking-wider">Std Dev</p>
                            <p className="text-xs font-bold text-slate-200">{monteCarloStats.stdDev.toFixed(1)}</p>
                          </div>
                          <div className="text-center">
                            <p className="text-[9px] font-medium text-slate-500 uppercase tracking-wider">95th %</p>
                            <p className="text-xs font-bold text-slate-200">{monteCarloStats.p95.toFixed(1)}%</p>
                          </div>
                          <div className="text-center">
                            <p className="text-[9px] font-medium text-slate-500 uppercase tracking-wider">P(S{'>'}50%)</p>
                            <p className="text-xs font-bold text-slate-200">{monteCarloStats.successProb.toFixed(0)}%</p>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div className="enterprise-card p-3">
                          <p className="text-[9px] font-medium text-emerald-400/70 uppercase tracking-wider mb-1">Best Case</p>
                          <p className="text-sm font-bold text-emerald-400">{monteCarloStats.bestRun.feasibilityScore.toFixed(1)}%</p>
                          <p className="text-[10px] text-slate-500">Detection: {formatMinutes(monteCarloStats.bestRun.detectionTimeMinutes)}</p>
                        </div>
                        <div className="enterprise-card p-3">
                          <p className="text-[9px] font-medium text-red-400/70 uppercase tracking-wider mb-1">Worst Case</p>
                          <p className="text-sm font-bold text-red-400">{monteCarloStats.worstRun.feasibilityScore.toFixed(1)}%</p>
                          <p className="text-[10px] text-slate-500">Detection: {formatMinutes(monteCarloStats.worstRun.detectionTimeMinutes)}</p>
                        </div>
                        <div className="enterprise-card p-3">
                          <p className="text-[9px] font-medium text-blue-400/70 uppercase tracking-wider mb-1">Avg Detection Time</p>
                          <p className="text-sm font-bold text-blue-400">{formatMinutes(monteCarloStats.avgDetTime)}</p>
                          <p className="text-[10px] text-slate-500">Across all runs</p>
                        </div>
                        <div className="enterprise-card p-3">
                          <p className="text-[9px] font-medium text-amber-400/70 uppercase tracking-wider mb-1">Defense Hold Rate</p>
                          <p className="text-sm font-bold text-amber-400">{monteCarloStats.avgDefHold.toFixed(1)}%</p>
                          <p className="text-[10px] text-slate-500">Average across runs</p>
                        </div>
                      </div>
                    </>
                  )}

                  {activeData && (
                    <PSOEnginePanels
                      topAttackPaths={activeData.topAttackPaths}
                      highRiskNodes={activeData.highRiskNodes}
                      coverageAnalysis={activeData.coverageAnalysis}
                      controlFailureSensitivity={activeData.controlFailureSensitivity}
                      predictedNextSteps={activeData.predictedNextSteps}
                      graphEdges={activeData.graphEdges}
                    />
                  )}
                </>
              )}
            </>
          )}
        </div>

        <div className="w-[25%] flex-shrink-0 flex flex-col gap-4 overflow-y-auto pr-1 custom-scrollbar">
          {simulationComplete && activeData ? (
            <>
              <div className="enterprise-card p-4">
                <div className="flex items-center gap-2 mb-3">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span className="text-sm font-semibold text-slate-200">Countermeasures</span>
                </div>
                <div className="space-y-2">
                  {activeData.countermeasures.map((cm, i) => (
                    <div key={i} className="flex gap-2.5 p-2 rounded-lg bg-slate-800/30 border border-slate-700/20">
                      <span className="flex-shrink-0 w-5 h-5 rounded-full bg-slate-700/50 flex items-center justify-center text-[10px] font-bold text-slate-400">
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-slate-300 leading-relaxed">{cm.text}</p>
                        <span className={`inline-block mt-1 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded border ${getPriorityColor(cm.priority)}`}>
                          {cm.priority}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="enterprise-card p-4">
                <div className="flex items-center gap-2 mb-3">
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                  <span className="text-sm font-semibold text-slate-200">Detection Gaps</span>
                </div>
                <div className="space-y-1.5">
                  {activeData.detectionGaps.map((gap, i) => (
                    <div key={i} className="flex items-start gap-2 p-2 rounded-md bg-amber-500/5 border border-amber-500/10">
                      <Unlock className="w-3.5 h-3.5 text-amber-400/60 flex-shrink-0 mt-0.5" />
                      <span className="text-[11px] text-slate-400 leading-relaxed">{gap}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <button
                  onClick={() => { setShowCorrelationRule(!showCorrelationRule); setShowMicroPattern(false); }}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg border text-xs font-semibold transition-all ${
                    showCorrelationRule
                      ? 'bg-cyan-500/15 border-cyan-500/30 text-cyan-300'
                      : 'bg-slate-800/40 border-slate-700/40 text-slate-300 hover:border-cyan-500/20 hover:text-cyan-400'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <GitBranch className="w-4 h-4" />
                    Create Correlation Rule
                  </span>
                  <ChevronRight className={`w-4 h-4 transition-transform ${showCorrelationRule ? 'rotate-90' : ''}`} />
                </button>

                <button
                  onClick={() => { setShowMicroPattern(!showMicroPattern); setShowCorrelationRule(false); }}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg border text-xs font-semibold transition-all ${
                    showMicroPattern
                      ? 'bg-cyan-500/15 border-cyan-500/30 text-cyan-300'
                      : 'bg-slate-800/40 border-slate-700/40 text-slate-300 hover:border-cyan-500/20 hover:text-cyan-400'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <CircleDot className="w-4 h-4" />
                    Create Micro-Pattern
                  </span>
                  <ChevronRight className={`w-4 h-4 transition-transform ${showMicroPattern ? 'rotate-90' : ''}`} />
                </button>

                <button
                  onClick={exportReport}
                  disabled={!activeData}
                  className="w-full flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-lg bg-slate-800/40 border border-slate-700/40 text-xs font-semibold text-slate-300 hover:border-slate-600 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <Download className="w-4 h-4" />
                  Export Report
                </button>
              </div>

              {showCorrelationRule && (
                <div className="enterprise-card p-4 animate-fade-in">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <GitBranch className="w-4 h-4 text-cyan-400" />
                      <span className="text-sm font-semibold text-slate-200">Correlation Rule Builder</span>
                    </div>
                    <button onClick={() => setShowCorrelationRule(false)} className="text-slate-500 hover:text-slate-300 transition-colors">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <label className="text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1 block">Rule Name</label>
                      <input
                        value={editableRule.name}
                        onChange={(e) => setEditableRule(prev => ({ ...prev, name: e.target.value }))}
                        className="w-full px-3 py-1.5 bg-slate-800/60 border border-slate-700/50 rounded-md text-xs text-slate-200 focus:outline-none focus:border-cyan-500/40 transition-all"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1 block">Conditions Logic</label>
                      <textarea
                        value={editableRule.logic}
                        onChange={(e) => setEditableRule(prev => ({ ...prev, logic: e.target.value }))}
                        rows={3}
                        className="w-full px-3 py-1.5 bg-slate-800/60 border border-slate-700/50 rounded-md text-xs text-cyan-300 font-mono leading-relaxed resize-none focus:outline-none focus:border-cyan-500/40 transition-all"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1 block">Severity</label>
                        <input
                          value={editableRule.severity}
                          onChange={(e) => setEditableRule(prev => ({ ...prev, severity: e.target.value }))}
                          className="w-full px-3 py-1.5 bg-slate-800/60 border border-slate-700/50 rounded-md text-xs text-slate-200 focus:outline-none focus:border-cyan-500/40 transition-all"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1 block">MITRE Mapping</label>
                        <input
                          value={editableRule.mitre}
                          onChange={(e) => setEditableRule(prev => ({ ...prev, mitre: e.target.value }))}
                          className="w-full px-3 py-1.5 bg-slate-800/60 border border-slate-700/50 rounded-md text-xs text-slate-200 focus:outline-none focus:border-cyan-500/40 transition-all"
                        />
                      </div>
                    </div>
                    <div className="flex gap-2 pt-1">
                      <button className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-cyan-500/15 border border-cyan-500/30 text-xs font-semibold text-cyan-300 hover:bg-cyan-500/25 transition-all">
                        <Play className="w-3.5 h-3.5" />
                        Deploy to Correlation Engine
                      </button>
                      <button className="px-3 py-2 rounded-lg bg-slate-800/60 border border-slate-700/50 text-xs font-medium text-slate-400 hover:text-slate-300 hover:border-slate-600 transition-all">
                        Save Draft
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {showMicroPattern && (
                <div className="enterprise-card p-4 animate-fade-in">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <CircleDot className="w-4 h-4 text-cyan-400" />
                      <span className="text-sm font-semibold text-slate-200">Micro-Pattern Builder</span>
                    </div>
                    <button onClick={() => setShowMicroPattern(false)} className="text-slate-500 hover:text-slate-300 transition-colors">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <label className="text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1 block">Pattern Name</label>
                      <input
                        value={editablePattern.name}
                        onChange={(e) => setEditablePattern(prev => ({ ...prev, name: e.target.value }))}
                        className="w-full px-3 py-1.5 bg-slate-800/60 border border-slate-700/50 rounded-md text-xs text-slate-200 focus:outline-none focus:border-cyan-500/40 transition-all"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1 block">Pattern Type</label>
                      <div className="flex gap-2">
                        {['Temporal', 'Behavioral', 'Composite'].map(type => (
                          <button
                            key={type}
                            onClick={() => setEditablePattern(prev => ({ ...prev, type }))}
                            className={`flex-1 px-2 py-1.5 text-[10px] font-medium rounded-md border transition-all ${
                              editablePattern.type === type
                                ? 'bg-cyan-500/15 border-cyan-500/30 text-cyan-300'
                                : 'bg-slate-800/40 border-slate-700/50 text-slate-400 hover:border-slate-600'
                            }`}
                          >
                            {type}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1 block">Event Conditions</label>
                      <div className="space-y-1.5">
                        {editablePattern.conditions.map((cond, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <span className="w-4 h-4 rounded-full bg-cyan-500/10 flex items-center justify-center text-[9px] font-bold text-cyan-400 flex-shrink-0">{i + 1}</span>
                            <input
                              value={cond}
                              onChange={(e) => {
                                const newConds = [...editablePattern.conditions];
                                newConds[i] = e.target.value;
                                setEditablePattern(prev => ({ ...prev, conditions: newConds }));
                              }}
                              className="flex-1 px-2.5 py-1 bg-slate-800/60 border border-slate-700/50 rounded-md text-[11px] text-slate-300 focus:outline-none focus:border-cyan-500/40 transition-all"
                            />
                            <button
                              onClick={() => {
                                setEditablePattern(prev => ({
                                  ...prev,
                                  conditions: prev.conditions.filter((_, idx) => idx !== i),
                                }));
                              }}
                              className="text-slate-600 hover:text-red-400 transition-colors"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                      <button
                        onClick={() => setEditablePattern(prev => ({ ...prev, conditions: [...prev.conditions, ''] }))}
                        className="mt-2 flex items-center gap-1 text-[10px] font-medium text-cyan-400/70 hover:text-cyan-400 transition-colors"
                      >
                        <Plus className="w-3 h-3" />
                        Add Condition
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1 block">Time Window</label>
                        <input
                          value={editablePattern.timeWindow}
                          onChange={(e) => setEditablePattern(prev => ({ ...prev, timeWindow: e.target.value }))}
                          className="w-full px-3 py-1.5 bg-slate-800/60 border border-slate-700/50 rounded-md text-xs text-slate-200 focus:outline-none focus:border-cyan-500/40 transition-all"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1 block">Min Occurrences</label>
                        <input
                          type="number"
                          value={editablePattern.minOccurrences}
                          onChange={(e) => setEditablePattern(prev => ({ ...prev, minOccurrences: Number(e.target.value) }))}
                          className="w-full px-3 py-1.5 bg-slate-800/60 border border-slate-700/50 rounded-md text-xs text-slate-200 focus:outline-none focus:border-cyan-500/40 transition-all"
                        />
                      </div>
                    </div>
                    <button className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-cyan-500/15 border border-cyan-500/30 text-xs font-semibold text-cyan-300 hover:bg-cyan-500/25 transition-all">
                      <Check className="w-3.5 h-3.5" />
                      Create Pattern
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center enterprise-card">
              <Shield className="w-10 h-10 text-slate-600 mb-3" />
              <p className="text-sm font-medium text-slate-500">Countermeasures & Actions</p>
              <p className="text-xs text-slate-600 mt-1">Run a simulation to see results</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}