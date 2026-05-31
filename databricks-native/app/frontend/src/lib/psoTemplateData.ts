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

export interface PSOData {
  topAttackPaths: AttackPath[];
  highRiskNodes: HighRiskNode[];
  coverageAnalysis: CoverageAnalysis;
  controlFailureSensitivity: ControlFailure[];
  predictedNextSteps: PredictedStep[];
  graphEdges: GraphEdge[];
}

export const PSO_INSIDER: PSOData = {
  topAttackPaths: [
    {
      id: 1, name: 'DNS Tunnel Exfiltration',
      steps: ['Admin authenticates after hours via VPN', 'Disables CrowdStrike sensor on workstation', 'Accesses sensitive file shares on NAS-CORP-01', 'Encodes data into high-entropy DNS queries', 'Exfiltrates 4.2 GB over 6-hour window'],
      likelihood: 72, impact: 95, riskScore: 68, timeToCompromiseMinutes: 45, detectionProbability: 0.18,
    },
    {
      id: 2, name: 'Cloud Storage Siphon',
      steps: ['Admin escalates to Global Admin in Azure AD', 'Creates shadow service principal', 'Syncs SharePoint document libraries to personal OneDrive', 'Downloads via personal device outside DLP scope'],
      likelihood: 58, impact: 88, riskScore: 51, timeToCompromiseMinutes: 90, detectionProbability: 0.31,
    },
    {
      id: 3, name: 'USB Dead Drop',
      steps: ['Admin disables USB device control GPO', 'Copies encrypted archive to removable media', 'Physically exits facility with device', 'Uploads to anonymous file-sharing service offsite'],
      likelihood: 41, impact: 82, riskScore: 34, timeToCompromiseMinutes: 25, detectionProbability: 0.44,
    },
  ],
  highRiskNodes: [
    { node: 'SVC-ADMIN-CORP', type: 'identity', riskCentrality: 89, vulnerabilityScore: 8.2, exposureLevel: 'Critical', simulationAppearanceRate: '78% of attack paths', controlCoverage: 22 },
    { node: 'NAS-CORP-01', type: 'data', riskCentrality: 76, vulnerabilityScore: 6.5, exposureLevel: 'High', simulationAppearanceRate: '61% of attack paths', controlCoverage: 35 },
    { node: 'DC-PRIMARY', type: 'endpoint', riskCentrality: 71, vulnerabilityScore: 5.8, exposureLevel: 'High', simulationAppearanceRate: '54% of attack paths', controlCoverage: 68 },
    { node: 'DNS-RESOLVER-INT', type: 'service', riskCentrality: 65, vulnerabilityScore: 4.2, exposureLevel: 'Medium', simulationAppearanceRate: '49% of attack paths', controlCoverage: 12 },
    { node: 'AZURE-AD-TENANT', type: 'cloud', riskCentrality: 58, vulnerabilityScore: 3.9, exposureLevel: 'High', simulationAppearanceRate: '42% of attack paths', controlCoverage: 45 },
  ],
  coverageAnalysis: {
    overallCoverage: 27, coveredPaths: 3, totalPaths: 11,
    coverageByStage: { reconnaissance: 15, initialAccess: 62, execution: 38, persistence: 22, lateralMovement: 18, exfiltration: 9 },
    improvementPotential: 'Deploying DNS entropy monitoring + after-hours admin alerting increases early detection probability by 41%',
  },
  controlFailureSensitivity: [
    { control: 'DLP on DNS Traffic', currentEffectiveness: 8, failureImpact: 'Critical', attackSuccessIncrease: 34, recommendation: 'Deploy DNS payload inspection with entropy analysis thresholds' },
    { control: 'EDR Agent Tamper Protection', currentEffectiveness: 55, failureImpact: 'Critical', attackSuccessIncrease: 28, recommendation: 'Enable kernel-level tamper protection and alert on agent stop events' },
    { control: 'Privileged Access Monitoring', currentEffectiveness: 32, failureImpact: 'High', attackSuccessIncrease: 19, recommendation: 'Implement PAM with session recording for all Tier-0 accounts' },
    { control: 'After-Hours Access Alerting', currentEffectiveness: 11, failureImpact: 'High', attackSuccessIncrease: 15, recommendation: 'Create behavioral baseline and alert on anomalous access windows' },
  ],
  predictedNextSteps: [
    { step: 'Establish persistent backdoor via scheduled task', probability: 68, mitreTechnique: 'T1053.005', timeframeMinutes: 15, indicator: 'New scheduled task creation by admin account outside change window' },
    { step: 'Lateral movement to backup infrastructure', probability: 54, mitreTechnique: 'T1021.002', timeframeMinutes: 30, indicator: 'SMB connections from admin workstation to backup VLAN' },
    { step: 'Cover tracks by clearing Windows event logs', probability: 82, mitreTechnique: 'T1070.001', timeframeMinutes: 5, indicator: 'Event log cleared or Security log gap detected' },
  ],
  graphEdges: [
    { from: 'SVC-ADMIN-CORP', to: 'DC-PRIMARY', edgeType: 'privilege_escalation', transitionProbability: 0.85, modifiers: ['Domain Admin group membership', 'No PAM gateway required'] },
    { from: 'DC-PRIMARY', to: 'NAS-CORP-01', edgeType: 'data_access', transitionProbability: 0.92, modifiers: ['NTLM pass-through auth', 'No DLP on SMB traffic'] },
    { from: 'NAS-CORP-01', to: 'DNS-RESOLVER-INT', edgeType: 'network_path', transitionProbability: 0.78, modifiers: ['DNS allowed outbound by default', 'No payload inspection'] },
    { from: 'SVC-ADMIN-CORP', to: 'AZURE-AD-TENANT', edgeType: 'trust_relationship', transitionProbability: 0.71, modifiers: ['Hybrid AD sync', 'MFA fatigue possible'] },
    { from: 'AZURE-AD-TENANT', to: 'NAS-CORP-01', edgeType: 'data_access', transitionProbability: 0.65, modifiers: ['SharePoint sync to on-prem', 'OAuth token valid 24h'] },
  ],
};

export const PSO_RANSOMWARE: PSOData = {
  topAttackPaths: [
    {
      id: 1, name: 'Signed Binary Ransomware Deployment',
      steps: ['Compromised vendor pushes trojanized update', 'Signed binary passes application control', 'Spawns PowerShell to disable Volume Shadow Copy', 'Encrypts all mapped drives and network shares', 'Drops ransom note and beacons to C2'],
      likelihood: 58, impact: 98, riskScore: 57, timeToCompromiseMinutes: 180, detectionProbability: 0.22,
    },
    {
      id: 2, name: 'Fileless Memory-Only Encryption',
      steps: ['Update package loads .NET assembly in memory', 'Uses WMI to propagate to adjacent hosts', 'Injects encryption routine into svchost.exe', 'Encrypts files using AES-256 with RSA-wrapped key'],
      likelihood: 42, impact: 92, riskScore: 39, timeToCompromiseMinutes: 120, detectionProbability: 0.15,
    },
    {
      id: 3, name: 'Double Extortion via Data Theft',
      steps: ['Trojanized update establishes reverse HTTPS tunnel', 'Exfiltrates sensitive data to attacker infrastructure', 'Deploys ransomware as secondary pressure', 'Threatens public data release if ransom unpaid'],
      likelihood: 48, impact: 96, riskScore: 46, timeToCompromiseMinutes: 360, detectionProbability: 0.28,
    },
  ],
  highRiskNodes: [
    { node: 'VENDOR-UPDATE-SVC', type: 'service', riskCentrality: 94, vulnerabilityScore: 9.1, exposureLevel: 'Critical', simulationAppearanceRate: '91% of attack paths', controlCoverage: 15 },
    { node: 'FILE-SERVER-01', type: 'endpoint', riskCentrality: 82, vulnerabilityScore: 6.8, exposureLevel: 'High', simulationAppearanceRate: '73% of attack paths', controlCoverage: 42 },
    { node: 'BACKUP-CONTROLLER', type: 'endpoint', riskCentrality: 78, vulnerabilityScore: 5.5, exposureLevel: 'High', simulationAppearanceRate: '65% of attack paths', controlCoverage: 55 },
    { node: 'AD-CONNECT-SVC', type: 'identity', riskCentrality: 61, vulnerabilityScore: 4.8, exposureLevel: 'Medium', simulationAppearanceRate: '48% of attack paths', controlCoverage: 38 },
  ],
  coverageAnalysis: {
    overallCoverage: 34, coveredPaths: 4, totalPaths: 12,
    coverageByStage: { reconnaissance: 8, initialAccess: 12, execution: 45, persistence: 38, lateralMovement: 42, exfiltration: 22 },
    improvementPotential: 'Implementing SBOM verification + behavioral process monitoring covers 6 additional attack paths (+28% coverage)',
  },
  controlFailureSensitivity: [
    { control: 'Application Allowlisting', currentEffectiveness: 45, failureImpact: 'Critical', attackSuccessIncrease: 42, recommendation: 'Extend allowlisting to include hash verification for all vendor updates' },
    { control: 'Network Segmentation', currentEffectiveness: 52, failureImpact: 'Critical', attackSuccessIncrease: 31, recommendation: 'Implement micro-segmentation between update servers and production hosts' },
    { control: 'Immutable Backup Strategy', currentEffectiveness: 68, failureImpact: 'High', attackSuccessIncrease: 22, recommendation: 'Deploy air-gapped backup copies with automated integrity verification' },
    { control: 'Process Behavior Monitoring', currentEffectiveness: 35, failureImpact: 'High', attackSuccessIncrease: 18, recommendation: 'Enable child-process tree analysis for vendor application processes' },
  ],
  predictedNextSteps: [
    { step: 'Disable Windows Defender and Volume Shadow Copies', probability: 88, mitreTechnique: 'T1490', timeframeMinutes: 5, indicator: 'vssadmin delete shadows or wmic shadowcopy delete execution' },
    { step: 'Propagate via PsExec or WMI to domain-joined hosts', probability: 72, mitreTechnique: 'T1570', timeframeMinutes: 15, indicator: 'Mass PsExec connections or WMI process creation across subnet' },
    { step: 'Encrypt mapped network drives and shares', probability: 95, mitreTechnique: 'T1486', timeframeMinutes: 30, indicator: 'High volume file rename operations with entropy change' },
    { step: 'Beacon to C2 for decryption key escrow', probability: 64, mitreTechnique: 'T1071.001', timeframeMinutes: 2, indicator: 'HTTPS POST to uncategorized domain with encoded payload' },
  ],
  graphEdges: [
    { from: 'VENDOR-UPDATE-SVC', to: 'FILE-SERVER-01', edgeType: 'lateral_movement', transitionProbability: 0.88, modifiers: ['Signed binary bypasses EDR', 'Flat network topology'] },
    { from: 'FILE-SERVER-01', to: 'BACKUP-CONTROLLER', edgeType: 'network_path', transitionProbability: 0.72, modifiers: ['Same VLAN', 'No ACL between file and backup'] },
    { from: 'VENDOR-UPDATE-SVC', to: 'AD-CONNECT-SVC', edgeType: 'privilege_escalation', transitionProbability: 0.55, modifiers: ['Service account with domain privileges', 'No MFA on service accounts'] },
    { from: 'AD-CONNECT-SVC', to: 'FILE-SERVER-01', edgeType: 'trust_relationship', transitionProbability: 0.81, modifiers: ['Kerberos delegation enabled', 'Unconstrained delegation on file server'] },
  ],
};

export const PSO_PHYSICAL: PSOData = {
  topAttackPaths: [
    {
      id: 1, name: 'Badge Clone + Network Implant',
      steps: ['Clone RFID badge from parking garage proximity', 'Enter facility through loading dock during shift change', 'Plant rogue Raspberry Pi under conference room desk', 'Device establishes reverse SSH tunnel through corporate proxy', 'Perform ARP poisoning to intercept credentials on VLAN'],
      likelihood: 45, impact: 85, riskScore: 38, timeToCompromiseMinutes: 35, detectionProbability: 0.29,
    },
    {
      id: 2, name: 'Tailgating + Credential Harvest',
      steps: ['Tailgate through main entrance behind employee group', 'Access unlocked workstation in open office area', 'Install keylogger via USB rubber ducky', 'Harvest domain credentials over 48-hour window'],
      likelihood: 52, impact: 72, riskScore: 37, timeToCompromiseMinutes: 10, detectionProbability: 0.35,
    },
    {
      id: 3, name: 'Compromised Vendor Badge',
      steps: ['Obtain vendor badge through social engineering of facilities', 'Access server room during maintenance window', 'Connect laptop directly to management VLAN switch port', 'Dump switch configs and SNMP community strings'],
      likelihood: 32, impact: 91, riskScore: 29, timeToCompromiseMinutes: 60, detectionProbability: 0.42,
    },
  ],
  highRiskNodes: [
    { node: 'BADGE-READER-LOBBY', type: 'endpoint', riskCentrality: 82, vulnerabilityScore: 7.5, exposureLevel: 'Critical', simulationAppearanceRate: '85% of attack paths', controlCoverage: 40 },
    { node: 'MGMT-VLAN-SWITCH', type: 'service', riskCentrality: 74, vulnerabilityScore: 6.2, exposureLevel: 'High', simulationAppearanceRate: '58% of attack paths', controlCoverage: 28 },
    { node: 'CONF-ROOM-NET-DROP', type: 'endpoint', riskCentrality: 68, vulnerabilityScore: 8.0, exposureLevel: 'Critical', simulationAppearanceRate: '52% of attack paths', controlCoverage: 5 },
    { node: 'EMPLOYEE-WS-POOL', type: 'endpoint', riskCentrality: 55, vulnerabilityScore: 5.1, exposureLevel: 'Medium', simulationAppearanceRate: '41% of attack paths', controlCoverage: 62 },
    { node: 'FACILITIES-MGR-ACCT', type: 'identity', riskCentrality: 48, vulnerabilityScore: 4.5, exposureLevel: 'Medium', simulationAppearanceRate: '35% of attack paths', controlCoverage: 30 },
  ],
  coverageAnalysis: {
    overallCoverage: 38, coveredPaths: 3, totalPaths: 8,
    coverageByStage: { reconnaissance: 45, initialAccess: 28, execution: 52, persistence: 35, lateralMovement: 30, exfiltration: 20 },
    improvementPotential: 'Badge-to-network correlation + 802.1X enforcement covers 4 additional paths (+35% coverage)',
  },
  controlFailureSensitivity: [
    { control: '802.1X Port Authentication', currentEffectiveness: 25, failureImpact: 'Critical', attackSuccessIncrease: 38, recommendation: 'Enforce 802.1X on all access ports including conference rooms' },
    { control: 'Physical-Cyber Event Correlation', currentEffectiveness: 12, failureImpact: 'Critical', attackSuccessIncrease: 29, recommendation: 'Implement real-time badge swipe to network auth correlation engine' },
    { control: 'CCTV Analytics', currentEffectiveness: 42, failureImpact: 'High', attackSuccessIncrease: 15, recommendation: 'Deploy AI-based tailgating detection at all entry points' },
  ],
  predictedNextSteps: [
    { step: 'Perform LLMNR/NBT-NS poisoning to capture NTLMv2 hashes', probability: 74, mitreTechnique: 'T1557.001', timeframeMinutes: 10, indicator: 'Unexpected LLMNR responses from new MAC address on network segment' },
    { step: 'Relay captured hashes to authenticate to SMB shares', probability: 62, mitreTechnique: 'T1550.002', timeframeMinutes: 5, indicator: 'NTLM authentication from IP not associated with any known endpoint' },
    { step: 'Pivot to domain controller via Pass-the-Hash', probability: 45, mitreTechnique: 'T1550.002', timeframeMinutes: 20, indicator: 'Type 3 logon from previously unseen source to DC' },
  ],
  graphEdges: [
    { from: 'BADGE-READER-LOBBY', to: 'CONF-ROOM-NET-DROP', edgeType: 'network_path', transitionProbability: 0.85, modifiers: ['No 802.1X on conference ports', 'Badge grants full building access'] },
    { from: 'CONF-ROOM-NET-DROP', to: 'MGMT-VLAN-SWITCH', edgeType: 'lateral_movement', transitionProbability: 0.62, modifiers: ['Flat network allows ARP poisoning', 'No DHCP snooping'] },
    { from: 'EMPLOYEE-WS-POOL', to: 'MGMT-VLAN-SWITCH', edgeType: 'privilege_escalation', transitionProbability: 0.48, modifiers: ['Credential relay possible', 'No SMB signing enforced'] },
    { from: 'FACILITIES-MGR-ACCT', to: 'BADGE-READER-LOBBY', edgeType: 'trust_relationship', transitionProbability: 0.72, modifiers: ['Badge provisioning authority', 'No dual-approval for vendor badges'] },
  ],
};

export const PSO_ZERODAY: PSOData = {
  topAttackPaths: [
    {
      id: 1, name: 'Web Shell to Kernel Root',
      steps: ['Craft novel HTTP request exploiting memory corruption in web framework', 'Upload web shell to writable directory', 'Enumerate kernel version and load matching privilege escalation exploit', 'Gain root access and install persistent rootkit'],
      likelihood: 34, impact: 98, riskScore: 33, timeToCompromiseMinutes: 8, detectionProbability: 0.08,
    },
    {
      id: 2, name: 'API Deserialization Chain',
      steps: ['Exploit unsafe deserialization in REST API endpoint', 'Achieve remote code execution as application user', 'Escape container via kernel CVE', 'Access host filesystem and pivot to internal network'],
      likelihood: 28, impact: 90, riskScore: 25, timeToCompromiseMinutes: 15, detectionProbability: 0.12,
    },
    {
      id: 3, name: 'WAF Bypass + SQL Injection Escalation',
      steps: ['Use novel encoding to bypass WAF rules', 'Exploit second-order SQL injection in search function', 'Extract database credentials from config tables', 'Use DB credentials to access internal jump host'],
      likelihood: 38, impact: 78, riskScore: 30, timeToCompromiseMinutes: 45, detectionProbability: 0.22,
    },
  ],
  highRiskNodes: [
    { node: 'WEB-APP-PROD-01', type: 'service', riskCentrality: 95, vulnerabilityScore: 9.8, exposureLevel: 'Critical', simulationAppearanceRate: '92% of attack paths', controlCoverage: 18 },
    { node: 'APP-DB-PRIMARY', type: 'data', riskCentrality: 78, vulnerabilityScore: 6.2, exposureLevel: 'High', simulationAppearanceRate: '65% of attack paths', controlCoverage: 45 },
    { node: 'K8S-NODE-WORKER-03', type: 'endpoint', riskCentrality: 72, vulnerabilityScore: 7.1, exposureLevel: 'High', simulationAppearanceRate: '58% of attack paths', controlCoverage: 32 },
    { node: 'INTERNAL-JUMPHOST', type: 'endpoint', riskCentrality: 55, vulnerabilityScore: 4.5, exposureLevel: 'Medium', simulationAppearanceRate: '38% of attack paths', controlCoverage: 72 },
  ],
  coverageAnalysis: {
    overallCoverage: 18, coveredPaths: 2, totalPaths: 11,
    coverageByStage: { reconnaissance: 22, initialAccess: 8, execution: 15, persistence: 12, lateralMovement: 25, exfiltration: 18 },
    improvementPotential: 'Deploying RASP + behavioral syscall monitoring + container escape detection increases coverage by 38%',
  },
  controlFailureSensitivity: [
    { control: 'Web Application Firewall', currentEffectiveness: 22, failureImpact: 'Critical', attackSuccessIncrease: 45, recommendation: 'Supplement signature WAF with ML-based anomaly detection for request patterns' },
    { control: 'Runtime Application Self-Protection', currentEffectiveness: 0, failureImpact: 'Critical', attackSuccessIncrease: 35, recommendation: 'Deploy RASP agents on all public-facing application servers' },
    { control: 'Container Runtime Security', currentEffectiveness: 30, failureImpact: 'High', attackSuccessIncrease: 22, recommendation: 'Enable Falco or similar runtime monitoring for container escape indicators' },
    { control: 'Kernel Integrity Monitoring', currentEffectiveness: 15, failureImpact: 'High', attackSuccessIncrease: 18, recommendation: 'Deploy eBPF-based kernel monitoring with syscall sequence anomaly detection' },
  ],
  predictedNextSteps: [
    { step: 'Install persistent backdoor via crontab or systemd timer', probability: 78, mitreTechnique: 'T1053.003', timeframeMinutes: 3, indicator: 'New crontab entry or systemd timer created by non-standard user' },
    { step: 'Enumerate internal services via kubectl or API discovery', probability: 65, mitreTechnique: 'T1046', timeframeMinutes: 10, indicator: 'Service discovery requests from compromised pod to Kubernetes API' },
    { step: 'Exfiltrate application secrets and API keys from environment', probability: 82, mitreTechnique: 'T1552.001', timeframeMinutes: 2, indicator: 'Process reading /proc/*/environ or accessing secrets manager from unexpected source' },
    { step: 'Pivot to internal network via compromised host', probability: 55, mitreTechnique: 'T1021.004', timeframeMinutes: 20, indicator: 'SSH connections from DMZ host to internal subnet' },
  ],
  graphEdges: [
    { from: 'WEB-APP-PROD-01', to: 'APP-DB-PRIMARY', edgeType: 'data_access', transitionProbability: 0.92, modifiers: ['App has direct DB credentials', 'No query-level firewall'] },
    { from: 'WEB-APP-PROD-01', to: 'K8S-NODE-WORKER-03', edgeType: 'privilege_escalation', transitionProbability: 0.45, modifiers: ['Container escape requires kernel vuln', 'Seccomp profile not enforced'] },
    { from: 'K8S-NODE-WORKER-03', to: 'INTERNAL-JUMPHOST', edgeType: 'lateral_movement', transitionProbability: 0.55, modifiers: ['Network policy allows egress', 'SSH keys in environment variables'] },
    { from: 'APP-DB-PRIMARY', to: 'INTERNAL-JUMPHOST', edgeType: 'trust_relationship', transitionProbability: 0.38, modifiers: ['Shared credentials', 'DB admin has jump host access'] },
  ],
};

export const PSO_CLOUD: PSOData = {
  topAttackPaths: [
    {
      id: 1, name: 'OAuth Token Hijack to S3 Drain',
      steps: ['Steal OAuth token via compromised developer laptop', 'Authenticate to AWS console from anomalous location', 'Modify IAM policy to grant S3 full access to attacker role', 'Bulk download S3 buckets containing PII and financial data', 'Delete CloudTrail logs to cover tracks'],
      likelihood: 61, impact: 94, riskScore: 57, timeToCompromiseMinutes: 120, detectionProbability: 0.24,
    },
    {
      id: 2, name: 'Cross-Account Privilege Escalation',
      steps: ['Abuse assume-role chain across AWS accounts', 'Reach production account via shared IAM role', 'Enumerate and access RDS snapshots', 'Export database to attacker-controlled S3 bucket'],
      likelihood: 44, impact: 88, riskScore: 39, timeToCompromiseMinutes: 90, detectionProbability: 0.19,
    },
    {
      id: 3, name: 'API Key Leak Exploitation',
      steps: ['Find hardcoded AWS keys in public GitHub repository', 'Use keys to list and access S3 buckets', 'Deploy Lambda function for persistent access', 'Exfiltrate data through Lambda to external endpoint'],
      likelihood: 55, impact: 82, riskScore: 45, timeToCompromiseMinutes: 30, detectionProbability: 0.38,
    },
  ],
  highRiskNodes: [
    { node: 'AWS-IAM-ADMIN-ROLE', type: 'identity', riskCentrality: 88, vulnerabilityScore: 8.5, exposureLevel: 'Critical', simulationAppearanceRate: '82% of attack paths', controlCoverage: 35 },
    { node: 'S3-FINANCIAL-DATA', type: 'data', riskCentrality: 81, vulnerabilityScore: 7.2, exposureLevel: 'Critical', simulationAppearanceRate: '74% of attack paths', controlCoverage: 42 },
    { node: 'OAUTH-TOKEN-SVC', type: 'service', riskCentrality: 72, vulnerabilityScore: 6.8, exposureLevel: 'High', simulationAppearanceRate: '65% of attack paths', controlCoverage: 28 },
    { node: 'CLOUDTRAIL-LOGS', type: 'service', riskCentrality: 55, vulnerabilityScore: 3.2, exposureLevel: 'Medium', simulationAppearanceRate: '42% of attack paths', controlCoverage: 72 },
    { node: 'LAMBDA-COMPUTE', type: 'cloud', riskCentrality: 48, vulnerabilityScore: 4.1, exposureLevel: 'Medium', simulationAppearanceRate: '35% of attack paths', controlCoverage: 22 },
  ],
  coverageAnalysis: {
    overallCoverage: 32, coveredPaths: 3, totalPaths: 9,
    coverageByStage: { reconnaissance: 18, initialAccess: 42, execution: 35, persistence: 28, lateralMovement: 22, exfiltration: 15 },
    improvementPotential: 'Enabling impossible-travel detection + IAM change alerting + S3 anomaly monitoring covers 5 additional paths (+38% coverage)',
  },
  controlFailureSensitivity: [
    { control: 'Token Lifecycle Management', currentEffectiveness: 28, failureImpact: 'Critical', attackSuccessIncrease: 38, recommendation: 'Enforce 1-hour token TTL with automatic rotation and revocation on anomaly' },
    { control: 'IAM Change Monitoring', currentEffectiveness: 35, failureImpact: 'Critical', attackSuccessIncrease: 32, recommendation: 'Alert on all IAM policy modifications with mandatory approval workflow' },
    { control: 'Geolocation Correlation', currentEffectiveness: 18, failureImpact: 'High', attackSuccessIncrease: 25, recommendation: 'Implement impossible-travel detection for all cloud API authentication' },
    { control: 'S3 Access Anomaly Detection', currentEffectiveness: 42, failureImpact: 'High', attackSuccessIncrease: 20, recommendation: 'Deploy ML-based access pattern analysis on all sensitive S3 buckets' },
  ],
  predictedNextSteps: [
    { step: 'Create backdoor IAM user with programmatic access', probability: 72, mitreTechnique: 'T1136.003', timeframeMinutes: 5, indicator: 'New IAM user creation with AccessKey outside standard provisioning flow' },
    { step: 'Disable CloudTrail logging in target region', probability: 58, mitreTechnique: 'T1562.008', timeframeMinutes: 2, indicator: 'StopLogging or DeleteTrail API call from non-automation principal' },
    { step: 'Snapshot and share RDS instances to external account', probability: 44, mitreTechnique: 'T1537', timeframeMinutes: 15, indicator: 'ModifyDBSnapshotAttribute with unknown account ID' },
  ],
  graphEdges: [
    { from: 'OAUTH-TOKEN-SVC', to: 'AWS-IAM-ADMIN-ROLE', edgeType: 'privilege_escalation', transitionProbability: 0.78, modifiers: ['Long-lived tokens (24h TTL)', 'No IP restriction on token use'] },
    { from: 'AWS-IAM-ADMIN-ROLE', to: 'S3-FINANCIAL-DATA', edgeType: 'data_access', transitionProbability: 0.91, modifiers: ['Admin role has S3FullAccess', 'No S3 bucket policy restrictions'] },
    { from: 'AWS-IAM-ADMIN-ROLE', to: 'CLOUDTRAIL-LOGS', edgeType: 'data_access', transitionProbability: 0.65, modifiers: ['Admin can modify CloudTrail', 'No SCP preventing trail deletion'] },
    { from: 'AWS-IAM-ADMIN-ROLE', to: 'LAMBDA-COMPUTE', edgeType: 'trust_relationship', transitionProbability: 0.72, modifiers: ['Lambda execution role is overly permissive', 'No function URL auth required'] },
  ],
};

export const PSO_AIPOISON: PSOData = {
  topAttackPaths: [
    {
      id: 1, name: 'Training Data Injection',
      steps: ['Compromise ML engineer credentials via phishing', 'Access S3 bucket containing training datasets', 'Inject adversarial samples into labeled training data', 'Retrained model misclassifies threat categories', 'Attacks bypass ML-based detection for weeks'],
      likelihood: 28, impact: 95, riskScore: 27, timeToCompromiseMinutes: 1440, detectionProbability: 0.06,
    },
    {
      id: 2, name: 'Pipeline Config Manipulation',
      steps: ['Access MLflow tracking server via stolen API token', 'Modify hyperparameters to reduce model sensitivity', 'Model deploys with degraded performance', 'Drift appears gradual and evades monitoring thresholds'],
      likelihood: 22, impact: 82, riskScore: 18, timeToCompromiseMinutes: 720, detectionProbability: 0.11,
    },
    {
      id: 3, name: 'Model Registry Substitution',
      steps: ['Exploit weak ACL on model registry', 'Replace production model artifact with poisoned version', 'Poisoned model passes basic accuracy checks', 'Specific attack patterns systematically misclassified'],
      likelihood: 18, impact: 98, riskScore: 18, timeToCompromiseMinutes: 60, detectionProbability: 0.14,
    },
  ],
  highRiskNodes: [
    { node: 'ML-TRAINING-BUCKET', type: 'data', riskCentrality: 92, vulnerabilityScore: 8.8, exposureLevel: 'Critical', simulationAppearanceRate: '88% of attack paths', controlCoverage: 12 },
    { node: 'MLFLOW-SERVER', type: 'service', riskCentrality: 78, vulnerabilityScore: 7.2, exposureLevel: 'High', simulationAppearanceRate: '65% of attack paths', controlCoverage: 22 },
    { node: 'ML-ENGINEER-ACCT', type: 'identity', riskCentrality: 71, vulnerabilityScore: 6.5, exposureLevel: 'High', simulationAppearanceRate: '58% of attack paths', controlCoverage: 45 },
    { node: 'MODEL-REGISTRY', type: 'service', riskCentrality: 65, vulnerabilityScore: 5.8, exposureLevel: 'High', simulationAppearanceRate: '52% of attack paths', controlCoverage: 18 },
  ],
  coverageAnalysis: {
    overallCoverage: 14, coveredPaths: 1, totalPaths: 7,
    coverageByStage: { reconnaissance: 20, initialAccess: 32, execution: 8, persistence: 5, lateralMovement: 12, exfiltration: 8 },
    improvementPotential: 'Deploying data integrity checksums + model drift monitors + pipeline audit logging covers 5 additional paths (+52% coverage)',
  },
  controlFailureSensitivity: [
    { control: 'Training Data Integrity', currentEffectiveness: 8, failureImpact: 'Critical', attackSuccessIncrease: 48, recommendation: 'Implement cryptographic checksums on all training data with change-detection alerts' },
    { control: 'Model Drift Detection', currentEffectiveness: 15, failureImpact: 'Critical', attackSuccessIncrease: 35, recommendation: 'Deploy statistical drift monitors with automated rollback on anomaly' },
    { control: 'ML Pipeline Access Control', currentEffectiveness: 32, failureImpact: 'High', attackSuccessIncrease: 22, recommendation: 'Enforce MFA + approval workflow for all pipeline modifications' },
  ],
  predictedNextSteps: [
    { step: 'Widen adversarial sample coverage to additional threat categories', probability: 72, mitreTechnique: 'T1565.001', timeframeMinutes: 2880, indicator: 'Training data modification frequency exceeds baseline by >200%' },
    { step: 'Modify model evaluation metrics to mask degradation', probability: 55, mitreTechnique: 'T1059', timeframeMinutes: 120, indicator: 'Evaluation script modification outside scheduled CI/CD pipeline' },
    { step: 'Deploy additional poisoned models to shadow environments', probability: 38, mitreTechnique: 'T1195', timeframeMinutes: 480, indicator: 'Model deployment to staging from unverified source' },
  ],
  graphEdges: [
    { from: 'ML-ENGINEER-ACCT', to: 'ML-TRAINING-BUCKET', edgeType: 'data_access', transitionProbability: 0.88, modifiers: ['Direct S3 write access', 'No data integrity verification'] },
    { from: 'ML-TRAINING-BUCKET', to: 'MLFLOW-SERVER', edgeType: 'trust_relationship', transitionProbability: 0.92, modifiers: ['Automated pipeline trusts bucket data', 'No adversarial sample detection'] },
    { from: 'MLFLOW-SERVER', to: 'MODEL-REGISTRY', edgeType: 'network_path', transitionProbability: 0.85, modifiers: ['Auto-promotion on accuracy threshold', 'Threshold easily gamed'] },
    { from: 'ML-ENGINEER-ACCT', to: 'MODEL-REGISTRY', edgeType: 'privilege_escalation', transitionProbability: 0.55, modifiers: ['Registry ACL allows direct push', 'No dual-approval for production models'] },
  ],
};

export const PSO_BADGE: PSOData = {
  topAttackPaths: [
    {
      id: 1, name: 'RFID Clone to Domain Compromise',
      steps: ['Clone target badge using Proxmark3 in parking structure', 'Enter building using cloned badge during business hours', 'Access unattended workstation in open office', 'Harvest cached domain credentials using Mimikatz', 'Move laterally to domain controller via RDP'],
      likelihood: 52, impact: 88, riskScore: 46, timeToCompromiseMinutes: 90, detectionProbability: 0.32,
    },
    {
      id: 2, name: 'Server Room Physical Access',
      steps: ['Use cloned badge to access restricted server floor', 'Connect USB device to KVM console of production server', 'Deploy rootkit with physical console access', 'Establish persistent remote access via reverse tunnel'],
      likelihood: 35, impact: 96, riskScore: 34, timeToCompromiseMinutes: 20, detectionProbability: 0.45,
    },
    {
      id: 3, name: 'Credential Spray from Inside',
      steps: ['Clone badge and enter as visitor during large meeting', 'Connect to guest WiFi and pivot to corporate SSID', 'Perform password spray against O365 from internal IP', 'Compromised accounts used for BEC and data access'],
      likelihood: 48, impact: 72, riskScore: 35, timeToCompromiseMinutes: 60, detectionProbability: 0.28,
    },
  ],
  highRiskNodes: [
    { node: 'RFID-BADGE-SYSTEM', type: 'endpoint', riskCentrality: 85, vulnerabilityScore: 8.0, exposureLevel: 'Critical', simulationAppearanceRate: '92% of attack paths', controlCoverage: 30 },
    { node: 'OPEN-OFFICE-WS', type: 'endpoint', riskCentrality: 72, vulnerabilityScore: 5.5, exposureLevel: 'High', simulationAppearanceRate: '62% of attack paths', controlCoverage: 55 },
    { node: 'DC-PRIMARY', type: 'endpoint', riskCentrality: 68, vulnerabilityScore: 4.8, exposureLevel: 'High', simulationAppearanceRate: '48% of attack paths', controlCoverage: 78 },
    { node: 'SERVER-ROOM-KVM', type: 'endpoint', riskCentrality: 58, vulnerabilityScore: 7.5, exposureLevel: 'Critical', simulationAppearanceRate: '35% of attack paths', controlCoverage: 15 },
    { node: 'CORP-WIFI-CONTROLLER', type: 'service', riskCentrality: 45, vulnerabilityScore: 4.2, exposureLevel: 'Medium', simulationAppearanceRate: '28% of attack paths', controlCoverage: 52 },
  ],
  coverageAnalysis: {
    overallCoverage: 35, coveredPaths: 3, totalPaths: 9,
    coverageByStage: { reconnaissance: 25, initialAccess: 30, execution: 45, persistence: 38, lateralMovement: 42, exfiltration: 22 },
    improvementPotential: 'Anti-cloning badges + badge-network correlation + credential guard covers 5 additional paths (+40% coverage)',
  },
  controlFailureSensitivity: [
    { control: 'Badge Anti-Cloning Technology', currentEffectiveness: 15, failureImpact: 'Critical', attackSuccessIncrease: 42, recommendation: 'Upgrade to iCLASS SE or SEOS badges with rolling cryptographic codes' },
    { control: 'Physical-Network Correlation', currentEffectiveness: 8, failureImpact: 'Critical', attackSuccessIncrease: 32, recommendation: 'Real-time correlation between badge events and network authentication' },
    { control: 'Workstation Auto-Lock Policy', currentEffectiveness: 55, failureImpact: 'High', attackSuccessIncrease: 18, recommendation: 'Enforce 2-minute auto-lock with proximity-based unlock via BLE badge' },
    { control: 'Network Access Control (NAC)', currentEffectiveness: 42, failureImpact: 'High', attackSuccessIncrease: 22, recommendation: 'Deploy NAC with device profiling on all wired and wireless ports' },
  ],
  predictedNextSteps: [
    { step: 'Dump LSASS memory for domain credential extraction', probability: 78, mitreTechnique: 'T1003.001', timeframeMinutes: 5, indicator: 'LSASS memory read by non-standard process' },
    { step: 'Establish RDP session to secondary targets', probability: 65, mitreTechnique: 'T1021.001', timeframeMinutes: 15, indicator: 'RDP connections from workstation outside user baseline' },
    { step: 'Deploy persistence via WMI event subscription', probability: 52, mitreTechnique: 'T1546.003', timeframeMinutes: 10, indicator: 'WMI EventConsumer creation with command execution payload' },
  ],
  graphEdges: [
    { from: 'RFID-BADGE-SYSTEM', to: 'OPEN-OFFICE-WS', edgeType: 'network_path', transitionProbability: 0.82, modifiers: ['Legacy RFID vulnerable to cloning', 'No camera-badge correlation'] },
    { from: 'OPEN-OFFICE-WS', to: 'DC-PRIMARY', edgeType: 'privilege_escalation', transitionProbability: 0.55, modifiers: ['Cached credentials on workstation', 'Credential Guard not enforced'] },
    { from: 'RFID-BADGE-SYSTEM', to: 'SERVER-ROOM-KVM', edgeType: 'trust_relationship', transitionProbability: 0.42, modifiers: ['Same badge grants server room access', 'No biometric second factor'] },
    { from: 'CORP-WIFI-CONTROLLER', to: 'DC-PRIMARY', edgeType: 'lateral_movement', transitionProbability: 0.38, modifiers: ['Guest-to-corp VLAN hopping possible', 'Weak WiFi segmentation'] },
  ],
};

export const PSO_DDOS: PSOData = {
  topAttackPaths: [
    {
      id: 1, name: 'DDoS Smokescreen + Backdoor Exfil',
      steps: ['Launch 200 Gbps volumetric DDoS against public-facing services', 'SOC team fully engages in DDoS mitigation', 'Activate pre-planted backdoor on compromised internal server', 'Exfiltrate database dumps through encrypted HTTPS to CDN domain', 'Data exits disguised as legitimate CDN traffic during chaos'],
      likelihood: 65, impact: 92, riskScore: 60, timeToCompromiseMinutes: 45, detectionProbability: 0.15,
    },
    {
      id: 2, name: 'Application Layer DDoS + API Abuse',
      steps: ['Launch Layer 7 DDoS targeting authentication endpoints', 'Generate massive alert volume overwhelming SIEM', 'Use credential stuffing against API during alert storm', 'Compromised accounts used for authorized data access'],
      likelihood: 58, impact: 78, riskScore: 45, timeToCompromiseMinutes: 30, detectionProbability: 0.22,
    },
    {
      id: 3, name: 'DNS Amplification + Tunnel Exfil',
      steps: ['Launch DNS amplification attack against nameservers', 'DNS monitoring team focuses on amplification traffic', 'Simultaneously exfiltrate data via low-volume DNS tunneling', 'Tunnel traffic lost in noise of amplification attack'],
      likelihood: 52, impact: 85, riskScore: 44, timeToCompromiseMinutes: 60, detectionProbability: 0.18,
    },
  ],
  highRiskNodes: [
    { node: 'PUBLIC-LB-CLUSTER', type: 'service', riskCentrality: 88, vulnerabilityScore: 5.5, exposureLevel: 'High', simulationAppearanceRate: '85% of attack paths', controlCoverage: 65 },
    { node: 'INTERNAL-BACKDOOR-SRV', type: 'endpoint', riskCentrality: 82, vulnerabilityScore: 9.2, exposureLevel: 'Critical', simulationAppearanceRate: '72% of attack paths', controlCoverage: 8 },
    { node: 'SOC-SIEM-PLATFORM', type: 'service', riskCentrality: 68, vulnerabilityScore: 3.8, exposureLevel: 'Medium', simulationAppearanceRate: '55% of attack paths', controlCoverage: 45 },
    { node: 'EGRESS-PROXY-01', type: 'service', riskCentrality: 75, vulnerabilityScore: 4.5, exposureLevel: 'High', simulationAppearanceRate: '62% of attack paths', controlCoverage: 38 },
    { node: 'DNS-INFRASTRUCTURE', type: 'service', riskCentrality: 58, vulnerabilityScore: 5.2, exposureLevel: 'High', simulationAppearanceRate: '48% of attack paths', controlCoverage: 25 },
  ],
  coverageAnalysis: {
    overallCoverage: 28, coveredPaths: 3, totalPaths: 11,
    coverageByStage: { reconnaissance: 35, initialAccess: 55, execution: 22, persistence: 18, lateralMovement: 15, exfiltration: 12 },
    improvementPotential: 'Maintaining full monitoring during DDoS + separate exfil detection team increases coverage by 44%',
  },
  controlFailureSensitivity: [
    { control: 'Parallel Monitoring During DDoS', currentEffectiveness: 18, failureImpact: 'Critical', attackSuccessIncrease: 45, recommendation: 'Establish dedicated monitoring team that operates independently during DDoS incidents' },
    { control: 'Egress Traffic Anomaly Detection', currentEffectiveness: 32, failureImpact: 'Critical', attackSuccessIncrease: 35, recommendation: 'Deploy automated exfiltration detection on all egress points independent of DDoS status' },
    { control: 'SIEM Capacity Management', currentEffectiveness: 42, failureImpact: 'High', attackSuccessIncrease: 22, recommendation: 'Implement SIEM auto-scaling and priority queue for non-DDoS alerts during attacks' },
    { control: 'Backdoor Detection', currentEffectiveness: 25, failureImpact: 'High', attackSuccessIncrease: 28, recommendation: 'Regular sweep for persistence mechanisms and unauthorized network listeners' },
  ],
  predictedNextSteps: [
    { step: 'Escalate DDoS volume to maximize SOC distraction', probability: 82, mitreTechnique: 'T1498.001', timeframeMinutes: 5, indicator: 'DDoS traffic volume increase by >50% from baseline attack' },
    { step: 'Activate secondary exfiltration channel via ICMP tunnel', probability: 48, mitreTechnique: 'T1572', timeframeMinutes: 10, indicator: 'Anomalous ICMP packet sizes or frequency from internal host' },
    { step: 'Clean up backdoor artifacts post-exfiltration', probability: 72, mitreTechnique: 'T1070.004', timeframeMinutes: 15, indicator: 'File deletion on server correlated with end of exfil session' },
  ],
  graphEdges: [
    { from: 'PUBLIC-LB-CLUSTER', to: 'SOC-SIEM-PLATFORM', edgeType: 'network_path', transitionProbability: 0.95, modifiers: ['DDoS alerts flood SIEM', 'Alert fatigue guaranteed at >10k EPS'] },
    { from: 'INTERNAL-BACKDOOR-SRV', to: 'EGRESS-PROXY-01', edgeType: 'data_access', transitionProbability: 0.78, modifiers: ['HTTPS to CDN domains whitelisted', 'No TLS inspection on CDN traffic'] },
    { from: 'SOC-SIEM-PLATFORM', to: 'INTERNAL-BACKDOOR-SRV', edgeType: 'trust_relationship', transitionProbability: 0.12, modifiers: ['SOC distracted by DDoS', 'Backdoor alert drowned in noise'] },
    { from: 'DNS-INFRASTRUCTURE', to: 'EGRESS-PROXY-01', edgeType: 'network_path', transitionProbability: 0.65, modifiers: ['DNS tunnel masked by amplification', 'No DNS payload inspection'] },
  ],
};

export const PSO_TEMPLATES: Record<string, PSOData> = {
  insider: PSO_INSIDER,
  ransomware: PSO_RANSOMWARE,
  physical: PSO_PHYSICAL,
  zeroday: PSO_ZERODAY,
  cloud: PSO_CLOUD,
  aipoison: PSO_AIPOISON,
  badge: PSO_BADGE,
  ddos: PSO_DDOS,
};
