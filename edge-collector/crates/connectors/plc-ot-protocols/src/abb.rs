use async_trait::async_trait;
use anyhow::Result;
use oxdsi_core::{Collector, RawEvent};
use oxdsi_core::config::ConnectorConfig;

pub struct AbbCollector {
    config: Option<ConnectorConfig>,
}

impl AbbCollector {
    pub fn new() -> Self {
        Self { config: None }
    }
}

#[async_trait]
impl Collector for AbbCollector {
    fn id(&self) -> &str {
        "plc-19"
    }

    fn connector_type(&self) -> &str {
        "abb_ac800m"
    }

    fn vendor(&self) -> &str {
        "ABB"
    }

    fn category(&self) -> &str {
        "plc_ot_protocols"
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
        vec!["MMS", "OPC UA", "ABB Proprietary"]
    }
}
