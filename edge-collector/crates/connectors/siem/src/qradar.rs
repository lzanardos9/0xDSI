use async_trait::async_trait;
use anyhow::Result;
use oxdsi_core::{Collector, RawEvent};
use oxdsi_core::config::ConnectorConfig;

pub struct QRadarCollector {
    config: Option<ConnectorConfig>,
}

impl QRadarCollector {
    pub fn new() -> Self {
        Self { config: None }
    }
}

impl Default for QRadarCollector {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl Collector for QRadarCollector {
    fn id(&self) -> &str {
        "siem-2"
    }

    fn connector_type(&self) -> &str {
        "qradar"
    }

    fn vendor(&self) -> &str {
        "IBM"
    }

    fn category(&self) -> &str {
        "siem"
    }

    async fn initialize(&mut self, config: ConnectorConfig) -> Result<()> {
        self.config = Some(config);
        Ok(())
    }

    async fn collect(&mut self) -> Result<Vec<RawEvent>> {
        // Log Source / STIX collection
        Ok(vec![])
    }

    async fn health_check(&self) -> Result<bool> {
        Ok(true)
    }

    async fn shutdown(&mut self) -> Result<()> {
        Ok(())
    }

    fn supported_protocols(&self) -> Vec<&str> {
        vec!["Log Source", "STIX"]
    }
}
