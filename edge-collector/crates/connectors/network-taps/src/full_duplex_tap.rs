use async_trait::async_trait;
use anyhow::Result;
use oxdsi_core::{Collector, RawEvent};
use oxdsi_core::config::ConnectorConfig;

pub struct FullDuplexTapCollector {
    config: Option<ConnectorConfig>,
}
impl FullDuplexTapCollector {
    pub fn new() -> Self { Self { config: None } }
}
#[async_trait]
impl Collector for FullDuplexTapCollector {
    fn id(&self) -> &str { "tap-1" }
    fn connector_type(&self) -> &str { "full_duplex_tap" }
    fn vendor(&self) -> &str { "0xDSI" }
    fn category(&self) -> &str { "network_taps" }
    async fn initialize(&mut self, config: ConnectorConfig) -> Result<()> { self.config = Some(config); Ok(()) }
    async fn collect(&mut self) -> Result<Vec<RawEvent>> { Ok(vec![]) }
    async fn health_check(&self) -> Result<bool> { Ok(true) }
    async fn shutdown(&mut self) -> Result<()> { Ok(()) }
    fn supported_protocols(&self) -> Vec<&str> { vec!["10GbE TAP", "40GbE TAP", "100GbE TAP", "Full-Duplex Passive"] }
}
