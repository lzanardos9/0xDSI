use async_trait::async_trait;
use anyhow::Result;
use oxdsi_core::{Collector, RawEvent};
use oxdsi_core::config::ConnectorConfig;

pub struct CybereasonCollector {
    config: Option<ConnectorConfig>,
}

impl CybereasonCollector {
    pub fn new() -> Self {
        Self { config: None }
    }
}

impl Default for CybereasonCollector {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl Collector for CybereasonCollector {
    fn id(&self) -> &str {
        "edr-5"
    }

    fn connector_type(&self) -> &str {
        "cybereason"
    }

    fn vendor(&self) -> &str {
        "Cybereason"
    }

    fn category(&self) -> &str {
        "edr"
    }

    async fn initialize(&mut self, config: ConnectorConfig) -> Result<()> {
        self.config = Some(config);
        Ok(())
    }

    async fn collect(&mut self) -> Result<Vec<RawEvent>> {
        // REST / Syslog collection
        Ok(vec![])
    }

    async fn health_check(&self) -> Result<bool> {
        Ok(true)
    }

    async fn shutdown(&mut self) -> Result<()> {
        Ok(())
    }

    fn supported_protocols(&self) -> Vec<&str> {
        vec!["REST", "Syslog"]
    }
}
