use async_trait::async_trait;
use anyhow::Result;
use oxdsi_core::{Collector, RawEvent};
use oxdsi_core::config::ConnectorConfig;

pub struct RecordedFutureCollector {
    config: Option<ConnectorConfig>,
}

impl RecordedFutureCollector {
    pub fn new() -> Self {
        Self { config: None }
    }
}

#[async_trait]
impl Collector for RecordedFutureCollector {
    fn id(&self) -> &str {
        "ti-2"
    }

    fn connector_type(&self) -> &str {
        "threat-intelligence"
    }

    fn vendor(&self) -> &str {
        "Recorded Future"
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
        vec!["Connect API", "STIX", "TAXII"]
    }
}
