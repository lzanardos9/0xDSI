export interface EnrichedAttackStep {
  name: string;
  tactic: string;
  technique: string;
  description: string;
  source: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  phase: 'initial-access' | 'execution' | 'persistence' | 'privilege-escalation' | 'defense-evasion' | 'credential-access' | 'discovery' | 'lateral-movement' | 'collection' | 'exfiltration' | 'command-control' | 'impact';
  timestamp: string;
}

const TACTIC_KEYWORDS: Record<string, { tactic: string; phase: EnrichedAttackStep['phase']; severity: EnrichedAttackStep['severity'] }> = {
  'AUTORUN': { tactic: 'Initial Access', phase: 'initial-access', severity: 'high' },
  'LNK_EXPLOIT': { tactic: 'Initial Access', phase: 'initial-access', severity: 'critical' },
  'PHISHING': { tactic: 'Initial Access', phase: 'initial-access', severity: 'high' },
  'SPEARPHISH': { tactic: 'Initial Access', phase: 'initial-access', severity: 'critical' },
  'SUPPLY_CHAIN': { tactic: 'Initial Access', phase: 'initial-access', severity: 'critical' },
  'TYPOSQUATTING': { tactic: 'Initial Access', phase: 'initial-access', severity: 'high' },
  'WATERHOLE': { tactic: 'Initial Access', phase: 'initial-access', severity: 'high' },
  'DARKNET': { tactic: 'Reconnaissance', phase: 'initial-access', severity: 'medium' },
  'RECONNAISSANCE': { tactic: 'Reconnaissance', phase: 'initial-access', severity: 'medium' },
  'FORUM': { tactic: 'Reconnaissance', phase: 'initial-access', severity: 'medium' },
  'TOR': { tactic: 'Command & Control', phase: 'command-control', severity: 'high' },
  'I2P': { tactic: 'Command & Control', phase: 'command-control', severity: 'high' },
  'PRIVILEGE_ESCALATION': { tactic: 'Privilege Escalation', phase: 'privilege-escalation', severity: 'critical' },
  'ELEVATION': { tactic: 'Privilege Escalation', phase: 'privilege-escalation', severity: 'critical' },
  'KERNEL': { tactic: 'Privilege Escalation', phase: 'privilege-escalation', severity: 'critical' },
  'TOKEN_IMPERSONATION': { tactic: 'Privilege Escalation', phase: 'privilege-escalation', severity: 'critical' },
  'CERTIFICATE': { tactic: 'Defense Evasion', phase: 'defense-evasion', severity: 'critical' },
  'ROOTKIT': { tactic: 'Defense Evasion', phase: 'defense-evasion', severity: 'critical' },
  'OBFUSCATION': { tactic: 'Defense Evasion', phase: 'defense-evasion', severity: 'high' },
  'EVASION': { tactic: 'Defense Evasion', phase: 'defense-evasion', severity: 'high' },
  'MASQUERADE': { tactic: 'Defense Evasion', phase: 'defense-evasion', severity: 'high' },
  'POLYMORPHIC': { tactic: 'Defense Evasion', phase: 'defense-evasion', severity: 'critical' },
  'STEALTH': { tactic: 'Defense Evasion', phase: 'defense-evasion', severity: 'high' },
  'FALSE_SENSOR': { tactic: 'Defense Evasion', phase: 'defense-evasion', severity: 'critical' },
  'HOMOGLYPH': { tactic: 'Defense Evasion', phase: 'defense-evasion', severity: 'high' },
  'CODE_SIGNING': { tactic: 'Defense Evasion', phase: 'defense-evasion', severity: 'critical' },
  'LSASS': { tactic: 'Credential Access', phase: 'credential-access', severity: 'critical' },
  'CREDENTIAL': { tactic: 'Credential Access', phase: 'credential-access', severity: 'high' },
  'HARVEST': { tactic: 'Credential Access', phase: 'credential-access', severity: 'high' },
  'THEFT': { tactic: 'Credential Access', phase: 'credential-access', severity: 'critical' },
  'SAMR_ENUM': { tactic: 'Discovery', phase: 'discovery', severity: 'medium' },
  'ENUMERATION': { tactic: 'Discovery', phase: 'discovery', severity: 'medium' },
  'FINGERPRINT': { tactic: 'Discovery', phase: 'discovery', severity: 'medium' },
  'LATERAL': { tactic: 'Lateral Movement', phase: 'lateral-movement', severity: 'high' },
  'PROPAGATION': { tactic: 'Lateral Movement', phase: 'lateral-movement', severity: 'high' },
  'SPREAD': { tactic: 'Lateral Movement', phase: 'lateral-movement', severity: 'high' },
  'AIR_GAP': { tactic: 'Lateral Movement', phase: 'lateral-movement', severity: 'critical' },
  'NETWORK_SHARE': { tactic: 'Lateral Movement', phase: 'lateral-movement', severity: 'high' },
  'INJECTION': { tactic: 'Execution', phase: 'execution', severity: 'critical' },
  'HOLLOWING': { tactic: 'Execution', phase: 'execution', severity: 'critical' },
  'EXECUTION': { tactic: 'Execution', phase: 'execution', severity: 'high' },
  'MINER': { tactic: 'Execution', phase: 'execution', severity: 'high' },
  'WEBASSEMBLY': { tactic: 'Execution', phase: 'execution', severity: 'high' },
  'PLC': { tactic: 'Execution', phase: 'execution', severity: 'critical' },
  'SCADA': { tactic: 'Execution', phase: 'execution', severity: 'critical' },
  'FIRMWARE': { tactic: 'Persistence', phase: 'persistence', severity: 'critical' },
  'PERSISTENCE': { tactic: 'Persistence', phase: 'persistence', severity: 'high' },
  'SYSTEMD': { tactic: 'Persistence', phase: 'persistence', severity: 'high' },
  'CRON': { tactic: 'Persistence', phase: 'persistence', severity: 'high' },
  'SCHTASKS': { tactic: 'Persistence', phase: 'persistence', severity: 'high' },
  'WMI_EVENT': { tactic: 'Persistence', phase: 'persistence', severity: 'high' },
  'SERVICE_WORKER': { tactic: 'Persistence', phase: 'persistence', severity: 'high' },
  'UEFI': { tactic: 'Persistence', phase: 'persistence', severity: 'critical' },
  'BOOT': { tactic: 'Persistence', phase: 'persistence', severity: 'critical' },
  'EXFILTRATION': { tactic: 'Exfiltration', phase: 'exfiltration', severity: 'critical' },
  'IPFS': { tactic: 'Exfiltration', phase: 'exfiltration', severity: 'high' },
  'ENCRYPTION': { tactic: 'Impact', phase: 'impact', severity: 'critical' },
  'RANSOMWARE': { tactic: 'Impact', phase: 'impact', severity: 'critical' },
  'DESTRUCTION': { tactic: 'Impact', phase: 'impact', severity: 'critical' },
  'RESONANCE': { tactic: 'Impact', phase: 'impact', severity: 'critical' },
  'SABOTAGE': { tactic: 'Impact', phase: 'impact', severity: 'critical' },
  'DDOS': { tactic: 'Impact', phase: 'impact', severity: 'high' },
  'SMART_CONTRACT': { tactic: 'Command & Control', phase: 'command-control', severity: 'high' },
  'BLOCKCHAIN': { tactic: 'Command & Control', phase: 'command-control', severity: 'high' },
  'ORACLE_NETWORK': { tactic: 'Command & Control', phase: 'command-control', severity: 'high' },
  'C2': { tactic: 'Command & Control', phase: 'command-control', severity: 'high' },
  'PREBOOT': { tactic: 'Command & Control', phase: 'command-control', severity: 'critical' },
  'MIXER': { tactic: 'Exfiltration', phase: 'exfiltration', severity: 'high' },
  'MONERO': { tactic: 'Exfiltration', phase: 'exfiltration', severity: 'high' },
  'CASHOUT': { tactic: 'Exfiltration', phase: 'exfiltration', severity: 'high' },
  'LAUNDERING': { tactic: 'Exfiltration', phase: 'exfiltration', severity: 'high' },
  'ESCROW': { tactic: 'Command & Control', phase: 'command-control', severity: 'medium' },
  'PGP': { tactic: 'Command & Control', phase: 'command-control', severity: 'medium' },
  'VPN_CHAIN': { tactic: 'Command & Control', phase: 'command-control', severity: 'medium' },
  'OPSEC': { tactic: 'Defense Evasion', phase: 'defense-evasion', severity: 'medium' },
  'COUNTER_FORENSICS': { tactic: 'Defense Evasion', phase: 'defense-evasion', severity: 'high' },
  'LOG_WIPING': { tactic: 'Defense Evasion', phase: 'defense-evasion', severity: 'high' },
  'POISONING': { tactic: 'Impact', phase: 'impact', severity: 'critical' },
  'TRAINING_DATA': { tactic: 'Initial Access', phase: 'initial-access', severity: 'high' },
  'BACKDOOR': { tactic: 'Persistence', phase: 'persistence', severity: 'critical' },
  'TROJAN': { tactic: 'Persistence', phase: 'persistence', severity: 'critical' },
  'FEDERATED': { tactic: 'Lateral Movement', phase: 'lateral-movement', severity: 'high' },
  'MODEL_EXTRACTION': { tactic: 'Collection', phase: 'collection', severity: 'high' },
  'ADVERSARIAL': { tactic: 'Defense Evasion', phase: 'defense-evasion', severity: 'high' },
  'GRADIENT': { tactic: 'Defense Evasion', phase: 'defense-evasion', severity: 'high' },
  'SANDBOX': { tactic: 'Defense Evasion', phase: 'defense-evasion', severity: 'high' },
  'HYPERVISOR': { tactic: 'Defense Evasion', phase: 'defense-evasion', severity: 'high' },
  'DOCKER': { tactic: 'Initial Access', phase: 'initial-access', severity: 'high' },
  'GITHUB_ACTIONS': { tactic: 'Credential Access', phase: 'credential-access', severity: 'critical' },
  'NPM': { tactic: 'Initial Access', phase: 'initial-access', severity: 'high' },
  'WEBPACK': { tactic: 'Execution', phase: 'execution', severity: 'high' },
  'GPU': { tactic: 'Execution', phase: 'execution', severity: 'medium' },
  'AWS_IAM': { tactic: 'Privilege Escalation', phase: 'privilege-escalation', severity: 'critical' },
  'SHADOW_COPY': { tactic: 'Impact', phase: 'impact', severity: 'critical' },
  'BITSADMIN': { tactic: 'Command & Control', phase: 'command-control', severity: 'high' },
  'POWERSHELL': { tactic: 'Execution', phase: 'execution', severity: 'high' },
  'PRINT_SPOOLER': { tactic: 'Privilege Escalation', phase: 'privilege-escalation', severity: 'critical' },
  'FREQUENCY_CONVERTER': { tactic: 'Impact', phase: 'impact', severity: 'critical' },
  'CENTRIFUGE': { tactic: 'Impact', phase: 'impact', severity: 'critical' },
  'REINFORCEMENT': { tactic: 'Defense Evasion', phase: 'defense-evasion', severity: 'high' },
  'NEURAL_NETWORK': { tactic: 'Defense Evasion', phase: 'defense-evasion', severity: 'high' },
  'FEATURE_SPACE': { tactic: 'Defense Evasion', phase: 'defense-evasion', severity: 'high' },
  'ZERO_KNOWLEDGE': { tactic: 'Defense Evasion', phase: 'defense-evasion', severity: 'high' },
  'DISTRIBUTED_KEY': { tactic: 'Command & Control', phase: 'command-control', severity: 'high' },
  'HOMOMORPHIC': { tactic: 'Defense Evasion', phase: 'defense-evasion', severity: 'high' },
  'DAO': { tactic: 'Command & Control', phase: 'command-control', severity: 'high' },
  'PROOF_OF_WORK': { tactic: 'Impact', phase: 'impact', severity: 'high' },
  'REPUTATION': { tactic: 'Reconnaissance', phase: 'initial-access', severity: 'medium' },
  'DISPOSABLE': { tactic: 'Defense Evasion', phase: 'defense-evasion', severity: 'medium' },
  'BROKER': { tactic: 'Reconnaissance', phase: 'initial-access', severity: 'high' },
  'MARKETPLACE': { tactic: 'Reconnaissance', phase: 'initial-access', severity: 'high' },
  'AFFILIATE': { tactic: 'Command & Control', phase: 'command-control', severity: 'high' },
  'WATERMARK': { tactic: 'Defense Evasion', phase: 'defense-evasion', severity: 'medium' },
  'MEMBERSHIP_INFERENCE': { tactic: 'Collection', phase: 'collection', severity: 'high' },
  'MODEL_INVERSION': { tactic: 'Collection', phase: 'collection', severity: 'high' },
  'TRANSFER_LEARNING': { tactic: 'Lateral Movement', phase: 'lateral-movement', severity: 'high' },
  'SELF_HEALING': { tactic: 'Persistence', phase: 'persistence', severity: 'critical' },
  'NETWORK_CARD': { tactic: 'Persistence', phase: 'persistence', severity: 'critical' },
  'PCI_ROM': { tactic: 'Persistence', phase: 'persistence', severity: 'critical' },
  'TPM': { tactic: 'Defense Evasion', phase: 'defense-evasion', severity: 'critical' },
  'PCR': { tactic: 'Defense Evasion', phase: 'defense-evasion', severity: 'critical' },
};

const TECHNIQUE_MAP: Record<string, string> = {
  'USB_AUTORUN': 'T1091 - Replication Through Removable Media',
  'LNK_EXPLOIT': 'T1204.002 - User Execution: Malicious File',
  'PRINT_SPOOLER': 'T1068 - Exploitation for Privilege Escalation',
  'KERNEL': 'T1068 - Exploitation for Privilege Escalation',
  'TASK_SCHEDULER': 'T1053.005 - Scheduled Task',
  'CERTIFICATE': 'T1553.002 - Code Signing Certificates',
  'CODE_SIGNING': 'T1553.002 - Code Signing Certificates',
  'PLC': 'T0843 - Program Download',
  'SCADA': 'T0855 - Unauthorized Command Message',
  'ROOTKIT': 'T1014 - Rootkit',
  'FIRMWARE': 'T1542.001 - System Firmware',
  'UEFI': 'T1542.001 - System Firmware',
  'SHADOW_COPY': 'T1490 - Inhibit System Recovery',
  'POWERSHELL': 'T1059.001 - PowerShell',
  'BITSADMIN': 'T1197 - BITS Jobs',
  'LSASS': 'T1003.001 - LSASS Memory',
  'SCHTASKS': 'T1053.005 - Scheduled Task',
  'WMI_EVENT': 'T1546.003 - WMI Event Subscription',
  'TOKEN_IMPERSONATION': 'T1134.001 - Token Impersonation',
  'HOLLOWING': 'T1055.012 - Process Hollowing',
  'SAMR_ENUM': 'T1087.002 - Domain Account',
  'NPM': 'T1195.002 - Compromise Software Supply Chain',
  'DOCKER': 'T1195.002 - Compromise Software Supply Chain',
  'GITHUB_ACTIONS': 'T1552.001 - Credentials in Files',
  'WEBPACK': 'T1195.002 - Compromise Software Supply Chain',
  'SYSTEMD': 'T1543.002 - Systemd Service',
  'CRON': 'T1053.003 - Cron',
  'SERVICE_WORKER': 'T1176 - Browser Extensions',
  'BOOT': 'T1542 - Pre-OS Boot',
  'NETWORK_SHARE': 'T1021.002 - SMB/Windows Admin Shares',
  'SMART_CONTRACT': 'T1071.001 - Web Protocols',
  'TOR': 'T1090.003 - Multi-hop Proxy',
  'I2P': 'T1090.003 - Multi-hop Proxy',
  'PHISHING': 'T1566.001 - Spearphishing Attachment',
  'RANSOMWARE': 'T1486 - Data Encrypted for Impact',
  'ENCRYPTION': 'T1486 - Data Encrypted for Impact',
  'AWS_IAM': 'T1078.004 - Cloud Accounts',
  'ADVERSARIAL': 'T1588.005 - Exploits',
  'POISONING': 'T1565.001 - Stored Data Manipulation',
  'TRAINING_DATA': 'T1565.001 - Stored Data Manipulation',
  'HOMOGLYPH': 'T1036.003 - Rename System Utilities',
  'MASQUERADE': 'T1036 - Masquerading',
  'DDOS': 'T1498 - Network Denial of Service',
  'OBFUSCATION': 'T1027 - Obfuscated Files or Information',
  'POLYMORPHIC': 'T1027.001 - Binary Padding',
  'AIR_GAP': 'T1091 - Replication Through Removable Media',
  'SANDBOX': 'T1497 - Virtualization/Sandbox Evasion',
  'HYPERVISOR': 'T1497.001 - System Checks',
  'LOG_WIPING': 'T1070.001 - Clear Windows Event Logs',
  'COUNTER_FORENSICS': 'T1070 - Indicator Removal',
  'VPN_CHAIN': 'T1090.003 - Multi-hop Proxy',
  'PGP': 'T1573.001 - Symmetric Cryptography',
  'MONERO': 'T1496 - Resource Hijacking',
  'MIXER': 'T1537 - Transfer Data to Cloud Account',
  'IPFS': 'T1567.002 - Exfiltration to Cloud Storage',
  'GPU': 'T1496 - Resource Hijacking',
  'WEBASSEMBLY': 'T1059 - Command and Scripting Interpreter',
  'SELF_HEALING': 'T1547 - Boot or Logon Autostart Execution',
  'BACKDOOR': 'T1547 - Boot or Logon Autostart Execution',
  'TROJAN': 'T1547 - Boot or Logon Autostart Execution',
  'TPM': 'T1553 - Subvert Trust Controls',
  'PCI_ROM': 'T1542.001 - System Firmware',
  'NETWORK_CARD': 'T1542.001 - System Firmware',
  'PREBOOT': 'T1542 - Pre-OS Boot',
};

const SOURCE_MAP: Record<string, string> = {
  'initial-access': 'perimeter-ids',
  'execution': 'edr-agent',
  'persistence': 'edr-agent',
  'privilege-escalation': 'edr-agent',
  'defense-evasion': 'behavioral-analytics',
  'credential-access': 'identity-provider',
  'discovery': 'network-monitor',
  'lateral-movement': 'network-ndr',
  'collection': 'dlp-sensor',
  'exfiltration': 'proxy-gateway',
  'command-control': 'dns-firewall',
  'impact': 'siem-correlator',
};

function humanizeName(vectorStr: string): string {
  return vectorStr
    .replace(/_/g, ' ')
    .replace(/\b(CVE)\s+(\d{4})\s+(\d+)/gi, 'CVE-$2-$3')
    .replace(/\bDCE\/RPC\b/g, 'DCE/RPC')
    .split(' ')
    .map(word => {
      if (/^(CVE|RPC|DCE|PLC|SCADA|UEFI|TPM|PCR|USB|PCI|ROM|GPU|NPM|AWS|IAM|WMI|AI|ML|DAO|IPFS|DDOS|VPN|PGP|I2P|TOR|LSASS|VSS|SMB|RaaS|BITSADMIN)$/i.test(word)) {
        return word.toUpperCase();
      }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
}

function matchKeyword(vectorStr: string): { tactic: string; phase: EnrichedAttackStep['phase']; severity: EnrichedAttackStep['severity'] } {
  const upper = vectorStr.toUpperCase();

  for (const [keyword, info] of Object.entries(TACTIC_KEYWORDS)) {
    if (upper.includes(keyword)) {
      return info;
    }
  }

  return { tactic: 'Execution', phase: 'execution', severity: 'high' };
}

function matchTechnique(vectorStr: string): string {
  const upper = vectorStr.toUpperCase();
  for (const [keyword, technique] of Object.entries(TECHNIQUE_MAP)) {
    if (upper.includes(keyword)) {
      return technique;
    }
  }
  return 'T1059 - Command and Scripting Interpreter';
}

function generateDescription(vectorStr: string, name: string): string {
  const upper = vectorStr.toUpperCase();

  const descMap: [string, string][] = [
    ['USB_AUTORUN_LNK', 'Weaponized .LNK shortcut on USB drive exploits Windows Shell vulnerability for automatic code execution on insertion'],
    ['PRINT_SPOOLER', 'Windows Print Spooler service exploited to escalate from user-level to SYSTEM privileges'],
    ['WIN32K_KERNEL', 'Zero-day kernel vulnerability in win32k.sys exploited for ring-0 privilege escalation'],
    ['TASK_SCHEDULER_ELEVATION', 'Windows Task Scheduler leveraged to execute payload with elevated SYSTEM context'],
    ['REALTEK_DIGITAL_CERTIFICATE', 'Stolen Realtek Semiconductor code-signing certificate used to sign malicious drivers, bypassing trust checks'],
    ['JMICRON_CERTIFICATE', 'Compromised JMicron Technology certificate used as fallback code-signing identity'],
    ['SIEMENS_STEP7', 'Siemens STEP 7 engineering workstation project files infected to propagate to PLCs on next upload'],
    ['PLC_ROOTKIT', 'Custom rootkit injected into PLC firmware, intercepting and modifying control logic in real-time'],
    ['SCADA_MAN_IN_MIDDLE', 'Man-in-the-middle between SCADA HMI and PLCs replaces legitimate commands with destructive payloads'],
    ['FREQUENCY_CONVERTER', 'Variable-frequency drives manipulated to push centrifuge rotors past safe operating speeds'],
    ['CENTRIFUGE_RESONANCE', 'Centrifuge rotor speed oscillated at mechanical resonance frequency causing catastrophic physical failure'],
    ['FALSE_SENSOR_DATA', 'Sensor readings spoofed to show normal operations while physical process runs destructively'],
    ['AIR_GAP_USB', 'Worm propagates across air-gapped networks via infected USB drives carried between facilities'],
    ['SUPPLY_CHAIN_VENDOR', 'Upstream vendor systems compromised to insert backdoors into legitimate software distribution'],
    ['PRECISION_TARGETING', 'Malware fingerprints host environment and only activates when specific hardware/software configuration detected'],
    ['ETHEREUM_SMART_CONTRACT', 'Encryption keys escrowed in Ethereum smart contracts with time-locked release after payment confirmation'],
    ['TIME_LOCKED_DECRYPTION', 'Decryption keys held in blockchain time-lock contracts, auto-releasing only after ransom payment verified'],
    ['ORACLE_NETWORK_PAYMENT', 'Decentralized oracle network monitors blockchain for payment confirmations before triggering key release'],
    ['PRIVATE_BLOCKCHAIN_VICTIM', 'Distributed private ledger maintains encrypted victim database across 500+ resilient nodes'],
    ['PROOF_OF_WORK_FILE', 'Each file decryption requires solving a proof-of-work puzzle, preventing automated bulk recovery'],
    ['DAO_RANSOMWARE', 'Decentralized autonomous organization coordinates ransomware operations with no single point of failure'],
    ['IPFS_ENCRYPTED', 'Stolen data distributed across IPFS network with content-addressed encryption for permanent availability'],
    ['ZERO_KNOWLEDGE', 'Zero-knowledge proofs verify ransom payments without revealing transaction details to investigators'],
    ['DISTRIBUTED_KEY', 'Decryption keys generated using distributed key generation protocol across multiple independent nodes'],
    ['HOMOMORPHIC_ENCRYPTION', 'Ransom negotiation conducted over homomorphically encrypted channel, preventing interception'],
    ['UEFI_BOOT_SERVICES', 'UEFI boot services modified to inject malicious code before operating system loads'],
    ['PCI_ROM_OPTION', 'PCI Option ROM on network card firmware overwritten with persistent implant code'],
    ['NETWORK_CARD_FIRMWARE', 'Network interface card firmware reflashed to create OS-agnostic persistence in network stack'],
    ['PREBOOT_NETWORK_STACK', 'Pre-boot execution environment hooks establish command & control before OS initialization'],
    ['TPM_PCR_MEASUREMENT', 'TPM Platform Configuration Register values forged to defeat Secure Boot verification chain'],
    ['POWERSHELL_OBFUSCATION', '7 layers of PowerShell encoding obfuscation detected, evading all signature-based detection'],
    ['BITSADMIN_STAGED', 'BITS transfer jobs used for stealthy staged payload downloads mimicking Windows Update traffic'],
    ['SHADOW_COPY_DELETION', 'Volume Shadow Copy Service targeted for gradual deletion over 90 days to prevent backup recovery'],
    ['FILE_ENUMERATION', 'Filesystem enumeration conducted at 3-5 files/hour over 90 days to build comprehensive encryption target list'],
    ['NETWORK_SHARE_ENCRYPTION', 'Synchronized encryption triggered across 500+ systems within a 4-minute window via modified bootloader'],
    ['NPM_PACKAGE_TYPOSQUATTING', 'Malicious npm packages published with names similar to popular libraries, downloaded by unsuspecting developers'],
    ['WEBPACK_BUILD_HOOK', 'Malicious webpack plugin injected during CI/CD build process, tainting all production bundles'],
    ['WEBASSEMBLY_CRYPTO', 'WebAssembly-based cryptocurrency miner activated during browser idle time, fragmenting GPU across tabs'],
    ['SERVICE_WORKER_PERSISTENCE', 'Service worker registered for persistent background execution, surviving page reloads and tab closures'],
    ['GPU_COMPUTE_SPIKE', 'GPU compute usage fragmented across multiple browser tabs to stay below monitoring thresholds'],
    ['NPM_DEPENDENCY_CONFUSION', 'Internal package names hijacked via public npm registry dependency confusion attack'],
    ['DOCKER_IMAGE_LAYER', 'Malicious layers injected into Docker base images used across the organization'],
    ['GITHUB_ACTIONS_SECRETS', 'CI/CD pipeline secrets exfiltrated from GitHub Actions workflow environment variables'],
    ['UNICODE_HOMOGLYPH', 'Variable names replaced with Unicode homoglyphs to hide backdoor code in plain sight during code review'],
    ['CODE_SIGNING_CERT_COMPROMISE', 'Code-signing certificate private key stolen and used to sign malicious update packages'],
    ['SYSTEMD_SERVICE_MASQUERADE', 'Malicious systemd service disguised as legitimate system service with similar naming'],
    ['CRON_JOB_OBFUSCATION', 'Cron jobs obfuscated with encoded payloads and randomized execution schedules'],
    ['KERNEL_MODULE_ROOTKIT', 'Loadable kernel module rootkit installed for ring-0 persistence and syscall interception'],
    ['SELF_HEALING_MALWARE', 'Self-healing malware recreates itself from 5 distributed backup locations if any instance is detected and removed'],
    ['AWS_IAM_ROLE_ASSUMPTION', 'Chained AWS IAM role assumptions used to escalate privileges across cloud accounts'],
    ['ML_MODEL_ADVERSARIAL', 'Adversarial examples generated by training against target defensive ML model architectures'],
    ['POLYMORPHIC_CODE_GENERATION', 'AI-driven polymorphic engine generates unique code variants for each infection, defeating signatures'],
    ['REINFORCEMENT_LEARNING', 'Reinforcement learning agent adapts evasion tactics in real-time based on detection feedback'],
    ['GRADIENT_PERTURBATION', 'Gradient-based perturbations applied to malware features to fool neural network classifiers'],
    ['NEURAL_NETWORK_CLASSIFIER', 'Deep neural network classifiers fooled by adversarial examples crafted in feature space'],
    ['SANDBOX_TIMING_ATTACK', 'Sandbox environment detected via CPU timing side-channel analysis, triggering benign behavior'],
    ['HYPERVISOR_ARTIFACT', 'Hypervisor artifacts detected through CPUID, registry, and memory layout analysis to evade VMs'],
    ['DYNAMIC_OBFUSCATION', 'Dynamic obfuscation engine rewrites code at runtime to evade behavioral analysis'],
    ['FEATURE_SPACE_MANIPULATION', 'Machine learning feature vectors manipulated to appear benign while maintaining malicious functionality'],
    ['DEFENSIVE_MODEL_POISONING', 'Defensive ML models gradually poisoned through adversarial training data injection'],
    ['TRAINING_DATA_POISONING', 'Training datasets injected with poisoned samples containing hidden backdoor triggers'],
    ['BACKDOOR_TRIGGER', 'Neural network backdoor activated by specific trigger patterns in input data'],
    ['TRANSFER_LEARNING_PROPAGATION', 'Backdoor propagates through transfer learning as poisoned base models are fine-tuned for new tasks'],
    ['MODEL_INVERSION_GRADIENT', 'Model inversion attack extracts private training data through gradient analysis'],
    ['MEMBERSHIP_INFERENCE', 'Membership inference attack determines if specific records were in the training dataset'],
    ['NEURAL_NETWORK_TROJAN', 'Trojan embedded in neural network weights, undetectable by standard model inspection'],
    ['FEDERATED_LEARNING', 'Federated learning protocol manipulated to inject backdoors through malicious gradient updates'],
    ['MODEL_EXTRACTION', 'Target model functionality stolen through systematic query-based model extraction attack'],
    ['ADVERSARIAL_TRIGGER', 'Carefully designed adversarial trigger patterns activate dormant backdoor in deployed models'],
    ['WATERMARK_REMOVAL', 'Model watermarks removed to evade ownership detection and attribution'],
    ['SCHTASKS_QUERY', 'Scheduled task created 72 hours before execution to evade temporal correlation detection'],
    ['WMI_EVENT_SUBSCRIPTION', 'WMI permanent event subscription established for fileless persistence through management framework'],
    ['DELAYED_PROCESS_HOLLOWING', 'Process hollowing technique with 72-hour delay between credential theft and payload execution'],
    ['TOKEN_IMPERSONATION', 'Security token duplicated and impersonated to assume identity of privileged service account'],
    ['LSASS_MEMORY_READ', 'LSASS process memory dumped across 15+ systems to harvest cached domain credentials'],
    ['DCE/RPC_SAMR_ENUM', 'Security Account Manager enumerated via DCE/RPC to map domain user and group structure'],
    ['DARKNET_FORUM', 'Darknet forums (RaidForums, Exploit.in, XSS.is) used for reconnaissance and attack coordination'],
    ['TOR_HIDDEN_SERVICE', 'Tor hidden service (.onion) used for encrypted command & control communication'],
    ['I2P_GARLIC_ROUTING', 'I2P garlic routing protocol used for multi-layered anonymous coordination between operators'],
    ['INITIAL_ACCESS_BROKER', 'Enterprise VPN credentials purchased from initial access broker for $45,000'],
    ['ZERO_DAY_EXPLOIT_MARKETPLACE', 'Zero-day exploit purchased for $250,000 from underground exploit marketplace vendor'],
    ['EXPLOIT_AS_SERVICE', 'Exploit-as-a-Service subscription provides managed exploit delivery infrastructure'],
    ['RANSOMWARE_AS_SERVICE', 'RaaS affiliate program provides custom ransomware build with 24/7 negotiation support'],
    ['CRYPTOCURRENCY_MIXER', 'Ransom payments tumbled through 15 cryptocurrency mixing services to obscure trail'],
    ['MONERO_PRIVACY_COIN', 'Monero privacy coin used for untraceable ransom payments with ring signatures'],
    ['DECENTRALIZED_EXCHANGE', 'Decentralized exchange used for anonymous cryptocurrency cashout without KYC verification'],
    ['ESCROW_SERVICE', 'Underground escrow service holds funds until successful encryption confirmed by operator'],
    ['PGP_ENCRYPTED', 'All operator coordination conducted over PGP-encrypted channels with rotating key pairs'],
    ['VPN_CHAIN_OPSEC', 'Multi-hop VPN chains through 4+ jurisdictions used for operational security'],
    ['DISPOSABLE_INFRASTRUCTURE', 'Disposable servers and domains burned after each operation phase, leaving no forensic trail'],
    ['COUNTER_FORENSICS_LOG', 'System and security logs wiped using counter-forensics techniques to destroy evidence'],
    ['REPUTATION_SYSTEM_VENDOR', 'Underground marketplace reputation and vouch system used to verify vendor reliability'],
    ['DDOS_BOTNET_DISTRACTION', 'DDoS botnet ($5k rental) used as distraction attack during primary intrusion phase'],
    ['PHISHING_KIT_CREDENTIAL', 'Custom phishing kit ($2k) deployed for targeted credential harvesting campaign'],
  ];

  for (const [pattern, desc] of descMap) {
    if (upper.includes(pattern)) return desc;
  }

  return `Attack step detected: ${name}`;
}

export function enrichAttackSteps(attackVector: string[], baseTimestamp: string, baseSeverity: string): EnrichedAttackStep[] {
  const baseTime = new Date(baseTimestamp || Date.now()).getTime();

  return attackVector.map((step, idx) => {
    const { tactic, phase, severity } = matchKeyword(step);
    const technique = matchTechnique(step);
    const name = humanizeName(step);
    const description = generateDescription(step, name);
    const source = SOURCE_MAP[phase] || 'siem-correlator';

    const stepTime = new Date(baseTime + idx * (Math.random() * 3600000 + 600000));

    return {
      name,
      tactic,
      technique,
      description,
      source,
      severity: baseSeverity === 'critical' ? severity : baseSeverity as EnrichedAttackStep['severity'],
      phase,
      timestamp: stepTime.toISOString(),
    };
  });
}

export const PHASE_COLORS: Record<string, string> = {
  'initial-access': '#f59e0b',
  'execution': '#ef4444',
  'persistence': '#8b5cf6',
  'privilege-escalation': '#dc2626',
  'defense-evasion': '#6366f1',
  'credential-access': '#e11d48',
  'discovery': '#0ea5e9',
  'lateral-movement': '#f97316',
  'collection': '#14b8a6',
  'exfiltration': '#ec4899',
  'command-control': '#6366f1',
  'impact': '#dc2626',
};

export const SEVERITY_COLORS: Record<string, string> = {
  critical: '#ef4444',
  high: '#f97316',
  medium: '#eab308',
  low: '#3b82f6',
};
