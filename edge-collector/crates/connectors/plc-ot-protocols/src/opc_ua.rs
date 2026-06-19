use async_trait::async_trait;
use anyhow::Result;
use oxdsi_core::{Collector, RawEvent};
use oxdsi_core::config::ConnectorConfig;

pub struct OpcUaCollector {
    config: Option<ConnectorConfig>,
}

impl OpcUaCollector {
    pub fn new() -> Self {
        Self { config: None }
    }
}

#[async_trait]
impl Collector for OpcUaCollector {
    fn id(&self) -> &str {
        "plc-4"
    }

    fn connector_type(&self) -> &str {
        "opc_ua"
    }

    fn vendor(&self) -> &str {
        "OPC Foundation"
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
        vec!["OPC UA Binary", "TCP/4840", "OPC UA HTTPS"]
    }
}
