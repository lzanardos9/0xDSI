use async_trait::async_trait;
use anyhow::Result;
use oxdsi_core::{Collector, RawEvent};
use oxdsi_core::config::ConnectorConfig;

pub struct NodeShimCollector {
    config: Option<ConnectorConfig>,
}

impl NodeShimCollector {
    pub fn new() -> Self { Self { config: None } }
}

#[async_trait]
impl Collector for NodeShimCollector {
    fn id(&self) -> &str { "bytecode-5" }
    fn connector_type(&self) -> &str { "node_module_shimming" }
    fn vendor(&self) -> &str { "0xDSI" }
    fn category(&self) -> &str { "instrumentation" }

    async fn initialize(&mut self, config: ConnectorConfig) -> Result<()> {
        self.config = Some(config);
        Ok(())
    }

    async fn collect(&mut self) -> Result<Vec<RawEvent>> {
        // Node.js module shimming for require/import hooks.
        // Intercepts: HTTP requests, database queries, file system ops,
        // child_process spawns, crypto operations, eval usage.
        Ok(vec![])
    }

    async fn health_check(&self) -> Result<bool> { Ok(true) }
    async fn shutdown(&mut self) -> Result<()> { Ok(()) }

    fn supported_protocols(&self) -> Vec<&str> {
        vec!["require() hook", "import() hook", "AsyncLocalStorage"]
    }
}
