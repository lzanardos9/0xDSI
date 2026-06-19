use async_trait::async_trait;
use anyhow::Result;
use oxdsi_core::{Collector, RawEvent};
use oxdsi_core::config::ConnectorConfig;

pub struct AwsWafCollector {
    config: Option<ConnectorConfig>,
}

impl AwsWafCollector {
    pub fn new() -> Self {
        Self { config: None }
    }
}

#[async_trait]
impl Collector for AwsWafCollector {
    fn id(&self) -> &str {
        "waf-2"
    }

    fn connector_type(&self) -> &str {
        "waf"
    }

    fn vendor(&self) -> &str {
        "AWS WAF"
    }

    fn category(&self) -> &str {
        "Web Application Firewall"
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
        vec!["Kinesis", "S3", "CloudWatch"]
    }
}
