import { FunnelEvent } from './eventFunnelData';

export interface PhaseAgent {
  name: string;
  role: string;
  type: 'deterministic' | 'ml' | 'llm' | 'hybrid' | 'human-in-loop';
  cadence: string;
  ownsDecision: boolean;
}

export interface PhaseExplanation {
  id: number;
  whatItDoes: string;
  inputs: string[];
  operations: string[];
  outputs: string[];
  passCriteria: string;
  dropCriteria: string;
  technicalDetail: string;
  example: string;
  agents: PhaseAgent[];
}

export interface PromotionMilestone {
  phaseId: number;
  artifact: 'alert' | 'case';
  label: string;
  trigger: string;
  detail: string;
}

export const PROMOTION_MILESTONES: PromotionMilestone[] = [
  {
    phaseId: 5,
    artifact: 'alert',
    label: 'ALERT BORN',
    trigger: 'Triage score >= 35 OR repeat-offender OR critical-asset interaction',
    detail: 'A correlated event becomes a formal Alert here. The Alert object is written to the alerts table with rule_id, score, evidence pointers, and an SLA acknowledgement timer starts. Every event that gets a triage score >= 35 emits exactly one alert, deduplicated by entity+rule within a 10-minute window.',
  },
  {
    phaseId: 7,
    artifact: 'case',
    label: 'CASE OPENED',
    trigger: 'Investigation confidence >= 0.6 OR severity in (high, critical) OR multi-asset blast radius',
    detail: 'When investigation produces a coherent narrative with sufficient confidence, a Case is opened. It binds: the originating alert(s), the evidence bundle, the MITRE ATT&CK technique mapping, the blast radius graph, the response playbook, and an SLA contract for acknowledge / contain / resolve. From here the case lives in the Case Management workspace until closed.',
  },
];

export function getPromotionForPhase(phaseId: number): PromotionMilestone | undefined {
  return PROMOTION_MILESTONES.find((m) => m.phaseId === phaseId);
}

export const PHASE_EXPLANATIONS: Record<number, PhaseExplanation> = {
  1: {
    id: 1,
    whatItDoes: 'Captures the raw byte stream from every connector and lands it on the bronze tier with zero filtering. Nothing is judged here — the only job is to never lose an event.',
    inputs: ['UDP/TCP packets', 'Syslog frames', 'API webhooks', 'Agent telemetry', 'CCTV/badge feeds'],
    operations: [
      'TLS termination and connector authentication',
      'Schema-on-read storage to bronze Delta tables',
      'Watermark + partition assignment by ingest_ts',
      'Backpressure handling via Kafka offsets',
    ],
    outputs: ['Raw bronze records with provenance', 'ingest_ts', 'connector_id', 'partition_key'],
    passCriteria: 'Every authenticated, well-formed transport frame passes. There is no semantic gate at this layer.',
    dropCriteria: 'Only malformed transport (bad TLS, oversize frame, replay nonce collision) is rejected.',
    technicalDetail: 'Auto Loader with cloudFiles.maxBytesPerTrigger=128MB, structured streaming with checkpointed offsets. Throughput target 50k events/sec/connector.',
    example: 'A raw NetFlow v9 datagram of 1,452 bytes arrives, gets a UUID, and is appended to bronze.netflow_raw with no validation of its contents.',
    agents: [
      { name: 'Connector Adapter', role: 'TLS termination, transport-layer auth, frame validation', type: 'deterministic', cadence: 'continuous', ownsDecision: false },
      { name: 'Auto Loader', role: 'Schema-on-read landing to bronze Delta tables', type: 'deterministic', cadence: 'continuous', ownsDecision: false },
    ],
  },
  2: {
    id: 2,
    whatItDoes: 'Decodes the raw bytes into structured fields. Identifies protocol, extracts headers, normalises timestamps, and rejects anything that fails grammar checks.',
    inputs: ['Bronze raw events from phase 1'],
    operations: [
      'Magic-byte protocol detection',
      'Header parsing (IP/TCP/HTTP/DNS/TLS SNI)',
      'Timestamp normalization to UTC ISO-8601',
      'OCSF field mapping for cross-vendor consistency',
    ],
    outputs: ['Silver-tier structured rows', 'protocol', 'src/dst tuples', 'event_type'],
    passCriteria: 'Parser produced a complete record with all required fields populated.',
    dropCriteria: 'Truncated headers, unknown magic bytes, parser exception, or schema validation failure.',
    technicalDetail: 'Polyglot parsers: Suricata-style for packet captures, grok for Syslog, JSONPath for cloud APIs. Failures land on a dead-letter quarantine queue for replay.',
    example: 'A 1,452 byte NetFlow datagram is decoded into {src_ip, dst_ip, dst_port, bytes, packets, protocol_num=6} — protocol resolves to TCP and the row moves on.',
    agents: [
      { name: 'Parser Pool', role: 'Polyglot decoders for packet captures, Syslog, JSON APIs', type: 'deterministic', cadence: 'continuous', ownsDecision: false },
      { name: 'OCSF Mapper', role: 'Cross-vendor schema normalization', type: 'deterministic', cadence: 'continuous', ownsDecision: false },
    ],
  },
  3: {
    id: 3,
    whatItDoes: 'Bolts business and threat context onto every event. Adds GeoIP, ASN, asset criticality, owner, vulnerability inventory, and known-bad indicator matches.',
    inputs: ['Parsed silver events', 'MaxMind GeoIP', 'TAXII/OTX/MISP IOCs', 'CMDB/asset registry'],
    operations: [
      'GeoIP + ASN lookup against in-memory Bloom filters',
      'Asset enrichment via CMDB join',
      'IOC match against vector index of 12M indicators',
      'User/identity hydration from IdP',
    ],
    outputs: ['Enriched events with geo, asset_owner, criticality, ioc_hits[]'],
    passCriteria: 'Always passes — enrichment is additive, never destructive.',
    dropCriteria: 'Nothing is dropped. Missing enrichments are flagged null and logged as data quality misses.',
    technicalDetail: 'Lookup latency budget 15ms p95 via cached side-tables. Cache miss falls through to async hydration and the event continues without blocking.',
    example: 'src_ip 185.93.2.71 enriches to {country:RU, asn:AS49505, ioc_hit:true, feed:OTX, indicator_type:malware_c2, confidence:0.91}.',
    agents: [
      { name: 'Enrichment Agent (fast tier)', role: 'GeoIP/ASN/CMDB joins from in-memory side-tables', type: 'deterministic', cadence: 'continuous', ownsDecision: false },
      { name: 'IOC Match Agent', role: 'Bloom + vector lookup against 12M-indicator threat-intel store', type: 'hybrid', cadence: 'continuous', ownsDecision: false },
      { name: 'Identity Hydration Agent', role: 'IdP/Entra/Okta user and device context', type: 'deterministic', cadence: 'continuous', ownsDecision: false },
    ],
  },
  4: {
    id: 4,
    whatItDoes: 'Runs the enriched event through hundreds of correlation rules and cross-source pattern matchers. This is where multiple weak signals begin to combine.',
    inputs: ['Enriched events', '~340 active correlation rules', 'session state from active lists'],
    operations: [
      'Sigma + custom rule evaluation',
      'Sliding-window joins across connectors',
      'Stateful CEP via Real-time Graph for multi-event patterns',
      'Negative-correlation evaluation (expected events absent)',
    ],
    outputs: ['Correlation matches with rule_id, confidence, evidence chain'],
    passCriteria: 'At least one rule fired OR the event participates in an open multi-event pattern.',
    dropCriteria: 'No rule matched and no pattern accumulator opened — event is informational only and is shed.',
    technicalDetail: 'Real-time Graph streaming engine holds open windows up to 24h. Rule index is FST-compiled for O(log n) match. Drop ratio averages ~83%.',
    example: 'IOC match in phase 3 + outbound on port 443 + asset criticality=high triggers rule R-0142 "Known C2 to Crown-Jewel Asset" with confidence 0.78.',
    agents: [
      { name: 'AI Correlation Agent', role: 'Sigma + custom rule evaluation, multi-source joins', type: 'hybrid', cadence: 'continuous (5s micro-batch)', ownsDecision: true },
      { name: 'Real-time Graph CEP Agent', role: 'Stateful pattern matching across multi-event windows', type: 'deterministic', cadence: 'continuous', ownsDecision: true },
      { name: 'Negative Correlation Agent', role: 'Detects expected events that did not occur', type: 'deterministic', cadence: 'continuous', ownsDecision: true },
    ],
  },
  5: {
    id: 5,
    whatItDoes: 'Six-factor scoring engine that decides whether the correlation is worth a human or machine investigation. Cheap, fast, ruthless.',
    inputs: ['Correlation matches', 'asset criticality', 'historical FP rate per rule'],
    operations: [
      'Severity weighting (CVSS-like)',
      'Asset risk multiplier',
      'Volume normalization (alert fatigue dampener)',
      'IOC freshness boost',
      'Repeat-offender / kill-chain adjacency boost',
      'Temporal anomaly (off-hours, off-pattern) boost',
    ],
    outputs: ['Triage score 0-100', 'priority bucket', 'escalation flag'],
    passCriteria: 'Score ≥ 35 OR repeat-offender flag OR critical-asset interaction.',
    dropCriteria: 'Score < 35 with no offsetting boosters — closed as informational.',
    technicalDetail: 'Score computed as weighted geometric mean to prevent any single dimension from dominating. ~57% drop rate is by design.',
    example: 'Rule R-0142 score = severity(80) * asset(1.4) * ioc_fresh(1.2) * temporal(1.1) = 73 — escalated to deep enrichment.',
    agents: [
      { name: 'Triage Agent', role: 'Six-factor scoring with priority bucketing', type: 'ml', cadence: 'every 30s on backlog', ownsDecision: true },
      { name: 'Repeat Offender Tracker', role: 'Maintains rolling memory of asset/identity recidivism', type: 'deterministic', cadence: 'continuous', ownsDecision: false },
    ],
  },
  6: {
    id: 6,
    whatItDoes: 'Expensive, evidence-grade enrichment for survivors of triage. Pulls graph neighborhoods, vector similarity, and historical memory to confirm or refute.',
    inputs: ['Triaged events with score ≥ 35', 'graph store', 'vector index', 'historical case memory'],
    operations: [
      'k-hop graph traversal around src/dst entities (60% weight)',
      'Vector similarity to known-bad embeddings (15%)',
      'CTI campaign attribution (10%)',
      'Historical case memory match (15%)',
    ],
    outputs: ['Evidence bundle', 'confidence delta', 'campaign_id (if matched)'],
    passCriteria: 'Combined evidence bundle is non-empty.',
    dropCriteria: 'Empty graph neighborhood + no vector match + no CTI hit + no historical precedent.',
    technicalDetail: 'GraphRAG over LakeBase. Vector store uses cosine sim with HNSW index. Latency budget 45ms p95.',
    example: 'Graph traversal finds src 10.0.5.107 connected to 4 prior compromised hosts within 2 hops; vector similarity 0.87 to APT29 cluster — strong signal.',
    agents: [
      { name: 'Enrichment Agent (deep tier)', role: 'k-hop graph traversal and evidence bundling', type: 'hybrid', cadence: 'on-demand per triaged event', ownsDecision: false },
      { name: 'Vector Memory Agent', role: 'HNSW similarity vs known-bad embeddings', type: 'ml', cadence: 'on-demand', ownsDecision: false },
      { name: 'CTI Attribution Agent', role: 'Maps evidence to APT campaigns and known TTP clusters', type: 'llm', cadence: 'on-demand', ownsDecision: false },
    ],
  },
  7: {
    id: 7,
    whatItDoes: 'Automated investigation agent assembles a complete narrative: actor, timeline, blast radius, and confidence. Output is human-readable.',
    inputs: ['Evidence bundle from phase 6', 'all related events from past 7 days'],
    operations: [
      'Timeline reconstruction across connectors',
      'Blast-radius computation (which assets touched)',
      'TTP mapping to MITRE ATT&CK',
      'Hypothesis generation and ranking',
    ],
    outputs: ['Investigation report', 'ATT&CK technique IDs', 'blast_radius graph'],
    passCriteria: 'Always passes — every event reaching here gets a full narrative.',
    dropCriteria: 'Nothing is dropped. Low-confidence cases still receive a report flagged as such.',
    technicalDetail: 'LLM-driven with strict JSON schema output. Grounded with retrieved evidence — no hallucination on entities or timestamps.',
    example: 'Report: "Host 10.0.5.107 (finance-vp-laptop) initiated outbound to known APT29 C2 at 14:32:47 UTC. Persistence via scheduled task observed 11 minutes prior. T1053.005 + T1071.001."',
    agents: [
      { name: 'Investigation Agent', role: 'Timeline reconstruction, blast-radius computation, hypothesis ranking', type: 'llm', cadence: 'on-demand per case', ownsDecision: true },
      { name: 'MITRE ATT&CK Mapper', role: 'Maps observed behavior to ATT&CK techniques and tactics', type: 'llm', cadence: 'on-demand', ownsDecision: false },
      { name: 'Evidence Collector', role: 'Pulls related events from a 7-day window across all connectors', type: 'deterministic', cadence: 'on-demand', ownsDecision: false },
    ],
  },
  8: {
    id: 8,
    whatItDoes: 'Decides what to do and, where authorised, does it. Isolates hosts, blocks indicators, revokes tokens. Hard actions go through the approval gate.',
    inputs: ['Investigation report', 'response playbook library', 'asset blast pattern', 'authorisation policy'],
    operations: [
      'Playbook selection based on TTP + asset class',
      'Action plan generation with reversibility tags',
      'Approval gate check for irreversible actions',
      'Execution via connector control planes',
    ],
    outputs: ['Action ledger', 'containment status', 'rollback handle'],
    passCriteria: 'Investigation confidence ≥ 0.6 AND a matching playbook exists.',
    dropCriteria: 'Confidence too low, no playbook, or analyst-suppressed — handed back to queue.',
    technicalDetail: 'Approval gate is mandatory for actions tagged irreversible=true. SOAR connectors execute with full audit trail to chain-of-custody.',
    example: 'Playbook PB-014 "C2-Beacon-Containment" auto-quarantines 10.0.5.107 via EDR API, blocks 185.93.2.71 at firewall, revokes user SSO session.',
    agents: [
      { name: 'Response Agent', role: 'Selects playbook, generates action plan, executes reversible actions', type: 'llm', cadence: 'on-demand per case', ownsDecision: true },
      { name: 'Approval Gate', role: 'Holds irreversible actions pending human authorization', type: 'human-in-loop', cadence: 'on-demand', ownsDecision: true },
      { name: 'SOAR Executor', role: 'Invokes connector control planes (EDR, firewall, IdP)', type: 'deterministic', cadence: 'on-demand', ownsDecision: false },
    ],
  },
  9: {
    id: 9,
    whatItDoes: 'Pattern discovery: takes the survivors and looks for never-before-seen behaviour clusters that current rules miss. Feeds new rules back to phase 4.',
    inputs: ['Responded events', 'rolling 30-day event lake', 'unsupervised clustering models'],
    operations: [
      'DBSCAN/HDBSCAN clustering on event embeddings',
      'Novelty detection via isolation forest',
      'Cluster-to-rule synthesis with LLM',
      'Candidate rule submission to detection-as-code repo',
    ],
    outputs: ['Candidate rules', 'novel cluster IDs', 'discovery report'],
    passCriteria: 'Event landed in a cluster with novelty score > 0.7.',
    dropCriteria: 'Already-known cluster — no new learning to extract.',
    technicalDetail: 'Runs on a delayed micro-batch (15 min) on the gold tier. Candidate rules require human review before promotion.',
    example: 'Cluster C-2841 detected: 17 events from 9 hosts share an unusual TLS JA3 + identical 8.3kb upload — promoted as candidate rule R-DRAFT-0341.',
    agents: [
      { name: 'Pattern Discovery Agent', role: 'DBSCAN/HDBSCAN clustering and novelty scoring on event embeddings', type: 'ml', cadence: 'micro-batch every 15 min', ownsDecision: true },
      { name: 'Rule Synthesis Agent', role: 'Translates novel clusters into draft Sigma/Real-time Graph rules', type: 'llm', cadence: 'on novel cluster detection', ownsDecision: false },
    ],
  },
  10: {
    id: 10,
    whatItDoes: 'Vector-augmented re-scoring. Boosts confidence when embeddings agree across modalities; suppresses suspected false positives via similarity to known-good.',
    inputs: ['Discovered events', 'multi-modal embedding store', 'known-FP corpus'],
    operations: [
      'Cross-modal embedding agreement (network + endpoint + identity)',
      'Similarity to known-good baselines',
      'Confidence uplift up to +30%',
      'False-positive suppression up to -50%',
    ],
    outputs: ['Adjusted confidence', 'fp_suppressed flag', 'uplift reason'],
    passCriteria: 'Net adjustment keeps confidence above retention floor (0.4).',
    dropCriteria: 'FP suppression drives confidence below floor — archived as confirmed FP.',
    technicalDetail: 'Embedding spaces aligned via contrastive learning. Operates as a precision filter, not a primary detector.',
    example: 'Cross-modal agreement on actor 10.0.5.107: net+endpoint+identity all cluster on the same APT29 prototype; confidence uplift 0.78 -> 0.94.',
    agents: [
      { name: 'Vector Augmented Scoring Agent', role: 'Cross-modal embedding agreement and uplift', type: 'ml', cadence: 'continuous', ownsDecision: true },
      { name: 'False-Positive Suppressor', role: 'Suppresses cases similar to known-good baselines', type: 'ml', cadence: 'continuous', ownsDecision: true },
    ],
  },
  11: {
    id: 11,
    whatItDoes: 'Analyst Learning and Human Feedback closes the loop. Outcomes from analyst dispositions retrain thresholds and rule weights every 24h.',
    inputs: ['Analyst dispositions (TP/FP/benign)', 'rule performance over 7d/14d', 'drift metrics'],
    operations: [
      'Per-rule precision/recall tracking',
      '7-day vs 14-day drift comparison',
      'Threshold raise/lower with bounded steps',
      'Champion/challenger A/B for new rule weights',
    ],
    outputs: ['Updated rule thresholds', 'drift report', 'retraining ticket if degraded'],
    passCriteria: 'Event outcome captured and used in next training cycle.',
    dropCriteria: 'No analyst disposition within feedback window — outcome marked unknown but not lost.',
    technicalDetail: 'Bounded learning rate prevents oscillation. All threshold changes are versioned through detection-as-code with rollback.',
    example: 'Rule R-0142 saw 14d precision drop from 0.81 to 0.66; threshold auto-raised from 35 to 42, with challenger model queued for promotion.',
    agents: [
      { name: 'ALHF Learning Agent', role: 'Per-rule precision/recall tracking and bounded threshold tuning', type: 'ml', cadence: 'daily retrain on disposition stream', ownsDecision: true },
      { name: 'Drift Monitor Agent', role: 'Compares 7d vs 14d distributions and raises retraining tickets', type: 'ml', cadence: 'hourly', ownsDecision: false },
      { name: 'Analyst Disposition Capture', role: 'Records TP/FP/benign judgments for the feedback loop', type: 'human-in-loop', cadence: 'event-driven', ownsDecision: false },
    ],
  },
};

export function buildEventNarrative(event: FunnelEvent, phaseId: number): string {
  const phase = PHASE_EXPLANATIONS[phaseId];
  if (!phase) return 'No explanation available for this phase.';

  const connectorTone = event.isStructured ? 'structured' : 'unstructured';
  const domainTone = event.domain === 'physical' ? 'physical-domain' : 'logical-domain';

  switch (phaseId) {
    case 1:
      return `Event ${event.id} arrived from ${event.connector} (${connectorTone}, ${domainTone}) at ${event.timestamp}. ${event.bytes.toLocaleString()} bytes were appended to the bronze tier with no validation. The only checks applied were TLS handshake and connector identity.`;
    case 2:
      return `The raw payload was decoded as ${event.protocol}/${event.port}. Source ${event.sourceIP} -> destination ${event.destIP} were extracted, and the event was tagged as type "${event.eventType}". Schema validation passed and the event proceeded to enrichment.`;
    case 3:
      return `${event.destIP} was enriched with GeoIP, ASN, and threat-intel context. Asset registry resolved ${event.sourceIP} to its owning business unit. ${event.severity === 'critical' || event.severity === 'high' ? 'IOC match was confirmed against active threat feeds.' : 'No high-confidence IOC match yet — context attached as nullable.'}`;
    case 4:
      return `Correlation engine evaluated ${event.eventType} against the active rule set. ${event.severity === 'low' || event.severity === 'info' ? 'No rules fired with sufficient confidence — event would normally be shed here.' : `Rule firing observed with severity ${event.severity}; the event participates in an open correlation window across ${event.connector} and adjacent connectors.`}`;
    case 5:
      return `Six-factor triage produced a score for this ${event.severity}-severity ${event.eventType}. Asset criticality and ${event.connector} reputation contributed positively. ${event.severity === 'critical' ? 'Score crossed escalation threshold — promoted to deep enrichment.' : event.severity === 'high' ? 'Score exceeded 35 — promoted.' : 'Borderline — repeat-offender boost decided promotion.'}`;
    case 6:
      return `Graph traversal around ${event.sourceIP} and ${event.destIP} returned the evidence neighborhood. Vector similarity was computed against known-bad embeddings. ${event.severity === 'critical' ? 'Strong CTI campaign attribution detected.' : 'Evidence bundle assembled with mixed-strength signals.'}`;
    case 7:
      return `Investigation agent reconstructed the timeline for this ${event.eventType} on ${event.sourceIP}. Blast radius was computed across the affected ${domainTone} surface. MITRE ATT&CK techniques were mapped, and a human-readable narrative was generated.`;
    case 8:
      return `Response playbook was selected for ${event.eventType} on ${event.sourceIP}. ${event.finalVerdict === 'critical_threat' || event.finalVerdict === 'threat' ? 'Containment actions queued — irreversible steps held at the approval gate pending human authorisation.' : 'Soft response only (alert + watchlist) — no containment authorised at this confidence level.'}`;
    case 9:
      return `This event was clustered against the rolling 30-day lake. Novelty score was evaluated. ${event.severity === 'high' || event.severity === 'critical' ? 'Cluster shows novelty above threshold — candidate rule synthesis triggered.' : 'Falls into known cluster — no new pattern to learn.'}`;
    case 10:
      return `Cross-modal embedding agreement was checked across network, endpoint, and identity views. ${event.finalVerdict === 'critical_threat' ? 'All modalities agree — confidence uplifted up to +30%.' : event.finalVerdict === 'benign' ? 'Strong similarity to known-good baseline — false-positive suppression applied.' : 'Partial agreement — moderate adjustment.'}`;
    case 11:
      return `Disposition for this event will be recorded once an analyst marks it as TP/FP/benign. The outcome will feed the next ALHF cycle, adjusting the rule thresholds that produced it. Resolution so far: ${event.resolutionReason || 'pending analyst review'}.`;
    default:
      return phase.whatItDoes;
  }
}
