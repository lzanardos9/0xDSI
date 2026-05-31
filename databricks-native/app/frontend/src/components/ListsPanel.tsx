import { useState, useEffect } from 'react';
import { Database, List, Users, AlertCircle, CheckCircle, XCircle, TrendingUp } from 'lucide-react';
import SessionListsPanel from './SessionListsPanel';
import ActiveListsPanel from './ActiveListsPanel';
import { supabase, Session } from '../lib/supabase';
import { generateMockSessions } from '../lib/mockData';

const ListsPanel = () => {
  const [activeTab, setActiveTab] = useState<'monitor' | 'sessionlists' | 'activelists'>('monitor');

  return (
    <div className="space-y-6">
      <div className="bg-slate-900/50 backdrop-blur-lg rounded-xl border border-slate-800 p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-semibold text-white flex items-center space-x-2">
              <Database className="w-6 h-6 text-blue-500" />
              <span>Sessions & Lists</span>
            </h2>
            <p className="text-slate-400 text-sm mt-1">
              Monitor live sessions and manage security lists
            </p>
          </div>
        </div>

        <div className="flex space-x-2 mb-6 border-b border-slate-800">
          <button
            onClick={() => setActiveTab('monitor')}
            className={`px-6 py-3 transition-colors flex items-center space-x-2 ${
              activeTab === 'monitor'
                ? 'text-blue-400 border-b-2 border-blue-400'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Users className="w-5 h-5" />
            <span className="font-medium">Session Monitor</span>
          </button>
          <button
            onClick={() => setActiveTab('sessionlists')}
            className={`px-6 py-3 transition-colors flex items-center space-x-2 ${
              activeTab === 'sessionlists'
                ? 'text-blue-400 border-b-2 border-blue-400'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <List className="w-5 h-5" />
            <span className="font-medium">Session Lists</span>
          </button>
          <button
            onClick={() => setActiveTab('activelists')}
            className={`px-6 py-3 transition-colors flex items-center space-x-2 ${
              activeTab === 'activelists'
                ? 'text-blue-400 border-b-2 border-blue-400'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Database className="w-5 h-5" />
            <span className="font-medium">Active Lists</span>
          </button>
        </div>
      </div>

      {activeTab === 'monitor' && <SessionMonitorContent />}
      {activeTab === 'sessionlists' && <SessionListsPanel />}
      {activeTab === 'activelists' && <ActiveListsPanel />}
    </div>
  );
};

const SessionMonitorContent = () => {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [filter, setFilter] = useState<'all' | 'active' | 'suspicious'>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSessions();
    const interval = setInterval(loadSessions, 5000);
    return () => clearInterval(interval);
  }, [filter]);

  const loadSessions = async () => {
    try {
      let query = supabase
        .from('sessions')
        .select('*')
        .order('start_time', { ascending: false })
        .limit(50);

      if (filter !== 'all') {
        query = query.eq('status', filter);
      }

      const { data, error } = await query;

      if (error) throw error;
      setSessions(data && data.length > 0 ? data : generateMockSessions());
    } catch (error) {
      console.error('Error loading sessions:', error);
    } finally {
      setLoading(false);
    }
  };

  const getRiskColor = (score: number) => {
    if (score >= 75) return 'text-red-500 bg-red-500/20';
    if (score >= 50) return 'text-orange-500 bg-orange-500/20';
    if (score >= 25) return 'text-yellow-500 bg-yellow-500/20';
    return 'text-green-500 bg-green-500/20';
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'suspicious':
        return <AlertCircle className="w-5 h-5 text-red-500" />;
      case 'closed':
        return <XCircle className="w-5 h-5 text-slate-500" />;
      default:
        return null;
    }
  };

  const calculateDuration = (start: string, end: string | null) => {
    const duration = (end ? new Date(end).getTime() : Date.now()) - new Date(start).getTime();
    const minutes = Math.floor(duration / 60000);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    }
    return `${minutes}m`;
  };

  return (
    <div className="bg-slate-900/50 backdrop-blur-lg rounded-xl border border-slate-800 p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-white flex items-center space-x-2">
          <Users className="w-5 h-5 text-blue-500" />
          <span>Live Session Monitor</span>
        </h3>
        <div className="flex space-x-2">
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-2 rounded-lg transition-colors ${
              filter === 'all' ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >
            All
          </button>
          <button
            onClick={() => setFilter('active')}
            className={`px-4 py-2 rounded-lg transition-colors ${
              filter === 'active' ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >
            Active
          </button>
          <button
            onClick={() => setFilter('suspicious')}
            className={`px-4 py-2 rounded-lg transition-colors ${
              filter === 'suspicious' ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >
            Suspicious
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-slate-400">Loading sessions...</div>
      ) : sessions.length === 0 ? (
        <div className="text-center py-12">
          <Users className="w-16 h-16 text-slate-600 mx-auto mb-4" />
          <p className="text-slate-400">No sessions found</p>
          <p className="text-slate-500 text-sm mt-2">Sessions will appear here as users interact with the system</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-800">
                <th className="text-left py-3 px-4 text-slate-400 font-semibold text-sm">Status</th>
                <th className="text-left py-3 px-4 text-slate-400 font-semibold text-sm">User ID</th>
                <th className="text-left py-3 px-4 text-slate-400 font-semibold text-sm">Source IP</th>
                <th className="text-left py-3 px-4 text-slate-400 font-semibold text-sm">Start Time</th>
                <th className="text-left py-3 px-4 text-slate-400 font-semibold text-sm">Duration</th>
                <th className="text-left py-3 px-4 text-slate-400 font-semibold text-sm">Events</th>
                <th className="text-left py-3 px-4 text-slate-400 font-semibold text-sm">Risk Score</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((session) => (
                <tr
                  key={session.id}
                  className="border-b border-slate-800 hover:bg-slate-800/50 transition-colors"
                >
                  <td className="py-4 px-4">
                    <div className="flex items-center space-x-2">
                      {getStatusIcon(session.status)}
                      <span className="text-slate-300 text-sm capitalize">{session.status}</span>
                    </div>
                  </td>
                  <td className="py-4 px-4">
                    <span className="text-slate-300 font-mono text-sm">{session.user_id}</span>
                  </td>
                  <td className="py-4 px-4">
                    <span className="text-slate-300 font-mono text-sm">{session.source_ip}</span>
                  </td>
                  <td className="py-4 px-4">
                    <span className="text-slate-400 text-sm">
                      {new Date(session.start_time).toLocaleString()}
                    </span>
                  </td>
                  <td className="py-4 px-4">
                    <span className="text-slate-400 text-sm">
                      {session.end_time ? calculateDuration(session.start_time, session.end_time) : 'Active'}
                    </span>
                  </td>
                  <td className="py-4 px-4">
                    <span className="text-slate-300 text-sm">{session.event_count}</span>
                  </td>
                  <td className="py-4 px-4">
                    <div className="flex items-center space-x-2">
                      <span className={`px-3 py-1 rounded-full text-sm font-semibold ${getRiskColor(session.risk_score)}`}>
                        {session.risk_score}
                      </span>
                      <TrendingUp className={`w-4 h-4 ${getRiskColor(session.risk_score).split(' ')[0]}`} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default ListsPanel;
