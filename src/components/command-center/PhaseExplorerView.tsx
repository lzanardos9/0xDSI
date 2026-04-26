import { useState, useMemo, useEffect } from 'react';
import {
  ArrowRight,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Activity,
  Clock,
  Zap,
  ChevronRight,
  Cpu,
  Database,
  Layers,
  Search,
  Target,
  GitBranch,
  Shield,
  Sparkles,
  Compass,
  Brain,
  Bot,
  User,
  Cog,
} from 'lucide-react';
import { FUNNEL_PHASES, MOCK_EVENTS, CONNECTOR_META, FunnelEvent } from './eventFunnelData';
import { useLiveStream, seedToFunnelEvent } from './liveEventStream';
import {
  PHASE_EXPLANATIONS,
  buildEventNarrative,
  PhaseAgent,
  PROMOTION_MILESTONES,
  getPromotionForPhase,
} from './phaseExplanations';
import { Bell, Briefcase } from 'lucide-react';

const AGENT_TYPE_META: Record<PhaseAgent['type'], { label: string; color: string; icon: typeof Bot }> = {
  deterministic: { label: 'DETERMINISTIC', color: '#64748b', icon: Cog },
  ml: { label: 'ML', color: '#06b6d4', icon: Brain },
  llm: { label: 'LLM', color: '#22c55e', icon: Sparkles },
  hybrid: { label: 'HYBRID', color: '#eab308', icon: Bot },
  'human-in-loop': { label: 'HUMAN-IN-LOOP', color: '#f97316', icon: User },
};

const PHASE_ICONS: Record<number, typeof Database> = {
  1: Database,
  2: Cpu,
  3: Layers,
  4: GitBranch,
  5: Target,
  6: Search,
  7: Compass,
  8: Shield,
  9: Sparkles,
  10: Zap,
  11: Brain,
};

const SEVERITY_COLORS: Record<string, string> = {
  info: '#06b6d4',
  low: '#22d3ee',
  medium: '#eab308',
  high: '#f97316',
  critical: '#ef4444',
};

const VERDICT_COLORS: Record<string, string> = {
  pending: '#64748b',
  benign: '#22c55e',
  suspicious: '#eab308',
  threat: '#f97316',
  critical_threat: '#ef4444',
};

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export default function PhaseExplorerView() {
  const [selectedPhaseId, setSelectedPhaseId] = useState<number>(1);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  const { lastBatch } = useLiveStream(160);
  const [liveEvents, setLiveEvents] = useState<FunnelEvent[]>(() => [...MOCK_EVENTS]);

  useEffect(() => {
    if (lastBatch.length === 0) return;
    setLiveEvents(prev => {
      let updated = prev.map(e =>
        Math.random() < 0.12 && e.currentPhase < 11 ? { ...e, currentPhase: e.currentPhase + 1 } : e
      );
      updated = [...updated, ...lastBatch.map(seedToFunnelEvent)];
      if (updated.length > 160) updated = updated.slice(updated.length - 160);
      return updated;
    });
  }, [lastBatch]);

  const selectedPhase = useMemo(
    () => FUNNEL_PHASES.find((p) => p.id === selectedPhaseId)!,
    [selectedPhaseId],
  );
  const explanation = PHASE_EXPLANATIONS[selectedPhaseId];

  const eventsAtPhase = useMemo(
    () => liveEvents.filter((e) => e.currentPhase === selectedPhaseId),
    [liveEvents, selectedPhaseId],
  );

  const selectedEvent = useMemo(
    () => eventsAtPhase.find((e) => e.id === selectedEventId) ?? null,
    [eventsAtPhase, selectedEventId],
  );

  const handleSelectPhase = (id: number) => {
    setSelectedPhaseId(id);
    setSelectedEventId(null);
  };

  return (
    <div className="bg-[#070b14] text-slate-200 min-h-[800px] p-6">
      <div className="mb-5">
        <div className="flex items-center gap-2 mb-1">
          <Search size={14} className="text-cyan-400" />
          <span className="text-[10px] font-mono font-bold tracking-[0.25em] text-cyan-400">
            PHASE EXPLORER
          </span>
        </div>
        <h2 className="text-xl font-bold text-slate-100 tracking-tight">
          Per-event explainability across the 11-phase pipeline
        </h2>
        <p className="text-xs text-slate-400 mt-1 max-w-3xl">
          Click any phase below to filter the live event stream to only events currently being
          evaluated at that phase. Click an event to see exactly what is being done to it, in plain
          language, right now.
        </p>
      </div>

      {/* Promotion legend */}
      <div className="flex items-center gap-2 mb-3 text-[10px] font-mono">
        <span className="text-slate-500 tracking-widest">PIPELINE MILESTONES:</span>
        {PROMOTION_MILESTONES.map((m) => (
          <span
            key={m.phaseId}
            className="flex items-center gap-1 px-2 py-1 rounded border"
            style={{
              backgroundColor: m.artifact === 'alert' ? 'rgba(245, 158, 11, 0.08)' : 'rgba(34, 197, 94, 0.08)',
              borderColor: m.artifact === 'alert' ? 'rgba(245, 158, 11, 0.4)' : 'rgba(34, 197, 94, 0.4)',
              color: m.artifact === 'alert' ? '#fbbf24' : '#4ade80',
            }}
          >
            {m.artifact === 'alert' ? <Bell size={10} /> : <Briefcase size={10} />}
            <span className="font-bold tracking-wider">{m.label}</span>
            <span className="text-slate-500">@ phase {m.phaseId}</span>
          </span>
        ))}
      </div>

      {/* Phase rail */}
      <div className="grid grid-cols-11 gap-2 mb-6">
        {FUNNEL_PHASES.map((phase) => {
          const Icon = PHASE_ICONS[phase.id];
          const isActive = selectedPhaseId === phase.id;
          const phaseEventCount = liveEvents.filter((e) => e.currentPhase === phase.id).length;
          const promotion = getPromotionForPhase(phase.id);
          return (
            <button
              key={phase.id}
              onClick={() => handleSelectPhase(phase.id)}
              className={`relative group rounded-lg border p-3 text-left transition-all duration-200 ${
                isActive
                  ? 'border-transparent shadow-lg'
                  : 'border-[#1e293b] hover:border-[#334155]'
              }`}
              style={{
                backgroundColor: isActive ? hexToRgba(phase.color, 0.15) : '#0a0e1a',
                borderColor: isActive ? phase.color : undefined,
                boxShadow: isActive ? `0 0 24px ${hexToRgba(phase.color, 0.35)}` : undefined,
              }}
            >
              <div className="flex items-center justify-between mb-2">
                <div
                  className="w-7 h-7 rounded-md flex items-center justify-center font-mono font-bold text-[11px]"
                  style={{
                    backgroundColor: hexToRgba(phase.color, isActive ? 0.3 : 0.12),
                    color: phase.color,
                  }}
                >
                  {phase.id}
                </div>
                <Icon size={14} style={{ color: phase.color }} />
              </div>
              <div
                className="text-[10px] font-mono font-bold tracking-wider mb-1"
                style={{ color: isActive ? phase.color : '#cbd5e1' }}
              >
                {phase.shortName}
              </div>
              <div className="flex items-center gap-1 text-[9px] font-mono text-slate-500">
                <Activity size={9} />
                <span>{phaseEventCount} live</span>
              </div>
              {promotion && (
                <div
                  className="absolute -top-2 -right-2 flex items-center gap-1 px-1.5 py-0.5 rounded text-[8px] font-mono font-bold tracking-wider"
                  style={{
                    backgroundColor: promotion.artifact === 'alert' ? '#f59e0b' : '#22c55e',
                    color: '#0a0e1a',
                    boxShadow: `0 0 12px ${promotion.artifact === 'alert' ? 'rgba(245, 158, 11, 0.6)' : 'rgba(34, 197, 94, 0.6)'}`,
                  }}
                >
                  {promotion.artifact === 'alert' ? <Bell size={8} /> : <Briefcase size={8} />}
                  {promotion.artifact === 'alert' ? 'ALERT' : 'CASE'}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Promotion banner if this phase births an alert/case */}
      {(() => {
        const promotion = getPromotionForPhase(selectedPhaseId);
        if (!promotion) return null;
        const isAlert = promotion.artifact === 'alert';
        return (
          <div
            className="rounded-lg border p-3 mb-4 flex items-start gap-3"
            style={{
              backgroundColor: isAlert ? 'rgba(245, 158, 11, 0.08)' : 'rgba(34, 197, 94, 0.08)',
              borderColor: isAlert ? 'rgba(245, 158, 11, 0.5)' : 'rgba(34, 197, 94, 0.5)',
            }}
          >
            <div
              className="w-9 h-9 rounded-md flex items-center justify-center flex-shrink-0"
              style={{
                backgroundColor: isAlert ? 'rgba(245, 158, 11, 0.2)' : 'rgba(34, 197, 94, 0.2)',
                color: isAlert ? '#fbbf24' : '#4ade80',
              }}
            >
              {isAlert ? <Bell size={16} /> : <Briefcase size={16} />}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span
                  className="text-[10px] font-mono font-bold tracking-widest"
                  style={{ color: isAlert ? '#fbbf24' : '#4ade80' }}
                >
                  THIS IS WHERE A {promotion.label} HAPPENS
                </span>
              </div>
              <div className="text-[11px] text-slate-300 leading-snug mb-1.5">
                <span className="font-mono font-bold text-slate-400">TRIGGER: </span>
                {promotion.trigger}
              </div>
              <div className="text-[11px] text-slate-300 leading-snug">{promotion.detail}</div>
            </div>
          </div>
        );
      })()}

      {/* Phase context strip */}
      <div
        className="rounded-lg border p-4 mb-5"
        style={{
          backgroundColor: hexToRgba(selectedPhase.color, 0.06),
          borderColor: hexToRgba(selectedPhase.color, 0.4),
        }}
      >
        <div className="flex items-start justify-between gap-6 mb-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span
                className="text-[10px] font-mono font-bold tracking-widest"
                style={{ color: selectedPhase.color }}
              >
                PHASE {selectedPhase.id} OF 11 — {selectedPhase.shortName}
              </span>
            </div>
            <h3 className="text-lg font-bold text-slate-100">{selectedPhase.name}</h3>
            <p className="text-sm text-slate-300 mt-1.5 leading-relaxed">
              {explanation.whatItDoes}
            </p>
          </div>
          <div className="flex items-center gap-4 text-[10px] font-mono">
            <div className="text-center">
              <div className="text-slate-500 tracking-wider">ACTIVE</div>
              <div className="text-slate-100 font-bold text-base">
                {selectedPhase.activeEvents.toLocaleString()}
              </div>
            </div>
            <div className="text-center">
              <div className="text-slate-500 tracking-wider">DROPPED</div>
              <div className="text-slate-100 font-bold text-base">
                {selectedPhase.droppedEvents.toLocaleString()}
              </div>
            </div>
            <div className="text-center">
              <div className="text-slate-500 tracking-wider">LATENCY</div>
              <div className="text-slate-100 font-bold text-base">
                {selectedPhase.avgLatencyMs}ms
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-3">
          <ExplainBlock label="INPUTS" items={explanation.inputs} accent={selectedPhase.color} />
          <ExplainBlock
            label="OPERATIONS"
            items={explanation.operations}
            accent={selectedPhase.color}
          />
          <ExplainBlock label="OUTPUTS" items={explanation.outputs} accent={selectedPhase.color} />
          <div className="space-y-2">
            <div
              className="rounded border p-2.5"
              style={{
                backgroundColor: 'rgba(34, 197, 94, 0.06)',
                borderColor: 'rgba(34, 197, 94, 0.25)',
              }}
            >
              <div className="flex items-center gap-1.5 mb-1">
                <CheckCircle size={10} className="text-green-400" />
                <span className="text-[9px] font-mono font-bold tracking-wider text-green-400">
                  PASS WHEN
                </span>
              </div>
              <p className="text-[10px] text-slate-300 leading-snug">{explanation.passCriteria}</p>
            </div>
            <div
              className="rounded border p-2.5"
              style={{
                backgroundColor: 'rgba(239, 68, 68, 0.06)',
                borderColor: 'rgba(239, 68, 68, 0.25)',
              }}
            >
              <div className="flex items-center gap-1.5 mb-1">
                <XCircle size={10} className="text-red-400" />
                <span className="text-[9px] font-mono font-bold tracking-wider text-red-400">
                  DROP WHEN
                </span>
              </div>
              <p className="text-[10px] text-slate-300 leading-snug">{explanation.dropCriteria}</p>
            </div>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-[#1e293b]">
          <div className="flex items-center gap-2 mb-2">
            <Bot size={11} style={{ color: selectedPhase.color }} />
            <span
              className="text-[9px] font-mono font-bold tracking-widest"
              style={{ color: selectedPhase.color }}
            >
              AGENTS RUNNING AT THIS PHASE
            </span>
            <span className="text-[9px] font-mono text-slate-500">
              ({explanation.agents.length})
            </span>
          </div>
          {explanation.agents.length === 0 ? (
            <p className="text-[10px] text-slate-500 italic">
              No autonomous agent — this phase is pure deterministic processing.
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {explanation.agents.map((agent, i) => (
                <AgentBadge key={i} agent={agent} accent={selectedPhase.color} />
              ))}
            </div>
          )}
        </div>

        <div className="mt-3 pt-3 border-t border-[#1e293b]">
          <div className="flex items-start gap-3 text-[10px]">
            <div className="flex-1">
              <span className="font-mono font-bold tracking-wider text-slate-400">
                TECHNICAL:{' '}
              </span>
              <span className="text-slate-300">{explanation.technicalDetail}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Two column: events list + per-event narrative */}
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-5">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Activity size={12} className="text-slate-400" />
              <span className="text-[10px] font-mono font-bold tracking-widest text-slate-300">
                LIVE EVENTS AT {selectedPhase.shortName}
              </span>
            </div>
            <span className="text-[10px] font-mono text-slate-500">
              {eventsAtPhase.length} events
            </span>
          </div>

          <div className="space-y-1.5 max-h-[560px] overflow-y-auto pr-1">
            {eventsAtPhase.length === 0 ? (
              <div className="rounded-lg border border-dashed border-[#1e293b] p-8 text-center">
                <p className="text-xs text-slate-500">
                  No events currently at this phase in the sample window.
                </p>
                <p className="text-[10px] text-slate-600 mt-2">
                  Try a different phase to see live event evaluation.
                </p>
              </div>
            ) : (
              eventsAtPhase.map((event) => {
                const meta = CONNECTOR_META[event.connector];
                const isSelected = selectedEventId === event.id;
                return (
                  <button
                    key={event.id}
                    onClick={() => setSelectedEventId(event.id)}
                    className={`w-full text-left rounded-lg border p-2.5 transition-all duration-150 ${
                      isSelected
                        ? 'border-cyan-400/60 bg-cyan-500/5'
                        : 'border-[#1e293b] hover:border-[#334155] bg-[#0a0e1a]'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <span
                          className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold"
                          style={{
                            backgroundColor: hexToRgba(meta.color, 0.15),
                            color: meta.color,
                          }}
                        >
                          {event.connector}
                        </span>
                        <span className="text-[10px] font-mono text-slate-300">{event.id}</span>
                      </div>
                      <span
                        className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold tracking-wider uppercase"
                        style={{
                          backgroundColor: hexToRgba(SEVERITY_COLORS[event.severity], 0.12),
                          color: SEVERITY_COLORS[event.severity],
                        }}
                      >
                        {event.severity}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-200 mb-1 truncate">
                      {event.eventType}
                    </div>
                    <div className="flex items-center gap-1.5 text-[9px] font-mono text-slate-500">
                      <span>{event.sourceIP}</span>
                      <ArrowRight size={8} />
                      <span>{event.destIP}</span>
                      <span className="text-slate-600">·</span>
                      <span>{event.protocol}/{event.port}</span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Per-event narrative */}
        <div className="col-span-7">
          <div className="flex items-center gap-2 mb-2">
            <ChevronRight size={12} className="text-slate-400" />
            <span className="text-[10px] font-mono font-bold tracking-widest text-slate-300">
              WHAT IS HAPPENING TO THIS EVENT
            </span>
          </div>

          {!selectedEvent ? (
            <div className="rounded-lg border border-dashed border-[#1e293b] bg-[#0a0e1a] p-12 text-center">
              <Search size={28} className="mx-auto mb-3 text-slate-600" />
              <p className="text-sm text-slate-300 font-bold">Select an event to inspect</p>
              <p className="text-[11px] text-slate-500 mt-1.5 max-w-md mx-auto">
                Pick any event from the list. You will see exactly what {selectedPhase.shortName} is
                doing to it, why it will pass or drop, and what comes next.
              </p>
            </div>
          ) : (
            <EventInspector event={selectedEvent} phaseId={selectedPhaseId} />
          )}
        </div>
      </div>
    </div>
  );
}

function AgentBadge({ agent, accent }: { agent: PhaseAgent; accent: string }) {
  const meta = AGENT_TYPE_META[agent.type];
  const Icon = meta.icon;
  return (
    <div
      className="rounded border p-2.5 transition-all hover:border-slate-500"
      style={{
        backgroundColor: hexToRgba(accent, 0.04),
        borderColor: hexToRgba(accent, 0.25),
      }}
    >
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <Icon size={11} style={{ color: meta.color }} />
          <span className="text-[10px] font-bold text-slate-100 truncate">{agent.name}</span>
        </div>
        {agent.ownsDecision && (
          <span
            className="px-1 py-0.5 rounded text-[8px] font-mono font-bold tracking-wider whitespace-nowrap"
            style={{
              backgroundColor: 'rgba(34, 197, 94, 0.12)',
              color: '#4ade80',
            }}
            title="This agent owns a pass/drop or action decision at this phase"
          >
            DECIDES
          </span>
        )}
      </div>
      <p className="text-[10px] text-slate-300 leading-snug mb-1.5">{agent.role}</p>
      <div className="flex items-center justify-between gap-2 text-[8px] font-mono">
        <span
          className="px-1 py-0.5 rounded font-bold tracking-wider"
          style={{
            backgroundColor: hexToRgba(meta.color, 0.12),
            color: meta.color,
          }}
        >
          {meta.label}
        </span>
        <span className="text-slate-500 truncate" title={agent.cadence}>{agent.cadence}</span>
      </div>
    </div>
  );
}

function ExplainBlock({
  label,
  items,
  accent,
}: {
  label: string;
  items: string[];
  accent: string;
}) {
  return (
    <div
      className="rounded border p-2.5"
      style={{
        backgroundColor: 'rgba(10, 14, 26, 0.5)',
        borderColor: hexToRgba(accent, 0.25),
      }}
    >
      <div
        className="text-[9px] font-mono font-bold tracking-wider mb-1.5"
        style={{ color: accent }}
      >
        {label}
      </div>
      <ul className="space-y-1">
        {items.map((item, i) => (
          <li key={i} className="text-[10px] text-slate-300 leading-snug flex gap-1.5">
            <span style={{ color: accent }}>·</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function EventInspector({ event, phaseId }: { event: FunnelEvent; phaseId: number }) {
  const meta = CONNECTOR_META[event.connector];
  const phase = FUNNEL_PHASES.find((p) => p.id === phaseId)!;
  const explanation = PHASE_EXPLANATIONS[phaseId];
  const narrative = buildEventNarrative(event, phaseId);

  return (
    <div className="rounded-lg border border-[#1e293b] bg-[#0a0e1a] overflow-hidden">
      {/* Header */}
      <div
        className="px-4 py-3 border-b border-[#1e293b]"
        style={{ backgroundColor: hexToRgba(phase.color, 0.06) }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span
              className="px-2 py-1 rounded text-[10px] font-mono font-bold"
              style={{
                backgroundColor: hexToRgba(meta.color, 0.15),
                color: meta.color,
              }}
            >
              {event.connector}
            </span>
            <span className="text-sm font-mono font-bold text-slate-100">{event.id}</span>
            <span className="text-[10px] font-mono text-slate-500">{event.timestamp}</span>
          </div>
          <span
            className="px-2 py-1 rounded text-[10px] font-mono font-bold tracking-wider uppercase"
            style={{
              backgroundColor: hexToRgba(VERDICT_COLORS[event.finalVerdict], 0.15),
              color: VERDICT_COLORS[event.finalVerdict],
            }}
          >
            {event.finalVerdict.replace('_', ' ')}
          </span>
        </div>
        <div className="mt-2 text-[12px] text-slate-200 font-medium">{event.eventType}</div>
        <div className="mt-1 flex items-center gap-2 text-[10px] font-mono text-slate-400">
          <span>{event.sourceIP}</span>
          <ArrowRight size={10} />
          <span>{event.destIP}</span>
          <span className="text-slate-600">·</span>
          <span>{event.protocol}/{event.port}</span>
          <span className="text-slate-600">·</span>
          <span>{event.bytes.toLocaleString()} bytes</span>
        </div>
      </div>

      {/* Narrative */}
      <div className="p-4 space-y-4">
        <div>
          <div
            className="flex items-center gap-1.5 text-[9px] font-mono font-bold tracking-widest mb-1.5"
            style={{ color: phase.color }}
          >
            <Sparkles size={10} />
            WHAT {phase.shortName} IS DOING TO THIS EVENT
          </div>
          <p className="text-[12px] text-slate-200 leading-relaxed">{narrative}</p>
        </div>

        <div>
          <div className="flex items-center gap-1.5 text-[9px] font-mono font-bold tracking-widest text-slate-400 mb-1.5">
            <Bot size={10} />
            AGENTS HANDLING THIS EVENT RIGHT NOW
          </div>
          {explanation.agents.length === 0 ? (
            <p className="text-[10px] text-slate-500 italic">
              No autonomous agent at this phase. Pure deterministic processing.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {explanation.agents.map((agent, i) => (
                <AgentBadge key={i} agent={agent} accent={phase.color} />
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="text-[9px] font-mono font-bold tracking-widest text-slate-400 mb-1.5">
            WORKED EXAMPLE FOR THIS PHASE
          </div>
          <div className="rounded border border-[#1e293b] bg-[#070b14] p-3">
            <p className="text-[11px] text-slate-300 italic leading-relaxed">
              {explanation.example}
            </p>
          </div>
        </div>

        {/* Pipeline trail */}
        <div>
          <div className="text-[9px] font-mono font-bold tracking-widest text-slate-400 mb-2">
            PIPELINE TRAIL — ALERT/CASE PROMOTION
          </div>
          <div className="flex items-center gap-1 flex-wrap">
            {FUNNEL_PHASES.map((p, idx) => {
              const reached = p.id < event.currentPhase;
              const current = p.id === event.currentPhase;
              const promo = getPromotionForPhase(p.id);
              return (
                <div key={p.id} className="flex items-center">
                  <div className="relative">
                    <div
                      className="flex items-center gap-1 px-2 py-1 rounded text-[9px] font-mono font-bold tracking-wider"
                      style={{
                        backgroundColor: current
                          ? hexToRgba(p.color, 0.25)
                          : reached
                            ? hexToRgba(p.color, 0.08)
                            : '#0a0e1a',
                        color: current ? p.color : reached ? p.color : '#475569',
                        border: current ? `1px solid ${p.color}` : '1px solid transparent',
                      }}
                    >
                      {p.id}
                      {current && (
                        <span
                          className="w-1 h-1 rounded-full animate-pulse"
                          style={{ backgroundColor: p.color }}
                        />
                      )}
                    </div>
                    {promo && (reached || current) && (
                      <div
                        className="absolute -top-1.5 -right-1.5 w-3 h-3 rounded-full flex items-center justify-center"
                        style={{
                          backgroundColor: promo.artifact === 'alert' ? '#f59e0b' : '#22c55e',
                          boxShadow: `0 0 6px ${promo.artifact === 'alert' ? 'rgba(245, 158, 11, 0.8)' : 'rgba(34, 197, 94, 0.8)'}`,
                        }}
                        title={promo.label}
                      >
                        {promo.artifact === 'alert' ? (
                          <Bell size={6} className="text-slate-900" />
                        ) : (
                          <Briefcase size={6} className="text-slate-900" />
                        )}
                      </div>
                    )}
                  </div>
                  {idx < FUNNEL_PHASES.length - 1 && (
                    <ChevronRight size={10} className="text-slate-700" />
                  )}
                </div>
              );
            })}
          </div>
          <div className="mt-2 flex items-center gap-3 text-[9px] font-mono text-slate-500">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-amber-500" /> Alert birth (phase 5)
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-green-500" /> Case opened (phase 7)
            </span>
            <span>
              {event.currentPhase >= 5
                ? `This event has reached the alert stage${event.currentPhase >= 7 ? ' and is bound to a case' : ''}.`
                : 'This event has not yet been promoted to an alert.'}
            </span>
          </div>
        </div>

        {/* Outcome predictions */}
        <div className="grid grid-cols-2 gap-3">
          <div
            className="rounded border p-3"
            style={{
              backgroundColor: 'rgba(34, 197, 94, 0.05)',
              borderColor: 'rgba(34, 197, 94, 0.25)',
            }}
          >
            <div className="flex items-center gap-1.5 mb-1.5">
              <CheckCircle size={11} className="text-green-400" />
              <span className="text-[9px] font-mono font-bold tracking-widest text-green-400">
                IF IT PASSES
              </span>
            </div>
            <p className="text-[10px] text-slate-300 leading-snug">
              {phaseId < 11
                ? `Proceeds to phase ${phaseId + 1} (${
                    FUNNEL_PHASES.find((p) => p.id === phaseId + 1)?.shortName
                  }) with current confidence and full evidence trail.`
                : 'Disposition is recorded and used to retrain rule thresholds in the next ALHF cycle.'}
            </p>
          </div>
          <div
            className="rounded border p-3"
            style={{
              backgroundColor: 'rgba(239, 68, 68, 0.05)',
              borderColor: 'rgba(239, 68, 68, 0.25)',
            }}
          >
            <div className="flex items-center gap-1.5 mb-1.5">
              <AlertTriangle size={11} className="text-red-400" />
              <span className="text-[9px] font-mono font-bold tracking-widest text-red-400">
                IF IT DROPS
              </span>
            </div>
            <p className="text-[10px] text-slate-300 leading-snug">
              {explanation.dropCriteria} The event is archived to the audit lake and a sample is
              retained for ALHF feedback review.
            </p>
          </div>
        </div>

        {/* Raw payload */}
        <div>
          <div className="flex items-center gap-1.5 text-[9px] font-mono font-bold tracking-widest text-slate-400 mb-1.5">
            <Database size={10} />
            RAW EVIDENCE PAYLOAD
          </div>
          <div className="rounded border border-[#1e293b] bg-[#070b14] p-3 max-h-[160px] overflow-auto">
            <pre className="text-[10px] font-mono text-slate-400 whitespace-pre-wrap break-all leading-relaxed">
              {event.rawData}
            </pre>
          </div>
        </div>

        {/* Resolution */}
        {event.resolutionReason && (
          <div className="border-t border-[#1e293b] pt-3">
            <div className="flex items-center gap-1.5 text-[9px] font-mono font-bold tracking-widest text-slate-400 mb-1">
              <Clock size={10} />
              RESOLUTION CONTEXT
            </div>
            <p className="text-[11px] text-slate-300">{event.resolutionReason}</p>
          </div>
        )}
      </div>
    </div>
  );
}
