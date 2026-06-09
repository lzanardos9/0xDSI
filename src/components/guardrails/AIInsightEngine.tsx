import { useState, useEffect } from 'react';
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

const AIInsightEngine = () => {
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
        generateBehavioralSignals();
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
        impact: `${deprecatedModels.length} deprecated model(s) with active requests`,
        effort: 'moderate',
        metric: 'Deprecated Traffic',
        metricValue: deprecatedModels.reduce((sum: number, m: any) => sum + (m.active_traffic || 0), 0),
        metricTrend: 'stable',
        actionLabel: 'Migrate Traffic',
        reasoning: 'Deprecated models may have security vulnerabilities or limited support.',
        affectedEntities: deprecatedModels.map((m: any) => m.model_name),
        confidenceScore: 0.88,
      });
    }

    if (results.some((r) => r.token_spike_detected)) {
      recs.push({
        id: 'token-spike',
        title: 'Unusual Token Consumption Spike Detected',
        description: 'marcus.rodriguez@0xdsi.com shows 340% increase in token usage in the last 24 hours.',
        category: 'risk',
        priority: 'high',
        impact: 'Potential abuse or misconfigured batch jobs',
        effort: 'minimal',
        metric: 'Token Spike',
        metricValue: 340,
        metricTrend: 'up',
        actionLabel: 'Investigate',
        reasoning: 'Monitor for unauthorized usage patterns or system anomalies.',
        affectedEntities: ['marcus.rodriguez@0xdsi.com', 'david.kim@0xdsi.com'],
        confidenceScore: 0.78,
      });
    }

    if (recs.length === 0) {
      recs.push(
        {
          id: 'shadow-ai',
          title: 'Shadow AI Usage Detected in Engineering',
          description: 'david.kim@0xdsi.com detected using unregistered AI endpoints bypassing gateway controls.',
          category: 'security',
          priority: 'critical',
          impact: '3 unregistered endpoints detected in last 48 hours',
          effort: 'moderate',
          metric: 'Shadow Endpoints',
          metricValue: 3,
          metricTrend: 'up',
          actionLabel: 'Block & Investigate',
          reasoning: 'Unregistered AI usage bypasses guardrails, PII controls, and audit logging.',
          affectedEntities: ['david.kim@0xdsi.com', 'api.openai-proxy.xyz'],
          confidenceScore: 0.94,
        },
        {
          id: 'drift-alert',
          title: 'Behavioral Drift: Security Research to Exploit Dev',
          description: 'aisha.patel@0xdsi.com conversation topics shifting from defensive to offensive patterns.',
          category: 'risk',
          priority: 'high',
          impact: 'Potential insider threat or compromised account',
          effort: 'minimal',
          metric: 'Drift Score',
          metricValue: 87,
          metricTrend: 'up',
          actionLabel: 'Review Activity',
          reasoning: 'Topic drift toward exploit development may indicate policy violations.',
          affectedEntities: ['aisha.patel@0xdsi.com', 'Security Team'],
          confidenceScore: 0.89,
        },
        {
          id: 'cost-optimization',
          title: 'Cost Optimization: Switch to Smaller Models',
          description: 'Analysis shows 67% of requests to GPT-4-turbo could be served by GPT-3.5 with <2% quality loss.',
          category: 'cost',
          priority: 'medium',
          impact: 'Estimated $12,400/month savings',
          effort: 'significant',
          metric: 'Potential Savings',
          metricValue: 12400,
          metricTrend: 'stable',
          actionLabel: 'Run A/B Test',
          reasoning: 'Routing simple queries to cheaper models reduces costs without impacting quality.',
          affectedEntities: ['Engineering', 'Product', 'Marketing'],
          confidenceScore: 0.85,
        },
      );
    }

    setRecommendations(recs.slice(0, 5));
  };

  const generateBehavioralSignals = () => {
    const sigs: BehavioralSignal[] = [
      {
        userId: 'sarah.chen@0xdsi.com',
        department: 'Data Science',
        driftScore: 0.87,
        riskLevel: 'critical',
        anomalyType: 'Shadow AI Detection',
        timestamp: Date.now() - 300000,
        confidence: 0.94,
      },
      {
        userId: 'david.kim@0xdsi.com',
        department: 'Engineering',
        driftScore: 0.64,
        riskLevel: 'high',
        anomalyType: 'Token Pattern Shift',
        timestamp: Date.now() - 600000,
        confidence: 0.86,
      },
      {
        userId: 'marcus.rodriguez@0xdsi.com',
        department: 'Finance',
        driftScore: 0.42,
        riskLevel: 'medium',
        anomalyType: 'Time Pattern Variance',
        timestamp: Date.now() - 900000,
        confidence: 0.72,
      },
      {
        userId: 'aisha.patel@0xdsi.com',
        department: 'Security',
        driftScore: 0.71,
        riskLevel: 'high',
        anomalyType: 'Prompt Injection Probing',
        timestamp: Date.now() - 1200000,
        confidence: 0.89,
      },
      {
        userId: 'james.park@0xdsi.com',
        department: 'Operations',
        driftScore: 0.35,
        riskLevel: 'low',
        anomalyType: 'After-Hours Usage Spike',
        timestamp: Date.now() - 1500000,
        confidence: 0.67,
      },
    ];
    setSignals(sigs);
  };

  const generatePatternObservations = () => {
    const observations: PatternObservation[] = [
      {
        id: '1',
        message: 'Neural cluster detected: sarah.chen, david.kim, aisha.patel exhibiting correlated shadow AI behavior',
        severity: 'critical',
        timestamp: Date.now() - 120000,
      },
      {
        id: '2',
        message: 'Token consumption baseline shift: marcus.rodriguez@0xdsi.com exceeded 340% of normal allocation',
        severity: 'warning',
        timestamp: Date.now() - 240000,
      },
      {
        id: '3',
        message: 'Policy compliance rate improved by 12% across Engineering dept (james.park team)',
        severity: 'info',
        timestamp: Date.now() - 360000,
      },
      {
        id: '4',
        message: 'Anomalous API call pattern from emily.watson@0xdsi.com integration service detected',
        severity: 'warning',
        timestamp: Date.now() - 480000,
      },
      {
        id: '5',
        message: 'Behavioral drift alert: aisha.patel shifting from security research to exploit development topics',
        severity: 'critical',
        timestamp: Date.now() - 600000,
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
    { dept: 'Data Science (sarah.chen, aisha.patel)', risk: 78, color: 'from-red-500 to-orange-500' },
    { dept: 'Engineering (david.kim, james.park)', risk: 62, color: 'from-orange-500 to-yellow-500' },
    { dept: 'Finance (marcus.rodriguez)', risk: 45, color: 'from-yellow-500 to-green-500' },
    { dept: 'Operations (emily.watson)', risk: 55, color: 'from-yellow-600 to-orange-600' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-cyan-500/20 to-blue-600/20 border border-cyan-500/30 flex items-center justify-center">
            <Brain className="w-5 h-5 text-cyan-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">AI Insight Engine</h2>
            <p className="text-xs text-slate-400">AI-powered recommendations from usage patterns</p>
          </div>
        </div>
      </div>

      <div className="flex gap-2">
        {(['recommendations', 'behavioral', 'clusters'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-lg text-sm font-medium border transition-all ${
              activeTab === tab
                ? 'bg-slate-700/50 border-slate-600/60 text-white'
                : 'bg-slate-800/20 border-slate-700/30 text-slate-400 hover:text-slate-300 hover:border-slate-600/40'
            }`}
          >
            {tab === 'recommendations' ? 'Recommendations' : tab === 'behavioral' ? 'Behavioral Analysis' : 'Risk Clusters'}
          </button>
        ))}
      </div>

      {activeTab === 'recommendations' && (
        <div className="space-y-4">
          {loading ? (
            <div className="text-center py-8 text-slate-400">Loading recommendations...</div>
          ) : (
            recommendations.map((rec) => (
              <div key={rec.id} className="bg-slate-800/40 border border-slate-700/40 rounded-xl p-5 hover:border-slate-600/50 transition-all">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    {rec.priority === 'critical' && <AlertTriangle className="w-5 h-5 text-red-500" />}
                    {rec.priority === 'high' && <Zap className="w-5 h-5 text-orange-500" />}
                    {rec.priority === 'medium' && <TrendingUp className="w-5 h-5 text-yellow-500" />}
                    {rec.priority === 'low' && <Shield className="w-5 h-5 text-green-500" />}
                    <div>
                      <h3 className="font-semibold text-white">{rec.title}</h3>
                      <p className="text-sm text-slate-400">{rec.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-16 h-2 bg-slate-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all"
                        style={{ width: `${rec.confidenceScore * 100}%` }}
                      />
                    </div>
                    <span className="text-xs text-slate-400">{Math.round(rec.confidenceScore * 100)}%</span>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3 mb-3 text-sm">
                  <div className="bg-slate-900/40 p-2 rounded">
                    <span className="text-slate-500 text-xs">{rec.metric}</span>
                    <div className="font-semibold text-white flex items-center gap-1">
                      {rec.metricValue}
                      {rec.metricTrend === 'up' && <ArrowUpRight className="w-3 h-3 text-red-500" />}
                      {rec.metricTrend === 'down' && <ArrowDownRight className="w-3 h-3 text-green-500" />}
                    </div>
                  </div>
                  <div className="bg-slate-900/40 p-2 rounded">
                    <span className="text-slate-500 text-xs">Impact</span>
                    <div className="font-semibold text-cyan-300 text-xs">{rec.impact}</div>
                  </div>
                  <div className="bg-slate-900/40 p-2 rounded">
                    <span className="text-slate-500 text-xs">Effort</span>
                    <div className="font-semibold text-white capitalize">{rec.effort}</div>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex flex-wrap gap-1">
                    {rec.affectedEntities.slice(0, 2).map((entity) => (
                      <span key={entity} className="text-xs bg-slate-700/50 px-2 py-1 rounded text-slate-300">
                        {entity}
                      </span>
                    ))}
                  </div>
                  <button className="px-3 py-1.5 bg-cyan-600/80 hover:bg-cyan-500/80 rounded-lg text-xs font-medium text-white transition-colors">
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
          <div className="relative h-32 bg-slate-800/40 border border-slate-700/40 rounded-xl overflow-hidden flex items-center justify-center">
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="relative w-24 h-24">
                <div className="absolute inset-0 rounded-full border-4 border-slate-700" />
                <div
                  className="absolute inset-0 rounded-full border-4 border-transparent"
                  style={{
                    background: `conic-gradient(from 0deg, rgb(239, 68, 68) 0%, rgb(234, 179, 8) 50%, rgb(34, 197, 94) 100%) border-box`,
                    mask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
                    maskComposite: 'xor',
                    padding: '4px',
                    borderRadius: '50%',
                    opacity: 0.7,
                  }}
                />
                <div className="absolute inset-2 bg-gradient-to-br from-slate-700 to-slate-900 rounded-full flex items-center justify-center flex-col">
                  <span className="text-2xl font-bold text-white">{Math.round(riskScore)}</span>
                  <span className="text-[9px] text-slate-400">Risk Score</span>
                </div>
              </div>
            </div>
            <div className="absolute top-3 right-4 flex items-center gap-2">
              <Activity className="w-4 h-4 text-emerald-400 animate-pulse" />
              <span className="text-xs text-slate-300">Neural Activity</span>
            </div>
          </div>

          <div className="bg-slate-800/40 border border-slate-700/40 rounded-xl p-4">
            <h3 className="font-semibold mb-4 flex items-center gap-2 text-white text-sm">
              <BarChart3 className="w-4 h-4 text-cyan-400" />
              Department Risk Heatmap
            </h3>
            <div className="space-y-3">
              {deptRiskMatrix.map((item) => (
                <div key={item.dept}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-slate-300">{item.dept}</span>
                    <span className="text-xs text-slate-400">{item.risk}%</span>
                  </div>
                  <div className="h-2.5 bg-slate-700/50 rounded-full overflow-hidden">
                    <div
                      className={`h-full bg-gradient-to-r ${item.color} transition-all duration-1000 rounded-full`}
                      style={{ width: `${item.risk}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-slate-800/40 border border-slate-700/40 rounded-xl p-4">
            <h3 className="font-semibold mb-4 flex items-center gap-2 text-white text-sm">
              <Eye className="w-4 h-4 text-cyan-400" />
              Behavioral Drift Detection
            </h3>
            <div className="space-y-3">
              {signals.map((signal) => (
                <div key={signal.userId} className="bg-slate-900/40 p-3 rounded-lg border border-slate-700/30">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Users className="w-3.5 h-3.5 text-slate-400" />
                      <span className="text-sm font-medium text-white">{signal.userId}</span>
                      <span className="text-[10px] bg-slate-800 px-2 py-0.5 rounded text-slate-400">{signal.department}</span>
                    </div>
                    <div className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                      signal.riskLevel === 'critical' ? 'bg-red-900/50 text-red-300' :
                      signal.riskLevel === 'high' ? 'bg-orange-900/50 text-orange-300' :
                      signal.riskLevel === 'medium' ? 'bg-yellow-900/50 text-yellow-300' :
                      'bg-green-900/50 text-green-300'
                    }`}>
                      {signal.riskLevel.toUpperCase()}
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs mb-2">
                    <span className="text-slate-400">{signal.anomalyType}</span>
                    <span className="text-slate-500">Confidence: {Math.round(signal.confidence * 100)}%</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-500">Drift:</span>
                    <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-cyan-600 to-red-500 rounded-full"
                        style={{ width: `${signal.driftScore * 100}%` }}
                      />
                    </div>
                    <span className="text-[10px] font-semibold text-white">{Math.round(signal.driftScore * 100)}%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-slate-800/40 border border-slate-700/40 rounded-xl p-4">
            <h3 className="font-semibold mb-4 flex items-center gap-2 text-white text-sm">
              <Layers className="w-4 h-4 text-cyan-400" />
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
        <div className="bg-slate-800/40 border border-slate-700/40 rounded-xl p-8">
          <div className="text-center">
            <Target className="w-12 h-12 text-slate-600 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-white mb-2">Risk Cluster Visualization</h3>
            <p className="text-sm text-slate-400 mb-6">AI-powered user clustering based on behavioral risk patterns</p>
            <div className="grid grid-cols-3 gap-4 max-w-md mx-auto">
              <div className="bg-red-900/20 border border-red-500/20 rounded-lg p-3">
                <div className="text-2xl font-bold text-red-400">3</div>
                <div className="text-[10px] text-red-300">Critical Risk</div>
              </div>
              <div className="bg-amber-900/20 border border-amber-500/20 rounded-lg p-3">
                <div className="text-2xl font-bold text-amber-400">7</div>
                <div className="text-[10px] text-amber-300">Elevated Risk</div>
              </div>
              <div className="bg-emerald-900/20 border border-emerald-500/20 rounded-lg p-3">
                <div className="text-2xl font-bold text-emerald-400">42</div>
                <div className="text-[10px] text-emerald-300">Normal</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AIInsightEngine;
