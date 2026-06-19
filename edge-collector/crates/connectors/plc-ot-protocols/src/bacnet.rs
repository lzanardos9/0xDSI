use async_trait::async_trait;
use anyhow::Result;
use oxdsi_core::{Collector, RawEvent};
use oxdsi_core::config::ConnectorConfig;

pub struct BacnetCollector {
    config: Option<ConnectorConfig>,
}

impl BacnetCollector {
    pub fn new() -> Self {
        Self { config: None }
    }
}

#[async_trait]
impl Collector for BacnetCollector {
    fn id(&self) -> &str {
        "plc-9"
    }

    fn connector_type(&self) -> &str {
        "bacnet_ip"
    }

    fn vendor(&self) -> &str {
        "ASHRAE"
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
        vec!["BACnet/IP", "UDP/47808", "BACnet MS/TP"]
    }
}
