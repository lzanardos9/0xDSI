import React, { useRef, useEffect, useCallback, useMemo, useState } from 'react';
import {
  Layers,
  Activity,
  Radio,
  Search,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  CheckCircle,
  XCircle,
  HelpCircle,
  FileText,
  ArrowRight,
  Zap,
  Shield,
  Eye,
  EyeOff,
} from 'lucide-react';
import {
  CONNECTOR_META,
  ConnectorType,
  FunnelEvent,
  FUNNEL_PHASES,
} from './eventFunnelData';
import { useLiveStream, LiveSeed } from './liveEventStream';

// ---------------------------------------------------------------------------
// OSI Layer definitions
// ---------------------------------------------------------------------------

export interface OSILayer {
  id: number;
  name: string;
  shortName: string;
  description: string;
  protocols: string[];
  color: string;
  glowColor: string;
  eventCount: number;
  threatCount: number;
  severityHeat: number; // 0-1, drives color shift
}

const OSI_LAYERS: OSILayer[] = [
  { id: 7, name: 'Application',   shortName: 'APP',   description: 'HTTP, DNS, SMTP, FTP, SSH',  protocols: ['HTTP','HTTPS','DNS','SMTP','FTP','SSH','LDAP','SNMP'], color: '#ef4444', glowColor: '#ef444480', eventCount: 0, threatCount: 0, severityHeat: 0 },
  { id: 6, name: 'Presentation',  shortName: 'PRES',  description: 'SSL/TLS, MIME, Compression', protocols: ['TLS','SSL','MIME','JPEG','ASCII','MPEG'], color: '#f97316', glowColor: '#f9731680', eventCount: 0, threatCount: 0, severityHeat: 0 },
  { id: 5, name: 'Session',       shortName: 'SESS',  description: 'NetBIOS, RPC, PPTP sessions', protocols: ['NetBIOS','RPC','PPTP','SMB','NFS','SCP'], color: '#eab308', glowColor: '#eab30880', eventCount: 0, threatCount: 0, severityHeat: 0 },
  { id: 4, name: 'Transport',     shortName: 'TRANS',  description: 'TCP, UDP, SCTP segmentation', protocols: ['TCP','UDP','SCTP','DCCP','QUIC'], color: '#22c55e', glowColor: '#22c55e80', eventCount: 0, threatCount: 0, severityHeat: 0 },
  { id: 3, name: 'Network',       shortName: 'NET',   description: 'IP, ICMP, IGMP, IPSec',      protocols: ['IP','ICMP','IGMP','IPSec','ARP','OSPF','BGP'], color: '#06b6d4', glowColor: '#06b6d480', eventCount: 0, threatCount: 0, severityHeat: 0 },
  { id: 2, name: 'Data Link',     shortName: 'DL',    description: 'Ethernet, Wi-Fi, PPP, ARP',  protocols: ['Ethernet','Wi-Fi','PPP','VLAN','STP','LLDP'], color: '#3b82f6', glowColor: '#3b82f680', eventCount: 0, threatCount: 0, severityHeat: 0 },
  { id: 1, name: 'Physical',      shortName: 'PHY',   description: 'Cables, hubs, repeaters',     protocols: ['RS-232','DSL','ISDN','USB','Bluetooth','Fiber'], color: '#8b5cf6', glowColor: '#8b5cf680', eventCount: 0, threatCount: 0, severityHeat: 0 },
];

// ---------------------------------------------------------------------------
// OSI Event types
// ---------------------------------------------------------------------------

export interface OSIEvent {
  id: string;
  timestamp: string;
  osiLayer: number;
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
  protocol: string;
  sourceIP: string;
  destIP: string;
  port: number;
  bytes: number;
  connector: ConnectorType;
  eventType: string;
  description: string;
  crossLayerLinks: number[];
  verdict: 'benign' | 'suspicious' | 'threat' | 'critical_threat' | 'pending';
  patternTag: string | null;
  rawData: string;
}

// ---------------------------------------------------------------------------
// Mock OSI event generator
// ---------------------------------------------------------------------------

const ATTACK_PATTERNS: {
  tag: string;
  layers: number[];
  severity: OSIEvent['severity'];
  verdict: OSIEvent['verdict'];
  eventTypes: string[];
  descriptions: string[];
}[] = [
  { tag: 'DNS_TUNNEL', layers: [7, 4, 3], severity: 'critical', verdict: 'critical_threat', eventTypes: ['dns_exfiltration', 'dns_tunnel_detected', 'high_entropy_dns'], descriptions: ['DNS tunneling detected: base64 encoded payloads in TXT queries to suspicious domain', 'Abnormally large DNS responses from newly registered domain', 'High-entropy subdomain queries consistent with data exfiltration'] },
  { tag: 'SSL_STRIP', layers: [6, 7, 4], severity: 'high', verdict: 'threat', eventTypes: ['ssl_downgrade', 'cert_mismatch', 'mitm_detected'], descriptions: ['SSL stripping attack detected: forced downgrade from HTTPS to HTTP', 'Certificate chain validation failure - possible MITM proxy', 'TLS handshake anomaly: unexpected cipher suite negotiation'] },
  { tag: 'SYN_FLOOD', layers: [4, 3], severity: 'critical', verdict: 'critical_threat', eventTypes: ['syn_flood', 'half_open_surge', 'tcp_anomaly'], descriptions: ['SYN flood detected: 45,000 half-open connections from distributed sources', 'TCP state table saturation approaching threshold', 'Abnormal SYN/ACK ratio detected on edge firewall'] },
  { tag: 'ARP_SPOOF', layers: [2, 3], severity: 'high', verdict: 'threat', eventTypes: ['arp_spoof', 'mac_anomaly', 'gratuitous_arp'], descriptions: ['ARP spoofing detected: MAC address conflict for gateway IP', 'Gratuitous ARP broadcast from unknown MAC address', 'ARP table inconsistency: duplicate IP with different MAC'] },
  { tag: 'LATERAL_MOVE', layers: [5, 7, 4, 3], severity: 'critical', verdict: 'critical_threat', eventTypes: ['smb_lateral', 'pass_the_hash', 'rdp_brute'], descriptions: ['Lateral movement via SMB: PsExec-like activity from compromised host', 'Pass-the-hash attack: NTLM relay detected between segments', 'RDP brute force followed by successful session from anomalous source'] },
  { tag: 'COVERT_CHANNEL', layers: [1, 2, 3], severity: 'high', verdict: 'threat', eventTypes: ['phy_covert', 'timing_channel', 'steganography'], descriptions: ['Physical layer timing covert channel detected', 'Ethernet frame padding anomaly consistent with steganographic data', 'Inter-packet timing analysis reveals hidden communication channel'] },
  { tag: 'C2_BEACON', layers: [7, 6, 4], severity: 'critical', verdict: 'critical_threat', eventTypes: ['c2_beacon', 'periodic_callback', 'encrypted_c2'], descriptions: ['C2 beacon detected: periodic HTTPS callbacks to known APT infrastructure', 'Encrypted payload beacon with 60s interval to Cobalt Strike server', 'JA3 hash matched known malware family C2 communication'] },
  { tag: 'VLAN_HOP', layers: [2, 3, 4], severity: 'high', verdict: 'threat', eventTypes: ['vlan_hopping', 'double_tag', 'trunk_abuse'], descriptions: ['VLAN hopping attack: double-tagged 802.1Q frames detected', 'Switch trunk port misconfiguration exploitation attempt', 'DTP negotiation attack detected on access port'] },
  { tag: 'SESSION_HIJACK', layers: [5, 6, 7], severity: 'critical', verdict: 'critical_threat', eventTypes: ['session_hijack', 'cookie_theft', 'token_replay'], descriptions: ['Session hijacking detected: stolen OAuth token replayed from foreign IP', 'TCP session takeover via sequence number prediction', 'Authentication cookie exfiltrated and replayed from new geographic location'] },
  { tag: 'BANDWIDTH_ABUSE', layers: [1, 2], severity: 'medium', verdict: 'suspicious', eventTypes: ['bandwidth_spike', 'jumbo_frame', 'phy_anomaly'], descriptions: ['Unusual bandwidth consumption on physical interface eth0/3', 'Jumbo frame flood detected on non-jumbo-enabled segment', 'Physical layer CRC error rate spike indicating potential tampering'] },
  { tag: 'ICMP_TUNNEL', layers: [3, 4], severity: 'high', verdict: 'threat', eventTypes: ['icmp_tunnel', 'ping_exfil', 'icmp_anomaly'], descriptions: ['ICMP tunneling: oversized echo request payloads carrying encoded data', 'Ping-based data exfiltration: 2.3MB transferred via ICMP in 60 seconds', 'ICMP redirect messages from unauthorized source'] },
  { tag: 'APP_EXPLOIT', layers: [7, 6], severity: 'critical', verdict: 'critical_threat', eventTypes: ['sqli_attempt', 'xss_payload', 'rce_exploit'], descriptions: ['SQL injection attempt in login form: UNION-based extraction of user table', 'Stored XSS payload injected via comment field with encoded script tags', 'Remote code execution via deserialization vulnerability in API endpoint'] },
  // BytecodeWeaver application-layer attack patterns
  { tag: 'BW_DECOMPILE_EXFIL', layers: [7, 6, 4], severity: 'critical', verdict: 'critical_threat', eventTypes: ['bytecode_decompile_exfil', 'class_dump_detected', 'jar_extraction_anomaly'], descriptions: ['BytecodeWeaver: decompiled .class files exfiltrated via HTTPS POST to external pastebin', 'BytecodeWeaver: unauthorized class dump of com.core.auth.TokenValidator detected from build server', 'BytecodeWeaver: bulk JAR extraction of 47 internal libraries to unregistered S3 bucket'] },
  { tag: 'BW_INJECT_MALICIOUS', layers: [7, 5, 4], severity: 'critical', verdict: 'critical_threat', eventTypes: ['bytecode_injection', 'classloader_hijack', 'agent_tampering'], descriptions: ['BytecodeWeaver: malicious bytecode injected into com.payment.ProcessTransaction at runtime via ASM framework', 'BytecodeWeaver: custom ClassLoader replacing signed classes in production JVM - supply chain compromise', 'BytecodeWeaver: Java agent -javaagent flag appended to production JVM args without change approval'] },
  { tag: 'BW_OBFUSCATION_BYPASS', layers: [7, 6], severity: 'high', verdict: 'threat', eventTypes: ['obfuscation_strip', 'proguard_bypass', 'reflection_abuse'], descriptions: ['BytecodeWeaver: ProGuard obfuscation mapping file accessed and correlated to strip class renaming', 'BytecodeWeaver: obfuscation rules reversed - original method signatures reconstructed for 312 classes', 'BytecodeWeaver: reflection-based access to private fields in obfuscated security module detected'] },
  { tag: 'BW_DEPENDENCY_POISON', layers: [7, 4, 3], severity: 'critical', verdict: 'critical_threat', eventTypes: ['dependency_confusion', 'maven_hijack', 'gradle_inject'], descriptions: ['BytecodeWeaver: dependency confusion attack - internal package name squatted on public Maven Central', 'BytecodeWeaver: Maven repository poisoned - com.internal:auth-core resolving to attacker-controlled artifact', 'BytecodeWeaver: Gradle build script modified to inject remote repository with typosquatted artifacts'] },
  { tag: 'BW_HEAP_DUMP_LEAK', layers: [7, 5], severity: 'critical', verdict: 'critical_threat', eventTypes: ['heap_dump_exfil', 'jmx_unauthorized', 'memory_scrape'], descriptions: ['BytecodeWeaver: JVM heap dump containing 2,847 plaintext credentials exfiltrated via JMX remote', 'BytecodeWeaver: unauthorized JMX connection from 10.0.3.7 triggering full heap dump of auth-service', 'BytecodeWeaver: memory scraping detected - string extraction of RSA private keys from JVM process'] },
  { tag: 'BW_SERIALIZATION_RCE', layers: [7, 6, 4], severity: 'critical', verdict: 'critical_threat', eventTypes: ['deserialization_rce', 'gadget_chain', 'ysoserial_payload'], descriptions: ['BytecodeWeaver: Java deserialization RCE via Apache Commons Collections gadget chain on REST endpoint', 'BytecodeWeaver: ysoserial CommonsCollections7 payload detected in serialized ObjectInputStream', 'BytecodeWeaver: JNDI injection via crafted serialized object triggering remote class loading from LDAP'] },
  { tag: 'API_ABUSE', layers: [7, 4], severity: 'high', verdict: 'threat', eventTypes: ['api_rate_abuse', 'graphql_introspection', 'api_enum_attack'], descriptions: ['REST API abuse: 12,000 requests/min from single API key targeting /api/v2/users endpoint', 'GraphQL introspection query from external IP mapping entire schema including deprecated mutations', 'API enumeration attack: sequential ID brute-force on /api/v1/invoices/{id} from rotating proxies'] },
  { tag: 'OAUTH_EXPLOIT', layers: [7, 6, 5], severity: 'critical', verdict: 'critical_threat', eventTypes: ['oauth_redirect_hijack', 'jwt_forgery', 'scope_escalation'], descriptions: ['OAuth redirect URI hijack: authorization code intercepted via open redirect to attacker callback', 'JWT token forged with algorithm confusion attack - RS256 key used as HMAC secret for HS256', 'OAuth scope escalation: client obtained admin:write scope via parameter pollution in token request'] },
  { tag: 'WEBSOCKET_ABUSE', layers: [7, 4], severity: 'high', verdict: 'threat', eventTypes: ['ws_injection', 'ws_flood', 'ws_hijack'], descriptions: ['WebSocket message injection: crafted frames bypassing origin validation on /ws/live-data', 'WebSocket connection flood: 8,000 concurrent connections from botnet exhausting server threads', 'WebSocket session hijack: connection upgrade token replayed from intercepted HTTP Upgrade header'] },
  { tag: 'GRPC_EXPLOIT', layers: [7, 6, 4], severity: 'high', verdict: 'threat', eventTypes: ['grpc_reflection_abuse', 'protobuf_overflow', 'grpc_metadata_inject'], descriptions: ['gRPC server reflection enabled in production - full service enumeration by external scanner', 'Protobuf message with oversized repeated field causing 4.2GB memory allocation in deserializer', 'gRPC metadata header injection: authorization token overwritten via duplicate metadata key'] },
];

// ---------------------------------------------------------------------------
// Massive application-layer (L7) benign/operational events
// ---------------------------------------------------------------------------

const APP_LAYER_EVENTS: { eventType: string; description: string; protocol: string; severity: OSIEvent['severity']; connector: ConnectorType; rawDataFn: (src: string, dst: string) => string }[] = [
  // BytecodeWeaver runtime monitoring
  { eventType: 'bw_class_load', description: 'BytecodeWeaver: class com.core.service.UserAuthService loaded from verified signed JAR', protocol: 'HTTPS', severity: 'info', connector: 'BytecodeWeaver', rawDataFn: (s, d) => JSON.stringify({ engine: 'BytecodeWeaver', action: 'class_load', class: 'com.core.service.UserAuthService', jar: 'auth-service-3.2.1.jar', signature: 'VALID', hash: 'sha256:a4f2e8...', jvm_pid: 28441, src: s, dst: d }) },
  { eventType: 'bw_class_load', description: 'BytecodeWeaver: class com.payment.gateway.StripeProcessor loaded - bytecode integrity verified', protocol: 'HTTPS', severity: 'info', connector: 'BytecodeWeaver', rawDataFn: (s, d) => JSON.stringify({ engine: 'BytecodeWeaver', action: 'class_load', class: 'com.payment.gateway.StripeProcessor', jar: 'payment-gateway-2.8.0.jar', signature: 'VALID', hash: 'sha256:c7d1f3...', jvm_pid: 28441, src: s, dst: d }) },
  { eventType: 'bw_method_trace', description: 'BytecodeWeaver: method trace on processPayment() - avg 23ms, 0 exceptions in last 1000 calls', protocol: 'HTTPS', severity: 'info', connector: 'BytecodeWeaver', rawDataFn: (s, d) => JSON.stringify({ engine: 'BytecodeWeaver', action: 'method_trace', class: 'PaymentProcessor', method: 'processPayment', avg_ms: 23, p99_ms: 89, calls: 1000, exceptions: 0, src: s, dst: d }) },
  { eventType: 'bw_method_trace', description: 'BytecodeWeaver: method trace on validateToken() - 142 calls/sec, 2 InvalidTokenExceptions caught', protocol: 'HTTPS', severity: 'low', connector: 'BytecodeWeaver', rawDataFn: (s, d) => JSON.stringify({ engine: 'BytecodeWeaver', action: 'method_trace', class: 'TokenValidator', method: 'validateToken', calls_per_sec: 142, exceptions: 2, exception_type: 'InvalidTokenException', src: s, dst: d }) },
  { eventType: 'bw_dependency_scan', description: 'BytecodeWeaver: dependency scan complete - 234 JARs verified, 0 CVEs above CVSS 7.0', protocol: 'HTTPS', severity: 'info', connector: 'BytecodeWeaver', rawDataFn: (s, d) => JSON.stringify({ engine: 'BytecodeWeaver', action: 'dependency_scan', jars_scanned: 234, cves_found: 3, cves_critical: 0, cves_high: 0, cves_medium: 3, scan_duration_ms: 4521, src: s, dst: d }) },
  { eventType: 'bw_dependency_scan', description: 'BytecodeWeaver: dependency scan flagged log4j-core-2.14.1.jar - CVE-2021-44228 (CVSS 10.0) PATCHED', protocol: 'HTTPS', severity: 'low', connector: 'BytecodeWeaver', rawDataFn: (s, d) => JSON.stringify({ engine: 'BytecodeWeaver', action: 'dependency_scan', artifact: 'log4j-core', version: '2.14.1', cve: 'CVE-2021-44228', cvss: 10.0, status: 'PATCHED_AT_RUNTIME', mitigation: 'JNDI lookup disabled via bytecode transform', src: s, dst: d }) },
  { eventType: 'bw_bytecode_transform', description: 'BytecodeWeaver: applied security transform to com.api.controllers.AdminController - SQL param binding enforced', protocol: 'HTTPS', severity: 'info', connector: 'BytecodeWeaver', rawDataFn: (s, d) => JSON.stringify({ engine: 'BytecodeWeaver', action: 'bytecode_transform', target: 'com.api.controllers.AdminController', transform: 'SQL_PARAM_BINDING', methods_modified: 8, verification: 'PASSED', src: s, dst: d }) },
  { eventType: 'bw_bytecode_transform', description: 'BytecodeWeaver: runtime patch applied to deserialization filter in ObjectInputStream wrapper', protocol: 'HTTPS', severity: 'info', connector: 'BytecodeWeaver', rawDataFn: (s, d) => JSON.stringify({ engine: 'BytecodeWeaver', action: 'bytecode_transform', target: 'java.io.ObjectInputStream', transform: 'DESERIALIZATION_FILTER', blocked_classes: ['org.apache.commons.collections.Transformer', 'com.sun.rowset.JdbcRowSetImpl'], src: s, dst: d }) },
  { eventType: 'bw_jvm_metrics', description: 'BytecodeWeaver: JVM heap usage 67% (4.2GB/6.3GB), GC pause avg 12ms, 0 OOMEs', protocol: 'HTTPS', severity: 'info', connector: 'BytecodeWeaver', rawDataFn: (s, d) => JSON.stringify({ engine: 'BytecodeWeaver', action: 'jvm_metrics', heap_used_gb: 4.2, heap_max_gb: 6.3, gc_pause_avg_ms: 12, gc_pause_p99_ms: 45, thread_count: 312, oome_count: 0, cpu_pct: 34, src: s, dst: d }) },
  { eventType: 'bw_jvm_metrics', description: 'BytecodeWeaver: GC pressure elevated - 3 full GC cycles in last 5 minutes, old gen 89% utilized', protocol: 'HTTPS', severity: 'medium', connector: 'BytecodeWeaver', rawDataFn: (s, d) => JSON.stringify({ engine: 'BytecodeWeaver', action: 'jvm_metrics', heap_used_gb: 5.6, heap_max_gb: 6.3, gc_type: 'FULL_GC', gc_count_5min: 3, old_gen_pct: 89, warning: 'MEMORY_PRESSURE', src: s, dst: d }) },
  { eventType: 'bw_classloader_audit', description: 'BytecodeWeaver: classloader hierarchy audit - 4 custom classloaders verified, no unauthorized loaders', protocol: 'HTTPS', severity: 'info', connector: 'BytecodeWeaver', rawDataFn: (s, d) => JSON.stringify({ engine: 'BytecodeWeaver', action: 'classloader_audit', system_loaders: 3, custom_loaders: 4, unauthorized: 0, classes_loaded: 18472, loaders: ['AppClassLoader', 'PlatformClassLoader', 'SpringBootClassLoader', 'PluginClassLoader'], src: s, dst: d }) },
  { eventType: 'bw_thread_analysis', description: 'BytecodeWeaver: thread dump analysis - 312 threads, 4 deadlock candidates in connection pool', protocol: 'HTTPS', severity: 'medium', connector: 'BytecodeWeaver', rawDataFn: (s, d) => JSON.stringify({ engine: 'BytecodeWeaver', action: 'thread_analysis', total_threads: 312, runnable: 89, waiting: 156, blocked: 4, deadlock_candidates: 4, pool: 'HikariPool-1', src: s, dst: d }) },
  { eventType: 'bw_native_call', description: 'BytecodeWeaver: JNI native method call to libcrypto.so from com.crypto.AESEngine.encryptBlock()', protocol: 'HTTPS', severity: 'info', connector: 'BytecodeWeaver', rawDataFn: (s, d) => JSON.stringify({ engine: 'BytecodeWeaver', action: 'native_call_trace', class: 'com.crypto.AESEngine', method: 'encryptBlock', native_lib: 'libcrypto.so', call_count: 44102, avg_ns: 340, status: 'AUTHORIZED', src: s, dst: d }) },
  { eventType: 'bw_annotation_scan', description: 'BytecodeWeaver: annotation security scan - @Secured, @RolesAllowed verified on 89 controller methods', protocol: 'HTTPS', severity: 'info', connector: 'BytecodeWeaver', rawDataFn: (s, d) => JSON.stringify({ engine: 'BytecodeWeaver', action: 'annotation_scan', secured_methods: 89, missing_auth: 0, deprecated_annotations: 2, endpoints_total: 156, src: s, dst: d }) },
  { eventType: 'bw_reflection_monitor', description: 'BytecodeWeaver: reflection access to private field com.auth.SessionManager.masterKey from authorized module', protocol: 'HTTPS', severity: 'low', connector: 'BytecodeWeaver', rawDataFn: (s, d) => JSON.stringify({ engine: 'BytecodeWeaver', action: 'reflection_monitor', accessor: 'com.audit.SecurityAuditor', target_class: 'com.auth.SessionManager', target_field: 'masterKey', access_type: 'FIELD_GET', authorized: true, src: s, dst: d }) },
  { eventType: 'bw_hot_reload', description: 'BytecodeWeaver: hot class reload - com.api.v2.SearchController updated from verified build pipeline', protocol: 'HTTPS', severity: 'info', connector: 'BytecodeWeaver', rawDataFn: (s, d) => JSON.stringify({ engine: 'BytecodeWeaver', action: 'hot_reload', class: 'com.api.v2.SearchController', build_id: 'build-7842', pipeline: 'ci-main', signature: 'VALID', previous_hash: 'sha256:f8a2...', new_hash: 'sha256:b4c1...', src: s, dst: d }) },
  { eventType: 'bw_instrumentation', description: 'BytecodeWeaver: APM instrumentation injected into 47 service classes - distributed tracing enabled', protocol: 'HTTPS', severity: 'info', connector: 'BytecodeWeaver', rawDataFn: (s, d) => JSON.stringify({ engine: 'BytecodeWeaver', action: 'instrumentation', type: 'APM_TRACE', classes_instrumented: 47, trace_points: 134, overhead_pct: 0.3, tracer: 'OpenTelemetry', src: s, dst: d }) },
  { eventType: 'bw_jar_integrity', description: 'BytecodeWeaver: JAR integrity check passed - 234/234 artifacts match build manifest checksums', protocol: 'HTTPS', severity: 'info', connector: 'BytecodeWeaver', rawDataFn: (s, d) => JSON.stringify({ engine: 'BytecodeWeaver', action: 'jar_integrity_check', total_jars: 234, verified: 234, tampered: 0, missing: 0, manifest: 'build-manifest-7842.json', src: s, dst: d }) },
  // Real application protocol traffic
  { eventType: 'http_api_call', description: 'REST API call: GET /api/v2/users/profile - 200 OK - 12ms response time', protocol: 'HTTPS', severity: 'info', connector: 'WAF', rawDataFn: (s, d) => JSON.stringify({ method: 'GET', path: '/api/v2/users/profile', status: 200, latency_ms: 12, user_agent: 'Mozilla/5.0', content_type: 'application/json', src: s, dst: d }) },
  { eventType: 'http_api_call', description: 'REST API call: POST /api/v2/transactions - 201 Created - payment processed', protocol: 'HTTPS', severity: 'info', connector: 'WAF', rawDataFn: (s, d) => JSON.stringify({ method: 'POST', path: '/api/v2/transactions', status: 201, latency_ms: 234, body_size: 1024, transaction_id: 'txn_8f2a4b', src: s, dst: d }) },
  { eventType: 'graphql_query', description: 'GraphQL query: { users(first: 20) { id, name, role } } - 200 OK from internal dashboard', protocol: 'HTTPS', severity: 'info', connector: 'WAF', rawDataFn: (s, d) => JSON.stringify({ type: 'query', operation: 'GetUsers', complexity: 12, depth: 3, latency_ms: 45, src: s, dst: d }) },
  { eventType: 'grpc_call', description: 'gRPC unary call: auth.AuthService/ValidateToken - 0 OK - 3ms', protocol: 'HTTP', severity: 'info', connector: 'DPI', rawDataFn: (s, d) => JSON.stringify({ service: 'auth.AuthService', method: 'ValidateToken', grpc_status: 0, latency_ms: 3, metadata_size: 128, src: s, dst: d }) },
  { eventType: 'dns_resolution', description: 'DNS resolution: api.internal.corp -> 10.0.2.118 (A record, 2ms, cached)', protocol: 'DNS', severity: 'info', connector: 'DNS', rawDataFn: (s, d) => JSON.stringify({ query: 'api.internal.corp', type: 'A', answer: '10.0.2.118', ttl: 300, cached: true, latency_ms: 2, src: s, dst: d }) },
  { eventType: 'dns_resolution', description: 'DNS resolution: kafka-broker-3.internal.corp -> 10.100.0.15 (AAAA record)', protocol: 'DNS', severity: 'info', connector: 'DNS', rawDataFn: (s, d) => JSON.stringify({ query: 'kafka-broker-3.internal.corp', type: 'AAAA', answer: 'fd00::100:f', ttl: 60, cached: false, latency_ms: 8, src: s, dst: d }) },
  { eventType: 'smtp_send', description: 'SMTP: outbound email from alerts@soc.internal to team-leads@corp.com via relay', protocol: 'SMTP', severity: 'info', connector: 'Syslog', rawDataFn: (s, d) => JSON.stringify({ from: 'alerts@soc.internal', to: 'team-leads@corp.com', subject: 'SOC Daily Summary', size_kb: 45, tls: true, relay: 'mail-relay.internal:587', src: s, dst: d }) },
  { eventType: 'ssh_session', description: 'SSH session: admin@jump-host -> prod-db-01 via bastion - pubkey auth, session 42min', protocol: 'SSH', severity: 'info', connector: 'EDR', rawDataFn: (s, d) => JSON.stringify({ user: 'admin', src_host: 'jump-host', dst_host: 'prod-db-01', auth: 'pubkey', duration_min: 42, commands: 18, key_fingerprint: 'SHA256:nThb...', src: s, dst: d }) },
  { eventType: 'ldap_query', description: 'LDAP: search (&(objectClass=user)(memberOf=CN=SOC-Analysts)) returned 23 entries', protocol: 'LDAP', severity: 'info', connector: 'Syslog', rawDataFn: (s, d) => JSON.stringify({ operation: 'search', base_dn: 'OU=Users,DC=corp,DC=com', filter: '(&(objectClass=user)(memberOf=CN=SOC-Analysts))', results: 23, latency_ms: 15, src: s, dst: d }) },
  { eventType: 'kafka_produce', description: 'Kafka produce: 4,521 messages/sec to topic security.events.raw - partition 12', protocol: 'HTTPS', severity: 'info', connector: 'Syslog', rawDataFn: (s, d) => JSON.stringify({ topic: 'security.events.raw', partition: 12, messages_per_sec: 4521, avg_msg_size: 892, lag: 0, broker: 'kafka-broker-3', src: s, dst: d }) },
  { eventType: 'redis_op', description: 'Redis: GET session:usr_8f2a4b - 0.3ms - cache HIT for auth token validation', protocol: 'HTTPS', severity: 'info', connector: 'DPI', rawDataFn: (s, d) => JSON.stringify({ operation: 'GET', key: 'session:usr_8f2a4b', result: 'HIT', latency_us: 300, db: 0, memory_used_mb: 2048, src: s, dst: d }) },
  { eventType: 'postgres_query', description: 'PostgreSQL: SELECT on events table - 1,247 rows returned in 34ms - query plan optimized', protocol: 'HTTPS', severity: 'info', connector: 'DPI', rawDataFn: (s, d) => JSON.stringify({ operation: 'SELECT', table: 'security_events', rows: 1247, latency_ms: 34, plan: 'Index Scan using idx_events_timestamp', db: 'siem_prod', user: 'soc_readonly', src: s, dst: d }) },
  { eventType: 'elasticsearch_search', description: 'Elasticsearch: search index=security-events-2026.04 - 2,341 hits in 67ms', protocol: 'HTTPS', severity: 'info', connector: 'Syslog', rawDataFn: (s, d) => JSON.stringify({ index: 'security-events-2026.04', query_type: 'bool', hits: 2341, took_ms: 67, shards: { total: 5, successful: 5 }, src: s, dst: d }) },
  { eventType: 'spark_job', description: 'Databricks Spark job: threat_correlation_hourly completed - 2.1M events processed in 45s', protocol: 'HTTPS', severity: 'info', connector: 'CloudTrail', rawDataFn: (s, d) => JSON.stringify({ job_name: 'threat_correlation_hourly', events_processed: 2100000, duration_sec: 45, cluster: 'soc-analytics-prod', driver_memory: '16g', executors: 8, src: s, dst: d }) },
  { eventType: 'websocket_stream', description: 'WebSocket: /ws/live-alerts - 42 active subscribers, 127 messages/min', protocol: 'HTTPS', severity: 'info', connector: 'WAF', rawDataFn: (s, d) => JSON.stringify({ path: '/ws/live-alerts', subscribers: 42, messages_per_min: 127, avg_msg_size: 512, uptime_hours: 72, src: s, dst: d }) },
  { eventType: 'oauth_token_issue', description: 'OAuth2: access token issued for client soc-dashboard, scope: read:events,read:alerts', protocol: 'HTTPS', severity: 'info', connector: 'Syslog', rawDataFn: (s, d) => JSON.stringify({ grant_type: 'client_credentials', client_id: 'soc-dashboard', scope: 'read:events read:alerts', token_type: 'Bearer', expires_in: 3600, src: s, dst: d }) },
  { eventType: 'snmp_poll', description: 'SNMP: GET sysUpTime.0 from core-switch-01 - response 42d 7h 23m', protocol: 'SNMP', severity: 'info', connector: 'NetFlow', rawDataFn: (s, d) => JSON.stringify({ operation: 'GET', oid: '1.3.6.1.2.1.1.3.0', device: 'core-switch-01', value: '42d 7h 23m', community: 'readonly', version: 'v3', src: s, dst: d }) },
  { eventType: 'ftp_transfer', description: 'SFTP: upload threat-intel-feed-20260421.csv to /data/feeds/ - 12.4MB - integrity verified', protocol: 'FTP', severity: 'info', connector: 'DPI', rawDataFn: (s, d) => JSON.stringify({ operation: 'PUT', file: 'threat-intel-feed-20260421.csv', path: '/data/feeds/', size_mb: 12.4, hash: 'sha256:e8f1a2...', user: 'feed-ingester', src: s, dst: d }) },
  { eventType: 'container_event', description: 'Kubernetes: pod soc-api-7f8d4b-xk2lm ready - image sha256:a4f2e8 verified from internal registry', protocol: 'HTTPS', severity: 'info', connector: 'CloudTrail', rawDataFn: (s, d) => JSON.stringify({ event: 'PodReady', pod: 'soc-api-7f8d4b-xk2lm', namespace: 'security', image: 'registry.internal/soc-api:3.2.1', image_hash: 'sha256:a4f2e8...', node: 'worker-03', src: s, dst: d }) },
  { eventType: 'vault_access', description: 'HashiCorp Vault: secret/data/soc/api-keys read by soc-api service account - audit logged', protocol: 'HTTPS', severity: 'low', connector: 'CloudTrail', rawDataFn: (s, d) => JSON.stringify({ operation: 'read', path: 'secret/data/soc/api-keys', auth_method: 'kubernetes', role: 'soc-api', ttl: 3600, renewable: true, src: s, dst: d }) },
];

const BENIGN_EVENTS: { layer: number; eventType: string; description: string; protocol: string; severity: OSIEvent['severity'] }[] = [
  { layer: 6, eventType: 'tls_handshake', description: 'TLS 1.3 handshake completed with valid certificate chain', protocol: 'TLS', severity: 'info' },
  { layer: 5, eventType: 'smb_session', description: 'SMB session established for authorized file share access', protocol: 'SMB', severity: 'info' },
  { layer: 5, eventType: 'rpc_call', description: 'Standard RPC call to domain controller for policy refresh', protocol: 'RPC', severity: 'info' },
  { layer: 4, eventType: 'tcp_connect', description: 'TCP three-way handshake completed to web application', protocol: 'TCP', severity: 'info' },
  { layer: 4, eventType: 'udp_stream', description: 'UDP media stream for internal video conferencing', protocol: 'UDP', severity: 'info' },
  { layer: 3, eventType: 'routing_update', description: 'OSPF routing update from authorized gateway', protocol: 'OSPF', severity: 'info' },
  { layer: 3, eventType: 'icmp_echo', description: 'ICMP echo reply from monitored server - health check', protocol: 'ICMP', severity: 'info' },
  { layer: 2, eventType: 'arp_request', description: 'Standard ARP request for gateway MAC resolution', protocol: 'Ethernet', severity: 'info' },
  { layer: 2, eventType: 'stp_bpdu', description: 'STP BPDU received from root bridge - normal topology', protocol: 'STP', severity: 'info' },
  { layer: 1, eventType: 'link_up', description: 'Physical link status change: interface eth0/12 up at 10Gbps', protocol: 'Fiber', severity: 'info' },
  { layer: 4, eventType: 'quic_stream', description: 'QUIC connection established to CDN endpoint', protocol: 'QUIC', severity: 'info' },
  { layer: 3, eventType: 'bgp_update', description: 'BGP prefix announcement from upstream provider', protocol: 'BGP', severity: 'low' },
  { layer: 6, eventType: 'compression', description: 'GZIP content encoding applied to API response payload', protocol: 'MIME', severity: 'info' },
  { layer: 2, eventType: 'lldp_frame', description: 'LLDP advertisement from switch port - normal neighbor discovery', protocol: 'LLDP', severity: 'info' },
];

const SUSPICIOUS_EVENTS: { layer: number; eventType: string; description: string; protocol: string; severity: OSIEvent['severity']; verdict: OSIEvent['verdict'] }[] = [
  { layer: 7, eventType: 'brute_force', description: 'Multiple failed SSH login attempts from single source', protocol: 'SSH', severity: 'medium', verdict: 'suspicious' },
  { layer: 7, eventType: 'port_scan', description: 'Sequential port scanning detected from external IP', protocol: 'TCP', severity: 'medium', verdict: 'suspicious' },
  { layer: 4, eventType: 'rst_storm', description: 'Unusual TCP RST packet volume from internal host', protocol: 'TCP', severity: 'medium', verdict: 'suspicious' },
  { layer: 3, eventType: 'ip_spoof', description: 'IP source address mismatch detected at border router', protocol: 'IP', severity: 'high', verdict: 'suspicious' },
  { layer: 6, eventType: 'cert_warning', description: 'Self-signed certificate presented for internal service', protocol: 'TLS', severity: 'low', verdict: 'suspicious' },
  { layer: 5, eventType: 'null_session', description: 'NetBIOS null session enumeration attempt detected', protocol: 'NetBIOS', severity: 'medium', verdict: 'suspicious' },
  { layer: 2, eventType: 'mac_flood', description: 'MAC address table overflow attempt detected on access switch', protocol: 'Ethernet', severity: 'high', verdict: 'suspicious' },
];

const RAND_IPS = [
  '10.0.1.42', '10.0.2.118', '10.0.3.7', '192.168.1.100', '192.168.5.22',
  '172.16.0.88', '172.16.3.201', '10.100.0.15', '10.200.1.44', '192.168.10.3',
  '203.0.113.45', '198.51.100.22', '45.33.32.156', '91.189.88.152', '185.199.108.153',
  '140.82.121.3', '104.16.132.229', '35.186.224.25', '54.239.28.85', '13.107.42.14',
];

const ALL_CONNECTORS_LIST: ConnectorType[] = ['DPI', 'NetFlow', 'Syslog', 'BytecodeWeaver', 'CloudTrail', 'EDR', 'CCTV', 'BadgeReader', 'Firewall', 'DNS', 'DHCP', 'WAF'];

let eventCounter = 0;

function generateOSIEvent(forceAttack = false): OSIEvent {
  eventCounter++;
  const now = new Date().toISOString();
  const srcIP = RAND_IPS[Math.floor(Math.random() * RAND_IPS.length)];
  const dstIP = RAND_IPS[Math.floor(Math.random() * RAND_IPS.length)];

  // Attack patterns (~20% of events, more when forced)
  if (forceAttack || Math.random() < 0.2) {
    const pattern = ATTACK_PATTERNS[Math.floor(Math.random() * ATTACK_PATTERNS.length)];
    const primaryLayer = pattern.layers[0];
    const evtTypeIdx = Math.floor(Math.random() * pattern.eventTypes.length);
    const layer = OSI_LAYERS.find(l => l.id === primaryLayer)!;
    const protocol = layer.protocols[Math.floor(Math.random() * layer.protocols.length)];
    const connector = pattern.tag.startsWith('BW_') ? 'BytecodeWeaver' as ConnectorType : ALL_CONNECTORS_LIST[Math.floor(Math.random() * ALL_CONNECTORS_LIST.length)];

    return {
      id: `OSI-${eventCounter.toString().padStart(5, '0')}`,
      timestamp: now,
      osiLayer: primaryLayer,
      severity: pattern.severity,
      protocol,
      sourceIP: srcIP,
      destIP: dstIP,
      port: [22, 80, 443, 445, 3389, 53, 8080, 8443, 25, 110][Math.floor(Math.random() * 10)],
      bytes: Math.floor(Math.random() * 50000) + 100,
      connector,
      eventType: pattern.eventTypes[evtTypeIdx],
      description: pattern.descriptions[evtTypeIdx],
      crossLayerLinks: pattern.layers.filter(l => l !== primaryLayer),
      verdict: pattern.verdict,
      patternTag: pattern.tag,
      rawData: JSON.stringify({
        event_type: pattern.eventTypes[evtTypeIdx],
        src: srcIP,
        dst: dstIP,
        osi_layer: primaryLayer,
        pattern: pattern.tag,
        threat_score: Math.floor(Math.random() * 40) + 60,
        indicators: pattern.layers.map(l => `L${l}`),
      }),
    };
  }

  // Suspicious events (~10%)
  if (Math.random() < 0.12) {
    const susp = SUSPICIOUS_EVENTS[Math.floor(Math.random() * SUSPICIOUS_EVENTS.length)];
    return {
      id: `OSI-${eventCounter.toString().padStart(5, '0')}`,
      timestamp: now,
      osiLayer: susp.layer,
      severity: susp.severity,
      protocol: susp.protocol,
      sourceIP: srcIP,
      destIP: dstIP,
      port: [22, 80, 443, 445, 3389, 53][Math.floor(Math.random() * 6)],
      bytes: Math.floor(Math.random() * 20000) + 50,
      connector: ALL_CONNECTORS_LIST[Math.floor(Math.random() * ALL_CONNECTORS_LIST.length)],
      eventType: susp.eventType,
      description: susp.description,
      crossLayerLinks: [],
      verdict: susp.verdict,
      patternTag: null,
      rawData: JSON.stringify({ event_type: susp.eventType, src: srcIP, dst: dstIP, layer: susp.layer }),
    };
  }

  // Application-layer (L7) rich events - ~55% of benign traffic
  if (Math.random() < 0.7) {
    const appEvt = APP_LAYER_EVENTS[Math.floor(Math.random() * APP_LAYER_EVENTS.length)];
    return {
      id: `OSI-${eventCounter.toString().padStart(5, '0')}`,
      timestamp: now,
      osiLayer: 7,
      severity: appEvt.severity,
      protocol: appEvt.protocol,
      sourceIP: srcIP,
      destIP: dstIP,
      port: [80, 443, 8080, 8443, 9092, 6379, 5432, 9200, 8500, 2181][Math.floor(Math.random() * 10)],
      bytes: Math.floor(Math.random() * 25000) + 50,
      connector: appEvt.connector,
      eventType: appEvt.eventType,
      description: appEvt.description,
      crossLayerLinks: [],
      verdict: appEvt.severity === 'medium' ? 'suspicious' : 'benign',
      patternTag: null,
      rawData: appEvt.rawDataFn(srcIP, dstIP),
    };
  }

  // Lower-layer benign traffic
  const benign = BENIGN_EVENTS[Math.floor(Math.random() * BENIGN_EVENTS.length)];
  return {
    id: `OSI-${eventCounter.toString().padStart(5, '0')}`,
    timestamp: now,
    osiLayer: benign.layer,
    severity: benign.severity,
    protocol: benign.protocol,
    sourceIP: srcIP,
    destIP: dstIP,
    port: [22, 80, 443, 53, 8080, 25, 110, 993][Math.floor(Math.random() * 8)],
    bytes: Math.floor(Math.random() * 10000) + 20,
    connector: ALL_CONNECTORS_LIST[Math.floor(Math.random() * ALL_CONNECTORS_LIST.length)],
    eventType: benign.eventType,
    description: benign.description,
    crossLayerLinks: [],
    verdict: 'benign',
    patternTag: null,
    rawData: JSON.stringify({ event_type: benign.eventType, src: srcIP, dst: dstIP, layer: benign.layer }),
  };
}

function seedToOSIEvent(seed: LiveSeed): OSIEvent {
  const verdict: OSIEvent['verdict'] = seed.verdict === 'pending' ? 'pending' : seed.verdict;
  return {
    id: seed.id,
    timestamp: seed.timestamp,
    osiLayer: seed.osiLayer,
    severity: seed.severity,
    protocol: seed.protocol,
    sourceIP: seed.sourceIP,
    destIP: seed.destIP,
    port: seed.port,
    bytes: seed.bytes,
    connector: seed.connector,
    eventType: seed.eventType,
    description: seed.resolutionReason,
    crossLayerLinks: seed.crossLayerLinks,
    verdict,
    patternTag: seed.patternTag,
    rawData: seed.rawData,
  };
}

function generateInitialEvents(count: number): OSIEvent[] {
  const events: OSIEvent[] = [];
  for (let i = 0; i < count; i++) {
    events.push(generateOSIEvent(i < 20));
  }
  return events;
}

// ---------------------------------------------------------------------------
// 3D Isometric OSI Canvas
// ---------------------------------------------------------------------------

interface LayerAnim {
  heat: number;
  pulse: number;
  threatFlash: number;
}

interface FlowParticle {
  id: number;
  fromLayer: number;
  toLayer: number;
  t: number;
  speed: number;
  color: string;
  severity: string;
  eventId: string;
  xOff: number;
}

interface CrossLink {
  fromLayer: number;
  toLayer: number;
  alpha: number;
  color: string;
  patternTag: string;
  eventId: string;
  pulse: number;
}

const SEVERITY_WEIGHT: Record<string, number> = { info: 0, low: 0.15, medium: 0.4, high: 0.7, critical: 1 };
const SEVERITY_COLORS: Record<string, string> = { info: '#06b6d4', low: '#22d3ee', medium: '#eab308', high: '#f97316', critical: '#ef4444' };

function hexToRgba(hex: string, a: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
}

function lerpColor(a: string, b: string, t: number): string {
  const ar = parseInt(a.slice(1, 3), 16), ag = parseInt(a.slice(3, 5), 16), ab = parseInt(a.slice(5, 7), 16);
  const br = parseInt(b.slice(1, 3), 16), bg = parseInt(b.slice(3, 5), 16), bb = parseInt(b.slice(5, 7), 16);
  const rr = Math.round(ar + (br - ar) * t);
  const rg = Math.round(ag + (bg - ag) * t);
  const rb = Math.round(ab + (bb - ab) * t);
  return `#${rr.toString(16).padStart(2, '0')}${rg.toString(16).padStart(2, '0')}${rb.toString(16).padStart(2, '0')}`;
}

export default function OSILayerView({
  onEventSelect,
}: {
  onEventSelect?: (event: OSIEvent | null) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animRef = useRef(0);
  const timeRef = useRef(0);
  const sizeRef = useRef({ w: 900, h: 520 });

  const [events, setEvents] = useState<OSIEvent[]>(() => generateInitialEvents(80));
  const [selectedLayer, setSelectedLayer] = useState<number | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<OSIEvent | null>(null);
  const [showLive, setShowLive] = useState(true);
  const [liveSearchQuery, setLiveSearchQuery] = useState('');
  const [liveSeverityFilter, setLiveSeverityFilter] = useState<string>('all');

  const layerAnimsRef = useRef<LayerAnim[]>(OSI_LAYERS.map(() => ({ heat: 0, pulse: 0, threatFlash: 0 })));
  const particlesRef = useRef<FlowParticle[]>([]);
  const crossLinksRef = useRef<CrossLink[]>([]);
  const hoveredLayerRef = useRef<number | null>(null);
  const mouseRef = useRef({ x: -1000, y: -1000 });
  const particleIdRef = useRef(0);

  // Layer stats computed from events
  const layerStats = useMemo(() => {
    const stats = new Map<number, { count: number; threats: number; severitySum: number }>();
    for (let i = 1; i <= 7; i++) stats.set(i, { count: 0, threats: 0, severitySum: 0 });
    for (const e of events) {
      const s = stats.get(e.osiLayer);
      if (!s) continue;
      s.count++;
      s.severitySum += SEVERITY_WEIGHT[e.severity] || 0;
      if (e.verdict === 'threat' || e.verdict === 'critical_threat') s.threats++;
    }
    return stats;
  }, [events]);

  // Subscribe to shared live stream so OSI events arrive in sync with funnel/graph/phase explorer
  const { lastBatch: liveBatch } = useLiveStream(200);

  useEffect(() => {
    if (liveBatch.length === 0) return;
    const newBatch: OSIEvent[] = liveBatch.map((seed: LiveSeed) => seedToOSIEvent(seed));
    setEvents(prev => {
      const updated = [...prev, ...newBatch];
      return updated.length > 200 ? updated.slice(updated.length - 200) : updated;
    });
  }, [liveBatch]);

  // Spawn particles for new events
  useEffect(() => {
    for (const evt of events.slice(-6)) {
      // Spawn a flow particle going down through layers
      const startLayer = 7;
      const endLayer = evt.osiLayer;
      particleIdRef.current++;
      particlesRef.current.push({
        id: particleIdRef.current,
        fromLayer: startLayer,
        toLayer: endLayer,
        t: 0,
        speed: 0.008 + Math.random() * 0.008,
        color: SEVERITY_COLORS[evt.severity] || '#06b6d4',
        severity: evt.severity,
        eventId: evt.id,
        xOff: (Math.random() - 0.5) * 0.6,
      });

      // Cross-layer links for attack patterns
      if (evt.crossLayerLinks.length > 0) {
        for (const targetLayer of evt.crossLayerLinks) {
          crossLinksRef.current.push({
            fromLayer: evt.osiLayer,
            toLayer: targetLayer,
            alpha: 1,
            color: SEVERITY_COLORS[evt.severity],
            patternTag: evt.patternTag || '',
            eventId: evt.id,
            pulse: 0,
          });
        }
      }

      // Update layer heat
      const layerIdx = OSI_LAYERS.findIndex(l => l.id === evt.osiLayer);
      if (layerIdx >= 0) {
        const anim = layerAnimsRef.current[layerIdx];
        anim.heat = Math.min(1, anim.heat + (SEVERITY_WEIGHT[evt.severity] || 0) * 0.3);
        if (evt.severity === 'critical' || evt.severity === 'high') {
          anim.threatFlash = 1;
        }
      }
    }
  }, [events]);

  // Canvas sizing
  const updateSize = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = rect.width;
    const h = 520;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    sizeRef.current = { w, h };
  }, []);

  useEffect(() => {
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, [updateSize]);

  // Isometric projection helpers
  const getLayerGeometry = useCallback((layerArrayIdx: number) => {
    const { w, h } = sizeRef.current;
    const totalLayers = 7;
    const layerHeight = 16;
    const layerGap = 50;
    const totalStackHeight = totalLayers * layerHeight + (totalLayers - 1) * layerGap;
    const startY = (h - totalStackHeight) / 2 + 30;

    const cx = w * 0.45;
    const y = startY + layerArrayIdx * (layerHeight + layerGap);
    const plateW = w * 0.42;
    const plateH = layerHeight;
    const isoAngle = 0.4;
    const skewX = plateW * 0.18;

    return { cx, y, plateW, plateH, isoAngle, skewX };
  }, []);

  const hitTestLayer = useCallback((mx: number, my: number): number | null => {
    for (let i = 0; i < 7; i++) {
      const { cx, y, plateW, plateH, skewX } = getLayerGeometry(i);
      const left = cx - plateW / 2;
      const right = cx + plateW / 2;
      const top = y - plateH / 2;
      const bottom = y + plateH / 2 + plateH * 0.5;
      // Account for isometric skew
      if (mx >= left - skewX && mx <= right + skewX && my >= top - 10 && my <= bottom + 10) {
        return i;
      }
    }
    return null;
  }, [getLayerGeometry]);

  // Mouse handlers
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    mouseRef.current = { x: mx, y: my };
    const hitLayer = hitTestLayer(mx, my);
    hoveredLayerRef.current = hitLayer;
    canvas.style.cursor = hitLayer !== null ? 'pointer' : 'default';
  }, [hitTestLayer]);

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const hitLayer = hitTestLayer(mx, my);
    if (hitLayer !== null) {
      const layerId = OSI_LAYERS[hitLayer].id;
      setSelectedLayer(prev => prev === layerId ? null : layerId);
    } else {
      setSelectedLayer(null);
    }
  }, [hitTestLayer]);

  const handleMouseLeave = useCallback(() => {
    hoveredLayerRef.current = null;
    mouseRef.current = { x: -1000, y: -1000 };
  }, []);

  // Main animation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const tick = () => {
      timeRef.current++;
      const t = timeRef.current;
      const { w, h } = sizeRef.current;
      const hovered = hoveredLayerRef.current;

      // Clear
      ctx.fillStyle = '#060a14';
      ctx.fillRect(0, 0, w, h);

      // Subtle grid
      ctx.strokeStyle = 'rgba(30, 41, 59, 0.15)';
      ctx.lineWidth = 0.5;
      for (let gx = 0; gx < w; gx += 30) {
        ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, h); ctx.stroke();
      }
      for (let gy = 0; gy < h; gy += 30) {
        ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(w, gy); ctx.stroke();
      }

      // Update layer animations
      for (let i = 0; i < 7; i++) {
        const anim = layerAnimsRef.current[i];
        anim.heat *= 0.995;
        anim.pulse = (Math.sin(t * 0.04 + i * 0.8) + 1) / 2;
        anim.threatFlash *= 0.97;
      }

      // Update particles
      const particles = particlesRef.current;
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.t += p.speed;
        if (p.t > 1.2) { particles.splice(i, 1); }
      }
      if (particles.length > 300) particles.splice(0, particles.length - 300);

      // Update cross links
      const links = crossLinksRef.current;
      for (let i = links.length - 1; i >= 0; i--) {
        links[i].alpha -= 0.004;
        links[i].pulse = (Math.sin(t * 0.06 + i) + 1) / 2;
        if (links[i].alpha <= 0) links.splice(i, 1);
      }
      if (links.length > 50) links.splice(0, links.length - 50);

      // Draw cross-layer attack links (behind layers)
      for (const link of links) {
        const fromIdx = OSI_LAYERS.findIndex(l => l.id === link.fromLayer);
        const toIdx = OSI_LAYERS.findIndex(l => l.id === link.toLayer);
        if (fromIdx < 0 || toIdx < 0) continue;

        const fromGeo = getLayerGeometry(fromIdx);
        const toGeo = getLayerGeometry(toIdx);
        const fromY = fromGeo.y;
        const toY = toGeo.y;

        // Draw wavy connection line
        const xBase = fromGeo.cx + fromGeo.plateW * 0.3;
        const alpha = link.alpha * (0.4 + link.pulse * 0.3);

        ctx.beginPath();
        ctx.moveTo(xBase, fromY);
        const steps = 20;
        for (let s = 0; s <= steps; s++) {
          const st = s / steps;
          const sy = fromY + (toY - fromY) * st;
          const wave = Math.sin(st * Math.PI * 3 + t * 0.05) * 15 * link.alpha;
          ctx.lineTo(xBase + wave, sy);
        }
        ctx.strokeStyle = hexToRgba(link.color, alpha);
        ctx.lineWidth = 2 + link.pulse;
        ctx.stroke();

        // Glow
        ctx.strokeStyle = hexToRgba(link.color, alpha * 0.3);
        ctx.lineWidth = 6 + link.pulse * 2;
        ctx.beginPath();
        ctx.moveTo(xBase, fromY);
        for (let s = 0; s <= steps; s++) {
          const st = s / steps;
          const sy = fromY + (toY - fromY) * st;
          const wave = Math.sin(st * Math.PI * 3 + t * 0.05) * 15 * link.alpha;
          ctx.lineTo(xBase + wave, sy);
        }
        ctx.stroke();

        // Pattern tag label
        if (link.patternTag && link.alpha > 0.3) {
          const midY = (fromY + toY) / 2;
          ctx.font = 'bold 9px monospace';
          ctx.textAlign = 'left';
          ctx.fillStyle = hexToRgba(link.color, link.alpha * 0.9);
          ctx.fillText(link.patternTag.replace(/_/g, ' '), xBase + 20, midY);
        }
      }

      // Draw layers (isometric 3D slabs)
      for (let i = 6; i >= 0; i--) {
        const layer = OSI_LAYERS[i];
        const anim = layerAnimsRef.current[i];
        const stats = layerStats.get(layer.id);
        const { cx, y, plateW, plateH, skewX } = getLayerGeometry(i);
        const isHovered = hovered === i;
        const isSelected = selectedLayer === layer.id;
        const halfW = plateW / 2;
        const depth = plateH * 0.6;

        // Compute dynamic color based on severity heat
        const baseColor = layer.color;
        const heatColor = lerpColor(baseColor, '#ef4444', Math.min(anim.heat, 0.8));
        const displayColor = anim.heat > 0.1 ? heatColor : baseColor;

        // Threat flash ring
        if (anim.threatFlash > 0.05) {
          const flashR = plateW * 0.55 + anim.threatFlash * 20;
          const grad = ctx.createRadialGradient(cx, y, plateW * 0.2, cx, y, flashR);
          grad.addColorStop(0, hexToRgba('#ef4444', anim.threatFlash * 0.15));
          grad.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = grad;
          ctx.fillRect(cx - flashR, y - flashR, flashR * 2, flashR * 2);
        }

        // Top face
        const topAlpha = isHovered ? 0.35 : isSelected ? 0.3 : 0.12 + anim.heat * 0.15;
        ctx.beginPath();
        ctx.moveTo(cx - halfW, y);
        ctx.lineTo(cx, y - plateH);
        ctx.lineTo(cx + halfW, y);
        ctx.lineTo(cx, y + plateH);
        ctx.closePath();
        const topGrad = ctx.createLinearGradient(cx - halfW, y, cx + halfW, y);
        topGrad.addColorStop(0, hexToRgba(displayColor, topAlpha * 0.6));
        topGrad.addColorStop(0.5, hexToRgba(displayColor, topAlpha));
        topGrad.addColorStop(1, hexToRgba(displayColor, topAlpha * 0.6));
        ctx.fillStyle = topGrad;
        ctx.fill();

        // Top face border
        ctx.strokeStyle = hexToRgba(displayColor, isHovered ? 0.7 : isSelected ? 0.6 : 0.3 + anim.pulse * 0.1);
        ctx.lineWidth = isHovered || isSelected ? 2 : 1;
        ctx.stroke();

        // Right face
        ctx.beginPath();
        ctx.moveTo(cx, y + plateH);
        ctx.lineTo(cx + halfW, y);
        ctx.lineTo(cx + halfW, y + depth);
        ctx.lineTo(cx, y + plateH + depth);
        ctx.closePath();
        ctx.fillStyle = hexToRgba(displayColor, topAlpha * 0.5);
        ctx.fill();
        ctx.strokeStyle = hexToRgba(displayColor, 0.2);
        ctx.lineWidth = 0.5;
        ctx.stroke();

        // Left face
        ctx.beginPath();
        ctx.moveTo(cx, y + plateH);
        ctx.lineTo(cx - halfW, y);
        ctx.lineTo(cx - halfW, y + depth);
        ctx.lineTo(cx, y + plateH + depth);
        ctx.closePath();
        ctx.fillStyle = hexToRgba(displayColor, topAlpha * 0.35);
        ctx.fill();
        ctx.strokeStyle = hexToRgba(displayColor, 0.15);
        ctx.lineWidth = 0.5;
        ctx.stroke();

        // Pulsing glow for active layers
        if (stats && stats.threats > 0) {
          const glowR = halfW * 0.5 + anim.pulse * 10;
          const grad = ctx.createRadialGradient(cx, y, 0, cx, y, glowR);
          grad.addColorStop(0, hexToRgba(displayColor, 0.08));
          grad.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(cx, y, glowR, 0, Math.PI * 2);
          ctx.fill();
        }

        // Scanline effect across layer
        const scanX = cx - halfW + ((t * 1.5 + i * 40) % (plateW + 20));
        if (scanX > cx - halfW && scanX < cx + halfW) {
          const scanGrad = ctx.createRadialGradient(scanX, y, 0, scanX, y, 30);
          scanGrad.addColorStop(0, hexToRgba(displayColor, 0.15));
          scanGrad.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = scanGrad;
          ctx.fillRect(scanX - 30, y - plateH - 5, 60, plateH * 2 + 10);
        }

        // Layer number badge (left side)
        const badgeX = cx - halfW - 50;
        const badgeY = y;
        ctx.beginPath();
        ctx.arc(badgeX, badgeY, 14, 0, Math.PI * 2);
        ctx.fillStyle = hexToRgba(displayColor, isHovered ? 0.25 : 0.1);
        ctx.fill();
        ctx.strokeStyle = hexToRgba(displayColor, 0.4);
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.font = 'bold 12px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = hexToRgba(displayColor, 0.95);
        ctx.fillText(`${layer.id}`, badgeX, badgeY);

        // Layer name and stats (left side)
        ctx.textAlign = 'left';
        ctx.font = 'bold 11px monospace';
        ctx.fillStyle = hexToRgba(displayColor, 0.85);
        ctx.fillText(layer.name.toUpperCase(), badgeX + 22, badgeY - 6);
        ctx.font = '9px monospace';
        ctx.fillStyle = '#64748b';
        ctx.fillText(layer.description, badgeX + 22, badgeY + 7);

        // Right-side stats
        const rStatsX = cx + halfW + 30;
        if (stats) {
          ctx.textAlign = 'left';
          ctx.font = 'bold 10px monospace';
          ctx.fillStyle = hexToRgba(displayColor, 0.8);
          ctx.fillText(`${stats.count}`, rStatsX, badgeY - 6);
          ctx.font = '9px monospace';
          ctx.fillStyle = '#475569';
          ctx.fillText('events', rStatsX + 30, badgeY - 6);

          if (stats.threats > 0) {
            ctx.fillStyle = '#ef4444';
            ctx.font = 'bold 10px monospace';
            ctx.fillText(`${stats.threats}`, rStatsX, badgeY + 7);
            ctx.font = '9px monospace';
            ctx.fillStyle = '#7f1d1d';
            ctx.fillText('threats', rStatsX + 30, badgeY + 7);
          }
        }

        // Selected indicator
        if (isSelected) {
          ctx.beginPath();
          ctx.moveTo(cx - halfW, y);
          ctx.lineTo(cx, y - plateH);
          ctx.lineTo(cx + halfW, y);
          ctx.lineTo(cx, y + plateH);
          ctx.closePath();
          ctx.strokeStyle = hexToRgba(displayColor, 0.7 + anim.pulse * 0.3);
          ctx.lineWidth = 2.5;
          ctx.setLineDash([6, 4]);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }

      // Draw flow particles
      for (const p of particles) {
        const tt = Math.min(p.t, 1);
        // Map fromLayer/toLayer to array indices
        const fromIdx = OSI_LAYERS.findIndex(l => l.id === p.fromLayer);
        const toIdx = OSI_LAYERS.findIndex(l => l.id === p.toLayer);
        if (fromIdx < 0 || toIdx < 0) continue;

        const fromGeo = getLayerGeometry(fromIdx);
        const toGeo = getLayerGeometry(toIdx);

        const px = fromGeo.cx + p.xOff * fromGeo.plateW * 0.3 + (Math.sin(tt * Math.PI * 2 + p.id) * 8);
        const py = fromGeo.y + (toGeo.y - fromGeo.y) * tt;
        const alpha = tt < 0.1 ? tt * 10 : tt > 0.9 ? (1 - tt) * 10 : 1;

        // Glow
        const glowR = 6;
        const grad = ctx.createRadialGradient(px, py, 0, px, py, glowR);
        grad.addColorStop(0, hexToRgba(p.color, alpha * 0.5));
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(px - glowR, py - glowR, glowR * 2, glowR * 2);

        // Particle dot
        ctx.beginPath();
        ctx.arc(px, py, 2, 0, Math.PI * 2);
        ctx.fillStyle = hexToRgba(p.color, alpha * 0.9);
        ctx.fill();

        // Core
        ctx.beginPath();
        ctx.arc(px, py, 0.8, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${alpha * 0.6})`;
        ctx.fill();
      }

      // Hovered layer tooltip
      if (hovered !== null) {
        const layer = OSI_LAYERS[hovered];
        const stats = layerStats.get(layer.id);
        const geo = getLayerGeometry(hovered);
        const mx = mouseRef.current.x;
        const my = mouseRef.current.y;

        const tw = 200;
        const th = 60;
        let tx = mx + 15;
        let ty = my - th / 2;
        if (tx + tw > w - 10) tx = mx - tw - 15;
        if (ty < 5) ty = 5;
        if (ty + th > h - 5) ty = h - th - 5;

        ctx.fillStyle = 'rgba(10, 14, 26, 0.95)';
        ctx.strokeStyle = hexToRgba(layer.color, 0.4);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(tx, ty, tw, th, 6);
        ctx.fill();
        ctx.stroke();

        ctx.font = 'bold 11px monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillStyle = layer.color;
        ctx.fillText(`Layer ${layer.id}: ${layer.name}`, tx + 10, ty + 8);

        ctx.font = '9px monospace';
        ctx.fillStyle = '#94a3b8';
        ctx.fillText(`${stats?.count || 0} events | ${stats?.threats || 0} threats`, tx + 10, ty + 24);

        ctx.fillStyle = '#64748b';
        ctx.fillText(`Protocols: ${layer.protocols.slice(0, 4).join(', ')}`, tx + 10, ty + 38);
      }

      // Title overlay
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      ctx.fillStyle = 'rgba(148, 163, 184, 0.4)';
      ctx.fillText('OSI MODEL / REAL-TIME THREAT VISUALIZATION', w - 15, 12);

      animRef.current = requestAnimationFrame(tick);
    };

    animRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animRef.current);
  }, [getLayerGeometry, layerStats, selectedLayer]);

  // Filtered events for live panel
  const filteredEvents = useMemo(() => {
    let list = events;
    if (selectedLayer !== null) {
      list = list.filter(e => e.osiLayer === selectedLayer || e.crossLayerLinks.includes(selectedLayer!));
    }
    if (liveSeverityFilter !== 'all') {
      list = list.filter(e => e.severity === liveSeverityFilter);
    }
    if (liveSearchQuery.trim()) {
      const q = liveSearchQuery.toLowerCase();
      list = list.filter(e =>
        e.id.toLowerCase().includes(q) ||
        e.eventType.toLowerCase().includes(q) ||
        e.sourceIP.includes(q) ||
        e.destIP.includes(q) ||
        e.protocol.toLowerCase().includes(q) ||
        (e.patternTag && e.patternTag.toLowerCase().includes(q)) ||
        e.description.toLowerCase().includes(q)
      );
    }
    return list.slice().reverse().slice(0, 80);
  }, [events, selectedLayer, liveSeverityFilter, liveSearchQuery]);

  const overallStats = useMemo(() => {
    const total = events.length;
    const threats = events.filter(e => e.verdict === 'threat' || e.verdict === 'critical_threat').length;
    const patterns = new Set(events.filter(e => e.patternTag).map(e => e.patternTag!)).size;
    const crossLinks = events.filter(e => e.crossLayerLinks.length > 0).length;
    return { total, threats, patterns, crossLinks };
  }, [events]);

  const VERDICT_ICON: Record<string, React.ReactNode> = {
    pending: <HelpCircle size={11} className="text-slate-400" />,
    benign: <CheckCircle size={11} className="text-emerald-400" />,
    suspicious: <AlertTriangle size={11} className="text-amber-400" />,
    threat: <XCircle size={11} className="text-orange-400" />,
    critical_threat: <XCircle size={11} className="text-red-400" />,
  };

  const VERDICT_COLORS_CSS: Record<string, string> = {
    pending: 'text-slate-400',
    benign: 'text-emerald-400',
    suspicious: 'text-amber-400',
    threat: 'text-orange-400',
    critical_threat: 'text-red-400',
  };

  const severityButtons: { key: string; label: string; color: string }[] = [
    { key: 'all', label: 'ALL', color: '#94a3b8' },
    { key: 'critical', label: 'CRITICAL', color: '#ef4444' },
    { key: 'high', label: 'HIGH', color: '#f97316' },
    { key: 'medium', label: 'MEDIUM', color: '#eab308' },
    { key: 'low', label: 'LOW', color: '#22d3ee' },
    { key: 'info', label: 'INFO', color: '#06b6d4' },
  ];

  return (
    <div className="w-full bg-[#060a14] border border-[#1e293b] rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-6 pt-5 pb-3 flex items-start justify-between border-b border-[#1e293b]">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
            <Layers size={16} className="text-cyan-400" />
          </div>
          <div>
            <h2 className="text-sm font-bold tracking-widest text-cyan-300 font-mono">OSI MODEL LAYER VIEW</h2>
            <p className="text-[10px] tracking-wider text-slate-500 font-mono mt-0.5">7-LAYER REAL-TIME THREAT MAPPING</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="flex items-center gap-1.5 justify-end">
              <Activity size={12} className="text-cyan-400" />
              <span className="text-lg font-bold font-mono text-cyan-300">{overallStats.total}</span>
              <span className="text-[10px] text-slate-500 font-mono">events</span>
            </div>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[10px] font-bold font-mono text-emerald-400 tracking-wider">REAL-TIME</span>
          </div>
        </div>
      </div>

      {/* Stats bar */}
      <div className="px-6 py-3 border-b border-[#1e293b] grid grid-cols-4 gap-3">
        <div className="rounded-lg bg-[#0a0e1a] border border-[#1e293b] p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <Zap size={11} className="text-cyan-400" />
            <span className="text-[9px] font-mono text-slate-500 tracking-wider">TOTAL EVENTS</span>
          </div>
          <div className="text-lg font-bold font-mono text-cyan-300">{overallStats.total}</div>
        </div>
        <div className="rounded-lg bg-[#0a0e1a] border border-[#1e293b] p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <Shield size={11} className="text-red-400" />
            <span className="text-[9px] font-mono text-slate-500 tracking-wider">ACTIVE THREATS</span>
          </div>
          <div className="text-lg font-bold font-mono text-red-400">{overallStats.threats}</div>
        </div>
        <div className="rounded-lg bg-[#0a0e1a] border border-[#1e293b] p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <AlertTriangle size={11} className="text-amber-400" />
            <span className="text-[9px] font-mono text-slate-500 tracking-wider">ATTACK PATTERNS</span>
          </div>
          <div className="text-lg font-bold font-mono text-amber-300">{overallStats.patterns}</div>
        </div>
        <div className="rounded-lg bg-[#0a0e1a] border border-[#1e293b] p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <Activity size={11} className="text-orange-400" />
            <span className="text-[9px] font-mono text-slate-500 tracking-wider">CROSS-LAYER</span>
          </div>
          <div className="text-lg font-bold font-mono text-orange-300">{overallStats.crossLinks}</div>
        </div>
      </div>

      {/* Layer filter indicator */}
      {selectedLayer !== null && (
        <div className="px-6 py-2 border-b border-[#1e293b] flex items-center gap-2 bg-[#0a0e1a]">
          <Eye size={12} className="text-cyan-400" />
          <span className="text-[10px] font-mono text-cyan-400">
            Filtering by Layer {selectedLayer}: {OSI_LAYERS.find(l => l.id === selectedLayer)?.name}
          </span>
          <button
            onClick={() => setSelectedLayer(null)}
            className="ml-2 flex items-center gap-1 px-2 py-0.5 rounded bg-slate-700/30 text-slate-400 text-[10px] font-mono hover:text-slate-200 transition-colors"
          >
            <EyeOff size={10} /> Clear
          </button>
        </div>
      )}

      {/* Canvas */}
      <div ref={containerRef} className="relative" style={{ height: 520 }}>
        <canvas
          ref={canvasRef}
          className="w-full"
          style={{ height: 520 }}
          onMouseMove={handleMouseMove}
          onClick={handleClick}
          onMouseLeave={handleMouseLeave}
        />
      </div>

      {/* Layer summary grid */}
      <div className="px-6 py-3 border-t border-[#1e293b]">
        <div className="grid grid-cols-7 gap-1.5">
          {OSI_LAYERS.map((layer) => {
            const stats = layerStats.get(layer.id);
            const isActive = selectedLayer === layer.id;
            return (
              <button
                key={layer.id}
                onClick={() => setSelectedLayer(isActive ? null : layer.id)}
                className={`rounded-lg border p-2 text-left transition-all duration-200 ${
                  isActive
                    ? 'border-opacity-50'
                    : 'border-[#1e293b] hover:border-slate-600'
                }`}
                style={isActive ? {
                  backgroundColor: hexToRgba(layer.color, 0.08),
                  borderColor: hexToRgba(layer.color, 0.4),
                } : { backgroundColor: 'rgba(15, 22, 41, 0.5)' }}
              >
                <div className="flex items-center gap-1 mb-1">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: layer.color }} />
                  <span className="text-[9px] font-mono font-bold tracking-wider" style={{ color: layer.color }}>
                    L{layer.id}
                  </span>
                </div>
                <div className="text-[8px] font-mono text-slate-400 truncate">{layer.name}</div>
                <div className="text-[10px] font-mono text-slate-300 font-bold mt-0.5">{stats?.count || 0}</div>
                {(stats?.threats || 0) > 0 && (
                  <div className="text-[9px] font-mono text-red-400 mt-0.5">{stats!.threats} threats</div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Live events */}
      <div className="border-t border-[#1e293b]">
        <button
          onClick={() => setShowLive(prev => !prev)}
          className="w-full px-6 py-3 flex items-center justify-between hover:bg-white/[0.02] transition-colors"
        >
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 rounded bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
              <Radio size={12} className="text-cyan-400" />
            </div>
            <span className="text-xs font-bold tracking-widest text-cyan-300 font-mono">LIVE OSI EVENTS</span>
            <span className="text-[10px] font-mono text-slate-500 ml-1">{filteredEvents.length} events</span>
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[9px] font-bold font-mono text-emerald-400 tracking-wider">STREAMING</span>
            </span>
          </div>
          {showLive ? <ChevronUp size={14} className="text-slate-500" /> : <ChevronDown size={14} className="text-slate-500" />}
        </button>

        {showLive && (
          <div className="px-6 pb-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="relative flex-1 max-w-xs">
                <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  value={liveSearchQuery}
                  onChange={e => setLiveSearchQuery(e.target.value)}
                  placeholder="Search events, IPs, protocols, patterns..."
                  className="w-full pl-8 pr-3 py-1.5 rounded bg-[#0a0e1a] border border-[#1e293b] text-[11px] font-mono text-slate-300 placeholder:text-slate-600 focus:outline-none focus:border-cyan-500/40 transition-colors"
                />
              </div>
              <div className="flex items-center gap-1">
                {severityButtons.map(sb => (
                  <button
                    key={sb.key}
                    onClick={() => setLiveSeverityFilter(sb.key)}
                    className="px-2 py-1 rounded text-[9px] font-mono font-bold tracking-wider border transition-all duration-200"
                    style={liveSeverityFilter === sb.key ? {
                      backgroundColor: hexToRgba(sb.color, 0.12),
                      color: sb.color,
                      borderColor: hexToRgba(sb.color, 0.4),
                    } : {
                      backgroundColor: 'transparent',
                      color: '#475569',
                      borderColor: '#1e293b',
                    }}
                  >
                    {sb.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-[#1e293b] overflow-hidden">
              <div className="grid grid-cols-[50px_50px_90px_80px_100px_1fr_90px_90px] gap-0 text-[9px] font-mono font-bold tracking-wider text-slate-500 bg-[#0a0e1a] border-b border-[#1e293b]">
                <div className="px-2 py-2">ID</div>
                <div className="px-2 py-2">LAYER</div>
                <div className="px-2 py-2">PROTOCOL</div>
                <div className="px-2 py-2">TYPE</div>
                <div className="px-2 py-2">SOURCE/DEST</div>
                <div className="px-2 py-2">DESCRIPTION</div>
                <div className="px-2 py-2">PATTERN</div>
                <div className="px-2 py-2">VERDICT</div>
              </div>

              <div className="max-h-[350px] overflow-y-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: '#1e293b #0a0e1a' }}>
                {filteredEvents.length === 0 ? (
                  <div className="px-6 py-10 text-center">
                    <FileText size={20} className="mx-auto mb-2 text-slate-600" />
                    <p className="text-xs font-mono text-slate-500">No events match current filters</p>
                  </div>
                ) : (
                  filteredEvents.map((evt, idx) => {
                    const layer = OSI_LAYERS.find(l => l.id === evt.osiLayer);
                    const isSelected = selectedEvent?.id === evt.id;
                    return (
                      <React.Fragment key={evt.id + idx}>
                        <button
                          onClick={() => {
                            const next = isSelected ? null : evt;
                            setSelectedEvent(next);
                            if (onEventSelect) onEventSelect(next);
                          }}
                          className="w-full grid grid-cols-[50px_50px_90px_80px_100px_1fr_90px_90px] gap-0 text-[10px] font-mono text-left transition-all duration-150 hover:bg-white/[0.03]"
                          style={{
                            backgroundColor: isSelected
                              ? hexToRgba(layer?.color || '#0ea5e9', 0.06)
                              : idx % 2 === 0 ? 'transparent' : 'rgba(15, 22, 41, 0.3)',
                            borderLeft: isSelected ? `2px solid ${layer?.color || '#0ea5e9'}` : '2px solid transparent',
                          }}
                        >
                          <div className="px-2 py-2 text-slate-400 truncate">{evt.id.replace('OSI-', '')}</div>
                          <div className="px-2 py-2">
                            <span
                              className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold border"
                              style={{
                                backgroundColor: hexToRgba(layer?.color || '#06b6d4', 0.1),
                                color: layer?.color || '#06b6d4',
                                borderColor: hexToRgba(layer?.color || '#06b6d4', 0.3),
                              }}
                            >
                              L{evt.osiLayer}
                            </span>
                          </div>
                          <div className="px-2 py-2 text-slate-300">{evt.protocol}</div>
                          <div className="px-2 py-2 text-slate-400 truncate">{evt.eventType}</div>
                          <div className="px-2 py-2 text-slate-500 truncate">
                            <span className="text-slate-400">{evt.sourceIP.split('.').slice(-2).join('.')}</span>
                            <span className="text-slate-600 mx-0.5">{'\u2192'}</span>
                            <span className="text-slate-400">{evt.destIP.split('.').slice(-2).join('.')}</span>
                          </div>
                          <div className="px-2 py-2 text-slate-500 truncate">{evt.description}</div>
                          <div className="px-2 py-2">
                            {evt.patternTag ? (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-red-500/10 text-red-400 border border-red-500/20">
                                {evt.patternTag.replace(/_/g, ' ')}
                              </span>
                            ) : (
                              <span className="text-slate-600">--</span>
                            )}
                          </div>
                          <div className="px-2 py-2">
                            <span className="inline-flex items-center gap-1">
                              {VERDICT_ICON[evt.verdict]}
                              <span className={`text-[9px] font-bold ${VERDICT_COLORS_CSS[evt.verdict]}`}>
                                {evt.verdict.replace('_', ' ').toUpperCase()}
                              </span>
                            </span>
                          </div>
                        </button>

                        {isSelected && (
                          <div
                            className="border-t border-b px-4 py-3"
                            style={{
                              backgroundColor: hexToRgba(layer?.color || '#0ea5e9', 0.04),
                              borderColor: hexToRgba(layer?.color || '#0ea5e9', 0.15),
                            }}
                          >
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <div className="text-[9px] font-mono font-bold tracking-wider text-slate-500 mb-1.5">EVENT DETAIL</div>
                                <p className="text-[11px] font-mono text-slate-300 leading-relaxed mb-2">{evt.description}</p>
                                <div className="flex items-center gap-4 text-[10px] font-mono flex-wrap">
                                  <div>
                                    <span className="text-slate-500">Severity: </span>
                                    <span className="font-bold" style={{ color: SEVERITY_COLORS[evt.severity] }}>{evt.severity.toUpperCase()}</span>
                                  </div>
                                  <div>
                                    <span className="text-slate-500">Protocol: </span>
                                    <span className="text-slate-300">{evt.protocol}:{evt.port}</span>
                                  </div>
                                  <div>
                                    <span className="text-slate-500">Bytes: </span>
                                    <span className="text-slate-300">{evt.bytes.toLocaleString()}</span>
                                  </div>
                                  <div>
                                    <span className="text-slate-500">Flow: </span>
                                    <span className="text-slate-300">{evt.sourceIP}</span>
                                    <ArrowRight size={10} className="inline mx-1 text-slate-600" />
                                    <span className="text-slate-300">{evt.destIP}</span>
                                  </div>
                                </div>
                              </div>
                              <div>
                                <div className="text-[9px] font-mono font-bold tracking-wider text-slate-500 mb-1.5">OSI LAYER IMPACT</div>
                                <div className="flex flex-wrap gap-1 mb-2">
                                  {OSI_LAYERS.map(l => {
                                    const isPrimary = l.id === evt.osiLayer;
                                    const isLinked = evt.crossLayerLinks.includes(l.id);
                                    return (
                                      <div
                                        key={l.id}
                                        className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[8px] font-mono font-bold border"
                                        style={{
                                          backgroundColor: isPrimary
                                            ? hexToRgba(l.color, 0.2)
                                            : isLinked
                                              ? hexToRgba(l.color, 0.1)
                                              : 'transparent',
                                          borderColor: isPrimary
                                            ? hexToRgba(l.color, 0.5)
                                            : isLinked
                                              ? hexToRgba(l.color, 0.3)
                                              : '#1e293b',
                                          color: isPrimary || isLinked ? l.color : '#334155',
                                        }}
                                      >
                                        L{l.id} {l.shortName}
                                        {isPrimary && <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: l.color }} />}
                                        {isLinked && <Zap size={8} />}
                                      </div>
                                    );
                                  })}
                                </div>
                                <div className="rounded border border-[#1e293b] p-2 max-h-[70px] overflow-auto" style={{ backgroundColor: 'rgba(10, 14, 26, 0.8)' }}>
                                  <pre className="text-[9px] font-mono text-slate-400 whitespace-pre-wrap break-all">{evt.rawData}</pre>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
