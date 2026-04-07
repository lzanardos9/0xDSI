#!/usr/bin/env python3
"""
Migrate all data from Supabase to Databricks Delta Lake
Exports data in batches and loads into Delta tables
"""

import os
import json
from typing import List, Dict, Any
import psycopg2
from databricks import sql
from dotenv import load_dotenv
import time

load_dotenv()

BATCH_SIZE = 10000  # Records per batch

def connect_to_supabase():
    """Connect to Supabase PostgreSQL"""
    return psycopg2.connect(
        host=os.getenv('SUPABASE_DB_HOST'),
        port=os.getenv('SUPABASE_DB_PORT', '5432'),
        database=os.getenv('SUPABASE_DB_NAME', 'postgres'),
        user=os.getenv('SUPABASE_DB_USER', 'postgres'),
        password=os.getenv('SUPABASE_DB_PASSWORD')
    )

def connect_to_databricks():
    """Connect to Databricks SQL Warehouse"""
    return sql.connect(
        server_hostname=os.getenv('DATABRICKS_HOST'),
        http_path=os.getenv('DATABRICKS_HTTP_PATH'),
        access_token=os.getenv('DATABRICKS_TOKEN')
    )

def get_all_tables(conn) -> List[str]:
    """Get all table names"""
    with conn.cursor() as cur:
        cur.execute("""
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public'
            AND table_type = 'BASE TABLE'
            ORDER BY table_name;
        """)
        return [row[0] for row in cur.fetchall()]

def get_row_count(conn, table_name: str) -> int:
    """Get total row count for a table"""
    with conn.cursor() as cur:
        cur.execute(f"SELECT COUNT(*) FROM {table_name};")
        return cur.fetchone()[0]

def export_table_batch(conn, table_name: str, offset: int, limit: int) -> List[Dict]:
    """Export a batch of rows from table"""
    with conn.cursor() as cur:
        cur.execute(f"""
            SELECT * FROM {table_name}
            ORDER BY ctid
            OFFSET {offset} LIMIT {limit};
        """)

        columns = [desc[0] for desc in cur.description]
        rows = []

        for row in cur.fetchall():
            row_dict = {}
            for col_name, value in zip(columns, row):
                # Convert PostgreSQL types to JSON-serializable
                if value is None:
                    row_dict[col_name] = None
                elif isinstance(value, (list, dict)):
                    row_dict[col_name] = json.dumps(value)
                elif hasattr(value, 'isoformat'):  # datetime
                    row_dict[col_name] = value.isoformat()
                else:
                    row_dict[col_name] = str(value)

            rows.append(row_dict)

        return rows, columns

def insert_batch_to_delta(db_conn, table_name: str, rows: List[Dict], columns: List[str]):
    """Insert batch into Delta table"""
    if not rows:
        return

    cursor = db_conn.cursor()

    # Build INSERT statement
    placeholders = ', '.join(['?' for _ in columns])
    insert_sql = f"INSERT INTO siem.{table_name} ({', '.join(columns)}) VALUES ({placeholders})"

    # Convert rows to tuples
    values = []
    for row in rows:
        values.append(tuple(row.get(col) for col in columns))

    # Execute batch insert
    cursor.executemany(insert_sql, values)
    cursor.close()

def migrate_table(pg_conn, db_conn, table_name: str):
    """Migrate entire table from PostgreSQL to Delta Lake"""
    print(f"\n📦 Migrating {table_name}...")

    # Get row count
    total_rows = get_row_count(pg_conn, table_name)
    print(f"   Total rows: {total_rows:,}")

    if total_rows == 0:
        print("   ⚠️  Table is empty, skipping")
        return

    # Migrate in batches
    offset = 0
    migrated = 0
    start_time = time.time()

    while offset < total_rows:
        batch_start = time.time()

        # Export batch
        rows, columns = export_table_batch(pg_conn, table_name, offset, BATCH_SIZE)

        # Insert batch
        insert_batch_to_delta(db_conn, table_name, rows, columns)

        migrated += len(rows)
        offset += BATCH_SIZE

        batch_time = time.time() - batch_start
        progress = (migrated / total_rows) * 100

        print(f"   [{progress:5.1f}%] {migrated:,}/{total_rows:,} rows "
              f"({batch_time:.2f}s, {len(rows)/batch_time:.0f} rows/sec)")

    total_time = time.time() - start_time
    print(f"   ✅ Completed in {total_time:.2f}s ({total_rows/total_time:.0f} rows/sec)")

def verify_migration(pg_conn, db_conn, table_name: str) -> bool:
    """Verify row counts match"""
    # PostgreSQL count
    pg_count = get_row_count(pg_conn, table_name)

    # Databricks count
    cursor = db_conn.cursor()
    cursor.execute(f"SELECT COUNT(*) FROM siem.{table_name}")
    db_count = cursor.fetchone()[0]
    cursor.close()

    if pg_count == db_count:
        print(f"   ✅ Verification passed: {pg_count:,} rows")
        return True
    else:
        print(f"   ❌ Verification FAILED: PostgreSQL={pg_count:,}, Databricks={db_count:,}")
        return False

def main():
    """Main execution"""
    print("🚀 Starting Data Migration from Supabase to Databricks\n")

    # Connect to both databases
    print("📊 Connecting to Supabase...")
    pg_conn = connect_to_supabase()
    print("✅ Connected to Supabase\n")

    print("📊 Connecting to Databricks...")
    db_conn = connect_to_databricks()
    print("✅ Connected to Databricks\n")

    # Get all tables
    tables = get_all_tables(pg_conn)
    print(f"📋 Found {len(tables)} tables to migrate\n")

    # Migration summary
    start_time = time.time()
    succeeded = []
    failed = []

    # Migrate each table
    for i, table_name in enumerate(tables, 1):
        print(f"[{i}/{len(tables)}] {table_name}")

        try:
            # Migrate data
            migrate_table(pg_conn, db_conn, table_name)

            # Verify
            if verify_migration(pg_conn, db_conn, table_name):
                succeeded.append(table_name)
            else:
                failed.append(table_name)

        except Exception as e:
            print(f"   ❌ Error: {e}")
            failed.append(table_name)

    # Summary
    total_time = time.time() - start_time
    print("\n" + "="*60)
    print("📊 MIGRATION SUMMARY")
    print("="*60)
    print(f"✅ Succeeded: {len(succeeded)}/{len(tables)} tables")
    print(f"❌ Failed: {len(failed)}/{len(tables)} tables")
    print(f"⏱️  Total time: {total_time/60:.1f} minutes")

    if failed:
        print("\n❌ Failed tables:")
        for table in failed:
            print(f"   - {table}")

    # Close connections
    pg_conn.close()
    db_conn.close()

    print("\n✨ Data migration complete!")
    print("\n🎯 Next steps:")
    print("1. Run OPTIMIZE on all tables")
    print("2. Create vector search indexes")
    print("3. Test application queries")

if __name__ == "__main__":
    main()
