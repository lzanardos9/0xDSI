use async_trait::async_trait;
use anyhow::Result;
use oxdsi_core::{Collector, RawEvent};
use oxdsi_core::config::ConnectorConfig;

pub struct AlienvaultOtxCollector {
    config: Option<ConnectorConfig>,
}

impl AlienvaultOtxCollector {
    pub fn new() -> Self {
        Self { config: None }
    }
}

#[async_trait]
impl Collector for AlienvaultOtxCollector {
    fn id(&self) -> &str {
        "ti-4"
    }

    fn connector_type(&self) -> &str {
        "threat-intelligence"
    }

    fn vendor(&self) -> &str {
        "AlienVault OTX"
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
        vec!["DirectConnect", "STIX", "TAXII"]
    }
}
