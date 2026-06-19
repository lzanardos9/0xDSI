use async_trait::async_trait;
use anyhow::Result;
use oxdsi_core::{Collector, RawEvent};
use oxdsi_core::config::ConnectorConfig;

pub struct EntraIdCollector {
    config: Option<ConnectorConfig>,
}

impl EntraIdCollector {
    pub fn new() -> Self {
        Self { config: None }
    }
}

impl Default for EntraIdCollector {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl Collector for EntraIdCollector {
    fn id(&self) -> &str {
        "az-3"
    }

    fn connector_type(&self) -> &str {
        "entra_id"
    }

    fn vendor(&self) -> &str {
        "Microsoft"
    }

    fn category(&self) -> &str {
        "cloud-azure"
    }

    async fn initialize(&mut self, config: ConnectorConfig) -> Result<()> {
        self.config = Some(config);
        Ok(())
    }

    async fn collect(&mut self) -> Result<Vec<RawEvent>> {
        // Graph API / Event Hub collection
        Ok(vec![])
    }

    async fn health_check(&self) -> Result<bool> {
        Ok(true)
    }

    async fn shutdown(&mut self) -> Result<()> {
        Ok(())
    }

    fn supported_protocols(&self) -> Vec<&str> {
        vec!["Graph API", "Event Hub"]
    }
}
