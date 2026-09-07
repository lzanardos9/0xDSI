# Databricks notebook source
# MAGIC %md
# MAGIC # Operation Borrowed Trust — CET Replay
# MAGIC
# MAGIC Companion notebook for the **Trend Engine · Operation Borrowed Trust** demo.
# MAGIC It replays the scenario the way the native CET engine actually sees it: events
# MAGIC arrive in **wall-clock (arrival) order**, but the engine matches on **event-time**,
# MAGIC re-orders late arrivals, and applies the **retraction lifecycle**.
# MAGIC
# MAGIC One shared machine identity `release-service` runs three executions:
# MAGIC
# MAGIC | Exec | What it does | Outcome |
# MAGIC |------|--------------|---------|
# MAGIC | **A** | benign deploy → config write | never matches a trend |
# MAGIC | **B** | reconciliation job → production read (no auth yet) → internal write | **provisional match, then WITHDRAWN** when the late authorization arrives |
# MAGIC | **C** | privilege escalation → restricted read → external transfer | **critical match, PERSISTS** (exfil is malicious even if later authorized) |
# MAGIC
# MAGIC The Supabase-backed Trend Engine UI reads the *result* of this notebook from the
# MAGIC `trend_queries`, `trend_graph_nodes`, `trend_graph_edges`, `trend_complete`, and
# MAGIC `trend_graphlets` tables. This notebook is the "show me deeply" view of how those
# MAGIC rows are produced and why B is withdrawn while C stands.

# COMMAND ----------

# MAGIC %md
# MAGIC ## 1. The raw event stream (arrival order, NOT event-time order)
# MAGIC
# MAGIC Note `arrived` vs `event_time`: the privilege-change for Exec C and the authorization
# MAGIC for Exec B both land **late**. A fire-once alerting system would either miss C
# MAGIC (out-of-order) or never retract B (no lifecycle). The CET engine handles both.

# COMMAND ----------

from dataclasses import dataclass


@dataclass
class Event:
    arrived: str      # wall-clock order the collector received it
    event_time: str   # true time the action happened
    identity: str
    action: str
    target: str
    branch: str       # A / B / C
    attrs: dict


# Ordered by ARRIVAL time (what the stream literally delivers)
STREAM = [
    Event("09:00", "09:00", "release-service", "job_start",         "deploy-step",    "A", {"class": "deploy"}),
    Event("09:01", "09:01", "release-service", "job_start",         "recon-job",      "B", {"class": "reconciliation"}),
    Event("09:02", "09:02", "release-service", "config_write",      "config-store",   "A", {"tier": "config"}),
    Event("09:03", "09:03", "release-service", "data_access",       "prod-records",   "B", {"tier": "production", "authorization": None}),
    Event("09:04", "09:03", "release-service", "data_access",       "restricted-recs","C", {"tier": "restricted", "records": 48210}),
    Event("09:04", "09:04", "release-service", "write_output",      "recon-output",   "B", {"trust": "internal"}),
    Event("09:05", "09:04", "release-service", "outbound_transfer", "external-dest",  "C", {"trust": "external", "bytes": "1.4GB"}),
    # LATE: the privilege change for C actually happened at 09:01 but arrives at 09:06
    Event("09:06", "09:01", "release-service", "privilege_change",  "priv-change",    "C", {"grants": "restricted-data:read"}),
    # LATE: the authorization for B actually happened at 09:02 but arrives at 09:09
    Event("09:09", "09:02", "release-service", "authorization",     "recon-job",      "B", {"scope": "production:read"}),
]

print(f"{'arrived':>8} {'event_time':>11}  {'branch':>6}  action")
print("-" * 60)
for e in STREAM:
    late = "  <-- LATE" if e.arrived != e.event_time else ""
    print(f"{e.arrived:>8} {e.event_time:>11}  {e.branch:>6}  {e.action}{late}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## 2. Event-time re-ordering
# MAGIC
# MAGIC The engine buffers within the watermark and sorts by `event_time` before matching.
# MAGIC After re-ordering, Exec C's privilege_change correctly sits **before** its restricted
# MAGIC read — so the `skip-till-any-match` sequence completes.

# COMMAND ----------

reordered = sorted(STREAM, key=lambda e: (e.event_time, e.branch))
for e in reordered:
    print(f"{e.event_time}  {e.branch}  {e.action:>18}  ->  {e.target}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## 3. Match the two standing Kleene queries with retraction
# MAGIC
# MAGIC - `cet-obt-export` (Exec C): privilege_change → restricted data_access → external outbound_transfer. `retract_when: NEVER`.
# MAGIC - `cet-obt-recon` (Exec B): reconciliation → production data_access **with no prior authorization** → internal write. `retract_when: authorization.arrives`.

# COMMAND ----------

def match_export(events):
    """Exec C: escalate -> read restricted -> exfil external. Never retracts."""
    saw_priv = saw_read = None
    for e in events:
        if e.action == "privilege_change" and "restricted" in str(e.attrs.get("grants", "")):
            saw_priv = e
        elif saw_priv and e.action == "data_access" and e.attrs.get("tier") == "restricted":
            saw_read = e
        elif saw_read and e.action == "outbound_transfer" and e.attrs.get("trust") == "external":
            return {"trend_key": "obt-c-export", "status": "COMPLETE", "severity": "critical",
                    "path": [saw_priv.target, saw_read.target, e.target], "score": 87.4}
    return None


def match_recon(events):
    """Exec B: recon -> production read WITHOUT authorization -> internal write.
    Provisional on absence; withdrawn if authorization later appears."""
    saw_job = saw_read = completed = None
    authorized = False
    for e in events:
        if e.action == "job_start" and e.attrs.get("class") == "reconciliation":
            saw_job = e
        elif saw_job and e.action == "data_access" and e.attrs.get("tier") == "production":
            saw_read = e
        elif saw_read and e.action == "write_output":
            completed = {"trend_key": "obt-b-recon", "status": "PROVISIONAL", "severity": "high",
                         "path": [saw_job.target, saw_read.target, e.target], "score": 71.6}
        elif e.action == "authorization" and e.attrs.get("scope", "").startswith("production"):
            authorized = True
    if completed and authorized:
        completed["status"] = "WITHDRAWN"
    return completed


export = match_export(reordered)
recon = match_recon(reordered)

print("Exec C (export):", export)
print("Exec B (recon): ", recon)
assert export and export["status"] == "COMPLETE", "C must complete"
assert recon and recon["status"] == "WITHDRAWN", "B must be withdrawn by the late authorization"
print("\nResult: C stands as CRITICAL, B is correctly WITHDRAWN. Exec A never matched.")

# COMMAND ----------

# MAGIC %md
# MAGIC ## 4. Where this shows up in the product
# MAGIC
# MAGIC Open the SOC app → **Trend Engine (CET)** and look at:
# MAGIC
# MAGIC 1. **Kleene Queries** tab → `cet-obt-export` and `cet-obt-recon` (the YAML DSL, incl. `retract_when`).
# MAGIC 2. **Trends** tab → two findings. `release-service → external-dest` is **critical** and its
# MAGIC    explanation says *PERSISTS*; `release-service → recon-output` is **high** and its explanation
# MAGIC    says *WITHDRAWN* with the reason. Click each row to expand the hop-by-hop path.
# MAGIC 3. **Live Graph** tab → use the trend filter dropdown to switch between `obt-c-export`
# MAGIC    (the exfil branch) and `obt-b-recon` (the reconciliation branch). Exec A's edges render
# MAGIC    dim/benign. The "Active trend" side panel shows hops + score for the selected branch.
# MAGIC
# MAGIC Those UI rows are exactly the `trend_complete` / `trend_graph_*` records this notebook's
# MAGIC logic produces.
