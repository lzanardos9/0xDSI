import { useEffect, useMemo, useState } from 'react';
import {
  Activity, AlertCircle, Binary, BookCheck, BrainCircuit, ChevronDown, Flame,
  GitBranch, History, Layers, Loader2, Network, Radar, RefreshCw, Save, Shield,
  ShieldAlert, Sigma, Sparkles, Target, Timer, TrendingUp, Users, Waves, Zap,
  CheckCircle2, XCircle,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

type Weights = Record<string, number>;
type Thresholds = Record<string, number>;
type CriticalityMap = Record<string, number>;

interface Profile {
  id: string;
  profile_name: string;
  description: string;
  is_active: boolean;
  weights: Weights;
  thresholds: Thresholds;
  criticality_multipliers: CriticalityMap;
  learning_config: Record<string, number | boolean>;
}

const SIGNAL_DEFS: Array<{
  key: string;
  label: string;
  icon: any;
  color: string;
  description: string;
  good: string;
  bad: string;
}> = [
  { key: 'graph_rarity', label: 'Graph Rarity', icon: Binary, color: 'cyan',
    description: 'How unusual this subgraph shape is vs. the entity baseline.',
    good: 'Never-before-seen node/edge pattern for this user/asset.',
    bad: 'Common shape seen thousands of times daily.' },
  { key: 'behavioral_anomaly', label: 'Behavioral Anomaly', icon: Activity, color: 'emerald',
    description: 'KL divergence on login, process tree, geolocation, API usage.',
    good: 'Drastic deviation from the 30-day behavioral profile.',
    bad: 'Matches the user\'s usual weekday behavior.' },
  { key: 'temporal_anomaly', label: 'Temporal Anomaly', icon: Timer, color: 'blue',
    description: 'Compressed timing vs. the entity\'s hourly baseline distribution.',
    good: 'Bursty 3am activity on a weekend.',
    bad: 'Steady trickle during normal business hours.' },
  { key: 'event_rarity', label: 'Event Rarity', icon: Sparkles, color: 'amber',
    description: 'Frequency of this specific event type for this entity.',
    good: 'First time this user ever touched this API.',
    bad: 'Fired dozens of times per day across the fleet.' },
  { key: 'entity_criticality', label: 'Entity Criticality', icon: Shield, color: 'red',
    description: 'Business importance of the user/asset in the graph.',
    good: 'Domain controller, crown-jewel database, C-suite identity.',
    bad: 'Guest WiFi device, lab sandbox.' },
  { key: 'graph_fanout', label: 'Graph Fanout / Blast Radius', icon: Network, color: 'orange',
    description: 'How many downstream entities this pattern can reach.',
    good: 'Touches 40+ hosts via lateral movement.',
    bad: 'Contained to a single host.' },
  { key: 'evidence_count', label: 'Evidence Chain Depth', icon: Layers, color: 'teal',
    description: 'Corroborating event chain length across sources.',
    good: 'EDR + network + auth + email all agree.',
    bad: 'Single weak signal from one sensor.' },
  { key: 'intent_confidence', label: 'Intent / Kill-Chain Stage', icon: Target, color: 'red',
    description: 'Confidence that the pattern advances a recognized kill-chain stage.',
    good: 'Clear Discovery → Lateral → Collection → Exfil progression.',
    bad: 'Single recon-only event with no follow-through.' },
  { key: 'deception_signal', label: 'Deception Triggered', icon: Radar, color: 'orange',
    description: 'Honeypot, honeytoken, or decoy credential interaction.',
    good: 'Attacker touched a canary token - high-fidelity tripwire.',
    bad: 'No deception signals fired.' },
  { key: 'base_confidence', label: 'Rule Base Confidence', icon: BookCheck, color: 'blue',
    description: 'The correlation rule\'s own static confidence score.',
    good: 'Vendor-curated rule with 95% historical precision.',
    bad: 'Experimental rule still in testing.' },
  { key: 'vector_similarity', label: 'Vector Similarity to Known TTPs', icon: Sigma, color: 'cyan',
    description: 'Cosine similarity of embeddings to curated attack patterns.',
    good: '>0.92 match to APT41 playbook embedding.',
    bad: 'No meaningful similarity to any known TTP.' },
  { key: 'mitre_coverage', label: 'MITRE ATT&CK Coverage', icon: GitBranch, color: 'emerald',
    description: 'Breadth of distinct MITRE techniques present in the graph.',
    good: 'T1566 + T1059 + T1003 + T1021 + T1041 all represented.',
    bad: 'Single technique in isolation.' },
  { key: 'kill_chain_completeness', label: 'Kill-Chain Completeness', icon: Flame, color: 'red',
    description: 'Fraction of kill-chain stages represented end-to-end.',
    good: '6/7 Lockheed stages observed sequentially.',
    bad: 'Only reconnaissance, no weaponization or delivery.' },
  { key: 'threat_intel_hits', label: 'Threat Intel Hits', icon: ShieldAlert, color: 'amber',
    description: 'Count of IOCs in the graph that match active threat feeds.',
    good: 'Three IPs on three different high-confidence feeds.',
    bad: 'Zero IOCs match any feed.' },
  { key: 'asset_blast_radius', label: 'Asset Blast Radius', icon: Waves, color: 'teal',
    description: 'Criticality-weighted downstream reachability via the asset graph.',
    good: 'One hop from a domain controller.',
    bad: 'Isolated DMZ host with no trust edges.' },
  { key: 'negative_correlation_bonus', label: 'Negative Correlation Bonus', icon: XCircle, color: 'orange',
    description: 'Expected-but-missing co-events (MFA, firewall allow, normal parent proc).',
    good: 'Auth succeeded WITHOUT the expected MFA challenge log.',
    bad: 'All expected benign co-events are present.' },
  { key: 'historical_fp_penalty', label: 'Historical FP Penalty', icon: History, color: 'slate',
    description: 'Down-weight applied if this pattern has a bad FP track record.',
    good: 'Pattern has never been dismissed by analysts.',
    bad: '40%+ of prior matches were closed as false-positive.' },
  { key: 'analyst_feedback_bias', label: 'Analyst Feedback Bias', icon: Users, color: 'blue',
    description: 'ALHF reward signal from verified TP/FP verdicts.',
    good: 'Analysts have confirmed 8/10 similar patterns as true-positive.',
    bad: 'Analysts have rejected 7/10 similar patterns.' },
];

const COLOR_RING: Record<string, string> = {
  cyan:    'from-cyan-500/30 to-cyan-500/5 border-cyan-500/40 text-cyan-300',
  emerald: 'from-emerald-500/30 to-emerald-500/5 border-emerald-500/40 text-emerald-300',
  blue:    'from-blue-500/30 to-blue-500/5 border-blue-500/40 text-blue-300',
  amber:   'from-amber-500/30 to-amber-500/5 border-amber-500/40 text-amber-300',
  red:     'from-red-500/30 to-red-500/5 border-red-500/40 text-red-300',
  orange:  'from-orange-500/30 to-orange-500/5 border-orange-500/40 text-orange-300',
  teal:    'from-teal-500/30 to-teal-500/5 border-teal-500/40 text-teal-300',
  slate:   'from-slate-500/30 to-slate-500/5 border-slate-500/40 text-slate-300',
};

const THRESHOLD_DEFS: Array<{ key: string; label: string; min: number; max: number; step: number; suffix?: string; help: string }> = [
  { key: 'activation', label: 'Activation Threshold', min: 0, max: 1, step: 0.01, help: 'Minimum composite score for a rule to activate.' },
  { key: 'promotion', label: 'Promotion To Detection', min: 0, max: 1, step: 0.01, help: 'Score needed to promote a match to a live detection.' },
  { key: 'suppression', label: 'Suppression Floor', min: 0, max: 1, step: 0.01, help: 'Anything below this is silently dropped.' },
  { key: 'critical_priority', label: 'Critical Priority Cutoff', min: 0, max: 15, step: 0.1, help: 'final_priority at or above this = CRITICAL bucket.' },
  { key: 'very_high_priority', label: 'Very High Cutoff', min: 0, max: 15, step: 0.1, help: 'final_priority at or above this = VERY HIGH.' },
  { key: 'high_priority', label: 'High Cutoff', min: 0, max: 15, step: 0.1, help: 'final_priority at or above this = HIGH.' },
  { key: 'medium_priority', label: 'Medium Cutoff', min: 0, max: 15, step: 0.1, help: 'final_priority at or above this = MEDIUM.' },
  { key: 'fp_rate_ceiling', label: 'False-Positive Ceiling', min: 0, max: 1, step: 0.01, help: 'ALHF demotes rules whose FP rate exceeds this.' },
  { key: 'negative_feedback_trigger', label: 'Negative Feedback Trigger', min: 0, max: 1, step: 0.01, help: 'Analyst-rejection rate that triggers re-tuning.' },
  { key: 'min_samples_for_adapt', label: 'Min Samples Before Adapting', min: 0, max: 200, step: 1, help: 'ALHF will not act until it has this many graded matches.' },
];

const CRIT_TIERS: Array<{ key: string; label: string; color: string }> = [
  { key: 'very_high', label: 'Very High', color: 'red' },
  { key: 'high', label: 'High', color: 'orange' },
  { key: 'medium', label: 'Medium', color: 'amber' },
  { key: 'low', label: 'Low', color: 'blue' },
  { key: 'very_low', label: 'Very Low', color: 'slate' },
];

type SimPattern = {
  id: string;
  name: string;
  description: string;
  signals: Record<string, number>;
  asset_tier: keyof CriticalityMap;
  severity_score: number;
  verdict: 'good' | 'bad' | 'ambiguous';
};

const SIM_PATTERNS: SimPattern[] = [
  {
    id: 'apt-lateral',
    name: 'APT-Style Lateral Movement',
    description: 'Kerberoasting on a domain controller after phished beachhead, honeytoken touched, 5 hosts reached.',
    signals: {
      graph_rarity: 0.95, behavioral_anomaly: 0.90, temporal_anomaly: 0.85, event_rarity: 0.80,
      entity_criticality: 0.95, graph_fanout: 0.85, evidence_count: 0.90, intent_confidence: 0.92,
      deception_signal: 1.0, base_confidence: 0.88, vector_similarity: 0.93, mitre_coverage: 0.88,
      kill_chain_completeness: 0.82, threat_intel_hits: 0.75, asset_blast_radius: 0.90,
      negative_correlation_bonus: 0.85, historical_fp_penalty: 0.10, analyst_feedback_bias: 0.85,
    },
    asset_tier: 'very_high', severity_score: 9, verdict: 'good',
  },
  {
    id: 'noisy-scanner',
    name: 'Noisy Internal Scanner (FP)',
    description: 'Approved vulnerability scanner hitting 200 hosts at 2am. Well-known source, all expected co-events present.',
    signals: {
      graph_rarity: 0.10, behavioral_anomaly: 0.15, temporal_anomaly: 0.70, event_rarity: 0.05,
      entity_criticality: 0.20, graph_fanout: 0.95, evidence_count: 0.30, intent_confidence: 0.10,
      deception_signal: 0.0, base_confidence: 0.40, vector_similarity: 0.15, mitre_coverage: 0.20,
      kill_chain_completeness: 0.10, threat_intel_hits: 0.0, asset_blast_radius: 0.30,
      negative_correlation_bonus: 0.0, historical_fp_penalty: 0.85, analyst_feedback_bias: 0.15,
    },
    asset_tier: 'low', severity_score: 3, verdict: 'bad',
  },
  {
    id: 'insider-exfil',
    name: 'Insider Data Exfiltration',
    description: 'Finance user mass-downloads HR files off-hours, forwards externally. No MFA on sensitive share access.',
    signals: {
      graph_rarity: 0.78, behavioral_anomaly: 0.85, temporal_anomaly: 0.80, event_rarity: 0.72,
      entity_criticality: 0.80, graph_fanout: 0.40, evidence_count: 0.75, intent_confidence: 0.70,
      deception_signal: 0.0, base_confidence: 0.75, vector_similarity: 0.60, mitre_coverage: 0.55,
      kill_chain_completeness: 0.50, threat_intel_hits: 0.10, asset_blast_radius: 0.55,
      negative_correlation_bonus: 0.80, historical_fp_penalty: 0.25, analyst_feedback_bias: 0.70,
    },
    asset_tier: 'high', severity_score: 7, verdict: 'good',
  },
  {
    id: 'ambiguous-rdp',
    name: 'After-Hours RDP From New Geo',
    description: 'Admin logs in from a new country at midnight but passes MFA and uses a known workstation fingerprint.',
    signals: {
      graph_rarity: 0.55, behavioral_anomaly: 0.60, temporal_anomaly: 0.75, event_rarity: 0.40,
      entity_criticality: 0.70, graph_fanout: 0.25, evidence_count: 0.35, intent_confidence: 0.30,
      deception_signal: 0.0, base_confidence: 0.55, vector_similarity: 0.30, mitre_coverage: 0.25,
      kill_chain_completeness: 0.20, threat_intel_hits: 0.0, asset_blast_radius: 0.40,
      negative_correlation_bonus: 0.10, historical_fp_penalty: 0.40, analyst_feedback_bias: 0.45,
    },
    asset_tier: 'medium', severity_score: 5, verdict: 'ambiguous',
  },
];

export default function GraphScoringTab() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [working, setWorking] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);
  const [pickedPattern, setPickedPattern] = useState<string>(SIM_PATTERNS[0].id);
  const [showProfilePicker, setShowProfilePicker] = useState(false);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('graph_pattern_scoring_profiles')
      .select('*')
      .order('is_active', { ascending: false })
      .order('profile_name', { ascending: true });
    if (!error && data) {
      setProfiles(data as Profile[]);
      const active = data.find((p: Profile) => p.is_active) || data[0];
      if (active) {
        setActiveId(active.id);
        setWorking(clone(active as Profile));
      }
    }
    setLoading(false);
  };

  const clone = (p: Profile): Profile => JSON.parse(JSON.stringify(p));

  const selectProfile = (id: string) => {
    const p = profiles.find(pp => pp.id === id);
    if (!p) return;
    setActiveId(id);
    setWorking(clone(p));
    setShowProfilePicker(false);
  };

  const weightSum = useMemo(() => {
    if (!working) return 0;
    return Object.values(working.weights).reduce((a, b) => a + (Number(b) || 0), 0);
  }, [working]);

  const pattern = useMemo(() => SIM_PATTERNS.find(p => p.id === pickedPattern) || SIM_PATTERNS[0], [pickedPattern]);

  const simulation = useMemo(() => {
    if (!working) return null;
    const { weights, thresholds, criticality_multipliers } = working;
    const contributions = SIGNAL_DEFS.map(def => {
      const raw = pattern.signals[def.key] ?? 0;
      const w = weights[def.key] ?? 0;
      const signed = def.key === 'historical_fp_penalty' ? -raw : raw;
      return {
        key: def.key, label: def.label, color: def.color,
        raw, weight: w, contribution: signed * w,
      };
    });
    const composite = contributions.reduce((a, c) => a + c.contribution, 0);
    const compositeClamped = Math.max(0, Math.min(1, composite));
    const activates = composite >= (thresholds.activation ?? 0.7);
    const promotes = composite >= (thresholds.promotion ?? 0.8);
    const suppressed = composite < (thresholds.suppression ?? 0.3);
    const critMult = criticality_multipliers[pattern.asset_tier] ?? 1.0;
    const threatWeight = 1 + (pattern.severity_score * 3) / 100;
    const finalPriority = pattern.severity_score * compositeClamped * threatWeight * critMult;
    const bucket =
      finalPriority >= (thresholds.critical_priority ?? 9) ? 'CRITICAL' :
      finalPriority >= (thresholds.very_high_priority ?? 7) ? 'VERY HIGH' :
      finalPriority >= (thresholds.high_priority ?? 5) ? 'HIGH' :
      finalPriority >= (thresholds.medium_priority ?? 3) ? 'MEDIUM' : 'LOW';
    return { contributions, composite, compositeClamped, activates, promotes, suppressed, critMult, threatWeight, finalPriority, bucket };
  }, [working, pattern]);

  const setWeight = (key: string, v: number) => {
    if (!working) return;
    setWorking({ ...working, weights: { ...working.weights, [key]: v } });
  };
  const setThreshold = (key: string, v: number) => {
    if (!working) return;
    setWorking({ ...working, thresholds: { ...working.thresholds, [key]: v } });
  };
  const setCrit = (key: string, v: number) => {
    if (!working) return;
    setWorking({ ...working, criticality_multipliers: { ...working.criticality_multipliers, [key]: v } });
  };
  const normalizeWeights = () => {
    if (!working) return;
    const sum = Object.values(working.weights).reduce((a, b) => a + (Number(b) || 0), 0);
    if (sum === 0) return;
    const next: Weights = {};
    for (const [k, v] of Object.entries(working.weights)) next[k] = Math.round(((Number(v) || 0) / sum) * 1000) / 1000;
    setWorking({ ...working, weights: next });
  };
  const resetToSaved = () => {
    const original = profiles.find(p => p.id === activeId);
    if (original) setWorking(clone(original));
  };

  const save = async () => {
    if (!working) return;
    setSaving(true);
    const { error } = await supabase
      .from('graph_pattern_scoring_profiles')
      .update({
        weights: working.weights,
        thresholds: working.thresholds,
        criticality_multipliers: working.criticality_multipliers,
        learning_config: working.learning_config,
        description: working.description,
        updated_at: new Date().toISOString(),
      })
      .eq('id', working.id);
    setSaving(false);
    if (error) { setToast({ kind: 'err', msg: error.message }); }
    else { setToast({ kind: 'ok', msg: `Profile "${working.profile_name}" saved` }); await load(); }
    setTimeout(() => setToast(null), 3000);
  };

  const activate = async () => {
    if (!working) return;
    setSaving(true);
    await supabase.from('graph_pattern_scoring_profiles').update({ is_active: false }).neq('id', working.id);
    const { error } = await supabase.from('graph_pattern_scoring_profiles').update({ is_active: true }).eq('id', working.id);
    setSaving(false);
    if (error) { setToast({ kind: 'err', msg: error.message }); }
    else { setToast({ kind: 'ok', msg: `"${working.profile_name}" is now the active profile` }); await load(); }
    setTimeout(() => setToast(null), 3000);
  };

  if (loading || !working) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-400">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading graph scoring profiles...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Hero formula banner */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-gradient-to-br from-[#060a15] via-[#0a1020] to-[#060a15] p-6">
        <div className="absolute inset-0 opacity-40 pointer-events-none" style={{
          backgroundImage: 'radial-gradient(circle at 20% 20%, rgba(16,185,129,0.12), transparent 45%), radial-gradient(circle at 80% 60%, rgba(6,182,212,0.10), transparent 50%)'
        }} />
        <div className="relative">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
                  <BrainCircuit className="w-5 h-5 text-emerald-300" />
                </div>
                <h3 className="text-lg font-semibold text-white">Graph Pattern Scoring Formula</h3>
                <span className="px-2 py-0.5 rounded-full text-[9px] font-mono font-bold tracking-wider bg-emerald-500/10 border border-emerald-500/40 text-emerald-300">
                  18 SIGNALS &middot; TUNABLE
                </span>
              </div>
              <p className="text-sm text-slate-400 max-w-3xl leading-relaxed">
                The SOC judges a detected graph "good" (malicious, escalate) or "bad" (noise, suppress) by combining 18
                weighted signals into a composite confidence, then multiplying by asset criticality and kill-chain intent.
                Every weight, threshold, and multiplier below is live-editable.
              </p>
            </div>
            <div className="relative">
              <button
                onClick={() => setShowProfilePicker(o => !o)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800/70 border border-slate-700 hover:border-emerald-500/50 text-sm text-white"
              >
                <Layers className="w-4 h-4 text-emerald-300" />
                <span className="font-semibold">{working.profile_name}</span>
                {working.is_active && <span className="text-[9px] font-bold tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">ACTIVE</span>}
                <ChevronDown className="w-4 h-4 text-slate-400" />
              </button>
              {showProfilePicker && (
                <div className="absolute right-0 mt-2 w-72 bg-[#0b0f1e] border border-slate-700 rounded-xl shadow-2xl z-20 overflow-hidden">
                  {profiles.map(p => (
                    <button
                      key={p.id}
                      onClick={() => selectProfile(p.id)}
                      className={`w-full text-left px-3 py-2.5 hover:bg-slate-800 border-b border-slate-800/60 last:border-0 ${activeId === p.id ? 'bg-slate-800/70' : ''}`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-white">{p.profile_name}</span>
                        {p.is_active && <span className="text-[9px] font-bold tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">ACTIVE</span>}
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">{p.description}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="rounded-xl bg-[#020611] border border-slate-800/70 p-4 font-mono text-[13px] leading-relaxed overflow-x-auto">
            <div className="text-slate-500 mb-2"># Composite confidence (C) is a weighted sum of 18 signals</div>
            <div className="text-emerald-300">
              C &nbsp;=&nbsp;
              {SIGNAL_DEFS.map((d, i) => (
                <span key={d.key}>
                  <span className="text-amber-300">w<sub>{i + 1}</sub></span>
                  &middot;
                  <span className="text-cyan-300">{d.key.replace(/_/g, '')}</span>
                  {i < SIGNAL_DEFS.length - 1 ? <span className="text-slate-500"> + </span> : null}
                </span>
              ))}
            </div>
            <div className="text-slate-500 mt-3 mb-2"># Final priority (P) applies severity, threat weight, asset criticality</div>
            <div className="text-emerald-300">
              P &nbsp;=&nbsp;
              <span className="text-cyan-300">severity</span>
              <span className="text-slate-500"> &times; </span>
              <span className="text-cyan-300">clamp(C, 0, 1)</span>
              <span className="text-slate-500"> &times; </span>
              <span className="text-cyan-300">(1 + severity&middot;0.03)</span>
              <span className="text-slate-500"> &times; </span>
              <span className="text-cyan-300">criticality<sub>tier</sub></span>
            </div>
            <div className="text-slate-500 mt-3 mb-2"># Bucket mapping</div>
            <div className="text-slate-300">
              P &ge; <span className="text-red-300">{working.thresholds.critical_priority}</span> &rArr; CRITICAL &nbsp;&middot;&nbsp;
              &ge; <span className="text-orange-300">{working.thresholds.very_high_priority}</span> &rArr; VERY HIGH &nbsp;&middot;&nbsp;
              &ge; <span className="text-amber-300">{working.thresholds.high_priority}</span> &rArr; HIGH &nbsp;&middot;&nbsp;
              &ge; <span className="text-blue-300">{working.thresholds.medium_priority}</span> &rArr; MEDIUM
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button onClick={save} disabled={saving} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-200 text-sm font-semibold">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save Profile
            </button>
            <button onClick={activate} disabled={saving || working.is_active} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/40 text-cyan-200 text-sm font-semibold disabled:opacity-50">
              <Zap className="w-4 h-4" /> {working.is_active ? 'Already Active' : 'Set As Active'}
            </button>
            <button onClick={normalizeWeights} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-sm">
              <Sigma className="w-4 h-4" /> Normalize To 1.0
            </button>
            <button onClick={resetToSaved} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-sm">
              <RefreshCw className="w-4 h-4" /> Revert
            </button>
            <div className="ml-auto text-xs text-slate-400">
              Weight sum: <span className={`font-mono font-bold ${Math.abs(weightSum - 1) < 0.02 ? 'text-emerald-300' : 'text-amber-300'}`}>{weightSum.toFixed(3)}</span>
              {Math.abs(weightSum - 1) > 0.02 && <span className="ml-2 text-amber-400">(should sum to 1.0)</span>}
            </div>
          </div>
        </div>
      </div>

      {/* Live simulator */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6">
        <div className="flex items-start justify-between mb-5">
          <div>
            <h4 className="text-white font-semibold flex items-center gap-2">
              <Activity className="w-5 h-5 text-cyan-400" />
              Live Graph Verdict Simulator
            </h4>
            <p className="text-xs text-slate-500 mt-1">Pick a sample detected graph and watch the formula decide good vs. bad in real-time as you tune weights.</p>
          </div>
          <div className="flex gap-1.5">
            {SIM_PATTERNS.map(p => (
              <button
                key={p.id}
                onClick={() => setPickedPattern(p.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
                  pickedPattern === p.id ? 'bg-cyan-500/20 border-cyan-400/60 text-cyan-200' : 'bg-slate-900/50 border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12 lg:col-span-4 space-y-3">
            <div className="rounded-xl border border-slate-800 bg-[#060a15] p-4">
              <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500 font-semibold mb-1.5">Pattern Card</div>
              <div className="text-sm font-bold text-white mb-1">{pattern.name}</div>
              <p className="text-xs text-slate-400 leading-relaxed">{pattern.description}</p>
              <div className="mt-3 flex gap-1.5 flex-wrap">
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-slate-800 text-slate-300 border border-slate-700">sev {pattern.severity_score}/10</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-slate-800 text-slate-300 border border-slate-700">asset: {pattern.asset_tier.replace('_', ' ')}</span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono border ${
                  pattern.verdict === 'good' ? 'bg-red-500/10 border-red-500/40 text-red-300' :
                  pattern.verdict === 'bad' ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300' :
                  'bg-amber-500/10 border-amber-500/40 text-amber-300'
                }`}>ground truth: {pattern.verdict}</span>
              </div>
            </div>

            {simulation && (
              <div className="rounded-xl border border-slate-800 bg-[#060a15] p-4 space-y-3">
                <MetricLine label="Composite Confidence (C)" value={simulation.composite.toFixed(3)} bar={simulation.compositeClamped} color="cyan" />
                <MetricLine label="Severity" value={pattern.severity_score.toFixed(1)} bar={pattern.severity_score / 10} color="amber" />
                <MetricLine label="Threat Weight" value={simulation.threatWeight.toFixed(2)} bar={simulation.threatWeight / 1.5} color="orange" />
                <MetricLine label="Criticality Multiplier" value={simulation.critMult.toFixed(2) + 'x'} bar={Math.min(1, simulation.critMult / 2)} color="red" />

                <div className="pt-3 mt-2 border-t border-slate-800/70 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase tracking-[0.16em] text-slate-500 font-semibold">Final Priority</span>
                    <span className={`text-2xl font-bold font-mono ${
                      simulation.bucket === 'CRITICAL' ? 'text-red-300' :
                      simulation.bucket === 'VERY HIGH' ? 'text-orange-300' :
                      simulation.bucket === 'HIGH' ? 'text-amber-300' :
                      simulation.bucket === 'MEDIUM' ? 'text-blue-300' : 'text-slate-400'
                    }`}>{simulation.finalPriority.toFixed(2)}</span>
                  </div>
                  <div className={`rounded-lg border px-3 py-2 flex items-center justify-between ${
                    simulation.suppressed ? 'bg-slate-500/10 border-slate-500/40 text-slate-300' :
                    simulation.promotes ? 'bg-red-500/10 border-red-500/40 text-red-300' :
                    simulation.activates ? 'bg-amber-500/10 border-amber-500/40 text-amber-300' :
                    'bg-slate-800 border-slate-700 text-slate-400'
                  }`}>
                    <div className="text-xs font-bold tracking-wide">
                      {simulation.suppressed ? 'SUPPRESSED' : simulation.promotes ? 'PROMOTE TO DETECTION' : simulation.activates ? 'RULE ACTIVATED' : 'BELOW ACTIVATION'}
                    </div>
                    <div className="text-[10px] font-mono">{simulation.bucket}</div>
                  </div>
                  <VerdictAccuracyChip truth={pattern.verdict} promoted={simulation.promotes} suppressed={simulation.suppressed} />
                </div>
              </div>
            )}
          </div>

          <div className="col-span-12 lg:col-span-8">
            <div className="rounded-xl border border-slate-800 bg-[#060a15] p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500 font-semibold">Signal Contributions</div>
                <div className="text-[10px] font-mono text-slate-500">raw &times; weight = contribution</div>
              </div>
              <div className="space-y-1">
                {simulation?.contributions.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution)).map(c => {
                  const def = SIGNAL_DEFS.find(d => d.key === c.key)!;
                  const Icon = def.icon;
                  const pct = Math.min(1, Math.abs(c.contribution) / 0.2);
                  const negative = c.contribution < 0;
                  return (
                    <div key={c.key} className="flex items-center gap-3 px-2 py-1.5 rounded hover:bg-slate-900/50">
                      <Icon className={`w-3.5 h-3.5 shrink-0 ${COLOR_RING[def.color]?.split(' ').find(t => t.startsWith('text-')) || 'text-slate-300'}`} />
                      <div className="text-[11px] text-slate-300 font-medium w-56 truncate">{def.label}</div>
                      <div className="flex-1 h-1.5 bg-slate-900 rounded overflow-hidden relative">
                        <div className={`absolute inset-y-0 ${negative ? 'right-1/2 bg-red-500/60' : 'left-0 bg-emerald-500/60'}`} style={{ width: `${pct * 50}%` }} />
                      </div>
                      <div className="text-[10px] font-mono text-slate-500 w-14 text-right">{c.raw.toFixed(2)}</div>
                      <div className="text-[10px] font-mono text-slate-500 w-14 text-right">&times;{c.weight.toFixed(2)}</div>
                      <div className={`text-[11px] font-mono font-bold w-16 text-right ${negative ? 'text-red-300' : 'text-emerald-300'}`}>
                        {negative ? '-' : '+'}{Math.abs(c.contribution).toFixed(3)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Signal weight sliders */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h4 className="text-white font-semibold flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-emerald-400" />
              Signal Weights
            </h4>
            <p className="text-xs text-slate-500 mt-1">Each signal contributes to the composite. Sum should land near 1.0 for balanced scoring.</p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {SIGNAL_DEFS.map(def => (
            <WeightRow
              key={def.key}
              def={def}
              value={working.weights[def.key] ?? 0}
              onChange={(v) => setWeight(def.key, v)}
            />
          ))}
        </div>
      </div>

      {/* Thresholds + criticality + learning */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
          <h4 className="text-white font-semibold flex items-center gap-2 mb-3">
            <AlertCircle className="w-4 h-4 text-amber-400" /> Decision Thresholds
          </h4>
          <div className="space-y-2.5">
            {THRESHOLD_DEFS.map(t => (
              <ThresholdRow
                key={t.key}
                def={t}
                value={Number(working.thresholds[t.key] ?? 0)}
                onChange={(v) => setThreshold(t.key, v)}
              />
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
          <h4 className="text-white font-semibold flex items-center gap-2 mb-3">
            <Shield className="w-4 h-4 text-red-400" /> Asset Criticality Multipliers
          </h4>
          <p className="text-[11px] text-slate-500 mb-3">Each tier multiplies the final priority. Keep a meaningful gap between tiers.</p>
          <div className="space-y-2.5">
            {CRIT_TIERS.map(t => (
              <CritRow
                key={t.key}
                def={t}
                value={Number(working.criticality_multipliers[t.key] ?? 1)}
                onChange={(v) => setCrit(t.key, v)}
              />
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
          <h4 className="text-white font-semibold flex items-center gap-2 mb-3">
            <BrainCircuit className="w-4 h-4 text-cyan-400" /> ALHF Learning Loop
          </h4>
          <p className="text-[11px] text-slate-500 mb-3">Adaptive Learning with Human Feedback continuously re-tunes weights based on analyst verdicts.</p>
          <div className="space-y-3 text-xs">
            <LearningRow
              label="ALHF Enabled"
              type="toggle"
              value={Boolean(working.learning_config.alhf_enabled)}
              onChange={(v) => setWorking({ ...working, learning_config: { ...working.learning_config, alhf_enabled: v as boolean } })}
            />
            <LearningRow
              label="Learning Rate"
              type="slider"
              min={0} max={0.2} step={0.01}
              value={Number(working.learning_config.learning_rate ?? 0.05)}
              onChange={(v) => setWorking({ ...working, learning_config: { ...working.learning_config, learning_rate: v as number } })}
            />
            <LearningRow
              label="Auto-demote after FP streak"
              type="slider"
              min={1} max={20} step={1}
              value={Number(working.learning_config.auto_demote_after_fp_streak ?? 5)}
              onChange={(v) => setWorking({ ...working, learning_config: { ...working.learning_config, auto_demote_after_fp_streak: v as number } })}
            />
            <LearningRow
              label="Memory half-life (days)"
              type="slider"
              min={1} max={60} step={1}
              value={Number(working.learning_config.decay_half_life_days ?? 14)}
              onChange={(v) => setWorking({ ...working, learning_config: { ...working.learning_config, decay_half_life_days: v as number } })}
            />
            <LearningRow
              label="Human verdict weight"
              type="slider"
              min={0} max={1} step={0.05}
              value={Number(working.learning_config.human_verdict_weight ?? 0.3)}
              onChange={(v) => setWorking({ ...working, learning_config: { ...working.learning_config, human_verdict_weight: v as number } })}
            />
          </div>
        </div>
      </div>

      {toast && (
        <div className={`fixed bottom-6 right-6 px-4 py-2.5 rounded-lg border text-sm font-semibold shadow-xl z-50 ${
          toast.kind === 'ok' ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200' : 'bg-red-500/15 border-red-500/40 text-red-200'
        }`}>
          {toast.kind === 'ok' ? <CheckCircle2 className="w-4 h-4 inline mr-1.5" /> : <XCircle className="w-4 h-4 inline mr-1.5" />}
          {toast.msg}
        </div>
      )}
    </div>
  );
}

function WeightRow({ def, value, onChange }: { def: typeof SIGNAL_DEFS[number]; value: number; onChange: (v: number) => void }) {
  const Icon = def.icon;
  const [hover, setHover] = useState(false);
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className={`relative rounded-xl border bg-[#060a15] p-3 transition ${COLOR_RING[def.color] || 'border-slate-800'}`}
    >
      <div className="flex items-center gap-2 mb-2">
        <div className={`p-1.5 rounded-lg bg-gradient-to-br ${COLOR_RING[def.color] || 'from-slate-800 to-slate-900'}`}>
          <Icon className="w-3.5 h-3.5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[12px] font-semibold text-white truncate">{def.label}</div>
          <div className="text-[10px] text-slate-500 truncate">{def.description}</div>
        </div>
        <div className="text-xs font-mono font-bold text-white tabular-nums">{value.toFixed(2)}</div>
      </div>
      <input
        type="range" min={0} max={0.3} step={0.005} value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full accent-emerald-400"
      />
      {hover && (
        <div className="absolute top-full left-0 right-0 mt-1 z-10 rounded-lg bg-[#020611] border border-slate-700 p-3 shadow-xl text-[11px] space-y-1.5">
          <div><span className="text-emerald-400 font-bold">GOOD &rarr;</span> <span className="text-slate-300">{def.good}</span></div>
          <div><span className="text-red-400 font-bold">BAD &rarr;</span> <span className="text-slate-400">{def.bad}</span></div>
        </div>
      )}
    </div>
  );
}

function ThresholdRow({ def, value, onChange }: { def: typeof THRESHOLD_DEFS[number]; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <div className="flex justify-between items-center mb-1">
        <span className="text-xs text-slate-300 font-medium">{def.label}</span>
        <span className="text-xs font-mono font-bold text-white tabular-nums">{def.step < 1 ? value.toFixed(2) : Math.round(value)}{def.suffix || ''}</span>
      </div>
      <input type="range" min={def.min} max={def.max} step={def.step} value={value} onChange={e => onChange(Number(e.target.value))} className="w-full accent-amber-400" />
      <div className="text-[10px] text-slate-500 mt-0.5">{def.help}</div>
    </div>
  );
}

function CritRow({ def, value, onChange }: { def: typeof CRIT_TIERS[number]; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <div className="flex justify-between items-center mb-1">
        <div className="flex items-center gap-2">
          <span className={`inline-block w-2 h-2 rounded-full bg-${def.color}-400`} />
          <span className="text-xs text-slate-300 font-medium">{def.label}</span>
        </div>
        <span className="text-xs font-mono font-bold text-white tabular-nums">{value.toFixed(2)}x</span>
      </div>
      <input type="range" min={0.2} max={3.0} step={0.05} value={value} onChange={e => onChange(Number(e.target.value))} className="w-full accent-red-400" />
    </div>
  );
}

function LearningRow({ label, type, value, onChange, min, max, step }: {
  label: string; type: 'toggle' | 'slider'; value: boolean | number; onChange: (v: boolean | number) => void;
  min?: number; max?: number; step?: number;
}) {
  if (type === 'toggle') {
    return (
      <div className="flex justify-between items-center">
        <span className="text-slate-300 font-medium">{label}</span>
        <button
          onClick={() => onChange(!value)}
          className={`relative w-10 h-5 rounded-full transition ${value ? 'bg-emerald-500/70' : 'bg-slate-700'}`}
        >
          <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition ${value ? 'left-5' : 'left-0.5'}`} />
        </button>
      </div>
    );
  }
  return (
    <div>
      <div className="flex justify-between items-center mb-1">
        <span className="text-slate-300 font-medium">{label}</span>
        <span className="font-mono font-bold text-white tabular-nums">
          {typeof value === 'number' ? ((step || 0.01) < 1 ? value.toFixed(2) : Math.round(value)) : ''}
        </span>
      </div>
      <input type="range" min={min} max={max} step={step} value={Number(value)} onChange={e => onChange(Number(e.target.value))} className="w-full accent-cyan-400" />
    </div>
  );
}

function MetricLine({ label, value, bar, color }: { label: string; value: string; bar: number; color: string }) {
  const colorClass: Record<string, string> = {
    cyan: 'bg-cyan-400', amber: 'bg-amber-400', orange: 'bg-orange-400', red: 'bg-red-400',
  };
  return (
    <div>
      <div className="flex justify-between items-center mb-1">
        <span className="text-[10px] uppercase tracking-[0.14em] text-slate-500 font-semibold">{label}</span>
        <span className="text-sm font-mono font-bold text-white">{value}</span>
      </div>
      <div className="h-1.5 bg-slate-900 rounded overflow-hidden">
        <div className={`h-full ${colorClass[color] || 'bg-slate-400'} transition-all`} style={{ width: `${Math.max(0, Math.min(100, bar * 100))}%` }} />
      </div>
    </div>
  );
}

function VerdictAccuracyChip({ truth, promoted, suppressed }: { truth: 'good' | 'bad' | 'ambiguous'; promoted: boolean; suppressed: boolean }) {
  let status: 'match' | 'miss' | 'ambiguous' = 'ambiguous';
  let label = 'Ambiguous';
  if (truth === 'good') {
    if (promoted) { status = 'match'; label = 'True positive - correctly flagged'; }
    else if (suppressed) { status = 'miss'; label = 'FALSE NEGATIVE - missed malicious graph'; }
    else { status = 'ambiguous'; label = 'Borderline - below promotion'; }
  } else if (truth === 'bad') {
    if (suppressed) { status = 'match'; label = 'True negative - correctly suppressed'; }
    else if (promoted) { status = 'miss'; label = 'FALSE POSITIVE - benign graph escalated'; }
    else { status = 'ambiguous'; label = 'Borderline - activated but not promoted'; }
  }
  const styles: Record<typeof status, string> = {
    match: 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300',
    miss: 'bg-red-500/10 border-red-500/40 text-red-300',
    ambiguous: 'bg-amber-500/10 border-amber-500/40 text-amber-300',
  };
  const Icon = status === 'match' ? CheckCircle2 : status === 'miss' ? XCircle : AlertCircle;
  return (
    <div className={`rounded-lg border px-3 py-2 flex items-center gap-2 ${styles[status]}`}>
      <Icon className="w-4 h-4" />
      <span className="text-[11px] font-semibold">{label}</span>
    </div>
  );
}
