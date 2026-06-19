use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EdgeConfig {
    pub agent: AgentConfig,
    pub transport: TransportConfig,
    pub buffer: BufferConfig,
    pub connectors: Vec<ConnectorConfig>,
    pub control_plane: ControlPlaneConfig,
    pub tls: TlsConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentConfig {
    pub id: String,
    pub name: String,
    pub site: String,
    pub log_level: String,
    pub metrics_port: u16,
    pub health_port: u16,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransportConfig {
    pub kind: TransportKind,
    pub kafka: Option<KafkaConfig>,
    pub eventhub: Option<EventHubConfig>,
    pub http: Option<HttpConfig>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TransportKind {
    Kafka,
    EventHub,
    Http,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KafkaConfig {
    pub brokers: Vec<String>,
    pub topic_prefix: String,
    pub compression: String,
    pub batch_size: usize,
    pub linger_ms: u64,
    pub sasl_mechanism: Option<String>,
    pub sasl_username: Option<String>,
    pub sasl_password: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EventHubConfig {
    pub connection_string: String,
    pub namespace: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HttpConfig {
    pub endpoint: String,
    pub auth_token: String,
    pub batch_size: usize,
    pub timeout_secs: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BufferConfig {
    pub path: PathBuf,
    pub max_size_mb: u64,
    pub flush_interval_secs: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectorConfig {
    pub id: String,
    pub connector_type: String,
    pub enabled: bool,
    pub protocol: String,
    pub poll_interval_secs: u64,
    pub params: HashMap<String, serde_json::Value>,
    #[serde(default)]
    pub filters: Vec<FilterConfig>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FilterConfig {
    pub field: String,
    pub op: String,
    pub value: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ControlPlaneConfig {
    pub enabled: bool,
    pub grpc_endpoint: String,
    pub heartbeat_secs: u64,
    pub config_refresh_secs: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TlsConfig {
    pub ca_cert: Option<PathBuf>,
    pub client_cert: Option<PathBuf>,
    pub client_key: Option<PathBuf>,
    pub skip_verify: bool,
}
