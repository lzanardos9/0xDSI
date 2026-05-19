#!/bin/bash
# ──────────────────────────────────────────────────────────────
# 0xDSI Agentic SOC - Databricks Native Deployment Script
# ──────────────────────────────────────────────────────────────
# Prerequisites:
#   1. Databricks CLI installed and authenticated
#   2. Node.js >= 20 installed
#   3. Python >= 3.10 installed
#
# Usage:
#   ./deploy.sh [target]
#   ./deploy.sh production
#   ./deploy.sh dev  (default)
# ──────────────────────────────────────────────────────────────

set -euo pipefail

TARGET="${1:-dev}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "═══════════════════════════════════════════════════════════"
echo "  0xDSI Agentic SOC - Databricks Native Deployment"
echo "  Target: ${TARGET}"
echo "═══════════════════════════════════════════════════════════"
echo ""

# ──────────────────────────────────────────────────────
# Step 1: Build React Frontend
# ──────────────────────────────────────────────────────
echo "[1/5] Building React frontend..."
cd "${SCRIPT_DIR}/app"

if [ ! -d "node_modules" ]; then
    npm install
fi

# Copy source files from main project
if [ ! -d "src" ]; then
    echo "  Copying source from main project..."
    cp -r "${SCRIPT_DIR}/../src" ./src
    cp -r "${SCRIPT_DIR}/../public" ./public
    cp "${SCRIPT_DIR}/../index.html" ./index.html
    cp "${SCRIPT_DIR}/../vite.config.ts" ./vite.config.ts
    cp "${SCRIPT_DIR}/../tailwind.config.js" ./tailwind.config.js
    cp "${SCRIPT_DIR}/../postcss.config.js" ./postcss.config.js
    cp "${SCRIPT_DIR}/../tsconfig.json" ./tsconfig.json
    cp "${SCRIPT_DIR}/../tsconfig.app.json" ./tsconfig.app.json
fi

npm run build
echo "  Frontend built -> app/dist/"
echo ""

# ──────────────────────────────────────────────────────
# Step 2: Validate DAB configuration
# ──────────────────────────────────────────────────────
echo "[2/5] Validating Databricks bundle..."
cd "${SCRIPT_DIR}"
databricks bundle validate -t "${TARGET}"
echo "  Bundle validation passed"
echo ""

# ──────────────────────────────────────────────────────
# Step 3: Deploy bundle (notebooks, jobs, pipelines)
# ──────────────────────────────────────────────────────
echo "[3/5] Deploying bundle to Databricks..."
databricks bundle deploy -t "${TARGET}"
echo "  Bundle deployed successfully"
echo ""

# ──────────────────────────────────────────────────────
# Step 4: Run initial setup (create catalog/schema)
# ──────────────────────────────────────────────────────
echo "[4/5] Running initial catalog setup..."
databricks bundle run initial_setup -t "${TARGET}" --no-wait
echo "  Setup job triggered"
echo ""

# ──────────────────────────────────────────────────────
# Step 5: Deploy the Databricks App
# ──────────────────────────────────────────────────────
echo "[5/5] Deploying Databricks App..."
databricks apps deploy 0xdsi-agentic-soc \
    --source-code-path "/Workspace/Users/$(databricks current-user me | jq -r .userName)/.bundle/0xdsi-agentic-soc/${TARGET}/app"

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  DEPLOYMENT COMPLETE"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "  App URL: Check Databricks workspace > Apps > 0xdsi-agentic-soc"
echo ""
echo "  Next steps:"
echo "    1. Configure SQL Warehouse ID in app environment"
echo "    2. Run the initial_setup job to create tables"
echo "    3. Configure data connectors (Kafka, Event Hub, etc.)"
echo "    4. Start streaming jobs: ingestion, correlation"
echo ""
echo "  Jobs deployed:"
echo "    - [0xDSI] Agent 01 - Raw Event Ingestion (streaming)"
echo "    - [0xDSI] Agent 02 - Enrichment Pipeline (streaming)"
echo "    - [0xDSI] Agent 05 - Streaming Correlation Engine"
echo "    - [0xDSI] Agent 07 - Negative Correlation (every 5 min)"
echo "    - [0xDSI] Agent 10 - Behavioral Anomaly (every 15 min)"
echo "    - [0xDSI] Agent 12 - Threat Intel Matching (streaming)"
echo "    - [0xDSI] Agent 15 - Automated Response (every 2 min)"
echo "    - [0xDSI] Agent 16 - Case Management (every 5 min)"
echo "    - [0xDSI] Agent 20 - ML Model Training (weekly)"
echo ""
echo "  DLT Pipeline: Bronze/Silver/Gold medallion architecture"
echo "═══════════════════════════════════════════════════════════"
