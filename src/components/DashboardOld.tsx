import { useState, useEffect } from 'react';
import {
  Shield,
  Activity,
  AlertTriangle,
  Users,
  Database,
  TrendingUp,
  Clock,
  Target,
  Workflow,
  Zap,
  Rss,
  Menu,
  X,
  ChevronRight,
  Globe,
  Briefcase,
  Scan,
  Calculator,
  Network,
  Brain,
  LogOut,
  Layers,
  CheckCircle2,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  DollarSign,
  TrendingDown,
  Award,
  BarChart3,
  Bug,
  Crosshair
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import ThreatGlobe from './ThreatGlobe';
import AttackVectorGraph from './AttackVectorGraph';
import ListsPanel from './ListsPanel';
import EventStream from './EventStream';
import AlertsPanel from './AlertsPanel';
import WorkflowsPanel from './WorkflowsPanel';
import ResponseAutomation from './ResponseAutomation';
import ThreatFeedsPanel from './ThreatFeedsPanel';
import IOCPanel from './IOCPanel';
import CasesPanel from './CasesPanel';
import PatternDiscoveryPanel from './PatternDiscoveryPanel';
import ThreatEscalationPanel from './ThreatEscalationPanel';
import VectorThreatHunting from './VectorThreatHunting';
import NetworkTopology from './NetworkTopology';
import AgentBricksSOC from './AgentBricksSOC';
import ArchitectureVisualization from './ArchitectureVisualization';
import SmartThreatModeling from './SmartThreatModeling';
import UserBehavior from './UserBehavior';
import BusinessOverview from './BusinessOverview';
import PublicSectorOverview from './PublicSectorOverview';
import RiskOverview from './RiskOverview';
import StreamingGraphVisualization from './StreamingGraphVisualization';
import VulnerabilitiesPanel from './VulnerabilitiesPanel';
import AIMalwareSandbox from './AIMalwareSandbox';
import RedTeamAutomation from './RedTeamAutomation';
import DataConnectors from './DataConnectors';
import { supabase } from '../lib/supabase';

const Dashboard = () => {
  const { user, signOut } = useAuth();
  const [stats, setStats] = useState({
    totalEvents: 0,
    activeSessions: 0,
    criticalAlerts: 0,
    blockedThreats: 0,
  });

  const [recentActivities, setRecentActivities] = useState<any[]>([]);

  const [selectedView, setSelectedView] = useState<'overview' | 'lists' | 'events' | 'alerts' | 'cases' | 'workflows' | 'responses' | 'feeds' | 'iocs' | 'attackvectors' | 'patterns' | 'escalation' | 'vectorhunt' | 'topology' | 'agentbricks' | 'architecture' | 'threatmodeling' | 'userbehavior' | 'streaminggraph' | 'services' | 'vulnerabilities' | 'malwaresandbox' | 'redteam' | 'dataconnectors'>('overview');
  const [scorecardType, setScorecardType] = useState<'business' | 'publicsector'>('business');
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => {
    loadStats();
    loadRecentActivities();

    // Set up real-time subscriptions for live feed
    const alertsSubscription = supabase
      .channel('alerts_changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'alerts' }, (payload) => {
        console.log('🚨 New alert received:', payload);
        loadRecentActivities();
        loadStats();
      })
      .subscribe();

    const eventsSubscription = supabase
      .channel('events_changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'events' }, (payload) => {
        console.log('📊 New event received:', payload);
        loadRecentActivities();
        loadStats();
      })
      .subscribe();

    const casesSubscription = supabase
      .channel('cases_changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'cases' }, (payload) => {
        console.log('New case:', payload);
        loadRecentActivities();
      })
      .subscribe();

    const agentsSubscription = supabase
      .channel('agent_tasks_changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'agent_tasks' }, (payload) => {
        console.log('New agent task:', payload);
        loadRecentActivities();
      })
      .subscribe();

    const usersSubscription = supabase
      .channel('user_behavior_changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'user_behavior_events' }, (payload) => {
        console.log('👤 New user behavior event:', payload);
        loadRecentActivities();
        loadStats();
      })
      .subscribe();

    // Periodic refresh for stats
    const interval = setInterval(() => {
      loadStats();
    }, 10000);

    return () => {
      clearInterval(interval);
      alertsSubscription.unsubscribe();
      eventsSubscription.unsubscribe();
      casesSubscription.unsubscribe();
      agentsSubscription.unsubscribe();
      usersSubscription.unsubscribe();
    };
  }, []);

  const loadStats = async () => {
    try {
      const [eventsResult, sessionsResult, alertsResult] = await Promise.all([
        supabase.from('events').select('id', { count: 'exact', head: true }),
        supabase.from('sessions').select('id', { count: 'exact', head: true }).eq('status', 'active'),
        supabase.from('alerts').select('id', { count: 'exact', head: true }).eq('severity', 'critical').eq('status', 'new'),
      ]);

      setStats({
        totalEvents: eventsResult.count || 24567,
        activeSessions: sessionsResult.count || 1247,
        criticalAlerts: alertsResult.count || 8,
        blockedThreats: Math.floor(Math.random() * 50) + 156,
      });
    } catch (error) {
      console.error('Error loading stats:', error);
      setStats({
        totalEvents: 24567,
        activeSessions: 1247,
        criticalAlerts: 8,
        blockedThreats: 156,
      });
    }
  };

  const loadRecentActivities = async () => {
    try {
      const [alerts, events, cases, agents, users] = await Promise.all([
        supabase.from('alerts').select('id, title, severity, created_at').order('created_at', { ascending: false }).limit(3),
        supabase.from('events').select('id, event_type, severity, created_at').order('created_at', { ascending: false }).limit(3),
        supabase.from('cases').select('id, title, priority, created_at').order('created_at', { ascending: false }).limit(2),
        supabase.from('agent_tasks').select('id, task_type, status, created_at').order('created_at', { ascending: false }).limit(2),
        supabase.from('user_behavior_events').select('id, event_type, anomaly_score, timestamp').order('timestamp', { ascending: false }).limit(2),
      ]);

      const activities = [
        ...(alerts.data || []).map((a: any) => ({ ...a, source: 'Alerts', type: a.severity })),
        ...(events.data || []).map((e: any) => ({ ...e, source: 'Events', type: e.severity, created_at: e.created_at })),
        ...(cases.data || []).map((c: any) => ({ ...c, source: 'Cases', type: c.priority })),
        ...(agents.data || []).map((a: any) => ({ ...a, source: 'Agents', type: a.status, title: a.task_type })),
        ...(users.data || []).map((u: any) => ({ ...u, source: 'Users', type: u.anomaly_score > 70 ? 'critical' : u.anomaly_score > 40 ? 'high' : 'medium', created_at: u.timestamp })),
      ].sort((a, b) => new Date(b.created_at || b.timestamp).getTime() - new Date(a.created_at || a.timestamp).getTime()).slice(0, 12);

      setRecentActivities(activities);
    } catch (error) {
      console.error('Error loading recent activities:', error);
    }
  };

  const mockThreats = [
    { source: { lat: 40.7128, lon: -74.0060 }, target: { lat: 37.7749, lon: -122.4194 }, severity: 'critical' as const },
    { source: { lat: 51.5074, lon: -0.1278 }, target: { lat: 35.6762, lon: 139.6503 }, severity: 'high' as const },
    { source: { lat: -33.8688, lon: 151.2093 }, target: { lat: 1.3521, lon: 103.8198 }, severity: 'medium' as const },
    { source: { lat: 55.7558, lon: 37.6173 }, target: { lat: 40.7128, lon: -74.0060 }, severity: 'critical' as const },
    { source: { lat: 39.9042, lon: 116.4074 }, target: { lat: 51.5074, lon: -0.1278 }, severity: 'high' as const },
    { source: { lat: 19.4326, lon: -99.1332 }, target: { lat: 1.3521, lon: 103.8198 }, severity: 'medium' as const },
    { source: { lat: -23.5505, lon: -46.6333 }, target: { lat: 52.5200, lon: 13.4050 }, severity: 'high' as const },
    { source: { lat: 28.6139, lon: 77.2090 }, target: { lat: -33.8688, lon: 151.2093 }, severity: 'medium' as const },
    { source: { lat: 35.6762, lon: 139.6503 }, target: { lat: 37.5665, lon: 126.9780 }, severity: 'critical' as const },
    { source: { lat: 25.2048, lon: 55.2708 }, target: { lat: 22.3193, lon: 114.1694 }, severity: 'high' as const },
  ];

  const navigationItems = [
    { id: 'overview', label: 'Overview', icon: Database },
    { id: 'agentbricks', label: 'AgentBricks SOC', icon: Brain },
    { id: 'threatmodeling', label: 'Smart Threat Modeling', icon: Shield },
    { id: 'userbehavior', label: 'User Behaviors', icon: Users },
    { id: 'attackvectors', label: 'Attack Vectors', icon: Target },
    { id: 'vectorhunt', label: 'AI Threat Hunting', icon: TrendingUp },
    { id: 'topology', label: 'Assets', icon: Network },
    { id: 'vulnerabilities', label: 'Vulnerabilities', icon: Shield },
    { id: 'lists', label: 'Sessions & Lists', icon: Activity },
    { id: 'events', label: 'Event Stream', icon: Activity },
    { id: 'alerts', label: 'Alerts', icon: AlertTriangle },
    { id: 'cases', label: 'Cases', icon: Briefcase },
    { id: 'patterns', label: 'Pattern Discovery', icon: Scan },
    { id: 'escalation', label: 'Threat Escalation', icon: Calculator },
    { id: 'workflows', label: 'Workflows', icon: Workflow },
    { id: 'responses', label: 'Responses', icon: Zap },
    { id: 'feeds', label: 'Threat Feeds', icon: Rss },
    { id: 'iocs', label: 'IOCs', icon: Shield },
    { id: 'malwaresandbox', label: 'AI Malware Sandbox', icon: Bug },
    { id: 'redteam', label: 'Red Team Automation', icon: Crosshair },
    { id: 'dataconnectors', label: 'Data Connectors', icon: Database },
    { id: 'streaminggraph', label: 'Streaming Graph', icon: Network },
    { id: 'architecture', label: 'Architecture', icon: Layers },
  ];

  return (
    <div className="min-h-screen bg-slate-950 flex">
      <aside
        className={`fixed left-0 top-0 h-full bg-slate-900 border-r border-slate-800 transition-all duration-300 z-50 flex flex-col ${
          sidebarOpen ? 'w-64' : 'w-20'
        }`}
      >
        <div className="flex items-center justify-between p-6 border-b border-slate-800 flex-shrink-0">
          {sidebarOpen ? (
            <div className="flex items-center space-x-3">
              <img src="/dbricks copy.png" alt="dazzle logo" className="w-8 h-8" />
              <div>
                <h1 className="text-lg font-bold text-white">dazzle</h1>
                <p className="text-xs text-slate-500">SIEM Platform</p>
                <p className="text-xs text-slate-600">by Luiz Zanardo</p>
              </div>
            </div>
          ) : (
            <img src="/dbricks copy.png" alt="dazzle logo" className="w-8 h-8" />
          )}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="text-slate-400 hover:text-white transition-colors"
          >
            {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        <nav className="p-4 space-y-1 flex-1 overflow-y-auto">
          {navigationItems.map((item) => {
            const Icon = item.icon;
            const isActive = selectedView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setSelectedView(item.id as any)}
                className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-all ${
                  isActive
                    ? 'bg-slate-800 text-white border border-slate-700'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/50'
                }`}
              >
                <Icon className="w-5 h-5 flex-shrink-0" />
                {sidebarOpen && <span className="text-sm font-medium">{item.label}</span>}
                {sidebarOpen && isActive && <ChevronRight className="w-4 h-4 ml-auto" />}
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-800 flex-shrink-0">
          <div className="flex items-center space-x-2 px-3 py-2 bg-green-500/10 border border-green-500/20 rounded-lg">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            {sidebarOpen && <span className="text-green-400 text-xs font-medium">System Active</span>}
          </div>
        </div>
      </aside>

      <div className={`flex-1 transition-all duration-300 ${sidebarOpen ? 'ml-64' : 'ml-20'}`}>
        <header className="bg-slate-900/50 backdrop-blur-xl border-b border-slate-800 sticky top-0 z-40">
          <div className="px-8 py-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-white">
                  {navigationItems.find((item) => item.id === selectedView)?.label || 'Overview'}
                </h2>
                <p className="text-sm text-slate-400 mt-1">
                  Real-time security monitoring and threat detection
                </p>
              </div>
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2 px-4 py-2 bg-slate-800 rounded-lg border border-slate-700">
                  <img src="/LUIZZZZZZZ.png" alt="User" className="w-8 h-8 rounded-full border-2 border-slate-600" />
                  <span className="text-slate-300 text-sm">{user?.full_name || user?.username}</span>
                </div>
                <div className="flex items-center space-x-2 px-4 py-2 bg-slate-800 rounded-lg border border-slate-700">
                  <Clock className="text-slate-400 w-4 h-4" />
                  <span className="text-slate-300 text-sm font-mono">{new Date().toLocaleTimeString()}</span>
                </div>
                <button
                  onClick={signOut}
                  className="flex items-center space-x-2 px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg border border-red-500/30 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  <span className="text-sm">Logout</span>
                </button>
              </div>
            </div>
          </div>
        </header>

        <main className="p-8">
          {selectedView === 'overview' && (
            <>
              {/* Risk Overview Section */}
              <RiskOverview />

              <div className="mt-8 mb-8">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-2xl font-bold text-white mb-2">Business Scorecards</h2>
                    <p className="text-slate-400">Strategic objectives and key performance indicators</p>
                  </div>
                  <div className="flex items-center space-x-2 bg-slate-800 rounded-lg p-1 border border-slate-700">
                    <button
                      onClick={() => setScorecardType('business')}
                      className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                        scorecardType === 'business'
                          ? 'bg-blue-600 text-white shadow-lg'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      <div className="flex items-center space-x-2">
                        <Briefcase className="w-4 h-4" />
                        <span>Business Scorecard</span>
                      </div>
                    </button>
                    <button
                      onClick={() => setScorecardType('publicsector')}
                      className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                        scorecardType === 'publicsector'
                          ? 'bg-cyan-600 text-white shadow-lg'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      <div className="flex items-center space-x-2">
                        <Shield className="w-4 h-4" />
                        <span>Public Sector Scorecard</span>
                      </div>
                    </button>
                  </div>
                </div>
              </div>

              {scorecardType === 'business' ? <BusinessOverview /> : <PublicSectorOverview />}

              <div className="mt-8 mb-8">
                <h2 className="text-2xl font-bold text-white mb-2">Operational Metrics</h2>
                <p className="text-slate-400">Key performance indicators and response times</p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
                <OKRCard
                  title="Mean Time to Detect"
                  current={12}
                  target={15}
                  unit="minutes"
                  trend="down"
                  status="on-track"
                  description="Average time to identify security incidents"
                />
                <OKRCard
                  title="Mean Time to Respond"
                  current={28}
                  target={30}
                  unit="minutes"
                  trend="down"
                  status="on-track"
                  description="Average time to initiate incident response"
                />
                <OKRCard
                  title="Threat Detection Rate"
                  current={94.2}
                  target={95}
                  unit="%"
                  trend="up"
                  status="at-risk"
                  description="Percentage of threats successfully detected"
                />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
                <OKRCard
                  title="False Positive Rate"
                  current={3.8}
                  target={5}
                  unit="%"
                  trend="down"
                  status="on-track"
                  description="Percentage of alerts identified as false positives"
                />
                <OKRCard
                  title="Critical Alerts Resolved"
                  current={89}
                  target={95}
                  unit="%"
                  trend="up"
                  status="at-risk"
                  description="Percentage of critical alerts fully resolved"
                />
                <OKRCard
                  title="Security Coverage"
                  current={97.5}
                  target={98}
                  unit="%"
                  trend="stable"
                  status="on-track"
                  description="Percentage of infrastructure with active monitoring"
                />
              </div>

              <div className="mb-8">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-2xl font-bold text-white mb-2 flex items-center space-x-3">
                      <BarChart3 className="w-7 h-7 text-emerald-400" />
                      <span>Business Impact Analysis</span>
                    </h2>
                    <p className="text-slate-400">Financial and operational metrics demonstrating security value</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                  <BusinessMetricCard
                    icon={<DollarSign className="w-6 h-6" />}
                    title="Cost Avoidance"
                    value="$2.4M"
                    period="This Quarter"
                    trend="+18%"
                    trendLabel="vs last quarter"
                    color="emerald"
                    description="Estimated financial impact of prevented incidents"
                  />
                  <BusinessMetricCard
                    icon={<TrendingDown className="w-6 h-6" />}
                    title="Operational Downtime"
                    value="0.08%"
                    period="Monthly Average"
                    trend="-42%"
                    trendLabel="year over year"
                    color="blue"
                    description="Security-related system unavailability"
                  />
                  <BusinessMetricCard
                    icon={<Award className="w-6 h-6" />}
                    title="Compliance Score"
                    value="98.5"
                    period="Current Rating"
                    trend="+2.3%"
                    trendLabel="vs target"
                    color="purple"
                    description="Overall regulatory compliance posture"
                  />
                  <BusinessMetricCard
                    icon={<Shield className="w-6 h-6" />}
                    title="Risk Reduction"
                    value="73%"
                    period="Year to Date"
                    trend="+12%"
                    trendLabel="from baseline"
                    color="cyan"
                    description="Decrease in overall organizational risk exposure"
                  />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
                    <h3 className="text-white font-semibold text-lg mb-4 flex items-center space-x-2">
                      <DollarSign className="w-5 h-5 text-emerald-400" />
                      <span>ROI Breakdown</span>
                    </h3>
                    <div className="space-y-4">
                      <ROIItem label="Incident Prevention" value="$1.8M" percentage={75} color="emerald" />
                      <ROIItem label="Reduced Investigation Time" value="$420K" percentage={17.5} color="blue" />
                      <ROIItem label="Compliance Penalties Avoided" value="$180K" percentage={7.5} color="purple" />
                    </div>
                    <div className="mt-4 pt-4 border-t border-slate-700">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400 text-sm">Security Platform Investment</span>
                        <span className="text-slate-300 font-semibold">$850K</span>
                      </div>
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-white font-semibold">Net Benefit</span>
                        <span className="text-emerald-400 font-bold text-xl">$1.55M</span>
                      </div>
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-slate-400 text-sm">Return on Investment</span>
                        <span className="text-emerald-400 font-semibold">282%</span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
                    <h3 className="text-white font-semibold text-lg mb-4 flex items-center space-x-2">
                      <BarChart3 className="w-5 h-5 text-blue-400" />
                      <span>Efficiency Gains</span>
                    </h3>
                    <div className="space-y-4">
                      <EfficiencyItem
                        label="Alert Investigation"
                        before="45 min"
                        after="12 min"
                        improvement="73%"
                        color="blue"
                      />
                      <EfficiencyItem
                        label="Incident Resolution"
                        before="6.5 hrs"
                        after="1.8 hrs"
                        improvement="72%"
                        color="cyan"
                      />
                      <EfficiencyItem
                        label="Threat Detection"
                        before="2.3 days"
                        after="14 min"
                        improvement="99%"
                        color="emerald"
                      />
                    </div>
                    <div className="mt-4 pt-4 border-t border-slate-700">
                      <p className="text-slate-400 text-sm">
                        Automation and AI-driven analytics have reduced manual effort by <span className="text-blue-400 font-semibold">2,400 hours/month</span>,
                        enabling the security team to focus on strategic initiatives.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden mb-8">
                <div className="bg-gradient-to-r from-slate-800 to-slate-900 px-6 py-4 border-b border-slate-800">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <Globe className="w-5 h-5 text-blue-400" />
                      <h3 className="text-lg font-semibold text-white">Global Threat Intelligence</h3>
                    </div>
                    <div className="flex space-x-2">
                      <span className="px-2 py-1 bg-red-500/20 text-red-400 rounded text-xs font-medium border border-red-500/30">Critical</span>
                      <span className="px-2 py-1 bg-orange-500/20 text-orange-400 rounded text-xs font-medium border border-orange-500/30">High</span>
                      <span className="px-2 py-1 bg-yellow-500/20 text-yellow-400 rounded text-xs font-medium border border-yellow-500/30">Medium</span>
                    </div>
                  </div>
                </div>
                <div className="h-[500px]">
                  <ThreatGlobe threats={mockThreats} />
                </div>
              </div>

              <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
                <div className="bg-gradient-to-r from-slate-800 to-slate-900 px-6 py-4 border-b border-slate-800">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <Activity className="w-5 h-5 text-blue-400" />
                      <h3 className="text-lg font-semibold text-white">Recent Activity Across All Systems</h3>
                    </div>
                    <div className="flex items-center space-x-2 px-3 py-1 bg-green-500/10 border border-green-500/20 rounded-lg">
                      <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                      <span className="text-green-400 text-xs font-medium">LIVE FEED</span>
                    </div>
                  </div>
                </div>
                <div className="p-6">
                  <div className="space-y-3">
                    {recentActivities.length > 0 ? recentActivities.map((activity, idx) => (
                      <ActivityItemDynamic key={idx} activity={activity} />
                    )) : (
                      <>
                        <ActivityItem type="critical" message="SQL injection attempt from 185.220.101.42" time="32 seconds ago" />
                        <ActivityItem type="critical" message="Multiple failed SSH login attempts detected" time="2 min ago" />
                        <ActivityItem type="warning" message="Suspicious PowerShell execution on WS-2401" time="5 min ago" />
                        <ActivityItem type="warning" message="Unusual data transfer to external IP" time="8 min ago" />
                        <ActivityItem type="info" message="Correlation rule 'Lateral Movement' triggered" time="12 min ago" />
                        <ActivityItem type="info" message="New IOC added from ThreatFox feed" time="15 min ago" />
                      </>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}

          {selectedView === 'architecture' && (
            <div className="h-[calc(100vh-180px)]">
              <ArchitectureVisualization />
            </div>
          )}
          {selectedView === 'agentbricks' && <AgentBricksSOC />}
          {selectedView === 'threatmodeling' && (
            <div className="h-[calc(100vh-180px)]">
              <SmartThreatModeling />
            </div>
          )}
          {selectedView === 'userbehavior' && (
            <div className="h-[calc(100vh-180px)]">
              <UserBehavior />
            </div>
          )}
          {selectedView === 'streaminggraph' && (
            <div className="h-[calc(100vh-180px)]">
              <StreamingGraphVisualization />
            </div>
          )}
          {selectedView === 'vulnerabilities' && (
            <div className="h-[calc(100vh-180px)] overflow-y-auto">
              <VulnerabilitiesPanel />
            </div>
          )}
          {selectedView === 'vectorhunt' && <VectorThreatHunting />}
          {selectedView === 'topology' && <NetworkTopology />}
          {selectedView === 'lists' && <ListsPanel />}
          {selectedView === 'events' && <EventStream />}
          {selectedView === 'alerts' && <AlertsPanel />}
          {selectedView === 'cases' && <CasesPanel />}
          {selectedView === 'patterns' && <PatternDiscoveryPanel />}
          {selectedView === 'escalation' && <ThreatEscalationPanel />}
          {selectedView === 'workflows' && <WorkflowsPanel />}
          {selectedView === 'responses' && <ResponseAutomation />}
          {selectedView === 'feeds' && <ThreatFeedsPanel />}
          {selectedView === 'iocs' && <IOCPanel />}
          {selectedView === 'malwaresandbox' && <AIMalwareSandbox />}
          {selectedView === 'redteam' && <RedTeamAutomation />}
          {selectedView === 'dataconnectors' && <DataConnectors />}
          {selectedView === 'attackvectors' && (
            <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
              <div className="bg-gradient-to-r from-slate-800 to-slate-900 px-6 py-4 border-b border-slate-800">
                <div className="flex items-center space-x-3">
                  <Target className="w-5 h-5 text-red-400" />
                  <h3 className="text-lg font-semibold text-white">3D Attack Vector Analysis</h3>
                </div>
              </div>
              <div className="h-[700px]">
                <AttackVectorGraph />
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

const StatCard = ({
  icon,
  title,
  value,
  trend,
  color,
}: {
  icon: React.ReactNode;
  title: string;
  value: string;
  trend: string;
  color: 'blue' | 'green' | 'red' | 'orange';
}) => {
  const colorClasses = {
    blue: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
    green: 'text-green-400 bg-green-500/10 border-green-500/20',
    red: 'text-red-400 bg-red-500/10 border-red-500/20',
    orange: 'text-orange-400 bg-orange-500/10 border-orange-500/20',
  };

  const isPositive = trend.startsWith('+');
  const trendColor = (title === 'Critical Alerts' && !isPositive) || (title !== 'Critical Alerts' && isPositive) ? 'text-green-400' : 'text-red-400';

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 hover:border-slate-700 transition-all">
      <div className="flex items-start justify-between mb-4">
        <div className={`p-3 rounded-lg border ${colorClasses[color]}`}>{icon}</div>
        <div className={`flex items-center space-x-1 px-2 py-1 rounded-md ${isPositive ? 'bg-slate-800' : 'bg-slate-800'}`}>
          <TrendingUp className={`w-3 h-3 ${trendColor}`} />
          <span className={`text-xs font-semibold ${trendColor}`}>
            {trend}
          </span>
        </div>
      </div>
      <h3 className="text-slate-500 text-xs uppercase tracking-wider mb-2 font-semibold">{title}</h3>
      <p className="text-white text-2xl font-bold">{value}</p>
    </div>
  );
};

const OKRCard = ({
  title,
  current,
  target,
  unit,
  trend,
  status,
  description,
}: {
  title: string;
  current: number;
  target: number;
  unit: string;
  trend: 'up' | 'down' | 'stable';
  status: 'on-track' | 'at-risk' | 'achieved';
}) => {
  const progress = (current / target) * 100;
  const isGoodDirection = (trend === 'down' && title.includes('Time')) || (trend === 'down' && title.includes('False')) || (trend === 'up' && !title.includes('Time') && !title.includes('False'));

  const statusConfig = {
    'on-track': { bg: 'bg-green-500/10', border: 'border-green-500/30', text: 'text-green-400', label: 'On Track' },
    'at-risk': { bg: 'bg-orange-500/10', border: 'border-orange-500/30', text: 'text-orange-400', label: 'At Risk' },
    'achieved': { bg: 'bg-blue-500/10', border: 'border-blue-500/30', text: 'text-blue-400', label: 'Achieved' },
  };

  const trendIcon = trend === 'up' ? <ArrowUpRight className="w-4 h-4" /> : trend === 'down' ? <ArrowDownRight className="w-4 h-4" /> : <Minus className="w-4 h-4" />;
  const trendColor = isGoodDirection ? 'text-green-400' : trend === 'stable' ? 'text-slate-400' : 'text-red-400';

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 hover:border-slate-700 transition-all">
      <div className="flex items-start justify-between mb-4">
        <h3 className="text-white font-semibold text-lg">{title}</h3>
        <div className={`px-2 py-1 rounded-md text-xs font-semibold ${statusConfig[status].bg} ${statusConfig[status].border} ${statusConfig[status].text} border`}>
          {statusConfig[status].label}
        </div>
      </div>

      <div className="mb-4">
        <div className="flex items-baseline space-x-2 mb-1">
          <span className="text-4xl font-bold text-white">{current}</span>
          <span className="text-xl text-slate-400">{unit}</span>
          <span className="text-slate-500 text-sm">/ {target}{unit}</span>
        </div>
        <p className="text-slate-500 text-sm">{description}</p>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-400">Progress</span>
          <div className={`flex items-center space-x-1 ${trendColor}`}>
            {trendIcon}
            <span className="font-semibold">{Math.min(progress, 100).toFixed(1)}%</span>
          </div>
        </div>
        <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              status === 'on-track' ? 'bg-green-500' : status === 'at-risk' ? 'bg-orange-500' : 'bg-blue-500'
            }`}
            style={{ width: `${Math.min(progress, 100)}%` }}
          ></div>
        </div>
      </div>
    </div>
  );
};

const ActivityItem = ({ type, message, time }: { type: 'critical' | 'warning' | 'info'; message: string; time: string }) => {
  const styles = {
    critical: {
      bg: 'bg-red-500/10',
      border: 'border-red-500/30',
      icon: <AlertTriangle className="w-4 h-4 text-red-400" />,
      dot: 'bg-red-500',
    },
    warning: {
      bg: 'bg-yellow-500/10',
      border: 'border-yellow-500/30',
      icon: <AlertTriangle className="w-4 h-4 text-yellow-400" />,
      dot: 'bg-yellow-500',
    },
    info: {
      bg: 'bg-blue-500/10',
      border: 'border-blue-500/30',
      icon: <Activity className="w-4 h-4 text-blue-400" />,
      dot: 'bg-blue-500',
    },
  };

  return (
    <div className={`flex items-start space-x-3 p-3 rounded-lg border ${styles[type].bg} ${styles[type].border} hover:border-slate-600 transition-all`}>
      <div className="flex-shrink-0 mt-1">{styles[type].icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-slate-200 text-sm leading-relaxed">{message}</p>
        <p className="text-slate-500 text-xs mt-1">{time}</p>
      </div>
      <div className={`w-2 h-2 rounded-full mt-2 ${styles[type].dot} ${type === 'critical' ? 'animate-pulse' : ''}`}></div>
    </div>
  );
};

const ActivityItemDynamic = ({ activity }: { activity: any }) => {
  const getTypeFromSeverity = (type: string) => {
    if (type === 'critical' || type === 'high') return 'critical';
    if (type === 'medium' || type === 'warning') return 'warning';
    return 'info';
  };

  const formatMessage = (activity: any) => {
    if (activity.source === 'Alerts') return activity.title || 'Alert detected';
    if (activity.source === 'Events') return `${activity.event_type?.replace(/_/g, ' ')} event detected`;
    if (activity.source === 'Cases') return activity.title || 'New case created';
    if (activity.source === 'Agents') return `Agent ${activity.title || activity.task_type?.replace(/_/g, ' ')}`;
    if (activity.source === 'Users') return `User ${activity.event_type?.replace(/_/g, ' ')} activity`;
    return 'System activity';
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    return date.toLocaleString();
  };

  const type = getTypeFromSeverity(activity.type);
  const message = `[${activity.source}] ${formatMessage(activity)}`;
  const time = formatTime(activity.created_at || activity.timestamp);

  return (
    <div className="animate-in slide-in-from-top duration-500">
      <ActivityItem type={type} message={message} time={time} />
    </div>
  );
};

const BusinessMetricCard = ({
  icon,
  title,
  value,
  period,
  trend,
  trendLabel,
  color,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  value: string;
  period: string;
  trend: string;
  trendLabel: string;
  color: 'emerald' | 'blue' | 'purple' | 'cyan';
  description: string;
}) => {
  const colorClasses = {
    emerald: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    blue: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
    purple: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
    cyan: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
  };

  const isPositive = trend.startsWith('+') || trend.startsWith('-');
  const trendColor = trend.startsWith('+') || trend.startsWith('-') && (title.includes('Downtime') || title.includes('Risk')) ? 'text-emerald-400' : trend.startsWith('-') ? 'text-red-400' : 'text-slate-400';

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 hover:border-slate-700 transition-all">
      <div className="flex items-start justify-between mb-3">
        <div className={`p-3 rounded-lg border ${colorClasses[color]}`}>{icon}</div>
      </div>
      <h3 className="text-slate-400 text-xs uppercase tracking-wider mb-1 font-semibold">{title}</h3>
      <p className="text-white text-3xl font-bold mb-1">{value}</p>
      <p className="text-slate-500 text-xs mb-3">{period}</p>
      <div className={`flex items-center space-x-1`}>
        {isPositive && <TrendingUp className={`w-3 h-3 ${trendColor}`} />}
        <span className={`text-xs font-semibold ${trendColor}`}>{trend}</span>
        <span className="text-slate-500 text-xs">{trendLabel}</span>
      </div>
      <p className="text-slate-400 text-xs mt-3 leading-relaxed">{description}</p>
    </div>
  );
};

const ROIItem = ({
  label,
  value,
  percentage,
  color,
}: {
  label: string;
  value: string;
  percentage: number;
  color: 'emerald' | 'blue' | 'purple';
}) => {
  const colorClasses = {
    emerald: 'bg-emerald-500',
    blue: 'bg-blue-500',
    purple: 'bg-purple-500',
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-slate-300 text-sm">{label}</span>
        <span className="text-white font-semibold">{value}</span>
      </div>
      <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${colorClasses[color]}`}
          style={{ width: `${percentage}%` }}
        ></div>
      </div>
    </div>
  );
};

const EfficiencyItem = ({
  label,
  before,
  after,
  improvement,
  color,
}: {
  label: string;
  before: string;
  after: string;
  improvement: string;
  color: 'blue' | 'cyan' | 'emerald';
}) => {
  const colorClasses = {
    blue: 'text-blue-400 bg-blue-500/10',
    cyan: 'text-cyan-400 bg-cyan-500/10',
    emerald: 'text-emerald-400 bg-emerald-500/10',
  };

  return (
    <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
      <div className="flex items-center justify-between mb-3">
        <span className="text-slate-300 text-sm font-medium">{label}</span>
        <span className={`text-xs font-bold px-2 py-1 rounded ${colorClasses[color]}`}>
          -{improvement}
        </span>
      </div>
      <div className="flex items-center justify-between text-xs">
        <div>
          <span className="text-slate-500">Before: </span>
          <span className="text-red-400 font-semibold line-through">{before}</span>
        </div>
        <ArrowUpRight className="w-4 h-4 text-slate-600 rotate-90" />
        <div>
          <span className="text-slate-500">After: </span>
          <span className={`font-semibold ${colorClasses[color].split(' ')[0]}`}>{after}</span>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
