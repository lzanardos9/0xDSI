use async_trait::async_trait;
use anyhow::Result;
use oxdsi_core::{Collector, RawEvent};
use oxdsi_core::config::ConnectorConfig;

pub struct SlackCollector {
    config: Option<ConnectorConfig>,
}

impl SlackCollector {
    pub fn new() -> Self {
        Self { config: None }
    }
}

#[async_trait]
impl Collector for SlackCollector {
    fn id(&self) -> &str {
        "collab-1"
    }

    fn connector_type(&self) -> &str {
        "collaboration"
    }

    fn vendor(&self) -> &str {
        "Slack"
    }

    fn category(&self) -> &str {
        "Collaboration"
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
        vec!["Audit Logs API", "Event API"]
    }
}
