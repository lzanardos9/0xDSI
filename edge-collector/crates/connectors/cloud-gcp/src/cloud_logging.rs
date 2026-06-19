use async_trait::async_trait;
use anyhow::Result;
use oxdsi_core::{Collector, RawEvent};
use oxdsi_core::config::ConnectorConfig;

pub struct CloudLoggingCollector {
    config: Option<ConnectorConfig>,
}

impl CloudLoggingCollector {
    pub fn new() -> Self {
        Self { config: None }
    }
}

impl Default for CloudLoggingCollector {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl Collector for CloudLoggingCollector {
    fn id(&self) -> &str {
        "gcp-1"
    }

    fn connector_type(&self) -> &str {
        "cloud_logging"
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
