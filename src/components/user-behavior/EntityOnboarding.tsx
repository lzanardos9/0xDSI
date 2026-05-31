import { useState, useEffect, useCallback } from 'react';
import { Upload, Users, Building2, Shield, Search, Plus, RefreshCw, Cloud, FileText, AlertTriangle, CheckCircle2, Loader2, UserPlus } from 'lucide-react';

interface Entity {
  entity_id: string;
  canonical_name: string;
  display_name: string;
  entity_type: string;
  department: string;
  owner: string;
  is_high_value: boolean;
  is_service_account: boolean;
  risk_score: number;
  observation_count: number;
  first_seen: string;
  last_seen: string;
}

interface ImportResult {
  imported: number;
  total_submitted: number;
  errors: string[];
}

const BACKEND_URL = (window as any).__DATABRICKS_BACKEND_URL || '/api';

export default function EntityOnboarding() {
  const [entities, setEntities] = useState<Entity[]>([]);
  const [total, setTotal] = useState(0);
  const [byDepartment, setByDepartment] = useState<{ department: string; cnt: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [importMode, setImportMode] = useState<'csv' | 'manual' | 'idp' | null>(null);
  const [csvText, setCsvText] = useState('');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [manualForm, setManualForm] = useState({ canonical_name: '', display_name: '', department: '', entity_type: 'user' });

  const fetchEntities = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ entity_type: 'user', limit: '100', search: searchTerm });
      const resp = await fetch(`${BACKEND_URL}/entity-spine/users?${params}`);
      if (resp.ok) {
        const data = await resp.json();
        setEntities(data.entities || []);
        setTotal(data.total || 0);
        setByDepartment(data.by_department || []);
      }
    } catch {}
    setLoading(false);
  }, [searchTerm]);

  useEffect(() => {
    fetchEntities();
  }, [fetchEntities]);

  const handleCsvImport = async () => {
    if (!csvText.trim()) return;
    setImporting(true);
    setImportResult(null);

    try {
      const lines = csvText.trim().split('\n');
      const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
      const entities = lines.slice(1).map(line => {
        const values = line.split(',').map(v => v.trim());
        const obj: any = {};
        headers.forEach((h, i) => {
          if (h === 'canonical_name' || h === 'username' || h === 'email' || h === 'user_id') {
            obj.canonical_name = values[i];
          } else if (h === 'display_name' || h === 'name' || h === 'full_name') {
            obj.display_name = values[i];
          } else if (h === 'department' || h === 'dept') {
            obj.department = values[i];
          } else if (h === 'manager' || h === 'owner') {
            obj.owner = values[i];
          } else if (h === 'title' || h === 'role') {
            obj.attributes = { ...(obj.attributes || {}), title: values[i] };
          } else if (h === 'high_value' || h === 'vip') {
            obj.is_high_value = values[i]?.toLowerCase() === 'true' || values[i] === '1';
          } else if (h === 'service_account') {
            obj.is_service_account = values[i]?.toLowerCase() === 'true' || values[i] === '1';
          }
        });
        obj.entity_type = 'user';
        return obj;
      }).filter(e => e.canonical_name);

      const resp = await fetch(`${BACKEND_URL}/entity-spine/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entities }),
      });

      if (resp.ok) {
        const result = await resp.json();
        setImportResult(result);
        fetchEntities();
      }
    } catch (e: any) {
      setImportResult({ imported: 0, total_submitted: 0, errors: [e.message] });
    }
    setImporting(false);
  };

  const handleManualAdd = async () => {
    if (!manualForm.canonical_name.trim()) return;
    setImporting(true);

    try {
      const resp = await fetch(`${BACKEND_URL}/entity-spine/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entities: [manualForm] }),
      });
      if (resp.ok) {
        const result = await resp.json();
        setImportResult(result);
        setManualForm({ canonical_name: '', display_name: '', department: '', entity_type: 'user' });
        fetchEntities();
      }
    } catch {}
    setImporting(false);
  };

  const handleIdPSync = async (provider: string) => {
    setImporting(true);
    try {
      const resp = await fetch(`${BACKEND_URL}/entity-spine/trigger-idp-sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider }),
      });
      if (resp.ok) {
        const result = await resp.json();
        setImportResult({ imported: 0, total_submitted: 0, errors: [], ...result });
      }
    } catch {}
    setImporting(false);
  };

  return (
    <div className="space-y-4">
      {/* Stats Header */}
      <div className="grid grid-cols-4 gap-3">
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-3">
          <div className="text-slate-400 text-xs font-mono mb-1">TOTAL ENTITIES</div>
          <div className="text-2xl font-bold text-white">{total.toLocaleString()}</div>
        </div>
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-3">
          <div className="text-slate-400 text-xs font-mono mb-1">DEPARTMENTS</div>
          <div className="text-2xl font-bold text-blue-400">{byDepartment.length}</div>
        </div>
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-3">
          <div className="text-slate-400 text-xs font-mono mb-1">HIGH-VALUE</div>
          <div className="text-2xl font-bold text-amber-400">{entities.filter(e => e.is_high_value).length}</div>
        </div>
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-3">
          <div className="text-slate-400 text-xs font-mono mb-1">SERVICE ACCOUNTS</div>
          <div className="text-2xl font-bold text-slate-300">{entities.filter(e => e.is_service_account).length}</div>
        </div>
      </div>

      {/* Import Actions */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => setImportMode(importMode === 'csv' ? null : 'csv')}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${importMode === 'csv' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700'}`}
        >
          <Upload className="w-4 h-4" />
          Import CSV
        </button>
        <button
          onClick={() => setImportMode(importMode === 'manual' ? null : 'manual')}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${importMode === 'manual' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700'}`}
        >
          <UserPlus className="w-4 h-4" />
          Add Manual
        </button>
        <button
          onClick={() => setImportMode(importMode === 'idp' ? null : 'idp')}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${importMode === 'idp' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700'}`}
        >
          <Cloud className="w-4 h-4" />
          IdP Sync
        </button>

        <div className="ml-auto flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search entities..."
              className="pl-9 pr-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-500 w-64 focus:outline-none focus:border-blue-500"
            />
          </div>
          <button onClick={fetchEntities} className="p-2 bg-slate-800 border border-slate-700 rounded-lg hover:bg-slate-700">
            <RefreshCw className={`w-4 h-4 text-slate-400 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Import Panels */}
      {importMode === 'csv' && (
        <div className="bg-slate-800/70 border border-slate-700/50 rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-2 mb-2">
            <FileText className="w-4 h-4 text-blue-400" />
            <span className="text-sm font-semibold text-white">CSV Import</span>
            <span className="text-xs text-slate-500">Headers: canonical_name/username/email, display_name/name, department, manager, title, high_value, service_account</span>
          </div>
          <textarea
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            placeholder={`username,display_name,department,manager,title,high_value\njohn.doe,John Doe,Engineering,jane.smith,Senior Engineer,false\njane.smith,Jane Smith,Engineering,,VP Engineering,true`}
            className="w-full h-32 bg-slate-900 border border-slate-700 rounded-lg p-3 text-xs font-mono text-slate-300 placeholder:text-slate-600 focus:outline-none focus:border-blue-500 resize-none"
          />
          <div className="flex items-center gap-3">
            <button
              onClick={handleCsvImport}
              disabled={importing || !csvText.trim()}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium"
            >
              {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              Import Entities
            </button>
            {importResult && (
              <div className="flex items-center gap-2 text-sm">
                {importResult.imported > 0 ? (
                  <><CheckCircle2 className="w-4 h-4 text-emerald-400" /><span className="text-emerald-400">{importResult.imported} imported</span></>
                ) : (
                  <><AlertTriangle className="w-4 h-4 text-amber-400" /><span className="text-amber-400">No entities imported</span></>
                )}
                {importResult.errors.length > 0 && (
                  <span className="text-red-400 text-xs">{importResult.errors[0]}</span>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {importMode === 'manual' && (
        <div className="bg-slate-800/70 border border-slate-700/50 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <UserPlus className="w-4 h-4 text-blue-400" />
            <span className="text-sm font-semibold text-white">Add Entity Manually</span>
          </div>
          <div className="grid grid-cols-4 gap-3">
            <input
              value={manualForm.canonical_name}
              onChange={(e) => setManualForm(p => ({ ...p, canonical_name: e.target.value }))}
              placeholder="Username / Email *"
              className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
            />
            <input
              value={manualForm.display_name}
              onChange={(e) => setManualForm(p => ({ ...p, display_name: e.target.value }))}
              placeholder="Display Name"
              className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
            />
            <input
              value={manualForm.department}
              onChange={(e) => setManualForm(p => ({ ...p, department: e.target.value }))}
              placeholder="Department"
              className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
            />
            <button
              onClick={handleManualAdd}
              disabled={importing || !manualForm.canonical_name.trim()}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium"
            >
              {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Add
            </button>
          </div>
        </div>
      )}

      {importMode === 'idp' && (
        <div className="bg-slate-800/70 border border-slate-700/50 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <Cloud className="w-4 h-4 text-blue-400" />
            <span className="text-sm font-semibold text-white">Identity Provider Sync</span>
            <span className="text-xs text-slate-500 ml-2">Pull all users from your identity provider into the entity spine</span>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => handleIdPSync('azure_ad')} disabled={importing} className="flex items-center gap-2 px-4 py-2.5 bg-[#0078D4]/20 border border-[#0078D4]/40 text-[#0078D4] rounded-lg text-sm font-medium hover:bg-[#0078D4]/30">
              <Shield className="w-4 h-4" /> Azure AD
            </button>
            <button onClick={() => handleIdPSync('okta')} disabled={importing} className="flex items-center gap-2 px-4 py-2.5 bg-[#007DC1]/20 border border-[#007DC1]/40 text-[#007DC1] rounded-lg text-sm font-medium hover:bg-[#007DC1]/30">
              <Shield className="w-4 h-4" /> Okta
            </button>
            <button onClick={() => handleIdPSync('google')} disabled={importing} className="flex items-center gap-2 px-4 py-2.5 bg-[#34A853]/20 border border-[#34A853]/40 text-[#34A853] rounded-lg text-sm font-medium hover:bg-[#34A853]/30">
              <Shield className="w-4 h-4" /> Google Workspace
            </button>
            {importing && <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />}
          </div>
        </div>
      )}

      {/* Entity Table */}
      <div className="bg-slate-800/40 border border-slate-700/50 rounded-lg overflow-hidden">
        <div className="px-4 py-2.5 border-b border-slate-700/40 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-blue-400" />
            <span className="text-sm font-semibold text-white">Entity Population</span>
            <span className="text-xs text-slate-500 font-mono">{total} total</span>
          </div>
          <div className="flex items-center gap-3">
            {byDepartment.slice(0, 5).map(d => (
              <span key={d.department} className="text-[10px] text-slate-400 font-mono">
                <span className="text-slate-500">{d.department}:</span> {d.cnt}
              </span>
            ))}
          </div>
        </div>

        <div className="overflow-y-auto max-h-[360px]">
          <table className="w-full text-xs">
            <thead className="bg-slate-900/60 sticky top-0">
              <tr className="text-slate-400 font-mono uppercase">
                <th className="text-left px-3 py-2">Entity</th>
                <th className="text-left px-3 py-2">Department</th>
                <th className="text-left px-3 py-2">Type</th>
                <th className="text-right px-3 py-2">Observations</th>
                <th className="text-right px-3 py-2">Risk</th>
                <th className="text-left px-3 py-2">Last Seen</th>
                <th className="text-center px-3 py-2">Flags</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {entities.map(entity => (
                <tr key={entity.entity_id} className="hover:bg-slate-800/40 transition-colors">
                  <td className="px-3 py-2">
                    <div className="text-white font-medium">{entity.display_name || entity.canonical_name}</div>
                    {entity.display_name && entity.display_name !== entity.canonical_name && (
                      <div className="text-slate-500 text-[10px] font-mono">{entity.canonical_name}</div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-slate-400">{entity.department || '-'}</td>
                  <td className="px-3 py-2">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${entity.entity_type === 'user' ? 'bg-blue-500/10 text-blue-400' : entity.entity_type === 'device' ? 'bg-amber-500/10 text-amber-400' : 'bg-slate-700 text-slate-400'}`}>
                      {entity.entity_type}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-slate-300">{entity.observation_count?.toLocaleString() || '0'}</td>
                  <td className="px-3 py-2 text-right">
                    <span className={`font-mono ${entity.risk_score > 0.7 ? 'text-red-400' : entity.risk_score > 0.4 ? 'text-amber-400' : 'text-emerald-400'}`}>
                      {(entity.risk_score * 100).toFixed(0)}%
                    </span>
                  </td>
                  <td className="px-3 py-2 text-slate-500 font-mono text-[10px]">
                    {entity.last_seen ? new Date(entity.last_seen).toLocaleDateString() : 'never'}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <div className="flex items-center justify-center gap-1">
                      {entity.is_high_value && <span className="px-1 py-0.5 bg-amber-500/10 text-amber-400 rounded text-[9px]">VIP</span>}
                      {entity.is_service_account && <span className="px-1 py-0.5 bg-slate-600/30 text-slate-400 rounded text-[9px]">SVC</span>}
                    </div>
                  </td>
                </tr>
              ))}
              {entities.length === 0 && !loading && (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-slate-500">
                    No entities found. Import users via CSV, IdP sync, or wait for auto-discovery from events.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Auto-Discovery Info */}
      <div className="bg-slate-800/30 border border-slate-700/30 rounded-lg p-3">
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <RefreshCw className="w-3.5 h-3.5 text-emerald-400" />
          <span className="text-emerald-400 font-medium">Auto-Discovery Active</span>
          <span className="text-slate-500">|</span>
          <span>New users are automatically added from authentication events, VPN logs, and access events as they flow through the ingestion pipeline.</span>
        </div>
      </div>
    </div>
  );
}
