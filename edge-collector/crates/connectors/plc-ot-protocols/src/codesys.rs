use async_trait::async_trait;
use anyhow::Result;
use oxdsi_core::{Collector, RawEvent};
use oxdsi_core::config::ConnectorConfig;

pub struct CodesysCollector {
    config: Option<ConnectorConfig>,
}

impl CodesysCollector {
    pub fn new() -> Self {
        Self { config: None }
    }
}

#[async_trait]
impl Collector for CodesysCollector {
    fn id(&self) -> &str {
        "plc-15"
    }

    fn connector_type(&self) -> &str {
        "codesys_v3"
    }

    fn vendor(&self) -> &str {
        "CODESYS GmbH"
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
        vec!["CODESYS V3", "TCP/11740", "UDP/1740-1743"]
    }
}
