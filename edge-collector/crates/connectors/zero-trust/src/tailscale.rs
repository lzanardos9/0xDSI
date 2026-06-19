use async_trait::async_trait;
use anyhow::Result;
use oxdsi_core::{Collector, RawEvent};
use oxdsi_core::config::ConnectorConfig;

pub struct TailscaleCollector {
    config: Option<ConnectorConfig>,
}

impl TailscaleCollector {
    pub fn new() -> Self {
        Self { config: None }
    }
}

#[async_trait]
impl Collector for TailscaleCollector {
    fn id(&self) -> &str {
        "zt-4"
    }

    fn connector_type(&self) -> &str {
        "zero-trust"
    }

    fn vendor(&self) -> &str {
        "Tailscale"
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
        vec!["REST", "Webhook", "Audit Log"]
    }
}
