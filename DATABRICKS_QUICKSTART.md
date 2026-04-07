# Databricks Apps Quick Start Guide
## Deploy SOC Intelligence Platform in 30 Minutes

This quick start guide will get you up and running with the SOC Intelligence Platform on Databricks Apps.

---

## Prerequisites

- **Databricks Workspace** (AWS, Azure, or GCP)
- **Unity Catalog** enabled
- **Databricks CLI** installed: `pip install databricks-cli`
- **Node.js 20+** and npm
- **Python 3.9+**
- **Access tokens** for Databricks workspace

---

## 🚀 5-Step Deployment

### Step 1: Configure Databricks CLI (2 minutes)

```bash
# Install Databricks CLI
pip install databricks-cli

# Configure authentication
databricks configure --token

# Enter your workspace URL: https://your-workspace.cloud.databricks.com
# Enter your personal access token: dapi...

# Test connection
databricks workspace ls /
```

### Step 2: Set Environment Variables (1 minute)

```bash
# Create .env file
cat > .env << EOF
# Databricks Configuration
DATABRICKS_HOST=your-workspace.cloud.databricks.com
DATABRICKS_TOKEN=your-personal-access-token

# Deployment Configuration
DATABRICKS_CATALOG=soc_intelligence
DATABRICKS_ENVIRONMENT=prod

# Optional: Keep Supabase for authentication
SUPABASE_URL=https://xnhgvsdjtmzqxitpbemy.supabase.co
SUPABASE_ANON_KEY=your-anon-key
EOF

# Export environment variables
export $(cat .env | xargs)
```

### Step 3: Build Frontend (3 minutes)

```bash
# Install dependencies
npm install

# Build production bundle
npm run build

# Verify build
ls -lh dist/
```

### Step 4: Deploy to Databricks (5 minutes)

```bash
# Validate bundle configuration
databricks bundle validate --target prod

# Deploy application
databricks bundle deploy --target prod

# This will:
# - Upload frontend files
# - Create Unity Catalog structure
# - Deploy SQL Warehouse
# - Create Spark jobs
# - Set up workflows
```

### Step 5: Migrate Data (15-20 minutes)

```bash
# Run data migration script
databricks workspace import backend/migrate_data.py /Workspace/soc-platform/migrate_data.py

# Execute migration
databricks jobs create --json '{
  "name": "SOC Data Migration",
  "tasks": [{
    "task_key": "migrate",
    "spark_python_task": {
      "python_file": "/Workspace/soc-platform/migrate_data.py"
    },
    "new_cluster": {
      "spark_version": "14.3.x-scala2.12",
      "node_type_id": "i3.xlarge",
      "num_workers": 5
    }
  }]
}'

# Start migration job
databricks jobs run-now --job-id <JOB_ID>

# Monitor progress
databricks jobs get-run --run-id <RUN_ID>
```

---

## 🔍 Verify Deployment

### Check App Status

```bash
# List deployed apps
databricks apps list

# Get app details
databricks apps get soc-intelligence-platform-prod
```

### Access Your App

Navigate to:
```
https://your-workspace.cloud.databricks.com/apps/soc-intelligence-platform-prod
```

### Check Data Migration

```sql
-- Connect to SQL Warehouse and run:
USE CATALOG soc_intelligence;

-- Verify schemas
SHOW SCHEMAS;

-- Check table counts
SELECT 'events' as table_name, COUNT(*) as row_count FROM events.events
UNION ALL
SELECT 'alerts', COUNT(*) FROM alerts.alerts
UNION ALL
SELECT 'graph_nodes', COUNT(*) FROM graph.nodes
UNION ALL
SELECT 'graph_edges', COUNT(*) FROM graph.edges
UNION ALL
SELECT 'threat_feeds', COUNT(*) FROM threat_intel.feeds;
```

---

## 🎯 Post-Deployment Tasks

### 1. Create Vector Search Indexes (5 minutes)

```bash
# Create vector search endpoint
databricks vector-search create-endpoint \
  --name soc-vector-search \
  --endpoint-type STANDARD

# Create IOC embeddings index
databricks vector-search create-index \
  --endpoint-name soc-vector-search \
  --index-name soc_intelligence.threat_intel.ioc_embeddings_index \
  --source-table soc_intelligence.threat_intel.ioc_embeddings \
  --primary-key id \
  --embedding-column embedding_array \
  --embedding-dimension 1536

# Create event embeddings index
databricks vector-search create-index \
  --endpoint-name soc-vector-search \
  --index-name soc_intelligence.events.event_embeddings_index \
  --source-table soc_intelligence.events.events \
  --primary-key event_id \
  --embedding-source-column description \
  --embedding-dimension 1536
```

### 2. Start Streaming Jobs (2 minutes)

```bash
# Start correlation engine
databricks jobs run-now --job-name "SOC - Streaming Correlation Engine (prod)"

# Start ETL processor
databricks jobs run-now --job-name "SOC - ETL Processor (prod)"

# Start vector enrichment
databricks jobs run-now --job-name "SOC - Vector Enrichment (prod)"
```

### 3. Enable Delta Live Tables (3 minutes)

```bash
# Start DLT pipeline
databricks pipelines start --pipeline-id <PIPELINE_ID>

# Monitor pipeline
databricks pipelines get --pipeline-id <PIPELINE_ID>
```

### 4. Configure Monitoring (5 minutes)

```sql
-- Create monitoring dashboard
CREATE OR REPLACE VIEW soc_intelligence.monitoring.platform_health AS
SELECT
  'Events Processed (Last Hour)' as metric,
  COUNT(*) as value,
  current_timestamp() as measured_at
FROM soc_intelligence.events.events
WHERE event_timestamp >= current_timestamp() - INTERVAL 1 HOUR

UNION ALL

SELECT
  'Active Alerts',
  COUNT(*),
  current_timestamp()
FROM soc_intelligence.alerts.alerts
WHERE status = 'open'

UNION ALL

SELECT
  'Graph Nodes',
  COUNT(*),
  current_timestamp()
FROM soc_intelligence.graph.nodes

UNION ALL

SELECT
  'Graph Edges',
  COUNT(*),
  current_timestamp()
FROM soc_intelligence.graph.edges;

-- Create alert for high error rate
CREATE ALERT high_processing_errors
  ON SCHEDULE '0 */15 * * * ?'
AS
  SELECT
    COUNT(*) as error_count
  FROM soc_intelligence.config.processing_stats
  WHERE stat_timestamp >= current_timestamp() - INTERVAL 15 MINUTES
    AND error_count > 100
  HAVING COUNT(*) > 0;
```

---

## 📊 Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│           Databricks Apps Frontend (React)              │
│              https://workspace/apps/soc                 │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│           SQL Warehouse (Serverless + Photon)           │
│              Query Execution & Real-time API            │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│        Unity Catalog (soc_intelligence)                 │
│  ┌──────────┬──────────┬────────────┬─────────────┐    │
│  │ events   │ graph    │ alerts     │ threat_intel│    │
│  │ (Delta)  │ (Delta)  │ (Delta)    │ (Delta)     │    │
│  └──────────┴──────────┴────────────┴─────────────┘    │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│         Spark Streaming Jobs (Auto-scaling)             │
│  ┌──────────────────────────────────────────────────┐   │
│  │ • Graph Correlation (GraphX)                     │   │
│  │ • Pattern Discovery (Motif Finding)              │   │
│  │ • ML Anomaly Detection (MLlib)                   │   │
│  │ • ETL Processing (Delta Live Tables)             │   │
│  └──────────────────────────────────────────────────┘   │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│      Mosaic AI Vector Search (Managed Service)          │
│              Semantic Threat Intelligence               │
└─────────────────────────────────────────────────────────┘
```

---

## 💰 Cost Optimization Tips

### Use Spot Instances (60-90% savings)
```yaml
# In databricks.yml
aws_attributes:
  first_on_demand: 1
  availability: "SPOT_WITH_FALLBACK"
  spot_bid_price_percent: 100
```

### Enable Serverless SQL Warehouse
```yaml
sql_warehouses:
  soc_warehouse:
    enable_serverless_compute: true
    cluster_size: "2X-Small"
    auto_stop_mins: 15  # Stop when idle
```

### Optimize Table Storage
```sql
-- Regularly optimize tables
OPTIMIZE soc_intelligence.events.events;
OPTIMIZE soc_intelligence.graph.edges ZORDER BY (source_node_id, target_node_id);

-- Vacuum old files
VACUUM soc_intelligence.events.events RETAIN 168 HOURS;
```

### Use Auto-scaling
```yaml
autoscale:
  min_workers: 2
  max_workers: 50
  enable_elastic_disk: true
```

---

## 🔧 Troubleshooting

### App won't start
```bash
# Check logs
databricks apps logs soc-intelligence-platform-prod

# Restart app
databricks apps restart soc-intelligence-platform-prod
```

### Data migration failed
```bash
# Check job logs
databricks jobs get-run-output --run-id <RUN_ID>

# Re-run migration for specific table
databricks jobs run-now --job-id <JOB_ID> --python-params '["--table", "events"]'
```

### Vector search not working
```bash
# Check endpoint status
databricks vector-search list-endpoints

# Check index sync status
databricks vector-search get-index \
  --index-name soc_intelligence.threat_intel.ioc_embeddings_index

# Manually sync index
databricks vector-search sync-index \
  --index-name soc_intelligence.threat_intel.ioc_embeddings_index
```

### High query latency
```sql
-- Check query history
SELECT
  query_text,
  execution_time / 1000 as execution_seconds,
  total_duration_ms / 1000 as total_seconds,
  warehouse_name
FROM system.query.history
WHERE execution_time > 5000
ORDER BY execution_time DESC
LIMIT 20;

-- Optimize slow tables
OPTIMIZE soc_intelligence.events.events;
ANALYZE TABLE soc_intelligence.events.events COMPUTE STATISTICS;
```

---

## 🎓 Next Steps

1. **Explore Data**: Navigate to Data Explorer and browse `soc_intelligence` catalog
2. **Create Dashboards**: Use Databricks SQL to create monitoring dashboards
3. **Set Up Alerts**: Configure alerting for critical security events
4. **Customize Correlation Rules**: Add custom patterns to detect specific threats
5. **Train ML Models**: Use MLflow to train custom anomaly detection models

---

## 📚 Additional Resources

- [Full Migration Guide](./DATABRICKS_MIGRATION_GUIDE.md) - Complete step-by-step migration
- [Graph Correlation Architecture](./GRAPH_CORRELATION_ARCHITECTURE.md) - Technical deep dive
- [Databricks Apps Documentation](https://docs.databricks.com/en/dev-tools/databricks-apps/)
- [Unity Catalog Guide](https://docs.databricks.com/en/data-governance/unity-catalog/)
- [Mosaic AI Vector Search](https://docs.databricks.com/en/generative-ai/vector-search.html)

---

## ✅ Success Checklist

- [ ] Databricks CLI configured
- [ ] Frontend built successfully
- [ ] Bundle deployed to Databricks
- [ ] Data migrated from Supabase
- [ ] Vector search indexes created
- [ ] Streaming jobs running
- [ ] Delta Live Tables pipeline active
- [ ] Monitoring dashboard configured
- [ ] App accessible via browser
- [ ] Test queries returning data

---

**Deployment Time**: ~30 minutes
**Status**: Production Ready
**Platform**: Databricks Apps + Unity Catalog + Mosaic AI

🎉 **Congratulations!** Your SOC Intelligence Platform is now running on Databricks!
