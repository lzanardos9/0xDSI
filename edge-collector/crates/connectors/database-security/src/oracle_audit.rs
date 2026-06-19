use async_trait::async_trait;
use anyhow::Result;
use oxdsi_core::{Collector, RawEvent};
use oxdsi_core::config::ConnectorConfig;

pub struct OracleAuditCollector {
    config: Option<ConnectorConfig>,
}

impl OracleAuditCollector {
    pub fn new() -> Self {
        Self { config: None }
    }
}

#[async_trait]
impl Collector for OracleAuditCollector {
    fn id(&self) -> &str {
        "db-3"
    }

    fn connector_type(&self) -> &str {
        "database-security"
    }

    fn vendor(&self) -> &str {
        "Oracle"
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
        vec!["Audit Collection Agent", "REST"]
    }
}
