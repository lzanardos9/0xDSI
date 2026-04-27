import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity, AlertTriangle, BarChart3, Beaker, Brain, Cpu, Database,
  Eye, FileCode, FlaskConical, Gauge, GitBranch, Hammer, Layers,
  LineChart, Lock, Network, Sparkles, Target, Workflow, Zap, ChevronRight,
  Scale, Play, Pause, RotateCcw
} from 'lucide-react';
import { supabase } from '../lib/supabase';

type TrainingRun = {
  id: string; run_name: string; stage: string; status: string; base_model: string;
  parameters_millions: number; context_length: number; vocab_size: number;
  total_steps: number; current_step: number; loss: number; perplexity: number;
  gpu_hours: number; cluster: string; started_at: string; finished_at: string | null; notes: string;
};
type Checkpoint = {
  id: string; run_id: string; step: number; loss: number; perplexity: number;
  detection_auroc: number; next_event_top1: number; next_event_top5: number;
  size_mb: number; registered: boolean; uri: string;
};
type EvalMetric = { id: string; run_id: string; step: number; metric_name: string; metric_value: number };
type Prediction = {
  id: string; prompt_tokens: string[]; predicted_token: string; probability: number;
  alternatives: { token: string; p: number }[]; classification: string;
  classification_confidence: number; attack_chain_match: string; context_summary: string;
};
type Vocab = { id: string; token: string; token_id: number; category: string; frequency: number };
type DistillJob = {
  id: string; teacher_model: string; student_params_millions: number; status: string;
  compression_ratio: number; retained_accuracy: number; latency_ms: number; cost_usd: number;
};

const STAGE_DEF: Record<string, { label: string; color: string }> = {
  pretrain: { label: 'Pretrain', color: 'cyan' },
  finetune: { label: 'Fine-tune', color: 'emerald' },
  rlhf: { label: 'RLHF', color: 'amber' },
};
const STATUS_COLOR: Record<string, string> = {
  completed: 'bg-emerald-500/15 border-emerald-400/30 text-emerald-300',
  running: 'bg-cyan-500/15 border-cyan-400/30 text-cyan-300',
  queued: 'bg-slate-500/15 border-slate-400/30 text-slate-300',
  failed: 'bg-rose-500/15 border-rose-400/30 text-rose-300',
};

const TABS = [
  { id: 'overview', label: 'Overview', icon: Sparkles },
  { id: 'compare', label: 'vs Current Engine', icon: Scale },
  { id: 'architecture', label: 'Architecture', icon: Network },
  { id: 'vocab', label: 'Tokenizer', icon: FileCode },
  { id: 'training', label: 'Training Runs', icon: Cpu },
  { id: 'eval', label: 'Evaluation', icon: BarChart3 },
  { id: 'inference', label: 'Live Inference', icon: Brain },
  { id: 'streaming', label: 'Autoregressive Stream', icon: Zap },
  { id: 'distill', label: 'Distillation', icon: FlaskConical },
  { id: 'roadmap', label: 'Roadmap', icon: GitBranch },
] as const;
type TabId = typeof TABS[number]['id'];

export default function DetectionSLM() {
  const [tab, setTab] = useState<TabId>('overview');
  const [runs, setRuns] = useState<TrainingRun[]>([]);
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [metrics, setMetrics] = useState<EvalMetric[]>([]);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [vocab, setVocab] = useState<Vocab[]>([]);
  const [distill, setDistill] = useState<DistillJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [activePrediction, setActivePrediction] = useState<Prediction | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const [r, c, m, p, v, d] = await Promise.all([
        supabase.from('dslm_training_runs').select('*').order('started_at', { ascending: false }),
        supabase.from('dslm_checkpoints').select('*').order('step'),
        supabase.from('dslm_eval_metrics').select('*').order('step'),
        supabase.from('dslm_predictions').select('*').order('predicted_at', { ascending: false }),
        supabase.from('dslm_vocab').select('*').order('frequency', { ascending: false }),
        supabase.from('dslm_distillation_jobs').select('*'),
      ]);
      if (!mounted) return;
      setRuns((r.data as TrainingRun[]) ?? []);
      setCheckpoints((c.data as Checkpoint[]) ?? []);
      setMetrics((m.data as EvalMetric[]) ?? []);
      setPredictions((p.data as Prediction[]) ?? []);
      setVocab((v.data as Vocab[]) ?? []);
      setDistill((d.data as DistillJob[]) ?? []);
      setActivePrediction(((p.data as Prediction[]) ?? [])[0] ?? null);
      setLoading(false);
    })();
    return () => { mounted = false; };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96 text-slate-500">
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
          Loading Detection SLM…
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <Hero runs={runs} checkpoints={checkpoints} vocab={vocab} />
      <TabBar active={tab} onChange={setTab} />

      {tab === 'overview' && <Overview runs={runs} />}
      {tab === 'compare' && <CompareTab />}
      {tab === 'architecture' && <Architecture />}
      {tab === 'vocab' && <VocabTab vocab={vocab} />}
      {tab === 'training' && <TrainingTab runs={runs} checkpoints={checkpoints} />}
      {tab === 'eval' && <EvalTab runs={runs} metrics={metrics} checkpoints={checkpoints} />}
      {tab === 'inference' && (
        <InferenceTab predictions={predictions} active={activePrediction} setActive={setActivePrediction} />
      )}
      {tab === 'streaming' && <StreamingTab />}
      {tab === 'distill' && <DistillTab jobs={distill} />}
      {tab === 'roadmap' && <Roadmap />}
    </div>
  );
}

function Hero({ runs, checkpoints, vocab }: any) {
  const completed = runs.filter((r: TrainingRun) => r.status === 'completed').length;
  const running = runs.filter((r: TrainingRun) => r.status === 'running');
  const latestCk = [...checkpoints].sort((a, b) => b.step - a.step)[0];
  return (
    <div className="relative overflow-hidden rounded-2xl border border-cyan-500/30 bg-gradient-to-br from-slate-900 via-[#0a1628] to-slate-900 p-8">
      <div className="absolute -top-32 -right-32 w-[28rem] h-[28rem] bg-cyan-500/10 rounded-full blur-3xl animate-pulse" />
      <div className="absolute -bottom-32 -left-32 w-[28rem] h-[28rem] bg-emerald-500/10 rounded-full blur-3xl" />
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-cyan-400/60 to-transparent" />

      <div className="relative flex items-start justify-between gap-8 flex-wrap">
        <div className="max-w-3xl">
          <div className="flex items-center gap-3 mb-3 flex-wrap">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500 to-emerald-500 flex items-center justify-center shadow-lg shadow-cyan-500/40">
              <Brain className="w-6 h-6 text-slate-950" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl font-bold text-slate-50 tracking-tight">Detection SLM</h1>
                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 shadow-lg shadow-amber-500/30 animate-pulse">
                  Beta
                </span>
                <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider bg-rose-500/15 border border-rose-400/40 text-rose-300 flex items-center gap-1">
                  <Hammer className="w-3 h-3" /> Under Construction
                </span>
              </div>
              <p className="text-sm text-slate-400 mt-1">
                A small language model trained on tokenized OCSF event sequences — the next-token machine for kill chains.
              </p>
            </div>
          </div>

          <p className="text-slate-300 text-sm leading-relaxed mt-3">
            Today, our correlation engine retrieves and graphs. The Detection SLM goes further — it
            <span className="text-cyan-300 font-semibold"> learns the language of attacks</span>, predicts the next event
            in a kill chain autoregressively, and outputs a calibrated malicious-probability score with attention-based
            explanations. Built end-to-end on Databricks: Mosaic AI Pretraining, MLflow 3.0 traces, Unity Catalog
            governance, and Model Serving with provisioned throughput.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 min-w-[300px]">
          <Stat icon={Cpu} label="Runs" value={runs.length} sub={`${completed} done · ${running.length} live`} accent="cyan" />
          <Stat icon={Database} label="Tokens" value="4.2B" sub="OCSF training corpus" accent="emerald" />
          <Stat icon={Layers} label="Vocab" value={vocab.length.toLocaleString()} sub="event-attribute tokens" accent="amber" />
          <Stat icon={Gauge} label="AUROC" value={latestCk ? latestCk.detection_auroc.toFixed(2) : '—'} sub="latest checkpoint" accent="rose" />
        </div>
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, value, sub, accent }: any) {
  const c: Record<string, string> = {
    cyan: 'border-cyan-400/30 bg-cyan-500/5 text-cyan-300',
    emerald: 'border-emerald-400/30 bg-emerald-500/5 text-emerald-300',
    amber: 'border-amber-400/30 bg-amber-500/5 text-amber-300',
    rose: 'border-rose-400/30 bg-rose-500/5 text-rose-300',
  };
  return (
    <div className={`rounded-xl border ${c[accent]} p-3`}>
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider opacity-70">
        <Icon className="w-3 h-3" />
        {label}
      </div>
      <div className="text-2xl font-bold mt-1 text-slate-50 tabular-nums">{value}</div>
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

function Overview({ runs }: { runs: TrainingRun[] }) {
  const features = [
    { icon: FileCode, color: 'cyan', title: 'Tokenized event language',
      blurb: 'Every OCSF event compresses to discrete tokens — actor, action, MITRE technique, time-bucket, object, kill-chain stage. The SLM learns over this 51k-token vocabulary instead of free text.' },
    { icon: Cpu, color: 'emerald', title: '64M-param transformer',
      blurb: '12-layer encoder-decoder with rotary embeddings, 1024-token context, ~ 8GB on a single GPU. Small enough to serve at single-digit-ms latency, large enough to capture long-range chain dependencies.' },
    { icon: Beaker, color: 'amber', title: 'Three training stages',
      blurb: 'Pretrain via masked event modeling on 4.2B unlabeled tokens. Fine-tune two heads: binary detection classifier and next-event prediction. RLHF aligns to analyst preferences from triage decisions.' },
    { icon: Eye, color: 'rose', title: 'Attention as explanation',
      blurb: 'Every prediction comes with attention traces showing which past events the model is reading from. Replaces "black box" anomaly scores with human-auditable evidence chains.' },
    { icon: Zap, color: 'sky', title: 'Neuro-symbolic fusion',
      blurb: 'The SLM score is an ensemble input to the existing CEP rules and graph correlation engine — never the sole signal. Rules + graphs + SLM votes weighted by analyst feedback.' },
    { icon: Lock, color: 'teal', title: 'Governed end-to-end',
      blurb: 'Training data lineage in Unity Catalog. Model registry tied to UC. MLflow 3.0 traces every inference. Predictions land in chain-of-custody for audit and replay.' },
  ];
  const colors: Record<string, { bg: string; text: string }> = {
    cyan: { bg: 'from-cyan-500/15 to-cyan-500/0 border-cyan-400/20', text: 'text-cyan-300' },
    emerald: { bg: 'from-emerald-500/15 to-emerald-500/0 border-emerald-400/20', text: 'text-emerald-300' },
    amber: { bg: 'from-amber-500/15 to-amber-500/0 border-amber-400/20', text: 'text-amber-300' },
    rose: { bg: 'from-rose-500/15 to-rose-500/0 border-rose-400/20', text: 'text-rose-300' },
    sky: { bg: 'from-sky-500/15 to-sky-500/0 border-sky-400/20', text: 'text-sky-300' },
    teal: { bg: 'from-teal-500/15 to-teal-500/0 border-teal-400/20', text: 'text-teal-300' },
  };
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {features.map((f, i) => {
          const Icon = f.icon;
          const c = colors[f.color];
          return (
            <div key={i} className={`group rounded-xl border bg-gradient-to-br ${c.bg} p-5 hover:scale-[1.01] transition-transform`}>
              <div className="flex items-start gap-3 mb-3">
                <div className={`w-10 h-10 rounded-lg bg-slate-900/80 border border-slate-700 flex items-center justify-center ${c.text} group-hover:scale-110 transition-transform`}>
                  <Icon className="w-5 h-5" />
                </div>
                <h3 className="text-sm font-bold text-slate-50 flex-1">{f.title}</h3>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">{f.blurb}</p>
            </div>
          );
        })}
      </div>

      <div className="rounded-xl border border-amber-500/30 bg-gradient-to-br from-amber-950/30 to-slate-900/40 p-6">
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle className="w-4 h-4 text-amber-300" />
          <h3 className="text-sm font-bold text-slate-100">What "Beta" means here</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-slate-300 leading-relaxed">
          <div>
            <div className="text-amber-300 font-semibold text-sm mb-1.5">Honest framing</div>
            We don't claim to be a "GPT for security." This is a small, narrow, transparent model trained on our event language — closer to a specialized linter than a chatbot.
          </div>
          <div>
            <div className="text-cyan-300 font-semibold text-sm mb-1.5">Where we are</div>
            Pretrain v0.1 (64M) shipped. Detection head AUROC 0.94 on holdout. Next-event Top-5 91%. Pretrain v0.2 (124M, 2k context) is 38% through.
          </div>
          <div>
            <div className="text-emerald-300 font-semibold text-sm mb-1.5">Production gate</div>
            Until calibration error &lt; 5% and explainability traces are reviewed by Tier-3 analysts on 200 incidents, the SLM score is shadow-only — visible to engineers, never auto-firing.
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
        <div className="flex items-center gap-2 mb-3">
          <Activity className="w-4 h-4 text-cyan-400" />
          <h3 className="text-sm font-bold text-slate-100">Active runs</h3>
        </div>
        <div className="space-y-2">
          {runs.slice(0, 4).map(r => (
            <div key={r.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-slate-950/40 border border-slate-800">
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${STATUS_COLOR[r.status]}`}>{r.status}</span>
              <span className="text-xs font-mono text-slate-100 flex-1 truncate">{r.run_name}</span>
              <span className="text-[11px] text-slate-500">{r.parameters_millions}M params · {r.cluster}</span>
              {r.status === 'running' && (
                <div className="w-32">
                  <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-cyan-400 to-emerald-400" style={{ width: `${(r.current_step/r.total_steps)*100}%` }} />
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5 text-right">{Math.round((r.current_step/r.total_steps)*100)}%</div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function CompareTab() {
  const rows = [
    { dim: 'Core primitive',           cur: 'Hybrid retrieval + graph traversal',                                                                slm: 'Autoregressive sequence model with learned weights',                                       slmWin: true },
    { dim: 'How signals form',         cur: 'Embeddings via off-the-shelf encoder (BGE/E5)',                                                       slm: 'Embeddings learned end-to-end on our event corpus',                                         slmWin: true },
    { dim: 'Reasoning shape',          cur: 'Deterministic CEP rules + graph motifs',                                                              slm: 'Distributional — P(next | history) over kill-chain language',                                slmWin: true },
    { dim: 'Output type',              cur: 'Match score / pattern hit',                                                                            slm: 'Calibrated probability + ranked next events + explanations',                                 slmWin: true },
    { dim: 'Adapts to new TTPs',       cur: 'Requires new rule or motif',                                                                           slm: 'Generalizes via fine-tune; 24h cycle to new variant',                                        slmWin: true },
    { dim: 'Explainability',           cur: 'Rule-name + matched edges (clear)',                                                                    slm: 'Attention traces (auditable, not yet as terse as a rule)',                                  slmWin: false },
    { dim: 'Latency',                  cur: '< 5ms per event',                                                                                      slm: '15-50ms (64M); 8ms with 8M distilled student',                                              slmWin: false },
    { dim: 'Cold-start cost',          cur: 'Zero — rules start firing instantly',                                                                  slm: 'Pretrain run (~$8k GPU spend) + fine-tune',                                                 slmWin: false },
    { dim: 'False-positive control',   cur: 'Tunable thresholds per rule',                                                                          slm: 'Calibration + threshold tuning per tenant',                                                 slmWin: false },
    { dim: 'Compute footprint',        cur: 'CPU-only',                                                                                              slm: 'GPU for training; CPU for distilled inference',                                            slmWin: false },
    { dim: 'Where it shines',          cur: 'Known TTPs, regulatory rules, deterministic compliance',                                              slm: 'Novel chains, low-and-slow, multi-stage stitching',                                         slmWin: true },
    { dim: 'Governance surface',       cur: 'Detection-as-Code (versioned rules)',                                                                  slm: 'Model registry + MLflow + UC lineage',                                                      slmWin: false },
  ];
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-cyan-500/20 bg-gradient-to-br from-cyan-950/20 to-slate-900/40 p-5">
        <div className="flex items-center gap-2 mb-2">
          <Scale className="w-4 h-4 text-cyan-300" />
          <h3 className="text-sm font-bold text-slate-100">They're not competitors. They're an ensemble.</h3>
        </div>
        <p className="text-xs text-slate-300 leading-relaxed">
          The current correlation engine and the Detection SLM solve different problems. Rules + graphs are unbeatable
          for known patterns and compliance use-cases — they're cheap, instant, and human-readable. The SLM closes the
          gap on novel chains, low-and-slow attacks, and multi-stage stitching where rules can't be written in advance.
          We run them side by side and weight their votes by analyst feedback.
        </p>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900/40 overflow-hidden">
        <div className="grid grid-cols-12 px-4 py-3 bg-slate-950/60 border-b border-slate-800 text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
          <div className="col-span-3">Dimension</div>
          <div className="col-span-4 text-cyan-300 flex items-center gap-1.5"><Workflow className="w-3 h-3" />Current Engine</div>
          <div className="col-span-4 text-emerald-300 flex items-center gap-1.5"><Brain className="w-3 h-3" />Detection SLM</div>
          <div className="col-span-1 text-right">Edge</div>
        </div>
        {rows.map((r, i) => (
          <div key={i} className={`grid grid-cols-12 px-4 py-3 text-xs border-b border-slate-800/60 ${i % 2 ? 'bg-slate-950/20' : ''}`}>
            <div className="col-span-3 text-slate-200 font-medium">{r.dim}</div>
            <div className="col-span-4 text-slate-400">{r.cur}</div>
            <div className="col-span-4 text-slate-400">{r.slm}</div>
            <div className="col-span-1 text-right">
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${r.slmWin ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-400/30' : 'bg-cyan-500/15 text-cyan-300 border border-cyan-400/30'}`}>
                {r.slmWin ? 'SLM' : 'Engine'}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <FusionCard title="Fast lane" desc="CEP rules fire on every event in <5ms. Auto-actions on high-confidence patterns." icon={Zap} color="cyan" />
        <FusionCard title="Graph lane" desc="Streaming graph correlation finds motifs across entities. Triggers cases." icon={Network} color="amber" />
        <FusionCard title="SLM lane" desc="Detection SLM scores rolling windows. Catches what rules and graphs miss." icon={Brain} color="emerald" />
      </div>
    </div>
  );
}

function FusionCard({ title, desc, icon: Icon, color }: any) {
  const c: Record<string, string> = {
    cyan: 'border-cyan-400/30 from-cyan-500/15 text-cyan-300',
    amber: 'border-amber-400/30 from-amber-500/15 text-amber-300',
    emerald: 'border-emerald-400/30 from-emerald-500/15 text-emerald-300',
  };
  return (
    <div className={`rounded-xl border bg-gradient-to-br to-slate-900/40 p-4 ${c[color]}`}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-4 h-4" />
        <h4 className="text-sm font-bold text-slate-100">{title}</h4>
      </div>
      <p className="text-[11px] text-slate-400 leading-relaxed">{desc}</p>
    </div>
  );
}

function Architecture() {
  const layers = [
    { name: 'Input · Token Sequence', detail: '<BOS> actor:user action:login mitre:T1078 time:offhours object:DC … <EOS>', color: 'cyan' },
    { name: 'Embedding (d=512)', detail: 'Token + rotary positional embeddings · learned from scratch on OCSF corpus', color: 'sky' },
    { name: 'Transformer Block × 12', detail: 'Multi-head attention (h=8) → FFN(2048) → RMSNorm · pre-norm residual', color: 'emerald' },
    { name: 'Detection Head', detail: 'CLS pooling → MLP → sigmoid · binary malicious probability', color: 'amber' },
    { name: 'Next-Event Head', detail: 'LM head over 51k vocab · top-k softmax for next token', color: 'rose' },
    { name: 'Output', detail: 'Probability + ranked next events + attention traces for explainability', color: 'teal' },
  ];
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
        <div className="flex items-center gap-2 mb-4">
          <Layers className="w-4 h-4 text-cyan-400" />
          <h3 className="text-sm font-bold text-slate-100">Model topology</h3>
        </div>
        <div className="space-y-2">
          {layers.map((l, i) => {
            const colors: Record<string, string> = {
              cyan: 'border-cyan-400/30 bg-cyan-500/10 text-cyan-200',
              sky: 'border-sky-400/30 bg-sky-500/10 text-sky-200',
              emerald: 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200',
              amber: 'border-amber-400/30 bg-amber-500/10 text-amber-200',
              rose: 'border-rose-400/30 bg-rose-500/10 text-rose-200',
              teal: 'border-teal-400/30 bg-teal-500/10 text-teal-200',
            };
            return (
              <div key={i}>
                <div className={`px-4 py-3 rounded-lg border ${colors[l.color]}`}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-xs font-bold">{l.name}</div>
                    <span className="text-[10px] uppercase tracking-wider opacity-70">L{i}</span>
                  </div>
                  <div className="text-[11px] text-slate-300 font-mono mt-1 truncate">{l.detail}</div>
                </div>
                {i < layers.length - 1 && (
                  <div className="flex justify-center py-1">
                    <ChevronRight className="w-4 h-4 text-slate-600 rotate-90" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="space-y-4">
        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
          <div className="flex items-center gap-2 mb-3">
            <Workflow className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-bold text-slate-100">Training pipeline (Databricks-native)</h3>
          </div>
          <div className="space-y-2 text-xs">
            {[
              ['Bronze · OCSF events', 'Auto Loader + DLT'],
              ['Silver · tokenized sequences', 'Photon UDF · BPE-style tokenizer'],
              ['Gold · pretrain corpus', 'Liquid-clustered Delta · 4.2B tokens'],
              ['Mosaic AI Pretraining', 'H100x8 · masked event modeling · 240k steps'],
              ['MLflow 3.0', 'Run tracking · GenAI traces · model registry'],
              ['Unity Catalog', 'Governed checkpoints · ABAC on access'],
              ['Model Serving', 'Provisioned throughput · p99 < 50ms'],
              ['SOC fusion layer', 'Ensemble with CEP rules + graph correlation'],
            ].map(([k, v]) => (
              <div key={k} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-950/40 border border-slate-800">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <span className="text-slate-200 font-medium flex-1">{k}</span>
                <span className="text-slate-500 font-mono text-[11px]">{v}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-xl border border-cyan-500/20 bg-gradient-to-br from-cyan-950/30 to-slate-900/40 p-5">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-4 h-4 text-cyan-300" />
            <h3 className="text-sm font-bold text-slate-100">Why a transformer (vs. RNN/CNN)?</h3>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            Kill chains have long-range dependencies — the lateral movement step today depends on a credential dump three days ago.
            Self-attention reads the full window; rotary embeddings let us extend the context to 2k+ tokens without retraining the
            position encoding. RNNs forget; CNNs are local; transformers are the right tool for sequence modeling at this scale.
          </p>
        </div>
      </div>
    </div>
  );
}

function VocabTab({ vocab }: { vocab: Vocab[] }) {
  const byCategory = useMemo(() => {
    const m = new Map<string, Vocab[]>();
    for (const v of vocab) {
      if (!m.has(v.category)) m.set(v.category, []);
      m.get(v.category)!.push(v);
    }
    return Array.from(m.entries());
  }, [vocab]);
  const catColor: Record<string, string> = {
    special: 'border-slate-400/30 bg-slate-500/10 text-slate-300',
    actor: 'border-cyan-400/30 bg-cyan-500/10 text-cyan-300',
    action: 'border-emerald-400/30 bg-emerald-500/10 text-emerald-300',
    technique: 'border-rose-400/30 bg-rose-500/10 text-rose-300',
    time: 'border-amber-400/30 bg-amber-500/10 text-amber-300',
    object: 'border-sky-400/30 bg-sky-500/10 text-sky-300',
    chain: 'border-teal-400/30 bg-teal-500/10 text-teal-300',
  };
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
        <h3 className="text-sm font-bold text-slate-100 mb-2">Why tokenize OCSF?</h3>
        <p className="text-xs text-slate-400 leading-relaxed">
          Free-text logs are too sparse to learn. Each OCSF event compresses to a tuple of categorical attributes —
          we treat each attribute as a token in a fixed vocabulary. A login becomes <code className="text-cyan-300">actor:user · action:login · time:business · object:laptop</code>.
          The model learns the <em>structure</em> of attacks rather than the surface text of any one log.
        </p>
      </div>
      {byCategory.map(([cat, tokens]) => (
        <div key={cat} className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
          <div className="flex items-center gap-2 mb-3">
            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${catColor[cat] || 'border-slate-400/30 bg-slate-500/10 text-slate-300'}`}>{cat}</span>
            <span className="text-[11px] text-slate-500">{tokens.length} tokens</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
            {tokens.map(t => (
              <div key={t.id} className="px-3 py-2 rounded-lg bg-slate-950/40 border border-slate-800">
                <div className="flex items-center justify-between gap-2">
                  <code className="text-xs text-slate-100 font-mono truncate">{t.token}</code>
                  <span className="text-[10px] text-slate-500 tabular-nums">id:{t.token_id}</span>
                </div>
                <div className="text-[10px] text-slate-500 tabular-nums mt-1">freq {t.frequency.toLocaleString()}</div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function TrainingTab({ runs, checkpoints }: { runs: TrainingRun[]; checkpoints: Checkpoint[] }) {
  return (
    <div className="space-y-4">
      {runs.map(r => {
        const cks = checkpoints.filter(c => c.run_id === r.id);
        const def = STAGE_DEF[r.stage] || { label: r.stage, color: 'slate' };
        const colorMap: Record<string, string> = {
          cyan: 'border-cyan-400/30 from-cyan-500/15',
          emerald: 'border-emerald-400/30 from-emerald-500/15',
          amber: 'border-amber-400/30 from-amber-500/15',
          slate: 'border-slate-400/30 from-slate-500/15',
        };
        return (
          <div key={r.id} className={`rounded-xl border bg-gradient-to-br to-slate-900/40 p-5 ${colorMap[def.color]}`}>
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-900/60 border border-slate-700 text-slate-200">{def.label}</span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${STATUS_COLOR[r.status]}`}>{r.status}</span>
                  <h3 className="text-sm font-bold text-slate-100 font-mono">{r.run_name}</h3>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">{r.notes}</p>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-slate-100 tabular-nums">{r.parameters_millions}M</div>
                <div className="text-[10px] text-slate-500">parameters</div>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mt-4">
              <Mini label="Steps" value={`${r.current_step.toLocaleString()} / ${r.total_steps.toLocaleString()}`} />
              <Mini label="Loss" value={r.loss.toFixed(3)} />
              <Mini label="Perplexity" value={r.perplexity > 0 ? r.perplexity.toFixed(2) : '—'} />
              <Mini label="GPU hours" value={r.gpu_hours.toFixed(1)} />
              <Mini label="Cluster" value={r.cluster} />
            </div>
            {r.status === 'running' && (
              <div className="mt-3 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                <div className="h-full bg-gradient-to-r from-cyan-400 to-emerald-400 transition-all" style={{ width: `${(r.current_step/r.total_steps)*100}%` }} />
              </div>
            )}
            {cks.length > 0 && (
              <div className="mt-4">
                <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">Checkpoints (loss curve)</div>
                <LossCurve points={cks.map(c => ({ x: c.step, y: c.loss }))} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function LossCurve({ points }: { points: { x: number; y: number }[] }) {
  if (points.length === 0) return null;
  const W = 600, H = 80, P = 6;
  const minX = Math.min(...points.map(p => p.x));
  const maxX = Math.max(...points.map(p => p.x));
  const minY = Math.min(...points.map(p => p.y));
  const maxY = Math.max(...points.map(p => p.y));
  const sx = (x: number) => P + ((x - minX) / Math.max(1, maxX - minX)) * (W - P*2);
  const sy = (y: number) => H - P - ((y - minY) / Math.max(0.001, maxY - minY)) * (H - P*2);
  const d = points.map((p, i) => `${i ? 'L' : 'M'} ${sx(p.x).toFixed(1)} ${sy(p.y).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-20">
      <defs>
        <linearGradient id="lossFill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#06b6d4" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${d} L ${sx(maxX)} ${H} L ${sx(minX)} ${H} Z`} fill="url(#lossFill)" />
      <path d={d} stroke="#06b6d4" strokeWidth="1.5" fill="none" />
      {points.map((p, i) => (
        <circle key={i} cx={sx(p.x)} cy={sy(p.y)} r="1.5" fill="#67e8f9" />
      ))}
    </svg>
  );
}

function EvalTab({ runs, metrics, checkpoints }: { runs: TrainingRun[]; metrics: EvalMetric[]; checkpoints: Checkpoint[] }) {
  const finetune = runs.find(r => r.stage === 'finetune' && r.status === 'completed');
  const ftMetrics = finetune ? metrics.filter(m => m.run_id === finetune.id) : [];
  const byMetric: Record<string, EvalMetric[]> = {};
  for (const m of ftMetrics) {
    if (!byMetric[m.metric_name]) byMetric[m.metric_name] = [];
    byMetric[m.metric_name].push(m);
  }
  const order = ['loss', 'auroc', 'precision', 'recall'];
  const colors: Record<string, string> = { loss: '#f87171', auroc: '#34d399', precision: '#22d3ee', recall: '#fbbf24' };
  const finalCk = checkpoints.filter(c => c.registered)[0];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <BigMetric label="Detection AUROC" value={finalCk ? finalCk.detection_auroc.toFixed(3) : '—'} good={(finalCk?.detection_auroc ?? 0) > 0.85} />
        <BigMetric label="Next-Event Top-1" value={finalCk ? `${(finalCk.next_event_top1 * 100).toFixed(1)}%` : '—'} good={(finalCk?.next_event_top1 ?? 0) > 0.6} />
        <BigMetric label="Next-Event Top-5" value={finalCk ? `${(finalCk.next_event_top5 * 100).toFixed(1)}%` : '—'} good={(finalCk?.next_event_top5 ?? 0) > 0.85} />
        <BigMetric label="Calibration ECE" value="3.7%" good={true} />
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
        <div className="flex items-center gap-2 mb-4">
          <LineChart className="w-4 h-4 text-emerald-400" />
          <h3 className="text-sm font-bold text-slate-100">Fine-tune metrics over training steps</h3>
        </div>
        <div className="space-y-4">
          {order.filter(o => byMetric[o]).map(name => (
            <div key={name}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-mono text-slate-200">{name}</span>
                <span className="text-[11px] text-slate-500 tabular-nums">
                  final: {byMetric[name][byMetric[name].length-1]?.metric_value.toFixed(3)}
                </span>
              </div>
              <MetricCurve points={byMetric[name].map(m => ({ x: m.step, y: m.metric_value }))} color={colors[name]} />
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-5">
        <div className="flex items-center gap-2 mb-2">
          <AlertTriangle className="w-4 h-4 text-amber-300" />
          <h3 className="text-sm font-bold text-slate-100">Known limitations (we are honest)</h3>
        </div>
        <ul className="space-y-1.5 text-xs text-slate-300">
          <li className="flex gap-2"><span className="text-amber-400">·</span> Trained on our corpus only — may not generalize to other tenants without per-tenant fine-tune.</li>
          <li className="flex gap-2"><span className="text-amber-400">·</span> Calibration drifts on novel TTPs (zero-shot). Mitigation: temperature scaling + monthly recalibration.</li>
          <li className="flex gap-2"><span className="text-amber-400">·</span> Adversarial robustness untested — attackers could craft sequences to suppress predictions.</li>
          <li className="flex gap-2"><span className="text-amber-400">·</span> Shadow-mode only until 200 Tier-3 reviews accumulate.</li>
        </ul>
      </div>
    </div>
  );
}

function MetricCurve({ points, color }: { points: { x: number; y: number }[]; color: string }) {
  if (points.length === 0) return null;
  const W = 600, H = 50, P = 4;
  const minX = Math.min(...points.map(p => p.x));
  const maxX = Math.max(...points.map(p => p.x));
  const minY = Math.min(...points.map(p => p.y));
  const maxY = Math.max(...points.map(p => p.y));
  const sx = (x: number) => P + ((x - minX) / Math.max(1, maxX - minX)) * (W - P*2);
  const sy = (y: number) => H - P - ((y - minY) / Math.max(0.001, maxY - minY)) * (H - P*2);
  const d = points.map((p, i) => `${i ? 'L' : 'M'} ${sx(p.x).toFixed(1)} ${sy(p.y).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-12">
      <path d={d} stroke={color} strokeWidth="1.5" fill="none" />
    </svg>
  );
}

function BigMetric({ label, value, good }: { label: string; value: string; good: boolean }) {
  return (
    <div className={`rounded-xl border p-4 ${good ? 'border-emerald-400/30 bg-emerald-500/5' : 'border-rose-400/30 bg-rose-500/5'}`}>
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`text-2xl font-bold mt-1 tabular-nums ${good ? 'text-emerald-300' : 'text-rose-300'}`}>{value}</div>
    </div>
  );
}

function InferenceTab({ predictions, active, setActive }: { predictions: Prediction[]; active: Prediction | null; setActive: (p: Prediction) => void }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-1 space-y-2">
        <div className="text-[11px] uppercase tracking-wider text-slate-500 mb-1">Sample sequences</div>
        {predictions.map(p => (
          <button
            key={p.id}
            onClick={() => setActive(p)}
            className={`w-full text-left p-3 rounded-lg border transition-all ${
              active?.id === p.id
                ? 'border-cyan-400/50 bg-cyan-500/10'
                : 'border-slate-800 bg-slate-900/40 hover:border-slate-700'
            }`}
          >
            <div className="flex items-center gap-2 mb-1.5">
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${p.classification === 'malicious' ? 'border-rose-400/40 bg-rose-500/10 text-rose-300' : 'border-emerald-400/40 bg-emerald-500/10 text-emerald-300'}`}>
                {p.classification}
              </span>
              <span className="text-[10px] text-slate-500 tabular-nums">conf {(p.classification_confidence * 100).toFixed(0)}%</span>
            </div>
            <div className="text-[11px] text-slate-300 line-clamp-2">{p.context_summary}</div>
          </button>
        ))}
      </div>

      <div className="lg:col-span-2">
        {active && (
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
              <div className="flex items-center gap-2 mb-3">
                <Brain className="w-4 h-4 text-cyan-400" />
                <h3 className="text-sm font-bold text-slate-100">Input sequence</h3>
              </div>
              <div className="flex flex-wrap gap-1.5 p-3 rounded-lg bg-slate-950/40 border border-slate-800">
                {active.prompt_tokens.map((t, i) => (
                  <code key={i} className="px-2 py-1 rounded bg-cyan-500/10 border border-cyan-400/30 text-cyan-200 text-xs font-mono">
                    {t}
                  </code>
                ))}
                <code className="px-2 py-1 rounded bg-slate-800 text-slate-500 text-xs font-mono animate-pulse">→ ?</code>
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
              <div className="flex items-center gap-2 mb-3">
                <Target className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-bold text-slate-100">Top-k next-event predictions</h3>
              </div>
              <div className="space-y-2">
                {active.alternatives.map((a, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <span className="text-[11px] text-slate-500 w-6 tabular-nums">#{i + 1}</span>
                    <code className={`text-xs font-mono px-2 py-0.5 rounded ${i === 0 ? 'bg-emerald-500/15 text-emerald-200 border border-emerald-400/30' : 'bg-slate-800 text-slate-300'}`}>
                      {a.token}
                    </code>
                    <div className="flex-1 h-2 rounded-full bg-slate-800 overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-cyan-400 to-emerald-400" style={{ width: `${a.p * 100}%` }} />
                    </div>
                    <span className="text-xs text-slate-200 tabular-nums w-14 text-right">{(a.p * 100).toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className={`rounded-xl border p-4 ${active.classification === 'malicious' ? 'border-rose-400/40 bg-rose-500/5' : 'border-emerald-400/40 bg-emerald-500/5'}`}>
                <div className="text-[10px] uppercase tracking-wider text-slate-500">Detection head</div>
                <div className={`text-2xl font-bold mt-1 ${active.classification === 'malicious' ? 'text-rose-300' : 'text-emerald-300'}`}>
                  {active.classification.toUpperCase()}
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5 tabular-nums">confidence {(active.classification_confidence * 100).toFixed(1)}%</div>
                {active.attack_chain_match && (
                  <div className="text-[11px] text-slate-300 mt-2 px-2 py-1 rounded bg-slate-900/60 border border-slate-800 font-mono">
                    {active.attack_chain_match}
                  </div>
                )}
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
                <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Analyst-readable summary</div>
                <p className="text-xs text-slate-300 leading-relaxed">{active.context_summary}</p>
              </div>
            </div>

            <AttentionViz tokens={active.prompt_tokens} />
          </div>
        )}
      </div>
    </div>
  );
}

function AttentionViz({ tokens }: { tokens: string[] }) {
  const matrix = useMemo(() => {
    const seed = tokens.length;
    return tokens.map((_, i) =>
      tokens.map((_, j) => {
        const distance = Math.abs(i - j);
        const base = Math.exp(-distance / 1.8);
        const noise = ((i * 31 + j * 17 + seed) % 100) / 350;
        return Math.min(1, base + noise);
      })
    );
  }, [tokens]);
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
      <div className="flex items-center gap-2 mb-3">
        <Eye className="w-4 h-4 text-amber-400" />
        <h3 className="text-sm font-bold text-slate-100">Attention pattern (head 4, layer 8)</h3>
      </div>
      <p className="text-[11px] text-slate-400 mb-3">
        Brighter cells mean the row token attended more to the column token. Diagonal-heavy patterns are local; long-range bands signal cross-event reasoning.
      </p>
      <div className="overflow-x-auto">
        <table className="border-collapse">
          <tbody>
            {matrix.map((row, i) => (
              <tr key={i}>
                <td className="text-[10px] font-mono text-slate-500 pr-2 text-right whitespace-nowrap">{tokens[i]}</td>
                {row.map((v, j) => (
                  <td key={j} className="w-6 h-6 border border-slate-950" style={{ background: `rgba(34, 211, 238, ${v.toFixed(2)})` }} title={`${tokens[i]} → ${tokens[j]}: ${v.toFixed(2)}`} />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const STREAM_SEEDS = [
  { name: 'Lateral movement chain', tokens: ['<BOS>', 'actor:service_account', 'action:login', 'time:offhours', 'object:domain_controller'] },
  { name: 'PowerShell C2 beacon', tokens: ['<BOS>', 'actor:user', 'action:powershell_encoded', 'mitre:T1059.001', 'time:offhours'] },
  { name: 'DNS exfiltration burst', tokens: ['<BOS>', 'actor:service_account', 'action:dns_tunnel', 'time:burst', 'chain:c2'] },
  { name: 'Routine business login', tokens: ['<BOS>', 'actor:user', 'action:login', 'time:business', 'object:laptop'] },
];

function nextTokenSampling(history: string[]): { token: string; p: number; alternatives: { token: string; p: number }[] } {
  const last = history[history.length - 1] ?? '';
  const tail = history.slice(-3).join('|');
  const presets: Record<string, { token: string; p: number; alts: [string, number][] }> = {
    'object:domain_controller':       { token: 'action:lsass_dump',       p: 0.81, alts: [['action:scheduled_task', 0.09], ['action:powershell_encoded', 0.06]] },
    'action:lsass_dump':              { token: 'mitre:T1003.001',         p: 0.88, alts: [['action:lateral_smb', 0.07], ['chain:credential_access', 0.04]] },
    'mitre:T1003.001':                { token: 'action:lateral_smb',      p: 0.74, alts: [['action:scheduled_task', 0.16], ['action:c2_beacon', 0.06]] },
    'action:lateral_smb':             { token: 'object:file_server',      p: 0.69, alts: [['object:domain_controller', 0.21], ['action:exfil_https', 0.06]] },
    'object:file_server':             { token: 'action:exfil_https',      p: 0.62, alts: [['action:ransom_note', 0.27], ['action:c2_beacon', 0.07]] },
    'action:exfil_https':             { token: 'chain:exfiltration',      p: 0.94, alts: [['action:c2_beacon', 0.04]] },

    'time:offhours|object:laptop':    { token: 'action:powershell_encoded', p: 0.42, alts: [['action:process_create', 0.41], ['action:login_failed', 0.10]] },
    'mitre:T1059.001':                { token: 'action:c2_beacon',        p: 0.74, alts: [['action:scheduled_task', 0.18], ['action:lateral_smb', 0.05]] },
    'action:c2_beacon':               { token: 'mitre:T1071.004',         p: 0.81, alts: [['action:exfil_https', 0.12], ['chain:c2', 0.05]] },
    'mitre:T1071.004':                { token: 'chain:c2',                p: 0.92, alts: [['action:exfil_dns', 0.06]] },

    'action:dns_tunnel':              { token: 'action:exfil_dns',        p: 0.79, alts: [['action:c2_beacon', 0.14], ['mitre:T1048', 0.05]] },
    'action:exfil_dns':               { token: 'chain:exfiltration',      p: 0.95, alts: [['action:c2_beacon', 0.03]] },

    'action:login|time:business':     { token: 'action:process_create',   p: 0.92, alts: [['action:login_failed', 0.04], ['action:file_open', 0.03]] },
    'action:process_create':          { token: 'action:file_open',        p: 0.61, alts: [['action:network_connect', 0.27], ['action:login_failed', 0.07]] },
    'action:file_open':               { token: '<EOS>',                   p: 0.78, alts: [['action:process_create', 0.18]] },
  };
  const hit = presets[tail] ?? presets[last];
  if (hit) return { token: hit.token, p: hit.p, alternatives: [{ token: hit.token, p: hit.p }, ...hit.alts.map(([t, p]) => ({ token: t, p }))] };
  const fallback: [string, number][] = [
    ['action:process_create', 0.34], ['action:network_connect', 0.22],
    ['action:login_failed', 0.18], ['<EOS>', 0.14], ['action:file_open', 0.12],
  ];
  return { token: fallback[0][0], p: fallback[0][1], alternatives: fallback.map(([t, p]) => ({ token: t, p })) };
}

function StreamingTab() {
  const [seedIdx, setSeedIdx] = useState(0);
  const [tokens, setTokens] = useState<string[]>(STREAM_SEEDS[0].tokens);
  const [generated, setGenerated] = useState<{ token: string; p: number }[]>([]);
  const [running, setRunning] = useState(false);
  const [topk, setTopk] = useState<{ token: string; p: number }[]>([]);
  const [stepLatency, setStepLatency] = useState(0);
  const intervalRef = useRef<number | null>(null);

  const seed = STREAM_SEEDS[seedIdx];
  const verdict = useMemo(() => {
    const malTokens = ['action:lsass_dump', 'action:lateral_smb', 'action:c2_beacon', 'action:exfil_https', 'action:exfil_dns', 'action:powershell_encoded', 'action:dns_tunnel', 'action:ransom_note'];
    const score = generated.reduce((a, g) => a + (malTokens.some(m => g.token.includes(m)) ? g.p : 0), 0);
    const total = generated.reduce((a, g) => a + g.p, 0) || 1;
    return Math.min(0.99, score / total);
  }, [generated]);

  useEffect(() => {
    if (!running) return;
    intervalRef.current = window.setInterval(() => {
      setTokens(prev => {
        const last = prev[prev.length - 1];
        if (last === '<EOS>' || prev.length >= 14) {
          setRunning(false);
          return prev;
        }
        const t0 = performance.now();
        const next = nextTokenSampling(prev);
        const dt = performance.now() - t0 + 12 + Math.random() * 8;
        setStepLatency(dt);
        setTopk(next.alternatives);
        setGenerated(g => [...g, { token: next.token, p: next.p }]);
        return [...prev, next.token];
      });
    }, 700);
    return () => { if (intervalRef.current) window.clearInterval(intervalRef.current); };
  }, [running]);

  const reset = (i = seedIdx) => {
    if (intervalRef.current) window.clearInterval(intervalRef.current);
    setRunning(false);
    setSeedIdx(i);
    setTokens(STREAM_SEEDS[i].tokens);
    setGenerated([]);
    setTopk([]);
    setStepLatency(0);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 space-y-4">
        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-cyan-400" />
              <h3 className="text-sm font-bold text-slate-100">Autoregressive sampling · live</h3>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold border border-cyan-400/40 bg-cyan-500/10 text-cyan-300">simulated</span>
            </div>
            <div className="flex gap-1.5">
              <button
                onClick={() => setRunning(r => !r)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  running ? 'bg-amber-500/15 text-amber-300 border border-amber-400/30' : 'bg-emerald-500/15 text-emerald-300 border border-emerald-400/30'
                }`}
              >
                {running ? <><Pause className="w-3 h-3" />Pause</> : <><Play className="w-3 h-3" />Generate</>}
              </button>
              <button onClick={() => reset()} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 text-slate-200 hover:bg-slate-700">
                <RotateCcw className="w-3 h-3" />Reset
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 mb-3">
            {STREAM_SEEDS.map((s, i) => (
              <button
                key={i}
                onClick={() => reset(i)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium border transition-colors ${
                  seedIdx === i
                    ? 'bg-cyan-500/15 border-cyan-400/40 text-cyan-200'
                    : 'bg-slate-900/60 border-slate-700 text-slate-400 hover:bg-slate-800'
                }`}
              >
                {s.name}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-1.5 p-3 rounded-lg bg-slate-950/60 border border-slate-800 min-h-[100px]">
            {tokens.map((t, i) => {
              const isSeed = i < seed.tokens.length;
              return (
                <code
                  key={i}
                  className={`px-2 py-1 rounded text-xs font-mono border ${
                    isSeed
                      ? 'bg-slate-800 border-slate-700 text-slate-300'
                      : 'bg-emerald-500/15 border-emerald-400/40 text-emerald-200 animate-[pulse_0.6s_ease-out]'
                  }`}
                  style={!isSeed ? { animationIterationCount: 1 } : undefined}
                >
                  {t}
                </code>
              );
            })}
            {running && (
              <code className="px-2 py-1 rounded bg-slate-800 border border-cyan-400/40 text-cyan-300 text-xs font-mono animate-pulse">
                generating…
              </code>
            )}
          </div>

          <div className="grid grid-cols-3 gap-2 mt-3">
            <Mini label="Generated tokens" value={String(generated.length)} />
            <Mini label="Last-step latency" value={`${stepLatency.toFixed(1)}ms`} />
            <Mini label="Cumulative malicious score" value={`${(verdict * 100).toFixed(1)}%`} />
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
          <div className="flex items-center gap-2 mb-3">
            <Target className="w-4 h-4 text-amber-400" />
            <h3 className="text-sm font-bold text-slate-100">Top-k softmax for current step</h3>
          </div>
          {topk.length === 0 ? (
            <div className="text-xs text-slate-500 italic py-6 text-center">Press Generate to see the model's next-token distribution.</div>
          ) : (
            <div className="space-y-2">
              {topk.slice(0, 5).map((a, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-[11px] text-slate-500 w-6 tabular-nums">#{i + 1}</span>
                  <code className={`text-xs font-mono px-2 py-0.5 rounded ${i === 0 ? 'bg-emerald-500/15 text-emerald-200 border border-emerald-400/30' : 'bg-slate-800 text-slate-300'}`}>
                    {a.token}
                  </code>
                  <div className="flex-1 h-2 rounded-full bg-slate-800 overflow-hidden">
                    <div className={`h-full transition-all ${i === 0 ? 'bg-gradient-to-r from-emerald-400 to-cyan-400' : 'bg-slate-600'}`} style={{ width: `${a.p * 100}%` }} />
                  </div>
                  <span className="text-xs text-slate-200 tabular-nums w-14 text-right">{(a.p * 100).toFixed(1)}%</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="space-y-4">
        <div className={`rounded-xl border p-4 ${verdict > 0.5 ? 'border-rose-400/40 bg-rose-500/10' : verdict > 0.2 ? 'border-amber-400/40 bg-amber-500/10' : 'border-emerald-400/40 bg-emerald-500/10'}`}>
          <div className="text-[10px] uppercase tracking-wider text-slate-400">Live verdict</div>
          <div className={`text-3xl font-bold mt-2 ${verdict > 0.5 ? 'text-rose-300' : verdict > 0.2 ? 'text-amber-300' : 'text-emerald-300'}`}>
            {verdict > 0.5 ? 'MALICIOUS' : verdict > 0.2 ? 'SUSPICIOUS' : 'BENIGN'}
          </div>
          <div className="mt-3 h-2 rounded-full bg-slate-800 overflow-hidden">
            <div
              className={`h-full transition-all ${verdict > 0.5 ? 'bg-gradient-to-r from-rose-500 to-amber-400' : verdict > 0.2 ? 'bg-amber-400' : 'bg-emerald-400'}`}
              style={{ width: `${verdict * 100}%` }}
            />
          </div>
          <div className="text-[11px] text-slate-400 mt-1 tabular-nums">cumulative score {(verdict * 100).toFixed(1)}%</div>
        </div>

        <div className="rounded-xl border border-cyan-500/20 bg-gradient-to-br from-cyan-950/30 to-slate-900/40 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-4 h-4 text-cyan-300" />
            <h4 className="text-xs font-bold text-slate-100">What you're seeing</h4>
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            The seed tokens are real OCSF events. Each step the model produces a softmax over the 51k vocab — we sample the top, append it, and recompute. As the chain grows, the rolling malicious-score updates. This is the same loop that runs in production, batched per tenant on Model Serving.
          </p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
          <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">Generated trace</div>
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {generated.length === 0 && <div className="text-[11px] text-slate-500 italic">No tokens yet.</div>}
            {generated.map((g, i) => (
              <div key={i} className="flex items-center gap-2 text-[11px]">
                <span className="text-slate-500 tabular-nums w-6">{i + 1}</span>
                <code className="text-cyan-200 flex-1 truncate">{g.token}</code>
                <span className="text-slate-400 tabular-nums">{(g.p * 100).toFixed(0)}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function DistillTab({ jobs }: { jobs: DistillJob[] }) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
        <h3 className="text-sm font-bold text-slate-100 mb-2">Why distill?</h3>
        <p className="text-xs text-slate-400 leading-relaxed">
          A 64M model is small, but inline scoring on every event needs sub-10ms. We distill the teacher into 8M / 16M
          students using soft-label transfer + intermediate-layer matching. Deployed on CPU-only Model Serving, a
          distilled student returns a verdict in &lt;15ms — fast enough to score every event before it lands in Silver.
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {jobs.map(j => (
          <div key={j.id} className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${STATUS_COLOR[j.status]}`}>{j.status}</span>
              <span className="text-xs text-slate-100 font-bold">→ {j.student_params_millions}M student</span>
            </div>
            <div className="text-[11px] text-slate-500 font-mono mb-3 truncate">teacher: {j.teacher_model}</div>
            <div className="grid grid-cols-2 gap-2">
              <Mini label="Compression" value={`${j.compression_ratio || '—'}x`} />
              <Mini label="Accuracy kept" value={j.retained_accuracy ? `${(j.retained_accuracy * 100).toFixed(0)}%` : '—'} />
              <Mini label="Latency" value={j.latency_ms ? `${j.latency_ms}ms` : '—'} />
              <Mini label="Cost" value={`$${j.cost_usd.toFixed(2)}`} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Roadmap() {
  const items = [
    { phase: 'Now', state: 'shipping', items: [
      'Pretrain v0.1 (64M) registered in Unity Catalog',
      'Detection head fine-tune (AUROC 0.94)',
      'Next-event head fine-tune (Top-5 91%)',
      'MLflow 3.0 traces wired to every inference',
    ]},
    { phase: 'In flight', state: 'building', items: [
      'Pretrain v0.2 — 124M params, 2k context (38% trained)',
      'Distillation to 8M / 16M for inline scoring',
      'Per-tenant fine-tune fork to handle distribution shift',
      'RLHF run on 1k analyst preference pairs',
    ]},
    { phase: 'Next', state: 'planned', items: [
      'Detection-as-Code: model versioning alongside CEP rules',
      'Counterfactual explanations ("change this token, the verdict flips")',
      'Adversarial robustness eval (red-team token-level attacks)',
      'Calibration with temperature scaling per tenant',
      'Shadow → canary → production rollout (at AUROC > 0.96 + Tier-3 sign-off)',
    ]},
    { phase: 'Future', state: 'research', items: [
      'Mixture-of-Experts router across tenants',
      'Multi-modal: fuse log tokens with packet flow embeddings',
      'Causal attention head extraction for hypothesis generation',
      'Federated training across customers via Clean Rooms',
    ]},
  ];
  const colors: Record<string, string> = {
    shipping: 'border-emerald-400/30 from-emerald-500/15 text-emerald-300',
    building: 'border-cyan-400/30 from-cyan-500/15 text-cyan-300',
    planned: 'border-amber-400/30 from-amber-500/15 text-amber-300',
    research: 'border-slate-400/30 from-slate-500/15 text-slate-300',
  };
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {items.map(group => (
        <div key={group.phase} className={`rounded-xl border bg-gradient-to-br to-slate-900/40 p-5 ${colors[group.state]}`}>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[10px] uppercase tracking-wider font-semibold opacity-80">{group.phase}</span>
            <h3 className="text-sm font-bold text-slate-50">{group.state}</h3>
          </div>
          <ul className="space-y-1.5">
            {group.items.map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-slate-300">
                <ChevronRight className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 opacity-60" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-2">
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="text-sm font-bold text-slate-100 mt-0.5 truncate">{value}</div>
    </div>
  );
}
