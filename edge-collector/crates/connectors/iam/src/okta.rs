use async_trait::async_trait;
use anyhow::Result;
use oxdsi_core::{Collector, RawEvent};
use oxdsi_core::config::ConnectorConfig;

pub struct OktaCollector {
    config: Option<ConnectorConfig>,
}

impl OktaCollector {
    pub fn new() -> Self {
        Self { config: None }
    }
}

impl Default for OktaCollector {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl Collector for OktaCollector {
    fn id(&self) -> &str {
        "iam-1"
    }

    fn connector_type(&self) -> &str {
        "okta"
    }

    fn vendor(&self) -> &str {
        "Okta"
    }

    fn category(&self) -> &str {
        "iam"
    }

    async fn initialize(&mut self, config: ConnectorConfig) -> Result<()> {
        self.config = Some(config);
        Ok(())
    }

    async fn collect(&mut self) -> Result<Vec<RawEvent>> {
        // System Log / Event Hook collection
        Ok(vec![])
    }

    async fn health_check(&self) -> Result<bool> {
        Ok(true)
    }

    async fn shutdown(&mut self) -> Result<()> {
        Ok(())
    }

    fn supported_protocols(&self) -> Vec<&str> {
        vec!["System Log", "Event Hook"]
    }
}
