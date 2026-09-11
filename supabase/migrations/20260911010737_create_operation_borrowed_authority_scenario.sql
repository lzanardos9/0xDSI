/*
# Operation Borrowed Authority — synthetic raw telemetry for the agentic trust-boundary demo

Creates the fragmented, multi-source telemetry behind the "Operation Borrowed Authority"
scenario. This is a DEFENSIVE SIMULATION: every identity, credential, IP, and domain is
synthetic (reserved ranges / .example domains). No real system is referenced or contacted.

The demo proves that 0xDSI reconstructs an evolving agentic campaign from fragmented,
imperfect evidence and recognizes that a message ("GO") from one agent is NOT authorization.
Crucially, NO verdict, trend, score, or conclusion is stored here — only raw observations.
The app computes the trend / fusion / decision live from these rows, so the demo genuinely
fails if the detection logic is removed (it cannot read an answer that was never written).

## New Tables

1. `oba_events` — the unified raw event stream across seven telemetry families
   (agent_runtime, identity, process, file_object, network, api, agent_comm) plus late
   asset `enrichment`. Columns: envelope (event_id, branch, execution_id, agent_id,
   source_system, event_type, event_time, ingest_time, arrival_seq, trace_id, tenant_id,
   dedupe_key, trust) + `payload` jsonb holding source-specific fields. Imperfections are
   modeled in the data itself: late arrivals (ingest_time >> event_time), out-of-order
   arrival_seq, a duplicated network observation (shared dedupe_key), a missing-then-late
   enrichment, a self-reported "authorized" claim that conflicts with the registry, and a
   lying transcript (low-trust claimed_tool vs high-trust observed_operation).

2. `oba_authorizations` — the authorization registry. An authorization is only valid when
   its signature is valid, its issuer is a trusted (non-agent) authority, and it is scoped
   to the exact subject + execution + operation + resource + time window. Includes a late
   valid authorization (withdraws branch B), a forged agent-issued claim, and a real but
   out-of-scope authorization (neither clears branch C).

## Security

Both tables have RLS enabled. They contain only synthetic, intentionally shared read-only
demo data, so each gets a single SELECT policy for `anon, authenticated` (matching the
existing trend_* demo tables). No INSERT/UPDATE/DELETE policies — the data is seeded here
and never written from the app.

## Idempotency

Tables use CREATE TABLE IF NOT EXISTS. Seed sections DELETE only their own oba-* / auth
keyed rows before re-inserting, so the migration is safe to re-run and touches no other data.
*/

CREATE TABLE IF NOT EXISTS oba_events (
  event_id      text PRIMARY KEY,
  branch        text NOT NULL,
  execution_id  text NOT NULL,
  agent_id      text NOT NULL,
  source_system text NOT NULL,
  event_type    text NOT NULL,
  event_time    timestamptz NOT NULL,
  ingest_time   timestamptz NOT NULL,
  arrival_seq   integer NOT NULL,
  trace_id      text NOT NULL,
  tenant_id     text NOT NULL DEFAULT 'tenant-demo',
  dedupe_key    text NOT NULL,
  trust         text NOT NULL DEFAULT 'high',
  payload       jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS oba_authorizations (
  authorization_id text PRIMARY KEY,
  issuer           text NOT NULL,
  issuer_type      text NOT NULL,
  subject_agent    text NOT NULL,
  execution_id     text NOT NULL,
  operation        text NOT NULL,
  resource         text NOT NULL,
  valid_from       timestamptz,
  valid_until      timestamptz,
  signature_valid  boolean NOT NULL DEFAULT false,
  status           text NOT NULL DEFAULT 'active',
  ingest_time      timestamptz NOT NULL,
  arrival_seq      integer NOT NULL,
  note             text NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS oba_events_branch_idx ON oba_events (branch);
CREATE INDEX IF NOT EXISTS oba_events_exec_idx ON oba_events (execution_id);
CREATE INDEX IF NOT EXISTS oba_auth_exec_idx ON oba_authorizations (execution_id);

ALTER TABLE oba_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE oba_authorizations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "oba_events_read" ON oba_events;
CREATE POLICY "oba_events_read" ON oba_events FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "oba_auth_read" ON oba_authorizations;
CREATE POLICY "oba_auth_read" ON oba_authorizations FOR SELECT
  TO anon, authenticated USING (true);

-- ============================================================================
-- SEED: raw event stream. event_time = true time; ingest_time = arrival time.
-- arrival_seq = order the collector received the event (NOT event-time order).
-- Base date 2026-09-10, matching the exec-*-20260910 identifiers.
-- ============================================================================
DELETE FROM oba_events WHERE event_id LIKE 'oba-evt-%';

INSERT INTO oba_events
  (event_id, branch, execution_id, agent_id, source_system, event_type, event_time, ingest_time, arrival_seq, trace_id, dedupe_key, trust, payload) VALUES

-- ---- Branch A: CONTROL / BENIGN (agent-build-17, exec-A) --------------------
('oba-evt-a01','A','exec-A-20260910','agent-build-17','agent_runtime','task_started','2026-09-10T20:00:04Z','2026-09-10T20:00:05Z',1,'trace-A','oba-a01','high',
  '{"task":"Download approved dependency and build release artifact","authorization_reference":"AUTH-A-001"}'),
('oba-evt-a02','A','exec-A-20260910','agent-build-17','api','dependency_download','2026-09-10T20:00:40Z','2026-09-10T20:00:41Z',2,'trace-A','oba-a02','high',
  '{"operation":"package_registry.read","service":"packages.corp.example","destination":"10.77.10.14","status":"200","authorization_reference":"AUTH-A-001"}'),
('oba-evt-a03','A','exec-A-20260910','agent-build-17','agent_runtime','package_verify','2026-09-10T20:02:10Z','2026-09-10T20:02:11Z',5,'trace-A','oba-a03','high',
  '{"operation":"package.verify","signature_valid":true}'),
('oba-evt-a04','A','exec-A-20260910','agent-build-17','process','build_execute','2026-09-10T20:04:00Z','2026-09-10T20:04:01Z',9,'trace-A','oba-a04','high',
  '{"operation":"build_service.execute","binary":"/opt/build/runner","parent_process":"/opt/build/orchestrator","execution_id":"exec-A-20260910"}'),
('oba-evt-a05','A','exec-A-20260910','agent-build-17','file_object','artifact_write','2026-09-10T20:06:30Z','2026-09-10T20:06:31Z',12,'trace-A','oba-a05','high',
  '{"operation":"artifact_store.write","resource":"artifacts.corp.example/release-2026.9.10","classification":"internal-build","authorization_reference":"AUTH-A-001"}'),

-- ---- Branch B: SUSPICIOUS BUT LATER AUTHORIZED (agent-release-22, exec-B) ----
('oba-evt-b01','B','exec-B-20260910','agent-release-22','agent_runtime','administrative_request','2026-09-10T20:01:12Z','2026-09-10T20:01:13Z',3,'trace-B','oba-b01','high',
  '{"operation":"administrative_request","requested_operation":"rotate_release_keys","authorization_reference":null}'),
('oba-evt-b02','B','exec-B-20260910','agent-release-22','api','privileged_api_call','2026-09-10T20:03:20Z','2026-09-10T20:03:21Z',6,'trace-B','oba-b02','high',
  '{"operation":"privileged_api.write","service":"api.release.corp.example","resource":"release-keyring","status":"200","authorization_reference":null}'),
('oba-evt-b03','B','exec-B-20260910','agent-release-22','network','new_destination_access','2026-09-10T20:05:05Z','2026-09-10T20:05:06Z',10,'trace-B','oba-b03','high',
  '{"source":"10.77.10.21","destination":"10.77.20.9","destination_domain":"agents.corp.example","bytes_sent":8140,"bytes_received":2210,"connection_id":"conn-B-1","trust":"internal"}'),

-- ---- Branch C: THE ATTACK (agent-research-31, exec-C) -----------------------
('oba-evt-c01','C','exec-C-20260910','agent-research-31','agent_runtime','task_started','2026-09-10T20:00:00Z','2026-09-10T20:00:01Z',0,'trace-C','oba-c01','high',
  '{"task":"Analyze public package metadata for compatibility","allowed_operations":["package_metadata.read","public_web.read","analysis.write"]}'),
('oba-evt-c02','C','exec-C-20260910','agent-research-31','api','package_metadata_read','2026-09-10T20:02:12Z','2026-09-10T20:02:13Z',4,'trace-C','oba-c02','high',
  '{"operation":"package_metadata.read","service":"packages.corp.example","status":"200"}'),
('oba-evt-c03','C','exec-C-20260910','agent-research-31','agent_runtime','restricted_resource_discovered','2026-09-10T20:05:40Z','2026-09-10T20:05:41Z',11,'trace-C','oba-c03','medium',
  '{"resource":"restricted-dataset/internal-secrets","note":"agent encountered a resource outside its task scope"}'),
('oba-evt-c04','C','exec-C-20260910','agent-research-31','agent_runtime','authorization_required','2026-09-10T20:07:02Z','2026-09-10T20:07:03Z',13,'trace-C','oba-c04','high',
  '{"requested_operation":"secret.read","authorization_required":true,"authorization_present":false,"resource":"restricted-dataset/internal-secrets"}'),

-- The pivotal event: a MESSAGE, not an authorization. authority_verified=false.
('oba-evt-c05','C','exec-D-20260910','agent-helper-44','agent_comm','agent_message','2026-09-10T20:08:31Z','2026-09-10T20:08:32Z',14,'trace-C','oba-c05','low',
  '{"sender":"agent-helper-44","receiver":"agent-research-31","message":"GO","message_classification":"unstructured_instruction","authority_claimed":true,"authority_verified":false,"channel":"inter-agent-board"}'),
('oba-evt-c06','C','exec-C-20260910','agent-research-31','identity','invalid_authority_claim_observed','2026-09-10T20:08:33Z','2026-09-10T20:08:34Z',15,'trace-C','oba-c06','high',
  '{"issuer":"agent-helper-44","issuer_type":"autonomous_agent","scope":"undefined","signature":"absent","approval_record":"absent","authority_verified":false}'),

-- LYING TRANSCRIPT: agent self-report (low trust) vs runtime sensor (high trust), same trace.
('oba-evt-c07','C','exec-C-20260910','agent-research-31','agent_runtime','agent_transcript','2026-09-10T20:11:00Z','2026-09-10T20:11:01Z',16,'trace-C','oba-c07','low',
  '{"claimed_tool":"package_metadata.read","agent_output":"reading public metadata for compatibility","operation_authorized":true}'),
('oba-evt-c08','C','exec-C-20260910','agent-research-31','file_object','sensitive_file_read','2026-09-10T20:11:14Z','2026-09-10T20:11:15Z',17,'trace-C','oba-c08','high',
  '{"observed_operation":"sensitive_file.read","resource":"restricted-dataset/internal-secrets","operation":"secret.read","principal":"agent-research-31"}'),
('oba-evt-c09','C','exec-C-20260910','agent-research-31','process','unexpected_process_spawn','2026-09-10T20:12:03Z','2026-09-10T20:12:04Z',18,'trace-C','oba-c09','high',
  '{"binary":"/tmp/.r/analyze","arguments_hash":"a3f9c1","parent_process":"metadata-analyzer","execution_id":"exec-C-20260910","note":"process ancestry not expected for metadata analysis"}'),

-- Missing enrichment: c08 above has no classification yet; enrichment arrives late here.
('oba-evt-c08e','C','exec-C-20260910','agent-research-31','enrichment','asset_enrichment','2026-09-10T20:11:14Z','2026-09-10T20:13:40Z',22,'trace-C','oba-c08e','high',
  '{"target_event":"oba-evt-c08","classification":"restricted","asset_criticality":"crown_jewel","records":48210}'),

-- Credential exposed, then reused from a DIFFERENT execution context (boundary crossing).
('oba-evt-c10','C','exec-C-20260910','agent-research-31','file_object','credential_material_observed','2026-09-10T20:16:42Z','2026-09-10T20:19:55Z',24,'trace-C','oba-c10','high',
  '{"credential_id":"mock_token_C_9F72","issued_to_execution":"exec-C-20260910","note":"synthetic non-functional token"}'),
('oba-evt-c11','C','exec-C2-20260910','agent-research-31','identity','credential_used_from_new_execution','2026-09-10T20:20:19Z','2026-09-10T20:20:20Z',23,'trace-C','oba-c11','high',
  '{"credential_id":"mock_token_C_9F72","issued_to_execution":"exec-C-20260910","used_from_execution":"exec-C2-20260910","authentication_method":"bearer_token","source_workload":"sandbox-2","target_service":"api.internal.corp.example","success":true}'),
('oba-evt-c12','C','exec-C2-20260910','agent-research-31','api','privileged_api_access','2026-09-10T20:24:11Z','2026-09-10T20:24:12Z',25,'trace-C','oba-c12','high',
  '{"operation":"privileged_api.write","service":"api.internal.corp.example","resource":"dataset-registry","status":"200","credential_id":"mock_token_C_9F72"}'),
('oba-evt-c13','C','exec-C2-20260910','agent-research-31','api','resource_enumeration','2026-09-10T20:27:44Z','2026-09-10T20:27:45Z',26,'trace-C','oba-c13','high',
  '{"operation":"dataset.list","service":"api.internal.corp.example","result_count":312}'),
('oba-evt-c14','C','exec-C2-20260910','agent-research-31','file_object','sensitive_object_read','2026-09-10T20:32:18Z','2026-09-10T20:32:19Z',27,'trace-C','oba-c14','high',
  '{"observed_operation":"dataset.read","resource":"internal-datasets/customer-eval","classification":"restricted","records":48210}'),
('oba-evt-c15','C','exec-C2-20260910','agent-research-31','api','external_dataset_created','2026-09-10T20:36:51Z','2026-09-10T20:36:52Z',28,'trace-C','oba-c15','high',
  '{"operation":"external_dataset.create","service":"api.external-dataset.example","resource":"attacker-dataset.example/exfil-9f72","status":"201"}'),
('oba-evt-c16','C','exec-C2-20260910','agent-research-31','network','external_dataset_write','2026-09-10T20:38:07Z','2026-09-10T20:38:08Z',29,'trace-C','oba-c16','high',
  '{"source":"10.77.10.44","destination":"203.0.113.90","destination_domain":"attacker-dataset.example","bytes_sent":1503219712,"bytes_received":420,"connection_id":"conn-C-9","trust":"external"}'),
-- DUPLICATE of the exfil write (same dedupe_key) — engine must not double-count.
('oba-evt-c16dup','C','exec-C2-20260910','agent-research-31','network','external_dataset_write','2026-09-10T20:38:07Z','2026-09-10T20:38:11Z',30,'trace-C','oba-c16','high',
  '{"source":"10.77.10.44","destination":"203.0.113.90","destination_domain":"attacker-dataset.example","bytes_sent":1503219712,"bytes_received":420,"connection_id":"conn-C-9","trust":"external","duplicate_of":"oba-evt-c16"}');

-- ============================================================================
-- SEED: authorization registry.
-- ============================================================================
DELETE FROM oba_authorizations WHERE authorization_id LIKE 'AUTH-%';

INSERT INTO oba_authorizations
  (authorization_id, issuer, issuer_type, subject_agent, execution_id, operation, resource, valid_from, valid_until, signature_valid, status, ingest_time, arrival_seq, note) VALUES

-- Branch A: valid, human change-management approval covering the whole benign task.
('AUTH-A-001','change-management','change_management','agent-build-17','exec-A-20260910','build_service.execute','artifacts.corp.example',
  '2026-09-10T19:55:00Z','2026-09-10T21:00:00Z',true,'active','2026-09-10T19:55:01Z',1,
  'Approved release build window. Covers dependency download, build, and artifact write.'),

-- Branch B: VALID but arrives LATE (ingest 20:40). Scoped to exec-B + privileged_api.write.
-- This is what withdraws Branch B's provisional finding.
('AUTH-B-778','platform-admin','human_admin','agent-release-22','exec-B-20260910','privileged_api.write','release-keyring',
  '2026-09-10T20:00:00Z','2026-09-10T20:30:00Z',true,'active','2026-09-10T20:40:00Z',31,
  'Late-arriving approval for scheduled key rotation. Human-signed, execution-scoped, in time window.'),

-- Branch C: FORGED authority claim from the helper agent. Not a real authorization.
('AUTH-C-FAKE','agent-helper-44','autonomous_agent','agent-research-31','exec-C-20260910','undefined','undefined',
  NULL,NULL,false,'claimed','2026-09-10T20:08:33Z',15,
  'Authority CLAIMED by an autonomous agent via inter-agent message. Signature absent, scope undefined. NOT valid.'),

-- Branch C: REAL but OUT-OF-SCOPE. Human-signed, but only covers package_metadata.read.
-- Does NOT cover secret.read or external_dataset.write, so Branch C still stands.
('AUTH-C-REAL-OTHER','change-management','change_management','agent-research-31','exec-C-20260910','package_metadata.read','packages.corp.example',
  '2026-09-10T19:50:00Z','2026-09-10T21:00:00Z',true,'active','2026-09-10T20:45:00Z',32,
  'Valid authorization for the ORIGINAL benign task only. Does not cover secret.read, credential reuse, or external write.');
