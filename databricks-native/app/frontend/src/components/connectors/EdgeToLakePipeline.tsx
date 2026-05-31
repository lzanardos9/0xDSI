import React, { useMemo, useEffect, useState } from 'react';
import {
  Activity,
  AlertCircle,
  Cpu,
  Database,
  FileText,
  Gauge,
  HardDrive,
  Layers,
  Zap,
  TrendingUp,
  TrendingDown,
  CheckCircle,
  AlertTriangle,
  Clock,
  BarChart3,
  Network,
  Shield,
} from 'lucide-react';

export default function EdgeToLakePipeline() {
  const [animationPhase, setAnimationPhase] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setAnimationPhase((p) => (p + 1) % 100);
    }, 50);
    return () => clearInterval(interval);
  }, []);

  // Mock data
  const edgeMetrics = {
    collectors: 36,
    ingressEps: '712K',
    docker: 18,
    systemd: 12,
    kubernetes: 6,
  };

  const transportMetrics = {
    kafkaPartitions: 3,
    consumerLag: 1240,
    queueDepth: 8500,
    httpsDirectIngest: '23%',
  };

  const bronzeMetrics = {
    size: '2.4TB',
    dailyGrowth: '182GB',
    retentionDays: 90,
    partitionScheme: 'date/dna_name',
  };

  const silverMetrics = {
    dedupRate: 12,
    enrichmentHits: 89,
    schemaCompliance: 99.7,
    recordsProcessed: '4.2M/hour',
  };

  const goldMetrics = {
    correlationMatches: 1247,
    alertGenRate: '342/hour',
    entitySpineUpdates: 1850,
  };

  const latencyBreakdown = [
    { label: 'Edge Parsing', value: 0.3, color: 'bg-cyan-500' },
    { label: 'Network Transit', value: 1.2, color: 'bg-cyan-600' },
    { label: 'Kafka Queue', value: 0.8, color: 'bg-blue-500' },
    { label: 'Bronze Write', value: 2.1, color: 'bg-emerald-600' },
    { label: 'Silver Transform', value: 4.5, color: 'bg-emerald-500' },
    { label: 'Gold Aggregation', value: 12.0, color: 'bg-amber-600' },
  ];

  const totalLatency = latencyBreakdown.reduce((sum, item) => sum + item.value, 0);
  const maxLatency = Math.max(...latencyBreakdown.map((item) => item.value));

  // Data quality metrics
  const schemaViolations = 0.3;
  const quarantineRate = 0.42;
  const dnaCompliance = [
    { name: 'DNS', compliance: 99.8 },
    { name: 'HTTP', compliance: 99.5 },
    { name: 'TLS', compliance: 99.9 },
    { name: 'SSL', compliance: 99.6 },
  ];

  // Live partition status
  const todayPartitions = [
    { dnaName: 'DNS', eventCount: 145230, fileCount: 24, avgSize: '3.2MB' },
    { dnaName: 'HTTP', eventCount: 98750, fileCount: 18, avgSize: '3.8MB' },
    { dnaName: 'TLS', eventCount: 234560, fileCount: 42, avgSize: '2.9MB' },
    { dnaName: 'SSL', eventCount: 156890, fileCount: 28, avgSize: '3.1MB' },
  ];

  // Backpressure indicators
  const backpressure = {
    kafkaLag: 1240, // milliseconds
    diskUsage: 73,
    bronzeWriteThroughput: 85, // percentage of capacity
    memoryPressure: 62,
  };

  const getBackpressureColor = (value, thresholds = [50, 80]) => {
    if (value < thresholds[0]) return { bg: 'bg-emerald-900', indicator: 'bg-emerald-500' };
    if (value < thresholds[1]) return { bg: 'bg-amber-900', indicator: 'bg-amber-500' };
    return { bg: 'bg-red-900', indicator: 'bg-red-500' };
  };

  const getKafkaLagColor = (lag) => {
    if (lag < 1000) return { bg: 'bg-emerald-900', indicator: 'bg-emerald-500' };
    if (lag < 5000) return { bg: 'bg-amber-900', indicator: 'bg-amber-500' };
    return { bg: 'bg-red-900', indicator: 'bg-red-500' };
  };

  // Animated flow particles
  const flowParticles = useMemo(
    () => Array.from({ length: 12 }, (_, i) => ({
      id: i,
      offset: (animationPhase + (i * 100) / 12) % 100,
    })),
    [animationPhase]
  );

  const kafkaLagColor = getKafkaLagColor(backpressure.kafkaLag);
  const diskUsageColor = getBackpressureColor(backpressure.diskUsage);
  const bronzeWriteColor = getBackpressureColor(backpressure.bronzeWriteThroughput);
  const memoryColor = getBackpressureColor(backpressure.memoryPressure);

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 overflow-auto">
      <style>{`
        @keyframes flowLeft {
          0% { transform: translateX(-20px); opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { transform: translateX(20px); opacity: 0; }
        }
        @keyframes pulse-glow {
          0%, 100% { box-shadow: 0 0 4px rgba(34, 197, 94, 0.3); }
          50% { box-shadow: 0 0 12px rgba(34, 197, 94, 0.6); }
        }
        @keyframes pulse-amber {
          0%, 100% { box-shadow: 0 0 4px rgba(245, 158, 11, 0.3); }
          50% { box-shadow: 0 0 12px rgba(245, 158, 11, 0.6); }
        }
        @keyframes slide-in {
          from { transform: translateX(-100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        .flow-particle {
          animation: flowLeft 3s linear infinite;
        }
        .pulse-emerald {
          animation: pulse-glow 2s ease-in-out infinite;
        }
        .pulse-amber-glow {
          animation: pulse-amber 2s ease-in-out infinite;
        }
        .text-mono {
          font-family: 'Courier New', monospace;
          font-weight: 600;
        }
      `}</style>

      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="border-b border-slate-700 pb-4">
          <div className="flex items-center gap-3 mb-2">
            <Layers className="w-8 h-8 text-cyan-400" />
            <h1 className="text-3xl font-bold text-slate-100">Edge-to-Lake Pipeline</h1>
          </div>
          <p className="text-slate-400">Real-time security event flow through Databricks Lakehouse</p>
        </div>

        {/* Architecture Overview */}
        <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
          <h2 className="text-xl font-semibold text-cyan-400 mb-6 flex items-center gap-2">
            <Network className="w-5 h-5" />
            Architecture Overview
          </h2>

          <div className="space-y-8">
            {/* Pipeline stages */}
            <div className="flex justify-between items-stretch gap-4 relative">
              {/* Flow lines with animated particles */}
              <div className="absolute inset-0 flex justify-between px-8 pointer-events-none" style={{ top: '60px', height: '40px' }}>
                {[0, 1, 2, 3].map((i) => (
                  <div
                    key={`flow-${i}`}
                    className="relative flex-1 mx-2"
                    style={{ position: 'relative', height: '2px', background: 'linear-gradient(90deg, transparent, rgba(34, 197, 94, 0.5), transparent)' }}
                  >
                    {flowParticles.slice(i * 3, (i + 1) * 3).map((particle) => (
                      <div
                        key={particle.id}
                        className="flow-particle absolute w-2 h-2 bg-emerald-400 rounded-full"
                        style={{ left: `${particle.offset}%`, top: '-4px' }}
                      />
                    ))}
                  </div>
                ))}
              </div>

              {/* EDGE Stage */}
              <div className="flex-1 bg-slate-900 rounded-lg p-4 border border-slate-600 flex flex-col">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-emerald-400 flex items-center gap-2">
                    <Cpu className="w-5 h-5" />
                    EDGE
                  </h3>
                  <span className="text-xs bg-emerald-900 text-emerald-300 px-2 py-1 rounded">COLLECTORS</span>
                </div>
                <div className="space-y-3 flex-1">
                  <div className="text-2xl font-bold text-mono text-cyan-300">{edgeMetrics.collectors}</div>
                  <p className="text-xs text-slate-400">Active collectors</p>
                  <div className="text-lg font-semibold text-mono text-amber-400">{edgeMetrics.ingressEps} EPS</div>
                  <p className="text-xs text-slate-400">Total ingress</p>
                  <div className="bg-slate-800 rounded p-2 text-xs space-y-1">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Docker:</span>
                      <span className="text-cyan-300 font-mono">{edgeMetrics.docker}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">SystemD:</span>
                      <span className="text-cyan-300 font-mono">{edgeMetrics.systemd}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Kubernetes:</span>
                      <span className="text-cyan-300 font-mono">{edgeMetrics.kubernetes}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* TRANSPORT Stage */}
              <div className="flex-1 bg-slate-900 rounded-lg p-4 border border-slate-600 flex flex-col">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-blue-400 flex items-center gap-2">
                    <Network className="w-5 h-5" />
                    TRANSPORT
                  </h3>
                  <span className="text-xs bg-blue-900 text-blue-300 px-2 py-1 rounded">INGESTION</span>
                </div>
                <div className="space-y-3 flex-1">
                  <div>
                    <p className="text-xs text-slate-400 mb-1">Kafka Topics</p>
                    <div className="flex gap-4">
                      <div>
                        <div className="text-lg font-bold text-mono text-cyan-300">{transportMetrics.kafkaPartitions}</div>
                        <p className="text-xs text-slate-500">partitions</p>
                      </div>
                      <div>
                        <div className="text-lg font-bold text-mono text-amber-400">{transportMetrics.consumerLag}</div>
                        <p className="text-xs text-slate-500">lag (ms)</p>
                      </div>
                    </div>
                  </div>
                  <div className="border-t border-slate-700 pt-2">
                    <p className="text-xs text-slate-400 mb-1">Queue Depth</p>
                    <div className="text-lg font-bold text-mono text-emerald-400">{transportMetrics.queueDepth}</div>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400 mb-1">HTTPS Direct</p>
                    <div className="text-sm font-semibold text-cyan-300">{transportMetrics.httpsDirectIngest}</div>
                  </div>
                </div>
              </div>

              {/* BRONZE Stage */}
              <div className="flex-1 bg-slate-900 rounded-lg p-4 border border-slate-600 flex flex-col">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-cyan-400 flex items-center gap-2">
                    <Database className="w-5 h-5" />
                    BRONZE
                  </h3>
                  <span className="text-xs bg-cyan-900 text-cyan-300 px-2 py-1 rounded">RAW</span>
                </div>
                <div className="space-y-3 flex-1">
                  <div>
                    <p className="text-xs text-slate-400">Table Size</p>
                    <div className="text-xl font-bold text-mono text-emerald-400">{bronzeMetrics.size}</div>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">Daily Growth:</span>
                    <span className="text-cyan-300 font-mono">{bronzeMetrics.dailyGrowth}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">Retention:</span>
                    <span className="text-cyan-300 font-mono">{bronzeMetrics.retentionDays}d</span>
                  </div>
                  <div className="bg-slate-800 rounded p-2 text-xs">
                    <p className="text-slate-500 mb-1">Partition Scheme</p>
                    <p className="text-mono text-cyan-300">{bronzeMetrics.partitionScheme}</p>
                  </div>
                </div>
              </div>

              {/* SILVER Stage */}
              <div className="flex-1 bg-slate-900 rounded-lg p-4 border border-slate-600 flex flex-col">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-emerald-400 flex items-center gap-2">
                    <Layers className="w-5 h-5" />
                    SILVER
                  </h3>
                  <span className="text-xs bg-emerald-900 text-emerald-300 px-2 py-1 rounded">NORMALIZED</span>
                </div>
                <div className="space-y-3 flex-1">
                  <div>
                    <p className="text-xs text-slate-400 mb-1">OCSF Events</p>
                    <p className="text-xl font-bold text-mono text-cyan-300">{silverMetrics.recordsProcessed}</p>
                  </div>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Dedup Rate:</span>
                      <span className="text-cyan-300 font-mono">{silverMetrics.dedupRate}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Enrichment:</span>
                      <span className="text-cyan-300 font-mono">{silverMetrics.enrichmentHits}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Schema OK:</span>
                      <span className="text-emerald-300 font-mono">{silverMetrics.schemaCompliance}%</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* GOLD Stage */}
              <div className="flex-1 bg-slate-900 rounded-lg p-4 border border-slate-600 flex flex-col">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-amber-400 flex items-center gap-2">
                    <BarChart3 className="w-5 h-5" />
                    GOLD
                  </h3>
                  <span className="text-xs bg-amber-900 text-amber-300 px-2 py-1 rounded">ANALYTICS</span>
                </div>
                <div className="space-y-3 flex-1">
                  <div>
                    <p className="text-xs text-slate-400 mb-1">Correlations</p>
                    <div className="text-lg font-bold text-mono text-amber-400">{goldMetrics.correlationMatches}</div>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400 mb-1">Alert Gen</p>
                    <div className="text-sm font-semibold text-mono text-cyan-300">{goldMetrics.alertGenRate}</div>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400 mb-1">Entity Spine Updates</p>
                    <div className="text-lg font-bold text-mono text-emerald-400">{goldMetrics.entitySpineUpdates}/min</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Latency Waterfall */}
        <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
          <h2 className="text-xl font-semibold text-cyan-400 mb-6 flex items-center gap-2">
            <Clock className="w-5 h-5" />
            Latency Waterfall (End-to-End)
          </h2>

          <div className="space-y-4">
            {latencyBreakdown.map((item, idx) => (
              <div key={idx} className="space-y-1">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-300">{item.label}</span>
                  <span className="font-mono text-cyan-300">{item.value.toFixed(1)}ms</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-slate-900 rounded h-6 overflow-hidden border border-slate-600">
                    <div
                      className={`${item.color} h-full flex items-center justify-end pr-2 transition-all duration-300`}
                      style={{ width: `${(item.value / maxLatency) * 100}%` }}
                    >
                      {item.value > 3 && <span className="text-xs font-mono text-slate-900">{item.value.toFixed(1)}</span>}
                    </div>
                  </div>
                </div>
              </div>
            ))}

            <div className="border-t border-slate-600 pt-4 mt-4">
              <div className="flex justify-between items-center">
                <span className="text-lg font-semibold text-slate-100">Total Latency</span>
                <div className="text-2xl font-bold text-mono text-emerald-400">{totalLatency.toFixed(1)}ms</div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6">
          {/* Data Quality Panel */}
          <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
            <h2 className="text-xl font-semibold text-cyan-400 mb-6 flex items-center gap-2">
              <Shield className="w-5 h-5" />
              Data Quality Metrics
            </h2>

            <div className="space-y-6">
              {/* Schema Violations */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm text-slate-400">Schema Violations</span>
                  <span className="text-lg font-mono text-emerald-400">{schemaViolations}%</span>
                </div>
                <div className="relative w-32 h-32 mx-auto">
                  <svg viewBox="0 0 36 36" className="w-32 h-32">
                    <circle
                      cx="18"
                      cy="18"
                      r="15.915"
                      fill="none"
                      stroke="rgba(148, 163, 184, 0.2)"
                      strokeWidth="3"
                    />
                    <circle
                      cx="18"
                      cy="18"
                      r="15.915"
                      fill="none"
                      stroke="url(#grad)"
                      strokeWidth="3"
                      strokeDasharray={`${(schemaViolations / 100) * 100} 100`}
                      strokeLinecap="round"
                      transform="rotate(-90 18 18)"
                    />
                    <defs>
                      <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#22c55e" />
                        <stop offset="100%" stopColor="#10b981" />
                      </linearGradient>
                    </defs>
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-center font-mono text-xs text-slate-300">COMPLIANT</span>
                  </div>
                </div>
              </div>

              {/* Quarantine Rate */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-slate-400">Quarantine Rate</span>
                  <span className="text-lg font-mono text-amber-400">{quarantineRate.toFixed(2)}%</span>
                </div>
                <div className="flex items-center gap-2">
                  <TrendingDown className="w-4 h-4 text-emerald-500" />
                  <span className="text-xs text-emerald-400">Improving (↓0.08%)</span>
                </div>
              </div>

              {/* DNA Compliance */}
              <div>
                <p className="text-sm text-slate-400 mb-3">OCSF Compliance by DNA Type</p>
                <div className="space-y-2">
                  {dnaCompliance.map((item, idx) => (
                    <div key={idx} className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-300">{item.name}</span>
                        <span className="text-mono text-cyan-300">{item.compliance}%</span>
                      </div>
                      <div className="bg-slate-900 rounded h-2 overflow-hidden border border-slate-600">
                        <div
                          className="bg-emerald-500 h-full"
                          style={{ width: `${item.compliance}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Dead Letter Queue */}
              <div className="border-t border-slate-600 pt-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-400">DLQ Depth</span>
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-500" />
                    <span className="text-mono text-emerald-400">0 messages</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Live Partition Status */}
          <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
            <h2 className="text-xl font-semibold text-cyan-400 mb-6 flex items-center gap-2">
              <Database className="w-5 h-5" />
              Today's Partitions
            </h2>

            <div className="space-y-3 max-h-96 overflow-y-auto">
              {todayPartitions.map((partition, idx) => (
                <div
                  key={idx}
                  className="bg-slate-900 rounded p-3 border border-slate-600 hover:border-cyan-600 transition-colors"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-emerald-500 pulse-emerald" />
                      <span className="font-semibold text-slate-100">{partition.dnaName}</span>
                    </div>
                    <span className="text-xs bg-emerald-900 text-emerald-300 px-2 py-1 rounded">OPTIMIZED</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <p className="text-slate-500">Events</p>
                      <p className="font-mono text-cyan-300">{(partition.eventCount / 1000).toFixed(0)}K</p>
                    </div>
                    <div>
                      <p className="text-slate-500">Files</p>
                      <p className="font-mono text-cyan-300">{partition.fileCount}</p>
                    </div>
                    <div>
                      <p className="text-slate-500">Avg Size</p>
                      <p className="font-mono text-cyan-300">{partition.avgSize}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Backpressure Indicators */}
        <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
          <h2 className="text-xl font-semibold text-cyan-400 mb-6 flex items-center gap-2">
            <AlertCircle className="w-5 h-5" />
            Backpressure Indicators
          </h2>

          <div className="grid grid-cols-4 gap-4">
            {/* Kafka Consumer Lag */}
            <div className={`${kafkaLagColor.bg} rounded-lg p-4 border border-slate-600`}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-slate-300">Kafka Consumer Lag</span>
                <Activity className={`w-5 h-5 ${kafkaLagColor.indicator.replace('bg-', 'text-')}`} />
              </div>
              <div className="text-2xl font-bold font-mono text-slate-100 mb-2">{backpressure.kafkaLag}ms</div>
              <div className="w-full bg-slate-900 rounded-full h-2 overflow-hidden border border-slate-600">
                <div
                  className={`${kafkaLagColor.indicator} h-full`}
                  style={{ width: `${Math.min((backpressure.kafkaLag / 10000) * 100, 100)}%` }}
                />
              </div>
              <p className="text-xs text-slate-400 mt-2">Threshold: 10000ms</p>
            </div>

            {/* Disk Buffer Usage */}
            <div className={`${diskUsageColor.bg} rounded-lg p-4 border border-slate-600`}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-slate-300">Disk Buffer Usage</span>
                <HardDrive className={`w-5 h-5 ${diskUsageColor.indicator.replace('bg-', 'text-')}`} />
              </div>
              <div className="text-2xl font-bold font-mono text-slate-100 mb-2">{backpressure.diskUsage}%</div>
              <div className="w-full bg-slate-900 rounded-full h-2 overflow-hidden border border-slate-600">
                <div
                  className={`${diskUsageColor.indicator} h-full`}
                  style={{ width: `${backpressure.diskUsage}%` }}
                />
              </div>
              <p className="text-xs text-slate-400 mt-2">Healthy Limit: 80%</p>
            </div>

            {/* Bronze Write Throughput */}
            <div className={`${bronzeWriteColor.bg} rounded-lg p-4 border border-slate-600`}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-slate-300">Bronze Write</span>
                <Zap className={`w-5 h-5 ${bronzeWriteColor.indicator.replace('bg-', 'text-')}`} />
              </div>
              <div className="text-2xl font-bold font-mono text-slate-100 mb-2">{backpressure.bronzeWriteThroughput}%</div>
              <div className="w-full bg-slate-900 rounded-full h-2 overflow-hidden border border-slate-600">
                <div
                  className={`${bronzeWriteColor.indicator} h-full`}
                  style={{ width: `${backpressure.bronzeWriteThroughput}%` }}
                />
              </div>
              <p className="text-xs text-slate-400 mt-2">Capacity</p>
            </div>

            {/* Memory Pressure */}
            <div className={`${memoryColor.bg} rounded-lg p-4 border border-slate-600`}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-slate-300">Memory Pressure</span>
                <Gauge className={`w-5 h-5 ${memoryColor.indicator.replace('bg-', 'text-')}`} />
              </div>
              <div className="text-2xl font-bold font-mono text-slate-100 mb-2">{backpressure.memoryPressure}%</div>
              <div className="w-full bg-slate-900 rounded-full h-2 overflow-hidden border border-slate-600">
                <div
                  className={`${memoryColor.indicator} h-full`}
                  style={{ width: `${backpressure.memoryPressure}%` }}
                />
              </div>
              <p className="text-xs text-slate-400 mt-2">Streaming Jobs</p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-slate-700 pt-4 text-center text-xs text-slate-500">
          <p>Last updated: {new Date().toLocaleTimeString()} | Data refreshes every 30 seconds</p>
        </div>
      </div>
    </div>
  );
}
