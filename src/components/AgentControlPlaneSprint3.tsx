import { useState, useEffect } from 'react';
import { Star, Download, Shield, CheckCircle, XCircle, AlertTriangle, Search, BarChart3 } from 'lucide-react';
import { supabase } from '../lib/supabase';

export function AgentMarketplaceTab() {
  const [listings, setListings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedListing, setSelectedListing] = useState<any | null>(null);

  useEffect(() => {
    fetchListings();
  }, []);

  const fetchListings = async () => {
    const { data } = await supabase.from('agent_marketplace').select('*').order('download_count', { ascending: false });
    if (data) setListings(data);
    setLoading(false);
  };

  const categories = ['all', ...new Set(listings.map(l => l.category).filter(Boolean))];
  const filtered = listings.filter(l => {
    const matchCat = categoryFilter === 'all' || l.category === categoryFilter;
    const matchSearch = !searchTerm || l.display_name?.toLowerCase().includes(searchTerm.toLowerCase()) || l.short_description?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchCat && matchSearch;
  });

  if (loading) return <div className="flex items-center justify-center h-64 text-slate-400">Loading marketplace...</div>;

  return (
    <div className="flex h-full gap-4">
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex gap-2 mb-3">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-slate-500" />
            <input
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Search marketplace..."
              className="w-full pl-8 pr-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-blue-500/50"
            />
          </div>
          <select
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value)}
            className="px-2 py-2 bg-slate-800/50 border border-slate-700/50 rounded text-xs text-slate-300 focus:outline-none"
          >
            {categories.map(c => <option key={c} value={c}>{c === 'all' ? 'All Categories' : c}</option>)}
          </select>
        </div>
        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
          {filtered.map(listing => (
            <div
              key={listing.id}
              onClick={() => setSelectedListing(listing)}
              className={`p-3 rounded border cursor-pointer transition-all ${selectedListing?.id === listing.id ? 'bg-blue-500/10 border-blue-500/40' : 'bg-slate-800/30 border-slate-700/30 hover:border-slate-600/50'}`}
            >
              <div className="flex items-start justify-between mb-1">
                <div>
                  <span className="text-xs font-medium text-slate-200">{listing.display_name}</span>
                  <span className="ml-2 px-1.5 py-0.5 text-[10px] rounded bg-slate-700/50 text-slate-400">{listing.category}</span>
                  {listing.is_featured && <span className="ml-1.5 px-1.5 py-0.5 text-[10px] rounded bg-amber-500/20 text-amber-300">Featured</span>}
                </div>
                <div className="flex items-center gap-1 text-amber-400">
                  <Star className="w-3 h-3 fill-current" />
                  <span className="text-[10px]">{listing.avg_rating?.toFixed(1) || 'N/A'}</span>
                </div>
              </div>
              <p className="text-[11px] text-slate-400 line-clamp-2 mb-2">{listing.short_description}</p>
              <div className="flex items-center gap-3 text-[10px] text-slate-500">
                <span className="flex items-center gap-1"><Download className="w-3 h-3" />{listing.download_count || 0}</span>
                <span className="flex items-center gap-1"><Shield className="w-3 h-3" />{listing.is_certified ? 'Certified' : 'Community'}</span>
                <span>v{listing.version || '1.0.0'}</span>
                <span className="text-slate-600">{listing.maturity_level}</span>
              </div>
            </div>
          ))}
          {filtered.length === 0 && <div className="text-center text-slate-500 text-xs py-8">No listings found</div>}
        </div>
      </div>
      {selectedListing && (
        <div className="w-80 bg-slate-800/30 border border-slate-700/30 rounded p-4 overflow-y-auto">
          <h3 className="text-sm font-semibold text-slate-100 mb-1">{selectedListing.display_name}</h3>
          <div className="flex items-center gap-2 mb-3">
            <span className="px-1.5 py-0.5 text-[10px] rounded bg-blue-500/20 text-blue-300">{selectedListing.category}</span>
            {selectedListing.is_certified && <span className="px-1.5 py-0.5 text-[10px] rounded bg-emerald-500/20 text-emerald-300 flex items-center gap-0.5"><CheckCircle className="w-2.5 h-2.5" />Certified</span>}
          </div>
          <p className="text-xs text-slate-400 mb-4">{selectedListing.long_description || selectedListing.short_description}</p>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between"><span className="text-slate-500">Publisher</span><span className="text-slate-300">{selectedListing.publisher || 'Unknown'}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Version</span><span className="text-slate-300">{selectedListing.version || '1.0.0'}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Downloads</span><span className="text-slate-300">{selectedListing.download_count || 0}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Rating</span><span className="text-amber-400 flex items-center gap-1"><Star className="w-3 h-3 fill-current" />{selectedListing.avg_rating?.toFixed(1)} ({selectedListing.total_ratings} reviews)</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Maturity</span><span className="text-slate-300">{selectedListing.maturity_level || 'beta'}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Cost</span><span className="text-emerald-400">{selectedListing.estimated_cost_per_month ? `$${selectedListing.estimated_cost_per_month}/mo` : 'Free'}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Setup Time</span><span className="text-slate-300">{selectedListing.setup_time_minutes || 5} min</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Min Autonomy</span><span className="text-slate-300">Level {selectedListing.min_autonomy_level || 1}</span></div>
          </div>
          {selectedListing.capabilities && selectedListing.capabilities.length > 0 && (
            <div className="mt-3">
              <span className="text-[10px] text-slate-500 uppercase">Capabilities</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {selectedListing.capabilities.map((cap: string) => (
                  <span key={cap} className="px-1.5 py-0.5 text-[10px] rounded bg-slate-700/50 text-slate-300">{cap}</span>
                ))}
              </div>
            </div>
          )}
          <button className="w-full mt-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium rounded transition-colors">
            Deploy Agent
          </button>
        </div>
      )}
    </div>
  );
}

export function AgentAutonomySimTab() {
  const [simulations, setSimulations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSimulations();
  }, []);

  const fetchSimulations = async () => {
    const { data } = await supabase.from('agent_autonomy_simulations').select('*, agent_identities(display_name, agent_slug)').order('created_at', { ascending: false });
    if (data) setSimulations(data);
    setLoading(false);
  };

  const getRiskColor = (score: number) => {
    if (score >= 80) return 'text-red-400 bg-red-500/10';
    if (score >= 50) return 'text-amber-400 bg-amber-500/10';
    return 'text-emerald-400 bg-emerald-500/10';
  };

  if (loading) return <div className="flex items-center justify-center h-64 text-slate-400">Loading simulations...</div>;

  return (
    <div className="space-y-3 overflow-y-auto h-full pr-1">
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-slate-800/40 border border-slate-700/30 rounded p-3">
          <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Total Simulations</div>
          <div className="text-lg font-bold text-slate-100">{simulations.length}</div>
        </div>
        <div className="bg-slate-800/40 border border-slate-700/30 rounded p-3">
          <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Avg Risk Score</div>
          <div className="text-lg font-bold text-amber-400">{simulations.length ? (simulations.reduce((s, r) => s + (r.risk_score || 0), 0) / simulations.length).toFixed(1) : '0'}</div>
        </div>
        <div className="bg-slate-800/40 border border-slate-700/30 rounded p-3">
          <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">High Risk</div>
          <div className="text-lg font-bold text-red-400">{simulations.filter(s => (s.risk_score || 0) >= 80).length}</div>
        </div>
      </div>
      <div className="space-y-2">
        {simulations.map(sim => (
          <div key={sim.id} className="bg-slate-800/30 border border-slate-700/30 rounded p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-slate-200">{sim.agent_identities?.display_name || sim.agent_id?.slice(0, 8)}</span>
                <span className="px-1.5 py-0.5 text-[10px] rounded bg-slate-700/50 text-slate-400">{sim.scenario_type || 'standard'}</span>
              </div>
              <span className={`px-2 py-0.5 text-[10px] font-medium rounded ${getRiskColor(sim.risk_score || 0)}`}>
                Risk: {sim.risk_score || 0}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mb-2">{sim.simulation_name || 'Autonomy boundary simulation'}</p>
            <div className="flex items-center gap-4 text-[10px] text-slate-500">
              <span>Blast Radius: <span className="text-slate-300">{typeof sim.blast_radius === 'object' ? Object.entries(sim.blast_radius || {}).map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`).join(', ') || 'contained' : (sim.blast_radius || 'contained')}</span></span>
              <span>Resolution: <span className="text-slate-300">{sim.time_to_resolution_minutes ? `${sim.time_to_resolution_minutes}m` : 'N/A'}</span></span>
              <span>Outcome: <span className={sim.status === 'completed' ? 'text-emerald-400' : sim.status === 'failed' ? 'text-red-400' : 'text-slate-300'}>{sim.predicted_outcome || sim.status || 'pending'}</span></span>
              <span>Guardrails: <span className="text-slate-300">{sim.guardrails_triggered ?? 0}</span></span>
            </div>
          </div>
        ))}
        {simulations.length === 0 && <div className="text-center text-slate-500 text-xs py-8">No simulations recorded</div>}
      </div>
    </div>
  );
}

export function AgentComplianceTab() {
  const [mappings, setMappings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [frameworkFilter, setFrameworkFilter] = useState('all');

  useEffect(() => {
    fetchMappings();
  }, []);

  const fetchMappings = async () => {
    const { data } = await supabase.from('agent_compliance_mappings').select('*').order('framework', { ascending: true });
    if (data) setMappings(data);
    setLoading(false);
  };

  const frameworks = ['all', ...new Set(mappings.map(m => m.framework).filter(Boolean))];
  const filtered = frameworkFilter === 'all' ? mappings : mappings.filter(m => m.framework === frameworkFilter);

  const getStatusIcon = (result: string) => {
    switch (result) {
      case 'pass': return <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />;
      case 'fail': return <XCircle className="w-3.5 h-3.5 text-red-400" />;
      case 'partial': return <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />;
      default: return <AlertTriangle className="w-3.5 h-3.5 text-slate-400" />;
    }
  };

  if (loading) return <div className="flex items-center justify-center h-64 text-slate-400">Loading compliance data...</div>;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 mb-3">
        <select
          value={frameworkFilter}
          onChange={e => setFrameworkFilter(e.target.value)}
          className="px-2 py-1.5 bg-slate-800/50 border border-slate-700/50 rounded text-xs text-slate-300 focus:outline-none"
        >
          {frameworks.map(f => <option key={f} value={f}>{f === 'all' ? 'All Frameworks' : f}</option>)}
        </select>
        <div className="flex items-center gap-4 text-[10px] text-slate-500">
          <span className="flex items-center gap-1"><CheckCircle className="w-3 h-3 text-emerald-400" />Pass: {mappings.filter(m => m.assessment_result === 'pass').length}</span>
          <span className="flex items-center gap-1"><AlertTriangle className="w-3 h-3 text-amber-400" />Partial: {mappings.filter(m => m.assessment_result === 'partial').length}</span>
          <span className="flex items-center gap-1"><XCircle className="w-3 h-3 text-red-400" />Fail: {mappings.filter(m => m.assessment_result === 'fail').length}</span>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-slate-900/90 backdrop-blur">
            <tr className="border-b border-slate-700/50">
              <th className="text-left py-2 px-2 text-slate-500 font-medium">Status</th>
              <th className="text-left py-2 px-2 text-slate-500 font-medium">Framework</th>
              <th className="text-left py-2 px-2 text-slate-500 font-medium">Control ID</th>
              <th className="text-left py-2 px-2 text-slate-500 font-medium">Control Name</th>
              <th className="text-left py-2 px-2 text-slate-500 font-medium">Coverage</th>
              <th className="text-left py-2 px-2 text-slate-500 font-medium">Last Assessed</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(mapping => (
              <tr key={mapping.id} className="border-b border-slate-800/30 hover:bg-slate-800/20">
                <td className="py-2 px-2">{getStatusIcon(mapping.assessment_result)}</td>
                <td className="py-2 px-2 text-slate-300">{mapping.framework}</td>
                <td className="py-2 px-2 text-slate-400 font-mono">{mapping.control_id}</td>
                <td className="py-2 px-2 text-slate-300">{mapping.control_name}</td>
                <td className="py-2 px-2">
                  <div className="flex items-center gap-2">
                    <div className="w-16 h-1.5 bg-slate-700/50 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${(mapping.coverage_percentage || 0) >= 90 ? 'bg-emerald-500' : (mapping.coverage_percentage || 0) >= 60 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${mapping.coverage_percentage || 0}%` }} />
                    </div>
                    <span className="text-slate-400">{mapping.coverage_percentage || 0}%</span>
                  </div>
                </td>
                <td className="py-2 px-2 text-slate-500">{mapping.last_assessed_at ? new Date(mapping.last_assessed_at).toLocaleDateString() : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <div className="text-center text-slate-500 text-xs py-8">No compliance mappings found</div>}
      </div>
    </div>
  );
}

export function AgentLearningTab() {
  const [metrics, setMetrics] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMetrics();
  }, []);

  const fetchMetrics = async () => {
    const { data } = await supabase.from('agent_learning_metrics').select('*, agent_identities(display_name, agent_slug)').order('created_at', { ascending: false }).limit(50);
    if (data) setMetrics(data);
    setLoading(false);
  };

  if (loading) return <div className="flex items-center justify-center h-64 text-slate-400">Loading learning metrics...</div>;

  return (
    <div className="space-y-3 overflow-y-auto h-full pr-1">
      <div className="grid grid-cols-4 gap-3 mb-4">
        <div className="bg-slate-800/40 border border-slate-700/30 rounded p-3">
          <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Agents Learning</div>
          <div className="text-lg font-bold text-slate-100">{new Set(metrics.map(m => m.agent_id)).size}</div>
        </div>
        <div className="bg-slate-800/40 border border-slate-700/30 rounded p-3">
          <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Avg Accuracy</div>
          <div className="text-lg font-bold text-emerald-400">{metrics.length ? (metrics.reduce((s, m) => s + (m.accuracy || 0), 0) / metrics.length * 100).toFixed(1) : '0'}%</div>
        </div>
        <div className="bg-slate-800/40 border border-slate-700/30 rounded p-3">
          <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Avg F1 Score</div>
          <div className="text-lg font-bold text-blue-400">{metrics.length ? (metrics.reduce((s, m) => s + (m.f1_score || 0), 0) / metrics.length * 100).toFixed(1) : '0'}%</div>
        </div>
        <div className="bg-slate-800/40 border border-slate-700/30 rounded p-3">
          <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Patterns Learned</div>
          <div className="text-lg font-bold text-cyan-400">{metrics.reduce((s, m) => s + (m.patterns_learned || 0), 0).toLocaleString()}</div>
        </div>
      </div>
      <div className="space-y-2">
        {metrics.map(metric => (
          <div key={metric.id} className="bg-slate-800/30 border border-slate-700/30 rounded p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-3.5 h-3.5 text-blue-400" />
                <span className="text-xs font-medium text-slate-200">{metric.agent_identities?.display_name || metric.agent_id?.slice(0, 8)}</span>
                <span className="px-1.5 py-0.5 text-[10px] rounded bg-slate-700/50 text-slate-400">{metric.model_version || 'v1'}</span>
              </div>
              <span className="text-[10px] text-slate-500">{metric.metric_date || ''}</span>
            </div>
            <div className="grid grid-cols-6 gap-3 text-[10px]">
              <div>
                <span className="text-slate-500">Accuracy</span>
                <div className="text-slate-200 font-medium">{((metric.accuracy || 0) * 100).toFixed(1)}%</div>
              </div>
              <div>
                <span className="text-slate-500">Precision</span>
                <div className="text-slate-200 font-medium">{((metric.precision_score || 0) * 100).toFixed(1)}%</div>
              </div>
              <div>
                <span className="text-slate-500">Recall</span>
                <div className="text-slate-200 font-medium">{((metric.recall_score || 0) * 100).toFixed(1)}%</div>
              </div>
              <div>
                <span className="text-slate-500">F1</span>
                <div className="text-slate-200 font-medium">{((metric.f1_score || 0) * 100).toFixed(1)}%</div>
              </div>
              <div>
                <span className="text-slate-500">Patterns</span>
                <div className="text-slate-200 font-medium">{metric.patterns_learned || 0}</div>
              </div>
              <div>
                <span className="text-slate-500">Drift</span>
                <div className={`font-medium ${(metric.drift_score || 0) > 0.3 ? 'text-red-400' : (metric.drift_score || 0) > 0.15 ? 'text-amber-400' : 'text-emerald-400'}`}>{((metric.drift_score || 0) * 100).toFixed(1)}%</div>
              </div>
            </div>
          </div>
        ))}
        {metrics.length === 0 && <div className="text-center text-slate-500 text-xs py-8">No learning metrics recorded</div>}
      </div>
    </div>
  );
}
