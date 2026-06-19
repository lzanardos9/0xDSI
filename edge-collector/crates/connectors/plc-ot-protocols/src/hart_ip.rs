use async_trait::async_trait;
use anyhow::Result;
use oxdsi_core::{Collector, RawEvent};
use oxdsi_core::config::ConnectorConfig;

pub struct HartIpCollector {
    config: Option<ConnectorConfig>,
}

impl HartIpCollector {
    pub fn new() -> Self {
        Self { config: None }
    }
}

#[async_trait]
impl Collector for HartIpCollector {
    fn id(&self) -> &str {
        "plc-10"
    }

    fn connector_type(&self) -> &str {
        "hart_ip"
    }

    fn vendor(&self) -> &str {
        "FieldComm Group"
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
        vec!["HART-IP UDP/5094", "HART-IP TCP/5094", "HART 4-20mA FSK"]
    }
}
