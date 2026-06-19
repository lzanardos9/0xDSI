use async_trait::async_trait;
use anyhow::Result;
use oxdsi_core::{Collector, RawEvent};
use oxdsi_core::config::ConnectorConfig;

pub struct SentinelOneCollector {
    config: Option<ConnectorConfig>,
}

impl SentinelOneCollector {
    pub fn new() -> Self {
        Self { config: None }
    }
}

impl Default for SentinelOneCollector {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl Collector for SentinelOneCollector {
    fn id(&self) -> &str {
        "edr-2"
    }

    fn connector_type(&self) -> &str {
        "sentinelone"
    }

    fn vendor(&self) -> &str {
        "SentinelOne"
    }

    fn category(&self) -> &str {
        "edr"
    }

    async fn initialize(&mut self, config: ConnectorConfig) -> Result<()> {
        self.config = Some(config);
        Ok(())
    }

    async fn collect(&mut self) -> Result<Vec<RawEvent>> {
        // REST / Syslog CEF collection
        Ok(vec![])
    }

    async fn health_check(&self) -> Result<bool> {
        Ok(true)
    }

    async fn shutdown(&mut self) -> Result<()> {
        Ok(())
    }

    fn supported_protocols(&self) -> Vec<&str> {
        vec!["REST", "Syslog CEF"]
    }
}
