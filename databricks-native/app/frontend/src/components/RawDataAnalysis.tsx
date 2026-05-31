import { useState, useEffect } from 'react';
import { Activity, TrendingUp, TrendingDown, AlertCircle, BarChart3, Filter, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface RawEvent {
  id: string;
  event_type: string;
  severity: string;
  source_ip: string;
  dest_ip?: string;
  user_id?: string;
  description: string;
  metadata: any;
  created_at: string;
}

interface Trend {
  metric: string;
  value: number;
  change: number;
  trend: 'up' | 'down' | 'stable';
  severity: string;
  details: string;
}

interface Pattern {
  type: string;
  count: number;
  entities: string[];
  severity: string;
  confidence: number;
}

const RawDataAnalysis = () => {
  const [events, setEvents] = useState<RawEvent[]>([]);
  const [trends, setTrends] = useState<Trend[]>([]);
  const [patterns, setPatterns] = useState<Pattern[]>([]);
  const [timeWindow, setTimeWindow] = useState<'1m' | '5m' | '15m' | '1h'>('5m');
  const [filterType, setFilterType] = useState<'all' | string>('all');
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  useEffect(() => {
    loadRawData();
    const interval = setInterval(() => {
      loadRawData();
      setLastUpdate(new Date());
    }, 3000);
    return () => clearInterval(interval);
  }, [timeWindow]);

  const loadRawData = async () => {
    try {
      const minutesAgo = getMinutesFromWindow(timeWindow);
      const cutoffTime = new Date(Date.now() - minutesAgo * 60 * 1000).toISOString();

      const { data: eventsData } = await supabase
        .from('events')
        .select('*')
        .gte('created_at', cutoffTime)
        .order('created_at', { ascending: false })
        .limit(500);

      if (eventsData && eventsData.length > 0) {
        setEvents(eventsData);
        analyzeTrends(eventsData);
        discoverPatterns(eventsData);
      } else {
        generateMockData();
      }
    } catch (error) {
      console.error('Error loading raw data:', error);
      generateMockData();
    } finally {
      setLoading(false);
    }
  };

  const getMinutesFromWindow = (window: string): number => {
    switch (window) {
      case '1m': return 1;
      case '5m': return 5;
      case '15m': return 15;
      case '1h': return 60;
      default: return 5;
    }
  };

  const analyzeTrends = (eventsData: RawEvent[]) => {
    const now = Date.now();
    const halfWindowMs = (getMinutesFromWindow(timeWindow) * 60 * 1000) / 2;
    const midpoint = now - halfWindowMs;

    const recentEvents = eventsData.filter(e => new Date(e.created_at).getTime() > midpoint);
    const olderEvents = eventsData.filter(e => new Date(e.created_at).getTime() <= midpoint);

    const trends: Trend[] = [];

    const eventTypeChange = calculateChange(
      countUnique(recentEvents, 'event_type'),
      countUnique(olderEvents, 'event_type')
    );
    trends.push({
      metric: 'Unique Event Types',
      value: countUnique(recentEvents, 'event_type'),
      change: eventTypeChange,
      trend: getTrendDirection(eventTypeChange),
      severity: Math.abs(eventTypeChange) > 50 ? 'high' : 'medium',
      details: `${countUnique(recentEvents, 'event_type')} unique event types in recent window`
    });

    const sourceIPChange = calculateChange(
      countUnique(recentEvents, 'source_ip'),
      countUnique(olderEvents, 'source_ip')
    );
    trends.push({
      metric: 'Active Source IPs',
      value: countUnique(recentEvents, 'source_ip'),
      change: sourceIPChange,
      trend: getTrendDirection(sourceIPChange),
      severity: Math.abs(sourceIPChange) > 100 ? 'critical' : 'medium',
      details: `${countUnique(recentEvents, 'source_ip')} unique source IPs detected`
    });

    const criticalEvents = recentEvents.filter(e => e.severity === 'critical').length;
    const oldCriticalEvents = olderEvents.filter(e => e.severity === 'critical').length;
    const criticalChange = calculateChange(criticalEvents, oldCriticalEvents);
    trends.push({
      metric: 'Critical Events',
      value: criticalEvents,
      change: criticalChange,
      trend: getTrendDirection(criticalChange),
      severity: criticalChange > 20 ? 'critical' : 'high',
      details: `${criticalEvents} critical severity events in recent period`
    });

    const eventRate = (recentEvents.length / (getMinutesFromWindow(timeWindow) / 2)).toFixed(1);
    const oldEventRate = (olderEvents.length / (getMinutesFromWindow(timeWindow) / 2)).toFixed(1);
    const rateChange = calculateChange(parseFloat(eventRate), parseFloat(oldEventRate));
    trends.push({
      metric: 'Event Rate',
      value: parseFloat(eventRate),
      change: rateChange,
      trend: getTrendDirection(rateChange),
      severity: Math.abs(rateChange) > 75 ? 'high' : 'low',
      details: `${eventRate} events per minute`
    });

    const failedAuthRecent = recentEvents.filter(e =>
      e.event_type.includes('failed') || e.event_type.includes('denied')
    ).length;
    const failedAuthOld = olderEvents.filter(e =>
      e.event_type.includes('failed') || e.event_type.includes('denied')
    ).length;
    const failedAuthChange = calculateChange(failedAuthRecent, failedAuthOld);
    trends.push({
      metric: 'Failed Authentication',
      value: failedAuthRecent,
      change: failedAuthChange,
      trend: getTrendDirection(failedAuthChange),
      severity: failedAuthChange > 50 ? 'high' : 'medium',
      details: `${failedAuthRecent} failed authentication attempts`
    });

    setTrends(trends);
  };

  const discoverPatterns = (eventsData: RawEvent[]) => {
    const patterns: Pattern[] = [];

    const ipFrequency: Record<string, number> = {};
    eventsData.forEach(e => {
      ipFrequency[e.source_ip] = (ipFrequency[e.source_ip] || 0) + 1;
    });

    const suspiciousIPs = Object.entries(ipFrequency)
      .filter(([_, count]) => count > 10)
      .sort((a, b) => b[1] - a[1]);

    if (suspiciousIPs.length > 0) {
      patterns.push({
        type: 'High-Frequency Source IPs',
        count: suspiciousIPs.length,
        entities: suspiciousIPs.slice(0, 5).map(([ip, count]) => `${ip} (${count}x)`),
        severity: suspiciousIPs[0][1] > 50 ? 'critical' : 'high',
        confidence: Math.min(95, 60 + suspiciousIPs.length * 5)
      });
    }

    const failedAttempts: Record<string, number> = {};
    eventsData
      .filter(e => e.event_type.includes('failed') || e.event_type.includes('denied'))
      .forEach(e => {
        const key = e.user_id || e.source_ip;
        failedAttempts[key] = (failedAttempts[key] || 0) + 1;
      });

    const bruteForceTargets = Object.entries(failedAttempts)
      .filter(([_, count]) => count > 5)
      .sort((a, b) => b[1] - a[1]);

    if (bruteForceTargets.length > 0) {
      patterns.push({
        type: 'Potential Brute Force',
        count: bruteForceTargets.length,
        entities: bruteForceTargets.slice(0, 5).map(([target, count]) => `${target} (${count} attempts)`),
        severity: 'critical',
        confidence: Math.min(98, 70 + bruteForceTargets.length * 3)
      });
    }

    const portScans: Record<string, Set<number>> = {};
    eventsData
      .filter(e => e.metadata?.dest_port)
      .forEach(e => {
        if (!portScans[e.source_ip]) portScans[e.source_ip] = new Set();
        portScans[e.source_ip].add(e.metadata.dest_port);
      });

    const scanners = Object.entries(portScans)
      .filter(([_, ports]) => ports.size > 10)
      .sort((a, b) => b[1].size - a[1].size);

    if (scanners.length > 0) {
      patterns.push({
        type: 'Port Scanning Activity',
        count: scanners.length,
        entities: scanners.slice(0, 5).map(([ip, ports]) => `${ip} (${ports.size} ports)`),
        severity: 'high',
        confidence: Math.min(92, 75 + scanners.length * 2)
      });
    }

    const eventTypeSequences: Record<string, string[]> = {};
    const sortedEvents = [...eventsData].sort((a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );

    sortedEvents.forEach(e => {
      const key = e.source_ip;
      if (!eventTypeSequences[key]) eventTypeSequences[key] = [];
      eventTypeSequences[key].push(e.event_type);
    });

    const suspiciousSequences = Object.entries(eventTypeSequences)
      .filter(([_, seq]) => seq.length > 5 && new Set(seq).size > 3)
      .sort((a, b) => b[1].length - a[1].length);

    if (suspiciousSequences.length > 0) {
      patterns.push({
        type: 'Complex Attack Sequences',
        count: suspiciousSequences.length,
        entities: suspiciousSequences.slice(0, 5).map(([ip, seq]) => `${ip} (${seq.length} events)`),
        severity: 'high',
        confidence: Math.min(88, 65 + suspiciousSequences.length * 4)
      });
    }

    const timeBasedClusters = findTimeClusters(eventsData);
    if (timeBasedClusters.length > 0) {
      patterns.push({
        type: 'Temporal Event Bursts',
        count: timeBasedClusters.length,
        entities: timeBasedClusters.map(c => `${c.count} events in ${c.duration}s`),
        severity: 'medium',
        confidence: 82
      });
    }

    setPatterns(patterns);
  };

  const findTimeClusters = (eventsData: RawEvent[]) => {
    const clusters: Array<{ count: number; duration: number }> = [];
    const sortedEvents = [...eventsData].sort((a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );

    let clusterStart = 0;
    let clusterCount = 0;

    for (let i = 1; i < sortedEvents.length; i++) {
      const timeDiff = (new Date(sortedEvents[i].created_at).getTime() -
                       new Date(sortedEvents[i - 1].created_at).getTime()) / 1000;

      if (timeDiff < 5) {
        clusterCount++;
      } else {
        if (clusterCount > 10) {
          const duration = (new Date(sortedEvents[i - 1].created_at).getTime() -
                          new Date(sortedEvents[clusterStart].created_at).getTime()) / 1000;
          clusters.push({ count: clusterCount, duration });
        }
        clusterStart = i;
        clusterCount = 0;
      }
    }

    return clusters.slice(0, 5);
  };

  const countUnique = (events: RawEvent[], field: keyof RawEvent): number => {
    return new Set(events.map(e => e[field])).size;
  };

  const calculateChange = (current: number, previous: number): number => {
    if (previous === 0) return current > 0 ? 100 : 0;
    return Math.round(((current - previous) / previous) * 100);
  };

  const getTrendDirection = (change: number): 'up' | 'down' | 'stable' => {
    if (change > 10) return 'up';
    if (change < -10) return 'down';
    return 'stable';
  };

  const generateMockData = () => {
    const mockEvents: RawEvent[] = [];
    const eventTypes = [
      'login_success', 'login_failed', 'file_access', 'network_connection',
      'authentication_denied', 'privilege_escalation', 'data_exfiltration',
      'port_scan', 'malware_detected', 'policy_violation'
    ];
    const severities = ['low', 'medium', 'high', 'critical'];

    for (let i = 0; i < 200; i++) {
      const timeAgo = Math.random() * getMinutesFromWindow(timeWindow) * 60 * 1000;
      mockEvents.push({
        id: `mock-${i}`,
        event_type: eventTypes[Math.floor(Math.random() * eventTypes.length)],
        severity: severities[Math.floor(Math.random() * severities.length)],
        source_ip: `192.168.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
        dest_ip: `10.0.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
        user_id: `user${Math.floor(Math.random() * 50)}`,
        description: `Mock event ${i}`,
        metadata: { dest_port: Math.floor(Math.random() * 65535) },
        created_at: new Date(Date.now() - timeAgo).toISOString()
      });
    }

    setEvents(mockEvents);
    analyzeTrends(mockEvents);
    discoverPatterns(mockEvents);
  };

  const filteredEvents = filterType === 'all'
    ? events
    : events.filter(e => e.event_type === filterType);

  const uniqueEventTypes = Array.from(new Set(events.map(e => e.event_type)));

  return (
    <div className="space-y-6">
      <div className="bg-slate-900/50 backdrop-blur-lg rounded-xl border border-slate-800 p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-xl font-semibold text-white flex items-center space-x-2">
              <Activity className="w-6 h-6 text-blue-500" />
              <span>Raw Data Pattern Analysis</span>
            </h3>
            <p className="text-slate-400 text-sm mt-1">
              Real-time trend detection and pattern discovery from raw event data
            </p>
          </div>
          <div className="flex items-center space-x-3">
            <div className="flex items-center space-x-2 text-sm text-slate-400">
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>Updated {Math.floor((Date.now() - lastUpdate.getTime()) / 1000)}s ago</span>
            </div>
            <div className="flex space-x-2">
              {(['1m', '5m', '15m', '1h'] as const).map((window) => (
                <button
                  key={window}
                  onClick={() => setTimeWindow(window)}
                  className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                    timeWindow === window
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }`}
                >
                  {window.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
            <div className="flex items-center space-x-2 mb-2">
              <BarChart3 className="w-5 h-5 text-blue-400" />
              <h4 className="font-semibold text-white">Total Events</h4>
            </div>
            <p className="text-3xl font-bold text-white">{events.length}</p>
            <p className="text-slate-400 text-sm mt-1">in {timeWindow} window</p>
          </div>

          <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
            <div className="flex items-center space-x-2 mb-2">
              <TrendingUp className="w-5 h-5 text-green-400" />
              <h4 className="font-semibold text-white">Active Trends</h4>
            </div>
            <p className="text-3xl font-bold text-white">{trends.filter(t => t.trend === 'up').length}</p>
            <p className="text-slate-400 text-sm mt-1">increasing metrics</p>
          </div>

          <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
            <div className="flex items-center space-x-2 mb-2">
              <AlertCircle className="w-5 h-5 text-red-400" />
              <h4 className="font-semibold text-white">Patterns Found</h4>
            </div>
            <p className="text-3xl font-bold text-white">{patterns.length}</p>
            <p className="text-slate-400 text-sm mt-1">behavioral patterns</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-slate-900/50 backdrop-blur-lg rounded-xl border border-slate-800 p-6">
          <h4 className="text-lg font-semibold text-white mb-4 flex items-center space-x-2">
            <TrendingUp className="w-5 h-5 text-green-400" />
            <span>Real-Time Trends</span>
          </h4>
          <div className="space-y-3 max-h-[500px] overflow-y-auto">
            {trends.map((trend, idx) => (
              <div
                key={idx}
                className="bg-slate-800/50 border border-slate-700 rounded-lg p-4"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-1">
                      <h5 className="font-semibold text-white">{trend.metric}</h5>
                      {trend.trend === 'up' ? (
                        <TrendingUp className="w-4 h-4 text-green-400" />
                      ) : trend.trend === 'down' ? (
                        <TrendingDown className="w-4 h-4 text-red-400" />
                      ) : (
                        <Activity className="w-4 h-4 text-slate-400" />
                      )}
                    </div>
                    <p className="text-slate-400 text-sm">{trend.details}</p>
                  </div>
                  <div className="text-right ml-4">
                    <p className="text-2xl font-bold text-white">{trend.value}</p>
                    <p className={`text-sm font-semibold ${
                      trend.change > 0 ? 'text-red-400' : trend.change < 0 ? 'text-green-400' : 'text-slate-400'
                    }`}>
                      {trend.change > 0 ? '+' : ''}{trend.change}%
                    </p>
                  </div>
                </div>
                <div className="flex items-center space-x-2 mt-3">
                  <span className={`px-2 py-1 rounded text-xs font-semibold ${
                    trend.severity === 'critical' ? 'bg-red-500/20 text-red-400' :
                    trend.severity === 'high' ? 'bg-orange-500/20 text-orange-400' :
                    trend.severity === 'medium' ? 'bg-yellow-500/20 text-yellow-400' :
                    'bg-green-500/20 text-green-400'
                  }`}>
                    {trend.severity}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-slate-900/50 backdrop-blur-lg rounded-xl border border-slate-800 p-6">
          <h4 className="text-lg font-semibold text-white mb-4 flex items-center space-x-2">
            <AlertCircle className="w-5 h-5 text-purple-400" />
            <span>Discovered Patterns</span>
          </h4>
          <div className="space-y-3 max-h-[500px] overflow-y-auto">
            {patterns.map((pattern, idx) => (
              <div
                key={idx}
                className="bg-slate-800/50 border border-slate-700 rounded-lg p-4"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <h5 className="font-semibold text-white mb-1">{pattern.type}</h5>
                    <p className="text-slate-400 text-sm mb-2">
                      {pattern.count} instance{pattern.count > 1 ? 's' : ''} detected
                    </p>
                  </div>
                  <div className="text-right ml-4">
                    <p className="text-sm font-semibold text-blue-400">
                      {pattern.confidence}% confidence
                    </p>
                  </div>
                </div>
                <div className="space-y-1 mb-3">
                  {pattern.entities.slice(0, 3).map((entity, i) => (
                    <div key={i} className="text-xs text-slate-400 font-mono bg-slate-900/50 px-2 py-1 rounded">
                      {entity}
                    </div>
                  ))}
                  {pattern.entities.length > 3 && (
                    <p className="text-xs text-slate-500 mt-1">
                      +{pattern.entities.length - 3} more
                    </p>
                  )}
                </div>
                <span className={`px-2 py-1 rounded text-xs font-semibold ${
                  pattern.severity === 'critical' ? 'bg-red-500/20 text-red-400' :
                  pattern.severity === 'high' ? 'bg-orange-500/20 text-orange-400' :
                  pattern.severity === 'medium' ? 'bg-yellow-500/20 text-yellow-400' :
                  'bg-green-500/20 text-green-400'
                }`}>
                  {pattern.severity}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-slate-900/50 backdrop-blur-lg rounded-xl border border-slate-800 p-6">
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-lg font-semibold text-white flex items-center space-x-2">
            <Filter className="w-5 h-5 text-slate-400" />
            <span>Raw Event Stream</span>
          </h4>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="bg-slate-700 text-white px-3 py-1.5 rounded-lg text-sm border border-slate-600"
          >
            <option value="all">All Event Types ({events.length})</option>
            {uniqueEventTypes.map(type => (
              <option key={type} value={type}>
                {type.replace(/_/g, ' ')} ({events.filter(e => e.event_type === type).length})
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2 max-h-[400px] overflow-y-auto">
          {filteredEvents.slice(0, 50).map((event) => (
            <div
              key={event.id}
              className="bg-slate-800/30 border border-slate-700 rounded p-3 hover:bg-slate-800/50 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-2 mb-1">
                    <span className="text-white font-mono text-sm">{event.event_type}</span>
                    <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                      event.severity === 'critical' ? 'bg-red-500/20 text-red-400' :
                      event.severity === 'high' ? 'bg-orange-500/20 text-orange-400' :
                      event.severity === 'medium' ? 'bg-yellow-500/20 text-yellow-400' :
                      'bg-green-500/20 text-green-400'
                    }`}>
                      {event.severity}
                    </span>
                  </div>
                  <div className="flex items-center space-x-4 text-xs text-slate-400">
                    <span>Source: {event.source_ip}</span>
                    {event.dest_ip && <span>Dest: {event.dest_ip}</span>}
                    {event.user_id && <span>User: {event.user_id}</span>}
                  </div>
                </div>
                <span className="text-xs text-slate-500">
                  {new Date(event.created_at).toLocaleTimeString()}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default RawDataAnalysis;
