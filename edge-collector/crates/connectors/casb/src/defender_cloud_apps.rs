use async_trait::async_trait;
use anyhow::Result;
use oxdsi_core::{Collector, RawEvent};
use oxdsi_core::config::ConnectorConfig;

pub struct DefenderCloudAppsCollector {
    config: Option<ConnectorConfig>,
}

impl DefenderCloudAppsCollector {
    pub fn new() -> Self {
        Self { config: None }
    }
}

#[async_trait]
impl Collector for DefenderCloudAppsCollector {
    fn id(&self) -> &str {
        "casb-3"
    }

    fn connector_type(&self) -> &str {
        "casb"
    }

    fn vendor(&self) -> &str {
        "Microsoft Defender for Cloud Apps"
    }

    fn category(&self) -> &str {
        "Cloud Access Security Broker"
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
        vec!["REST", "SIEM Agent", "Streaming"]
    }
}
