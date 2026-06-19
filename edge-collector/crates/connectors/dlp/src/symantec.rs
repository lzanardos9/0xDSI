use async_trait::async_trait;
use anyhow::Result;
use oxdsi_core::{Collector, RawEvent};
use oxdsi_core::config::ConnectorConfig;

pub struct SymantecCollector {
    config: Option<ConnectorConfig>,
}

impl SymantecCollector {
    pub fn new() -> Self {
        Self { config: None }
    }
}

#[async_trait]
impl Collector for SymantecCollector {
    fn id(&self) -> &str {
        "dlp-1"
    }

    fn connector_type(&self) -> &str {
        "dlp"
    }

    fn vendor(&self) -> &str {
        "Symantec"
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
        vec!["Syslog", "REST", "ICAP"]
    }
}
