use bytes::Bytes;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RawEvent {
    pub id: Uuid,
    pub timestamp: DateTime<Utc>,
    pub source_connector: String,
    pub source_type: String,
    pub category: String,
    pub protocol: String,
    pub raw_data: Bytes,
    pub metadata: EventMetadata,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EventMetadata {
    pub collector_id: String,
    pub site: String,
    pub ingestion_time: DateTime<Utc>,
    pub original_source: String,
    pub encoding: DataEncoding,
    pub labels: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DataEncoding {
    Json,
    Cef,
    Leef,
    Syslog,
    Binary,
    Csv,
    Xml,
    Protobuf,
    Avro,
    Custom(String),
}

impl RawEvent {
    pub fn new(
        source_connector: impl Into<String>,
        source_type: impl Into<String>,
        category: impl Into<String>,
        protocol: impl Into<String>,
        raw_data: Bytes,
        collector_id: impl Into<String>,
        site: impl Into<String>,
        original_source: impl Into<String>,
        encoding: DataEncoding,
    ) -> Self {
        let now = Utc::now();
        Self {
            id: Uuid::new_v4(),
            timestamp: now,
            source_connector: source_connector.into(),
            source_type: source_type.into(),
            category: category.into(),
            protocol: protocol.into(),
            raw_data,
            metadata: EventMetadata {
                collector_id: collector_id.into(),
                site: site.into(),
                ingestion_time: now,
                original_source: original_source.into(),
                encoding,
                labels: HashMap::new(),
            },
        }
    }
}
