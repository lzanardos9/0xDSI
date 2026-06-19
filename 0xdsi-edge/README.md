# 0xDSI Edge Collector

High-performance edge security telemetry collector written in Rust. Ships as a single Docker image with 130+ connector types covering every security data source in the 0xDSI platform catalog.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      0xDSI Edge Collector                         │
│                                                                   │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐│
│  │  Syslog  │  │  Cloud   │  │   PLC    │  │    Bytecode      ││
│  │  CEF/HEC │  │ AWS/Az/  │  │ Modbus/  │  │    JVM/.NET/     ││
│  │  Webhook │  │  GCP     │  │ S7/OPC   │  │    Python/eBPF   ││
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └───────┬──────────┘│
│       │              │              │                │            │
│       └──────────────┴──────┬───────┴────────────────┘            │
│                             │                                     │
│                   ┌─────────▼──────────┐                          │
│                   │  OCSF Normalizer   │                          │
│                   └─────────┬──────────┘                          │
│                             │                                     │
│                   ┌─────────▼──────────┐                          │
│                   │  RocksDB Buffer    │                          │
│                   └─────────┬──────────┘                          │
│                             │                                     │
│                   ┌─────────▼──────────┐                          │
│                   │  Shipper (Kafka/   │                          │
│                   │  EventHub/HTTPS)   │                          │
│                   └─────────┬──────────┘                          │
│                             │                                     │
└─────────────────────────────┼─────────────────────────────────────┘
                              │
                              ▼
                    Databricks Bronze Layer
```

## Quick Start

```bash
# Build
docker build -t 0xdsi-edge .

# Run with default config
docker run -d \
  -p 514:514 -p 9443:9443 -p 8088:8088 \
  -v ./config/config.toml:/etc/0xdsi-edge/config.toml:ro \
  0xdsi-edge

# Or with docker-compose (includes local Kafka for dev)
docker compose --profile dev up -d
```

## Supported Connectors (130+)

| Category | Count | Examples |
|----------|-------|---------|
| SIEM Platforms | 6 | Splunk, QRadar, Sentinel, Elastic, ArcSight, LogRhythm |
| Cloud - AWS | 5 | CloudTrail, GuardDuty, Security Hub, VPC Flow, WAF |
| Cloud - Azure | 4 | Monitor, Defender, Entra ID, Network Watcher |
| Cloud - GCP | 4 | Cloud Logging, SCC, Chronicle, VPC Flow |
| EDR | 5 | CrowdStrike, SentinelOne, Carbon Black, MDE, Cybereason |
| Firewalls | 5 | Palo Alto, Fortinet, Check Point, Cisco, Juniper |
| IAM | 5 | Okta, CyberArk, Ping, OneLogin, SailPoint |
| Email Security | 4 | Proofpoint, Mimecast, MDO, Barracuda |
| Vuln Management | 5 | Qualys, Tenable, Rapid7, Snyk, Wiz |
| Threat Intel | 6 | MISP, Recorded Future, Mandiant, OTX, VT, TAXII |
| WAF | 4 | Cloudflare, AWS WAF, Akamai, Imperva |
| DLP | 4 | Symantec, Digital Guardian, Purview, Forcepoint |
| Container/K8s | 4 | Aqua, Prisma Cloud, Sysdig, Falco |
| DevSecOps | 4 | GitHub, GitLab, SonarQube, Checkmarx |
| NDR | 4 | Darktrace, Vectra, ExtraHop, Corelight |
| CASB | 4 | Netskope, Zscaler, MDCA, Cloudlock |
| SOAR | 4 | Cortex XSOAR, Splunk SOAR, Swimlane, Tines |
| Observability | 4 | Datadog, Sumo Logic, New Relic, Loki |
| ICS/OT Security | 4 | Claroty, Dragos, Nozomi, Tenable OT |
| PLC Protocols | 20 | S7, Modbus, CIP, OPC-UA, DNP3, IEC 61850, PROFINET, etc. |
| DNS Security | 4 | Umbrella, Infoblox, DNSFilter, Cloudflare |
| Endpoint Mgmt | 4 | Intune, Jamf, Tanium, Falcon Discover |
| GRC | 4 | ServiceNow, Archer, Drata, Vanta |
| Collaboration | 3 | Slack, M365, Google Workspace |
| Database Security | 3 | Guardium, Imperva, Oracle Audit Vault |
| Zero Trust | 4 | Zscaler ZPA, Cloudflare Access, Prisma, Tailscale |
| Bytecode Instr. | 5 | JVM, .NET CLR, Python, eBPF, Node.js |
| AI Doc Analysis | 4 | PDF Analyzer, Contract Risk, Compliance, BIA |
| DPI | 1 | Deep Packet Inspection Engine |
| Network TAP | 4 | SPAN, Inline TAP, SNMP, NetFlow/IPFIX |
| Generic | 7 | Syslog TCP/UDP, CEF, Webhook, Kafka, S3, File Tail |

## Performance Targets

- 200K+ events/sec sustained throughput
- <128MB RAM under normal load
- <100ms p99 tail latency (ingestion to buffer)
- <2s cold start time
- Zero event loss during network partitions (RocksDB buffer)

## Configuration

Edit `config/config.toml` to enable connectors. Each connector has:
- `id`: Unique identifier
- `connector_type`: Maps to a protocol handler
- `enabled`: true/false
- `params`: Connector-specific settings (ports, credentials, targets)

## Deployment Options

1. **Docker**: Single container, minimal footprint
2. **Docker Compose**: Full stack with local Kafka
3. **Kubernetes (Helm)**: DaemonSet for cluster-wide collection
4. **Bare Metal**: Compile with `cargo build --release`

## WASM Plugin System

For custom connectors not in the catalog, write a WASM module implementing the Connector trait:

```rust
#[async_trait]
pub trait Connector: Send + Sync {
    fn name(&self) -> &'static str;
    fn connector_type(&self) -> &'static str;
    async fn run(&self, tx: Sender<OcsfEvent>) -> Result<()>;
}
```

Place `.wasm` files in `/etc/0xdsi-edge/plugins/` and configure:

```toml
[[connectors]]
id = "custom-connector"
connector_type = "wasm_plugin"
enabled = true
[connectors.params]
plugin_path = "/etc/0xdsi-edge/plugins/my_connector.wasm"
```
