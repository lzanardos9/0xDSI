use async_trait::async_trait;
use anyhow::Result;
use oxdsi_core::{Collector, RawEvent};
use oxdsi_core::config::ConnectorConfig;

pub struct IcsPassiveTapCollector {
    config: Option<ConnectorConfig>,
}
impl IcsPassiveTapCollector {
    pub fn new() -> Self { Self { config: None } }
}
#[async_trait]
impl Collector for IcsPassiveTapCollector {
    fn id(&self) -> &str { "tap-4" }
    fn connector_type(&self) -> &str { "ics_passive_tap" }
    fn vendor(&self) -> &str { "0xDSI" }
    fn category(&self) -> &str { "network_taps" }
    async fn initialize(&mut self, config: ConnectorConfig) -> Result<()> { self.config = Some(config); Ok(()) }
    async fn collect(&mut self) -> Result<Vec<RawEvent>> { Ok(vec![]) }
    async fn health_check(&self) -> Result<bool> { Ok(true) }
    async fn shutdown(&mut self) -> Result<()> { Ok(()) }
    fn supported_protocols(&self) -> Vec<&str> { vec!["Serial TAP (RS-232/485)", "Industrial Ethernet TAP", "Passive Modbus/S7"] }
}
