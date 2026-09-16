# Compute compatibility matrix

Which compute each part of `databricks-native/` is designed to run on, and the
hard runtime dependencies that make a component fail anywhere else. Scope is the
`databricks-native/` tree only. This is a design/compatibility contract, not a
claim that every path has been executed on every listed compute — items that can
only be verified on a live workspace are marked accordingly.

## Compute types referenced here

- **Job notebook (classic or serverless)** — a Spark driver + Unity Catalog. Has
  an ambient `spark` session and `dbutils`. This is what the batch agents assume.
- **Serverless notebook** — Spark + UC, no fixed cluster. Fine for batch agents
  that do not pin classic-only features (GPU, some streaming triggers).
- **Structured Streaming compute** — a job/serverless cluster running a
  continuous or micro-batch stream (Zerobus / Delta source).
- **Model Serving container** — a stateless Python process. **No `spark`, no
  `dbutils`, no ambient Unity Catalog session.** Serves MLflow pyfunc/ChatModels.
- **Databricks App** — the FastAPI backend. No Spark; reaches Unity Catalog only
  through a SQL Warehouse connection.
- **Ray + GPU** — distributed training cluster (blocked-external here).

## Matrix

| Component | Base class / kind | Target compute | Hard dependency | Runs in Model Serving? |
|-----------|-------------------|----------------|-----------------|------------------------|
| `_shared/*` libraries | pure Python modules | any | none (import-safe) | Yes (as libraries) |
| Batch agents (`01,02,03,08–14,20,21,23,25,27–30,32–47,59,61`) | `BatchAgent` | Job notebook (classic/serverless) | ambient `spark` + UC | No |
| Interactive agents (`05,06,07,15,16,17,18,19,22,24,31,60`) | `InteractiveAgent` | Job notebook today; Serving is the target | tool execution needs a SQL runtime | Only if a SQL runner is injected (see gap) |
| Orchestrator (`04`) | `SupervisorAgent` | Job notebook | ambient `spark` + `dbutils` (routes/invokes sub-agents) | No (uses `dbutils`) |
| Streaming ingestion (`sdp_stream`, raw ingest jobs) | streaming | Structured Streaming compute | Spark streaming + Zerobus/Delta source | No |
| Vector Search index agents (`32`, `61`) | `BatchAgent` | Job notebook | Databricks Vector Search | No |
| ML / Ray training (threat scoring, MC-RNN) | training notebooks | Ray + GPU cluster | Ray, GPU, versioned corpus | No (blocked-external) |
| Serving registration (`setup/04_register_model_serving`) | setup | Job notebook | MLflow UC registry, Serving API | N/A (deploys, not served) |
| Backend API (`app/backend/server.py`) | FastAPI | Databricks App | SQL Warehouse connection (no Spark) | N/A (it is the app) |

Registered for Model Serving today (from `setup/04_register_model_serving.py`):
`0xdsi_ciso_assistant` (15), `0xdsi_sage_enrichment` (05),
`0xdsi_nova_investigation` (06), `0xdsi_vanguard_response` (07),
`0xdsi_threat_radar` (24), `0xdsi_threat_simulator` (22). The other interactive
agents exist but are not yet registered.

## The serving / global-state gap (open)

The single tool executor (`BaseAgent._run_uc_tool` in
`_shared/agent_framework.py`) runs a tool's Unity Catalog function through the
ambient Spark session (`self.spark.sql(...)`). That session exists on job and
serverless notebook compute but **not** in a Model Serving container. So an
interactive agent that is registered and served will resolve its tools but fail
the moment it tries to execute one.

What changed now (Phase 1):

- Tool execution is consolidated into one method used by both batch and
  interactive agents, so there is exactly one place that talks to the runtime.
- That method no longer crashes opaquely when there is no Spark session: it
  raises an explicit error stating that a SQL-capable runtime (or an injected SQL
  runner) is required. This turns a hidden dependency on ambient global compute
  into a stated contract.

What still has to happen to actually serve these agents (not done here, needs a
live workspace to verify):

1. Give `InteractiveAgent` a SQL runner seam (e.g. a `sql_runner` callable
   injected at construction) that defaults to the Spark session on notebook
   compute and, in Serving, is backed by a Databricks SQL Warehouse connection.
   Route `_run_uc_tool` through that seam instead of `self.spark` directly.
2. Package the real agent as an MLflow pyfunc/ChatModel (today `setup/04` logs a
   placeholder), passing configuration explicitly instead of reading notebook
   globals (`cfg`, `dbutils`, `spark`).
3. Remove `dbutils` reliance from the supervisor path (`04`) before it can be
   served, or keep the orchestrator batch-only.

Until step 1 lands, treat the interactive agents as job-notebook components; the
explicit executor error is the guardrail that keeps a served deployment from
silently returning wrong or empty tool results.
