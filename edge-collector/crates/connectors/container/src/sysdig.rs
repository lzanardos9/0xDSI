use async_trait::async_trait;
use anyhow::Result;
use oxdsi_core::{Collector, RawEvent};
use oxdsi_core::config::ConnectorConfig;

pub struct SysdigCollector {
    config: Option<ConnectorConfig>,
}

impl SysdigCollector {
    pub fn new() -> Self {
        Self { config: None }
    }
}

#[async_trait]
impl Collector for SysdigCollector {
    fn id(&self) -> &str {
        "k8s-3"
    }

    fn connector_type(&self) -> &str {
        "container-security"
    }

    fn vendor(&self) -> &str {
        "Sysdig"
    }

    fn category(&self) -> &str {
        "Container Security"
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
        vec!["REST", "Syslog", "Event Forwarding"]
    }
}
