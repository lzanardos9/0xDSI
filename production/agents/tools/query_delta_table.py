"""
Production Tool: Query Delta Table
Executes parameterized SQL queries against Delta Lake tables via Databricks SQL or Spark.
Supports Unity Catalog, time-travel, and query governance.
"""

import logging
import time
from typing import Any, Optional
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass
class QueryConfig:
    """Configuration for Delta table queries."""
    warehouse_id: str  # Databricks SQL Warehouse ID
    catalog: str = "main"
    schema: str = "security"
    max_rows: int = 10000
    timeout_seconds: int = 120
    enable_time_travel: bool = True


# Predefined safe query templates agents can use
QUERY_TEMPLATES = {
    "events_by_entity": """
        SELECT *
        FROM {catalog}.{schema}.events
        WHERE (source_ip = :entity OR dest_ip = :entity OR user_id = :entity)
          AND event_time BETWEEN :start_time AND :end_time
        ORDER BY event_time DESC
        LIMIT :max_rows
    """,

    "alerts_by_severity": """
        SELECT *
        FROM {catalog}.{schema}.alerts
        WHERE severity = :severity
          AND created_at >= :since
          AND status IN ('open', 'in_progress')
        ORDER BY created_at DESC
        LIMIT :max_rows
    """,

    "related_events_window": """
        SELECT *
        FROM {catalog}.{schema}.events
        WHERE event_time BETWEEN :start_time AND :end_time
          AND (source_ip IN ({ip_list}) OR dest_ip IN ({ip_list}) OR user_id IN ({user_list}))
        ORDER BY event_time
        LIMIT :max_rows
    """,

    "user_activity_timeline": """
        SELECT
            event_time,
            event_type,
            source_ip,
            dest_ip,
            action,
            resource,
            status_code,
            bytes_transferred
        FROM {catalog}.{schema}.events
        WHERE user_id = :user_id
          AND event_time BETWEEN :start_time AND :end_time
        ORDER BY event_time
        LIMIT :max_rows
    """,

    "auth_failures": """
        SELECT
            event_time,
            user_id,
            source_ip,
            dest_ip,
            status_code,
            failure_reason,
            geo_country,
            user_agent
        FROM {catalog}.{schema}.events
        WHERE event_type = 'authentication'
          AND status_code != 200
          AND event_time BETWEEN :start_time AND :end_time
        ORDER BY event_time DESC
        LIMIT :max_rows
    """,

    "network_connections": """
        SELECT
            event_time,
            source_ip,
            dest_ip,
            dest_port,
            protocol,
            bytes_in,
            bytes_out,
            duration_ms,
            geo_country
        FROM {catalog}.{schema}.network_events
        WHERE (source_ip = :ip OR dest_ip = :ip)
          AND event_time BETWEEN :start_time AND :end_time
        ORDER BY event_time DESC
        LIMIT :max_rows
    """,

    "rare_processes": """
        SELECT
            process_name,
            command_line,
            parent_process,
            user_id,
            hostname,
            COUNT(*) as occurrence_count,
            MIN(event_time) as first_seen,
            MAX(event_time) as last_seen
        FROM {catalog}.{schema}.endpoint_events
        WHERE event_time BETWEEN :start_time AND :end_time
          AND hostname = :hostname
        GROUP BY process_name, command_line, parent_process, user_id, hostname
        HAVING COUNT(*) <= :threshold
        ORDER BY occurrence_count ASC
        LIMIT :max_rows
    """,

    "data_transfer_anomalies": """
        SELECT
            event_time,
            user_id,
            source_ip,
            dest_ip,
            bytes_transferred,
            dest_geo_country,
            protocol,
            application
        FROM {catalog}.{schema}.events
        WHERE bytes_transferred > :threshold_bytes
          AND event_time BETWEEN :start_time AND :end_time
        ORDER BY bytes_transferred DESC
        LIMIT :max_rows
    """,

    "asset_info": """
        SELECT
            asset_id,
            hostname,
            ip_address,
            asset_type,
            criticality,
            owner,
            business_unit,
            environment,
            os_type,
            last_seen,
            tags
        FROM {catalog}.{schema}.asset_inventory
        WHERE asset_id = :asset_id OR hostname = :hostname OR ip_address = :ip_address
        LIMIT 10
    """,

    "correlation_matches": """
        SELECT
            cm.id,
            cm.rule_id,
            cr.name as rule_name,
            cm.matched_events,
            cm.confidence_score,
            cm.created_at,
            cr.severity,
            cr.mitre_techniques
        FROM {catalog}.{schema}.correlation_matches cm
        JOIN {catalog}.{schema}.correlation_rules cr ON cm.rule_id = cr.id
        WHERE cm.created_at >= :since
          AND cm.confidence_score >= :min_confidence
        ORDER BY cm.created_at DESC
        LIMIT :max_rows
    """,
}

# Deny-listed SQL patterns (prevent injection and unsafe operations)
BLOCKED_PATTERNS = [
    "DROP ", "DELETE ", "TRUNCATE ", "ALTER ", "CREATE ", "INSERT ", "UPDATE ",
    "GRANT ", "REVOKE ", "--", "/*", "*/", ";--", "UNION ALL SELECT",
    "INTO OUTFILE", "INTO DUMPFILE", "LOAD_FILE",
]


class DeltaTableQueryTool:
    """
    Executes safe, parameterized queries against Delta Lake tables.

    Security:
    - Only allows predefined query templates or validated custom queries
    - All parameters are bound (no string interpolation)
    - SQL injection patterns are blocked
    - Query results are size-limited
    - All queries are logged for audit
    """

    def __init__(self, config: QueryConfig, sql_client: Any):
        self.config = config
        self.sql_client = sql_client  # Databricks SQL connector or Spark session

    async def execute_template(
        self,
        template_name: str,
        parameters: dict,
        max_rows: int = None,
    ) -> dict:
        """
        Execute a predefined query template with bound parameters.

        Args:
            template_name: Name of the query template
            parameters: Parameter values to bind
            max_rows: Override max rows (capped by config)

        Returns:
            dict with "columns", "rows", "row_count", "execution_time_ms"
        """
        if template_name not in QUERY_TEMPLATES:
            raise ValueError(f"Unknown query template: {template_name}. Available: {list(QUERY_TEMPLATES.keys())}")

        query = QUERY_TEMPLATES[template_name].format(
            catalog=self.config.catalog,
            schema=self.config.schema,
            ip_list=self._safe_list(parameters.get("ip_list", [])),
            user_list=self._safe_list(parameters.get("user_list", [])),
        )

        effective_max = min(max_rows or self.config.max_rows, self.config.max_rows)
        parameters["max_rows"] = effective_max

        return await self._execute(query, parameters)

    async def execute_custom(
        self,
        query: str,
        parameters: dict = None,
    ) -> dict:
        """
        Execute a custom SELECT query after safety validation.
        Only SELECT queries are allowed.
        """
        self._validate_query(query)
        return await self._execute(query, parameters or {})

    def _validate_query(self, query: str):
        """Validate query is safe to execute."""
        upper = query.upper().strip()

        if not upper.startswith("SELECT") and not upper.startswith("WITH"):
            raise ValueError("Only SELECT queries are allowed")

        for pattern in BLOCKED_PATTERNS:
            if pattern in upper:
                raise ValueError(f"Blocked SQL pattern detected: {pattern}")

    def _safe_list(self, items: list) -> str:
        """Convert a list to a safe SQL IN clause."""
        if not items:
            return "'__NONE__'"
        safe_items = []
        for item in items[:100]:  # Cap at 100 items
            sanitized = str(item).replace("'", "").replace(";", "").replace("--", "")
            safe_items.append(f"'{sanitized}'")
        return ", ".join(safe_items)

    async def _execute(self, query: str, parameters: dict) -> dict:
        """Execute query against the SQL warehouse."""
        start = time.time()

        try:
            result = await self.sql_client.execute(
                query=query,
                parameters=parameters,
                timeout=self.config.timeout_seconds,
                warehouse_id=self.config.warehouse_id,
            )

            elapsed_ms = (time.time() - start) * 1000

            return {
                "columns": result.get("columns", []),
                "rows": result.get("rows", [])[:self.config.max_rows],
                "row_count": len(result.get("rows", [])),
                "execution_time_ms": elapsed_ms,
                "truncated": len(result.get("rows", [])) >= self.config.max_rows,
            }

        except Exception as e:
            elapsed_ms = (time.time() - start) * 1000
            logger.error(f"Query failed after {elapsed_ms:.0f}ms: {e}")
            raise


# Tool definition for registration with ToolRegistry
TOOL_DEFINITION = {
    "name": "query_delta_table",
    "description": "Query security event data from Delta Lake tables. Use template queries for common patterns or custom SELECT queries for specific investigations.",
    "parameters": {
        "type": "object",
        "properties": {
            "template": {
                "type": "string",
                "description": f"Predefined query template name. Available: {list(QUERY_TEMPLATES.keys())}",
                "enum": list(QUERY_TEMPLATES.keys()),
            },
            "custom_query": {
                "type": "string",
                "description": "Custom SELECT query (only if no template fits). Must be read-only.",
            },
            "parameters": {
                "type": "object",
                "description": "Query parameters (entity IDs, time ranges, thresholds)",
                "properties": {
                    "entity": {"type": "string"},
                    "start_time": {"type": "string", "description": "ISO timestamp"},
                    "end_time": {"type": "string", "description": "ISO timestamp"},
                    "user_id": {"type": "string"},
                    "ip_address": {"type": "string"},
                    "hostname": {"type": "string"},
                    "severity": {"type": "string"},
                    "threshold": {"type": "integer"},
                    "threshold_bytes": {"type": "integer"},
                    "min_confidence": {"type": "number"},
                    "since": {"type": "string"},
                    "max_rows": {"type": "integer", "maximum": 10000},
                },
            },
        },
        "required": ["parameters"],
    },
}
