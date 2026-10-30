import { useState, useEffect } from 'react';
import { Shield, ShieldAlert, Activity, AlertTriangle, Users, Database, TrendingUp, Clock, Target, Workflow, Zap, Rss, Menu, X, ChevronRight, Globe, Briefcase, Scan, Calculator, Network, Brain, LogOut, Layers, CheckCircle2, ShieldCheck, DollarSign, BarChart3, Bug, Crosshair, Settings, FileText, BookOpen, Eye, LayoutGrid, Radar, Grid3x3 as Grid3X3, Sparkles, Gauge, Building2, GitBranch, Terminal, Server, FileBarChart, Coins, Swords, Atom, Fingerprint, GitMerge, Bot, Share2, FlaskConical, Wrench, Globe2, UsersRound, MessageSquareText } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import OverviewDashboard from './overview/OverviewDashboard';
import { trackView, setCurrentView } from '../lib/activityTracker';
import AttackVectorGraph from './AttackVectorGraph';
import ListsPanel from './ListsPanel';
import EventStream from './EventStream';
import AlertsPanel from './AlertsPanel';
import WorkflowsPanel from './WorkflowsPanel';
import ResponseAutomation from './ResponseAutomation';
import { ResponseApprovalsPanel } from './ResponseApprovalsPanel';
import ThreatFeedsPanel from './ThreatFeedsPanel';
import ThreatRadar from './ThreatRadar';
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
import StreamingGraphVisualization from './StreamingGraphVisualization';
import VulnerabilitiesPanel from './VulnerabilitiesPanel';
import AIMalwareSandbox from './AIMalwareSandbox';
import RedTeamAutomation from './RedTeamAutomation';
import DataConnectors from './DataConnectors';
import UserManagement from './UserManagement';
import ExecutiveDashboard from './ExecutiveDashboard';
import ProductionSettings from './ProductionSettings';
import Reports from './Reports';
import DatabricksNotebooksPanel from './DatabricksNotebooksPanel';
import ModelPoisoningGuard from './ModelPoisoningGuard';
import StatefulBackdoorDefense from './StatefulBackdoorDefense';
import DocumentAnalysis from './DocumentAnalysis';
import HoneypotControl from './HoneypotControl';
import CorrelationRulesPanel from './CorrelationRulesPanel';
import SOCAgents3D from './SOCAgents3D';
import LLMGuardrailsControl from './LLMGuardrailsControl';
import GlasswingPanel from './glasswing/GlasswingPanel';
import NegativeCorrelationPanel from './negative-correlation/NegativeCorrelationPanel';
import DashboardMigrationsTab from './dashboard-builder/DashboardMigrationsTab';
import CommandCenter from './command-center/CommandCenter';
import EventProcessingFunnel from './command-center/EventProcessingFunnel';
import ThreatSimulator from './ThreatSimulator';
import FinancialThreatIntel from './financial-threat/FinancialThreatIntel';
import MitreAttackMatrix from './MitreAttackMatrix';
import EntityInvestigation from './EntityInvestigation';
import AIIncidentSummarizer from './AIIncidentSummarizer';
import SOCOptimization from './SOCOptimization';
import MultiTenantManager from './MultiTenantManager';
import AIPlaybookGenerator from './AIPlaybookGenerator';
import StixTaxiiManager from './StixTaxiiManager';
import AdvancedHuntingQuery from './AdvancedHuntingQuery';
import SAPSecurityConnector from './SAPSecurityConnector';
import ReportBuilder from './ReportBuilder';
import PlatformEconomics from './PlatformEconomics';
import IndustryThreatsHub from './industry-threats/IndustryThreatsHub';
import FeatureLab from './FeatureLab';
import ChronoWeave from './ChronoWeave';
import DetectionSLM from './DetectionSLM';
import DetectionConfluence from './DetectionConfluence';
import SwarmCrucible from './SwarmCrucible';
import TrendEngineCET from './TrendEngineCET';
import MCPRegistry from './MCPRegistry';
import IdentityOverview from './identity/IdentityOverview';
import IdentityExplorer from './identity/IdentityExplorer';
import ResolutionReview from './identity/ResolutionReview';
import NonHumanIdentities from './identity/NonHumanIdentities';
import IdentityTimeline from './identity/IdentityTimeline';
import IdentityRisk from './identity/IdentityRisk';
import AccessGraph from './identity/AccessGraph';
import GroupContext from './identity/GroupContext';
import WhatIfSimulator from './identity/WhatIfSimulator';
import FederationPosture from './identity/FederationPosture';
import IdentityRemediation from './identity/IdentityRemediation';
import IdentityAnswers from './identity/IdentityAnswers';
import AttackUniverse from './AttackUniverse';
import { lakehouse } from '../lib/lakehouse';

const Dashboard = () => {
  const { user, signOut } = useAuth();
  const [stats, setStats] = useState({
    totalEvents: 0,
    activeSessions: 0,
    criticalAlerts: 0,
    blockedThreats: 0,
  });

  const [recentActivities, setRecentActivities] = useState<any[]>([]);

  const [selectedView, setSelectedView] = useState<'overview' | 'lists' | 'events' | 'alerts' | 'cases' | 'workflows' | 'responses' | 'feeds' | 'iocs' | 'attackvectors' | 'patterns' | 'escalation' | 'vectorhunt' | 'topology' | 'agentbricks' | 'architecture' | 'threatmodeling' | 'userbehavior' | 'streaminggraph' | 'services' | 'vulnerabilities' | 'malwaresandbox' | 'redteam' | 'dataconnectors' | 'usermanagement' | 'settings' | 'reports' | 'executive' | 'ocsf' | 'compliance' | 'notebooks' | 'poisonguard' | 'docanalysis' | 'honeypot' | 'correlationrules' | 'soc3d' | 'dashboardstudio' | 'guardrails' | 'glasswing' | 'negcorrelation' | 'simulations' | 'financialthreat' | 'mitre' | 'entityinvestigation' | 'aisummarizer' | 'socoptimization' | 'multitenant' | 'aiplaybook' | 'responseapprovals' | 'stixtaxii' | 'advancedhunt' | 'sapconnector' | 'reportbuilder' | 'platformeconomics' | 'industrythreats' | 'featurelab' | 'mcp' | 'backdoordefense' | 'attackuniverse' | 'id_overview' | 'id_explorer' | 'id_review' | 'id_nhi' | 'id_timeline' | 'id_risk' | 'id_graph' | 'id_groups' | 'id_whatif' | 'id_federation' | 'id_remediation' | 'id_answers'>('overview');
  const [dashboardMode, setDashboardMode] = useState<'analytics' | 'commandcenter' | 'eventpipeline'>('analytics');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [userRole, setUserRole] = useState<'analyst' | 'engineer' | 'admin' | 'ciso'>('admin');
  const [actualRole, setActualRole] = useState<'analyst' | 'engineer' | 'admin' | 'ciso'>('admin');
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    setCurrentView(selectedView, selectedView);
    trackView(selectedView, selectedView);
  }, [selectedView]);

  useEffect(() => {
    const loadUserRole = async () => {
      if (user?.id) {
        const { data } = await lakehouse
          .from('user_profiles')
          .select('role')
          .eq('id', user.id)
          .single();

        if (data?.role) {
          setUserRole(data.role);
          setActualRole(data.role);
        }
      }
    };
    loadUserRole();
  }, [user]);

  useEffect(() => {
    const handleNavigate = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (typeof detail === 'string') {
        setSelectedView(detail as any);
      }
    };
    window.addEventListener('navigate-to-view', handleNavigate);
    return () => window.removeEventListener('navigate-to-view', handleNavigate);
  }, []);

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
    loadThreatGeoData();

    const alertsSubscription = lakehouse
      .channel('alerts_changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'alerts' }, () => {
        loadRecentActivities();
        loadStats();
      })
      .subscribe();

    const eventsSubscription = lakehouse
      .channel('events_changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'events' }, () => {
        loadRecentActivities();
        loadStats();
      })
      .subscribe();

    const casesSubscription = lakehouse
      .channel('cases_changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'cases' }, () => {
        loadRecentActivities();
      })
      .subscribe();

    const agentsSubscription = lakehouse
      .channel('agent_tasks_changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'agent_tasks' }, () => {
        loadRecentActivities();
      })
      .subscribe();

    const usersSubscription = lakehouse
      .channel('user_behavior_changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'user_behavior_events' }, () => {
        loadRecentActivities();
        loadStats();
      })
      .subscribe();

    // Poll for fresh metrics every 30 seconds from the backend
    const metricsInterval = setInterval(() => {
      loadStats();
    }, 30000);

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
      const [eventsResult, sessionsResult, alertsResult, blockedResult] = await Promise.all([
        lakehouse.from('events').select('id', { count: 'exact', head: true }),
        lakehouse.from('user_sessions').select('id', { count: 'exact', head: true }).eq('status', 'active'),
        lakehouse.from('alerts').select('id', { count: 'exact', head: true }).eq('severity', 'critical').eq('status', 'new'),
        lakehouse.from('response_actions').select('id', { count: 'exact', head: true }).in('status', ['success', 'completed', 'executed']),
      ]);

      setStats({
        totalEvents: eventsResult.count ?? 0,
        activeSessions: sessionsResult.count ?? 0,
        criticalAlerts: alertsResult.count ?? 0,
        blockedThreats: blockedResult.count ?? 0,
      });
    } catch (error) {
      console.error('Error loading stats:', error);
    }
  };

  const loadThreatGeoData = async () => {
    try {
      const response = await fetch('/api/threat-globe');
      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data) && data.length > 0) {
          setThreatGeoData(data);
        }
      }
    } catch (error) {
      // Globe will be empty until real geo data exists
    }
  };

  const loadRecentActivities = async () => {
    try {
      const [alerts, events, cases, agents, users] = await Promise.all([
        lakehouse.from('alerts').select('id, title, severity, created_at').order('created_at', { ascending: false }).limit(3),
        lakehouse.from('events').select('id, event_type, severity, created_at').order('created_at', { ascending: false }).limit(3),
        lakehouse.from('cases').select('id, title, priority, created_at').order('created_at', { ascending: false }).limit(2),
        lakehouse.from('agent_status').select('id, status, last_heartbeat, events_processed').order('last_heartbeat', { ascending: false }).limit(2),
        lakehouse.from('user_behavior_anomalies').select('id, anomaly_type, risk_score, detected_at').order('detected_at', { ascending: false }).limit(2),
      ]);

      const activities = [
        ...(alerts.data || []).map((a: any) => ({ ...a, source: 'Alerts', type: a.severity })),
        ...(events.data || []).map((e: any) => ({ ...e, source: 'Events', type: e.severity, created_at: e.created_at })),
        ...(cases.data || []).map((c: any) => ({ ...c, source: 'Cases', type: c.priority })),
        ...(agents.data || []).map((a: any) => ({ ...a, source: 'Agents', type: a.status, title: a.agent_name || a.status })),
        ...(users.data || []).map((u: any) => ({ ...u, source: 'Users', type: u.risk_score > 70 ? 'critical' : u.risk_score > 40 ? 'high' : 'medium', created_at: u.detected_at })),
      ].sort((a, b) => new Date(b.created_at || b.detected_at || 0).getTime() - new Date(a.created_at || a.detected_at || 0).getTime()).slice(0, 12);

      setRecentActivities(activities);
    } catch (error) {
      console.error('Error loading recent activities:', error);
    }
  };

  const [threatGeoData, setThreatGeoData] = useState<Array<{ source: { lat: number; lon: number }; target: { lat: number; lon: number }; severity: 'critical' | 'high' | 'medium' }>>([]);

  // Simplified Navigation Structure
  const navigationStructure = [
    {
      section: 'Overview',
      roles: ['analyst', 'engineer', 'admin', 'ciso'],
      items: [
        { id: 'overview', label: 'Dashboard', icon: Database },
        { id: 'agentbricks', label: 'SOC Agent Bricks', icon: Brain },
        { id: 'soc3d', label: '3D SOC Agents', icon: Users },
        { id: 'attackuniverse', label: 'Attack Universe', icon: Crosshair },
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
      section: 'Industry Threat Intel',
      roles: ['analyst', 'engineer', 'admin', 'ciso'],
      items: [
        { id: 'industrythreats', label: 'All Industries', icon: Globe },
        { id: 'financialthreat', label: 'Financial Threats', icon: DollarSign },
      ]
    },
    {
      section: 'Innovation',
      roles: ['analyst', 'engineer', 'admin', 'ciso'],
      items: [
        { id: 'swarmcrucible', label: 'Swarm Crucible', icon: Swords },
        { id: 'trendengine', label: 'CET Trend Engine', icon: GitBranch },
        { id: 'featurelab', label: 'Feature Lab', icon: Sparkles },
        { id: 'chronoweave', label: 'ChronoWeave', icon: Atom },
        { id: 'detectionslm', label: 'Detection SLM (Beta)', icon: Brain },
        { id: 'confluence', label: 'Detection Confluence', icon: Layers },
      ]
    },
    {
      section: 'Detection & Intelligence',
      roles: ['analyst', 'engineer', 'admin'],
      items: [
        { id: 'mitre', label: 'MITRE ATT&CK Matrix', icon: Grid3X3 },
        { id: 'glasswing', label: 'Glasswing Scanner', icon: Scan },
        { id: 'threatradar', label: 'Threat Cortex', icon: Radar },
        { id: 'feeds', label: 'Threat Feeds', icon: Rss },
        { id: 'iocs', label: 'IOCs', icon: Shield },
        { id: 'stixtaxii', label: 'STIX/TAXII Intel', icon: Globe },
        { id: 'honeypot', label: 'HoneyPot & Tokens', icon: Eye },
        { id: 'malwaresandbox', label: 'AI Malware Sandbox', icon: Bug },
        { id: 'backdoordefense', label: 'Agent Backdoor Defense', icon: ShieldAlert },
        { id: 'poisonguard', label: 'Model Poisoning Guard', icon: Shield },
        { id: 'guardrails', label: 'AI Unity Gateway', icon: ShieldCheck },
        { id: 'attackvectors', label: 'Attack Vectors', icon: Target },
        { id: 'threatmodeling', label: 'Smart Threat Modeling', icon: Scan },
        { id: 'correlationrules', label: 'Correlation Rules', icon: Zap },
        { id: 'negcorrelation', label: 'Negative Correlation', icon: AlertTriangle },
        { id: 'simulations', label: 'Simulations', icon: Crosshair },
      ]
    },
    {
      section: 'Investigation',
      roles: ['analyst', 'engineer', 'admin'],
      items: [
        { id: 'entityinvestigation', label: 'Entity Investigation', icon: Eye },
        { id: 'aisummarizer', label: 'AI Incident Summary', icon: Sparkles },
        { id: 'advancedhunt', label: 'Advanced Hunting', icon: Terminal },
        { id: 'userbehavior', label: 'User Behaviors', icon: Users },
        { id: 'topology', label: 'Network & Physical', icon: Network },
        { id: 'vulnerabilities', label: 'Vulnerabilities', icon: Bug },
        { id: 'lists', label: 'Sessions & Events', icon: Activity },
        { id: 'vectorhunt', label: 'AI Threat Hunting', icon: TrendingUp },
        { id: 'patterns', label: 'Pattern Discovery', icon: Brain },
      ]
    },
    {
      section: 'Identity',
      roles: ['analyst', 'engineer', 'admin'],
      items: [
        { id: 'id_overview', label: 'Identity Overview', icon: Fingerprint },
        { id: 'id_explorer', label: 'Identity Explorer', icon: Users },
        { id: 'id_review', label: 'Resolution Review', icon: GitMerge },
        { id: 'id_nhi', label: 'Non-Human & Agents', icon: Bot },
        { id: 'id_timeline', label: 'Identity Timeline', icon: Clock },
        { id: 'id_risk', label: 'Identity Risk', icon: Gauge },
        { id: 'id_graph', label: 'Access Graph & Paths', icon: Share2 },
        { id: 'id_whatif', label: 'What-If Simulator', icon: FlaskConical },
        { id: 'id_remediation', label: 'Identity Remediation', icon: Wrench },
        { id: 'id_federation', label: 'Federation Posture', icon: Globe2 },
        { id: 'id_groups', label: 'Group Context', icon: UsersRound },
        { id: 'id_answers', label: 'Identity Answers', icon: MessageSquareText },
      ]
    },
    {
      section: 'Response & Automation',
      roles: ['analyst', 'engineer', 'admin'],
      items: [
        { id: 'alerts', label: 'Alerts', icon: AlertTriangle },
        { id: 'cases', label: 'Cases', icon: Briefcase },
        { id: 'escalation', label: 'Threat Escalation', icon: Calculator },
        { id: 'responses', label: 'Response Automation', icon: ShieldCheck },
        { id: 'responseapprovals', label: 'Response Approvals', icon: CheckCircle2 },
        { id: 'workflows', label: 'Automation', icon: Workflow },
        { id: 'aiplaybook', label: 'AI Playbook Builder', icon: GitBranch },
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
        { id: 'sapconnector', label: 'SAP Security', icon: Server },
        { id: 'docanalysis', label: 'Document Intelligence', icon: Scan },
        { id: 'streaminggraph', label: 'Streaming Graph', icon: Globe },
        { id: 'architecture', label: 'Architecture', icon: Layers },
      ]
    },
    {
      section: 'Reports & Analytics',
      roles: ['analyst', 'engineer', 'admin', 'ciso'],
      items: [
        { id: 'reports', label: 'Security Reports', icon: FileText },
        { id: 'reportbuilder', label: 'Report Builder', icon: FileBarChart },
        { id: 'compliance', label: 'Compliance Dashboard', icon: CheckCircle2 },
        { id: 'platformeconomics', label: 'Platform Economics', icon: Coins },
        { id: 'socoptimization', label: 'SOC Optimization', icon: Gauge },
      ]
    },
    {
      section: 'Administration',
      roles: ['admin', 'ciso'],
      items: [
        { id: 'multitenant', label: 'Multi-Tenant Manager', icon: Building2 },
        { id: 'usermanagement', label: 'Platform Users', icon: Users },
        { id: 'mcp', label: 'MCP Registry', icon: Layers },
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
                        data-track-id={`nav:${item.id}`}
                        data-track-label={item.label}
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
                {selectedView === 'overview' && (
                  <div className="flex items-center bg-slate-800/50 rounded-lg p-0.5 border border-slate-700/40">
                    <button
                      onClick={() => setDashboardMode('analytics')}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                        dashboardMode === 'analytics'
                          ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <BarChart3 className="w-3.5 h-3.5" />
                      <span>Analytics</span>
                    </button>
                    <button
                      onClick={() => setDashboardMode('commandcenter')}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                        dashboardMode === 'commandcenter'
                          ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/20'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <Radar className="w-3.5 h-3.5" />
                      <span>Command Center</span>
                    </button>
                    <button
                      onClick={() => setDashboardMode('eventpipeline')}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                        dashboardMode === 'eventpipeline'
                          ? 'bg-teal-600 text-white shadow-lg shadow-teal-600/20'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <Layers className="w-3.5 h-3.5" />
                      <span>Event Pipeline</span>
                    </button>
                  </div>
                )}
                <button
                  onClick={() => setCommandPaletteOpen(true)}
                  className="flex items-center space-x-2 px-3 py-1.5 bg-slate-800/40 hover:bg-slate-700/50 rounded-lg border border-slate-700/30 transition-all group"
                >
                  <Scan className="text-slate-500 group-hover:text-slate-300 w-3.5 h-3.5" />
                  <span className="text-slate-500 group-hover:text-slate-300 text-xs">Search</span>
                  <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-slate-700/40 text-slate-500 rounded border border-slate-600/50">⌘K</kbd>
                </button>

                {actualRole === 'analyst' ? (
                  <div
                    className="px-3 py-1.5 text-xs font-medium rounded-lg border bg-slate-800/40 text-slate-400 border-slate-700/30 cursor-not-allowed select-none"
                    title="Analysts cannot change role"
                  >
                    Analyst
                  </div>
                ) : (
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
                )}

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
          {selectedView === 'overview' && dashboardMode === 'commandcenter' && (
            <CommandCenter />
          )}

          {selectedView === 'overview' && dashboardMode === 'eventpipeline' && (
            <EventProcessingFunnel />
          )}

          {selectedView === 'overview' && dashboardMode === 'analytics' && (
            <OverviewDashboard
              stats={stats}
              activities={recentActivities}
              threats={threatGeoData}
              userName={user?.full_name || user?.username}
              onNavigate={(v) => setSelectedView(v as typeof selectedView)}
            />
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
          {selectedView === 'responseapprovals' && <ResponseApprovalsPanel />}
          {selectedView === 'feeds' && <ThreatFeedsPanel />}
          {selectedView === 'threatradar' && <ThreatRadar />}
          {selectedView === 'iocs' && <IOCPanel />}
          {selectedView === 'malwaresandbox' && <AIMalwareSandbox />}
          {selectedView === 'poisonguard' && <ModelPoisoningGuard />}
          {selectedView === 'backdoordefense' && <StatefulBackdoorDefense />}
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
          {selectedView === 'simulations' && <ThreatSimulator />}
          {selectedView === 'financialthreat' && <FinancialThreatIntel />}
          {selectedView === 'industrythreats' && <IndustryThreatsHub />}
          {selectedView === 'featurelab' && <FeatureLab />}
          {selectedView === 'chronoweave' && <div className="p-4"><ChronoWeave /></div>}
          {selectedView === 'detectionslm' && <DetectionSLM />}
          {selectedView === 'confluence' && <DetectionConfluence />}
          {selectedView === 'swarmcrucible' && <SwarmCrucible />}
          {selectedView === 'trendengine' && <TrendEngineCET />}
          {selectedView === 'attackuniverse' && <AttackUniverse />}
          {selectedView === 'mitre' && <MitreAttackMatrix />}
          {selectedView === 'entityinvestigation' && <EntityInvestigation />}
          {selectedView === 'aisummarizer' && <AIIncidentSummarizer />}
          {selectedView === 'socoptimization' && <SOCOptimization />}
          {selectedView === 'multitenant' && <MultiTenantManager />}
          {selectedView === 'mcp' && <MCPRegistry />}
          {selectedView === 'id_overview' && <IdentityOverview onNavigate={(v) => setSelectedView(v as typeof selectedView)} />}
          {selectedView === 'id_explorer' && <IdentityExplorer />}
          {selectedView === 'id_review' && <ResolutionReview />}
          {selectedView === 'id_nhi' && <NonHumanIdentities />}
          {selectedView === 'id_timeline' && <IdentityTimeline />}
          {selectedView === 'id_risk' && <IdentityRisk />}
          {selectedView === 'id_graph' && <AccessGraph />}
          {selectedView === 'id_groups' && <GroupContext />}
          {selectedView === 'id_whatif' && <WhatIfSimulator />}
          {selectedView === 'id_federation' && <FederationPosture />}
          {selectedView === 'id_remediation' && <IdentityRemediation />}
          {selectedView === 'id_answers' && <IdentityAnswers onNavigate={(v) => setSelectedView(v as typeof selectedView)} />}
          {selectedView === 'aiplaybook' && <AIPlaybookGenerator />}
          {selectedView === 'stixtaxii' && <StixTaxiiManager />}
          {selectedView === 'advancedhunt' && <AdvancedHuntingQuery />}
          {selectedView === 'sapconnector' && <SAPSecurityConnector />}
          {selectedView === 'reportbuilder' && <ReportBuilder />}
          {selectedView === 'platformeconomics' && <PlatformEconomics />}
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

export default Dashboard;
