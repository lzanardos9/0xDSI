use async_trait::async_trait;
use anyhow::Result;
use oxdsi_core::{Collector, RawEvent};
use oxdsi_core::config::ConnectorConfig;

pub struct CloudVpcMirrorCollector {
    config: Option<ConnectorConfig>,
}
impl CloudVpcMirrorCollector {
    pub fn new() -> Self { Self { config: None } }
}
#[async_trait]
impl Collector for CloudVpcMirrorCollector {
    fn id(&self) -> &str { "tap-3" }
    fn connector_type(&self) -> &str { "cloud_vpc_mirror" }
    fn vendor(&self) -> &str { "0xDSI" }
    fn category(&self) -> &str { "network_taps" }
    async fn initialize(&mut self, config: ConnectorConfig) -> Result<()> { self.config = Some(config); Ok(()) }
    async fn collect(&mut self) -> Result<Vec<RawEvent>> { Ok(vec![]) }
    async fn health_check(&self) -> Result<bool> { Ok(true) }
    async fn shutdown(&mut self) -> Result<()> { Ok(()) }
    fn supported_protocols(&self) -> Vec<&str> { vec!["AWS VPC Traffic Mirror", "Azure vTAP", "GCP Packet Mirroring"] }
}
