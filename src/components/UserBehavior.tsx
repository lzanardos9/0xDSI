import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { User, Activity, MapPin, Monitor, AlertTriangle, CheckCircle, Clock, Shield, TrendingUp, Eye, XCircle, Network, Brain } from 'lucide-react';
import UserEventNetwork from './UserEventNetwork';
import LLMRiskProfiling from './LLMRiskProfiling';
import MLModelExplainer from './MLModelExplainer';
import { ML_MODELS } from '../lib/mlModelData';

interface UserProfile {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  department: string;
  title: string;
  clearance_level: string;
  profile_picture_url: string;
  risk_score: number;
  status: string;
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

const UserBehavior = () => {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [events, setEvents] = useState<BehaviorEvent[]>([]);
  const [riskAssessment, setRiskAssessment] = useState<RiskAssessment | null>(null);
  const [correlations, setCorrelations] = useState<Correlation[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNetwork, setShowNetwork] = useState(false);
  const [showLLMRisk, setShowLLMRisk] = useState(false);

  useEffect(() => {
    fetchUsers();
  }, []);

  useEffect(() => {
    if (selectedUser) {
      fetchUserData(selectedUser.id);

      const eventsSubscription = supabase
        .channel(`user_behavior_events_${selectedUser.id}`)
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'user_behavior_events',
          filter: `user_profile_id=eq.${selectedUser.id}`
        }, (payload) => {
          console.log('👤 New user behavior event:', payload);
          setEvents((prevEvents) => [payload.new as BehaviorEvent, ...prevEvents].slice(0, 20));
        })
        .subscribe();

      return () => {
        eventsSubscription.unsubscribe();
      };
    }
  }, [selectedUser]);

  const fetchUsers = async () => {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .order('risk_score', { ascending: false });

      if (error) throw error;
      setUsers(data || []);
      if (data && data.length > 0) {
        setSelectedUser(data[0]);
      }
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchUserData = async (userId: string) => {
    try {
      const [eventsResult, riskResult, correlationsResult] = await Promise.all([
        supabase
          .from('user_behavior_events')
          .select('*')
          .eq('user_profile_id', userId)
          .order('timestamp', { ascending: false })
          .limit(20),
        supabase
          .from('user_risk_assessments')
          .select('*')
          .eq('user_profile_id', userId)
          .order('assessment_time', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('behavior_correlations')
          .select('*')
          .eq('user_profile_id', userId)
          .order('detected_at', { ascending: false })
      ]);

      if (eventsResult.error) throw eventsResult.error;
      if (correlationsResult.error) throw correlationsResult.error;

      setEvents(eventsResult.data || []);
      setRiskAssessment(riskResult.data);
      setCorrelations(correlationsResult.data || []);
    } catch (error) {
      console.error('Error fetching user data:', error);
    }
  };

  const getRiskColor = (score: number) => {
    if (score >= 70) return 'text-red-400 bg-red-500/20 border-red-500';
    if (score >= 40) return 'text-orange-400 bg-orange-500/20 border-orange-500';
    if (score >= 20) return 'text-yellow-400 bg-yellow-500/20 border-yellow-500';
    return 'text-green-400 bg-green-500/20 border-green-500';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'text-green-400';
      case 'investigation': return 'text-red-400';
      case 'suspended': return 'text-slate-400';
      default: return 'text-slate-500';
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'physical': return <MapPin className="w-4 h-4" />;
      case 'logical': return <Monitor className="w-4 h-4" />;
      case 'hybrid': return <Activity className="w-4 h-4" />;
      default: return <Activity className="w-4 h-4" />;
    }
  };

  const getOutcomeIcon = (outcome: string, anomalyScore: number) => {
    if (anomalyScore > 70) return <AlertTriangle className="w-4 h-4 text-red-400" />;
    if (outcome === 'success') return <CheckCircle className="w-4 h-4 text-green-400" />;
    if (outcome === 'denied') return <XCircle className="w-4 h-4 text-red-400" />;
    return <Clock className="w-4 h-4 text-yellow-400" />;
  };

  const formatTimestamp = (timestamp: string) => {
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-white">Loading user behavior data...</div>
      </div>
    );
  }

  if (showLLMRisk) {
    return (
      <div className="h-full bg-white text-slate-900 p-6 overflow-auto">
        <div className="mb-6">
          <button
            onClick={() => setShowLLMRisk(false)}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg flex items-center space-x-2 transition-colors mb-4"
          >
            <User className="w-4 h-4" />
            <span>Back to User Behavior</span>
          </button>
        </div>
        <LLMRiskProfiling />
      </div>
    );
  }

  return (
    <div className="h-full bg-slate-950 text-white p-6 overflow-hidden flex flex-col">
      <MLModelExplainer {...ML_MODELS.userBehavior} />

      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center space-x-3">
              <User className="w-8 h-8 text-blue-400" />
              <span>User Behavior Analytics</span>
            </h1>
            <p className="text-slate-400 mt-1">Real-time user tracking with physical and logical event correlation</p>
          </div>
          <div className="flex items-center space-x-2 px-4 py-2 bg-blue-500/10 border border-blue-500/30 rounded-lg">
            <Activity className="w-5 h-5 text-blue-400 animate-pulse" />
            <span className="text-blue-400 font-semibold">Live Tracking</span>
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col gap-6 overflow-hidden">
        <div className="grid grid-cols-4 gap-6 flex-1 overflow-hidden">
        <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-4 overflow-hidden flex flex-col">
          <h2 className="text-xl font-semibold mb-4 flex items-center space-x-2">
            <Shield className="w-5 h-5 text-blue-400" />
            <span>Users</span>
            <span className="ml-auto text-sm text-slate-400">{users.length}</span>
          </h2>
          <div className="space-y-2 overflow-y-auto flex-1">
            {users.map((user) => (
              <div
                key={user.id}
                onClick={() => setSelectedUser(user)}
                className={`p-3 rounded-lg border cursor-pointer transition-all ${
                  selectedUser?.id === user.id
                    ? 'bg-slate-700 border-blue-500'
                    : 'bg-slate-800/50 border-slate-700 hover:border-blue-600'
                }`}
              >
                <div className="flex items-center space-x-3 mb-2">
                  <img
                    src={user.profile_picture_url}
                    alt={user.full_name}
                    className="w-10 h-10 rounded-full border-2 border-slate-600"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">{user.full_name}</p>
                    <p className="text-xs text-slate-400 truncate">{user.title}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className={`text-xs px-2 py-1 rounded border ${getRiskColor(user.risk_score)}`}>
                    Risk: {user.risk_score.toFixed(0)}
                  </span>
                  <span className={`text-xs capitalize ${getStatusColor(user.status)}`}>
                    {user.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="col-span-2 bg-slate-900/50 border border-slate-700 rounded-lg overflow-hidden flex flex-col">
          <div className="bg-gradient-to-r from-slate-800 to-slate-900 px-4 py-3 border-b border-slate-700 flex items-center justify-between">
            <h3 className="text-lg font-semibold flex items-center space-x-2">
              <Activity className="w-5 h-5 text-green-400" />
              <span>{showNetwork ? 'Event Network' : 'Activity Timeline'}</span>
              {!showNetwork && selectedUser && (
                <div className="flex items-center space-x-2 px-3 py-1 bg-green-500/10 border border-green-500/20 rounded-lg ml-3">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                  <span className="text-green-400 text-xs font-medium">LIVE</span>
                </div>
              )}
            </h3>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setShowNetwork(!showNetwork)}
                className="px-3 py-1.5 text-xs font-semibold bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded-lg transition-all flex items-center space-x-2"
              >
                <Network className="w-4 h-4" />
                <span>{showNetwork ? 'Show Timeline' : 'Show Network'}</span>
              </button>
              <button
                onClick={() => { setShowLLMRisk(!showLLMRisk); if (!showLLMRisk) setShowNetwork(false); }}
                className="px-3 py-1.5 text-xs font-semibold bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 border border-purple-500/30 rounded-lg transition-all flex items-center space-x-2"
              >
                <Brain className="w-4 h-4" />
                <span>LLM Risk Profile</span>
              </button>
            </div>
          </div>
          <div className="p-4 flex-1 overflow-hidden flex flex-col">
          {!selectedUser ? (
            <div className="flex items-center justify-center h-full text-slate-500">
              Select a user to view behavior data
            </div>
          ) : showNetwork ? (
            <div className="flex-1 overflow-hidden">
              <UserEventNetwork events={events} />
            </div>
          ) : (
            <>
              <div className="mb-4 pb-4 border-b border-slate-700">
                <div className="flex items-start space-x-4">
                  <img
                    src={selectedUser.profile_picture_url}
                    alt={selectedUser.full_name}
                    className="w-16 h-16 rounded-full border-4 border-slate-600"
                  />
                  <div className="flex-1">
                    <h2 className="text-2xl font-bold">{selectedUser.full_name}</h2>
                    <p className="text-slate-400">{selectedUser.title} • {selectedUser.department}</p>
                    <p className="text-sm text-slate-500">{selectedUser.email}</p>
                    <div className="flex items-center space-x-4 mt-2">
                      <span className="text-xs bg-slate-700 px-2 py-1 rounded">
                        Clearance: {selectedUser.clearance_level}
                      </span>
                      <span className={`text-xs px-2 py-1 rounded border ${getRiskColor(selectedUser.risk_score)}`}>
                        Risk Score: {selectedUser.risk_score.toFixed(1)}
                      </span>
                      <span className={`text-xs capitalize ${getStatusColor(selectedUser.status)}`}>
                        {selectedUser.status}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-slate-400">{events.length} events</span>
              </div>

              <div className="space-y-3 overflow-y-auto flex-1">
                {events.map((event, index) => (
                  <div
                    key={event.id}
                    className={`p-4 rounded-lg border animate-in slide-in-from-top duration-500 ${
                      event.anomaly_score > 70
                        ? 'bg-red-500/10 border-red-500/30'
                        : event.anomaly_score > 40
                        ? 'bg-orange-500/10 border-orange-500/30'
                        : 'bg-slate-800/50 border-slate-700'
                    }`}
                    style={{
                      animationDelay: `${index * 50}ms`,
                      animationFillMode: 'backwards'
                    }}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center space-x-2">
                        {getCategoryIcon(event.event_category)}
                        <span className="font-semibold text-sm capitalize">
                          {event.event_type.replace('_', ' ')}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded ${
                          event.event_category === 'physical'
                            ? 'bg-purple-500/20 text-purple-400'
                            : event.event_category === 'logical'
                            ? 'bg-blue-500/20 text-blue-400'
                            : 'bg-green-500/20 text-green-400'
                        }`}>
                          {event.event_category}
                        </span>
                      </div>
                      <div className="flex items-center space-x-2">
                        {getOutcomeIcon(event.outcome, event.anomaly_score)}
                        <span className="text-xs text-slate-500">{formatTimestamp(event.timestamp)}</span>
                      </div>
                    </div>

                    <p className="text-sm text-slate-300 mb-2">{event.action}: {event.resource_accessed}</p>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      {event.location && (
                        <div className="flex items-center space-x-1 text-slate-400">
                          <MapPin className="w-3 h-3" />
                          <span>{event.location}</span>
                        </div>
                      )}
                      {event.device && (
                        <div className="flex items-center space-x-1 text-slate-400">
                          <Monitor className="w-3 h-3" />
                          <span>{event.device}</span>
                        </div>
                      )}
                      {event.ip_address && (
                        <div className="text-slate-400 col-span-2">
                          IP: {event.ip_address}
                        </div>
                      )}
                    </div>

                    {event.anomaly_score > 40 && (
                      <div className="mt-2 pt-2 border-t border-slate-700">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-orange-400 font-semibold">Anomaly Detected</span>
                          <span className="text-xs bg-orange-500/20 text-orange-400 px-2 py-0.5 rounded">
                            Score: {event.anomaly_score.toFixed(0)}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
          </div>
        </div>

        <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-4 overflow-hidden flex flex-col">
          <h2 className="text-xl font-semibold mb-4 flex items-center space-x-2">
            <TrendingUp className="w-5 h-5 text-orange-400" />
            <span>Risk Analysis</span>
          </h2>

          {!selectedUser ? (
            <div className="flex items-center justify-center h-full text-slate-500">
              Select a user to view risk analysis
            </div>
          ) : (
            <div className="space-y-4 overflow-y-auto flex-1">
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
                      riskAssessment.risk_level === 'medium' ? 'text-yellow-400' :
                      'text-green-400'
                    }`}>{riskAssessment.risk_level}</span>
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-slate-300">Risk Factors:</p>
                    {riskAssessment.risk_factors.map((factor: any, idx: number) => (
                      <div key={idx} className="text-xs bg-slate-900 p-2 rounded border border-slate-700">
                        <div className="flex items-start justify-between">
                          <span className="text-slate-300">{factor.factor}</span>
                          <span className="text-orange-400 font-semibold ml-2">+{factor.weight}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <h3 className="text-sm font-semibold mb-3 flex items-center space-x-2">
                  <Eye className="w-4 h-4 text-purple-400" />
                  <span>Event Correlations</span>
                </h3>
                <div className="space-y-2">
                  {correlations.length === 0 ? (
                    <p className="text-xs text-slate-500">No correlations detected</p>
                  ) : (
                    correlations.map((correlation) => (
                      <div
                        key={correlation.id}
                        className={`p-3 rounded-lg border ${
                          correlation.severity === 'critical'
                            ? 'bg-red-500/10 border-red-500/30'
                            : correlation.severity === 'high'
                            ? 'bg-orange-500/10 border-orange-500/30'
                            : 'bg-yellow-500/10 border-yellow-500/30'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-semibold capitalize text-slate-300">
                            {correlation.correlation_type.replace('_', ' ')}
                          </span>
                          <span className={`text-xs px-2 py-0.5 rounded ${
                            correlation.severity === 'critical'
                              ? 'bg-red-500/20 text-red-400'
                              : correlation.severity === 'high'
                              ? 'bg-orange-500/20 text-orange-400'
                              : 'bg-yellow-500/20 text-yellow-400'
                          }`}>
                            {correlation.severity}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400">{correlation.description}</p>
                        <div className="mt-2 text-xs text-slate-500">
                          Score: {correlation.correlation_score.toFixed(1)}% • {formatTimestamp(correlation.detected_at)}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
        </div>
      </div>
    </div>
  );
};

export default UserBehavior;
