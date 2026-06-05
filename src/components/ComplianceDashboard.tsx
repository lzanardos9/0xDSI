import { useState, useEffect } from 'react';
import { Shield, CheckCircle, AlertTriangle, XCircle, Clock, TrendingUp, FileCheck, AlertOctagon, ChevronDown, ChevronUp, ArrowLeft, User, Calendar, Target, Layers } from 'lucide-react';
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
  framework_id: string;
  framework_name: string;
  control_id: string;
  gap_title: string;
  gap_description: string;
  severity: string;
  risk_level: string;
  remediation_plan: string;
  remediation_status: string;
  assigned_to: string;
  due_date: string;
  identified_at: string;
}

interface Control {
  id: string;
  control_id: string;
  control_name: string;
  description: string;
  category: string;
  priority: string;
  implementation_status: string;
  automated_check: boolean;
}

export default function ComplianceDashboard() {
  const [frameworks, setFrameworks] = useState<Framework[]>([]);
  const [complianceStatus, setComplianceStatus] = useState<ComplianceStatus[]>([]);
  const [allGaps, setAllGaps] = useState<Gap[]>([]);
  const [frameworkControls, setFrameworkControls] = useState<Control[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFramework, setSelectedFramework] = useState<string | null>(null);
  const [gapsExpanded, setGapsExpanded] = useState(false);

  useEffect(() => {
    loadComplianceData();
    const interval = setInterval(loadComplianceData, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (selectedFramework) {
      loadFrameworkDetails(selectedFramework);
    } else {
      setFrameworkControls([]);
    }
  }, [selectedFramework]);

  const loadFrameworkDetails = async (frameworkId: string) => {
    const { data: controls } = await supabase
      .from('compliance_controls')
      .select('*')
      .eq('framework_id', frameworkId)
      .order('control_id');

    if (controls) setFrameworkControls(controls);
  };

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
          frameworks:compliance_frameworks!inner(framework_name),
          control:compliance_controls!inner(control_id, control_name)
        `)
        .order('severity')
        .order('identified_at', { ascending: false });

      if (gapsData) {
        setAllGaps(gapsData.map((g: any) => ({
          ...g,
          framework_name: g.frameworks.framework_name,
          control_ref: g.control?.control_id || '',
          control_name: g.control?.control_name || ''
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'in_progress': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      case 'planned': return 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30';
      case 'identified': return 'bg-slate-700 text-slate-300 border-slate-600';
      case 'resolved': return 'bg-green-500/20 text-green-400 border-green-500/30';
      default: return 'bg-slate-700 text-slate-400 border-slate-600';
    }
  };

  const getControlStatusBadge = (status: string) => {
    switch (status) {
      case 'implemented': return 'bg-green-500/20 text-green-400 border-green-500/30';
      case 'in_progress': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      case 'partially': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
      case 'not_started': return 'bg-red-500/20 text-red-400 border-red-500/30';
      default: return 'bg-slate-700 text-slate-400 border-slate-600';
    }
  };

  const overallCompliance = complianceStatus.length > 0
    ? Math.round((complianceStatus.reduce((sum, fw) => sum + fw.compliance_score, 0) / complianceStatus.length) * 10) / 10
    : 0;

  const selectedFwData = selectedFramework
    ? frameworks.find(f => f.id === selectedFramework)
    : null;

  const selectedFwStatus = selectedFramework
    ? complianceStatus.find(s => s.framework_id === selectedFramework)
    : null;

  const filteredGaps = selectedFramework
    ? allGaps.filter(g => g.framework_id === selectedFramework)
    : allGaps.filter(g => g.severity === 'critical' || g.severity === 'high').slice(0, 10);

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
              Real-time compliance monitoring across {frameworks.length} frameworks
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
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
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
                <div className="text-slate-400 text-xs mt-1 line-clamp-1">{fw.framework_name}</div>
              </div>
              <div className={`text-2xl font-bold ${getComplianceColor(fw.compliance_score)}`}>
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

      {/* Selected Framework Detail Panel */}
      {selectedFramework && selectedFwData && selectedFwStatus && (
        <div className="bg-slate-900/50 border border-blue-500/30 rounded-xl overflow-hidden">
          <div className="p-6 border-b border-slate-800 bg-gradient-to-r from-blue-900/30 to-slate-900">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setSelectedFramework(null)}
                  className="p-2 hover:bg-slate-800 rounded-lg transition-colors"
                >
                  <ArrowLeft className="w-5 h-5 text-slate-400" />
                </button>
                <div>
                  <h3 className="text-xl font-bold text-white flex items-center gap-3">
                    {selectedFwData.framework_code}
                    <span className="text-sm font-normal text-slate-400">v{selectedFwData.version}</span>
                    {selectedFwData.regulatory && (
                      <span className="px-2 py-0.5 bg-red-500/20 text-red-400 text-xs font-semibold rounded border border-red-500/30">
                        REGULATORY
                      </span>
                    )}
                  </h3>
                  <p className="text-slate-400 text-sm mt-1">{selectedFwData.description}</p>
                </div>
              </div>
              <div className="text-right">
                <div className={`text-3xl font-bold ${getComplianceColor(selectedFwStatus.compliance_score)}`}>
                  {selectedFwStatus.compliance_score}%
                </div>
                <div className="text-slate-500 text-xs">
                  {selectedFwStatus.compliant_controls}/{selectedFwStatus.total_controls} controls passing
                </div>
              </div>
            </div>
          </div>

          {/* Controls Grid */}
          {frameworkControls.length > 0 && (
            <div className="p-6 border-b border-slate-800">
              <h4 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-4 flex items-center gap-2">
                <Layers className="w-4 h-4" />
                Controls ({frameworkControls.length})
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {frameworkControls.map(ctrl => (
                  <div
                    key={ctrl.id}
                    className="bg-slate-800/50 border border-slate-700 rounded-lg p-3 hover:border-slate-600 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-white text-sm font-medium truncate">{ctrl.control_id}</div>
                        <div className="text-slate-400 text-xs truncate">{ctrl.control_name}</div>
                      </div>
                      <span className={`px-2 py-0.5 text-xs rounded border whitespace-nowrap ${getControlStatusBadge(ctrl.implementation_status)}`}>
                        {ctrl.implementation_status.replace('_', ' ')}
                      </span>
                    </div>
                    <div className="text-slate-500 text-xs line-clamp-2">{ctrl.description}</div>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-xs text-slate-500 bg-slate-800 px-1.5 py-0.5 rounded">{ctrl.category}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded ${
                        ctrl.priority === 'critical' ? 'bg-red-500/20 text-red-400' :
                        ctrl.priority === 'high' ? 'bg-orange-500/20 text-orange-400' :
                        ctrl.priority === 'medium' ? 'bg-yellow-500/20 text-yellow-400' :
                        'bg-slate-700 text-slate-400'
                      }`}>
                        {ctrl.priority}
                      </span>
                      {ctrl.automated_check && (
                        <span className="text-xs text-green-400 bg-green-500/10 px-1.5 py-0.5 rounded">automated</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Compliance Gaps - filtered by selected framework */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-lg overflow-hidden">
        <button
          onClick={() => setGapsExpanded(!gapsExpanded)}
          className="w-full p-6 flex items-center justify-between hover:bg-slate-800/30 transition-all"
        >
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-6 h-6 text-orange-400" />
            <h3 className="text-xl font-bold text-white">
              {selectedFramework && selectedFwData
                ? `${selectedFwData.framework_code} Compliance Gaps`
                : 'Top Priority Compliance Gaps'}
            </h3>
            <div className="flex items-center gap-2 ml-2">
              {filteredGaps.length > 0 && (
                <>
                  <span className="px-2 py-1 bg-red-500/20 text-red-400 text-xs font-semibold rounded border border-red-500/30">
                    {filteredGaps.filter(g => g.severity === 'critical').length} Critical
                  </span>
                  <span className="px-2 py-1 bg-orange-500/20 text-orange-400 text-xs font-semibold rounded border border-orange-500/30">
                    {filteredGaps.filter(g => g.severity === 'high').length} High
                  </span>
                  <span className="px-2 py-1 bg-yellow-500/20 text-yellow-400 text-xs font-semibold rounded border border-yellow-500/30">
                    {filteredGaps.filter(g => g.severity === 'medium').length} Medium
                  </span>
                </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-slate-400 text-sm">
              {filteredGaps.length} gap{filteredGaps.length !== 1 ? 's' : ''}
            </span>
            {gapsExpanded ? (
              <ChevronUp className="w-5 h-5 text-slate-400" />
            ) : (
              <ChevronDown className="w-5 h-5 text-slate-400" />
            )}
          </div>
        </button>

        {gapsExpanded && (
          <div className="px-6 pb-6 space-y-4 border-t border-slate-800 pt-4">
            {filteredGaps.length === 0 ? (
              <div className="text-center py-8 text-slate-400">
                <CheckCircle className="w-12 h-12 mx-auto mb-3 text-green-400" />
                <div>No compliance gaps identified for this framework</div>
                <div className="text-sm mt-1">All controls are fully compliant</div>
              </div>
            ) : (
              filteredGaps.map(gap => (
                <div
                  key={gap.id}
                  className="bg-slate-800/40 rounded-xl border border-slate-700 hover:border-slate-600 transition-all overflow-hidden"
                >
                  {/* Gap Header */}
                  <div className="p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <span className={`px-2.5 py-1 rounded text-xs font-bold border ${getSeverityColor(gap.severity)}`}>
                            {gap.severity.toUpperCase()}
                          </span>
                          {!selectedFramework && (
                            <span className="text-slate-400 text-sm font-medium">{gap.framework_name}</span>
                          )}
                          {(gap as any).control_ref && (
                            <span className="text-slate-500 text-xs font-mono bg-slate-800 px-2 py-0.5 rounded">
                              {(gap as any).control_ref}
                            </span>
                          )}
                        </div>
                        <div className="text-white font-semibold text-lg">{gap.gap_title}</div>
                        {(gap as any).control_name && (
                          <div className="text-slate-400 text-sm mt-1">
                            Control: {(gap as any).control_name}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${getStatusColor(gap.remediation_status)}`}>
                          {gap.remediation_status.replace(/_/g, ' ')}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded ${
                          gap.risk_level === 'high' ? 'bg-red-500/10 text-red-400' :
                          gap.risk_level === 'medium' ? 'bg-yellow-500/10 text-yellow-400' :
                          'bg-slate-700 text-slate-400'
                        }`}>
                          Risk: {gap.risk_level}
                        </span>
                      </div>
                    </div>

                    {/* Gap Description */}
                    {gap.gap_description && (
                      <div className="mt-4 p-4 bg-slate-900/60 rounded-lg border border-slate-700/50">
                        <div className="text-slate-300 text-sm leading-relaxed">{gap.gap_description}</div>
                      </div>
                    )}

                    {/* Remediation Plan */}
                    {gap.remediation_plan && (
                      <div className="mt-3 p-4 bg-blue-900/20 rounded-lg border border-blue-500/20">
                        <div className="text-xs font-semibold text-blue-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                          <Target className="w-3.5 h-3.5" />
                          Remediation Plan
                        </div>
                        <div className="text-slate-300 text-sm leading-relaxed">{gap.remediation_plan}</div>
                      </div>
                    )}

                    {/* Meta Row */}
                    <div className="flex items-center gap-6 mt-4 pt-4 border-t border-slate-700/50">
                      {gap.assigned_to && (
                        <div className="flex items-center gap-2 text-sm">
                          <User className="w-4 h-4 text-slate-500" />
                          <span className="text-slate-400">Assigned:</span>
                          <span className="text-white font-medium">{gap.assigned_to.replace(/_/g, ' ')}</span>
                        </div>
                      )}
                      {gap.due_date && (
                        <div className="flex items-center gap-2 text-sm">
                          <Calendar className="w-4 h-4 text-slate-500" />
                          <span className="text-slate-400">Due:</span>
                          <span className={`font-medium ${
                            new Date(gap.due_date) < new Date() ? 'text-red-400' :
                            new Date(gap.due_date) < new Date(Date.now() + 14 * 86400000) ? 'text-yellow-400' :
                            'text-white'
                          }`}>
                            {new Date(gap.due_date).toLocaleDateString()}
                          </span>
                        </div>
                      )}
                      {gap.identified_at && (
                        <div className="flex items-center gap-2 text-sm">
                          <Clock className="w-4 h-4 text-slate-500" />
                          <span className="text-slate-400">Identified:</span>
                          <span className="text-slate-300">{new Date(gap.identified_at).toLocaleDateString()}</span>
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
