import React, { useState, useEffect } from 'react';
import {
  FileText,
  Download,
  Calendar,
  Filter,
  TrendingUp,
  Shield,
  AlertTriangle,
  Users,
  Activity,
  Clock,
  BarChart3,
  PieChart,
  LineChart,
  Target,
  Lock,
  Eye,
  CheckCircle,
  XCircle,
  Plus,
  Edit,
  Trash2,
  Play,
  Save,
  RefreshCw,
  Settings,
  FileBarChart,
  Briefcase,
  Globe,
  Database,
  Zap,
  Mail,
  Bell
} from 'lucide-react';
import { supabase } from '../lib/supabase';

interface Report {
  id: string;
  name: string;
  category: string;
  description: string;
  type: 'predefined' | 'custom';
  schedule?: string;
  last_run?: string;
  format?: string;
  recipients?: string[];
  created_at?: string;
}

interface CustomReportConfig {
  name: string;
  description: string;
  data_sources: string[];
  metrics: string[];
  filters: any[];
  time_range: string;
  grouping: string;
  chart_type: string;
  schedule: string;
  recipients: string[];
}

export default function Reports() {
  const [activeTab, setActiveTab] = useState<'library' | 'custom' | 'scheduled'>('library');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [customReports, setCustomReports] = useState<Report[]>([]);
  const [showReportBuilder, setShowReportBuilder] = useState(false);
  const [reportConfig, setReportConfig] = useState<CustomReportConfig>({
    name: '',
    description: '',
    data_sources: [],
    metrics: [],
    filters: [],
    time_range: 'last_30_days',
    grouping: 'daily',
    chart_type: 'bar',
    schedule: 'manual',
    recipients: []
  });
  const [loading, setLoading] = useState(true);

  const predefinedReports = [
    // Executive Reports
    {
      id: 'exec-security-posture',
      name: 'Executive Security Posture',
      category: 'executive',
      description: 'High-level overview of organization security posture, key metrics, and trends',
      icon: Briefcase,
      color: 'blue',
      type: 'predefined' as const
    },
    {
      id: 'exec-risk-dashboard',
      name: 'Risk Management Dashboard',
      category: 'executive',
      description: 'Top risks, risk trends, mitigation status, and risk heat map',
      icon: Target,
      color: 'red',
      type: 'predefined' as const
    },
    {
      id: 'exec-compliance',
      name: 'Compliance Status Report',
      category: 'executive',
      description: 'Compliance framework adherence, audit findings, and remediation progress',
      icon: CheckCircle,
      color: 'green',
      type: 'predefined' as const
    },
    {
      id: 'exec-incident-summary',
      name: 'Incident Summary Executive Brief',
      category: 'executive',
      description: 'Executive summary of security incidents, impact analysis, and response times',
      icon: AlertTriangle,
      color: 'orange',
      type: 'predefined' as const
    },
    {
      id: 'exec-roi-metrics',
      name: 'Security ROI & Metrics',
      category: 'executive',
      description: 'Security investment analysis, cost savings, and operational efficiency metrics',
      icon: TrendingUp,
      color: 'purple',
      type: 'predefined' as const
    },

    // Threat Intelligence Reports
    {
      id: 'threat-landscape',
      name: 'Threat Landscape Analysis',
      category: 'threat',
      description: 'Current threat landscape, emerging threats, attack vectors, and trends',
      icon: Globe,
      color: 'red',
      type: 'predefined' as const
    },
    {
      id: 'threat-actor-profile',
      name: 'Threat Actor Profiling',
      category: 'threat',
      description: 'Analysis of threat actor TTPs, campaigns, and attribution',
      icon: Users,
      color: 'orange',
      type: 'predefined' as const
    },
    {
      id: 'ioc-analysis',
      name: 'IOC Analysis Report',
      category: 'threat',
      description: 'Indicators of Compromise analysis, prevalence, and correlation',
      icon: Target,
      color: 'red',
      type: 'predefined' as const
    },
    {
      id: 'threat-feed-summary',
      name: 'Threat Feed Intelligence Summary',
      category: 'threat',
      description: 'Aggregated threat intelligence from all feeds with actionable insights',
      icon: Database,
      color: 'blue',
      type: 'predefined' as const
    },

    // Incident Response Reports
    {
      id: 'incident-response-metrics',
      name: 'Incident Response Metrics',
      category: 'incident',
      description: 'MTTD, MTTR, incident volume, severity distribution, and trends',
      icon: Clock,
      color: 'orange',
      type: 'predefined' as const
    },
    {
      id: 'incident-timeline',
      name: 'Incident Timeline Report',
      category: 'incident',
      description: 'Detailed timeline of incident events, actions taken, and outcomes',
      icon: Activity,
      color: 'blue',
      type: 'predefined' as const
    },
    {
      id: 'incident-post-mortem',
      name: 'Post-Incident Analysis',
      category: 'incident',
      description: 'Root cause analysis, lessons learned, and improvement recommendations',
      icon: FileBarChart,
      color: 'purple',
      type: 'predefined' as const
    },
    {
      id: 'case-management',
      name: 'Case Management Report',
      category: 'incident',
      description: 'Active cases, case aging, resolution rates, and backlog analysis',
      icon: FileText,
      color: 'blue',
      type: 'predefined' as const
    },

    // Security Operations Reports
    {
      id: 'alert-analysis',
      name: 'Alert Analysis & Tuning',
      category: 'operations',
      description: 'Alert volume, false positive rates, tuning recommendations',
      icon: Bell,
      color: 'yellow',
      type: 'predefined' as const
    },
    {
      id: 'soc-performance',
      name: 'SOC Performance Metrics',
      category: 'operations',
      description: 'Analyst productivity, alert handling times, escalation rates',
      icon: Activity,
      color: 'green',
      type: 'predefined' as const
    },
    {
      id: 'detection-coverage',
      name: 'Detection Coverage Report',
      category: 'operations',
      description: 'MITRE ATT&CK coverage, detection gaps, and rule effectiveness',
      icon: Shield,
      color: 'blue',
      type: 'predefined' as const
    },
    {
      id: 'log-source-health',
      name: 'Log Source Health Report',
      category: 'operations',
      description: 'Data source availability, volume trends, and collection issues',
      icon: Database,
      color: 'blue',
      type: 'predefined' as const
    },

    // Compliance & Audit Reports
    {
      id: 'pci-dss-compliance',
      name: 'PCI DSS Compliance Report',
      category: 'compliance',
      description: 'PCI DSS requirements adherence, violations, and remediation tracking',
      icon: Lock,
      color: 'green',
      type: 'predefined' as const
    },
    {
      id: 'hipaa-audit',
      name: 'HIPAA Audit Report',
      category: 'compliance',
      description: 'HIPAA compliance status, access logs, and security controls',
      icon: Shield,
      color: 'blue',
      type: 'predefined' as const
    },
    {
      id: 'gdpr-compliance',
      name: 'GDPR Compliance Report',
      category: 'compliance',
      description: 'Data protection compliance, privacy incidents, and data subject requests',
      icon: Lock,
      color: 'purple',
      type: 'predefined' as const
    },
    {
      id: 'sox-controls',
      name: 'SOX IT Controls Report',
      category: 'compliance',
      description: 'SOX control testing results, deficiencies, and remediation status',
      icon: CheckCircle,
      color: 'green',
      type: 'predefined' as const
    },

    // User & Entity Behavior Reports
    {
      id: 'user-risk-analysis',
      name: 'User Risk Analysis',
      category: 'behavior',
      description: 'User risk scores, anomalous behavior, and insider threat indicators',
      icon: Users,
      color: 'red',
      type: 'predefined' as const
    },
    {
      id: 'privileged-access',
      name: 'Privileged Access Report',
      category: 'behavior',
      description: 'Privileged account activity, access patterns, and policy violations',
      icon: Lock,
      color: 'orange',
      type: 'predefined' as const
    },
    {
      id: 'authentication-analysis',
      name: 'Authentication & Access Analysis',
      category: 'behavior',
      description: 'Login patterns, failed authentication attempts, and anomalies',
      icon: Eye,
      color: 'blue',
      type: 'predefined' as const
    },
    {
      id: 'data-access-audit',
      name: 'Data Access Audit Report',
      category: 'behavior',
      description: 'Sensitive data access patterns, unauthorized access attempts',
      icon: Database,
      color: 'purple',
      type: 'predefined' as const
    },

    // Vulnerability Management Reports
    {
      id: 'vulnerability-summary',
      name: 'Vulnerability Summary Report',
      category: 'vulnerability',
      description: 'Vulnerability inventory, severity distribution, and aging analysis',
      icon: AlertTriangle,
      color: 'red',
      type: 'predefined' as const
    },
    {
      id: 'patch-compliance',
      name: 'Patch Management Report',
      category: 'vulnerability',
      description: 'Patch compliance rates, missing patches, and deployment status',
      icon: Download,
      color: 'orange',
      type: 'predefined' as const
    },
    {
      id: 'exposure-analysis',
      name: 'Exposure & Attack Surface',
      category: 'vulnerability',
      description: 'External exposure, attack surface analysis, and risk prioritization',
      icon: Globe,
      color: 'red',
      type: 'predefined' as const
    },

    // Network & Infrastructure Reports
    {
      id: 'network-traffic',
      name: 'Network Traffic Analysis',
      category: 'network',
      description: 'Traffic patterns, bandwidth usage, protocol distribution, anomalies',
      icon: Activity,
      color: 'blue',
      type: 'predefined' as const
    },
    {
      id: 'firewall-activity',
      name: 'Firewall Activity Report',
      category: 'network',
      description: 'Firewall rule usage, blocked connections, and policy violations',
      icon: Shield,
      color: 'orange',
      type: 'predefined' as const
    },
    {
      id: 'dns-analysis',
      name: 'DNS Query Analysis',
      category: 'network',
      description: 'DNS query patterns, malicious domains, DGA detection',
      icon: Globe,
      color: 'blue',
      type: 'predefined' as const
    },

    // Asset Management Reports
    {
      id: 'asset-inventory',
      name: 'Asset Inventory Report',
      category: 'asset',
      description: 'Complete asset inventory with classification and ownership',
      icon: Database,
      color: 'blue',
      type: 'predefined' as const
    },
    {
      id: 'asset-risk',
      name: 'Asset Risk Assessment',
      category: 'asset',
      description: 'Asset-based risk analysis with vulnerability and threat correlation',
      icon: Target,
      color: 'red',
      type: 'predefined' as const
    }
  ];

  const categories = [
    { id: 'all', label: 'All Reports', icon: FileText },
    { id: 'executive', label: 'Executive', icon: Briefcase },
    { id: 'threat', label: 'Threat Intelligence', icon: Target },
    { id: 'incident', label: 'Incident Response', icon: AlertTriangle },
    { id: 'operations', label: 'Security Operations', icon: Activity },
    { id: 'compliance', label: 'Compliance & Audit', icon: CheckCircle },
    { id: 'behavior', label: 'User Behavior', icon: Users },
    { id: 'vulnerability', label: 'Vulnerability Mgmt', icon: Shield },
    { id: 'network', label: 'Network & Infrastructure', icon: Globe },
    { id: 'asset', label: 'Asset Management', icon: Database }
  ];

  useEffect(() => {
    loadCustomReports();
  }, []);

  const loadCustomReports = async () => {
    try {
      const { data, error } = await supabase
        .from('custom_reports')
        .select('*')
        .order('created_at', { ascending: false });

      if (data && !error) {
        setCustomReports(data);
      }
      setLoading(false);
    } catch (error) {
      console.error('Error loading custom reports:', error);
      setLoading(false);
    }
  };

  const generateReport = async (reportId: string) => {
    alert(`Generating report: ${reportId}\n\nIn production, this would:\n1. Query relevant data sources\n2. Apply filters and aggregations\n3. Generate visualizations\n4. Export to selected format (PDF, Excel, CSV)\n5. Send to configured recipients`);
  };

  const saveCustomReport = async () => {
    try {
      const { error } = await supabase
        .from('custom_reports')
        .insert({
          name: reportConfig.name,
          description: reportConfig.description,
          category: 'custom',
          type: 'custom',
          configuration: reportConfig,
          created_at: new Date().toISOString()
        });

      if (error) throw error;

      alert('Custom report saved successfully!');
      setShowReportBuilder(false);
      loadCustomReports();
      setReportConfig({
        name: '',
        description: '',
        data_sources: [],
        metrics: [],
        filters: [],
        time_range: 'last_30_days',
        grouping: 'daily',
        chart_type: 'bar',
        schedule: 'manual',
        recipients: []
      });
    } catch (error) {
      console.error('Error saving report:', error);
      alert('Failed to save custom report');
    }
  };

  const filteredReports = selectedCategory === 'all'
    ? predefinedReports
    : predefinedReports.filter(r => r.category === selectedCategory);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <RefreshCw className="w-8 h-8 text-blue-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <FileText className="w-8 h-8 text-blue-400" />
            Security Reports
          </h2>
          <p className="text-gray-400 mt-1">Generate comprehensive security reports and analytics</p>
        </div>
        <button
          onClick={() => setShowReportBuilder(true)}
          className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center gap-2 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Create Custom Report
        </button>
      </div>

      <div className="border-b border-gray-700">
        <div className="flex space-x-1">
          {[
            { id: 'library', label: 'Report Library', icon: FileText },
            { id: 'custom', label: 'Custom Reports', icon: Settings },
            { id: 'scheduled', label: 'Scheduled Reports', icon: Calendar }
          ].map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-4 py-3 flex items-center gap-2 border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-400'
                    : 'border-transparent text-gray-400 hover:text-gray-300'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {activeTab === 'library' && (
        <div className="space-y-6">
          <div className="flex items-center gap-4 overflow-x-auto pb-2">
            {categories.map(cat => {
              const Icon = cat.icon;
              return (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`px-4 py-2 rounded-lg flex items-center gap-2 whitespace-nowrap transition-colors ${
                    selectedCategory === cat.id
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {cat.label}
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredReports.map(report => {
              const Icon = report.icon;
              return (
                <div
                  key={report.id}
                  className="bg-gray-800/50 border border-gray-700 rounded-lg p-4 hover:border-blue-500 transition-colors"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className={`p-2 bg-${report.color}-500/20 rounded-lg`}>
                      <Icon className={`w-5 h-5 text-${report.color}-400`} />
                    </div>
                    <span className="px-2 py-1 bg-gray-700 text-gray-300 rounded text-xs">
                      {report.category}
                    </span>
                  </div>

                  <h3 className="text-white font-semibold mb-2">{report.name}</h3>
                  <p className="text-gray-400 text-sm mb-4 line-clamp-2">{report.description}</p>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => generateReport(report.id)}
                      className="flex-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center justify-center gap-2 text-sm transition-colors"
                    >
                      <Play className="w-4 h-4" />
                      Generate
                    </button>
                    <button className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors">
                      <Download className="w-4 h-4" />
                    </button>
                    <button className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors">
                      <Calendar className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {activeTab === 'custom' && (
        <div className="space-y-6">
          {customReports.length === 0 ? (
            <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-12 text-center">
              <FileText className="w-16 h-16 text-gray-600 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-white mb-2">No Custom Reports Yet</h3>
              <p className="text-gray-400 mb-6">Create your first custom report to get started</p>
              <button
                onClick={() => setShowReportBuilder(true)}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg inline-flex items-center gap-2 transition-colors"
              >
                <Plus className="w-5 h-5" />
                Create Custom Report
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {customReports.map(report => (
                <div
                  key={report.id}
                  className="bg-gray-800/50 border border-gray-700 rounded-lg p-4 hover:border-blue-500 transition-colors"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="p-2 bg-purple-500/20 rounded-lg">
                      <FileBarChart className="w-5 h-5 text-purple-400" />
                    </div>
                    <span className="px-2 py-1 bg-purple-700 text-purple-300 rounded text-xs">
                      Custom
                    </span>
                  </div>

                  <h3 className="text-white font-semibold mb-2">{report.name}</h3>
                  <p className="text-gray-400 text-sm mb-4 line-clamp-2">{report.description}</p>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => generateReport(report.id)}
                      className="flex-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center justify-center gap-2 text-sm transition-colors"
                    >
                      <Play className="w-4 h-4" />
                      Run
                    </button>
                    <button className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors">
                      <Edit className="w-4 h-4" />
                    </button>
                    <button className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'scheduled' && (
        <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-12 text-center">
          <Calendar className="w-16 h-16 text-gray-600 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-white mb-2">Scheduled Reports</h3>
          <p className="text-gray-400 mb-6">Configure reports to run automatically on a schedule</p>
          <p className="text-gray-500 text-sm">No scheduled reports configured</p>
        </div>
      )}

      {showReportBuilder && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-gray-900 border-b border-gray-700 px-6 py-4 flex items-center justify-between">
              <h3 className="text-xl font-semibold text-white flex items-center gap-2">
                <Plus className="w-6 h-6 text-blue-400" />
                Custom Report Builder
              </h3>
              <button
                onClick={() => setShowReportBuilder(false)}
                className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
              >
                <XCircle className="w-6 h-6 text-gray-400" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Report Name *
                  </label>
                  <input
                    type="text"
                    value={reportConfig.name}
                    onChange={(e) => setReportConfig({ ...reportConfig, name: e.target.value })}
                    placeholder="My Custom Report"
                    className="w-full px-4 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Time Range
                  </label>
                  <select
                    value={reportConfig.time_range}
                    onChange={(e) => setReportConfig({ ...reportConfig, time_range: e.target.value })}
                    className="w-full px-4 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="last_24_hours">Last 24 Hours</option>
                    <option value="last_7_days">Last 7 Days</option>
                    <option value="last_30_days">Last 30 Days</option>
                    <option value="last_90_days">Last 90 Days</option>
                    <option value="custom">Custom Range</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Description
                </label>
                <textarea
                  value={reportConfig.description}
                  onChange={(e) => setReportConfig({ ...reportConfig, description: e.target.value })}
                  placeholder="Describe what this report shows..."
                  rows={3}
                  className="w-full px-4 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Data Sources
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {['Events', 'Alerts', 'Cases', 'Threats', 'Users', 'Assets', 'Vulnerabilities', 'Network', 'Logs'].map(source => (
                    <label key={source} className="flex items-center gap-2 p-3 bg-gray-800 rounded-lg cursor-pointer hover:bg-gray-750">
                      <input
                        type="checkbox"
                        checked={reportConfig.data_sources.includes(source)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setReportConfig({ ...reportConfig, data_sources: [...reportConfig.data_sources, source] });
                          } else {
                            setReportConfig({ ...reportConfig, data_sources: reportConfig.data_sources.filter(s => s !== source) });
                          }
                        }}
                        className="rounded border-gray-600 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-gray-300 text-sm">{source}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Metrics to Include
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {['Count', 'Sum', 'Average', 'Min/Max', 'Percentage', 'Trend', 'Top N', 'Distribution'].map(metric => (
                    <label key={metric} className="flex items-center gap-2 p-3 bg-gray-800 rounded-lg cursor-pointer hover:bg-gray-750">
                      <input
                        type="checkbox"
                        checked={reportConfig.metrics.includes(metric)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setReportConfig({ ...reportConfig, metrics: [...reportConfig.metrics, metric] });
                          } else {
                            setReportConfig({ ...reportConfig, metrics: reportConfig.metrics.filter(m => m !== metric) });
                          }
                        }}
                        className="rounded border-gray-600 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-gray-300 text-sm">{metric}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Chart Type
                  </label>
                  <select
                    value={reportConfig.chart_type}
                    onChange={(e) => setReportConfig({ ...reportConfig, chart_type: e.target.value })}
                    className="w-full px-4 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="bar">Bar Chart</option>
                    <option value="line">Line Chart</option>
                    <option value="pie">Pie Chart</option>
                    <option value="table">Table</option>
                    <option value="heatmap">Heatmap</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Group By
                  </label>
                  <select
                    value={reportConfig.grouping}
                    onChange={(e) => setReportConfig({ ...reportConfig, grouping: e.target.value })}
                    className="w-full px-4 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="hourly">Hourly</option>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Schedule
                  </label>
                  <select
                    value={reportConfig.schedule}
                    onChange={(e) => setReportConfig({ ...reportConfig, schedule: e.target.value })}
                    className="w-full px-4 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="manual">Manual Only</option>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Email Recipients (comma separated)
                </label>
                <input
                  type="text"
                  placeholder="analyst@company.com, manager@company.com"
                  className="w-full px-4 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-700">
                <button
                  onClick={() => setShowReportBuilder(false)}
                  className="px-6 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={saveCustomReport}
                  disabled={!reportConfig.name}
                  className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center gap-2 transition-colors disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  Save Report
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
