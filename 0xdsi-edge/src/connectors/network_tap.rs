use crate::define_connector;

/// Network TAP Connectors
/// Physical or virtual mirroring / inline interception

// SPAN port mirroring (passive)
define_connector!(SpanMirror, "SPAN Port Mirror", "network_tap_span", "network",
    "SPAN / RSPAN / ERSPAN → pcap capture");

// Inline TAP (active, break-before-make)
define_connector!(InlineTap, "Inline Network TAP", "network_tap_inline", "network",
    "Inline TAP → full-duplex capture → forwarding");

// SNMP Trap receiver
define_connector!(SnmpTrap, "SNMP Trap Receiver", "snmp_trap", "network",
    "SNMP v2c/v3 Trap (UDP/162)");

// NetFlow / IPFIX / sFlow collector
define_connector!(NetflowIpfix, "NetFlow/IPFIX/sFlow Collector", "netflow_ipfix", "network",
    "NetFlow v5/v9 / IPFIX (UDP/2055) / sFlow (UDP/6343)");
