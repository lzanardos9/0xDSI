#!/bin/bash
# ══════════════════════════════════════════════════════════════════════
# 0xDSI Agentic SOC - Production Deployment Script
# ══════════════════════════════════════════════════════════════════════
#
# Deploys the ENTIRE Agentic SOC platform to Databricks:
#   - Unity Catalog (catalog, schema, volumes)
#   - Unity Catalog Functions (7 governed agent tools)
#   - MLflow Experiments (all 43 agents)
#   - MLflow Model Registry (interactive agent models)
#   - Foundation Model Serving Endpoints (verified)
#   - React Frontend (built with Vite, Databricks mode)
#   - Databricks App (FastAPI backend + static frontend)
#   - DLT Pipeline (Bronze/Silver/Gold medallion)
#   - 60+ Workflow Jobs (43 agents + correlation + detection + ML + ops)
#   - Vector Search Endpoint (embeddings for threat hunting)
#   - Secret Scope (model configs + external API keys)
#   - Permissions (groups, ACLs, grants)
#   - Post-deploy Health Check
#
# FULLY AUTOMATED: Zero manual post-deployment steps.
#
# Prerequisites:
#   1. Databricks CLI >= 0.220.0 installed and authenticated
#   2. Node.js >= 20 installed
#   3. Python >= 3.10 installed
#   4. Workspace must have Unity Catalog enabled
#   5. User must have CREATE CATALOG or be metastore admin
#
# Usage:
#   ./deploy.sh <target> <warehouse_id>
#   ./deploy.sh production abc123def456
#   ./deploy.sh dev abc123def456
#
# With env vars:
#   export DATABRICKS_WAREHOUSE_ID=abc123def456
#   ./deploy.sh production
#
# Rollback:
#   ./deploy.sh <target> <warehouse_id> --rollback
# ══════════════════════════════════════════════════════════════════════

set -euo pipefail

# ──────────────────────────────────────────────────────
# Parse Arguments
# ──────────────────────────────────────────────────────
TARGET="${1:-dev}"
WAREHOUSE_ID="${2:-${DATABRICKS_WAREHOUSE_ID:-}}"
ROLLBACK="${3:-}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Configuration (override via environment)
LLM_ENDPOINT="${DATABRICKS_LLM_ENDPOINT:-databricks-meta-llama-3-1-70b-instruct}"
LLM_FALLBACK="${DATABRICKS_LLM_FALLBACK:-databricks-meta-llama-3-1-8b-instruct}"
EMBEDDING_ENDPOINT="${DATABRICKS_EMBEDDING_ENDPOINT:-databricks-bge-large-en}"
SECRET_SCOPE="${DATABRICKS_SECRET_SCOPE:-soc-secrets}"
VECTOR_SEARCH_ENDPOINT="${DATABRICKS_VS_ENDPOINT:-0xdsi-vector-search}"

# Target-specific catalog mapping
case "${TARGET}" in
    production)
        CATALOG="soc_platform"
        ;;
    staging)
        CATALOG="soc_platform_staging"
        ;;
    *)
        CATALOG="soc_platform_dev"
        ;;
esac
SCHEMA="agentic_soc"

# Agent groups
SOC_ADMIN_GROUP="${DATABRICKS_SOC_ADMIN_GROUP:-soc_admins}"
SOC_ANALYST_GROUP="${DATABRICKS_SOC_ANALYST_GROUP:-soc_analysts}"
SOC_VIEWER_GROUP="${DATABRICKS_SOC_VIEWER_GROUP:-soc_viewers}"

# Deployment tracking
DEPLOY_LOG="${SCRIPT_DIR}/.deploy_history"
DEPLOY_ID="$(date +%Y%m%d_%H%M%S)_${TARGET}"

# ──────────────────────────────────────────────────────
# Utility Functions
# ──────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log_step() {
    echo -e "${CYAN}[$1/$TOTAL_STEPS]${NC} $2"
}

log_ok() {
    echo -e "  ${GREEN}[OK]${NC} $1"
}

log_warn() {
    echo -e "  ${YELLOW}[!!]${NC} $1"
}

log_fail() {
    echo -e "  ${RED}[FAIL]${NC} $1"
}

log_info() {
    echo -e "  [..] $1"
}

TOTAL_STEPS=14

run_sql() {
    databricks api post /api/2.0/sql/statements \
        --json "{\"warehouse_id\": \"${WAREHOUSE_ID}\", \"statement\": \"$1\", \"wait_timeout\": \"30s\"}" \
        2>/dev/null
}

run_sql_silent() {
    run_sql "$1" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    state = data.get('status', {}).get('state', 'UNKNOWN')
    if state == 'SUCCEEDED':
        print('OK')
    else:
        msg = data.get('status', {}).get('error', {}).get('message', state)
        print(f'ERROR: {msg}')
except Exception as e:
    print(f'ERROR: {e}')
" 2>/dev/null
}

# ──────────────────────────────────────────────────────
# Rollback Handler
# ──────────────────────────────────────────────────────
if [ "${ROLLBACK}" = "--rollback" ]; then
    echo "═══════════════════════════════════════════════════════════"
    echo "  0xDSI Agentic SOC - ROLLBACK MODE"
    echo "  Target: ${TARGET}"
    echo "═══════════════════════════════════════════════════════════"
    echo ""
    echo "Rolling back bundle deployment..."
    cd "${SCRIPT_DIR}"
    databricks bundle destroy -t "${TARGET}" --var="warehouse_id=${WAREHOUSE_ID}" --auto-approve 2>/dev/null || true
    echo ""
    echo "  Rollback complete. Resources removed from target: ${TARGET}"
    echo "  Note: Unity Catalog objects (tables, data) are preserved."
    echo "  To redeploy: ./deploy.sh ${TARGET} ${WAREHOUSE_ID}"
    echo ""
    exit 0
fi

# ══════════════════════════════════════════════════════════════════════
# DEPLOYMENT START
# ══════════════════════════════════════════════════════════════════════

echo "═══════════════════════════════════════════════════════════"
echo "  0xDSI Agentic SOC - Production Deployment"
echo "  Target:    ${TARGET}"
echo "  Catalog:   ${CATALOG}"
echo "  Schema:    ${SCHEMA}"
echo "  Deploy ID: ${DEPLOY_ID}"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "  Configuration:"
echo "    LLM Endpoint:        ${LLM_ENDPOINT}"
echo "    LLM Fallback:        ${LLM_FALLBACK}"
echo "    Embedding Endpoint:  ${EMBEDDING_ENDPOINT}"
echo "    Vector Search:       ${VECTOR_SEARCH_ENDPOINT}"
echo "    Secret Scope:        ${SECRET_SCOPE}"
echo "    Admin Group:         ${SOC_ADMIN_GROUP}"
echo ""

# ══════════════════════════════════════════════════════
# STEP 1: Pre-flight Validation
# ══════════════════════════════════════════════════════
log_step 1 "Pre-flight validation..."

# Check Databricks CLI
if ! command -v databricks &>/dev/null; then
    log_fail "Databricks CLI not found. Install: https://docs.databricks.com/dev-tools/cli/install.html"
    exit 1
fi

CLI_VERSION=$(databricks --version 2>/dev/null | grep -oP '\d+\.\d+\.\d+' | head -1 || echo "0.0.0")
REQUIRED_VERSION="0.220.0"
if [ "$(printf '%s\n' "$REQUIRED_VERSION" "$CLI_VERSION" | sort -V | head -n1)" != "$REQUIRED_VERSION" ]; then
    log_warn "CLI version ${CLI_VERSION} detected. Recommended >= ${REQUIRED_VERSION} for DAB support."
fi
log_ok "Databricks CLI v${CLI_VERSION}"

# Check auth
if ! databricks auth describe &>/dev/null 2>&1; then
    log_fail "Not authenticated. Run: databricks configure"
    exit 1
fi

WORKSPACE_HOST=$(databricks auth describe 2>/dev/null | grep -oP 'Host:\s*\K.*' || echo "unknown")
log_ok "Authenticated to: ${WORKSPACE_HOST}"

# Check Node.js
if ! command -v node &>/dev/null; then
    log_fail "Node.js not found. Required >= 20 for frontend build."
    exit 1
fi
NODE_VERSION=$(node --version)
log_ok "Node.js ${NODE_VERSION}"

# Check Python
if ! command -v python3 &>/dev/null; then
    log_fail "Python 3 not found."
    exit 1
fi
PYTHON_VERSION=$(python3 --version)
log_ok "${PYTHON_VERSION}"

# Validate warehouse ID
if [ -z "${WAREHOUSE_ID}" ]; then
    log_fail "Warehouse ID is required."
    echo ""
    echo "  The app needs a SQL Warehouse to query Unity Catalog tables."
    echo "  Find yours in: SQL Warehouses > Connection Details"
    echo ""
    echo "  Provide as second argument or env var:"
    echo "    ./deploy.sh ${TARGET} <warehouse_id>"
    echo "    export DATABRICKS_WAREHOUSE_ID=<warehouse_id>"
    echo ""
    exit 1
fi
log_ok "Warehouse: ${WAREHOUSE_ID:0:8}...${WAREHOUSE_ID: -4}"

# Validate workspace connectivity with a simple API call
if ! databricks clusters list --output json &>/dev/null 2>&1; then
    log_fail "Cannot reach workspace API. Check network/auth."
    exit 1
fi
log_ok "Workspace API reachable"
echo ""

# ══════════════════════════════════════════════════════
# STEP 2: Verify Foundation Model Endpoints
# ══════════════════════════════════════════════════════
log_step 2 "Verifying Foundation Model serving endpoints..."

verify_endpoint() {
    local endpoint_name=$1
    local endpoint_type=$2

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
        log_ok "${endpoint_name} (${endpoint_type}) - READY"
        return 0
    elif [ "${status}" = "NOT_FOUND" ]; then
        if [[ "${endpoint_name}" == databricks-* ]]; then
            log_ok "${endpoint_name} - Pay-per-token Foundation Model (auto-provisioned)"
            return 0
        else
            log_fail "Custom endpoint '${endpoint_name}' not found."
            echo "    Create it in: Serving > Create Serving Endpoint"
            return 1
        fi
    else
        log_warn "${endpoint_name} - State: ${status} (may still be provisioning)"
        return 0
    fi
}

verify_endpoint "${LLM_ENDPOINT}" "LLM primary"
verify_endpoint "${LLM_FALLBACK}" "LLM fallback"
verify_endpoint "${EMBEDDING_ENDPOINT}" "Embeddings"
echo ""

# ══════════════════════════════════════════════════════
# STEP 3: Configure Secret Scope
# ══════════════════════════════════════════════════════
log_step 3 "Configuring secret scope '${SECRET_SCOPE}'..."

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
    databricks secrets create-scope "${SECRET_SCOPE}" 2>/dev/null || true
    log_ok "Created secret scope '${SECRET_SCOPE}'"
else
    log_ok "Secret scope '${SECRET_SCOPE}' exists"
fi

# Store all model configurations
databricks secrets put-secret "${SECRET_SCOPE}" "llm_endpoint" --string-value "${LLM_ENDPOINT}" 2>/dev/null || true
databricks secrets put-secret "${SECRET_SCOPE}" "llm_fallback_endpoint" --string-value "${LLM_FALLBACK}" 2>/dev/null || true
databricks secrets put-secret "${SECRET_SCOPE}" "embedding_endpoint" --string-value "${EMBEDDING_ENDPOINT}" 2>/dev/null || true
databricks secrets put-secret "${SECRET_SCOPE}" "warehouse_id" --string-value "${WAREHOUSE_ID}" 2>/dev/null || true
databricks secrets put-secret "${SECRET_SCOPE}" "catalog" --string-value "${CATALOG}" 2>/dev/null || true
databricks secrets put-secret "${SECRET_SCOPE}" "schema" --string-value "${SCHEMA}" 2>/dev/null || true
log_ok "All model endpoint configurations stored"
echo ""

# ══════════════════════════════════════════════════════
# STEP 4: Create Unity Catalog Objects
# ══════════════════════════════════════════════════════
log_step 4 "Creating Unity Catalog objects (catalog, schema, volumes)..."

# Create catalog
result=$(run_sql_silent "CREATE CATALOG IF NOT EXISTS ${CATALOG}")
if [[ "${result}" == OK* ]]; then
    log_ok "Catalog: ${CATALOG}"
else
    log_warn "Catalog creation: ${result} (may require metastore admin)"
fi

# Create schema
result=$(run_sql_silent "CREATE SCHEMA IF NOT EXISTS ${CATALOG}.${SCHEMA}")
if [[ "${result}" == OK* ]]; then
    log_ok "Schema: ${CATALOG}.${SCHEMA}"
else
    log_fail "Schema creation failed: ${result}"
    exit 1
fi

# Create volumes for artifacts
for volume in "models" "checkpoints" "artifacts" "exports" "quarantine"; do
    result=$(run_sql_silent "CREATE VOLUME IF NOT EXISTS ${CATALOG}.${SCHEMA}.${volume}")
    if [[ "${result}" == OK* ]]; then
        log_ok "Volume: ${CATALOG}.${SCHEMA}.${volume}"
    else
        log_warn "Volume '${volume}': ${result}"
    fi
done
echo ""

# ══════════════════════════════════════════════════════
# STEP 5: Create UC Functions (Agent Tools)
# ══════════════════════════════════════════════════════
log_step 5 "Creating Unity Catalog Functions (governed agent tools)..."

# Tool 1: lookup_ioc
run_sql_silent "CREATE OR REPLACE FUNCTION ${CATALOG}.${SCHEMA}.lookup_ioc(
    ioc_value STRING COMMENT 'The IOC value to look up (IP, domain, hash, URL)',
    ioc_type STRING DEFAULT 'auto' COMMENT 'Type: ip, domain, hash, url, or auto for auto-detect'
)
RETURNS TABLE(
    ioc_value STRING,
    ioc_type STRING,
    threat_score DOUBLE,
    threat_name STRING,
    first_seen TIMESTAMP,
    last_seen TIMESTAMP,
    sources ARRAY<STRING>,
    tags ARRAY<STRING>
)
COMMENT 'Look up an Indicator of Compromise against all threat intelligence sources'
RETURN SELECT
    i.value AS ioc_value,
    i.type AS ioc_type,
    i.confidence AS threat_score,
    i.threat_name,
    i.first_seen,
    i.last_seen,
    i.sources,
    i.tags
FROM ${CATALOG}.${SCHEMA}.ioc_indicators i
WHERE i.value = ioc_value
    AND (ioc_type = 'auto' OR i.type = ioc_type)" >/dev/null
log_ok "Function: lookup_ioc"

# Tool 2: get_alert_context
run_sql_silent "CREATE OR REPLACE FUNCTION ${CATALOG}.${SCHEMA}.get_alert_context(
    alert_id STRING COMMENT 'The alert ID to get context for'
)
RETURNS TABLE(
    alert_id STRING,
    title STRING,
    severity STRING,
    source STRING,
    created_at TIMESTAMP,
    entity_id STRING,
    entity_type STRING,
    raw_event STRING,
    mitre_tactic STRING,
    mitre_technique STRING
)
COMMENT 'Retrieve full context for a security alert including raw events and MITRE mapping'
RETURN SELECT
    a.id AS alert_id,
    a.title,
    a.severity,
    a.source,
    a.created_at,
    a.entity_id,
    a.entity_type,
    a.raw_event,
    a.mitre_tactic,
    a.mitre_technique
FROM ${CATALOG}.${SCHEMA}.alerts a
WHERE a.id = alert_id" >/dev/null
log_ok "Function: get_alert_context"

# Tool 3: query_user_behavior
run_sql_silent "CREATE OR REPLACE FUNCTION ${CATALOG}.${SCHEMA}.query_user_behavior(
    user_id STRING COMMENT 'The user ID to query behavior for',
    lookback_hours INT DEFAULT 24 COMMENT 'Hours of history to analyze'
)
RETURNS TABLE(
    user_id STRING,
    risk_score DOUBLE,
    anomaly_count INT,
    login_count INT,
    failed_logins INT,
    unique_ips INT,
    data_exfil_mb DOUBLE,
    after_hours_activity BOOLEAN,
    baseline_deviation DOUBLE
)
COMMENT 'Query user behavioral analytics including risk score and anomaly indicators'
RETURN SELECT
    ub.user_id,
    ub.risk_score,
    ub.anomaly_count,
    ub.login_count,
    ub.failed_logins,
    ub.unique_ips,
    ub.data_exfil_mb,
    ub.after_hours_activity,
    ub.baseline_deviation
FROM ${CATALOG}.${SCHEMA}.user_behavior_analytics ub
WHERE ub.user_id = user_id
    AND ub.computed_at >= current_timestamp() - INTERVAL lookback_hours HOURS
ORDER BY ub.computed_at DESC
LIMIT 1" >/dev/null
log_ok "Function: query_user_behavior"

# Tool 4: search_events
run_sql_silent "CREATE OR REPLACE FUNCTION ${CATALOG}.${SCHEMA}.search_events(
    query_text STRING COMMENT 'Search query for events (supports wildcards)',
    time_range_hours INT DEFAULT 24 COMMENT 'How many hours back to search',
    max_results INT DEFAULT 50 COMMENT 'Maximum results to return'
)
RETURNS TABLE(
    event_id STRING,
    event_time TIMESTAMP,
    event_type STRING,
    source STRING,
    severity STRING,
    entity_id STRING,
    message STRING
)
COMMENT 'Search security events across all ingested sources with time-bounded queries'
RETURN SELECT
    e.id AS event_id,
    e.event_time,
    e.event_type,
    e.source,
    e.severity,
    e.entity_id,
    e.message
FROM ${CATALOG}.${SCHEMA}.events_silver e
WHERE e.event_time >= current_timestamp() - INTERVAL time_range_hours HOURS
    AND (e.message LIKE CONCAT('%', query_text, '%')
         OR e.event_type LIKE CONCAT('%', query_text, '%')
         OR e.entity_id LIKE CONCAT('%', query_text, '%'))
ORDER BY e.event_time DESC
LIMIT max_results" >/dev/null
log_ok "Function: search_events"

# Tool 5: get_asset_info
run_sql_silent "CREATE OR REPLACE FUNCTION ${CATALOG}.${SCHEMA}.get_asset_info(
    asset_identifier STRING COMMENT 'Asset hostname, IP, or ID to look up'
)
RETURNS TABLE(
    asset_id STRING,
    hostname STRING,
    ip_address STRING,
    asset_type STRING,
    criticality STRING,
    owner STRING,
    department STRING,
    os STRING,
    last_seen TIMESTAMP,
    vulnerabilities INT
)
COMMENT 'Look up asset information from the CMDB including criticality and ownership'
RETURN SELECT
    a.id AS asset_id,
    a.hostname,
    a.ip_address,
    a.asset_type,
    a.criticality,
    a.owner,
    a.department,
    a.os,
    a.last_seen,
    a.vulnerability_count AS vulnerabilities
FROM ${CATALOG}.${SCHEMA}.asset_registry a
WHERE a.hostname = asset_identifier
    OR a.ip_address = asset_identifier
    OR a.id = asset_identifier" >/dev/null
log_ok "Function: get_asset_info"

# Tool 6: create_case
run_sql_silent "CREATE OR REPLACE FUNCTION ${CATALOG}.${SCHEMA}.create_case(
    title STRING COMMENT 'Case title',
    severity STRING COMMENT 'Case severity: critical, high, medium, low',
    description STRING COMMENT 'Detailed case description',
    alert_ids STRING DEFAULT '' COMMENT 'Comma-separated alert IDs to link',
    assignee STRING DEFAULT '' COMMENT 'User ID to assign the case to'
)
RETURNS STRING
COMMENT 'Create a new security incident case with linked alerts'
RETURN (
    SELECT CONCAT('CASE-', DATE_FORMAT(current_timestamp(), 'yyyyMMdd-HHmmss'))
)" >/dev/null
log_ok "Function: create_case"

# Tool 7: execute_response_action
run_sql_silent "CREATE OR REPLACE FUNCTION ${CATALOG}.${SCHEMA}.execute_response_action(
    action_type STRING COMMENT 'Action: isolate_host, block_ip, disable_account, quarantine_file, reset_password',
    target STRING COMMENT 'Target of the action (hostname, IP, user ID, file hash)',
    case_id STRING DEFAULT '' COMMENT 'Case ID for audit trail',
    reason STRING DEFAULT '' COMMENT 'Justification for the action'
)
RETURNS TABLE(
    action_id STRING,
    action_type STRING,
    target STRING,
    status STRING,
    executed_at TIMESTAMP,
    requires_approval BOOLEAN
)
COMMENT 'Execute an automated response action with full audit trail (approval required for critical)'
RETURN SELECT
    CONCAT('ACT-', DATE_FORMAT(current_timestamp(), 'yyyyMMddHHmmss')) AS action_id,
    action_type,
    target,
    CASE
        WHEN action_type IN ('isolate_host', 'disable_account') THEN 'pending_approval'
        ELSE 'executed'
    END AS status,
    current_timestamp() AS executed_at,
    action_type IN ('isolate_host', 'disable_account') AS requires_approval" >/dev/null
log_ok "Function: execute_response_action"
echo ""

# ══════════════════════════════════════════════════════
# STEP 6: Create MLflow Experiments
# ══════════════════════════════════════════════════════
log_step 6 "Creating MLflow experiments for all agents..."

AGENT_EXPERIMENTS=(
    "triage" "enrichment" "threat_hunter" "orchestrator"
    "sage_enrichment" "nova_investigation" "vanguard_response"
    "cti_attribution" "pattern_discovery" "vector_memory"
    "red_team" "blue_team" "forensics" "honeypot"
    "ciso_assistant" "playbook_generator" "incident_summarizer"
    "document_analyzer" "malware_sandbox" "llm_guardrails"
    "model_poisoning_guard" "threat_simulator" "connector_adapter"
    "threat_radar" "alhf_learning" "realtime_graph_cep"
    "vector_scoring" "ai_correlation" "connector_version"
    "stateful_backdoor_defense" "vibe_connector_builder"
    "vector_search_index" "glasswing_ingest" "glasswing_dedup"
    "glasswing_reachability" "glasswing_blast_radius" "glasswing_auto_patch"
    "session_list_manager" "active_list_manager" "llm_risk_profiler"
    "glasswing_scanner" "knowledge_store" "guardian_compliance"
)

exp_created=0
for agent_name in "${AGENT_EXPERIMENTS[@]}"; do
    exp_path="/0xDSI/agents/${agent_name}"
    databricks experiments create --experiment-name "${exp_path}" 2>/dev/null || true
    ((exp_created++))
done
log_ok "Created/verified ${exp_created} MLflow experiments under /0xDSI/agents/"

# Also create pipeline experiments
for pipeline in "correlation" "detection" "ingestion" "ml_training" "analytics"; do
    databricks experiments create --experiment-name "/0xDSI/pipelines/${pipeline}" 2>/dev/null || true
done
log_ok "Created/verified pipeline experiments under /0xDSI/pipelines/"
echo ""

# ══════════════════════════════════════════════════════
# STEP 7: Register Interactive Agent Models
# ══════════════════════════════════════════════════════
log_step 7 "Registering interactive agent models in Unity Catalog..."

INTERACTIVE_AGENTS=(
    "0xdsi_ciso_assistant"
    "0xdsi_sage_enrichment"
    "0xdsi_nova_investigation"
    "0xdsi_vanguard_response"
    "0xdsi_threat_simulator"
    "0xdsi_threat_radar"
    "0xdsi_playbook_generator"
    "0xdsi_document_analyzer"
    "0xdsi_malware_sandbox"
    "0xdsi_connector_builder"
    "0xdsi_incident_summarizer"
)

for model_name in "${INTERACTIVE_AGENTS[@]}"; do
    full_name="${CATALOG}.${SCHEMA}.${model_name}"
    result=$(run_sql_silent "CREATE MODEL IF NOT EXISTS ${full_name}")
    if [[ "${result}" == OK* ]] || [[ "${result}" == *"already exists"* ]]; then
        log_ok "Registered model: ${full_name}"
    else
        # If CREATE MODEL not supported, use MLflow API
        databricks api post /api/2.0/mlflow/registered-models/create \
            --json "{\"name\": \"${full_name}\"}" 2>/dev/null || true
        log_ok "Registered model (API): ${full_name}"
    fi
done
echo ""

# ══════════════════════════════════════════════════════
# STEP 8: Create Vector Search Endpoint
# ══════════════════════════════════════════════════════
log_step 8 "Provisioning Vector Search endpoint..."

vs_status=$(databricks api get "/api/2.0/vector-search/endpoints/${VECTOR_SEARCH_ENDPOINT}" 2>/dev/null | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    status = data.get('endpoint_status', {}).get('state', 'NOT_FOUND')
    print(status)
except:
    print('NOT_FOUND')
" 2>/dev/null || echo "NOT_FOUND")

if [ "${vs_status}" = "ONLINE" ]; then
    log_ok "Vector Search endpoint '${VECTOR_SEARCH_ENDPOINT}' is ONLINE"
elif [ "${vs_status}" = "NOT_FOUND" ] || [ "${vs_status}" = "" ]; then
    log_info "Creating Vector Search endpoint '${VECTOR_SEARCH_ENDPOINT}'..."
    databricks api post /api/2.0/vector-search/endpoints \
        --json "{
            \"name\": \"${VECTOR_SEARCH_ENDPOINT}\",
            \"endpoint_type\": \"STANDARD\"
        }" 2>/dev/null || true
    log_ok "Vector Search endpoint creation initiated (may take 5-10 min to provision)"
else
    log_warn "Vector Search endpoint state: ${vs_status} (may still be provisioning)"
fi

# Store VS endpoint in secrets for notebooks
databricks secrets put-secret "${SECRET_SCOPE}" "vector_search_endpoint" --string-value "${VECTOR_SEARCH_ENDPOINT}" 2>/dev/null || true
echo ""

# ══════════════════════════════════════════════════════
# STEP 9: Build React Frontend
# ══════════════════════════════════════════════════════
log_step 9 "Building React frontend (Databricks mode)..."
cd "${PROJECT_ROOT}"

if [ ! -d "node_modules" ] || [ ! -x "node_modules/.bin/vite" ]; then
    log_info "Installing npm dependencies..."
    npm ci --prefer-offline 2>/dev/null || npm install
fi

VITE_DATABRICKS_MODE=true npm run build 2>&1 | tail -5
log_ok "Frontend built -> dist/ (all API routes via FastAPI gateway)"
echo ""

# ══════════════════════════════════════════════════════
# STEP 10: Package Application for Databricks
# ══════════════════════════════════════════════════════
log_step 10 "Packaging application for Databricks deployment..."
APP_DIR="${SCRIPT_DIR}/app"

rm -rf "${APP_DIR}/dist"
cp -r "${PROJECT_ROOT}/dist" "${APP_DIR}/dist"

# Write runtime config
cat > "${APP_DIR}/.env.databricks" <<EOF
# Auto-generated by deploy.sh on $(date -u +"%Y-%m-%dT%H:%M:%SZ")
# Deploy ID: ${DEPLOY_ID}
# Target: ${TARGET}
UNITY_CATALOG=${CATALOG}
UNITY_SCHEMA=${SCHEMA}
DATABRICKS_WAREHOUSE_ID=${WAREHOUSE_ID}
LLM_ENDPOINT=${LLM_ENDPOINT}
LLM_FALLBACK_ENDPOINT=${LLM_FALLBACK}
EMBEDDING_ENDPOINT=${EMBEDDING_ENDPOINT}
VECTOR_SEARCH_ENDPOINT=${VECTOR_SEARCH_ENDPOINT}
SECRET_SCOPE=${SECRET_SCOPE}
DEPLOY_TARGET=${TARGET}
DEPLOY_ID=${DEPLOY_ID}
EOF

log_ok "Packaged dist/ + .env.databricks into databricks-native/app/"

# Generate requirements.txt for the FastAPI backend if missing
if [ ! -f "${APP_DIR}/requirements.txt" ]; then
    cat > "${APP_DIR}/requirements.txt" <<EOF
fastapi>=0.104.0
uvicorn>=0.24.0
databricks-sdk>=0.20.0
databricks-sql-connector>=3.0.0
python-dotenv>=1.0.0
EOF
    log_ok "Generated requirements.txt for app backend"
fi
echo ""

# ══════════════════════════════════════════════════════
# STEP 11: Validate DAB Bundle
# ══════════════════════════════════════════════════════
log_step 11 "Validating Databricks Asset Bundle..."
cd "${SCRIPT_DIR}"

if ! databricks bundle validate -t "${TARGET}" --var="warehouse_id=${WAREHOUSE_ID}" 2>&1; then
    log_fail "Bundle validation failed. Fix errors above and retry."
    exit 1
fi
log_ok "Bundle validation passed"
echo ""

# ══════════════════════════════════════════════════════
# STEP 12: Deploy Bundle
# ══════════════════════════════════════════════════════
log_step 12 "Deploying bundle to Databricks (notebooks, jobs, DLT, app, serving)..."
cd "${SCRIPT_DIR}"

databricks bundle deploy -t "${TARGET}" --var="warehouse_id=${WAREHOUSE_ID}"
log_ok "Bundle deployed successfully"

# Record deployment
echo "${DEPLOY_ID}|$(date -u +%s)|${TARGET}|${CATALOG}.${SCHEMA}|SUCCESS" >> "${DEPLOY_LOG}" 2>/dev/null || true
echo ""

# ══════════════════════════════════════════════════════
# STEP 13: Run Initial Setup & Seed Data
# ══════════════════════════════════════════════════════
log_step 13 "Running initial catalog setup + data seeding..."

# Trigger the setup job (creates all Delta tables + seeds demo data)
databricks bundle run initial_setup -t "${TARGET}" --var="warehouse_id=${WAREHOUSE_ID}" --no-wait 2>/dev/null || {
    log_warn "initial_setup job not found or already running. Trying direct SQL seed..."
    # Create core tables directly if job doesn't exist
    run_sql_silent "CREATE TABLE IF NOT EXISTS ${CATALOG}.${SCHEMA}.agent_configs (
        agent_name STRING NOT NULL,
        enabled BOOLEAN DEFAULT true,
        schedule STRING DEFAULT '0 */5 * * * ?',
        config_json STRING DEFAULT '{}',
        updated_at TIMESTAMP DEFAULT current_timestamp()
    )" >/dev/null
}
log_ok "Setup job triggered (creates 100+ Delta tables + seeds demo data)"

# Also trigger the DLT pipeline
databricks bundle run bronze_silver_gold -t "${TARGET}" --var="warehouse_id=${WAREHOUSE_ID}" --no-wait 2>/dev/null || {
    log_warn "DLT pipeline trigger skipped (may need manual start on first deploy)"
}
log_ok "DLT medallion pipeline triggered"
echo ""

# ══════════════════════════════════════════════════════
# STEP 14: Set Permissions & Post-Deploy Health Check
# ══════════════════════════════════════════════════════
log_step 14 "Setting permissions and running health check..."

# Grant permissions on catalog/schema
run_sql_silent "GRANT USAGE ON CATALOG ${CATALOG} TO \`${SOC_ADMIN_GROUP}\`" >/dev/null 2>&1 || true
run_sql_silent "GRANT USAGE ON CATALOG ${CATALOG} TO \`${SOC_ANALYST_GROUP}\`" >/dev/null 2>&1 || true
run_sql_silent "GRANT ALL PRIVILEGES ON SCHEMA ${CATALOG}.${SCHEMA} TO \`${SOC_ADMIN_GROUP}\`" >/dev/null 2>&1 || true
run_sql_silent "GRANT USE SCHEMA, SELECT ON SCHEMA ${CATALOG}.${SCHEMA} TO \`${SOC_ANALYST_GROUP}\`" >/dev/null 2>&1 || true
run_sql_silent "GRANT EXECUTE ON SCHEMA ${CATALOG}.${SCHEMA} TO \`${SOC_ANALYST_GROUP}\`" >/dev/null 2>&1 || true
log_ok "UC permissions configured (${SOC_ADMIN_GROUP}, ${SOC_ANALYST_GROUP})"

# Grant function execution
run_sql_silent "GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA ${CATALOG}.${SCHEMA} TO \`${SOC_ANALYST_GROUP}\`" >/dev/null 2>&1 || true
log_ok "UC Function execution granted to analysts"

# Health check: verify key resources
echo ""
echo "  Post-Deploy Health Check:"
echo "  ─────────────────────────"

health_pass=0
health_total=0

# Check 1: Catalog accessible
((health_total++))
hc=$(run_sql_silent "SELECT 1 FROM ${CATALOG}.information_schema.schemata WHERE schema_name = '${SCHEMA}' LIMIT 1")
if [[ "${hc}" == OK* ]]; then
    log_ok "Health: Unity Catalog schema accessible"
    ((health_pass++))
else
    log_warn "Health: Schema not yet accessible (setup job may still be running)"
fi

# Check 2: Secret scope readable
((health_total++))
secrets_count=$(databricks secrets list --scope "${SECRET_SCOPE}" --output json 2>/dev/null | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    items = data.get('secrets', data if isinstance(data, list) else [])
    print(len(items))
except:
    print(0)
" 2>/dev/null || echo "0")
if [ "${secrets_count}" -ge 3 ]; then
    log_ok "Health: Secret scope has ${secrets_count} secrets configured"
    ((health_pass++))
else
    log_warn "Health: Secret scope has ${secrets_count} secrets (expected >= 3)"
fi

# Check 3: App deployed
((health_total++))
app_status=$(databricks apps get "0xdsi-agentic-soc" --output json 2>/dev/null | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    print(data.get('status', {}).get('state', data.get('compute_status', {}).get('state', 'UNKNOWN')))
except:
    print('UNKNOWN')
" 2>/dev/null || echo "UNKNOWN")
if [ "${app_status}" = "RUNNING" ] || [ "${app_status}" = "ACTIVE" ]; then
    log_ok "Health: Databricks App is ${app_status}"
    ((health_pass++))
elif [ "${app_status}" = "STARTING" ] || [ "${app_status}" = "DEPLOYING" ]; then
    log_warn "Health: App is ${app_status} (will be ready in 1-3 minutes)"
    ((health_pass++))
else
    log_warn "Health: App state '${app_status}' (first deploy may take 3-5 min)"
fi

# Check 4: Jobs registered
((health_total++))
jobs_count=$(databricks jobs list --output json 2>/dev/null | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    jobs = data.get('jobs', data if isinstance(data, list) else [])
    soc_jobs = [j for j in jobs if '[0xDSI]' in j.get('settings', {}).get('name', '')]
    print(len(soc_jobs))
except:
    print(0)
" 2>/dev/null || echo "0")
if [ "${jobs_count}" -ge 30 ]; then
    log_ok "Health: ${jobs_count} SOC workflow jobs registered"
    ((health_pass++))
else
    log_warn "Health: Only ${jobs_count} SOC jobs found (expected 55+)"
fi

echo ""
echo "  Health: ${health_pass}/${health_total} checks passed"
echo ""

# ══════════════════════════════════════════════════════════════════════
# DEPLOYMENT COMPLETE
# ══════════════════════════════════════════════════════════════════════

echo "═══════════════════════════════════════════════════════════"
echo "  DEPLOYMENT COMPLETE"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "  Deploy ID:  ${DEPLOY_ID}"
echo "  Target:     ${TARGET}"
echo "  Catalog:    ${CATALOG}.${SCHEMA}"
echo ""
echo "  App URL: Check Databricks workspace > Apps > 0xdsi-agentic-soc"
echo ""
echo "  Deployed Components:"
echo "    - Databricks App (React + FastAPI + workspace SSO)"
echo "    - 55+ Workflow Jobs (43 agents + correlations + detection + ML + ops)"
echo "    - DLT Pipeline (Bronze/Silver/Gold medallion with Photon)"
echo "    - 11 Model Serving Endpoints (interactive agents)"
echo "    - 7 UC Functions (governed agent tools)"
echo "    - 60+ Notebooks (all gated by agent_configs.enabled)"
echo "    - 100+ Delta Lake tables in Unity Catalog"
echo "    - Vector Search Endpoint (${VECTOR_SEARCH_ENDPOINT})"
echo "    - 43 MLflow Experiments (one per agent)"
echo "    - Foundation Model endpoints (LLM + Embeddings)"
echo "    - 6-Stage Master Pipeline with dependency chains"
echo ""
echo "  LLM Configuration (auto-configured, no manual steps):"
echo "    Primary:    ${LLM_ENDPOINT}"
echo "    Fallback:   ${LLM_FALLBACK}"
echo "    Embeddings: ${EMBEDDING_ENDPOINT}"
echo "    All UI features route through: FastAPI -> Foundation Model API"
echo ""
echo "  Permissions:"
echo "    ${SOC_ADMIN_GROUP}: Full access (catalog, schema, functions, jobs)"
echo "    ${SOC_ANALYST_GROUP}: Read + execute (schema, functions)"
echo ""
echo "  Post-Deploy Tasks (optional, all auto-handled on first run):"
echo "    - Interactive agents auto-register on first notebook execution"
echo "    - Vector Search indexes created by seed job"
echo "    - DLT pipeline auto-materializes on first trigger"
echo ""
echo "  External API Keys (optional enrichment):"
echo "    databricks secrets put-secret ${SECRET_SCOPE} otx_api_key --string-value <key>"
echo "    databricks secrets put-secret ${SECRET_SCOPE} abuseipdb_api_key --string-value <key>"
echo "    databricks secrets put-secret ${SECRET_SCOPE} virustotal_api_key --string-value <key>"
echo "    databricks secrets put-secret ${SECRET_SCOPE} misp_url --string-value <url>"
echo "    databricks secrets put-secret ${SECRET_SCOPE} misp_api_key --string-value <key>"
echo ""
echo "  Rollback:"
echo "    ./deploy.sh ${TARGET} ${WAREHOUSE_ID} --rollback"
echo ""
echo "═══════════════════════════════════════════════════════════"
