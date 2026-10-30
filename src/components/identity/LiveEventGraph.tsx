import { Bot, Building2, Crown, KeyRound, User, Users, type LucideIcon } from 'lucide-react';
import type { AttackPath, LiveEvent } from '../../lib/identityApi';
import { TONE_COLOR, describeLiveEvent } from './identityLive';

interface GNode { label: string; sub: string; icon: LucideIcon; color: string }

const str = (v: unknown) => (typeof v === 'string' || typeof v === 'number' ? String(v) : '');

function nodesFor(e: LiveEvent): { nodes: GNode[]; edges: string[] } {
  const d = e.detail || {};
  const v = describeLiveEvent(e);
  const nodes: GNode[] = [];
  const edges: string[] = [];
  const add = (n: GNode, edge: string) => {
    if (nodes.length) edges.push(edge);
    nodes.push(n);
  };
  if (e.actor && e.actor !== e.username) add({ label: e.actor, sub: 'Actor', icon: Bot, color: '#94a3b8' }, '');
  if (e.canonical_id) add({ label: e.display_name || e.canonical_id, sub: (e.principal_type || 'identity').replace(/_/g, ' '), icon: User, color: '#2dd4bf' }, 'acted on');
  add({ label: e.username || e.account_key || 'Unknown account', sub: e.provider.replace(/_/g, ' '), icon: KeyRound, color: '#38bdf8' }, e.canonical_id ? 'owns' : 'acted on');
  const target = str(d.resource) || str(d.entitlement) || str(d.application) || str(d.target) || str(d.credential);
  if (target) {
    const icon = d.resource ? Crown : d.entitlement ? Users : Building2;
    add({ label: target, sub: d.resource ? 'System' : d.entitlement ? 'Group' : d.application ? 'Application' : 'Target', icon, color: TONE_COLOR[v.tone] }, v.short.toLowerCase());
  }
  return { nodes, edges };
}

export default function LiveEventGraph({ e, route, onShowOnMap }: { e: LiveEvent; route: AttackPath | null; onShowOnMap?: () => void }) {
  const { nodes, edges } = nodesFor(e);
  const W = 520;
  const H = 150;
  const gap = W / nodes.length;
  const x = (i: number) => gap * i + gap / 2;
  const tone = TONE_COLOR[describeLiveEvent(e).tone];

  return (
    <div className="space-y-3">
      <div className="relative rounded-xl border border-slate-700/50 bg-[radial-gradient(ellipse_at_center,rgba(45,212,191,0.07),transparent_70%)] overflow-hidden">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="How this event connects">
          {edges.map((label, i) => (
            <g key={i}>
              <line x1={x(i) + 24} y1={58} x2={x(i + 1) - 24} y2={58} stroke="rgba(148,163,184,0.25)" strokeWidth={2} />
              <line x1={x(i) + 24} y1={58} x2={x(i + 1) - 24} y2={58} stroke={i === edges.length - 1 ? tone : '#5eead4'} strokeWidth={2}
                pathLength={100} className="id-live-comet" style={{ animationDelay: `${i * 0.35}s` }} />
              <text x={(x(i) + x(i + 1)) / 2} y={48} textAnchor="middle" className="fill-slate-400" fontSize={10}>{label}</text>
            </g>
          ))}
        </svg>
        <div className="absolute inset-0 flex">
          {nodes.map((n, i) => (
            <div key={i} className="flex-1 flex flex-col items-center pt-[22px] px-1 text-center animate-scale-in" style={{ animationDelay: `${i * 90}ms` }}>
              <span className="relative w-12 h-12 rounded-2xl flex items-center justify-center border bg-slate-900"
                style={{ borderColor: `${n.color}66`, boxShadow: `0 0 18px ${n.color}33` }}>
                {i === nodes.length - 1 && <span className="absolute inset-0 rounded-2xl animate-ping opacity-20" style={{ background: n.color }} />}
                <n.icon size={18} style={{ color: n.color }} />
              </span>
              <span className="mt-2 text-[11px] font-medium text-slate-100 leading-tight line-clamp-2 max-w-[120px] break-words">{n.label}</span>
              <span className="text-[10px] text-slate-500 capitalize">{n.sub}</span>
            </div>
          ))}
        </div>
      </div>

      {route ? (
        <div className="rounded-xl border border-red-500/25 bg-red-500/[0.05] p-3">
          <div className="flex items-center gap-2">
            <Crown size={13} className="text-amber-300" />
            <span className="text-xs font-medium text-slate-100">Route to {route.resource_name || route.resource_id}</span>
            <span className="text-[11px] text-slate-500">{route.hops} hop{route.hops === 1 ? '' : 's'}{route.via_takeover ? ' · via takeover' : ''}</span>
            {onShowOnMap && (
              <button type="button" onClick={onShowOnMap}
                className="ml-auto px-2.5 py-1 rounded-lg border border-teal-400/40 text-[11px] text-teal-100 hover:bg-teal-500/15 transition-colors">
                Show on map
              </button>
            )}
          </div>
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            {route.steps.map((s, i) => (
              <span key={`${s.id}-${i}`} className="inline-flex items-center gap-1.5">
                {i > 0 && <span className={`text-[10px] ${s.edge === 'can_take_over' ? 'text-red-300' : 'text-slate-500'}`}>{(s.edge || '').replace(/_/g, ' ')} &rarr;</span>}
                <span className={`px-2 py-0.5 rounded-md border text-[11px] ${s.kind === 'resource' ? 'border-amber-400/40 text-amber-100' : s.kind === 'group' ? 'border-sky-400/30 text-sky-100' : 'border-slate-600 text-slate-200'}`}>
                  {s.label}
                </span>
              </span>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-[11px] text-slate-500">This event is not on a mapped route to a crown jewel.</p>
      )}
    </div>
  );
}
