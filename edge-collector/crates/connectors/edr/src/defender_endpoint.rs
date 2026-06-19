use async_trait::async_trait;
use anyhow::Result;
use oxdsi_core::{Collector, RawEvent};
use oxdsi_core::config::ConnectorConfig;

pub struct DefenderEndpointCollector {
    config: Option<ConnectorConfig>,
}

impl DefenderEndpointCollector {
    pub fn new() -> Self {
        Self { config: None }
    }
}

impl Default for DefenderEndpointCollector {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl Collector for DefenderEndpointCollector {
    fn id(&self) -> &str {
        "edr-4"
    }

    fn connector_type(&self) -> &str {
        "defender_endpoint"
    }

    fn vendor(&self) -> &str {
        "Microsoft"
    }

    fn category(&self) -> &str {
        "edr"
    }

    async fn initialize(&mut self, config: ConnectorConfig) -> Result<()> {
        self.config = Some(config);
        Ok(())
    }

    async fn collect(&mut self) -> Result<Vec<RawEvent>> {
        // Streaming / Graph Security collection
        Ok(vec![])
    }

    async fn health_check(&self) -> Result<bool> {
        Ok(true)
    }

    async fn shutdown(&mut self) -> Result<()> {
        Ok(())
    }

    fn supported_protocols(&self) -> Vec<&str> {
        vec!["Streaming", "Graph Security"]
    }
}
