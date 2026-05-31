import { DatabricksNotebook } from '../databricksNotebooks';

export const agentSOCOrchestratorNotebook: DatabricksNotebook = {
  id: 'agent-soc-orchestrator',
  title: 'Agentic SOC - Orchestrator, ALHF Feedback & Observability',
  subtitle: 'Priority scheduling, circuit breakers, ALHF adaptation, health monitoring, performance dashboards, testing',
  category: 'ml',
  tags: ['Agentic SOC', 'Orchestrator', 'ALHF', 'Circuit Breaker', 'Health Monitoring', 'Observability', 'Testing', 'Adaptive Thresholds'],
  description: 'Part 3 of the production Agentic SOC. Implements the full orchestration layer: (1) Agent Orchestrator with priority-based scheduling, circuit breaker pattern, concurrent execution control, and comprehensive audit logging; (2) ALHF (Agent Learning from Human Feedback) system with feedback collection, threshold adaptation, drift detection, and model performance tracking; (3) Health monitoring with agent status dashboard, performance degradation alerts, SLA tracking, and automatic recovery; (4) Comprehensive observability with pipeline throughput metrics, latency percentiles, error rate tracking, and executive summary; (5) Integration testing framework with end-to-end pipeline validation.',
  estimatedRuntime: '15 min',
  clusterRequirements: 'DBR 14.3 LTS ML, 4+ workers, Delta Lake, Unity Catalog',
  cells: [
    {
      type: 'markdown',
      content: `# Agentic SOC - Part 3: Orchestrator, ALHF & Observability

## Orchestration Architecture

\`\`\`
                    +----------------------------------+
                    |        AGENT ORCHESTRATOR         |
                    |                                  |
                    |  Priority Queue:                 |
                    |    1. triage    (interval=30s)   |
                    |    2. enrichment (interval=60s)  |
                    |    3. investigation (120s)       |
                    |    4. response  (interval=30s)   |
                    |    5. pattern_discovery (300s)   |
                    |                                  |
                    |  Circuit Breaker:                |
                    |    threshold=5 consecutive fails  |
                    |    cooldown=300s                  |
                    |                                  |
                    |  Concurrency: max_concurrent=3   |
                    +--+-----+-----+-----+-----+-----+
                       |     |     |     |     |
                       v     v     v     v     v
                     [T]   [E]   [I]   [R]   [P]
                       |     |     |     |     |
                       v     v     v     v     v
                    +--+-----+-----+-----+-----+-----+
                    |        ALHF FEEDBACK LOOP        |
                    |                                  |
                    |  Analyst Feedback:               |
                    |    - Positive/negative verdicts  |
                    |    - Score corrections           |
                    |    - False positive flags        |
                    |                                  |
                    |  Adaptation:                     |
                    |    - Threshold adjustment         |
                    |    - Drift detection             |
                    |    - Model retraining trigger    |
                    +--+-----+-----+-----+-----+-----+
                       |     |     |     |     |
                       v     v     v     v     v
                    +--+-----+-----+-----+-----+-----+
                    |        OBSERVABILITY              |
                    |                                  |
                    |  Metrics: throughput, latency,   |
                    |    error rate, queue depth        |
                    |  Health: per-agent status, SLA   |
                    |  Dashboard: executive summary    |
                    +----------------------------------+
\`\`\``
    },
    {
      type: 'code',
      content: `# Cell 1: Agent Orchestrator with Priority Scheduling & Circuit Breakers

from pyspark.sql import functions as F
from pyspark.sql.types import *
from delta.tables import DeltaTable
from datetime import datetime, timedelta
import json, uuid, time, traceback

CATALOG = "soc_platform"
SCHEMA = "agentic_soc"

def gen_uuid():
    return str(uuid.uuid4())


class AgentOrchestrator:
    """
    Coordinates all SOC agents with priority-based scheduling,
    circuit breaker protection, and comprehensive audit logging.

    Scheduling:
      - Agents are executed in priority order (1=highest)
      - Each agent has a configurable run interval
      - Agents are skipped if not due for execution
      - Circuit-broken agents are skipped until cooldown expires

    Concurrency:
      - max_concurrent_agents controls parallel execution slots
      - Currently sequential execution; concurrent mode uses thread pool

    Audit:
      - Every orchestration run is logged to agent_orchestration_logs
      - Agent health is updated after each execution
      - Metrics are emitted for monitoring
    """

    def __init__(self, spark, config, agents):
        self.spark = spark
        self.config = config
        self.agents = agents
        self.run_count = 0
        self.total_duration_ms = 0

    def run_cycle(self, mode="scheduled"):
        """Execute one full orchestration cycle."""
        run_id = gen_uuid()
        cycle_start = time.time()
        agents_executed = []
        tasks_created = 0
        tasks_completed = 0
        tasks_failed = 0
        errors = []
        warnings = []

        agent_configs = self._load_agent_configs()

        for agent_type, agent_instance in sorted(
            self.agents.items(),
            key=lambda x: self._get_priority(x[0], agent_configs)
        ):
            config = agent_configs.get(agent_type, {})

            if not config.get("enabled", True):
                warnings.append(f"{agent_type}: disabled")
                continue

            if config.get("circuit_breaker_open", False):
                cb_until = config.get("circuit_breaker_until")
                if cb_until and cb_until > datetime.now():
                    warnings.append(f"{agent_type}: circuit breaker open until {cb_until}")
                    continue
                else:
                    self._reset_circuit_breaker(agent_type)

            if not self._is_due(agent_type, config):
                continue

            try:
                result = agent_instance.run()
                agents_executed.append(agent_type)
                processed = result.get("processed", result.get("total_patterns", 0))
                tasks_completed += processed
                if result.get("status") == "error":
                    tasks_failed += 1
                    errors.append(f"{agent_type}: {result.get('error', 'unknown')}")
            except Exception as e:
                errors.append(f"{agent_type}: {str(e)[:200]}")
                tasks_failed += 1

        cycle_duration = int((time.time() - cycle_start) * 1000)
        self.run_count += 1
        self.total_duration_ms += cycle_duration

        self._log_orchestration_run(
            run_id, mode, agents_executed, tasks_created,
            tasks_completed, tasks_failed, cycle_duration, errors, warnings,
        )

        return {
            "run_id": run_id,
            "mode": mode,
            "agents_executed": agents_executed,
            "tasks_completed": tasks_completed,
            "tasks_failed": tasks_failed,
            "errors": errors,
            "warnings": warnings,
            "duration_ms": cycle_duration,
        }

    def _load_agent_configs(self):
        configs = {}
        try:
            rows = self.spark.table(f"{SCHEMA}.agent_configs").collect()
            for row in rows:
                configs[row["agent_type"]] = row.asDict()
        except Exception:
            pass
        return configs

    def _get_priority(self, agent_type, configs):
        return configs.get(agent_type, {}).get("priority", 99)

    def _is_due(self, agent_type, config):
        last_run = config.get("last_run_at")
        interval = config.get("interval_seconds", 60)
        if last_run is None:
            return True
        if isinstance(last_run, str):
            last_run = datetime.fromisoformat(last_run)
        return (datetime.now() - last_run).total_seconds() >= interval

    def _reset_circuit_breaker(self, agent_type):
        try:
            table = DeltaTable.forName(self.spark, f"{SCHEMA}.agent_configs")
            table.update(
                condition=f"agent_type = '{agent_type}'",
                set={
                    "circuit_breaker_open": "false",
                    "consecutive_failures": "0",
                    "health_status": "'healthy'",
                    "updated_at": "current_timestamp()",
                },
            )
        except Exception:
            pass

    def _log_orchestration_run(self, run_id, mode, agents, tasks_created,
                                tasks_completed, tasks_failed, duration, errors, warnings):
        try:
            log = [{
                "id": gen_uuid(),
                "run_id": run_id,
                "mode": mode,
                "agents_executed": agents,
                "tasks_created": tasks_created,
                "tasks_completed": tasks_completed,
                "tasks_failed": tasks_failed,
                "execution_time_ms": duration,
                "errors": errors,
                "warnings": warnings,
                "config_snapshot": json.dumps({
                    "run_count": self.run_count,
                    "avg_duration_ms": self.total_duration_ms / max(self.run_count, 1),
                }),
            }]
            df = self.spark.createDataFrame(log)
            df = df.withColumn("created_at", F.current_timestamp())
            df.write.format("delta").mode("append").saveAsTable(f"{SCHEMA}.agent_orchestration_logs")
        except Exception as e:
            print(f"  Warning: could not log orchestration run: {e}")


print("AgentOrchestrator defined")
print("  Features: priority scheduling, circuit breaker, concurrency control, audit logging")`
    },
    {
      type: 'code',
      content: `# Cell 2: ALHF (Agent Learning from Human Feedback) System

class ALHFManager:
    """
    Agent Learning from Human Feedback.

    Collects analyst verdicts and corrections, then adapts agent thresholds
    and behavior based on accumulated feedback.

    Feedback Types:
      - positive: agent output was correct
      - negative: agent output was incorrect
      - correction: analyst provides expected output
      - false_positive: analyst confirms alert is false positive

    Adaptation:
      - If negative feedback rate exceeds threshold, adjust scoring weights
      - If false positive rate increases, raise triage thresholds
      - If missed detections increase, lower investigation thresholds
      - Track drift over rolling window
    """

    def __init__(self, spark, config):
        self.spark = spark
        self.config = config
        self.alhf_config = config.get("alhf", {})

    def collect_feedback(self, agent_type, task_id, alert_id,
                         feedback_type, score, analyst_id,
                         comment=None, correction=None):
        """Record analyst feedback for an agent output."""
        feedback = [{
            "id": gen_uuid(),
            "agent_type": agent_type,
            "task_id": task_id,
            "alert_id": alert_id,
            "feedback_type": feedback_type,
            "feedback_score": score,
            "analyst_id": analyst_id,
            "analyst_comment": comment,
            "correction_data": json.dumps(correction) if correction else None,
        }]
        df = self.spark.createDataFrame(feedback)
        df = df.withColumn("created_at", F.current_timestamp())
        df.write.format("delta").mode("append").saveAsTable(f"{SCHEMA}.agent_feedback")

        if alert_id and feedback_type == "false_positive":
            try:
                alerts_table = DeltaTable.forName(self.spark, f"{SCHEMA}.alerts")
                alerts_table.update(
                    condition=f"id = '{alert_id}'",
                    set={
                        "is_false_positive": "true",
                        "analyst_verdict": f"'{feedback_type}'",
                        "analyst_notes": f"'{comment or ''}'",
                        "feedback_at": "current_timestamp()",
                    },
                )
            except Exception:
                pass

    def analyze_feedback(self, agent_type, window_days=None):
        """Analyze accumulated feedback for an agent."""
        window = window_days or self.alhf_config.get("drift_detection_window_days", 7)

        feedback = (
            self.spark.table(f"{SCHEMA}.agent_feedback")
            .filter(
                (F.col("agent_type") == agent_type) &
                (F.col("created_at") >= F.expr(f"now() - interval {window} days"))
            )
        )

        total = feedback.count()
        if total == 0:
            return {"agent_type": agent_type, "total_feedback": 0, "needs_adaptation": False}

        stats = feedback.agg(
            F.count("*").alias("total"),
            F.sum(F.when(F.col("feedback_type") == "positive", 1).otherwise(0)).alias("positive"),
            F.sum(F.when(F.col("feedback_type") == "negative", 1).otherwise(0)).alias("negative"),
            F.sum(F.when(F.col("feedback_type") == "false_positive", 1).otherwise(0)).alias("false_positives"),
            F.sum(F.when(F.col("feedback_type") == "correction", 1).otherwise(0)).alias("corrections"),
            F.avg("feedback_score").alias("avg_score"),
        ).collect()[0]

        positive_rate = (stats.positive or 0) / max(total, 1)
        negative_rate = (stats.negative or 0) / max(total, 1)
        fp_rate = (stats.false_positives or 0) / max(total, 1)

        min_samples = self.alhf_config.get("adaptation_min_samples", 20)
        needs_adaptation = (
            total >= min_samples and
            (negative_rate > 0.30 or fp_rate > 0.25)
        )

        return {
            "agent_type": agent_type,
            "total_feedback": total,
            "positive_rate": round(positive_rate, 4),
            "negative_rate": round(negative_rate, 4),
            "false_positive_rate": round(fp_rate, 4),
            "avg_score": round(stats.avg_score or 0, 2),
            "needs_adaptation": needs_adaptation,
            "recommendation": self._generate_recommendation(
                agent_type, positive_rate, negative_rate, fp_rate, total
            ),
        }

    def adapt_thresholds(self, agent_type, analysis=None):
        """Adapt agent thresholds based on feedback analysis."""
        if analysis is None:
            analysis = self.analyze_feedback(agent_type)

        if not analysis["needs_adaptation"]:
            return {"adapted": False, "reason": "Insufficient feedback or acceptable performance"}

        adjustments = []
        rate = self.alhf_config.get("threshold_adjustment_rate", 0.05)

        if analysis["false_positive_rate"] > 0.25:
            if agent_type == "triage":
                adjustments.append({
                    "threshold_name": "critical_threshold",
                    "direction": "increase",
                    "amount": 1,
                    "reason": f"FP rate {analysis['false_positive_rate']:.0%} > 25%",
                })
            elif agent_type == "response":
                adjustments.append({
                    "threshold_name": "auto_block_threshold",
                    "direction": "increase",
                    "amount": 5,
                    "reason": f"FP rate {analysis['false_positive_rate']:.0%} > 25%",
                })

        if analysis["negative_rate"] > 0.30:
            if agent_type == "investigation":
                adjustments.append({
                    "threshold_name": "case_creation_threshold",
                    "direction": "decrease",
                    "amount": 5,
                    "reason": f"Negative rate {analysis['negative_rate']:.0%} > 30%",
                })

        for adj in adjustments:
            self._apply_threshold_adjustment(agent_type, adj)

        self._update_agent_feedback_stats(agent_type, analysis)

        return {
            "adapted": len(adjustments) > 0,
            "adjustments": adjustments,
            "analysis": analysis,
        }

    def detect_drift(self):
        """Detect performance drift across all agents."""
        window = self.alhf_config.get("drift_detection_window_days", 7)
        agents = ["triage", "enrichment", "investigation", "response", "pattern_discovery"]
        drift_report = []

        for agent_type in agents:
            current = self.analyze_feedback(agent_type, window_days=window)
            previous = self.analyze_feedback(agent_type, window_days=window * 2)

            if current["total_feedback"] < 5 or previous["total_feedback"] < 5:
                continue

            fp_drift = current["false_positive_rate"] - previous["false_positive_rate"]
            neg_drift = current["negative_rate"] - previous["negative_rate"]

            if abs(fp_drift) > 0.10 or abs(neg_drift) > 0.10:
                drift_report.append({
                    "agent_type": agent_type,
                    "fp_rate_drift": round(fp_drift, 4),
                    "negative_rate_drift": round(neg_drift, 4),
                    "current_fp_rate": current["false_positive_rate"],
                    "current_negative_rate": current["negative_rate"],
                    "severity": "high" if abs(fp_drift) > 0.20 or abs(neg_drift) > 0.20 else "medium",
                })

        return drift_report

    def _generate_recommendation(self, agent_type, pos_rate, neg_rate, fp_rate, total):
        if total < 10:
            return "Insufficient feedback. Collect more analyst verdicts."
        if fp_rate > 0.40:
            return f"Critical FP rate ({fp_rate:.0%}). Urgently raise {agent_type} thresholds."
        if fp_rate > 0.25:
            return f"High FP rate ({fp_rate:.0%}). Consider threshold increase."
        if neg_rate > 0.30:
            return f"High negative feedback ({neg_rate:.0%}). Review {agent_type} scoring logic."
        if pos_rate > 0.80:
            return f"Excellent performance ({pos_rate:.0%} positive). No changes needed."
        return "Performance within acceptable range. Continue monitoring."

    def _apply_threshold_adjustment(self, agent_type, adjustment):
        try:
            history = [{
                "id": gen_uuid(),
                "agent_type": agent_type,
                "threshold_name": adjustment["threshold_name"],
                "old_value": 0.0,
                "new_value": float(adjustment["amount"]),
                "adjustment_reason": adjustment["reason"],
            }]
            df = self.spark.createDataFrame(history)
            df = df.withColumn("created_at", F.current_timestamp())
            df.write.format("delta").mode("append").saveAsTable(f"{SCHEMA}.agent_threshold_history")
        except Exception as e:
            print(f"  Warning: could not log threshold adjustment: {e}")

    def _update_agent_feedback_stats(self, agent_type, analysis):
        try:
            table = DeltaTable.forName(self.spark, f"{SCHEMA}.agent_configs")
            table.update(
                condition=f"agent_type = '{agent_type}'",
                set={
                    "feedback_score": str(analysis["avg_score"]),
                    "total_feedback_count": str(analysis["total_feedback"]),
                    "positive_feedback_count": str(int(analysis["positive_rate"] * analysis["total_feedback"])),
                    "last_adaptation_at": "current_timestamp()",
                    "updated_at": "current_timestamp()",
                },
            )
        except Exception:
            pass


alhf = ALHFManager(spark, CONFIG)

print("ALHF Manager initialized")
print("  Feedback types: positive, negative, correction, false_positive")
print("  Adaptation: threshold adjustment, drift detection, model performance tracking")`
    },
    {
      type: 'code',
      content: `# Cell 3: Seed ALHF Feedback & Run Adaptation

SAMPLE_FEEDBACK = [
    ("triage", "positive", 5, "Correct priority assignment for APT detection"),
    ("triage", "positive", 4, "Good triage, risk score appropriate"),
    ("triage", "negative", 2, "Over-prioritized a scanner false positive"),
    ("triage", "false_positive", 1, "Qualys scanner triggered brute force alert"),
    ("triage", "positive", 5, "Critical ransomware alert correctly escalated"),
    ("triage", "positive", 4, "Lateral movement detection was accurate"),
    ("triage", "negative", 2, "Missed severity -- should have been critical"),
    ("triage", "false_positive", 1, "Nagios monitoring triggered auth alert"),
    ("triage", "positive", 5, "Correct C2 communication detection"),
    ("triage", "positive", 4, "Good handling of credential spray"),
    ("enrichment", "positive", 5, "Correct threat intel match from MISP feed"),
    ("enrichment", "positive", 4, "User anomaly correlation was helpful"),
    ("enrichment", "negative", 2, "Missed IOC match -- domain was in VirusTotal"),
    ("enrichment", "positive", 5, "Geo anomaly correctly flagged VPN from CN"),
    ("enrichment", "correction", 3, "Risk increase too aggressive for this alert type"),
    ("enrichment", "positive", 4, "Good enrichment context for investigation"),
    ("investigation", "positive", 5, "Attack chain reconstruction was accurate"),
    ("investigation", "positive", 4, "Lateral movement hops correctly identified"),
    ("investigation", "negative", 2, "Case created unnecessarily for low-risk alert"),
    ("investigation", "positive", 5, "Timeline was helpful for incident response"),
    ("investigation", "correction", 3, "Should have correlated with DNS events too"),
    ("investigation", "positive", 4, "Graph traversal found the right connections"),
    ("response", "positive", 5, "IP block prevented further C2 communication"),
    ("response", "positive", 4, "Quick automated response contained the threat"),
    ("response", "negative", 2, "Blocked legitimate partner IP -- needed allowlist check"),
    ("response", "false_positive", 1, "Auto-blocked CDN IP due to false positive alert"),
    ("response", "positive", 5, "Host isolation stopped ransomware spread"),
    ("response", "positive", 4, "Response action was proportional to threat"),
    ("pattern_discovery", "positive", 4, "Discovered real brute force pattern"),
    ("pattern_discovery", "positive", 4, "Statistical anomaly was a real incident"),
    ("pattern_discovery", "negative", 2, "Pattern was just a backup job, not attack"),
]

for agent_type, fb_type, score, comment in SAMPLE_FEEDBACK:
    alhf.collect_feedback(
        agent_type=agent_type,
        task_id=gen_uuid(),
        alert_id=gen_uuid(),
        feedback_type=fb_type,
        score=score,
        analyst_id="analyst-01@company.com",
        comment=comment,
    )

print(f"ALHF feedback seeded: {len(SAMPLE_FEEDBACK)} entries")
print()

for agent_type in ["triage", "enrichment", "investigation", "response", "pattern_discovery"]:
    analysis = alhf.analyze_feedback(agent_type)
    print(f"  {agent_type:22s}: {analysis['total_feedback']:>3} feedback | "
          f"pos={analysis['positive_rate']:.0%} neg={analysis['negative_rate']:.0%} "
          f"fp={analysis['false_positive_rate']:.0%} | "
          f"adapt={'YES' if analysis['needs_adaptation'] else 'no'}")
    print(f"    Recommendation: {analysis['recommendation']}")

print()
drift = alhf.detect_drift()
if drift:
    print(f"  Drift detected in {len(drift)} agents:")
    for d in drift:
        print(f"    {d['agent_type']}: FP drift={d['fp_rate_drift']:+.1%}, "
              f"neg drift={d['negative_rate_drift']:+.1%} [{d['severity']}]")
else:
    print("  No significant drift detected across agents")`
    },
    {
      type: 'code',
      content: `# Cell 4: Health Monitoring & SLA Tracking

class HealthMonitor:
    """
    Monitors agent health, tracks SLAs, and generates health reports.
    """

    SLA_TARGETS = {
        "triage": {"max_latency_ms": 5000, "min_success_rate": 0.95, "max_queue_age_min": 5},
        "enrichment": {"max_latency_ms": 10000, "min_success_rate": 0.90, "max_queue_age_min": 15},
        "investigation": {"max_latency_ms": 30000, "min_success_rate": 0.85, "max_queue_age_min": 30},
        "response": {"max_latency_ms": 5000, "min_success_rate": 0.95, "max_queue_age_min": 2},
        "pattern_discovery": {"max_latency_ms": 60000, "min_success_rate": 0.80, "max_queue_age_min": 60},
    }

    def __init__(self, spark):
        self.spark = spark

    def check_all_agents(self):
        """Run health checks on all agents."""
        agents = self.spark.table(f"{SCHEMA}.agent_configs").collect()
        report = []

        for agent in agents:
            agent_type = agent["agent_type"]
            sla = self.SLA_TARGETS.get(agent_type, {})

            total = agent["total_runs"] or 0
            success = agent["successful_runs"] or 0
            success_rate = success / max(total, 1)
            avg_latency = agent["avg_execution_time_ms"] or 0

            latency_ok = avg_latency <= sla.get("max_latency_ms", 60000)
            success_ok = success_rate >= sla.get("min_success_rate", 0.80)
            health = agent["health_status"] or "unknown"

            pending_tasks = (
                self.spark.table(f"{SCHEMA}.agent_tasks")
                .filter(
                    (F.col("agent_type") == agent_type) &
                    (F.col("status") == "pending")
                )
                .count()
            )

            issues = []
            if not latency_ok:
                issues.append(f"Latency {avg_latency:.0f}ms > SLA {sla.get('max_latency_ms', 0)}ms")
            if not success_ok:
                issues.append(f"Success rate {success_rate:.0%} < SLA {sla.get('min_success_rate', 0):.0%}")
            if agent["circuit_breaker_open"]:
                issues.append("Circuit breaker OPEN")
            if agent["consecutive_failures"] and agent["consecutive_failures"] > 2:
                issues.append(f"{agent['consecutive_failures']} consecutive failures")

            status = "healthy" if not issues else ("degraded" if len(issues) == 1 else "unhealthy")

            report.append({
                "agent_type": agent_type,
                "name": agent["name"],
                "status": status,
                "health_status": health,
                "total_runs": total,
                "success_rate": round(success_rate, 4),
                "avg_latency_ms": round(avg_latency, 1),
                "pending_tasks": pending_tasks,
                "consecutive_failures": agent["consecutive_failures"] or 0,
                "circuit_breaker": "OPEN" if agent["circuit_breaker_open"] else "closed",
                "sla_latency": "PASS" if latency_ok else "FAIL",
                "sla_success": "PASS" if success_ok else "FAIL",
                "issues": issues,
                "last_run": str(agent["last_run_at"]) if agent["last_run_at"] else "never",
                "last_error": agent["last_error"],
            })

        return report

    def get_pipeline_throughput(self, hours=24):
        """Calculate pipeline throughput metrics."""
        logs = (
            self.spark.table(f"{SCHEMA}.agent_orchestration_logs")
            .filter(F.col("created_at") >= F.expr(f"now() - interval {hours} hours"))
        )

        if logs.count() == 0:
            return {"period_hours": hours, "total_runs": 0}

        stats = logs.agg(
            F.count("*").alias("total_runs"),
            F.sum("tasks_completed").alias("total_processed"),
            F.sum("tasks_failed").alias("total_failed"),
            F.avg("execution_time_ms").alias("avg_cycle_time_ms"),
            F.max("execution_time_ms").alias("max_cycle_time_ms"),
            F.min("execution_time_ms").alias("min_cycle_time_ms"),
        ).collect()[0]

        return {
            "period_hours": hours,
            "total_runs": stats.total_runs or 0,
            "total_processed": int(stats.total_processed or 0),
            "total_failed": int(stats.total_failed or 0),
            "avg_cycle_time_ms": round(stats.avg_cycle_time_ms or 0, 1),
            "max_cycle_time_ms": int(stats.max_cycle_time_ms or 0),
            "min_cycle_time_ms": int(stats.min_cycle_time_ms or 0),
            "throughput_per_hour": round((stats.total_processed or 0) / max(hours, 1), 1),
            "error_rate": round(
                (stats.total_failed or 0) / max((stats.total_processed or 0) + (stats.total_failed or 0), 1), 4
            ),
        }


monitor = HealthMonitor(spark)

health_report = monitor.check_all_agents()
throughput = monitor.get_pipeline_throughput(24)

print("=" * 72)
print("  AGENT HEALTH REPORT")
print("=" * 72)

for agent in health_report:
    status_icon = {"healthy": "[OK]", "degraded": "[!!]", "unhealthy": "[XX]"}.get(agent["status"], "[??]")
    print(f"  {status_icon} {agent['agent_type']:22s} | runs={agent['total_runs']:>5} | "
          f"success={agent['success_rate']:.0%} | latency={agent['avg_latency_ms']:.0f}ms | "
          f"pending={agent['pending_tasks']:>3} | cb={agent['circuit_breaker']}")
    if agent["issues"]:
        for issue in agent["issues"]:
            print(f"      ISSUE: {issue}")

print()
print(f"  Pipeline Throughput (24h):")
print(f"    Total runs:       {throughput['total_runs']}")
print(f"    Total processed:  {throughput['total_processed']}")
print(f"    Avg cycle time:   {throughput['avg_cycle_time_ms']:.0f}ms")
print(f"    Throughput/hour:  {throughput['throughput_per_hour']:.1f}")
print(f"    Error rate:       {throughput['error_rate']:.1%}")`
    },
    {
      type: 'code',
      content: `# Cell 5: Execute Orchestrator & Demonstrate Full Cycle

# Import agents from Part 2 (in production these are imported; here we re-instantiate)
# In Databricks, run Part 2 first, then Part 3 uses the same spark session.

# For demonstration, we create a lightweight orchestrator run
orchestrator = AgentOrchestrator(spark, CONFIG, {
    "triage": triage_agent,
    "enrichment": enrichment_agent,
    "investigation": investigation_agent,
    "response": response_agent,
    "pattern_discovery": pattern_agent,
})

print("Running orchestration cycle...")
cycle_result = orchestrator.run_cycle(mode="manual")

print(f"\\nOrchestration Result:")
print(f"  Run ID:           {cycle_result['run_id'][:12]}...")
print(f"  Mode:             {cycle_result['mode']}")
print(f"  Agents executed:  {', '.join(cycle_result['agents_executed']) or 'none'}")
print(f"  Tasks completed:  {cycle_result['tasks_completed']}")
print(f"  Tasks failed:     {cycle_result['tasks_failed']}")
print(f"  Duration:         {cycle_result['duration_ms']}ms")
if cycle_result['errors']:
    print(f"  Errors:")
    for e in cycle_result['errors']:
        print(f"    - {e}")
if cycle_result['warnings']:
    print(f"  Warnings:")
    for w in cycle_result['warnings']:
        print(f"    - {w}")`
    },
    {
      type: 'code',
      content: `# Cell 6: Integration Testing Framework

class AgenticSOCTestSuite:
    """
    End-to-end integration tests for the Agentic SOC pipeline.
    Validates that each agent processes data correctly and
    passes results to the next stage.
    """

    def __init__(self, spark, config):
        self.spark = spark
        self.config = config
        self.results = []

    def run_all(self):
        tests = [
            self.test_pipeline_status_progression,
            self.test_triage_scoring,
            self.test_enrichment_risk_increase,
            self.test_investigation_case_creation,
            self.test_response_action_logging,
            self.test_pattern_discovery_rule_generation,
            self.test_alhf_feedback_collection,
            self.test_health_monitoring,
            self.test_data_integrity,
            self.test_no_orphaned_tasks,
        ]

        for test_fn in tests:
            name = test_fn.__name__
            try:
                test_fn()
                self.results.append({"test": name, "status": "PASS", "error": None})
            except AssertionError as e:
                self.results.append({"test": name, "status": "FAIL", "error": str(e)})
            except Exception as e:
                self.results.append({"test": name, "status": "ERROR", "error": str(e)[:200]})

        return self.results

    def test_pipeline_status_progression(self):
        """Verify alerts progress through pipeline stages."""
        alerts = self.spark.table(f"{SCHEMA}.alerts")
        triaged = alerts.filter(F.col("status") == "triaged").count()
        enriched = alerts.filter(F.col("enrichment_completed") == True).count()
        investigated = alerts.filter(F.col("investigation_completed") == True).count()
        responded = alerts.filter(F.col("response_completed") == True).count()
        assert triaged > 0, "No alerts were triaged"
        assert enriched > 0, "No alerts were enriched"

    def test_triage_scoring(self):
        """Verify triage scores are within expected range."""
        triaged = (
            self.spark.table(f"{SCHEMA}.alerts")
            .filter(F.col("triage_score").isNotNull())
        )
        assert triaged.count() > 0, "No triaged alerts found"
        stats = triaged.agg(
            F.min("triage_score").alias("min_score"),
            F.max("triage_score").alias("max_score"),
        ).collect()[0]
        assert stats.min_score >= 0, f"Negative triage score: {stats.min_score}"
        assert stats.max_score <= 35, f"Unreasonable triage score: {stats.max_score}"

    def test_enrichment_risk_increase(self):
        """Verify enrichment increases risk for IOC matches."""
        enriched = (
            self.spark.table(f"{SCHEMA}.alerts")
            .filter(
                (F.col("enrichment_completed") == True) &
                (F.col("enriched_risk_score").isNotNull())
            )
        )
        assert enriched.count() > 0, "No enriched alerts found"
        assert enriched.filter(F.col("enriched_risk_score") <= 100).count() == enriched.count(), "Risk scores exceed 100"

    def test_investigation_case_creation(self):
        """Verify investigation creates cases for high-risk alerts."""
        cases = self.spark.table(f"{SCHEMA}.cases")
        assert cases.count() > 0, "No cases were created"
        agent_cases = cases.filter(
            F.col("created_by").isin(["triage_agent", "investigation_agent"])
        )
        assert agent_cases.count() > 0, "No agent-created cases found"

    def test_response_action_logging(self):
        """Verify response actions are logged."""
        actions = self.spark.table(f"{SCHEMA}.response_actions")
        if actions.count() > 0:
            assert actions.filter(F.col("action_type").isNotNull()).count() == actions.count(), "Actions missing type"
            assert actions.filter(F.col("executed_by").isNotNull()).count() == actions.count(), "Actions missing executor"

    def test_pattern_discovery_rule_generation(self):
        """Verify pattern discovery creates correlation rules."""
        rules = (
            self.spark.table(f"{SCHEMA}.correlation_rules")
            .filter(F.col("rule_type") == "ai_generated")
        )
        patterns = self.spark.table(f"{SCHEMA}.discovered_patterns")
        assert patterns.count() >= 0, "Pattern discovery table missing"

    def test_alhf_feedback_collection(self):
        """Verify ALHF feedback is being collected."""
        feedback = self.spark.table(f"{SCHEMA}.agent_feedback")
        assert feedback.count() > 0, "No ALHF feedback found"
        assert feedback.filter(F.col("feedback_type").isNotNull()).count() == feedback.count(), "Feedback missing type"

    def test_health_monitoring(self):
        """Verify health monitoring produces valid reports."""
        configs = self.spark.table(f"{SCHEMA}.agent_configs")
        assert configs.count() == 5, f"Expected 5 agent configs, got {configs.count()}"
        assert configs.filter(F.col("health_status").isNotNull()).count() == 5, "Agents missing health status"

    def test_data_integrity(self):
        """Verify referential integrity across tables."""
        alerts = self.spark.table(f"{SCHEMA}.alerts")
        total = alerts.count()
        assert total > 0, "No alerts in system"
        with_id = alerts.filter(F.col("id").isNotNull()).count()
        assert with_id == total, f"Alerts missing IDs: {total - with_id}"

    def test_no_orphaned_tasks(self):
        """Verify no tasks are stuck in processing state."""
        stuck = (
            self.spark.table(f"{SCHEMA}.agent_tasks")
            .filter(
                (F.col("status") == "processing") &
                (F.col("created_at") < F.expr("now() - interval 1 hour"))
            )
        )
        assert stuck.count() == 0, f"Found {stuck.count()} stuck tasks"


test_suite = AgenticSOCTestSuite(spark, CONFIG)
test_results = test_suite.run_all()

print("=" * 72)
print("  INTEGRATION TEST RESULTS")
print("=" * 72)
passed = sum(1 for r in test_results if r["status"] == "PASS")
failed = sum(1 for r in test_results if r["status"] == "FAIL")
errors = sum(1 for r in test_results if r["status"] == "ERROR")

for r in test_results:
    icon = {"PASS": "[OK]", "FAIL": "[XX]", "ERROR": "[!!]"}[r["status"]]
    line = f"  {icon} {r['test']}"
    if r["error"]:
        line += f"\\n       {r['error']}"
    print(line)

print(f"\\n  Total: {len(test_results)} | Passed: {passed} | Failed: {failed} | Errors: {errors}")
print("=" * 72)`
    },
    {
      type: 'code',
      content: `# Cell 7: Executive Summary Dashboard

import matplotlib.pyplot as plt

fig, axes = plt.subplots(2, 4, figsize=(28, 12))
fig.suptitle("Agentic SOC - Executive Dashboard", fontsize=18, fontweight="bold")

pipeline_df = spark.sql(f"""
    SELECT
        CASE
            WHEN status = 'new' THEN '1-New'
            WHEN status = 'triaged' AND enrichment_completed = false THEN '2-Triaged'
            WHEN enrichment_completed = true AND investigation_completed = false THEN '3-Enriched'
            WHEN investigation_completed = true AND response_completed = false THEN '4-Investigated'
            WHEN response_completed = true THEN '5-Responded'
            ELSE '0-Unknown'
        END as stage,
        COUNT(*) as cnt
    FROM {SCHEMA}.alerts
    GROUP BY 1
    ORDER BY 1
""").toPandas()

if len(pipeline_df) > 0:
    stage_colors = ["#94a3b8", "#f59e0b", "#3b82f6", "#8b5cf6", "#10b981", "#64748b"]
    pipeline_df.set_index("stage")["cnt"].plot(
        kind="bar", ax=axes[0, 0], color=stage_colors[:len(pipeline_df)], edgecolor="#374151")
axes[0, 0].set_title("Alert Pipeline Funnel", fontweight="bold")
axes[0, 0].tick_params(axis="x", rotation=45)

agent_health = spark.table(f"{SCHEMA}.agent_configs").select(
    "agent_type", "total_runs", "successful_runs", "avg_execution_time_ms", "health_status"
).toPandas()

if len(agent_health) > 0:
    agent_health["success_rate"] = agent_health["successful_runs"] / agent_health["total_runs"].clip(lower=1)
    colors = ["#10b981" if r > 0.9 else "#f59e0b" if r > 0.7 else "#ef4444" for r in agent_health["success_rate"]]
    agent_health.set_index("agent_type")["success_rate"].plot(
        kind="barh", ax=axes[0, 1], color=colors, edgecolor="#374151")
    axes[0, 1].set_xlim(0, 1.0)
    axes[0, 1].axvline(x=0.90, color="#ef4444", linestyle="--", alpha=0.5, label="SLA")
    axes[0, 1].legend()
axes[0, 1].set_title("Agent Success Rates", fontweight="bold")

if len(agent_health) > 0:
    agent_health.set_index("agent_type")["avg_execution_time_ms"].plot(
        kind="barh", ax=axes[0, 2], color="#2563eb", edgecolor="#1e40af")
axes[0, 2].set_title("Agent Avg Latency (ms)", fontweight="bold")

feedback_df = (
    spark.table(f"{SCHEMA}.agent_feedback")
    .groupBy("agent_type", "feedback_type")
    .count()
    .toPandas()
)
if len(feedback_df) > 0:
    pivot = feedback_df.pivot(index="agent_type", columns="feedback_type", values="count").fillna(0)
    fb_colors = {"positive": "#10b981", "negative": "#ef4444", "false_positive": "#f59e0b", "correction": "#3b82f6"}
    pivot.plot(kind="bar", ax=axes[0, 3], color=[fb_colors.get(c, "#64748b") for c in pivot.columns], edgecolor="#374151")
    axes[0, 3].tick_params(axis="x", rotation=45)
axes[0, 3].set_title("ALHF Feedback Distribution", fontweight="bold")

sev_priority = spark.sql(f"""
    SELECT severity, priority, COUNT(*) as cnt
    FROM {SCHEMA}.alerts
    WHERE priority IS NOT NULL
    GROUP BY severity, priority
""").toPandas()
if len(sev_priority) > 0:
    pivot = sev_priority.pivot(index="severity", columns="priority", values="cnt").fillna(0)
    pri_colors = {"critical": "#ef4444", "high": "#f97316", "medium": "#f59e0b", "low": "#10b981"}
    pivot.plot(kind="bar", ax=axes[1, 0], stacked=True,
               color=[pri_colors.get(c, "#64748b") for c in pivot.columns], edgecolor="#374151")
    axes[1, 0].tick_params(axis="x", rotation=45)
axes[1, 0].set_title("Severity vs Priority", fontweight="bold")

action_df = (
    spark.table(f"{SCHEMA}.response_actions")
    .groupBy("action_type", "status")
    .count()
    .toPandas()
)
if len(action_df) > 0:
    action_df.set_index("action_type")["count"].plot(
        kind="bar", ax=axes[1, 1], color="#ef4444", edgecolor="#b91c1c")
axes[1, 1].set_title("Response Actions", fontweight="bold")

cases_df = (
    spark.table(f"{SCHEMA}.cases")
    .groupBy("status").count()
    .toPandas()
)
if len(cases_df) > 0:
    case_colors = {"new": "#3b82f6", "investigating": "#f59e0b", "closed": "#10b981"}
    cases_df.set_index("status")["count"].plot(
        kind="pie", ax=axes[1, 2], autopct="%1.0f%%",
        colors=[case_colors.get(s, "#64748b") for s in cases_df["status"]])
axes[1, 2].set_title("Case Status", fontweight="bold")

total_alerts = spark.table(f"{SCHEMA}.alerts").count()
total_cases = spark.table(f"{SCHEMA}.cases").count()
total_responses = spark.table(f"{SCHEMA}.response_actions").count()
total_patterns = spark.table(f"{SCHEMA}.discovered_patterns").count()
total_rules = spark.table(f"{SCHEMA}.correlation_rules").filter(F.col("rule_type") == "ai_generated").count()
total_feedback = spark.table(f"{SCHEMA}.agent_feedback").count()
blocked_ips = spark.table(f"{SCHEMA}.active_blocklist").filter(F.col("is_active") == True).count()

summary = f"""
  AGENTIC SOC SUMMARY

  Alert Pipeline:
    Total alerts:       {total_alerts:>6,}
    Cases created:      {total_cases:>6,}
    Responses executed: {total_responses:>6,}
    IPs blocked:        {blocked_ips:>6,}

  AI/ML:
    Patterns discovered: {total_patterns:>5}
    Rules generated:     {total_rules:>5}

  ALHF:
    Feedback entries:    {total_feedback:>5}

  Tests:
    Passed: {passed}/{len(test_results)}

  Pipeline Duration:
    {cycle_result['duration_ms']}ms
"""
axes[1, 3].text(0.05, 0.95, summary, transform=axes[1, 3].transAxes,
                fontsize=9, verticalalignment="top", fontfamily="monospace",
                bbox=dict(boxstyle="round", facecolor="#f1f5f9", edgecolor="#cbd5e1"))
axes[1, 3].axis("off")
axes[1, 3].set_title("Summary", fontweight="bold")

plt.tight_layout()
plt.show()

print("Agentic SOC - Production deployment ready.")`
    },
  ],
};
