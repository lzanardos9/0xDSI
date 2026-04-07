#!/usr/bin/env python3
"""
Convert PostgreSQL Triggers and Functions to Databricks equivalents
- Triggers → Delta Lake features or UDFs
- Functions → SQL UDFs or Python UDFs
"""

import os
from databricks import sql
from dotenv import load_dotenv

load_dotenv()

def connect_to_databricks():
    """Connect to Databricks"""
    return sql.connect(
        server_hostname=os.getenv('DATABRICKS_HOST'),
        http_path=os.getenv('DATABRICKS_HTTP_PATH'),
        access_token=os.getenv('DATABRICKS_TOKEN')
    )

# PostgreSQL Functions → Databricks UDFs
FUNCTION_CONVERSIONS = {
    'calculate_processing_latency': '''
CREATE OR REPLACE FUNCTION siem.calculate_processing_latency(
    start_time TIMESTAMP,
    end_time TIMESTAMP
)
RETURNS DOUBLE
RETURN (unix_timestamp(end_time) - unix_timestamp(start_time)) * 1000;
''',

    'generate_case_number': '''
CREATE OR REPLACE FUNCTION siem.generate_case_number()
RETURNS STRING
RETURN concat(
    'CASE-',
    year(current_timestamp()),
    '-',
    lpad(
        cast(
            (SELECT COALESCE(MAX(
                cast(regexp_extract(case_number, '[0-9]+$', 0) AS INT)
            ), 0) + 1
            FROM siem.cases
            WHERE case_number LIKE concat('CASE-', year(current_timestamp()), '-%'))
            AS STRING
        ),
        4,
        '0'
    )
);
''',

    'hunt_events': '''
CREATE OR REPLACE FUNCTION siem.hunt_events(query STRING, max_results INT)
RETURNS TABLE (
    id BIGINT,
    event_summary STRING,
    event_type_detected STRING,
    source_system STRING,
    event_timestamp TIMESTAMP
)
RETURN (
    SELECT
        id,
        event_summary,
        event_type_detected,
        source_system,
        event_timestamp
    FROM siem.raw_security_events
    WHERE lower(concat(
        event_summary, ' ',
        COALESCE(event_type_detected, ''), ' ',
        source_system
    )) LIKE concat('%', lower(query), '%')
    ORDER BY event_timestamp DESC
    LIMIT max_results
);
'''
}

# Trigger Replacements
TRIGGER_REPLACEMENTS = '''
-- ============================================================
-- TRIGGER REPLACEMENTS
-- ============================================================
-- PostgreSQL triggers are replaced with:
-- 1. DEFAULT expressions for timestamps
-- 2. Delta Lake Change Data Feed for audit logging
-- 3. Computed views for counters
-- 4. Application logic for complex operations
-- ============================================================

-- 1. Auto-update timestamps (replace triggers)
-- Already handled in CREATE TABLE with DEFAULT current_timestamp()

-- 2. Case number generation (replace trigger)
-- USE: Call siem.generate_case_number() in INSERT
-- Example:
-- INSERT INTO siem.cases (id, title, case_number, created_at)
-- VALUES (uuid(), 'New Case', siem.generate_case_number(), current_timestamp());

-- 3. Session list entry counts (replace trigger)
-- Create computed view instead of maintaining counter
CREATE OR REPLACE VIEW siem.session_lists_with_counts AS
SELECT
    sl.*,
    (SELECT COUNT(*)
     FROM siem.session_list_entries sle
     WHERE sle.session_list_id = sl.id) as entry_count_computed
FROM siem.session_lists sl;

-- 4. User audit logging (replace trigger)
-- Enable Change Data Feed on user_profiles
ALTER TABLE siem.user_profiles
SET TBLPROPERTIES ('delta.enableChangeDataFeed' = 'true');

-- Create audit log view from CDC
CREATE OR REPLACE VIEW siem.user_audit_log AS
SELECT
    _change_type as action_type,
    _commit_version as version,
    _commit_timestamp as action_timestamp,
    id as user_id,
    email,
    role,
    struct(email, role, full_name, status) as user_data
FROM table_changes('siem.user_profiles', 0);

-- 5. Alert timestamp updates (replace trigger)
-- Use MERGE with auto-timestamp
-- Example:
-- MERGE INTO siem.alerts AS target
-- USING updates AS source
-- ON target.id = source.id
-- WHEN MATCHED THEN UPDATE SET
--   title = source.title,
--   updated_at = current_timestamp();
'''

# Batch job for counter synchronization
COUNTER_SYNC_JOB = '''
-- ============================================================
-- PERIODIC COUNTER SYNCHRONIZATION (Optional)
-- ============================================================
-- Run this as a Databricks Job every 5 minutes if you need
-- materialized entry_count column (instead of view)
-- ============================================================

MERGE INTO siem.session_lists AS target
USING (
    SELECT
        session_list_id,
        COUNT(*) as actual_count
    FROM siem.session_list_entries
    GROUP BY session_list_id
) AS source
ON target.id = source.session_list_id
WHEN MATCHED THEN UPDATE SET
    entry_count = source.actual_count,
    updated_at = current_timestamp();

MERGE INTO siem.active_lists AS target
USING (
    SELECT
        list_id,
        COUNT(*) as actual_count
    FROM siem.active_list_entries
    GROUP BY list_id
) AS source
ON target.id = source.list_id
WHEN MATCHED THEN UPDATE SET
    entry_count = source.actual_count,
    updated_at = current_timestamp();
'''

def create_functions(conn):
    """Create all UDFs in Databricks"""
    print("🔧 Creating Databricks UDFs...\n")

    cursor = conn.cursor()

    for func_name, sql in FUNCTION_CONVERSIONS.items():
        print(f"   Creating function: {func_name}")
        try:
            cursor.execute(sql)
            print(f"   ✅ Success\n")
        except Exception as e:
            print(f"   ❌ Error: {e}\n")

    cursor.close()

def create_trigger_replacements(conn):
    """Create trigger replacement views and configurations"""
    print("🔄 Creating trigger replacements...\n")

    cursor = conn.cursor()

    # Split and execute each statement
    statements = [s.strip() for s in TRIGGER_REPLACEMENTS.split(';') if s.strip()]

    for stmt in statements:
        if stmt.startswith('--') or not stmt:
            continue

        print(f"   Executing: {stmt[:60]}...")
        try:
            cursor.execute(stmt)
            print(f"   ✅ Success\n")
        except Exception as e:
            print(f"   ⚠️  Warning: {e}\n")

    cursor.close()

def save_counter_sync_job():
    """Save counter sync job to file"""
    print("💾 Saving counter sync job...\n")

    output_file = "databricks_migration/jobs/counter_sync.sql"
    os.makedirs(os.path.dirname(output_file), exist_ok=True)

    with open(output_file, 'w') as f:
        f.write(COUNTER_SYNC_JOB)

    print(f"   ✅ Saved to: {output_file}\n")
    print("   📝 Schedule this as a Databricks Job (every 5 minutes)\n")

def create_usage_examples():
    """Generate usage examples for converted functions"""
    examples = '''
-- ============================================================
-- USAGE EXAMPLES - PostgreSQL to Databricks Migration
-- ============================================================

-- 1. Creating a new case (with auto-generated case number)
-- PostgreSQL (automatic via trigger):
--   INSERT INTO cases (title, description) VALUES ('Security Incident', 'Details...');
--
-- Databricks (call UDF):
INSERT INTO siem.cases (id, title, description, case_number, created_at)
VALUES (
    uuid(),
    'Security Incident',
    'Details...',
    siem.generate_case_number(),  -- Call UDF
    current_timestamp()
);

-- 2. Calculating processing latency
-- PostgreSQL:
--   SELECT calculate_processing_latency(start_time, end_time) FROM jobs;
--
-- Databricks (same):
SELECT siem.calculate_processing_latency(start_time, end_time) as latency_ms
FROM siem.processing_jobs;

-- 3. Searching events (full-text)
-- PostgreSQL:
--   SELECT * FROM hunt_events('malware', 100);
--
-- Databricks:
SELECT * FROM siem.hunt_events('malware', 100);

-- 4. Getting session list with entry count
-- PostgreSQL (counter maintained by trigger):
--   SELECT id, name, entry_count FROM session_lists;
--
-- Databricks (use view):
SELECT id, name, entry_count_computed as entry_count
FROM siem.session_lists_with_counts;

-- 5. Querying user audit log
-- PostgreSQL (populated by trigger):
--   SELECT * FROM user_audit_log WHERE user_id = '123';
--
-- Databricks (use CDC view):
SELECT * FROM siem.user_audit_log
WHERE user_id = '123'
ORDER BY action_timestamp DESC;

-- 6. Updating alert with auto-timestamp
-- PostgreSQL (automatic via trigger):
--   UPDATE alerts SET status = 'resolved' WHERE id = '123';
--
-- Databricks (explicit or use MERGE):
UPDATE siem.alerts
SET status = 'resolved', updated_at = current_timestamp()
WHERE id = '123';

-- Or use MERGE:
MERGE INTO siem.alerts AS target
USING (SELECT '123' as id, 'resolved' as status) AS source
ON target.id = source.id
WHEN MATCHED THEN UPDATE SET
    status = source.status,
    updated_at = current_timestamp();
'''

    output_file = "databricks_migration/examples/usage_examples.sql"
    os.makedirs(os.path.dirname(output_file), exist_ok=True)

    with open(output_file, 'w') as f:
        f.write(examples)

    print(f"📚 Created usage examples: {output_file}\n")

def main():
    """Main execution"""
    print("🚀 Converting PostgreSQL Triggers and Functions to Databricks\n")

    # Connect to Databricks
    print("📊 Connecting to Databricks...")
    conn = connect_to_databricks()
    print("✅ Connected!\n")

    # Create UDFs
    create_functions(conn)

    # Create trigger replacements
    create_trigger_replacements(conn)

    # Save counter sync job
    save_counter_sync_job()

    # Create usage examples
    create_usage_examples()

    # Close connection
    conn.close()

    print("="*60)
    print("✨ Conversion complete!")
    print("="*60)
    print("\n📊 Summary:")
    print(f"   ✅ Created {len(FUNCTION_CONVERSIONS)} UDFs")
    print("   ✅ Created trigger replacement views")
    print("   ✅ Generated counter sync job")
    print("   ✅ Generated usage examples")
    print("\n🎯 Next steps:")
    print("1. Review generated UDFs in Databricks")
    print("2. Test each function with sample data")
    print("3. Update application code to call UDFs")
    print("4. Schedule counter_sync.sql as Databricks Job")
    print("5. Train team on new patterns (see usage_examples.sql)")

if __name__ == "__main__":
    main()
