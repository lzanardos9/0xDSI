use async_trait::async_trait;
use anyhow::Result;
use oxdsi_core::{Collector, RawEvent};
use oxdsi_core::config::ConnectorConfig;

pub struct EthercatCollector {
    config: Option<ConnectorConfig>,
}

impl EthercatCollector {
    pub fn new() -> Self {
        Self { config: None }
    }
}

#[async_trait]
impl Collector for EthercatCollector {
    fn id(&self) -> &str {
        "plc-16"
    }

    fn connector_type(&self) -> &str {
        "ethercat"
    }

    fn vendor(&self) -> &str {
        "Beckhoff / ETG"
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
        vec!["EtherCAT", "EtherType 0x88A4"]
    }
}
