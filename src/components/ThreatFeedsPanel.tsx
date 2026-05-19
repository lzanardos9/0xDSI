import { useState, useEffect } from 'react';
import { Rss, RefreshCw, CheckCircle, XCircle, Clock, Plus, Settings } from 'lucide-react';
import { supabase, ThreatFeed, FeedSyncLog } from '../lib/supabase';
import { generateMockThreatFeeds, generateMockSyncLogs } from '../lib/mockData';

const ThreatFeedsPanel = () => {
  const [feeds, setFeeds] = useState<ThreatFeed[]>([]);
  const [syncLogs, setSyncLogs] = useState<FeedSyncLog[]>([]);
  const [selectedFeed, setSelectedFeed] = useState<ThreatFeed | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'feeds' | 'logs'>('feeds');

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
        .insert([
          {
            feed_id: feed.id,
            sync_status: 'in_progress',
            started_at: new Date().toISOString(),
          },
        ])
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

  const getFeedSourceColor = (source: string) => {
    const colors: Record<string, string> = {
      abuse_ch_urlhaus: 'bg-red-500/20 text-red-400 border-red-500/30',
      abuse_ch_threatfox: 'bg-red-500/20 text-red-400 border-red-500/30',
      alienvault_otx: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
      circl: 'bg-green-500/20 text-green-400 border-green-500/30',
      openphish: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
      shadowserver: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
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
            <p className="text-slate-500 text-sm mt-2">Configure feeds to start ingesting IOCs</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {feeds.map((feed) => (
              <div
                key={feed.id}
                className="bg-slate-800/50 rounded-lg border border-slate-700 p-5 hover:border-slate-600 transition-colors"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-2">
                      <Rss className="w-5 h-5 text-blue-500" />
                      <h3 className="text-white font-semibold">{feed.feed_name}</h3>
                    </div>
                    <p className="text-slate-400 text-sm line-clamp-2">{feed.description}</p>
                  </div>
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
                </div>

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
                    <span>Sync Now</span>
                  </button>
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
    </div>
  );
};

export default ThreatFeedsPanel;
