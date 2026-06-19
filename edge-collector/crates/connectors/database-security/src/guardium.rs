use async_trait::async_trait;
use anyhow::Result;
use oxdsi_core::{Collector, RawEvent};
use oxdsi_core::config::ConnectorConfig;

pub struct GuardiumCollector {
    config: Option<ConnectorConfig>,
}

impl GuardiumCollector {
    pub fn new() -> Self {
        Self { config: None }
    }
}

#[async_trait]
impl Collector for GuardiumCollector {
    fn id(&self) -> &str {
        "db-1"
    }

    fn connector_type(&self) -> &str {
        "database-security"
    }

    fn vendor(&self) -> &str {
        "IBM"
    }

    fn category(&self) -> &str {
        "Database Security"
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
        vec!["S-TAP Agent", "REST", "Syslog"]
    }
}
