import { useEffect, useMemo, useState } from 'react';
import {
  Activity, Users, MousePointerClick, ArrowRight, Clock, Globe,
  LogIn, LogOut, Eye, Network, Filter, RefreshCw, MapPin, Monitor
} from 'lucide-react';
import { supabase } from '../lib/supabase';

type Sess = {
  id: string;
  user_id: string | null;
  username: string;
  session_token: string;
  ip_address: string;
  user_agent: string;
  device_type: string;
  geo_country: string;
  geo_city: string;
  started_at: string;
  ended_at: string | null;
  event_count: number;
  click_count: number;
  view_count: number;
  last_active_at: string;
  is_active: boolean;
};

type Evt = {
  id: string;
  session_id: string | null;
  user_id: string | null;
  username: string;
  event_type: string;
  event_category: string;
  view_id: string;
  view_label: string;
  target_id: string;
  target_label: string;
  target_kind: string;
  parent_event_id: string | null;
  path: string;
  referrer_view: string;
  ip_address: string;
  user_agent: string;
  properties: Record<string, unknown>;
  duration_ms: number;
  occurred_at: string;
};

type LinEdge = {
  id: string;
  from_event_id: string;
  to_event_id: string;
  from_view: string;
  to_view: string;
  edge_type: string;
  delta_ms: number;
};

const EVT_COLOR: Record<string, string> = {
  login: '#10b981',
  logout: '#f43f5e',
  view: '#22d3ee',
  navigate: '#38bdf8',
  click: '#eab308',
  action: '#a78bfa',
  error: '#ef4444',
};

const EVT_ICON: Record<string, typeof Activity> = {
  login: LogIn,
  logout: LogOut,
  view: Eye,
  navigate: Eye,
  click: MousePointerClick,
};

export default function UserActivityLineage() {
  const [sessions, setSessions] = useState<Sess[]>([]);
  const [events, setEvents] = useState<Evt[]>([]);
  const [edges, setEdges] = useState<LinEdge[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [usernameFilter, setUsernameFilter] = useState<string>('all');
  const [view, setView] = useState<'timeline' | 'graph' | 'heatmap' | 'live'>('timeline');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const [s, e, l] = await Promise.all([
      supabase.from('user_activity_sessions').select('*').order('started_at', { ascending: false }).limit(100),
      supabase.from('user_activity_events').select('*').order('occurred_at', { ascending: false }).limit(1000),
      supabase.from('user_activity_lineage').select('id,from_event_id,to_event_id,from_view,to_view,edge_type,delta_ms').limit(1000),
    ]);
    setSessions((s.data ?? []) as Sess[]);
    setEvents((e.data ?? []) as Evt[]);
    setEdges((l.data ?? []) as LinEdge[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);
  useEffect(() => {
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, []);

  const usernames = useMemo(
    () => Array.from(new Set(sessions.map((s) => s.username))).sort(),
    [sessions]
  );

  const filteredSessions = useMemo(
    () => usernameFilter === 'all' ? sessions : sessions.filter((s) => s.username === usernameFilter),
    [sessions, usernameFilter]
  );

  const selectedSession = useMemo(
    () => filteredSessions.find((s) => s.id === selectedSessionId) ?? filteredSessions[0],
    [filteredSessions, selectedSessionId]
  );

  const sessionEvents = useMemo(
    () => selectedSession
      ? events.filter((e) => e.session_id === selectedSession.id).sort((a, b) => +new Date(a.occurred_at) - +new Date(b.occurred_at))
      : [],
    [events, selectedSession]
  );

  const totals = useMemo(() => {
    const activeSess = sessions.filter((s) => s.is_active).length;
    const uniqueUsers = new Set(sessions.map((s) => s.username).filter((u) => u !== 'anonymous')).size;
    const clicks = sessions.reduce((a, s) => a + s.click_count, 0);
    const views = sessions.reduce((a, s) => a + s.view_count, 0);
    return { activeSess, uniqueUsers, clicks, views, total: sessions.length };
  }, [sessions]);

  return (
    <div className="h-full flex flex-col bg-slate-950 text-slate-100 overflow-hidden">
      <Header totals={totals} loading={loading} onReload={load} />

      <div className="border-b border-slate-800 bg-slate-900/60 px-6 py-3 flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-400" />
          <select
            value={usernameFilter}
            onChange={(e) => setUsernameFilter(e.target.value)}
            className="bg-slate-900 border border-slate-700 text-xs text-slate-200 rounded px-2 py-1.5"
          >
            <option value="all">All users</option>
            {usernames.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>

        <div className="flex gap-1 ml-auto">
          {(['timeline', 'graph', 'heatmap', 'live'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-3 py-1.5 rounded text-xs font-medium capitalize transition ${
                view === v ? 'bg-cyan-500/20 text-cyan-300 ring-1 ring-cyan-500/50' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 grid grid-cols-12 overflow-hidden">
        <SessionList
          sessions={filteredSessions}
          selectedId={selectedSession?.id ?? null}
          onSelect={setSelectedSessionId}
        />

        <div className="col-span-9 overflow-auto p-6">
          {view === 'timeline' && <TimelineView session={selectedSession} events={sessionEvents} />}
          {view === 'graph' && <GraphView events={sessionEvents} edges={edges} />}
          {view === 'heatmap' && <HeatmapView sessions={filteredSessions} events={events} />}
          {view === 'live' && <LiveView sessions={filteredSessions} events={events} />}
        </div>
      </div>
    </div>
  );
}

function Header({ totals, loading, onReload }: { totals: { activeSess: number; uniqueUsers: number; clicks: number; views: number; total: number }; loading: boolean; onReload: () => void }) {
  return (
    <div className="bg-gradient-to-r from-slate-900 via-slate-900 to-emerald-950/30 border-b border-slate-800 p-6 flex items-center justify-between">
      <div className="flex items-center gap-4">
        <div className="relative">
          <div className="absolute inset-0 bg-emerald-500 rounded-xl blur-xl opacity-30" />
          <div className="relative p-3 bg-gradient-to-br from-emerald-500 to-teal-700 rounded-xl">
            <Network className="w-7 h-7 text-white" />
          </div>
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">User Activity Lineage</h1>
          <p className="text-slate-400 text-sm">Every login, view, and click stitched into a causal lineage graph</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Stat label="active sessions" value={totals.activeSess} tone="emerald" />
        <Stat label="unique users" value={totals.uniqueUsers} tone="cyan" />
        <Stat label="views" value={totals.views} tone="sky" />
        <Stat label="clicks" value={totals.clicks} tone="amber" />
        <button
          onClick={onReload}
          className="ml-2 p-2 rounded bg-slate-900 border border-slate-700 hover:border-cyan-500/50 transition"
        >
          <RefreshCw className={`w-4 h-4 text-slate-300 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: 'emerald' | 'cyan' | 'sky' | 'amber' }) {
  const tones = {
    emerald: 'border-emerald-500/30 text-emerald-300',
    cyan: 'border-cyan-500/30 text-cyan-300',
    sky: 'border-sky-500/30 text-sky-300',
    amber: 'border-amber-500/30 text-amber-300',
  };
  return (
    <div className={`px-3 py-1.5 rounded-lg bg-slate-900/70 border ${tones[tone]} min-w-[110px]`}>
      <div className="text-[9px] uppercase tracking-wider text-slate-400">{label}</div>
      <div className="text-xl font-bold">{value}</div>
    </div>
  );
}

function SessionList({ sessions, selectedId, onSelect }: { sessions: Sess[]; selectedId: string | null; onSelect: (id: string) => void }) {
  return (
    <div className="col-span-3 border-r border-slate-800 overflow-y-auto">
      <div className="px-4 py-3 border-b border-slate-800 sticky top-0 bg-slate-950 z-10">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Sessions ({sessions.length})</h3>
      </div>
      <div className="divide-y divide-slate-900">
        {sessions.map((s) => {
          const active = s.id === selectedId;
          const dur = s.ended_at
            ? Math.round((+new Date(s.ended_at) - +new Date(s.started_at)) / 60000)
            : Math.round((Date.now() - +new Date(s.started_at)) / 60000);
          return (
            <button
              key={s.id}
              onClick={() => onSelect(s.id)}
              className={`w-full text-left p-3 transition ${
                active ? 'bg-slate-900 border-l-2 border-l-cyan-400' : 'hover:bg-slate-900/50 border-l-2 border-l-transparent'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${s.is_active ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
                  <span className="text-sm font-semibold text-slate-100">{s.username}</span>
                </div>
                <span className="text-[10px] text-slate-500 font-mono">{dur}m</span>
              </div>
              <div className="flex items-center gap-2 text-[10px] text-slate-500">
                <Globe className="w-3 h-3" />
                <span className="font-mono">{s.ip_address.slice(0, 16)}</span>
              </div>
              <div className="flex items-center gap-3 mt-1.5 text-[10px]">
                <span className="text-cyan-400">{s.view_count} views</span>
                <span className="text-amber-400">{s.click_count} clicks</span>
              </div>
            </button>
          );
        })}
        {sessions.length === 0 && (
          <div className="p-6 text-center text-xs text-slate-500">No sessions yet</div>
        )}
      </div>
    </div>
  );
}

function TimelineView({ session, events }: { session: Sess | undefined; events: Evt[] }) {
  if (!session) return <div className="text-slate-500 text-sm">Select a session.</div>;

  return (
    <div className="space-y-4">
      <SessionHeader session={session} />

      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5">
        <h3 className="text-sm font-bold mb-4 flex items-center gap-2">
          <Clock className="w-4 h-4 text-cyan-400" />
          Event Timeline ({events.length})
        </h3>
        <div className="relative pl-8 border-l-2 border-slate-800 space-y-3">
          {events.map((e, idx) => {
            const prev = events[idx - 1];
            const delta = prev ? Math.round((+new Date(e.occurred_at) - +new Date(prev.occurred_at)) / 1000) : 0;
            const color = EVT_COLOR[e.event_type] ?? '#94a3b8';
            const Icon = EVT_ICON[e.event_type] ?? Activity;
            return (
              <div key={e.id} className="relative">
                <div
                  className="absolute -left-[37px] top-1 w-5 h-5 rounded-full border-2 border-slate-950 flex items-center justify-center"
                  style={{ background: color }}
                >
                  <Icon className="w-2.5 h-2.5 text-slate-950" />
                </div>
                <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 hover:border-slate-700 transition">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase"
                        style={{ background: `${color}22`, color }}
                      >
                        {e.event_type}
                      </span>
                      <span className="text-sm font-medium text-slate-100 truncate">
                        {e.target_label || e.view_label || e.view_id || e.target_id || '(no label)'}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-[10px] text-slate-500">
                      {delta > 0 && <span>+{delta}s</span>}
                      <span className="font-mono">{new Date(e.occurred_at).toLocaleTimeString()}</span>
                    </div>
                  </div>
                  {(e.referrer_view || e.view_id) && (
                    <div className="mt-1.5 flex items-center gap-1 text-[10px] text-slate-500">
                      {e.referrer_view && <span>{e.referrer_view}</span>}
                      {e.referrer_view && e.view_id && <ArrowRight className="w-3 h-3" />}
                      {e.view_id && <span className="text-cyan-400">{e.view_id}</span>}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          {events.length === 0 && (
            <div className="text-xs text-slate-500 italic">No events recorded for this session yet.</div>
          )}
        </div>
      </div>
    </div>
  );
}

function SessionHeader({ session }: { session: Sess }) {
  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Users className="w-5 h-5 text-cyan-400" />
            <h2 className="text-lg font-bold">{session.username}</h2>
            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${session.is_active ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-800 text-slate-400'}`}>
              {session.is_active ? 'ACTIVE' : 'ENDED'}
            </span>
          </div>
          <div className="flex items-center gap-4 text-xs text-slate-400">
            <span className="flex items-center gap-1"><Globe className="w-3 h-3" />{session.ip_address}</span>
            <span className="flex items-center gap-1"><Monitor className="w-3 h-3" />{session.device_type}</span>
            {session.geo_city && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{session.geo_city}, {session.geo_country}</span>}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3 text-right">
          <Mini label="events" value={session.event_count} color="#22d3ee" />
          <Mini label="views" value={session.view_count} color="#38bdf8" />
          <Mini label="clicks" value={session.click_count} color="#eab308" />
        </div>
      </div>
    </div>
  );
}

function Mini({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded bg-slate-950 border border-slate-800 px-3 py-2">
      <div className="text-[9px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="text-lg font-bold" style={{ color }}>{value}</div>
    </div>
  );
}

function GraphView({ events, edges }: { events: Evt[]; edges: LinEdge[] }) {
  const nodes = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const e of events) {
      const key = e.view_id || e.target_label || e.event_type;
      counts[key] = (counts[key] ?? 0) + 1;
    }
    const list = Object.entries(counts).map(([id, count]) => ({ id, count }));
    return list.sort((a, b) => b.count - a.count).slice(0, 24);
  }, [events]);

  const eventIdToView = useMemo(() => {
    const m: Record<string, string> = {};
    for (const e of events) m[e.id] = e.view_id || e.target_label || e.event_type;
    return m;
  }, [events]);

  const filteredEdges = useMemo(() => {
    const valid = new Set(nodes.map((n) => n.id));
    const tally: Record<string, { from: string; to: string; weight: number }> = {};
    for (const ed of edges) {
      const f = eventIdToView[ed.from_event_id] ?? ed.from_view;
      const t = eventIdToView[ed.to_event_id] ?? ed.to_view;
      if (!f || !t || f === t || !valid.has(f) || !valid.has(t)) continue;
      const k = `${f}->${t}`;
      tally[k] = tally[k] ? { from: f, to: t, weight: tally[k].weight + 1 } : { from: f, to: t, weight: 1 };
    }
    return Object.values(tally).sort((a, b) => b.weight - a.weight).slice(0, 60);
  }, [edges, eventIdToView, nodes]);

  const positions = useMemo(() => {
    const cx = 420, cy = 280, r = 220;
    const m: Record<string, { x: number; y: number }> = {};
    nodes.forEach((n, i) => {
      const a = (i / nodes.length) * Math.PI * 2 - Math.PI / 2;
      m[n.id] = { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
    });
    return m;
  }, [nodes]);

  const maxCount = Math.max(1, ...nodes.map((n) => n.count));
  const maxW = Math.max(1, ...filteredEdges.map((e) => e.weight));

  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5">
      <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
        <Network className="w-4 h-4 text-cyan-400" />
        Navigation Lineage Graph
      </h3>
      <p className="text-xs text-slate-400 mb-4">Edges show how users move from one view to another. Thicker = more traversed.</p>

      <svg viewBox="0 0 840 560" className="w-full h-[560px]">
        <defs>
          <marker id="arrow-flow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M0,0 L10,5 L0,10 z" fill="#22d3ee" />
          </marker>
        </defs>
        {filteredEdges.map((ed, i) => {
          const a = positions[ed.from];
          const b = positions[ed.to];
          if (!a || !b) return null;
          const w = 0.8 + (ed.weight / maxW) * 3;
          return (
            <line
              key={i}
              x1={a.x} y1={a.y} x2={b.x} y2={b.y}
              stroke="#22d3ee" strokeOpacity={0.35 + (ed.weight / maxW) * 0.55}
              strokeWidth={w}
              markerEnd="url(#arrow-flow)"
            />
          );
        })}
        {nodes.map((n) => {
          const p = positions[n.id];
          const r = 12 + (n.count / maxCount) * 18;
          return (
            <g key={n.id}>
              <circle cx={p.x} cy={p.y} r={r} fill="#0f172a" stroke="#22d3ee" strokeWidth={2} />
              <circle cx={p.x} cy={p.y} r={r * 0.6} fill="#22d3ee" fillOpacity={0.25} />
              <text x={p.x} y={p.y + 4} textAnchor="middle" fontSize="10" fill="#e2e8f0" fontWeight="600">{n.count}</text>
              <text x={p.x} y={p.y + r + 14} textAnchor="middle" fontSize="10" fill="#94a3b8">{n.id.slice(0, 16)}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function HeatmapView({ sessions, events }: { sessions: Sess[]; events: Evt[] }) {
  const usernames = useMemo(
    () => Array.from(new Set(sessions.map((s) => s.username))).slice(0, 14),
    [sessions]
  );
  const views = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const e of events) {
      const v = e.view_id || e.target_label;
      if (v) counts[v] = (counts[v] ?? 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 18).map((x) => x[0]);
  }, [events]);

  const cell = (u: string, v: string) =>
    events.filter((e) => e.username === u && (e.view_id === v || e.target_label === v)).length;

  const max = Math.max(1, ...usernames.flatMap((u) => views.map((v) => cell(u, v))));

  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5">
      <h3 className="text-sm font-bold mb-3">User × View Heatmap</h3>
      <p className="text-xs text-slate-400 mb-4">Where each user spends their attention.</p>
      <div className="overflow-auto">
        <table className="text-[10px]">
          <thead>
            <tr>
              <th className="px-2 py-1 text-left text-slate-500"></th>
              {views.map((v) => (
                <th key={v} className="px-1 py-1 text-slate-400 align-bottom">
                  <div className="rotate-[-45deg] origin-bottom-left whitespace-nowrap w-6 h-16 flex items-end">
                    {v.slice(0, 14)}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {usernames.map((u) => (
              <tr key={u}>
                <td className="px-2 py-1 text-slate-300 font-medium whitespace-nowrap">{u}</td>
                {views.map((v) => {
                  const c = cell(u, v);
                  const ratio = c / max;
                  return (
                    <td key={v} className="p-0.5">
                      <div
                        className="w-7 h-7 rounded flex items-center justify-center text-[9px] font-mono"
                        style={{
                          background: c === 0 ? '#0f172a' : `rgba(34,211,238,${0.15 + ratio * 0.85})`,
                          color: ratio > 0.5 ? '#0f172a' : '#94a3b8',
                          border: '1px solid #1e293b',
                        }}
                      >
                        {c || ''}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LiveView({ sessions, events }: { sessions: Sess[]; events: Evt[] }) {
  const recent = useMemo(
    () => events.slice(0, 30),
    [events]
  );
  const active = sessions.filter((s) => s.is_active);

  return (
    <div className="space-y-4">
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5">
        <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          Live Sessions ({active.length})
        </h3>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          {active.map((s) => (
            <div key={s.id} className="p-3 rounded bg-slate-950 border border-emerald-500/30">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-semibold text-slate-100">{s.username}</span>
                <span className="text-[10px] font-mono text-emerald-400">live</span>
              </div>
              <div className="text-[10px] text-slate-500 font-mono">{s.ip_address}</div>
              <div className="flex items-center gap-3 mt-2 text-[10px]">
                <span className="text-cyan-400">{s.view_count}v</span>
                <span className="text-amber-400">{s.click_count}c</span>
                <span className="text-slate-500 ml-auto">
                  {Math.round((Date.now() - +new Date(s.last_active_at)) / 1000)}s ago
                </span>
              </div>
            </div>
          ))}
          {active.length === 0 && <div className="text-xs text-slate-500">No active sessions.</div>}
        </div>
      </div>

      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5">
        <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
          <Activity className="w-4 h-4 text-cyan-400" />
          Live Event Feed
        </h3>
        <div className="space-y-1.5 max-h-[480px] overflow-y-auto">
          {recent.map((e) => {
            const color = EVT_COLOR[e.event_type] ?? '#94a3b8';
            return (
              <div key={e.id} className="flex items-center gap-3 p-2 rounded bg-slate-950 border border-slate-800 text-xs">
                <span className="font-mono text-[10px] text-slate-500 w-20">{new Date(e.occurred_at).toLocaleTimeString()}</span>
                <span
                  className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase w-16 text-center"
                  style={{ background: `${color}22`, color }}
                >
                  {e.event_type}
                </span>
                <span className="text-slate-300 font-medium w-24 truncate">{e.username}</span>
                <span className="text-slate-200 truncate flex-1">
                  {e.target_label || e.view_label || e.view_id || '(no label)'}
                </span>
              </div>
            );
          })}
          {recent.length === 0 && <div className="text-xs text-slate-500">Waiting for events...</div>}
        </div>
      </div>
    </div>
  );
}
