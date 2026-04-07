import { useState, useEffect } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Shield,
  AlertTriangle,
  CheckCircle,
  DollarSign,
  Users,
  Target,
  Activity,
  BarChart3,
  FileText,
  Clock,
  Zap,
  Award,
  Eye,
  Lock,
  Sparkles
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import CISOAssistant from './CISOAssistant';

interface ExecutiveMetrics {
  securityScore: number;
  securityScoreTrend: number;
  criticalAlerts: number;
  alertsTrend: number;
  activeCases: number;
  casesTrend: number;
  mttr: string;
  mttrTrend: number;
  complianceScore: number;
  complianceTrend: number;
  costSavings: string;
  costSavingsTrend: number;
  criticalVulnerabilities: number;
  vulnTrend: number;
  highRiskAccounts: number;
  accountRiskTrend: number;
}

interface ThreatTrend {
  date: string;
  count: number;
  severity: string;
}

const ExecutiveDashboard = () => {
  const [metrics, setMetrics] = useState<ExecutiveMetrics>({
    securityScore: 87,
    securityScoreTrend: 5,
    criticalAlerts: 0,
    alertsTrend: -15,
    activeCases: 0,
    casesTrend: -8,
    mttr: '2.4h',
    mttrTrend: -20,
    complianceScore: 99.8,
    complianceTrend: 2,
    costSavings: '$4.2M',
    costSavingsTrend: 18,
    criticalVulnerabilities: 0,
    vulnTrend: -12,
    highRiskAccounts: 0,
    accountRiskTrend: -5,
  });

  const [showAiAssistant, setShowAiAssistant] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadMetrics();
  }, []);

  const loadMetrics = async () => {
    try {
      const [alertsResult, casesResult, vulnsResult, userBehaviorResult] = await Promise.all([
        supabase.from('alerts').select('severity, status').eq('severity', 'critical').eq('status', 'new'),
        supabase.from('cases').select('status').in('status', ['open', 'in_progress']),
        supabase.from('vulnerabilities').select('severity, status').eq('severity', 'critical').neq('status', 'resolved'),
        supabase.from('user_behavior_events').select('anomaly_score').gt('anomaly_score', 70).limit(100),
      ]);

      setMetrics(prev => ({
        ...prev,
        criticalAlerts: alertsResult.data?.length || 0,
        activeCases: casesResult.data?.length || 0,
        criticalVulnerabilities: vulnsResult.data?.length || 0,
        highRiskAccounts: userBehaviorResult.data?.length || 0,
      }));
    } catch (error) {
      console.error('Error loading metrics:', error);
    } finally {
      setLoading(false);
    }
  };

  const MetricCard = ({
    title,
    value,
    trend,
    icon: Icon,
    iconColor,
    trendLabel
  }: {
    title: string;
    value: string | number;
    trend: number;
    icon: any;
    iconColor: string;
    trendLabel: string;
  }) => (
    <div className="enterprise-card p-6 hover:shadow-lg transition-all duration-300">
      <div className="flex items-start justify-between mb-4">
        <div className={`p-3 rounded-xl ${iconColor}`}>
          <Icon className="w-6 h-6" />
        </div>
        <div className={`flex items-center space-x-1 px-3 py-1 rounded-full text-xs font-semibold ${
          trend >= 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
        }`}>
          {trend >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
          <span>{Math.abs(trend)}%</span>
        </div>
      </div>
      <h3 className="text-sm font-medium text-slate-400 mb-2">{title}</h3>
      <div className="flex items-baseline space-x-2">
        <p className="text-3xl font-bold text-slate-100">{value}</p>
        <p className="text-xs text-slate-500">{trendLabel}</p>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* AI Assistant - Pinned to Top */}
      {showAiAssistant && (
        <div className="enterprise-card overflow-hidden h-[600px]">
          <CISOAssistant />
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-100 flex items-center space-x-3">
            <Shield className="w-8 h-8 text-blue-400" />
            <span>Executive Security Overview</span>
          </h2>
          <p className="text-slate-400 mt-1">Strategic insights and key performance indicators</p>
        </div>
        <button
          onClick={() => setShowAiAssistant(!showAiAssistant)}
          className={`px-4 py-2 rounded-lg flex items-center space-x-2 transition-all ${
            showAiAssistant
              ? 'bg-blue-500 text-white'
              : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
          }`}
        >
          <Sparkles className="w-5 h-5" />
          <span>AI Advisor</span>
        </button>
      </div>

      {/* Key Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricCard
          title="Security Posture Score"
          value={metrics.securityScore}
          trend={metrics.securityScoreTrend}
          icon={Shield}
          iconColor="bg-blue-500/10 text-blue-400"
          trendLabel="vs last month"
        />
        <MetricCard
          title="Critical Alerts"
          value={metrics.criticalAlerts}
          trend={metrics.alertsTrend}
          icon={AlertTriangle}
          iconColor="bg-red-500/10 text-red-400"
          trendLabel="reduction"
        />
        <MetricCard
          title="Mean Time to Respond"
          value={metrics.mttr}
          trend={metrics.mttrTrend}
          icon={Clock}
          iconColor="bg-amber-500/10 text-amber-400"
          trendLabel="improvement"
        />
        <MetricCard
          title="Compliance Score"
          value={`${metrics.complianceScore}%`}
          trend={metrics.complianceTrend}
          icon={CheckCircle}
          iconColor="bg-emerald-500/10 text-emerald-400"
          trendLabel="audit ready"
        />
      </div>

      {/* Secondary Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricCard
          title="Active Cases"
          value={metrics.activeCases}
          trend={metrics.casesTrend}
          icon={FileText}
          iconColor="bg-cyan-500/10 text-cyan-400"
          trendLabel="in progress"
        />
        <MetricCard
          title="Cost Savings (Annual)"
          value={metrics.costSavings}
          trend={metrics.costSavingsTrend}
          icon={DollarSign}
          iconColor="bg-green-500/10 text-green-400"
          trendLabel="ROI increase"
        />
        <MetricCard
          title="Critical Vulnerabilities"
          value={metrics.criticalVulnerabilities}
          trend={metrics.vulnTrend}
          icon={Target}
          iconColor="bg-orange-500/10 text-orange-400"
          trendLabel="remediated"
        />
        <MetricCard
          title="High-Risk Network Accounts"
          value={metrics.highRiskAccounts}
          trend={metrics.accountRiskTrend}
          icon={Users}
          iconColor="bg-purple-500/10 text-purple-400"
          trendLabel="monitored"
        />
      </div>

      {/* Risk Heatmap and Threat Intelligence */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Risk Assessment */}
        <div className="enterprise-card p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-slate-100 flex items-center space-x-2">
              <Activity className="w-5 h-5 text-red-400" />
              <span>Risk Assessment Matrix</span>
            </h3>
            <span className="text-xs text-slate-500">Updated 5 min ago</span>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-slate-800/30 rounded-lg border border-slate-700/50">
              <div className="flex items-center space-x-3">
                <div className="w-3 h-3 rounded-full bg-red-500"></div>
                <div>
                  <p className="text-sm font-medium text-slate-200">Critical Risk</p>
                  <p className="text-xs text-slate-500">Immediate action required</p>
                </div>
              </div>
              <span className="text-2xl font-bold text-red-400">{metrics.criticalAlerts}</span>
            </div>

            <div className="flex items-center justify-between p-4 bg-slate-800/30 rounded-lg border border-slate-700/50">
              <div className="flex items-center space-x-3">
                <div className="w-3 h-3 rounded-full bg-orange-500"></div>
                <div>
                  <p className="text-sm font-medium text-slate-200">High Risk</p>
                  <p className="text-xs text-slate-500">Action needed within 24h</p>
                </div>
              </div>
              <span className="text-2xl font-bold text-orange-400">{metrics.criticalVulnerabilities}</span>
            </div>

            <div className="flex items-center justify-between p-4 bg-slate-800/30 rounded-lg border border-slate-700/50">
              <div className="flex items-center space-x-3">
                <div className="w-3 h-3 rounded-full bg-amber-500"></div>
                <div>
                  <p className="text-sm font-medium text-slate-200">Medium Risk</p>
                  <p className="text-xs text-slate-500">Monitor and address</p>
                </div>
              </div>
              <span className="text-2xl font-bold text-amber-400">{metrics.highRiskAccounts}</span>
            </div>

            <div className="flex items-center justify-between p-4 bg-slate-800/30 rounded-lg border border-slate-700/50">
              <div className="flex items-center space-x-3">
                <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
                <div>
                  <p className="text-sm font-medium text-slate-200">Low Risk</p>
                  <p className="text-xs text-slate-500">Routine monitoring</p>
                </div>
              </div>
              <span className="text-2xl font-bold text-emerald-400">156</span>
            </div>
          </div>
        </div>

        {/* Strategic Initiatives */}
        <div className="enterprise-card p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-slate-100 flex items-center space-x-2">
              <Target className="w-5 h-5 text-blue-400" />
              <span>Strategic Initiatives</span>
            </h3>
            <span className="text-xs text-slate-500">Q4 2025</span>
          </div>

          <div className="space-y-4">
            <div className="p-4 bg-slate-800/30 rounded-lg border border-slate-700/50">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-medium text-slate-200">Zero Trust Implementation</p>
                <span className="text-xs px-2 py-1 bg-blue-500/10 text-blue-400 rounded-full">In Progress</span>
              </div>
              <div className="w-full bg-slate-700 rounded-full h-2">
                <div className="bg-blue-500 h-2 rounded-full" style={{ width: '65%' }}></div>
              </div>
              <p className="text-xs text-slate-500 mt-2">65% complete - On track</p>
            </div>

            <div className="p-4 bg-slate-800/30 rounded-lg border border-slate-700/50">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-medium text-slate-200">AI-Powered Threat Detection</p>
                <span className="text-xs px-2 py-1 bg-green-500/10 text-green-400 rounded-full">Active</span>
              </div>
              <div className="w-full bg-slate-700 rounded-full h-2">
                <div className="bg-green-500 h-2 rounded-full" style={{ width: '100%' }}></div>
              </div>
              <p className="text-xs text-slate-500 mt-2">Deployed - Monitoring performance</p>
            </div>

            <div className="p-4 bg-slate-800/30 rounded-lg border border-slate-700/50">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-medium text-slate-200">Cloud Security Posture</p>
                <span className="text-xs px-2 py-1 bg-amber-500/10 text-amber-400 rounded-full">Planning</span>
              </div>
              <div className="w-full bg-slate-700 rounded-full h-2">
                <div className="bg-amber-500 h-2 rounded-full" style={{ width: '30%' }}></div>
              </div>
              <p className="text-xs text-slate-500 mt-2">30% complete - Requirements phase</p>
            </div>

            <div className="p-4 bg-slate-800/30 rounded-lg border border-slate-700/50">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-medium text-slate-200">Security Automation Program</p>
                <span className="text-xs px-2 py-1 bg-cyan-500/10 text-cyan-400 rounded-full">In Progress</span>
              </div>
              <div className="w-full bg-slate-700 rounded-full h-2">
                <div className="bg-cyan-500 h-2 rounded-full" style={{ width: '80%' }}></div>
              </div>
              <p className="text-xs text-slate-500 mt-2">80% complete - Testing phase</p>
            </div>
          </div>
        </div>
      </div>

      {/* Compliance and Audit */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="enterprise-card p-6">
          <div className="flex items-center space-x-3 mb-4">
            <Award className="w-5 h-5 text-emerald-400" />
            <h3 className="text-lg font-semibold text-slate-100">Compliance Status</h3>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-slate-800/30 rounded-lg">
              <span className="text-sm text-slate-300">SOC 2 Type II</span>
              <span className="px-2 py-1 bg-emerald-500/10 text-emerald-400 text-xs rounded-full">Compliant</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-slate-800/30 rounded-lg">
              <span className="text-sm text-slate-300">ISO 27001</span>
              <span className="px-2 py-1 bg-emerald-500/10 text-emerald-400 text-xs rounded-full">Certified</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-slate-800/30 rounded-lg">
              <span className="text-sm text-slate-300">GDPR</span>
              <span className="px-2 py-1 bg-emerald-500/10 text-emerald-400 text-xs rounded-full">Compliant</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-slate-800/30 rounded-lg">
              <span className="text-sm text-slate-300">HIPAA</span>
              <span className="px-2 py-1 bg-emerald-500/10 text-emerald-400 text-xs rounded-full">Compliant</span>
            </div>
          </div>
        </div>

        <div className="enterprise-card p-6">
          <div className="flex items-center space-x-3 mb-4">
            <Zap className="w-5 h-5 text-amber-400" />
            <h3 className="text-lg font-semibold text-slate-100">SOC Performance</h3>
          </div>
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-slate-300">Alert Resolution Rate</span>
                <span className="text-sm font-semibold text-slate-100">99.2%</span>
              </div>
              <div className="w-full bg-slate-700 rounded-full h-2">
                <div className="bg-emerald-500 h-2 rounded-full" style={{ width: '99.2%' }}></div>
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-slate-300">SLA Achievement</span>
                <span className="text-sm font-semibold text-slate-100">99.9%</span>
              </div>
              <div className="w-full bg-slate-700 rounded-full h-2">
                <div className="bg-blue-500 h-2 rounded-full" style={{ width: '99.9%' }}></div>
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-slate-300">Automation Coverage</span>
                <span className="text-sm font-semibold text-slate-100">80%</span>
              </div>
              <div className="w-full bg-slate-700 rounded-full h-2">
                <div className="bg-cyan-500 h-2 rounded-full" style={{ width: '80%' }}></div>
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-slate-300">Analyst Efficiency</span>
                <span className="text-sm font-semibold text-slate-100">94%</span>
              </div>
              <div className="w-full bg-slate-700 rounded-full h-2">
                <div className="bg-purple-500 h-2 rounded-full" style={{ width: '94%' }}></div>
              </div>
            </div>
          </div>
        </div>

        <div className="enterprise-card p-6">
          <div className="flex items-center space-x-3 mb-4">
            <DollarSign className="w-5 h-5 text-green-400" />
            <h3 className="text-lg font-semibold text-slate-100">Financial Impact</h3>
          </div>
          <div className="space-y-4">
            <div className="p-4 bg-gradient-to-br from-green-500/10 to-emerald-500/10 rounded-lg border border-green-500/20">
              <p className="text-sm text-slate-400 mb-1">Cost Avoidance</p>
              <p className="text-3xl font-bold text-green-400">$4.2M</p>
              <p className="text-xs text-slate-500 mt-1">Prevented breach costs</p>
            </div>
            <div className="p-4 bg-slate-800/30 rounded-lg border border-slate-700/50">
              <p className="text-sm text-slate-400 mb-1">Efficiency Gains</p>
              <p className="text-2xl font-bold text-slate-100">$1.8M</p>
              <p className="text-xs text-slate-500 mt-1">Automation savings</p>
            </div>
            <div className="p-4 bg-slate-800/30 rounded-lg border border-slate-700/50">
              <p className="text-sm text-slate-400 mb-1">Total ROI</p>
              <p className="text-2xl font-bold text-blue-400">312%</p>
              <p className="text-xs text-slate-500 mt-1">3.12x return on investment</p>
            </div>
          </div>
        </div>
      </div>

      {/* Executive Summary */}
      <div className="enterprise-card p-6">
        <div className="flex items-center space-x-3 mb-6">
          <FileText className="w-5 h-5 text-blue-400" />
          <h3 className="text-lg font-semibold text-slate-100">Executive Summary</h3>
          <span className="text-xs text-slate-500">Last 30 days</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-slate-300 flex items-center space-x-2">
              <CheckCircle className="w-4 h-4 text-emerald-400" />
              <span>Key Achievements</span>
            </h4>
            <ul className="space-y-2 text-sm text-slate-400">
              <li className="flex items-start space-x-2">
                <span className="text-emerald-400 mt-1">•</span>
                <span>Reduced critical alert volume by 15% through improved detection rules</span>
              </li>
              <li className="flex items-start space-x-2">
                <span className="text-emerald-400 mt-1">•</span>
                <span>Achieved 99.9% SLA compliance across all security operations</span>
              </li>
              <li className="flex items-start space-x-2">
                <span className="text-emerald-400 mt-1">•</span>
                <span>Deployed AI-powered threat detection with 94% accuracy</span>
              </li>
              <li className="flex items-start space-x-2">
                <span className="text-emerald-400 mt-1">•</span>
                <span>Completed Q4 compliance audits with zero findings</span>
              </li>
            </ul>
          </div>

          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-slate-300 flex items-center space-x-2">
              <Eye className="w-4 h-4 text-amber-400" />
              <span>Areas of Focus</span>
            </h4>
            <ul className="space-y-2 text-sm text-slate-400">
              <li className="flex items-start space-x-2">
                <span className="text-amber-400 mt-1">•</span>
                <span>Continue monitoring {metrics.highRiskAccounts} high-risk network account behaviors</span>
              </li>
              <li className="flex items-start space-x-2">
                <span className="text-amber-400 mt-1">•</span>
                <span>Accelerate remediation of {metrics.criticalVulnerabilities} critical vulnerabilities</span>
              </li>
              <li className="flex items-start space-x-2">
                <span className="text-amber-400 mt-1">•</span>
                <span>Complete Zero Trust architecture rollout by Q1 2026</span>
              </li>
              <li className="flex items-start space-x-2">
                <span className="text-amber-400 mt-1">•</span>
                <span>Enhance cloud security posture management capabilities</span>
              </li>
            </ul>
          </div>

          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-slate-300 flex items-center space-x-2">
              <Lock className="w-4 h-4 text-blue-400" />
              <span>Strategic Priorities</span>
            </h4>
            <ul className="space-y-2 text-sm text-slate-400">
              <li className="flex items-start space-x-2">
                <span className="text-blue-400 mt-1">•</span>
                <span>Expand security automation to 90% coverage by Q2</span>
              </li>
              <li className="flex items-start space-x-2">
                <span className="text-blue-400 mt-1">•</span>
                <span>Implement advanced threat intelligence platform</span>
              </li>
              <li className="flex items-start space-x-2">
                <span className="text-blue-400 mt-1">•</span>
                <span>Enhance insider threat detection capabilities</span>
              </li>
              <li className="flex items-start space-x-2">
                <span className="text-blue-400 mt-1">•</span>
                <span>Prepare for board security briefing in Q1 2026</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExecutiveDashboard;
