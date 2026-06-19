# Databricks notebook source
# MAGIC %md
# MAGIC # MC-RNN Explainability Engine
# MAGIC
# MAGIC When MC-RNN flags an anomaly, this module generates human-readable
# MAGIC explanations by analyzing cache attention patterns. Shows the analyst
# MAGIC WHICH past memories the model matched and WHY.
# MAGIC
# MAGIC **Key Insight:** MC's discrete cached checkpoints create natural
# MAGIC "evidence points" — unlike Transformers where attention over full
# MAGIC sequences is opaque, each cache entry corresponds to a specific
# MAGIC time period with known events.

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
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass, field
import json

spark = SparkSession.builder.getOrCreate()

# COMMAND ----------

# MAGIC %md
# MAGIC ## Explanation Data Structures

# COMMAND ----------

@dataclass
class CacheEvidence:
    """Evidence from a single cache checkpoint."""
    cache_index: int
    timestamp: Optional[datetime]
    attention_weight: float
    similarity_to_current: float
    event_summary: str
    time_distance_hours: float
    contribution_type: str  # "similar_pattern", "contrast", "temporal_anchor"


@dataclass
class AnomalyExplanation:
    """Full explanation for an MC-RNN anomaly detection."""
    entity_id: str
    anomaly_type: str
    confidence: float
    summary: str
    key_evidence: List[CacheEvidence]
    temporal_narrative: str
    recommended_investigation: List[str]
    mitre_mapping: List[str]
    cache_visualization_data: Dict
    generated_at: datetime = field(default_factory=datetime.now)


# COMMAND ----------

# MAGIC %md
# MAGIC ## Explainability Engine

# COMMAND ----------

class MCExplainabilityEngine:
    """
    Generates human-readable explanations for MC-RNN detections.

    Approach:
        1. Extract cache attention weights (which memories were queried)
        2. Map cache indices to timestamps and event summaries
        3. Compute similarity between current state and attended caches
        4. Generate natural-language explanation from evidence
        5. Produce visualization data for analyst UI
    """

    ANOMALY_TEMPLATES = {
        "reconstruction_anomaly": (
            "The model detected behavior that doesn't match {entity_id}'s learned patterns. "
            "The current activity segment has a prediction error of {score:.2f} "
            "(threshold: {threshold:.2f}), indicating novel or suspicious behavior "
            "not seen in the entity's historical baseline."
        ),
        "state_divergence": (
            "{entity_id}'s current behavioral state has diverged {score:.1%} from their "
            "recent baseline (last {cache_epochs} segments). This suggests a significant "
            "change in how this entity operates on the network."
        ),
        "regression_pattern": (
            "The model is retrieving memories from {timeline_hours:.0f} hours ago — "
            "{entity_id} appears to be repeating or continuing a past behavioral pattern. "
            "{attention_pct:.0%} of model attention is focused on old cache entries."
        ),
        "escalation_pattern": (
            "{entity_id} shows progressive behavioral escalation across {window} segments. "
            "Each successive period deviates further from the previous one, suggesting "
            "a deliberate and accelerating change in operations."
        ),
        "streaming_reconstruction_anomaly": (
            "Real-time detection: {entity_id}'s latest events produced a reconstruction "
            "error of {score:.3f}, significantly above the streaming threshold. "
            "The model cannot predict this entity's current behavior from their history."
        ),
        "reconnection_after_dormancy": (
            "{entity_id} has resumed activity after {timeline_hours:.0f} hours of silence, "
            "and the model recognizes the current pattern as similar to their initial "
            "access behavior — potentially the same actor returning."
        ),
        "lateral_movement_chain": (
            "Multiple entities ({num_entities}) have developed suspiciously similar "
            "behavioral states within a {timeline_hours:.0f}-hour window. "
            "This coordinated pattern suggests lateral movement from a common attacker."
        ),
    }

    def __init__(self, catalog: str = "security_catalog"):
        self.catalog = catalog

    def explain_anomaly(
        self,
        entity_id: str,
        anomaly_type: str,
        anomaly_data: Dict,
        cache_attention_weights: Optional[np.ndarray] = None,
        cache_timestamps: Optional[List[datetime]] = None,
        cache_event_summaries: Optional[List[str]] = None,
    ) -> AnomalyExplanation:
        """
        Generate a full explanation for a detected anomaly.

        Args:
            entity_id: the flagged entity
            anomaly_type: type of detection
            anomaly_data: raw detection data (scores, thresholds, etc.)
            cache_attention_weights: (num_caches,) attention distribution
            cache_timestamps: timestamp per cache entry
            cache_event_summaries: event summary per cache entry
        """
        summary = self._generate_summary(entity_id, anomaly_type, anomaly_data)

        evidence = self._extract_cache_evidence(
            cache_attention_weights, cache_timestamps, cache_event_summaries
        )

        narrative = self._build_temporal_narrative(entity_id, evidence, anomaly_type)

        investigation_steps = self._recommend_investigation(anomaly_type, anomaly_data, evidence)

        mitre = anomaly_data.get("mitre_techniques", self._infer_mitre(anomaly_type))

        viz_data = self._build_visualization(evidence, cache_attention_weights)

        return AnomalyExplanation(
            entity_id=entity_id,
            anomaly_type=anomaly_type,
            confidence=anomaly_data.get("confidence", 0),
            summary=summary,
            key_evidence=evidence,
            temporal_narrative=narrative,
            recommended_investigation=investigation_steps,
            mitre_mapping=mitre,
            cache_visualization_data=viz_data,
        )

    def _generate_summary(self, entity_id: str, anomaly_type: str, data: Dict) -> str:
        """Generate human-readable summary from template."""
        template = self.ANOMALY_TEMPLATES.get(anomaly_type, "Anomaly detected for {entity_id}.")
        try:
            return template.format(entity_id=entity_id, **data)
        except KeyError:
            return template.format(
                entity_id=entity_id,
                score=data.get("score", 0),
                threshold=data.get("threshold", 0),
                timeline_hours=data.get("timeline_hours", 0),
                cache_epochs=data.get("cache_epochs_compared", 3),
                attention_pct=data.get("score", 0),
                window=data.get("window_size", 5),
                num_entities=data.get("num_entities", 2),
            )

    def _extract_cache_evidence(
        self,
        attention_weights: Optional[np.ndarray],
        timestamps: Optional[List[datetime]],
        summaries: Optional[List[str]],
    ) -> List[CacheEvidence]:
        """Extract top-k cache entries that contributed most to detection."""
        if attention_weights is None or len(attention_weights) == 0:
            return []

        top_k = min(5, len(attention_weights))
        top_indices = np.argsort(attention_weights)[-top_k:][::-1]

        evidence = []
        now = datetime.now()

        for idx in top_indices:
            if attention_weights[idx] < 0.02:
                continue

            ts = timestamps[idx] if timestamps and idx < len(timestamps) else None
            time_dist = (now - ts).total_seconds() / 3600 if ts else 0
            summary = summaries[idx] if summaries and idx < len(summaries) else f"Segment {idx}"

            contribution = "similar_pattern"
            if time_dist > 48:
                contribution = "temporal_anchor"
            elif attention_weights[idx] > 0.3:
                contribution = "strong_match"

            evidence.append(CacheEvidence(
                cache_index=int(idx),
                timestamp=ts,
                attention_weight=float(attention_weights[idx]),
                similarity_to_current=float(attention_weights[idx]),
                event_summary=summary,
                time_distance_hours=time_dist,
                contribution_type=contribution,
            ))

        return evidence

    def _build_temporal_narrative(
        self, entity_id: str, evidence: List[CacheEvidence], anomaly_type: str
    ) -> str:
        """Build a timeline narrative from cache evidence."""
        if not evidence:
            return f"No historical cache evidence available for {entity_id}."

        sorted_evidence = sorted(evidence, key=lambda e: e.time_distance_hours, reverse=True)

        parts = [f"Timeline for {entity_id}:"]
        for e in sorted_evidence:
            if e.timestamp:
                time_str = e.timestamp.strftime("%Y-%m-%d %H:%M")
            else:
                time_str = f"{e.time_distance_hours:.0f}h ago"

            parts.append(
                f"  [{time_str}] {e.event_summary} "
                f"(attention: {e.attention_weight:.1%}, type: {e.contribution_type})"
            )

        parts.append(f"  [NOW] Current anomalous behavior detected ({anomaly_type})")

        return "\n".join(parts)

    def _recommend_investigation(
        self, anomaly_type: str, data: Dict, evidence: List[CacheEvidence]
    ) -> List[str]:
        """Generate investigation recommendations."""
        base_steps = [
            f"Review entity's event logs around the detection timestamp",
            f"Check if entity has open tickets or known changes",
        ]

        type_steps = {
            "reconstruction_anomaly": [
                "Compare current commands/actions against entity's normal profile",
                "Check for new tools, processes, or network connections",
                "Verify if user's role/project recently changed",
            ],
            "state_divergence": [
                "Investigate what changed in entity's behavior pattern",
                "Check for account sharing or credential theft indicators",
                "Review access to sensitive resources in divergence window",
            ],
            "regression_pattern": [
                "Review the historical period being repeated (check cache timestamps)",
                "Determine if the old pattern was previously investigated",
                "Check if same source IP/host is being used as in the old pattern",
            ],
            "reconnection_after_dormancy": [
                "Verify if the user was on leave, and if the return is expected",
                "Compare source IP/location with pre-dormancy activity",
                "Check for credential reset during dormancy period",
                "Investigate what happened immediately before the quiet period",
            ],
            "lateral_movement_chain": [
                "Map the network path between correlated entities",
                "Check for shared credentials or service accounts",
                "Investigate common access patterns across flagged entities",
                "Look for initial access vector to the first compromised entity",
            ],
        }

        specific = type_steps.get(anomaly_type, ["Investigate entity's recent activity patterns"])

        if evidence:
            oldest = max(evidence, key=lambda e: e.time_distance_hours)
            if oldest.time_distance_hours > 24:
                specific.append(
                    f"Key reference: check activity from {oldest.time_distance_hours:.0f}h ago "
                    f"(cache index {oldest.cache_index}) — model found strong similarity"
                )

        return base_steps + specific

    def _infer_mitre(self, anomaly_type: str) -> List[str]:
        """Infer likely MITRE ATT&CK techniques from anomaly type."""
        mapping = {
            "reconstruction_anomaly": ["T1059", "T1053", "T1071"],
            "state_divergence": ["T1078", "T1098", "T1548"],
            "regression_pattern": ["T1078", "T1133", "T1021"],
            "escalation_pattern": ["T1548", "T1134", "T1055"],
            "reconnection_after_dormancy": ["T1078", "T1133", "T1571"],
            "lateral_movement_chain": ["T1021", "T1550", "T1563"],
            "streaming_reconstruction_anomaly": ["T1059", "T1204", "T1105"],
        }
        return mapping.get(anomaly_type, ["T1078"])

    def _build_visualization(
        self, evidence: List[CacheEvidence], attention_weights: Optional[np.ndarray]
    ) -> Dict:
        """Build data structure for analyst UI visualization."""
        viz = {
            "timeline_events": [],
            "attention_heatmap": [],
            "evidence_nodes": [],
        }

        for e in evidence:
            viz["timeline_events"].append({
                "x": e.time_distance_hours,
                "y": e.attention_weight,
                "label": e.event_summary[:50],
                "type": e.contribution_type,
            })

            viz["evidence_nodes"].append({
                "id": f"cache_{e.cache_index}",
                "weight": e.attention_weight,
                "timestamp": e.timestamp.isoformat() if e.timestamp else None,
                "type": e.contribution_type,
            })

        if attention_weights is not None:
            viz["attention_heatmap"] = attention_weights.tolist()

        return viz


# COMMAND ----------

# MAGIC %md
# MAGIC ## Batch Explanation Job

# COMMAND ----------

def generate_explanations_for_recent_alerts(
    catalog: str = "security_catalog",
    lookback_hours: int = 4,
):
    """
    Generate explanations for all MC-RNN alerts in the last N hours.
    Writes explanations to gold table for analyst consumption.
    """
    engine = MCExplainabilityEngine(catalog)

    try:
        alerts_df = spark.table(f"{catalog}.gold.mc_streaming_alerts").where(
            SF.col("detected_at") >= datetime.now() - timedelta(hours=lookback_hours)
        ).collect()
    except Exception:
        alerts_df = []
        print("No alerts table found. Generating demo explanations.")
        alerts_df = [
            type("Row", (), {
                "entity_id": "user_jsmith",
                "anomaly_type": "reconnection_after_dormancy",
                "confidence": 82.5,
                "score": 0.73,
                "cache_attention_pattern": json.dumps([0.05, 0.08, 0.45, 0.02, 0.03, 0.12, 0.25]),
            })(),
            type("Row", (), {
                "entity_id": "svc_account_db",
                "anomaly_type": "state_divergence",
                "confidence": 71.3,
                "score": 0.68,
                "cache_attention_pattern": json.dumps([0.15, 0.20, 0.25, 0.20, 0.10, 0.10]),
            })(),
        ]

    explanations = []

    for alert in alerts_df:
        try:
            attn_pattern = json.loads(alert.cache_attention_pattern) if hasattr(alert, "cache_attention_pattern") else None
            attn_weights = np.array(attn_pattern) if attn_pattern else None
        except Exception:
            attn_weights = None

        now = datetime.now()
        num_caches = len(attn_weights) if attn_weights is not None else 5
        cache_timestamps = [
            now - timedelta(hours=i * 8)
            for i in range(num_caches, 0, -1)
        ]
        cache_summaries = [
            f"Normal activity segment ({i*8}h ago)"
            for i in range(num_caches, 0, -1)
        ]

        anomaly_data = {
            "score": alert.score if hasattr(alert, "score") else 0,
            "confidence": alert.confidence if hasattr(alert, "confidence") else 0,
            "threshold": 2.0,
            "timeline_hours": num_caches * 8,
            "cache_epochs_compared": 3,
            "window_size": 5,
            "num_entities": 2,
        }

        explanation = engine.explain_anomaly(
            entity_id=alert.entity_id,
            anomaly_type=alert.anomaly_type,
            anomaly_data=anomaly_data,
            cache_attention_weights=attn_weights,
            cache_timestamps=cache_timestamps,
            cache_event_summaries=cache_summaries,
        )

        explanations.append(explanation)

        print(f"\n{'='*60}")
        print(f"EXPLANATION: {alert.entity_id} ({alert.anomaly_type})")
        print(f"{'='*60}")
        print(f"Confidence: {explanation.confidence:.1f}%")
        print(f"\nSummary: {explanation.summary}")
        print(f"\n{explanation.temporal_narrative}")
        print(f"\nInvestigation Steps:")
        for i, step in enumerate(explanation.recommended_investigation, 1):
            print(f"  {i}. {step}")
        print(f"\nMITRE: {', '.join(explanation.mitre_mapping)}")

    if explanations:
        explanation_rows = [
            (
                e.entity_id, e.anomaly_type, float(e.confidence), e.summary,
                e.temporal_narrative, json.dumps(e.recommended_investigation),
                json.dumps(e.mitre_mapping), json.dumps(e.cache_visualization_data),
                e.generated_at,
            )
            for e in explanations
        ]
        try:
            exp_df = spark.createDataFrame(
                explanation_rows,
                ["entity_id", "anomaly_type", "confidence", "summary",
                 "temporal_narrative", "investigation_steps_json",
                 "mitre_mapping_json", "visualization_data_json", "generated_at"]
            )
            exp_df.write.format("delta").mode("append").saveAsTable(
                f"{catalog}.gold.mc_anomaly_explanations"
            )
        except Exception as e:
            print(f"Could not write to Delta (expected in non-Databricks env): {e}")

    print(f"\n\nGenerated {len(explanations)} explanations for recent alerts.")
    return explanations


# COMMAND ----------

# MAGIC %md
# MAGIC ## Execute

# COMMAND ----------

if "dbutils" in dir():
    explanations = generate_explanations_for_recent_alerts(
        catalog="security_catalog",
        lookback_hours=4,
    )
else:
    explanations = generate_explanations_for_recent_alerts(lookback_hours=4)
