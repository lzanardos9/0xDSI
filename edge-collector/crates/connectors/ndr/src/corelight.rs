use async_trait::async_trait;
use anyhow::Result;
use oxdsi_core::{Collector, RawEvent};
use oxdsi_core::config::ConnectorConfig;

pub struct CorelightCollector {
    config: Option<ConnectorConfig>,
}

impl CorelightCollector {
    pub fn new() -> Self {
        Self { config: None }
    }
}

#[async_trait]
impl Collector for CorelightCollector {
    fn id(&self) -> &str {
        "ndr-4"
    }

    fn connector_type(&self) -> &str {
        "ndr"
    }

    fn vendor(&self) -> &str {
        "Corelight"
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
        vec!["Zeek Logs", "Kafka", "REST"]
    }
}
