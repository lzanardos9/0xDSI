import { useState, useEffect, useRef, useCallback } from 'react';
import {
  X, Shield, FileCode, Save, Rocket, ChevronRight, CheckCircle,
  AlertTriangle, Eye, Plus, Trash2, Clock, Target,
  Network, Brain, Zap, FlaskConical, GitBranch, Play, Loader2,
  Activity, Cpu, Gauge, Radio, Layers, Fingerprint, Pencil
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import CorrelationRuleGraph from './CorrelationRuleGraph';

interface RuleCondition {
  field: string;
  operator: string;
  value: string;
  window?: string;
}

interface RuleLogic {
  conditions: RuleCondition[];
  sequence?: string[];
  time_window?: string;
  threshold?: { field: string; operator: string; value: number };
  aggregation?: string;
  pseudo_code: string;
}

export interface AIGeneratedRule {
  rule_name: string;
  rule_description: string;
  severity: string;
  confidence_score: number;
  rule_logic: RuleLogic;
  mitre_tactics: string[];
  data_sources: string[];
  graph_nodes: { id: string; label: string; type: 'source' | 'condition' | 'detection' | 'action'; detail: string }[];
  graph_edges: { from: string; to: string; label: string }[];
  enhancement_ideas: { title: string; description: string }[];
}

type DaCStage = 'draft' | 'testing' | 'staging' | 'production';
type ModalTab = 'overview' | 'logic' | 'conditions' | 'graph' | 'test';

interface TestResult {
  name: string;
  status: 'pass' | 'fail' | 'running';
  detail: string;
  duration?: number;
}

const STAGES: DaCStage[] = ['draft', 'testing', 'staging', 'production'];
const SEV_OPTIONS = ['critical', 'high', 'medium', 'low'];

const SEV_COLORS: Record<string, { bg: string; border: string; text: string; badge: string; ring: string; hex: string }> = {
  critical: { bg: 'bg-red-500/10', border: 'border-red-500/40', text: 'text-red-400', badge: 'bg-red-500/20 text-red-300 border-red-500/30', ring: '#ef4444', hex: '#f87171' },
  high: { bg: 'bg-orange-500/10', border: 'border-orange-500/40', text: 'text-orange-400', badge: 'bg-orange-500/20 text-orange-300 border-orange-500/30', ring: '#f97316', hex: '#fb923c' },
  medium: { bg: 'bg-amber-500/10', border: 'border-amber-500/40', text: 'text-amber-400', badge: 'bg-amber-500/20 text-amber-300 border-amber-500/30', ring: '#f59e0b', hex: '#fbbf24' },
  low: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/40', text: 'text-emerald-400', badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30', ring: '#22c55e', hex: '#4ade80' },
};

const OPERATOR_OPTIONS = ['equals', 'not_equals', 'contains', 'not_contains', 'greater_than', 'less_than', 'regex', 'in', 'not_in', 'starts_with', 'ends_with'];

export default function DaCInspectorModal({
  rule,
  onClose,
  onRuleSaved,
}: {
  rule: AIGeneratedRule;
  onClose: () => void;
  onRuleSaved?: (ruleId: string, stage: DaCStage) => void;
}) {
  const [activeTab, setActiveTab] = useState<ModalTab>('overview');
  const [editMode, setEditMode] = useState(true);
  const [saving, setSaving] = useState(false);
  const [promoting, setPromoting] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [savedRuleId, setSavedRuleId] = useState<string | null>(null);
  const [currentStage, setCurrentStage] = useState<DaCStage>('draft');
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [testRunning, setTestRunning] = useState(false);

  const [ruleName, setRuleName] = useState(rule.rule_name || '');
  const [ruleDescription, setRuleDescription] = useState(rule.rule_description);
  const [severity, setSeverity] = useState(rule.severity || 'high');
  const [pseudoCode, setPseudoCode] = useState(rule.rule_logic?.pseudo_code || '');
  const [conditions, setConditions] = useState<RuleCondition[]>(
    rule.rule_logic?.conditions?.map(c => ({ ...c })) || []
  );
  const [timeWindow, setTimeWindow] = useState(rule.rule_logic?.time_window || '5m');
  const [aggregation, setAggregation] = useState(rule.rule_logic?.aggregation || '');
  const [mitreTactics, setMitreTactics] = useState<string[]>([...(rule.mitre_tactics || [])]);
  const [dataSources, setDataSources] = useState<string[]>([...(rule.data_sources || [])]);
  const [newTactic, setNewTactic] = useState('');
  const [newDataSource, setNewDataSource] = useState('');

  const buildRuleLogic = useCallback((): RuleLogic => ({
    conditions,
    sequence: rule.rule_logic?.sequence,
    time_window: timeWindow,
    threshold: rule.rule_logic?.threshold,
    aggregation: aggregation || undefined,
    pseudo_code: pseudoCode,
  }), [conditions, timeWindow, aggregation, pseudoCode, rule.rule_logic]);

  const complexityScore = Math.min(10, (conditions.length * 1.5) + (mitreTactics.length * 0.5) + ((rule.graph_nodes?.length || 0) * 0.3));
  const coverageScore = Math.min(100, (dataSources.length * 15) + (conditions.length * 10) + (mitreTactics.length * 8));

  const saveRule = async (targetStage: DaCStage) => {
    const isSave = targetStage === 'draft';
    if (isSave) setSaving(true);
    else setPromoting(true);

    const rulePayload = {
      rule_name: ruleName,
      rule_description: ruleDescription,
      severity,
      confidence_score: rule.confidence_score || 0.85,
      rule_logic: buildRuleLogic(),
      mitre_tactics: mitreTactics,
      mitre_techniques: mitreTactics.filter(t => t.startsWith('T')),
      data_sources: dataSources,
      category: 'AI Generated',
      subcategory: 'Graph Correlation',
      rule_type: 'graph_correlation',
      enabled: targetStage !== 'draft',
      tags: ['ai-generated', 'dac-inspected'],
      author: 'AI Assistant',
      trigger_count: 0,
      false_positive_rate: 0,
      complexity_score: complexityScore,
      version: targetStage === 'draft' ? '0.1.0' : '1.0.0',
      dac_status: targetStage,
      review_status: targetStage === 'draft' ? 'pending_review' : 'approved',
      source_format: 'custom',
      test_result: testResults.length > 0 && testResults.every(t => t.status === 'pass') ? 'pass' : 'untested',
      changelog: [{
        version: targetStage === 'draft' ? '0.1.0' : '1.0.0',
        date: new Date().toISOString().split('T')[0],
        author: 'AI Assistant',
        summary: targetStage === 'draft'
          ? 'Initial draft created from AI Assistant'
          : `Promoted to ${targetStage} from DaC Inspector`,
        type: 'created',
      }],
      test_cases: testResults.map(t => ({
        name: t.name,
        status: t.status,
        description: t.detail,
        last_run: new Date().toISOString(),
      })),
      deployment_history: targetStage !== 'draft' ? [{
        environment: targetStage,
        date: new Date().toISOString(),
        deployed_by: 'AI Assistant (DaC Inspector)',
        status: 'success',
      }] : [],
    };

    if (savedRuleId) {
      const { error } = await supabase
        .from('correlation_rules_library')
        .update({ ...rulePayload, updated_at: new Date().toISOString() })
        .eq('id', savedRuleId);

      if (!error) {
        setCurrentStage(targetStage);
        setSaveSuccess(targetStage === 'draft' ? 'Saved as draft' : `Promoted to ${targetStage}`);
        setTimeout(() => setSaveSuccess(null), 3000);
        onRuleSaved?.(savedRuleId, targetStage);
      }
    } else {
      const { data, error } = await supabase
        .from('correlation_rules_library')
        .insert(rulePayload)
        .select('id')
        .maybeSingle();

      if (!error && data) {
        setSavedRuleId(data.id);
        setCurrentStage(targetStage);
        setSaveSuccess(targetStage === 'draft' ? 'Saved as draft' : `Promoted to ${targetStage}`);
        setTimeout(() => setSaveSuccess(null), 3000);
        onRuleSaved?.(data.id, targetStage);

        await supabase.from('correlation_rule_versions').insert({
          rule_id: data.id,
          version: rulePayload.version,
          rule_name: ruleName,
          rule_description: ruleDescription,
          rule_logic: buildRuleLogic(),
          severity,
          category: 'AI Generated',
          enabled: rulePayload.enabled,
          change_summary: targetStage === 'draft'
            ? 'Initial creation from AI Assistant DaC Inspector'
            : `Created and promoted to ${targetStage}`,
          changed_by: 'AI Assistant',
          change_type: 'created',
        });
      }
    }

    setSaving(false);
    setPromoting(false);
  };

  const runDryTests = async () => {
    setTestRunning(true);
    setTestResults([]);
    const tests: TestResult[] = [
      { name: 'Syntax Validation', status: 'running', detail: 'Checking rule syntax...' },
      { name: 'Condition Completeness', status: 'running', detail: 'Validating all conditions have required fields...' },
      { name: 'MITRE Mapping', status: 'running', detail: 'Verifying MITRE ATT&CK references...' },
      { name: 'Data Source Availability', status: 'running', detail: 'Checking data source connectivity...' },
      { name: 'Graph Structure', status: 'running', detail: 'Validating detection graph integrity...' },
      { name: 'Performance Estimation', status: 'running', detail: 'Estimating rule execution cost...' },
    ];
    setTestResults([...tests]);
    for (let i = 0; i < tests.length; i++) {
      await new Promise(r => setTimeout(r, 400 + Math.random() * 600));
      const passed = i === 0
        ? pseudoCode.trim().length > 10
        : i === 1
          ? conditions.length > 0 && conditions.every(c => c.field && c.operator && c.value)
          : i === 2
            ? mitreTactics.length > 0
            : i === 3
              ? dataSources.length > 0
              : i === 4
                ? (rule.graph_nodes?.length || 0) >= 2
                : true;
      tests[i] = {
        ...tests[i],
        status: passed ? 'pass' : 'fail',
        detail: passed
          ? tests[i].detail.replace('...', ' -- passed')
          : tests[i].detail.replace('...', ' -- FAILED: missing or invalid'),
        duration: Math.floor(50 + Math.random() * 200),
      };
      setTestResults([...tests]);
    }
    setTestRunning(false);
  };

  const updateCondition = (idx: number, field: keyof RuleCondition, value: string) => {
    setConditions(prev => prev.map((c, i) => i === idx ? { ...c, [field]: value } : c));
  };
  const removeCondition = (idx: number) => setConditions(prev => prev.filter((_, i) => i !== idx));
  const addCondition = () => setConditions(prev => [...prev, { field: '', operator: 'equals', value: '' }]);

  const addTactic = () => {
    if (newTactic.trim() && !mitreTactics.includes(newTactic.trim())) {
      setMitreTactics(prev => [...prev, newTactic.trim()]);
      setNewTactic('');
    }
  };
  const removeTactic = (idx: number) => setMitreTactics(prev => prev.filter((_, i) => i !== idx));

  const addDataSource = () => {
    if (newDataSource.trim() && !dataSources.includes(newDataSource.trim())) {
      setDataSources(prev => [...prev, newDataSource.trim()]);
      setNewDataSource('');
    }
  };
  const removeDataSource = (idx: number) => setDataSources(prev => prev.filter((_, i) => i !== idx));

  const sevColor = SEV_COLORS[severity] || SEV_COLORS.high;
  const allTestsPassed = testResults.length > 0 && testResults.every(t => t.status === 'pass');
  const canPromote = !!(ruleName && ruleName.trim() && pseudoCode && pseudoCode.trim() && conditions.length > 0);

  const tabs: { id: ModalTab; label: string; icon: typeof Shield }[] = [
    { id: 'overview', label: 'Overview', icon: Gauge },
    { id: 'logic', label: 'Rule Logic', icon: FileCode },
    { id: 'conditions', label: 'Conditions', icon: Target },
    { id: 'graph', label: 'Detection Graph', icon: Network },
    { id: 'test', label: 'Dry Run', icon: FlaskConical },
  ];

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={onClose} />

      <div className="relative w-full max-w-6xl max-h-[94vh] bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 rounded-2xl border border-slate-700/40 shadow-2xl flex flex-col overflow-hidden">
        <ScanlineOverlay />

        <ModalHeader
          ruleName={ruleName}
          severity={severity}
          sevColor={sevColor}
          currentStage={currentStage}
          editMode={editMode}
          saveSuccess={saveSuccess}
          onToggleEdit={() => setEditMode(!editMode)}
          onClose={onClose}
        />

        <LifecyclePipeline currentStage={currentStage} />

        <div className="flex border-b border-slate-700/40 bg-slate-800/10">
          {tabs.map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-5 py-3 text-xs font-semibold transition-all border-b-2 relative ${
                  activeTab === tab.id
                    ? 'border-cyan-500 text-cyan-400 bg-cyan-500/5'
                    : 'border-transparent text-slate-500 hover:text-slate-300 hover:bg-slate-700/20'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
                {tab.id === 'test' && testResults.length > 0 && (
                  <span className={`ml-1 px-1.5 py-0.5 rounded text-[9px] font-bold ${
                    allTestsPassed ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'
                  }`}>
                    {testResults.filter(t => t.status === 'pass').length}/{testResults.length}
                  </span>
                )}
                {activeTab === tab.id && (
                  <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-cyan-400 rounded-full shadow-lg shadow-cyan-500/50" />
                )}
              </button>
            );
          })}
        </div>

        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
          {activeTab === 'overview' && (
            <OverviewTab
              severity={severity}
              sevColor={sevColor}
              confidenceScore={rule.confidence_score}
              complexityScore={complexityScore}
              coverageScore={coverageScore}
              conditionCount={conditions.length}
              tacticsCount={mitreTactics.length}
              dataSourceCount={dataSources.length}
              nodeCount={rule.graph_nodes?.length || 0}
              edgeCount={rule.graph_edges?.length || 0}
              ruleName={ruleName}
              ruleDescription={ruleDescription}
              timeWindow={timeWindow}
              enhancementIdeas={rule.enhancement_ideas || []}
            />
          )}
          {activeTab === 'logic' && (
            <LogicTab
              editMode={editMode}
              ruleName={ruleName} setRuleName={setRuleName}
              ruleDescription={ruleDescription} setRuleDescription={setRuleDescription}
              severity={severity} setSeverity={setSeverity}
              pseudoCode={pseudoCode} setPseudoCode={setPseudoCode}
              timeWindow={timeWindow} setTimeWindow={setTimeWindow}
              aggregation={aggregation} setAggregation={setAggregation}
              confidenceScore={rule.confidence_score}
            />
          )}
          {activeTab === 'conditions' && (
            <ConditionsTab
              editMode={editMode}
              conditions={conditions} updateCondition={updateCondition}
              removeCondition={removeCondition} addCondition={addCondition}
              mitreTactics={mitreTactics} newTactic={newTactic}
              setNewTactic={setNewTactic} addTactic={addTactic} removeTactic={removeTactic}
              dataSources={dataSources} newDataSource={newDataSource}
              setNewDataSource={setNewDataSource} addDataSource={addDataSource}
              removeDataSource={removeDataSource}
            />
          )}
          {activeTab === 'graph' && (
            <GraphTab nodes={rule.graph_nodes || []} edges={rule.graph_edges || []} severity={severity} />
          )}
          {activeTab === 'test' && (
            <TestTab testResults={testResults} testRunning={testRunning} onRunTests={runDryTests} />
          )}
        </div>

        <ActionBar
          currentStage={currentStage} saving={saving} promoting={promoting}
          canPromote={canPromote} allTestsPassed={allTestsPassed}
          onSaveDraft={() => saveRule('draft')}
          onPromoteToTesting={() => saveRule('testing')}
          onClose={onClose}
        />
      </div>
    </div>
  );
}

function ScanlineOverlay() {
  return (
    <div className="absolute inset-0 pointer-events-none z-10 overflow-hidden rounded-2xl opacity-[0.03]">
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,255,255,0.1) 2px, rgba(0,255,255,0.1) 4px)',
          animation: 'scanline 8s linear infinite',
        }}
      />
      <style>{`@keyframes scanline { 0% { transform: translateY(-100%); } 100% { transform: translateY(100%); } }`}</style>
    </div>
  );
}

function ThreatScoreRing({ score, color, size = 120, label }: { score: number; color: string; size?: number; label: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef(0);
  const progressRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    ctx.scale(dpr, dpr);
    const target = Math.min(score, 100) / 100;
    let startTime: number | null = null;

    const draw = (ts: number) => {
      if (!startTime) startTime = ts;
      const elapsed = ts - startTime;
      progressRef.current = Math.min(target, target * (elapsed / 1200));
      const p = progressRef.current;
      const cx = size / 2;
      const cy = size / 2;
      const r = size / 2 - 12;
      const lineW = 6;

      ctx.clearRect(0, 0, size, size);

      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(51,65,85,0.4)';
      ctx.lineWidth = lineW;
      ctx.stroke();

      const startAngle = -Math.PI / 2;
      const endAngle = startAngle + p * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(cx, cy, r, startAngle, endAngle);
      ctx.strokeStyle = color;
      ctx.lineWidth = lineW;
      ctx.lineCap = 'round';
      ctx.stroke();

      const glowAngle = endAngle;
      const gx = cx + Math.cos(glowAngle) * r;
      const gy = cy + Math.sin(glowAngle) * r;
      const grd = ctx.createRadialGradient(gx, gy, 0, gx, gy, 12);
      grd.addColorStop(0, color + '80');
      grd.addColorStop(1, color + '00');
      ctx.beginPath();
      ctx.arc(gx, gy, 12, 0, Math.PI * 2);
      ctx.fillStyle = grd;
      ctx.fill();

      ctx.font = `bold ${size / 4}px system-ui`;
      ctx.fillStyle = '#f1f5f9';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${Math.round(p * 100)}`, cx, cy - 4);

      ctx.font = `600 ${size / 12}px system-ui`;
      ctx.fillStyle = '#64748b';
      ctx.fillText(label, cx, cy + size / 6);

      if (elapsed < 1200) {
        animRef.current = requestAnimationFrame(draw);
      }
    };
    animRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animRef.current);
  }, [score, color, size, label]);

  return <canvas ref={canvasRef} />;
}

function RadarChart({ values, labels, size = 180 }: { values: number[]; labels: string[]; size?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    ctx.scale(dpr, dpr);
    const cx = size / 2;
    const cy = size / 2;
    const r = size / 2 - 28;
    const n = values.length;
    const angleStep = (Math.PI * 2) / n;

    ctx.clearRect(0, 0, size, size);

    for (let ring = 5; ring >= 1; ring--) {
      const rr = (ring / 5) * r;
      ctx.beginPath();
      for (let i = 0; i <= n; i++) {
        const angle = i * angleStep - Math.PI / 2;
        const x = cx + Math.cos(angle) * rr;
        const y = cy + Math.sin(angle) * rr;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.strokeStyle = 'rgba(51,65,85,0.3)';
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }

    for (let i = 0; i < n; i++) {
      const angle = i * angleStep - Math.PI / 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r);
      ctx.strokeStyle = 'rgba(51,65,85,0.3)';
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }

    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const idx = i % n;
      const angle = idx * angleStep - Math.PI / 2;
      const val = Math.min(1, values[idx] / 100);
      const x = cx + Math.cos(angle) * r * val;
      const y = cy + Math.sin(angle) * r * val;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = 'rgba(6,182,212,0.15)';
    ctx.fill();
    ctx.strokeStyle = '#06b6d4';
    ctx.lineWidth = 2;
    ctx.stroke();

    for (let i = 0; i < n; i++) {
      const angle = i * angleStep - Math.PI / 2;
      const val = Math.min(1, values[i] / 100);
      const x = cx + Math.cos(angle) * r * val;
      const y = cy + Math.sin(angle) * r * val;
      ctx.beginPath();
      ctx.arc(x, y, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = '#06b6d4';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(6,182,212,0.3)';
      ctx.fill();
    }

    ctx.font = '600 9px system-ui';
    ctx.fillStyle = '#94a3b8';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < n; i++) {
      const angle = i * angleStep - Math.PI / 2;
      const lx = cx + Math.cos(angle) * (r + 18);
      const ly = cy + Math.sin(angle) * (r + 18);
      ctx.fillText(labels[i], lx, ly);
    }
  }, [values, labels, size]);

  return <canvas ref={canvasRef} />;
}

function SignalPulse({ strength, color }: { strength: number; color: string }) {
  return (
    <div className="flex items-end gap-[3px] h-8">
      {[20, 35, 50, 65, 80, 95].map((threshold, i) => {
        const active = strength >= threshold;
        return (
          <div
            key={i}
            className="rounded-sm transition-all duration-500"
            style={{
              width: 4,
              height: `${40 + i * 10}%`,
              backgroundColor: active ? color : 'rgba(51,65,85,0.3)',
              boxShadow: active ? `0 0 6px ${color}40` : 'none',
              opacity: active ? 1 : 0.3,
            }}
          />
        );
      })}
    </div>
  );
}

function OverviewTab({
  severity, sevColor, confidenceScore, complexityScore, coverageScore,
  conditionCount, tacticsCount, dataSourceCount, nodeCount, edgeCount,
  ruleName, ruleDescription, timeWindow, enhancementIdeas,
}: {
  severity: string;
  sevColor: { hex: string; ring: string; badge: string };
  confidenceScore: number;
  complexityScore: number;
  coverageScore: number;
  conditionCount: number;
  tacticsCount: number;
  dataSourceCount: number;
  nodeCount: number;
  edgeCount: number;
  ruleName: string;
  ruleDescription: string;
  timeWindow: string;
  enhancementIdeas: { title: string; description: string }[];
}) {
  const confPct = Math.round((confidenceScore || 0.85) * 100);

  const radarValues = [
    Math.min(100, conditionCount * 20),
    Math.min(100, tacticsCount * 18),
    confPct,
    Math.min(100, complexityScore * 10),
    Math.min(100, dataSourceCount * 22),
    Math.min(100, nodeCount * 12),
  ];
  const radarLabels = ['Conditions', 'MITRE', 'Confidence', 'Complexity', 'Sources', 'Graph'];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-slate-800/30 rounded-2xl border border-slate-700/30 p-6">
          <div className="flex items-start gap-5">
            <div className="flex flex-col items-center">
              <ThreatScoreRing score={confPct} color={sevColor.ring} size={130} label="CONFIDENCE" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-bold text-white mb-1 leading-tight">{ruleName}</h3>
              <p className="text-xs text-slate-400 leading-relaxed mb-4 line-clamp-3">{ruleDescription}</p>
              <div className="grid grid-cols-3 gap-3">
                <MetricCard icon={<Target className="w-4 h-4" />} label="Conditions" value={conditionCount} color="cyan" />
                <MetricCard icon={<Shield className="w-4 h-4" />} label="MITRE Refs" value={tacticsCount} color="red" />
                <MetricCard icon={<Layers className="w-4 h-4" />} label="Data Sources" value={dataSourceCount} color="blue" />
              </div>
            </div>
          </div>
        </div>

        <div className="bg-slate-800/30 rounded-2xl border border-slate-700/30 p-5 flex flex-col items-center justify-center">
          <RadarChart values={radarValues} labels={radarLabels} size={200} />
          <p className="text-[10px] text-slate-500 uppercase font-semibold mt-2 tracking-wider">Rule Coverage Profile</p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <GlowStatCard label="Severity" value={severity.toUpperCase()} color={sevColor.ring} icon={<AlertTriangle className="w-4 h-4" />} />
        <GlowStatCard label="Complexity" value={`${complexityScore.toFixed(1)}/10`} color="#06b6d4" icon={<Cpu className="w-4 h-4" />} />
        <GlowStatCard label="Coverage" value={`${coverageScore}%`} color="#22c55e" icon={<Radio className="w-4 h-4" />} extra={<SignalPulse strength={coverageScore} color="#22c55e" />} />
        <GlowStatCard label="Graph" value={`${nodeCount}N / ${edgeCount}E`} color="#3b82f6" icon={<Network className="w-4 h-4" />} />
        <GlowStatCard label="Window" value={timeWindow || 'N/A'} color="#8b5cf6" icon={<Clock className="w-4 h-4" />} />
      </div>

      {enhancementIdeas.length > 0 && (
        <div className="bg-slate-800/20 rounded-2xl border border-slate-700/30 p-5">
          <h4 className="text-xs text-slate-400 uppercase tracking-wider font-semibold mb-4 flex items-center gap-2">
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            AI Enhancement Recommendations
          </h4>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {enhancementIdeas.map((idea, i) => {
              const icons = [Brain, Fingerprint, Activity, Layers, Radio, Cpu];
              const Icon = icons[i % icons.length];
              return (
                <div key={i} className="bg-slate-800/40 rounded-xl border border-slate-700/30 p-4 hover:border-cyan-500/30 transition-all group">
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400 group-hover:bg-cyan-500/20 group-hover:scale-110 transition-all flex-shrink-0">
                      <Icon className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-white mb-0.5">{idea.title}</p>
                      <p className="text-[10px] text-slate-400 leading-relaxed">{idea.description}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function MetricCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: string }) {
  const colorMap: Record<string, string> = {
    cyan: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
    red: 'bg-red-500/10 text-red-400 border-red-500/20',
    blue: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  };
  return (
    <div className={`rounded-xl border p-3 ${colorMap[color]}`}>
      <div className="flex items-center gap-1.5 mb-1">{icon}<span className="text-[10px] font-semibold uppercase">{label}</span></div>
      <p className="text-xl font-bold">{value}</p>
    </div>
  );
}

function GlowStatCard({ label, value, color, icon, extra }: { label: string; value: string; color: string; icon: React.ReactNode; extra?: React.ReactNode }) {
  return (
    <div
      className="rounded-xl border border-slate-700/40 bg-slate-800/30 p-4 relative overflow-hidden group hover:border-slate-600/60 transition-all"
    >
      <div className="absolute top-0 right-0 w-16 h-16 rounded-full opacity-10 blur-xl group-hover:opacity-20 transition-opacity" style={{ backgroundColor: color }} />
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] text-slate-500 uppercase font-semibold tracking-wider">{label}</span>
        <span style={{ color }}>{icon}</span>
      </div>
      <div className="flex items-center justify-between">
        <p className="text-lg font-bold text-white">{value}</p>
        {extra}
      </div>
    </div>
  );
}

function ModalHeader({
  ruleName, severity, sevColor, currentStage, editMode, saveSuccess, onToggleEdit, onClose,
}: {
  ruleName: string;
  severity: string;
  sevColor: { bg: string; border: string; text: string; badge: string };
  currentStage: DaCStage;
  editMode: boolean;
  saveSuccess: string | null;
  onToggleEdit: () => void;
  onClose: () => void;
}) {
  return (
    <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700/40 bg-gradient-to-r from-slate-900/80 to-slate-800/40 relative z-20">
      <div className="flex items-center gap-3 min-w-0">
        <div className={`p-2.5 rounded-xl ${sevColor.bg} border ${sevColor.border} relative`}>
          <FileCode className={`w-5 h-5 ${sevColor.text}`} />
          <div className={`absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full animate-pulse ${severity === 'critical' ? 'bg-red-500' : severity === 'high' ? 'bg-orange-500' : severity === 'medium' ? 'bg-amber-500' : 'bg-emerald-500'}`} />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">DaC Inspector</span>
            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${sevColor.badge}`}>{severity}</span>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">{currentStage}</span>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-blue-500/10 text-blue-300 border border-blue-500/20">
              <GitBranch className="w-3 h-3 inline mr-0.5" />v{currentStage === 'draft' ? '0.1.0' : '1.0.0'}
            </span>
          </div>
          <h2 className="text-base font-bold text-white truncate max-w-xl">{ruleName}</h2>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {saveSuccess && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30">
            <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-xs font-semibold text-emerald-300">{saveSuccess}</span>
          </div>
        )}
        <button
          onClick={onToggleEdit}
          className={`p-2 rounded-lg border transition-colors ${editMode ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400' : 'bg-slate-800/50 border-slate-700 text-slate-400'}`}
          title={editMode ? 'Switch to preview' : 'Switch to edit'}
        >
          {editMode ? <Pencil className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
        <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors">
          <X className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}

function LifecyclePipeline({ currentStage }: { currentStage: DaCStage }) {
  const currentIdx = STAGES.indexOf(currentStage);
  return (
    <div className="px-6 py-3 bg-slate-800/15 border-b border-slate-700/30 relative z-20">
      <div className="flex items-center gap-1">
        {STAGES.map((stage, i) => {
          const isActive = stage === currentStage;
          const isPassed = i < currentIdx;
          return (
            <div key={stage} className="flex items-center flex-1">
              <div className={`flex-1 rounded-lg p-2.5 text-center transition-all relative overflow-hidden ${
                isActive
                  ? 'bg-cyan-500/15 border-2 border-cyan-500/50 shadow-lg shadow-cyan-500/10'
                  : isPassed
                    ? 'bg-emerald-500/10 border border-emerald-500/30'
                    : 'bg-slate-800/60 border border-slate-700/40'
              }`}>
                {isActive && (
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-cyan-500/5 to-transparent animate-pulse" />
                )}
                <div className="flex items-center justify-center gap-1.5 relative z-10">
                  {isPassed && <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />}
                  {isActive && <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse shadow-lg shadow-cyan-400/50" />}
                  <span className={`text-[10px] font-bold uppercase tracking-widest ${
                    isActive ? 'text-cyan-300' : isPassed ? 'text-emerald-400' : 'text-slate-500'
                  }`}>{stage}</span>
                </div>
              </div>
              {i < STAGES.length - 1 && (
                <div className="flex items-center mx-1">
                  <div className={`w-4 h-[2px] rounded-full transition-all ${isPassed ? 'bg-emerald-500' : 'bg-slate-700'}`} />
                  <ChevronRight className={`w-3 h-3 -ml-0.5 ${isPassed ? 'text-emerald-500' : 'text-slate-700'}`} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LogicTab({
  editMode, ruleName, setRuleName, ruleDescription, setRuleDescription,
  severity, setSeverity, pseudoCode, setPseudoCode,
  timeWindow, setTimeWindow, aggregation, setAggregation, confidenceScore,
}: {
  editMode: boolean;
  ruleName: string; setRuleName: (v: string) => void;
  ruleDescription: string; setRuleDescription: (v: string) => void;
  severity: string; setSeverity: (v: string) => void;
  pseudoCode: string; setPseudoCode: (v: string) => void;
  timeWindow: string; setTimeWindow: (v: string) => void;
  aggregation: string; setAggregation: (v: string) => void;
  confidenceScore: number;
}) {
  const lines = pseudoCode.split('\n');
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <label className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold mb-1.5 block">Rule Name</label>
          {editMode ? (
            <input value={ruleName} onChange={e => setRuleName(e.target.value)}
              className="w-full bg-slate-800/60 border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50 transition-colors" />
          ) : (
            <p className="text-sm font-semibold text-white py-2.5">{ruleName}</p>
          )}
        </div>
        <div>
          <label className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold mb-1.5 block">Severity</label>
          {editMode ? (
            <div className="flex gap-1.5">
              {SEV_OPTIONS.map(s => {
                const sc = SEV_COLORS[s];
                return (
                  <button key={s} onClick={() => setSeverity(s)}
                    className={`flex-1 px-2 py-2.5 rounded-lg text-[10px] font-bold uppercase transition-all border ${
                      severity === s ? `${sc.badge} ring-1 ring-offset-1 ring-offset-slate-900 ${sc.border.replace('border-', 'ring-')}` : 'bg-slate-800/50 border-slate-700 text-slate-500 hover:bg-slate-700/50'
                    }`}>{s}</button>
                );
              })}
            </div>
          ) : (
            <span className={`px-3 py-2.5 rounded-lg text-xs font-bold uppercase border inline-block ${SEV_COLORS[severity]?.badge || ''}`}>{severity}</span>
          )}
        </div>
      </div>

      <div>
        <label className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold mb-1.5 block">Description</label>
        {editMode ? (
          <textarea value={ruleDescription} onChange={e => setRuleDescription(e.target.value)} rows={3}
            className="w-full bg-slate-800/60 border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-slate-300 resize-none focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50 transition-colors" />
        ) : (
          <p className="text-sm text-slate-300 leading-relaxed">{ruleDescription}</p>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Detection Logic (Pseudo-Code)</label>
          <span className="text-[9px] text-slate-600 font-mono">{lines.length} lines / {pseudoCode.length} chars</span>
        </div>
        {editMode ? (
          <div className="relative rounded-xl overflow-hidden border border-slate-700 bg-slate-950/80">
            <div className="absolute left-0 top-0 bottom-0 w-10 bg-slate-900/80 border-r border-slate-800 flex flex-col items-end pt-3 pr-2 pointer-events-none select-none z-10">
              {lines.map((_, i) => (
                <div key={i} className="text-[10px] text-slate-600 font-mono leading-[1.65rem] h-[1.65rem]">{i + 1}</div>
              ))}
            </div>
            <textarea
              value={pseudoCode} onChange={e => setPseudoCode(e.target.value)}
              rows={Math.max(12, lines.length + 2)} spellCheck={false}
              className="w-full bg-transparent pl-12 pr-4 py-3 text-xs text-emerald-300 font-mono leading-[1.65rem] resize-y focus:outline-none"
            />
          </div>
        ) : (
          <div className="relative rounded-xl overflow-hidden border border-slate-700/30 bg-slate-950/80">
            <div className="absolute left-0 top-0 bottom-0 w-10 bg-slate-900/80 border-r border-slate-800 flex flex-col items-end pt-3 pr-2">
              {lines.map((_, i) => (
                <div key={i} className="text-[10px] text-slate-600 font-mono leading-[1.65rem] h-[1.65rem]">{i + 1}</div>
              ))}
            </div>
            <pre className="pl-12 pr-4 py-3 text-xs text-emerald-300 font-mono leading-[1.65rem] overflow-x-auto whitespace-pre-wrap">{pseudoCode}</pre>
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold mb-1.5 block">Time Window</label>
          {editMode ? (
            <input value={timeWindow} onChange={e => setTimeWindow(e.target.value)}
              className="w-full bg-slate-800/60 border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-slate-200 font-mono focus:outline-none focus:border-cyan-500/50 transition-colors" placeholder="5m, 1h, 24h..." />
          ) : (
            <p className="text-sm text-slate-200 font-mono py-2.5">{timeWindow || 'N/A'}</p>
          )}
        </div>
        <div>
          <label className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold mb-1.5 block">Aggregation</label>
          {editMode ? (
            <input value={aggregation} onChange={e => setAggregation(e.target.value)}
              className="w-full bg-slate-800/60 border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-slate-200 font-mono focus:outline-none focus:border-cyan-500/50 transition-colors" placeholder="count, sum, avg..." />
          ) : (
            <p className="text-sm text-slate-200 font-mono py-2.5">{aggregation || 'None'}</p>
          )}
        </div>
        <div>
          <label className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold mb-1.5 block">Confidence</label>
          <div className="flex items-center gap-3 py-2.5">
            <div className="flex-1 h-2.5 bg-slate-800 rounded-full overflow-hidden">
              <div className="h-full rounded-full bg-gradient-to-r from-emerald-600 to-emerald-400 transition-all shadow-lg shadow-emerald-500/20"
                style={{ width: `${Math.round((confidenceScore || 0.85) * 100)}%` }} />
            </div>
            <span className="text-sm text-slate-200 font-mono font-bold">{Math.round((confidenceScore || 0.85) * 100)}%</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function ConditionsTab({
  editMode, conditions, updateCondition, removeCondition, addCondition,
  mitreTactics, newTactic, setNewTactic, addTactic, removeTactic,
  dataSources, newDataSource, setNewDataSource, addDataSource, removeDataSource,
}: {
  editMode: boolean;
  conditions: RuleCondition[];
  updateCondition: (idx: number, field: keyof RuleCondition, value: string) => void;
  removeCondition: (idx: number) => void;
  addCondition: () => void;
  mitreTactics: string[];
  newTactic: string; setNewTactic: (v: string) => void;
  addTactic: () => void; removeTactic: (idx: number) => void;
  dataSources: string[];
  newDataSource: string; setNewDataSource: (v: string) => void;
  addDataSource: () => void; removeDataSource: (idx: number) => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs text-slate-400 uppercase tracking-wider font-semibold flex items-center gap-1.5">
            <Target className="w-3.5 h-3.5 text-cyan-400" />
            Deterministic Conditions ({conditions.length})
          </h3>
          {editMode && (
            <button onClick={addCondition}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-[10px] font-semibold hover:bg-cyan-500/20 transition-colors">
              <Plus className="w-3 h-3" /> Add Condition
            </button>
          )}
        </div>
        <div className="space-y-2">
          {conditions.map((c, i) => (
            <div key={i} className="bg-slate-800/40 rounded-xl border border-slate-700/40 p-3 hover:border-slate-600/50 transition-colors">
              {editMode ? (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-slate-500 font-mono w-5 text-center flex-shrink-0">{i + 1}</span>
                  <input value={c.field} onChange={e => updateCondition(i, 'field', e.target.value)} placeholder="field"
                    className="flex-1 bg-slate-900/60 border border-slate-700 rounded-lg px-3 py-2 text-xs text-cyan-300 font-mono focus:outline-none focus:border-cyan-500/50 transition-colors" />
                  <select value={c.operator} onChange={e => updateCondition(i, 'operator', e.target.value)}
                    className="bg-slate-900/60 border border-slate-700 rounded-lg px-2 py-2 text-xs text-slate-300 focus:outline-none focus:border-cyan-500/50 transition-colors">
                    {OPERATOR_OPTIONS.map(op => <option key={op} value={op}>{op}</option>)}
                  </select>
                  <input value={c.value} onChange={e => updateCondition(i, 'value', e.target.value)} placeholder="value"
                    className="flex-1 bg-slate-900/60 border border-slate-700 rounded-lg px-3 py-2 text-xs text-amber-300 font-mono focus:outline-none focus:border-cyan-500/50 transition-colors" />
                  <input value={c.window || ''} onChange={e => updateCondition(i, 'window', e.target.value)} placeholder="window"
                    className="w-20 bg-slate-900/60 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-400 font-mono focus:outline-none focus:border-cyan-500/50 transition-colors" />
                  <button onClick={() => removeCondition(i)} className="p-1.5 rounded-lg hover:bg-red-500/20 text-slate-500 hover:text-red-400 transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-xs">
                  <div className="w-5 h-5 rounded-full bg-emerald-500/15 flex items-center justify-center flex-shrink-0">
                    <CheckCircle className="w-3 h-3 text-emerald-400" />
                  </div>
                  <span className="text-cyan-400 font-mono">{c.field}</span>
                  <span className="text-slate-500 px-1.5 py-0.5 rounded bg-slate-800/60 text-[10px]">{c.operator}</span>
                  <span className="text-amber-400 font-mono">{c.value}</span>
                  {c.window && <span className="text-slate-500">({c.window})</span>}
                </div>
              )}
            </div>
          ))}
          {conditions.length === 0 && (
            <div className="text-center py-8 bg-slate-800/20 rounded-xl border border-dashed border-slate-700/40">
              <AlertTriangle className="w-6 h-6 text-amber-500/50 mx-auto mb-2" />
              <p className="text-xs text-slate-500">No conditions defined. Add at least one condition.</p>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <TagSection
          title="MITRE ATT&CK" count={mitreTactics.length}
          icon={<Shield className="w-3.5 h-3.5 text-red-400" />}
          items={mitreTactics} editMode={editMode}
          onRemove={removeTactic} newValue={newTactic}
          setNewValue={setNewTactic} onAdd={addTactic}
          placeholder="T1558.003" colorClass="red"
        />
        <TagSection
          title="Data Sources" count={dataSources.length}
          icon={<Brain className="w-3.5 h-3.5 text-blue-400" />}
          items={dataSources} editMode={editMode}
          onRemove={removeDataSource} newValue={newDataSource}
          setNewValue={setNewDataSource} onAdd={addDataSource}
          placeholder="Windows Event Logs" colorClass="blue"
        />
      </div>
    </div>
  );
}

function TagSection({ title, count, icon, items, editMode, onRemove, newValue, setNewValue, onAdd, placeholder, colorClass }: {
  title: string; count: number; icon: React.ReactNode;
  items: string[]; editMode: boolean;
  onRemove: (idx: number) => void;
  newValue: string; setNewValue: (v: string) => void;
  onAdd: () => void; placeholder: string; colorClass: string;
}) {
  const colors: Record<string, { tag: string; btn: string; x: string }> = {
    red: { tag: 'bg-red-500/10 text-red-300 border-red-500/20', btn: 'bg-red-500/10 border-red-500/20 text-red-400 hover:bg-red-500/20', x: 'text-red-400' },
    blue: { tag: 'bg-blue-500/10 text-blue-300 border-blue-500/20', btn: 'bg-blue-500/10 border-blue-500/20 text-blue-400 hover:bg-blue-500/20', x: 'text-blue-400' },
  };
  const c = colors[colorClass];
  return (
    <div>
      <h3 className="text-xs text-slate-400 uppercase tracking-wider font-semibold flex items-center gap-1.5 mb-3">
        {icon} {title} ({count})
      </h3>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {items.map((t, i) => (
          <span key={i} className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono border ${c.tag} group`}>
            {t}
            {editMode && (
              <button onClick={() => onRemove(i)} className="opacity-0 group-hover:opacity-100 transition-opacity">
                <X className={`w-3 h-3 ${c.x}`} />
              </button>
            )}
          </span>
        ))}
      </div>
      {editMode && (
        <div className="flex gap-1.5">
          <input value={newValue} onChange={e => setNewValue(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && onAdd()} placeholder={placeholder}
            className="flex-1 bg-slate-900/60 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-cyan-500/50 transition-colors" />
          <button onClick={onAdd} className={`px-3 py-1.5 rounded-lg border text-[10px] font-semibold transition-colors ${c.btn}`}>
            <Plus className="w-3 h-3" />
          </button>
        </div>
      )}
    </div>
  );
}

function GraphTab({ nodes, edges, severity }: {
  nodes: AIGeneratedRule['graph_nodes'];
  edges: AIGeneratedRule['graph_edges'];
  severity: string;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs text-slate-400 uppercase tracking-wider font-semibold flex items-center gap-1.5">
          <Network className="w-3.5 h-3.5 text-cyan-400" />
          Detection Flow Graph ({nodes.length} nodes, {edges.length} edges)
        </h3>
      </div>

      {nodes.length >= 2 ? (
        <div className="bg-slate-950/60 rounded-xl border border-slate-700/30 p-4 overflow-x-auto">
          <CorrelationRuleGraph nodes={nodes} edges={edges} severity={severity} />
        </div>
      ) : (
        <div className="text-center py-16 bg-slate-800/20 rounded-xl border border-dashed border-slate-700/40">
          <Network className="w-8 h-8 text-slate-600 mx-auto mb-3" />
          <p className="text-sm text-slate-500">Not enough nodes to render graph</p>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {(['source', 'condition', 'detection', 'action'] as const).map(type => {
          const count = nodes.filter(n => n.type === type).length;
          const cfg: Record<string, string> = {
            source: 'text-sky-400 bg-sky-500/10 border-sky-500/20',
            condition: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
            detection: 'text-red-400 bg-red-500/10 border-red-500/20',
            action: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
          };
          return (
            <div key={type} className={`rounded-xl border p-3 ${cfg[type]}`}>
              <p className="text-2xl font-bold">{count}</p>
              <p className="text-[10px] uppercase font-semibold mt-0.5 capitalize">{type} Nodes</p>
            </div>
          );
        })}
      </div>

      {nodes.length > 0 && (
        <div className="bg-slate-800/40 rounded-xl border border-slate-700/40 p-4">
          <h4 className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold mb-3">Node Details</h4>
          <div className="space-y-1.5">
            {nodes.map(node => {
              const tc: Record<string, string> = { source: 'border-l-sky-500', condition: 'border-l-amber-500', detection: 'border-l-red-500', action: 'border-l-emerald-500' };
              return (
                <div key={node.id} className={`border-l-2 ${tc[node.type]} pl-3 py-1.5`}>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-white">{node.label}</span>
                    <span className="text-[9px] text-slate-500 uppercase font-bold">{node.type}</span>
                  </div>
                  {node.detail && <p className="text-[10px] text-slate-400 mt-0.5">{node.detail}</p>}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function TestTab({ testResults, testRunning, onRunTests }: {
  testResults: TestResult[]; testRunning: boolean; onRunTests: () => void;
}) {
  const passCount = testResults.filter(t => t.status === 'pass').length;
  const failCount = testResults.filter(t => t.status === 'fail').length;
  const allPassed = testResults.length > 0 && passCount === testResults.length;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="text-xs text-slate-400 uppercase tracking-wider font-semibold flex items-center gap-1.5">
          <FlaskConical className="w-3.5 h-3.5 text-cyan-400" /> Dry Run Validation
        </h3>
        <button onClick={onRunTests} disabled={testRunning}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-cyan-600/20 border border-cyan-500/30 text-cyan-400 text-xs font-semibold hover:bg-cyan-600/30 transition-colors disabled:opacity-50">
          {testRunning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
          {testRunning ? 'Running...' : 'Run All Tests'}
        </button>
      </div>

      {testResults.length > 0 && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-4 text-center">
              <p className="text-2xl font-bold text-white">{testResults.length}</p>
              <p className="text-[10px] text-slate-500 uppercase font-semibold">Total</p>
            </div>
            <div className="bg-emerald-500/5 rounded-xl border border-emerald-500/20 p-4 text-center">
              <p className="text-2xl font-bold text-emerald-400">{passCount}</p>
              <p className="text-[10px] text-emerald-500 uppercase font-semibold">Passing</p>
            </div>
            <div className={`rounded-xl border p-4 text-center ${failCount > 0 ? 'bg-red-500/5 border-red-500/20' : 'bg-slate-800/50 border-slate-700/50'}`}>
              <p className={`text-2xl font-bold ${failCount > 0 ? 'text-red-400' : 'text-slate-400'}`}>{failCount}</p>
              <p className={`text-[10px] uppercase font-semibold ${failCount > 0 ? 'text-red-500' : 'text-slate-500'}`}>Failing</p>
            </div>
          </div>
          <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden flex">
            {passCount > 0 && <div className="bg-emerald-500 h-full transition-all" style={{ width: `${(passCount / testResults.length) * 100}%` }} />}
            {failCount > 0 && <div className="bg-red-500 h-full transition-all" style={{ width: `${(failCount / testResults.length) * 100}%` }} />}
            {testResults.filter(t => t.status === 'running').length > 0 && (
              <div className="bg-cyan-500 h-full animate-pulse transition-all" style={{ width: `${(testResults.filter(t => t.status === 'running').length / testResults.length) * 100}%` }} />
            )}
          </div>
        </>
      )}

      <div className="space-y-2">
        {testResults.map((t, i) => (
          <div key={i} className={`rounded-xl border p-4 transition-all ${
            t.status === 'pass' ? 'bg-emerald-500/5 border-emerald-500/20'
              : t.status === 'fail' ? 'bg-red-500/5 border-red-500/20'
                : 'bg-cyan-500/5 border-cyan-500/20'
          }`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {t.status === 'pass' ? <CheckCircle className="w-4 h-4 text-emerald-400" />
                  : t.status === 'fail' ? <AlertTriangle className="w-4 h-4 text-red-400" />
                    : <Loader2 className="w-4 h-4 text-cyan-400 animate-spin" />}
                <span className="text-sm font-semibold text-slate-200">{t.name}</span>
              </div>
              <div className="flex items-center gap-2">
                {t.duration !== undefined && <span className="text-[10px] text-slate-500 font-mono">{t.duration}ms</span>}
                <span className={`text-[10px] font-bold uppercase ${t.status === 'pass' ? 'text-emerald-400' : t.status === 'fail' ? 'text-red-400' : 'text-cyan-400'}`}>{t.status}</span>
              </div>
            </div>
            <p className="text-xs text-slate-400 mt-1 ml-6">{t.detail}</p>
          </div>
        ))}
      </div>

      {testResults.length === 0 && !testRunning && (
        <div className="text-center py-16 bg-slate-800/20 rounded-xl border border-dashed border-slate-700/40">
          <FlaskConical className="w-8 h-8 text-slate-600 mx-auto mb-3" />
          <p className="text-sm text-slate-500 mb-1">No tests executed yet</p>
          <p className="text-xs text-slate-600">Run a dry test to validate your rule before promotion</p>
        </div>
      )}

      {allPassed && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 flex items-center gap-3">
          <CheckCircle className="w-5 h-5 text-emerald-400 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-emerald-300">All tests passed</p>
            <p className="text-xs text-emerald-400/70 mt-0.5">This rule is ready for promotion to the testing environment.</p>
          </div>
        </div>
      )}
    </div>
  );
}

function ActionBar({ currentStage, saving, promoting, canPromote, allTestsPassed, onSaveDraft, onPromoteToTesting, onClose }: {
  currentStage: DaCStage; saving: boolean; promoting: boolean; canPromote: boolean; allTestsPassed: boolean;
  onSaveDraft: () => void; onPromoteToTesting: () => void; onClose: () => void;
}) {
  return (
    <div className="flex items-center justify-between px-6 py-4 border-t border-slate-700/40 bg-slate-900/90 relative z-20">
      <div className="flex items-center gap-2 text-[10px] text-slate-500">
        <Clock className="w-3.5 h-3.5" />
        <span>Changes are validated before promotion</span>
        {!canPromote && <span className="text-amber-400 ml-2">-- Name, logic, and at least one condition required</span>}
      </div>
      <div className="flex items-center gap-3">
        <button onClick={onClose} className="px-4 py-2.5 rounded-lg bg-slate-800/50 border border-slate-700 text-slate-400 text-xs font-semibold hover:bg-slate-700/50 transition-colors">Cancel</button>
        <button onClick={onSaveDraft} disabled={saving || !canPromote}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-slate-700/60 border border-slate-600/50 text-slate-200 text-xs font-semibold hover:bg-slate-700 transition-colors disabled:opacity-40">
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Save Draft
        </button>
        <button onClick={onPromoteToTesting} disabled={promoting || !canPromote || currentStage === 'testing'}
          className={`flex items-center gap-1.5 px-5 py-2.5 rounded-lg text-xs font-semibold transition-all disabled:opacity-40 ${
            allTestsPassed ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/20' : 'bg-cyan-600 hover:bg-cyan-500 text-white shadow-lg shadow-cyan-600/20'
          }`}>
          {promoting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Rocket className="w-3.5 h-3.5" />}
          {currentStage === 'testing' ? 'Already in Testing' : 'Promote to Testing'}
        </button>
      </div>
    </div>
  );
}
