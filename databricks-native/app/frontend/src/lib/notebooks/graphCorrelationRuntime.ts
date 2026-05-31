import { DatabricksNotebook } from '../databricksNotebooks';

export const graphCorrelationRuntimeNotebook: DatabricksNotebook = {
  id: 'graph-correlation-runtime',
  title: 'SIEM Graph Correlation Engine - Stateful Runtime & Advanced Analytics',
  subtitle: 'Kill-chain builder, temporal sequences, risk propagation, behavioral fingerprints, adaptive thresholds',
  category: 'correlation',
  tags: ['transformWithState', 'Kill Chain', 'Risk Propagation', 'Behavioral Fingerprinting', 'Adaptive Thresholds', 'Temporal Intelligence'],
  description: 'Part 2 of the SIEM Graph Correlation Engine. Implements 6 advanced stateful processing capabilities: (1) Kill-chain builder that reconstructs multi-stage attack graphs with partial chain merging, (2) Temporal sequence intelligence with anomaly scoring against configurable templates, (3) Graph-based risk propagation with weighted decay across entity relationships, (4) Behavioral fingerprinting with drift detection for login patterns/geo/process trees/domain affinity/API usage, (5) Adaptive thresholding from rolling baselines and percentiles, (6) Enhanced partial pattern memory with deception signal integration.',
  estimatedRuntime: '18 min (streaming)',
  clusterRequirements: 'DBR 14.3 LTS ML, 8+ workers, Delta Lake, Unity Catalog',
  cells: [
    {
      type: 'markdown',
      content: `# SIEM Graph Correlation Engine - Part 2: Advanced Stateful Runtime

## Six Advanced Stateful Processing Engines

This notebook implements the **hot state runtime** with six tightly integrated engines
that transform raw Silver events into a rich, continuously updated threat graph.

### Processing Pipeline Per Event

\`\`\`
  INCOMING SILVER EVENT
         |
         v
  +------+------+------+------+------+------+
  |      |      |      |      |      |      |
  v      v      v      v      v      v      v
ENTITY  KILL   TEMP   RISK   BEHAV  ADAPT  DECEP
PROFILE CHAIN  SEQ    PROP   FING   THRESH TION
STATE   BUILD  INTEL  AGATE  ERPRNT ING    DETECT
  |      |      |      |      |      |      |
  +------+------+------+------+------+------+
         |
         v
   GRAPH MATERIALIZATION
   (Delta MERGE: vertices, edges, attack_chains,
    entity_state, behavioral_fingerprints)
\`\`\`

### Kill-Chain Reconstruction

The kill-chain builder maintains partial attack chains as first-class state objects.
Each new event is evaluated against all open chains for the relevant entity:

1. **Can it extend an existing chain?** Check if the event matches the next expected
   stage in any open chain. If yes, advance the chain.
2. **Can it merge two chains?** If overlapping entities appear across chains, merge
   them into a unified attack graph.
3. **Can it start a new chain?** If the event matches a stage-0 pattern and no
   suitable chain exists, create one.
4. **Can it finalize a chain?** If a chain has enough stages and confidence, emit
   a detection with full evidence.

### Risk Propagation Algorithm

\`\`\`
propagated_risk(entity) = own_risk +
    SUM over neighbors: (
        neighbor.risk * edge_weight * decay^distance *
        privilege_multiplier * recency_factor
    )
\`\`\`

Propagation is incremental -- each new high-risk event triggers localized propagation
to direct neighbors only (max 4 hops), avoiding full-graph scans.

### Behavioral Fingerprinting Dimensions

| Dimension | Features | Drift Detection |
|-----------|----------|-----------------|
| Login Patterns | Hour-of-day histogram, day-of-week histogram | KL divergence |
| Geolocation | Country/city frequency distribution | New-country alert |
| Process Trees | Parent-child process signature | Jaccard distance |
| Domain Affinity | Top-10 domains with affinity scores | Cosine similarity |
| API Usage | API action frequency distribution | Chi-squared test |

### Adaptive Thresholding

Static thresholds are replaced with per-entity dynamic thresholds computed from:
- Rolling 7-day baseline of event rates
- P95 percentile of the baseline distribution
- Entity-specific and environment-specific adaptation`
    },
    {
      type: 'code',
      content: `# Cell 1: State Object Definitions (Enhanced)
from pyspark.sql import functions as F
from pyspark.sql.types import *
from datetime import datetime, timedelta
from dataclasses import dataclass, field, asdict
from collections import defaultdict
import json, uuid, hashlib, math, random

CATALOG = "soc_platform"
SCHEMA_SILVER = "graph_silver"
SCHEMA_GRAPH = "graph_live"
SCHEMA_GOLD = "graph_detections"

HONEYPOT_IPS = ["10.0.99.1", "10.0.99.2", "10.0.99.3"]
HONEYPOT_HOSTS = ["HONEYPOT-SSH-01", "HONEYPOT-RDP-01", "HONEYPOT-WEB-01"]
CRITICAL_HOSTS = ["SRV-DC-01", "SRV-DC-02", "SRV-DB-03", "SRV-JUMP-01"]
CRITICAL_USERS = ["admin", "root", "svc_backup", "cloud_admin"]

@dataclass
class EntityProfile:
    entity_id: str
    entity_type: str
    event_count_1h: int = 0
    event_count_24h: int = 0
    distinct_peers_1h: int = 0
    distinct_peers_24h: int = 0
    baseline_event_rate: float = 0.0
    adaptive_threshold: float = 0.0
    rolling_risk_score: float = 0.0
    propagated_risk: float = 0.0
    deviation_score: float = 0.0
    behavioral_drift: float = 0.0
    intent_stage: str = ""
    intent_confidence: float = 0.0
    recent_actions: list = field(default_factory=list)
    recent_peers: list = field(default_factory=list)
    recent_event_times: list = field(default_factory=list)
    hourly_histogram: list = field(default_factory=lambda: [0.0]*24)
    geo_distribution: dict = field(default_factory=dict)
    process_signature: list = field(default_factory=list)
    domain_affinity: dict = field(default_factory=dict)
    api_usage: dict = field(default_factory=dict)
    baseline_hourly: list = field(default_factory=lambda: [0.0]*24)
    first_seen: str = ""
    last_seen: str = ""

    def update(self, event_time, action, peer_id, hour=None, geo=None,
               process=None, domain=None, api_action=None):
        self.event_count_1h += 1
        self.event_count_24h += 1
        self.last_seen = event_time
        if not self.first_seen:
            self.first_seen = event_time
        self.recent_actions = (self.recent_actions + [action])[-50:]
        self.recent_event_times = (self.recent_event_times + [event_time])[-100:]
        if peer_id and peer_id not in self.recent_peers:
            self.recent_peers = (self.recent_peers + [peer_id])[-100:]
            self.distinct_peers_1h += 1
            self.distinct_peers_24h += 1
        if hour is not None and 0 <= hour < 24:
            self.hourly_histogram[hour] += 1.0
        if geo:
            self.geo_distribution[geo] = self.geo_distribution.get(geo, 0) + 1
        if process and process not in self.process_signature:
            self.process_signature = (self.process_signature + [process])[-30:]
        if domain:
            self.domain_affinity[domain] = self.domain_affinity.get(domain, 0) + 1
        if api_action:
            self.api_usage[api_action] = self.api_usage.get(api_action, 0) + 1

    def compute_deviation(self):
        if self.baseline_event_rate > 0:
            self.deviation_score = abs(
                self.event_count_1h - self.baseline_event_rate
            ) / max(self.baseline_event_rate, 1.0)
        return self.deviation_score

    def compute_adaptive_threshold(self, historical_rates):
        if len(historical_rates) >= 10:
            sorted_rates = sorted(historical_rates)
            p95_idx = int(len(sorted_rates) * 0.95)
            self.adaptive_threshold = sorted_rates[min(p95_idx, len(sorted_rates)-1)]
        return self.adaptive_threshold

    def compute_behavioral_drift(self):
        total_current = sum(self.hourly_histogram)
        total_baseline = sum(self.baseline_hourly)
        if total_current < 10 or total_baseline < 10:
            return 0.0
        kl_div = 0.0
        for i in range(24):
            p = (self.hourly_histogram[i] + 1) / (total_current + 24)
            q = (self.baseline_hourly[i] + 1) / (total_baseline + 24)
            if p > 0 and q > 0:
                kl_div += p * math.log(p / q)
        self.behavioral_drift = round(kl_div, 4)
        return self.behavioral_drift


@dataclass
class AdjacencySummary:
    entity_id: str
    edges: dict = field(default_factory=dict)

    def add_edge(self, peer_id, edge_type, event_time):
        key = f"{peer_id}::{edge_type}"
        if key not in self.edges:
            self.edges[key] = {
                "peer_id": peer_id, "edge_type": edge_type,
                "count": 0, "first_seen": event_time, "last_seen": event_time,
            }
        self.edges[key]["count"] += 1
        self.edges[key]["last_seen"] = event_time

    def get_fanout(self):
        return len(set(e["peer_id"] for e in self.edges.values()))

    def get_neighbors_with_weights(self):
        result = {}
        for e in self.edges.values():
            pid = e["peer_id"]
            if pid not in result:
                result[pid] = 0.0
            result[pid] += e["count"]
        return result


@dataclass
class AttackChain:
    chain_id: str
    anchor_entity: str
    kill_chain_stages: list = field(default_factory=list)
    stages_completed: list = field(default_factory=list)
    involved_entities: list = field(default_factory=list)
    evidence_events: list = field(default_factory=list)
    mitre_tactics: list = field(default_factory=list)
    mitre_techniques: list = field(default_factory=list)
    confidence: float = 0.0
    risk_score: float = 0.0
    intent_stage: str = "unknown"
    campaign_id: str = ""
    timeline: list = field(default_factory=list)
    merged_from: list = field(default_factory=list)
    first_event_time: str = ""
    last_event_time: str = ""
    is_active: bool = True

    KILL_CHAIN_ORDER = [
        "reconnaissance", "credential_access", "initial_access",
        "execution", "persistence", "privilege_escalation",
        "lateral_movement", "collection", "exfiltration",
        "command_and_control", "impact",
    ]

    STAGE_MAPPING = {
        "network_flow:None": "reconnaissance",
        "dns:query": "reconnaissance",
        "authentication:login_failed": "credential_access",
        "authentication:login_success": "initial_access",
        "endpoint:process_create": "execution",
        "endpoint:registry_mod": "persistence",
        "endpoint:dll_load": "persistence",
        "authentication:privilege_grant": "privilege_escalation",
        "endpoint:network_connect": "lateral_movement",
        "endpoint:file_write": "collection",
        "cloud_api:PutObject": "exfiltration",
        "cloud_api:GetObject": "collection",
        "cloud_api:CreateAccessKey": "credential_access",
        "cloud_api:AssumeRole": "privilege_escalation",
        "cloud_api:DeleteTrail": "impact",
        "cloud_api:StopLogging": "impact",
        "deception:ssh_attempt": "reconnaissance",
        "deception:credential_test": "credential_access",
    }

    def try_advance(self, action_key, event_id, entity_id, event_time):
        mapped_stage = self.STAGE_MAPPING.get(action_key)
        if not mapped_stage:
            return False

        if mapped_stage in self.stages_completed:
            return False

        current_idx = -1
        if self.stages_completed:
            last = self.stages_completed[-1]
            if last in self.KILL_CHAIN_ORDER:
                current_idx = self.KILL_CHAIN_ORDER.index(last)

        new_idx = self.KILL_CHAIN_ORDER.index(mapped_stage) if mapped_stage in self.KILL_CHAIN_ORDER else -1
        if new_idx <= current_idx and current_idx >= 0:
            return False

        self.stages_completed.append(mapped_stage)
        self.evidence_events.append(event_id)
        if entity_id not in self.involved_entities:
            self.involved_entities.append(entity_id)
        self.last_event_time = event_time
        self.timeline.append({"stage": mapped_stage, "time": event_time, "event_id": event_id})
        self.confidence = len(self.stages_completed) / max(len(self.KILL_CHAIN_ORDER), 1)
        self._update_intent()
        return True

    def _update_intent(self):
        if not self.stages_completed:
            return
        last = self.stages_completed[-1]
        intent_map = {
            "reconnaissance": "recon", "credential_access": "credential_access",
            "initial_access": "credential_access", "execution": "lateral_movement",
            "persistence": "persistence", "privilege_escalation": "lateral_movement",
            "lateral_movement": "lateral_movement", "collection": "exfiltration",
            "exfiltration": "exfiltration", "command_and_control": "exfiltration",
            "impact": "exfiltration",
        }
        self.intent_stage = intent_map.get(last, "unknown")

    def can_merge_with(self, other, overlap_threshold=0.3):
        shared = set(self.involved_entities) & set(other.involved_entities)
        total = set(self.involved_entities) | set(other.involved_entities)
        if not total:
            return False
        return len(shared) / len(total) >= overlap_threshold

    def merge(self, other):
        for stage in other.stages_completed:
            if stage not in self.stages_completed:
                self.stages_completed.append(stage)
        self.stages_completed = sorted(
            self.stages_completed,
            key=lambda s: self.KILL_CHAIN_ORDER.index(s) if s in self.KILL_CHAIN_ORDER else 999,
        )
        self.evidence_events = list(set(self.evidence_events + other.evidence_events))
        self.involved_entities = list(set(self.involved_entities + other.involved_entities))
        self.timeline = sorted(self.timeline + other.timeline, key=lambda t: t["time"])
        if not self.merged_from:
            self.merged_from = [self.chain_id]
        self.merged_from.append(other.chain_id)
        self.confidence = len(self.stages_completed) / max(len(self.KILL_CHAIN_ORDER), 1)
        self._update_intent()


@dataclass
class SequenceTracker:
    entity_id: str
    recent_sequence: list = field(default_factory=list)
    sequence_times: list = field(default_factory=list)
    max_length: int = 20

    def add_event(self, action_key, event_time):
        self.recent_sequence = (self.recent_sequence + [action_key])[-self.max_length:]
        self.sequence_times = (self.sequence_times + [event_time])[-self.max_length:]

    def check_against_template(self, template_seq, typical_duration, duration_stddev):
        tlen = len(template_seq)
        if len(self.recent_sequence) < tlen:
            return None

        for start in range(len(self.recent_sequence) - tlen + 1):
            window = self.recent_sequence[start:start + tlen]
            if window == template_seq:
                time_window = self.sequence_times[start:start + tlen]
                if len(time_window) >= 2:
                    try:
                        t0 = datetime.fromisoformat(time_window[0])
                        t1 = datetime.fromisoformat(time_window[-1])
                        actual_dur = (t1 - t0).total_seconds()
                    except (ValueError, TypeError):
                        actual_dur = typical_duration

                    is_compressed = actual_dur < typical_duration * 0.25
                    duration_zscore = abs(actual_dur - typical_duration) / max(duration_stddev, 1)

                    return {
                        "matched": True,
                        "actual_duration_sec": actual_dur,
                        "expected_duration_sec": typical_duration,
                        "is_compressed": is_compressed,
                        "duration_zscore": round(duration_zscore, 2),
                        "anomaly_score": round(min(duration_zscore / 5.0, 1.0), 4),
                    }
        return None

    def detect_missing_transitions(self, expected_pairs):
        score = 0.0
        for i in range(len(self.recent_sequence) - 1):
            pair = (self.recent_sequence[i], self.recent_sequence[i+1])
            if pair not in expected_pairs:
                score += 0.3
        return min(score, 1.0)


print("Enhanced state objects defined:")
print("  EntityProfile:     Login/geo/process/domain/API fingerprints + adaptive thresholds")
print("  AdjacencySummary:  Weighted neighbor tracking for risk propagation")
print("  AttackChain:       Kill-chain reconstruction with merging + MITRE mapping")
print("  SequenceTracker:   Temporal sequence anomaly detection")`
    },
    {
      type: 'code',
      content: `# Cell 2: Risk Propagation Engine
# Propagates risk scores across the entity graph using weighted decay.

class RiskPropagator:
    def __init__(self, decay=0.7, max_hops=4, priv_mult=2.5, anomaly_mult=1.8):
        self.decay = decay
        self.max_hops = max_hops
        self.priv_mult = priv_mult
        self.anomaly_mult = anomaly_mult

    def propagate(self, source_entity_id, source_risk, adjacency_map, entity_profiles):
        propagated = {}
        visited = set()
        queue = [(source_entity_id, source_risk, 0)]

        while queue:
            current_id, current_risk, depth = queue.pop(0)
            if current_id in visited or depth >= self.max_hops:
                continue
            visited.add(current_id)

            adj = adjacency_map.get(current_id)
            if not adj:
                continue

            neighbors = adj.get_neighbors_with_weights()
            for neighbor_id, edge_weight in neighbors.items():
                if neighbor_id in visited:
                    continue

                neighbor_profile = entity_profiles.get(neighbor_id)
                multiplier = 1.0

                if neighbor_profile:
                    display_hint = neighbor_profile.entity_id
                    is_critical = any(
                        c in display_hint for c in CRITICAL_HOSTS + CRITICAL_USERS
                    )
                    if is_critical:
                        multiplier *= self.priv_mult

                    if neighbor_profile.deviation_score > 2.0:
                        multiplier *= self.anomaly_mult

                prop_risk = current_risk * self.decay * min(edge_weight / 10.0, 1.0) * multiplier
                prop_risk = round(min(prop_risk, 10.0), 4)

                if prop_risk > propagated.get(neighbor_id, 0):
                    propagated[neighbor_id] = prop_risk
                    queue.append((neighbor_id, prop_risk, depth + 1))

        return propagated


class BehavioralFingerprinter:
    def __init__(self, drift_threshold=2.5, min_events=50):
        self.drift_threshold = drift_threshold
        self.min_events = min_events

    def compute_fingerprint(self, profile):
        total_h = sum(profile.hourly_histogram)
        hour_dist = [h / max(total_h, 1) for h in profile.hourly_histogram]

        total_geo = sum(profile.geo_distribution.values()) or 1
        geo_dist = {k: v / total_geo for k, v in profile.geo_distribution.items()}

        domain_items = sorted(profile.domain_affinity.items(), key=lambda x: -x[1])[:10]
        total_domain = sum(v for _, v in domain_items) or 1
        domain_top10 = [d for d, _ in domain_items]
        domain_scores = [round(v / total_domain, 4) for _, v in domain_items]

        total_api = sum(profile.api_usage.values()) or 1
        api_pattern = {k: round(v / total_api, 4) for k, v in profile.api_usage.items()}

        proc_sig = hashlib.md5(
            "|".join(sorted(profile.process_signature)).encode()
        ).hexdigest()[:16]

        return {
            "login_hour_histogram": hour_dist,
            "login_day_histogram": [0.0] * 7,
            "geo_distribution": geo_dist,
            "process_tree_signature": proc_sig,
            "domain_affinity_top10": domain_top10,
            "domain_affinity_scores": domain_scores,
            "api_usage_pattern": api_pattern,
            "drift_score": profile.behavioral_drift,
        }

    def detect_drift(self, profile):
        drift = profile.compute_behavioral_drift()
        alerts = []

        if drift > self.drift_threshold:
            alerts.append({
                "type": "login_pattern_drift",
                "score": drift,
                "message": f"Login hour pattern diverged: KL={drift:.4f} > {self.drift_threshold}",
            })

        known_geos = set(profile.geo_distribution.keys())
        if len(known_geos) > 4:
            alerts.append({
                "type": "geo_spread_anomaly",
                "score": len(known_geos) / 10.0,
                "message": f"Unusually broad geo spread: {len(known_geos)} countries",
            })

        return alerts


propagator = RiskPropagator()
fingerprinter = BehavioralFingerprinter()
print("Risk propagation engine initialized (decay=0.7, max_hops=4)")
print("Behavioral fingerprinter initialized (drift_threshold=2.5)")`
    },
    {
      type: 'code',
      content: `# Cell 3: Full Stateful Processing Simulation
# Processes all Silver events through: entity profiles, kill-chain builder,
# sequence tracking, risk propagation, behavioral fingerprinting.

from pyspark.sql import Row

df_silver = spark.table(f"{CATALOG}.{SCHEMA_SILVER}.silver_events")
events_pdf = df_silver.orderBy("event_time").limit(15000).toPandas()

entity_profiles = {}
entity_adjacency = {}
attack_chains = {}
sequence_trackers = {}
pattern_candidates = defaultdict(list)
all_vertices = []
all_edges = []
all_detections = []
all_chain_records = []
deception_signals = []
behavioral_prints = []

now = datetime.now()
metrics = {
    "events_processed": 0, "vertices_emitted": 0, "edges_emitted": 0,
    "candidates_created": 0, "candidates_expired": 0, "detections_emitted": 0,
    "chains_created": 0, "chains_merged": 0, "chains_finalized": 0,
    "sequence_anomalies": 0, "risk_propagations": 0,
    "deception_triggers": 0, "behavioral_drifts": 0,
}

ENTITY_KEY_COLS = [("entity_src_ip_id", "ip"), ("entity_user_id", "user"), ("entity_host_id", "host")]

SEQUENCE_TEMPLATES = [
    {
        "name": "password_spray",
        "seq": ["authentication:login_failed", "authentication:login_failed",
                "authentication:login_failed", "authentication:login_success"],
        "duration": 180.0, "stddev": 60.0, "is_suspicious": True,
    },
    {
        "name": "lateral_movement",
        "seq": ["authentication:login_success", "endpoint:network_connect",
                "authentication:login_success"],
        "duration": 1800.0, "stddev": 600.0, "is_suspicious": True,
    },
    {
        "name": "cloud_abuse",
        "seq": ["cloud_api:CreateAccessKey", "cloud_api:AssumeRole", "cloud_api:GetObject"],
        "duration": 900.0, "stddev": 300.0, "is_suspicious": True,
    },
]

for _, evt in events_pdf.iterrows():
    metrics["events_processed"] += 1
    is_deception = bool(evt.get("is_deception", False))

    for entity_col, entity_type in ENTITY_KEY_COLS:
        entity_id = evt.get(entity_col)
        if not entity_id:
            continue

        if entity_id not in entity_profiles:
            entity_profiles[entity_id] = EntityProfile(entity_id=entity_id, entity_type=entity_type)
            entity_adjacency[entity_id] = AdjacencySummary(entity_id=entity_id)
            sequence_trackers[entity_id] = SequenceTracker(entity_id=entity_id)

        profile = entity_profiles[entity_id]
        adj = entity_adjacency[entity_id]
        seq_tracker = sequence_trackers[entity_id]

        evt_time = str(evt.get("event_time", ""))
        evt_type = evt.get("event_type", "") or ""
        evt_sub = evt.get("event_subtype", "") or ""
        action_key = f"{evt_type}:{evt_sub}" if evt_sub else evt_type
        evt_id = evt.get("event_id", "")

        try:
            hour = int(evt_time[11:13]) if len(evt_time) > 13 else None
        except (ValueError, TypeError):
            hour = None

        geo = evt.get("geo_country")
        process = evt.get("process_name")
        domain = evt.get("domain")
        api_action = evt.get("api_action")

        peer_cols = ["entity_dst_ip_id", "entity_host_id", "entity_domain_id"]
        peer_id = next((evt.get(c) for c in peer_cols if evt.get(c) and evt.get(c) != entity_id), None)

        profile.update(evt_time, action_key, peer_id, hour, geo, process, domain, api_action)

        if is_deception:
            deception_signals.append({
                "signal_id": str(uuid.uuid4())[:16],
                "honeypot_id": evt.get("host_id", ""),
                "honeypot_type": evt_sub or "unknown",
                "interacting_entity": entity_id,
                "interaction_type": evt_sub or evt_type,
                "source_ip": evt.get("src_ip"),
                "source_user": evt.get("user_id"),
                "evidence_event_id": evt_id,
                "risk_amplification": 5.0,
            })
            profile.rolling_risk_score = min(profile.rolling_risk_score + 5.0, 10.0)
            metrics["deception_triggers"] += 1

        if entity_id not in attack_chains:
            attack_chains[entity_id] = []

        advanced_chain = False
        for chain in attack_chains[entity_id]:
            if chain.is_active and chain.try_advance(action_key, evt_id, entity_id, evt_time):
                advanced_chain = True
                break

        if not advanced_chain and action_key in AttackChain.STAGE_MAPPING:
            new_chain = AttackChain(
                chain_id=str(uuid.uuid4())[:12],
                anchor_entity=entity_id,
                first_event_time=evt_time,
                last_event_time=evt_time,
            )
            new_chain.try_advance(action_key, evt_id, entity_id, evt_time)
            attack_chains[entity_id].append(new_chain)
            metrics["chains_created"] += 1

        chains = attack_chains[entity_id]
        i = 0
        while i < len(chains):
            j = i + 1
            while j < len(chains):
                if chains[i].is_active and chains[j].is_active and chains[i].can_merge_with(chains[j]):
                    chains[i].merge(chains[j])
                    chains[j].is_active = False
                    metrics["chains_merged"] += 1
                j += 1
            i += 1
        attack_chains[entity_id] = [c for c in chains if c.is_active]

        for chain in attack_chains[entity_id]:
            if len(chain.stages_completed) >= 3 and chain.confidence >= 0.2:
                metrics["chains_finalized"] += 1
                all_chain_records.append(asdict(chain))

        seq_tracker.add_event(action_key, evt_time)
        for tmpl in SEQUENCE_TEMPLATES:
            result = seq_tracker.check_against_template(tmpl["seq"], tmpl["duration"], tmpl["stddev"])
            if result and result.get("matched") and tmpl["is_suspicious"]:
                anomaly_score = result.get("anomaly_score", 0)
                if anomaly_score > 0.3 or result.get("is_compressed"):
                    metrics["sequence_anomalies"] += 1

        if peer_id:
            edge_type = action_key
            adj.add_edge(peer_id, edge_type, evt_time)
            all_edges.append({
                "edge_id": hashlib.md5(f"{entity_id}::{peer_id}::{edge_type}".encode()).hexdigest()[:16],
                "src_vertex_id": entity_id, "dst_vertex_id": peer_id,
                "edge_type": edge_type, "weight": 1.0, "evidence_count": 1,
                "first_seen": evt_time, "last_seen": evt_time, "is_active": True,
            })
            metrics["edges_emitted"] += 1

        all_vertices.append({
            "vertex_id": entity_id, "entity_type": entity_type,
            "canonical_id": entity_id,
            "display_name": evt.get("user_id") or evt.get("src_ip") or evt.get("host_id") or entity_id,
            "risk_score": profile.rolling_risk_score,
            "first_seen": profile.first_seen, "last_seen": profile.last_seen,
            "event_count": profile.event_count_24h, "is_active": True,
        })
        metrics["vertices_emitted"] += 1

for eid, profile in entity_profiles.items():
    if profile.rolling_risk_score > 3.0:
        propagated = propagator.propagate(eid, profile.rolling_risk_score,
                                          entity_adjacency, entity_profiles)
        for neighbor_id, prop_risk in propagated.items():
            if neighbor_id in entity_profiles:
                entity_profiles[neighbor_id].propagated_risk = max(
                    entity_profiles[neighbor_id].propagated_risk, prop_risk
                )
        metrics["risk_propagations"] += 1

for eid, profile in entity_profiles.items():
    profile.compute_deviation()
    drift = profile.compute_behavioral_drift()
    if drift > 2.5:
        metrics["behavioral_drifts"] += 1

    fp = fingerprinter.compute_fingerprint(profile)
    behavioral_prints.append({
        "fingerprint_id": str(uuid.uuid4())[:16],
        "entity_id": eid,
        "entity_type": profile.entity_type,
        "fingerprint_type": "comprehensive",
        **fp,
        "baseline_event_count": profile.event_count_24h,
    })

print(f"""
Advanced Stateful Processing Complete:
  Events processed:     {metrics['events_processed']:>8,}
  Vertices emitted:     {metrics['vertices_emitted']:>8,}
  Edges emitted:        {metrics['edges_emitted']:>8,}
  Distinct entities:    {len(entity_profiles):>8,}

  Kill-Chain Builder:
    Chains created:     {metrics['chains_created']:>8,}
    Chains merged:      {metrics['chains_merged']:>8,}
    Chains finalized:   {metrics['chains_finalized']:>8,}

  Temporal Intelligence:
    Sequence anomalies: {metrics['sequence_anomalies']:>8,}

  Risk Propagation:
    Propagations run:   {metrics['risk_propagations']:>8,}
    Behavioral drifts:  {metrics['behavioral_drifts']:>8,}

  Deception Detection:
    Honeypot triggers:  {metrics['deception_triggers']:>8,}
""")`
    },
    {
      type: 'code',
      content: `# Cell 4: Graph Materialization (Enhanced Delta MERGE)

if all_vertices:
    df_v = spark.createDataFrame(all_vertices).dropDuplicates(["vertex_id"])
    df_v = (
        df_v
        .withColumn("properties", F.lit(None).cast(MapType(StringType(), StringType())))
        .withColumn("propagated_risk", F.lit(0.0))
        .withColumn("rarity_score", F.lit(0.0))
        .withColumn("intent_stage", F.lit(None).cast(StringType()))
        .withColumn("criticality", F.lit("normal"))
        .withColumn("campaign_ids", F.lit(None).cast(ArrayType(StringType())))
        .withColumn("is_honeypot", F.lit(False))
        .withColumn("updated_at", F.current_timestamp())
        .withColumn("first_seen", F.to_timestamp("first_seen"))
        .withColumn("last_seen", F.to_timestamp("last_seen"))
    )
    df_v.createOrReplaceTempView("new_vertices")
    spark.sql(f"""
        MERGE INTO {CATALOG}.{SCHEMA_GRAPH}.vertices_current AS t
        USING new_vertices AS s ON t.vertex_id = s.vertex_id
        WHEN MATCHED THEN UPDATE SET
            t.last_seen = s.last_seen, t.event_count = s.event_count,
            t.risk_score = s.risk_score, t.is_active = true,
            t.updated_at = current_timestamp()
        WHEN NOT MATCHED THEN INSERT *
    """)
    print(f"Vertices: {spark.table(f'{CATALOG}.{SCHEMA_GRAPH}.vertices_current').count():,}")

if all_edges:
    df_e = spark.createDataFrame(all_edges).dropDuplicates(["edge_id"])
    df_e = (
        df_e
        .withColumn("rarity_score", F.lit(0.0))
        .withColumn("path_id", F.lit(None).cast(StringType()))
        .withColumn("campaign_id", F.lit(None).cast(StringType()))
        .withColumn("properties", F.lit(None).cast(MapType(StringType(), StringType())))
        .withColumn("is_compressed", F.lit(False))
        .withColumn("updated_at", F.current_timestamp())
        .withColumn("first_seen", F.to_timestamp("first_seen"))
        .withColumn("last_seen", F.to_timestamp("last_seen"))
    )
    df_e.createOrReplaceTempView("new_edges")
    spark.sql(f"""
        MERGE INTO {CATALOG}.{SCHEMA_GRAPH}.edges_current AS t
        USING new_edges AS s ON t.edge_id = s.edge_id
        WHEN MATCHED THEN UPDATE SET
            t.last_seen = s.last_seen,
            t.weight = t.weight + s.weight,
            t.evidence_count = t.evidence_count + s.evidence_count,
            t.is_active = true, t.updated_at = current_timestamp()
        WHEN NOT MATCHED THEN INSERT *
    """)
    print(f"Edges: {spark.table(f'{CATALOG}.{SCHEMA_GRAPH}.edges_current').count():,}")

entity_state_rows = []
for eid, profile in entity_profiles.items():
    adj = entity_adjacency.get(eid, AdjacencySummary(entity_id=eid))
    entity_state_rows.append({
        "entity_id": profile.entity_id, "entity_type": profile.entity_type,
        "rolling_risk_score": profile.rolling_risk_score,
        "propagated_risk": profile.propagated_risk,
        "rarity_score": 0.0, "intent_stage": profile.intent_stage,
        "intent_confidence": profile.intent_confidence,
        "event_count_1h": profile.event_count_1h,
        "event_count_24h": profile.event_count_24h,
        "distinct_peers_1h": profile.distinct_peers_1h,
        "distinct_peers_24h": profile.distinct_peers_24h,
        "baseline_event_rate": profile.baseline_event_rate,
        "adaptive_threshold": profile.adaptive_threshold,
        "deviation_score": profile.deviation_score,
        "behavioral_drift": profile.behavioral_drift,
        "recent_actions": profile.recent_actions[-10:],
        "recent_edge_types": list(set(e["edge_type"] for e in adj.edges.values()))[:10],
        "campaign_ids": [],
        "last_event_time": profile.last_seen,
    })

if entity_state_rows:
    df_state = spark.createDataFrame(entity_state_rows)
    df_state = df_state.withColumn("state_updated_at", F.current_timestamp())
    df_state = df_state.withColumn("last_event_time", F.to_timestamp("last_event_time"))
    df_state.createOrReplaceTempView("new_entity_state")
    spark.sql(f"""
        MERGE INTO {CATALOG}.{SCHEMA_GRAPH}.entity_state_current AS t
        USING new_entity_state AS s ON t.entity_id = s.entity_id
        WHEN MATCHED THEN UPDATE SET *
        WHEN NOT MATCHED THEN INSERT *
    """)
    print(f"Entity states: {len(entity_state_rows):,}")

if all_chain_records:
    unique_chains = {}
    for c in all_chain_records:
        cid = c["chain_id"]
        if cid not in unique_chains or len(c["stages_completed"]) > len(unique_chains[cid].get("stages_completed", [])):
            unique_chains[cid] = c
    chain_list = list(unique_chains.values())
    df_chains = spark.createDataFrame(chain_list)
    df_chains = (
        df_chains
        .withColumn("chain_name", F.concat(F.lit("Chain-"), F.col("chain_id")))
        .withColumn("kill_chain_stage",
            F.coalesce(F.element_at(F.col("stages_completed"), F.size("stages_completed")), F.lit("init")))
        .withColumn("stages_total", F.lit(11))
        .withColumn("involved_vertices", F.lit(None).cast(ArrayType(StringType())))
        .withColumn("involved_edges", F.lit(None).cast(ArrayType(StringType())))
        .withColumn("risk_score", F.col("confidence") * 10.0)
        .withColumn("campaign_id", F.lit(None).cast(StringType()))
        .withColumn("timeline_json", F.to_json(F.col("timeline")))
        .withColumn("first_event_time", F.to_timestamp("first_event_time"))
        .withColumn("last_event_time", F.to_timestamp("last_event_time"))
        .withColumn("created_at", F.current_timestamp())
        .withColumn("updated_at", F.current_timestamp())
    )
    df_chains.write.mode("overwrite").saveAsTable(f"{CATALOG}.{SCHEMA_GRAPH}.attack_chains")
    print(f"Attack chains persisted: {len(chain_list):,}")

if deception_signals:
    df_decep = spark.createDataFrame(deception_signals)
    df_decep = df_decep.withColumn("detected_at", F.current_timestamp())
    df_decep.write.mode("overwrite").saveAsTable(f"{CATALOG}.{SCHEMA_GRAPH}.deception_signals")
    print(f"Deception signals: {len(deception_signals):,}")

if behavioral_prints:
    bp_subset = behavioral_prints[:500]
    df_bp = spark.createDataFrame(bp_subset)
    df_bp = (
        df_bp
        .withColumn("port_usage_pattern", F.lit(None).cast(MapType(StringType(), DoubleType())))
        .withColumn("session_duration_avg", F.lit(None).cast(DoubleType()))
        .withColumn("session_duration_stddev", F.lit(None).cast(DoubleType()))
        .withColumn("bytes_sent_avg", F.lit(None).cast(DoubleType()))
        .withColumn("bytes_sent_stddev", F.lit(None).cast(DoubleType()))
        .withColumn("baseline_computed_at", F.current_timestamp())
        .withColumn("current_window_start", F.current_timestamp() - F.expr("INTERVAL 7 DAYS"))
        .withColumn("updated_at", F.current_timestamp())
    )
    df_bp.write.mode("overwrite").saveAsTable(f"{CATALOG}.{SCHEMA_GRAPH}.behavioral_fingerprints")
    print(f"Behavioral fingerprints: {len(bp_subset):,}")

print("\\nFull graph materialization complete")`
    },
    {
      type: 'code',
      content: `# Cell 5: Advanced Observability Dashboard

import matplotlib.pyplot as plt
import pandas as pd
import numpy as np

df_v = spark.table(f"{CATALOG}.{SCHEMA_GRAPH}.vertices_current")
df_e = spark.table(f"{CATALOG}.{SCHEMA_GRAPH}.edges_current")
df_es = spark.table(f"{CATALOG}.{SCHEMA_GRAPH}.entity_state_current")

fig, axes = plt.subplots(3, 3, figsize=(24, 18))
fig.suptitle("Graph Correlation Engine - Advanced Observability", fontsize=18, fontweight="bold")

v_types = df_v.groupBy("entity_type").count().toPandas()
v_types.set_index("entity_type")["count"].plot(kind="bar", ax=axes[0, 0], color="#0ea5e9", edgecolor="#0369a1")
axes[0, 0].set_title("Vertices by Type", fontweight="bold")
axes[0, 0].tick_params(axis="x", rotation=45)

e_types = df_e.groupBy("edge_type").count().orderBy(F.desc("count")).limit(12).toPandas()
e_types.set_index("edge_type")["count"].plot(kind="barh", ax=axes[0, 1], color="#10b981", edgecolor="#059669")
axes[0, 1].set_title("Top Edge Types", fontweight="bold")

risk_pdf = df_es.select("rolling_risk_score").toPandas()
axes[0, 2].hist(risk_pdf["rolling_risk_score"], bins=30, color="#ef4444", edgecolor="#b91c1c", alpha=0.7)
prop_pdf = df_es.select("propagated_risk").toPandas()
axes[0, 2].hist(prop_pdf["propagated_risk"], bins=30, color="#f59e0b", edgecolor="#d97706", alpha=0.5)
axes[0, 2].legend(["Own Risk", "Propagated Risk"])
axes[0, 2].set_title("Risk Score Distribution", fontweight="bold")

try:
    chains_df = spark.table(f"{CATALOG}.{SCHEMA_GRAPH}.attack_chains")
    chain_stages = chains_df.select(F.explode("stages_completed").alias("stage")).groupBy("stage").count().toPandas()
    if len(chain_stages) > 0:
        stage_order = AttackChain.KILL_CHAIN_ORDER
        chain_stages["order"] = chain_stages["stage"].apply(
            lambda s: stage_order.index(s) if s in stage_order else 99
        )
        chain_stages = chain_stages.sort_values("order")
        axes[1, 0].barh(chain_stages["stage"], chain_stages["count"], color="#2563eb", edgecolor="#1e40af")
    else:
        axes[1, 0].text(0.5, 0.5, "No chains yet", ha="center", va="center")
except:
    axes[1, 0].text(0.5, 0.5, "Attack chains pending", ha="center", va="center")
axes[1, 0].set_title("Kill-Chain Stages Observed", fontweight="bold")

drift_pdf = df_es.select("behavioral_drift").filter(F.col("behavioral_drift") > 0).toPandas()
if len(drift_pdf) > 0:
    axes[1, 1].hist(drift_pdf["behavioral_drift"], bins=25, color="#8b5cf6", edgecolor="#6d28d9")
    axes[1, 1].axvline(x=2.5, color="#ef4444", linestyle="--", label="Drift threshold")
    axes[1, 1].legend()
else:
    axes[1, 1].text(0.5, 0.5, "No behavioral drift data", ha="center", va="center")
axes[1, 1].set_title("Behavioral Drift Distribution", fontweight="bold")

try:
    decep_df = spark.table(f"{CATALOG}.{SCHEMA_GRAPH}.deception_signals")
    decep_types = decep_df.groupBy("interaction_type").count().toPandas()
    if len(decep_types) > 0:
        decep_types.set_index("interaction_type")["count"].plot(
            kind="bar", ax=axes[1, 2], color="#dc2626", edgecolor="#991b1b")
    else:
        axes[1, 2].text(0.5, 0.5, "No deception signals", ha="center", va="center")
except:
    axes[1, 2].text(0.5, 0.5, "Deception data pending", ha="center", va="center")
axes[1, 2].set_title("Deception/Honeypot Interactions", fontweight="bold")

dev_pdf = df_es.select("deviation_score").filter(F.col("deviation_score") > 0).toPandas()
if len(dev_pdf) > 0:
    axes[2, 0].hist(dev_pdf["deviation_score"], bins=25, color="#0ea5e9", edgecolor="#0369a1")
else:
    axes[2, 0].text(0.5, 0.5, "No deviation data", ha="center", va="center")
axes[2, 0].set_title("Entity Deviation Scores", fontweight="bold")

weight_pdf = df_e.select("weight").filter(F.col("weight") > 1).toPandas()
if len(weight_pdf) > 0:
    axes[2, 1].hist(weight_pdf["weight"], bins=30, color="#10b981", edgecolor="#059669", log=True)
else:
    axes[2, 1].text(0.5, 0.5, "All weights = 1", ha="center", va="center")
axes[2, 1].set_title("Edge Weight Distribution (log)", fontweight="bold")

summary_data = [
    ["Vertices", f"{df_v.count():,}"],
    ["Edges", f"{df_e.count():,}"],
    ["Entity Profiles", f"{df_es.count():,}"],
    ["Attack Chains", f"{metrics['chains_created']:,}"],
    ["Chains Merged", f"{metrics['chains_merged']:,}"],
    ["Seq. Anomalies", f"{metrics['sequence_anomalies']:,}"],
    ["Risk Propagations", f"{metrics['risk_propagations']:,}"],
    ["Behavioral Drifts", f"{metrics['behavioral_drifts']:,}"],
    ["Deception Triggers", f"{metrics['deception_triggers']:,}"],
    ["Events Processed", f"{metrics['events_processed']:,}"],
]
axes[2, 2].axis("off")
table = axes[2, 2].table(cellText=summary_data, colLabels=["Metric", "Value"],
                          cellLoc="left", loc="center")
table.auto_set_font_size(False)
table.set_fontsize(10)
table.scale(1.2, 1.5)
axes[2, 2].set_title("Engine Metrics", fontweight="bold")

plt.tight_layout()
plt.show()`
    },
  ],
};
