# Databricks notebook source
# MAGIC %md
# MAGIC # Agent 35: Glasswing Reachability Correlator
# MAGIC
# MAGIC **Purpose**: The killer feature of the Glasswing pipeline. Correlates Mythos
# MAGIC bytecode findings against the live event stream to prove which vulnerabilities
# MAGIC are actually reachable by attackers in production. Eliminates false positives
# MAGIC by requiring evidence of real traffic hitting vulnerable code paths.
# MAGIC
# MAGIC **Architecture**:
# MAGIC ```
# MAGIC  glasswing_root_causes (status='open')
# MAGIC         |
# MAGIC   [Extract Entry Points from file_path]
# MAGIC         |
# MAGIC   [Map to API Routes via service_map]
# MAGIC         |
# MAGIC   [Query Live Events Table]        [Query IOC Entries]
# MAGIC         |                                 |
# MAGIC   [Calculate Reachability Score]----------+
# MAGIC         |
# MAGIC   glasswing_reachability + alerts (if reachable)
# MAGIC ```
# MAGIC
# MAGIC **Schedule**: Runs continuously (every 15 minutes) or after Agent 34

# COMMAND ----------

# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

from pyspark.sql.functions import *
from pyspark.sql.types import *
from datetime import datetime, timedelta
import json
import uuid
import re
import math

# COMMAND ----------

# Configuration
dbutils.widgets.text("lookback_hours", "24", "Hours of event history to analyze")
dbutils.widgets.text("min_traffic_threshold", "10", "Minimum requests to consider reachable")

lookback_hours = int(dbutils.widgets.get("lookback_hours"))
min_traffic_threshold = int(dbutils.widgets.get("min_traffic_threshold"))

now = datetime.utcnow()
lookback_start = now - timedelta(hours=lookback_hours)
run_id = str(uuid.uuid4())

print(f"Reachability run {run_id} | lookback={lookback_hours}h | min_traffic={min_traffic_threshold}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Helper Functions

# COMMAND ----------

def severity_rank(level: str) -> int:
    """Helper to rank severity levels numerically."""
    ranks = {"critical": 4, "high": 3, "medium": 2, "low": 1}
    return ranks.get(level, 0)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Load Open Root Causes and Their Findings

# COMMAND ----------

try:
    root_causes_query = (
        qb("glasswing_root_causes")
        .select(["*"])
        .where_eq("status", "open")
        .describe("Load open root causes for reachability analysis")
        .build()
    )
    root_causes_df = spark.sql(root_causes_query.sql)
    root_cause_count = root_causes_df.count()

    if root_cause_count == 0:
        print("No open root causes to analyze. Exiting.")
        result = {"status": "no_data", "root_causes_analyzed": 0, "reachable_count": 0}
        mon.log_complete(rows_processed=0)
        dbutils.notebook.exit(json.dumps(result))

    root_causes = root_causes_df.collect()
    print(f"Loaded {root_cause_count} open root causes for reachability analysis")

    # Load associated findings
    findings_query = (
        qb("glasswing_findings")
        .select(["id", "finding_id", "file_path", "codebase", "vuln_class",
                 "poc_code", "root_cause_group_id", "exploit_chain_id"])
        .where_eq("status", "clustered")
        .describe("Load clustered findings for route extraction")
        .build()
    )
    findings_df = spark.sql(findings_query.sql)
    findings_list = findings_df.collect()
    print(f"Loaded {len(findings_list)} clustered findings")

except Exception as e:
    mon.log_error(e, "Failed to load root causes or findings")
    raise

# COMMAND ----------

# MAGIC %md
# MAGIC ## Service Map: File Paths to API Routes
# MAGIC
# MAGIC Maps source code file paths to externally-reachable API endpoints using
# MAGIC a combination of the service_map table and heuristic pattern matching.

# COMMAND ----------

def load_service_map():
    """Load service map from table or generate heuristic mapping."""
    try:
        svc_query = (
            qb("service_map")
            .select(["*"])
            .describe("Load service map for route resolution")
            .build()
        )
        svc_df = spark.sql(svc_query.sql)
        if svc_df.count() > 0:
            return {row["file_pattern"]: row for row in svc_df.collect()}
    except Exception:
        pass

    # Heuristic route extraction patterns
    return None


def extract_routes_from_path(file_path: str, codebase: str) -> list:
    """
    Heuristic extraction of API routes from source file paths.
    Maps common web framework conventions to endpoint patterns.
    """
    routes = []

    # Go handler patterns: src/api/handlers/X.go -> /api/vN/X
    go_match = re.search(r'(?:api|handlers?|routes?)/(\w+)\.go$', file_path)
    if go_match:
        handler = go_match.group(1)
        routes.append(f"/api/v1/{handler}")
        routes.append(f"/api/v2/{handler}")

    # Python handler patterns: lib/core/X.py -> /api/X
    py_match = re.search(r'(?:api|handlers?|views?|routes?)/(\w+)\.py$', file_path)
    if py_match:
        handler = py_match.group(1)
        routes.append(f"/api/{handler}")
        routes.append(f"/api/v2/{handler}")

    # Java/Kotlin patterns: src/main/.../XController.java
    java_match = re.search(r'(\w+)(?:Controller|Handler|Resource)\.(?:java|kt)$', file_path)
    if java_match:
        resource = java_match.group(1).lower()
        routes.append(f"/api/{resource}")
        routes.append(f"/api/v1/{resource}")

    # Rust/Go package patterns: pkg/X/Y.go or src/X/Y.rs
    pkg_match = re.search(r'(?:pkg|src)/(\w+)/(\w+)\.(?:go|rs)$', file_path)
    if pkg_match:
        pkg = pkg_match.group(1)
        module = pkg_match.group(2)
        routes.append(f"/api/v1/{pkg}/{module}")
        routes.append(f"/{pkg}/{module}")

    # Middleware/auth patterns
    if any(kw in file_path.lower() for kw in ["auth", "session", "rbac", "middleware"]):
        routes.append("/api/*")
        routes.append("/auth/*")
        routes.append("/login")

    # Storage/file patterns
    if any(kw in file_path.lower() for kw in ["storage", "file", "artifact", "upload"]):
        routes.append("/api/v1/artifacts")
        routes.append("/api/v1/files")
        routes.append("/upload")

    # Integration/webhook patterns
    if any(kw in file_path.lower() for kw in ["webhook", "integration", "connector"]):
        routes.append("/api/webhooks")
        routes.append("/api/integrations")

    # If nothing matched, try generic extraction
    if not routes:
        parts = file_path.replace("\\", "/").split("/")
        meaningful = [p for p in parts if p and not p.startswith(".") and "." not in p][-2:]
        if meaningful:
            routes.append(f"/{'/'.join(meaningful)}")

    return routes


# Build route mapping for all findings
service_map = load_service_map()
finding_routes = {}

for finding in findings_list:
    file_path = finding["file_path"]
    codebase = finding["codebase"]
    routes = extract_routes_from_path(file_path, codebase)
    finding_routes[finding["id"]] = {
        "routes": routes,
        "file_path": file_path,
        "codebase": codebase,
        "vuln_class": finding["vuln_class"],
        "root_cause_group_id": finding["root_cause_group_id"],
    }

total_routes = sum(len(r["routes"]) for r in finding_routes.values())
print(f"Extracted {total_routes} potential API routes from {len(finding_routes)} findings")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Query Live Event Stream
# MAGIC
# MAGIC Uses a DataFrame join approach instead of building SQL from untrusted route patterns.

# COMMAND ----------

with mon.time("event_stream_query"):
    # Collect all unique route patterns for matching
    all_route_patterns = set()
    for info in finding_routes.values():
        for route in info["routes"]:
            # Convert wildcards to SQL LIKE patterns
            pattern = route.replace("*", "%")
            all_route_patterns.add(pattern)

    # Build a route patterns DataFrame for safe join-based matching
    route_pattern_rows = [{"route_pattern": p} for p in all_route_patterns]
    route_patterns_df = spark.createDataFrame(route_pattern_rows)
    route_patterns_df.createOrReplaceTempView("_route_patterns")

    try:
        # Use a safe cross-join with LIKE matching via temp view
        # This avoids building raw SQL from route patterns
        events_table = cfg.get_table_path("events")
        lookback_iso = lookback_start.isoformat()

        events_query = f"""
            SELECT
                e.request_path,
                e.source_ip,
                COUNT(*) as request_count,
                COUNT(DISTINCT e.source_ip) as unique_sources,
                SUM(CASE WHEN e.is_external = true THEN 1 ELSE 0 END) as external_requests,
                COLLECT_SET(e.source_ip) as source_ips,
                MAX(e.event_time) as last_seen
            FROM {events_table} e
            INNER JOIN _route_patterns rp
                ON e.request_path LIKE rp.route_pattern
            WHERE e.event_time >= '{lookback_iso}'
            GROUP BY e.request_path, e.source_ip
        """
        events_df = spark.sql(events_query)
        traffic_data = events_df.collect()
        print(f"Found {len(traffic_data)} traffic records hitting vulnerable endpoints")
    except Exception as e:
        mon.log_warning(f"Events table query failed: {e}")
        mon.log_event("reachability_no_traffic_data", {"error": str(e)[:200]})
        traffic_data = []
        # Without traffic data, reachability scores will be based solely on
        # attack surface factors (vuln class). This is expected during initial
        # deployment before traffic instrumentation is in place.

# COMMAND ----------

# MAGIC %md
# MAGIC ## Cross-Reference with IOC Entries

# COMMAND ----------

try:
    ioc_query = (
        qb("ioc_entries")
        .select(["indicator", "indicator_type", "threat_level", "source"])
        .where_eq("indicator_type", "ip")
        .where_eq("is_active", True)
        .describe("Load active IOC IP indicators for cross-reference")
        .build()
    )
    ioc_df = spark.sql(ioc_query.sql)
    known_bad_ips = {row["indicator"]: row for row in ioc_df.collect()}
    print(f"Loaded {len(known_bad_ips)} active IOC IP indicators")
except Exception as e:
    mon.log_warning(f"IOC table not available: {e}")
    mon.log_event("reachability_no_ioc_data", {"error": str(e)[:200]})
    known_bad_ips = {}
    # Without IOC data, reachability will not factor in threat actor correlation.
    # The ioc_factor component of the score will be 0 for all findings.

# COMMAND ----------

# MAGIC %md
# MAGIC ## Calculate Reachability Scores

# COMMAND ----------

def calculate_reachability_score(
    traffic_volume: int,
    external_source_count: int,
    has_ioc_traffic: bool,
    ioc_threat_level: str,
    attacker_params_detected: bool,
    vuln_class: str
) -> float:
    """
    Calculate reachability score based on multiple signals.

    Components:
    - Traffic volume factor (0-0.3): normalized log of request count
    - External exposure factor (0-0.25): ratio of external unique sources
    - IOC correlation factor (0-0.3): known bad actors hitting the endpoint
    - Attack surface factor (0-0.15): vuln class susceptibility to remote exploit
    """
    # Traffic volume: log-normalized, capped
    traffic_factor = min(0.3, 0.3 * (math.log10(max(traffic_volume, 1)) / 4.0))

    # External exposure
    external_factor = min(0.25, 0.25 * (external_source_count / 50.0))

    # IOC correlation
    ioc_factor = 0.0
    if has_ioc_traffic:
        level_weights = {"critical": 0.30, "high": 0.22, "medium": 0.15, "low": 0.08}
        ioc_factor = level_weights.get(ioc_threat_level, 0.1)

    # Attack surface: how easily is this vuln class exploitable remotely
    remote_exploit_weights = {
        "command_injection": 0.15,
        "sql_injection": 0.15,
        "ssrf": 0.14,
        "deserialization": 0.13,
        "path_traversal": 0.12,
        "auth_bypass": 0.12,
        "privilege_escalation": 0.10,
        "buffer_overflow": 0.08,
        "use_after_free": 0.06,
        "race_condition": 0.05,
        "type_confusion": 0.05,
        "cryptographic_weakness": 0.04,
        "memory_leak": 0.03,
    }
    surface_factor = remote_exploit_weights.get(vuln_class, 0.07)

    score = traffic_factor + external_factor + ioc_factor + surface_factor

    # Bonus for attacker-controlled parameters
    if attacker_params_detected:
        score = min(1.0, score * 1.2)

    return round(min(1.0, max(0.0, score)), 4)


# Build traffic lookup by route
route_traffic = {}
for row in traffic_data:
    path = row["request_path"]
    if path not in route_traffic:
        route_traffic[path] = {
            "total_requests": 0,
            "external_requests": 0,
            "unique_sources": 0,
            "source_ips": set(),
            "ioc_hits": [],
        }
    route_traffic[path]["total_requests"] += row["request_count"]
    route_traffic[path]["external_requests"] += row["external_requests"]
    route_traffic[path]["unique_sources"] += row["unique_sources"]

    # Check source IPs against IOCs
    src_ip = row["source_ip"]
    if src_ip in known_bad_ips:
        route_traffic[path]["ioc_hits"].append(known_bad_ips[src_ip])
    route_traffic[path]["source_ips"].add(src_ip)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Compute Reachability for Each Root Cause

# COMMAND ----------

with mon.time("reachability_calculation"):
    reachability_results = []
    reachable_count = 0
    alerts_to_create = []

    for rc in root_causes:
        rc_id = rc["id"]
        rc_finding_ids = json.loads(rc["finding_ids"])

        # Find all routes associated with this root cause's findings
        rc_routes = set()
        rc_vuln_class = rc["vuln_class"]
        for fid in rc_finding_ids:
            if fid in finding_routes:
                rc_routes.update(finding_routes[fid]["routes"])

        # Match routes against traffic
        total_traffic = 0
        total_external = 0
        total_unique_sources = 0
        has_ioc = False
        ioc_max_level = "low"
        matched_routes = []
        ioc_matches = []

        for route in rc_routes:
            # Check exact and wildcard matches
            for traffic_route, traffic_info in route_traffic.items():
                route_pattern = route.replace("*", "")
                if traffic_route.startswith(route_pattern) or route_pattern in traffic_route:
                    total_traffic += traffic_info["total_requests"]
                    total_external += traffic_info["external_requests"]
                    total_unique_sources += traffic_info["unique_sources"]
                    matched_routes.append(traffic_route)
                    if traffic_info["ioc_hits"]:
                        has_ioc = True
                        for ioc in traffic_info["ioc_hits"]:
                            ioc_matches.append(ioc)
                            if severity_rank(ioc["threat_level"]) > severity_rank(ioc_max_level):
                                ioc_max_level = ioc["threat_level"]

        # Calculate score
        is_reachable = total_traffic >= min_traffic_threshold
        score = calculate_reachability_score(
            traffic_volume=total_traffic,
            external_source_count=total_unique_sources,
            has_ioc_traffic=has_ioc,
            ioc_threat_level=ioc_max_level,
            attacker_params_detected=total_external > 0,
            vuln_class=rc_vuln_class,
        )

        reachability_results.append({
            "id": str(uuid.uuid4()),
            "root_cause_id": rc_id,
            "reachability_score": score,
            "is_reachable": is_reachable and score > 0.2,
            "traffic_volume": total_traffic,
            "external_request_count": total_external,
            "unique_source_ips": total_unique_sources,
            "matched_routes": json.dumps(matched_routes[:20]),
            "ioc_correlation_count": len(ioc_matches),
            "ioc_max_threat_level": ioc_max_level if has_ioc else None,
            "ioc_indicators": json.dumps([i["indicator"] for i in ioc_matches[:10]]),
            "lookback_hours": lookback_hours,
            "analyzed_at": now,
        })

        if is_reachable and score > 0.2:
            reachable_count += 1

        # Generate alert for high-score reachable findings with IOC correlation
        if is_reachable and score > 0.5 and has_ioc:
            alerts_to_create.append({
                "id": str(uuid.uuid4()),
                "title": f"[Glasswing] Reachable vuln under active exploitation: {rc['title'][:100]}",
                "description": (
                    f"Mythos finding '{rc['title']}' (severity={rc['severity']}) is confirmed reachable "
                    f"with {total_traffic} requests in last {lookback_hours}h. "
                    f"IOC correlation: {len(ioc_matches)} known threat actor IPs observed. "
                    f"Reachability score: {score:.2f}"
                ),
                "severity": "critical" if score > 0.7 else "high",
                "source": "glasswing_reachability",
                "alert_type": "glasswing_reachable_exploit",
                "entity_id": rc_id,
                "metadata": json.dumps({
                    "root_cause_id": rc_id,
                    "reachability_score": score,
                    "traffic_volume": total_traffic,
                    "ioc_count": len(ioc_matches),
                    "matched_routes": matched_routes[:5],
                }),
                "status": "open",
                "created_at": now,
            })

    print(f"Analyzed {len(root_causes)} root causes: {reachable_count} reachable, {len(alerts_to_create)} alerts")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Persist Reachability Results

# COMMAND ----------

with mon.time("persist_reachability"):
    reachability_schema = StructType([
        StructField("id", StringType(), False),
        StructField("root_cause_id", StringType(), False),
        StructField("reachability_score", DoubleType(), False),
        StructField("is_reachable", BooleanType(), False),
        StructField("traffic_volume", IntegerType(), True),
        StructField("external_request_count", IntegerType(), True),
        StructField("unique_source_ips", IntegerType(), True),
        StructField("matched_routes", StringType(), True),
        StructField("ioc_correlation_count", IntegerType(), True),
        StructField("ioc_max_threat_level", StringType(), True),
        StructField("ioc_indicators", StringType(), True),
        StructField("lookback_hours", IntegerType(), False),
        StructField("analyzed_at", TimestampType(), False),
    ])

    reach_df = spark.createDataFrame(reachability_results, schema=reachability_schema)

    safe_merge(
        spark,
        reach_df,
        "glasswing_reachability",
        merge_keys=["root_cause_id"],
        update_columns=[
            "reachability_score", "is_reachable", "traffic_volume",
            "external_request_count", "unique_source_ips", "matched_routes",
            "ioc_correlation_count", "ioc_max_threat_level", "ioc_indicators",
            "analyzed_at",
        ],
        catalog=cfg.catalog,
        schema=cfg.schema,
    )

    print(f"Persisted {len(reachability_results)} reachability records")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Update Root Causes with Reachability Score

# COMMAND ----------

with mon.time("update_root_causes"):
    # Batch reachable root cause updates into a single MERGE via temp view
    reachable_updates = [
        {"root_cause_id": r["root_cause_id"], "reachability_score": r["reachability_score"]}
        for r in reachability_results
        if r["is_reachable"]
    ]

    if reachable_updates:
        updates_schema = StructType([
            StructField("root_cause_id", StringType(), False),
            StructField("reachability_score", DoubleType(), False),
        ])
        updates_df = spark.createDataFrame(reachable_updates, schema=updates_schema)
        updates_df.createOrReplaceTempView("_reachability_updates")

        rc_table = cfg.get_table_path("glasswing_root_causes")
        spark.sql(f"""
            MERGE INTO {rc_table} AS target
            USING _reachability_updates AS source
            ON target.id = source.root_cause_id
            WHEN MATCHED THEN UPDATE SET
                target.reachability_score = source.reachability_score,
                target.status = 'reachable',
                target.updated_at = current_timestamp()
        """)
        print(f"Updated {len(reachable_updates)} root causes to status='reachable'")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Generate Alerts for Reachable Vulnerabilities

# COMMAND ----------

with mon.time("generate_alerts"):
    if alerts_to_create:
        alert_schema = StructType([
            StructField("id", StringType(), False),
            StructField("title", StringType(), False),
            StructField("description", StringType(), True),
            StructField("severity", StringType(), False),
            StructField("source", StringType(), False),
            StructField("alert_type", StringType(), True),
            StructField("entity_id", StringType(), True),
            StructField("metadata", StringType(), True),
            StructField("status", StringType(), False),
            StructField("created_at", TimestampType(), False),
        ])

        alerts_df = spark.createDataFrame(alerts_to_create, schema=alert_schema)
        safe_append(
            alerts_df, "alerts",
            catalog=cfg.catalog, schema=cfg.schema,
            deduplicate_on=["id"],
        )
        print(f"Created {len(alerts_to_create)} critical alerts for reachable exploits")

    # Update scan run stats via MERGE
    scan_run_ids = list(set(rc["scan_run_id"] for rc in root_causes if rc["scan_run_id"]))
    if scan_run_ids:
        scan_updates = [
            {"scan_run_id": srid, "reachable_count": reachable_count}
            for srid in scan_run_ids
        ]
        scan_schema = StructType([
            StructField("scan_run_id", StringType(), False),
            StructField("reachable_count", IntegerType(), False),
        ])
        scan_df = spark.createDataFrame(scan_updates, schema=scan_schema)
        scan_df.createOrReplaceTempView("_scan_run_updates")

        scan_table = cfg.get_table_path("glasswing_scan_runs")
        spark.sql(f"""
            MERGE INTO {scan_table} AS target
            USING _scan_run_updates AS source
            ON target.id = source.scan_run_id
            WHEN MATCHED THEN UPDATE SET
                target.reachable_count = source.reachable_count,
                target.status = 'reachability_analyzed'
        """)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Update Agent Status and Exit

# COMMAND ----------

# Update agent status via safe_merge
agent_status_df = spark.createDataFrame([{
    "agent_id": "glasswing_reachability",
    "last_heartbeat": now,
    "status": "running",
    "events_processed": root_cause_count,
    "alerts_generated": len(alerts_to_create),
}])

safe_merge(
    spark,
    agent_status_df,
    "agent_status",
    merge_keys=["agent_id"],
    catalog=cfg.catalog,
    schema=cfg.schema,
)

result = {
    "status": "completed",
    "run_id": run_id,
    "root_causes_analyzed": root_cause_count,
    "reachable_count": reachable_count,
    "unreachable_count": root_cause_count - reachable_count,
    "alerts_created": len(alerts_to_create),
    "ioc_correlations": sum(1 for r in reachability_results if r["ioc_correlation_count"] > 0),
    "lookback_hours": lookback_hours,
    "avg_reachability_score": round(
        sum(r["reachability_score"] for r in reachability_results) / max(len(reachability_results), 1), 4
    ),
    "timings": mon.get_summary().get("timings", {}),
}

mon.log_complete(rows_processed=root_cause_count)
print(json.dumps(result, indent=2))
dbutils.notebook.exit(json.dumps(result))
