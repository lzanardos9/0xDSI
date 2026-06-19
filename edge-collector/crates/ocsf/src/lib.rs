pub mod schema;
pub mod normalizer;
pub mod categories;

// OCSF class IDs
pub const OCSF_FILE_ACTIVITY: u32 = 1001;
pub const OCSF_PROCESS_ACTIVITY: u32 = 1007;
pub const OCSF_NETWORK_ACTIVITY: u32 = 4001;
pub const OCSF_DNS_ACTIVITY: u32 = 4003;
pub const OCSF_HTTP_ACTIVITY: u32 = 4002;
pub const OCSF_AUTHENTICATION: u32 = 3002;
pub const OCSF_AUTHORIZATION: u32 = 3003;
pub const OCSF_ENTITY_MGMT: u32 = 3004;
pub const OCSF_SECURITY_FINDING: u32 = 2001;
pub const OCSF_VULNERABILITY_FINDING: u32 = 2002;
pub const OCSF_COMPLIANCE_FINDING: u32 = 2003;
pub const OCSF_DETECTION_FINDING: u32 = 2004;
pub const OCSF_INCIDENT_FINDING: u32 = 2005;
pub const OCSF_ACCOUNT_CHANGE: u32 = 3001;
pub const OCSF_API_ACTIVITY: u32 = 6003;
pub const OCSF_WEB_RESOURCE: u32 = 6001;
pub const OCSF_EMAIL_ACTIVITY: u32 = 4009;
pub const OCSF_DEVICE_INVENTORY: u32 = 5001;
pub const OCSF_DATASTORE_ACTIVITY: u32 = 5005;

use serde::{Serialize, Deserialize};
use chrono::{DateTime, Utc};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OcsfEvent {
    pub class_uid: u32,
    pub category_uid: u32,
    pub severity_id: u8,
    pub activity_id: u32,
    pub type_uid: u32,
    pub time: DateTime<Utc>,
    pub message: Option<String>,
    pub metadata: OcsfMetadata,
    pub observables: Vec<Observable>,
    #[serde(flatten)]
    pub data: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OcsfMetadata {
    pub product: Product,
    pub version: String,
    pub uid: String,
    pub original_time: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Product {
    pub name: String,
    pub vendor_name: String,
    pub version: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Observable {
    pub name: String,
    pub value: String,
    pub type_id: u32,
}
