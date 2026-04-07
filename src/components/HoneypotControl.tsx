import { useState, useEffect } from 'react';
import { Shield, Eye, Radio, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';
import HoneypotStats from './honeypot/HoneypotStats';
import HoneypotMap from './honeypot/HoneypotMap';
import HoneypotTable from './honeypot/HoneypotTable';
import HoneytokenTable from './honeypot/HoneytokenTable';
import InteractionFeed from './honeypot/InteractionFeed';

type TabId = 'overview' | 'honeypots' | 'tokens' | 'feed';

const HoneypotControl = () => {
  const [tab, setTab] = useState<TabId>('overview');
  const [honeypots, setHoneypots] = useState<any[]>([]);
  const [honeytokens, setHoneytokens] = useState<any[]>([]);
  const [interactions, setInteractions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(new Date());

  const fetchData = async () => {
    setLoading(true);
    const [hpRes, htRes, intRes] = await Promise.all([
      supabase.from('honeypots').select('*').order('interaction_count', { ascending: false }),
      supabase.from('honeytokens').select('*').order('trigger_count', { ascending: false }),
      supabase.from('honeypot_interactions').select('*').order('created_at', { ascending: false }).limit(200),
    ]);
    setHoneypots(hpRes.data || []);
    setHoneytokens(htRes.data || []);
    setInteractions(intRes.data || []);
    setLoading(false);
    setLastRefresh(new Date());
  };

  useEffect(() => { fetchData(); }, []);

  const tabs: { id: TabId; label: string; icon: typeof Shield }[] = [
    { id: 'overview', label: 'Overview', icon: Eye },
    { id: 'honeypots', label: 'Honeypots', icon: Shield },
    { id: 'tokens', label: 'HoneyTokens', icon: Radio },
    { id: 'feed', label: 'Live Feed', icon: Radio },
  ];

  const triggeredCount = honeypots.filter(h => h.status === 'triggered' || h.status === 'compromised').length
    + honeytokens.filter(t => t.status === 'triggered').length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="relative">
            <div className="p-3 bg-gradient-to-br from-cyan-500/20 to-teal-500/20 rounded-xl border border-cyan-500/30">
              <Shield className="w-6 h-6 text-cyan-400" />
            </div>
            {triggeredCount > 0 && (
              <div className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center animate-pulse">
                <span className="text-[10px] font-bold text-white">{triggeredCount}</span>
              </div>
            )}
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-100">Deception Technology</h2>
            <p className="text-sm text-slate-400">HoneyPots & HoneyTokens Control Center</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-[10px] text-slate-500">
            Last updated: {lastRefresh.toLocaleTimeString()}
          </span>
          <button
            onClick={fetchData}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800/50 border border-slate-700 text-slate-300 text-xs hover:bg-slate-700/50 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      <div className="flex gap-1 bg-slate-800/40 rounded-xl p-1 border border-slate-700/50">
        {tabs.map(t => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                active
                  ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 shadow-lg shadow-cyan-500/5'
                  : 'text-slate-400 hover:text-slate-300 hover:bg-slate-700/30 border border-transparent'
              }`}
            >
              <Icon className="w-4 h-4" />
              {t.label}
              {t.id === 'feed' && interactions.length > 0 && (
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                </span>
              )}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="flex flex-col items-center gap-3">
            <div className="relative w-12 h-12">
              <div className="absolute inset-0 rounded-full border-2 border-cyan-500/20 animate-ping" />
              <div className="absolute inset-0 rounded-full border-2 border-t-cyan-400 animate-spin" />
              <Shield className="absolute inset-2 w-8 h-8 text-cyan-400/50" />
            </div>
            <p className="text-sm text-slate-400">Loading deception data...</p>
          </div>
        </div>
      ) : (
        <>
          {tab === 'overview' && (
            <div className="space-y-6">
              <HoneypotStats honeypots={honeypots} honeytokens={honeytokens} interactions={interactions} />
              <HoneypotMap interactions={interactions} />
              <div className="grid grid-cols-2 gap-6">
                <HoneypotTable honeypots={honeypots} />
                <HoneytokenTable honeytokens={honeytokens} />
              </div>
            </div>
          )}

          {tab === 'honeypots' && (
            <HoneypotTable honeypots={honeypots} />
          )}

          {tab === 'tokens' && (
            <HoneytokenTable honeytokens={honeytokens} />
          )}

          {tab === 'feed' && (
            <InteractionFeed interactions={interactions} honeypots={honeypots} />
          )}
        </>
      )}
    </div>
  );
};

export default HoneypotControl;
