# Databricks notebook source
# MAGIC %md
# MAGIC # Agent 30: Stateful Backdoor Detection Agent
# MAGIC
# MAGIC **Production-Grade BatchAgent Implementation**
# MAGIC
# MAGIC Maintains state machines for known backdoor communication patterns and detects
# MAGIC slow-and-low C2 beaconing across long time windows. Uses statistical timing
# MAGIC analysis including jitter detection and periodicity analysis.
# MAGIC
# MAGIC ## Key Features
# MAGIC - Stateful pattern matching for C2 beaconing
# MAGIC - Long-term timing analysis (hours/days windows)
# MAGIC - Jitter and periodicity detection
# MAGIC - MLflow experiment tracking and metrics logging
# MAGIC - UC Function tool registration
# MAGIC - Writes to backdoor_detections table

# COMMAND ----------

# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

# MAGIC %md
# MAGIC ## Initialization and Configuration

# COMMAND ----------

from agent_framework import (
    BatchAgent, AgentResult, AgentStatus, UCTool, create_soc_tools
)
import mlflow
import mlflow.tracing
from pyspark.sql.functions import *
from pyspark.sql.types import *
import json
import time
import logging
import numpy as np
from datetime import datetime, timedelta
from collections import defaultdict

logger = logging.getLogger("oxdsi.backdoor_defense_agent")

# Parse notebook parameters
dbutils.widgets.text("lookback_days", "7", "Days to analyze for C2 patterns")
dbutils.widgets.text("min_beacon_count", "10", "Minimum beacons to flag")
dbutils.widgets.text("jitter_threshold", "0.3", "Max jitter coefficient for beaconing")

lookback_days = int(dbutils.widgets.get("lookback_days"))
min_beacon_count = int(dbutils.widgets.get("min_beacon_count"))
jitter_threshold = float(dbutils.widgets.get("jitter_threshold"))

mon.log_event("backdoor_defense_config_loaded", {
    "lookback_days": lookback_days,
    "min_beacon_count": min_beacon_count,
    "jitter_threshold": jitter_threshold,
})

# COMMAND ----------

# MAGIC %md
# MAGIC ## Define BackdoorDetectionAgent Class

# COMMAND ----------

class BackdoorDetectionAgent(BatchAgent):
    """
    Detect slow-and-low C2 beaconing using stateful pattern analysis.

    Approach:
    1. Load communication flows over extended time windows
    2. Analyze inter-arrival times for periodicity
    3. Compute jitter and detect state machine patterns
    4. Flag suspicious timing patterns as potential C2
    """

    def __init__(self, agent_name: str, cfg, llm, mon, spark):
        super().__init__(agent_name, cfg, llm, mon, spark)
        self._detections = []
        self._state_machines = {}

        # Register UC tools
        soc_tools = create_soc_tools(cfg)
        for tool in soc_tools:
            if tool.name in ["search_events", "get_alert_context"]:
                self.register_tool(tool)

    def execute(self) -> AgentResult:
        """Main execution: fetch flows → analyze timing → detect patterns → persist."""
        start_time = time.time()

        try:
            # Ensure output table exists
            self._ensure_output_table()

            # Fetch communication flows over extended period
            flows = self._fetch_communication_flows()
            flow_count = flows.count()

            if flow_count == 0:
                return AgentResult(
                    status=AgentStatus.IDLE,
                    agent_name=self.agent_name,
                    processed_count=0,
                    duration_seconds=time.time() - start_time,
                )

            # Analyze each communication pair for beaconing
            detections = self._analyze_beaconing_patterns(flows)
            self._detections = detections

            # Persist detections
            if len(self._detections) > 0:
                self._write_detections()

            return AgentResult(
                status=AgentStatus.COMPLETED,
                agent_name=self.agent_name,
                processed_count=flow_count,
                error_count=0,
                duration_seconds=time.time() - start_time,
                details={
                    "flows_analyzed": flow_count,
                    "backdoor_detections": len(self._detections),
                    "high_confidence": len([d for d in self._detections if d.get("confidence", 0) >= 0.8]),
                    "lookback_days": lookback_days,
                }
            )

        except Exception as e:
            duration = time.time() - start_time
            logger.exception(f"BackdoorDetectionAgent failed: {e}")
            mon.log_event(f"{self.agent_name}_failed", {"error": str(e)[:500]})
            return AgentResult(
                status=AgentStatus.FAILED,
                agent_name=self.agent_name,
                duration_seconds=duration,
                error=str(e)[:500],
            )

    def _ensure_output_table(self):
        """Create backdoor_detections table if it doesn't exist."""
        table_name = get_table_path(cfg, "backdoor_detections")
        ensure_table_exists(
            spark, table_name,
            schema=StructType([
                StructField("pattern_id", StringType()),
                StructField("communication_pairs", ArrayType(StringType())),
                StructField("beacon_interval", DoubleType()),
                StructField("jitter_score", DoubleType()),
                StructField("confidence", DoubleType()),
                StructField("state_machine_stage", StringType()),
                StructField("timing_analysis", StringType()),
                StructField("timestamp", TimestampType()),
            ])
        )

    def _fetch_communication_flows(self):
        """Fetch communication flows from the extended lookback window."""
        table_name = get_table_path(cfg, "network_flows")
        cutoff_time = f"current_timestamp() - interval {lookback_days} days"

        query = f"""
            SELECT
                source_ip, dest_ip, dest_port, protocol,
                timestamp, bytes_sent, packet_count
            FROM {table_name}
            WHERE timestamp > {cutoff_time}
            ORDER BY source_ip, dest_ip, timestamp
        """

        return spark.sql(query)

    def _analyze_beaconing_patterns(self, flows_df):
        """Analyze communication flows for C2 beaconing patterns."""
        detections = []

        # Group flows by communication pair
        flows_data = flows_df.collect()
        flow_pairs = defaultdict(list)

        for flow in flows_data:
            key = (flow.source_ip, flow.dest_ip, flow.dest_port)
            flow_pairs[key].append(flow)

        # Analyze each communication pair
        for (src_ip, dst_ip, dst_port), flows in flow_pairs.items():
            if len(flows) < min_beacon_count:
                continue

            # Analyze timing patterns
            detection = self._detect_beaconing(src_ip, dst_ip, dst_port, flows)
            if detection:
                detections.append(detection)

        return detections

    def _detect_beaconing(self, src_ip, dst_ip, dst_port, flows):
        """Detect C2 beaconing from a sequence of flows."""
        if len(flows) < min_beacon_count:
            return None

        # Sort flows by timestamp
        sorted_flows = sorted(flows, key=lambda f: f.timestamp)
        timestamps = [f.timestamp for f in sorted_flows]

        # Compute inter-arrival times (seconds)
        inter_arrivals = []
        for i in range(1, len(timestamps)):
            delta = (timestamps[i] - timestamps[i-1]).total_seconds()
            if delta > 0:
                inter_arrivals.append(delta)

        if len(inter_arrivals) < 3:
            return None

        # Analyze periodicity
        inter_arrivals_arr = np.array(inter_arrivals)
        mean_interval = np.mean(inter_arrivals_arr)
        std_interval = np.std(inter_arrivals_arr)

        # Compute jitter coefficient
        jitter_coeff = std_interval / mean_interval if mean_interval > 0 else 1.0

        # Detect state machine stages
        state_stage = self._detect_state_stage(inter_arrivals_arr, jitter_coeff)

        # Compute confidence score
        confidence = self._compute_confidence(
            len(flows),
            jitter_coeff,
            mean_interval,
            state_stage
        )

        # Flag if suspicious
        if confidence >= 0.7 and jitter_coeff <= jitter_threshold:
            return {
                "pattern_id": f"bd_{int(time.time())}_{hash((src_ip, dst_ip)) % 10000}",
                "communication_pairs": [f"{src_ip}:{dst_port}->{dst_ip}"],
                "beacon_interval": round(mean_interval, 2),
                "jitter_score": round(jitter_coeff, 3),
                "confidence": confidence,
                "state_machine_stage": state_stage,
                "timing_analysis": json.dumps({
                    "beacon_count": len(flows),
                    "mean_interval": round(mean_interval, 2),
                    "std_interval": round(std_interval, 2),
                    "min_interval": round(np.min(inter_arrivals_arr), 2),
                    "max_interval": round(np.max(inter_arrivals_arr), 2),
                }),
            }

        return None

    def _detect_state_stage(self, inter_arrivals, jitter_coeff):
        """Detect which stage of a state machine the beaconing is in."""
        # Stages: reconnaissance, callback, exfil, command
        if len(inter_arrivals) < 3:
            return "unknown"

        # High regularity + low jitter = established callback
        if jitter_coeff < 0.15:
            return "established_callback"

        # Medium regularity = discovery phase
        if jitter_coeff < 0.3:
            return "discovery_phase"

        # Increasing intervals = slowing down
        if inter_arrivals[-1] > inter_arrivals[0] * 1.5:
            return "backoff_pattern"

        return "active_beaconing"

    def _compute_confidence(self, beacon_count, jitter_coeff, mean_interval, state_stage):
        """Compute confidence score for C2 detection."""
        score = 0.0

        # Factor 1: Number of beacons (more = higher confidence)
        if beacon_count >= 100:
            score += 0.4
        elif beacon_count >= 50:
            score += 0.3
        elif beacon_count >= 20:
            score += 0.2
        elif beacon_count >= min_beacon_count:
            score += 0.1

        # Factor 2: Jitter coefficient (lower = more suspicious)
        if jitter_coeff < 0.1:
            score += 0.35
        elif jitter_coeff < 0.2:
            score += 0.25
        elif jitter_coeff < 0.3:
            score += 0.15
        elif jitter_coeff <= jitter_threshold:
            score += 0.05

        # Factor 3: Interval range (suspicious if 1-5 minutes)
        if 60 <= mean_interval <= 300:
            score += 0.2

        # Factor 4: State stage (established callback = highest suspicion)
        if state_stage == "established_callback":
            score += 0.15
        elif state_stage == "discovery_phase":
            score += 0.1

        return min(1.0, score)

    def _write_detections(self):
        """Write backdoor detections to the output table."""
        table_name = get_table_path(cfg, "backdoor_detections")

        detection_rows = []
        for detection in self._detections:
            detection_rows.append({
                "pattern_id": detection["pattern_id"],
                "communication_pairs": detection["communication_pairs"],
                "beacon_interval": detection["beacon_interval"],
                "jitter_score": detection["jitter_score"],
                "confidence": detection["confidence"],
                "state_machine_stage": detection["state_machine_stage"],
                "timing_analysis": detection["timing_analysis"],
                "timestamp": datetime.utcnow(),
            })

        if detection_rows:
            df = spark.createDataFrame(detection_rows, schema=StructType([
                StructField("pattern_id", StringType()),
                StructField("communication_pairs", ArrayType(StringType())),
                StructField("beacon_interval", DoubleType()),
                StructField("jitter_score", DoubleType()),
                StructField("confidence", DoubleType()),
                StructField("state_machine_stage", StringType()),
                StructField("timing_analysis", StringType()),
                StructField("timestamp", TimestampType()),
            ]))
            safe_append(df, table_name)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Execution

# COMMAND ----------

# Initialize agent
agent = BackdoorDetectionAgent("stateful_backdoor_defense", cfg, llm, mon, spark)

# Execute
result = agent.run()

# Log result
mon.log_event("backdoor_defense_execution_complete", {
    "status": result.status.value,
    "processed": result.processed_count,
    "errors": result.error_count,
    "duration": result.duration_seconds,
    "detections": result.details.get("backdoor_detections", 0),
})

# Display result
print(result.to_json())
mlflow.log_dict(json.loads(result.to_json()), "execution_result")

# Exit with status
dbutils.notebook.exit(result.to_json())
