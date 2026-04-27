import { useEffect, useMemo, useState } from 'react';
import { Activity, Ban, BookOpen, Boxes, Cable, CheckCircle2, ChevronRight, Cloud, Cpu, Database, FileCode, Filter, GitBranch, Globe as Globe2, Hexagon, Layers, Microscope, Network, Plug, Radar, Search, Server, Shield, Sparkles, Ticket, Workflow, Wrench, X, Zap } from 'lucide-react';
import { supabase } from '../lib/supabase';

type ServerRow = {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: string;
  transport: string;
  endpoint: string;
  version: string;
  status: string;
  health: string;
  authored_by: string;
  capabilities: Record<string, boolean>;
  tags: string[];
  icon: string;
  accent_color: string;
  total_invocations: number;
  avg_latency_ms: number;
  uptime_percent: number;
  last_invoked_at: string | null;
};

type ToolRow = {
  id: string;
  server_slug: string;
  name: string;
  description: string;
  input_schema: any;
  requires_approval: boolean;
  cost_per_call_cents: number;
};

type ResourceRow = {
  id: string;
  server_slug: string;
  uri: string;
  name: string;
  description: string;
  mime_type: string;
  is_streaming: boolean;
};

type PromptRow = {
  id: string;
  server_slug: string;
  name: string;
  description: string;
  template: string;
  category: string;
};

type InvocationRow = {
  id: string;
  server_slug: string;
  tool_name: string;
  caller_type: string;
  caller_id: string;
  status: string;
  latency_ms: number;
  output_summary: string;
  error_message: string;
  invoked_at: string;
};

type BindingRow = {
  id: string;
  agent_slug: string;
  server_slug: string;
  tool_name: string;
  permission: string;
};

type ClientRow = {
  id: string;
  client_name: string;
  client_type: string;
  user_label: string;
  status: string;
  servers_attached: string[];
  tools_called: number;
  last_seen_at: string;
};

const ICON_MAP: Record<string, any> = {
  Shield, Microscope, Radar, Network, Ban, Activity, Globe2, Database, Cpu,
  Cloud, Ticket, GitBranch, Server,
};

const ACCENT_BG: Record<string, string> = {
  cyan: 'from-cyan-500/20 to-cyan-500/5 border-cyan-400/30 text-cyan-300',
  emerald: 'from-emerald-500/20 to-emerald-500/5 border-emerald-400/30 text-emerald-300',
  sky: 'from-sky-500/20 to-sky-500/5 border-sky-400/30 text-sky-300',
  teal: 'from-teal-500/20 to-teal-500/5 border-teal-400/30 text-teal-300',
  rose: 'from-rose-500/20 to-rose-500/5 border-rose-400/30 text-rose-300',
  amber: 'from-amber-500/20 to-amber-500/5 border-amber-400/30 text-amber-300',
  blue: 'from-blue-500/20 to-blue-500/5 border-blue-400/30 text-blue-300',
  orange: 'from-orange-500/20 to-orange-500/5 border-orange-400/30 text-orange-300',
  red: 'from-red-500/20 to-red-500/5 border-red-400/30 text-red-300',
  slate: 'from-slate-500/20 to-slate-500/5 border-slate-400/30 text-slate-300',
};

const CATEGORY_LABEL: Record<string, string> = {
  native: 'Native',
  threat_intel: 'Threat Intel',
  siem: 'SIEM',
  edr: 'EDR',
  ticketing: 'Ticketing',
  devsecops: 'DevSecOps',
  integration: 'Integration',
};

const TABS = [
  { id: 'overview', label: 'Overview', icon: Sparkles },
  { id: 'servers', label: 'Servers', icon: Server },
  { id: 'tools', label: 'Tools Catalog', icon: Wrench },
  { id: 'resources', label: 'Resources', icon: Database },
  { id: 'prompts', label: 'Prompts', icon: BookOpen },
  { id: 'clients', label: 'Connected Clients', icon: Plug },
  { id: 'bindings', label: 'Agent Bindings', icon: Workflow },
  { id: 'invocations', label: 'Live Invocations', icon: Activity },
  { id: 'gateway', label: 'Gateway Config', icon: Cable },
] as const;

type TabId = typeof TABS[number]['id'];

export default function MCPRegistry() {
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [servers, setServers] = useState<ServerRow[]>([]);
  const [tools, setTools] = useState<ToolRow[]>([]);
  const [resources, setResources] = useState<ResourceRow[]>([]);
  const [prompts, setPrompts] = useState<PromptRow[]>([]);
  const [invocations, setInvocations] = useState<InvocationRow[]>([]);
  const [bindings, setBindings] = useState<BindingRow[]>([]);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [selectedServer, setSelectedServer] = useState<ServerRow | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const [s, t, r, p, i, b, c] = await Promise.all([
        supabase.from('mcp_servers').select('*').order('total_invocations', { ascending: false }),
        supabase.from('mcp_tools').select('*').order('name'),
        supabase.from('mcp_resources').select('*').order('uri'),
        supabase.from('mcp_prompts').select('*').order('name'),
        supabase.from('mcp_tool_invocations').select('*').order('invoked_at', { ascending: false }).limit(200),
        supabase.from('mcp_agent_bindings').select('*').order('agent_slug'),
        supabase.from('mcp_clients').select('*').order('last_seen_at', { ascending: false }),
      ]);
      if (!mounted) return;
      setServers((s.data as ServerRow[]) ?? []);
      setTools((t.data as ToolRow[]) ?? []);
      setResources((r.data as ResourceRow[]) ?? []);
      setPrompts((p.data as PromptRow[]) ?? []);
      setInvocations((i.data as InvocationRow[]) ?? []);
      setBindings((b.data as BindingRow[]) ?? []);
      setClients((c.data as ClientRow[]) ?? []);
      setLoading(false);
    })();
    return () => { mounted = false; };
  }, []);

  const stats = useMemo(() => {
    const totalInv = servers.reduce((a, s) => a + (s.total_invocations || 0), 0);
    const avgLat = servers.length ? Math.round(servers.reduce((a, s) => a + s.avg_latency_ms, 0) / servers.length) : 0;
    const healthy = servers.filter(s => s.health === 'healthy').length;
    const connectedClients = clients.filter(c => c.status === 'connected').length;
    return { totalInv, avgLat, healthy, total: servers.length, connectedClients, tools: tools.length, resources: resources.length, prompts: prompts.length };
  }, [servers, tools, resources, prompts, clients]);

  const categories = useMemo(() => {
    const set = new Set(servers.map(s => s.category));
    return ['all', ...Array.from(set)];
  }, [servers]);

  const filteredServers = useMemo(() => {
    return servers.filter(s => {
      if (categoryFilter !== 'all' && s.category !== categoryFilter) return false;
      if (search && !`${s.name} ${s.description} ${s.tags.join(' ')}`.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [servers, categoryFilter, search]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96 text-slate-500">
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
          Loading MCP registry…
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <Header stats={stats} />
      <TabBar active={activeTab} onChange={setActiveTab} />

      {activeTab === 'overview' && (
        <Overview stats={stats} servers={servers} invocations={invocations} clients={clients} />
      )}
      {activeTab === 'servers' && (
        <ServersTab
          servers={filteredServers}
          search={search} setSearch={setSearch}
          categoryFilter={categoryFilter} setCategoryFilter={setCategoryFilter}
          categories={categories}
          onOpen={setSelectedServer}
          tools={tools} resources={resources} prompts={prompts}
        />
      )}
      {activeTab === 'tools' && <ToolsTab tools={tools} servers={servers} />}
      {activeTab === 'resources' && <ResourcesTab resources={resources} servers={servers} />}
      {activeTab === 'prompts' && <PromptsTab prompts={prompts} servers={servers} />}
      {activeTab === 'clients' && <ClientsTab clients={clients} />}
      {activeTab === 'bindings' && <BindingsTab bindings={bindings} servers={servers} />}
      {activeTab === 'invocations' && <InvocationsTab invocations={invocations} />}
      {activeTab === 'gateway' && <GatewayTab servers={servers} />}

      {selectedServer && (
        <ServerDrawer
          server={selectedServer}
          onClose={() => setSelectedServer(null)}
          tools={tools.filter(t => t.server_slug === selectedServer.slug)}
          resources={resources.filter(r => r.server_slug === selectedServer.slug)}
          prompts={prompts.filter(p => p.server_slug === selectedServer.slug)}
          invocations={invocations.filter(i => i.server_slug === selectedServer.slug).slice(0, 12)}
        />
      )}
    </div>
  );
}

function Header({ stats }: { stats: any }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-cyan-500/20 bg-gradient-to-br from-slate-900 via-[#0a1628] to-slate-900 p-8">
      <div className="absolute -top-24 -right-24 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl" />
      <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl" />
      <div className="relative flex items-start justify-between gap-8 flex-wrap">
        <div className="max-w-3xl">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500 to-emerald-500 flex items-center justify-center shadow-lg shadow-cyan-500/30">
              <Hexagon className="w-6 h-6 text-slate-950" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-50 tracking-tight">Model Context Protocol</h1>
              <p className="text-sm text-slate-400">One protocol. Every tool. Every model. Every analyst.</p>
            </div>
          </div>
          <p className="text-slate-300 text-sm leading-relaxed">
            MCP is the universal bus connecting LLM clients (Claude Desktop, Cursor, VS Code) and the SOC's autonomous agents
            to a curated catalog of <span className="text-cyan-300 font-semibold">tools</span>,
            <span className="text-emerald-300 font-semibold"> resources</span>, and
            <span className="text-amber-300 font-semibold"> prompts</span>. Every invocation is audited, rate-limited, approval-gated where required,
            and bound to chain-of-custody — turning the SOC into an open, programmable security platform.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 min-w-[280px]">
          <Stat label="Servers" value={stats.total} sub={`${stats.healthy} healthy`} accent="cyan" />
          <Stat label="Tools" value={stats.tools} sub="across all servers" accent="emerald" />
          <Stat label="Invocations" value={stats.totalInv.toLocaleString()} sub={`avg ${stats.avgLat}ms`} accent="amber" />
          <Stat label="Live Clients" value={stats.connectedClients} sub={`${clientsTotal(stats)} attached`} accent="rose" />
        </div>
      </div>
    </div>
  );
}

function clientsTotal(stats: any) {
  return stats?.connectedClients || 0;
}

function Stat({ label, value, sub, accent }: { label: string; value: any; sub: string; accent: string }) {
  const colors: Record<string, string> = {
    cyan: 'border-cyan-400/30 bg-cyan-500/5 text-cyan-300',
    emerald: 'border-emerald-400/30 bg-emerald-500/5 text-emerald-300',
    amber: 'border-amber-400/30 bg-amber-500/5 text-amber-300',
    rose: 'border-rose-400/30 bg-rose-500/5 text-rose-300',
  };
  return (
    <div className={`rounded-xl border ${colors[accent]} p-3`}>
      <div className="text-[10px] uppercase tracking-wider opacity-70">{label}</div>
      <div className="text-2xl font-bold mt-1 text-slate-50">{value}</div>
      <div className="text-[11px] text-slate-500 mt-0.5">{sub}</div>
    </div>
  );
}

function TabBar({ active, onChange }: { active: TabId; onChange: (t: TabId) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5 p-1.5 bg-slate-900/60 border border-slate-800 rounded-xl">
      {TABS.map(t => {
        const Icon = t.icon;
        const isActive = active === t.id;
        return (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium transition-all ${
              isActive
                ? 'bg-gradient-to-r from-cyan-500/20 to-emerald-500/20 text-cyan-200 border border-cyan-400/30 shadow-lg shadow-cyan-500/10'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

function Overview({ stats, servers, invocations, clients }: any) {
  const features = [
    {
      icon: Plug,
      title: 'Universal Client Bus',
      color: 'cyan',
      desc: 'Claude Desktop, Cursor, and VS Code attach in one click. Any MCP-capable client becomes a fully-functional SOC console — query alerts, pivot entities, trigger playbooks — without writing a line of code.',
      wow: 'Zero-integration analyst surface',
    },
    {
      icon: Boxes,
      title: 'Curated Tool Catalog',
      color: 'emerald',
      desc: '12 reference servers wrap VirusTotal, Shodan, MISP, AbuseIPDB, GreyNoise, urlscan, Splunk, CrowdStrike, Sentinel, Jira, GitHub, and the SOC core. New intel sources land as schema, not code.',
      wow: 'Pluggable threat intel without redeploys',
    },
    {
      icon: Workflow,
      title: 'Agent ↔ Tool Bindings',
      color: 'amber',
      desc: 'Each of the 35 canonical agents declares its callable tools with explicit permissions (invoke, invoke_with_approval). Atlas triages, Nova investigates, Vanguard contains — all through one protocol.',
      wow: 'Least-privilege by default',
    },
    {
      icon: Shield,
      title: 'Approval-Gated Actions',
      color: 'rose',
      desc: 'Destructive tools (host containment, file detonation, playbook execution) require Tier-3 approval. Every call is logged with chain-of-custody Merkle hashes for forensic-grade auditability.',
      wow: 'SOC2-ready audit trail',
    },
    {
      icon: Activity,
      title: 'Live Invocation Telemetry',
      color: 'sky',
      desc: 'Sub-second SSE streams of tool calls with input payload, output summary, latency, and caller. Spot misuse, runaway agents, and noisy intel sources before they become incidents.',
      wow: 'Observability built in',
    },
    {
      icon: Sparkles,
      title: 'Prompt Library',
      color: 'teal',
      desc: 'Pre-baked analyst flows: triage, IR runbook, threat hunt, CISO briefing, compliance walkthrough. Promote a chat session to a reusable prompt with one click.',
      wow: 'Tribal knowledge as code',
    },
  ];

  const recentInv = invocations.slice(0, 8);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {features.map((f, i) => {
          const Icon = f.icon;
          const gradient: Record<string, string> = {
            cyan: 'from-cyan-500/15 to-cyan-500/0 border-cyan-400/20',
            emerald: 'from-emerald-500/15 to-emerald-500/0 border-emerald-400/20',
            amber: 'from-amber-500/15 to-amber-500/0 border-amber-400/20',
            rose: 'from-rose-500/15 to-rose-500/0 border-rose-400/20',
            sky: 'from-sky-500/15 to-sky-500/0 border-sky-400/20',
            teal: 'from-teal-500/15 to-teal-500/0 border-teal-400/20',
          };
          const text: Record<string, string> = {
            cyan: 'text-cyan-300', emerald: 'text-emerald-300', amber: 'text-amber-300',
            rose: 'text-rose-300', sky: 'text-sky-300', teal: 'text-teal-300',
          };
          return (
            <div key={i} className={`group relative overflow-hidden rounded-xl border bg-gradient-to-br ${gradient[f.color]} p-5 hover:scale-[1.01] transition-transform`}>
              <div className="flex items-start gap-3">
                <div className={`w-10 h-10 rounded-lg bg-slate-900/80 border border-slate-700 flex items-center justify-center ${text[f.color]} group-hover:scale-110 transition-transform`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-bold text-slate-50">{f.title}</h3>
                  <div className={`text-[10px] uppercase tracking-wider mt-0.5 ${text[f.color]}`}>{f.wow}</div>
                </div>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed mt-3">{f.desc}</p>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-cyan-400" />
              <h3 className="text-sm font-semibold text-slate-100">Live Invocations</h3>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-emerald-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              streaming
            </div>
          </div>
          <div className="space-y-2">
            {recentInv.map((inv: InvocationRow) => (
              <div key={inv.id} className="flex items-center gap-3 py-2 border-b border-slate-800/60 last:border-0">
                <StatusDot status={inv.status} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-slate-400">{inv.server_slug}</span>
                    <ChevronRight className="w-3 h-3 text-slate-700" />
                    <span className="text-slate-100 font-medium">{inv.tool_name}</span>
                  </div>
                  <div className="text-[11px] text-slate-500 truncate">{inv.output_summary || inv.error_message}</div>
                </div>
                <div className="text-[11px] text-slate-500 tabular-nums">{inv.latency_ms}ms</div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Plug className="w-4 h-4 text-emerald-400" />
              <h3 className="text-sm font-semibold text-slate-100">Connected Clients</h3>
            </div>
            <span className="text-[11px] text-slate-500">{clients.length} total</span>
          </div>
          <div className="space-y-2">
            {clients.slice(0, 8).map((c: ClientRow) => (
              <div key={c.id} className="flex items-center gap-3 py-2 border-b border-slate-800/60 last:border-0">
                <div className={`w-2 h-2 rounded-full ${c.status === 'connected' ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-slate-100 font-medium truncate">{c.client_name}</div>
                  <div className="text-[11px] text-slate-500 truncate">{c.user_label}</div>
                </div>
                <div className="text-[11px] text-slate-500 tabular-nums">{c.tools_called.toLocaleString()} calls</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-cyan-500/20 bg-gradient-to-br from-cyan-950/30 to-slate-900/40 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Layers className="w-4 h-4 text-cyan-400" />
          <h3 className="text-sm font-semibold text-slate-100">How MCP fits the SOC</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-slate-400 leading-relaxed">
          <div>
            <div className="text-cyan-300 font-semibold text-sm mb-1.5">1. Discover</div>
            Clients (Claude Desktop, IDEs, agents) connect to the MCP gateway and ask: "what can I do here?" The gateway returns the union of tools, resources, and prompts they're entitled to.
          </div>
          <div>
            <div className="text-emerald-300 font-semibold text-sm mb-1.5">2. Invoke</div>
            Calls flow through the gateway, are validated against JSON schemas, rate-limited per server, and approval-gated for destructive actions. Every call is logged with caller, latency, and outcome.
          </div>
          <div>
            <div className="text-amber-300 font-semibold text-sm mb-1.5">3. Audit</div>
            Invocations are written to <code className="text-cyan-300">mcp_tool_invocations</code> with chain-of-custody hashes, surfaced in compliance dashboards, and replayable for post-incident review.
          </div>
        </div>
      </div>
    </div>
  );
}

function ServersTab({ servers, search, setSearch, categoryFilter, setCategoryFilter, categories, onOpen, tools, resources, prompts }: any) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search servers, tags, descriptions…"
            className="w-full pl-10 pr-3 py-2.5 bg-slate-900/60 border border-slate-800 rounded-lg text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500/50"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <Filter className="w-3.5 h-3.5 text-slate-500" />
          {categories.map((c: string) => (
            <button
              key={c}
              onClick={() => setCategoryFilter(c)}
              className={`px-2.5 py-1.5 rounded-md text-[11px] font-medium border transition-colors ${
                categoryFilter === c
                  ? 'bg-cyan-500/15 border-cyan-400/40 text-cyan-200'
                  : 'bg-slate-900/40 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              {c === 'all' ? 'All' : (CATEGORY_LABEL[c] || c)}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {servers.map((s: ServerRow) => {
          const Icon = ICON_MAP[s.icon] || Server;
          const accent = ACCENT_BG[s.accent_color] || ACCENT_BG.cyan;
          const toolCount = tools.filter((t: ToolRow) => t.server_slug === s.slug).length;
          const resCount = resources.filter((r: ResourceRow) => r.server_slug === s.slug).length;
          const promptCount = prompts.filter((p: PromptRow) => p.server_slug === s.slug).length;
          return (
            <button
              key={s.id}
              onClick={() => onOpen(s)}
              className={`group relative overflow-hidden text-left rounded-xl border bg-gradient-to-br ${accent} p-5 hover:scale-[1.01] transition-all`}
            >
              <div className="flex items-start gap-3 mb-3">
                <div className="w-11 h-11 rounded-lg bg-slate-900/80 border border-slate-700 flex items-center justify-center">
                  <Icon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-slate-50 truncate">{s.name}</h3>
                    {s.health === 'healthy' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
                  </div>
                  <div className="text-[11px] text-slate-500 uppercase tracking-wider mt-0.5">{CATEGORY_LABEL[s.category] || s.category} · v{s.version}</div>
                </div>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed line-clamp-3 mb-4">{s.description}</p>
              <div className="flex items-center gap-3 text-[11px]">
                <span className="flex items-center gap-1 text-cyan-300"><Wrench className="w-3 h-3" />{toolCount}</span>
                <span className="flex items-center gap-1 text-emerald-300"><Database className="w-3 h-3" />{resCount}</span>
                <span className="flex items-center gap-1 text-amber-300"><BookOpen className="w-3 h-3" />{promptCount}</span>
                <span className="ml-auto text-slate-500 tabular-nums">{s.total_invocations.toLocaleString()} calls</span>
              </div>
              <div className="flex flex-wrap gap-1 mt-3">
                {s.tags.slice(0, 3).map(t => (
                  <span key={t} className="px-1.5 py-0.5 rounded bg-slate-900/60 text-[10px] text-slate-400 border border-slate-800">{t}</span>
                ))}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ToolsTab({ tools, servers }: { tools: ToolRow[]; servers: ServerRow[] }) {
  const serverMap = useMemo(() => Object.fromEntries(servers.map(s => [s.slug, s])), [servers]);
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/40 overflow-hidden">
      <div className="grid grid-cols-12 gap-3 px-4 py-3 bg-slate-900/80 border-b border-slate-800 text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
        <div className="col-span-3">Tool</div>
        <div className="col-span-2">Server</div>
        <div className="col-span-5">Description</div>
        <div className="col-span-1 text-right">Approval</div>
        <div className="col-span-1 text-right">Cost</div>
      </div>
      <div className="divide-y divide-slate-800/60">
        {tools.map(t => {
          const s = serverMap[t.server_slug];
          return (
            <div key={t.id} className="grid grid-cols-12 gap-3 px-4 py-3 items-center hover:bg-slate-900/40 text-xs">
              <div className="col-span-3 font-mono text-cyan-300">{t.name}</div>
              <div className="col-span-2 text-slate-300">{s?.name || t.server_slug}</div>
              <div className="col-span-5 text-slate-400">{t.description}</div>
              <div className="col-span-1 text-right">
                {t.requires_approval ? (
                  <span className="px-1.5 py-0.5 rounded bg-rose-500/10 border border-rose-400/30 text-rose-300 text-[10px]">required</span>
                ) : (
                  <span className="text-slate-600 text-[10px]">—</span>
                )}
              </div>
              <div className="col-span-1 text-right text-slate-500 tabular-nums">
                {t.cost_per_call_cents > 0 ? `${(t.cost_per_call_cents / 100).toFixed(2)}` : 'free'}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ResourcesTab({ resources, servers }: { resources: ResourceRow[]; servers: ServerRow[] }) {
  const serverMap = useMemo(() => Object.fromEntries(servers.map(s => [s.slug, s])), [servers]);
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {resources.map(r => (
        <div key={r.id} className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
          <div className="flex items-start justify-between gap-2 mb-2">
            <div>
              <code className="text-cyan-300 text-xs font-mono">{r.uri}</code>
              <div className="text-sm font-semibold text-slate-100 mt-1">{r.name}</div>
            </div>
            {r.is_streaming && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-400/30 text-emerald-300 text-[10px]">
                <Zap className="w-3 h-3" /> stream
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">{r.description}</p>
          <div className="mt-2 flex items-center gap-2 text-[11px] text-slate-500">
            <span>{serverMap[r.server_slug]?.name || r.server_slug}</span>
            <span className="text-slate-700">·</span>
            <span className="font-mono">{r.mime_type}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function PromptsTab({ prompts, servers }: { prompts: PromptRow[]; servers: ServerRow[] }) {
  const serverMap = useMemo(() => Object.fromEntries(servers.map(s => [s.slug, s])), [servers]);
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {prompts.map(p => (
        <div key={p.id} className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
          <div className="flex items-center gap-2 mb-2">
            <BookOpen className="w-4 h-4 text-amber-400" />
            <h3 className="text-sm font-bold text-slate-100">{p.name}</h3>
            <span className="ml-auto text-[10px] uppercase tracking-wider text-amber-300/70 px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-400/20">
              {p.category}
            </span>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed mb-3">{p.description}</p>
          <pre className="text-[11px] text-slate-300 bg-slate-950/60 rounded-lg p-3 border border-slate-800 overflow-x-auto whitespace-pre-wrap">
{p.template}
          </pre>
          <div className="mt-2 text-[11px] text-slate-500">{serverMap[p.server_slug]?.name || p.server_slug}</div>
        </div>
      ))}
    </div>
  );
}

function ClientsTab({ clients }: { clients: ClientRow[] }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      {clients.map(c => (
        <div key={c.id} className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 relative overflow-hidden">
          <div className={`absolute top-0 right-0 w-1 h-full ${c.status === 'connected' ? 'bg-emerald-400' : 'bg-slate-700'}`} />
          <div className="flex items-center gap-3 mb-2">
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${c.client_type === 'service' ? 'bg-amber-500/15 text-amber-300' : c.client_type === 'ide' ? 'bg-sky-500/15 text-sky-300' : 'bg-cyan-500/15 text-cyan-300'}`}>
              <Plug className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold text-slate-100 truncate">{c.client_name}</div>
              <div className="text-[11px] text-slate-500 truncate">{c.user_label}</div>
            </div>
          </div>
          <div className="text-[11px] text-slate-400 mb-2">
            <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1.5 ${c.status === 'connected' ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
            {c.status} · {c.tools_called.toLocaleString()} calls
          </div>
          <div className="flex flex-wrap gap-1">
            {c.servers_attached.map(s => (
              <span key={s} className="px-1.5 py-0.5 rounded bg-slate-900/60 text-[10px] text-slate-300 border border-slate-800 font-mono">{s}</span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function BindingsTab({ bindings, servers }: { bindings: BindingRow[]; servers: ServerRow[] }) {
  const serverMap = useMemo(() => Object.fromEntries(servers.map(s => [s.slug, s])), [servers]);
  const grouped = useMemo(() => {
    const m = new Map<string, BindingRow[]>();
    for (const b of bindings) {
      if (!m.has(b.agent_slug)) m.set(b.agent_slug, []);
      m.get(b.agent_slug)!.push(b);
    }
    return Array.from(m.entries());
  }, [bindings]);

  return (
    <div className="space-y-3">
      {grouped.map(([agent, rows]) => (
        <div key={agent} className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded bg-emerald-500/15 border border-emerald-400/30 flex items-center justify-center">
              <Workflow className="w-3.5 h-3.5 text-emerald-300" />
            </div>
            <h3 className="text-sm font-bold text-slate-100">{agent}</h3>
            <span className="text-[11px] text-slate-500 ml-2">{rows.length} tools</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {rows.map(b => (
              <div key={b.id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-950/40 border border-slate-800 text-xs">
                <FileCode className="w-3.5 h-3.5 text-cyan-400" />
                <div className="flex-1 min-w-0">
                  <div className="text-slate-300 truncate font-mono">{b.tool_name}</div>
                  <div className="text-[10px] text-slate-500">{serverMap[b.server_slug]?.name || b.server_slug}</div>
                </div>
                {b.permission === 'invoke_with_approval' && (
                  <span className="px-1.5 py-0.5 rounded bg-rose-500/10 border border-rose-400/30 text-rose-300 text-[9px]">approval</span>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function InvocationsTab({ invocations }: { invocations: InvocationRow[] }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/40 overflow-hidden">
      <div className="grid grid-cols-12 gap-3 px-4 py-3 bg-slate-900/80 border-b border-slate-800 text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
        <div className="col-span-1">Status</div>
        <div className="col-span-2">When</div>
        <div className="col-span-2">Server</div>
        <div className="col-span-2">Tool</div>
        <div className="col-span-2">Caller</div>
        <div className="col-span-2">Output</div>
        <div className="col-span-1 text-right">Latency</div>
      </div>
      <div className="divide-y divide-slate-800/60 max-h-[60vh] overflow-y-auto">
        {invocations.map(i => (
          <div key={i.id} className="grid grid-cols-12 gap-3 px-4 py-2.5 items-center text-xs hover:bg-slate-900/40">
            <div className="col-span-1"><StatusDot status={i.status} /></div>
            <div className="col-span-2 text-slate-500 tabular-nums">{relTime(i.invoked_at)}</div>
            <div className="col-span-2 text-slate-300 font-mono">{i.server_slug}</div>
            <div className="col-span-2 text-cyan-300 font-mono">{i.tool_name}</div>
            <div className="col-span-2 text-slate-400 truncate">{i.caller_id}</div>
            <div className="col-span-2 text-slate-500 truncate">{i.output_summary || i.error_message}</div>
            <div className="col-span-1 text-right text-slate-500 tabular-nums">{i.latency_ms}ms</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function GatewayTab({ servers }: { servers: ServerRow[] }) {
  const config = `# ~/.config/claude-desktop/mcp.json
{
  "mcpServers": {
${servers.slice(0, 4).map(s => `    "${s.slug}": {
      "command": "0xdsi-mcp",
      "args": ["--server", "${s.slug}"],
      "env": { "OXDSI_TOKEN": "\${OXDSI_TOKEN}" }
    }`).join(',\n')}
  }
}`;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
        <div className="flex items-center gap-2 mb-3">
          <Cable className="w-4 h-4 text-cyan-400" />
          <h3 className="text-sm font-bold text-slate-100">Claude Desktop · mcp.json</h3>
        </div>
        <p className="text-xs text-slate-400 mb-3">
          Drop this into <code className="text-cyan-300">~/.config/claude-desktop/mcp.json</code> to attach Claude Desktop to the SOC. Tools surface in the model's context automatically.
        </p>
        <pre className="text-[11px] text-slate-300 bg-slate-950/60 rounded-lg p-4 border border-slate-800 overflow-x-auto">{config}</pre>
      </div>
      <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
        <div className="flex items-center gap-2 mb-3">
          <Server className="w-4 h-4 text-emerald-400" />
          <h3 className="text-sm font-bold text-slate-100">Gateway Endpoints</h3>
        </div>
        <p className="text-xs text-slate-400 mb-3">All traffic flows through the <code className="text-emerald-300">mcp-gateway</code> edge function for policy + audit.</p>
        <div className="space-y-2">
          <Endpoint method="POST" path="/functions/v1/mcp-gateway/list-tools" desc="Discover tools by server" />
          <Endpoint method="POST" path="/functions/v1/mcp-gateway/invoke" desc="Invoke a tool (approval-gated)" />
          <Endpoint method="GET" path="/functions/v1/mcp-gateway/resources/{uri}" desc="Read a resource" />
          <Endpoint method="GET" path="/functions/v1/mcp-gateway/stream/{uri}" desc="SSE stream a resource" />
          <Endpoint method="GET" path="/functions/v1/mcp-gateway/prompts" desc="List + render prompts" />
        </div>
      </div>
      <div className="lg:col-span-2 rounded-xl border border-cyan-500/20 bg-gradient-to-br from-cyan-950/30 to-slate-900/40 p-6">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="w-4 h-4 text-cyan-300" />
          <h3 className="text-sm font-bold text-slate-100">Why this matters</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-slate-400 leading-relaxed">
          <div>
            <div className="text-cyan-300 font-semibold text-sm mb-1.5">Open by design</div>
            Any MCP-compatible client — today and future — works out of the box. No vendor lock-in for analyst tooling.
          </div>
          <div>
            <div className="text-emerald-300 font-semibold text-sm mb-1.5">Safe by default</div>
            JSON schema validation, rate limits, and approval gates live in the gateway, not in client code. You can't bypass them.
          </div>
          <div>
            <div className="text-amber-300 font-semibold text-sm mb-1.5">Audited end-to-end</div>
            Every call lands in <code className="text-cyan-300">mcp_tool_invocations</code> with caller, payload hash, and outcome — replayable in incident review.
          </div>
        </div>
      </div>
    </div>
  );
}

function Endpoint({ method, path, desc }: { method: string; path: string; desc: string }) {
  const colors: Record<string, string> = {
    GET: 'bg-emerald-500/15 text-emerald-300 border-emerald-400/30',
    POST: 'bg-cyan-500/15 text-cyan-300 border-cyan-400/30',
  };
  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-slate-950/50 border border-slate-800">
      <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono border ${colors[method] || colors.GET}`}>{method}</span>
      <code className="text-xs text-slate-200 font-mono flex-1 truncate">{path}</code>
      <span className="text-[11px] text-slate-500">{desc}</span>
    </div>
  );
}

function ServerDrawer({ server, onClose, tools, resources, prompts, invocations }: any) {
  const Icon = ICON_MAP[server.icon] || Server;
  const accent = ACCENT_BG[server.accent_color] || ACCENT_BG.cyan;
  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-2xl h-full bg-[#0A1628] border-l border-slate-800 overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className={`relative overflow-hidden border-b border-slate-800 bg-gradient-to-br ${accent} p-6`}>
          <button onClick={onClose} className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-slate-900/40 text-slate-300">
            <X className="w-4 h-4" />
          </button>
          <div className="flex items-start gap-3">
            <div className="w-12 h-12 rounded-xl bg-slate-900/80 border border-slate-700 flex items-center justify-center">
              <Icon className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-50">{server.name}</h2>
              <div className="text-xs text-slate-400 mt-0.5">{CATEGORY_LABEL[server.category] || server.category} · v{server.version} · {server.transport}</div>
              <code className="text-[11px] text-slate-300 font-mono mt-1 inline-block">{server.endpoint}</code>
            </div>
          </div>
          <p className="text-sm text-slate-300 mt-4 leading-relaxed">{server.description}</p>
          <div className="grid grid-cols-4 gap-2 mt-4">
            <Mini label="Calls" value={server.total_invocations.toLocaleString()} />
            <Mini label="Latency" value={`${server.avg_latency_ms}ms`} />
            <Mini label="Uptime" value={`${server.uptime_percent}%`} />
            <Mini label="Health" value={server.health} />
          </div>
        </div>

        <div className="p-6 space-y-6">
          <Section title="Tools" icon={Wrench} count={tools.length}>
            {tools.map((t: ToolRow) => (
              <div key={t.id} className="px-3 py-2.5 rounded-lg bg-slate-900/40 border border-slate-800">
                <div className="flex items-center gap-2">
                  <code className="text-cyan-300 text-xs font-mono">{t.name}</code>
                  {t.requires_approval && <span className="px-1.5 py-0.5 rounded bg-rose-500/10 border border-rose-400/30 text-rose-300 text-[10px]">approval</span>}
                  {t.cost_per_call_cents > 0 && <span className="px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-400/30 text-amber-300 text-[10px]">${(t.cost_per_call_cents/100).toFixed(2)}/call</span>}
                </div>
                <div className="text-[11px] text-slate-400 mt-1">{t.description}</div>
              </div>
            ))}
          </Section>
          <Section title="Resources" icon={Database} count={resources.length}>
            {resources.map((r: ResourceRow) => (
              <div key={r.id} className="px-3 py-2.5 rounded-lg bg-slate-900/40 border border-slate-800">
                <code className="text-cyan-300 text-xs font-mono">{r.uri}</code>
                <div className="text-[11px] text-slate-400 mt-1">{r.description}</div>
              </div>
            ))}
          </Section>
          <Section title="Prompts" icon={BookOpen} count={prompts.length}>
            {prompts.map((p: PromptRow) => (
              <div key={p.id} className="px-3 py-2.5 rounded-lg bg-slate-900/40 border border-slate-800">
                <div className="text-xs font-bold text-slate-100">{p.name}</div>
                <div className="text-[11px] text-slate-400 mt-1">{p.description}</div>
              </div>
            ))}
          </Section>
          <Section title="Recent Invocations" icon={Activity} count={invocations.length}>
            {invocations.map((i: InvocationRow) => (
              <div key={i.id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-900/40 border border-slate-800 text-xs">
                <StatusDot status={i.status} />
                <code className="text-cyan-300 font-mono">{i.tool_name}</code>
                <span className="text-slate-500 truncate flex-1">{i.output_summary || i.error_message}</span>
                <span className="text-slate-500 tabular-nums text-[11px]">{i.latency_ms}ms</span>
              </div>
            ))}
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({ title, icon: Icon, count, children }: any) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-4 h-4 text-cyan-400" />
        <h3 className="text-sm font-bold text-slate-100">{title}</h3>
        <span className="text-[11px] text-slate-500">{count}</span>
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: any }) {
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-2">
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="text-sm font-bold text-slate-100 mt-0.5">{value}</div>
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  const map: Record<string, string> = {
    success: 'bg-emerald-400',
    error: 'bg-rose-400',
    pending_approval: 'bg-amber-400 animate-pulse',
    timeout: 'bg-orange-400',
  };
  return <span className={`w-2 h-2 rounded-full ${map[status] || 'bg-slate-500'}`} />;
}

function relTime(iso: string) {
  const d = new Date(iso).getTime();
  const diff = Math.max(0, Date.now() - d);
  if (diff < 60_000) return `${Math.floor(diff/1000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff/60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff/3_600_000)}h ago`;
  return `${Math.floor(diff/86_400_000)}d ago`;
}
