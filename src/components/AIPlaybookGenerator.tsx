import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Brain, Sparkles, Play, Zap, Shield, AlertTriangle, Send, ChevronRight, ChevronDown,
  CheckCircle2, XCircle, Clock, User, Server, Globe, Mail, MessageSquare, GitBranch,
  Target, Settings, Download, FileText, Plus, Trash2
} from 'lucide-react';

type NodeType = 'trigger' | 'condition' | 'action';
interface PNode { id: string; type: NodeType; label: string; detail: string; x: number; y: number; visible: boolean; glowing: boolean; testPassed: boolean }
interface Template { name: string; icon: React.ReactNode; prompt: string }
interface GenStep { label: string; done: boolean; active: boolean }

const TEMPLATES: Template[] = [
  { name: 'Brute Force Response', icon: <Shield size={16}/>, prompt: 'When a critical brute force alert fires, block the source IP on the firewall, notify SOC team on Slack, create a case in the ticketing system, and enrich with threat intel.' },
  { name: 'Phishing Containment', icon: <Mail size={16}/>, prompt: 'When a phishing email is reported, quarantine the email, extract IOCs, check if any user clicked the link, isolate affected endpoints, and notify the security team.' },
  { name: 'Ransomware Isolation', icon: <AlertTriangle size={16}/>, prompt: 'When ransomware indicators are detected, isolate the host from the network, kill malicious processes, snapshot the disk, alert incident response, and block C2 domains.' },
  { name: 'Data Exfil Block', icon: <Globe size={16}/>, prompt: 'When data exfiltration is detected over DNS or HTTPS, block the destination, terminate the session, quarantine the source host, and generate a forensic report.' },
  { name: 'Priv Escalation', icon: <User size={16}/>, prompt: 'When privilege escalation is detected, disable the compromised account, review recent access logs, revert permission changes, and escalate to Tier 3.' },
  { name: 'Insider Threat', icon: <Target size={16}/>, prompt: 'When insider threat score exceeds threshold, increase monitoring, restrict access to sensitive data, notify HR and legal, and preserve evidence chain.' },
  { name: 'DDoS Mitigation', icon: <Server size={16}/>, prompt: 'When volumetric DDoS is detected, enable rate limiting, activate CDN scrubbing, reroute traffic through clean pipes, and notify NOC and ISP.' },
  { name: 'APT Hunt', icon: <GitBranch size={16}/>, prompt: 'When APT indicators match threat intel, sweep all endpoints for IOCs, check lateral movement, review DNS logs for C2 beacons, and initiate threat hunt protocol.' },
];

const GEN_STEPS = ['Parsing natural language', 'Identifying triggers', 'Building conditions', 'Mapping actions', 'Optimizing playbook'];

const SUGGESTIONS = [
  'Add email notification to the security team after blocking',
  'Include a 5-minute delay before permanent block for false-positive review',
  'Enrich source IP with VirusTotal and AbuseIPDB threat intel',
  'Create a Jira ticket with severity mapping from alert priority',
  'Add rollback action if block causes service degradation',
];

const ANALYTICS = [
  { name: 'Brute Force Response', executions: 1247, avgTime: '4.2s', successRate: 98.3, lastTriggered: '2 min ago' },
  { name: 'Phishing Containment', executions: 892, avgTime: '6.8s', successRate: 95.1, lastTriggered: '18 min ago' },
  { name: 'Ransomware Isolation', executions: 34, avgTime: '2.1s', successRate: 100, lastTriggered: '3 days ago' },
  { name: 'Data Exfil Block', executions: 156, avgTime: '3.5s', successRate: 97.4, lastTriggered: '1 hr ago' },
  { name: 'DDoS Mitigation', executions: 78, avgTime: '1.8s', successRate: 99.2, lastTriggered: '6 hrs ago' },
];

function buildPlaybookNodes(prompt: string): PNode[] {
  const nodes: PNode[] = [];
  const has = (k: string) => prompt.toLowerCase().includes(k);
  let y = 60;
  const cx = 340;
  nodes.push({ id: 't1', type: 'trigger', label: has('brute') ? 'Brute Force Alert' : has('phish') ? 'Phishing Report' : has('ransom') ? 'Ransomware Detected' : 'Alert Triggered', detail: 'Fires when the detection rule matches incoming event stream.', x: cx, y, visible: false, glowing: false, testPassed: false });
  y += 100;
  nodes.push({ id: 'c1', type: 'condition', label: has('critical') || has('threshold') ? 'Severity >= Critical' : 'Confidence > 85%', detail: 'Evaluates alert severity and confidence score before proceeding.', x: cx, y, visible: false, glowing: false, testPassed: false });
  y += 100;
  const actions: [string, string][] = [];
  if (has('block') || has('isolat')) actions.push(['Block / Isolate', 'Blocks IP on firewall or isolates host from network.']);
  if (has('notify') || has('slack') || has('alert')) actions.push(['Notify SOC Team', 'Sends notification via Slack or PagerDuty.']);
  if (has('case') || has('ticket') || has('jira')) actions.push(['Create Case', 'Opens a case in ticketing system with full context.']);
  if (has('enrich') || has('intel') || has('virus')) actions.push(['Enrich IOCs', 'Queries threat intel feeds for additional context.']);
  if (has('quarantin')) actions.push(['Quarantine', 'Quarantines affected files or emails.']);
  if (actions.length === 0) { actions.push(['Execute Response', 'Runs the primary automated response action.']); actions.push(['Log & Report', 'Logs all actions and generates incident report.']); }
  actions.forEach(([label, detail], i) => {
    y += 100;
    nodes.push({ id: `a${i}`, type: 'action', label, detail, x: cx, y, visible: false, glowing: false, testPassed: false });
  });
  return nodes;
}

export default function AIPlaybookGenerator() {
  const [prompt, setPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [genSteps, setGenSteps] = useState<GenStep[]>([]);
  const [nodes, setNodes] = useState<PNode[]>([]);
  const [selectedNode, setSelectedNode] = useState<PNode | null>(null);
  const [sidebarTab, setSidebarTab] = useState<'templates' | 'analytics'>('templates');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [testRunning, setTestRunning] = useState(false);
  const [pulseRings, setPulseRings] = useState(false);
  const [dotOffset, setDotOffset] = useState(0);
  const animRef = useRef<number>(0);

  useEffect(() => {
    const tick = () => { setDotOffset(p => (p + 0.5) % 40); animRef.current = requestAnimationFrame(tick); };
    animRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animRef.current);
  }, []);

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
    <div className="min-h-screen bg-[#0A1628] text-gray-200 flex">
      {/* Sidebar */}
      <div className="w-72 border-r border-gray-700/50 flex flex-col shrink-0">
        <div className="flex border-b border-gray-700/50">
          {(['templates', 'analytics'] as const).map(tab => (
            <button key={tab} onClick={() => setSidebarTab(tab)}
              className={`flex-1 py-3 text-xs font-semibold uppercase tracking-wider transition-colors ${sidebarTab === tab ? 'text-cyan-400 border-b-2 border-cyan-400' : 'text-gray-500 hover:text-gray-300'}`}>
              {tab === 'templates' ? 'Templates' : 'Analytics'}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
          {sidebarTab === 'templates' ? TEMPLATES.map((t, i) => (
            <button key={i} onClick={() => setPrompt(t.prompt)}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-left text-sm hover:bg-white/5 transition-colors group">
              <span className="text-cyan-400 group-hover:text-cyan-300">{t.icon}</span>
              <span className="text-gray-300 group-hover:text-white">{t.name}</span>
            </button>
          )) : ANALYTICS.map((a, i) => (
            <div key={i} className="px-3 py-3 rounded-lg bg-white/[0.02] border border-gray-700/30 space-y-2">
              <div className="text-sm font-medium text-gray-200">{a.name}</div>
              <div className="grid grid-cols-2 gap-1 text-xs">
                <span className="text-gray-500">Executions</span><span className="text-right text-cyan-400">{a.executions.toLocaleString()}</span>
                <span className="text-gray-500">Avg Time</span><span className="text-right text-green-400">{a.avgTime}</span>
                <span className="text-gray-500">Success</span><span className="text-right text-emerald-400">{a.successRate}%</span>
                <span className="text-gray-500">Last Run</span><span className="text-right text-gray-400">{a.lastTriggered}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-700/50 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-purple-500/10"><Brain size={22} className="text-purple-400"/></div>
          <div>
            <h1 className="text-lg font-bold text-white">AI Playbook Generator</h1>
            <p className="text-xs text-gray-500">Describe your response workflow in plain English</p>
          </div>
          <div className="ml-auto flex gap-2">
            {['n8n', 'JSON', 'YAML'].map(f => (
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
              placeholder="When a critical brute force alert fires, block the source IP, notify SOC on Slack, create a case..."
              className="w-full h-24 bg-[#0D1B2A] border border-gray-700/50 rounded-xl px-4 py-3 text-sm text-gray-200 placeholder-gray-600 resize-none focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20"/>
            <div className="absolute bottom-3 right-3 flex gap-2">
              <button onClick={() => setShowSuggestions(!showSuggestions)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 transition-colors">
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
                  <Sparkles size={11} className="text-purple-400 shrink-0"/>{s}
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
                <Brain size={18} className="text-purple-400 z-10 animate-pulse"/>
                {[0, 1, 2].map(i => (
                  <div key={i} className="absolute inset-0 rounded-full border border-purple-500/30 animate-ping" style={{ animationDelay: `${i * 0.4}s`, animationDuration: '1.5s' }}/>
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

      <style>{`
        @keyframes scaleIn {
          from { opacity: 0; transform: scale(0.5); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
