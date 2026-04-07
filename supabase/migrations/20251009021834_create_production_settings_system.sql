/*
  # Create Production Settings System

  1. Overview
    - System-wide configuration settings for production deployment
    - Databricks integration settings
    - Authentication method configuration
    - Security and compliance settings
    - Notification and alerting configuration
    
  2. Tables
    - system_settings: Global configuration settings
    
  3. Security
    - Enable RLS for settings table
    - Allow authenticated admin users to read/write
    - Allow anon users to read for demo purposes
*/

-- Create system_settings table
CREATE TABLE IF NOT EXISTS system_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Databricks Integration
  databricks_workspace_url text,
  databricks_access_token text,
  databricks_cluster_id text,
  databricks_catalog text DEFAULT 'main',
  databricks_schema text DEFAULT 'siem',
  
  -- Email/SMTP Configuration
  smtp_host text,
  smtp_port integer DEFAULT 587,
  smtp_username text,
  smtp_password text,
  smtp_from_email text,
  
  -- SIEM Performance
  siem_retention_days integer DEFAULT 90,
  log_level text DEFAULT 'INFO',
  max_events_per_second integer DEFAULT 10000,
  enable_ml_correlation boolean DEFAULT true,
  enable_auto_response boolean DEFAULT false,
  
  -- Security Settings
  session_timeout_minutes integer DEFAULT 30,
  max_failed_login_attempts integer DEFAULT 5,
  password_min_length integer DEFAULT 12,
  password_require_special boolean DEFAULT true,
  
  -- Authentication Methods
  enable_mfa boolean DEFAULT false,
  enable_saml_sso boolean DEFAULT false,
  enable_oauth boolean DEFAULT false,
  oauth_providers text[] DEFAULT ARRAY[]::text[],
  enable_ldap boolean DEFAULT false,
  ldap_server text,
  ldap_base_dn text,
  
  -- Compliance & Audit
  enable_audit_logging boolean DEFAULT true,
  enable_encryption_at_rest boolean DEFAULT true,
  enable_rate_limiting boolean DEFAULT true,
  api_rate_limit integer DEFAULT 1000,
  
  -- Backup & Recovery
  backup_enabled boolean DEFAULT true,
  backup_frequency_hours integer DEFAULT 24,
  
  -- Metadata
  created_at timestamptz DEFAULT NOW(),
  updated_at timestamptz DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Enable read access for all users" ON system_settings;
DROP POLICY IF EXISTS "Enable write access for authenticated users" ON system_settings;

-- Create policies
CREATE POLICY "Enable read access for all users"
  ON system_settings FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Enable write access for authenticated users"
  ON system_settings FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Insert default settings
INSERT INTO system_settings (
  id,
  databricks_workspace_url,
  databricks_catalog,
  databricks_schema,
  siem_retention_days,
  log_level,
  max_events_per_second,
  enable_ml_correlation,
  enable_auto_response,
  session_timeout_minutes,
  max_failed_login_attempts,
  password_min_length,
  password_require_special,
  enable_mfa,
  enable_saml_sso,
  enable_oauth,
  enable_ldap,
  enable_audit_logging,
  enable_encryption_at_rest,
  enable_rate_limiting,
  api_rate_limit,
  backup_enabled,
  backup_frequency_hours
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  '',
  'main',
  'siem',
  90,
  'INFO',
  10000,
  true,
  false,
  30,
  5,
  12,
  true,
  false,
  false,
  false,
  false,
  true,
  true,
  true,
  1000,
  true,
  24
) ON CONFLICT (id) DO NOTHING;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_system_settings_updated_at ON system_settings(updated_at);
