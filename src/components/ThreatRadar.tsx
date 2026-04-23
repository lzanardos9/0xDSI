import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { CheckCircle2, XCircle } from 'lucide-react';
import RadarHUD from './threat-radar/RadarHUD';
import FeedStream from './threat-radar/FeedStream';
import IntelligenceDossier from './threat-radar/IntelligenceDossier';

export default function ThreatRadar() {
  const [items, setItems] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRun, setLastRun] = useState<string | null>(null);
  const [proposalsCount, setProposalsCount] = useState(0);
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('threat_radar_items')
      .select('*')
      .order('published_at', { ascending: false })
      .limit(300);
    const list = data || [];
    setItems(list);
    if (!selectedId && list.length) setSelectedId(list[0].id);

    const { data: runs } = await supabase.from('threat_radar_runs').select('finished_at, run_type').eq('run_type', 'fetch').not('finished_at', 'is', null).order('finished_at', { ascending: false }).limit(1);
    setLastRun(runs?.[0]?.finished_at || null);

    const { count } = await supabase.from('threat_radar_proposals').select('*', { count: 'exact', head: true }).eq('status', 'draft');
    setProposalsCount(count || 0);
    setLoading(false);
  };

  const scanNow = async () => {
    setRefreshing(true);
    setToast({ kind: 'ok', msg: 'Scanning external feeds...' });
    try {
      const base = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
      const headers = { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' };
      const fetchRes = await fetch(`${base}/threat-radar-fetch`, { method: 'POST', headers, body: JSON.stringify({ limit: 15 }) }).then(r => r.json());
      if (fetchRes.items_new > 0) {
        setToast({ kind: 'ok', msg: `Fetched ${fetchRes.items_new} new items. Analyzing...` });
        await fetch(`${base}/threat-radar-analyze`, { method: 'POST', headers, body: JSON.stringify({ limit: 50 }) });
        setToast({ kind: 'ok', msg: `Running exposure probe...` });
        await fetch(`${base}/threat-radar-probe`, { method: 'POST', headers, body: JSON.stringify({ limit: 50 }) });
      }
      setToast({ kind: 'ok', msg: `Scan complete: ${fetchRes.items_new || 0} new, ${fetchRes.sources_ok}/${fetchRes.sources_attempted} sources OK` });
      await load();
    } catch (e: any) {
      setToast({ kind: 'err', msg: `Scan failed: ${e.message}` });
    } finally {
      setRefreshing(false);
      setTimeout(() => setToast(null), 4500);
    }
  };

  const stats = useMemo(() => {
    const total = items.length;
    const critical = items.filter(i => i.severity === 'critical').length;
    const exposure = items.filter(i => i.exposure_status && i.exposure_status !== 'unknown' && i.exposure_status !== 'clean').length;
    const families = new Set(items.map(i => i.family).filter(f => f && f !== 'unclassified')).size;
    return { total, critical, exposure, families, proposalsReady: proposalsCount, last_sync: lastRun };
  }, [items, proposalsCount, lastRun]);

  const selected = items.find(i => i.id === selectedId) || null;

  return (
    <div className="p-4 space-y-4 bg-[#05070f] min-h-screen">
      <RadarHUD items={items} stats={stats} onRefresh={scanNow} refreshing={refreshing} />

      <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-4">
        <FeedStream items={items} selectedId={selectedId} onSelect={setSelectedId} />
        {selected ? (
          <IntelligenceDossier item={selected} onRefresh={load} onPromote={(msg) => { setToast({ kind: 'ok', msg }); setTimeout(() => setToast(null), 4500); }} />
        ) : loading ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-10 text-center text-slate-400">Loading feed...</div>
        ) : (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-10 text-center text-slate-400">
            No intelligence items yet. Click "Scan Now" to pull the latest reports.
          </div>
        )}
      </div>

      {toast && (
        <div className={`fixed bottom-6 right-6 px-4 py-2.5 rounded-lg border text-sm font-semibold shadow-xl z-50 ${
          toast.kind === 'ok' ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200' : 'bg-red-500/15 border-red-500/40 text-red-200'
        }`}>
          {toast.kind === 'ok' ? <CheckCircle2 className="w-4 h-4 inline mr-1.5" /> : <XCircle className="w-4 h-4 inline mr-1.5" />}
          {toast.msg}
        </div>
      )}
    </div>
  );
}
