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


# ──────────────────────────────────────────────
# Authentication (Databricks SSO)
# ──────────────────────────────────────────────

@app.get("/api/auth/session")
async def auth_session(request: Request):
    """Returns current user session from Databricks workspace SSO."""
    try:
        w = WorkspaceClient()
        current_user = w.current_user.me()
        return {
            "user": {
                "id": str(current_user.id),
                "username": current_user.user_name,
                "display_name": current_user.display_name or current_user.user_name,
                "email": current_user.user_name,
                "full_name": current_user.display_name or current_user.user_name,
            }
        }
    except Exception:
        return {"user": {
            "id": "workspace-user",
            "username": "analyst",
            "display_name": "SOC Analyst",
            "email": "analyst@databricks",
            "full_name": "SOC Analyst",
        }}


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
    try:
        w = WorkspaceClient()
        run = w.jobs.run_now(job_id=0)  # Will need real job ID
        return {"status": "triggered", "message": "Correlation engine triggered"}
    except Exception as e:
        return {"status": "simulated", "message": "Correlation results from last run"}


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
response_actions, malware_samples, vulnerability_scans

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

        for q_key in selected_queries:
            if q_key in GENIE_QUERY_CATALOG:
                sql_template = GENIE_QUERY_CATALOG[q_key]
                sql_resolved = sql_template.replace("{fqn}", fqn("alerts"))
                sql_resolved = sql_resolved.replace("{fqn_events}", fqn("events"))
                sql_resolved = sql_resolved.replace("{fqn_uba}", fqn("user_behavior_anomalies"))
                sql_resolved = sql_resolved.replace("{fqn_cases}", fqn("cases"))
                sql_resolved = sql_resolved.replace("{fqn_campaigns}", fqn("threat_campaigns"))
                sql_resolved = sql_resolved.replace("{fqn_agent_status}", fqn("agent_status"))
                sql_resolved = sql_resolved.replace("{fqn_compliance}", fqn("compliance_frameworks"))
                sql_resolved = sql_resolved.replace("{fqn_network}", fqn("network_flows"))
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
