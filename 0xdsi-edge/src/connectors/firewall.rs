use crate::define_connector;

define_connector!(PaloAltoNgfw, "Palo Alto Networks NGFW", "paloalto_ngfw", "firewall", "Syslog / Cortex Data Lake API");
define_connector!(FortinetFortigate, "Fortinet FortiGate", "fortinet_fortigate", "firewall", "Syslog / FortiAnalyzer API");
define_connector!(CheckPointQuantum, "Check Point Quantum", "checkpoint_quantum", "firewall", "LEA / OPSEC / Syslog");
define_connector!(CiscoFirewall, "Cisco Secure Firewall", "cisco_firewall", "firewall", "eStreamer / Syslog / REST API");
define_connector!(JuniperSrx, "Juniper SRX Series", "juniper_srx", "firewall", "Syslog / NETCONF / REST API");
