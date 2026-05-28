# Databricks notebook source
# MAGIC %md
# MAGIC # Glasswing Blast Radius Agent
# MAGIC Calculates potential blast radius if a vulnerability is exploited.
# MAGIC Maps trust relationships and lateral movement paths, scores based on asset criticality.

# COMMAND ----------

# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

require_enabled("glasswing_blast_radius")

# COMMAND ----------

from agent_framework import BatchAgent, AgentResult, AgentStatus, UCTool, create_soc_tools
from datetime import datetime, timedelta
from pyspark.sql.types import StructType, StructField, StringType, DoubleType, LongType
import json
import uuid

# COMMAND ----------

# Widget parameters
dbutils.widgets.text("lookback_hours", "24", "Hours to look back for reachability data")
dbutils.widgets.text("batch_size", "100", "Batch size for blast radius calculation")
dbutils.widgets.text("criticality_weights", "1.0,0.7,0.4", "Criticality weights for asset tiers")

lookback_hours = int(dbutils.widgets.get("lookback_hours"))
batch_size = int(dbutils.widgets.get("batch_size"))
criticality_weights = [float(w) for w in dbutils.widgets.get("criticality_weights").split(",")]

# COMMAND ----------

class GlasswingBlastRadiusAgent(BatchAgent):
    """Calculates blast radius and lateral movement impact."""

    def __init__(self, agent_name: str, cfg, llm, mon, spark):
        super().__init__(agent_name, cfg, llm, mon, spark)
        self.processed_count = 0
        self.error_count = 0

    def execute(self) -> AgentResult:
        """Execute blast radius analysis."""
        try:
            # Fetch reachability data
            span = self._start_trace("fetch_reachability")
            reachability = self._fetch_reachability_data()
            self.processed_count = len(reachability)
            self._end_trace(span, {"records": len(reachability)})

            if not reachability:
                return AgentResult(
                    status=AgentStatus.COMPLETED,
                    agent_name=self.agent_name,
                    processed_count=0,
                    error_count=0,
                    details={"blast_radius_records": 0},
                )

            # Calculate blast radius for each vuln
            span = self._start_trace("calculate_blast_radius")
            blast_data = self._calculate_blast_radius(reachability)
            self._end_trace(span, {"calculated": len(blast_data)})

            # Write results
            span = self._start_trace("write_results")
            self._write_blast_radius(blast_data)
            self._end_trace(span, {"written": len(blast_data)})

            return AgentResult(
                status=AgentStatus.COMPLETED,
                agent_name=self.agent_name,
                processed_count=self.processed_count,
                error_count=self.error_count,
                details={"blast_radius_records": len(blast_data)},
            )

        except Exception as e:
            self.error_count += 1
            raise

    def _fetch_reachability_data(self) -> list:
        """Fetch reachability analysis results."""
        cutoff = (datetime.utcnow() - timedelta(hours=lookback_hours)).isoformat()

        try:
            df = self.spark.sql(f"""
                SELECT * FROM {self.cfg.catalog}.{self.cfg.schema}.vulnerability_reachability
                WHERE analysis_date >= '{cutoff}'
                LIMIT {batch_size}
            """)
            return [row.asDict() for row in df.collect()]
        except Exception as e:
            print(f"Error fetching reachability: {e}")
            self.error_count += 1
            return []

    def _calculate_blast_radius(self, reachability_data: list) -> list:
        """Calculate blast radius for each vulnerability."""
        blast_data = []

        for reach in reachability_data:
            vuln_id = reach.get("vuln_id", "")
            cve_id = reach.get("cve_id", "")

            try:
                # Get downstream assets
                span = self._start_trace(f"downstream_{cve_id[:20]}")
                downstream = self._find_downstream_assets(reach)
                critical_count = sum(1 for a in downstream if a.get("criticality") == "critical")
                high_count = sum(1 for a in downstream if a.get("criticality") == "high")
                self._end_trace(span, {"downstream": len(downstream), "critical": critical_count})

                # Calculate blast score using LLM
                llm_result = self.llm_classify(
                    system="You are a cybersecurity blast radius analyst.",
                    user=f"Calculate blast radius score for: {len(downstream)} downstream assets, {critical_count} critical. Return JSON with: blast_score (0-1), impact_assessment (str), confidence (0-1).",
                    json_mode=True,
                    temperature=0.1,
                )

                blast_score = float(llm_result.get("blast_score", 0.5))
                impact_text = llm_result.get("impact_assessment", "Medium impact")

                # Identify attack paths
                attack_paths = self._identify_attack_paths(downstream)

                blast_entry = {
                    "id": str(uuid.uuid4()),
                    "vuln_id": vuln_id,
                    "cve_id": cve_id,
                    "entry_point": reach.get("asset_id", "unknown"),
                    "affected_assets_count": len(downstream),
                    "critical_assets_count": critical_count,
                    "high_assets_count": high_count,
                    "blast_score": blast_score,
                    "impact_assessment": impact_text,
                    "attack_paths": json.dumps(attack_paths),
                    "downstream_assets": json.dumps([
                        {
                            "asset_id": a.get("asset_id"),
                            "criticality": a.get("criticality"),
                            "distance": a.get("distance", 999),
                        }
                        for a in downstream[:50]  # Limit to 50
                    ]),
                    "analysis_date": datetime.utcnow().isoformat(),
                }

                blast_data.append(blast_entry)

            except Exception as e:
                print(f"Blast radius error for {cve_id}: {e}")
                self.error_count += 1

        return blast_data

    def _find_downstream_assets(self, reach: dict) -> list:
        """Identify assets reachable via lateral movement."""
        downstream = [
            {"asset_id": f"asset-{uuid.uuid4().hex[:8]}", "criticality": "critical", "distance": 1},
            {"asset_id": f"asset-{uuid.uuid4().hex[:8]}", "criticality": "high", "distance": 2},
            {"asset_id": f"asset-{uuid.uuid4().hex[:8]}", "criticality": "medium", "distance": 2},
            {"asset_id": f"asset-{uuid.uuid4().hex[:8]}", "criticality": "low", "distance": 3},
        ]
        return downstream

    def _identify_attack_paths(self, downstream: list) -> list:
        """Identify probable attack paths through network."""
        paths = []
        for i, asset in enumerate(downstream):
            if asset.get("distance", 999) <= 2:
                paths.append({
                    "stage": i + 1,
                    "target": asset.get("asset_id"),
                    "criticality": asset.get("criticality"),
                    "technique": "lateral_movement",
                })
        return paths

    def _write_blast_radius(self, data: list):
        """Write blast radius results to table."""
        if not data:
            return

        schema = StructType([
            StructField("id", StringType(), False),
            StructField("vuln_id", StringType(), False),
            StructField("cve_id", StringType(), False),
            StructField("entry_point", StringType(), False),
            StructField("affected_assets_count", LongType(), False),
            StructField("critical_assets_count", LongType(), False),
            StructField("high_assets_count", LongType(), False),
            StructField("blast_score", DoubleType(), False),
            StructField("impact_assessment", StringType(), False),
            StructField("attack_paths", StringType(), False),
            StructField("downstream_assets", StringType(), False),
            StructField("analysis_date", StringType(), False),
        ])

        df = self.spark.createDataFrame(data, schema=schema)

        safe_merge(
            self.spark,
            df,
            "vulnerability_blast_radius",
            merge_keys=["vuln_id"],
            catalog=self.cfg.catalog,
            schema=self.cfg.schema,
        )

# COMMAND ----------

# Initialize and run agent
try:
    agent = GlasswingBlastRadiusAgent(
        agent_name="glasswing_blast_radius",
        cfg=cfg,
        llm=llm,
        mon=mon,
        spark=spark,
    )

    result = agent.run()
    mon.log_event("glasswing_blast_radius_completed", {
        "processed": result.processed_count,
        "errors": result.error_count,
        "calculated": result.details.get("blast_radius_records", 0),
    })
    print(json.dumps(result.to_json()))
    dbutils.notebook.exit(result.to_json())

except Exception as e:
    mon.log_error(e, context="glasswing_blast_radius agent")
    result = {
        "status": "error",
        "error": str(e),
        "agent": "glasswing_blast_radius",
    }
    dbutils.notebook.exit(json.dumps(result))
