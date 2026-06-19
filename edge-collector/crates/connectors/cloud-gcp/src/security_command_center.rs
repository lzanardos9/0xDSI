use async_trait::async_trait;
use anyhow::Result;
use oxdsi_core::{Collector, RawEvent};
use oxdsi_core::config::ConnectorConfig;

pub struct SecurityCommandCenterCollector {
    config: Option<ConnectorConfig>,
}

impl SecurityCommandCenterCollector {
    pub fn new() -> Self {
        Self { config: None }
    }
}

impl Default for SecurityCommandCenterCollector {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl Collector for SecurityCommandCenterCollector {
    fn id(&self) -> &str {
        "gcp-2"
    }

    fn connector_type(&self) -> &str {
        "scc"
    }

    fn vendor(&self) -> &str {
        "Google"
    }

    fn category(&self) -> &str {
        "cloud-gcp"
    }

    async fn initialize(&mut self, config: ConnectorConfig) -> Result<()> {
        self.config = Some(config);
        Ok(())
    }

    async fn collect(&mut self) -> Result<Vec<RawEvent>> {
        // Pub/Sub / REST collection
        Ok(vec![])
    }

    async fn health_check(&self) -> Result<bool> {
        Ok(true)
    }

    async fn shutdown(&mut self) -> Result<()> {
        Ok(())
    }

    fn supported_protocols(&self) -> Vec<&str> {
        vec!["Pub/Sub", "REST"]
    }
}
