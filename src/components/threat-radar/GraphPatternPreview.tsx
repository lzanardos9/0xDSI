type Node = { id: string; label: string; type: string; risk?: number; sublabel?: string };
type Edge = { from: string; to: string; label?: string; weight?: number; kind?: string };

const TYPE_COLOR: Record<string, string> = {
  external: '#ef4444',
  vector: '#fb923c',
  asset: '#38bdf8',
  identity: '#14b8a6',
  data: '#10b981',
  malware: '#f472b6',
};

export default function GraphPatternPreview({ pattern }: { pattern: { nodes?: Node[]; edges?: Edge[] } }) {
  const nodes = pattern?.nodes || [];
  const edges = pattern?.edges || [];
  if (!nodes.length) return null;

  const cx = 180, cy = 120, r = 95;
  const positioned = nodes.map((n, i) => {
    const angle = (i / nodes.length) * Math.PI * 2 - Math.PI / 2;
    return { ...n, x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
  });
  const lookup = new Map(positioned.map(n => [n.id, n]));

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
      <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-2">Proposed Attack Graph</div>
      <svg viewBox="0 0 360 240" className="w-full h-[240px]">
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#64748b" />
          </marker>
        </defs>
        {edges.map((e, i) => {
          const a = lookup.get(e.from);
          const b = lookup.get(e.to);
          if (!a || !b) return null;
          const midX = (a.x + b.x) / 2;
          const midY = (a.y + b.y) / 2;
          return (
            <g key={i}>
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#64748b" strokeOpacity={0.5 + (e.weight || 0.5) * 0.5} strokeWidth={1.5} markerEnd="url(#arrow)" />
              {e.label && (
                <text x={midX} y={midY - 4} textAnchor="middle" className="fill-slate-400" style={{ fontSize: 9, fontFamily: 'ui-monospace, monospace' }}>{e.label}</text>
              )}
            </g>
          );
        })}
        {positioned.map(n => {
          const color = TYPE_COLOR[n.type] || '#94a3b8';
          return (
            <g key={n.id}>
              <circle cx={n.x} cy={n.y} r={14} fill={color} fillOpacity={0.2} stroke={color} strokeWidth={1.5} />
              <circle cx={n.x} cy={n.y} r={4} fill={color} />
              <text x={n.x} y={n.y + 28} textAnchor="middle" className="fill-slate-200" style={{ fontSize: 10, fontWeight: 600 }}>{n.label}</text>
              <text x={n.x} y={n.y + 40} textAnchor="middle" className="fill-slate-500" style={{ fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{n.sublabel || n.type}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
