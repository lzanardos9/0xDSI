# Databricks Apps Deployment - Quick Reference Card

## 🚀 One-Command Deployment

```bash
./deploy_to_databricks.sh
```

---

## ⚡ Manual Deployment (3 Commands)

```bash
# 1. Validate
databricks bundle validate --target prod

# 2. Deploy
databricks bundle deploy --target prod

# 3. Access
open https://your-workspace.cloud.databricks.com/apps/soc-intelligence-platform-prod
```

---

## 📊 Check Deployment Status

```bash
# List apps
databricks apps list

# Get app details
databricks apps get soc-intelligence-platform-prod

# View logs
databricks apps logs soc-intelligence-platform-prod

# Restart app
databricks apps restart soc-intelligence-platform-prod
```

---

## 🗄️ Data Migration

```bash
# Upload migration script
databricks workspace import backend/migrate_data.py /Workspace/soc/migrate.py

# Create migration job (paste this JSON)
databricks jobs create --json '{
  "name": "SOC Data Migration",
  "tasks": [{
    "task_key": "migrate",
    "spark_python_task": {"python_file": "/Workspace/soc/migrate.py"},
    "new_cluster": {
      "spark_version": "14.3.x-scala2.12",
      "node_type_id": "i3.xlarge",
      "num_workers": 5
    }
  }]
}'

# Run migration
databricks jobs run-now --job-id <JOB_ID>

# Monitor
databricks jobs get-run --run-id <RUN_ID>
```

---

## 🧮 Vector Search Setup

```bash
# Create endpoint
databricks vector-search create-endpoint \
  --name soc-vector-search \
  --endpoint-type STANDARD

# Create IOC index
databricks vector-search create-index \
  --endpoint-name soc-vector-search \
  --index-name soc_intelligence.threat_intel.ioc_embeddings_index \
  --source-table soc_intelligence.threat_intel.ioc_embeddings \
  --primary-key id \
  --embedding-column embedding_array \
  --embedding-dimension 1536

# Check status
databricks vector-search list-indexes --endpoint-name soc-vector-search
```

---

## 🔍 Verify Deployment (SQL)

```sql
-- Switch to catalog
USE CATALOG soc_intelligence;

-- List schemas
SHOW SCHEMAS;

-- Check table counts
SELECT 'events' as table_name, COUNT(*) as rows FROM events.events
UNION ALL SELECT 'alerts', COUNT(*) FROM alerts.alerts
UNION ALL SELECT 'graph_nodes', COUNT(*) FROM graph.nodes
UNION ALL SELECT 'graph_edges', COUNT(*) FROM graph.edges
UNION ALL SELECT 'threat_feeds', COUNT(*) FROM threat_intel.feeds;

-- Test vector search
SELECT * FROM vector_search(
  'soc-vector-search',
  'soc_intelligence.threat_intel.ioc_embeddings_index',
  array(0.1, 0.2, ...), -- Your embedding vector
  5  -- Number of results
);
```

---

## 📋 Start Streaming Jobs

```bash
# List all jobs
databricks jobs list | grep SOC

# Start correlation engine
databricks jobs run-now --job-name "SOC - Streaming Correlation Engine (prod)"

# Start ETL processor
databricks jobs run-now --job-name "SOC - ETL Processor (prod)"

# Start vector enrichment
databricks jobs run-now --job-name "SOC - Vector Enrichment (prod)"

# Check job status
databricks jobs get-run --run-id <RUN_ID>
```

---

## 🎯 Common Tasks

### Update App
```bash
npm run build
databricks bundle deploy --target prod
```

### View App Logs
```bash
databricks apps logs soc-intelligence-platform-prod --tail
```

### Run SQL Query
```bash
databricks sql execute \
  --warehouse-id <WAREHOUSE_ID> \
  --statement "SELECT COUNT(*) FROM soc_intelligence.events.events"
```

### Optimize Tables
```sql
OPTIMIZE soc_intelligence.events.events;
OPTIMIZE soc_intelligence.graph.edges ZORDER BY (source_node_id, target_node_id);
VACUUM soc_intelligence.events.events RETAIN 168 HOURS;
```

### Export Data
```bash
databricks fs cp \
  dbfs:/path/to/data \
  /local/path \
  --recursive
```

---

## 💰 Cost Optimization

### Enable Spot Instances
Already configured in `databricks.yml`:
```yaml
aws_attributes:
  first_on_demand: 1
  availability: "SPOT_WITH_FALLBACK"
  spot_bid_price_percent: 100
```

### Auto-stop SQL Warehouse
```bash
databricks sql warehouses update <WAREHOUSE_ID> \
  --auto-stop-mins 15
```

### Check Costs
```sql
-- Query system tables for cost analysis
SELECT
  date_trunc('day', usage_date) as day,
  SUM(usage_quantity) as total_dbu,
  SUM(usage_quantity * list_price) as estimated_cost
FROM system.billing.usage
WHERE workspace_id = current_workspace_id()
  AND usage_date >= current_date() - INTERVAL 30 DAYS
GROUP BY day
ORDER BY day DESC;
```

---

## 🔧 Troubleshooting

### App Won't Start
```bash
# Check logs
databricks apps logs soc-intelligence-platform-prod

# Restart
databricks apps restart soc-intelligence-platform-prod

# Re-deploy
databricks bundle deploy --target prod --force
```

### Migration Failed
```bash
# Check job logs
databricks jobs get-run-output --run-id <RUN_ID>

# Re-run specific table
databricks jobs run-now --job-id <JOB_ID> \
  --python-params '["--table", "events"]'
```

### Vector Search Not Working
```bash
# Check endpoint
databricks vector-search list-endpoints

# Check index status
databricks vector-search get-index \
  --index-name soc_intelligence.threat_intel.ioc_embeddings_index

# Force sync
databricks vector-search sync-index \
  --index-name soc_intelligence.threat_intel.ioc_embeddings_index
```

### High Query Latency
```sql
-- Find slow queries
SELECT
  query_text,
  execution_time / 1000 as execution_seconds,
  total_duration_ms / 1000 as total_seconds
FROM system.query.history
WHERE execution_time > 5000
ORDER BY execution_time DESC
LIMIT 20;

-- Optimize slow table
OPTIMIZE soc_intelligence.events.events;
ANALYZE TABLE soc_intelligence.events.events COMPUTE STATISTICS;
```

---

## 📚 Quick Links

| Resource | Link |
|----------|------|
| **Overview** | [DATABRICKS_OVERVIEW.md](./DATABRICKS_OVERVIEW.md) |
| **30-min Deploy** | [DATABRICKS_QUICKSTART.md](./DATABRICKS_QUICKSTART.md) |
| **Full Guide** | [DATABRICKS_MIGRATION_GUIDE.md](./DATABRICKS_MIGRATION_GUIDE.md) |
| **Summary** | [DATABRICKS_DEPLOYMENT_SUMMARY.md](./DATABRICKS_DEPLOYMENT_SUMMARY.md) |
| **Config** | [databricks.yml](./databricks.yml) |
| **Migration Script** | [backend/migrate_data.py](./backend/migrate_data.py) |

---

## 🎯 Key Environment Variables

```bash
# Required
export DATABRICKS_HOST="your-workspace.cloud.databricks.com"
export DATABRICKS_TOKEN="dapi..."

# Optional
export DATABRICKS_CATALOG="soc_intelligence"
export DATABRICKS_ENVIRONMENT="prod"
export VITE_DATABRICKS_WAREHOUSE_ID="abc123"
```

---

## ✅ Health Check Commands

```bash
# 1. Check app is running
databricks apps get soc-intelligence-platform-prod | grep status

# 2. Check data counts
databricks sql execute --warehouse-id <ID> --statement \
  "SELECT COUNT(*) FROM soc_intelligence.events.events"

# 3. Check jobs are running
databricks jobs list-runs --job-name "SOC - Streaming" --limit 5

# 4. Check vector search
databricks vector-search list-indexes --endpoint-name soc-vector-search

# 5. Check costs (last 7 days)
databricks sql execute --warehouse-id <ID> --statement \
  "SELECT SUM(usage_quantity) as total_dbu FROM system.billing.usage \
   WHERE usage_date >= current_date() - 7"
```

---

## 🚨 Emergency Rollback

```bash
# Stop all jobs
databricks jobs reset --job-name "SOC - Streaming Correlation Engine (prod)"
databricks jobs reset --job-name "SOC - ETL Processor (prod)"

# Revert app to previous version
databricks apps revert soc-intelligence-platform-prod --version <PREVIOUS>

# Check status
databricks apps get soc-intelligence-platform-prod
```

---

## 📞 Support

- **Docs**: Start with [DATABRICKS_QUICKSTART.md](./DATABRICKS_QUICKSTART.md)
- **Community**: https://community.databricks.com/
- **Stack Overflow**: Tag `databricks` + `unity-catalog`
- **Official**: https://docs.databricks.com/

---

**Version**: 1.0
**Platform**: Databricks Apps + Unity Catalog + Mosaic AI
**Deployment Time**: 30 minutes
**Status**: Production Ready

---

💡 **Pro Tip**: Bookmark this file for quick reference during deployment and operations!
