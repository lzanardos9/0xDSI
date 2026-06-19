use async_trait::async_trait;
use anyhow::Result;
use oxdsi_core::{Collector, RawEvent};
use oxdsi_core::config::ConnectorConfig;

pub struct CloudTrailCollector {
    config: Option<ConnectorConfig>,
}

impl CloudTrailCollector {
    pub fn new() -> Self {
        Self { config: None }
    }
}

impl Default for CloudTrailCollector {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl Collector for CloudTrailCollector {
    fn id(&self) -> &str {
        "aws-1"
    }

    fn connector_type(&self) -> &str {
        "cloudtrail"
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
        // S3 / SNS / EventBridge collection
        Ok(vec![])
    }

    async fn health_check(&self) -> Result<bool> {
        Ok(true)
    }

    async fn shutdown(&mut self) -> Result<()> {
        Ok(())
    }

    fn supported_protocols(&self) -> Vec<&str> {
        vec!["S3", "SNS", "EventBridge"]
    }
}
