use async_trait::async_trait;
use anyhow::Result;
use oxdsi_core::{Collector, RawEvent};
use oxdsi_core::config::ConnectorConfig;

pub struct NetworkWatcherCollector {
    config: Option<ConnectorConfig>,
}

impl NetworkWatcherCollector {
    pub fn new() -> Self {
        Self { config: None }
    }
}

impl Default for NetworkWatcherCollector {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl Collector for NetworkWatcherCollector {
    fn id(&self) -> &str {
        "az-4"
    }

    fn connector_type(&self) -> &str {
        "network_watcher"
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
        // REST / Storage collection
        Ok(vec![])
    }

    async fn health_check(&self) -> Result<bool> {
        Ok(true)
    }

    async fn shutdown(&mut self) -> Result<()> {
        Ok(())
    }

    fn supported_protocols(&self) -> Vec<&str> {
        vec!["REST", "Storage"]
    }
}
