use async_trait::async_trait;
use anyhow::Result;
use oxdsi_core::{Collector, RawEvent};
use oxdsi_core::config::ConnectorConfig;

pub struct WirelessMonitorCollector {
    config: Option<ConnectorConfig>,
}
impl WirelessMonitorCollector {
    pub fn new() -> Self { Self { config: None } }
}
#[async_trait]
impl Collector for WirelessMonitorCollector {
    fn id(&self) -> &str { "tap-5" }
    fn connector_type(&self) -> &str { "wireless_monitor" }
    fn vendor(&self) -> &str { "0xDSI" }
    fn category(&self) -> &str { "network_taps" }
    async fn initialize(&mut self, config: ConnectorConfig) -> Result<()> { self.config = Some(config); Ok(()) }
    async fn collect(&mut self) -> Result<Vec<RawEvent>> { Ok(vec![]) }
    async fn health_check(&self) -> Result<bool> { Ok(true) }
    async fn shutdown(&mut self) -> Result<()> { Ok(()) }
    fn supported_protocols(&self) -> Vec<&str> { vec!["802.11 Monitor Mode", "WIDS/WIPS", "Bluetooth/BLE Sniff"] }
}
