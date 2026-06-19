use async_trait::async_trait;
use anyhow::Result;
use oxdsi_core::{Collector, RawEvent};
use oxdsi_core::config::ConnectorConfig;

pub struct DefenderCloudCollector {
    config: Option<ConnectorConfig>,
}

impl DefenderCloudCollector {
    pub fn new() -> Self {
        Self { config: None }
    }
}

impl Default for DefenderCloudCollector {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl Collector for DefenderCloudCollector {
    fn id(&self) -> &str {
        "az-2"
    }

    fn connector_type(&self) -> &str {
        "defender_for_cloud"
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
        // REST / Event Hub collection
        Ok(vec![])
    }

    async fn health_check(&self) -> Result<bool> {
        Ok(true)
    }

    async fn shutdown(&mut self) -> Result<()> {
        Ok(())
    }

    fn supported_protocols(&self) -> Vec<&str> {
        vec!["REST", "Event Hub"]
    }
}
