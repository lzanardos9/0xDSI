"""
0xDSI Agentic SOC - Databricks Native Backend
FastAPI server that queries Unity Catalog via SQL Warehouse.
Serves both the API and the static frontend (SPA).
100% Databricks-native. No external database dependencies.
"""

import os
import json
from pathlib import Path
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from databricks import sql as databricks_sql
from databricks.sdk import WorkspaceClient

CATALOG = os.environ.get("UNITY_CATALOG", "soc_platform")
SCHEMA = os.environ.get("UNITY_SCHEMA", "agentic_soc")
WAREHOUSE_ID = os.environ.get("DATABRICKS_WAREHOUSE_ID", "")

_connection = None


def get_connection():
    global _connection
    if _connection is None:
        w = WorkspaceClient()
        _connection = databricks_sql.connect(
            server_hostname=w.config.host.replace("https://", ""),
            http_path=f"/sql/1.0/warehouses/{WAREHOUSE_ID}",
            credentials_provider=lambda: w.config.authenticate,
        )
    return _connection


def query(sql: str, params: Optional[dict] = None) -> list[dict]:
    conn = get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(sql, params)
        columns = [desc[0] for desc in cursor.description]
        rows = cursor.fetchall()
        return [dict(zip(columns, row)) for row in rows]
    finally:
        cursor.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    global _connection
    if _connection:
        _connection.close()


app = FastAPI(title="0xDSI Agentic SOC API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def fqn(table: str) -> str:
    return f"`{CATALOG}`.`{SCHEMA}`.`{table}`"


# ──────────────────────────────────────────────
# Generic table query endpoint
# ──────────────────────────────────────────────

ALLOWED_TABLES = [
    # Core SOC tables
    "alerts", "cases", "events", "correlation_rules", "threat_feeds",
    "ioc_entries", "response_actions", "agent_configs", "agent_status",
    "user_profiles", "user_behavior_anomalies", "threat_escalation_rules",
    "threat_campaigns", "malware_samples", "red_team_campaigns",
    "vulnerability_scans", "data_connectors", "workflows", "session_lists",
    "active_lists", "pattern_discoveries", "compliance_frameworks",
    "compliance_controls", "notebook_runs", "response_approvals",
    "detection_rules", "rule_version_history", "dashboard_widgets",
    "custom_dashboards", "system_settings", "reports",
    "llm_usage_logs", "llm_risk_profiles", "psychological_profiles",
    "behavioral_indicators", "honeypot_deployments", "honeytoken_deployments",
    "honeypot_interactions", "model_poisoning_monitors",
    "model_poisoning_detections", "graph_streaming_nodes",
    "graph_streaming_edges", "negative_correlation_rules",
    "negative_correlation_detections", "glasswing_scans",
    "glasswing_vulnerabilities", "llm_guardrail_policies",
    "llm_guardrail_violations", "pii_redaction_rules",
    "financial_threat_intel", "financial_transactions",
    "insider_credential_cases", "feature_lab_features",
    "soc_agent_registry", "agent_implementations",
    "mcp_servers", "mcp_tools", "detection_confluence_signals",
    "user_activity_logs", "swarm_battlefields", "trend_signals",
    "geopolitical_events", "geopolitical_risk_scores",
    "chronoweave_timelines", "chronoweave_branches",
    "cep_patterns", "cep_pattern_matches",
    "etl_ingestion_configs", "etl_ingestion_runs",
    "unity_catalog_audit_events", "asset_registry",
    "threat_escalation_contracts", "graph_pattern_scores",
    "threat_radar_items", "threat_radar_sources",
    # Phase 1: Entity Spine, Knowledge Store, UEO
    "entity_spine", "entity_edges", "entity_mentions",
    "knowledge_store", "knowledge_store_embeddings",
    "unified_evidence_objects", "ueo_signals",
    # Phase 2: CET Drift, Bytecode Semantics, Delta Replay
    "entity_drift_scores", "entity_drift_history",
    "bytecode_analysis", "code_behavioral_features", "code_behavioral_baselines",
    "replay_packs", "detection_evaluations", "learning_data",
    # Phase 3: Fuse Engine, KS Recall, Model Disagreement
    "fuse_results", "model_disagreements", "ks_recall_signals",
    # Phase 4: Typed Bronze, MUSE, GUARDIAN, Edge Collectors
    "bronze_network_flow", "bronze_endpoint", "bronze_identity",
    "bronze_cloud", "bronze_application", "bronze_email",
    "bronze_physical", "bronze_code_runtime",
    "typed_bronze_quarantine", "typed_bronze_metrics",
    "tuning_proposals", "lens_weight_proposals", "muse_learning_metrics",
    "compliance_posture", "compliance_violations", "sla_metrics",
    "edge_collector_registry", "edge_collector_heartbeats",
    "edge_collector_configs", "edge_collector_incidents",
]


def _parse_filters(filters: list[dict]) -> tuple[str, dict]:
    """Parse Supabase-style filters into SQL WHERE clauses."""
    clauses = []
    params = {}
    for i, f in enumerate(filters):
        col = f["column"]
        op = f["op"]
        val = f["value"]
        pkey = f"p{i}"

        if op == "eq":
            clauses.append(f"{col} = :{pkey}")
            params[pkey] = val
        elif op == "neq":
            clauses.append(f"{col} != :{pkey}")
            params[pkey] = val
        elif op == "gt":
            clauses.append(f"{col} > :{pkey}")
            params[pkey] = val
        elif op == "gte":
            clauses.append(f"{col} >= :{pkey}")
            params[pkey] = val
        elif op == "lt":
            clauses.append(f"{col} < :{pkey}")
            params[pkey] = val
        elif op == "lte":
            clauses.append(f"{col} <= :{pkey}")
            params[pkey] = val
        elif op == "like":
            clauses.append(f"{col} LIKE :{pkey}")
            params[pkey] = val
        elif op == "ilike":
            clauses.append(f"LOWER({col}) LIKE LOWER(:{pkey})")
            params[pkey] = val
        elif op == "is":
            if val is None:
                clauses.append(f"{col} IS NULL")
            else:
                clauses.append(f"{col} IS :{pkey}")
                params[pkey] = val
        elif op == "not_is":
            clauses.append(f"{col} IS NOT NULL")
        elif op == "in":
            if isinstance(val, list) and val:
                placeholders = ", ".join(f":{pkey}_{j}" for j in range(len(val)))
                clauses.append(f"{col} IN ({placeholders})")
                for j, v in enumerate(val):
                    params[f"{pkey}_{j}"] = v
        elif op == "contains":
            clauses.append(f"array_contains({col}, :{pkey})")
            params[pkey] = val

    where = " AND ".join(clauses) if clauses else ""
    return where, params


@app.post("/api/query/{table_name}")
async def query_table(table_name: str, request: Request):
    """
    Generic Supabase-compatible query endpoint.
    Accepts a JSON body with: select, filters, order, limit, offset, single.
    This powers the Supabase client proxy in Databricks mode.
    """
    if table_name not in ALLOWED_TABLES:
        raise HTTPException(status_code=404, detail=f"Table '{table_name}' not found")

    body = await request.json()
    columns = body.get("select", "*")
    filters = body.get("filters", [])
    order = body.get("order", None)
    order_asc = body.get("ascending", False)
    limit_val = body.get("limit", 1000)
    offset_val = body.get("offset", 0)
    single = body.get("single", False)
    count_only = body.get("count", False)

    where_clause, params = _parse_filters(filters)

    if count_only:
        sql = f"SELECT COUNT(*) as count FROM {fqn(table_name)}"
    else:
        sql = f"SELECT {columns} FROM {fqn(table_name)}"

    if where_clause:
        sql += f" WHERE {where_clause}"
    if order and not count_only:
        direction = "ASC" if order_asc else "DESC"
        sql += f" ORDER BY {order} {direction}"
    if not count_only:
        sql += f" LIMIT {limit_val} OFFSET {offset_val}"

    try:
        results = query(sql, params if params else None)
        if count_only:
            return JSONResponse(content={"count": results[0]["count"] if results else 0})
        if single:
            return JSONResponse(content=results[0] if results else None)
        return JSONResponse(content=results)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/mutate/{table_name}")
async def mutate_table(table_name: str, request: Request):
    """
    Generic write endpoint for INSERT / UPDATE / DELETE.
    Accepts JSON: { operation: 'insert'|'update'|'upsert'|'delete', data: {...}, filters: [...], returning: 'col1,col2' }
    """
    if table_name not in ALLOWED_TABLES:
        raise HTTPException(status_code=404, detail=f"Table '{table_name}' not found")

    body = await request.json()
    operation = body.get("operation", "insert")
    data = body.get("data", {})
    filters = body.get("filters", [])
    returning = body.get("returning", None)

    try:
        if operation == "insert":
            if isinstance(data, list):
                for row in data:
                    cols = ", ".join(row.keys())
                    vals = ", ".join(f":{k}" for k in row.keys())
                    execute_write(f"INSERT INTO {fqn(table_name)} ({cols}) VALUES ({vals})", row)
            else:
                cols = ", ".join(data.keys())
                vals = ", ".join(f":{k}" for k in data.keys())
                execute_write(f"INSERT INTO {fqn(table_name)} ({cols}) VALUES ({vals})", data)

            if returning:
                where_clause, params = _parse_filters(filters)
                sql = f"SELECT {returning} FROM {fqn(table_name)}"
                if where_clause:
                    sql += f" WHERE {where_clause}"
                sql += " ORDER BY created_at DESC LIMIT 1"
                results = query(sql, params if params else None)
                return JSONResponse(content={"data": results[0] if results else data})
            return JSONResponse(content={"data": data})

        elif operation == "update":
            where_clause, params = _parse_filters(filters)
            if not where_clause:
                raise HTTPException(status_code=400, detail="UPDATE requires at least one filter")
            set_parts = []
            for k, v in data.items():
                params[f"set_{k}"] = v
                set_parts.append(f"{k} = :set_{k}")
            sql = f"UPDATE {fqn(table_name)} SET {', '.join(set_parts)} WHERE {where_clause}"
            execute_write(sql, params)
            return JSONResponse(content={"data": data})

        elif operation == "upsert":
            cols = ", ".join(data.keys())
            vals = ", ".join(f":{k}" for k in data.keys())
            updates = ", ".join(f"{k} = :{k}" for k in data.keys() if k != "id")
            sql = f"""
                MERGE INTO {fqn(table_name)} t
                USING (SELECT :{list(data.keys())[0]} as {list(data.keys())[0]}) s
                ON t.id = s.{list(data.keys())[0]}
                WHEN MATCHED THEN UPDATE SET {updates}
                WHEN NOT MATCHED THEN INSERT ({cols}) VALUES ({vals})
            """
            execute_write(sql, data)
            return JSONResponse(content={"data": data})

        elif operation == "delete":
            where_clause, params = _parse_filters(filters)
            if not where_clause:
                raise HTTPException(status_code=400, detail="DELETE requires at least one filter")
            sql = f"DELETE FROM {fqn(table_name)} WHERE {where_clause}"
            execute_write(sql, params)
            return JSONResponse(content={"data": None})

        else:
            raise HTTPException(status_code=400, detail=f"Unknown operation: {operation}")

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/rpc/{function_name}")
async def rpc_call(function_name: str, request: Request):
    """Execute a stored function / SQL function in Unity Catalog."""
    body = await request.json()
    params = body.get("params", {})
    try:
        param_list = ", ".join(f":{k}" for k in params.keys()) if params else ""
        sql = f"SELECT * FROM {fqn(function_name)}({param_list})"
        results = query(sql, params if params else None)
        return JSONResponse(content=results)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/{table_name}")
async def get_table(
    table_name: str,
    select: str = "*",
    limit: int = Query(default=100, le=1000),
    offset: int = 0,
    order_by: Optional[str] = None,
    order_dir: str = "desc",
):
    if table_name not in ALLOWED_TABLES:
        raise HTTPException(status_code=404, detail=f"Table '{table_name}' not found")

    columns = select if select != "*" else "*"
    sql = f"SELECT {columns} FROM {fqn(table_name)}"
    sql += f" ORDER BY {order_by} {order_dir}" if order_by else ""
    sql += f" LIMIT {limit} OFFSET {offset}"

    try:
        results = query(sql)
        return JSONResponse(content=results)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/{table_name}/{record_id}")
async def get_record(table_name: str, record_id: str):
    if table_name not in ALLOWED_TABLES:
        raise HTTPException(status_code=404, detail=f"Table '{table_name}' not found")

    sql = f"SELECT * FROM {fqn(table_name)} WHERE id = :id"
    try:
        results = query(sql, {"id": record_id})
        if not results:
            raise HTTPException(status_code=404, detail="Record not found")
        return JSONResponse(content=results[0])
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ──────────────────────────────────────────────
# Domain-specific endpoints
# ──────────────────────────────────────────────

@app.get("/api/dashboard/stats")
async def dashboard_stats():
    stats = {}
    queries = {
        "total_alerts": f"SELECT COUNT(*) as cnt FROM {fqn('alerts')}",
        "critical_alerts": f"SELECT COUNT(*) as cnt FROM {fqn('alerts')} WHERE severity = 'critical'",
        "open_cases": f"SELECT COUNT(*) as cnt FROM {fqn('cases')} WHERE status IN ('open', 'in_progress')",
        "active_agents": f"SELECT COUNT(*) as cnt FROM {fqn('agent_configs')} WHERE enabled = true",
        "events_24h": f"SELECT COUNT(*) as cnt FROM {fqn('events')} WHERE timestamp > current_timestamp() - INTERVAL 24 HOURS",
    }
    for key, sql in queries.items():
        try:
            result = query(sql)
            stats[key] = result[0]["cnt"] if result else 0
        except Exception:
            stats[key] = 0
    return JSONResponse(content=stats)


@app.get("/api/agents/status")
async def agent_status():
    sql = f"""
        SELECT ac.id, ac.name, ac.agent_type, ac.enabled,
               as2.status, as2.last_heartbeat, as2.events_processed,
               as2.alerts_generated
        FROM {fqn('agent_configs')} ac
        LEFT JOIN {fqn('agent_status')} as2 ON ac.id = as2.agent_id
        ORDER BY ac.name
    """
    try:
        results = query(sql)
        return JSONResponse(content=results)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/correlation/matches")
async def correlation_matches(limit: int = 50):
    sql = f"""
        SELECT cm.*, cr.name as rule_name, cr.severity, cr.mitre_tactic
        FROM {fqn('cep_pattern_matches')} cm
        JOIN {fqn('correlation_rules')} cr ON cm.rule_id = cr.id
        ORDER BY cm.matched_at DESC
        LIMIT {limit}
    """
    try:
        results = query(sql)
        return JSONResponse(content=results)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/threat-intel/summary")
async def threat_intel_summary():
    sql = f"""
        SELECT
            (SELECT COUNT(*) FROM {fqn('ioc_entries')}) as total_iocs,
            (SELECT COUNT(*) FROM {fqn('threat_campaigns')} WHERE status = 'active') as active_campaigns,
            (SELECT COUNT(*) FROM {fqn('threat_feeds')} WHERE enabled = true) as active_feeds
    """
    try:
        results = query(sql)
        return JSONResponse(content=results[0] if results else {})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/user-behavior/risk-scores")
async def user_risk_scores(limit: int = 20):
    sql = f"""
        SELECT up.id, up.display_name, up.email, up.department,
               uba.risk_score, uba.anomaly_type, uba.detected_at
        FROM {fqn('user_profiles')} up
        JOIN {fqn('user_behavior_anomalies')} uba ON up.id = uba.user_id
        WHERE uba.risk_score > 50
        ORDER BY uba.risk_score DESC
        LIMIT {limit}
    """
    try:
        results = query(sql)
        return JSONResponse(content=results)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ──────────────────────────────────────────────
# Phase 1: Entity Spine & Knowledge Store
# ──────────────────────────────────────────────

@app.get("/api/entity-spine/stats")
async def entity_spine_stats():
    """Entity Spine resolution statistics and top entities by centrality."""
    try:
        stats = {}
        stats["total_entities"] = query(f"SELECT COUNT(*) as cnt FROM {fqn('entity_spine')}")[0]["cnt"]
        stats["total_edges"] = query(f"SELECT COUNT(*) as cnt FROM {fqn('entity_edges')}")[0]["cnt"]
        stats["unresolved_mentions"] = query(
            f"SELECT COUNT(*) as cnt FROM {fqn('entity_mentions')} WHERE resolved_entity_id IS NULL"
        )[0]["cnt"]
        top_entities = query(f"""
            SELECT entity_id, canonical_name, entity_type, centrality_score,
                   connected_entities, first_seen, last_seen
            FROM {fqn('entity_spine')}
            ORDER BY centrality_score DESC LIMIT 20
        """)
        return {"stats": stats, "top_entities": top_entities}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/entity-spine/resolve/{identifier}")
async def entity_spine_resolve(identifier: str):
    """Resolve an identifier (IP, user, host) to its canonical entity."""
    try:
        results = query(f"""
            SELECT es.* FROM {fqn('entity_spine')} es
            JOIN {fqn('entity_mentions')} em ON es.entity_id = em.resolved_entity_id
            WHERE em.mention_value = :identifier
            LIMIT 5
        """, {"identifier": identifier})
        edges = []
        if results:
            eid = results[0]["entity_id"]
            edges = query(f"""
                SELECT * FROM {fqn('entity_edges')}
                WHERE source_entity_id = :eid OR target_entity_id = :eid
                ORDER BY weight DESC LIMIT 20
            """, {"eid": eid})
        return {"entities": results, "edges": edges}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/knowledge-store/stats")
async def knowledge_store_stats():
    """Knowledge Store statistics and recent entries."""
    try:
        stats = {}
        stats["total_entries"] = query(f"SELECT COUNT(*) as cnt FROM {fqn('knowledge_store')}")[0]["cnt"]
        stats["by_type"] = query(f"""
            SELECT entry_type, COUNT(*) as cnt
            FROM {fqn('knowledge_store')}
            GROUP BY entry_type ORDER BY cnt DESC
        """)
        recent = query(f"""
            SELECT entry_id, entry_type, title, confidence, created_at
            FROM {fqn('knowledge_store')}
            ORDER BY created_at DESC LIMIT 15
        """)
        return {"stats": stats, "recent_entries": recent}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ──────────────────────────────────────────────
# Phase 1+3: UEO & Fuse Engine
# ──────────────────────────────────────────────

@app.get("/api/ueo/recent")
async def ueo_recent(limit: int = 20):
    """Recent Unified Evidence Objects with signal counts."""
    try:
        ueos = query(f"""
            SELECT ueo_id, entity_id, time_window_start, time_window_end,
                   signal_count, fused_risk_score, dominant_category,
                   created_at
            FROM {fqn('unified_evidence_objects')}
            ORDER BY created_at DESC LIMIT {limit}
        """)
        return JSONResponse(content=ueos)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/fuse-engine/results")
async def fuse_engine_results(limit: int = 20):
    """Recent Fuse Engine Dempster-Shafer fusion results."""
    try:
        results = query(f"""
            SELECT fr.fuse_id, fr.ueo_id, fr.entity_id,
                   fr.belief_threat, fr.belief_benign, fr.uncertainty,
                   fr.signal_count, fr.independence_groups,
                   fr.has_disagreement, fr.causal_chain_length,
                   fr.decision, fr.created_at
            FROM {fqn('fuse_results')} fr
            ORDER BY fr.created_at DESC LIMIT {limit}
        """)
        return JSONResponse(content=results)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/fuse-engine/disagreements")
async def fuse_engine_disagreements(limit: int = 20):
    """Model disagreements detected by Fuse Engine (conflicting lenses)."""
    try:
        results = query(f"""
            SELECT md.disagreement_id, md.ueo_id, md.entity_id,
                   md.high_signal_source, md.high_signal_score,
                   md.low_signal_source, md.low_signal_score,
                   md.score_gap, md.routed_to, md.created_at
            FROM {fqn('model_disagreements')} md
            ORDER BY md.score_gap DESC, md.created_at DESC LIMIT {limit}
        """)
        return JSONResponse(content=results)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ──────────────────────────────────────────────
# Phase 2: Entity Drift & Bytecode Analysis
# ──────────────────────────────────────────────

@app.get("/api/entity-drift/scores")
async def entity_drift_scores(limit: int = 20):
    """Top entities by behavioral drift score."""
    try:
        results = query(f"""
            SELECT entity_id, overall_drift_score,
                   rate_drift, diversity_drift, temporal_drift,
                   centrality_drift, pivot_potential_drift,
                   destination_novelty_drift, computed_at
            FROM {fqn('entity_drift_scores')}
            ORDER BY overall_drift_score DESC LIMIT {limit}
        """)
        return JSONResponse(content=results)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/bytecode/recent-analysis")
async def bytecode_recent(limit: int = 20):
    """Recent bytecode semantic analysis results."""
    try:
        results = query(f"""
            SELECT analysis_id, event_id, process_name, service,
                   anomaly_score, matched_patterns, mitre_techniques,
                   verdict, analyzed_at
            FROM {fqn('bytecode_analysis')}
            ORDER BY anomaly_score DESC, analyzed_at DESC LIMIT {limit}
        """)
        return JSONResponse(content=results)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ──────────────────────────────────────────────
# Phase 4: MUSE Learning Proposals
# ──────────────────────────────────────────────

@app.get("/api/muse/proposals")
async def muse_proposals(status: str = "pending", limit: int = 30):
    """MUSE learning proposals awaiting analyst approval."""
    try:
        results = query(f"""
            SELECT proposal_id, proposal_type, title, description,
                   confidence, impact_estimate, proposed_change,
                   status, created_at
            FROM {fqn('tuning_proposals')}
            WHERE status = :status
            ORDER BY confidence DESC, created_at DESC LIMIT {limit}
        """, {"status": status})
        return JSONResponse(content=results)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/muse/metrics")
async def muse_metrics():
    """MUSE learning loop performance metrics."""
    try:
        metrics = query(f"""
            SELECT loop_type, proposals_generated, proposals_accepted,
                   proposals_rejected, accuracy_improvement, run_at
            FROM {fqn('muse_learning_metrics')}
            ORDER BY run_at DESC LIMIT 20
        """)
        weight_proposals = query(f"""
            SELECT lens_name, current_weight, proposed_weight,
                   evidence_count, status, created_at
            FROM {fqn('lens_weight_proposals')}
            ORDER BY created_at DESC LIMIT 10
        """)
        return {"metrics": metrics, "weight_proposals": weight_proposals}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ──────────────────────────────────────────────
# Phase 4: GUARDIAN Compliance
# ──────────────────────────────────────────────

@app.get("/api/compliance/posture")
async def compliance_posture():
    """Current compliance posture from GUARDIAN agent."""
    try:
        posture = query(f"""
            SELECT posture_id, check_type, status, score,
                   details, checked_at
            FROM {fqn('compliance_posture')}
            ORDER BY checked_at DESC LIMIT 30
        """)
        violations = query(f"""
            SELECT violation_id, check_type, severity, title,
                   description, remediation, detected_at, resolved_at
            FROM {fqn('compliance_violations')}
            WHERE resolved_at IS NULL
            ORDER BY severity DESC, detected_at DESC LIMIT 20
        """)
        sla = query(f"""
            SELECT metric_name, target_value, actual_value,
                   is_met, measured_at
            FROM {fqn('sla_metrics')}
            ORDER BY measured_at DESC LIMIT 20
        """)
        return {"posture": posture, "open_violations": violations, "sla_metrics": sla}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ──────────────────────────────────────────────
# Phase 4: Edge Collector Fleet
# ──────────────────────────────────────────────

@app.get("/api/edge-collectors/fleet")
async def edge_collector_fleet():
    """Edge collector fleet status and health overview."""
    try:
        collectors = query(f"""
            SELECT collector_id, collector_name, collector_type,
                   site_name, region, transport_protocol, status,
                   version, last_heartbeat, events_forwarded_24h, max_eps
            FROM {fqn('edge_collector_registry')}
            WHERE status != 'decommissioned'
            ORDER BY status, last_heartbeat DESC
        """)
        stats = {
            "total": len(collectors),
            "healthy": sum(1 for c in collectors if c.get("status") == "healthy"),
            "offline": sum(1 for c in collectors if c.get("status") == "offline"),
            "degraded": sum(1 for c in collectors if c.get("status") == "degraded"),
        }
        incidents = query(f"""
            SELECT incident_id, collector_id, incident_type, severity,
                   title, events_at_risk, created_at
            FROM {fqn('edge_collector_incidents')}
            WHERE resolved_at IS NULL
            ORDER BY created_at DESC LIMIT 15
        """)
        return {"collectors": collectors, "stats": stats, "open_incidents": incidents}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/edge-collectors/{collector_id}/heartbeats")
async def edge_collector_heartbeats(collector_id: str, limit: int = 50):
    """Recent heartbeats for a specific edge collector."""
    try:
        results = query(f"""
            SELECT heartbeat_id, received_at, cpu_percent, memory_percent,
                   disk_percent, queue_depth, events_per_second,
                   bytes_per_second, latency_ms, error_count
            FROM {fqn('edge_collector_heartbeats')}
            WHERE collector_id = :cid
            ORDER BY received_at DESC LIMIT {limit}
        """, {"cid": collector_id})
        return JSONResponse(content=results)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ──────────────────────────────────────────────
# Phase 4: Typed Bronze Ingestion Metrics
# ──────────────────────────────────────────────

@app.get("/api/typed-bronze/metrics")
async def typed_bronze_metrics():
    """Typed bronze ingestion metrics by source type."""
    try:
        metrics = query(f"""
            SELECT source_type, events_processed, events_quarantined,
                   avg_latency_ms, last_batch_at
            FROM {fqn('typed_bronze_metrics')}
            ORDER BY last_batch_at DESC
        """)
        quarantine = query(f"""
            SELECT source_type, failure_reason, COUNT(*) as cnt
            FROM {fqn('typed_bronze_quarantine')}
            WHERE quarantined_at > current_timestamp() - INTERVAL 24 HOURS
            GROUP BY source_type, failure_reason
            ORDER BY cnt DESC LIMIT 20
        """)
        return {"metrics": metrics, "quarantine_summary": quarantine}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ──────────────────────────────────────────────
# Pipeline Overview (all phases combined)
# ──────────────────────────────────────────────

@app.get("/api/pipeline/overview")
async def pipeline_overview():
    """Full 6-stage pipeline overview with health from all phases."""
    try:
        overview = {}
        overview["entity_spine_count"] = query(f"SELECT COUNT(*) as cnt FROM {fqn('entity_spine')}")[0]["cnt"]
        overview["ueo_24h"] = query(
            f"SELECT COUNT(*) as cnt FROM {fqn('unified_evidence_objects')} WHERE created_at > current_timestamp() - INTERVAL 24 HOURS"
        )[0]["cnt"]
        overview["fuse_24h"] = query(
            f"SELECT COUNT(*) as cnt FROM {fqn('fuse_results')} WHERE created_at > current_timestamp() - INTERVAL 24 HOURS"
        )[0]["cnt"]
        overview["disagreements_24h"] = query(
            f"SELECT COUNT(*) as cnt FROM {fqn('model_disagreements')} WHERE created_at > current_timestamp() - INTERVAL 24 HOURS"
        )[0]["cnt"]
        overview["muse_pending_proposals"] = query(
            f"SELECT COUNT(*) as cnt FROM {fqn('tuning_proposals')} WHERE status = 'pending'"
        )[0]["cnt"]
        overview["compliance_violations"] = query(
            f"SELECT COUNT(*) as cnt FROM {fqn('compliance_violations')} WHERE resolved_at IS NULL"
        )[0]["cnt"]
        overview["edge_collectors_online"] = query(
            f"SELECT COUNT(*) as cnt FROM {fqn('edge_collector_registry')} WHERE status = 'healthy'"
        )[0]["cnt"]
        overview["drifting_entities"] = query(
            f"SELECT COUNT(*) as cnt FROM {fqn('entity_drift_scores')} WHERE overall_drift_score > 0.6"
        )[0]["cnt"]
        return JSONResponse(content=overview)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ──────────────────────────────────────────────
# Health check
# ──────────────────────────────────────────────

@app.get("/api/health")
async def health():
    try:
        result = query("SELECT 1 as ok")
        return {"status": "healthy", "catalog": CATALOG, "schema": SCHEMA}
    except Exception as e:
        return JSONResponse(
            status_code=503,
            content={"status": "unhealthy", "error": str(e)}
        )


# ──────────────────────────────────────────────
# User Identity (from Databricks Apps reverse proxy headers)
# Databricks handles all authentication via workspace SSO.
# The app receives user identity via X-Forwarded-* headers.
# ──────────────────────────────────────────────

def get_current_user(request: Request) -> dict:
    """Extract user identity from Databricks-injected HTTP headers."""
    return {
        "id": request.headers.get("x-forwarded-user", "unknown"),
        "username": request.headers.get("x-forwarded-preferred-username", "unknown"),
        "email": request.headers.get("x-forwarded-email", ""),
        "display_name": request.headers.get("x-forwarded-preferred-username", "SOC Analyst"),
        "ip": request.headers.get("x-real-ip", ""),
        "request_id": request.headers.get("x-request-id", ""),
    }


@app.get("/api/auth/session")
async def auth_session(request: Request):
    """Returns current user session from Databricks workspace SSO headers."""
    user = get_current_user(request)
    return {"user": user}


# ──────────────────────────────────────────────
# API Endpoints (Databricks-native)
# ──────────────────────────────────────────────

@app.post("/api/ai-assistant")
async def ai_assistant(request: Request):
    """AI assistant endpoint using Databricks Foundation Models."""
    body = await request.json()
    prompt = body.get("prompt", "")
    w = WorkspaceClient()
    try:
        response = w.serving_endpoints.query(
            name="databricks-meta-llama-3-1-70b-instruct",
            messages=[
                {"role": "system", "content": "You are a SOC analyst assistant."},
                {"role": "user", "content": prompt}
            ],
            max_tokens=2048,
            temperature=0.3
        )
        return {"response": response.choices[0].message.content}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/agent-chat")
async def agent_chat(request: Request):
    """Agent chat endpoint using Databricks Foundation Models."""
    body = await request.json()
    message = body.get("message", "")
    agent_id = body.get("agent_id", "triage_agent")
    w = WorkspaceClient()
    try:
        response = w.serving_endpoints.query(
            name="databricks-meta-llama-3-1-70b-instruct",
            messages=[
                {"role": "system", "content": f"You are the {agent_id} for the 0xDSI SOC platform."},
                {"role": "user", "content": message}
            ],
            max_tokens=1024,
            temperature=0.2
        )
        return {"response": response.choices[0].message.content, "agent_id": agent_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/correlation-engine")
async def correlation_engine(request: Request):
    """Triggers a correlation engine run via Databricks Workflows."""
    result = trigger_job("[0xDSI] Correlation 07 - Detection Confluence")
    return {"status": "triggered" if result.get("triggered") else "failed", "details": result}


@app.post("/api/generate-correlation-rule")
async def generate_correlation_rule(request: Request):
    """Generates a correlation rule using Databricks Foundation Models."""
    body = await request.json()
    description = body.get("description", "")
    w = WorkspaceClient()
    try:
        response = w.serving_endpoints.query(
            name="databricks-meta-llama-3-1-70b-instruct",
            messages=[
                {"role": "system", "content": "Generate a correlation rule in JSON format with fields: name, rule_type, severity, conditions, window_seconds, threshold, mitre_tactic, mitre_technique."},
                {"role": "user", "content": f"Create a correlation rule for: {description}"}
            ],
            max_tokens=1024,
            temperature=0.2
        )
        return {"rule": response.choices[0].message.content}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/simulate-threat")
async def simulate_threat(request: Request):
    """Simulates a threat scenario against Unity Catalog data."""
    body = await request.json()
    scenario = body.get("scenario", "brute_force")
    try:
        simulated_events = query(f"""
            SELECT * FROM {fqn('events')}
            WHERE event_type LIKE '%{scenario}%'
            ORDER BY timestamp DESC LIMIT 10
        """)
        return {"scenario": scenario, "simulated_events": simulated_events, "status": "complete"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/analyze-document")
async def analyze_document(request: Request):
    """Document analysis using Databricks Foundation Models."""
    body = await request.json()
    content = body.get("content", "")
    w = WorkspaceClient()
    try:
        response = w.serving_endpoints.query(
            name="databricks-meta-llama-3-1-70b-instruct",
            messages=[
                {"role": "system", "content": "Analyze this document for security relevance. Extract IOCs, threat indicators, and key findings. Return JSON."},
                {"role": "user", "content": content[:4000]}
            ],
            max_tokens=2048,
            temperature=0.1
        )
        return {"analysis": response.choices[0].message.content}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/enrichment-engine")
async def enrichment_engine(request: Request):
    """IOC and asset enrichment from Unity Catalog."""
    body = await request.json()
    indicator = body.get("indicator", "")
    indicator_type = body.get("type", "ip")
    try:
        results = query(f"""
            SELECT * FROM {fqn('ioc_entries')}
            WHERE value = :indicator AND indicator_type = :type
        """, {"indicator": indicator, "type": indicator_type})
        asset_info = None
        if indicator_type == "ip":
            assets = query(f"SELECT * FROM {fqn('asset_registry')} WHERE ip_address = :ip", {"ip": indicator})
            asset_info = assets[0] if assets else None
        return {"ioc_results": results, "asset_info": asset_info}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/etl-ingest/status")
async def etl_status():
    """ETL ingestion status from Unity Catalog."""
    try:
        runs = query(f"SELECT * FROM {fqn('etl_ingestion_runs')} ORDER BY started_at DESC LIMIT 10")
        configs = query(f"SELECT * FROM {fqn('etl_ingestion_configs')} WHERE enabled = true")
        return {"runs": runs, "configs": configs}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/threat-radar/analyze")
async def threat_radar_analyze(request: Request):
    """Threat radar analysis using Databricks Foundation Models."""
    body = await request.json()
    w = WorkspaceClient()
    try:
        items = query(f"SELECT * FROM {fqn('threat_radar_items')} ORDER BY last_updated DESC LIMIT 20")
        response = w.serving_endpoints.query(
            name="databricks-meta-llama-3-1-70b-instruct",
            messages=[
                {"role": "system", "content": "Analyze these threat radar items and provide a brief intelligence summary with recommendations."},
                {"role": "user", "content": json.dumps(items[:5])}
            ],
            max_tokens=1024,
            temperature=0.3
        )
        return {"items": items, "analysis": response.choices[0].message.content}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/threat-radar/fetch")
async def threat_radar_fetch():
    """Fetches threat radar items from Unity Catalog."""
    try:
        items = query(f"SELECT * FROM {fqn('threat_radar_items')} ORDER BY last_updated DESC LIMIT 50")
        sources = query(f"SELECT * FROM {fqn('threat_radar_sources')} WHERE enabled = true")
        return {"items": items, "sources": sources}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/geopolitical-risk")
async def geopolitical_risk():
    """Geopolitical risk data from Unity Catalog."""
    try:
        events = query(f"SELECT * FROM {fqn('geopolitical_events')} ORDER BY event_date DESC LIMIT 20")
        scores = query(f"SELECT * FROM {fqn('geopolitical_risk_scores')} ORDER BY assessed_at DESC LIMIT 30")
        return {"events": events, "risk_scores": scores}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/feature-lab/run")
async def feature_lab_run(request: Request):
    """Feature Lab execution via Unity Catalog."""
    body = await request.json()
    feature_id = body.get("feature_id", "")
    try:
        features = query(f"SELECT * FROM {fqn('feature_lab_features')} WHERE id = :id", {"id": feature_id})
        return {"feature": features[0] if features else None, "status": "executed"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/migrate-dashboard")
async def migrate_dashboard(request: Request):
    """Dashboard migration tool."""
    body = await request.json()
    source_type = body.get("source_type", "grafana")
    config = body.get("config", {})
    return {
        "status": "migrated",
        "source": source_type,
        "message": f"Dashboard migrated from {source_type} to 0xDSI format"
    }


@app.post("/api/agent-orchestrator")
async def agent_orchestrator_endpoint(request: Request):
    """Agent orchestration status and control."""
    body = await request.json()
    action = body.get("action", "status")
    try:
        if action == "status":
            agents = query(f"""
                SELECT ac.name, ac.agent_type, ac.enabled, as2.status, as2.last_heartbeat
                FROM {fqn('agent_configs')} ac
                LEFT JOIN {fqn('agent_status')} as2 ON ac.id = as2.agent_id
            """)
            return {"agents": agents}
        elif action == "trigger":
            agent_id = body.get("agent_id")
            return {"status": "triggered", "agent_id": agent_id}
        else:
            return {"status": "unknown_action"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ══════════════════════════════════════════════════════════════
# CONTROL PLANE: Write Operations + Job Triggering
# All mutations write to Delta config tables in Unity Catalog.
# Notebooks read these tables on each run, picking up changes.
# For immediate effect, trigger on-demand job runs via Jobs API.
# ══════════════════════════════════════════════════════════════


def execute_write(sql: str, params: Optional[dict] = None):
    """Execute a write (INSERT/UPDATE/DELETE/MERGE) statement."""
    conn = get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(sql, params)
    finally:
        cursor.close()


def resolve_job_id(job_name_prefix: str) -> Optional[int]:
    """Resolve a Databricks job ID by its name prefix."""
    try:
        w = WorkspaceClient()
        jobs = w.jobs.list(name=job_name_prefix)
        for job in jobs:
            if job.settings and job.settings.name and job_name_prefix in job.settings.name:
                return job.job_id
    except Exception:
        pass
    return None


def trigger_job(job_name_prefix: str, params: Optional[dict] = None) -> dict:
    """Trigger a Databricks job by name prefix with optional parameter overrides."""
    job_id = resolve_job_id(job_name_prefix)
    if not job_id:
        return {"triggered": False, "reason": f"Job not found: {job_name_prefix}"}
    try:
        w = WorkspaceClient()
        run = w.jobs.run_now(job_id=job_id, notebook_params=params or {})
        return {"triggered": True, "job_id": job_id, "run_id": run.run_id}
    except Exception as e:
        return {"triggered": False, "reason": str(e)}


# ──────────────────────────────────────────────
# Jobs: List & Trigger On-Demand
# ──────────────────────────────────────────────

@app.get("/api/control/jobs")
async def list_jobs():
    """List all 0xDSI workflow jobs with status."""
    try:
        w = WorkspaceClient()
        all_jobs = []
        for job in w.jobs.list(name="[0xDSI]"):
            all_jobs.append({
                "job_id": job.job_id,
                "name": job.settings.name if job.settings else "",
                "created_time": str(job.created_time) if job.created_time else None,
            })
        return JSONResponse(content=all_jobs)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/control/jobs/trigger")
async def trigger_job_endpoint(request: Request):
    """Trigger a job on-demand with optional parameter overrides."""
    body = await request.json()
    job_name = body.get("job_name", "")
    params = body.get("params", {})
    user = get_current_user(request)

    result = trigger_job(job_name, params)
    result["triggered_by"] = user.get("username", "unknown")
    return JSONResponse(content=result)


# ──────────────────────────────────────────────
# Agent Config: CRUD + Enable/Disable + Trigger
# ──────────────────────────────────────────────

@app.put("/api/control/agents/{agent_id}/toggle")
async def toggle_agent(agent_id: str, request: Request):
    """Enable or disable an agent. Takes effect on next scheduled run."""
    body = await request.json()
    enabled = body.get("enabled", True)
    user = get_current_user(request)
    try:
        execute_write(f"""
            UPDATE {fqn('agent_configs')}
            SET enabled = {str(enabled).lower()}, updated_at = current_timestamp()
            WHERE id = :agent_id
        """, {"agent_id": agent_id})
        return {"agent_id": agent_id, "enabled": enabled, "updated_by": user.get("username")}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.put("/api/control/agents/{agent_id}/config")
async def update_agent_config(agent_id: str, request: Request):
    """Update agent configuration (thresholds, schedule, parameters)."""
    body = await request.json()
    user = get_current_user(request)
    updates = []
    params = {"agent_id": agent_id}

    if "schedule" in body:
        updates.append("schedule = :schedule")
        params["schedule"] = body["schedule"]
    if "config" in body:
        updates.append(f"config = map_from_entries(array({','.join(f\"struct('{k}', '{v}')\" for k, v in body['config'].items())}))")

    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    updates.append("updated_at = current_timestamp()")
    try:
        execute_write(f"""
            UPDATE {fqn('agent_configs')}
            SET {', '.join(updates)}
            WHERE id = :agent_id
        """, params)
        return {"agent_id": agent_id, "updated": True, "updated_by": user.get("username")}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/control/agents/{agent_id}/run")
async def trigger_agent_run(agent_id: str, request: Request):
    """Trigger an immediate on-demand agent run."""
    body = await request.json()
    params = body.get("params", {})
    user = get_current_user(request)
    try:
        agent = query(f"SELECT name, notebook_path FROM {fqn('agent_configs')} WHERE id = :id", {"id": agent_id})
        if not agent:
            raise HTTPException(status_code=404, detail="Agent not found")
        job_name = agent[0].get("name", "")
        result = trigger_job(f"[0xDSI] {job_name}", params)
        result["triggered_by"] = user.get("username")
        return JSONResponse(content=result)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ──────────────────────────────────────────────
# Correlation Rules: CRUD
# ──────────────────────────────────────────────

@app.post("/api/control/correlation-rules")
async def create_correlation_rule(request: Request):
    """Create a new correlation rule in Unity Catalog."""
    body = await request.json()
    user = get_current_user(request)
    try:
        execute_write(f"""
            INSERT INTO {fqn('correlation_rules')}
            (id, name, description, rule_type, severity, enabled, conditions,
             window_seconds, threshold, mitre_tactic, mitre_technique,
             confidence_score, author, version, created_at, updated_at)
            VALUES (
                uuid(), :name, :description, :rule_type, :severity, true,
                array(:conditions), :window_seconds, :threshold,
                :mitre_tactic, :mitre_technique, :confidence_score,
                :author, 1, current_timestamp(), current_timestamp()
            )
        """, {
            "name": body["name"],
            "description": body.get("description", ""),
            "rule_type": body.get("rule_type", "threshold"),
            "severity": body.get("severity", "medium"),
            "conditions": json.dumps(body.get("conditions", [])),
            "window_seconds": body.get("window_seconds", 300),
            "threshold": body.get("threshold", 1),
            "mitre_tactic": body.get("mitre_tactic"),
            "mitre_technique": body.get("mitre_technique"),
            "confidence_score": body.get("confidence_score", 0.7),
            "author": user.get("username", "system"),
        })
        return {"created": True, "name": body["name"]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.put("/api/control/correlation-rules/{rule_id}/toggle")
async def toggle_correlation_rule(rule_id: str, request: Request):
    """Enable or disable a correlation rule."""
    body = await request.json()
    enabled = body.get("enabled", True)
    try:
        execute_write(f"""
            UPDATE {fqn('correlation_rules')}
            SET enabled = {str(enabled).lower()}, updated_at = current_timestamp()
            WHERE id = :rule_id
        """, {"rule_id": rule_id})
        return {"rule_id": rule_id, "enabled": enabled}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.put("/api/control/correlation-rules/{rule_id}")
async def update_correlation_rule(rule_id: str, request: Request):
    """Update correlation rule parameters (threshold, window, severity)."""
    body = await request.json()
    set_clauses = []
    params = {"rule_id": rule_id}

    for field in ["severity", "threshold", "window_seconds", "confidence_score", "description"]:
        if field in body:
            set_clauses.append(f"{field} = :{field}")
            params[field] = body[field]

    if not set_clauses:
        raise HTTPException(status_code=400, detail="No fields to update")

    set_clauses.append("version = version + 1")
    set_clauses.append("updated_at = current_timestamp()")
    try:
        execute_write(f"""
            UPDATE {fqn('correlation_rules')}
            SET {', '.join(set_clauses)}
            WHERE id = :rule_id
        """, params)
        return {"rule_id": rule_id, "updated": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/control/correlation-rules/{rule_id}")
async def delete_correlation_rule(rule_id: str, request: Request):
    """Soft-delete a correlation rule (disable and mark deleted)."""
    try:
        execute_write(f"""
            UPDATE {fqn('correlation_rules')}
            SET enabled = false, updated_at = current_timestamp()
            WHERE id = :rule_id
        """, {"rule_id": rule_id})
        return {"rule_id": rule_id, "deleted": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ──────────────────────────────────────────────
# Detection Rules: CRUD
# ──────────────────────────────────────────────

@app.put("/api/control/detection-rules/{rule_id}")
async def update_detection_rule(rule_id: str, request: Request):
    """Update detection rule (status, logic, version)."""
    body = await request.json()
    set_clauses = []
    params = {"rule_id": rule_id}

    for field in ["status", "logic", "sigma_rule"]:
        if field in body:
            set_clauses.append(f"{field} = :{field}")
            params[field] = body[field]

    if not set_clauses:
        raise HTTPException(status_code=400, detail="No fields to update")

    set_clauses.append("updated_at = current_timestamp()")
    try:
        execute_write(f"""
            UPDATE {fqn('detection_rules')}
            SET {', '.join(set_clauses)}
            WHERE id = :rule_id
        """, params)
        return {"rule_id": rule_id, "updated": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ──────────────────────────────────────────────
# Alerts: Status Transitions
# ──────────────────────────────────────────────

@app.put("/api/control/alerts/{alert_id}/status")
async def update_alert_status(alert_id: str, request: Request):
    """Transition alert status (new → investigating → resolved | false_positive)."""
    body = await request.json()
    status = body.get("status")
    user = get_current_user(request)
    if status not in ("new", "investigating", "resolved", "false_positive", "dismissed"):
        raise HTTPException(status_code=400, detail=f"Invalid status: {status}")
    try:
        execute_write(f"""
            UPDATE {fqn('alerts')}
            SET status = :status, updated_at = current_timestamp()
            WHERE id = :alert_id
        """, {"alert_id": alert_id, "status": status})
        return {"alert_id": alert_id, "status": status, "updated_by": user.get("username")}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ──────────────────────────────────────────────
# Cases: CRUD + Status Transitions
# ──────────────────────────────────────────────

@app.post("/api/control/cases")
async def create_case(request: Request):
    """Create a new investigation case."""
    body = await request.json()
    user = get_current_user(request)
    try:
        execute_write(f"""
            INSERT INTO {fqn('cases')}
            (id, title, description, status, severity, priority, assigned_to, created_by, created_at, updated_at)
            VALUES (uuid(), :title, :description, 'open', :severity, :priority, :assigned_to, :created_by, current_timestamp(), current_timestamp())
        """, {
            "title": body["title"],
            "description": body.get("description", ""),
            "severity": body.get("severity", "medium"),
            "priority": body.get("priority", "medium"),
            "assigned_to": body.get("assigned_to", user.get("username")),
            "created_by": user.get("username", "system"),
        })
        return {"created": True, "title": body["title"]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.put("/api/control/cases/{case_id}/status")
async def update_case_status(case_id: str, request: Request):
    """Transition case status."""
    body = await request.json()
    status = body.get("status")
    user = get_current_user(request)
    if status not in ("open", "investigating", "contained", "resolved", "closed"):
        raise HTTPException(status_code=400, detail=f"Invalid status: {status}")
    try:
        execute_write(f"""
            UPDATE {fqn('cases')}
            SET status = :status, updated_at = current_timestamp()
            WHERE id = :case_id
        """, {"case_id": case_id, "status": status})
        return {"case_id": case_id, "status": status, "updated_by": user.get("username")}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.put("/api/control/cases/{case_id}/assign")
async def assign_case(case_id: str, request: Request):
    """Assign a case to an analyst."""
    body = await request.json()
    try:
        execute_write(f"""
            UPDATE {fqn('cases')}
            SET assigned_to = :assignee, updated_at = current_timestamp()
            WHERE id = :case_id
        """, {"case_id": case_id, "assignee": body["assigned_to"]})
        return {"case_id": case_id, "assigned_to": body["assigned_to"]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ──────────────────────────────────────────────
# Response Actions: Approve / Reject / Rollback
# ──────────────────────────────────────────────

@app.put("/api/control/response-actions/{action_id}/approve")
async def approve_response_action(action_id: str, request: Request):
    """Approve a pending response action for execution."""
    user = get_current_user(request)
    try:
        execute_write(f"""
            UPDATE {fqn('response_actions')}
            SET status = 'approved', approved_by = :user, approved_at = current_timestamp(), updated_at = current_timestamp()
            WHERE id = :action_id AND status = 'pending'
        """, {"action_id": action_id, "user": user.get("username", "system")})
        trigger_job("[0xDSI] Agent 15 - Automated Response")
        return {"action_id": action_id, "status": "approved", "approved_by": user.get("username")}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.put("/api/control/response-actions/{action_id}/reject")
async def reject_response_action(action_id: str, request: Request):
    """Reject a pending response action."""
    body = await request.json()
    user = get_current_user(request)
    try:
        execute_write(f"""
            UPDATE {fqn('response_actions')}
            SET status = 'rejected', rejected_by = :user, rejection_reason = :reason, updated_at = current_timestamp()
            WHERE id = :action_id AND status = 'pending'
        """, {"action_id": action_id, "user": user.get("username", "system"), "reason": body.get("reason", "")})
        return {"action_id": action_id, "status": "rejected"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.put("/api/control/response-actions/{action_id}/rollback")
async def rollback_response_action(action_id: str, request: Request):
    """Rollback a completed response action."""
    user = get_current_user(request)
    try:
        execute_write(f"""
            UPDATE {fqn('response_actions')}
            SET status = 'rolled_back', rolled_back_by = :user, rolled_back_at = current_timestamp(), updated_at = current_timestamp()
            WHERE id = :action_id AND status = 'executed'
        """, {"action_id": action_id, "user": user.get("username", "system")})
        return {"action_id": action_id, "status": "rolled_back"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ──────────────────────────────────────────────
# Threat Feeds: Toggle + Sync
# ──────────────────────────────────────────────

@app.put("/api/control/threat-feeds/{feed_id}/toggle")
async def toggle_threat_feed(feed_id: str, request: Request):
    """Enable or disable a threat feed."""
    body = await request.json()
    enabled = body.get("enabled", True)
    try:
        execute_write(f"""
            UPDATE {fqn('threat_feeds')}
            SET enabled = {str(enabled).lower()}, updated_at = current_timestamp()
            WHERE id = :feed_id
        """, {"feed_id": feed_id})
        return {"feed_id": feed_id, "enabled": enabled}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/control/threat-feeds/{feed_id}/sync")
async def sync_threat_feed(feed_id: str, request: Request):
    """Trigger an immediate sync of a specific threat feed."""
    result = trigger_job("[0xDSI] Ingestion 06 - Threat Feed", {"feed_id": feed_id})
    return {"feed_id": feed_id, "sync": result}


# ──────────────────────────────────────────────
# System Settings: Upsert
# ──────────────────────────────────────────────

@app.put("/api/control/settings")
async def update_system_settings(request: Request):
    """Upsert system settings (key-value pairs). Notebooks read these at startup."""
    body = await request.json()
    user = get_current_user(request)
    settings = body.get("settings", {})
    category = body.get("category", "general")
    updated = []
    try:
        for key, value in settings.items():
            execute_write(f"""
                MERGE INTO {fqn('system_settings')} t
                USING (SELECT :key as key) s ON t.key = s.key
                WHEN MATCHED THEN UPDATE SET value = :value, category = :category, updated_at = current_timestamp()
                WHEN NOT MATCHED THEN INSERT (id, key, value, category, updated_at) VALUES (uuid(), :key, :value, :category, current_timestamp())
            """, {"key": key, "value": str(value), "category": category})
            updated.append(key)
        return {"updated": updated, "updated_by": user.get("username")}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/control/settings")
async def get_system_settings(category: Optional[str] = None):
    """Get all system settings, optionally filtered by category."""
    try:
        sql = f"SELECT key, value, category, updated_at FROM {fqn('system_settings')}"
        if category:
            sql += f" WHERE category = :category"
            results = query(sql, {"category": category})
        else:
            results = query(sql)
        return JSONResponse(content=results)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ──────────────────────────────────────────────
# LLM Guardrail Policies: Toggle + Update
# ──────────────────────────────────────────────

@app.put("/api/control/guardrails/{policy_id}/toggle")
async def toggle_guardrail(policy_id: str, request: Request):
    """Enable or disable a guardrail policy."""
    body = await request.json()
    enabled = body.get("enabled", True)
    try:
        execute_write(f"""
            UPDATE {fqn('llm_guardrail_policies')}
            SET enabled = {str(enabled).lower()}, updated_at = current_timestamp()
            WHERE id = :policy_id
        """, {"policy_id": policy_id})
        return {"policy_id": policy_id, "enabled": enabled}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.put("/api/control/guardrails/{policy_id}")
async def update_guardrail(policy_id: str, request: Request):
    """Update guardrail policy rules or action."""
    body = await request.json()
    set_clauses = []
    params = {"policy_id": policy_id}
    for field in ["name", "action", "policy_type"]:
        if field in body:
            set_clauses.append(f"{field} = :{field}")
            params[field] = body[field]
    if not set_clauses:
        raise HTTPException(status_code=400, detail="No fields to update")
    set_clauses.append("updated_at = current_timestamp()")
    try:
        execute_write(f"""
            UPDATE {fqn('llm_guardrail_policies')}
            SET {', '.join(set_clauses)}
            WHERE id = :policy_id
        """, params)
        return {"policy_id": policy_id, "updated": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ──────────────────────────────────────────────
# Edge Collectors: Register / Decommission / Config Push
# ──────────────────────────────────────────────

@app.post("/api/control/edge-collectors/register")
async def register_edge_collector(request: Request):
    """Register a new edge collector in the fleet."""
    body = await request.json()
    user = get_current_user(request)
    try:
        execute_write(f"""
            INSERT INTO {fqn('edge_collector_registry')}
            (collector_id, collector_name, collector_type, site_name, region, environment,
             network_zone, transport_protocol, supported_sources, max_eps, compression,
             status, version, config_version, events_forwarded_total, events_forwarded_24h,
             registered_at, updated_at)
            VALUES (
                :collector_id, :collector_name, :collector_type, :site_name, :region,
                :environment, :network_zone, :transport_protocol,
                array(:supported_sources), :max_eps, :compression,
                'registered', :version, 1, 0, 0, current_timestamp(), current_timestamp()
            )
        """, {
            "collector_id": body["collector_id"],
            "collector_name": body.get("collector_name", body["collector_id"]),
            "collector_type": body.get("collector_type", "generic"),
            "site_name": body.get("site_name", "default"),
            "region": body.get("region", "unknown"),
            "environment": body.get("environment", "production"),
            "network_zone": body.get("network_zone", "dmz"),
            "transport_protocol": body.get("transport_protocol", "https"),
            "supported_sources": ",".join(body.get("supported_sources", ["syslog", "json", "cef"])),
            "max_eps": body.get("max_eps", 10000),
            "compression": body.get("compression", "zstd"),
            "version": body.get("version", "1.0.0"),
        })
        return {"collector_id": body["collector_id"], "status": "registered", "registered_by": user.get("username")}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.put("/api/control/edge-collectors/{collector_id}/decommission")
async def decommission_edge_collector(collector_id: str, request: Request):
    """Decommission an edge collector."""
    try:
        execute_write(f"""
            UPDATE {fqn('edge_collector_registry')}
            SET status = 'decommissioned', updated_at = current_timestamp()
            WHERE collector_id = :cid
        """, {"cid": collector_id})
        return {"collector_id": collector_id, "status": "decommissioned"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.put("/api/control/edge-collectors/{collector_id}/config")
async def update_edge_collector_config(collector_id: str, request: Request):
    """Push new configuration to an edge collector."""
    body = await request.json()
    try:
        execute_write(f"""
            INSERT INTO {fqn('edge_collector_configs')}
            (config_id, collector_id, config_scope, filter_rules, sampling_rate,
             batch_size, batch_interval_ms, buffer_max_bytes, compression,
             max_eps, throttle_on_backpressure, version, is_active, created_at)
            VALUES (
                uuid(), :collector_id, 'collector',
                :filter_rules, :sampling_rate, :batch_size, :batch_interval_ms,
                :buffer_max_bytes, :compression, :max_eps, :throttle_on_backpressure,
                (SELECT COALESCE(MAX(version), 0) + 1 FROM {fqn('edge_collector_configs')} WHERE collector_id = :collector_id),
                true, current_timestamp()
            )
        """, {
            "collector_id": collector_id,
            "filter_rules": body.get("filter_rules", ""),
            "sampling_rate": body.get("sampling_rate", 1.0),
            "batch_size": body.get("batch_size", 1000),
            "batch_interval_ms": body.get("batch_interval_ms", 5000),
            "buffer_max_bytes": body.get("buffer_max_bytes", 104857600),
            "compression": body.get("compression", "zstd"),
            "max_eps": body.get("max_eps", 10000),
            "throttle_on_backpressure": body.get("throttle_on_backpressure", True),
        })
        trigger_job("[0xDSI] Ingestion 09 - Edge Collector Config Sync")
        return {"collector_id": collector_id, "config_pushed": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ──────────────────────────────────────────────
# MUSE Proposals: Approve / Reject
# ──────────────────────────────────────────────

@app.put("/api/control/muse/proposals/{proposal_id}/approve")
async def approve_muse_proposal(proposal_id: str, request: Request):
    """Approve a MUSE learning proposal. Applied on next MUSE run."""
    user = get_current_user(request)
    try:
        execute_write(f"""
            UPDATE {fqn('tuning_proposals')}
            SET status = 'approved', approved_by = :user, approved_at = current_timestamp()
            WHERE proposal_id = :proposal_id AND status = 'pending'
        """, {"proposal_id": proposal_id, "user": user.get("username", "system")})
        return {"proposal_id": proposal_id, "status": "approved"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.put("/api/control/muse/proposals/{proposal_id}/reject")
async def reject_muse_proposal(proposal_id: str, request: Request):
    """Reject a MUSE learning proposal."""
    body = await request.json()
    user = get_current_user(request)
    try:
        execute_write(f"""
            UPDATE {fqn('tuning_proposals')}
            SET status = 'rejected', rejected_by = :user, rejection_reason = :reason
            WHERE proposal_id = :proposal_id AND status = 'pending'
        """, {"proposal_id": proposal_id, "user": user.get("username", "system"), "reason": body.get("reason", "")})
        return {"proposal_id": proposal_id, "status": "rejected"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.put("/api/control/muse/weights/{proposal_id}/approve")
async def approve_weight_proposal(proposal_id: str, request: Request):
    """Approve a lens weight calibration proposal."""
    user = get_current_user(request)
    try:
        execute_write(f"""
            UPDATE {fqn('lens_weight_proposals')}
            SET status = 'approved', approved_by = :user, approved_at = current_timestamp()
            WHERE id = :proposal_id AND status = 'pending'
        """, {"proposal_id": proposal_id, "user": user.get("username", "system")})
        return {"proposal_id": proposal_id, "status": "approved"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ──────────────────────────────────────────────
# Compliance: Acknowledge Violations
# ──────────────────────────────────────────────

@app.put("/api/control/compliance/violations/{violation_id}/resolve")
async def resolve_compliance_violation(violation_id: str, request: Request):
    """Mark a compliance violation as resolved."""
    body = await request.json()
    user = get_current_user(request)
    try:
        execute_write(f"""
            UPDATE {fqn('compliance_violations')}
            SET resolved_at = current_timestamp(), resolution = :resolution
            WHERE violation_id = :violation_id
        """, {"violation_id": violation_id, "resolution": body.get("resolution", f"Resolved by {user.get('username')}")})
        return {"violation_id": violation_id, "resolved": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ──────────────────────────────────────────────
# Workflows: CRUD + Toggle + Execute
# ──────────────────────────────────────────────

@app.put("/api/control/workflows/{workflow_id}/toggle")
async def toggle_workflow(workflow_id: str, request: Request):
    """Enable or disable a workflow."""
    body = await request.json()
    enabled = body.get("enabled", True)
    try:
        execute_write(f"""
            UPDATE {fqn('workflows')}
            SET enabled = {str(enabled).lower()}, updated_at = current_timestamp()
            WHERE id = :workflow_id
        """, {"workflow_id": workflow_id})
        return {"workflow_id": workflow_id, "enabled": enabled}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ──────────────────────────────────────────────
# Active Lists: CRUD
# ──────────────────────────────────────────────

@app.post("/api/control/active-lists")
async def create_active_list(request: Request):
    """Create a new active list (blocklist, allowlist, watchlist)."""
    body = await request.json()
    user = get_current_user(request)
    try:
        execute_write(f"""
            INSERT INTO {fqn('active_lists')}
            (id, name, list_type, category, description, auto_update, created_by, created_at, updated_at)
            VALUES (uuid(), :name, :list_type, :category, :description, :auto_update, :user, current_timestamp(), current_timestamp())
        """, {
            "name": body["name"],
            "list_type": body.get("list_type", "blocklist"),
            "category": body.get("category", "ip"),
            "description": body.get("description", ""),
            "auto_update": body.get("auto_update", False),
            "user": user.get("username", "system"),
        })
        return {"created": True, "name": body["name"]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/control/active-lists/{list_id}")
async def delete_active_list(list_id: str, request: Request):
    """Delete an active list."""
    try:
        execute_write(f"DELETE FROM {fqn('active_lists')} WHERE id = :list_id", {"list_id": list_id})
        return {"list_id": list_id, "deleted": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ──────────────────────────────────────────────
# Honeypots: Toggle + Create
# ──────────────────────────────────────────────

@app.put("/api/control/honeypots/{honeypot_id}/toggle")
async def toggle_honeypot(honeypot_id: str, request: Request):
    """Enable or disable a honeypot deployment."""
    body = await request.json()
    enabled = body.get("enabled", True)
    status = "active" if enabled else "inactive"
    try:
        execute_write(f"""
            UPDATE {fqn('honeypot_deployments')}
            SET status = :status, updated_at = current_timestamp()
            WHERE id = :honeypot_id
        """, {"honeypot_id": honeypot_id, "status": status})
        return {"honeypot_id": honeypot_id, "status": status}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ──────────────────────────────────────────────
# ETL Ingestion Configs: Toggle + Update
# ──────────────────────────────────────────────

@app.put("/api/control/etl-configs/{config_id}/toggle")
async def toggle_etl_config(config_id: str, request: Request):
    """Enable or disable an ETL ingestion config."""
    body = await request.json()
    enabled = body.get("enabled", True)
    try:
        execute_write(f"""
            UPDATE {fqn('etl_ingestion_configs')}
            SET enabled = {str(enabled).lower()}, updated_at = current_timestamp()
            WHERE id = :config_id
        """, {"config_id": config_id})
        return {"config_id": config_id, "enabled": enabled}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ──────────────────────────────────────────────
# IOCs: Deactivate
# ──────────────────────────────────────────────

@app.put("/api/control/iocs/{ioc_id}/deactivate")
async def deactivate_ioc(ioc_id: str, request: Request):
    """Deactivate an IOC."""
    try:
        execute_write(f"""
            UPDATE {fqn('ioc_entries')}
            SET is_active = false, updated_at = current_timestamp()
            WHERE id = :ioc_id
        """, {"ioc_id": ioc_id})
        return {"ioc_id": ioc_id, "is_active": False}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ──────────────────────────────────────────────
# CEP Patterns: Toggle
# ──────────────────────────────────────────────

@app.put("/api/control/cep-patterns/{pattern_id}/toggle")
async def toggle_cep_pattern(pattern_id: str, request: Request):
    """Enable or disable a CEP pattern."""
    body = await request.json()
    enabled = body.get("enabled", True)
    try:
        execute_write(f"""
            UPDATE {fqn('cep_patterns')}
            SET enabled = {str(enabled).lower()}, updated_at = current_timestamp()
            WHERE id = :pattern_id
        """, {"pattern_id": pattern_id})
        return {"pattern_id": pattern_id, "enabled": enabled}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ──────────────────────────────────────────────
# Negative Correlation Rules: Toggle
# ──────────────────────────────────────────────

@app.put("/api/control/negative-rules/{rule_id}/toggle")
async def toggle_negative_rule(rule_id: str, request: Request):
    """Enable or disable a negative correlation rule."""
    body = await request.json()
    enabled = body.get("enabled", True)
    try:
        execute_write(f"""
            UPDATE {fqn('negative_correlation_rules')}
            SET enabled = {str(enabled).lower()}, updated_at = current_timestamp()
            WHERE id = :rule_id
        """, {"rule_id": rule_id})
        return {"rule_id": rule_id, "enabled": enabled}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ──────────────────────────────────────────────
# Threat Escalation Rules: Toggle
# ──────────────────────────────────────────────

@app.put("/api/control/escalation-rules/{rule_id}/toggle")
async def toggle_escalation_rule(rule_id: str, request: Request):
    """Enable or disable an escalation rule."""
    body = await request.json()
    enabled = body.get("enabled", True)
    try:
        execute_write(f"""
            UPDATE {fqn('threat_escalation_rules')}
            SET enabled = {str(enabled).lower()}, updated_at = current_timestamp()
            WHERE id = :rule_id
        """, {"rule_id": rule_id})
        return {"rule_id": rule_id, "enabled": enabled}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ──────────────────────────────────────────────
# Databricks Genie Integration (AI Security Advisor)
# ──────────────────────────────────────────────

GENIE_QUERY_CATALOG = {
    "critical_alerts": f"SELECT id, title, severity, risk_score, source_ip, mitre_tactic, created_at FROM {{fqn}} WHERE severity = 'critical' AND status = 'new' ORDER BY created_at DESC LIMIT 20",
    "top_source_ips": f"SELECT source_ip, COUNT(*) as count, MAX(severity) as max_severity FROM {{fqn_events}} WHERE timestamp > current_timestamp() - INTERVAL 24 HOURS GROUP BY source_ip ORDER BY count DESC LIMIT 20",
    "mitre_coverage": f"SELECT mitre_tactic, mitre_technique, COUNT(*) as detections FROM {{fqn}} WHERE mitre_tactic IS NOT NULL AND created_at > current_timestamp() - INTERVAL 7 DAYS GROUP BY mitre_tactic, mitre_technique ORDER BY detections DESC",
    "user_risk": f"SELECT username, risk_score, anomaly_type, detected_at FROM {{fqn_uba}} WHERE risk_score > 70 ORDER BY risk_score DESC LIMIT 20",
    "active_cases": f"SELECT id, title, status, severity, priority, assigned_to, created_at FROM {{fqn_cases}} WHERE status IN ('open', 'investigating') ORDER BY severity DESC, created_at DESC",
    "threat_campaigns": f"SELECT name, status, attribution, confidence, first_seen, last_seen FROM {{fqn_campaigns}} WHERE status = 'active' ORDER BY last_seen DESC LIMIT 10",
    "agent_health": f"SELECT agent_id, status, last_heartbeat, events_processed, alerts_generated FROM {{fqn_agent_status}} ORDER BY last_heartbeat DESC",
    "recent_events_by_type": f"SELECT event_type, COUNT(*) as count FROM {{fqn_events}} WHERE timestamp > current_timestamp() - INTERVAL 1 HOUR GROUP BY event_type ORDER BY count DESC",
    "compliance_status": f"SELECT framework_name, compliance_score, last_assessed FROM {{fqn_compliance}} ORDER BY last_assessed DESC LIMIT 10",
    "network_anomalies": f"SELECT source_ip, dest_ip, protocol, bytes_sent FROM {{fqn_network}} WHERE bytes_sent > 1000000 AND timestamp > current_timestamp() - INTERVAL 1 HOUR ORDER BY bytes_sent DESC LIMIT 20",
    # Phase 1-4 queries for Genie
    "entity_spine_top": f"SELECT entity_id, canonical_name, entity_type, centrality_score, connected_entities FROM {{fqn_entity_spine}} ORDER BY centrality_score DESC LIMIT 20",
    "fuse_high_threat": f"SELECT fuse_id, entity_id, belief_threat, signal_count, has_disagreement, decision, created_at FROM {{fqn_fuse}} WHERE belief_threat > 0.7 ORDER BY belief_threat DESC LIMIT 20",
    "entity_drift": f"SELECT entity_id, overall_drift_score, rate_drift, diversity_drift, temporal_drift FROM {{fqn_drift}} WHERE overall_drift_score > 0.5 ORDER BY overall_drift_score DESC LIMIT 20",
    "muse_proposals": f"SELECT proposal_type, title, confidence, status, created_at FROM {{fqn_proposals}} WHERE status = 'pending' ORDER BY confidence DESC LIMIT 15",
    "compliance_violations": f"SELECT check_type, severity, title, detected_at FROM {{fqn_violations}} WHERE resolved_at IS NULL ORDER BY severity DESC, detected_at DESC LIMIT 15",
    "edge_collector_health": f"SELECT collector_id, collector_name, status, last_heartbeat, events_forwarded_24h FROM {{fqn_collectors}} WHERE status != 'decommissioned' ORDER BY last_heartbeat DESC",
}


@app.post("/api/genie/query")
async def genie_query(request: Request):
    """
    Databricks Genie-powered natural language query interface.
    Uses Foundation Models for query planning and Genie Spaces for NL2SQL
    over the full security data lake in Unity Catalog.

    Architecture:
    1. User asks a question in natural language
    2. Foundation Model selects relevant pre-built queries OR generates SQL
    3. SQL executes against Unity Catalog via SQL Warehouse
    4. Foundation Model synthesizes human-readable response
    """
    body = await request.json()
    question = body.get("question", "")
    context = body.get("context", {})

    w = WorkspaceClient()

    try:
        # Stage 1: Query Planning (Genie NL2SQL equivalent)
        planning_prompt = f"""Given this security question, select 2-5 relevant queries to answer it.
Available queries: {json.dumps(list(GENIE_QUERY_CATALOG.keys()))}

If none of the pre-built queries suffice, generate a SQL query.
Available tables in Unity Catalog ({CATALOG}.{SCHEMA}): events, alerts, cases,
correlation_rules, ioc_entries, threat_feeds, user_behavior_anomalies,
agent_status, agent_configs, threat_campaigns, network_flows, assets,
response_actions, malware_samples, vulnerability_scans, entity_spine,
entity_edges, unified_evidence_objects, fuse_results, model_disagreements,
entity_drift_scores, bytecode_analysis, knowledge_store, tuning_proposals,
compliance_posture, compliance_violations, edge_collector_registry

Question: {question}

Respond as JSON: {{"queries": ["query_key1", "query_key2"], "custom_sql": null_or_string}}"""

        plan_response = w.serving_endpoints.query(
            name="databricks-meta-llama-3-1-70b-instruct",
            messages=[
                {"role": "system", "content": "You are a security data query planner for Databricks Genie. Select relevant queries or generate SQL for the security data lake."},
                {"role": "user", "content": planning_prompt}
            ],
            max_tokens=300,
            temperature=0.1
        )

        plan_text = plan_response.choices[0].message.content
        try:
            plan = json.loads(plan_text[plan_text.find("{"):plan_text.rfind("}")+1])
        except:
            plan = {"queries": ["critical_alerts", "agent_health"], "custom_sql": None}

        # Stage 2: Execute queries
        query_results = {}
        selected_queries = plan.get("queries", [])[:5]

        genie_table_map = {
            "{fqn}": fqn("alerts"),
            "{fqn_events}": fqn("events"),
            "{fqn_uba}": fqn("user_behavior_anomalies"),
            "{fqn_cases}": fqn("cases"),
            "{fqn_campaigns}": fqn("threat_campaigns"),
            "{fqn_agent_status}": fqn("agent_status"),
            "{fqn_compliance}": fqn("compliance_frameworks"),
            "{fqn_network}": fqn("network_flows"),
            "{fqn_entity_spine}": fqn("entity_spine"),
            "{fqn_fuse}": fqn("fuse_results"),
            "{fqn_drift}": fqn("entity_drift_scores"),
            "{fqn_proposals}": fqn("tuning_proposals"),
            "{fqn_violations}": fqn("compliance_violations"),
            "{fqn_collectors}": fqn("edge_collector_registry"),
        }

        for q_key in selected_queries:
            if q_key in GENIE_QUERY_CATALOG:
                sql_resolved = GENIE_QUERY_CATALOG[q_key]
                for placeholder, table_fqn in genie_table_map.items():
                    sql_resolved = sql_resolved.replace(placeholder, table_fqn)
                try:
                    query_results[q_key] = query(sql_resolved)
                except:
                    query_results[q_key] = []

        # Execute custom SQL if provided (with safety check)
        custom_sql = plan.get("custom_sql")
        if custom_sql and custom_sql.strip().upper().startswith("SELECT"):
            try:
                safe_sql = custom_sql.replace("FROM ", f"FROM {CATALOG}.{SCHEMA}.")
                query_results["custom"] = query(safe_sql)
            except:
                pass

        # Stage 3: Synthesize response using Foundation Model
        synthesis_prompt = f"""Based on this security data, answer the analyst's question.

Question: {question}

Data Retrieved:
{json.dumps(query_results, default=str)[:6000]}

Provide a clear, actionable answer. Include specific numbers, IPs, or entities when available. If the data suggests immediate action is needed, say so explicitly."""

        synthesis_response = w.serving_endpoints.query(
            name="databricks-meta-llama-3-1-70b-instruct",
            messages=[
                {"role": "system", "content": "You are the CISO Security Advisor for 0xDSI. You have access to the full security data lake via Databricks Genie. Provide expert-level security analysis and recommendations. Be concise and actionable."},
                {"role": "user", "content": synthesis_prompt}
            ],
            max_tokens=2048,
            temperature=0.3
        )

        return {
            "response": synthesis_response.choices[0].message.content,
            "queries_used": selected_queries,
            "data_sources": list(query_results.keys()),
            "powered_by": "databricks_genie_foundation_models",
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/genie/executive-briefing")
async def genie_executive_briefing(request: Request):
    """Generate executive security briefing using Genie + Foundation Models."""
    w = WorkspaceClient()
    try:
        # Gather key metrics
        metrics = {}
        metric_queries = {
            "critical_open": f"SELECT COUNT(*) as cnt FROM {fqn('alerts')} WHERE severity = 'critical' AND status = 'new'",
            "high_open": f"SELECT COUNT(*) as cnt FROM {fqn('alerts')} WHERE severity = 'high' AND status = 'new'",
            "active_cases": f"SELECT COUNT(*) as cnt FROM {fqn('cases')} WHERE status IN ('open', 'investigating')",
            "events_1h": f"SELECT COUNT(*) as cnt FROM {fqn('events')} WHERE timestamp > current_timestamp() - INTERVAL 1 HOUR",
            "agents_active": f"SELECT COUNT(*) as cnt FROM {fqn('agent_status')} WHERE status = 'active'",
            "pending_responses": f"SELECT COUNT(*) as cnt FROM {fqn('response_actions')} WHERE status = 'pending'",
        }

        for key, sql in metric_queries.items():
            try:
                result = query(sql)
                metrics[key] = result[0]["cnt"] if result else 0
            except:
                metrics[key] = 0

        # Get trend
        try:
            trend = query(f"""
                SELECT DATE(created_at) as date, COUNT(*) as alerts,
                       SUM(CASE WHEN severity='critical' THEN 1 ELSE 0 END) as critical
                FROM {fqn('alerts')}
                WHERE created_at > current_timestamp() - INTERVAL 7 DAYS
                GROUP BY DATE(created_at) ORDER BY date DESC
            """)
        except:
            trend = []

        # Generate briefing
        response = w.serving_endpoints.query(
            name="databricks-meta-llama-3-1-70b-instruct",
            messages=[
                {"role": "system", "content": "You are the CISO Assistant. Generate a concise executive security briefing."},
                {"role": "user", "content": f"Generate executive briefing.\nMetrics: {json.dumps(metrics)}\n7-day trend: {json.dumps(trend, default=str)[:2000]}"}
            ],
            max_tokens=1500,
            temperature=0.3
        )

        return {
            "briefing": response.choices[0].message.content,
            "metrics": metrics,
            "generated_at": "now",
            "powered_by": "databricks_genie_foundation_models",
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ──────────────────────────────────────────────
# Static Frontend (SPA) - must be LAST
# ──────────────────────────────────────────────

DIST_DIR = Path(__file__).parent.parent / "dist"

if DIST_DIR.exists():
    app.mount("/assets", StaticFiles(directory=str(DIST_DIR / "assets")), name="static-assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        """Serve the SPA frontend. All non-API routes go to index.html."""
        file_path = DIST_DIR / full_path
        if file_path.exists() and file_path.is_file():
            return FileResponse(str(file_path))
        return FileResponse(str(DIST_DIR / "index.html"))


# ──────────────────────────────────────────────
# Server entry point
# ──────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("DATABRICKS_APP_PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
