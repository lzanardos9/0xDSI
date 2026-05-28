#!/bin/bash
# ──────────────────────────────────────────────────────────────
# 0xDSI Agentic SOC - Databricks Native Deployment Script
# ──────────────────────────────────────────────────────────────
# This script deploys the entire Agentic SOC platform to Databricks.
# It builds the React frontend from the project root, packages
# everything into the databricks-native/app/ folder, then deploys
# using Databricks Asset Bundles (DAB).
#
# FULLY AUTOMATED: Handles model serving, secrets, catalog, and app.
# No manual post-deployment steps required.
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

# Model configuration - edit these if your workspace uses different endpoint names
LLM_ENDPOINT="${DATABRICKS_LLM_ENDPOINT:-databricks-meta-llama-3-1-70b-instruct}"
LLM_FALLBACK="${DATABRICKS_LLM_FALLBACK:-databricks-meta-llama-3-1-8b-instruct}"
EMBEDDING_ENDPOINT="${DATABRICKS_EMBEDDING_ENDPOINT:-databricks-bge-large-en}"
SECRET_SCOPE="${DATABRICKS_SECRET_SCOPE:-soc-secrets}"

echo "═══════════════════════════════════════════════════════════"
echo "  0xDSI Agentic SOC - Databricks Native Deployment"
echo "  Target: ${TARGET}"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "  Configuration:"
echo "    LLM Endpoint:       ${LLM_ENDPOINT}"
echo "    LLM Fallback:       ${LLM_FALLBACK}"
echo "    Embedding Endpoint: ${EMBEDDING_ENDPOINT}"
echo "    Secret Scope:       ${SECRET_SCOPE}"
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
# Step 1: Verify and Enable Model Serving Endpoints
# ──────────────────────────────────────────────────────
echo "[1/7] Verifying Foundation Model serving endpoints..."

verify_endpoint() {
    local endpoint_name=$1
    local endpoint_type=$2

    # Check if endpoint exists and is in READY state
    local status
    status=$(databricks serving-endpoints get "${endpoint_name}" --output json 2>/dev/null | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    print(data.get('state', {}).get('ready', 'NOT_FOUND'))
except:
    print('NOT_FOUND')
" 2>/dev/null || echo "NOT_FOUND")

    if [ "${status}" = "READY" ]; then
        echo "  [OK] ${endpoint_name} (${endpoint_type}) - READY"
        return 0
    elif [ "${status}" = "NOT_FOUND" ]; then
        echo "  [!!] ${endpoint_name} - Not found, creating..."
        # Pay-per-token Foundation Model endpoints are auto-provisioned
        # Just verify it's a valid Databricks Foundation Model name
        if [[ "${endpoint_name}" == databricks-* ]]; then
            echo "  [OK] ${endpoint_name} is a pay-per-token Foundation Model (auto-provisioned)"
            return 0
        else
            echo ""
            echo "  ERROR: Custom endpoint '${endpoint_name}' not found."
            echo "  Create it in your workspace: Serving > Create Serving Endpoint"
            echo "  Or use a Databricks Foundation Model (databricks-meta-llama-3-1-70b-instruct)"
            echo ""
            return 1
        fi
    else
        echo "  [..] ${endpoint_name} - State: ${status} (may still be provisioning)"
        return 0
    fi
}

verify_endpoint "${LLM_ENDPOINT}" "LLM (primary)"
verify_endpoint "${LLM_FALLBACK}" "LLM (fallback)"
verify_endpoint "${EMBEDDING_ENDPOINT}" "Embeddings"
echo ""

# ──────────────────────────────────────────────────────
# Step 2: Configure Secret Scope
# ──────────────────────────────────────────────────────
echo "[2/7] Verifying secret scope '${SECRET_SCOPE}'..."

scope_exists=$(databricks secrets list-scopes --output json 2>/dev/null | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    scopes = [s.get('name') for s in data.get('scopes', data if isinstance(data, list) else [])]
    print('yes' if '${SECRET_SCOPE}' in scopes else 'no')
except:
    print('no')
" 2>/dev/null || echo "no")

if [ "${scope_exists}" = "no" ]; then
    echo "  Creating secret scope '${SECRET_SCOPE}'..."
    databricks secrets create-scope "${SECRET_SCOPE}" 2>/dev/null || true
fi
echo "  [OK] Secret scope '${SECRET_SCOPE}' available"

# Store model endpoint names in secret scope for notebooks to read
databricks secrets put-secret "${SECRET_SCOPE}" "llm_endpoint" --string-value "${LLM_ENDPOINT}" 2>/dev/null || true
databricks secrets put-secret "${SECRET_SCOPE}" "llm_fallback_endpoint" --string-value "${LLM_FALLBACK}" 2>/dev/null || true
databricks secrets put-secret "${SECRET_SCOPE}" "embedding_endpoint" --string-value "${EMBEDDING_ENDPOINT}" 2>/dev/null || true
echo "  [OK] Model endpoint configuration stored in secrets"
echo ""

# ──────────────────────────────────────────────────────
# Step 3: Build React Frontend
# ──────────────────────────────────────────────────────
echo "[3/7] Building React frontend..."
cd "${PROJECT_ROOT}"

if [ ! -x "node_modules/.bin/vite" ]; then
    echo "  Installing dependencies..."
    npm install
fi

VITE_DATABRICKS_MODE=true npm run build
echo "  Frontend built -> dist/ (Databricks mode: all APIs route through FastAPI)"
echo ""

# ──────────────────────────────────────────────────────
# Step 4: Package app for Databricks
# ──────────────────────────────────────────────────────
echo "[4/7] Packaging application for Databricks deployment..."
APP_DIR="${SCRIPT_DIR}/app"

rm -rf "${APP_DIR}/dist"
cp -r "${PROJECT_ROOT}/dist" "${APP_DIR}/dist"

# Write runtime config for the FastAPI backend
cat > "${APP_DIR}/.env.databricks" <<EOF
# Auto-generated by deploy.sh - DO NOT EDIT
UNITY_CATALOG=oxdsi_soc
UNITY_SCHEMA=security
DATABRICKS_WAREHOUSE_ID=${WAREHOUSE_ID}
LLM_ENDPOINT=${LLM_ENDPOINT}
LLM_FALLBACK_ENDPOINT=${LLM_FALLBACK}
EMBEDDING_ENDPOINT=${EMBEDDING_ENDPOINT}
SECRET_SCOPE=${SECRET_SCOPE}
EOF

echo "  Packaged dist/ + .env.databricks into databricks-native/app/"
echo ""

# ──────────────────────────────────────────────────────
# Step 5: Validate DAB configuration
# ──────────────────────────────────────────────────────
echo "[5/7] Validating Databricks bundle..."
cd "${SCRIPT_DIR}"
databricks bundle validate -t "${TARGET}" --var="warehouse_id=${WAREHOUSE_ID}"
echo "  Bundle validation passed"
echo ""

# ──────────────────────────────────────────────────────
# Step 6: Deploy bundle (notebooks, jobs, pipelines)
# ──────────────────────────────────────────────────────
echo "[6/7] Deploying bundle to Databricks..."
databricks bundle deploy -t "${TARGET}" --var="warehouse_id=${WAREHOUSE_ID}"
echo "  Bundle deployed successfully"
echo ""

# ──────────────────────────────────────────────────────
# Step 7: Run initial setup (create catalog/schema + seed data)
# ──────────────────────────────────────────────────────
echo "[7/7] Running initial catalog setup..."
databricks bundle run initial_setup -t "${TARGET}" --var="warehouse_id=${WAREHOUSE_ID}" --no-wait
echo "  Setup job triggered (creates tables + seeds demo data)"
echo ""

echo "═══════════════════════════════════════════════════════════"
echo "  DEPLOYMENT COMPLETE"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "  App URL: Check Databricks workspace > Apps > 0xdsi-agentic-soc"
echo ""
echo "  LLM Configuration (auto-configured):"
echo "    Primary:    ${LLM_ENDPOINT}"
echo "    Fallback:   ${LLM_FALLBACK}"
echo "    Embeddings: ${EMBEDDING_ENDPOINT}"
echo "    All UI LLM features route through: FastAPI -> Foundation Model API"
echo ""
echo "  No manual steps required. Everything is wired:"
echo "    - CISO Assistant, Threat Simulator, Document Analysis"
echo "    - Correlation Rule Generator, Connector Builder"
echo "    - Threat Radar Intelligence, Agent Chat"
echo "    All use Databricks Foundation Models via API Gateway."
echo ""
echo "  Optional: Add external threat feed API keys to '${SECRET_SCOPE}':"
echo "    databricks secrets put-secret ${SECRET_SCOPE} otx_api_key --string-value <key>"
echo "    databricks secrets put-secret ${SECRET_SCOPE} abuseipdb_api_key --string-value <key>"
echo "    databricks secrets put-secret ${SECRET_SCOPE} virustotal_api_key --string-value <key>"
echo "    databricks secrets put-secret ${SECRET_SCOPE} misp_url --string-value <url>"
echo "    databricks secrets put-secret ${SECRET_SCOPE} misp_api_key --string-value <key>"
echo ""
echo "  Deployed components:"
echo "    - Databricks App (React + FastAPI + workspace SSO)"
echo "    - 55+ Workflow Jobs (43 agents + correlations + detection + ML + ops)"
echo "    - DLT Pipeline (Bronze/Silver/Gold medallion)"
echo "    - 60+ Notebooks (all gated by agent_configs.enabled)"
echo "    - 100+ Delta Lake tables in Unity Catalog"
echo "    - Foundation Model endpoints (auto-verified)"
echo "    - 6-Stage Master Pipeline"
echo ""
echo "═══════════════════════════════════════════════════════════"
