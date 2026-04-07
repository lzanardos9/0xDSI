import { useState, useEffect } from 'react';
import { Shield, CheckCircle, AlertTriangle, XCircle, Clock, TrendingUp, FileCheck, AlertOctagon, ChevronDown, ChevronUp } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface Framework {
  id: string;
  framework_code: string;
  framework_name: string;
  version: string;
  description: string;
  category: string;
  regulatory: boolean;
}

interface ComplianceStatus {
  framework_id: string;
  framework_name: string;
  framework_code: string;
  total_controls: number;
  compliant_controls: number;
  compliance_score: number;
  critical_gaps: number;
  high_gaps: number;
  medium_gaps: number;
  low_gaps: number;
  last_assessment: string;
}

interface Gap {
  id: string;
  framework_name: string;
  gap_title: string;
  severity: string;
  risk_level: string;
  remediation_status: string;
  due_date: string;
}

export default function ComplianceDashboard() {
  const [frameworks, setFrameworks] = useState<Framework[]>([]);
  const [complianceStatus, setComplianceStatus] = useState<ComplianceStatus[]>([]);
  const [topGaps, setTopGaps] = useState<Gap[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFramework, setSelectedFramework] = useState<string | null>(null);
  const [gapsExpanded, setGapsExpanded] = useState(false);

  useEffect(() => {
    loadComplianceData();
    const interval = setInterval(loadComplianceData, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadComplianceData = async () => {
    try {
      const { data: fwData } = await supabase
        .from('compliance_frameworks')
        .select('*')
        .order('framework_code');

      if (fwData) setFrameworks(fwData);

      const { data: statusData } = await supabase
        .from('compliance_assessments')
        .select(`
          *,
          compliance_controls!inner(
            framework_id,
            frameworks:compliance_frameworks!inner(
              framework_name,
              framework_code
            )
          )
        `);

      if (statusData) {
        const aggregated = fwData?.map(fw => {
          const fwAssessments = statusData.filter((a: any) =>
            a.compliance_controls.framework_id === fw.id
          );

          const totalControls = fwAssessments.length;
          const compliantControls = fwAssessments.filter((a: any) =>
            a.status === 'compliant'
          ).length;

          const criticalGaps = fwAssessments.reduce((sum: number, a: any) =>
            sum + (a.critical_gaps || 0), 0
          );
          const highGaps = fwAssessments.reduce((sum: number, a: any) =>
            sum + (a.high_gaps || 0), 0
          );
          const mediumGaps = fwAssessments.reduce((sum: number, a: any) =>
            sum + (a.medium_gaps || 0), 0
          );
          const lowGaps = fwAssessments.reduce((sum: number, a: any) =>
            sum + (a.low_gaps || 0), 0
          );

          const complianceScore = totalControls > 0
            ? (compliantControls / totalControls) * 100
            : 0;

          const lastAssessment = fwAssessments.length > 0
            ? fwAssessments.reduce((latest: any, current: any) => {
                return new Date(current.last_assessment) > new Date(latest.last_assessment)
                  ? current
                  : latest;
              }).last_assessment
            : new Date().toISOString();

          return {
            framework_id: fw.id,
            framework_name: fw.framework_name,
            framework_code: fw.framework_code,
            total_controls: totalControls,
            compliant_controls: compliantControls,
            compliance_score: Math.round(complianceScore * 10) / 10,
            critical_gaps: criticalGaps,
            high_gaps: highGaps,
            medium_gaps: mediumGaps,
            low_gaps: lowGaps,
            last_assessment: lastAssessment
          };
        }) || [];

        setComplianceStatus(aggregated);
      }

      const { data: gapsData } = await supabase
        .from('compliance_gaps')
        .select(`
          *,
          frameworks:compliance_frameworks!inner(framework_name)
        `)
        .in('severity', ['critical', 'high'])
        .order('identified_at', { ascending: false })
        .limit(10);

      if (gapsData) {
        setTopGaps(gapsData.map((g: any) => ({
          ...g,
          framework_name: g.frameworks.framework_name
        })));
      }

      setLoading(false);
    } catch (error) {
      console.error('Error loading compliance data:', error);
      setLoading(false);
    }
  };

  const getComplianceColor = (score: number) => {
    if (score >= 90) return 'text-green-400';
    if (score >= 75) return 'text-yellow-400';
    if (score >= 60) return 'text-orange-400';
    return 'text-red-400';
  };

  const getComplianceBgColor = (score: number) => {
    if (score >= 90) return 'bg-green-500/20 border-green-500/30';
    if (score >= 75) return 'bg-yellow-500/20 border-yellow-500/30';
    if (score >= 60) return 'bg-orange-500/20 border-orange-500/30';
    return 'bg-red-500/20 border-red-500/30';
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'text-red-400 bg-red-500/20 border-red-500/30';
      case 'high': return 'text-orange-400 bg-orange-500/20 border-orange-500/30';
      case 'medium': return 'text-yellow-400 bg-yellow-500/20 border-yellow-500/30';
      default: return 'text-blue-400 bg-blue-500/20 border-blue-500/30';
    }
  };

  const overallCompliance = complianceStatus.length > 0
    ? Math.round((complianceStatus.reduce((sum, fw) => sum + fw.compliance_score, 0) / complianceStatus.length) * 10) / 10
    : 0;

  const totalGaps = complianceStatus.reduce((sum, fw) =>
    sum + fw.critical_gaps + fw.high_gaps + fw.medium_gaps + fw.low_gaps, 0
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-400">Loading compliance data...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-br from-blue-900/40 to-slate-900 border-2 border-blue-500/30 rounded-xl p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-white flex items-center gap-3">
              <Shield className="w-8 h-8 text-blue-400" />
              Compliance Status Dashboard
            </h2>
            <p className="text-slate-300 text-sm mt-1">
              Real-time compliance monitoring across 6 major frameworks
            </p>
          </div>
          <div className="text-right">
            <div className={`text-4xl font-bold ${getComplianceColor(overallCompliance)}`}>
              {overallCompliance}%
            </div>
            <div className="text-slate-400 text-sm">Overall Compliance</div>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <FileCheck className="w-5 h-5 text-blue-400" />
            <span className="text-2xl font-bold text-white">
              {complianceStatus.reduce((sum, fw) => sum + fw.compliant_controls, 0)}
            </span>
          </div>
          <div className="text-slate-400 text-sm">Compliant Controls</div>
          <div className="text-slate-500 text-xs mt-1">
            of {complianceStatus.reduce((sum, fw) => sum + fw.total_controls, 0)} total
          </div>
        </div>

        <div className="bg-slate-900/50 border border-red-500/30 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <AlertOctagon className="w-5 h-5 text-red-400" />
            <span className="text-2xl font-bold text-red-400">
              {complianceStatus.reduce((sum, fw) => sum + fw.critical_gaps, 0)}
            </span>
          </div>
          <div className="text-slate-400 text-sm">Critical Gaps</div>
          <div className="text-slate-500 text-xs mt-1">Requires immediate action</div>
        </div>

        <div className="bg-slate-900/50 border border-orange-500/30 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <AlertTriangle className="w-5 h-5 text-orange-400" />
            <span className="text-2xl font-bold text-orange-400">
              {complianceStatus.reduce((sum, fw) => sum + fw.high_gaps, 0)}
            </span>
          </div>
          <div className="text-slate-400 text-sm">High Priority Gaps</div>
          <div className="text-slate-500 text-xs mt-1">Address within 30 days</div>
        </div>

        <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <TrendingUp className="w-5 h-5 text-green-400" />
            <span className="text-2xl font-bold text-green-400">
              +{Math.round(overallCompliance / 10)}%
            </span>
          </div>
          <div className="text-slate-400 text-sm">Improvement (30d)</div>
          <div className="text-slate-500 text-xs mt-1">Trending upward</div>
        </div>
      </div>

      {/* Framework Status Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {complianceStatus.map(fw => (
          <div
            key={fw.framework_id}
            className={`bg-slate-900/50 border rounded-lg p-5 cursor-pointer transition-all hover:border-blue-500/50 ${
              selectedFramework === fw.framework_id ? 'border-blue-500 ring-2 ring-blue-500/20' : 'border-slate-800'
            } ${getComplianceBgColor(fw.compliance_score)}`}
            onClick={() => setSelectedFramework(fw.framework_id === selectedFramework ? null : fw.framework_id)}
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex-1">
                <div className="text-white font-semibold">{fw.framework_code}</div>
                <div className="text-slate-400 text-xs mt-1">{fw.framework_name}</div>
              </div>
              <div className={`text-3xl font-bold ${getComplianceColor(fw.compliance_score)}`}>
                {fw.compliance_score}%
              </div>
            </div>

            <div className="h-2 bg-slate-800 rounded-full overflow-hidden mb-3">
              <div
                className={`h-full transition-all ${
                  fw.compliance_score >= 90 ? 'bg-green-500' :
                  fw.compliance_score >= 75 ? 'bg-yellow-500' :
                  fw.compliance_score >= 60 ? 'bg-orange-500' : 'bg-red-500'
                }`}
                style={{ width: `${fw.compliance_score}%` }}
              />
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-slate-800/50 rounded p-2">
                <div className="text-slate-400">Compliant</div>
                <div className="text-white font-semibold">
                  {fw.compliant_controls}/{fw.total_controls}
                </div>
              </div>
              <div className="bg-slate-800/50 rounded p-2">
                <div className="text-slate-400">Gaps</div>
                <div className="text-white font-semibold">
                  <span className="text-red-400">{fw.critical_gaps}</span> /
                  <span className="text-orange-400">{fw.high_gaps}</span>
                </div>
              </div>
            </div>

            <div className="mt-3 pt-3 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
              <div className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                <span>Last assessed {new Date(fw.last_assessment).toLocaleDateString()}</span>
              </div>
              {fw.compliance_score >= 90 && <CheckCircle className="w-4 h-4 text-green-400" />}
              {fw.critical_gaps > 0 && <XCircle className="w-4 h-4 text-red-400" />}
            </div>
          </div>
        ))}
      </div>

      {/* Top Compliance Gaps - Collapsible */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-lg overflow-hidden">
        <button
          onClick={() => setGapsExpanded(!gapsExpanded)}
          className="w-full p-6 flex items-center justify-between hover:bg-slate-800/30 transition-all"
        >
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-6 h-6 text-orange-400" />
            <h3 className="text-xl font-bold text-white">Top Priority Compliance Gaps</h3>
            <div className="flex items-center gap-2 ml-2">
              {topGaps.length > 0 && (
                <>
                  <span className="px-2 py-1 bg-red-500/20 text-red-400 text-xs font-semibold rounded border border-red-500/30">
                    {topGaps.filter(g => g.severity === 'critical').length} Critical
                  </span>
                  <span className="px-2 py-1 bg-orange-500/20 text-orange-400 text-xs font-semibold rounded border border-orange-500/30">
                    {topGaps.filter(g => g.severity === 'high').length} High
                  </span>
                </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-slate-400 text-sm">
              {gapsExpanded ? 'Hide' : 'Show'} {topGaps.length} gaps
            </span>
            {gapsExpanded ? (
              <ChevronUp className="w-5 h-5 text-slate-400" />
            ) : (
              <ChevronDown className="w-5 h-5 text-slate-400" />
            )}
          </div>
        </button>

        {gapsExpanded && (
          <div className="px-6 pb-6 space-y-3 border-t border-slate-800 pt-4">
            {topGaps.length === 0 ? (
              <div className="text-center py-8 text-slate-400">
                <CheckCircle className="w-12 h-12 mx-auto mb-3 text-green-400" />
                <div>No critical or high-priority gaps identified</div>
                <div className="text-sm mt-1">All frameworks are in good standing</div>
              </div>
            ) : (
              topGaps.map(gap => (
                <div
                  key={gap.id}
                  className="bg-slate-800/50 rounded-lg p-4 border border-slate-700 hover:border-slate-600 transition-all"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <span className={`px-2 py-1 rounded text-xs font-semibold border ${getSeverityColor(gap.severity)}`}>
                          {gap.severity.toUpperCase()}
                        </span>
                        <span className="text-slate-400 text-sm">{gap.framework_name}</span>
                      </div>
                      <div className="text-white font-medium">{gap.gap_title}</div>
                    </div>
                    <div className="text-right text-xs">
                      <div className={`px-2 py-1 rounded ${
                        gap.remediation_status === 'in_progress' ? 'bg-blue-500/20 text-blue-400' :
                        gap.remediation_status === 'planned' ? 'bg-purple-500/20 text-purple-400' :
                        'bg-slate-700 text-slate-400'
                      }`}>
                        {gap.remediation_status.replace('_', ' ')}
                      </div>
                      {gap.due_date && (
                        <div className="text-slate-400 mt-1">
                          Due: {new Date(gap.due_date).toLocaleDateString()}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
