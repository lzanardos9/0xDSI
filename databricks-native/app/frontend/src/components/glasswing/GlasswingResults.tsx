import { useState } from 'react';
import { Shield, AlertTriangle, ChevronRight, ChevronDown, Code, Wrench, Clock, ExternalLink, Search, Filter, Copy, Check, Brain } from 'lucide-react';
import RuleFromRemediationModal from './RuleFromRemediationModal';

interface Vulnerability {
  id: string;
  vuln_id: string;
  title: string;
  description: string;
  severity: string;
  cvss_score: number;
  cwe_id: string;
  affected_component: string;
  affected_versions: string;
  exploit_feasibility: string;
  exploit_complexity: string;
  remediation_steps: string;
  patch_status: string;
  age_days: number;
  discovery_method: string;
  confidence: number;
  code_snippet: string;
  fix_snippet: string;
  tags: string[];
  scan_name?: string;
}

interface GlasswingResultsProps {
  vulnerabilities: Vulnerability[];
  loading: boolean;
}

const SEVERITY_CONFIG: Record<string, { bg: string; text: string; border: string; glow: string }> = {
  critical: { bg: 'bg-red-950/40', text: 'text-red-400', border: 'border-red-500/30', glow: 'shadow-red-500/10' },
  high: { bg: 'bg-orange-950/40', text: 'text-orange-400', border: 'border-orange-500/30', glow: 'shadow-orange-500/10' },
  medium: { bg: 'bg-amber-950/40', text: 'text-amber-400', border: 'border-amber-500/30', glow: 'shadow-amber-500/10' },
  low: { bg: 'bg-emerald-950/40', text: 'text-emerald-400', border: 'border-emerald-500/30', glow: 'shadow-emerald-500/10' },
};

const PATCH_CONFIG: Record<string, { bg: string; text: string }> = {
  patched: { bg: 'bg-emerald-900/30', text: 'text-emerald-400' },
  verified: { bg: 'bg-cyan-900/30', text: 'text-cyan-400' },
  in_progress: { bg: 'bg-amber-900/30', text: 'text-amber-400' },
  unpatched: { bg: 'bg-red-900/30', text: 'text-red-400' },
};

const FEASIBILITY_CONFIG: Record<string, string> = {
  proven: 'text-red-400',
  high: 'text-orange-400',
  moderate: 'text-amber-400',
  theoretical: 'text-slate-400',
};

export default function GlasswingResults({ vulnerabilities, loading }: GlasswingResultsProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [patchFilter, setPatchFilter] = useState<string>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [ruleModalVuln, setRuleModalVuln] = useState<Vulnerability | null>(null);

  const filtered = vulnerabilities.filter(v => {
    if (severityFilter !== 'all' && v.severity !== severityFilter) return false;
    if (patchFilter !== 'all' && v.patch_status !== patchFilter) return false;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      return v.title.toLowerCase().includes(q) || v.vuln_id.toLowerCase().includes(q) ||
             v.affected_component.toLowerCase().includes(q) || v.cwe_id.toLowerCase().includes(q);
    }
    return true;
  });

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const formatAge = (days: number) => {
    if (days >= 365) return `${Math.round(days / 365)}y old`;
    if (days >= 30) return `${Math.round(days / 30)}mo old`;
    return `${days}d old`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Search vulnerabilities, CWEs, components..."
            className="w-full bg-slate-800/50 border border-slate-700/50 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500/50 transition-all"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-500" />
          <select
            value={severityFilter}
            onChange={e => setSeverityFilter(e.target.value)}
            className="bg-slate-800/50 border border-slate-700/50 rounded-lg px-2 py-2 text-xs text-white focus:outline-none"
          >
            <option value="all">All Severity</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          <select
            value={patchFilter}
            onChange={e => setPatchFilter(e.target.value)}
            className="bg-slate-800/50 border border-slate-700/50 rounded-lg px-2 py-2 text-xs text-white focus:outline-none"
          >
            <option value="all">All Status</option>
            <option value="unpatched">Unpatched</option>
            <option value="in_progress">In Progress</option>
            <option value="patched">Patched</option>
          </select>
        </div>
      </div>

      <div className="text-xs text-slate-500">
        {filtered.length} of {vulnerabilities.length} vulnerabilities
      </div>

      <div className="space-y-2">
        {filtered.map(vuln => {
          const isExpanded = expandedId === vuln.id;
          const sev = SEVERITY_CONFIG[vuln.severity] || SEVERITY_CONFIG.medium;
          const patch = PATCH_CONFIG[vuln.patch_status] || PATCH_CONFIG.unpatched;

          return (
            <div
              key={vuln.id}
              className={`border rounded-xl transition-all duration-300 ${sev.border} ${isExpanded ? `${sev.bg} shadow-lg ${sev.glow}` : 'bg-slate-900/30 hover:bg-slate-800/30'}`}
            >
              <button
                onClick={() => setExpandedId(isExpanded ? null : vuln.id)}
                className="w-full px-4 py-3 flex items-center gap-3 text-left"
              >
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${sev.bg} border ${sev.border}`}>
                  <span className={`text-xs font-bold ${sev.text}`}>{vuln.cvss_score.toFixed(1)}</span>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-xs font-mono text-slate-500">{vuln.vuln_id}</span>
                    <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${sev.bg} ${sev.text}`}>
                      {vuln.severity}
                    </span>
                    {vuln.age_days >= 1825 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-900/40 text-red-300 font-medium">
                        {formatAge(vuln.age_days)}
                      </span>
                    )}
                  </div>
                  <p className="text-sm font-medium text-white truncate">{vuln.title}</p>
                  <p className="text-xs text-slate-500 truncate mt-0.5">{vuln.affected_component}</p>
                </div>

                <div className="flex items-center gap-3 flex-shrink-0">
                  <div className="text-right hidden lg:block">
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${patch.bg} ${patch.text}`}>
                      {vuln.patch_status.replace('_', ' ')}
                    </span>
                    <p className={`text-xs mt-1 ${FEASIBILITY_CONFIG[vuln.exploit_feasibility] || 'text-slate-400'}`}>
                      {vuln.exploit_feasibility} exploit
                    </p>
                  </div>
                  <div className="w-12 text-right">
                    <div className="text-[10px] text-slate-500 mb-0.5">conf.</div>
                    <div className="text-xs font-mono text-cyan-400">{vuln.confidence}%</div>
                  </div>
                  {isExpanded ? <ChevronDown className="w-4 h-4 text-slate-500" /> : <ChevronRight className="w-4 h-4 text-slate-500" />}
                </div>
              </button>

              {isExpanded && (
                <div className="px-4 pb-4 space-y-4 border-t border-slate-700/30 mt-1 pt-4 animate-fadeIn">
                  <p className="text-sm text-slate-300 leading-relaxed">{vuln.description}</p>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="bg-slate-800/50 rounded-lg p-2.5">
                      <p className="text-[10px] text-slate-500 uppercase tracking-wider">CWE</p>
                      <p className="text-xs font-mono text-white mt-0.5">{vuln.cwe_id || 'N/A'}</p>
                    </div>
                    <div className="bg-slate-800/50 rounded-lg p-2.5">
                      <p className="text-[10px] text-slate-500 uppercase tracking-wider">Discovery</p>
                      <p className="text-xs text-white mt-0.5">{vuln.discovery_method.replace('_', ' ')}</p>
                    </div>
                    <div className="bg-slate-800/50 rounded-lg p-2.5">
                      <p className="text-[10px] text-slate-500 uppercase tracking-wider">Complexity</p>
                      <p className="text-xs text-white mt-0.5">{vuln.exploit_complexity}</p>
                    </div>
                    <div className="bg-slate-800/50 rounded-lg p-2.5">
                      <p className="text-[10px] text-slate-500 uppercase tracking-wider">Versions</p>
                      <p className="text-xs font-mono text-white mt-0.5">{vuln.affected_versions || 'All'}</p>
                    </div>
                  </div>

                  {vuln.code_snippet && (
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-1.5">
                          <Code className="w-3.5 h-3.5 text-red-400" />
                          <span className="text-xs font-medium text-red-400">Vulnerable Code</span>
                        </div>
                        <button
                          onClick={() => handleCopy(vuln.code_snippet, `code-${vuln.id}`)}
                          className="text-slate-500 hover:text-white transition-colors"
                        >
                          {copiedId === `code-${vuln.id}` ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                      <pre className="bg-slate-950/80 border border-red-900/20 rounded-lg p-3 text-xs font-mono text-slate-300 overflow-x-auto leading-relaxed">
                        {vuln.code_snippet}
                      </pre>
                    </div>
                  )}

                  {vuln.fix_snippet && (
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-1.5">
                          <Wrench className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="text-xs font-medium text-emerald-400">Suggested Fix</span>
                        </div>
                        <button
                          onClick={() => handleCopy(vuln.fix_snippet, `fix-${vuln.id}`)}
                          className="text-slate-500 hover:text-white transition-colors"
                        >
                          {copiedId === `fix-${vuln.id}` ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                      <pre className="bg-slate-950/80 border border-emerald-900/20 rounded-lg p-3 text-xs font-mono text-slate-300 overflow-x-auto leading-relaxed">
                        {vuln.fix_snippet}
                      </pre>
                    </div>
                  )}

                  {vuln.remediation_steps && (
                    <div className="bg-cyan-950/20 border border-cyan-500/20 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-1.5">
                          <Shield className="w-3.5 h-3.5 text-cyan-400" />
                          <span className="text-xs font-medium text-cyan-400">Remediation</span>
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); setRuleModalVuln(vuln); }}
                          className="group flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-gradient-to-r from-cyan-500/10 to-blue-500/10 border border-cyan-500/30 hover:border-cyan-400/60 hover:from-cyan-500/20 hover:to-blue-500/20 transition-all duration-300 hover:shadow-lg hover:shadow-cyan-500/10"
                        >
                          <Brain className="w-3 h-3 text-cyan-400 group-hover:text-cyan-300 transition-colors" />
                          <span className="text-[10px] font-semibold text-cyan-300 group-hover:text-cyan-200 uppercase tracking-wide transition-colors">
                            Create Correlation Rule
                          </span>
                        </button>
                      </div>
                      <p className="text-xs text-slate-300 leading-relaxed">{vuln.remediation_steps}</p>
                    </div>
                  )}

                  {vuln.tags && vuln.tags.length > 0 && (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {vuln.tags.map((tag, i) => (
                        <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800/80 text-slate-400 border border-slate-700/30">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12">
          <AlertTriangle className="w-8 h-8 text-slate-600 mx-auto mb-2" />
          <p className="text-sm text-slate-500">No vulnerabilities match your filters</p>
        </div>
      )}

      {ruleModalVuln && (
        <RuleFromRemediationModal
          vulnerability={ruleModalVuln}
          onClose={() => setRuleModalVuln(null)}
        />
      )}

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fadeIn { animation: fadeIn 0.3s ease-out; }
      `}</style>
    </div>
  );
}
