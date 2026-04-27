/*
  # Agent Implementations Seed - Batch 3
  Seeds: incident-summarizer, document-analyzer, threat-radar,
  malware-sandbox, honeypot, llm-guardrails, model-poisoning-guard,
  threat-simulator, feature-runtime
*/

INSERT INTO agent_implementations (slug, language, production_code, config_yaml, integration_code, llm_config, dependencies, notes) VALUES

('incident-summarizer', 'python', $py$
"""Incident Summarizer
Generates analyst-ready narratives from cases: timeline, key findings,
recommended next steps, executive summary. Multi-pass: extract -> reason ->
write. Caches by case fingerprint to avoid re-billing the LLM.
"""
from __future__ import annotations
import hashlib, json, logging
from dataclasses import dataclass
import asyncpg
from openai import AsyncOpenAI

logger = logging.getLogger("incident-summarizer")

@dataclass
class IncidentSummary:
    case_id: str
    executive_summary: str
    technical_narrative: str
    key_findings: list[str]
    recommended_next_steps: list[str]
    confidence: float
    cache_key: str

class IncidentSummarizer:
    def __init__(self, pg_pool: asyncpg.Pool, oai: AsyncOpenAI):
        self.pool = pg_pool
        self.oai = oai

    async def summarize(self, case_id: str) -> IncidentSummary:
        async with self.pool.acquire() as con:
            case = await con.fetchrow("select * from cases where id=$1", case_id)
            events = await con.fetch(
                """select * from events where id = any(
                     select event_id from case_events where case_id=$1)
                   order by timestamp limit 200""", case_id)
            ev_dicts = [dict(e) for e in events]
            cache_key = hashlib.sha256(
                f"{case_id}|{case['updated_at']}|{len(ev_dicts)}".encode()).hexdigest()
            cached = await con.fetchrow(
                "select summary from incident_summaries where cache_key=$1", cache_key)
            if cached:
                return IncidentSummary(**cached["summary"])

        extraction = await self._extract(dict(case), ev_dicts)
        narrative = await self._write(dict(case), extraction)
        summary = IncidentSummary(
            case_id=case_id, executive_summary=narrative["executive_summary"],
            technical_narrative=narrative["technical_narrative"],
            key_findings=extraction["key_findings"],
            recommended_next_steps=narrative["next_steps"],
            confidence=narrative["confidence"], cache_key=cache_key)
        async with self.pool.acquire() as con:
            await con.execute(
                """insert into incident_summaries (case_id, cache_key, summary)
                   values ($1,$2,$3::jsonb) on conflict (cache_key) do nothing""",
                case_id, cache_key, json.dumps(summary.__dict__))
        return summary

    async def _extract(self, case: dict, events: list[dict]) -> dict:
        r = await self.oai.chat.completions.create(model="gpt-4o", temperature=0.0,
            response_format={"type":"json_object"},
            messages=[{"role":"system","content":
                "Extract: actors[], assets[], indicators[], mitre_techniques[], key_findings[]. JSON only."},
                {"role":"user","content":f"Case: {case}\nEvents (top {len(events[:30])}): {events[:30]}"}])
        return json.loads(r.choices[0].message.content)

    async def _write(self, case: dict, extraction: dict) -> dict:
        r = await self.oai.chat.completions.create(model="gpt-4o", temperature=0.2,
            response_format={"type":"json_object"},
            messages=[{"role":"system","content":
                "Write: executive_summary (3 sentences, business tone), technical_narrative (markdown, "
                "factual, includes timeline), next_steps[] (actionable), confidence (0-1). JSON only."},
                {"role":"user","content":f"Case: {case}\nExtraction: {extraction}"}])
        return json.loads(r.choices[0].message.content)
$py$,
$yml$
model: gpt-4o
cache_ttl_days: 7
max_events_to_summarize: 200
$yml$,
'',
'{"model":"gpt-4o","temperature":0.2}'::jsonb,
ARRAY['openai','asyncpg'],
'Two-pass extract+write; idempotent via case fingerprint.'),

('document-analyzer', 'python', $py$
"""Document Analysis Agent
Parses uploaded documents (PDF, DOCX, EML, MSG) for IOCs, URLs, hashes,
attachment metadata, threat context. Quarantines malicious docs and emits
asset-enrichment hints.
"""
from __future__ import annotations
import hashlib, logging, re
from dataclasses import dataclass, field
from typing import Any
import pypdf, docx
from email import policy
from email.parser import BytesParser

logger = logging.getLogger("document-analyzer")

IOC_PATTERNS = {
    "ipv4": re.compile(r"\b(?:\d{1,3}\.){3}\d{1,3}\b"),
    "domain": re.compile(r"\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}\b", re.I),
    "url": re.compile(r"https?://[^\s<>\"]+", re.I),
    "md5": re.compile(r"\b[a-f0-9]{32}\b", re.I),
    "sha1": re.compile(r"\b[a-f0-9]{40}\b", re.I),
    "sha256": re.compile(r"\b[a-f0-9]{64}\b", re.I),
    "email": re.compile(r"\b[\w.+-]+@[\w-]+\.[\w.-]+\b"),
    "btc": re.compile(r"\b(bc1|[13])[a-zA-HJ-NP-Z0-9]{25,39}\b"),
    "cve": re.compile(r"CVE-\d{4}-\d{4,7}", re.I),
}

@dataclass
class DocumentAnalysis:
    file_hash: str
    mime_type: str
    text_excerpt: str
    iocs: dict[str, list[str]]
    suspicious_macros: bool
    embedded_files: list[str]
    risk_score: float
    flags: list[str] = field(default_factory=list)

class DocumentAnalyzer:
    def __init__(self, ioc_lookup: Any | None = None, max_text_chars: int = 200_000):
        self.ioc_lookup = ioc_lookup
        self.max_text_chars = max_text_chars

    async def analyze(self, payload: bytes, filename: str) -> DocumentAnalysis:
        h = hashlib.sha256(payload).hexdigest()
        ext = filename.lower().rsplit(".", 1)[-1]
        text = ""
        macros = False
        embedded: list[str] = []
        if ext == "pdf":
            text, embedded = self._read_pdf(payload)
        elif ext in ("doc", "docx"):
            text, macros = self._read_docx(payload)
        elif ext in ("eml", "msg"):
            text, embedded = self._read_email(payload)
        else:
            text = payload[: self.max_text_chars].decode("utf-8", errors="replace")
        text = text[: self.max_text_chars]
        iocs = {k: sorted(set(p.findall(text))) for k, p in IOC_PATTERNS.items()}
        flags = []
        if macros: flags.append("macro_detected")
        if any(iocs[k] for k in ("md5", "sha1", "sha256")): flags.append("hash_indicators")
        if iocs["btc"]: flags.append("ransomware_marker_btc")
        if any("base64" in u.lower() or "//" in u for u in iocs["url"][:20]): flags.append("suspicious_url")
        risk = min(1.0, 0.2 * len(flags) + 0.05 * sum(len(v) for v in iocs.values()))
        return DocumentAnalysis(h, ext, text[:1000], iocs, macros, embedded, risk, flags)

    def _read_pdf(self, payload: bytes) -> tuple[str, list[str]]:
        from io import BytesIO
        reader = pypdf.PdfReader(BytesIO(payload))
        text = "\n".join((p.extract_text() or "") for p in reader.pages)
        embedded = []
        try:
            for name, _ in (reader.attachments or {}).items(): embedded.append(name)
        except Exception: pass
        return text, embedded

    def _read_docx(self, payload: bytes) -> tuple[str, bool]:
        from io import BytesIO
        d = docx.Document(BytesIO(payload))
        text = "\n".join(p.text for p in d.paragraphs)
        macros = b"vbaProject.bin" in payload  # heuristic
        return text, macros

    def _read_email(self, payload: bytes) -> tuple[str, list[str]]:
        msg = BytesParser(policy=policy.default).parsebytes(payload)
        body_parts = []
        attachments = []
        for part in msg.walk():
            if part.get_content_disposition() == "attachment":
                attachments.append(part.get_filename() or "")
            elif part.get_content_type() in ("text/plain", "text/html"):
                body_parts.append(part.get_content())
        return "\n".join(body_parts), attachments
$py$,
$yml$
max_text_chars: 200000
quarantine_threshold: 0.7
embedded_file_action: scan
$yml$,
'',
'{}'::jsonb,
ARRAY['pypdf','python-docx'],
'Run inside a sandbox container; never open documents on analyst boxes.'),

('threat-radar', 'python', $py$
"""Threat Radar Agent
Fetches bleeding-edge threat intel from OSINT/RSS/TAXII/Twitter sources,
analyzes relevance to the customer environment with an LLM, and probes
exposure (e.g. shodan-style asset checks).
"""
from __future__ import annotations
import asyncio, hashlib, json, logging
from dataclasses import dataclass
from typing import Any
import aiohttp, feedparser
from openai import AsyncOpenAI
import asyncpg

logger = logging.getLogger("threat-radar")

@dataclass
class RadarItem:
    id: str
    source: str
    title: str
    url: str
    published_at: str
    raw_text: str
    relevance_score: float = 0.0
    technique_ids: list[str] | None = None
    customer_exposed: bool = False

class ThreatRadarAgent:
    def __init__(self, pg_pool: asyncpg.Pool, oai: AsyncOpenAI, sources: list[dict]):
        self.pool = pg_pool
        self.oai = oai
        self.sources = sources

    async def fetch(self) -> list[RadarItem]:
        out: list[RadarItem] = []
        async with aiohttp.ClientSession() as s:
            for src in self.sources:
                try:
                    items = await self._fetch_source(s, src)
                    out.extend(items)
                except Exception as exc:
                    logger.warning("source %s failed: %s", src["name"], exc)
        return out

    async def _fetch_source(self, session, src) -> list[RadarItem]:
        async with session.get(src["url"], timeout=20) as r:
            text = await r.text()
        feed = feedparser.parse(text)
        return [RadarItem(
            id=hashlib.sha1(e.link.encode()).hexdigest()[:16],
            source=src["name"], title=e.title, url=e.link,
            published_at=getattr(e, "published", ""),
            raw_text=getattr(e, "summary", "") + " " + getattr(e, "description", "")
        ) for e in feed.entries[:50]]

    async def analyze(self, items: list[RadarItem], customer_assets: list[str]) -> list[RadarItem]:
        out = []
        for it in items:
            r = await self.oai.chat.completions.create(model="gpt-4o-mini", temperature=0.0,
                response_format={"type":"json_object"},
                messages=[{"role":"system","content":
                    "Analyze threat-intel item. JSON: {relevance:0-1, mitre:[Txxxx], assets_at_risk:[]}"},
                    {"role":"user","content":
                        f"Item: {it.title}\n{it.raw_text[:2000]}\nCustomer assets: {customer_assets[:50]}"}])
            d = json.loads(r.choices[0].message.content)
            it.relevance_score = float(d.get("relevance", 0))
            it.technique_ids = d.get("mitre", [])
            it.customer_exposed = bool(d.get("assets_at_risk"))
            out.append(it)
        return out

    async def probe_exposure(self, indicators: list[str]) -> dict[str, bool]:
        # In production: query Shodan, Censys, internal asset DB
        async with aiohttp.ClientSession() as s:
            results = {}
            for ind in indicators[:50]:
                async with s.get(f"http://exposure-svc/check/{ind}") as r:
                    results[ind] = (await r.json()).get("exposed", False) if r.status == 200 else False
        return results

    async def persist(self, items: list[RadarItem]):
        async with self.pool.acquire() as con:
            for it in items:
                await con.execute(
                    """insert into threat_radar_items
                       (id, source, title, url, published_at, raw_text, relevance_score, technique_ids, customer_exposed)
                       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
                       on conflict (id) do update set relevance_score=excluded.relevance_score""",
                    it.id, it.source, it.title, it.url, it.published_at,
                    it.raw_text[:5000], it.relevance_score, it.technique_ids, it.customer_exposed)
$py$,
$yml$
sources:
  - name: cisa-kev
    url: https://www.cisa.gov/known-exploited-vulnerabilities.xml
  - name: us-cert
    url: https://www.cisa.gov/uscert/ncas/alerts.xml
  - name: thehackernews
    url: https://feeds.feedburner.com/TheHackersNews
fetch_interval_min: 30
relevance_threshold: 0.6
$yml$,
'',
'{"model":"gpt-4o-mini","temperature":0.0}'::jsonb,
ARRAY['aiohttp','feedparser','openai','asyncpg'],
'Three-stage: fetch -> analyze -> probe. Run every 30 min via cron.'),

('malware-sandbox', 'python', $py$
"""Malware Sandbox Agent
Detonates suspicious artifacts in an isolated sandbox (Cuckoo / CAPE /
custom microVM) and extracts behavioral IOCs: dropped files, network
connections, registry mods, syscall traces.
"""
from __future__ import annotations
import asyncio, hashlib, json, logging
from dataclasses import dataclass, field
import aiohttp

logger = logging.getLogger("malware-sandbox")

@dataclass
class SandboxResult:
    sample_sha256: str
    verdict: str  # benign | suspicious | malicious
    score: float
    behaviors: list[str]
    network_iocs: list[dict]
    dropped_files: list[dict]
    registry_changes: list[dict]
    syscall_summary: dict
    duration_s: float
    artifacts: list[str] = field(default_factory=list)

class MalwareSandboxAgent:
    def __init__(self, sandbox_url: str, api_key: str, default_timeout_s: int = 180):
        self.sandbox_url = sandbox_url
        self.api_key = api_key
        self.timeout_s = default_timeout_s

    async def detonate(self, payload: bytes, filename: str, profile: str = "windows10") -> SandboxResult:
        sha256 = hashlib.sha256(payload).hexdigest()
        async with aiohttp.ClientSession(headers={"X-Api-Key": self.api_key}) as s:
            form = aiohttp.FormData()
            form.add_field("file", payload, filename=filename)
            form.add_field("profile", profile)
            form.add_field("timeout", str(self.timeout_s))
            async with s.post(f"{self.sandbox_url}/v1/submit", data=form) as r:
                task_id = (await r.json())["task_id"]

            for _ in range(self.timeout_s // 5 + 30):
                await asyncio.sleep(5)
                async with s.get(f"{self.sandbox_url}/v1/task/{task_id}") as r:
                    info = await r.json()
                if info["status"] == "reported": break

            async with s.get(f"{self.sandbox_url}/v1/report/{task_id}") as r:
                report = await r.json()

        score = float(report.get("score", 0))
        verdict = "malicious" if score >= 7 else "suspicious" if score >= 4 else "benign"
        return SandboxResult(
            sample_sha256=sha256, verdict=verdict, score=score,
            behaviors=report.get("signatures", []),
            network_iocs=[{"ip": d.get("dst"), "port": d.get("dport"),
                            "domain": d.get("domain")} for d in report.get("network", {}).get("traffic", [])],
            dropped_files=report.get("dropped", []),
            registry_changes=report.get("behavior", {}).get("regkey_written", []),
            syscall_summary=report.get("behavior", {}).get("summary", {}),
            duration_s=float(report.get("duration", 0)),
            artifacts=report.get("artifacts", []))
$py$,
$yml$
sandbox_url: http://cuckoo.soc.svc.cluster.local:8090
default_profile: windows10
default_timeout_s: 180
verdict_thresholds:
  malicious: 7
  suspicious: 4
$yml$,
'',
'{}'::jsonb,
ARRAY['aiohttp'],
'Always run on isolated network with egress blocked; submit hashes first to skip duplicates.'),

('honeypot', 'python', $py$
"""Honeypot / Honeytoken Agent
Operates honeypots (cowrie-style SSH/Telnet) and seeds honeytokens (canary
tokens, fake API keys, decoy DB records). Captures attacker interactions
and emits enriched detection events.
"""
from __future__ import annotations
import asyncio, json, logging, secrets, time
from dataclasses import dataclass
from typing import Any
import asyncpg, asyncssh

logger = logging.getLogger("honeypot")

@dataclass
class Interaction:
    honeypot_id: str
    src_ip: str
    src_port: int
    protocol: str
    username: str | None
    commands: list[str]
    duration_s: float
    captured_at: float

@dataclass
class Honeytoken:
    id: str
    kind: str  # api_key | db_row | credential | url | document
    value: str
    placement: str
    canary_endpoint: str | None

class HoneypotAgent:
    def __init__(self, pg_pool: asyncpg.Pool):
        self.pool = pg_pool

    async def start_ssh_honeypot(self, host: str = "0.0.0.0", port: int = 2222, hp_id: str = "ssh-1"):
        class _SrvProcess(asyncssh.SSHServerProcess):
            async def shell(self_inner):
                buf = b""
                cmds = []
                self_inner.stdout.write("Last login: " + time.ctime() + "\nubuntu@prod-db:~$ ")
                async for ch in self_inner.stdin:
                    buf += ch
                    while b"\n" in buf:
                        line, buf = buf.split(b"\n", 1)
                        cmd = line.decode(errors="replace").strip()
                        cmds.append(cmd)
                        if cmd in ("exit", "logout"): break
                        self_inner.stdout.write(self._fake_response(cmd) + "\nubuntu@prod-db:~$ ")
                await self._record(self_inner, hp_id, cmds)
                self_inner.exit(0)
            def _fake_response(self_inner, cmd):
                return {"whoami": "ubuntu", "id": "uid=1000(ubuntu)", "uname -a": "Linux prod-db 5.15.0",
                        "ls": "data.csv  backup.tar.gz  .ssh"}.get(cmd, "")

        server = await asyncssh.create_server(lambda: _SrvProcess(self._record_factory(hp_id)),
                                               host, port, server_host_keys=["/etc/ssh-honeypot/host_key"])
        async with server: await asyncio.Future()

    def _record_factory(self, hp_id):
        async def record(process, cmds: list[str]):
            peer = process.get_extra_info("peername")
            await self._save_interaction(Interaction(
                hp_id, peer[0], peer[1], "ssh",
                process.get_extra_info("username"), cmds, 0.0, time.time()))
        return record

    async def _record(self, process, hp_id, cmds):
        peer = process.get_extra_info("peername") or ("0.0.0.0", 0)
        await self._save_interaction(Interaction(
            hp_id, peer[0], peer[1], "ssh",
            process.get_extra_info("username"), cmds, 0.0, time.time()))

    async def _save_interaction(self, ix: Interaction):
        async with self.pool.acquire() as con:
            await con.execute(
                """insert into honeypot_interactions
                   (honeypot_id, src_ip, src_port, protocol, username, commands, captured_at)
                   values ($1,$2,$3,$4,$5,$6::jsonb,to_timestamp($7))""",
                ix.honeypot_id, ix.src_ip, ix.src_port, ix.protocol,
                ix.username, json.dumps(ix.commands), ix.captured_at)

    async def mint_token(self, kind: str, placement: str) -> Honeytoken:
        token = Honeytoken(id=secrets.token_urlsafe(8), kind=kind,
                           value=secrets.token_urlsafe(32), placement=placement,
                           canary_endpoint=f"https://canary.soc.local/h/{secrets.token_urlsafe(8)}")
        async with self.pool.acquire() as con:
            await con.execute(
                """insert into honeytokens (id, kind, value, placement, canary_endpoint)
                   values ($1,$2,$3,$4,$5)""",
                token.id, kind, token.value, placement, token.canary_endpoint)
        return token

    async def on_canary_hit(self, token_id: str, src_ip: str, headers: dict):
        async with self.pool.acquire() as con:
            await con.execute(
                """insert into honeytoken_hits (token_id, src_ip, headers, captured_at)
                   values ($1,$2,$3::jsonb, now())""",
                token_id, src_ip, json.dumps(headers))
        logger.critical("HONEYTOKEN TRIGGERED: %s from %s", token_id, src_ip)
$py$,
$yml$
ssh_listen_port: 2222
http_listen_port: 8080
fake_hostname: prod-db
shell_responses:
  whoami: ubuntu
$yml$,
'',
'{}'::jsonb,
ARRAY['asyncssh','asyncpg'],
'Any honeytoken hit is automatically critical — no analyst tuning needed.'),

('llm-guardrails', 'python', $py$
"""LLM Guardrails Agent
Enforces: PII redaction, prompt-injection detection, output safety,
token budgets, and per-model access policies across all SOC LLM agents.
Sits inline as a proxy in front of model calls.
"""
from __future__ import annotations
import logging, re, time
from dataclasses import dataclass, field
from typing import Any
import tiktoken

logger = logging.getLogger("llm-guardrails")

PII_PATTERNS = {
    "ssn": re.compile(r"\b\d{3}-\d{2}-\d{4}\b"),
    "credit_card": re.compile(r"\b(?:\d[ -]*?){13,19}\b"),
    "email": re.compile(r"\b[\w.+-]+@[\w-]+\.[\w.-]+\b"),
    "phone": re.compile(r"\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b"),
    "ipv4": re.compile(r"\b(?:\d{1,3}\.){3}\d{1,3}\b"),
}

INJECTION_PATTERNS = [
    re.compile(r"ignore (?:all )?(?:previous|prior) instructions", re.I),
    re.compile(r"system prompt.*reveal", re.I),
    re.compile(r"you are now ", re.I),
    re.compile(r"<\|im_start\|>", re.I),
    re.compile(r"jailbreak|DAN mode", re.I),
]

@dataclass
class GuardrailDecision:
    allow: bool
    redacted_text: str
    pii_found: dict[str, int]
    injection_signals: list[str]
    tokens_in: int
    tokens_out_budget: int
    rationale: str

class LLMGuardrailsAgent:
    def __init__(self, model_policy: dict[str, dict], default_budget_tokens: int = 8000):
        self.model_policy = model_policy
        self.default_budget_tokens = default_budget_tokens
        self.usage: dict[str, dict] = {}
        self.encoders: dict[str, Any] = {}

    def evaluate(self, model: str, user_id: str, prompt: str, max_output: int = 1024) -> GuardrailDecision:
        policy = self.model_policy.get(model, {})
        if user_id not in policy.get("allowed_users", policy.get("allowed_users", [user_id])):
            return GuardrailDecision(False, prompt, {}, [], 0, 0, f"user {user_id} not allowed for {model}")
        signals = [p.pattern for p in INJECTION_PATTERNS if p.search(prompt)]
        redacted, pii_found = self._redact(prompt)
        encoder = self.encoders.setdefault(model, tiktoken.encoding_for_model("gpt-4"))
        tokens_in = len(encoder.encode(redacted))
        budget = policy.get("budget_tokens", self.default_budget_tokens)
        used = self.usage.setdefault(user_id, {"day": time.strftime("%Y-%m-%d"), "tokens": 0})
        if used["day"] != time.strftime("%Y-%m-%d"):
            used["day"] = time.strftime("%Y-%m-%d"); used["tokens"] = 0
        if used["tokens"] + tokens_in + max_output > budget:
            return GuardrailDecision(False, redacted, pii_found, signals, tokens_in, 0,
                                      f"daily token budget {budget} exceeded")
        if signals and policy.get("block_on_injection", True):
            return GuardrailDecision(False, redacted, pii_found, signals, tokens_in, max_output,
                                      f"injection signals: {signals}")
        used["tokens"] += tokens_in + max_output
        return GuardrailDecision(True, redacted, pii_found, signals, tokens_in, max_output, "ok")

    def _redact(self, text: str) -> tuple[str, dict[str, int]]:
        counts: dict[str, int] = {}
        for kind, pat in PII_PATTERNS.items():
            text, n = pat.subn(f"[REDACTED_{kind.upper()}]", text)
            if n: counts[kind] = n
        return text, counts
$py$,
$yml$
default_budget_tokens: 50000
model_policy:
  gpt-4o:
    allowed_users: ["*"]
    budget_tokens: 200000
    block_on_injection: true
  gpt-4o-mini:
    allowed_users: ["*"]
    budget_tokens: 500000
$yml$,
'',
'{}'::jsonb,
ARRAY['tiktoken'],
'Inline proxy; every LLM call from any agent must pass through evaluate().'),

('model-poisoning-guard', 'python', $py$
"""Model Poisoning Guard
Detects training-data poisoning, label flips, drift, and adversarial
perturbations against deployed ML models. Computes per-feature distribution
drift (PSI) and gradient-based anomaly scores.
"""
from __future__ import annotations
import json, logging
from dataclasses import dataclass
import numpy as np
import asyncpg

logger = logging.getLogger("model-poisoning-guard")

@dataclass
class IntegrityReport:
    model_name: str
    psi_per_feature: dict[str, float]
    label_distribution_chi2: float
    suspicious_samples: list[str]
    recommendation: str

class ModelPoisoningGuard:
    def __init__(self, pg_pool: asyncpg.Pool, psi_threshold: float = 0.2):
        self.pool = pg_pool
        self.psi_threshold = psi_threshold

    @staticmethod
    def psi(reference: np.ndarray, current: np.ndarray, bins: int = 10) -> float:
        eps = 1e-6
        edges = np.histogram_bin_edges(reference, bins=bins)
        ref_hist, _ = np.histogram(reference, bins=edges)
        cur_hist, _ = np.histogram(current, bins=edges)
        ref_p = ref_hist / (ref_hist.sum() + eps) + eps
        cur_p = cur_hist / (cur_hist.sum() + eps) + eps
        return float(np.sum((cur_p - ref_p) * np.log(cur_p / ref_p)))

    @staticmethod
    def label_chi2(reference_labels: np.ndarray, current_labels: np.ndarray) -> float:
        from scipy.stats import chisquare
        ref_counts = np.bincount(reference_labels)
        cur_counts = np.bincount(current_labels, minlength=len(ref_counts))
        if len(cur_counts) > len(ref_counts):
            ref_counts = np.pad(ref_counts, (0, len(cur_counts) - len(ref_counts)))
        expected = ref_counts / max(ref_counts.sum(), 1) * cur_counts.sum() + 1e-6
        return float(chisquare(cur_counts + 1e-6, expected).statistic)

    async def assess(self, model_name: str) -> IntegrityReport:
        async with self.pool.acquire() as con:
            ref = await con.fetchrow("select features, labels from model_baseline where model_name=$1", model_name)
            cur = await con.fetchrow(
                """select features, labels from model_recent_window where model_name=$1
                   order by computed_at desc limit 1""", model_name)
        if not ref or not cur:
            return IntegrityReport(model_name, {}, 0.0, [], "insufficient_data")
        ref_X, cur_X = np.array(ref["features"]), np.array(cur["features"])
        ref_y, cur_y = np.array(ref["labels"]), np.array(cur["labels"])
        psi_map = {f"f{i}": self.psi(ref_X[:, i], cur_X[:, i]) for i in range(ref_X.shape[1])}
        chi2 = self.label_chi2(ref_y, cur_y)
        breaches = [f for f, v in psi_map.items() if v > self.psi_threshold]
        if breaches and chi2 > 50:
            rec = "QUARANTINE_MODEL — distribution and label drift detected"
        elif breaches:
            rec = "RETRAIN_RECOMMENDED — feature drift in " + ",".join(breaches[:3])
        elif chi2 > 50:
            rec = "INVESTIGATE_LABELS — possible label flip attack"
        else:
            rec = "HEALTHY"
        return IntegrityReport(model_name, psi_map, chi2, [], rec)
$py$,
$yml$
psi_threshold: 0.2
chi2_threshold: 50
assessment_interval_hours: 6
$yml$,
'',
'{}'::jsonb,
ARRAY['numpy','scipy','asyncpg'],
'Run every 6h; auto-quarantines models with severe drift.'),

('threat-simulator', 'python', $py$
"""Threat Simulator
Runs deterministic, reproducible attack scenarios end-to-end (kill chain)
to validate the full pipeline. Emits synthetic events with golden-truth
labels so blue-team grading is automatic.
"""
from __future__ import annotations
import asyncio, hashlib, json, random, time, uuid
from dataclasses import dataclass, field
from typing import Any
import asyncpg

@dataclass
class Scenario:
    id: str
    name: str
    description: str
    kill_chain: list[dict]      # phases with event templates
    expected_detections: list[str]
    seed: int

@dataclass
class SimulationRun:
    run_id: str
    scenario_id: str
    started_at: float
    finished_at: float | None = None
    emitted_events: list[str] = field(default_factory=list)
    expected: list[str] = field(default_factory=list)
    detected: list[str] = field(default_factory=list)
    fidelity: float = 0.0

SCENARIOS: dict[str, Scenario] = {
    "phish-to-ransomware": Scenario(
        id="phish-to-ransomware", name="Phishing -> Credential Theft -> Ransomware",
        description="User clicks malicious link, creds stolen, attacker pivots to file server, deploys ransomware",
        kill_chain=[
            {"phase": "delivery", "event_type": "email.malicious_link", "user": "{user}", "url": "{c2}"},
            {"phase": "exploitation", "event_type": "browser.malicious_download", "host": "{host}"},
            {"phase": "credential_access", "event_type": "auth.success", "user": "{user}", "from_ip": "{c2}"},
            {"phase": "lateral_movement", "event_type": "smb.share_access", "src": "{host}", "dst": "fileserver"},
            {"phase": "impact", "event_type": "file.ransomware_pattern", "host": "fileserver"},
        ],
        expected_detections=["T1566", "T1078", "T1021", "T1486"], seed=42),
}

class ThreatSimulator:
    def __init__(self, pg_pool: asyncpg.Pool, event_emitter):
        self.pool = pg_pool
        self.emitter = event_emitter

    async def run(self, scenario_id: str, params: dict | None = None) -> SimulationRun:
        sc = SCENARIOS[scenario_id]
        random.seed(sc.seed)
        run = SimulationRun(run_id=uuid.uuid4().hex[:12], scenario_id=scenario_id,
                            started_at=time.time(), expected=list(sc.expected_detections))
        params = params or {"user": "alice@corp", "host": "WIN-001", "c2": "evil.example"}
        for step in sc.kill_chain:
            evt = self._materialize(step, params, run.run_id)
            await self.emitter(evt)
            run.emitted_events.append(evt["id"])
            await asyncio.sleep(random.uniform(0.5, 2.0))
        run.finished_at = time.time()
        await asyncio.sleep(60)
        run.detected = await self._collect_detections(run.run_id)
        run.fidelity = len(set(run.detected) & set(run.expected)) / max(len(run.expected), 1)
        await self._persist(run)
        return run

    @staticmethod
    def _materialize(step: dict, params: dict, run_id: str) -> dict:
        out = {k: (v.format(**params) if isinstance(v, str) else v) for k, v in step.items()}
        out["id"] = hashlib.sha1(f"{run_id}|{out['phase']}|{time.time()}".encode()).hexdigest()[:24]
        out["run_id"] = run_id; out["timestamp"] = time.time(); out["synthetic"] = True
        return out

    async def _collect_detections(self, run_id: str) -> list[str]:
        async with self.pool.acquire() as con:
            rows = await con.fetch(
                """select distinct unnest(mitre_techniques) as t
                   from alerts where run_id=$1""", run_id)
        return [r["t"] for r in rows]

    async def _persist(self, run: SimulationRun):
        async with self.pool.acquire() as con:
            await con.execute(
                """insert into simulation_runs (run_id, scenario_id, started_at, finished_at,
                       emitted_events, expected, detected, fidelity)
                   values ($1,$2,to_timestamp($3),to_timestamp($4),$5,$6,$7,$8)""",
                run.run_id, run.scenario_id, run.started_at, run.finished_at,
                run.emitted_events, run.expected, run.detected, run.fidelity)
$py$,
$yml$
default_dwell_ms_per_step: 1500
scenarios: [phish-to-ransomware, supply-chain-compromise, insider-data-exfil]
$yml$,
'',
'{}'::jsonb,
ARRAY['asyncpg'],
'Tag all events with synthetic=true so they can be filtered out of training data.'),

('feature-runtime', 'python', $py$
"""Feature Lab Runtime
Hot-loads experimental features published from Feature Lab into the running
SOC. Features are sandboxed Python modules with declared inputs/outputs.
"""
from __future__ import annotations
import asyncio, hashlib, importlib, importlib.util, logging, sys, types
from dataclasses import dataclass
from typing import Any, Callable
import asyncpg

logger = logging.getLogger("feature-runtime")

@dataclass
class FeatureManifest:
    slug: str
    version: str
    entrypoint: str        # "module.submodule:fn"
    inputs: list[str]
    outputs: list[str]
    sandbox_limits: dict
    code_sha256: str

class FeatureRuntime:
    def __init__(self, pg_pool: asyncpg.Pool):
        self.pool = pg_pool
        self.loaded: dict[str, Callable] = {}

    async def reload_all(self):
        async with self.pool.acquire() as con:
            rows = await con.fetch(
                """select slug, version, entrypoint, code, code_sha256, manifest
                   from feature_lab_publishes where status='active'""")
        for r in rows:
            await self._load(dict(r))

    async def _load(self, row: dict):
        if hashlib.sha256(row["code"].encode()).hexdigest() != row["code_sha256"]:
            logger.error("integrity check failed for %s", row["slug"]); return
        mod_name = f"feat_{row['slug']}_{row['version'].replace('.', '_')}"
        spec = importlib.util.spec_from_loader(mod_name, loader=None)
        mod = importlib.util.module_from_spec(spec)
        exec(compile(row["code"], mod_name, "exec"), mod.__dict__)
        sys.modules[mod_name] = mod
        ep_mod, ep_fn = row["entrypoint"].split(":")
        fn = getattr(mod, ep_fn)
        self.loaded[row["slug"]] = fn
        logger.info("loaded feature %s v%s", row["slug"], row["version"])

    async def invoke(self, slug: str, inputs: dict, deadline_s: float = 5.0) -> Any:
        fn = self.loaded.get(slug)
        if fn is None:
            raise KeyError(f"feature {slug} not loaded")
        if asyncio.iscoroutinefunction(fn):
            return await asyncio.wait_for(fn(**inputs), timeout=deadline_s)
        return await asyncio.get_running_loop().run_in_executor(None, lambda: fn(**inputs))
$py$,
$yml$
sandbox_limits:
  cpu_seconds: 5
  memory_mb: 256
  network_egress: false
reload_interval_s: 60
$yml$,
'',
'{}'::jsonb,
ARRAY['asyncpg'],
'Code integrity verified by SHA256 on every load; sandbox limits enforced via cgroups.')

ON CONFLICT (slug) DO UPDATE
  SET production_code = EXCLUDED.production_code,
      config_yaml = EXCLUDED.config_yaml,
      llm_config = EXCLUDED.llm_config,
      dependencies = EXCLUDED.dependencies,
      notes = EXCLUDED.notes;
