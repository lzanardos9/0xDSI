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
  ShieldCheck,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  DollarSign,
  TrendingDown,
  Award,
  BarChart3,
  Bug,
  Crosshair,
  Settings,
  FileText,
  BookOpen,
  Eye,
  LayoutGrid
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
import ComplianceDashboard from './ComplianceDashboard';
import OCSFSchemaBrowser from './OCSFSchemaBrowser';
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
import CISOAssistant from './CISOAssistant';
import UserManagement from './UserManagement';
import ExecutiveDashboard from './ExecutiveDashboard';
import ProductionSettings from './ProductionSettings';
import Reports from './Reports';
import DatabricksNotebooksPanel from './DatabricksNotebooksPanel';
import ModelPoisoningGuard from './ModelPoisoningGuard';
import DocumentAnalysis from './DocumentAnalysis';
import HoneypotControl from './HoneypotControl';
import CorrelationRulesPanel from './CorrelationRulesPanel';
import SOCAgents3D from './SOCAgents3D';
import LLMGuardrailsControl from './LLMGuardrailsControl';
import GlasswingPanel from './glasswing/GlasswingPanel';
import NegativeCorrelationPanel from './negative-correlation/NegativeCorrelationPanel';
import DashboardMigrationsTab from './dashboard-builder/DashboardMigrationsTab';
import { supabase } from '../lib/supabase';

const Dashboard = () => {
  const { user, signOut } = useAuth();
  const [stats, setStats] = useState({
    totalEvents: 24567,
    activeSessions: 1247,
    criticalAlerts: 8,
    blockedThreats: 156,
  });

  const [recentActivities, setRecentActivities] = useState<any[]>([]);

  const [selectedView, setSelectedView] = useState<'overview' | 'lists' | 'events' | 'alerts' | 'cases' | 'workflows' | 'responses' | 'feeds' | 'iocs' | 'attackvectors' | 'patterns' | 'escalation' | 'vectorhunt' | 'topology' | 'agentbricks' | 'architecture' | 'threatmodeling' | 'userbehavior' | 'streaminggraph' | 'services' | 'vulnerabilities' | 'malwaresandbox' | 'redteam' | 'dataconnectors' | 'usermanagement' | 'settings' | 'reports' | 'executive' | 'ocsf' | 'compliance' | 'notebooks' | 'poisonguard' | 'docanalysis' | 'honeypot' | 'correlationrules' | 'soc3d' | 'dashboardstudio' | 'guardrails' | 'glasswing' | 'negcorrelation'>('overview');
  const [scorecardType, setScorecardType] = useState<'business' | 'publicsector'>('business');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [userRole, setUserRole] = useState<'analyst' | 'engineer' | 'admin' | 'ciso'>('admin');
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const loadUserRole = async () => {
      if (user?.id) {
        const { data } = await supabase
          .from('user_profiles')
          .select('role')
          .eq('id', user.id)
          .single();

        if (data?.role) {
          setUserRole(data.role);
        }
      }
    };
    loadUserRole();
  }, [user]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Command/Ctrl + K for command palette
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCommandPaletteOpen(prev => !prev);
      }
      // Escape to close command palette
      if (e.key === 'Escape' && commandPaletteOpen) {
        setCommandPaletteOpen(false);
        setSearchQuery('');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [commandPaletteOpen]);

  useEffect(() => {
    loadStats();
    loadRecentActivities();

    const alertsSubscription = supabase
      .channel('alerts_changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'alerts' }, () => {
        loadRecentActivities();
        loadStats();
      })
      .subscribe();

    const eventsSubscription = supabase
      .channel('events_changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'events' }, () => {
        loadRecentActivities();
        loadStats();
      })
      .subscribe();

    const casesSubscription = supabase
      .channel('cases_changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'cases' }, () => {
        loadRecentActivities();
      })
      .subscribe();

    const agentsSubscription = supabase
      .channel('agent_tasks_changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'agent_tasks' }, () => {
        loadRecentActivities();
      })
      .subscribe();

    const usersSubscription = supabase
      .channel('user_behavior_changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'user_behavior_events' }, () => {
        loadRecentActivities();
        loadStats();
      })
      .subscribe();

    // Real-time metrics updates every 100ms with realistic fluctuations
    const metricsInterval = setInterval(() => {
      setStats(prevStats => ({
        totalEvents: prevStats.totalEvents + Math.floor(Math.random() * 5) + 1,
        activeSessions: Math.max(800, prevStats.activeSessions + (Math.random() > 0.5 ? Math.floor(Math.random() * 3) : -Math.floor(Math.random() * 2))),
        criticalAlerts: Math.max(0, Math.min(25, prevStats.criticalAlerts + (Math.random() > 0.7 ? 1 : Math.random() > 0.4 ? 0 : -1))),
        blockedThreats: prevStats.blockedThreats + (Math.random() > 0.6 ? Math.floor(Math.random() * 3) + 1 : 0),
      }));
    }, 100);

    // Removed periodic loadStats to prevent overwriting live metrics
    // Live metrics are now driven entirely by the metricsInterval

    return () => {
      clearInterval(metricsInterval);
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

  // Simplified Navigation Structure
  const navigationStructure = [
    {
      section: 'Overview',
      roles: ['analyst', 'engineer', 'admin', 'ciso'],
      items: [
        { id: 'overview', label: 'Dashboard', icon: Database },
        { id: 'agentbricks', label: 'SOC Agent Bricks', icon: Brain },
        { id: 'soc3d', label: '3D SOC Agents', icon: Users },
      ]
    },
    {
      section: 'Executive',
      roles: ['ciso', 'admin'],
      items: [
        { id: 'executive', label: 'Executive Dashboard', icon: Briefcase },
      ]
    },
    {
      section: 'Detection & Intelligence',
      roles: ['analyst', 'engineer', 'admin'],
      items: [
        { id: 'glasswing', label: 'Glasswing Scanner', icon: Scan },
        { id: 'feeds', label: 'Threat Feeds', icon: Rss },
        { id: 'iocs', label: 'IOCs', icon: Shield },
        { id: 'honeypot', label: 'HoneyPot & Tokens', icon: Eye },
        { id: 'malwaresandbox', label: 'AI Malware Sandbox', icon: Bug },
        { id: 'poisonguard', label: 'Model Poisoning Guard', icon: Shield },
        { id: 'guardrails', label: 'LLM Guardrails', icon: ShieldCheck },
        { id: 'attackvectors', label: 'Attack Vectors', icon: Target },
        { id: 'threatmodeling', label: 'Smart Threat Modeling', icon: Scan },
        { id: 'correlationrules', label: 'Correlation Rules', icon: Zap },
        { id: 'negcorrelation', label: 'Negative Correlation', icon: AlertTriangle },
      ]
    },
    {
      section: 'Investigation',
      roles: ['analyst', 'engineer', 'admin'],
      items: [
        { id: 'userbehavior', label: 'User Behaviors', icon: Users },
        { id: 'topology', label: 'Network & Physical', icon: Network },
        { id: 'vulnerabilities', label: 'Vulnerabilities', icon: Bug },
        { id: 'lists', label: 'Sessions & Events', icon: Activity },
        { id: 'vectorhunt', label: 'AI Threat Hunting', icon: TrendingUp },
        { id: 'patterns', label: 'Pattern Discovery', icon: Brain },
      ]
    },
    {
      section: 'Response & Automation',
      roles: ['analyst', 'engineer', 'admin'],
      items: [
        { id: 'alerts', label: 'Alerts', icon: AlertTriangle },
        { id: 'cases', label: 'Cases', icon: Briefcase },
        { id: 'escalation', label: 'Threat Escalation', icon: Calculator },
        { id: 'workflows', label: 'Automation', icon: Workflow },
        { id: 'redteam', label: 'Red Team', icon: Crosshair },
      ]
    },
    {
      section: 'Data & Integration',
      roles: ['engineer', 'admin'],
      items: [
        { id: 'dashboardstudio', label: 'Dashboard Studio', icon: LayoutGrid },
        { id: 'notebooks', label: 'Databricks Notebooks', icon: BookOpen },
        { id: 'ocsf', label: 'OCSF Schema', icon: Database },
        { id: 'dataconnectors', label: 'Data Connectors', icon: Database },
        { id: 'docanalysis', label: 'Document Intelligence', icon: Scan },
        { id: 'streaminggraph', label: 'Streaming Graph', icon: Globe },
        { id: 'architecture', label: 'Architecture', icon: Layers },
      ]
    },
    {
      section: 'Reports',
      roles: ['analyst', 'engineer', 'admin', 'ciso'],
      items: [
        { id: 'reports', label: 'Security Reports', icon: FileText },
        { id: 'compliance', label: 'Compliance Dashboard', icon: CheckCircle2 },
      ]
    },
    {
      section: 'Administration',
      roles: ['admin', 'ciso'],
      items: [
        { id: 'usermanagement', label: 'Platform Users', icon: Users },
        { id: 'settings', label: 'Production Settings', icon: Settings },
      ]
    },
  ];

  // Flatten navigation based on role
  const getNavigationForRole = () => {
    return navigationStructure
      .filter(section => section.roles.includes(userRole))
      .flatMap(section =>
        section.items.map(item => ({
          ...item,
          section: section.section
        }))
      );
  };

  const navigationItems = getNavigationForRole();

  return (
    <div className="min-h-screen bg-[#0A1628] flex">
      {/* Sidebar */}
      <aside
        className={`fixed left-0 top-0 h-full bg-[#0C1222] border-r border-slate-800/40 transition-all duration-300 z-50 flex flex-col ${
          sidebarOpen ? 'w-64' : 'w-20'
        }`}
      >
        <div className="flex items-center justify-between px-5 py-5 border-b border-slate-800/40 flex-shrink-0">
          {sidebarOpen ? (
            <div className="flex items-center space-x-3">
              <div className="relative">
                <img src="/dbricks.png" alt="0xDSI logo" className="w-9 h-9" />
                <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-400 rounded-full border-2 border-[#0C1222]" />
              </div>
              <div>
                <h1 className="text-base font-bold text-slate-50 tracking-tight">0xDSI</h1>
                <p className="text-[11px] text-slate-500 font-medium leading-tight">Databricks SOC Intelligence</p>
              </div>
            </div>
          ) : (
            <div className="relative mx-auto">
              <img src="/dbricks.png" alt="0xDSI logo" className="w-9 h-9" />
              <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-400 rounded-full border-2 border-[#0C1222]" />
            </div>
          )}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="text-slate-500 hover:text-slate-300 transition-colors p-1.5 rounded-lg hover:bg-slate-800/60"
          >
            {sidebarOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
        </div>

        <nav className="px-3 py-2 flex-1 overflow-y-auto custom-scrollbar">
          {navigationStructure
            .filter(section => section.roles.includes(userRole))
            .map((section, sectionIndex) => (
              <div key={section.section}>
                {sidebarOpen ? (
                  <div className="px-2 pt-5 pb-1.5">
                    <p className="text-[10px] font-bold text-slate-600 uppercase tracking-[0.1em]">
                      {section.section}
                    </p>
                  </div>
                ) : (
                  sectionIndex > 0 && <div className="section-divider my-2" />
                )}
                <div className="space-y-0.5">
                  {section.items.map((item) => {
                    const Icon = item.icon;
                    const isActive = selectedView === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => setSelectedView(item.id as any)}
                        title={!sidebarOpen ? item.label : undefined}
                        className={`w-full flex items-center ${sidebarOpen ? 'px-3 py-2' : 'justify-center px-2 py-2.5'} rounded-lg transition-all duration-150 text-[13px] font-medium relative ${
                          isActive
                            ? 'sidebar-item-active'
                            : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                        }`}
                      >
                        <Icon className={`w-[18px] h-[18px] flex-shrink-0 ${isActive ? 'text-blue-400' : ''}`} />
                        {sidebarOpen && <span className="ml-3 truncate">{item.label}</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
        </nav>

        <div className="px-3 py-3 border-t border-slate-800/40 flex-shrink-0">
          {sidebarOpen ? (
            <div className="flex items-center gap-2.5 px-3 py-2 bg-emerald-500/8 border border-emerald-500/15 rounded-lg">
              <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
              <span className="text-emerald-400 text-[11px] font-semibold tracking-wide">SYSTEM ONLINE</span>
              <span className="ml-auto text-[10px] text-emerald-600 font-mono">v2.4.1</span>
            </div>
          ) : (
            <div className="flex justify-center">
              <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
            </div>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <div className={`flex-1 min-w-0 overflow-x-hidden transition-all duration-300 ${sidebarOpen ? 'ml-64' : 'ml-20'}`}>
        {/* Header */}
        <header className="glass-panel sticky top-0 z-40 border-b border-slate-800/30">
          <div className="px-8 py-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-3">
                  <h2 className="text-lg font-semibold text-slate-50 tracking-tight">
                    {navigationItems.find((item) => item.id === selectedView)?.label || 'Overview'}
                  </h2>
                  {userRole === 'ciso' && (
                    <span className="stat-badge bg-blue-500/10 text-blue-400 border border-blue-500/20">
                      Executive View
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  {userRole === 'ciso'
                    ? 'Strategic security insights and business metrics'
                    : 'Real-time security monitoring and threat detection'
                  }
                </p>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setCommandPaletteOpen(true)}
                  className="flex items-center space-x-2 px-3 py-1.5 bg-slate-800/40 hover:bg-slate-700/50 rounded-lg border border-slate-700/30 transition-all group"
                >
                  <Scan className="text-slate-500 group-hover:text-slate-300 w-3.5 h-3.5" />
                  <span className="text-slate-500 group-hover:text-slate-300 text-xs">Search</span>
                  <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-slate-700/40 text-slate-500 rounded border border-slate-600/50">⌘K</kbd>
                </button>

                <select
                  value={userRole}
                  onChange={(e) => setUserRole(e.target.value as any)}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer bg-slate-800/40 hover:bg-slate-700/50 text-slate-300 border-slate-700/30"
                >
                  <option value="ciso">CISO</option>
                  <option value="analyst">Analyst</option>
                  <option value="engineer">Engineer</option>
                  <option value="admin">Admin</option>
                </select>

                <div className="flex items-center space-x-2 px-3 py-1.5 bg-slate-800/40 rounded-lg border border-slate-700/30">
                  <div className="w-6 h-6 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center ring-1 ring-white/10">
                    <span className="text-white text-[10px] font-bold">
                      {(user?.full_name || user?.username || 'U').charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <span className="text-slate-300 text-xs font-medium max-w-[100px] truncate">{user?.full_name || user?.username}</span>
                </div>
                <button
                  onClick={signOut}
                  className="flex items-center space-x-1.5 px-3 py-1.5 bg-red-500/8 hover:bg-red-500/15 text-red-400 rounded-lg border border-red-500/20 transition-all"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span className="text-xs font-medium">Logout</span>
                </button>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content Area */}
        <main className="p-8 custom-scrollbar min-w-0 overflow-x-hidden">
          {selectedView === 'overview' && (
            <>
              <div className="mb-8">
                <div className="h-[600px]">
                  <CISOAssistant />
                </div>
              </div>

              <div className="enterprise-card overflow-hidden mb-8">
                <div className="bg-slate-800/30 px-6 py-4 border-b border-slate-700/50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <Globe className="w-5 h-5 text-blue-400" />
                      <h3 className="text-lg font-semibold text-slate-100">Global Threat Intelligence</h3>
                    </div>
                    <div className="flex space-x-2">
                      <span className="px-2.5 py-1 bg-red-500/10 text-red-400 rounded text-xs font-medium border border-red-500/20">Critical</span>
                      <span className="px-2.5 py-1 bg-orange-500/10 text-orange-400 rounded text-xs font-medium border border-orange-500/20">High</span>
                      <span className="px-2.5 py-1 bg-amber-500/10 text-amber-400 rounded text-xs font-medium border border-amber-500/20">Medium</span>
                    </div>
                  </div>
                </div>
                <div className="h-[500px]">
                  <ThreatGlobe threats={mockThreats} />
                </div>
              </div>

              {/* Live Metrics Dashboard */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                <div className="bg-gradient-to-br from-blue-600/20 to-blue-800/20 border border-blue-500/30 rounded-xl p-6 backdrop-blur-sm">
                  <div className="flex items-center justify-between mb-4">
                    <div className="p-3 bg-blue-500/20 rounded-lg">
                      <Activity className="w-6 h-6 text-blue-400" />
                    </div>
                    <div className="px-3 py-1 bg-blue-500/20 rounded-full">
                      <span className="text-blue-400 text-xs font-semibold flex items-center gap-1">
                        <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></div>
                        LIVE
                      </span>
                    </div>
                  </div>
                  <h3 className="text-gray-400 text-sm font-medium mb-2">Total Events</h3>
                  <p className="text-3xl font-bold text-white mb-1">{stats.totalEvents.toLocaleString()}</p>
                  <p className="text-blue-400 text-sm flex items-center gap-1">
                    <TrendingUp className="w-4 h-4" />
                    <span>Streaming</span>
                  </p>
                </div>

                <div className="bg-gradient-to-br from-green-600/20 to-green-800/20 border border-green-500/30 rounded-xl p-6 backdrop-blur-sm">
                  <div className="flex items-center justify-between mb-4">
                    <div className="p-3 bg-green-500/20 rounded-lg">
                      <Users className="w-6 h-6 text-green-400" />
                    </div>
                    <div className="px-3 py-1 bg-green-500/20 rounded-full">
                      <span className="text-green-400 text-xs font-semibold flex items-center gap-1">
                        <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                        LIVE
                      </span>
                    </div>
                  </div>
                  <h3 className="text-gray-400 text-sm font-medium mb-2">Active Sessions</h3>
                  <p className="text-3xl font-bold text-white mb-1">{stats.activeSessions.toLocaleString()}</p>
                  <p className="text-green-400 text-sm flex items-center gap-1">
                    <Activity className="w-4 h-4" />
                    <span>Real-time</span>
                  </p>
                </div>

                <div className="bg-gradient-to-br from-red-600/20 to-red-800/20 border border-red-500/30 rounded-xl p-6 backdrop-blur-sm">
                  <div className="flex items-center justify-between mb-4">
                    <div className="p-3 bg-red-500/20 rounded-lg">
                      <AlertTriangle className="w-6 h-6 text-red-400" />
                    </div>
                    <div className="px-3 py-1 bg-red-500/20 rounded-full">
                      <span className="text-red-400 text-xs font-semibold flex items-center gap-1">
                        <div className="w-2 h-2 bg-red-400 rounded-full animate-pulse"></div>
                        LIVE
                      </span>
                    </div>
                  </div>
                  <h3 className="text-gray-400 text-sm font-medium mb-2">Critical Alerts</h3>
                  <p className="text-3xl font-bold text-white mb-1">{stats.criticalAlerts}</p>
                  <p className="text-red-400 text-sm flex items-center gap-1">
                    <Target className="w-4 h-4" />
                    <span>Monitoring</span>
                  </p>
                </div>

                <div className="bg-gradient-to-br from-cyan-600/20 to-teal-800/20 border border-cyan-500/30 rounded-xl p-6 backdrop-blur-sm">
                  <div className="flex items-center justify-between mb-4">
                    <div className="p-3 bg-cyan-500/20 rounded-lg">
                      <Shield className="w-6 h-6 text-cyan-400" />
                    </div>
                    <div className="px-3 py-1 bg-cyan-500/20 rounded-full">
                      <span className="text-cyan-400 text-xs font-semibold flex items-center gap-1">
                        <div className="w-2 h-2 bg-cyan-400 rounded-full animate-pulse"></div>
                        LIVE
                      </span>
                    </div>
                  </div>
                  <h3 className="text-gray-400 text-sm font-medium mb-2">Blocked Threats</h3>
                  <p className="text-3xl font-bold text-white mb-1">{stats.blockedThreats.toLocaleString()}</p>
                  <p className="text-cyan-400 text-sm flex items-center gap-1">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Protected</span>
                  </p>
                </div>
              </div>

              {/* Compliance Dashboard */}
              <div className="mb-8">
                <ComplianceDashboard />
              </div>

              <RiskOverview />

              <div className="mt-8 mb-8">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-2xl font-semibold text-slate-100 tracking-tight">Business Scorecards</h2>
                    <p className="text-slate-400 text-sm mt-1">Strategic objectives and key performance indicators</p>
                  </div>
                  <div className="flex items-center space-x-2 bg-slate-800/50 rounded-lg p-1 border border-slate-700/50">
                    <button
                      onClick={() => setScorecardType('business')}
                      className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                        scorecardType === 'business'
                          ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <div className="flex items-center space-x-2">
                        <Briefcase className="w-4 h-4" />
                        <span>Business</span>
                      </div>
                    </button>
                    <button
                      onClick={() => setScorecardType('publicsector')}
                      className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                        scorecardType === 'publicsector'
                          ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <div className="flex items-center space-x-2">
                        <Shield className="w-4 h-4" />
                        <span>Public Sector</span>
                      </div>
                    </button>
                  </div>
                </div>
              </div>

              {scorecardType === 'business' ? <BusinessOverview /> : <PublicSectorOverview />}

              <div className="mt-8 mb-6">
                <h2 className="text-2xl font-semibold text-slate-100 tracking-tight">Operational Metrics</h2>
                <p className="text-slate-400 text-sm mt-1">Key performance indicators and response times</p>
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
                    <h2 className="text-2xl font-semibold text-slate-100 tracking-tight flex items-center space-x-3">
                      <BarChart3 className="w-6 h-6 text-emerald-400" />
                      <span>Business Impact Analysis</span>
                    </h2>
                    <p className="text-slate-400 text-sm mt-1">Financial and operational metrics demonstrating security value</p>
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
                  <div className="enterprise-card p-6">
                    <h3 className="text-slate-100 font-semibold text-lg mb-4 flex items-center space-x-2">
                      <DollarSign className="w-5 h-5 text-emerald-400" />
                      <span>ROI Breakdown</span>
                    </h3>
                    <div className="space-y-4">
                      <ROIItem label="Incident Prevention" value="$1.8M" percentage={75} color="emerald" />
                      <ROIItem label="Reduced Investigation Time" value="$420K" percentage={17.5} color="blue" />
                      <ROIItem label="Compliance Penalties Avoided" value="$180K" percentage={7.5} color="purple" />
                    </div>
                    <div className="mt-4 pt-4 border-t border-slate-700/50">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400 text-sm">Security Platform Investment</span>
                        <span className="text-slate-200 font-semibold">$850K</span>
                      </div>
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-slate-100 font-semibold">Net Benefit</span>
                        <span className="text-emerald-400 font-bold text-xl">$1.55M</span>
                      </div>
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-slate-400 text-sm">Return on Investment</span>
                        <span className="text-emerald-400 font-semibold">282%</span>
                      </div>
                    </div>
                  </div>

                  <div className="enterprise-card p-6">
                    <h3 className="text-slate-100 font-semibold text-lg mb-4 flex items-center space-x-2">
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
                    <div className="mt-4 pt-4 border-t border-slate-700/50">
                      <p className="text-slate-400 text-sm leading-relaxed">
                        Automation and AI-driven analytics have reduced manual effort by <span className="text-blue-400 font-semibold">2,400 hours/month</span>,
                        enabling the security team to focus on strategic initiatives.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="enterprise-card overflow-hidden">
                <div className="bg-slate-800/30 px-6 py-4 border-b border-slate-700/50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <Activity className="w-5 h-5 text-blue-400" />
                      <h3 className="text-lg font-semibold text-slate-100">Recent Activity Across All Systems</h3>
                    </div>
                    <div className="flex items-center space-x-2 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
                      <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse"></div>
                      <span className="text-emerald-400 text-xs font-medium">LIVE FEED</span>
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
          {selectedView === 'soc3d' && <SOCAgents3D />}
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
            <div className="h-[calc(100vh-180px)] overflow-y-auto custom-scrollbar">
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
          {selectedView === 'poisonguard' && <ModelPoisoningGuard />}
          {selectedView === 'guardrails' && <LLMGuardrailsControl />}
          {selectedView === 'honeypot' && (
            <div className="h-[calc(100vh-180px)] overflow-y-auto custom-scrollbar">
              <HoneypotControl />
            </div>
          )}
          {selectedView === 'redteam' && <RedTeamAutomation />}
          {selectedView === 'ocsf' && <OCSFSchemaBrowser />}
          {selectedView === 'dataconnectors' && <DataConnectors />}
          {selectedView === 'usermanagement' && <UserManagement />}
          {selectedView === 'settings' && <ProductionSettings />}
          {selectedView === 'reports' && <Reports />}
          {selectedView === 'compliance' && <ComplianceDashboard />}
          {selectedView === 'docanalysis' && <DocumentAnalysis />}
          {selectedView === 'executive' && <ExecutiveDashboard />}
          {selectedView === 'notebooks' && <DatabricksNotebooksPanel />}
          {selectedView === 'correlationrules' && <CorrelationRulesPanel />}
          {selectedView === 'dashboardstudio' && <DashboardMigrationsTab />}
          {selectedView === 'glasswing' && <GlasswingPanel />}
          {selectedView === 'negcorrelation' && (
            <div className="h-[calc(100vh-180px)] overflow-y-auto custom-scrollbar">
              <NegativeCorrelationPanel />
            </div>
          )}
          {selectedView === 'attackvectors' && (
            <div className="enterprise-card overflow-hidden">
              <div className="bg-slate-800/30 px-6 py-4 border-b border-slate-700/50">
                <div className="flex items-center space-x-3">
                  <Target className="w-5 h-5 text-red-400" />
                  <h3 className="text-lg font-semibold text-slate-100">3D Attack Vector Analysis</h3>
                </div>
              </div>
              <div className="h-[700px]">
                <AttackVectorGraph />
              </div>
            </div>
          )}
        </main>
      </div>

      {commandPaletteOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-start justify-center pt-24 animate-fade-in"
          onClick={() => setCommandPaletteOpen(false)}
        >
          <div
            className="glass-panel rounded-xl shadow-enterprise-lg w-full max-w-xl animate-scale-in border border-slate-700/50"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-3 border-b border-slate-800/50">
              <input
                type="text"
                placeholder="Search views and commands..."
                autoFocus
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-transparent text-slate-200 placeholder-slate-500 px-3 py-2 text-sm focus:outline-none"
              />
            </div>
            <div className="max-h-80 overflow-y-auto custom-scrollbar">
              {navigationStructure
                .filter(section => section.roles.includes(userRole))
                .map((section) => {
                  const filteredItems = section.items.filter(item =>
                    item.label.toLowerCase().includes(searchQuery.toLowerCase())
                  );
                  if (filteredItems.length === 0 && searchQuery) return null;
                  return (
                  <div key={section.section}>
                    <div className="px-4 py-1.5 bg-slate-800/20">
                      <p className="text-[10px] font-bold text-slate-600 uppercase tracking-[0.1em]">
                        {section.section}
                      </p>
                    </div>
                    {filteredItems.map((item) => {
                      const Icon = item.icon;
                      return (
                        <button
                          key={item.id}
                          onClick={() => {
                            setSelectedView(item.id as any);
                            setCommandPaletteOpen(false);
                            setSearchQuery('');
                          }}
                          className="w-full flex items-center space-x-3 px-4 py-2.5 hover:bg-slate-800/40 transition-colors text-left"
                        >
                          <Icon className="w-4 h-4 text-slate-500" />
                          <span className="text-slate-300 text-sm font-medium">{item.label}</span>
                          <ChevronRight className="w-3.5 h-3.5 text-slate-700 ml-auto" />
                        </button>
                      );
                    })}
                  </div>
                );
                })}
            </div>
            <div className="px-4 py-2.5 border-t border-slate-800/50 flex items-center gap-4">
              <p className="text-[10px] text-slate-600">
                <kbd className="px-1.5 py-0.5 bg-slate-800/50 text-slate-500 rounded text-[10px] font-mono border border-slate-700/50">ESC</kbd> close
              </p>
              <p className="text-[10px] text-slate-600">
                <kbd className="px-1.5 py-0.5 bg-slate-800/50 text-slate-500 rounded text-[10px] font-mono border border-slate-700/50">Enter</kbd> select
              </p>
            </div>
          </div>
        </div>
      )}
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
  description: string;
}) => {
  const progress = (current / target) * 100;
  const isGoodDirection = (trend === 'down' && title.includes('Time')) || (trend === 'down' && title.includes('False')) || (trend === 'up' && !title.includes('Time') && !title.includes('False'));

  const statusConfig = {
    'on-track': { bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', text: 'text-emerald-400', label: 'On Track' },
    'at-risk': { bg: 'bg-amber-500/10', border: 'border-amber-500/20', text: 'text-amber-400', label: 'At Risk' },
    'achieved': { bg: 'bg-blue-500/10', border: 'border-blue-500/20', text: 'text-blue-400', label: 'Achieved' },
  };

  const trendIcon = trend === 'up' ? <ArrowUpRight className="w-4 h-4" /> : trend === 'down' ? <ArrowDownRight className="w-4 h-4" /> : <Minus className="w-4 h-4" />;
  const trendColor = isGoodDirection ? 'text-emerald-400' : trend === 'stable' ? 'text-slate-400' : 'text-red-400';

  return (
    <div className="enterprise-card p-6">
      <div className="flex items-start justify-between mb-4">
        <h3 className="text-slate-100 font-semibold text-base">{title}</h3>
        <div className={`px-2 py-1 rounded-md text-xs font-semibold ${statusConfig[status].bg} ${statusConfig[status].border} ${statusConfig[status].text} border`}>
          {statusConfig[status].label}
        </div>
      </div>

      <div className="mb-4">
        <div className="flex items-baseline space-x-2 mb-1">
          <span className="text-3xl font-bold text-slate-100">{current}</span>
          <span className="text-lg text-slate-400">{unit}</span>
          <span className="text-slate-500 text-sm">/ {target}{unit}</span>
        </div>
        <p className="text-slate-400 text-sm">{description}</p>
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
              status === 'on-track' ? 'bg-emerald-500' : status === 'at-risk' ? 'bg-amber-500' : 'bg-blue-500'
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
      border: 'border-red-500/20',
      icon: <AlertTriangle className="w-4 h-4 text-red-400" />,
      dot: 'bg-red-400',
    },
    warning: {
      bg: 'bg-amber-500/10',
      border: 'border-amber-500/20',
      icon: <AlertTriangle className="w-4 h-4 text-amber-400" />,
      dot: 'bg-amber-400',
    },
    info: {
      bg: 'bg-blue-500/10',
      border: 'border-blue-500/20',
      icon: <Activity className="w-4 h-4 text-blue-400" />,
      dot: 'bg-blue-400',
    },
  };

  return (
    <div className={`flex items-start space-x-3 p-3.5 rounded-lg border ${styles[type].bg} ${styles[type].border} hover:border-opacity-40 transition-all`}>
      <div className="flex-shrink-0 mt-0.5">{styles[type].icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-slate-200 text-sm leading-relaxed">{message}</p>
        <p className="text-slate-500 text-xs mt-1">{time}</p>
      </div>
      <div className={`w-1.5 h-1.5 rounded-full mt-2 ${styles[type].dot} ${type === 'critical' ? 'animate-pulse' : ''}`}></div>
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
    purple: 'text-violet-400 bg-violet-500/10 border-violet-500/20',
    cyan: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
  };

  const isPositive = trend.startsWith('+') || trend.startsWith('-');
  const trendColor = trend.startsWith('+') || trend.startsWith('-') && (title.includes('Downtime') || title.includes('Risk')) ? 'text-emerald-400' : trend.startsWith('-') ? 'text-red-400' : 'text-slate-400';

  return (
    <div className="enterprise-card p-6">
      <div className="flex items-start justify-between mb-3">
        <div className={`p-3 rounded-lg border ${colorClasses[color]}`}>{icon}</div>
      </div>
      <h3 className="text-slate-400 text-xs uppercase tracking-wider mb-1 font-semibold">{title}</h3>
      <p className="text-slate-100 text-3xl font-bold mb-1">{value}</p>
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
    purple: 'bg-violet-500',
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-slate-300 text-sm">{label}</span>
        <span className="text-slate-100 font-semibold">{value}</span>
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
    <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700/50">
      <div className="flex items-center justify-between mb-3">
        <span className="text-slate-200 text-sm font-medium">{label}</span>
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
