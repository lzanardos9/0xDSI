use async_trait::async_trait;
use anyhow::Result;
use oxdsi_core::{Collector, RawEvent};
use oxdsi_core::config::ConnectorConfig;

pub struct PingIdentityCollector {
    config: Option<ConnectorConfig>,
}

impl PingIdentityCollector {
    pub fn new() -> Self {
        Self { config: None }
    }
}

impl Default for PingIdentityCollector {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl Collector for PingIdentityCollector {
    fn id(&self) -> &str {
        "iam-3"
    }

    fn connector_type(&self) -> &str {
        "ping_identity"
    }

    fn vendor(&self) -> &str {
        "Ping Identity"
    }

    fn category(&self) -> &str {
        "iam"
    }

    async fn initialize(&mut self, config: ConnectorConfig) -> Result<()> {
        self.config = Some(config);
        Ok(())
    }

    async fn collect(&mut self) -> Result<Vec<RawEvent>> {
        // REST / Audit Log collection
        Ok(vec![])
    }

    async fn health_check(&self) -> Result<bool> {
        Ok(true)
    }

    async fn shutdown(&mut self) -> Result<()> {
        Ok(())
    }

    fn supported_protocols(&self) -> Vec<&str> {
        vec!["REST", "Audit Log"]
    }
}
