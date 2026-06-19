use anyhow::Result;
use axum::{routing::get, Router, Json};
use serde::Serialize;
use tracing::info;

use crate::config::ControlConfig;

#[derive(Serialize)]
struct HealthResponse {
    status: &'static str,
    version: &'static str,
    uptime_seconds: u64,
}

#[derive(Serialize)]
struct MetricsResponse {
    events_received: u64,
    events_shipped: u64,
    events_buffered: u64,
    connectors_active: u32,
    buffer_size_bytes: u64,
}

async fn health() -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "healthy",
        version: env!("CARGO_PKG_VERSION"),
        uptime_seconds: 0,
    })
}

async fn metrics() -> Json<MetricsResponse> {
    Json(MetricsResponse {
        events_received: 0,
        events_shipped: 0,
        events_buffered: 0,
        connectors_active: 0,
        buffer_size_bytes: 0,
    })
}

pub async fn serve(config: ControlConfig) -> Result<()> {
    let app = Router::new()
        .route("/health", get(health))
        .route("/metrics", get(metrics))
        .route("/api/v1/status", get(health));

    let addr = format!("0.0.0.0:{}", config.port);
    info!(addr = %addr, "Control plane listening");

    let listener = tokio::net::TcpListener::bind(&addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}
