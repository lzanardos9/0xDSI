#!/usr/bin/env python3
"""
Migrate all data from Supabase to Databricks Delta Lake.

Production hardening over the previous version:
  - Idempotent: tracks per-table progress in a `migration_state` Delta table.
    Re-runs resume rather than duplicating data.
  - Parameterized: --catalog, --schema, --tables (regex), --batch-size.
  - Uses primary-key cursor instead of `ctid` (PostgreSQL-only) when available.
  - Per-batch retry with exponential backoff.
  - Structured logging.
"""

import argparse
import json
import logging
import os
import re
import sys
import time
from typing import List, Dict, Any, Optional, Tuple

import psycopg2
from databricks import sql
from dotenv import load_dotenv

load_dotenv()

DEFAULT_BATCH_SIZE = 10_000
MAX_RETRIES = 5
INITIAL_BACKOFF = 2.0

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s | %(levelname)s | %(message)s",
)
log = logging.getLogger("migrate_data")


# ----------------------------------------------------------------------------
# Connections
# ----------------------------------------------------------------------------

def connect_to_supabase():
    return psycopg2.connect(
        host=os.environ["SUPABASE_DB_HOST"],
        port=os.getenv("SUPABASE_DB_PORT", "5432"),
        database=os.getenv("SUPABASE_DB_NAME", "postgres"),
        user=os.getenv("SUPABASE_DB_USER", "postgres"),
        password=os.environ["SUPABASE_DB_PASSWORD"],
    )


def connect_to_databricks():
    return sql.connect(
        server_hostname=os.environ["DATABRICKS_HOST"],
        http_path=os.environ["DATABRICKS_HTTP_PATH"],
        access_token=os.environ["DATABRICKS_TOKEN"],
    )


# ----------------------------------------------------------------------------
# Idempotency: state table
# ----------------------------------------------------------------------------

def ensure_state_table(db_conn, catalog: str, schema: str) -> None:
    cur = db_conn.cursor()
    try:
        cur.execute(f"CREATE CATALOG IF NOT EXISTS {catalog}")
        cur.execute(f"CREATE SCHEMA IF NOT EXISTS {catalog}.{schema}")
        cur.execute(
            f"""
            CREATE TABLE IF NOT EXISTS {catalog}.{schema}.migration_state (
              table_name STRING NOT NULL,
              cursor_pk STRING,
              rows_migrated BIGINT,
              total_rows BIGINT,
              status STRING,
              started_at TIMESTAMP,
              updated_at TIMESTAMP,
              error_message STRING
            ) USING DELTA
            """
        )
    finally:
        cur.close()


def get_state(db_conn, catalog: str, schema: str, table_name: str) -> Optional[Dict[str, Any]]:
    cur = db_conn.cursor()
    try:
        cur.execute(
            f"SELECT cursor_pk, rows_migrated, status FROM {catalog}.{schema}.migration_state "
            f"WHERE table_name = ?",
            [table_name],
        )
        row = cur.fetchone()
        if not row:
            return None
        return {"cursor_pk": row[0], "rows_migrated": row[1] or 0, "status": row[2]}
    finally:
        cur.close()


def upsert_state(db_conn, catalog: str, schema: str, **kwargs) -> None:
    cur = db_conn.cursor()
    try:
        cur.execute(
            f"""
            MERGE INTO {catalog}.{schema}.migration_state t
            USING (SELECT ? AS table_name, ? AS cursor_pk, ? AS rows_migrated,
                          ? AS total_rows, ? AS status, current_timestamp() AS updated_at,
                          ? AS error_message) s
            ON t.table_name = s.table_name
            WHEN MATCHED THEN UPDATE SET
              cursor_pk = s.cursor_pk,
              rows_migrated = s.rows_migrated,
              total_rows = s.total_rows,
              status = s.status,
              updated_at = s.updated_at,
              error_message = s.error_message
            WHEN NOT MATCHED THEN INSERT (table_name, cursor_pk, rows_migrated, total_rows,
                                          status, started_at, updated_at, error_message)
            VALUES (s.table_name, s.cursor_pk, s.rows_migrated, s.total_rows,
                    s.status, current_timestamp(), s.updated_at, s.error_message)
            """,
            [
                kwargs["table_name"],
                kwargs.get("cursor_pk"),
                kwargs.get("rows_migrated", 0),
                kwargs.get("total_rows", 0),
                kwargs["status"],
                kwargs.get("error_message"),
            ],
        )
    finally:
        cur.close()


# ----------------------------------------------------------------------------
# Schema discovery
# ----------------------------------------------------------------------------

def get_all_tables(conn, source_schema: str = "public") -> List[str]:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT table_name FROM information_schema.tables
            WHERE table_schema = %s AND table_type = 'BASE TABLE'
            ORDER BY table_name
            """,
            [source_schema],
        )
        return [r[0] for r in cur.fetchall()]


def get_primary_key(conn, source_schema: str, table_name: str) -> Optional[str]:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT a.attname
            FROM pg_index i
            JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
            JOIN pg_class c ON c.oid = i.indrelid
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE i.indisprimary AND n.nspname = %s AND c.relname = %s
            ORDER BY array_position(i.indkey, a.attnum)
            LIMIT 1
            """,
            [source_schema, table_name],
        )
        row = cur.fetchone()
        return row[0] if row else None


def get_row_count(conn, source_schema: str, table_name: str) -> int:
    with conn.cursor() as cur:
        cur.execute(f'SELECT COUNT(*) FROM "{source_schema}"."{table_name}"')
        return cur.fetchone()[0]


# ----------------------------------------------------------------------------
# Batch export with PK cursor
# ----------------------------------------------------------------------------

def export_batch_pk(
    conn, source_schema: str, table_name: str, pk: str,
    last_pk: Optional[str], limit: int,
) -> Tuple[List[Dict[str, Any]], List[str], Optional[str]]:
    with conn.cursor() as cur:
        if last_pk is None:
            cur.execute(
                f'SELECT * FROM "{source_schema}"."{table_name}" '
                f'ORDER BY "{pk}" ASC LIMIT %s',
                [limit],
            )
        else:
            cur.execute(
                f'SELECT * FROM "{source_schema}"."{table_name}" '
                f'WHERE "{pk}" > %s ORDER BY "{pk}" ASC LIMIT %s',
                [last_pk, limit],
            )
        cols = [d[0] for d in cur.description]
        rows: List[Dict[str, Any]] = []
        for raw in cur.fetchall():
            row: Dict[str, Any] = {}
            for col, value in zip(cols, raw):
                if value is None:
                    row[col] = None
                elif isinstance(value, (list, dict)):
                    row[col] = json.dumps(value)
                elif hasattr(value, "isoformat"):
                    row[col] = value.isoformat()
                else:
                    row[col] = value if isinstance(value, (int, float, bool)) else str(value)
            rows.append(row)
        next_cursor = str(rows[-1][pk]) if rows else last_pk
        return rows, cols, next_cursor


# ----------------------------------------------------------------------------
# Idempotent insert via Delta MERGE on primary key
# ----------------------------------------------------------------------------

def merge_batch(db_conn, catalog: str, schema: str, table_name: str,
                rows: List[Dict[str, Any]], cols: List[str], pk: Optional[str]) -> None:
    if not rows:
        return

    cur = db_conn.cursor()
    try:
        if pk and pk in cols:
            placeholders = ", ".join(["?" for _ in cols])
            select_cols = ", ".join(["?" for _ in cols])
            update_set = ", ".join([f"t.{c} = s.{c}" for c in cols if c != pk])
            insert_cols = ", ".join(cols)
            insert_vals = ", ".join([f"s.{c}" for c in cols])

            for row in rows:
                params = [row.get(c) for c in cols]
                cur.execute(
                    f"""
                    MERGE INTO {catalog}.{schema}.{table_name} t
                    USING (SELECT {', '.join(f'? AS {c}' for c in cols)}) s
                    ON t.{pk} = s.{pk}
                    WHEN MATCHED THEN UPDATE SET {update_set}
                    WHEN NOT MATCHED THEN INSERT ({insert_cols}) VALUES ({insert_vals})
                    """,
                    params,
                )
        else:
            placeholders = ", ".join(["?" for _ in cols])
            insert_sql = (
                f"INSERT INTO {catalog}.{schema}.{table_name} "
                f"({', '.join(cols)}) VALUES ({placeholders})"
            )
            cur.executemany(insert_sql, [tuple(r.get(c) for c in cols) for r in rows])
    finally:
        cur.close()


def with_retries(fn, *args, **kwargs):
    backoff = INITIAL_BACKOFF
    last_exc: Optional[Exception] = None
    for attempt in range(MAX_RETRIES):
        try:
            return fn(*args, **kwargs)
        except Exception as exc:
            last_exc = exc
            log.warning("Attempt %s/%s failed: %s", attempt + 1, MAX_RETRIES, exc)
            time.sleep(backoff)
            backoff *= 2
    raise last_exc  # type: ignore[misc]


# ----------------------------------------------------------------------------
# Per-table migration with resume
# ----------------------------------------------------------------------------

def migrate_table(
    pg_conn, db_conn, table_name: str, *,
    catalog: str, schema: str, source_schema: str, batch_size: int,
) -> Tuple[int, int]:
    log.info("Migrating %s", table_name)

    total = get_row_count(pg_conn, source_schema, table_name)
    if total == 0:
        upsert_state(db_conn, catalog, schema, table_name=table_name,
                     status="empty", total_rows=0, rows_migrated=0)
        log.info("  empty, marking done")
        return 0, 0

    pk = get_primary_key(pg_conn, source_schema, table_name)
    state = get_state(db_conn, catalog, schema, table_name) or {}
    last_pk = state.get("cursor_pk")
    migrated = state.get("rows_migrated", 0)

    if state.get("status") == "completed" and migrated >= total:
        log.info("  already complete (%s rows), skipping", migrated)
        return migrated, total

    upsert_state(db_conn, catalog, schema, table_name=table_name,
                 status="in_progress", total_rows=total,
                 rows_migrated=migrated, cursor_pk=last_pk)

    if not pk:
        log.warning("  no primary key for %s, falling back to LIMIT/OFFSET (NOT idempotent)", table_name)

    while migrated < total:
        rows, cols, next_cursor = with_retries(
            export_batch_pk, pg_conn, source_schema, table_name, pk, last_pk, batch_size,
        ) if pk else ([], [], None)

        if not pk:
            with pg_conn.cursor() as cur:
                cur.execute(
                    f'SELECT * FROM "{source_schema}"."{table_name}" '
                    f'OFFSET %s LIMIT %s',
                    [migrated, batch_size],
                )
                cols = [d[0] for d in cur.description]
                rows = [
                    {c: (json.dumps(v) if isinstance(v, (list, dict))
                         else v.isoformat() if hasattr(v, "isoformat")
                         else v if isinstance(v, (int, float, bool, type(None)))
                         else str(v))
                     for c, v in zip(cols, raw)}
                    for raw in cur.fetchall()
                ]
                next_cursor = None

        if not rows:
            break

        with_retries(merge_batch, db_conn, catalog, schema, table_name, rows, cols, pk)
        migrated += len(rows)
        last_pk = next_cursor

        upsert_state(db_conn, catalog, schema, table_name=table_name,
                     status="in_progress", total_rows=total,
                     rows_migrated=migrated, cursor_pk=last_pk)

        log.info("  %s/%s (%.1f%%)", migrated, total, 100.0 * migrated / total)

    upsert_state(db_conn, catalog, schema, table_name=table_name,
                 status="completed", total_rows=total,
                 rows_migrated=migrated, cursor_pk=last_pk)
    return migrated, total


# ----------------------------------------------------------------------------
# CLI
# ----------------------------------------------------------------------------

def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--catalog", default=os.getenv("DATABRICKS_CATALOG", "soc_platform"))
    p.add_argument("--schema", default=os.getenv("DATABRICKS_SCHEMA", "siem"))
    p.add_argument("--source-schema", default=os.getenv("SUPABASE_SCHEMA", "public"))
    p.add_argument("--tables", help="Regex of table names to migrate", default=".*")
    p.add_argument("--batch-size", type=int, default=DEFAULT_BATCH_SIZE)
    p.add_argument("--reset", action="store_true",
                   help="Reset migration state for matched tables (forces full re-migration)")
    return p.parse_args()


def main():
    args = parse_args()
    pattern = re.compile(args.tables)

    log.info("Starting Supabase -> Databricks migration")
    log.info("  catalog=%s schema=%s source=%s pattern=%s",
             args.catalog, args.schema, args.source_schema, args.tables)

    pg_conn = connect_to_supabase()
    db_conn = connect_to_databricks()
    try:
        ensure_state_table(db_conn, args.catalog, args.schema)
        all_tables = [t for t in get_all_tables(pg_conn, args.source_schema) if pattern.search(t)]
        log.info("Selected %s tables", len(all_tables))

        if args.reset:
            cur = db_conn.cursor()
            for t in all_tables:
                cur.execute(
                    f"DELETE FROM {args.catalog}.{args.schema}.migration_state WHERE table_name = ?",
                    [t],
                )
            cur.close()

        succeeded, failed = [], []
        for i, table in enumerate(all_tables, 1):
            log.info("[%s/%s] %s", i, len(all_tables), table)
            try:
                migrated, total = migrate_table(
                    pg_conn, db_conn, table,
                    catalog=args.catalog, schema=args.schema,
                    source_schema=args.source_schema, batch_size=args.batch_size,
                )
                if migrated >= total:
                    succeeded.append(table)
                else:
                    failed.append(table)
            except Exception as exc:
                log.exception("Migration of %s failed", table)
                upsert_state(db_conn, args.catalog, args.schema,
                             table_name=table, status="failed",
                             error_message=str(exc)[:1000])
                failed.append(table)

        log.info("Done. succeeded=%s failed=%s", len(succeeded), len(failed))
        if failed:
            log.warning("Failed tables: %s", ", ".join(failed))
            sys.exit(1)
    finally:
        pg_conn.close()
        db_conn.close()


if __name__ == "__main__":
    main()
