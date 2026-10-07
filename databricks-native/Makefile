.PHONY: help install build clean test gate-offline check-warehouse deploy deploy-dev deploy-staging deploy-prod lint check inventory baseline phase0

# ═══════════════════════════════════════════════════════════════════════════════
# 0xDSI Agentic SOC Platform - Databricks Native
# ═══════════════════════════════════════════════════════════════════════════════

help: ## Show this help
	@echo ""
	@echo "  0xDSI Agentic SOC - Databricks Native"
	@echo "  ══════════════════════════════════════"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$\' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'
	@echo ""

# ─────────────────────────────────────────────────────────────────────────────
# Setup & Build
# ─────────────────────────────────────────────────────────────────────────────

install: ## Install all dependencies (frontend)
	cd app && npm install

build: install ## Build frontend for production
	cd app && VITE_DATABRICKS_MODE=true npm run build
	@echo ""
	@echo "  Build complete: app/dist/"
	@echo ""

clean: ## Remove build artifacts
	rm -rf app/dist app/node_modules

# ─────────────────────────────────────────────────────────────────────────────
# Deployment (Databricks Asset Bundles)
# ─────────────────────────────────────────────────────────────────────────────

WAREHOUSE_ID ?= $(DATABRICKS_WAREHOUSE_ID)

check-warehouse:
	@test -n "$(WAREHOUSE_ID)" || (echo "Set WAREHOUSE_ID=<sql warehouse id>" && exit 1)

deploy-dev: check-warehouse build ## Deploy bundle to dev (bundle only; use deploy.sh for full setup)
	databricks bundle deploy --target dev --var="warehouse_id=$(WAREHOUSE_ID)"

deploy-staging: check-warehouse build ## Deploy bundle to staging (bundle only)
	databricks bundle deploy --target staging --var="warehouse_id=$(WAREHOUSE_ID)"

deploy-prod: check-warehouse build ## Deploy bundle to production (bundle only)
	databricks bundle deploy --target production --var="warehouse_id=$(WAREHOUSE_ID)"

deploy: check-warehouse ## One-command full deploy to dev (uses deploy.sh)
	./deploy.sh dev $(WAREHOUSE_ID)

# ─────────────────────────────────────────────────────────────────────────────
# Testing
# ─────────────────────────────────────────────────────────────────────────────

test: gate-offline ## Run all offline tests

gate-offline: ## Run the full offline hardening gate (notebook syntax + every test file)
	python3 tools/ci/run_offline_gate.py

inventory: ## Regenerate the artifact manifest (docs/engineering/)
	python3 tools/inventory/generate_manifest.py

baseline: ## Record build/compile/test baseline (docs/engineering/)
	python3 tools/inventory/run_baseline.py

phase0: inventory baseline ## Run the Phase 0 honesty gate (inventory + baseline + contract tests)
	python3 tests/contract/test_phase0_inventory.py

lint: ## Lint Python notebooks
	@echo "Checking Python syntax..."
	@find notebooks -name "*.py" -exec python -m py_compile {} \; && echo "All notebooks compile OK"

check: ## Verify project structure and dependencies
	@echo "Checking project structure..."
	@test -f databricks.yml && echo "  [OK] databricks.yml"
	@test -f deploy.sh && echo "  [OK] deploy.sh"
	@test -d notebooks/_shared && echo "  [OK] notebooks/_shared/"
	@test -d notebooks/agents && echo "  [OK] notebooks/agents/"
	@test -d notebooks/correlation && echo "  [OK] notebooks/correlation/"
	@test -d notebooks/detection && echo "  [OK] notebooks/detection/"
	@test -d notebooks/ingestion && echo "  [OK] notebooks/ingestion/"
	@test -d app/frontend/src && echo "  [OK] app/frontend/src/"
	@test -f app/backend/server.py && echo "  [OK] app/backend/server.py"
	@test -f app/package.json && echo "  [OK] app/package.json"
	@echo ""
	@echo "  Notebooks: $$(find notebooks -name '*.py' -not -path '*__pycache__*' | wc -l | tr -d ' ')"
	@echo "  Agents:    $$(ls notebooks/agents/*.py | wc -l | tr -d ' ')"
	@echo "  Frontend:  $$(find app/frontend/src -name '*.tsx' -o -name '*.ts' | wc -l | tr -d ' ') files"
	@echo ""
	@echo "  All checks passed."
