# Databricks Apps Migration Guide
## Complete Migration from Supabase to Databricks Platform

This guide provides a complete migration path to deploy the SOC Intelligence Platform as a **Databricks App**, migrating all data including the vector database from Supabase pgvector to Databricks Mosaic AI Vector Search.

---

## 🎯 Migration Overview

### Current Architecture
```
[Frontend: Vite/React] → [Supabase PostgreSQL + pgvector]
                       → [Supabase Edge Functions]
                       → [Supabase Realtime]

[Spark Jobs (External)] → [Databricks Delta Lake]
```

### Target Architecture (Databricks Apps)
```
[Databricks App Frontend] → [Unity Catalog + Delta Lake]
                          → [Mosaic AI Vector Search]
                          → [SQL Warehouses (Serverless)]
                          → [Databricks Workflows]

[Spark Jobs (Native)] → [Delta Live Tables]
                     → [GraphX on Databricks]
```

---

## 📋 Migration Components

| Component | From (Supabase) | To (Databricks) | Migration Method |
|-----------|-----------------|-----------------|------------------|
| **Relational Data** | PostgreSQL tables | Unity Catalog + Delta Lake | JDBC bulk copy + streaming |
| **Vector Data** | pgvector extension | Mosaic AI Vector Search | Export embeddings + reindex |
| **Real-time Events** | Supabase Realtime | Delta Live Tables + Streaming | Delta Change Data Feed |
| **User Auth** | Supabase Auth | Unity Catalog Users + SSO | Keep Supabase OR Databricks OAuth |
| **Edge Functions** | Deno runtime | Databricks SQL + Jobs | Rewrite as SQL/Python |
| **Frontend Hosting** | External (Vercel, etc.) | Databricks Apps | Bundled deployment |
| **File Storage** | Supabase Storage | Unity Catalog Volumes | Copy files to volumes |

---

## 🚀 Phase 1: Unity Catalog Setup

### Step 1.1: Create Catalog Structure

```sql
-- Create main catalog
CREATE CATALOG IF NOT EXISTS soc_intelligence
COMMENT 'SOC Intelligence Platform - Production Deployment';

-- Create schemas
CREATE SCHEMA IF NOT EXISTS soc_intelligence.events
COMMENT 'Security events and raw logs';

CREATE SCHEMA IF NOT EXISTS soc_intelligence.graph
COMMENT 'Graph nodes, edges, and correlations';

CREATE SCHEMA IF NOT EXISTS soc_intelligence.alerts
COMMENT 'Alerts, cases, and incidents';

CREATE SCHEMA IF NOT EXISTS soc_intelligence.threat_intel
COMMENT 'Threat feeds, IOCs, vulnerabilities';

CREATE SCHEMA IF NOT EXISTS soc_intelligence.ml
COMMENT 'Machine learning models and predictions';

CREATE SCHEMA IF NOT EXISTS soc_intelligence.config
COMMENT 'System configuration and metadata';

-- Create volumes for unstructured data
CREATE VOLUME IF NOT EXISTS soc_intelligence.events.raw_logs;
CREATE VOLUME IF NOT EXISTS soc_intelligence.events.pcap_files;
CREATE VOLUME IF NOT EXISTS soc_intelligence.ml.models;
```

### Step 1.2: Configure Access Control

```sql
-- Grant catalog access
GRANT USE CATALOG ON CATALOG soc_intelligence TO `analysts`;
GRANT USE SCHEMA ON SCHEMA soc_intelligence.events TO `analysts`;
GRANT SELECT ON SCHEMA soc_intelligence.events TO `analysts`;

-- Grant admin access
GRANT ALL PRIVILEGES ON CATALOG soc_intelligence TO `soc_admins`;

-- Create service principals for apps
CREATE SERVICE PRINCIPAL IF NOT EXISTS 'soc-frontend-app';
GRANT USE CATALOG ON CATALOG soc_intelligence TO `soc-frontend-app`;
```

---

## 🗄️ Phase 2: Data Migration

### Step 2.1: Migrate Relational Tables

Create a Python notebook in Databricks:

```python
# Databricks notebook: migrate_supabase_to_delta.py

from pyspark.sql import SparkSession
from pyspark.sql.functions import *

# Configuration
SUPABASE_JDBC = "jdbc:postgresql://db.xnhgvsdjtmzqxitpbemy.supabase.co:5432/postgres"
SUPABASE_USER = dbutils.secrets.get(scope="soc", key="supabase_user")
SUPABASE_PASSWORD = dbutils.secrets.get(scope="soc", key="supabase_password")

CATALOG = "soc_intelligence"

# Tables to migrate
TABLES_TO_MIGRATE = {
    # Events and logs
    "events": f"{CATALOG}.events.events",
    "raw_event_buffer": f"{CATALOG}.events.raw_buffer",
    "event_parsers": f"{CATALOG}.config.parsers",

    # Graph data
    "graph_nodes": f"{CATALOG}.graph.nodes",
    "graph_edges": f"{CATALOG}.graph.edges",
    "graph_patterns": f"{CATALOG}.graph.patterns",
    "graph_correlations": f"{CATALOG}.graph.correlations",
    "detected_attack_sequences": f"{CATALOG}.graph.attack_sequences",
    "threat_campaigns": f"{CATALOG}.graph.campaigns",

    # Alerts and cases
    "alerts": f"{CATALOG}.alerts.alerts",
    "cases": f"{CATALOG}.alerts.cases",
    "case_evidence": f"{CATALOG}.alerts.case_evidence",

    # Threat intelligence
    "threat_feeds": f"{CATALOG}.threat_intel.feeds",
    "ioc_embeddings": f"{CATALOG}.threat_intel.ioc_embeddings",
    "vulnerabilities": f"{CATALOG}.threat_intel.vulnerabilities",

    # Configuration
    "correlation_rules": f"{CATALOG}.config.correlation_rules",
    "response_actions": f"{CATALOG}.config.response_actions",
    "enrichment_sources": f"{CATALOG}.config.enrichment_sources",
}

def migrate_table(source_table: str, target_table: str):
    """
    Migrate a single table from Supabase to Unity Catalog
    """
    print(f"Migrating {source_table} → {target_table}")

    # Read from Supabase
    df = spark.read \
        .format("jdbc") \
        .option("url", SUPABASE_JDBC) \
        .option("dbtable", source_table) \
        .option("user", SUPABASE_USER) \
        .option("password", SUPABASE_PASSWORD) \
        .option("driver", "org.postgresql.Driver") \
        .load()

    row_count = df.count()
    print(f"  Read {row_count:,} rows from {source_table}")

    # Write to Unity Catalog as Delta table
    df.write \
        .format("delta") \
        .mode("overwrite") \
        .option("overwriteSchema", "true") \
        .saveAsTable(target_table)

    print(f"  ✓ Wrote {row_count:,} rows to {target_table}")

    # Optimize table
    spark.sql(f"OPTIMIZE {target_table}")
    spark.sql(f"ANALYZE TABLE {target_table} COMPUTE STATISTICS")

    return row_count

# Execute migration
total_rows = 0
for source, target in TABLES_TO_MIGRATE.items():
    try:
        rows = migrate_table(source, target)
        total_rows += rows
    except Exception as e:
        print(f"  ✗ Error migrating {source}: {e}")
        continue

print(f"\n✓ Migration complete: {total_rows:,} total rows migrated")
```

### Step 2.2: Set Up Delta Live Tables for Streaming

Create a Delta Live Tables pipeline:

```python
# DLT Pipeline: real_time_event_ingestion.py

import dlt
from pyspark.sql.functions import *
from pyspark.sql.types import *

@dlt.table(
    name="bronze_raw_events",
    comment="Raw security events from all sources",
    table_properties={
        "quality": "bronze",
        "pipelines.autoOptimize.managed": "true"
    }
)
def bronze_raw_events():
    """
    Ingest raw events from Supabase or direct sources
    """
    return (
        spark.readStream
            .format("cloudFiles")
            .option("cloudFiles.format", "json")
            .option("cloudFiles.schemaLocation",
                    "/Volumes/soc_intelligence/events/schemas/raw")
            .option("cloudFiles.inferColumnTypes", "true")
            .load("/Volumes/soc_intelligence/events/raw_logs")
    )

@dlt.table(
    name="silver_normalized_events",
    comment="OCSF-normalized security events",
    table_properties={
        "quality": "silver",
        "delta.enableChangeDataFeed": "true"
    }
)
@dlt.expect_or_drop("valid_timestamp", "event_timestamp IS NOT NULL")
@dlt.expect_or_drop("valid_severity", "severity IN ('critical', 'high', 'medium', 'low', 'info')")
def silver_normalized_events():
    """
    Parse and normalize events to OCSF format
    """
    return (
        dlt.read_stream("bronze_raw_events")
            .select(
                col("id").alias("event_id"),
                col("timestamp").cast("timestamp").alias("event_timestamp"),
                col("event_type"),
                lower(col("severity")).alias("severity"),
                col("source_ip"),
                col("dest_ip"),
                col("username"),
                col("message").alias("description"),
                from_json(col("metadata"), "map<string,string>").alias("metadata"),
                current_timestamp().alias("processed_at")
            )
    )

@dlt.table(
    name="gold_enriched_events",
    comment="Fully enriched events with threat intel and context",
    table_properties={
        "quality": "gold",
        "delta.enableChangeDataFeed": "true"
    }
)
def gold_enriched_events():
    """
    Enrich events with GeoIP, threat intel, asset context
    """
    events = dlt.read_stream("silver_normalized_events")
    threat_intel = dlt.read("soc_intelligence.threat_intel.feeds")

    return (
        events
            .join(
                broadcast(threat_intel),
                events.source_ip == threat_intel.indicator,
                "left"
            )
            .select(
                events["*"],
                threat_intel.threat_type,
                threat_intel.confidence.alias("threat_confidence"),
                threat_intel.severity.alias("threat_severity"),
                # Add more enrichment fields
                when(threat_intel.indicator.isNotNull(), True)
                    .otherwise(False).alias("is_threat")
            )
    )
```

---

## 🧮 Phase 3: Vector Database Migration (pgvector → Mosaic AI)

### Step 3.1: Export Embeddings from Supabase

```python
# Export embeddings from Supabase pgvector

import psycopg2
import numpy as np
import pandas as pd

# Connect to Supabase
conn = psycopg2.connect(
    host="db.xnhgvsdjtmzqxitpbemy.supabase.co",
    database="postgres",
    user="postgres",
    password=SUPABASE_PASSWORD
)

# Export IOC embeddings
query = """
SELECT
    id,
    indicator,
    indicator_type,
    embedding::text,
    threat_type,
    severity,
    confidence,
    created_at
FROM ioc_embeddings
"""

df = pd.read_sql(query, conn)

# Convert pgvector text format to numpy arrays
def parse_pgvector(vec_str):
    """Parse pgvector format: '[0.1, 0.2, ...]' to numpy array"""
    return np.array([float(x) for x in vec_str.strip('[]').split(',')])

df['embedding_array'] = df['embedding'].apply(parse_pgvector)

# Save to Delta Lake
spark_df = spark.createDataFrame(df.drop('embedding', axis=1))

spark_df.write \
    .format("delta") \
    .mode("overwrite") \
    .saveAsTable("soc_intelligence.threat_intel.ioc_embeddings_staging")

print(f"✓ Exported {len(df):,} embeddings from pgvector")
```

### Step 3.2: Create Mosaic AI Vector Search Index

```python
# Create vector search index in Databricks

from databricks.vector_search.client import VectorSearchClient

# Initialize client
vsc = VectorSearchClient()

# Create vector search endpoint
vsc.create_endpoint(
    name="soc-vector-search",
    endpoint_type="STANDARD"
)

# Create delta sync index for IOC embeddings
vsc.create_delta_sync_index(
    endpoint_name="soc-vector-search",
    index_name="soc_intelligence.threat_intel.ioc_embeddings_index",
    source_table_name="soc_intelligence.threat_intel.ioc_embeddings",
    pipeline_type="TRIGGERED",
    primary_key="id",
    embedding_dimension=1536,  # Adjust based on your model
    embedding_vector_column="embedding_array"
)

print("✓ Vector search index created")

# Create index for event embeddings (for semantic search)
vsc.create_delta_sync_index(
    endpoint_name="soc-vector-search",
    index_name="soc_intelligence.events.event_embeddings_index",
    source_table_name="soc_intelligence.events.events",
    pipeline_type="CONTINUOUS",  # Real-time updates
    primary_key="event_id",
    embedding_dimension=1536,
    embedding_vector_column="event_embedding",
    embedding_source_column="description"  # Auto-generate embeddings
)

print("✓ Event semantic search index created")
```

### Step 3.3: Create Vector Search UDFs

```python
# Create User-Defined Functions for vector search

from pyspark.sql.functions import udf, pandas_udf
from pyspark.sql.types import ArrayType, StructType, StructField, StringType, DoubleType, FloatType
import pandas as pd

@pandas_udf(
    ArrayType(
        StructType([
            StructField("indicator", StringType()),
            StructField("threat_type", StringType()),
            StructField("similarity", DoubleType())
        ])
    )
)
def search_similar_threats(embeddings: pd.Series, num_results: pd.Series) -> pd.Series:
    """
    Search for similar threat indicators using vector similarity
    """
    from databricks.vector_search.client import VectorSearchClient

    vsc = VectorSearchClient()
    index = vsc.get_index(
        endpoint_name="soc-vector-search",
        index_name="soc_intelligence.threat_intel.ioc_embeddings_index"
    )

    results = []
    for embedding, k in zip(embeddings, num_results):
        search_result = index.similarity_search(
            query_vector=embedding.tolist(),
            columns=["indicator", "threat_type"],
            num_results=int(k)
        )

        results.append([
            {
                "indicator": row["indicator"],
                "threat_type": row["threat_type"],
                "similarity": row["score"]
            }
            for row in search_result["result"]["data_array"]
        ])

    return pd.Series(results)

# Register UDF
spark.udf.register("search_similar_threats", search_similar_threats)

# Usage example
"""
SELECT
    event_id,
    description,
    search_similar_threats(event_embedding, 5) as similar_threats
FROM soc_intelligence.events.gold_enriched_events
WHERE is_suspicious = true
"""
```

### Step 3.4: Hybrid Search (Vector + BM25 Full-Text)

```sql
-- Enable full-text search on Delta tables
CREATE TABLE IF NOT EXISTS soc_intelligence.threat_intel.ioc_search
USING DELTA
TBLPROPERTIES (
  'delta.enableFullTextSearch' = 'true'
)
AS SELECT * FROM soc_intelligence.threat_intel.ioc_embeddings;

-- Hybrid search: combine vector similarity with keyword matching
CREATE OR REPLACE FUNCTION hybrid_threat_search(
  query_text STRING,
  query_embedding ARRAY<DOUBLE>,
  vector_weight DOUBLE DEFAULT 0.7,
  limit_results INT DEFAULT 10
)
RETURNS TABLE(
  indicator STRING,
  threat_type STRING,
  similarity_score DOUBLE,
  keyword_score DOUBLE,
  hybrid_score DOUBLE
)
LANGUAGE SQL
RETURN
  WITH vector_results AS (
    SELECT
      indicator,
      threat_type,
      vector_distance(embedding_array, query_embedding) as similarity_score
    FROM soc_intelligence.threat_intel.ioc_embeddings_index
    ORDER BY similarity_score ASC
    LIMIT limit_results * 2
  ),
  keyword_results AS (
    SELECT
      indicator,
      threat_type,
      ts_rank(to_tsvector(indicator || ' ' || description),
              plainto_tsquery(query_text)) as keyword_score
    FROM soc_intelligence.threat_intel.ioc_search
    WHERE to_tsvector(indicator || ' ' || description) @@ plainto_tsquery(query_text)
    ORDER BY keyword_score DESC
    LIMIT limit_results * 2
  )
  SELECT
    COALESCE(v.indicator, k.indicator) as indicator,
    COALESCE(v.threat_type, k.threat_type) as threat_type,
    COALESCE(v.similarity_score, 0.0) as similarity_score,
    COALESCE(k.keyword_score, 0.0) as keyword_score,
    (vector_weight * COALESCE(v.similarity_score, 0.0) +
     (1 - vector_weight) * COALESCE(k.keyword_score, 0.0)) as hybrid_score
  FROM vector_results v
  FULL OUTER JOIN keyword_results k ON v.indicator = k.indicator
  ORDER BY hybrid_score DESC
  LIMIT limit_results;
```

---

## 🎨 Phase 4: Frontend Migration (Databricks Apps)

### Step 4.1: Create Databricks App Configuration

Create `databricks.yml` in project root:

```yaml
# databricks.yml
bundle:
  name: soc-intelligence-platform

variables:
  catalog:
    default: soc_intelligence

resources:
  # App definition
  apps:
    soc_frontend:
      name: soc-intelligence-platform
      description: "Enterprise SIEM with Graph-Based Threat Detection"

      # Frontend app
      resources:
        - name: frontend
          description: "React/TypeScript frontend"
          subdomain: "soc-platform"

          config:
            command: ["npm", "run", "start"]
            env:
              - name: NODE_ENV
                value: "production"
              - name: VITE_DATABRICKS_HOST
                value: "{{workspace.host}}"
              - name: VITE_DATABRICKS_WAREHOUSE_ID
                value: "{{resources.sql_warehouses.soc_warehouse.id}}"
              - name: VITE_CATALOG
                value: "{{variables.catalog}}"

            # Compute configuration
            compute:
              size: "SMALL"
              auto_stop_minutes: 30

      # Add permissions
      permissions:
        - level: CAN_USE
          group_name: "analysts"
        - level: CAN_MANAGE
          group_name: "soc_admins"

  # SQL Warehouse for queries
  sql_warehouses:
    soc_warehouse:
      name: soc-query-warehouse
      cluster_size: "2X-Small"
      enable_serverless_compute: true
      auto_stop_mins: 30
      max_num_clusters: 10

      tags:
        project: "soc-platform"
        environment: "production"

  # Workflows (Spark jobs)
  jobs:
    streaming_correlation:
      name: "SOC - Streaming Correlation Engine"
      job_clusters:
        - job_cluster_key: "spark_cluster"
          new_cluster:
            spark_version: "14.3.x-scala2.12"
            node_type_id: "i3.2xlarge"
            num_workers: 10
            autoscale:
              min_workers: 5
              max_workers: 50
            spark_conf:
              "spark.databricks.delta.optimizeWrite.enabled": "true"
              "spark.databricks.delta.autoCompact.enabled": "true"

      tasks:
        - task_key: "graph_correlation"
          job_cluster_key: "spark_cluster"
          spark_python_task:
            python_file: "backend/spark_streaming_correlation.py"
          libraries:
            - pypi:
                package: "graphframes"

        - task_key: "vector_enrichment"
          job_cluster_key: "spark_cluster"
          depends_on:
            - task_key: "graph_correlation"
          spark_python_task:
            python_file: "backend/vector_enrichment.py"

      schedule:
        quartz_cron_expression: "0 */5 * * * ?"  # Every 5 minutes
        timezone_id: "UTC"

      email_notifications:
        on_failure:
          - "soc-team@company.com"
```

### Step 4.2: Update Frontend Code for Databricks

Create new client library:

```typescript
// src/lib/databricksClient.ts

import { createClient as createSupabaseClient } from '@supabase/supabase-js';

interface DatabricksConfig {
  host: string;
  httpPath: string;
  token?: string;
  catalog: string;
  schema: string;
}

class DatabricksClient {
  private config: DatabricksConfig;
  private supabase: any; // Keep for auth

  constructor(config: DatabricksConfig) {
    this.config = config;

    // Keep Supabase for authentication only
    this.supabase = createSupabaseClient(
      import.meta.env.VITE_SUPABASE_URL || '',
      import.meta.env.VITE_SUPABASE_ANON_KEY || ''
    );
  }

  async executeQuery(sql: string): Promise<any> {
    const response = await fetch(
      `https://${this.config.host}/api/2.0/sql/statements`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${await this.getToken()}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          warehouse_id: import.meta.env.VITE_DATABRICKS_WAREHOUSE_ID,
          statement: sql,
          wait_timeout: '30s',
          on_wait_timeout: 'CONTINUE'
        })
      }
    );

    if (!response.ok) {
      throw new Error(`Query failed: ${response.statusText}`);
    }

    return response.json();
  }

  async getToken(): Promise<string> {
    // Option 1: Use stored token
    if (this.config.token) return this.config.token;

    // Option 2: Exchange Supabase session for Databricks token
    const session = await this.supabase.auth.getSession();
    if (session?.data?.session?.access_token) {
      // Call backend to exchange tokens
      const response = await fetch('/api/exchange-token', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.data.session.access_token}`
        }
      });
      const { databricks_token } = await response.json();
      return databricks_token;
    }

    throw new Error('No valid authentication token');
  }

  // Vector search
  async vectorSearch(
    queryText: string,
    embedding: number[],
    numResults: number = 10
  ): Promise<any> {
    const sql = `
      SELECT * FROM hybrid_threat_search(
        '${queryText.replace(/'/g, "''")}',
        array(${embedding.join(',')}),
        0.7,
        ${numResults}
      )
    `;

    return this.executeQuery(sql);
  }

  // Stream events using Delta Live Tables Change Data Feed
  async subscribeToEvents(callback: (event: any) => void): Promise<void> {
    const sql = `
      SELECT * FROM table_changes(
        'soc_intelligence.events.gold_enriched_events',
        0  -- Start from latest version
      )
      WHERE _change_type IN ('insert', 'update_new')
    `;

    // Poll for changes (or use WebSocket if available)
    setInterval(async () => {
      const result = await this.executeQuery(sql);
      const events = result.result?.data_array || [];
      events.forEach(callback);
    }, 5000); // Every 5 seconds
  }
}

// Export singleton
export const databricks = new DatabricksClient({
  host: import.meta.env.VITE_DATABRICKS_HOST,
  httpPath: import.meta.env.VITE_DATABRICKS_HTTP_PATH,
  catalog: import.meta.env.VITE_CATALOG || 'soc_intelligence',
  schema: import.meta.env.VITE_SCHEMA || 'events'
});
```

### Step 4.3: Update React Components

```typescript
// src/components/EventStream.tsx (updated for Databricks)

import { useEffect, useState } from 'react';
import { databricks } from '../lib/databricksClient';

export function EventStream() {
  const [events, setEvents] = useState<any[]>([]);

  useEffect(() => {
    // Load initial events
    loadEvents();

    // Subscribe to new events
    databricks.subscribeToEvents((event) => {
      setEvents(prev => [event, ...prev].slice(0, 100));
    });
  }, []);

  async function loadEvents() {
    const result = await databricks.executeQuery(`
      SELECT
        event_id,
        event_timestamp,
        event_type,
        severity,
        source_ip,
        dest_ip,
        description,
        is_threat,
        threat_type
      FROM soc_intelligence.events.gold_enriched_events
      ORDER BY event_timestamp DESC
      LIMIT 100
    `);

    setEvents(result.result?.data_array || []);
  }

  async function searchSimilarThreats(eventId: string) {
    const result = await databricks.executeQuery(`
      SELECT
        event_id,
        search_similar_threats(event_embedding, 5) as similar_threats
      FROM soc_intelligence.events.gold_enriched_events
      WHERE event_id = '${eventId}'
    `);

    return result.result?.data_array[0]?.similar_threats || [];
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Live Event Stream</h2>
      {events.map(event => (
        <div key={event.event_id} className="border p-4 rounded">
          <div className="flex justify-between">
            <span className="font-mono text-sm">{event.event_id}</span>
            <span className={`px-2 py-1 rounded text-xs ${
              event.is_threat ? 'bg-red-500' : 'bg-gray-500'
            }`}>
              {event.severity}
            </span>
          </div>
          <p className="mt-2">{event.description}</p>
          <button
            onClick={() => searchSimilarThreats(event.event_id)}
            className="mt-2 text-blue-500 hover:underline text-sm"
          >
            Find Similar Threats (Vector Search)
          </button>
        </div>
      ))}
    </div>
  );
}
```

---

## ⚡ Phase 5: Performance Optimization

### Step 5.1: Enable Liquid Clustering

```sql
-- Convert large tables to use liquid clustering for better query performance
ALTER TABLE soc_intelligence.events.gold_enriched_events
CLUSTER BY (event_timestamp, severity, source_ip);

ALTER TABLE soc_intelligence.graph.edges
CLUSTER BY (source_node_id, target_node_id, edge_type);

-- Auto-optimize on write
ALTER TABLE soc_intelligence.events.gold_enriched_events
SET TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
```

### Step 5.2: Photon Acceleration

```python
# Enable Photon for queries
spark.conf.set("spark.databricks.photon.enabled", "true")

# Use serverless SQL warehouse with Photon enabled (default)
```

### Step 5.3: Predictive I/O

```sql
-- Enable predictive I/O for faster queries
ALTER TABLE soc_intelligence.events.gold_enriched_events
SET TBLPROPERTIES (
  'delta.enablePredictiveIO' = 'true'
);
```

---

## 🚀 Phase 6: Deployment

### Step 6.1: Deploy with Databricks CLI

```bash
# Install Databricks CLI
pip install databricks-cli

# Authenticate
databricks configure --token

# Bundle and validate
databricks bundle validate

# Deploy to development
databricks bundle deploy --target dev

# Deploy to production
databricks bundle deploy --target prod

# Check deployment status
databricks apps list
```

### Step 6.2: CI/CD Pipeline (GitHub Actions)

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to Databricks Apps

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'

      - name: Install dependencies
        run: |
          npm install
          npm run build

      - name: Setup Databricks CLI
        run: pip install databricks-cli

      - name: Deploy to Databricks
        env:
          DATABRICKS_HOST: ${{ secrets.DATABRICKS_HOST }}
          DATABRICKS_TOKEN: ${{ secrets.DATABRICKS_TOKEN }}
        run: |
          databricks bundle deploy --target prod

      - name: Run integration tests
        run: |
          databricks bundle test
```

---

## 📊 Phase 7: Monitoring & Observability

### Step 7.1: System Tables for Monitoring

```sql
-- Monitor app performance
CREATE OR REPLACE VIEW soc_intelligence.monitoring.app_metrics AS
SELECT
  date_trunc('minute', event_time) as minute,
  warehouse_name,
  COUNT(*) as query_count,
  AVG(execution_time) as avg_execution_time_ms,
  SUM(rows_read) as total_rows_read,
  SUM(bytes_read) / 1024 / 1024 as total_mb_read
FROM system.query.history
WHERE workspace_id = current_workspace_id()
  AND catalog_name = 'soc_intelligence'
  AND event_time >= current_timestamp() - INTERVAL 1 HOUR
GROUP BY minute, warehouse_name
ORDER BY minute DESC;

-- Monitor vector search performance
CREATE OR REPLACE VIEW soc_intelligence.monitoring.vector_search_metrics AS
SELECT
  date_trunc('hour', request_timestamp) as hour,
  index_name,
  COUNT(*) as search_count,
  AVG(latency_ms) as avg_latency_ms,
  PERCENTILE(latency_ms, 0.95) as p95_latency_ms
FROM system.vector_search.request_logs
WHERE endpoint_name = 'soc-vector-search'
  AND request_timestamp >= current_timestamp() - INTERVAL 24 HOURS
GROUP BY hour, index_name
ORDER BY hour DESC;
```

### Step 7.2: Alerting Rules

```sql
-- Create alerts for anomalies
CREATE ALERT high_query_latency
  ON SCHEDULE '0 */15 * * * ?'  -- Every 15 minutes
AS
  SELECT
    'High query latency detected' as message,
    avg_execution_time_ms
  FROM soc_intelligence.monitoring.app_metrics
  WHERE minute >= current_timestamp() - INTERVAL 15 MINUTES
    AND avg_execution_time_ms > 5000  -- 5 seconds
  LIMIT 1;
```

---

## 💰 Phase 8: Cost Optimization

### Step 8.1: Use Spot Instances

```python
# Configure clusters to use spot instances (60-90% savings)
cluster_config = {
    "aws_attributes": {
        "first_on_demand": 1,  # First node on-demand for stability
        "availability": "SPOT_WITH_FALLBACK",
        "spot_bid_price_percent": 100
    }
}
```

### Step 8.2: Auto-scaling Configuration

```yaml
# Aggressive auto-scaling for cost savings
autoscale:
  min_workers: 2
  max_workers: 50
  auto_stop_minutes: 15  # Stop when idle
  enable_elastic_disk: true
```

---

## ✅ Migration Checklist

### Pre-Migration
- [ ] Backup all Supabase data
- [ ] Document current data volumes
- [ ] Identify critical tables and workflows
- [ ] Test Databricks workspace access
- [ ] Create Unity Catalog structure

### Data Migration
- [ ] Export relational data from PostgreSQL
- [ ] Export vector embeddings from pgvector
- [ ] Load data into Delta Lake
- [ ] Create vector search indexes
- [ ] Validate row counts and data integrity
- [ ] Set up Delta Live Tables pipelines

### Application Migration
- [ ] Update frontend code for Databricks APIs
- [ ] Migrate Spark jobs to Databricks Workflows
- [ ] Configure Databricks Apps bundle
- [ ] Set up authentication (Supabase or Databricks)
- [ ] Test all API endpoints

### Testing
- [ ] Test vector search queries
- [ ] Verify graph correlation algorithms
- [ ] Load test (100K+ EPS)
- [ ] Test real-time event streaming
- [ ] Validate alert generation
- [ ] Performance benchmarking

### Deployment
- [ ] Deploy to development environment
- [ ] Run integration tests
- [ ] Deploy to production
- [ ] Monitor for errors
- [ ] Validate data pipeline

### Post-Migration
- [ ] Monitor performance metrics
- [ ] Optimize costs (spot instances, auto-scaling)
- [ ] Set up alerting rules
- [ ] Train team on new platform
- [ ] Decommission Supabase (if fully migrated)

---

## 🎯 Migration Timeline

| Phase | Duration | Dependencies |
|-------|----------|--------------|
| **Unity Catalog Setup** | 1 day | Databricks workspace access |
| **Data Migration** | 2-3 days | Data export scripts |
| **Vector Database Migration** | 2 days | Vector search endpoint |
| **Frontend Migration** | 3-4 days | Databricks Apps SDK |
| **Testing** | 3-5 days | All components migrated |
| **Deployment** | 1 day | Testing complete |
| **Monitoring & Optimization** | Ongoing | Post-deployment |

**Total**: 12-18 days for complete migration

---

## 📚 Key Benefits After Migration

✅ **Unified Platform**: Everything in Databricks (no external dependencies)
✅ **Scalability**: Petabyte-scale with Delta Lake
✅ **Performance**: 10-100x faster queries with Photon
✅ **Cost Savings**: 60-90% reduction with spot instances
✅ **Vector Search**: Native Mosaic AI Vector Search (better than pgvector)
✅ **Real-time**: Delta Live Tables + Change Data Feed
✅ **Security**: Unity Catalog fine-grained access control
✅ **Governance**: Built-in data lineage and audit logs
✅ **MLOps**: Native ML lifecycle management

---

## 🔗 Additional Resources

- [Databricks Apps Documentation](https://docs.databricks.com/en/dev-tools/databricks-apps/index.html)
- [Mosaic AI Vector Search](https://docs.databricks.com/en/generative-ai/vector-search.html)
- [Delta Live Tables](https://docs.databricks.com/en/delta-live-tables/index.html)
- [Unity Catalog](https://docs.databricks.com/en/data-governance/unity-catalog/index.html)
- [GraphX Guide](https://spark.apache.org/docs/latest/graphx-programming-guide.html)

---

**Status**: Ready for Migration
**Platform**: Databricks Apps + Unity Catalog + Mosaic AI
**Architecture**: Fully cloud-native, serverless, auto-scaling
