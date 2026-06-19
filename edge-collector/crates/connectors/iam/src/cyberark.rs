use async_trait::async_trait;
use anyhow::Result;
use oxdsi_core::{Collector, RawEvent};
use oxdsi_core::config::ConnectorConfig;

pub struct CyberArkCollector {
    config: Option<ConnectorConfig>,
}

impl CyberArkCollector {
    pub fn new() -> Self {
        Self { config: None }
    }
}

impl Default for CyberArkCollector {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl Collector for CyberArkCollector {
    fn id(&self) -> &str {
        "iam-2"
    }

    fn connector_type(&self) -> &str {
        "cyberark"
    }

    fn vendor(&self) -> &str {
        "CyberArk"
    }

    fn category(&self) -> &str {
        "iam"
    }

    async fn initialize(&mut self, config: ConnectorConfig) -> Result<()> {
        self.config = Some(config);
        Ok(())
    }

    async fn collect(&mut self) -> Result<Vec<RawEvent>> {
        // REST / Syslog collection
        Ok(vec![])
    }

    async fn health_check(&self) -> Result<bool> {
        Ok(true)
    }

    async fn shutdown(&mut self) -> Result<()> {
        Ok(())
    }

    fn supported_protocols(&self) -> Vec<&str> {
        vec!["REST", "Syslog"]
    }
}
