import { supabase } from './supabase';

export interface CWCentroid {
  id: string;
  name: string;
  actor_class: string;
  actor_country: string;
  embedding: number[];
  description: string;
  severity: string;
  mitre_tactics: string[];
  color: string;
}

export interface CWNode {
  id: string;
  session_id: string;
  label: string;
  entity_type: string;
  payload: any;
  embedding: number[];
  x: number;
  y: number;
  z: number;
  is_benign: boolean;
  best_centroid_id: string | null;
  best_similarity: number;
  tick_index: number;
  created_at: string;
}

export interface CWEdge {
  id: string;
  session_id: string;
  source_id: string;
  target_id: string;
  weight: number;
  kind: string;
  created_at: string;
}

export interface CWHit {
  id: string;
  session_id: string;
  node_id: string;
  centroid_id: string;
  similarity: number;
  created_at: string;
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-9);
}

const BENIGN_LABELS = [
  'login_success', 'file_open', 'http_get', 'dns_query', 'process_start',
  'email_received', 'cloud_sync', 'patch_applied', 'screenshot', 'vpn_connect',
  'sso_token_refresh', 'github_clone', 'slack_message', 'calendar_event',
];

const MALICIOUS_TEMPLATES = [
  { label: 'powershell_obfuscated_b64', bias: 'state-sponsored' },
  { label: 'lsass_memory_dump', bias: 'state-sponsored' },
  { label: 'wmic_lateral_exec', bias: 'state-sponsored' },
  { label: 'pix_anomalous_transfer', bias: 'criminal' },
  { label: 'usb_mass_storage_attached', bias: 'insider' },
  { label: 'cicd_pipeline_artifact_swap', bias: 'supply-chain' },
  { label: 'okta_mfa_fatigue_spam', bias: 'criminal' },
  { label: 'kerberoast_ticket_request', bias: 'state-sponsored' },
  { label: 'satellite_c2_beacon', bias: 'state-sponsored' },
  { label: 'wiper_payload_drop', bias: 'state-sponsored' },
  { label: 'bgp_route_hijack', bias: 'state-sponsored' },
  { label: 'firmware_implant_flash', bias: 'state-sponsored' },
  { label: 'ultrasonic_emanation_detected', bias: 'state-sponsored' },
  { label: 'oauth_consent_phishing', bias: 'state-sponsored' },
  { label: 'movetit_sqli_burst', bias: 'criminal' },
  { label: 'shadow_copy_deletion', bias: 'criminal' },
  { label: 'helpdesk_voice_clone_call', bias: 'criminal' },
  { label: 'ad_dcsync_replication', bias: 'state-sponsored' },
];

function randomEmbedding(bias?: number[]): number[] {
  const v = Array.from({ length: 8 }, () => Math.random());
  if (bias) {
    for (let i = 0; i < 8; i++) v[i] = v[i] * 0.35 + bias[i] * 0.65 + (Math.random() - 0.5) * 0.08;
  }
  let mag = 0;
  for (const x of v) mag += x * x;
  mag = Math.sqrt(mag) || 1;
  return v.map(x => x / mag);
}

export async function createSession(name: string): Promise<string> {
  const { data, error } = await supabase
    .from('chronoweave_sessions')
    .insert({ name, status: 'running' })
    .select('id')
    .maybeSingle();
  if (error) throw error;
  return data!.id;
}

export async function loadCentroids(): Promise<CWCentroid[]> {
  const { data } = await supabase.from('chronoweave_bad_centroids').select('*');
  return (data || []) as CWCentroid[];
}

// Pool of creative emerging-threat centroids that can be discovered over time
const EMERGING_CENTROID_POOL: Array<Omit<CWCentroid, 'id'>> = [
  { name: 'Crimson Sandstorm / IRGC-MOIS', actor_class: 'state-sponsored', actor_country: 'IR', embedding: [0.62,0.41,0.78,0.85,0.22,0.55,0.91,0.18], description: 'Iranian dual-mandate ops, watering-hole + IT-supplier compromise', severity: 'critical', mitre_tactics: ['initial-access','persistence'], color: '#fb7185' },
  { name: 'Diamond Sleet / DPRK 3CX', actor_class: 'state-sponsored', actor_country: 'KP', embedding: [0.81,0.22,0.67,0.45,0.92,0.18,0.55,0.78], description: 'Cascading software supply-chain (3CX/X_Trader-style)', severity: 'critical', mitre_tactics: ['initial-access','impact'], color: '#ef4444' },
  { name: 'Storm-0558 / MS Token Forge', actor_class: 'state-sponsored', actor_country: 'CN', embedding: [0.78,0.91,0.45,0.22,0.18,0.85,0.62,0.31], description: 'Cloud token forgery via stolen signing keys, Exchange Online', severity: 'critical', mitre_tactics: ['credential-access','collection'], color: '#f97316' },
  { name: 'GhostWriter / UNC1151', actor_class: 'state-sponsored', actor_country: 'BY', embedding: [0.55,0.78,0.31,0.91,0.22,0.45,0.18,0.85], description: 'Belarus disinfo + credential phishing of NATO-EU diplomats', severity: 'high', mitre_tactics: ['initial-access','collection'], color: '#fb923c' },
  { name: 'Earth Lusca / TAG-22', actor_class: 'state-sponsored', actor_country: 'CN', embedding: [0.45,0.62,0.91,0.18,0.78,0.31,0.55,0.85], description: 'Telecom and gov targets, Cobalt Strike + custom backdoors', severity: 'high', mitre_tactics: ['lateral-movement','collection'], color: '#fbbf24' },
  { name: 'MuddyWater / TEMP.Zagros', actor_class: 'state-sponsored', actor_country: 'IR', embedding: [0.22,0.85,0.45,0.62,0.91,0.18,0.78,0.31], description: 'Iranian MOIS, PowGoop loader, telecom and gov ME-targeting', severity: 'high', mitre_tactics: ['persistence','collection'], color: '#facc15' },
  { name: 'BlackTech / Circuit Panda', actor_class: 'state-sponsored', actor_country: 'CN', embedding: [0.91,0.18,0.55,0.78,0.45,0.62,0.31,0.85], description: 'Cisco router firmware modification, JP/TW telecom espionage', severity: 'critical', mitre_tactics: ['persistence','defense-evasion'], color: '#fb7185' },
  { name: 'RomCom / Cuba 2.0', actor_class: 'criminal', actor_country: 'RU', embedding: [0.18,0.91,0.62,0.55,0.45,0.78,0.31,0.85], description: 'Industrial Spy ransomware splinter, Ukrainian gov phishing', severity: 'high', mitre_tactics: ['initial-access','exfiltration'], color: '#a3e635' },
  { name: 'Akira Ransomware', actor_class: 'criminal', actor_country: 'RU', embedding: [0.62,0.45,0.91,0.78,0.18,0.55,0.85,0.22], description: 'Megazord/Akira, ESXi targeting, VPN cred-stuffing entry', severity: 'critical', mitre_tactics: ['initial-access','impact'], color: '#22d3ee' },
  { name: 'Rhysida / Vice Society 2', actor_class: 'criminal', actor_country: '', embedding: [0.78,0.55,0.18,0.91,0.62,0.31,0.45,0.85], description: 'Rhysida ransomware, healthcare and education vertical focus', severity: 'critical', mitre_tactics: ['exfiltration','impact'], color: '#34d399' },
  { name: '8Base / Phobos', actor_class: 'criminal', actor_country: '', embedding: [0.45,0.78,0.85,0.31,0.62,0.91,0.18,0.55], description: 'Phobos-derivative double-extortion, SMB/RDP brute force', severity: 'high', mitre_tactics: ['initial-access','impact'], color: '#fbbf24' },
  { name: 'IcedID / BokBot Reload', actor_class: 'criminal', actor_country: 'RU', embedding: [0.31,0.62,0.78,0.91,0.18,0.85,0.55,0.45], description: 'Banking trojan turned access broker, OneNote droppers', severity: 'high', mitre_tactics: ['initial-access','collection'], color: '#fb923c' },
  { name: 'AsyncRAT Botnet', actor_class: 'criminal', actor_country: '', embedding: [0.55,0.31,0.62,0.78,0.85,0.91,0.18,0.45], description: 'Open-source RAT mass-deployment, DGA C2, plugin ecosystem', severity: 'medium', mitre_tactics: ['command-and-control'], color: '#facc15' },
  { name: 'CL0P GoAnywhere', actor_class: 'criminal', actor_country: 'RU', embedding: [0.85,0.45,0.78,0.62,0.31,0.91,0.55,0.18], description: 'Mass managed-file-transfer 0-day exploitation campaign', severity: 'critical', mitre_tactics: ['initial-access','exfiltration'], color: '#f43f5e' },
  { name: 'Rogue Insider / Edward-X', actor_class: 'insider', actor_country: '', embedding: [0.62,0.18,0.55,0.91,0.78,0.31,0.85,0.45], description: 'Cleared employee selling crown-jewel data to foreign service', severity: 'critical', mitre_tactics: ['exfiltration','collection'], color: '#ef4444' },
  { name: 'Dev-Lab Sabotage', actor_class: 'insider', actor_country: '', embedding: [0.18,0.55,0.91,0.62,0.45,0.78,0.85,0.31], description: 'Departing engineer time-bomb in critical microservice', severity: 'critical', mitre_tactics: ['impact','persistence'], color: '#f43f5e' },
  { name: 'Trader Front-Running', actor_class: 'insider', actor_country: '', embedding: [0.91,0.62,0.18,0.78,0.55,0.45,0.31,0.85], description: 'Privileged market-data access exploited for personal trades', severity: 'high', mitre_tactics: ['collection','impact'], color: '#fb7185' },
  { name: 'CodeCov / SDK Hijack', actor_class: 'supply-chain', actor_country: '', embedding: [0.45,0.91,0.62,0.18,0.78,0.55,0.85,0.31], description: 'Bash-uploader CI compromise, secret exfil from build env', severity: 'critical', mitre_tactics: ['initial-access','credential-access'], color: '#fb923c' },
  { name: 'XZ-Backdoor / Jia Tan', actor_class: 'supply-chain', actor_country: '', embedding: [0.78,0.18,0.45,0.91,0.62,0.31,0.55,0.85], description: 'Multi-year OSS maintainer takeover, hidden sshd backdoor', severity: 'critical', mitre_tactics: ['persistence','defense-evasion'], color: '#facc15' },
  { name: 'NPM Typosquat Ring', actor_class: 'supply-chain', actor_country: '', embedding: [0.62,0.85,0.31,0.78,0.18,0.45,0.91,0.55], description: 'Hundreds of typosquatted packages exfil .env / SSH keys', severity: 'high', mitre_tactics: ['initial-access','credential-access'], color: '#a3e635' },
  { name: 'Container Crypto-Jacker', actor_class: 'criminal', actor_country: '', embedding: [0.31,0.78,0.62,0.45,0.91,0.18,0.85,0.55], description: 'Exposed K8s API + Docker socket abuse for Monero mining', severity: 'medium', mitre_tactics: ['execution','impact'], color: '#fbbf24' },
  { name: 'Quantum-Drainer DApp', actor_class: 'criminal', actor_country: '', embedding: [0.55,0.91,0.18,0.62,0.78,0.85,0.31,0.45], description: 'Wallet-drainer-as-a-service, signature phishing, MEV bots', severity: 'high', mitre_tactics: ['credential-access','impact'], color: '#22d3ee' },
  { name: 'GenAI Prompt Injection Worm', actor_class: 'criminal', actor_country: '', embedding: [0.85,0.31,0.78,0.55,0.62,0.91,0.45,0.18], description: 'Self-propagating LLM-prompt-injection across email assistants', severity: 'critical', mitre_tactics: ['execution','collection'], color: '#06b6d4' },
  { name: 'Deepfake Voice CEO Fraud', actor_class: 'criminal', actor_country: '', embedding: [0.18,0.62,0.85,0.91,0.45,0.78,0.55,0.31], description: 'Real-time voice cloning of executives during wire-transfer calls', severity: 'critical', mitre_tactics: ['initial-access','impact'], color: '#f97316' },
  { name: 'AiTM Phish Kit / EvilProxy', actor_class: 'criminal', actor_country: '', embedding: [0.78,0.45,0.62,0.31,0.91,0.18,0.85,0.55], description: 'Adversary-in-the-middle session-cookie theft bypassing MFA', severity: 'critical', mitre_tactics: ['credential-access'], color: '#fb7185' },
  { name: 'Operational Tech / TRITON-2', actor_class: 'state-sponsored', actor_country: 'RU', embedding: [0.91,0.85,0.78,0.45,0.31,0.62,0.55,0.18], description: 'ICS safety-instrumented-system targeting at petrochemical', severity: 'critical', mitre_tactics: ['impact','inhibit-response'], color: '#dc2626' },
  { name: 'Maritime GPS Spoof', actor_class: 'state-sponsored', actor_country: '', embedding: [0.62,0.78,0.18,0.85,0.45,0.91,0.31,0.55], description: 'Tanker AIS/GPS spoofing in chokepoint straits', severity: 'high', mitre_tactics: ['impact','defense-evasion'], color: '#0ea5e9' },
  { name: 'Smart Building HVAC Pivot', actor_class: 'criminal', actor_country: '', embedding: [0.45,0.91,0.78,0.18,0.55,0.62,0.85,0.31], description: 'BACnet/Modbus pivot from BMS into corporate VLAN', severity: 'medium', mitre_tactics: ['lateral-movement'], color: '#facc15' },
  { name: 'Side-Channel TEE Leak', actor_class: 'state-sponsored', actor_country: '', embedding: [0.85,0.55,0.91,0.62,0.18,0.45,0.78,0.31], description: 'Cache/timing extraction of TEE-sealed enterprise keys', severity: 'critical', mitre_tactics: ['credential-access'], color: '#a78bfa' },
  { name: 'Quantum-Harvest / SNDL', actor_class: 'state-sponsored', actor_country: 'CN', embedding: [0.91,0.62,0.78,0.45,0.85,0.31,0.18,0.55], description: 'Store-now-decrypt-later bulk capture of TLS-protected data', severity: 'critical', mitre_tactics: ['collection','exfiltration'], color: '#22d3ee' },
  { name: 'Telegram Bot Botnet C2', actor_class: 'criminal', actor_country: '', embedding: [0.31,0.45,0.62,0.78,0.91,0.55,0.18,0.85], description: 'Malware C2 over Telegram bot APIs, encrypted in plain sight', severity: 'medium', mitre_tactics: ['command-and-control'], color: '#fb923c' },
  { name: 'Cloud Metadata IMDSv1 Smash', actor_class: 'criminal', actor_country: '', embedding: [0.78,0.91,0.45,0.31,0.62,0.85,0.55,0.18], description: 'SSRF -> IMDSv1 -> sts:AssumeRole -> data lake exfil', severity: 'critical', mitre_tactics: ['credential-access','exfiltration'], color: '#34d399' },
  { name: 'BGP Route Hijack / Pakistan-style', actor_class: 'state-sponsored', actor_country: '', embedding: [0.55,0.18,0.91,0.62,0.85,0.78,0.31,0.45], description: 'Targeted prefix hijack to MITM banking traffic', severity: 'critical', mitre_tactics: ['command-and-control','collection'], color: '#f97316' },
  { name: 'Poisoned ML Training Set', actor_class: 'state-sponsored', actor_country: '', embedding: [0.18,0.78,0.55,0.91,0.62,0.85,0.45,0.31], description: 'Backdoor triggers in fine-tuning data of fraud-detection models', severity: 'critical', mitre_tactics: ['ml-model-tampering'], color: '#ef4444' },
  { name: 'Cellular Stingray / IMSI', actor_class: 'state-sponsored', actor_country: '', embedding: [0.62,0.85,0.31,0.45,0.78,0.18,0.91,0.55], description: 'Rogue cell tower, SMS-MFA interception of executives', severity: 'high', mitre_tactics: ['credential-access','collection'], color: '#fbbf24' },
  { name: 'WiFi-Pineapple Boardroom', actor_class: 'criminal', actor_country: '', embedding: [0.45,0.62,0.78,0.85,0.91,0.18,0.31,0.55], description: 'Karma-style rogue AP at trade-show Wi-Fi for cred capture', severity: 'medium', mitre_tactics: ['credential-access'], color: '#22d3ee' },
  { name: 'BlueNoroff / Crypto-Phish', actor_class: 'state-sponsored', actor_country: 'KP', embedding: [0.85,0.31,0.62,0.78,0.18,0.91,0.45,0.55], description: 'DPRK targeting of crypto venture funds and exchanges', severity: 'critical', mitre_tactics: ['initial-access','impact'], color: '#ef4444' },
  { name: 'OilRig / APT34 Resurge', actor_class: 'state-sponsored', actor_country: 'IR', embedding: [0.31,0.55,0.91,0.18,0.78,0.62,0.85,0.45], description: 'DNS-tunnel C2 against Gulf telecom and energy', severity: 'high', mitre_tactics: ['command-and-control','collection'], color: '#fb923c' },
  { name: 'Confucius / SCARLET MIMIC', actor_class: 'state-sponsored', actor_country: 'IN', embedding: [0.62,0.45,0.85,0.91,0.18,0.55,0.78,0.31], description: 'South-Asian gov/military espionage, BadNews loader variants', severity: 'high', mitre_tactics: ['collection','persistence'], color: '#a3e635' },
  { name: 'Larva-208 / Roaming Mantis', actor_class: 'criminal', actor_country: '', embedding: [0.18,0.91,0.45,0.62,0.85,0.31,0.78,0.55], description: 'Smishing-driven Android banking malware in APAC/EU', severity: 'high', mitre_tactics: ['initial-access','collection'], color: '#facc15' },
];

export async function maybeSpawnCentroid(existing: CWCentroid[]): Promise<CWCentroid | null> {
  const existingNames = new Set(existing.map(c => c.name));
  const candidates = EMERGING_CENTROID_POOL.filter(c => !existingNames.has(c.name));
  if (!candidates.length) return null;
  const pick = candidates[Math.floor(Math.random() * candidates.length)];
  const { data, error } = await supabase
    .from('chronoweave_bad_centroids')
    .insert(pick)
    .select('*')
    .maybeSingle();
  if (error || !data) return null;
  return data as CWCentroid;
}

export async function loadSessionNodes(sessionId: string, limit = 2000): Promise<CWNode[]> {
  const { data } = await supabase
    .from('chronoweave_nodes')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: false })
    .limit(limit);
  return ((data || []) as CWNode[]).reverse();
}

export async function loadSessionEdges(sessionId: string, limit = 4000): Promise<CWEdge[]> {
  const { data } = await supabase
    .from('chronoweave_edges')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: false })
    .limit(limit);
  return ((data || []) as CWEdge[]).reverse();
}

export async function tickSession(
  sessionId: string,
  centroids: CWCentroid[],
  recentNodes: CWNode[],
  tickIndex: number,
  count = 8,
): Promise<{ nodes: CWNode[]; edges: CWEdge[]; hits: CWHit[] }> {
  const newNodes: any[] = [];
  for (let i = 0; i < count; i++) {
    const isMalicious = Math.random() < 0.32;
    let label: string;
    let embedding: number[];
    let bestCentroid: CWCentroid | null = null;
    let bestSim = 0;

    if (isMalicious && centroids.length) {
      const tpl = MALICIOUS_TEMPLATES[Math.floor(Math.random() * MALICIOUS_TEMPLATES.length)];
      const candidates = centroids.filter(c => c.actor_class === tpl.bias);
      const target = (candidates.length ? candidates : centroids)[Math.floor(Math.random() * (candidates.length || centroids.length))];
      label = tpl.label;
      embedding = randomEmbedding(target.embedding);
    } else {
      label = BENIGN_LABELS[Math.floor(Math.random() * BENIGN_LABELS.length)];
      embedding = randomEmbedding();
    }

    for (const c of centroids) {
      const s = cosine(embedding, c.embedding);
      if (s > bestSim) { bestSim = s; bestCentroid = c; }
    }

    const isBenign = bestSim < 0.78;
    const angle = Math.random() * Math.PI * 2;
    const radius = 6 + Math.random() * 14;
    const yJitter = (Math.random() - 0.5) * 16;

    newNodes.push({
      session_id: sessionId,
      label,
      entity_type: isBenign ? 'benign' : 'suspicious',
      payload: { tickIndex, ts: Date.now() },
      embedding,
      x: Math.cos(angle) * radius,
      y: yJitter,
      z: Math.sin(angle) * radius,
      is_benign: isBenign,
      best_centroid_id: bestCentroid?.id ?? null,
      best_similarity: bestSim,
      tick_index: tickIndex,
    });
  }

  const { data: insertedNodes, error: nodesErr } = await supabase
    .from('chronoweave_nodes')
    .insert(newNodes)
    .select('*');
  if (nodesErr) throw nodesErr;
  const nodes = (insertedNodes || []) as CWNode[];

  const newEdges: any[] = [];
  const newHits: any[] = [];
  const candidatePool = [...recentNodes.slice(-40), ...nodes];

  for (const n of nodes) {
    const partners = [...candidatePool]
      .filter(p => p.id !== n.id)
      .sort(() => Math.random() - 0.5)
      .slice(0, 1 + Math.floor(Math.random() * 2));
    for (const p of partners) {
      newEdges.push({
        session_id: sessionId,
        source_id: p.id,
        target_id: n.id,
        weight: 0.4 + Math.random() * 0.6,
        kind: !n.is_benign && !p.is_benign ? 'attack-chain' : 'temporal',
      });
    }
    if (!n.is_benign && n.best_centroid_id) {
      newHits.push({
        session_id: sessionId,
        node_id: n.id,
        centroid_id: n.best_centroid_id,
        similarity: n.best_similarity,
      });
    }
  }

  let edges: CWEdge[] = [];
  if (newEdges.length) {
    const { data: insertedEdges } = await supabase.from('chronoweave_edges').insert(newEdges).select('*');
    edges = (insertedEdges || []) as CWEdge[];
  }
  let hits: CWHit[] = [];
  if (newHits.length) {
    const { data: insertedHits } = await supabase.from('chronoweave_similarity_hits').insert(newHits).select('*');
    hits = (insertedHits || []) as CWHit[];
  }

  await supabase
    .from('chronoweave_sessions')
    .update({ last_tick_at: new Date().toISOString(), tick_count: tickIndex + 1 })
    .eq('id', sessionId);

  return { nodes, edges, hits };
}

export async function purgeSession(sessionId: string) {
  await supabase.from('chronoweave_sessions').delete().eq('id', sessionId);
}
