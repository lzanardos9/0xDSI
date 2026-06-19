use async_trait::async_trait;
use anyhow::Result;
use oxdsi_core::{Collector, RawEvent};
use oxdsi_core::config::ConnectorConfig;

pub struct GuardDutyCollector {
    config: Option<ConnectorConfig>,
}

impl GuardDutyCollector {
    pub fn new() -> Self {
        Self { config: None }
    }
}

impl Default for GuardDutyCollector {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl Collector for GuardDutyCollector {
    fn id(&self) -> &str {
        "aws-2"
    }

    fn connector_type(&self) -> &str {
        "guardduty"
    }

    fn vendor(&self) -> &str {
        "Amazon"
    }

    fn category(&self) -> &str {
        "cloud-aws"
    }

    async fn initialize(&mut self, config: ConnectorConfig) -> Result<()> {
        self.config = Some(config);
        Ok(())
    }

    async fn collect(&mut self) -> Result<Vec<RawEvent>> {
        // EventBridge / S3 collection
        Ok(vec![])
    }

    async fn health_check(&self) -> Result<bool> {
        Ok(true)
    }

    async fn shutdown(&mut self) -> Result<()> {
        Ok(())
    }

    fn supported_protocols(&self) -> Vec<&str> {
        vec!["EventBridge", "S3"]
    }
}
