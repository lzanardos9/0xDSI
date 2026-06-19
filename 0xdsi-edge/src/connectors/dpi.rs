use crate::define_connector;

/// Deep Packet Inspection Engine
/// Wire-speed protocol analysis with zero-copy parsing (nom/winnow).
/// Reassembles TCP streams, decodes application-layer protocols,
/// extracts metadata without storing payloads.

define_connector!(DpiEngine, "Deep Packet Inspection Engine", "dpi_engine", "network",
    "libpcap / AF_PACKET / DPDK → L7 protocol decode");
