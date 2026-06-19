use async_trait::async_trait;
use anyhow::Result;
use oxdsi_core::{Collector, RawEvent};
use oxdsi_core::config::ConnectorConfig;

pub struct CloudflareAccessCollector {
    config: Option<ConnectorConfig>,
}

impl CloudflareAccessCollector {
    pub fn new() -> Self {
        Self { config: None }
    }
}

#[async_trait]
impl Collector for CloudflareAccessCollector {
    fn id(&self) -> &str {
        "zt-2"
    }

    fn connector_type(&self) -> &str {
        "zero-trust"
    }

    fn vendor(&self) -> &str {
        "Cloudflare"
    }

    fn category(&self) -> &str {
        "Zero Trust"
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
