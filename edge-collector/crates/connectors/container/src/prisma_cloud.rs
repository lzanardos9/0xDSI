use async_trait::async_trait;
use anyhow::Result;
use oxdsi_core::{Collector, RawEvent};
use oxdsi_core::config::ConnectorConfig;

pub struct PrismaCloudCollector {
    config: Option<ConnectorConfig>,
}

impl PrismaCloudCollector {
    pub fn new() -> Self {
        Self { config: None }
    }
}

#[async_trait]
impl Collector for PrismaCloudCollector {
    fn id(&self) -> &str {
        "k8s-2"
    }

    fn connector_type(&self) -> &str {
        "container-security"
    }

    fn vendor(&self) -> &str {
        "Palo Alto Prisma Cloud"
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
        vec!["REST", "Webhook"]
    }
}
