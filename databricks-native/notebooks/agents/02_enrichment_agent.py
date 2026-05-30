# Databricks notebook source
# MAGIC %md
# MAGIC # Agent 02: Enrichment Agent
# MAGIC
# MAGIC **Production-Grade BatchAgent Implementation**
# MAGIC
# MAGIC Enriches triaged alerts with contextual intelligence:
# MAGIC - Threat intelligence (IOC) matching against known indicators
# MAGIC - Asset context (criticality, ownership, network zone)
# MAGIC - Related events aggregation and network flow analysis
# MAGIC - LLM-generated enrichment narrative with risk assessment
# MAGIC - Composite enrichment_score combining multiple signals
# MAGIC
# MAGIC ## Key Features
# MAGIC - MLflow tracing on all enrichment operations
# MAGIC - UC Function tools for lookup_ioc, get_asset_info, search_events
# MAGIC - Automatic token budget management with fallback to degraded mode
# MAGIC - Safe Delta writes with proper partitioning
# MAGIC - Comprehensive metrics logging

# COMMAND ----------

# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

# MAGIC %md
# MAGIC ## Initialization and Configuration

# COMMAND ----------

from agent_framework import (
    BaseAgent, BatchAgent, AgentResult, AgentStatus,
    UCTool, create_soc_tools
)
import mlflow
import mlflow.tracing
from pyspark.sql.functions import *
from pyspark.sql.types import *
import json
import time
import logging
from datetime import datetime

logger = logging.getLogger("oxdsi.enrichment_agent")

# Parse notebook parameters
dbutils.widgets.text("batch_size", "50", "Max alerts to enrich per run")
dbutils.widgets.text("lookback_hours", "2", "Alert age window")
dbutils.widgets.text("enrichment_lookback_hours", "24", "How far back to search for related events")

batch_size = int(dbutils.widgets.get("batch_size"))
lookback_hours = int(dbutils.widgets.get("lookback_hours"))
enrichment_lookback_hours = int(dbutils.widgets.get("enrichment_lookback_hours"))

mon.log_event("enrichment_config_loaded", {
    "batch_size": batch_size,
    "lookback_hours": lookback_hours,
    "enrichment_lookback_hours": enrichment_lookback_hours,
})

# COMMAND ----------

# MAGIC %md
# MAGIC ## Define EnrichmentAgent Class

# COMMAND ----------

class EnrichmentAgent(BatchAgent):
    """
    Enrichment Agent - gathers contextual intelligence for alerts.

    Processes alerts that have been triaged and adds:
    - Threat intel IOC matches
    - Asset context and criticality
    - Network flow and related events
    - LLM-generated risk narrative
    - Composite enrichment_score
    """

    def __init__(self, agent_name: str, cfg, llm, mon, spark):
        super().__init__(agent_name, cfg, llm, mon, spark)
        self._enriched_count = 0
        self._high_risk_count = 0
        self._ti_matches_found = 0

        # Register UC tools
        soc_tools = create_soc_tools(cfg)
        for tool in soc_tools:
            if tool.name in ["lookup_ioc", "get_asset_info", "search_events"]:
                self.register_tool(tool)

    def execute(self) -> AgentResult:
        """Main execution flow: fetch → enrich → persist."""
        start_time = time.time()

        try:
            # Ensure output table exists
            self._ensure_output_table()

            # Fetch alerts that have been triaged but not yet enriched
            alerts = self._fetch_unenriched_alerts()
            self._enriched_count = len(alerts)

            if self._enriched_count == 0:
                return AgentResult(
                    status=AgentStatus.IDLE,
                    agent_name=self.agent_name,
                    processed_count=0,
                    duration_seconds=time.time() - start_time,
                )

            # Run enrichment with MLflow tracing
            with self._tracer.start_run(run_name=f"{self.agent_name}_{int(time.time())}"):
                mlflow.set_experiment(f"/0xDSI/agents/{self.agent_name}")

                enrichment_results = self._enrich_batch(alerts)

                # Persist results
                self._persist_results(enrichment_results)

                # Log metrics
                self._log_metrics(enrichment_results)

            duration = time.time() - start_time
            return AgentResult(
                status=AgentStatus.COMPLETED,
                agent_name=self.agent_name,
                processed_count=len(enrichment_results),
                error_count=0,
                duration_seconds=duration,
                details={
                    "enriched_count": self._enriched_count,
                    "high_risk_count": self._high_risk_count,
                    "ti_matches_found": self._ti_matches_found,
                    "tokens_used": self.llm.budget.used_total,
                    "tokens_remaining": self.llm.budget.remaining,
                },
            )

        except Exception as e:
            logger.exception(f"Enrichment agent failed: {e}")
            return AgentResult(
                status=AgentStatus.FAILED,
                agent_name=self.agent_name,
                error=str(e)[:500],
                duration_seconds=time.time() - start_time,
            )

    def _ensure_output_table(self):
        """Create or validate enrichments table."""
        enrichments_table = get_table_path(cfg, "alert_enrichments")
        spark.sql(f"""
            CREATE TABLE IF NOT EXISTS {enrichments_table} (
                id STRING NOT NULL,
                alert_id STRING NOT NULL,
                threat_intel_matches STRING,
                asset_context STRING,
                related_events_count INT,
                mitre_mapping STRING,
                enrichment_score DOUBLE,
                enrichment_narrative STRING,
                agent_name STRING,
                trace_id STRING,
                enriched_at TIMESTAMP NOT NULL
            )
            USING DELTA
            PARTITIONED BY (date(enriched_at))
            TBLPROPERTIES (
                'delta.autoOptimize.optimizeWrite' = 'true',
                'delta.autoOptimize.optimizeRead' = 'true'
            )
        """)

    def _fetch_unenriched_alerts(self) -> list:
        """Fetch alerts that have been triaged but not yet enriched."""
        alerts_table = get_table_path(cfg, "alerts")
        triage_table = get_table_path(cfg, "agent_triage_results")
        enrichments_table = get_table_path(cfg, "alert_enrichments")

        span = self._start_trace("fetch_unenriched_alerts")
        try:
            query = f"""
                SELECT DISTINCT a.*
                FROM {alerts_table} a
                INNER JOIN {triage_table} t ON a.id = t.alert_id
                LEFT JOIN {enrichments_table} e ON a.id = e.alert_id
                WHERE a.created_at > current_timestamp() - INTERVAL {lookback_hours} HOURS
                  AND e.alert_id IS NULL
                ORDER BY
                    CASE a.severity
                        WHEN 'critical' THEN 1 WHEN 'high' THEN 2
                        WHEN 'medium' THEN 3 ELSE 4
                    END,
                    a.created_at DESC
                LIMIT {batch_size}
            """
            alerts_df = spark.sql(query)
            alerts = alerts_df.collect()
            self._end_trace(span, {"alert_count": len(alerts), "status": "success"})
            return alerts
        except Exception as e:
            self._end_trace(span, {"error": str(e)[:200], "status": "failed"})
            logger.error(f"Failed to fetch alerts: {e}")
            return []

    def _enrich_batch(self, alerts: list) -> list:
        """Enrich each alert with context and LLM narrative."""
        enrichment_results = []

        for alert in alerts:
            try:
                enrichment = self._enrich_single_alert(alert)
                enrichment_results.append(enrichment)

                # Track high-risk
                if enrichment.get("enrichment_score", 0) > 0.75:
                    self._high_risk_count += 1

            except Exception as e:
                logger.error(f"Failed to enrich alert {alert.id}: {e}")
                # Graceful degradation: still log enrichment with error state
                enrichment_results.append({
                    "alert_id": alert.id,
                    "threat_intel_matches": "[]",
                    "asset_context": "{}",
                    "related_events_count": 0,
                    "mitre_mapping": "{}",
                    "enrichment_score": 0.3,  # Low confidence on error
                    "enrichment_narrative": f"Enrichment failed: {str(e)[:200]}",
                })

        return enrichment_results

    def _enrich_single_alert(self, alert) -> dict:
        """Enrich a single alert with all contextual signals."""
        span = self._start_trace(f"enrich_alert.{alert.id}")

        try:
            # Gather context signals in parallel (conceptually; executed sequentially)
            ti_matches = self._get_threat_intel_matches(alert)
            asset_ctx = self._get_asset_context(alert)
            related_events = self._get_related_events(alert)

            # Track TI matches for metrics
            if ti_matches:
                self._ti_matches_found += len(ti_matches)

            # Generate LLM narrative
            llm_narrative = self._generate_enrichment_narrative(
                alert, ti_matches, asset_ctx, related_events
            )

            # Compute enrichment_score as weighted combination
            enrichment_score = self._compute_enrichment_score(
                ti_matches, asset_ctx, related_events, llm_narrative
            )

            enrichment = {
                "alert_id": alert.id,
                "threat_intel_matches": json.dumps(ti_matches)[:2000],
                "asset_context": json.dumps(asset_ctx)[:1000],
                "related_events_count": len(related_events),
                "mitre_mapping": json.dumps(
                    llm_narrative.get("mitre_mapping", {})
                )[:500],
                "enrichment_score": enrichment_score,
                "enrichment_narrative": llm_narrative.get("narrative", "")[:1000],
            }

            self._end_trace(
                span,
                {
                    "status": "success",
                    "enrichment_score": enrichment_score,
                    "ti_count": len(ti_matches),
                },
            )

            return enrichment

        except Exception as e:
            self._end_trace(span, {"error": str(e)[:200], "status": "failed"})
            raise

    def _get_threat_intel_matches(self, alert) -> list:
        """Look up IOCs in threat intel database."""
        span = self._start_trace(f"ti_lookup.{alert.id}")
        try:
            source_ip = getattr(alert, "source_ip", None)
            dest_ip = getattr(alert, "dest_ip", None)
            domain = getattr(alert, "domain", None)
            file_hash = getattr(alert, "file_hash", None)

            ips_to_check = [ip for ip in [source_ip, dest_ip] if ip]
            domains_to_check = [domain] if domain else []
            hashes_to_check = [file_hash] if file_hash else []

            if not ips_to_check and not domains_to_check and not hashes_to_check:
                self._end_trace(span, {"matches": 0, "status": "no_indicators"})
                return []

            ioc_table = get_table_path(cfg, "ioc_entries")

            # Build OR conditions for all indicator types
            conditions = []
            if ips_to_check:
                ip_list = ",".join([f"'{ip}'" for ip in ips_to_check])
                conditions.append(f"(indicator_type = 'ip' AND indicator_value IN ({ip_list}))")
            if domains_to_check:
                domain_list = ",".join([f"'{d}'" for d in domains_to_check])
                conditions.append(
                    f"(indicator_type = 'domain' AND indicator_value IN ({domain_list}))"
                )
            if hashes_to_check:
                hash_list = ",".join([f"'{h}'" for h in hashes_to_check])
                conditions.append(
                    f"(indicator_type = 'hash' AND indicator_value IN ({hash_list}))"
                )

            where_clause = " OR ".join(conditions)
            query = f"""
                SELECT indicator_value, indicator_type, threat_type, confidence, source, first_seen
                FROM {ioc_table}
                WHERE {where_clause}
            """

            matches = [row.asDict() for row in spark.sql(query).collect()]
            self._end_trace(span, {"matches": len(matches), "status": "success"})
            return matches

        except Exception as e:
            self._end_trace(span, {"error": str(e)[:200], "status": "failed"})
            logger.warning(f"TI lookup failed: {e}")
            return []

    def _get_asset_context(self, alert) -> dict:
        """Look up asset criticality, ownership, and zone."""
        span = self._start_trace(f"asset_lookup.{alert.id}")
        try:
            source_ip = getattr(alert, "source_ip", None)
            hostname = getattr(alert, "hostname", None)
            asset_id = getattr(alert, "asset_id", None)

            if not any([source_ip, hostname, asset_id]):
                self._end_trace(span, {"status": "no_identifiers"})
                return {}

            assets_table = get_table_path(cfg, "asset_registry")

            # Build OR conditions
            conditions = []
            if source_ip:
                conditions.append(f"ip_address = '{safe_value(source_ip)}'")
            if hostname:
                conditions.append(f"hostname = '{safe_value(hostname)}'")
            if asset_id:
                conditions.append(f"asset_id = '{safe_value(asset_id)}'")

            where_clause = " OR ".join(conditions)
            query = f"""
                SELECT asset_id, hostname, ip_address, criticality, owner, department,
                       network_zone, os_type, last_seen
                FROM {assets_table}
                WHERE {where_clause}
                LIMIT 1
            """

            rows = spark.sql(query).collect()
            result = rows[0].asDict() if rows else {}
            self._end_trace(
                span,
                {
                    "status": "success" if result else "no_match",
                    "criticality": result.get("criticality", "unknown"),
                },
            )
            return result

        except Exception as e:
            self._end_trace(span, {"error": str(e)[:200], "status": "failed"})
            logger.warning(f"Asset lookup failed: {e}")
            return {}

    def _get_related_events(self, alert) -> list:
        """Get related events in lookback window."""
        span = self._start_trace(f"related_events.{alert.id}")
        try:
            source_ip = getattr(alert, "source_ip", None)
            user_id = getattr(alert, "user_id", None)

            if not source_ip and not user_id:
                self._end_trace(span, {"event_count": 0, "status": "no_search_key"})
                return []

            events_table = get_table_path(cfg, "events")

            # Build search conditions
            conditions = []
            if source_ip:
                conditions.append(f"source_ip = '{safe_value(source_ip)}'")
            if user_id:
                conditions.append(f"user_id = '{safe_value(user_id)}'")

            where_clause = " OR ".join(conditions)
            query = f"""
                SELECT event_id, event_type, source_ip, user_id, timestamp, description
                FROM {events_table}
                WHERE ({where_clause})
                  AND timestamp > current_timestamp() - INTERVAL {enrichment_lookback_hours} HOURS
                ORDER BY timestamp DESC
                LIMIT 100
            """

            events = [row.asDict() for row in spark.sql(query).collect()]
            self._end_trace(span, {"event_count": len(events), "status": "success"})
            return events

        except Exception as e:
            self._end_trace(span, {"error": str(e)[:200], "status": "failed"})
            logger.warning(f"Related events lookup failed: {e}")
            return []

    def _generate_enrichment_narrative(
        self, alert, ti_matches: list, asset_ctx: dict, related_events: list
    ) -> dict:
        """Use LLM to generate risk assessment narrative."""
        if self.llm.budget.exhausted:
            logger.warning("Token budget exhausted; skipping LLM narrative")
            return {
                "narrative": "Enrichment skipped due to token budget exhaustion",
                "mitre_mapping": {},
            }

        span = self._start_trace(f"llm_narrative.{alert.id}")
        try:
            system_prompt = """You are a senior SOC analyst reviewing enriched alert data.
Generate a concise risk assessment narrative (max 300 words) with MITRE ATT&CK mapping.

Respond with valid JSON only:
{
  "narrative": "risk assessment paragraph",
  "mitre_tactic": "tactic name or null",
  "mitre_technique": "T-XXXX or null",
  "risk_level": "critical" | "high" | "medium" | "low"
}"""

            user_prompt = f"""Alert Analysis:
Title: {alert.title or 'N/A'}
Severity: {alert.severity or 'unknown'}

Threat Intel Matches: {json.dumps(ti_matches)[:500] if ti_matches else 'None'}
Asset Context: {json.dumps(asset_ctx)[:300] if asset_ctx else 'None'}
Related Events (last 24h): {len(related_events)} events

Generate enrichment narrative with risk assessment."""

            response = self.llm_classify(
                system=system_prompt,
                user=user_prompt,
                json_mode=True,
                temperature=0.1,
            )

            result = {
                "narrative": response.get("narrative", "No narrative generated") if response else "",
                "mitre_mapping": {
                    "tactic": response.get("mitre_tactic") if response else None,
                    "technique": response.get("mitre_technique") if response else None,
                } if response else {},
            }

            self._end_trace(span, {"status": "success", "narrative_length": len(result["narrative"])})
            return result

        except Exception as e:
            self._end_trace(span, {"error": str(e)[:200], "status": "failed"})
            logger.warning(f"LLM narrative generation failed: {e}")
            return {
                "narrative": f"LLM enrichment failed: {str(e)[:100]}",
                "mitre_mapping": {},
            }

    def _compute_enrichment_score(
        self, ti_matches: list, asset_ctx: dict, related_events: list, llm_narrative: dict
    ) -> float:
        """Compute composite enrichment score (0.0 - 1.0)."""
        score = 0.0
        weights = {
            "ti_signal": 0.35,
            "asset_criticality": 0.25,
            "event_volume": 0.20,
            "narrative_risk": 0.20,
        }

        # TI signal: presence and confidence of matches
        if ti_matches:
            avg_confidence = sum(m.get("confidence", 0.5) for m in ti_matches) / len(
                ti_matches
            )
            score += weights["ti_signal"] * min(1.0, avg_confidence)

        # Asset criticality signal
        criticality_map = {
            "critical": 1.0,
            "high": 0.8,
            "medium": 0.5,
            "low": 0.2,
        }
        criticality = asset_ctx.get("criticality", "low").lower()
        score += weights["asset_criticality"] * criticality_map.get(criticality, 0.2)

        # Event volume signal
        event_score = min(1.0, len(related_events) / 100.0)  # Normalize to 100 events
        score += weights["event_volume"] * event_score

        # Narrative risk level signal
        narrative_risk_map = {
            "critical": 1.0,
            "high": 0.85,
            "medium": 0.5,
            "low": 0.15,
        }
        risk_level = llm_narrative.get("risk_level", "low")
        if risk_level:
            score += weights["narrative_risk"] * narrative_risk_map.get(
                risk_level.lower(), 0.5
            )

        return min(1.0, score)

    def _persist_results(self, enrichment_results: list):
        """Write enrichments to Delta table."""
        if not enrichment_results:
            return

        span = self._start_trace("persist_results")
        try:
            enrichments_table = get_table_path(cfg, "alert_enrichments")

            schema = StructType([
                StructField("alert_id", StringType()),
                StructField("threat_intel_matches", StringType()),
                StructField("asset_context", StringType()),
                StructField("related_events_count", IntegerType()),
                StructField("mitre_mapping", StringType()),
                StructField("enrichment_score", DoubleType()),
                StructField("enrichment_narrative", StringType()),
            ])

            df = (
                spark.createDataFrame(enrichment_results, schema=schema)
                .withColumn("id", expr("uuid()"))
                .withColumn("agent_name", lit(self.agent_name))
                .withColumn("trace_id", lit(self._tracer._tracer if self._tracer else ""))
                .withColumn("enriched_at", current_timestamp())
            )

            safe_append(df, enrichments_table)

            self._end_trace(
                span,
                {
                    "status": "success",
                    "results_written": len(enrichment_results),
                },
            )

        except Exception as e:
            self._end_trace(span, {"error": str(e)[:200], "status": "failed"})
            raise

    def _log_metrics(self, enrichment_results: list):
        """Log metrics to MLflow experiment."""
        try:
            mlflow.log_metrics({
                "enriched_count": self._enriched_count,
                "high_risk_count": self._high_risk_count,
                "ti_matches_found": self._ti_matches_found,
                "avg_enrichment_score": (
                    sum(r.get("enrichment_score", 0) for r in enrichment_results)
                    / len(enrichment_results)
                    if enrichment_results
                    else 0.0
                ),
                "tokens_used": self.llm.budget.used_total,
                "tokens_remaining": self.llm.budget.remaining,
            })

            mlflow.log_params({
                "batch_size": batch_size,
                "lookback_hours": lookback_hours,
                "environment": cfg.environment,
            })
        except Exception as e:
            logger.warning(f"MLflow metrics logging failed: {e}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Execute Enrichment Agent

# COMMAND ----------

try:
    # Initialize agent
    agent = EnrichmentAgent("enrichment_agent", cfg, llm, mon, spark)

    # Run agent with full lifecycle management
    result = agent.run()

    # Log result
    mon.log_event("enrichment_agent_result", {
        "status": result.status.value,
        "processed": result.processed_count,
        "errors": result.error_count,
        "duration_seconds": result.duration_seconds,
        "details": json.dumps(result.details),
    })

    # Exit with structured result
    print(json.dumps({
        "status": result.status.value,
        "trace_id": result.trace_id,
        "processed": result.processed_count,
        "errors": result.error_count,
        "duration_seconds": round(result.duration_seconds, 3),
        "details": result.details,
        "error": result.error,
    }))

    dbutils.notebook.exit(result.to_json())

except Exception as e:
    logger.exception(f"Enrichment agent fatal error: {e}")
    mon.log_error(e, "enrichment_agent_execution")

    error_result = AgentResult(
        status=AgentStatus.FAILED,
        agent_name="enrichment_agent",
        error=str(e)[:500],
    )

    dbutils.notebook.exit(error_result.to_json())
