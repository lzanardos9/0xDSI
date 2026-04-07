import { useState, useEffect } from 'react';
import { Database, Plus, Trash2, CreditCard as Edit2, Shield } from 'lucide-react';
import { supabase, ActiveList } from '../lib/supabase';
import { generateMockActiveLists } from '../lib/mockData';

const ActiveListsPanel = () => {
  const [lists, setLists] = useState<ActiveList[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedList, setSelectedList] = useState<ActiveList | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadLists();
  }, []);

  const loadLists = async () => {
    try {
      const { data, error } = await supabase
        .from('active_lists')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setLists(data && data.length > 0 ? data : generateMockActiveLists());
    } catch (error) {
      console.error('Error loading active lists:', error);
    } finally {
      setLoading(false);
    }
  };

  const getListTypeColor = (type: string) => {
    switch (type) {
      case 'blocklist':
        return 'bg-red-500/20 text-red-400 border-red-500/30';
      case 'allowlist':
        return 'bg-green-500/20 text-green-400 border-green-500/30';
      case 'watchlist':
        return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
      default:
        return 'bg-slate-500/20 text-slate-400 border-slate-500/30';
    }
  };

  const getCategoryIcon = (category: string) => {
    return <Shield className="w-4 h-4" />;
  };

  return (
    <div className="bg-slate-900/50 backdrop-blur-lg rounded-xl border border-slate-800 p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-white flex items-center space-x-2">
          <Database className="w-6 h-6 text-blue-500" />
          <span>Active Lists Management</span>
        </h2>
        <button
          onClick={() => setShowCreateModal(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors flex items-center space-x-2"
        >
          <Plus className="w-5 h-5" />
          <span>New List</span>
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-slate-400">Loading active lists...</div>
      ) : lists.length === 0 ? (
        <div className="text-center py-12">
          <Database className="w-16 h-16 text-slate-600 mx-auto mb-4" />
          <p className="text-slate-400">No active lists found</p>
          <p className="text-slate-500 text-sm mt-2">Create lists to manage blocklists, allowlists, and watchlists</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {lists.map((list) => (
            <div
              key={list.id}
              className="bg-slate-800/50 rounded-lg border border-slate-700 p-4 hover:border-slate-600 transition-colors cursor-pointer"
              onClick={() => setSelectedList(list)}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center space-x-2">
                  {getCategoryIcon(list.category)}
                  <h3 className="text-white font-semibold">{list.name}</h3>
                </div>
                <span className={`px-2 py-1 rounded text-xs font-semibold border ${getListTypeColor(list.list_type)}`}>
                  {list.list_type}
                </span>
              </div>
              <p className="text-slate-400 text-sm mb-3 line-clamp-2">{list.description}</p>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">
                  {Array.isArray(list.entries) ? list.entries.length : 0} entries
                </span>
                <span className="text-slate-500 capitalize">{list.category}</span>
              </div>
              {list.auto_update && (
                <div className="mt-2 flex items-center space-x-1 text-blue-400 text-xs">
                  <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                  <span>Auto-update enabled</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showCreateModal && (
        <CreateListModal
          onClose={() => setShowCreateModal(false)}
          onCreated={() => {
            setShowCreateModal(false);
            loadLists();
          }}
        />
      )}

      {selectedList && (
        <ListDetailsModal
          list={selectedList}
          onClose={() => setSelectedList(null)}
          onUpdated={() => {
            setSelectedList(null);
            loadLists();
          }}
        />
      )}
    </div>
  );
};

const CreateListModal = ({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) => {
  const [formData, setFormData] = useState({
    name: '',
    list_type: 'blocklist',
    category: 'ip',
    description: '',
    auto_update: false,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { error } = await supabase.from('active_lists').insert([
        {
          ...formData,
          entries: [],
        },
      ]);

      if (error) throw error;
      onCreated();
    } catch (error) {
      console.error('Error creating list:', error);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-6 max-w-md w-full mx-4">
        <h3 className="text-xl font-semibold text-white mb-4">Create New Active List</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-slate-400 text-sm mb-2">List Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
              required
            />
          </div>
          <div>
            <label className="block text-slate-400 text-sm mb-2">List Type</label>
            <select
              value={formData.list_type}
              onChange={(e) => setFormData({ ...formData, list_type: e.target.value })}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
            >
              <option value="blocklist">Blocklist</option>
              <option value="allowlist">Allowlist</option>
              <option value="watchlist">Watchlist</option>
            </select>
          </div>
          <div>
            <label className="block text-slate-400 text-sm mb-2">Category</label>
            <select
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
            >
              <option value="ip">IP Address</option>
              <option value="domain">Domain</option>
              <option value="user">User</option>
              <option value="hash">Hash</option>
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
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={formData.auto_update}
              onChange={(e) => setFormData({ ...formData, auto_update: e.target.checked })}
              className="w-4 h-4 rounded"
            />
            <label className="text-slate-400 text-sm">Enable auto-update</label>
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

const ListDetailsModal = ({
  list,
  onClose,
  onUpdated,
}: {
  list: ActiveList;
  onClose: () => void;
  onUpdated: () => void;
}) => {
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-semibold text-white">{list.name}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            ×
          </button>
        </div>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-slate-400 text-sm">Type</p>
              <p className="text-white capitalize">{list.list_type}</p>
            </div>
            <div>
              <p className="text-slate-400 text-sm">Category</p>
              <p className="text-white capitalize">{list.category}</p>
            </div>
          </div>
          <div>
            <p className="text-slate-400 text-sm mb-2">Description</p>
            <p className="text-white">{list.description}</p>
          </div>
          <div>
            <p className="text-slate-400 text-sm mb-2">Entries ({Array.isArray(list.entries) ? list.entries.length : 0})</p>
            <div className="bg-slate-800/50 rounded-lg p-4 max-h-60 overflow-y-auto">
              {Array.isArray(list.entries) && list.entries.length > 0 ? (
                <ul className="space-y-2">
                  {list.entries.map((entry: any, idx: number) => (
                    <li key={idx} className="text-slate-300 font-mono text-sm">
                      {typeof entry === 'string' ? entry : JSON.stringify(entry)}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-slate-500 text-sm">No entries yet</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ActiveListsPanel;
