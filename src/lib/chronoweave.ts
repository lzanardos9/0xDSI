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
