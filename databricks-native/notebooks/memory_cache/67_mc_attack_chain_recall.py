# Databricks notebook source
# MAGIC %md
# MAGIC # MC-RNN Attack Chain Recall
# MAGIC
# MAGIC Leverages Memory Caching's unique capability: long-range recall of past
# MAGIC attacker activity. Detects multi-stage attacks spanning hours/days by
# MAGIC analyzing cache attention patterns.
# MAGIC
# MAGIC **Detection Scenarios:**
# MAGIC 1. Attacker reconnects after quiet period → model retrieves initial recon cache
# MAGIC 2. Insider gradually escalates over weeks → cache drift analysis
# MAGIC 3. Living-off-the-land blends for days → landmark cache comparison
# MAGIC 4. Coordinated multi-entity attack → cross-entity cache correlation

# COMMAND ----------

# MAGIC %pip install torch>=2.1.0 einops>=0.7.0

# COMMAND ----------

# MAGIC %run ./61_mc_rnn_architecture

# COMMAND ----------

import torch
import torch.nn.functional as F
import numpy as np
from pyspark.sql import SparkSession
import pyspark.sql.functions as SF
from pyspark.sql.window import Window
from datetime import datetime, timedelta
from typing import Dict, List, Tuple, Optional
from dataclasses import dataclass
import json

spark = SparkSession.builder.getOrCreate()

# COMMAND ----------

# MAGIC %md
# MAGIC ## Attack Chain Patterns

# COMMAND ----------

@dataclass
class AttackChainDetection:
    """A detected multi-stage attack chain with cache evidence."""
    chain_id: str
    entity_id: str
    attack_type: str
    confidence: float
    stages: List[Dict]
    cache_evidence: List[Dict]
    timeline_hours: float
    mitre_techniques: List[str]
    description: str


ATTACK_CHAIN_PATTERNS = {
    "reconnection_after_dormancy": {
        "description": "Attacker returns after quiet period, model recalls initial foothold",
        "cache_signal": "high_attention_on_old_caches_after_gap",
        "min_gap_hours": 6,
        "min_confidence": 65,
        "mitre": ["T1078", "T1133", "T1021"],
    },
    "gradual_privilege_escalation": {
        "description": "Insider slowly escalates access over days/weeks",
        "cache_signal": "monotonic_state_divergence_across_caches",
        "min_caches": 10,
        "min_confidence": 60,
        "mitre": ["T1078.002", "T1548", "T1134"],
    },
    "living_off_the_land": {
        "description": "Attacker uses legitimate tools, deviates subtly from baseline",
        "cache_signal": "low_reconstruction_error_but_high_divergence",
        "threshold_ratio": 1.5,
        "min_confidence": 55,
        "mitre": ["T1059", "T1218", "T1197"],
    },
    "data_staging_exfiltration": {
        "description": "Data collected incrementally then exfiltrated in burst",
        "cache_signal": "gradual_accumulation_then_spike",
        "min_staging_segments": 5,
        "min_confidence": 70,
        "mitre": ["T1074", "T1048", "T1567"],
    },
    "lateral_movement_chain": {
        "description": "Sequential compromises across hosts/accounts",
        "cache_signal": "state_similarity_across_entities",
        "similarity_threshold": 0.85,
        "min_entities": 3,
        "min_confidence": 75,
        "mitre": ["T1021", "T1550", "T1563"],
    },
}


# COMMAND ----------

# MAGIC %md
# MAGIC ## Attack Chain Detector

# COMMAND ----------

class AttackChainDetector:
    """
    Detects multi-stage attack chains using MC-RNN cache attention analysis.

    The key insight: when MC-RNN queries old cached states during inference,
    it's finding relevant past context for current behavior. If the model
    suddenly pays attention to caches from weeks ago, the entity may be
    repeating or continuing a past attack pattern.
    """

    def __init__(self, model: MemoryCachingRNN, config: MCConfig):
        self.model = model
        self.config = config
        self.model.eval()
        self.device = next(model.parameters()).device

    @torch.no_grad()
    def analyze_entity_cache_history(
        self,
        entity_id: str,
        current_segment: torch.Tensor,
        cache_states: torch.Tensor,
        cache_timestamps: List[datetime],
    ) -> List[AttackChainDetection]:
        """
        Analyze an entity's cache attention patterns for attack chain indicators.

        Args:
            entity_id: entity being analyzed
            current_segment: (1, seg_len, input_dim) latest events
            cache_states: (1, num_caches, hidden_dim) historical checkpoints
            cache_timestamps: timestamp for each cache entry
        """
        detections = []
        num_caches = cache_states.size(1)

        if num_caches < 3:
            return detections

        cache_mask = torch.ones(1, num_caches, dtype=torch.bool, device=self.device)
        output = self.model(
            current_segment,
            cache_states_per_layer=[cache_states] * self.config.num_layers,
            cache_masks=[cache_mask] * self.config.num_layers,
            segment_index=num_caches,
        )

        attn_weights_per_layer = output["cache_attention_weights"]
        avg_attn = self._average_attention(attn_weights_per_layer, num_caches)

        recon_error = F.mse_loss(
            output["reconstruction"], current_segment, reduction="none"
        ).mean(dim=-1).mean().item()

        current_state = output["segment_checkpoint"]

        chain = self._detect_reconnection(
            entity_id, avg_attn, cache_timestamps, cache_states, current_state
        )
        if chain:
            detections.append(chain)

        chain = self._detect_gradual_escalation(
            entity_id, cache_states, cache_timestamps
        )
        if chain:
            detections.append(chain)

        chain = self._detect_living_off_land(
            entity_id, recon_error, cache_states, current_state, avg_attn
        )
        if chain:
            detections.append(chain)

        chain = self._detect_data_staging(
            entity_id, cache_states, cache_timestamps, avg_attn
        )
        if chain:
            detections.append(chain)

        return detections

    def _average_attention(self, attn_per_layer: list, num_caches: int) -> np.ndarray:
        """Average attention weights across layers."""
        valid_attns = []
        for attn in attn_per_layer:
            if attn is not None and attn.numel() > 0:
                valid_attns.append(attn[0].cpu().numpy())

        if not valid_attns:
            return np.ones(num_caches) / num_caches

        stacked = np.stack(valid_attns)
        return stacked.mean(axis=0)

    def _detect_reconnection(
        self,
        entity_id: str,
        attn_weights: np.ndarray,
        timestamps: List[datetime],
        cache_states: torch.Tensor,
        current_state: torch.Tensor,
    ) -> Optional[AttackChainDetection]:
        """Detect attacker returning after dormancy period."""
        pattern = ATTACK_CHAIN_PATTERNS["reconnection_after_dormancy"]
        num_caches = len(attn_weights)

        if num_caches < 5 or len(timestamps) < 5:
            return None

        gaps = []
        for i in range(1, len(timestamps)):
            if timestamps[i] and timestamps[i-1]:
                gap_hours = (timestamps[i] - timestamps[i-1]).total_seconds() / 3600
                gaps.append((i, gap_hours))

        significant_gaps = [(i, g) for i, g in gaps if g >= pattern["min_gap_hours"]]
        if not significant_gaps:
            return None

        for gap_idx, gap_hours in significant_gaps:
            pre_gap_attention = attn_weights[:gap_idx].sum()
            post_gap_attention = attn_weights[gap_idx:].sum()

            if pre_gap_attention > 0.4:
                pre_gap_state = cache_states[0, gap_idx - 1]
                similarity = F.cosine_similarity(
                    current_state, pre_gap_state.unsqueeze(0), dim=-1
                ).item()

                if similarity > 0.6:
                    confidence = min(95.0, pre_gap_attention * 80 + similarity * 30)
                    if confidence >= pattern["min_confidence"]:
                        return AttackChainDetection(
                            chain_id=f"recon_{entity_id}_{datetime.now().strftime('%H%M%S')}",
                            entity_id=entity_id,
                            attack_type="reconnection_after_dormancy",
                            confidence=confidence,
                            stages=[
                                {"phase": "initial_access", "cache_idx": 0, "timestamp": str(timestamps[0])},
                                {"phase": "dormancy", "duration_hours": gap_hours, "gap_at_idx": gap_idx},
                                {"phase": "reconnection", "cache_idx": num_caches - 1, "timestamp": str(timestamps[-1])},
                            ],
                            cache_evidence=[
                                {"cache_idx": int(i), "attention": float(attn_weights[i])}
                                for i in range(num_caches) if attn_weights[i] > 0.05
                            ],
                            timeline_hours=gap_hours,
                            mitre_techniques=pattern["mitre"],
                            description=f"Entity resumed activity pattern from {gap_hours:.0f}h ago "
                                       f"(cache similarity: {similarity:.2f}, attention on pre-gap: {pre_gap_attention:.2%})",
                        )
        return None

    def _detect_gradual_escalation(
        self,
        entity_id: str,
        cache_states: torch.Tensor,
        timestamps: List[datetime],
    ) -> Optional[AttackChainDetection]:
        """Detect slow privilege escalation across cache checkpoints."""
        pattern = ATTACK_CHAIN_PATTERNS["gradual_privilege_escalation"]
        num_caches = cache_states.size(1)

        if num_caches < pattern["min_caches"]:
            return None

        state_diffs = []
        for i in range(1, num_caches):
            diff = torch.norm(cache_states[0, i] - cache_states[0, i-1]).item()
            state_diffs.append(diff)

        if len(state_diffs) < 5:
            return None

        x = np.arange(len(state_diffs))
        slope, intercept = np.polyfit(x, state_diffs, 1)

        monotonic_segments = sum(1 for i in range(1, len(state_diffs)) if state_diffs[i] >= state_diffs[i-1])
        monotonic_ratio = monotonic_segments / (len(state_diffs) - 1)

        if slope > 0.1 and monotonic_ratio > 0.6:
            total_drift = sum(state_diffs)
            confidence = min(90.0, slope * 100 + monotonic_ratio * 40)

            if confidence >= pattern["min_confidence"]:
                timeline = 0
                if timestamps and timestamps[0] and timestamps[-1]:
                    timeline = (timestamps[-1] - timestamps[0]).total_seconds() / 3600

                return AttackChainDetection(
                    chain_id=f"escal_{entity_id}_{datetime.now().strftime('%H%M%S')}",
                    entity_id=entity_id,
                    attack_type="gradual_privilege_escalation",
                    confidence=confidence,
                    stages=[
                        {"phase": "baseline", "cache_range": [0, 2], "drift": float(state_diffs[0])},
                        {"phase": "escalating", "cache_range": [3, num_caches-2], "avg_drift": float(np.mean(state_diffs[3:]))},
                        {"phase": "current", "cache_idx": num_caches-1, "total_drift": float(total_drift)},
                    ],
                    cache_evidence=[
                        {"cache_idx": i, "drift_from_prev": float(state_diffs[i-1])}
                        for i in range(1, num_caches) if state_diffs[i-1] > np.mean(state_diffs)
                    ],
                    timeline_hours=timeline,
                    mitre_techniques=pattern["mitre"],
                    description=f"Monotonic behavioral escalation over {num_caches} segments "
                               f"(slope={slope:.3f}, monotonic={monotonic_ratio:.0%})",
                )
        return None

    def _detect_living_off_land(
        self,
        entity_id: str,
        recon_error: float,
        cache_states: torch.Tensor,
        current_state: torch.Tensor,
        attn_weights: np.ndarray,
    ) -> Optional[AttackChainDetection]:
        """Detect subtle deviation using legitimate tools."""
        pattern = ATTACK_CHAIN_PATTERNS["living_off_the_land"]
        num_caches = cache_states.size(1)

        if num_caches < 5:
            return None

        baseline_mean = cache_states[0, :3].mean(dim=0)
        divergence = 1.0 - F.cosine_similarity(
            current_state, baseline_mean.unsqueeze(0), dim=-1
        ).item()

        if recon_error < 1.5 and divergence > 0.4:
            ratio = divergence / max(recon_error, 0.01)
            if ratio > pattern["threshold_ratio"]:
                confidence = min(85.0, ratio * 25 + divergence * 50)
                if confidence >= pattern["min_confidence"]:
                    return AttackChainDetection(
                        chain_id=f"lotl_{entity_id}_{datetime.now().strftime('%H%M%S')}",
                        entity_id=entity_id,
                        attack_type="living_off_the_land",
                        confidence=confidence,
                        stages=[
                            {"phase": "blending", "recon_error": recon_error, "note": "Low reconstruction error = normal-looking commands"},
                            {"phase": "diverging", "divergence": divergence, "note": "But behavioral state drifts from baseline"},
                        ],
                        cache_evidence=[
                            {"metric": "recon_error", "value": recon_error},
                            {"metric": "state_divergence", "value": divergence},
                            {"metric": "divergence_ratio", "value": ratio},
                        ],
                        timeline_hours=0,
                        mitre_techniques=pattern["mitre"],
                        description=f"Low prediction error ({recon_error:.2f}) but high state divergence "
                                   f"({divergence:.2f}) — using legitimate tools for illegitimate purposes",
                    )
        return None

    def _detect_data_staging(
        self,
        entity_id: str,
        cache_states: torch.Tensor,
        timestamps: List[datetime],
        attn_weights: np.ndarray,
    ) -> Optional[AttackChainDetection]:
        """Detect incremental data collection followed by exfiltration burst."""
        pattern = ATTACK_CHAIN_PATTERNS["data_staging_exfiltration"]
        num_caches = cache_states.size(1)

        if num_caches < pattern["min_staging_segments"] + 2:
            return None

        norms = [torch.norm(cache_states[0, i]).item() for i in range(num_caches)]

        baseline_norms = norms[:3]
        baseline_mean = np.mean(baseline_norms)
        baseline_std = np.std(baseline_norms) + 1e-6

        recent_norms = norms[-3:]
        recent_mean = np.mean(recent_norms)

        if recent_mean > baseline_mean + 3 * baseline_std:
            growth_phase = norms[3:-3]
            if len(growth_phase) >= 3:
                growth_slope = np.polyfit(range(len(growth_phase)), growth_phase, 1)[0]
                if growth_slope > 0:
                    spike_ratio = recent_mean / baseline_mean
                    confidence = min(92.0, spike_ratio * 20 + growth_slope * 50 + 30)

                    if confidence >= pattern["min_confidence"]:
                        timeline = 0
                        if timestamps and timestamps[0] and timestamps[-1]:
                            timeline = (timestamps[-1] - timestamps[0]).total_seconds() / 3600

                        return AttackChainDetection(
                            chain_id=f"stage_{entity_id}_{datetime.now().strftime('%H%M%S')}",
                            entity_id=entity_id,
                            attack_type="data_staging_exfiltration",
                            confidence=confidence,
                            stages=[
                                {"phase": "baseline", "avg_norm": float(baseline_mean)},
                                {"phase": "staging", "growth_slope": float(growth_slope), "segments": len(growth_phase)},
                                {"phase": "exfiltration_burst", "avg_norm": float(recent_mean), "spike_ratio": float(spike_ratio)},
                            ],
                            cache_evidence=[
                                {"cache_idx": i, "state_norm": float(norms[i])}
                                for i in range(num_caches)
                            ],
                            timeline_hours=timeline,
                            mitre_techniques=pattern["mitre"],
                            description=f"Gradual accumulation ({growth_slope:.2f} slope) followed by "
                                       f"{spike_ratio:.1f}x state magnitude spike — possible data exfiltration",
                        )
        return None


# COMMAND ----------

# MAGIC %md
# MAGIC ## Cross-Entity Correlation

# COMMAND ----------

def detect_lateral_movement_chain(
    model: MemoryCachingRNN,
    entity_states: Dict[str, torch.Tensor],
    config: MCConfig,
    similarity_threshold: float = 0.85,
    time_window_hours: int = 4,
) -> List[AttackChainDetection]:
    """
    Detect coordinated attacks across multiple entities by comparing
    their MC-RNN hidden states for suspicious similarity.

    If multiple unrelated entities develop similar hidden states within
    a short time window, it may indicate lateral movement from a
    common attacker.
    """
    pattern = ATTACK_CHAIN_PATTERNS["lateral_movement_chain"]
    entities = list(entity_states.keys())
    detections = []

    if len(entities) < pattern["min_entities"]:
        return detections

    states_tensor = torch.stack([entity_states[e] for e in entities])
    similarity_matrix = F.cosine_similarity(
        states_tensor.unsqueeze(0), states_tensor.unsqueeze(1), dim=-1
    )

    clusters = []
    visited = set()

    for i in range(len(entities)):
        if i in visited:
            continue
        cluster = [i]
        for j in range(i + 1, len(entities)):
            if j in visited:
                continue
            if similarity_matrix[i, j].item() >= similarity_threshold:
                cluster.append(j)
                visited.add(j)

        if len(cluster) >= pattern["min_entities"]:
            clusters.append(cluster)
        visited.add(i)

    for cluster in clusters:
        cluster_entities = [entities[i] for i in cluster]
        avg_similarity = np.mean([
            similarity_matrix[i, j].item()
            for i in cluster for j in cluster if i != j
        ])

        confidence = min(95.0, avg_similarity * 60 + len(cluster) * 10)

        if confidence >= pattern["min_confidence"]:
            detections.append(AttackChainDetection(
                chain_id=f"lateral_{datetime.now().strftime('%H%M%S')}",
                entity_id=cluster_entities[0],
                attack_type="lateral_movement_chain",
                confidence=confidence,
                stages=[
                    {"phase": "compromise", "entity": e, "cluster_position": idx}
                    for idx, e in enumerate(cluster_entities)
                ],
                cache_evidence=[
                    {"entity_pair": f"{cluster_entities[i]}↔{cluster_entities[j]}",
                     "similarity": float(similarity_matrix[cluster[i], cluster[j]].item())}
                    for i in range(len(cluster)) for j in range(i+1, len(cluster))
                ],
                timeline_hours=time_window_hours,
                mitre_techniques=pattern["mitre"],
                description=f"{len(cluster)} entities with suspiciously similar behavioral states "
                           f"(avg similarity: {avg_similarity:.3f})",
            ))

    return detections


# COMMAND ----------

# MAGIC %md
# MAGIC ## Production Detection Job

# COMMAND ----------

def run_attack_chain_detection(
    catalog: str = "security_catalog",
    lookback_hours: int = 24,
    preset: str = "medium",
):
    """
    Scheduled job: analyze all active entities for multi-stage attack patterns.
    Writes detections to `mc_attack_chains` gold table.
    """
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model = create_mc_rnn(input_dim=128, preset=preset).to(device)
    config = model.config
    detector = AttackChainDetector(model, config)

    print(f"Attack Chain Detection: analyzing last {lookback_hours}h")
    print(f"  Patterns: {list(ATTACK_CHAIN_PATTERNS.keys())}")

    # This job previously fabricated 50 synthetic entities with random cache
    # states and current segments, then wrote the resulting "detections" to the
    # gold table as if they were real attack chains. Real detection requires
    # per-entity MC-RNN cache history loaded from the state store, which is not
    # wired here yet. We fail closed rather than emit fabricated detections.
    raise NotImplementedError(
        "Attack-chain detection requires real per-entity cache history from the "
        f"MC state store; refusing to write fabricated detections to "
        f"{catalog}.gold.mc_attack_chains. Wire real cache-state loading before "
        "enabling this scheduled job."
    )


# COMMAND ----------

if "dbutils" in dir():
    detections = run_attack_chain_detection(
        catalog="security_catalog",
        lookback_hours=24,
        preset="medium",
    )
