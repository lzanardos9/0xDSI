type FlowNode = { id: string; label: string; type: string; sublabel?: string };
type FlowEdge = { from: string; to: string; label?: string; weight?: number };

const STAGE: Record<string, { fill: string; stroke: string; glyph: string; order: number }> = {
  trigger: { fill: '#0c4a6e', stroke: '#38bdf8', glyph: 'TRIGGER', order: 0 },
  source: { fill: '#0c4a6e', stroke: '#38bdf8', glyph: 'SOURCE', order: 0 },
  window: { fill: '#164e63', stroke: '#22d3ee', glyph: 'WINDOW', order: 1 },
  condition: { fill: '#365314', stroke: '#a3e635', glyph: 'WHERE', order: 2 },
  filter: { fill: '#365314', stroke: '#a3e635', glyph: 'WHERE', order: 2 },
  operator: { fill: '#713f12', stroke: '#fbbf24', glyph: 'OP', order: 3 },
  correlate: { fill: '#713f12', stroke: '#fbbf24', glyph: 'CORRELATE', order: 3 },
  score: { fill: '#7c2d12', stroke: '#fb923c', glyph: 'SCORE', order: 4 },
  gate: { fill: '#7f1d1d', stroke: '#ef4444', glyph: 'GATE', order: 5 },
  action: { fill: '#064e3b', stroke: '#10b981', glyph: 'ACTION', order: 6 },
};

export default function RuleFlowGraph({ flow }: { flow: { nodes?: FlowNode[]; edges?: FlowEdge[] } }) {
  const nodes = flow?.nodes || [];
  const edges = flow?.edges || [];
  if (!nodes.length) return null;

  // Group nodes by stage order
  const byStage = new Map<number, FlowNode[]>();
  nodes.forEach(n => {
    const order = STAGE[n.type]?.order ?? 3;
    if (!byStage.has(order)) byStage.set(order, []);
    byStage.get(order)!.push(n);
  });
  const stages = Array.from(byStage.keys()).sort((a, b) => a - b);

  const W = 780, H = 240;
  const padX = 50;
  const usableW = W - padX * 2;

  const pos = new Map<string, { x: number; y: number }>();
  stages.forEach((stage, ci) => {
    const list = byStage.get(stage)!;
    const x = padX + (stages.length === 1 ? usableW / 2 : (ci / (stages.length - 1)) * usableW);
    list.forEach((n, i) => {
      const y = list.length === 1 ? H / 2 : 40 + (i / Math.max(1, list.length - 1)) * (H - 80);
      pos.set(n.id, { x, y });
    });
  });

  // Build legend from unique stages present
  const legendKeys = Array.from(new Set(nodes.map(n => n.type))).filter(t => STAGE[t]);

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Detection Rule as a Graph</div>
        <div className="flex items-center gap-2 flex-wrap">
          {legendKeys.map(t => {
            const s = STAGE[t]; if (!s) return null;
            return (
              <div key={t} className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-sm" style={{ background: s.stroke }} />
                <span className="text-[9px] uppercase tracking-wider text-slate-500">{s.glyph}</span>
              </div>
            );
          })}
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[240px]">
        <defs>
          <marker id="arrow-flow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#475569" />
          </marker>
          <linearGradient id="flow-bg" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.08" />
            <stop offset="50%" stopColor="#fbbf24" stopOpacity="0.05" />
            <stop offset="100%" stopColor="#10b981" stopOpacity="0.08" />
          </linearGradient>
        </defs>
        <rect x="0" y="0" width={W} height={H} fill="url(#flow-bg)" />

        {stages.map((stage, ci) => {
          const x = padX + (stages.length === 1 ? usableW / 2 : (ci / (stages.length - 1)) * usableW);
          const list = byStage.get(stage)!;
          const firstType = list[0]?.type;
          const label = STAGE[firstType]?.glyph || 'STAGE';
          return <text key={stage} x={x} y={18} textAnchor="middle" className="fill-slate-600" style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.18em' }}>{label}</text>;
        })}

        {edges.map((e, i) => {
          const a = pos.get(e.from); const b = pos.get(e.to);
          if (!a || !b) return null;
          const midX = (a.x + b.x) / 2;
          const path = `M ${a.x + 50} ${a.y} C ${midX} ${a.y} ${midX} ${b.y} ${b.x - 50} ${b.y}`;
          return (
            <g key={i}>
              <path d={path} fill="none" stroke="#475569" strokeWidth={1.5} markerEnd="url(#arrow-flow)" opacity={0.55 + (e.weight || 0.5) * 0.4} />
              {e.label && (
                <text x={midX} y={((a.y + b.y) / 2) - 4} textAnchor="middle" className="fill-slate-500" style={{ fontSize: 8, fontFamily: 'ui-monospace, monospace' }}>{e.label}</text>
              )}
            </g>
          );
        })}

        {nodes.map(n => {
          const p = pos.get(n.id); if (!p) return null;
          const s = STAGE[n.type] || STAGE.condition;
          const lines = wrap(n.label, 22);
          const h = 44 + (n.sublabel ? 10 : 0);
          return (
            <g key={n.id}>
              <rect x={p.x - 55} y={p.y - h / 2} width="110" height={h} rx="9" fill={s.fill} stroke={s.stroke} strokeWidth="1.5" />
              {lines.map((line, i) => (
                <text key={i} x={p.x} y={p.y - (n.sublabel ? 4 : 0) - (lines.length - 1 - i) * 10} textAnchor="middle" className="fill-slate-100" style={{ fontSize: 9, fontFamily: 'ui-monospace, monospace', fontWeight: 600 }}>{line}</text>
              ))}
              {n.sublabel && (
                <text x={p.x} y={p.y + h / 2 - 6} textAnchor="middle" className="fill-slate-400" style={{ fontSize: 7, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{truncate(n.sublabel, 20)}</text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function wrap(s: string, max: number): string[] {
  if (s.length <= max) return [s];
  const words = s.split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > max) { if (cur) lines.push(cur); cur = w; }
    else cur = (cur ? cur + ' ' : '') + w;
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 2);
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}
