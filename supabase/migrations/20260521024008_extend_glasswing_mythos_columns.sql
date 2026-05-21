/*
  # Extend Glasswing for Mythos Pipeline

  Adds missing columns to existing tables for the 5-stage pipeline:
  - scan_run_id, title on findings
  - traffic_volume, correlation fields on reachability
  - target_file/codebase on patches
  - blocks_24h on waf_rules
  - Indexes for performance
  - Anon read policies
*/

-- Findings: add scan_run_id, title
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'glasswing_findings' AND column_name = 'scan_run_id') THEN
        ALTER TABLE glasswing_findings ADD COLUMN scan_run_id text;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'glasswing_findings' AND column_name = 'title') THEN
        ALTER TABLE glasswing_findings ADD COLUMN title text;
    END IF;
END $$;

-- Reachability: add traffic correlation fields
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'glasswing_reachability' AND column_name = 'traffic_volume_24h') THEN
        ALTER TABLE glasswing_reachability ADD COLUMN traffic_volume_24h bigint DEFAULT 0;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'glasswing_reachability' AND column_name = 'last_accessed_at') THEN
        ALTER TABLE glasswing_reachability ADD COLUMN last_accessed_at timestamptz;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'glasswing_reachability' AND column_name = 'attacker_controlled_params') THEN
        ALTER TABLE glasswing_reachability ADD COLUMN attacker_controlled_params jsonb DEFAULT '[]'::jsonb;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'glasswing_reachability' AND column_name = 'correlation_event_ids') THEN
        ALTER TABLE glasswing_reachability ADD COLUMN correlation_event_ids jsonb DEFAULT '[]'::jsonb;
    END IF;
END $$;

-- Exploit chains: confidence and full poc
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'glasswing_exploit_chains' AND column_name = 'combined_confidence') THEN
        ALTER TABLE glasswing_exploit_chains ADD COLUMN combined_confidence float DEFAULT 0.0;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'glasswing_exploit_chains' AND column_name = 'full_poc_code') THEN
        ALTER TABLE glasswing_exploit_chains ADD COLUMN full_poc_code text;
    END IF;
END $$;

-- Patches: add target_file, target_codebase, regression_test_output
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'glasswing_patches' AND column_name = 'target_file') THEN
        ALTER TABLE glasswing_patches ADD COLUMN target_file text;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'glasswing_patches' AND column_name = 'target_codebase') THEN
        ALTER TABLE glasswing_patches ADD COLUMN target_codebase text;
    END IF;
END $$;

-- WAF rules: blocks counter and false positive rate
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'glasswing_waf_rules' AND column_name = 'blocks_24h') THEN
        ALTER TABLE glasswing_waf_rules ADD COLUMN blocks_24h bigint DEFAULT 0;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'glasswing_waf_rules' AND column_name = 'false_positive_rate') THEN
        ALTER TABLE glasswing_waf_rules ADD COLUMN false_positive_rate float DEFAULT 0.0;
    END IF;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_gw_findings_scan_run ON glasswing_findings(scan_run_id);
CREATE INDEX IF NOT EXISTS idx_gw_findings_status ON glasswing_findings(status);
CREATE INDEX IF NOT EXISTS idx_gw_findings_vuln_class ON glasswing_findings(vuln_class);
CREATE INDEX IF NOT EXISTS idx_gw_findings_severity ON glasswing_findings(severity);
CREATE INDEX IF NOT EXISTS idx_gw_reachability_reachable ON glasswing_reachability(is_reachable);
CREATE INDEX IF NOT EXISTS idx_gw_patches_review ON glasswing_patches(review_status);
CREATE INDEX IF NOT EXISTS idx_gw_waf_active ON glasswing_waf_rules(is_active);
CREATE INDEX IF NOT EXISTS idx_gw_chains_status ON glasswing_exploit_chains(status);

-- Anon policies for demo
DO $$ BEGIN CREATE POLICY "anon_read_gw_findings" ON glasswing_findings FOR SELECT TO anon USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "anon_read_gw_root_causes" ON glasswing_root_causes FOR SELECT TO anon USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "anon_read_gw_reachability" ON glasswing_reachability FOR SELECT TO anon USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "anon_read_gw_exploit_chains" ON glasswing_exploit_chains FOR SELECT TO anon USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "anon_read_gw_patches" ON glasswing_patches FOR SELECT TO anon USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "anon_read_gw_waf_rules" ON glasswing_waf_rules FOR SELECT TO anon USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "anon_read_gw_scan_runs" ON glasswing_scan_runs FOR SELECT TO anon USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;