use async_trait::async_trait;
use anyhow::Result;
use oxdsi_core::{Collector, RawEvent};
use oxdsi_core::config::ConnectorConfig;

pub struct CiscoUmbrellaCollector {
    config: Option<ConnectorConfig>,
}

impl CiscoUmbrellaCollector {
    pub fn new() -> Self {
        Self { config: None }
    }
}

#[async_trait]
impl Collector for CiscoUmbrellaCollector {
    fn id(&self) -> &str {
        "dns-1"
    }

    fn connector_type(&self) -> &str {
        "dns-security"
    }

    fn vendor(&self) -> &str {
        "Cisco"
    }

    fn category(&self) -> &str {
        "DNS Security"
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
        vec!["S3", "REST"]
    }
}
