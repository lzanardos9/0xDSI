use async_trait::async_trait;
use anyhow::Result;
use crate::event::RawEvent;
use crate::config::ConnectorConfig;

#[async_trait]
pub trait Collector: Send + Sync + 'static {
    fn id(&self) -> &str;
    fn connector_type(&self) -> &str;
    fn vendor(&self) -> &str;
    fn category(&self) -> &str;

    async fn initialize(&mut self, config: ConnectorConfig) -> Result<()>;
    async fn collect(&mut self) -> Result<Vec<RawEvent>>;
    async fn health_check(&self) -> Result<bool>;
    async fn shutdown(&mut self) -> Result<()>;

    fn supported_protocols(&self) -> Vec<&str>;
}
