use anyhow::Result;
use async_trait::async_trait;
use crossbeam_channel::Sender;

use crate::config::ConnectorConfig;
use crate::ocsf::OcsfEvent;

#[async_trait]
pub trait Connector: Send + Sync + 'static {
    fn name(&self) -> &'static str;
    fn connector_type(&self) -> &'static str;
    fn category(&self) -> &'static str;

    async fn run(&self, tx: Sender<OcsfEvent>) -> Result<()>;
    async fn health_check(&self) -> Result<bool> { Ok(true) }
    fn metrics(&self) -> ConnectorMetrics { ConnectorMetrics::default() }
}

#[derive(Debug, Default, Clone)]
pub struct ConnectorMetrics {
    pub events_received: u64,
    pub events_emitted: u64,
    pub errors: u64,
    pub bytes_processed: u64,
    pub last_event_time: Option<chrono::DateTime<chrono::Utc>>,
}

/// Helper macro to generate a connector struct with the standard from_config pattern
#[macro_export]
macro_rules! define_connector {
    ($struct_name:ident, $name:expr, $ctype:expr, $category:expr, $protocol:expr) => {
        pub struct $struct_name {
            pub config: crate::config::ConnectorConfig,
            pub protocol: &'static str,
        }

        impl $struct_name {
            pub fn from_config(config: &crate::config::ConnectorConfig) -> anyhow::Result<Self> {
                Ok(Self {
                    config: config.clone(),
                    protocol: $protocol,
                })
            }
        }

        #[async_trait::async_trait]
        impl crate::connectors::traits::Connector for $struct_name {
            fn name(&self) -> &'static str { $name }
            fn connector_type(&self) -> &'static str { $ctype }
            fn category(&self) -> &'static str { $category }

            async fn run(&self, tx: crossbeam_channel::Sender<crate::ocsf::OcsfEvent>) -> anyhow::Result<()> {
                tracing::info!(
                    connector = self.name(),
                    protocol = self.protocol,
                    "Connector started"
                );
                // Protocol-specific collection loop goes here
                // Each connector will poll/listen based on its protocol
                loop {
                    tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;
                }
            }
        }
    };
}
