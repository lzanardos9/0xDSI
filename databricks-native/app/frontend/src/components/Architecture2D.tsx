import React, { useState } from 'react';
import {
  Brain, Database, Layers, Network, Zap, Activity, Shield,
  Search, MessageSquare, ChevronDown, Server, GitBranch, TrendingUp
} from 'lucide-react';

const PIPELINE = [
  { name: 'Data Sources', sub: 'Multi-Cloud Ingestion', color: 'slate' as const, items: ['Kafka / Kinesis', 'Syslog / CEF / JSON', 'Cloud APIs (AWS/Azure/GCP)', 'EDR / NDR Telemetry'] },
  { name: 'Spark Streaming', sub: 'Real-time Processing', color: 'orange' as const, items: ['Auto Loader + DLT', '2.4M events/sec', 'Schema inference', 'Exactly-once delivery'] },
  { name: 'Bronze', sub: 'Raw Event Store', color: 'amber' as const, items: ['security_events', 'network_flows', 'endpoint_logs', 'cloud_audit_trails'] },
  { name: 'Silver', sub: 'Enriched & Normalized', color: 'blue' as const, items: ['OCSF schema mapping', 'GeoIP + WHOIS enrichment', 'Entity resolution', 'Threat intel correlation'] },
  { name: 'Gold', sub: 'AI/ML Ready', color: 'cyan' as const, items: ['ML feature tables', 'Vector embeddings', 'Graph entities', 'Analytics materialized views'] },
];

const CORE_TECH = [
  {
    id: 'ml', name: 'ML Models', sub: 'Production AI Pipeline', icon: Brain, color: 'emerald' as const,
    stats: [{ l: 'Active', v: '12' }, { l: 'Accuracy', v: '96.4%' }, { l: 'P99', v: '8ms' }],
    features: ['XGBoost threat classification (96.2%)', 'LSTM behavior sequence analysis', 'Isolation Forest anomaly detection', 'Transformer NLP log parsing', 'LightGBM malware scoring', 'AutoML model selection & tuning'],
    detail: 'End-to-end ML lifecycle with experiment tracking, automated retraining, serverless GPU endpoints, and champion/challenger deployment.',
  },
  {
    id: 'vector', name: 'VectorDB', sub: 'Semantic Search Engine', icon: Search, color: 'teal' as const,
    stats: [{ l: 'Dimensions', v: '384' }, { l: 'Latency', v: '<100ms' }, { l: 'Index', v: 'HNSW' }],
    features: ['Security event embeddings (BGE-large)', 'IOC similarity matching', 'Behavioral pattern search', 'Hybrid keyword + vector queries', 'Delta Sync real-time updates', 'ANN with HNSW indexing'],
    detail: 'Purpose-built vector database with Mosaic AI foundation model embeddings, enabling semantic threat hunting across billions of events.',
  },
  {
    id: 'graph', name: 'GraphFrames', sub: 'Attack Graph Analytics', icon: GitBranch, color: 'blue' as const,
    stats: [{ l: 'Nodes', v: '842K' }, { l: 'Edges', v: '3.2M' }, { l: 'Algos', v: '7' }],
    features: ['Kill chain reconstruction', 'Lateral movement path tracing', 'Entity relationship mapping', 'Community detection (Louvain)', 'Centrality & PageRank analysis', 'Temporal graph pattern matching'],
    detail: 'Distributed graph processing on Spark for attack path analysis, entity resolution, and complex relationship discovery at scale.',
  },
  {
    id: 'agents', name: 'AI Agents', sub: '5 Specialized SOC Agents', icon: MessageSquare, color: 'amber' as const,
    stats: [{ l: 'Online', v: '5' }, { l: 'Tasks/hr', v: '856' }, { l: 'MTTR', v: '-73%' }],
    features: ['Atlas: Alert triage & confidence scoring', 'Sage: Threat intel enrichment', 'Commander: Multi-agent orchestrator', 'Nova: Root cause investigation', 'Vanguard: Automated containment'],
    detail: 'LLM-powered agents with DBRX + LangChain, shared memory via VectorDB, RLHF from analyst feedback, and autonomous playbook execution.',
  },
  {
    id: 'cep', name: 'CEP Engine', sub: 'Complex Event Processing', icon: Zap, color: 'rose' as const,
    stats: [{ l: 'Rules', v: '247' }, { l: 'Window', v: '5min' }, { l: 'Matches', v: '1.2K/h' }],
    features: ['Temporal pattern matching', 'Sliding window aggregations', 'Multi-event attack correlation', 'Threshold-based alerting', 'MITRE ATT&CK mapping', 'Stateful stream processing'],
    detail: 'Real-time complex event processing detecting multi-stage attack patterns and triggering automated response playbooks.',
  },
  {
    id: 'streaming', name: 'Spark Streaming', sub: 'Real-time Data Fabric', icon: Activity, color: 'orange' as const,
    stats: [{ l: 'Throughput', v: '2.4M/s' }, { l: 'Latency', v: '12ms' }, { l: 'Uptime', v: '99.99%' }],
    features: ['Structured Streaming micro-batches', 'Photon-accelerated processing', 'Watermarking for late data', 'Stateful transformations', 'Auto Loader schema evolution', 'Delta Live Tables pipelines'],
    detail: 'Enterprise-grade stream processing with Photon acceleration, exactly-once semantics, and auto-scaling serverless compute.',
  },
];

const FOUNDATION = [
  { name: 'MLflow', sub: 'Model Operations', icon: TrendingUp, color: 'emerald' as const, items: ['Experiment tracking & versioning', 'Model registry with lineage', 'A/B testing & canary deploys', 'Auto-scaling serving endpoints'] },
  { name: 'Unity Catalog', sub: 'Data Governance', icon: Shield, color: 'sky' as const, items: ['Fine-grained ACL policies', 'Column-level security', 'Data lineage tracking', 'Cross-workspace federation'] },
  { name: 'Delta Lake', sub: 'Storage Engine', icon: Database, color: 'orange' as const, items: ['ACID transactions at scale', 'Time travel & versioning', 'Z-ordering & liquid clustering', 'Change Data Feed streaming'] },
];

const C: Record<string, { text: string; border: string; bg: string; dot: string }> = {
  slate:   { text: 'text-slate-300',   border: 'border-slate-600/30',   bg: 'bg-slate-800/40',  dot: 'bg-slate-400'   },
  orange:  { text: 'text-orange-400',  border: 'border-orange-500/30',  bg: 'bg-orange-500/10', dot: 'bg-orange-400'  },
  amber:   { text: 'text-amber-400',   border: 'border-amber-500/30',   bg: 'bg-amber-500/10',  dot: 'bg-amber-400'   },
  blue:    { text: 'text-blue-400',    border: 'border-blue-500/30',    bg: 'bg-blue-500/10',   dot: 'bg-blue-400'    },
  cyan:    { text: 'text-cyan-400',    border: 'border-cyan-500/30',    bg: 'bg-cyan-500/10',   dot: 'bg-cyan-400'    },
  emerald: { text: 'text-emerald-400', border: 'border-emerald-500/30', bg: 'bg-emerald-500/10',dot: 'bg-emerald-400' },
  teal:    { text: 'text-teal-400',    border: 'border-teal-500/30',    bg: 'bg-teal-500/10',   dot: 'bg-teal-400'    },
  rose:    { text: 'text-rose-400',    border: 'border-rose-500/30',    bg: 'bg-rose-500/10',   dot: 'bg-rose-400'    },
  sky:     { text: 'text-sky-400',     border: 'border-sky-500/30',     bg: 'bg-sky-500/10',    dot: 'bg-sky-400'     },
};

function SectionHeader({ icon: Icon, label }: { icon: React.FC<{ className?: string }>; label: string }) {
  return (
    <div className="flex items-center gap-2 mb-5">
      <Icon className="w-4 h-4 text-slate-500" />
      <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest">{label}</h3>
      <div className="flex-1 h-px bg-gradient-to-r from-slate-700/50 to-transparent" />
    </div>
  );
}

const Architecture2D: React.FC = () => {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div className="w-full space-y-10">
      <div className="relative overflow-hidden rounded-2xl border border-slate-700/50 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(6,182,212,0.08),transparent_50%),radial-gradient(ellipse_at_bottom_left,_rgba(249,115,22,0.06),transparent_50%)]" />
        <div className="relative p-8">
          <div className="flex items-center gap-4 mb-6">
            <div className="p-3.5 bg-gradient-to-br from-orange-500 to-red-600 rounded-xl shadow-lg shadow-orange-500/20">
              <Network className="w-7 h-7 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white tracking-tight">Agentic SOC Platform Architecture</h2>
              <p className="text-slate-400 text-sm mt-0.5">Databricks Lakehouse | AI-Powered Security Analytics | Real-time Threat Detection</p>
            </div>
            <div className="ml-auto flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-emerald-400 text-xs font-bold tracking-wider">OPERATIONAL</span>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {[
              { label: 'Events/sec', value: '2.4M', color: 'text-cyan-400' },
              { label: 'ML Models', value: '12 Active', color: 'text-emerald-400' },
              { label: 'AI Agents', value: '5 Online', color: 'text-amber-400' },
              { label: 'Avg Latency', value: '12ms P99', color: 'text-blue-400' },
              { label: 'Threat Level', value: 'ELEVATED', color: 'text-rose-400' },
            ].map(m => (
              <div key={m.label} className="bg-slate-800/50 rounded-lg p-3 border border-slate-700/40 hover:border-slate-600/60 transition-all">
                <div className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">{m.label}</div>
                <div className={`text-lg font-bold tabular-nums mt-0.5 ${m.color}`}>{m.value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div>
        <SectionHeader icon={Layers} label="Medallion Data Pipeline" />
        <div className="flex gap-1 items-stretch overflow-x-auto pb-2">
          {PIPELINE.map((stage, i) => {
            const c = C[stage.color];
            return (
              <React.Fragment key={stage.name}>
                <div className={`flex-1 min-w-[170px] rounded-xl border ${c.border} ${c.bg} p-4 transition-all duration-200 hover:scale-[1.02]`}>
                  <div className={`text-xs font-bold ${c.text} uppercase tracking-wider`}>{stage.name}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5 mb-3">{stage.sub}</div>
                  <div className="space-y-1.5">
                    {stage.items.map(item => (
                      <div key={item} className="flex items-center gap-1.5">
                        <span className={`w-1 h-1 rounded-full flex-shrink-0 ${c.dot}`} />
                        <span className="text-[11px] text-slate-300 font-mono leading-tight">{item}</span>
                      </div>
                    ))}
                  </div>
                </div>
                {i < PIPELINE.length - 1 && (
                  <div className="flex items-center flex-shrink-0 px-0.5">
                    <div className="relative w-7 h-full flex items-center">
                      <div className="absolute inset-x-0 top-1/2 h-[2px] -translate-y-1/2 bg-slate-700/60" />
                      <div className="absolute inset-x-0 top-1/2 h-[2px] -translate-y-1/2 arch-flow-line" style={{ '--flow-color': 'rgba(6,182,212,0.4)' } as React.CSSProperties} />
                      <div className="absolute right-0 top-1/2 -translate-y-1/2 w-0 h-0 border-t-[4px] border-t-transparent border-b-[4px] border-b-transparent border-l-[6px] border-l-cyan-500/50" />
                    </div>
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      <div>
        <SectionHeader icon={Brain} label="Core AI Technologies" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {CORE_TECH.map(tech => {
            const c = C[tech.color];
            const Icon = tech.icon;
            const isOpen = expanded === tech.id;
            return (
              <div
                key={tech.id}
                className={`rounded-xl border ${c.border} ${c.bg} transition-all duration-300 cursor-pointer group ${
                  isOpen ? 'ring-1 ring-white/10' : 'hover:scale-[1.01]'
                }`}
                onClick={() => setExpanded(isOpen ? null : tech.id)}
              >
                <div className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className={`p-2.5 rounded-xl ${c.bg} border ${c.border} transition-all group-hover:shadow-lg`}>
                        <Icon className={`w-5 h-5 ${c.text}`} />
                      </div>
                      <div>
                        <h4 className="text-white font-bold text-sm">{tech.name}</h4>
                        <p className="text-slate-500 text-[11px] mt-0.5">{tech.sub}</p>
                      </div>
                    </div>
                    <ChevronDown className={`w-4 h-4 text-slate-600 transition-transform duration-300 mt-1 ${isOpen ? 'rotate-180 text-slate-400' : ''}`} />
                  </div>
                  <div className="grid grid-cols-3 gap-2 mb-1">
                    {tech.stats.map(s => (
                      <div key={s.l} className="bg-slate-900/50 rounded-lg p-2 text-center border border-slate-800/60">
                        <div className={`text-sm font-bold tabular-nums ${c.text}`}>{s.v}</div>
                        <div className="text-[9px] text-slate-500 mt-0.5 uppercase tracking-wider">{s.l}</div>
                      </div>
                    ))}
                  </div>
                  <div className={`overflow-hidden transition-all duration-300 ${isOpen ? 'max-h-96 mt-3 opacity-100' : 'max-h-0 opacity-0'}`}>
                    <div className="pt-3 border-t border-slate-700/30 space-y-1.5">
                      {tech.features.map(f => (
                        <div key={f} className="flex items-start gap-2">
                          <span className={`w-1 h-1 rounded-full mt-1.5 flex-shrink-0 ${c.dot}`} />
                          <span className="text-xs text-slate-300">{f}</span>
                        </div>
                      ))}
                    </div>
                    <p className="text-[11px] text-slate-400 mt-3 pt-2 border-t border-slate-700/30 leading-relaxed">{tech.detail}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <SectionHeader icon={Server} label="Platform Foundation" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {FOUNDATION.map(svc => {
            const c = C[svc.color];
            const Icon = svc.icon;
            return (
              <div key={svc.name} className={`rounded-xl border ${c.border} ${c.bg} p-5 transition-all duration-200 hover:scale-[1.01]`}>
                <div className="flex items-center gap-3 mb-4">
                  <div className={`p-2 rounded-lg ${c.bg} border ${c.border}`}>
                    <Icon className={`w-4 h-4 ${c.text}`} />
                  </div>
                  <div>
                    <h4 className="text-white font-semibold text-sm">{svc.name}</h4>
                    <p className="text-slate-500 text-[10px]">{svc.sub}</p>
                  </div>
                </div>
                <div className="space-y-1.5">
                  {svc.items.map(item => (
                    <div key={item} className="flex items-center gap-2">
                      <span className={`w-1 h-1 rounded-full ${c.dot}`} />
                      <span className="text-xs text-slate-300">{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-700/40 bg-gradient-to-br from-slate-900/80 to-slate-800/40 p-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-6">
          {[
            { label: 'Query Acceleration', value: '100x', sub: 'Photon Engine', color: 'text-orange-400' },
            { label: 'Storage Scale', value: 'Petabyte+', sub: 'Delta Lake ACID', color: 'text-cyan-400' },
            { label: 'Model Inference', value: 'Sub-10ms', sub: 'GPU Accelerated', color: 'text-emerald-400' },
            { label: 'SOC Efficiency', value: '+73%', sub: 'Agent Automation', color: 'text-amber-400' },
          ].map(m => (
            <div key={m.label} className="text-center">
              <div className={`text-3xl font-bold tracking-tight ${m.color}`}>{m.value}</div>
              <div className="text-xs text-white font-medium mt-1">{m.label}</div>
              <div className="text-[10px] text-slate-500 mt-0.5">{m.sub}</div>
            </div>
          ))}
        </div>
        <div className="border-t border-slate-700/30 pt-4 flex items-start gap-3">
          <Shield className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-slate-400 leading-relaxed">
            Powered by the <strong className="text-slate-200">Databricks Lakehouse</strong> with Delta Lake, Unity Catalog, and Photon Engine.
            All data follows the <strong className="text-slate-200">medallion architecture</strong> (Bronze/Silver/Gold) with end-to-end AI/ML integration,
            semantic vector search, distributed graph analytics, and autonomous multi-agent SOC orchestration.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Architecture2D;
