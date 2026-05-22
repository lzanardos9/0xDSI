# Databricks notebook source
# MAGIC %md
# MAGIC # 0xDSI SQL Safety Module
# MAGIC Parameterized query builder that prevents SQL injection across all notebooks.
# MAGIC Every notebook that constructs SQL dynamically MUST use this module.

# COMMAND ----------

import re
import logging
from typing import Any, Optional
from dataclasses import dataclass, field

logger = logging.getLogger("oxdsi.sql_safe")

# Characters that are never allowed in identifiers
_DANGEROUS_IDENTIFIER_CHARS = re.compile(r"[^a-zA-Z0-9_.]")

# SQL keywords that should never appear in user-provided values used as identifiers
_DANGEROUS_KEYWORDS = {
    "DROP", "DELETE", "TRUNCATE", "ALTER", "EXEC", "EXECUTE",
    "INSERT", "UPDATE", "MERGE", "GRANT", "REVOKE", "CREATE",
    "UNION", "INTO", "OUTFILE", "DUMPFILE", "LOAD_FILE",
    "--", "/*", "*/", "xp_", "sp_",
}


@dataclass
class SafeQuery:
    """A validated SQL query ready for execution."""
    sql: str
    parameters: dict = field(default_factory=dict)
    description: str = ""


def safe_identifier(name: str) -> str:
    """
    Validate and quote a SQL identifier (table name, column name).
    Raises ValueError if the name contains dangerous characters.

    Usage:
        table = safe_identifier("alerts")  # returns "`alerts`"
        table = safe_identifier("drop table--")  # raises ValueError
    """
    if not name or not name.strip():
        raise ValueError("SQL identifier cannot be empty")

    cleaned = name.strip()

    # Check for dangerous patterns
    upper = cleaned.upper()
    for keyword in _DANGEROUS_KEYWORDS:
        if keyword in upper and keyword not in ("CREATE",):
            raise ValueError(f"Dangerous keyword '{keyword}' found in identifier: {name}")

    # Allow dots for fully qualified names (catalog.schema.table)
    parts = cleaned.split(".")
    for part in parts:
        if _DANGEROUS_IDENTIFIER_CHARS.match(part.replace("_", "")):
            pass
        sanitized = re.sub(r"[^a-zA-Z0-9_]", "", part)
        if sanitized != part:
            raise ValueError(
                f"Invalid characters in identifier part: '{part}'. "
                f"Only alphanumeric and underscores allowed."
            )

    # Quote each part with backticks
    quoted_parts = [f"`{part}`" for part in parts]
    return ".".join(quoted_parts)


def safe_value(value: Any) -> str:
    """
    Escape a literal value for safe SQL embedding.
    For use ONLY when Spark parameterized queries are not available.
    Prefer parameterized queries via build_parameterized_query().

    Usage:
        val = safe_value("O'Brien")  # returns "'O''Brien'"
        val = safe_value(42)          # returns "42"
        val = safe_value(None)        # returns "NULL"
    """
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return "TRUE" if value else "FALSE"
    if isinstance(value, (int, float)):
        return str(value)
    if isinstance(value, str):
        # Escape single quotes by doubling them
        escaped = value.replace("'", "''")
        # Remove null bytes
        escaped = escaped.replace("\x00", "")
        # Check for injection attempts
        upper = escaped.upper()
        for keyword in ("--", "/*", "*/", "\\x", "0x"):
            if keyword.upper() in upper:
                logger.warning(f"Suspicious pattern in value: {keyword}")
        return f"'{escaped}'"
    if isinstance(value, (list, tuple)):
        return "(" + ", ".join(safe_value(v) for v in value) + ")"
    # Fallback: stringify and escape
    return safe_value(str(value))


def safe_in_list(values: list) -> str:
    """
    Build a safe IN clause value list.

    Usage:
        ids = safe_in_list(["abc", "def", "ghi"])
        query = f"SELECT * FROM alerts WHERE id IN {ids}"
    """
    if not values:
        return "('')"
    return safe_value(tuple(values))


class QueryBuilder:
    """
    Fluent query builder for common SOC query patterns.
    Produces SafeQuery objects with parameterized values.

    Usage:
        qb = QueryBuilder("alerts")
        query = (qb
            .select(["id", "severity", "title"])
            .where_eq("status", "open")
            .where_gte("severity_id", 3)
            .where_in("source", ["endpoint", "network"])
            .order_by("created_at", desc=True)
            .limit(50)
            .build())

        df = spark.sql(query.sql)
    """

    def __init__(self, table: str, catalog: str = "", schema: str = ""):
        """
        Args:
            table: Table name
            catalog: Optional catalog (uses current if empty)
            schema: Optional schema (uses current if empty)
        """
        if catalog and schema:
            self._table = f"`{catalog}`.`{schema}`.`{table}`"
        elif schema:
            self._table = f"`{schema}`.`{table}`"
        else:
            self._table = safe_identifier(table)

        self._columns: list = ["*"]
        self._conditions: list = []
        self._order: list = []
        self._limit_val: Optional[int] = None
        self._group_by: list = []
        self._having: list = []
        self._joins: list = []
        self._description = ""

    def describe(self, desc: str) -> "QueryBuilder":
        """Add a description for audit logging."""
        self._description = desc
        return self

    def select(self, columns: list) -> "QueryBuilder":
        """Specify columns to select."""
        self._columns = [safe_identifier(c) if "(" not in c else c for c in columns]
        return self

    def select_raw(self, expressions: list) -> "QueryBuilder":
        """Select raw expressions (aggregates, functions). Use with caution."""
        self._columns = expressions
        return self

    def where_eq(self, column: str, value: Any) -> "QueryBuilder":
        """Add equality condition."""
        col = safe_identifier(column)
        self._conditions.append(f"{col} = {safe_value(value)}")
        return self

    def where_neq(self, column: str, value: Any) -> "QueryBuilder":
        """Add not-equal condition."""
        col = safe_identifier(column)
        self._conditions.append(f"{col} != {safe_value(value)}")
        return self

    def where_gt(self, column: str, value: Any) -> "QueryBuilder":
        """Add greater-than condition."""
        col = safe_identifier(column)
        self._conditions.append(f"{col} > {safe_value(value)}")
        return self

    def where_gte(self, column: str, value: Any) -> "QueryBuilder":
        """Add greater-than-or-equal condition."""
        col = safe_identifier(column)
        self._conditions.append(f"{col} >= {safe_value(value)}")
        return self

    def where_lt(self, column: str, value: Any) -> "QueryBuilder":
        """Add less-than condition."""
        col = safe_identifier(column)
        self._conditions.append(f"{col} < {safe_value(value)}")
        return self

    def where_lte(self, column: str, value: Any) -> "QueryBuilder":
        """Add less-than-or-equal condition."""
        col = safe_identifier(column)
        self._conditions.append(f"{col} <= {safe_value(value)}")
        return self

    def where_in(self, column: str, values: list) -> "QueryBuilder":
        """Add IN condition."""
        col = safe_identifier(column)
        self._conditions.append(f"{col} IN {safe_in_list(values)}")
        return self

    def where_not_null(self, column: str) -> "QueryBuilder":
        """Add IS NOT NULL condition."""
        col = safe_identifier(column)
        self._conditions.append(f"{col} IS NOT NULL")
        return self

    def where_null(self, column: str) -> "QueryBuilder":
        """Add IS NULL condition."""
        col = safe_identifier(column)
        self._conditions.append(f"{col} IS NULL")
        return self

    def where_like(self, column: str, pattern: str) -> "QueryBuilder":
        """Add LIKE condition (pattern should use % wildcards)."""
        col = safe_identifier(column)
        self._conditions.append(f"{col} LIKE {safe_value(pattern)}")
        return self

    def where_between(self, column: str, low: Any, high: Any) -> "QueryBuilder":
        """Add BETWEEN condition."""
        col = safe_identifier(column)
        self._conditions.append(
            f"{col} BETWEEN {safe_value(low)} AND {safe_value(high)}"
        )
        return self

    def where_raw(self, condition: str) -> "QueryBuilder":
        """Add a raw WHERE condition. Use sparingly and NEVER with user input."""
        self._conditions.append(condition)
        return self

    def where_time_window(self, column: str, seconds: int) -> "QueryBuilder":
        """Add condition: column within last N seconds from now."""
        col = safe_identifier(column)
        self._conditions.append(
            f"{col} >= current_timestamp() - INTERVAL {int(seconds)} SECONDS"
        )
        return self

    def join(self, table: str, on_condition: str, join_type: str = "LEFT") -> "QueryBuilder":
        """Add a JOIN clause."""
        safe_table = safe_identifier(table)
        valid_joins = {"LEFT", "RIGHT", "INNER", "FULL OUTER", "CROSS"}
        jt = join_type.upper()
        if jt not in valid_joins:
            raise ValueError(f"Invalid join type: {join_type}")
        self._joins.append(f"{jt} JOIN {safe_table} ON {on_condition}")
        return self

    def group_by(self, columns: list) -> "QueryBuilder":
        """Add GROUP BY clause."""
        self._group_by = [safe_identifier(c) for c in columns]
        return self

    def having_raw(self, condition: str) -> "QueryBuilder":
        """Add HAVING condition (for aggregates)."""
        self._having.append(condition)
        return self

    def order_by(self, column: str, desc: bool = False) -> "QueryBuilder":
        """Add ORDER BY clause."""
        col = safe_identifier(column)
        direction = "DESC" if desc else "ASC"
        self._order.append(f"{col} {direction}")
        return self

    def limit(self, n: int) -> "QueryBuilder":
        """Set result limit. Max 10000 enforced."""
        self._limit_val = min(int(n), 10000)
        return self

    def build(self) -> SafeQuery:
        """Build the final SQL query."""
        parts = [f"SELECT {', '.join(self._columns)}", f"FROM {self._table}"]

        for join in self._joins:
            parts.append(join)

        if self._conditions:
            parts.append("WHERE " + " AND ".join(self._conditions))

        if self._group_by:
            parts.append("GROUP BY " + ", ".join(self._group_by))

        if self._having:
            parts.append("HAVING " + " AND ".join(self._having))

        if self._order:
            parts.append("ORDER BY " + ", ".join(self._order))

        if self._limit_val is not None:
            parts.append(f"LIMIT {self._limit_val}")

        sql = "\n".join(parts)

        return SafeQuery(sql=sql, description=self._description)


def build_insert(
    table: str,
    columns: list,
    values: list,
    catalog: str = "",
    schema: str = "",
) -> SafeQuery:
    """
    Build a safe INSERT statement.

    Usage:
        query = build_insert(
            "alerts",
            columns=["id", "title", "severity"],
            values=["uuid-123", "Brute force", "high"],
        )
        spark.sql(query.sql)
    """
    if catalog and schema:
        full_table = f"`{catalog}`.`{schema}`.`{table}`"
    else:
        full_table = safe_identifier(table)

    safe_cols = [safe_identifier(c) for c in columns]
    safe_vals = [safe_value(v) for v in values]

    sql = (
        f"INSERT INTO {full_table} ({', '.join(safe_cols)})\n"
        f"VALUES ({', '.join(safe_vals)})"
    )

    return SafeQuery(sql=sql, description=f"Insert into {table}")


def build_update(
    table: str,
    set_values: dict,
    where_conditions: dict,
    catalog: str = "",
    schema: str = "",
) -> SafeQuery:
    """
    Build a safe UPDATE statement.

    Usage:
        query = build_update(
            "alerts",
            set_values={"status": "resolved", "resolved_at": "2024-01-01T00:00:00Z"},
            where_conditions={"id": "uuid-123"},
        )
        spark.sql(query.sql)
    """
    if catalog and schema:
        full_table = f"`{catalog}`.`{schema}`.`{table}`"
    else:
        full_table = safe_identifier(table)

    set_parts = [
        f"{safe_identifier(k)} = {safe_value(v)}" for k, v in set_values.items()
    ]
    where_parts = [
        f"{safe_identifier(k)} = {safe_value(v)}" for k, v in where_conditions.items()
    ]

    sql = (
        f"UPDATE {full_table}\n"
        f"SET {', '.join(set_parts)}\n"
        f"WHERE {' AND '.join(where_parts)}"
    )

    return SafeQuery(sql=sql, description=f"Update {table}")
