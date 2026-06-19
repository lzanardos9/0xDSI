use async_trait::async_trait;
use anyhow::Result;
use oxdsi_core::{Collector, RawEvent};
use oxdsi_core::config::ConnectorConfig;

pub struct ElasticCollector {
    config: Option<ConnectorConfig>,
}

impl ElasticCollector {
    pub fn new() -> Self {
        Self { config: None }
    }
}

impl Default for ElasticCollector {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl Collector for ElasticCollector {
    fn id(&self) -> &str {
        "siem-4"
    }

    fn connector_type(&self) -> &str {
        "elastic_stack"
    }

    fn vendor(&self) -> &str {
        "Elastic"
    }

    fn category(&self) -> &str {
        "siem"
    }

    async fn initialize(&mut self, config: ConnectorConfig) -> Result<()> {
        self.config = Some(config);
        Ok(())
    }

    async fn collect(&mut self) -> Result<Vec<RawEvent>> {
        // Fleet / Logstash / Beats collection
        Ok(vec![])
    }

    async fn health_check(&self) -> Result<bool> {
        Ok(true)
    }

    async fn shutdown(&mut self) -> Result<()> {
        Ok(())
    }

    fn supported_protocols(&self) -> Vec<&str> {
        vec!["Fleet", "Logstash", "Beats"]
    }
}
