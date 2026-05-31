import { useEffect, useRef } from 'react';
import { Clock } from 'lucide-react';

interface Detection {
  id: string;
  rule_name?: string;
  rule_code?: string;
  rule_category?: string;
  detection_time: string;
  entity_id: string;
  entity_type: string;
  confidence_score: number;
  severity: string;
  status: string;
  observed_event_detail: any;
  missing_event_detail: any;
  physics_violation: any;
  evidence_chain: any[];
}

interface Props {
  detections: Detection[];
  loading: boolean;
}

const CATEGORY_CONFIG: Record<string, { color: string; label: string }> = {
  missing_prerequisite: { color: '#ef4444', label: 'Missing Prerequisite' },
  impossible_coexistence: { color: '#f59e0b', label: 'Impossible Coexistence' },
  missing_consequence: { color: '#06b6d4', label: 'Missing Consequence' },
  temporal_impossibility: { color: '#f97316', label: 'Temporal Impossibility' },
  physics_violation: { color: '#f43f5e', label: 'Physics Violation' },
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function NegativeCorrelationTimeline({ detections, loading }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef(0);
  const frameRef = useRef(0);

  const sorted = [...detections].sort((a, b) =>
    new Date(b.detection_time).getTime() - new Date(a.detection_time).getTime()
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !sorted.length) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.parentElement!.getBoundingClientRect();
    canvas.width = rect.width * 2;
    canvas.height = 200;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = '100px';
    ctx.scale(2, 2);

    const w = rect.width;
    const h = 100;
    const padding = 40;

    const now = Date.now();
    const oldest = Math.min(...sorted.map(d => new Date(d.detection_time).getTime()));
    const range = now - oldest || 1;

    const animate = () => {
      frameRef.current++;
      ctx.clearRect(0, 0, w, h);

      ctx.strokeStyle = 'rgba(100, 116, 139, 0.15)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(padding, h / 2);
      ctx.lineTo(w - padding, h / 2);
      ctx.stroke();

      for (let i = 0; i <= 4; i++) {
        const x = padding + (w - padding * 2) * (i / 4);
        ctx.beginPath();
        ctx.moveTo(x, h / 2 - 3);
        ctx.lineTo(x, h / 2 + 3);
        ctx.stroke();

        const time = new Date(oldest + range * (i / 4));
        ctx.fillStyle = 'rgba(100, 116, 139, 0.4)';
        ctx.font = '8px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), x, h / 2 + 15);
      }

      sorted.forEach((det, i) => {
        const t = new Date(det.detection_time).getTime();
        const x = padding + ((t - oldest) / range) * (w - padding * 2);
        const catColor = CATEGORY_CONFIG[det.rule_category || '']?.color || '#06b6d4';

        const yOffset = (i % 2 === 0 ? -1 : 1) * (15 + (i % 3) * 8);
        const y = h / 2 + yOffset;

        const pulse = Math.sin(frameRef.current * 0.04 + i * 0.7) * 2;
        const severity_r = det.severity === 'critical' ? 6 : det.severity === 'high' ? 5 : 4;

        ctx.beginPath();
        ctx.arc(x, y, severity_r + pulse + 4, 0, Math.PI * 2);
        ctx.fillStyle = catColor + '15';
        ctx.fill();

        ctx.beginPath();
        ctx.arc(x, y, severity_r, 0, Math.PI * 2);
        const grad = ctx.createRadialGradient(x, y, 0, x, y, severity_r);
        grad.addColorStop(0, catColor + 'cc');
        grad.addColorStop(1, catColor + '66');
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.strokeStyle = catColor;
        ctx.lineWidth = 0.5;
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(x, y + (yOffset > 0 ? -severity_r : severity_r));
        ctx.lineTo(x, h / 2);
        ctx.strokeStyle = catColor + '33';
        ctx.lineWidth = 0.5;
        ctx.setLineDash([2, 2]);
        ctx.stroke();
        ctx.setLineDash([]);
      });

      const scanLine = padding + ((frameRef.current * 0.3) % (w - padding * 2));
      ctx.beginPath();
      ctx.moveTo(scanLine, 5);
      ctx.lineTo(scanLine, h - 5);
      ctx.strokeStyle = 'rgba(6, 182, 212, 0.15)';
      ctx.lineWidth = 1;
      ctx.stroke();

      animRef.current = requestAnimationFrame(animate);
    };

    animate();
    return () => cancelAnimationFrame(animRef.current);
  }, [sorted]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40">
        <div className="w-6 h-6 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-slate-950/30 border border-slate-700/20 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <Clock className="w-4 h-4 text-slate-500" />
          <span className="text-xs font-semibold text-slate-400">Detection Timeline</span>
          <span className="text-[10px] text-slate-600 ml-auto">{sorted.length} detections</span>
        </div>
        <canvas ref={canvasRef} className="w-full" />
      </div>

      <div className="space-y-1.5">
        {sorted.slice(0, 8).map(det => {
          const catConfig = CATEGORY_CONFIG[det.rule_category || ''] || { color: '#06b6d4', label: 'Unknown' };
          return (
            <div key={det.id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-slate-900/30 border border-slate-700/10 hover:border-slate-600/30 transition-all">
              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: catConfig.color }} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono" style={{ color: catConfig.color }}>{det.rule_code}</span>
                  <span className="text-xs text-white truncate">{det.rule_name}</span>
                </div>
              </div>
              <span className="text-[10px] text-slate-500 font-mono flex-shrink-0">{det.entity_id}</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded flex-shrink-0 ${
                det.severity === 'critical' ? 'bg-red-500/20 text-red-400' :
                det.severity === 'high' ? 'bg-orange-500/20 text-orange-400' :
                'bg-amber-500/20 text-amber-400'
              }`}>
                {det.severity}
              </span>
              <span className="text-[10px] text-slate-600 flex-shrink-0">{timeAgo(det.detection_time)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
