use async_trait::async_trait;
use anyhow::Result;
use oxdsi_core::{Collector, RawEvent};
use oxdsi_core::config::ConnectorConfig;

pub struct PurviewCollector {
    config: Option<ConnectorConfig>,
}

impl PurviewCollector {
    pub fn new() -> Self {
        Self { config: None }
    }
}

#[async_trait]
impl Collector for PurviewCollector {
    fn id(&self) -> &str {
        "dlp-3"
    }

    fn connector_type(&self) -> &str {
        "dlp"
    }

    fn vendor(&self) -> &str {
        "Microsoft Purview"
    }

    fn category(&self) -> &str {
        "Data Loss Prevention"
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
        vec!["Management Activity", "Graph API"]
    }
}
