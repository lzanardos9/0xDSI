use async_trait::async_trait;
use anyhow::Result;
use oxdsi_core::{Collector, RawEvent};
use oxdsi_core::config::ConnectorConfig;

pub struct PaloAltoCollector {
    config: Option<ConnectorConfig>,
}

impl PaloAltoCollector {
    pub fn new() -> Self {
        Self { config: None }
    }
}

impl Default for PaloAltoCollector {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl Collector for PaloAltoCollector {
    fn id(&self) -> &str {
        "fw-1"
    }

    fn connector_type(&self) -> &str {
        "palo_alto_networks"
    }

    fn vendor(&self) -> &str {
        "Palo Alto Networks"
    }

    fn category(&self) -> &str {
        "firewall"
    }

    async fn initialize(&mut self, config: ConnectorConfig) -> Result<()> {
        self.config = Some(config);
        Ok(())
    }

    async fn collect(&mut self) -> Result<Vec<RawEvent>> {
        // Syslog / Cortex Data Lake collection
        Ok(vec![])
    }

    async fn health_check(&self) -> Result<bool> {
        Ok(true)
    }

    async fn shutdown(&mut self) -> Result<()> {
        Ok(())
    }

    fn supported_protocols(&self) -> Vec<&str> {
        vec!["Syslog", "Cortex Data Lake"]
    }
}
