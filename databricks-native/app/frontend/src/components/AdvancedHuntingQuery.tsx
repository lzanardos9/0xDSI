import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  Search, Play, Clock, Database, Table, Filter, ChevronRight, ChevronDown,
  Download, Save, History, Code, Eye, Zap, Brain, AlertTriangle, BookOpen,
  Terminal, FileText, Plus, Trash2, Copy, BarChart3, ArrowUpDown, X
} from 'lucide-react';

const TABLES = ['events','alerts','cases','user_behavior_events','sessions','correlation_rules','threat_feeds','vulnerabilities'] as const;
const KW = ['SELECT','FROM','WHERE','AND','OR','JOIN','ORDER','GROUP','LIMIT'];

const SCHEMA: Record<string, {col:string;type:string}[]> = {
  events: [{col:'id',type:'bigint'},{col:'timestamp',type:'datetime'},{col:'source_ip',type:'varchar'},{col:'dest_ip',type:'varchar'},{col:'event_type',type:'varchar'},{col:'severity',type:'int'}],
  alerts: [{col:'id',type:'bigint'},{col:'alert_name',type:'varchar'},{col:'triggered_at',type:'datetime'},{col:'severity',type:'varchar'},{col:'status',type:'varchar'}],
  cases: [{col:'id',type:'bigint'},{col:'title',type:'varchar'},{col:'assignee',type:'varchar'},{col:'priority',type:'int'},{col:'created_at',type:'datetime'}],
  user_behavior_events: [{col:'id',type:'bigint'},{col:'user_id',type:'varchar'},{col:'action',type:'varchar'},{col:'risk_score',type:'float'},{col:'timestamp',type:'datetime'}],
  sessions: [{col:'id',type:'bigint'},{col:'user_id',type:'varchar'},{col:'start_time',type:'datetime'},{col:'end_time',type:'datetime'},{col:'ip_address',type:'varchar'}],
  correlation_rules: [{col:'id',type:'bigint'},{col:'rule_name',type:'varchar'},{col:'condition',type:'text'},{col:'action',type:'varchar'},{col:'enabled',type:'boolean'}],
  threat_feeds: [{col:'id',type:'bigint'},{col:'indicator',type:'varchar'},{col:'feed_source',type:'varchar'},{col:'threat_type',type:'varchar'},{col:'confidence',type:'float'}],
  vulnerabilities: [{col:'id',type:'bigint'},{col:'cve_id',type:'varchar'},{col:'cvss_score',type:'float'},{col:'affected_asset',type:'varchar'},{col:'status',type:'varchar'}],
};

const SAVED_HUNTS = [
  {name:'Lateral Movement',desc:'Detect lateral movement via SMB/RDP',mitre:'T1021',query:"SELECT * FROM events\nWHERE event_type IN ('smb_connect','rdp_session')\nAND source_ip != dest_ip\nORDER BY timestamp DESC\nLIMIT 100"},
  {name:'PowerShell Execution',desc:'Suspicious PowerShell with encoded commands',mitre:'T1059.001',query:"SELECT * FROM events\nWHERE event_type = 'process_start'\nAND source_ip LIKE '%powershell%'\nLIMIT 50"},
  {name:'Suspicious DNS',desc:'High-entropy DNS queries indicating tunneling',mitre:'T1071.004',query:"SELECT * FROM events\nWHERE event_type = 'dns_query'\nAND severity > 3\nORDER BY timestamp DESC"},
  {name:'Credential Dumping',desc:'LSASS access and credential theft attempts',mitre:'T1003',query:"SELECT * FROM user_behavior_events\nWHERE action = 'credential_access'\nAND risk_score > 0.7"},
  {name:'Data Exfil by Volume',desc:'Large outbound data transfers',mitre:'T1048',query:"SELECT source_ip, dest_ip, SUM(severity) as total\nFROM events\nWHERE event_type = 'data_transfer'\nGROUP BY source_ip, dest_ip\nORDER BY total DESC"},
  {name:'Beaconing Detection',desc:'Periodic callback patterns to C2',mitre:'T1071',query:"SELECT source_ip, dest_ip, COUNT(*) as cnt\nFROM events\nWHERE event_type = 'http_request'\nGROUP BY source_ip, dest_ip\nORDER BY cnt DESC\nLIMIT 20"},
  {name:'Priv Escalation Chains',desc:'Privilege escalation event sequences',mitre:'T1068',query:"SELECT * FROM user_behavior_events\nWHERE action LIKE '%escalat%'\nAND risk_score > 0.5\nORDER BY timestamp"},
  {name:'LOLBins',desc:'Living-off-the-land binary execution',mitre:'T1218',query:"SELECT * FROM events\nWHERE event_type = 'process_start'\nAND source_ip IN ('certutil','mshta','regsvr32')\nLIMIT 100"},
];

const AI_QUERIES = [
  {title:'Anomalous Login Patterns',desc:'Detect logins from unusual geolocations at odd hours',query:"SELECT * FROM sessions WHERE ip_address NOT IN (SELECT ip_address FROM sessions GROUP BY ip_address HAVING COUNT(*) > 5)"},
  {title:'Correlated Threat Chain',desc:'Join alerts with threat feeds for enriched detection',query:"SELECT a.*, t.threat_type FROM alerts a JOIN threat_feeds t ON a.alert_name LIKE '%' || t.indicator || '%'"},
  {title:'Vulnerability Exploitation',desc:'Match active vulns with exploit events',query:"SELECT v.cve_id, e.* FROM vulnerabilities v JOIN events e ON e.dest_ip = v.affected_asset WHERE v.cvss_score > 7"},
];

const MOCK_RESULTS = Array.from({length:25},(_,i)=>({
  id:1000+i, timestamp:`2026-04-${String(23-i%10).padStart(2,'0')} ${String(8+i%12).padStart(2,'0')}:${String(i*3%60).padStart(2,'0')}:00`,
  source_ip:`10.0.${i%5}.${100+i}`, dest_ip:`192.168.1.${i+1}`, event_type:['process_start','dns_query','smb_connect','http_request','data_transfer'][i%5],
  severity:1+(i%5), details:`Event detail row ${i+1} - sample forensic data for investigation`
}));

function highlightSyntax(code: string): React.ReactNode[] {
  return code.split('\n').map((line, li) => {
    const parts: React.ReactNode[] = [];
    let remaining = line;
    let key = 0;
    while (remaining.length > 0) {
      let earliest = remaining.length, eType = '', eMatch = '';
      const kwRe = new RegExp(`\\b(${KW.join('|')})\\b`, 'i');
      const km = remaining.match(kwRe);
      if (km && km.index! < earliest) { earliest = km.index!; eType = 'kw'; eMatch = km[0]; }
      const sm = remaining.match(/'[^']*'/);
      if (sm && sm.index! < earliest) { earliest = sm.index!; eType = 'str'; eMatch = sm[0]; }
      const nm = remaining.match(/\b\d+(\.\d+)?\b/);
      if (nm && nm.index! < earliest) { earliest = nm.index!; eType = 'num'; eMatch = nm[0]; }
      if (eType === '') { parts.push(<span key={`${li}-${key++}`}>{remaining}</span>); break; }
      if (earliest > 0) parts.push(<span key={`${li}-${key++}`}>{remaining.slice(0, earliest)}</span>);
      const cls = eType === 'kw' ? 'text-blue-400 font-bold' : eType === 'str' ? 'text-green-400' : 'text-amber-400';
      parts.push(<span key={`${li}-${key++}`} className={cls}>{eMatch}</span>);
      remaining = remaining.slice(earliest + eMatch.length);
    }
    return <div key={li} className="leading-6">{parts.length ? parts : '\u00A0'}</div>;
  });
}

export default function AdvancedHuntingQuery() {
  const [query, setQuery] = useState("SELECT * FROM events\nWHERE severity > 3\nAND event_type = 'dns_query'\nORDER BY timestamp DESC\nLIMIT 100");
  const [mode, setMode] = useState<'code'|'visual'>('code');
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('');
  const [results, setResults] = useState<typeof MOCK_RESULTS|null>(null);
  const [execTime, setExecTime] = useState(0);
  const [sortCol, setSortCol] = useState('');
  const [sortAsc, setSortAsc] = useState(true);
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [schemaOpen, setSchemaOpen] = useState<Set<string>>(new Set());
  const [showAC, setShowAC] = useState(false);
  const [acItems, setAcItems] = useState<string[]>([]);
  const [acPos, setAcPos] = useState({top:0,left:0});
  const [visualFilters, setVisualFilters] = useState([{col:'severity',op:'>',val:'3'}]);
  const [visualSource, setVisualSource] = useState('events');
  const [visibleRows, setVisibleRows] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  const runQuery = useCallback(() => {
    setRunning(true); setProgress(0); setResults(null); setVisibleRows(0);
    const phases = [{p:30,t:'Scanning tables...'},{p:60,t:'Aggregating results...'},{p:90,t:'Finalizing...'}];
    let i = 0;
    const iv = setInterval(() => {
      if (i < phases.length) { setProgress(phases[i].p); setStatusText(phases[i].t); i++; }
      else { setProgress(100); setStatusText('Complete'); clearInterval(iv);
        setTimeout(() => { setRunning(false); setResults(MOCK_RESULTS); setExecTime(1.47 + Math.random()*2);
          let r = 0; const rv = setInterval(() => { r += 3; setVisibleRows(Math.min(r, MOCK_RESULTS.length)); if(r >= MOCK_RESULTS.length) clearInterval(rv); }, 60);
        }, 400);
      }
    }, 700);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.ctrlKey && e.key === 'Enter') { e.preventDefault(); runQuery(); }};
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [runQuery]);

  const handleQueryChange = (val: string) => {
    setQuery(val);
    const words = val.split(/\s+/);
    const last = words[words.length - 1]?.toLowerCase() || '';
    const matches = TABLES.filter(t => t.startsWith(last) && last.length > 1);
    if (matches.length > 0 && last.length > 1) {
      setAcItems(matches); setShowAC(true);
      if (textareaRef.current) {
        const ta = textareaRef.current;
        setAcPos({top: Math.min(ta.scrollHeight, 120), left: 80});
      }
    } else setShowAC(false);
  };

  const insertAC = (t: string) => {
    const words = query.split(/\s+/); words[words.length-1] = t;
    setQuery(words.join(' ')); setShowAC(false); textareaRef.current?.focus();
  };

  const syncScroll = () => {
    if (overlayRef.current && textareaRef.current) {
      overlayRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  };

  const sorted = useMemo(() => {
    if (!results) return [];
    const d = [...results]; if (!sortCol) return d;
    return d.sort((a:any,b:any) => { const av=a[sortCol],bv=b[sortCol]; return sortAsc ? (av>bv?1:-1) : (av<bv?1:-1); });
  }, [results, sortCol, sortAsc]);

  const exportData = (fmt: 'csv'|'json') => {
    if (!results) return;
    const data = fmt === 'json' ? JSON.stringify(results, null, 2) :
      [Object.keys(results[0]).join(','), ...results.map(r => Object.values(r).join(','))].join('\n');
    const blob = new Blob([data], {type: fmt==='json'?'application/json':'text/csv'});
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `hunt_results.${fmt}`; a.click();
  };

  const lines = query.split('\n');

  return (
    <div className="min-h-screen bg-[#0A1628] text-gray-200 flex">
      {/* Saved Hunts Sidebar */}
      <div className="w-72 border-r border-gray-700/50 bg-[#0D1B2A] p-4 overflow-y-auto flex-shrink-0">
        <div className="flex items-center gap-2 mb-4"><History className="w-4 h-4 text-blue-400"/><span className="font-semibold text-sm">Saved Hunts</span></div>
        {SAVED_HUNTS.map((h,i) => (
          <div key={i} className="mb-3 p-3 rounded-lg bg-[#1B2B44]/60 border border-gray-700/40 hover:border-blue-500/40 transition-all group">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium text-gray-100">{h.name}</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 font-mono">{h.mitre}</span>
            </div>
            <p className="text-xs text-gray-500 mb-2">{h.desc}</p>
            <button onClick={() => setQuery(h.query)} className="text-xs px-2 py-1 rounded bg-blue-600/20 text-blue-400 hover:bg-blue-600/40 transition-colors flex items-center gap-1">
              <BookOpen className="w-3 h-3"/>Load
            </button>
          </div>
        ))}
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-700/50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Terminal className="w-5 h-5 text-blue-400"/>
            <h1 className="text-lg font-bold">Advanced Hunting</h1>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setMode('code')} className={`px-3 py-1.5 rounded text-xs flex items-center gap-1.5 transition-colors ${mode==='code'?'bg-blue-600 text-white':'bg-gray-800 text-gray-400 hover:text-gray-200'}`}>
              <Code className="w-3.5 h-3.5"/>Code
            </button>
            <button onClick={() => setMode('visual')} className={`px-3 py-1.5 rounded text-xs flex items-center gap-1.5 transition-colors ${mode==='visual'?'bg-blue-600 text-white':'bg-gray-800 text-gray-400 hover:text-gray-200'}`}>
              <Eye className="w-3.5 h-3.5"/>Visual
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Query Editor */}
          {mode === 'code' ? (
            <div className="relative rounded-lg border border-gray-700/50 bg-[#0D1B2A] overflow-hidden">
              <div className="flex">
                {/* Line Numbers */}
                <div className="w-10 flex-shrink-0 bg-[#081220] text-gray-600 text-xs text-right pt-3 pr-2 select-none font-mono">
                  {lines.map((_,i) => <div key={i} className="leading-6">{i+1}</div>)}
                </div>
                {/* Editor Area */}
                <div className="flex-1 relative">
                  <div ref={overlayRef} className="absolute inset-0 p-3 font-mono text-sm pointer-events-none overflow-hidden whitespace-pre" aria-hidden>
                    {highlightSyntax(query)}
                  </div>
                  <textarea ref={textareaRef} value={query} onChange={e => handleQueryChange(e.target.value)} onScroll={syncScroll}
                    className="w-full h-40 p-3 bg-transparent text-transparent caret-gray-200 font-mono text-sm resize-none outline-none relative z-10"
                    spellCheck={false}/>
                </div>
              </div>
              {/* Autocomplete */}
              {showAC && (
                <div className="absolute z-20 bg-[#1B2B44] border border-gray-600 rounded shadow-xl" style={{top:acPos.top,left:acPos.left}}>
                  {acItems.map(t => (
                    <div key={t} onClick={() => insertAC(t)} className="px-3 py-1.5 text-xs font-mono hover:bg-blue-600/30 cursor-pointer flex items-center gap-2">
                      <Table className="w-3 h-3 text-blue-400"/>{t}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* Visual Mode */
            <div className="rounded-lg border border-gray-700/50 bg-[#0D1B2A] p-4 space-y-3">
              <div className="flex items-center gap-3">
                <label className="text-xs text-gray-400">Source:</label>
                <select value={visualSource} onChange={e => setVisualSource(e.target.value)}
                  className="bg-[#1B2B44] border border-gray-600 rounded px-2 py-1 text-sm text-gray-200 outline-none">
                  {TABLES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="text-xs text-gray-400 flex items-center gap-1"><Filter className="w-3 h-3"/>Filters:</div>
              {visualFilters.map((f,i) => (
                <div key={i} className="flex items-center gap-2">
                  <select value={f.col} onChange={e => { const nf=[...visualFilters]; nf[i]={...nf[i],col:e.target.value}; setVisualFilters(nf); }}
                    className="bg-[#1B2B44] border border-gray-600 rounded px-2 py-1 text-xs text-gray-200 outline-none">
                    {SCHEMA[visualSource]?.map(c => <option key={c.col} value={c.col}>{c.col}</option>)}
                  </select>
                  <select value={f.op} onChange={e => { const nf=[...visualFilters]; nf[i]={...nf[i],op:e.target.value}; setVisualFilters(nf); }}
                    className="bg-[#1B2B44] border border-gray-600 rounded px-2 py-1 text-xs text-gray-200 outline-none w-16">
                    {['=','!=','>','<','>=','<=','LIKE','IN'].map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                  <input value={f.val} onChange={e => { const nf=[...visualFilters]; nf[i]={...nf[i],val:e.target.value}; setVisualFilters(nf); }}
                    className="bg-[#1B2B44] border border-gray-600 rounded px-2 py-1 text-xs text-gray-200 outline-none flex-1"/>
                  <button onClick={() => setVisualFilters(visualFilters.filter((_,j)=>j!==i))} className="text-red-400 hover:text-red-300"><Trash2 className="w-3.5 h-3.5"/></button>
                </div>
              ))}
              <button onClick={() => setVisualFilters([...visualFilters,{col:SCHEMA[visualSource]?.[0]?.col||'id',op:'=',val:''}])}
                className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"><Plus className="w-3 h-3"/>Add Filter</button>
            </div>
          )}

          {/* Run Bar */}
          <div className="flex items-center gap-3">
            <button onClick={runQuery} disabled={running}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-sm font-medium flex items-center gap-2 transition-colors">
              <Play className="w-4 h-4"/>{running ? 'Running...' : 'Run Query'}
            </button>
            <span className="text-xs text-gray-500">Ctrl+Enter</span>
            <div className="flex-1"/>
            <button onClick={() => navigator.clipboard.writeText(query)} className="p-2 rounded hover:bg-gray-800 text-gray-400"><Copy className="w-4 h-4"/></button>
            <button className="p-2 rounded hover:bg-gray-800 text-gray-400"><Save className="w-4 h-4"/></button>
          </div>

          {/* Progress Bar */}
          {running && (
            <div className="space-y-2">
              <div className="h-2 rounded-full bg-gray-800 overflow-hidden">
                <div className="h-full rounded-full bg-gradient-to-r from-blue-600 via-cyan-400 to-blue-600 transition-all duration-700 ease-out relative"
                  style={{width:`${progress}%`}}>
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-pulse"/>
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs text-cyan-400">
                <Search className="w-3 h-3 animate-spin"/>{statusText}
                <span className="text-gray-500 ml-auto">{progress}%</span>
              </div>
            </div>
          )}

          {/* Results */}
          {results && (
            <div className="space-y-4">
              {/* Stats Bar */}
              <div className="flex items-center gap-4 text-xs">
                <span className="flex items-center gap-1 text-green-400"><Zap className="w-3 h-3"/>{results.length} results</span>
                <span className="flex items-center gap-1 text-gray-400"><Clock className="w-3 h-3"/>{execTime.toFixed(2)}s</span>
                <div className="flex-1"/>
                <button onClick={() => exportData('csv')} className="px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 flex items-center gap-1">
                  <Download className="w-3 h-3"/>CSV
                </button>
                <button onClick={() => exportData('json')} className="px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 flex items-center gap-1">
                  <FileText className="w-3 h-3"/>JSON
                </button>
              </div>

              {/* Results Table */}
              <div className="rounded-lg border border-gray-700/50 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-[#1B2B44]">
                        <th className="w-8 p-2"/>
                        {results[0] && Object.keys(results[0]).filter(k=>k!=='details').map(k => (
                          <th key={k} onClick={() => { setSortAsc(sortCol===k?!sortAsc:true); setSortCol(k); }}
                            className="p-2 text-left text-gray-400 font-medium cursor-pointer hover:text-gray-200 select-none whitespace-nowrap">
                            <span className="flex items-center gap-1">{k}<ArrowUpDown className="w-3 h-3 opacity-40"/></span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {sorted.slice(0, visibleRows).map((r: any, i: number) => (
                        <React.Fragment key={r.id}>
                          <tr className="border-t border-gray-800/50 hover:bg-[#1B2B44]/40 transition-all"
                            style={{opacity: 1, animation: `fadeSlideIn 0.3s ease ${i*0.04}s both`}}>
                            <td className="p-2 text-center cursor-pointer" onClick={() => {
                              const s = new Set(expandedRows); s.has(r.id) ? s.delete(r.id) : s.add(r.id); setExpandedRows(s);
                            }}>
                              {expandedRows.has(r.id) ? <ChevronDown className="w-3 h-3 text-gray-500"/> : <ChevronRight className="w-3 h-3 text-gray-500"/>}
                            </td>
                            {Object.entries(r).filter(([k])=>k!=='details').map(([k,v]) => (
                              <td key={k} className="p-2 font-mono whitespace-nowrap">{String(v)}</td>
                            ))}
                          </tr>
                          {expandedRows.has(r.id) && (
                            <tr className="bg-[#0D1B2A]"><td colSpan={10} className="p-3 text-xs text-gray-400">
                              <div className="flex items-start gap-2"><AlertTriangle className="w-3 h-3 text-amber-400 mt-0.5 flex-shrink-0"/>{r.details}</div>
                            </td></tr>
                          )}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Query Statistics */}
              <div className="grid grid-cols-4 gap-3">
                {[
                  {label:'Execution Time',value:`${execTime.toFixed(2)}s`,icon:Clock,color:'text-blue-400'},
                  {label:'Rows Scanned',value:'14,283',icon:BarChart3,color:'text-green-400'},
                  {label:'Data Processed',value:'2.4 MB',icon:Database,color:'text-purple-400'},
                  {label:'Performance',value:'Optimal',icon:Zap,color:'text-amber-400'},
                ].map((s,i) => (
                  <div key={i} className="p-3 rounded-lg bg-[#0D1B2A] border border-gray-700/40">
                    <div className="flex items-center gap-2 mb-1"><s.icon className={`w-3.5 h-3.5 ${s.color}`}/><span className="text-[10px] text-gray-500 uppercase">{s.label}</span></div>
                    <div className="text-sm font-semibold">{s.value}</div>
                  </div>
                ))}
              </div>
              <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/5 border border-amber-500/20 text-xs text-amber-300">
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0"/>
                <span>Performance tip: Adding an index on <code className="px-1 py-0.5 bg-amber-500/10 rounded font-mono">events.timestamp</code> could reduce scan time by ~40%.</span>
              </div>
            </div>
          )}

          {/* AI Query Insights */}
          <div className="rounded-lg border border-purple-500/30 bg-gradient-to-br from-purple-500/5 to-blue-500/5 p-4">
            <div className="flex items-center gap-2 mb-3"><Brain className="w-4 h-4 text-purple-400"/><span className="text-sm font-semibold text-purple-300">AI Query Insights</span></div>
            <div className="grid grid-cols-3 gap-3">
              {AI_QUERIES.map((q,i) => (
                <div key={i} className="p-3 rounded-lg bg-[#0D1B2A]/80 border border-gray-700/40 hover:border-purple-500/40 transition-all group">
                  <div className="text-xs font-medium text-gray-200 mb-1">{q.title}</div>
                  <p className="text-[10px] text-gray-500 mb-2">{q.desc}</p>
                  <button onClick={() => setQuery(q.query)} className="text-[10px] px-2 py-1 rounded bg-purple-600/20 text-purple-400 hover:bg-purple-600/40 transition-colors flex items-center gap-1">
                    <Zap className="w-2.5 h-2.5"/>Use Query
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Schema Explorer Sidebar */}
      <div className="w-64 border-l border-gray-700/50 bg-[#0D1B2A] p-4 overflow-y-auto flex-shrink-0">
        <div className="flex items-center gap-2 mb-4"><Database className="w-4 h-4 text-blue-400"/><span className="font-semibold text-sm">Schema Explorer</span></div>
        {Object.entries(SCHEMA).map(([table, cols]) => {
          const open = schemaOpen.has(table);
          return (
            <div key={table} className="mb-1">
              <button onClick={() => { const s = new Set(schemaOpen); s.has(table)?s.delete(table):s.add(table); setSchemaOpen(s); }}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-[#1B2B44]/60 transition-all text-xs">
                {open ? <ChevronDown className="w-3 h-3 text-gray-500"/> : <ChevronRight className="w-3 h-3 text-gray-500"/>}
                <Table className="w-3 h-3 text-blue-400"/><span className="font-mono text-gray-300">{table}</span>
              </button>
              <div className={`overflow-hidden transition-all duration-300 ease-in-out ${open ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'}`}>
                <div className="ml-7 py-1 space-y-0.5">
                  {cols.map(c => (
                    <div key={c.col} className="flex items-center justify-between px-2 py-0.5 text-[10px] rounded hover:bg-[#1B2B44]/40">
                      <span className="text-gray-400 font-mono">{c.col}</span>
                      <span className="text-gray-600 font-mono">{c.type}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Global animation keyframes */}
      <style>{`
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}