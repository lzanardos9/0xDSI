use async_trait::async_trait;
use anyhow::Result;
use oxdsi_core::{Collector, RawEvent};
use oxdsi_core::config::ConnectorConfig;

pub struct DarktaceCollector {
    config: Option<ConnectorConfig>,
}

impl DarktaceCollector {
    pub fn new() -> Self {
        Self { config: None }
    }
}

#[async_trait]
impl Collector for DarktaceCollector {
    fn id(&self) -> &str {
        "ndr-1"
    }

    fn connector_type(&self) -> &str {
        "ndr"
    }

    fn vendor(&self) -> &str {
        "Darktrace"
    }

    fn category(&self) -> &str {
        "Network Detection & Response"
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
        vec!["REST", "Syslog CEF", "STIX"]
    }
}
