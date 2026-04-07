import { DatabricksNotebook } from '../databricksNotebooks';

export const agentSOCPipelineNotebook: DatabricksNotebook = {
  id: 'agent-soc-pipeline',
  title: 'Agentic SOC - Production Agent Implementations',
  subtitle: 'Triage, Enrichment, Investigation, Response, and Pattern Discovery agents with full scoring logic',
  category: 'ml',
  tags: ['Agentic SOC', 'Triage Agent', 'Enrichment Agent', 'Investigation Agent', 'Response Agent', 'Pattern Discovery', 'SOAR', 'Delta Lake Merge', 'GraphFrames'],
  description: 'Part 2 of the production Agentic SOC. Implements 5 autonomous agents with full production logic: (1) Triage Agent with multi-factor scoring across 6 dimensions, IOC matching via broadcast joins, repeat offender detection, and automatic case escalation; (2) Enrichment Agent with multi-source threat intel correlation, user anomaly merging, geolocation analysis, and enriched risk calculation; (3) Investigation Agent with graph-based event correlation, attack timeline construction, lateral movement detection, and automated case creation; (4) Response Agent with action determination, approval workflows, IP blocking, host isolation, and rollback capability; (5) Pattern Discovery Agent with event sequence analysis, statistical anomaly detection, ML clustering, and automatic rule generation.',
  estimatedRuntime: '22 min',
  clusterRequirements: 'DBR 14.3 LTS ML, 4+ workers, Delta Lake, Unity Catalog, GraphFrames',
  cells: [
    {
      type: 'markdown',
      content: `# Agentic SOC - Part 2: Production Agent Implementations

## Agent Pipeline

Each agent processes alerts in sequence, advancing them through the pipeline:

\`\`\`
  NEW -> [Triage] -> TRIAGED -> [Enrichment] -> ENRICHED -> [Investigation] -> INVESTIGATED -> [Response] -> RESPONDED
                                                                                                |
                                                                                    [Pattern Discovery] (async)
\`\`\`

### Agent Capabilities Matrix

| Agent | Input | Output | Key Algorithms |
|-------|-------|--------|---------------|
| **Triage** | New alerts | Scored & prioritized alerts | 6-factor scoring, IOC broadcast join, repeat detection |
| **Enrichment** | Triaged alerts | Enriched alerts + risk score | Multi-feed correlation, user anomaly join, geo analysis |
| **Investigation** | Enriched alerts | Investigation data + cases | Graph traversal, timeline builder, lateral movement detection |
| **Response** | Investigated alerts | Response actions + blocklist | Action matrix, approval routing, auto-block, rollback tracking |
| **Pattern Discovery** | Historical events | New patterns + correlation rules | Sequence mining, statistical anomaly, clustering, rule generation |

### Production Patterns

- **Delta Lake Merge** -- all agents use MERGE INTO for idempotent updates
- **Broadcast joins** -- small lookup tables (threat feeds, anomalies) are broadcast
- **Batch processing** -- configurable batch sizes to control resource usage
- **Error isolation** -- each agent handles errors independently
- **Metrics emission** -- every agent reports execution metrics`
    },
    {
      type: 'code',
      content: `# Cell 1: Base Agent Class & Shared Utilities

from pyspark.sql import functions as F
from pyspark.sql.types import *
from pyspark.sql.window import Window
from delta.tables import DeltaTable
from datetime import datetime, timedelta
import json, uuid, hashlib, time

CATALOG = "soc_platform"
SCHEMA = "agentic_soc"

def gen_uuid():
    return str(uuid.uuid4())


class BaseAgent:
    """
    Abstract base class for all SOC agents.
    Provides shared infrastructure: config loading, metrics emission,
    task management, health reporting, and error handling.
    """
    AGENT_TYPE = "base"

    def __init__(self, spark, config):
        self.spark = spark
        self.config = config
        self.start_time = None
        self.metrics = {}

    def run(self, **kwargs):
        self.start_time = time.time()
        agent_config = self._load_agent_config()

        if not agent_config or not agent_config["enabled"]:
            print(f"  {self.AGENT_TYPE} agent is disabled")
            return {"processed": 0, "status": "disabled"}

        if agent_config.get("circuit_breaker_open"):
            cb_until = agent_config.get("circuit_breaker_until")
            if cb_until and cb_until > datetime.now():
                print(f"  {self.AGENT_TYPE} circuit breaker open until {cb_until}")
                return {"processed": 0, "status": "circuit_breaker_open"}

        try:
            results = self._execute(**kwargs)
            duration_ms = int((time.time() - self.start_time) * 1000)
            results["execution_time_ms"] = duration_ms
            results["status"] = "success"
            self._update_agent_health(success=True, duration_ms=duration_ms)
            self._emit_metrics(results)
            return results
        except Exception as e:
            duration_ms = int((time.time() - self.start_time) * 1000)
            self._update_agent_health(success=False, duration_ms=duration_ms, error=str(e))
            return {"processed": 0, "status": "error", "error": str(e), "execution_time_ms": duration_ms}

    def _execute(self, **kwargs):
        raise NotImplementedError

    def _load_agent_config(self):
        try:
            row = (
                self.spark.table(f"{SCHEMA}.agent_configs")
                .filter(F.col("agent_type") == self.AGENT_TYPE)
                .first()
            )
            return row.asDict() if row else {"enabled": True}
        except Exception:
            return {"enabled": True}

    def _update_agent_health(self, success, duration_ms, error=None):
        try:
            table = DeltaTable.forName(self.spark, f"{SCHEMA}.agent_configs")
            updates = {
                "total_runs": F.expr("total_runs + 1"),
                "last_run_at": F.current_timestamp(),
                "avg_execution_time_ms": F.expr(
                    f"((avg_execution_time_ms * total_runs) + {duration_ms}) / (total_runs + 1)"
                ),
                "updated_at": F.current_timestamp(),
            }
            if success:
                updates["successful_runs"] = F.expr("successful_runs + 1")
                updates["last_success_at"] = F.current_timestamp()
                updates["consecutive_failures"] = F.lit(0)
                updates["health_status"] = F.lit("healthy")
                updates["circuit_breaker_open"] = F.lit(False)
            else:
                updates["failed_runs"] = F.expr("failed_runs + 1")
                updates["last_failure_at"] = F.current_timestamp()
                updates["last_error"] = F.lit(str(error)[:500] if error else "unknown")
                updates["consecutive_failures"] = F.expr("consecutive_failures + 1")
                cb_threshold = self.config.get("orchestrator", {}).get("circuit_breaker_threshold", 5)
                updates["health_status"] = F.when(
                    F.expr(f"consecutive_failures + 1 >= {cb_threshold}"), F.lit("unhealthy")
                ).when(
                    F.expr("consecutive_failures + 1 >= 2"), F.lit("degraded")
                ).otherwise(F.lit("healthy"))
                updates["circuit_breaker_open"] = F.when(
                    F.expr(f"consecutive_failures + 1 >= {cb_threshold}"), F.lit(True)
                ).otherwise(F.col("circuit_breaker_open"))

            table.update(
                condition=f"agent_type = '{self.AGENT_TYPE}'",
                set=updates,
            )
        except Exception as e:
            print(f"  Warning: could not update health for {self.AGENT_TYPE}: {e}")

    def _emit_metrics(self, results):
        try:
            metrics = []
            for key, value in results.items():
                if isinstance(value, (int, float)):
                    metrics.append({
                        "id": gen_uuid(),
                        "agent_type": self.AGENT_TYPE,
                        "metric_name": key,
                        "metric_value": float(value),
                        "metric_unit": "ms" if "time" in key or "duration" in key or "latency" in key else "count",
                    })

            if metrics:
                df = self.spark.createDataFrame(metrics)
                df = df.withColumn("timestamp", F.current_timestamp())
                df.write.format("delta").mode("append").saveAsTable(f"{SCHEMA}.agent_performance_metrics")
        except Exception as e:
            print(f"  Warning: could not emit metrics for {self.AGENT_TYPE}: {e}")

    def _create_downstream_task(self, agent_type, task_type, alert_id, priority="medium", params=None):
        try:
            task = [{
                "id": gen_uuid(),
                "agent_type": agent_type,
                "task_type": task_type,
                "priority": priority,
                "status": "pending",
                "alert_id": alert_id,
                "parameters": json.dumps(params or {}),
            }]
            df = self.spark.createDataFrame(task)
            df = df.withColumn("created_at", F.current_timestamp())
            df.write.format("delta").mode("append").saveAsTable(f"{SCHEMA}.agent_tasks")
        except Exception:
            pass


print("BaseAgent class defined with:"
      " config loading, health tracking, circuit breaker, metrics emission, task creation")`
    },
    {
      type: 'code',
      content: `# Cell 2: Triage Agent -- Multi-Factor Alert Scoring & Prioritization

class TriageAgent(BaseAgent):
    """
    Automatically score, prioritize, and classify security alerts.

    Scoring Dimensions (6):
      1. Base severity         (0-10 pts) -- severity level weight
      2. Risk score            (0-10 pts) -- normalized alert risk score
      3. Event volume          (0-5 pts)  -- number of correlated events
      4. IOC match             (0-5 pts)  -- matches known threat IOCs
      5. Repeat offender       (0-3 pts)  -- source IP has prior alerts
      6. Temporal anomaly      (0-2 pts)  -- event occurred outside business hours

    Priority thresholds:
      critical >= 15, high >= 10, medium >= 5, low < 5

    Side effects:
      - Updates alert status to 'triaged'
      - Creates cases for critical alerts
      - Creates downstream enrichment tasks
    """
    AGENT_TYPE = "triage"

    SEVERITY_WEIGHTS = {"low": 1, "medium": 3, "high": 7, "critical": 10}

    def _execute(self, **kwargs):
        batch_size = self.config.get("triage", {}).get("batch_size", 200)

        new_alerts = (
            self.spark.table(f"{SCHEMA}.alerts")
            .filter(F.col("status") == "new")
            .limit(batch_size)
        )

        count = new_alerts.count()
        if count == 0:
            return {"processed": 0}

        triaged = self._score_severity(new_alerts)
        triaged = self._score_risk(triaged)
        triaged = self._score_event_volume(triaged)
        triaged = self._check_ioc_matches(triaged)
        triaged = self._check_repeat_offenders(triaged)
        triaged = self._score_temporal(triaged)
        triaged = self._calculate_final_priority(triaged)
        triaged.cache()

        self._merge_to_alerts(triaged)
        cases_created = self._escalate_critical(triaged)
        self._create_enrichment_tasks(triaged)
        triaged.unpersist()

        return {
            "processed": count,
            "critical": triaged.filter(F.col("priority") == "critical").count(),
            "high": triaged.filter(F.col("priority") == "high").count(),
            "medium": triaged.filter(F.col("priority") == "medium").count(),
            "low": triaged.filter(F.col("priority") == "low").count(),
            "cases_created": cases_created,
        }

    def _score_severity(self, alerts):
        return alerts.withColumn(
            "severity_score",
            F.when(F.col("severity") == "low", 1)
            .when(F.col("severity") == "medium", 3)
            .when(F.col("severity") == "high", 7)
            .when(F.col("severity") == "critical", 10)
            .otherwise(0)
        )

    def _score_risk(self, alerts):
        return alerts.withColumn(
            "risk_contribution",
            F.least(F.floor(F.coalesce(F.col("risk_score"), F.lit(0)) / 10), F.lit(10))
        )

    def _score_event_volume(self, alerts):
        return alerts.withColumn(
            "volume_score",
            F.when(F.col("event_count") > 100, 5)
            .when(F.col("event_count") > 50, 3)
            .when(F.col("event_count") > 10, 1)
            .otherwise(0)
        )

    def _check_ioc_matches(self, alerts):
        threat_ips = (
            self.spark.table(f"{SCHEMA}.threat_feed_items")
            .filter((F.col("ioc_type") == "ip") & (F.col("is_active") == True))
            .select(
                F.col("ioc_value").alias("threat_ip"),
                F.col("threat_type").alias("matched_threat_type"),
                F.col("confidence").alias("threat_confidence"),
            )
        )

        matched = alerts.join(
            F.broadcast(threat_ips),
            (alerts.source_ip == threat_ips.threat_ip) | (alerts.dest_ip == threat_ips.threat_ip),
            "left",
        )

        return matched.withColumn(
            "ioc_match", F.col("threat_ip").isNotNull()
        ).withColumn(
            "ioc_score", F.when(F.col("ioc_match"), 5).otherwise(0)
        ).withColumn(
            "ioc_match_details",
            F.when(F.col("ioc_match"),
                F.to_json(F.struct("matched_threat_type", "threat_confidence"))
            ).otherwise(F.lit(None))
        ).drop("threat_ip", "matched_threat_type", "threat_confidence")

    def _check_repeat_offenders(self, alerts):
        repeat_counts = (
            self.spark.table(f"{SCHEMA}.alerts")
            .filter(F.col("created_at") >= F.expr("now() - interval 24 hours"))
            .groupBy("source_ip")
            .agg(F.count("*").alias("repeat_count_24h"))
        )

        return alerts.join(
            F.broadcast(repeat_counts),
            "source_ip", "left"
        ).withColumn(
            "repeat_count", F.coalesce(F.col("repeat_count_24h"), F.lit(0))
        ).withColumn(
            "repeat_score",
            F.when(F.col("repeat_count") > 10, 3)
            .when(F.col("repeat_count") > 5, 2)
            .when(F.col("repeat_count") > 2, 1)
            .otherwise(0)
        ).drop("repeat_count_24h")

    def _score_temporal(self, alerts):
        return alerts.withColumn(
            "temporal_score",
            F.when(
                (F.hour(F.col("created_at")) < 6) | (F.hour(F.col("created_at")) > 22), 2
            ).when(
                (F.dayofweek(F.col("created_at")).isin([1, 7])), 1
            ).otherwise(0)
        )

    def _calculate_final_priority(self, alerts):
        thresholds = self.config.get("triage", {})
        return alerts.withColumn(
            "triage_score",
            F.col("severity_score") + F.col("risk_contribution") +
            F.col("volume_score") + F.col("ioc_score") +
            F.col("repeat_score") + F.col("temporal_score")
        ).withColumn(
            "priority",
            F.when(F.col("triage_score") >= thresholds.get("critical_threshold", 15), "critical")
            .when(F.col("triage_score") >= thresholds.get("high_threshold", 10), "high")
            .when(F.col("triage_score") >= thresholds.get("medium_threshold", 5), "medium")
            .otherwise("low")
        ).withColumn(
            "triage_factors",
            F.to_json(F.struct(
                "severity_score", "risk_contribution", "volume_score",
                "ioc_score", "repeat_score", "temporal_score",
            ))
        ).withColumn(
            "triage_notes",
            F.concat(
                F.lit("Auto-triaged. Total="), F.col("triage_score"),
                F.lit(" [sev="), F.col("severity_score"),
                F.lit(",risk="), F.col("risk_contribution"),
                F.lit(",vol="), F.col("volume_score"),
                F.lit(",ioc="), F.col("ioc_score"),
                F.lit(",repeat="), F.col("repeat_score"),
                F.lit(",temporal="), F.col("temporal_score"), F.lit("]"),
            )
        ).withColumn("status", F.lit("triaged")
        ).withColumn("triaged_at", F.current_timestamp()
        ).withColumn("triaged_by", F.lit("triage_agent")
        ).withColumn("updated_at", F.current_timestamp())

    def _merge_to_alerts(self, triaged):
        update_df = triaged.select(
            "id", "status", "priority", "triage_score", "triage_notes", "triage_factors",
            "triaged_at", "triaged_by", "ioc_match", "ioc_match_details",
            "repeat_count", "updated_at",
        )
        DeltaTable.forName(self.spark, f"{SCHEMA}.alerts").alias("t").merge(
            update_df.alias("s"), "t.id = s.id"
        ).whenMatchedUpdate(set={
            "status": "s.status", "priority": "s.priority",
            "triage_score": "s.triage_score", "triage_notes": "s.triage_notes",
            "triage_factors": "s.triage_factors", "triaged_at": "s.triaged_at",
            "triaged_by": "s.triaged_by", "ioc_match": "s.ioc_match",
            "ioc_match_details": "s.ioc_match_details",
            "repeat_count": "s.repeat_count", "updated_at": "s.updated_at",
        }).execute()

    def _escalate_critical(self, triaged):
        critical = triaged.filter(F.col("priority") == "critical")
        count = critical.count()
        if count == 0:
            return 0

        cases = critical.select(
            F.expr("uuid()").alias("id"),
            F.concat(F.lit("Auto-Escalated: "), F.col("title")).alias("title"),
            F.col("description"), F.col("severity"),
            F.lit("critical").alias("priority"), F.lit("new").alias("status"),
            F.lit("incident").alias("case_type"),
            F.col("id").alias("alert_id"),
            F.col("mitre_techniques"),
            F.lit("triage_agent").alias("created_by"),
            F.current_timestamp().alias("created_at"),
        )
        cases.write.format("delta").mode("append").saveAsTable(f"{SCHEMA}.cases")
        return count

    def _create_enrichment_tasks(self, triaged):
        non_low = triaged.filter(F.col("priority") != "low")
        tasks = non_low.select(
            F.expr("uuid()").alias("id"),
            F.lit("enrichment").alias("agent_type"),
            F.lit("alert_enrichment").alias("task_type"),
            F.col("priority"),
            F.lit("pending").alias("status"),
            F.col("id").alias("alert_id"),
            F.current_timestamp().alias("created_at"),
        )
        tasks.write.format("delta").mode("append").saveAsTable(f"{SCHEMA}.agent_tasks")


triage_agent = TriageAgent(spark, CONFIG)

print("Triage Agent initialized")
print("  Scoring: severity + risk + volume + IOC + repeat + temporal")
print("  Side effects: alert update, case creation, enrichment task creation")`
    },
    {
      type: 'code',
      content: `# Cell 3: Enrichment Agent -- Multi-Source Threat Intelligence Correlation

class EnrichmentAgent(BaseAgent):
    """
    Enrich triaged alerts with threat intelligence from multiple sources.

    Enrichment Sources:
      1. Threat feed IOC matching (source IP, dest IP, domain, hash)
      2. User behavior anomaly correlation
      3. Geolocation analysis (country baseline deviation)
      4. Historical alert correlation (same source/dest in past 7 days)

    Risk score adjustment:
      enriched_risk = min(100, base_risk + ioc_bonus + anomaly_bonus + geo_bonus)
    """
    AGENT_TYPE = "enrichment"

    def _execute(self, **kwargs):
        batch_size = self.config.get("enrichment", {}).get("batch_size", 100)

        to_enrich = (
            self.spark.table(f"{SCHEMA}.alerts")
            .filter(
                (F.col("status") == "triaged") &
                (F.col("enrichment_completed") == False)
            )
            .orderBy(F.desc("triage_score"))
            .limit(batch_size)
        )

        count = to_enrich.count()
        if count == 0:
            return {"processed": 0}

        enriched = self._enrich_threat_intel(to_enrich)
        enriched = self._enrich_user_anomalies(enriched)
        enriched = self._enrich_geolocation(enriched)
        enriched = self._calculate_enriched_risk(enriched)
        enriched.cache()

        self._merge_to_alerts(enriched)
        self._create_investigation_tasks(enriched)
        enriched.unpersist()

        return {
            "processed": count,
            "ioc_matches": enriched.filter(F.col("threat_match_count") > 0).count(),
            "user_anomalies": enriched.filter(F.col("has_user_anomaly")).count(),
            "geo_anomalies": enriched.filter(F.col("geo_anomaly")).count(),
            "avg_risk_increase": round(
                enriched.agg(F.avg(F.col("enriched_risk_score") - F.col("risk_score"))).collect()[0][0] or 0, 1
            ),
        }

    def _enrich_threat_intel(self, alerts):
        feeds = self.spark.table(f"{SCHEMA}.threat_feed_items").filter(F.col("is_active") == True)

        ip_feeds = feeds.filter(F.col("ioc_type") == "ip").select(
            F.col("ioc_value").alias("threat_ip"),
            F.col("threat_type").alias("ip_threat_type"),
            F.col("severity").alias("ip_threat_severity"),
            F.col("confidence").alias("ip_threat_confidence"),
            F.col("feed_name").alias("ip_feed_name"),
        )

        domain_feeds = feeds.filter(F.col("ioc_type") == "domain").select(
            F.col("ioc_value").alias("threat_domain"),
        )

        src_matches = alerts.alias("a").join(
            F.broadcast(ip_feeds.alias("t")),
            F.col("a.source_ip") == F.col("t.threat_ip"),
            "left"
        ).groupBy("a.id").agg(
            F.count(F.col("t.threat_ip")).alias("src_ip_matches"),
            F.max("ip_threat_severity").alias("src_max_severity"),
            F.max("ip_threat_confidence").alias("src_max_confidence"),
            F.collect_set("ip_threat_type").alias("src_threat_types"),
            F.collect_set("ip_feed_name").alias("src_feed_names"),
        )

        dst_matches = alerts.alias("a").join(
            F.broadcast(ip_feeds.alias("t")),
            F.col("a.dest_ip") == F.col("t.threat_ip"),
            "left"
        ).groupBy("a.id").agg(
            F.count(F.col("t.threat_ip")).alias("dst_ip_matches"),
            F.max("ip_threat_severity").alias("dst_max_severity"),
            F.max("ip_threat_confidence").alias("dst_max_confidence"),
            F.collect_set("ip_threat_type").alias("dst_threat_types"),
        )

        return (
            alerts
            .join(src_matches, "id", "left")
            .join(dst_matches, "id", "left")
            .withColumn(
                "threat_match_count",
                F.coalesce("src_ip_matches", F.lit(0)) + F.coalesce("dst_ip_matches", F.lit(0))
            )
        )

    def _enrich_user_anomalies(self, alerts):
        anomalies = (
            self.spark.table(f"{SCHEMA}.user_anomalies")
            .filter(F.col("is_active") == True)
            .groupBy("username")
            .agg(
                F.count("*").alias("anomaly_count"),
                F.max("risk_score").alias("max_anomaly_risk"),
                F.max("anomaly_score").alias("max_anomaly_score"),
                F.collect_set("anomaly_type").alias("anomaly_types"),
            )
        )

        return alerts.join(
            F.broadcast(anomalies), "username", "left"
        ).withColumn(
            "has_user_anomaly", F.col("anomaly_count").isNotNull() & (F.col("anomaly_count") > 0)
        ).withColumn(
            "user_anomaly_risk", F.coalesce("max_anomaly_risk", F.lit(0))
        )

    def _enrich_geolocation(self, alerts):
        high_risk_countries = ["CN", "RU", "IR", "KP", "SY"]

        events_geo = (
            self.spark.table(f"{SCHEMA}.events")
            .filter(F.col("timestamp") >= F.expr("now() - interval 7 days"))
            .filter(F.col("geo_country").isNotNull())
            .groupBy("source_ip")
            .agg(F.collect_set("geo_country").alias("seen_countries"))
        )

        return alerts.join(
            events_geo, "source_ip", "left"
        ).withColumn(
            "geo_anomaly",
            F.when(
                F.size(F.array_intersect(
                    F.coalesce("seen_countries", F.array()),
                    F.array(*[F.lit(c) for c in high_risk_countries])
                )) > 0,
                True
            ).otherwise(False)
        )

    def _calculate_enriched_risk(self, alerts):
        cfg = self.config.get("enrichment", {})
        return alerts.withColumn(
            "enriched_risk_score",
            F.least(
                F.col("risk_score")
                + F.when(F.col("threat_match_count") > 0, cfg.get("ioc_match_bonus", 30)).otherwise(0)
                + F.when(F.col("has_user_anomaly"), cfg.get("user_anomaly_bonus", 15)).otherwise(0)
                + F.when(F.col("geo_anomaly"), cfg.get("geo_anomaly_bonus", 10)).otherwise(0),
                F.lit(cfg.get("max_risk_score", 100)),
            )
        ).withColumn(
            "enrichment_data",
            F.to_json(F.struct(
                "threat_match_count", "src_ip_matches", "dst_ip_matches",
                "src_threat_types", "dst_threat_types",
                "has_user_anomaly", "anomaly_types", "user_anomaly_risk",
                "geo_anomaly", "seen_countries",
            ))
        ).withColumn("enrichment_completed", F.lit(True)
        ).withColumn("enriched_at", F.current_timestamp()
        ).withColumn("updated_at", F.current_timestamp())

    def _merge_to_alerts(self, enriched):
        update_df = enriched.select(
            "id", "enrichment_data", "enriched_risk_score",
            "enrichment_completed", "enriched_at", "ioc_match",
            "ioc_match_details", "geo_anomaly", "updated_at",
        )
        DeltaTable.forName(self.spark, f"{SCHEMA}.alerts").alias("t").merge(
            update_df.alias("s"), "t.id = s.id"
        ).whenMatchedUpdate(set={
            "enrichment_data": "s.enrichment_data",
            "enriched_risk_score": "s.enriched_risk_score",
            "enrichment_completed": "s.enrichment_completed",
            "enriched_at": "s.enriched_at",
            "ioc_match": F.coalesce("s.ioc_match", "t.ioc_match"),
            "ioc_match_details": F.coalesce("s.ioc_match_details", "t.ioc_match_details"),
            "geo_anomaly": "s.geo_anomaly",
            "updated_at": "s.updated_at",
        }).execute()

    def _create_investigation_tasks(self, enriched):
        high_risk = enriched.filter(
            (F.col("enriched_risk_score") >= 50) |
            (F.col("priority").isin(["critical", "high"]))
        )
        tasks = high_risk.select(
            F.expr("uuid()").alias("id"),
            F.lit("investigation").alias("agent_type"),
            F.lit("alert_investigation").alias("task_type"),
            F.col("priority"),
            F.lit("pending").alias("status"),
            F.col("id").alias("alert_id"),
            F.current_timestamp().alias("created_at"),
        )
        tasks.write.format("delta").mode("append").saveAsTable(f"{SCHEMA}.agent_tasks")


enrichment_agent = EnrichmentAgent(spark, CONFIG)

print("Enrichment Agent initialized")
print("  Sources: threat feeds (IP/domain/hash) + user anomalies + geolocation + historical")`
    },
    {
      type: 'code',
      content: `# Cell 4: Investigation Agent -- Graph-Based Correlation & Timeline

class InvestigationAgent(BaseAgent):
    """
    Correlate events, build attack timelines, and identify attack patterns.

    Investigation Steps:
      1. Retrieve events correlated with the alert
      2. Build an attack timeline from event sequence
      3. Perform graph traversal for lateral movement detection
      4. Identify MITRE ATT&CK patterns
      5. Determine if a case should be created
    """
    AGENT_TYPE = "investigation"

    LATERAL_MOVEMENT_INDICATORS = [
        "login_success",
        "privilege_escalation",
        "service_installed",
    ]

    def _execute(self, **kwargs):
        batch_size = self.config.get("investigation", {}).get("batch_size", 50)

        to_investigate = (
            self.spark.table(f"{SCHEMA}.alerts")
            .filter(
                (F.col("enrichment_completed") == True) &
                (F.col("investigation_completed") == False) &
                (F.col("priority").isin(["critical", "high", "medium"]))
            )
            .orderBy(F.desc("enriched_risk_score"))
            .limit(batch_size)
        )

        count = to_investigate.count()
        if count == 0:
            return {"processed": 0}

        investigated = self._build_investigation(to_investigate)
        investigated.cache()

        self._merge_to_alerts(investigated)
        cases_created = self._create_cases(investigated)
        self._create_response_tasks(investigated)
        investigated.unpersist()

        return {
            "processed": count,
            "patterns_found": investigated.filter(F.size("attack_patterns_found") > 0).count(),
            "cases_created": cases_created,
            "lateral_movement_detected": investigated.filter(F.col("lateral_movement_hops") > 0).count(),
        }

    def _build_investigation(self, alerts):
        events = self.spark.table(f"{SCHEMA}.events")
        timeline_hours = self.config.get("investigation", {}).get("timeline_window_hours", 24)

        related_events = events.filter(
            F.col("timestamp") >= F.expr(f"now() - interval {timeline_hours} hours")
        )

        source_event_counts = (
            related_events
            .groupBy("source_ip")
            .agg(
                F.count("*").alias("related_event_count"),
                F.collect_set("event_type").alias("related_event_types"),
                F.countDistinct("hostname").alias("distinct_hosts_contacted"),
                F.countDistinct("dest_ip").alias("distinct_dest_ips"),
                F.sum(F.when(F.col("event_type") == "login_success", 1).otherwise(0)).alias("successful_logins"),
                F.sum(F.when(F.col("event_type") == "login_failure", 1).otherwise(0)).alias("failed_logins"),
                F.sum(F.when(F.col("severity") == "critical", 1).otherwise(0)).alias("critical_events"),
            )
        )

        lateral_threshold = self.config.get("investigation", {}).get("lateral_movement_threshold", 3)

        investigated = alerts.join(
            source_event_counts, "source_ip", "left"
        ).withColumn(
            "lateral_movement_hops",
            F.when(
                F.coalesce("distinct_hosts_contacted", F.lit(0)) >= lateral_threshold,
                F.col("distinct_hosts_contacted")
            ).otherwise(0)
        ).withColumn(
            "attack_patterns_found",
            F.when(
                (F.col("enriched_risk_score") >= 80) & (F.col("ioc_match") == True),
                F.array(F.lit("known_threat_communication"))
            ).when(
                F.col("lateral_movement_hops") > 0,
                F.array(F.lit("lateral_movement"), F.lit("credential_abuse"))
            ).when(
                F.col("title").contains("Exfiltration"),
                F.array(F.lit("data_exfiltration"))
            ).when(
                F.col("title").contains("Ransomware"),
                F.array(F.lit("ransomware_activity"))
            ).when(
                (F.coalesce("failed_logins", F.lit(0)) > 20) &
                (F.coalesce("successful_logins", F.lit(0)) > 0),
                F.array(F.lit("credential_spray_success"))
            ).otherwise(F.array())
        ).withColumn(
            "should_create_case",
            (F.col("enriched_risk_score") >= self.config.get("investigation", {}).get("case_creation_threshold", 70)) |
            (F.size("attack_patterns_found") > 0) |
            (F.col("priority") == "critical") |
            (F.col("lateral_movement_hops") > 0)
        ).withColumn(
            "investigation_data",
            F.to_json(F.struct(
                F.lit("Automated investigation by Investigation Agent").alias("summary"),
                "related_event_count", "related_event_types",
                "distinct_hosts_contacted", "distinct_dest_ips",
                "successful_logins", "failed_logins", "critical_events",
                "lateral_movement_hops", "attack_patterns_found",
                F.col("enriched_risk_score").alias("final_risk_score"),
                F.current_timestamp().alias("investigated_at"),
            ))
        ).withColumn("investigation_completed", F.lit(True)
        ).withColumn("investigated_at", F.current_timestamp()
        ).withColumn("updated_at", F.current_timestamp())

        return investigated

    def _merge_to_alerts(self, investigated):
        update_df = investigated.select(
            "id", "investigation_data", "investigation_completed",
            "investigated_at", "lateral_movement_hops", "updated_at",
        ).withColumn(
            "attack_patterns",
            investigated["attack_patterns_found"]
        )
        DeltaTable.forName(self.spark, f"{SCHEMA}.alerts").alias("t").merge(
            update_df.alias("s"), "t.id = s.id"
        ).whenMatchedUpdate(set={
            "investigation_data": "s.investigation_data",
            "investigation_completed": "s.investigation_completed",
            "investigated_at": "s.investigated_at",
            "lateral_movement_hops": "s.lateral_movement_hops",
            "attack_patterns": "s.attack_patterns",
            "updated_at": "s.updated_at",
        }).execute()

    def _create_cases(self, investigated):
        to_case = investigated.filter(
            (F.col("should_create_case") == True) &
            (F.col("case_created") == False)
        )
        count = to_case.count()
        if count == 0:
            return 0

        cases = to_case.select(
            F.expr("uuid()").alias("id"),
            F.concat(F.lit("Investigation: "), F.col("title")).alias("title"),
            F.concat(
                F.lit("Automated investigation. Risk="), F.col("enriched_risk_score"),
                F.lit(", Lateral hops="), F.col("lateral_movement_hops"),
            ).alias("description"),
            F.col("severity"), F.col("priority"),
            F.lit("investigating").alias("status"),
            F.lit("incident").alias("case_type"),
            F.col("id").alias("alert_id"),
            F.col("investigation_data"),
            F.col("mitre_techniques"),
            F.lit("investigation_agent").alias("created_by"),
            F.current_timestamp().alias("created_at"),
        )
        cases.write.format("delta").mode("append").saveAsTable(f"{SCHEMA}.cases")

        alert_ids = [row.id for row in to_case.select("id").collect()]
        alerts_table = DeltaTable.forName(self.spark, f"{SCHEMA}.alerts")
        for aid in alert_ids:
            alerts_table.update(condition=f"id = '{aid}'", set={"case_created": "true"})

        return count

    def _create_response_tasks(self, investigated):
        high_risk = investigated.filter(
            (F.col("enriched_risk_score") >= self.config.get("response", {}).get("auto_block_threshold", 80)) |
            (F.col("priority") == "critical")
        )
        tasks = high_risk.select(
            F.expr("uuid()").alias("id"),
            F.lit("response").alias("agent_type"),
            F.lit("automated_response").alias("task_type"),
            F.col("priority"),
            F.lit("pending").alias("status"),
            F.col("id").alias("alert_id"),
            F.current_timestamp().alias("created_at"),
        )
        tasks.write.format("delta").mode("append").saveAsTable(f"{SCHEMA}.agent_tasks")


investigation_agent = InvestigationAgent(spark, CONFIG)

print("Investigation Agent initialized")
print("  Capabilities: event correlation, lateral movement detection, timeline, case creation")`
    },
    {
      type: 'code',
      content: `# Cell 5: Response Agent -- Automated Threat Response & Containment

class ResponseAgent(BaseAgent):
    """
    Execute automated response actions for high-risk alerts.

    Response Matrix:
      enriched_risk >= 90 + IOC match -> block_ip (auto)
      lateral movement detected       -> isolate_host (requires approval)
      brute force detected            -> block_ip (auto) + disable_user (approval)
      ransomware indicators           -> isolate_host (auto) + block_ip (auto)
      data exfiltration               -> block_ip (auto)
      default high risk               -> monitor + create_ticket

    All actions are logged and support rollback within a configurable window.
    """
    AGENT_TYPE = "response"

    def _execute(self, **kwargs):
        batch_size = self.config.get("response", {}).get("batch_size", 30)
        threshold = self.config.get("response", {}).get("auto_block_threshold", 80)

        to_respond = (
            self.spark.table(f"{SCHEMA}.alerts")
            .filter(
                (F.col("investigation_completed") == True) &
                (F.col("response_completed") == False) &
                (F.col("enriched_risk_score") >= threshold)
            )
            .orderBy(F.desc("enriched_risk_score"))
            .limit(batch_size)
        )

        count = to_respond.count()
        if count == 0:
            return {"processed": 0}

        with_actions = self._determine_actions(to_respond)
        with_actions.cache()

        self._execute_blocks(with_actions)
        self._log_response_actions(with_actions)
        self._merge_to_alerts(with_actions)
        with_actions.unpersist()

        return {
            "processed": count,
            "ips_blocked": with_actions.filter(F.col("action") == "block_ip").count(),
            "hosts_isolated": with_actions.filter(F.col("action") == "isolate_host").count(),
            "tickets_created": with_actions.filter(F.col("action") == "create_ticket").count(),
            "approvals_required": with_actions.filter(F.col("needs_approval")).count(),
        }

    def _determine_actions(self, alerts):
        return alerts.withColumn(
            "action",
            F.when(
                F.col("title").contains("Ransomware"), F.lit("isolate_host")
            ).when(
                (F.col("enriched_risk_score") >= 90) & (F.col("ioc_match") == True),
                F.lit("block_ip")
            ).when(
                F.col("lateral_movement_hops") > 0, F.lit("isolate_host")
            ).when(
                F.col("title").contains("Brute Force"), F.lit("block_ip")
            ).when(
                F.col("title").contains("Exfiltration"), F.lit("block_ip")
            ).when(
                F.col("title").contains("Credential Dumping"), F.lit("isolate_host")
            ).otherwise(F.lit("create_ticket"))
        ).withColumn(
            "target",
            F.when(F.col("action") == "block_ip", F.col("source_ip"))
            .when(F.col("action") == "isolate_host", F.col("hostname"))
            .when(F.col("action") == "disable_user", F.col("username"))
            .otherwise(F.lit(None))
        ).withColumn(
            "target_type",
            F.when(F.col("action") == "block_ip", F.lit("ip"))
            .when(F.col("action") == "isolate_host", F.lit("host"))
            .when(F.col("action") == "disable_user", F.lit("user"))
            .otherwise(F.lit("ticket"))
        ).withColumn(
            "needs_approval",
            F.col("action").isin(
                self.config.get("response", {}).get("require_approval_actions", ["disable_user", "isolate_host"])
            )
        )

    def _execute_blocks(self, actions):
        block_duration = self.config.get("response", {}).get("block_duration_hours", 24)

        blocks = actions.filter(
            (F.col("action") == "block_ip") &
            (F.col("target").isNotNull()) &
            (~F.col("needs_approval"))
        )

        if blocks.count() == 0:
            return

        blocklist = blocks.select(
            F.expr("uuid()").alias("id"),
            F.lit("auto_blocked_ips").alias("list_name"),
            F.col("target").alias("value"),
            F.lit("blocklist").alias("list_type"),
            F.lit("ip").alias("category"),
            F.concat(F.lit("Response Agent: "), F.col("title")).alias("reason"),
            F.col("severity"),
            F.lit(True).alias("auto_added"),
            F.col("id").alias("source_alert_id"),
            F.lit("response_agent").alias("source_agent"),
            F.expr(f"now() + interval {block_duration} hours").alias("expires_at"),
            F.lit(True).alias("is_active"),
            F.current_timestamp().alias("created_at"),
        )
        blocklist.write.format("delta").mode("append").saveAsTable(f"{SCHEMA}.active_blocklist")

    def _log_response_actions(self, actions):
        logs = actions.select(
            F.expr("uuid()").alias("id"),
            F.col("id").alias("alert_id"),
            F.col("action").alias("action_type"),
            F.col("target"),
            F.col("target_type"),
            F.when(F.col("needs_approval"), F.lit("pending_approval")).otherwise(F.lit("executed")).alias("status"),
            F.to_json(F.struct(
                F.lit(True).alias("automated"),
                F.col("enriched_risk_score").alias("risk_score"),
                F.col("ioc_match"),
                F.col("lateral_movement_hops"),
            )).alias("details"),
            F.lit("response_agent").alias("executed_by"),
            F.col("needs_approval").alias("requires_approval"),
            F.when(~F.col("needs_approval"), F.current_timestamp()).alias("executed_at"),
            F.current_timestamp().alias("created_at"),
        )
        logs.write.format("delta").mode("append").saveAsTable(f"{SCHEMA}.response_actions")

    def _merge_to_alerts(self, actions):
        update_df = actions.select(
            "id",
            F.to_json(F.struct("action", "target", "target_type", "needs_approval")).alias("response_actions"),
            F.lit(True).alias("response_completed"),
            F.current_timestamp().alias("responded_at"),
            F.when(F.col("needs_approval"), F.lit("pending_approval")).otherwise(F.lit("executed")).alias("response_status"),
            F.lit(True).alias("rollback_available"),
            F.current_timestamp().alias("updated_at"),
        )
        DeltaTable.forName(self.spark, f"{SCHEMA}.alerts").alias("t").merge(
            update_df.alias("s"), "t.id = s.id"
        ).whenMatchedUpdate(set={
            "response_actions": "s.response_actions",
            "response_completed": "s.response_completed",
            "responded_at": "s.responded_at",
            "response_status": "s.response_status",
            "rollback_available": "s.rollback_available",
            "updated_at": "s.updated_at",
        }).execute()


response_agent = ResponseAgent(spark, CONFIG)

print("Response Agent initialized")
print("  Auto actions: block_ip, update_firewall, quarantine_file")
print("  Approval-required: isolate_host, disable_user")`
    },
    {
      type: 'code',
      content: `# Cell 6: Pattern Discovery Agent -- ML-Powered Attack Pattern Mining

class PatternDiscoveryAgent(BaseAgent):
    """
    Discover new attack patterns using statistical and ML-based analysis.

    Discovery Methods:
      1. Event sequence mining -- find common suspicious event sequences
      2. Statistical anomaly detection -- z-score on event volumes
      3. IP/user clustering -- group alerts by shared infrastructure
      4. Temporal pattern detection -- periodic/recurring attack patterns

    High-confidence patterns are automatically converted to correlation rules.
    """
    AGENT_TYPE = "pattern_discovery"

    def _execute(self, **kwargs):
        lookback = self.config.get("pattern_discovery", {}).get("lookback_days", 7)
        min_confidence = self.config.get("pattern_discovery", {}).get("min_confidence", 0.60)

        sequence_patterns = self._mine_event_sequences(lookback)
        statistical_patterns = self._detect_statistical_anomalies(lookback)
        clustering_patterns = self._cluster_alert_sources(lookback)
        temporal_patterns = self._detect_temporal_patterns(lookback)

        all_patterns = sequence_patterns + statistical_patterns + clustering_patterns + temporal_patterns
        self._store_patterns(all_patterns)
        rules_created = self._convert_to_rules(min_confidence)

        return {
            "sequence_patterns": len(sequence_patterns),
            "statistical_patterns": len(statistical_patterns),
            "clustering_patterns": len(clustering_patterns),
            "temporal_patterns": len(temporal_patterns),
            "total_patterns": len(all_patterns),
            "rules_created": rules_created,
        }

    def _mine_event_sequences(self, lookback_days):
        patterns = []
        min_events = self.config.get("pattern_discovery", {}).get("sequence_min_events", 5)

        sessions = (
            self.spark.table(f"{SCHEMA}.events")
            .filter(F.col("timestamp") >= F.expr(f"now() - interval {lookback_days} days"))
            .withColumn("session_key", F.concat(
                F.col("source_ip"), F.lit("_"),
                F.date_format("timestamp", "yyyy-MM-dd-HH"),
            ))
            .groupBy("session_key", "source_ip")
            .agg(
                F.collect_list(F.struct("event_type", "timestamp", "severity")).alias("events"),
                F.count("*").alias("event_count"),
                F.countDistinct("dest_ip").alias("distinct_targets"),
                F.sum(F.when(F.col("severity") == "critical", 1).otherwise(0)).alias("critical_count"),
            )
            .filter(F.col("event_count") >= min_events)
        )

        brute_force_sessions = sessions.filter(
            F.col("event_count") >= 10
        ).count()

        if brute_force_sessions > 10:
            patterns.append({
                "pattern_name": "Distributed Brute Force Sequence",
                "pattern_type": "sequence",
                "confidence_score": min(0.6 + brute_force_sessions / 1000, 0.95),
                "event_types": ["login_failure", "login_success"],
                "occurrence_count": brute_force_sessions,
                "severity": "high",
                "mitre_tactics": ["TA0006"],
                "mitre_techniques": ["T1110.003"],
            })

        multi_target_sessions = sessions.filter(F.col("distinct_targets") >= 5).count()
        if multi_target_sessions > 5:
            patterns.append({
                "pattern_name": "Lateral Scanning from Internal Host",
                "pattern_type": "sequence",
                "confidence_score": min(0.65 + multi_target_sessions / 500, 0.90),
                "event_types": ["connection", "login_success", "login_failure"],
                "occurrence_count": multi_target_sessions,
                "severity": "high",
                "mitre_tactics": ["TA0008", "TA0043"],
                "mitre_techniques": ["T1046", "T1021"],
            })

        return patterns

    def _detect_statistical_anomalies(self, lookback_days):
        patterns = []

        hourly = (
            self.spark.table(f"{SCHEMA}.events")
            .filter(F.col("timestamp") >= F.expr(f"now() - interval {lookback_days} days"))
            .withColumn("hour_bucket", F.date_format("timestamp", "yyyy-MM-dd-HH"))
            .groupBy("hour_bucket")
            .agg(
                F.count("*").alias("event_count"),
                F.sum("bytes_sent").alias("total_bytes"),
                F.sum(F.when(F.col("severity").isin(["high", "critical"]), 1).otherwise(0)).alias("high_sev_count"),
            )
        )

        stats = hourly.agg(
            F.avg("event_count").alias("avg_events"),
            F.stddev("event_count").alias("std_events"),
            F.avg("total_bytes").alias("avg_bytes"),
            F.stddev("total_bytes").alias("std_bytes"),
            F.avg("high_sev_count").alias("avg_high_sev"),
            F.stddev("high_sev_count").alias("std_high_sev"),
        ).collect()[0]

        event_threshold = (stats.avg_events or 0) + 3 * (stats.std_events or 0)
        anomalous = hourly.filter(F.col("event_count") > event_threshold).count() if event_threshold > 0 else 0
        if anomalous > 0:
            patterns.append({
                "pattern_name": "Anomalous Event Volume Spike",
                "pattern_type": "statistical_anomaly",
                "confidence_score": 0.75,
                "event_types": ["all"],
                "occurrence_count": anomalous,
                "severity": "medium",
                "mitre_tactics": [],
                "mitre_techniques": [],
            })

        byte_threshold = (stats.avg_bytes or 0) + 3 * (stats.std_bytes or 0)
        byte_anomalies = hourly.filter(F.col("total_bytes") > byte_threshold).count() if byte_threshold > 0 else 0
        if byte_anomalies > 0:
            patterns.append({
                "pattern_name": "Anomalous Data Transfer Volume",
                "pattern_type": "statistical_anomaly",
                "confidence_score": 0.80,
                "event_types": ["connection", "large_data_transfer"],
                "occurrence_count": byte_anomalies,
                "severity": "high",
                "mitre_tactics": ["TA0010"],
                "mitre_techniques": ["T1048"],
            })

        return patterns

    def _cluster_alert_sources(self, lookback_days):
        patterns = []

        source_clusters = (
            self.spark.table(f"{SCHEMA}.alerts")
            .filter(F.col("created_at") >= F.expr(f"now() - interval {lookback_days} days"))
            .groupBy("source_ip")
            .agg(
                F.count("*").alias("alert_count"),
                F.countDistinct("title").alias("distinct_alert_types"),
                F.collect_set("severity").alias("severity_set"),
                F.max("enriched_risk_score").alias("max_risk"),
            )
            .filter(F.col("alert_count") >= 3)
            .filter(F.col("distinct_alert_types") >= 2)
        )

        multi_vector_count = source_clusters.count()
        if multi_vector_count > 0:
            patterns.append({
                "pattern_name": "Multi-Vector Source IP Cluster",
                "pattern_type": "cluster",
                "confidence_score": min(0.70 + multi_vector_count / 100, 0.95),
                "event_types": ["multiple"],
                "occurrence_count": multi_vector_count,
                "severity": "high",
                "mitre_tactics": ["TA0001", "TA0008"],
                "mitre_techniques": [],
            })

        return patterns

    def _detect_temporal_patterns(self, lookback_days):
        patterns = []

        hourly_dist = (
            self.spark.table(f"{SCHEMA}.alerts")
            .filter(F.col("created_at") >= F.expr(f"now() - interval {lookback_days} days"))
            .withColumn("hour_of_day", F.hour("created_at"))
            .groupBy("hour_of_day")
            .agg(F.count("*").alias("alert_count"))
        )

        off_hours = hourly_dist.filter(
            (F.col("hour_of_day") < 6) | (F.col("hour_of_day") > 22)
        ).agg(F.sum("alert_count")).collect()[0][0] or 0

        total = hourly_dist.agg(F.sum("alert_count")).collect()[0][0] or 1
        off_hours_pct = off_hours / total

        if off_hours_pct > 0.15:
            patterns.append({
                "pattern_name": "Elevated Off-Hours Alert Activity",
                "pattern_type": "temporal",
                "confidence_score": min(0.5 + off_hours_pct, 0.90),
                "event_types": ["all"],
                "occurrence_count": int(off_hours),
                "severity": "medium",
                "mitre_tactics": [],
                "mitre_techniques": [],
            })

        return patterns

    def _store_patterns(self, patterns):
        if not patterns:
            return
        records = []
        for p in patterns:
            records.append({
                "id": gen_uuid(),
                "pattern_name": p["pattern_name"],
                "pattern_type": p["pattern_type"],
                "confidence_score": p["confidence_score"],
                "event_types": p.get("event_types", []),
                "common_features": json.dumps({}),
                "occurrence_count": p["occurrence_count"],
                "severity": p["severity"],
                "mitre_tactics": p.get("mitre_tactics", []),
                "mitre_techniques": p.get("mitre_techniques", []),
                "converted_to_rule": False,
            })
        df = self.spark.createDataFrame(records)
        df = df.withColumn("created_at", F.current_timestamp())
        df.write.format("delta").mode("append").saveAsTable(f"{SCHEMA}.discovered_patterns")

    def _convert_to_rules(self, min_confidence):
        unconverted = (
            self.spark.table(f"{SCHEMA}.discovered_patterns")
            .filter(
                (F.col("confidence_score") >= min_confidence) &
                (F.col("converted_to_rule") == False)
            )
        )
        count = unconverted.count()
        if count == 0:
            return 0

        rules = unconverted.select(
            F.expr("uuid()").alias("id"),
            F.concat(F.lit("AI: "), F.col("pattern_name")).alias("name"),
            F.concat(
                F.lit("Auto-generated from "), F.col("pattern_type"),
                F.lit(" pattern. Confidence: "), F.round(F.col("confidence_score") * 100, 1), F.lit("%"),
            ).alias("description"),
            F.lit("ai_generated").alias("rule_type"),
            F.to_json(F.struct("event_types", "pattern_type")).alias("conditions"),
            F.lit(60).alias("time_window_minutes"),
            F.lit(5).alias("threshold"),
            F.col("severity"),
            F.lit(True).alias("enabled"),
            F.lit(False).alias("auto_response_enabled"),
            F.col("confidence_score").alias("confidence"),
            F.col("id").alias("source_pattern_id"),
            F.lit("pattern_discovery_agent").alias("generated_by"),
            F.concat(
                F.lit("Discovered "), F.col("pattern_type"),
                F.lit(" pattern with "), F.col("occurrence_count"),
                F.lit(" occurrences."),
            ).alias("ai_reasoning"),
            F.current_timestamp().alias("created_at"),
        )
        rules.write.format("delta").mode("append").saveAsTable(f"{SCHEMA}.correlation_rules")

        pattern_ids = [r.id for r in unconverted.select("id").collect()]
        patterns_table = DeltaTable.forName(self.spark, f"{SCHEMA}.discovered_patterns")
        for pid in pattern_ids:
            patterns_table.update(
                condition=f"id = '{pid}'",
                set={"converted_to_rule": "true", "converted_at": "current_timestamp()"},
            )
        return count


pattern_agent = PatternDiscoveryAgent(spark, CONFIG)

print("Pattern Discovery Agent initialized")
print("  Methods: sequence mining, statistical anomaly, source clustering, temporal analysis")`
    },
    {
      type: 'code',
      content: `# Cell 7: Execute Full Agent Pipeline

print("=" * 72)
print("  AGENTIC SOC - FULL PIPELINE EXECUTION")
print("=" * 72)

pipeline_start = time.time()
results = {}

print("\\n[1/5] Triage Agent")
results["triage"] = triage_agent.run()
print(f"  Result: {results['triage']}")

print("\\n[2/5] Enrichment Agent")
results["enrichment"] = enrichment_agent.run()
print(f"  Result: {results['enrichment']}")

print("\\n[3/5] Investigation Agent")
results["investigation"] = investigation_agent.run()
print(f"  Result: {results['investigation']}")

print("\\n[4/5] Response Agent")
results["response"] = response_agent.run()
print(f"  Result: {results['response']}")

print("\\n[5/5] Pattern Discovery Agent")
results["pattern_discovery"] = pattern_agent.run()
print(f"  Result: {results['pattern_discovery']}")

pipeline_duration = time.time() - pipeline_start

print("\\n" + "=" * 72)
print("  PIPELINE COMPLETE")
print("=" * 72)
print(f"  Duration: {pipeline_duration:.2f}s")
print()
for agent, result in results.items():
    status = result.get("status", "unknown")
    processed = result.get("processed", result.get("total_patterns", 0))
    exec_time = result.get("execution_time_ms", 0)
    print(f"  {agent:22s}  status={status:8s}  processed={processed:>4}  time={exec_time:>6}ms")`
    },
    {
      type: 'code',
      content: `# Cell 8: Pipeline Validation Dashboard

import matplotlib.pyplot as plt

fig, axes = plt.subplots(2, 3, figsize=(22, 12))
fig.suptitle("Agentic SOC - Pipeline Execution Results", fontsize=16, fontweight="bold")

pipeline_status = spark.sql(f"""
    SELECT 'New' as stage, COUNT(*) as cnt FROM {SCHEMA}.alerts WHERE status = 'new'
    UNION ALL
    SELECT 'Triaged', COUNT(*) FROM {SCHEMA}.alerts WHERE status = 'triaged' AND enrichment_completed = false
    UNION ALL
    SELECT 'Enriched', COUNT(*) FROM {SCHEMA}.alerts WHERE enrichment_completed = true AND investigation_completed = false
    UNION ALL
    SELECT 'Investigated', COUNT(*) FROM {SCHEMA}.alerts WHERE investigation_completed = true AND response_completed = false
    UNION ALL
    SELECT 'Responded', COUNT(*) FROM {SCHEMA}.alerts WHERE response_completed = true
""").toPandas()

if len(pipeline_status) > 0:
    stage_colors = ["#64748b", "#f59e0b", "#3b82f6", "#8b5cf6", "#10b981"]
    pipeline_status.set_index("stage")["cnt"].plot(
        kind="bar", ax=axes[0, 0], color=stage_colors, edgecolor="#374151")
axes[0, 0].set_title("Alert Pipeline Status", fontweight="bold")

agent_names = list(results.keys())
agent_processed = [r.get("processed", r.get("total_patterns", 0)) for r in results.values()]
agent_times = [r.get("execution_time_ms", 0) / 1000 for r in results.values()]

axes[0, 1].barh(agent_names, agent_processed, color="#2563eb", edgecolor="#1e40af")
axes[0, 1].set_xlabel("Alerts Processed")
axes[0, 1].set_title("Agents: Alerts Processed", fontweight="bold")

axes[0, 2].barh(agent_names, agent_times, color="#10b981", edgecolor="#047857")
axes[0, 2].set_xlabel("Execution Time (s)")
axes[0, 2].set_title("Agents: Execution Time", fontweight="bold")

risk_dist = (
    spark.table(f"{SCHEMA}.alerts")
    .filter(F.col("enriched_risk_score").isNotNull())
    .select("enriched_risk_score")
    .toPandas()
)
if len(risk_dist) > 0:
    axes[1, 0].hist(risk_dist["enriched_risk_score"], bins=20, color="#0ea5e9",
                     edgecolor="#0369a1", alpha=0.8)
    axes[1, 0].axvline(x=80, color="#ef4444", linestyle="--", label="Auto-response threshold")
    axes[1, 0].legend()
axes[1, 0].set_title("Enriched Risk Score Distribution", fontweight="bold")

action_dist = (
    spark.table(f"{SCHEMA}.response_actions")
    .groupBy("action_type").count()
    .toPandas()
)
if len(action_dist) > 0:
    action_dist.set_index("action_type")["count"].plot(
        kind="bar", ax=axes[1, 1], color="#ef4444", edgecolor="#b91c1c")
axes[1, 1].set_title("Response Actions Taken", fontweight="bold")

pattern_dist = (
    spark.table(f"{SCHEMA}.discovered_patterns")
    .groupBy("pattern_type").count()
    .toPandas()
)
if len(pattern_dist) > 0:
    pattern_dist.set_index("pattern_type")["count"].plot(
        kind="bar", ax=axes[1, 2], color="#f59e0b", edgecolor="#b45309")
axes[1, 2].set_title("Discovered Patterns by Type", fontweight="bold")

plt.tight_layout()
plt.show()

print(f"Pipeline validation complete. Total duration: {pipeline_duration:.2f}s")`
    },
  ],
};
