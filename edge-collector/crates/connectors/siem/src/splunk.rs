use async_trait::async_trait;
use anyhow::Result;
use oxdsi_core::{Collector, RawEvent};
use oxdsi_core::config::ConnectorConfig;

pub struct SplunkCollector {
    config: Option<ConnectorConfig>,
}

impl SplunkCollector {
    pub fn new() -> Self {
        Self { config: None }
    }
}

impl Default for SplunkCollector {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl Collector for SplunkCollector {
    fn id(&self) -> &str {
        "siem-1"
    }

    fn connector_type(&self) -> &str {
        "splunk_enterprise"
    }

    fn vendor(&self) -> &str {
        "Splunk (Cisco)"
    }

    fn category(&self) -> &str {
        "siem"
    }

    async fn initialize(&mut self, config: ConnectorConfig) -> Result<()> {
        self.config = Some(config);
        Ok(())
    }

    async fn collect(&mut self) -> Result<Vec<RawEvent>> {
        // HEC / Syslog / REST API collection
        Ok(vec![])
    }

    async fn health_check(&self) -> Result<bool> {
        Ok(true)
    }

    async fn shutdown(&mut self) -> Result<()> {
        Ok(())
    }

    fn supported_protocols(&self) -> Vec<&str> {
        vec!["HEC", "Syslog", "REST API"]
    }
}
