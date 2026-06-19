use async_trait::async_trait;
use anyhow::Result;
use oxdsi_core::{Collector, RawEvent};
use oxdsi_core::config::ConnectorConfig;

pub struct TinesCollector {
    config: Option<ConnectorConfig>,
}

impl TinesCollector {
    pub fn new() -> Self {
        Self { config: None }
    }
}

#[async_trait]
impl Collector for TinesCollector {
    fn id(&self) -> &str {
        "soar-4"
    }

    fn connector_type(&self) -> &str {
        "soar"
    }

    fn vendor(&self) -> &str {
        "Tines"
    }

    fn category(&self) -> &str {
        "SOAR"
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
        vec!["REST", "Webhook"]
    }
}
