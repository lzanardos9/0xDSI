use anyhow::Result;
use crate::collector::Collector;
use crate::config::EdgeConfig;
use crate::event::RawEvent;
use crate::metrics::Metrics;
use std::sync::Arc;
use tokio::sync::mpsc;
use tracing::info;

pub struct Pipeline {
    pub config: EdgeConfig,
    pub metrics: Arc<Metrics>,
    pub event_tx: mpsc::Sender<Vec<RawEvent>>,
    pub event_rx: mpsc::Receiver<Vec<RawEvent>>,
    pub collectors: Vec<Box<dyn Collector>>,
}

impl Pipeline {
    pub fn new(config: EdgeConfig) -> Self {
        let (event_tx, event_rx) = mpsc::channel(10_000);
        Self {
            config,
            metrics: Arc::new(Metrics::new()),
            event_tx,
            event_rx,
            collectors: Vec::new(),
        }
    }

    pub fn register_collector(&mut self, collector: Box<dyn Collector>) {
        info!(
            connector_type = collector.connector_type(),
            vendor = collector.vendor(),
            "Registered collector"
        );
        self.collectors.push(collector);
    }

    pub async fn start(&mut self) -> Result<()> {
        info!(
            agent_id = %self.config.agent.id,
            site = %self.config.agent.site,
            connectors = self.collectors.len(),
            "Starting 0xDSI Edge Pipeline"
        );
        Ok(())
    }
}
