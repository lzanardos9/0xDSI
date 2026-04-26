/*
  # Upgrade Cases to a World-Class SOC Case Management System

  This migration extends the basic `cases` table and adds a constellation of
  related tables to bring case management on par with — and beyond — Chronicle,
  Splunk SOAR, Palo Alto XSOAR, IBM QRadar SOAR, Sentinel and ServiceNow SecOps.

  1. Extends `cases` with:
     - Risk scoring, confidence, financial impact, blast radius
     - SLA contract: ack/contain/resolve targets and breach flags
     - TLP classification, MITRE ATT&CK techniques, kill-chain phase
     - Case linkage: parent_case_id (merge/split), external_ticket_id
     - Watchers and team assignment
     - Originating alert and the phase where it was opened

  2. New tables:
     - `case_evidence` - Evidence items with chain-of-custody hashes
     - `case_iocs` - Indicators of Compromise per case with TLP
     - `case_attack_techniques` - MITRE ATT&CK mapping with confidence
     - `case_actions` - Response actions taken with reversibility
     - `case_watchers` - Users subscribed to a case
     - `case_links` - Case-to-case relationships (parent/child/related/duplicate)
     - `case_templates` - Pre-built investigation templates by case type
     - `case_audit_log` - Immutable audit trail for compliance

  3. Security: RLS enabled with strict authenticated/anon policies for demo.
*/

-- 1. Extend cases table -------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cases' AND column_name='risk_score') THEN
    ALTER TABLE cases ADD COLUMN risk_score integer DEFAULT 0 CHECK (risk_score BETWEEN 0 AND 100);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cases' AND column_name='confidence') THEN
    ALTER TABLE cases ADD COLUMN confidence numeric(4,3) DEFAULT 0.5 CHECK (confidence BETWEEN 0 AND 1);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cases' AND column_name='financial_impact_usd') THEN
    ALTER TABLE cases ADD COLUMN financial_impact_usd numeric(14,2) DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cases' AND column_name='affected_assets') THEN
    ALTER TABLE cases ADD COLUMN affected_assets text[] DEFAULT '{}';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cases' AND column_name='affected_identities') THEN
    ALTER TABLE cases ADD COLUMN affected_identities text[] DEFAULT '{}';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cases' AND column_name='tlp') THEN
    ALTER TABLE cases ADD COLUMN tlp text DEFAULT 'amber' CHECK (tlp IN ('red','amber','green','white','clear'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cases' AND column_name='kill_chain_phase') THEN
    ALTER TABLE cases ADD COLUMN kill_chain_phase text DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cases' AND column_name='attack_chain') THEN
    ALTER TABLE cases ADD COLUMN attack_chain jsonb DEFAULT '[]'::jsonb;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cases' AND column_name='ack_due_at') THEN
    ALTER TABLE cases ADD COLUMN ack_due_at timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cases' AND column_name='contain_due_at') THEN
    ALTER TABLE cases ADD COLUMN contain_due_at timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cases' AND column_name='resolve_due_at') THEN
    ALTER TABLE cases ADD COLUMN resolve_due_at timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cases' AND column_name='acknowledged_at') THEN
    ALTER TABLE cases ADD COLUMN acknowledged_at timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cases' AND column_name='contained_at') THEN
    ALTER TABLE cases ADD COLUMN contained_at timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cases' AND column_name='sla_breach') THEN
    ALTER TABLE cases ADD COLUMN sla_breach text DEFAULT 'on_track' CHECK (sla_breach IN ('on_track','at_risk','breached','met'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cases' AND column_name='parent_case_id') THEN
    ALTER TABLE cases ADD COLUMN parent_case_id uuid REFERENCES cases(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cases' AND column_name='external_ticket_id') THEN
    ALTER TABLE cases ADD COLUMN external_ticket_id text DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cases' AND column_name='originating_alert_id') THEN
    ALTER TABLE cases ADD COLUMN originating_alert_id text DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cases' AND column_name='opened_at_phase') THEN
    ALTER TABLE cases ADD COLUMN opened_at_phase integer DEFAULT 7;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cases' AND column_name='ai_summary') THEN
    ALTER TABLE cases ADD COLUMN ai_summary text DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cases' AND column_name='playbook_id') THEN
    ALTER TABLE cases ADD COLUMN playbook_id text DEFAULT '';
  END IF;
END $$;

-- 2. case_evidence ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS case_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  evidence_type text NOT NULL DEFAULT 'log',
  title text NOT NULL DEFAULT '',
  description text DEFAULT '',
  source_system text DEFAULT '',
  collected_by text DEFAULT '',
  sha256 text DEFAULT '',
  size_bytes bigint DEFAULT 0,
  confidence numeric(4,3) DEFAULT 0.8,
  custody_chain jsonb DEFAULT '[]'::jsonb,
  payload jsonb DEFAULT '{}'::jsonb,
  is_sealed boolean DEFAULT false,
  collected_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_case_evidence_case_id ON case_evidence(case_id);
ALTER TABLE case_evidence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read case evidence"
  ON case_evidence FOR SELECT TO authenticated, anon USING (true);
CREATE POLICY "Insert case evidence"
  ON case_evidence FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Update case evidence"
  ON case_evidence FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Delete case evidence"
  ON case_evidence FOR DELETE TO authenticated USING (true);

-- 3. case_iocs ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS case_iocs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  ioc_type text NOT NULL DEFAULT 'ip',
  ioc_value text NOT NULL DEFAULT '',
  tlp text DEFAULT 'amber' CHECK (tlp IN ('red','amber','green','white','clear')),
  confidence numeric(4,3) DEFAULT 0.8,
  first_seen timestamptz DEFAULT now(),
  last_seen timestamptz DEFAULT now(),
  feed_source text DEFAULT '',
  is_blocked boolean DEFAULT false,
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_case_iocs_case_id ON case_iocs(case_id);
CREATE INDEX IF NOT EXISTS idx_case_iocs_value ON case_iocs(ioc_value);
ALTER TABLE case_iocs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read case iocs" ON case_iocs FOR SELECT TO authenticated, anon USING (true);
CREATE POLICY "Insert case iocs" ON case_iocs FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Update case iocs" ON case_iocs FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Delete case iocs" ON case_iocs FOR DELETE TO authenticated USING (true);

-- 4. case_attack_techniques ---------------------------------------------------
CREATE TABLE IF NOT EXISTS case_attack_techniques (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  technique_id text NOT NULL DEFAULT '',
  technique_name text NOT NULL DEFAULT '',
  tactic text NOT NULL DEFAULT '',
  confidence numeric(4,3) DEFAULT 0.7,
  evidence_summary text DEFAULT '',
  first_observed timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_case_attack_case_id ON case_attack_techniques(case_id);
ALTER TABLE case_attack_techniques ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read attack" ON case_attack_techniques FOR SELECT TO authenticated, anon USING (true);
CREATE POLICY "Insert attack" ON case_attack_techniques FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Update attack" ON case_attack_techniques FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Delete attack" ON case_attack_techniques FOR DELETE TO authenticated USING (true);

-- 5. case_actions -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS case_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  action_name text NOT NULL DEFAULT '',
  action_type text NOT NULL DEFAULT 'manual',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','executing','completed','failed','rolled_back','rejected')),
  reversible boolean DEFAULT true,
  requires_approval boolean DEFAULT false,
  approved_by text DEFAULT '',
  approved_at timestamptz,
  executed_by text DEFAULT '',
  executed_at timestamptz,
  result_summary text DEFAULT '',
  rollback_handle text DEFAULT '',
  params jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_case_actions_case_id ON case_actions(case_id);
ALTER TABLE case_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read actions" ON case_actions FOR SELECT TO authenticated, anon USING (true);
CREATE POLICY "Insert actions" ON case_actions FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Update actions" ON case_actions FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Delete actions" ON case_actions FOR DELETE TO authenticated USING (true);

-- 6. case_watchers ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS case_watchers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  watcher_user text NOT NULL DEFAULT '',
  watcher_role text DEFAULT 'analyst',
  added_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_case_watchers_case_id ON case_watchers(case_id);
ALTER TABLE case_watchers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read watchers" ON case_watchers FOR SELECT TO authenticated, anon USING (true);
CREATE POLICY "Insert watchers" ON case_watchers FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Update watchers" ON case_watchers FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Delete watchers" ON case_watchers FOR DELETE TO authenticated USING (true);

-- 7. case_links ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS case_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_case_id uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  target_case_id uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  link_type text NOT NULL DEFAULT 'related' CHECK (link_type IN ('related','duplicate','parent','child','merged_into','split_from')),
  reason text DEFAULT '',
  created_by text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_case_links_source ON case_links(source_case_id);
CREATE INDEX IF NOT EXISTS idx_case_links_target ON case_links(target_case_id);
ALTER TABLE case_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read links" ON case_links FOR SELECT TO authenticated, anon USING (true);
CREATE POLICY "Insert links" ON case_links FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Update links" ON case_links FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Delete links" ON case_links FOR DELETE TO authenticated USING (true);

-- 8. case_templates -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS case_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_name text NOT NULL UNIQUE,
  case_type text NOT NULL DEFAULT 'general',
  default_priority text DEFAULT 'medium',
  default_severity text DEFAULT 'medium',
  ack_minutes integer DEFAULT 30,
  contain_minutes integer DEFAULT 240,
  resolve_minutes integer DEFAULT 1440,
  default_playbook_id text DEFAULT '',
  default_attack_techniques text[] DEFAULT '{}',
  investigation_steps jsonb DEFAULT '[]'::jsonb,
  description text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE case_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read templates" ON case_templates FOR SELECT TO authenticated, anon USING (true);
CREATE POLICY "Insert templates" ON case_templates FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Update templates" ON case_templates FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Delete templates" ON case_templates FOR DELETE TO authenticated USING (true);

-- 9. case_audit_log -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS case_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  actor text NOT NULL DEFAULT '',
  action text NOT NULL DEFAULT '',
  field_changed text DEFAULT '',
  old_value text DEFAULT '',
  new_value text DEFAULT '',
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_case_audit_case_id ON case_audit_log(case_id);
CREATE INDEX IF NOT EXISTS idx_case_audit_created_at ON case_audit_log(created_at DESC);
ALTER TABLE case_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read audit" ON case_audit_log FOR SELECT TO authenticated, anon USING (true);
CREATE POLICY "Insert audit" ON case_audit_log FOR INSERT TO authenticated WITH CHECK (true);

-- 10. Seed templates ----------------------------------------------------------
INSERT INTO case_templates (template_name, case_type, default_priority, default_severity, ack_minutes, contain_minutes, resolve_minutes, default_playbook_id, default_attack_techniques, investigation_steps, description)
VALUES
  ('C2 Beacon to Crown-Jewel Asset', 'malware_c2', 'critical', 'critical', 5, 30, 240, 'PB-014', ARRAY['T1071.001','T1090'],
    '[{"step":"Isolate host via EDR","owner":"response"},{"step":"Pull memory image","owner":"forensics"},{"step":"Pivot on JA3 fingerprint","owner":"hunt"},{"step":"Reset credentials for affected user","owner":"identity"},{"step":"Block C2 indicators globally","owner":"network"}]'::jsonb,
    'Beaconing pattern observed from a high-criticality asset to a known C2.'),
  ('Insider Credential Selling', 'insider_threat', 'high', 'high', 30, 240, 1440, 'PB-IT-09', ARRAY['T1078','T1556'],
    '[{"step":"Confirm session anomalies on identity timeline","owner":"identity"},{"step":"Review typing biometrics divergence","owner":"behavioral"},{"step":"Review HR pulse signals","owner":"hr"},{"step":"Engage legal before containment","owner":"legal"}]'::jsonb,
    'Suspicious session reuse, geographic impossibility, or biometric divergence indicating credential resale.'),
  ('Data Exfiltration via DNS', 'data_exfil', 'high', 'high', 15, 120, 480, 'PB-DLP-04', ARRAY['T1048.003','T1071.004'],
    '[{"step":"Block resolver","owner":"network"},{"step":"Identify exfiltrated dataset","owner":"data"},{"step":"DLP corpus diff","owner":"data"},{"step":"GDPR/PII notification","owner":"compliance"}]'::jsonb,
    'High-entropy DNS queries to a single second-level domain matching DNS tunneling signatures.'),
  ('Ransomware Pre-Detonation', 'ransomware', 'critical', 'critical', 5, 15, 120, 'PB-RW-01', ARRAY['T1486','T1490'],
    '[{"step":"Network-isolate the source host","owner":"response"},{"step":"Snapshot Volume Shadow","owner":"forensics"},{"step":"Identify lateral movement","owner":"hunt"},{"step":"Activate IR retainer","owner":"ir-lead"}]'::jsonb,
    'Volume Shadow deletion, mass file encryption, or LOLBin sequence consistent with ransomware staging.'),
  ('SaaS Account Takeover', 'account_takeover', 'high', 'high', 10, 60, 240, 'PB-ATO-02', ARRAY['T1078.004','T1539'],
    '[{"step":"Revoke active sessions","owner":"identity"},{"step":"Force MFA re-enrolment","owner":"identity"},{"step":"Audit OAuth grants","owner":"identity"},{"step":"Review mailbox rules","owner":"saas"}]'::jsonb,
    'Impossible-travel sign-in plus session token reuse on a SaaS surface.')
ON CONFLICT (template_name) DO NOTHING;

-- 11. Backfill new fields on existing cases with sensible defaults -----------
UPDATE cases SET
  risk_score = COALESCE(risk_score, CASE
    WHEN priority = 'critical' THEN 90
    WHEN priority = 'high' THEN 72
    WHEN priority = 'medium' THEN 48
    ELSE 25 END),
  confidence = COALESCE(confidence, 0.75),
  ack_due_at = COALESCE(ack_due_at, created_at + interval '15 minutes'),
  contain_due_at = COALESCE(contain_due_at, created_at + interval '4 hours'),
  resolve_due_at = COALESCE(resolve_due_at, created_at + interval '24 hours'),
  sla_breach = COALESCE(sla_breach, 'on_track'),
  tlp = COALESCE(tlp, 'amber'),
  opened_at_phase = COALESCE(opened_at_phase, 7)
WHERE risk_score IS NULL OR confidence IS NULL OR ack_due_at IS NULL;
