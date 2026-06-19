use async_trait::async_trait;
use anyhow::Result;
use oxdsi_core::{Collector, RawEvent};
use oxdsi_core::config::ConnectorConfig;

pub struct SwimlaneCollector {
    config: Option<ConnectorConfig>,
}

impl SwimlaneCollector {
    pub fn new() -> Self {
        Self { config: None }
    }
}

#[async_trait]
impl Collector for SwimlaneCollector {
    fn id(&self) -> &str {
        "soar-3"
    }

    fn connector_type(&self) -> &str {
        "soar"
    }

    fn vendor(&self) -> &str {
        "Swimlane"
    }

    fn category(&self) -> &str {
        "SOAR"
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
        vec!["REST", "Webhook"]
    }
}
