use async_trait::async_trait;
use anyhow::Result;
use oxdsi_core::{Collector, RawEvent};
use oxdsi_core::config::ConnectorConfig;

pub struct ChronicleCollector {
    config: Option<ConnectorConfig>,
}

impl ChronicleCollector {
    pub fn new() -> Self {
        Self { config: None }
    }
}

impl Default for ChronicleCollector {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl Collector for ChronicleCollector {
    fn id(&self) -> &str {
        "gcp-3"
    }

    fn connector_type(&self) -> &str {
        "chronicle"
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
        // Ingestion API / Forwarder collection
        Ok(vec![])
    }

    async fn health_check(&self) -> Result<bool> {
        Ok(true)
    }

    async fn shutdown(&mut self) -> Result<()> {
        Ok(())
    }

    fn supported_protocols(&self) -> Vec<&str> {
        vec!["Ingestion API", "Forwarder"]
    }
}
