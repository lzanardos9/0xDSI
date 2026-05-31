import { useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight, Clock, MapPin, User, Server, Shield, CheckCircle2, XCircle, HelpCircle, Search, Filter } from 'lucide-react';

interface Detection {
  id: string;
  rule_id: string;
  detection_time: string;
  observed_event_detail: any;
  missing_event_detail: any;
  entity_type: string;
  entity_id: string;
  confidence_score: number;
  severity: string;
  status: string;
  evidence_chain: any[];
  analyst_notes: string;
  time_gap_seconds: number;
  physics_violation: any;
  rule_name?: string;
  rule_code?: string;
  rule_category?: string;
}

interface Props {
  detections: Detection[];
  loading: boolean;
}

const STATUS_CONFIG: Record<string, { label: string; icon: typeof AlertTriangle; color: string; bg: string }> = {
  open: { label: 'Open', icon: AlertTriangle, color: 'text-red-400', bg: 'bg-red-500/20 border-red-500/30' },
  investigating: { label: 'Investigating', icon: Search, color: 'text-amber-400', bg: 'bg-amber-500/20 border-amber-500/30' },
  confirmed: { label: 'Confirmed', icon: XCircle, color: 'text-red-500', bg: 'bg-red-500/30 border-red-500/40' },
  false_positive: { label: 'False Positive', icon: CheckCircle2, color: 'text-slate-400', bg: 'bg-slate-500/20 border-slate-500/30' },
  resolved: { label: 'Resolved', icon: CheckCircle2, color: 'text-emerald-400', bg: 'bg-emerald-500/20 border-emerald-500/30' },
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'border-l-red-500',
  high: 'border-l-orange-500',
  medium: 'border-l-amber-500',
  low: 'border-l-emerald-500',
};

const ENTITY_ICONS: Record<string, typeof User> = {
  user: User,
  host: Server,
  service: Shield,
  network: MapPin,
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function formatGapTime(seconds: number): string {
  if (seconds === 0) return 'N/A';
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} minutes`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)} hours`;
  return `${Math.round(seconds / 86400)} days`;
}

export default function NegativeCorrelationDetections({ detections, loading }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [severityFilter, setSeverityFilter] = useState<string | null>(null);

  const filtered = detections.filter(d => {
    if (statusFilter && d.status !== statusFilter) return false;
    if (severityFilter && d.severity !== severityFilter) return false;
    return true;
  });

  const statusCounts = detections.reduce((acc, d) => {
    acc[d.status] = (acc[d.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-slate-500" />
          <span className="text-xs text-slate-500">Status:</span>
          {['open', 'investigating', 'confirmed', 'resolved'].map(s => {
            const cfg = STATUS_CONFIG[s];
            return (
              <button
                key={s}
                onClick={() => setStatusFilter(statusFilter === s ? null : s)}
                className={`text-[10px] px-2 py-1 rounded border transition-all ${
                  statusFilter === s ? cfg.bg : 'bg-slate-800/50 border-slate-700/30 text-slate-500 hover:text-slate-300'
                } ${statusFilter === s ? cfg.color : ''}`}
              >
                {cfg.label} ({statusCounts[s] || 0})
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <span className="text-xs text-slate-500">Severity:</span>
          {['critical', 'high', 'medium'].map(s => (
            <button
              key={s}
              onClick={() => setSeverityFilter(severityFilter === s ? null : s)}
              className={`text-[10px] px-2 py-1 rounded border transition-all ${
                severityFilter === s
                  ? s === 'critical' ? 'bg-red-500/20 border-red-500/30 text-red-400'
                    : s === 'high' ? 'bg-orange-500/20 border-orange-500/30 text-orange-400'
                    : 'bg-amber-500/20 border-amber-500/30 text-amber-400'
                  : 'bg-slate-800/50 border-slate-700/30 text-slate-500 hover:text-slate-300'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        {filtered.map(detection => {
          const isExpanded = expandedId === detection.id;
          const statusCfg = STATUS_CONFIG[detection.status] || STATUS_CONFIG.open;
          const StatusIcon = statusCfg.icon;
          const EntityIcon = ENTITY_ICONS[detection.entity_type] || User;
          const hasPhysics = detection.physics_violation && Object.keys(detection.physics_violation).length > 0;

          return (
            <div
              key={detection.id}
              className={`border-l-2 ${SEVERITY_COLORS[detection.severity]} bg-slate-900/40 border border-slate-700/20 rounded-r-xl overflow-hidden transition-all ${
                isExpanded ? 'ring-1 ring-cyan-500/20' : 'hover:border-slate-600/40'
              }`}
            >
              <button
                onClick={() => setExpandedId(isExpanded ? null : detection.id)}
                className="w-full flex items-start gap-3 p-4 text-left"
              >
                <div className="flex-shrink-0 mt-0.5">
                  <div className={`w-2 h-2 rounded-full ${
                    detection.severity === 'critical' ? 'bg-red-500 animate-pulse' :
                    detection.severity === 'high' ? 'bg-orange-500' : 'bg-amber-500'
                  }`} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-mono text-cyan-400">{detection.rule_code}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border ${statusCfg.bg} ${statusCfg.color}`}>
                      {statusCfg.label}
                    </span>
                    <span className="text-[10px] text-slate-600">{timeAgo(detection.detection_time)}</span>
                  </div>
                  <p className="text-sm font-medium text-white">{detection.rule_name}</p>
                  <div className="flex items-center gap-3 mt-1">
                    <div className="flex items-center gap-1">
                      <EntityIcon className="w-3 h-3 text-slate-500" />
                      <span className="text-xs text-slate-400 font-mono">{detection.entity_id}</span>
                    </div>
                    {hasPhysics && detection.physics_violation.impossibility_factor && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-950/50 text-rose-400 border border-rose-500/20">
                        {detection.physics_violation.impossibility_factor}x impossible
                      </span>
                    )}
                    <span className="text-[10px] text-slate-600">
                      Confidence: {detection.confidence_score}%
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <div className="w-16 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        detection.confidence_score >= 95 ? 'bg-red-500' :
                        detection.confidence_score >= 85 ? 'bg-orange-500' : 'bg-amber-500'
                      }`}
                      style={{ width: `${detection.confidence_score}%` }}
                    />
                  </div>
                  {isExpanded ? <ChevronDown className="w-4 h-4 text-slate-500" /> : <ChevronRight className="w-4 h-4 text-slate-500" />}
                </div>
              </button>

              {isExpanded && (
                <div className="px-4 pb-4 space-y-4 border-t border-slate-700/20 pt-4">
                  {hasPhysics && detection.physics_violation.distance_km && (
                    <div className="bg-rose-950/20 border border-rose-500/15 rounded-xl p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <MapPin className="w-4 h-4 text-rose-400" />
                        <span className="text-xs font-semibold text-rose-400">Physics Violation Analysis</span>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div>
                          <p className="text-[10px] text-slate-500">Distance</p>
                          <p className="text-sm font-bold text-white">{detection.physics_violation.distance_km?.toLocaleString()} km</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-slate-500">Time Gap</p>
                          <p className="text-sm font-bold text-white">{detection.physics_violation.time_gap_minutes} min</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-slate-500">Required Speed</p>
                          <p className="text-sm font-bold text-red-400">{detection.physics_violation.required_speed_kmh?.toLocaleString()} km/h</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-slate-500">Impossibility</p>
                          <p className="text-sm font-bold text-red-400">{detection.physics_violation.impossibility_factor}x</p>
                        </div>
                      </div>
                      {detection.physics_violation.conclusion && (
                        <p className="text-xs text-rose-300/80 mt-3 bg-rose-950/30 p-2 rounded">{detection.physics_violation.conclusion}</p>
                      )}
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="bg-slate-950/50 rounded-lg p-3 border border-emerald-500/10">
                      <p className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wider mb-2">What Was Observed</p>
                      <pre className="text-[11px] text-slate-300 whitespace-pre-wrap font-mono max-h-40 overflow-y-auto">
                        {JSON.stringify(detection.observed_event_detail, null, 2)}
                      </pre>
                    </div>
                    <div className="bg-slate-950/50 rounded-lg p-3 border border-red-500/10">
                      <p className="text-[10px] font-semibold text-red-400 uppercase tracking-wider mb-2">What Was Missing</p>
                      <pre className="text-[11px] text-slate-300 whitespace-pre-wrap font-mono max-h-40 overflow-y-auto">
                        {JSON.stringify(detection.missing_event_detail, null, 2)}
                      </pre>
                    </div>
                  </div>

                  {detection.evidence_chain.length > 0 && (
                    <div className="bg-slate-950/50 rounded-xl p-4 border border-slate-700/20">
                      <p className="text-[10px] font-semibold text-cyan-400 uppercase tracking-wider mb-3">Evidence Chain</p>
                      <div className="relative">
                        <div className="absolute left-[7px] top-2 bottom-2 w-px bg-gradient-to-b from-cyan-500/40 via-cyan-500/20 to-transparent" />
                        <div className="space-y-2.5">
                          {detection.evidence_chain.map((ev: any, i: number) => (
                            <div key={i} className="flex items-start gap-3 pl-0.5">
                              <div className="relative z-10 w-3.5 h-3.5 rounded-full bg-slate-900 border border-cyan-500/40 flex items-center justify-center flex-shrink-0 mt-0.5">
                                <div className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] font-mono text-cyan-400/70">{ev.source}</span>
                                  <span className="text-[10px] text-slate-600">{ev.time}</span>
                                </div>
                                <p className="text-xs text-slate-300 mt-0.5">{ev.detail}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {detection.time_gap_seconds > 0 && (
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <Clock className="w-3 h-3" />
                      <span>Absence duration: <span className="text-white font-medium">{formatGapTime(detection.time_gap_seconds)}</span></span>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-slate-500">
          <HelpCircle className="w-8 h-8 mb-2" />
          <p className="text-sm">No detections match your filters</p>
        </div>
      )}
    </div>
  );
}
