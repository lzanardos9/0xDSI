use async_trait::async_trait;
use anyhow::Result;
use oxdsi_core::{Collector, RawEvent};
use oxdsi_core::config::ConnectorConfig;

pub struct JuniperSrxCollector {
    config: Option<ConnectorConfig>,
}

impl JuniperSrxCollector {
    pub fn new() -> Self {
        Self { config: None }
    }
}

impl Default for JuniperSrxCollector {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl Collector for JuniperSrxCollector {
    fn id(&self) -> &str {
        "fw-5"
    }

    fn connector_type(&self) -> &str {
        "juniper_srx"
    }

    fn vendor(&self) -> &str {
        "Juniper"
    }

    fn category(&self) -> &str {
        "firewall"
    }

    async fn initialize(&mut self, config: ConnectorConfig) -> Result<()> {
        self.config = Some(config);
        Ok(())
    }

    async fn collect(&mut self) -> Result<Vec<RawEvent>> {
        // Syslog / NETCONF / REST collection
        Ok(vec![])
    }

    async fn health_check(&self) -> Result<bool> {
        Ok(true)
    }

    async fn shutdown(&mut self) -> Result<()> {
        Ok(())
    }

    fn supported_protocols(&self) -> Vec<&str> {
        vec!["Syslog", "NETCONF", "REST"]
    }
}
