#!/usr/bin/env python3
"""
Auto-Generate Databricks Delta Lake Schema from Supabase
Reads PostgreSQL schema and generates complete Delta Lake DDL
"""

import os
import json
from typing import List, Dict, Any
import psycopg2
from dotenv import load_dotenv

load_dotenv()

# PostgreSQL to Databricks type mapping
TYPE_MAPPING = {
    'bigint': 'BIGINT',
    'integer': 'INT',
    'smallint': 'SMALLINT',
    'numeric': 'DECIMAL',
    'real': 'FLOAT',
    'double precision': 'DOUBLE',
    'text': 'STRING',
    'character varying': 'STRING',
    'character': 'STRING',
    'varchar': 'STRING',
    'char': 'STRING',
    'boolean': 'BOOLEAN',
    'timestamp with time zone': 'TIMESTAMP',
    'timestamp without time zone': 'TIMESTAMP',
    'timestamptz': 'TIMESTAMP',
    'timestamp': 'TIMESTAMP',
    'date': 'DATE',
    'time': 'STRING',
    'uuid': 'STRING',
    'json': 'STRING COMMENT "JSON - use from_json()"',
    'jsonb': 'STRING COMMENT "JSON - use from_json()"',
    'bytea': 'BINARY',
    'inet': 'STRING',
    'cidr': 'STRING',
    'macaddr': 'STRING',
}

def connect_to_supabase():
    """Connect to Supabase PostgreSQL database"""
    return psycopg2.connect(
        host=os.getenv('SUPABASE_DB_HOST', 'db.YOUR_PROJECT.supabase.co'),
        port=os.getenv('SUPABASE_DB_PORT', '5432'),
        database=os.getenv('SUPABASE_DB_NAME', 'postgres'),
        user=os.getenv('SUPABASE_DB_USER', 'postgres'),
        password=os.getenv('SUPABASE_DB_PASSWORD')
    )

def get_all_tables(conn) -> List[str]:
    """Get all table names from public schema"""
    with conn.cursor() as cur:
        cur.execute("""
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public'
            AND table_type = 'BASE TABLE'
            ORDER BY table_name;
        """)
        return [row[0] for row in cur.fetchall()]

def get_table_columns(conn, table_name: str) -> List[Dict[str, Any]]:
    """Get all columns for a table with full metadata"""
    with conn.cursor() as cur:
        cur.execute("""
            SELECT
                column_name,
                data_type,
                udt_name,
                is_nullable,
                column_default,
                character_maximum_length,
                numeric_precision,
                numeric_scale
            FROM information_schema.columns
            WHERE table_schema = 'public'
            AND table_name = %s
            ORDER BY ordinal_position;
        """, (table_name,))

        columns = []
        for row in cur.fetchall():
            col_name, data_type, udt_name, is_nullable, col_default, char_len, num_prec, num_scale = row

            # Handle special types
            if udt_name == 'vector':
                # Extract dimension from vector type
                cur.execute("""
                    SELECT atttypmod
                    FROM pg_attribute
                    WHERE attrelid = %s::regclass
                    AND attname = %s;
                """, (f'public.{table_name}', col_name))
                typmod = cur.fetchone()
                dimension = typmod[0] if typmod and typmod[0] > 0 else 1536
                data_type = f'ARRAY<DOUBLE> COMMENT "Vector embedding {dimension}D"'
            elif data_type == 'ARRAY':
                # Get array element type
                data_type = f'ARRAY<STRING> COMMENT "Array field"'
            elif data_type == 'USER-DEFINED':
                if udt_name == 'vector':
                    data_type = 'ARRAY<DOUBLE> COMMENT "Vector embedding"'
                else:
                    data_type = 'STRING COMMENT "USER-DEFINED type"'
            else:
                data_type = TYPE_MAPPING.get(data_type, 'STRING')

            columns.append({
                'name': col_name,
                'type': data_type,
                'nullable': is_nullable == 'YES',
                'default': col_default,
                'char_length': char_len,
                'num_precision': num_prec,
                'num_scale': num_scale
            })

        return columns

def get_primary_key(conn, table_name: str) -> List[str]:
    """Get primary key columns"""
    with conn.cursor() as cur:
        cur.execute("""
            SELECT a.attname
            FROM pg_index i
            JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
            WHERE i.indrelid = %s::regclass
            AND i.indisprimary;
        """, (f'public.{table_name}',))
        return [row[0] for row in cur.fetchall()]

def get_indexes(conn, table_name: str) -> List[Dict[str, Any]]:
    """Get all indexes for a table"""
    with conn.cursor() as cur:
        cur.execute("""
            SELECT
                indexname,
                indexdef
            FROM pg_indexes
            WHERE schemaname = 'public'
            AND tablename = %s
            AND indexname NOT LIKE '%_pkey';
        """, (table_name,))
        return [{'name': row[0], 'definition': row[1]} for row in cur.fetchall()]

def get_foreign_keys(conn, table_name: str) -> List[Dict[str, Any]]:
    """Get foreign key constraints"""
    with conn.cursor() as cur:
        cur.execute("""
            SELECT
                tc.constraint_name,
                kcu.column_name,
                ccu.table_name AS foreign_table_name,
                ccu.column_name AS foreign_column_name
            FROM information_schema.table_constraints AS tc
            JOIN information_schema.key_column_usage AS kcu
                ON tc.constraint_name = kcu.constraint_name
                AND tc.table_schema = kcu.table_schema
            JOIN information_schema.constraint_column_usage AS ccu
                ON ccu.constraint_name = tc.constraint_name
                AND ccu.table_schema = tc.table_schema
            WHERE tc.constraint_type = 'FOREIGN KEY'
            AND tc.table_schema = 'public'
            AND tc.table_name = %s;
        """, (table_name,))

        fks = []
        for row in cur.fetchall():
            fks.append({
                'constraint_name': row[0],
                'column': row[1],
                'foreign_table': row[2],
                'foreign_column': row[3]
            })
        return fks

def generate_create_table_ddl(table_name: str, columns: List[Dict], primary_keys: List[str],
                               foreign_keys: List[Dict]) -> str:
    """Generate CREATE TABLE statement for Delta Lake"""

    ddl = f"-- Table: {table_name}\n"
    ddl += f"CREATE TABLE IF NOT EXISTS siem.{table_name} (\n"

    # Add columns
    column_defs = []
    for col in columns:
        col_def = f"  {col['name']} {col['type']}"

        # Handle defaults
        if col['default']:
            default = col['default']
            # Convert PostgreSQL defaults to Databricks
            if 'now()' in default or 'CURRENT_TIMESTAMP' in default:
                col_def += " DEFAULT current_timestamp()"
            elif 'gen_random_uuid()' in default or 'uuid_generate_v4()' in default:
                col_def += " DEFAULT uuid()"
            elif default.startswith("'") and default.endswith("'::"):
                # Strip type cast
                col_def += f" DEFAULT {default.split('::')[0]}"
            elif default not in ['NULL', 'null']:
                col_def += f" DEFAULT {default}"

        # Handle nullability
        if not col['nullable']:
            col_def += " NOT NULL"

        column_defs.append(col_def)

    ddl += ",\n".join(column_defs)

    # Add primary key
    if primary_keys:
        ddl += f",\n  PRIMARY KEY ({', '.join(primary_keys)})"

    # Note: Foreign keys are informational in Delta Lake
    # We'll add them as comments
    if foreign_keys:
        ddl += "\n  -- Foreign Keys:\n"
        for fk in foreign_keys:
            ddl += f"  -- {fk['column']} -> {fk['foreign_table']}.{fk['foreign_column']}\n"

    ddl += "\n) USING DELTA\n"

    # Add table properties
    ddl += "TBLPROPERTIES (\n"
    ddl += "  'delta.autoOptimize.optimizeWrite' = 'true',\n"
    ddl += "  'delta.autoOptimize.autoCompact' = 'true',\n"
    ddl += "  'delta.enableChangeDataFeed' = 'true'\n"
    ddl += ");\n\n"

    return ddl

def generate_optimize_statement(table_name: str, columns: List[Dict]) -> str:
    """Generate OPTIMIZE and Z-ORDER statement"""

    # Find good Z-ORDER columns (commonly filtered/joined columns)
    zorder_candidates = []
    for col in columns:
        col_name = col['name'].lower()
        # Common patterns for filtering/joining
        if any(pattern in col_name for pattern in ['_id', 'status', 'type', 'severity', 'user', 'ip', 'timestamp']):
            zorder_candidates.append(col['name'])

    if not zorder_candidates:
        return ""

    # Limit to 4 columns (Z-ORDER performs best with 3-4 columns)
    zorder_cols = zorder_candidates[:4]

    optimize = f"-- Optimize {table_name}\n"
    optimize += f"OPTIMIZE siem.{table_name} ZORDER BY ({', '.join(zorder_cols)});\n\n"

    return optimize

def generate_row_filter(table_name: str, columns: List[Dict]) -> str:
    """Generate Unity Catalog Row Filter for RLS"""

    # Check if table has user_id or similar column
    user_column = None
    for col in columns:
        if col['name'] in ['user_id', 'created_by', 'owner_id']:
            user_column = col['name']
            break

    if not user_column:
        return ""

    filter_sql = f"-- Row-Level Security for {table_name}\n"
    filter_sql += f"CREATE OR REPLACE FUNCTION siem.{table_name}_row_filter({user_column} STRING)\n"
    filter_sql += "RETURN IF(\n"
    filter_sql += f"  current_user() = {user_column}\n"
    filter_sql += "  OR is_account_group_member('siem_admin')\n"
    filter_sql += "  OR is_account_group_member('siem_analyst'),\n"
    filter_sql += "  TRUE,\n"
    filter_sql += "  FALSE\n"
    filter_sql += ");\n\n"
    filter_sql += f"ALTER TABLE siem.{table_name}\n"
    filter_sql += f"SET ROW FILTER siem.{table_name}_row_filter ON ({user_column});\n\n"

    return filter_sql

def main():
    """Main execution"""
    print("🚀 Starting Databricks Schema Generation from Supabase\n")

    # Connect to Supabase
    print("📊 Connecting to Supabase PostgreSQL...")
    conn = connect_to_supabase()
    print("✅ Connected!\n")

    # Get all tables
    print("📋 Fetching table list...")
    tables = get_all_tables(conn)
    print(f"✅ Found {len(tables)} tables\n")

    # Generate DDL for each table
    output_dir = "databricks_migration/generated_sql"
    os.makedirs(output_dir, exist_ok=True)

    master_ddl = "-- Databricks Delta Lake Schema\n"
    master_ddl += "-- Auto-generated from Supabase PostgreSQL\n\n"
    master_ddl += "-- Create schema\n"
    master_ddl += "CREATE SCHEMA IF NOT EXISTS siem;\n\n"

    master_optimize = "-- Optimization statements\n\n"
    master_rls = "-- Row-Level Security (Unity Catalog Row Filters)\n\n"

    for i, table_name in enumerate(tables, 1):
        print(f"[{i}/{len(tables)}] Processing {table_name}...")

        # Get table metadata
        columns = get_table_columns(conn, table_name)
        primary_keys = get_primary_key(conn, table_name)
        foreign_keys = get_foreign_keys(conn, table_name)

        # Generate DDL
        ddl = generate_create_table_ddl(table_name, columns, primary_keys, foreign_keys)
        master_ddl += ddl

        # Generate optimization
        optimize = generate_optimize_statement(table_name, columns)
        if optimize:
            master_optimize += optimize

        # Generate row filter
        rls = generate_row_filter(table_name, columns)
        if rls:
            master_rls += rls

    # Write to files
    print("\n📝 Writing DDL files...")

    with open(f"{output_dir}/01_create_tables.sql", "w") as f:
        f.write(master_ddl)
    print(f"✅ Created: {output_dir}/01_create_tables.sql")

    with open(f"{output_dir}/02_optimize_tables.sql", "w") as f:
        f.write(master_optimize)
    print(f"✅ Created: {output_dir}/02_optimize_tables.sql")

    with open(f"{output_dir}/03_row_level_security.sql", "w") as f:
        f.write(master_rls)
    print(f"✅ Created: {output_dir}/03_row_level_security.sql")

    # Close connection
    conn.close()

    print(f"\n✨ Schema generation complete!")
    print(f"📊 Generated DDL for {len(tables)} tables")
    print(f"📁 Output directory: {output_dir}/")
    print("\n🎯 Next steps:")
    print("1. Review generated SQL files")
    print("2. Run 01_create_tables.sql in Databricks")
    print("3. Run 02_optimize_tables.sql after data load")
    print("4. Run 03_row_level_security.sql for RLS")

if __name__ == "__main__":
    main()
