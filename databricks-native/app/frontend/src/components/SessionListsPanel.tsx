import { useState, useEffect } from 'react';
import { List, Plus, Search, TrendingUp, Shield, AlertTriangle, Clock, X, Eye, Settings } from 'lucide-react';
import { supabase, SessionList, SessionListEntry, SessionListRule, SessionCorrelation } from '../lib/supabase';
import { generateMockSessionLists, generateMockSessionListEntries, generateMockSessionCorrelations } from '../lib/mockData';

const SessionListsPanel = () => {
  const [sessionLists, setSessionLists] = useState<SessionList[]>([]);
  const [selectedList, setSelectedList] = useState<SessionList | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'entries' | 'rules' | 'correlations'>('entries');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSessionLists();
    const interval = setInterval(loadSessionLists, 10000);
    return () => clearInterval(interval);
  }, []);

  const loadSessionLists = async () => {
    try {
      const { data, error } = await supabase
        .from('session_lists')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setSessionLists(data && data.length > 0 ? data : generateMockSessionLists());
    } catch (error) {
      console.error('Error loading session lists:', error);
      setSessionLists(generateMockSessionLists());
    } finally {
      setLoading(false);
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'login_logout':
        return <Clock className="w-5 h-5 text-blue-500" />;
      case 'ip_tracking':
        return <TrendingUp className="w-5 h-5 text-green-500" />;
      case 'hostile_activity':
        return <AlertTriangle className="w-5 h-5 text-red-500" />;
      case 'operational_monitoring':
        return <Eye className="w-5 h-5 text-purple-500" />;
      default:
        return <List className="w-5 h-5 text-slate-500" />;
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'login_logout':
        return 'bg-blue-500/20 text-blue-400 border-blue-500/50';
      case 'ip_tracking':
        return 'bg-green-500/20 text-green-400 border-green-500/50';
      case 'hostile_activity':
        return 'bg-red-500/20 text-red-400 border-red-500/50';
      case 'operational_monitoring':
        return 'bg-purple-500/20 text-purple-400 border-purple-500/50';
      default:
        return 'bg-slate-500/20 text-slate-400 border-slate-500/50';
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-slate-900/50 backdrop-blur-lg rounded-xl border border-slate-800 p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-semibold text-white flex items-center space-x-2">
              <List className="w-6 h-6 text-blue-500" />
              <span>Session Lists</span>
            </h2>
            <p className="text-slate-400 text-sm mt-1">
              Track and correlate user sessions over extended periods
            </p>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors flex items-center space-x-2"
          >
            <Plus className="w-5 h-5" />
            <span>New List</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <StatCard
            title="Total Lists"
            value={sessionLists.length}
            icon={<List className="w-5 h-5" />}
            color="blue"
          />
          <StatCard
            title="Rule-Driven"
            value={sessionLists.filter((l) => l.rule_driven).length}
            icon={<Settings className="w-5 h-5" />}
            color="green"
          />
          <StatCard
            title="Total Entries"
            value={sessionLists.reduce((sum, l) => sum + l.entry_count, 0)}
            icon={<TrendingUp className="w-5 h-5" />}
            color="purple"
          />
          <StatCard
            title="Correlation Enabled"
            value={sessionLists.filter((l) => l.correlation_enabled).length}
            icon={<Shield className="w-5 h-5" />}
            color="orange"
          />
        </div>

        {loading ? (
          <div className="text-center py-12 text-slate-400">Loading session lists...</div>
        ) : sessionLists.length === 0 ? (
          <div className="text-center py-12">
            <List className="w-16 h-16 text-slate-600 mx-auto mb-4" />
            <p className="text-slate-400">No session lists found</p>
            <p className="text-slate-500 text-sm mt-2">Create a new list to start tracking sessions</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sessionLists.map((list) => (
              <div
                key={list.id}
                onClick={() => setSelectedList(list)}
                className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center space-x-3">
                    {getCategoryIcon(list.list_category)}
                    <div>
                      <h3 className="text-white font-semibold">{list.name}</h3>
                      <span className={`inline-block px-2 py-1 rounded text-xs font-semibold border ${getCategoryColor(list.list_category)} mt-1`}>
                        {list.list_category.replace('_', ' ')}
                      </span>
                    </div>
                  </div>
                </div>
                <p className="text-slate-400 text-sm mb-3 line-clamp-2">{list.description}</p>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="bg-slate-900/50 rounded p-2">
                    <p className="text-slate-500 text-xs">Entries</p>
                    <p className="text-white font-semibold">{list.entry_count}</p>
                  </div>
                  <div className="bg-slate-900/50 rounded p-2">
                    <p className="text-slate-500 text-xs">Window</p>
                    <p className="text-white font-semibold">{list.time_window_hours}h</p>
                  </div>
                </div>
                <div className="flex items-center space-x-2 mt-3">
                  {list.rule_driven && (
                    <span className="px-2 py-1 bg-green-500/20 text-green-400 rounded text-xs">
                      Rule-Driven
                    </span>
                  )}
                  {list.correlation_enabled && (
                    <span className="px-2 py-1 bg-blue-500/20 text-blue-400 rounded text-xs">
                      Correlation
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showCreateModal && (
        <CreateSessionListModal
          onClose={() => setShowCreateModal(false)}
          onCreated={() => {
            setShowCreateModal(false);
            loadSessionLists();
          }}
        />
      )}

      {selectedList && (
        <SessionListDetailsModal
          list={selectedList}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          onClose={() => setSelectedList(null)}
        />
      )}
    </div>
  );
};

const StatCard = ({
  title,
  value,
  icon,
  color,
}: {
  title: string;
  value: number;
  icon: React.ReactNode;
  color: string;
}) => {
  const colorClasses: Record<string, string> = {
    blue: 'bg-blue-500/20 border-blue-500/30 text-blue-400',
    green: 'bg-green-500/20 border-green-500/30 text-green-400',
    purple: 'bg-purple-500/20 border-purple-500/30 text-purple-400',
    orange: 'bg-orange-500/20 border-orange-500/30 text-orange-400',
  };

  return (
    <div className={`rounded-lg border p-4 ${colorClasses[color]}`}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-slate-400 text-sm">{title}</p>
        {icon}
      </div>
      <p className="text-white text-2xl font-bold">{value}</p>
    </div>
  );
};

const CreateSessionListModal = ({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) => {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    list_category: 'login_logout',
    time_window_hours: 720,
    rule_driven: true,
    correlation_enabled: true,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { error } = await supabase.from('session_lists').insert([
        {
          ...formData,
          tracking_attributes: ['user_id', 'source_ip', 'device_id'],
          entry_count: 0,
          created_by: 'current_user',
        },
      ]);

      if (error) throw error;
      onCreated();
    } catch (error) {
      console.error('Error creating session list:', error);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-semibold text-white">Create Session List</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-6 h-6" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-slate-400 text-sm mb-2">Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
              required
            />
          </div>
          <div>
            <label className="block text-slate-400 text-sm mb-2">Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
              rows={3}
            />
          </div>
          <div>
            <label className="block text-slate-400 text-sm mb-2">Category</label>
            <select
              value={formData.list_category}
              onChange={(e) => setFormData({ ...formData, list_category: e.target.value })}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
            >
              <option value="login_logout">Login/Logout Tracking</option>
              <option value="ip_tracking">IP Address Tracking</option>
              <option value="hostile_activity">Hostile Activity</option>
              <option value="operational_monitoring">Operational Monitoring</option>
            </select>
          </div>
          <div>
            <label className="block text-slate-400 text-sm mb-2">Time Window (hours)</label>
            <input
              type="number"
              value={formData.time_window_hours}
              onChange={(e) => setFormData({ ...formData, time_window_hours: parseInt(e.target.value) })}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
              min="1"
            />
          </div>
          <div className="flex items-center space-x-4">
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={formData.rule_driven}
                onChange={(e) => setFormData({ ...formData, rule_driven: e.target.checked })}
                className="w-4 h-4"
              />
              <span className="text-slate-300">Rule-Driven Population</span>
            </label>
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={formData.correlation_enabled}
                onChange={(e) => setFormData({ ...formData, correlation_enabled: e.target.checked })}
                className="w-4 h-4"
              />
              <span className="text-slate-300">Enable Correlation</span>
            </label>
          </div>
          <div className="flex space-x-3 pt-4">
            <button
              type="submit"
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
            >
              Create List
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const SessionListDetailsModal = ({
  list,
  activeTab,
  setActiveTab,
  onClose,
}: {
  list: SessionList;
  activeTab: string;
  setActiveTab: (tab: 'entries' | 'rules' | 'correlations') => void;
  onClose: () => void;
}) => {
  const [entries, setEntries] = useState<SessionListEntry[]>([]);
  const [correlations, setCorrelations] = useState<SessionCorrelation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [list.id, activeTab]);

  const loadData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'entries') {
        const { data, error } = await supabase
          .from('session_list_entries')
          .select('*')
          .eq('session_list_id', list.id)
          .order('login_time', { ascending: false })
          .limit(50);

        if (error) throw error;
        setEntries(data && data.length > 0 ? data : generateMockSessionListEntries(list.id));
      } else if (activeTab === 'correlations') {
        const { data, error } = await supabase
          .from('session_correlations')
          .select('*')
          .eq('session_list_id', list.id)
          .order('created_at', { ascending: false });

        if (error) throw error;
        setCorrelations(data && data.length > 0 ? data : generateMockSessionCorrelations(list.id));
      }
    } catch (error) {
      console.error('Error loading data:', error);
      if (activeTab === 'entries') {
        setEntries(generateMockSessionListEntries(list.id));
      } else if (activeTab === 'correlations') {
        setCorrelations(generateMockSessionCorrelations(list.id));
      }
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-500/20 text-green-400 border-green-500/50';
      case 'suspicious':
        return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50';
      case 'compromised':
        return 'bg-red-500/20 text-red-400 border-red-500/50';
      case 'closed':
        return 'bg-slate-500/20 text-slate-400 border-slate-500/50';
      default:
        return 'bg-slate-500/20 text-slate-400 border-slate-500/50';
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-6 max-w-6xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-2xl font-semibold text-white">{list.name}</h3>
            <p className="text-slate-400 text-sm mt-1">{list.description}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex space-x-2 mb-6 border-b border-slate-800">
          <button
            onClick={() => setActiveTab('entries')}
            className={`px-4 py-2 transition-colors ${
              activeTab === 'entries'
                ? 'text-blue-400 border-b-2 border-blue-400'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Entries ({list.entry_count})
          </button>
          <button
            onClick={() => setActiveTab('rules')}
            className={`px-4 py-2 transition-colors ${
              activeTab === 'rules'
                ? 'text-blue-400 border-b-2 border-blue-400'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Rules
          </button>
          <button
            onClick={() => setActiveTab('correlations')}
            className={`px-4 py-2 transition-colors ${
              activeTab === 'correlations'
                ? 'text-blue-400 border-b-2 border-blue-400'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Correlations
          </button>
        </div>

        {loading ? (
          <div className="text-center py-12 text-slate-400">Loading...</div>
        ) : activeTab === 'entries' ? (
          <div className="space-y-3">
            {entries.length === 0 ? (
              <p className="text-slate-400 text-center py-8">No entries found</p>
            ) : (
              entries.map((entry) => (
                <div key={entry.id} className="bg-slate-800/50 rounded-lg p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-2">
                        <span className="text-white font-semibold">{entry.user_id || 'Unknown User'}</span>
                        <span className={`px-2 py-1 rounded text-xs font-semibold border ${getStatusColor(entry.status)}`}>
                          {entry.status}
                        </span>
                        {entry.risk_score > 50 && (
                          <span className="px-2 py-1 bg-red-500/20 text-red-400 rounded text-xs">
                            Risk: {entry.risk_score}%
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                        <div>
                          <p className="text-slate-500">Source IP</p>
                          <p className="text-slate-300">{entry.source_ip}</p>
                        </div>
                        <div>
                          <p className="text-slate-500">Device</p>
                          <p className="text-slate-300">{entry.device_id || 'N/A'}</p>
                        </div>
                        <div>
                          <p className="text-slate-500">Login Time</p>
                          <p className="text-slate-300">{entry.login_time ? new Date(entry.login_time).toLocaleString() : 'N/A'}</p>
                        </div>
                        <div>
                          <p className="text-slate-500">Events</p>
                          <p className="text-slate-300">{entry.event_count}</p>
                        </div>
                      </div>
                      {entry.added_by_rule && (
                        <p className="text-slate-500 text-xs mt-2">Added by rule: {entry.added_by_rule}</p>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        ) : activeTab === 'rules' ? (
          <div className="text-center py-12">
            <Settings className="w-16 h-16 text-slate-600 mx-auto mb-4" />
            <p className="text-slate-400">Rule configuration coming soon</p>
            <p className="text-slate-500 text-sm mt-2">
              Define rules to automatically populate this session list
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {correlations.length === 0 ? (
              <p className="text-slate-400 text-center py-8">No correlations found</p>
            ) : (
              correlations.map((correlation) => (
                <div key={correlation.id} className="bg-slate-800/50 rounded-lg p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-2">
                        <AlertTriangle className="w-5 h-5 text-orange-500" />
                        <span className="text-white font-semibold capitalize">
                          {correlation.correlation_type.replace('_', ' ')}
                        </span>
                        <span className="px-2 py-1 bg-blue-500/20 text-blue-400 rounded text-xs">
                          Confidence: {correlation.confidence_score}%
                        </span>
                        {!correlation.reviewed && (
                          <span className="px-2 py-1 bg-yellow-500/20 text-yellow-400 rounded text-xs">
                            Needs Review
                          </span>
                        )}
                      </div>
                      <p className="text-slate-300 mb-2">{correlation.description}</p>
                      <p className="text-slate-500 text-sm">
                        Involves {correlation.involved_sessions.length} sessions • {new Date(correlation.created_at).toLocaleString()}
                      </p>
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
};

export default SessionListsPanel;
