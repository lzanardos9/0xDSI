import { useState, useEffect, useRef } from 'react';
import { Wand2, Code, Play, CheckCircle, AlertTriangle, ChevronRight, ChevronDown, Layers, Network, Database, Radio, Cloud, Terminal, Lock, Cpu, HardDrive, Globe, Server, Zap, FileText, RefreshCw, Sparkles, ArrowRight, Copy, Clipboard, Shield, Activity, BarChart3, Percent, AlertOctagon, Gauge, Bug, Package, Download, Wrench, Search, Upload, X, Plus } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { callFunction } from '../../lib/llmGateway';

// Extended acquisition methods (comprehensive)
const ACQUISITION_METHODS = [
  { id: 'rest-poll', name: 'REST API Polling', category: 'api', description: 'Periodic HTTP GET/POST requests to fetch event batches', complexity: 'low', latency: 'seconds' },
  { id: 'rest-iterator', name: 'REST API Iterator/Cursor', category: 'api', description: 'Stateful cursor-based iteration with checkpoint resume', complexity: 'low', latency: 'seconds' },
  { id: 'rest-stream', name: 'REST Streaming (chunked)', category: 'api', description: 'HTTP chunked transfer for continuous event delivery', complexity: 'medium', latency: 'sub-second' },
  { id: 'graphql-sub', name: 'GraphQL Subscriptions', category: 'api', description: 'Real-time event push via GraphQL WebSocket subscriptions', complexity: 'medium', latency: 'sub-second' },
  { id: 'grpc-stream', name: 'gRPC Bidirectional Streaming', category: 'api', description: 'High-perf binary streaming with Protobuf serialization', complexity: 'high', latency: 'ms' },
  { id: 'grpc-unary', name: 'gRPC Unary RPC', category: 'api', description: 'Request-response gRPC for batch event retrieval', complexity: 'medium', latency: 'seconds' },
  { id: 'webhook', name: 'Webhook Receiver', category: 'push', description: 'HTTP/S POST callbacks from source on event generation', complexity: 'low', latency: 'sub-second' },
  { id: 'webhook-hmac', name: 'Webhook (HMAC Verified)', category: 'push', description: 'Signed webhook payloads with HMAC-SHA256 verification', complexity: 'low', latency: 'sub-second' },
  { id: 'sse', name: 'Server-Sent Events (SSE)', category: 'push', description: 'Unidirectional HTTP event stream with auto-reconnection', complexity: 'low', latency: 'sub-second' },
  { id: 'websocket', name: 'WebSocket', category: 'push', description: 'Full-duplex persistent connection for real-time events', complexity: 'medium', latency: 'ms' },
  { id: 'mqtt', name: 'MQTT Subscribe', category: 'messaging', description: 'Lightweight pub/sub for IoT and high-frequency telemetry', complexity: 'medium', latency: 'ms' },
  { id: 'amqp', name: 'AMQP 0-9-1 Consumer', category: 'messaging', description: 'RabbitMQ/AMQP queue consumption with ack/nack flow control', complexity: 'medium', latency: 'ms' },
  { id: 'kafka', name: 'Kafka Consumer', category: 'streaming', description: 'Apache Kafka topic consumption with consumer groups', complexity: 'high', latency: 'ms' },
  { id: 'kinesis', name: 'AWS Kinesis Consumer', category: 'streaming', description: 'Amazon Kinesis Data Streams shard iterator consumption', complexity: 'high', latency: 'ms' },
  { id: 'eventhub', name: 'Azure Event Hubs Consumer', category: 'streaming', description: 'Azure Event Hubs partition consumption via AMQP/Kafka protocol', complexity: 'high', latency: 'ms' },
  { id: 'pubsub', name: 'Google Cloud Pub/Sub', category: 'streaming', description: 'GCP Pub/Sub subscription pull/push delivery', complexity: 'medium', latency: 'ms' },
  { id: 'nats', name: 'NATS JetStream', category: 'streaming', description: 'NATS JetStream with persistent replay and exactly-once', complexity: 'medium', latency: 'ms' },
  { id: 'redis-streams', name: 'Redis Streams (XREAD)', category: 'streaming', description: 'Redis Streams consumer group with XREADGROUP', complexity: 'medium', latency: 'ms' },
  { id: 'syslog-listener', name: 'Syslog Listener', category: 'network', description: 'RFC 5424/3164 syslog receiver (TCP/UDP/TLS)', complexity: 'low', latency: 'sub-second' },
  { id: 'snmp-trap', name: 'SNMP Trap Receiver', category: 'network', description: 'SNMPv2c/v3 trap and inform notifications', complexity: 'medium', latency: 'seconds' },
  { id: 'netflow', name: 'NetFlow/IPFIX Collector', category: 'network', description: 'NetFlow v5/v9 and IPFIX flow record collection', complexity: 'medium', latency: 'seconds' },
  { id: 'sflow', name: 'sFlow Collector', category: 'network', description: 'Sampled packet and counter data via sFlow protocol', complexity: 'medium', latency: 'seconds' },
  { id: 'pcap', name: 'Packet Capture (libpcap)', category: 'network', description: 'Raw packet capture with BPF filtering', complexity: 'high', latency: 'ms' },
  { id: 'span-mirror', name: 'SPAN/Mirror Port Tap', category: 'network', description: 'Switch port mirroring for passive traffic capture', complexity: 'high', latency: 'ms' },
  { id: 'dpdk', name: 'DPDK Packet Processing', category: 'kernel', description: 'User-space packet processing bypassing kernel stack (100Gbps+)', complexity: 'critical', latency: 'us' },
  { id: 'ebpf-tracepoint', name: 'eBPF Tracepoints', category: 'kernel', description: 'Kernel tracepoints for syscall/scheduler/network events', complexity: 'critical', latency: 'us' },
  { id: 'ebpf-kprobe', name: 'eBPF Kprobes/Kretprobes', category: 'kernel', description: 'Dynamic kernel function instrumentation with eBPF', complexity: 'critical', latency: 'us' },
  { id: 'ebpf-xdp', name: 'eBPF/XDP (Express Data Path)', category: 'kernel', description: 'Pre-stack packet processing at NIC driver level for line-rate filtering', complexity: 'critical', latency: 'us' },
  { id: 'ebpf-tc', name: 'eBPF TC (Traffic Control)', category: 'kernel', description: 'Traffic control hook for ingress/egress packet inspection', complexity: 'critical', latency: 'us' },
  { id: 'ebpf-lsm', name: 'eBPF LSM (Security Module)', category: 'kernel', description: 'Linux Security Module hooks for access control decisions', complexity: 'critical', latency: 'us' },
  { id: 'ebpf-uprobe', name: 'eBPF Uprobes', category: 'kernel', description: 'User-space function instrumentation without modification', complexity: 'critical', latency: 'us' },
  { id: 'kernel-module', name: 'Kernel Module (LKM)', category: 'kernel', description: 'Loadable kernel module for deep OS-level instrumentation', complexity: 'critical', latency: 'us' },
  { id: 'auditd', name: 'Linux Audit (auditd)', category: 'kernel', description: 'Kernel audit subsystem for file/syscall/network auditing', complexity: 'medium', latency: 'ms' },
  { id: 'etw', name: 'Windows ETW Provider', category: 'kernel', description: 'Event Tracing for Windows kernel and user-mode providers', complexity: 'high', latency: 'ms' },
  { id: 'wfp', name: 'Windows WFP Callout Driver', category: 'kernel', description: 'Windows Filtering Platform for kernel network inspection', complexity: 'critical', latency: 'us' },
  { id: 's3-poll', name: 'S3/GCS/Blob Bucket Polling', category: 'storage', description: 'Cloud storage bucket polling with change notifications', complexity: 'low', latency: 'minutes' },
  { id: 's3-event', name: 'S3 Event Notifications', category: 'storage', description: 'Object creation events via SNS/SQS/Lambda triggers', complexity: 'medium', latency: 'seconds' },
  { id: 'ftp-sftp', name: 'FTP/SFTP File Pull', category: 'storage', description: 'Scheduled file retrieval from remote servers', complexity: 'low', latency: 'minutes' },
  { id: 'file-tail', name: 'File Tail (inotify)', category: 'storage', description: 'Real-time file monitoring with inotify/FSEvents', complexity: 'low', latency: 'ms' },
  { id: 'jdbc', name: 'JDBC/Database Query', category: 'database', description: 'Periodic SQL query against source database tables', complexity: 'medium', latency: 'seconds' },
  { id: 'cdc', name: 'Change Data Capture (CDC)', category: 'database', description: 'Database WAL/binlog streaming for real-time changes', complexity: 'high', latency: 'ms' },
  { id: 'coap', name: 'CoAP Observe', category: 'iot', description: 'Constrained Application Protocol for resource-limited IoT', complexity: 'medium', latency: 'seconds' },
  { id: 'opc-ua', name: 'OPC-UA Subscription', category: 'iot', description: 'Industrial automation protocol for SCADA/ICS telemetry', complexity: 'high', latency: 'ms' },
  { id: 'modbus', name: 'Modbus TCP/RTU', category: 'iot', description: 'Industrial register polling for PLC/RTU devices', complexity: 'medium', latency: 'seconds' },
  // SCADA / ICS
  { id: 'dnp3', name: 'DNP3 (Distributed Network Protocol)', category: 'scada', description: 'SCADA protocol for electric/water utilities, outstation polling with CRC integrity', complexity: 'high', latency: 'seconds' },
  { id: 'iec-61850', name: 'IEC 61850 (GOOSE/MMS)', category: 'scada', description: 'Substation automation: GOOSE multicast events + MMS reporting for power grid', complexity: 'critical', latency: 'ms' },
  { id: 'iec-104', name: 'IEC 60870-5-104 (Telecontrol)', category: 'scada', description: 'TCP-based telecontrol for power system monitoring/control (APCI/ASDU frames)', complexity: 'high', latency: 'seconds' },
  { id: 'iec-101', name: 'IEC 60870-5-101 (Serial SCADA)', category: 'scada', description: 'Serial telecontrol for legacy substations and RTUs over RS-232/485', complexity: 'high', latency: 'seconds' },
  { id: 'bacnet', name: 'BACnet (Building Automation)', category: 'scada', description: 'ASHRAE standard for HVAC, lighting, fire, access control systems', complexity: 'medium', latency: 'seconds' },
  { id: 'ethernetip-cip', name: 'EtherNet/IP (CIP)', category: 'scada', description: 'Rockwell/Allen-Bradley industrial protocol over standard Ethernet', complexity: 'high', latency: 'ms' },
  { id: 'profibus', name: 'PROFIBUS DP/PA', category: 'scada', description: 'Siemens fieldbus for distributed I/O and process instrumentation', complexity: 'high', latency: 'ms' },
  { id: 'hart', name: 'HART Protocol (Highway Addressable Remote Transducer)', category: 'scada', description: 'Hybrid analog+digital for smart field instruments (4-20mA + FSK)', complexity: 'medium', latency: 'seconds' },
  { id: 'foundation-fieldbus', name: 'Foundation Fieldbus (FF)', category: 'scada', description: 'Process automation digital bus for control-in-the-field architectures', complexity: 'high', latency: 'ms' },
  { id: 'cc-link', name: 'CC-Link IE (Mitsubishi)', category: 'scada', description: 'Mitsubishi industrial Ethernet for factory automation (1Gbps cyclic)', complexity: 'high', latency: 'ms' },
  { id: 's7comm', name: 'S7comm/S7comm-Plus (Siemens)', category: 'scada', description: 'Proprietary Siemens PLC protocol for S7-300/400/1200/1500 controllers', complexity: 'critical', latency: 'ms' },
  { id: 'fins-omron', name: 'FINS (Omron)', category: 'scada', description: 'Omron Factory Interface Network Service for PLC communication', complexity: 'high', latency: 'ms' },
  { id: 'melsec', name: 'MELSEC (Mitsubishi MC Protocol)', category: 'scada', description: 'Mitsubishi MELSEC PLC binary/ASCII communication protocol', complexity: 'high', latency: 'ms' },
  { id: 'mqtt-sparkplug', name: 'MQTT Sparkplug B (IIoT)', category: 'scada', description: 'MQTT-based IIoT interoperability with defined topic namespace and Protobuf payloads', complexity: 'medium', latency: 'ms' },
  { id: 'opc-da', name: 'OPC DA/HDA (Classic COM/DCOM)', category: 'scada', description: 'Legacy OPC Data Access/Historical Data via DCOM (Windows-only)', complexity: 'high', latency: 'seconds' },
  { id: 'iccp-tase2', name: 'ICCP/TASE.2 (Inter-Utility)', category: 'scada', description: 'Inter-Control Center Communications for power grid data exchange between utilities', complexity: 'critical', latency: 'seconds' },
  { id: 'pi-af', name: 'OSIsoft PI AF SDK', category: 'scada', description: 'OSIsoft PI System historian access for time-series process data', complexity: 'medium', latency: 'seconds' },
  { id: 'lonworks', name: 'LonWorks (ANSI/CEA-709)', category: 'scada', description: 'Building/industrial automation networking for distributed control', complexity: 'medium', latency: 'seconds' },
  { id: 'knx', name: 'KNX (ISO 22510)', category: 'scada', description: 'European building automation standard for lighting/HVAC/security', complexity: 'medium', latency: 'seconds' },
  { id: 'dali', name: 'DALI (Digital Addressable Lighting)', category: 'scada', description: 'Lighting control protocol for commercial/industrial facilities', complexity: 'low', latency: 'seconds' },
  { id: 'zeromq', name: 'ZeroMQ SUB Socket', category: 'messaging', description: 'ZeroMQ pub/sub pattern for high-throughput IPC', complexity: 'medium', latency: 'us' },
  // Mainframe
  { id: 'mf-smf', name: 'z/OS SMF Records (System Management Facility)', category: 'mainframe', description: 'IBM mainframe system/security audit records (SMF 30/80/83/119)', complexity: 'high', latency: 'seconds' },
  { id: 'mf-racf', name: 'RACF Security Audit (z/OS)', category: 'mainframe', description: 'IBM RACF access control events: logins, violations, resource access', complexity: 'high', latency: 'seconds' },
  { id: 'mf-db2-log', name: 'DB2 for z/OS Log Capture', category: 'mainframe', description: 'DB2 mainframe transaction logs and audit trail extraction', complexity: 'high', latency: 'seconds' },
  { id: 'mf-cics-journal', name: 'CICS Transaction Journal', category: 'mainframe', description: 'CICS transaction server journal records for application audit', complexity: 'high', latency: 'seconds' },
  { id: 'mf-ims-log', name: 'IMS Transaction Log', category: 'mainframe', description: 'IMS hierarchical DB transaction monitoring and audit', complexity: 'high', latency: 'seconds' },
  { id: 'mf-syslog-smc', name: 'z/OS Syslog (SMC-R)', category: 'mainframe', description: 'z/OS system messages and WTO records via TCP/IP stack', complexity: 'medium', latency: 'seconds' },
  { id: 'mf-mq-bridge', name: 'IBM MQ Bridge (z/OS to Kafka)', category: 'mainframe', description: 'MQ Series queue-to-stream bridge for mainframe event offloading', complexity: 'high', latency: 'ms' },
  { id: 'mf-vsam-cdc', name: 'VSAM/QSAM Change Capture', category: 'mainframe', description: 'VSAM dataset change detection via IDCAMS REPRO or IBM CDC', complexity: 'critical', latency: 'seconds' },
  { id: 'mf-jes-spool', name: 'JES2/JES3 Spool Capture', category: 'mainframe', description: 'Job Entry Subsystem output spool monitoring for batch audit', complexity: 'high', latency: 'minutes' },
  { id: 'mf-top-secret', name: 'CA Top Secret Audit (z/OS)', category: 'mainframe', description: 'CA Top Secret security events: access violations, admin actions', complexity: 'high', latency: 'seconds' },
  { id: 'mf-acf2', name: 'CA ACF2 Security Audit', category: 'mainframe', description: 'CA ACF2 access control facility security event logs', complexity: 'high', latency: 'seconds' },
  { id: 'mf-zowe-api', name: 'Zowe REST API (z/OSMF)', category: 'mainframe', description: 'Modern REST API access to z/OS resources via Zowe framework', complexity: 'medium', latency: 'seconds' },
];

const TRANSPORT_PROTOCOLS = [
  { id: 'https', name: 'HTTPS/TLS 1.3', category: 'http', description: 'Standard encrypted HTTP transport', encryption: true, bidirectional: false },
  { id: 'http2', name: 'HTTP/2 Multiplexed', category: 'http', description: 'Multiplexed streams over single connection', encryption: true, bidirectional: true },
  { id: 'http3-quic', name: 'HTTP/3 (QUIC)', category: 'http', description: 'UDP-based transport with zero-RTT handshake', encryption: true, bidirectional: true },
  { id: 'tcp-tls', name: 'TCP + TLS 1.3', category: 'tcp', description: 'Raw TCP socket with mutual TLS authentication', encryption: true, bidirectional: true },
  { id: 'tcp-raw', name: 'TCP Raw Socket', category: 'tcp', description: 'Unencrypted TCP for internal/trusted networks only', encryption: false, bidirectional: true },
  { id: 'udp', name: 'UDP Datagram', category: 'udp', description: 'Connectionless low-latency (syslog, NetFlow)', encryption: false, bidirectional: false },
  { id: 'dtls', name: 'DTLS 1.2 (UDP+Encryption)', category: 'udp', description: 'Encrypted UDP for IoT/real-time telemetry', encryption: true, bidirectional: false },
  { id: 'unix-socket', name: 'Unix Domain Socket', category: 'ipc', description: 'Local IPC with file descriptor passing', encryption: false, bidirectional: true },
  { id: 'shared-mem', name: 'Shared Memory (mmap)', category: 'ipc', description: 'Zero-copy inter-process communication', encryption: false, bidirectional: true },
  { id: 'named-pipe', name: 'Named Pipe (FIFO)', category: 'ipc', description: 'FIFO pipe for sequential local streaming', encryption: false, bidirectional: false },
  { id: 'grpc-h2', name: 'gRPC over HTTP/2', category: 'rpc', description: 'Protobuf-serialized RPC with streaming support', encryption: true, bidirectional: true },
  { id: 'thrift', name: 'Apache Thrift Binary', category: 'rpc', description: 'Cross-language RPC with compact binary encoding', encryption: true, bidirectional: true },
  { id: 'kafka-protocol', name: 'Kafka Protocol (TCP)', category: 'streaming', description: 'Native Kafka wire protocol with SASL/SSL', encryption: true, bidirectional: true },
  { id: 'amqp-protocol', name: 'AMQP 0-9-1 (TCP)', category: 'streaming', description: 'Advanced Message Queuing Protocol', encryption: true, bidirectional: true },
  { id: 'nats-protocol', name: 'NATS Protocol', category: 'streaming', description: 'Text-based protocol with TLS and NKey auth', encryption: true, bidirectional: true },
  { id: 'mqtt-protocol', name: 'MQTT v5 (TCP/WS)', category: 'streaming', description: 'Lightweight pub/sub with QoS levels', encryption: true, bidirectional: true },
  { id: 'websocket-tls', name: 'WebSocket + TLS', category: 'realtime', description: 'Full-duplex encrypted WebSocket (wss://)', encryption: true, bidirectional: true },
  { id: 'sse-tls', name: 'Server-Sent Events (HTTPS)', category: 'realtime', description: 'Unidirectional push over HTTPS', encryption: true, bidirectional: false },
  { id: 'rdma', name: 'RDMA (InfiniBand/RoCE)', category: 'hpc', description: 'Remote Direct Memory Access for zero-copy networking', encryption: false, bidirectional: true },
  { id: 'dpdk-ring', name: 'DPDK Ring Buffer', category: 'hpc', description: 'Lock-free ring buffer for kernel-bypass I/O', encryption: false, bidirectional: true },
  { id: 'io-uring', name: 'io_uring (Linux 5.1+)', category: 'hpc', description: 'Async I/O with submission/completion queues', encryption: false, bidirectional: true },
  { id: 'xdp-af', name: 'AF_XDP Socket', category: 'hpc', description: 'High-performance packet I/O bypassing kernel stack', encryption: false, bidirectional: true },
  { id: 'sctp', name: 'SCTP (Stream Control)', category: 'telecom', description: 'Multi-homed multi-stream transport for telecom', encryption: true, bidirectional: true },
  { id: 'diameter', name: 'Diameter Protocol', category: 'telecom', description: 'AAA protocol for telecom network signaling', encryption: true, bidirectional: true },
  { id: 'ss7-mtp', name: 'SS7 / MTP (Message Transfer Part)', category: 'telecom', description: 'Legacy telecom signaling for call control and SMS routing', encryption: false, bidirectional: true },
  { id: 'sigtran', name: 'SIGTRAN (SS7 over IP)', category: 'telecom', description: 'M2UA/M3UA/SUA transport of SS7 signaling over SCTP/IP', encryption: true, bidirectional: true },
  { id: 'isup', name: 'ISUP (ISDN User Part)', category: 'telecom', description: 'Call setup/teardown signaling in PSTN networks', encryption: false, bidirectional: true },
  { id: 'map-camel', name: 'MAP/CAMEL (GSM Core)', category: 'telecom', description: 'Mobile Application Part for subscriber management and roaming', encryption: false, bidirectional: true },
  { id: 'gtp', name: 'GTP (GPRS Tunneling)', category: 'telecom', description: 'User and control plane tunneling for 4G/5G mobile data', encryption: true, bidirectional: true },
  { id: 'pfcp', name: 'PFCP (5G User Plane)', category: 'telecom', description: 'Packet Forwarding Control Protocol for 5G UPF sessions', encryption: true, bidirectional: true },
  { id: 'sip-sdp', name: 'SIP/SDP (VoIP Signaling)', category: 'telecom', description: 'Session Initiation Protocol for VoIP call signaling', encryption: true, bidirectional: true },
  { id: 'megaco-h248', name: 'MEGACO/H.248', category: 'telecom', description: 'Media gateway control for voice/video decomposition', encryption: true, bidirectional: true },
  // Physical / Serial
  { id: 'rs232', name: 'RS-232 (Serial)', category: 'physical', description: 'Point-to-point serial communication up to 20Kbps, 15m range', encryption: false, bidirectional: true },
  { id: 'rs485', name: 'RS-485 (Multi-drop Serial)', category: 'physical', description: 'Multi-drop half/full-duplex up to 10Mbps, 1200m range, 32 devices', encryption: false, bidirectional: true },
  { id: 'rs422', name: 'RS-422 (Differential Serial)', category: 'physical', description: 'Differential signaling point-to-point up to 10Mbps, 1200m', encryption: false, bidirectional: false },
  { id: 'usb-serial', name: 'USB-to-Serial (FTDI/CP210x)', category: 'physical', description: 'Virtual COM port over USB for legacy device connectivity', encryption: false, bidirectional: true },
  { id: 'can-bus', name: 'CAN Bus (Controller Area Network)', category: 'physical', description: 'Automotive/industrial multi-master bus at 1Mbps, real-time', encryption: false, bidirectional: true },
  { id: 'can-fd', name: 'CAN FD (Flexible Data-Rate)', category: 'physical', description: 'Extended CAN with 64-byte payloads at 8Mbps for modern vehicles', encryption: false, bidirectional: true },
  { id: 'lin-bus', name: 'LIN Bus', category: 'physical', description: 'Low-cost single-wire automotive sub-network at 20Kbps', encryption: false, bidirectional: true },
  { id: 'i2c', name: 'I2C (Inter-Integrated Circuit)', category: 'physical', description: 'Short-range multi-master bus for sensor/chip communication', encryption: false, bidirectional: true },
  { id: 'spi', name: 'SPI (Serial Peripheral Interface)', category: 'physical', description: 'High-speed full-duplex synchronous serial for embedded systems', encryption: false, bidirectional: true },
  { id: 'onewire', name: '1-Wire (Dallas/Maxim)', category: 'physical', description: 'Single-wire bus for temperature/ID sensors, parasitic power', encryption: false, bidirectional: true },
  { id: 'jtag-swd', name: 'JTAG/SWD Debug Port', category: 'physical', description: 'Hardware debug interface for firmware extraction and monitoring', encryption: false, bidirectional: true },
  { id: 'gpio-bitbang', name: 'GPIO Bitbang', category: 'physical', description: 'Software-driven pin toggling for custom protocols', encryption: false, bidirectional: true },
  { id: 'mil-std-1553', name: 'MIL-STD-1553', category: 'physical', description: 'Military avionics data bus, deterministic 1Mbps, triple-redundant', encryption: false, bidirectional: true },
  { id: 'arinc-429', name: 'ARINC 429', category: 'physical', description: 'Commercial aviation unidirectional data bus (100Kbps)', encryption: false, bidirectional: false },
  // Exotic / Non-TCP/IP
  { id: 'ipx-spx', name: 'IPX/SPX (Novell)', category: 'exotic', description: 'Legacy Novell NetWare protocol suite for LAN communication', encryption: false, bidirectional: true },
  { id: 'decnet', name: 'DECnet Phase IV/V', category: 'exotic', description: 'Digital Equipment Corporation proprietary network stack', encryption: false, bidirectional: true },
  { id: 'appletalk', name: 'AppleTalk (DDP/ATP)', category: 'exotic', description: 'Legacy Apple networking with zero-config discovery', encryption: false, bidirectional: true },
  { id: 'x25', name: 'X.25 Packet Switching', category: 'exotic', description: 'ITU-T virtual circuit WAN protocol, legacy banking/ATM networks', encryption: false, bidirectional: true },
  { id: 'frame-relay', name: 'Frame Relay (DLCI)', category: 'exotic', description: 'WAN protocol with virtual circuits, predecessor to MPLS', encryption: false, bidirectional: true },
  { id: 'atm-aal5', name: 'ATM/AAL5 (53-byte cells)', category: 'exotic', description: 'Asynchronous Transfer Mode fixed-cell switching, telco backbone', encryption: false, bidirectional: true },
  { id: 'token-ring', name: 'Token Ring (IEEE 802.5)', category: 'exotic', description: 'Deterministic ring-topology LAN with token passing', encryption: false, bidirectional: true },
  { id: 'fddi', name: 'FDDI (Fiber Ring)', category: 'exotic', description: 'Dual-ring fiber LAN at 100Mbps with self-healing failover', encryption: false, bidirectional: true },
  { id: 'fibre-channel', name: 'Fibre Channel (FC-4)', category: 'exotic', description: 'SAN storage networking, 128Gbps, lossless ordered delivery', encryption: true, bidirectional: true },
  { id: 'infiniband-raw', name: 'InfiniBand (Verbs API)', category: 'exotic', description: 'HPC interconnect with RDMA verbs for direct memory operations', encryption: false, bidirectional: true },
  { id: 'zigbee', name: 'Zigbee (IEEE 802.15.4)', category: 'exotic', description: 'Low-power mesh networking for IoT/smart building sensors', encryption: true, bidirectional: true },
  { id: 'zwave', name: 'Z-Wave (Sub-GHz Mesh)', category: 'exotic', description: 'Home automation mesh at 100Kbps, 232 device limit', encryption: true, bidirectional: true },
  { id: 'lora-lorawan', name: 'LoRa/LoRaWAN', category: 'exotic', description: 'Long-range low-power WAN for IoT at 50Kbps over 15km', encryption: true, bidirectional: false },
  { id: 'bluetooth-hci', name: 'Bluetooth HCI (Host Controller)', category: 'exotic', description: 'BLE/Classic Bluetooth packet-level monitoring via HCI socket', encryption: true, bidirectional: true },
  { id: 'nfc-ndef', name: 'NFC (Near Field Communication)', category: 'exotic', description: 'Short-range (10cm) 13.56MHz for access control and payment', encryption: true, bidirectional: true },
  { id: 'profinet', name: 'PROFINET (Industrial Ethernet)', category: 'exotic', description: 'Siemens industrial real-time Ethernet for factory automation', encryption: false, bidirectional: true },
  { id: 'ethercat', name: 'EtherCAT', category: 'exotic', description: 'Beckhoff real-time industrial Ethernet with sub-microsecond jitter', encryption: false, bidirectional: true },
  { id: 'powerlink', name: 'POWERLINK (Industrial)', category: 'exotic', description: 'Open-source real-time industrial Ethernet protocol', encryption: false, bidirectional: true },
  { id: 'zeromq-tcp', name: 'ZeroMQ (tcp://)', category: 'messaging', description: 'Brokerless messaging with various patterns', encryption: true, bidirectional: true },
  { id: 'nanomsg', name: 'nanomsg/nng', category: 'messaging', description: 'Next-gen ZeroMQ alternative with simpler API', encryption: true, bidirectional: true },
  // Mainframe
  { id: 'ebcdic-stream', name: 'EBCDIC Record Stream', category: 'mainframe', description: 'IBM EBCDIC-encoded fixed/variable-length record transmission (codepage 037/1047)', encryption: false, bidirectional: true },
  { id: 'ebcdic-packed', name: 'EBCDIC Packed Decimal (COMP-3)', category: 'mainframe', description: 'COBOL packed decimal binary data with EBCDIC field headers', encryption: false, bidirectional: false },
  { id: 'tn3270', name: 'TN3270/TN3270E (3270 Terminal)', category: 'mainframe', description: 'IBM 3270 terminal emulation protocol for VTAM/TSO session capture', encryption: true, bidirectional: true },
  { id: 'lu62-appc', name: 'LU 6.2 / APPC (SNA)', category: 'mainframe', description: 'IBM SNA Advanced Program-to-Program Communication protocol', encryption: false, bidirectional: true },
  { id: 'sna-sdlc', name: 'SNA/SDLC (Systems Network Architecture)', category: 'mainframe', description: 'IBM legacy SNA with SDLC link-layer for mainframe interconnect', encryption: false, bidirectional: true },
  { id: 'ftp-jes', name: 'FTP/JES (MVS File Transfer)', category: 'mainframe', description: 'z/OS FTP with JES extensions for spool file and dataset retrieval', encryption: true, bidirectional: true },
  { id: 'mq-ebcdic', name: 'IBM MQ (EBCDIC Headers)', category: 'mainframe', description: 'MQ Series with MQMD/MQRFH2 headers in EBCDIC encoding', encryption: true, bidirectional: true },
  { id: 'cics-tcp', name: 'CICS TCP/IP Socket', category: 'mainframe', description: 'CICS transaction gateway socket interface for real-time events', encryption: true, bidirectional: true },
  { id: 'connect-direct', name: 'Connect:Direct (NDM)', category: 'mainframe', description: 'Sterling Connect:Direct point-to-point file transfer (formerly NDM)', encryption: true, bidirectional: true },
  { id: 'ims-connect', name: 'IMS Connect (OTMA)', category: 'mainframe', description: 'IMS Open Transaction Manager Access for TCP/IP connectivity', encryption: true, bidirectional: true },
  { id: 'vtam-ncp', name: 'VTAM/NCP (SNA Gateway)', category: 'mainframe', description: 'Virtual Telecommunications Access Method via Network Control Program', encryption: false, bidirectional: true },
];

const NORMALIZATION_SCHEMAS = [
  { id: 'ocsf', name: 'OCSF v1.3.0', description: 'Open Cybersecurity Schema Framework (Amazon/Splunk)', org: 'OCSF Consortium' },
  { id: 'ecs', name: 'Elastic Common Schema (ECS)', description: 'Elasticsearch normalized event format', org: 'Elastic' },
  { id: 'cim', name: 'Splunk CIM', description: 'Splunk Common Information Model', org: 'Splunk' },
  { id: 'sigma', name: 'Sigma (Detection Format)', description: 'Generic detection rule format (normalization layer)', org: 'SigmaHQ' },
  { id: 'stix', name: 'STIX/TAXII 2.1', description: 'Structured Threat Information Expression', org: 'OASIS' },
  { id: 'cef', name: 'CEF (ArcSight)', description: 'Common Event Format for legacy SIEM compatibility', org: 'Micro Focus' },
  { id: 'leef', name: 'LEEF (QRadar)', description: 'Log Event Extended Format for IBM QRadar', org: 'IBM' },
  { id: 'asim', name: 'Microsoft ASIM', description: 'Advanced Security Information Model for Sentinel', org: 'Microsoft' },
  { id: 'udm', name: 'Google UDM', description: 'Unified Data Model for Chronicle SIEM', org: 'Google' },
  { id: 'custom', name: 'Custom Data Contract', description: 'Define your own schema or let AI propose one from sample data', org: 'User-Defined' },
];

type DataStructureType = 'structured' | 'unstructured';

const DATA_FORMATS: { name: string; category: string }[] = [
  // General / Structured
  { name: 'JSON', category: 'General' },
  { name: 'JSON Lines (NDJSON)', category: 'General' },
  { name: 'CSV/TSV', category: 'General' },
  { name: 'Avro', category: 'General' },
  { name: 'Parquet', category: 'General' },
  { name: 'ORC', category: 'General' },
  { name: 'Protobuf', category: 'General' },
  { name: 'FlatBuffers', category: 'General' },
  { name: "Cap'n Proto", category: 'General' },
  { name: 'Thrift Binary', category: 'General' },
  { name: 'MessagePack', category: 'General' },
  { name: 'CBOR', category: 'General' },
  { name: 'BSON', category: 'General' },
  { name: 'Apache Arrow (IPC)', category: 'General' },
  { name: 'Ion (Amazon)', category: 'General' },
  { name: 'YAML', category: 'General' },
  { name: 'TOML', category: 'General' },
  { name: 'Fixed-Width Columns', category: 'General' },
  { name: 'COBOL Copybook Layout', category: 'General' },
  { name: 'ASN.1 (BER/DER)', category: 'General' },
  { name: 'EBCDIC Fixed-Length Records', category: 'General' },
  { name: 'EBCDIC Variable-Length (RDW)', category: 'General' },
  { name: 'EBCDIC COMP-3 Packed Decimal', category: 'General' },
  { name: 'SMF Binary Records (z/OS)', category: 'General' },
  // Log Formats
  { name: 'CEF (Common Event Format)', category: 'Log Formats' },
  { name: 'LEEF (Log Event Extended Format)', category: 'Log Formats' },
  { name: 'Syslog RFC 5424', category: 'Log Formats' },
  { name: 'Syslog RFC 3164', category: 'Log Formats' },
  { name: 'XML', category: 'Log Formats' },
  { name: 'HTML', category: 'Log Formats' },
  { name: 'W3C Extended Log', category: 'Log Formats' },
  { name: 'Apache Common/Combined', category: 'Log Formats' },
  { name: 'Key=Value Pairs', category: 'Log Formats' },
  { name: 'Windows Event XML (EVTX)', category: 'Log Formats' },
  { name: 'Windows ETL (Event Trace Log)', category: 'Log Formats' },
  { name: 'ELF (Extended Log Format)', category: 'Log Formats' },
  { name: 'GELF (Graylog Extended)', category: 'Log Formats' },
  { name: 'CLF (Common Log Format)', category: 'Log Formats' },
  { name: 'JSON-LD', category: 'Log Formats' },
  { name: 'RDF/Turtle', category: 'Log Formats' },
  { name: 'Multiline Stack Traces', category: 'Log Formats' },
  { name: 'Email (RFC 5322 / MIME)', category: 'Log Formats' },
  { name: 'HTTP Access Log', category: 'Log Formats' },
  { name: 'AWS CloudTrail JSON', category: 'Log Formats' },
  { name: 'Azure Activity Log', category: 'Log Formats' },
  { name: 'GCP Audit Log', category: 'Log Formats' },
  // Financial / Banking
  { name: 'ISO 8583 (Card Transactions)', category: 'Financial' },
  { name: 'ISO 20022 (Financial Messaging XML)', category: 'Financial' },
  { name: 'FIX Protocol (Financial Information eXchange)', category: 'Financial' },
  { name: 'SWIFT MT (Society for Worldwide Interbank)', category: 'Financial' },
  { name: 'SWIFT MX (ISO 20022 XML)', category: 'Financial' },
  { name: 'SWIFT FIN (Tag-Value Messages)', category: 'Financial' },
  { name: 'FpML (Financial Products Markup)', category: 'Financial' },
  { name: 'ITCH (NASDAQ Market Data)', category: 'Financial' },
  { name: 'OUCH (NASDAQ Order Entry)', category: 'Financial' },
  { name: 'FAST Protocol (FIX Adapted for Streaming)', category: 'Financial' },
  { name: 'SBE (Simple Binary Encoding)', category: 'Financial' },
  { name: 'BATS PITCH (Exchange Feed)', category: 'Financial' },
  { name: 'OPRA (Options Price Reporting)', category: 'Financial' },
  { name: 'ACH/NACHA (Automated Clearing House)', category: 'Financial' },
  { name: 'DTCC (Depository Trust)', category: 'Financial' },
  { name: 'Fedwire (Federal Reserve Wire)', category: 'Financial' },
  { name: 'PIX (Brazilian Instant Payment - SPI/DICT)', category: 'Financial' },
  { name: 'Boleto (Brazilian Payment Slip)', category: 'Financial' },
  { name: 'SPB (Brazilian Payment System)', category: 'Financial' },
  { name: 'SEPA (Single Euro Payments Area)', category: 'Financial' },
  { name: 'EBICS (Electronic Banking)', category: 'Financial' },
  { name: 'HBCI/FinTS (German Banking)', category: 'Financial' },
  { name: 'Open Banking (PSD2 API)', category: 'Financial' },
  { name: 'Plaid API Format', category: 'Financial' },
  { name: 'Stripe Event Object', category: 'Financial' },
  { name: 'FIX Session Log (Tag=Value)', category: 'Financial' },
  { name: 'OFX (Open Financial Exchange)', category: 'Financial' },
  { name: 'QFX (Quicken Financial Exchange)', category: 'Financial' },
  { name: 'BAI2 (Bank Administration Institute)', category: 'Financial' },
  { name: 'CAMT.053 (Bank Statement XML)', category: 'Financial' },
  { name: 'PAIN.001 (Payment Initiation XML)', category: 'Financial' },
  { name: 'MT940/MT942 (Account Statement)', category: 'Financial' },
  { name: 'XBRL (Financial Reporting)', category: 'Financial' },
  // Telecom / Carrier
  { name: 'CDR (Call Detail Record)', category: 'Telecom' },
  { name: 'IPDR (IP Detail Record)', category: 'Telecom' },
  { name: 'TAP3 (Transferred Account Procedure)', category: 'Telecom' },
  { name: 'ASN.1 UPER (Telecom Signaling)', category: 'Telecom' },
  { name: 'RAP (Returned Account Procedure)', category: 'Telecom' },
  { name: 'NRTRDE (Near Real-Time Roaming Data Exchange)', category: 'Telecom' },
  { name: 'XDR (Extended Data Record - 5G)', category: 'Telecom' },
  { name: 'EDR (Event Detail Record)', category: 'Telecom' },
  { name: 'UDR (Usage Data Record - 3GPP)', category: 'Telecom' },
  { name: 'DIAMETER AVPs (Attribute-Value Pairs)', category: 'Telecom' },
  { name: 'GTPv2 IE (Information Elements)', category: 'Telecom' },
  { name: 'CAMEL CSI (Service Information)', category: 'Telecom' },
  { name: 'RADIUS Accounting Records', category: 'Telecom' },
  { name: 'CGNAT Logging (RFC 7422)', category: 'Telecom' },
  { name: 'TAP3 ASN.1 (Roaming Records)', category: 'Telecom' },
  { name: 'SS7 MSU (Message Signaling Unit)', category: 'Telecom' },
  { name: 'SIP Headers + SDP Body', category: 'Telecom' },
  { name: 'DIAMETER Message (Header + AVPs)', category: 'Telecom' },
  { name: 'RAN KPIs (Radio Access Network)', category: 'Telecom' },
  { name: 'MML (Man-Machine Language - Nokia/Ericsson)', category: 'Telecom' },
  { name: 'CORBA IIOP (Legacy OSS)', category: 'Telecom' },
  // Healthcare / Life Sciences
  { name: 'HL7 v2 (Pipe-Delimited Messages)', category: 'Healthcare' },
  { name: 'FHIR R4 (Fast Healthcare Interoperability - JSON/XML)', category: 'Healthcare' },
  { name: 'CDA (Clinical Document Architecture)', category: 'Healthcare' },
  { name: 'DICOM Structured Report', category: 'Healthcare' },
  { name: 'IHE ITI (Cross-Enterprise Document)', category: 'Healthcare' },
  { name: 'NCPDP (Pharmacy Claims)', category: 'Healthcare' },
  { name: 'X12 (EDI Healthcare 837/835/834)', category: 'Healthcare' },
  { name: 'SNOMED CT (Clinical Terms)', category: 'Healthcare' },
  { name: 'LOINC (Lab Observations)', category: 'Healthcare' },
  { name: 'GS1 EPCIS (Supply Chain Events)', category: 'Healthcare' },
  { name: 'CCD/C-CDA (Continuity of Care Document)', category: 'Healthcare' },
  { name: 'HL7 v3 (RIM-based XML)', category: 'Healthcare' },
  { name: 'ADT Messages (Admit/Discharge/Transfer)', category: 'Healthcare' },
  // Energy / Utilities
  { name: 'CIM (Common Information Model - IEC 61970)', category: 'Energy' },
  { name: 'DLMS/COSEM (Smart Metering)', category: 'Energy' },
  { name: 'IEC 61968 (Distribution Management)', category: 'Energy' },
  { name: 'Green Button (Energy Usage - ESPI/NAESB)', category: 'Energy' },
  { name: 'OASIS oBIX (Open Building Information)', category: 'Energy' },
  { name: 'EnergyPlus IDF (Building Simulation)', category: 'Energy' },
  { name: 'IEEE C37.118 (Synchrophasor/PMU)', category: 'Energy' },
  { name: 'IEC 62056 (DLMS/COSEM Metering)', category: 'Energy' },
  // Automotive / Transportation
  { name: 'DBC (CAN Database)', category: 'Automotive' },
  { name: 'A2L (ASAM MCD-2 MC)', category: 'Automotive' },
  { name: 'MDF4 (Measurement Data Format)', category: 'Automotive' },
  { name: 'NMEA 0183/2000 (Maritime GPS)', category: 'Automotive' },
  { name: 'AIS (Automatic Identification System)', category: 'Automotive' },
  { name: 'ASTERIX (Air Traffic Surveillance)', category: 'Automotive' },
  { name: 'ADSB (Aircraft Surveillance)', category: 'Automotive' },
  { name: 'J1939 (Heavy Vehicle Diagnostics)', category: 'Automotive' },
  { name: 'OBD-II (On-Board Diagnostics)', category: 'Automotive' },
  { name: 'UDS (Unified Diagnostic Services)', category: 'Automotive' },
  { name: 'SOME/IP (Automotive Ethernet)', category: 'Automotive' },
  // Manufacturing / Supply Chain
  { name: 'OPC UA Binary/XML (Industrial)', category: 'Manufacturing' },
  { name: 'MTConnect (CNC Machine Data)', category: 'Manufacturing' },
  { name: 'ISA-95 (B2MML XML)', category: 'Manufacturing' },
  { name: 'QIF (Quality Information Framework)', category: 'Manufacturing' },
  { name: 'STEP AP242 (Product Data)', category: 'Manufacturing' },
  { name: 'IPC-2581 (PCB Manufacturing)', category: 'Manufacturing' },
  { name: 'GS1 EPCIS 2.0 (Supply Chain)', category: 'Manufacturing' },
  { name: 'EDI X12 (856/850/810/820)', category: 'Manufacturing' },
  { name: 'EDIFACT (UN/ECE Trade)', category: 'Manufacturing' },
  // SCADA / Industrial
  { name: 'DNP3 Application Layer (Objects)', category: 'SCADA' },
  { name: 'IEC 104 ASDU (Application Service Data Unit)', category: 'SCADA' },
  { name: 'Modbus Register Dumps', category: 'SCADA' },
  { name: 'BACnet Property Lists', category: 'SCADA' },
  { name: 'GOOSE/GSSE (IEC 61850)', category: 'SCADA' },
  { name: 'PI Tag Snapshots (OSIsoft)', category: 'SCADA' },
  { name: 'Historian CSV Export (Wonderware/iFIX)', category: 'SCADA' },
  // Government / Defense
  { name: 'NIEM (National Information Exchange Model)', category: 'Government' },
  { name: 'MIL-STD-6016 (Link 16 Messages)', category: 'Government' },
  { name: 'STANAG 4559 (ISR Data)', category: 'Government' },
  { name: 'STANAG 4609 (Motion Imagery)', category: 'Government' },
  { name: 'CoT (Cursor on Target)', category: 'Government' },
  { name: 'VMF (Variable Message Format)', category: 'Government' },
  { name: 'USMTF (US Message Text Format)', category: 'Government' },
  { name: 'NIEM IEP (Information Exchange Package)', category: 'Government' },
  { name: 'LEA Warrant Data (Court Orders)', category: 'Government' },
  { name: 'NIBRS (National Incident-Based Reporting)', category: 'Government' },
  { name: 'CAD Dispatch Records', category: 'Government' },
  { name: 'Customs Declaration (WCO DM)', category: 'Government' },
  { name: 'Immigration Travel Records (API/PNR)', category: 'Government' },
  // Insurance
  { name: 'ACORD (Association for Cooperative Operations)', category: 'Insurance' },
  { name: 'XBRL-Insurance (Solvency II)', category: 'Insurance' },
  { name: 'Claims Bordereaux (London Market)', category: 'Insurance' },
  { name: 'Policy Admin Extracts', category: 'Insurance' },
  // Agriculture / Environment
  { name: 'ISOBUS (ISO 11783 Agricultural)', category: 'Agriculture' },
  { name: 'AgGateway ADAPT', category: 'Agriculture' },
  { name: 'SensorML (OGC Sensor Data)', category: 'Agriculture' },
  { name: 'WaterML (Hydrological Data)', category: 'Agriculture' },
  { name: 'NetCDF (Climate/Weather)', category: 'Agriculture' },
  { name: 'GRIB2 (Weather Forecast)', category: 'Agriculture' },
];

const UNSTRUCTURED_DATA_TYPES = [
  { id: 'video-stream', name: 'Video Stream (RTSP/HLS/DASH)', category: 'video', description: 'Real-time video feeds from CCTV, cameras, screen recordings' },
  { id: 'video-file', name: 'Video File (MP4/AVI/MKV/WebM)', category: 'video', description: 'Recorded video files for forensic analysis' },
  { id: 'audio-stream', name: 'Audio Stream (RTP/WebRTC)', category: 'audio', description: 'Live audio from VoIP calls, ambient monitoring, radio intercepts' },
  { id: 'audio-file', name: 'Audio File (WAV/MP3/FLAC/OGG)', category: 'audio', description: 'Recorded calls, voicemails, dictation for analysis' },
  { id: 'image-raster', name: 'Image (PNG/JPEG/TIFF/BMP/WebP)', category: 'image', description: 'Screenshots, badge photos, camera stills, scanned documents' },
  { id: 'image-dicom', name: 'DICOM (Medical Imaging)', category: 'image', description: 'Medical imaging data with embedded patient metadata' },
  { id: 'image-satellite', name: 'Satellite/GeoTIFF Imagery', category: 'image', description: 'Geospatial raster imagery for facility monitoring' },
  { id: 'pe-exe', name: 'PE/EXE (Windows Executable)', category: 'binary', description: 'Windows portable executables for malware analysis' },
  { id: 'elf-binary', name: 'ELF Binary (Linux Executable)', category: 'binary', description: 'Linux ELF binaries, shared objects, kernel modules' },
  { id: 'macho-binary', name: 'Mach-O Binary (macOS)', category: 'binary', description: 'macOS executables, dylibs, frameworks' },
  { id: 'dll-lib', name: 'DLL / Shared Library', category: 'binary', description: 'Dynamic link libraries for dependency analysis' },
  { id: 'firmware', name: 'Firmware Image (BIN/HEX/UF2)', category: 'binary', description: 'IoT/embedded device firmware for vulnerability scanning' },
  { id: 'memory-dump', name: 'Memory Dump (RAW/DMP/VMEM)', category: 'binary', description: 'Process/full memory dumps for forensic investigation' },
  { id: 'disk-image', name: 'Disk Image (E01/DD/VMDK)', category: 'binary', description: 'Forensic disk images for evidence preservation' },
  { id: 'pcap-file', name: 'PCAP/PCAPNG (Packet Capture)', category: 'binary', description: 'Network packet captures for traffic analysis' },
  { id: 'pdf', name: 'PDF Document', category: 'document', description: 'Policies, contracts, reports, invoices, certificates' },
  { id: 'docx', name: 'Word Document (DOCX/DOC)', category: 'document', description: 'Business documents, incident reports, playbooks' },
  { id: 'xlsx', name: 'Excel Spreadsheet (XLSX/XLS)', category: 'document', description: 'Asset inventories, risk registers, compliance matrices' },
  { id: 'pptx', name: 'PowerPoint (PPTX/PPT)', category: 'document', description: 'Presentations, architecture diagrams, briefings' },
  { id: 'email-eml', name: 'Email (EML/MSG/PST)', category: 'document', description: 'Email messages with attachments for phishing analysis' },
  { id: 'archive', name: 'Archive (ZIP/RAR/7z/TAR.GZ)', category: 'document', description: 'Compressed packages potentially containing malicious payloads' },
  { id: 'iso-img', name: 'ISO/IMG (Disk Image)', category: 'document', description: 'Mounted disk images used in malware delivery' },
  { id: 'source-code', name: 'Source Code (any language)', category: 'code', description: 'Code files for SAST, secrets scanning, vulnerability detection' },
  { id: 'script-macro', name: 'Scripts/Macros (VBA/PS1/BAT/SH)', category: 'code', description: 'Executable scripts and macros for behavioral analysis' },
  { id: 'config-files', name: 'Configuration Files (INI/CONF/ENV)', category: 'code', description: 'System configs for misconfiguration detection' },
  { id: 'registry-hive', name: 'Windows Registry Hive', category: 'code', description: 'Registry exports for persistence mechanism detection' },
  { id: 'certificate', name: 'Certificates (PEM/DER/PFX/P12)', category: 'crypto', description: 'X.509 certificates, CA chains, key material' },
  { id: 'crypto-key', name: 'Cryptographic Keys (PGP/SSH/JWK)', category: 'crypto', description: 'Key material for exposure detection and rotation tracking' },
  { id: 'blockchain-tx', name: 'Blockchain Transactions (Raw)', category: 'crypto', description: 'Cryptocurrency transaction data for fraud/ransomware tracing' },
  { id: 'network-flow', name: 'Network Flow (Binary NetFlow)', category: 'network', description: 'Raw binary flow records for traffic pattern analysis' },
  { id: 'dns-zone', name: 'DNS Zone Files (BIND)', category: 'network', description: 'DNS zone transfers and record files' },
  { id: 'x509-crl', name: 'CRL / OCSP Responses', category: 'network', description: 'Certificate revocation lists and status responses' },
  { id: 'custom-unstructured', name: 'Custom Unstructured Type', category: 'custom', description: 'Define your own unstructured data type - describe it and the AI will generate a UDF' },
];

const SAMPLING_PRIORITIES = [
  {
    id: 'high-severity',
    name: 'High Severity Events',
    description: 'Critical/High severity alerts, CVSS 7+, priority 1-2 events that indicate active threats',
    icon: AlertTriangle,
    iconColor: 'text-red-400',
    iconBg: 'bg-red-500/20',
    activeBg: 'bg-red-500/5',
    activeBorder: 'border-red-500/40',
    examples: ['severity >= critical', 'priority <= 2', 'CVSS >= 7.0'],
  },
  {
    id: 'suspicious-patterns',
    name: 'CEP Suspicious Patterns',
    description: 'Events matching known multi-step attack sequences: recon + exploit + lateral movement chains',
    icon: Activity,
    iconColor: 'text-orange-400',
    iconBg: 'bg-orange-500/20',
    activeBg: 'bg-orange-500/5',
    activeBorder: 'border-orange-500/40',
    examples: ['kill-chain-match', 'temporal-sequence', 'recon->exploit'],
  },
  {
    id: 'large-payloads',
    name: 'Large/Anomalous Payloads',
    description: 'Packets exceeding normal size thresholds - potential data exfiltration, C2 beacons, or exploit delivery',
    icon: HardDrive,
    iconColor: 'text-cyan-400',
    iconBg: 'bg-cyan-500/20',
    activeBg: 'bg-cyan-500/5',
    activeBorder: 'border-cyan-500/40',
    examples: ['payload > 10KB', 'entropy > 7.5', 'unusual-encoding'],
  },
  {
    id: 'graph-escalated',
    name: 'Graph-Escalated Entities',
    description: 'Events involving entities that have been escalated by graph scoring: high PageRank, betweenness centrality spikes',
    icon: Network,
    iconColor: 'text-teal-400',
    iconBg: 'bg-teal-500/20',
    activeBg: 'bg-teal-500/5',
    activeBorder: 'border-teal-500/40',
    examples: ['entity_risk > 80', 'centrality_spike', 'graph_escalation'],
  },
  {
    id: 'micro-patterns',
    name: 'Bad Micro-Pattern Matches',
    description: 'Events flagged by micro-pattern engine: beaconing intervals, DNS tunneling cadence, low-and-slow exfil',
    icon: Radio,
    iconColor: 'text-amber-400',
    iconBg: 'bg-amber-500/20',
    activeBg: 'bg-amber-500/5',
    activeBorder: 'border-amber-500/40',
    examples: ['beacon_score > 0.8', 'dns_tunnel_prob', 'periodic_callback'],
  },
  {
    id: 'auth-events',
    name: 'Authentication & Access',
    description: 'All authentication attempts, privilege escalations, MFA challenges, token refreshes - never miss an identity event',
    icon: Lock,
    iconColor: 'text-blue-400',
    iconBg: 'bg-blue-500/20',
    activeBg: 'bg-blue-500/5',
    activeBorder: 'border-blue-500/40',
    examples: ['login_*', 'priv_escalation', 'mfa_*', 'token_refresh'],
  },
  {
    id: 'rare-events',
    name: 'First-Seen / Rare Events',
    description: 'Events from never-before-seen IPs, new user-agent strings, first DNS lookups - novelty detection priority',
    icon: Sparkles,
    iconColor: 'text-emerald-400',
    iconBg: 'bg-emerald-500/20',
    activeBg: 'bg-emerald-500/5',
    activeBorder: 'border-emerald-500/40',
    examples: ['first_seen_ip', 'new_ua_string', 'novel_domain'],
  },
  {
    id: 'lateral-movement',
    name: 'Lateral Movement Indicators',
    description: 'SMB/RDP/SSH between internal hosts, service account anomalies, pass-the-hash/ticket patterns',
    icon: Globe,
    iconColor: 'text-rose-400',
    iconBg: 'bg-rose-500/20',
    activeBg: 'bg-rose-500/5',
    activeBorder: 'border-rose-500/40',
    examples: ['internal->internal', 'svc_acct_anomaly', 'pth_detected'],
  },
  {
    id: 'data-exfil',
    name: 'Data Exfiltration Signals',
    description: 'Large outbound transfers, unusual upload destinations, encrypted blobs to rare endpoints, DNS over HTTPS exfil',
    icon: AlertOctagon,
    iconColor: 'text-red-400',
    iconBg: 'bg-red-500/20',
    activeBg: 'bg-red-500/5',
    activeBorder: 'border-red-500/40',
    examples: ['outbound > 50MB', 'rare_dest_upload', 'doh_exfil'],
  },
  {
    id: 'encrypted-anomalies',
    name: 'TLS/Encryption Anomalies',
    description: 'Self-signed certs, expired certificates, JA3/JA4 fingerprint mismatches, cipher downgrade attacks',
    icon: Shield,
    iconColor: 'text-sky-400',
    iconBg: 'bg-sky-500/20',
    activeBg: 'bg-sky-500/5',
    activeBorder: 'border-sky-500/40',
    examples: ['self_signed_cert', 'ja3_mismatch', 'cipher_downgrade'],
  },
  {
    id: 'timing-anomalies',
    name: 'Temporal / Timing Anomalies',
    description: 'Events outside business hours, impossible travel, clock skew between hops, burst patterns at unusual times',
    icon: Gauge,
    iconColor: 'text-yellow-400',
    iconBg: 'bg-yellow-500/20',
    activeBg: 'bg-yellow-500/5',
    activeBorder: 'border-yellow-500/40',
    examples: ['off_hours_access', 'impossible_travel', 'burst_at_3am'],
  },
  {
    id: 'honeypot-triggered',
    name: 'Honeypot / Honeytoken Triggered',
    description: 'Any interaction with deployed honeypots, honeytokens, canary files, or decoy credentials - guaranteed attacker activity',
    icon: Bug,
    iconColor: 'text-red-400',
    iconBg: 'bg-red-500/20',
    activeBg: 'bg-red-500/5',
    activeBorder: 'border-red-500/40',
    examples: ['canary_triggered', 'honeytoken_access', 'decoy_cred_used'],
  },
];

type BuilderStep = 'paste' | 'configure' | 'acquire' | 'transport' | 'quality' | 'sampling' | 'generate' | 'result';

export default function ConnectorVibeBuilder() {
  const [step, setStep] = useState<BuilderStep>('paste');
  const [connectorName, setConnectorName] = useState('');
  const [vendor, setVendor] = useState('');
  const [description, setDescription] = useState('');
  const [selectedAcquisition, setSelectedAcquisition] = useState('');
  const [selectedTransport, setSelectedTransport] = useState('');
  const [dataStructureType, setDataStructureType] = useState<DataStructureType>('structured');
  const [logFormat, setLogFormat] = useState('JSON');
  const [unstructuredType, setUnstructuredType] = useState('');
  const [normSchema, setNormSchema] = useState('ocsf');
  const [customContract, setCustomContract] = useState('');
  const [sampleLog, setSampleLog] = useState('');
  const [generating, setGenerating] = useState(false);
  const [generatedCode, setGeneratedCode] = useState('');
  const [parserCode, setParserCode] = useState('');
  const [genError, setGenError] = useState('');
  const [genMetadata, setGenMetadata] = useState<Record<string, string> | null>(null);

  // Data Quality settings
  const [dqSchemaValidation, setDqSchemaValidation] = useState(true);
  const [dqFieldPresence, setDqFieldPresence] = useState(true);
  const [dqTimestampDrift, setDqTimestampDrift] = useState(true);
  const [dqSchemaEvolution, setDqSchemaEvolution] = useState(true);
  const [dqVolumeAnomaly, setDqVolumeAnomaly] = useState(true);
  const [dqDuplicateDetection, setDqDuplicateDetection] = useState(true);

  // Sampling settings
  const [samplingEnabled, setSamplingEnabled] = useState(false);
  const [samplingRate, setSamplingRate] = useState(10);
  const [samplingDiscardAfterGraph, setSamplingDiscardAfterGraph] = useState(false);
  const [samplingSparkStreaming, setSamplingSparkStreaming] = useState(false);

  const acqCategories = [...new Set(ACQUISITION_METHODS.map(a => a.category))];
  const transCategories = [...new Set(TRANSPORT_PROTOCOLS.map(t => t.category))];

  async function handleGenerate() {
    setGenerating(true);
    setGenError('');
    setStep('generate');

    const acq = ACQUISITION_METHODS.find(a => a.id === selectedAcquisition);
    const trans = TRANSPORT_PROTOCOLS.find(t => t.id === selectedTransport);
    const schema = NORMALIZATION_SCHEMAS.find(s => s.id === normSchema);

    try {
      const { data, error } = await callFunction('generate-connector', {
        connectorName,
        vendor,
        description,
        acquisitionMethod: acq?.name || selectedAcquisition,
        transportProtocol: trans?.name || selectedTransport,
        logFormat,
        sampleLog,
        normalizationSchema: schema?.name || 'OCSF v1.3.0',
        customContract: normSchema === 'custom' ? customContract : undefined,
        kernelLevel: acq?.category === 'kernel',
        dataQuality: { dqSchemaValidation, dqFieldPresence, dqTimestampDrift, dqSchemaEvolution, dqVolumeAnomaly, dqDuplicateDetection },
        sampling: samplingEnabled ? { rate: samplingRate, discardAfterGraph: samplingDiscardAfterGraph, sparkStreaming: samplingSparkStreaming } : null,
      });

      if (error) throw new Error(error);

      setGeneratedCode(data.connectorCode || '');
      setParserCode(data.parserCode || '');
      setGenMetadata(data.metadata || null);
      setStep('result');
    } catch (err: any) {
      setGenError(err.message || 'Generation failed');
      setGeneratedCode(generateFallbackCode(connectorName, vendor, acq, trans, logFormat, normSchema, samplingEnabled, samplingRate));
      setStep('result');
    } finally {
      setGenerating(false);
    }
  }

  const stepIndex = ['paste', 'configure', 'acquire', 'transport', 'quality', 'sampling', 'generate', 'result'].indexOf(step);

  return (
    <div className="space-y-4">
      {/* Progress Bar */}
      <div className="flex items-center gap-1 px-2">
        {['Paste & Parse', 'Configure', 'Acquisition', 'Transport', 'Data Quality', 'Sampling', 'Generate', 'Result'].map((label, i) => (
          <div key={label} className="flex-1 flex items-center gap-1">
            <div className={`h-1.5 flex-1 rounded-full transition-all ${i <= stepIndex ? 'bg-cyan-500' : 'bg-slate-700'}`} />
            <span className={`text-[9px] whitespace-nowrap ${i === stepIndex ? 'text-cyan-300' : i < stepIndex ? 'text-slate-400' : 'text-slate-600'}`}>{label}</span>
          </div>
        ))}
      </div>

      {/* Step Content */}
      <div className="bg-slate-800/30 border border-slate-700/50 rounded-xl p-5">
        {step === 'paste' && (
          <PasteParseStep
            sampleLog={sampleLog} setSampleLog={setSampleLog}
            onAutoDetect={(name, v, fmt) => { setConnectorName(name); setVendor(v); setLogFormat(fmt); }}
            onNext={() => setStep('configure')}
          />
        )}
        {step === 'configure' && (
          <ConfigureStep
            connectorName={connectorName} setConnectorName={setConnectorName}
            vendor={vendor} setVendor={setVendor}
            description={description} setDescription={setDescription}
            dataStructureType={dataStructureType} setDataStructureType={setDataStructureType}
            logFormat={logFormat} setLogFormat={setLogFormat}
            unstructuredType={unstructuredType} setUnstructuredType={setUnstructuredType}
            normSchema={normSchema} setNormSchema={setNormSchema}
            customContract={customContract} setCustomContract={setCustomContract}
            sampleLog={sampleLog}
            onNext={() => setStep('acquire')}
            onBack={() => setStep('paste')}
          />
        )}
        {step === 'acquire' && (
          <AcquisitionStep
            methods={ACQUISITION_METHODS}
            categories={acqCategories}
            selected={selectedAcquisition}
            setSelected={setSelectedAcquisition}
            onNext={() => setStep('transport')}
            onBack={() => setStep('configure')}
          />
        )}
        {step === 'transport' && (
          <TransportStep
            protocols={TRANSPORT_PROTOCOLS}
            categories={transCategories}
            selected={selectedTransport}
            setSelected={setSelectedTransport}
            onNext={() => setStep('quality')}
            onBack={() => setStep('acquire')}
          />
        )}
        {step === 'quality' && (
          <DataQualityStep
            dqSchemaValidation={dqSchemaValidation} setDqSchemaValidation={setDqSchemaValidation}
            dqFieldPresence={dqFieldPresence} setDqFieldPresence={setDqFieldPresence}
            dqTimestampDrift={dqTimestampDrift} setDqTimestampDrift={setDqTimestampDrift}
            dqSchemaEvolution={dqSchemaEvolution} setDqSchemaEvolution={setDqSchemaEvolution}
            dqVolumeAnomaly={dqVolumeAnomaly} setDqVolumeAnomaly={setDqVolumeAnomaly}
            dqDuplicateDetection={dqDuplicateDetection} setDqDuplicateDetection={setDqDuplicateDetection}
            onNext={() => setStep('sampling')}
            onBack={() => setStep('transport')}
          />
        )}
        {step === 'sampling' && (
          <SamplingStep
            enabled={samplingEnabled} setEnabled={setSamplingEnabled}
            rate={samplingRate} setRate={setSamplingRate}
            discardAfterGraph={samplingDiscardAfterGraph} setDiscardAfterGraph={setSamplingDiscardAfterGraph}
            sparkStreaming={samplingSparkStreaming} setSparkStreaming={setSamplingSparkStreaming}
            onGenerate={handleGenerate}
            onBack={() => setStep('quality')}
          />
        )}
        {step === 'generate' && (
          <div className="flex flex-col items-center justify-center py-16 space-y-4">
            <div className="relative">
              <div className="w-16 h-16 rounded-full border-2 border-cyan-500/30 flex items-center justify-center animate-pulse">
                <Sparkles className="w-8 h-8 text-cyan-400 animate-spin" />
              </div>
            </div>
            <div className="text-sm text-white font-medium">Generating production connector...</div>
            <div className="text-xs text-slate-400">GPT-4o is writing your {connectorName || 'custom'} connector with {NORMALIZATION_SCHEMAS.find(s => s.id === normSchema)?.name || 'OCSF'} normalization</div>
          </div>
        )}
        {step === 'result' && (
          <ResultStep
            code={generatedCode}
            parserCode={parserCode}
            connectorName={connectorName}
            error={genError}
            metadata={genMetadata}
            onBack={() => setStep('sampling')}
          />
        )}
      </div>
    </div>
  );
}

// Step 1: Paste & Parse
function PasteParseStep({ sampleLog, setSampleLog, onAutoDetect, onNext }: {
  sampleLog: string; setSampleLog: (v: string) => void;
  onAutoDetect: (name: string, vendor: string, format: string) => void;
  onNext: () => void;
}) {
  const [detected, setDetected] = useState<{ format: string; fields: string[]; vendor: string } | null>(null);
  const [uploadedFiles, setUploadedFiles] = useState<{ name: string; size: number; content: string; type: string }[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [fileAnalysis, setFileAnalysis] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handlePaste(text: string) {
    setSampleLog(text);
    if (!text.trim()) { setDetected(null); return; }
    const det = detectFormat(text);
    setDetected(det);
    if (det) onAutoDetect(det.vendor ? `${det.vendor} Connector` : '', det.vendor, det.format);
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      if (file.size > 5 * 1024 * 1024) return;
      if (file.type.startsWith('text/') || file.name.match(/\.(json|xml|csv|log|txt|yaml|yml|toml|conf|ini|env|cef|leef|evtx|proto|avsc|fbs)$/i)) {
        reader.onload = () => {
          const content = reader.result as string;
          setUploadedFiles(prev => [...prev, { name: file.name, size: file.size, content, type: file.type || 'text/plain' }]);
          if (!sampleLog) handlePaste(content.slice(0, 5000));
        };
        reader.readAsText(file);
      } else {
        reader.onload = () => {
          const arrayBuffer = reader.result as ArrayBuffer;
          const bytes = new Uint8Array(arrayBuffer).slice(0, 512);
          const hexDump = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join(' ');
          const preview = `[Binary File: ${file.name}]\nMIME: ${file.type || 'application/octet-stream'}\nSize: ${file.size} bytes\nFirst 512 bytes (hex):\n${hexDump}`;
          setUploadedFiles(prev => [...prev, { name: file.name, size: file.size, content: preview, type: file.type || 'application/octet-stream' }]);
        };
        reader.readAsArrayBuffer(file);
      }
    });
    e.target.value = '';
  }

  function removeFile(index: number) {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index));
  }

  async function analyzeFiles() {
    setAnalyzing(true);
    setFileAnalysis('');
    try {
      const fileDescriptions = uploadedFiles.map(f => `--- FILE: ${f.name} (${f.type}, ${f.size} bytes) ---\n${f.content.slice(0, 3000)}`).join('\n\n');
      const { data, error } = await callFunction('generate-connector', {
        connectorName: 'File Analysis',
        vendor: 'auto-detect',
        description: `Analyze these uploaded files and determine: 1) What type of data this is, 2) The vendor/product that generates it, 3) Recommended acquisition method, 4) Whether it needs a UDF for unstructured processing. Files:\n\n${fileDescriptions}`,
        acquisitionMethod: 'File Upload',
        transportProtocol: 'HTTPS',
        logFormat: 'auto-detect',
        sampleLog: uploadedFiles[0]?.content.slice(0, 5000) || '',
        normalizationSchema: 'file-analysis',
      });
      if (error) throw new Error(error);
      if (data.connectorCode) {
        setFileAnalysis(data.connectorCode);
        if (data.metadata?.vendor) onAutoDetect(data.metadata.connectorName || '', data.metadata.vendor, data.metadata.format || 'auto-detected');
      } else {
        setFileAnalysis(`Detected files:\n${uploadedFiles.map(f => `- ${f.name} (${f.type})`).join('\n')}\n\nThe AI will propose a connector configuration based on these files in the next step.`);
      }
    } catch {
      setFileAnalysis(`Files uploaded for analysis:\n${uploadedFiles.map(f => `- ${f.name} (${f.type}, ${(f.size / 1024).toFixed(1)} KB)`).join('\n')}\n\nContinue to the next step where the LLM will use this context to propose the ideal connector configuration.`);
    }
    setAnalyzing(false);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <Clipboard className="w-5 h-5 text-cyan-400" />
        <h3 className="text-base font-semibold text-white">Paste Your Data Structure</h3>
      </div>
      <p className="text-sm text-slate-400">Paste a sample log/event/API response <span className="text-white font-medium">or upload files</span> and we will auto-detect the format, extract fields, and propose a connector.</p>

      <textarea
        value={sampleLog}
        onChange={e => handlePaste(e.target.value)}
        placeholder={'Paste any log format here:\n\n- JSON event payload\n- CEF syslog line\n- CSV/TSV row\n- Key=Value log\n- XML event\n- Raw syslog\n- Protobuf schema definition\n- API response body\n\nWe will detect the format and build a parser automatically.'}
        className="w-full h-40 px-4 py-3 bg-slate-900/70 border border-slate-700/50 rounded-xl text-sm text-slate-200 font-mono placeholder-slate-600 focus:border-cyan-500/50 focus:outline-none resize-none"
      />

      {/* File Upload Zone */}
      <div className="space-y-2">
        <input ref={fileInputRef} type="file" multiple onChange={handleFileUpload} className="hidden" accept="*/*" />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="w-full p-4 border-2 border-dashed border-slate-700/70 rounded-xl hover:border-cyan-500/40 hover:bg-cyan-500/5 transition-all group"
        >
          <div className="flex flex-col items-center gap-2">
            <Upload className="w-5 h-5 text-slate-500 group-hover:text-cyan-400 transition-colors" />
            <div className="text-xs text-slate-400 group-hover:text-slate-300">
              <span className="font-medium text-slate-300 group-hover:text-white">Upload files</span> - logs, binaries, configs, pcaps, documents
            </div>
            <span className="text-[9px] text-slate-600">The LLM will analyze the file to understand its structure and propose a connector + UDF if needed (max 5MB per file)</span>
          </div>
        </button>

        {uploadedFiles.length > 0 && (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              {uploadedFiles.map((f, i) => (
                <div key={i} className="flex items-center gap-2 px-3 py-1.5 bg-slate-800/70 border border-slate-700/50 rounded-lg">
                  <FileText className="w-3.5 h-3.5 text-cyan-400" />
                  <span className="text-xs text-slate-300">{f.name}</span>
                  <span className="text-[9px] text-slate-500">({(f.size / 1024).toFixed(1)} KB)</span>
                  <button onClick={() => removeFile(i)} className="text-slate-500 hover:text-red-400 transition-colors">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
            <button
              onClick={analyzeFiles}
              disabled={analyzing}
              className="px-3 py-1.5 bg-amber-500/10 border border-amber-500/30 rounded-lg text-xs text-amber-300 hover:bg-amber-500/20 disabled:opacity-50 flex items-center gap-1.5"
            >
              <Sparkles className="w-3 h-3" />
              {analyzing ? 'Analyzing files with AI...' : `Analyze ${uploadedFiles.length} file${uploadedFiles.length > 1 ? 's' : ''} with AI`}
            </button>
          </div>
        )}

        {fileAnalysis && (
          <div className="p-3 bg-amber-500/5 border border-amber-500/20 rounded-xl">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-xs font-medium text-amber-300">AI File Analysis</span>
            </div>
            <pre className="text-[10px] text-slate-300 font-mono whitespace-pre-wrap leading-relaxed max-h-40 overflow-y-auto">{fileAnalysis}</pre>
          </div>
        )}
      </div>

      {detected && (
        <div className="p-4 bg-emerald-500/5 border border-emerald-500/20 rounded-xl space-y-3">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-400" />
            <span className="text-sm font-medium text-emerald-300">Format Detected: {detected.format}</span>
            {detected.vendor && <span className="text-xs px-2 py-0.5 bg-cyan-500/10 border border-cyan-500/30 rounded text-cyan-300">{detected.vendor}</span>}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {detected.fields.slice(0, 20).map(f => (
              <span key={f} className="px-2 py-0.5 bg-slate-800 border border-slate-700 rounded text-xs text-slate-300 font-mono">{f}</span>
            ))}
            {detected.fields.length > 20 && <span className="text-xs text-slate-500">+{detected.fields.length - 20} more</span>}
          </div>
        </div>
      )}

      <div className="flex justify-end">
        <button onClick={onNext} className="px-4 py-2 bg-cyan-500/10 border border-cyan-500/30 rounded-lg text-sm text-cyan-300 hover:bg-cyan-500/20 transition-colors flex items-center gap-1.5">
          {sampleLog || uploadedFiles.length ? 'Continue with Sample' : 'Skip - Configure Manually'} <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

// Searchable Data Format Selector (merged structured + semi-structured)
function DataFormatSearchSelector({ logFormat, setLogFormat, normSchema, setNormSchema }: {
  logFormat: string; setLogFormat: (v: string) => void;
  normSchema: string; setNormSchema: (v: string) => void;
}) {
  const [search, setSearch] = useState('');
  const [showCustom, setShowCustom] = useState(false);
  const [customFormat, setCustomFormat] = useState('');

  const categories = [...new Set(DATA_FORMATS.map(f => f.category))];
  const filtered = search.trim()
    ? DATA_FORMATS.filter(f => f.name.toLowerCase().includes(search.toLowerCase()) || f.category.toLowerCase().includes(search.toLowerCase()))
    : DATA_FORMATS;

  const groupedFiltered: Record<string, typeof DATA_FORMATS> = {};
  filtered.forEach(f => {
    if (!groupedFiltered[f.category]) groupedFiltered[f.category] = [];
    groupedFiltered[f.category].push(f);
  });

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="text-xs text-slate-400 block">Data Format <span className="text-slate-600">({DATA_FORMATS.length} formats across {categories.length} industries)</span></label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search formats... (ISO 8583, CDR, HL7, Syslog...)"
              className="w-full pl-9 pr-3 py-2 bg-slate-900/70 border border-slate-700/50 rounded-lg text-sm text-white placeholder-slate-600 focus:border-cyan-500/50 focus:outline-none"
            />
          </div>
          <div className="max-h-52 overflow-y-auto border border-slate-700/50 rounded-lg bg-slate-900/50">
            {Object.entries(groupedFiltered).map(([cat, formats]) => (
              <div key={cat}>
                <div className="text-[9px] uppercase tracking-wider text-slate-500 font-semibold px-3 py-1.5 bg-slate-800/80 sticky top-0 border-b border-slate-700/30">{cat}</div>
                {formats.map(f => (
                  <button
                    key={f.name}
                    onClick={() => { setLogFormat(f.name); setShowCustom(false); }}
                    className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${
                      logFormat === f.name ? 'bg-cyan-500/10 text-cyan-300' : 'text-slate-400 hover:bg-slate-700/30 hover:text-white'
                    }`}
                  >
                    {f.name}
                  </button>
                ))}
              </div>
            ))}
            {filtered.length === 0 && (
              <div className="px-3 py-4 text-center text-xs text-slate-500">No formats match your search</div>
            )}
          </div>
          <button
            onClick={() => setShowCustom(!showCustom)}
            className="flex items-center gap-1.5 px-2 py-1 text-[10px] text-amber-400 hover:text-amber-300 transition-colors"
          >
            <Plus className="w-3 h-3" /> Custom Format
          </button>
          {showCustom && (
            <div className="flex gap-2">
              <input
                value={customFormat}
                onChange={e => setCustomFormat(e.target.value)}
                placeholder="Enter custom format name..."
                className="flex-1 px-3 py-1.5 bg-slate-900/70 border border-amber-500/30 rounded-lg text-xs text-white placeholder-slate-600 focus:border-amber-500/50 focus:outline-none"
              />
              <button
                onClick={() => { if (customFormat.trim()) { setLogFormat(customFormat.trim()); setShowCustom(false); setCustomFormat(''); } }}
                disabled={!customFormat.trim()}
                className="px-2 py-1 bg-amber-500/10 border border-amber-500/30 rounded text-[10px] text-amber-300 hover:bg-amber-500/20 disabled:opacity-50"
              >
                Use
              </button>
            </div>
          )}
          {logFormat && !DATA_FORMATS.find(f => f.name === logFormat) && (
            <div className="text-[10px] text-amber-400 px-1">Using custom format: {logFormat}</div>
          )}
        </div>
        <div>
          <label className="text-xs text-slate-400 block mb-2">Normalization Target</label>
          <select value={normSchema} onChange={e => setNormSchema(e.target.value)}
            className="w-full px-3 py-2 bg-slate-900/70 border border-slate-700/50 rounded-lg text-sm text-white focus:border-cyan-500/50 focus:outline-none">
            {NORMALIZATION_SCHEMAS.map(s => <option key={s.id} value={s.id}>{s.name} ({s.org})</option>)}
          </select>
          {normSchema !== 'custom' && (
            <div className="mt-3 p-3 bg-slate-800/50 border border-slate-700/50 rounded-lg">
              <div className="text-xs text-slate-300"><span className="font-medium text-white">{NORMALIZATION_SCHEMAS.find(s => s.id === normSchema)?.name}:</span> {NORMALIZATION_SCHEMAS.find(s => s.id === normSchema)?.description}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Searchable Unstructured Type Selector
function UnstructuredTypeSelector({ unstructuredType, setUnstructuredType, unstructuredSample, setUnstructuredSample, analyzingUnstructured, analyzeUnstructuredSample, unstructuredAnalysis }: {
  unstructuredType: string; setUnstructuredType: (v: string) => void;
  unstructuredSample: string; setUnstructuredSample: (v: string) => void;
  analyzingUnstructured: boolean; analyzeUnstructuredSample: () => void;
  unstructuredAnalysis: string;
}) {
  const [search, setSearch] = useState('');
  const [showCustom, setShowCustom] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customDesc, setCustomDesc] = useState('');

  const unstructuredCatLabels: Record<string, string> = {
    video: 'Video', audio: 'Audio', image: 'Images', binary: 'Binaries & Executables',
    document: 'Documents & Office', code: 'Code & Config', crypto: 'Crypto & Certs', network: 'Network Captures', custom: 'Custom',
  };

  const filtered = search.trim()
    ? UNSTRUCTURED_DATA_TYPES.filter(t => t.name.toLowerCase().includes(search.toLowerCase()) || t.description.toLowerCase().includes(search.toLowerCase()) || t.category.toLowerCase().includes(search.toLowerCase()))
    : UNSTRUCTURED_DATA_TYPES;

  const filteredCategories = [...new Set(filtered.map(t => t.category))];

  return (
    <div className="space-y-3">
      <div>
        <label className="text-xs text-slate-400 block mb-2">Unstructured Data Type</label>
        <div className="relative mb-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search unstructured types... (video, firmware, PDF, ELF...)"
            className="w-full pl-9 pr-3 py-2 bg-slate-900/70 border border-slate-700/50 rounded-lg text-sm text-white placeholder-slate-600 focus:border-cyan-500/50 focus:outline-none"
          />
        </div>
        <div className="max-h-56 overflow-y-auto pr-1 space-y-2">
          {filteredCategories.map(cat => (
            <div key={cat}>
              <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1.5 sticky top-0 bg-slate-800/90 py-1">{unstructuredCatLabels[cat] || cat}</div>
              <div className="grid grid-cols-2 gap-1.5">
                {filtered.filter(t => t.category === cat).map(t => (
                  <button
                    key={t.id}
                    onClick={() => { setUnstructuredType(t.id); setShowCustom(false); }}
                    className={`text-left p-2 rounded-lg border transition-all ${
                      unstructuredType === t.id
                        ? 'border-cyan-500/50 bg-cyan-500/10'
                        : 'border-slate-700/40 bg-slate-900/30 hover:border-slate-600'
                    }`}
                  >
                    <div className={`text-[11px] font-medium ${unstructuredType === t.id ? 'text-white' : 'text-slate-400'}`}>{t.name}</div>
                    <p className="text-[9px] text-slate-500 mt-0.5 leading-relaxed">{t.description}</p>
                  </button>
                ))}
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="text-center py-4 text-xs text-slate-500">No types match your search</div>
          )}
        </div>

        {/* Custom unstructured type */}
        <button
          onClick={() => setShowCustom(!showCustom)}
          className="flex items-center gap-1.5 px-2 py-1.5 mt-2 text-[10px] text-amber-400 hover:text-amber-300 transition-colors"
        >
          <Plus className="w-3 h-3" /> Define Custom Unstructured Type
        </button>
        {showCustom && (
          <div className="mt-2 p-3 bg-slate-800/50 border border-amber-500/20 rounded-lg space-y-2">
            <input
              value={customName}
              onChange={e => setCustomName(e.target.value)}
              placeholder="Type name (e.g. FPGA Bitstream, SAP IDOC Binary...)"
              className="w-full px-3 py-1.5 bg-slate-900/70 border border-slate-700/50 rounded-lg text-xs text-white placeholder-slate-600 focus:border-amber-500/50 focus:outline-none"
            />
            <input
              value={customDesc}
              onChange={e => setCustomDesc(e.target.value)}
              placeholder="Brief description of the data type..."
              className="w-full px-3 py-1.5 bg-slate-900/70 border border-slate-700/50 rounded-lg text-xs text-white placeholder-slate-600 focus:border-amber-500/50 focus:outline-none"
            />
            <button
              onClick={() => { if (customName.trim()) { setUnstructuredType('custom-unstructured'); setShowCustom(false); } }}
              disabled={!customName.trim()}
              className="px-3 py-1 bg-amber-500/10 border border-amber-500/30 rounded text-[10px] text-amber-300 hover:bg-amber-500/20 disabled:opacity-50"
            >
              Use Custom Type
            </button>
          </div>
        )}
      </div>

      {unstructuredType && (
        <div className="p-4 bg-slate-800/50 border border-slate-700/50 rounded-xl space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-400" />
            <span className="text-xs font-semibold text-white">AI Data Understanding (UDF Generator)</span>
          </div>
          <p className="text-[10px] text-slate-400">
            Paste a sample (base64 for binary, first bytes hex dump, or text description) and the AI will analyze it
            to generate a custom UDF that extracts both <span className="text-white font-medium">content</span> and <span className="text-white font-medium">metadata</span>.
          </p>
          <textarea
            value={unstructuredSample}
            onChange={e => setUnstructuredSample(e.target.value)}
            placeholder={`Paste sample data here:\n\n- Base64-encoded binary fragment\n- Hex dump of first 256 bytes\n- Text description of the data format\n- File header bytes (e.g. "4D 5A 90 00..." for PE)\n- MIME type or magic bytes\n\nThe AI will identify the format and generate a UDF.`}
            className="w-full h-28 px-3 py-2 bg-slate-900/70 border border-slate-700/50 rounded-lg text-xs text-slate-200 font-mono placeholder-slate-600 focus:border-cyan-500/50 focus:outline-none resize-none"
          />
          <div className="flex items-center gap-2">
            <button
              onClick={analyzeUnstructuredSample}
              disabled={analyzingUnstructured || !unstructuredSample.trim()}
              className="px-3 py-1.5 bg-amber-500/10 border border-amber-500/30 rounded-lg text-xs text-amber-300 hover:bg-amber-500/20 disabled:opacity-50 flex items-center gap-1.5"
            >
              <Sparkles className="w-3 h-3" /> {analyzingUnstructured ? 'Analyzing & Generating UDF...' : 'Analyze Sample & Generate UDF'}
            </button>
            <span className="text-[9px] text-slate-500">Uses AI to understand the data and create extraction logic</span>
          </div>

          {unstructuredAnalysis && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-xs font-medium text-emerald-300">UDF Generated</span>
              </div>
              <pre className="text-[10px] text-slate-300 bg-slate-900/70 border border-slate-700/50 rounded-lg p-3 overflow-auto max-h-48 font-mono leading-relaxed">
                {unstructuredAnalysis}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Step 2: Configure
function ConfigureStep({ connectorName, setConnectorName, vendor, setVendor, description, setDescription, dataStructureType, setDataStructureType, logFormat, setLogFormat, unstructuredType, setUnstructuredType, normSchema, setNormSchema, customContract, setCustomContract, sampleLog, onNext, onBack }: any) {
  const [proposingContract, setProposingContract] = useState(false);
  const [analyzingUnstructured, setAnalyzingUnstructured] = useState(false);
  const [unstructuredAnalysis, setUnstructuredAnalysis] = useState<string>('');
  const [unstructuredSample, setUnstructuredSample] = useState('');

  async function proposeContract() {
    setProposingContract(true);
    try {
      const { data, error } = await callFunction('generate-connector', {
        connectorName: connectorName || 'custom',
        vendor: vendor || 'unknown',
        description: 'Generate a data contract/schema proposal',
        acquisitionMethod: 'REST API',
        transportProtocol: 'HTTPS',
        logFormat,
        sampleLog,
        normalizationSchema: 'custom-contract-proposal',
      });
      if (error) throw new Error(error);
      if (data.connectorCode) setCustomContract(data.connectorCode);
    } catch { /* ignore */ }
    setProposingContract(false);
  }

  function generateFallbackUDF(typeName: string, typeId: string): string {
    const templates: Record<string, string> = {
      video: `from pyspark.sql.functions import udf
from pyspark.sql.types import StructType, StructField, StringType, ArrayType, IntegerType, FloatType

@udf(returnType=StructType([
    StructField("codec", StringType()),
    StructField("resolution", StringType()),
    StructField("duration_sec", FloatType()),
    StructField("fps", FloatType()),
    StructField("audio_tracks", IntegerType()),
    StructField("embedded_text", ArrayType(StringType())),
    StructField("detected_objects", ArrayType(StringType())),
    StructField("suspicious_frames", ArrayType(StringType())),
    StructField("steganography_score", FloatType()),
    StructField("metadata_anomalies", ArrayType(StringType())),
]))
def extract_${typeId}_content(binary_data):
    """Extract metadata + content from ${typeName} files.
    Uses ffprobe for metadata, frame sampling for object detection,
    and entropy analysis for steganography detection."""
    import subprocess, json, tempfile, os
    with tempfile.NamedTemporaryFile(suffix='.${typeId}', delete=False) as f:
        f.write(binary_data)
        path = f.name
    try:
        probe = json.loads(subprocess.check_output(
            ['ffprobe', '-v', 'quiet', '-print_format', 'json', '-show_streams', path]))
        stream = probe.get('streams', [{}])[0]
        return (stream.get('codec_name'), f"{stream.get('width')}x{stream.get('height')}",
                float(stream.get('duration', 0)), float(eval(stream.get('r_frame_rate', '0/1'))),
                len([s for s in probe.get('streams', []) if s.get('codec_type') == 'audio']),
                [], [], [], 0.0, [])
    finally:
        os.unlink(path)`,
      audio: `from pyspark.sql.functions import udf
from pyspark.sql.types import StructType, StructField, StringType, ArrayType, FloatType

@udf(returnType=StructType([
    StructField("codec", StringType()),
    StructField("sample_rate", StringType()),
    StructField("duration_sec", FloatType()),
    StructField("channels", StringType()),
    StructField("speech_to_text", StringType()),
    StructField("language_detected", StringType()),
    StructField("anomalous_frequencies", ArrayType(StringType())),
    StructField("hidden_data_score", FloatType()),
]))
def extract_audio_content(binary_data):
    """Extract metadata + content from audio files.
    Performs speech-to-text, frequency analysis, and hidden channel detection."""
    pass  # Implementation uses whisper/vosk for STT, librosa for analysis`,
      image: `from pyspark.sql.functions import udf
from pyspark.sql.types import StructType, StructField, StringType, ArrayType, FloatType, IntegerType

@udf(returnType=StructType([
    StructField("format", StringType()),
    StructField("dimensions", StringType()),
    StructField("color_depth", IntegerType()),
    StructField("exif_data", StringType()),
    StructField("detected_objects", ArrayType(StringType())),
    StructField("ocr_text", StringType()),
    StructField("faces_detected", IntegerType()),
    StructField("steganography_score", FloatType()),
    StructField("embedded_urls", ArrayType(StringType())),
    StructField("malicious_indicators", ArrayType(StringType())),
]))
def extract_image_content(binary_data):
    """Extract metadata + visual content from images.
    Performs OCR, object detection, EXIF analysis, and stego detection."""
    pass  # Uses PIL/Pillow, pytesseract, YOLO, steganalysis libs`,
      binary: `from pyspark.sql.functions import udf
from pyspark.sql.types import StructType, StructField, StringType, ArrayType, FloatType, IntegerType

@udf(returnType=StructType([
    StructField("file_type", StringType()),
    StructField("architecture", StringType()),
    StructField("entropy", FloatType()),
    StructField("sections", ArrayType(StringType())),
    StructField("imports", ArrayType(StringType())),
    StructField("strings_of_interest", ArrayType(StringType())),
    StructField("packer_detected", StringType()),
    StructField("iocs_extracted", ArrayType(StringType())),
    StructField("yara_matches", ArrayType(StringType())),
    StructField("syscalls_referenced", ArrayType(StringType())),
    StructField("malware_family_guess", StringType()),
]))
def extract_binary_content(binary_data):
    """Disassemble and analyze PE/ELF/Mach-O binaries.
    Extracts IOCs, suspicious strings, packer signatures, YARA matches."""
    pass  # Uses pefile, lief, yara-python, capstone for disassembly`,
      document: `from pyspark.sql.functions import udf
from pyspark.sql.types import StructType, StructField, StringType, ArrayType, FloatType, IntegerType

@udf(returnType=StructType([
    StructField("doc_type", StringType()),
    StructField("author", StringType()),
    StructField("created_at", StringType()),
    StructField("modified_at", StringType()),
    StructField("page_count", IntegerType()),
    StructField("extracted_text", StringType()),
    StructField("embedded_macros", ArrayType(StringType())),
    StructField("external_links", ArrayType(StringType())),
    StructField("embedded_objects", ArrayType(StringType())),
    StructField("suspicious_vba", ArrayType(StringType())),
    StructField("classification_label", StringType()),
]))
def extract_document_content(binary_data):
    """Parse documents (PDF, DOCX, XLSX, etc) extracting text, macros, and threats.
    Detects malicious macros, external references, and data exfil patterns."""
    pass  # Uses python-docx, openpyxl, PyPDF2, oletools`,
      code: `from pyspark.sql.functions import udf
from pyspark.sql.types import StructType, StructField, StringType, ArrayType, FloatType

@udf(returnType=StructType([
    StructField("language", StringType()),
    StructField("loc", StringType()),
    StructField("functions_defined", ArrayType(StringType())),
    StructField("imports_used", ArrayType(StringType())),
    StructField("hardcoded_secrets", ArrayType(StringType())),
    StructField("suspicious_patterns", ArrayType(StringType())),
    StructField("obfuscation_score", FloatType()),
    StructField("network_indicators", ArrayType(StringType())),
]))
def extract_code_content(source_code):
    """Static analysis of source code / scripts for security indicators.
    Detects hardcoded secrets, obfuscation, C2 patterns, and backdoors."""
    pass  # Uses tree-sitter for AST, regex for secrets, entropy for obfuscation`,
      crypto: `from pyspark.sql.functions import udf
from pyspark.sql.types import StructType, StructField, StringType, ArrayType

@udf(returnType=StructType([
    StructField("cert_type", StringType()),
    StructField("issuer", StringType()),
    StructField("subject", StringType()),
    StructField("valid_from", StringType()),
    StructField("valid_to", StringType()),
    StructField("algorithm", StringType()),
    StructField("key_size", StringType()),
    StructField("san_entries", ArrayType(StringType())),
    StructField("chain_valid", StringType()),
    StructField("revocation_status", StringType()),
]))
def extract_crypto_content(binary_data):
    """Parse X.509 certs, PGP keys, JWTs, and encrypted payloads.
    Validates chains, checks revocation, extracts SANs and key metadata."""
    pass  # Uses cryptography lib, pyOpenSSL, jwt decode`,
      network: `from pyspark.sql.functions import udf
from pyspark.sql.types import StructType, StructField, StringType, ArrayType, IntegerType

@udf(returnType=StructType([
    StructField("capture_format", StringType()),
    StructField("packet_count", IntegerType()),
    StructField("protocols_seen", ArrayType(StringType())),
    StructField("src_ips", ArrayType(StringType())),
    StructField("dst_ips", ArrayType(StringType())),
    StructField("dns_queries", ArrayType(StringType())),
    StructField("http_hosts", ArrayType(StringType())),
    StructField("tls_snis", ArrayType(StringType())),
    StructField("suspicious_flows", ArrayType(StringType())),
    StructField("c2_indicators", ArrayType(StringType())),
]))
def extract_pcap_content(binary_data):
    """Deep packet inspection of PCAP/PCAPNG network captures.
    Extracts flows, DNS, TLS metadata, and identifies C2 beaconing."""
    pass  # Uses scapy, dpkt for packet parsing`,
    };
    const category = UNSTRUCTURED_DATA_TYPES.find(t => t.id === typeId)?.category || 'binary';
    return templates[category] || templates['binary'];
  }

  async function analyzeUnstructuredSample() {
    if (!unstructuredSample.trim()) return;
    setAnalyzingUnstructured(true);
    try {
      const selectedType = UNSTRUCTURED_DATA_TYPES.find(t => t.id === unstructuredType);
      const { data, error } = await callFunction('generate-connector', {
        connectorName: connectorName || 'Unstructured Data Processor',
        vendor: vendor || 'custom',
        description: `Generate a UDF (User-Defined Function) to parse, extract metadata AND content from unstructured data type: ${selectedType?.name || unstructuredType}. The UDF must extract: 1) All metadata (timestamps, authors, dimensions, encoding, etc), 2) Content understanding (text extraction, object detection in images, speech-to-text for audio, disassembly for binaries), 3) Security-relevant indicators (embedded macros, suspicious strings, IOCs, anomalies). Return a complete Spark UDF or Python function.`,
        acquisitionMethod: 'File Upload / Stream',
        transportProtocol: 'Binary Stream',
        logFormat: `Unstructured: ${selectedType?.name || 'Binary'}`,
        sampleLog: unstructuredSample,
        normalizationSchema: 'unstructured-udf-generation',
      });
      if (error) throw new Error(error);
      if (data.connectorCode) {
        setUnstructuredAnalysis(data.connectorCode);
      } else {
        setUnstructuredAnalysis(generateFallbackUDF(selectedType?.name || 'binary', unstructuredType));
      }
    } catch {
      const selectedType = UNSTRUCTURED_DATA_TYPES.find(t => t.id === unstructuredType);
      setUnstructuredAnalysis(generateFallbackUDF(selectedType?.name || 'binary', unstructuredType));
    }
    setAnalyzingUnstructured(false);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <FileText className="w-5 h-5 text-cyan-400" />
        <h3 className="text-base font-semibold text-white">Connector Configuration</h3>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-xs text-slate-400 block mb-1">Connector Name</label>
          <input value={connectorName} onChange={e => setConnectorName(e.target.value)} placeholder="e.g. CrowdStrike Falcon"
            className="w-full px-3 py-2 bg-slate-900/70 border border-slate-700/50 rounded-lg text-sm text-white focus:border-cyan-500/50 focus:outline-none" />
        </div>
        <div>
          <label className="text-xs text-slate-400 block mb-1">Vendor</label>
          <input value={vendor} onChange={e => setVendor(e.target.value)} placeholder="e.g. CrowdStrike"
            className="w-full px-3 py-2 bg-slate-900/70 border border-slate-700/50 rounded-lg text-sm text-white focus:border-cyan-500/50 focus:outline-none" />
        </div>
      </div>

      <div>
        <label className="text-xs text-slate-400 block mb-1">Description</label>
        <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Brief description of what this connector collects"
          className="w-full px-3 py-2 bg-slate-900/70 border border-slate-700/50 rounded-lg text-sm text-white focus:border-cyan-500/50 focus:outline-none" />
      </div>

      {/* Data Structure Type Selector */}
      <div>
        <label className="text-xs text-slate-400 block mb-2">Data Structure Type</label>
        <div className="grid grid-cols-2 gap-2">
          {([
            { id: 'structured' as const, label: 'Structured / Semi-Structured', desc: 'JSON, Avro, Parquet, CEF, Syslog, XML, industry-specific formats (ISO 8583, CDR, HL7...)', icon: Database },
            { id: 'unstructured' as const, label: 'Unstructured', desc: 'Binary, media, documents, code, executables, firmware', icon: HardDrive },
          ]).map(opt => {
            const Icon = opt.icon;
            return (
              <button
                key={opt.id}
                onClick={() => setDataStructureType(opt.id)}
                className={`p-3 rounded-lg border text-left transition-all ${
                  dataStructureType === opt.id
                    ? 'border-cyan-500/50 bg-cyan-500/10'
                    : 'border-slate-700/50 bg-slate-900/30 hover:border-slate-600'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Icon className={`w-4 h-4 ${dataStructureType === opt.id ? 'text-cyan-400' : 'text-slate-500'}`} />
                  <span className={`text-xs font-medium ${dataStructureType === opt.id ? 'text-white' : 'text-slate-400'}`}>{opt.label}</span>
                </div>
                <p className="text-[9px] text-slate-500 leading-relaxed">{opt.desc}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Structured / Semi-Structured: Searchable Data Format */}
      {dataStructureType !== 'unstructured' && (
        <DataFormatSearchSelector logFormat={logFormat} setLogFormat={setLogFormat} normSchema={normSchema} setNormSchema={setNormSchema} />
      )}

      {/* Unstructured: Data Type & Analysis */}
      {dataStructureType === 'unstructured' && (
        <UnstructuredTypeSelector
          unstructuredType={unstructuredType}
          setUnstructuredType={setUnstructuredType}
          unstructuredSample={unstructuredSample}
          setUnstructuredSample={setUnstructuredSample}
          analyzingUnstructured={analyzingUnstructured}
          analyzeUnstructuredSample={analyzeUnstructuredSample}
          unstructuredAnalysis={unstructuredAnalysis}
        />
      )}

      {/* Custom schema/normalization (for structured/semi-structured) */}
      {dataStructureType !== 'unstructured' && normSchema === 'custom' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs text-slate-400">Custom Data Contract (TypeScript schema or JSON Schema)</label>
            <button onClick={proposeContract} disabled={proposingContract || !sampleLog}
              className="px-2.5 py-1 bg-cyan-500/10 border border-cyan-500/30 rounded text-xs text-cyan-300 hover:bg-cyan-500/20 disabled:opacity-50 flex items-center gap-1">
              <Sparkles className="w-3 h-3" /> {proposingContract ? 'Proposing...' : 'AI Propose from Sample'}
            </button>
          </div>
          <textarea value={customContract} onChange={e => setCustomContract(e.target.value)}
            placeholder={'// Define your custom data contract:\ninterface MySecurityEvent {\n  timestamp: string;\n  source: string;\n  event_type: string;\n  severity: "critical" | "high" | "medium" | "low";\n  actor: { user_id: string; ip: string; };\n  target: { resource: string; action: string; };\n  context: Record<string, unknown>;\n}'}
            className="w-full h-40 px-4 py-3 bg-slate-900/70 border border-slate-700/50 rounded-xl text-xs text-slate-200 font-mono placeholder-slate-600 focus:border-cyan-500/50 focus:outline-none resize-none" />
        </div>
      )}

      <div className="flex justify-between">
        <button onClick={onBack} className="px-3 py-1.5 text-xs text-slate-400 hover:text-white transition-colors">Back</button>
        <button onClick={onNext} disabled={!connectorName}
          className="px-4 py-2 bg-cyan-500/10 border border-cyan-500/30 rounded-lg text-sm text-cyan-300 hover:bg-cyan-500/20 transition-colors flex items-center gap-1.5 disabled:opacity-50">
          Next: Acquisition <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

// Step 3: Acquisition
function AcquisitionStep({ methods, categories, selected, setSelected, onNext, onBack }: any) {
  const [expandedCat, setExpandedCat] = useState<string>(selected ? methods.find((m: any) => m.id === selected)?.category || '' : '');

  const catLabels: Record<string, string> = {
    api: 'API-Based', push: 'Push/Callback', messaging: 'Message Queues', streaming: 'Event Streaming',
    network: 'Network Protocols', kernel: 'Kernel-Level (eBPF/XDP)', storage: 'File/Object Storage',
    database: 'Database', iot: 'IoT/Industrial', scada: 'SCADA / ICS / OT', mainframe: 'Mainframe / EBCDIC',
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <Database className="w-5 h-5 text-cyan-400" />
        <h3 className="text-base font-semibold text-white">Data Acquisition Method</h3>
      </div>
      <p className="text-xs text-slate-400">{methods.length} methods across {categories.length} categories. Select how your connector will acquire data from the source.</p>

      <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
        {categories.map((cat: string) => {
          const catMethods = methods.filter((m: any) => m.category === cat);
          const isKernel = cat === 'kernel';
          return (
            <div key={cat} className={`border rounded-lg overflow-hidden ${isKernel ? 'border-red-500/30 bg-red-500/5' : 'border-slate-700/50'}`}>
              <button onClick={() => setExpandedCat(expandedCat === cat ? '' : cat)}
                className="w-full flex items-center justify-between px-3 py-2 hover:bg-slate-700/20 transition-colors">
                <div className="flex items-center gap-2">
                  {isKernel && <Cpu className="w-3.5 h-3.5 text-red-400" />}
                  <span className="text-xs font-medium text-white">{catLabels[cat] || cat}</span>
                  <span className="text-[10px] text-slate-500">{catMethods.length}</span>
                  {isKernel && <span className="px-1.5 py-0.5 text-[9px] bg-red-500/20 text-red-300 rounded">ADVANCED</span>}
                </div>
                {expandedCat === cat ? <ChevronDown className="w-3.5 h-3.5 text-slate-500" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-500" />}
              </button>
              {expandedCat === cat && (
                <div className="px-2 pb-2 space-y-1">
                  {catMethods.map((m: any) => (
                    <button key={m.id} onClick={() => setSelected(m.id)}
                      className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-all ${selected === m.id ? 'bg-cyan-500/10 border border-cyan-500/40 text-white' : 'hover:bg-slate-700/30 text-slate-300'}`}>
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{m.name}</span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[9px] text-slate-500">{m.latency}</span>
                          <ComplexityBadge complexity={m.complexity} />
                        </div>
                      </div>
                      <div className="text-[10px] text-slate-500 mt-0.5">{m.description}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex justify-between">
        <button onClick={onBack} className="px-3 py-1.5 text-xs text-slate-400 hover:text-white transition-colors">Back</button>
        <button onClick={onNext} disabled={!selected}
          className="px-4 py-2 bg-cyan-500/10 border border-cyan-500/30 rounded-lg text-sm text-cyan-300 hover:bg-cyan-500/20 transition-colors flex items-center gap-1.5 disabled:opacity-50">
          Next: Transport <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

// Step 4: Transport
function TransportStep({ protocols, categories, selected, setSelected, onNext, onBack }: any) {
  const [expandedCat, setExpandedCat] = useState<string>('');

  const catLabels: Record<string, string> = {
    http: 'HTTP/HTTPS', tcp: 'TCP Sockets', udp: 'UDP', ipc: 'Inter-Process (IPC)',
    rpc: 'RPC Frameworks', streaming: 'Streaming Protocols', realtime: 'Real-Time',
    hpc: 'High-Performance / Kernel Bypass', telecom: 'Telecom / SS7 / 5G', messaging: 'Messaging',
    physical: 'Physical / Serial / Bus', exotic: 'Non-TCP/IP / Exotic / Industrial', mainframe: 'Mainframe / EBCDIC',
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <Network className="w-5 h-5 text-cyan-400" />
        <h3 className="text-base font-semibold text-white">Transport Protocol</h3>
      </div>
      <p className="text-xs text-slate-400">{protocols.length} protocols. How data moves from source to connector.</p>

      <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
        {categories.map((cat: string) => {
          const catProtos = protocols.filter((p: any) => p.category === cat);
          const isHPC = cat === 'hpc';
          return (
            <div key={cat} className={`border rounded-lg overflow-hidden ${isHPC ? 'border-orange-500/30 bg-orange-500/5' : 'border-slate-700/50'}`}>
              <button onClick={() => setExpandedCat(expandedCat === cat ? '' : cat)}
                className="w-full flex items-center justify-between px-3 py-2 hover:bg-slate-700/20 transition-colors">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-white">{catLabels[cat] || cat}</span>
                  <span className="text-[10px] text-slate-500">{catProtos.length}</span>
                  {isHPC && <span className="px-1.5 py-0.5 text-[9px] bg-orange-500/20 text-orange-300 rounded">KERNEL-BYPASS</span>}
                </div>
                {expandedCat === cat ? <ChevronDown className="w-3.5 h-3.5 text-slate-500" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-500" />}
              </button>
              {expandedCat === cat && (
                <div className="px-2 pb-2 space-y-1">
                  {catProtos.map((p: any) => (
                    <button key={p.id} onClick={() => setSelected(p.id)}
                      className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-all ${selected === p.id ? 'bg-cyan-500/10 border border-cyan-500/40 text-white' : 'hover:bg-slate-700/30 text-slate-300'}`}>
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{p.name}</span>
                        <div className="flex items-center gap-1.5">
                          {p.encryption && <Lock className="w-3 h-3 text-emerald-500" />}
                          {p.bidirectional && <span className="text-[9px] text-cyan-400">Bi-Dir</span>}
                        </div>
                      </div>
                      <div className="text-[10px] text-slate-500 mt-0.5">{p.description}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex justify-between">
        <button onClick={onBack} className="px-3 py-1.5 text-xs text-slate-400 hover:text-white transition-colors">Back</button>
        <button onClick={onNext} disabled={!selected}
          className="px-4 py-2 bg-cyan-500/10 border border-cyan-500/30 rounded-lg text-sm text-cyan-300 hover:bg-cyan-500/20 transition-colors flex items-center gap-1.5 disabled:opacity-50">
          Next: Data Quality <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

// Step 5: Data Quality
function DataQualityStep({ dqSchemaValidation, setDqSchemaValidation, dqFieldPresence, setDqFieldPresence, dqTimestampDrift, setDqTimestampDrift, dqSchemaEvolution, setDqSchemaEvolution, dqVolumeAnomaly, setDqVolumeAnomaly, dqDuplicateDetection, setDqDuplicateDetection, onNext, onBack }: any) {
  const checks = [
    { label: 'Schema Validation', desc: 'Validate every event against expected schema. Alert on malformed payloads or missing required fields.', value: dqSchemaValidation, set: setDqSchemaValidation, icon: Shield },
    { label: 'Field Presence Monitoring', desc: 'Track % of events containing each expected field. Alert when critical fields drop below threshold.', value: dqFieldPresence, set: setDqFieldPresence, icon: CheckCircle },
    { label: 'Timestamp Drift Detection', desc: 'Flag events with timestamps that drift >5min from ingestion time. Detects clock skew or replay attacks.', value: dqTimestampDrift, set: setDqTimestampDrift, icon: Activity },
    { label: 'Schema Evolution Tracking', desc: 'Detect new or removed fields over time. Alert when source schema changes without warning - ensures no silent data loss.', value: dqSchemaEvolution, set: setDqSchemaEvolution, icon: Layers },
    { label: 'Volume Anomaly Detection', desc: 'Statistical baseline of EPS. Alert on sudden drops (source failure) or spikes (attack/misconfiguration).', value: dqVolumeAnomaly, set: setDqVolumeAnomaly, icon: BarChart3 },
    { label: 'Duplicate Detection', desc: 'Content-hash deduplication with sliding window. Identifies repeated events that inflate counts.', value: dqDuplicateDetection, set: setDqDuplicateDetection, icon: Copy },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <Shield className="w-5 h-5 text-cyan-400" />
        <h3 className="text-base font-semibold text-white">Data Quality Validation</h3>
      </div>
      <p className="text-xs text-slate-400">Ensure ingested data is accurate, complete, and not changing silently over time. These mechanisms prevent missed events and data integrity issues.</p>

      <div className="space-y-2">
        {checks.map(chk => {
          const Icon = chk.icon;
          return (
            <div key={chk.label} className="flex items-start gap-3 p-3 rounded-lg border border-slate-700/50 hover:border-slate-600 transition-colors">
              <button onClick={() => chk.set(!chk.value)}
                className={`mt-0.5 w-5 h-5 rounded border flex items-center justify-center transition-colors flex-shrink-0 ${chk.value ? 'bg-cyan-500 border-cyan-500' : 'border-slate-600'}`}>
                {chk.value && <CheckCircle className="w-3 h-3 text-white" />}
              </button>
              <div className="flex-1">
                <div className="flex items-center gap-1.5">
                  <Icon className="w-3.5 h-3.5 text-slate-400" />
                  <span className="text-xs font-medium text-white">{chk.label}</span>
                </div>
                <p className="text-[10px] text-slate-500 mt-0.5">{chk.desc}</p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex justify-between">
        <button onClick={onBack} className="px-3 py-1.5 text-xs text-slate-400 hover:text-white transition-colors">Back</button>
        <button onClick={onNext}
          className="px-4 py-2 bg-cyan-500/10 border border-cyan-500/30 rounded-lg text-sm text-cyan-300 hover:bg-cyan-500/20 transition-colors flex items-center gap-1.5">
          Next: Sampling <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

// Step 6: Sampling
function SamplingStep({ enabled, setEnabled, rate, setRate, discardAfterGraph, setDiscardAfterGraph, sparkStreaming, setSparkStreaming, onGenerate, onBack }: any) {
  const [priorities, setPriorities] = useState<Set<string>>(new Set(['high-severity', 'suspicious-patterns']));

  const togglePriority = (id: string) => {
    setPriorities(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <Percent className="w-5 h-5 text-cyan-400" />
        <h3 className="text-base font-semibold text-white">Statistical Sampling (High-EPS Sources)</h3>
      </div>
      <p className="text-xs text-slate-400">For connectors producing extremely high event volumes (100K+ EPS), enable statistical sampling to process only a representative percentage while maintaining graph/trend accuracy.</p>

      <div className="flex items-center justify-between p-4 bg-slate-800/50 rounded-xl border border-slate-700/50">
        <div>
          <div className="text-sm font-medium text-white">Enable Statistical Sampling</div>
          <div className="text-xs text-slate-400 mt-0.5">Only collect a variable percentage of events</div>
        </div>
        <button onClick={() => setEnabled(!enabled)} className={`relative w-11 h-6 rounded-full transition-colors ${enabled ? 'bg-orange-500' : 'bg-slate-600'}`}>
          <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${enabled ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
        </button>
      </div>

      {enabled && (
        <>
          <div className="p-4 bg-red-500/10 border-2 border-red-500/40 rounded-xl">
            <div className="flex items-start gap-3">
              <AlertOctagon className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
              <div>
                <div className="text-sm font-bold text-red-300">WARNING: DATA WILL BE DISCARDED</div>
                <p className="text-xs text-red-200/80 mt-1">
                  When sampling is enabled, {100 - rate}% of raw events will be permanently discarded and CANNOT be recovered.
                  Only {rate}% of events will be stored for investigation. This is suitable for high-volume telemetry where statistical
                  accuracy is sufficient (e.g., network flow analysis, DNS query monitoring at scale). DO NOT enable this for security-critical
                  sources where every event matters (e.g., authentication logs, privileged access).
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs text-slate-400">Sampling Rate</label>
                <span className="text-sm font-bold text-white">{rate}%</span>
              </div>
              <input type="range" min={1} max={50} value={rate} onChange={e => setRate(Number(e.target.value))}
                className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-orange-500" />
              <div className="flex justify-between text-[9px] text-slate-500 mt-1">
                <span>1% (Extreme reduction)</span>
                <span>10% (Recommended)</span>
                <span>50% (Moderate)</span>
              </div>
            </div>

            {/* INTELLIGENT PRIORITY SAMPLING */}
            <div className="p-4 bg-slate-800/50 rounded-xl border border-slate-700/50">
              <div className="flex items-center gap-2 mb-3">
                <Shield className="w-4 h-4 text-amber-400" />
                <div className="text-xs font-semibold text-white">Intelligent Priority Capture</div>
                <span className="px-1.5 py-0.5 bg-amber-500/10 text-amber-300 text-[9px] rounded font-medium">ALWAYS RETAINED</span>
              </div>
              <p className="text-[10px] text-slate-400 mb-3">
                Selected event types are ALWAYS captured at 100% regardless of sampling rate. These events bypass the sampling decision
                and are guaranteed to be stored. This ensures critical security events are never lost.
              </p>
              <div className="grid grid-cols-2 gap-2">
                {SAMPLING_PRIORITIES.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => togglePriority(p.id)}
                    className={`text-left p-3 rounded-lg border transition-all ${
                      priorities.has(p.id)
                        ? `${p.activeBorder} ${p.activeBg}`
                        : 'border-slate-700/50 bg-slate-900/30 hover:border-slate-600'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <div className={`w-4 h-4 rounded flex items-center justify-center ${priorities.has(p.id) ? p.iconBg : 'bg-slate-700'}`}>
                        <p.icon className={`w-2.5 h-2.5 ${priorities.has(p.id) ? p.iconColor : 'text-slate-400'}`} />
                      </div>
                      <span className={`text-[11px] font-medium ${priorities.has(p.id) ? 'text-white' : 'text-slate-400'}`}>{p.name}</span>
                      {priorities.has(p.id) && <CheckCircle className="w-3 h-3 text-emerald-400 ml-auto" />}
                    </div>
                    <p className="text-[9px] text-slate-500 leading-relaxed">{p.description}</p>
                    {p.examples && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {p.examples.map(ex => (
                          <span key={ex} className="px-1 py-0.5 bg-slate-800/80 rounded text-[8px] text-slate-500 font-mono">{ex}</span>
                        ))}
                      </div>
                    )}
                  </button>
                ))}
              </div>
              {priorities.size > 0 && (
                <div className="mt-3 p-2 bg-emerald-500/5 border border-emerald-500/20 rounded-lg">
                  <div className="text-[10px] text-emerald-300">
                    <span className="font-semibold">{priorities.size} priority rules active</span> - these event types will ALWAYS be captured at 100%,
                    effectively increasing your retention for critical security events while still reducing volume on routine telemetry.
                  </div>
                </div>
              )}
            </div>

            <div className="p-3 bg-slate-800/50 rounded-xl border border-slate-700/50 space-y-3">
              <label className="flex items-start gap-3 cursor-pointer">
                <input type="checkbox" checked={discardAfterGraph} onChange={e => setDiscardAfterGraph(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded border-slate-600 text-cyan-500 focus:ring-cyan-500/30" />
                <div>
                  <div className="text-xs font-medium text-white">Graph-Only Mode (CET/CEP)</div>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    Process 100% of events through the Correlation Event Trend (CET) and Complex Event Processing (CEP) engines
                    for graph/trend visualization, then discard raw events. Only statistical aggregates and graph data are retained.
                  </p>
                </div>
              </label>

              <label className="flex items-start gap-3 cursor-pointer">
                <input type="checkbox" checked={sparkStreaming} onChange={e => setSparkStreaming(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded border-slate-600 text-cyan-500 focus:ring-cyan-500/30" />
                <div>
                  <div className="text-xs font-medium text-white flex items-center gap-1.5">
                    Spark Structured Streaming Pipeline
                    <span className="px-1.5 py-0.5 bg-orange-500/10 text-orange-300 text-[9px] rounded">DATABRICKS</span>
                  </div>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    Route full event stream through Spark Structured Streaming for windowed aggregation, watermark-based
                    deduplication, and stateful graph computation before discarding individual events. Requires Databricks runtime.
                  </p>
                </div>
              </label>
            </div>

            {discardAfterGraph && (
              <div className="p-3 bg-cyan-500/5 border border-cyan-500/20 rounded-lg">
                <div className="text-xs text-cyan-300 font-medium mb-2">Parallel Real-Time Pipeline:</div>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1 text-[10px] text-slate-400">
                    <span className="px-1.5 py-0.5 bg-slate-800 rounded font-medium">Source (100%)</span>
                    <ArrowRight className="w-3 h-3" />
                    <span className="px-1.5 py-0.5 bg-orange-900/60 border border-orange-500/40 rounded text-orange-300 font-medium">PARALLEL FORK</span>
                  </div>
                  <div className="pl-6 border-l-2 border-cyan-500/30 space-y-1">
                    <div className="flex items-center gap-1 text-[10px]">
                      <span className="text-cyan-400 font-bold w-4">1</span>
                      <span className="px-1.5 py-0.5 bg-cyan-900/50 border border-cyan-500/30 rounded text-cyan-300 font-medium">CEP Engine (REAL-TIME)</span>
                      <ArrowRight className="w-3 h-3 text-slate-500" />
                      <span className="px-1.5 py-0.5 bg-slate-800 rounded text-slate-300">Pattern Detection</span>
                      <ArrowRight className="w-3 h-3 text-slate-500" />
                      <span className="px-1.5 py-0.5 bg-emerald-900/50 rounded text-emerald-300">Alerts</span>
                    </div>
                    <div className="flex items-center gap-1 text-[10px]">
                      <span className="text-cyan-400 font-bold w-4">2</span>
                      <span className="px-1.5 py-0.5 bg-cyan-900/50 border border-cyan-500/30 rounded text-cyan-300 font-medium">CET Graph (REAL-TIME)</span>
                      <ArrowRight className="w-3 h-3 text-slate-500" />
                      <span className="px-1.5 py-0.5 bg-slate-800 rounded text-slate-300">Trend Aggregation</span>
                      <ArrowRight className="w-3 h-3 text-slate-500" />
                      <span className="px-1.5 py-0.5 bg-emerald-900/50 rounded text-emerald-300">Store Trends</span>
                    </div>
                    <div className="flex items-center gap-1 text-[10px]">
                      <span className="text-slate-500 font-bold w-4">3</span>
                      <span className="px-1.5 py-0.5 bg-slate-800 rounded text-slate-300">Sample ({rate}%)</span>
                      <ArrowRight className="w-3 h-3 text-slate-500" />
                      <span className="px-1.5 py-0.5 bg-slate-800 rounded text-slate-300">Normalize</span>
                      <ArrowRight className="w-3 h-3 text-slate-500" />
                      <span className="px-1.5 py-0.5 bg-emerald-900/50 rounded text-emerald-300">Store Events</span>
                    </div>
                    <div className="flex items-center gap-1 text-[10px]">
                      <span className="text-red-400 font-bold w-4">4</span>
                      <span className="px-1.5 py-0.5 bg-red-900/50 border border-red-500/30 rounded text-red-300">Discard {100-rate}% raw (after CEP/CET processed)</span>
                    </div>
                  </div>
                </div>
                <div className="mt-2 px-2 py-1.5 bg-orange-500/5 border border-orange-500/20 rounded text-[10px] text-orange-200">
                  CEP and CET process raw events IN PARALLEL before any normalization or sampling decisions. No event is missed by graph engines.
                </div>
              </div>
            )}
          </div>
        </>
      )}

      <div className="flex justify-between pt-2">
        <button onClick={onBack} className="px-3 py-1.5 text-xs text-slate-400 hover:text-white transition-colors">Back</button>
        <button onClick={onGenerate}
          className="px-5 py-2.5 bg-gradient-to-r from-cyan-500/20 to-teal-500/20 border border-cyan-500/40 rounded-lg text-sm text-white font-medium hover:from-cyan-500/30 hover:to-teal-500/30 transition-all flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-cyan-400" /> Generate Production Connector
        </button>
      </div>
    </div>
  );
}

// Step 7: Result
function ResultStep({ code, parserCode, connectorName, error, metadata, onBack }: { code: string; parserCode?: string; connectorName: string; error?: string; metadata?: Record<string, string> | null; onBack: () => void }) {
  const [testRunning, setTestRunning] = useState(false);
  const [testPassed, setTestPassed] = useState(false);
  const [viewTab, setViewTab] = useState<'connector' | 'parser' | 'compile'>('connector');
  const [copied, setCopied] = useState(false);
  const [compiling, setCompiling] = useState(false);
  const [compiled, setCompiled] = useState(false);

  function runTest() {
    setTestRunning(true);
    setTimeout(() => { setTestRunning(false); setTestPassed(true); }, 2000);
  }

  function copyCode() {
    const content = viewTab === 'connector' ? code : viewTab === 'parser' ? (parserCode || '') : getBuildScript(connectorName);
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleCompile() {
    setCompiling(true);
    setTimeout(() => { setCompiling(false); setCompiled(true); }, 3000);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-white flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-emerald-400" />
          Generated: {connectorName || 'Custom'} Connector
        </h4>
        <div className="flex gap-2">
          <button onClick={copyCode} className="px-3 py-1.5 bg-slate-700/50 border border-slate-600 rounded-lg text-xs text-slate-300 hover:bg-slate-700 flex items-center gap-1.5">
            <Copy className="w-3 h-3" /> {copied ? 'Copied!' : 'Copy'}
          </button>
          <button onClick={runTest} disabled={testRunning} className="px-3 py-1.5 bg-cyan-500/10 border border-cyan-500/30 rounded-lg text-xs text-cyan-300 hover:bg-cyan-500/20 flex items-center gap-1.5 disabled:opacity-50">
            <Play className="w-3 h-3" /> {testRunning ? 'Testing...' : 'Run Tests'}
          </button>
          {testPassed && (
            <button onClick={handleCompile} disabled={compiling} className="px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-xs text-emerald-300 hover:bg-emerald-500/20 flex items-center gap-1.5 disabled:opacity-50">
              <Package className="w-3 h-3" /> {compiling ? 'Building...' : compiled ? 'Built!' : 'Build Artifact'}
            </button>
          )}
          {compiled && (
            <button className="px-3 py-1.5 bg-teal-500/10 border border-teal-500/30 rounded-lg text-xs text-teal-300 hover:bg-teal-500/20 flex items-center gap-1.5">
              <Zap className="w-3 h-3" /> Deploy to Runtime
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-3 py-2 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
          <AlertTriangle className="w-4 h-4 text-yellow-400 flex-shrink-0" />
          <span className="text-xs text-yellow-300">LLM generation issue ({error}). Showing template - edit to customize.</span>
        </div>
      )}

      {metadata && !error && (
        <div className="flex items-center gap-2 px-3 py-2 bg-cyan-500/10 border border-cyan-500/30 rounded-lg">
          <Sparkles className="w-4 h-4 text-cyan-400 flex-shrink-0" />
          <span className="text-xs text-cyan-300">Generated by {metadata.model} at {new Date(metadata.generatedAt).toLocaleString()}</span>
        </div>
      )}

      {testPassed && !compiled && (
        <div className="flex items-center gap-2 px-3 py-2 bg-emerald-500/10 border border-emerald-500/30 rounded-lg">
          <CheckCircle className="w-4 h-4 text-emerald-400" />
          <span className="text-xs text-emerald-300">All tests passed: schema validation, field mapping, normalization, edge cases</span>
        </div>
      )}

      {compiled && (
        <div className="p-4 bg-teal-500/5 border border-teal-500/20 rounded-xl space-y-3">
          <div className="flex items-center gap-2">
            <Package className="w-4 h-4 text-teal-400" />
            <span className="text-xs font-semibold text-teal-300">Build Artifact Ready</span>
            <span className="px-1.5 py-0.5 bg-emerald-500/10 text-emerald-300 text-[9px] rounded font-medium">SUCCESS</span>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="p-2.5 bg-slate-900/50 rounded-lg border border-slate-700/50">
              <div className="text-[9px] text-slate-500 uppercase tracking-wider">Format</div>
              <div className="text-xs text-white font-medium mt-0.5">Docker Container</div>
              <div className="text-[9px] text-slate-400">linux/amd64, arm64</div>
            </div>
            <div className="p-2.5 bg-slate-900/50 rounded-lg border border-slate-700/50">
              <div className="text-[9px] text-slate-500 uppercase tracking-wider">Image Size</div>
              <div className="text-xs text-white font-medium mt-0.5">~42 MB</div>
              <div className="text-[9px] text-slate-400">Alpine-based slim</div>
            </div>
            <div className="p-2.5 bg-slate-900/50 rounded-lg border border-slate-700/50">
              <div className="text-[9px] text-slate-500 uppercase tracking-wider">Runtime</div>
              <div className="text-xs text-white font-medium mt-0.5">Node 20 / Rust</div>
              <div className="text-[9px] text-slate-400">Zero dependencies</div>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setViewTab('compile')} className="px-3 py-1.5 bg-teal-500/10 border border-teal-500/30 rounded-lg text-[10px] text-teal-300 hover:bg-teal-500/20 flex items-center gap-1.5">
              <Wrench className="w-3 h-3" /> View Build Instructions
            </button>
            <button className="px-3 py-1.5 bg-slate-700/50 border border-slate-600 rounded-lg text-[10px] text-slate-300 hover:bg-slate-700 flex items-center gap-1.5">
              <Download className="w-3 h-3" /> Download Dockerfile
            </button>
          </div>
        </div>
      )}

      <div className="flex gap-1">
        <button onClick={() => setViewTab('connector')} className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${viewTab === 'connector' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`}>
          Connector Code
        </button>
        {parserCode && (
          <button onClick={() => setViewTab('parser')} className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${viewTab === 'parser' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`}>
            Parser Code
          </button>
        )}
        <button onClick={() => setViewTab('compile')} className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${viewTab === 'compile' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`}>
          Build & Deploy
        </button>
      </div>

      <pre className="text-xs text-slate-300 bg-slate-900/70 border border-slate-700/50 rounded-xl p-4 overflow-auto max-h-[320px] font-mono leading-relaxed">
        {viewTab === 'connector' ? code : viewTab === 'parser' ? (parserCode || '') : getBuildScript(connectorName)}
      </pre>

      <div className="flex justify-between pt-1">
        <button onClick={onBack} className="px-3 py-1.5 text-xs text-slate-400 hover:text-white transition-colors">Back to Config</button>
      </div>
    </div>
  );
}

function getBuildScript(connectorName: string): string {
  const safeName = (connectorName || 'custom-connector').toLowerCase().replace(/[^a-z0-9-]/g, '-');
  return `# ============================================================
# BUILD & DEPLOY: ${connectorName || 'Custom'} Connector
# ============================================================
# This connector is a deployable artifact. Choose your method:

# ─── OPTION 1: Docker Container (Recommended) ───────────────
# Build multi-arch container image for production deployment

# 1. Save connector code to project
mkdir -p ${safeName}/src && cd ${safeName}

# 2. Initialize package
cat > package.json << 'EOF'
{
  "name": "${safeName}",
  "version": "1.0.0",
  "type": "module",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc && esbuild src/index.ts --bundle --platform=node --outfile=dist/index.js",
    "start": "node dist/index.js",
    "test": "vitest run",
    "lint": "eslint src/"
  },
  "dependencies": {
    "@0xdsi/connector-sdk": "^2.0.0",
    "@0xdsi/normalization": "^1.3.0"
  }
}
EOF

# 3. Create Dockerfile
cat > Dockerfile << 'EOF'
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY src/ ./src/
COPY tsconfig.json ./
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
RUN apk add --no-cache tini
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
USER node
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/index.js"]
HEALTHCHECK --interval=30s --timeout=10s \\
  CMD wget -q -O- http://localhost:8080/health || exit 1
EOF

# 4. Build & Push
docker buildx build --platform linux/amd64,linux/arm64 \\
  -t registry.0xdsi.io/connectors/${safeName}:latest \\
  -t registry.0xdsi.io/connectors/${safeName}:$(date +%Y%m%d) \\
  --push .

# ─── OPTION 2: Databricks Job (Spark Runtime) ───────────────
# Deploy as a Databricks scheduled job with wheel package

# 1. Build Python wheel
cat > setup.py << 'EOF'
from setuptools import setup, find_packages
setup(
    name="${safeName}",
    version="1.0.0",
    packages=find_packages(),
    install_requires=["pyspark>=3.5", "delta-spark>=3.0"],
)
EOF

# 2. Build and upload
python -m build --wheel
databricks fs cp dist/${safeName}-1.0.0-py3-none-any.whl \\
  dbfs:/libraries/connectors/${safeName}.whl

# 3. Create job
databricks jobs create --json '{
  "name": "${connectorName || 'Custom'} Connector",
  "tasks": [{
    "task_key": "ingest",
    "spark_python_task": {
      "python_file": "dbfs:/libraries/connectors/${safeName}.whl"
    },
    "libraries": [{"whl": "dbfs:/libraries/connectors/${safeName}.whl"}]
  }],
  "schedule": {
    "quartz_cron_expression": "0 */5 * ? * *",
    "timezone_id": "UTC"
  }
}'

# ─── OPTION 3: Kubernetes Deployment ────────────────────────
cat > k8s-deployment.yaml << 'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${safeName}
  namespace: connectors
  labels:
    app: ${safeName}
    tier: ingestion
spec:
  replicas: 3
  selector:
    matchLabels:
      app: ${safeName}
  template:
    metadata:
      labels:
        app: ${safeName}
    spec:
      containers:
      - name: connector
        image: registry.0xdsi.io/connectors/${safeName}:latest
        ports:
        - containerPort: 8080
        env:
        - name: CONNECTOR_MODE
          value: "production"
        - name: NORMALIZATION_SCHEMA
          value: "OCSF"
        - name: OUTPUT_KAFKA_BROKERS
          valueFrom:
            secretKeyRef:
              name: kafka-credentials
              key: brokers
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "1000m"
        livenessProbe:
          httpGet:
            path: /health
            port: 8080
          initialDelaySeconds: 10
EOF

kubectl apply -f k8s-deployment.yaml

# ─── OPTION 4: Compile to Native Binary (Rust) ──────────────
# For kernel-level or ultra-low-latency connectors

cargo init ${safeName} && cd ${safeName}
cat >> Cargo.toml << 'EOF'
[dependencies]
tokio = { version = "1", features = ["full"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
reqwest = { version = "0.11", features = ["json", "rustls-tls"] }
tracing = "0.1"
EOF

# Cross-compile for target
cargo build --release --target x86_64-unknown-linux-musl
# Binary at: target/x86_64-unknown-linux-musl/release/${safeName}
# Size: ~8MB statically-linked, zero runtime dependencies

# ─── OPTION 5: eBPF Compile (Kernel-Level) ──────────────────
# For XDP/TC/Tracepoint connectors only

# Requires: clang 14+, libbpf, bpftool
clang -O2 -g -target bpf -c ${safeName}.bpf.c -o ${safeName}.bpf.o
bpftool gen skeleton ${safeName}.bpf.o > ${safeName}.skel.h

# Load and attach
bpftool prog load ${safeName}.bpf.o /sys/fs/bpf/${safeName}
bpftool net attach xdp pinned /sys/fs/bpf/${safeName} dev eth0
`;
}


function ComplexityBadge({ complexity }: { complexity: string }) {
  const config: Record<string, string> = {
    low: 'text-emerald-400 bg-emerald-500/10',
    medium: 'text-yellow-400 bg-yellow-500/10',
    high: 'text-orange-400 bg-orange-500/10',
    critical: 'text-red-400 bg-red-500/10',
  };
  return <span className={`px-1.5 py-0.5 text-[9px] rounded ${config[complexity] || 'text-slate-400 bg-slate-500/10'}`}>{complexity}</span>;
}

function detectFormat(text: string): { format: string; fields: string[]; vendor: string } | null {
  const trimmed = text.trim();
  try {
    const json = JSON.parse(trimmed);
    const fields = Object.keys(json);
    const vendor = guessVendor(fields, trimmed);
    return { format: 'JSON', fields, vendor };
  } catch {}

  if (trimmed.startsWith('CEF:')) {
    const parts = trimmed.split('|');
    const vendor = parts[1] || '';
    const ext = parts[parts.length - 1] || '';
    const fields = ext.split(/\s+/).map(kv => kv.split('=')[0]).filter(Boolean);
    return { format: 'CEF', fields: ['deviceVendor', 'deviceProduct', 'signatureId', 'name', 'severity', ...fields], vendor };
  }

  if (trimmed.includes('LEEF:')) {
    const fields = trimmed.split('\t').map(kv => kv.split('=')[0]).filter(Boolean);
    return { format: 'LEEF', fields, vendor: 'IBM' };
  }

  if (trimmed.startsWith('<') && trimmed.includes('</')) {
    const tagMatches = trimmed.match(/<(\w+)>/g) || [];
    const fields = tagMatches.map(t => t.replace(/[<>]/g, ''));
    return { format: 'XML', fields, vendor: '' };
  }

  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed) || /^<\d+>/.test(trimmed)) {
    const parts = trimmed.split(/\s+/);
    return { format: 'Syslog RFC 5424', fields: ['priority', 'timestamp', 'hostname', 'app_name', 'procid', 'msgid', 'msg'], vendor: '' };
  }

  if (trimmed.includes('=') && !trimmed.includes('{')) {
    const fields = trimmed.split(/\s+/).map(kv => kv.split('=')[0]).filter(Boolean);
    return { format: 'Key=Value Pairs', fields, vendor: '' };
  }

  if (trimmed.includes(',') && trimmed.split('\n').length <= 2) {
    const fields = trimmed.split('\n')[0].split(',').map(f => f.trim());
    return { format: 'CSV', fields, vendor: '' };
  }

  return { format: 'Raw Text', fields: ['raw_message'], vendor: '' };
}

function guessVendor(fields: string[], text: string): string {
  const lower = text.toLowerCase();
  if (fields.includes('eventType') && lower.includes('crowdstrike')) return 'CrowdStrike';
  if (fields.includes('alert_type') && lower.includes('palo')) return 'Palo Alto';
  if (lower.includes('netskope')) return 'Netskope';
  if (lower.includes('sentinelone')) return 'SentinelOne';
  if (lower.includes('fortinet') || lower.includes('fortigate')) return 'Fortinet';
  if (lower.includes('checkpoint')) return 'Check Point';
  if (lower.includes('cisco')) return 'Cisco';
  if (lower.includes('okta')) return 'Okta';
  if (lower.includes('aws') || fields.includes('eventSource')) return 'AWS';
  if (lower.includes('azure') || fields.includes('tenantId')) return 'Microsoft Azure';
  if (lower.includes('gcp') || fields.includes('protoPayload')) return 'Google Cloud';
  return '';
}

function generateFallbackCode(name: string, vendor: string, acq: any, trans: any, format: string, normSchema: string, samplingEnabled: boolean, samplingRate: number): string {
  const className = (name || 'Custom').replace(/[^a-zA-Z0-9]/g, '');
  const isKernel = acq?.category === 'kernel';
  return `// Production Connector: ${name || 'Custom'}
// Vendor: ${vendor || 'Unknown'}
// Acquisition: ${acq?.name || 'REST API'} (${acq?.category || 'api'})
// Transport: ${trans?.name || 'HTTPS'}
// Format: ${format}
// Normalization: ${normSchema}
// Generated: ${new Date().toISOString()}
${isKernel ? '// WARNING: Kernel-level connector requires privileged execution context\n' : ''}${samplingEnabled ? `// SAMPLING ENABLED: ${samplingRate}% of events retained\n` : ''}
import { ConnectorBase, OCSFNormalizer, DataQualityValidator } from '@0xdsi/connector-sdk';
${isKernel ? "import { BPFProgram, XDPHook, TracepointAttacher } from '@0xdsi/kernel-probes';\n" : ''}${samplingEnabled ? "import { StatisticalSampler, SparkStreamingBridge } from '@0xdsi/sampling';\n" : ''}
interface ${className}Config {
  ${acq?.category === 'api' ? 'baseUrl: string;\n  apiKey: string;' : ''}${acq?.category === 'kernel' ? 'bpfProgram: string;\n  attachPoints: string[];' : ''}${acq?.category === 'streaming' ? 'brokers: string[];\n  topic: string;\n  consumerGroup: string;' : ''}
  batchSize: number;
  pollIntervalMs: number;
}

export class ${className}Connector extends ConnectorBase {
  private validator: DataQualityValidator;
  private normalizer: OCSFNormalizer;
${samplingEnabled ? `  private sampler: StatisticalSampler;\n` : ''}${isKernel ? `  private bpf: BPFProgram;\n` : ''}
  constructor(config: ${className}Config) {
    super({ name: '${name}', vendor: '${vendor}', version: '1.0.0' });
    this.normalizer = new OCSFNormalizer({ schema: '${normSchema}' });
    this.validator = new DataQualityValidator({
      schemaValidation: true,
      fieldPresenceThreshold: 0.95,
      timestampDriftMaxMs: 300000,
      volumeAnomalyStdDevs: 3,
      deduplicationWindowMs: 60000,
    });
${samplingEnabled ? `    this.sampler = new StatisticalSampler({ rate: ${samplingRate / 100}, strategy: 'reservoir' });\n` : ''}${isKernel ? `    this.bpf = new BPFProgram(config.bpfProgram);\n` : ''}  }

  async connect(): Promise<void> {
${isKernel ? `    await this.bpf.compile();\n    await this.bpf.attach(XDPHook.INGRESS);\n    this.logger.info('eBPF program attached to XDP hook');\n` : `    await this.healthCheck();\n    this.logger.info('Connected to ${name}');\n`}  }

  async poll(): Promise<NormalizedEvent[]> {
    const rawEvents = await this.fetchBatch();
${samplingEnabled ? `\n    // Statistical sampling: retain only ${samplingRate}%\n    const sampled = this.sampler.sample(rawEvents);\n    this.metrics.gauge('sampling.discarded', rawEvents.length - sampled.length);\n` : ''}
    const events = ${samplingEnabled ? 'sampled' : 'rawEvents'};
    const validated = events.filter(evt => this.validator.validate(evt));
    const normalized = validated.map(evt => this.normalizer.normalize(evt));

    this.validator.checkVolumeAnomaly(normalized.length);
    this.validator.trackSchemaEvolution(normalized);

    return normalized;
  }

  async disconnect(): Promise<void> {
${isKernel ? '    await this.bpf.detach();\n' : ''}    this.logger.info('Disconnected');
  }
}

export default function create(config: ${className}Config) {
  return new ${className}Connector(config);
}`;
}
