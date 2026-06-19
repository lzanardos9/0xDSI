use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OcsfEvent {
    pub metadata: EventMetadata,
    pub class_uid: u32,
    pub category_uid: u32,
    pub severity_id: u8,
    pub activity_id: u16,
    pub type_uid: u32,
    pub time: DateTime<Utc>,
    pub observables: Vec<Observable>,
    pub raw_data: Option<String>,
    pub unmapped: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EventMetadata {
    pub uid: String,
    pub version: String,
    pub product: ProductInfo,
    pub logged_time: DateTime<Utc>,
    pub original_time: Option<DateTime<Utc>>,
    pub connector_id: String,
    pub tenant_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProductInfo {
    pub name: String,
    pub vendor_name: String,
    pub version: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Observable {
    pub name: String,
    pub value: String,
    pub type_id: u8,
}

// OCSF Category UIDs
pub const CATEGORY_SYSTEM: u32 = 1;
pub const CATEGORY_FINDINGS: u32 = 2;
pub const CATEGORY_IDENTITY: u32 = 3;
pub const CATEGORY_NETWORK: u32 = 4;
pub const CATEGORY_DISCOVERY: u32 = 5;
pub const CATEGORY_APPLICATION: u32 = 6;

// OCSF Class UIDs
pub const CLASS_PROCESS_ACTIVITY: u32 = 1001;
pub const CLASS_FILE_ACTIVITY: u32 = 1002;
pub const CLASS_NETWORK_ACTIVITY: u32 = 4001;
pub const CLASS_HTTP_ACTIVITY: u32 = 4002;
pub const CLASS_DNS_ACTIVITY: u32 = 4003;
pub const CLASS_AUTH_ACTIVITY: u32 = 3002;
pub const CLASS_SECURITY_FINDING: u32 = 2001;
pub const CLASS_VULNERABILITY_FINDING: u32 = 2002;
pub const CLASS_DETECTION_FINDING: u32 = 2004;
pub const CLASS_COMPLIANCE_FINDING: u32 = 2003;
pub const CLASS_EMAIL_ACTIVITY: u32 = 4009;
pub const CLASS_API_ACTIVITY: u32 = 6003;
pub const CLASS_WEB_RESOURCE: u32 = 6004;
pub const CLASS_REGISTRY_ACTIVITY: u32 = 1006;
pub const CLASS_KERNEL_ACTIVITY: u32 = 1005;
pub const CLASS_MODULE_ACTIVITY: u32 = 1007;

impl OcsfEvent {
    pub fn new(class_uid: u32, category_uid: u32, connector_id: &str) -> Self {
        Self {
            metadata: EventMetadata {
                uid: Uuid::new_v4().to_string(),
                version: "1.1.0".into(),
                product: ProductInfo {
                    name: "0xDSI Edge".into(),
                    vendor_name: "0xDSI".into(),
                    version: Some(env!("CARGO_PKG_VERSION").into()),
                },
                logged_time: Utc::now(),
                original_time: None,
                connector_id: connector_id.into(),
                tenant_id: None,
            },
            class_uid,
            category_uid,
            severity_id: 1,
            activity_id: 0,
            type_uid: class_uid * 100,
            time: Utc::now(),
            observables: Vec::new(),
            raw_data: None,
            unmapped: serde_json::Value::Null,
        }
    }

    pub fn with_severity(mut self, severity: u8) -> Self {
        self.severity_id = severity;
        self
    }

    pub fn with_observable(mut self, name: &str, value: &str, type_id: u8) -> Self {
        self.observables.push(Observable {
            name: name.into(),
            value: value.into(),
            type_id,
        });
        self
    }

    pub fn with_raw(mut self, raw: String) -> Self {
        self.raw_data = Some(raw);
        self
    }

    pub fn serialized_size(&self) -> usize {
        serde_json::to_vec(self).map(|v| v.len()).unwrap_or(0)
    }
}
