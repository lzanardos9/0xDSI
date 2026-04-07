import { useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { Activity, Zap, Brain, Network, GitBranch, AlertTriangle, Clock, Shield, Target, TrendingUp } from 'lucide-react';
import {
  STREAMS, STREAM_INDEX, assignStreamsWithSpread,
  hex2rgba, lightenHex, getLaneY,
  CW, CH, LABEL_W, MARGIN_R, MARGIN_T, MARGIN_B, EVENT_AREA_W, LANE_H,
} from '../lib/cepStreamMapping';

interface CEPEvent {
  id: string;
  step: number;
  label: string;
  type: 'vertex' | 'edge' | 'anomaly' | 'correlation';
  severity: 'critical' | 'high' | 'medium' | 'low';
  timestamp: number;
  delay: number;
  details: string;
  connections: number[];
  metadata: Record<string, any>;
  stream: string;
  batchId: number;
}

interface ProcessingStage {
  name: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  progress: number;
  events: CEPEvent[];
  correlations: number;
}

interface AttackVector {
  name: string;
  steps: string[];
  confidence: number;
  systems: number;
  timeSpan: string;
}

export default function CEPLiveGraph() {
  const [allPatterns, setAllPatterns] = useState<any[]>([]);
  const [selectedPatternId, setSelectedPatternId] = useState<string | null>(null);
  const [matchData, setMatchData] = useState<any>(null);
  const [events, setEvents] = useState<CEPEvent[]>([]);
  const [stages, setStages] = useState<ProcessingStage[]>([]);
  const [currentStage, setCurrentStage] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingSpeed, setProcessingSpeed] = useState(1);
  const [attackVector, setAttackVector] = useState<AttackVector | null>(null);
  const [hoveredEventId, setHoveredEventId] = useState<string | null>(null);
  const [correlationMetrics, setCorrelationMetrics] = useState({
    eventsProcessed: 0,
    patternsDetected: 0,
    anomaliesFound: 0,
    confidenceScore: 0,
    parallelBatches: 0,
    crossStreamCorrelations: 0,
  });

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);
  const batchCounterRef = useRef(0);
  const timeRef = useRef(0);
  const eventsRef = useRef<CEPEvent[]>([]);

  useEffect(() => { eventsRef.current = events; }, [events]);

  useEffect(() => { loadAllPatterns(); }, []);

  useEffect(() => {
    if (selectedPatternId) loadSpecificPattern(selectedPatternId);
  }, [selectedPatternId]);

  useEffect(() => {
    if (isProcessing && matchData && currentStage < stages.length) processAsyncPattern();
  }, [isProcessing, matchData, currentStage]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = CW * dpr;
    canvas.height = CH * dpr;
    canvas.style.width = CW + 'px';
    canvas.style.height = CH + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const animate = () => {
      timeRef.current += 0.016;
      drawFrame(ctx, eventsRef.current, timeRef.current, hoveredEventId);
      animationRef.current = requestAnimationFrame(animate);
    };
    animationRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationRef.current);
  }, [hoveredEventId]);

  const loadAllPatterns = async () => {
    const { data } = await supabase
      .from('cep_pattern_matches')
      .select('match_id, match_details, confidence_score')
      .order('confidence_score', { ascending: false });
    if (data && data.length > 0) {
      setAllPatterns(data);
      setSelectedPatternId(data[0].match_id);
    }
  };

  const loadSpecificPattern = async (matchId: string) => {
    const { data } = await supabase
      .from('cep_pattern_matches')
      .select('*')
      .eq('match_id', matchId)
      .maybeSingle();
    if (data) {
      setMatchData(data);
      parseAttackVector(data);
      initializeStages();
      setCurrentStage(0);
      setEvents([]);
      batchCounterRef.current = 0;
      setIsProcessing(false);
    }
  };

  const parseAttackVector = (data: any) => {
    const details = data.match_details;
    setAttackVector({
      name: details.pattern || 'Unknown Pattern',
      steps: details.attack_vector || [],
      confidence: Math.round(data.confidence_score * 100),
      systems: details.systems_affected || details.systems_compromised || 1,
      timeSpan: details.time_delay_hours ? `${details.time_delay_hours}h` :
                details.enumeration_period_days ? `${details.enumeration_period_days}d` :
                details.infection_period_days ? `${details.infection_period_days}d` : '24h',
    });
  };

  const initializeStages = () => {
    const stageNames = [
      'Event Ingestion',
      'Temporal Correlation',
      'Behavioral Analysis',
      'Anomaly Detection',
      'Pattern Matching',
      'Threat Classification',
      'Risk Scoring',
    ];
    setStages(stageNames.map(name => ({
      name, status: 'pending', progress: 0, events: [], correlations: 0,
    })));
  };

  const processAsyncPattern = async () => {
    if (!matchData || currentStage >= stages.length) {
      setIsProcessing(false);
      return;
    }

    updateStageStatus(currentStage, 'processing');
    const av = matchData.match_details?.attack_vector || [];
    const eventsInStage = Math.ceil(av.length / stages.length);
    const startIdx = currentStage * eventsInStage;
    const endIdx = Math.min(startIdx + eventsInStage, av.length);

    const progressSteps = 20;
    for (let i = 0; i < progressSteps; i++) {
      await sleep(25 / processingSpeed);
      updateStageProgress(currentStage, (i / progressSteps) * 100);
    }

    let currentIdx = startIdx;
    while (currentIdx < endIdx) {
      const parallelCount = Math.min(
        Math.floor(Math.random() * 3) + 3,
        endIdx - currentIdx
      );

      const batchSteps: string[] = [];
      for (let j = 0; j < parallelCount; j++) {
        if (currentIdx + j < endIdx) batchSteps.push(av[currentIdx + j]);
      }

      const batchId = batchCounterRef.current++;
      const streams = assignStreamsWithSpread(batchSteps);

      const parallelPromises = batchSteps.map((step, j) =>
        processEvent(currentIdx + j, step, batchId, streams[j])
      );
      await Promise.all(parallelPromises);

      const crossCount = streams.length > 1
        ? (streams.length * (streams.length - 1)) / 2
        : 0;
      setCorrelationMetrics(prev => ({
        ...prev,
        parallelBatches: prev.parallelBatches + 1,
        crossStreamCorrelations: prev.crossStreamCorrelations + crossCount,
      }));

      currentIdx += parallelCount;
      await sleep((Math.random() * 300 + 150) / processingSpeed);
    }

    await sleep(150 / processingSpeed);
    updateStageStatus(currentStage, 'completed');
    updateStageProgress(currentStage, 100);
    await sleep(300 / processingSpeed);
    setCurrentStage(prev => prev + 1);
  };

  const processEvent = async (
    i: number, vectorStep: string, batchId: number, stream: string
  ) => {
    const delay = (Math.random() * 600 + 200) / processingSpeed;
    await sleep(delay);

    const event: CEPEvent = {
      id: `ev-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
      step: i + 1,
      label: vectorStep,
      type: Math.random() > 0.75 ? 'anomaly' : Math.random() > 0.5 ? 'correlation' : 'vertex',
      severity: matchData.severity,
      timestamp: Date.now(),
      delay: Math.round(delay),
      details: `Processing ${vectorStep}`,
      connections: i > 0 ? [i - 1] : [],
      metadata: { stage: stages[currentStage]?.name, confidence: matchData.confidence_score },
      stream,
      batchId,
    };

    setEvents(prev => [...prev, event]);
    updateStageEvents(currentStage, event);
    if (Math.random() > 0.5) updateStageCorrelations(currentStage, Math.floor(Math.random() * 3) + 1);
    updateMetrics(event);
  };

  const updateStageStatus = (idx: number, status: ProcessingStage['status']) => {
    setStages(prev => prev.map((s, i) => i === idx ? { ...s, status } : s));
  };
  const updateStageProgress = (idx: number, progress: number) => {
    setStages(prev => prev.map((s, i) => i === idx ? { ...s, progress } : s));
  };
  const updateStageEvents = (idx: number, event: CEPEvent) => {
    setStages(prev => prev.map((s, i) => i === idx ? { ...s, events: [...s.events, event] } : s));
  };
  const updateStageCorrelations = (idx: number, count: number) => {
    setStages(prev => prev.map((s, i) => i === idx ? { ...s, correlations: s.correlations + count } : s));
  };
  const updateMetrics = (event: CEPEvent) => {
    setCorrelationMetrics(prev => ({
      ...prev,
      eventsProcessed: prev.eventsProcessed + 1,
      patternsDetected: prev.patternsDetected + (event.type === 'correlation' ? 1 : 0),
      anomaliesFound: prev.anomaliesFound + (event.type === 'anomaly' ? 1 : 0),
      confidenceScore: Math.min(100, prev.confidenceScore + Math.random() * 2),
    }));
  };

  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  const startProcessing = () => {
    setIsProcessing(true);
    setCurrentStage(0);
    setEvents([]);
    batchCounterRef.current = 0;
    setCorrelationMetrics({
      eventsProcessed: 0, patternsDetected: 0, anomaliesFound: 0,
      confidenceScore: 0, parallelBatches: 0, crossStreamCorrelations: 0,
    });
  };

  const resetProcessing = () => {
    setIsProcessing(false);
    setCurrentStage(0);
    setEvents([]);
    batchCounterRef.current = 0;
    setStages(prev => prev.map(s => ({
      ...s, status: 'pending' as const, progress: 0, events: [], correlations: 0,
    })));
    setCorrelationMetrics({
      eventsProcessed: 0, patternsDetected: 0, anomaliesFound: 0,
      confidenceScore: 0, parallelBatches: 0, crossStreamCorrelations: 0,
    });
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = CW / rect.width;
    const scaleY = CH / rect.height;
    const mx = (e.clientX - rect.left) * scaleX;
    const my = (e.clientY - rect.top) * scaleY;

    const positions = computePositions(eventsRef.current);
    let found: string | null = null;
    for (let i = eventsRef.current.length - 1; i >= 0; i--) {
      const pos = positions.get(eventsRef.current[i].id);
      if (!pos?.vis) continue;
      const dx = mx - pos.x;
      const dy = my - pos.y;
      if (dx * dx + dy * dy < 250) { found = eventsRef.current[i].id; break; }
    }
    setHoveredEventId(found);
  };

  const getStatusColor = (status: ProcessingStage['status']) => {
    switch (status) {
      case 'completed': return 'text-green-600 bg-green-50 border-green-200';
      case 'processing': return 'text-blue-600 bg-blue-50 border-blue-200';
      case 'error': return 'text-red-600 bg-red-50 border-red-200';
      default: return 'text-slate-600 bg-slate-50 border-slate-200';
    }
  };

  const getStatusIcon = (status: ProcessingStage['status']) => {
    switch (status) {
      case 'completed': return <Shield className="w-4 h-4" />;
      case 'processing': return <Activity className="w-4 h-4 animate-spin" />;
      case 'error': return <AlertTriangle className="w-4 h-4" />;
      default: return <Clock className="w-4 h-4" />;
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-slate-900 to-slate-800 rounded-xl p-6 text-white">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold flex items-center space-x-2">
              <Brain className="w-8 h-8 text-blue-400" />
              <span>Complex Event Processing Engine</span>
            </h2>
            <p className="text-slate-300 mt-2">Parallel multi-stream correlation with cross-source analysis</p>
          </div>
          <div className="flex space-x-3">
            <div className="px-4 py-2 bg-white/10 rounded-lg border border-white/20">
              <div className="text-xs text-slate-300">Processing Speed</div>
              <select
                value={processingSpeed}
                onChange={(e) => setProcessingSpeed(Number(e.target.value))}
                className="bg-transparent text-white font-mono font-bold text-sm outline-none cursor-pointer"
              >
                <option value={0.5} className="text-slate-900">0.5x Slow</option>
                <option value={1} className="text-slate-900">1x Normal</option>
                <option value={2} className="text-slate-900">2x Fast</option>
                <option value={5} className="text-slate-900">5x Very Fast</option>
                <option value={10} className="text-slate-900">10x Ultra</option>
              </select>
            </div>
          </div>
        </div>

        {attackVector && (
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-white/5 rounded-lg p-4 border border-white/10">
              <div className="text-xs text-slate-400 mb-1">Attack Pattern</div>
              <select
                value={selectedPatternId || ''}
                onChange={(e) => setSelectedPatternId(e.target.value)}
                className="bg-slate-800/50 text-white text-sm font-bold px-2 py-1 rounded border border-white/20 outline-none cursor-pointer w-full hover:bg-slate-700/50 transition-colors"
                disabled={isProcessing}
              >
                {allPatterns.map((pattern) => (
                  <option key={pattern.match_id} value={pattern.match_id} className="text-slate-900">
                    {pattern.match_details?.pattern || pattern.match_id}
                  </option>
                ))}
              </select>
            </div>
            <div className="bg-white/5 rounded-lg p-4 border border-white/10">
              <div className="text-xs text-slate-400 mb-1">Attack Vectors</div>
              <div className="text-lg font-bold">{attackVector.steps.length} Steps</div>
            </div>
            <div className="bg-white/5 rounded-lg p-4 border border-white/10">
              <div className="text-xs text-slate-400 mb-1">Confidence</div>
              <div className="text-lg font-bold">{attackVector.confidence}%</div>
            </div>
            <div className="bg-white/5 rounded-lg p-4 border border-white/10">
              <div className="text-xs text-slate-400 mb-1">Time Span</div>
              <div className="text-lg font-bold">{attackVector.timeSpan}</div>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-6 gap-4">
        {[
          { label: 'Events Processed', value: correlationMetrics.eventsProcessed, icon: Activity, bg: 'bg-blue-100', ic: 'text-blue-600' },
          { label: 'Patterns Detected', value: correlationMetrics.patternsDetected, icon: Network, bg: 'bg-teal-100', ic: 'text-teal-600' },
          { label: 'Anomalies Found', value: correlationMetrics.anomaliesFound, icon: AlertTriangle, bg: 'bg-red-100', ic: 'text-red-600' },
          { label: 'Confidence Score', value: `${Math.round(correlationMetrics.confidenceScore)}%`, icon: TrendingUp, bg: 'bg-green-100', ic: 'text-green-600' },
          { label: 'Parallel Batches', value: correlationMetrics.parallelBatches, icon: Zap, bg: 'bg-amber-100', ic: 'text-amber-600' },
          { label: 'Cross-Stream Links', value: correlationMetrics.crossStreamCorrelations, icon: GitBranch, bg: 'bg-cyan-100', ic: 'text-cyan-600' },
        ].map((m) => (
          <div key={m.label} className="bg-white rounded-xl shadow-lg p-5 border border-slate-200">
            <div className="flex items-center justify-between mb-2">
              <div className={`p-2.5 ${m.bg} rounded-lg`}>
                <m.icon className={`w-5 h-5 ${m.ic}`} />
              </div>
              <div className="text-2xl font-bold text-slate-900">{m.value}</div>
            </div>
            <div className="text-xs text-slate-600">{m.label}</div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Processing Pipeline</h3>
            <p className="text-sm text-slate-600 mt-1">Multi-stage asynchronous correlation engine</p>
          </div>
          <div className="flex space-x-2">
            {!isProcessing ? (
              <button
                onClick={startProcessing}
                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition flex items-center space-x-2 shadow-lg"
              >
                <Zap className="w-4 h-4" />
                <span>Start Processing</span>
              </button>
            ) : (
              <button
                onClick={resetProcessing}
                className="px-6 py-2.5 bg-slate-600 hover:bg-slate-700 text-white rounded-lg font-medium transition flex items-center space-x-2"
              >
                <Target className="w-4 h-4" />
                <span>Reset</span>
              </button>
            )}
          </div>
        </div>

        <div className="p-6 space-y-3">
          {stages.map((stage, idx) => (
            <div key={idx} className={`border rounded-lg overflow-hidden transition-all ${getStatusColor(stage.status)}`}>
              <div className="p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-3">
                    <div className={`p-1.5 rounded-lg ${getStatusColor(stage.status)}`}>
                      {getStatusIcon(stage.status)}
                    </div>
                    <div>
                      <div className="font-semibold text-sm">{stage.name}</div>
                      <div className="text-xs opacity-70">{stage.events.length} events / {stage.correlations} correlations</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold">{Math.round(stage.progress)}%</div>
                  </div>
                </div>
                <div className="w-full bg-white/50 rounded-full h-1.5 overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 ${
                      stage.status === 'completed' ? 'bg-green-500' :
                      stage.status === 'processing' ? 'bg-blue-500 animate-pulse' :
                      'bg-slate-300'
                    }`}
                    style={{ width: `${stage.progress}%` }}
                  />
                </div>
                {stage.events.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {stage.events.slice(-6).map((event, eidx) => {
                      const stream = STREAMS.find(s => s.id === event.stream);
                      return (
                        <div
                          key={eidx}
                          className="px-2 py-0.5 bg-white/70 rounded text-[10px] font-mono flex items-center space-x-1"
                        >
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: stream?.color || '#64748b' }} />
                          <span className="truncate max-w-[90px]">{event.label.substring(0, 14)}</span>
                        </div>
                      );
                    })}
                    {stage.events.length > 6 && (
                      <div className="px-2 py-0.5 bg-white/70 rounded text-[10px] font-mono">+{stage.events.length - 6}</div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-slate-950 rounded-xl shadow-2xl border border-slate-800 overflow-hidden">
        <div className="px-6 py-4 bg-slate-900/80 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-white">Live Parallel Stream Correlation Graph</h3>
            <p className="text-sm text-slate-400 mt-1">Real-time multi-source event processing with cross-stream correlation detection</p>
          </div>
          <div className="flex items-center gap-4">
            {STREAMS.slice(0, 4).map(s => (
              <div key={s.id} className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                <span className="text-[10px] text-slate-500">{s.label.split(' / ')[0]}</span>
              </div>
            ))}
            <span className="text-[10px] text-slate-600">+3 more</span>
          </div>
        </div>
        <div className="p-4">
          <canvas
            ref={canvasRef}
            onMouseMove={handleCanvasMouseMove}
            onMouseLeave={() => setHoveredEventId(null)}
            className="w-full rounded-lg cursor-crosshair"
            style={{ maxWidth: CW + 'px', height: 'auto', aspectRatio: `${CW}/${CH}` }}
          />
        </div>
      </div>

      {attackVector && attackVector.steps.length > 0 && (
        <div className="bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 bg-slate-50 border-b border-slate-200">
            <h3 className="text-lg font-bold text-slate-900 flex items-center space-x-2">
              <GitBranch className="w-5 h-5" />
              <span>Attack Vector Sequence</span>
            </h3>
            <p className="text-sm text-slate-600 mt-1">{attackVector.steps.length} step multi-stage attack chain</p>
          </div>
          <div className="p-6">
            <div className="space-y-2">
              {attackVector.steps.map((step, idx) => {
                const processed = events.find(e => e.label === step);
                const stream = processed ? STREAMS.find(s => s.id === processed.stream) : null;
                return (
                  <div
                    key={idx}
                    className={`flex items-center space-x-4 p-3 rounded-lg border transition-all ${
                      processed ? 'bg-blue-50 border-blue-200' : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                      processed ? 'bg-blue-600 text-white' : 'bg-slate-300 text-slate-600'
                    }`}>
                      {idx + 1}
                    </div>
                    <div className="flex-1 font-mono text-sm">{step}</div>
                    {processed && stream && (
                      <div className="flex items-center space-x-2">
                        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ backgroundColor: hex2rgba(stream.color, 0.1), color: stream.color }}>
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: stream.color }} />
                          {stream.label.split(' / ')[0]}
                        </div>
                        {processed.batchId !== undefined && (
                          <span className="text-[10px] text-slate-400 font-mono">batch #{processed.batchId}</span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function computePositions(events: CEPEvent[]): Map<string, { x: number; y: number; vis: boolean }> {
  const pos = new Map<string, { x: number; y: number; vis: boolean }>();
  if (!events.length) return pos;
  const batchIds = [...new Set(events.map(e => e.batchId))].sort((a, b) => a - b);
  const maxVis = 16;
  const visible = batchIds.slice(-maxVis);
  const colW = EVENT_AREA_W / (visible.length + 1);
  for (const e of events) {
    const bIdx = visible.indexOf(e.batchId);
    const sIdx = STREAM_INDEX.get(e.stream) ?? 0;
    pos.set(e.id, bIdx >= 0
      ? { x: LABEL_W + (bIdx + 1) * colW, y: getLaneY(sIdx), vis: true }
      : { x: -100, y: -100, vis: false }
    );
  }
  return pos;
}

function drawFrame(
  ctx: CanvasRenderingContext2D,
  events: CEPEvent[],
  time: number,
  hoveredId: string | null,
) {
  const positions = computePositions(events);

  ctx.fillStyle = '#070b17';
  ctx.fillRect(0, 0, CW, CH);

  drawGrid(ctx);
  drawLaneBackgrounds(ctx, events, time);
  drawSequentialLinks(ctx, events, positions, time);
  drawCorrelationArcs(ctx, events, positions, time);
  drawEventNodes(ctx, events, positions, time, hoveredId);
  drawScanLine(ctx, time);
  drawLaneLabels(ctx, events);
  drawTitle(ctx, events, time);
}

function drawSequentialLinks(
  ctx: CanvasRenderingContext2D,
  events: CEPEvent[],
  positions: Map<string, { x: number; y: number; vis: boolean }>,
  time: number,
) {
  const streamEvents = new Map<string, CEPEvent[]>();
  for (const e of events) {
    if (!streamEvents.has(e.stream)) streamEvents.set(e.stream, []);
    streamEvents.get(e.stream)!.push(e);
  }

  streamEvents.forEach((evts, streamId) => {
    const sorted = [...evts].sort((a, b) => a.timestamp - b.timestamp);
    const stream = STREAMS.find(s => s.id === streamId);
    if (!stream || sorted.length < 2) return;

    for (let i = 0; i < sorted.length - 1; i++) {
      const a = positions.get(sorted[i].id);
      const b = positions.get(sorted[i + 1].id);
      if (!a?.vis || !b?.vis) continue;

      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = hex2rgba(stream.color, 0.25);
      ctx.lineWidth = 1.5;
      ctx.stroke();

      const t = ((time * 0.4 + i * 0.15) % 1);
      const px = a.x + (b.x - a.x) * t;
      const py = a.y + (b.y - a.y) * t;
      ctx.beginPath();
      ctx.arc(px, py, 2, 0, Math.PI * 2);
      ctx.fillStyle = hex2rgba(stream.color, 0.5);
      ctx.fill();
    }
  });

  const sorted = [...events].sort((a, b) => a.timestamp - b.timestamp);
  for (let i = 0; i < sorted.length - 1; i++) {
    if (sorted[i].stream === sorted[i + 1].stream) continue;
    if (sorted[i + 1].batchId - sorted[i].batchId > 1) continue;
    const a = positions.get(sorted[i].id);
    const b = positions.get(sorted[i + 1].id);
    if (!a?.vis || !b?.vis) continue;

    const sa = STREAMS.find(s => s.id === sorted[i].stream);
    const sb = STREAMS.find(s => s.id === sorted[i + 1].stream);
    if (!sa || !sb) continue;

    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.quadraticCurveTo(mx - 10, my, b.x, b.y);
    ctx.strokeStyle = hex2rgba(sa.color, 0.1);
    ctx.lineWidth = 0.8;
    ctx.stroke();
  }
}

function drawGrid(ctx: CanvasRenderingContext2D) {
  ctx.lineWidth = 0.5;
  for (let x = LABEL_W; x < CW; x += 55) {
    ctx.strokeStyle = 'rgba(30, 41, 59, 0.25)';
    ctx.beginPath();
    ctx.moveTo(x, MARGIN_T);
    ctx.lineTo(x, CH - MARGIN_B);
    ctx.stroke();
  }
  for (let i = 0; i <= STREAMS.length; i++) {
    const y = MARGIN_T + i * LANE_H;
    ctx.strokeStyle = i === 0 || i === STREAMS.length
      ? 'rgba(51, 65, 85, 0.4)' : 'rgba(30, 41, 59, 0.2)';
    ctx.beginPath();
    ctx.moveTo(LABEL_W - 5, y);
    ctx.lineTo(CW - MARGIN_R, y);
    ctx.stroke();
  }
}

function drawLaneBackgrounds(ctx: CanvasRenderingContext2D, events: CEPEvent[], time: number) {
  STREAMS.forEach((stream, idx) => {
    const y = MARGIN_T + idx * LANE_H;
    const cy = getLaneY(idx);
    const count = events.filter(e => e.stream === stream.id).length;
    const intensity = Math.min(0.1, count * 0.006);

    const grad = ctx.createLinearGradient(LABEL_W, y, CW - MARGIN_R, y);
    grad.addColorStop(0, hex2rgba(stream.color, intensity * 1.2));
    grad.addColorStop(0.5, hex2rgba(stream.color, intensity * 0.4));
    grad.addColorStop(1, hex2rgba(stream.color, 0));
    ctx.fillStyle = grad;
    ctx.fillRect(LABEL_W, y, EVENT_AREA_W, LANE_H);

    ctx.beginPath();
    ctx.strokeStyle = hex2rgba(stream.color, 0.06 + count * 0.004);
    ctx.lineWidth = 1;
    for (let x = LABEL_W; x < CW - MARGIN_R; x += 2) {
      const wave = Math.sin(x * 0.012 + time * 1.3 + idx * 1.8) * (1.5 + count * 0.2);
      x === LABEL_W ? ctx.moveTo(x, cy + wave) : ctx.lineTo(x, cy + wave);
    }
    ctx.stroke();

    const pr = 3 + Math.sin(time * 2.5 + idx) * 1;
    ctx.beginPath();
    ctx.arc(LABEL_W + 10, cy, pr, 0, Math.PI * 2);
    ctx.fillStyle = count > 0 ? stream.color : 'rgba(51, 65, 85, 0.3)';
    ctx.fill();
    if (count > 0) {
      ctx.beginPath();
      ctx.arc(LABEL_W + 10, cy, pr + 5, 0, Math.PI * 2);
      ctx.strokeStyle = hex2rgba(stream.color, 0.2);
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  });
}

function drawCorrelationArcs(
  ctx: CanvasRenderingContext2D,
  events: CEPEvent[],
  positions: Map<string, { x: number; y: number; vis: boolean }>,
  time: number,
) {
  const batches = new Map<number, CEPEvent[]>();
  events.forEach(e => {
    if (!batches.has(e.batchId)) batches.set(e.batchId, []);
    batches.get(e.batchId)!.push(e);
  });

  let arcIdx = 0;
  batches.forEach(batch => {
    if (batch.length < 2) return;
    for (let i = 0; i < batch.length; i++) {
      for (let j = i + 1; j < batch.length; j++) {
        if (batch[i].stream === batch[j].stream) continue;
        const a = positions.get(batch[i].id);
        const b = positions.get(batch[j].id);
        if (!a?.vis || !b?.vis) continue;

        const sa = STREAMS.find(s => s.id === batch[i].stream)!;
        const sb2 = STREAMS.find(s => s.id === batch[j].stream)!;
        const age = (Date.now() - Math.max(batch[i].timestamp, batch[j].timestamp)) / 1000;
        const alpha = Math.min(0.4, 0.03 + age * 0.03);

        const mx = (a.x + b.x) / 2 + 18;
        const my = (a.y + b.y) / 2;

        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.quadraticCurveTo(mx, my, b.x, b.y);
        const arcGrad = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
        arcGrad.addColorStop(0, hex2rgba(sa.color, alpha));
        arcGrad.addColorStop(1, hex2rgba(sb2.color, alpha));
        ctx.strokeStyle = arcGrad;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 4]);
        ctx.lineDashOffset = -time * 30;
        ctx.stroke();
        ctx.setLineDash([]);

        for (let p = 0; p < 3; p++) {
          const t = ((time * 0.25 + p * 0.33 + arcIdx * 0.11) % 1);
          const px = (1 - t) * (1 - t) * a.x + 2 * (1 - t) * t * mx + t * t * b.x;
          const py = (1 - t) * (1 - t) * a.y + 2 * (1 - t) * t * my + t * t * b.y;
          const col = t < 0.5 ? sa.color : sb2.color;
          ctx.beginPath();
          ctx.arc(px, py, 2.5, 0, Math.PI * 2);
          ctx.fillStyle = col;
          ctx.fill();
          ctx.beginPath();
          ctx.arc(px, py, 5.5, 0, Math.PI * 2);
          ctx.fillStyle = hex2rgba(col, 0.12);
          ctx.fill();
        }
        arcIdx++;
      }
    }
  });
}

function drawEventNodes(
  ctx: CanvasRenderingContext2D,
  events: CEPEvent[],
  positions: Map<string, { x: number; y: number; vis: boolean }>,
  time: number,
  hoveredId: string | null,
) {
  const sevColors: Record<string, string> = {
    critical: '#ef4444', high: '#f97316', medium: '#eab308', low: '#3b82f6',
  };

  for (const event of events) {
    const pos = positions.get(event.id);
    if (!pos?.vis) continue;
    const stream = STREAMS.find(s => s.id === event.stream);
    if (!stream) continue;

    const age = (Date.now() - event.timestamp) / 1000;
    const isNew = age < 1.8;
    const isHov = hoveredId === event.id;
    const baseR = event.type === 'anomaly' ? 10 : event.type === 'correlation' ? 8 : 6;
    const r = isHov ? baseR + 3 : baseR;
    const pulse = isNew ? Math.sin(time * 7) * 2.5 : Math.sin(time * 1.8) * 0.6;

    const glow = ctx.createRadialGradient(pos.x, pos.y, r * 0.5, pos.x, pos.y, r + 15 + pulse);
    glow.addColorStop(0, hex2rgba(stream.color, 0.2));
    glow.addColorStop(1, hex2rgba(stream.color, 0));
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, r + 15 + pulse, 0, Math.PI * 2);
    ctx.fillStyle = glow;
    ctx.fill();

    if (isNew) {
      const pulseR = r + age * 22;
      const pulseA = Math.max(0, 0.5 - age * 0.28);
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, pulseR, 0, Math.PI * 2);
      ctx.strokeStyle = hex2rgba(stream.color, pulseA);
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    if (event.type === 'anomaly') {
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, r + 3, 0, Math.PI * 2);
      ctx.strokeStyle = hex2rgba(sevColors[event.severity] || '#ef4444', 0.65);
      ctx.lineWidth = 2;
      ctx.setLineDash([3, 3]);
      ctx.lineDashOffset = -time * 18;
      ctx.stroke();
      ctx.setLineDash([]);
    }

    const ig = ctx.createRadialGradient(pos.x - r * 0.3, pos.y - r * 0.3, 0, pos.x, pos.y, r);
    ig.addColorStop(0, lightenHex(stream.color, 45));
    ig.addColorStop(1, stream.color);
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
    ctx.fillStyle = ig;
    ctx.fill();
    ctx.strokeStyle = lightenHex(stream.color, 30);
    ctx.lineWidth = 1.5;
    ctx.stroke();

    if (event.type === 'anomaly' || event.type === 'correlation') {
      ctx.font = `bold ${r > 8 ? 11 : 9}px system-ui`;
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(event.type === 'anomaly' ? '!' : 'C', pos.x, pos.y);
    }

    if (isHov) {
      const lbl = event.label.length > 32 ? event.label.slice(0, 30) + '..' : event.label;
      ctx.font = 'bold 11px system-ui';
      const tw = ctx.measureText(lbl).width;
      const px = pos.x - tw / 2 - 10;
      const py = pos.y - r - 36;
      const pw = tw + 20;
      const ph = 28;
      ctx.beginPath();
      ctx.moveTo(px + 6, py);
      ctx.lineTo(px + pw - 6, py);
      ctx.arcTo(px + pw, py, px + pw, py + 6, 6);
      ctx.lineTo(px + pw, py + ph - 6);
      ctx.arcTo(px + pw, py + ph, px + pw - 6, py + ph, 6);
      ctx.lineTo(px + 6, py + ph);
      ctx.arcTo(px, py + ph, px, py + ph - 6, 6);
      ctx.lineTo(px, py + 6);
      ctx.arcTo(px, py, px + 6, py, 6);
      ctx.closePath();
      ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
      ctx.fill();
      ctx.strokeStyle = hex2rgba(stream.color, 0.5);
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = '#e2e8f0';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(lbl, pos.x, py + ph / 2);

      ctx.font = '9px system-ui';
      ctx.fillStyle = hex2rgba(stream.color, 0.7);
      ctx.fillText(`${stream.label} | ${event.type} | batch #${event.batchId}`, pos.x, py + ph + 12);
    }
  }
}

function drawScanLine(ctx: CanvasRenderingContext2D, time: number) {
  const scanX = LABEL_W + ((time * 0.1) % 1) * EVENT_AREA_W;
  const grad = ctx.createLinearGradient(scanX - 90, 0, scanX, 0);
  grad.addColorStop(0, 'rgba(6, 182, 212, 0)');
  grad.addColorStop(0.85, 'rgba(6, 182, 212, 0.02)');
  grad.addColorStop(1, 'rgba(6, 182, 212, 0.1)');
  ctx.fillStyle = grad;
  ctx.fillRect(scanX - 90, MARGIN_T, 90, CH - MARGIN_T - MARGIN_B);
  ctx.strokeStyle = 'rgba(6, 182, 212, 0.3)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(scanX, MARGIN_T);
  ctx.lineTo(scanX, CH - MARGIN_B);
  ctx.stroke();
}

function drawLaneLabels(ctx: CanvasRenderingContext2D, events: CEPEvent[]) {
  ctx.fillStyle = 'rgba(7, 11, 23, 0.97)';
  ctx.fillRect(0, 0, LABEL_W - 5, CH);

  STREAMS.forEach((stream, idx) => {
    const cy = getLaneY(idx);
    const count = events.filter(e => e.stream === stream.id).length;

    ctx.font = 'bold 11px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = stream.color;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(stream.label, LABEL_W - 22, cy - 7);

    ctx.font = '9px system-ui';
    ctx.fillStyle = count > 0 ? 'rgba(148, 163, 184, 0.7)' : 'rgba(71, 85, 105, 0.35)';
    ctx.fillText(`${count} event${count !== 1 ? 's' : ''}`, LABEL_W - 22, cy + 9);
  });
}

function drawTitle(ctx: CanvasRenderingContext2D, events: CEPEvent[], time: number) {
  const batchCount = new Set(events.map(e => e.batchId)).size;

  ctx.font = 'bold 11px system-ui';
  ctx.fillStyle = 'rgba(100, 116, 139, 0.5)';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('PARALLEL STREAM CORRELATION', LABEL_W + 12, 9);

  ctx.textAlign = 'right';
  if (events.length > 0) {
    ctx.fillStyle = 'rgba(148, 163, 184, 0.5)';
    ctx.fillText(`${events.length} EVENTS | ${batchCount} BATCHES`, CW - 20, 9);
  }

  if (events.length > 0 && ((time * 0.5) % 2) < 1.5) {
    ctx.fillStyle = hex2rgba('#22c55e', 0.5 + Math.sin(time * 3) * 0.2);
    ctx.textAlign = 'center';
    ctx.fillText('LIVE', LABEL_W + 70, CH - 18);
    ctx.beginPath();
    ctx.arc(LABEL_W + 48, CH - 14, 3, 0, Math.PI * 2);
    ctx.fillStyle = hex2rgba('#22c55e', 0.6 + Math.sin(time * 4) * 0.3);
    ctx.fill();
  }
}
