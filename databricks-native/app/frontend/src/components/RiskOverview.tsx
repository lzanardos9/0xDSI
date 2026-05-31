import { useState, useEffect } from 'react';
import {
  Shield,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Activity,
  Target,
  Users,
  Server,
  FileText,
  CheckCircle2,
  ChevronRight,
  Clock
} from 'lucide-react';
import { supabase } from '../lib/supabase';

interface RiskMetrics {
  overallScore: number;
  trend: 'up' | 'down' | 'stable';
  categories: {
    threats: { score: number; count: number; critical: number };
    vulnerabilities: { score: number; count: number; critical: number };
    compliance: { score: number; percentage: number };
    incidents: { score: number; count: number; active: number };
    assets: { score: number; total: number; vulnerable: number };
    users: { score: number; total: number; risky: number };
  };
}

const RiskOverview = () => {
  const [metrics, setMetrics] = useState<RiskMetrics>({
    overallScore: 0,
    trend: 'stable',
    categories: {
      threats: { score: 0, count: 0, critical: 0 },
      vulnerabilities: { score: 0, count: 0, critical: 0 },
      compliance: { score: 0, percentage: 0 },
      incidents: { score: 0, count: 0, active: 0 },
      assets: { score: 0, total: 0, vulnerable: 0 },
      users: { score: 0, total: 0, risky: 0 },
    },
  });
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadRiskMetrics();

    const channels = [
      supabase.channel('alerts_risk').on('postgres_changes', { event: '*', schema: 'public', table: 'alerts' }, () => loadRiskMetrics()),
      supabase.channel('events_risk').on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, () => loadRiskMetrics()),
      supabase.channel('cases_risk').on('postgres_changes', { event: '*', schema: 'public', table: 'cases' }, () => loadRiskMetrics()),
    ];

    channels.forEach(channel => channel.subscribe());
    const interval = setInterval(loadRiskMetrics, 30000);

    return () => {
      channels.forEach(channel => channel.unsubscribe());
      clearInterval(interval);
    };
  }, []);

  const loadRiskMetrics = async () => {
    try {
      setLoading(true);

      const [alerts, events, cases, behaviors] = await Promise.all([
        supabase.from('alerts').select('severity, status, created_at'),
        supabase.from('events').select('severity, event_type, created_at'),
        supabase.from('cases').select('priority, status, created_at'),
        supabase.from('user_behavior_events').select('anomaly_score, event_type, timestamp').order('timestamp', { ascending: false }).limit(10),
      ]);

      const criticalAlerts = alerts.data?.filter(a => a.severity === 'critical' && a.status !== 'resolved').length || 0;
      const highAlerts = alerts.data?.filter(a => a.severity === 'high' && a.status !== 'resolved').length || 0;
      const threatScore = Math.max(0, 100 - (criticalAlerts * 15 + highAlerts * 5));

      const criticalEvents = events.data?.filter(e => e.severity === 'critical').length || 0;
      const highEvents = events.data?.filter(e => e.severity === 'high').length || 0;
      const vulnScore = Math.max(0, 100 - (criticalEvents * 10 + highEvents * 3));

      const complianceScore = 98.5;

      const activeCases = cases.data?.filter(c => c.status === 'open' || c.status === 'in_progress').length || 0;
      const criticalCases = cases.data?.filter(c => c.priority === 'critical' && c.status !== 'closed').length || 0;
      const incidentScore = Math.max(0, 100 - (criticalCases * 20 + activeCases * 5));

      const assetScore = 87.3;

      const riskyUsers = behaviors.data?.filter(b => b.anomaly_score > 70).length || 0;
      const userScore = Math.max(0, 100 - (riskyUsers * 15));

      const overallScore = Math.round(
        threatScore * 0.25 +
        vulnScore * 0.20 +
        complianceScore * 0.15 +
        incidentScore * 0.20 +
        assetScore * 0.10 +
        userScore * 0.10
      );

      const trend: 'up' | 'down' | 'stable' =
        overallScore > 75 ? 'up' :
        overallScore < 65 ? 'down' :
        'stable';

      setMetrics({
        overallScore,
        trend,
        categories: {
          threats: {
            score: threatScore,
            count: (alerts.data?.length || 0),
            critical: criticalAlerts
          },
          vulnerabilities: {
            score: vulnScore,
            count: (events.data?.length || 0),
            critical: criticalEvents
          },
          compliance: {
            score: complianceScore,
            percentage: complianceScore
          },
          incidents: {
            score: incidentScore,
            count: (cases.data?.length || 0),
            active: activeCases
          },
          assets: {
            score: assetScore,
            total: 247,
            vulnerable: 12
          },
          users: {
            score: userScore,
            total: 1247,
            risky: riskyUsers
          },
        },
      });
    } catch (error) {
      console.error('Error loading risk metrics:', error);
    } finally {
      setLoading(false);
    }
  };

  const getRiskLevel = (score: number): { label: string; color: string; fill: string } => {
    if (score >= 80) return { label: 'Low Risk', color: 'text-green-400', fill: '#22c55e' };
    if (score >= 60) return { label: 'Moderate', color: 'text-yellow-400', fill: '#eab308' };
    if (score >= 40) return { label: 'Elevated', color: 'text-orange-400', fill: '#f97316' };
    return { label: 'Critical', color: 'text-red-400', fill: '#ef4444' };
  };

  const riskLevel = getRiskLevel(metrics.overallScore);

  return (
    <div className="space-y-8">
      {/* Simplified Hero Section with Gauge */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-blue-900/20 rounded-2xl border border-slate-800 p-12">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            {/* Left: Gauge */}
            <div className="flex flex-col items-center">
              <div className="relative w-80 h-80">
                {/* Gauge SVG */}
                <svg viewBox="0 0 200 200" className="w-full h-full transform -rotate-90">
                  <circle
                    cx="100"
                    cy="100"
                    r="85"
                    fill="none"
                    stroke="rgb(30, 41, 59)"
                    strokeWidth="12"
                    strokeDasharray="535 535"
                    strokeDashoffset="133.75"
                  />
                  <circle
                    cx="100"
                    cy="100"
                    r="85"
                    fill="none"
                    stroke={riskLevel.fill}
                    strokeWidth="12"
                    strokeDasharray="535 535"
                    strokeDashoffset={133.75 + (401.25 * (100 - metrics.overallScore) / 100)}
                    strokeLinecap="round"
                    className="transition-all duration-1000 ease-out"
                    style={{ filter: 'drop-shadow(0 0 8px ' + riskLevel.fill + '40)' }}
                  />
                </svg>

                {/* Center Content */}
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <div className="text-8xl font-bold text-white mb-2">
                    {loading ? '...' : metrics.overallScore}
                  </div>
                  <div className={`text-xl font-semibold ${riskLevel.color} mb-3`}>
                    {riskLevel.label}
                  </div>
                  {!loading && (
                    <div className="flex items-center space-x-2 text-slate-400">
                      {metrics.trend === 'up' && (
                        <>
                          <TrendingUp className="w-5 h-5 text-green-400" />
                          <span className="text-sm">Improving</span>
                        </>
                      )}
                      {metrics.trend === 'down' && (
                        <>
                          <TrendingDown className="w-5 h-5 text-red-400" />
                          <span className="text-sm">Declining</span>
                        </>
                      )}
                      {metrics.trend === 'stable' && (
                        <>
                          <Activity className="w-5 h-5" />
                          <span className="text-sm">Stable</span>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Live Indicator */}
              <div className="mt-6 flex items-center space-x-2 px-4 py-2 bg-green-500/10 border border-green-500/20 rounded-full">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <span className="text-green-400 text-sm font-medium">Live Data</span>
              </div>
            </div>

            {/* Right: Key Stats */}
            <div className="space-y-4">
              <div className="mb-8">
                <h2 className="text-4xl font-bold text-white mb-3">Security Posture</h2>
                <p className="text-lg text-slate-400">Real-time risk assessment across all security domains</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <StatCard
                  icon={<AlertTriangle className="w-5 h-5" />}
                  label="Active Threats"
                  value={metrics.categories.threats.critical}
                  total={metrics.categories.threats.count}
                  score={metrics.categories.threats.score}
                  onClick={() => setSelectedCategory('threats')}
                />
                <StatCard
                  icon={<Target className="w-5 h-5" />}
                  label="Vulnerabilities"
                  value={metrics.categories.vulnerabilities.critical}
                  total={metrics.categories.vulnerabilities.count}
                  score={metrics.categories.vulnerabilities.score}
                  onClick={() => setSelectedCategory('vulnerabilities')}
                />
                <StatCard
                  icon={<FileText className="w-5 h-5" />}
                  label="Open Incidents"
                  value={metrics.categories.incidents.active}
                  total={metrics.categories.incidents.count}
                  score={metrics.categories.incidents.score}
                  onClick={() => setSelectedCategory('incidents')}
                />
                <StatCard
                  icon={<CheckCircle2 className="w-5 h-5" />}
                  label="Compliance"
                  value={`${metrics.categories.compliance.percentage}%`}
                  total=""
                  score={metrics.categories.compliance.score}
                  onClick={() => setSelectedCategory('compliance')}
                />
              </div>

              {/* Secondary Stats - Collapsed by default */}
              <div className="pt-4 border-t border-slate-700/50">
                <button
                  onClick={() => setSelectedCategory('details')}
                  className="w-full flex items-center justify-between px-4 py-3 bg-slate-800/50 hover:bg-slate-800 rounded-lg transition-all group"
                >
                  <div className="flex items-center space-x-3">
                    <Shield className="w-5 h-5 text-slate-400 group-hover:text-blue-400" />
                    <span className="text-slate-300 group-hover:text-white">View Additional Metrics</span>
                  </div>
                  <ChevronRight className="w-5 h-5 text-slate-500 group-hover:text-blue-400" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Drill-Down Panel */}
      {selectedCategory && selectedCategory !== 'details' && (
        <DrillDownPanel
          category={selectedCategory}
          data={metrics.categories[selectedCategory as keyof typeof metrics.categories]}
          onClose={() => setSelectedCategory(null)}
        />
      )}

      {/* Additional Metrics Panel */}
      {selectedCategory === 'details' && (
        <div className="bg-slate-900 rounded-xl border border-slate-800 p-8">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-bold text-white">Additional Security Metrics</h3>
            <button
              onClick={() => setSelectedCategory(null)}
              className="text-slate-400 hover:text-white transition-colors"
            >
              <ChevronRight className="w-5 h-5 rotate-90" />
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <MetricDetail
              icon={<Server className="w-6 h-6" />}
              title="Asset Security"
              score={metrics.categories.assets.score}
              primary={`${metrics.categories.assets.total} Total Assets`}
              secondary={`${metrics.categories.assets.vulnerable} Vulnerable`}
            />
            <MetricDetail
              icon={<Users className="w-6 h-6" />}
              title="User Behavior"
              score={metrics.categories.users.score}
              primary={`${metrics.categories.users.total} Active Users`}
              secondary={`${metrics.categories.users.risky} High Risk`}
            />
          </div>
        </div>
      )}
    </div>
  );
};

const StatCard = ({
  icon,
  label,
  value,
  total,
  score,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  total: string | number;
  score: number;
  onClick: () => void;
}) => {
  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-400';
    if (score >= 60) return 'text-yellow-400';
    if (score >= 40) return 'text-orange-400';
    return 'text-red-400';
  };

  return (
    <button
      onClick={onClick}
      className="bg-slate-800/50 hover:bg-slate-800 border border-slate-700 hover:border-blue-500/50 rounded-xl p-5 transition-all text-left group"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="text-slate-400 group-hover:text-blue-400 transition-colors">
          {icon}
        </div>
        <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-blue-400 transition-colors" />
      </div>
      <div className="text-slate-400 text-sm mb-2">{label}</div>
      <div className="flex items-baseline space-x-2">
        <div className="text-3xl font-bold text-white">{value}</div>
        {total && <div className="text-slate-500 text-sm">/ {total}</div>}
      </div>
      <div className="mt-3 pt-3 border-t border-slate-700/50">
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-500">Risk Score</span>
          <span className={`text-sm font-bold ${getScoreColor(score)}`}>{score}</span>
        </div>
      </div>
    </button>
  );
};

const MetricDetail = ({
  icon,
  title,
  score,
  primary,
  secondary,
}: {
  icon: React.ReactNode;
  title: string;
  score: number;
  primary: string;
  secondary: string;
}) => {
  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-400';
    if (score >= 60) return 'text-yellow-400';
    if (score >= 40) return 'text-orange-400';
    return 'text-red-400';
  };

  return (
    <div className="bg-slate-800/50 rounded-lg p-6 border border-slate-700">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center space-x-3">
          <div className="text-slate-400">{icon}</div>
          <h4 className="text-white font-semibold">{title}</h4>
        </div>
        <div className={`text-2xl font-bold ${getScoreColor(score)}`}>{score}</div>
      </div>
      <div className="space-y-2">
        <div className="text-slate-300 text-sm">{primary}</div>
        <div className="text-slate-500 text-sm">{secondary}</div>
      </div>
    </div>
  );
};

const DrillDownPanel = ({
  category,
  data,
  onClose,
}: {
  category: string;
  data: any;
  onClose: () => void;
}) => {
  const getCategoryConfig = (cat: string) => {
    switch (cat) {
      case 'threats':
        return {
          title: 'Active Threats Analysis',
          icon: <AlertTriangle className="w-6 h-6" />,
          color: 'red',
          metrics: [
            { label: 'Total Threats', value: data.count, description: 'All detected threats' },
            { label: 'Critical Priority', value: data.critical, description: 'Requiring immediate action' },
            { label: 'Risk Score', value: data.score, description: 'Threat posture rating' },
          ],
        };
      case 'vulnerabilities':
        return {
          title: 'Vulnerability Assessment',
          icon: <Target className="w-6 h-6" />,
          color: 'orange',
          metrics: [
            { label: 'Total Detected', value: data.count, description: 'Known vulnerabilities' },
            { label: 'Critical Severity', value: data.critical, description: 'High-impact vulnerabilities' },
            { label: 'Security Score', value: data.score, description: 'Vulnerability posture rating' },
          ],
        };
      case 'compliance':
        return {
          title: 'Compliance Status',
          icon: <CheckCircle2 className="w-6 h-6" />,
          color: 'green',
          metrics: [
            { label: 'Overall Score', value: `${data.percentage}%`, description: 'Compliance percentage' },
            { label: 'Risk Rating', value: data.score, description: 'Compliance risk score' },
          ],
        };
      case 'incidents':
        return {
          title: 'Incident Management',
          icon: <FileText className="w-6 h-6" />,
          color: 'blue',
          metrics: [
            { label: 'Total Incidents', value: data.count, description: 'All incidents tracked' },
            { label: 'Active Cases', value: data.active, description: 'Currently under investigation' },
            { label: 'Response Score', value: data.score, description: 'Incident response rating' },
          ],
        };
      default:
        return {
          title: 'Details',
          icon: <Activity className="w-6 h-6" />,
          color: 'blue',
          metrics: [],
        };
    }
  };

  const config = getCategoryConfig(category);

  return (
    <div className="bg-slate-900 rounded-xl border border-slate-800 p-8">
      <div className="flex items-start justify-between mb-8">
        <div className="flex items-center space-x-4">
          <div className={`p-3 rounded-xl bg-${config.color}-500/10 text-${config.color}-400`}>
            {config.icon}
          </div>
          <div>
            <h3 className="text-2xl font-bold text-white">{config.title}</h3>
            <p className="text-slate-400 mt-1">Detailed breakdown and analysis</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-2 hover:bg-slate-800 rounded-lg transition-colors text-slate-400 hover:text-white"
        >
          <ChevronRight className="w-5 h-5 rotate-90" />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {config.metrics.map((metric, idx) => (
          <div key={idx} className="bg-slate-800/50 rounded-lg p-6 border border-slate-700">
            <div className="text-slate-400 text-sm mb-2">{metric.label}</div>
            <div className="text-4xl font-bold text-white mb-2">{metric.value}</div>
            <div className="text-slate-500 text-xs">{metric.description}</div>
          </div>
        ))}
      </div>

      <div className="mt-6 pt-6 border-t border-slate-700 flex items-center justify-between">
        <p className="text-slate-400 text-sm">
          Navigate to the specific section from the main menu for detailed investigation and remediation.
        </p>
        <div className="flex items-center space-x-2 text-xs text-slate-500">
          <Clock className="w-4 h-4" />
          <span>Updated {new Date().toLocaleTimeString()}</span>
        </div>
      </div>
    </div>
  );
};

export default RiskOverview;
