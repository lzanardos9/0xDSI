use async_trait::async_trait;
use anyhow::Result;
use oxdsi_core::{Collector, RawEvent};
use oxdsi_core::config::ConnectorConfig;

pub struct CloudflareGatewayCollector {
    config: Option<ConnectorConfig>,
}

impl CloudflareGatewayCollector {
    pub fn new() -> Self {
        Self { config: None }
    }
}

#[async_trait]
impl Collector for CloudflareGatewayCollector {
    fn id(&self) -> &str {
        "dns-4"
    }

    fn connector_type(&self) -> &str {
        "dns-security"
    }

    fn vendor(&self) -> &str {
        "Cloudflare"
    }

    fn category(&self) -> &str {
        "DNS Security"
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
        vec!["Logpush", "REST"]
    }
}
