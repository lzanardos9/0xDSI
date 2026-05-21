import { useState, useEffect, useCallback } from 'react';
import { Scan, Shield, GitBranch, History, Zap, ExternalLink, Workflow } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import GlasswingStats from './GlasswingStats';
import GlasswingScanner from './GlasswingScanner';
import GlasswingResults from './GlasswingResults';
import GlasswingExploitGraph from './GlasswingExploitGraph';
import GlasswingScanHistory from './GlasswingScanHistory';
import MythosPipelineView from './MythosPipelineView';

type Tab = 'scanner' | 'results' | 'exploits' | 'history' | 'pipeline';

interface ScanRecord {
  id: string;
  scan_name: string;
  target_type: string;
  target_identifier: string;
  model_used: string;
  status: string;
  progress: number;
  scope_config: any;
  findings_summary: any;
  started_at: string;
  completed_at: string;
  created_at: string;
}

interface VulnRecord {
  id: string;
  scan_id: string;
  vuln_id: string;
  title: string;
  description: string;
  severity: string;
  cvss_score: number;
  cwe_id: string;
  affected_component: string;
  affected_versions: string;
  exploit_feasibility: string;
  exploit_complexity: string;
  remediation_steps: string;
  patch_status: string;
  age_days: number;
  discovery_method: string;
  confidence: number;
  code_snippet: string;
  fix_snippet: string;
  tags: string[];
  scan_name?: string;
}

interface ExploitRecord {
  id: string;
  vulnerability_id: string;
  scan_id: string;
  exploit_name: string;
  chain_steps: any[];
  complexity_score: number;
  impact_score: number;
  attack_vector: string;
  privileges_required: string;
  user_interaction: string;
  scope_change: boolean;
  technique_ids: string[];
  status: string;
  vulnerability_title?: string;
  vulnerability_severity?: string;
}

const TABS: { id: Tab; label: string; icon: typeof Scan }[] = [
  { id: 'pipeline', label: 'Mythos Pipeline', icon: Workflow },
  { id: 'scanner', label: 'Scanner', icon: Scan },
  { id: 'results', label: 'Vulnerabilities', icon: Shield },
  { id: 'exploits', label: 'Exploit Chains', icon: GitBranch },
  { id: 'history', label: 'Scan History', icon: History },
];

export default function GlasswingPanel() {
  const [activeTab, setActiveTab] = useState<Tab>('pipeline');
  const [loading, setLoading] = useState(true);
  const [scans, setScans] = useState<ScanRecord[]>([]);
  const [vulnerabilities, setVulnerabilities] = useState<VulnRecord[]>([]);
  const [exploits, setExploits] = useState<ExploitRecord[]>([]);
  const [selectedScanId, setSelectedScanId] = useState<string | null>(null);
  const [activeScan, setActiveScan] = useState<ScanRecord | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [scansRes, vulnsRes, exploitsRes] = await Promise.all([
        supabase.from('glasswing_scans').select('*').order('created_at', { ascending: false }),
        supabase.from('glasswing_vulnerabilities').select('*').order('cvss_score', { ascending: false }),
        supabase.from('glasswing_exploits').select('*').order('impact_score', { ascending: false }),
      ]);

      const scansData = scansRes.data || [];
      const vulnsData = vulnsRes.data || [];
      const exploitsData = exploitsRes.data || [];

      setScans(scansData);

      const scanMap = new Map(scansData.map(s => [s.id, s.scan_name]));
      setVulnerabilities(vulnsData.map(v => ({
        ...v,
        scan_name: scanMap.get(v.scan_id) || '',
      })));

      const vulnMap = new Map(vulnsData.map(v => [v.id, { title: v.title, severity: v.severity }]));
      setExploits(exploitsData.map(e => ({
        ...e,
        vulnerability_title: vulnMap.get(e.vulnerability_id)?.title || '',
        vulnerability_severity: vulnMap.get(e.vulnerability_id)?.severity || 'medium',
      })));

      const active = scansData.find(s => ['scanning', 'analyzing', 'initializing', 'queued'].includes(s.status));
      setActiveScan(active || null);
    } catch (err) {
      console.error('Error loading Glasswing data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!activeScan) return;
    const interval = setInterval(() => {
      setActiveScan(prev => {
        if (!prev || prev.progress >= 100) return prev;
        const newProgress = Math.min(100, prev.progress + Math.random() * 2);
        if (newProgress >= 100) {
          loadData();
          return { ...prev, progress: 100, status: 'completed' };
        }
        return { ...prev, progress: Math.round(newProgress) };
      });
    }, 3000);
    return () => clearInterval(interval);
  }, [activeScan, loadData]);

  const handleLaunchScan = async (config: { name: string; targetType: string; target: string; depth: string; model: string }) => {
    const newScan: Partial<ScanRecord> = {
      scan_name: config.name,
      target_type: config.targetType,
      target_identifier: config.target,
      model_used: config.model,
      status: 'initializing',
      progress: 0,
      scope_config: { depth: config.depth },
      findings_summary: {},
      started_at: new Date().toISOString(),
    };

    setActiveScan({
      ...newScan,
      id: crypto.randomUUID(),
      completed_at: '',
      created_at: new Date().toISOString(),
    } as ScanRecord);
  };

  const handleSelectScan = (scanId: string) => {
    setSelectedScanId(scanId === selectedScanId ? null : scanId);
  };

  const filteredVulns = selectedScanId
    ? vulnerabilities.filter(v => v.scan_id === selectedScanId)
    : vulnerabilities;

  const filteredExploits = selectedScanId
    ? exploits.filter(e => e.scan_id === selectedScanId)
    : exploits;

  const stats = {
    totalVulns: vulnerabilities.length,
    criticalCount: vulnerabilities.filter(v => v.severity === 'critical').length,
    highCount: vulnerabilities.filter(v => v.severity === 'high').length,
    unpatchedCount: vulnerabilities.filter(v => v.patch_status === 'unpatched').length,
    avgConfidence: vulnerabilities.length
      ? Math.round(vulnerabilities.reduce((sum, v) => sum + v.confidence, 0) / vulnerabilities.length * 10) / 10
      : 0,
    totalScans: scans.filter(s => s.status === 'completed').length,
    activeScans: activeScan ? 1 : 0,
    exploitChains: exploits.length,
    oldestVulnDays: Math.max(0, ...vulnerabilities.map(v => v.age_days || 0)),
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-600 to-teal-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
              <GlasswingIcon />
            </div>
            {activeScan && (
              <div className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-cyan-400 animate-pulse border-2 border-slate-950" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-white">Project Glasswing</h2>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-900/30 text-amber-400 border border-amber-500/20 font-medium">
                Mythos Preview
              </span>
            </div>
            <p className="text-xs text-slate-500">Autonomous vulnerability scanning powered by Claude Mythos</p>
          </div>
        </div>

        <a
          href="https://www.anthropic.com/glasswing"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-cyan-400 transition-colors"
        >
          <span>anthropic.com/glasswing</span>
          <ExternalLink className="w-3 h-3" />
        </a>
      </div>

      <GlasswingStats stats={stats} />

      <div className="flex items-center gap-1 border-b border-slate-700/30">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-all relative ${
              activeTab === tab.id
                ? 'text-cyan-400'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
            {tab.id === 'results' && vulnerabilities.length > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-800 text-slate-400 ml-1">
                {filteredVulns.length}
              </span>
            )}
            {tab.id === 'exploits' && exploits.length > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-800 text-slate-400 ml-1">
                {filteredExploits.length}
              </span>
            )}
            {activeTab === tab.id && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-cyan-400 rounded-full" />
            )}
          </button>
        ))}
      </div>

      {selectedScanId && (
        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-500">Filtered by:</span>
          <span className="px-2 py-1 rounded bg-cyan-950/30 text-cyan-400 border border-cyan-500/20">
            {scans.find(s => s.id === selectedScanId)?.scan_name}
          </span>
          <button
            onClick={() => setSelectedScanId(null)}
            className="text-slate-500 hover:text-white transition-colors"
          >
            Clear
          </button>
        </div>
      )}

      <div>
        {activeTab === 'pipeline' && (
          <MythosPipelineView />
        )}
        {activeTab === 'scanner' && (
          <GlasswingScanner activeScan={activeScan} onLaunchScan={handleLaunchScan} />
        )}
        {activeTab === 'results' && (
          <GlasswingResults vulnerabilities={filteredVulns} loading={loading} />
        )}
        {activeTab === 'exploits' && (
          <GlasswingExploitGraph exploits={filteredExploits} loading={loading} />
        )}
        {activeTab === 'history' && (
          <GlasswingScanHistory
            scans={scans}
            loading={loading}
            onSelectScan={handleSelectScan}
            selectedScanId={selectedScanId}
          />
        )}
      </div>
    </div>
  );
}

function GlasswingIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-white">
      <path d="M12 3C7 3 3 7 3 12s4 9 9 9" />
      <path d="M12 3c5 0 9 4 9 9s-4 9-9 9" />
      <path d="M12 3v18" />
      <path d="M3 12h18" />
      <path d="M12 3c-2.5 2.5-4 5.5-4 9s1.5 6.5 4 9" opacity="0.5" />
      <path d="M12 3c2.5 2.5 4 5.5 4 9s-1.5 6.5-4 9" opacity="0.5" />
      <circle cx="12" cy="12" r="2" fill="currentColor" opacity="0.8" />
    </svg>
  );
}
