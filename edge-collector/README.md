# 0xDSI Edge Collector

High-performance Rust edge agent for universal security data collection. Single static binary supporting **97 connectors** across **25 security categories** with OCSF normalization at the edge.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   0xDSI Edge Collector                        │
│                                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │   SIEM   │  │  Cloud   │  │   EDR    │  │ Firewall │   │
│  │Connectors│  │Connectors│  │Connectors│  │Connectors│   │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘   │
│       │              │              │              │         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │   IAM    │  │  PLC/OT  │  │   NDR    │  │  + 17    │   │
│  │Connectors│  │ Protocols│  │Connectors│  │  more    │   │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘   │
│       │              │              │              │         │
│       └──────────────┴──────────────┴──────────────┘         │
│                          │                                    │
│                    ┌─────▼─────┐                             │
│                    │  Parsers  │  CEF/LEEF/Syslog/JSON/      │
│                    │  (nom)    │  Modbus/S7/DNP3/OPC-UA      │
│                    └─────┬─────┘                             │
│                          │                                    │
│                    ┌─────▼─────┐                             │
│                    │   OCSF    │  Normalize to Open           │
│                    │Normalizer │  Cybersecurity Schema        │
│                    └─────┬─────┘                             │
│                          │                                    │
│                    ┌─────▼─────┐                             │
│                    │  RocksDB  │  Persistent buffer           │
│                    │  Buffer   │  (survives restarts)         │
│                    └─────┬─────┘                             │
│                          │                                    │
│                    ┌─────▼─────┐                             │
│                    │ Transport │  Kafka / EventHub / HTTP     │
│                    │   Sink    │  -> Databricks Bronze        │
│                    └───────────┘                             │
└─────────────────────────────────────────────────────────────┘
```

## Supported Connectors (97 Total)

| Category | Count | Connectors |
|----------|-------|-----------|
| SIEM Platforms | 6 | Splunk, QRadar, Sentinel, Elastic, ArcSight, LogRhythm |
| Cloud - AWS | 5 | CloudTrail, GuardDuty, Security Hub, VPC Flow Logs, WAF |
| Cloud - Azure | 4 | Monitor, Defender for Cloud, Entra ID, Network Watcher |
| Cloud - GCP | 4 | Cloud Logging, SCC, Chronicle, VPC Flow Logs |
| EDR | 5 | CrowdStrike, SentinelOne, Carbon Black, Defender, Cybereason |
| Firewalls | 5 | Palo Alto, FortiGate, Check Point, Cisco FTD, Juniper SRX |
| IAM | 5 | Okta, CyberArk, Ping Identity, OneLogin, SailPoint |
| Email Security | 4 | Proofpoint, Mimecast, Defender for O365, Barracuda |
| Vulnerability Mgmt | 5 | Qualys, Tenable, Rapid7, Snyk, Wiz |
| Threat Intelligence | 5 | MISP, Recorded Future, Mandiant, AlienVault OTX, VirusTotal |
| WAF | 4 | Cloudflare, AWS WAF, Akamai, Imperva |
| DLP | 4 | Symantec, Digital Guardian, Purview, Forcepoint |
| Container/K8s | 4 | Aqua, Prisma Cloud, Sysdig, Falco |
| DevSecOps | 4 | GitHub Advanced Security, GitLab, SonarQube, Checkmarx |
| NDR | 4 | Darktrace, Vectra AI, ExtraHop, Corelight |
| CASB | 4 | Netskope, Zscaler, Defender Cloud Apps, Cloudlock |
| SOAR | 4 | Cortex XSOAR, Splunk SOAR, Swimlane, Tines |
| Observability | 4 | Datadog, Sumo Logic, New Relic, Grafana Loki |
| ICS/OT Security | 4 | Claroty, Dragos, Nozomi, Tenable OT |
| PLC & OT Protocols | 20 | S7comm, Modbus, EtherNet/IP, OPC UA, DNP3, IEC 61850, IEC 104, PROFINET, BACnet, HART-IP, FINS, MELSEC, CC-Link, GE SRTP, CODESYS, EtherCAT, Foundation Fieldbus, Yokogawa, ABB, Honeywell |
| DNS Security | 4 | Cisco Umbrella, Infoblox, DNSFilter, Cloudflare Gateway |
| Endpoint Mgmt | 4 | Intune, Jamf, Tanium, Falcon Discover |
| GRC | 4 | ServiceNow, RSA Archer, Drata, Vanta |
| Collaboration | 3 | Slack Enterprise, Microsoft 365, Google Workspace |
| Database Security | 3 | IBM Guardium, Imperva Data Security, Oracle Audit Vault |
| Zero Trust | 4 | Zscaler ZPA, Cloudflare Access, Prisma Access, Tailscale |

## Quick Start

### Docker (recommended)

```bash
# Pull the image
docker pull ghcr.io/0xdsi/edge-collector:latest

# Edit configuration
cp config/edge.toml /etc/0xdsi/edge.toml
vim /etc/0xdsi/edge.toml

# Run
docker-compose up -d
```

### Binary

```bash
# Build from source
make release

# Run
./target/release/0xdsi-edge --config config/edge.toml
```

### List supported connectors

```bash
./target/release/0xdsi-edge --list-connectors
```

## Configuration

Edit `config/edge.toml` to enable connectors for your environment. Each connector block:

```toml
[[connectors]]
id = "crowdstrike-prod"         # Unique instance ID
connector_type = "crowdstrike_falcon"  # Connector type (matches catalog)
enabled = true                   # Enable/disable
protocol = "streaming_api"       # Which protocol to use
poll_interval_secs = 5           # Collection interval (0 = push/listen)

[connectors.params]
client_id = "${CS_CLIENT_ID}"    # Supports env var interpolation
client_secret = "${CS_CLIENT_SECRET}"
base_url = "https://api.crowdstrike.com"
```

## Transport Options

| Transport | Best For | Configuration |
|-----------|----------|--------------|
| Kafka | High-throughput, existing Kafka infra | `kind = "kafka"`, brokers, SASL |
| Event Hub | Azure-native deployments | `kind = "eventhub"`, connection string |
| HTTP | Direct Databricks ingestion | `kind = "http"`, endpoint, token |

## Building

### Prerequisites

- Rust 1.79+ (install via rustup)
- Docker + BuildKit (for container builds)

### Commands

```bash
make build          # Debug build
make release        # Optimized release build
make test           # Run all tests
make lint           # Clippy lints
make docker         # Build Docker image
make cross          # Cross-compile all architectures
make docker-push    # Build & push multi-arch image
```

## Target Architectures

| Architecture | Use Case |
|-------------|----------|
| x86_64-unknown-linux-musl | Servers, VMs, cloud instances |
| aarch64-unknown-linux-musl | AWS Graviton, Raspberry Pi 4+, ARM servers |
| armv7-unknown-linux-musleabihf | IoT gateways, older ARM devices, OT edge |

## OT/ICS Deployment

For industrial environments, the edge collector supports passive network monitoring of PLC protocols:

```toml
[[connectors]]
id = "modbus-passive"
connector_type = "modbus"
enabled = true
protocol = "modbus_tcp"
poll_interval_secs = 0  # Passive - listens only

[connectors.params]
interface = "eth1"
passive_monitoring = true
capture_filter = "tcp port 502"
```

Supported industrial protocols: S7comm, Modbus TCP/RTU, EtherNet/IP (CIP), OPC UA, DNP3, IEC 61850 (GOOSE/MMS), IEC 60870-5-104, PROFINET, BACnet, HART-IP, FINS, MELSEC, CC-Link, GE SRTP, CODESYS V3, EtherCAT, Foundation Fieldbus, Yokogawa Vnet/IP, ABB MMS, Honeywell CDA.

## Integration with Databricks

Events flow: **Edge Collector** -> Kafka/EventHub -> **Databricks Bronze Layer** -> Silver (OCSF normalized) -> Gold (analytics-ready).

The collector pre-normalizes to OCSF at the edge, reducing Silver processing overhead by ~70%.

## Monitoring

- Prometheus metrics: `http://localhost:9090/metrics`
- Health endpoint: `http://localhost:9091/health`
- Structured JSON logs: `/var/log/0xdsi/edge.log`

## License

Proprietary - 0xDSI Security
