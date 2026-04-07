# Databricks Migration - Complete Gap Analysis
## Ensuring 100% Feature Coverage

**Status:** ⚠️ **GAPS IDENTIFIED - COMPREHENSIVE MIGRATION PLAN REQUIRED**

---

## Database Inventory Summary

**Current Supabase Infrastructure:**
- **203 tables** (3,219 columns total)
- **275 JSONB columns** (complex nested data)
- **114 ARRAY columns** (multi-value fields)
- **16 vector columns** (pgvector embeddings - 384 and 1536 dimensions)
- **10+ functions** (triggers, utilities, business logic)
- **13 triggers** (auto-update timestamps, audit logging, counters)
- **100+ indexes** (B-tree, GIN, IVFFLAT vector indexes)
- **813 CREATE statements** across 99 migration files
- **0 materialized views** (good - no pre-computed views to migrate)

---

## Critical Gap Analysis

### ❌ **GAP 1: Database Triggers Not in Migration Scripts**

**Problem:** Triggers provide automatic data maintenance. These are **NOT** mentioned in current migration docs.

**Current Triggers:**
1. `trigger_active_lists_updated_at` - Auto-update `updated_at` on active_lists
2. `trigger_update_alerts_timestamp` - Auto-update alerts timestamps
3. `trigger_update_cases_timestamp` - Auto-update cases timestamps
4. **`trigger_set_case_number`** - **CRITICAL:** Auto-generate case numbers (CASE-2024-0001)
5. `trigger_update_entry_count_insert` - Auto-count session list entries
6. `trigger_update_entry_count_delete` - Maintain accurate entry counts
7. `trigger_session_list_entries_updated_at` - Timestamp management
8. `trigger_session_list_rules_updated_at` - Timestamp management
9. `trigger_session_lists_updated_at` - Timestamp management
10. `trigger_sessions_updated_at` - Timestamp management
11. `user_management_audit_trigger` (INSERT) - **CRITICAL:** Audit user creation
12. `user_management_audit_trigger` (UPDATE) - **CRITICAL:** Audit user changes
13. `user_management_audit_trigger` (DELETE) - **CRITICAL:** Audit user deletion

**Impact:** HIGH - Without these, data integrity breaks

**Databricks Solution:**

#### Option A: Merge-Time Logic (Recommended) ✅
```sql
-- Replace trigger with MERGE statement logic
MERGE INTO siem.session_lists AS target
USING updates AS source
ON target.id = source.id
WHEN MATCHED THEN UPDATE SET
  entry_count = target.entry_count + 1,
  updated_at = current_timestamp()  -- Trigger replacement
;
```

#### Option B: Delta Lake Generated Columns ✅
```sql
-- Auto-maintained columns
CREATE TABLE siem.alerts (
  id STRING,
  title STRING,
  created_at TIMESTAMP DEFAULT current_timestamp(),
  -- Generated column (like trigger)
  updated_at TIMESTAMP GENERATED ALWAYS AS (current_timestamp())
) USING DELTA;
```

#### Option C: Application-Level Logic ⚠️
```typescript
// In application code (less ideal)
await databricks.query(`
  INSERT INTO siem.cases (id, title, case_number, created_at)
  VALUES (?, ?, ?, current_timestamp())
`, [id, title, generateCaseNumber()]);  // App generates case number

function generateCaseNumber(): string {
  const year = new Date().getFullYear();
  const seq = await getNextSequence('case_number', year);
  return `CASE-${year}-${seq.toString().padStart(4, '0')}`;
}
```

**Required Migration Work:**
- [ ] Document all 13 triggers
- [ ] Convert timestamp triggers to DEFAULT expressions
- [ ] Convert case_number trigger to application logic or SQL UDF
- [ ] Convert entry_count triggers to application-side counters
- [ ] Convert audit triggers to Databricks Audit Log or application logging

---

### ❌ **GAP 2: Database Functions Not in Migration Scripts**

**Problem:** PostgreSQL functions provide reusable logic. Must convert to Databricks SQL UDFs or Python UDFs.

**Current Functions:**
1. `update_updated_at_column()` - Trigger helper for timestamps
2. `calculate_processing_latency()` - Calculate milliseconds between timestamps
3. `update_session_list_entry_count()` - Increment/decrement counter
4. `update_session_list_timestamp()` - Update modified time
5. `update_session_timestamp()` - Update session time
6. `update_active_list_timestamp()` - Update list time
7. **`generate_case_number()`** - **CRITICAL:** Generate CASE-YYYY-0001 format
8. `set_case_number()` - Trigger to call generate_case_number()
9. **`hunt_events()`** - **CRITICAL:** Full-text search across raw_security_events
10. `update_cases_updated_at()` - Update case timestamp

**Impact:** HIGH - Business logic embedded in functions

**Databricks Solution:**

#### Convert to SQL UDFs ✅
```sql
-- Replace PostgreSQL function
CREATE OR REPLACE FUNCTION siem.calculate_processing_latency(
  start_time TIMESTAMP,
  end_time TIMESTAMP
)
RETURNS DOUBLE
RETURN (unix_timestamp(end_time) - unix_timestamp(start_time)) * 1000;

-- Usage
SELECT
  id,
  siem.calculate_processing_latency(start_time, end_time) as latency_ms
FROM siem.processing_stats;
```

#### Convert to Python UDFs (for complex logic) ✅
```python
from pyspark.sql.functions import udf
from pyspark.sql.types import StringType
import re

@udf(returnType=StringType())
def generate_case_number():
    from datetime import datetime

    # Get max case number for current year
    year = datetime.now().year
    prefix = f"CASE-{year}-"

    # Query existing cases
    max_num = spark.sql(f"""
        SELECT MAX(CAST(REGEXP_EXTRACT(case_number, '[0-9]+$', 0) AS INT)) as max_seq
        FROM siem.cases
        WHERE case_number LIKE '{prefix}%'
    """).collect()[0]['max_seq']

    next_num = (max_num or 0) + 1
    return f"{prefix}{str(next_num).zfill(4)}"

# Register UDF
spark.udf.register("generate_case_number", generate_case_number)

# Use in SQL
spark.sql("""
    INSERT INTO siem.cases (id, title, case_number, created_at)
    VALUES (uuid(), 'New Case', generate_case_number(), current_timestamp())
""")
```

**Required Migration Work:**
- [ ] Convert 10 PostgreSQL functions to Databricks SQL/Python UDFs
- [ ] Test all function logic in Databricks
- [ ] Update application code to call UDFs
- [ ] Document function catalog

---

### ❌ **GAP 3: Specialized Indexes Not Fully Addressed**

**Problem:** PostgreSQL has specialized index types (GIN for JSONB, IVFFLAT for vectors). Databricks uses different optimization strategies.

**Current Specialized Indexes:**
1. **GIN indexes** on JSONB columns (fast JSON field lookups)
2. **IVFFLAT indexes** on vector columns (approximate nearest neighbor search)
3. **B-tree indexes** on timestamp, status, foreign keys (100+)

**Databricks Solution:**

#### Replace GIN (JSONB) with Z-ORDER ✅
```sql
-- PostgreSQL GIN index
CREATE INDEX idx_events_metadata ON events USING GIN(metadata);

-- Databricks equivalent: Extract + Z-ORDER
-- Step 1: Extract common JSON fields to columns
ALTER TABLE siem.events ADD COLUMN metadata_priority STRING;
UPDATE siem.events
SET metadata_priority = get_json_object(metadata, '$.priority');

-- Step 2: Z-ORDER by extracted column
OPTIMIZE siem.events ZORDER BY (metadata_priority, event_type, severity);

-- Queries run 10-100x faster with Z-ORDER
```

#### Replace IVFFLAT (Vector) with Mosaic AI ✅
```sql
-- PostgreSQL IVFFLAT index
CREATE INDEX idx_stream_vertices_embedding
ON streaming_graph_vertices
USING ivfflat(embedding vector_cosine_ops);

-- Databricks: Mosaic AI Vector Search (better)
from databricks.vector_search.client import VectorSearchClient

vsc = VectorSearchClient()
vsc.create_delta_sync_index(
  endpoint_name="siem_vectors",
  index_name="siem.streaming_vertices_embedding_idx",
  source_table_name="siem.streaming_graph_vertices",
  primary_key="vertex_id",
  embedding_dimension=384,  # Your current dimension
  embedding_vector_column="embedding",
  pipeline_type="CONTINUOUS"  # Auto-sync on Delta table changes
)
```

**Required Migration Work:**
- [ ] Identify all JSONB columns with GIN indexes
- [ ] Extract frequently-queried JSON fields to top-level columns
- [ ] Create Z-ORDER optimization on extracted fields
- [ ] Migrate all 16 vector columns to Mosaic AI Vector Search
- [ ] Test query performance (should be 2-10x faster)

---

### ❌ **GAP 4: Complex Event Processing (CEP) Patterns**

**Problem:** You have a sophisticated CEP system (`cep_patterns`, `cep_pattern_matches`) that runs real-time pattern detection. This is **NOT** addressed in migration docs.

**Current CEP Features:**
- **Streaming graph analysis** (Quine-style temporal graphs)
- **Pattern definitions:** sequence, conjunction, disjunction, negation, temporal
- **Real-time pattern matching** (10-second windows)
- **Pre-defined threat patterns:**
  - `lateral_movement_sequence` (detect APT movement)
  - `privilege_escalation` (detect privilege abuse)
  - `data_exfiltration` (detect data theft)
  - `reconnaissance_scan` (detect network scanning)

**Databricks Solution:**

#### Use Structured Streaming ✅
```python
# notebooks/cep_engine.py
from pyspark.sql.functions import *
from pyspark.sql.types import *

# Read streaming events
events_stream = spark.readStream \
    .format("delta") \
    .table("siem.streaming_graph_edges") \
    .withWatermark("last_event_time", "10 seconds")

# Define pattern: Lateral Movement (>3 connections in 5 min)
lateral_movement = events_stream \
    .filter(col("edge_type") == "lateral_movement") \
    .groupBy(
        window("last_event_time", "5 minutes"),
        "source_vertex_id"
    ) \
    .agg(count("*").alias("connection_count")) \
    .filter(col("connection_count") > 3)

# Write matches to output table
lateral_movement.writeStream \
    .format("delta") \
    .outputMode("append") \
    .option("checkpointLocation", "/mnt/siem/checkpoints/cep_lateral") \
    .table("siem.cep_pattern_matches")
```

#### Use Delta Live Tables for Complex CEP ✅
```sql
-- Delta Live Table for continuous pattern detection
CREATE OR REFRESH STREAMING LIVE TABLE lateral_movement_detected AS
SELECT
  source_vertex_id as user_id,
  COUNT(*) as movement_count,
  COLLECT_LIST(target_vertex_id) as accessed_assets,
  MAX(risk_score) as max_risk,
  window.start as detection_window_start,
  window.end as detection_window_end
FROM STREAM(live.streaming_graph_edges)
WHERE edge_type = 'lateral_movement'
  AND is_suspicious = true
GROUP BY
  source_vertex_id,
  window(last_event_time, '5 minutes')
HAVING COUNT(*) > 3;

-- Alert on pattern match
CREATE OR REFRESH LIVE TABLE cep_alerts AS
SELECT
  uuid() as alert_id,
  'lateral_movement_sequence' as pattern_name,
  user_id,
  movement_count,
  'critical' as severity,
  'Pattern detected: Lateral movement across ' || CAST(movement_count AS STRING) || ' assets' as description,
  current_timestamp() as created_at
FROM live.lateral_movement_detected;
```

**Required Migration Work:**
- [ ] Convert 4 pre-defined CEP patterns to Structured Streaming queries
- [ ] Set up Delta Live Tables pipeline for real-time CEP
- [ ] Migrate `cep_patterns` table (pattern definitions)
- [ ] Migrate `cep_pattern_matches` table (detection results)
- [ ] Test pattern detection accuracy (should match PostgreSQL)
- [ ] Configure alerting on pattern matches

---

### ❌ **GAP 5: Streaming Graph Infrastructure (Quine-style)**

**Problem:** You have a **real-time streaming graph system** with temporal analysis. This is a complex feature **NOT** in migration docs.

**Current Features:**
- `streaming_graph_vertices` - 10-second streaming node updates
- `streaming_graph_edges` - Real-time relationship streaming
- `graph_stream_windows` - Temporal graph snapshots
- `entity_resolution` - Entity deduplication
- **384-dimension embeddings** on vertices (semantic similarity)

**Databricks Solution:**

#### Use GraphFrames + Streaming ✅
```python
from graphframes import GraphFrame
from pyspark.sql.functions import *

# Read streaming vertices and edges
vertices_stream = spark.readStream.format("delta").table("siem.streaming_graph_vertices")
edges_stream = spark.readStream.format("delta").table("siem.streaming_graph_edges")

# Create streaming graph
graph = GraphFrame(vertices_stream, edges_stream)

# Run graph algorithms on streaming data
# Example: Find connected components (threat clusters)
connected_components = graph.connectedComponents()

connected_components.writeStream \
    .format("delta") \
    .outputMode("complete") \
    .option("checkpointLocation", "/mnt/siem/checkpoints/graph_cc") \
    .table("siem.threat_clusters")

# Temporal graph analysis (10-second windows)
windowed_graph = edges_stream \
    .withWatermark("last_event_time", "10 seconds") \
    .groupBy(
        window("last_event_time", "10 seconds"),
        "source_vertex_id",
        "target_vertex_id"
    ) \
    .agg(
        count("*").alias("event_count"),
        avg("confidence_score").alias("avg_confidence"),
        max("is_suspicious").alias("any_suspicious")
    )
```

#### Use Delta Live Tables for Graph Updates ✅
```sql
-- Continuously update graph vertices
CREATE OR REFRESH STREAMING LIVE TABLE graph_vertices AS
SELECT
  vertex_id,
  vertex_type,
  properties,
  labels,
  risk_score,
  first_seen,
  last_updated,
  embedding
FROM STREAM(siem_raw.streaming_graph_vertices_source)
QUALIFY ROW_NUMBER() OVER (
  PARTITION BY vertex_id
  ORDER BY last_updated DESC
) = 1;  -- Keep latest version

-- Entity resolution (dedup similar vertices)
CREATE OR REFRESH LIVE TABLE resolved_entities AS
SELECT
  vertex_id,
  vertex_type,
  -- Find similar entities using vector similarity
  COLLECT_SET(similar_vertex_id) as merged_entity_ids
FROM (
  SELECT
    v1.vertex_id,
    v1.vertex_type,
    v2.vertex_id as similar_vertex_id,
    v2.embedding <-> v1.embedding as distance
  FROM live.graph_vertices v1
  CROSS JOIN live.graph_vertices v2
  WHERE v1.vertex_type = v2.vertex_type
    AND v1.vertex_id != v2.vertex_id
    AND v2.embedding <-> v1.embedding < 0.1  -- Cosine distance threshold
)
GROUP BY vertex_id, vertex_type;
```

**Required Migration Work:**
- [ ] Set up GraphFrames library in Databricks
- [ ] Migrate streaming graph ingestion pipeline
- [ ] Convert temporal graph queries to windowed streaming
- [ ] Implement entity resolution with Mosaic AI Vector Search
- [ ] Test 10-second graph update latency
- [ ] Migrate graph algorithms (connected components, PageRank, etc.)

---

### ❌ **GAP 6: Full-Text Search Implementation**

**Problem:** You have `hunt_events()` function for full-text search across raw_security_events. Also have `lucene_indices`, `lucene_shards`, `lucene_search_cache` tables for custom Lucene implementation.

**Current Implementation:**
```sql
CREATE FUNCTION hunt_events(q text, lim int)
RETURNS SETOF raw_security_events
AS $$
  SELECT * FROM raw_security_events
  WHERE lower(event_summary || ' ' || coalesce(event_type_detected, '') || ' ' || source_system)
    LIKE '%' || lower(q) || '%'
  ORDER BY event_timestamp DESC LIMIT lim;
$$ LANGUAGE SQL;
```

**Databricks Solution:**

#### Option A: Built-in Full-Text Search (DBR 14+) ✅
```sql
-- Enable full-text search on table
ALTER TABLE siem.raw_security_events
SET TBLPROPERTIES ('delta.enableFullTextSearch' = 'true');

-- Create full-text search columns
ALTER TABLE siem.raw_security_events
ADD COLUMN search_text STRING GENERATED ALWAYS AS (
  CONCAT(event_summary, ' ', COALESCE(event_type_detected, ''), ' ', source_system)
);

-- Query with full-text search
SELECT * FROM siem.raw_security_events
WHERE CONTAINS(search_text, 'malware OR ransomware')
ORDER BY event_timestamp DESC
LIMIT 100;
```

#### Option B: Keep Custom Lucene (Your Tables) ✅
```python
# Use your existing lucene_indices, lucene_shards, lucene_search_cache
# Build Lucene indexes in Databricks job

from pyspark.sql.functions import *
import lucene  # PyLucene

def build_lucene_index():
    # Read from Delta
    events = spark.table("siem.raw_security_events")

    # Build Lucene index
    lucene.initVM()
    indexDir = "/mnt/siem/lucene_index"
    # ... Lucene indexing logic ...

    # Store index metadata in lucene_indices table
    spark.sql("""
        INSERT INTO siem.lucene_indices (index_name, index_path, created_at)
        VALUES ('events_index', '/mnt/siem/lucene_index', current_timestamp())
    """)

# Schedule job to rebuild index hourly
```

**Required Migration Work:**
- [ ] Decide: Use Databricks native full-text OR keep custom Lucene
- [ ] If native: Enable full-text search on key tables
- [ ] If custom Lucene: Port indexing logic to Databricks job
- [ ] Migrate `lucene_indices`, `lucene_shards`, `lucene_search_cache` tables
- [ ] Test search performance (should match or exceed PostgreSQL)
- [ ] Create Python UDF for `hunt_events()` equivalent

---

### ❌ **GAP 7: Audit Logging (User Management)**

**Problem:** Triggers automatically log all user management actions to `user_audit_log`. This audit trail is **CRITICAL** for compliance.

**Current Trigger:**
```sql
CREATE TRIGGER user_management_audit_trigger
  AFTER INSERT OR UPDATE OR DELETE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION log_user_management_action();
```

**Databricks Solution:**

#### Option A: Delta Lake Change Data Feed (Recommended) ✅
```sql
-- Enable CDC on user_profiles
ALTER TABLE siem.user_profiles
SET TBLPROPERTIES ('delta.enableChangeDataFeed' = 'true');

-- Read audit trail
SELECT
  _change_type,  -- 'insert', 'update_preimage', 'update_postimage', 'delete'
  _commit_version,
  _commit_timestamp,
  id as user_id,
  email,
  role
FROM table_changes('siem.user_profiles', 0);  -- From version 0 (all changes)

-- Create materialized audit log
CREATE TABLE siem.user_audit_log AS
SELECT
  uuid() as audit_id,
  _change_type as action_type,
  _commit_timestamp as action_timestamp,
  current_user() as performed_by,
  id as user_id,
  email,
  role,
  struct(email, role, ...) as changes
FROM table_changes('siem.user_profiles', 0);
```

#### Option B: Application-Level Audit Logging ⚠️
```typescript
// In application code
async function createUser(email: string, role: string) {
  // Create user
  await databricks.query(`
    INSERT INTO siem.user_profiles (id, email, role, created_at)
    VALUES (?, ?, ?, current_timestamp())
  `, [uuid(), email, role]);

  // Log audit entry
  await databricks.query(`
    INSERT INTO siem.user_audit_log (action_type, user_id, performed_by, changes)
    VALUES ('INSERT', ?, ?, ?)
  `, [userId, currentUser, JSON.stringify({ email, role })]);
}
```

**Required Migration Work:**
- [ ] Enable Change Data Feed on all tables with audit triggers
- [ ] Create materialized audit log views
- [ ] Test audit trail completeness (INSERT, UPDATE, DELETE)
- [ ] Ensure compliance requirements met
- [ ] Document audit log retention policies

---

### ❌ **GAP 8: Auto-Incrementing Entry Counts**

**Problem:** `session_lists.entry_count` is automatically maintained by triggers. Without this, counts become inaccurate.

**Current Trigger:**
```sql
CREATE TRIGGER trigger_update_entry_count_insert
  AFTER INSERT ON session_list_entries
  FOR EACH ROW EXECUTE FUNCTION update_session_list_entry_count();

-- Function increments entry_count on INSERT, decrements on DELETE
```

**Databricks Solution:**

#### Option A: Computed Column (View) ✅
```sql
-- Replace trigger with computed view
CREATE OR REPLACE VIEW siem.session_lists_with_counts AS
SELECT
  sl.*,
  (SELECT COUNT(*) FROM siem.session_list_entries sle
   WHERE sle.session_list_id = sl.id) as entry_count_computed
FROM siem.session_lists sl;

-- Application always queries view instead of base table
```

#### Option B: Periodic Batch Update ✅
```python
# Databricks job runs every 5 minutes
spark.sql("""
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
        updated_at = current_timestamp()
""")
```

#### Option C: Application-Level Increment ⚠️
```typescript
// In application code
async function addSessionListEntry(listId: string, entry: Entry) {
  // Insert entry
  await databricks.query(`
    INSERT INTO siem.session_list_entries (...)
    VALUES (...)
  `);

  // Increment count
  await databricks.query(`
    UPDATE siem.session_lists
    SET entry_count = entry_count + 1, updated_at = current_timestamp()
    WHERE id = ?
  `, [listId]);
}
```

**Required Migration Work:**
- [ ] Decide on counter update strategy (view, batch job, or app logic)
- [ ] Update application code to use views or increment manually
- [ ] Test counter accuracy under concurrent inserts/deletes
- [ ] Monitor performance impact

---

## Complete Migration Checklist (Revised)

### Phase 1: Schema Migration (Week 1-2)
- [ ] Generate Delta Lake DDL for 203 tables ✅
- [ ] Migrate 275 JSONB columns (as STRING) ✅
- [ ] Migrate 114 ARRAY columns ✅
- [ ] Migrate 16 vector columns to ARRAY<DOUBLE> ✅
- [ ] **NEW:** Convert 10 PostgreSQL functions to Databricks UDFs ❌
- [ ] **NEW:** Replace 13 triggers with Delta features or app logic ❌
- [ ] **NEW:** Migrate 100+ indexes (B-tree → Z-ORDER, GIN → extracted columns) ❌
- [ ] Apply Unity Catalog row filters (RLS replacement) ✅

### Phase 2: Advanced Features (Week 2-3)
- [ ] **NEW:** Set up Mosaic AI Vector Search for 16 vector columns ❌
- [ ] **NEW:** Migrate CEP pattern detection (4 patterns) ❌
- [ ] **NEW:** Set up Structured Streaming for graph updates ❌
- [ ] **NEW:** Implement full-text search (native or custom Lucene) ❌
- [ ] **NEW:** Enable Change Data Feed for audit logging ❌
- [ ] **NEW:** Create computed views for auto-incrementing counters ❌

### Phase 3: Data Migration (Week 3-4)
- [ ] Export all 203 tables from Supabase ✅
- [ ] Upload to cloud storage ✅
- [ ] Load into Delta Lake ✅
- [ ] Validate data integrity ✅
- [ ] **NEW:** Rebuild Lucene indexes (if keeping custom search) ❌
- [ ] **NEW:** Initialize vector search indexes ❌

### Phase 4: Application Code (Week 4-5)
- [ ] Create Databricks SQL client wrapper ✅
- [ ] Replace Supabase imports (48 files) ✅
- [ ] **NEW:** Update code to call Databricks UDFs instead of PostgreSQL functions ❌
- [ ] **NEW:** Add application-level counter management (if needed) ❌
- [ ] **NEW:** Add audit logging calls (if not using CDC) ❌
- [ ] Replace real-time with polling/SSE ✅

### Phase 5: Testing (Week 5-6)
- [ ] Test all 203 tables (CRUD operations) ✅
- [ ] **NEW:** Test all 10 UDFs work correctly ❌
- [ ] **NEW:** Test CEP pattern detection accuracy ❌
- [ ] **NEW:** Test graph streaming (10-second latency) ❌
- [ ] **NEW:** Test full-text search performance ❌
- [ ] **NEW:** Test audit logging completeness ❌
- [ ] Test authentication flows ✅
- [ ] Test real-time features (polling) ✅
- [ ] Load testing (1000 QPS) ✅

### Phase 6: Production Deployment (Week 6-8)
- [ ] Deploy all Databricks jobs (CEP, counters, indexing) ❌
- [ ] Set up monitoring and alerts ✅
- [ ] Train users ✅
- [ ] Go live ✅
- [ ] Monitor for 1 week ✅
- [ ] Decommission Supabase ✅

---

## Revised Timeline

**Original Estimate:** 6-8 weeks
**Revised Estimate:** **10-12 weeks** (due to additional features)

**Breakdown:**
- Weeks 1-2: Schema + basic tables (original)
- **Weeks 3-4: Advanced features (NEW)** - triggers, functions, CEP, graphs
- Weeks 5-6: Data migration + validation
- Weeks 7-8: Application code updates
- Weeks 9-10: Comprehensive testing
- Weeks 11-12: Production deployment + monitoring

---

## Risk Assessment (Updated)

### Original Risks
- Technical: LOW → **MEDIUM** (more complex features than originally scoped)
- Performance: LOW ✅ (Databricks still scales better)
- Cost: LOW ✅ (still 3-4x cheaper)
- Timeline: MEDIUM → **HIGH** (4 additional weeks needed)

### New Risks Identified
1. **CEP Pattern Accuracy:** Must ensure Structured Streaming matches PostgreSQL pattern detection (Mitigation: Extensive testing)
2. **Graph Streaming Latency:** Must maintain 10-second update windows (Mitigation: Use Delta Live Tables)
3. **Audit Log Completeness:** CDC must capture all changes (Mitigation: Enable CDC early, validate)
4. **Counter Accuracy:** Entry counts must stay accurate (Mitigation: Use computed views)
5. **Full-Text Search Performance:** Must match or exceed PostgreSQL (Mitigation: Benchmark both options)

---

## Updated Recommendation

### ✅ **STILL APPROVED - BUT MORE COMPLEX THAN INITIALLY ASSESSED**

**What We Missed:**
1. 13 database triggers (automatic data maintenance)
2. 10 PostgreSQL functions (business logic)
3. Complex Event Processing engine (real-time pattern detection)
4. Streaming graph infrastructure (Quine-style temporal graphs)
5. Custom Lucene search implementation
6. Audit logging automation

**What This Means:**
- **Migration is still feasible** but requires **10-12 weeks** (not 6-8)
- **More Databricks expertise needed** (Structured Streaming, Delta Live Tables, GraphFrames)
- **Additional testing required** (CEP accuracy, graph streaming, audit completeness)

**Updated Migration Complexity:**
- **Tables & Data:** EASY (85% automated)
- **Application Code:** MEDIUM (need UDF calls, counter management)
- **Advanced Features:** **HARD** (CEP, streaming graphs, triggers)

### Final Verdict

**For Demo:** ✅ Keep Supabase (all features work out-of-the-box)

**For Production:** ✅ Migrate to Databricks **BUT**:
1. Budget **10-12 weeks** (not 6-8)
2. Need **Databricks engineer** with Streaming/DLT experience
3. **Phase the migration:**
   - Phase 1: Tables, data, basic queries (6 weeks)
   - Phase 2: Advanced features (CEP, graphs, search) (6 weeks)
   - Total: 12 weeks

**The migration scripts ARE missing critical features. This updated analysis provides the complete picture.**

---

## Next Steps

1. **Review this gap analysis** with engineering team
2. **Assess if 10-12 week timeline is acceptable**
3. **Identify Databricks engineer** with Structured Streaming experience
4. **Create detailed migration plan** for each advanced feature
5. **Prototype CEP and graph streaming** in Databricks (2-week spike)
6. **Re-estimate timeline** after prototype

**All features CAN be migrated, but the effort is 50% higher than originally estimated.**
