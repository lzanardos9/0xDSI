use async_trait::async_trait;
use anyhow::Result;
use oxdsi_core::{Collector, RawEvent};
use oxdsi_core::config::ConnectorConfig;

pub struct MonitorCollector {
    config: Option<ConnectorConfig>,
}

impl MonitorCollector {
    pub fn new() -> Self {
        Self { config: None }
    }
}

impl Default for MonitorCollector {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl Collector for MonitorCollector {
    fn id(&self) -> &str {
        "az-1"
    }

    fn connector_type(&self) -> &str {
        "azure_monitor"
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
        // Log Analytics / Event Hub collection
        Ok(vec![])
    }

    async fn health_check(&self) -> Result<bool> {
        Ok(true)
    }

    async fn shutdown(&mut self) -> Result<()> {
        Ok(())
    }

    fn supported_protocols(&self) -> Vec<&str> {
        vec!["Log Analytics", "Event Hub"]
    }
}
