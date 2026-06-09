import React, { useState, useEffect, useMemo } from 'react';
import { Brain, TrendingUp, AlertTriangle, Shield, Zap, Activity, Target, Eye, Users, BarChart3, ArrowUpRight, ArrowDownRight, Layers } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface InsightRecommendation {
  id: string;
  title: string;
  description: string;
  category: 'risk' | 'cost' | 'compliance' | 'performance' | 'security';
  priority: 'critical' | 'high' | 'medium' | 'low';
  impact: string;
  effort: 'minimal' | 'moderate' | 'significant';
  metric: string;
  metricValue: number;
  metricTrend: 'up' | 'down' | 'stable';
  actionLabel: string;
  reasoning: string;
  affectedEntities: string[];
  confidenceScore: number;
}

interface BehavioralSignal {
  userId: string;
  department: string;
  driftScore: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  anomalyType: string;
  timestamp: number;
  confidence: number;
}

interface PatternObservation {
  id: string;
  message: string;
  severity: 'info' | 'warning' | 'critical';
  timestamp: number;
}

const AIInsightEngine: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'recommendations' | 'behavioral' | 'clusters'>('recommendations');
  const [recommendations, setRecommendations] = useState<InsightRecommendation[]>([]);
  const [signals, setSignals] = useState<BehavioralSignal[]>([]);
  const [patterns, setPatterns] = useState<PatternObservation[]>([]);
  const [riskScore, setRiskScore] = useState(72);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [policiesRes, budgetsRes, rulesRes, resultsRes] = await Promise.all([
          supabase.from('guardrail_policies').select('*'),
          supabase.from('token_budgets').select('*'),
          supabase.from('model_access_rules').select('*'),
          supabase.from('guardrail_scan_results').select('*'),
        ]);

        const policies = policiesRes.data || [];
        const budgets = budgetsRes.data || [];
        const rules = rulesRes.data || [];
        const results = resultsRes.data || [];

        generateRecommendations(policies, budgets, rules, results);
        generateBehavioralSignals(results);
        generatePatternObservations();
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const generateRecommendations = (policies: any[], budgets: any[], rules: any[], results: any[]) => {
    const recs: InsightRecommendation[] = [];

    const disabledCount = policies.filter((p) => !p.enabled).length;
    if (disabledCount > 0) {
      recs.push({
        id: 'policy-disabled',
        title: `${disabledCount} Critical Policies Disabled`,
        description: 'Multiple guardrail policies are currently inactive, reducing compliance coverage.',
        category: 'security',
        priority: 'critical',
        impact: `${disabledCount} policies not enforcing guardrails`,
        effort: 'minimal',
        metric: 'Disabled Policies',
        metricValue: disabledCount,
        metricTrend: 'up',
        actionLabel: 'Review Policies',
        reasoning: 'Disabled policies leave potential security gaps in your model gateway.',
        affectedEntities: policies.filter((p) => !p.enabled).map((p) => p.name),
        confidenceScore: 0.95,
      });
    }

    const overrunDepts = budgets.filter((b) => b.tokens_used > b.monthly_limit * 0.9);
    if (overrunDepts.length > 0) {
      recs.push({
        id: 'budget-overrun',
        title: `Budget Overrun Detected: ${overrunDepts[0].department}`,
        description: `${overrunDepts[0].department} has consumed ${Math.round((overrunDepts[0].tokens_used / overrunDepts[0].monthly_limit) * 100)}% of monthly allocation.`,
        category: 'cost',
        priority: overrunDepts[0].tokens_used > overrunDepts[0].monthly_limit ? 'critical' : 'high',
        impact: `${overrunDepts.length} department(s) near or exceeding limits`,
        effort: 'moderate',
        metric: 'Budget Utilization',
        metricValue: Math.round((overrunDepts[0].tokens_used / overrunDepts[0].monthly_limit) * 100),
        metricTrend: 'up',
        actionLabel: 'Adjust Limits',
        reasoning: 'Prevent unexpected costs and service disruptions due to token exhaustion.',
        affectedEntities: overrunDepts.map((d) => d.department),
        confidenceScore: 0.92,
      });
    }

    const deprecatedModels = rules.filter((r) => r.deprecated && r.active_traffic > 0);
    if (deprecatedModels.length > 0) {
      recs.push({
        id: 'deprecated-models',
        title: `Deprecated Models Still in Use (${deprecatedModels.length})`,
        description: `${deprecatedModels[0].model_name} and others are deprecated but still receiving traffic.`,
        category: 'compliance',
        priority: 'high',
        impact: `${deprecatedModels.length} deprecated model(s) with ${deprecatedModels.reduce((sum, m) => sum + m.active_traffic, 0)} active requests`,
        effort: 'moderate',
        metric: 'Deprecated Traffic',
        metricValue: deprecatedModels.reduce((sum, m) => sum + m.active_traffic, 0),
        metricTrend: 'stable',
        actionLabel: 'Migrate Traffic',
        reasoning: 'Deprecated models may have security vulnerabilities or limited support.',
        affectedEntities: deprecatedModels.map((m) => m.model_name),
        confidenceScore: 0.88,
      });
    }

    const falsePositivePolicies = results.filter((r) => r.false_positive_rate > 0.2);
    if (falsePositivePolicies.length > 0) {
      recs.push({
        id: 'false-positives',
        title: `High False Positive Rate Detected`,
        description: `Policy tuning recommended to reduce unnecessary blocks and improve user experience.`,
        category: 'performance',
        priority: 'medium',
        impact: `${falsePositivePolicies.length} policies with >20% false positive rate`,
        effort: 'significant',
        metric: 'False Positive Rate',
        metricValue: Math.round(falsePositivePolicies[0].false_positive_rate * 100),
        metricTrend: 'down',
        actionLabel: 'Tune Policies',
        reasoning: 'High false positives waste resources and frustrate users.',
        affectedEntities: falsePositivePolicies.map((p) => p.policy_name).slice(0, 3),
        confidenceScore: 0.85,
      });
    }

    if (results.some((r) => r.token_spike_detected)) {
      recs.push({
        id: 'token-spike',
        title: 'Unusual Token Consumption Spike Detected',
        description: 'Group A shows 340% increase in token usage in the last 24 hours.',
        category: 'risk',
        priority: 'high',
        impact: 'Potential abuse or misconfigured batch jobs',
        effort: 'minimal',
        metric: 'Token Spike',
        metricValue: 340,
        metricTrend: 'up',
        actionLabel: 'Investigate',
        reasoning: 'Monitor for unauthorized usage patterns or system anomalies.',
        affectedEntities: ['Group A', 'API-Integration-Team'],
        confidenceScore: 0.78,
      });
    }

    setRecommendations(recs.slice(0, 5));
  };

  const generateBehavioralSignals = (results: any[]) => {
    const signals: BehavioralSignal[] = [
      {
        userId: 'user_5847',
        department: 'Data Science',
        driftScore: 0.87,
        riskLevel: 'critical',
        anomalyType: 'Shadow AI Detection',
        timestamp: Date.now() - 300000,
        confidence: 0.94,
      },
      {
        userId: 'user_2103',
        department: 'Engineering',
        driftScore: 0.64,
        riskLevel: 'high',
        anomalyType: 'Token Pattern Shift',
        timestamp: Date.now() - 600000,
        confidence: 0.86,
      },
      {
        userId: 'user_8921',
        department: 'Finance',
        driftScore: 0.42,
        riskLevel: 'medium',
        anomalyType: 'Time Pattern Variance',
        timestamp: Date.now() - 900000,
        confidence: 0.72,
      },
    ];
    setSignals(signals);
  };

  const generatePatternObservations = () => {
    const observations: PatternObservation[] = [
      {
        id: '1',
        message: 'Neural cluster detected: 3 users exhibiting correlated shadow AI behavior',
        severity: 'critical',
        timestamp: Date.now() - 120000,
      },
      {
        id: '2',
        message: 'Token consumption baseline shift observed in Finance department',
        severity: 'warning',
        timestamp: Date.now() - 240000,
      },
      {
        id: '3',
        message: 'Policy compliance rate improved by 12% in the last 24 hours',
        severity: 'info',
        timestamp: Date.now() - 360000,
      },
      {
        id: '4',
        message: 'Anomalous API call pattern from integration service detected',
        severity: 'warning',
        timestamp: Date.now() - 480000,
      },
    ];
    setPatterns(observations);
  };

  useEffect(() => {
    const interval = setInterval(() => {
      setRiskScore((prev) => {
        const change = (Math.random() - 0.5) * 8;
        return Math.max(20, Math.min(95, prev + change));
      });
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const deptRiskMatrix = [
    { dept: 'Data Science', risk: 78, color: 'from-red-500 to-orange-500' },
    { dept: 'Engineering', risk: 62, color: 'from-orange-500 to-yellow-500' },
    { dept: 'Finance', risk: 45, color: 'from-yellow-500 to-green-500' },
    { dept: 'Operations', risk: 55, color: 'from-yellow-600 to-orange-600' },
  ];

  return (
    <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-slate-200 min-h-screen p-6 space-y-6">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <Brain className="w-8 h-8 text-purple-400 animate-pulse" />
          AI Insight Engine
        </h1>
      </div>

      <div className="flex gap-2 mb-6">
        {(['recommendations', 'behavioral', 'clusters'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-lg font-medium transition-all ${
              activeTab === tab
                ? 'bg-purple-600 text-white'
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1).replace('behavioral', 'Behavioral Analysis')}
          </button>
        ))}
      </div>

      {activeTab === 'recommendations' && (
        <div className="space-y-4">
          {loading ? (
            <div className="text-center py-8">Loading recommendations...</div>
          ) : (
            recommendations.map((rec) => (
              <div key={rec.id} className="bg-slate-800/80 border border-slate-700 rounded-lg p-5 hover:border-purple-500/50 transition-all">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    {rec.priority === 'critical' && <AlertTriangle className="w-5 h-5 text-red-500" />}
                    {rec.priority === 'high' && <Zap className="w-5 h-5 text-orange-500" />}
                    {rec.priority === 'medium' && <TrendingUp className="w-5 h-5 text-yellow-500" />}
                    {rec.priority === 'low' && <Shield className="w-5 h-5 text-green-500" />}
                    <div>
                      <h3 className="font-semibold text-lg">{rec.title}</h3>
                      <p className="text-sm text-slate-400">{rec.description}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="flex items-center gap-1 justify-end mb-1">
                      <div className="w-20 h-2 bg-slate-700 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-purple-500 to-purple-400 transition-all"
                          style={{ width: `${rec.confidenceScore * 100}%` }}
                        />
                      </div>
                      <span className="text-xs text-slate-400">{Math.round(rec.confidenceScore * 100)}%</span>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3 mb-3 text-sm">
                  <div className="bg-slate-900 p-2 rounded">
                    <span className="text-slate-400">{rec.metric}</span>
                    <div className="font-semibold flex items-center gap-1">
                      {rec.metricValue}
                      {rec.metricTrend === 'up' && <ArrowUpRight className="w-4 h-4 text-red-500" />}
                      {rec.metricTrend === 'down' && <ArrowDownRight className="w-4 h-4 text-green-500" />}
                    </div>
                  </div>
                  <div className="bg-slate-900 p-2 rounded">
                    <span className="text-slate-400">Impact</span>
                    <div className="font-semibold text-purple-300">{rec.impact}</div>
                  </div>
                  <div className="bg-slate-900 p-2 rounded">
                    <span className="text-slate-400">Effort</span>
                    <div className="font-semibold capitalize">{rec.effort}</div>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex flex-wrap gap-1">
                    {rec.affectedEntities.slice(0, 2).map((entity) => (
                      <span key={entity} className="text-xs bg-slate-700 px-2 py-1 rounded">
                        {entity}
                      </span>
                    ))}
                  </div>
                  <button className="px-3 py-1 bg-purple-600 hover:bg-purple-500 rounded text-sm font-medium transition-colors">
                    {rec.actionLabel}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === 'behavioral' && (
        <div className="space-y-6">
          {/* Neural Activity Header */}
          <div className="relative h-32 bg-slate-800 border border-slate-700 rounded-lg overflow-hidden flex items-center justify-center">
            <style>{`
              @keyframes pulse-ring {
                0%, 100% { transform: scale(1); opacity: 0.8; }
                50% { transform: scale(1.1); opacity: 0.4; }
              }
              .neural-pulse {
                animation: pulse-ring 3s infinite;
              }
              .conic-ring {
                background: conic-gradient(from ${riskScore * 3.6}deg, rgb(239, 68, 68), rgb(234, 179, 8), rgb(34, 197, 94));
              }
            `}</style>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="relative w-24 h-24">
                <div className="absolute inset-0 rounded-full border-4 border-slate-700" />
                <div className="conic-ring absolute inset-0 rounded-full border-4" style={{ opacity: 0.6 }} />
                <div className="absolute inset-2 bg-gradient-to-br from-slate-700 to-slate-900 rounded-full flex items-center justify-center flex-col">
                  <span className="text-2xl font-bold text-white">{Math.round(riskScore)}</span>
                  <span className="text-xs text-slate-400">Risk Score</span>
                </div>
              </div>
            </div>
            <div className="absolute top-3 right-4 flex items-center gap-2">
              <Activity className="w-4 h-4 text-emerald-400 animate-pulse" />
              <span className="text-xs text-slate-300">Neural Activity</span>
            </div>
          </div>

          {/* Department Risk Heatmap */}
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-purple-400" />
              Department Risk Heatmap
            </h3>
            <div className="space-y-3">
              {deptRiskMatrix.map((item) => (
                <div key={item.dept}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium">{item.dept}</span>
                    <span className="text-sm text-slate-400">{item.risk}%</span>
                  </div>
                  <div className="h-3 bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full bg-gradient-to-r ${item.color} transition-all duration-1000`}
                      style={{ width: `${item.risk}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Behavioral Drift Detection */}
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <Eye className="w-5 h-5 text-purple-400" />
              Behavioral Drift Detection
            </h3>
            <div className="space-y-3">
              {signals.map((signal) => (
                <div key={signal.userId} className="bg-slate-900 p-3 rounded border border-slate-700">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-slate-400" />
                      <span className="font-medium">{signal.userId}</span>
                      <span className="text-xs bg-slate-800 px-2 py-1 rounded">{signal.department}</span>
                    </div>
                    <div className={`text-xs font-semibold px-2 py-1 rounded ${
                      signal.riskLevel === 'critical' ? 'bg-red-900 text-red-200' :
                      signal.riskLevel === 'high' ? 'bg-orange-900 text-orange-200' :
                      signal.riskLevel === 'medium' ? 'bg-yellow-900 text-yellow-200' :
                      'bg-green-900 text-green-200'
                    }`}>
                      {signal.riskLevel.toUpperCase()}
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-sm mb-2">
                    <span className="text-slate-400">{signal.anomalyType}</span>
                    <span className="text-slate-400">Confidence: {Math.round(signal.confidence * 100)}%</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500">Drift:</span>
                    <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-purple-600 to-pink-600"
                        style={{ width: `${signal.driftScore * 100}%` }}
                      />
                    </div>
                    <span className="text-xs font-semibold">{Math.round(signal.driftScore * 100)}%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Pattern Stream */}
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <Layers className="w-5 h-5 text-purple-400" />
              Live Pattern Stream
            </h3>
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {patterns.map((pattern) => (
                <div key={pattern.id} className={`p-2 rounded text-xs border-l-2 ${
                  pattern.severity === 'critical' ? 'bg-red-900/20 border-red-600 text-red-200' :
                  pattern.severity === 'warning' ? 'bg-orange-900/20 border-orange-600 text-orange-200' :
                  'bg-blue-900/20 border-blue-600 text-blue-200'
                }`}>
                  {pattern.message}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'clusters' && (
        <div className="text-center py-12">
          <Target className="w-12 h-12 text-slate-600 mx-auto mb-4" />
          <p className="text-slate-400">Risk clustering visualization coming soon...</p>
        </div>
      )}
    </div>
  );
};

export default AIInsightEngine;
