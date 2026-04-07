# Real-Time SIEM ETL & Correlation Engine Architecture

## Overview
This document describes the complete ETL (Extract, Transform, Load) and real-time correlation engine architecture for the SOC Intelligence Platform.

## Architecture Components

### 1. Data Ingestion Layer
- **Raw Ingestion Buffer**: High-performance queue for incoming events
- **Multiple Input Formats**: Syslog, JSON, CEF, LEEF, XML, CSV
- **Protocol Support**: UDP/TCP Syslog, HTTP REST API, Webhooks
- **Rate Limiting**: Configurable per-source throttling

### 2. Parsing & Normalization Layer
- **Format Detection**: Auto-detect log format
- **Field Extraction**: Regex and grammar-based parsers
- **OCSF Normalization**: Convert all events to OCSF schema
- **Field Mapping**: Custom field mapping per source

### 3. Enrichment Layer
- **GeoIP Enrichment**: IP → Location, ASN, ISP
- **Threat Intelligence**: IOC matching against feeds
- **Asset Context**: Enrich with asset inventory data
- **User Context**: Add user profile and risk data
- **DNS Resolution**: Reverse DNS lookups

### 4. Correlation Engine
- **Real-Time Correlation**: Sub-second event correlation
- **Stateful Rules**: Time-windowed pattern matching
- **Multi-Event Correlation**: Chain related events
- **Behavioral Analytics**: Anomaly detection
- **Attack Chain Detection**: MITRE ATT&CK mapping

### 5. Alert Generation
- **Threshold-based Alerts**: Count, rate, statistical
- **Pattern-based Alerts**: Sequence and temporal patterns
- **ML-based Alerts**: Anomaly detection
- **Alert Aggregation**: Reduce noise via deduplication
- **Priority Scoring**: Risk-based alert prioritization

### 6. Response Automation
- **Automated Actions**: Block, quarantine, notify
- **Workflow Triggers**: n8n integration
- **Case Creation**: Auto-create cases for critical alerts
- **Notification**: Email, Slack, PagerDuty, webhook

## Data Flow

```
[Log Sources]
    ↓
[Ingestion Buffer]
    ↓
[Parser & Normalizer]
    ↓
[Enrichment Engine]
    ↓
[Correlation Engine] → [Alert Generator] → [Response Automation]
    ↓
[Indexed Storage]
    ↓
[Real-time Dashboards]
```

## Performance Targets
- **Ingestion Rate**: 100,000+ EPS (Events Per Second)
- **Processing Latency**: <100ms average
- **Correlation Latency**: <1 second
- **Storage**: Hot data 30 days, warm 90 days, cold 365+ days
- **Query Performance**: <2 seconds for most queries

## Technology Stack
- **Database**: Supabase (PostgreSQL with pgvector)
- **Streaming**: Supabase Realtime
- **Orchestration**: Edge Functions
- **Vector Search**: pgvector for similarity search
- **Time-Series**: TimescaleDB extension (optional)

## Correlation Rules Examples

### 1. Brute Force Detection
```
Event Type: Authentication Failure
Threshold: >5 failures in 60 seconds
Same: Source IP, Destination User
Action: Create Alert (High), Block IP
```

### 2. Data Exfiltration
```
Events: Large File Access → External Upload
Time Window: 5 minutes
Threshold: >100MB transferred
Action: Create Alert (Critical), Block connection
```

### 3. Lateral Movement
```
Events: Auth Success → Remote Execution → File Copy
Time Window: 15 minutes
Same: Source user, Different destinations
Action: Create Alert (Critical), Create case
```

## Implementation Phases
1. ✅ Database schema and tables
2. 🔄 Ingestion buffers and parsers
3. 🔄 Enrichment pipelines
4. 🔄 Correlation engine
5. ⏳ Response automation
6. ⏳ Performance optimization
