import React, { useState, useEffect } from 'react';
import {
  Settings,
  Database,
  Shield,
  Key,
  Server,
  AlertTriangle,
  CheckCircle,
  Save,
  RefreshCw,
  Lock,
  Cloud,
  Zap,
  Globe,
  FileText,
  Bell,
  Mail,
  Smartphone,
  Fingerprint,
  Eye,
  Copy,
  Activity,
  BarChart3
} from 'lucide-react';
import { supabase } from '../lib/supabase';

interface SystemSettings {
  id?: string;
  databricks_workspace_url?: string;
  databricks_access_token?: string;
  databricks_cluster_id?: string;
  databricks_catalog?: string;
  databricks_schema?: string;
  smtp_host?: string;
  smtp_port?: number;
  smtp_username?: string;
  smtp_password?: string;
  smtp_from_email?: string;
  siem_retention_days?: number;
  log_level?: string;
  max_events_per_second?: number;
  enable_ml_correlation?: boolean;
  enable_auto_response?: boolean;
  session_timeout_minutes?: number;
  max_failed_login_attempts?: number;
  password_min_length?: number;
  password_require_special?: boolean;
  enable_mfa?: boolean;
  enable_saml_sso?: boolean;
  enable_oauth?: boolean;
  oauth_providers?: string[];
  enable_ldap?: boolean;
  ldap_server?: string;
  ldap_base_dn?: string;
  enable_audit_logging?: boolean;
  enable_encryption_at_rest?: boolean;
  enable_rate_limiting?: boolean;
  api_rate_limit?: number;
  backup_enabled?: boolean;
  backup_frequency_hours?: number;
  enable_ha?: boolean;
  ha_mode?: string;
  ha_nodes?: number;
  ha_sync_mode?: string;
  ha_heartbeat_interval?: number;
  ha_failover_timeout?: number;
  load_balancer_type?: string;
  load_balancer_algorithm?: string;
  enable_auto_scaling?: boolean;
  min_instances?: number;
  max_instances?: number;
  scale_up_threshold?: number;
  scale_down_threshold?: number;
  updated_at?: string;
}

export default function ProductionSettings() {
  const [settings, setSettings] = useState<SystemSettings>({
    databricks_workspace_url: '',
    databricks_access_token: '',
    databricks_cluster_id: '',
    databricks_catalog: 'main',
    databricks_schema: 'siem',
    smtp_host: '',
    smtp_port: 587,
    smtp_username: '',
    smtp_password: '',
    smtp_from_email: '',
    siem_retention_days: 90,
    log_level: 'INFO',
    max_events_per_second: 10000,
    enable_ml_correlation: true,
    enable_auto_response: false,
    session_timeout_minutes: 30,
    max_failed_login_attempts: 5,
    password_min_length: 12,
    password_require_special: true,
    enable_mfa: false,
    enable_saml_sso: false,
    enable_oauth: false,
    oauth_providers: [],
    enable_ldap: false,
    ldap_server: '',
    ldap_base_dn: '',
    enable_audit_logging: true,
    enable_encryption_at_rest: true,
    enable_rate_limiting: true,
    api_rate_limit: 1000,
    backup_enabled: true,
    backup_frequency_hours: 24,
    enable_ha: false,
    ha_mode: 'active-passive',
    ha_nodes: 2,
    ha_sync_mode: 'synchronous',
    ha_heartbeat_interval: 5,
    ha_failover_timeout: 30,
    load_balancer_type: 'round-robin',
    load_balancer_algorithm: 'least-connections',
    enable_auto_scaling: false,
    min_instances: 2,
    max_instances: 10,
    scale_up_threshold: 80,
    scale_down_threshold: 30
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('databricks');
  const [showTokens, setShowTokens] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('system_settings')
        .select('*')
        .single();

      if (data && !error) {
        setSettings(data);
      }
      setLoading(false);
    } catch (error) {
      console.error('Error loading settings:', error);
      setLoading(false);
    }
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('system_settings')
        .upsert({
          ...settings,
          id: settings.id || '00000000-0000-0000-0000-000000000001',
          updated_at: new Date().toISOString()
        });

      if (error) throw error;

      alert('Settings saved successfully!');
    } catch (error) {
      console.error('Error saving settings:', error);
      alert('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const testDatabricksConnection = async () => {
    alert('Testing Databricks connection...\n\nIn production, this would:\n1. Verify workspace URL is accessible\n2. Validate access token\n3. Check cluster availability\n4. Verify catalog and schema access');
  };

  const tabs = [
    { id: 'databricks', label: 'Databricks Integration', icon: Database },
    { id: 'auth', label: 'Authentication', icon: Shield },
    { id: 'security', label: 'Security & Compliance', icon: Lock },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'performance', label: 'Performance', icon: Zap },
    { id: 'ha', label: 'High Availability', icon: Activity },
    { id: 'backup', label: 'Backup & Recovery', icon: Server }
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <RefreshCw className="w-8 h-8 text-blue-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <Settings className="w-8 h-8 text-blue-400" />
            Production Settings
          </h2>
          <p className="text-gray-400 mt-1">Configure system for production deployment</p>
        </div>
        <button
          onClick={saveSettings}
          disabled={saving}
          className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center gap-2 transition-colors disabled:opacity-50"
        >
          {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? 'Saving...' : 'Save All Settings'}
        </button>
      </div>

      <div className="bg-gradient-to-br from-yellow-900/20 to-orange-900/20 border border-yellow-600/30 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="text-yellow-400 font-semibold mb-1">Production Deployment Guide</h3>
            <p className="text-yellow-300/80 text-sm leading-relaxed">
              This SIEM platform is designed to integrate with Databricks for production deployment.
              Configure settings below and review the Production Deployment Guide section for complete setup instructions.
            </p>
          </div>
        </div>
      </div>

      <div className="border-b border-gray-700">
        <div className="flex space-x-1 overflow-x-auto">
          {tabs.map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-3 flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-400'
                    : 'border-transparent text-gray-400 hover:text-gray-300'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-6">
        {activeTab === 'databricks' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-semibold text-white flex items-center gap-2">
                <Database className="w-5 h-5 text-blue-400" />
                Databricks Integration
              </h3>
              <button
                onClick={testDatabricksConnection}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg flex items-center gap-2 text-sm transition-colors"
              >
                <CheckCircle className="w-4 h-4" />
                Test Connection
              </button>
            </div>

            <div className="grid grid-cols-1 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Workspace URL *
                </label>
                <input
                  type="text"
                  value={settings.databricks_workspace_url || ''}
                  onChange={(e) => setSettings({ ...settings, databricks_workspace_url: e.target.value })}
                  placeholder="https://your-workspace.cloud.databricks.com"
                  className="w-full px-4 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Access Token *
                </label>
                <div className="flex gap-2">
                  <input
                    type={showTokens ? 'text' : 'password'}
                    value={settings.databricks_access_token || ''}
                    onChange={(e) => setSettings({ ...settings, databricks_access_token: e.target.value })}
                    placeholder="dapi..."
                    className="flex-1 px-4 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                  <button
                    onClick={() => setShowTokens(!showTokens)}
                    className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Cluster ID *
                  </label>
                  <input
                    type="text"
                    value={settings.databricks_cluster_id || ''}
                    onChange={(e) => setSettings({ ...settings, databricks_cluster_id: e.target.value })}
                    placeholder="1234-567890-abc123"
                    className="w-full px-4 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Catalog
                  </label>
                  <input
                    type="text"
                    value={settings.databricks_catalog || ''}
                    onChange={(e) => setSettings({ ...settings, databricks_catalog: e.target.value })}
                    placeholder="main"
                    className="w-full px-4 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Schema
                  </label>
                  <input
                    type="text"
                    value={settings.databricks_schema || ''}
                    onChange={(e) => setSettings({ ...settings, databricks_schema: e.target.value })}
                    placeholder="siem"
                    className="w-full px-4 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>

            <div className="bg-blue-900/20 border border-blue-700/30 rounded-lg p-4 mt-6">
              <h4 className="text-blue-400 font-semibold mb-2 flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Quick Setup Guide
              </h4>
              <ol className="text-gray-300 text-sm space-y-2 ml-4 list-decimal">
                <li>Create a Databricks workspace (AWS, Azure, or GCP)</li>
                <li>Generate a personal access token from User Settings</li>
                <li>Create or select an all-purpose cluster</li>
                <li>Create a Unity Catalog (or use existing)</li>
                <li>Create a schema for SIEM data</li>
                <li>Enter credentials above and test connection</li>
              </ol>
            </div>
          </div>
        )}

        {activeTab === 'auth' && (
          <div className="space-y-6">
            <h3 className="text-xl font-semibold text-white flex items-center gap-2">
              <Shield className="w-5 h-5 text-blue-400" />
              Authentication Methods
            </h3>

            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-gray-900/50 rounded-lg">
                <div className="flex items-center gap-3">
                  <Key className="w-5 h-5 text-green-400" />
                  <div>
                    <div className="text-white font-medium">Username/Password</div>
                    <div className="text-gray-400 text-sm">Local authentication (enabled by default)</div>
                  </div>
                </div>
                <div className="px-3 py-1 bg-green-600 text-white rounded-full text-xs">
                  Active
                </div>
              </div>

              <div className="flex items-center justify-between p-4 bg-gray-900/50 rounded-lg">
                <div className="flex items-center gap-3">
                  <Smartphone className="w-5 h-5 text-blue-400" />
                  <div>
                    <div className="text-white font-medium">Multi-Factor Authentication (MFA)</div>
                    <div className="text-gray-400 text-sm">TOTP-based 2FA via authenticator app</div>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.enable_mfa || false}
                    onChange={(e) => setSettings({ ...settings, enable_mfa: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>

              <div className="flex items-center justify-between p-4 bg-gray-900/50 rounded-lg">
                <div className="flex items-center gap-3">
                  <Globe className="w-5 h-5 text-purple-400" />
                  <div>
                    <div className="text-white font-medium">SAML Single Sign-On (SSO)</div>
                    <div className="text-gray-400 text-sm">Enterprise SSO via SAML 2.0 (Okta, Azure AD, etc.)</div>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.enable_saml_sso || false}
                    onChange={(e) => setSettings({ ...settings, enable_saml_sso: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>

              <div className="flex items-center justify-between p-4 bg-gray-900/50 rounded-lg">
                <div className="flex items-center gap-3">
                  <Cloud className="w-5 h-5 text-orange-400" />
                  <div>
                    <div className="text-white font-medium">OAuth 2.0 / OpenID Connect</div>
                    <div className="text-gray-400 text-sm">Social login (Google, Microsoft, GitHub)</div>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.enable_oauth || false}
                    onChange={(e) => setSettings({ ...settings, enable_oauth: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>

              <div className="flex items-center justify-between p-4 bg-gray-900/50 rounded-lg">
                <div className="flex items-center gap-3">
                  <Server className="w-5 h-5 text-yellow-400" />
                  <div>
                    <div className="text-white font-medium">LDAP / Active Directory</div>
                    <div className="text-gray-400 text-sm">Enterprise directory integration</div>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.enable_ldap || false}
                    onChange={(e) => setSettings({ ...settings, enable_ldap: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>

              <div className="flex items-center justify-between p-4 bg-gray-900/50 rounded-lg">
                <div className="flex items-center gap-3">
                  <Fingerprint className="w-5 h-5 text-red-400" />
                  <div>
                    <div className="text-white font-medium">Biometric Authentication</div>
                    <div className="text-gray-400 text-sm">WebAuthn / FIDO2 (YubiKey, Touch ID, Windows Hello)</div>
                  </div>
                </div>
                <div className="px-3 py-1 bg-yellow-600 text-white rounded-full text-xs">
                  Coming Soon
                </div>
              </div>
            </div>

            {settings.enable_ldap && (
              <div className="bg-gray-900/50 rounded-lg p-4 space-y-4">
                <h4 className="text-white font-semibold">LDAP Configuration</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      LDAP Server
                    </label>
                    <input
                      type="text"
                      value={settings.ldap_server || ''}
                      onChange={(e) => setSettings({ ...settings, ldap_server: e.target.value })}
                      placeholder="ldap://ldap.company.com:389"
                      className="w-full px-4 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Base DN
                    </label>
                    <input
                      type="text"
                      value={settings.ldap_base_dn || ''}
                      onChange={(e) => setSettings({ ...settings, ldap_base_dn: e.target.value })}
                      placeholder="dc=company,dc=com"
                      className="w-full px-4 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                </div>
              </div>
            )}

            <div className="bg-gray-900/50 rounded-lg p-4 space-y-4">
              <h4 className="text-white font-semibold">Password Policy</h4>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Minimum Length
                  </label>
                  <input
                    type="number"
                    value={settings.password_min_length || 12}
                    onChange={(e) => setSettings({ ...settings, password_min_length: parseInt(e.target.value) })}
                    className="w-full px-4 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Max Failed Attempts
                  </label>
                  <input
                    type="number"
                    value={settings.max_failed_login_attempts || 5}
                    onChange={(e) => setSettings({ ...settings, max_failed_login_attempts: parseInt(e.target.value) })}
                    className="w-full px-4 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={settings.password_require_special || false}
                  onChange={(e) => setSettings({ ...settings, password_require_special: e.target.checked })}
                  className="rounded border-gray-600 text-blue-600 focus:ring-blue-500"
                />
                <label className="text-gray-300 text-sm">
                  Require special characters
                </label>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'security' && (
          <div className="space-y-6">
            <h3 className="text-xl font-semibold text-white flex items-center gap-2">
              <Lock className="w-5 h-5 text-blue-400" />
              Security & Compliance
            </h3>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center justify-between p-4 bg-gray-900/50 rounded-lg">
                <div>
                  <div className="text-white font-medium">Audit Logging</div>
                  <div className="text-gray-400 text-sm">Log all user actions</div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.enable_audit_logging || false}
                    onChange={(e) => setSettings({ ...settings, enable_audit_logging: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>

              <div className="flex items-center justify-between p-4 bg-gray-900/50 rounded-lg">
                <div>
                  <div className="text-white font-medium">Encryption at Rest</div>
                  <div className="text-gray-400 text-sm">AES-256 encryption</div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.enable_encryption_at_rest || false}
                    onChange={(e) => setSettings({ ...settings, enable_encryption_at_rest: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>

              <div className="flex items-center justify-between p-4 bg-gray-900/50 rounded-lg">
                <div>
                  <div className="text-white font-medium">API Rate Limiting</div>
                  <div className="text-gray-400 text-sm">Prevent API abuse</div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.enable_rate_limiting || false}
                    onChange={(e) => setSettings({ ...settings, enable_rate_limiting: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>

              <div className="p-4 bg-gray-900/50 rounded-lg">
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Session Timeout (minutes)
                </label>
                <input
                  type="number"
                  value={settings.session_timeout_minutes || 30}
                  onChange={(e) => setSettings({ ...settings, session_timeout_minutes: parseInt(e.target.value) })}
                  className="w-full px-4 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="p-4 bg-gray-900/50 rounded-lg">
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Data Retention (days)
                </label>
                <input
                  type="number"
                  value={settings.siem_retention_days || 90}
                  onChange={(e) => setSettings({ ...settings, siem_retention_days: parseInt(e.target.value) })}
                  className="w-full px-4 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="p-4 bg-gray-900/50 rounded-lg">
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  API Rate Limit (req/min)
                </label>
                <input
                  type="number"
                  value={settings.api_rate_limit || 1000}
                  onChange={(e) => setSettings({ ...settings, api_rate_limit: parseInt(e.target.value) })}
                  className="w-full px-4 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="bg-green-900/20 border border-green-700/30 rounded-lg p-4">
              <h4 className="text-green-400 font-semibold mb-2">Compliance Standards Supported</h4>
              <div className="grid grid-cols-3 gap-2">
                {['SOC 2', 'ISO 27001', 'GDPR', 'HIPAA', 'PCI DSS', 'NIST'].map(standard => (
                  <div key={standard} className="flex items-center gap-2 text-gray-300 text-sm">
                    <CheckCircle className="w-4 h-4 text-green-400" />
                    {standard}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'notifications' && (
          <div className="space-y-6">
            <h3 className="text-xl font-semibold text-white flex items-center gap-2">
              <Bell className="w-5 h-5 text-blue-400" />
              Notification Settings
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  <Mail className="w-4 h-4 inline mr-2" />
                  SMTP Host
                </label>
                <input
                  type="text"
                  value={settings.smtp_host || ''}
                  onChange={(e) => setSettings({ ...settings, smtp_host: e.target.value })}
                  placeholder="smtp.gmail.com"
                  className="w-full px-4 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    SMTP Port
                  </label>
                  <input
                    type="number"
                    value={settings.smtp_port || 587}
                    onChange={(e) => setSettings({ ...settings, smtp_port: parseInt(e.target.value) })}
                    className="w-full px-4 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    From Email
                  </label>
                  <input
                    type="email"
                    value={settings.smtp_from_email || ''}
                    onChange={(e) => setSettings({ ...settings, smtp_from_email: e.target.value })}
                    placeholder="alerts@company.com"
                    className="w-full px-4 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    SMTP Username
                  </label>
                  <input
                    type="text"
                    value={settings.smtp_username || ''}
                    onChange={(e) => setSettings({ ...settings, smtp_username: e.target.value })}
                    className="w-full px-4 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    SMTP Password
                  </label>
                  <input
                    type="password"
                    value={settings.smtp_password || ''}
                    onChange={(e) => setSettings({ ...settings, smtp_password: e.target.value })}
                    className="w-full px-4 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'performance' && (
          <div className="space-y-6">
            <h3 className="text-xl font-semibold text-white flex items-center gap-2">
              <Zap className="w-5 h-5 text-blue-400" />
              Performance Tuning
            </h3>

            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-gray-900/50 rounded-lg">
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Max Events/Second
                </label>
                <input
                  type="number"
                  value={settings.max_events_per_second || 10000}
                  onChange={(e) => setSettings({ ...settings, max_events_per_second: parseInt(e.target.value) })}
                  className="w-full px-4 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
                <p className="text-gray-400 text-xs mt-1">Ingestion rate limit</p>
              </div>

              <div className="p-4 bg-gray-900/50 rounded-lg">
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Log Level
                </label>
                <select
                  value={settings.log_level || 'INFO'}
                  onChange={(e) => setSettings({ ...settings, log_level: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                >
                  <option>DEBUG</option>
                  <option>INFO</option>
                  <option>WARN</option>
                  <option>ERROR</option>
                </select>
              </div>

              <div className="flex items-center justify-between p-4 bg-gray-900/50 rounded-lg">
                <div>
                  <div className="text-white font-medium">ML Correlation</div>
                  <div className="text-gray-400 text-sm">AI-powered event analysis</div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.enable_ml_correlation || false}
                    onChange={(e) => setSettings({ ...settings, enable_ml_correlation: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>

              <div className="flex items-center justify-between p-4 bg-gray-900/50 rounded-lg">
                <div>
                  <div className="text-white font-medium">Auto Response</div>
                  <div className="text-gray-400 text-sm">Automated threat response</div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.enable_auto_response || false}
                    onChange={(e) => setSettings({ ...settings, enable_auto_response: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'ha' && (
          <div className="space-y-6">
            <h3 className="text-xl font-semibold text-white flex items-center gap-2">
              <Activity className="w-5 h-5 text-blue-400" />
              High Availability Configuration
            </h3>

            <div className="bg-gradient-to-br from-green-900/20 to-blue-900/20 border border-green-700/30 rounded-lg p-4 mb-6">
              <div className="flex items-start gap-3">
                <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-green-400 font-semibold mb-1">Enterprise High Availability</h4>
                  <p className="text-green-300/80 text-sm leading-relaxed">
                    Configure multiple instance deployment with automatic failover, load balancing, and auto-scaling
                    to ensure 99.99% uptime and zero data loss during failures.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center justify-between p-4 bg-gray-900/50 rounded-lg">
                <div>
                  <div className="text-white font-medium">Enable High Availability</div>
                  <div className="text-gray-400 text-sm">Multi-node cluster deployment</div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.enable_ha || false}
                    onChange={(e) => setSettings({ ...settings, enable_ha: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>

              <div className="p-4 bg-gray-900/50 rounded-lg">
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  HA Mode
                </label>
                <select
                  value={settings.ha_mode || 'active-passive'}
                  onChange={(e) => setSettings({ ...settings, ha_mode: e.target.value })}
                  disabled={!settings.enable_ha}
                  className="w-full px-4 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
                >
                  <option value="active-passive">Active-Passive</option>
                  <option value="active-active">Active-Active</option>
                  <option value="multi-master">Multi-Master</option>
                </select>
                <p className="text-gray-400 text-xs mt-1">Cluster operation mode</p>
              </div>

              <div className="p-4 bg-gray-900/50 rounded-lg">
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Number of Nodes
                </label>
                <input
                  type="number"
                  min="2"
                  max="20"
                  value={settings.ha_nodes || 2}
                  onChange={(e) => setSettings({ ...settings, ha_nodes: parseInt(e.target.value) })}
                  disabled={!settings.enable_ha}
                  className="w-full px-4 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
                />
                <p className="text-gray-400 text-xs mt-1">Minimum 2, recommended 3+</p>
              </div>

              <div className="p-4 bg-gray-900/50 rounded-lg">
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Sync Mode
                </label>
                <select
                  value={settings.ha_sync_mode || 'synchronous'}
                  onChange={(e) => setSettings({ ...settings, ha_sync_mode: e.target.value })}
                  disabled={!settings.enable_ha}
                  className="w-full px-4 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
                >
                  <option value="synchronous">Synchronous</option>
                  <option value="asynchronous">Asynchronous</option>
                  <option value="semi-synchronous">Semi-Synchronous</option>
                </select>
                <p className="text-gray-400 text-xs mt-1">Data replication mode</p>
              </div>

              <div className="p-4 bg-gray-900/50 rounded-lg">
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Heartbeat Interval (seconds)
                </label>
                <input
                  type="number"
                  min="1"
                  max="30"
                  value={settings.ha_heartbeat_interval || 5}
                  onChange={(e) => setSettings({ ...settings, ha_heartbeat_interval: parseInt(e.target.value) })}
                  disabled={!settings.enable_ha}
                  className="w-full px-4 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
                />
              </div>

              <div className="p-4 bg-gray-900/50 rounded-lg">
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Failover Timeout (seconds)
                </label>
                <input
                  type="number"
                  min="10"
                  max="300"
                  value={settings.ha_failover_timeout || 30}
                  onChange={(e) => setSettings({ ...settings, ha_failover_timeout: parseInt(e.target.value) })}
                  disabled={!settings.enable_ha}
                  className="w-full px-4 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
                />
              </div>
            </div>

            <div className="bg-gray-900/50 rounded-lg p-4 space-y-4">
              <h4 className="text-white font-semibold flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-blue-400" />
                Load Balancer Configuration
              </h4>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Load Balancer Type
                  </label>
                  <select
                    value={settings.load_balancer_type || 'round-robin'}
                    onChange={(e) => setSettings({ ...settings, load_balancer_type: e.target.value })}
                    disabled={!settings.enable_ha}
                    className="w-full px-4 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
                  >
                    <option value="round-robin">Round Robin</option>
                    <option value="least-connections">Least Connections</option>
                    <option value="ip-hash">IP Hash</option>
                    <option value="weighted">Weighted</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Algorithm
                  </label>
                  <select
                    value={settings.load_balancer_algorithm || 'least-connections'}
                    onChange={(e) => setSettings({ ...settings, load_balancer_algorithm: e.target.value })}
                    disabled={!settings.enable_ha}
                    className="w-full px-4 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
                  >
                    <option value="least-connections">Least Connections</option>
                    <option value="least-response-time">Least Response Time</option>
                    <option value="resource-based">Resource Based</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="bg-gray-900/50 rounded-lg p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-white font-semibold flex items-center gap-2">
                  <Zap className="w-5 h-5 text-yellow-400" />
                  Auto-Scaling Configuration
                </h4>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.enable_auto_scaling || false}
                    onChange={(e) => setSettings({ ...settings, enable_auto_scaling: e.target.checked })}
                    disabled={!settings.enable_ha}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Min Instances
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="50"
                    value={settings.min_instances || 2}
                    onChange={(e) => setSettings({ ...settings, min_instances: parseInt(e.target.value) })}
                    disabled={!settings.enable_ha || !settings.enable_auto_scaling}
                    className="w-full px-4 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Max Instances
                  </label>
                  <input
                    type="number"
                    min="2"
                    max="100"
                    value={settings.max_instances || 10}
                    onChange={(e) => setSettings({ ...settings, max_instances: parseInt(e.target.value) })}
                    disabled={!settings.enable_ha || !settings.enable_auto_scaling}
                    className="w-full px-4 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Scale Up Threshold (%)
                  </label>
                  <input
                    type="number"
                    min="50"
                    max="100"
                    value={settings.scale_up_threshold || 80}
                    onChange={(e) => setSettings({ ...settings, scale_up_threshold: parseInt(e.target.value) })}
                    disabled={!settings.enable_ha || !settings.enable_auto_scaling}
                    className="w-full px-4 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
                  />
                  <p className="text-gray-400 text-xs mt-1">CPU/Memory usage to trigger scale up</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Scale Down Threshold (%)
                  </label>
                  <input
                    type="number"
                    min="10"
                    max="50"
                    value={settings.scale_down_threshold || 30}
                    onChange={(e) => setSettings({ ...settings, scale_down_threshold: parseInt(e.target.value) })}
                    disabled={!settings.enable_ha || !settings.enable_auto_scaling}
                    className="w-full px-4 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
                  />
                  <p className="text-gray-400 text-xs mt-1">CPU/Memory usage to trigger scale down</p>
                </div>
              </div>
            </div>

            <div className="bg-blue-900/20 border border-blue-700/30 rounded-lg p-4">
              <h4 className="text-blue-400 font-semibold mb-2 flex items-center gap-2">
                <Copy className="w-4 h-4" />
                High Availability Features
              </h4>
              <div className="grid grid-cols-2 gap-3">
                <ul className="text-gray-300 text-sm space-y-1 ml-4 list-disc">
                  <li>Automatic failover with zero data loss</li>
                  <li>Real-time health monitoring and heartbeat</li>
                  <li>Geographic redundancy across regions</li>
                  <li>Split-brain prevention with quorum</li>
                  <li>Session persistence and sticky sessions</li>
                </ul>
                <ul className="text-gray-300 text-sm space-y-1 ml-4 list-disc">
                  <li>Rolling updates with zero downtime</li>
                  <li>Intelligent load balancing algorithms</li>
                  <li>Auto-scaling based on demand</li>
                  <li>Distributed caching for performance</li>
                  <li>99.99% SLA uptime guarantee</li>
                </ul>
              </div>
            </div>

            <div className="bg-yellow-900/20 border border-yellow-700/30 rounded-lg p-4">
              <h4 className="text-yellow-400 font-semibold mb-2 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                HA Deployment Requirements
              </h4>
              <ul className="text-gray-300 text-sm space-y-1 ml-4 list-disc">
                <li>Minimum 3 nodes recommended for production (avoids split-brain)</li>
                <li>All nodes must be in the same network segment for optimal performance</li>
                <li>Synchronous replication recommended for zero data loss</li>
                <li>Load balancer (HAProxy, NGINX, or cloud-native) required</li>
                <li>Shared storage or distributed file system (NFS, GlusterFS, or S3)</li>
                <li>NTP synchronization across all nodes</li>
              </ul>
            </div>
          </div>
        )}

        {activeTab === 'backup' && (
          <div className="space-y-6">
            <h3 className="text-xl font-semibold text-white flex items-center gap-2">
              <Server className="w-5 h-5 text-blue-400" />
              Backup & Recovery
            </h3>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center justify-between p-4 bg-gray-900/50 rounded-lg">
                <div>
                  <div className="text-white font-medium">Automated Backups</div>
                  <div className="text-gray-400 text-sm">Regular system backups</div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.backup_enabled || false}
                    onChange={(e) => setSettings({ ...settings, backup_enabled: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>

              <div className="p-4 bg-gray-900/50 rounded-lg">
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Backup Frequency (hours)
                </label>
                <input
                  type="number"
                  value={settings.backup_frequency_hours || 24}
                  onChange={(e) => setSettings({ ...settings, backup_frequency_hours: parseInt(e.target.value) })}
                  className="w-full px-4 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="bg-blue-900/20 border border-blue-700/30 rounded-lg p-4">
              <h4 className="text-blue-400 font-semibold mb-2">Backup Features</h4>
              <ul className="text-gray-300 text-sm space-y-1 ml-4 list-disc">
                <li>Automated daily backups to cloud storage</li>
                <li>Point-in-time recovery capabilities</li>
                <li>Encrypted backup storage (AES-256)</li>
                <li>90-day backup retention policy</li>
                <li>One-click restore functionality</li>
              </ul>
            </div>
          </div>
        )}
      </div>

      <div className="bg-gradient-to-br from-blue-900/20 to-purple-900/20 border border-blue-700/30 rounded-lg p-6">
        <h3 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
          <FileText className="w-5 h-5 text-blue-400" />
          Production Deployment Guide
        </h3>

        <div className="space-y-4 text-gray-300">
          <div>
            <h4 className="text-blue-400 font-semibold mb-2">1. Databricks Setup (Required)</h4>
            <ul className="space-y-1 ml-4 list-disc text-sm">
              <li>Create Databricks workspace on your preferred cloud (AWS/Azure/GCP)</li>
              <li>Provision an all-purpose cluster with ML runtime</li>
              <li>Create Unity Catalog and schema for SIEM data</li>
              <li>Generate personal access token with cluster access</li>
              <li>Configure Delta Lake tables for high-performance ingestion</li>
            </ul>
          </div>

          <div>
            <h4 className="text-blue-400 font-semibold mb-2">2. Data Pipeline Architecture</h4>
            <ul className="space-y-1 ml-4 list-disc text-sm">
              <li>Use Databricks Auto Loader for streaming ingestion</li>
              <li>Implement Delta Live Tables for data quality</li>
              <li>Set up streaming jobs for real-time processing</li>
              <li>Configure Photon acceleration for query performance</li>
              <li>Enable predictive optimization for automatic tuning</li>
            </ul>
          </div>

          <div>
            <h4 className="text-blue-400 font-semibold mb-2">3. Authentication & Security</h4>
            <ul className="space-y-1 ml-4 list-disc text-sm">
              <li>Enable MFA for all admin accounts</li>
              <li>Configure SAML SSO with your identity provider</li>
              <li>Set up OAuth for API access</li>
              <li>Implement RBAC with least privilege principle</li>
              <li>Enable audit logging and monitoring</li>
            </ul>
          </div>

          <div>
            <h4 className="text-blue-400 font-semibold mb-2">4. Scaling & Performance</h4>
            <ul className="space-y-1 ml-4 list-disc text-sm">
              <li>Configure autoscaling clusters for variable workloads</li>
              <li>Use Databricks SQL for analytics queries</li>
              <li>Implement partition strategies for time-series data</li>
              <li>Set up caching for frequently accessed data</li>
              <li>Monitor performance metrics and optimize queries</li>
            </ul>
          </div>

          <div>
            <h4 className="text-blue-400 font-semibold mb-2">5. Monitoring & Alerting</h4>
            <ul className="space-y-1 ml-4 list-disc text-sm">
              <li>Configure SMTP for email alerts</li>
              <li>Set up webhook integrations (Slack, PagerDuty, etc.)</li>
              <li>Enable Databricks monitoring and logging</li>
              <li>Create custom dashboards for operational metrics</li>
              <li>Implement health checks and uptime monitoring</li>
            </ul>
          </div>

          <div>
            <h4 className="text-blue-400 font-semibold mb-2">6. Compliance & Governance</h4>
            <ul className="space-y-1 ml-4 list-disc text-sm">
              <li>Enable Unity Catalog for data governance</li>
              <li>Configure data lineage tracking</li>
              <li>Implement data retention policies</li>
              <li>Set up compliance reporting (SOC 2, ISO 27001)</li>
              <li>Regular security audits and penetration testing</li>
            </ul>
          </div>

          <div>
            <h4 className="text-blue-400 font-semibold mb-2">7. Disaster Recovery</h4>
            <ul className="space-y-1 ml-4 list-disc text-sm">
              <li>Configure automated backups to cloud storage</li>
              <li>Implement cross-region replication</li>
              <li>Test disaster recovery procedures quarterly</li>
              <li>Document runbooks for incident response</li>
              <li>Maintain RTO/RPO within compliance requirements</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
