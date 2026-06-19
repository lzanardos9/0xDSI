use async_trait::async_trait;
use anyhow::Result;
use oxdsi_core::{Collector, RawEvent};
use oxdsi_core::config::ConnectorConfig;

pub struct EthernetIpCollector {
    config: Option<ConnectorConfig>,
}

impl EthernetIpCollector {
    pub fn new() -> Self {
        Self { config: None }
    }
}

#[async_trait]
impl Collector for EthernetIpCollector {
    fn id(&self) -> &str {
        "plc-3"
    }

    fn connector_type(&self) -> &str {
        "ethernet_ip_cip"
    }

    fn vendor(&self) -> &str {
        "Rockwell Automation / ODVA"
    }

    fn category(&self) -> &str {
        "plc_ot_protocols"
    }

    async fn initialize(&mut self, config: ConnectorConfig) -> Result<()> {
        self.config = Some(config);
        Ok(())
    }

    async fn collect(&mut self) -> Result<Vec<RawEvent>> {
        Ok(vec![])
    }

    async fn health_check(&self) -> Result<bool> {
        Ok(true)
    }

    async fn shutdown(&mut self) -> Result<()> {
        Ok(())
    }

    fn supported_protocols(&self) -> Vec<&str> {
        vec!["EtherNet/IP", "CIP", "TCP/44818", "UDP/2222"]
    }
}
