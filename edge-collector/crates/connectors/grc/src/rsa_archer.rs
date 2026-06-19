use async_trait::async_trait;
use anyhow::Result;
use oxdsi_core::{Collector, RawEvent};
use oxdsi_core::config::ConnectorConfig;

pub struct RsaArcherCollector {
    config: Option<ConnectorConfig>,
}

impl RsaArcherCollector {
    pub fn new() -> Self {
        Self { config: None }
    }
}

#[async_trait]
impl Collector for RsaArcherCollector {
    fn id(&self) -> &str {
        "grc-2"
    }

    fn connector_type(&self) -> &str {
        "grc"
    }

    fn vendor(&self) -> &str {
        "RSA"
    }

    fn category(&self) -> &str {
        "GRC"
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
        vec!["REST", "Data Feed"]
    }
}
