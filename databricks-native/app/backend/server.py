"""
0xDSI Agentic SOC - Databricks Native Backend
FastAPI server that queries Unity Catalog via SQL Warehouse.
Replaces Supabase as the data layer.
"""

import os
import json
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
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
# Generic table endpoint - replaces supabase.from('table').select()
# ──────────────────────────────────────────────

ALLOWED_TABLES = [
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
]


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


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("DATABRICKS_APP_PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
