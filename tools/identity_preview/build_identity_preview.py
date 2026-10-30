"""
Builds public/identity-preview.json for the browser preview of the Identity pages.

Runs the real Databricks identity notebooks (setup 06/07, identity 01-06) on the sample
fixtures against an in-memory SQLite stand-in for Spark/Delta, walks sample remediation actions
through the real approval routes and the dry-run executor, then calls the real /api/identity
route handlers against the same database, so the preview shows exactly
what the Databricks app would. Usage: python3 tools/identity_preview/build_identity_preview.py
"""

import asyncio
import json
import os
import re
import sqlite3
import sys
import tempfile
import types
from datetime import datetime, timezone

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
DBX = os.path.join(ROOT, "databricks-native")
NB = os.path.join(DBX, "notebooks")
OUT = os.path.join(ROOT, "public", "identity-preview.json")
FIXED_NOW = datetime(2026, 10, 29, 7, 0, tzinfo=timezone.utc)
NOW_SQL = "'" + FIXED_NOW.replace(tzinfo=None).isoformat() + "'"

sqlite3.register_adapter(datetime, lambda d: d.isoformat())
sqlite3.register_adapter(bool, int)
sqlite3.register_adapter(list, json.dumps)
sqlite3.register_adapter(dict, json.dumps)
sqlite3.register_converter("BOOLEAN", lambda b: bool(int(b)))
sqlite3.register_converter("TIMESTAMP", lambda b: datetime.fromisoformat(b.decode()))
sqlite3.register_converter("JSONARR", lambda b: json.loads(b))
db = sqlite3.connect(":memory:", detect_types=sqlite3.PARSE_DECLTYPES)
db.row_factory = sqlite3.Row
COLUMNS = {}
TYPE_MAP = {"STRING": "TEXT", "INT": "INTEGER", "BIGINT": "INTEGER", "DOUBLE": "REAL",
            "BOOLEAN": "BOOLEAN", "TIMESTAMP": "TIMESTAMP"}


def _sql(text):
    text = re.sub(r"\bleast\(", "min(", text)
    text = re.sub(r"\bgreatest\(", "max(", text)
    text = re.sub(r"try_cast\(([^)]*?) AS TIMESTAMP\)", r"(\1)", text)
    text = text.replace("current_timestamp()", NOW_SQL)
    return re.sub(r"timestamp'([^']*)'", r"'\1'", text)


def _rows(sql, params=None):
    return [Row(dict(r)) for r in db.execute(_sql(sql), params or {}).fetchall()]


def _create(name, cols):
    defs = []
    for part in cols.split(","):
        bits = part.split()
        if not bits:
            continue
        col, typ = bits[0], bits[1].upper()
        defs.append(f"{col} {'JSONARR' if typ.startswith('ARRAY') else TYPE_MAP[typ]}")
    COLUMNS[name] = [d.split()[0] for d in defs]
    db.execute(f"CREATE TABLE IF NOT EXISTS {name} ({', '.join(defs)})")


def _insert(table, row):
    cols = COLUMNS[table]
    db.execute(f"INSERT INTO {table} ({', '.join(cols)}) VALUES ({', '.join('?' for _ in cols)})",
               [row.get(c) for c in cols])


class Row(dict):
    def asDict(self):
        return dict(self)


class Field:
    def __init__(self, name):
        self.name = name


class Schema:
    def __init__(self, table):
        self.fields = [Field(c) for c in COLUMNS[table]]


class Writer:
    def __init__(self, rows):
        self.rows = rows

    def mode(self, _):
        return self

    def saveAsTable(self, table):
        for r in self.rows:
            _insert(table, r)


class Frame:
    def __init__(self, table=None, where="1=1", cols="*", rows=None):
        self.table, self.where_, self.cols, self.rows = table, where, cols, rows

    @property
    def schema(self):
        return Schema(self.table)

    def where(self, cond):
        return Frame(self.table, f"({self.where_}) AND ({cond})", self.cols)

    def select(self, *cols):
        return Frame(self.table, self.where_, ", ".join(cols))

    def alias(self, _):
        return self

    @property
    def write(self):
        return Writer(self.rows)

    def collect(self):
        if self.rows is not None:
            return [Row(r) for r in self.rows]
        return _rows(f"SELECT {self.cols} FROM {self.table} WHERE {self.where_}")


class Spark:
    def table(self, name):
        return Frame(name)

    def createDataFrame(self, tuples, schema):
        names = [f.name for f in schema.fields]
        return Frame(rows=[dict(zip(names, t)) for t in tuples])

    def sql(self, text, args=None):
        head = text.strip().split()[0].upper()
        if head == "USE":
            return Frame(rows=[])
        if head == "CREATE":
            m = re.match(r"\s*CREATE TABLE IF NOT EXISTS (\w+) \((.*)\) USING", text, re.S)
            _create(m.group(1), m.group(2))
            return Frame(rows=[])
        if head == "DELETE":
            db.execute(_sql(text))
            return Frame(rows=[])
        return Frame(rows=[dict(r) for r in _rows(text, args)])


def _value(expr, src):
    expr = expr.strip()
    if expr.startswith("s."):
        return src[expr[2:]]
    if expr.upper() == "NULL":
        return None
    m = re.fullmatch(r"timestamp'([^']*)'", expr)
    if m:
        return datetime.fromisoformat(m.group(1))
    return expr.strip("'")


class Merge:
    def __init__(self, table, src, cond):
        self.table, self.src = table, src.rows
        self.keys = re.findall(r"t\.(\w+) = s\.\1", cond)
        self.matched = self.insert = self.by_source = self.condition = None

    def whenMatchedUpdateAll(self):
        self.matched = "all"
        return self

    def whenMatchedUpdate(self, set, condition=None):
        self.matched, self.condition = set, condition
        return self

    def whenNotMatchedInsertAll(self):
        self.insert = True
        return self

    def whenNotMatchedBySourceDelete(self):
        self.by_source = ("delete", None, None)
        return self

    def whenNotMatchedBySourceUpdate(self, condition, set):
        self.by_source = ("update", condition, set)
        return self

    def _where(self, row):
        return " AND ".join(f"{k} = :k_{k}" for k in self.keys), {f"k_{k}": row[k] for k in self.keys}

    def _target_ok(self, clause, params):
        if not self.condition:
            return True
        col, op, vals = re.fullmatch(r"t\.(\w+) (IN|=) \(?(.*?)\)?", self.condition).groups()
        current = db.execute(f"SELECT {col} FROM {self.table} WHERE {clause}", params).fetchone()[0]
        return current in re.findall(r"'([^']*)'", vals)

    def execute(self):
        seen = set()
        for row in self.src:
            seen.add(tuple(row[k] for k in self.keys))
            clause, params = self._where(row)
            exists = db.execute(f"SELECT 1 FROM {self.table} WHERE {clause}", params).fetchone()
            if exists and self.matched and self._target_ok(clause, params):
                upd = {c: row.get(c) for c in COLUMNS[self.table]} if self.matched == "all" else \
                    {c: _value(e, row) for c, e in self.matched.items()}
                sets = ", ".join(f"{c} = :v_{c}" for c in upd)
                db.execute(f"UPDATE {self.table} SET {sets} WHERE {clause}",
                           {**params, **{f"v_{c}": v for c, v in upd.items()}})
            elif not exists and self.insert:
                _insert(self.table, row)
        if not self.by_source:
            return
        kind, cond, upd = self.by_source
        for t in _rows(f"SELECT * FROM {self.table}"):
            if tuple(t[k] for k in self.keys) in seen:
                continue
            if cond:
                col, val = re.fullmatch(r"t\.(\w+) = '([^']*)'", cond).groups()
                if t[col] != val:
                    continue
            clause, params = self._where(t)
            if kind == "delete":
                db.execute(f"DELETE FROM {self.table} WHERE {clause}", params)
            else:
                vals = {c: _value(e, t) for c, e in upd.items()}
                sets = ", ".join(f"{c} = :v_{c}" for c in vals)
                db.execute(f"UPDATE {self.table} SET {sets} WHERE {clause}",
                           {**params, **{f"v_{c}": v for c, v in vals.items()}})


class DeltaTable:
    def __init__(self, name):
        self.name = name

    @classmethod
    def forName(cls, _spark, name):
        return cls(name)

    def alias(self, _):
        return self

    def merge(self, src, cond):
        return Merge(self.name, src, cond)


class NotebookExit(Exception):
    pass


class Widgets:
    def __init__(self, overrides):
        self.values, self.overrides = {}, overrides

    def text(self, name, default, _label=""):
        self.values[name] = self.overrides.get(name, default)

    def get(self, name):
        return self.values[name]


def run_notebook(rel, landing, expect_exit=None, **widgets):
    path = os.path.join(NB, rel)
    with open(path) as fh:
        src = fh.read()
    src = src.replace('"/Volumes/', f'"{landing}/Volumes/').replace("datetime.now(timezone.utc)", "_FIXED_NOW")
    dbutils = types.SimpleNamespace(
        widgets=Widgets(widgets),
        notebook=types.SimpleNamespace(exit=lambda msg: (_ for _ in ()).throw(NotebookExit(msg))),
        fs=types.SimpleNamespace(mkdirs=lambda p: os.makedirs(p, exist_ok=True)),
    )
    ns = {
        "__name__": "__notebook__", "spark": Spark(), "dbutils": dbutils, "_FIXED_NOW": FIXED_NOW,
        "cfg": types.SimpleNamespace(catalog="soc_platform", schema="agentic_soc"),
        "get_table_path": lambda _cfg, name: name, "require_tables": lambda *a: None,
        "mon": types.SimpleNamespace(log_metric=lambda *a, **k: None),
    }
    cwd = os.getcwd()
    os.chdir(os.path.dirname(path))
    try:
        exec(compile(src, path, "exec"), ns)
    except NotebookExit as exc:
        if str(exc) != expect_exit:
            raise SystemExit(f"{rel} exited early: {exc}")
    finally:
        os.chdir(cwd)
    db.commit()
    return ns


def install_fastapi_stub():
    mod = types.ModuleType("fastapi")

    class HTTPException(Exception):
        def __init__(self, status_code, detail=""):
            super().__init__(detail)
            self.status_code, self.detail = status_code, detail

    class APIRouter:
        def __init__(self, prefix=""):
            self.routes = {}

        def _reg(self, method, path):
            def deco(fn):
                self.routes[(method, path)] = fn
                return fn
            return deco

        def get(self, path):
            return self._reg("GET", path)

        def post(self, path):
            return self._reg("POST", path)

    mod.APIRouter, mod.HTTPException, mod.Request = APIRouter, HTTPException, object
    sys.modules["fastapi"] = mod


class FakeRequest:
    def __init__(self, email, body=None):
        self.user, self.body = {"email": email}, body or {}

    async def json(self):
        return self.body


VIEWER = "you@preview"


def build_routes():
    install_fastapi_stub()
    sys.path.insert(0, os.path.join(DBX, "app"))
    from backend.identity import build_identity_router

    def query(sql, params=None):
        return [dict(r) for r in _rows(sql, params)]

    def write(sql, params=None):
        db.execute(_sql(sql), params or {})
        db.commit()

    router = build_identity_router(
        query=query, execute_write=write, fqn=lambda n: n,
        get_user=lambda r: getattr(r, "user", None) or {"email": VIEWER},
        require_analyst=lambda _u: None, audit=lambda *_a, **_k: None,
        trigger_job=lambda *_a, **_k: {"triggered": False, "reason": "the executor runs on its hourly schedule"},
    )

    def call(path, **kw):
        return asyncio.run(router.routes[("GET", path)](request=FakeRequest(VIEWER), **kw))

    def post(path, who, body, **kw):
        return asyncio.run(router.routes[("POST", path)](request=FakeRequest(who, body), **kw))
    return call, post, query


ANA, DEREK, SOFIA = "ana.lima@aa.example", "derek.owens@aa.example", "sofia.reyes@aa.example"


def seed_workflow(call, post, landing):
    """Walk sample actions through the real approval routes and executor so every stage has data."""
    actions = call("/remediation", stage="review", limit=200, offset=0)["actions"]

    def find(action_type, *words):
        for a in actions:
            text = f"{a['title']} {a['display_name'] or ''}".lower()
            if a["action_type"] == action_type and a["status"] == "proposed" and all(w in text for w in words):
                return a["action_id"]
        raise SystemExit(f"No proposed {action_type} matching {words}")

    def do(op, aid, who, **body):
        post(f"/remediation/{{action_id}}/{op}", who, body, action_id=aid)

    leaver = find("disable_account", "bmcdonald")
    guest = find("disable_account", "tom ellis")
    nest = find("remove_membership", "noc-oncall", "tier0")
    takeover = find("remove_takeover", "helpdesk")
    blessy = find("remove_membership", "helpdesk-tier1", "bbaby")
    ramp = find("remove_membership", "airport-ramp-ops", "bmcdonald")

    do("request", leaver, ANA, note="HR-2291: Brian left on 30 September")
    do("decide", leaver, DEREK, verdict="approve", comment="Confirmed with HR")
    do("request", guest, ANA, note="Envoy contract ended")
    do("decide", guest, SOFIA, verdict="approve", comment="")
    run_notebook("identity/06_identity_remediation.py", landing, stage="execute", execution_mode="dry_run")
    do("rollback", guest, ANA, reason="Envoy extended Tom's contract to December")
    run_notebook("identity/06_identity_remediation.py", landing, stage="execute", execution_mode="dry_run")

    do("request", nest, ANA, note="Tier 0 access should not come through the on-call group")
    do("decide", nest, DEREK, verdict="approve", comment="Agreed; NOC uses break-glass instead")
    do("request", takeover, SOFIA, note="Helpdesk should not reset admin accounts")
    do("request", blessy, ANA, note="")
    do("decide", blessy, DEREK, verdict="reject", comment="Blessy covers the Tier 1 queue until March; review then")
    do("dismiss", ramp, SOFIA, reason="Covered by disabling Brian's accounts")


def build_answers(call, query):
    from backend.identity_answer_parser import INTENTS
    from backend.identity_answers import build_answer
    catalog = call("/answers/catalog")
    answers = {}
    for i in INTENTS:
        if not i["entity"]:
            answers[i["intent"]] = build_answer(query, lambda n: n, i["intent"], None)
            continue
        for e in catalog["lexicon"]:
            if e["kind"] in i["entity"]:
                ent = {"kind": e["kind"], "id": e["id"], "label": e["label"]}
                answers[f"{i['intent']}|{e['kind']}|{e['id']}"] = build_answer(query, lambda n: n, i["intent"], ent)
    as_of = query("SELECT MAX(scored_at) AS t FROM identity_risk_score")[0]["t"]
    return catalog, answers, as_of


XREF_FIELDS = ("account_key", "canonical_id", "username", "display_name", "provider_object_id", "provider",
               "normalized_state", "principal_type", "persona_type", "email")


def simulator_inputs(ns):
    """Exactly what the what-if notebook fed the simulator, trimmed to the fields the engine reads."""
    from identity_access import departments_from_events, leavers_from_events
    return {
        "xrefs": [{k: x.get(k) for k in XREF_FIELDS} for x in ns["xrefs"]],
        "resources": ns["resources"], "groups": ns["groups"], "edges": ns["edges"],
        "departments": departments_from_events(ns["events"]),
        "leavers": sorted(leavers_from_events(ns["events"])),
        "timeline": [{k: f.get(k) for k in ("canonical_id", "severity", "detail", "status")} for f in ns["timeline"]],
        "identity_findings": [{k: f.get(k) for k in ("canonical_id", "finding_type", "detail", "status")}
                              for f in ns["id_findings"]],
        "weights": ns["weights"],
        "access_version": ns["av"],
    }


def main():
    sys.path.insert(0, os.path.join(NB, "_shared"))
    delta = types.ModuleType("delta")
    delta.tables = types.ModuleType("delta.tables")
    delta.tables.DeltaTable = DeltaTable
    sys.modules.update({"delta": delta, "delta.tables": delta.tables})
    with tempfile.TemporaryDirectory() as landing:
        run_notebook("setup/06_identity_datalake_tables.py", landing)
        run_notebook("setup/07_seed_identity_fixtures.py", landing, seed_demo_data="true")
        for nb in ("01_identity_spine.py", "02_identity_timeline.py", "03_identity_access_risk.py",
                   "04_identity_whatif.py", "05_identity_federation.py"):
            ns = run_notebook(f"identity/{nb}", landing)
            if nb.startswith("04_"):
                whatif_inputs = simulator_inputs(ns)
        run_notebook("identity/06_identity_remediation.py", landing, expect_exit="plan done", stage="plan")
        call, post, query = build_routes()
        seed_workflow(call, post, landing)

    remediation = {s: call("/remediation", stage=s, limit=200, offset=0)
                   for s in ("review", "approval", "in_progress", "done", "closed")}
    action_ids = [a["action_id"] for r in remediation.values() for a in r["actions"]]
    answer_catalog, answers, answers_as_of = build_answers(call, query)
    identities = call("/identities", limit=200, offset=0)
    ids = [i["canonical_id"] for i in identities["identities"]]
    risk = call("/risk", limit=200, offset=0)
    groups = call("/groups", limit=200, offset=0)
    scenarios = call("/whatif/scenarios", limit=200, offset=0)
    federation = call("/federation")
    out = {
        "generated_at": FIXED_NOW.isoformat(),
        "overview": call("/overview"),
        "identities": identities,
        "details": {i: call("/identities/{canonical_id}", canonical_id=i) for i in ids},
        "reviews": call("/reviews", limit=200, offset=0),
        "nhi": call("/nhi", limit=200, offset=0),
        "timeline": call("/timeline/identities", search="", limit=200, offset=0),
        "timelineFindings": call("/timeline/findings", severity="", finding_type="", status="open", limit=200, offset=0),
        "timelines": {i: call("/identities/{canonical_id}/timeline", canonical_id=i, category="", limit=200) for i in ids},
        "risk": risk,
        "riskDetails": {s["canonical_id"]: call("/risk/{canonical_id}", canonical_id=s["canonical_id"])
                        for s in risk["scores"]},
        "graphResources": call("/graph/resources"),
        "graphPaths": call("/graph/paths", resource_id="", canonical_id="", takeover_only=False,
                           status="open", limit=200, offset=0),
        "groups": groups,
        "groupDetails": {g["group_key"]: call("/groups/{group_key}", group_key=g["group_key"])
                         for g in groups["groups"]},
        "whatifScenarios": scenarios,
        "whatifDetails": {s["scenario_id"]: call("/whatif/scenarios/{scenario_id}", scenario_id=s["scenario_id"])
                          for s in scenarios["scenarios"]},
        "whatifOptions": call("/whatif/options"),
        "whatifInputs": whatif_inputs,
        "federation": federation,
        "trustDetails": {t["trust_id"]: call("/federation/trusts/{trust_id}", trust_id=t["trust_id"])
                         for t in federation["trusts"]},
        "federationFindings": call("/federation/findings", status="open", severity="", scope=""),
        "remediation": remediation,
        "remediationDetails": {a: call("/remediation/{action_id}", action_id=a) for a in action_ids},
        "answerCatalog": answer_catalog,
        "answers": answers,
        "answersAsOf": answers_as_of,
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w") as fh:
        json.dump(out, fh, default=lambda v: v.isoformat() if isinstance(v, datetime) else str(v),
                  separators=(",", ":"), sort_keys=True)
    print(f"Wrote {os.path.relpath(OUT, ROOT)} ({os.path.getsize(OUT) // 1024} KB): {len(ids)} identities, "
          f"{len(risk['scores'])} risk scores, {len(groups['groups'])} groups, "
          f"{len(scenarios['scenarios'])} scenarios, {len(federation['trusts'])} trusts, "
          f"{len(action_ids)} remediation actions, {len(answers)} answers")


if __name__ == "__main__":
    main()
