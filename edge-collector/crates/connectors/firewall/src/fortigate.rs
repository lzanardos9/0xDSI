use async_trait::async_trait;
use anyhow::Result;
use oxdsi_core::{Collector, RawEvent};
use oxdsi_core::config::ConnectorConfig;

pub struct FortiGateCollector {
    config: Option<ConnectorConfig>,
}

impl FortiGateCollector {
    pub fn new() -> Self {
        Self { config: None }
    }
}

impl Default for FortiGateCollector {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl Collector for FortiGateCollector {
    fn id(&self) -> &str {
        "fw-2"
    }

    fn connector_type(&self) -> &str {
        "fortigate"
    }

    fn vendor(&self) -> &str {
        "Fortinet"
    }

    fn category(&self) -> &str {
        "firewall"
    }

    async fn initialize(&mut self, config: ConnectorConfig) -> Result<()> {
        self.config = Some(config);
        Ok(())
    }

    async fn collect(&mut self) -> Result<Vec<RawEvent>> {
        // Syslog / FortiAnalyzer collection
        Ok(vec![])
    }

    async fn health_check(&self) -> Result<bool> {
        Ok(true)
    }

    async fn shutdown(&mut self) -> Result<()> {
        Ok(())
    }

    fn supported_protocols(&self) -> Vec<&str> {
        vec!["Syslog", "FortiAnalyzer"]
    }
}
