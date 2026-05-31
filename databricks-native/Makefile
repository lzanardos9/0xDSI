.PHONY: help install build clean test deploy-dev deploy-staging deploy-prod lint check

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

deploy-dev: build ## Deploy to dev target
	databricks bundle deploy --target dev

deploy-staging: build ## Deploy to staging target
	databricks bundle deploy --target staging

deploy-prod: build ## Deploy to production target
	databricks bundle deploy --target production

deploy: ## One-command deploy (uses deploy.sh)
	./deploy.sh production

# ─────────────────────────────────────────────────────────────────────────────
# Testing
# ─────────────────────────────────────────────────────────────────────────────

test: ## Run smoke tests
	python tests/smoke_test_e2e_pipeline.py
	python tests/smoke_validate_schema.py

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
