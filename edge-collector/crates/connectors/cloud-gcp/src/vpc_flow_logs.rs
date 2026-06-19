use async_trait::async_trait;
use anyhow::Result;
use oxdsi_core::{Collector, RawEvent};
use oxdsi_core::config::ConnectorConfig;

pub struct VpcFlowLogsCollector {
    config: Option<ConnectorConfig>,
}

impl VpcFlowLogsCollector {
    pub fn new() -> Self {
        Self { config: None }
    }
}

impl Default for VpcFlowLogsCollector {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl Collector for VpcFlowLogsCollector {
    fn id(&self) -> &str {
        "gcp-4"
    }

    fn connector_type(&self) -> &str {
        "vpc_flow_logs"
    }

    fn vendor(&self) -> &str {
        "Google"
    }

    fn category(&self) -> &str {
        "cloud-gcp"
    }

    async fn initialize(&mut self, config: ConnectorConfig) -> Result<()> {
        self.config = Some(config);
        Ok(())
    }

    async fn collect(&mut self) -> Result<Vec<RawEvent>> {
        // Pub/Sub / BigQuery collection
        Ok(vec![])
    }

    async fn health_check(&self) -> Result<bool> {
        Ok(true)
    }

    async fn shutdown(&mut self) -> Result<()> {
        Ok(())
    }

    fn supported_protocols(&self) -> Vec<&str> {
        vec!["Pub/Sub", "BigQuery"]
    }
}
