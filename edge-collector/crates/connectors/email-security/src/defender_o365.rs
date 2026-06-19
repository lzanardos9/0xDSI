use async_trait::async_trait;
use anyhow::Result;
use oxdsi_core::{Collector, RawEvent};
use oxdsi_core::config::ConnectorConfig;

pub struct DefenderO365Collector {
    config: Option<ConnectorConfig>,
}

impl DefenderO365Collector {
    pub fn new() -> Self {
        Self { config: None }
    }
}

#[async_trait]
impl Collector for DefenderO365Collector {
    fn id(&self) -> &str {
        "email-3"
    }

    fn connector_type(&self) -> &str {
        "email-security"
    }

    fn vendor(&self) -> &str {
        "Microsoft Defender for Office 365"
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
        vec!["Management Activity API", "Streaming"]
    }
}
