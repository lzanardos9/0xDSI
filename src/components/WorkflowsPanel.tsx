import { useState, useEffect } from 'react';
import { Workflow, Play, Plus, Settings, Zap, CheckCircle, XCircle, Clock } from 'lucide-react';
import { supabase, N8nWorkflow, WorkflowTrigger, WorkflowExecution } from '../lib/supabase';
import { generateMockWorkflows, generateMockWorkflowExecutions } from '../lib/mockData';

const WorkflowsPanel = () => {
  const [workflows, setWorkflows] = useState<N8nWorkflow[]>([]);
  const [executions, setExecutions] = useState<WorkflowExecution[]>([]);
  const [selectedWorkflow, setSelectedWorkflow] = useState<N8nWorkflow | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'workflows' | 'executions'>('workflows');

  useEffect(() => {
    loadWorkflows();
    loadExecutions();
    const interval = setInterval(() => {
      loadWorkflows();
      loadExecutions();
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const loadWorkflows = async () => {
    try {
      const { data, error } = await supabase
        .from('n8n_workflows')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setWorkflows(data && data.length > 0 ? data : generateMockWorkflows());
    } catch (error) {
      console.error('Error loading workflows:', error);
      setWorkflows(generateMockWorkflows());
    } finally {
      setLoading(false);
    }
  };

  const loadExecutions = async () => {
    try {
      const { data, error } = await supabase
        .from('workflow_executions')
        .select('*')
        .order('started_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setExecutions(data && data.length > 0 ? data : generateMockWorkflowExecutions());
    } catch (error) {
      console.error('Error loading executions:', error);
      setExecutions(generateMockWorkflowExecutions());
    }
  };

  const toggleWorkflow = async (workflowId: string, enabled: boolean) => {
    try {
      const { error } = await supabase
        .from('n8n_workflows')
        .update({ enabled: !enabled, updated_at: new Date().toISOString() })
        .eq('id', workflowId);

      if (error) throw error;
      loadWorkflows();
    } catch (error) {
      console.error('Error toggling workflow:', error);
    }
  };

  const executeWorkflow = async (workflow: N8nWorkflow) => {
    try {
      const execution = await supabase
        .from('workflow_executions')
        .insert([
          {
            workflow_id: workflow.id,
            execution_status: 'pending',
            trigger_data: { manual: true, timestamp: new Date().toISOString() },
          },
        ])
        .select()
        .single();

      if (execution.error) throw execution.error;

      const response = await fetch(workflow.n8n_webhook_url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(workflow.auth_method === 'header' && workflow.auth_credentials?.token
            ? { Authorization: `Bearer ${workflow.auth_credentials.token}` }
            : {}),
        },
        body: JSON.stringify({
          execution_id: execution.data.id,
          workflow_id: workflow.id,
          trigger_type: 'manual',
          timestamp: new Date().toISOString(),
        }),
      });

      const responseData = await response.json();

      await supabase
        .from('workflow_executions')
        .update({
          execution_status: response.ok ? 'success' : 'failed',
          response_data: responseData,
          completed_at: new Date().toISOString(),
        })
        .eq('id', execution.data.id);

      loadExecutions();
    } catch (error) {
      console.error('Error executing workflow:', error);
    }
  };

  const getWorkflowTypeColor = (type: string) => {
    switch (type) {
      case 'response':
        return 'bg-red-500/20 text-red-400 border-red-500/30';
      case 'investigation':
        return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      case 'notification':
        return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
      case 'remediation':
        return 'bg-green-500/20 text-green-400 border-green-500/30';
      default:
        return 'bg-slate-500/20 text-slate-400 border-slate-500/30';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'failed':
        return <XCircle className="w-5 h-5 text-red-500" />;
      case 'running':
        return <Clock className="w-5 h-5 text-blue-500 animate-spin" />;
      case 'pending':
        return <Clock className="w-5 h-5 text-yellow-500" />;
      default:
        return <Clock className="w-5 h-5 text-slate-500" />;
    }
  };

  if (loading) {
    return (
      <div className="bg-slate-900/50 backdrop-blur-lg rounded-xl border border-slate-800 p-6">
        <div className="text-center py-12">
          <Workflow className="w-16 h-16 text-slate-600 mx-auto mb-4 animate-pulse" />
          <p className="text-slate-400">Loading workflows...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-900/50 backdrop-blur-lg rounded-xl border border-slate-800 p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-white flex items-center space-x-2">
          <Workflow className="w-6 h-6 text-blue-500" />
          <span>n8n Workflow Automation</span>
        </h2>
        <div className="flex space-x-3">
          <button
            onClick={() => setActiveTab('workflows')}
            className={`px-4 py-2 rounded-lg transition-colors ${
              activeTab === 'workflows' ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >
            Workflows
          </button>
          <button
            onClick={() => setActiveTab('executions')}
            className={`px-4 py-2 rounded-lg transition-colors ${
              activeTab === 'executions' ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >
            Executions
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors flex items-center space-x-2"
          >
            <Plus className="w-5 h-5" />
            <span>New Workflow</span>
          </button>
        </div>
      </div>

      {activeTab === 'workflows' ? (
        workflows.length === 0 ? (
          <div className="text-center py-12">
            <Workflow className="w-16 h-16 text-slate-600 mx-auto mb-4" />
            <p className="text-slate-400">No workflows configured</p>
            <p className="text-slate-500 text-sm mt-2">Create workflows to automate security responses with n8n</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {workflows.map((workflow) => (
              <div
                key={workflow.id}
                className="bg-slate-800/50 rounded-lg border border-slate-700 p-5 hover:border-slate-600 transition-colors"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-2">
                      <Zap className="w-5 h-5 text-blue-500" />
                      <h3 className="text-white font-semibold text-sm">{workflow.name}</h3>
                    </div>
                    <p className="text-slate-400 text-xs line-clamp-2">{workflow.description}</p>
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => toggleWorkflow(workflow.id, workflow.enabled)}
                      className={`px-3 py-1 rounded text-xs font-semibold transition-colors ${
                        workflow.enabled
                          ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
                          : 'bg-slate-600/20 text-slate-400 hover:bg-slate-600/30'
                      }`}
                    >
                      {workflow.enabled ? 'Enabled' : 'Disabled'}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between mb-4">
                  <span className={`px-2 py-1 rounded text-xs font-semibold border ${getWorkflowTypeColor(workflow.workflow_type)}`}>
                    {workflow.workflow_type}
                  </span>
                  <span className="text-slate-500 text-xs">
                    {new Date(workflow.created_at).toLocaleDateString()}
                  </span>
                </div>

                {workflow.configuration?.steps && Array.isArray(workflow.configuration.steps) && (
                  <div className="mb-4 bg-slate-900/50 rounded p-3 border border-slate-700">
                    <p className="text-slate-400 text-xs font-semibold mb-2">Automation Steps:</p>
                    <div className="space-y-1 max-h-24 overflow-y-auto">
                      {workflow.configuration.steps.slice(0, 3).map((step: string, idx: number) => (
                        <div key={idx} className="flex items-start space-x-2">
                          <span className="text-blue-400 text-xs font-mono">{idx + 1}.</span>
                          <span className="text-slate-300 text-xs">{step}</span>
                        </div>
                      ))}
                      {workflow.configuration.steps.length > 3 && (
                        <p className="text-slate-500 text-xs italic">+{workflow.configuration.steps.length - 3} more steps</p>
                      )}
                    </div>
                  </div>
                )}

                {workflow.configuration?.integrations && Array.isArray(workflow.configuration.integrations) && (
                  <div className="mb-4 flex flex-wrap gap-1">
                    {workflow.configuration.integrations.slice(0, 4).map((integration: string, idx: number) => (
                      <span key={idx} className="px-2 py-0.5 bg-blue-900/30 text-blue-300 text-xs rounded border border-blue-700/30">
                        {integration}
                      </span>
                    ))}
                    {workflow.configuration.integrations.length > 4 && (
                      <span className="px-2 py-0.5 bg-slate-700/30 text-slate-400 text-xs rounded">
                        +{workflow.configuration.integrations.length - 4}
                      </span>
                    )}
                  </div>
                )}

                <div className="flex space-x-2">
                  <button
                    onClick={() => executeWorkflow(workflow)}
                    disabled={!workflow.enabled}
                    className={`flex-1 px-4 py-2 rounded-lg transition-colors flex items-center justify-center space-x-2 ${
                      workflow.enabled
                        ? 'bg-blue-600 hover:bg-blue-700 text-white'
                        : 'bg-slate-700 text-slate-500 cursor-not-allowed'
                    }`}
                  >
                    <Play className="w-4 h-4" />
                    <span>Execute</span>
                  </button>
                  <button
                    onClick={() => setSelectedWorkflow(workflow)}
                    className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
                  >
                    <Settings className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        <div className="space-y-3 max-h-[600px] overflow-y-auto">
          {executions.length === 0 ? (
            <div className="text-center py-12">
              <Clock className="w-16 h-16 text-slate-600 mx-auto mb-4" />
              <p className="text-slate-400">No executions yet</p>
              <p className="text-slate-500 text-sm mt-2">Workflow executions will appear here</p>
            </div>
          ) : (
            executions.map((execution) => {
              const workflow = workflows.find((w) => w.id === execution.workflow_id);
              return (
                <div
                  key={execution.id}
                  className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 hover:bg-slate-800 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center space-x-3 flex-1">
                      {getStatusIcon(execution.execution_status)}
                      <div className="flex-1">
                        <h3 className="text-white font-semibold">{workflow?.name || 'Unknown Workflow'}</h3>
                        <div className="flex items-center space-x-4 mt-1 text-sm text-slate-400">
                          <span>{new Date(execution.started_at).toLocaleString()}</span>
                          {execution.execution_time_ms && (
                            <span>{execution.execution_time_ms}ms</span>
                          )}
                        </div>
                        {execution.error_message && (
                          <p className="text-red-400 text-sm mt-2">{execution.error_message}</p>
                        )}
                      </div>
                    </div>
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-semibold ${
                        execution.execution_status === 'success'
                          ? 'bg-green-500/20 text-green-400'
                          : execution.execution_status === 'failed'
                          ? 'bg-red-500/20 text-red-400'
                          : 'bg-yellow-500/20 text-yellow-400'
                      }`}
                    >
                      {execution.execution_status}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {showCreateModal && (
        <CreateWorkflowModal
          onClose={() => setShowCreateModal(false)}
          onCreated={() => {
            setShowCreateModal(false);
            loadWorkflows();
          }}
        />
      )}

      {selectedWorkflow && (
        <WorkflowDetailsModal
          workflow={selectedWorkflow}
          onClose={() => setSelectedWorkflow(null)}
          onUpdated={() => {
            setSelectedWorkflow(null);
            loadWorkflows();
          }}
        />
      )}
    </div>
  );
};

const CreateWorkflowModal = ({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) => {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    n8n_webhook_url: '',
    workflow_type: 'response',
    enabled: true,
    auth_method: 'header',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { error } = await supabase.from('n8n_workflows').insert([
        {
          ...formData,
          configuration: {},
          auth_credentials: {},
        },
      ]);

      if (error) throw error;
      onCreated();
    } catch (error) {
      console.error('Error creating workflow:', error);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-6 max-w-md w-full mx-4">
        <h3 className="text-xl font-semibold text-white mb-4">Create n8n Workflow</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-slate-400 text-sm mb-2">Workflow Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
              required
            />
          </div>
          <div>
            <label className="block text-slate-400 text-sm mb-2">n8n Webhook URL</label>
            <input
              type="url"
              value={formData.n8n_webhook_url}
              onChange={(e) => setFormData({ ...formData, n8n_webhook_url: e.target.value })}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
              placeholder="https://your-n8n.com/webhook/..."
              required
            />
          </div>
          <div>
            <label className="block text-slate-400 text-sm mb-2">Workflow Type</label>
            <select
              value={formData.workflow_type}
              onChange={(e) => setFormData({ ...formData, workflow_type: e.target.value })}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
            >
              <option value="response">Response</option>
              <option value="investigation">Investigation</option>
              <option value="notification">Notification</option>
              <option value="remediation">Remediation</option>
            </select>
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
          <div className="flex space-x-3 pt-4">
            <button
              type="submit"
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
            >
              Create Workflow
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

const WorkflowDetailsModal = ({
  workflow,
  onClose,
  onUpdated,
}: {
  workflow: N8nWorkflow;
  onClose: () => void;
  onUpdated: () => void;
}) => {
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-6 max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-semibold text-white">{workflow.name}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-2xl">
            ×
          </button>
        </div>
        <div className="space-y-6">
          <div>
            <p className="text-slate-400 text-sm mb-2">Description</p>
            <p className="text-white">{workflow.description}</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-slate-400 text-sm">Type</p>
              <p className="text-white capitalize">{workflow.workflow_type}</p>
            </div>
            <div>
              <p className="text-slate-400 text-sm">Status</p>
              <p className={workflow.enabled ? 'text-green-400' : 'text-slate-400'}>
                {workflow.enabled ? 'Enabled' : 'Disabled'}
              </p>
            </div>
          </div>
          <div>
            <p className="text-slate-400 text-sm mb-2">Webhook URL</p>
            <p className="text-white font-mono text-sm bg-slate-800/50 p-3 rounded break-all">
              {workflow.n8n_webhook_url}
            </p>
          </div>

          {workflow.configuration?.steps && Array.isArray(workflow.configuration.steps) && (
            <div>
              <p className="text-slate-400 text-sm mb-3 font-semibold">Automation Workflow Steps</p>
              <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
                <div className="space-y-3">
                  {workflow.configuration.steps.map((step: string, idx: number) => (
                    <div key={idx} className="flex items-start space-x-3">
                      <div className="flex-shrink-0 w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center">
                        <span className="text-white text-xs font-bold">{idx + 1}</span>
                      </div>
                      <div className="flex-1">
                        <p className="text-slate-200 text-sm">{step}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {workflow.configuration?.integrations && Array.isArray(workflow.configuration.integrations) && (
            <div>
              <p className="text-slate-400 text-sm mb-3 font-semibold">System Integrations</p>
              <div className="flex flex-wrap gap-2">
                {workflow.configuration.integrations.map((integration: string, idx: number) => (
                  <span
                    key={idx}
                    className="px-3 py-2 bg-blue-900/30 text-blue-300 text-sm rounded-lg border border-blue-700/30 font-medium"
                  >
                    {integration}
                  </span>
                ))}
              </div>
            </div>
          )}

          {workflow.configuration && Object.keys(workflow.configuration).filter(k => !['steps', 'integrations'].includes(k)).length > 0 && (
            <div>
              <p className="text-slate-400 text-sm mb-3 font-semibold">Configuration Parameters</p>
              <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
                <div className="grid grid-cols-2 gap-4">
                  {Object.entries(workflow.configuration)
                    .filter(([key]) => !['steps', 'integrations'].includes(key))
                    .map(([key, value]) => (
                      <div key={key}>
                        <p className="text-slate-400 text-xs mb-1 capitalize">{key.replace(/_/g, ' ')}</p>
                        <p className="text-white text-sm font-mono">
                          {typeof value === 'boolean' ? (value ? 'Yes' : 'No') :
                           typeof value === 'object' ? JSON.stringify(value) : String(value)}
                        </p>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default WorkflowsPanel;
