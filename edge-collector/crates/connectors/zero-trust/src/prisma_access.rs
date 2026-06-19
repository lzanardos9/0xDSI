use async_trait::async_trait;
use anyhow::Result;
use oxdsi_core::{Collector, RawEvent};
use oxdsi_core::config::ConnectorConfig;

pub struct PrismaAccessCollector {
    config: Option<ConnectorConfig>,
}

impl PrismaAccessCollector {
    pub fn new() -> Self {
        Self { config: None }
    }
}

#[async_trait]
impl Collector for PrismaAccessCollector {
    fn id(&self) -> &str {
        "zt-3"
    }

    fn connector_type(&self) -> &str {
        "zero-trust"
    }

    fn vendor(&self) -> &str {
        "Palo Alto Networks"
    }

    fn category(&self) -> &str {
        "Zero Trust"
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
        vec!["Cortex Data Lake", "Syslog", "REST"]
    }
}
