use anyhow::Result;
use crate::config::BufferConfig;
use crate::ocsf::OcsfEvent;
use tracing::info;

pub struct RocksBuffer {
    path: String,
    max_size_bytes: u64,
}

impl RocksBuffer {
    pub fn new(config: &BufferConfig) -> Result<Self> {
        std::fs::create_dir_all(&config.path)?;
        info!(path = %config.path, max_mb = config.max_size_mb, "Buffer initialized");
        Ok(Self {
            path: config.path.clone(),
            max_size_bytes: config.max_size_mb * 1024 * 1024,
        })
    }

    pub fn enqueue(&self, event: &OcsfEvent) -> Result<()> {
        // In production: serialize to RocksDB with monotonic key
        // This ensures events survive restarts and network partitions
        let _key = event.metadata.uid.as_bytes();
        let _value = serde_json::to_vec(event)?;
        Ok(())
    }

    pub fn dequeue_batch(&self, max_count: usize) -> Result<Vec<OcsfEvent>> {
        // In production: read oldest N entries from RocksDB, return them
        let _ = max_count;
        Ok(Vec::new())
    }

    pub fn acknowledge(&self, event_ids: &[String]) -> Result<()> {
        // In production: delete acknowledged entries from RocksDB
        let _ = event_ids;
        Ok(())
    }

    pub fn size_bytes(&self) -> u64 {
        // In production: return actual RocksDB disk usage
        0
    }

    pub fn is_full(&self) -> bool {
        self.size_bytes() >= self.max_size_bytes
    }

    pub fn path(&self) -> &str {
        &self.path
    }
}
