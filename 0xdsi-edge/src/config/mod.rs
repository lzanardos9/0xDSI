use anyhow::{Context, Result};
use serde::Deserialize;
use std::path::Path;

#[derive(Debug, Clone, Deserialize)]
pub struct AppConfig {
    pub pipeline: PipelineConfig,
    pub buffer: BufferConfig,
    pub shipper: ShipperConfig,
    pub control: ControlConfig,
    pub connectors: Vec<ConnectorConfig>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct PipelineConfig {
    #[serde(default = "default_channel_capacity")]
    pub channel_capacity: usize,
    #[serde(default = "default_batch_size")]
    pub batch_size: usize,
    #[serde(default = "default_flush_interval_ms")]
    pub flush_interval_ms: u64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct BufferConfig {
    #[serde(default = "default_buffer_path")]
    pub path: String,
    #[serde(default = "default_max_buffer_size_mb")]
    pub max_size_mb: u64,
    #[serde(default)]
    pub compression: bool,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ShipperConfig {
    pub transport: TransportType,
    pub kafka: Option<KafkaConfig>,
    pub eventhub: Option<EventHubConfig>,
    pub https: Option<HttpsConfig>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TransportType {
    Kafka,
    EventHub,
    Https,
}

#[derive(Debug, Clone, Deserialize)]
pub struct KafkaConfig {
    pub brokers: Vec<String>,
    pub topic: String,
    pub security_protocol: Option<String>,
    pub sasl_mechanism: Option<String>,
    pub sasl_username: Option<String>,
    pub sasl_password: Option<String>,
    pub compression: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct EventHubConfig {
    pub connection_string: String,
    pub namespace: String,
    pub hub_name: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct HttpsConfig {
    pub endpoint: String,
    pub auth_token: String,
    pub batch_size: Option<usize>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ControlConfig {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default = "default_control_port")]
    pub port: u16,
    pub auth_token: Option<String>,
    pub tls_cert: Option<String>,
    pub tls_key: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ConnectorConfig {
    pub id: String,
    pub connector_type: String,
    pub enabled: bool,
    #[serde(default)]
    pub params: toml::Table,
}

fn default_channel_capacity() -> usize { 100_000 }
fn default_batch_size() -> usize { 1000 }
fn default_flush_interval_ms() -> u64 { 1000 }
fn default_buffer_path() -> String { "/var/lib/0xdsi-edge/buffer".into() }
fn default_max_buffer_size_mb() -> u64 { 512 }
fn default_control_port() -> u16 { 9443 }

pub fn load(path: &Path) -> Result<AppConfig> {
    let content = std::fs::read_to_string(path)
        .with_context(|| format!("Failed to read config from {}", path.display()))?;
    let config: AppConfig = toml::from_str(&content)
        .with_context(|| "Failed to parse config TOML")?;
    Ok(config)
}
