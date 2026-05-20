/*
  # Connector Version Agent & Vibe Code Builder System

  1. New Tables
    - `connector_version_checks` - Agent's version monitoring results
      - `id` (uuid, primary key)
      - `connector_id` (text) - which connector was checked
      - `connector_name` (text)
      - `current_version` (text) - version we support
      - `latest_version` (text) - latest discovered version
      - `version_behind` (integer) - how many versions behind
      - `changelog_summary` (text) - AI-generated summary of changes
      - `log_schema_changes` (jsonb) - detected schema diffs
      - `parser_update_required` (boolean)
      - `parser_patch` (jsonb) - suggested parser modifications
      - `auto_applied` (boolean) - was patch auto-applied
      - `status` (text) - checked/outdated/updated/failed
      - `checked_at` (timestamptz)

    - `connector_builder_projects` - Vibe-coded connector projects
      - `id` (uuid, primary key)
      - `name` (text) - connector name
      - `vendor` (text) - vendor name
      - `description` (text)
      - `acquisition_method` (text) - how data is acquired
      - `transport_protocol` (text) - how data is transported
      - `log_format` (text) - format of log data
      - `normalization_schema` (text) - target schema
      - `generated_code` (text) - the generated connector code
      - `parser_code` (text) - the generated parser
      - `test_status` (text)
      - `deployment_status` (text)
      - `created_by` (uuid)
      - `created_at` (timestamptz)

    - `acquisition_methods` - Catalog of all acquisition methods
      - `id` (uuid, primary key)
      - `name` (text)
      - `category` (text)
      - `description` (text)
      - `protocol_details` (jsonb)
      - `use_cases` (text[])
      - `complexity` (text)

    - `transport_protocols` - Catalog of all transport mechanisms
      - `id` (uuid, primary key)
      - `name` (text)
      - `category` (text)
      - `description` (text)
      - `port_default` (integer)
      - `encryption_support` (boolean)
      - `bidirectional` (boolean)
      - `use_cases` (text[])

  2. Security
    - Enable RLS on all tables
    - Authenticated users can read and write
*/

-- Connector Version Checks
CREATE TABLE IF NOT EXISTS connector_version_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connector_id text NOT NULL,
  connector_name text NOT NULL,
  vendor text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT '',
  current_version text NOT NULL,
  latest_version text NOT NULL,
  version_behind integer DEFAULT 0,
  changelog_summary text DEFAULT '',
  log_schema_changes jsonb DEFAULT '[]'::jsonb,
  parser_update_required boolean DEFAULT false,
  parser_patch jsonb DEFAULT '{}'::jsonb,
  auto_applied boolean DEFAULT false,
  status text NOT NULL DEFAULT 'checked',
  severity text DEFAULT 'info',
  checked_at timestamptz DEFAULT now()
);

ALTER TABLE connector_version_checks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read connector versions"
  ON connector_version_checks FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated insert connector versions"
  ON connector_version_checks FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- Connector Builder Projects
CREATE TABLE IF NOT EXISTS connector_builder_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  vendor text NOT NULL DEFAULT '',
  description text DEFAULT '',
  acquisition_method text NOT NULL,
  transport_protocol text NOT NULL,
  log_format text NOT NULL DEFAULT 'json',
  normalization_schema text DEFAULT 'ocsf',
  sample_log text DEFAULT '',
  generated_code text DEFAULT '',
  parser_code text DEFAULT '',
  test_status text DEFAULT 'pending',
  test_results jsonb DEFAULT '{}'::jsonb,
  deployment_status text DEFAULT 'draft',
  created_by uuid,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE connector_builder_projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read builder projects"
  ON connector_builder_projects FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated insert builder projects"
  ON connector_builder_projects FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated update builder projects"
  ON connector_builder_projects FOR UPDATE
  TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- Acquisition Methods Catalog
CREATE TABLE IF NOT EXISTS acquisition_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category text NOT NULL,
  description text NOT NULL DEFAULT '',
  protocol_details jsonb DEFAULT '{}'::jsonb,
  use_cases text[] DEFAULT '{}',
  complexity text DEFAULT 'medium',
  icon_hint text DEFAULT 'database'
);

ALTER TABLE acquisition_methods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read acquisition methods"
  ON acquisition_methods FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

-- Transport Protocols Catalog
CREATE TABLE IF NOT EXISTS transport_protocols (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category text NOT NULL,
  description text NOT NULL DEFAULT '',
  port_default integer DEFAULT 0,
  encryption_support boolean DEFAULT false,
  bidirectional boolean DEFAULT false,
  reliability text DEFAULT 'at-least-once',
  use_cases text[] DEFAULT '{}',
  icon_hint text DEFAULT 'network'
);

ALTER TABLE transport_protocols ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read transport protocols"
  ON transport_protocols FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_version_checks_connector ON connector_version_checks(connector_id);
CREATE INDEX IF NOT EXISTS idx_version_checks_status ON connector_version_checks(status);
CREATE INDEX IF NOT EXISTS idx_builder_projects_status ON connector_builder_projects(deployment_status);
CREATE INDEX IF NOT EXISTS idx_acquisition_category ON acquisition_methods(category);
CREATE INDEX IF NOT EXISTS idx_transport_category ON transport_protocols(category);

-- Seed Acquisition Methods (comprehensive catalog)
INSERT INTO acquisition_methods (name, category, description, protocol_details, use_cases, complexity, icon_hint) VALUES
-- API-Based
('REST API Polling', 'api', 'Periodically pull data via HTTP REST endpoints with pagination support', '{"method":"GET/POST","auth":["api_key","oauth2","bearer"],"pagination":["cursor","offset","link_header"]}', ARRAY['Cloud services', 'SaaS platforms', 'Vendor APIs'], 'low', 'globe'),
('REST API Webhook', 'api', 'Receive push notifications via HTTP callbacks when events occur', '{"method":"POST","auth":["hmac_signature","shared_secret","mtls"],"delivery":"push"}', ARRAY['Real-time alerts', 'Event-driven ingestion', 'SaaS integrations'], 'low', 'webhook'),
('GraphQL Subscription', 'api', 'Subscribe to real-time data streams via GraphQL subscriptions over WebSocket', '{"method":"SUBSCRIBE","transport":"websocket","auth":["bearer","api_key"]}', ARRAY['GitHub', 'Hasura', 'Apollo-based services'], 'medium', 'git-branch'),
('gRPC Streaming', 'api', 'Bidirectional streaming via Protocol Buffers over HTTP/2', '{"method":"stream","serialization":"protobuf","auth":["mtls","token"],"http_version":"2"}', ARRAY['Google Cloud', 'Envoy', 'Istio', 'Internal microservices'], 'high', 'zap'),
('SOAP/XML Web Service', 'api', 'Legacy XML-based web service integration via WSDL contracts', '{"method":"POST","serialization":"xml","auth":["ws_security","basic"],"envelope":"soap"}', ARRAY['Legacy enterprise systems', 'SAP', 'Oracle EBS'], 'medium', 'file-text'),
('OData Feed', 'api', 'Query data via Open Data Protocol with filtering and expansion', '{"method":"GET","serialization":"json/xml","auth":["oauth2","basic"],"query":"$filter,$expand,$select"}', ARRAY['Microsoft 365', 'Dynamics', 'SharePoint'], 'medium', 'database'),

-- Agent-Based
('Lightweight Agent', 'agent', 'Deploy a lightweight collection agent on target hosts for log forwarding', '{"deployment":"binary/container","footprint":"<50MB RAM","protocols":["tcp","udp"],"buffer":"local_disk"}', ARRAY['Endpoint logs', 'Application logs', 'System metrics'], 'medium', 'cpu'),
('Sidecar Container', 'agent', 'Deploy as Kubernetes sidecar for pod-level log collection', '{"deployment":"k8s_sidecar","footprint":"<30MB RAM","output":["stdout","fluentd","otel"]}', ARRAY['Kubernetes workloads', 'Microservices', 'Service mesh'], 'medium', 'container'),
('Fleet-Managed Agent', 'agent', 'Centrally managed agent fleet with remote configuration and update', '{"deployment":"fleet_server","management":"central","update":"ota","config":"remote_policy"}', ARRAY['Large-scale endpoint collection', 'Elastic Agent', 'Cribl Edge'], 'high', 'users'),
('eBPF Kernel Probe', 'agent', 'Attach eBPF programs to kernel events for zero-overhead tracing', '{"deployment":"kernel_module","privilege":"root","overhead":"<2%","events":["syscall","network","file"]}', ARRAY['Linux system calls', 'Network tracing', 'Security monitoring', 'Container runtime'], 'high', 'terminal'),
('ETW Provider', 'agent', 'Subscribe to Windows Event Tracing for Windows kernel and application events', '{"deployment":"service","os":"windows","events":["kernel","application","security"],"format":"etl/evtx"}', ARRAY['Windows security events', 'Process creation', 'Registry changes', 'Network activity'], 'high', 'monitor'),
('WMI/CIM Collector', 'agent', 'Query Windows Management Instrumentation for system and application data', '{"deployment":"remote/local","protocol":"dcom/winrm","query":"wql","namespace":"root/cimv2"}', ARRAY['Windows system inventory', 'Process monitoring', 'Service status'], 'medium', 'server'),

-- Network-Based
('Packet Capture (PCAP)', 'network', 'Full packet capture via network TAPs or SPAN ports for deep inspection', '{"interface":"tap/span","depth":"full_payload","format":"pcap/pcapng","storage":"high"}', ARRAY['Network forensics', 'DPI', 'Malware analysis', 'Protocol analysis'], 'high', 'radio'),
('NetFlow/IPFIX', 'network', 'Collect network flow metadata (src/dst/ports/bytes) from routers and switches', '{"versions":["v5","v9","ipfix"],"transport":"udp","port":2055,"sampling":"1:100-1:1000"}', ARRAY['Traffic analysis', 'Anomaly detection', 'Bandwidth monitoring', 'Lateral movement'], 'medium', 'activity'),
('sFlow', 'network', 'Statistical sampling of network packets and interface counters', '{"transport":"udp","port":6343,"sampling":"packet_header+counters","standard":"RFC3176"}', ARRAY['High-speed network monitoring', 'Traffic classification', 'DDoS detection'], 'medium', 'bar-chart'),
('DNS Passive Collection', 'network', 'Passively observe and log all DNS queries and responses on the network', '{"capture":"passive_tap","port":53,"protocols":["udp","tcp","doh","dot"],"format":"dnstap"}', ARRAY['DNS tunneling detection', 'Domain reputation', 'C2 communication', 'Data exfiltration'], 'medium', 'globe'),
('Network TAP (Hardware)', 'network', 'Physical inline TAP devices for lossless traffic mirroring', '{"type":"hardware","mode":"inline/passive","speed":"1G-100G","loss":"zero_packet_loss"}', ARRAY['Regulated environments', 'Air-gapped networks', 'Critical infrastructure'], 'high', 'hard-drive'),
('SPAN/Mirror Port', 'network', 'Switch-based port mirroring for traffic duplication to analysis tools', '{"type":"switch_config","mode":"local/remote_span","limitation":"oversubscription_possible"}', ARRAY['Quick deployment', 'Lab environments', 'Non-inline monitoring'], 'low', 'copy'),

-- File-Based
('File Tail (inotify)', 'file', 'Watch and tail log files in real-time using filesystem notifications', '{"mechanism":"inotify/kqueue/fswatch","rotation":"handle_rename","encoding":"utf8/utf16"}', ARRAY['Application logs', 'System logs', 'Custom application output'], 'low', 'file-text'),
('Directory Watcher', 'file', 'Monitor directories for new files and process them as they appear', '{"mechanism":"polling/notify","patterns":"glob","processing":"batch/streaming"}', ARRAY['Batch log drops', 'Scheduled exports', 'Legacy systems'], 'low', 'folder'),
('Cloud Object Storage', 'file', 'Read logs from S3, GCS, Azure Blob via event notifications or polling', '{"services":["s3","gcs","azure_blob","minio"],"trigger":"event_notification/polling","format":"gzip/parquet/json"}', ARRAY['CloudTrail', 'VPC Flow Logs', 'CDN logs', 'Application archives'], 'medium', 'cloud'),
('HDFS/Data Lake', 'file', 'Read from Hadoop Distributed File System or Delta Lake tables', '{"services":["hdfs","delta_lake","iceberg","hudi"],"format":"parquet/orc/avro","partition":"time/key"}', ARRAY['Big data analytics', 'Historical analysis', 'Data warehouse integration'], 'high', 'database'),
('Windows Event Log', 'file', 'Read Windows Event Logs via WEF, WEC, or direct evtx file parsing', '{"format":"evtx","channels":["Security","System","Application","Sysmon"],"collection":"wef/direct"}', ARRAY['Windows security', 'Active Directory', 'Authentication events'], 'medium', 'shield'),

-- Database-Based
('JDBC/ODBC Query', 'database', 'Poll relational databases via SQL queries for audit logs and change data', '{"drivers":["jdbc","odbc"],"databases":["oracle","mssql","postgres","mysql"],"mode":"polling/cdc"}', ARRAY['Database audit logs', 'Application tables', 'Legacy systems'], 'medium', 'database'),
('Change Data Capture (CDC)', 'database', 'Stream database changes in real-time via transaction log reading', '{"mechanisms":["debezium","oracle_logminer","pg_logical","mysql_binlog"],"output":"kafka/direct"}', ARRAY['Real-time database monitoring', 'Audit compliance', 'Data synchronization'], 'high', 'git-commit'),
('MongoDB Oplog', 'database', 'Tail MongoDB operations log for real-time change streaming', '{"mechanism":"oplog/change_streams","output":"json","filtering":"namespace/operation"}', ARRAY['NoSQL audit', 'Application change tracking', 'Real-time analytics'], 'medium', 'layers'),

-- Bytecode/Runtime
('Java Agent (JVMTI)', 'bytecode', 'Inject into JVM via agent instrumentation for application-level tracing', '{"mechanism":"javaagent/jvmti","overhead":"3-8%","data":["method_calls","exceptions","sql","http"]}', ARRAY['APM', 'Application security', 'SQL injection detection', 'RASP'], 'high', 'code'),
('.NET CLR Profiler', 'bytecode', 'Instrument .NET runtime via CLR profiling APIs for deep application visibility', '{"mechanism":"clr_profiler/diagnostics_port","overhead":"2-5%","data":["exceptions","gc","http","sql"]}', ARRAY['.NET application monitoring', 'Security instrumentation', 'Performance profiling'], 'high', 'code'),
('Python AST Hooks', 'bytecode', 'Runtime instrumentation of Python code via import hooks and AST transformation', '{"mechanism":"import_hooks/ast_rewrite/monkey_patch","overhead":"5-15%","data":["function_calls","io","network"]}', ARRAY['Python application security', 'Data flow tracking', 'IAST'], 'medium', 'terminal'),
('WASM Inspector', 'bytecode', 'Inspect WebAssembly modules for security analysis and runtime monitoring', '{"mechanism":"wasm_instrumentation","target":"browser/server","data":["memory_access","function_calls"]}', ARRAY['WebAssembly security', 'Browser-based analysis', 'Serverless WASM'], 'high', 'cpu'),

-- Message Queue
('Kafka Consumer', 'message_queue', 'Consume events from Apache Kafka topics with consumer group management', '{"protocol":"kafka","serialization":["avro","json","protobuf"],"delivery":"at-least-once","offset":"committed"}', ARRAY['Event streaming', 'Microservice events', 'High-throughput ingestion'], 'medium', 'layers'),
('AMQP/RabbitMQ', 'message_queue', 'Consume messages from AMQP-compatible brokers with acknowledgment', '{"protocol":"amqp_0.9.1","exchanges":["direct","topic","fanout"],"delivery":"at-least-once"}', ARRAY['Enterprise messaging', 'Task queues', 'Event routing'], 'medium', 'mail'),
('MQTT Subscriber', 'message_queue', 'Subscribe to IoT/MQTT topics for device telemetry and alerts', '{"protocol":"mqtt_3.1.1/5.0","qos":[0,1,2],"topics":"wildcard_support","tls":true}', ARRAY['IoT devices', 'OT/ICS telemetry', 'Sensor data', 'Edge computing'], 'low', 'radio'),
('NATS/JetStream', 'message_queue', 'Ultra-fast messaging with JetStream persistence for event replay', '{"protocol":"nats","persistence":"jetstream","delivery":"at-least-once/exactly-once","latency":"<1ms"}', ARRAY['Cloud-native apps', 'Edge messaging', 'Microservices'], 'medium', 'zap'),
('AWS SQS/SNS', 'message_queue', 'Poll AWS SQS queues or receive SNS notifications for event ingestion', '{"service":"sqs/sns","delivery":"at-least-once","visibility_timeout":true,"dlq":true}', ARRAY['AWS event processing', 'Lambda triggers', 'Cross-account events'], 'low', 'cloud'),
('Azure Event Hub', 'message_queue', 'Stream millions of events/sec from Azure Event Hubs with partition management', '{"service":"event_hubs","protocol":"amqp","partitions":"2-32","retention":"1-90_days"}', ARRAY['Azure telemetry', 'IoT Hub', 'Application events', 'Diagnostic logs'], 'medium', 'cloud'),
('Google Pub/Sub', 'message_queue', 'Subscribe to Google Cloud Pub/Sub topics for event-driven ingestion', '{"service":"pubsub","delivery":"at-least-once","ordering":"optional","dlq":"supported"}', ARRAY['GCP events', 'Cloud Functions', 'Dataflow triggers'], 'low', 'cloud'),

-- Specialized
('SNMP Trap Receiver', 'specialized', 'Receive SNMP traps and informs from network devices and infrastructure', '{"versions":["v2c","v3"],"port":162,"auth":"community/usm","format":"oid_value_pairs"}', ARRAY['Network devices', 'UPS systems', 'Environmental sensors', 'Legacy infrastructure'], 'medium', 'radio'),
('JMX/MBeans', 'specialized', 'Query Java Management Extensions for JVM and application metrics', '{"protocol":"jmx/rmi","port":9010,"auth":"jmxremote","data":["heap","threads","custom_mbeans"]}', ARRAY['Java application monitoring', 'Middleware', 'Application servers'], 'medium', 'gauge'),
('IPMI/BMC', 'specialized', 'Read hardware events from Baseboard Management Controllers', '{"protocol":"ipmi","port":623,"auth":"user/operator/admin","data":["sel","sdr","fru"]}', ARRAY['Hardware health', 'Data center monitoring', 'Bare-metal servers'], 'high', 'hard-drive'),
('Syslog Receiver', 'specialized', 'Receive syslog messages via UDP/TCP/TLS with RFC 3164/5424 parsing', '{"protocol":"syslog","ports":[514,6514],"formats":["rfc3164","rfc5424"],"tls":"6514"}', ARRAY['Network devices', 'Linux systems', 'Firewalls', 'Universal log source'], 'low', 'terminal'),
('CEF/LEEF Receiver', 'specialized', 'Parse Common Event Format and Log Event Extended Format messages', '{"format":"cef/leef","transport":"syslog","standard":"ArcSight/QRadar","parsing":"pipe_delimited"}', ARRAY['Security devices', 'SIEM integration', 'Normalized events'], 'low', 'shield'),
('OpenTelemetry (OTLP)', 'specialized', 'Receive traces, metrics and logs via OpenTelemetry protocol', '{"protocol":"otlp","transport":["grpc","http"],"signals":["traces","metrics","logs"],"port":4317}', ARRAY['Cloud-native observability', 'Distributed tracing', 'Microservice metrics'], 'medium', 'activity');

-- Seed Transport Protocols (comprehensive catalog)
INSERT INTO transport_protocols (name, category, description, port_default, encryption_support, bidirectional, reliability, use_cases, icon_hint) VALUES
-- Network Transport
('TCP Socket', 'network', 'Reliable ordered byte stream over TCP with connection management', 514, true, true, 'guaranteed', ARRAY['Syslog TLS', 'Custom protocols', 'Reliable delivery'], 'network'),
('UDP Datagram', 'network', 'Connectionless unreliable datagram delivery for high-throughput scenarios', 514, false, false, 'best-effort', ARRAY['Syslog', 'NetFlow', 'SNMP traps', 'High-volume telemetry'], 'radio'),
('TLS/mTLS', 'network', 'Encrypted transport with mutual certificate authentication', 6514, true, true, 'guaranteed', ARRAY['Secure syslog', 'Zero-trust', 'Compliance environments'], 'lock'),
('WebSocket', 'network', 'Full-duplex communication over single TCP connection with framing', 443, true, true, 'guaranteed', ARRAY['Real-time streaming', 'Browser-to-server', 'Live dashboards'], 'globe'),
('QUIC/HTTP3', 'network', 'UDP-based multiplexed transport with built-in encryption and zero-RTT', 443, true, true, 'guaranteed', ARRAY['Modern cloud services', 'Mobile networks', 'CDN logs'], 'zap'),

-- File Transfer
('SFTP', 'file_transfer', 'SSH File Transfer Protocol for encrypted file-based log delivery', 22, true, true, 'guaranteed', ARRAY['Batch file delivery', 'Legacy systems', 'Compliance'], 'lock'),
('FTP/FTPS', 'file_transfer', 'File Transfer Protocol with optional TLS encryption', 21, true, true, 'guaranteed', ARRAY['Legacy file drops', 'Mainframe exports', 'Batch processing'], 'folder'),
('SCP', 'file_transfer', 'Secure Copy Protocol over SSH for single-file transfers', 22, true, false, 'guaranteed', ARRAY['Ad-hoc file transfer', 'Script-based collection', 'Unix systems'], 'terminal'),
('rsync', 'file_transfer', 'Differential file synchronization with compression and SSH transport', 873, true, true, 'guaranteed', ARRAY['Incremental sync', 'Log rotation pickup', 'Large file sets'], 'refresh-cw'),
('NFS Mount', 'file_transfer', 'Network File System mount for transparent remote file access', 2049, false, true, 'guaranteed', ARRAY['Shared storage', 'Unix log directories', 'High-performance local access'], 'hard-drive'),
('SMB/CIFS Mount', 'file_transfer', 'Windows network share mount for remote file access', 445, true, true, 'guaranteed', ARRAY['Windows file shares', 'DFS paths', 'Active Directory environments'], 'folder'),
('HTTP/HTTPS PUT', 'file_transfer', 'Upload files via HTTP PUT or multipart POST to collection endpoints', 443, true, false, 'guaranteed', ARRAY['Cloud uploads', 'Webhook receivers', 'REST endpoints'], 'upload'),

-- Streaming
('Apache Kafka', 'streaming', 'Distributed commit log with consumer groups and exactly-once semantics', 9092, true, true, 'exactly-once', ARRAY['High-throughput streaming', 'Event sourcing', 'Microservice events'], 'layers'),
('AWS Kinesis', 'streaming', 'Managed real-time data streaming service with automatic scaling', 443, true, false, 'at-least-once', ARRAY['AWS event streams', 'Real-time analytics', 'IoT data'], 'cloud'),
('Azure Event Hubs', 'streaming', 'Managed event streaming platform with Kafka protocol compatibility', 5671, true, false, 'at-least-once', ARRAY['Azure telemetry', 'Hybrid cloud', 'Enterprise events'], 'cloud'),
('Google Pub/Sub', 'streaming', 'Global messaging and streaming with at-least-once delivery', 443, true, false, 'at-least-once', ARRAY['GCP events', 'Global distribution', 'Serverless triggers'], 'cloud'),
('Apache Pulsar', 'streaming', 'Multi-tenant distributed messaging with tiered storage', 6650, true, true, 'exactly-once', ARRAY['Multi-tenant messaging', 'Geo-replication', 'IoT messaging'], 'layers'),
('NATS Streaming', 'streaming', 'Lightweight cloud-native messaging with at-least-once delivery', 4222, true, true, 'at-least-once', ARRAY['Cloud-native apps', 'Edge computing', 'Microservices'], 'zap'),
('Redis Streams', 'streaming', 'In-memory stream data structure with consumer groups', 6379, true, true, 'at-least-once', ARRAY['Low-latency streaming', 'Cache-adjacent processing', 'Event buffering'], 'database'),

-- Legacy/Industrial
('Netcat (nc)', 'legacy', 'Raw TCP/UDP data transfer via command-line netcat utility', 0, false, true, 'best-effort', ARRAY['Ad-hoc transfers', 'Testing', 'Simple pipe forwarding'], 'terminal'),
('Named Pipes (FIFO)', 'legacy', 'Inter-process communication via filesystem named pipes', 0, false, true, 'guaranteed', ARRAY['Local process communication', 'Unix daemons', 'Same-host transfer'], 'git-branch'),
('Unix Domain Socket', 'legacy', 'High-performance local IPC via filesystem socket', 0, false, true, 'guaranteed', ARRAY['Container logging', 'Docker socket', 'Local high-throughput'], 'cpu'),
('Serial/RS-232', 'legacy', 'Serial port communication for OT/ICS and legacy devices', 0, false, true, 'best-effort', ARRAY['ICS/SCADA', 'PLCs', 'Legacy industrial equipment', 'IoT gateways'], 'hard-drive'),
('Modbus TCP', 'legacy', 'Industrial protocol for SCADA/ICS device communication', 502, false, true, 'guaranteed', ARRAY['ICS/OT monitoring', 'PLC data', 'Industrial control systems'], 'gauge'),
('OPC-UA', 'legacy', 'Unified Architecture for industrial automation data exchange', 4840, true, true, 'guaranteed', ARRAY['Industrial IoT', 'Manufacturing', 'SCADA systems', 'Process control'], 'settings'),

-- Cloud-Native
('AWS S3 Event', 'cloud', 'S3 bucket notifications via Lambda/SQS/SNS on object creation', 443, true, false, 'at-least-once', ARRAY['CloudTrail logs', 'VPC Flow Logs', 'ALB access logs', 'WAF logs'], 'cloud'),
('Azure Blob Event', 'cloud', 'Azure Event Grid notifications on blob storage changes', 443, true, false, 'at-least-once', ARRAY['Azure diagnostic logs', 'NSG flow logs', 'Activity logs'], 'cloud'),
('GCS Notification', 'cloud', 'Cloud Storage notifications via Pub/Sub on object changes', 443, true, false, 'at-least-once', ARRAY['GCP audit logs', 'Cloud CDN logs', 'Custom application logs'], 'cloud'),
('CloudWatch Logs', 'cloud', 'AWS CloudWatch Logs subscription filters and log groups', 443, true, false, 'at-least-once', ARRAY['Lambda logs', 'ECS logs', 'API Gateway logs'], 'cloud'),
('Fluentd/Fluent Bit', 'cloud', 'Cloud-native log collection and forwarding with plugin architecture', 24224, true, true, 'at-least-once', ARRAY['Kubernetes logs', 'Container stdout', 'Multi-destination routing'], 'layers'),
('Vector/Datadog Agent', 'cloud', 'High-performance observability data pipeline with transforms', 8282, true, true, 'at-least-once', ARRAY['Log routing', 'Metric collection', 'Trace forwarding'], 'activity');

-- Seed mock version check data
INSERT INTO connector_version_checks (connector_id, connector_name, vendor, category, current_version, latest_version, version_behind, changelog_summary, log_schema_changes, parser_update_required, parser_patch, auto_applied, status, severity, checked_at) VALUES
('edr-1', 'CrowdStrike Falcon', 'CrowdStrike', 'EDR', '6.48', '7.02', 3, 'v7.0: New XDR telemetry fields (process_lineage, module_loads[].signature_status). v6.52: Added cloud_indicator field to DetectionSummaryEvent. v6.50: network_access events now include tls_ja4 hash.', '[{"field":"process_lineage","action":"added","version":"7.0"},{"field":"module_loads[].signature_status","action":"added","version":"7.0"},{"field":"cloud_indicator","action":"added","version":"6.52"},{"field":"network_access.tls_ja4","action":"added","version":"6.50"}]', true, '{"fields_to_add":["process_lineage","cloud_indicator","tls_ja4"],"parser_section":"detection_event_v2","normalization_map":{"process_lineage":"ocsf.process.ancestor_pids","cloud_indicator":"ocsf.cloud.provider"}}', false, 'outdated', 'high', now() - interval '2 hours'),
('fw-1', 'Palo Alto NGFW', 'Palo Alto Networks', 'Firewall', '11.1', '11.2', 1, 'v11.2: THREAT log type adds ai_generated_verdict field. URL filtering logs now include page_risk_score. GlobalProtect HIP reports extended with disk_encryption_status.', '[{"field":"ai_generated_verdict","action":"added","version":"11.2"},{"field":"page_risk_score","action":"added","version":"11.2"},{"field":"disk_encryption_status","action":"added","version":"11.2"}]', true, '{"fields_to_add":["ai_generated_verdict","page_risk_score"],"parser_section":"threat_log","normalization_map":{"ai_generated_verdict":"ocsf.verdict","page_risk_score":"ocsf.risk_score"}}', false, 'outdated', 'medium', now() - interval '1 hour'),
('siem-1', 'Splunk Enterprise', 'Splunk', 'SIEM', '9.2.1', '9.2.1', 0, 'Current version. No schema changes detected.', '[]', false, '{}', false, 'current', 'info', now() - interval '30 minutes'),
('cloud-aws-1', 'AWS CloudTrail', 'Amazon', 'Cloud AWS', '2.0', '2.1', 1, 'v2.1: Added tlsDetails block with tlsVersion and cipherSuite. New addendum events for async operations. sourceIPAddress now includes VPC endpoint ID for private API calls.', '[{"field":"tlsDetails","action":"added","version":"2.1"},{"field":"addendum","action":"added","version":"2.1"},{"field":"sourceIPAddress.vpcEndpointId","action":"modified","version":"2.1"}]', true, '{"fields_to_add":["tlsDetails.tlsVersion","tlsDetails.cipherSuite","addendum"],"parser_section":"cloudtrail_event","normalization_map":{"tlsDetails.tlsVersion":"ocsf.tls.version","tlsDetails.cipherSuite":"ocsf.tls.cipher_suite"}}', true, 'updated', 'low', now() - interval '6 hours'),
('iam-1', 'Okta', 'Okta', 'IAM', '2024.06', '2025.03', 4, 'v2025.03: System Log API v2 with OCSF-native output. New event types: policy.evaluate.sign_on.rule, user.mfa.factor.verify_with_link. Session context enriched with device_trust_level.', '[{"field":"ocsf_native_output","action":"added","version":"2025.03"},{"field":"device_trust_level","action":"added","version":"2025.01"},{"field":"policy.evaluate.sign_on.rule","action":"new_event_type","version":"2024.09"}]', true, '{"fields_to_add":["device_trust_level","event_types.policy_evaluate"],"parser_section":"system_log_v2","breaking_changes":["date_format_iso8601_strict"],"normalization_map":{"device_trust_level":"ocsf.device.risk_level"}}', false, 'outdated', 'critical', now() - interval '45 minutes'),
('edr-2', 'SentinelOne', 'SentinelOne', 'EDR', '4.1', '4.3', 2, 'v4.3: Deep Visibility 2.0 with kernel-level telemetry. New fields: registry_value_type, dns_response_data[]. Threat indicators enriched with MITRE sub-technique IDs.', '[{"field":"registry_value_type","action":"added","version":"4.3"},{"field":"dns_response_data[]","action":"added","version":"4.3"},{"field":"mitre_sub_technique","action":"added","version":"4.2"}]', true, '{"fields_to_add":["registry_value_type","dns_response_data","mitre_sub_technique"],"parser_section":"deep_visibility_v2"}', false, 'outdated', 'medium', now() - interval '3 hours'),
('ndr-1', 'Darktrace', 'Darktrace', 'NDR', '6.1', '6.1', 0, 'Current version. No schema changes detected.', '[]', false, '{}', false, 'current', 'info', now() - interval '20 minutes'),
('cloud-azure-1', 'Azure Monitor', 'Microsoft', 'Cloud Azure', '2024-10', '2025-04', 2, 'v2025-04: Diagnostic settings v2 with category-group support. New tables: AZFWNatRule, AZFWIdpsSignature. Columns added: CorrelationId on all network tables.', '[{"field":"category_groups","action":"added","version":"2025-04"},{"field":"AZFWNatRule_table","action":"new_table","version":"2025-04"},{"field":"CorrelationId","action":"added_to_all","version":"2025-01"}]', true, '{"tables_to_add":["AZFWNatRule","AZFWIdpsSignature"],"fields_to_add":["CorrelationId"],"parser_section":"azure_diagnostics"}', false, 'outdated', 'medium', now() - interval '4 hours');
