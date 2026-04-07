/*
  # Create Real-Time Graph Streaming System

  1. New Tables
    - `rt_graph_snapshots` - Point-in-time snapshots of streaming graph state
      - `id` (uuid, primary key)
      - `snapshot_type` (text) - 'normal', 'risk_elevated', 'critical_event'
      - `graph_data` (jsonb) - Full graph with nodes and edges
      - `risk_level` (text) - 'low', 'medium', 'high', 'critical'
      - `risk_score` (numeric)
      - `pipeline_stage` (text) - Which Spark stage produced this
      - `processing_latency_ms` (int) - Simulated processing time
      - `vector_embeddings_count` (int) - VectorDB embedding count
      - `description` (text) - Human-readable description
      - `created_at` (timestamptz)

    - `rt_streaming_metrics` - Pipeline throughput and health metrics
      - `id` (uuid, primary key)
      - `metric_name` (text)
      - `metric_value` (numeric)
      - `pipeline_component` (text) - 'spark_ingestion', 'graphframes', 'vectordb', 'cep_engine'
      - `recorded_at` (timestamptz)

  2. Security
    - RLS enabled on both tables
    - Authenticated read access
*/

CREATE TABLE IF NOT EXISTS rt_graph_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_type text NOT NULL DEFAULT 'normal',
  graph_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  risk_level text NOT NULL DEFAULT 'low',
  risk_score numeric NOT NULL DEFAULT 0,
  pipeline_stage text NOT NULL DEFAULT 'graphframes_output',
  processing_latency_ms int NOT NULL DEFAULT 0,
  vector_embeddings_count int NOT NULL DEFAULT 0,
  description text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE rt_graph_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read rt_graph_snapshots"
  ON rt_graph_snapshots FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Anon users can read rt_graph_snapshots"
  ON rt_graph_snapshots FOR SELECT
  TO anon
  USING (true);

CREATE TABLE IF NOT EXISTS rt_streaming_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_name text NOT NULL,
  metric_value numeric NOT NULL DEFAULT 0,
  pipeline_component text NOT NULL DEFAULT 'spark_ingestion',
  recorded_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE rt_streaming_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read rt_streaming_metrics"
  ON rt_streaming_metrics FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Anon users can read rt_streaming_metrics"
  ON rt_streaming_metrics FOR SELECT
  TO anon
  USING (true);

-- Insert mock streaming metrics
INSERT INTO rt_streaming_metrics (metric_name, metric_value, pipeline_component, recorded_at) VALUES
  ('events_per_second', 14500, 'spark_ingestion', now() - interval '5 minutes'),
  ('events_per_second', 15200, 'spark_ingestion', now() - interval '4 minutes'),
  ('events_per_second', 13800, 'spark_ingestion', now() - interval '3 minutes'),
  ('events_per_second', 16100, 'spark_ingestion', now() - interval '2 minutes'),
  ('events_per_second', 15700, 'spark_ingestion', now() - interval '1 minute'),
  ('graph_vertices_processed', 8420, 'graphframes', now() - interval '5 minutes'),
  ('graph_vertices_processed', 8890, 'graphframes', now() - interval '4 minutes'),
  ('graph_vertices_processed', 9150, 'graphframes', now() - interval '3 minutes'),
  ('graph_vertices_processed', 9600, 'graphframes', now() - interval '2 minutes'),
  ('graph_vertices_processed', 9870, 'graphframes', now() - interval '1 minute'),
  ('vector_queries_per_sec', 2400, 'vectordb', now() - interval '5 minutes'),
  ('vector_queries_per_sec', 2650, 'vectordb', now() - interval '4 minutes'),
  ('vector_queries_per_sec', 2800, 'vectordb', now() - interval '3 minutes'),
  ('vector_queries_per_sec', 3100, 'vectordb', now() - interval '2 minutes'),
  ('vector_queries_per_sec', 2950, 'vectordb', now() - interval '1 minute'),
  ('pattern_matches', 42, 'cep_engine', now() - interval '5 minutes'),
  ('pattern_matches', 38, 'cep_engine', now() - interval '4 minutes'),
  ('pattern_matches', 51, 'cep_engine', now() - interval '3 minutes'),
  ('pattern_matches', 47, 'cep_engine', now() - interval '2 minutes'),
  ('pattern_matches', 55, 'cep_engine', now() - interval '1 minute'),
  ('avg_latency_ms', 12, 'spark_ingestion', now() - interval '1 minute'),
  ('avg_latency_ms', 45, 'graphframes', now() - interval '1 minute'),
  ('avg_latency_ms', 8, 'vectordb', now() - interval '1 minute'),
  ('avg_latency_ms', 23, 'cep_engine', now() - interval '1 minute');

-- Normal graph: Internal network reconnaissance
INSERT INTO rt_graph_snapshots (snapshot_type, graph_data, risk_level, risk_score, pipeline_stage, processing_latency_ms, vector_embeddings_count, description) VALUES
('normal', '{
  "nodes": [
    {"id": "user-jsmith", "type": "user", "label": "jsmith", "risk": 0.15, "dept": "Engineering"},
    {"id": "host-ws042", "type": "host", "label": "WS-042", "risk": 0.1, "os": "Windows 11"},
    {"id": "host-srv01", "type": "server", "label": "SRV-DC-01", "risk": 0.12, "os": "Windows Server 2022"},
    {"id": "ip-10.0.1.50", "type": "ip", "label": "10.0.1.50", "risk": 0.08, "geo": "Internal"},
    {"id": "svc-ldap", "type": "service", "label": "LDAP/389", "risk": 0.05, "proto": "TCP"},
    {"id": "app-outlook", "type": "application", "label": "Outlook", "risk": 0.02, "version": "16.0"}
  ],
  "edges": [
    {"source": "user-jsmith", "target": "host-ws042", "type": "logged_into", "weight": 0.9},
    {"source": "host-ws042", "target": "ip-10.0.1.50", "type": "connected_to", "weight": 0.7},
    {"source": "host-ws042", "target": "host-srv01", "type": "accessed", "weight": 0.6},
    {"source": "host-ws042", "target": "svc-ldap", "type": "queried", "weight": 0.5},
    {"source": "user-jsmith", "target": "app-outlook", "type": "launched", "weight": 0.8}
  ]
}'::jsonb, 'low', 12, 'graphframes_output', 34, 128, 'Normal workday activity - user jsmith accessing standard resources'),

('normal', '{
  "nodes": [
    {"id": "user-mchen", "type": "user", "label": "mchen", "risk": 0.18, "dept": "Finance"},
    {"id": "host-ws089", "type": "host", "label": "WS-089", "risk": 0.12, "os": "Windows 11"},
    {"id": "host-dbprod", "type": "server", "label": "DB-PROD-03", "risk": 0.2, "os": "Ubuntu 22.04"},
    {"id": "file-report", "type": "file", "label": "Q4_Revenue.xlsx", "risk": 0.15, "class": "Confidential"},
    {"id": "svc-smb", "type": "service", "label": "SMB/445", "risk": 0.1, "proto": "TCP"},
    {"id": "app-excel", "type": "application", "label": "Excel", "risk": 0.02, "version": "16.0"},
    {"id": "printer-fl3", "type": "device", "label": "PR-FLOOR3", "risk": 0.01, "type": "Printer"}
  ],
  "edges": [
    {"source": "user-mchen", "target": "host-ws089", "type": "logged_into", "weight": 0.9},
    {"source": "host-ws089", "target": "host-dbprod", "type": "queried", "weight": 0.65},
    {"source": "host-ws089", "target": "file-report", "type": "accessed", "weight": 0.7},
    {"source": "host-ws089", "target": "svc-smb", "type": "connected_to", "weight": 0.5},
    {"source": "user-mchen", "target": "app-excel", "type": "launched", "weight": 0.8},
    {"source": "host-ws089", "target": "printer-fl3", "type": "printed_to", "weight": 0.4}
  ]
}'::jsonb, 'low', 18, 'graphframes_output', 28, 156, 'Finance user accessing confidential reports - within normal baseline'),

('normal', '{
  "nodes": [
    {"id": "svc-nginx", "type": "service", "label": "NGINX/443", "risk": 0.08, "proto": "HTTPS"},
    {"id": "host-web01", "type": "server", "label": "WEB-PROD-01", "risk": 0.1, "os": "Ubuntu"},
    {"id": "host-web02", "type": "server", "label": "WEB-PROD-02", "risk": 0.1, "os": "Ubuntu"},
    {"id": "host-api01", "type": "server", "label": "API-GW-01", "risk": 0.12, "os": "Alpine"},
    {"id": "ip-ext-cdn", "type": "ip", "label": "CDN Edge", "risk": 0.05, "geo": "US-East"},
    {"id": "svc-redis", "type": "service", "label": "Redis/6379", "risk": 0.06, "proto": "TCP"}
  ],
  "edges": [
    {"source": "ip-ext-cdn", "target": "svc-nginx", "type": "routes_to", "weight": 0.9},
    {"source": "svc-nginx", "target": "host-web01", "type": "load_balances", "weight": 0.8},
    {"source": "svc-nginx", "target": "host-web02", "type": "load_balances", "weight": 0.8},
    {"source": "host-web01", "target": "host-api01", "type": "forwards_to", "weight": 0.7},
    {"source": "host-web02", "target": "host-api01", "type": "forwards_to", "weight": 0.7},
    {"source": "host-api01", "target": "svc-redis", "type": "caches_in", "weight": 0.6}
  ]
}'::jsonb, 'low', 10, 'spark_structured_streaming', 18, 98, 'Normal web tier traffic pattern - load balanced across nodes'),

-- RISK ELEVATED: Lateral movement detected
('risk_elevated', '{
  "nodes": [
    {"id": "user-compromised", "type": "user", "label": "svc_backup", "risk": 0.92, "dept": "Service Account"},
    {"id": "host-entry", "type": "host", "label": "WS-RECEPTION", "risk": 0.88, "os": "Windows 10"},
    {"id": "host-dc01", "type": "server", "label": "DC-PRIMARY", "risk": 0.95, "os": "Windows Server"},
    {"id": "host-dc02", "type": "server", "label": "DC-BACKUP", "risk": 0.78, "os": "Windows Server"},
    {"id": "host-filesvr", "type": "server", "label": "FILE-SVR-01", "risk": 0.85, "os": "Windows Server"},
    {"id": "svc-psexec", "type": "service", "label": "PsExec/445", "risk": 0.97, "proto": "SMB"},
    {"id": "svc-wmi", "type": "service", "label": "WMI/135", "risk": 0.93, "proto": "DCOM"},
    {"id": "ip-c2", "type": "ip", "label": "185.220.101.42", "risk": 0.99, "geo": "RU"},
    {"id": "proc-mimikatz", "type": "process", "label": "mimikatz.exe", "risk": 0.99, "hash": "a1b2c3..."},
    {"id": "cred-krbtgt", "type": "credential", "label": "krbtgt hash", "risk": 0.99, "type": "Golden Ticket"}
  ],
  "edges": [
    {"source": "ip-c2", "target": "host-entry", "type": "c2_beacon", "weight": 0.98},
    {"source": "host-entry", "target": "proc-mimikatz", "type": "executed", "weight": 0.99},
    {"source": "proc-mimikatz", "target": "cred-krbtgt", "type": "extracted", "weight": 0.99},
    {"source": "user-compromised", "target": "host-dc01", "type": "lateral_movement", "weight": 0.95},
    {"source": "user-compromised", "target": "host-dc02", "type": "lateral_movement", "weight": 0.88},
    {"source": "host-dc01", "target": "svc-psexec", "type": "used_tool", "weight": 0.93},
    {"source": "host-dc01", "target": "svc-wmi", "type": "used_tool", "weight": 0.91},
    {"source": "user-compromised", "target": "host-filesvr", "type": "lateral_movement", "weight": 0.85},
    {"source": "host-entry", "target": "host-dc01", "type": "pivoted_to", "weight": 0.97},
    {"source": "host-filesvr", "target": "ip-c2", "type": "exfiltration", "weight": 0.92}
  ]
}'::jsonb, 'critical', 96, 'graphframes_pagerank', 156, 512, 'CRITICAL: Active lateral movement with Golden Ticket - mimikatz credential dump, PsExec pivoting across domain controllers'),

-- RISK ELEVATED: Insider threat data exfiltration
('risk_elevated', '{
  "nodes": [
    {"id": "user-insider", "type": "user", "label": "r.harrison", "risk": 0.87, "dept": "R&D"},
    {"id": "host-dev", "type": "host", "label": "DEV-WS-112", "risk": 0.72, "os": "macOS"},
    {"id": "host-gitsvr", "type": "server", "label": "GIT-INTERNAL", "risk": 0.65, "os": "Ubuntu"},
    {"id": "file-source", "type": "file", "label": "core-algo.tar.gz", "risk": 0.95, "class": "Top Secret"},
    {"id": "svc-usb", "type": "device", "label": "USB-SanDisk", "risk": 0.91, "serial": "SN-88421"},
    {"id": "ip-personal", "type": "ip", "label": "Dropbox Upload", "risk": 0.89, "geo": "Personal Cloud"},
    {"id": "cam-lobby", "type": "device", "label": "CCTV-LOBBY-02", "risk": 0.3, "type": "Camera"},
    {"id": "badge-exit", "type": "device", "label": "BADGE-EXIT-B2", "risk": 0.6, "type": "Badge Reader"},
    {"id": "audio-lab", "type": "device", "label": "MIC-LAB-R3", "risk": 0.45, "type": "Audio Sensor"}
  ],
  "edges": [
    {"source": "user-insider", "target": "host-dev", "type": "logged_into", "weight": 0.9},
    {"source": "host-dev", "target": "host-gitsvr", "type": "cloned_repo", "weight": 0.88},
    {"source": "host-gitsvr", "target": "file-source", "type": "contains", "weight": 0.95},
    {"source": "host-dev", "target": "svc-usb", "type": "copied_to_usb", "weight": 0.93},
    {"source": "host-dev", "target": "ip-personal", "type": "uploaded_to", "weight": 0.91},
    {"source": "cam-lobby", "target": "user-insider", "type": "detected_after_hours", "weight": 0.75},
    {"source": "badge-exit", "target": "user-insider", "type": "badge_swipe_2am", "weight": 0.82},
    {"source": "audio-lab", "target": "user-insider", "type": "voice_detected_lab", "weight": 0.68}
  ]
}'::jsonb, 'critical', 91, 'vectordb_similarity', 289, 445, 'CRITICAL: Insider threat - R&D engineer exfiltrating proprietary source code via USB and cloud upload, after-hours physical access confirmed by CCTV and audio sensors'),

-- RISK ELEVATED: Supply chain attack via compromised package
('risk_elevated', '{
  "nodes": [
    {"id": "pkg-compromised", "type": "process", "label": "npm:event-stream@3.3.6", "risk": 0.96, "hash": "d4f5..."},
    {"id": "host-ci", "type": "server", "label": "CI-RUNNER-04", "risk": 0.88, "os": "Ubuntu"},
    {"id": "host-staging", "type": "server", "label": "STAGING-APP-01", "risk": 0.82, "os": "Alpine"},
    {"id": "host-prod", "type": "server", "label": "PROD-APP-01", "risk": 0.9, "os": "Alpine"},
    {"id": "svc-npm", "type": "service", "label": "NPM Registry", "risk": 0.7, "proto": "HTTPS"},
    {"id": "ip-malicious", "type": "ip", "label": "45.33.32.156", "risk": 0.97, "geo": "CN"},
    {"id": "proc-cryptominer", "type": "process", "label": "xmrig_hidden", "risk": 0.98, "cpu": "98%"},
    {"id": "svc-dns-tun", "type": "service", "label": "DNS Tunnel", "risk": 0.94, "proto": "DNS/TXT"}
  ],
  "edges": [
    {"source": "svc-npm", "target": "pkg-compromised", "type": "installed", "weight": 0.95},
    {"source": "host-ci", "target": "pkg-compromised", "type": "built_with", "weight": 0.92},
    {"source": "host-ci", "target": "host-staging", "type": "deployed_to", "weight": 0.88},
    {"source": "host-staging", "target": "host-prod", "type": "promoted_to", "weight": 0.85},
    {"source": "pkg-compromised", "target": "ip-malicious", "type": "phones_home", "weight": 0.97},
    {"source": "host-prod", "target": "proc-cryptominer", "type": "spawned", "weight": 0.96},
    {"source": "proc-cryptominer", "target": "svc-dns-tun", "type": "tunnels_via", "weight": 0.93},
    {"source": "svc-dns-tun", "target": "ip-malicious", "type": "exfiltrates_to", "weight": 0.95}
  ]
}'::jsonb, 'high', 88, 'spark_structured_streaming', 78, 367, 'HIGH: Supply chain compromise - malicious npm package deployed through CI/CD pipeline, cryptominer active in production with DNS tunneling'),

-- Normal: Cloud infrastructure monitoring
('normal', '{
  "nodes": [
    {"id": "aws-vpc", "type": "cloud", "label": "VPC-PROD", "risk": 0.08, "region": "us-east-1"},
    {"id": "aws-ec2-1", "type": "server", "label": "EC2-APP-01", "risk": 0.1, "size": "m5.xlarge"},
    {"id": "aws-ec2-2", "type": "server", "label": "EC2-APP-02", "risk": 0.1, "size": "m5.xlarge"},
    {"id": "aws-rds", "type": "server", "label": "RDS-Primary", "risk": 0.12, "engine": "PostgreSQL"},
    {"id": "aws-s3", "type": "cloud", "label": "S3-DataLake", "risk": 0.06, "encrypt": "AES-256"},
    {"id": "aws-lambda", "type": "service", "label": "Lambda-ETL", "risk": 0.04, "runtime": "Python 3.11"}
  ],
  "edges": [
    {"source": "aws-vpc", "target": "aws-ec2-1", "type": "contains", "weight": 0.9},
    {"source": "aws-vpc", "target": "aws-ec2-2", "type": "contains", "weight": 0.9},
    {"source": "aws-ec2-1", "target": "aws-rds", "type": "queries", "weight": 0.7},
    {"source": "aws-ec2-2", "target": "aws-rds", "type": "queries", "weight": 0.7},
    {"source": "aws-lambda", "target": "aws-s3", "type": "writes_to", "weight": 0.8},
    {"source": "aws-rds", "target": "aws-s3", "type": "backs_up_to", "weight": 0.6}
  ]
}'::jsonb, 'low', 10, 'graphframes_output', 22, 108, 'Normal AWS infrastructure graph - standard cloud resource topology'),

-- RISK ELEVATED: Advanced persistent threat - multi-stage
('risk_elevated', '{
  "nodes": [
    {"id": "apt-actor", "type": "user", "label": "APT-29 Proxy", "risk": 0.99, "attribution": "Nation-State"},
    {"id": "phish-email", "type": "file", "label": "invoice_q4.docm", "risk": 0.96, "hash": "e7a1..."},
    {"id": "host-exec", "type": "host", "label": "EXEC-WS-CEO", "risk": 0.94, "os": "Windows 11"},
    {"id": "proc-macro", "type": "process", "label": "VBA Macro Stage1", "risk": 0.97, "parent": "WINWORD.EXE"},
    {"id": "proc-ps", "type": "process", "label": "PowerShell -enc", "risk": 0.98, "args": "base64..."},
    {"id": "host-exchange", "type": "server", "label": "EXCHANGE-01", "risk": 0.91, "os": "Windows Server"},
    {"id": "svc-owa", "type": "service", "label": "OWA/443", "risk": 0.85, "proto": "HTTPS"},
    {"id": "ip-c2-apt", "type": "ip", "label": "94.140.115.x", "risk": 0.99, "geo": "NL (TOR exit)"},
    {"id": "data-mailbox", "type": "file", "label": "CEO Mailbox PST", "risk": 0.93, "size": "4.2GB"},
    {"id": "svc-mega", "type": "service", "label": "MEGA.nz Upload", "risk": 0.95, "proto": "HTTPS"},
    {"id": "rf-sensor", "type": "device", "label": "RF-MON-EXEC-FL", "risk": 0.4, "type": "RF Spectrum"},
    {"id": "cam-exec", "type": "device", "label": "CCTV-EXEC-SUITE", "risk": 0.35, "type": "Camera"}
  ],
  "edges": [
    {"source": "apt-actor", "target": "phish-email", "type": "delivered", "weight": 0.98},
    {"source": "phish-email", "target": "host-exec", "type": "opened_on", "weight": 0.96},
    {"source": "host-exec", "target": "proc-macro", "type": "executed", "weight": 0.97},
    {"source": "proc-macro", "target": "proc-ps", "type": "spawned", "weight": 0.98},
    {"source": "proc-ps", "target": "ip-c2-apt", "type": "beaconed_to", "weight": 0.99},
    {"source": "proc-ps", "target": "host-exchange", "type": "pivoted_to", "weight": 0.93},
    {"source": "host-exchange", "target": "svc-owa", "type": "exploited", "weight": 0.91},
    {"source": "host-exchange", "target": "data-mailbox", "type": "exported", "weight": 0.95},
    {"source": "data-mailbox", "target": "svc-mega", "type": "exfiltrated_via", "weight": 0.94},
    {"source": "rf-sensor", "target": "host-exec", "type": "detected_bluetooth_anomaly", "weight": 0.6},
    {"source": "cam-exec", "target": "host-exec", "type": "unauthorized_usb_detected", "weight": 0.72}
  ]
}'::jsonb, 'critical', 98, 'vectordb_similarity', 198, 623, 'CRITICAL: APT-29 multi-stage attack - spear phish to CEO, macro dropper, PowerShell C2, Exchange pivot, mailbox exfiltration via MEGA.nz. RF sensor detected anomalous Bluetooth, CCTV caught unauthorized USB device.'),

-- Normal: DevOps pipeline activity
('normal', '{
  "nodes": [
    {"id": "dev-alice", "type": "user", "label": "alice.dev", "risk": 0.05, "dept": "Platform"},
    {"id": "git-main", "type": "service", "label": "GitHub main", "risk": 0.04, "repo": "core-api"},
    {"id": "ci-actions", "type": "server", "label": "GH Actions", "risk": 0.06, "runner": "ubuntu-latest"},
    {"id": "ecr-repo", "type": "cloud", "label": "ECR Registry", "risk": 0.05, "images": "42"},
    {"id": "k8s-cluster", "type": "server", "label": "EKS-PROD", "risk": 0.08, "nodes": "12"},
    {"id": "helm-chart", "type": "file", "label": "helm/core-api", "risk": 0.03, "version": "2.4.1"}
  ],
  "edges": [
    {"source": "dev-alice", "target": "git-main", "type": "pushed_to", "weight": 0.9},
    {"source": "git-main", "target": "ci-actions", "type": "triggered", "weight": 0.85},
    {"source": "ci-actions", "target": "ecr-repo", "type": "built_image", "weight": 0.8},
    {"source": "ecr-repo", "target": "k8s-cluster", "type": "deployed_to", "weight": 0.75},
    {"source": "helm-chart", "target": "k8s-cluster", "type": "applied_to", "weight": 0.7}
  ]
}'::jsonb, 'low', 6, 'spark_structured_streaming', 15, 72, 'Normal DevOps pipeline - code push, CI build, container deploy to EKS');
