use async_trait::async_trait;
use anyhow::Result;
use oxdsi_core::{Collector, RawEvent};
use oxdsi_core::config::ConnectorConfig;

pub struct IntuneCollector {
    config: Option<ConnectorConfig>,
}

impl IntuneCollector {
    pub fn new() -> Self {
        Self { config: None }
    }
}

#[async_trait]
impl Collector for IntuneCollector {
    fn id(&self) -> &str {
        "em-1"
    }

    fn connector_type(&self) -> &str {
        "endpoint-mgmt"
    }

    fn vendor(&self) -> &str {
        "Microsoft"
    }

    fn category(&self) -> &str {
        "Endpoint Management"
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
        vec!["Graph API", "Log Analytics"]
    }
}
