import { useState, useEffect } from 'react';
import { Activity, Layers, Target, Zap, ShieldCheck, GitBranch, AlertTriangle, CheckCircle2, Clock, TrendingUp, Network } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface PipelineStats {
  totalFindings: number;
  rootCauses: number;
  reachable: number;
  patchesGenerated: number;
  wafRulesActive: number;
  exploitChains: number;
  criticalReachable: number;
  avgConfidence: number;
}

interface Finding {
  id: string;
  finding_id: string;
  codebase: string;
  file_path: string;
  vuln_class: string;
  severity: string;
  confidence: number;
  title: string;
  description: string;
  exploit_chain_id: string | null;
  status: string;
  hunt_agent_id: string;
}

interface RootCause {
  id: string;
  cluster_label: string;
  vuln_class: string;
  finding_count: number;
  avg_confidence: number;
  max_severity: string;
  affected_codebases: string[];
  status: string;
}

interface ReachabilityRecord {
  id: string;
  root_cause_id: string;
  entry_point: string;
  is_reachable: boolean;
  reachability_score: number;
  traffic_volume_24h: number;
}

interface PatchRecord {
  id: string;
  patch_type: string;
  target_file: string;
  target_codebase: string;
  review_status: string;
  regression_test_passed: boolean | null;
}

interface WafRule {
  id: string;
  rule_name: string;
  rule_type: string;
  target_endpoint: string;
  is_active: boolean;
  blocks_24h: number;
}

const PIPELINE_STAGES = [
  { id: 'ingest', label: 'Ingest', icon: Activity, color: 'cyan' },
  { id: 'dedup', label: 'Deduplicate', icon: Layers, color: 'blue' },
  { id: 'reach', label: 'Reachability', icon: Target, color: 'amber' },
  { id: 'score', label: 'Blast Radius', icon: TrendingUp, color: 'orange' },
  { id: 'patch', label: 'Auto-Patch', icon: ShieldCheck, color: 'green' },
];

export default function MythosPipelineView() {
  const [stats, setStats] = useState<PipelineStats>({ totalFindings: 0, rootCauses: 0, reachable: 0, patchesGenerated: 0, wafRulesActive: 0, exploitChains: 0, criticalReachable: 0, avgConfidence: 0 });
  const [findings, setFindings] = useState<Finding[]>([]);
  const [rootCauses, setRootCauses] = useState<RootCause[]>([]);
  const [reachability, setReachability] = useState<ReachabilityRecord[]>([]);
  const [patches, setPatches] = useState<PatchRecord[]>([]);
  const [wafRules, setWafRules] = useState<WafRule[]>([]);
  const [activeStage, setActiveStage] = useState<string>('ingest');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPipelineData();
  }, []);

  async function loadPipelineData() {
    setLoading(true);
    try {
      const [findingsRes, rootCausesRes, reachRes, patchesRes, wafRes, chainsRes] = await Promise.all([
        supabase.from('glasswing_findings').select('*').order('confidence', { ascending: false }).limit(100),
        supabase.from('glasswing_root_causes').select('*').order('avg_confidence', { ascending: false }),
        supabase.from('glasswing_reachability').select('*').order('reachability_score', { ascending: false }),
        supabase.from('glasswing_patches').select('*').order('created_at', { ascending: false }),
        supabase.from('glasswing_waf_rules').select('*').order('created_at', { ascending: false }),
        supabase.from('glasswing_exploit_chains').select('*'),
      ]);

      const f = findingsRes.data || [];
      const rc = rootCausesRes.data || [];
      const reach = reachRes.data || [];
      const p = patchesRes.data || [];
      const waf = wafRes.data || [];
      const chains = chainsRes.data || [];

      setFindings(f);
      setRootCauses(rc);
      setReachability(reach);
      setPatches(p);
      setWafRules(waf);

      const reachableCount = reach.filter(r => r.is_reachable).length;
      setStats({
        totalFindings: f.length,
        rootCauses: rc.length,
        reachable: reachableCount,
        patchesGenerated: p.length,
        wafRulesActive: waf.filter(w => w.is_active).length,
        exploitChains: chains.length,
        criticalReachable: reach.filter(r => r.is_reachable && r.reachability_score > 0.8).length,
        avgConfidence: f.length ? f.reduce((s, x) => s + (x.confidence || 0), 0) / f.length : 0,
      });
    } catch (err) {
      console.error('Error loading Mythos pipeline data:', err);
    } finally {
      setLoading(false);
    }
  }

  const severityColor = (sev: string) => {
    switch (sev) {
      case 'critical': return 'text-red-400 bg-red-950/40 border-red-500/30';
      case 'high': return 'text-orange-400 bg-orange-950/40 border-orange-500/30';
      case 'medium': return 'text-amber-400 bg-amber-950/40 border-amber-500/30';
      default: return 'text-slate-400 bg-slate-800/40 border-slate-600/30';
    }
  };

  return (
    <div className="space-y-5">
      {/* Pipeline Flow Visualization */}
      <div className="bg-slate-900/60 rounded-xl border border-slate-700/40 p-5">
        <div className="flex items-center gap-2 mb-4">
          <Network className="w-4 h-4 text-cyan-400" />
          <span className="text-sm font-semibold text-white">Mythos Triage Pipeline</span>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-950/50 text-cyan-400 border border-cyan-500/20 ml-auto">
            5-Stage Bayesian Fusion
          </span>
        </div>

        <div className="flex items-center justify-between gap-2">
          {PIPELINE_STAGES.map((stage, i) => (
            <div key={stage.id} className="flex items-center flex-1">
              <button
                onClick={() => setActiveStage(stage.id)}
                className={`flex-1 flex flex-col items-center gap-1.5 p-3 rounded-lg border transition-all ${
                  activeStage === stage.id
                    ? `bg-${stage.color}-950/30 border-${stage.color}-500/40 shadow-lg shadow-${stage.color}-500/10`
                    : 'bg-slate-800/40 border-slate-700/30 hover:border-slate-600/50'
                }`}
              >
                <stage.icon className={`w-5 h-5 ${activeStage === stage.id ? `text-${stage.color}-400` : 'text-slate-500'}`} />
                <span className={`text-[11px] font-medium ${activeStage === stage.id ? 'text-white' : 'text-slate-500'}`}>
                  {stage.label}
                </span>
                <span className={`text-[10px] ${activeStage === stage.id ? `text-${stage.color}-400` : 'text-slate-600'}`}>
                  {stage.id === 'ingest' && `${stats.totalFindings} findings`}
                  {stage.id === 'dedup' && `${stats.rootCauses} clusters`}
                  {stage.id === 'reach' && `${stats.reachable} reachable`}
                  {stage.id === 'score' && `${stats.criticalReachable} critical`}
                  {stage.id === 'patch' && `${stats.patchesGenerated + stats.wafRulesActive} actions`}
                </span>
              </button>
              {i < PIPELINE_STAGES.length - 1 && (
                <div className="w-6 h-px bg-gradient-to-r from-slate-700 to-slate-700/30 mx-1" />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-4 gap-3">
        <StatCard label="Total Findings" value={stats.totalFindings} icon={Activity} color="cyan" />
        <StatCard label="Exploit Chains" value={stats.exploitChains} icon={GitBranch} color="red" />
        <StatCard label="Reachable Vulns" value={stats.reachable} icon={AlertTriangle} color="amber" />
        <StatCard label="WAF Rules Active" value={stats.wafRulesActive} icon={ShieldCheck} color="green" />
      </div>

      {/* Stage Detail View */}
      <div className="bg-slate-900/60 rounded-xl border border-slate-700/40 overflow-hidden">
        {activeStage === 'ingest' && <IngestView findings={findings} loading={loading} />}
        {activeStage === 'dedup' && <DedupView rootCauses={rootCauses} loading={loading} />}
        {activeStage === 'reach' && <ReachabilityView records={reachability} loading={loading} />}
        {activeStage === 'score' && <BlastRadiusView reachability={reachability} rootCauses={rootCauses} loading={loading} />}
        {activeStage === 'patch' && <PatchView patches={patches} wafRules={wafRules} loading={loading} />}
      </div>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, color }: { label: string; value: number; icon: typeof Activity; color: string }) {
  return (
    <div className="bg-slate-800/50 rounded-lg border border-slate-700/30 p-3">
      <div className="flex items-center gap-2 mb-1">
        <Icon className={`w-3.5 h-3.5 text-${color}-400`} />
        <span className="text-[11px] text-slate-500">{label}</span>
      </div>
      <span className="text-xl font-bold text-white">{value.toLocaleString()}</span>
    </div>
  );
}

function IngestView({ findings, loading }: { findings: Finding[]; loading: boolean }) {
  if (loading) return <LoadingState />;
  const byClass = findings.reduce((acc, f) => { acc[f.vuln_class] = (acc[f.vuln_class] || 0) + 1; return acc; }, {} as Record<string, number>);
  const bySeverity = findings.reduce((acc, f) => { acc[f.severity] = (acc[f.severity] || 0) + 1; return acc; }, {} as Record<string, number>);

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">Ingested Findings from Mythos Hunt Agents</h3>
        <span className="text-xs text-slate-500">{findings.length} total</span>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <span className="text-[11px] text-slate-500 uppercase tracking-wider">By Severity</span>
          <div className="mt-2 space-y-1.5">
            {Object.entries(bySeverity).sort((a, b) => b[1] - a[1]).map(([sev, count]) => (
              <div key={sev} className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${sev === 'critical' ? 'bg-red-400' : sev === 'high' ? 'bg-orange-400' : sev === 'medium' ? 'bg-amber-400' : 'bg-slate-400'}`} />
                <span className="text-xs text-slate-400 capitalize flex-1">{sev}</span>
                <span className="text-xs font-mono text-white">{count}</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <span className="text-[11px] text-slate-500 uppercase tracking-wider">By Vulnerability Class</span>
          <div className="mt-2 space-y-1.5 max-h-32 overflow-y-auto">
            {Object.entries(byClass).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([cls, count]) => (
              <div key={cls} className="flex items-center gap-2">
                <span className="text-xs text-slate-400 flex-1 truncate">{cls.replace(/_/g, ' ')}</span>
                <span className="text-xs font-mono text-white">{count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="border-t border-slate-700/30 pt-3">
        <span className="text-[11px] text-slate-500 uppercase tracking-wider">Recent Findings</span>
        <div className="mt-2 space-y-2 max-h-64 overflow-y-auto">
          {findings.slice(0, 10).map(f => (
            <div key={f.id} className="flex items-start gap-3 p-2 rounded-lg bg-slate-800/30 border border-slate-700/20">
              <div className={`mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${f.severity === 'critical' ? 'bg-red-950/60 text-red-400' : f.severity === 'high' ? 'bg-orange-950/60 text-orange-400' : 'bg-amber-950/60 text-amber-400'}`}>
                {f.severity.slice(0, 4)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-white font-medium truncate">{f.title || f.finding_id}</p>
                <p className="text-[11px] text-slate-500 truncate">{f.file_path}</p>
              </div>
              <div className="text-[10px] text-slate-600 whitespace-nowrap">{(f.confidence * 100).toFixed(0)}%</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function DedupView({ rootCauses, loading }: { rootCauses: RootCause[]; loading: boolean }) {
  if (loading) return <LoadingState />;
  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">Semantic Root Cause Clusters</h3>
        <span className="text-xs text-slate-500">{rootCauses.length} unique root causes</span>
      </div>
      <div className="space-y-2 max-h-80 overflow-y-auto">
        {rootCauses.map(rc => (
          <div key={rc.id} className="p-3 rounded-lg bg-slate-800/40 border border-slate-700/20">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-white">{rc.cluster_label}</span>
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${rc.max_severity === 'critical' ? 'bg-red-950/60 text-red-400' : rc.max_severity === 'high' ? 'bg-orange-950/60 text-orange-400' : 'bg-amber-950/60 text-amber-400'}`}>
                {rc.max_severity}
              </span>
            </div>
            <div className="flex items-center gap-4 text-[11px] text-slate-500">
              <span>{rc.finding_count} findings</span>
              <span>{rc.vuln_class.replace(/_/g, ' ')}</span>
              <span>Conf: {((rc.avg_confidence || 0) * 100).toFixed(0)}%</span>
              <span className={`ml-auto px-1.5 py-0.5 rounded text-[10px] ${rc.status === 'open' ? 'bg-red-950/30 text-red-400' : rc.status === 'patched' ? 'bg-green-950/30 text-green-400' : 'bg-amber-950/30 text-amber-400'}`}>
                {rc.status}
              </span>
            </div>
          </div>
        ))}
        {rootCauses.length === 0 && <EmptyState message="No root causes clustered yet. Run the deduplication pipeline." />}
      </div>
    </div>
  );
}

function ReachabilityView({ records, loading }: { records: ReachabilityRecord[]; loading: boolean }) {
  if (loading) return <LoadingState />;
  const reachable = records.filter(r => r.is_reachable);
  const unreachable = records.filter(r => !r.is_reachable);

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">Reachability Correlation</h3>
        <div className="flex items-center gap-3 text-xs">
          <span className="text-red-400">{reachable.length} reachable</span>
          <span className="text-slate-500">{unreachable.length} unreachable</span>
        </div>
      </div>

      {reachable.length > 0 && (
        <div className="bg-red-950/20 rounded-lg border border-red-500/20 p-3">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-red-400" />
            <span className="text-xs font-semibold text-red-400">Attacker-Reachable Vulnerabilities</span>
          </div>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {reachable.sort((a, b) => b.reachability_score - a.reachability_score).map(r => (
              <div key={r.id} className="flex items-center gap-3 text-xs">
                <div className="w-16">
                  <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
                    <div className="h-full rounded-full bg-gradient-to-r from-amber-500 to-red-500" style={{ width: `${r.reachability_score * 100}%` }} />
                  </div>
                </div>
                <span className="text-white font-mono text-[11px]">{(r.reachability_score * 100).toFixed(0)}%</span>
                <span className="text-slate-400 flex-1 truncate">{r.entry_point || 'Unknown endpoint'}</span>
                <span className="text-slate-600">{(r.traffic_volume_24h || 0).toLocaleString()} req/24h</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {records.length === 0 && <EmptyState message="No reachability analysis completed yet. Run the correlator." />}
    </div>
  );
}

function BlastRadiusView({ reachability, rootCauses, loading }: { reachability: ReachabilityRecord[]; rootCauses: RootCause[]; loading: boolean }) {
  if (loading) return <LoadingState />;
  const scored = reachability
    .filter(r => r.is_reachable)
    .sort((a, b) => b.reachability_score - a.reachability_score)
    .slice(0, 15);

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">Blast Radius Priority Ranking</h3>
        <span className="text-xs text-slate-500">Top threats by blast radius score</span>
      </div>

      <div className="space-y-2 max-h-72 overflow-y-auto">
        {scored.map((item, i) => {
          const priority = item.reachability_score >= 0.9 ? 'P1' : item.reachability_score >= 0.7 ? 'P2' : item.reachability_score >= 0.5 ? 'P3' : 'P4';
          const priorityColor = priority === 'P1' ? 'text-red-400 bg-red-950/40' : priority === 'P2' ? 'text-orange-400 bg-orange-950/40' : 'text-amber-400 bg-amber-950/40';
          return (
            <div key={item.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-slate-800/30 border border-slate-700/20">
              <span className="text-[11px] text-slate-600 w-5">#{i + 1}</span>
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${priorityColor}`}>{priority}</span>
              <span className="text-xs text-white flex-1 truncate">{item.entry_point || `Root cause ${item.root_cause_id?.slice(0, 8)}`}</span>
              <div className="w-20">
                <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                  <div className="h-full rounded-full bg-gradient-to-r from-cyan-500 via-amber-500 to-red-500" style={{ width: `${item.reachability_score * 100}%` }} />
                </div>
              </div>
              <span className="text-[11px] font-mono text-slate-400 w-10 text-right">{(item.reachability_score * 100).toFixed(0)}</span>
            </div>
          );
        })}
        {scored.length === 0 && <EmptyState message="No blast radius scores computed yet." />}
      </div>
    </div>
  );
}

function PatchView({ patches, wafRules, loading }: { patches: PatchRecord[]; wafRules: WafRule[]; loading: boolean }) {
  if (loading) return <LoadingState />;
  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">Auto-Patch & WAF Response</h3>
        <div className="flex items-center gap-3 text-xs">
          <span className="text-green-400">{patches.length} patches</span>
          <span className="text-cyan-400">{wafRules.filter(w => w.is_active).length} WAF rules</span>
        </div>
      </div>

      {patches.length > 0 && (
        <div>
          <span className="text-[11px] text-slate-500 uppercase tracking-wider">Generated Patches</span>
          <div className="mt-2 space-y-2 max-h-36 overflow-y-auto">
            {patches.map(p => (
              <div key={p.id} className="flex items-center gap-3 p-2 rounded-lg bg-slate-800/30 border border-slate-700/20 text-xs">
                <span className={`px-1.5 py-0.5 rounded text-[10px] ${p.patch_type === 'safe_additive' ? 'bg-green-950/40 text-green-400' : p.patch_type === 'virtual_patch' ? 'bg-cyan-950/40 text-cyan-400' : 'bg-amber-950/40 text-amber-400'}`}>
                  {p.patch_type?.replace(/_/g, ' ')}
                </span>
                <span className="text-slate-400 flex-1 truncate">{p.target_file || 'Unknown'}</span>
                {p.regression_test_passed === true && <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />}
                {p.regression_test_passed === false && <AlertTriangle className="w-3.5 h-3.5 text-red-400" />}
                {p.regression_test_passed === null && <Clock className="w-3.5 h-3.5 text-slate-500" />}
                <span className={`px-1.5 py-0.5 rounded text-[10px] ${p.review_status === 'approved' ? 'bg-green-950/30 text-green-400' : p.review_status === 'rejected' ? 'bg-red-950/30 text-red-400' : 'bg-slate-800 text-slate-500'}`}>
                  {p.review_status || 'pending'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {wafRules.length > 0 && (
        <div>
          <span className="text-[11px] text-slate-500 uppercase tracking-wider">Virtual Patches (WAF Rules)</span>
          <div className="mt-2 space-y-2 max-h-36 overflow-y-auto">
            {wafRules.map(w => (
              <div key={w.id} className="flex items-center gap-3 p-2 rounded-lg bg-slate-800/30 border border-slate-700/20 text-xs">
                <div className={`w-2 h-2 rounded-full ${w.is_active ? 'bg-green-400' : 'bg-slate-600'}`} />
                <span className="text-white flex-1 truncate">{w.rule_name}</span>
                <span className="text-slate-500">{w.target_endpoint || '*'}</span>
                <span className="text-cyan-400 font-mono">{(w.blocks_24h || 0).toLocaleString()} blocks</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {patches.length === 0 && wafRules.length === 0 && (
        <EmptyState message="No patches or WAF rules generated yet. Run the auto-patch pipeline." />
      )}
    </div>
  );
}

function LoadingState() {
  return (
    <div className="p-8 flex items-center justify-center">
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <div className="w-4 h-4 border-2 border-cyan-500/30 border-t-cyan-400 rounded-full animate-spin" />
        Loading pipeline data...
      </div>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="py-6 text-center text-xs text-slate-600">{message}</div>
  );
}
