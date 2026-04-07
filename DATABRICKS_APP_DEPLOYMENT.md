# Databricks App Deployment - Step-by-Step Guide
## Deploy Your SOC Intelligence Platform as a Databricks App

**Deployment Time:** 30-45 minutes
**Difficulty:** Intermediate
**Prerequisites:** Databricks workspace with Unity Catalog enabled

---

## 📋 What is a Databricks App?

Databricks Apps is a **managed hosting service** that lets you deploy full-stack applications directly in your Databricks workspace:

- ✅ **Fully managed infrastructure** (no servers to manage)
- ✅ **Integrated with Unity Catalog** (direct SQL access)
- ✅ **Built-in authentication** (Databricks users/groups)
- ✅ **Auto-scaling compute** (scales to zero when idle)
- ✅ **Secure by default** (workspace isolation, RBACs)

---

## 🎯 Deployment Architecture

```
┌──────────────────────────────────────────────────────────┐
│           YOUR APPLICATION (React Frontend)              │
│          Deployed as Databricks App                      │
│          URL: https://workspace.databricks.com/          │
│               apps/soc-intelligence-platform             │
└──────────────────┬───────────────────────────────────────┘
                   │
                   │ SQL Queries
                   ▼
┌──────────────────────────────────────────────────────────┐
│         SQL Warehouse (Serverless + Photon)              │
│         Real-time Query Execution                        │
└──────────────────┬───────────────────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────────────────┐
│              Unity Catalog                               │
│         soc_intelligence (All 221 Tables)                │
│                                                          │
│   ┌─────────┬──────────┬──────────┬────────────────┐   │
│   │ events  │  graph   │  alerts  │  threat_intel  │   │
│   │ (Delta) │ (Delta)  │ (Delta)  │  (Delta)       │   │
│   └─────────┴──────────┴──────────┴────────────────┘   │
└──────────────────┬───────────────────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────────────────┐
│         Spark Streaming Jobs                             │
│         • Graph Correlation Engine                       │
│         • Pattern Discovery                              │
│         • ML Anomaly Detection                           │
└──────────────────────────────────────────────────────────┘
```

---

## 🚀 STEP-BY-STEP DEPLOYMENT

---

### **STEP 1: Install Prerequisites (5 minutes)**

#### Install Databricks CLI
```bash
# Using pip
pip install databricks-cli

# Or using Homebrew (Mac)
brew tap databricks/tap
brew install databricks

# Verify installation
databricks --version
```

#### Install Node.js 20+ (if not installed)
```bash
# Check current version
node --version

# If < 20, install via nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install 20
nvm use 20
```

---

### **STEP 2: Configure Databricks Authentication (3 minutes)**

#### Option A: Interactive Configuration
```bash
databricks configure --token

# You'll be prompted:
# Databricks Host: https://your-workspace.cloud.databricks.com
# Token: dapi...
```

#### Option B: Environment Variables (Recommended for CI/CD)
```bash
# Create .databrickscfg file
cat > ~/.databrickscfg << EOF
[DEFAULT]
host = https://your-workspace.cloud.databricks.com
token = dapi...your-token-here...
EOF

# Or export environment variables
export DATABRICKS_HOST="https://your-workspace.cloud.databricks.com"
export DATABRICKS_TOKEN="dapi...your-token-here..."
```

#### Get Your Personal Access Token:
1. Open Databricks workspace
2. Click on your username (top right)
3. Select **User Settings**
4. Go to **Access Tokens** tab
5. Click **Generate New Token**
6. Give it a name: "SOC App Deployment"
7. Set lifetime: 90 days (or as per your policy)
8. Copy the token (you won't see it again!)

#### Test Connection:
```bash
databricks workspace ls /
# Should list workspace folders without errors
```

---

### **STEP 3: Create Unity Catalog Structure (5 minutes)**

#### Connect to SQL Warehouse
1. Open Databricks workspace
2. Go to **SQL Editor**
3. Select or create a SQL Warehouse

#### Run Catalog Setup SQL:
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

-- Verify
SHOW SCHEMAS IN soc_intelligence;
```

---

### **STEP 4: Build Frontend Application (5 minutes)**

```bash
# Navigate to project directory
cd /path/to/soc-intelligence-platform

# Install dependencies (if not already installed)
npm install

# Build production bundle
npm run build

# Verify build output
ls -lh dist/
# Should see:
#   index.html
#   assets/index-*.js
#   assets/index-*.css
```

#### Expected Build Output:
```
dist/index.html                     0.47 kB
dist/assets/index-BUvwL7wm.css     85.69 kB
dist/assets/index-CoWHIvMr.js   1,857.25 kB
✓ built in 9.05s
```

---

### **STEP 5: Update Configuration Files (3 minutes)**

#### Update `databricks.yml` (if needed)
```yaml
# The file is already configured, but verify these settings:

resources:
  apps:
    soc_intelligence:
      name: soc-intelligence-platform-prod

      resources:
        - name: frontend
          config:
            command: ["npm", "run", "start"]

            env:
              - name: VITE_DATABRICKS_HOST
                value: "{{workspace.host}}"

              - name: VITE_CATALOG
                value: "soc_intelligence"

            compute:
              size: "SMALL"  # Can be SMALL, MEDIUM, LARGE
              auto_stop_minutes: 30
```

#### Update `app.yaml` (already configured)
```yaml
command: ["npm", "start"]

env:
  - name: NODE_ENV
    value: production
```

---

### **STEP 6: Deploy to Databricks (7-10 minutes)**

#### Validate Bundle Configuration
```bash
databricks bundle validate --target prod

# Expected output:
# ✓ Configuration is valid
# ✓ All resources validated
```

#### Deploy Application
```bash
# Deploy to production target
databricks bundle deploy --target prod

# This command will:
# ✓ Upload frontend build artifacts
# ✓ Create SQL Warehouse (if doesn't exist)
# ✓ Create Spark jobs
# ✓ Configure workflows
# ✓ Set up permissions
# ✓ Start the app

# Expected output:
# Uploading artifacts...
# Creating resources...
# ✓ App: soc-intelligence-platform-prod (created)
# ✓ SQL Warehouse: soc-query-warehouse-prod (created)
# ✓ Job: SOC - Streaming Correlation Engine (created)
# ✓ Job: SOC - ETL Processor (created)
# Deployment complete!
```

#### Alternative: Deploy with Specific Settings
```bash
# Deploy to staging first
databricks bundle deploy --target staging

# Deploy to production with force update
databricks bundle deploy --target prod --force
```

---

### **STEP 7: Verify Deployment (2 minutes)**

#### Check App Status
```bash
# List all apps
databricks apps list

# Get specific app details
databricks apps get soc-intelligence-platform-prod

# Expected output:
# Name: soc-intelligence-platform-prod
# Status: RUNNING
# URL: https://your-workspace.cloud.databricks.com/apps/soc-intelligence-platform-prod
# Compute: SMALL (auto-scaling)
```

#### Access Your Application
1. Open your Databricks workspace
2. Go to **Apps** in the left sidebar
3. Click on **soc-intelligence-platform-prod**
4. **OR** directly navigate to:
   ```
   https://your-workspace.cloud.databricks.com/apps/soc-intelligence-platform-prod
   ```

---

### **STEP 8: Migrate Data from Supabase (15-20 minutes)**

#### Option A: Automated Migration (Recommended)
```bash
# Run the complete migration script
python databricks_migration/run_migration.py

# Follow the prompts:
# 1. Generate schema
# 2. Create tables in Databricks
# 3. Migrate data (203 tables → 221 tables with new correlations)
# 4. Optimize tables
# 5. Set up vector search
```

#### Option B: Manual Migration
```bash
# Step 1: Generate Delta Lake schema
python databricks_migration/01_generate_schema.py
# Output: databricks_migration/generated_sql/01_create_tables.sql

# Step 2: Create tables in Databricks SQL Editor
# Copy contents of 01_create_tables.sql and run in SQL Editor

# Step 3: Migrate data
python databricks_migration/02_migrate_data.py
# This will copy all 221 tables from Supabase to Delta Lake

# Step 4: Optimize tables
# Run databricks_migration/generated_sql/02_optimize_tables.sql

# Step 5: Set up vector search
python databricks_migration/04_setup_vector_search.py
```

#### Monitor Migration Progress
```bash
# Check job status
databricks jobs list --limit 10

# Get specific job run
databricks jobs get-run --run-id <RUN_ID>

# View logs
databricks jobs get-run-output --run-id <RUN_ID>
```

---

### **STEP 9: Configure Vector Search (5 minutes)**

#### Create Vector Search Endpoint
```bash
databricks vector-search create-endpoint \
  --name soc-vector-search \
  --endpoint-type STANDARD

# Wait for endpoint to be ready
databricks vector-search get-endpoint --name soc-vector-search
```

#### Create Vector Indexes
```bash
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

---

### **STEP 10: Start Background Jobs (3 minutes)**

#### Start Streaming Correlation Engine
```bash
# Find job ID
databricks jobs list | grep "Streaming Correlation"

# Start job
databricks jobs run-now --job-id <JOB_ID>

# Monitor
databricks jobs get-run --run-id <RUN_ID>
```

#### Start ETL Processor
```bash
databricks jobs run-now --job-name "SOC - ETL Processor (prod)"
```

#### Start Vector Enrichment
```bash
databricks jobs run-now --job-name "SOC - Vector Enrichment (prod)"
```

---

## ✅ VERIFICATION CHECKLIST

### 1. App is Running
```bash
databricks apps get soc-intelligence-platform-prod
# Status should be: RUNNING
```

### 2. Data is Migrated
```sql
-- In Databricks SQL Editor:
USE CATALOG soc_intelligence;

-- Check table counts
SELECT
  'events' as table_name,
  COUNT(*) as row_count
FROM events.events

UNION ALL

SELECT 'alerts', COUNT(*) FROM alerts.alerts
UNION ALL
SELECT 'graph_nodes', COUNT(*) FROM graph.streaming_graph_vertices
UNION ALL
SELECT 'threat_feeds', COUNT(*) FROM threat_intel.threat_feeds;

-- Should return non-zero counts for all tables
```

### 3. Vector Search is Active
```bash
databricks vector-search list-indexes --endpoint-name soc-vector-search
# Should list 2 indexes:
#   - ioc_embeddings_index
#   - event_embeddings_index
```

### 4. Jobs are Running
```bash
databricks jobs list --active-only
# Should show 3+ active jobs:
#   - Streaming Correlation Engine
#   - ETL Processor
#   - Vector Enrichment
```

### 5. App is Accessible
- Navigate to: `https://your-workspace.cloud.databricks.com/apps/soc-intelligence-platform-prod`
- Should see the SOC Intelligence Platform dashboard
- Try logging in with test credentials:
  - Username: `admin@luizalabs.com`
  - Password: `P@ssw0rd123!`

---

## 🎯 POST-DEPLOYMENT TASKS

### Configure Permissions
```sql
-- Grant catalog access to analysts
GRANT USE CATALOG ON CATALOG soc_intelligence TO `analysts`;
GRANT USE SCHEMA ON SCHEMA soc_intelligence.events TO `analysts`;
GRANT SELECT ON SCHEMA soc_intelligence.events TO `analysts`;

-- Grant admin access to SOC team
GRANT ALL PRIVILEGES ON CATALOG soc_intelligence TO `soc_admins`;
```

### Create Monitoring Dashboards
```sql
-- Create real-time metrics view
CREATE OR REPLACE VIEW soc_intelligence.monitoring.platform_health AS
SELECT
  'Events (Last Hour)' as metric,
  COUNT(*) as value
FROM soc_intelligence.events.events
WHERE event_timestamp >= current_timestamp() - INTERVAL 1 HOUR

UNION ALL

SELECT 'Active Alerts', COUNT(*)
FROM soc_intelligence.alerts.alerts
WHERE status = 'open'

UNION ALL

SELECT 'High-Risk Vendors', COUNT(*)
FROM soc_intelligence.supply_chain.vendor_risk_profiles
WHERE risk_tier IN ('critical', 'high');
```

### Set Up Alerts
```sql
-- Create alert for critical security events
CREATE ALERT critical_security_events
  ON SCHEDULE '0 */5 * * * ?'
AS
SELECT
  COUNT(*) as critical_count,
  ARRAY_AGG(event_id) as event_ids
FROM soc_intelligence.events.events
WHERE
  severity = 'critical'
  AND event_timestamp >= current_timestamp() - INTERVAL 5 MINUTES
HAVING COUNT(*) > 0;
```

---

## 🔧 TROUBLESHOOTING

### App Won't Start

**Problem:** App status shows "FAILED" or "ERROR"

**Solution:**
```bash
# Check app logs
databricks apps logs soc-intelligence-platform-prod

# Common issues:
# 1. Port already in use → Restart app
databricks apps restart soc-intelligence-platform-prod

# 2. Missing environment variables → Update app.yaml
databricks bundle deploy --target prod --force

# 3. Build artifacts missing → Rebuild
npm run build
databricks bundle deploy --target prod
```

### Data Migration Stuck

**Problem:** Migration job running for > 30 minutes

**Solution:**
```bash
# Check job progress
databricks jobs get-run --run-id <RUN_ID>

# If stuck, cancel and restart
databricks jobs cancel-run --run-id <RUN_ID>

# Restart with specific table
python databricks_migration/02_migrate_data.py --table events.events
```

### Vector Search Not Working

**Problem:** Semantic search returns no results

**Solution:**
```bash
# Check endpoint status
databricks vector-search get-endpoint --name soc-vector-search
# Status should be: ONLINE

# Check index status
databricks vector-search get-index \
  --index-name soc_intelligence.threat_intel.ioc_embeddings_index
# Status should be: ONLINE

# Manually sync index
databricks vector-search sync-index \
  --index-name soc_intelligence.threat_intel.ioc_embeddings_index

# Wait 2-3 minutes for sync to complete
```

### High Query Latency

**Problem:** Dashboard loads slowly

**Solution:**
```sql
-- Check query history
SELECT
  query_text,
  execution_time / 1000 as seconds,
  warehouse_name
FROM system.query.history
WHERE execution_time > 5000
ORDER BY execution_time DESC
LIMIT 10;

-- Optimize slow tables
OPTIMIZE soc_intelligence.events.events;
OPTIMIZE soc_intelligence.graph.streaming_graph_edges
  ZORDER BY (source_vertex_id, target_vertex_id);

-- Update statistics
ANALYZE TABLE soc_intelligence.events.events COMPUTE STATISTICS;
```

---

## 💰 COST OPTIMIZATION

### Right-Size Your SQL Warehouse
```yaml
# In databricks.yml:
sql_warehouses:
  soc_warehouse:
    cluster_size: "2X-Small"  # Start small, scale up if needed
    enable_serverless_compute: true
    auto_stop_mins: 15  # Aggressive auto-stop
```

### Use Spot Instances for Jobs
```yaml
# In databricks.yml:
aws_attributes:
  first_on_demand: 1
  availability: "SPOT_WITH_FALLBACK"
  spot_bid_price_percent: 100  # 60-90% savings
```

### Enable Auto-Scaling
```yaml
autoscale:
  min_workers: 2
  max_workers: 20  # Scale based on load
```

### Optimize Data Storage
```sql
-- Regularly optimize tables (weekly)
OPTIMIZE soc_intelligence.events.events;
OPTIMIZE soc_intelligence.alerts.alerts;

-- Vacuum old files (monthly)
VACUUM soc_intelligence.events.events RETAIN 168 HOURS;
```

---

## 📊 EXPECTED COSTS (Monthly Estimates)

### Small Deployment (< 10 users)
- SQL Warehouse (2X-Small, 8 hours/day): **$200-300/month**
- Spark Jobs (5 workers, 24/7): **$500-700/month**
- Storage (1TB Delta Lake): **$30/month**
- Vector Search: **$100/month**
- **Total: ~$830-1,130/month**

### Medium Deployment (10-50 users)
- SQL Warehouse (Small, 16 hours/day): **$600-800/month**
- Spark Jobs (10 workers, 24/7): **$1,200-1,500/month**
- Storage (5TB Delta Lake): **$150/month**
- Vector Search: **$300/month**
- **Total: ~$2,250-2,750/month**

### Large Deployment (50+ users)
- SQL Warehouse (Medium, 24/7): **$1,500-2,000/month**
- Spark Jobs (20 workers, 24/7): **$2,500-3,000/month**
- Storage (10TB Delta Lake): **$300/month**
- Vector Search: **$500/month**
- **Total: ~$4,800-5,800/month**

---

## 🎉 SUCCESS!

Your SOC Intelligence Platform is now deployed as a **Databricks App**!

### What You've Accomplished:
✅ Deployed full-stack React app in Databricks workspace
✅ Migrated 221 tables to Unity Catalog with Delta Lake
✅ Set up real-time streaming correlation engine
✅ Configured vector search for threat intelligence
✅ Enabled auto-scaling compute for cost optimization
✅ Integrated with Databricks security & RBAC

### Next Steps:
1. **Customize Dashboards** - Create team-specific views
2. **Add Data Sources** - Connect to your SIEM/EDR/Cloud logs
3. **Train ML Models** - Build custom anomaly detection
4. **Set Up Alerts** - Configure notification channels
5. **Invite Users** - Add analysts and threat hunters

---

## 📚 Additional Resources

- **Databricks Apps Docs**: https://docs.databricks.com/en/dev-tools/databricks-apps/
- **Unity Catalog Guide**: https://docs.databricks.com/en/data-governance/unity-catalog/
- **Vector Search**: https://docs.databricks.com/en/generative-ai/vector-search.html
- **Project Documentation**: See `DATABRICKS_MIGRATION_GUIDE.md`

---

**Questions?** Open an issue or consult the [Complete System Documentation](./COMPLETE_SYSTEM_DOCUMENTATION.md)

**Deployment Complete!** 🚀
