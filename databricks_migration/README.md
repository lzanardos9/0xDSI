# Databricks Migration Scripts
## Auto-Generate Complete Migration from Supabase to Databricks

This directory contains **automated scripts** to migrate your entire SIEM platform from Supabase to Databricks Delta Lake.

---

## 📊 What These Scripts Do

### ✅ **Automated Scripts**
1. **`01_generate_schema.py`** - Auto-generate Delta Lake DDL from PostgreSQL schema (203 tables)
2. **`02_migrate_data.py`** - Copy all data from Supabase to Delta Lake in batches
3. **`03_convert_triggers_functions.py`** - Convert PostgreSQL functions to Databricks UDFs
4. **`04_setup_vector_search.py`** - Set up Mosaic AI Vector Search for embeddings
5. **`05_migrate_cep_patterns.py`** - Create Delta Live Tables for threat detection
6. **`run_migration.py`** - Master orchestrator (runs all steps)

### 📋 **Generated Files**
- `generated_sql/01_create_tables.sql` - Delta Lake CREATE TABLE statements
- `generated_sql/02_optimize_tables.sql` - OPTIMIZE and Z-ORDER commands
- `generated_sql/03_row_level_security.sql` - Unity Catalog row filters
- `dlt/cep_pipeline.sql` - Delta Live Tables for CEP
- `examples/usage_examples.sql` - How to use converted features

---

## 🚀 Quick Start

### Prerequisites

1. **Install Dependencies**
```bash
pip install -r requirements.txt
```

Required packages:
- `psycopg2-binary` - PostgreSQL adapter
- `databricks-sql-connector` - Databricks SQL
- `databricks-sdk` - Databricks Python SDK
- `python-dotenv` - Environment variables

2. **Set Environment Variables**

Create `.env` file:
```bash
# Supabase PostgreSQL
SUPABASE_DB_HOST=db.YOUR_PROJECT.supabase.co
SUPABASE_DB_PORT=5432
SUPABASE_DB_NAME=postgres
SUPABASE_DB_USER=postgres
SUPABASE_DB_PASSWORD=your_password

# Databricks
DATABRICKS_HOST=your-workspace.cloud.databricks.com
DATABRICKS_TOKEN=your_access_token
DATABRICKS_HTTP_PATH=/sql/1.0/warehouses/abc123
```

3. **Create Databricks SQL Warehouse**
- Open Databricks UI → SQL Warehouses → Create
- Copy HTTP Path to `.env`

---

## 🎯 Option 1: Automated Migration (Recommended)

Run the master orchestrator:

```bash
python databricks_migration/run_migration.py
```

This will:
1. ✅ Check prerequisites
2. ✅ Generate Delta Lake schema (203 tables)
3. ⏸️  Prompt to create tables in Databricks
4. ✅ Migrate all data (batched, with progress)
5. ⏸️  Prompt to run OPTIMIZE
6. ✅ Convert triggers and functions to UDFs
7. ✅ Set up vector search (optional)
8. ✅ Migrate CEP patterns (optional)
9. ⏸️  Prompt to apply row-level security
10. ✅ Generate migration report

**Estimated time:** 2-4 hours (depending on data size)

---

## 🔧 Option 2: Manual Step-by-Step

### Step 1: Generate Schema (5 minutes)

```bash
python databricks_migration/01_generate_schema.py
```

**Output:**
- `generated_sql/01_create_tables.sql` (CREATE TABLE for 203 tables)
- `generated_sql/02_optimize_tables.sql` (OPTIMIZE + Z-ORDER)
- `generated_sql/03_row_level_security.sql` (Unity Catalog row filters)

### Step 2: Create Tables in Databricks (10 minutes)

1. Open Databricks SQL Editor
2. Run `generated_sql/01_create_tables.sql`
3. Verify all 203 tables created:
```sql
SHOW TABLES IN siem;
```

### Step 3: Migrate Data (30-60 minutes)

```bash
python databricks_migration/02_migrate_data.py
```

This will:
- Export data from Supabase in 10K row batches
- Insert into Delta Lake tables
- Verify row counts match
- Display progress and speed

### Step 4: Optimize Tables (15 minutes)

Run in Databricks SQL Editor:
```bash
generated_sql/02_optimize_tables.sql
```

This improves query performance 10-100x.

### Step 5: Convert Triggers & Functions (5 minutes)

```bash
python databricks_migration/03_convert_triggers_functions.py
```

**Creates:**
- `siem.calculate_processing_latency()` UDF
- `siem.generate_case_number()` UDF
- `siem.hunt_events()` table function
- `siem.session_lists_with_counts` view (replaces trigger)
- `siem.user_audit_log` view (Change Data Feed)

**See:** `examples/usage_examples.sql` for how to use

### Step 6: Set up Vector Search (10 minutes, optional)

```bash
python databricks_migration/04_setup_vector_search.py
```

**Creates:**
- Mosaic AI Vector Search endpoint
- Indexes for 4 tables with embeddings:
  - `streaming_graph_vertices` (384D)
  - `code_pattern_analysis` (1536D)
  - `dark_web_intelligence` (1536D)
  - `ioc_embeddings` (1536D)

**See:** `examples/vector_search_examples.py`

### Step 7: Migrate CEP Patterns (5 minutes, optional)

```bash
python databricks_migration/05_migrate_cep_patterns.py
```

**Creates:**
- `dlt/cep_pipeline.sql` (Delta Live Tables)
- 4 threat detection patterns:
  - Lateral movement
  - Privilege escalation
  - Data exfiltration
  - Reconnaissance scanning

**Deploy:**
1. Workflows → Delta Live Tables → Create Pipeline
2. Upload `dlt/cep_pipeline.sql`
3. Use `dlt/cep_pipeline_config.json` for settings

### Step 8: Apply Row-Level Security (10 minutes)

Run in Databricks SQL Editor:
```bash
generated_sql/03_row_level_security.sql
```

**Test:**
```sql
-- As admin
SELECT * FROM siem.user_profiles;  -- Sees all rows

-- As analyst
SELECT * FROM siem.user_profiles;  -- Sees only own rows
```

### Step 9: Verify Migration (30 minutes)

**Row count verification:**
```sql
-- PostgreSQL
SELECT 'alerts' as table_name, COUNT(*) FROM alerts
UNION ALL
SELECT 'events', COUNT(*) FROM events
...;

-- Databricks
SELECT 'alerts' as table_name, COUNT(*) FROM siem.alerts
UNION ALL
SELECT 'events', COUNT(*) FROM siem.events
...;
```

**Query testing:**
```sql
-- Test JSONB queries
SELECT * FROM siem.alerts
WHERE get_json_object(metadata, '$.priority') = 'urgent';

-- Test vector search
SELECT * FROM siem.streaming_graph_vertices
ORDER BY embedding <-> array(...)
LIMIT 10;

-- Test UDFs
SELECT siem.generate_case_number();
SELECT * FROM siem.hunt_events('ransomware', 100);
```

---

## 📁 Generated Directory Structure

```
databricks_migration/
├── 01_generate_schema.py          # Schema generator
├── 02_migrate_data.py              # Data migration
├── 03_convert_triggers_functions.py # UDF converter
├── 04_setup_vector_search.py      # Vector index setup
├── 05_migrate_cep_patterns.py     # CEP migration
├── run_migration.py                # Master orchestrator
├── README.md                       # This file
│
├── generated_sql/                  # Auto-generated SQL
│   ├── 01_create_tables.sql       # 203 CREATE TABLE statements
│   ├── 02_optimize_tables.sql     # OPTIMIZE + Z-ORDER
│   └── 03_row_level_security.sql  # Unity Catalog row filters
│
├── dlt/                            # Delta Live Tables
│   ├── cep_pipeline.sql           # CEP pattern detection
│   ├── cep_pipeline_config.json   # DLT configuration
│   └── cep_structured_streaming.py # Alternative (Structured Streaming)
│
├── jobs/                           # Databricks Jobs
│   └── counter_sync.sql           # Periodic counter updates (optional)
│
└── examples/                       # Usage examples
    ├── usage_examples.sql         # How to use UDFs and views
    └── vector_search_examples.py  # Vector search queries
```

---

## 🔍 What Each Script Generates

### 01_generate_schema.py

**Reads from Supabase:**
- 203 table definitions
- 3,219 columns
- Primary keys
- Foreign keys
- Indexes
- Data types (including JSONB, arrays, vectors)

**Generates:**
```sql
-- Example output
CREATE TABLE IF NOT EXISTS siem.alerts (
  id STRING NOT NULL,
  title STRING NOT NULL,
  severity STRING CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  status STRING DEFAULT 'new',
  metadata STRING COMMENT 'JSON - use from_json()',
  tags STRING COMMENT 'JSON array',
  created_at TIMESTAMP DEFAULT current_timestamp(),
  PRIMARY KEY (id)
) USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true',
  'delta.enableChangeDataFeed' = 'true'
);

-- Optimization
OPTIMIZE siem.alerts ZORDER BY (severity, status, created_at);

-- Row-Level Security
CREATE FUNCTION siem.alerts_row_filter(assigned_user STRING)
RETURN IF(
  current_user() = assigned_user OR is_account_group_member('siem_admin'),
  TRUE,
  FALSE
);

ALTER TABLE siem.alerts
SET ROW FILTER siem.alerts_row_filter ON (assigned_user);
```

### 02_migrate_data.py

**Process:**
1. Connect to both Supabase and Databricks
2. For each table:
   - Query row count
   - Export in 10K row batches
   - Convert PostgreSQL types to Databricks types
   - Insert batch into Delta Lake
   - Display progress (rows/sec, % complete)
3. Verify row counts match
4. Generate summary report

**Output:**
```
📦 Migrating alerts...
   Total rows: 125,450
   [20.0%] 25,090/125,450 rows (3.2s, 7,840 rows/sec)
   [40.0%] 50,180/125,450 rows (3.1s, 8,090 rows/sec)
   ...
   ✅ Completed in 42.3s (2,967 rows/sec)
   ✅ Verification passed: 125,450 rows
```

### 03_convert_triggers_functions.py

**Converts:**
- 13 PostgreSQL triggers → Delta features
- 10 PostgreSQL functions → Databricks UDFs

**Example Conversions:**

**Trigger (auto-update timestamp):**
```sql
-- PostgreSQL
CREATE TRIGGER trigger_update_alerts_timestamp
  BEFORE UPDATE ON alerts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Databricks (use DEFAULT or MERGE)
CREATE TABLE siem.alerts (
  ...
  updated_at TIMESTAMP DEFAULT current_timestamp()
);

-- Or in MERGE:
MERGE INTO siem.alerts AS target
USING updates AS source
ON target.id = source.id
WHEN MATCHED THEN UPDATE SET
  ...,
  updated_at = current_timestamp();
```

**Function (case number generation):**
```sql
-- PostgreSQL
CREATE FUNCTION generate_case_number() RETURNS text AS $$
  -- Complex PL/pgSQL logic
$$ LANGUAGE plpgsql;

-- Databricks UDF (same functionality)
CREATE FUNCTION siem.generate_case_number()
RETURNS STRING
RETURN concat(
  'CASE-',
  year(current_timestamp()),
  '-',
  lpad(cast((SELECT COALESCE(MAX(...), 0) + 1 FROM siem.cases) AS STRING), 4, '0')
);

-- Usage (same as PostgreSQL)
INSERT INTO siem.cases (case_number, ...)
VALUES (siem.generate_case_number(), ...);
```

### 04_setup_vector_search.py

**Creates Mosaic AI indexes:**

```python
from databricks.vector_search.client import VectorSearchClient

vsc = VectorSearchClient()

# Create endpoint
vsc.create_endpoint(
    name="siem_vector_search",
    endpoint_type="STANDARD"
)

# Create index for each vector column
vsc.create_delta_sync_index(
    endpoint_name="siem_vector_search",
    index_name="siem.streaming_graph_vertices_vector_index",
    source_table_name="siem.streaming_graph_vertices",
    pipeline_type="CONTINUOUS",  # Auto-sync on table changes
    primary_key="vertex_id",
    embedding_dimension=384,
    embedding_vector_column="embedding"
)

# Query similar vectors
results = vsc.similarity_search(
    index_name="siem.streaming_graph_vertices_vector_index",
    query_vector=[0.1, 0.2, ...],  # 384D vector
    columns=["vertex_id", "vertex_type", "properties", "risk_score"],
    num_results=10
)
```

### 05_migrate_cep_patterns.py

**Generates Delta Live Tables SQL:**

```sql
-- Lateral Movement Detection
CREATE OR REFRESH STREAMING LIVE TABLE lateral_movement_detected AS
SELECT
    source_vertex_id as user_id,
    COUNT(*) as movement_count,
    COLLECT_LIST(target_vertex_id) as accessed_assets,
    window.start as window_start,
    window.end as window_end,
    'lateral_movement_sequence' as pattern_name,
    'high' as severity
FROM STREAM(live.streaming_graph_edges)
WHERE edge_type = 'lateral_movement'
    AND is_suspicious = true
GROUP BY
    source_vertex_id,
    window(last_event_time, '5 minutes')
HAVING COUNT(*) >= 3;

-- Alert Generation
CREATE OR REFRESH STREAMING LIVE TABLE cep_alerts AS
SELECT
    uuid() as alert_id,
    pattern_name,
    severity,
    user_id,
    concat('Lateral Movement: User accessed ', CAST(movement_count AS STRING), ' assets') as description,
    current_timestamp() as created_at
FROM live.lateral_movement_detected;
```

---

## ⚠️ Common Issues & Solutions

### Issue: Connection timeout
**Solution:**
```python
# Increase timeout in .env
DATABRICKS_TIMEOUT=300
```

### Issue: Large JSONB columns slow
**Solution:**
```sql
-- Extract common fields to top-level columns
ALTER TABLE siem.events ADD COLUMN event_type_extracted STRING;
UPDATE siem.events SET event_type_extracted = get_json_object(raw_data, '$.event_type');
OPTIMIZE siem.events ZORDER BY (event_type_extracted);
```

### Issue: Row counts don't match
**Solution:**
```python
# Re-run migration for specific table
python -c "
from databricks_migration.02_migrate_data import migrate_table
# migrate_table(pg_conn, db_conn, 'alerts')
"
```

---

## 📊 Performance Optimization

### After Migration:

1. **Run OPTIMIZE regularly**
```sql
-- Weekly maintenance job
OPTIMIZE siem.events ZORDER BY (event_timestamp, severity, user_id);
OPTIMIZE siem.alerts ZORDER BY (created_at, severity, status);
```

2. **Enable Auto Optimize** (already set in generated DDL)
```sql
ALTER TABLE siem.events
SET TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
```

3. **Use Liquid Clustering** (DBR 13.3+)
```sql
ALTER TABLE siem.events CLUSTER BY (event_timestamp, severity, user_id);
```

4. **Vacuum old files** (after 7 days)
```sql
VACUUM siem.events RETAIN 168 HOURS;  -- 7 days
```

---

## 🎯 Next Steps After Migration

1. **Update Application Code**
   - Replace Supabase client with Databricks SQL client
   - Update 48 component files
   - Replace real-time subscriptions with polling

2. **Testing**
   - Run full application test suite
   - Load test (1000 QPS)
   - Verify all features work

3. **Monitoring**
   - Set up Databricks SQL analytics
   - Create alerts for slow queries
   - Monitor data freshness

4. **Training**
   - Train team on Databricks features
   - Share usage_examples.sql
   - Document new patterns

5. **Decommission Supabase**
   - After 1 week of successful production
   - Export final backup
   - Cancel Supabase subscription

---

## ✨ That's It!

You now have **complete, automated scripts** to migrate from Supabase to Databricks.

**Questions?** See `DATABRICKS_MIGRATION_GAP_ANALYSIS.md` for detailed feature mapping.

**Issues?** Check generated `examples/` directory for usage patterns.

**Good luck! 🚀**
