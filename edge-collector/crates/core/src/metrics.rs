use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use dashmap::DashMap;

#[derive(Debug, Clone)]
pub struct Metrics {
    pub counters: Arc<DashMap<String, AtomicU64>>,
    pub gauges: Arc<DashMap<String, AtomicU64>>,
}

impl Metrics {
    pub fn new() -> Self {
        Self {
            counters: Arc::new(DashMap::new()),
            gauges: Arc::new(DashMap::new()),
        }
    }

    pub fn increment(&self, name: &str, value: u64) {
        self.counters
            .entry(name.to_string())
            .or_insert_with(|| AtomicU64::new(0))
            .fetch_add(value, Ordering::Relaxed);
    }

    pub fn set_gauge(&self, name: &str, value: u64) {
        self.gauges
            .entry(name.to_string())
            .or_insert_with(|| AtomicU64::new(0))
            .store(value, Ordering::Relaxed);
    }

    pub fn get_counter(&self, name: &str) -> u64 {
        self.counters
            .get(name)
            .map(|v| v.load(Ordering::Relaxed))
            .unwrap_or(0)
    }
}

impl Default for Metrics {
    fn default() -> Self {
        Self::new()
    }
}
