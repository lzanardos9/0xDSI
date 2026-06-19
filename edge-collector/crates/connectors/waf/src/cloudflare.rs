use async_trait::async_trait;
use anyhow::Result;
use oxdsi_core::{Collector, RawEvent};
use oxdsi_core::config::ConnectorConfig;

pub struct CloudflareCollector {
    config: Option<ConnectorConfig>,
}

impl CloudflareCollector {
    pub fn new() -> Self {
        Self { config: None }
    }
}

#[async_trait]
impl Collector for CloudflareCollector {
    fn id(&self) -> &str {
        "waf-1"
    }

    fn connector_type(&self) -> &str {
        "waf"
    }

    fn vendor(&self) -> &str {
        "Cloudflare"
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
        vec!["Logpush S3", "Logpush R2", "GraphQL"]
    }
}
