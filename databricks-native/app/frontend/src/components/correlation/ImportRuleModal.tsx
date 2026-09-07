import { useState, useCallback } from 'react';
import {
  X, Upload, FileCode, AlertTriangle, CheckCircle, Loader2,
  Copy, Check, ArrowRight, FileText, Braces, Terminal
} from 'lucide-react';
import { lakehouse } from '../../lib/lakehouse';

interface ImportRuleModalProps {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}

type ImportFormat = 'sigma' | 'splunk_spl' | 'elastic_kql' | 'qradar_aql' | 'sentinel_kql' | 'auto';
type ImportStep = 'paste' | 'review' | 'done';

const FORMAT_OPTIONS: { id: ImportFormat; label: string; desc: string; icon: any; color: string }[] = [
  { id: 'auto', label: 'Auto-Detect', desc: 'Let the parser figure it out', icon: Braces, color: 'text-blue-400 bg-blue-500/10 border-blue-500/20' },
  { id: 'sigma', label: 'Sigma', desc: 'Open-source detection format', icon: FileCode, color: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20' },
  { id: 'splunk_spl', label: 'Splunk SPL', desc: 'Search Processing Language', icon: Terminal, color: 'text-green-400 bg-green-500/10 border-green-500/20' },
  { id: 'elastic_kql', label: 'Elastic KQL/EQL', desc: 'Kibana Query Language', icon: FileText, color: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
  { id: 'qradar_aql', label: 'QRadar AQL', desc: 'Ariel Query Language', icon: Terminal, color: 'text-rose-400 bg-rose-500/10 border-rose-500/20' },
  { id: 'sentinel_kql', label: 'MS Sentinel KQL', desc: 'Kusto Query Language', icon: Terminal, color: 'text-sky-400 bg-sky-500/10 border-sky-500/20' },
];

interface ParsedRule {
  rule_name: string;
  rule_description: string;
  category: string;
  subcategory: string;
  severity: string;
  confidence_score: number;
  rule_type: string;
  mitre_tactics: string[];
  mitre_techniques: string[];
  data_sources: string[];
  rule_logic: {
    pseudo_code: string;
    time_window: string;
    threshold: number;
    group_by: string;
    conditions: string[];
  };
  source_format: string;
  tags: string[];
  author: string;
}

function detectFormat(raw: string): ImportFormat {
  const trimmed = raw.trim();
  if (trimmed.startsWith('title:') || trimmed.includes('logsource:') || trimmed.includes('detection:')) return 'sigma';
  if (/^(index\s*=|source\s*=|sourcetype\s*=|\|?\s*search\s)/im.test(trimmed)) return 'splunk_spl';
  if (/^(SecurityEvent|SigninLogs|DeviceProcessEvents|let\s+\w+\s*=)/im.test(trimmed)) return 'sentinel_kql';
  if (/(process\.name|event\.action|host\.name)\s*:/i.test(trimmed) || /sequence\s+by/i.test(trimmed)) return 'elastic_kql';
  if (/SELECT\s+.+FROM\s+(events|flows|ariel)/im.test(trimmed)) return 'qradar_aql';
  return 'sigma';
}

function parseSigma(raw: string): ParsedRule {
  const lines = raw.split('\n');
  const getValue = (key: string): string => {
    const line = lines.find(l => l.trim().startsWith(`${key}:`));
    return line ? line.split(':').slice(1).join(':').trim().replace(/^["']|["']$/g, '') : '';
  };
  const getList = (key: string): string[] => {
    const idx = lines.findIndex(l => l.trim().startsWith(`${key}:`));
    if (idx === -1) return [];
    const items: string[] = [];
    for (let i = idx + 1; i < lines.length; i++) {
      const l = lines[i].trim();
      if (l.startsWith('- ')) items.push(l.replace(/^- /, '').replace(/^["']|["']$/g, ''));
      else if (l && !l.startsWith('#') && !l.startsWith('-')) break;
    }
    return items;
  };

  const title = getValue('title');
  const description = getValue('description');
  const status = getValue('status');
  const level = getValue('level') || getValue('severity') || 'medium';
  const author = getValue('author');
  const tags = getList('tags').map(t => t.replace(/^attack\./, ''));

  const tactics = tags.filter(t => /^(reconnaissance|resource_development|initial_access|execution|persistence|privilege_escalation|defense_evasion|credential_access|discovery|lateral_movement|collection|command_and_control|exfiltration|impact)$/i.test(t.replace(/_/g, '_')));
  const techniques = tags.filter(t => /^t\d{4}/i.test(t));

  const detectionIdx = lines.findIndex(l => l.trim() === 'detection:');
  let pseudoCode = '';
  if (detectionIdx !== -1) {
    const detLines: string[] = [];
    for (let i = detectionIdx; i < Math.min(detectionIdx + 20, lines.length); i++) {
      detLines.push(lines[i]);
    }
    pseudoCode = detLines.join('\n');
  }

  return {
    rule_name: title || 'Imported Sigma Rule',
    rule_description: description || `Imported from Sigma rule${status ? ` (status: ${status})` : ''}`,
    category: 'Threat Detection',
    subcategory: '',
    severity: ['critical', 'high', 'medium', 'low'].includes(level) ? level : 'medium',
    confidence_score: level === 'critical' ? 95 : level === 'high' ? 85 : level === 'medium' ? 70 : 55,
    rule_type: 'deterministic',
    mitre_tactics: tactics.map(t => t.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())),
    mitre_techniques: techniques.map(t => t.toUpperCase()),
    data_sources: getList('logsource') || ['windows', 'sysmon'],
    rule_logic: {
      pseudo_code: pseudoCode || raw,
      time_window: getValue('timeframe') || '5m',
      threshold: 1,
      group_by: 'source_ip',
      conditions: [],
    },
    source_format: 'sigma',
    tags: tags.filter(t => !tactics.includes(t) && !techniques.includes(t)),
    author: author || 'imported',
  };
}

function parseSPL(raw: string): ParsedRule {
  const indexMatch = raw.match(/index\s*=\s*(\w+)/i);
  const sourcetypeMatch = raw.match(/sourcetype\s*=\s*"?([^"\s|]+)"?/i);
  const statsMatch = raw.match(/\|\s*stats\s+count\s+.*?by\s+(\w+)/i);
  const whereMatch = raw.match(/\|\s*where\s+count\s*>\s*(\d+)/i);
  const timeMatch = raw.match(/earliest\s*=\s*-(\d+[mhd])/i) || raw.match(/span\s*=\s*(\d+[mhd])/i);

  return {
    rule_name: `SPL Import: ${sourcetypeMatch?.[1] || indexMatch?.[1] || 'Custom Query'}`,
    rule_description: `Imported Splunk SPL detection query targeting ${indexMatch?.[1] || 'security'} index`,
    category: 'Threat Detection',
    subcategory: sourcetypeMatch?.[1] || '',
    severity: 'medium',
    confidence_score: 70,
    rule_type: 'deterministic',
    mitre_tactics: [],
    mitre_techniques: [],
    data_sources: [indexMatch?.[1] || 'splunk', sourcetypeMatch?.[1] || ''].filter(Boolean),
    rule_logic: {
      pseudo_code: raw,
      time_window: timeMatch?.[1] || '5m',
      threshold: whereMatch ? parseInt(whereMatch[1]) : 1,
      group_by: statsMatch?.[1] || 'source_ip',
      conditions: [],
    },
    source_format: 'splunk_spl',
    tags: ['splunk', 'imported'],
    author: 'imported',
  };
}

function parseKQL(raw: string): ParsedRule {
  const tableMatch = raw.match(/^(\w+)\s*$/m) || raw.match(/^(\w+)\s*\|/m) || raw.match(/^let\s+\w+\s*=\s*(\w+)/m);
  const whereClause = raw.match(/\|\s*where\s+(.+)/i);
  const projectFields = raw.match(/\|\s*project\s+(.+)/i);
  const timeMatch = raw.match(/ago\((\d+[mhd])\)/i);
  const summarizeBy = raw.match(/\|\s*summarize\s+.*?by\s+(\w+)/i);

  const isSentinel = /SecurityEvent|SigninLogs|DeviceProcessEvents|AuditLogs|OfficeActivity/i.test(raw);

  return {
    rule_name: `KQL Import: ${tableMatch?.[1] || 'Custom Analytics'}`,
    rule_description: `Imported ${isSentinel ? 'Microsoft Sentinel' : 'Elastic'} KQL detection rule`,
    category: 'Threat Detection',
    subcategory: tableMatch?.[1] || '',
    severity: 'medium',
    confidence_score: 72,
    rule_type: 'deterministic',
    mitre_tactics: [],
    mitre_techniques: [],
    data_sources: [tableMatch?.[1] || 'logs'].filter(Boolean),
    rule_logic: {
      pseudo_code: raw,
      time_window: timeMatch?.[1] || '5m',
      threshold: 1,
      group_by: summarizeBy?.[1] || 'source_ip',
      conditions: whereClause ? [whereClause[1].trim()] : [],
    },
    source_format: isSentinel ? 'elastic_kql' : 'elastic_kql',
    tags: [isSentinel ? 'sentinel' : 'elastic', 'kql', 'imported'],
    author: 'imported',
  };
}

function parseAQL(raw: string): ParsedRule {
  const fromMatch = raw.match(/FROM\s+(\w+)/i);
  const whereMatch = raw.match(/WHERE\s+(.+?)(?:GROUP|ORDER|LIMIT|$)/is);
  const groupBy = raw.match(/GROUP\s+BY\s+(\w+)/i);

  return {
    rule_name: `AQL Import: ${fromMatch?.[1] || 'QRadar Query'}`,
    rule_description: `Imported QRadar AQL detection query`,
    category: 'Threat Detection',
    subcategory: '',
    severity: 'medium',
    confidence_score: 70,
    rule_type: 'deterministic',
    mitre_tactics: [],
    mitre_techniques: [],
    data_sources: ['qradar', fromMatch?.[1] || 'events'].filter(Boolean),
    rule_logic: {
      pseudo_code: raw,
      time_window: '5m',
      threshold: 1,
      group_by: groupBy?.[1] || 'sourceip',
      conditions: whereMatch ? [whereMatch[1].trim()] : [],
    },
    source_format: 'custom',
    tags: ['qradar', 'aql', 'imported'],
    author: 'imported',
  };
}

function parseRule(raw: string, format: ImportFormat): ParsedRule {
  const resolved = format === 'auto' ? detectFormat(raw) : format;
  switch (resolved) {
    case 'sigma': return parseSigma(raw);
    case 'splunk_spl': return parseSPL(raw);
    case 'elastic_kql':
    case 'sentinel_kql': return parseKQL(raw);
    case 'qradar_aql': return parseAQL(raw);
    default: return parseSigma(raw);
  }
}

const ImportRuleModal = ({ open, onClose, onImported }: ImportRuleModalProps) => {
  const [step, setStep] = useState<ImportStep>('paste');
  const [format, setFormat] = useState<ImportFormat>('auto');
  const [rawInput, setRawInput] = useState('');
  const [parsed, setParsed] = useState<ParsedRule | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [importCount, setImportCount] = useState(0);
  const [copied, setCopied] = useState(false);

  const reset = () => {
    setStep('paste');
    setRawInput('');
    setParsed(null);
    setError('');
    setImportCount(0);
  };

  const handleParse = useCallback(() => {
    if (!rawInput.trim()) {
      setError('Paste a rule definition first');
      return;
    }
    setError('');
    try {
      const result = parseRule(rawInput, format);
      setParsed(result);
      setStep('review');
    } catch (e: any) {
      setError(`Parse failed: ${e.message}`);
    }
  }, [rawInput, format]);

  const handleBatchParse = useCallback(() => {
    if (!rawInput.trim()) { setError('Paste rules first'); return; }
    setError('');
    const blocks = rawInput.split(/\n---\n|\n===\n/).filter(b => b.trim());
    if (blocks.length <= 1) {
      handleParse();
      return;
    }
    setImportCount(blocks.length);
    const result = parseRule(blocks[0], format);
    setParsed(result);
    setStep('review');
  }, [rawInput, format, handleParse]);

  const handleSave = async () => {
    if (!parsed) return;
    setSaving(true);
    setError('');

    const blocks = importCount > 1
      ? rawInput.split(/\n---\n|\n===\n/).filter(b => b.trim())
      : [rawInput];

    const rows = blocks.map(block => {
      const p = parseRule(block, format);
      return {
        rule_name: p.rule_name,
        rule_description: p.rule_description,
        category: p.category,
        subcategory: p.subcategory,
        severity: p.severity,
        confidence_score: p.confidence_score,
        rule_type: p.rule_type,
        enabled: false,
        tags: [...p.tags, 'imported'],
        mitre_tactics: p.mitre_tactics,
        mitre_techniques: p.mitre_techniques,
        data_sources: p.data_sources,
        rule_logic: p.rule_logic,
        source_format: p.source_format,
        author: p.author,
        version: '1.0.0',
        dac_status: 'draft',
        review_status: 'pending_review',
        test_result: 'untested',
        trigger_count: 0,
        false_positive_rate: 0,
        complexity_score: 3,
        changelog: [{ version: '1.0.0', date: new Date().toISOString(), author: 'import-engine', changes: `Imported from ${p.source_format} format` }],
        deployment_history: [],
        test_cases: [],
        compliance_frameworks: [],
      };
    });

    const { error: dbErr } = await lakehouse.from('correlation_rules_library').insert(rows);
    setSaving(false);
    if (dbErr) {
      setError(`Save failed: ${dbErr.message}`);
    } else {
      setStep('done');
      onImported();
    }
  };

  const handleCopyParsed = () => {
    if (!parsed) return;
    navigator.clipboard.writeText(JSON.stringify(parsed, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative w-full max-w-3xl max-h-[90vh] overflow-hidden rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700/50">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <Upload className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Import Rules from SIEM</h2>
              <p className="text-xs text-slate-400">Paste rules from Sigma, Splunk, Elastic, QRadar, or Sentinel</p>
            </div>
          </div>
          <button onClick={() => { reset(); onClose(); }} className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700/50 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center gap-2 px-6 py-3 border-b border-slate-800">
          {(['paste', 'review', 'done'] as ImportStep[]).map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                step === s ? 'bg-amber-500 text-black' : i < ['paste', 'review', 'done'].indexOf(step) ? 'bg-emerald-500 text-black' : 'bg-slate-700 text-slate-400'
              }`}>{i + 1}</div>
              <span className={`text-xs font-medium ${step === s ? 'text-white' : 'text-slate-500'}`}>
                {s === 'paste' ? 'Paste & Format' : s === 'review' ? 'Review' : 'Imported'}
              </span>
              {i < 2 && <ArrowRight className="w-3 h-3 text-slate-600" />}
            </div>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {step === 'paste' && (
            <div className="space-y-4">
              {/* Format selector */}
              <div>
                <label className="text-xs font-semibold text-slate-300 mb-2 block">Source Format</label>
                <div className="grid grid-cols-3 gap-2">
                  {FORMAT_OPTIONS.map(f => (
                    <button
                      key={f.id}
                      onClick={() => setFormat(f.id)}
                      className={`p-2.5 rounded-lg border text-left transition-all ${
                        format === f.id
                          ? `${f.color} border-current ring-1 ring-current/30`
                          : 'border-slate-700 text-slate-400 hover:border-slate-600 hover:text-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <f.icon className="w-4 h-4" />
                        <span className="text-xs font-bold">{f.label}</span>
                      </div>
                      <p className="text-[9px] mt-0.5 opacity-70">{f.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Text area */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-slate-300">Paste Rule(s)</label>
                  <span className="text-[9px] text-slate-500">Separate multiple rules with --- or ===</span>
                </div>
                <textarea
                  value={rawInput}
                  onChange={e => setRawInput(e.target.value)}
                  placeholder={`Paste your ${format === 'auto' ? '' : format + ' '}rule here...\n\nExamples:\n- Sigma YAML (title:, logsource:, detection:)\n- Splunk SPL (index=security sourcetype=...)\n- Elastic KQL (process.name: "cmd.exe")\n- QRadar AQL (SELECT ... FROM events)\n- Sentinel KQL (SecurityEvent | where ...)`}
                  className="w-full h-56 px-4 py-3 rounded-xl bg-slate-800/50 border border-slate-700 text-sm text-slate-200 font-mono placeholder-slate-600 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 resize-none"
                />
              </div>

              {/* Quick import examples */}
              <div className="p-3 rounded-lg bg-slate-800/30 border border-slate-700/50">
                <p className="text-[10px] font-bold text-slate-400 mb-2 uppercase tracking-wider">Quick Examples (click to load)</p>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { label: 'Sigma: Mimikatz', val: `title: Mimikatz Credential Theft Detection\nstatus: stable\nlevel: critical\nauthor: SOC Team\ntags:\n  - attack.credential_access\n  - attack.t1003\nlogsource:\n  category: process_creation\n  product: windows\ndetection:\n  selection:\n    CommandLine|contains:\n      - 'sekurlsa::logonpasswords'\n      - 'lsadump::sam'\n  condition: selection\ntimeframe: 5m` },
                    { label: 'SPL: Brute Force', val: `index=security sourcetype=WinEventLog EventCode=4625\n| stats count by src_ip, user\n| where count > 10\n| sort -count` },
                    { label: 'KQL: Suspicious PS', val: `SecurityEvent\n| where TimeGenerated > ago(1h)\n| where EventID == 4688\n| where Process == "powershell.exe"\n| where CommandLine contains "-enc" or CommandLine contains "bypass"\n| summarize count() by Computer, Account\n| where count_ > 3` },
                  ].map(ex => (
                    <button
                      key={ex.label}
                      onClick={() => { setRawInput(ex.val); setFormat('auto'); }}
                      className="px-2 py-1 rounded text-[9px] font-medium bg-slate-700/50 text-slate-400 hover:text-white hover:bg-slate-700 border border-slate-600/30 transition-colors"
                    >
                      {ex.label}
                    </button>
                  ))}
                </div>
              </div>

              {error && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 text-xs">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  {error}
                </div>
              )}
            </div>
          )}

          {step === 'review' && parsed && (
            <div className="space-y-4">
              {importCount > 1 && (
                <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs flex items-center gap-2">
                  <FileCode className="w-4 h-4" />
                  Batch import: {importCount} rules detected. Showing first rule preview.
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-3">
                  <div>
                    <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Name</label>
                    <input
                      value={parsed.rule_name}
                      onChange={e => setParsed({ ...parsed, rule_name: e.target.value })}
                      className="w-full mt-1 px-3 py-2 rounded-lg bg-slate-800/50 border border-slate-700 text-sm text-white focus:outline-none focus:border-amber-500/50"
                    />
                  </div>
                  <div>
                    <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Description</label>
                    <textarea
                      value={parsed.rule_description}
                      onChange={e => setParsed({ ...parsed, rule_description: e.target.value })}
                      rows={2}
                      className="w-full mt-1 px-3 py-2 rounded-lg bg-slate-800/50 border border-slate-700 text-sm text-white focus:outline-none focus:border-amber-500/50 resize-none"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Severity</label>
                      <select
                        value={parsed.severity}
                        onChange={e => setParsed({ ...parsed, severity: e.target.value })}
                        className="w-full mt-1 px-3 py-2 rounded-lg bg-slate-800/50 border border-slate-700 text-sm text-white focus:outline-none"
                      >
                        {['critical', 'high', 'medium', 'low'].map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Confidence</label>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={parsed.confidence_score}
                        onChange={e => setParsed({ ...parsed, confidence_score: +e.target.value })}
                        className="w-full mt-1 px-3 py-2 rounded-lg bg-slate-800/50 border border-slate-700 text-sm text-white focus:outline-none"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Format Detected</label>
                    <div className="mt-1 inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono font-bold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                      {parsed.source_format}
                    </div>
                  </div>
                  <div>
                    <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">MITRE Tactics</label>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {parsed.mitre_tactics.length > 0 ? parsed.mitre_tactics.map(t => (
                        <span key={t} className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-red-500/10 text-red-300 border border-red-500/20">{t}</span>
                      )) : <span className="text-[9px] text-slate-500">(none detected)</span>}
                    </div>
                  </div>
                  <div>
                    <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Tags</label>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {parsed.tags.map(t => (
                        <span key={t} className="px-1.5 py-0.5 rounded text-[9px] bg-slate-700/50 text-slate-400">{t}</span>
                      ))}
                      <span className="px-1.5 py-0.5 rounded text-[9px] bg-amber-500/10 text-amber-400 border border-amber-500/20">imported</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <div className="flex items-center justify-between">
                      <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Detection Logic</label>
                      <button onClick={handleCopyParsed} className="text-[9px] text-slate-500 hover:text-white transition-colors flex items-center gap-1">
                        {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        {copied ? 'Copied' : 'Copy JSON'}
                      </button>
                    </div>
                    <pre className="mt-1 p-3 rounded-lg bg-black/40 border border-slate-700/50 text-[10px] text-slate-300 font-mono overflow-auto max-h-48 whitespace-pre-wrap">
                      {parsed.rule_logic.pseudo_code || '(no logic extracted)'}
                    </pre>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-800/30 border border-slate-700/50">
                    <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block mb-2">DaC Metadata</label>
                    <div className="space-y-1 text-[10px]">
                      <div className="flex justify-between"><span className="text-slate-500">Status</span><span className="text-amber-400 font-bold">draft</span></div>
                      <div className="flex justify-between"><span className="text-slate-500">Version</span><span className="text-blue-400 font-mono">1.0.0</span></div>
                      <div className="flex justify-between"><span className="text-slate-500">Review</span><span className="text-amber-300">pending_review</span></div>
                      <div className="flex justify-between"><span className="text-slate-500">Test</span><span className="text-slate-400">untested</span></div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Time Window</label>
                      <input
                        value={parsed.rule_logic.time_window}
                        onChange={e => setParsed({ ...parsed, rule_logic: { ...parsed.rule_logic, time_window: e.target.value } })}
                        className="w-full mt-1 px-3 py-1.5 rounded-lg bg-slate-800/50 border border-slate-700 text-xs text-white focus:outline-none font-mono"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Threshold</label>
                      <input
                        type="number"
                        value={parsed.rule_logic.threshold}
                        onChange={e => setParsed({ ...parsed, rule_logic: { ...parsed.rule_logic, threshold: +e.target.value } })}
                        className="w-full mt-1 px-3 py-1.5 rounded-lg bg-slate-800/50 border border-slate-700 text-xs text-white focus:outline-none font-mono"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {error && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 text-xs">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  {error}
                </div>
              )}
            </div>
          )}

          {step === 'done' && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center mb-4">
                <CheckCircle className="w-8 h-8 text-emerald-400" />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">
                {importCount > 1 ? `${importCount} Rules Imported` : 'Rule Imported Successfully'}
              </h3>
              <p className="text-sm text-slate-400 max-w-sm">
                Rules are saved as <span className="text-amber-400 font-bold">draft</span> with{' '}
                <span className="text-amber-300">pending_review</span> status. Promote through the DaC pipeline when ready.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-700/50 bg-slate-900/50">
          <div className="text-[9px] text-slate-500">
            {step === 'paste' && rawInput.trim() && (
              <span>Detected: <strong className="text-slate-300">{detectFormat(rawInput)}</strong></span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {step === 'review' && (
              <button onClick={() => setStep('paste')} className="px-4 py-2 rounded-lg text-xs font-medium text-slate-400 hover:text-white border border-slate-700 hover:border-slate-600 transition-colors">
                Back
              </button>
            )}
            {step === 'done' && (
              <button onClick={() => { reset(); onClose(); }} className="px-4 py-2 rounded-lg text-xs font-medium text-white bg-slate-700 hover:bg-slate-600 transition-colors">
                Close
              </button>
            )}
            {step === 'paste' && (
              <button
                onClick={handleBatchParse}
                disabled={!rawInput.trim()}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-xs font-bold text-black bg-amber-500 hover:bg-amber-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors shadow-lg shadow-amber-500/20"
              >
                Parse & Preview
                <ArrowRight className="w-4 h-4" />
              </button>
            )}
            {step === 'review' && (
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-xs font-bold text-black bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 transition-colors shadow-lg shadow-emerald-500/20"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {importCount > 1 ? `Import ${importCount} Rules` : 'Import to Library'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ImportRuleModal;
