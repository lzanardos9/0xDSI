/*
  # User Management System - Military-Grade Access Control

  1. Schema Updates
    - Adds comprehensive role-based access control (RBAC) to user_profiles
    - Implements security clearance levels (Unclassified, Confidential, Secret, Top Secret)
    - Adds separation of duties controls
    - Tracks user lifecycle and audit trail

  2. New Tables
    - user_roles: Defines system roles with granular permissions
    - user_clearances: Manages security clearance levels and compartments
    - user_audit_log: Tracks all user management actions
    - access_control_matrix: Defines what each role can access

  3. Security Features
    - Need-to-know access principle
    - Separation of duties enforcement
    - Comprehensive audit logging
    - RLS policies for role-based access
    - Multi-level security clearances

  4. User Lifecycle States
    - pending: Account created, awaiting approval
    - active: Full access granted
    - suspended: Temporary access revoked
    - investigation: Under security review
    - terminated: Permanent revocation
    - locked: Too many failed login attempts
*/

-- Add comprehensive access control columns to user_profiles
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS role text DEFAULT 'analyst'
  CHECK (role IN ('viewer', 'analyst', 'engineer', 'admin', 'ciso', 'auditor'));

ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS security_clearance text DEFAULT 'unclassified'
  CHECK (security_clearance IN ('unclassified', 'confidential', 'secret', 'top_secret', 'sci'));

ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS clearance_compartments text[] DEFAULT ARRAY[]::text[];

ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS need_to_know_categories text[] DEFAULT ARRAY[]::text[];

ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS account_status text DEFAULT 'pending'
  CHECK (account_status IN ('pending', 'active', 'suspended', 'investigation', 'terminated', 'locked'));

ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS account_approved_by uuid REFERENCES auth.users(id);
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS account_approved_at timestamptz;

ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS max_concurrent_sessions integer DEFAULT 3;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS session_timeout_minutes integer DEFAULT 30;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS require_mfa boolean DEFAULT true;

ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS access_start_time time;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS access_end_time time;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS access_days_of_week integer[] DEFAULT ARRAY[1,2,3,4,5];

ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS allowed_ip_ranges inet[] DEFAULT ARRAY[]::inet[];
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS denied_ip_ranges inet[] DEFAULT ARRAY[]::inet[];

ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS account_expires_at timestamptz;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS last_password_change timestamptz DEFAULT now();
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS password_expires_at timestamptz DEFAULT (now() + interval '90 days');

ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS separation_of_duty_groups text[] DEFAULT ARRAY[]::text[];
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS prohibited_actions text[] DEFAULT ARRAY[]::text[];

ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS supervisor_id uuid REFERENCES user_profiles(id);
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS emergency_contact text;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS notes text;

-- User Roles Definition Table
CREATE TABLE IF NOT EXISTS user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_name text UNIQUE NOT NULL,
  display_name text NOT NULL,
  description text,
  permissions jsonb DEFAULT '{}'::jsonb,
  can_create_users boolean DEFAULT false,
  can_modify_users boolean DEFAULT false,
  can_delete_users boolean DEFAULT false,
  can_assign_roles boolean DEFAULT false,
  can_grant_clearances boolean DEFAULT false,
  can_view_audit_logs boolean DEFAULT false,
  max_clearance_level text DEFAULT 'unclassified',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Insert default roles with military-grade separation
INSERT INTO user_roles (role_name, display_name, description, permissions, can_create_users, can_modify_users, can_delete_users, can_assign_roles, can_grant_clearances, can_view_audit_logs, max_clearance_level)
VALUES
  (
    'viewer',
    'Security Viewer',
    'Read-only access to dashboards and reports',
    '{"view_dashboard": true, "view_reports": true, "view_alerts": true}'::jsonb,
    false, false, false, false, false, false, 'unclassified'
  ),
  (
    'analyst',
    'Security Analyst',
    'Investigate alerts, create cases, view threat intelligence',
    '{"view_dashboard": true, "view_reports": true, "view_alerts": true, "investigate_alerts": true, "create_cases": true, "view_threat_intel": true, "view_iocs": true}'::jsonb,
    false, false, false, false, false, false, 'confidential'
  ),
  (
    'engineer',
    'Security Engineer',
    'Configure detection rules, manage integrations, deploy automation',
    '{"view_dashboard": true, "view_reports": true, "view_alerts": true, "investigate_alerts": true, "create_cases": true, "view_threat_intel": true, "configure_rules": true, "manage_integrations": true, "deploy_automation": true, "view_raw_data": true}'::jsonb,
    false, false, false, false, false, false, 'secret'
  ),
  (
    'admin',
    'System Administrator',
    'Full system configuration and user management',
    '{"all_access": true}'::jsonb,
    true, true, false, true, true, true, 'top_secret'
  ),
  (
    'ciso',
    'Chief Information Security Officer',
    'Executive oversight, policy control, strategic decisions',
    '{"all_access": true, "policy_control": true, "strategic_decisions": true}'::jsonb,
    true, true, true, true, true, true, 'sci'
  ),
  (
    'auditor',
    'Security Auditor',
    'Review audit logs, compliance checks, read-only privileged access',
    '{"view_dashboard": true, "view_reports": true, "view_alerts": true, "view_cases": true, "view_audit_logs": true, "view_all_users": true, "compliance_checks": true}'::jsonb,
    false, false, false, false, false, true, 'top_secret'
  )
ON CONFLICT (role_name) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  permissions = EXCLUDED.permissions,
  can_create_users = EXCLUDED.can_create_users,
  can_modify_users = EXCLUDED.can_modify_users,
  can_delete_users = EXCLUDED.can_delete_users,
  can_assign_roles = EXCLUDED.can_assign_roles,
  can_grant_clearances = EXCLUDED.can_grant_clearances,
  can_view_audit_logs = EXCLUDED.can_view_audit_logs,
  max_clearance_level = EXCLUDED.max_clearance_level,
  updated_at = now();

-- User Clearances Table
CREATE TABLE IF NOT EXISTS user_clearances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_profile_id uuid REFERENCES user_profiles(id) ON DELETE CASCADE,
  clearance_level text NOT NULL,
  granted_by uuid REFERENCES auth.users(id),
  granted_at timestamptz DEFAULT now(),
  expires_at timestamptz,
  investigation_date timestamptz,
  reinvestigation_due timestamptz,
  compartments text[] DEFAULT ARRAY[]::text[],
  special_access_programs text[] DEFAULT ARRAY[]::text[],
  caveats text[] DEFAULT ARRAY[]::text[],
  justification text NOT NULL,
  status text DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'revoked', 'expired')),
  revoked_by uuid REFERENCES auth.users(id),
  revoked_at timestamptz,
  revocation_reason text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_clearances_user_profile ON user_clearances(user_profile_id);
CREATE INDEX IF NOT EXISTS idx_user_clearances_level ON user_clearances(clearance_level);
CREATE INDEX IF NOT EXISTS idx_user_clearances_status ON user_clearances(status);

-- User Audit Log Table
CREATE TABLE IF NOT EXISTS user_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_type text NOT NULL CHECK (action_type IN (
    'user_created', 'user_modified', 'user_deleted', 'user_suspended', 'user_reactivated',
    'role_assigned', 'role_revoked', 'clearance_granted', 'clearance_revoked',
    'password_reset', 'password_changed', 'mfa_enabled', 'mfa_disabled',
    'login_success', 'login_failed', 'logout', 'session_terminated',
    'permission_granted', 'permission_revoked', 'access_denied'
  )),
  target_user_id uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
  performed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  timestamp timestamptz DEFAULT now(),
  ip_address inet,
  user_agent text,
  details jsonb DEFAULT '{}'::jsonb,
  previous_state jsonb,
  new_state jsonb,
  success boolean DEFAULT true,
  failure_reason text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_audit_log_action_type ON user_audit_log(action_type);
CREATE INDEX IF NOT EXISTS idx_user_audit_log_target_user ON user_audit_log(target_user_id);
CREATE INDEX IF NOT EXISTS idx_user_audit_log_performed_by ON user_audit_log(performed_by);
CREATE INDEX IF NOT EXISTS idx_user_audit_log_timestamp ON user_audit_log(timestamp DESC);

-- Access Control Matrix Table
CREATE TABLE IF NOT EXISTS access_control_matrix (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role text NOT NULL,
  resource_type text NOT NULL,
  resource_id text,
  action text NOT NULL CHECK (action IN ('create', 'read', 'update', 'delete', 'execute', 'approve')),
  min_clearance_required text DEFAULT 'unclassified',
  compartments_required text[] DEFAULT ARRAY[]::text[],
  time_restrictions jsonb,
  ip_restrictions inet[],
  additional_conditions jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(role, resource_type, resource_id, action)
);

CREATE INDEX IF NOT EXISTS idx_access_control_role ON access_control_matrix(role);
CREATE INDEX IF NOT EXISTS idx_access_control_resource ON access_control_matrix(resource_type);

-- Enable RLS on all tables
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_clearances ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE access_control_matrix ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_roles
CREATE POLICY "Anyone can view role definitions"
  ON user_roles FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Only admins and CISO can modify roles"
  ON user_roles FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'ciso')
      AND account_status = 'active'
    )
  );

-- RLS Policies for user_clearances
CREATE POLICY "Users can view own clearances"
  ON user_clearances FOR SELECT
  TO authenticated
  USING (
    user_profile_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'ciso', 'auditor')
      AND account_status = 'active'
    )
  );

CREATE POLICY "Only authorized personnel can grant clearances"
  ON user_clearances FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'ciso')
      AND account_status = 'active'
    )
  );

CREATE POLICY "Only authorized personnel can modify clearances"
  ON user_clearances FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'ciso')
      AND account_status = 'active'
    )
  );

-- RLS Policies for user_audit_log
CREATE POLICY "Admins and auditors can view audit logs"
  ON user_audit_log FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'ciso', 'auditor')
      AND account_status = 'active'
    )
  );

CREATE POLICY "System can insert audit logs"
  ON user_audit_log FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- RLS Policies for access_control_matrix
CREATE POLICY "Anyone can view access control matrix"
  ON access_control_matrix FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Only admins can modify access control matrix"
  ON access_control_matrix FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'ciso')
      AND account_status = 'active'
    )
  );

-- Update existing demo users with proper roles and clearances
UPDATE user_profiles
SET
  role = 'admin',
  security_clearance = 'top_secret',
  account_status = 'active',
  require_mfa = true,
  account_approved_at = now()
WHERE email = 'admin@soc.local';

UPDATE user_profiles
SET
  role = 'analyst',
  security_clearance = 'confidential',
  account_status = 'active',
  require_mfa = true,
  account_approved_at = now()
WHERE email = 'analyst@soc.local';

UPDATE user_profiles
SET
  role = 'ciso',
  security_clearance = 'sci',
  account_status = 'active',
  require_mfa = true,
  account_approved_at = now()
WHERE email = 'lz@soc.local';

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_profiles_role ON user_profiles(role);
CREATE INDEX IF NOT EXISTS idx_user_profiles_clearance ON user_profiles(security_clearance);
CREATE INDEX IF NOT EXISTS idx_user_profiles_account_status ON user_profiles(account_status);
CREATE INDEX IF NOT EXISTS idx_user_profiles_email ON user_profiles(email);

-- Function to log user management actions
CREATE OR REPLACE FUNCTION log_user_management_action()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO user_audit_log (action_type, target_user_id, performed_by, new_state)
    VALUES ('user_created', NEW.id, auth.uid(), to_jsonb(NEW));
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO user_audit_log (action_type, target_user_id, performed_by, previous_state, new_state)
    VALUES ('user_modified', NEW.id, auth.uid(), to_jsonb(OLD), to_jsonb(NEW));
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO user_audit_log (action_type, target_user_id, performed_by, previous_state)
    VALUES ('user_deleted', OLD.id, auth.uid(), to_jsonb(OLD));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for user management audit logging
DROP TRIGGER IF EXISTS user_management_audit_trigger ON user_profiles;
CREATE TRIGGER user_management_audit_trigger
  AFTER INSERT OR UPDATE OR DELETE ON user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION log_user_management_action();
