use async_trait::async_trait;
use anyhow::Result;
use oxdsi_core::{Collector, RawEvent};
use oxdsi_core::config::ConnectorConfig;

pub struct Dnp3Collector {
    config: Option<ConnectorConfig>,
}

impl Dnp3Collector {
    pub fn new() -> Self {
        Self { config: None }
    }
}

#[async_trait]
impl Collector for Dnp3Collector {
    fn id(&self) -> &str {
        "plc-5"
    }

    fn connector_type(&self) -> &str {
        "dnp3"
    }

    fn vendor(&self) -> &str {
        "IEEE / DNP Users Group"
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
        vec!["DNP3 TCP", "DNP3 Serial", "TCP/20000"]
    }
}
