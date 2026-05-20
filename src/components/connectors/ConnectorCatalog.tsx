import { useState, useMemo } from 'react';
import {
  Search,
  Database,
  Cloud,
  Shield,
  Server,
  Network,
  Eye,
  Lock,
  Mail,
  Bug,
  Globe,
  AlertTriangle,
  Code,
  Layers,
  Radio,
  Wifi,
  HardDrive,
  Fingerprint,
  FileSearch,
  MessageSquare,
  CheckCircle,
  Zap,
  BarChart3,
  ChevronDown,
  ChevronUp,
  Settings,
} from 'lucide-react';
import { CATALOG_CONNECTORS, CONNECTOR_CATEGORIES, type CatalogConnector } from '../../lib/connectorsCatalog';
import ConnectorConfigModal from './ConnectorConfigModal';

const CATEGORY_ICONS: Record<string, any> = {
  siem: Database,
  cloud_aws: Cloud,
  cloud_azure: Cloud,
  cloud_gcp: Cloud,
  edr: Shield,
  firewall: Network,
  iam: Fingerprint,
  email: Mail,
  vuln: Bug,
  threat_intel: Globe,
  waf: Shield,
  dlp: Lock,
  container: Server,
  devsecops: Code,
  ndr: Radio,
  casb: Cloud,
  soar: Zap,
  observability: Eye,
  ics_ot: HardDrive,
  dns: Wifi,
  endpoint_mgmt: Server,
  grc: FileSearch,
  collaboration: MessageSquare,
  database: Database,
  zero_trust: Lock,
};

const CATEGORY_COLORS: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  siem: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/30', dot: 'bg-emerald-500' },
  cloud_aws: { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/30', dot: 'bg-amber-500' },
  cloud_azure: { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/30', dot: 'bg-blue-500' },
  cloud_gcp: { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/30', dot: 'bg-red-500' },
  edr: { bg: 'bg-rose-500/10', text: 'text-rose-400', border: 'border-rose-500/30', dot: 'bg-rose-500' },
  firewall: { bg: 'bg-orange-500/10', text: 'text-orange-400', border: 'border-orange-500/30', dot: 'bg-orange-500' },
  iam: { bg: 'bg-cyan-500/10', text: 'text-cyan-400', border: 'border-cyan-500/30', dot: 'bg-cyan-500' },
  email: { bg: 'bg-sky-500/10', text: 'text-sky-400', border: 'border-sky-500/30', dot: 'bg-sky-500' },
  vuln: { bg: 'bg-teal-500/10', text: 'text-teal-400', border: 'border-teal-500/30', dot: 'bg-teal-500' },
  threat_intel: { bg: 'bg-slate-500/10', text: 'text-slate-400', border: 'border-slate-500/30', dot: 'bg-slate-500' },
  waf: { bg: 'bg-lime-500/10', text: 'text-lime-400', border: 'border-lime-500/30', dot: 'bg-lime-500' },
  dlp: { bg: 'bg-pink-500/10', text: 'text-pink-400', border: 'border-pink-500/30', dot: 'bg-pink-500' },
  container: { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/30', dot: 'bg-blue-500' },
  devsecops: { bg: 'bg-stone-500/10', text: 'text-stone-400', border: 'border-stone-500/30', dot: 'bg-stone-500' },
  ndr: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/30', dot: 'bg-emerald-500' },
  casb: { bg: 'bg-cyan-500/10', text: 'text-cyan-400', border: 'border-cyan-500/30', dot: 'bg-cyan-500' },
  soar: { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/30', dot: 'bg-amber-500' },
  observability: { bg: 'bg-sky-500/10', text: 'text-sky-400', border: 'border-sky-500/30', dot: 'bg-sky-500' },
  ics_ot: { bg: 'bg-orange-500/10', text: 'text-orange-400', border: 'border-orange-500/30', dot: 'bg-orange-500' },
  dns: { bg: 'bg-teal-500/10', text: 'text-teal-400', border: 'border-teal-500/30', dot: 'bg-teal-500' },
  endpoint_mgmt: { bg: 'bg-slate-500/10', text: 'text-slate-400', border: 'border-slate-500/30', dot: 'bg-slate-500' },
  grc: { bg: 'bg-rose-500/10', text: 'text-rose-400', border: 'border-rose-500/30', dot: 'bg-rose-500' },
  collaboration: { bg: 'bg-sky-500/10', text: 'text-sky-400', border: 'border-sky-500/30', dot: 'bg-sky-500' },
  database: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/30', dot: 'bg-emerald-500' },
  zero_trust: { bg: 'bg-cyan-500/10', text: 'text-cyan-400', border: 'border-cyan-500/30', dot: 'bg-cyan-500' },
};

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  connected: { bg: 'bg-emerald-500/15', text: 'text-emerald-400', label: 'Connected' },
  available: { bg: 'bg-slate-500/15', text: 'text-slate-400', label: 'Available' },
  beta: { bg: 'bg-amber-500/15', text: 'text-amber-400', label: 'Beta' },
};

function getColors(category: string) {
  return CATEGORY_COLORS[category] || CATEGORY_COLORS.siem;
}

export default function ConnectorCatalog() {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [configConnector, setConfigConnector] = useState<CatalogConnector | null>(null);

  const filtered = useMemo(() => {
    let results = CATALOG_CONNECTORS;
    if (selectedCategory) results = results.filter(c => c.category === selectedCategory);
    if (statusFilter) results = results.filter(c => c.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      results = results.filter(c =>
        c.name.toLowerCase().includes(q) ||
        c.vendor.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q) ||
        c.protocol.toLowerCase().includes(q) ||
        (CONNECTOR_CATEGORIES[c.category] || '').toLowerCase().includes(q)
      );
    }
    return results;
  }, [search, selectedCategory, statusFilter]);

  const grouped = useMemo(() => {
    const groups: Record<string, CatalogConnector[]> = {};
    for (const c of filtered) {
      if (!groups[c.category]) groups[c.category] = [];
      groups[c.category].push(c);
    }
    return groups;
  }, [filtered]);

  const categoryKeys = Object.keys(CONNECTOR_CATEGORIES);
  const connectedCount = CATALOG_CONNECTORS.filter(c => c.status === 'connected').length;
  const availableCount = CATALOG_CONNECTORS.filter(c => c.status === 'available').length;
  const betaCount = CATALOG_CONNECTORS.filter(c => c.status === 'beta').length;

  const toggleCategory = (cat: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const allExpanded = Object.keys(grouped).every(k => expandedCategories.has(k));
  const toggleAll = () => {
    if (allExpanded) {
      setExpandedCategories(new Set());
    } else {
      setExpandedCategories(new Set(Object.keys(grouped)));
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-blue-500/5 rounded-xl p-4 border border-blue-500/20">
          <div className="flex items-center justify-between mb-1">
            <Layers className="w-5 h-5 text-blue-400" />
            <span className="text-2xl font-bold text-blue-300">{CATALOG_CONNECTORS.length}</span>
          </div>
          <div className="text-sm font-medium text-blue-400">Total Connectors</div>
          <div className="text-xs text-blue-500/70 mt-0.5">{categoryKeys.length} categories</div>
        </div>
        <div className="bg-emerald-500/5 rounded-xl p-4 border border-emerald-500/20">
          <div className="flex items-center justify-between mb-1">
            <CheckCircle className="w-5 h-5 text-emerald-400" />
            <span className="text-2xl font-bold text-emerald-300">{connectedCount}</span>
          </div>
          <div className="text-sm font-medium text-emerald-400">Connected</div>
          <div className="text-xs text-emerald-500/70 mt-0.5">Active integrations</div>
        </div>
        <div className="bg-slate-700/20 rounded-xl p-4 border border-slate-600/30">
          <div className="flex items-center justify-between mb-1">
            <Server className="w-5 h-5 text-slate-400" />
            <span className="text-2xl font-bold text-slate-300">{availableCount}</span>
          </div>
          <div className="text-sm font-medium text-slate-400">Available</div>
          <div className="text-xs text-slate-500 mt-0.5">Ready to connect</div>
        </div>
        <div className="bg-amber-500/5 rounded-xl p-4 border border-amber-500/20">
          <div className="flex items-center justify-between mb-1">
            <Zap className="w-5 h-5 text-amber-400" />
            <span className="text-2xl font-bold text-amber-300">{betaCount}</span>
          </div>
          <div className="text-sm font-medium text-amber-400">Beta</div>
          <div className="text-xs text-amber-500/70 mt-0.5">Early access</div>
        </div>
      </div>

      <div className="bg-slate-800/40 rounded-xl border border-slate-700/50 p-4">
        <div className="flex items-center gap-4 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search connectors by name, vendor, protocol, or category..."
              className="w-full pl-10 pr-4 py-2.5 bg-slate-900/50 border border-slate-700/50 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500/50"
            />
          </div>
          <div className="flex gap-2">
            {(['connected', 'available', 'beta'] as const).map((s) => {
              const st = STATUS_STYLES[s];
              return (
                <button
                  key={s}
                  onClick={() => setStatusFilter(statusFilter === s ? null : s)}
                  className={`px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                    statusFilter === s ? `${st.bg} ${st.text}` : 'text-slate-400 hover:bg-slate-700/50 border border-slate-600/50'
                  }`}
                >
                  {st.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setSelectedCategory(null)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              !selectedCategory ? 'bg-blue-500/15 text-blue-400 shadow-sm' : 'text-slate-400 hover:bg-slate-700/50 border border-slate-600/50'
            }`}
          >
            All ({CATALOG_CONNECTORS.length})
          </button>
          {categoryKeys.map((key) => {
            const count = CATALOG_CONNECTORS.filter(c => c.category === key).length;
            const colors = getColors(key);
            return (
              <button
                key={key}
                onClick={() => setSelectedCategory(selectedCategory === key ? null : key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  selectedCategory === key ? `${colors.bg} ${colors.text} shadow-sm` : 'text-slate-400 hover:bg-slate-700/50 border border-slate-600/50'
                }`}
              >
                {CONNECTOR_CATEGORIES[key]} ({count})
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="text-sm text-slate-400">
          Showing <span className="font-bold text-white">{filtered.length}</span> connectors
          {selectedCategory && <span> in <span className="font-semibold text-slate-300">{CONNECTOR_CATEGORIES[selectedCategory]}</span></span>}
          {search && <span> matching "<span className="font-semibold text-slate-300">{search}</span>"</span>}
        </div>
        <button
          onClick={toggleAll}
          className="text-xs text-cyan-400 hover:text-cyan-300 font-medium flex items-center gap-1"
        >
          {allExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          {allExpanded ? 'Collapse All' : 'Expand All'}
        </button>
      </div>

      {Object.entries(grouped).map(([categoryKey, connectors]) => {
        const Icon = CATEGORY_ICONS[categoryKey] || Database;
        const colors = getColors(categoryKey);
        const isExpanded = expandedCategories.has(categoryKey);
        const connectedInCat = connectors.filter(c => c.status === 'connected').length;

        return (
          <div key={categoryKey} className="bg-slate-800/40 rounded-xl border border-slate-700/50 overflow-hidden">
            <button
              onClick={() => toggleCategory(categoryKey)}
              className="w-full flex items-center justify-between p-4 hover:bg-slate-700/30 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-lg ${colors.bg} flex items-center justify-center`}>
                  <Icon className={`w-5 h-5 ${colors.text}`} />
                </div>
                <div className="text-left">
                  <div className="text-sm font-bold text-white">{CONNECTOR_CATEGORIES[categoryKey]}</div>
                  <div className="text-xs text-slate-400">
                    {connectors.length} connector{connectors.length !== 1 ? 's' : ''}
                    {connectedInCat > 0 && <span className="text-emerald-400 ml-1">({connectedInCat} connected)</span>}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex -space-x-1">
                  {connectors.slice(0, 4).map((c) => {
                    const st = STATUS_STYLES[c.status];
                    return <div key={c.id} className={`w-2.5 h-2.5 rounded-full ${colors.dot} ring-2 ring-slate-800`} />;
                  })}
                  {connectors.length > 4 && (
                    <div className="w-5 h-5 rounded-full bg-slate-700 ring-2 ring-slate-800 flex items-center justify-center">
                      <span className="text-[8px] font-bold text-slate-300">+{connectors.length - 4}</span>
                    </div>
                  )}
                </div>
                {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
              </div>
            </button>

            {isExpanded && (
              <div className="border-t border-slate-700/50 p-4">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  {connectors.map((conn) => {
                    const st = STATUS_STYLES[conn.status];
                    return (
                      <div
                        key={conn.id}
                        onClick={() => setConfigConnector(conn)}
                        className={`p-4 rounded-lg border ${colors.border} bg-slate-800/50 hover:bg-slate-700/40 hover:shadow-lg hover:shadow-black/20 transition-all cursor-pointer group relative`}
                      >
                        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <div className="p-1 bg-slate-900/80 rounded-md">
                            <Settings className="w-3.5 h-3.5 text-cyan-400" />
                          </div>
                        </div>
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-semibold text-white">{conn.name}</div>
                            <div className="text-xs text-slate-400">{conn.vendor}</div>
                          </div>
                          <span className={`flex-shrink-0 ml-2 px-2 py-0.5 rounded-full text-[10px] font-semibold ${st.bg} ${st.text}`}>
                            {st.label}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 leading-relaxed mb-3">{conn.description}</p>
                        <div className="flex items-center gap-2">
                          <BarChart3 className="w-3 h-3 text-slate-500 flex-shrink-0" />
                          <span className="text-[10px] font-mono text-slate-500 truncate">{conn.protocol}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {filtered.length === 0 && (
        <div className="text-center py-16">
          <Search className="w-12 h-12 text-slate-600 mx-auto mb-4" />
          <div className="text-lg font-medium text-slate-400">No connectors found</div>
          <div className="text-sm text-slate-500 mt-1">Try adjusting your search or filters</div>
        </div>
      )}

      {configConnector && (
        <ConnectorConfigModal connector={configConnector} onClose={() => setConfigConnector(null)} />
      )}
    </div>
  );
}
