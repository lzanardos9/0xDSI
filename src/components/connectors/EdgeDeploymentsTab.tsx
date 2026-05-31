import { useState, useEffect, useCallback } from 'react';
import { Radio, Server, RefreshCw, Plus, Terminal, Copy, CheckCircle2, AlertTriangle, XCircle, Cpu, Activity, HardDrive, Clock, Zap, Shield, Download, Trash2 } from 'lucide-react';

interface Deployment {
  deployment_id: string;
  collector_id: string;
  dna_name: string;
  dna_version: string;
  hostname: string;
  ip_address: string;
  os_type: string;
  actual_state: string;
  desired_state: string;
  binary_version: string;
  site_name: string;
  registered_at: string;
  events_per_second: number | null;
  bytes_per_second: number | null;
  error_count: number | null;
  buffer_usage_pct: number | null;
  uptime_seconds: number | null;
  cpu_percent: number | null;
  memory_mb: number | null;
  latency_ms: number | null;
  connection_status: string | null;
  last_heartbeat: string | null;
}

interface DNASpec {
  dna_id: string;
  name: string;
  version: string;
  vendor: string;
  category: string;
  description: string;
  input_type: string;
  input_protocol: string;
  input_port: number;
  input_format: string;
  auth_type: string;
  parser_engine: string;
}

interface FleetStats {
  total: number;
  running: number;
  degraded: number;
  dead: number;
  stopped: number;
}

interface InstallCommands {
  linux: string;
  docker: string;
  kubernetes: string;
  windows: string;
}

const BACKEND_URL = (window as any).__DATABRICKS_BACKEND_URL || '/api';

const MOCK_DNA_CATALOG: DNASpec[] = [
  { dna_id: '1', name: 'palo_alto_firewall', version: '2.1.0', vendor: 'Palo Alto Networks', category: 'network_security', description: 'Palo Alto NGFW via syslog (CEF)', input_type: 'syslog', input_protocol: 'udp', input_port: 514, input_format: 'cef', auth_type: 'none', parser_engine: 'cef' },
  { dna_id: '2', name: 'fortinet_fortigate', version: '1.3.0', vendor: 'Fortinet', category: 'network_security', description: 'FortiGate firewall via syslog', input_type: 'syslog', input_protocol: 'tcp', input_port: 514, input_format: 'kv', auth_type: 'none', parser_engine: 'kv_pairs' },
  { dna_id: '3', name: 'crowdstrike_falcon', version: '3.0.0', vendor: 'CrowdStrike', category: 'endpoint_security', description: 'Falcon Streaming API', input_type: 'api_stream', input_protocol: 'https', input_port: 443, input_format: 'ndjson', auth_type: 'oauth2', parser_engine: 'json_path' },
  { dna_id: '4', name: 'cisco_asa', version: '1.5.0', vendor: 'Cisco', category: 'network_security', description: 'Cisco ASA/Firepower via syslog', input_type: 'syslog', input_protocol: 'udp', input_port: 1514, input_format: 'cisco_syslog', auth_type: 'none', parser_engine: 'regex' },
  { dna_id: '5', name: 'windows_event_log', version: '2.0.0', vendor: 'Microsoft', category: 'endpoint_security', description: 'Windows Event Logs via WEF/WMI', input_type: 'wmi', input_protocol: 'tcp', input_port: 5985, input_format: 'evtx', auth_type: 'kerberos', parser_engine: 'evtx' },
  { dna_id: '6', name: 'generic_syslog', version: '1.0.0', vendor: 'Generic', category: 'infrastructure', description: 'Universal syslog receiver', input_type: 'syslog', input_protocol: 'udp', input_port: 514, input_format: 'rfc5424', auth_type: 'none', parser_engine: 'syslog' },
  { dna_id: '7', name: 'aws_cloudtrail', version: '2.2.0', vendor: 'Amazon Web Services', category: 'cloud', description: 'CloudTrail via S3 + SQS', input_type: 's3_poll', input_protocol: 'https', input_port: 443, input_format: 'json', auth_type: 'aws_iam', parser_engine: 'json_path' },
  { dna_id: '8', name: 'azure_activity_log', version: '1.8.0', vendor: 'Microsoft Azure', category: 'cloud', description: 'Azure Activity logs via Event Hub', input_type: 'eventhub', input_protocol: 'amqp', input_port: 5671, input_format: 'json', auth_type: 'sas_token', parser_engine: 'json_path' },
  { dna_id: '9', name: 'splunk_hec_receiver', version: '1.2.0', vendor: 'Splunk', category: 'siem_integration', description: 'Splunk HEC forwarder receiver', input_type: 'http_listener', input_protocol: 'https', input_port: 8088, input_format: 'splunk_hec', auth_type: 'api_key', parser_engine: 'splunk_hec' },
  { dna_id: '10', name: 'modbus_scada', version: '1.0.0', vendor: 'Generic OT', category: 'ot_ics', description: 'Modbus TCP/RTU SCADA monitor', input_type: 'pcap', input_protocol: 'tcp', input_port: 502, input_format: 'modbus', auth_type: 'none', parser_engine: 'protocol_decode' },
  { dna_id: '11', name: 'juniper_srx', version: '1.5.0', vendor: 'Juniper Networks', category: 'network_firewall', description: 'SRX series structured syslog', input_type: 'syslog', input_protocol: 'udp', input_port: 514, input_format: 'structured_syslog', auth_type: 'none', parser_engine: 'kv_pairs' },
  { dna_id: '12', name: 'check_point_firewall', version: '1.3.0', vendor: 'Check Point', category: 'network_firewall', description: 'Check Point NGFW via LEA', input_type: 'syslog', input_protocol: 'tcp', input_port: 514, input_format: 'cef', auth_type: 'certificate', parser_engine: 'cef' },
  { dna_id: '13', name: 'zscaler_zia', version: '2.0.0', vendor: 'Zscaler', category: 'cloud_security', description: 'ZIA via NSS streaming', input_type: 'api_stream', input_protocol: 'https', input_port: 443, input_format: 'nss_json', auth_type: 'api_key', parser_engine: 'json_path' },
  { dna_id: '14', name: 'sentinelone_edr', version: '1.4.0', vendor: 'SentinelOne', category: 'endpoint_security', description: 'Deep Visibility API streaming', input_type: 'api_stream', input_protocol: 'https', input_port: 443, input_format: 'json', auth_type: 'api_key', parser_engine: 'json_path' },
  { dna_id: '15', name: 'carbon_black_edr', version: '1.6.0', vendor: 'VMware Carbon Black', category: 'endpoint_security', description: 'CB Cloud Event Forwarder', input_type: 'kafka', input_protocol: 'tcp', input_port: 9092, input_format: 'json', auth_type: 'api_key', parser_engine: 'json_path' },
  { dna_id: '16', name: 'suricata_ids', version: '1.2.0', vendor: 'Open Source (OISF)', category: 'ids_ips', description: 'Suricata EVE JSON file tail', input_type: 'file_tail', input_protocol: 'file', input_port: 0, input_format: 'eve_json', auth_type: 'none', parser_engine: 'json_path' },
  { dna_id: '17', name: 'zeek_network', version: '1.3.0', vendor: 'Open Source (Zeek)', category: 'network_monitoring', description: 'Zeek JSON conn/dns/http logs', input_type: 'file_tail', input_protocol: 'file', input_port: 0, input_format: 'zeek_json', auth_type: 'none', parser_engine: 'json_path' },
  { dna_id: '18', name: 'f5_bigip_waf', version: '1.1.0', vendor: 'F5 Networks', category: 'waf', description: 'BIG-IP ASM WAF via syslog', input_type: 'syslog', input_protocol: 'tcp', input_port: 1514, input_format: 'cef', auth_type: 'none', parser_engine: 'cef' },
  { dna_id: '19', name: 'okta_system_log', version: '2.1.0', vendor: 'Okta', category: 'identity', description: 'Okta System Log API', input_type: 'api_poll', input_protocol: 'https', input_port: 443, input_format: 'json', auth_type: 'api_key', parser_engine: 'json_path' },
  { dna_id: '20', name: 'google_workspace', version: '1.5.0', vendor: 'Google', category: 'identity', description: 'Admin SDK activity reports', input_type: 'api_poll', input_protocol: 'https', input_port: 443, input_format: 'json', auth_type: 'oauth2', parser_engine: 'json_path' },
  { dna_id: '21', name: 'office365_management', version: '2.0.0', vendor: 'Microsoft', category: 'cloud', description: 'O365 Management Activity API', input_type: 'api_poll', input_protocol: 'https', input_port: 443, input_format: 'json', auth_type: 'oauth2', parser_engine: 'json_path' },
  { dna_id: '22', name: 'linux_auditd', version: '1.8.0', vendor: 'Linux', category: 'endpoint_security', description: 'Linux audit daemon logs', input_type: 'file_tail', input_protocol: 'file', input_port: 0, input_format: 'audit_log', auth_type: 'none', parser_engine: 'kv_pairs' },
  { dna_id: '23', name: 'darktrace_detect', version: '1.1.0', vendor: 'Darktrace', category: 'ndr', description: 'AI model breach alerts', input_type: 'api_poll', input_protocol: 'https', input_port: 443, input_format: 'json', auth_type: 'api_key', parser_engine: 'json_path' },
  { dna_id: '24', name: 'vectra_ai', version: '1.2.0', vendor: 'Vectra AI', category: 'ndr', description: 'Cognito Detect AI detections', input_type: 'api_poll', input_protocol: 'https', input_port: 443, input_format: 'json', auth_type: 'api_key', parser_engine: 'json_path' },
  { dna_id: '25', name: 'proofpoint_tap', version: '1.3.0', vendor: 'Proofpoint', category: 'email_security', description: 'TAP click and message events', input_type: 'api_poll', input_protocol: 'https', input_port: 443, input_format: 'json', auth_type: 'basic', parser_engine: 'json_path' },
  { dna_id: '26', name: 'cisco_meraki', version: '1.5.0', vendor: 'Cisco Meraki', category: 'network_firewall', description: 'Meraki MX/MR syslog', input_type: 'syslog', input_protocol: 'udp', input_port: 514, input_format: 'meraki_syslog', auth_type: 'none', parser_engine: 'regex' },
  { dna_id: '27', name: 'kafka_consumer', version: '1.0.0', vendor: 'Apache', category: 'message_bus', description: 'Generic Kafka topic consumer', input_type: 'kafka', input_protocol: 'tcp', input_port: 9092, input_format: 'json', auth_type: 'sasl', parser_engine: 'json_path' },
  { dna_id: '28', name: 'gcp_audit_log', version: '1.6.0', vendor: 'Google Cloud', category: 'cloud', description: 'GCP audit logs via Pub/Sub', input_type: 'api_stream', input_protocol: 'https', input_port: 443, input_format: 'json', auth_type: 'oauth2', parser_engine: 'json_path' },
  { dna_id: '29', name: 'elastic_beats_receiver', version: '1.0.0', vendor: 'Elastic', category: 'siem_integration', description: 'Receive Elastic Beats agents', input_type: 'http_listener', input_protocol: 'https', input_port: 5044, input_format: 'elastic_bulk', auth_type: 'api_key', parser_engine: 'json_path' },
  { dna_id: '30', name: 'sophos_xg', version: '1.2.0', vendor: 'Sophos', category: 'network_firewall', description: 'Sophos XG/XGS syslog KV', input_type: 'syslog', input_protocol: 'udp', input_port: 514, input_format: 'kv_pairs', auth_type: 'none', parser_engine: 'kv_pairs' },
  { dna_id: '31', name: 'trend_micro_apex', version: '1.4.0', vendor: 'Trend Micro', category: 'endpoint_security', description: 'Apex One / Vision One API', input_type: 'api_poll', input_protocol: 'https', input_port: 443, input_format: 'json', auth_type: 'api_key', parser_engine: 'json_path' },
  { dna_id: '32', name: 'macos_unified_log', version: '1.0.0', vendor: 'Apple', category: 'endpoint_security', description: 'macOS Unified Logging System', input_type: 'file_tail', input_protocol: 'file', input_port: 0, input_format: 'ndjson', auth_type: 'none', parser_engine: 'json_path' },
];

const MOCK_FLEET: Deployment[] = [
  { deployment_id: 'd1', collector_id: 'c1', dna_name: 'palo_alto_firewall', dna_version: '2.1.0', hostname: 'fw-edge-nyc-01', ip_address: '10.1.1.10', os_type: 'PAN-OS', actual_state: 'running', desired_state: 'running', binary_version: '0.9.1', site_name: 'NYC-DC1', registered_at: '2026-03-15T10:00:00Z', events_per_second: 12450, bytes_per_second: 5602500, error_count: 0, buffer_usage_pct: 12, uptime_seconds: 6048000, cpu_percent: 18, memory_mb: 145, latency_ms: 2.1, connection_status: 'connected', last_heartbeat: '2026-05-31T14:58:30Z' },
  { deployment_id: 'd2', collector_id: 'c2', dna_name: 'crowdstrike_falcon', dna_version: '3.0.0', hostname: 'cs-sensor-gw-01', ip_address: '172.31.5.100', os_type: 'linux', actual_state: 'running', desired_state: 'running', binary_version: '0.9.1', site_name: 'AWS-US-EAST', registered_at: '2026-02-20T08:00:00Z', events_per_second: 45000, bytes_per_second: 20250000, error_count: 2, buffer_usage_pct: 5, uptime_seconds: 7776000, cpu_percent: 28, memory_mb: 210, latency_ms: 1.2, connection_status: 'connected', last_heartbeat: '2026-05-31T14:59:00Z' },
  { deployment_id: 'd3', collector_id: 'c3', dna_name: 'splunk_hec_receiver', dna_version: '1.2.0', hostname: 'splunk-bridge-01', ip_address: '10.1.30.200', os_type: 'linux', actual_state: 'running', desired_state: 'running', binary_version: '0.9.1', site_name: 'NYC-DC1', registered_at: '2026-04-01T12:00:00Z', events_per_second: 55000, bytes_per_second: 24750000, error_count: 0, buffer_usage_pct: 8, uptime_seconds: 5184000, cpu_percent: 32, memory_mb: 230, latency_ms: 1.1, connection_status: 'connected', last_heartbeat: '2026-05-31T14:58:45Z' },
  { deployment_id: 'd4', collector_id: 'c4', dna_name: 'zeek_network', dna_version: '1.3.0', hostname: 'zeek-sensor-01', ip_address: '10.3.50.5', os_type: 'linux', actual_state: 'running', desired_state: 'running', binary_version: '0.9.1', site_name: 'SFO-DC3', registered_at: '2026-03-28T09:00:00Z', events_per_second: 120000, bytes_per_second: 54000000, error_count: 1, buffer_usage_pct: 15, uptime_seconds: 5616000, cpu_percent: 22, memory_mb: 180, latency_ms: 0.4, connection_status: 'connected', last_heartbeat: '2026-05-31T14:59:10Z' },
  { deployment_id: 'd5', collector_id: 'c5', dna_name: 'kafka_consumer', dna_version: '1.0.0', hostname: 'kafka-bridge-01', ip_address: '10.1.90.5', os_type: 'linux', actual_state: 'running', desired_state: 'running', binary_version: '0.9.1', site_name: 'NYC-DC1', registered_at: '2026-05-01T10:00:00Z', events_per_second: 150000, bytes_per_second: 67500000, error_count: 0, buffer_usage_pct: 3, uptime_seconds: 2592000, cpu_percent: 15, memory_mb: 160, latency_ms: 0.3, connection_status: 'connected', last_heartbeat: '2026-05-31T14:59:05Z' },
  { deployment_id: 'd6', collector_id: 'c6', dna_name: 'suricata_ids', dna_version: '1.2.0', hostname: 'suricata-tap-01', ip_address: '10.1.50.5', os_type: 'linux', actual_state: 'running', desired_state: 'running', binary_version: '0.9.1', site_name: 'NYC-DC1', registered_at: '2026-04-15T14:00:00Z', events_per_second: 85000, bytes_per_second: 38250000, error_count: 0, buffer_usage_pct: 10, uptime_seconds: 3974400, cpu_percent: 25, memory_mb: 195, latency_ms: 0.6, connection_status: 'connected', last_heartbeat: '2026-05-31T14:58:55Z' },
  { deployment_id: 'd7', collector_id: 'c7', dna_name: 'elastic_beats_receiver', dna_version: '1.0.0', hostname: 'elastic-bridge-01', ip_address: '10.2.90.5', os_type: 'linux', actual_state: 'running', desired_state: 'running', binary_version: '0.9.1', site_name: 'LON-DC2', registered_at: '2026-03-10T11:00:00Z', events_per_second: 68000, bytes_per_second: 30600000, error_count: 1, buffer_usage_pct: 7, uptime_seconds: 7084800, cpu_percent: 20, memory_mb: 175, latency_ms: 1.0, connection_status: 'connected', last_heartbeat: '2026-05-31T14:59:00Z' },
  { deployment_id: 'd8', collector_id: 'c8', dna_name: 'windows_event_log', dna_version: '2.0.0', hostname: 'wef-dc-corp-01', ip_address: '10.1.10.50', os_type: 'windows', actual_state: 'running', desired_state: 'running', binary_version: '0.9.1', site_name: 'NYC-DC1', registered_at: '2026-02-01T09:00:00Z', events_per_second: 18000, bytes_per_second: 8100000, error_count: 0, buffer_usage_pct: 6, uptime_seconds: 10368000, cpu_percent: 12, memory_mb: 120, latency_ms: 4.2, connection_status: 'connected', last_heartbeat: '2026-05-31T14:58:40Z' },
  { deployment_id: 'd9', collector_id: 'c9', dna_name: 'zscaler_zia', dna_version: '2.0.0', hostname: 'zscaler-nss-01', ip_address: '172.20.1.5', os_type: 'linux', actual_state: 'running', desired_state: 'running', binary_version: '0.9.1', site_name: 'CLOUD-ZIA', registered_at: '2026-04-20T08:00:00Z', events_per_second: 32000, bytes_per_second: 14400000, error_count: 0, buffer_usage_pct: 9, uptime_seconds: 3542400, cpu_percent: 14, memory_mb: 130, latency_ms: 3.8, connection_status: 'connected', last_heartbeat: '2026-05-31T14:58:50Z' },
  { deployment_id: 'd10', collector_id: 'c10', dna_name: 'modbus_scada', dna_version: '1.0.0', hostname: 'scada-modbus-plant-01', ip_address: '192.168.100.10', os_type: 'linux', actual_state: 'degraded', desired_state: 'running', binary_version: '0.9.0', site_name: 'PLANT-SP', registered_at: '2026-01-15T10:00:00Z', events_per_second: 800, bytes_per_second: 360000, error_count: 15, buffer_usage_pct: 45, uptime_seconds: 11750400, cpu_percent: 8, memory_mb: 65, latency_ms: 0.5, connection_status: 'degraded', last_heartbeat: '2026-05-31T14:52:00Z' },
  { deployment_id: 'd11', collector_id: 'c11', dna_name: 'fortinet_fortigate', dna_version: '1.3.0', hostname: 'forti-dmz-lon-01', ip_address: '10.2.1.20', os_type: 'linux', actual_state: 'running', desired_state: 'running', binary_version: '0.9.1', site_name: 'LON-DC2', registered_at: '2026-03-05T15:00:00Z', events_per_second: 8900, bytes_per_second: 4005000, error_count: 0, buffer_usage_pct: 4, uptime_seconds: 7603200, cpu_percent: 11, memory_mb: 98, latency_ms: 3.4, connection_status: 'connected', last_heartbeat: '2026-05-31T14:58:55Z' },
  { deployment_id: 'd12', collector_id: 'c12', dna_name: 'carbon_black_edr', dna_version: '1.6.0', hostname: 'cb-forwarder-01', ip_address: '10.1.40.15', os_type: 'linux', actual_state: 'running', desired_state: 'running', binary_version: '0.9.1', site_name: 'NYC-DC1', registered_at: '2026-04-08T11:00:00Z', events_per_second: 18500, bytes_per_second: 8325000, error_count: 0, buffer_usage_pct: 6, uptime_seconds: 4579200, cpu_percent: 19, memory_mb: 155, latency_ms: 1.9, connection_status: 'connected', last_heartbeat: '2026-05-31T14:59:00Z' },
  { deployment_id: 'd13', collector_id: 'c13', dna_name: 'check_point_firewall', dna_version: '1.3.0', hostname: 'checkpoint-gw-fra-01', ip_address: '10.4.1.1', os_type: 'linux', actual_state: 'running', desired_state: 'running', binary_version: '0.9.1', site_name: 'FRA-DC4', registered_at: '2026-03-22T13:00:00Z', events_per_second: 9800, bytes_per_second: 4410000, error_count: 0, buffer_usage_pct: 5, uptime_seconds: 6048000, cpu_percent: 13, memory_mb: 105, latency_ms: 2.0, connection_status: 'connected', last_heartbeat: '2026-05-31T14:58:48Z' },
  { deployment_id: 'd14', collector_id: 'c14', dna_name: 'aws_cloudtrail', dna_version: '2.2.0', hostname: 'cloudtrail-ingest-01', ip_address: '172.31.8.10', os_type: 'linux', actual_state: 'running', desired_state: 'running', binary_version: '0.9.1', site_name: 'AWS-US-EAST', registered_at: '2026-02-28T09:00:00Z', events_per_second: 3200, bytes_per_second: 1440000, error_count: 0, buffer_usage_pct: 2, uptime_seconds: 7948800, cpu_percent: 6, memory_mb: 72, latency_ms: 8.5, connection_status: 'connected', last_heartbeat: '2026-05-31T14:58:35Z' },
  { deployment_id: 'd15', collector_id: 'c15', dna_name: 'okta_system_log', dna_version: '2.1.0', hostname: 'okta-poller-01', ip_address: '172.31.10.5', os_type: 'linux', actual_state: 'running', desired_state: 'running', binary_version: '0.9.1', site_name: 'AWS-US-EAST', registered_at: '2026-05-10T10:00:00Z', events_per_second: 1800, bytes_per_second: 810000, error_count: 0, buffer_usage_pct: 1, uptime_seconds: 1814400, cpu_percent: 4, memory_mb: 55, latency_ms: 12.0, connection_status: 'connected', last_heartbeat: '2026-05-31T14:58:20Z' },
  { deployment_id: 'd16', collector_id: 'c16', dna_name: 'darktrace_detect', dna_version: '1.1.0', hostname: 'darktrace-bridge-01', ip_address: '10.2.80.5', os_type: 'linux', actual_state: 'running', desired_state: 'running', binary_version: '0.9.1', site_name: 'LON-DC2', registered_at: '2026-04-12T16:00:00Z', events_per_second: 2200, bytes_per_second: 990000, error_count: 0, buffer_usage_pct: 2, uptime_seconds: 4233600, cpu_percent: 7, memory_mb: 68, latency_ms: 8.0, connection_status: 'connected', last_heartbeat: '2026-05-31T14:58:30Z' },
];

const MOCK_STATS: FleetStats = { total: 36, running: 34, degraded: 1, dead: 0, stopped: 1 };
const MOCK_TOTAL_EPS = 712850;

const STATE_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  running: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', dot: 'bg-emerald-400' },
  degraded: { bg: 'bg-amber-500/10', text: 'text-amber-400', dot: 'bg-amber-400' },
  dead: { bg: 'bg-red-500/10', text: 'text-red-400', dot: 'bg-red-400' },
  stopped: { bg: 'bg-slate-600/20', text: 'text-slate-400', dot: 'bg-slate-500' },
  pending: { bg: 'bg-blue-500/10', text: 'text-blue-400', dot: 'bg-blue-400' },
  decommissioned: { bg: 'bg-slate-800/50', text: 'text-slate-600', dot: 'bg-slate-700' },
};

const CATEGORY_COLORS: Record<string, string> = {
  network_security: 'text-cyan-400',
  network_firewall: 'text-cyan-400',
  endpoint_security: 'text-blue-400',
  cloud: 'text-sky-400',
  cloud_security: 'text-sky-300',
  infrastructure: 'text-slate-400',
  siem_integration: 'text-amber-400',
  ot_ics: 'text-orange-400',
  identity: 'text-teal-400',
  ids_ips: 'text-red-400',
  network_monitoring: 'text-emerald-400',
  waf: 'text-rose-400',
  ndr: 'text-fuchsia-400',
  email_security: 'text-yellow-400',
  message_bus: 'text-green-400',
};

function formatUptime(seconds: number | null): string {
  if (!seconds) return '-';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  if (d > 0) return `${d}d ${h}h`;
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

export default function EdgeDeploymentsTab() {
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [stats, setStats] = useState<FleetStats>({ total: 0, running: 0, degraded: 0, dead: 0, stopped: 0 });
  const [totalEps, setTotalEps] = useState(0);
  const [dnaCatalog, setDnaCatalog] = useState<DNASpec[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInstall, setShowInstall] = useState(false);
  const [selectedDna, setSelectedDna] = useState('');
  const [siteName, setSiteName] = useState('');
  const [installCommands, setInstallCommands] = useState<InstallCommands | null>(null);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState('');

  const fetchFleet = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await fetch(`${BACKEND_URL}/edge-connectors/fleet`);
      if (resp.ok) {
        const data = await resp.json();
        setDeployments(data.deployments || []);
        setStats(data.stats || MOCK_STATS);
        setTotalEps(data.total_eps || 0);
        setLoading(false);
        return;
      }
    } catch {}
    setDeployments(MOCK_FLEET);
    setStats(MOCK_STATS);
    setTotalEps(MOCK_TOTAL_EPS);
    setLoading(false);
  }, []);

  const fetchDNA = useCallback(async () => {
    try {
      const resp = await fetch(`${BACKEND_URL}/edge-connectors/dna-catalog`);
      if (resp.ok) {
        const data = await resp.json();
        setDnaCatalog(data.dna_catalog || []);
        return;
      }
    } catch {}
    setDnaCatalog(MOCK_DNA_CATALOG);
  }, []);

  useEffect(() => {
    fetchFleet();
    fetchDNA();
  }, [fetchFleet, fetchDNA]);

  const generateToken = async () => {
    if (!selectedDna) return;
    setGenerating(true);
    try {
      const resp = await fetch(`${BACKEND_URL}/edge-connectors/generate-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dna_name: selectedDna, site_name: siteName || 'default' }),
      });
      if (resp.ok) {
        const data = await resp.json();
        setInstallCommands(data.install_commands);
      }
    } catch {}
    setGenerating(false);
  };

  const performAction = async (collectorId: string, action: string) => {
    try {
      await fetch(`${BACKEND_URL}/edge-connectors/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ collector_id: collectorId, action }),
      });
      fetchFleet();
    } catch {}
  };

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(''), 2000);
  };

  return (
    <div className="space-y-4">
      {/* Fleet Stats */}
      <div className="grid grid-cols-6 gap-3">
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-3">
          <div className="text-slate-500 text-[10px] font-mono mb-1">TOTAL FLEET</div>
          <div className="text-2xl font-bold text-white">{stats.total}</div>
        </div>
        <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-3">
          <div className="text-emerald-500 text-[10px] font-mono mb-1">RUNNING</div>
          <div className="text-2xl font-bold text-emerald-400">{stats.running}</div>
        </div>
        <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-3">
          <div className="text-amber-500 text-[10px] font-mono mb-1">DEGRADED</div>
          <div className="text-2xl font-bold text-amber-400">{stats.degraded}</div>
        </div>
        <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-3">
          <div className="text-red-500 text-[10px] font-mono mb-1">DEAD</div>
          <div className="text-2xl font-bold text-red-400">{stats.dead}</div>
        </div>
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-3">
          <div className="text-slate-500 text-[10px] font-mono mb-1">STOPPED</div>
          <div className="text-2xl font-bold text-slate-400">{stats.stopped}</div>
        </div>
        <div className="bg-cyan-500/5 border border-cyan-500/20 rounded-lg p-3">
          <div className="text-cyan-500 text-[10px] font-mono mb-1">FLEET EPS</div>
          <div className="text-2xl font-bold text-cyan-400">{totalEps.toLocaleString()}</div>
        </div>
      </div>

      {/* Actions Bar */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => setShowInstall(!showInstall)}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${showInstall ? 'bg-cyan-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700'}`}
        >
          <Plus className="w-4 h-4" /> Deploy Collector
        </button>
        <button onClick={fetchFleet} className="flex items-center gap-2 px-3 py-2 bg-slate-800 border border-slate-700 text-slate-300 rounded-lg text-sm hover:bg-slate-700">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
        <div className="ml-auto text-xs text-slate-500 font-mono">
          {dnaCatalog.length} DNA specs available
        </div>
      </div>

      {/* Install Panel */}
      {showInstall && (
        <div className="bg-slate-800/70 border border-cyan-500/20 rounded-lg p-4 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <Download className="w-4 h-4 text-cyan-400" />
            <span className="text-sm font-semibold text-white">Deploy New Edge Collector</span>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Connector DNA</label>
              <select
                value={selectedDna}
                onChange={(e) => { setSelectedDna(e.target.value); setInstallCommands(null); }}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
              >
                <option value="">Select connector type...</option>
                {dnaCatalog.map(dna => (
                  <option key={dna.dna_id} value={dna.name}>
                    {dna.vendor} - {dna.name.replace(/_/g, ' ')} ({dna.input_type})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Site / Location</label>
              <input
                value={siteName}
                onChange={(e) => setSiteName(e.target.value)}
                placeholder="e.g., datacenter-east, branch-sp"
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-cyan-500"
              />
            </div>
            <div className="flex items-end">
              <button
                onClick={generateToken}
                disabled={!selectedDna || generating}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium"
              >
                {generating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Terminal className="w-4 h-4" />}
                Generate Install Token
              </button>
            </div>
          </div>

          {installCommands && (
            <div className="space-y-2 mt-3">
              <div className="text-xs text-slate-400 font-semibold mb-2">Install Commands (choose one):</div>
              {Object.entries(installCommands).map(([method, cmd]) => (
                <div key={method} className="flex items-center gap-2 bg-slate-900 rounded-lg p-2 border border-slate-700/50">
                  <span className="text-[10px] text-slate-500 font-mono uppercase w-20 flex-shrink-0">{method}</span>
                  <code className="flex-1 text-xs text-cyan-300 font-mono overflow-x-auto whitespace-nowrap">{cmd}</code>
                  <button
                    onClick={() => copyToClipboard(cmd, method)}
                    className="flex-shrink-0 p-1.5 rounded hover:bg-slate-700"
                  >
                    {copied === method ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-slate-500" />}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* DNA Catalog */}
      <div className="bg-slate-800/40 border border-slate-700/50 rounded-lg">
        <div className="px-4 py-2.5 border-b border-slate-700/40 flex items-center gap-2">
          <Shield className="w-4 h-4 text-cyan-400" />
          <span className="text-sm font-semibold text-white">Connector DNA Catalog</span>
          <span className="text-[10px] text-slate-500 font-mono ml-2">{dnaCatalog.length} specs</span>
        </div>
        <div className="grid grid-cols-2 gap-2 p-3 max-h-[200px] overflow-y-auto">
          {dnaCatalog.map(dna => (
            <div key={dna.dna_id} className="flex items-center gap-3 bg-slate-900/50 rounded-lg p-2.5 border border-slate-800">
              <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center">
                <Radio className={`w-4 h-4 ${CATEGORY_COLORS[dna.category] || 'text-slate-400'}`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-white truncate">{dna.name.replace(/_/g, ' ')}</div>
                <div className="text-[10px] text-slate-500">{dna.vendor} | {dna.input_type}:{dna.input_port} | {dna.input_format}</div>
              </div>
              <span className="text-[9px] font-mono text-slate-600">v{dna.version}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Deployments Table */}
      <div className="bg-slate-800/40 border border-slate-700/50 rounded-lg overflow-hidden">
        <div className="px-4 py-2.5 border-b border-slate-700/40 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Server className="w-4 h-4 text-blue-400" />
            <span className="text-sm font-semibold text-white">Edge Collectors</span>
          </div>
          <div className="flex items-center gap-1.5 px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/20 rounded">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-emerald-400 text-[10px] font-mono font-bold">LIVE FLEET</span>
          </div>
        </div>

        <div className="overflow-y-auto max-h-[320px]">
          <table className="w-full text-xs">
            <thead className="bg-slate-900/60 sticky top-0">
              <tr className="text-slate-500 font-mono uppercase text-[10px]">
                <th className="text-left px-3 py-2">Collector</th>
                <th className="text-left px-3 py-2">DNA</th>
                <th className="text-center px-3 py-2">State</th>
                <th className="text-right px-3 py-2">EPS</th>
                <th className="text-right px-3 py-2">Latency</th>
                <th className="text-right px-3 py-2">CPU</th>
                <th className="text-right px-3 py-2">Uptime</th>
                <th className="text-center px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {deployments.map(d => {
                const stateStyle = STATE_COLORS[d.actual_state] || STATE_COLORS.pending;
                return (
                  <tr key={d.deployment_id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="px-3 py-2">
                      <div className="text-white font-medium">{d.hostname}</div>
                      <div className="text-slate-600 text-[10px] font-mono">{d.ip_address} | {d.site_name}</div>
                    </td>
                    <td className="px-3 py-2">
                      <span className="text-slate-300">{d.dna_name.replace(/_/g, ' ')}</span>
                      <span className="text-slate-600 text-[10px] ml-1">v{d.dna_version}</span>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded ${stateStyle.bg}`}>
                        <div className={`w-1.5 h-1.5 rounded-full ${stateStyle.dot} ${d.actual_state === 'running' ? 'animate-pulse' : ''}`} />
                        <span className={`${stateStyle.text} text-[10px] font-mono`}>{d.actual_state}</span>
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-cyan-400">
                      {d.events_per_second?.toLocaleString() || '-'}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-slate-400">
                      {d.latency_ms ? `${d.latency_ms.toFixed(0)}ms` : '-'}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-slate-400">
                      {d.cpu_percent ? `${d.cpu_percent.toFixed(0)}%` : '-'}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-slate-500 text-[10px]">
                      {formatUptime(d.uptime_seconds)}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <div className="flex items-center justify-center gap-1">
                        {d.actual_state === 'running' && (
                          <button onClick={() => performAction(d.collector_id, 'stop')} className="p-1 rounded hover:bg-red-500/10" title="Stop">
                            <XCircle className="w-3.5 h-3.5 text-red-400" />
                          </button>
                        )}
                        {(d.actual_state === 'stopped' || d.actual_state === 'dead') && (
                          <button onClick={() => performAction(d.collector_id, 'restart')} className="p-1 rounded hover:bg-emerald-500/10" title="Restart">
                            <RefreshCw className="w-3.5 h-3.5 text-emerald-400" />
                          </button>
                        )}
                        <button onClick={() => performAction(d.collector_id, 'decommission')} className="p-1 rounded hover:bg-slate-600/30" title="Decommission">
                          <Trash2 className="w-3.5 h-3.5 text-slate-600" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {deployments.length === 0 && !loading && (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-slate-500">
                    No edge collectors deployed yet. Click "Deploy Collector" to generate an install token.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Auto-Discovery Note */}
      <div className="bg-slate-800/30 border border-slate-700/30 rounded-lg p-3">
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <Zap className="w-3.5 h-3.5 text-cyan-400" />
          <span className="text-cyan-400 font-medium">Edge Mesh Architecture</span>
          <span className="text-slate-600">|</span>
          <span>Collectors auto-register on boot, send heartbeats every 30s, and pull config changes every 60s. Binary self-updates when a new DNA version is pushed.</span>
        </div>
      </div>
    </div>
  );
}
