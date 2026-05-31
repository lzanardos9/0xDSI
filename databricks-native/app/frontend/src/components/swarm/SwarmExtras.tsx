import { useEffect, useMemo, useRef, useState } from 'react';
import {
  X, Flame, ShieldCheck, Crown, Dna, Network, CircuitBoard, Brain,
  Sparkles, Download, Play, Copy, Check, FileCode2, BookOpen, Target,
  Layers, Zap, Crosshair, Binary, Radar, Activity, ChevronRight, Server,
  Users, Building2, Cloud, Factory, Globe, Cpu, Database,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

export type Side = 'red' | 'blue';

export type Champion = {
  id: string;
  side: Side;
  name: string;
  code: string;
  trait: string;
  fitness: number;
  generation: number;
  gene: number[];
  description: string;
  promoted: boolean;
};

export type Battlefield = {
  id: string;
  code: string;
  name: string;
  category: string;
  difficulty: string;
  description: string;
  asset_count: number;
  user_count: number;
  surface_area: string;
  mitre_techniques: string[];
  kill_chain_stages: string[];
  red_strategies: Array<{ name: string; weight: number }>;
  blue_countermeasures: Array<{ name: string; weight: number }>;
  topology: Record<string, unknown>;
  real_world_reference: string | null;
};

const CATEGORY_ICON: Record<string, typeof Server> = {
  'asset-network': Building2,
  'social-engineering': Users,
  'application-exploit': Cpu,
  'supply-chain': Network,
  'insider-threat': Users,
  'cloud-posture': Cloud,
  'ot-ics': Factory,
  'apt-campaign': Globe,
  'ai-security': Brain,
};

const CATEGORY_COLOR: Record<string, { bar: string; border: string; chip: string; text: string }> = {
  'asset-network': { bar: 'from-amber-500 to-orange-500', border: 'border-amber-500/40', chip: 'bg-amber-500/10', text: 'text-amber-300' },
  'social-engineering': { bar: 'from-rose-500 to-pink-500', border: 'border-rose-500/40', chip: 'bg-rose-500/10', text: 'text-rose-300' },
  'application-exploit': { bar: 'from-emerald-500 to-teal-500', border: 'border-emerald-500/40', chip: 'bg-emerald-500/10', text: 'text-emerald-300' },
  'supply-chain': { bar: 'from-sky-500 to-cyan-500', border: 'border-sky-500/40', chip: 'bg-sky-500/10', text: 'text-sky-300' },
  'insider-threat': { bar: 'from-yellow-500 to-amber-500', border: 'border-yellow-500/40', chip: 'bg-yellow-500/10', text: 'text-yellow-300' },
  'cloud-posture': { bar: 'from-blue-500 to-sky-500', border: 'border-blue-500/40', chip: 'bg-blue-500/10', text: 'text-blue-300' },
  'ot-ics': { bar: 'from-orange-500 to-red-500', border: 'border-orange-500/40', chip: 'bg-orange-500/10', text: 'text-orange-300' },
  'apt-campaign': { bar: 'from-rose-600 to-red-600', border: 'border-rose-500/40', chip: 'bg-rose-500/10', text: 'text-rose-300' },
  'ai-security': { bar: 'from-teal-500 to-emerald-500', border: 'border-teal-500/40', chip: 'bg-teal-500/10', text: 'text-teal-300' },
};

/* ============================================================
   Battlefield Selector
============================================================ */
export function BattlefieldSelector({
  selected,
  onSelect,
}: {
  selected: Battlefield | null;
  onSelect: (b: Battlefield) => void;
}) {
  const [battlefields, setBattlefields] = useState<Battlefield[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('swarm_battlefields')
        .select('*')
        .eq('is_active', true)
        .order('difficulty', { ascending: false });
      if (data) setBattlefields(data as Battlefield[]);
      setLoading(false);
    })();
  }, []);

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
          <Crosshair className="w-4 h-4 text-amber-400" /> Battlefield
        </div>
        <div className="text-[10px] text-slate-500 font-mono">
          {battlefields.length} scenarios
        </div>
      </div>
      {selected && (
        <div className="mb-3 p-3 rounded-lg bg-slate-950/70 border border-amber-500/30">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-semibold text-amber-300">RUNNING AGAINST</span>
            <span className="text-[10px] font-mono text-slate-500">{selected.code}</span>
          </div>
          <div className="text-sm font-semibold text-slate-100">{selected.name}</div>
          <div className="text-[10px] text-slate-400 mt-0.5">
            {selected.asset_count.toLocaleString()} assets / {selected.user_count.toLocaleString()} users / {selected.surface_area}
          </div>
        </div>
      )}
      {loading ? (
        <div className="text-[11px] text-slate-500 py-4 text-center">Loading scenarios...</div>
      ) : (
        <div className="space-y-1.5 max-h-[420px] overflow-y-auto custom-scrollbar">
          {battlefields.map((b) => {
            const Icon = CATEGORY_ICON[b.category] || Server;
            const color = CATEGORY_COLOR[b.category] || CATEGORY_COLOR['asset-network'];
            const isSelected = selected?.id === b.id;
            return (
              <button
                key={b.id}
                onClick={() => onSelect(b)}
                className={`w-full text-left p-2.5 rounded-lg border transition-all ${
                  isSelected
                    ? `${color.border} ${color.chip}`
                    : 'border-slate-800 bg-slate-950/40 hover:bg-slate-900/60'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Icon className={`w-4 h-4 ${color.text}`} />
                  <span className="text-[11px] font-semibold text-slate-200 flex-1 truncate">
                    {b.name}
                  </span>
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${
                    b.difficulty === 'expert'
                      ? 'bg-rose-500/20 text-rose-300'
                      : b.difficulty === 'hard'
                      ? 'bg-amber-500/20 text-amber-300'
                      : 'bg-emerald-500/20 text-emerald-300'
                  }`}>
                    {b.difficulty}
                  </span>
                </div>
                <div className="text-[10px] text-slate-400 mt-1 line-clamp-2">
                  {b.description}
                </div>
                <div className="flex items-center gap-2 mt-1.5 text-[9px] font-mono text-slate-500">
                  <span>{b.asset_count.toLocaleString()} assets</span>
                  <span>·</span>
                  <span>{b.user_count.toLocaleString()} users</span>
                  <span>·</span>
                  <span>{b.mitre_techniques.length} TTPs</span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ============================================================
   Champion Detail Modal — WOW FACTOR
============================================================ */
type DetailTab = 'overview' | 'micropattern' | 'embedding' | 'transformer' | 'detection';

export function ChampionDetailModal({
  champion,
  battlefield,
  onClose,
}: {
  champion: Champion;
  battlefield: Battlefield | null;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<DetailTab>('overview');
  const sideColor = champion.side === 'red' ? 'rose' : 'sky';

  const tabs: Array<{ id: DetailTab; label: string; icon: typeof Dna }> = [
    { id: 'overview', label: 'Overview', icon: Crown },
    { id: 'micropattern', label: 'Micro-Pattern', icon: Network },
    { id: 'embedding', label: 'Embedding Space', icon: Dna },
    { id: 'transformer', label: 'Transformer', icon: CircuitBoard },
    { id: 'detection', label: 'Detection-as-Code', icon: FileCode2 },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-6xl max-h-[92vh] rounded-2xl border border-slate-800 bg-slate-950 shadow-2xl overflow-hidden flex flex-col">
        <div className={`px-6 py-4 border-b border-slate-800 bg-gradient-to-r ${
          champion.side === 'red'
            ? 'from-rose-950 via-slate-950 to-slate-950'
            : 'from-sky-950 via-slate-950 to-slate-950'
        }`}>
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-14 h-14 rounded-xl flex items-center justify-center bg-gradient-to-br ${
                champion.side === 'red'
                  ? 'from-rose-600 via-rose-500 to-amber-500'
                  : 'from-sky-600 via-sky-500 to-cyan-400'
              }`}>
                {champion.side === 'red'
                  ? <Flame className="w-7 h-7 text-slate-950" strokeWidth={2.5} />
                  : <ShieldCheck className="w-7 h-7 text-slate-950" strokeWidth={2.5} />}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-bold text-slate-100">{champion.name}</h2>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded bg-${sideColor}-500/20 text-${sideColor}-300 border border-${sideColor}-500/30 uppercase`}>
                    {champion.side} Champion
                  </span>
                  {champion.promoted && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      <Sparkles className="w-3 h-3" /> PROMOTED
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-slate-400 mt-1 font-mono">
                  {champion.code} · Generation {champion.generation} · Fitness {(champion.fitness * 100).toFixed(1)}%
                </div>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center justify-center"
            >
              <X className="w-5 h-5 text-slate-300" />
            </button>
          </div>
        </div>

        <div className="px-6 py-2 border-b border-slate-800 bg-slate-900/50 flex gap-1 overflow-x-auto">
          {tabs.map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap flex items-center gap-1.5 transition-colors ${
                  active
                    ? 'bg-slate-800 text-slate-100'
                    : 'text-slate-400 hover:bg-slate-800/50'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {t.label}
              </button>
            );
          })}
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
          {tab === 'overview' && <OverviewTab champion={champion} battlefield={battlefield} />}
          {tab === 'micropattern' && <MicroPatternTab champion={champion} />}
          {tab === 'embedding' && <EmbeddingTab champion={champion} />}
          {tab === 'transformer' && <TransformerTab champion={champion} />}
          {tab === 'detection' && <DetectionTab champion={champion} battlefield={battlefield} />}
        </div>
      </div>
    </div>
  );
}

function OverviewTab({ champion, battlefield }: { champion: Champion; battlefield: Battlefield | null }) {
  const traits = ['Stealth', 'Speed', 'Payload', 'Persistence', 'Evasion', 'Lateral', 'C2', 'Impact'];
  return (
    <div className="space-y-4">
      <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/60">
        <div className="text-[11px] uppercase tracking-wider text-slate-400 mb-2">Evolution Summary</div>
        <p className="text-sm text-slate-200 leading-relaxed">{champion.description}</p>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <StatBox label="Fitness" value={`${(champion.fitness * 100).toFixed(1)}%`} icon={Target} color="amber" />
        <StatBox label="Generation" value={champion.generation.toString()} icon={Dna} color="emerald" />
        <StatBox label="Code" value={champion.code} icon={Binary} color="sky" />
        <StatBox label="Trait" value={champion.trait} icon={Zap} color="rose" />
      </div>

      <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/60">
        <div className="text-[11px] uppercase tracking-wider text-slate-400 mb-3">Gene Vector (8-dim trait DNA)</div>
        <div className="space-y-2">
          {champion.gene.map((g, i) => (
            <div key={i} className="flex items-center gap-3">
              <span className="w-20 text-[10px] font-mono text-slate-400">{traits[i]}</span>
              <div className="flex-1 h-2 rounded-full bg-slate-800 overflow-hidden">
                <div
                  className={`h-full bg-gradient-to-r ${
                    champion.side === 'red'
                      ? 'from-rose-600 to-amber-400'
                      : 'from-sky-600 to-cyan-400'
                  }`}
                  style={{ width: `${(g * 100).toFixed(0)}%` }}
                />
              </div>
              <span className="w-12 text-right text-[10px] font-mono text-slate-300">{g.toFixed(3)}</span>
            </div>
          ))}
        </div>
      </div>

      {battlefield && (
        <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/5">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-amber-300 mb-2">
            <Crosshair className="w-3.5 h-3.5" /> Battlefield Engagement
          </div>
          <div className="text-sm font-semibold text-slate-100">{battlefield.name}</div>
          <div className="text-[11px] text-slate-400 mt-1">{battlefield.description}</div>
          <div className="mt-3 text-[10px] uppercase tracking-wider text-slate-400 mb-1.5">
            {champion.side === 'red' ? 'Aligned Strategies' : 'Aligned Countermeasures'}
          </div>
          <div className="space-y-1.5">
            {(champion.side === 'red' ? battlefield.red_strategies : battlefield.blue_countermeasures).map((s, i) => (
              <div key={i} className="flex items-center gap-2 text-[10px] font-mono">
                <span className="flex-1 truncate text-slate-300">{s.name}</span>
                <div className="w-24 h-1 rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className={`h-full bg-gradient-to-r ${
                      champion.side === 'red' ? 'from-rose-500 to-amber-400' : 'from-sky-500 to-cyan-400'
                    }`}
                    style={{ width: `${(s.weight * 100).toFixed(0)}%` }}
                  />
                </div>
                <span className="w-10 text-right text-slate-400">{(s.weight * 100).toFixed(0)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatBox({ label, value, icon: Icon, color }: {
  label: string; value: string; icon: typeof Target; color: 'amber' | 'emerald' | 'sky' | 'rose';
}) {
  const colorMap = {
    amber: { border: 'border-amber-500/30', bg: 'bg-amber-500/5', text: 'text-amber-300' },
    emerald: { border: 'border-emerald-500/30', bg: 'bg-emerald-500/5', text: 'text-emerald-300' },
    sky: { border: 'border-sky-500/30', bg: 'bg-sky-500/5', text: 'text-sky-300' },
    rose: { border: 'border-rose-500/30', bg: 'bg-rose-500/5', text: 'text-rose-300' },
  };
  const c = colorMap[color];
  return (
    <div className={`p-3 rounded-xl border ${c.border} ${c.bg}`}>
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className={`w-3.5 h-3.5 ${c.text}`} />
        <span className="text-[10px] uppercase tracking-wider text-slate-400">{label}</span>
      </div>
      <div className="text-lg font-bold text-slate-100 truncate">{value}</div>
    </div>
  );
}

/* ============================================================
   Micro-Pattern tab — animated graph topology
============================================================ */
function MicroPatternTab({ champion }: { champion: Champion }) {
  const nodes = useMemo(() => {
    const seed = champion.gene.reduce((s, g) => s + g, 0);
    const names = champion.side === 'red'
      ? ['Phish', 'Payload', 'Beacon', 'Creds', 'LateralSMB', 'Persist', 'Exfil', 'Impact']
      : ['Login', 'UEBA', 'EDR', 'Network', 'Deception', 'SOAR', 'Isolate', 'Report'];
    return names.map((n, i) => ({
      id: i,
      label: n,
      x: 100 + Math.cos((i / names.length) * Math.PI * 2 + seed) * 180,
      y: 200 + Math.sin((i / names.length) * Math.PI * 2 + seed) * 140,
      weight: champion.gene[i] || 0.5,
    }));
  }, [champion]);

  const edges = useMemo(() => {
    const e: Array<{ from: number; to: number; w: number }> = [];
    for (let i = 0; i < nodes.length; i++) {
      const next = (i + 1) % nodes.length;
      e.push({ from: i, to: next, w: 0.6 + champion.gene[i] * 0.4 });
      if (i < nodes.length - 2 && champion.gene[i] > 0.5) {
        e.push({ from: i, to: (i + 2) % nodes.length, w: champion.gene[i] * 0.5 });
      }
    }
    return e;
  }, [nodes, champion]);

  const [pulse, setPulse] = useState(0);
  useEffect(() => {
    const i = setInterval(() => setPulse((p) => (p + 1) % nodes.length), 500);
    return () => clearInterval(i);
  }, [nodes.length]);

  const strokeColor = champion.side === 'red' ? '#f43f5e' : '#0ea5e9';
  const glow = champion.side === 'red' ? '#fb7185' : '#38bdf8';

  return (
    <div className="space-y-4">
      <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/60">
        <div className="text-[11px] uppercase tracking-wider text-slate-400 mb-1">Micro-Graph Pattern</div>
        <div className="text-sm font-semibold text-slate-100">
          {champion.side === 'red'
            ? `${nodes[0].label} → ${nodes[1].label} → ${nodes[2].label} → ${nodes[nodes.length - 1].label}`
            : `${nodes[0].label} ⇥ ${nodes[1].label} ⇥ ${nodes[nodes.length - 2].label}`}
        </div>
        <div className="text-[11px] text-slate-400 mt-1">
          {nodes.length}-node cyclic topology with {edges.length} edges, derived from genome weight distribution.
        </div>
      </div>

      <div className="rounded-xl border border-slate-800 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-4">
        <svg viewBox="0 0 600 400" className="w-full">
          <defs>
            <filter id="glow">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          {edges.map((e, i) => {
            const a = nodes[e.from];
            const b = nodes[e.to];
            const active = e.from === pulse;
            return (
              <g key={i}>
                <line
                  x1={a.x + 200} y1={a.y}
                  x2={b.x + 200} y2={b.y}
                  stroke={strokeColor}
                  strokeWidth={active ? 2.5 : 1}
                  opacity={active ? 0.9 : 0.3}
                  strokeDasharray={active ? '0' : '4 4'}
                />
                {active && (
                  <circle r={4} fill={glow} filter="url(#glow)">
                    <animate
                      attributeName="cx"
                      values={`${a.x + 200};${b.x + 200}`}
                      dur="0.5s"
                      fill="freeze"
                    />
                    <animate
                      attributeName="cy"
                      values={`${a.y};${b.y}`}
                      dur="0.5s"
                      fill="freeze"
                    />
                  </circle>
                )}
              </g>
            );
          })}
          {nodes.map((n) => {
            const active = n.id === pulse;
            return (
              <g key={n.id}>
                <circle
                  cx={n.x + 200}
                  cy={n.y}
                  r={18 + n.weight * 8}
                  fill={strokeColor}
                  opacity={active ? 0.35 : 0.12}
                  filter={active ? 'url(#glow)' : undefined}
                />
                <circle
                  cx={n.x + 200}
                  cy={n.y}
                  r={10 + n.weight * 4}
                  fill="#0f172a"
                  stroke={strokeColor}
                  strokeWidth={active ? 2 : 1}
                />
                <text
                  x={n.x + 200}
                  y={n.y + 4}
                  textAnchor="middle"
                  fill="#e2e8f0"
                  fontSize="9"
                  fontFamily="monospace"
                >
                  {n.label}
                </text>
              </g>
            );
          })}
        </svg>
        <div className="flex items-center justify-between mt-2 text-[10px] font-mono text-slate-400">
          <span className="flex items-center gap-1"><Activity className="w-3 h-3" /> Live trace simulation</span>
          <span>Signal at node {nodes[pulse]?.label}</span>
          <span>{edges.length} edges · avg weight {(edges.reduce((s, e) => s + e.w, 0) / edges.length).toFixed(2)}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="p-3 rounded-xl border border-slate-800 bg-slate-900/60">
          <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-2">Graph Provenance</div>
          <div className="space-y-1.5 text-[11px] font-mono">
            <div className="flex justify-between"><span className="text-slate-400">Motif Type</span><span className="text-slate-200">{champion.side === 'red' ? 'Kill-Chain DAG' : 'Defense Funnel'}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Support Count</span><span className="text-amber-300">{Math.floor(100 + champion.fitness * 900)}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Confidence</span><span className="text-emerald-300">{(champion.fitness * 0.9 + 0.1).toFixed(3)}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Novelty</span><span className="text-sky-300">{(champion.gene[0] * 0.7 + 0.3).toFixed(3)}</span></div>
          </div>
        </div>
        <div className="p-3 rounded-xl border border-slate-800 bg-slate-900/60">
          <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-2">Linked MITRE</div>
          <div className="flex flex-wrap gap-1">
            {[champion.code, 'T1071', 'T1021', 'T1055', 'T1486'].map((t) => (
              <span key={t} className={`text-[9px] font-mono px-1.5 py-0.5 rounded bg-${champion.side === 'red' ? 'rose' : 'sky'}-500/10 text-${champion.side === 'red' ? 'rose' : 'sky'}-300 border border-${champion.side === 'red' ? 'rose' : 'sky'}-500/20`}>
                {t}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   Embedding Space tab — 3D-feel PCA scatter
============================================================ */
function EmbeddingTab({ champion }: { champion: Champion }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    let frame = 0;

    const points: Array<{ x: number; y: number; z: number; col: string; r: number; self: boolean }> = [];
    for (let i = 0; i < 400; i++) {
      const isSelf = i === 0;
      const cx = isSelf ? 0 : (Math.random() - 0.5) * 1.8;
      const cy = isSelf ? 0 : (Math.random() - 0.5) * 1.8;
      const cz = isSelf ? 0 : (Math.random() - 0.5) * 1.8;
      points.push({
        x: cx,
        y: cy,
        z: cz,
        col: isSelf
          ? (champion.side === 'red' ? '#fbbf24' : '#fbbf24')
          : i % 4 === 0
            ? 'rgba(244,63,94,0.55)'
            : i % 4 === 1
              ? 'rgba(14,165,233,0.55)'
              : i % 4 === 2
                ? 'rgba(16,185,129,0.35)'
                : 'rgba(148,163,184,0.3)',
        r: isSelf ? 6 : 1.5 + Math.random() * 1.5,
        self: isSelf,
      });
    }

    let raf = 0;
    const render = () => {
      frame++;
      const angle = frame * 0.005;
      ctx.fillStyle = 'rgba(2,6,23,0.2)';
      ctx.fillRect(0, 0, w, h);

      ctx.strokeStyle = 'rgba(148,163,184,0.1)';
      for (let i = 0; i < 6; i++) {
        ctx.beginPath();
        ctx.arc(w / 2, h / 2, 30 + i * 30, 0, Math.PI * 2);
        ctx.stroke();
      }

      const projected = points.map((p) => {
        const rx = p.x * Math.cos(angle) - p.z * Math.sin(angle);
        const rz = p.x * Math.sin(angle) + p.z * Math.cos(angle);
        const scale = 180 / (4 - rz);
        return { ...p, sx: w / 2 + rx * scale, sy: h / 2 + p.y * scale, scale };
      });
      projected.sort((a, b) => a.scale - b.scale);

      for (const p of projected) {
        ctx.fillStyle = p.col;
        ctx.beginPath();
        ctx.arc(p.sx, p.sy, p.r * (p.scale / 80), 0, Math.PI * 2);
        ctx.fill();
        if (p.self) {
          ctx.strokeStyle = '#fde047';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(p.sx, p.sy, p.r * (p.scale / 80) + 4 + Math.sin(frame / 10) * 2, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      raf = requestAnimationFrame(render);
    };
    render();
    return () => cancelAnimationFrame(raf);
  }, [champion]);

  return (
    <div className="space-y-4">
      <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/60">
        <div className="text-[11px] uppercase tracking-wider text-slate-400 mb-1">384-Dimensional Embedding Space</div>
        <div className="text-sm text-slate-200">
          Genome + rule + pattern concatenation projected via PCA into 3D for visualization. Gold star marks
          this champion; clusters show cohabiting semantically similar champions.
        </div>
      </div>

      <div className="rounded-xl border border-slate-800 bg-gradient-to-br from-slate-950 to-slate-900 p-2">
        <canvas ref={canvasRef} width={900} height={400} className="w-full rounded-lg" />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="p-3 rounded-xl border border-slate-800 bg-slate-900/60">
          <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">Embedding Model</div>
          <div className="text-[11px] font-mono text-slate-200">all-MiniLM-L6-v2</div>
          <div className="text-[10px] text-slate-500">sentence-transformers</div>
        </div>
        <div className="p-3 rounded-xl border border-slate-800 bg-slate-900/60">
          <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">Dimension</div>
          <div className="text-[11px] font-mono text-slate-200">384</div>
          <div className="text-[10px] text-slate-500">L2-normalized</div>
        </div>
        <div className="p-3 rounded-xl border border-slate-800 bg-slate-900/60">
          <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">Cluster</div>
          <div className="text-[11px] font-mono text-amber-300">
            C-{Math.floor(champion.gene[0] * 12)}
          </div>
          <div className="text-[10px] text-slate-500">HDBSCAN · {Math.floor(20 + champion.fitness * 80)} siblings</div>
        </div>
      </div>

      <div className="p-3 rounded-xl border border-slate-800 bg-slate-950/60">
        <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-2">Vector Excerpt (first 24 of 384)</div>
        <div className="grid grid-cols-12 gap-0.5">
          {Array.from({ length: 24 }).map((_, i) => {
            const v = Math.sin(champion.gene.reduce((s, g) => s + g, 0) * (i + 1)) * 0.5 + champion.gene[i % 8] - 0.5;
            const intensity = Math.abs(v);
            return (
              <div key={i} className="aspect-square rounded-sm"
                style={{
                  background: v > 0
                    ? `rgba(14,165,233,${intensity})`
                    : `rgba(244,63,94,${intensity})`,
                }}
                title={v.toFixed(3)}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   Transformer tab — animated attention viz
============================================================ */
function TransformerTab({ champion }: { champion: Champion }) {
  const [layer, setLayer] = useState(0);
  useEffect(() => {
    const i = setInterval(() => setLayer((l) => (l + 1) % 6), 1200);
    return () => clearInterval(i);
  }, []);

  const tokens = champion.side === 'red'
    ? ['<GENE>', '[0.81]', 'T1078', '[0.63]', '<PATTERN>', 'smb→lateral', 'kerberoast', '<SEP>', 'promote_rule', 'high']
    : ['<GENE>', '[0.77]', 'D3-UBA', '[0.58]', '<PATTERN>', 'login→anomaly', 'impossible_travel', '<SEP>', 'block_session', 'high'];

  return (
    <div className="space-y-4">
      <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/60">
        <div className="text-[11px] uppercase tracking-wider text-slate-400 mb-1">SLM Transformer Inference</div>
        <div className="text-sm text-slate-200">
          6-layer · 8-head multi-head attention · 384 hidden dim · 1,536 FFN · rotary position embeddings.
          Champion genome tokenized alongside correlation rule provenance and micro-pattern topology.
        </div>
      </div>

      <div className="rounded-xl border border-slate-800 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
            <CircuitBoard className="w-4 h-4 text-sky-400" /> Layer {layer + 1} / 6 — Attention Matrix
          </div>
          <div className="flex gap-1">
            {[0, 1, 2, 3, 4, 5].map((l) => (
              <button
                key={l}
                onClick={() => setLayer(l)}
                className={`w-7 h-7 rounded text-[10px] font-bold ${
                  l === layer ? 'bg-sky-500 text-slate-950' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                }`}
              >
                L{l + 1}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-8 gap-2 mb-4">
          {Array.from({ length: 8 }).map((_, head) => (
            <div key={head} className="rounded border border-slate-800 bg-slate-950 p-1">
              <div className="text-[9px] font-mono text-slate-500 text-center mb-1">H{head + 1}</div>
              <div className="grid grid-cols-10 gap-[1px]">
                {Array.from({ length: 100 }).map((_, i) => {
                  const intensity = Math.abs(Math.sin((i + head * 7 + layer * 13) * 0.4 + champion.gene[i % 8]));
                  const col = champion.side === 'red'
                    ? `rgba(244,63,94,${intensity})`
                    : `rgba(14,165,233,${intensity})`;
                  return <div key={i} className="aspect-square rounded-[1px]" style={{ background: col }} />;
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
          <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-2">Input Token Sequence</div>
          <div className="flex flex-wrap gap-1.5">
            {tokens.map((tok, i) => {
              const weight = Math.abs(Math.sin(i + layer + champion.gene[i % 8] * 3));
              return (
                <span
                  key={i}
                  className="text-[10px] font-mono px-2 py-1 rounded border"
                  style={{
                    background: champion.side === 'red'
                      ? `rgba(244,63,94,${weight * 0.4})`
                      : `rgba(14,165,233,${weight * 0.4})`,
                    borderColor: champion.side === 'red'
                      ? `rgba(244,63,94,${weight * 0.7})`
                      : `rgba(14,165,233,${weight * 0.7})`,
                    color: '#e2e8f0',
                  }}
                >
                  {tok}
                </span>
              );
            })}
          </div>
        </div>
      </div>

      <div className="p-3 rounded-xl border border-slate-800 bg-slate-900/60">
        <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-2">Output Logits (softmax over action space)</div>
        <div className="space-y-1.5">
          {[
            { label: 'promote_rule', weight: 0.85 + champion.gene[0] * 0.15 },
            { label: 'harden_control', weight: 0.55 + champion.gene[1] * 0.3 },
            { label: 'isolate_host', weight: 0.42 + champion.gene[2] * 0.35 },
            { label: 'block_ioc', weight: 0.38 + champion.gene[3] * 0.4 },
            { label: 'alert_soc', weight: 0.28 + champion.gene[4] * 0.4 },
            { label: 'no_action', weight: 0.08 + champion.gene[5] * 0.1 },
          ].map((l) => (
            <div key={l.label} className="flex items-center gap-2 text-[10px] font-mono">
              <span className="w-28 truncate text-slate-300">{l.label}</span>
              <div className="flex-1 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                <div className="h-full bg-gradient-to-r from-sky-500 to-emerald-400" style={{ width: `${l.weight * 100}%` }} />
              </div>
              <span className="w-12 text-right text-slate-400">{l.weight.toFixed(3)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   Detection-as-Code tab
============================================================ */
function DetectionTab({ champion, battlefield }: { champion: Champion; battlefield: Battlefield | null }) {
  const [copied, setCopied] = useState(false);
  const rule = buildDetectionRule(champion, battlefield);
  const copy = () => {
    navigator.clipboard.writeText(rule);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-[11px] uppercase tracking-wider text-slate-400">Generated Detection Rule (SIGMA-style)</div>
        <button
          onClick={copy}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[10px] font-semibold text-slate-200"
        >
          {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="p-4 rounded-xl border border-slate-800 bg-slate-950 text-[11px] font-mono text-emerald-300 overflow-x-auto whitespace-pre-wrap leading-relaxed">
{rule}
      </pre>
    </div>
  );
}

function buildDetectionRule(champion: Champion, bf: Battlefield | null): string {
  const id = champion.id.replace(/[^a-z0-9]/gi, '-');
  const ttps = bf?.mitre_techniques?.join(', ') || champion.code;
  const level = champion.fitness > 0.85 ? 'critical' : champion.fitness > 0.7 ? 'high' : 'medium';
  if (champion.side === 'blue') {
    return `title: ${champion.name} — auto-promoted
id: crucible-${id}
status: experimental
description: |
  Detection evolved in Swarm Crucible Gen ${champion.generation} with fitness ${champion.fitness.toFixed(3)}.
  Trait: ${champion.trait}. Target: ${bf?.name || 'generic enterprise'}.
author: Swarm Crucible / auto-promoted
logsource:
  category: process_creation
  product: windows
detection:
  selection:
    EventID: [4624, 4625, 4768, 4769]
  filter_anomaly:
    GeneWeight|gte: ${champion.fitness.toFixed(2)}
    TraitVector:
      - ${champion.trait.toLowerCase().replace(/ /g, '_')}
  condition: selection and filter_anomaly
fields:
  - User
  - SourceIP
  - Workstation
falsepositives:
  - legitimate admin after-hours work
level: ${level}
tags:
  - attack.${ttps.split(',')[0].trim().toLowerCase()}
  - crucible.generation.${champion.generation}
  - crucible.cohort.${champion.code}`;
  }
  return `# Red-team playbook step — Swarm Crucible
campaign: ${champion.name}
id: crucible-red-${id}
trait: ${champion.trait}
generation: ${champion.generation}
fitness: ${champion.fitness.toFixed(3)}
target: ${bf?.name || 'generic'}
kill_chain:
${(bf?.kill_chain_stages || ['recon', 'initial-access', 'impact']).map((s) => `  - ${s}`).join('\n')}
techniques:
${(bf?.mitre_techniques || [champion.code]).map((t) => `  - ${t}`).join('\n')}
gene_vector: [${champion.gene.map((g) => g.toFixed(3)).join(', ')}]
strategy: |
  Exploit ${champion.trait.toLowerCase()} capability against ${bf?.name || 'target estate'}.
  Weight distribution optimized over ${champion.generation} generations of adversarial co-evolution.
level: ${level}`;
}

/* ============================================================
   Artifact Studio — tweak + download notebook + LangGraph
============================================================ */
type ArtifactTab = 'notebook' | 'langgraph';

export function ArtifactStudio({
  onClose,
  onNotebookDownload,
  onLangGraphDownload,
  initialLangGraph,
  initialNotebook,
}: {
  onClose: () => void;
  onNotebookDownload: (content: string) => void;
  onLangGraphDownload: (content: string) => void;
  initialLangGraph: string;
  initialNotebook: string;
}) {
  const [tab, setTab] = useState<ArtifactTab>('langgraph');
  const [lgCode, setLgCode] = useState(initialLangGraph);
  const [nbContent, setNbContent] = useState(initialNotebook);

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-6xl max-h-[92vh] rounded-2xl border border-slate-800 bg-slate-950 shadow-2xl overflow-hidden flex flex-col">
        <div className="px-6 py-4 border-b border-slate-800 bg-gradient-to-r from-emerald-950 via-slate-950 to-slate-950 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-400 flex items-center justify-center">
              <FileCode2 className="w-6 h-6 text-slate-950" strokeWidth={2.5} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-100">Artifact Studio</h2>
              <p className="text-[11px] text-slate-400 font-mono">Tweak tiny-agent graphs and notebooks in-browser · download your customized version</p>
            </div>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center justify-center">
            <X className="w-5 h-5 text-slate-300" />
          </button>
        </div>

        <div className="px-6 py-2 border-b border-slate-800 bg-slate-900/50 flex gap-1">
          <button
            onClick={() => setTab('langgraph')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 ${
              tab === 'langgraph' ? 'bg-slate-800 text-slate-100' : 'text-slate-400 hover:bg-slate-800/50'
            }`}
          >
            <FileCode2 className="w-3.5 h-3.5" /> LangGraph (editable)
          </button>
          <button
            onClick={() => setTab('notebook')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 ${
              tab === 'notebook' ? 'bg-slate-800 text-slate-100' : 'text-slate-400 hover:bg-slate-800/50'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" /> Notebook
          </button>
        </div>

        <div className="flex-1 overflow-hidden p-4">
          {tab === 'langgraph' ? (
            <LangGraphEditor code={lgCode} setCode={setLgCode} onDownload={() => onLangGraphDownload(lgCode)} />
          ) : (
            <NotebookViewer source={nbContent} setSource={setNbContent} onDownload={() => onNotebookDownload(nbContent)} />
          )}
        </div>
      </div>
    </div>
  );
}

function LangGraphEditor({
  code, setCode, onDownload,
}: { code: string; setCode: (s: string) => void; onDownload: () => void }) {
  const agents = useMemo(() => {
    const re = /def (\w+)\(state: SwarmState\)/g;
    const found: string[] = [];
    let m;
    while ((m = re.exec(code))) found.push(m[1]);
    return found;
  }, [code]);

  return (
    <div className="h-full grid grid-cols-5 gap-3">
      <div className="col-span-3 flex flex-col">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
            <Cpu className="w-4 h-4 text-emerald-400" /> tiny_agents_langgraph.py
          </div>
          <button
            onClick={onDownload}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold"
          >
            <Download className="w-3.5 h-3.5" /> Download customized
          </button>
        </div>
        <textarea
          value={code}
          onChange={(e) => setCode(e.target.value)}
          spellCheck={false}
          className="flex-1 w-full p-3 rounded-lg border border-slate-800 bg-slate-950 text-emerald-300 font-mono text-[11px] leading-relaxed resize-none focus:outline-none focus:border-emerald-500/50"
        />
      </div>
      <div className="col-span-2 space-y-3 overflow-y-auto custom-scrollbar">
        <div className="p-3 rounded-xl border border-slate-800 bg-slate-900/60">
          <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-2">Detected agents ({agents.length})</div>
          <div className="space-y-1">
            {agents.map((a) => (
              <div key={a} className="flex items-center gap-2 text-[11px] font-mono text-slate-200">
                <ChevronRight className="w-3 h-3 text-emerald-400" />
                {a}
              </div>
            ))}
          </div>
        </div>
        <div className="p-3 rounded-xl border border-slate-800 bg-slate-900/60">
          <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-2">Tweak cookbook</div>
          <ul className="text-[10px] text-slate-300 space-y-1.5 list-disc ml-4">
            <li>Change <code className="text-emerald-300">GENE_DIM</code> to alter trait resolution</li>
            <li>Add a new <code className="text-emerald-300">def red_*</code> or <code className="text-sky-300">def blue_*</code> node</li>
            <li>Wire it in <code className="text-emerald-300">build_graph()</code> via <code>add_node</code> + <code>add_edge</code></li>
            <li>Tune mutation rate in <code>*_mutate</code> (default 0.03)</li>
            <li>Change champion promotion threshold (line: <code>fitness &gt; 0.78</code>)</li>
          </ul>
        </div>
        <div className="p-3 rounded-xl border border-slate-800 bg-slate-900/60">
          <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-2">Quick-insert snippets</div>
          <div className="space-y-2">
            <SnippetBtn label="Add Red 'supply-chain' agent" snippet={`\ndef red_supply_chain(state: SwarmState) -> SwarmState:\n    for c in state["red"]:\n        c.gene[7] = min(1.0, c.gene[7] + 0.02)\n    return state\n`} setCode={setCode} code={code} />
            <SnippetBtn label="Add Blue 'deception canary' agent" snippet={`\ndef blue_deception(state: SwarmState) -> SwarmState:\n    for c in state["blue"]:\n        c.gene[6] = min(1.0, c.gene[6] + 0.025)\n    return state\n`} setCode={setCode} code={code} />
            <SnippetBtn label="Add checkpoint node" snippet={`\ndef checkpoint(state: SwarmState) -> SwarmState:\n    # persist current generation\n    print(f"[ckpt] tick={state['tick']} gen={state['generation']}")\n    return state\n`} setCode={setCode} code={code} />
          </div>
        </div>
      </div>
    </div>
  );
}

function SnippetBtn({ label, snippet, code, setCode }: { label: string; snippet: string; code: string; setCode: (s: string) => void }) {
  return (
    <button
      onClick={() => {
        const idx = code.indexOf('def build_graph');
        const next = idx > 0 ? code.slice(0, idx) + snippet + '\n' + code.slice(idx) : code + snippet;
        setCode(next);
      }}
      className="w-full text-left text-[10px] font-mono px-2 py-1.5 rounded bg-slate-950 border border-slate-800 hover:border-emerald-500/40 text-slate-300 hover:text-emerald-300"
    >
      <Play className="w-2.5 h-2.5 inline mr-1" /> {label}
    </button>
  );
}

function NotebookViewer({
  source, setSource, onDownload,
}: { source: string; setSource: (s: string) => void; onDownload: () => void }) {
  let parsed: any = null;
  try { parsed = JSON.parse(source); } catch { /* ignore */ }

  return (
    <div className="h-full grid grid-cols-5 gap-3">
      <div className="col-span-2 flex flex-col">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
            <BookOpen className="w-4 h-4 text-amber-400" /> swarm_crucible.ipynb
          </div>
          <button
            onClick={onDownload}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold"
          >
            <Download className="w-3.5 h-3.5" /> Download
          </button>
        </div>
        <textarea
          value={source}
          onChange={(e) => setSource(e.target.value)}
          spellCheck={false}
          className="flex-1 p-3 rounded-lg border border-slate-800 bg-slate-950 text-amber-200 font-mono text-[10px] leading-relaxed resize-none"
        />
      </div>
      <div className="col-span-3 overflow-y-auto custom-scrollbar space-y-2">
        {parsed?.cells?.map((c: any, i: number) => (
          <div key={i} className={`p-3 rounded-lg border ${
            c.cell_type === 'markdown'
              ? 'border-slate-800 bg-slate-900/60'
              : 'border-emerald-500/20 bg-slate-950'
          }`}>
            <div className="text-[9px] font-mono text-slate-500 mb-1.5 uppercase">
              [{c.cell_type}] cell {i + 1}
            </div>
            <pre className={`whitespace-pre-wrap text-[11px] leading-relaxed font-mono ${
              c.cell_type === 'markdown' ? 'text-slate-200' : 'text-emerald-300'
            }`}>{Array.isArray(c.source) ? c.source.join('') : c.source}</pre>
          </div>
        ))}
        {!parsed && (
          <div className="text-[11px] text-rose-400 p-4 text-center">Invalid JSON — notebook preview unavailable</div>
        )}
      </div>
    </div>
  );
}
