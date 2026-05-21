import { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, BarChart3, TrendingDown, Shield, Zap, AlertTriangle, Check, X } from 'lucide-react';

type KSFeatureResult = {
  feature: string;
  ks_statistic: number;
  p_value: number;
  baseline_mean: number;
  current_mean: number;
  is_anomalous: boolean;
};

type KSVerdict = {
  entity_id: string;
  fused_score: number;
  ks_boost_applied: boolean;
  ks_confidence: number;
  suppressed: boolean;
  features: KSFeatureResult[];
  timestamp: number;
};

function generateMockKSData(): KSVerdict[] {
  const entities = [
    'usr_jdoe_admin', 'srv_db_prod_07', 'usr_msmith_fin', 'svc_api_gateway',
    'usr_lzhang_eng', 'srv_kafka_03', 'usr_arodriguez_sec', 'svc_ci_runner_12',
    'usr_pwilson_hr', 'srv_redis_sentinel', 'usr_kpatel_devops', 'svc_ldap_auth',
    'usr_tchen_exec', 'srv_es_data_node_4', 'usr_bjohnson_ops', 'svc_vault_primary',
  ];
  const features = [
    'daily_events', 'daily_unique_ips', 'daily_unique_dests',
    'daily_failures', 'daily_high_sev', 'daily_offhours', 'daily_auth_targets',
  ];

  return entities.map((entity, i) => {
    const isAnomalous = i < 5;
    const isSuppressed = i >= 5 && i < 9;
    const featureResults: KSFeatureResult[] = features.map((f) => {
      const ks = isAnomalous
        ? 0.4 + Math.random() * 0.55
        : isSuppressed
        ? 0.15 + Math.random() * 0.25
        : Math.random() * 0.15;
      const p = isAnomalous ? Math.random() * 0.005 : isSuppressed ? 0.02 + Math.random() * 0.15 : 0.1 + Math.random() * 0.8;
      return {
        feature: f,
        ks_statistic: ks,
        p_value: p,
        baseline_mean: 20 + Math.random() * 80,
        current_mean: isAnomalous ? 80 + Math.random() * 120 : 20 + Math.random() * 80,
        is_anomalous: p < 0.01 / 7,
      };
    });

    return {
      entity_id: entity,
      fused_score: isAnomalous ? 0.78 + Math.random() * 0.2 : 0.3 + Math.random() * 0.4,
      ks_boost_applied: isAnomalous,
      ks_confidence: isAnomalous ? 0.9 + Math.random() * 0.09 : 0.2 + Math.random() * 0.5,
      suppressed: isSuppressed,
      features: featureResults,
      timestamp: Date.now() - Math.random() * 3600000,
    };
  });
}

function generateCDFPair(isAnomalous: boolean) {
  const n = 50;
  const baseline: number[] = [];
  const current: number[] = [];

  for (let i = 0; i < n; i++) {
    baseline.push(gaussianRandom(40, 12));
    current.push(isAnomalous ? gaussianRandom(75, 18) : gaussianRandom(42, 13));
  }

  baseline.sort((a, b) => a - b);
  current.sort((a, b) => a - b);

  return { baseline, current };
}

function gaussianRandom(mean: number, std: number) {
  const u = 1 - Math.random();
  const v = Math.random();
  const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  return z * std + mean;
}

export default function KSValidationPanel() {
  const [data] = useState<KSVerdict[]>(generateMockKSData);
  const [selectedEntity, setSelectedEntity] = useState<KSVerdict | null>(null);
  const [animationPhase, setAnimationPhase] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setAnimationPhase((p) => (p + 1) % 100);
    }, 50);
    return () => clearInterval(interval);
  }, []);

  const stats = useMemo(() => {
    const totalSignals = data.length;
    const ksValidated = data.filter((d) => d.ks_boost_applied).length;
    const suppressed = data.filter((d) => d.suppressed).length;
    const fpReduction = suppressed / Math.max(ksValidated + suppressed, 1);
    return { totalSignals, ksValidated, suppressed, fpReduction };
  }, [data]);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Animated Header Strip */}
      <div className="relative overflow-hidden bg-gradient-to-r from-slate-900 via-emerald-950/30 to-slate-900 border-b border-emerald-500/20 p-5">
        <div className="absolute inset-0 overflow-hidden">
          {Array.from({ length: 20 }).map((_, i) => (
            <div
              key={i}
              className="absolute w-px bg-gradient-to-b from-transparent via-emerald-400/30 to-transparent"
              style={{
                left: `${(i * 5 + animationPhase * 0.3) % 100}%`,
                top: 0,
                height: '100%',
                opacity: 0.3 + Math.sin((animationPhase + i * 10) * 0.05) * 0.2,
                transition: 'opacity 0.3s',
              }}
            />
          ))}
        </div>

        <div className="relative flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="absolute inset-0 bg-emerald-500 rounded-xl blur-xl opacity-40 animate-pulse" />
              <div className="relative p-3 bg-gradient-to-br from-emerald-500 to-teal-700 rounded-xl shadow-lg shadow-emerald-500/20">
                <Activity className="w-6 h-6 text-white" />
              </div>
            </div>
            <div>
              <h2 className="text-lg font-bold tracking-tight text-white">
                Kolmogorov-Smirnov Statistical Validation
              </h2>
              <p className="text-xs text-emerald-300/70">
                Distribution-tested signal confidence -- mathematically proven anomaly separation
              </p>
            </div>
          </div>

          <div className="flex gap-3">
            <MetricCard label="KS Validated" value={stats.ksValidated} icon={<Check className="w-3.5 h-3.5" />} color="emerald" />
            <MetricCard label="FP Suppressed" value={stats.suppressed} icon={<TrendingDown className="w-3.5 h-3.5" />} color="amber" />
            <MetricCard label="FP Reduction" value={`${(stats.fpReduction * 100).toFixed(0)}%`} icon={<Shield className="w-3.5 h-3.5" />} color="cyan" />
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Left: CDF Visualization + Entity List */}
        <div className="w-2/3 flex flex-col border-r border-slate-800">
          {/* CDF Overlay Visualization */}
          <div className="h-[280px] p-4 border-b border-slate-800">
            <CDFVisualization
              entity={selectedEntity ?? data[0]}
              animationPhase={animationPhase}
            />
          </div>

          {/* Feature P-Value Heatmap */}
          <div className="flex-1 overflow-auto p-4">
            <FeatureHeatmap data={data} onSelect={setSelectedEntity} selected={selectedEntity} />
          </div>
        </div>

        {/* Right: Signal Flow + Suppression Log */}
        <div className="w-1/3 flex flex-col">
          <div className="h-1/2 border-b border-slate-800 overflow-auto p-4">
            <SignalFlowWaterfall data={data} animationPhase={animationPhase} />
          </div>
          <div className="h-1/2 overflow-auto p-4">
            <SuppressionLog data={data} onSelect={setSelectedEntity} />
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ label, value, icon, color }: { label: string; value: string | number; icon: React.ReactNode; color: string }) {
  const colors: Record<string, string> = {
    emerald: 'border-emerald-500/30 text-emerald-300 bg-emerald-500/10',
    amber: 'border-amber-500/30 text-amber-300 bg-amber-500/10',
    cyan: 'border-cyan-500/30 text-cyan-300 bg-cyan-500/10',
  };
  return (
    <div className={`px-4 py-2 rounded-lg border ${colors[color]} min-w-[120px]`}>
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider opacity-70">
        {icon} {label}
      </div>
      <div className="text-xl font-bold mt-0.5">{value}</div>
    </div>
  );
}

function CDFVisualization({ entity, animationPhase }: { entity: KSVerdict; animationPhase: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cdfData = useMemo(() => generateCDFPair(entity.ks_boost_applied), [entity.entity_id]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    const w = rect.width;
    const h = rect.height;

    ctx.clearRect(0, 0, w, h);

    // Background grid
    ctx.strokeStyle = 'rgba(100, 200, 180, 0.06)';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 10; i++) {
      const x = (i / 10) * w;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
      const y = (i / 10) * h;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }

    const { baseline, current } = cdfData;
    const allVals = [...baseline, ...current];
    const minVal = Math.min(...allVals);
    const maxVal = Math.max(...allVals);
    const range = maxVal - minVal || 1;

    const drawCDF = (values: number[], color: string, glowColor: string) => {
      const n = values.length;

      // Glow
      ctx.shadowBlur = 8;
      ctx.shadowColor = glowColor;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const x = ((values[i] - minVal) / range) * w;
        const y = h - ((i + 1) / n) * h;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
    };

    drawCDF(baseline, 'rgba(99, 220, 190, 0.9)', 'rgba(99, 220, 190, 0.4)');
    drawCDF(current, 'rgba(250, 180, 50, 0.9)', 'rgba(250, 180, 50, 0.4)');

    // Draw KS distance line (max vertical gap)
    let maxGap = 0;
    let maxGapX = 0;
    let maxGapY1 = 0;
    let maxGapY2 = 0;

    for (let px = 0; px < w; px++) {
      const xVal = minVal + (px / w) * range;
      const baseIdx = baseline.findIndex((v) => v >= xVal);
      const currIdx = current.findIndex((v) => v >= xVal);
      const baseCDF = baseIdx === -1 ? 1 : baseIdx / baseline.length;
      const currCDF = currIdx === -1 ? 1 : currIdx / current.length;
      const gap = Math.abs(baseCDF - currCDF);
      if (gap > maxGap) {
        maxGap = gap;
        maxGapX = px;
        maxGapY1 = h - baseCDF * h;
        maxGapY2 = h - currCDF * h;
      }
    }

    // Animated KS distance indicator
    const pulse = Math.sin(animationPhase * 0.1) * 0.3 + 0.7;
    ctx.strokeStyle = `rgba(255, 90, 90, ${pulse})`;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(maxGapX, maxGapY1);
    ctx.lineTo(maxGapX, maxGapY2);
    ctx.stroke();
    ctx.setLineDash([]);

    // KS stat label
    ctx.fillStyle = `rgba(255, 90, 90, ${pulse})`;
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`D = ${maxGap.toFixed(3)}`, maxGapX, (maxGapY1 + maxGapY2) / 2 - 8);

    // Arrow heads
    const arrowSize = 5;
    ctx.beginPath();
    ctx.moveTo(maxGapX - arrowSize, maxGapY1 + arrowSize);
    ctx.lineTo(maxGapX, maxGapY1);
    ctx.lineTo(maxGapX + arrowSize, maxGapY1 + arrowSize);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(maxGapX - arrowSize, maxGapY2 - arrowSize);
    ctx.lineTo(maxGapX, maxGapY2);
    ctx.lineTo(maxGapX + arrowSize, maxGapY2 - arrowSize);
    ctx.stroke();

    // Legend
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(99, 220, 190, 0.9)';
    ctx.fillRect(12, 12, 10, 3);
    ctx.fillText('Baseline CDF (30d)', 28, 16);
    ctx.fillStyle = 'rgba(250, 180, 50, 0.9)';
    ctx.fillRect(12, 26, 10, 3);
    ctx.fillText('Current CDF (4h)', 28, 30);

    // Entity label
    ctx.font = 'bold 12px monospace';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.textAlign = 'right';
    ctx.fillText(entity.entity_id, w - 12, 16);

    // P-value
    const pVal = entity.features[0]?.p_value ?? 0;
    ctx.font = '10px monospace';
    ctx.fillStyle = pVal < 0.01 ? 'rgba(255, 100, 100, 0.9)' : 'rgba(100, 255, 180, 0.9)';
    ctx.fillText(`p = ${pVal.toExponential(2)}`, w - 12, 30);

    // Axes labels
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Feature Value', w / 2, h - 4);
    ctx.save();
    ctx.translate(10, h / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('Cumulative Probability', 0, 0);
    ctx.restore();
  }, [entity, cdfData, animationPhase]);

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-emerald-400" />
          CDF Comparison -- KS Distance Visualization
        </h3>
        <div className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
          entity.ks_boost_applied
            ? 'bg-red-500/20 text-red-300 border border-red-500/40'
            : entity.suppressed
            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
            : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
        }`}>
          {entity.ks_boost_applied ? 'ANOMALOUS' : entity.suppressed ? 'SUPPRESSED' : 'NORMAL'}
        </div>
      </div>
      <canvas ref={canvasRef} className="flex-1 w-full rounded-lg bg-slate-900/50 border border-slate-700/50" />
    </div>
  );
}

function FeatureHeatmap({
  data,
  onSelect,
  selected,
}: {
  data: KSVerdict[];
  onSelect: (v: KSVerdict) => void;
  selected: KSVerdict | null;
}) {
  const features = data[0]?.features.map((f) => f.feature) ?? [];

  return (
    <div>
      <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
        <Zap className="w-4 h-4 text-amber-400" />
        KS P-Value Heatmap (Per Entity x Feature)
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-[10px]">
          <thead>
            <tr className="border-b border-slate-700">
              <th className="text-left py-2 px-2 text-slate-400 font-medium sticky left-0 bg-slate-950 z-10">Entity</th>
              {features.map((f) => (
                <th key={f} className="text-center py-2 px-1.5 text-slate-400 font-medium whitespace-nowrap">
                  {f.replace('daily_', '').replace('_', ' ')}
                </th>
              ))}
              <th className="text-center py-2 px-2 text-slate-400 font-medium">KS Conf.</th>
              <th className="text-center py-2 px-2 text-slate-400 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {data.map((verdict) => (
              <tr
                key={verdict.entity_id}
                onClick={() => onSelect(verdict)}
                className={`border-b border-slate-800/50 cursor-pointer transition-all duration-200 hover:bg-slate-800/40 ${
                  selected?.entity_id === verdict.entity_id ? 'bg-emerald-500/10 ring-1 ring-emerald-500/30' : ''
                }`}
              >
                <td className="py-1.5 px-2 font-mono text-slate-200 whitespace-nowrap sticky left-0 bg-slate-950 z-10">
                  {verdict.entity_id}
                </td>
                {verdict.features.map((f) => (
                  <td key={f.feature} className="py-1.5 px-1.5 text-center">
                    <div
                      className="w-full h-6 rounded flex items-center justify-center font-mono transition-all duration-300"
                      style={{
                        backgroundColor: getHeatColor(f.p_value, f.is_anomalous),
                      }}
                    >
                      {f.p_value < 0.001 ? '<.001' : f.p_value.toFixed(3)}
                    </div>
                  </td>
                ))}
                <td className="py-1.5 px-2 text-center">
                  <div className="flex items-center justify-center">
                    <div className="w-16 h-2 rounded-full bg-slate-800 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${verdict.ks_confidence * 100}%`,
                          background: verdict.ks_confidence > 0.8
                            ? 'linear-gradient(90deg, #f43f5e, #ef4444)'
                            : verdict.ks_confidence > 0.5
                            ? 'linear-gradient(90deg, #f59e0b, #d97706)'
                            : 'linear-gradient(90deg, #10b981, #059669)',
                        }}
                      />
                    </div>
                    <span className="ml-1.5 text-slate-300 font-mono">{(verdict.ks_confidence * 100).toFixed(0)}%</span>
                  </div>
                </td>
                <td className="py-1.5 px-2 text-center">
                  {verdict.ks_boost_applied ? (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-500/20 text-red-300 text-[9px] font-bold">
                      <AlertTriangle className="w-2.5 h-2.5" /> ESCALATED
                    </span>
                  ) : verdict.suppressed ? (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[9px] font-bold">
                      <X className="w-2.5 h-2.5" /> SUPPRESSED
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[9px] font-bold">
                      <Check className="w-2.5 h-2.5" /> NORMAL
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function getHeatColor(pValue: number, isAnomalous: boolean): string {
  if (isAnomalous) return 'rgba(239, 68, 68, 0.35)';
  if (pValue < 0.01) return 'rgba(245, 158, 11, 0.25)';
  if (pValue < 0.05) return 'rgba(234, 179, 8, 0.15)';
  return 'rgba(16, 185, 129, 0.1)';
}

function SignalFlowWaterfall({ data, animationPhase }: { data: KSVerdict[]; animationPhase: number }) {
  const escalated = data.filter((d) => d.ks_boost_applied);
  const suppressed = data.filter((d) => d.suppressed);
  const normal = data.filter((d) => !d.ks_boost_applied && !d.suppressed);

  const total = data.length;
  const stages = [
    { label: 'Raw Signals', count: total, color: 'from-slate-500 to-slate-600' },
    { label: 'KS Tested', count: total, color: 'from-cyan-500 to-cyan-600' },
    { label: 'FP Suppressed', count: suppressed.length, color: 'from-amber-500 to-amber-600', subtract: true },
    { label: 'KS Validated', count: escalated.length + normal.length, color: 'from-emerald-500 to-emerald-600' },
    { label: 'Escalated', count: escalated.length, color: 'from-red-500 to-red-600' },
  ];

  return (
    <div>
      <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
        <TrendingDown className="w-4 h-4 text-cyan-400" />
        Signal Reduction Waterfall
      </h3>
      <div className="space-y-2">
        {stages.map((stage, i) => {
          const width = stage.subtract
            ? (stage.count / total) * 100
            : ((stage.count) / total) * 100;
          const delay = i * 0.1;
          const pulse = Math.sin((animationPhase + i * 20) * 0.08) * 0.15 + 0.85;

          return (
            <div key={stage.label} className="group">
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-[10px] text-slate-400 uppercase tracking-wider">{stage.label}</span>
                <span className="text-xs font-bold text-slate-200 font-mono">{stage.count}</span>
              </div>
              <div className="h-5 bg-slate-800/60 rounded overflow-hidden relative">
                {stage.subtract ? (
                  <div
                    className={`absolute right-0 top-0 h-full bg-gradient-to-r ${stage.color} rounded transition-all duration-700`}
                    style={{
                      width: `${width}%`,
                      opacity: pulse,
                      animationDelay: `${delay}s`,
                    }}
                  >
                    <div className="absolute inset-0 bg-[repeating-linear-gradient(135deg,transparent,transparent_4px,rgba(0,0,0,0.15)_4px,rgba(0,0,0,0.15)_8px)]" />
                  </div>
                ) : (
                  <div
                    className={`h-full bg-gradient-to-r ${stage.color} rounded transition-all duration-700`}
                    style={{
                      width: `${width}%`,
                      opacity: pulse,
                      animationDelay: `${delay}s`,
                    }}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Animated Flow Particles */}
      <div className="mt-4 relative h-20 rounded-lg border border-slate-700/50 bg-slate-900/30 overflow-hidden">
        {Array.from({ length: 12 }).map((_, i) => {
          const x = ((animationPhase * 1.5 + i * 8.3) % 100);
          const isRed = i < 3;
          const isAmber = i >= 3 && i < 6;
          return (
            <div
              key={i}
              className="absolute w-2 h-2 rounded-full transition-all duration-100"
              style={{
                left: `${x}%`,
                top: `${30 + Math.sin((animationPhase + i * 5) * 0.1) * 25}%`,
                backgroundColor: isRed ? '#ef4444' : isAmber ? '#f59e0b' : '#10b981',
                boxShadow: `0 0 6px ${isRed ? '#ef4444' : isAmber ? '#f59e0b' : '#10b981'}`,
                opacity: x > 95 ? (100 - x) / 5 : x < 5 ? x / 5 : 0.8,
              }}
            />
          );
        })}
        <div className="absolute inset-0 flex items-center justify-center text-[9px] text-slate-500 uppercase tracking-widest">
          live signal flow
        </div>
      </div>
    </div>
  );
}

function SuppressionLog({ data, onSelect }: { data: KSVerdict[]; onSelect: (v: KSVerdict) => void }) {
  const suppressed = data.filter((d) => d.suppressed);

  return (
    <div>
      <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
        <Shield className="w-4 h-4 text-amber-400" />
        False Positive Suppression Log
      </h3>
      <div className="space-y-1.5">
        {suppressed.map((s) => {
          const topFeature = s.features.reduce((best, f) => f.p_value < best.p_value ? f : best, s.features[0]);
          return (
            <div
              key={s.entity_id}
              onClick={() => onSelect(s)}
              className="p-2.5 rounded-lg bg-slate-900/50 border border-amber-500/10 hover:border-amber-500/30 cursor-pointer transition-all group"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs text-slate-200 group-hover:text-amber-200 transition-colors">
                  {s.entity_id}
                </span>
                <span className="text-[9px] bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded font-bold">
                  SUPPRESSED
                </span>
              </div>
              <div className="mt-1 text-[10px] text-slate-500">
                Fused score {s.fused_score.toFixed(2)} -- KS p={topFeature.p_value.toFixed(4)} on {topFeature.feature.replace('daily_', '')}
                {' '}-- within baseline variance
              </div>
              <div className="mt-1.5 flex gap-1">
                {s.features.filter((f) => !f.is_anomalous).slice(0, 4).map((f) => (
                  <span key={f.feature} className="px-1 py-0.5 rounded bg-emerald-500/10 text-emerald-400 text-[8px]">
                    {f.feature.replace('daily_', '')} OK
                  </span>
                ))}
              </div>
            </div>
          );
        })}

        {suppressed.length === 0 && (
          <div className="text-center text-slate-500 text-xs py-8">No signals suppressed this cycle</div>
        )}
      </div>
    </div>
  );
}
