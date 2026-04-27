/*
  # Agent Implementations Seed - Batch 1
  Seeds production code for: orchestrator, connector-adapter, parser-pool,
  sage-enrichment, ai-correlation, realtime-graph-cep, negative-correlation,
  atlas-triage, vector-memory, cti-attribution
*/

INSERT INTO agent_implementations (slug, language, production_code, config_yaml, integration_code, llm_config, dependencies, notes) VALUES

('orchestrator', 'python', $py$
"""SOC Orchestrator (Commander)
Routes events through the 11-phase pipeline with SLA enforcement, backpressure,
deadline propagation and dead-letter handling. Deployed as a Databricks Job
or a long-running asyncio service backed by Kafka/Delta.
"""
from __future__ import annotations
import asyncio, logging, time, uuid
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable, Mapping
from datetime import datetime, timezone

from confluent_kafka import Consumer, Producer
from prometheus_client import Counter, Histogram
from opentelemetry import trace

logger = logging.getLogger("orchestrator")
tracer = trace.get_tracer(__name__)

PHASE_LATENCY = Histogram("soc_phase_latency_seconds", "Phase latency", ["phase"])
PHASE_ERRORS = Counter("soc_phase_errors_total", "Phase errors", ["phase", "kind"])

PHASES = [
    "ingest", "parse", "enrich_fast", "correlate", "triage",
    "enrich_deep", "investigate", "respond", "discover", "vas", "alhf",
]

@dataclass
class PipelineEvent:
    id: str
    payload: Mapping[str, Any]
    phase: str = "ingest"
    deadline_ms: int = 30_000
    started_at: float = field(default_factory=time.monotonic)
    trace_id: str = field(default_factory=lambda: uuid.uuid4().hex)
    attempts: int = 0
    history: list[dict] = field(default_factory=list)

PhaseHandler = Callable[[PipelineEvent], Awaitable[PipelineEvent]]

class Orchestrator:
    def __init__(self, handlers: Mapping[str, PhaseHandler], dlq: Producer,
                 max_retries: int = 3, max_inflight: int = 256):
        self.handlers = handlers
        self.dlq = dlq
        self.max_retries = max_retries
        self.semaphore = asyncio.Semaphore(max_inflight)
        self.running = True

    @asynccontextmanager
    async def _trace_phase(self, evt: PipelineEvent):
        with tracer.start_as_current_span(f"phase.{evt.phase}") as span:
            span.set_attribute("event.id", evt.id)
            span.set_attribute("trace.id", evt.trace_id)
            t0 = time.monotonic()
            try:
                yield span
            finally:
                PHASE_LATENCY.labels(evt.phase).observe(time.monotonic() - t0)

    async def run_phase(self, evt: PipelineEvent) -> PipelineEvent | None:
        handler = self.handlers.get(evt.phase)
        if handler is None:
            logger.error("no handler for phase %s", evt.phase)
            return None
        async with self.semaphore, self._trace_phase(evt):
            try:
                evt = await asyncio.wait_for(handler(evt), timeout=evt.deadline_ms / 1000)
                evt.history.append({"phase": evt.phase, "ts": datetime.now(timezone.utc).isoformat()})
                return evt
            except asyncio.TimeoutError:
                PHASE_ERRORS.labels(evt.phase, "timeout").inc()
                return await self._retry_or_dlq(evt, "timeout")
            except Exception as exc:
                PHASE_ERRORS.labels(evt.phase, type(exc).__name__).inc()
                logger.exception("phase %s failed", evt.phase)
                return await self._retry_or_dlq(evt, str(exc))

    async def _retry_or_dlq(self, evt: PipelineEvent, reason: str) -> PipelineEvent | None:
        evt.attempts += 1
        if evt.attempts < self.max_retries:
            await asyncio.sleep(min(2 ** evt.attempts, 30))
            return evt
        self.dlq.produce("soc.dlq", key=evt.id, value=str({"event": evt.__dict__, "reason": reason}))
        self.dlq.flush(2)
        return None

    async def drive(self, source: asyncio.Queue[PipelineEvent]):
        while self.running:
            evt = await source.get()
            for next_phase in PHASES[PHASES.index(evt.phase):]:
                evt.phase = next_phase
                evt = await self.run_phase(evt)
                if evt is None:
                    break

if __name__ == "__main__":
    asyncio.run(Orchestrator({}, Producer({"bootstrap.servers": "kafka:9092"})).drive(asyncio.Queue()))
$py$,
$yml$
max_retries: 3
max_inflight: 256
phase_deadlines_ms:
  ingest: 1000
  parse: 2000
  enrich_fast: 3000
  correlate: 5000
  triage: 4000
  enrich_deep: 30000
  investigate: 60000
  respond: 15000
  discover: 120000
  vas: 5000
  alhf: 10000
dlq_topic: soc.dlq
metrics_port: 9100
$yml$,
$ts$
import { invokeAgent } from '../lib/agentOrchestrator';
const result = await invokeAgent('orchestrator', { event });
$ts$,
'{}'::jsonb,
ARRAY['confluent-kafka','prometheus-client','opentelemetry-api','opentelemetry-sdk'],
'Singleton; deploy as Databricks streaming job with checkpoint recovery.'),

('connector-adapter', 'python', $py$
"""Connector Adapter / Auto Loader
Normalizes inbound feeds (Syslog, Kafka, S3 Auto Loader, Kinesis, REST,
AWS/Azure/GCP cloud trails) into the canonical SOC envelope. Backpressure
aware via async iteration; emits to the Bronze Delta table.
"""
from __future__ import annotations
import asyncio, json, hashlib, logging, os
from dataclasses import dataclass
from typing import AsyncIterator, Any
import aiohttp, aioboto3
from pyspark.sql import SparkSession
from pyspark.sql import functions as F

logger = logging.getLogger("connector-adapter")

@dataclass
class CanonicalEnvelope:
    event_id: str
    source: str
    received_at: str
    raw: dict

class ConnectorAdapter:
    def __init__(self, source_name: str, kind: str, config: dict):
        self.source = source_name
        self.kind = kind
        self.config = config

    async def stream(self) -> AsyncIterator[CanonicalEnvelope]:
        if self.kind == "syslog":
            async for env in self._syslog():
                yield env
        elif self.kind == "rest":
            async for env in self._rest_poll():
                yield env
        elif self.kind == "s3":
            async for env in self._s3_autoload():
                yield env
        else:
            raise ValueError(f"unknown source kind {self.kind}")

    async def _syslog(self) -> AsyncIterator[CanonicalEnvelope]:
        port = self.config.get("port", 514)
        server = await asyncio.start_server(self._on_syslog, "0.0.0.0", port)
        async with server:
            queue: asyncio.Queue[bytes] = self.config.setdefault("_q", asyncio.Queue(8192))
            while True:
                line = await queue.get()
                yield self._wrap(line.decode(errors="replace"))

    async def _on_syslog(self, reader, _writer):
        queue: asyncio.Queue = self.config["_q"]
        while data := await reader.readline():
            await queue.put(data)

    async def _rest_poll(self) -> AsyncIterator[CanonicalEnvelope]:
        url = self.config["url"]
        interval = self.config.get("interval_s", 60)
        cursor: str | None = None
        async with aiohttp.ClientSession(headers=self.config.get("headers", {})) as s:
            while True:
                params = {"cursor": cursor} if cursor else {}
                async with s.get(url, params=params, timeout=30) as r:
                    body = await r.json()
                    for item in body.get("items", []):
                        yield self._wrap(item)
                    cursor = body.get("next_cursor")
                await asyncio.sleep(interval if not cursor else 0)

    async def _s3_autoload(self) -> AsyncIterator[CanonicalEnvelope]:
        bucket, prefix = self.config["bucket"], self.config.get("prefix", "")
        seen = set()
        async with aioboto3.Session().client("s3") as s3:
            while True:
                resp = await s3.list_objects_v2(Bucket=bucket, Prefix=prefix)
                for obj in resp.get("Contents", []):
                    if obj["Key"] in seen:
                        continue
                    seen.add(obj["Key"])
                    body = await (await s3.get_object(Bucket=bucket, Key=obj["Key"]))["Body"].read()
                    for line in body.decode().splitlines():
                        if line.strip():
                            yield self._wrap(line)
                await asyncio.sleep(15)

    def _wrap(self, raw: Any) -> CanonicalEnvelope:
        body = raw if isinstance(raw, dict) else {"line": raw}
        h = hashlib.sha256(json.dumps(body, sort_keys=True).encode()).hexdigest()
        return CanonicalEnvelope(event_id=h[:32], source=self.source,
                                 received_at=__import__("datetime").datetime.utcnow().isoformat() + "Z",
                                 raw=body)

def write_bronze(spark: SparkSession, path: str, events):
    df = spark.createDataFrame([e.__dict__ for e in events])
    (df.withColumn("ingested_at", F.current_timestamp())
       .write.format("delta").mode("append").save(path))
$py$,
$yml$
sources:
  - name: firewall-syslog
    kind: syslog
    port: 6514
  - name: m365-graph
    kind: rest
    url: https://graph.microsoft.com/v1.0/security/alerts
    interval_s: 30
  - name: cloudtrail-bucket
    kind: s3
    bucket: cloudtrail-prod
    prefix: AWSLogs/
bronze_path: s3a://soc-lake/bronze/raw_events
$yml$,
'',
'{}'::jsonb,
ARRAY['aiohttp','aioboto3','pyspark==3.5','delta-spark'],
'Run as Databricks streaming job with Auto Loader for S3-based connectors.'),

('parser-pool', 'python', $py$
"""Parser Pool (OCSF Mapper)
Parses raw payloads from heterogeneous sources (Splunk JSON, Syslog RFC5424,
Windows EVTX, Kibana NDJSON) and maps to OCSF canonical schema. Uses a
plugin registry; failed parses are routed to the parsing DLQ for replay.
"""
from __future__ import annotations
import json, logging, re
from dataclasses import dataclass
from typing import Callable, Optional
import pygrok

logger = logging.getLogger("parser-pool")

@dataclass
class ParsedEvent:
    ocsf_class_uid: int
    activity_id: int
    severity_id: int
    src_endpoint: dict
    dst_endpoint: dict
    actor: dict
    raw_data: str
    metadata: dict

class ParserPlugin:
    name: str = ""
    def matches(self, raw: dict) -> bool: ...
    def parse(self, raw: dict) -> ParsedEvent: ...

class SyslogRFC5424Parser(ParserPlugin):
    name = "syslog-rfc5424"
    PATTERN = pygrok.Grok("<%{POSINT:pri}>%{POSINT:ver} %{TIMESTAMP_ISO8601:ts} %{HOSTNAME:host} %{DATA:app} %{DATA:procid} %{DATA:msgid} %{GREEDYDATA:msg}")
    def matches(self, raw): return isinstance(raw.get("line"), str) and raw["line"].startswith("<")
    def parse(self, raw):
        m = self.PATTERN.match(raw["line"]) or {}
        return ParsedEvent(
            ocsf_class_uid=4001, activity_id=1, severity_id=int(m.get("pri", 0)) % 8,
            src_endpoint={"hostname": m.get("host")},
            dst_endpoint={}, actor={"app_name": m.get("app")},
            raw_data=raw["line"], metadata={"parser": self.name, "ts": m.get("ts")},
        )

class WindowsEvtxParser(ParserPlugin):
    name = "windows-evtx"
    def matches(self, raw): return raw.get("Channel") in {"Security", "System", "Application"}
    def parse(self, raw):
        eid = int(raw.get("EventID", 0))
        sev_map = {4625: 4, 4624: 1, 4688: 2, 4720: 3}
        return ParsedEvent(
            ocsf_class_uid=3002 if eid in (4625, 4624) else 1001,
            activity_id=1 if eid == 4624 else 2,
            severity_id=sev_map.get(eid, 1),
            src_endpoint={"ip": raw.get("IpAddress"), "hostname": raw.get("Computer")},
            dst_endpoint={"hostname": raw.get("TargetServerName")},
            actor={"user": {"name": raw.get("TargetUserName"), "domain": raw.get("TargetDomainName")}},
            raw_data=json.dumps(raw),
            metadata={"parser": self.name, "event_id": eid},
        )

class JSONPassthroughParser(ParserPlugin):
    name = "json-passthrough"
    def matches(self, raw): return True
    def parse(self, raw):
        return ParsedEvent(
            ocsf_class_uid=raw.get("class_uid", 0), activity_id=raw.get("activity_id", 0),
            severity_id=raw.get("severity_id", 1),
            src_endpoint=raw.get("src_endpoint", {}), dst_endpoint=raw.get("dst_endpoint", {}),
            actor=raw.get("actor", {}), raw_data=json.dumps(raw), metadata={"parser": self.name},
        )

class ParserPool:
    def __init__(self, plugins: list[ParserPlugin], dlq_emit: Callable[[dict, str], None]):
        self.plugins = plugins
        self.dlq_emit = dlq_emit

    def parse(self, raw: dict) -> Optional[ParsedEvent]:
        for plugin in self.plugins:
            if plugin.matches(raw):
                try:
                    return plugin.parse(raw)
                except Exception as exc:
                    logger.warning("parser %s failed: %s", plugin.name, exc)
        self.dlq_emit(raw, "no-parser-matched")
        return None

DEFAULT_PLUGINS = [SyslogRFC5424Parser(), WindowsEvtxParser(), JSONPassthroughParser()]
$py$,
$yml$
plugins:
  - syslog-rfc5424
  - windows-evtx
  - cef
  - leef
  - json-passthrough
ocsf_version: "1.3.0"
dlq_topic: soc.parse.dlq
$yml$,
'',
'{}'::jsonb,
ARRAY['pygrok','python-evtx','rapidjson'],
'Plugin registry — add parsers without redeploying core.'),

('sage-enrichment', 'python', $py$
"""Sage — Enrichment Agent (fast & deep tier)
Enriches normalized events with: GeoIP, ASN/WHOIS, IOC matches, asset
metadata, identity/HR data, vulnerability posture, threat-intel context.
Fast tier targets <50ms p95 with in-memory caches; deep tier escalates to
external APIs and vector retrieval.
"""
from __future__ import annotations
import asyncio, ipaddress, logging, time
from dataclasses import dataclass, field
from typing import Any
import aiohttp, geoip2.database, aiocache
from cachetools import TTLCache

logger = logging.getLogger("sage")

@dataclass
class Enrichment:
    geo: dict = field(default_factory=dict)
    asn: dict = field(default_factory=dict)
    ioc_matches: list = field(default_factory=list)
    asset: dict = field(default_factory=dict)
    identity: dict = field(default_factory=dict)
    vulnerabilities: list = field(default_factory=list)
    intel: list = field(default_factory=list)

class SageEnrichmentAgent:
    def __init__(self, config: dict):
        self.geo_reader = geoip2.database.Reader(config["geoip_db"])
        self.ioc_cache: TTLCache = TTLCache(maxsize=200_000, ttl=900)
        self.asset_cache: TTLCache = TTLCache(maxsize=50_000, ttl=300)
        self.asset_url = config["asset_service"]
        self.intel_url = config["intel_service"]
        self.session: aiohttp.ClientSession | None = None
        self.tier = config.get("tier", "fast")

    async def start(self):
        self.session = aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=2))

    async def enrich(self, event: dict) -> Enrichment:
        out = Enrichment()
        ip = event.get("src_endpoint", {}).get("ip")
        host = event.get("src_endpoint", {}).get("hostname")

        if ip and self._is_public(ip):
            try:
                rec = self.geo_reader.city(ip)
                out.geo = {"country": rec.country.iso_code, "city": rec.city.name,
                            "lat": rec.location.latitude, "lon": rec.location.longitude}
            except Exception:
                pass

        out.ioc_matches = await self._ioc_lookup(ip, event.get("file", {}).get("hash"))
        if host:
            out.asset = await self._asset_lookup(host)
            out.vulnerabilities = await self._vuln_lookup(host)

        if self.tier == "deep":
            out.intel = await self._intel_lookup(ip, event.get("file", {}).get("hash"))

        return out

    async def _ioc_lookup(self, ip: str | None, file_hash: str | None) -> list[dict]:
        results = []
        for indicator in filter(None, [ip, file_hash]):
            if indicator in self.ioc_cache:
                results.extend(self.ioc_cache[indicator]); continue
            async with self.session.get(f"{self.intel_url}/ioc/{indicator}") as r:
                if r.status == 200:
                    matches = (await r.json()).get("matches", [])
                    self.ioc_cache[indicator] = matches
                    results.extend(matches)
        return results

    async def _asset_lookup(self, host: str) -> dict:
        if host in self.asset_cache:
            return self.asset_cache[host]
        async with self.session.get(f"{self.asset_url}/host/{host}") as r:
            data = await r.json() if r.status == 200 else {}
            self.asset_cache[host] = data
            return data

    async def _vuln_lookup(self, host: str) -> list:
        async with self.session.get(f"{self.asset_url}/host/{host}/vulns") as r:
            return (await r.json()).get("vulns", []) if r.status == 200 else []

    async def _intel_lookup(self, *indicators: str) -> list:
        async with self.session.post(f"{self.intel_url}/bulk", json={"indicators": list(filter(None, indicators))}) as r:
            return (await r.json()).get("intel", []) if r.status == 200 else []

    @staticmethod
    def _is_public(ip: str) -> bool:
        try: return not ipaddress.ip_address(ip).is_private
        except ValueError: return False
$py$,
$yml$
geoip_db: /var/lib/maxmind/GeoLite2-City.mmdb
asset_service: http://asset-svc.soc.svc.cluster.local
intel_service: http://intel-svc.soc.svc.cluster.local
tier: fast
fast_p95_target_ms: 50
deep_p95_target_ms: 800
$yml$,
'',
'{}'::jsonb,
ARRAY['aiohttp','geoip2','cachetools','aiocache'],
'Run two replicas: tier=fast in Phase 3, tier=deep in Phase 6.'),

('ai-correlation', 'python', $py$
"""AI Correlation Agent
Evaluates Lucene/SQL/CEP correlation rules against streaming events and
synthesizes new candidate rules from analyst feedback using an LLM. Hybrid:
deterministic rule eval + LLM proposal generation.
"""
from __future__ import annotations
import asyncio, logging, json
from dataclasses import dataclass
from typing import Any
import luqum.parser as luq, sqlglot
from openai import AsyncOpenAI

logger = logging.getLogger("ai-correlation")

@dataclass
class Rule:
    id: str
    rule_type: str  # lucene | sql | cep | yara
    expression: str
    severity: str
    confidence: float

@dataclass
class CorrelationMatch:
    rule_id: str
    event_ids: list[str]
    confidence: float
    severity: str

class LuceneEvaluator:
    def __init__(self, expression: str):
        self.tree = luq.parser.parse(expression)
    def matches(self, event: dict) -> bool:
        return _eval_lucene(self.tree, event)

def _eval_lucene(node, evt: dict) -> bool:
    from luqum.tree import AndOperation, OrOperation, Not, SearchField, Word, Phrase
    if isinstance(node, AndOperation): return all(_eval_lucene(c, evt) for c in node.children)
    if isinstance(node, OrOperation):  return any(_eval_lucene(c, evt) for c in node.children)
    if isinstance(node, Not):          return not _eval_lucene(node.a, evt)
    if isinstance(node, SearchField):
        v = evt
        for part in node.name.split("."):
            v = (v or {}).get(part) if isinstance(v, dict) else None
        target = node.expr.value if hasattr(node.expr, "value") else str(node.expr)
        return str(v) == target.strip('"')
    return False

class AICorrelationAgent:
    def __init__(self, rules: list[Rule], oai: AsyncOpenAI, window_ms: int = 60_000):
        self.rules = rules
        self.window_ms = window_ms
        self.buffer: list[dict] = []
        self.oai = oai

    async def ingest(self, event: dict) -> list[CorrelationMatch]:
        self.buffer.append(event)
        cutoff = event["timestamp"] - self.window_ms
        self.buffer = [e for e in self.buffer if e["timestamp"] >= cutoff]
        matches = []
        for rule in self.rules:
            m = self._evaluate(rule)
            if m: matches.append(m)
        return matches

    def _evaluate(self, rule: Rule) -> CorrelationMatch | None:
        if rule.rule_type == "lucene":
            ev = LuceneEvaluator(rule.expression)
            hits = [e for e in self.buffer if ev.matches(e)]
        elif rule.rule_type == "sql":
            sqlglot.parse_one(rule.expression)  # validate
            hits = self._eval_sql(rule.expression)
        else:
            return None
        if not hits: return None
        return CorrelationMatch(rule_id=rule.id, event_ids=[h["id"] for h in hits],
                                 confidence=rule.confidence, severity=rule.severity)

    def _eval_sql(self, expr: str) -> list[dict]:
        # In production: defer to DuckDB on the rolling buffer
        import duckdb
        con = duckdb.connect(":memory:")
        con.register("events", __import__("pandas").DataFrame(self.buffer))
        return con.execute(expr).fetchdf().to_dict("records")

    async def synthesize_rule(self, analyst_feedback: list[dict]) -> Rule:
        prompt = f"Synthesize a correlation rule from these analyst dispositions:\n{json.dumps(analyst_feedback)[:4000]}"
        resp = await self.oai.chat.completions.create(
            model="gpt-4o", temperature=0.1,
            messages=[{"role": "system", "content": "You are a SOC detection engineer. Output Lucene only."},
                      {"role": "user", "content": prompt}])
        return Rule(id=f"synth-{hash(prompt) & 0xffff:04x}", rule_type="lucene",
                    expression=resp.choices[0].message.content.strip(),
                    severity="medium", confidence=0.6)
$py$,
$yml$
window_ms: 60000
max_buffer: 10000
synth_min_feedback: 25
llm_model: gpt-4o
llm_temperature: 0.1
$yml$,
'',
'{"model":"gpt-4o","temperature":0.1,"system":"You are a SOC detection engineer. Output Lucene only."}'::jsonb,
ARRAY['luqum','sqlglot','duckdb','openai'],
'Hybrid rule engine + RLHF rule synthesis.'),

('realtime-graph-cep', 'python', $py$
"""Real-time Graph CEP Agent
Materializes a streaming event graph with NetworkX/GraphFrames and detects
multi-step temporal patterns (privilege escalation chains, lateral movement)
across a sliding window. Pattern definitions are graph motifs.
"""
from __future__ import annotations
import asyncio, logging, time
from collections import deque
from dataclasses import dataclass
from typing import Iterable
import networkx as nx

logger = logging.getLogger("realtime-graph-cep")

@dataclass
class GraphPattern:
    pattern_id: str
    motif_query: str  # GraphFrames Cypher-like motif: "(a)-[e1]->(b); (b)-[e2]->(c)"
    constraints: dict
    severity: str

@dataclass
class PatternHit:
    pattern_id: str
    nodes: list[str]
    edges: list[tuple[str, str, dict]]
    severity: str
    detected_at: float

class RealtimeGraphCEP:
    def __init__(self, patterns: list[GraphPattern], window_s: int = 300):
        self.patterns = patterns
        self.window_s = window_s
        self.g: nx.MultiDiGraph = nx.MultiDiGraph()
        self.edge_log: deque[tuple[float, str, str, str]] = deque()

    def add_event(self, evt: dict) -> list[PatternHit]:
        src = evt.get("src_endpoint", {}).get("ip") or evt.get("actor", {}).get("user", {}).get("name")
        dst = evt.get("dst_endpoint", {}).get("ip") or evt.get("dst_endpoint", {}).get("hostname")
        if not src or not dst: return []
        ts = time.time()
        self.g.add_edge(src, dst, key=evt["id"], event_type=evt.get("event_type"), ts=ts, severity=evt.get("severity", "low"))
        self.edge_log.append((ts, src, dst, evt["id"]))
        self._evict_old(ts)
        return self._detect()

    def _evict_old(self, now: float):
        cutoff = now - self.window_s
        while self.edge_log and self.edge_log[0][0] < cutoff:
            _t, s, d, k = self.edge_log.popleft()
            try: self.g.remove_edge(s, d, key=k)
            except nx.NetworkXError: pass

    def _detect(self) -> list[PatternHit]:
        hits = []
        for pat in self.patterns:
            for chain in self._find_motif(pat):
                hits.append(PatternHit(pattern_id=pat.pattern_id, nodes=chain["nodes"],
                                       edges=chain["edges"], severity=pat.severity, detected_at=time.time()))
        return hits

    def _find_motif(self, pat: GraphPattern) -> Iterable[dict]:
        # Simplified motif: 3-step path with timestamp ordering
        if pat.pattern_id == "lateral-then-privesc":
            for a in self.g.nodes:
                for b in self.g.successors(a):
                    if not self._has_event_type(a, b, "lateral_movement"): continue
                    for c in self.g.successors(b):
                        if a == c: continue
                        if self._has_event_type(b, c, "privilege_escalation"):
                            yield {"nodes": [a, b, c], "edges": list(self.g.edges([a, b], data=True))}

    def _has_event_type(self, u: str, v: str, t: str) -> bool:
        return any(d.get("event_type") == t for _, _, d in self.g.edges((u,), data=True) if _ == v)
$py$,
$yml$
window_s: 300
max_nodes: 100000
patterns:
  - pattern_id: lateral-then-privesc
    motif_query: "(a)-[lat]->(b); (b)-[esc]->(c)"
    severity: critical
$yml$,
'',
'{}'::jsonb,
ARRAY['networkx','graphframes-py','pyspark'],
'For >100k nodes use GraphFrames on Databricks; this is the in-memory variant.'),

('negative-correlation', 'python', $py$
"""Negative Correlation Agent
Detects threats by ABSENCE of expected signals: missing heartbeats, suppressed
audit logs, dormant accounts, EDR coverage gaps. Implemented as a streaming
state-store comparing observed vs. expected event keys per window.
"""
from __future__ import annotations
import asyncio, logging, time
from dataclasses import dataclass, field
from typing import Iterable

logger = logging.getLogger("negative-correlation")

@dataclass
class AbsenceRule:
    id: str
    expected_key: str         # e.g. "host:agent_id"
    expected_event: str       # e.g. "edr.heartbeat"
    cadence_s: int            # e.g. 300 — heartbeat every 5 minutes
    grace_s: int = 60
    severity: str = "high"

@dataclass
class AbsenceAlert:
    rule_id: str
    missing_key: str
    last_seen: float | None
    severity: str

@dataclass
class _State:
    last_seen: float = 0.0
    fired_at: float = 0.0

class NegativeCorrelationAgent:
    def __init__(self, rules: list[AbsenceRule]):
        self.rules = rules
        self.state: dict[tuple[str, str], _State] = {}
        self.expected_keys: dict[str, set[str]] = {r.id: set() for r in rules}

    def register_expected(self, rule_id: str, key: str):
        self.expected_keys[rule_id].add(key)
        self.state.setdefault((rule_id, key), _State())

    def observe(self, event: dict):
        for rule in self.rules:
            if event.get("event_type") != rule.expected_event: continue
            key = self._extract_key(event, rule.expected_key)
            if key:
                self.state[(rule.id, key)] = _State(last_seen=time.time())

    def scan(self) -> list[AbsenceAlert]:
        now = time.time()
        out: list[AbsenceAlert] = []
        for rule in self.rules:
            for key in self.expected_keys[rule.id]:
                st = self.state.get((rule.id, key), _State())
                age = now - st.last_seen if st.last_seen else float("inf")
                if age > rule.cadence_s + rule.grace_s and (now - st.fired_at) > rule.cadence_s:
                    st.fired_at = now
                    self.state[(rule.id, key)] = st
                    out.append(AbsenceAlert(rule.id, key, st.last_seen or None, rule.severity))
        return out

    def _extract_key(self, event: dict, key_spec: str) -> str | None:
        parts = key_spec.split(":")
        path = parts[1].split(".") if len(parts) > 1 else parts[0].split(".")
        v = event
        for p in path:
            v = (v or {}).get(p) if isinstance(v, dict) else None
        return str(v) if v else None

async def runner(agent: NegativeCorrelationAgent, scan_interval_s: int = 30):
    while True:
        for alert in agent.scan():
            logger.warning("absence detected: %s", alert)
        await asyncio.sleep(scan_interval_s)
$py$,
$yml$
scan_interval_s: 30
rules:
  - id: edr-heartbeat-missing
    expected_key: host:src_endpoint.hostname
    expected_event: edr.heartbeat
    cadence_s: 300
    grace_s: 120
    severity: critical
  - id: privileged-login-absent-business-hours
    expected_key: user:actor.user.name
    expected_event: auth.success
    cadence_s: 86400
    severity: medium
$yml$,
'',
'{}'::jsonb,
ARRAY['asyncio'],
'Critical for catching disabled-by-attacker scenarios.'),

('atlas-triage', 'python', $py$
"""Atlas — Triage Agent
Hybrid alert triage: deterministic rules + Random Forest classifier + GPT-4o
reasoning for edge cases. Tracks repeat offenders and suppresses known-FP
fingerprints. Owns the decision to dismiss / queue / escalate.
"""
from __future__ import annotations
import asyncio, hashlib, logging, time
from dataclasses import dataclass
from typing import Any
import numpy as np
import joblib
from openai import AsyncOpenAI

logger = logging.getLogger("atlas")

@dataclass
class TriageDecision:
    action: str  # dismiss | queue | escalate
    severity: str
    confidence: float
    reasoning: str

class AtlasTriageAgent:
    def __init__(self, ml_model_path: str, oai: AsyncOpenAI, fp_patterns: list[dict]):
        self.model = joblib.load(ml_model_path)
        self.oai = oai
        self.fp_patterns = fp_patterns
        self.repeat_offender: dict[str, int] = {}
        self.fp_fingerprints: dict[str, float] = {}

    async def triage(self, alert: dict) -> TriageDecision:
        fp = self._fingerprint(alert)
        if fp in self.fp_fingerprints and time.time() - self.fp_fingerprints[fp] < 86400:
            return TriageDecision("dismiss", "info", 0.95, "known false-positive fingerprint")

        if any(self._matches_pattern(alert, pat) for pat in self.fp_patterns):
            self.fp_fingerprints[fp] = time.time()
            return TriageDecision("dismiss", "info", 0.9, "matches FP pattern")

        features = self._features(alert)
        probs = self.model.predict_proba([features])[0]
        ml_label = ["dismiss", "queue", "escalate"][int(np.argmax(probs))]
        ml_conf = float(np.max(probs))

        if ml_conf < 0.65 or ml_label == "escalate":
            llm = await self._llm_review(alert, ml_label, ml_conf)
            return llm
        sev = "high" if ml_label == "escalate" else "medium" if ml_label == "queue" else "info"
        return TriageDecision(ml_label, sev, ml_conf, f"RF model decision (p={ml_conf:.2f})")

    def _features(self, alert: dict) -> list[float]:
        sev_map = {"critical": 4, "high": 3, "medium": 2, "low": 1, "info": 0}
        actor = alert.get("actor", {}).get("user", {}).get("name", "")
        return [
            sev_map.get(alert.get("severity", "info"), 0),
            len(alert.get("ioc_matches", [])),
            len(alert.get("vulnerabilities", [])),
            self.repeat_offender.get(actor, 0),
            1.0 if alert.get("asset", {}).get("crown_jewel") else 0.0,
            alert.get("score", 0.5),
        ]

    def _fingerprint(self, alert: dict) -> str:
        key = f"{alert.get('rule_id')}|{alert.get('actor',{}).get('user',{}).get('name')}|{alert.get('event_type')}"
        return hashlib.sha1(key.encode()).hexdigest()

    def _matches_pattern(self, alert: dict, pat: dict) -> bool:
        return all(_get(alert, k) == v for k, v in pat.items())

    async def _llm_review(self, alert, ml_label, ml_conf) -> TriageDecision:
        resp = await self.oai.chat.completions.create(
            model="gpt-4o", temperature=0.0,
            messages=[
                {"role": "system", "content": "You are a tier-1 SOC analyst. Reply JSON: {action, severity, confidence, reasoning}."},
                {"role": "user", "content": f"ML suggested {ml_label} (conf {ml_conf:.2f}). Alert: {alert}"}])
        import json; data = json.loads(resp.choices[0].message.content)
        return TriageDecision(**data)

def _get(d, dotted):
    for p in dotted.split("."): d = (d or {}).get(p) if isinstance(d, dict) else None
    return d
$py$,
$yml$
ml_model_path: /models/triage_rf_v7.joblib
llm_review_threshold: 0.65
fp_patterns:
  - rule_id: vuln-scanner-noise
    actor.user.name: scanner-svc
$yml$,
'',
'{"model":"gpt-4o","temperature":0.0}'::jsonb,
ARRAY['scikit-learn','joblib','numpy','openai'],
'Owns dismiss/escalate decision; emits to alerts table with disposition.'),

('vector-memory', 'python', $py$
"""Vector Memory Agent
Stores and retrieves event/IOC embeddings for similarity recall and
historical context. Backed by Databricks Vector Search (production) or
pgvector (fallback). Embeddings via gte-large or text-embedding-3-large.
"""
from __future__ import annotations
import asyncio, logging
from dataclasses import dataclass
import numpy as np
from openai import AsyncOpenAI
import asyncpg

logger = logging.getLogger("vector-memory")

@dataclass
class MemoryEntry:
    id: str
    kind: str  # event | ioc | case
    text: str
    metadata: dict
    embedding: np.ndarray

class VectorMemoryAgent:
    def __init__(self, pg_pool: asyncpg.Pool, oai: AsyncOpenAI, model: str = "text-embedding-3-large"):
        self.pool = pg_pool
        self.oai = oai
        self.model = model

    async def embed(self, text: str) -> np.ndarray:
        resp = await self.oai.embeddings.create(model=self.model, input=text[:8000])
        return np.array(resp.data[0].embedding, dtype=np.float32)

    async def upsert(self, entry: MemoryEntry):
        if entry.embedding is None:
            entry.embedding = await self.embed(entry.text)
        async with self.pool.acquire() as con:
            await con.execute(
                """insert into vector_memory (id, kind, text, metadata, embedding)
                   values ($1,$2,$3,$4::jsonb,$5)
                   on conflict (id) do update
                   set embedding = excluded.embedding, metadata = excluded.metadata""",
                entry.id, entry.kind, entry.text, __import__("json").dumps(entry.metadata),
                entry.embedding.tolist())

    async def recall(self, query: str, kind: str | None = None, top_k: int = 5) -> list[MemoryEntry]:
        q = await self.embed(query)
        sql = """select id, kind, text, metadata, embedding,
                        1 - (embedding <=> $1::vector) as score
                 from vector_memory
                 where ($2::text is null or kind = $2)
                 order by embedding <=> $1::vector
                 limit $3"""
        async with self.pool.acquire() as con:
            rows = await con.fetch(sql, q.tolist(), kind, top_k)
        return [MemoryEntry(r["id"], r["kind"], r["text"], dict(r["metadata"] or {}),
                            np.array(r["embedding"])) for r in rows]

    async def cluster_outliers(self, kind: str, threshold: float = 0.85) -> list[str]:
        async with self.pool.acquire() as con:
            rows = await con.fetch(
                """select id, embedding from vector_memory where kind=$1 limit 50000""", kind)
        if not rows: return []
        X = np.stack([np.array(r["embedding"]) for r in rows])
        centroid = X.mean(0)
        norms = np.linalg.norm(X - centroid, axis=1)
        return [rows[i]["id"] for i in np.where(norms > threshold * norms.std() + norms.mean())[0]]
$py$,
$yml$
embedding_model: text-embedding-3-large
top_k_default: 5
outlier_threshold: 0.85
$yml$,
'',
'{"embedding_model":"text-embedding-3-large"}'::jsonb,
ARRAY['openai','asyncpg','numpy','pgvector'],
'Use Databricks Vector Search for >5M vectors; pgvector for <5M.'),

('cti-attribution', 'python', $py$
"""CTI Attribution Agent
Maps observed TTPs (MITRE technique IDs, IOCs, behavioral signatures) to
known threat actor groups and campaigns using STIX/TAXII intel + LLM
reasoning. Returns ranked attribution candidates with evidence.
"""
from __future__ import annotations
import asyncio, json, logging
from dataclasses import dataclass
from typing import Any
import aiohttp
from openai import AsyncOpenAI

logger = logging.getLogger("cti-attribution")

@dataclass
class AttributionCandidate:
    actor: str
    campaign: str | None
    confidence: float
    evidence: list[str]
    references: list[str]

class CTIAttributionAgent:
    def __init__(self, taxii_url: str, taxii_collection: str, oai: AsyncOpenAI, api_key: str):
        self.taxii_url = taxii_url
        self.collection = taxii_collection
        self.oai = oai
        self.api_key = api_key
        self.actor_index: dict[str, dict] = {}

    async def hydrate_actor_index(self):
        async with aiohttp.ClientSession(headers={"Authorization": f"Bearer {self.api_key}"}) as s:
            async with s.get(f"{self.taxii_url}/collections/{self.collection}/objects?type=intrusion-set") as r:
                bundle = await r.json()
        for obj in bundle.get("objects", []):
            self.actor_index[obj["name"]] = obj

    async def attribute(self, technique_ids: list[str], iocs: list[str],
                        behavioral_signatures: list[str]) -> list[AttributionCandidate]:
        if not self.actor_index:
            await self.hydrate_actor_index()

        scored: list[AttributionCandidate] = []
        for actor_name, obj in self.actor_index.items():
            actor_ttps = set(obj.get("aliases", []) + obj.get("x_techniques", []))
            overlap = len(actor_ttps & set(technique_ids))
            if overlap == 0: continue
            confidence = min(0.95, overlap / max(len(technique_ids), 1))
            scored.append(AttributionCandidate(
                actor=actor_name, campaign=obj.get("x_campaign"),
                confidence=confidence,
                evidence=[f"shared technique {t}" for t in actor_ttps & set(technique_ids)],
                references=obj.get("external_references", [])))

        scored.sort(key=lambda c: c.confidence, reverse=True)
        top = scored[:5]
        if top:
            top = await self._llm_rerank(top, technique_ids, iocs, behavioral_signatures)
        return top

    async def _llm_rerank(self, candidates: list[AttributionCandidate],
                          ttps: list[str], iocs: list[str], behavioral: list[str]) -> list[AttributionCandidate]:
        prompt = (
            f"Given TTPs={ttps}, IOCs={iocs[:20]}, behavioral_signatures={behavioral[:10]}, "
            f"rerank these attribution candidates by likelihood. Return JSON list of "
            f"{{actor,confidence,evidence}}. Candidates: "
            f"{json.dumps([c.__dict__ for c in candidates])}")
        resp = await self.oai.chat.completions.create(
            model="gpt-4o", temperature=0.0,
            messages=[{"role": "system", "content": "You are a CTI analyst. Output JSON only."},
                      {"role": "user", "content": prompt}])
        try:
            ranked = json.loads(resp.choices[0].message.content)
            return [AttributionCandidate(actor=r["actor"], campaign=None,
                                          confidence=float(r["confidence"]),
                                          evidence=r.get("evidence", []), references=[]) for r in ranked]
        except Exception:
            return candidates
$py$,
$yml$
taxii_url: https://taxii.mitre.org/api/v21
collection: enterprise-attack
top_k: 5
llm_rerank: true
$yml$,
'',
'{"model":"gpt-4o","temperature":0.0}'::jsonb,
ARRAY['aiohttp','openai','stix2'],
'Hydrate actor index hourly; cache in Redis for low-latency attribution.')

ON CONFLICT (slug) DO UPDATE
  SET production_code = EXCLUDED.production_code,
      config_yaml = EXCLUDED.config_yaml,
      llm_config = EXCLUDED.llm_config,
      dependencies = EXCLUDED.dependencies,
      notes = EXCLUDED.notes;
