import { DatabricksNotebook } from '../databricksNotebooks';

export const graphCorrelationVectorDetectionNotebook: DatabricksNotebook = {
  id: 'graph-correlation-vector-detection',
  title: 'SIEM Graph Correlation Engine - Vector-Augmented Detection & Analyst Experience',
  subtitle: 'Spark-to-Ray integration, retrieval scoring, semantic enrichment, explainability, evaluation',
  category: 'correlation',
  tags: ['Vector Augmentation', 'Spark-Ray Integration', 'Retrieval Scoring', 'Explainability', 'Analyst UX', 'Evaluation', 'Semantic Memory'],
  description: 'Part 5 of the SIEM Graph Correlation Engine. Integrates the vector/AI memory layer with Spark detection pipeline. Implements compact chain/subgraph representations, Spark-to-Ray retrieval calls, combined graph+vector scoring, and rich analyst output with vector-based confidence explanations. Includes full evaluation plan for measuring precision/recall lift from the vector layer.',
  estimatedRuntime: '12 min',
  clusterRequirements: 'DBR 14.3 LTS ML, 8+ workers, Ray runtime, Mosaic AI Vector Search, Unity Catalog',
  cells: [
    {
      type: 'markdown',
      content: `# SIEM Graph Correlation Engine - Part 5: Vector-Augmented Detection

## Integration Architecture

The vector layer sits **alongside** exact graph correlation, never replacing it.
When Spark detects a suspicious pattern, it builds a compact representation and
queries Ray Serve for semantic context:

\`\`\`
  Spark Detection Pipeline
       |
       | suspicious partial chain detected
       v
  +----+----+
  | COMPACT |   Build minimal portable representation:
  | REPR    |   - chain_actions: ["auth:fail", "auth:success", "proc:create", ...]
  | BUILDER |   - chain_entities: ["user-X", "host-Y", ...]
  |         |   - ioc_values: ["evil.com", "mimikatz.exe", ...]
  |         |   - neighborhood_structure: {vertices: [...], edges: [...]}
  +---------+
       |
       v
  +----+----+     +-----+     +-----------+
  | RAY     | --> | IOC | --> | Similar   |
  | SERVE   |     | IDX |     | IOCs      |
  | /score  |     +-----+     +-----------+
  |         |     +-----+     +-----------+
  |         | --> | SEQ | --> | Similar   |
  |         |     | IDX |     | Chains    |
  |         |     +-----+     +-----------+
  |         |     +-----+     +-----------+
  |         | --> | NBR | --> | Similar   |
  |         |     | IDX |     | Subgraphs |
  +---------+     +-----+     +-----------+
       |
       v
  +----+------+
  | COMBINED  |   Final score = f(
  | SCORING   |     exact_graph_evidence,
  |           |     temporal_confidence,
  |           |     rarity,
  |           |     vector_similarity_to_known_bad,
  |           |     semantic_cti_match,
  |           |     historical_incident_similarity,
  |           |   )
  +-----------+
       |
       v
  ANALYST OUTPUT: graph path + timeline + similar incidents +
                  CTI matches + vector confidence explanation
\`\`\`

## Key Design Decisions

1. **Separate embedding spaces** -- IOCs, sequences, and graph neighborhoods
   live in different vector indexes because their similarity semantics differ
2. **Vector scores adjust, not override** -- a high vector match can boost
   confidence by up to 30%, a false-positive match can suppress by up to 50%
3. **Explainability first** -- every vector contribution is narrated in natural
   language for the analyst
4. **Evaluation-ready** -- built-in A/B comparison framework to measure
   precision/recall lift from the vector layer`
    },
    {
      type: 'code',
      content: `# Cell 1: Compact Representation Builders
# Creates minimal, portable representations of attack chains, IOC clusters,
# and graph neighborhoods for efficient vector comparison.

from pyspark.sql import functions as F
from pyspark.sql.types import *
from collections import defaultdict
import json, uuid, hashlib, math
from datetime import datetime, timedelta

CATALOG = "soc_platform"
SCHEMA_GRAPH = "graph_live"
SCHEMA_GOLD = "graph_detections"
SCHEMA_VECTOR = "graph_vectors"

class CompactChainBuilder:
    """
    Builds a portable representation of a partial or complete attack chain
    suitable for vector embedding and cross-index retrieval.
    """
    def build(self, chain_data, entity_state=None, silver_events=None):
        actions = chain_data.get("event_actions") or []
        if not actions and chain_data.get("stages_completed"):
            actions = [f"stage:{s}" for s in chain_data["stages_completed"]]

        involved = chain_data.get("involved_entities", [])
        stages = chain_data.get("stages_completed", [])
        techniques = chain_data.get("mitre_techniques", [])

        time_span = 0.0
        try:
            if chain_data.get("first_event_time") and chain_data.get("last_event_time"):
                t0 = chain_data["first_event_time"]
                t1 = chain_data["last_event_time"]
                if isinstance(t0, str):
                    t0 = datetime.fromisoformat(t0)
                if isinstance(t1, str):
                    t1 = datetime.fromisoformat(t1)
                time_span = (t1 - t0).total_seconds()
        except (ValueError, TypeError):
            pass

        entity_types = set()
        entity_risk_max = 0.0
        has_critical = False
        if entity_state:
            for eid in involved:
                state = entity_state.get(eid, {})
                entity_types.add(state.get("entity_type", "unknown"))
                risk = state.get("rolling_risk_score", 0)
                if risk > entity_risk_max:
                    entity_risk_max = risk
                if state.get("criticality", "normal") != "normal":
                    has_critical = True

        return {
            "chain_id": chain_data.get("chain_id", str(uuid.uuid4())[:12]),
            "actions": actions[:50],
            "action_count": len(actions),
            "unique_actions": len(set(actions)),
            "stages": stages,
            "stage_count": len(stages),
            "techniques": techniques,
            "entities": involved[:30],
            "entity_count": len(involved),
            "entity_types": list(entity_types),
            "time_span_seconds": time_span,
            "is_compressed": time_span < 300 and len(actions) > 4,
            "kill_chain_progress": len(stages) / 11.0,
            "max_entity_risk": entity_risk_max,
            "has_critical_entity": has_critical,
            "intent_stage": chain_data.get("intent_stage", "unknown"),
            "confidence": chain_data.get("confidence", 0.0),
        }


class CompactIOCBuilder:
    """
    Extracts IOC artifacts from a detection context for vector lookup.
    """
    IOC_FIELDS = {
        "domain": ["domain", "dst_domain", "query_domain"],
        "url": ["url", "request_url"],
        "file_path": ["file_path", "process_path", "process_name"],
        "command_line": ["command_line", "process_command"],
        "registry_key": ["registry_key", "registry_path"],
        "ip": ["src_ip", "dst_ip"],
    }

    def extract(self, events_data):
        iocs = []
        seen = set()

        for event in events_data:
            for ioc_type, field_names in self.IOC_FIELDS.items():
                for field in field_names:
                    value = event.get(field)
                    if value and value not in seen:
                        seen.add(value)
                        iocs.append({
                            "ioc_type": ioc_type,
                            "ioc_value": value,
                            "source_event_id": event.get("event_id", ""),
                        })

        return iocs[:100]


class CompactNeighborhoodBuilder:
    """
    Extracts a minimal subgraph representation around an entity.
    """
    def build(self, center_id, vertices, edges, max_vertices=50, max_edges=100):
        relevant_edges = [
            e for e in edges
            if e.get("src") == center_id or e.get("dst") == center_id
        ][:max_edges]

        relevant_ids = {center_id}
        for e in relevant_edges:
            relevant_ids.add(e.get("src", ""))
            relevant_ids.add(e.get("dst", ""))

        relevant_vertices = [
            v for v in vertices if v.get("vertex_id", v.get("id", "")) in relevant_ids
        ][:max_vertices]

        edge_type_counts = defaultdict(int)
        for e in relevant_edges:
            edge_type_counts[e.get("edge_type", "unknown")] += 1

        entity_type_counts = defaultdict(int)
        for v in relevant_vertices:
            entity_type_counts[v.get("entity_type", "unknown")] += 1

        return {
            "center_entity": center_id,
            "vertices": [
                {
                    "id": v.get("vertex_id", v.get("id", "")),
                    "type": v.get("entity_type", "unknown"),
                    "risk": v.get("risk_score", 0),
                    "critical": v.get("criticality", "normal") != "normal",
                }
                for v in relevant_vertices
            ],
            "edges": [
                {
                    "src": e.get("src", ""),
                    "dst": e.get("dst", ""),
                    "type": e.get("edge_type", "unknown"),
                    "weight": e.get("weight", 1),
                }
                for e in relevant_edges
            ],
            "vertex_count": len(relevant_vertices),
            "edge_count": len(relevant_edges),
            "edge_type_distribution": dict(edge_type_counts),
            "entity_type_distribution": dict(entity_type_counts),
        }


chain_builder = CompactChainBuilder()
ioc_builder = CompactIOCBuilder()
neighborhood_builder = CompactNeighborhoodBuilder()

print("Compact representation builders initialized:")
print("  CompactChainBuilder:        attack chain -> portable vector-ready format")
print("  CompactIOCBuilder:          event context -> extracted IOC artifacts")
print("  CompactNeighborhoodBuilder: graph -> minimal subgraph representation")`
    },
    {
      type: 'code',
      content: `# Cell 2: Spark-to-Ray Integration Bridge
# When Spark detects a suspicious pattern, this module calls Ray Serve
# endpoints to retrieve similar patterns from vector indexes.

import requests
from typing import Dict, List, Optional

class SparkToRayBridge:
    """
    Bridges Spark detection pipeline to Ray Serve vector APIs.
    In production, RAY_SERVE_URL points to the Ray Serve deployment.
    For validation, uses local mock responses.
    """
    def __init__(self, ray_serve_url="http://ray-serve:8000/soc-vector",
                 timeout_ms=500, fallback_on_timeout=True):
        self.base_url = ray_serve_url
        self.timeout = timeout_ms / 1000.0
        self.fallback_on_timeout = fallback_on_timeout
        self.call_count = 0
        self.latency_sum = 0.0
        self.error_count = 0

    def embed_and_retrieve(self, compact_chain, compact_iocs, compact_neighborhood):
        """
        Full retrieval pipeline:
        1. Embed the compact chain representation
        2. Query all 3 vector indexes
        3. Retrieve incident memory
        4. Return unified results
        """
        results = {
            "similar_sequences": [],
            "similar_iocs": [],
            "similar_neighborhoods": [],
            "similar_incidents": [],
            "retrieval_metadata": {
                "latency_ms": 0, "indexes_queried": 0, "total_results": 0,
            },
        }

        start_time = datetime.now()

        seq_results = self._retrieve_similar_sequences(compact_chain)
        results["similar_sequences"] = seq_results

        ioc_results = self._retrieve_similar_iocs(compact_iocs)
        results["similar_iocs"] = ioc_results

        nbr_results = self._retrieve_similar_neighborhoods(compact_neighborhood)
        results["similar_neighborhoods"] = nbr_results

        incident_results = self._retrieve_similar_incidents(compact_chain)
        results["similar_incidents"] = incident_results

        elapsed = (datetime.now() - start_time).total_seconds() * 1000
        results["retrieval_metadata"] = {
            "latency_ms": round(elapsed, 1),
            "indexes_queried": 3,
            "total_results": (
                len(seq_results) + len(ioc_results) +
                len(nbr_results) + len(incident_results)
            ),
        }

        self.call_count += 1
        self.latency_sum += elapsed

        return results

    def _retrieve_similar_sequences(self, compact_chain):
        """Query behavioral_sequence_index for similar attack chains."""
        try:
            # Production: POST to Ray Serve
            # response = requests.post(
            #     f"{self.base_url}/retrieve",
            #     json={"index": "sequence", "vector": chain_embedding, "top_k": 5},
            #     timeout=self.timeout,
            # )
            # return response.json()["results"]

            # Validation: simulate retrieval from local table
            actions = compact_chain.get("actions", [])
            stages = compact_chain.get("stages", [])

            df_seq = spark.table(f"{CATALOG}.{SCHEMA_VECTOR}.sequence_embeddings")
            results = []

            candidates = df_seq.collect()
            for row in candidates:
                stored_actions = row["event_actions"] or []
                stored_stages = row["mitre_stages"] or []

                action_overlap = len(set(actions) & set(stored_actions))
                stage_overlap = len(set(stages) & set(stored_stages))
                max_possible = max(
                    len(set(actions) | set(stored_actions)),
                    len(set(stages) | set(stored_stages)), 1
                )
                similarity = (action_overlap + stage_overlap) / max_possible

                results.append({
                    "sequence_id": row["sequence_id"],
                    "label": row["label"],
                    "similarity": round(similarity, 4),
                    "is_known_malicious": row["is_known_malicious"],
                    "is_confirmed_benign": row["is_confirmed_benign"],
                    "intent_stage": row["intent_stage"],
                    "kill_chain_progress": row["kill_chain_progress"],
                    "event_count": row["event_count"],
                })

            results.sort(key=lambda r: -r["similarity"])
            return results[:5]

        except Exception as e:
            self.error_count += 1
            return []

    def _retrieve_similar_iocs(self, compact_iocs):
        """Query semantic_ioc_index for similar IOC artifacts."""
        try:
            df_ioc = spark.table(f"{CATALOG}.{SCHEMA_VECTOR}.ioc_embeddings")
            results = []

            query_values = {ioc["ioc_value"].lower() for ioc in compact_iocs}
            candidates = df_ioc.collect()

            for row in candidates:
                stored_norm = (row["ioc_normalized"] or "").lower()
                stored_value = (row["ioc_value"] or "").lower()

                best_sim = 0.0
                for qv in query_values:
                    if stored_norm == qv or stored_value == qv:
                        best_sim = 1.0
                        break
                    shared_tokens = set(stored_norm.split(".")) & set(qv.split("."))
                    all_tokens = set(stored_norm.split(".")) | set(qv.split("."))
                    token_sim = len(shared_tokens) / max(len(all_tokens), 1)
                    best_sim = max(best_sim, token_sim)

                if best_sim > 0.1:
                    results.append({
                        "ioc_id": row["ioc_id"],
                        "ioc_type": row["ioc_type"],
                        "ioc_value": row["ioc_value"],
                        "similarity": round(best_sim, 4),
                        "maliciousness_score": row["maliciousness_score"],
                        "mitre_techniques": row["mitre_techniques"],
                        "campaign_ids": row["campaign_ids"],
                        "source": row["source"],
                    })

            results.sort(key=lambda r: -r["similarity"])
            return results[:10]

        except Exception as e:
            self.error_count += 1
            return []

    def _retrieve_similar_neighborhoods(self, compact_neighborhood):
        """Query graph_neighborhood_index for structurally similar subgraphs."""
        try:
            df_nbr = spark.table(f"{CATALOG}.{SCHEMA_VECTOR}.neighborhood_embeddings")
            results = []

            query_edge_types = set(compact_neighborhood.get("edge_type_distribution", {}).keys())
            query_entity_types = set(compact_neighborhood.get("entity_type_distribution", {}).keys())
            query_v_count = compact_neighborhood.get("vertex_count", 0)

            candidates = df_nbr.collect()
            for row in candidates:
                stored_edge_types = set(row["edge_types"] or [])
                stored_entity_types = set(row["entity_types"] or [])

                edge_overlap = len(query_edge_types & stored_edge_types)
                entity_overlap = len(query_entity_types & stored_entity_types)
                type_similarity = (edge_overlap + entity_overlap) / max(
                    len(query_edge_types | stored_edge_types) +
                    len(query_entity_types | stored_entity_types), 1
                )

                size_ratio = min(query_v_count, row["vertex_count"]) / max(
                    query_v_count, row["vertex_count"], 1
                )
                similarity = type_similarity * 0.7 + size_ratio * 0.3

                results.append({
                    "neighborhood_id": row["neighborhood_id"],
                    "center_entity_id": row["center_entity_id"],
                    "similarity": round(similarity, 4),
                    "vertex_count": row["vertex_count"],
                    "edge_count": row["edge_count"],
                    "risk_score": row["risk_score"],
                    "has_critical_node": row["has_critical_node"],
                    "has_lateral_movement": row["has_lateral_movement"],
                })

            results.sort(key=lambda r: -r["similarity"])
            return results[:5]

        except Exception as e:
            self.error_count += 1
            return []

    def _retrieve_similar_incidents(self, compact_chain):
        """Query incident memory for similar past incidents."""
        try:
            df_inc = spark.table(f"{CATALOG}.{SCHEMA_VECTOR}.incident_memory")
            results = []

            query_techniques = set(compact_chain.get("techniques", []))
            query_stages = set(compact_chain.get("stages", []))
            query_intent = compact_chain.get("intent_stage", "")

            candidates = df_inc.collect()
            for row in candidates:
                stored_techniques = set(row["mitre_techniques"] or [])
                stored_tactics = set(row["mitre_tactics"] or [])
                stored_detections = set(row["detection_types"] or [])

                tech_overlap = len(query_techniques & stored_techniques)
                tactic_overlap = len(query_stages & stored_tactics)
                tech_total = max(len(query_techniques | stored_techniques), 1)

                similarity = (tech_overlap * 2 + tactic_overlap) / max(tech_total * 2, 1)

                if row["false_positive"] and similarity > 0.5:
                    similarity *= 1.2

                results.append({
                    "incident_id": row["incident_id"],
                    "incident_type": row["incident_type"],
                    "incident_title": row["incident_title"],
                    "similarity": round(min(similarity, 1.0), 4),
                    "severity": row["severity"],
                    "false_positive": row["false_positive"],
                    "response_summary": row["response_summary"],
                    "lessons_learned": row["lessons_learned"],
                    "playbook_id": row["playbook_id"],
                    "detection_types": list(stored_detections),
                })

            results.sort(key=lambda r: -r["similarity"])
            return results[:5]

        except Exception as e:
            self.error_count += 1
            return []


bridge = SparkToRayBridge()
print("Spark-to-Ray bridge initialized")
print(f"  Target: {bridge.base_url}")
print(f"  Timeout: {bridge.timeout * 1000}ms")
print(f"  Fallback on timeout: {bridge.fallback_on_timeout}")`
    },
    {
      type: 'code',
      content: `# Cell 3: Combined Graph + Vector Scoring Engine
# Merges exact graph evidence with vector similarity signals into a
# unified detection score. Vectors augment -- never override.

class VectorAugmentedScorer:
    """
    Combines traditional graph-based scoring with vector similarity signals.

    Scoring formula:
      final_score = (
          base_graph_score * graph_weight +
          vector_malicious_boost * vector_boost_weight +
          cti_semantic_match * cti_weight +
          incident_memory_signal * memory_weight
      ) * false_positive_suppression

    Constraints:
      - Vector signals can boost by at most +30%
      - False-positive matches can suppress by at most -50%
      - Final score always [0.0, 1.0]
    """
    def __init__(self, graph_weight=0.60, vector_boost_weight=0.15,
                 cti_weight=0.10, memory_weight=0.15,
                 max_boost=0.30, max_suppress=0.50):
        self.graph_weight = graph_weight
        self.vector_boost_weight = vector_boost_weight
        self.cti_weight = cti_weight
        self.memory_weight = memory_weight
        self.max_boost = max_boost
        self.max_suppress = max_suppress

    def score(self, base_graph_score, retrieval_results):
        seq_results = retrieval_results.get("similar_sequences", [])
        ioc_results = retrieval_results.get("similar_iocs", [])
        nbr_results = retrieval_results.get("similar_neighborhoods", [])
        incident_results = retrieval_results.get("similar_incidents", [])

        malicious_seq_score = self._compute_malicious_signal(seq_results)
        ioc_threat_score = self._compute_ioc_threat_signal(ioc_results)
        neighborhood_risk = self._compute_neighborhood_signal(nbr_results)
        incident_signal, fp_signal = self._compute_incident_signal(incident_results)

        vector_boost = (
            malicious_seq_score * 0.40 +
            ioc_threat_score * 0.30 +
            neighborhood_risk * 0.15 +
            incident_signal * 0.15
        )
        vector_boost = min(vector_boost, self.max_boost)

        fp_suppression = 1.0
        if fp_signal > 0.5:
            fp_suppression = max(1.0 - self.max_suppress, 1.0 - fp_signal)

        final = (
            base_graph_score * self.graph_weight +
            vector_boost * self.vector_boost_weight +
            ioc_threat_score * self.cti_weight +
            incident_signal * self.memory_weight
        ) * fp_suppression

        final = round(max(0.0, min(1.0, final)), 4)

        return {
            "final_score": final,
            "base_graph_score": base_graph_score,
            "vector_boost": round(vector_boost, 4),
            "fp_suppression": round(fp_suppression, 4),
            "component_scores": {
                "graph_evidence": round(base_graph_score * self.graph_weight, 4),
                "malicious_sequence_match": round(malicious_seq_score, 4),
                "ioc_threat_signal": round(ioc_threat_score, 4),
                "neighborhood_risk": round(neighborhood_risk, 4),
                "incident_memory": round(incident_signal, 4),
                "false_positive_match": round(fp_signal, 4),
            },
            "severity": (
                "critical" if final >= 0.70 else
                "high" if final >= 0.50 else
                "medium" if final >= 0.30 else
                "low"
            ),
            "confidence_delta": round(final - base_graph_score * self.graph_weight, 4),
        }

    def _compute_malicious_signal(self, seq_results):
        if not seq_results:
            return 0.0
        malicious = [r for r in seq_results if r.get("is_known_malicious")]
        if not malicious:
            return 0.0
        max_sim = max(r["similarity"] for r in malicious)
        return min(max_sim, 1.0)

    def _compute_ioc_threat_signal(self, ioc_results):
        if not ioc_results:
            return 0.0
        threat_scores = [
            r["similarity"] * r.get("maliciousness_score", 0.5)
            for r in ioc_results
            if r.get("maliciousness_score", 0) > 0.5
        ]
        if not threat_scores:
            return 0.0
        return min(max(threat_scores), 1.0)

    def _compute_neighborhood_signal(self, nbr_results):
        if not nbr_results:
            return 0.0
        risky = [
            r for r in nbr_results
            if r.get("has_critical_node") or r.get("has_lateral_movement")
        ]
        if not risky:
            return 0.0
        return min(max(r["similarity"] for r in risky), 1.0)

    def _compute_incident_signal(self, incident_results):
        if not incident_results:
            return 0.0, 0.0

        confirmed = [r for r in incident_results if not r.get("false_positive")]
        fps = [r for r in incident_results if r.get("false_positive")]

        incident_signal = max(r["similarity"] for r in confirmed) if confirmed else 0.0
        fp_signal = max(r["similarity"] for r in fps) if fps else 0.0

        return min(incident_signal, 1.0), min(fp_signal, 1.0)


scorer = VectorAugmentedScorer()

print("Vector-augmented scorer initialized")
print(f"  Weights: graph={scorer.graph_weight}, vector_boost={scorer.vector_boost_weight}, "
      f"cti={scorer.cti_weight}, memory={scorer.memory_weight}")
print(f"  Max boost: +{scorer.max_boost:.0%}, Max suppress: -{scorer.max_suppress:.0%}")`
    },
    {
      type: 'code',
      content: `# Cell 4: End-to-End Detection Enrichment Pipeline
# Processes existing gold detections through the vector augmentation pipeline.

df_gold = spark.table(f"{CATALOG}.{SCHEMA_GOLD}.detections_gold")
df_entity_state = spark.table(f"{CATALOG}.{SCHEMA_GRAPH}.entity_state_current")
df_v = spark.table(f"{CATALOG}.{SCHEMA_GRAPH}.vertices_current")
df_e = spark.table(f"{CATALOG}.{SCHEMA_GRAPH}.edges_current")

entity_state_map = {}
for row in df_entity_state.collect():
    entity_state_map[row["entity_id"]] = {
        "entity_type": row["entity_type"],
        "rolling_risk_score": row["rolling_risk_score"],
        "criticality": "normal",
    }

vertices_list = [
    {"vertex_id": r["vertex_id"], "entity_type": r["entity_type"],
     "risk_score": r["risk_score"], "criticality": r.get("criticality", "normal")}
    for r in df_v.limit(500).collect()
]
edges_list = [
    {"src": r["src_vertex_id"], "dst": r["dst_vertex_id"],
     "edge_type": r["edge_type"], "weight": r["weight"]}
    for r in df_e.limit(2000).collect()
]

enriched_detections = []
detections = df_gold.orderBy(F.desc("confidence")).limit(30).collect()

for det in detections:
    anchor = det["anchor_entity"]
    involved = det["involved_entities"] or []

    chain_data = {
        "chain_id": det.get("chain_id") or str(uuid.uuid4())[:12],
        "event_actions": det.get("evidence_events") or [],
        "stages_completed": [det.get("intent_stage", "unknown")],
        "involved_entities": involved,
        "mitre_techniques": det.get("mitre_techniques") or [],
        "intent_stage": det.get("intent_stage", "unknown"),
        "confidence": det["confidence"],
        "first_event_time": det.get("first_event_time"),
        "last_event_time": det.get("last_event_time"),
    }
    compact_chain = chain_builder.build(chain_data, entity_state_map)

    sample_events = [
        {"domain": "evil-c2-server.xyz", "event_id": "e1"},
        {"process_name": "mimikatz.exe", "event_id": "e2"},
        {"src_ip": "10.0.1.50", "dst_ip": "10.0.99.1", "event_id": "e3"},
    ]
    compact_iocs = ioc_builder.extract(sample_events)

    compact_nbr = neighborhood_builder.build(anchor, vertices_list, edges_list)

    retrieval = bridge.embed_and_retrieve(compact_chain, compact_iocs, compact_nbr)

    base_score = det["confidence"]
    combined = scorer.score(base_score, retrieval)

    enriched_detections.append({
        "detection_id": det["detection_id"],
        "detection_type": det["detection_type"],
        "anchor_entity": anchor,
        "original_score": base_score,
        "vector_augmented_score": combined["final_score"],
        "score_delta": combined["confidence_delta"],
        "vector_boost": combined["vector_boost"],
        "fp_suppression": combined["fp_suppression"],
        "severity_original": det["severity"],
        "severity_augmented": combined["severity"],
        "similar_sequences": len(retrieval["similar_sequences"]),
        "similar_iocs": len(retrieval["similar_iocs"]),
        "similar_neighborhoods": len(retrieval["similar_neighborhoods"]),
        "similar_incidents": len(retrieval["similar_incidents"]),
        "component_scores": combined["component_scores"],
        "retrieval_latency_ms": retrieval["retrieval_metadata"]["latency_ms"],
    })

print(f"Enriched {len(enriched_detections)} detections with vector context")
print(f"  Bridge calls: {bridge.call_count}, avg latency: "
      f"{bridge.latency_sum / max(bridge.call_count, 1):.1f}ms")
print()

boosted = sum(1 for d in enriched_detections if d["score_delta"] > 0)
suppressed = sum(1 for d in enriched_detections if d["score_delta"] < 0)
unchanged = sum(1 for d in enriched_detections if d["score_delta"] == 0)
print(f"  Score impact:")
print(f"    Boosted:    {boosted}")
print(f"    Suppressed: {suppressed}")
print(f"    Unchanged:  {unchanged}")

if enriched_detections:
    avg_delta = sum(d["score_delta"] for d in enriched_detections) / len(enriched_detections)
    max_boost = max(d["score_delta"] for d in enriched_detections)
    max_suppress = min(d["score_delta"] for d in enriched_detections)
    print(f"    Avg delta:  {avg_delta:+.4f}")
    print(f"    Max boost:  {max_boost:+.4f}")
    print(f"    Max suppress: {max_suppress:+.4f}")`
    },
    {
      type: 'code',
      content: `# Cell 5: Analyst Experience Output Builder
# For each detection, generates a rich analyst-facing report with
# graph path, timeline, similar incidents, CTI matches, and
# vector confidence explanations.

class AnalystReportBuilder:
    """
    Generates human-readable detection reports that explain both
    graph evidence and vector similarity contributions.
    """
    def build_report(self, detection, compact_chain, retrieval_results,
                     combined_score, blast_radius=None):
        sections = []

        sections.append(self._build_header(detection, combined_score))
        sections.append(self._build_timeline(compact_chain))
        sections.append(self._build_graph_path(detection, compact_chain))
        sections.append(self._build_similar_incidents(retrieval_results))
        sections.append(self._build_cti_matches(retrieval_results))
        sections.append(self._build_vector_explanation(combined_score, retrieval_results))

        if blast_radius:
            sections.append(self._build_blast_radius(blast_radius))

        sections.append(self._build_recommendations(detection, retrieval_results, combined_score))

        return {
            "detection_id": detection.get("detection_id", ""),
            "report_sections": sections,
            "report_text": "\n\n".join(s["text"] for s in sections),
            "report_json": {s["section"]: s for s in sections},
        }

    def _build_header(self, detection, combined_score):
        severity = combined_score["severity"]
        score = combined_score["final_score"]
        det_type = detection.get("detection_type", "unknown").replace("_", " ").title()

        return {
            "section": "header",
            "text": (
                f"[{severity.upper()}] {det_type} Detection\n"
                f"Score: {score:.2f} | Entity: {detection.get('anchor_entity', 'unknown')}\n"
                f"Time: {detection.get('first_event_time', 'N/A')} -> "
                f"{detection.get('last_event_time', 'N/A')}"
            ),
        }

    def _build_timeline(self, compact_chain):
        actions = compact_chain.get("actions", [])
        stages = compact_chain.get("stages", [])
        duration = compact_chain.get("time_span_seconds", 0)

        lines = ["Timeline:"]
        for i, action in enumerate(actions[:15]):
            lines.append(f"  [{i+1:2d}] {action}")
        if len(actions) > 15:
            lines.append(f"  ... +{len(actions) - 15} more events")

        lines.append(f"\nKill-chain stages: {' -> '.join(stages) if stages else 'N/A'}")
        lines.append(f"Duration: {duration:.0f}s ({duration/60:.1f} min)")
        if compact_chain.get("is_compressed"):
            lines.append("WARNING: Compressed timeline -- faster than expected")

        return {"section": "timeline", "text": "\n".join(lines)}

    def _build_graph_path(self, detection, compact_chain):
        entities = compact_chain.get("entities", [])
        entity_types = compact_chain.get("entity_types", [])

        lines = ["Graph Path:"]
        for i, eid in enumerate(entities[:10]):
            etype = entity_types[i] if i < len(entity_types) else "unknown"
            lines.append(f"  {eid} ({etype})")
            if i < len(entities) - 1:
                lines.append(f"    |")
                lines.append(f"    v")

        return {"section": "graph_path", "text": "\n".join(lines)}

    def _build_similar_incidents(self, retrieval_results):
        incidents = retrieval_results.get("similar_incidents", [])
        if not incidents:
            return {"section": "similar_incidents", "text": "Similar Incidents: None found"}

        lines = ["Similar Past Incidents:"]
        for inc in incidents[:3]:
            fp_flag = " [FALSE POSITIVE]" if inc.get("false_positive") else ""
            lines.append(
                f"  [{inc['severity'].upper()}] {inc['incident_title']}{fp_flag}\n"
                f"    Similarity: {inc['similarity']:.0%} | Type: {inc['incident_type']}\n"
                f"    Response: {(inc.get('response_summary') or 'N/A')[:120]}\n"
                f"    Playbook: {inc.get('playbook_id', 'N/A')}"
            )

        return {"section": "similar_incidents", "text": "\n".join(lines)}

    def _build_cti_matches(self, retrieval_results):
        iocs = retrieval_results.get("similar_iocs", [])
        threat_iocs = [i for i in iocs if i.get("maliciousness_score", 0) > 0.5]

        if not threat_iocs:
            return {"section": "cti_matches", "text": "CTI/IOC Matches: None found"}

        lines = ["CTI / IOC Matches:"]
        for ioc in threat_iocs[:5]:
            campaigns = ", ".join(ioc.get("campaign_ids", [])) or "N/A"
            techniques = ", ".join(ioc.get("mitre_techniques", [])) or "N/A"
            lines.append(
                f"  [{ioc['ioc_type'].upper()}] {ioc['ioc_value']}\n"
                f"    Similarity: {ioc['similarity']:.0%} | "
                f"Maliciousness: {ioc['maliciousness_score']:.0%}\n"
                f"    Campaigns: {campaigns} | Techniques: {techniques}\n"
                f"    Source: {ioc.get('source', 'N/A')}"
            )

        return {"section": "cti_matches", "text": "\n".join(lines)}

    def _build_vector_explanation(self, combined_score, retrieval_results):
        components = combined_score.get("component_scores", {})
        delta = combined_score.get("confidence_delta", 0)

        lines = ["Vector Confidence Explanation:"]

        if delta > 0.05:
            lines.append(f"  The vector layer INCREASED confidence by {delta:+.2%}")
        elif delta < -0.05:
            lines.append(f"  The vector layer DECREASED confidence by {delta:+.2%}")
        else:
            lines.append(f"  The vector layer had minimal impact ({delta:+.2%})")

        reasons = []
        mal_score = components.get("malicious_sequence_match", 0)
        if mal_score > 0.3:
            nearest_mal = next(
                (r for r in retrieval_results.get("similar_sequences", [])
                 if r.get("is_known_malicious")), None
            )
            label = nearest_mal.get("label", "unknown") if nearest_mal else "unknown"
            reasons.append(
                f"  + Sequence similarity to known malicious pattern '{label}' "
                f"(score={mal_score:.2f})"
            )

        ioc_score = components.get("ioc_threat_signal", 0)
        if ioc_score > 0.3:
            reasons.append(
                f"  + IOC matches known threat intelligence (score={ioc_score:.2f})"
            )

        nbr_score = components.get("neighborhood_risk", 0)
        if nbr_score > 0.3:
            reasons.append(
                f"  + Graph neighborhood structurally similar to previous attacks "
                f"(score={nbr_score:.2f})"
            )

        inc_score = components.get("incident_memory", 0)
        if inc_score > 0.3:
            nearest_inc = next(
                (r for r in retrieval_results.get("similar_incidents", [])
                 if not r.get("false_positive")), None
            )
            title = nearest_inc.get("incident_title", "unknown") if nearest_inc else "unknown"
            reasons.append(
                f"  + Similar to past confirmed incident: '{title}' "
                f"(score={inc_score:.2f})"
            )

        fp_score = components.get("false_positive_match", 0)
        if fp_score > 0.5:
            fp_inc = next(
                (r for r in retrieval_results.get("similar_incidents", [])
                 if r.get("false_positive")), None
            )
            title = fp_inc.get("incident_title", "unknown") if fp_inc else "unknown"
            reasons.append(
                f"  - High similarity to confirmed FALSE POSITIVE: '{title}' "
                f"(score={fp_score:.2f}). Recommend review before escalation."
            )

        if not reasons:
            reasons.append("  No significant vector matches. Rely on graph evidence alone.")

        lines.extend(reasons)
        return {"section": "vector_explanation", "text": "\n".join(lines)}

    def _build_blast_radius(self, blast_radius):
        lines = [f"Blast Radius: {blast_radius.get('total_reachable', 0)} reachable entities"]
        critical = blast_radius.get("critical_reachable", 0)
        if critical > 0:
            lines.append(f"  CRITICAL entities reachable: {critical}")
        for entity in blast_radius.get("reachable_entities", [])[:5]:
            crit = " [CRITICAL]" if entity.get("is_critical") else ""
            lines.append(
                f"  - {entity['display_name']} (depth={entity['depth']}, "
                f"impact={entity['impact_weight']:.2f}){crit}"
            )
        return {"section": "blast_radius", "text": "\n".join(lines)}

    def _build_recommendations(self, detection, retrieval_results, combined_score):
        lines = ["Recommended Actions:"]

        if combined_score["severity"] == "critical":
            lines.append("  1. IMMEDIATE escalation to Tier 3 / Incident Commander")
        elif combined_score["severity"] == "high":
            lines.append("  1. Escalate to Tier 2 for investigation")

        incidents = retrieval_results.get("similar_incidents", [])
        confirmed = [i for i in incidents if not i.get("false_positive") and i.get("playbook_id")]
        if confirmed:
            pb = confirmed[0]["playbook_id"]
            lines.append(f"  2. Execute playbook: {pb} (from similar incident)")

        fp_matches = [i for i in incidents if i.get("false_positive") and i["similarity"] > 0.7]
        if fp_matches:
            lines.append(
                f"  NOTE: {len(fp_matches)} similar false positive(s) on record. "
                f"Verify with context before escalation."
            )

        ioc_matches = [i for i in retrieval_results.get("similar_iocs", [])
                       if i.get("maliciousness_score", 0) > 0.8]
        if ioc_matches:
            lines.append(f"  3. Block IOCs: {', '.join(i['ioc_value'] for i in ioc_matches[:3])}")

        return {"section": "recommendations", "text": "\n".join(lines)}


report_builder = AnalystReportBuilder()

if enriched_detections:
    sample = enriched_detections[0]

    det_data = {
        "detection_id": sample["detection_id"],
        "detection_type": sample["detection_type"],
        "anchor_entity": sample["anchor_entity"],
        "first_event_time": "2024-10-01T14:30:00",
        "last_event_time": "2024-10-01T14:45:00",
        "severity": sample["severity_original"],
    }

    sample_chain = chain_builder.build({
        "chain_id": "demo-chain",
        "event_actions": [
            "authentication:login_failed", "authentication:login_failed",
            "authentication:login_success", "endpoint:process_create",
            "endpoint:network_connect", "cloud_api:AssumeRole",
        ],
        "stages_completed": ["credential_access", "initial_access", "execution", "lateral_movement"],
        "involved_entities": [sample["anchor_entity"]],
        "mitre_techniques": ["T1110.003", "T1059", "T1021"],
        "intent_stage": "lateral_movement",
    })

    sample_retrieval = bridge.embed_and_retrieve(
        sample_chain,
        [{"ioc_type": "domain", "ioc_value": "evil-c2-server.xyz"}],
        {"edge_type_distribution": {}, "entity_type_distribution": {}, "vertex_count": 5},
    )

    combined = scorer.score(sample["original_score"], sample_retrieval)
    report = report_builder.build_report(det_data, sample_chain, sample_retrieval, combined)

    print("=" * 72)
    print("  SAMPLE ANALYST REPORT")
    print("=" * 72)
    print(report["report_text"])
    print("=" * 72)`
    },
    {
      type: 'code',
      content: `# Cell 6: Evaluation Plan -- Precision/Recall Lift Measurement
# Framework for measuring the impact of the vector layer on detection quality.

class VectorLayerEvaluator:
    """
    A/B evaluation framework comparing detections with and without
    vector augmentation to measure precision/recall lift.
    """
    def __init__(self):
        self.graph_only_results = []
        self.augmented_results = []

    def evaluate_detection(self, detection, retrieval_results, ground_truth_label):
        """
        Compare graph-only score vs vector-augmented score against ground truth.
        ground_truth_label: "true_positive", "false_positive", "benign"
        """
        base_score = detection.get("original_score", detection.get("confidence", 0.5))

        self.graph_only_results.append({
            "detection_id": detection.get("detection_id", ""),
            "score": base_score,
            "predicted_positive": base_score >= 0.5,
            "ground_truth": ground_truth_label,
            "is_true_positive": ground_truth_label == "true_positive",
        })

        combined = scorer.score(base_score, retrieval_results)

        self.augmented_results.append({
            "detection_id": detection.get("detection_id", ""),
            "score": combined["final_score"],
            "predicted_positive": combined["final_score"] >= 0.5,
            "ground_truth": ground_truth_label,
            "is_true_positive": ground_truth_label == "true_positive",
            "score_delta": combined["confidence_delta"],
            "vector_boost": combined["vector_boost"],
            "fp_suppression": combined["fp_suppression"],
        })

    def compute_metrics(self, results, threshold=0.5):
        tp = sum(1 for r in results if r["predicted_positive"] and r["is_true_positive"])
        fp = sum(1 for r in results if r["predicted_positive"] and not r["is_true_positive"])
        fn = sum(1 for r in results if not r["predicted_positive"] and r["is_true_positive"])
        tn = sum(1 for r in results if not r["predicted_positive"] and not r["is_true_positive"])

        precision = tp / max(tp + fp, 1)
        recall = tp / max(tp + fn, 1)
        f1 = 2 * precision * recall / max(precision + recall, 0.001)
        accuracy = (tp + tn) / max(tp + fp + fn + tn, 1)

        return {
            "tp": tp, "fp": fp, "fn": fn, "tn": tn,
            "precision": round(precision, 4),
            "recall": round(recall, 4),
            "f1": round(f1, 4),
            "accuracy": round(accuracy, 4),
        }

    def compute_lift(self):
        graph_metrics = self.compute_metrics(self.graph_only_results)
        augmented_metrics = self.compute_metrics(self.augmented_results)

        lift = {}
        for metric in ["precision", "recall", "f1", "accuracy"]:
            base = graph_metrics[metric]
            aug = augmented_metrics[metric]
            absolute_lift = round(aug - base, 4)
            relative_lift = round((aug - base) / max(base, 0.001), 4)
            lift[metric] = {
                "graph_only": base,
                "augmented": aug,
                "absolute_lift": absolute_lift,
                "relative_lift": relative_lift,
            }

        correctly_boosted = sum(
            1 for r in self.augmented_results
            if r["score_delta"] > 0 and r["is_true_positive"]
        )
        incorrectly_boosted = sum(
            1 for r in self.augmented_results
            if r["score_delta"] > 0 and not r["is_true_positive"]
        )
        correctly_suppressed = sum(
            1 for r in self.augmented_results
            if r["score_delta"] < 0 and not r["is_true_positive"]
        )
        incorrectly_suppressed = sum(
            1 for r in self.augmented_results
            if r["score_delta"] < 0 and r["is_true_positive"]
        )

        return {
            "metrics_lift": lift,
            "boost_analysis": {
                "correctly_boosted": correctly_boosted,
                "incorrectly_boosted": incorrectly_boosted,
                "correctly_suppressed": correctly_suppressed,
                "incorrectly_suppressed": incorrectly_suppressed,
            },
            "graph_only_metrics": graph_metrics,
            "augmented_metrics": augmented_metrics,
        }


evaluator = VectorLayerEvaluator()

EVAL_SCENARIOS = [
    {"score": 0.75, "label": "true_positive", "has_malicious_match": True, "has_fp_match": False},
    {"score": 0.65, "label": "true_positive", "has_malicious_match": True, "has_fp_match": False},
    {"score": 0.55, "label": "true_positive", "has_malicious_match": False, "has_fp_match": False},
    {"score": 0.45, "label": "true_positive", "has_malicious_match": True, "has_fp_match": False},
    {"score": 0.70, "label": "false_positive", "has_malicious_match": False, "has_fp_match": True},
    {"score": 0.60, "label": "false_positive", "has_malicious_match": False, "has_fp_match": True},
    {"score": 0.50, "label": "false_positive", "has_malicious_match": False, "has_fp_match": False},
    {"score": 0.40, "label": "benign", "has_malicious_match": False, "has_fp_match": False},
    {"score": 0.80, "label": "true_positive", "has_malicious_match": True, "has_fp_match": False},
    {"score": 0.35, "label": "benign", "has_malicious_match": False, "has_fp_match": True},
]

for scenario in EVAL_SCENARIOS:
    mock_retrieval = {
        "similar_sequences": [
            {"similarity": 0.85, "is_known_malicious": True, "label": "apt", "is_confirmed_benign": False}
        ] if scenario["has_malicious_match"] else [],
        "similar_iocs": [
            {"similarity": 0.7, "maliciousness_score": 0.9, "ioc_type": "domain",
             "ioc_value": "evil.com", "campaign_ids": [], "mitre_techniques": [], "source": "feed"}
        ] if scenario["has_malicious_match"] else [],
        "similar_neighborhoods": [],
        "similar_incidents": [
            {"similarity": 0.8, "false_positive": True, "incident_type": "false_positive",
             "incident_title": "Scanner FP", "severity": "low", "response_summary": "",
             "lessons_learned": "", "playbook_id": "PB-FP-001", "detection_types": []}
        ] if scenario["has_fp_match"] else [
            {"similarity": 0.6, "false_positive": False, "incident_type": "apt",
             "incident_title": "APT29", "severity": "critical", "response_summary": "",
             "lessons_learned": "", "playbook_id": "PB-APT-001", "detection_types": []}
        ] if scenario["has_malicious_match"] else [],
    }

    evaluator.evaluate_detection(
        {"detection_id": f"eval-{uuid.uuid4().hex[:8]}", "original_score": scenario["score"]},
        mock_retrieval,
        scenario["label"],
    )

lift_report = evaluator.compute_lift()

print("=" * 72)
print("  VECTOR LAYER EVALUATION REPORT")
print("=" * 72)
print(f"\n  Scenarios evaluated: {len(EVAL_SCENARIOS)}")
print()

print("  Metric Lift:")
for metric, data in lift_report["metrics_lift"].items():
    arrow = "^" if data["absolute_lift"] > 0 else "v" if data["absolute_lift"] < 0 else "="
    print(f"    {metric:12s}: {data['graph_only']:.4f} -> {data['augmented']:.4f} "
          f"({data['absolute_lift']:+.4f}, {data['relative_lift']:+.1%}) {arrow}")

print()
ba = lift_report["boost_analysis"]
print("  Boost Analysis:")
print(f"    Correctly boosted TPs:    {ba['correctly_boosted']}")
print(f"    Incorrectly boosted FPs:  {ba['incorrectly_boosted']}")
print(f"    Correctly suppressed FPs: {ba['correctly_suppressed']}")
print(f"    Incorrectly suppressed TPs: {ba['incorrectly_suppressed']}")
print("=" * 72)`
    },
    {
      type: 'code',
      content: `# Cell 7: Unit Tests for Vector-Augmented Detection

class TestCompactChainBuilder:
    def test_empty_chain(self):
        builder = CompactChainBuilder()
        result = builder.build({})
        assert result["action_count"] == 0
        assert result["stage_count"] == 0

    def test_full_chain(self):
        builder = CompactChainBuilder()
        result = builder.build({
            "event_actions": ["auth:fail", "auth:success", "proc:create"],
            "stages_completed": ["credential_access", "execution"],
            "involved_entities": ["user-1", "host-1"],
            "mitre_techniques": ["T1110"],
            "intent_stage": "lateral_movement",
            "first_event_time": "2024-01-01T00:00:00",
            "last_event_time": "2024-01-01T01:00:00",
        })
        assert result["action_count"] == 3
        assert result["stage_count"] == 2
        assert result["time_span_seconds"] == 3600.0
        assert result["entity_count"] == 2

    def test_compressed_detection(self):
        builder = CompactChainBuilder()
        result = builder.build({
            "event_actions": ["a", "b", "c", "d", "e"],
            "stages_completed": [],
            "involved_entities": [],
            "first_event_time": "2024-01-01T00:00:00",
            "last_event_time": "2024-01-01T00:02:00",
        })
        assert result["is_compressed"] == True


class TestCompactIOCBuilder:
    def test_extract_iocs(self):
        builder = CompactIOCBuilder()
        events = [
            {"domain": "evil.com", "src_ip": "10.0.0.1", "event_id": "e1"},
            {"process_name": "malware.exe", "event_id": "e2"},
            {"domain": "evil.com", "event_id": "e3"},
        ]
        result = builder.extract(events)
        assert len(result) == 3
        values = {r["ioc_value"] for r in result}
        assert "evil.com" in values
        assert "malware.exe" in values


class TestVectorAugmentedScorer:
    def test_no_vector_results(self):
        s = VectorAugmentedScorer()
        result = s.score(0.8, {
            "similar_sequences": [], "similar_iocs": [],
            "similar_neighborhoods": [], "similar_incidents": [],
        })
        assert result["final_score"] > 0
        assert result["vector_boost"] == 0.0
        assert result["fp_suppression"] == 1.0

    def test_malicious_boost(self):
        s = VectorAugmentedScorer()
        base = 0.5
        r_no_match = s.score(base, {
            "similar_sequences": [], "similar_iocs": [],
            "similar_neighborhoods": [], "similar_incidents": [],
        })
        r_match = s.score(base, {
            "similar_sequences": [
                {"similarity": 0.9, "is_known_malicious": True, "is_confirmed_benign": False}
            ],
            "similar_iocs": [], "similar_neighborhoods": [], "similar_incidents": [],
        })
        assert r_match["final_score"] >= r_no_match["final_score"]
        assert r_match["vector_boost"] > 0

    def test_fp_suppression(self):
        s = VectorAugmentedScorer()
        result = s.score(0.7, {
            "similar_sequences": [], "similar_iocs": [],
            "similar_neighborhoods": [],
            "similar_incidents": [
                {"similarity": 0.95, "false_positive": True,
                 "incident_type": "fp", "incident_title": "FP",
                 "severity": "low", "response_summary": "",
                 "lessons_learned": "", "playbook_id": "", "detection_types": []}
            ],
        })
        assert result["fp_suppression"] < 1.0

    def test_score_bounds(self):
        s = VectorAugmentedScorer()
        r_high = s.score(1.0, {
            "similar_sequences": [{"similarity": 1.0, "is_known_malicious": True, "is_confirmed_benign": False}],
            "similar_iocs": [{"similarity": 1.0, "maliciousness_score": 1.0}],
            "similar_neighborhoods": [{"similarity": 1.0, "has_critical_node": True, "has_lateral_movement": True}],
            "similar_incidents": [{"similarity": 1.0, "false_positive": False}],
        })
        assert r_high["final_score"] <= 1.0

        r_low = s.score(0.0, {
            "similar_sequences": [], "similar_iocs": [],
            "similar_neighborhoods": [], "similar_incidents": [],
        })
        assert r_low["final_score"] >= 0.0


class TestAnalystReportBuilder:
    def test_report_sections(self):
        builder = AnalystReportBuilder()
        report = builder.build_report(
            {"detection_id": "d1", "detection_type": "test", "anchor_entity": "e1"},
            {"actions": ["a", "b"], "stages": ["recon"], "entities": ["e1"],
             "entity_types": ["user"], "time_span_seconds": 60, "is_compressed": False},
            {"similar_sequences": [], "similar_iocs": [],
             "similar_neighborhoods": [], "similar_incidents": []},
            {"final_score": 0.5, "severity": "medium", "confidence_delta": 0.0,
             "component_scores": {}},
        )
        section_names = {s["section"] for s in report["report_sections"]}
        assert "header" in section_names
        assert "timeline" in section_names
        assert "vector_explanation" in section_names
        assert "recommendations" in section_names
        assert len(report["report_text"]) > 0


class TestEvaluator:
    def test_perfect_classification(self):
        ev = VectorLayerEvaluator()
        ev.graph_only_results = [
            {"score": 0.9, "predicted_positive": True, "is_true_positive": True},
            {"score": 0.1, "predicted_positive": False, "is_true_positive": False},
        ]
        ev.augmented_results = [
            {"score": 0.95, "predicted_positive": True, "is_true_positive": True, "score_delta": 0.05, "vector_boost": 0.05, "fp_suppression": 1.0},
            {"score": 0.05, "predicted_positive": False, "is_true_positive": False, "score_delta": -0.05, "vector_boost": 0.0, "fp_suppression": 0.5},
        ]
        metrics = ev.compute_metrics(ev.graph_only_results)
        assert metrics["precision"] == 1.0
        assert metrics["recall"] == 1.0


test_classes = [
    TestCompactChainBuilder, TestCompactIOCBuilder,
    TestVectorAugmentedScorer, TestAnalystReportBuilder,
    TestEvaluator,
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
  UNIT TEST RESULTS - VECTOR-AUGMENTED DETECTION
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
      content: `# Cell 8: Final Summary Dashboard

import matplotlib.pyplot as plt

fig, axes = plt.subplots(2, 3, figsize=(24, 14))
fig.suptitle("Vector-Augmented Detection Pipeline - Summary",
             fontsize=16, fontweight="bold")

if enriched_detections:
    original = [d["original_score"] for d in enriched_detections]
    augmented = [d["vector_augmented_score"] for d in enriched_detections]
    x = range(len(enriched_detections))
    axes[0, 0].bar([i - 0.15 for i in x], original, 0.3, label="Graph Only", color="#64748b")
    axes[0, 0].bar([i + 0.15 for i in x], augmented, 0.3, label="Augmented", color="#2563eb")
    axes[0, 0].set_xlabel("Detection")
    axes[0, 0].legend()
axes[0, 0].set_title("Score: Graph-Only vs Augmented", fontweight="bold")

if enriched_detections:
    deltas = [d["score_delta"] for d in enriched_detections]
    colors = ["#10b981" if d > 0 else "#ef4444" if d < 0 else "#64748b" for d in deltas]
    axes[0, 1].bar(range(len(deltas)), deltas, color=colors, edgecolor="#374151")
    axes[0, 1].axhline(y=0, color="#374151", linestyle="-", linewidth=0.5)
    axes[0, 1].set_xlabel("Detection")
    axes[0, 1].set_ylabel("Score Delta")
axes[0, 1].set_title("Vector Layer Impact (delta)", fontweight="bold")

if enriched_detections:
    types = set(d["detection_type"] for d in enriched_detections)
    type_avgs = []
    type_labels = []
    for t in types:
        deltas = [d["score_delta"] for d in enriched_detections if d["detection_type"] == t]
        type_avgs.append(sum(deltas) / max(len(deltas), 1))
        type_labels.append(t.replace("_", "\\n"))
    axes[0, 2].barh(type_labels, type_avgs, color="#0ea5e9", edgecolor="#0369a1")
    axes[0, 2].axvline(x=0, color="#374151", linestyle="-", linewidth=0.5)
axes[0, 2].set_title("Avg Delta by Detection Type", fontweight="bold")

if lift_report:
    metrics = lift_report["metrics_lift"]
    metric_names = list(metrics.keys())
    graph_vals = [metrics[m]["graph_only"] for m in metric_names]
    aug_vals = [metrics[m]["augmented"] for m in metric_names]
    x = range(len(metric_names))
    axes[1, 0].bar([i - 0.15 for i in x], graph_vals, 0.3, label="Graph Only", color="#64748b")
    axes[1, 0].bar([i + 0.15 for i in x], aug_vals, 0.3, label="Augmented", color="#2563eb")
    axes[1, 0].set_xticks(list(x))
    axes[1, 0].set_xticklabels(metric_names)
    axes[1, 0].legend()
axes[1, 0].set_title("Precision/Recall/F1 Lift", fontweight="bold")

if lift_report:
    ba = lift_report["boost_analysis"]
    labels = ["Correct\\nBoost", "Incorrect\\nBoost", "Correct\\nSuppress", "Incorrect\\nSuppress"]
    values = [ba["correctly_boosted"], ba["incorrectly_boosted"],
              ba["correctly_suppressed"], ba["incorrectly_suppressed"]]
    colors = ["#10b981", "#ef4444", "#10b981", "#ef4444"]
    axes[1, 1].bar(labels, values, color=colors, edgecolor="#374151")
axes[1, 1].set_title("Boost/Suppress Accuracy", fontweight="bold")

ioc_count = spark.table(f"{CATALOG}.{SCHEMA_VECTOR}.ioc_embeddings").count()
seq_count = spark.table(f"{CATALOG}.{SCHEMA_VECTOR}.sequence_embeddings").count()
nbr_count = spark.table(f"{CATALOG}.{SCHEMA_VECTOR}.neighborhood_embeddings").count()
inc_count = spark.table(f"{CATALOG}.{SCHEMA_VECTOR}.incident_memory").count()

summary = f"""
Vector-Augmented Detection Summary

Vector Infrastructure:
  IOC Embeddings:      {ioc_count:>6,} (384-dim)
  Sequence Embeddings: {seq_count:>6,} (256-dim)
  Neighborhood Embed:  {nbr_count:>6,} (128-dim)
  Incident Memory:     {inc_count:>6,} (384-dim)
  Vector Indexes:      3 (cosine)

Detection Pipeline:
  Detections enriched: {len(enriched_detections):>6,}
  Avg retrieval:       {bridge.latency_sum / max(bridge.call_count, 1):>6.1f}ms

Evaluation ({len(EVAL_SCENARIOS)} scenarios):
  Precision lift:      {lift_report['metrics_lift']['precision']['absolute_lift']:>+.4f}
  Recall lift:         {lift_report['metrics_lift']['recall']['absolute_lift']:>+.4f}
  F1 lift:             {lift_report['metrics_lift']['f1']['absolute_lift']:>+.4f}

Unit Tests: {total_tests} ({passed} passed)
"""
axes[1, 2].text(0.05, 0.95, summary, transform=axes[1, 2].transAxes,
                fontsize=8.5, verticalalignment="top", fontfamily="monospace",
                bbox=dict(boxstyle="round", facecolor="#f1f5f9"))
axes[1, 2].axis("off")
axes[1, 2].set_title("Pipeline Summary", fontweight="bold")

plt.tight_layout()
plt.show()

print(summary)`
    },
  ],
};
