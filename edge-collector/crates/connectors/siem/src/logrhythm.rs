use async_trait::async_trait;
use anyhow::Result;
use oxdsi_core::{Collector, RawEvent};
use oxdsi_core::config::ConnectorConfig;

pub struct LogRhythmCollector {
    config: Option<ConnectorConfig>,
}

impl LogRhythmCollector {
    pub fn new() -> Self {
        Self { config: None }
    }
}

impl Default for LogRhythmCollector {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl Collector for LogRhythmCollector {
    fn id(&self) -> &str {
        "siem-6"
    }

    fn connector_type(&self) -> &str {
        "logrhythm"
    }

    fn vendor(&self) -> &str {
        "LogRhythm"
    }

    fn category(&self) -> &str {
        "siem"
    }

    async fn initialize(&mut self, config: ConnectorConfig) -> Result<()> {
        self.config = Some(config);
        Ok(())
    }

    async fn collect(&mut self) -> Result<Vec<RawEvent>> {
        // System Monitor / Syslog collection
        Ok(vec![])
    }

    async fn health_check(&self) -> Result<bool> {
        Ok(true)
    }

    async fn shutdown(&mut self) -> Result<()> {
        Ok(())
    }

    fn supported_protocols(&self) -> Vec<&str> {
        vec!["System Monitor", "Syslog"]
    }
}
