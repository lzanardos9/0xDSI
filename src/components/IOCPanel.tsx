import { useState, useEffect } from 'react';
import { Shield, Search, Filter, AlertTriangle, CheckCircle, XCircle, Hash } from 'lucide-react';
import { supabase, IOC, IOCMatch } from '../lib/supabase';
import { generateMockIOCs, generateMockIOCMatches } from '../lib/mockData';

const IOCPanel = () => {
  const [iocs, setIocs] = useState<IOC[]>([]);
  const [matches, setMatches] = useState<IOCMatch[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [severityFilter, setSeverityFilter] = useState<'all' | 'low' | 'medium' | 'high' | 'critical'>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | string>('all');
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'iocs' | 'matches'>('iocs');

  useEffect(() => {
    loadIOCs();
    loadMatches();
    const interval = setInterval(() => {
      loadIOCs();
      loadMatches();
    }, 5000);
    return () => clearInterval(interval);
  }, [severityFilter, typeFilter]);

  const loadIOCs = async () => {
    try {
      let query = supabase
        .from('iocs')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(100);

      if (severityFilter !== 'all') {
        query = query.eq('severity', severityFilter);
      }

      if (typeFilter !== 'all') {
        query = query.eq('indicator_type', typeFilter);
      }

      const { data, error } = await query;

      if (error) throw error;
      setIocs(data && data.length > 0 ? data : generateMockIOCs());
    } catch (error) {
      console.error('Error loading IOCs:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadMatches = async () => {
    try {
      const { data, error } = await supabase
        .from('ioc_matches')
        .select('*')
        .order('matched_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      setMatches(data && data.length > 0 ? data : generateMockIOCMatches());
    } catch (error) {
      console.error('Error loading matches:', error);
    }
  };

  const deactivateIOC = async (iocId: string) => {
    try {
      const { error } = await supabase
        .from('iocs')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('id', iocId);

      if (error) throw error;
      loadIOCs();
    } catch (error) {
      console.error('Error deactivating IOC:', error);
    }
  };

  const filteredIOCs = iocs.filter((ioc) => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    return (
      ioc.indicator.toLowerCase().includes(search) ||
      ioc.indicator_type.toLowerCase().includes(search) ||
      ioc.threat_type?.toLowerCase().includes(search) ||
      ioc.tags.some((tag) => tag.toLowerCase().includes(search))
    );
  });

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

  const getTypeIcon = (type: string) => {
    return <Hash className="w-4 h-4" />;
  };

  const stats = {
    total: iocs.length,
    critical: iocs.filter((i) => i.severity === 'critical').length,
    high: iocs.filter((i) => i.severity === 'high').length,
    matches: matches.filter((m) => m.match_type === 'exact').length,
  };

  return (
    <div className="bg-slate-900/50 backdrop-blur-lg rounded-xl border border-slate-800 p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-white flex items-center space-x-2">
          <Shield className="w-6 h-6 text-red-500" />
          <span>Indicators of Compromise (IOCs)</span>
        </h2>
        <div className="flex space-x-3">
          <button
            onClick={() => setActiveTab('iocs')}
            className={`px-4 py-2 rounded-lg transition-colors ${
              activeTab === 'iocs' ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >
            IOCs
          </button>
          <button
            onClick={() => setActiveTab('matches')}
            className={`px-4 py-2 rounded-lg transition-colors ${
              activeTab === 'matches' ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >
            Matches
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <StatCard title="Total IOCs" value={stats.total} color="blue" />
        <StatCard title="Critical" value={stats.critical} color="red" />
        <StatCard title="High Priority" value={stats.high} color="orange" />
        <StatCard title="Recent Matches" value={stats.matches} color="green" />
      </div>

      {activeTab === 'iocs' ? (
        <>
          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Search IOCs..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
              />
            </div>
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value as any)}
              className="px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
            >
              <option value="all">All Severities</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
            >
              <option value="all">All Types</option>
              <option value="ip">IP Address</option>
              <option value="domain">Domain</option>
              <option value="url">URL</option>
              <option value="hash_md5">MD5 Hash</option>
              <option value="hash_sha256">SHA256 Hash</option>
            </select>
          </div>

          {loading ? (
            <div className="text-center py-12 text-slate-400">Loading IOCs...</div>
          ) : filteredIOCs.length === 0 ? (
            <div className="text-center py-12">
              <Shield className="w-16 h-16 text-slate-600 mx-auto mb-4" />
              <p className="text-slate-400">No IOCs found</p>
              <p className="text-slate-500 text-sm mt-2">Sync threat feeds to populate IOCs</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[500px] overflow-y-auto">
              {filteredIOCs.map((ioc) => (
                <div
                  key={ioc.id}
                  className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 hover:bg-slate-800 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-2">
                        {getTypeIcon(ioc.indicator_type)}
                        <h3 className="text-white font-mono text-sm">{ioc.indicator}</h3>
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${getSeverityColor(ioc.severity)}`}>
                          {ioc.severity.toUpperCase()}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                        <div>
                          <span className="text-slate-500">Type:</span>
                          <span className="text-slate-300 ml-2">{ioc.indicator_type}</span>
                        </div>
                        <div>
                          <span className="text-slate-500">Threat:</span>
                          <span className="text-slate-300 ml-2 capitalize">{ioc.threat_type || 'Unknown'}</span>
                        </div>
                        <div>
                          <span className="text-slate-500">Confidence:</span>
                          <span className="text-slate-300 ml-2">{Math.round(ioc.confidence_score * 100)}%</span>
                        </div>
                        <div>
                          <span className="text-slate-500">Matches:</span>
                          <span className="text-slate-300 ml-2">{ioc.match_count}</span>
                        </div>
                      </div>
                      {ioc.tags.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-2">
                          {ioc.tags.map((tag, idx) => (
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
                    <button
                      onClick={() => deactivateIOC(ioc.id)}
                      className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-xs transition-colors"
                    >
                      Deactivate
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="space-y-3 max-h-[600px] overflow-y-auto">
          {matches.length === 0 ? (
            <div className="text-center py-12">
              <AlertTriangle className="w-16 h-16 text-slate-600 mx-auto mb-4" />
              <p className="text-slate-400">No IOC matches yet</p>
              <p className="text-slate-500 text-sm mt-2">Matches will appear when security events correlate with IOCs</p>
            </div>
          ) : (
            matches.map((match) => {
              const ioc = iocs.find((i) => i.id === match.ioc_id);
              return (
                <div
                  key={match.id}
                  className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 hover:bg-slate-800 transition-colors"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center space-x-3">
                      {match.alert_generated ? (
                        <CheckCircle className="w-5 h-5 text-green-500" />
                      ) : (
                        <XCircle className="w-5 h-5 text-slate-500" />
                      )}
                      <div>
                        <h3 className="text-white font-semibold">IOC Match Detected</h3>
                        <p className="text-slate-400 text-sm">{ioc?.indicator || 'Unknown IOC'}</p>
                      </div>
                    </div>
                    <span className="text-slate-500 text-xs">{new Date(match.matched_at).toLocaleString()}</span>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                    <div>
                      <span className="text-slate-500">Type:</span>
                      <span className="text-slate-300 ml-2">{match.match_type}</span>
                    </div>
                    <div>
                      <span className="text-slate-500">Field:</span>
                      <span className="text-slate-300 ml-2">{match.matched_field}</span>
                    </div>
                    <div>
                      <span className="text-slate-500">Value:</span>
                      <span className="text-slate-300 ml-2 font-mono text-xs">{match.matched_value}</span>
                    </div>
                    {match.similarity_score && (
                      <div>
                        <span className="text-slate-500">Similarity:</span>
                        <span className="text-slate-300 ml-2">{Math.round(match.similarity_score * 100)}%</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};

const StatCard = ({ title, value, color }: { title: string; value: number; color: string }) => {
  const colorClasses: Record<string, string> = {
    blue: 'bg-blue-500/20 border-blue-500/30',
    red: 'bg-red-500/20 border-red-500/30',
    orange: 'bg-orange-500/20 border-orange-500/30',
    green: 'bg-green-500/20 border-green-500/30',
  };

  return (
    <div className={`rounded-lg border p-4 ${colorClasses[color]}`}>
      <p className="text-slate-400 text-sm mb-1">{title}</p>
      <p className="text-white text-2xl font-bold">{value.toLocaleString()}</p>
    </div>
  );
};

export default IOCPanel;
