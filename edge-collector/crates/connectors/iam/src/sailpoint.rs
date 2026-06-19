use async_trait::async_trait;
use anyhow::Result;
use oxdsi_core::{Collector, RawEvent};
use oxdsi_core::config::ConnectorConfig;

pub struct SailPointCollector {
    config: Option<ConnectorConfig>,
}

impl SailPointCollector {
    pub fn new() -> Self {
        Self { config: None }
    }
}

impl Default for SailPointCollector {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl Collector for SailPointCollector {
    fn id(&self) -> &str {
        "iam-5"
    }

    fn connector_type(&self) -> &str {
        "sailpoint"
    }

    fn vendor(&self) -> &str {
        "SailPoint"
    }

    fn category(&self) -> &str {
        "iam"
    }

    async fn initialize(&mut self, config: ConnectorConfig) -> Result<()> {
        self.config = Some(config);
        Ok(())
    }

    async fn collect(&mut self) -> Result<Vec<RawEvent>> {
        // REST / Event Trigger collection
        Ok(vec![])
    }

    async fn health_check(&self) -> Result<bool> {
        Ok(true)
    }

    async fn shutdown(&mut self) -> Result<()> {
        Ok(())
    }

    fn supported_protocols(&self) -> Vec<&str> {
        vec!["REST", "Event Trigger"]
    }
}
