use async_trait::async_trait;
use anyhow::Result;
use oxdsi_core::{Collector, RawEvent};
use oxdsi_core::config::ConnectorConfig;

pub struct CiscoFtdCollector {
    config: Option<ConnectorConfig>,
}

impl CiscoFtdCollector {
    pub fn new() -> Self {
        Self { config: None }
    }
}

impl Default for CiscoFtdCollector {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl Collector for CiscoFtdCollector {
    fn id(&self) -> &str {
        "fw-4"
    }

    fn connector_type(&self) -> &str {
        "cisco_ftd"
    }

    fn vendor(&self) -> &str {
        "Cisco"
    }

    fn category(&self) -> &str {
        "firewall"
    }

    async fn initialize(&mut self, config: ConnectorConfig) -> Result<()> {
        self.config = Some(config);
        Ok(())
    }

    async fn collect(&mut self) -> Result<Vec<RawEvent>> {
        // eStreamer / Syslog / REST collection
        Ok(vec![])
    }

    async fn health_check(&self) -> Result<bool> {
        Ok(true)
    }

    async fn shutdown(&mut self) -> Result<()> {
        Ok(())
    }

    fn supported_protocols(&self) -> Vec<&str> {
        vec!["eStreamer", "Syslog", "REST"]
    }
}
