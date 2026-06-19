use async_trait::async_trait;
use anyhow::Result;
use oxdsi_core::{Collector, RawEvent};
use oxdsi_core::config::ConnectorConfig;

pub struct ProofpointCollector {
    config: Option<ConnectorConfig>,
}

impl ProofpointCollector {
    pub fn new() -> Self {
        Self { config: None }
    }
}

#[async_trait]
impl Collector for ProofpointCollector {
    fn id(&self) -> &str {
        "email-1"
    }

    fn connector_type(&self) -> &str {
        "email-security"
    }

    fn vendor(&self) -> &str {
        "Proofpoint"
    }

    fn category(&self) -> &str {
        "Email Security"
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
        vec!["SIEM API", "Syslog CEF"]
    }
}
