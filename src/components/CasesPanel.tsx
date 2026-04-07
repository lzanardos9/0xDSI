import { useState, useEffect } from 'react';
import { Briefcase, Plus, Search, Filter, User, Clock, MessageSquare, FileText, X, CheckCircle } from 'lucide-react';
import { supabase, Case, CaseComment, CaseTimeline } from '../lib/supabase';
import { generateMockCases } from '../lib/mockData';

const CasesPanel = () => {
  const [cases, setCases] = useState<Case[]>([]);
  const [selectedCase, setSelectedCase] = useState<Case | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | string>('all');
  const [priorityFilter, setPriorityFilter] = useState<'all' | string>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadCases();
    const interval = setInterval(loadCases, 10000);
    return () => clearInterval(interval);
  }, [statusFilter, priorityFilter]);

  const loadCases = async () => {
    try {
      let query = supabase
        .from('cases')
        .select('*')
        .order('created_at', { ascending: false });

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      if (priorityFilter !== 'all') {
        query = query.eq('priority', priorityFilter);
      }

      const { data, error } = await query;

      if (error) throw error;
      setCases(data && data.length > 0 ? data : generateMockCases());
    } catch (error) {
      console.error('Error loading cases:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredCases = cases.filter((c) => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    return (
      c.case_number.toLowerCase().includes(search) ||
      c.title.toLowerCase().includes(search) ||
      c.category.toLowerCase().includes(search)
    );
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'new':
        return 'bg-blue-500/20 text-blue-400 border-blue-500/50';
      case 'investigating':
        return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50';
      case 'contained':
        return 'bg-orange-500/20 text-orange-400 border-orange-500/50';
      case 'resolved':
        return 'bg-green-500/20 text-green-400 border-green-500/50';
      case 'closed':
        return 'bg-slate-500/20 text-slate-400 border-slate-500/50';
      default:
        return 'bg-slate-500/20 text-slate-400 border-slate-500/50';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
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

  const stats = {
    total: cases.length,
    new: cases.filter((c) => c.status === 'new').length,
    investigating: cases.filter((c) => c.status === 'investigating').length,
    resolved: cases.filter((c) => c.status === 'resolved').length,
  };

  return (
    <div className="bg-slate-900/50 backdrop-blur-lg rounded-xl border border-slate-800 p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-white flex items-center space-x-2">
          <Briefcase className="w-6 h-6 text-blue-500" />
          <span>Incident Cases</span>
        </h2>
        <button
          onClick={() => setShowCreateModal(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors flex items-center space-x-2"
        >
          <Plus className="w-5 h-5" />
          <span>New Case</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <StatCard title="Total Cases" value={stats.total} color="blue" />
        <StatCard title="New" value={stats.new} color="blue" />
        <StatCard title="Investigating" value={stats.investigating} color="yellow" />
        <StatCard title="Resolved" value={stats.resolved} color="green" />
      </div>

      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-5 h-5" />
          <input
            type="text"
            placeholder="Search cases..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
        >
          <option value="all">All Status</option>
          <option value="new">New</option>
          <option value="investigating">Investigating</option>
          <option value="contained">Contained</option>
          <option value="resolved">Resolved</option>
          <option value="closed">Closed</option>
        </select>
        <select
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value)}
          className="px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
        >
          <option value="all">All Priority</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
      </div>

      {loading ? (
        <div className="text-center py-12 text-slate-400">Loading cases...</div>
      ) : filteredCases.length === 0 ? (
        <div className="text-center py-12">
          <Briefcase className="w-16 h-16 text-slate-600 mx-auto mb-4" />
          <p className="text-slate-400">No cases found</p>
          <p className="text-slate-500 text-sm mt-2">Create a new case to start tracking incidents</p>
        </div>
      ) : (
        <div className="space-y-3 max-h-[600px] overflow-y-auto">
          {filteredCases.map((caseItem) => (
            <div
              key={caseItem.id}
              onClick={() => setSelectedCase(caseItem)}
              className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <div className="flex items-center space-x-3 mb-2">
                    <span className="text-slate-400 text-sm font-mono">{caseItem.case_number}</span>
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${getStatusColor(caseItem.status)}`}>
                      {caseItem.status}
                    </span>
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${getPriorityColor(caseItem.priority)}`}>
                      {caseItem.priority}
                    </span>
                  </div>
                  <h3 className="text-white font-semibold text-lg mb-1">{caseItem.title}</h3>
                  <p className="text-slate-400 text-sm line-clamp-2 mb-3">{caseItem.description}</p>
                  <div className="flex flex-wrap items-center gap-4 text-sm">
                    <div className="flex items-center space-x-2 text-slate-400">
                      <User className="w-4 h-4" />
                      <span>{caseItem.assigned_to || 'Unassigned'}</span>
                    </div>
                    <div className="flex items-center space-x-2 text-slate-400">
                      <Clock className="w-4 h-4" />
                      <span>{new Date(caseItem.created_at).toLocaleDateString()}</span>
                    </div>
                    <div className="flex items-center space-x-2 text-slate-400">
                      <FileText className="w-4 h-4" />
                      <span className="capitalize">{caseItem.category}</span>
                    </div>
                  </div>
                  {caseItem.tags.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {caseItem.tags.map((tag, idx) => (
                        <span
                          key={idx}
                          className="px-2 py-1 bg-slate-700/50 text-slate-300 rounded text-xs"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreateModal && (
        <CreateCaseModal
          onClose={() => setShowCreateModal(false)}
          onCreated={() => {
            setShowCreateModal(false);
            loadCases();
          }}
        />
      )}

      {selectedCase && (
        <CaseDetailsModal
          caseItem={selectedCase}
          onClose={() => setSelectedCase(null)}
          onUpdated={() => {
            setSelectedCase(null);
            loadCases();
          }}
        />
      )}
    </div>
  );
};

const StatCard = ({ title, value, color }: { title: string; value: number; color: string }) => {
  const colorClasses: Record<string, string> = {
    blue: 'bg-blue-500/20 border-blue-500/30',
    yellow: 'bg-yellow-500/20 border-yellow-500/30',
    green: 'bg-green-500/20 border-green-500/30',
    red: 'bg-red-500/20 border-red-500/30',
  };

  return (
    <div className={`rounded-lg border p-4 ${colorClasses[color]}`}>
      <p className="text-slate-400 text-sm mb-1">{title}</p>
      <p className="text-white text-2xl font-bold">{value}</p>
    </div>
  );
};

const CreateCaseModal = ({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) => {
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    category: 'malware',
    priority: 'medium',
    severity: 'medium',
    assigned_to: '',
    tags: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { error } = await supabase.from('cases').insert([
        {
          title: formData.title,
          description: formData.description,
          category: formData.category,
          priority: formData.priority,
          severity: formData.severity,
          assigned_to: formData.assigned_to || null,
          created_by: 'current_user',
          case_number: '',
          tags: formData.tags.split(',').map(t => t.trim()).filter(t => t),
          related_event_ids: [],
          related_alert_ids: [],
        },
      ]);

      if (error) throw error;
      onCreated();
    } catch (error) {
      console.error('Error creating case:', error);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-semibold text-white">Create New Case</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-6 h-6" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-slate-400 text-sm mb-2">Title</label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
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
              rows={4}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-400 text-sm mb-2">Category</label>
              <select
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
              >
                <option value="malware">Malware</option>
                <option value="phishing">Phishing</option>
                <option value="data_breach">Data Breach</option>
                <option value="unauthorized_access">Unauthorized Access</option>
                <option value="ddos">DDoS</option>
                <option value="insider_threat">Insider Threat</option>
                <option value="ransomware">Ransomware</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-slate-400 text-sm mb-2">Assigned To</label>
              <input
                type="text"
                value={formData.assigned_to}
                onChange={(e) => setFormData({ ...formData, assigned_to: e.target.value })}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
                placeholder="Username or team"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-400 text-sm mb-2">Priority</label>
              <select
                value={formData.priority}
                onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
            <div>
              <label className="block text-slate-400 text-sm mb-2">Severity</label>
              <select
                value={formData.severity}
                onChange={(e) => setFormData({ ...formData, severity: e.target.value })}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-slate-400 text-sm mb-2">Tags (comma-separated)</label>
            <input
              type="text"
              value={formData.tags}
              onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
              placeholder="e.g., urgent, external, compliance"
            />
          </div>
          <div className="flex space-x-3 pt-4">
            <button
              type="submit"
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
            >
              Create Case
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

const CaseDetailsModal = ({
  caseItem,
  onClose,
  onUpdated,
}: {
  caseItem: Case;
  onClose: () => void;
  onUpdated: () => void;
}) => {
  const [comments, setComments] = useState<CaseComment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [activeTab, setActiveTab] = useState<'details' | 'timeline' | 'comments'>('details');

  useEffect(() => {
    if (activeTab === 'comments') {
      loadComments();
    }
  }, [activeTab, caseItem.id]);

  const loadComments = async () => {
    try {
      const { data, error } = await supabase
        .from('case_comments')
        .select('*')
        .eq('case_id', caseItem.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setComments(data || []);
    } catch (error) {
      console.error('Error loading comments:', error);
    }
  };

  const addComment = async () => {
    if (!newComment.trim()) return;

    try {
      const { error } = await supabase.from('case_comments').insert([
        {
          case_id: caseItem.id,
          author: 'current_user',
          comment: newComment,
          is_internal: false,
        },
      ]);

      if (error) throw error;
      setNewComment('');
      loadComments();
    } catch (error) {
      console.error('Error adding comment:', error);
    }
  };

  const updateStatus = async (status: string) => {
    try {
      const { error } = await supabase
        .from('cases')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', caseItem.id);

      if (error) throw error;
      onUpdated();
    } catch (error) {
      console.error('Error updating status:', error);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-6 max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="flex items-center space-x-3 mb-2">
              <span className="text-slate-400 text-sm font-mono">{caseItem.case_number}</span>
              <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${
                caseItem.status === 'new' ? 'bg-blue-500/20 text-blue-400 border-blue-500/50' :
                caseItem.status === 'investigating' ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50' :
                caseItem.status === 'contained' ? 'bg-orange-500/20 text-orange-400 border-orange-500/50' :
                caseItem.status === 'resolved' ? 'bg-green-500/20 text-green-400 border-green-500/50' :
                'bg-slate-500/20 text-slate-400 border-slate-500/50'
              }`}>
                {caseItem.status}
              </span>
            </div>
            <h3 className="text-2xl font-semibold text-white">{caseItem.title}</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex space-x-2 mb-6 border-b border-slate-800">
          <button
            onClick={() => setActiveTab('details')}
            className={`px-4 py-2 transition-colors ${
              activeTab === 'details'
                ? 'text-blue-400 border-b-2 border-blue-400'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Details
          </button>
          <button
            onClick={() => setActiveTab('comments')}
            className={`px-4 py-2 transition-colors ${
              activeTab === 'comments'
                ? 'text-blue-400 border-b-2 border-blue-400'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Comments
          </button>
          <button
            onClick={() => setActiveTab('timeline')}
            className={`px-4 py-2 transition-colors ${
              activeTab === 'timeline'
                ? 'text-blue-400 border-b-2 border-blue-400'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Timeline
          </button>
        </div>

        {activeTab === 'details' && (
          <div className="space-y-6">
            <div>
              <label className="text-slate-400 text-sm">Description</label>
              <p className="text-white mt-1">{caseItem.description || 'No description provided'}</p>
            </div>
            <div className="grid grid-cols-2 gap-6">
              <div>
                <label className="text-slate-400 text-sm">Priority</label>
                <p className="text-white mt-1 capitalize">{caseItem.priority}</p>
              </div>
              <div>
                <label className="text-slate-400 text-sm">Severity</label>
                <p className="text-white mt-1 capitalize">{caseItem.severity}</p>
              </div>
              <div>
                <label className="text-slate-400 text-sm">Category</label>
                <p className="text-white mt-1 capitalize">{caseItem.category.replace('_', ' ')}</p>
              </div>
              <div>
                <label className="text-slate-400 text-sm">Assigned To</label>
                <p className="text-white mt-1">{caseItem.assigned_to || 'Unassigned'}</p>
              </div>
              <div>
                <label className="text-slate-400 text-sm">Created</label>
                <p className="text-white mt-1">{new Date(caseItem.created_at).toLocaleString()}</p>
              </div>
              <div>
                <label className="text-slate-400 text-sm">Last Updated</label>
                <p className="text-white mt-1">{new Date(caseItem.updated_at).toLocaleString()}</p>
              </div>
            </div>
            {caseItem.tags.length > 0 && (
              <div>
                <label className="text-slate-400 text-sm mb-2 block">Tags</label>
                <div className="flex flex-wrap gap-2">
                  {caseItem.tags.map((tag, idx) => (
                    <span
                      key={idx}
                      className="px-3 py-1 bg-slate-700/50 text-slate-300 rounded-full text-sm"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}
            <div className="pt-4 border-t border-slate-800">
              <label className="text-slate-400 text-sm mb-2 block">Update Status</label>
              <div className="flex flex-wrap gap-2">
                {['investigating', 'contained', 'resolved', 'closed'].map((status) => (
                  <button
                    key={status}
                    onClick={() => updateStatus(status)}
                    disabled={caseItem.status === status}
                    className={`px-4 py-2 rounded-lg transition-colors ${
                      caseItem.status === status
                        ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                        : 'bg-blue-600 hover:bg-blue-700 text-white'
                    }`}
                  >
                    Mark as {status.charAt(0).toUpperCase() + status.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'comments' && (
          <div className="space-y-4">
            <div className="flex gap-2">
              <input
                type="text"
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Add a comment..."
                className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
                onKeyPress={(e) => e.key === 'Enter' && addComment()}
              />
              <button
                onClick={addComment}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg transition-colors"
              >
                Add
              </button>
            </div>
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {comments.length === 0 ? (
                <p className="text-slate-400 text-center py-8">No comments yet</p>
              ) : (
                comments.map((comment) => (
                  <div key={comment.id} className="bg-slate-800/50 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-blue-400 font-semibold">{comment.author}</span>
                      <span className="text-slate-500 text-sm">
                        {new Date(comment.created_at).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-slate-300">{comment.comment}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {activeTab === 'timeline' && (
          <div className="space-y-3">
            <div className="bg-slate-800/50 rounded-lg p-4">
              <div className="flex items-start space-x-3">
                <CheckCircle className="w-5 h-5 text-green-500 mt-1" />
                <div>
                  <p className="text-white font-semibold">Case Created</p>
                  <p className="text-slate-400 text-sm">
                    by {caseItem.created_by} • {new Date(caseItem.created_at).toLocaleString()}
                  </p>
                </div>
              </div>
            </div>
            {caseItem.resolved_at && (
              <div className="bg-slate-800/50 rounded-lg p-4">
                <div className="flex items-start space-x-3">
                  <CheckCircle className="w-5 h-5 text-blue-500 mt-1" />
                  <div>
                    <p className="text-white font-semibold">Case Resolved</p>
                    <p className="text-slate-400 text-sm">
                      {new Date(caseItem.resolved_at).toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default CasesPanel;
