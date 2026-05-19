"""
Production Tool: Vector Similarity Search
Searches embeddings index for semantically similar events, alerts, and investigations.
Uses Databricks Vector Search or Supabase pgvector.
"""

import logging
import time
from typing import Any, Optional
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass
class VectorSearchConfig:
    """Configuration for vector search operations."""
    index_name: str = "security_events_index"
    endpoint_name: str = "security-vector-search"
    embedding_dimension: int = 768
    default_top_k: int = 20
    min_similarity: float = 0.7
    timeout_seconds: int = 30


class VectorSearchTool:
    """
    Semantic similarity search over security event embeddings.

    Use cases:
    - Find events similar to a known attack pattern
    - Search past investigations by natural language description
    - Detect anomalies by finding events dissimilar to baseline
    - Cluster related events for campaign detection
    """

    def __init__(
        self,
        vector_client: Any,
        embedding_provider: Any,
        config: VectorSearchConfig = None,
    ):
        self.vector_client = vector_client
        self.embedding_provider = embedding_provider
        self.config = config or VectorSearchConfig()

    async def search_by_text(
        self,
        query: str,
        index_name: str = None,
        top_k: int = None,
        min_similarity: float = None,
        filters: dict = None,
    ) -> list[dict]:
        """
        Search for similar entries using natural language query.

        Args:
            query: Natural language description of what to find
            index_name: Override default index
            top_k: Number of results to return
            min_similarity: Minimum cosine similarity threshold
            filters: Metadata filters (e.g., {"severity": "critical", "time_after": "2024-01-01"})

        Returns:
            List of matching entries with similarity scores
        """
        embedding = await self.embedding_provider.embed(query)
        return await self.search_by_vector(
            embedding, index_name, top_k, min_similarity, filters
        )

    async def search_by_vector(
        self,
        embedding: list[float],
        index_name: str = None,
        top_k: int = None,
        min_similarity: float = None,
        filters: dict = None,
    ) -> list[dict]:
        """
        Search using a pre-computed embedding vector.
        """
        effective_index = index_name or self.config.index_name
        effective_k = min(top_k or self.config.default_top_k, 100)
        effective_sim = min_similarity or self.config.min_similarity

        start = time.time()

        try:
            results = await self.vector_client.search(
                index_name=effective_index,
                query_vector=embedding,
                top_k=effective_k,
                filters=self._build_filters(filters),
            )

            elapsed_ms = (time.time() - start) * 1000

            # Filter by similarity and format
            filtered = []
            for r in results:
                score = r.get("score", 0)
                if score >= effective_sim:
                    filtered.append({
                        "id": r.get("id"),
                        "similarity": round(score, 4),
                        "metadata": r.get("metadata", {}),
                        "content": r.get("content", r.get("text", "")),
                    })

            logger.debug(
                f"Vector search returned {len(filtered)}/{len(results)} results "
                f"above threshold {effective_sim} in {elapsed_ms:.0f}ms"
            )

            return filtered

        except Exception as e:
            logger.error(f"Vector search failed: {e}")
            raise

    async def search_similar_to_event(
        self,
        event_id: str,
        top_k: int = 10,
        exclude_self: bool = True,
    ) -> list[dict]:
        """
        Find events similar to a specific event by its ID.
        Useful for finding related events in a campaign.
        """
        # Get the event's embedding
        event_embedding = await self.vector_client.get_embedding(
            index_name=self.config.index_name,
            id=event_id,
        )

        if not event_embedding:
            raise ValueError(f"No embedding found for event {event_id}")

        results = await self.search_by_vector(
            embedding=event_embedding,
            top_k=top_k + (1 if exclude_self else 0),
        )

        if exclude_self:
            results = [r for r in results if r["id"] != event_id]

        return results[:top_k]

    async def find_anomalies(
        self,
        baseline_query: str,
        candidate_events: list[dict],
        anomaly_threshold: float = 0.3,
    ) -> list[dict]:
        """
        Find events that are dissimilar to a baseline (anomaly detection).
        Events with LOW similarity to the baseline are anomalies.

        Args:
            baseline_query: Description of normal/expected behavior
            candidate_events: Events to check against baseline
            anomaly_threshold: Events with similarity BELOW this are anomalous

        Returns:
            List of anomalous events with distance scores
        """
        baseline_embedding = await self.embedding_provider.embed(baseline_query)

        anomalies = []
        for event in candidate_events:
            event_text = event.get("description", "") or event.get("raw_log", "")
            if not event_text:
                continue

            event_embedding = await self.embedding_provider.embed(event_text)
            similarity = self._cosine_similarity(baseline_embedding, event_embedding)

            if similarity < anomaly_threshold:
                anomalies.append({
                    **event,
                    "anomaly_score": round(1.0 - similarity, 4),
                    "baseline_similarity": round(similarity, 4),
                })

        return sorted(anomalies, key=lambda x: x["anomaly_score"], reverse=True)

    async def cluster_events(
        self,
        event_ids: list[str],
        similarity_threshold: float = 0.8,
    ) -> list[list[str]]:
        """
        Cluster events by embedding similarity.
        Returns groups of related event IDs.
        """
        # Get all embeddings
        embeddings = {}
        for eid in event_ids:
            emb = await self.vector_client.get_embedding(
                index_name=self.config.index_name, id=eid
            )
            if emb:
                embeddings[eid] = emb

        # Simple agglomerative clustering
        clusters = []
        assigned = set()

        for eid, emb in embeddings.items():
            if eid in assigned:
                continue

            cluster = [eid]
            assigned.add(eid)

            for other_id, other_emb in embeddings.items():
                if other_id in assigned:
                    continue
                sim = self._cosine_similarity(emb, other_emb)
                if sim >= similarity_threshold:
                    cluster.append(other_id)
                    assigned.add(other_id)

            clusters.append(cluster)

        return sorted(clusters, key=len, reverse=True)

    def _build_filters(self, filters: Optional[dict]) -> Optional[dict]:
        """Convert user-friendly filters to backend format."""
        if not filters:
            return None

        backend_filters = {}
        for key, value in filters.items():
            if key.endswith("_after"):
                backend_filters[key.replace("_after", "")] = {"$gte": value}
            elif key.endswith("_before"):
                backend_filters[key.replace("_before", "")] = {"$lte": value}
            else:
                backend_filters[key] = {"$eq": value}

        return backend_filters

    def _cosine_similarity(self, a: list[float], b: list[float]) -> float:
        """Compute cosine similarity between two vectors."""
        dot = sum(x * y for x, y in zip(a, b))
        norm_a = sum(x * x for x in a) ** 0.5
        norm_b = sum(x * x for x in b) ** 0.5
        if norm_a == 0 or norm_b == 0:
            return 0.0
        return dot / (norm_a * norm_b)


TOOL_DEFINITION = {
    "name": "search_vector_index",
    "description": "Semantic similarity search over security events and past investigations. Find events similar to a description, a known attack pattern, or another event.",
    "parameters": {
        "type": "object",
        "properties": {
            "query": {
                "type": "string",
                "description": "Natural language description of what to search for (e.g., 'lateral movement using PsExec', 'data exfiltration to cloud storage')",
            },
            "event_id": {
                "type": "string",
                "description": "Search for events similar to this specific event ID",
            },
            "top_k": {
                "type": "integer",
                "description": "Number of results to return",
                "default": 10,
                "maximum": 50,
            },
            "min_similarity": {
                "type": "number",
                "description": "Minimum similarity threshold (0.0-1.0)",
                "default": 0.7,
            },
            "filters": {
                "type": "object",
                "description": "Metadata filters (severity, time_after, time_before, event_type)",
            },
        },
        "oneOf": [
            {"required": ["query"]},
            {"required": ["event_id"]},
        ],
    },
}
