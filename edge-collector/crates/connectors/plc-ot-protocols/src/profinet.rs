use async_trait::async_trait;
use anyhow::Result;
use oxdsi_core::{Collector, RawEvent};
use oxdsi_core::config::ConnectorConfig;

pub struct ProfinetCollector {
    config: Option<ConnectorConfig>,
}

impl ProfinetCollector {
    pub fn new() -> Self {
        Self { config: None }
    }
}

#[async_trait]
impl Collector for ProfinetCollector {
    fn id(&self) -> &str {
        "plc-8"
    }

    fn connector_type(&self) -> &str {
        "profinet_profibus"
    }

    fn vendor(&self) -> &str {
        "Siemens / PI International"
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
        vec!["PROFINET IO", "PROFINET RT", "PROFINET IRT", "PROFIBUS DP"]
    }
}
