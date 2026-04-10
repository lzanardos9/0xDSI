import { useEffect, useRef, useState, useCallback } from 'react';
import { Shield, TrendingUp, TrendingDown } from 'lucide-react';

interface Metric {
  label: string;
  value: number;
  weight: number;
}

const INITIAL_METRICS: Metric[] = [
  { label: 'Network Perimeter', value: 78, weight: 0.25 },
  { label: 'Endpoint Hygiene', value: 62, weight: 0.20 },
  { label: 'Identity Risk', value: 44, weight: 0.20 },
  { label: 'Data Exposure', value: 71, weight: 0.20 },
  { label: 'Cloud Posture', value: 55, weight: 0.15 },
];

const getScoreColor = (score: number): string => {
  if (score < 25) return '#22d3ee';
  if (score < 50) return '#3b82f6';
  if (score < 70) return '#eab308';
  if (score < 85) return '#f97316';
  return '#ef4444';
};

const getRiskLabel = (score: number): string => {
  if (score < 25) return 'LOW';
  if (score < 50) return 'MODERATE';
  if (score < 70) return 'ELEVATED';
  if (score < 85) return 'HIGH';
  return 'CRITICAL';
};

const computeComposite = (metrics: Metric[]): number => {
  let total = 0;
  for (const m of metrics) {
    total += m.value * m.weight;
  }
  return Math.round(total * 10) / 10;
};

const easeInOutCubic = (t: number): number => {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
};

const RiskPostureGauge = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const [metrics, setMetrics] = useState<Metric[]>(INITIAL_METRICS);
  const [compositeScore, setCompositeScore] = useState(() => computeComposite(INITIAL_METRICS));
  const [prevScore, setPrevScore] = useState(() => computeComposite(INITIAL_METRICS));
  const [trending, setTrending] = useState<'up' | 'down' | 'flat'>('flat');

  const displayedValueRef = useRef(computeComposite(INITIAL_METRICS));
  const targetValueRef = useRef(computeComposite(INITIAL_METRICS));
  const animStartRef = useRef(0);
  const animFromRef = useRef(computeComposite(INITIAL_METRICS));
  const animDuration = 1800;
  const pulsePhaseRef = useRef(0);

  const updateMetrics = useCallback(() => {
    setMetrics(prev => {
      const next = prev.map(m => ({ ...m }));
      const indices = Array.from({ length: 5 }, (_, i) => i);
      for (let i = indices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [indices[i], indices[j]] = [indices[j], indices[i]];
      }
      const count = 2 + (Math.random() > 0.5 ? 1 : 0);
      for (let i = 0; i < count; i++) {
        const idx = indices[i];
        const delta = (Math.random() * 8 - 4);
        next[idx].value = Math.max(0, Math.min(100, Math.round((next[idx].value + delta) * 10) / 10));
      }
      const newComposite = computeComposite(next);
      setPrevScore(computeComposite(prev));
      setCompositeScore(newComposite);
      return next;
    });
  }, []);

  useEffect(() => {
    const diff = compositeScore - prevScore;
    if (Math.abs(diff) < 0.3) setTrending('flat');
    else if (diff > 0) setTrending('up');
    else setTrending('down');

    animFromRef.current = displayedValueRef.current;
    targetValueRef.current = compositeScore;
    animStartRef.current = performance.now();
  }, [compositeScore, prevScore]);

  useEffect(() => {
    const id = setInterval(updateMetrics, 5000);
    return () => clearInterval(id);
  }, [updateMetrics]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      const rect = canvas.parentElement?.getBoundingClientRect();
      if (rect) {
        canvas.width = rect.width * window.devicePixelRatio;
        canvas.height = rect.height * window.devicePixelRatio;
        canvas.style.width = rect.width + 'px';
        canvas.style.height = rect.height + 'px';
        ctx.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);
      }
    };
    resize();
    window.addEventListener('resize', resize);

    const animate = (timestamp: number) => {
      const rect = canvas.parentElement?.getBoundingClientRect();
      if (!rect) { animRef.current = requestAnimationFrame(animate); return; }
      const w = rect.width;
      const h = rect.height;

      ctx.clearRect(0, 0, w, h);

      const elapsed = timestamp - animStartRef.current;
      const progress = Math.min(1, elapsed / animDuration);
      const eased = easeInOutCubic(progress);
      displayedValueRef.current = animFromRef.current + (targetValueRef.current - animFromRef.current) * eased;
      const currentValue = displayedValueRef.current;

      const cx = w / 2;
      const gaugeTopPadding = 8;
      const outerRadius = Math.min(w * 0.38, 72);
      const cy = gaugeTopPadding + outerRadius + 4;
      const innerRadius = outerRadius * 0.72;
      const startAngle = Math.PI;
      const endAngle = 2 * Math.PI;

      const arcSegments = [
        { start: 0, end: 0.25, color: '#22d3ee' },
        { start: 0.25, end: 0.50, color: '#3b82f6' },
        { start: 0.50, end: 0.70, color: '#eab308' },
        { start: 0.70, end: 0.85, color: '#f97316' },
        { start: 0.85, end: 1.0, color: '#ef4444' },
      ];

      for (const seg of arcSegments) {
        const a1 = startAngle + seg.start * Math.PI;
        const a2 = startAngle + seg.end * Math.PI;
        ctx.beginPath();
        ctx.arc(cx, cy, outerRadius, a1, a2);
        ctx.arc(cx, cy, innerRadius, a2, a1, true);
        ctx.closePath();
        ctx.fillStyle = seg.color + '18';
        ctx.fill();
      }

      const valueAngle = startAngle + (currentValue / 100) * Math.PI;
      const gradientArc = ctx.createLinearGradient(cx - outerRadius, cy, cx + outerRadius, cy);
      gradientArc.addColorStop(0, '#22d3ee');
      gradientArc.addColorStop(0.3, '#3b82f6');
      gradientArc.addColorStop(0.55, '#eab308');
      gradientArc.addColorStop(0.78, '#f97316');
      gradientArc.addColorStop(1, '#ef4444');

      ctx.beginPath();
      ctx.arc(cx, cy, outerRadius, startAngle, valueAngle);
      ctx.arc(cx, cy, innerRadius, valueAngle, startAngle, true);
      ctx.closePath();
      ctx.fillStyle = gradientArc;
      ctx.globalAlpha = 0.5;
      ctx.fill();
      ctx.globalAlpha = 1;

      ctx.strokeStyle = 'rgba(148, 163, 184, 0.08)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, outerRadius + 1, startAngle, endAngle);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, innerRadius - 1, startAngle, endAngle);
      ctx.stroke();

      for (let i = 0; i <= 10; i++) {
        const angle = startAngle + (i / 10) * Math.PI;
        const isMajor = i % 5 === 0;
        const tickOuterR = outerRadius + (isMajor ? 5 : 3);
        const tickInnerR = outerRadius + 1;
        const x1 = cx + Math.cos(angle) * tickInnerR;
        const y1 = cy + Math.sin(angle) * tickInnerR;
        const x2 = cx + Math.cos(angle) * tickOuterR;
        const y2 = cy + Math.sin(angle) * tickOuterR;

        ctx.strokeStyle = isMajor ? 'rgba(148, 163, 184, 0.4)' : 'rgba(148, 163, 184, 0.15)';
        ctx.lineWidth = isMajor ? 1.5 : 1;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();

        if (isMajor) {
          const labelR = outerRadius + 13;
          const lx = cx + Math.cos(angle) * labelR;
          const ly = cy + Math.sin(angle) * labelR;
          ctx.fillStyle = 'rgba(148, 163, 184, 0.5)';
          ctx.font = '8px monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(String(i * 10), lx, ly);
        }
      }

      const needleLength = outerRadius - 4;
      const needleBaseWidth = 3;
      const needleAngle = startAngle + (currentValue / 100) * Math.PI;
      const tipX = cx + Math.cos(needleAngle) * needleLength;
      const tipY = cy + Math.sin(needleAngle) * needleLength;
      const baseLeftAngle = needleAngle + Math.PI / 2;
      const baseRightAngle = needleAngle - Math.PI / 2;
      const blX = cx + Math.cos(baseLeftAngle) * needleBaseWidth;
      const blY = cy + Math.sin(baseLeftAngle) * needleBaseWidth;
      const brX = cx + Math.cos(baseRightAngle) * needleBaseWidth;
      const brY = cy + Math.sin(baseRightAngle) * needleBaseWidth;

      const needleColor = getScoreColor(currentValue);

      ctx.beginPath();
      ctx.moveTo(tipX, tipY);
      ctx.lineTo(blX, blY);
      ctx.lineTo(brX, brY);
      ctx.closePath();

      const needleGrad = ctx.createLinearGradient(cx, cy, tipX, tipY);
      needleGrad.addColorStop(0, 'rgba(148, 163, 184, 0.3)');
      needleGrad.addColorStop(1, needleColor);
      ctx.fillStyle = needleGrad;
      ctx.fill();

      pulsePhaseRef.current += 0.04;
      const glowIntensity = 6 + Math.sin(pulsePhaseRef.current) * 4;
      ctx.shadowColor = needleColor;
      ctx.shadowBlur = glowIntensity;
      ctx.beginPath();
      ctx.arc(tipX, tipY, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = needleColor;
      ctx.fill();
      ctx.shadowBlur = 0;

      ctx.beginPath();
      ctx.arc(tipX, tipY, 5 + Math.sin(pulsePhaseRef.current) * 2, 0, Math.PI * 2);
      ctx.fillStyle = needleColor + '15';
      ctx.fill();

      ctx.beginPath();
      ctx.arc(cx, cy, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#1e293b';
      ctx.fill();
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.3)';
      ctx.lineWidth = 1;
      ctx.stroke();

      const displayVal = Math.round(currentValue);
      ctx.fillStyle = needleColor;
      ctx.font = 'bold 22px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(displayVal), cx, cy - 10);

      const riskLabel = getRiskLabel(currentValue);
      ctx.fillStyle = needleColor + 'aa';
      ctx.font = 'bold 9px monospace';
      ctx.fillText(riskLabel, cx, cy + 4);

      ctx.beginPath();
      ctx.moveTo(cx - outerRadius * 0.6, cy + outerRadius * 0.12);
      ctx.lineTo(cx + outerRadius * 0.6, cy + outerRadius * 0.12);
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.06)';
      ctx.lineWidth = 0.5;
      ctx.stroke();

      animRef.current = requestAnimationFrame(animate);
    };

    animRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener('resize', resize);
    };
  }, []);

  const currentColor = getScoreColor(compositeScore);

  const getBarColor = (value: number): string => {
    if (value < 25) return 'bg-cyan-400';
    if (value < 50) return 'bg-blue-400';
    if (value < 70) return 'bg-yellow-400';
    if (value < 85) return 'bg-orange-400';
    return 'bg-red-400';
  };

  const getBarTrack = (value: number): string => {
    if (value < 25) return 'bg-cyan-400/10';
    if (value < 50) return 'bg-blue-400/10';
    if (value < 70) return 'bg-yellow-400/10';
    if (value < 85) return 'bg-orange-400/10';
    return 'bg-red-400/10';
  };

  const getTextColor = (value: number): string => {
    if (value < 25) return 'text-cyan-400';
    if (value < 50) return 'text-blue-400';
    if (value < 70) return 'text-yellow-400';
    if (value < 85) return 'text-orange-400';
    return 'text-red-400';
  };

  return (
    <div className="relative w-full bg-[#060a14] rounded-xl overflow-hidden border border-slate-800/50">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-slate-800/40">
        <div className="flex items-center gap-2">
          <Shield className="w-3.5 h-3.5" style={{ color: currentColor }} />
          <span className="text-[11px] font-mono font-bold tracking-wider text-slate-200">RISK POSTURE</span>
          <span className="px-1.5 py-0.5 rounded text-[8px] font-mono font-bold border border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
            REAL-TIME
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-mono font-bold" style={{ color: currentColor }}>
            {Math.round(compositeScore)}
          </span>
          {trending === 'up' && <TrendingUp className="w-3.5 h-3.5 text-red-400" />}
          {trending === 'down' && <TrendingDown className="w-3.5 h-3.5 text-cyan-400" />}
          {trending === 'flat' && <span className="text-[10px] text-slate-600 font-mono">&mdash;</span>}
        </div>
      </div>

      <div className="flex" style={{ height: '168px' }}>
        <div className="relative flex-shrink-0" style={{ width: '200px' }}>
          <canvas ref={canvasRef} className="w-full h-full" />
        </div>

        <div className="flex-1 min-w-0 flex flex-col justify-center pr-3 pl-1 gap-1.5">
          {metrics.map((m) => (
            <div key={m.label} className="flex items-center gap-2">
              <span className="text-[9px] font-mono text-slate-500 w-[90px] truncate flex-shrink-0">{m.label}</span>
              <div className={`flex-1 h-[6px] rounded-full ${getBarTrack(m.value)} overflow-hidden`}>
                <div
                  className={`h-full rounded-full ${getBarColor(m.value)} transition-all duration-1000 ease-in-out`}
                  style={{ width: `${m.value}%` }}
                />
              </div>
              <span className={`text-[9px] font-mono font-bold w-[26px] text-right ${getTextColor(m.value)}`}>
                {Math.round(m.value)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default RiskPostureGauge;
