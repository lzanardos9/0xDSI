use async_trait::async_trait;
use anyhow::Result;
use oxdsi_core::{Collector, RawEvent};
use oxdsi_core::config::ConnectorConfig;

pub struct Iec61850Collector {
    config: Option<ConnectorConfig>,
}

impl Iec61850Collector {
    pub fn new() -> Self {
        Self { config: None }
    }
}

#[async_trait]
impl Collector for Iec61850Collector {
    fn id(&self) -> &str {
        "plc-6"
    }

    fn connector_type(&self) -> &str {
        "iec_61850"
    }

    fn vendor(&self) -> &str {
        "IEC"
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
        vec!["GOOSE", "MMS", "Sampled Values", "TCP/102"]
    }
}
