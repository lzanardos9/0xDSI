import { useState, useEffect } from 'react';
import { Zap, Shield, Lock, Ban, Bell, AlertOctagon } from 'lucide-react';
import { supabase, ResponseAction, WorkflowExecution } from '../lib/supabase';
import { generateMockResponseActions } from '../lib/mockData';

const ResponseAutomation = () => {
  const [actions, setActions] = useState<ResponseAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'completed' | 'pending' | 'failed'>('all');

  useEffect(() => {
    loadActions();
    const interval = setInterval(loadActions, 5000);
    return () => clearInterval(interval);
  }, [filter]);

  const loadActions = async () => {
    try {
      let query = supabase
        .from('response_actions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (filter !== 'all') {
        query = query.eq('action_status', filter);
      }

      const { data, error } = await query;

      if (error) throw error;
      setActions(data && data.length > 0 ? data : generateMockResponseActions());
    } catch (error) {
      console.error('Error loading actions:', error);
    } finally {
      setLoading(false);
    }
  };

  const rollbackAction = async (actionId: string) => {
    try {
      const { error } = await supabase
        .from('response_actions')
        .update({
          action_status: 'rolled_back',
          rolled_back_at: new Date().toISOString(),
        })
        .eq('id', actionId);

      if (error) throw error;
      loadActions();
    } catch (error) {
      console.error('Error rolling back action:', error);
    }
  };

  const getActionIcon = (type: string) => {
    switch (type) {
      case 'block_ip':
        return <Ban className="w-5 h-5 text-red-500" />;
      case 'isolate_user':
        return <Lock className="w-5 h-5 text-orange-500" />;
      case 'disable_account':
        return <Shield className="w-5 h-5 text-red-500" />;
      case 'send_notification':
        return <Bell className="w-5 h-5 text-blue-500" />;
      case 'quarantine_file':
        return <AlertOctagon className="w-5 h-5 text-yellow-500" />;
      default:
        return <Zap className="w-5 h-5 text-slate-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-500/20 text-green-400 border-green-500/50';
      case 'pending':
        return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50';
      case 'failed':
        return 'bg-red-500/20 text-red-400 border-red-500/50';
      case 'rolled_back':
        return 'bg-slate-500/20 text-slate-400 border-slate-500/50';
      default:
        return 'bg-slate-500/20 text-slate-400 border-slate-500/50';
    }
  };

  return (
    <div className="bg-slate-900/50 backdrop-blur-lg rounded-xl border border-slate-800 p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-white flex items-center space-x-2">
          <Zap className="w-6 h-6 text-yellow-500" />
          <span>Automated Response Actions</span>
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
            onClick={() => setFilter('completed')}
            className={`px-4 py-2 rounded-lg transition-colors ${
              filter === 'completed' ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >
            Completed
          </button>
          <button
            onClick={() => setFilter('pending')}
            className={`px-4 py-2 rounded-lg transition-colors ${
              filter === 'pending' ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >
            Pending
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatBox
          icon={<Shield className="w-6 h-6" />}
          title="Total Actions"
          value={actions.length}
          color="blue"
        />
        <StatBox
          icon={<Zap className="w-6 h-6" />}
          title="Completed"
          value={actions.filter((a) => a.action_status === 'completed').length}
          color="green"
        />
        <StatBox
          icon={<AlertOctagon className="w-6 h-6" />}
          title="Pending"
          value={actions.filter((a) => a.action_status === 'pending').length}
          color="yellow"
        />
        <StatBox
          icon={<Ban className="w-6 h-6" />}
          title="Failed"
          value={actions.filter((a) => a.action_status === 'failed').length}
          color="red"
        />
      </div>

      {loading ? (
        <div className="text-center py-12 text-slate-400">Loading actions...</div>
      ) : actions.length === 0 ? (
        <div className="text-center py-12">
          <Zap className="w-16 h-16 text-slate-600 mx-auto mb-4" />
          <p className="text-slate-400">No automated actions yet</p>
          <p className="text-slate-500 text-sm mt-2">Response actions will appear here when workflows are executed</p>
        </div>
      ) : (
        <div className="space-y-3 max-h-[500px] overflow-y-auto">
          {actions.map((action) => (
            <div
              key={action.id}
              className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 hover:bg-slate-800 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start space-x-3 flex-1">
                  {getActionIcon(action.action_type)}
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-2">
                      <h3 className="text-white font-semibold capitalize">
                        {action.action_type.replace('_', ' ')}
                      </h3>
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${getStatusColor(action.action_status)}`}>
                        {action.action_status}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <span className="text-slate-500">Target:</span>
                        <span className="text-slate-300 ml-2 font-mono">{action.target_entity}</span>
                      </div>
                      <div>
                        <span className="text-slate-500">Time:</span>
                        <span className="text-slate-400 ml-2">
                          {new Date(action.created_at).toLocaleString()}
                        </span>
                      </div>
                    </div>
                    {action.result_message && (
                      <p className="text-slate-400 text-sm mt-2">{action.result_message}</p>
                    )}
                  </div>
                </div>
                {action.rollback_possible && action.action_status === 'completed' && !action.rolled_back_at && (
                  <button
                    onClick={() => rollbackAction(action.id)}
                    className="px-3 py-1 bg-orange-600 hover:bg-orange-700 text-white rounded text-sm transition-colors"
                  >
                    Rollback
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

const StatBox = ({
  icon,
  title,
  value,
  color,
}: {
  icon: React.ReactNode;
  title: string;
  value: number;
  color: 'blue' | 'green' | 'yellow' | 'red';
}) => {
  const colorClasses = {
    blue: 'text-blue-500 bg-blue-500/20',
    green: 'text-green-500 bg-green-500/20',
    yellow: 'text-yellow-500 bg-yellow-500/20',
    red: 'text-red-500 bg-red-500/20',
  };

  return (
    <div className="bg-slate-800/50 rounded-lg border border-slate-700 p-4">
      <div className={`p-3 rounded-lg ${colorClasses[color]} w-fit mb-3`}>{icon}</div>
      <p className="text-slate-400 text-sm mb-1">{title}</p>
      <p className="text-white text-2xl font-bold">{value}</p>
    </div>
  );
};

export default ResponseAutomation;
