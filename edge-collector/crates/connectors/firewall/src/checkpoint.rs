use async_trait::async_trait;
use anyhow::Result;
use oxdsi_core::{Collector, RawEvent};
use oxdsi_core::config::ConnectorConfig;

pub struct CheckPointCollector {
    config: Option<ConnectorConfig>,
}

impl CheckPointCollector {
    pub fn new() -> Self {
        Self { config: None }
    }
}

impl Default for CheckPointCollector {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl Collector for CheckPointCollector {
    fn id(&self) -> &str {
        "fw-3"
    }

    fn connector_type(&self) -> &str {
        "checkpoint"
    }

    fn vendor(&self) -> &str {
        "Check Point"
    }

    fn category(&self) -> &str {
        "firewall"
    }

    async fn initialize(&mut self, config: ConnectorConfig) -> Result<()> {
        self.config = Some(config);
        Ok(())
    }

    async fn collect(&mut self) -> Result<Vec<RawEvent>> {
        // LEA / OPSEC / Syslog collection
        Ok(vec![])
    }

    async fn health_check(&self) -> Result<bool> {
        Ok(true)
    }

    async fn shutdown(&mut self) -> Result<()> {
        Ok(())
    }

    fn supported_protocols(&self) -> Vec<&str> {
        vec!["LEA", "OPSEC", "Syslog"]
    }
}
