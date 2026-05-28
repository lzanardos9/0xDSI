# Databricks notebook source
# MAGIC %md
# MAGIC # Glasswing Auto-Patch Recommendation Agent
# MAGIC Generates patching priorities and recommendations using LLM assessment of compatibility.
# MAGIC Creates maintenance windows and rollback plans for safe patch deployment.

# COMMAND ----------

# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

require_enabled("glasswing_auto_patch")

# COMMAND ----------

from agent_framework import BatchAgent, AgentResult, AgentStatus, UCTool, create_soc_tools
from datetime import datetime, timedelta
from pyspark.sql.types import StructType, StructField, StringType, DoubleType, LongType
import json
import uuid

# COMMAND ----------

# Widget parameters
dbutils.widgets.text("lookback_hours", "24", "Hours to look back for blast radius data")
dbutils.widgets.text("batch_size", "50", "Batch size for patch recommendations")
dbutils.widgets.text("maintenance_window_hours", "4", "Maintenance window duration in hours")

lookback_hours = int(dbutils.widgets.get("lookback_hours"))
batch_size = int(dbutils.widgets.get("batch_size"))
maint_window_hours = int(dbutils.widgets.get("maintenance_window_hours"))

# COMMAND ----------

class GlasswingAutoPatchAgent(BatchAgent):
    """Generates patch recommendations with LLM risk assessment."""

    def __init__(self, agent_name: str, cfg, llm, mon, spark):
        super().__init__(agent_name, cfg, llm, mon, spark)
        self.processed_count = 0
        self.error_count = 0

    def execute(self) -> AgentResult:
        """Execute patch recommendation generation."""
        try:
            # Fetch blast radius data
            span = self._start_trace("fetch_blast_data")
            blast_data = self._fetch_blast_radius_data()
            self.processed_count = len(blast_data)
            self._end_trace(span, {"records": len(blast_data)})

            if not blast_data:
                return AgentResult(
                    status=AgentStatus.COMPLETED,
                    agent_name=self.agent_name,
                    processed_count=0,
                    error_count=0,
                    details={"patch_recommendations": 0},
                )

            # Generate patch recommendations
            span = self._start_trace("generate_recommendations")
            recommendations = self._generate_recommendations(blast_data)
            self._end_trace(span, {"generated": len(recommendations)})

            # Write results
            span = self._start_trace("write_results")
            self._write_recommendations(recommendations)
            self._end_trace(span, {"written": len(recommendations)})

            return AgentResult(
                status=AgentStatus.COMPLETED,
                agent_name=self.agent_name,
                processed_count=self.processed_count,
                error_count=self.error_count,
                details={"patch_recommendations": len(recommendations)},
            )

        except Exception as e:
            self.error_count += 1
            raise

    def _fetch_blast_radius_data(self) -> list:
        """Fetch blast radius analysis results."""
        cutoff = (datetime.utcnow() - timedelta(hours=lookback_hours)).isoformat()

        try:
            df = self.spark.sql(f"""
                SELECT * FROM {self.cfg.catalog}.{self.cfg.schema}.vulnerability_blast_radius
                WHERE analysis_date >= '{cutoff}'
                ORDER BY blast_score DESC
                LIMIT {batch_size}
            """)
            return [row.asDict() for row in df.collect()]
        except Exception as e:
            print(f"Error fetching blast data: {e}")
            self.error_count += 1
            return []

    def _generate_recommendations(self, blast_data: list) -> list:
        """Generate patch recommendations using LLM."""
        recommendations = []

        for blast in blast_data:
            vuln_id = blast.get("vuln_id", "")
            cve_id = blast.get("cve_id", "")
            blast_score = float(blast.get("blast_score", 0.5))

            try:
                # Use LLM to assess patch strategy
                span = self._start_trace(f"llm_patch_{cve_id[:20]}")

                llm_result = self.llm_classify(
                    system="You are a patch management expert focused on minimizing downtime and risk.",
                    user=f"""For CVE {cve_id} affecting {blast.get('affected_assets_count', 0)} assets (blast score: {blast_score}):
                    Generate a safe patching strategy. Return JSON with:
                    - priority_score (0-1)
                    - compatibility_risk (0-1)
                    - recommended_strategy (string: "immediate"|"staged"|"monitored")
                    - estimated_time_minutes (integer)
                    - rollback_steps (array of strings)
                    """,
                    json_mode=True,
                    temperature=0.2,
                )

                priority = float(llm_result.get("priority_score", blast_score))
                compat_risk = float(llm_result.get("compatibility_risk", 0.3))
                strategy = llm_result.get("recommended_strategy", "staged")
                est_time = int(llm_result.get("estimated_time_minutes", 30))
                rollback = llm_result.get("rollback_steps", ["Revert to previous version"])

                self._end_trace(span, {
                    "cve_id": cve_id,
                    "priority": priority,
                    "strategy": strategy,
                })

            except Exception as e:
                print(f"LLM patch error for {cve_id}: {e}")
                self.error_count += 1
                # Fallback values
                priority = blast_score
                compat_risk = 0.5
                strategy = "staged" if blast_score > 0.7 else "monitored"
                est_time = 60
                rollback = ["Restore from backup"]

            # Calculate recommended window
            now = datetime.utcnow()
            if strategy == "immediate":
                window_start = now + timedelta(hours=1)
            elif strategy == "staged":
                window_start = now + timedelta(hours=24)
            else:
                window_start = now + timedelta(hours=48)

            window_end = window_start + timedelta(hours=maint_window_hours)

            patch_rec = {
                "id": str(uuid.uuid4()),
                "vuln_id": vuln_id,
                "cve_id": cve_id,
                "affected_assets": blast.get("affected_assets_count", 0),
                "critical_assets": blast.get("critical_assets_count", 0),
                "priority_score": priority,
                "compatibility_risk": compat_risk,
                "patch_strategy": strategy,
                "estimated_patch_time_minutes": est_time,
                "recommended_window_start": window_start.isoformat(),
                "recommended_window_end": window_end.isoformat(),
                "rollback_plan": json.dumps(rollback),
                "rollback_validation_steps": json.dumps([
                    "Monitor error rates for 5 minutes",
                    "Check service health endpoints",
                    "Verify database connectivity",
                ]),
                "blast_score": blast.get("blast_score", 0.5),
                "created_at": datetime.utcnow().isoformat(),
            }

            recommendations.append(patch_rec)

        return recommendations

    def _write_recommendations(self, data: list):
        """Write patch recommendations to table."""
        if not data:
            return

        schema = StructType([
            StructField("id", StringType(), False),
            StructField("vuln_id", StringType(), False),
            StructField("cve_id", StringType(), False),
            StructField("affected_assets", LongType(), False),
            StructField("critical_assets", LongType(), False),
            StructField("priority_score", DoubleType(), False),
            StructField("compatibility_risk", DoubleType(), False),
            StructField("patch_strategy", StringType(), False),
            StructField("estimated_patch_time_minutes", LongType(), False),
            StructField("recommended_window_start", StringType(), False),
            StructField("recommended_window_end", StringType(), False),
            StructField("rollback_plan", StringType(), False),
            StructField("rollback_validation_steps", StringType(), False),
            StructField("blast_score", DoubleType(), False),
            StructField("created_at", StringType(), False),
        ])

        df = self.spark.createDataFrame(data, schema=schema)

        safe_merge(
            self.spark,
            df,
            "patch_recommendations",
            merge_keys=["vuln_id"],
            catalog=self.cfg.catalog,
            schema=self.cfg.schema,
        )

# COMMAND ----------

# Initialize and run agent
try:
    agent = GlasswingAutoPatchAgent(
        agent_name="glasswing_auto_patch",
        cfg=cfg,
        llm=llm,
        mon=mon,
        spark=spark,
    )

    result = agent.run()
    mon.log_event("glasswing_auto_patch_completed", {
        "processed": result.processed_count,
        "errors": result.error_count,
        "recommendations": result.details.get("patch_recommendations", 0),
    })
    print(json.dumps(result.to_json()))
    dbutils.notebook.exit(result.to_json())

except Exception as e:
    mon.log_error(e, context="glasswing_auto_patch agent")
    result = {
        "status": "error",
        "error": str(e),
        "agent": "glasswing_auto_patch",
    }
    dbutils.notebook.exit(json.dumps(result))
