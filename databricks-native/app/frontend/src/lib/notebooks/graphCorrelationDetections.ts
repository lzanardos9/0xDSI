import { DatabricksNotebook } from '../databricksNotebooks';

export const graphCorrelationDetectionsNotebook: DatabricksNotebook = {
  id: 'graph-correlation-detections',
  title: 'SIEM Graph Correlation Engine - Advanced Detection & Graph Intelligence',
  subtitle: 'Blast radius, campaign clustering, intent inference, graph rarity, lateral prediction, graph compression',
  category: 'correlation',
  tags: ['GraphFrames', 'Blast Radius', 'Campaign Detection', 'Intent Inference', 'Graph Rarity', 'Lateral Prediction', 'Graph Compression', 'MITRE ATT&CK'],
  description: 'Part 3 of the SIEM Graph Correlation Engine. Implements 7 advanced graph-native detection engines: (1) Graph rarity detection with rare edge/node/subgraph scoring, (2) Real-time blast radius via BFS reachability, (3) Campaign clustering using shared infrastructure and behavioral similarity, (4) Intent inference mapping graph patterns to attacker stages, (5) Lateral movement prediction with next-target estimation, (6) Graph compression collapsing low-value edges to highlight attack paths, (7) Deception-enhanced 10-dimension scoring engine. Includes all four original detections plus comprehensive unit tests.',
  estimatedRuntime: '15 min',
  clusterRequirements: 'DBR 14.3 LTS ML, 8+ workers, graphframes library, Delta Lake, Unity Catalog',
  cells: [
    {
      type: 'markdown',
      content: `# SIEM Graph Correlation Engine - Part 3: Advanced Detection & Graph Intelligence

## Seven Detection Engines + Enhanced Scoring

This notebook completes the graph correlation engine with advanced graph-native analytics
that elevate detection from rule matching to **predictive threat intelligence**.

### Detection Engine Matrix

| Engine | Purpose | Input | Output |
|--------|---------|-------|--------|
| Graph Rarity | Score rare nodes, edges, subgraphs | Live graph + baselines | Rarity multipliers per entity |
| Blast Radius | Compute reachable entities from compromised node | Adjacency graph + privileges | Blast radius count + entity list |
| Campaign Clustering | Group related attack chains | Attack chains + infra overlap | Campaign objects with evolution |
| Intent Inference | Map graph patterns to attacker intent | Kill-chain stages + behavior | Intent stage + confidence |
| Lateral Prediction | Estimate next attack target | Topology + access patterns | Ranked target list |
| Graph Compression | Collapse noise, highlight attack paths | Full graph | Compressed graph with attack spine |
| Deception Scoring | Amplify risk from honeypot interactions | Deception signals | Risk multipliers |

### Enhanced 10-Dimension Scoring

\`\`\`
Detection Score = weighted_sum(
    graph_rarity          * 0.10,   # How rare is this pattern in the graph?
    behavioral_anomaly    * 0.12,   # How far from behavioral baseline?
    temporal_anomaly      * 0.10,   # Is the timing compressed or abnormal?
    event_rarity          * 0.08,   # How unusual is this event for this entity?
    entity_criticality    * 0.12,   # Is this a high-value target?
    graph_fanout          * 0.10,   # How many entities are touched?
    evidence_count        * 0.08,   # How many corroborating events?
    intent_confidence     * 0.10,   # How advanced is the inferred intent?
    kill_chain_progress   * 0.10,   # How far along the kill chain?
    deception_signal      * 0.10,   # Was a honeypot/decoy triggered?
)
\`\`\`

### Motif Patterns for Original Detections

| Detection | Motif Pattern | MITRE Tactic |
|-----------|--------------|--------------|
| Password Spray | IP -> N Users (failed) -> 1 User (success) | T1110.003 |
| Lateral Movement | User -> Host1 -> Host2 -> Host3 (auth chain) | T1021 |
| Rare Proc -> Domain | Host -> Process (rare) -> Domain (rare) | T1071 |
| Cloud Cred Abuse | User -> CreateKey -> AssumeRole -> MultiRegion | T1528 |`
    },
    {
      type: 'code',
      content: `# Cell 1: Setup & GraphFrame Construction
from pyspark.sql import functions as F
from pyspark.sql.types import *
from pyspark.sql.window import Window
from graphframes import GraphFrame
from collections import defaultdict
import json, uuid, math, hashlib
from datetime import datetime, timedelta

CATALOG = "soc_platform"
SCHEMA_GRAPH = "graph_live"
SCHEMA_GOLD = "graph_detections"
SCHEMA_SILVER = "graph_silver"

CRITICAL_ENTITIES = {
    "hosts": ["SRV-DC-01", "SRV-DC-02", "SRV-DB-03", "SRV-JUMP-01"],
    "users": ["admin", "root", "svc_backup", "cloud_admin"],
    "cloud": ["arn:aws:iam", "arn:aws:s3:::prod"],
}

SCORING_WEIGHTS = {
    "graph_rarity": 0.10,
    "behavioral_anomaly": 0.12,
    "temporal_anomaly": 0.10,
    "event_rarity": 0.08,
    "entity_criticality": 0.12,
    "graph_fanout": 0.10,
    "evidence_count": 0.08,
    "intent_confidence": 0.10,
    "kill_chain_progress": 0.10,
    "deception_signal": 0.10,
}

df_vertices = (
    spark.table(f"{CATALOG}.{SCHEMA_GRAPH}.vertices_current")
    .filter(F.col("is_active") == True)
    .select(
        F.col("vertex_id").alias("id"),
        "entity_type", "canonical_id", "display_name",
        "risk_score", "propagated_risk", "rarity_score",
        "intent_stage", "criticality", "campaign_ids",
        "event_count", "is_honeypot",
        "first_seen", "last_seen",
    )
)

df_edges = (
    spark.table(f"{CATALOG}.{SCHEMA_GRAPH}.edges_current")
    .filter(F.col("is_active") == True)
    .select(
        F.col("edge_id").alias("id"),
        F.col("src_vertex_id").alias("src"),
        F.col("dst_vertex_id").alias("dst"),
        "edge_type", "weight", "evidence_count",
        "rarity_score", "path_id", "campaign_id", "is_compressed",
        "first_seen", "last_seen",
    )
)

valid_ids = df_vertices.select("id").distinct()
df_edges_valid = (
    df_edges
    .join(valid_ids.withColumnRenamed("id", "s_check"), F.col("src") == F.col("s_check"))
    .join(valid_ids.withColumnRenamed("id", "d_check"), F.col("dst") == F.col("d_check"))
    .drop("s_check", "d_check")
)

g = GraphFrame(df_vertices, df_edges_valid)

v_count = g.vertices.count()
e_count = g.edges.count()
print(f"GraphFrame: {v_count:,} vertices, {e_count:,} edges")
print(f"  Vertex types: {[r['entity_type'] for r in g.vertices.select('entity_type').distinct().collect()]}")
print(f"  Edge types (top 10): {[r['edge_type'] for r in g.edges.groupBy('edge_type').count().orderBy(F.desc('count')).limit(10).collect()]}")`
    },
    {
      type: 'code',
      content: `# Cell 2: Graph Rarity Engine
# Computes rarity scores for nodes, edges, and local subgraph patterns.
# Rare elements receive higher multipliers for downstream detection scoring.

class GraphRarityEngine:
    def __init__(self, node_rarity_threshold=0.05, edge_rarity_threshold=0.02,
                 subgraph_rarity_threshold=0.01):
        self.node_rarity_threshold = node_rarity_threshold
        self.edge_rarity_threshold = edge_rarity_threshold
        self.subgraph_rarity_threshold = subgraph_rarity_threshold

    def compute_node_rarity(self, vertices_df):
        total = vertices_df.count()
        if total == 0:
            return vertices_df.withColumn("node_rarity", F.lit(0.0))

        type_counts = (
            vertices_df.groupBy("entity_type")
            .agg(F.count("*").alias("type_count"))
            .withColumn("type_frequency", F.col("type_count") / F.lit(total))
        )

        event_stats = (
            vertices_df
            .agg(
                F.mean("event_count").alias("mean_events"),
                F.stddev("event_count").alias("std_events"),
            )
            .collect()[0]
        )
        mean_ev = event_stats["mean_events"] or 1.0
        std_ev = event_stats["std_events"] or 1.0

        enriched = (
            vertices_df
            .join(type_counts.select("entity_type", "type_frequency"), "entity_type")
            .withColumn("event_zscore",
                F.abs(F.col("event_count") - F.lit(mean_ev)) / F.lit(max(std_ev, 1.0)))
            .withColumn("node_rarity",
                F.when(
                    (F.col("type_frequency") < self.node_rarity_threshold) |
                    (F.col("event_zscore") > 3.0),
                    F.least(
                        F.lit(1.0),
                        F.lit(1.0) - F.col("type_frequency") + (F.col("event_zscore") / F.lit(10.0))
                    )
                ).otherwise(F.col("event_zscore") / F.lit(10.0)))
        )
        return enriched

    def compute_edge_rarity(self, edges_df):
        total = edges_df.count()
        if total == 0:
            return edges_df.withColumn("edge_rarity", F.lit(0.0))

        type_counts = (
            edges_df.groupBy("edge_type")
            .agg(F.count("*").alias("etype_count"))
            .withColumn("etype_frequency", F.col("etype_count") / F.lit(total))
        )

        enriched = (
            edges_df
            .join(type_counts.select("edge_type", "etype_frequency"), "edge_type")
            .withColumn("edge_rarity",
                F.when(
                    F.col("etype_frequency") < self.edge_rarity_threshold,
                    F.lit(1.0) - F.col("etype_frequency")
                ).otherwise(
                    F.lit(0.1) * (F.lit(1.0) - F.col("etype_frequency"))
                ))
        )
        return enriched

    def compute_subgraph_rarity(self, graph):
        try:
            two_hop = graph.find("(a)-[e1]->(b); (b)-[e2]->(c)")
            motif_counts = (
                two_hop
                .withColumn("motif_key",
                    F.concat(F.col("a.entity_type"), F.lit("->"), F.col("e1.edge_type"),
                             F.lit("->"), F.col("b.entity_type"), F.lit("->"),
                             F.col("e2.edge_type"), F.lit("->"), F.col("c.entity_type")))
                .groupBy("motif_key")
                .agg(F.count("*").alias("motif_count"))
            )
            total_motifs = motif_counts.agg(F.sum("motif_count")).collect()[0][0] or 1
            rare_motifs = (
                motif_counts
                .withColumn("motif_frequency", F.col("motif_count") / F.lit(total_motifs))
                .filter(F.col("motif_frequency") < self.subgraph_rarity_threshold)
                .withColumn("subgraph_rarity", F.lit(1.0) - F.col("motif_frequency"))
            )
            return rare_motifs
        except Exception as e:
            print(f"Subgraph rarity note: {str(e)[:200]}")
            return spark.createDataFrame([], StructType([
                StructField("motif_key", StringType()),
                StructField("subgraph_rarity", DoubleType()),
            ]))

rarity_engine = GraphRarityEngine()
df_v_rarity = rarity_engine.compute_node_rarity(g.vertices)
df_e_rarity = rarity_engine.compute_edge_rarity(g.edges)
df_subgraph_rarity = rarity_engine.compute_subgraph_rarity(g)

high_rarity_nodes = df_v_rarity.filter(F.col("node_rarity") > 0.5).count()
high_rarity_edges = df_e_rarity.filter(F.col("edge_rarity") > 0.5).count()
rare_motifs = df_subgraph_rarity.count()

print(f"Graph Rarity Analysis:")
print(f"  High-rarity nodes (>0.5):  {high_rarity_nodes:,}")
print(f"  High-rarity edges (>0.5):  {high_rarity_edges:,}")
print(f"  Rare 2-hop motifs:         {rare_motifs:,}")

if rare_motifs > 0:
    display(df_subgraph_rarity.orderBy(F.asc("motif_frequency")).limit(15))`
    },
    {
      type: 'code',
      content: `# Cell 3: Real-Time Blast Radius Engine
# For any compromised entity, computes the set of reachable entities
# within N hops, weighted by privilege level and edge recency.

class BlastRadiusEngine:
    def __init__(self, max_depth=5, privilege_weight=3.0, recency_decay_hours=24):
        self.max_depth = max_depth
        self.privilege_weight = privilege_weight
        self.recency_decay_hours = recency_decay_hours

    def compute_blast_radius(self, source_id, adjacency, vertex_info, current_time=None):
        if current_time is None:
            current_time = datetime.now()

        visited = set()
        reachable = []
        queue = [(source_id, 0, 1.0)]

        while queue:
            node_id, depth, impact_weight = queue.pop(0)
            if node_id in visited or depth > self.max_depth:
                continue
            visited.add(node_id)

            info = vertex_info.get(node_id, {})
            is_critical = info.get("criticality", "normal") != "normal"
            node_impact = impact_weight * (self.privilege_weight if is_critical else 1.0)

            if depth > 0:
                reachable.append({
                    "entity_id": node_id,
                    "entity_type": info.get("entity_type", "unknown"),
                    "display_name": info.get("display_name", node_id),
                    "depth": depth,
                    "impact_weight": round(node_impact, 4),
                    "is_critical": is_critical,
                    "risk_score": info.get("risk_score", 0.0),
                })

            neighbors = adjacency.get(node_id, {})
            for neighbor_id, edge_weight in neighbors.items():
                if neighbor_id not in visited:
                    decay = 0.7 ** depth
                    queue.append((neighbor_id, depth + 1, node_impact * decay))

        reachable.sort(key=lambda r: -r["impact_weight"])
        return {
            "source_entity": source_id,
            "total_reachable": len(reachable),
            "critical_reachable": sum(1 for r in reachable if r["is_critical"]),
            "max_depth_reached": max((r["depth"] for r in reachable), default=0),
            "total_impact": round(sum(r["impact_weight"] for r in reachable), 2),
            "reachable_entities": reachable[:50],
        }


blast_engine = BlastRadiusEngine()

adjacency_map = {}
edges_pdf = g.edges.select("src", "dst", "weight").toPandas()
for _, row in edges_pdf.iterrows():
    s, d, w = row["src"], row["dst"], row["weight"]
    if s not in adjacency_map:
        adjacency_map[s] = {}
    adjacency_map[s][d] = adjacency_map[s].get(d, 0) + w

vertex_info_map = {}
v_pdf = g.vertices.select("id", "entity_type", "display_name", "risk_score", "criticality").toPandas()
for _, row in v_pdf.iterrows():
    vertex_info_map[row["id"]] = {
        "entity_type": row["entity_type"],
        "display_name": row["display_name"],
        "risk_score": row["risk_score"],
        "criticality": row["criticality"] or "normal",
    }

df_entity_state = spark.table(f"{CATALOG}.{SCHEMA_GRAPH}.entity_state_current")
high_risk = (
    df_entity_state
    .filter(F.col("rolling_risk_score") > 3.0)
    .orderBy(F.desc("rolling_risk_score"))
    .limit(20)
    .select("entity_id", "rolling_risk_score")
    .collect()
)

blast_results = {}
for row in high_risk:
    eid = row["entity_id"]
    result = blast_engine.compute_blast_radius(eid, adjacency_map, vertex_info_map)
    blast_results[eid] = result

print(f"Blast Radius Analysis:")
print(f"  Entities analyzed:     {len(blast_results)}")
total_reach = sum(r["total_reachable"] for r in blast_results.values())
crit_reach = sum(r["critical_reachable"] for r in blast_results.values())
print(f"  Total reachable:       {total_reach:,}")
print(f"  Critical reachable:    {crit_reach:,}")

for eid, br in sorted(blast_results.items(), key=lambda x: -x[1]["total_reachable"])[:5]:
    name = vertex_info_map.get(eid, {}).get("display_name", eid[:16])
    print(f"  {name}: {br['total_reachable']} entities, {br['critical_reachable']} critical, impact={br['total_impact']}")`
    },
    {
      type: 'code',
      content: `# Cell 4: Campaign Detection & Clustering Engine
# Groups attack chains into campaigns based on:
# - Shared infrastructure (IPs, domains, tools)
# - Behavioral similarity (technique overlap)
# - Temporal proximity

class CampaignDetector:
    def __init__(self, infra_overlap=0.4, temporal_hours=48, behavioral_sim=0.6):
        self.infra_overlap = infra_overlap
        self.temporal_hours = temporal_hours
        self.behavioral_sim = behavioral_sim

    def jaccard(self, set_a, set_b):
        if not set_a and not set_b:
            return 0.0
        intersection = len(set_a & set_b)
        union = len(set_a | set_b)
        return intersection / union if union > 0 else 0.0

    def cluster_chains(self, chains):
        if len(chains) < 2:
            return []

        campaigns = []
        assigned = set()

        for i, chain_a in enumerate(chains):
            if chain_a["chain_id"] in assigned:
                continue

            campaign_chains = [chain_a]
            campaign_entities = set(chain_a.get("involved_entities", []))
            campaign_techniques = set(chain_a.get("mitre_techniques", []))
            campaign_stages = set(chain_a.get("stages_completed", []))

            for j, chain_b in enumerate(chains):
                if i == j or chain_b["chain_id"] in assigned:
                    continue

                entities_b = set(chain_b.get("involved_entities", []))
                techniques_b = set(chain_b.get("mitre_techniques", []))
                stages_b = set(chain_b.get("stages_completed", []))

                entity_overlap = self.jaccard(campaign_entities, entities_b)
                technique_overlap = self.jaccard(campaign_techniques, techniques_b)
                stage_overlap = self.jaccard(campaign_stages, stages_b)

                combined_similarity = (
                    entity_overlap * 0.5 +
                    technique_overlap * 0.3 +
                    stage_overlap * 0.2
                )

                if (entity_overlap >= self.infra_overlap or
                    combined_similarity >= self.behavioral_sim):
                    campaign_chains.append(chain_b)
                    campaign_entities |= entities_b
                    campaign_techniques |= techniques_b
                    campaign_stages |= stages_b
                    assigned.add(chain_b["chain_id"])

            if len(campaign_chains) >= 2:
                assigned.add(chain_a["chain_id"])
                all_entities = []
                for c in campaign_chains:
                    all_entities.extend(c.get("involved_entities", []))

                campaign = {
                    "campaign_id": f"camp-{uuid.uuid4().hex[:10]}",
                    "campaign_name": f"Campaign-{len(campaigns)+1}",
                    "campaign_type": self._infer_campaign_type(campaign_stages),
                    "shared_infrastructure": list(campaign_entities)[:50],
                    "shared_techniques": list(campaign_techniques),
                    "involved_chains": [c["chain_id"] for c in campaign_chains],
                    "involved_entities": list(set(all_entities))[:100],
                    "confidence": round(min(1.0, len(campaign_chains) / 5.0), 4),
                    "severity": "critical" if len(campaign_chains) >= 4 else "high",
                    "chain_count": len(campaign_chains),
                    "stage_coverage": list(campaign_stages),
                }
                campaigns.append(campaign)

        return campaigns

    def _infer_campaign_type(self, stages):
        stage_set = set(stages)
        if {"credential_access", "lateral_movement", "exfiltration"} <= stage_set:
            return "advanced_persistent_threat"
        if {"credential_access", "lateral_movement"} <= stage_set:
            return "credential_based_intrusion"
        if "exfiltration" in stage_set or "collection" in stage_set:
            return "data_theft"
        if "reconnaissance" in stage_set and len(stage_set) <= 2:
            return "reconnaissance_campaign"
        return "multi_stage_attack"


campaign_detector = CampaignDetector()

try:
    df_chains = spark.table(f"{CATALOG}.{SCHEMA_GRAPH}.attack_chains").filter(F.col("is_active"))
    chains_pdf = df_chains.toPandas()
    chains_list = chains_pdf.to_dict("records")
    campaigns = campaign_detector.cluster_chains(chains_list)
except Exception:
    campaigns = []

print(f"Campaign Detection:")
print(f"  Attack chains analyzed: {len(chains_list) if 'chains_list' in dir() else 0}")
print(f"  Campaigns detected:    {len(campaigns)}")

for camp in campaigns[:5]:
    print(f"  [{camp['severity'].upper()}] {camp['campaign_name']}: "
          f"{camp['chain_count']} chains, type={camp['campaign_type']}, "
          f"confidence={camp['confidence']:.2f}")`
    },
    {
      type: 'code',
      content: `# Cell 5: Intent Inference Engine
# Maps observed graph patterns and kill-chain progress to attacker intent stages.
# Uses a weighted evidence model across 5 intent phases.

class IntentInferenceEngine:
    INTENT_PHASES = [
        "reconnaissance", "credential_access",
        "lateral_movement", "persistence", "exfiltration",
    ]

    PHASE_INDICATORS = {
        "reconnaissance": {
            "stages": ["reconnaissance"],
            "actions": ["dns:query", "network_flow:None", "deception:http_probe",
                        "deception:smb_enum", "deception:rdp_scan"],
            "weight": 0.15,
        },
        "credential_access": {
            "stages": ["credential_access", "initial_access"],
            "actions": ["authentication:login_failed", "authentication:login_success",
                        "authentication:account_lockout", "deception:credential_test",
                        "cloud_api:CreateAccessKey"],
            "weight": 0.20,
        },
        "lateral_movement": {
            "stages": ["lateral_movement", "execution", "privilege_escalation"],
            "actions": ["endpoint:network_connect", "authentication:privilege_grant",
                        "endpoint:process_create", "cloud_api:AssumeRole"],
            "weight": 0.25,
        },
        "persistence": {
            "stages": ["persistence"],
            "actions": ["endpoint:registry_mod", "endpoint:dll_load",
                        "endpoint:file_write"],
            "weight": 0.15,
        },
        "exfiltration": {
            "stages": ["exfiltration", "collection", "command_and_control", "impact"],
            "actions": ["cloud_api:PutObject", "cloud_api:GetObject",
                        "cloud_api:DeleteTrail", "cloud_api:StopLogging",
                        "endpoint:file_write"],
            "weight": 0.25,
        },
    }

    def infer_intent(self, entity_stages, entity_actions, deception_triggered=False):
        phase_scores = {}

        for phase, config in self.PHASE_INDICATORS.items():
            stage_match = sum(1 for s in entity_stages if s in config["stages"])
            action_match = sum(1 for a in entity_actions if a in config["actions"])
            total_indicators = len(config["stages"]) + len(config["actions"])

            raw_score = (stage_match + action_match) / max(total_indicators, 1)

            if deception_triggered and phase in ("reconnaissance", "credential_access"):
                raw_score = min(1.0, raw_score + 0.4)

            phase_scores[phase] = round(raw_score * config["weight"], 4)

        total_score = sum(phase_scores.values())
        max_weight = sum(c["weight"] for c in self.PHASE_INDICATORS.values())
        confidence = round(min(1.0, total_score / max(max_weight * 0.5, 0.01)), 4)

        dominant_phase = max(phase_scores, key=phase_scores.get) if phase_scores else "unknown"

        most_advanced = "unknown"
        for phase in reversed(self.INTENT_PHASES):
            if phase_scores.get(phase, 0) > 0.01:
                most_advanced = phase
                break

        return {
            "dominant_intent": dominant_phase,
            "most_advanced_phase": most_advanced,
            "confidence": confidence,
            "phase_scores": phase_scores,
            "deception_amplified": deception_triggered,
        }


intent_engine = IntentInferenceEngine()

df_es = spark.table(f"{CATALOG}.{SCHEMA_GRAPH}.entity_state_current")
entity_intents = {}

try:
    decep_entities = set()
    df_decep = spark.table(f"{CATALOG}.{SCHEMA_GRAPH}.deception_signals")
    for row in df_decep.select("interacting_entity").distinct().collect():
        decep_entities.add(row["interacting_entity"])
except Exception:
    decep_entities = set()

risk_entities = df_es.filter(F.col("rolling_risk_score") > 1.0).collect()
for row in risk_entities:
    eid = row["entity_id"]
    actions = row["recent_actions"] or []
    stages = []

    try:
        entity_chains = (
            spark.table(f"{CATALOG}.{SCHEMA_GRAPH}.attack_chains")
            .filter(F.array_contains(F.col("involved_entities"), eid))
            .select("stages_completed")
            .collect()
        )
        for chain_row in entity_chains:
            stages.extend(chain_row["stages_completed"] or [])
    except Exception:
        pass

    is_decep = eid in decep_entities
    intent = intent_engine.infer_intent(stages, actions, is_decep)
    entity_intents[eid] = intent

print(f"Intent Inference:")
print(f"  Entities analyzed:    {len(entity_intents)}")
phase_dist = defaultdict(int)
for ei in entity_intents.values():
    phase_dist[ei["most_advanced_phase"]] += 1
for phase, count in sorted(phase_dist.items(), key=lambda x: -x[1]):
    print(f"  {phase:25s}: {count} entities")`
    },
    {
      type: 'code',
      content: `# Cell 6: Lateral Movement Prediction Engine
# Predicts likely next targets for lateral movement based on
# graph topology, access patterns, and asset criticality.

class LateralMovementPredictor:
    def __init__(self, max_candidates=10, priv_weight=3.0, recency_weight=2.0):
        self.max_candidates = max_candidates
        self.priv_weight = priv_weight
        self.recency_weight = recency_weight

    def predict_next_targets(self, source_id, adjacency, vertex_info,
                             already_compromised=None):
        if already_compromised is None:
            already_compromised = set()
        already_compromised.add(source_id)

        direct_neighbors = adjacency.get(source_id, {})
        candidates = []

        for neighbor_id, edge_weight in direct_neighbors.items():
            if neighbor_id in already_compromised:
                continue

            info = vertex_info.get(neighbor_id, {})
            entity_type = info.get("entity_type", "unknown")
            is_critical = info.get("criticality", "normal") != "normal"
            risk = info.get("risk_score", 0.0)

            onward_reach = len(adjacency.get(neighbor_id, {}))

            score = edge_weight * 0.3
            if is_critical:
                score += self.priv_weight
            score += min(onward_reach / 20.0, 1.0) * 2.0
            score += risk * 0.5

            if entity_type == "host":
                score *= 1.5
            elif entity_type == "user":
                score *= 1.2

            second_hop_critical = 0
            for second_id in adjacency.get(neighbor_id, {}):
                s_info = vertex_info.get(second_id, {})
                if s_info.get("criticality", "normal") != "normal":
                    second_hop_critical += 1
            score += second_hop_critical * 0.5

            candidates.append({
                "target_id": neighbor_id,
                "target_name": info.get("display_name", neighbor_id[:16]),
                "entity_type": entity_type,
                "prediction_score": round(score, 4),
                "is_critical": is_critical,
                "edge_weight": edge_weight,
                "onward_connections": onward_reach,
                "second_hop_critical": second_hop_critical,
            })

        candidates.sort(key=lambda c: -c["prediction_score"])
        return candidates[:self.max_candidates]


lateral_predictor = LateralMovementPredictor()

prediction_results = {}
for row in high_risk[:10]:
    eid = row["entity_id"]
    predictions = lateral_predictor.predict_next_targets(
        eid, adjacency_map, vertex_info_map
    )
    if predictions:
        prediction_results[eid] = predictions

print(f"Lateral Movement Prediction:")
print(f"  Source entities analyzed: {len(prediction_results)}")
total_preds = sum(len(p) for p in prediction_results.values())
print(f"  Total predicted targets: {total_preds}")

for eid, preds in list(prediction_results.items())[:3]:
    name = vertex_info_map.get(eid, {}).get("display_name", eid[:16])
    print(f"\\n  From {name}:")
    for p in preds[:3]:
        crit_flag = " [CRITICAL]" if p["is_critical"] else ""
        print(f"    -> {p['target_name']} (score={p['prediction_score']:.2f}, "
              f"reach={p['onward_connections']}){crit_flag}")`
    },
    {
      type: 'code',
      content: `# Cell 7: Graph Compression Engine
# Collapses low-value edges and nodes to create a compressed view
# that highlights attack paths and critical infrastructure.

class GraphCompressor:
    def __init__(self, min_edge_weight=2, min_risk_score=1.0,
                 preserve_critical=True, preserve_attack_paths=True):
        self.min_edge_weight = min_edge_weight
        self.min_risk_score = min_risk_score
        self.preserve_critical = preserve_critical
        self.preserve_attack_paths = preserve_attack_paths

    def compress(self, vertices_df, edges_df, attack_chain_entities=None):
        if attack_chain_entities is None:
            attack_chain_entities = set()

        preserved_vertices = set()

        if self.preserve_critical:
            critical_v = (
                vertices_df
                .filter(
                    (F.col("criticality") != "normal") |
                    (F.col("is_honeypot") == True) |
                    (F.col("risk_score") > self.min_risk_score)
                )
                .select("id")
                .collect()
            )
            for row in critical_v:
                preserved_vertices.add(row["id"])

        for eid in attack_chain_entities:
            preserved_vertices.add(eid)

        significant_edges = edges_df.filter(
            (F.col("weight") >= self.min_edge_weight) |
            (F.col("src").isin(list(preserved_vertices))) |
            (F.col("dst").isin(list(preserved_vertices)))
        )

        collapsed_edges = edges_df.filter(
            (F.col("weight") < self.min_edge_weight) &
            (~F.col("src").isin(list(preserved_vertices))) &
            (~F.col("dst").isin(list(preserved_vertices)))
        )

        sig_nodes = set()
        for row in significant_edges.select("src", "dst").collect():
            sig_nodes.add(row["src"])
            sig_nodes.add(row["dst"])

        compressed_vertices = vertices_df.filter(
            F.col("id").isin(list(sig_nodes | preserved_vertices))
        )

        collapse_summary = (
            collapsed_edges
            .groupBy(F.col("src"), F.col("dst"))
            .agg(
                F.sum("weight").alias("total_weight"),
                F.sum("evidence_count").alias("total_evidence"),
                F.count("*").alias("collapsed_count"),
            )
            .filter(F.col("total_weight") >= self.min_edge_weight)
        )

        orig_v = vertices_df.count()
        orig_e = edges_df.count()
        comp_v = compressed_vertices.count()
        comp_e = significant_edges.count()
        re_added = collapse_summary.count()

        return {
            "compressed_vertices": compressed_vertices,
            "compressed_edges": significant_edges,
            "collapse_summary": collapse_summary,
            "stats": {
                "original_vertices": orig_v,
                "original_edges": orig_e,
                "compressed_vertices": comp_v,
                "compressed_edges": comp_e + re_added,
                "compression_ratio_v": round(comp_v / max(orig_v, 1), 4),
                "compression_ratio_e": round((comp_e + re_added) / max(orig_e, 1), 4),
                "preserved_critical": len(preserved_vertices),
                "collapsed_edge_groups": re_added,
            },
        }


compressor = GraphCompressor()

chain_entities = set()
try:
    for row in spark.table(f"{CATALOG}.{SCHEMA_GRAPH}.attack_chains").select("involved_entities").collect():
        if row["involved_entities"]:
            chain_entities.update(row["involved_entities"])
except Exception:
    pass

compression_result = compressor.compress(g.vertices, g.edges, chain_entities)
stats = compression_result["stats"]

print(f"Graph Compression:")
print(f"  Original:    {stats['original_vertices']:,} vertices, {stats['original_edges']:,} edges")
print(f"  Compressed:  {stats['compressed_vertices']:,} vertices, {stats['compressed_edges']:,} edges")
print(f"  Ratio:       {stats['compression_ratio_v']:.1%} vertices, {stats['compression_ratio_e']:.1%} edges")
print(f"  Preserved:   {stats['preserved_critical']} critical/attack-path nodes")
print(f"  Collapsed:   {stats['collapsed_edge_groups']} edge groups re-aggregated")`
    },
    {
      type: 'code',
      content: `# Cell 8: Enhanced Detection Families (Password Spray, Lateral, Rare Proc, Cloud)
# Each detection is now enriched with rarity, blast radius, intent, and campaign context.

silver_df = spark.table(f"{CATALOG}.{SCHEMA_SILVER}.silver_events")

def detect_password_spray(graph, config):
    auth_edges = graph.edges.filter(F.col("edge_type").contains("authentication"))
    if auth_edges.count() == 0:
        return spark.createDataFrame([], StructType([StructField("detection_id", StringType())]))

    ip_fail = (
        auth_edges.filter(F.col("edge_type").contains("login_failed"))
        .groupBy("src")
        .agg(
            F.countDistinct("dst").alias("distinct_targets"),
            F.sum("evidence_count").alias("total_failures"),
            F.min("first_seen").alias("first_failure"),
            F.max("last_seen").alias("last_failure"),
            F.collect_set("dst").alias("target_ids"),
        )
        .filter(F.col("distinct_targets") >= config["min_distinct_users"])
    )

    ip_success = (
        auth_edges.filter(F.col("edge_type").contains("login_success"))
        .select(
            F.col("src").alias("ss"), F.col("dst").alias("success_user"),
            F.col("evidence_count").alias("success_count"),
        )
    )

    return (
        ip_fail.join(ip_success, ip_fail["src"] == ip_success["ss"], "inner")
        .withColumn("success_ratio",
            F.col("success_count") / (F.col("total_failures") + F.col("success_count")))
        .filter(F.col("success_ratio") <= config["max_success_ratio"])
        .withColumn("detection_id", F.expr("uuid()"))
        .withColumn("detection_type", F.lit("password_spray"))
        .withColumn("confidence",
            F.when(F.col("distinct_targets") >= 10, 0.95)
             .when(F.col("distinct_targets") >= 7, 0.85)
             .otherwise(0.75))
        .withColumn("severity", F.lit("critical"))
        .drop("ss")
    )


def detect_lateral_movement(graph, config):
    auth_edges = graph.edges.filter(
        F.col("edge_type").contains("authentication") |
        F.col("edge_type").contains("login") |
        F.col("edge_type").contains("network")
    )
    if auth_edges.count() == 0:
        return spark.createDataFrame([], StructType([StructField("detection_id", StringType())]))

    lat_graph = GraphFrame(graph.vertices, auth_edges)
    try:
        two_hop = lat_graph.find("(a)-[e1]->(b); (b)-[e2]->(c)")
        return (
            two_hop
            .filter(F.col("a.id") != F.col("c.id"))
            .withColumn("time_span",
                F.unix_timestamp(F.col("e2.last_seen")) - F.unix_timestamp(F.col("e1.first_seen")))
            .filter(F.col("time_span").between(0, config["window_seconds"]))
            .withColumn("detection_id", F.expr("uuid()"))
            .withColumn("detection_type", F.lit("lateral_movement"))
            .withColumn("chain_length", F.lit(2))
            .withColumn("confidence",
                F.when(F.col("time_span") < 300, 0.90)
                 .when(F.col("time_span") < 1800, 0.75)
                 .otherwise(0.60))
            .withColumn("severity",
                F.when(F.col("confidence") >= 0.85, "critical").otherwise("high"))
        )
    except Exception as e:
        print(f"Lateral motif note: {str(e)[:200]}")
        return spark.createDataFrame([], StructType([StructField("detection_id", StringType())]))


def detect_rare_process_domain(silver, config):
    proc_freq = (
        silver.filter(F.col("process_name").isNotNull())
        .groupBy("process_name").agg(F.count("*").alias("pc"))
    )
    total_proc = silver.filter(F.col("process_name").isNotNull()).count()

    proc_rare = (
        proc_freq
        .withColumn("pf", F.col("pc") / F.lit(max(total_proc, 1)))
        .filter(F.col("pf") <= config["process_rarity_threshold"])
    )

    dom_freq = (
        silver.filter(F.col("domain").isNotNull())
        .groupBy("domain").agg(F.count("*").alias("dc"))
    )
    total_dom = silver.filter(F.col("domain").isNotNull()).count()

    dom_rare = (
        dom_freq
        .withColumn("df", F.col("dc") / F.lit(max(total_dom, 1)))
        .filter(F.col("df") <= config["domain_rarity_threshold"])
    )

    return (
        silver
        .filter(F.col("process_name").isNotNull() & F.col("domain").isNotNull())
        .join(proc_rare, "process_name", "inner")
        .join(dom_rare, "domain", "inner")
        .groupBy("process_name", "domain", "host_id", "user_id")
        .agg(
            F.count("*").alias("connection_count"),
            F.min("event_time").alias("first_seen"),
            F.max("event_time").alias("last_seen"),
            F.first("pf").alias("proc_rarity"),
            F.first("df").alias("domain_rarity"),
        )
        .withColumn("detection_id", F.expr("uuid()"))
        .withColumn("detection_type", F.lit("rare_process_domain"))
        .withColumn("combined_rarity", F.col("proc_rarity") * F.col("domain_rarity"))
        .withColumn("confidence",
            F.when(F.col("combined_rarity") < 0.00001, 0.95)
             .when(F.col("combined_rarity") < 0.0001, 0.85)
             .otherwise(0.70))
        .withColumn("severity",
            F.when(F.col("confidence") >= 0.90, "critical")
             .when(F.col("confidence") >= 0.80, "high")
             .otherwise("medium"))
    )


def detect_cloud_credential_abuse(silver, config):
    cloud = silver.filter(
        (F.col("source_type") == "cloud_audit") & F.col("api_action").isNotNull()
    )
    if cloud.count() == 0:
        return spark.createDataFrame([], StructType([StructField("detection_id", StringType())]))

    return (
        cloud
        .withColumn("win",
            F.window("event_time", f"{config['window_seconds']} seconds").getItem("start"))
        .groupBy("user_id", "win")
        .agg(
            F.count("*").alias("api_count"),
            F.countDistinct("api_action").alias("distinct_apis"),
            F.countDistinct("cloud_region").alias("region_count"),
            F.min("event_time").alias("first_call"),
            F.max("event_time").alias("last_call"),
        )
        .filter(
            (F.col("api_count") >= config["api_burst_threshold"]) |
            (F.col("region_count") >= config["max_region_spread"])
        )
        .withColumn("detection_id", F.expr("uuid()"))
        .withColumn("detection_type", F.lit("cloud_credential_abuse"))
        .withColumn("confidence",
            F.when(F.col("region_count") >= 4, 0.95)
             .when(F.col("api_count") >= 100, 0.90)
             .otherwise(0.75))
        .withColumn("severity",
            F.when(F.col("confidence") >= 0.85, "critical").otherwise("high"))
    )


spray_results = detect_password_spray(g, {"min_distinct_users": 3, "max_success_ratio": 0.3})
lateral_results = detect_lateral_movement(g, {"min_hops": 2, "window_seconds": 3600})
rare_results = detect_rare_process_domain(silver_df, {
    "process_rarity_threshold": 0.02, "domain_rarity_threshold": 0.01,
})
cloud_results = detect_cloud_credential_abuse(silver_df, {
    "max_region_spread": 2, "window_seconds": 1800, "api_burst_threshold": 10,
})

spray_count = spray_results.count()
lateral_count = lateral_results.count()
rare_count = rare_results.count()
cloud_count = cloud_results.count()

print(f"Detection Results:")
print(f"  Password Spray:         {spray_count:,}")
print(f"  Lateral Movement:       {lateral_count:,}")
print(f"  Rare Process->Domain:   {rare_count:,}")
print(f"  Cloud Credential Abuse: {cloud_count:,}")
print(f"  Total:                  {spray_count + lateral_count + rare_count + cloud_count:,}")`
    },
    {
      type: 'code',
      content: `# Cell 9: 10-Dimension Scoring Engine & Evidence Package Builder
# Combines all engines into a unified scoring framework.

def compute_detection_score_v2(
    graph_rarity=0.0, behavioral_anomaly=0.0, temporal_anomaly=0.0,
    event_rarity=0.0, entity_criticality=0.0, graph_fanout=0,
    evidence_count=0, intent_confidence=0.0, kill_chain_progress=0.0,
    deception_signal=0.0, weights=None,
):
    w = weights or SCORING_WEIGHTS

    norm_fanout = min(graph_fanout / 20.0, 1.0)
    norm_evidence = min(evidence_count / 50.0, 1.0)

    factors = {
        "graph_rarity": round(min(graph_rarity, 1.0) * w["graph_rarity"], 4),
        "behavioral_anomaly": round(min(behavioral_anomaly, 1.0) * w["behavioral_anomaly"], 4),
        "temporal_anomaly": round(min(temporal_anomaly, 1.0) * w["temporal_anomaly"], 4),
        "event_rarity": round(min(event_rarity, 1.0) * w["event_rarity"], 4),
        "entity_criticality": round(min(entity_criticality, 1.0) * w["entity_criticality"], 4),
        "graph_fanout": round(norm_fanout * w["graph_fanout"], 4),
        "evidence_count": round(norm_evidence * w["evidence_count"], 4),
        "intent_confidence": round(min(intent_confidence, 1.0) * w["intent_confidence"], 4),
        "kill_chain_progress": round(min(kill_chain_progress, 1.0) * w["kill_chain_progress"], 4),
        "deception_signal": round(min(deception_signal, 1.0) * w["deception_signal"], 4),
    }

    composite = round(min(sum(factors.values()), 1.0), 4)

    return {
        "composite_score": composite,
        "factors": factors,
        "severity": (
            "critical" if composite >= 0.70 else
            "high" if composite >= 0.50 else
            "medium" if composite >= 0.30 else
            "low"
        ),
    }


def build_evidence_package_v2(
    detection_type, anchor_entity, involved_entities,
    evidence_events=None, mitre_tactics=None, mitre_techniques=None,
    score_result=None, blast_radius=None, campaign_id=None,
    intent_result=None, rarity_multiplier=1.0, deception_triggered=False,
    graph_explanation=None,
):
    br_count = blast_radius["total_reachable"] if blast_radius else 0
    intent_stage = intent_result["most_advanced_phase"] if intent_result else "unknown"

    return {
        "detection_id": str(uuid.uuid4()),
        "detection_type": detection_type,
        "detection_name": detection_type.replace("_", " ").title(),
        "anchor_entity": anchor_entity,
        "involved_entities": involved_entities or [],
        "involved_vertices": [],
        "involved_edges": [],
        "evidence_events": evidence_events or [],
        "evidence_count": len(evidence_events or []),
        "mitre_tactics": mitre_tactics or [],
        "mitre_techniques": mitre_techniques or [],
        "severity": score_result["severity"] if score_result else "medium",
        "confidence": score_result["composite_score"] if score_result else 0.5,
        "risk_score": round((score_result["composite_score"] if score_result else 0.5) * 10.0, 2),
        "scoring_factors": {k: float(v) for k, v in (score_result["factors"] if score_result else {}).items()},
        "graph_context": None,
        "graph_explanation": graph_explanation or f"Detection via {detection_type} with {len(involved_entities or [])} entities",
        "chain_id": None,
        "campaign_id": campaign_id,
        "intent_stage": intent_stage,
        "blast_radius_count": br_count,
        "rarity_multiplier": rarity_multiplier,
        "deception_triggered": deception_triggered,
        "evidence_summary": "",
        "first_event_time": datetime.now() - timedelta(hours=1),
        "last_event_time": datetime.now(),
        "detected_at": datetime.now(),
        "status": "open",
    }


examples = [
    {"name": "APT Kill Chain (Critical)",
     "graph_rarity": 0.85, "behavioral_anomaly": 0.90, "temporal_anomaly": 0.80,
     "event_rarity": 0.75, "entity_criticality": 0.95, "graph_fanout": 15,
     "evidence_count": 40, "intent_confidence": 0.90, "kill_chain_progress": 0.72,
     "deception_signal": 1.0},
    {"name": "Lateral Movement (High)",
     "graph_rarity": 0.40, "behavioral_anomaly": 0.60, "temporal_anomaly": 0.50,
     "event_rarity": 0.50, "entity_criticality": 0.70, "graph_fanout": 6,
     "evidence_count": 12, "intent_confidence": 0.50, "kill_chain_progress": 0.36,
     "deception_signal": 0.0},
    {"name": "Insider Recon (Medium)",
     "graph_rarity": 0.70, "behavioral_anomaly": 0.30, "temporal_anomaly": 0.20,
     "event_rarity": 0.40, "entity_criticality": 0.30, "graph_fanout": 3,
     "evidence_count": 5, "intent_confidence": 0.25, "kill_chain_progress": 0.18,
     "deception_signal": 0.0},
]

print("=" * 72)
print("  10-DIMENSION SCORING ENGINE EXAMPLES")
print("=" * 72)
for ex in examples:
    name = ex.pop("name")
    result = compute_detection_score_v2(**ex)
    print(f"\\n  {name}")
    print(f"    Composite: {result['composite_score']:.4f}  Severity: {result['severity']}")
    for k, v in result["factors"].items():
        bar = "#" * int(v * 200)
        print(f"    {k:25s}: {v:.4f} |{bar}")
print("\\n" + "=" * 72)`
    },
    {
      type: 'code',
      content: `# Cell 10: Assemble & Write All Detections to Gold
# Enriches each detection with graph rarity, blast radius, intent, and campaign context.

all_detection_records = []

def enrich_and_record(detection_type, anchor, involved, evidence,
                      mitre_t, mitre_tech, base_confidence,
                      graph_fanout_val=2, event_rarity_val=0.5):
    entity_intent = entity_intents.get(anchor, {})
    br = blast_results.get(anchor, {"total_reachable": 0})
    is_decep = anchor in decep_entities

    rarity_mult = 1.0
    try:
        rarity_row = df_v_rarity.filter(F.col("id") == anchor).select("node_rarity").collect()
        if rarity_row:
            rarity_mult = max(1.0, 1.0 + rarity_row[0]["node_rarity"])
    except Exception:
        pass

    camp_id = None
    for camp in campaigns:
        if anchor in camp.get("shared_infrastructure", []):
            camp_id = camp["campaign_id"]
            break

    score = compute_detection_score_v2(
        graph_rarity=rarity_mult - 1.0,
        behavioral_anomaly=min(1.0, entity_intent.get("confidence", 0.0)),
        temporal_anomaly=0.5,
        event_rarity=event_rarity_val,
        entity_criticality=0.9 if any(c in str(anchor) for c in
            CRITICAL_ENTITIES["hosts"] + CRITICAL_ENTITIES["users"]) else 0.3,
        graph_fanout=graph_fanout_val,
        evidence_count=len(evidence) if evidence else 5,
        intent_confidence=entity_intent.get("confidence", 0.0),
        kill_chain_progress=entity_intent.get("phase_scores", {}).get("exfiltration", 0.0) * 5,
        deception_signal=1.0 if is_decep else 0.0,
    )

    explanation_parts = [f"Detected {detection_type}"]
    if br["total_reachable"] > 0:
        explanation_parts.append(f"blast radius={br['total_reachable']} entities")
    if entity_intent.get("most_advanced_phase", "unknown") != "unknown":
        explanation_parts.append(f"intent={entity_intent['most_advanced_phase']}")
    if camp_id:
        explanation_parts.append(f"campaign={camp_id}")
    if is_decep:
        explanation_parts.append("DECEPTION TRIGGERED")

    pkg = build_evidence_package_v2(
        detection_type=detection_type,
        anchor_entity=anchor,
        involved_entities=involved,
        evidence_events=evidence or [],
        mitre_tactics=mitre_t,
        mitre_techniques=mitre_tech,
        score_result=score,
        blast_radius=br,
        campaign_id=camp_id,
        intent_result=entity_intent,
        rarity_multiplier=rarity_mult,
        deception_triggered=is_decep,
        graph_explanation="; ".join(explanation_parts),
    )
    pkg["evidence_summary"] = (
        f"Auto-detected {detection_type} (confidence={score['composite_score']:.2f}, "
        f"severity={score['severity']}). {'; '.join(explanation_parts[1:])}"
    )
    all_detection_records.append(pkg)


if spray_count > 0:
    for row in spray_results.limit(50).collect():
        enrich_and_record(
            "password_spray", row["src"],
            [row["src"], row.get("success_user", "")], [],
            ["TA0006"], ["T1110.003"], float(row["confidence"]),
            graph_fanout_val=row["distinct_targets"], event_rarity_val=0.85,
        )

if lateral_count > 0:
    for row in lateral_results.limit(50).collect():
        enrich_and_record(
            "lateral_movement", row["a"]["id"],
            [row["a"]["id"], row["b"]["id"], row["c"]["id"]], [],
            ["TA0008"], ["T1021", "T1563"], float(row["confidence"]),
            graph_fanout_val=3, event_rarity_val=0.50,
        )

if rare_count > 0:
    for row in rare_results.limit(50).collect():
        enrich_and_record(
            "rare_process_domain", row.get("host_id", "unknown"),
            [row.get("host_id", ""), row.get("user_id", "")], [],
            ["TA0011"], ["T1071", "T1568"], float(row["confidence"]),
            graph_fanout_val=2, event_rarity_val=0.95,
        )

if cloud_count > 0:
    for row in cloud_results.limit(50).collect():
        enrich_and_record(
            "cloud_credential_abuse", row["user_id"],
            [row["user_id"]], [],
            ["TA0006", "TA0009"], ["T1528", "T1537"], float(row["confidence"]),
            graph_fanout_val=row.get("region_count", 1), event_rarity_val=0.90,
        )

if all_detection_records:
    df_det = spark.createDataFrame(all_detection_records)
    df_det = (
        df_det
        .withColumn("first_event_time", F.to_timestamp("first_event_time"))
        .withColumn("last_event_time", F.to_timestamp("last_event_time"))
        .withColumn("detected_at", F.to_timestamp("detected_at"))
    )
    df_det.write.mode("append").saveAsTable(f"{CATALOG}.{SCHEMA_GOLD}.detections_gold")
    print(f"\\nWrote {len(all_detection_records)} enriched detections to gold layer")
else:
    print("No detections to write in this cycle")

if campaigns:
    camp_records = []
    for c in campaigns:
        camp_records.append({
            "campaign_id": c["campaign_id"],
            "campaign_name": c["campaign_name"],
            "campaign_type": c["campaign_type"],
            "shared_infrastructure": c["shared_infrastructure"][:50],
            "shared_techniques": c["shared_techniques"],
            "involved_chains": c["involved_chains"],
            "involved_entities": c["involved_entities"][:100],
            "behavioral_signature": json.dumps({"stages": c.get("stage_coverage", [])}),
            "confidence": c["confidence"],
            "severity": c["severity"],
            "status": "active",
            "evolution_log": [f"Created with {c['chain_count']} chains"],
            "first_seen": datetime.now() - timedelta(hours=48),
            "last_seen": datetime.now(),
        })
    df_camp = spark.createDataFrame(camp_records)
    df_camp = (
        df_camp
        .withColumn("created_at", F.current_timestamp())
        .withColumn("first_seen", F.to_timestamp("first_seen"))
        .withColumn("last_seen", F.to_timestamp("last_seen"))
    )
    df_camp.write.mode("overwrite").saveAsTable(f"{CATALOG}.{SCHEMA_GRAPH}.campaigns")
    print(f"Wrote {len(campaigns)} campaigns")

total_gold = spark.table(f"{CATALOG}.{SCHEMA_GOLD}.detections_gold").count()
print(f"Total detections in gold: {total_gold:,}")`
    },
    {
      type: 'code',
      content: `# Cell 11: Comprehensive Unit Tests
# Tests all engines: rarity, blast radius, campaign, intent, lateral prediction,
# compression, scoring, and evidence packaging.

class TestGraphRarityEngine:
    def test_node_rarity_empty(self):
        engine = GraphRarityEngine()
        empty_df = spark.createDataFrame([], StructType([
            StructField("id", StringType()), StructField("entity_type", StringType()),
            StructField("event_count", LongType()),
            StructField("risk_score", DoubleType()), StructField("criticality", StringType()),
            StructField("is_honeypot", BooleanType()),
            StructField("first_seen", TimestampType()), StructField("last_seen", TimestampType()),
        ]))
        result = engine.compute_node_rarity(empty_df)
        assert "node_rarity" in result.columns

    def test_edge_rarity_computes(self):
        engine = GraphRarityEngine()
        rows = [
            ("e1", "s1", "d1", "auth", 1.0, 1, 0.0, None, None, False, None, None),
            ("e2", "s2", "d2", "auth", 1.0, 1, 0.0, None, None, False, None, None),
            ("e3", "s3", "d3", "rare_type", 1.0, 1, 0.0, None, None, False, None, None),
        ]
        schema = StructType([
            StructField("id", StringType()), StructField("src", StringType()),
            StructField("dst", StringType()), StructField("edge_type", StringType()),
            StructField("weight", DoubleType()), StructField("evidence_count", LongType()),
            StructField("rarity_score", DoubleType()), StructField("path_id", StringType()),
            StructField("campaign_id", StringType()), StructField("is_compressed", BooleanType()),
            StructField("first_seen", TimestampType()), StructField("last_seen", TimestampType()),
        ])
        df = spark.createDataFrame(rows, schema)
        result = engine.compute_edge_rarity(df)
        assert result.count() == 3
        assert "edge_rarity" in result.columns


class TestBlastRadiusEngine:
    def test_isolated_node(self):
        engine = BlastRadiusEngine()
        result = engine.compute_blast_radius("node-1", {}, {})
        assert result["total_reachable"] == 0
        assert result["critical_reachable"] == 0

    def test_linear_chain(self):
        engine = BlastRadiusEngine(max_depth=3)
        adj = {
            "a": {"b": 1.0},
            "b": {"c": 1.0},
            "c": {"d": 1.0},
        }
        info = {k: {"entity_type": "host", "display_name": k,
                     "risk_score": 0.0, "criticality": "normal"} for k in "abcd"}
        result = engine.compute_blast_radius("a", adj, info)
        assert result["total_reachable"] == 3

    def test_critical_amplification(self):
        engine = BlastRadiusEngine(max_depth=2, privilege_weight=5.0)
        adj = {"a": {"b": 1.0, "c": 1.0}}
        info = {
            "a": {"entity_type": "ip", "display_name": "a", "risk_score": 0.0, "criticality": "normal"},
            "b": {"entity_type": "host", "display_name": "b", "risk_score": 0.0, "criticality": "critical"},
            "c": {"entity_type": "host", "display_name": "c", "risk_score": 0.0, "criticality": "normal"},
        }
        result = engine.compute_blast_radius("a", adj, info)
        b_impact = next(r for r in result["reachable_entities"] if r["entity_id"] == "b")
        c_impact = next(r for r in result["reachable_entities"] if r["entity_id"] == "c")
        assert b_impact["impact_weight"] > c_impact["impact_weight"]


class TestCampaignDetector:
    def test_no_campaigns_single_chain(self):
        det = CampaignDetector()
        chains = [{"chain_id": "c1", "involved_entities": ["a"], "mitre_techniques": [], "stages_completed": []}]
        result = det.cluster_chains(chains)
        assert len(result) == 0

    def test_campaign_overlap(self):
        det = CampaignDetector(infra_overlap=0.3)
        chains = [
            {"chain_id": "c1", "involved_entities": ["a", "b", "c"],
             "mitre_techniques": ["T1"], "stages_completed": ["recon"]},
            {"chain_id": "c2", "involved_entities": ["b", "c", "d"],
             "mitre_techniques": ["T1"], "stages_completed": ["recon"]},
        ]
        result = det.cluster_chains(chains)
        assert len(result) >= 1
        assert result[0]["chain_count"] == 2

    def test_jaccard_empty(self):
        det = CampaignDetector()
        assert det.jaccard(set(), set()) == 0.0
        assert det.jaccard({"a"}, {"a"}) == 1.0


class TestIntentInferenceEngine:
    def test_recon_intent(self):
        engine = IntentInferenceEngine()
        result = engine.infer_intent(
            ["reconnaissance"], ["dns:query", "network_flow:None"], False
        )
        assert result["most_advanced_phase"] == "reconnaissance"
        assert result["confidence"] > 0

    def test_exfil_intent(self):
        engine = IntentInferenceEngine()
        result = engine.infer_intent(
            ["exfiltration", "collection", "lateral_movement"],
            ["cloud_api:PutObject", "cloud_api:GetObject"], False
        )
        assert result["most_advanced_phase"] == "exfiltration"

    def test_deception_amplification(self):
        engine = IntentInferenceEngine()
        r_normal = engine.infer_intent(["reconnaissance"], ["dns:query"], False)
        r_decep = engine.infer_intent(["reconnaissance"], ["dns:query"], True)
        assert r_decep["confidence"] >= r_normal["confidence"]
        assert r_decep["deception_amplified"] == True


class TestLateralMovementPredictor:
    def test_no_neighbors(self):
        pred = LateralMovementPredictor()
        result = pred.predict_next_targets("a", {}, {})
        assert len(result) == 0

    def test_ranked_predictions(self):
        pred = LateralMovementPredictor(priv_weight=5.0)
        adj = {"a": {"b": 2.0, "c": 1.0}}
        info = {
            "a": {"entity_type": "ip", "display_name": "a", "risk_score": 0.0, "criticality": "normal"},
            "b": {"entity_type": "host", "display_name": "critical-srv",
                   "risk_score": 5.0, "criticality": "critical"},
            "c": {"entity_type": "host", "display_name": "ws-1",
                   "risk_score": 0.0, "criticality": "normal"},
        }
        result = pred.predict_next_targets("a", adj, info)
        assert len(result) == 2
        assert result[0]["target_id"] == "b"

    def test_skip_compromised(self):
        pred = LateralMovementPredictor()
        adj = {"a": {"b": 1.0, "c": 1.0}}
        info = {k: {"entity_type": "host", "display_name": k,
                     "risk_score": 0.0, "criticality": "normal"} for k in "abc"}
        result = pred.predict_next_targets("a", adj, info, already_compromised={"b"})
        assert len(result) == 1
        assert result[0]["target_id"] == "c"


class TestScoringV2:
    def test_max_score(self):
        result = compute_detection_score_v2(
            graph_rarity=1.0, behavioral_anomaly=1.0, temporal_anomaly=1.0,
            event_rarity=1.0, entity_criticality=1.0, graph_fanout=20,
            evidence_count=50, intent_confidence=1.0, kill_chain_progress=1.0,
            deception_signal=1.0,
        )
        assert result["composite_score"] == 1.0
        assert result["severity"] == "critical"

    def test_zero_score(self):
        result = compute_detection_score_v2()
        assert result["composite_score"] == 0.0
        assert result["severity"] == "low"

    def test_ten_dimensions(self):
        result = compute_detection_score_v2(
            graph_rarity=0.5, behavioral_anomaly=0.5, temporal_anomaly=0.5,
            event_rarity=0.5, entity_criticality=0.5, graph_fanout=10,
            evidence_count=25, intent_confidence=0.5, kill_chain_progress=0.5,
            deception_signal=0.5,
        )
        assert len(result["factors"]) == 10
        assert result["composite_score"] > 0
        assert result["severity"] in ("medium", "high")

    def test_deception_boost(self):
        r_no = compute_detection_score_v2(deception_signal=0.0)
        r_yes = compute_detection_score_v2(deception_signal=1.0)
        assert r_yes["composite_score"] > r_no["composite_score"]


class TestEvidencePackage:
    def test_package_structure(self):
        score = compute_detection_score_v2(event_rarity=0.8, entity_criticality=0.9)
        pkg = build_evidence_package_v2(
            detection_type="test_detection",
            anchor_entity="entity-1",
            involved_entities=["entity-1", "entity-2"],
            score_result=score,
        )
        assert "detection_id" in pkg
        assert pkg["detection_type"] == "test_detection"
        assert pkg["blast_radius_count"] == 0
        assert pkg["deception_triggered"] == False
        assert pkg["intent_stage"] == "unknown"

    def test_enriched_package(self):
        score = compute_detection_score_v2(deception_signal=1.0)
        pkg = build_evidence_package_v2(
            detection_type="enriched",
            anchor_entity="e1",
            involved_entities=["e1"],
            score_result=score,
            blast_radius={"total_reachable": 42},
            campaign_id="camp-001",
            intent_result={"most_advanced_phase": "exfiltration"},
            deception_triggered=True,
            rarity_multiplier=2.5,
        )
        assert pkg["blast_radius_count"] == 42
        assert pkg["campaign_id"] == "camp-001"
        assert pkg["intent_stage"] == "exfiltration"
        assert pkg["deception_triggered"] == True
        assert pkg["rarity_multiplier"] == 2.5


test_classes = [
    TestGraphRarityEngine, TestBlastRadiusEngine, TestCampaignDetector,
    TestIntentInferenceEngine, TestLateralMovementPredictor,
    TestScoringV2, TestEvidencePackage,
]
total_tests = 0
passed = 0
failed = 0
errors = []

for cls in test_classes:
    inst = cls()
    methods = [m for m in dir(inst) if m.startswith("test_")]
    for method in methods:
        total_tests += 1
        try:
            getattr(inst, method)()
            passed += 1
        except AssertionError as e:
            failed += 1
            errors.append(f"FAIL: {cls.__name__}.{method}: {e}")
        except Exception as e:
            failed += 1
            errors.append(f"ERROR: {cls.__name__}.{method}: {e}")

for err in errors:
    print(f"  {err}")

print(f"""
================================================================
  UNIT TEST RESULTS - ADVANCED DETECTION ENGINES
================================================================
  Total:    {total_tests}
  Passed:   {passed}
  Failed:   {failed}
  Classes:  {len(test_classes)}
  Status:   {'ALL PASSED' if failed == 0 else 'FAILURES DETECTED'}
================================================================
""")`
    },
    {
      type: 'code',
      content: `# Cell 12: Final Dashboard & Architecture Summary

import matplotlib.pyplot as plt
import pandas as pd

df_gold = spark.table(f"{CATALOG}.{SCHEMA_GOLD}.detections_gold")
df_v = spark.table(f"{CATALOG}.{SCHEMA_GRAPH}.vertices_current")
df_e = spark.table(f"{CATALOG}.{SCHEMA_GRAPH}.edges_current")
df_silver = spark.table(f"{CATALOG}.{SCHEMA_SILVER}.silver_events")

fig, axes = plt.subplots(3, 3, figsize=(26, 20))
fig.suptitle("SIEM Graph Correlation Engine - Advanced Detection Report",
             fontsize=18, fontweight="bold")

if df_gold.count() > 0:
    det_type = df_gold.groupBy("detection_type").count().toPandas()
    colors_map = {
        "password_spray": "#ef4444", "lateral_movement": "#f59e0b",
        "rare_process_domain": "#3b82f6", "cloud_credential_abuse": "#10b981",
    }
    colors = [colors_map.get(t, "#6b7280") for t in det_type["detection_type"]]
    det_type.set_index("detection_type")["count"].plot(
        kind="bar", ax=axes[0, 0], color=colors, edgecolor="#374151")
    axes[0, 0].tick_params(axis="x", rotation=30)
else:
    axes[0, 0].text(0.5, 0.5, "Detections populate\\nwith streaming", ha="center", va="center")
axes[0, 0].set_title("Detections by Type", fontweight="bold")

if df_gold.count() > 0:
    sev = df_gold.groupBy("severity").count().toPandas()
    sc = {"critical": "#ef4444", "high": "#f59e0b", "medium": "#3b82f6", "low": "#10b981"}
    axes[0, 1].pie(sev["count"], labels=sev["severity"],
                   colors=[sc.get(s, "#9ca3af") for s in sev["severity"]],
                   autopct="%1.0f%%")
else:
    axes[0, 1].text(0.5, 0.5, "Awaiting detections", ha="center", va="center")
axes[0, 1].set_title("Severity Distribution", fontweight="bold")

if df_gold.count() > 0 and "blast_radius_count" in df_gold.columns:
    br_data = df_gold.filter(F.col("blast_radius_count") > 0).select("blast_radius_count").toPandas()
    if len(br_data) > 0:
        axes[0, 2].hist(br_data["blast_radius_count"], bins=20, color="#dc2626", edgecolor="#991b1b")
    else:
        axes[0, 2].text(0.5, 0.5, "No blast radius data", ha="center", va="center")
else:
    axes[0, 2].text(0.5, 0.5, "Blast radius pending", ha="center", va="center")
axes[0, 2].set_title("Blast Radius Distribution", fontweight="bold")

if df_gold.count() > 0 and "intent_stage" in df_gold.columns:
    intent_data = df_gold.filter(F.col("intent_stage").isNotNull()).groupBy("intent_stage").count().toPandas()
    if len(intent_data) > 0:
        intent_colors = {
            "reconnaissance": "#64748b", "credential_access": "#f59e0b",
            "lateral_movement": "#ef4444", "persistence": "#8b5cf6",
            "exfiltration": "#dc2626", "unknown": "#9ca3af",
        }
        ic = [intent_colors.get(s, "#6b7280") for s in intent_data["intent_stage"]]
        intent_data.set_index("intent_stage")["count"].plot(
            kind="barh", ax=axes[1, 0], color=ic, edgecolor="#374151")
    else:
        axes[1, 0].text(0.5, 0.5, "No intent data", ha="center", va="center")
else:
    axes[1, 0].text(0.5, 0.5, "Intent inference pending", ha="center", va="center")
axes[1, 0].set_title("Intent Stage Distribution", fontweight="bold")

try:
    camp_df = spark.table(f"{CATALOG}.{SCHEMA_GRAPH}.campaigns")
    camp_data = camp_df.select("campaign_name", "confidence", F.size("involved_chains").alias("chains")).toPandas()
    if len(camp_data) > 0:
        axes[1, 1].barh(camp_data["campaign_name"], camp_data["chains"],
                        color="#2563eb", edgecolor="#1e40af")
        axes[1, 1].set_xlabel("Chains")
    else:
        axes[1, 1].text(0.5, 0.5, "No campaigns", ha="center", va="center")
except:
    axes[1, 1].text(0.5, 0.5, "Campaign data pending", ha="center", va="center")
axes[1, 1].set_title("Campaign Clusters", fontweight="bold")

if df_gold.count() > 0 and "rarity_multiplier" in df_gold.columns:
    rm = df_gold.filter(F.col("rarity_multiplier") > 1.0).select("rarity_multiplier").toPandas()
    if len(rm) > 0:
        axes[1, 2].hist(rm["rarity_multiplier"], bins=15, color="#0ea5e9", edgecolor="#0369a1")
    else:
        axes[1, 2].text(0.5, 0.5, "All rarity = 1.0", ha="center", va="center")
else:
    axes[1, 2].text(0.5, 0.5, "Rarity data pending", ha="center", va="center")
axes[1, 2].set_title("Graph Rarity Multiplier", fontweight="bold")

if df_gold.count() > 0 and "confidence" in df_gold.columns:
    conf = df_gold.select("confidence").toPandas()
    axes[2, 0].hist(conf["confidence"], bins=20, color="#0ea5e9", edgecolor="#0369a1")
    axes[2, 0].axvline(x=0.70, color="#ef4444", linestyle="--", label="Critical threshold")
    axes[2, 0].legend()
else:
    axes[2, 0].text(0.5, 0.5, "Confidence pending", ha="center", va="center")
axes[2, 0].set_title("Detection Confidence", fontweight="bold")

if df_gold.count() > 0:
    deception_count = df_gold.filter(F.col("deception_triggered") == True).count()
    non_deception = df_gold.count() - deception_count
    if deception_count > 0:
        axes[2, 1].pie([deception_count, non_deception],
                       labels=["Deception-Enhanced", "Standard"],
                       colors=["#dc2626", "#64748b"], autopct="%1.0f%%")
    else:
        axes[2, 1].text(0.5, 0.5, "No deception triggers", ha="center", va="center")
else:
    axes[2, 1].text(0.5, 0.5, "Awaiting data", ha="center", va="center")
axes[2, 1].set_title("Deception-Enhanced Detections", fontweight="bold")

summary = f"""
SIEM Graph Correlation Engine
Advanced Detection Report

Silver Events:      {df_silver.count():>10,}
Graph Vertices:     {df_v.count():>10,}
Graph Edges:        {df_e.count():>10,}
Gold Detections:    {df_gold.count():>10,}
Campaigns:          {len(campaigns):>10,}

Advanced Engines:
  Graph Rarity
  Blast Radius
  Campaign Clustering
  Intent Inference
  Lateral Prediction
  Graph Compression
  Deception Scoring

Compression:
  V: {stats['compression_ratio_v']:.1%}
  E: {stats['compression_ratio_e']:.1%}

Scoring: 10 dimensions
Tests:   {total_tests} ({passed} passed)
"""
axes[2, 2].text(0.05, 0.95, summary, transform=axes[2, 2].transAxes,
                fontsize=8.5, verticalalignment="top", fontfamily="monospace",
                bbox=dict(boxstyle="round", facecolor="#f1f5f9"))
axes[2, 2].axis("off")
axes[2, 2].set_title("Engine Summary", fontweight="bold")

plt.tight_layout()
plt.show()

print(summary)`
    },
  ],
};
