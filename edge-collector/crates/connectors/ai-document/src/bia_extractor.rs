use async_trait::async_trait;
use anyhow::Result;
use oxdsi_core::{Collector, RawEvent};
use oxdsi_core::config::ConnectorConfig;

pub struct BiaExtractorCollector {
    config: Option<ConnectorConfig>,
}
impl BiaExtractorCollector {
    pub fn new() -> Self { Self { config: None } }
}
#[async_trait]
impl Collector for BiaExtractorCollector {
    fn id(&self) -> &str { "ai-doc-3" }
    fn connector_type(&self) -> &str { "ai_bia_extractor" }
    fn vendor(&self) -> &str { "0xDSI" }
    fn category(&self) -> &str { "ai_document_analysis" }
    async fn initialize(&mut self, config: ConnectorConfig) -> Result<()> { self.config = Some(config); Ok(()) }
    async fn collect(&mut self) -> Result<Vec<RawEvent>> { Ok(vec![]) }
    async fn health_check(&self) -> Result<bool> { Ok(true) }
    async fn shutdown(&mut self) -> Result<()> { Ok(()) }
    fn supported_protocols(&self) -> Vec<&str> { vec!["BIA Document Parsing", "RTO/RPO Extraction"] }
}
