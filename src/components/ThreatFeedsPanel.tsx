import { useState, useEffect } from 'react';
import { Rss, RefreshCw, CheckCircle, XCircle, Clock, Plus, Pencil, Trash2, X, Save } from 'lucide-react';
import { supabase, ThreatFeed, FeedSyncLog } from '../lib/supabase';
import { generateMockThreatFeeds, generateMockSyncLogs } from '../lib/mockData';

interface FeedFormData {
  feed_name: string;
  feed_source: string;
  feed_type: string;
  feed_url: string;
  description: string;
  enabled: boolean;
  polling_interval_seconds: number;
  auth_type: string;
  auth_credentials: string;
  ioc_types: string[];
  confidence_threshold: number;
  tlp_level: string;
}

const EMPTY_FORM: FeedFormData = {
  feed_name: '',
  feed_source: '',
  feed_type: 'stix_taxii',
  feed_url: '',
  description: '',
  enabled: true,
  polling_interval_seconds: 3600,
  auth_type: 'none',
  auth_credentials: '',
  ioc_types: ['ip', 'domain', 'url', 'hash'],
  confidence_threshold: 50,
  tlp_level: 'amber',
};

const FEED_SOURCES = [
  'abuse_ch_urlhaus', 'abuse_ch_threatfox', 'alienvault_otx', 'circl',
  'openphish', 'shadowserver', 'misp', 'taxii_server', 'custom_api',
  'cisa_kev', 'mandiant', 'recorded_future', 'crowdstrike',
];

const FEED_TYPES = ['stix_taxii', 'csv', 'json_api', 'misp_feed', 'custom'];
const IOC_TYPES = ['ip', 'domain', 'url', 'hash', 'email', 'file_path', 'cve', 'mutex', 'registry'];
const TLP_LEVELS = ['white', 'green', 'amber', 'red'];
const AUTH_TYPES = ['none', 'api_key', 'bearer_token', 'basic_auth', 'certificate'];

const ThreatFeedsPanel = () => {
  const [feeds, setFeeds] = useState<ThreatFeed[]>([]);
  const [syncLogs, setSyncLogs] = useState<FeedSyncLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'feeds' | 'logs'>('feeds');
  const [showModal, setShowModal] = useState(false);
  const [editingFeed, setEditingFeed] = useState<ThreatFeed | null>(null);
  const [formData, setFormData] = useState<FeedFormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  useEffect(() => {
    loadFeeds();
    loadSyncLogs();
    const interval = setInterval(() => {
      loadFeeds();
      loadSyncLogs();
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  const loadFeeds = async () => {
    try {
      const { data, error } = await supabase
        .from('threat_feeds')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setFeeds(data && data.length > 0 ? data : generateMockThreatFeeds());
    } catch (error) {
      console.error('Error loading feeds:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadSyncLogs = async () => {
    try {
      const { data, error } = await supabase
        .from('feed_sync_logs')
        .select('*')
        .order('started_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setSyncLogs(data && data.length > 0 ? data : generateMockSyncLogs());
    } catch (error) {
      console.error('Error loading sync logs:', error);
    }
  };

  const toggleFeed = async (feedId: string, enabled: boolean) => {
    try {
      const { error } = await supabase
        .from('threat_feeds')
        .update({ enabled: !enabled, updated_at: new Date().toISOString() })
        .eq('id', feedId);

      if (error) throw error;
      loadFeeds();
    } catch (error) {
      console.error('Error toggling feed:', error);
    }
  };

  const syncFeed = async (feed: ThreatFeed) => {
    try {
      const startTime = Date.now();
      const logEntry = await supabase
        .from('feed_sync_logs')
        .insert([{
          feed_id: feed.id,
          sync_status: 'in_progress',
          started_at: new Date().toISOString(),
        }])
        .select()
        .single();

      if (logEntry.error) throw logEntry.error;

      await new Promise((resolve) => setTimeout(resolve, 2000));

      const mockResults = {
        indicators_fetched: Math.floor(Math.random() * 1000) + 100,
        indicators_added: Math.floor(Math.random() * 50),
        indicators_updated: Math.floor(Math.random() * 20),
        indicators_removed: Math.floor(Math.random() * 10),
      };

      await supabase
        .from('feed_sync_logs')
        .update({
          sync_status: 'success',
          ...mockResults,
          sync_duration_ms: Date.now() - startTime,
          completed_at: new Date().toISOString(),
        })
        .eq('id', logEntry.data.id);

      await supabase
        .from('threat_feeds')
        .update({
          last_sync_at: new Date().toISOString(),
          last_sync_status: 'success',
          total_indicators: (feed.total_indicators || 0) + mockResults.indicators_added,
          updated_at: new Date().toISOString(),
        })
        .eq('id', feed.id);

      loadFeeds();
      loadSyncLogs();
    } catch (error) {
      console.error('Error syncing feed:', error);
    }
  };

  const openAddModal = () => {
    setEditingFeed(null);
    setFormData(EMPTY_FORM);
    setShowModal(true);
  };

  const openEditModal = (feed: ThreatFeed) => {
    setEditingFeed(feed);
    setFormData({
      feed_name: feed.feed_name || '',
      feed_source: feed.feed_source || '',
      feed_type: feed.feed_type || 'stix_taxii',
      feed_url: (feed as any).feed_url || '',
      description: feed.description || '',
      enabled: feed.enabled ?? true,
      polling_interval_seconds: (feed as any).polling_interval_seconds || 3600,
      auth_type: (feed as any).auth_type || 'none',
      auth_credentials: '',
      ioc_types: (feed as any).ioc_types || ['ip', 'domain', 'url', 'hash'],
      confidence_threshold: (feed as any).confidence_threshold || 50,
      tlp_level: (feed as any).tlp_level || 'amber',
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!formData.feed_name || !formData.feed_source) return;
    setSaving(true);

    try {
      const payload: any = {
        feed_name: formData.feed_name,
        feed_source: formData.feed_source,
        feed_type: formData.feed_type,
        feed_url: formData.feed_url,
        description: formData.description,
        enabled: formData.enabled,
        polling_interval_seconds: formData.polling_interval_seconds,
        auth_type: formData.auth_type,
        ioc_types: formData.ioc_types,
        confidence_threshold: formData.confidence_threshold,
        tlp_level: formData.tlp_level,
        updated_at: new Date().toISOString(),
      };

      if (formData.auth_credentials) {
        payload.auth_credentials = formData.auth_credentials;
      }

      if (editingFeed) {
        const { error } = await supabase
          .from('threat_feeds')
          .update(payload)
          .eq('id', editingFeed.id);
        if (error) throw error;
      } else {
        payload.total_indicators = 0;
        payload.created_at = new Date().toISOString();
        const { error } = await supabase
          .from('threat_feeds')
          .insert([payload]);
        if (error) throw error;
      }

      setShowModal(false);
      loadFeeds();
    } catch (error) {
      console.error('Error saving feed:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (feedId: string) => {
    try {
      const { error } = await supabase
        .from('threat_feeds')
        .update({ enabled: false, updated_at: new Date().toISOString() })
        .eq('id', feedId);
      if (error) throw error;
      setDeleteConfirm(null);
      loadFeeds();
    } catch (error) {
      console.error('Error disabling feed:', error);
    }
  };

  const getFeedSourceColor = (source: string) => {
    const colors: Record<string, string> = {
      abuse_ch_urlhaus: 'bg-red-500/20 text-red-400 border-red-500/30',
      abuse_ch_threatfox: 'bg-red-500/20 text-red-400 border-red-500/30',
      alienvault_otx: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
      circl: 'bg-green-500/20 text-green-400 border-green-500/30',
      openphish: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
      shadowserver: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
      misp: 'bg-teal-500/20 text-teal-400 border-teal-500/30',
      taxii_server: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
      cisa_kev: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
      mandiant: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
      recorded_future: 'bg-sky-500/20 text-sky-400 border-sky-500/30',
      crowdstrike: 'bg-red-600/20 text-red-300 border-red-600/30',
    };
    return colors[source] || 'bg-slate-500/20 text-slate-400 border-slate-500/30';
  };

  const getSyncStatusIcon = (status?: string) => {
    switch (status) {
      case 'success':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'failed':
        return <XCircle className="w-5 h-5 text-red-500" />;
      case 'in_progress':
        return <Clock className="w-5 h-5 text-blue-500 animate-spin" />;
      default:
        return <Clock className="w-5 h-5 text-slate-500" />;
    }
  };

  return (
    <div className="bg-slate-900/50 backdrop-blur-lg rounded-xl border border-slate-800 p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-white flex items-center space-x-2">
          <Rss className="w-6 h-6 text-blue-500" />
          <span>Threat Intelligence Feeds</span>
        </h2>
        <div className="flex space-x-3">
          <button
            onClick={openAddModal}
            className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium transition-colors flex items-center space-x-2"
          >
            <Plus className="w-4 h-4" />
            <span>Add Feed</span>
          </button>
          <button
            onClick={() => setActiveTab('feeds')}
            className={`px-4 py-2 rounded-lg transition-colors ${
              activeTab === 'feeds' ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >
            Feeds
          </button>
          <button
            onClick={() => setActiveTab('logs')}
            className={`px-4 py-2 rounded-lg transition-colors ${
              activeTab === 'logs' ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >
            Sync Logs
          </button>
        </div>
      </div>

      {activeTab === 'feeds' ? (
        loading ? (
          <div className="text-center py-12 text-slate-400">Loading threat feeds...</div>
        ) : feeds.length === 0 ? (
          <div className="text-center py-12">
            <Rss className="w-16 h-16 text-slate-600 mx-auto mb-4" />
            <p className="text-slate-400">No threat feeds configured</p>
            <p className="text-slate-500 text-sm mt-2">Click "Add Feed" to start ingesting threat intelligence</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {feeds.map((feed) => (
              <div
                key={feed.id}
                className="bg-slate-800/50 rounded-lg border border-slate-700 p-5 hover:border-slate-600 transition-colors group"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-2">
                      <Rss className="w-5 h-5 text-blue-500" />
                      <h3 className="text-white font-semibold">{feed.feed_name}</h3>
                    </div>
                    <p className="text-slate-400 text-sm line-clamp-2">{feed.description}</p>
                  </div>
                  <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => openEditModal(feed)}
                      className="p-1.5 rounded hover:bg-slate-600 text-slate-400 hover:text-white transition-colors"
                      title="Edit feed"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setDeleteConfirm(feed.id)}
                      className="p-1.5 rounded hover:bg-red-900/50 text-slate-400 hover:text-red-400 transition-colors"
                      title="Delete feed"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {deleteConfirm === feed.id && (
                  <div className="mb-3 p-3 rounded-lg bg-red-900/20 border border-red-800/50">
                    <p className="text-red-300 text-sm mb-2">Disable this feed?</p>
                    <div className="flex space-x-2">
                      <button
                        onClick={() => handleDelete(feed.id)}
                        className="px-3 py-1 rounded text-xs bg-red-600 hover:bg-red-700 text-white transition-colors"
                      >
                        Confirm
                      </button>
                      <button
                        onClick={() => setDeleteConfirm(null)}
                        className="px-3 py-1 rounded text-xs bg-slate-600 hover:bg-slate-500 text-white transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div>
                    <span className="text-slate-500 text-xs">Source</span>
                    <p className={`text-xs font-semibold px-2 py-1 rounded border mt-1 inline-block ${getFeedSourceColor(feed.feed_source)}`}>
                      {feed.feed_source.replace(/_/g, ' ')}
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-500 text-xs">Type</span>
                    <p className="text-slate-300 text-sm mt-1 capitalize">{feed.feed_type}</p>
                  </div>
                  <div>
                    <span className="text-slate-500 text-xs">Indicators</span>
                    <p className="text-white font-semibold text-sm mt-1">{feed.total_indicators.toLocaleString()}</p>
                  </div>
                  <div>
                    <span className="text-slate-500 text-xs">Last Sync</span>
                    <p className="text-slate-400 text-xs mt-1">
                      {feed.last_sync_at ? new Date(feed.last_sync_at).toLocaleDateString() : 'Never'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-slate-700">
                  <div className="flex items-center space-x-2">
                    {getSyncStatusIcon(feed.last_sync_status)}
                    <span className="text-slate-400 text-xs capitalize">
                      {feed.last_sync_status || 'Never synced'}
                    </span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => toggleFeed(feed.id, feed.enabled)}
                      className={`px-3 py-1 rounded text-xs font-semibold transition-colors ${
                        feed.enabled
                          ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
                          : 'bg-slate-600/20 text-slate-400 hover:bg-slate-600/30'
                      }`}
                    >
                      {feed.enabled ? 'Enabled' : 'Disabled'}
                    </button>
                    <button
                      onClick={() => syncFeed(feed)}
                      disabled={!feed.enabled}
                      className={`px-3 py-1 rounded text-xs font-semibold transition-colors flex items-center space-x-1 ${
                        feed.enabled
                          ? 'bg-blue-600 hover:bg-blue-700 text-white'
                          : 'bg-slate-700 text-slate-500 cursor-not-allowed'
                      }`}
                    >
                      <RefreshCw className="w-3 h-3" />
                      <span>Sync</span>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        <div className="space-y-3 max-h-[600px] overflow-y-auto">
          {syncLogs.length === 0 ? (
            <div className="text-center py-12">
              <Clock className="w-16 h-16 text-slate-600 mx-auto mb-4" />
              <p className="text-slate-400">No sync logs yet</p>
              <p className="text-slate-500 text-sm mt-2">Feed synchronization logs will appear here</p>
            </div>
          ) : (
            syncLogs.map((log) => {
              const feed = feeds.find((f) => f.id === log.feed_id);
              return (
                <div
                  key={log.id}
                  className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 hover:bg-slate-800 transition-colors"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center space-x-3 flex-1">
                      {getSyncStatusIcon(log.sync_status)}
                      <div>
                        <h3 className="text-white font-semibold">{feed?.feed_name || 'Unknown Feed'}</h3>
                        <p className="text-slate-400 text-xs mt-1">
                          {new Date(log.started_at).toLocaleString()}
                          {log.sync_duration_ms && ` • ${log.sync_duration_ms}ms`}
                        </p>
                      </div>
                    </div>
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-semibold ${
                        log.sync_status === 'success'
                          ? 'bg-green-500/20 text-green-400'
                          : log.sync_status === 'failed'
                          ? 'bg-red-500/20 text-red-400'
                          : 'bg-yellow-500/20 text-yellow-400'
                      }`}
                    >
                      {log.sync_status}
                    </span>
                  </div>
                  {log.sync_status === 'success' && (
                    <div className="grid grid-cols-4 gap-3 text-sm">
                      <div>
                        <span className="text-slate-500">Fetched:</span>
                        <span className="text-slate-300 ml-2">{log.indicators_fetched}</span>
                      </div>
                      <div>
                        <span className="text-green-400">Added:</span>
                        <span className="text-slate-300 ml-2">{log.indicators_added}</span>
                      </div>
                      <div>
                        <span className="text-blue-400">Updated:</span>
                        <span className="text-slate-300 ml-2">{log.indicators_updated}</span>
                      </div>
                      <div>
                        <span className="text-red-400">Removed:</span>
                        <span className="text-slate-300 ml-2">{log.indicators_removed}</span>
                      </div>
                    </div>
                  )}
                  {log.error_message && (
                    <p className="text-red-400 text-sm mt-2">{log.error_message}</p>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Add/Edit Feed Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="sticky top-0 bg-slate-900 border-b border-slate-700 px-6 py-4 flex items-center justify-between rounded-t-2xl">
              <h3 className="text-lg font-semibold text-white">
                {editingFeed ? 'Edit Threat Feed' : 'Add New Threat Feed'}
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="p-2 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {/* Feed Name */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Feed Name *</label>
                <input
                  type="text"
                  value={formData.feed_name}
                  onChange={(e) => setFormData({ ...formData, feed_name: e.target.value })}
                  placeholder="e.g., AlienVault OTX - Malware IOCs"
                  className="w-full px-4 py-2.5 bg-slate-800 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-colors"
                />
              </div>

              {/* Source and Type */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">Feed Source *</label>
                  <select
                    value={formData.feed_source}
                    onChange={(e) => setFormData({ ...formData, feed_source: e.target.value })}
                    className="w-full px-4 py-2.5 bg-slate-800 border border-slate-600 rounded-lg text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-colors"
                  >
                    <option value="">Select source...</option>
                    {FEED_SOURCES.map((s) => (
                      <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">Feed Type</label>
                  <select
                    value={formData.feed_type}
                    onChange={(e) => setFormData({ ...formData, feed_type: e.target.value })}
                    className="w-full px-4 py-2.5 bg-slate-800 border border-slate-600 rounded-lg text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-colors"
                  >
                    {FEED_TYPES.map((t) => (
                      <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* URL */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Feed URL</label>
                <input
                  type="url"
                  value={formData.feed_url}
                  onChange={(e) => setFormData({ ...formData, feed_url: e.target.value })}
                  placeholder="https://api.example.com/v1/indicators"
                  className="w-full px-4 py-2.5 bg-slate-800 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-colors"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={2}
                  placeholder="Brief description of what this feed provides..."
                  className="w-full px-4 py-2.5 bg-slate-800 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-colors resize-none"
                />
              </div>

              {/* Authentication */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">Auth Type</label>
                  <select
                    value={formData.auth_type}
                    onChange={(e) => setFormData({ ...formData, auth_type: e.target.value })}
                    className="w-full px-4 py-2.5 bg-slate-800 border border-slate-600 rounded-lg text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-colors"
                  >
                    {AUTH_TYPES.map((a) => (
                      <option key={a} value={a}>{a.replace(/_/g, ' ')}</option>
                    ))}
                  </select>
                </div>
                {formData.auth_type !== 'none' && (
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1.5">
                      {formData.auth_type === 'api_key' ? 'API Key' : formData.auth_type === 'bearer_token' ? 'Token' : 'Credentials'}
                    </label>
                    <input
                      type="password"
                      value={formData.auth_credentials}
                      onChange={(e) => setFormData({ ...formData, auth_credentials: e.target.value })}
                      placeholder={editingFeed ? '(unchanged)' : 'Enter credentials...'}
                      className="w-full px-4 py-2.5 bg-slate-800 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-colors"
                    />
                  </div>
                )}
              </div>

              {/* Polling and Confidence */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">Poll Interval (sec)</label>
                  <input
                    type="number"
                    min={60}
                    step={60}
                    value={formData.polling_interval_seconds}
                    onChange={(e) => setFormData({ ...formData, polling_interval_seconds: parseInt(e.target.value) || 3600 })}
                    className="w-full px-4 py-2.5 bg-slate-800 border border-slate-600 rounded-lg text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">Min Confidence (%)</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={formData.confidence_threshold}
                    onChange={(e) => setFormData({ ...formData, confidence_threshold: parseInt(e.target.value) || 0 })}
                    className="w-full px-4 py-2.5 bg-slate-800 border border-slate-600 rounded-lg text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">TLP Level</label>
                  <select
                    value={formData.tlp_level}
                    onChange={(e) => setFormData({ ...formData, tlp_level: e.target.value })}
                    className="w-full px-4 py-2.5 bg-slate-800 border border-slate-600 rounded-lg text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-colors"
                  >
                    {TLP_LEVELS.map((t) => (
                      <option key={t} value={t}>TLP:{t.toUpperCase()}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* IOC Types */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">IOC Types to Ingest</label>
                <div className="flex flex-wrap gap-2">
                  {IOC_TYPES.map((iocType) => {
                    const selected = formData.ioc_types.includes(iocType);
                    return (
                      <button
                        key={iocType}
                        onClick={() => {
                          setFormData({
                            ...formData,
                            ioc_types: selected
                              ? formData.ioc_types.filter((t) => t !== iocType)
                              : [...formData.ioc_types, iocType],
                          });
                        }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                          selected
                            ? 'bg-blue-600/20 text-blue-300 border-blue-500/50'
                            : 'bg-slate-800 text-slate-400 border-slate-600 hover:border-slate-500'
                        }`}
                      >
                        {iocType}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Enabled toggle */}
              <div className="flex items-center space-x-3">
                <button
                  onClick={() => setFormData({ ...formData, enabled: !formData.enabled })}
                  className={`relative w-11 h-6 rounded-full transition-colors ${
                    formData.enabled ? 'bg-emerald-600' : 'bg-slate-600'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
                      formData.enabled ? 'translate-x-5' : ''
                    }`}
                  />
                </button>
                <span className="text-sm text-slate-300">
                  {formData.enabled ? 'Feed enabled (will sync automatically)' : 'Feed disabled'}
                </span>
              </div>
            </div>

            {/* Footer */}
            <div className="sticky bottom-0 bg-slate-900 border-t border-slate-700 px-6 py-4 flex items-center justify-end space-x-3 rounded-b-2xl">
              <button
                onClick={() => setShowModal(false)}
                className="px-5 py-2.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-white font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !formData.feed_name || !formData.feed_source}
                className="px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 disabled:text-slate-500 text-white font-medium transition-colors flex items-center space-x-2"
              >
                <Save className="w-4 h-4" />
                <span>{saving ? 'Saving...' : editingFeed ? 'Update Feed' : 'Create Feed'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ThreatFeedsPanel;
