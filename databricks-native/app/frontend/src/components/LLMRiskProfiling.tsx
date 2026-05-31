import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Brain, AlertTriangle, TrendingUp, TrendingDown, Shield, Eye, Lock, Code, Clock, User, AlertCircle, ChevronRight } from 'lucide-react';
import MLModelExplainer from './MLModelExplainer';
import { ML_MODELS } from '../lib/mlModelData';

interface LLMRiskProfile {
  id: string;
  user_id: string;
  user_email: string;
  user_name: string;
  department: string;
  role_title: string;
  current_risk_score: number;
  risk_level: string;
  risk_trend: string;
  total_interactions: number;
  high_risk_interactions: number;
  flagged_interactions: number;
  pii_exposure_risk: number;
  credential_exposure_risk: number;
  data_exfiltration_risk: number;
  policy_violation_risk: number;
  jailbreak_attempt_risk: number;
  is_escalated: boolean;
  escalated_at: string | null;
  escalation_reason: string | null;
  has_anomalous_behavior: boolean;
}

interface LLMInteraction {
  id: string;
  user_id: string;
  timestamp: string;
  prompt_text: string;
  prompt_tokens: number;
  model_name: string;
  contains_pii: boolean;
  contains_credentials: boolean;
  contains_proprietary_data: boolean;
  is_jailbreak_attempt: boolean;
  is_data_exfiltration: boolean;
  data_sensitivity_level: string;
  interaction_risk_score: number;
  risk_factors: string[];
  flagged_for_review: boolean;
  geo_location: string;
}

interface LLMRiskIncident {
  id: string;
  incident_type: string;
  severity: string;
  user_id: string;
  title: string;
  description: string;
  risk_score: number;
  status: string;
  priority: number;
  created_at: string;
}

interface PsychologicalProfile {
  id: string;
  user_id: string;
  openness_score: number;
  conscientiousness_score: number;
  extraversion_score: number;
  agreeableness_score: number;
  neuroticism_score: number;
  narcissism_score: number;
  machiavellianism_score: number;
  psychopathy_score: number;
  insider_threat_score: number;
  manipulation_tendency_score: number;
  impulsivity_score: number;
  aggression_score: number;
  deception_likelihood_score: number;
  stress_level: number;
  burnout_risk: number;
  emotional_stability: number;
  frustration_level: number;
  writing_urgency_level: string;
  communication_style: string;
  linguistic_complexity: string;
  overall_psychological_risk_score: number;
  risk_classification: string;
  is_potential_insider_threat: boolean;
  sentiment_trend: string;
  dominant_emotion: string;
  confidence_score: number;
}

interface PsychologicalRiskFactor {
  id: string;
  user_id: string;
  factor_type: string;
  severity: string;
  factor_name: string;
  description: string;
  evidence: any;
  confidence_level: number;
  requires_escalation: boolean;
}

interface CommunicationSource {
  email_connected: boolean;
  slack_connected: boolean;
  teams_connected: boolean;
  zoom_connected: boolean;
  total_emails_analyzed: number;
  total_slack_messages_analyzed: number;
  total_teams_messages_analyzed: number;
  total_meetings_analyzed: number;
}

interface CrossPlatformPattern {
  id: string;
  pattern_type: string;
  pattern_name: string;
  description: string;
  severity: string;
  confidence_level: number;
  email_evidence_count: number;
  slack_evidence_count: number;
  teams_evidence_count: number;
  meetings_evidence_count: number;
  llm_evidence_count: number;
  trend: string;
  requires_intervention: boolean;
  flagged_for_hr: boolean;
  flagged_for_security: boolean;
}

export default function LLMRiskProfiling() {
  const [profiles, setProfiles] = useState<LLMRiskProfile[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<LLMRiskProfile | null>(null);
  const [interactions, setInteractions] = useState<LLMInteraction[]>([]);
  const [incidents, setIncidents] = useState<LLMRiskIncident[]>([]);
  const [psychProfile, setPsychProfile] = useState<PsychologicalProfile | null>(null);
  const [psychRiskFactors, setPsychRiskFactors] = useState<PsychologicalRiskFactor[]>([]);
  const [commSources, setCommSources] = useState<CommunicationSource | null>(null);
  const [crossPlatformPatterns, setCrossPlatformPatterns] = useState<CrossPlatformPattern[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'interactions' | 'incidents' | 'psychology'>('overview');

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (selectedProfile) {
      loadUserDetails(selectedProfile.user_id);
    }
  }, [selectedProfile]);

  const loadData = async () => {
    try {
      const { data: profilesData, error } = await supabase
        .from('llm_risk_profiles')
        .select('*')
        .order('current_risk_score', { ascending: false });

      console.log('LLM Risk Profiles loaded:', profilesData, 'Error:', error);

      if (error) {
        console.error('Supabase error loading profiles:', error);
      }

      if (profilesData && profilesData.length > 0) {
        console.log('Setting profiles:', profilesData.length);
        setProfiles(profilesData);
        setSelectedProfile(profilesData[0]);
      } else {
        console.warn('No profiles data received');
      }

      setLoading(false);
    } catch (error) {
      console.error('Error loading LLM risk data:', error);
      setLoading(false);
    }
  };

  const loadUserDetails = async (userId: string) => {
    try {
      const [interactionsResult, incidentsResult, psychProfileResult, psychFactorsResult, commSourcesResult, crossPlatformResult] = await Promise.all([
        supabase
          .from('llm_interactions')
          .select('*')
          .eq('user_id', userId)
          .order('timestamp', { ascending: false })
          .limit(20),
        supabase
          .from('llm_risk_incidents')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false }),
        supabase
          .from('user_psychological_profiles')
          .select('*')
          .eq('user_id', userId)
          .maybeSingle(),
        supabase
          .from('psychological_risk_factors')
          .select('*')
          .eq('user_id', userId)
          .order('severity', { ascending: false }),
        supabase
          .from('communication_sources')
          .select('*')
          .eq('user_id', userId)
          .maybeSingle(),
        supabase
          .from('cross_platform_behavioral_patterns')
          .select('*')
          .eq('user_id', userId)
          .order('severity', { ascending: false })
      ]);

      console.log('Psychological Profile Data:', psychProfileResult);
      console.log('Communication Sources:', commSourcesResult);
      console.log('Cross-Platform Patterns:', crossPlatformResult);

      setInteractions(interactionsResult.data || []);
      setIncidents(incidentsResult.data || []);
      setPsychProfile(psychProfileResult.data);
      setPsychRiskFactors(psychFactorsResult.data || []);
      setCommSources(commSourcesResult.data);
      setCrossPlatformPatterns(crossPlatformResult.data || []);
    } catch (error) {
      console.error('Error loading user details:', error);
    }
  };

  const getRiskLevelColor = (level: string) => {
    switch (level) {
      case 'critical': return 'bg-red-500 text-white';
      case 'high': return 'bg-orange-500 text-white';
      case 'medium': return 'bg-yellow-500 text-white';
      case 'low': return 'bg-green-500 text-white';
      default: return 'bg-slate-500 text-white';
    }
  };

  const getRiskTrendIcon = (trend: string) => {
    switch (trend) {
      case 'rapidly_increasing': return <TrendingUp className="w-4 h-4 text-red-500" />;
      case 'increasing': return <TrendingUp className="w-4 h-4 text-orange-500" />;
      case 'stable': return <span className="text-blue-500">━</span>;
      case 'decreasing': return <TrendingDown className="w-4 h-4 text-green-500" />;
      default: return null;
    }
  };

  const getSensitivityColor = (level: string) => {
    switch (level) {
      case 'restricted': return 'bg-red-100 text-red-700';
      case 'confidential': return 'bg-orange-100 text-orange-700';
      case 'internal': return 'bg-yellow-100 text-yellow-700';
      case 'public': return 'bg-green-100 text-green-700';
      default: return 'bg-slate-100 text-slate-700';
    }
  };

  const getIncidentStatusColor = (status: string) => {
    switch (status) {
      case 'open': return 'bg-red-100 text-red-700';
      case 'investigating': return 'bg-orange-100 text-orange-700';
      case 'resolved': return 'bg-green-100 text-green-700';
      case 'false_positive': return 'bg-slate-100 text-slate-700';
      case 'escalated': return 'bg-purple-100 text-purple-700';
      default: return 'bg-slate-100 text-slate-700';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <div className="text-slate-600">Loading LLM risk profiles...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <MLModelExplainer {...ML_MODELS.llmRiskProfiling} />

      <div className="bg-gradient-to-r from-purple-900 to-indigo-900 rounded-xl p-6 text-white">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold flex items-center space-x-2">
              <Brain className="w-8 h-8" />
              <span>LLM Usage Risk Profiling</span>
            </h2>
            <p className="text-purple-200 mt-2">AI-powered behavioral analysis of corporate LLM interactions</p>
          </div>
          <div className="grid grid-cols-3 gap-6 text-center">
            <div>
              <div className="text-3xl font-bold">{profiles.length}</div>
              <div className="text-purple-200 text-sm">Users Profiled</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-red-300">
                {profiles.filter(p => p.is_escalated).length}
              </div>
              <div className="text-purple-200 text-sm">Escalated</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-orange-300">
                {incidents.filter(i => i.status === 'open' || i.status === 'investigating').length}
              </div>
              <div className="text-purple-200 text-sm">Open Incidents</div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-4 space-y-4">
          <div className="bg-white rounded-xl shadow-lg border border-slate-200">
            <div className="p-4 border-b border-slate-200 bg-slate-50">
              <h3 className="font-bold text-slate-900">User Risk Rankings</h3>
              <p className="text-xs text-slate-600 mt-1">Sorted by current risk score</p>
            </div>
            <div className="max-h-[600px] overflow-y-auto">
              {profiles.length === 0 && !loading && (
                <div className="p-8 text-center text-slate-500">
                  <p>No risk profiles found.</p>
                  <p className="text-sm mt-2">Data should load automatically...</p>
                </div>
              )}
              {profiles.map((profile) => (
                <button
                  key={profile.id}
                  onClick={() => setSelectedProfile(profile)}
                  className={`w-full text-left p-4 border-b border-slate-100 transition-all hover:bg-slate-50 ${
                    selectedProfile?.id === profile.id ? 'bg-blue-50 border-l-4 border-l-blue-500' : ''
                  }`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <div className="font-medium text-slate-900 flex items-center space-x-2">
                        <span>{profile.user_name}</span>
                        {profile.is_escalated && (
                          <AlertTriangle className="w-4 h-4 text-red-500" />
                        )}
                      </div>
                      <div className="text-xs text-slate-600">{profile.department} • {profile.role_title}</div>
                    </div>
                    <div className="flex items-center space-x-2">
                      {getRiskTrendIcon(profile.risk_trend)}
                      <span className={`text-lg font-bold ${
                        profile.current_risk_score >= 70 ? 'text-red-600' :
                        profile.current_risk_score >= 40 ? 'text-orange-600' :
                        profile.current_risk_score >= 20 ? 'text-yellow-600' :
                        'text-green-600'
                      }`}>
                        {profile.current_risk_score}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${getRiskLevelColor(profile.risk_level)}`}>
                      {profile.risk_level.toUpperCase()}
                    </span>
                    <div className="text-xs text-slate-500">
                      {profile.total_interactions} interactions
                    </div>
                  </div>
                  {profile.is_escalated && profile.escalation_reason && (
                    <div className="mt-2 text-xs text-red-600 bg-red-50 rounded px-2 py-1">
                      <AlertCircle className="w-3 h-3 inline mr-1" />
                      {profile.escalation_reason}
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="col-span-8 space-y-4">
          {selectedProfile && (
            <>
              <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-6">
                <div className="flex items-start justify-between mb-6">
                  <div>
                    <h3 className="text-2xl font-bold text-slate-900">{selectedProfile.user_name}</h3>
                    <p className="text-slate-600">{selectedProfile.user_email}</p>
                    <p className="text-sm text-slate-500">{selectedProfile.department} • {selectedProfile.role_title}</p>
                  </div>
                  <div className="text-right">
                    <div className={`inline-block px-4 py-2 rounded-lg ${getRiskLevelColor(selectedProfile.risk_level)}`}>
                      <div className="text-3xl font-bold">{selectedProfile.current_risk_score}</div>
                      <div className="text-sm">Risk Score</div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-5 gap-4">
                  <div className="bg-gradient-to-br from-red-50 to-red-100 rounded-lg p-4 border border-red-200">
                    <div className="flex items-center justify-between mb-2">
                      <Eye className="w-5 h-5 text-red-600" />
                      <span className="text-2xl font-bold text-red-700">{selectedProfile.pii_exposure_risk}</span>
                    </div>
                    <div className="text-xs font-medium text-red-600">PII Exposure</div>
                  </div>

                  <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg p-4 border border-purple-200">
                    <div className="flex items-center justify-between mb-2">
                      <Lock className="w-5 h-5 text-purple-600" />
                      <span className="text-2xl font-bold text-purple-700">{selectedProfile.credential_exposure_risk}</span>
                    </div>
                    <div className="text-xs font-medium text-purple-600">Credentials</div>
                  </div>

                  <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-lg p-4 border border-orange-200">
                    <div className="flex items-center justify-between mb-2">
                      <Shield className="w-5 h-5 text-orange-600" />
                      <span className="text-2xl font-bold text-orange-700">{selectedProfile.data_exfiltration_risk}</span>
                    </div>
                    <div className="text-xs font-medium text-orange-600">Exfiltration</div>
                  </div>

                  <div className="bg-gradient-to-br from-yellow-50 to-yellow-100 rounded-lg p-4 border border-yellow-200">
                    <div className="flex items-center justify-between mb-2">
                      <AlertTriangle className="w-5 h-5 text-yellow-600" />
                      <span className="text-2xl font-bold text-yellow-700">{selectedProfile.policy_violation_risk}</span>
                    </div>
                    <div className="text-xs font-medium text-yellow-600">Policy Violations</div>
                  </div>

                  <div className="bg-gradient-to-br from-pink-50 to-pink-100 rounded-lg p-4 border border-pink-200">
                    <div className="flex items-center justify-between mb-2">
                      <Code className="w-5 h-5 text-pink-600" />
                      <span className="text-2xl font-bold text-pink-700">{selectedProfile.jailbreak_attempt_risk}</span>
                    </div>
                    <div className="text-xs font-medium text-pink-600">Jailbreak</div>
                  </div>
                </div>

                <div className="mt-6 grid grid-cols-3 gap-4 pt-4 border-t border-slate-200">
                  <div>
                    <div className="text-sm text-slate-500">Total Interactions</div>
                    <div className="text-2xl font-bold text-slate-900">{selectedProfile.total_interactions}</div>
                  </div>
                  <div>
                    <div className="text-sm text-slate-500">High Risk</div>
                    <div className="text-2xl font-bold text-red-600">{selectedProfile.high_risk_interactions}</div>
                  </div>
                  <div>
                    <div className="text-sm text-slate-500">Flagged</div>
                    <div className="text-2xl font-bold text-orange-600">{selectedProfile.flagged_interactions}</div>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-lg border border-slate-200">
                <div className="border-b border-slate-200">
                  <div className="flex space-x-1 p-2">
                    {[
                      { id: 'overview', label: 'Overview' },
                      { id: 'psychology', label: 'Psychological Profile' },
                      { id: 'interactions', label: 'Recent Interactions' },
                      { id: 'incidents', label: 'Incidents' }
                    ].map((tab) => (
                      <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as any)}
                        className={`px-4 py-2 rounded-lg font-medium text-sm transition-all ${
                          activeTab === tab.id
                            ? 'bg-blue-100 text-blue-700 shadow-sm'
                            : 'text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="p-6">
                  {activeTab === 'overview' && (
                    <div className="space-y-4">
                      <h4 className="font-bold text-slate-900">Behavioral Pattern Analysis</h4>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="border border-slate-200 rounded-lg p-4">
                          <div className="text-sm font-medium text-slate-700 mb-2">Risk Trend</div>
                          <div className="flex items-center space-x-2">
                            {getRiskTrendIcon(selectedProfile.risk_trend)}
                            <span className="text-lg font-bold text-slate-900 capitalize">
                              {selectedProfile.risk_trend.replace('_', ' ')}
                            </span>
                          </div>
                        </div>
                        <div className="border border-slate-200 rounded-lg p-4">
                          <div className="text-sm font-medium text-slate-700 mb-2">Anomalous Behavior</div>
                          <div className="flex items-center space-x-2">
                            {selectedProfile.has_anomalous_behavior ? (
                              <>
                                <AlertTriangle className="w-5 h-5 text-red-500" />
                                <span className="text-lg font-bold text-red-600">Detected</span>
                              </>
                            ) : (
                              <>
                                <Shield className="w-5 h-5 text-green-500" />
                                <span className="text-lg font-bold text-green-600">Normal</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      {selectedProfile.is_escalated && (
                        <div className="bg-red-50 border-l-4 border-red-500 rounded-r-lg p-4">
                          <div className="flex items-start space-x-3">
                            <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5" />
                            <div className="flex-1">
                              <div className="font-bold text-red-900">Escalated for Investigation</div>
                              <div className="text-sm text-red-700 mt-1">{selectedProfile.escalation_reason}</div>
                              {selectedProfile.escalated_at && (
                                <div className="text-xs text-red-600 mt-2">
                                  Escalated {new Date(selectedProfile.escalated_at).toLocaleString()}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {activeTab === 'interactions' && (
                    <div className="space-y-3">
                      {interactions.map((interaction) => (
                        <div key={interaction.id} className="border border-slate-200 rounded-lg p-4 hover:bg-slate-50 transition-all">
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex-1">
                              <div className="flex items-center space-x-2 mb-2">
                                <Clock className="w-4 h-4 text-slate-400" />
                                <span className="text-sm text-slate-600">
                                  {new Date(interaction.timestamp).toLocaleString()}
                                </span>
                                <span className={`text-xs px-2 py-1 rounded-full ${getSensitivityColor(interaction.data_sensitivity_level)}`}>
                                  {interaction.data_sensitivity_level}
                                </span>
                                {interaction.flagged_for_review && (
                                  <span className="text-xs px-2 py-1 rounded-full bg-red-100 text-red-700">
                                    Flagged
                                  </span>
                                )}
                              </div>
                              <div className="text-sm text-slate-900 font-mono bg-slate-50 rounded p-2 mb-2">
                                {interaction.prompt_text.substring(0, 200)}
                                {interaction.prompt_text.length > 200 && '...'}
                              </div>
                              <div className="flex items-center space-x-4 text-xs text-slate-500">
                                <span>{interaction.model_name}</span>
                                <span>{interaction.prompt_tokens} tokens</span>
                                <span>{interaction.geo_location}</span>
                              </div>
                            </div>
                            <div className="text-right ml-4">
                              <div className={`text-2xl font-bold ${
                                interaction.interaction_risk_score >= 70 ? 'text-red-600' :
                                interaction.interaction_risk_score >= 40 ? 'text-orange-600' :
                                'text-green-600'
                              }`}>
                                {interaction.interaction_risk_score}
                              </div>
                              <div className="text-xs text-slate-500">Risk Score</div>
                            </div>
                          </div>
                          {(interaction.contains_pii || interaction.contains_credentials || interaction.contains_proprietary_data ||
                            interaction.is_jailbreak_attempt || interaction.is_data_exfiltration) && (
                            <div className="flex flex-wrap gap-2 mt-2">
                              {interaction.contains_pii && (
                                <span className="text-xs px-2 py-1 rounded-full bg-yellow-100 text-yellow-700">
                                  Contains PII
                                </span>
                              )}
                              {interaction.contains_credentials && (
                                <span className="text-xs px-2 py-1 rounded-full bg-red-100 text-red-700">
                                  Credentials
                                </span>
                              )}
                              {interaction.contains_proprietary_data && (
                                <span className="text-xs px-2 py-1 rounded-full bg-orange-100 text-orange-700">
                                  Proprietary
                                </span>
                              )}
                              {interaction.is_jailbreak_attempt && (
                                <span className="text-xs px-2 py-1 rounded-full bg-purple-100 text-purple-700">
                                  Jailbreak Attempt
                                </span>
                              )}
                              {interaction.is_data_exfiltration && (
                                <span className="text-xs px-2 py-1 rounded-full bg-red-100 text-red-700">
                                  Data Exfiltration
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {activeTab === 'incidents' && (
                    <div className="space-y-3">
                      {incidents.map((incident) => (
                        <div key={incident.id} className="border-2 border-slate-200 rounded-lg p-4 hover:border-blue-300 transition-all">
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex-1">
                              <div className="flex items-center space-x-2 mb-2">
                                <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                                  incident.severity === 'critical' ? 'bg-red-500 text-white' :
                                  incident.severity === 'high' ? 'bg-orange-500 text-white' :
                                  incident.severity === 'medium' ? 'bg-yellow-500 text-white' :
                                  'bg-blue-500 text-white'
                                }`}>
                                  {incident.severity.toUpperCase()}
                                </span>
                                <span className={`text-xs px-2 py-1 rounded-full ${getIncidentStatusColor(incident.status)}`}>
                                  {incident.status}
                                </span>
                                <span className="text-xs text-slate-500">Priority {incident.priority}</span>
                              </div>
                              <div className="font-bold text-slate-900 mb-1">{incident.title}</div>
                              <div className="text-sm text-slate-600 mb-2">{incident.description}</div>
                              <div className="text-xs text-slate-500">
                                {new Date(incident.created_at).toLocaleString()}
                              </div>
                            </div>
                            <div className="text-right ml-4">
                              <div className="text-2xl font-bold text-red-600">{incident.risk_score}</div>
                              <div className="text-xs text-slate-500">Risk Score</div>
                            </div>
                          </div>
                          <div className="mt-2 pt-2 border-t border-slate-200">
                            <span className="text-xs text-slate-600 capitalize">
                              Type: {incident.incident_type.replace('_', ' ')}
                            </span>
                          </div>
                        </div>
                      ))}
                      {incidents.length === 0 && (
                        <div className="text-center text-slate-500 py-8">
                          No incidents recorded for this user
                        </div>
                      )}
                    </div>
                  )}

                  {activeTab === 'psychology' && (
                    psychProfile ? (
                    <div className="space-y-6">
                      {commSources && (
                        <div className="bg-gradient-to-r from-blue-50 to-cyan-50 rounded-xl p-6 border border-blue-200">
                          <h4 className="font-bold text-slate-900 text-lg mb-4">Multi-Source Behavioral Analysis</h4>
                          <div className="text-sm text-slate-600 mb-4">
                            Psychological profile based on {commSources.total_emails_analyzed + commSources.total_slack_messages_analyzed + commSources.total_teams_messages_analyzed + commSources.total_meetings_analyzed} data points across multiple platforms
                          </div>
                          <div className="grid grid-cols-5 gap-3">
                            <div className="bg-white rounded-lg p-4 border border-blue-200">
                              <div className="text-xs text-slate-600 mb-1">Email Analysis</div>
                              <div className="text-2xl font-bold text-blue-600">{commSources.total_emails_analyzed.toLocaleString()}</div>
                              <div className="text-xs text-green-600 mt-1">{commSources.email_connected ? '✓ Connected' : '✗ Disconnected'}</div>
                            </div>
                            <div className="bg-white rounded-lg p-4 border border-purple-200">
                              <div className="text-xs text-slate-600 mb-1">Slack Messages</div>
                              <div className="text-2xl font-bold text-purple-600">{commSources.total_slack_messages_analyzed.toLocaleString()}</div>
                              <div className="text-xs text-green-600 mt-1">{commSources.slack_connected ? '✓ Connected' : '✗ Disconnected'}</div>
                            </div>
                            <div className="bg-white rounded-lg p-4 border border-indigo-200">
                              <div className="text-xs text-slate-600 mb-1">Teams Messages</div>
                              <div className="text-2xl font-bold text-indigo-600">{commSources.total_teams_messages_analyzed.toLocaleString()}</div>
                              <div className="text-xs text-green-600 mt-1">{commSources.teams_connected ? '✓ Connected' : '✗ Disconnected'}</div>
                            </div>
                            <div className="bg-white rounded-lg p-4 border border-green-200">
                              <div className="text-xs text-slate-600 mb-1">Meetings</div>
                              <div className="text-2xl font-bold text-green-600">{commSources.total_meetings_analyzed}</div>
                              <div className="text-xs text-green-600 mt-1">{commSources.zoom_connected ? '✓ Connected' : '✗ Disconnected'}</div>
                            </div>
                            <div className="bg-white rounded-lg p-4 border border-orange-200">
                              <div className="text-xs text-slate-600 mb-1">LLM Interactions</div>
                              <div className="text-2xl font-bold text-orange-600">{selectedProfile.total_interactions}</div>
                              <div className="text-xs text-green-600 mt-1">✓ Tracked</div>
                            </div>
                          </div>
                        </div>
                      )}

                      {crossPlatformPatterns.length > 0 && (
                        <div className="bg-white rounded-xl border border-red-200 p-6">
                          <h4 className="font-bold text-slate-900 text-lg mb-4 flex items-center space-x-2">
                            <AlertTriangle className="w-6 h-6 text-red-600" />
                            <span>Cross-Platform Behavioral Patterns</span>
                          </h4>
                          <div className="space-y-3">
                            {crossPlatformPatterns.map((pattern) => (
                              <div key={pattern.id} className="border-2 border-slate-200 rounded-lg p-4 hover:border-red-300 transition-all">
                                <div className="flex items-start justify-between mb-3">
                                  <div className="flex-1">
                                    <div className="flex items-center space-x-2 mb-2">
                                      <span className={`text-xs px-2 py-1 rounded-full font-bold ${
                                        pattern.severity === 'critical' ? 'bg-red-500 text-white' :
                                        pattern.severity === 'high' ? 'bg-orange-500 text-white' :
                                        pattern.severity === 'medium' ? 'bg-yellow-500 text-white' :
                                        'bg-blue-500 text-white'
                                      }`}>
                                        {pattern.severity.toUpperCase()}
                                      </span>
                                      <span className="text-xs px-2 py-1 rounded-full bg-slate-100 text-slate-700 capitalize">
                                        {pattern.pattern_type.replace(/_/g, ' ')}
                                      </span>
                                      <span className={`text-xs px-2 py-1 rounded-full ${
                                        pattern.trend === 'rapidly_worsening' || pattern.trend === 'worsening' ? 'bg-red-100 text-red-700' :
                                        pattern.trend === 'improving' ? 'bg-green-100 text-green-700' :
                                        'bg-slate-100 text-slate-700'
                                      }`}>
                                        Trend: {pattern.trend.replace(/_/g, ' ')}
                                      </span>
                                      {pattern.requires_intervention && (
                                        <span className="text-xs px-2 py-1 rounded-full bg-red-100 text-red-700 font-bold">
                                          ⚠ Requires Intervention
                                        </span>
                                      )}
                                    </div>
                                    <div className="font-bold text-slate-900 mb-2">{pattern.pattern_name}</div>
                                    <div className="text-sm text-slate-600 mb-3">{pattern.description}</div>
                                    <div className="flex items-center space-x-4 text-xs">
                                      <div className="flex items-center space-x-1">
                                        <span className="text-slate-500">Email:</span>
                                        <span className="font-bold text-blue-600">{pattern.email_evidence_count}</span>
                                      </div>
                                      <div className="flex items-center space-x-1">
                                        <span className="text-slate-500">Slack:</span>
                                        <span className="font-bold text-purple-600">{pattern.slack_evidence_count}</span>
                                      </div>
                                      <div className="flex items-center space-x-1">
                                        <span className="text-slate-500">Teams:</span>
                                        <span className="font-bold text-indigo-600">{pattern.teams_evidence_count}</span>
                                      </div>
                                      <div className="flex items-center space-x-1">
                                        <span className="text-slate-500">Meetings:</span>
                                        <span className="font-bold text-green-600">{pattern.meetings_evidence_count}</span>
                                      </div>
                                      <div className="flex items-center space-x-1">
                                        <span className="text-slate-500">LLM:</span>
                                        <span className="font-bold text-orange-600">{pattern.llm_evidence_count}</span>
                                      </div>
                                    </div>
                                    {(pattern.flagged_for_hr || pattern.flagged_for_security) && (
                                      <div className="mt-2 flex items-center space-x-2">
                                        {pattern.flagged_for_hr && (
                                          <span className="text-xs px-2 py-1 rounded bg-yellow-100 text-yellow-700">
                                            Flagged for HR
                                          </span>
                                        )}
                                        {pattern.flagged_for_security && (
                                          <span className="text-xs px-2 py-1 rounded bg-red-100 text-red-700">
                                            Flagged for Security
                                          </span>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                  <div className="text-right ml-4">
                                    <div className="text-3xl font-bold text-purple-600">{pattern.confidence_level}%</div>
                                    <div className="text-xs text-slate-500">Confidence</div>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="bg-gradient-to-r from-purple-50 to-indigo-50 rounded-xl p-6 border border-purple-200">
                        <h4 className="font-bold text-slate-900 text-lg mb-4 flex items-center space-x-2">
                          <Brain className="w-6 h-6 text-purple-600" />
                          <span>Psychological Risk Assessment</span>
                        </h4>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="bg-white rounded-lg p-4 border border-purple-200">
                            <div className="text-sm text-slate-600 mb-2">Overall Psychological Risk</div>
                            <div className="flex items-center space-x-3">
                              <div className={`text-4xl font-bold ${
                                psychProfile.overall_psychological_risk_score >= 70 ? 'text-red-600' :
                                psychProfile.overall_psychological_risk_score >= 40 ? 'text-orange-600' :
                                'text-green-600'
                              }`}>
                                {psychProfile.overall_psychological_risk_score}
                              </div>
                              <div>
                                <div className={`text-sm font-bold capitalize ${
                                  psychProfile.risk_classification === 'critical' ? 'text-red-600' :
                                  psychProfile.risk_classification === 'high' || psychProfile.risk_classification === 'elevated' ? 'text-orange-600' :
                                  psychProfile.risk_classification === 'moderate' ? 'text-yellow-600' :
                                  'text-green-600'
                                }`}>
                                  {psychProfile.risk_classification}
                                </div>
                                <div className="text-xs text-slate-500">Classification</div>
                              </div>
                            </div>
                          </div>
                          <div className="bg-white rounded-lg p-4 border border-purple-200">
                            <div className="text-sm text-slate-600 mb-2">Profile Confidence</div>
                            <div className="text-4xl font-bold text-purple-600">{psychProfile.confidence_score}%</div>
                            <div className="text-xs text-slate-500">Based on {selectedProfile.total_interactions} interactions</div>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-6">
                        <div className="bg-white rounded-xl border border-slate-200 p-6">
                          <h5 className="font-bold text-slate-900 mb-4">Big Five Personality Traits (OCEAN)</h5>
                          <div className="space-y-3">
                            {[
                              { label: 'Openness', score: psychProfile.openness_score, desc: 'Curiosity, creativity, willingness to try new things' },
                              { label: 'Conscientiousness', score: psychProfile.conscientiousness_score, desc: 'Organization, responsibility, planning' },
                              { label: 'Extraversion', score: psychProfile.extraversion_score, desc: 'Sociability, energy, assertiveness' },
                              { label: 'Agreeableness', score: psychProfile.agreeableness_score, desc: 'Compassion, cooperation, trust' },
                              { label: 'Neuroticism', score: psychProfile.neuroticism_score, desc: 'Emotional instability, anxiety, moodiness' }
                            ].map((trait) => (
                              <div key={trait.label}>
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-sm font-medium text-slate-700">{trait.label}</span>
                                  <span className="text-sm font-bold text-slate-900">{trait.score}</span>
                                </div>
                                <div className="w-full bg-slate-200 rounded-full h-2">
                                  <div
                                    className={`h-2 rounded-full ${
                                      trait.score >= 70 ? 'bg-blue-600' :
                                      trait.score >= 40 ? 'bg-blue-400' :
                                      'bg-blue-300'
                                    }`}
                                    style={{ width: `${trait.score}%` }}
                                  />
                                </div>
                                <div className="text-xs text-slate-500 mt-1">{trait.desc}</div>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="bg-white rounded-xl border border-red-200 p-6">
                          <h5 className="font-bold text-slate-900 mb-4 flex items-center space-x-2">
                            <AlertTriangle className="w-5 h-5 text-red-600" />
                            <span>Dark Triad Assessment</span>
                          </h5>
                          <div className="space-y-3">
                            {[
                              { label: 'Narcissism', score: psychProfile.narcissism_score, desc: 'Grandiosity, need for admiration, lack of empathy' },
                              { label: 'Machiavellianism', score: psychProfile.machiavellianism_score, desc: 'Manipulation, exploitation, pragmatic morality' },
                              { label: 'Psychopathy', score: psychProfile.psychopathy_score, desc: 'Callousness, impulsivity, antisocial behavior' }
                            ].map((trait) => (
                              <div key={trait.label}>
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-sm font-medium text-slate-700">{trait.label}</span>
                                  <span className={`text-sm font-bold ${
                                    trait.score >= 60 ? 'text-red-600' :
                                    trait.score >= 30 ? 'text-orange-600' :
                                    'text-green-600'
                                  }`}>{trait.score}</span>
                                </div>
                                <div className="w-full bg-slate-200 rounded-full h-2">
                                  <div
                                    className={`h-2 rounded-full ${
                                      trait.score >= 60 ? 'bg-red-600' :
                                      trait.score >= 30 ? 'bg-orange-500' :
                                      'bg-green-500'
                                    }`}
                                    style={{ width: `${trait.score}%` }}
                                  />
                                </div>
                                <div className="text-xs text-slate-500 mt-1">{trait.desc}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-4">
                        <div className="bg-gradient-to-br from-red-50 to-red-100 rounded-lg p-4 border border-red-200">
                          <div className="text-sm font-medium text-red-700 mb-2">Insider Threat Risk</div>
                          <div className="text-3xl font-bold text-red-600">{psychProfile.insider_threat_score}</div>
                          {psychProfile.is_potential_insider_threat && (
                            <div className="mt-2 text-xs bg-red-200 text-red-800 px-2 py-1 rounded">
                              <AlertTriangle className="w-3 h-3 inline mr-1" />
                              Potential Threat
                            </div>
                          )}
                        </div>

                        <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg p-4 border border-purple-200">
                          <div className="text-sm font-medium text-purple-700 mb-2">Manipulation Tendency</div>
                          <div className="text-3xl font-bold text-purple-600">{psychProfile.manipulation_tendency_score}</div>
                        </div>

                        <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-lg p-4 border border-orange-200">
                          <div className="text-sm font-medium text-orange-700 mb-2">Deception Likelihood</div>
                          <div className="text-3xl font-bold text-orange-600">{psychProfile.deception_likelihood_score}</div>
                        </div>

                        <div className="bg-gradient-to-br from-yellow-50 to-yellow-100 rounded-lg p-4 border border-yellow-200">
                          <div className="text-sm font-medium text-yellow-700 mb-2">Impulsivity</div>
                          <div className="text-3xl font-bold text-yellow-600">{psychProfile.impulsivity_score}</div>
                        </div>

                        <div className="bg-gradient-to-br from-pink-50 to-pink-100 rounded-lg p-4 border border-pink-200">
                          <div className="text-sm font-medium text-pink-700 mb-2">Aggression Level</div>
                          <div className="text-3xl font-bold text-pink-600">{psychProfile.aggression_score}</div>
                        </div>

                        <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4 border border-blue-200">
                          <div className="text-sm font-medium text-blue-700 mb-2">Emotional Stability</div>
                          <div className="text-3xl font-bold text-blue-600">{psychProfile.emotional_stability}</div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="bg-white rounded-xl border border-slate-200 p-4">
                          <h5 className="font-bold text-slate-900 mb-3">Emotional & Mental State</h5>
                          <div className="grid grid-cols-2 gap-3">
                            <div className="border border-slate-200 rounded p-3">
                              <div className="text-xs text-slate-600 mb-1">Stress Level</div>
                              <div className={`text-2xl font-bold ${
                                psychProfile.stress_level >= 70 ? 'text-red-600' :
                                psychProfile.stress_level >= 40 ? 'text-orange-600' :
                                'text-green-600'
                              }`}>{psychProfile.stress_level}</div>
                            </div>
                            <div className="border border-slate-200 rounded p-3">
                              <div className="text-xs text-slate-600 mb-1">Burnout Risk</div>
                              <div className={`text-2xl font-bold ${
                                psychProfile.burnout_risk >= 70 ? 'text-red-600' :
                                psychProfile.burnout_risk >= 40 ? 'text-orange-600' :
                                'text-green-600'
                              }`}>{psychProfile.burnout_risk}</div>
                            </div>
                            <div className="border border-slate-200 rounded p-3">
                              <div className="text-xs text-slate-600 mb-1">Frustration</div>
                              <div className={`text-2xl font-bold ${
                                psychProfile.frustration_level >= 70 ? 'text-red-600' :
                                psychProfile.frustration_level >= 40 ? 'text-orange-600' :
                                'text-green-600'
                              }`}>{psychProfile.frustration_level}</div>
                            </div>
                            <div className="border border-slate-200 rounded p-3">
                              <div className="text-xs text-slate-600 mb-1">Dominant Emotion</div>
                              <div className="text-sm font-bold text-slate-900 capitalize">{psychProfile.dominant_emotion.replace('_', ' ')}</div>
                            </div>
                          </div>
                        </div>

                        <div className="bg-white rounded-xl border border-slate-200 p-4">
                          <h5 className="font-bold text-slate-900 mb-3">Communication Analysis</h5>
                          <div className="space-y-3">
                            <div>
                              <div className="text-sm text-slate-600">Writing Style</div>
                              <div className="text-lg font-bold text-slate-900 capitalize">{psychProfile.communication_style.replace('_', ' ')}</div>
                            </div>
                            <div>
                              <div className="text-sm text-slate-600">Linguistic Complexity</div>
                              <div className="text-lg font-bold text-slate-900 capitalize">{psychProfile.linguistic_complexity}</div>
                            </div>
                            <div>
                              <div className="text-sm text-slate-600">Urgency Level</div>
                              <div className="text-lg font-bold text-slate-900 capitalize">{psychProfile.writing_urgency_level.replace('_', ' ')}</div>
                            </div>
                            <div>
                              <div className="text-sm text-slate-600">Sentiment Trend</div>
                              <div className="text-lg font-bold text-slate-900 capitalize">{psychProfile.sentiment_trend.replace('_', ' ')}</div>
                            </div>
                          </div>
                        </div>
                      </div>

                      {psychRiskFactors.length > 0 && (
                        <div className="bg-white rounded-xl border border-red-200 p-6">
                          <h5 className="font-bold text-slate-900 mb-4 flex items-center space-x-2">
                            <AlertCircle className="w-5 h-5 text-red-600" />
                            <span>Identified Psychological Risk Factors</span>
                          </h5>
                          <div className="space-y-3">
                            {psychRiskFactors.map((factor) => (
                              <div key={factor.id} className="border-2 border-slate-200 rounded-lg p-4 hover:border-red-300 transition-all">
                                <div className="flex items-start justify-between mb-2">
                                  <div className="flex-1">
                                    <div className="flex items-center space-x-2 mb-2">
                                      <span className={`text-xs px-2 py-1 rounded-full font-bold ${
                                        factor.severity === 'critical' ? 'bg-red-500 text-white' :
                                        factor.severity === 'high' ? 'bg-orange-500 text-white' :
                                        factor.severity === 'medium' ? 'bg-yellow-500 text-white' :
                                        'bg-blue-500 text-white'
                                      }`}>
                                        {factor.severity.toUpperCase()}
                                      </span>
                                      <span className="text-xs px-2 py-1 rounded-full bg-purple-100 text-purple-700 capitalize">
                                        {factor.factor_type.replace('_', ' ')}
                                      </span>
                                      {factor.requires_escalation && (
                                        <span className="text-xs px-2 py-1 rounded-full bg-red-100 text-red-700">
                                          Requires Escalation
                                        </span>
                                      )}
                                    </div>
                                    <div className="font-bold text-slate-900 mb-1">{factor.factor_name}</div>
                                    <div className="text-sm text-slate-600">{factor.description}</div>
                                  </div>
                                  <div className="text-right ml-4">
                                    <div className="text-2xl font-bold text-purple-600">{factor.confidence_level}%</div>
                                    <div className="text-xs text-slate-500">Confidence</div>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                    ) : (
                      <div className="text-center py-12">
                        <Brain className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                        <div className="text-slate-600 font-medium mb-2">No Psychological Profile Available</div>
                        <div className="text-sm text-slate-500">
                          Psychological profiling data not found for this user.
                        </div>
                        <div className="text-xs text-slate-400 mt-2">
                          User ID: {selectedProfile?.user_id}
                        </div>
                      </div>
                    )
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
