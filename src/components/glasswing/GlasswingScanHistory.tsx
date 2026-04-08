import { useEffect, useRef } from 'react';
import { Clock, CheckCircle, AlertTriangle, Loader, Target } from 'lucide-react';

interface Scan {
  id: string;
  scan_name: string;
  target_type: string;
  target_identifier: string;
  model_used: string;
  status: string;
  progress: number;
  findings_summary: { critical?: number; high?: number; medium?: number; low?: number; total?: number };
  started_at: string;
  completed_at: string;
  created_at: string;
}

interface GlasswingScanHistoryProps {
  scans: Scan[];
  loading: boolean;
  onSelectScan: (scanId: string) => void;
  selectedScanId: string | null;
}

export default function GlasswingScanHistory({ scans, loading, onSelectScan, selectedScanId }: GlasswingScanHistoryProps) {
  const chartRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = chartRef.current;
    if (!canvas || !scans.length) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = 2;
    const rect = canvas.parentElement!.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = 160 * dpr;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = '160px';
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = 160;
    const padding = { top: 20, right: 20, bottom: 30, left: 40 };
    const chartW = w - padding.left - padding.right;
    const chartH = h - padding.top - padding.bottom;

    const completedScans = scans
      .filter(s => s.status === 'completed' && s.findings_summary?.total)
      .sort((a, b) => new Date(a.completed_at).getTime() - new Date(b.completed_at).getTime());

    if (!completedScans.length) return;

    const maxTotal = Math.max(...completedScans.map(s => s.findings_summary.total || 0));
    const yScale = chartH / (maxTotal * 1.2 || 1);

    ctx.strokeStyle = 'rgba(100, 116, 139, 0.15)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = padding.top + chartH - (chartH / 4) * i;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(w - padding.right, y);
      ctx.stroke();
      ctx.fillStyle = '#475569';
      ctx.font = '9px Inter, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(String(Math.round((maxTotal * 1.2 / 4) * i)), padding.left - 6, y + 3);
    }

    const barWidth = Math.min(50, chartW / completedScans.length - 8);
    const gap = (chartW - barWidth * completedScans.length) / (completedScans.length + 1);

    completedScans.forEach((scan, i) => {
      const x = padding.left + gap + i * (barWidth + gap);
      const summary = scan.findings_summary;
      const segments = [
        { count: summary.critical || 0, color: '#ef4444' },
        { count: summary.high || 0, color: '#f97316' },
        { count: summary.medium || 0, color: '#f59e0b' },
        { count: summary.low || 0, color: '#10b981' },
      ];

      let currentY = padding.top + chartH;
      segments.forEach(seg => {
        if (seg.count <= 0) return;
        const segH = seg.count * yScale;
        currentY -= segH;

        ctx.fillStyle = seg.color + '99';
        ctx.beginPath();
        ctx.roundRect(x, currentY, barWidth, segH, [seg === segments[0] && currentY === padding.top + chartH - (summary.total || 0) * yScale ? 3 : 0, seg === segments[0] && currentY === padding.top + chartH - (summary.total || 0) * yScale ? 3 : 0, 0, 0]);
        ctx.fill();

        if (scan.id === selectedScanId) {
          ctx.strokeStyle = '#06b6d4';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      });

      ctx.fillStyle = '#64748b';
      ctx.font = '8px Inter, sans-serif';
      ctx.textAlign = 'center';
      const label = scan.scan_name.split(' ')[0];
      ctx.fillText(label, x + barWidth / 2, padding.top + chartH + 15);

      ctx.fillStyle = '#94a3b8';
      ctx.font = 'bold 9px Inter, sans-serif';
      ctx.fillText(String(summary.total || 0), x + barWidth / 2, currentY - 5);
    });
  }, [scans, selectedScanId]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />;
      case 'scanning':
      case 'analyzing':
      case 'initializing': return <Loader className="w-3.5 h-3.5 text-cyan-400 animate-spin" />;
      case 'failed': return <AlertTriangle className="w-3.5 h-3.5 text-red-400" />;
      default: return <Clock className="w-3.5 h-3.5 text-slate-400" />;
    }
  };

  const formatDuration = (start: string, end: string) => {
    if (!start || !end) return 'In progress';
    const ms = new Date(end).getTime() - new Date(start).getTime();
    const hours = Math.floor(ms / 3600000);
    const mins = Math.floor((ms % 3600000) / 60000);
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="bg-slate-900/30 border border-slate-700/30 rounded-xl p-4">
        <h4 className="text-xs font-medium text-slate-400 mb-3">Findings by Scan</h4>
        <canvas ref={chartRef} />
        <div className="flex items-center justify-center gap-4 mt-2">
          {[
            { label: 'Critical', color: 'bg-red-500' },
            { label: 'High', color: 'bg-orange-500' },
            { label: 'Medium', color: 'bg-amber-500' },
            { label: 'Low', color: 'bg-emerald-500' },
          ].map(item => (
            <div key={item.label} className="flex items-center gap-1">
              <div className={`w-2 h-2 rounded-sm ${item.color}`} />
              <span className="text-[10px] text-slate-500">{item.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        {scans.map(scan => {
          const isSelected = scan.id === selectedScanId;
          const summary = scan.findings_summary || {};
          return (
            <button
              key={scan.id}
              onClick={() => onSelectScan(scan.id)}
              className={`w-full text-left p-3.5 rounded-xl border transition-all ${
                isSelected
                  ? 'border-cyan-500/40 bg-cyan-950/20 shadow-lg shadow-cyan-500/5'
                  : 'border-slate-700/30 bg-slate-900/20 hover:bg-slate-800/30 hover:border-slate-600/40'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-2.5">
                  {getStatusIcon(scan.status)}
                  <div>
                    <p className={`text-sm font-medium ${isSelected ? 'text-cyan-400' : 'text-white'}`}>{scan.scan_name}</p>
                    <p className="text-xs text-slate-500 font-mono mt-0.5">{scan.target_identifier}</p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800/80 text-slate-400">{scan.target_type}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800/80 text-slate-400 font-mono">{scan.model_used}</span>
                      {scan.started_at && scan.completed_at && (
                        <span className="text-[10px] text-slate-600">
                          {formatDuration(scan.started_at, scan.completed_at)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {(summary.critical || 0) > 0 && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-950/50 text-red-400 font-bold">{summary.critical}C</span>
                  )}
                  {(summary.high || 0) > 0 && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-950/50 text-orange-400 font-bold">{summary.high}H</span>
                  )}
                  {(summary.medium || 0) > 0 && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-950/50 text-amber-400">{summary.medium}M</span>
                  )}
                  {(summary.low || 0) > 0 && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-950/50 text-emerald-400">{summary.low}L</span>
                  )}
                </div>
              </div>

              {scan.status !== 'completed' && scan.status !== 'failed' && scan.status !== 'queued' && (
                <div className="mt-2.5">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] text-slate-500">{scan.status}</span>
                    <span className="text-[10px] text-cyan-400 font-mono">{scan.progress}%</span>
                  </div>
                  <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-cyan-500 rounded-full transition-all duration-1000"
                      style={{ width: `${scan.progress}%` }}
                    />
                  </div>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
