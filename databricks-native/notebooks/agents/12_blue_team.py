# Databricks notebook source
# MAGIC %md
# MAGIC # Agent 12 - Blue Team Defense Validation (Mosaic AI Agent Framework)
# MAGIC Analyzes detection coverage against MITRE ATT&CK matrix. Identifies gaps,
# MAGIC calculates MTTD per severity, validates defensive controls.

# COMMAND ----------

# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

require_enabled("blue_team")

# COMMAND ----------

import json
from datetime import datetime
from pyspark.sql import functions as F
from pyspark.sql.window import Window
import mlflow
from agent_framework import BatchAgent, AgentResult, AgentStatus, UCTool, create_soc_tools

# COMMAND ----------

# MAGIC %md
# MAGIC ## MITRE ATT&CK Technique Definitions

# COMMAND ----------

MITRE_TECHNIQUES = [
    {"id": "T1566.001", "tactic": "initial_access", "name": "Spearphishing Attachment"},
    {"id": "T1059.001", "tactic": "execution", "name": "PowerShell"},
    {"id": "T1053.005", "tactic": "persistence", "name": "Scheduled Task"},
    {"id": "T1068", "tactic": "privilege_escalation", "name": "Exploitation for Privilege Escalation"},
    {"id": "T1070.004", "tactic": "defense_evasion", "name": "File Deletion"},
    {"id": "T1003.001", "tactic": "credential_access", "name": "LSASS Memory"},
    {"id": "T1083", "tactic": "discovery", "name": "File and Directory Discovery"},
    {"id": "T1021.002", "tactic": "lateral_movement", "name": "SMB/Windows Admin Shares"},
    {"id": "T1560.001", "tactic": "collection", "name": "Archive via Utility"},
    {"id": "T1048.003", "tactic": "exfiltration", "name": "Exfiltration Over Unencrypted Protocol"},
    {"id": "T1486", "tactic": "impact", "name": "Data Encrypted for Impact"},
    {"id": "T1110.004", "tactic": "credential_access", "name": "Credential Stuffing"},
    {"id": "T1195.002", "tactic": "initial_access", "name": "Compromise Software Supply Chain"},
    {"id": "T1078", "tactic": "initial_access", "name": "Valid Accounts"},
    {"id": "T1071.001", "tactic": "command_and_control", "name": "Web Protocols"},
    {"id": "T1562.001", "tactic": "defense_evasion", "name": "Disable or Modify Tools"},
    {"id": "T1046", "tactic": "discovery", "name": "Network Service Discovery"},
    {"id": "T1027", "tactic": "defense_evasion", "name": "Obfuscated Files or Information"},
    {"id": "T1105", "tactic": "command_and_control", "name": "Ingress Tool Transfer"},
    {"id": "T1036.005", "tactic": "defense_evasion", "name": "Match Legitimate Name or Location"},
]

# COMMAND ----------

# MAGIC %md
# MAGIC ## Blue Team Agent Implementation

# COMMAND ----------

class BlueTeamAgent(BatchAgent):
    """
    Blue Team Defense Validation Agent.
    Validates defensive controls and detection coverage.
    """

    def __init__(self, agent_name: str, cfg, llm, mon, spark):
        super().__init__(agent_name, cfg, llm, mon, spark)

        # Register tools for detection queries
        for tool in create_soc_tools(cfg):
            if tool.name in ["search_events", "get_asset_info"]:
                self.register_tool(tool)

    def execute(self) -> AgentResult:
        """Execute blue team analysis."""
        processed_count = 0
        error_count = 0

        try:
            rules_table = cfg.get_table_path("correlation_rules")
            alerts_table = cfg.get_table_path("alerts")
            events_table = cfg.get_table_path("events")

            # Load active rules
            with mon.time("load_rules"):
                rules_df = spark.read.table(rules_table).filter(F.col("status") == "active")
                covered_techniques = (
                    rules_df
                    .select(F.explode(F.from_json(F.col("mitre_mapping"), "array<string>")).alias("technique"))
                    .distinct()
                )
                processed_count = rules_df.count()
                mon.log_event("rules_loaded", {"active_rules": processed_count})

            # Analyze coverage gaps
            with mon.time("gap_analysis"):
                gaps_result = self._analyze_coverage_gaps(covered_techniques)
                total_techniques = gaps_result["total"]
                covered_count = gaps_result["covered"]
                gap_count = gaps_result["gap_count"]
                coverage_pct = gaps_result["coverage_pct"]
                gaps_df = gaps_result["gaps_df"]

            # Calculate MTTD per severity
            with mon.time("mttd_calculation"):
                mttd_summary = self._calculate_mttd(alerts_table, events_table)

            # Generate LLM recommendations for top gaps
            with mon.time("llm_recommendations"):
                recommendations = self._generate_recommendations(gaps_df)

            # Store results in blue_team_coverage table
            with mon.time("store_results"):
                analysis_id = f"bt_{datetime.utcnow().strftime('%Y%m%d%H%M%S')}"
                self._store_analysis(
                    analysis_id, total_techniques, covered_count, coverage_pct,
                    gap_count, mttd_summary, gaps_df, recommendations
                )

            # Log MLflow metrics
            mlflow.set_experiment(f"/0xDSI/agents/{self.agent_name}")
            with mlflow.start_run(run_name=f"blue_team_{analysis_id}"):
                mlflow.log_params({
                    "agent": self.agent_name,
                    "total_techniques": total_techniques,
                })
                mlflow.log_metrics({
                    "covered_techniques": covered_count,
                    "coverage_pct": coverage_pct,
                    "gap_count": gap_count,
                    "avg_mttd_seconds": mttd_summary.get("overall_avg_mttd", 0),
                })

            mon.log_complete("blue_team_analysis", {
                "coverage_pct": round(coverage_pct, 2),
                "gap_count": gap_count,
                "recommendations": len(recommendations),
            })

            status = AgentStatus.COMPLETED if coverage_pct >= 70 else AgentStatus.DEGRADED

            return AgentResult(
                status=status,
                agent_name=self.agent_name,
                processed_count=processed_count,
                error_count=error_count,
                details={
                    "coverage_pct": round(coverage_pct, 2),
                    "total_techniques": total_techniques,
                    "covered_techniques": covered_count,
                    "gaps_found": gap_count,
                    "recommendations_generated": len(recommendations),
                    "mttd_average": round(mttd_summary.get("overall_avg_mttd", 0), 2),
                },
            )

        except Exception as e:
            error_count += 1
            mon.log_error(e, context="blue_team")
            raise

    def _analyze_coverage_gaps(self, covered_techniques):
        """Identify MITRE techniques not covered by existing rules."""
        mitre_df = spark.createDataFrame(MITRE_TECHNIQUES)

        gaps_df = (
            mitre_df.alias("m")
            .join(
                covered_techniques.alias("c"),
                mitre_df["id"] == covered_techniques["technique"],
                "left_anti"
            )
        )

        gap_count = gaps_df.count()
        total_techniques = mitre_df.count()
        covered_count = total_techniques - gap_count
        coverage_pct = (covered_count / total_techniques) * 100 if total_techniques > 0 else 0.0

        mon.log_event("coverage_gaps_identified", {
            "total_techniques": total_techniques,
            "covered": covered_count,
            "gaps": gap_count,
            "coverage_pct": round(coverage_pct, 2),
        })

        return {
            "total": total_techniques,
            "covered": covered_count,
            "gap_count": gap_count,
            "coverage_pct": coverage_pct,
            "gaps_df": gaps_df,
        }

    def _calculate_mttd(self, alerts_table, events_table):
        """Calculate Mean Time To Detect (MTTD) per severity."""
        try:
            alerts_with_events = (
                spark.read.table(alerts_table).alias("a")
                .join(
                    spark.read.table(events_table).alias("e"),
                    F.col("a.source_event_id") == F.col("e.event_id"),
                    "inner"
                )
                .withColumn(
                    "detection_lag_seconds",
                    F.unix_timestamp(F.col("a.created_at")) - F.unix_timestamp(F.col("e.timestamp"))
                )
                .filter(F.col("detection_lag_seconds") > 0)
                .filter(F.col("detection_lag_seconds") < 86400)
            )

            mttd_by_severity = (
                alerts_with_events
                .groupBy("a.severity")
                .agg(
                    F.avg("detection_lag_seconds").alias("avg_mttd_seconds"),
                    F.expr("percentile_approx(detection_lag_seconds, 0.5)").alias("median_mttd_seconds"),
                    F.expr("percentile_approx(detection_lag_seconds, 0.95)").alias("p95_mttd_seconds"),
                    F.count("*").alias("sample_size"),
                )
            )

            mttd_results = mttd_by_severity.collect()
            mttd_summary = {
                row.severity: {
                    "avg": round(float(row.avg_mttd_seconds), 2),
                    "p95": round(float(row.p95_mttd_seconds), 2),
                    "median": round(float(row.median_mttd_seconds), 2),
                    "sample_size": int(row.sample_size),
                }
                for row in mttd_results
            }

            # Calculate overall average
            overall_avg = sum(row.avg_mttd_seconds for row in mttd_results) / max(1, len(mttd_results))
            mttd_summary["overall_avg_mttd"] = overall_avg

            mon.log_event("mttd_calculated", {"severities_analyzed": len(mttd_results)})

            return mttd_summary

        except Exception as e:
            mon.log_warning(f"MTTD calculation failed: {e}")
            return {"overall_avg_mttd": 0}

    def _generate_recommendations(self, gaps_df):
        """Generate LLM recommendations for top coverage gaps."""
        recommendations = []

        try:
            top_gaps = gaps_df.limit(5).collect()

            for gap in top_gaps:
                prompt = (
                    f"Recommend a detection rule for MITRE ATT&CK technique {gap['id']} "
                    f"({gap['name']}, tactic: {gap['tactic']}). "
                    f"Return JSON with fields: rule_name, detection_logic, data_sources (array), "
                    f"false_positive_notes, estimated_fidelity (high/medium/low)."
                )
                try:
                    rec = self.llm_classify(
                        system="You are a SOC detection engineer.",
                        user=prompt,
                        json_mode=True
                    )
                    if "raw_content" not in rec:
                        rec["technique_id"] = gap["id"]
                        rec["tactic"] = gap["tactic"]
                        recommendations.append(rec)
                except Exception as e:
                    mon.log_warning(f"LLM recommendation failed for {gap['id']}: {e}")

            mon.log_event("recommendations_generated", {"count": len(recommendations)})

        except Exception as e:
            mon.log_warning(f"Recommendation generation failed: {e}")

        return recommendations

    def _store_analysis(self, analysis_id, total_techniques, covered_count,
                       coverage_pct, gap_count, mttd_summary, gaps_df, recommendations):
        """Store analysis results in blue_team_coverage table."""
        coverage_table = cfg.get_table_path("blue_team_assessments")

        top_gaps = gaps_df.limit(5).collect()

        analysis_record = [{
            "analysis_id": analysis_id,
            "run_timestamp": datetime.utcnow(),
            "total_techniques": total_techniques,
            "covered_techniques": covered_count,
            "coverage_score": coverage_pct / 100.0,
            "gap_count": gap_count,
            "mttd_summary": json.dumps(mttd_summary, default=str),
            "gap_techniques": json.dumps([{"id": g["id"], "name": g["name"]} for g in top_gaps]),
            "recommendations": json.dumps(recommendations, default=str),
            "status": "healthy" if coverage_pct >= 70 else "gaps_identified",
        }]

        analysis_df = spark.createDataFrame(analysis_record)
        safe_append(analysis_df, coverage_table, catalog=cfg.catalog, schema=cfg.schema)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Execute Agent

# COMMAND ----------

agent = BlueTeamAgent("blue_team_agent", cfg, llm, mon, spark)
result = agent.run()

dbutils.notebook.exit(result.to_json())
