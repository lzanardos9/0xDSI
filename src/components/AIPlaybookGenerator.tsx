import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Brain, Sparkles, Play, Zap, Shield, AlertTriangle, Send, ChevronRight, ChevronDown,
  CheckCircle2, XCircle, Clock, User, Server, Globe, Mail, MessageSquare, GitBranch,
  Target, Settings, Download, FileText, Plus, Trash2, Search, Filter, BarChart3,
  Activity, BookOpen, Tag, Layers, ChevronLeft, ArrowUpDown, TrendingUp, Hash
} from 'lucide-react';
import { getAllPlaybooks, getCategories, getSubcategories, getPlaybookStats, type Playbook } from '../lib/playbookLibrary';

type NodeType = 'trigger' | 'condition' | 'action';
interface PNode { id: string; type: NodeType; label: string; detail: string; x: number; y: number; visible: boolean; glowing: boolean; testPassed: boolean }
interface GenStep { label: string; done: boolean; active: boolean }

const ITEMS_PER_PAGE = 24;
const GEN_STEPS = ['Parsing natural language', 'Identifying triggers', 'Building conditions', 'Mapping actions', 'Optimizing playbook'];
const SUGGESTIONS = [
  'Add email notification to the security team after blocking',
  'Include a 5-minute delay before permanent block for false-positive review',
  'Enrich source IP with VirusTotal and AbuseIPDB threat intel',
  'Create a Jira ticket with severity mapping from alert priority',
  'Add rollback action if block causes service degradation',
];

const SEV_COLORS: Record<string, { bg: string; text: string; ring: string }> = {
  Critical: { bg: 'bg-red-500/10', text: 'text-red-400', ring: 'ring-red-500/30' },
  High:     { bg: 'bg-orange-500/10', text: 'text-orange-400', ring: 'ring-orange-500/30' },
  Medium:   { bg: 'bg-amber-500/10', text: 'text-amber-400', ring: 'ring-amber-500/30' },
  Low:      { bg: 'bg-green-500/10', text: 'text-green-400', ring: 'ring-green-500/30' },
};

const STATUS_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  Active:     { bg: 'bg-emerald-500/10', text: 'text-emerald-400', dot: 'bg-emerald-400' },
  Testing:    { bg: 'bg-cyan-500/10', text: 'text-cyan-400', dot: 'bg-cyan-400' },
  Draft:      { bg: 'bg-gray-500/10', text: 'text-gray-400', dot: 'bg-gray-400' },
  Deprecated: { bg: 'bg-red-500/10', text: 'text-red-500', dot: 'bg-red-500' },
};

const CAT_ICONS: Record<string, React.ReactNode> = {
  'Credential & Identity': <Shield size={14}/>,
  'Malware & Ransomware': <AlertTriangle size={14}/>,
  'Phishing & Social Engineering': <Mail size={14}/>,
  'Network & Infrastructure': <Globe size={14}/>,
  'Cloud & SaaS': <Server size={14}/>,
  'Insider Threat': <User size={14}/>,
  'Data Protection': <FileText size={14}/>,
  'Endpoint Security': <Target size={14}/>,
  'Supply Chain & CI/CD': <GitBranch size={14}/>,
  'ICS/OT & Physical': <Zap size={14}/>,
  'AI/ML Security': <Brain size={14}/>,
  'Compliance & Governance': <BookOpen size={14}/>,
  'Financial Security': <Activity size={14}/>,
};

function buildPlaybookNodes(prompt: string): PNode[] {
  const nodes: PNode[] = [];
  const has = (k: string) => prompt.toLowerCase().includes(k);
  let y = 60;
  const cx = 340;
  nodes.push({ id: 't1', type: 'trigger', label: has('brute') ? 'Brute Force Alert' : has('phish') ? 'Phishing Report' : has('ransom') ? 'Ransomware Detected' : has('dns') ? 'DNS Anomaly' : has('lateral') ? 'Lateral Movement' : has('exfil') ? 'Exfil Detected' : 'Alert Triggered', detail: 'Fires when the detection rule matches incoming event stream.', x: cx, y, visible: false, glowing: false, testPassed: false });
  y += 100;
  nodes.push({ id: 'c1', type: 'condition', label: has('critical') || has('threshold') ? 'Severity >= Critical' : 'Confidence > 85%', detail: 'Evaluates alert severity and confidence score before proceeding.', x: cx, y, visible: false, glowing: false, testPassed: false });
  y += 100;
  const actions: [string, string][] = [];
  if (has('block') || has('isolat')) actions.push(['Block / Isolate', 'Blocks IP on firewall or isolates host from network.']);
  if (has('notify') || has('slack') || has('alert')) actions.push(['Notify SOC Team', 'Sends notification via Slack or PagerDuty.']);
  if (has('case') || has('ticket') || has('jira')) actions.push(['Create Case', 'Opens a case in ticketing system with full context.']);
  if (has('enrich') || has('intel') || has('virus')) actions.push(['Enrich IOCs', 'Queries threat intel feeds for additional context.']);
  if (has('quarantin')) actions.push(['Quarantine', 'Quarantines affected files or emails.']);
  if (has('rotate') || has('reset') || has('password')) actions.push(['Rotate Credentials', 'Resets passwords and rotates affected keys.']);
  if (has('scan') || has('sweep')) actions.push(['Fleet Sweep', 'Scans all endpoints for related IOCs.']);
  if (actions.length === 0) { actions.push(['Execute Response', 'Runs the primary automated response action.']); actions.push(['Log & Report', 'Logs all actions and generates incident report.']); }
  actions.forEach(([label, detail], i) => {
    y += 100;
    nodes.push({ id: `a${i}`, type: 'action', label, detail, x: cx, y, visible: false, glowing: false, testPassed: false });
  });
  return nodes;
}

function StatCard({ label, value, sub, icon }: { label: string; value: string | number; sub?: string; icon: React.ReactNode }) {
  return (
    <div className="bg-white/[0.02] border border-gray-700/30 rounded-xl p-4 space-y-1">
      <div className="flex items-center gap-2 text-gray-500 text-xs">{icon}{label}</div>
      <div className="text-2xl font-bold text-white">{typeof value === 'number' ? value.toLocaleString() : value}</div>
      {sub && <div className="text-xs text-gray-500">{sub}</div>}
    </div>
  );
}

export default function AIPlaybookGenerator() {
  const [mode, setMode] = useState<'library' | 'generate'>('library');
  const [search, setSearch] = useState('');
  const [selectedCat, setSelectedCat] = useState<string | null>(null);
  const [selectedSub, setSelectedSub] = useState<string | null>(null);
  const [selectedSev, setSelectedSev] = useState<string | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'name' | 'executions' | 'successRate' | 'severity'>('executions');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(0);
  const [selectedPlaybook, setSelectedPlaybook] = useState<Playbook | null>(null);
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set());

  const [prompt, setPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [genSteps, setGenSteps] = useState<GenStep[]>([]);
  const [nodes, setNodes] = useState<PNode[]>([]);
  const [selectedNode, setSelectedNode] = useState<PNode | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [testRunning, setTestRunning] = useState(false);
  const [dotOffset, setDotOffset] = useState(0);
  const [pulseRings, setPulseRings] = useState(false);
  const animRef = useRef<number>(0);

  const allPlaybooks = useMemo(() => getAllPlaybooks(), []);
  const stats = useMemo(() => getPlaybookStats(), []);
  const categories = useMemo(() => getCategories(), []);

  const subcategories = useMemo(() => {
    return selectedCat ? getSubcategories(selectedCat) : [];
  }, [selectedCat]);

  const filtered = useMemo(() => {
    let list = allPlaybooks;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(p => p.name.toLowerCase().includes(q) || p.tags.some(t => t.includes(q)) || p.category.toLowerCase().includes(q) || p.subcategory.toLowerCase().includes(q) || p.mitre.some(m => m.toLowerCase().includes(q)));
    }
    if (selectedCat) list = list.filter(p => p.category === selectedCat);
    if (selectedSub) list = list.filter(p => p.subcategory === selectedSub);
    if (selectedSev) list = list.filter(p => p.severity === selectedSev);
    if (selectedStatus) list = list.filter(p => p.status === selectedStatus);

    list = [...list].sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'name') cmp = a.name.localeCompare(b.name);
      else if (sortBy === 'executions') cmp = a.executions - b.executions;
      else if (sortBy === 'successRate') cmp = a.successRate - b.successRate;
      else {
        const order = { Critical: 4, High: 3, Medium: 2, Low: 1 };
        cmp = (order[a.severity] || 0) - (order[b.severity] || 0);
      }
      return sortDir === 'desc' ? -cmp : cmp;
    });
    return list;
  }, [allPlaybooks, search, selectedCat, selectedSub, selectedSev, selectedStatus, sortBy, sortDir]);

  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
  const pageItems = filtered.slice(page * ITEMS_PER_PAGE, (page + 1) * ITEMS_PER_PAGE);

  useEffect(() => { setPage(0); }, [search, selectedCat, selectedSub, selectedSev, selectedStatus]);

  useEffect(() => {
    if (mode !== 'generate') return;
    const tick = () => { setDotOffset(p => (p + 0.5) % 40); animRef.current = requestAnimationFrame(tick); };
    animRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animRef.current);
  }, [mode]);

  const catCounts = useMemo(() => {
    const map: Record<string, number> = {};
    allPlaybooks.forEach(p => { map[p.category] = (map[p.category] || 0) + 1; });
    return map;
  }, [allPlaybooks]);

  const sevCounts = useMemo(() => {
    const map: Record<string, number> = {};
    filtered.forEach(p => { map[p.severity] = (map[p.severity] || 0) + 1; });
    return map;
  }, [filtered]);

  const toggleCat = (cat: string) => {
    const next = new Set(expandedCats);
    if (next.has(cat)) { next.delete(cat); } else { next.add(cat); }
    setExpandedCats(next);
  };

  const toggleSort = (col: typeof sortBy) => {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortBy(col); setSortDir('desc'); }
  };

  const generate = useCallback(async () => {
    if (!prompt.trim()) return;
    setGenerating(true); setPulseRings(true); setNodes([]); setSelectedNode(null);
    const steps = GEN_STEPS.map(s => ({ label: s, done: false, active: false }));
    setGenSteps(steps);
    for (let i = 0; i < steps.length; i++) {
      setGenSteps(prev => prev.map((s, j) => ({ ...s, active: j === i, done: j < i })));
      await new Promise(r => setTimeout(r, 600 + Math.random() * 400));
    }
    setGenSteps(prev => prev.map(s => ({ ...s, done: true, active: false })));
    setPulseRings(false);
    const built = buildPlaybookNodes(prompt);
    setNodes(built);
    for (let i = 0; i < built.length; i++) {
      await new Promise(r => setTimeout(r, 300));
      setNodes(prev => prev.map((n, j) => j === i ? { ...n, visible: true } : n));
    }
    setGenerating(false);
  }, [prompt]);

  const testRun = useCallback(async () => {
    if (nodes.length === 0 || testRunning) return;
    setTestRunning(true);
    setNodes(prev => prev.map(n => ({ ...n, testPassed: false, glowing: false })));
    for (let i = 0; i < nodes.length; i++) {
      setNodes(prev => prev.map((n, j) => j === i ? { ...n, glowing: true } : n));
      await new Promise(r => setTimeout(r, 700));
      setNodes(prev => prev.map((n, j) => j === i ? { ...n, glowing: false, testPassed: true } : n));
    }
    setTestRunning(false);
  }, [nodes, testRunning]);

  const mockExport = (fmt: string) => alert(`Exported playbook as ${fmt} (mock)`);
  const nodeColor = (t: NodeType) => t === 'trigger' ? '#F59E0B' : t === 'condition' ? '#14B8A6' : '#3B82F6';
  const totalH = nodes.length > 0 ? nodes[nodes.length - 1].y + 80 : 400;

  return (
    <div className="min-h-screen bg-[#0A1628] text-gray-200 flex flex-col">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-700/50 flex items-center gap-3">
        <div className="p-2 rounded-lg bg-cyan-500/10"><Brain size={22} className="text-cyan-400"/></div>
        <div>
          <h1 className="text-lg font-bold text-white">AI Playbook Engine</h1>
          <p className="text-xs text-gray-500">{stats.total.toLocaleString()} automated response playbooks across {categories.length} categories</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {(['library', 'generate'] as const).map(m => (
            <button key={m} onClick={() => setMode(m)}
              className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all ${mode === m ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30' : 'text-gray-500 hover:text-gray-300 border border-gray-700/30 hover:border-gray-600/50'}`}>
              {m === 'library' ? <span className="flex items-center gap-1.5"><BookOpen size={13}/>Library</span> : <span className="flex items-center gap-1.5"><Sparkles size={13}/>Generate</span>}
            </button>
          ))}
        </div>
      </div>

      {mode === 'library' ? (
        <div className="flex-1 flex min-h-0">
          {/* Category sidebar */}
          <div className="w-64 border-r border-gray-700/50 flex flex-col shrink-0">
            <div className="p-3 border-b border-gray-700/50">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"/>
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search playbooks..."
                  className="w-full pl-9 pr-3 py-2 text-xs bg-[#0D1B2A] border border-gray-700/50 rounded-lg text-gray-200 placeholder-gray-600 focus:outline-none focus:border-cyan-500/50"/>
              </div>
            </div>

            <div className="p-3 border-b border-gray-700/50">
              <div className="flex items-center gap-2 mb-2">
                <Filter size={12} className="text-gray-500"/>
                <span className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Severity</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {['Critical', 'High', 'Medium', 'Low'].map(s => (
                  <button key={s} onClick={() => setSelectedSev(selectedSev === s ? null : s)}
                    className={`px-2 py-1 text-[10px] rounded-md border transition-all ${selectedSev === s ? `${SEV_COLORS[s].bg} ${SEV_COLORS[s].text} border-current` : 'border-gray-700/30 text-gray-500 hover:text-gray-300'}`}>
                    {s} {sevCounts[s] ? `(${sevCounts[s]})` : ''}
                  </button>
                ))}
              </div>
            </div>

            <div className="p-3 border-b border-gray-700/50">
              <div className="flex items-center gap-2 mb-2">
                <Layers size={12} className="text-gray-500"/>
                <span className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Status</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {['Active', 'Testing', 'Draft', 'Deprecated'].map(s => (
                  <button key={s} onClick={() => setSelectedStatus(selectedStatus === s ? null : s)}
                    className={`flex items-center gap-1 px-2 py-1 text-[10px] rounded-md border transition-all ${selectedStatus === s ? `${STATUS_COLORS[s].bg} ${STATUS_COLORS[s].text} border-current` : 'border-gray-700/30 text-gray-500 hover:text-gray-300'}`}>
                    <div className={`w-1.5 h-1.5 rounded-full ${STATUS_COLORS[s].dot}`}/>{s}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
              <button onClick={() => { setSelectedCat(null); setSelectedSub(null); }}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs transition-colors ${!selectedCat ? 'bg-cyan-500/10 text-cyan-400' : 'text-gray-400 hover:bg-white/5 hover:text-white'}`}>
                <span className="font-medium">All Categories</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5">{allPlaybooks.length}</span>
              </button>
              {categories.map(cat => (
                <div key={cat}>
                  <button onClick={() => { toggleCat(cat); setSelectedCat(selectedCat === cat ? null : cat); setSelectedSub(null); }}
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-colors ${selectedCat === cat ? 'bg-cyan-500/10 text-cyan-400' : 'text-gray-400 hover:bg-white/5 hover:text-white'}`}>
                    <span className="text-gray-500">{CAT_ICONS[cat] || <Tag size={14}/>}</span>
                    <span className="flex-1 text-left truncate font-medium">{cat}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5">{catCounts[cat] || 0}</span>
                    <ChevronRight size={12} className={`transition-transform ${expandedCats.has(cat) ? 'rotate-90' : ''}`}/>
                  </button>
                  {expandedCats.has(cat) && selectedCat === cat && (
                    <div className="ml-6 mt-0.5 space-y-0.5">
                      {subcategories.map(sub => {
                        const cnt = allPlaybooks.filter(p => p.category === cat && p.subcategory === sub).length;
                        return (
                          <button key={sub} onClick={() => setSelectedSub(selectedSub === sub ? null : sub)}
                            className={`w-full flex items-center justify-between px-3 py-1.5 rounded-md text-[11px] transition-colors ${selectedSub === sub ? 'bg-cyan-500/10 text-cyan-400' : 'text-gray-500 hover:bg-white/5 hover:text-gray-300'}`}>
                            <span>{sub}</span>
                            <span className="text-[10px]">{cnt}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Main library content */}
          <div className="flex-1 flex flex-col min-w-0">
            {/* Stats bar */}
            <div className="grid grid-cols-4 gap-3 p-4 border-b border-gray-700/50">
              <StatCard label="Total Playbooks" value={stats.total} sub={`${stats.active} active`} icon={<BookOpen size={13}/>}/>
              <StatCard label="Total Executions" value={stats.totalExec} sub="All time" icon={<Activity size={13}/>}/>
              <StatCard label="Avg Success Rate" value={`${stats.avgSuccess}%`} sub="Across all playbooks" icon={<TrendingUp size={13}/>}/>
              <StatCard label="Showing" value={filtered.length} sub={filtered.length !== allPlaybooks.length ? 'filtered results' : 'of all playbooks'} icon={<Filter size={13}/>}/>
            </div>

            {/* Sort row */}
            <div className="flex items-center gap-3 px-4 py-2 border-b border-gray-700/50 text-[10px] text-gray-500 uppercase tracking-wider">
              <span className="flex-1">
                <button onClick={() => toggleSort('name')} className="flex items-center gap-1 hover:text-gray-300 transition-colors">
                  Playbook Name <ArrowUpDown size={10} className={sortBy === 'name' ? 'text-cyan-400' : ''}/>
                </button>
              </span>
              <span className="w-24 text-center">
                <button onClick={() => toggleSort('severity')} className="flex items-center gap-1 hover:text-gray-300 transition-colors">
                  Severity <ArrowUpDown size={10} className={sortBy === 'severity' ? 'text-cyan-400' : ''}/>
                </button>
              </span>
              <span className="w-24 text-center">
                <button onClick={() => toggleSort('executions')} className="flex items-center gap-1 hover:text-gray-300 transition-colors">
                  Executions <ArrowUpDown size={10} className={sortBy === 'executions' ? 'text-cyan-400' : ''}/>
                </button>
              </span>
              <span className="w-24 text-center">
                <button onClick={() => toggleSort('successRate')} className="flex items-center gap-1 hover:text-gray-300 transition-colors">
                  Success <ArrowUpDown size={10} className={sortBy === 'successRate' ? 'text-cyan-400' : ''}/>
                </button>
              </span>
              <span className="w-20 text-center">Status</span>
              <span className="w-16 text-center">Steps</span>
            </div>

            {/* Playbook list */}
            <div className="flex-1 overflow-y-auto">
              {pageItems.map(p => (
                <button key={p.id} onClick={() => setSelectedPlaybook(selectedPlaybook?.id === p.id ? null : p)}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left border-b border-gray-700/20 transition-all hover:bg-white/[0.02] ${selectedPlaybook?.id === p.id ? 'bg-cyan-500/5 border-l-2 border-l-cyan-400' : ''}`}>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-200 truncate">{p.name}</div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-gray-500">{p.category}</span>
                      <span className="text-gray-700">|</span>
                      <span className="text-[10px] text-gray-500">{p.subcategory}</span>
                      {p.mitre.length > 0 && <>
                        <span className="text-gray-700">|</span>
                        <span className="text-[10px] text-cyan-400/60">{p.mitre.join(', ')}</span>
                      </>}
                    </div>
                  </div>
                  <div className="w-24 text-center">
                    <span className={`inline-block px-2 py-0.5 text-[10px] rounded-full ring-1 ${SEV_COLORS[p.severity].bg} ${SEV_COLORS[p.severity].text} ${SEV_COLORS[p.severity].ring}`}>{p.severity}</span>
                  </div>
                  <div className="w-24 text-center text-xs text-gray-400">{p.executions.toLocaleString()}</div>
                  <div className="w-24 text-center">
                    <span className={`text-xs ${p.successRate >= 97 ? 'text-emerald-400' : p.successRate >= 93 ? 'text-cyan-400' : 'text-amber-400'}`}>{p.successRate}%</span>
                  </div>
                  <div className="w-20 text-center">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] rounded-full ${STATUS_COLORS[p.status].bg} ${STATUS_COLORS[p.status].text}`}>
                      <div className={`w-1 h-1 rounded-full ${STATUS_COLORS[p.status].dot}`}/>{p.status}
                    </span>
                  </div>
                  <div className="w-16 text-center text-xs text-gray-500">{p.steps}</div>
                </button>
              ))}
              {pageItems.length === 0 && (
                <div className="flex flex-col items-center justify-center h-64 text-gray-600 gap-2">
                  <Search size={32} strokeWidth={1}/>
                  <p className="text-sm">No playbooks match your filters</p>
                </div>
              )}
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-700/50">
              <span className="text-xs text-gray-500">
                Showing {page * ITEMS_PER_PAGE + 1}-{Math.min((page + 1) * ITEMS_PER_PAGE, filtered.length)} of {filtered.length.toLocaleString()}
              </span>
              <div className="flex items-center gap-1">
                <button onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0}
                  className="p-1.5 rounded-md hover:bg-white/5 text-gray-400 disabled:opacity-30 transition-colors"><ChevronLeft size={14}/></button>
                {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
                  let pageNum: number;
                  if (totalPages <= 7) pageNum = i;
                  else if (page < 4) pageNum = i;
                  else if (page > totalPages - 5) pageNum = totalPages - 7 + i;
                  else pageNum = page - 3 + i;
                  return (
                    <button key={pageNum} onClick={() => setPage(pageNum)}
                      className={`w-7 h-7 text-xs rounded-md transition-colors ${page === pageNum ? 'bg-cyan-500/20 text-cyan-400' : 'text-gray-500 hover:bg-white/5 hover:text-white'}`}>
                      {pageNum + 1}
                    </button>
                  );
                })}
                <button onClick={() => setPage(Math.min(totalPages - 1, page + 1))} disabled={page >= totalPages - 1}
                  className="p-1.5 rounded-md hover:bg-white/5 text-gray-400 disabled:opacity-30 transition-colors"><ChevronRight size={14}/></button>
              </div>
            </div>
          </div>

          {/* Detail panel */}
          {selectedPlaybook && (
            <div className="w-80 border-l border-gray-700/50 shrink-0 overflow-y-auto bg-[#0D1B2A]/50">
              <div className="p-4 space-y-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <span className={`inline-block px-2 py-0.5 text-[10px] rounded-full mb-2 ring-1 ${SEV_COLORS[selectedPlaybook.severity].bg} ${SEV_COLORS[selectedPlaybook.severity].text} ${SEV_COLORS[selectedPlaybook.severity].ring}`}>{selectedPlaybook.severity}</span>
                    <h3 className="text-sm font-bold text-white leading-snug">{selectedPlaybook.name}</h3>
                  </div>
                  <button onClick={() => setSelectedPlaybook(null)} className="text-gray-500 hover:text-white ml-2"><XCircle size={16}/></button>
                </div>

                <div className="flex items-center gap-2 text-xs text-gray-500">
                  {CAT_ICONS[selectedPlaybook.category] || <Tag size={12}/>}
                  <span>{selectedPlaybook.category}</span>
                  <ChevronRight size={10}/>
                  <span>{selectedPlaybook.subcategory}</span>
                </div>

                <p className="text-xs text-gray-400 leading-relaxed">{selectedPlaybook.prompt}</p>

                {selectedPlaybook.mitre.length > 0 && (
                  <div className="space-y-1">
                    <span className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">MITRE ATT&CK</span>
                    <div className="flex flex-wrap gap-1">
                      {selectedPlaybook.mitre.map(m => (
                        <span key={m} className="px-2 py-0.5 text-[10px] rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">{m}</span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-white/[0.02] rounded-lg p-2.5 border border-gray-700/20">
                    <div className="text-[10px] text-gray-500">Executions</div>
                    <div className="text-sm font-bold text-white">{selectedPlaybook.executions.toLocaleString()}</div>
                  </div>
                  <div className="bg-white/[0.02] rounded-lg p-2.5 border border-gray-700/20">
                    <div className="text-[10px] text-gray-500">Avg Time</div>
                    <div className="text-sm font-bold text-cyan-400">{selectedPlaybook.avgTime}</div>
                  </div>
                  <div className="bg-white/[0.02] rounded-lg p-2.5 border border-gray-700/20">
                    <div className="text-[10px] text-gray-500">Success Rate</div>
                    <div className="text-sm font-bold text-emerald-400">{selectedPlaybook.successRate}%</div>
                  </div>
                  <div className="bg-white/[0.02] rounded-lg p-2.5 border border-gray-700/20">
                    <div className="text-[10px] text-gray-500">Steps</div>
                    <div className="text-sm font-bold text-white">{selectedPlaybook.steps}</div>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <span className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Details</span>
                  <div className="flex items-center gap-2 text-xs text-gray-500"><User size={12}/><span>Author: {selectedPlaybook.author}</span></div>
                  <div className="flex items-center gap-2 text-xs text-gray-500"><Clock size={12}/><span>Last triggered: {selectedPlaybook.lastTriggered}</span></div>
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <div className={`w-1.5 h-1.5 rounded-full ${STATUS_COLORS[selectedPlaybook.status].dot}`}/>
                    <span>Status: {selectedPlaybook.status}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-500"><Hash size={12}/><span>ID: PB-{String(selectedPlaybook.id).padStart(4, '0')}</span></div>
                </div>

                <div className="space-y-1.5">
                  <span className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Tags</span>
                  <div className="flex flex-wrap gap-1">
                    {selectedPlaybook.tags.map(t => (
                      <span key={t} className="px-2 py-0.5 text-[10px] rounded-full bg-white/5 text-gray-400 border border-gray-700/30">{t}</span>
                    ))}
                  </div>
                </div>

                {/* Success rate bar */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-gray-500">Success Rate</span>
                    <span className={selectedPlaybook.successRate >= 97 ? 'text-emerald-400' : 'text-cyan-400'}>{selectedPlaybook.successRate}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-gray-800 overflow-hidden">
                    <div className={`h-full rounded-full transition-all duration-500 ${selectedPlaybook.successRate >= 97 ? 'bg-emerald-500' : selectedPlaybook.successRate >= 93 ? 'bg-cyan-500' : 'bg-amber-500'}`}
                      style={{ width: `${selectedPlaybook.successRate}%` }}/>
                  </div>
                </div>

                <div className="pt-2 space-y-1.5 border-t border-gray-700/30">
                  <button onClick={() => { setPrompt(selectedPlaybook.prompt); setMode('generate'); }}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2.5 text-xs rounded-lg bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20 border border-cyan-500/20 transition-colors font-semibold">
                    <Play size={13}/>Open in Generator
                  </button>
                  <div className="flex gap-1.5">
                    {['SOAR', 'JSON', 'YAML'].map(f => (
                      <button key={f} onClick={() => mockExport(f)}
                        className="flex-1 flex items-center justify-center gap-1 px-2 py-2 text-[10px] rounded-lg bg-white/5 hover:bg-white/10 border border-gray-700/50 text-gray-400 hover:text-white transition-colors">
                        <Download size={10}/>{f}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Generate mode */
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex items-center gap-2 px-6 py-2 border-b border-gray-700/50">
            <button onClick={() => setMode('library')} className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-cyan-400 transition-colors">
              <ChevronLeft size={14}/>Back to Library
            </button>
            <div className="ml-auto flex gap-2">
              {['SOAR', 'JSON', 'YAML'].map(f => (
                <button key={f} onClick={() => mockExport(f)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-white/5 hover:bg-white/10 border border-gray-700/50 text-gray-400 hover:text-white transition-colors">
                  <Download size={12}/>{f}
                </button>
              ))}
            </div>
          </div>

          {/* Input area */}
          <div className="px-6 py-4 border-b border-gray-700/50">
            <div className="relative">
              <textarea value={prompt} onChange={e => setPrompt(e.target.value)}
                placeholder="Describe your response workflow in plain English..."
                className="w-full h-24 bg-[#0D1B2A] border border-gray-700/50 rounded-xl px-4 py-3 text-sm text-gray-200 placeholder-gray-600 resize-none focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20"/>
              <div className="absolute bottom-3 right-3 flex gap-2">
                <button onClick={() => setShowSuggestions(!showSuggestions)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20 transition-colors">
                  <Sparkles size={13}/>Suggest
                </button>
                <button onClick={generate} disabled={generating || !prompt.trim()}
                  className="flex items-center gap-1.5 px-4 py-1.5 text-xs rounded-lg bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed font-semibold">
                  <Send size={13}/>Generate
                </button>
              </div>
            </div>
            {showSuggestions && (
              <div className="mt-2 bg-[#0D1B2A] border border-gray-700/50 rounded-xl p-2 space-y-1">
                {SUGGESTIONS.map((s, i) => (
                  <button key={i} onClick={() => { setPrompt(p => p + (p ? ' ' : '') + s); setShowSuggestions(false); }}
                    className="w-full text-left px-3 py-2 text-xs text-gray-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors flex items-center gap-2">
                    <Sparkles size={11} className="text-cyan-400 shrink-0"/>{s}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Generation progress */}
          {genSteps.length > 0 && (
            <div className="px-6 py-3 border-b border-gray-700/50 flex items-center gap-4">
              {pulseRings && (
                <div className="relative w-10 h-10 flex items-center justify-center shrink-0">
                  <Brain size={18} className="text-cyan-400 z-10 animate-pulse"/>
                  {[0, 1, 2].map(i => (
                    <div key={i} className="absolute inset-0 rounded-full border border-cyan-500/30 animate-ping" style={{ animationDelay: `${i * 0.4}s`, animationDuration: '1.5s' }}/>
                  ))}
                </div>
              )}
              <div className="flex gap-3 flex-wrap">
                {genSteps.map((s, i) => (
                  <div key={i} className="flex items-center gap-1.5 text-xs">
                    {s.done ? <CheckCircle2 size={14} className="text-green-400"/> : s.active ? (
                      <div className="w-3.5 h-3.5 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin"/>
                    ) : <div className="w-3.5 h-3.5 rounded-full border border-gray-600"/>}
                    <span className={s.done ? 'text-green-400' : s.active ? 'text-cyan-400' : 'text-gray-600'}>{s.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Playbook canvas + detail panel */}
          <div className="flex-1 flex min-h-0">
            <div className="flex-1 overflow-auto p-6 relative">
              {nodes.length === 0 && !generating && (
                <div className="flex flex-col items-center justify-center h-full text-gray-600 gap-3">
                  <Brain size={48} strokeWidth={1}/>
                  <p className="text-sm">Describe a workflow and click Generate</p>
                </div>
              )}
              {nodes.length > 0 && (
                <div className="relative mx-auto" style={{ width: 680, height: totalH }}>
                  <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ overflow: 'visible' }}>
                    <defs>
                      <filter id="glow"><feGaussianBlur stdDeviation="4" result="g"/><feMerge><feMergeNode in="g"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
                    </defs>
                    {nodes.slice(1).map((n, i) => {
                      const prev = nodes[i];
                      if (!prev.visible || !n.visible) return null;
                      const x1 = prev.x, y1 = prev.y + 28, x2 = n.x, y2 = n.y - 28;
                      const len = Math.sqrt((x2-x1)**2 + (y2-y1)**2);
                      return (
                        <g key={n.id}>
                          <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#334155" strokeWidth={2}/>
                          <circle r={3} fill="#67E8F9"
                            cx={x1 + (x2-x1) * ((dotOffset % len) / len)}
                            cy={y1 + (y2-y1) * ((dotOffset % len) / len)} filter="url(#glow)"/>
                        </g>
                      );
                    })}
                  </svg>
                  {nodes.map(n => {
                    if (!n.visible) return null;
                    const color = nodeColor(n.type);
                    const isCondition = n.type === 'condition';
                    return (
                      <div key={n.id}
                        onClick={() => setSelectedNode(n)}
                        className="absolute cursor-pointer transition-all duration-300"
                        style={{
                          left: n.x - (isCondition ? 75 : 90), top: n.y - 24,
                          animation: 'scaleIn 0.35s ease-out',
                        }}>
                        {isCondition ? (
                          <div className="relative w-[150px] h-[48px] flex items-center justify-center"
                            style={{ filter: n.glowing ? `drop-shadow(0 0 12px ${color})` : undefined }}>
                            <svg viewBox="0 0 150 48" className="absolute inset-0">
                              <polygon points="75,0 150,24 75,48 0,24" fill={`${color}15`} stroke={color} strokeWidth={1.5}/>
                            </svg>
                            <span className="relative text-xs font-medium z-10" style={{ color }}>{n.label}</span>
                            {n.testPassed && <CheckCircle2 size={14} className="absolute -right-2 -top-2 text-green-400 z-20"/>}
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 px-4 py-2 rounded-lg border text-xs font-medium"
                            style={{
                              borderColor: `${color}40`, background: `${color}10`, color,
                              boxShadow: n.glowing ? `0 0 20px ${color}60` : 'none',
                              transition: 'box-shadow 0.3s',
                            }}>
                            {n.type === 'trigger' ? <Zap size={13}/> : <Play size={13}/>}
                            {n.label}
                            {n.testPassed && <CheckCircle2 size={14} className="text-green-400 ml-auto"/>}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              {nodes.length > 0 && (
                <div className="flex justify-center gap-3 mt-4 pb-4">
                  <button onClick={testRun} disabled={testRunning}
                    className="flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-green-500/10 text-green-400 hover:bg-green-500/20 border border-green-500/20 transition-colors disabled:opacity-40">
                    <Play size={14}/>{testRunning ? 'Running...' : 'Test Run'}
                  </button>
                </div>
              )}
            </div>

            {/* Detail panel */}
            {selectedNode && (
              <div className="w-72 border-l border-gray-700/50 p-4 space-y-4 shrink-0 overflow-y-auto bg-[#0D1B2A]/50">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: nodeColor(selectedNode.type) }}>
                    {selectedNode.type}
                  </span>
                  <button onClick={() => setSelectedNode(null)} className="text-gray-500 hover:text-white"><XCircle size={16}/></button>
                </div>
                <h3 className="text-sm font-bold text-white">{selectedNode.label}</h3>
                <p className="text-xs text-gray-400 leading-relaxed">{selectedNode.detail}</p>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-xs text-gray-500"><Clock size={12}/>Avg execution: {(Math.random() * 3 + 0.5).toFixed(1)}s</div>
                  <div className="flex items-center gap-2 text-xs text-gray-500"><CheckCircle2 size={12}/>Success rate: {(95 + Math.random() * 5).toFixed(1)}%</div>
                  <div className="flex items-center gap-2 text-xs text-gray-500"><Settings size={12}/>Last modified: 2 days ago</div>
                </div>
                <div className="pt-2 border-t border-gray-700/30 space-y-1.5">
                  <button className="w-full flex items-center gap-2 px-3 py-2 text-xs rounded-lg hover:bg-white/5 text-gray-400 hover:text-white transition-colors">
                    <FileText size={12}/>Edit Configuration
                  </button>
                  <button className="w-full flex items-center gap-2 px-3 py-2 text-xs rounded-lg hover:bg-white/5 text-gray-400 hover:text-white transition-colors">
                    <Plus size={12}/>Add Condition
                  </button>
                  <button className="w-full flex items-center gap-2 px-3 py-2 text-xs rounded-lg hover:bg-red-500/5 text-red-400/60 hover:text-red-400 transition-colors">
                    <Trash2 size={12}/>Remove Node
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <style>{`
        @keyframes scaleIn {
          from { opacity: 0; transform: scale(0.5); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
