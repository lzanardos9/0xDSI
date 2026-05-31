import { useEffect, useState, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import {
  Activity, Zap, Network, AlertTriangle, Database, Brain, Cpu,
  Radio, Shield, Eye, TrendingUp, Clock, GitBranch, Layers, ChevronRight,
} from 'lucide-react';

interface GraphNode {
  id: string;
  type: string;
  label: string;
  risk: number;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  [key: string]: any;
}

interface GraphEdge {
  source: string;
  target: string;
  type: string;
  weight: number;
}

interface GraphSnapshot {
  id: string;
  snapshot_type: string;
  graph_data: { nodes: GraphNode[]; edges: GraphEdge[] };
  risk_level: string;
  risk_score: number;
  pipeline_stage: string;
  processing_latency_ms: number;
  vector_embeddings_count: number;
  description: string;
  created_at: string;
}

interface PipelineMetric {
  metric_name: string;
  metric_value: number;
  pipeline_component: string;
}

const NODE_COLORS: Record<string, string> = {
  user: '#3b82f6',
  host: '#22c55e',
  server: '#06b6d4',
  ip: '#f59e0b',
  service: '#14b8a6',
  process: '#ef4444',
  file: '#f97316',
  credential: '#dc2626',
  application: '#0ea5e9',
  device: '#10b981',
  cloud: '#0891b2',
};

const RISK_COLORS: Record<string, { bg: string; text: string; border: string; glow: string }> = {
  low: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/30', glow: '#22c55e' },
  medium: { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/30', glow: '#f59e0b' },
  high: { bg: 'bg-orange-500/10', text: 'text-orange-400', border: 'border-orange-500/30', glow: '#f97316' },
  critical: { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/30', glow: '#ef4444' },
};

const PIPELINE_STAGES = [
  { id: 'spark_ingestion', label: 'Spark Structured Streaming', icon: Zap, color: '#f59e0b', desc: 'Kafka/EventHub ingestion at 15K+ events/sec' },
  { id: 'graphframes', label: 'GraphFrames Processing', icon: Network, color: '#3b82f6', desc: 'PageRank, connected components, motif finding' },
  { id: 'vectordb', label: 'Vector Similarity Search', icon: Brain, color: '#06b6d4', desc: 'Embedding generation & ANN queries via Mosaic AI' },
  { id: 'cep_engine', label: 'CEP Pattern Detection', icon: Shield, color: '#22c55e', desc: 'Complex event correlation & risk scoring' },
];

function hex2rgba(hex: string, a: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
}

export default function RealTimeGraphStreaming() {
  const [snapshots, setSnapshots] = useState<GraphSnapshot[]>([]);
  const [metrics, setMetrics] = useState<PipelineMetric[]>([]);
  const [activeSnapshot, setActiveSnapshot] = useState<GraphSnapshot | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamIdx, setStreamIdx] = useState(0);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [pipelineProgress, setPipelineProgress] = useState<Record<string, number>>({});
  const [streamLog, setStreamLog] = useState<string[]>([]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef(0);
  const timeRef = useRef(0);
  const nodesRef = useRef<GraphNode[]>([]);
  const edgesRef = useRef<GraphEdge[]>([]);
  const buildProgressRef = useRef(0);
  const streamTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => { loadData(); }, []);

  useEffect(() => {
    if (snapshots.length > 0 && !activeSnapshot) {
      activateSnapshot(snapshots[0]);
    }
  }, [snapshots]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const W = 1100, H = 600;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const animate = () => {
      timeRef.current += 0.016;
      simulateForces();
      drawGraph(ctx, W, H, timeRef.current);
      animRef.current = requestAnimationFrame(animate);
    };
    animRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animRef.current);
  }, [hoveredNode]);

  const loadData = async () => {
    const [snapRes, metricRes] = await Promise.all([
      supabase.from('rt_graph_snapshots').select('*').order('risk_score', { ascending: false }),
      supabase.from('rt_streaming_metrics').select('*').order('recorded_at', { ascending: false }).limit(30),
    ]);
    if (snapRes.data) setSnapshots(snapRes.data);
    if (metricRes.data) setMetrics(metricRes.data);
  };

  const activateSnapshot = useCallback((snap: GraphSnapshot) => {
    setActiveSnapshot(snap);
    buildProgressRef.current = 0;
    const nodes = (snap.graph_data.nodes || []).map((n, i) => ({
      ...n,
      x: 550 + (Math.random() - 0.5) * 200,
      y: 300 + (Math.random() - 0.5) * 200,
      vx: 0,
      vy: 0,
    }));
    nodesRef.current = nodes;
    edgesRef.current = snap.graph_data.edges || [];
  }, []);

  const simulateForces = () => {
    const nodes = nodesRef.current;
    const edges = edgesRef.current;
    if (!nodes.length) return;

    const CX = 550, CY = 300;
    for (const n of nodes) {
      const dx = CX - (n.x || 0);
      const dy = CY - (n.y || 0);
      n.vx = (n.vx || 0) + dx * 0.001;
      n.vy = (n.vy || 0) + dy * 0.001;
    }

    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dx = (nodes[j].x || 0) - (nodes[i].x || 0);
        const dy = (nodes[j].y || 0) - (nodes[i].y || 0);
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = 800 / (dist * dist);
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        nodes[i].vx! -= fx;
        nodes[i].vy! -= fy;
        nodes[j].vx! += fx;
        nodes[j].vy! += fy;
      }
    }

    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    for (const e of edges) {
      const src = nodeMap.get(e.source);
      const tgt = nodeMap.get(e.target);
      if (!src || !tgt) continue;
      const dx = (tgt.x || 0) - (src.x || 0);
      const dy = (tgt.y || 0) - (src.y || 0);
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const target = 120;
      const force = (dist - target) * 0.005;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      src.vx! += fx;
      src.vy! += fy;
      tgt.vx! -= fx;
      tgt.vy! -= fy;
    }

    for (const n of nodes) {
      n.vx! *= 0.85;
      n.vy! *= 0.85;
      n.x = (n.x || 0) + (n.vx || 0);
      n.y = (n.y || 0) + (n.vy || 0);
      n.x = Math.max(40, Math.min(1060, n.x));
      n.y = Math.max(40, Math.min(560, n.y));
    }

    if (buildProgressRef.current < 1) {
      buildProgressRef.current = Math.min(1, buildProgressRef.current + 0.02);
    }
  };

  const drawGraph = (ctx: CanvasRenderingContext2D, W: number, H: number, time: number) => {
    const nodes = nodesRef.current;
    const edges = edgesRef.current;
    const progress = buildProgressRef.current;
    const isRisk = activeSnapshot?.snapshot_type === 'risk_elevated';

    ctx.fillStyle = isRisk ? '#0c0810' : '#070b17';
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = isRisk ? 'rgba(239, 68, 68, 0.06)' : 'rgba(30, 41, 59, 0.15)';
    ctx.lineWidth = 0.5;
    for (let x = 0; x < W; x += 40) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let y = 0; y < H; y += 40) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }

    if (isRisk) {
      const pulseA = 0.03 + Math.sin(time * 2) * 0.015;
      ctx.fillStyle = `rgba(239, 68, 68, ${pulseA})`;
      ctx.fillRect(0, 0, W, H);
    }

    const visibleEdges = Math.floor(edges.length * progress);
    for (let i = 0; i < visibleEdges; i++) {
      const e = edges[i];
      const src = nodes.find(n => n.id === e.source);
      const tgt = nodes.find(n => n.id === e.target);
      if (!src || !tgt) continue;

      const isHighRisk = e.weight > 0.9;
      const alpha = 0.15 + e.weight * 0.3;
      const srcColor = NODE_COLORS[src.type] || '#64748b';
      const tgtColor = NODE_COLORS[tgt.type] || '#64748b';

      if (isHighRisk && isRisk) {
        ctx.shadowColor = '#ef4444';
        ctx.shadowBlur = 6;
      }

      const grad = ctx.createLinearGradient(src.x!, src.y!, tgt.x!, tgt.y!);
      grad.addColorStop(0, hex2rgba(srcColor, alpha));
      grad.addColorStop(1, hex2rgba(tgtColor, alpha));
      ctx.beginPath();
      ctx.moveTo(src.x!, src.y!);
      ctx.lineTo(tgt.x!, tgt.y!);
      ctx.strokeStyle = grad;
      ctx.lineWidth = isHighRisk ? 2.5 : 1.5;
      if (isHighRisk && isRisk) {
        ctx.setLineDash([6, 3]);
        ctx.lineDashOffset = -time * 25;
      }
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.shadowBlur = 0;

      const t = ((time * 0.3 + i * 0.08) % 1);
      const px = src.x! + (tgt.x! - src.x!) * t;
      const py = src.y! + (tgt.y! - src.y!) * t;
      ctx.beginPath();
      ctx.arc(px, py, isHighRisk ? 3 : 2, 0, Math.PI * 2);
      ctx.fillStyle = isHighRisk ? '#ef4444' : hex2rgba(srcColor, 0.6);
      ctx.fill();

      const mx = (src.x! + tgt.x!) / 2;
      const my = (src.y! + tgt.y!) / 2;
      ctx.font = '8px system-ui';
      ctx.fillStyle = 'rgba(148, 163, 184, 0.35)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(e.type.replace(/_/g, ' '), mx, my - 6);
    }

    const visibleNodes = Math.floor(nodes.length * progress);
    for (let i = 0; i < visibleNodes; i++) {
      const n = nodes[i];
      const color = NODE_COLORS[n.type] || '#64748b';
      const isHigh = n.risk > 0.7;
      const isHov = hoveredNode === n.id;
      const baseR = isHigh ? 18 : 14;
      const r = isHov ? baseR + 4 : baseR;

      if (isHigh && isRisk) {
        const pulseR = r + 8 + Math.sin(time * 4 + i) * 4;
        ctx.beginPath();
        ctx.arc(n.x!, n.y!, pulseR, 0, Math.PI * 2);
        ctx.strokeStyle = hex2rgba('#ef4444', 0.3 + Math.sin(time * 3) * 0.1);
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      const glow = ctx.createRadialGradient(n.x!, n.y!, r * 0.3, n.x!, n.y!, r + 12);
      glow.addColorStop(0, hex2rgba(color, 0.2));
      glow.addColorStop(1, hex2rgba(color, 0));
      ctx.beginPath();
      ctx.arc(n.x!, n.y!, r + 12, 0, Math.PI * 2);
      ctx.fillStyle = glow;
      ctx.fill();

      const ig = ctx.createRadialGradient(n.x! - r * 0.25, n.y! - r * 0.25, 0, n.x!, n.y!, r);
      ig.addColorStop(0, hex2rgba(color, 0.9));
      ig.addColorStop(1, hex2rgba(color, 0.6));
      ctx.beginPath();
      ctx.arc(n.x!, n.y!, r, 0, Math.PI * 2);
      ctx.fillStyle = ig;
      ctx.fill();
      ctx.strokeStyle = hex2rgba(color, 0.8);
      ctx.lineWidth = 1.5;
      ctx.stroke();

      if (isHigh) {
        ctx.beginPath();
        ctx.arc(n.x!, n.y!, r + 3, 0, Math.PI * 2);
        ctx.strokeStyle = hex2rgba('#ef4444', 0.5);
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 2]);
        ctx.lineDashOffset = -time * 15;
        ctx.stroke();
        ctx.setLineDash([]);
      }

      ctx.font = `bold ${r > 15 ? 10 : 8}px system-ui`;
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const abbrev = n.type.slice(0, 3).toUpperCase();
      ctx.fillText(abbrev, n.x!, n.y!);

      ctx.font = 'bold 10px system-ui';
      ctx.fillStyle = 'rgba(226, 232, 240, 0.8)';
      ctx.fillText(n.label, n.x!, n.y! + r + 14);

      if (isHov) {
        const info = `${n.type} | risk: ${(n.risk * 100).toFixed(0)}%`;
        ctx.font = '9px system-ui';
        const tw = ctx.measureText(info).width;
        ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
        ctx.fillRect(n.x! - tw / 2 - 8, n.y! - r - 30, tw + 16, 20);
        ctx.strokeStyle = hex2rgba(color, 0.4);
        ctx.lineWidth = 1;
        ctx.strokeRect(n.x! - tw / 2 - 8, n.y! - r - 30, tw + 16, 20);
        ctx.fillStyle = '#e2e8f0';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(info, n.x!, n.y! - r - 20);
      }
    }

    if (progress < 1) {
      ctx.fillStyle = 'rgba(6, 182, 212, 0.7)';
      ctx.font = 'bold 14px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(`Building graph... ${Math.round(progress * 100)}%`, W / 2, H - 20);
    }

    ctx.font = 'bold 10px system-ui';
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(100, 116, 139, 0.4)';
    ctx.fillText('SPARK STREAMING + GRAPHFRAMES + VECTORDB', 12, 18);
    if (isRisk) {
      ctx.fillStyle = hex2rgba('#ef4444', 0.6 + Math.sin(time * 3) * 0.2);
      ctx.textAlign = 'right';
      ctx.font = 'bold 12px system-ui';
      ctx.fillText('RISK ELEVATED', W - 12, 18);
    }
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left) * (1100 / rect.width);
    const my = (e.clientY - rect.top) * (600 / rect.height);
    let found: string | null = null;
    for (const n of nodesRef.current) {
      const dx = mx - (n.x || 0);
      const dy = my - (n.y || 0);
      if (dx * dx + dy * dy < 400) { found = n.id; break; }
    }
    setHoveredNode(found);
  };

  const startStreaming = () => {
    if (isStreaming) {
      if (streamTimerRef.current) clearInterval(streamTimerRef.current);
      streamTimerRef.current = null;
      setIsStreaming(false);
      return;
    }
    setIsStreaming(true);
    setStreamLog([]);
    let idx = 0;
    const order = snapshots.map((_, i) => i);

    const tick = () => {
      const snapIdx = order[idx % order.length];
      const snap = snapshots[snapIdx];
      if (!snap) return;

      const stages = ['spark_ingestion', 'graphframes', 'vectordb', 'cep_engine'];
      let stageIdx = 0;

      const runStage = () => {
        if (stageIdx >= stages.length) {
          activateSnapshot(snap);
          setStreamLog(prev => [
            `[${new Date().toLocaleTimeString()}] Graph #${idx + 1} materialized - ${snap.description.slice(0, 80)}`,
            ...prev.slice(0, 19),
          ]);
          idx++;
          return;
        }
        const stage = stages[stageIdx];
        setPipelineProgress(prev => ({ ...prev, [stage]: 0 }));
        let p = 0;
        const fill = setInterval(() => {
          p += Math.random() * 30 + 10;
          if (p >= 100) {
            p = 100;
            clearInterval(fill);
            setPipelineProgress(prev => ({ ...prev, [stage]: 100 }));
            setStreamLog(prev => [
              `[${new Date().toLocaleTimeString()}] ${PIPELINE_STAGES.find(s => s.id === stage)?.label} complete (${snap.processing_latency_ms + Math.floor(Math.random() * 20)}ms)`,
              ...prev.slice(0, 19),
            ]);
            stageIdx++;
            setTimeout(runStage, 200);
          } else {
            setPipelineProgress(prev => ({ ...prev, [stage]: p }));
          }
        }, 120);
      };
      runStage();
    };

    tick();
    streamTimerRef.current = setInterval(tick, 8000);
    setStreamIdx(idx);
  };

  useEffect(() => {
    return () => {
      if (streamTimerRef.current) clearInterval(streamTimerRef.current);
    };
  }, []);

  const getMetricValue = (name: string, component: string) => {
    const m = metrics.find(m => m.metric_name === name && m.pipeline_component === component);
    return m?.metric_value || 0;
  };

  const riskColors = activeSnapshot ? RISK_COLORS[activeSnapshot.risk_level] || RISK_COLORS.low : RISK_COLORS.low;

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 rounded-xl p-6 text-white border border-slate-700/50">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-2xl font-bold flex items-center gap-3">
              <Radio className="w-7 h-7 text-cyan-400" />
              Real-Time Graph Streaming Engine
            </h2>
            <p className="text-slate-400 mt-1.5 text-sm">
              Spark Structured Streaming + GraphFrames + Mosaic AI Vector Search -- live graph materialization
            </p>
          </div>
          <button
            onClick={startStreaming}
            className={`px-6 py-3 rounded-lg font-semibold text-sm transition-all flex items-center gap-2 ${
              isStreaming
                ? 'bg-red-500/20 border border-red-500/40 text-red-400 hover:bg-red-500/30'
                : 'bg-cyan-600 hover:bg-cyan-500 text-white shadow-lg shadow-cyan-500/20'
            }`}
          >
            {isStreaming ? (
              <><Activity className="w-4 h-4 animate-pulse" /> Stop Streaming</>
            ) : (
              <><Zap className="w-4 h-4" /> Start Live Stream</>
            )}
          </button>
        </div>

        <div className="grid grid-cols-4 gap-3">
          {PIPELINE_STAGES.map((stage) => {
            const progress = pipelineProgress[stage.id] || 0;
            const latency = getMetricValue('avg_latency_ms', stage.id);
            return (
              <div key={stage.id} className="bg-white/5 rounded-lg p-4 border border-white/10">
                <div className="flex items-center gap-2 mb-2">
                  <stage.icon className="w-4 h-4" style={{ color: stage.color }} />
                  <span className="text-xs font-semibold text-slate-300">{stage.label}</span>
                </div>
                <p className="text-[10px] text-slate-500 mb-2">{stage.desc}</p>
                <div className="w-full bg-white/10 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-200"
                    style={{ width: `${progress}%`, backgroundColor: stage.color }}
                  />
                </div>
                <div className="flex items-center justify-between mt-1.5">
                  <span className="text-[10px] text-slate-500">{latency}ms avg</span>
                  <span className="text-[10px] font-mono" style={{ color: stage.color }}>
                    {progress > 0 && progress < 100 ? `${Math.round(progress)}%` : progress >= 100 ? 'DONE' : 'IDLE'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-5 gap-4">
        {[
          { label: 'Events/sec', value: getMetricValue('events_per_second', 'spark_ingestion').toLocaleString(), icon: Zap, color: 'text-amber-500', bg: 'bg-amber-50' },
          { label: 'Graph Vertices', value: getMetricValue('graph_vertices_processed', 'graphframes').toLocaleString(), icon: Network, color: 'text-blue-500', bg: 'bg-blue-50' },
          { label: 'Vector QPS', value: getMetricValue('vector_queries_per_sec', 'vectordb').toLocaleString(), icon: Brain, color: 'text-cyan-500', bg: 'bg-cyan-50' },
          { label: 'Pattern Matches', value: getMetricValue('pattern_matches', 'cep_engine').toLocaleString(), icon: Shield, color: 'text-emerald-500', bg: 'bg-emerald-50' },
          { label: 'Graph Snapshots', value: snapshots.length.toString(), icon: Layers, color: 'text-slate-600', bg: 'bg-slate-50' },
        ].map((m) => (
          <div key={m.label} className="bg-white rounded-xl shadow-lg p-5 border border-slate-200">
            <div className="flex items-center justify-between mb-2">
              <div className={`p-2.5 ${m.bg} rounded-lg`}>
                <m.icon className={`w-5 h-5 ${m.color}`} />
              </div>
              <div className="text-2xl font-bold text-slate-900">{m.value}</div>
            </div>
            <div className="text-xs text-slate-600">{m.label}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-3 space-y-3">
          <div className="bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
              <h3 className="text-sm font-bold text-slate-900">Graph Snapshots</h3>
              <p className="text-[10px] text-slate-500 mt-0.5">Click to visualize</p>
            </div>
            <div className="max-h-[520px] overflow-y-auto">
              {snapshots.map((snap) => {
                const rc = RISK_COLORS[snap.risk_level] || RISK_COLORS.low;
                const isActive = activeSnapshot?.id === snap.id;
                return (
                  <button
                    key={snap.id}
                    onClick={() => activateSnapshot(snap)}
                    className={`w-full text-left px-4 py-3 border-b border-slate-100 transition-all hover:bg-slate-50 ${
                      isActive ? 'bg-blue-50 border-l-4 border-l-blue-500' : ''
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${rc.bg} ${rc.text}`}>
                        {snap.risk_level}
                      </span>
                      <span className="text-[9px] text-slate-400 font-mono">{snap.risk_score}%</span>
                      {snap.snapshot_type === 'risk_elevated' && (
                        <AlertTriangle className="w-3 h-3 text-red-500" />
                      )}
                    </div>
                    <p className="text-xs text-slate-700 font-medium leading-snug line-clamp-2">
                      {snap.description.slice(0, 90)}
                    </p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="text-[9px] text-slate-400">
                        {snap.graph_data.nodes?.length || 0} nodes
                      </span>
                      <span className="text-[9px] text-slate-400">
                        {snap.graph_data.edges?.length || 0} edges
                      </span>
                      <span className="text-[9px] text-slate-400">
                        {snap.processing_latency_ms}ms
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="col-span-9 space-y-4">
          <div className={`rounded-xl shadow-2xl border overflow-hidden ${
            activeSnapshot?.snapshot_type === 'risk_elevated'
              ? 'bg-slate-950 border-red-500/30'
              : 'bg-slate-950 border-slate-800'
          }`}>
            <div className="px-5 py-3 bg-slate-900/80 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Eye className="w-4 h-4 text-cyan-400" />
                  Live Graph Materialization
                </h3>
                {activeSnapshot && (
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    {activeSnapshot.pipeline_stage.replace(/_/g, ' ')} | {activeSnapshot.vector_embeddings_count} embeddings | {activeSnapshot.processing_latency_ms}ms latency
                  </p>
                )}
              </div>
              {activeSnapshot && (
                <div className="flex items-center gap-3">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${riskColors.bg} ${riskColors.text} border ${riskColors.border}`}>
                    {activeSnapshot.risk_level} RISK
                  </span>
                  <span className="text-xs font-mono text-slate-400">
                    Score: {activeSnapshot.risk_score}/100
                  </span>
                </div>
              )}
            </div>
            <div className="p-3">
              <canvas
                ref={canvasRef}
                onMouseMove={handleCanvasMouseMove}
                onMouseLeave={() => setHoveredNode(null)}
                className="w-full rounded-lg cursor-crosshair"
                style={{ maxWidth: '1100px', height: 'auto', aspectRatio: '1100/600' }}
              />
            </div>

            {activeSnapshot && (
              <div className="px-5 py-3 bg-slate-900/50 border-t border-slate-800">
                <p className="text-xs text-slate-400 leading-relaxed">
                  {activeSnapshot.description}
                </p>
                <div className="flex items-center gap-3 mt-2">
                  {Object.entries(NODE_COLORS).slice(0, 7).map(([type, color]) => (
                    <div key={type} className="flex items-center gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
                      <span className="text-[9px] text-slate-500">{type}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {activeSnapshot && (
            <div className="bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden">
              <div className="px-5 py-3 bg-slate-50 border-b border-slate-200">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-slate-600" />
                  Pipeline Execution Detail
                </h3>
              </div>
              <div className="p-5">
                <div className="flex items-center gap-1">
                  {PIPELINE_STAGES.map((stage, idx) => (
                    <div key={stage.id} className="flex items-center flex-1">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <div className="p-1.5 rounded-lg" style={{ backgroundColor: hex2rgba(stage.color, 0.1) }}>
                            <stage.icon className="w-3.5 h-3.5" style={{ color: stage.color }} />
                          </div>
                          <span className="text-[10px] font-semibold text-slate-700">{stage.label}</span>
                        </div>
                        <div className="ml-7 space-y-0.5">
                          <div className="text-[9px] text-slate-500">
                            {stage.id === 'spark_ingestion' && 'Kafka consumer groups read micro-batches, apply watermark, parse schemas'}
                            {stage.id === 'graphframes' && 'Build vertex/edge DataFrames, run PageRank(0.85), find connected components, motif queries'}
                            {stage.id === 'vectordb' && 'Generate node2vec embeddings (dim=128), ANN index via Mosaic AI, cosine similarity search'}
                            {stage.id === 'cep_engine' && 'Temporal pattern matching, risk score aggregation, alert threshold evaluation'}
                          </div>
                        </div>
                      </div>
                      {idx < PIPELINE_STAGES.length - 1 && (
                        <ChevronRight className="w-4 h-4 text-slate-300 mx-1 flex-shrink-0" />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {streamLog.length > 0 && (
        <div className="bg-slate-950 rounded-xl border border-slate-800 overflow-hidden">
          <div className="px-5 py-3 bg-slate-900/80 border-b border-slate-800 flex items-center gap-2">
            <Activity className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-bold text-white">Stream Processing Log</h3>
            <div className="ml-auto flex items-center gap-1.5">
              <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
              <span className="text-[10px] text-emerald-400">LIVE</span>
            </div>
          </div>
          <div className="p-4 max-h-48 overflow-y-auto font-mono text-[11px] text-slate-400 space-y-0.5">
            {streamLog.map((line, i) => (
              <div key={i} className={`${
                line.includes('CRITICAL') || line.includes('risk_elevated')
                  ? 'text-red-400'
                  : line.includes('complete')
                    ? 'text-emerald-400'
                    : 'text-slate-400'
              }`}>
                {line}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
