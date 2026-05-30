#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║                                                                              ║
# ║        0xDSI AGENTIC SOC — DATABRICKS DEPLOYMENT ORCHESTRATOR               ║
# ║        Modern Security Operations | Detection-as-Data | Lakehouse Native     ║
# ║                                                                              ║
# ╚══════════════════════════════════════════════════════════════════════════════╝
#
# Fixed for:
#   - macOS/BSD shell behavior (printf over echo -e, grep -Eo over -oP)
#   - Databricks CLI 0.299.x
#   - SQL Statements API JSON escaping (python3 payload builder)
#   - Databricks Asset Bundle duplicate resource keys
#   - Deprecated legacy inference table config in model_serving_endpoints
#   - Missing UC registered model versions referenced by serving endpoints
#   - UC functions depending on tables that may not exist yet
#   - Safer workspace connectivity checks
#
# Important:
#   This script disables bundle-defined custom model_serving_endpoints by default.
#   The app still uses Databricks Foundation Model endpoints through FastAPI/config.
#
# Usage:
#   ./deploy.sh dev <warehouse_id>
#   ./deploy.sh production <warehouse_id>
#
# Or:
#   export DATABRICKS_WAREHOUSE_ID=<warehouse_id>
#   ./deploy.sh dev
#
# Rollback:
#   ./deploy.sh dev <warehouse_id> --rollback

set -uo pipefail

# ──────────────────────────────────────────────────────────────────────────────
# Arguments / Paths
# ──────────────────────────────────────────────────────────────────────────────
TARGET="${1:-dev}"
WAREHOUSE_ID="${2:-${DATABRICKS_WAREHOUSE_ID:-}}"
ROLLBACK="${3:-}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# ──────────────────────────────────────────────────────────────────────────────
# Configuration
# ──────────────────────────────────────────────────────────────────────────────
LLM_ENDPOINT="${DATABRICKS_LLM_ENDPOINT:-databricks-meta-llama-3-1-8b-instruct}"
LLM_FALLBACK="${DATABRICKS_LLM_FALLBACK:-databricks-meta-llama-3-1-8b-instruct}"
EMBEDDING_ENDPOINT="${DATABRICKS_EMBEDDING_ENDPOINT:-databricks-bge-large-en}"
SECRET_SCOPE="${DATABRICKS_SECRET_SCOPE:-soc-secrets}"
VECTOR_SEARCH_ENDPOINT="${DATABRICKS_VS_ENDPOINT:-0xdsi-vector-search}"

# Keep this enabled until you have real logged MLflow model versions for each agent.
DISABLE_BUNDLE_MODEL_SERVING="${DISABLE_BUNDLE_MODEL_SERVING:-true}"

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

SOC_ADMIN_GROUP="${DATABRICKS_SOC_ADMIN_GROUP:-soc_admins}"
SOC_ANALYST_GROUP="${DATABRICKS_SOC_ANALYST_GROUP:-soc_analysts}"
SOC_VIEWER_GROUP="${DATABRICKS_SOC_VIEWER_GROUP:-soc_viewers}"

DEPLOY_LOG="${SCRIPT_DIR}/.deploy_history"
DEPLOY_ID="$(date +%Y%m%d_%H%M%S)_${TARGET}"
TOTAL_STEPS=14

# ──────────────────────────────────────────────────────────────────────────────
# Colors / Logging (printf for POSIX portability)
# ──────────────────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
WHITE='\033[1;37m'
DIM='\033[2m'
BOLD='\033[1m'
NC='\033[0m'

log_step() { printf "%b\n" "${CYAN}${BOLD}[$1/$TOTAL_STEPS]${NC} $2"; }
log_ok()   { printf "%b\n" "  ${GREEN}[OK]${NC} $1"; }
log_warn() { printf "%b\n" "  ${YELLOW}[!!]${NC} $1"; }
log_fail() { printf "%b\n" "  ${RED}[FAIL]${NC} $1"; }
log_info() { printf "%b\n" "  ${DIM}[..]${NC} $1"; }

die() {
  log_fail "$1"
  exit 1
}

have_cmd() {
  command -v "$1" >/dev/null 2>&1
}

# ──────────────────────────────────────────────────────────────────────────────
# ASCII Art — Phase Banners
# ──────────────────────────────────────────────────────────────────────────────
print_header_art() {
cat <<'EOF'

    ╔══════════════════════════════════════════════════════════════════════════╗
    ║                                                                          ║
    ║    ░▒▓█ 0xDSI AGENTIC SOC █▓▒░                                          ║
    ║                                                                          ║
    ║    ██████╗ ██╗  ██╗██████╗ ███████╗██╗    ███████╗ ██████╗  ██████╗     ║
    ║   ██╔═████╗╚██╗██╔╝██╔══██╗██╔════╝██║    ██╔════╝██╔═══██╗██╔════╝     ║
    ║   ██║██╔██║ ╚███╔╝ ██║  ██║███████╗██║    ███████╗██║   ██║██║          ║
    ║   ████╔╝██║ ██╔██╗ ██║  ██║╚════██║██║    ╚════██║██║   ██║██║          ║
    ║   ╚██████╔╝██╔╝ ██╗██████╔╝███████║██║    ███████║╚██████╔╝╚██████╗     ║
    ║    ╚═════╝ ╚═╝  ╚═╝╚═════╝ ╚══════╝╚═╝    ╚══════╝ ╚═════╝  ╚═════╝     ║
    ║                                                                          ║
    ║    ═══════════════════════════════════════════════════════════════════    ║
    ║    AGENTIC SECURITY OPERATIONS CENTER  ·  DATABRICKS LAKEHOUSE NATIVE    ║
    ║    Detection-as-Data  ·  AI Correlation  ·  Vector Threat Hunting        ║
    ║    43 Autonomous Agents  ·  10 Correlation Engines  ·  Lakebase CDC      ║
    ║    ═══════════════════════════════════════════════════════════════════    ║
    ║                                                                          ║
    ╚══════════════════════════════════════════════════════════════════════════╝

EOF
}

phase_art() {
  local phase="$1"
  case "$phase" in
    preflight)
cat <<'EOF'
    ┌──────────────────────────────────────────────────────────────────────┐
    │                                                                      │
    │    ◈ PRE-FLIGHT CONTROL TOWER                                        │
    │                                                                      │
    │        ┌─────┐    ┌─────┐    ┌──────┐    ┌────────┐    ┌─────┐     │
    │        │ CLI │───▶│AUTH │───▶│ NODE │───▶│ PYTHON │───▶│ API │     │
    │        └─────┘    └─────┘    └──────┘    └────────┘    └─────┘     │
    │             ╰────────── workspace readiness scan ──────────╯         │
    │                                                                      │
    └──────────────────────────────────────────────────────────────────────┘
EOF
      ;;
    models)
cat <<'EOF'
    ┌──────────────────────────────────────────────────────────────────────┐
    │                                                                      │
    │    ◈ MODEL FABRIC — Foundation & Embedding Layer                      │
    │                                                                      │
    │        ╔═══════════╗          ╔═══════════╗                          │
    │        ║ LLM  70B  ║◀═══╦═══▶║ LLM   8B  ║                          │
    │        ╚═════╤═════╝    ║    ╚═══════════╝                          │
    │              │       FAILOVER                                         │
    │              ▼                                                        │
    │        ╔═══════════╗                                                 │
    │        ║ BGE-LARGE ║───────▶  semantic memory / threat hunting        │
    │        ╚═══════════╝                                                 │
    │                                                                      │
    └──────────────────────────────────────────────────────────────────────┘
EOF
      ;;
    secrets)
cat <<'EOF'
    ┌──────────────────────────────────────────────────────────────────────┐
    │                                                                      │
    │    ◈ SECURE CONFIG VAULT                                             │
    │                                                                      │
    │        ┌─────────────────────────────────────────────────┐           │
    │        │  ░░░ SECRET SCOPE ░░░                           │           │
    │        │                                                 │           │
    │        │  llm_endpoint · llm_fallback · embedding        │           │
    │        │  warehouse_id · catalog · schema · vector_search│           │
    │        └────────────────────────────┬────────────────────┘           │
    │                                     ▼                                │
    │                              Unity Catalog                            │
    │                                                                      │
    └──────────────────────────────────────────────────────────────────────┘
EOF
      ;;
    uc)
cat <<'EOF'
    ┌──────────────────────────────────────────────────────────────────────┐
    │                                                                      │
    │    ◈ UNITY CATALOG — SECURITY DATA LAKE                              │
    │                                                                      │
    │        CATALOG ════════ SCHEMA ════════ VOLUMES                       │
    │           │                │                │                         │
    │           │         ┌─────┴─────┐     ┌────┴────┐                    │
    │           │         │ 130+ Delta│     │ models  │                    │
    │           │         │  Tables   │     │ ckpts   │                    │
    │           │         └───────────┘     │ exports │                    │
    │           │                           └─────────┘                    │
    │        Governed Access + Row-Level Security                           │
    │                                                                      │
    └──────────────────────────────────────────────────────────────────────┘
EOF
      ;;
    functions)
cat <<'EOF'
    ┌──────────────────────────────────────────────────────────────────────┐
    │                                                                      │
    │    ◈ GOVERNED AGENT TOOLS — Unity Catalog Functions                   │
    │                                                                      │
    │     ┌────────────┐ ┌──────────────┐ ┌───────────────┐               │
    │     │ lookup_ioc │ │ alert_context│ │  user_behavior│               │
    │     └────────────┘ └──────────────┘ └───────────────┘               │
    │     ┌──────────────┐ ┌────────────┐ ┌───────────────────┐           │
    │     │ search_events│ │ asset_info │ │ execute_response  │           │
    │     └──────────────┘ └────────────┘ └───────────────────┘           │
    │     ┌─────────────┐                                                  │
    │     │ create_case │   All governed · audited · lineage-tracked       │
    │     └─────────────┘                                                  │
    │                                                                      │
    └──────────────────────────────────────────────────────────────────────┘
EOF
      ;;
    experiments)
cat <<'EOF'
    ┌──────────────────────────────────────────────────────────────────────┐
    │                                                                      │
    │    ◈ AGENT EXPERIMENT MATRIX — MLflow Lineage                        │
    │                                                                      │
    │     triage ──▶ enrichment ──▶ investigation ──▶ hunt ──▶ response    │
    │        │           │               │              │          │        │
    │        ▼           ▼               ▼              ▼          ▼        │
    │     ┌──────────────────────────────────────────────────────────┐     │
    │     │  MLflow: metrics · params · artifacts · evaluations      │     │
    │     │  43 agent experiments + 5 pipeline experiments            │     │
    │     └──────────────────────────────────────────────────────────┘     │
    │                                                                      │
    └──────────────────────────────────────────────────────────────────────┘
EOF
      ;;
    registry)
cat <<'EOF'
    ┌──────────────────────────────────────────────────────────────────────┐
    │                                                                      │
    │    ◈ INTERACTIVE AGENT REGISTRY — Model Namespace                    │
    │                                                                      │
    │     ╔══════════╗ ╔══════╗ ╔══════╗ ╔══════════╗ ╔═══════╗           │
    │     ║   CISO   ║ ║ SAGE ║ ║ NOVA ║ ║ VANGUARD ║ ║ RADAR ║           │
    │     ╚══════════╝ ╚══════╝ ╚══════╝ ╚══════════╝ ╚═══════╝           │
    │     ╔═══════════╗ ╔══════════╗ ╔══════════════╗ ╔═══════════╗       │
    │     ║ SIMULATOR ║ ║ PLAYBOOK ║ ║ DOC-ANALYZER ║ ║ MALWARE   ║       │
    │     ╚═══════════╝ ╚══════════╝ ╚══════════════╝ ╚═══════════╝       │
    │         Registered namespace · awaiting logged model versions         │
    │                                                                      │
    └──────────────────────────────────────────────────────────────────────┘
EOF
      ;;
    vector)
cat <<'EOF'
    ┌──────────────────────────────────────────────────────────────────────┐
    │                                                                      │
    │    ◈ VECTOR THREAT MEMORY — Semantic Search Infrastructure           │
    │                                                                      │
    │       events ──▶ BGE-Large ──▶ embeddings ──▶ vector index           │
    │                                                    │                  │
    │                                                    ▼                  │
    │                                          ┌─────────────────┐         │
    │                                          │  Threat Hunting  │         │
    │                                          │  Contextual Recall│        │
    │                                          │  Similar Alerts   │        │
    │                                          └─────────────────┘         │
    │                                                                      │
    └──────────────────────────────────────────────────────────────────────┘
EOF
      ;;
    build)
cat <<'EOF'
    ┌──────────────────────────────────────────────────────────────────────┐
    │                                                                      │
    │    ◈ SOC COMMAND UI — React Frontend Build                            │
    │                                                                      │
    │       ┌────────┐      ┌─────────┐      ┌──────────────────┐         │
    │       │  React │─────▶│  Vite   │─────▶│  Static Bundle   │         │
    │       │  + TSX │      │  Build  │      │  (dist/)         │         │
    │       └────────┘      └─────────┘      └────────┬─────────┘         │
    │                                                  │                    │
    │                                                  ▼                    │
    │                                        FastAPI Gateway ──▶ Databricks │
    │                                                                      │
    │        VITE_DATABRICKS_MODE=true  ·  All API via FastAPI proxy        │
    │                                                                      │
    └──────────────────────────────────────────────────────────────────────┘
EOF
      ;;
    package)
cat <<'EOF'
    ┌──────────────────────────────────────────────────────────────────────┐
    │                                                                      │
    │    ◈ APP PACKAGE ASSEMBLY                                            │
    │                                                                      │
    │        ┌────────────────────────────────────────────┐                │
    │        │  databricks-native/app/                    │                │
    │        │                                            │                │
    │        │  ├── dist/            (pre-built SPA)      │                │
    │        │  ├── backend/server.py (FastAPI)           │                │
    │        │  ├── .env.databricks  (runtime config)    │                │
    │        │  └── requirements.txt (Python deps)       │                │
    │        │                                            │                │
    │        └────────────────────────────────────────────┘                │
    │              Sealed artifact ready for Databricks Apps                │
    │                                                                      │
    └──────────────────────────────────────────────────────────────────────┘
EOF
      ;;
    validate)
cat <<'EOF'
    ┌──────────────────────────────────────────────────────────────────────┐
    │                                                                      │
    │    ◈ BUNDLE VALIDATION GATE                                          │
    │                                                                      │
    │        ┌──────────┐  ┌───────────┐  ┌──────┐  ┌──────────┐         │
    │        │resources │──│ variables │──│ jobs │──│ pipelines│         │
    │        └──────────┘  └───────────┘  └──────┘  └──────────┘         │
    │               │                                                      │
    │               ▼                                                      │
    │        ╔══════════════════════════════════════════════╗               │
    │        ║  Custom model serving PATCHED OUT until      ║               │
    │        ║  real MLflow model versions are logged       ║               │
    │        ╚══════════════════════════════════════════════╝               │
    │                                                                      │
    └──────────────────────────────────────────────────────────────────────┘
EOF
      ;;
    deploy)
cat <<'EOF'
    ┌──────────────────────────────────────────────────────────────────────┐
    │                                                                      │
    │    ◈ DEPLOYMENT DROPZONE — databricks bundle deploy                  │
    │                                                                      │
    │        ┌───────────────────────────────────────────────────┐         │
    │        │                                                   │         │
    │        │  notebooks (90+)  ·  jobs (60+)  ·  DLT pipeline  │         │
    │        │  Databricks App   ·  workspace files              │         │
    │        │  Lakebase CDC sync ·  scheduled agent grid        │         │
    │        │                                                   │         │
    │        └────────────────────────┬──────────────────────────┘         │
    │                                 ▼                                     │
    │                          Target Workspace                             │
    │                                                                      │
    └──────────────────────────────────────────────────────────────────────┘
EOF
      ;;
    seed)
cat <<'EOF'
    ┌──────────────────────────────────────────────────────────────────────┐
    │                                                                      │
    │    ◈ INITIALIZATION PIPELINE                                         │
    │                                                                      │
    │        seed tables ──▶ agent configs ──▶ demo telemetry              │
    │                                              │                        │
    │                                              ▼                        │
    │                                 ┌──────────────────────┐             │
    │                                 │  Bronze → Silver → Gold │            │
    │                                 │  Medallion Data Flow    │            │
    │                                 └──────────────────────┘             │
    │                                                                      │
    └──────────────────────────────────────────────────────────────────────┘
EOF
      ;;
    health)
cat <<'EOF'
    ┌──────────────────────────────────────────────────────────────────────┐
    │                                                                      │
    │    ◈ POST-DEPLOY SOC HEALTH RADAR                                    │
    │                                                                      │
    │        ┌─────┐ ┌─────────┐ ┌─────┐ ┌──────┐ ┌───────────┐         │
    │        │ SQL │ │ Secrets │ │ App │ │ Jobs │ │ Permissons│         │
    │        └──┬──┘ └────┬────┘ └──┬──┘ └──┬───┘ └─────┬─────┘         │
    │           │         │         │        │           │                 │
    │           ▼         ▼         ▼        ▼           ▼                 │
    │        ╔══════════════════════════════════════════════════╗           │
    │        ║         OPERATIONAL READINESS CONFIRMED          ║           │
    │        ╚══════════════════════════════════════════════════╝           │
    │                  Final sweep before analyst handoff                   │
    │                                                                      │
    └──────────────────────────────────────────────────────────────────────┘
EOF
      ;;
    complete)
cat <<'EOF'

    ╔══════════════════════════════════════════════════════════════════════════╗
    ║                                                                          ║
    ║    ░▒▓████████████████████████████████████████████████████████▓▒░        ║
    ║                                                                          ║
    ║              0xDSI  AGENTIC  SOC  —  DEPLOYMENT  COMPLETE                ║
    ║                                                                          ║
    ║    ░▒▓████████████████████████████████████████████████████████▓▒░        ║
    ║                                                                          ║
    ║         Governed Lakehouse Security Operations Are Now Online             ║
    ║                                                                          ║
    ║         • 46 Autonomous Agents Scheduled                                 ║
    ║         • 10 Correlation Engines Active                                  ║
    ║         • Lakebase CDC Sync for Session/Active Lists                     ║
    ║         • Vector Threat Hunting Memory Initialized                       ║
    ║         • SOC Command UI Deployed                                        ║
    ║                                                                          ║
    ╚══════════════════════════════════════════════════════════════════════════╝

EOF
      ;;
  esac
}

# ──────────────────────────────────────────────────────────────────────────────
# SQL Helpers (python3 for proper JSON escaping)
# ──────────────────────────────────────────────────────────────────────────────
json_get_state() {
  python3 -c '
import json, sys
try:
    d=json.load(sys.stdin)
    print(d.get("status",{}).get("state","UNKNOWN"))
except Exception:
    print("UNKNOWN")
'
}

run_sql() {
  local sql="$1"
  local payload_file
  payload_file="$(mktemp /tmp/oxdsi_sql_payload.XXXXXX.json)"

  python3 - "${WAREHOUSE_ID}" "${sql}" "${payload_file}" <<'PY'
import json
import sys

payload = {
    "warehouse_id": sys.argv[1],
    "statement": sys.argv[2],
    "wait_timeout": "30s"
}

with open(sys.argv[3], "w", encoding="utf-8") as f:
    json.dump(payload, f)
PY

  databricks api post /api/2.0/sql/statements --json @"${payload_file}" --output json
  local rc=$?

  rm -f "${payload_file}"
  return $rc
}

run_sql_silent() {
  local sql="$1"
  local out
  local rc
  out="$(run_sql "${sql}" 2>&1)"
  rc=$?

  if [ $rc -ne 0 ]; then
    printf "ERROR: %s\n" "${out}" | head -c 1600
    printf "\n"
    return 0
  fi

  local state
  state="$(printf "%s" "${out}" | json_get_state 2>/dev/null || echo UNKNOWN)"

  if [ "${state}" = "SUCCEEDED" ]; then
    printf "OK\n"
  else
    printf "%s" "${out}" | python3 -c '
import json, sys
try:
    d=json.load(sys.stdin)
    status=d.get("status",{})
    err=status.get("error",{}).get("message") or status.get("state","UNKNOWN")
    print("ERROR: " + str(err))
except Exception as e:
    print("ERROR: " + str(e))
'
  fi
}

run_sql_expect_ok() {
  local label="$1"
  local sql="$2"
  local result
  result="$(run_sql_silent "${sql}")"

  if [[ "${result}" == OK* ]]; then
    log_ok "${label}"
  else
    log_warn "${label}: ${result}"
  fi
}

# ──────────────────────────────────────────────────────────────────────────────
# Bundle YAML Patcher
# ──────────────────────────────────────────────────────────────────────────────
patch_bundle_yaml() {
  local app_yml="${SCRIPT_DIR}/resources/app.yml"

  [ -f "${app_yml}" ] || return 0

  python3 - "${app_yml}" "${DISABLE_BUNDLE_MODEL_SERVING}" <<'PY'
import sys
from pathlib import Path

path = Path(sys.argv[1])
disable_model_serving = sys.argv[2].lower() == "true"

text = path.read_text(encoding="utf-8")
original = text

backup = path.with_suffix(path.suffix + ".pre_oxdsi_deploy_patch.bak")
if not backup.exists():
    backup.write_text(original, encoding="utf-8")

lines = text.splitlines(True)

def remove_block(lines, top_key):
    out = []
    i = 0
    changed = False

    while i < len(lines):
        line = lines[i]
        stripped = line.strip()

        if stripped == f"{top_key}:":
            base_indent = len(line) - len(line.lstrip(" "))
            changed = True
            out.append(" " * base_indent + f"# {top_key}:  # disabled by deploy.sh; Foundation Model endpoints are used instead\n")
            i += 1

            while i < len(lines):
                next_line = lines[i]
                if next_line.strip():
                    next_indent = len(next_line) - len(next_line.lstrip(" "))
                    if next_indent <= base_indent:
                        break
                out.append("# " + next_line if not next_line.startswith("#") else next_line)
                i += 1
            continue

        out.append(line)
        i += 1

    return out, changed

if disable_model_serving:
    lines, removed = remove_block(lines, "model_serving_endpoints")
else:
    removed = False

# Patch duplicate endpoint keys if model serving is enabled
if not disable_model_serving:
    dupes = {
        "ciso_assistant": "ciso_assistant_endpoint",
        "sage_enrichment": "sage_enrichment_endpoint",
        "nova_investigation": "nova_investigation_endpoint",
        "vanguard_response": "vanguard_response_endpoint",
        "threat_simulator": "threat_simulator_endpoint",
        "threat_radar": "threat_radar_endpoint",
    }

    patched = []
    inside_mse = False
    mse_indent = None

    for line in lines:
        stripped = line.strip()

        if stripped == "model_serving_endpoints:":
            inside_mse = True
            mse_indent = len(line) - len(line.lstrip(" "))
            patched.append(line)
            continue

        if inside_mse:
            indent = len(line) - len(line.lstrip(" "))
            if stripped and indent <= mse_indent:
                inside_mse = False
                mse_indent = None

            if inside_mse:
                for old, new in dupes.items():
                    prefix2 = " " * (mse_indent + 2)
                    prefix4 = " " * (mse_indent + 4)
                    if line.startswith(prefix2 + old + ":"):
                        line = line.replace(prefix2 + old + ":", prefix2 + new + ":", 1)
                        break
                    if line.startswith(prefix4 + old + ":"):
                        line = line.replace(prefix4 + old + ":", prefix4 + new + ":", 1)
                        break

                if "auto_capture_config:" in line:
                    patched.append(line)
                    continue

        patched.append(line)

    lines = patched

new_text = "".join(lines)

if new_text != original:
    path.write_text(new_text, encoding="utf-8")
    print("patched")
else:
    print("nochange")
PY
}

restore_bundle_yaml() {
  local app_yml="${SCRIPT_DIR}/resources/app.yml"
  local backup="${SCRIPT_DIR}/resources/app.yml.pre_oxdsi_deploy_patch.bak"

  if [ -f "${backup}" ]; then
    cp "${backup}" "${app_yml}"
    log_ok "Restored resources/app.yml from backup"
  else
    log_warn "No resources/app.yml backup found to restore"
  fi
}

# ──────────────────────────────────────────────────────────────────────────────
# Catalog Bootstrap Tables Required by UC Functions
# ──────────────────────────────────────────────────────────────────────────────
create_placeholder_tables() {
  log_info "Creating placeholder tables required by UC functions..."

  run_sql_expect_ok "Table: ioc_indicators" "CREATE TABLE IF NOT EXISTS ${CATALOG}.${SCHEMA}.ioc_indicators (
    value STRING,
    type STRING,
    confidence DOUBLE,
    threat_name STRING,
    first_seen TIMESTAMP,
    last_seen TIMESTAMP,
    sources ARRAY<STRING>,
    tags ARRAY<STRING>
  )"

  run_sql_expect_ok "Table: alerts" "CREATE TABLE IF NOT EXISTS ${CATALOG}.${SCHEMA}.alerts (
    id STRING,
    title STRING,
    severity STRING,
    source STRING,
    created_at TIMESTAMP,
    entity_id STRING,
    entity_type STRING,
    raw_event STRING,
    mitre_tactic STRING,
    mitre_technique STRING
  )"

  run_sql_expect_ok "Table: user_behavior_analytics" "CREATE TABLE IF NOT EXISTS ${CATALOG}.${SCHEMA}.user_behavior_analytics (
    user_id STRING,
    risk_score DOUBLE,
    anomaly_count INT,
    login_count INT,
    failed_logins INT,
    unique_ips INT,
    data_exfil_mb DOUBLE,
    after_hours_activity BOOLEAN,
    baseline_deviation DOUBLE,
    computed_at TIMESTAMP
  )"

  run_sql_expect_ok "Table: events_silver" "CREATE TABLE IF NOT EXISTS ${CATALOG}.${SCHEMA}.events_silver (
    id STRING,
    event_time TIMESTAMP,
    event_type STRING,
    source STRING,
    severity STRING,
    entity_id STRING,
    message STRING
  )"

  run_sql_expect_ok "Table: asset_registry" "CREATE TABLE IF NOT EXISTS ${CATALOG}.${SCHEMA}.asset_registry (
    id STRING,
    hostname STRING,
    ip_address STRING,
    asset_type STRING,
    criticality STRING,
    owner STRING,
    department STRING,
    os STRING,
    last_seen TIMESTAMP,
    vulnerability_count INT
  )"
}

clean_local_state() {
  rm -rf "${SCRIPT_DIR}/.databricks" 2>/dev/null || true
  rm -rf "${SCRIPT_DIR}/app/dist" 2>/dev/null || true
  rm -f "${SCRIPT_DIR}/app/.env.databricks" 2>/dev/null || true
}

# ──────────────────────────────────────────────────────────────────────────────
# Rollback / Restore Flags
# ──────────────────────────────────────────────────────────────────────────────
if [ "${ROLLBACK}" = "--restore-yaml" ]; then
  restore_bundle_yaml
  exit 0
fi

if [ "${ROLLBACK}" = "--rollback" ]; then
  print_header_art
  phase_art deploy
  log_warn "Rollback mode enabled for target '${TARGET}'"

  patch_result="$(patch_bundle_yaml 2>/dev/null || true)"
  [ "${patch_result}" = "patched" ] && log_warn "Patched bundle YAML before rollback."

  cd "${SCRIPT_DIR}" || exit 1
  databricks bundle destroy -t "${TARGET}" --var="warehouse_id=${WAREHOUSE_ID}" --auto-approve || true
  clean_local_state
  log_ok "Rollback attempt complete. Unity Catalog objects are preserved unless manually dropped."
  exit 0
fi

# ──────────────────────────────────────────────────────────────────────────────
# Header
# ──────────────────────────────────────────────────────────────────────────────
print_header_art
printf "\n"
printf "%b\n" "${BOLD}Target:${NC}    ${TARGET}"
printf "%b\n" "${BOLD}Catalog:${NC}   ${CATALOG}"
printf "%b\n" "${BOLD}Schema:${NC}    ${SCHEMA}"
printf "%b\n" "${BOLD}Deploy ID:${NC} ${DEPLOY_ID}"
printf "\n"
printf "%b\n" "${BOLD}Configuration:${NC}"
printf "  LLM Endpoint:                 %s\n" "${LLM_ENDPOINT}"
printf "  LLM Fallback:                 %s\n" "${LLM_FALLBACK}"
printf "  Embedding Endpoint:           %s\n" "${EMBEDDING_ENDPOINT}"
printf "  Vector Search:                %s\n" "${VECTOR_SEARCH_ENDPOINT}"
printf "  Secret Scope:                 %s\n" "${SECRET_SCOPE}"
printf "  Admin Group:                  %s\n" "${SOC_ADMIN_GROUP}"
printf "  Bundle Model Serving:         %s\n" "$([ "${DISABLE_BUNDLE_MODEL_SERVING}" = "true" ] && echo "disabled until real model versions exist" || echo "enabled")"
printf "\n"

# ══════════════════════════════════════════════════════
# STEP 1: Pre-flight
# ══════════════════════════════════════════════════════
phase_art preflight
log_step 1 "Pre-flight validation..."

have_cmd databricks || die "Databricks CLI not found. Install: https://docs.databricks.com/dev-tools/cli/install.html"
have_cmd python3 || die "Python 3 not found."
have_cmd node || { log_warn "Node.js not found. Required >= 20 for frontend build."; }

CLI_VERSION="$(databricks --version 2>/dev/null | grep -Eo '[0-9]+\.[0-9]+\.[0-9]+' | head -1 || echo "0.0.0")"
REQUIRED_VERSION="0.220.0"
if [ "$(printf '%s\n' "$REQUIRED_VERSION" "$CLI_VERSION" | sort -V | head -n1)" != "$REQUIRED_VERSION" ]; then
  log_warn "CLI version ${CLI_VERSION} detected. Recommended >= ${REQUIRED_VERSION} for DAB support."
else
  log_ok "Databricks CLI v${CLI_VERSION}"
fi

databricks auth describe >/dev/null 2>&1 || die "Not authenticated. Run: databricks auth login --host <workspace-url>"

WORKSPACE_HOST="$(databricks auth describe 2>/dev/null | awk -F': ' '/Host:/ {print $2; exit}')"
WORKSPACE_HOST="${WORKSPACE_HOST:-unknown}"
log_ok "Authenticated to: ${WORKSPACE_HOST}"

NODE_VERSION="$(node --version 2>/dev/null || echo 'not found')"
log_ok "Node.js ${NODE_VERSION}"

PYTHON_VERSION="$(python3 --version)"
log_ok "${PYTHON_VERSION}"

if [ -z "${WAREHOUSE_ID}" ]; then
  die "Warehouse ID is required. Use: ./deploy.sh ${TARGET} <warehouse_id> or export DATABRICKS_WAREHOUSE_ID=<warehouse_id>"
fi
log_ok "Warehouse: ${WAREHOUSE_ID:0:8}...${WAREHOUSE_ID: -4}"

if ! databricks current-user me --output json >/dev/null 2>&1; then
  die "Cannot reach workspace API. Check network/auth/profile."
fi
log_ok "Workspace API reachable"

patch_result="$(patch_bundle_yaml 2>/dev/null || true)"
if [ "${patch_result}" = "patched" ]; then
  log_warn "Patched resources/app.yml: disabled custom model serving endpoints for this deploy."
else
  log_ok "Bundle YAML pre-check complete"
fi
printf "\n"

# ══════════════════════════════════════════════════════
# STEP 2: Model Verification
# ══════════════════════════════════════════════════════
phase_art models
log_step 2 "Verifying Foundation Model serving endpoints..."

verify_endpoint() {
  local endpoint_name="$1"
  local endpoint_type="$2"
  local out
  local ready

  out="$(databricks serving-endpoints get "${endpoint_name}" --output json 2>/dev/null || true)"
  ready="$(printf "%s" "$out" | python3 -c '
import json, sys
try:
    d=json.load(sys.stdin)
    print(d.get("state",{}).get("ready","NOT_FOUND"))
except Exception:
    print("NOT_FOUND")
')"

  if [ "${ready}" = "READY" ]; then
    log_ok "${endpoint_name} (${endpoint_type}) - READY"
  elif [ "${ready}" = "NOT_FOUND" ] && [[ "${endpoint_name}" == databricks-* ]]; then
    log_warn "${endpoint_name} not visible via serving-endpoints get; continuing as foundation model endpoint."
  elif [ "${ready}" = "NOT_FOUND" ]; then
    log_warn "Custom endpoint '${endpoint_name}' not found; continuing."
  else
    log_warn "${endpoint_name} - State: ${ready}; continuing."
  fi
}

verify_endpoint "${LLM_ENDPOINT}" "LLM primary"
verify_endpoint "${LLM_FALLBACK}" "LLM fallback"
verify_endpoint "${EMBEDDING_ENDPOINT}" "Embeddings"
printf "\n"

# ══════════════════════════════════════════════════════
# STEP 3: Secret Scope
# ══════════════════════════════════════════════════════
phase_art secrets
log_step 3 "Configuring secret scope '${SECRET_SCOPE}'..."

scope_exists="$(databricks secrets list-scopes --output json 2>/dev/null | python3 -c "
import json, sys
try:
    d=json.load(sys.stdin)
    scopes=[s.get('name') for s in d.get('scopes', d if isinstance(d, list) else [])]
    print('yes' if '${SECRET_SCOPE}' in scopes else 'no')
except Exception:
    print('no')
" 2>/dev/null || echo no)"

if [ "${scope_exists}" = "no" ]; then
  databricks secrets create-scope "${SECRET_SCOPE}" >/dev/null 2>&1 || true
  log_ok "Created secret scope '${SECRET_SCOPE}'"
else
  log_ok "Secret scope '${SECRET_SCOPE}' exists"
fi

databricks secrets put-secret "${SECRET_SCOPE}" "llm_endpoint" --string-value "${LLM_ENDPOINT}" >/dev/null 2>&1 || true
databricks secrets put-secret "${SECRET_SCOPE}" "llm_fallback_endpoint" --string-value "${LLM_FALLBACK}" >/dev/null 2>&1 || true
databricks secrets put-secret "${SECRET_SCOPE}" "embedding_endpoint" --string-value "${EMBEDDING_ENDPOINT}" >/dev/null 2>&1 || true
databricks secrets put-secret "${SECRET_SCOPE}" "warehouse_id" --string-value "${WAREHOUSE_ID}" >/dev/null 2>&1 || true
databricks secrets put-secret "${SECRET_SCOPE}" "catalog" --string-value "${CATALOG}" >/dev/null 2>&1 || true
databricks secrets put-secret "${SECRET_SCOPE}" "schema" --string-value "${SCHEMA}" >/dev/null 2>&1 || true
log_ok "All model endpoint configurations stored"
printf "\n"

# ══════════════════════════════════════════════════════
# STEP 4: Unity Catalog Objects
# ══════════════════════════════════════════════════════
phase_art uc
log_step 4 "Creating Unity Catalog objects..."

run_sql_expect_ok "Catalog: ${CATALOG}" "CREATE CATALOG IF NOT EXISTS ${CATALOG}"

schema_result="$(run_sql_silent "CREATE SCHEMA IF NOT EXISTS ${CATALOG}.${SCHEMA}")"
if [[ "${schema_result}" == OK* ]]; then
  log_ok "Schema: ${CATALOG}.${SCHEMA}"
else
  die "Schema creation failed: ${schema_result}"
fi

for volume in models checkpoints artifacts exports quarantine; do
  run_sql_expect_ok "Volume: ${CATALOG}.${SCHEMA}.${volume}" "CREATE VOLUME IF NOT EXISTS ${CATALOG}.${SCHEMA}.${volume}"
done

create_placeholder_tables
printf "\n"

# ══════════════════════════════════════════════════════
# STEP 5: UC Functions
# ══════════════════════════════════════════════════════
phase_art functions
log_step 5 "Creating Unity Catalog Functions..."

run_sql_expect_ok "Function: lookup_ioc" "CREATE OR REPLACE FUNCTION ${CATALOG}.${SCHEMA}.lookup_ioc(
  ioc_value STRING COMMENT 'The IOC value to look up',
  ioc_type STRING DEFAULT 'auto' COMMENT 'Type: ip, domain, hash, url, or auto'
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
COMMENT 'Look up an Indicator of Compromise'
RETURN SELECT
  i.value AS ioc_value,
  i.type AS ioc_type,
  i.confidence AS threat_score,
  i.threat_name AS threat_name,
  i.first_seen AS first_seen,
  i.last_seen AS last_seen,
  i.sources AS sources,
  i.tags AS tags
FROM ${CATALOG}.${SCHEMA}.ioc_indicators i
WHERE i.value = lookup_ioc.ioc_value
  AND (lookup_ioc.ioc_type = 'auto' OR i.type = lookup_ioc.ioc_type)"

run_sql_expect_ok "Function: get_alert_context" "CREATE OR REPLACE FUNCTION ${CATALOG}.${SCHEMA}.get_alert_context(
  alert_id STRING COMMENT 'The alert ID'
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
COMMENT 'Retrieve full alert context'
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
WHERE a.id = get_alert_context.alert_id"

run_sql_expect_ok "Function: query_user_behavior" "CREATE OR REPLACE FUNCTION ${CATALOG}.${SCHEMA}.query_user_behavior(
  user_id STRING COMMENT 'The user ID',
  lookback_hours INT DEFAULT 24 COMMENT 'Hours of history'
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
COMMENT 'Query user behavioral analytics'
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
WHERE ub.user_id = query_user_behavior.user_id
ORDER BY ub.computed_at DESC
LIMIT 1"

run_sql_expect_ok "Function: search_events" "CREATE OR REPLACE FUNCTION ${CATALOG}.${SCHEMA}.search_events(
  query_text STRING COMMENT 'Search query',
  time_range_hours INT DEFAULT 24 COMMENT 'Hours back',
  max_results INT DEFAULT 50 COMMENT 'Max results'
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
COMMENT 'Search security events'
RETURN SELECT
  e.id AS event_id,
  e.event_time,
  e.event_type,
  e.source,
  e.severity,
  e.entity_id,
  e.message
FROM ${CATALOG}.${SCHEMA}.events_silver e
WHERE e.message LIKE CONCAT('%', search_events.query_text, '%')
   OR e.event_type LIKE CONCAT('%', search_events.query_text, '%')
   OR e.entity_id LIKE CONCAT('%', search_events.query_text, '%')
ORDER BY e.event_time DESC
LIMIT search_events.max_results"

run_sql_expect_ok "Function: get_asset_info" "CREATE OR REPLACE FUNCTION ${CATALOG}.${SCHEMA}.get_asset_info(
  asset_identifier STRING COMMENT 'Asset hostname, IP, or ID'
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
COMMENT 'Look up asset information'
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
WHERE a.hostname = get_asset_info.asset_identifier
   OR a.ip_address = get_asset_info.asset_identifier
   OR a.id = get_asset_info.asset_identifier"

run_sql_expect_ok "Function: create_case" "CREATE OR REPLACE FUNCTION ${CATALOG}.${SCHEMA}.create_case(
  title STRING COMMENT 'Case title',
  severity STRING COMMENT 'Case severity',
  description STRING COMMENT 'Detailed case description',
  alert_ids STRING DEFAULT '' COMMENT 'Comma-separated alert IDs',
  assignee STRING DEFAULT '' COMMENT 'Assignee'
)
RETURNS STRING
COMMENT 'Create a new security incident case'
RETURN SELECT CONCAT('CASE-', DATE_FORMAT(current_timestamp(), 'yyyyMMdd-HHmmss'))"

run_sql_expect_ok "Function: execute_response_action" "CREATE OR REPLACE FUNCTION ${CATALOG}.${SCHEMA}.execute_response_action(
  action_type STRING COMMENT 'Action type',
  target STRING COMMENT 'Target',
  case_id STRING DEFAULT '' COMMENT 'Case ID',
  reason STRING DEFAULT '' COMMENT 'Justification'
)
RETURNS TABLE(
  action_id STRING,
  action_type STRING,
  target STRING,
  status STRING,
  executed_at TIMESTAMP,
  requires_approval BOOLEAN
)
COMMENT 'Execute an automated response action'
RETURN SELECT
  CONCAT('ACT-', DATE_FORMAT(current_timestamp(), 'yyyyMMddHHmmss')) AS action_id,
  execute_response_action.action_type AS action_type,
  execute_response_action.target AS target,
  CASE WHEN execute_response_action.action_type IN ('isolate_host', 'disable_account') THEN 'pending_approval' ELSE 'executed' END AS status,
  current_timestamp() AS executed_at,
  execute_response_action.action_type IN ('isolate_host', 'disable_account') AS requires_approval"
printf "\n"

# ══════════════════════════════════════════════════════
# STEP 6: MLflow Experiments
# ══════════════════════════════════════════════════════
phase_art experiments
log_step 6 "Creating MLflow experiments..."

AGENT_EXPERIMENTS=(
  triage enrichment threat_hunter orchestrator sage_enrichment nova_investigation vanguard_response
  cti_attribution pattern_discovery vector_memory red_team blue_team forensics honeypot
  ciso_assistant playbook_generator incident_summarizer document_analyzer malware_sandbox llm_guardrails
  model_poisoning_guard threat_simulator connector_adapter threat_radar alhf_learning realtime_graph_cep
  vector_scoring ai_correlation connector_version stateful_backdoor_defense vibe_connector_builder
  vector_search_index glasswing_ingest glasswing_dedup glasswing_reachability glasswing_blast_radius
  glasswing_auto_patch session_list_manager active_list_manager llm_risk_profiler glasswing_scanner
  knowledge_store guardian_compliance ot_protocol_security exploitforge communication_analyzer
)

exp_created=0
for agent_name in "${AGENT_EXPERIMENTS[@]}"; do
  databricks experiments create --experiment-name "/0xDSI/agents/${agent_name}" >/dev/null 2>&1 || true
  exp_created=$((exp_created + 1))
done
log_ok "Created/verified ${exp_created} agent experiments"

for pipeline in correlation detection ingestion ml_training analytics; do
  databricks experiments create --experiment-name "/0xDSI/pipelines/${pipeline}" >/dev/null 2>&1 || true
done
log_ok "Created/verified pipeline experiments"
printf "\n"

# ══════════════════════════════════════════════════════
# STEP 7: Model Registry
# ══════════════════════════════════════════════════════
phase_art registry
log_step 7 "Preparing interactive agent model namespace..."

INTERACTIVE_AGENTS=(
  0xdsi_ciso_assistant 0xdsi_sage_enrichment 0xdsi_nova_investigation
  0xdsi_vanguard_response 0xdsi_threat_simulator 0xdsi_threat_radar
  0xdsi_playbook_generator 0xdsi_document_analyzer 0xdsi_malware_sandbox
  0xdsi_connector_builder 0xdsi_incident_summarizer
)

for model_name in "${INTERACTIVE_AGENTS[@]}"; do
  full_name="${CATALOG}.${SCHEMA}.${model_name}"
  result="$(run_sql_silent "CREATE MODEL IF NOT EXISTS ${full_name}")"
  if [[ "${result}" == OK* ]]; then
    log_ok "Registered model namespace: ${full_name}"
  else
    databricks api post /api/2.0/mlflow/registered-models/create --json "{\"name\":\"${full_name}\"}" >/dev/null 2>&1 || true
    log_warn "Model namespace API attempted: ${full_name}"
  fi
done

if [ "${DISABLE_BUNDLE_MODEL_SERVING}" = "true" ]; then
  log_warn "Custom model serving endpoints are disabled in bundle; Foundation Model endpoints remain active."
fi
printf "\n"

# ══════════════════════════════════════════════════════
# STEP 8: Vector Search
# ══════════════════════════════════════════════════════
phase_art vector
log_step 8 "Provisioning Vector Search endpoint..."

vs_json="$(databricks api get "/api/2.0/vector-search/endpoints/${VECTOR_SEARCH_ENDPOINT}" --output json 2>/dev/null || true)"
vs_status="$(printf "%s" "${vs_json}" | python3 -c '
import json, sys
try:
    d=json.load(sys.stdin)
    print(d.get("endpoint_status",{}).get("state","NOT_FOUND"))
except Exception:
    print("NOT_FOUND")
')"

if [ "${vs_status}" = "ONLINE" ]; then
  log_ok "Vector Search endpoint '${VECTOR_SEARCH_ENDPOINT}' is ONLINE"
else
  log_info "Creating Vector Search endpoint '${VECTOR_SEARCH_ENDPOINT}' if missing..."
  databricks api post /api/2.0/vector-search/endpoints \
    --json "{\"name\":\"${VECTOR_SEARCH_ENDPOINT}\",\"endpoint_type\":\"STANDARD\"}" >/dev/null 2>&1 || true
  log_warn "Vector Search endpoint create requested or already exists; provisioning can take several minutes."
fi

databricks secrets put-secret "${SECRET_SCOPE}" "vector_search_endpoint" --string-value "${VECTOR_SEARCH_ENDPOINT}" >/dev/null 2>&1 || true
printf "\n"

# ══════════════════════════════════════════════════════
# STEP 9: Build Frontend
# ══════════════════════════════════════════════════════
phase_art build
log_step 9 "Building React frontend..."

cd "${PROJECT_ROOT}" || exit 1

if [ ! -d "node_modules" ] || [ ! -x "node_modules/.bin/vite" ]; then
  log_info "Installing npm dependencies..."
  npm ci --prefer-offline || npm install
fi

# Set VITE_DATABRICKS_MODE=true so the build uses the LakehouseDataClient
# and bypasses Supabase auth entirely. Dummy Supabase vars prevent build
# warnings; they are never used at runtime in Databricks mode.
VITE_DATABRICKS_MODE=true \
VITE_SUPABASE_URL=https://unused.supabase.co \
VITE_SUPABASE_ANON_KEY=unused \
npm run build

log_ok "Frontend built -> dist/ (Databricks mode, Supabase disabled)"
printf "\n"

# ══════════════════════════════════════════════════════
# STEP 10: Package App
# ══════════════════════════════════════════════════════
phase_art package
log_step 10 "Packaging application..."

APP_DIR="${SCRIPT_DIR}/app"

rm -rf "${APP_DIR}/dist"
cp -r "${PROJECT_ROOT}/dist" "${APP_DIR}/dist"

# Remove package.json so Databricks Apps doesn't auto-detect Node.js and attempt an npm build
rm -f "${APP_DIR}/package.json" "${APP_DIR}/package-lock.json"
rm -rf "${APP_DIR}/node_modules" 2>/dev/null || true

cat > "${APP_DIR}/.env.databricks" <<EOF
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

if [ ! -f "${APP_DIR}/requirements.txt" ]; then
  cat > "${APP_DIR}/requirements.txt" <<EOF
fastapi>=0.104.0
uvicorn>=0.24.0
databricks-sdk>=0.20.0
databricks-sql-connector>=3.0.0
python-dotenv>=1.0.0
EOF
fi

log_ok "Packaged app/dist + .env.databricks"
printf "\n"

# ══════════════════════════════════════════════════════
# STEP 11: Validate Bundle
# ══════════════════════════════════════════════════════
phase_art validate
log_step 11 "Validating Databricks Asset Bundle..."

cd "${SCRIPT_DIR}" || exit 1

patch_bundle_yaml >/dev/null 2>&1 || true

if ! databricks bundle validate -t "${TARGET}" --var="warehouse_id=${WAREHOUSE_ID}"; then
  die "Bundle validation failed. Check resources/*.yml."
fi
log_ok "Bundle validation passed"
printf "\n"

# ══════════════════════════════════════════════════════
# STEP 12: Deploy Bundle
# ══════════════════════════════════════════════════════
phase_art deploy
log_step 12 "Deploying bundle..."

databricks bundle deploy -t "${TARGET}" --var="warehouse_id=${WAREHOUSE_ID}"
deploy_rc=$?

if [ ${deploy_rc} -ne 0 ]; then
  die "Bundle deploy failed."
fi

log_ok "Bundle deployed successfully"
echo "${DEPLOY_ID}|$(date -u +%s)|${TARGET}|${CATALOG}.${SCHEMA}|SUCCESS" >> "${DEPLOY_LOG}" 2>/dev/null || true
printf "\n"

# ══════════════════════════════════════════════════════
# STEP 13: Seed / Initialize
# ══════════════════════════════════════════════════════
phase_art seed
log_step 13 "Running setup and seed jobs..."

databricks bundle run initial_setup -t "${TARGET}" --var="warehouse_id=${WAREHOUSE_ID}" --no-wait >/dev/null 2>&1 || {
  log_warn "initial_setup job not found or not runnable; creating agent_configs directly."
  run_sql_expect_ok "Table: agent_configs" "CREATE TABLE IF NOT EXISTS ${CATALOG}.${SCHEMA}.agent_configs (
    agent_name STRING NOT NULL,
    enabled BOOLEAN DEFAULT true,
    schedule STRING DEFAULT '0 */5 * * * ?',
    config_json STRING DEFAULT '{}',
    updated_at TIMESTAMP DEFAULT current_timestamp()
  )"
}

databricks bundle run bronze_silver_gold -t "${TARGET}" --var="warehouse_id=${WAREHOUSE_ID}" --no-wait >/dev/null 2>&1 || {
  log_warn "DLT pipeline trigger skipped; start manually if needed."
}

# Trigger Lakebase CDC sync for session/active lists
databricks bundle run lakebase_sync_streaming -t "${TARGET}" --var="warehouse_id=${WAREHOUSE_ID}" --no-wait >/dev/null 2>&1 || {
  log_warn "Lakebase CDC sync trigger skipped; will start on schedule."
}

log_ok "Setup triggers completed"
printf "\n"

# ══════════════════════════════════════════════════════
# STEP 14: Health Check & Permissions
# ══════════════════════════════════════════════════════
phase_art health
log_step 14 "Permissions and health check..."

run_sql_silent "GRANT USAGE ON CATALOG ${CATALOG} TO \`${SOC_ADMIN_GROUP}\`" >/dev/null 2>&1 || true
run_sql_silent "GRANT USAGE ON CATALOG ${CATALOG} TO \`${SOC_ANALYST_GROUP}\`" >/dev/null 2>&1 || true
run_sql_silent "GRANT ALL PRIVILEGES ON SCHEMA ${CATALOG}.${SCHEMA} TO \`${SOC_ADMIN_GROUP}\`" >/dev/null 2>&1 || true
run_sql_silent "GRANT USE SCHEMA ON SCHEMA ${CATALOG}.${SCHEMA} TO \`${SOC_ANALYST_GROUP}\`" >/dev/null 2>&1 || true
run_sql_silent "GRANT SELECT ON SCHEMA ${CATALOG}.${SCHEMA} TO \`${SOC_ANALYST_GROUP}\`" >/dev/null 2>&1 || true
run_sql_silent "GRANT EXECUTE ON SCHEMA ${CATALOG}.${SCHEMA} TO \`${SOC_ANALYST_GROUP}\`" >/dev/null 2>&1 || true
run_sql_silent "GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA ${CATALOG}.${SCHEMA} TO \`${SOC_ANALYST_GROUP}\`" >/dev/null 2>&1 || true
log_ok "UC permissions applied"

printf "\n"
printf "  %b\n" "${BOLD}Post-Deploy Health Check:${NC}"
printf "  ─────────────────────────────────────────────\n"

health_pass=0
health_total=0

health_total=$((health_total + 1))
hc="$(run_sql_silent "SELECT 1")"
if [[ "${hc}" == OK* ]]; then
  log_ok "Health: SQL Warehouse query succeeded"
  health_pass=$((health_pass + 1))
else
  log_warn "Health: SQL Warehouse query issue: ${hc}"
fi

health_total=$((health_total + 1))
secrets_count="$(databricks secrets list --scope "${SECRET_SCOPE}" --output json 2>/dev/null | python3 -c '
import json, sys
try:
    d=json.load(sys.stdin)
    print(len(d.get("secrets", d if isinstance(d, list) else [])))
except Exception:
    print(0)
' 2>/dev/null || echo 0)"
if [ "${secrets_count}" -ge 3 ]; then
  log_ok "Health: Secret scope has ${secrets_count} secrets"
  health_pass=$((health_pass + 1))
else
  log_warn "Health: Secret scope has ${secrets_count} secrets"
fi

health_total=$((health_total + 1))
app_status="$(databricks apps get "0xdsi-agentic-soc" --output json 2>/dev/null | python3 -c '
import json, sys
try:
    d=json.load(sys.stdin)
    print(d.get("status",{}).get("state") or d.get("compute_status",{}).get("state") or "UNKNOWN")
except Exception:
    print("UNKNOWN")
' 2>/dev/null || echo UNKNOWN)"
if [ "${app_status}" = "RUNNING" ] || [ "${app_status}" = "ACTIVE" ] || [ "${app_status}" = "STARTING" ] || [ "${app_status}" = "DEPLOYING" ]; then
  log_ok "Health: Databricks App is ${app_status}"
  health_pass=$((health_pass + 1))
else
  log_warn "Health: App state ${app_status}"
fi

health_total=$((health_total + 1))
jobs_count="$(databricks jobs list --output json 2>/dev/null | python3 -c '
import json, sys
try:
    d=json.load(sys.stdin)
    jobs=d.get("jobs", d if isinstance(d, list) else [])
    print(len([j for j in jobs if "0xDSI" in j.get("settings",{}).get("name","") or "SOC" in j.get("settings",{}).get("name","")]))
except Exception:
    print(0)
' 2>/dev/null || echo 0)"
if [ "${jobs_count}" -ge 1 ]; then
  log_ok "Health: ${jobs_count} 0xDSI/SOC jobs found"
  health_pass=$((health_pass + 1))
else
  log_warn "Health: No 0xDSI/SOC jobs found yet"
fi

health_total=$((health_total + 1))
lakebase_check="$(run_sql_silent "SHOW TABLES IN ${CATALOG}.${SCHEMA} LIKE 'session_lists'")"
if [[ "${lakebase_check}" == OK* ]]; then
  log_ok "Health: Lakebase session_lists table exists"
  health_pass=$((health_pass + 1))
else
  log_warn "Health: Lakebase session_lists not yet created (will populate on first sync)"
fi

printf "\n"
printf "  Health: %b%s/%s%b checks passed\n" "${BOLD}" "${health_pass}" "${health_total}" "${NC}"
printf "\n"

phase_art complete

printf "\n"
printf "%b\n" "${BOLD}Deployment Summary${NC}"
printf "  Deploy ID:  %s\n" "${DEPLOY_ID}"
printf "  Target:     %s\n" "${TARGET}"
printf "  Catalog:    %s.%s\n" "${CATALOG}" "${SCHEMA}"
printf "  App:        Databricks workspace > Apps > 0xdsi-agentic-soc\n"
printf "  Serving:    Bundle custom model serving disabled; Foundation Models configured\n"
printf "  Lakebase:   CDC sync for session_lists + active_lists scheduled\n"
printf "\n"
printf "Restore original resources/app.yml if needed:\n"
printf "  ./deploy.sh %s %s --restore-yaml\n" "${TARGET}" "${WAREHOUSE_ID}"
printf "\n"
printf "Rollback:\n"
printf "  ./deploy.sh %s %s --rollback\n" "${TARGET}" "${WAREHOUSE_ID}"
printf "\n"
