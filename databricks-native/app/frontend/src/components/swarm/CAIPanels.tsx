import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Shield, Zap, Clock, Target, Activity, AlertTriangle, CheckCircle2,
  XCircle, TrendingUp, TrendingDown, Flame, ShieldCheck, Timer,
  Coins, BarChart3, Grid3x3, ArrowRight, Cpu, Lock, Bug,
  Gauge, CircleDot, Minus,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

type PatchValidation = {
  id: string;
  patch_name: string;
  target_cwe: string;
  service_name: string;
  availability_before: number;
  availability_after: number;
  security_score_before: number;
  security_score_after: number;
  latency_impact_ms: number;
  service_disrupted: boolean;
  rollback_required: boolean;
  validation_status: string;
  generation: number;
};

type CWEDifficulty = {
  id: string;
  cwe_id: string;
  cwe_name: string;
  category: string;
  red_success_rate: number;
  blue_patch_rate: number;
  avg_exploit_time_sec: number;
  avg_patch_time_sec: number;
  difficulty_tier: string;
  total_attempts: number;
};

type TokenCost = {
  id: string;
  side: string;
  agent_name: string;
  action_type: string;
  tokens_used: number;
  cost_usd: number;
  success: boolean;
  tokens_per_success: number;
  cumulative_tokens: number;
  cumulative_cost_usd: number;
  generation: number;
  tick: number;
};

type RaceCondition = {
  id: string;
  vulnerability_id: string;
  cwe_id: string;
  red_start_tick: number;
  blue_start_tick: number;
  red_complete_tick: number | null;
  blue_complete_tick: number | null;
  winner: string;
  margin_ticks: number;
  red_technique: string;
  blue_countermeasure: string;
  generation: number;
};

type DefenseScore = {
  id: string;
  defense_name: string;
  mitre_technique_blocked: string;
  security_effectiveness: number;
  availability_preserved: number;
  combined_score: number;
  false_positive_rate: number;
  mean_time_to_block_ms: number;
  collateral_damage: number;
  constraint_violations: number;
  generation: number;
  tick: number;
};

/* ============================================================
   1. Availability-Preserving Patch Validator
============================================================ */
export function PatchValidatorPanel() {
  const [patches, setPatches] = useState<PatchValidation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('swarm_patch_validations')
        .select('*')
        .order('generation', { ascending: true });
      if (data) setPatches(data);
      setLoading(false);
    })();
  }, []);

  const stats = useMemo(() => {
    if (!patches.length) return { pass: 0, fail: 0, degraded: 0, avgAvailDelta: 0, avgSecDelta: 0 };
    const pass = patches.filter(p => p.validation_status === 'pass').length;
    const fail = patches.filter(p => p.validation_status === 'fail').length;
    const degraded = patches.filter(p => p.validation_status === 'degraded').length;
    const avgAvailDelta = patches.reduce((s, p) => s + (p.availability_after - p.availability_before), 0) / patches.length;
    const avgSecDelta = patches.reduce((s, p) => s + (p.security_score_after - p.security_score_before), 0) / patches.length;
    return { pass, fail, degraded, avgAvailDelta, avgSecDelta };
  }, [patches]);

  if (loading) return <div className="p-6 text-slate-400 text-sm">Loading patch validations...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
          <Shield className="w-5 h-5 text-emerald-400" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-slate-200">Availability-Preserving Patch Validator</h3>
          <p className="text-[10px] text-slate-500 font-mono">
            CAI insight: defenders must patch WITHOUT breaking service uptime
          </p>
        </div>
      </div>

      <div className="grid grid-cols-5 gap-2">
        <StatBox label="Passed" value={stats.pass} color="emerald" icon={CheckCircle2} />
        <StatBox label="Failed" value={stats.fail} color="rose" icon={XCircle} />
        <StatBox label="Degraded" value={stats.degraded} color="amber" icon={AlertTriangle} />
        <StatBox label="Avg Avail Delta" value={`${stats.avgAvailDelta.toFixed(2)}%`} color={stats.avgAvailDelta >= 0 ? 'emerald' : 'rose'} icon={Activity} />
        <StatBox label="Avg Sec Gain" value={`+${stats.avgSecDelta.toFixed(1)}`} color="sky" icon={TrendingUp} />
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
        <div className="grid grid-cols-[1fr_80px_80px_80px_60px_70px_80px] gap-2 px-3 py-2 border-b border-slate-800 text-[10px] font-mono text-slate-500 uppercase tracking-wider">
          <span>Patch / Service</span>
          <span>Avail Before</span>
          <span>Avail After</span>
          <span>Sec Score</span>
          <span>Latency</span>
          <span>Status</span>
          <span>Impact</span>
        </div>
        <div className="max-h-72 overflow-y-auto custom-scrollbar">
          {patches.map(p => (
            <div key={p.id} className="grid grid-cols-[1fr_80px_80px_80px_60px_70px_80px] gap-2 px-3 py-2 border-b border-slate-800/50 hover:bg-slate-800/30 items-center">
              <div>
                <div className="text-[11px] font-semibold text-slate-200 truncate">{p.patch_name}</div>
                <div className="text-[9px] text-slate-500 font-mono">{p.service_name} / {p.target_cwe}</div>
              </div>
              <span className="text-[10px] font-mono text-emerald-300">{p.availability_before.toFixed(2)}%</span>
              <span className={`text-[10px] font-mono ${p.availability_after >= 99 ? 'text-emerald-300' : p.availability_after >= 97 ? 'text-amber-300' : 'text-rose-300'}`}>
                {p.availability_after.toFixed(2)}%
              </span>
              <div className="flex items-center gap-1 text-[10px] font-mono">
                <span className="text-slate-500">{p.security_score_before}</span>
                <ArrowRight className="w-2.5 h-2.5 text-slate-600" />
                <span className="text-sky-300">{p.security_score_after}</span>
              </div>
              <span className={`text-[10px] font-mono ${p.latency_impact_ms > 10 ? 'text-amber-300' : 'text-slate-400'}`}>
                +{p.latency_impact_ms.toFixed(1)}ms
              </span>
              <StatusBadge status={p.validation_status} />
              <div className="flex items-center gap-1">
                {p.service_disrupted && <span className="text-[8px] px-1 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30">DISRUPTED</span>}
                {p.rollback_required && <span className="text-[8px] px-1 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">ROLLBACK</span>}
                {!p.service_disrupted && !p.rollback_required && <span className="text-[8px] px-1 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">CLEAN</span>}
              </div>
            </div>
          ))}
        </div>
      </div>

      <AvailabilityChart patches={patches} />
    </div>
  );
}

function AvailabilityChart({ patches }: { patches: PatchValidation[] }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] text-slate-400 uppercase tracking-wider font-mono">Availability vs Security Tradeoff</span>
      </div>
      <div className="relative h-40">
        {patches.map((p, i) => {
          const x = ((p.security_score_after - 20) / 80) * 100;
          const y = 100 - ((p.availability_after - 90) / 10) * 100;
          const color = p.validation_status === 'pass' ? 'bg-emerald-400' : p.validation_status === 'fail' ? 'bg-rose-400' : 'bg-amber-400';
          return (
            <div
              key={p.id}
              className={`absolute w-3 h-3 rounded-full ${color} border-2 border-slate-900 shadow-lg transition-all hover:scale-150 group`}
              style={{ left: `${Math.max(2, Math.min(96, x))}%`, top: `${Math.max(2, Math.min(96, y))}%` }}
              title={`${p.patch_name}: Sec ${p.security_score_after} / Avail ${p.availability_after}%`}
            >
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-50">
                <div className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-[9px] text-slate-200 whitespace-nowrap">
                  {p.patch_name}
                </div>
              </div>
            </div>
          );
        })}
        <div className="absolute bottom-0 left-0 right-0 text-center text-[9px] text-slate-500 font-mono">Security Score →</div>
        <div className="absolute top-0 bottom-0 left-0 text-[9px] text-slate-500 font-mono" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>Availability % →</div>
        <div className="absolute top-2 right-2 text-[9px] text-emerald-400/60 font-mono">IDEAL ZONE</div>
        <div className="absolute bottom-2 left-2 text-[9px] text-rose-400/60 font-mono">DANGER ZONE</div>
        <div className="absolute inset-0 border-l border-b border-slate-700/50 rounded-bl-lg" />
      </div>
    </div>
  );
}

/* ============================================================
   2. CWE Difficulty Heatmap
============================================================ */
export function CWEHeatmapPanel() {
  const [cwes, setCwes] = useState<CWEDifficulty[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<'red_success_rate' | 'avg_exploit_time_sec' | 'total_attempts'>('red_success_rate');

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('swarm_cwe_difficulty')
        .select('*')
        .order('red_success_rate', { ascending: false });
      if (data) setCwes(data);
      setLoading(false);
    })();
  }, []);

  const categories = useMemo(() => {
    const cats = new Map<string, CWEDifficulty[]>();
    cwes.forEach(c => {
      const list = cats.get(c.category) || [];
      list.push(c);
      cats.set(c.category, list);
    });
    return cats;
  }, [cwes]);

  const sorted = useMemo(() => [...cwes].sort((a, b) => (b as any)[sortBy] - (a as any)[sortBy]), [cwes, sortBy]);

  if (loading) return <div className="p-6 text-slate-400 text-sm">Loading CWE data...</div>;

  const tierColor = (tier: string) => {
    switch (tier) {
      case 'trivial': return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
      case 'easy': return 'bg-sky-500/20 text-sky-300 border-sky-500/30';
      case 'medium': return 'bg-amber-500/20 text-amber-300 border-amber-500/30';
      case 'hard': return 'bg-orange-500/20 text-orange-300 border-orange-500/30';
      case 'extreme': return 'bg-rose-500/20 text-rose-300 border-rose-500/30';
      default: return 'bg-slate-500/20 text-slate-300 border-slate-500/30';
    }
  };

  const catColor = (cat: string) => {
    switch (cat) {
      case 'memory': return 'text-rose-300';
      case 'injection': return 'text-amber-300';
      case 'logic': return 'text-sky-300';
      case 'race': return 'text-fuchsia-300';
      case 'crypto': return 'text-teal-300';
      case 'auth': return 'text-emerald-300';
      default: return 'text-slate-300';
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-9 h-9 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center">
          <Grid3x3 className="w-5 h-5 text-amber-400" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-slate-200">CWE Difficulty Heatmap</h3>
          <p className="text-[10px] text-slate-500 font-mono">
            CAI insight: some CWEs are vastly easier for AI to exploit than others
          </p>
        </div>
      </div>

      <div className="grid grid-cols-6 gap-2">
        {Array.from(categories.entries()).map(([cat, items]) => {
          const avgSuccess = items.reduce((s, c) => s + c.red_success_rate, 0) / items.length;
          return (
            <div key={cat} className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
              <div className={`text-[10px] font-semibold uppercase tracking-wider mb-1 ${catColor(cat)}`}>{cat}</div>
              <div className="text-lg font-bold text-slate-200">{avgSuccess.toFixed(0)}%</div>
              <div className="text-[9px] text-slate-500">avg exploit rate</div>
              <div className="text-[9px] text-slate-400 mt-1">{items.length} CWEs</div>
            </div>
          );
        })}
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[10px] text-slate-400 uppercase tracking-wider font-mono">Exploit Success Heatmap</span>
          <div className="flex items-center gap-1">
            {[
              { key: 'red_success_rate' as const, label: 'Success %' },
              { key: 'avg_exploit_time_sec' as const, label: 'Time' },
              { key: 'total_attempts' as const, label: 'Attempts' },
            ].map(s => (
              <button
                key={s.key}
                onClick={() => setSortBy(s.key)}
                className={`px-2 py-0.5 rounded text-[9px] font-mono ${sortBy === s.key ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'text-slate-500 hover:text-slate-300'}`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-6 gap-1.5">
          {sorted.map(cwe => {
            const intensity = cwe.red_success_rate / 100;
            const hue = 120 - intensity * 120;
            return (
              <div
                key={cwe.id}
                className="rounded-lg p-2 border border-slate-700/50 hover:border-slate-600 transition-all cursor-default group relative"
                style={{ backgroundColor: `hsla(${hue}, 70%, 25%, ${0.3 + intensity * 0.4})` }}
              >
                <div className="text-[9px] font-mono font-bold text-slate-200">{cwe.cwe_id}</div>
                <div className="text-[8px] text-slate-400 truncate">{cwe.cwe_name}</div>
                <div className="text-[11px] font-bold mt-1" style={{ color: `hsl(${hue}, 80%, 65%)` }}>
                  {cwe.red_success_rate.toFixed(0)}%
                </div>
                <div className="absolute inset-0 hidden group-hover:flex items-center justify-center rounded-lg bg-slate-900/95 border border-slate-600 z-10 p-2">
                  <div className="text-center">
                    <div className="text-[10px] font-semibold text-slate-200">{cwe.cwe_id}: {cwe.cwe_name}</div>
                    <div className="text-[9px] text-slate-400 mt-1 space-y-0.5">
                      <div>Red: {cwe.red_success_rate}% | Blue: {cwe.blue_patch_rate}%</div>
                      <div>Exploit: {cwe.avg_exploit_time_sec.toFixed(0)}s | Patch: {cwe.avg_patch_time_sec.toFixed(0)}s</div>
                      <div>{cwe.total_attempts} attempts</div>
                    </div>
                    <div className={`inline-block mt-1 px-1.5 py-0.5 rounded text-[8px] font-bold border ${tierColor(cwe.difficulty_tier)}`}>
                      {cwe.difficulty_tier.toUpperCase()}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between mt-3 text-[9px] font-mono text-slate-500">
          <div className="flex items-center gap-2">
            <span>Exploit Difficulty:</span>
            <div className="flex items-center gap-1">
              <div className="w-12 h-2 rounded" style={{ background: 'linear-gradient(90deg, hsl(120,70%,35%), hsl(60,70%,35%), hsl(0,70%,35%))' }} />
              <span>Easy → Hard for AI</span>
            </div>
          </div>
          <span>{cwes.length} vulnerabilities tracked</span>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   3. Token Cost Efficiency Dashboard
============================================================ */
export function TokenCostPanel() {
  const [costs, setCosts] = useState<TokenCost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('swarm_token_costs')
        .select('*')
        .order('tick', { ascending: true });
      if (data) setCosts(data);
      setLoading(false);
    })();
  }, []);

  const redCosts = useMemo(() => costs.filter(c => c.side === 'red'), [costs]);
  const blueCosts = useMemo(() => costs.filter(c => c.side === 'blue'), [costs]);

  const redTotal = useMemo(() => redCosts.reduce((s, c) => s + c.tokens_used, 0), [redCosts]);
  const blueTotal = useMemo(() => blueCosts.reduce((s, c) => s + c.tokens_used, 0), [blueCosts]);
  const redSuccesses = useMemo(() => redCosts.filter(c => c.success).length, [redCosts]);
  const blueSuccesses = useMemo(() => blueCosts.filter(c => c.success).length, [blueCosts]);
  const redEfficiency = redSuccesses > 0 ? redTotal / redSuccesses : 0;
  const blueEfficiency = blueSuccesses > 0 ? blueTotal / blueSuccesses : 0;
  const redTotalCost = redCosts.reduce((s, c) => s + c.cost_usd, 0);
  const blueTotalCost = blueCosts.reduce((s, c) => s + c.cost_usd, 0);

  if (loading) return <div className="p-6 text-slate-400 text-sm">Loading token costs...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-9 h-9 rounded-lg bg-sky-500/10 border border-sky-500/30 flex items-center justify-center">
          <Coins className="w-5 h-5 text-sky-400" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-slate-200">Token Cost Efficiency Dashboard</h3>
          <p className="text-[10px] text-slate-500 font-mono">
            CAI insight: operational cost per successful exploit/patch reveals agent efficiency
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Flame className="w-4 h-4 text-rose-400" />
            <span className="text-xs font-semibold text-rose-300">Red Team (Attack)</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-[10px] text-slate-500 uppercase">Total Tokens</div>
              <div className="text-lg font-bold text-slate-200">{(redTotal / 1000).toFixed(1)}k</div>
            </div>
            <div>
              <div className="text-[10px] text-slate-500 uppercase">Total Cost</div>
              <div className="text-lg font-bold text-slate-200">${redTotalCost.toFixed(3)}</div>
            </div>
            <div>
              <div className="text-[10px] text-slate-500 uppercase">Success Rate</div>
              <div className="text-lg font-bold text-emerald-300">{redCosts.length > 0 ? ((redSuccesses / redCosts.length) * 100).toFixed(0) : 0}%</div>
            </div>
            <div>
              <div className="text-[10px] text-slate-500 uppercase">Tokens/Success</div>
              <div className="text-lg font-bold text-amber-300">{(redEfficiency / 1000).toFixed(1)}k</div>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-sky-500/30 bg-sky-500/5 p-4">
          <div className="flex items-center gap-2 mb-3">
            <ShieldCheck className="w-4 h-4 text-sky-400" />
            <span className="text-xs font-semibold text-sky-300">Blue Team (Defense)</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-[10px] text-slate-500 uppercase">Total Tokens</div>
              <div className="text-lg font-bold text-slate-200">{(blueTotal / 1000).toFixed(1)}k</div>
            </div>
            <div>
              <div className="text-[10px] text-slate-500 uppercase">Total Cost</div>
              <div className="text-lg font-bold text-slate-200">${blueTotalCost.toFixed(3)}</div>
            </div>
            <div>
              <div className="text-[10px] text-slate-500 uppercase">Success Rate</div>
              <div className="text-lg font-bold text-emerald-300">{blueCosts.length > 0 ? ((blueSuccesses / blueCosts.length) * 100).toFixed(0) : 0}%</div>
            </div>
            <div>
              <div className="text-[10px] text-slate-500 uppercase">Tokens/Success</div>
              <div className="text-lg font-bold text-amber-300">{(blueEfficiency / 1000).toFixed(1)}k</div>
            </div>
          </div>
        </div>
      </div>

      <CumulativeCostChart redCosts={redCosts} blueCosts={blueCosts} />

      <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
        <div className="grid grid-cols-[60px_1fr_90px_80px_60px_80px_80px] gap-2 px-3 py-2 border-b border-slate-800 text-[10px] font-mono text-slate-500 uppercase tracking-wider">
          <span>Side</span>
          <span>Agent / Action</span>
          <span>Tokens</span>
          <span>Cost</span>
          <span>Result</span>
          <span>Efficiency</span>
          <span>Cumulative</span>
        </div>
        <div className="max-h-48 overflow-y-auto custom-scrollbar">
          {costs.map(c => (
            <div key={c.id} className="grid grid-cols-[60px_1fr_90px_80px_60px_80px_80px] gap-2 px-3 py-2 border-b border-slate-800/50 hover:bg-slate-800/30 items-center">
              <span className={`text-[10px] font-bold ${c.side === 'red' ? 'text-rose-400' : 'text-sky-400'}`}>
                {c.side.toUpperCase()}
              </span>
              <div>
                <span className="text-[10px] font-semibold text-slate-200">{c.agent_name}</span>
                <span className="text-[9px] text-slate-500 ml-2">{c.action_type}</span>
              </div>
              <span className="text-[10px] font-mono text-slate-300">{c.tokens_used.toLocaleString()}</span>
              <span className="text-[10px] font-mono text-slate-300">${c.cost_usd.toFixed(4)}</span>
              <span>{c.success ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <XCircle className="w-3.5 h-3.5 text-rose-400" />}</span>
              <span className="text-[10px] font-mono text-amber-300">{c.tokens_per_success > 0 ? `${(c.tokens_per_success / 1000).toFixed(1)}k` : '-'}</span>
              <span className="text-[10px] font-mono text-slate-400">{(c.cumulative_tokens / 1000).toFixed(1)}k</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function CumulativeCostChart({ redCosts, blueCosts }: { redCosts: TokenCost[]; blueCosts: TokenCost[] }) {
  const maxTokens = Math.max(
    ...redCosts.map(c => c.cumulative_tokens),
    ...blueCosts.map(c => c.cumulative_tokens),
    1
  );
  const maxTick = Math.max(...redCosts.map(c => c.tick), ...blueCosts.map(c => c.tick), 1);

  const redPoints = redCosts.map(c => `${(c.tick / maxTick) * 100},${100 - (c.cumulative_tokens / maxTokens) * 90}`).join(' ');
  const bluePoints = blueCosts.map(c => `${(c.tick / maxTick) * 100},${100 - (c.cumulative_tokens / maxTokens) * 90}`).join(' ');

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] text-slate-400 uppercase tracking-wider font-mono">Cumulative Token Burn</span>
        <div className="flex items-center gap-3 text-[9px] font-mono">
          <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-rose-400 rounded" /> Red</span>
          <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-sky-400 rounded" /> Blue</span>
        </div>
      </div>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-28">
        <polyline points={redPoints} fill="none" stroke="#f43f5e" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        <polyline points={bluePoints} fill="none" stroke="#0ea5e9" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        {redCosts.filter(c => c.success).map((c, i) => (
          <circle key={`r-${i}`} cx={(c.tick / maxTick) * 100} cy={100 - (c.cumulative_tokens / maxTokens) * 90} r="1.5" fill="#f43f5e" />
        ))}
        {blueCosts.filter(c => c.success).map((c, i) => (
          <circle key={`b-${i}`} cx={(c.tick / maxTick) * 100} cy={100 - (c.cumulative_tokens / maxTokens) * 90} r="1.5" fill="#0ea5e9" />
        ))}
      </svg>
      <div className="flex items-center justify-between text-[9px] font-mono text-slate-500 mt-1">
        <span>Tick 0</span>
        <span>Dots = successful actions</span>
        <span>Tick {maxTick}</span>
      </div>
    </div>
  );
}

/* ============================================================
   4. Exploit Race Condition Timeline
============================================================ */
export function RaceTimelinePanel() {
  const [races, setRaces] = useState<RaceCondition[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('swarm_race_conditions')
        .select('*')
        .order('red_start_tick', { ascending: true });
      if (data) setRaces(data);
      setLoading(false);
    })();
  }, []);

  const stats = useMemo(() => {
    const redWins = races.filter(r => r.winner === 'red').length;
    const blueWins = races.filter(r => r.winner === 'blue').length;
    const draws = races.filter(r => r.winner === 'draw').length;
    const avgMargin = races.length > 0 ? races.reduce((s, r) => s + r.margin_ticks, 0) / races.length : 0;
    return { redWins, blueWins, draws, avgMargin };
  }, [races]);

  if (loading) return <div className="p-6 text-slate-400 text-sm">Loading race data...</div>;

  const maxTick = Math.max(...races.flatMap(r => [r.red_complete_tick || r.red_start_tick + 50, r.blue_complete_tick || r.blue_start_tick + 50]), 1);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-9 h-9 rounded-lg bg-rose-500/10 border border-rose-500/30 flex items-center justify-center">
          <Timer className="w-5 h-5 text-rose-400" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-slate-200">Exploit Race Condition Timeline</h3>
          <p className="text-[10px] text-slate-500 font-mono">
            CAI insight: red vs blue racing to exploit/patch the same vulnerability
          </p>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2">
        <StatBox label="Red Wins" value={stats.redWins} color="rose" icon={Flame} />
        <StatBox label="Blue Wins" value={stats.blueWins} color="sky" icon={ShieldCheck} />
        <StatBox label="Draws" value={stats.draws} color="slate" icon={Minus} />
        <StatBox label="Avg Margin" value={`${stats.avgMargin.toFixed(1)} ticks`} color="amber" icon={Timer} />
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[10px] text-slate-400 uppercase tracking-wider font-mono">Race Timeline</span>
          <div className="flex items-center gap-3 text-[9px] font-mono">
            <span className="flex items-center gap-1"><span className="w-3 h-1 bg-rose-400 rounded" /> Red (exploit)</span>
            <span className="flex items-center gap-1"><span className="w-3 h-1 bg-sky-400 rounded" /> Blue (patch)</span>
            <span className="flex items-center gap-1"><CircleDot className="w-2.5 h-2.5 text-emerald-400" /> Complete</span>
          </div>
        </div>

        <div className="space-y-3">
          {races.map(race => {
            const startMin = Math.min(race.red_start_tick, race.blue_start_tick);
            const endMax = Math.max(race.red_complete_tick || startMin + 40, race.blue_complete_tick || startMin + 40);
            const range = endMax - startMin || 1;

            const redStart = ((race.red_start_tick - startMin) / range) * 100;
            const redEnd = race.red_complete_tick ? ((race.red_complete_tick - startMin) / range) * 100 : null;
            const blueStart = ((race.blue_start_tick - startMin) / range) * 100;
            const blueEnd = race.blue_complete_tick ? ((race.blue_complete_tick - startMin) / range) * 100 : null;

            return (
              <div key={race.id} className={`rounded-lg border p-3 ${
                race.winner === 'red' ? 'border-rose-500/30 bg-rose-500/5' :
                race.winner === 'blue' ? 'border-sky-500/30 bg-sky-500/5' :
                'border-slate-700 bg-slate-800/30'
              }`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono font-bold text-slate-200">{race.vulnerability_id}</span>
                    <span className="text-[9px] font-mono text-slate-500">{race.cwe_id}</span>
                  </div>
                  <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold border ${
                    race.winner === 'red' ? 'bg-rose-500/20 text-rose-300 border-rose-500/30' :
                    race.winner === 'blue' ? 'bg-sky-500/20 text-sky-300 border-sky-500/30' :
                    'bg-slate-700/50 text-slate-300 border-slate-600'
                  }`}>
                    {race.winner === 'red' ? <Flame className="w-2.5 h-2.5" /> : race.winner === 'blue' ? <ShieldCheck className="w-2.5 h-2.5" /> : null}
                    {race.winner.toUpperCase()} {race.margin_ticks > 0 ? `+${race.margin_ticks}t` : ''}
                  </div>
                </div>

                <div className="relative h-8 bg-slate-800/80 rounded overflow-hidden">
                  <div
                    className="absolute top-1 h-2.5 rounded bg-gradient-to-r from-rose-500 to-rose-400"
                    style={{ left: `${redStart}%`, width: `${(redEnd || 80) - redStart}%` }}
                  />
                  {redEnd && (
                    <div className="absolute top-1 w-2.5 h-2.5 rounded-full bg-rose-300 border border-rose-600" style={{ left: `calc(${redEnd}% - 5px)` }} />
                  )}
                  {!race.red_complete_tick && (
                    <div className="absolute top-1.5 text-[7px] text-rose-300 font-mono" style={{ left: `${redStart + 30}%` }}>FAILED</div>
                  )}
                  <div
                    className="absolute bottom-1 h-2.5 rounded bg-gradient-to-r from-sky-500 to-sky-400"
                    style={{ left: `${blueStart}%`, width: `${(blueEnd || 80) - blueStart}%` }}
                  />
                  {blueEnd && (
                    <div className="absolute bottom-1 w-2.5 h-2.5 rounded-full bg-sky-300 border border-sky-600" style={{ left: `calc(${blueEnd}% - 5px)` }} />
                  )}
                  {!race.blue_complete_tick && (
                    <div className="absolute bottom-1.5 text-[7px] text-sky-300 font-mono" style={{ left: `${blueStart + 30}%` }}>FAILED</div>
                  )}
                </div>

                <div className="flex items-center justify-between mt-1.5 text-[9px] font-mono text-slate-500">
                  <span className="truncate flex-1 text-rose-300/70">{race.red_technique}</span>
                  <span className="text-slate-600 mx-2">vs</span>
                  <span className="truncate flex-1 text-right text-sky-300/70">{race.blue_countermeasure}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   5. Constraint-Aware Defense Scoring
============================================================ */
export function DefenseScoringPanel() {
  const [scores, setScores] = useState<DefenseScore[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('swarm_defense_scores')
        .select('*')
        .order('combined_score', { ascending: false });
      if (data) setScores(data);
      setLoading(false);
    })();
  }, []);

  const avgCombined = useMemo(() => scores.length ? scores.reduce((s, d) => s + d.combined_score, 0) / scores.length : 0, [scores]);
  const topDefense = scores[0];
  const worstAvail = useMemo(() => scores.length ? [...scores].sort((a, b) => a.availability_preserved - b.availability_preserved)[0] : null, [scores]);
  const totalViolations = useMemo(() => scores.reduce((s, d) => s + d.constraint_violations, 0), [scores]);

  if (loading) return <div className="p-6 text-slate-400 text-sm">Loading defense scores...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-9 h-9 rounded-lg bg-sky-500/10 border border-sky-500/30 flex items-center justify-center">
          <Gauge className="w-5 h-5 text-sky-400" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-slate-200">Constraint-Aware Defense Scoring</h3>
          <p className="text-[10px] text-slate-500 font-mono">
            CAI insight: score defenses on BOTH security AND availability preservation
          </p>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2">
        <StatBox label="Avg Combined" value={`${avgCombined.toFixed(1)}%`} color="sky" icon={BarChart3} />
        <StatBox label="Top Defense" value={topDefense?.combined_score.toFixed(0) + '%' || '-'} color="emerald" icon={Shield} />
        <StatBox label="Worst Avail" value={worstAvail ? `${worstAvail.availability_preserved.toFixed(0)}%` : '-'} color="rose" icon={AlertTriangle} />
        <StatBox label="Violations" value={totalViolations} color="amber" icon={XCircle} />
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[10px] text-slate-400 uppercase tracking-wider font-mono">Defense Matrix</span>
          <span className="text-[9px] text-slate-500 font-mono">Combined = 0.6*Security + 0.4*Availability</span>
        </div>

        <div className="space-y-2">
          {scores.map(d => {
            const secColor = d.security_effectiveness >= 85 ? 'bg-emerald-400' : d.security_effectiveness >= 70 ? 'bg-sky-400' : 'bg-amber-400';
            const availColor = d.availability_preserved >= 98 ? 'bg-emerald-400' : d.availability_preserved >= 95 ? 'bg-amber-400' : 'bg-rose-400';
            return (
              <div key={d.id} className="rounded-lg border border-slate-800 bg-slate-900/40 p-3 hover:border-slate-700 transition-all">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <span className="text-[11px] font-semibold text-slate-200">{d.defense_name}</span>
                    <span className="text-[9px] text-slate-500 font-mono ml-2">{d.mitre_technique_blocked}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {d.constraint_violations > 0 && (
                      <span className="text-[8px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                        {d.constraint_violations} violations
                      </span>
                    )}
                    <span className={`text-sm font-bold ${d.combined_score >= 90 ? 'text-emerald-300' : d.combined_score >= 80 ? 'text-sky-300' : 'text-amber-300'}`}>
                      {d.combined_score.toFixed(0)}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="flex items-center justify-between text-[9px] mb-1">
                      <span className="text-slate-500">Security</span>
                      <span className="text-slate-300">{d.security_effectiveness.toFixed(0)}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
                      <div className={`h-full ${secColor}`} style={{ width: `${d.security_effectiveness}%` }} />
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between text-[9px] mb-1">
                      <span className="text-slate-500">Availability</span>
                      <span className="text-slate-300">{d.availability_preserved.toFixed(1)}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
                      <div className={`h-full ${availColor}`} style={{ width: `${d.availability_preserved}%` }} />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 mt-2 text-[9px] font-mono text-slate-500">
                  <span>FP: {d.false_positive_rate.toFixed(1)}%</span>
                  <span>MTTB: {d.mean_time_to_block_ms >= 1000 ? `${(d.mean_time_to_block_ms / 1000).toFixed(1)}s` : `${d.mean_time_to_block_ms.toFixed(0)}ms`}</span>
                  <span>Collateral: {d.collateral_damage.toFixed(1)}%</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   Shared Components
============================================================ */
function StatBox({ label, value, color, icon: Icon }: { label: string; value: string | number; color: string; icon: typeof Shield }) {
  const colorMap: Record<string, { border: string; bg: string; text: string; icon: string }> = {
    emerald: { border: 'border-emerald-500/30', bg: 'bg-emerald-500/5', text: 'text-emerald-300', icon: 'text-emerald-400' },
    rose: { border: 'border-rose-500/30', bg: 'bg-rose-500/5', text: 'text-rose-300', icon: 'text-rose-400' },
    amber: { border: 'border-amber-500/30', bg: 'bg-amber-500/5', text: 'text-amber-300', icon: 'text-amber-400' },
    sky: { border: 'border-sky-500/30', bg: 'bg-sky-500/5', text: 'text-sky-300', icon: 'text-sky-400' },
    slate: { border: 'border-slate-600/50', bg: 'bg-slate-800/30', text: 'text-slate-300', icon: 'text-slate-400' },
  };
  const c = colorMap[color] || colorMap.slate;
  return (
    <div className={`rounded-lg border ${c.border} ${c.bg} p-3`}>
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className={`w-3.5 h-3.5 ${c.icon}`} />
        <span className="text-[9px] text-slate-500 uppercase tracking-wider">{label}</span>
      </div>
      <div className={`text-lg font-bold ${c.text}`}>{value}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    fail: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
    degraded: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  };
  return (
    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${styles[status] || styles.pass}`}>
      {status.toUpperCase()}
    </span>
  );
}
