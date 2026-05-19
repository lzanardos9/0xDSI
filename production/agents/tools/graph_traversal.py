"""
Production Tool: Entity Graph Traversal
Walks relationships between entities (users, devices, IPs, services, data)
to discover attack paths, lateral movement, and scope of compromise.

Uses Databricks GraphFrames or a property graph stored in Delta tables.
"""

import logging
from typing import Any, Optional
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)


@dataclass
class GraphNode:
    """A node in the security entity graph."""
    id: str
    entity_type: str  # user, device, ip, service, data, network_zone
    properties: dict = field(default_factory=dict)
    risk_score: float = 0.0


@dataclass
class GraphEdge:
    """An edge (relationship) in the security entity graph."""
    source_id: str
    target_id: str
    relationship: str  # authenticated_to, accessed, transferred_data, resolved_to, belongs_to
    properties: dict = field(default_factory=dict)
    timestamp: Optional[str] = None
    weight: float = 1.0


@dataclass
class TraversalResult:
    """Result of a graph traversal operation."""
    paths: list[list[dict]]  # Each path is a list of nodes with edges
    total_nodes_visited: int
    max_depth_reached: int
    risk_indicators: list[str]
    lateral_movement_detected: bool
    privilege_escalation_detected: bool


class GraphTraversalTool:
    """
    Entity relationship graph traversal for security investigation.

    The graph represents:
    - Users → Devices (logged_into)
    - Users → Services (authenticated_to)
    - Devices → IPs (has_ip)
    - IPs → IPs (connected_to)
    - Users → Data (accessed)
    - Services → Data (processes)
    - Users → Groups (member_of)
    - Devices → Network Zones (belongs_to)

    Use cases:
    - Trace lateral movement from initial access to final target
    - Identify blast radius of a compromised credential
    - Find shortest path between two entities
    - Detect unusual access patterns (user accessing service they never used)
    """

    def __init__(self, graph_client: Any, config: dict = None):
        self.graph_client = graph_client
        self.config = config or {}
        self.max_depth = self.config.get("max_depth", 5)
        self.max_nodes = self.config.get("max_nodes", 500)

    async def traverse_from_entity(
        self,
        entity_id: str,
        entity_type: str,
        direction: str = "outbound",
        max_depth: int = None,
        relationship_filter: list[str] = None,
        time_window: dict = None,
    ) -> TraversalResult:
        """
        Traverse the graph starting from a specific entity.

        Args:
            entity_id: Starting entity identifier
            entity_type: Type of the starting entity
            direction: outbound, inbound, or both
            max_depth: Maximum hops from start (default: 5)
            relationship_filter: Only follow these relationship types
            time_window: {"start": "ISO", "end": "ISO"} — only include edges within window

        Returns:
            TraversalResult with paths, risk indicators, and detection flags
        """
        effective_depth = min(max_depth or self.max_depth, self.max_depth)

        query = self._build_traversal_query(
            entity_id, entity_type, direction, effective_depth,
            relationship_filter, time_window
        )

        try:
            raw_results = await self.graph_client.execute(query)
            return self._process_results(raw_results, entity_id)
        except Exception as e:
            logger.error(f"Graph traversal failed: {e}")
            raise

    async def find_path(
        self,
        source_id: str,
        target_id: str,
        max_hops: int = 6,
        relationship_filter: list[str] = None,
    ) -> list[dict]:
        """
        Find the shortest path between two entities.
        Useful for understanding how an attacker reached a target.
        """
        query = f"""
            SELECT path
            FROM GRAPH_PATH(
                main.security.entity_graph,
                source = '{self._sanitize(source_id)}',
                target = '{self._sanitize(target_id)}',
                max_length = {min(max_hops, 10)}
                {', relationship_types = ' + str(relationship_filter) if relationship_filter else ''}
            )
            ORDER BY path_length ASC
            LIMIT 5
        """

        try:
            results = await self.graph_client.execute(query)
            return self._format_paths(results)
        except Exception as e:
            logger.error(f"Path finding failed: {e}")
            return []

    async def get_neighbors(
        self,
        entity_id: str,
        relationship_types: list[str] = None,
        direction: str = "both",
    ) -> list[dict]:
        """Get immediate neighbors of an entity."""
        direction_clause = {
            "outbound": "WHERE e.source_id = :entity_id",
            "inbound": "WHERE e.target_id = :entity_id",
            "both": "WHERE e.source_id = :entity_id OR e.target_id = :entity_id",
        }.get(direction, "WHERE e.source_id = :entity_id OR e.target_id = :entity_id")

        rel_filter = ""
        if relationship_types:
            rel_list = ", ".join(f"'{r}'" for r in relationship_types)
            rel_filter = f"AND e.relationship IN ({rel_list})"

        query = f"""
            SELECT
                e.source_id, e.target_id, e.relationship,
                e.properties, e.timestamp, e.weight,
                n.entity_type, n.properties as node_properties, n.risk_score
            FROM main.security.entity_edges e
            JOIN main.security.entity_nodes n
                ON n.id = CASE
                    WHEN e.source_id = :entity_id THEN e.target_id
                    ELSE e.source_id
                END
            {direction_clause}
            {rel_filter}
            ORDER BY e.timestamp DESC
            LIMIT 100
        """

        try:
            results = await self.graph_client.execute(
                query, parameters={"entity_id": entity_id}
            )
            return results.get("rows", [])
        except Exception as e:
            logger.error(f"Get neighbors failed: {e}")
            return []

    async def detect_lateral_movement(
        self,
        user_id: str,
        time_window: dict,
    ) -> dict:
        """
        Detect lateral movement patterns for a user within a time window.
        Looks for:
        - Auth to multiple devices in short succession
        - New device/service access (never seen before)
        - Access to high-criticality assets after low-criticality access
        """
        query = """
            WITH user_sessions AS (
                SELECT
                    e.target_id as device_id,
                    e.timestamp,
                    n.properties['criticality'] as criticality,
                    n.properties['hostname'] as hostname,
                    ROW_NUMBER() OVER (ORDER BY e.timestamp) as seq
                FROM main.security.entity_edges e
                JOIN main.security.entity_nodes n ON n.id = e.target_id
                WHERE e.source_id = :user_id
                  AND e.relationship IN ('authenticated_to', 'logged_into')
                  AND e.timestamp BETWEEN :start AND :end
                ORDER BY e.timestamp
            ),
            first_seen AS (
                SELECT target_id, MIN(timestamp) as first_auth
                FROM main.security.entity_edges
                WHERE source_id = :user_id
                  AND relationship IN ('authenticated_to', 'logged_into')
                GROUP BY target_id
            )
            SELECT
                us.*,
                CASE WHEN fs.first_auth >= :start THEN true ELSE false END as is_new_device,
                LAG(us.criticality) OVER (ORDER BY us.timestamp) as prev_criticality
            FROM user_sessions us
            LEFT JOIN first_seen fs ON fs.target_id = us.device_id
            ORDER BY us.timestamp
        """

        try:
            results = await self.graph_client.execute(
                query,
                parameters={
                    "user_id": user_id,
                    "start": time_window["start"],
                    "end": time_window["end"],
                },
            )

            rows = results.get("rows", [])
            new_devices = [r for r in rows if r.get("is_new_device")]
            priv_escalation = [
                r for r in rows
                if r.get("prev_criticality") == "low" and r.get("criticality") in ("high", "critical")
            ]

            return {
                "total_devices_accessed": len(set(r["device_id"] for r in rows)),
                "new_devices": len(new_devices),
                "privilege_escalation_hops": len(priv_escalation),
                "lateral_movement_detected": len(new_devices) >= 3 or len(priv_escalation) >= 1,
                "timeline": rows[:50],
                "risk_score": min(1.0, (len(new_devices) * 0.2 + len(priv_escalation) * 0.4)),
            }
        except Exception as e:
            logger.error(f"Lateral movement detection failed: {e}")
            return {"lateral_movement_detected": False, "error": str(e)}

    async def blast_radius(
        self,
        compromised_entity_id: str,
        entity_type: str,
    ) -> dict:
        """
        Calculate the blast radius of a compromised entity.
        What can the attacker reach from this entity?
        """
        result = await self.traverse_from_entity(
            entity_id=compromised_entity_id,
            entity_type=entity_type,
            direction="outbound",
            max_depth=4,
        )

        # Categorize reachable entities
        categories = {}
        for path in result.paths:
            for node in path:
                etype = node.get("entity_type", "unknown")
                if etype not in categories:
                    categories[etype] = []
                if node["id"] not in [n["id"] for n in categories[etype]]:
                    categories[etype].append(node)

        critical_assets = [
            n for nodes in categories.values() for n in nodes
            if n.get("properties", {}).get("criticality") == "critical"
        ]

        return {
            "total_reachable_entities": result.total_nodes_visited,
            "by_type": {k: len(v) for k, v in categories.items()},
            "critical_assets_at_risk": len(critical_assets),
            "critical_asset_details": critical_assets[:10],
            "max_depth": result.max_depth_reached,
            "lateral_movement_paths": result.lateral_movement_detected,
        }

    def _build_traversal_query(
        self, entity_id, entity_type, direction, max_depth,
        relationship_filter, time_window
    ) -> str:
        """Build the graph traversal query."""
        filters = []
        if relationship_filter:
            rel_list = ", ".join(f"'{r}'" for r in relationship_filter)
            filters.append(f"e.relationship IN ({rel_list})")
        if time_window:
            if "start" in time_window:
                filters.append(f"e.timestamp >= '{time_window['start']}'")
            if "end" in time_window:
                filters.append(f"e.timestamp <= '{time_window['end']}'")

        where_clause = f"AND {' AND '.join(filters)}" if filters else ""

        return f"""
            WITH RECURSIVE traversal AS (
                SELECT
                    n.id, n.entity_type, n.properties, n.risk_score,
                    1 as depth,
                    ARRAY[n.id] as path
                FROM main.security.entity_nodes n
                WHERE n.id = '{self._sanitize(entity_id)}'

                UNION ALL

                SELECT
                    n2.id, n2.entity_type, n2.properties, n2.risk_score,
                    t.depth + 1,
                    t.path || n2.id
                FROM traversal t
                JOIN main.security.entity_edges e
                    ON e.source_id = t.id
                    {where_clause}
                JOIN main.security.entity_nodes n2
                    ON n2.id = e.target_id
                WHERE t.depth < {max_depth}
                  AND NOT n2.id = ANY(t.path)
            )
            SELECT * FROM traversal
            LIMIT {self.max_nodes}
        """

    def _process_results(self, raw_results: Any, start_id: str) -> TraversalResult:
        """Process raw query results into TraversalResult."""
        rows = raw_results.get("rows", []) if isinstance(raw_results, dict) else []

        paths = []
        risk_indicators = []
        max_depth = 0
        lateral_movement = False
        priv_escalation = False

        for row in rows:
            depth = row.get("depth", 0)
            max_depth = max(max_depth, depth)

            node = {
                "id": row.get("id"),
                "entity_type": row.get("entity_type"),
                "properties": row.get("properties", {}),
                "risk_score": row.get("risk_score", 0),
                "depth": depth,
            }

            if row.get("risk_score", 0) > 0.7:
                risk_indicators.append(f"High-risk entity at depth {depth}: {row.get('id')}")

            if row.get("entity_type") == "device" and depth > 1:
                lateral_movement = True

            paths.append([node])

        return TraversalResult(
            paths=paths,
            total_nodes_visited=len(rows),
            max_depth_reached=max_depth,
            risk_indicators=risk_indicators,
            lateral_movement_detected=lateral_movement,
            privilege_escalation_detected=priv_escalation,
        )

    def _format_paths(self, results: Any) -> list[dict]:
        """Format path query results."""
        rows = results.get("rows", []) if isinstance(results, dict) else []
        return [{"path": row.get("path", []), "length": len(row.get("path", []))} for row in rows]

    def _sanitize(self, value: str) -> str:
        """Basic sanitization for graph query parameters."""
        return value.replace("'", "").replace(";", "").replace("--", "")[:200]


TOOL_DEFINITION = {
    "name": "graph_traversal",
    "description": "Walk the entity relationship graph to trace attack paths, detect lateral movement, find blast radius of compromised entities, or discover shortest paths between entities.",
    "parameters": {
        "type": "object",
        "properties": {
            "operation": {
                "type": "string",
                "enum": ["traverse", "find_path", "neighbors", "lateral_movement", "blast_radius"],
                "description": "Type of graph operation to perform",
            },
            "entity_id": {
                "type": "string",
                "description": "Starting entity ID (user, device, IP, service)",
            },
            "entity_type": {
                "type": "string",
                "enum": ["user", "device", "ip", "service", "data", "network_zone"],
            },
            "target_id": {
                "type": "string",
                "description": "Target entity ID (for find_path operation)",
            },
            "direction": {
                "type": "string",
                "enum": ["outbound", "inbound", "both"],
                "default": "outbound",
            },
            "max_depth": {
                "type": "integer",
                "default": 4,
                "maximum": 6,
            },
            "relationship_filter": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Only follow these relationship types",
            },
            "time_window": {
                "type": "object",
                "properties": {
                    "start": {"type": "string", "description": "ISO timestamp"},
                    "end": {"type": "string", "description": "ISO timestamp"},
                },
            },
        },
        "required": ["operation", "entity_id"],
    },
}
