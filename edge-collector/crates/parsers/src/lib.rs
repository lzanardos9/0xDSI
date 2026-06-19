pub mod syslog;
pub mod cef;
pub mod leef;
pub mod json_lines;
pub mod xml;
pub mod csv;
pub mod modbus;
pub mod s7comm;
pub mod dnp3;
pub mod opc_ua;
pub mod ethernet_ip;
pub mod iec104;
pub mod goose;
pub mod profinet;
pub mod bacnet;

use anyhow::Result;
use bytes::Bytes;
use oxdsi_ocsf::OcsfEvent;

pub trait Parser: Send + Sync {
    fn parse(&self, raw: &Bytes) -> Result<Vec<OcsfEvent>>;
    fn supported_formats(&self) -> Vec<&str>;
}
