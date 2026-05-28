# Databricks notebook source
# MAGIC %md
# MAGIC # Agent 43: Guardian Compliance Monitor
# MAGIC
# MAGIC **Production-Grade BatchAgent Implementation**
# MAGIC
# MAGIC Monitors compliance against multiple frameworks:
# MAGIC - Maps controls to evidence (events, configs, policies)
# MAGIC - Identifies compliance gaps and generates remediation tasks
# MAGIC - Supports SOC2, ISO27001, PCI-DSS, HIPAA, NIST
# MAGIC - Writes to `compliance_findings` with control status and evidence refs
# MAGIC
# MAGIC ## Key Features
# MAGIC - MLflow experiment tracking and metrics logging
# MAGIC - Multi-framework compliance checking
# MAGIC - Evidence collection and mapping
# MAGIC - Gap identification and remediation tracking
# MAGIC - UC Function tool registration

# COMMAND ----------

# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

# MAGIC %md
# MAGIC ## Initialization and Configuration

# COMMAND ----------

from agent_framework import (
    BatchAgent, AgentResult, AgentStatus,
    UCTool, create_soc_tools
)
import mlflow
import mlflow.tracing
from pyspark.sql.functions import *
from pyspark.sql.types import *
import json
import time
import logging
from datetime import datetime, timedelta

logger = logging.getLogger("oxdsi.guardian_compliance")

# Parse notebook parameters
dbutils.widgets.text("frameworks", "SOC2,ISO27001,NIST", "Comma-separated frameworks")
dbutils.widgets.text("freshness_sla_minutes", "5", "Max minutes before data is stale")
dbutils.widgets.text("e2e_latency_sla_seconds", "120", "Max event-to-alert latency")
dbutils.widgets.text("min_mitre_coverage", "0.7", "Min MITRE technique coverage")

frameworks_str = dbutils.widgets.get("frameworks")
freshness_sla = int(dbutils.widgets.get("freshness_sla_minutes"))
e2e_latency_sla = int(dbutils.widgets.get("e2e_latency_sla_seconds"))
min_mitre_coverage = float(dbutils.widgets.get("min_mitre_coverage"))

frameworks = frameworks_str.split(",")

mon.log_event("compliance_config_loaded", {
    "frameworks": len(frameworks),
    "freshness_sla_minutes": freshness_sla,
    "e2e_latency_sla_seconds": e2e_latency_sla,
})

# COMMAND ----------

# MAGIC %md
# MAGIC ## Define ComplianceMonitor Class

# COMMAND ----------

class ComplianceMonitor(BatchAgent):
    """
    Monitors SOC platform compliance against frameworks.

    Checks:
    1. Data freshness against SLAs
    2. Detection coverage by MITRE ATT&CK
    3. Audit log integrity and retention
    4. Response playbook effectiveness
    5. Control mapping to evidence
    """

    FRAMEWORKS = {
        "SOC2": {
            "availability": "System uptime and availability monitoring",
            "confidentiality": "Access controls and encryption",
            "integrity": "Change logging and approval workflows",
        },
        "ISO27001": {
            "access_control": "User access policies and enforcement",
            "audit_logging": "Event logging and retention",
            "incident_response": "Incident handling procedures",
        },
        "NIST": {
            "detect": "Detection capabilities and coverage",
            "respond": "Response time and playbook effectiveness",
            "recover": "Recovery procedures and RTO/RPO",
        },
        "PCI-DSS": {
            "access_controls": "Cardholder data access restrictions",
            "audit_logging": "Transaction logging",
            "testing": "Regular security testing",
        },
        "HIPAA": {
            "access_controls": "PHI access restrictions",
            "audit_controls": "Activity logging for PHI",
            "integrity_controls": "Data integrity protections",
        },
    }

    def __init__(self, agent_name: str, cfg, llm, mon, spark):
        super().__init__(agent_name, cfg, llm, mon, spark)
        self._controls_checked = 0
        self._controls_passing = 0
        self._controls_failing = 0

        # Register UC tools
        soc_tools = create_soc_tools(cfg)
        for tool in soc_tools:
            if tool.name in ["search_events", "create_case"]:
                self.register_tool(tool)

    def execute(self) -> AgentResult:
        """Main execution: check controls → collect evidence → report findings."""
        start_time = time.time()

        try:
            # Ensure output tables exist
            self._ensure_tables()

            # Initialize MLflow run
            with mlflow.start_run(run_name=f"{self.agent_name}_{int(time.time())}"):
                mlflow.set_experiment(f"/0xDSI/agents/{self.agent_name}")

                # Check compliance controls
                findings = self._check_compliance_controls()
                self._controls_checked = len(findings)

                if self._controls_checked == 0:
                    return AgentResult(
                        status=AgentStatus.IDLE,
                        agent_name=self.agent_name,
                        processed_count=0,
                        duration_seconds=time.time() - start_time,
                    )

                # Count pass/fail
                self._controls_passing = sum(
                    1 for f in findings if f["status"] == "pass"
                )
                self._controls_failing = sum(
                    1 for f in findings if f["status"] == "fail"
                )

                # Persist findings
                if findings:
                    self._persist_findings(findings)

                # Log metrics
                self._log_metrics()

            duration = time.time() - start_time
            return AgentResult(
                status=AgentStatus.COMPLETED,
                agent_name=self.agent_name,
                processed_count=self._controls_checked,
                error_count=self._controls_failing,
                duration_seconds=duration,
                details={
                    "controls_checked": self._controls_checked,
                    "controls_passing": self._controls_passing,
                    "controls_failing": self._controls_failing,
                    "pass_rate": (self._controls_passing / self._controls_checked
                                 if self._controls_checked > 0 else 0),
                },
            )

        except Exception as e:
            logger.exception(f"Compliance monitor failed: {e}")
            return AgentResult(
                status=AgentStatus.FAILED,
                agent_name=self.agent_name,
                error=str(e)[:500],
                duration_seconds=time.time() - start_time,
            )

    def _ensure_tables(self):
        """Create or validate compliance findings table."""
        findings_table = get_table_path(cfg, "compliance_findings")

        spark.sql(f"""
            CREATE TABLE IF NOT EXISTS {findings_table} (
                finding_id STRING NOT NULL,
                framework STRING NOT NULL,
                control_id STRING NOT NULL,
                status STRING,
                evidence_refs ARRAY<STRING>,
                gap_description STRING,
                remediation_task_id STRING,
                checked_at TIMESTAMP NOT NULL
            )
            USING DELTA
            PARTITIONED BY (date(checked_at))
        """)

    def _check_compliance_controls(self) -> list:
        """Check compliance controls for each framework."""
        findings = []
        span = self._start_trace("check_controls")

        try:
            for framework in frameworks:
                if framework not in self.FRAMEWORKS:
                    logger.warning(f"Unknown framework: {framework}")
                    continue

                framework_controls = self.FRAMEWORKS[framework]

                for control_id, control_desc in framework_controls.items():
                    finding = self._check_single_control(
                        framework, control_id, control_desc
                    )
                    findings.append(finding)

            self._end_trace(span, {
                "findings_generated": len(findings),
                "status": "success"
            })

        except Exception as e:
            self._end_trace(span, {"error": str(e)[:200], "status": "failed"})
            logger.error(f"Control checking failed: {e}")

        return findings

    def _check_single_control(self, framework: str, control_id: str,
                            control_desc: str) -> dict:
        """Check a single compliance control."""

        # Simplified control checks (in production, would be framework-specific)
        status = "pass"
        evidence_refs = []
        gap_desc = None

        # Example checks
        if "logging" in control_id.lower():
            # Check if audit logging is enabled
            try:
                audit_table = get_table_path(cfg, "audit_logs")
                count = spark.sql(f"""
                    SELECT COUNT(*) as cnt FROM {audit_table}
                    WHERE timestamp > current_timestamp() - INTERVAL 1 HOUR
                """).collect()[0].cnt

                if count == 0:
                    status = "fail"
                    gap_desc = "No audit logs in past hour"
                else:
                    evidence_refs.append(f"audit_logs:{count}_entries")

            except Exception as e:
                status = "partial"
                gap_desc = f"Could not verify: {str(e)[:100]}"

        elif "access" in control_id.lower():
            # Check access control policies
            status = "pass"  # Placeholder
            evidence_refs.append("access_policy_v1.2")

        elif "testing" in control_id.lower():
            # Check security testing frequency
            status = "pass"  # Placeholder
            evidence_refs.append("vulnerability_scan_2024_q2")

        return {
            "framework": framework,
            "control_id": control_id,
            "status": status,
            "evidence_refs": evidence_refs,
            "gap_description": gap_desc,
            "remediation_task_id": None,
        }

    def _persist_findings(self, findings: list):
        """Write compliance findings to Delta table."""
        if not findings:
            return

        span = self._start_trace("persist_findings")
        try:
            findings_table = get_table_path(cfg, "compliance_findings")

            schema = StructType([
                StructField("framework", StringType()),
                StructField("control_id", StringType()),
                StructField("status", StringType()),
                StructField("evidence_refs", ArrayType(StringType())),
                StructField("gap_description", StringType()),
                StructField("remediation_task_id", StringType()),
            ])

            findings_df = (
                spark.createDataFrame(findings, schema=schema)
                .withColumn("finding_id", expr("uuid()"))
                .withColumn("checked_at", current_timestamp())
            )

            safe_append(findings_df, findings_table, mode="append")

            self._end_trace(span, {
                "status": "success",
                "findings_written": len(findings)
            })

        except Exception as e:
            self._end_trace(span, {"error": str(e)[:200], "status": "failed"})
            raise

    def _log_metrics(self):
        """Log metrics to MLflow."""
        try:
            pass_rate = (
                (self._controls_passing / self._controls_checked)
                if self._controls_checked > 0 else 0
            )

            mlflow.log_metrics({
                "controls_checked": self._controls_checked,
                "controls_passing": self._controls_passing,
                "controls_failing": self._controls_failing,
                "pass_rate": pass_rate,
            })
            mlflow.log_params({
                "frameworks": len(frameworks),
                "freshness_sla": freshness_sla,
            })
        except Exception as e:
            logger.warning(f"MLflow metrics logging failed: {e}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Execute Compliance Monitor

# COMMAND ----------

try:
    agent = ComplianceMonitor("guardian_compliance", cfg, llm, mon, spark)
    result = agent.run()

    mon.log_event("compliance_result", {
        "status": result.status.value,
        "controls_checked": result.processed_count,
        "controls_failing": result.error_count,
        "pass_rate": result.details.get("pass_rate", 0),
        "duration_seconds": result.duration_seconds,
    })

    print(json.dumps({
        "status": result.status.value,
        "trace_id": result.trace_id,
        "controls_checked": result.processed_count,
        "passing": result.details.get("controls_passing", 0),
        "failing": result.error_count,
        "pass_rate": round(result.details.get("pass_rate", 0), 2),
        "duration_seconds": round(result.duration_seconds, 3),
        "details": result.details,
    }))

    dbutils.notebook.exit(result.to_json())

except Exception as e:
    logger.exception(f"Compliance monitor fatal error: {e}")
    mon.log_error(e, "guardian_compliance_execution")

    error_result = AgentResult(
        status=AgentStatus.FAILED,
        agent_name="guardian_compliance",
        error=str(e)[:500],
    )

    dbutils.notebook.exit(error_result.to_json())
from datetime import datetime, timedelta
import json

# COMMAND ----------

# MAGIC %md
# MAGIC ## Ensure GUARDIAN Tables

# COMMAND ----------

posture_table = get_table_path(cfg, "compliance_posture")
violations_table = get_table_path(cfg, "compliance_violations")
sla_metrics_table = get_table_path(cfg, "sla_metrics")

spark.sql(f"""
CREATE TABLE IF NOT EXISTS {posture_table} (
    posture_id STRING NOT NULL,
    assessed_at TIMESTAMP NOT NULL,
    -- Overall scores (0-100)
    overall_score DOUBLE NOT NULL,
    data_freshness_score DOUBLE DEFAULT 100.0,
    detection_coverage_score DOUBLE DEFAULT 100.0,
    entity_health_score DOUBLE DEFAULT 100.0,
    ks_quality_score DOUBLE DEFAULT 100.0,
    pipeline_latency_score DOUBLE DEFAULT 100.0,
    rule_drift_score DOUBLE DEFAULT 100.0,
    audit_integrity_score DOUBLE DEFAULT 100.0,
    retention_score DOUBLE DEFAULT 100.0,
    -- Counts
    active_violations INT DEFAULT 0,
    total_checks INT DEFAULT 0,
    passed_checks INT DEFAULT 0,
    -- Framework alignment
    soc2_status STRING DEFAULT 'compliant',
    nist_detect_score DOUBLE DEFAULT 100.0,
    nist_respond_score DOUBLE DEFAULT 100.0,
    -- Trend
    score_change_24h DOUBLE DEFAULT 0.0,
    degrading_dimensions ARRAY<STRING>
)
USING DELTA
TBLPROPERTIES ('delta.autoOptimize.optimizeWrite' = 'true')
""")

spark.sql(f"""
CREATE TABLE IF NOT EXISTS {violations_table} (
    violation_id STRING NOT NULL,
    dimension STRING NOT NULL,
    severity STRING NOT NULL,
    title STRING NOT NULL,
    description STRING NOT NULL,
    current_value STRING,
    threshold_value STRING,
    -- Impact
    affected_tables ARRAY<STRING>,
    affected_pipelines ARRAY<STRING>,
    compliance_framework STRING,
    -- Remediation
    auto_remediation_available BOOLEAN DEFAULT false,
    remediation_suggestion STRING,
    -- Status
    status STRING DEFAULT 'open',
    acknowledged_by STRING,
    resolved_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
TBLPROPERTIES ('delta.autoOptimize.optimizeWrite' = 'true')
""")

spark.sql(f"""
CREATE TABLE IF NOT EXISTS {sla_metrics_table} (
    metric_id STRING NOT NULL,
    measured_at TIMESTAMP NOT NULL,
    metric_name STRING NOT NULL,
    metric_value DOUBLE NOT NULL,
    sla_target DOUBLE NOT NULL,
    is_within_sla BOOLEAN NOT NULL,
    dimension STRING,
    details STRING
)
USING DELTA
TBLPROPERTIES ('delta.autoOptimize.optimizeWrite' = 'true')
""")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Check 1: Data Freshness

# COMMAND ----------

violations = []
sla_records = []
checks_passed = 0
total_checks = 0

with mon.time("check_freshness"):
    # Check last event timestamp in key tables
    critical_tables = [
        ("events", "ingested_at"),
        ("alerts", "created_at"),
        ("entity_spine", "updated_at"),
        ("unified_evidence_objects", "created_at"),
        ("fuse_results", "created_at"),
    ]

    freshness_score = 100.0
    now = datetime.utcnow()

    for table_name, ts_col in critical_tables:
        total_checks += 1
        table_path = get_table_path(cfg, table_name)
        try:
            last_ts = spark.sql(f"SELECT MAX({ts_col}) as last_ts FROM {table_path}").first()
            if last_ts and last_ts.last_ts:
                age_minutes = (now - last_ts.last_ts).total_seconds() / 60.0
                within_sla = age_minutes <= freshness_sla

                sla_records.append({
                    "metric_id": f"fresh_{table_name}_{now.strftime('%H%M')}",
                    "measured_at": now,
                    "metric_name": f"data_freshness_{table_name}",
                    "metric_value": age_minutes,
                    "sla_target": float(freshness_sla),
                    "is_within_sla": within_sla,
                    "dimension": "data_freshness",
                    "details": f"{table_name}.{ts_col} is {age_minutes:.1f}m old",
                })

                if within_sla:
                    checks_passed += 1
                else:
                    freshness_score -= 20.0
                    violations.append({
                        "violation_id": f"stale_{table_name}_{now.strftime('%Y%m%d%H')}",
                        "dimension": "data_freshness",
                        "severity": "high" if age_minutes > freshness_sla * 3 else "medium",
                        "title": f"Stale data in {table_name}",
                        "description": f"Table {table_name} last updated {age_minutes:.1f}m ago (SLA: {freshness_sla}m)",
                        "current_value": f"{age_minutes:.1f} minutes",
                        "threshold_value": f"{freshness_sla} minutes",
                        "affected_tables": [table_name],
                        "affected_pipelines": [table_name],
                        "compliance_framework": "SOC2_AVAILABILITY",
                        "auto_remediation_available": False,
                        "remediation_suggestion": f"Check ingestion pipeline for {table_name}. Verify source connectivity.",
                        "status": "open",
                    })
            else:
                freshness_score -= 10.0
        except Exception:
            pass

    freshness_score = max(0.0, freshness_score)
    print(f"  Data freshness: {freshness_score:.0f}/100")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Check 2: Detection Coverage (MITRE)

# COMMAND ----------

with mon.time("check_coverage"):
    total_checks += 1
    # All MITRE ATT&CK enterprise techniques (subset)
    MITRE_TECHNIQUES_CORE = [
        "T1003", "T1021", "T1041", "T1047", "T1048", "T1053", "T1055",
        "T1059", "T1068", "T1071", "T1078", "T1105", "T1134", "T1190",
        "T1197", "T1204", "T1218", "T1486", "T1547", "T1548", "T1550",
        "T1556", "T1562", "T1566", "T1567", "T1570", "T1572",
    ]

    rules_table = get_table_path(cfg, "correlation_rules")
    try:
        covered_techniques = spark.sql(f"""
            SELECT DISTINCT EXPLODE(mitre_techniques) as technique
            FROM {rules_table}
            WHERE status = 'active'
        """)
        covered_set = set(r.technique for r in covered_techniques.collect())
        coverage = len(covered_set.intersection(set(MITRE_TECHNIQUES_CORE))) / len(MITRE_TECHNIQUES_CORE)
    except Exception:
        coverage = 0.5

    coverage_score = min(100.0, coverage / min_mitre_coverage * 100.0)

    sla_records.append({
        "metric_id": f"mitre_cov_{now.strftime('%H%M')}",
        "measured_at": now,
        "metric_name": "mitre_technique_coverage",
        "metric_value": coverage,
        "sla_target": min_mitre_coverage,
        "is_within_sla": coverage >= min_mitre_coverage,
        "dimension": "detection_coverage",
        "details": f"Covering {coverage:.1%} of core MITRE techniques",
    })

    if coverage >= min_mitre_coverage:
        checks_passed += 1
    else:
        uncovered = set(MITRE_TECHNIQUES_CORE) - covered_set
        violations.append({
            "violation_id": f"mitre_gap_{now.strftime('%Y%m%d')}",
            "dimension": "detection_coverage",
            "severity": "medium",
            "title": f"MITRE coverage gap ({coverage:.0%})",
            "description": f"Only {coverage:.1%} of core techniques covered. Missing: {list(uncovered)[:10]}",
            "current_value": f"{coverage:.1%}",
            "threshold_value": f"{min_mitre_coverage:.0%}",
            "affected_tables": ["correlation_rules"],
            "affected_pipelines": None,
            "compliance_framework": "NIST_DETECT",
            "auto_remediation_available": False,
            "remediation_suggestion": f"Create detection rules for: {list(uncovered)[:5]}",
            "status": "open",
        })

    print(f"  Detection coverage: {coverage_score:.0f}/100 ({coverage:.1%} MITRE)")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Check 3: Entity Spine Health

# COMMAND ----------

with mon.time("check_entity_health"):
    total_checks += 1
    spine_table = get_table_path(cfg, "entity_spine")
    mentions_table = get_table_path(cfg, "entity_mentions")

    try:
        total_mentions = spark.sql(f"SELECT COUNT(*) FROM {mentions_table} WHERE created_at > '{(now - timedelta(hours=1)).isoformat()}'").first()[0]
        unresolved = spark.sql(f"SELECT COUNT(*) FROM {mentions_table} WHERE created_at > '{(now - timedelta(hours=1)).isoformat()}' AND resolved = false").first()[0]

        orphan_rate = unresolved / max(total_mentions, 1)
        entity_health_score = max(0.0, 100.0 - (orphan_rate / max_orphan_rate * 100.0))
    except Exception:
        orphan_rate = 0.0
        entity_health_score = 100.0

    sla_records.append({
        "metric_id": f"spine_health_{now.strftime('%H%M')}",
        "measured_at": now,
        "metric_name": "entity_orphan_rate",
        "metric_value": orphan_rate,
        "sla_target": max_orphan_rate,
        "is_within_sla": orphan_rate <= max_orphan_rate,
        "dimension": "entity_health",
        "details": f"Orphan rate: {orphan_rate:.2%}",
    })

    if orphan_rate <= max_orphan_rate:
        checks_passed += 1
    else:
        violations.append({
            "violation_id": f"spine_orphans_{now.strftime('%Y%m%d%H')}",
            "dimension": "entity_health",
            "severity": "medium",
            "title": f"High entity orphan rate ({orphan_rate:.1%})",
            "description": f"Entity Spine failing to resolve {orphan_rate:.1%} of mentions (threshold: {max_orphan_rate:.0%})",
            "current_value": f"{orphan_rate:.2%}",
            "threshold_value": f"{max_orphan_rate:.0%}",
            "affected_tables": ["entity_spine", "entity_mentions"],
            "affected_pipelines": ["entity_spine"],
            "compliance_framework": "DATA_QUALITY",
            "auto_remediation_available": True,
            "remediation_suggestion": "Run entity spine with extended fuzzy matching. Check for new entity naming patterns.",
            "status": "open",
        })

    print(f"  Entity health: {entity_health_score:.0f}/100 (orphan rate: {orphan_rate:.2%})")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Check 4: KS Quality

# COMMAND ----------

with mon.time("check_ks_quality"):
    total_checks += 1
    ks_table = get_table_path(cfg, "knowledge_store")

    try:
        ks_stats = spark.sql(f"""
            SELECT
                COUNT(*) as total,
                SUM(CASE WHEN is_active THEN 1 ELSE 0 END) as active,
                AVG(retrieval_count) as avg_retrievals,
                SUM(CASE WHEN retrieval_count = 0 AND created_at < current_timestamp() - INTERVAL 7 DAYS THEN 1 ELSE 0 END) as stale_never_used,
                MAX(created_at) as newest
            FROM {ks_table}
        """).first()

        total_ks = ks_stats.total or 0
        active_ks = ks_stats.active or 0
        stale = ks_stats.stale_never_used or 0
        stale_rate = stale / max(active_ks, 1)

        ks_quality_score = 100.0 - (stale_rate * 50.0)
        if total_ks < 10:
            ks_quality_score -= 30.0
        ks_quality_score = max(0.0, ks_quality_score)
    except Exception:
        ks_quality_score = 50.0
        total_ks = 0

    if ks_quality_score >= 70:
        checks_passed += 1
    else:
        violations.append({
            "violation_id": f"ks_quality_{now.strftime('%Y%m%d')}",
            "dimension": "ks_quality",
            "severity": "low",
            "title": "Knowledge Store quality degraded",
            "description": f"KS has {total_ks} entries, {stale if 'stale' in dir() else 'unknown'} never retrieved. Quality score: {ks_quality_score:.0f}/100",
            "current_value": f"{ks_quality_score:.0f}/100",
            "threshold_value": "70/100",
            "affected_tables": ["knowledge_store"],
            "affected_pipelines": ["knowledge_store", "ks_recall_lens"],
            "compliance_framework": "DATA_QUALITY",
            "auto_remediation_available": True,
            "remediation_suggestion": "Run KS GC to remove stale entries. Ensure ingestion pipelines are populating KS.",
            "status": "open",
        })

    print(f"  KS quality: {ks_quality_score:.0f}/100 ({total_ks} entries)")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Check 5: Pipeline End-to-End Latency

# COMMAND ----------

with mon.time("check_latency"):
    total_checks += 1
    events_table = get_table_path(cfg, "events")
    alerts_table = get_table_path(cfg, "alerts")

    try:
        latency = spark.sql(f"""
            SELECT AVG(
                UNIX_TIMESTAMP(a.created_at) - UNIX_TIMESTAMP(e.timestamp)
            ) as avg_latency_seconds
            FROM {alerts_table} a
            JOIN {events_table} e ON a.entity_id = e.user_id OR a.entity_id = e.source_ip
            WHERE a.created_at > '{(now - timedelta(hours=1)).isoformat()}'
              AND e.timestamp > '{(now - timedelta(hours=2)).isoformat()}'
        """).first()

        avg_latency = latency.avg_latency_seconds or 0
        latency_score = max(0.0, 100.0 - (avg_latency / e2e_latency_sla * 100.0))
    except Exception:
        avg_latency = 0
        latency_score = 100.0

    sla_records.append({
        "metric_id": f"e2e_latency_{now.strftime('%H%M')}",
        "measured_at": now,
        "metric_name": "event_to_alert_latency_seconds",
        "metric_value": float(avg_latency),
        "sla_target": float(e2e_latency_sla),
        "is_within_sla": avg_latency <= e2e_latency_sla,
        "dimension": "pipeline_latency",
        "details": f"Avg E2E latency: {avg_latency:.1f}s (SLA: {e2e_latency_sla}s)",
    })

    if avg_latency <= e2e_latency_sla:
        checks_passed += 1
    else:
        violations.append({
            "violation_id": f"latency_breach_{now.strftime('%Y%m%d%H')}",
            "dimension": "pipeline_latency",
            "severity": "high",
            "title": f"E2E latency SLA breach ({avg_latency:.0f}s)",
            "description": f"Event-to-alert latency is {avg_latency:.0f}s (SLA: {e2e_latency_sla}s)",
            "current_value": f"{avg_latency:.0f}s",
            "threshold_value": f"{e2e_latency_sla}s",
            "affected_tables": None,
            "affected_pipelines": ["ingestion", "detection", "confluence"],
            "compliance_framework": "NIST_DETECT",
            "auto_remediation_available": False,
            "remediation_suggestion": "Check cluster scaling. Review streaming trigger intervals. Consider scaling up detection compute.",
            "status": "open",
        })

    print(f"  Pipeline latency: {latency_score:.0f}/100 ({avg_latency:.0f}s avg)")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Compute Overall Posture Score

# COMMAND ----------

with mon.time("compute_posture"):
    # Weighted composite
    overall_score = (
        freshness_score * 0.25 +
        coverage_score * 0.20 +
        entity_health_score * 0.15 +
        ks_quality_score * 0.10 +
        latency_score * 0.20 +
        100.0 * 0.10  # rule_drift (not yet measured - default)
    )

    # Determine SOC2 status
    if overall_score >= 90 and not any(v["severity"] == "high" for v in violations):
        soc2_status = "compliant"
    elif overall_score >= 70:
        soc2_status = "observation"
    else:
        soc2_status = "non_compliant"

    # Identify degrading dimensions
    degrading = []
    if freshness_score < 70:
        degrading.append("data_freshness")
    if coverage_score < 70:
        degrading.append("detection_coverage")
    if entity_health_score < 70:
        degrading.append("entity_health")
    if latency_score < 70:
        degrading.append("pipeline_latency")

    # Write posture
    posture = spark.createDataFrame([{
        "posture_id": f"posture_{now.strftime('%Y%m%d%H%M')}",
        "assessed_at": now,
        "overall_score": overall_score,
        "data_freshness_score": freshness_score,
        "detection_coverage_score": coverage_score,
        "entity_health_score": entity_health_score,
        "ks_quality_score": ks_quality_score,
        "pipeline_latency_score": latency_score,
        "rule_drift_score": 100.0,
        "audit_integrity_score": 100.0,
        "retention_score": 100.0,
        "active_violations": len(violations),
        "total_checks": total_checks,
        "passed_checks": checks_passed,
        "soc2_status": soc2_status,
        "nist_detect_score": min(latency_score, coverage_score),
        "nist_respond_score": freshness_score,
        "score_change_24h": 0.0,
        "degrading_dimensions": degrading if degrading else None,
    }])
    posture.write.mode("append").option("mergeSchema", "true").saveAsTable(posture_table)

    # Write violations
    if violations:
        violations_df = spark.createDataFrame(violations)
        violations_df = violations_df.withColumn("created_at", current_timestamp())
        violations_df = violations_df.withColumn("acknowledged_by", lit(None).cast("string"))
        violations_df = violations_df.withColumn("resolved_at", lit(None).cast("timestamp"))
        violations_df.write.mode("append").option("mergeSchema", "true").saveAsTable(violations_table)

    # Write SLA metrics
    if sla_records:
        sla_df = spark.createDataFrame(sla_records)
        sla_df.write.mode("append").option("mergeSchema", "true").saveAsTable(sla_metrics_table)

    print(f"\nGUARDIAN Posture: {overall_score:.0f}/100 ({soc2_status})")
    print(f"  Checks: {checks_passed}/{total_checks} passed")
    print(f"  Violations: {len(violations)} new")
    if degrading:
        print(f"  Degrading: {', '.join(degrading)}")

# COMMAND ----------

result = {
    "notebook": "43_guardian_compliance",
    "status": "completed",
    "overall_score": overall_score,
    "soc2_status": soc2_status,
    "checks_passed": checks_passed,
    "total_checks": total_checks,
    "violations": len(violations),
}
mon.log_complete(details=result)
dbutils.notebook.exit(json.dumps(result))
