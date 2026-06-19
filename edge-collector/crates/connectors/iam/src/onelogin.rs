use async_trait::async_trait;
use anyhow::Result;
use oxdsi_core::{Collector, RawEvent};
use oxdsi_core::config::ConnectorConfig;

pub struct OneLoginCollector {
    config: Option<ConnectorConfig>,
}

impl OneLoginCollector {
    pub fn new() -> Self {
        Self { config: None }
    }
}

impl Default for OneLoginCollector {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl Collector for OneLoginCollector {
    fn id(&self) -> &str {
        "iam-4"
    }

    fn connector_type(&self) -> &str {
        "onelogin"
    }

    fn vendor(&self) -> &str {
        "OneLogin"
    }

    fn category(&self) -> &str {
        "iam"
    }

    async fn initialize(&mut self, config: ConnectorConfig) -> Result<()> {
        self.config = Some(config);
        Ok(())
    }

    async fn collect(&mut self) -> Result<Vec<RawEvent>> {
        // Events API / Webhook collection
        Ok(vec![])
    }

    async fn health_check(&self) -> Result<bool> {
        Ok(true)
    }

    async fn shutdown(&mut self) -> Result<()> {
        Ok(())
    }

    fn supported_protocols(&self) -> Vec<&str> {
        vec!["Events API", "Webhook"]
    }
}
