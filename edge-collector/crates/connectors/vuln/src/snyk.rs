use async_trait::async_trait;
use anyhow::Result;
use oxdsi_core::{Collector, RawEvent};
use oxdsi_core::config::ConnectorConfig;

pub struct SnykCollector {
    config: Option<ConnectorConfig>,
}

impl SnykCollector {
    pub fn new() -> Self {
        Self { config: None }
    }
}

#[async_trait]
impl Collector for SnykCollector {
    fn id(&self) -> &str {
        "vuln-4"
    }

    fn connector_type(&self) -> &str {
        "vulnerability-management"
    }

    fn vendor(&self) -> &str {
        "Snyk"
    }

    fn category(&self) -> &str {
        "Vulnerability Management"
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
