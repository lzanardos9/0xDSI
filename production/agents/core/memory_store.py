"""
Production Memory Store
Vector + session memory for agents using Databricks Vector Search
or Supabase pgvector as backends.

Supports:
- Semantic search over past decisions, investigations, and context
- Session-scoped short-term memory
- Long-term knowledge accumulation
- Memory decay and relevance scoring
"""

import time
import json
import logging
import hashlib
from dataclasses import dataclass, field
from typing import Any, Optional
from abc import ABC, abstractmethod

logger = logging.getLogger(__name__)


@dataclass
class MemoryEntry:
    """A single memory entry stored in the vector database."""
    id: str
    agent_id: str
    session_id: str
    content: dict
    summary: str
    embedding: Optional[list[float]] = None
    metadata: dict = field(default_factory=dict)
    timestamp: float = field(default_factory=time.time)
    relevance_score: float = 0.0
    access_count: int = 0
    last_accessed: float = field(default_factory=time.time)


class EmbeddingProvider(ABC):
    """Abstract embedding provider."""

    @abstractmethod
    async def embed(self, text: str) -> list[float]:
        pass

    @abstractmethod
    async def embed_batch(self, texts: list[str]) -> list[list[float]]:
        pass


class DatabricksEmbeddingProvider(EmbeddingProvider):
    """Embeddings via Databricks Foundation Model API (BGE, GTE, etc.)."""

    def __init__(self, endpoint_name: str, workspace_url: str, token: str):
        self.endpoint_name = endpoint_name
        self.workspace_url = workspace_url.rstrip("/")
        self.token = token

    async def embed(self, text: str) -> list[float]:
        results = await self.embed_batch([text])
        return results[0]

    async def embed_batch(self, texts: list[str]) -> list[list[float]]:
        import aiohttp

        url = f"{self.workspace_url}/serving-endpoints/{self.endpoint_name}/invocations"
        headers = {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json",
        }
        payload = {"input": texts}

        async with aiohttp.ClientSession() as session:
            async with session.post(url, json=payload, headers=headers) as resp:
                if resp.status != 200:
                    raise RuntimeError(f"Embedding API returned {resp.status}: {await resp.text()}")
                data = await resp.json()
                return [item["embedding"] for item in data["data"]]


class SupabaseEmbeddingProvider(EmbeddingProvider):
    """Embeddings via Supabase Edge Function wrapping an embedding model."""

    def __init__(self, supabase_url: str, anon_key: str, function_name: str = "generate-embeddings"):
        self.supabase_url = supabase_url.rstrip("/")
        self.anon_key = anon_key
        self.function_name = function_name

    async def embed(self, text: str) -> list[float]:
        results = await self.embed_batch([text])
        return results[0]

    async def embed_batch(self, texts: list[str]) -> list[list[float]]:
        import aiohttp

        url = f"{self.supabase_url}/functions/v1/{self.function_name}"
        headers = {
            "Authorization": f"Bearer {self.anon_key}",
            "Content-Type": "application/json",
        }

        async with aiohttp.ClientSession() as session:
            async with session.post(url, json={"texts": texts}, headers=headers) as resp:
                if resp.status != 200:
                    raise RuntimeError(f"Embedding function returned {resp.status}")
                data = await resp.json()
                return data["embeddings"]


class MemoryStore:
    """
    Production memory store with vector search capabilities.

    Architecture:
    - Short-term memory: In-process dict, scoped to session
    - Long-term memory: Persisted to vector DB (Databricks Vector Search or pgvector)
    - Retrieval: Semantic similarity + recency boost + access frequency decay
    """

    def __init__(
        self,
        embedding_provider: EmbeddingProvider,
        vector_backend: Any,
        config: dict = None,
    ):
        self.embedding_provider = embedding_provider
        self.vector_backend = vector_backend
        self.config = config or {}
        self._session_memory: dict[str, list[MemoryEntry]] = {}

        self.max_session_entries = self.config.get("max_session_entries", 100)
        self.recency_weight = self.config.get("recency_weight", 0.3)
        self.similarity_weight = self.config.get("similarity_weight", 0.7)
        self.decay_half_life_hours = self.config.get("decay_half_life_hours", 168)

    async def store(
        self,
        agent_id: str,
        session_id: str,
        content: dict,
        metadata: dict = None,
        persist: bool = True,
    ) -> str:
        """
        Store a memory entry.

        Args:
            agent_id: The agent storing this memory
            session_id: Current session ID
            content: Structured content to store
            metadata: Additional metadata
            persist: Whether to persist to long-term vector store

        Returns:
            Memory entry ID
        """
        summary = self._build_summary(content)
        entry_id = hashlib.sha256(
            f"{agent_id}:{session_id}:{summary}:{time.time()}".encode()
        ).hexdigest()[:16]

        entry = MemoryEntry(
            id=entry_id,
            agent_id=agent_id,
            session_id=session_id,
            content=content,
            summary=summary,
            metadata=metadata or {},
            timestamp=time.time(),
        )

        # Store in session memory
        if session_id not in self._session_memory:
            self._session_memory[session_id] = []
        self._session_memory[session_id].append(entry)

        # Trim session memory if needed
        if len(self._session_memory[session_id]) > self.max_session_entries:
            self._session_memory[session_id] = self._session_memory[session_id][-self.max_session_entries:]

        # Persist to vector store
        if persist:
            try:
                embedding = await self.embedding_provider.embed(summary)
                entry.embedding = embedding
                await self.vector_backend.upsert(
                    id=entry_id,
                    embedding=embedding,
                    metadata={
                        "agent_id": agent_id,
                        "session_id": session_id,
                        "summary": summary,
                        "content": json.dumps(content, default=str),
                        "timestamp": entry.timestamp,
                        **(metadata or {}),
                    },
                )
            except Exception as e:
                logger.warning(f"Failed to persist memory to vector store: {e}")

        return entry_id

    async def search(
        self,
        query: str,
        agent_id: str = None,
        session_id: str = None,
        limit: int = 10,
        min_relevance: float = 0.5,
        time_window_hours: float = None,
    ) -> list[dict]:
        """
        Search for relevant memories using semantic similarity + recency.

        Args:
            query: Search query text
            agent_id: Filter to specific agent's memories
            session_id: If provided, also search session memory
            limit: Maximum results to return
            min_relevance: Minimum combined relevance score
            time_window_hours: Only return memories within this time window

        Returns:
            List of memory dicts sorted by relevance
        """
        results = []

        # Search session memory first (fast, in-process)
        if session_id and session_id in self._session_memory:
            session_results = self._search_session(
                query, session_id, limit=limit // 2
            )
            results.extend(session_results)

        # Search vector store (semantic)
        try:
            query_embedding = await self.embedding_provider.embed(query)

            filters = {}
            if agent_id:
                filters["agent_id"] = agent_id
            if time_window_hours:
                filters["timestamp_gte"] = time.time() - (time_window_hours * 3600)

            vector_results = await self.vector_backend.search(
                embedding=query_embedding,
                filters=filters,
                limit=limit,
            )

            for vr in vector_results:
                score = self._compute_relevance(
                    similarity=vr.get("score", 0),
                    timestamp=vr.get("metadata", {}).get("timestamp", 0),
                )
                if score >= min_relevance:
                    results.append({
                        "id": vr.get("id"),
                        "summary": vr.get("metadata", {}).get("summary", ""),
                        "content": json.loads(vr.get("metadata", {}).get("content", "{}")),
                        "relevance": score,
                        "timestamp": vr.get("metadata", {}).get("timestamp"),
                        "agent_id": vr.get("metadata", {}).get("agent_id"),
                    })

        except Exception as e:
            logger.warning(f"Vector search failed: {e}")

        # Deduplicate and sort
        seen = set()
        unique_results = []
        for r in sorted(results, key=lambda x: x.get("relevance", 0), reverse=True):
            key = r.get("id") or r.get("summary", "")[:50]
            if key not in seen:
                seen.add(key)
                unique_results.append(r)

        return unique_results[:limit]

    def _search_session(self, query: str, session_id: str, limit: int = 5) -> list[dict]:
        """Simple keyword-based search over session memory."""
        entries = self._session_memory.get(session_id, [])
        query_terms = set(query.lower().split())

        scored = []
        for entry in entries:
            summary_terms = set(entry.summary.lower().split())
            overlap = len(query_terms & summary_terms)
            if overlap > 0:
                score = overlap / max(len(query_terms), 1)
                scored.append({
                    "id": entry.id,
                    "summary": entry.summary,
                    "content": entry.content,
                    "relevance": min(score, 1.0),
                    "timestamp": entry.timestamp,
                    "agent_id": entry.agent_id,
                })

        return sorted(scored, key=lambda x: x["relevance"], reverse=True)[:limit]

    def _compute_relevance(self, similarity: float, timestamp: float) -> float:
        """
        Combine semantic similarity with time decay.
        More recent memories get a boost; very old memories decay.
        """
        age_hours = (time.time() - timestamp) / 3600
        decay = 0.5 ** (age_hours / self.decay_half_life_hours)

        return (
            self.similarity_weight * similarity
            + self.recency_weight * decay
        )

    def _build_summary(self, content: dict) -> str:
        """Build a searchable text summary from structured content."""
        if isinstance(content, str):
            return content[:500]

        parts = []
        for key, value in content.items():
            if isinstance(value, str):
                parts.append(f"{key}: {value}")
            elif isinstance(value, (int, float, bool)):
                parts.append(f"{key}={value}")
            elif isinstance(value, list) and len(value) <= 5:
                parts.append(f"{key}: {', '.join(str(v) for v in value)}")

        return " | ".join(parts)[:500]

    def clear_session(self, session_id: str):
        """Clear session memory for a completed session."""
        if session_id in self._session_memory:
            del self._session_memory[session_id]

    def get_session_context(self, session_id: str) -> list[dict]:
        """Get all entries in current session memory (for handoff)."""
        entries = self._session_memory.get(session_id, [])
        return [
            {"summary": e.summary, "content": e.content, "timestamp": e.timestamp}
            for e in entries
        ]
