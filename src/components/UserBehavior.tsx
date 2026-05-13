import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { User, Activity, MapPin, Monitor, AlertTriangle, CheckCircle, Clock, Shield, Eye, XCircle, Network, Brain, LineChart } from 'lucide-react';
import UserEventNetwork from './UserEventNetwork';
import MLModelExplainer from './MLModelExplainer';
import { ML_MODELS } from '../lib/mlModelData';
import { UnifiedRiskHeader } from './user-behavior/UnifiedRiskHeader';
import { LLMRiskUserDetail } from './user-behavior/LLMRiskUserDetail';
import { PsychologicalUserDetail } from './user-behavior/PsychologicalUserDetail';
import { CrossDomainStrip } from './user-behavior/CrossDomainStrip';

interface UnifiedRow {
  behavior_profile_id: string;
  auth_user_id: string;
  full_name: string;
  email: string;
  behavior_department: string | null;
  title: string | null;
  clearance_level: string | null;
  profile_picture_url: string | null;
  behavior_risk_score: number;
  behavior_status: string;
  llm_risk_score: number | null;
  llm_high_risk_interactions: number | null;
  llm_is_escalated: boolean | null;
  psych_risk_score: number | null;
  psych_insider_threat: boolean | null;
  composite_risk_score: number;
  has_llm_data: boolean;
  has_psych_data: boolean;
}

interface BehaviorEvent {
  id: string;
  user_profile_id: string;
  event_type: string;
  event_category: string;
  timestamp: string;
  location: string;
  device: string;
  ip_address: string;
  action: string;
  resource_accessed: string;
  outcome: string;
  anomaly_score: number;
  details: any;
}

interface RiskAssessment {
  id: string;
  user_profile_id: string;
  risk_score: number;
  risk_level: string;
  risk_factors: any[];
}

interface Correlation {
  id: string;
  user_profile_id: string;
  correlation_type: string;
  correlation_score: number;
  description: string;
  severity: string;
  detected_at: string;
}

type TabId = 'timeline' | 'network' | 'llm' | 'psychology' | 'risk';

const UserBehavior = () => {
  const [users, setUsers] = useState<UnifiedRow[]>([]);
  const [selectedUser, setSelectedUser] = useState<UnifiedRow | null>(null);
  const [events, setEvents] = useState<BehaviorEvent[]>([]);
  const [riskAssessment, setRiskAssessment] = useState<RiskAssessment | null>(null);
  const [correlations, setCorrelations] = useState<Correlation[]>([]);
  const [psychFactorCount, setPsychFactorCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabId>('timeline');

  useEffect(() => {
    fetchUsers();
  }, []);

  useEffect(() => {
    if (!selectedUser) return;
    fetchUserData(selectedUser.behavior_profile_id);
    fetchPsychFactorCount(selectedUser.email);

    const eventsSubscription = supabase
      .channel(`user_behavior_events_${selectedUser.behavior_profile_id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'user_behavior_events',
        filter: `user_profile_id=eq.${selectedUser.behavior_profile_id}`
      }, (payload) => {
        setEvents((prev) => [payload.new as BehaviorEvent, ...prev].slice(0, 20));
      })
      .subscribe();

    return () => { eventsSubscription.unsubscribe(); };
  }, [selectedUser]);

  const fetchUsers = async () => {
    try {
      const { data, error } = await supabase
        .from('unified_user_risk')
        .select('*')
        .order('composite_risk_score', { ascending: false });

      if (error) throw error;
      const rows = (data || []) as UnifiedRow[];
      setUsers(rows);
      if (rows.length > 0) setSelectedUser(rows[0]);
    } catch (e) {
      console.error('Error fetching unified users:', e);
    } finally {
      setLoading(false);
    }
  };

  const fetchUserData = async (behaviorProfileId: string) => {
    try {
      const [eventsResult, riskResult, correlationsResult] = await Promise.all([
        supabase.from('user_behavior_events').select('*').eq('user_profile_id', behaviorProfileId).order('timestamp', { ascending: false }).limit(20),
        supabase.from('user_risk_assessments').select('*').eq('user_profile_id', behaviorProfileId).order('assessment_time', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('behavior_correlations').select('*').eq('user_profile_id', behaviorProfileId).order('detected_at', { ascending: false }),
      ]);

      setEvents(eventsResult.data || []);
      setRiskAssessment(riskResult.data);
      setCorrelations(correlationsResult.data || []);
    } catch (e) {
      console.error('Error fetching user data:', e);
    }
  };

  const fetchPsychFactorCount = async (email: string) => {
    const { data: llmRow } = await supabase
      .from('llm_risk_profiles')
      .select('user_id')
      .ilike('user_email', email)
      .maybeSingle();
    if (!llmRow) { setPsychFactorCount(0); return; }
    const { count } = await supabase
      .from('psychological_risk_factors')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', llmRow.user_id);
    setPsychFactorCount(count || 0);
  };

  const getRiskColor = (score: number) => {
    if (score >= 70) return 'text-red-400 bg-red-500/20 border-red-500';
    if (score >= 40) return 'text-orange-400 bg-orange-500/20 border-orange-500';
    if (score >= 20) return 'text-yellow-400 bg-yellow-500/20 border-yellow-500';
    return 'text-emerald-400 bg-emerald-500/20 border-emerald-500';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'text-emerald-400';
      case 'investigation': return 'text-red-400';
      case 'suspended': return 'text-slate-400';
      default: return 'text-slate-500';
    }
  };

  const getCategoryIcon = (category: string) => {
    if (category === 'physical') return <MapPin className="w-4 h-4" />;
    if (category === 'logical') return <Monitor className="w-4 h-4" />;
    return <Activity className="w-4 h-4" />;
  };

  const getOutcomeIcon = (outcome: string, anomalyScore: number) => {
    if (anomalyScore > 70) return <AlertTriangle className="w-4 h-4 text-red-400" />;
    if (outcome === 'success') return <CheckCircle className="w-4 h-4 text-emerald-400" />;
    if (outcome === 'denied') return <XCircle className="w-4 h-4 text-red-400" />;
    return <Clock className="w-4 h-4 text-yellow-400" />;
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const diffMs = Date.now() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    return date.toLocaleString();
  };

  const behaviorAnomalies = events.filter((e) => e.anomaly_score > 70).length;
  const llmHighRisk = selectedUser?.llm_high_risk_interactions || 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-white">Loading user behavior data...</div>
      </div>
    );
  }

  const tabs: Array<{ id: TabId; label: string; icon: any; disabled?: boolean }> = [
    { id: 'timeline', label: 'Activity Timeline', icon: Activity },
    { id: 'network', label: 'Event Network', icon: Network },
    { id: 'llm', label: 'LLM Risk', icon: Brain, disabled: !selectedUser?.has_llm_data },
    { id: 'psychology', label: 'Psychological', icon: Eye, disabled: !selectedUser?.has_psych_data },
    { id: 'risk', label: 'Risk Analysis', icon: LineChart },
  ];

  return (
    <div className="h-full bg-slate-950 text-white p-6 overflow-hidden flex flex-col">
      <MLModelExplainer {...ML_MODELS.userBehavior} />

      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <User className="w-8 h-8 text-blue-400" />
            <span>User Behavior Analytics</span>
          </h1>
          <p className="text-slate-400 mt-1 text-sm">Unified identity view: behavior, LLM, psychological, and physical signals</p>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 bg-blue-500/10 border border-blue-500/30 rounded-lg">
          <Activity className="w-5 h-5 text-blue-400 animate-pulse" />
          <span className="text-blue-400 font-semibold">Live Tracking</span>
        </div>
      </div>

      <div className="flex-1 grid grid-cols-12 gap-6 overflow-hidden">
        <div className="col-span-3 bg-slate-900/50 border border-slate-700 rounded-lg p-4 overflow-hidden flex flex-col">
          <h2 className="text-sm font-semibold mb-3 flex items-center gap-2 uppercase tracking-wide text-slate-300">
            <Shield className="w-4 h-4 text-blue-400" />
            <span>Users</span>
            <span className="ml-auto text-xs text-slate-400 font-normal normal-case">{users.length}</span>
          </h2>
          <div className="space-y-2 overflow-y-auto flex-1 pr-1">
            {users.map((u) => (
              <div
                key={u.behavior_profile_id}
                onClick={() => setSelectedUser(u)}
                className={`p-3 rounded-lg border cursor-pointer transition-all ${
                  selectedUser?.behavior_profile_id === u.behavior_profile_id
                    ? 'bg-slate-700 border-blue-500'
                    : 'bg-slate-800/50 border-slate-700 hover:border-blue-600'
                }`}
              >
                <div className="flex items-center gap-3 mb-2">
                  {u.profile_picture_url && (
                    <img src={u.profile_picture_url} alt={u.full_name} className="w-10 h-10 rounded-full border-2 border-slate-600" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">{u.full_name}</p>
                    <p className="text-xs text-slate-400 truncate">{u.title || u.behavior_department}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className={`text-xs px-2 py-1 rounded border ${getRiskColor(u.composite_risk_score)}`}>
                    {u.composite_risk_score.toFixed(0)}
                  </span>
                  <div className="flex items-center gap-1">
                    {u.has_llm_data && <Brain className="w-3 h-3 text-blue-400" />}
                    {u.has_psych_data && <Eye className="w-3 h-3 text-amber-400" />}
                    <span className={`text-xs capitalize ${getStatusColor(u.behavior_status)}`}>{u.behavior_status}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="col-span-9 flex flex-col gap-4 overflow-hidden">
          {!selectedUser ? (
            <div className="flex items-center justify-center h-full text-slate-500">Select a user</div>
          ) : (
            <>
              <UnifiedRiskHeader
                fullName={selectedUser.full_name}
                title={selectedUser.title || undefined}
                department={selectedUser.behavior_department || undefined}
                email={selectedUser.email}
                profilePictureUrl={selectedUser.profile_picture_url || undefined}
                behaviorRisk={selectedUser.behavior_risk_score}
                llmRisk={selectedUser.llm_risk_score}
                psychRisk={selectedUser.psych_risk_score}
                hasLlmData={selectedUser.has_llm_data}
                hasPsychData={selectedUser.has_psych_data}
                activeTab={activeTab}
                onPillClick={(t) => setActiveTab(t as TabId)}
              />

              <CrossDomainStrip
                currentTab={activeTab}
                behaviorAnomalies={behaviorAnomalies}
                llmHighRiskCount={llmHighRisk}
                psychFactorCount={psychFactorCount}
                hasLlm={selectedUser.has_llm_data}
                hasPsych={selectedUser.has_psych_data}
                onPivot={(t) => setActiveTab(t as TabId)}
              />

              <div className="flex gap-1 border-b border-slate-700">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => !tab.disabled && setActiveTab(tab.id)}
                    disabled={tab.disabled}
                    className={`px-4 py-2 text-sm font-medium flex items-center gap-2 border-b-2 transition ${
                      activeTab === tab.id
                        ? 'border-blue-400 text-blue-300'
                        : tab.disabled
                          ? 'border-transparent text-slate-600 cursor-not-allowed'
                          : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-500'
                    }`}
                  >
                    <tab.icon className="w-4 h-4" />
                    {tab.label}
                    {tab.disabled && <span className="text-[10px] text-slate-500">(no data)</span>}
                  </button>
                ))}
              </div>

              <div className="flex-1 overflow-y-auto">
                {activeTab === 'timeline' && (
                  <div className="space-y-3">
                    {events.map((event, index) => (
                      <div
                        key={event.id}
                        className={`p-4 rounded-lg border ${
                          event.anomaly_score > 70 ? 'bg-red-500/10 border-red-500/30' :
                          event.anomaly_score > 40 ? 'bg-orange-500/10 border-orange-500/30' :
                          'bg-slate-800/50 border-slate-700'
                        }`}
                        style={{ animationDelay: `${index * 30}ms` }}
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2">
                            {getCategoryIcon(event.event_category)}
                            <span className="font-semibold text-sm capitalize">{event.event_type.replace('_', ' ')}</span>
                            <span className={`text-xs px-2 py-0.5 rounded ${
                              event.event_category === 'physical' ? 'bg-blue-500/20 text-blue-400' :
                              event.event_category === 'logical' ? 'bg-cyan-500/20 text-cyan-400' :
                              'bg-emerald-500/20 text-emerald-400'
                            }`}>{event.event_category}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            {getOutcomeIcon(event.outcome, event.anomaly_score)}
                            <span className="text-xs text-slate-500">{formatTimestamp(event.timestamp)}</span>
                          </div>
                        </div>
                        <p className="text-sm text-slate-300 mb-2">{event.action}: {event.resource_accessed}</p>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          {event.location && <div className="flex items-center gap-1 text-slate-400"><MapPin className="w-3 h-3" />{event.location}</div>}
                          {event.device && <div className="flex items-center gap-1 text-slate-400"><Monitor className="w-3 h-3" />{event.device}</div>}
                          {event.ip_address && <div className="text-slate-400 col-span-2">IP: {event.ip_address}</div>}
                        </div>
                        {event.anomaly_score > 40 && (
                          <div className="mt-2 pt-2 border-t border-slate-700 flex items-center justify-between">
                            <span className="text-xs text-orange-400 font-semibold">Anomaly Detected</span>
                            <span className="text-xs bg-orange-500/20 text-orange-400 px-2 py-0.5 rounded">Score: {event.anomaly_score.toFixed(0)}</span>
                          </div>
                        )}
                      </div>
                    ))}
                    {events.length === 0 && <div className="text-slate-500 text-sm text-center py-8">No recent events</div>}
                  </div>
                )}

                {activeTab === 'network' && (
                  <div className="h-full"><UserEventNetwork events={events} /></div>
                )}

                {activeTab === 'llm' && (
                  <LLMRiskUserDetail userEmail={selectedUser.email} />
                )}

                {activeTab === 'psychology' && (
                  <PsychologicalUserDetail userEmail={selectedUser.email} />
                )}

                {activeTab === 'risk' && (
                  <div className="space-y-4">
                    {riskAssessment && (
                      <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-sm font-semibold">Current Risk Level</span>
                          <span className={`text-xl font-bold px-3 py-1 rounded border ${getRiskColor(riskAssessment.risk_score)}`}>
                            {riskAssessment.risk_score.toFixed(1)}
                          </span>
                        </div>
                        <div className="text-xs text-slate-400 mb-3">
                          Level: <span className={`capitalize font-semibold ${
                            riskAssessment.risk_level === 'critical' ? 'text-red-400' :
                            riskAssessment.risk_level === 'high' ? 'text-orange-400' :
                            riskAssessment.risk_level === 'medium' ? 'text-yellow-400' : 'text-emerald-400'
                          }`}>{riskAssessment.risk_level}</span>
                        </div>
                        <div className="space-y-2">
                          <p className="text-xs font-semibold text-slate-300">Risk Factors:</p>
                          {riskAssessment.risk_factors.map((f: any, idx: number) => (
                            <div key={idx} className="text-xs bg-slate-900 p-2 rounded border border-slate-700 flex items-start justify-between">
                              <span className="text-slate-300">{f.factor}</span>
                              <span className="text-orange-400 font-semibold ml-2">+{f.weight}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div>
                      <h3 className="text-sm font-semibold mb-3 flex items-center gap-2 text-slate-300 uppercase tracking-wide">
                        <Eye className="w-4 h-4 text-blue-400" />
                        <span>Event Correlations</span>
                      </h3>
                      <div className="space-y-2">
                        {correlations.length === 0 ? (
                          <p className="text-xs text-slate-500">No correlations detected</p>
                        ) : (
                          correlations.map((c) => (
                            <div key={c.id} className={`p-3 rounded-lg border ${
                              c.severity === 'critical' ? 'bg-red-500/10 border-red-500/30' :
                              c.severity === 'high' ? 'bg-orange-500/10 border-orange-500/30' :
                              'bg-yellow-500/10 border-yellow-500/30'
                            }`}>
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-xs font-semibold capitalize text-slate-300">{c.correlation_type.replace('_', ' ')}</span>
                                <span className={`text-xs px-2 py-0.5 rounded ${
                                  c.severity === 'critical' ? 'bg-red-500/20 text-red-400' :
                                  c.severity === 'high' ? 'bg-orange-500/20 text-orange-400' :
                                  'bg-yellow-500/20 text-yellow-400'
                                }`}>{c.severity}</span>
                              </div>
                              <p className="text-xs text-slate-400">{c.description}</p>
                              <div className="mt-2 text-xs text-slate-500">
                                Score: {c.correlation_score.toFixed(1)}% • {formatTimestamp(c.detected_at)}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default UserBehavior;
