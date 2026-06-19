use crate::define_connector;

// Industrial PLC & OT Native Protocol Connectors
// These perform deep protocol inspection at the field-device layer

define_connector!(SiemensS7, "Siemens S7comm / S7comm-Plus", "siemens_s7", "plc_ot", "S7comm / S7comm-Plus (TCP/102)");
define_connector!(ModbusTcp, "Modbus TCP/RTU", "modbus_tcp", "plc_ot", "Modbus TCP (502) / Modbus RTU (Serial)");
define_connector!(EthernetIpCip, "EtherNet/IP & CIP", "ethernet_ip_cip", "plc_ot", "EtherNet/IP (TCP/44818, UDP/2222) / CIP");
define_connector!(OpcUa, "OPC UA", "opc_ua", "plc_ot", "OPC UA Binary (TCP/4840) / OPC UA HTTPS");
define_connector!(Dnp3, "DNP3 (IEEE 1815)", "dnp3", "plc_ot", "DNP3 TCP (20000) / DNP3 Serial");
define_connector!(Iec61850, "IEC 61850 / GOOSE / MMS", "iec_61850", "plc_ot", "GOOSE (Ethernet L2) / MMS (TCP/102) / SV");
define_connector!(Iec104, "IEC 60870-5-104", "iec_104", "plc_ot", "IEC 104 (TCP/2404)");
define_connector!(Profinet, "PROFINET / PROFIBUS", "profinet", "plc_ot", "PROFINET IO (Ethernet RT/IRT) / PROFIBUS DP");
define_connector!(Bacnet, "BACnet/IP", "bacnet", "plc_ot", "BACnet/IP (UDP/47808) / BACnet MS/TP");
define_connector!(HartIp, "HART-IP", "hart_ip", "plc_ot", "HART-IP (UDP/5094, TCP/5094) / HART (4-20mA FSK)");
define_connector!(FinsOmron, "FINS (Omron)", "fins_omron", "plc_ot", "FINS TCP/UDP (9600) / FINS Serial");
define_connector!(Melsec, "MELSEC (Mitsubishi)", "melsec", "plc_ot", "MC Protocol / SLMP (TCP/5000-5010)");
define_connector!(CcLink, "CC-Link IE / CC-Link", "cc_link", "plc_ot", "CC-Link IE (Gigabit Ethernet) / CC-Link (Serial)");
define_connector!(GeSrtp, "GE SRTP / EGD", "ge_srtp", "plc_ot", "SRTP (TCP/18245) / EGD (UDP multicast)");
define_connector!(CodesysV3, "CODESYS V3 Protocol", "codesys_v3", "plc_ot", "CODESYS V3 (TCP/11740, UDP/1740-1743)");
define_connector!(EtherCat, "EtherCAT", "ethercat", "plc_ot", "EtherCAT (Ethernet L2, EtherType 0x88A4)");
define_connector!(FoundationFieldbus, "Foundation Fieldbus / FF-HSE", "foundation_fieldbus", "plc_ot", "FF H1 (31.25 kbit/s) / FF HSE (Ethernet)");
define_connector!(YokogawaVnet, "Yokogawa CENTUM VP / Vnet/IP", "yokogawa_vnet", "plc_ot", "Vnet/IP (Proprietary) / OPC UA Gateway");
define_connector!(AbbAc800m, "ABB AC 800M / Freelance", "abb_ac800m", "plc_ot", "MMS (TCP/102) / OPC UA / ABB Proprietary");
define_connector!(HoneywellCda, "Honeywell Experion CDA", "honeywell_cda", "plc_ot", "CDA (Proprietary) / OPC UA / FTE");
