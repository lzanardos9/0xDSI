/*
  # Agent Implementations Seed - Batch 4 (BMAD Build-Time Agents)
  Seeds: bmad-mary, bmad-john, bmad-winston, bmad-sally, bmad-amelia, bmad-paige
*/

INSERT INTO agent_implementations (slug, language, production_code, config_yaml, integration_code, llm_config, dependencies, notes) VALUES

('bmad-mary', 'python', $py$
"""Mary — BMAD Analyst
Build-time analyst persona that scopes problems and writes the brief for
new SOC features. Stateless LLM persona; reads case data + analyst chat,
emits a structured brief consumed by John (PM).
"""
from __future__ import annotations
import json, logging
from dataclasses import dataclass
from openai import AsyncOpenAI
import asyncpg

logger = logging.getLogger("bmad-mary")

SYSTEM_PROMPT = """You are Mary, a BMAD Analyst. You scope SOC product problems.
For every input you must emit JSON: {
  problem_statement: string,
  affected_personas: string[],
  current_pain_points: string[],
  success_metrics: {metric:string, baseline:number, target:number}[],
  scope_in: string[],
  scope_out: string[],
  open_questions: string[]
}
Be specific. No fluff."""

@dataclass
class AnalystBrief:
    feature_slug: str
    problem_statement: str
    affected_personas: list[str]
    current_pain_points: list[str]
    success_metrics: list[dict]
    scope_in: list[str]
    scope_out: list[str]
    open_questions: list[str]

class MaryAnalystAgent:
    def __init__(self, pg_pool: asyncpg.Pool, oai: AsyncOpenAI):
        self.pool = pg_pool
        self.oai = oai

    async def scope(self, feature_slug: str, raw_request: str, context_case_ids: list[str] | None = None) -> AnalystBrief:
        cases = []
        if context_case_ids:
            async with self.pool.acquire() as con:
                rows = await con.fetch(
                    "select id, summary, severity from cases where id = any($1::text[])", context_case_ids)
                cases = [dict(r) for r in rows]
        r = await self.oai.chat.completions.create(model="gpt-4o", temperature=0.2,
            response_format={"type":"json_object"},
            messages=[{"role":"system","content":SYSTEM_PROMPT},
                      {"role":"user","content":f"Request: {raw_request}\nRelated cases: {cases}"}])
        d = json.loads(r.choices[0].message.content)
        brief = AnalystBrief(feature_slug=feature_slug, **d)
        await self._persist(brief)
        return brief

    async def _persist(self, brief: AnalystBrief):
        async with self.pool.acquire() as con:
            await con.execute(
                """insert into feature_lab_briefs (feature_slug, brief)
                   values ($1, $2::jsonb)
                   on conflict (feature_slug) do update set brief=excluded.brief""",
                brief.feature_slug, json.dumps(brief.__dict__))
$py$,
$yml$
model: gpt-4o
temperature: 0.2
$yml$,
'',
'{"model":"gpt-4o","temperature":0.2,"persona":"analyst"}'::jsonb,
ARRAY['openai','asyncpg'],
'First step in BMAD pipeline; output feeds John.'),

('bmad-john', 'python', $py$
"""John — BMAD Product Manager
Turns Mary's analyst brief into a prioritized PRD with acceptance criteria,
risks, dependencies, and a phased rollout plan.
"""
from __future__ import annotations
import json
from dataclasses import dataclass
from openai import AsyncOpenAI
import asyncpg

SYSTEM_PROMPT = """You are John, a BMAD Product Manager. Read the analyst brief and emit a PRD as JSON: {
  goal: string,
  user_stories: {as_a:string, i_want:string, so_that:string}[],
  acceptance_criteria: string[],
  out_of_scope: string[],
  risks: {risk:string, mitigation:string, severity:"low"|"medium"|"high"}[],
  dependencies: string[],
  rollout_phases: {phase:string, weeks:number, success_metric:string}[],
  rice_score: {reach:number, impact:number, confidence:number, effort:number, score:number}
}
Be ruthless about scope. Anchor every requirement in a measurable success metric."""

@dataclass
class PRD:
    feature_slug: str
    goal: str
    user_stories: list[dict]
    acceptance_criteria: list[str]
    out_of_scope: list[str]
    risks: list[dict]
    dependencies: list[str]
    rollout_phases: list[dict]
    rice_score: dict

class JohnPMAgent:
    def __init__(self, pg_pool: asyncpg.Pool, oai: AsyncOpenAI):
        self.pool = pg_pool
        self.oai = oai

    async def write_prd(self, feature_slug: str) -> PRD:
        async with self.pool.acquire() as con:
            row = await con.fetchrow("select brief from feature_lab_briefs where feature_slug=$1", feature_slug)
        if not row: raise ValueError(f"no brief for {feature_slug}")
        r = await self.oai.chat.completions.create(model="gpt-4o", temperature=0.2,
            response_format={"type":"json_object"},
            messages=[{"role":"system","content":SYSTEM_PROMPT},
                      {"role":"user","content":f"Brief: {row['brief']}"}])
        d = json.loads(r.choices[0].message.content)
        prd = PRD(feature_slug=feature_slug, **d)
        async with self.pool.acquire() as con:
            await con.execute(
                """insert into feature_lab_prds (feature_slug, prd) values ($1,$2::jsonb)
                   on conflict (feature_slug) do update set prd=excluded.prd""",
                feature_slug, json.dumps(prd.__dict__))
        return prd
$py$,
$yml$
model: gpt-4o
require_rice: true
$yml$,
'',
'{"model":"gpt-4o","temperature":0.2,"persona":"product_manager"}'::jsonb,
ARRAY['openai','asyncpg'],
'Output gates BMAD pipeline; rejected PRDs return to Mary.'),

('bmad-winston', 'python', $py$
"""Winston — BMAD Architect
Reads the PRD and produces a technical design: module boundaries, data
flow, interface contracts, technology choices, performance budgets.
"""
from __future__ import annotations
import json
from dataclasses import dataclass
from openai import AsyncOpenAI
import asyncpg

SYSTEM_PROMPT = """You are Winston, a BMAD Software Architect. Read the PRD and emit a tech design as JSON: {
  components: {name:string, responsibility:string, language:string, deps:string[]}[],
  data_flow: {from:string, to:string, payload:string, sla_ms:number}[],
  interfaces: {name:string, kind:"rest"|"grpc"|"kafka"|"sql", schema:string}[],
  storage: {name:string, kind:"postgres"|"delta"|"kafka"|"redis"|"vector", retention_days:number}[],
  performance_budgets: {operation:string, p95_ms:number, p99_ms:number, throughput_eps:number}[],
  security_controls: string[],
  migration_plan: string[]
}
Prefer existing infrastructure. Justify every new dependency."""

@dataclass
class TechDesign:
    feature_slug: str
    components: list[dict]
    data_flow: list[dict]
    interfaces: list[dict]
    storage: list[dict]
    performance_budgets: list[dict]
    security_controls: list[str]
    migration_plan: list[str]

class WinstonArchitectAgent:
    def __init__(self, pg_pool: asyncpg.Pool, oai: AsyncOpenAI):
        self.pool = pg_pool
        self.oai = oai

    async def design(self, feature_slug: str) -> TechDesign:
        async with self.pool.acquire() as con:
            row = await con.fetchrow("select prd from feature_lab_prds where feature_slug=$1", feature_slug)
        r = await self.oai.chat.completions.create(model="gpt-4o", temperature=0.1,
            response_format={"type":"json_object"},
            messages=[{"role":"system","content":SYSTEM_PROMPT},
                      {"role":"user","content":f"PRD: {row['prd']}"}])
        d = json.loads(r.choices[0].message.content)
        td = TechDesign(feature_slug=feature_slug, **d)
        async with self.pool.acquire() as con:
            await con.execute(
                """insert into feature_lab_designs (feature_slug, design) values ($1,$2::jsonb)
                   on conflict (feature_slug) do update set design=excluded.design""",
                feature_slug, json.dumps(td.__dict__))
        return td
$py$,
$yml$
model: gpt-4o
temperature: 0.1
$yml$,
'',
'{"model":"gpt-4o","temperature":0.1,"persona":"architect"}'::jsonb,
ARRAY['openai','asyncpg'],
'Design must reference existing components when possible.'),

('bmad-sally', 'python', $py$
"""Sally — BMAD UX Designer
Reads PRD + design and produces UX flows, wireframe-level layouts (as
structured JSON), accessibility checklist, and interaction specs.
"""
from __future__ import annotations
import json
from dataclasses import dataclass
from openai import AsyncOpenAI
import asyncpg

SYSTEM_PROMPT = """You are Sally, a BMAD UX Designer. Emit JSON: {
  user_flows: {name:string, steps:{view:string, action:string, success_state:string}[]}[],
  wireframes: {view:string, layout:{regions:{name:string,role:string,components:string[]}[]}}[],
  interactions: {trigger:string, response:string, latency_target_ms:number}[],
  accessibility: {wcag_level:"AA"|"AAA", checklist:string[]},
  empty_states: {view:string, message:string, cta:string}[],
  error_states: {scenario:string, message:string, recovery:string}[]
}
Optimize for SOC analysts working under stress. Reduce clicks. Show priority signals first."""

@dataclass
class UXSpec:
    feature_slug: str
    user_flows: list[dict]
    wireframes: list[dict]
    interactions: list[dict]
    accessibility: dict
    empty_states: list[dict]
    error_states: list[dict]

class SallyUXAgent:
    def __init__(self, pg_pool: asyncpg.Pool, oai: AsyncOpenAI):
        self.pool = pg_pool
        self.oai = oai

    async def design(self, feature_slug: str) -> UXSpec:
        async with self.pool.acquire() as con:
            prd = await con.fetchval("select prd from feature_lab_prds where feature_slug=$1", feature_slug)
            td = await con.fetchval("select design from feature_lab_designs where feature_slug=$1", feature_slug)
        r = await self.oai.chat.completions.create(model="gpt-4o", temperature=0.3,
            response_format={"type":"json_object"},
            messages=[{"role":"system","content":SYSTEM_PROMPT},
                      {"role":"user","content":f"PRD: {prd}\nDesign: {td}"}])
        d = json.loads(r.choices[0].message.content)
        spec = UXSpec(feature_slug=feature_slug, **d)
        async with self.pool.acquire() as con:
            await con.execute(
                """insert into feature_lab_ux (feature_slug, spec) values ($1,$2::jsonb)
                   on conflict (feature_slug) do update set spec=excluded.spec""",
                feature_slug, json.dumps(spec.__dict__))
        return spec
$py$,
$yml$
model: gpt-4o
wcag_default: AA
$yml$,
'',
'{"model":"gpt-4o","temperature":0.3,"persona":"ux_designer"}'::jsonb,
ARRAY['openai','asyncpg'],
'Wireframes are structured JSON, rendered by Feature Lab UI as live previews.'),

('bmad-amelia', 'python', $py$
"""Amelia — BMAD Developer
Implements the feature against Winston's design. Generates working
TypeScript/Python code that compiles, including tests. Code is loaded
via Feature Runtime after Paige (QA) signs off.
"""
from __future__ import annotations
import hashlib, json
from dataclasses import dataclass
from openai import AsyncOpenAI
import asyncpg

SYSTEM_PROMPT = """You are Amelia, a senior implementer. Read the architecture and PRD, emit JSON: {
  files: {path:string, language:string, content:string}[],
  tests: {path:string, framework:string, content:string}[],
  build_commands: string[],
  notes: string
}
- Match repository conventions.
- Prefer adapting existing modules over inventing new ones.
- Every file must compile or pass linting on its own."""

@dataclass
class Implementation:
    feature_slug: str
    files: list[dict]
    tests: list[dict]
    build_commands: list[str]
    notes: str
    code_sha256: str

class AmeliaDevAgent:
    def __init__(self, pg_pool: asyncpg.Pool, oai: AsyncOpenAI):
        self.pool = pg_pool
        self.oai = oai

    async def implement(self, feature_slug: str) -> Implementation:
        async with self.pool.acquire() as con:
            prd = await con.fetchval("select prd from feature_lab_prds where feature_slug=$1", feature_slug)
            td = await con.fetchval("select design from feature_lab_designs where feature_slug=$1", feature_slug)
        r = await self.oai.chat.completions.create(model="gpt-4o", temperature=0.0,
            response_format={"type":"json_object"},
            messages=[{"role":"system","content":SYSTEM_PROMPT},
                      {"role":"user","content":f"PRD: {prd}\nDesign: {td}"}])
        d = json.loads(r.choices[0].message.content)
        sha = hashlib.sha256(json.dumps(d["files"], sort_keys=True).encode()).hexdigest()
        impl = Implementation(feature_slug, d["files"], d.get("tests", []),
                               d.get("build_commands", []), d.get("notes", ""), sha)
        async with self.pool.acquire() as con:
            await con.execute(
                """insert into feature_lab_implementations (feature_slug, impl, code_sha256)
                   values ($1,$2::jsonb,$3)
                   on conflict (feature_slug) do update
                   set impl=excluded.impl, code_sha256=excluded.code_sha256""",
                feature_slug, json.dumps(impl.__dict__), sha)
        return impl
$py$,
$yml$
model: gpt-4o
temperature: 0.0
require_tests: true
$yml$,
'',
'{"model":"gpt-4o","temperature":0.0,"persona":"developer"}'::jsonb,
ARRAY['openai','asyncpg'],
'Code SHA256 is checked at load time by Feature Runtime to ensure integrity.'),

('bmad-paige', 'python', $py$
"""Paige — BMAD QA Engineer
Writes acceptance tests, validates Amelia's implementation against the PRD,
runs the test suite in a sandbox, and approves or rejects publishes.
"""
from __future__ import annotations
import asyncio, json, subprocess, tempfile, os
from dataclasses import dataclass, field
from openai import AsyncOpenAI
import asyncpg

SYSTEM_PROMPT = """You are Paige, a QA Engineer. Read the PRD acceptance criteria + the implementation,
emit JSON: {
  acceptance_tests: {name:string, given:string, when:string, then:string, code:string}[],
  edge_cases: string[],
  performance_tests: {operation:string, p95_target_ms:number}[],
  security_tests: string[]
}"""

@dataclass
class QAReport:
    feature_slug: str
    acceptance_tests: list[dict]
    edge_cases: list[str]
    test_run: dict
    passed: bool

class PaigeQAAgent:
    def __init__(self, pg_pool: asyncpg.Pool, oai: AsyncOpenAI):
        self.pool = pg_pool
        self.oai = oai

    async def validate(self, feature_slug: str) -> QAReport:
        async with self.pool.acquire() as con:
            prd = await con.fetchval("select prd from feature_lab_prds where feature_slug=$1", feature_slug)
            impl = await con.fetchval("select impl from feature_lab_implementations where feature_slug=$1", feature_slug)
        r = await self.oai.chat.completions.create(model="gpt-4o", temperature=0.0,
            response_format={"type":"json_object"},
            messages=[{"role":"system","content":SYSTEM_PROMPT},
                      {"role":"user","content":f"PRD: {prd}\nImpl files (paths only): {[f['path'] for f in (impl or {}).get('files',[])]}"}])
        d = json.loads(r.choices[0].message.content)
        run = await self._run_tests(impl or {}, d["acceptance_tests"])
        passed = run["failed"] == 0 and run["errored"] == 0
        report = QAReport(feature_slug, d["acceptance_tests"], d["edge_cases"], run, passed)
        async with self.pool.acquire() as con:
            await con.execute(
                """insert into feature_lab_qa (feature_slug, report) values ($1,$2::jsonb)
                   on conflict (feature_slug) do update set report=excluded.report""",
                feature_slug, json.dumps(report.__dict__))
            if passed:
                await con.execute(
                    """update feature_lab_publishes set status='active'
                       where feature_slug=$1""", feature_slug)
        return report

    async def _run_tests(self, impl: dict, tests: list[dict]) -> dict:
        with tempfile.TemporaryDirectory() as tmp:
            for f in impl.get("files", []):
                path = os.path.join(tmp, f["path"])
                os.makedirs(os.path.dirname(path), exist_ok=True)
                open(path, "w").write(f["content"])
            for t in tests:
                open(os.path.join(tmp, f"test_{t['name']}.py"), "w").write(t["code"])
            proc = await asyncio.create_subprocess_exec(
                "pytest", "-q", "--json-report", cwd=tmp,
                stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            out, err = await proc.communicate()
            return {"returncode": proc.returncode, "stdout": out.decode()[-2000:],
                    "stderr": err.decode()[-1000:],
                    "failed": out.decode().count(" failed"),
                    "errored": out.decode().count(" error")}
$py$,
$yml$
model: gpt-4o
auto_publish_on_pass: true
sandbox_timeout_s: 120
$yml$,
'',
'{"model":"gpt-4o","temperature":0.0,"persona":"qa_engineer"}'::jsonb,
ARRAY['openai','asyncpg','pytest','pytest-json-report'],
'Auto-promotes feature_lab_publishes.status=active on green test run.')

ON CONFLICT (slug) DO UPDATE
  SET production_code = EXCLUDED.production_code,
      config_yaml = EXCLUDED.config_yaml,
      llm_config = EXCLUDED.llm_config,
      dependencies = EXCLUDED.dependencies,
      notes = EXCLUDED.notes;
