# Flight AA-IDN: "Cleared for Takeover" — Version 2 (with the Databricks story)

Same 20-minute demo as version 1 (`IDENTITY_DEMO_NARRATIVE.md`), with two additions:

1. After each scene there is an **Under the hood** box naming the Databricks-native features doing the work, the exact tables, jobs and files, and a one-line "say this to a technical audience".
2. A new **Act 3½ — "Black box recorder"** covers the live feed, event drill-down, signed chain of custody and the clickable activity timeline.

Everything listed here exists in the code today. Things the platform *could* add later are kept apart in the **Not used yet** section at the end, so nobody overclaims on stage.

> **The hook (say this first):** "Last week, Brian McDonald left American Airlines. His badge was collected. His laptop was wiped. And yesterday, his account signed in. Today we're going to find out who else is still on board who shouldn't be, and we're going to land the plane without breaking anything. And all of it runs inside Databricks: no extra database, no side server, no data leaving the lakehouse."

---

## The architecture in one slide

Show this before Act 1 when the audience is technical (30 seconds).

```
 Directory exports (AD, Entra ID, Ping, Saviynt, Duo, app-local, HR)
                │  JSONL / CSV snapshots
                ▼
 Unity Catalog Volume  /Volumes/<catalog>/<schema>/landing/identity*
                │
                ▼
 Lakeflow Job  "[0xDSI] Identity 01 - Canonical Identity Spine"   (serverless, hourly)
   resolve_identities → build_timeline → score_access_risk → federation_posture
                     → evaluate_whatif → plan_remediation (dry run)
                │  DeltaTable.merge / append
                ▼
 32 Delta tables  identity_*   in Unity Catalog  (Change Data Feed on, optimized writes)
                │
                ▼
 Databricks SQL Warehouse  ◄── databricks-sql-connector, named parameters
                │            runs AS THE SIGNED-IN USER (on-behalf-of token)
                ▼
 Databricks App  "0xdsi-agentic-soc"   (FastAPI + React, Identity menu: 12 pages)
   ├─ jobs.run_now  → Identity 01 / 02 What-If / 03 Remediation Executor
   └─ every read of sensitive data and every write → system_audit_log
```

| Layer | Databricks feature | Where in the repo |
|-------|-------------------|-------------------|
| Packaging & deploy | **Databricks Asset Bundles** (`databricks.yml`, targets `dev` / `staging` / `production`) | `databricks.yml`, `resources/*.yml`, `deploy.sh` |
| Governance & storage | **Unity Catalog** catalog `soc_platform`, schema `agentic_soc`; **Delta Lake** tables; **UC Volumes** for landing files | `notebooks/setup/06_identity_datalake_tables.py` |
| Processing | **Lakeflow Jobs** on **serverless compute** (`environment_version: "2"`) | `resources/jobs.yml` (Identity 01, 02, 03) |
| Query serving | **Databricks SQL Warehouse** | `app/backend/server.py` `_connect()` / `query()` |
| Application | **Databricks Apps** with `user_api_scopes: [sql]` and app permissions for `soc_admins` / `soc_analysts` | `resources/app.yml`, `app/backend/` |
| Identity of the viewer | **On-behalf-of user authorization** (`x-forwarded-access-token`, `X-Forwarded-Email`) | `app/backend/user_auth.py`, `server.py` |
| Secrets | **Databricks secret scope** `soc-secrets` (installer) plus app secret resources for the custody key | `deploy.sh`, `docs/INSTALLATION_MANUAL.md` §7.4 |

> **Say this:** "There are four moving parts, and all four are Databricks: files land in a Unity Catalog volume, a serverless job turns them into Delta tables, a SQL warehouse serves them, and a Databricks App shows them using *your* permissions, not the app's."

---

## Before you start

| Item | Detail |
|------|--------|
| Duration | 20 minutes core, plus 3 minutes for Act 3½ (a 10-minute cut is at the end) |
| Where | Left menu → **Identity** (12 pages) |
| Data | Sample AA estate: 6 directories, 32 identities, 13 routes to crown jewels, a slow live event stream |
| Databricks app | Everything works, including request, approve and roll back (dry run: nothing is sent to a directory) |
| Browser preview | Same data and pages. Live events are generated in the browser and sealed with a clearly labelled demo key |
| Tip | Open **Access Graph & Paths** once before the demo so the animation is warm, then go back to **Identity Overview** |

> **Under the hood — getting the demo data in**
> - The setup job task `create_identity_tables` runs `notebooks/setup/06_identity_datalake_tables.py`: it creates the 32 `identity_*` **Delta** tables with `delta.enableChangeDataFeed = true` and `delta.autoOptimize.optimizeWrite = true`, and the landing folders in the **UC Volume** (`landing/identity`, `identity_events`, `identity_access`, `identity_federation`, `identity_whatif`).
> - `notebooks/setup/07_seed_identity_fixtures.py` drops the sample snapshots into the volume. It only runs when the bundle variable `seed_demo_data` is on (default in the `dev` target).
> - Then one run of the **Identity 01** job builds everything you are about to show.

### The cast

| Character | Role in the story | Why they matter |
|-----------|------------------|-----------------|
| **Brian McDonald** | The ghost | Left on 20 Oct. Still live in Entra ID and Duo, signed in after leaving, still owns a service account, a partner trust and a guest's sponsorship |
| **Keith Murry** | The double agent (accidentally) | Riskiest identity (80, critical). Can create vendors *and* approve payments in SAP; kept ramp access after moving departments |
| **Abhijit Tilak** | The traveller | 70, critical. Signed in from Romania four hours after his MFA was reset |
| **Rudi Himawan** | The back door | Reaches the Domain Controllers through two layers of group nesting. Also switched off SID filtering on the cargo forest trust |
| **Blessy Baby** | The helpdesk hop | Standard user whose helpdesk reset rights let her take over Marcus Bell's admin account |
| **Todd Trncak** | The target | 5 MFA push denials in 10 minutes |
| **Luiz Zanardo** | The quiet promotion | Added to Domain Admins with no change ticket |
| **Fare Pricing Copilot** | The stowaway (headline reveal) | An unregistered AI agent with **export** rights on the AAdvantage Loyalty Database |
| **Tom Ellis, Carlos Mendes, Nina Park** | The guests | Orphaned sponsor, guest owning production subscriptions, unreviewed partner |

---

## Act 1 — Boarding: "Who is actually on this plane?" (3 min)

**Page: Identity Overview**

1. Point at the cards across the top: people, workloads and agents. The numbers tick up slowly as live activity arrives.
   > "Six directories, 69 accounts, stitched into one person each. Not by guessing: by HR worker ID and employee ID. Anything less certain waits for a human."
2. Point at source health: when each directory last delivered and whether the snapshot was complete.
   > "If a feed goes stale, we say so. We never quietly score yesterday's data as today's."
3. Point at the findings: state conflicts, orphaned non-human identities, an unverified agent.
   > "Keep that 'unverified agent' in mind."

**Page: Identity Explorer** → search `Brian` → Brian McDonald: AD and Saviynt **disabled**, Entra ID and Duo **enabled**.

**Page: Resolution Review** → the three Jordan Riveras, held for a human.

**WOW #1:** *One person, every directory, with the platform openly saying what it isn't sure about.*

> **Under the hood — Act 1**
>
> | What the audience sees | Databricks feature | Concrete objects |
> |---|---|---|
> | Accounts stitched into one person | **Lakeflow Job** task `resolve_identities` on **serverless compute**, writing with the **Delta Lake merge API** (`DeltaTable.merge` with `whenNotMatchedBySourceUpdate/Delete`) | `notebooks/identity/01_identity_spine.py`, `_shared/identity_resolution.py` → `identity_canonical`, `identity_persona`, `identity_provider_xref` |
> | Every match explained, nothing silently merged | Append-only **Delta** decision log; change history kept by **Change Data Feed** | `identity_resolution_decision`, `identity_xref_history`, `identity_resolution_impact` |
> | Steward accepts / rejects | App writes through the **SQL Warehouse** as the app's service principal, with an audit row first | `identity_steward_decision`, `system_audit_log` (`identity_steward_*`) |
> | Source health | Snapshot metadata written per provider each run | `identity_source_health` |
> | Page only shows what *you* may see | **Databricks Apps on-behalf-of auth**: `SOC_DATA_ACCESS_MODE=user` and `user_api_scopes: [sql]`. Each request opens a warehouse connection with your `x-forwarded-access-token`, so **Unity Catalog** enforces your own grants | `app/backend/user_auth.py` |
> | "Run resolver now" button | **Jobs API** `jobs.run_now` from the App | `server.py` `trigger_job()`, `identity.py` (audited as `identity_run_resolver`) |
>
> **Say this:** "The matching is a serverless Databricks job writing Delta tables with merge, and every decision lands in an append-only Delta log. When you open this page, the query runs with *your* Unity Catalog identity. If you can't `SELECT` it in a notebook, you can't see it here."

---

## Act 2 — Taxi: "Follow the ghost" (3 min)

**Page: Identity Timeline**

1. Brian McDonald: HR termination on 20 Oct, then a **successful sign-in after termination**.
2. His findings: *Terminated but still enabled* in Duo and Entra ID; *Owner departed* on the **Baggage Reconciliation Service**.
3. **Todd Trncak**: *5 MFA push denials within 10 minutes*.
4. **Abhijit Tilak**: *Sign-in from RO within 4h of an MFA reset; usual: US*.

**WOW #2:** *HR events, sign-ins, MFA and access changes on one line per person, from every system.*

> **Under the hood — Act 2**
>
> | What the audience sees | Databricks feature | Concrete objects |
> |---|---|---|
> | One line per person from every system | Job task `build_timeline` (notebook 02) reads event files from the **UC Volume** `landing/identity_events/*.jsonl` and appends to a **Delta** table | `identity_event` |
> | "Signed in after termination", "MFA fatigue", "new country after reset" | Deterministic rules over the joined timeline, written as findings and stamped with a `timeline_version` | `identity_timeline_finding` |
> | Owner departed on a service account | Relationship table joined to HR status | `identity_relation` (owned_by / runs_on / belongs_to) |
> | Latest steward decision wins | SQL **window function** `row_number() OVER (PARTITION BY …)` | `_shared/identity_resolution.py` |
>
> **Say this:** "The timeline isn't a log viewer. It's a Delta table joined to identity, so 'signed in after HR terminated him' is a join, not a hunch."

---

## Act 3 — Takeoff: "How bad is it, and how would they get in?" (5 min)

**Page: Identity Risk** → Keith Murry (80, critical): crown-jewel access, a segregation-of-duties conflict (create vendors + approve payments), privilege on a standard account, standing privilege, timeline findings.

**Page: Access Graph & Paths** (the showpiece)

1. Let the map draw itself: people → accounts → groups → gold crown jewels. Small live pulses travel along routes as events arrive.
2. The **red animated line** and **pulsing ring** on the AAdvantage Loyalty Database mean takeover.
3. Hover **Blessy Baby**: *bbaby → Helpdesk-Tier1 → can take over (reset password) → adm-mbell → Loyalty-DB-Admins → AAdvantage Loyalty Database (admin)*.
4. Hover **Rudi Himawan**: *NOC-OnCall → Tier0-Operations → Domain Admins → Domain Controllers*.
5. Focus **Domain Controllers**, turn on **Takeover only**, go **Full screen**.

### The stowaway reveal (headline WOW)

6. Click **AAdvantage Loyalty Database**. Hover the third identity: the **Fare Pricing Copilot**, an unregistered AI agent in *Pricing-Model-Training* (purpose "Temporary") with **export** rights.
   > "Not admin. Export. It doesn't need to break anything. It just needs to copy."

**Page: Non-Human & Agents** → no owner, no GRC link. **Page: Group Context** → Pricing-Model-Training: no owner, an open finding.

**WOW #3:** *A live, explainable map of how anyone (people, services or AI agents) can reach what matters.*

> **Under the hood — Act 3**
>
> | What the audience sees | Databricks feature | Concrete objects |
> |---|---|---|
> | Risk score with every factor listed | Job task `score_access_risk` (notebook 03) on **serverless**; current and historical scores in **Delta**, each stamped with the weights version | `identity_risk_score`, `identity_risk_history` |
> | Nested groups resolved ("a group inside a group") | Group closure computed by breadth-first search in the job's Python | `_shared/identity_access.py` `_group_closure` → `identity_group_member` (direct and effective) |
> | Every route to every crown jewel, including password-reset takeover | Breadth-first path search over access edges in the same job | `attack_paths` → `identity_access_edge`, `identity_attack_path`, `identity_resource` |
> | Ownerless "temporary" group | Group hygiene rules | `identity_group`, `identity_group_finding` |
> | The map itself | The **Databricks App** reads routes through the **SQL Warehouse** with named parameters (`:resource_id`), as the signed-in user | `/api/identity/graph/*` in `app/backend/identity.py` |
> | Pulses on the map | The live feed reading `identity_event` (see Act 3½) | `/api/identity/live` |
>
> **Say this:** "The graph is computed once per run by a serverless job and stored as plain Delta rows: edges and paths. The app doesn't need a graph database. It reads a table, and that table has lineage, history and Unity Catalog permissions like everything else in your lakehouse."

---

## Act 3½ — Black box recorder: "Prove it happened, and prove nobody touched it" (3 min) — NEW

**Page: Access Graph & Paths** → side panel **Live feed** tab.

1. Point at the feed: new events drop in every few seconds, colour-coded, with a "need a look" counter.
   > "This is the flight recorder. Sign-ins, MFA prompts, grants, exports, as they land."
2. **Pick a timeframe.** Switch the chart to **1h**. Click one bar, then drag across three or four red bars.
   > "Red bars are the minutes where something needed a look. Drag across them and the feed shows exactly that slice."
   A chip appears: *Viewing 14:02–14:12 · N events · Back to live*.
3. **Drill down.** Click a red event, ideally a **Password reset on adm-mbell** (Blessy's takeover route) or an **export** by the Fare Pricing Copilot. A side panel opens.
   - **Details & graph:** actor → identity → account → system, with the full route to the crown jewel and **Show on map**.
     > "One event, and it already knows which attack path it belongs to."
   - **Raw data:** the row exactly as stored, downloadable with its seal.
   - **Chain of custody:** received → ingested → linked → sealed → viewed, the SHA-256 digest, the HMAC-SHA256 signature and the key id.
4. Press **Verify integrity**. Three green checks: data matches its digest, matches the stored row, signature valid.
   > "Your browser recomputed the fingerprint, the server re-read the row from Delta, and the signature checks out. This is what you hand an auditor or a court."
5. **The tamper test (crowd-pleaser).** Raw data → **Tamper test** → change `"country": "US"` to `"RO"` (or the account name) → back to Chain of custody → **Verify integrity**.
   > "Change a single character, and the seal breaks."
   Red: *Seal broken: this record was changed*. Click **Restore original**, verify again: green.
   > "The stored record was never changed; only this window was. And both looks were written to the audit log."

**WOW #3½:** *From a live blip on a chart to a signed, verifiable evidence record in three clicks.*

> **Under the hood — Act 3½**
>
> | What the audience sees | Databricks feature | Concrete objects |
> |---|---|---|
> | Live feed | **Databricks App** polls `GET /api/identity/live` (every 15 s on Databricks), which reads the **Delta** table through the **SQL Warehouse** as the signed-in user | `app/backend/identity_live.py` → `identity_event` |
> | Clickable timeline (10m / 1h / 24h) | One warehouse query bucketing events into 24 slots with `unix_timestamp` arithmetic; "need a look" uses the same rules as the feed colours | `GET /live/histogram?window=…` |
> | Selected time range | Parameterised range query (`:since`, `:until`), capped at 300 rows with a "showing newest 300" notice | `GET /live?since=&until=` |
> | Raw data | `SELECT *` of the stored `identity_event` row, normalised (UTC timestamps, exact numbers) | `GET /live/events/{id}` |
> | Digest and signature | SHA-256 over canonical JSON (sorted keys, compact, UTF-8) plus HMAC-SHA256 over event id, digest and seal time. The key comes from a **Databricks secret** bound to the App as an environment variable (`IDENTITY_CUSTODY_KEY`, via an app `secret` resource from scope `soc-secrets`) | `app/backend/identity_custody.py`; setup in `docs/INSTALLATION_MANUAL.md` §7.4 |
> | Custody trail | Built from the row itself: `occurred_at` + provider (received), `ingested_at` + Identity 01 job (ingested), `link_status` + `timeline_version` (linked), key id (sealed), viewer email from the App headers (accessed) | `identity_live.py` |
> | Verify integrity | The server re-reads the row from Delta, recomputes the digest and checks the HMAC in constant time | `POST /live/events/{id}/verify` |
> | "Both looks were logged" | Every view and verification is written to the audit table **before** data is returned; if the audit write fails, the request is refused | `system_audit_log` (`identity_event_view`, `identity_event_verify`) |
> | Browser and server agree byte-for-byte | Parity test over 20 records with unicode, quotes and nesting | `tools/identity_preview/check_custody_parity.mts`, `tests/property/test_identity_custody.py` |
>
> **Say this:** "The evidence never leaves Databricks. The record is a Delta row governed by Unity Catalog, the signing key lives in a Databricks secret, and every look at the evidence is itself audited. With Change Data Feed on the table, you can also show *when* any row changed."
>
> **Preview note:** in the browser preview, events are generated locally and signed with a key labelled *Preview demo key (not secret)*. On Databricks without a key, records are fingerprinted but not signed, and the panel says so.

---

## Act 4 — Turbulence: "Rehearse the fix before you touch production" (4 min)

**Page: What-If Simulator**

1. **Cut the Pricing Copilot's loyalty export**: 1 route removed, 15 risk points removed, nobody else affected.
2. **Un-nest NOC-OnCall from Tier0-Operations**: Rudi's back door closes, 40 points removed.
3. **Split Keith Murry's SAP duties**: critical identities drop from 2 to 1.
4. **Delete Domain Admins (lockout check)**: *Domain Controllers would be left with nobody able to administer them* (3 → 0).
5. **New scenario** live: pick a change, run it, watch the "Simulating" state finish. Delete your custom scenario afterwards (the samples are protected).

**Page: Federation Posture**: cargo forest (SID filtering off, by rudi.himawan), Partner SSO on RSA-SHA1, Ping → Entra ID certificate expiring 12 Nov, and the three guests.

**WOW #4:** *Rehearse every change, see the blast radius, and get a hard stop before a lockout.*

> **Under the hood — Act 4**
>
> | What the audience sees | Databricks feature | Concrete objects |
> |---|---|---|
> | New scenario saved | App inserts the request through the **SQL Warehouse** (audited) | `identity_whatif_scenario` |
> | "Simulating…" then results | The App triggers the **Lakeflow Job** `[0xDSI] Identity 02 - What-If Simulator` with **Jobs API** `run_now` and a `scenario_id` parameter. It runs on **serverless** against a copy of today's access data in memory, never against production tables | `notebooks/identity/04_*`, `resources/jobs.yml` |
> | Routes removed, risk delta, lockout stop | Result diffs written back to **Delta** with a `whatif_version` | `identity_whatif_result` |
> | Delete a custom scenario | `DELETE /whatif/scenarios/{id}`, audited as `identity_whatif_delete`; samples refused | `app/backend/identity_whatif.py` |
> | Trust posture | Job task `federation_posture` (notebook 05) checks each trust against a baseline | `identity_federation_trust`, `identity_federation_guest`, `identity_federation_finding`, `identity_federation_change` |
>
> **Say this:** "A what-if is a Databricks job run with a parameter. Serverless means there's no cluster to keep warm for it; it spins up, simulates and writes a Delta row."

---

## Act 5 — Landing: "Fix it, with a co-pilot, and keep the receipts" (4 min)

**Page: Identity Remediation**: stages **To review 7 · Awaiting approval 2 · In progress 0 · Done 2 · Closed 2**.

1. **Remove kmurry from Airport-Ramp-Ops**: **blocked** (he is the last person who can reach Flight Operations Control).
2. **Remove NOC-OnCall from Tier0-Operations**: **1 of 2 approvals**. The requester can never approve.
3. **Disable account bmcdonald**: executed, with the before-state and the exact undo stored.
4. **Disable account tom.ellis…**: executed, then **rolled back**, with the reason recorded.
5. **Closed**: a rejected and a dismissed request.

In the **Databricks app**, sign in as a second analyst and approve live.

**Page: Identity Answers**: same questions as version 1 (riskiest identities, why the Copilot is risky, who can reach the loyalty DB, which Jordan Rivera, the password refusal, the Delete Domain Admins refusal, the Deloitte trust, Todd's recent activity).

**WOW #5:** *A governed fix pipeline and an assistant that answers with evidence, refuses secrets and never writes.*

> **Under the hood — Act 5**
>
> | What the audience sees | Databricks feature | Concrete objects |
> |---|---|---|
> | Proposals from findings | Job task `plan_remediation` (notebook 06, `stage=plan`) at the end of **Identity 01** | `identity_remediation_action` |
> | Two-person rule bound to the exact change | Approvals stored per `action_hash` and data version; the requester is rejected server-side | `identity_remediation_approval` |
> | Execution, undo, rollback | **Lakeflow Job** `[0xDSI] Identity 03 - Remediation Executor` (serverless, cron `0 45 * * * ?`, `max_concurrent_runs: 1`) drains a leased, idempotent outbox (5-minute lease, 3 attempts), storing before-state and inverse | `identity_remediation_outbox`; `_shared/identity_remediation.py` |
> | "Dry run" | Every call is recorded exactly as it would be sent; live connectors are deliberately absent | `dry_run` job parameter |
> | Who approved what | App identity from the **Databricks Apps** user headers (`X-Forwarded-Email`); access to the app by **app permissions** (`soc_admins` CAN_MANAGE, `soc_analysts` CAN_USE) | `resources/app.yml`, `system_audit_log` |
> | Identity Answers | A fixed-rule parser in the App: approved question types, read-only parameterised warehouse lookups, refusals for secrets and write requests. **No language model** is used here | `app/backend/identity_answer_parser.py` → `identity_answer_log` |
>
> **Say this:** "The executor is a single-concurrency serverless job reading a Delta outbox, so two runs can never apply the same change twice. And Answers deliberately doesn't use an LLM: every answer is a governed SQL lookup you can cite."

> **Closing line:** "Brian left. His access didn't. In twenty minutes we found him, three back doors and an AI agent copying the loyalty database. We proved every event with a signed record, rehearsed every fix, refused the one that would have locked us out, fixed the rest with two signatures each, and can undo any of it. All of it inside Databricks. Ladies and gentlemen, welcome to your destination."

---

## The 10-minute cut

1. **Identity Explorer** → Brian McDonald. *(Delta merge resolver, on-behalf-of reads)*
2. **Identity Timeline** → sign-in after termination. *(identity_event + timeline findings)*
3. **Access Graph & Paths** → hover Blessy, reveal the Fare Pricing Copilot. *(paths precomputed by a serverless job)*
4. **Live feed** → drag across red bars → open an event → **Verify**, then the tamper test. *(signed Delta row, secret-backed key, audited views)*
5. **What-If Simulator** → Delete Domain Admins lockout warning. *(Jobs API run_now with parameters)*
6. **Identity Remediation** → the blocked Keith fix and the Tom Ellis rollback. *(leased Delta outbox, two-person rule)*
7. **Identity Answers** → "Why is the Fare Pricing Copilot risky?", then the password refusal. *(no LLM, governed lookups)*

---

## Questions you'll get (technical edition)

| Question | Answer |
|----------|--------|
| Does the data leave Databricks? | No. Landing files sit in a Unity Catalog volume, processing is serverless Databricks jobs, storage is Delta in Unity Catalog, serving is a SQL warehouse and the UI is a Databricks App. |
| How do you stop the app seeing more than the user? | `SOC_DATA_ACCESS_MODE=user` with the `sql` user scope: each request uses the viewer's own token against the warehouse, so Unity Catalog grants apply per person. Writes use the app's service principal and are audited first. |
| Is there SQL injection risk? | Values are bound as named parameters (`:param`) through databricks-sql-connector; table names come only from the configured catalog and schema. |
| What compute does it need? | One SQL warehouse plus serverless jobs. There is no always-on cluster for identity. |
| Is it a graph database? | No. Group closure and attack paths are computed by the job and stored as Delta rows (`identity_access_edge`, `identity_attack_path`). |
| Is AI making access decisions? | No. Resolution, scoring, simulation and Answers are deterministic. The platform's model-serving endpoints are used by other SOC features, not by Identity. |
| How is the evidence signed? | SHA-256 over canonical JSON plus HMAC-SHA256 with a key held in a Databricks secret and bound to the app. Verification re-reads the row server-side. |
| How do you deploy it? | `deploy.sh` runs `databricks bundle deploy` (Asset Bundles, targets dev / staging / production), creates the `soc-secrets` scope, then the setup job creates the tables. |
| Can I see history? | Every identity table has Change Data Feed enabled, and decisions, approvals, scores and answers are kept in append-only tables. |

---

## Not used yet (don't claim these on stage)

These are natural next steps, but the Identity feature does **not** use them today:

| Feature | Status today | Possible use |
|---------|--------------|--------------|
| Auto Loader / Structured Streaming | Not used: events are batch-loaded hourly | Near-real-time `identity_event` ingestion |
| Unity Catalog row filters, column masks, tags, table comments | Not used: access relies on table grants plus on-behalf-of reads | Mask guest emails, tag crown-jewel data |
| `system.access.audit` system tables | Not used: the app writes its own `system_audit_log` | Correlate app audit with workspace audit |
| Delta time travel in the UI | Not used (versions are labels such as `access_version`) | "Show me the graph as of last Tuesday" |
| GraphFrames | Not used for Identity (the bundle variable is for another engine) | Very large estates |
| Model Serving / `ai_query` / Vector Search | Not used for Identity | Optional summarisation, always citing table rows |
| AI/BI dashboards, Genie, Lakehouse Monitoring, Delta Sharing | Not used for Identity | Executive dashboard, drift alerts, sharing findings with auditors |

---

## Resetting between runs

- **Databricks app**: re-run the identity fixture seeding (`07_seed_identity_fixtures.py`) and the **Identity 01** job. Live approvals, rollbacks, event views and verifications stay in `system_audit_log` unless the schema is reset.
- **Browser preview**: reload the page. Custom What-If scenarios are kept in this browser until you delete them.
