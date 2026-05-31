import { useState, useEffect } from 'react';
import { Activity, Filter, Search, RefreshCw } from 'lucide-react';
import { supabase, SecurityEvent } from '../lib/supabase';
import { generateMockEvents } from '../lib/mockData';

const EventStream = () => {
  const [events, setEvents] = useState<SecurityEvent[]>([]);
  const [filter, setFilter] = useState<'all' | 'low' | 'medium' | 'high' | 'critical'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);

  useEffect(() => {
    loadEvents();
    if (autoRefresh) {
      const interval = setInterval(loadEvents, 3000);
      return () => clearInterval(interval);
    }
  }, [filter, autoRefresh]);

  const loadEvents = async () => {
    try {
      let query = supabase
        .from('events')
        .select('*')
        .order('event_timestamp', { ascending: false })
        .limit(50);

      if (filter !== 'all') {
        query = query.eq('severity', filter);
      }

      const { data, error } = await query;

      if (error) throw error;

      if (data && data.length > 0) {
        setEvents(data as SecurityEvent[]);
      } else {
        setEvents(generateMockEvents());
      }
    } catch (error) {
      console.error('Error loading events:', error);
      setEvents(generateMockEvents());
    } finally {
      setLoading(false);
    }
  };

  const filteredEvents = events.filter((event) => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    return (
      event.event_type.toLowerCase().includes(search) ||
      event.source_ip?.toLowerCase().includes(search) ||
      event.user_id?.toLowerCase().includes(search) ||
      event.action?.toLowerCase().includes(search)
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

  const getResultIcon = (result: string) => {
    switch (result) {
      case 'success':
        return '✓';
      case 'failure':
        return '✗';
      case 'blocked':
        return '⊗';
      default:
        return '•';
    }
  };

  return (
    <div className="bg-slate-900/50 backdrop-blur-lg rounded-xl border border-slate-800 p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-white flex items-center space-x-2">
          <Activity className="w-6 h-6 text-blue-500" />
          <span>Real-time Event Stream</span>
        </h2>
        <div className="flex items-center space-x-3">
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`px-4 py-2 rounded-lg transition-colors flex items-center space-x-2 ${
              autoRefresh ? 'bg-green-600 text-white' : 'bg-slate-700 text-slate-300'
            }`}
          >
            <RefreshCw className={`w-4 h-4 ${autoRefresh ? 'animate-spin' : ''}`} />
            <span>{autoRefresh ? 'Live' : 'Paused'}</span>
          </button>
          <button
            onClick={loadEvents}
            className="px-4 py-2 bg-slate-700 text-slate-300 rounded-lg hover:bg-slate-600 transition-colors"
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-5 h-5" />
          <input
            type="text"
            placeholder="Search events..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
          />
        </div>
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
            onClick={() => setFilter('critical')}
            className={`px-4 py-2 rounded-lg transition-colors ${
              filter === 'critical' ? 'bg-red-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >
            Critical
          </button>
          <button
            onClick={() => setFilter('high')}
            className={`px-4 py-2 rounded-lg transition-colors ${
              filter === 'high' ? 'bg-orange-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >
            High
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-slate-400">Loading events...</div>
      ) : filteredEvents.length === 0 ? (
        <div className="text-center py-12">
          <Activity className="w-16 h-16 text-slate-600 mx-auto mb-4" />
          <p className="text-slate-400">No events found</p>
          <p className="text-slate-500 text-sm mt-2">Security events will appear here in real-time</p>
        </div>
      ) : (
        <div className="space-y-2 max-h-[600px] overflow-y-auto">
          {filteredEvents.map((event) => (
            <div
              key={event.id}
              className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 hover:bg-slate-800 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-3 mb-2 flex-wrap gap-2">
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${getSeverityColor(event.severity)}`}>
                      {event.severity.toUpperCase()}
                    </span>
                    {(event as any).ocsf_class_name && (
                      <span className="px-2 py-1 bg-blue-500/20 text-blue-400 text-xs font-mono rounded border border-blue-500/30">
                        OCSF: {(event as any).ocsf_class_uid} - {(event as any).ocsf_class_name}
                      </span>
                    )}
                    <span className="text-slate-400 text-sm">
                      {new Date(event.timestamp || (event as any).event_timestamp).toLocaleString()}
                    </span>
                    <span className="text-slate-500 text-sm">
                      {getResultIcon(event.result)} {event.result}
                    </span>
                  </div>
                  <h3 className="text-white font-semibold mb-1">{event.event_type}</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                    {event.source_ip && (
                      <div>
                        <span className="text-slate-500">Source:</span>
                        <span className="text-slate-300 ml-2 font-mono">{event.source_ip}</span>
                      </div>
                    )}
                    {event.destination_ip && (
                      <div>
                        <span className="text-slate-500">Destination:</span>
                        <span className="text-slate-300 ml-2 font-mono">{event.destination_ip}</span>
                      </div>
                    )}
                    {event.user_id && (
                      <div>
                        <span className="text-slate-500">User:</span>
                        <span className="text-slate-300 ml-2 font-mono">{event.user_id}</span>
                      </div>
                    )}
                    {event.action && (
                      <div>
                        <span className="text-slate-500">Action:</span>
                        <span className="text-slate-300 ml-2">{event.action}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default EventStream;
