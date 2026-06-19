use async_trait::async_trait;
use anyhow::Result;
use oxdsi_core::{Collector, RawEvent};
use oxdsi_core::config::ConnectorConfig;

pub struct NewRelicCollector {
    config: Option<ConnectorConfig>,
}

impl NewRelicCollector {
    pub fn new() -> Self {
        Self { config: None }
    }
}

#[async_trait]
impl Collector for NewRelicCollector {
    fn id(&self) -> &str {
        "obs-3"
    }

    fn connector_type(&self) -> &str {
        "observability"
    }

    fn vendor(&self) -> &str {
        "New Relic"
    }

    fn category(&self) -> &str {
        "Observability"
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
        vec!["REST", "Agent", "OpenTelemetry"]
    }
}
