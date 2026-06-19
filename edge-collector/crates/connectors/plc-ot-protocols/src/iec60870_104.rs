use async_trait::async_trait;
use anyhow::Result;
use oxdsi_core::{Collector, RawEvent};
use oxdsi_core::config::ConnectorConfig;

pub struct Iec104Collector {
    config: Option<ConnectorConfig>,
}

impl Iec104Collector {
    pub fn new() -> Self {
        Self { config: None }
    }
}

#[async_trait]
impl Collector for Iec104Collector {
    fn id(&self) -> &str {
        "plc-7"
    }

    fn connector_type(&self) -> &str {
        "iec_60870_5_104"
    }

    fn vendor(&self) -> &str {
        "IEC"
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
        vec!["IEC 104", "TCP/2404"]
    }
}
