import { useState, useEffect } from 'react';
import { Globe, Shield, Users, Lock, Activity, Layers, ArrowRight, RotateCcw, Bug, Zap } from 'lucide-react';
import { supabase } from '../lib/supabase';

type SubView = 'fusion' | 'detonation' | 'policy' | 'peerreview' | 'replay';

export function OmnigentMetaHarnessTab({ agents }: { agents?: unknown[] }) {
  const [subView, setSubView] = useState<SubView>('fusion');
  const [sessions, setSessions] = useState<any[]>([]);
  const [policies, setPolicies] = useState<any[]>([]);
  const [reviews, setReviews] = useState<any[]>([]);
  const [detonations, setDetonations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchData(); }, []);

  async function fetchData() {
    setLoading(true);
    const [a, b, c, d] = await Promise.all([
      supabase.from('omnigent_sessions').select('*').order('created_at', { ascending: false }).limit(10),
      supabase.from('omnigent_policies').select('*').order('priority', { ascending: true }),
      supabase.from('omnigent_peer_reviews').select('*').order('created_at', { ascending: false }).limit(10),
      supabase.from('omnigent_detonations').select('*').order('created_at', { ascending: false }).limit(10),
    ]);
    if (a.data) setSessions(a.data);
    if (b.data) setPolicies(b.data);
    if (c.data) setReviews(c.data);
    if (d.data) setDetonations(d.data);
    setLoading(false);
  }

  const subViews: { id: SubView; label: string; icon: typeof Globe }[] = [
    { id: 'fusion', label: 'Fusion War Room', icon: Layers },
    { id: 'detonation', label: 'Detonation Arena', icon: Bug },
    { id: 'policy', label: 'Policy Engine', icon: Shield },
    { id: 'peerreview', label: 'Peer Review', icon: Users },
    { id: 'replay', label: 'Temporal Replay', icon: RotateCcw },
  ];

  function renderAgents(val: unknown): string {
    if (Array.isArray(val)) return val.map(a => typeof a === 'object' ? (a as any).slug || (a as any).name || JSON.stringify(a) : a).join(', ');
    if (typeof val === 'string') return val;
    if (typeof val === 'object' && val !== null) return JSON.stringify(val);
    return String(val ?? '-');
  }

  return (
    <div className="h-full overflow-y-auto space-y-4 pr-1">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
            <Globe className="w-4 h-4 text-teal-400" /> Omnigent Meta-Harness
          </h3>
          <p className="text-[11px] text-slate-500 mt-0.5">Multi-harness composition, security policies, and collaborative agent control</p>
        </div>
        <button onClick={fetchData} className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-500/10 text-teal-300 rounded text-[10px] font-medium hover:bg-teal-500/20 transition-colors border border-teal-500/20">
          <RotateCcw className="w-3 h-3" /> Refresh
        </button>
      </div>

      <div className="flex gap-1 bg-slate-800/40 p-1 rounded-lg border border-slate-700/30 overflow-x-auto">
        {subViews.map(sv => (
          <button
            key={sv.id}
            onClick={() => setSubView(sv.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-all ${
              subView === sv.id
                ? 'bg-teal-500/20 text-teal-300 border border-teal-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/30'
            }`}
          >
            <sv.icon className="w-3.5 h-3.5" />
            {sv.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Activity className="w-5 h-5 text-teal-400 animate-spin" />
          <span className="ml-2 text-sm text-slate-400">Loading Omnigent data...</span>
        </div>
      ) : (
        <>
          {subView === 'fusion' && (
            <div className="space-y-3">
              <p className="text-[10px] text-slate-500">Active composition sessions where multiple agents are fused into collaborative units</p>
              {sessions.length === 0 ? (
                <div className="text-center py-8 text-xs text-slate-500">No active fusion sessions. Create a new multi-agent composition to get started.</div>
              ) : sessions.map(s => (
                <div key={s.id} className="bg-slate-800/30 border border-slate-700/30 rounded p-3 hover:border-teal-500/20 transition-all">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-xs font-semibold text-slate-200">{s.session_name}</h4>
                    <span className={`text-[10px] px-2 py-0.5 rounded ${
                      s.status === 'active' ? 'bg-emerald-500/20 text-emerald-300' :
                      s.status === 'composing' ? 'bg-blue-500/20 text-blue-300' :
                      s.status === 'paused' ? 'bg-amber-500/20 text-amber-300' :
                      s.status === 'completed' ? 'bg-slate-600/50 text-slate-400' :
                      'bg-slate-600/50 text-slate-400'
                    }`}>{s.status}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-[10px] text-slate-400">
                    <span className="flex items-center gap-1"><Layers className="w-3 h-3" />{s.session_type}</span>
                    <span className="flex items-center gap-1"><Lock className="w-3 h-3" />Trust L{s.trust_gate_level || '?'}</span>
                    <span className="flex items-center gap-1"><Zap className="w-3 h-3" />{s.sandbox_provider || 'default'}</span>
                    {s.total_cost_usd && <span className="text-emerald-400">${Number(s.total_cost_usd).toFixed(2)}</span>}
                    {s.token_count && <span>{Number(s.token_count).toLocaleString()} tokens</span>}
                  </div>
                  <div className="mt-2 text-[10px] text-slate-500">
                    Agents: {renderAgents(s.agents_composed)}
                  </div>
                  {s.policy_violations > 0 && (
                    <div className="mt-1 text-[10px] text-red-400">Policy violations: {s.policy_violations}</div>
                  )}
                </div>
              ))}
            </div>
          )}

          {subView === 'detonation' && (
            <div className="space-y-3">
              <p className="text-[10px] text-slate-500">Sandboxed detonation chambers for safely testing agent behavior under adversarial conditions</p>
              {detonations.length === 0 ? (
                <div className="text-center py-8 text-xs text-slate-500">No detonation tests running. Launch a sandboxed test to validate agent resilience.</div>
              ) : detonations.map(d => (
                <div key={d.id} className="bg-slate-800/30 border border-slate-700/30 rounded p-3">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-xs font-semibold text-slate-200">{d.scenario_name}</h4>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-400">Autonomy L{d.autonomy_level_tested}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded ${
                        d.passed === true ? 'bg-emerald-500/20 text-emerald-300' :
                        d.passed === false ? 'bg-red-500/20 text-red-300' :
                        'bg-amber-500/20 text-amber-300'
                      }`}>{d.passed === true ? 'PASSED' : d.passed === false ? 'FAILED' : 'RUNNING'}</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-3 text-[10px] text-slate-400">
                    <span>Agent: <span className="text-teal-300">{d.agent_under_test}</span></span>
                    <span>Sandbox: {d.sandbox_provider}</span>
                    <span>Type: {d.scenario_type}</span>
                    <span>Duration: {d.duration_seconds ? `${d.duration_seconds}s` : 'active'}</span>
                  </div>
                  {d.kill_switch_triggered && (
                    <div className="mt-1.5 text-[10px] text-red-400 flex items-center gap-1">
                      <Shield className="w-3 h-3" /> Kill switch activated
                    </div>
                  )}
                  {d.drift_from_baseline && (
                    <div className="mt-1 text-[10px] text-slate-500">Drift from baseline: <span className={Number(d.drift_from_baseline) > 20 ? 'text-red-400' : 'text-amber-400'}>{Number(d.drift_from_baseline).toFixed(1)}%</span></div>
                  )}
                  {d.trust_score_delta && (
                    <div className="mt-0.5 text-[10px] text-slate-500">Trust delta: <span className={Number(d.trust_score_delta) < 0 ? 'text-red-400' : 'text-emerald-400'}>{Number(d.trust_score_delta) > 0 ? '+' : ''}{Number(d.trust_score_delta).toFixed(1)}</span></div>
                  )}
                </div>
              ))}
            </div>
          )}

          {subView === 'policy' && (
            <div className="space-y-3">
              <p className="text-[10px] text-slate-500">Contextual security policies governing agent interactions and data access</p>
              {policies.length === 0 ? (
                <div className="text-center py-8 text-xs text-slate-500">No policies configured. Define guardrails for inter-agent communication.</div>
              ) : policies.map(p => (
                <div key={p.id} className="bg-slate-800/30 border border-slate-700/30 rounded p-3 flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="text-xs font-medium text-slate-200">{p.policy_name}</h4>
                      <span className="px-1.5 py-0.5 text-[10px] rounded bg-slate-700/50 text-slate-400">P{p.priority || 0}</span>
                    </div>
                    <div className="flex gap-3 text-[10px] text-slate-400">
                      <span>{p.policy_type}</span>
                      <span>Scope: {p.scope}</span>
                      <span>Handler: {p.handler || '—'}</span>
                      {p.violations_count > 0 && <span className="text-red-400">{p.violations_count} violations</span>}
                    </div>
                    {p.trigger_condition && (
                      <div className="mt-1 text-[10px] text-slate-500">Trigger: {p.trigger_condition}</div>
                    )}
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded ${p.is_active ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-600/50 text-slate-400'}`}>
                    {p.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
              ))}
            </div>
          )}

          {subView === 'peerreview' && (
            <div className="space-y-3">
              <p className="text-[10px] text-slate-500">Agent-to-agent peer review queue with human oversight integration</p>
              {reviews.length === 0 ? (
                <div className="text-center py-8 text-xs text-slate-500">No peer reviews in progress. Agent outputs are auto-approved when below risk thresholds.</div>
              ) : reviews.map(r => (
                <div key={r.id} className="bg-slate-800/30 border border-slate-700/30 rounded p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono text-teal-400">{r.reviewer_agent_slug}</span>
                      <ArrowRight className="w-3 h-3 text-slate-500" />
                      <span className="text-[10px] font-mono text-cyan-400">{r.author_agent_slug}</span>
                    </div>
                    <span className={`text-[10px] px-2 py-0.5 rounded ${
                      r.verdict === 'approved' ? 'bg-emerald-500/20 text-emerald-300' :
                      r.verdict === 'rejected' ? 'bg-red-500/20 text-red-300' :
                      r.verdict === 'needs_revision' ? 'bg-amber-500/20 text-amber-300' :
                      r.verdict === 'escalated' ? 'bg-orange-500/20 text-orange-300' :
                      'bg-slate-600/50 text-slate-400'
                    }`}>{r.verdict || 'pending'}</span>
                  </div>
                  <p className="text-[11px] text-slate-300 mb-2">{r.finding_summary}</p>
                  <div className="flex gap-3 text-[10px] text-slate-400">
                    <span>{r.finding_type}</span>
                    <span>Severity: <span className={r.severity === 'critical' ? 'text-red-400' : r.severity === 'high' ? 'text-orange-400' : 'text-slate-300'}>{r.severity}</span></span>
                    <span>Consensus: {r.consensus_score ? `${(Number(r.consensus_score) * 100).toFixed(0)}%` : '—'}</span>
                    {r.escalated_to_human && <span className="text-orange-400">Escalated</span>}
                  </div>
                  {r.review_reasoning && (
                    <p className="text-[10px] text-slate-500 mt-1.5 italic">{r.review_reasoning}</p>
                  )}
                </div>
              ))}
            </div>
          )}

          {subView === 'replay' && (
            <div className="bg-slate-800/30 border border-slate-700/30 rounded p-6 text-center">
              <RotateCcw className="w-8 h-8 text-teal-400 mx-auto mb-3" />
              <h4 className="text-sm font-semibold text-slate-200 mb-1">Session Timeline Replay</h4>
              <p className="text-xs text-slate-400 mb-4">Select a session from the Fusion War Room to replay its execution timeline</p>
              <div className="space-y-2">
                {sessions.length === 0 ? (
                  <p className="text-xs text-slate-500">No sessions available for replay</p>
                ) : sessions.slice(0, 5).map(s => (
                  <button key={s.id} className="w-full text-left px-3 py-2.5 rounded bg-slate-700/30 hover:bg-slate-700/50 transition-colors">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-300">{s.session_name}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${s.status === 'active' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-600/50 text-slate-400'}`}>{s.status}</span>
                    </div>
                    <div className="flex gap-3 mt-1 text-[10px] text-slate-500">
                      <span>{s.session_type}</span>
                      <span>{s.duration_seconds ? `${s.duration_seconds}s` : 'ongoing'}</span>
                      <span>{s.created_at ? new Date(s.created_at).toLocaleDateString() : ''}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
