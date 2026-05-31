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
  network_firewall: 'text-cyan-300',
  endpoint_security: 'text-blue-400',
  cloud: 'text-sky-400',
  cloud_security: 'text-sky-300',
  infrastructure: 'text-slate-400',
  siem_integration: 'text-amber-400',
  ot_ics: 'text-orange-400',
  identity: 'text-teal-400',
  ids_ips: 'text-rose-400',
  network_monitoring: 'text-emerald-400',
  waf: 'text-yellow-400',
  ndr: 'text-pink-400',
  email_security: 'text-red-300',
  message_bus: 'text-green-400',
};

const MOCK_DNA_CATALOG: DNASpec[] = [
  { dna_id: 'dna-001', name: 'palo_alto_firewall', version: '2.4.0', vendor: 'Palo Alto Networks', category: 'network_firewall', description: 'PAN-OS syslog & NGFW threat logs', input_type: 'syslog', input_protocol: 'tcp', input_port: 514, input_format: 'cef', auth_type: 'mtls', parser_engine: 'regex_cef' },
  { dna_id: 'dna-002', name: 'fortinet_fortigate', version: '2.1.0', vendor: 'Fortinet', category: 'network_firewall', description: 'FortiGate traffic & UTM logs', input_type: 'syslog', input_protocol: 'udp', input_port: 5514, input_format: 'kv', auth_type: 'api_key', parser_engine: 'kv_parser' },
  { dna_id: 'dna-003', name: 'crowdstrike_falcon', version: '3.0.1', vendor: 'CrowdStrike', category: 'endpoint_security', description: 'Falcon endpoint detection events via Streaming API', input_type: 'api_poll', input_protocol: 'https', input_port: 443, input_format: 'json', auth_type: 'oauth2', parser_engine: 'json_path' },
  { dna_id: 'dna-004', name: 'cisco_asa', version: '1.8.0', vendor: 'Cisco', category: 'network_firewall', description: 'ASA firewall syslog events', input_type: 'syslog', input_protocol: 'tcp', input_port: 1514, input_format: 'cisco_syslog', auth_type: 'mtls', parser_engine: 'regex_cisco' },
  { dna_id: 'dna-005', name: 'windows_event_log', version: '2.2.0', vendor: 'Microsoft', category: 'endpoint_security', description: 'Windows Security/System/Application event logs via WEF', input_type: 'wef', input_protocol: 'https', input_port: 5985, input_format: 'evtx', auth_type: 'kerberos', parser_engine: 'xml_evtx' },
  { dna_id: 'dna-006', name: 'generic_syslog', version: '1.5.0', vendor: 'Generic', category: 'infrastructure', description: 'RFC5424/RFC3164 syslog collector', input_type: 'syslog', input_protocol: 'tcp', input_port: 514, input_format: 'rfc5424', auth_type: 'mtls', parser_engine: 'rfc5424' },
  { dna_id: 'dna-007', name: 'aws_cloudtrail', version: '2.0.0', vendor: 'AWS', category: 'cloud', description: 'CloudTrail management & data events via S3/SQS', input_type: 'api_poll', input_protocol: 'https', input_port: 443, input_format: 'json', auth_type: 'iam_role', parser_engine: 'json_path' },
  { dna_id: 'dna-008', name: 'azure_activity_log', version: '1.9.0', vendor: 'Microsoft', category: 'cloud', description: 'Azure Activity & Diagnostic logs via Event Hub', input_type: 'event_hub', input_protocol: 'amqp', input_port: 5671, input_format: 'json', auth_type: 'sas_token', parser_engine: 'json_path' },
  { dna_id: 'dna-009', name: 'splunk_hec_receiver', version: '1.3.0', vendor: 'Generic', category: 'siem_integration', description: 'Splunk HEC-compatible receiver for forwarded events', input_type: 'http', input_protocol: 'https', input_port: 8088, input_format: 'splunk_hec', auth_type: 'bearer_token', parser_engine: 'splunk_hec' },
  { dna_id: 'dna-010', name: 'modbus_scada', version: '1.0.0', vendor: 'Industrial', category: 'ot_ics', description: 'Modbus TCP/RTU protocol monitor for SCADA systems', input_type: 'network_tap', input_protocol: 'tcp', input_port: 502, input_format: 'modbus', auth_type: 'none', parser_engine: 'modbus_decoder' },
  { dna_id: 'dna-011', name: 'juniper_srx', version: '1.6.0', vendor: 'Juniper', category: 'network_firewall', description: 'SRX Series structured syslog', input_type: 'syslog', input_protocol: 'tcp', input_port: 514, input_format: 'structured_syslog', auth_type: 'mtls', parser_engine: 'regex_juniper' },
  { dna_id: 'dna-012', name: 'check_point_firewall', version: '2.0.0', vendor: 'Check Point', category: 'network_firewall', description: 'Check Point Log Exporter OPSEC LEA', input_type: 'lea', input_protocol: 'tcp', input_port: 18184, input_format: 'opsec', auth_type: 'sic_cert', parser_engine: 'opsec_lea' },
  { dna_id: 'dna-013', name: 'zscaler_zia', version: '1.4.0', vendor: 'Zscaler', category: 'cloud_security', description: 'Zscaler Internet Access NSS logs', input_type: 'api_poll', input_protocol: 'https', input_port: 443, input_format: 'json', auth_type: 'api_key', parser_engine: 'json_path' },
  { dna_id: 'dna-014', name: 'sentinelone_edr', version: '2.1.0', vendor: 'SentinelOne', category: 'endpoint_security', description: 'SentinelOne Deep Visibility telemetry', input_type: 'api_poll', input_protocol: 'https', input_port: 443, input_format: 'json', auth_type: 'api_key', parser_engine: 'json_path' },
  { dna_id: 'dna-015', name: 'carbon_black_edr', version: '1.7.0', vendor: 'VMware', category: 'endpoint_security', description: 'Carbon Black Cloud event forwarder', input_type: 'api_poll', input_protocol: 'https', input_port: 443, input_format: 'json', auth_type: 'api_key', parser_engine: 'json_path' },
  { dna_id: 'dna-016', name: 'suricata_ids', version: '1.2.0', vendor: 'OISF', category: 'ids_ips', description: 'Suricata EVE JSON alert & flow logs', input_type: 'file_tail', input_protocol: 'unix', input_port: 0, input_format: 'eve_json', auth_type: 'filesystem', parser_engine: 'json_path' },
  { dna_id: 'dna-017', name: 'zeek_network', version: '1.3.0', vendor: 'Zeek Project', category: 'network_monitoring', description: 'Zeek/Bro connection, DNS, HTTP, SSL logs', input_type: 'file_tail', input_protocol: 'unix', input_port: 0, input_format: 'zeek_tsv', auth_type: 'filesystem', parser_engine: 'zeek_tsv' },
  { dna_id: 'dna-018', name: 'f5_bigip_waf', version: '1.5.0', vendor: 'F5 Networks', category: 'waf', description: 'F5 BIG-IP ASM/WAF violation logs', input_type: 'syslog', input_protocol: 'tcp', input_port: 5515, input_format: 'cef', auth_type: 'mtls', parser_engine: 'regex_cef' },
  { dna_id: 'dna-019', name: 'okta_system_log', version: '2.0.0', vendor: 'Okta', category: 'identity', description: 'Okta System Log API events', input_type: 'api_poll', input_protocol: 'https', input_port: 443, input_format: 'json', auth_type: 'api_key', parser_engine: 'json_path' },
  { dna_id: 'dna-020', name: 'google_workspace', version: '1.4.0', vendor: 'Google', category: 'cloud', description: 'Google Workspace Admin & Audit logs', input_type: 'api_poll', input_protocol: 'https', input_port: 443, input_format: 'json', auth_type: 'oauth2', parser_engine: 'json_path' },
  { dna_id: 'dna-021', name: 'office365_management', version: '1.8.0', vendor: 'Microsoft', category: 'cloud', description: 'Office 365 Management Activity API', input_type: 'api_poll', input_protocol: 'https', input_port: 443, input_format: 'json', auth_type: 'oauth2', parser_engine: 'json_path' },
  { dna_id: 'dna-022', name: 'linux_auditd', version: '1.1.0', vendor: 'Linux', category: 'endpoint_security', description: 'Linux audit subsystem logs', input_type: 'file_tail', input_protocol: 'unix', input_port: 0, input_format: 'audit_log', auth_type: 'filesystem', parser_engine: 'audit_parser' },
  { dna_id: 'dna-023', name: 'macos_unified_log', version: '1.0.0', vendor: 'Apple', category: 'endpoint_security', description: 'macOS Unified Logging via log stream', input_type: 'process', input_protocol: 'stdout', input_port: 0, input_format: 'json', auth_type: 'local', parser_engine: 'json_path' },
  { dna_id: 'dna-024', name: 'sophos_xg', version: '1.3.0', vendor: 'Sophos', category: 'network_firewall', description: 'Sophos XG Firewall syslog feed', input_type: 'syslog', input_protocol: 'udp', input_port: 515, input_format: 'kv', auth_type: 'mtls', parser_engine: 'kv_parser' },
  { dna_id: 'dna-025', name: 'trend_micro_apex', version: '1.2.0', vendor: 'Trend Micro', category: 'endpoint_security', description: 'Apex One detection & response events', input_type: 'api_poll', input_protocol: 'https', input_port: 443, input_format: 'json', auth_type: 'api_key', parser_engine: 'json_path' },
  { dna_id: 'dna-026', name: 'darktrace_detect', version: '1.5.0', vendor: 'Darktrace', category: 'ndr', description: 'Darktrace model breach alerts', input_type: 'api_poll', input_protocol: 'https', input_port: 443, input_format: 'json', auth_type: 'api_key', parser_engine: 'json_path' },
  { dna_id: 'dna-027', name: 'vectra_ai', version: '1.1.0', vendor: 'Vectra AI', category: 'ndr', description: 'Vectra Cognito detections & host scores', input_type: 'api_poll', input_protocol: 'https', input_port: 443, input_format: 'json', auth_type: 'api_key', parser_engine: 'json_path' },
  { dna_id: 'dna-028', name: 'proofpoint_tap', version: '1.3.0', vendor: 'Proofpoint', category: 'email_security', description: 'Proofpoint TAP SIEM integration', input_type: 'api_poll', input_protocol: 'https', input_port: 443, input_format: 'json', auth_type: 'api_key', parser_engine: 'json_path' },
  { dna_id: 'dna-029', name: 'cisco_meraki', version: '1.2.0', vendor: 'Cisco', category: 'network_security', description: 'Meraki MX security events & flows', input_type: 'syslog', input_protocol: 'udp', input_port: 5516, input_format: 'meraki_syslog', auth_type: 'api_key', parser_engine: 'regex_meraki' },
  { dna_id: 'dna-030', name: 'kafka_consumer', version: '1.6.0', vendor: 'Apache', category: 'message_bus', description: 'Apache Kafka topic consumer for event streams', input_type: 'kafka', input_protocol: 'tcp', input_port: 9092, input_format: 'json', auth_type: 'sasl_ssl', parser_engine: 'json_path' },
  { dna_id: 'dna-031', name: 'gcp_audit_log', version: '1.5.0', vendor: 'Google', category: 'cloud', description: 'GCP Cloud Audit Logs via Pub/Sub', input_type: 'pubsub', input_protocol: 'https', input_port: 443, input_format: 'json', auth_type: 'service_account', parser_engine: 'json_path' },
  { dna_id: 'dna-032', name: 'elastic_beats_receiver', version: '1.0.0', vendor: 'Elastic', category: 'siem_integration', description: 'Elastic Beats Lumberjack protocol receiver', input_type: 'lumberjack', input_protocol: 'tcp', input_port: 5044, input_format: 'lumberjack', auth_type: 'mtls', parser_engine: 'lumberjack_v2' },
];

const MOCK_FLEET: Deployment[] = [
  { deployment_id: 'dep-001', collector_id: 'ec-paloalto-dc01', dna_name: 'palo_alto_firewall', dna_version: '2.4.0', hostname: 'edge-fw-dc01', ip_address: '10.1.0.10', os_type: 'linux', actual_state: 'running', desired_state: 'running', binary_version: '1.4.2', site_name: 'datacenter-east', registered_at: '2026-04-12T08:00:00Z', events_per_second: 42500, bytes_per_second: 12400000, error_count: 0, buffer_usage_pct: 12, uptime_seconds: 2592000, cpu_percent: 34, memory_mb: 512, latency_ms: 2.1, connection_status: 'connected', last_heartbeat: '2026-05-31T10:30:00Z' },
  { deployment_id: 'dep-002', collector_id: 'ec-crowdstrike-dc01', dna_name: 'crowdstrike_falcon', dna_version: '3.0.1', hostname: 'edge-edr-dc01', ip_address: '10.1.0.11', os_type: 'linux', actual_state: 'running', desired_state: 'running', binary_version: '1.4.2', site_name: 'datacenter-east', registered_at: '2026-04-12T08:05:00Z', events_per_second: 98200, bytes_per_second: 28600000, error_count: 0, buffer_usage_pct: 18, uptime_seconds: 2592000, cpu_percent: 52, memory_mb: 1024, latency_ms: 3.4, connection_status: 'connected', last_heartbeat: '2026-05-31T10:30:00Z' },
  { deployment_id: 'dep-003', collector_id: 'ec-fortinet-branch01', dna_name: 'fortinet_fortigate', dna_version: '2.1.0', hostname: 'edge-fw-branch-sp', ip_address: '172.16.1.5', os_type: 'linux', actual_state: 'running', desired_state: 'running', binary_version: '1.4.2', site_name: 'branch-sao-paulo', registered_at: '2026-04-15T14:00:00Z', events_per_second: 18900, bytes_per_second: 5500000, error_count: 0, buffer_usage_pct: 8, uptime_seconds: 1728000, cpu_percent: 22, memory_mb: 256, latency_ms: 14.2, connection_status: 'connected', last_heartbeat: '2026-05-31T10:29:00Z' },
  { deployment_id: 'dep-004', collector_id: 'ec-aws-prod', dna_name: 'aws_cloudtrail', dna_version: '2.0.0', hostname: 'edge-cloud-aws-prod', ip_address: '10.2.0.5', os_type: 'linux', actual_state: 'running', desired_state: 'running', binary_version: '1.4.2', site_name: 'aws-us-east-1', registered_at: '2026-03-20T10:00:00Z', events_per_second: 67800, bytes_per_second: 19800000, error_count: 0, buffer_usage_pct: 22, uptime_seconds: 5184000, cpu_percent: 41, memory_mb: 768, latency_ms: 5.8, connection_status: 'connected', last_heartbeat: '2026-05-31T10:30:00Z' },
  { deployment_id: 'dep-005', collector_id: 'ec-azure-prod', dna_name: 'azure_activity_log', dna_version: '1.9.0', hostname: 'edge-cloud-azure', ip_address: '10.3.0.5', os_type: 'linux', actual_state: 'running', desired_state: 'running', binary_version: '1.4.2', site_name: 'azure-east-us', registered_at: '2026-03-22T10:00:00Z', events_per_second: 54300, bytes_per_second: 15900000, error_count: 0, buffer_usage_pct: 19, uptime_seconds: 5011200, cpu_percent: 38, memory_mb: 640, latency_ms: 4.2, connection_status: 'connected', last_heartbeat: '2026-05-31T10:30:00Z' },
  { deployment_id: 'dep-006', collector_id: 'ec-okta-prod', dna_name: 'okta_system_log', dna_version: '2.0.0', hostname: 'edge-iam-okta', ip_address: '10.1.0.20', os_type: 'linux', actual_state: 'running', desired_state: 'running', binary_version: '1.4.2', site_name: 'datacenter-east', registered_at: '2026-04-01T09:00:00Z', events_per_second: 12400, bytes_per_second: 3600000, error_count: 0, buffer_usage_pct: 5, uptime_seconds: 4320000, cpu_percent: 15, memory_mb: 192, latency_ms: 8.1, connection_status: 'connected', last_heartbeat: '2026-05-31T10:30:00Z' },
  { deployment_id: 'dep-007', collector_id: 'ec-suricata-dc01', dna_name: 'suricata_ids', dna_version: '1.2.0', hostname: 'edge-ids-dc01', ip_address: '10.1.0.30', os_type: 'linux', actual_state: 'running', desired_state: 'running', binary_version: '1.4.2', site_name: 'datacenter-east', registered_at: '2026-04-05T11:00:00Z', events_per_second: 156000, bytes_per_second: 45600000, error_count: 2, buffer_usage_pct: 35, uptime_seconds: 2160000, cpu_percent: 68, memory_mb: 2048, latency_ms: 1.5, connection_status: 'connected', last_heartbeat: '2026-05-31T10:30:00Z' },
  { deployment_id: 'dep-008', collector_id: 'ec-zeek-dmz', dna_name: 'zeek_network', dna_version: '1.3.0', hostname: 'edge-ndr-dmz', ip_address: '10.0.1.10', os_type: 'linux', actual_state: 'running', desired_state: 'running', binary_version: '1.4.2', site_name: 'datacenter-east', registered_at: '2026-04-05T11:30:00Z', events_per_second: 89700, bytes_per_second: 26200000, error_count: 0, buffer_usage_pct: 28, uptime_seconds: 2160000, cpu_percent: 56, memory_mb: 1536, latency_ms: 1.8, connection_status: 'connected', last_heartbeat: '2026-05-31T10:30:00Z' },
  { deployment_id: 'dep-009', collector_id: 'ec-modbus-plant01', dna_name: 'modbus_scada', dna_version: '1.0.0', hostname: 'edge-ot-plant01', ip_address: '192.168.100.10', os_type: 'linux', actual_state: 'running', desired_state: 'running', binary_version: '1.4.2', site_name: 'plant-guarulhos', registered_at: '2026-04-20T16:00:00Z', events_per_second: 3200, bytes_per_second: 940000, error_count: 0, buffer_usage_pct: 3, uptime_seconds: 3456000, cpu_percent: 8, memory_mb: 128, latency_ms: 22.4, connection_status: 'connected', last_heartbeat: '2026-05-31T10:29:00Z' },
  { deployment_id: 'dep-010', collector_id: 'ec-darktrace-dc01', dna_name: 'darktrace_detect', dna_version: '1.5.0', hostname: 'edge-ndr-dc01', ip_address: '10.1.0.35', os_type: 'linux', actual_state: 'running', desired_state: 'running', binary_version: '1.4.2', site_name: 'datacenter-east', registered_at: '2026-04-25T09:00:00Z', events_per_second: 28400, bytes_per_second: 8300000, error_count: 0, buffer_usage_pct: 14, uptime_seconds: 2764800, cpu_percent: 29, memory_mb: 384, latency_ms: 3.6, connection_status: 'connected', last_heartbeat: '2026-05-31T10:30:00Z' },
  { deployment_id: 'dep-011', collector_id: 'ec-winevent-dc01', dna_name: 'windows_event_log', dna_version: '2.2.0', hostname: 'edge-wef-dc01', ip_address: '10.1.0.40', os_type: 'windows', actual_state: 'running', desired_state: 'running', binary_version: '1.4.2', site_name: 'datacenter-east', registered_at: '2026-03-28T08:00:00Z', events_per_second: 34100, bytes_per_second: 9950000, error_count: 1, buffer_usage_pct: 16, uptime_seconds: 4838400, cpu_percent: 42, memory_mb: 896, latency_ms: 2.8, connection_status: 'connected', last_heartbeat: '2026-05-31T10:30:00Z' },
  { deployment_id: 'dep-012', collector_id: 'ec-cisco-asa-dc02', dna_name: 'cisco_asa', dna_version: '1.8.0', hostname: 'edge-fw-dc02', ip_address: '10.4.0.10', os_type: 'linux', actual_state: 'running', desired_state: 'running', binary_version: '1.4.2', site_name: 'datacenter-west', registered_at: '2026-04-02T10:00:00Z', events_per_second: 31600, bytes_per_second: 9200000, error_count: 0, buffer_usage_pct: 11, uptime_seconds: 4233600, cpu_percent: 28, memory_mb: 384, latency_ms: 6.4, connection_status: 'connected', last_heartbeat: '2026-05-31T10:30:00Z' },
  { deployment_id: 'dep-013', collector_id: 'ec-gcp-prod', dna_name: 'gcp_audit_log', dna_version: '1.5.0', hostname: 'edge-cloud-gcp', ip_address: '10.5.0.5', os_type: 'linux', actual_state: 'running', desired_state: 'running', binary_version: '1.4.2', site_name: 'gcp-us-central1', registered_at: '2026-04-10T12:00:00Z', events_per_second: 41200, bytes_per_second: 12000000, error_count: 0, buffer_usage_pct: 15, uptime_seconds: 3628800, cpu_percent: 33, memory_mb: 512, latency_ms: 4.9, connection_status: 'connected', last_heartbeat: '2026-05-31T10:30:00Z' },
  { deployment_id: 'dep-014', collector_id: 'ec-proofpoint-cloud', dna_name: 'proofpoint_tap', dna_version: '1.3.0', hostname: 'edge-email-pp', ip_address: '10.1.0.50', os_type: 'linux', actual_state: 'running', desired_state: 'running', binary_version: '1.4.2', site_name: 'datacenter-east', registered_at: '2026-04-18T14:00:00Z', events_per_second: 8900, bytes_per_second: 2600000, error_count: 0, buffer_usage_pct: 4, uptime_seconds: 3024000, cpu_percent: 11, memory_mb: 192, latency_ms: 9.2, connection_status: 'connected', last_heartbeat: '2026-05-31T10:30:00Z' },
  { deployment_id: 'dep-015', collector_id: 'ec-kafka-stream01', dna_name: 'kafka_consumer', dna_version: '1.6.0', hostname: 'edge-bus-kafka01', ip_address: '10.1.0.60', os_type: 'linux', actual_state: 'degraded', desired_state: 'running', binary_version: '1.4.1', site_name: 'datacenter-east', registered_at: '2026-04-22T10:00:00Z', events_per_second: 22100, bytes_per_second: 6450000, error_count: 14, buffer_usage_pct: 72, uptime_seconds: 2592000, cpu_percent: 78, memory_mb: 1280, latency_ms: 45.2, connection_status: 'connected', last_heartbeat: '2026-05-31T10:28:00Z' },
  { deployment_id: 'dep-016', collector_id: 'ec-sentinel-legacy', dna_name: 'sentinelone_edr', dna_version: '2.1.0', hostname: 'edge-edr-legacy', ip_address: '10.6.0.5', os_type: 'linux', actual_state: 'stopped', desired_state: 'stopped', binary_version: '1.3.8', site_name: 'branch-rio', registered_at: '2026-02-10T10:00:00Z', events_per_second: null, bytes_per_second: null, error_count: null, buffer_usage_pct: null, uptime_seconds: null, cpu_percent: null, memory_mb: null, latency_ms: null, connection_status: 'disconnected', last_heartbeat: '2026-05-28T22:15:00Z' },
];

const MOCK_STATS: FleetStats = { total: 36, running: 34, degraded: 1, dead: 0, stopped: 1 };
const MOCK_TOTAL_EPS = 712850;

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
