use async_trait::async_trait;
use anyhow::Result;
use oxdsi_core::{Collector, RawEvent};
use oxdsi_core::config::ConnectorConfig;

pub struct ZscalerZpaCollector {
    config: Option<ConnectorConfig>,
}

impl ZscalerZpaCollector {
    pub fn new() -> Self {
        Self { config: None }
    }
}

#[async_trait]
impl Collector for ZscalerZpaCollector {
    fn id(&self) -> &str {
        "zt-1"
    }

    fn connector_type(&self) -> &str {
        "zero-trust"
    }

    fn vendor(&self) -> &str {
        "Zscaler"
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
        vec!["Nanolog", "REST"]
    }
}
