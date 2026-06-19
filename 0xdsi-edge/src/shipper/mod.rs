use anyhow::Result;
use crossbeam_channel::Receiver;
use tracing::{info, warn};

use crate::buffer::RocksBuffer;
use crate::config::ShipperConfig;
use crate::ocsf::OcsfEvent;

pub struct Shipper {
    config: ShipperConfig,
}

impl Shipper {
    pub async fn new(config: &ShipperConfig) -> Result<Self> {
        info!(transport = ?config.transport, "Shipper initialized");
        Ok(Self { config: config.clone() })
    }

    async fn send_batch(&self, events: &[OcsfEvent]) -> Result<()> {
        match self.config.transport {
            crate::config::TransportType::Kafka => {
                self.send_kafka(events).await
            }
            crate::config::TransportType::EventHub => {
                self.send_eventhub(events).await
            }
            crate::config::TransportType::Https => {
                self.send_https(events).await
            }
        }
    }

    async fn send_kafka(&self, events: &[OcsfEvent]) -> Result<()> {
        let kafka_cfg = self.config.kafka.as_ref()
            .ok_or_else(|| anyhow::anyhow!("Kafka config required for kafka transport"))?;

        // Production: use rdkafka producer to send Arrow IPC batches
        // to the configured topic on the Kafka/EventHub brokers
        let _ = (kafka_cfg, events);
        Ok(())
    }

    async fn send_eventhub(&self, events: &[OcsfEvent]) -> Result<()> {
        let eh_cfg = self.config.eventhub.as_ref()
            .ok_or_else(|| anyhow::anyhow!("EventHub config required"))?;

        // Production: use AMQP over TLS to Azure Event Hub
        let _ = (eh_cfg, events);
        Ok(())
    }

    async fn send_https(&self, events: &[OcsfEvent]) -> Result<()> {
        let https_cfg = self.config.https.as_ref()
            .ok_or_else(|| anyhow::anyhow!("HTTPS config required"))?;

        // Production: POST JSON-lines or Arrow IPC to HTTPS endpoint
        let _ = (https_cfg, events);
        Ok(())
    }
}

pub async fn run(shipper: Shipper, buffer: RocksBuffer, rx: Receiver<OcsfEvent>) -> Result<()> {
    let mut batch: Vec<OcsfEvent> = Vec::with_capacity(1000);
    let flush_interval = tokio::time::Duration::from_millis(1000);
    let mut interval = tokio::time::interval(flush_interval);

    loop {
        tokio::select! {
            _ = interval.tick() => {
                if !batch.is_empty() {
                    match shipper.send_batch(&batch).await {
                        Ok(_) => {
                            let ids: Vec<String> = batch.iter()
                                .map(|e| e.metadata.uid.clone())
                                .collect();
                            let _ = buffer.acknowledge(&ids);
                            batch.clear();
                        }
                        Err(e) => {
                            warn!(error = %e, count = batch.len(), "Ship failed, buffering");
                            for event in &batch {
                                let _ = buffer.enqueue(event);
                            }
                            batch.clear();
                        }
                    }
                }
            }
            _ = tokio::task::spawn_blocking({
                let rx = rx.clone();
                move || rx.recv()
            }) => {
                while let Ok(event) = rx.try_recv() {
                    batch.push(event);
                    if batch.len() >= 1000 {
                        break;
                    }
                }
            }
        }
    }
}
