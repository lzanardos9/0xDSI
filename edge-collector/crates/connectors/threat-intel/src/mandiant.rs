use async_trait::async_trait;
use anyhow::Result;
use oxdsi_core::{Collector, RawEvent};
use oxdsi_core::config::ConnectorConfig;

pub struct MandiantCollector {
    config: Option<ConnectorConfig>,
}

impl MandiantCollector {
    pub fn new() -> Self {
        Self { config: None }
    }
}

#[async_trait]
impl Collector for MandiantCollector {
    fn id(&self) -> &str {
        "ti-3"
    }

    fn connector_type(&self) -> &str {
        "threat-intelligence"
    }

    fn vendor(&self) -> &str {
        "Mandiant"
    }

    fn category(&self) -> &str {
        "Threat Intelligence"
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
        vec!["REST v4", "STIX 2.1"]
    }
}
