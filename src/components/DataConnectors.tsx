import { useState } from 'react';
import { Database, Cloud, Server, Code, Eye, Network, AlertTriangle, CheckCircle, TrendingUp, Layers, FileCode, GitBranch, FileText, Brain, BarChart3, BookOpen, Cpu, Wand2 } from 'lucide-react';
import DPIInspection from './DPIInspection';
import NetworkTapsTab from './connectors/NetworkTapsTab';
import CloudAPIsTab from './connectors/CloudAPIsTab';
import SIEMIntegrationTab from './connectors/SIEMIntegrationTab';
import ConnectorCatalog from './connectors/ConnectorCatalog';
import ConnectorVersionAgent from './connectors/ConnectorVersionAgent';
import ConnectorVibeBuilder from './connectors/ConnectorVibeBuilder';

const MOCK_CONNECTORS = [
  { id: '1', connector_name: 'Main DPI Engine', connector_type: 'dpi', connector_category: 'network', status: 'active', health_status: 'healthy', events_per_second: '8234.56', data_rate_mbps: '67.89', uptime_percent: '99.98' },
  { id: '2', connector_name: 'Core Network TAP', connector_type: 'network_tap', connector_category: 'network', status: 'active', health_status: 'healthy', events_per_second: '5678.90', data_rate_mbps: '45.67', uptime_percent: '99.95' },
  { id: '3', connector_name: 'Payment Service JVM Agent', connector_type: 'bytecode_weaving', connector_category: 'instrumentation', status: 'active', health_status: 'healthy', events_per_second: '2345.67', data_rate_mbps: '18.90', uptime_percent: '99.92' },
  { id: '4', connector_name: 'Identity Service .NET Agent', connector_type: 'bytecode_weaving', connector_category: 'instrumentation', status: 'active', health_status: 'healthy', events_per_second: '1890.45', data_rate_mbps: '14.23', uptime_percent: '99.89' },
  { id: '5', connector_name: 'ML Pipeline Python Tracer', connector_type: 'bytecode_weaving', connector_category: 'instrumentation', status: 'active', health_status: 'healthy', events_per_second: '1234.56', data_rate_mbps: '9.87', uptime_percent: '99.85' },
  { id: '6', connector_name: 'AWS Production Account', connector_type: 'aws_cloudtrail', connector_category: 'cloud', status: 'active', health_status: 'healthy', events_per_second: '3456.78', data_rate_mbps: '28.90', uptime_percent: '99.99' },
  { id: '7', connector_name: 'Azure Enterprise Subscription', connector_type: 'azure_monitor', connector_category: 'cloud', status: 'active', health_status: 'healthy', events_per_second: '2987.65', data_rate_mbps: '22.34', uptime_percent: '99.97' },
  { id: '8', connector_name: 'GCP Cloud Logging', connector_type: 'gcp_logging', connector_category: 'cloud', status: 'active', health_status: 'healthy', events_per_second: '2789.30', data_rate_mbps: '15.60', uptime_percent: '99.94' },
  { id: '9', connector_name: 'Splunk HEC Forwarder', connector_type: 'splunk', connector_category: 'siem', status: 'active', health_status: 'healthy', events_per_second: '6789.01', data_rate_mbps: '52.30', uptime_percent: '99.96' },
  { id: '10', connector_name: 'QRadar SIEM Collector', connector_type: 'qradar', connector_category: 'siem', status: 'active', health_status: 'healthy', events_per_second: '4567.20', data_rate_mbps: '34.80', uptime_percent: '99.93' },
  { id: '11', connector_name: 'eBPF Kernel Probe', connector_type: 'ebpf', connector_category: 'instrumentation', status: 'active', health_status: 'healthy', events_per_second: '3456.80', data_rate_mbps: '23.70', uptime_percent: '99.91' },
  { id: '12', connector_name: 'Elastic APM Agent', connector_type: 'agent_collector', connector_category: 'instrumentation', status: 'active', health_status: 'healthy', events_per_second: '1678.40', data_rate_mbps: '12.30', uptime_percent: '99.88' },
  { id: '13', connector_name: 'Syslog CEF Receiver', connector_type: 'cef', connector_category: 'network', status: 'active', health_status: 'healthy', events_per_second: '7234.50', data_rate_mbps: '56.90', uptime_percent: '99.97' },
  { id: '14', connector_name: 'SPAN Port Mirror', connector_type: 'span', connector_category: 'network', status: 'active', health_status: 'healthy', events_per_second: '4321.09', data_rate_mbps: '38.20', uptime_percent: '99.95' },
  { id: '15', connector_name: 'Kafka Message Broker', connector_type: 'kafka', connector_category: 'application', status: 'active', health_status: 'healthy', events_per_second: '9876.54', data_rate_mbps: '78.90', uptime_percent: '99.99' },
  { id: '16', connector_name: 'API Webhook Receiver', connector_type: 'api_webhook', connector_category: 'application', status: 'active', health_status: 'degraded', events_per_second: '2109.87', data_rate_mbps: '16.70', uptime_percent: '98.50' }
];

const MOCK_BYTECODE_INSTRUMENTATION = [
  { id: 'bi1', connector_id: '3', application_name: 'PaymentProcessor', runtime_type: 'JVM', weaving_technique: 'AspectJ', instrumentation_target: 'com.payment.*' },
  { id: 'bi2', connector_id: '4', application_name: 'IdentityService', runtime_type: '.NET CLR', weaving_technique: 'Profiler API', instrumentation_target: 'Identity.*' },
  { id: 'bi3', connector_id: '5', application_name: 'MLPipeline', runtime_type: 'Python', weaving_technique: 'sys.settrace', instrumentation_target: 'ml_pipeline.*' },
  { id: 'bi4', connector_id: '11', application_name: 'KernelSyscallTracer', runtime_type: 'eBPF', weaving_technique: 'kprobe', instrumentation_target: 'sys_*' },
  { id: 'bi5', connector_id: '12', application_name: 'ElasticAPMTracer', runtime_type: 'Node.js', weaving_technique: 'Module Shimming', instrumentation_target: 'express.*' }
];

const MOCK_INTERCEPTED_FUNCTIONS = [
  { id: 'f1', instrumentation_id: 'bi1', timestamp: new Date().toISOString(), thread_id: 'thread-1', class_name: 'com.payment.TransactionProcessor', method_name: 'processPayment', execution_time_ns: 2500000, invocation_depth: 2 },
  { id: 'f2', instrumentation_id: 'bi1', timestamp: new Date().toISOString(), thread_id: 'thread-2', class_name: 'com.payment.FraudDetector', method_name: 'checkFraud', execution_time_ns: 1800000, invocation_depth: 3 },
  { id: 'f3', instrumentation_id: 'bi1', timestamp: new Date().toISOString(), thread_id: 'thread-1', class_name: 'com.payment.DatabaseClient', method_name: 'executeQuery', execution_time_ns: 5200000, invocation_depth: 4 },
  { id: 'f4', instrumentation_id: 'bi1', timestamp: new Date().toISOString(), thread_id: 'thread-3', class_name: 'com.payment.CryptoUtils', method_name: 'encrypt', execution_time_ns: 950000, invocation_depth: 2 },
  { id: 'f5', instrumentation_id: 'bi1', timestamp: new Date().toISOString(), thread_id: 'thread-2', class_name: 'com.payment.Logger', method_name: 'logTransaction', execution_time_ns: 320000, invocation_depth: 5 },
  { id: 'f6', instrumentation_id: 'bi2', timestamp: new Date().toISOString(), thread_id: 'thread-1', class_name: 'Identity.AuthService', method_name: 'ValidateToken', execution_time_ns: 1200000, invocation_depth: 1 },
  { id: 'f7', instrumentation_id: 'bi2', timestamp: new Date().toISOString(), thread_id: 'thread-2', class_name: 'Identity.UserRepository', method_name: 'GetUser', execution_time_ns: 3400000, invocation_depth: 2 },
  { id: 'f8', instrumentation_id: 'bi2', timestamp: new Date().toISOString(), thread_id: 'thread-1', class_name: 'Identity.PasswordHasher', method_name: 'HashPassword', execution_time_ns: 8900000, invocation_depth: 3 },
  { id: 'f9', instrumentation_id: 'bi2', timestamp: new Date().toISOString(), thread_id: 'thread-3', class_name: 'Identity.TokenGenerator', method_name: 'GenerateJWT', execution_time_ns: 1100000, invocation_depth: 2 },
  { id: 'f10', instrumentation_id: 'bi3', timestamp: new Date().toISOString(), thread_id: 'MainThread', class_name: 'ml_pipeline.DataLoader', method_name: 'load_dataset', execution_time_ns: 15600000, invocation_depth: 1 },
  { id: 'f11', instrumentation_id: 'bi3', timestamp: new Date().toISOString(), thread_id: 'Worker-1', class_name: 'ml_pipeline.FeatureExtractor', method_name: 'extract_features', execution_time_ns: 8700000, invocation_depth: 2 },
  { id: 'f12', instrumentation_id: 'bi3', timestamp: new Date().toISOString(), thread_id: 'Worker-2', class_name: 'ml_pipeline.ModelTrainer', method_name: 'train_model', execution_time_ns: 125000000, invocation_depth: 3 }
];

const MOCK_STRING_INTERCEPTS = [
  { id: 's1', instrumentation_id: 'bi1', timestamp: new Date().toISOString(), source_class: 'com.payment.TransactionProcessor', source_method: 'processPayment', string_type: 'sql_query', string_value: 'SELECT * FROM transactions WHERE id = ?', string_length: 42, is_sensitive: true, contains_credentials: false, contains_pii: false },
  { id: 's2', instrumentation_id: 'bi1', timestamp: new Date().toISOString(), source_class: 'com.payment.DatabaseClient', source_method: 'connect', string_type: 'connection_string', string_value: 'jdbc:postgresql://prod-db:5432/payments', string_length: 42, is_sensitive: true, contains_credentials: false, contains_pii: false },
  { id: 's3', instrumentation_id: 'bi1', timestamp: new Date().toISOString(), source_class: 'com.payment.CryptoUtils', source_method: 'encrypt', string_type: 'api_key', string_value: 'sk_live_51H******************', string_length: 32, is_sensitive: true, contains_credentials: true, contains_pii: false },
  { id: 's4', instrumentation_id: 'bi1', timestamp: new Date().toISOString(), source_class: 'com.payment.Logger', source_method: 'logTransaction', string_type: 'user_data', string_value: 'user_email: john.doe@example.com', string_length: 33, is_sensitive: true, contains_credentials: false, contains_pii: true },
  { id: 's5', instrumentation_id: 'bi2', timestamp: new Date().toISOString(), source_class: 'Identity.AuthService', source_method: 'ValidateToken', string_type: 'jwt_token', string_value: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...', string_length: 250, is_sensitive: true, contains_credentials: true, contains_pii: false },
  { id: 's6', instrumentation_id: 'bi2', timestamp: new Date().toISOString(), source_class: 'Identity.UserRepository', source_method: 'GetUser', string_type: 'sql_query', string_value: 'SELECT password_hash FROM users WHERE username = ?', string_length: 52, is_sensitive: true, contains_credentials: false, contains_pii: false },
  { id: 's7', instrumentation_id: 'bi2', timestamp: new Date().toISOString(), source_class: 'Identity.PasswordHasher', source_method: 'HashPassword', string_type: 'password', string_value: '****************', string_length: 16, is_sensitive: true, contains_credentials: true, contains_pii: false },
  { id: 's8', instrumentation_id: 'bi3', timestamp: new Date().toISOString(), source_class: 'ml_pipeline.DataLoader', source_method: 'load_dataset', string_type: 'file_path', string_value: '/data/sensitive/customer_behavior.csv', string_length: 39, is_sensitive: true, contains_credentials: false, contains_pii: true }
];

const MOCK_DOCUMENTS = [
  { id: 'd1', document_name: 'Cloud Service Provider Contract 2024', document_type: 'contract', file_format: 'PDF', status: 'completed', confidence_score: 94, upload_timestamp: new Date().toISOString() },
  { id: 'd2', document_name: 'Annual Risk Assessment Report', document_type: 'risk_assessment', file_format: 'DOCX', status: 'completed', confidence_score: 91, upload_timestamp: new Date().toISOString() },
  { id: 'd3', document_name: 'Business Continuity Plan 2024', document_type: 'bia', file_format: 'PDF', status: 'completed', confidence_score: 89, upload_timestamp: new Date().toISOString() },
  { id: 'd4', document_name: 'Third Party Vendor Agreement', document_type: 'contract', file_format: 'PDF', status: 'completed', confidence_score: 92, upload_timestamp: new Date().toISOString() },
  { id: 'd5', document_name: 'SOC 2 Type II Report', document_type: 'compliance', file_format: 'PDF', status: 'completed', confidence_score: 96, upload_timestamp: new Date().toISOString() },
  { id: 'd6', document_name: 'Incident Response Playbook', document_type: 'policy', file_format: 'DOCX', status: 'completed', confidence_score: 88, upload_timestamp: new Date().toISOString() },
  { id: 'd7', document_name: 'Data Processing Agreement (DPA)', document_type: 'contract', file_format: 'PDF', status: 'completed', confidence_score: 93, upload_timestamp: new Date().toISOString() },
  { id: 'd8', document_name: 'Penetration Test Report Q1 2024', document_type: 'assessment', file_format: 'PDF', status: 'completed', confidence_score: 95, upload_timestamp: new Date().toISOString() }
];

const MOCK_EXTRACTED_ASSETS = [
  { id: 'a1', document_id: 'd1', asset_name: 'AWS Production Environment', asset_type: 'cloud_infrastructure', description: 'Primary production infrastructure hosted on AWS us-east-1', criticality: 'critical', confidence_score: 95 },
  { id: 'a2', document_id: 'd1', asset_name: 'Customer Database Cluster', asset_type: 'database', description: 'PostgreSQL RDS cluster containing customer PII and transaction data', criticality: 'critical', confidence_score: 98 },
  { id: 'a3', document_id: 'd2', asset_name: 'Payment Processing Gateway', asset_type: 'application', description: 'Core payment processing system handling financial transactions', criticality: 'critical', confidence_score: 97 },
  { id: 'a4', document_id: 'd2', asset_name: 'Identity Management System', asset_type: 'application', description: 'OAuth2/OIDC authentication and authorization platform', criticality: 'high', confidence_score: 92 },
  { id: 'a5', document_id: 'd3', asset_name: 'Backup Storage System', asset_type: 'storage', description: 'S3-based backup storage with 90-day retention', criticality: 'high', confidence_score: 89 },
  { id: 'a6', document_id: 'd4', asset_name: 'Third Party API Gateway', asset_type: 'network', description: 'API gateway for external partner integrations', criticality: 'medium', confidence_score: 85 },
  { id: 'a7', document_id: 'd5', asset_name: 'Encryption Key Management', asset_type: 'security', description: 'AWS KMS for encryption key lifecycle management', criticality: 'critical', confidence_score: 96 },
  { id: 'a8', document_id: 'd8', asset_name: 'Web Application Firewall', asset_type: 'security', description: 'CloudFlare WAF protecting public-facing applications', criticality: 'high', confidence_score: 91 }
];

const MOCK_RISK_ASSESSMENTS = [
  { id: 'r1', document_id: 'd1', risk_title: 'Cloud Provider Service Disruption', risk_description: 'Potential for extended AWS outage affecting critical services', risk_score: 72, likelihood: 'medium', impact: 'high', risk_category: 'operational' },
  { id: 'r2', document_id: 'd1', risk_title: 'Data Breach via Misconfigured S3 Bucket', risk_description: 'Accidental public exposure of S3 buckets containing sensitive data', risk_score: 85, likelihood: 'high', impact: 'critical', risk_category: 'security' },
  { id: 'r3', document_id: 'd2', risk_title: 'Ransomware Attack on Production Systems', risk_description: 'Sophisticated ransomware targeting production databases', risk_score: 78, likelihood: 'medium', impact: 'critical', risk_category: 'security' },
  { id: 'r4', document_id: 'd2', risk_title: 'Third Party Vendor Security Breach', risk_description: 'Security compromise at critical third party vendor', risk_score: 68, likelihood: 'medium', impact: 'high', risk_category: 'third_party' },
  { id: 'r5', document_id: 'd4', risk_title: 'API Key Exposure in Source Code', risk_description: 'Hardcoded API keys accidentally committed to public repositories', risk_score: 82, likelihood: 'high', impact: 'high', risk_category: 'security' },
  { id: 'r6', document_id: 'd8', risk_title: 'SQL Injection Vulnerability', risk_description: 'Multiple SQL injection points identified in legacy applications', risk_score: 91, likelihood: 'high', impact: 'critical', risk_category: 'security' }
];

const MOCK_BIA_DATA = [
  { id: 'bia1', document_id: 'd3', business_process: 'Payment Processing', criticality_tier: 1, rto_hours: 2, rpo_hours: 0.5, mtpd_hours: 4, annual_revenue_impact_usd: 25000000 },
  { id: 'bia2', document_id: 'd3', business_process: 'Customer Authentication', criticality_tier: 1, rto_hours: 1, rpo_hours: 0.25, mtpd_hours: 2, annual_revenue_impact_usd: 18000000 },
  { id: 'bia3', document_id: 'd3', business_process: 'Order Fulfillment', criticality_tier: 2, rto_hours: 4, rpo_hours: 1, mtpd_hours: 8, annual_revenue_impact_usd: 12000000 },
  { id: 'bia4', document_id: 'd3', business_process: 'Customer Support Portal', criticality_tier: 2, rto_hours: 8, rpo_hours: 4, mtpd_hours: 24, annual_revenue_impact_usd: 3500000 },
  { id: 'bia5', document_id: 'd3', business_process: 'Analytics and Reporting', criticality_tier: 3, rto_hours: 24, rpo_hours: 12, mtpd_hours: 72, annual_revenue_impact_usd: 500000 },
  { id: 'bia6', document_id: 'd3', business_process: 'Marketing Campaign Platform', criticality_tier: 3, rto_hours: 48, rpo_hours: 24, mtpd_hours: 168, annual_revenue_impact_usd: 800000 }
];

const MOCK_AI_INSIGHTS = [
  { id: 'i1', document_id: 'd1', title: 'Critical: Implement Multi-Region Failover', description: 'Contract specifies 99.99% uptime but single-region deployment creates risk', insight_type: 'recommendation', severity: 'critical', priority_score: 95, estimated_cost_usd: 250000 },
  { id: 'i2', document_id: 'd1', title: 'Enhance S3 Bucket Security Policies', description: 'Review and implement bucket policies with explicit deny for public access', insight_type: 'remediation', severity: 'high', priority_score: 88, estimated_cost_usd: 15000 },
  { id: 'i3', document_id: 'd2', title: 'Deploy Anti-Ransomware Solution', description: 'Implement behavioral detection and immutable backups', insight_type: 'recommendation', severity: 'high', priority_score: 92, estimated_cost_usd: 180000 },
  { id: 'i4', document_id: 'd2', title: 'Third Party Risk Assessment Program', description: 'Establish formal vendor security assessment process', insight_type: 'gap_analysis', severity: 'medium', priority_score: 75, estimated_cost_usd: 50000 },
  { id: 'i5', document_id: 'd4', title: 'Secret Scanning in CI/CD Pipeline', description: 'Implement automated secret detection before code commits', insight_type: 'remediation', severity: 'high', priority_score: 90, estimated_cost_usd: 25000 },
  { id: 'i6', document_id: 'd8', title: 'Urgent: Patch SQL Injection Vulnerabilities', description: 'Remediate 12 critical SQL injection vulnerabilities identified', insight_type: 'remediation', severity: 'critical', priority_score: 98, estimated_cost_usd: 120000 },
  { id: 'i7', document_id: 'd5', title: 'Compliance Gap: Encryption at Rest', description: 'Several data stores lack encryption at rest as required by SOC 2', insight_type: 'compliance', severity: 'high', priority_score: 87, estimated_cost_usd: 35000 },
  { id: 'i8', document_id: 'd6', title: 'Incident Response Playbook Automation', description: 'Automate 70% of IR playbook steps using SOAR platform', insight_type: 'optimization', severity: 'medium', priority_score: 72, estimated_cost_usd: 95000 }
];

export default function DataConnectors() {
  const [activeTab, setActiveTab] = useState<'overview' | 'catalog' | 'dpi' | 'bytecode' | 'network' | 'cloud' | 'siem' | 'ai-analysis' | 'version-agent' | 'vibe-builder'>('overview');
  const connectors = MOCK_CONNECTORS;
  const [selectedConnector, setSelectedConnector] = useState(MOCK_CONNECTORS[0]);
  const bytecodeInstrumentation = MOCK_BYTECODE_INSTRUMENTATION;
  const interceptedFunctions = MOCK_INTERCEPTED_FUNCTIONS;
  const stringIntercepts = MOCK_STRING_INTERCEPTS;
  const documents = MOCK_DOCUMENTS;
  const [selectedDocument, setSelectedDocument] = useState(MOCK_DOCUMENTS[0]);
  const extractedAssets = MOCK_EXTRACTED_ASSETS;
  const riskAssessments = MOCK_RISK_ASSESSMENTS;
  const biaData = MOCK_BIA_DATA;
  const aiInsights = MOCK_AI_INSIGHTS;

  const alerts = connectors.filter(c => c.health_status !== 'healthy');

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      active: 'bg-green-100 text-green-700',
      paused: 'bg-yellow-100 text-yellow-700',
      stopped: 'bg-slate-100 text-slate-700',
      error: 'bg-red-100 text-red-700',
      completed: 'bg-blue-100 text-blue-700',
      processing: 'bg-purple-100 text-purple-700',
      pending: 'bg-orange-100 text-orange-700'
    };
    return colors[status] || colors.active;
  };

  const getHealthColor = (health: string) => {
    const colors: Record<string, string> = {
      healthy: 'text-green-600',
      degraded: 'text-yellow-600',
      unhealthy: 'text-orange-600',
      offline: 'text-red-600'
    };
    return colors[health] || colors.healthy;
  };

  const getConnectorIcon = (type: string) => {
    const icons: Record<string, any> = {
      dpi: Eye,
      network_tap: Network,
      bytecode_weaving: Code,
      ebpf: Code,
      aws_cloudtrail: Cloud,
      azure_monitor: Cloud,
      gcp_logging: Cloud,
      splunk: Database,
      qradar: Database,
      sentinel: Database,
      agent_collector: Server,
      kafka: Network,
      api_webhook: Server,
      cef: Network,
      span: Network
    };
    return icons[type] || Database;
  };

  const renderOverviewTab = () => {
    const byCategory = connectors.reduce((acc: any, conn) => {
      const cat = conn.connector_category || 'other';
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(conn);
      return acc;
    }, {});

    const totalEPS = connectors.reduce((sum, c) => sum + (parseFloat(c.events_per_second) || 0), 0);
    const totalMBPS = connectors.reduce((sum, c) => sum + (parseFloat(c.data_rate_mbps) || 0), 0);

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-5 gap-4">
          <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4 border border-blue-200">
            <div className="flex items-center justify-between mb-2">
              <Database className="w-6 h-6 text-blue-600" />
              <span className="text-2xl font-bold text-blue-700">{connectors.length}</span>
            </div>
            <div className="text-sm font-medium text-blue-600">Total Connectors</div>
          </div>
          <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-4 border border-green-200">
            <div className="flex items-center justify-between mb-2">
              <CheckCircle className="w-6 h-6 text-green-600" />
              <span className="text-2xl font-bold text-green-700">
                {connectors.filter(c => c.status === 'active').length}
              </span>
            </div>
            <div className="text-sm font-medium text-green-600">Active</div>
          </div>
          <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg p-4 border border-purple-200">
            <div className="flex items-center justify-between mb-2">
              <TrendingUp className="w-6 h-6 text-purple-600" />
              <span className="text-2xl font-bold text-purple-700">
                {totalEPS.toFixed(0)}
              </span>
            </div>
            <div className="text-sm font-medium text-purple-600">Events/Sec</div>
          </div>
          <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-lg p-4 border border-orange-200">
            <div className="flex items-center justify-between mb-2">
              <Network className="w-6 h-6 text-orange-600" />
              <span className="text-2xl font-bold text-orange-700">
                {totalMBPS.toFixed(1)}
              </span>
            </div>
            <div className="text-sm font-medium text-orange-600">MB/s</div>
          </div>
          <div className="bg-gradient-to-br from-red-50 to-red-100 rounded-lg p-4 border border-red-200">
            <div className="flex items-center justify-between mb-2">
              <AlertTriangle className="w-6 h-6 text-red-600" />
              <span className="text-2xl font-bold text-red-700">{alerts.length}</span>
            </div>
            <div className="text-sm font-medium text-red-600">Degraded</div>
          </div>
        </div>

        {Object.entries(byCategory).map(([category, conns]: [string, any]) => (
          <div key={category} className="bg-white rounded-xl shadow-lg border border-slate-200">
            <div className="p-4 border-b border-slate-200 bg-slate-50">
              <h3 className="font-bold text-slate-900 capitalize">{category} Connectors ({conns.length})</h3>
            </div>
            <div className="p-4">
              <div className="grid grid-cols-2 gap-4">
                {conns.map((conn: any) => {
                  const Icon = getConnectorIcon(conn.connector_type);
                  return (
                    <button
                      key={conn.id}
                      onClick={() => setSelectedConnector(conn)}
                      className={`text-left p-4 rounded-lg border-2 transition-all ${
                        selectedConnector?.id === conn.id
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-slate-200 bg-white hover:border-blue-300'
                      }`}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center space-x-2">
                          <Icon className={`w-5 h-5 ${selectedConnector?.id === conn.id ? 'text-blue-600' : 'text-slate-400'}`} />
                          <div>
                            <div className="text-sm font-medium text-slate-900">{conn.connector_name}</div>
                            <div className="text-xs text-slate-600">{conn.connector_type}</div>
                          </div>
                        </div>
                        <div className="flex flex-col items-end space-y-1">
                          <span className={`text-xs px-2 py-1 rounded-full ${getStatusColor(conn.status)}`}>
                            {conn.status}
                          </span>
                          <span className={`text-xs font-medium ${getHealthColor(conn.health_status)}`}>
                            {conn.health_status}
                          </span>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-xs mt-3">
                        <div>
                          <div className="text-slate-500">Events/s</div>
                          <div className="font-bold text-slate-900">{parseFloat(conn.events_per_second || 0).toFixed(1)}</div>
                        </div>
                        <div>
                          <div className="text-slate-500">MB/s</div>
                          <div className="font-bold text-slate-900">{parseFloat(conn.data_rate_mbps || 0).toFixed(2)}</div>
                        </div>
                        <div>
                          <div className="text-slate-500">Uptime</div>
                          <div className="font-bold text-green-600">{parseFloat(conn.uptime_percent || 0).toFixed(1)}%</div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderBytecodeTab = () => {
    const instrumentedConnectorIds = bytecodeInstrumentation.map(b => b.connector_id);
    const instrumentedConnectors = connectors.filter(c => instrumentedConnectorIds.includes(c.id));

    return (
      <div className="space-y-6">
        <div className="bg-gradient-to-r from-purple-600 to-purple-700 rounded-xl p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-2xl font-bold flex items-center space-x-2">
                <Code className="w-8 h-8" />
                <span>Bytecode Weaving Instrumentation</span>
              </h3>
              <p className="text-purple-200 mt-2">Runtime code injection and function interception</p>
            </div>
            <div className="text-right">
              <div className="text-3xl font-bold">{bytecodeInstrumentation.length}</div>
              <div className="text-purple-200 text-sm">Active Instrumentations</div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          {instrumentedConnectors.map((conn) => {
            const instrumentation = bytecodeInstrumentation.find(b => b.connector_id === conn.id);
            const funcCount = instrumentation ? interceptedFunctions.filter(f => f.instrumentation_id === instrumentation.id).length : 0;
            const stringCount = instrumentation ? stringIntercepts.filter(s => s.instrumentation_id === instrumentation.id).length : 0;

            return (
              <button
                key={conn.id}
                onClick={() => setSelectedConnector(conn)}
                className={`text-left p-4 rounded-lg border-2 transition-all ${
                  selectedConnector?.id === conn.id
                    ? 'border-purple-500 bg-purple-50 shadow-lg'
                    : 'border-slate-200 bg-white hover:border-purple-300'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <Code className={`w-5 h-5 ${selectedConnector?.id === conn.id ? 'text-purple-600' : 'text-slate-400'}`} />
                  <span className={`text-xs px-2 py-1 rounded-full ${getStatusColor(conn.status)}`}>
                    {conn.status}
                  </span>
                </div>
                <div className="text-sm font-medium text-slate-900 mb-1">{conn.connector_name}</div>
                {instrumentation && (
                  <div className="text-xs text-slate-600 mb-2">
                    {instrumentation.runtime_type} • {instrumentation.weaving_technique}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <div className="text-slate-500">Functions</div>
                    <div className="font-bold text-purple-600">{funcCount}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">Strings</div>
                    <div className="font-bold text-blue-600">{stringCount}</div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {selectedConnector && instrumentedConnectorIds.includes(selectedConnector.id) && (
          <>
            <div className="bg-white rounded-xl shadow-lg border border-slate-200">
              <div className="p-4 border-b border-slate-200 bg-slate-50">
                <h4 className="font-bold text-slate-900 flex items-center space-x-2">
                  <GitBranch className="w-5 h-5 text-purple-600" />
                  <span>Intercepted Function Calls</span>
                </h4>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase">Time</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase">Thread</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase">Class</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase">Method</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase">Exec Time</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase">Depth</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {interceptedFunctions.filter(f => {
                      const inst = bytecodeInstrumentation.find(b => b.connector_id === selectedConnector.id);
                      return inst && f.instrumentation_id === inst.id;
                    }).map((func) => (
                      <tr key={func.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 text-xs font-mono text-slate-600">
                          {new Date(func.timestamp).toLocaleTimeString()}
                        </td>
                        <td className="px-4 py-3 text-xs font-mono text-slate-600">{func.thread_id}</td>
                        <td className="px-4 py-3 text-xs font-mono text-blue-600">{func.class_name}</td>
                        <td className="px-4 py-3 text-xs font-mono text-slate-900">{func.method_name}</td>
                        <td className="px-4 py-3 text-xs text-slate-600">
                          {((func.execution_time_ns || 0) / 1000000).toFixed(2)}ms
                        </td>
                        <td className="px-4 py-3 text-xs font-bold text-purple-600">{func.invocation_depth}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-lg border border-slate-200">
              <div className="p-4 border-b border-slate-200 bg-slate-50">
                <h4 className="font-bold text-slate-900 flex items-center space-x-2">
                  <FileCode className="w-5 h-5 text-blue-600" />
                  <span>Intercepted String Data</span>
                </h4>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase">Time</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase">Source</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase">Type</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase">String Value</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase">Length</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase">Flags</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {stringIntercepts.filter(s => {
                      const inst = bytecodeInstrumentation.find(b => b.connector_id === selectedConnector.id);
                      return inst && s.instrumentation_id === inst.id;
                    }).map((str) => (
                      <tr key={str.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 text-xs font-mono text-slate-600">
                          {new Date(str.timestamp).toLocaleTimeString()}
                        </td>
                        <td className="px-4 py-3 text-xs font-mono text-blue-600">
                          {str.source_class}.{str.source_method}
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                            {str.string_type}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs font-mono text-slate-900 max-w-md truncate">
                          {str.string_value}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600">{str.string_length}</td>
                        <td className="px-4 py-3">
                          <div className="flex space-x-1">
                            {str.is_sensitive && (
                              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">
                                Sensitive
                              </span>
                            )}
                            {str.contains_credentials && (
                              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700">
                                Creds
                              </span>
                            )}
                            {str.contains_pii && (
                              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-700">
                                PII
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    );
  };

  const renderAIAnalysisTab = () => {
    const selectedDocAssets = extractedAssets.filter(a => a.document_id === selectedDocument?.id);
    const selectedDocRisks = riskAssessments.filter(r => r.document_id === selectedDocument?.id);
    const selectedDocBIA = biaData.filter(b => b.document_id === selectedDocument?.id);
    const selectedDocInsights = aiInsights.filter(i => i.document_id === selectedDocument?.id);

    return (
      <div className="space-y-6">
        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-xl p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-2xl font-bold flex items-center space-x-2">
                <Brain className="w-8 h-8" />
                <span>AI Document Analysis</span>
              </h3>
              <p className="text-indigo-200 mt-2">Automated extraction of risks, assets, BIAs, and compliance from documents</p>
            </div>
            <div className="text-right">
              <div className="text-3xl font-bold">{documents.length}</div>
              <div className="text-indigo-200 text-sm">Documents Analyzed</div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-4">
          {documents.map((doc) => (
            <button
              key={doc.id}
              onClick={() => setSelectedDocument(doc)}
              className={`text-left p-4 rounded-lg border-2 transition-all ${
                selectedDocument?.id === doc.id
                  ? 'border-indigo-500 bg-indigo-50 shadow-lg'
                  : 'border-slate-200 bg-white hover:border-indigo-300'
              }`}
            >
              <div className="flex items-start justify-between mb-2">
                <FileText className={`w-5 h-5 ${selectedDocument?.id === doc.id ? 'text-indigo-600' : 'text-slate-400'}`} />
                <span className={`text-xs px-2 py-1 rounded-full ${getStatusColor(doc.status)}`}>
                  {doc.status}
                </span>
              </div>
              <div className="text-sm font-medium text-slate-900 mb-1 truncate">{doc.document_name}</div>
              <div className="text-xs text-slate-600 mb-2">{doc.document_type} • {doc.file_format}</div>
              <div className="text-xs text-slate-500">
                Confidence: <span className="font-bold text-indigo-600">{doc.confidence_score}%</span>
              </div>
            </button>
          ))}
        </div>

        {selectedDocument && (
          <>
            <div className="grid grid-cols-4 gap-4">
              <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4 border border-blue-200">
                <div className="flex items-center justify-between mb-2">
                  <Server className="w-6 h-6 text-blue-600" />
                  <span className="text-2xl font-bold text-blue-700">{selectedDocAssets.length}</span>
                </div>
                <div className="text-sm font-medium text-blue-600">Extracted Assets</div>
              </div>
              <div className="bg-gradient-to-br from-red-50 to-red-100 rounded-lg p-4 border border-red-200">
                <div className="flex items-center justify-between mb-2">
                  <AlertTriangle className="w-6 h-6 text-red-600" />
                  <span className="text-2xl font-bold text-red-700">{selectedDocRisks.length}</span>
                </div>
                <div className="text-sm font-medium text-red-600">Risk Assessments</div>
              </div>
              <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg p-4 border border-purple-200">
                <div className="flex items-center justify-between mb-2">
                  <BarChart3 className="w-6 h-6 text-purple-600" />
                  <span className="text-2xl font-bold text-purple-700">{selectedDocBIA.length}</span>
                </div>
                <div className="text-sm font-medium text-purple-600">BIA Records</div>
              </div>
              <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-4 border border-green-200">
                <div className="flex items-center justify-between mb-2">
                  <Brain className="w-6 h-6 text-green-600" />
                  <span className="text-2xl font-bold text-green-700">{selectedDocInsights.length}</span>
                </div>
                <div className="text-sm font-medium text-green-600">AI Insights</div>
              </div>
            </div>

            <div className="text-center text-slate-600 py-8">
              Detailed analysis panels available (Assets, Risks, BIA, Insights)
            </div>
          </>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-slate-900 to-blue-900 rounded-xl p-6 text-white">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold flex items-center space-x-2">
              <Database className="w-8 h-8" />
              <span>Data Connectors</span>
            </h2>
            <p className="text-slate-300 mt-2">Unified data ingestion platform with DPI, bytecode weaving, and AI document analysis</p>
          </div>
          <div className="flex items-center space-x-6">
            <div className="text-center">
              <div className="text-2xl font-bold">{connectors.length}</div>
              <div className="text-slate-300 text-sm">Connectors</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold">
                {connectors.reduce((sum, c) => sum + (parseFloat(c.events_per_second) || 0), 0).toFixed(0)}
              </div>
              <div className="text-slate-300 text-sm">EPS</div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-lg border border-slate-200">
        <div className="border-b border-slate-200">
          <div className="flex space-x-1 p-2">
            {[
              { id: 'overview', label: 'Overview', icon: Database },
              { id: 'catalog', label: 'Connector Catalog (108+)', icon: BookOpen },
              { id: 'dpi', label: 'Deep Packet Inspection', icon: Eye },
              { id: 'bytecode', label: 'Bytecode Weaving', icon: Code },
              { id: 'ai-analysis', label: 'AI Document Analysis', icon: Brain },
              { id: 'network', label: 'Network Taps', icon: Network },
              { id: 'cloud', label: 'Cloud APIs', icon: Cloud },
              { id: 'siem', label: 'SIEM Integration', icon: Layers },
              { id: 'version-agent', label: 'Version Agent', icon: Cpu },
              { id: 'vibe-builder', label: 'Vibe Builder', icon: Wand2 }
            ].map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex items-center space-x-2 px-4 py-2 rounded-lg font-medium text-sm transition-all ${
                    activeTab === tab.id
                      ? 'bg-blue-100 text-blue-700 shadow-sm'
                      : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="p-6">
          {activeTab === 'overview' && renderOverviewTab()}
          {activeTab === 'catalog' && <ConnectorCatalog />}
          {activeTab === 'dpi' && <DPIInspection />}
          {activeTab === 'bytecode' && renderBytecodeTab()}
          {activeTab === 'ai-analysis' && renderAIAnalysisTab()}
          {activeTab === 'network' && <NetworkTapsTab />}
          {activeTab === 'cloud' && <CloudAPIsTab />}
          {activeTab === 'siem' && <SIEMIntegrationTab />}
          {activeTab === 'version-agent' && <ConnectorVersionAgent />}
          {activeTab === 'vibe-builder' && <ConnectorVibeBuilder />}
        </div>
      </div>
    </div>
  );
}
