use async_trait::async_trait;
use anyhow::Result;
use oxdsi_core::{Collector, RawEvent};
use oxdsi_core::config::ConnectorConfig;

pub struct Microsoft365Collector {
    config: Option<ConnectorConfig>,
}

impl Microsoft365Collector {
    pub fn new() -> Self {
        Self { config: None }
    }
}

#[async_trait]
impl Collector for Microsoft365Collector {
    fn id(&self) -> &str {
        "collab-2"
    }

    fn connector_type(&self) -> &str {
        "collaboration"
    }

    fn vendor(&self) -> &str {
        "Microsoft"
    }

    fn category(&self) -> &str {
        "Collaboration"
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
        vec!["Management Activity API", "Streaming"]
    }
}
