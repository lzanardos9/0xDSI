use async_trait::async_trait;
use anyhow::Result;
use oxdsi_core::{Collector, RawEvent};
use oxdsi_core::config::ConnectorConfig;

pub struct SentinelCollector {
    config: Option<ConnectorConfig>,
}

impl SentinelCollector {
    pub fn new() -> Self {
        Self { config: None }
    }
}

impl Default for SentinelCollector {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl Collector for SentinelCollector {
    fn id(&self) -> &str {
        "siem-3"
    }

    fn connector_type(&self) -> &str {
        "microsoft_sentinel"
    }

    fn vendor(&self) -> &str {
        "Microsoft"
    }

    fn category(&self) -> &str {
        "siem"
    }

    async fn initialize(&mut self, config: ConnectorConfig) -> Result<()> {
        self.config = Some(config);
        Ok(())
    }

    async fn collect(&mut self) -> Result<Vec<RawEvent>> {
        // Log Analytics / CEF collection
        Ok(vec![])
    }

    async fn health_check(&self) -> Result<bool> {
        Ok(true)
    }

    async fn shutdown(&mut self) -> Result<()> {
        Ok(())
    }

    fn supported_protocols(&self) -> Vec<&str> {
        vec!["Log Analytics", "CEF"]
    }
}
