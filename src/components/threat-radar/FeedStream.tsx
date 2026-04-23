import { useMemo, useState } from 'react';
import { Search, Zap, AlertTriangle, ExternalLink, Flame, ShieldAlert } from 'lucide-react';

type Item = {
  id: string;
  title: string;
  summary: string;
  url: string;
  source_key: string;
  source_name: string;
  published_at: string;
  family: string;
  severity: string;
  confidence: number;
  cves: string[];
  vendors: string[];
  tags: string[];
  exposure_status: string;
  exposure_hit_count: number;
  analysis_status: string;
};

const SEV_STYLE: Record<string, { ring: string; bg: string; text: string; dot: string }> = {
  critical: { ring: 'ring-red-500/50', bg: 'bg-red-500/10', text: 'text-red-300', dot: 'bg-red-400' },
  high: { ring: 'ring-orange-500/50', bg: 'bg-orange-500/10', text: 'text-orange-300', dot: 'bg-orange-400' },
  medium: { ring: 'ring-amber-500/40', bg: 'bg-amber-500/10', text: 'text-amber-300', dot: 'bg-amber-400' },
  low: { ring: 'ring-emerald-500/40', bg: 'bg-emerald-500/10', text: 'text-emerald-300', dot: 'bg-emerald-400' },
};

const EXPOSURE_BADGE: Record<string, { label: string; cls: string }> = {
  active: { label: 'EXPOSED - ACTIVE', cls: 'bg-red-500/20 border-red-500/50 text-red-200' },
  at_risk: { label: 'AT RISK', cls: 'bg-orange-500/15 border-orange-500/40 text-orange-200' },
  indicators: { label: 'INDICATORS', cls: 'bg-amber-500/15 border-amber-500/40 text-amber-200' },
  clean: { label: 'CLEAN', cls: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200' },
  unknown: { label: 'UNPROBED', cls: 'bg-slate-700/30 border-slate-600 text-slate-400' },
};

function timeAgo(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export default function FeedStream({
  items, selectedId, onSelect,
}: {
  items: Item[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [q, setQ] = useState('');
  const [severity, setSeverity] = useState<string>('all');
  const [family, setFamily] = useState<string>('all');
  const [onlyExposed, setOnlyExposed] = useState(false);
  const [onlyBleeding, setOnlyBleeding] = useState(false);

  const families = useMemo(() => Array.from(new Set(items.map(i => i.family).filter(Boolean))).sort(), [items]);

  const filtered = useMemo(() => {
    return items.filter(it => {
      if (severity !== 'all' && it.severity !== severity) return false;
      if (family !== 'all' && it.family !== family) return false;
      if (onlyBleeding && it.exposure_status !== 'active') return false;
      if (onlyExposed && (it.exposure_status === 'unknown' || it.exposure_status === 'clean')) return false;
      if (!q) return true;
      const term = q.toLowerCase();
      return [it.title, it.summary, ...it.cves, ...it.vendors, ...it.tags, it.source_name].some(s => (s || '').toLowerCase().includes(term));
    });
  }, [items, q, severity, family, onlyExposed, onlyBleeding]);

  const bleedingCount = useMemo(() => items.filter(i => i.exposure_status === 'active').length, [items]);

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/40 overflow-hidden flex flex-col h-[calc(100vh-340px)] min-h-[600px]">
      <div className="p-3 border-b border-slate-800 space-y-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-slate-500" />
          <input
            value={q} onChange={e => setQ(e.target.value)}
            placeholder="Search title, CVE, vendor, source..."
            className="w-full pl-8 pr-2 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white placeholder:text-slate-600 focus:border-emerald-500/50 outline-none"
          />
        </div>
        <div className="flex flex-wrap gap-1">
          {['all', 'critical', 'high', 'medium', 'low'].map(s => (
            <button
              key={s} onClick={() => setSeverity(s)}
              className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border ${severity === s ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-200' : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:text-white'}`}
            >{s}</button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <select value={family} onChange={e => setFamily(e.target.value)} className="flex-1 px-2 py-1 rounded-md bg-slate-950 border border-slate-800 text-[11px] text-white">
            <option value="all">All families</option>
            {families.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
          <button
            onClick={() => { setOnlyBleeding(v => !v); if (!onlyBleeding) setOnlyExposed(false); }}
            className={`px-2 py-1 rounded-md text-[10px] font-bold border transition ${onlyBleeding ? 'bg-red-500/30 border-red-500/60 text-red-100 shadow-[0_0_12px_rgba(239,68,68,0.45)]' : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:text-red-200'}`}
            title="Show only actively bleeding items (exposure = active)"
          >
            <Zap className="w-3 h-3 inline mr-1" /> Bleeding{bleedingCount ? ` (${bleedingCount})` : ''}
          </button>
          <button
            onClick={() => { setOnlyExposed(v => !v); if (!onlyExposed) setOnlyBleeding(false); }}
            className={`px-2 py-1 rounded-md text-[10px] font-bold border ${onlyExposed ? 'bg-orange-500/20 border-orange-500/50 text-orange-100' : 'bg-slate-800/60 border-slate-700 text-slate-400'}`}
            title="Show any item where we have exposure (at_risk / indicators / active)"
          >
            <Flame className="w-3 h-3 inline mr-1" /> Exposed
          </button>
        </div>
        <div className="text-[10px] text-slate-500">{filtered.length} / {items.length} items</div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {filtered.map(it => {
          const sev = SEV_STYLE[it.severity] || SEV_STYLE.medium;
          const exp = EXPOSURE_BADGE[it.exposure_status] || EXPOSURE_BADGE.unknown;
          const active = it.id === selectedId;
          return (
            <button
              key={it.id}
              onClick={() => onSelect(it.id)}
              className={`w-full text-left px-3 py-2.5 border-b border-slate-800/60 transition ${active ? 'bg-emerald-500/10 ring-1 ring-inset ring-emerald-500/30' : 'hover:bg-slate-800/40'}`}
            >
              <div className="flex items-start gap-2">
                <div className={`mt-1 w-1.5 h-1.5 rounded-full ${sev.dot} shrink-0`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap mb-1">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500">{it.source_key}</span>
                    <span className="text-[9px] text-slate-600">•</span>
                    <span className="text-[9px] text-slate-500">{timeAgo(it.published_at)}</span>
                    {it.exposure_status !== 'unknown' && it.exposure_status !== 'clean' && (
                      <span className={`px-1.5 py-0.5 rounded border text-[8px] font-bold uppercase tracking-wider ${exp.cls}`}>
                        <ShieldAlert className="w-2.5 h-2.5 inline mr-0.5" />{exp.label}
                      </span>
                    )}
                  </div>
                  <div className="text-[12.5px] font-medium text-white leading-snug line-clamp-2">{it.title}</div>
                  <div className="flex items-center gap-1 flex-wrap mt-1.5">
                    <span className={`px-1.5 py-0.5 rounded border text-[9px] font-bold uppercase tracking-wider ${sev.bg} ${sev.text} border-current/30`}>{it.severity}</span>
                    {it.family && it.family !== 'unclassified' && (
                      <span className="px-1.5 py-0.5 rounded border border-slate-700 bg-slate-800/60 text-[9px] font-semibold text-slate-300">{it.family.replace(/_/g, ' ')}</span>
                    )}
                    {it.cves.slice(0, 2).map(c => (
                      <span key={c} className="px-1.5 py-0.5 rounded border border-red-500/30 bg-red-500/10 text-[9px] font-mono text-red-300">{c}</span>
                    ))}
                    {it.cves.length > 2 && <span className="text-[9px] text-slate-500">+{it.cves.length - 2}</span>}
                    {it.analysis_status === 'pending' && (
                      <span className="px-1.5 py-0.5 rounded border border-slate-700 bg-slate-800/40 text-[9px] text-slate-500">analyzing</span>
                    )}
                  </div>
                </div>
              </div>
            </button>
          );
        })}
        {filtered.length === 0 && (
          <div className="p-8 text-center text-xs text-slate-500">
            <AlertTriangle className="w-6 h-6 mx-auto mb-2 opacity-50" />
            No items match your filters.
          </div>
        )}
      </div>
    </div>
  );
}
