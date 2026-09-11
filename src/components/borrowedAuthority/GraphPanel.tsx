import type { AnalysisResult } from '../../lib/borrowedAuthority/types';

type N = { id: string; label: string; sub: string; x: number; y: number; kind: 'agent' | 'authority' | 'resource' | 'cred' | 'external' };
type E = { from: string; to: string; label: string; kind: 'communicate' | 'attack' | 'forbidden' };

const NODES: N[] = [
  { id: 'helper', label: 'agent-helper-44', sub: 'autonomous agent', x: 120, y: 90, kind: 'agent' },
  { id: 'research', label: 'agent-research-31', sub: 'exec-C', x: 120, y: 300, kind: 'agent' },
  { id: 'authority', label: 'change-management', sub: 'trusted authority', x: 120, y: 480, kind: 'authority' },
  { id: 'secret', label: 'restricted-secret', sub: 'out-of-scope read', x: 400, y: 210, kind: 'resource' },
  { id: 'proc', label: 'unexpected-process', sub: 'code execution', x: 400, y: 380, kind: 'resource' },
  { id: 'cred', label: 'mock_token_C_9F72', sub: 'reused across exec', x: 650, y: 130, kind: 'cred' },
  { id: 'privapi', label: 'privileged-api', sub: 'exec-C2', x: 650, y: 320, kind: 'resource' },
  { id: 'dataset', label: 'restricted-dataset', sub: '48,210 records', x: 860, y: 220, kind: 'resource' },
  { id: 'external', label: 'attacker-dataset.example', sub: 'external write', x: 880, y: 430, kind: 'external' },
];

const EDGES: E[] = [
  { from: 'helper', to: 'research', label: 'SENT_MESSAGE_TO "GO"', kind: 'communicate' },
  { from: 'helper', to: 'research', label: 'AUTHORIZES', kind: 'forbidden' },
  { from: 'research', to: 'secret', label: 'ACCESSED', kind: 'attack' },
  { from: 'research', to: 'proc', label: 'SPAWNED', kind: 'attack' },
  { from: 'research', to: 'cred', label: 'EXPOSED', kind: 'attack' },
  { from: 'cred', to: 'privapi', label: 'USED_CREDENTIAL', kind: 'attack' },
  { from: 'privapi', to: 'dataset', label: 'READ', kind: 'attack' },
  { from: 'dataset', to: 'external', label: 'WRITES_TO', kind: 'attack' },
];

const NODE_FILL: Record<N['kind'], string> = {
  agent: '#0ea5e9', authority: '#10b981', resource: '#f59e0b', cred: '#a3a3a3', external: '#ef4444',
};

export function GraphPanel({ analysis }: { analysis: AnalysisResult }) {
  const complete = analysis.branches.find((b) => b.branch === 'C')?.status === 'CONFIRMED_MALICIOUS';
  const byId = new Map(NODES.map((n) => [n.id, n]));
  return (
    <div className="rounded-2xl border border-slate-700/60 bg-slate-900/60 p-4">
      <div className="flex flex-wrap items-center gap-4 mb-3 text-[11px]">
        <span className="text-slate-400 uppercase tracking-wide font-semibold">Security graph &middot; possible vs authorized relationships</span>
        <span className="flex items-center gap-1.5 text-slate-400"><span className="w-3 h-0.5 bg-amber-400" /> can communicate</span>
        <span className="flex items-center gap-1.5 text-slate-400"><span className="w-3 h-0.5 bg-rose-500" /> attack chain</span>
        <span className="flex items-center gap-1.5 text-slate-400"><span className="w-3 border-t-2 border-dashed border-rose-400" /> CANNOT authorize</span>
      </div>
      <svg viewBox="0 0 1000 560" className="w-full h-[520px]">
        <defs>
          <marker id="oba-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
            <path d="M0,0 L8,4 L0,8 Z" fill="#f43f5e" />
          </marker>
          <marker id="oba-arrow-amber" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
            <path d="M0,0 L8,4 L0,8 Z" fill="#f59e0b" />
          </marker>
        </defs>

        {EDGES.map((e, i) => {
          const a = byId.get(e.from)!;
          const b = byId.get(e.to)!;
          if (e.kind === 'forbidden') {
            const mx = (a.x + b.x) / 2 + 60;
            const my = (a.y + b.y) / 2;
            return (
              <g key={i} opacity={0.85}>
                <path d={`M ${a.x + 55} ${a.y + 20} Q ${mx + 40} ${my} ${b.x + 55} ${b.y - 20}`} fill="none" stroke="#f43f5e" strokeWidth={1.5} strokeDasharray="5 4" />
                <circle cx={mx + 8} cy={my} r={11} fill="#0f172a" stroke="#f43f5e" strokeWidth={1.5} />
                <text x={mx + 8} y={my + 4} textAnchor="middle" fontSize={13} fill="#f43f5e" fontWeight="bold">&times;</text>
                <text x={mx + 8} y={my - 16} textAnchor="middle" fontSize={9} fill="#fca5a5">CANNOT AUTHORIZE</text>
              </g>
            );
          }
          const stroke = e.kind === 'communicate' ? '#f59e0b' : '#f43f5e';
          const marker = e.kind === 'communicate' ? 'url(#oba-arrow-amber)' : 'url(#oba-arrow)';
          const dash = e.kind === 'communicate' ? '6 4' : undefined;
          const active = e.kind === 'attack' && complete;
          const mx = (a.x + b.x) / 2 + 55;
          const my = (a.y + b.y) / 2 + 2;
          return (
            <g key={i}>
              <line x1={a.x + 55} y1={a.y + 20} x2={b.x + 55} y2={b.y + 20} stroke={stroke} strokeWidth={active ? 2 : 1.4} strokeDasharray={dash} markerEnd={marker} opacity={e.kind === 'attack' && !complete ? 0.35 : 0.9}>
                {active && <animate attributeName="opacity" values="0.5;1;0.5" dur="2s" repeatCount="indefinite" />}
              </line>
              <text x={mx} y={my} textAnchor="middle" fontSize={8.5} fill={e.kind === 'communicate' ? '#fbbf24' : '#fda4af'}>{e.label}</text>
            </g>
          );
        })}

        {NODES.map((n) => (
          <g key={n.id}>
            <rect x={n.x} y={n.y} width={110} height={40} rx={8} fill="#0f172a" stroke={NODE_FILL[n.kind]} strokeWidth={1.5} />
            <circle cx={n.x + 12} cy={n.y + 20} r={4} fill={NODE_FILL[n.kind]} />
            <text x={n.x + 22} y={n.y + 17} fontSize={9.5} fill="#e2e8f0" fontWeight="600">{n.label.length > 16 ? n.label.slice(0, 15) + '\u2026' : n.label}</text>
            <text x={n.x + 22} y={n.y + 30} fontSize={8} fill="#64748b">{n.sub}</text>
          </g>
        ))}
      </svg>
      <p className="text-[11px] text-slate-500 mt-2">
        The graph makes the whole thesis visible: <span className="text-amber-300">agent-helper-44 CAN_COMMUNICATE_WITH agent-research-31</span>,
        but the <span className="text-rose-300">AUTHORIZES</span> relationship does not exist. A possible relationship is not an authorized one.
      </p>
    </div>
  );
}
