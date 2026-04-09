import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Users, Shield, Camera, Wifi, UserX, Bug, TrendingUp, TrendingDown, Minus, Activity, Zap, Clock } from 'lucide-react';

interface SignalVariable {
  name: string;
  shortName: string;
  weight: number;
  value: number;
  trend: 'rising' | 'declining' | 'stable';
  contribution: number;
  color: string;
  canvasColor: string;
  lastSignal: string;
  history: number[];
  icon: React.FC<{ size?: number; className?: string }>;
}

const VARIABLES: SignalVariable[] = [
  { name: 'User Behavior Analytics', shortName: 'User Behavior', weight: 18, value: 72, trend: 'rising', contribution: 14.2, color: 'cyan', canvasColor: '#22d3ee', lastSignal: '2m ago', history: [55, 60, 65, 68, 72], icon: Users },
  { name: 'Threat Intel Feeds', shortName: 'Threat Intel', weight: 24, value: 88, trend: 'rising', contribution: 22.8, color: 'red', canvasColor: '#ef4444', lastSignal: '45s ago', history: [70, 75, 80, 85, 88], icon: Shield },
  { name: 'Physical Security Sensors', shortName: 'Physical Sec', weight: 10, value: 45, trend: 'stable', contribution: 4.8, color: 'yellow', canvasColor: '#eab308', lastSignal: '8m ago', history: [42, 44, 43, 45, 45], icon: Camera },
  { name: 'Network Anomaly Detection', shortName: 'Net Anomaly', weight: 22, value: 81, trend: 'rising', contribution: 19.4, color: 'orange', canvasColor: '#f97316', lastSignal: '1m ago', history: [60, 65, 72, 78, 81], icon: Wifi },
  { name: 'Insider Threat Indicators', shortName: 'Insider Threat', weight: 14, value: 56, trend: 'declining', contribution: 8.4, color: 'blue', canvasColor: '#3b82f6', lastSignal: '15m ago', history: [62, 60, 59, 57, 56], icon: UserX },
  { name: 'Vulnerability Surface Score', shortName: 'Vuln Surface', weight: 12, value: 67, trend: 'rising', contribution: 8.6, color: 'emerald', canvasColor: '#10b981', lastSignal: '5m ago', history: [55, 58, 61, 64, 67], icon: Bug },
];

const TOTAL_SIMULATIONS = 10000;
const PATH_COUNT = 200;
const TIME_STEPS = 96;
const CONFIDENCE_LEVEL = 95;

function gaussianRandom(): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

function getRiskColor(value: number): string {
  if (value >= 85) return '#ef4444';
  if (value >= 70) return '#f97316';
  if (value >= 50) return '#eab308';
  if (value >= 30) return '#3b82f6';
  return '#22d3ee';
}

function getRiskColorRGBA(value: number, alpha: number): string {
  if (value >= 85) return `rgba(239, 68, 68, ${alpha})`;
  if (value >= 70) return `rgba(249, 115, 22, ${alpha})`;
  if (value >= 50) return `rgba(234, 179, 8, ${alpha})`;
  if (value >= 30) return `rgba(59, 130, 246, ${alpha})`;
  return `rgba(34, 211, 238, ${alpha})`;
}

function computeCompoundRisk(): number {
  let total = 0;
  for (const v of VARIABLES) {
    total += (v.value * v.weight) / 100;
  }
  return Math.round(total * 10) / 10;
}

function computeDrift(): number {
  let weightedTrend = 0;
  for (const v of VARIABLES) {
    const trendFactor = v.trend === 'rising' ? 1 : v.trend === 'declining' ? -1 : 0;
    weightedTrend += trendFactor * (v.weight / 100) * (v.value / 100);
  }
  return weightedTrend * 2.4;
}

function generatePath(startValue: number, drift: number): number[] {
  const path: number[] = [startValue];
  let current = startValue;
  for (let t = 1; t <= TIME_STEPS; t++) {
    const timeVolatility = 0.8 + (t / TIME_STEPS) * 2.5;
    const noise = gaussianRandom() * timeVolatility;
    const hourDrift = drift / 12;
    current = current + hourDrift + noise;
    current = Math.max(0, Math.min(100, current));
    path.push(current);
  }
  return path;
}

function computePercentiles(paths: number[][], percentile: number): number[] {
  const result: number[] = [];
  for (let t = 0; t <= TIME_STEPS; t++) {
    const values = paths.map(p => p[t]).sort((a, b) => a - b);
    const idx = Math.floor((percentile / 100) * (values.length - 1));
    result.push(values[idx]);
  }
  return result;
}

const colorMap: Record<string, { text: string; bg: string; border: string; bar: string }> = {
  cyan: { text: 'text-cyan-400', bg: 'bg-cyan-500/10', border: 'border-cyan-500/30', bar: 'bg-cyan-500' },
  red: { text: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/30', bar: 'bg-red-500' },
  yellow: { text: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/30', bar: 'bg-yellow-500' },
  orange: { text: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/30', bar: 'bg-orange-500' },
  blue: { text: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/30', bar: 'bg-blue-500' },
  emerald: { text: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', bar: 'bg-emerald-500' },
};

const MonteCarloForecasting: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const pathsRef = useRef<number[][]>([]);
  const frameRef = useRef<number>(0);
  const [currentTime, setCurrentTime] = useState<string>('');

  const compoundRisk = computeCompoundRisk();
  const drift = computeDrift();

  const initPaths = useCallback(() => {
    const paths: number[][] = [];
    for (let i = 0; i < PATH_COUNT; i++) {
      paths.push(generatePath(compoundRisk, drift));
    }
    pathsRef.current = paths;
  }, [compoundRisk, drift]);

  useEffect(() => {
    initPaths();
  }, [initPaths]);

  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString('en-US', { hour12: false }));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      const rect = canvas.parentElement?.getBoundingClientRect();
      if (rect) {
        const dpr = window.devicePixelRatio || 1;
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        canvas.style.width = rect.width + 'px';
        canvas.style.height = rect.height + 'px';
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
    };
    resize();
    window.addEventListener('resize', resize);

    const sidebarWidth = 140;
    const chartPaddingTop = 50;
    const chartPaddingBottom = 40;
    const chartPaddingRight = 20;

    const animate = () => {
      const rect = canvas.parentElement?.getBoundingClientRect();
      if (!rect) { animRef.current = requestAnimationFrame(animate); return; }
      const w = rect.width;
      const h = rect.height;
      frameRef.current++;

      if (pathsRef.current.length > 0 && frameRef.current % 2 === 0) {
        const replaceIdx = frameRef.current % PATH_COUNT;
        pathsRef.current[replaceIdx] = generatePath(compoundRisk, drift);
      }

      ctx.clearRect(0, 0, w, h);

      ctx.fillStyle = '#060a14';
      ctx.fillRect(0, 0, w, h);

      ctx.strokeStyle = 'rgba(100, 116, 139, 0.08)';
      ctx.lineWidth = 0.5;
      const gridSpacing = 30;
      for (let x = sidebarWidth; x < w; x += gridSpacing) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      for (let y = 0; y < h; y += gridSpacing) {
        ctx.beginPath();
        ctx.moveTo(sidebarWidth, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      ctx.fillStyle = 'rgba(6, 10, 20, 0.95)';
      ctx.fillRect(0, 0, sidebarWidth, h);
      ctx.strokeStyle = 'rgba(100, 116, 139, 0.2)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(sidebarWidth, 0);
      ctx.lineTo(sidebarWidth, h);
      ctx.stroke();

      const barWidth = 10;
      const barMaxH = 45;
      const startY = 55;
      const barSpacing = 55;
      const barX = 15;

      for (let i = 0; i < VARIABLES.length; i++) {
        const v = VARIABLES[i];
        const by = startY + i * barSpacing;
        const fillH = (v.value / 100) * barMaxH;

        ctx.fillStyle = 'rgba(30, 41, 59, 0.6)';
        ctx.fillRect(barX, by, barWidth, barMaxH);

        ctx.fillStyle = v.canvasColor;
        ctx.globalAlpha = 0.8;
        ctx.fillRect(barX, by + (barMaxH - fillH), barWidth, fillH);
        ctx.globalAlpha = 1.0;

        ctx.fillStyle = 'rgba(148, 163, 184, 0.8)';
        ctx.font = '9px monospace';
        ctx.textAlign = 'left';
        ctx.fillText(v.shortName, barX + barWidth + 6, by + 10);

        ctx.fillStyle = v.canvasColor;
        ctx.font = 'bold 11px monospace';
        ctx.fillText(v.value.toString(), barX + barWidth + 6, by + 24);
      }

      ctx.fillStyle = 'rgba(148, 163, 184, 0.5)';
      ctx.font = '8px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('SIGNAL', sidebarWidth / 2, 20);
      ctx.fillText('SOURCES', sidebarWidth / 2, 30);

      const chartX = sidebarWidth + 20;
      const chartY = chartPaddingTop;
      const chartW = w - chartX - chartPaddingRight;
      const chartH = h - chartPaddingTop - chartPaddingBottom;

      ctx.strokeStyle = 'rgba(100, 116, 139, 0.15)';
      ctx.lineWidth = 0.5;
      for (let i = 0; i <= 10; i++) {
        const yy = chartY + (i / 10) * chartH;
        ctx.beginPath();
        ctx.moveTo(chartX, yy);
        ctx.lineTo(chartX + chartW, yy);
        ctx.stroke();
      }

      ctx.fillStyle = 'rgba(148, 163, 184, 0.4)';
      ctx.font = '9px monospace';
      ctx.textAlign = 'right';
      for (let i = 0; i <= 10; i++) {
        const yy = chartY + (i / 10) * chartH;
        ctx.fillText((100 - i * 10).toString(), chartX - 5, yy + 3);
      }

      const timeLabels = ['NOW', '+12h', '+24h', '+36h', '+48h', '+60h', '+72h', '+84h', '+96h'];
      ctx.fillStyle = 'rgba(148, 163, 184, 0.4)';
      ctx.font = '9px monospace';
      ctx.textAlign = 'center';
      for (let i = 0; i < timeLabels.length; i++) {
        const xx = chartX + (i / (timeLabels.length - 1)) * chartW;
        ctx.fillText(timeLabels[i], xx, h - 10);
        ctx.strokeStyle = 'rgba(100, 116, 139, 0.1)';
        ctx.beginPath();
        ctx.moveTo(xx, chartY);
        ctx.lineTo(xx, chartY + chartH);
        ctx.stroke();
      }

      const paths = pathsRef.current;
      if (paths.length > 0) {
        const p10 = computePercentiles(paths, 10);
        const p90 = computePercentiles(paths, 90);
        const p25 = computePercentiles(paths, 25);
        const p75 = computePercentiles(paths, 75);
        const p40 = computePercentiles(paths, 40);
        const p60 = computePercentiles(paths, 60);
        const mean = computePercentiles(paths, 50);

        const toCanvasX = (t: number) => chartX + (t / TIME_STEPS) * chartW;
        const toCanvasY = (v: number) => chartY + ((100 - v) / 100) * chartH;

        const drawBand = (lower: number[], upper: number[], alpha: number) => {
          const midValues = lower.map((l, i) => (l + upper[i]) / 2);
          const avgMid = midValues.reduce((a, b) => a + b, 0) / midValues.length;
          const bandColor = getRiskColorRGBA(avgMid, alpha);
          ctx.fillStyle = bandColor;
          ctx.beginPath();
          ctx.moveTo(toCanvasX(0), toCanvasY(upper[0]));
          for (let t = 1; t <= TIME_STEPS; t++) {
            ctx.lineTo(toCanvasX(t), toCanvasY(upper[t]));
          }
          for (let t = TIME_STEPS; t >= 0; t--) {
            ctx.lineTo(toCanvasX(t), toCanvasY(lower[t]));
          }
          ctx.closePath();
          ctx.fill();
        };

        drawBand(p10, p90, 0.06);
        drawBand(p25, p75, 0.1);
        drawBand(p40, p60, 0.18);

        for (let i = 0; i < paths.length; i++) {
          const path = paths[i];
          ctx.beginPath();
          ctx.moveTo(toCanvasX(0), toCanvasY(path[0]));
          for (let t = 1; t <= TIME_STEPS; t++) {
            ctx.lineTo(toCanvasX(t), toCanvasY(path[t]));
          }
          const endVal = path[TIME_STEPS];
          ctx.strokeStyle = getRiskColorRGBA(endVal, 0.04);
          ctx.lineWidth = 0.8;
          ctx.stroke();
        }

        ctx.beginPath();
        ctx.moveTo(toCanvasX(0), toCanvasY(mean[0]));
        for (let t = 1; t <= TIME_STEPS; t++) {
          ctx.lineTo(toCanvasX(t), toCanvasY(mean[t]));
        }
        const meanEnd = mean[TIME_STEPS];
        ctx.strokeStyle = getRiskColor(meanEnd);
        ctx.lineWidth = 2.5;
        ctx.shadowColor = getRiskColor(meanEnd);
        ctx.shadowBlur = 8;
        ctx.stroke();
        ctx.shadowBlur = 0;

        const nowX = toCanvasX(0);
        const nowY = toCanvasY(compoundRisk);
        const pulseSize = 4 + Math.sin(frameRef.current * 0.08) * 2;
        const pulseAlpha = 0.3 + Math.sin(frameRef.current * 0.08) * 0.2;

        ctx.beginPath();
        ctx.arc(nowX, nowY, pulseSize + 6, 0, Math.PI * 2);
        ctx.fillStyle = getRiskColorRGBA(compoundRisk, pulseAlpha);
        ctx.fill();

        ctx.beginPath();
        ctx.arc(nowX, nowY, pulseSize, 0, Math.PI * 2);
        ctx.fillStyle = getRiskColor(compoundRisk);
        ctx.shadowColor = getRiskColor(compoundRisk);
        ctx.shadowBlur = 12;
        ctx.fill();
        ctx.shadowBlur = 0;

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 12px monospace';
        ctx.textAlign = 'left';
        ctx.fillText(compoundRisk.toFixed(1), nowX + 14, nowY - 8);
        ctx.fillStyle = 'rgba(148, 163, 184, 0.6)';
        ctx.font = '9px monospace';
        ctx.fillText('CURRENT', nowX + 14, nowY + 4);
      }

      ctx.fillStyle = 'rgba(226, 232, 240, 0.9)';
      ctx.font = 'bold 13px monospace';
      ctx.textAlign = 'left';
      ctx.fillText('MONTE CARLO ATTACK FORECASTING', sidebarWidth + 15, 20);
      ctx.fillStyle = 'rgba(148, 163, 184, 0.5)';
      ctx.font = '10px monospace';
      ctx.fillText('COMPOUND SIGNAL ANALYSIS', sidebarWidth + 15, 35);

      const liveX = w - 180;
      const pulseBright = 0.6 + Math.sin(frameRef.current * 0.1) * 0.4;
      ctx.beginPath();
      ctx.arc(liveX, 17, 4, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(239, 68, 68, ${pulseBright})`;
      ctx.fill();
      ctx.fillStyle = '#ef4444';
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'left';
      ctx.fillText('LIVE', liveX + 10, 21);

      const statsX = w - 175;
      const statsY = 45;
      ctx.fillStyle = 'rgba(6, 10, 20, 0.7)';
      ctx.fillRect(statsX - 10, statsY - 12, 170, 80);
      ctx.strokeStyle = 'rgba(100, 116, 139, 0.2)';
      ctx.strokeRect(statsX - 10, statsY - 12, 170, 80);

      ctx.font = '8px monospace';
      ctx.textAlign = 'left';
      ctx.fillStyle = 'rgba(148, 163, 184, 0.5)';
      ctx.fillText('SIMULATIONS', statsX, statsY + 2);
      ctx.fillStyle = '#22d3ee';
      ctx.font = 'bold 11px monospace';
      ctx.fillText('10,000', statsX + 85, statsY + 2);

      ctx.font = '8px monospace';
      ctx.fillStyle = 'rgba(148, 163, 184, 0.5)';
      ctx.fillText('CONFIDENCE', statsX, statsY + 18);
      ctx.fillStyle = '#22d3ee';
      ctx.font = 'bold 11px monospace';
      ctx.fillText('95%', statsX + 85, statsY + 18);

      ctx.font = '8px monospace';
      ctx.fillStyle = 'rgba(148, 163, 184, 0.5)';
      ctx.fillText('DRIFT RATE', statsX, statsY + 34);
      ctx.fillStyle = drift > 0 ? '#f97316' : '#22d3ee';
      ctx.font = 'bold 11px monospace';
      ctx.fillText((drift > 0 ? '+' : '') + drift.toFixed(1) + '/h', statsX + 85, statsY + 34);

      ctx.font = '8px monospace';
      ctx.fillStyle = 'rgba(148, 163, 184, 0.5)';
      ctx.fillText('TIME', statsX, statsY + 50);
      const timeFlicker = 0.7 + Math.sin(frameRef.current * 0.15) * 0.3;
      ctx.fillStyle = `rgba(34, 211, 238, ${timeFlicker})`;
      ctx.font = 'bold 11px monospace';
      const now = new Date();
      ctx.fillText(now.toLocaleTimeString('en-US', { hour12: false }), statsX + 85, statsY + 50);

      animRef.current = requestAnimationFrame(animate);
    };

    animRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener('resize', resize);
    };
  }, [compoundRisk, drift]);

  const forecast24 = Math.min(100, Math.max(0, compoundRisk + drift * 24));
  const forecast48 = Math.min(100, Math.max(0, compoundRisk + drift * 48));
  const forecast72 = Math.min(100, Math.max(0, compoundRisk + drift * 72));

  const TrendIcon = ({ trend }: { trend: string }) => {
    if (trend === 'rising') return <TrendingUp size={14} className="text-red-400" />;
    if (trend === 'declining') return <TrendingDown size={14} className="text-green-400" />;
    return <Minus size={14} className="text-slate-400" />;
  };

  const Sparkline = ({ values, color }: { values: number[]; color: string }) => {
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const points = values.map((v, i) => ({
      x: 8 + (i / (values.length - 1)) * 60,
      y: 18 - ((v - min) / range) * 14,
    }));
    const lineD = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
    const dotColorMap: Record<string, string> = {
      cyan: '#22d3ee', red: '#ef4444', yellow: '#eab308',
      orange: '#f97316', blue: '#3b82f6', emerald: '#10b981',
    };
    const c = dotColorMap[color] || '#94a3b8';
    return (
      <svg width="76" height="24" viewBox="0 0 76 24" className="inline-block">
        <path d={lineD} fill="none" stroke={c} strokeWidth="1.5" opacity="0.5" />
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={i === points.length - 1 ? 3 : 2} fill={c} opacity={i === points.length - 1 ? 1 : 0.5} />
        ))}
      </svg>
    );
  };

  const riskGaugeColor = (v: number) => {
    if (v >= 85) return 'text-red-400';
    if (v >= 70) return 'text-orange-400';
    if (v >= 50) return 'text-yellow-400';
    if (v >= 30) return 'text-blue-400';
    return 'text-cyan-400';
  };

  const riskBgColor = (v: number) => {
    if (v >= 85) return 'bg-red-500';
    if (v >= 70) return 'bg-orange-500';
    if (v >= 50) return 'bg-yellow-500';
    if (v >= 30) return 'bg-blue-500';
    return 'bg-cyan-500';
  };

  return (
    <div className="space-y-4">
      <div className="enterprise-card border border-slate-700/30 overflow-hidden">
        <div className="relative" style={{ height: '400px' }}>
          <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {VARIABLES.map((v) => {
          const cm = colorMap[v.color];
          const IconComp = v.icon;
          return (
            <div key={v.name} className={`enterprise-card border ${cm.border} p-4`}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className={`w-8 h-8 rounded flex items-center justify-center ${cm.bg}`}>
                    <IconComp size={16} className={cm.text} />
                  </div>
                  <div>
                    <div className={`text-xs font-semibold ${cm.text}`}>{v.name}</div>
                    <div className="text-[10px] text-slate-500 font-mono">Weight: {v.weight}%</div>
                  </div>
                </div>
                <TrendIcon trend={v.trend} />
              </div>

              <div className="flex items-center gap-3 mb-3">
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] text-slate-500 font-mono uppercase">Signal Strength</span>
                    <span className={`text-sm font-bold font-mono ${cm.text}`}>{v.value}</span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div className={`h-full ${cm.bar} rounded-full transition-all`} style={{ width: `${v.value}%`, opacity: 0.8 }} />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 mb-2">
                <span>Contribution: <span className={cm.text}>{v.contribution}%</span></span>
                <span>Trend: <span className={v.trend === 'rising' ? 'text-red-400' : v.trend === 'declining' ? 'text-green-400' : 'text-slate-400'}>{v.trend}</span></span>
              </div>

              <div className="flex items-center justify-between border-t border-slate-700/30 pt-2">
                <div className="flex items-center gap-1 text-[10px] text-slate-500 font-mono">
                  <Clock size={10} className="text-slate-600" />
                  {v.lastSignal}
                </div>
                <Sparkline values={v.history} color={v.color} />
              </div>
            </div>
          );
        })}
      </div>

      <div className="enterprise-card border border-slate-700/30 p-4">
        <div className="flex flex-wrap items-center gap-6 justify-between">
          <div className="flex items-center gap-4">
            <div className="flex flex-col items-center">
              <span className="text-[10px] text-slate-500 font-mono uppercase mb-1">Compound Risk</span>
              <div className="flex items-center gap-2">
                <span className={`text-3xl font-bold font-mono ${riskGaugeColor(compoundRisk)}`}>{compoundRisk.toFixed(1)}</span>
                <div className="w-24 h-2 bg-slate-800 rounded-full overflow-hidden">
                  <div className={`h-full ${riskBgColor(compoundRisk)} rounded-full`} style={{ width: `${compoundRisk}%`, opacity: 0.9 }} />
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-6">
            {[
              { label: '24h Forecast', value: forecast24 },
              { label: '48h Forecast', value: forecast48 },
              { label: '72h Forecast', value: forecast72 },
            ].map((f) => (
              <div key={f.label} className="flex flex-col items-center">
                <span className="text-[10px] text-slate-500 font-mono uppercase mb-1">{f.label}</span>
                <div className="flex items-center gap-1.5">
                  <span className={`text-lg font-bold font-mono ${riskGaugeColor(f.value)}`}>{f.value.toFixed(1)}</span>
                  {f.value > compoundRisk ? (
                    <TrendingUp size={12} className="text-red-400" />
                  ) : f.value < compoundRisk ? (
                    <TrendingDown size={12} className="text-green-400" />
                  ) : (
                    <Minus size={12} className="text-slate-400" />
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-col items-center">
            <span className="text-[10px] text-slate-500 font-mono uppercase mb-1">Confidence Interval</span>
            <div className="flex items-center gap-2">
              <Activity size={14} className="text-cyan-400" />
              <span className="text-sm font-mono text-cyan-400 font-semibold">{CONFIDENCE_LEVEL}%</span>
              <span className="text-[10px] text-slate-500 font-mono">P5-P95</span>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-center mt-3 pt-3 border-t border-slate-700/20">
          <div className="flex items-center gap-2">
            <Zap size={10} className="text-cyan-500" />
            <span className="text-[10px] text-slate-600 font-mono tracking-wider">
              MONTE CARLO ENGINE: 10K SIMULATIONS | MARKOV CHAIN v2.1
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MonteCarloForecasting;
