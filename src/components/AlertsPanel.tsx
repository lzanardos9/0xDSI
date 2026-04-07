import { useState, useEffect } from 'react';
import { AlertTriangle, CheckCircle, Clock, XCircle, User } from 'lucide-react';
import { supabase, Alert } from '../lib/supabase';
import { generateMockAlerts } from '../lib/mockData';

const AlertsPanel = () => {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [filter, setFilter] = useState<'all' | 'new' | 'investigating' | 'resolved'>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAlerts();
    const interval = setInterval(loadAlerts, 5000);
    return () => clearInterval(interval);
  }, [filter]);

  const loadAlerts = async () => {
    try {
      let query = supabase
        .from('alerts')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (filter !== 'all') {
        query = query.eq('status', filter);
      }

      const { data, error } = await query;

      if (error) throw error;
      setAlerts(data && data.length > 0 ? data : generateMockAlerts());
    } catch (error) {
      console.error('Error loading alerts:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateAlertStatus = async (alertId: string, newStatus: string) => {
    try {
      const { error } = await supabase
        .from('alerts')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', alertId);

      if (error) throw error;
      loadAlerts();
    } catch (error) {
      console.error('Error updating alert:', error);
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'bg-red-500/20 text-red-400 border-red-500/50';
      case 'high':
        return 'bg-orange-500/20 text-orange-400 border-orange-500/50';
      case 'medium':
        return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50';
      case 'low':
        return 'bg-green-500/20 text-green-400 border-green-500/50';
      default:
        return 'bg-slate-500/20 text-slate-400 border-slate-500/50';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'new':
        return <AlertTriangle className="w-5 h-5 text-yellow-500" />;
      case 'investigating':
        return <Clock className="w-5 h-5 text-blue-500" />;
      case 'resolved':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'false_positive':
        return <XCircle className="w-5 h-5 text-slate-500" />;
      default:
        return null;
    }
  };

  return (
    <div className="bg-slate-900/50 backdrop-blur-lg rounded-xl border border-slate-800 p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-white flex items-center space-x-2">
          <AlertTriangle className="w-6 h-6 text-red-500" />
          <span>Security Alerts</span>
        </h2>
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
            onClick={() => setFilter('new')}
            className={`px-4 py-2 rounded-lg transition-colors ${
              filter === 'new' ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >
            New
          </button>
          <button
            onClick={() => setFilter('investigating')}
            className={`px-4 py-2 rounded-lg transition-colors ${
              filter === 'investigating' ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >
            Investigating
          </button>
          <button
            onClick={() => setFilter('resolved')}
            className={`px-4 py-2 rounded-lg transition-colors ${
              filter === 'resolved' ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >
            Resolved
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-slate-400">Loading alerts...</div>
      ) : alerts.length === 0 ? (
        <div className="text-center py-12">
          <AlertTriangle className="w-16 h-16 text-slate-600 mx-auto mb-4" />
          <p className="text-slate-400">No alerts found</p>
          <p className="text-slate-500 text-sm mt-2">Security alerts will appear here when correlation rules are triggered</p>
        </div>
      ) : (
        <div className="space-y-4">
          {alerts.map((alert) => (
            <div
              key={alert.id}
              className="bg-slate-800/50 border border-slate-700 rounded-lg p-5 hover:border-slate-600 transition-colors"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center space-x-3">
                  {getStatusIcon(alert.status)}
                  <div>
                    <h3 className="text-white font-semibold text-lg">{alert.alert_name}</h3>
                    <p className="text-slate-400 text-sm mt-1">{alert.description}</p>
                  </div>
                </div>
                <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${getSeverityColor(alert.severity)}`}>
                  {alert.severity.toUpperCase()}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
                <div>
                  <span className="text-slate-500">Status:</span>
                  <span className="text-slate-300 ml-2 capitalize">{alert.status.replace('_', ' ')}</span>
                </div>
                <div>
                  <span className="text-slate-500">Created:</span>
                  <span className="text-slate-300 ml-2">{new Date(alert.created_at).toLocaleString()}</span>
                </div>
                {alert.assigned_to && (
                  <div>
                    <span className="text-slate-500">Assigned to:</span>
                    <span className="text-slate-300 ml-2 font-mono">{alert.assigned_to}</span>
                  </div>
                )}
                {alert.event_ids && (
                  <div>
                    <span className="text-slate-500">Related events:</span>
                    <span className="text-slate-300 ml-2">{alert.event_ids.length}</span>
                  </div>
                )}
              </div>

              <div className="flex space-x-2 pt-3 border-t border-slate-700">
                {alert.status === 'new' && (
                  <button
                    onClick={() => updateAlertStatus(alert.id, 'investigating')}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm flex items-center space-x-2"
                  >
                    <Clock className="w-4 h-4" />
                    <span>Investigate</span>
                  </button>
                )}
                {alert.status === 'investigating' && (
                  <>
                    <button
                      onClick={() => updateAlertStatus(alert.id, 'resolved')}
                      className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors text-sm flex items-center space-x-2"
                    >
                      <CheckCircle className="w-4 h-4" />
                      <span>Resolve</span>
                    </button>
                    <button
                      onClick={() => updateAlertStatus(alert.id, 'false_positive')}
                      className="px-4 py-2 bg-slate-600 hover:bg-slate-700 text-white rounded-lg transition-colors text-sm flex items-center space-x-2"
                    >
                      <XCircle className="w-4 h-4" />
                      <span>False Positive</span>
                    </button>
                  </>
                )}
                {(alert.status === 'resolved' || alert.status === 'false_positive') && (
                  <button
                    onClick={() => updateAlertStatus(alert.id, 'new')}
                    className="px-4 py-2 bg-slate-600 hover:bg-slate-700 text-white rounded-lg transition-colors text-sm"
                  >
                    Reopen
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AlertsPanel;
