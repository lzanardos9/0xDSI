pub mod kafka;
pub mod eventhub;
pub mod http;
pub mod buffer;

use async_trait::async_trait;
use anyhow::Result;
use bytes::Bytes;

#[async_trait]
pub trait Sink: Send + Sync + 'static {
    async fn send(&self, topic: &str, key: &[u8], payload: Bytes) -> Result<()>;
    async fn send_batch(&self, topic: &str, payloads: Vec<(Vec<u8>, Bytes)>) -> Result<()>;
    async fn flush(&self) -> Result<()>;
    fn is_connected(&self) -> bool;
}
