#!/bin/bash
# ──────────────────────────────────────────────────────────────
# 0xDSI Agentic SOC - Databricks Native Deployment Script
# ──────────────────────────────────────────────────────────────
# This script deploys the entire Agentic SOC platform to Databricks.
# It builds the React frontend from the project root, packages
# everything into the databricks-native/app/ folder, then deploys
# using Databricks Asset Bundles (DAB).
#
# Prerequisites:
#   1. Databricks CLI installed and authenticated
#   2. Node.js >= 20 installed
#   3. Python >= 3.10 installed
#
# Usage:
#   ./deploy.sh <target> <warehouse_id>
#   ./deploy.sh production abc123def456
#   ./deploy.sh dev abc123def456
#
# Or with env var:
#   export DATABRICKS_WAREHOUSE_ID=abc123def456
#   ./deploy.sh production
# ──────────────────────────────────────────────────────────────

set -euo pipefail

TARGET="${1:-dev}"
WAREHOUSE_ID="${2:-${DATABRICKS_WAREHOUSE_ID:-}}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

echo "═══════════════════════════════════════════════════════════"
echo "  0xDSI Agentic SOC - Databricks Native Deployment"
echo "  Target: ${TARGET}"
echo "═══════════════════════════════════════════════════════════"
echo ""

# ──────────────────────────────────────────────────────
# Pre-flight: Validate Warehouse ID
# ──────────────────────────────────────────────────────
if [ -z "${WAREHOUSE_ID}" ]; then
    echo "ERROR: Serverless SQL Warehouse ID is required."
    echo ""
    echo "  The app needs a SQL Warehouse to query Unity Catalog tables."
    echo "  Find yours in the Databricks workspace:"
    echo ""
    echo "    SQL Warehouses > (your warehouse) > Connection Details"
    echo "    HTTP Path: /sql/1.0/warehouses/<WAREHOUSE_ID>"
    echo ""
    echo "  Provide it as the second argument or as an env var:"
    echo ""
    echo "    ./deploy.sh ${TARGET} <warehouse_id>"
    echo "    export DATABRICKS_WAREHOUSE_ID=<warehouse_id> && ./deploy.sh ${TARGET}"
    echo ""
    exit 1
fi

echo "  Warehouse: ${WAREHOUSE_ID:0:8}...${WAREHOUSE_ID: -4}"
echo ""

# ──────────────────────────────────────────────────────
# Step 1: Build React Frontend
# ──────────────────────────────────────────────────────
echo "[1/5] Building React frontend..."
cd "${PROJECT_ROOT}"

if [ ! -x "node_modules/.bin/vite" ]; then
    echo "  Installing dependencies..."
    npm install
fi

VITE_DATABRICKS_MODE=true npm run build
echo "  Frontend built -> dist/ (Databricks mode: auth disabled, using SSO headers)"
echo ""

# ──────────────────────────────────────────────────────
# Step 2: Package app for Databricks
# ──────────────────────────────────────────────────────
echo "[2/5] Packaging application for Databricks deployment..."
APP_DIR="${SCRIPT_DIR}/app"

rm -rf "${APP_DIR}/dist"
cp -r "${PROJECT_ROOT}/dist" "${APP_DIR}/dist"

echo "  Packaged dist/ into databricks-native/app/dist/"
echo ""

# ──────────────────────────────────────────────────────
# Step 3: Validate DAB configuration
# ──────────────────────────────────────────────────────
echo "[3/5] Validating Databricks bundle..."
cd "${SCRIPT_DIR}"
databricks bundle validate -t "${TARGET}" --var="warehouse_id=${WAREHOUSE_ID}"
echo "  Bundle validation passed"
echo ""

# ──────────────────────────────────────────────────────
# Step 4: Deploy bundle (notebooks, jobs, pipelines)
# ──────────────────────────────────────────────────────
echo "[4/5] Deploying bundle to Databricks..."
databricks bundle deploy -t "${TARGET}" --var="warehouse_id=${WAREHOUSE_ID}"
echo "  Bundle deployed successfully"
echo ""

# ──────────────────────────────────────────────────────
# Step 5: Run initial setup (create catalog/schema + seed data)
# ──────────────────────────────────────────────────────
echo "[5/5] Running initial catalog setup..."
databricks bundle run initial_setup -t "${TARGET}" --var="warehouse_id=${WAREHOUSE_ID}" --no-wait
echo "  Setup job triggered (creates tables + seeds demo data)"
echo ""

echo "═══════════════════════════════════════════════════════════"
echo "  DEPLOYMENT COMPLETE"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "  App URL: Check Databricks workspace > Apps > 0xdsi-agentic-soc"
echo ""
echo "  Post-deployment steps:"
echo "    1. Wait for initial_setup job to finish (creates 100+ tables)"
echo "    2. Configure data connectors (Kafka, Event Hub, etc.)"
echo "    3. Start streaming jobs from Workflows UI"
echo "    4. Verify app health: <app-url>/api/health"
echo ""
echo "  Deployed components:"
echo "    - Databricks App (React + FastAPI + Genie, workspace SSO)"
echo "    - 55+ Workflow Jobs (43 agents + 10 correlation + 7 detection + ML + ops)"
echo "    - DLT Pipeline (Bronze/Silver/Gold medallion)"
echo "    - 60+ Notebooks (agents, correlation, detection, ML, ingestion, ops, analytics)"
echo "    - 100+ Delta Lake tables in Unity Catalog"
echo "    - Foundation Model endpoints (Llama 3.1 70B + BGE embeddings)"
echo "    - 6-Stage Master Pipeline (Detection → UEO → Fuse → Confluence → Triage → Response)"
echo ""
echo "═══════════════════════════════════════════════════════════"
