use serde::Serialize;
use chrono::{DateTime, Utc};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize)]
pub struct HealthStatus {
    pub agent_id: String,
    pub status: AgentStatus,
    pub uptime_secs: u64,
    pub connectors: Vec<ConnectorHealth>,
    pub transport: TransportHealth,
    pub buffer: BufferHealth,
    pub system: SystemHealth,
    pub checked_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum AgentStatus {
    Healthy,
    Degraded,
    Unhealthy,
    Starting,
}

#[derive(Debug, Clone, Serialize)]
pub struct ConnectorHealth {
    pub id: String,
    pub connector_type: String,
    pub status: AgentStatus,
    pub events_collected: u64,
    pub last_event_at: Option<DateTime<Utc>>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct TransportHealth {
    pub connected: bool,
    pub events_shipped: u64,
    pub events_pending: u64,
    pub last_ship_at: Option<DateTime<Utc>>,
    pub errors: u64,
}

#[derive(Debug, Clone, Serialize)]
pub struct BufferHealth {
    pub used_mb: u64,
    pub max_mb: u64,
    pub utilization_pct: f64,
}

#[derive(Debug, Clone, Serialize)]
pub struct SystemHealth {
    pub cpu_pct: f64,
    pub memory_mb: u64,
    pub disk_free_mb: u64,
}
