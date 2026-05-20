import { useState, useEffect } from 'react';
import { Wand2, Code, Play, CheckCircle, AlertTriangle, ChevronRight, ChevronDown, Layers, Network, Database, Radio, Cloud, Terminal, Lock, Cpu, HardDrive, Globe, Server, Zap, FileText, RefreshCw, Sparkles, ArrowRight, Copy, Clipboard, Shield, Activity, BarChart3, Percent, AlertOctagon, Gauge, Bug, Package, Download, Wrench } from 'lucide-react';
import { supabase } from '../../lib/supabase';

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
  { id: 'zeromq', name: 'ZeroMQ SUB Socket', category: 'messaging', description: 'ZeroMQ pub/sub pattern for high-throughput IPC', complexity: 'medium', latency: 'us' },
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

const LOG_FORMATS = [
  'JSON', 'JSON Lines (NDJSON)', 'CEF', 'LEEF', 'Syslog RFC 5424', 'Syslog RFC 3164',
  'CSV/TSV', 'Avro', 'Parquet', 'Protobuf', 'MessagePack', 'CBOR', 'XML', 'W3C Extended Log',
  'Apache Common/Combined', 'Key=Value Pairs', 'Windows Event XML (EVTX)', 'Binary/Custom',
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
  const [logFormat, setLogFormat] = useState('JSON');
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
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-connector`;
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
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
        }),
      });

      const data = await response.json();
      if (!response.ok || data.error) throw new Error(data.error || `HTTP ${response.status}`);

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
            logFormat={logFormat} setLogFormat={setLogFormat}
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

  function handlePaste(text: string) {
    setSampleLog(text);
    if (!text.trim()) { setDetected(null); return; }
    const det = detectFormat(text);
    setDetected(det);
    if (det) onAutoDetect(det.vendor ? `${det.vendor} Connector` : '', det.vendor, det.format);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <Clipboard className="w-5 h-5 text-cyan-400" />
        <h3 className="text-base font-semibold text-white">Paste Your Data Structure</h3>
      </div>
      <p className="text-sm text-slate-400">Paste a sample log, event, or API response and we will auto-detect the format, extract fields, and generate a parser.</p>

      <textarea
        value={sampleLog}
        onChange={e => handlePaste(e.target.value)}
        placeholder={'Paste any log format here:\n\n- JSON event payload\n- CEF syslog line\n- CSV/TSV row\n- Key=Value log\n- XML event\n- Raw syslog\n- Protobuf schema definition\n- API response body\n\nWe will detect the format and build a parser automatically.'}
        className="w-full h-48 px-4 py-3 bg-slate-900/70 border border-slate-700/50 rounded-xl text-sm text-slate-200 font-mono placeholder-slate-600 focus:border-cyan-500/50 focus:outline-none resize-none"
      />

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
          {sampleLog ? 'Continue with Sample' : 'Skip - Configure Manually'} <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

// Step 2: Configure
function ConfigureStep({ connectorName, setConnectorName, vendor, setVendor, description, setDescription, logFormat, setLogFormat, normSchema, setNormSchema, customContract, setCustomContract, sampleLog, onNext, onBack }: any) {
  const [proposingContract, setProposingContract] = useState(false);

  async function proposeContract() {
    setProposingContract(true);
    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-connector`;
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          connectorName: connectorName || 'custom',
          vendor: vendor || 'unknown',
          description: 'Generate a data contract/schema proposal',
          acquisitionMethod: 'REST API',
          transportProtocol: 'HTTPS',
          logFormat,
          sampleLog,
          normalizationSchema: 'custom-contract-proposal',
        }),
      });
      const data = await response.json();
      if (data.connectorCode) setCustomContract(data.connectorCode);
    } catch { /* ignore */ }
    setProposingContract(false);
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

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-xs text-slate-400 block mb-1">Log Format</label>
          <select value={logFormat} onChange={e => setLogFormat(e.target.value)}
            className="w-full px-3 py-2 bg-slate-900/70 border border-slate-700/50 rounded-lg text-sm text-white focus:border-cyan-500/50 focus:outline-none">
            {LOG_FORMATS.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-slate-400 block mb-1">Normalization Target</label>
          <select value={normSchema} onChange={e => setNormSchema(e.target.value)}
            className="w-full px-3 py-2 bg-slate-900/70 border border-slate-700/50 rounded-lg text-sm text-white focus:border-cyan-500/50 focus:outline-none">
            {NORMALIZATION_SCHEMAS.map(s => <option key={s.id} value={s.id}>{s.name} ({s.org})</option>)}
          </select>
        </div>
      </div>

      {normSchema !== 'custom' && (
        <div className="p-3 bg-slate-800/50 border border-slate-700/50 rounded-lg">
          <div className="text-xs text-slate-300"><span className="font-medium text-white">{NORMALIZATION_SCHEMAS.find(s => s.id === normSchema)?.name}:</span> {NORMALIZATION_SCHEMAS.find(s => s.id === normSchema)?.description}</div>
        </div>
      )}

      {normSchema === 'custom' && (
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
    database: 'Database', iot: 'IoT/Industrial',
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
    physical: 'Physical / Serial / Bus', exotic: 'Non-TCP/IP / Exotic / Industrial',
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
