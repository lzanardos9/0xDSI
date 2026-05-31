# Databricks notebook source
# MAGIC %md
# MAGIC # Model Serving: Register Interactive Agents
# MAGIC
# MAGIC Registers all interactive agents as MLflow ChatModels in Unity Catalog,
# MAGIC then creates Model Serving endpoints for each.
# MAGIC
# MAGIC **Prerequisites:**
# MAGIC - Foundation Model API access enabled in workspace
# MAGIC - Unity Catalog schema created (run 01_create_catalog_schema first)
# MAGIC
# MAGIC **Registered Models:**
# MAGIC - 0xdsi_ciso_assistant (Agent 15)
# MAGIC - 0xdsi_sage_enrichment (Agent 05)
# MAGIC - 0xdsi_nova_investigation (Agent 06)
# MAGIC - 0xdsi_vanguard_response (Agent 07)
# MAGIC - 0xdsi_threat_radar (Agent 24)
# MAGIC - 0xdsi_threat_simulator (Agent 22)

# COMMAND ----------

# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

import mlflow
from mlflow.models import infer_signature
from databricks.sdk import WorkspaceClient
from databricks.sdk.service.serving import (
    EndpointCoreConfigInput,
    ServedEntityInput,
    AutoCaptureConfigInput,
)

w = WorkspaceClient()
catalog = cfg.catalog
schema = cfg.schema

INTERACTIVE_AGENTS = {
    "0xdsi_ciso_assistant": {
        "notebook": "agents/15_ciso_assistant",
        "description": "Executive security advisor with UC tool access",
        "workload_size": "Small",
    },
    "0xdsi_sage_enrichment": {
        "notebook": "agents/05_sage_enrichment",
        "description": "Security analytics and graphical enrichment agent",
        "workload_size": "Small",
    },
    "0xdsi_nova_investigation": {
        "notebook": "agents/06_nova_investigation",
        "description": "Network observation and vulnerability assessment",
        "workload_size": "Small",
    },
    "0xdsi_vanguard_response": {
        "notebook": "agents/07_vanguard_response",
        "description": "Automated response and defense coordination",
        "workload_size": "Small",
    },
    "0xdsi_threat_radar": {
        "notebook": "agents/24_threat_radar",
        "description": "Emerging threat monitoring and intelligence",
        "workload_size": "Small",
    },
    "0xdsi_threat_simulator": {
        "notebook": "agents/22_threat_simulator",
        "description": "Attack scenario simulation and validation",
        "workload_size": "Small",
    },
}

# COMMAND ----------

# MAGIC %md
# MAGIC ## Step 1: Register Models in Unity Catalog

# COMMAND ----------

registered = []
skipped = []

mlflow.set_registry_uri("databricks-uc")

for model_name, config in INTERACTIVE_AGENTS.items():
    uc_model_path = f"{catalog}.{schema}.{model_name}"

    try:
        existing = w.registered_models.get(uc_model_path)
        if existing:
            print(f"  EXISTS  {uc_model_path} (already registered)")
            registered.append(model_name)
            continue
    except Exception:
        pass

    try:
        # Register a placeholder ChatModel that will be updated when agent notebook runs
        with mlflow.start_run(run_name=f"register_{model_name}"):
            from mlflow.pyfunc import PythonModel

            class PlaceholderChatModel(PythonModel):
                def predict(self, context, model_input):
                    return [{"content": f"{model_name} is initializing. Run the agent notebook first."}]

            mlflow.pyfunc.log_model(
                artifact_path="model",
                python_model=PlaceholderChatModel(),
                registered_model_name=uc_model_path,
                pip_requirements=["mlflow>=2.9.0"],
            )

        print(f"  REGISTERED  {uc_model_path}")
        registered.append(model_name)

    except Exception as e:
        print(f"  SKIPPED  {uc_model_path}: {str(e)[:100]}")
        skipped.append({"model": model_name, "error": str(e)[:100]})

# COMMAND ----------

# MAGIC %md
# MAGIC ## Step 2: Create Model Serving Endpoints

# COMMAND ----------

endpoints_created = []
endpoints_existing = []
endpoints_failed = []

for model_name, config in INTERACTIVE_AGENTS.items():
    endpoint_name = model_name.replace("_", "-")
    uc_model_path = f"{catalog}.{schema}.{model_name}"

    if model_name not in registered:
        print(f"  SKIP  {endpoint_name} (model not registered)")
        continue

    try:
        existing = w.serving_endpoints.get(endpoint_name)
        if existing:
            print(f"  EXISTS  {endpoint_name}")
            endpoints_existing.append(endpoint_name)
            continue
    except Exception:
        pass

    try:
        w.serving_endpoints.create(
            name=endpoint_name,
            config=EndpointCoreConfigInput(
                served_entities=[
                    ServedEntityInput(
                        entity_name=uc_model_path,
                        entity_version="1",
                        workload_size=config["workload_size"],
                        scale_to_zero_enabled=True,
                    )
                ],
                auto_capture_config=AutoCaptureConfigInput(
                    catalog_name=catalog,
                    schema_name=schema,
                    enabled=True,
                ),
            ),
        )
        print(f"  CREATED  {endpoint_name} (scale-to-zero enabled)")
        endpoints_created.append(endpoint_name)

    except Exception as e:
        err_msg = str(e)[:150]
        if "already exists" in err_msg.lower():
            print(f"  EXISTS  {endpoint_name}")
            endpoints_existing.append(endpoint_name)
        else:
            print(f"  FAILED  {endpoint_name}: {err_msg}")
            endpoints_failed.append({"endpoint": endpoint_name, "error": err_msg})

# COMMAND ----------

# MAGIC %md
# MAGIC ## Summary

# COMMAND ----------

print("\n" + "=" * 60)
print(" MODEL SERVING REGISTRATION COMPLETE")
print("=" * 60)
print(f"""
  Models Registered:    {len(registered)}
  Models Skipped:       {len(skipped)}
  Endpoints Created:    {len(endpoints_created)}
  Endpoints Existing:   {len(endpoints_existing)}
  Endpoints Failed:     {len(endpoints_failed)}
""")

if endpoints_failed:
    print("Failed endpoints:")
    for f in endpoints_failed:
        print(f"  - {f['endpoint']}: {f['error']}")

if skipped:
    print("Skipped models:")
    for s in skipped:
        print(f"  - {s['model']}: {s['error']}")

mon.log_complete(details={
    "models_registered": len(registered),
    "endpoints_created": len(endpoints_created),
    "endpoints_failed": len(endpoints_failed),
})

dbutils.notebook.exit(json.dumps({
    "status": "COMPLETE",
    "models": len(registered),
    "endpoints_created": len(endpoints_created),
    "endpoints_existing": len(endpoints_existing),
}))
