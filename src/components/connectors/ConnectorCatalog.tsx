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
} from 'lucide-react';
import { CATALOG_CONNECTORS, CONNECTOR_CATEGORIES, type CatalogConnector } from '../../lib/connectorsCatalog';

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
  siem: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-500' },
  cloud_aws: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', dot: 'bg-amber-500' },
  cloud_azure: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', dot: 'bg-blue-500' },
  cloud_gcp: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', dot: 'bg-red-500' },
  edr: { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200', dot: 'bg-rose-500' },
  firewall: { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200', dot: 'bg-orange-500' },
  iam: { bg: 'bg-cyan-50', text: 'text-cyan-700', border: 'border-cyan-200', dot: 'bg-cyan-500' },
  email: { bg: 'bg-sky-50', text: 'text-sky-700', border: 'border-sky-200', dot: 'bg-sky-500' },
  vuln: { bg: 'bg-teal-50', text: 'text-teal-700', border: 'border-teal-200', dot: 'bg-teal-500' },
  threat_intel: { bg: 'bg-slate-100', text: 'text-slate-700', border: 'border-slate-300', dot: 'bg-slate-500' },
  waf: { bg: 'bg-lime-50', text: 'text-lime-700', border: 'border-lime-200', dot: 'bg-lime-600' },
  dlp: { bg: 'bg-pink-50', text: 'text-pink-700', border: 'border-pink-200', dot: 'bg-pink-500' },
  container: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', dot: 'bg-blue-500' },
  devsecops: { bg: 'bg-stone-50', text: 'text-stone-700', border: 'border-stone-200', dot: 'bg-stone-500' },
  ndr: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-500' },
  casb: { bg: 'bg-cyan-50', text: 'text-cyan-700', border: 'border-cyan-200', dot: 'bg-cyan-500' },
  soar: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', dot: 'bg-amber-500' },
  observability: { bg: 'bg-sky-50', text: 'text-sky-700', border: 'border-sky-200', dot: 'bg-sky-500' },
  ics_ot: { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200', dot: 'bg-orange-500' },
  dns: { bg: 'bg-teal-50', text: 'text-teal-700', border: 'border-teal-200', dot: 'bg-teal-500' },
  endpoint_mgmt: { bg: 'bg-slate-100', text: 'text-slate-700', border: 'border-slate-300', dot: 'bg-slate-500' },
  grc: { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200', dot: 'bg-rose-500' },
  collaboration: { bg: 'bg-sky-50', text: 'text-sky-700', border: 'border-sky-200', dot: 'bg-sky-500' },
  database: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-500' },
  zero_trust: { bg: 'bg-cyan-50', text: 'text-cyan-700', border: 'border-cyan-200', dot: 'bg-cyan-500' },
};

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  connected: { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'Connected' },
  available: { bg: 'bg-slate-100', text: 'text-slate-600', label: 'Available' },
  beta: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Beta' },
};

function getColors(category: string) {
  return CATEGORY_COLORS[category] || CATEGORY_COLORS.siem;
}

export default function ConnectorCatalog() {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

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
        <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-4 border border-blue-200">
          <div className="flex items-center justify-between mb-1">
            <Layers className="w-5 h-5 text-blue-600" />
            <span className="text-2xl font-bold text-blue-700">{CATALOG_CONNECTORS.length}</span>
          </div>
          <div className="text-sm font-medium text-blue-600">Total Connectors</div>
          <div className="text-xs text-blue-500 mt-0.5">{categoryKeys.length} categories</div>
        </div>
        <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-xl p-4 border border-emerald-200">
          <div className="flex items-center justify-between mb-1">
            <CheckCircle className="w-5 h-5 text-emerald-600" />
            <span className="text-2xl font-bold text-emerald-700">{connectedCount}</span>
          </div>
          <div className="text-sm font-medium text-emerald-600">Connected</div>
          <div className="text-xs text-emerald-500 mt-0.5">Active integrations</div>
        </div>
        <div className="bg-gradient-to-br from-slate-50 to-slate-100 rounded-xl p-4 border border-slate-200">
          <div className="flex items-center justify-between mb-1">
            <Server className="w-5 h-5 text-slate-500" />
            <span className="text-2xl font-bold text-slate-700">{availableCount}</span>
          </div>
          <div className="text-sm font-medium text-slate-600">Available</div>
          <div className="text-xs text-slate-500 mt-0.5">Ready to connect</div>
        </div>
        <div className="bg-gradient-to-br from-amber-50 to-amber-100 rounded-xl p-4 border border-amber-200">
          <div className="flex items-center justify-between mb-1">
            <Zap className="w-5 h-5 text-amber-600" />
            <span className="text-2xl font-bold text-amber-700">{betaCount}</span>
          </div>
          <div className="text-sm font-medium text-amber-600">Beta</div>
          <div className="text-xs text-amber-500 mt-0.5">Early access</div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="flex items-center gap-4 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search connectors by name, vendor, protocol, or category..."
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
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
                    statusFilter === s ? `${st.bg} ${st.text}` : 'text-slate-500 hover:bg-slate-50 border border-slate-200'
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
              !selectedCategory ? 'bg-blue-100 text-blue-700 shadow-sm' : 'text-slate-500 hover:bg-slate-50 border border-slate-200'
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
                  selectedCategory === key ? `${colors.bg} ${colors.text} shadow-sm` : 'text-slate-500 hover:bg-slate-50 border border-slate-200'
                }`}
              >
                {CONNECTOR_CATEGORIES[key]} ({count})
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="text-sm text-slate-600">
          Showing <span className="font-bold text-slate-900">{filtered.length}</span> connectors
          {selectedCategory && <span> in <span className="font-semibold">{CONNECTOR_CATEGORIES[selectedCategory]}</span></span>}
          {search && <span> matching "<span className="font-semibold">{search}</span>"</span>}
        </div>
        <button
          onClick={toggleAll}
          className="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
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
          <div key={categoryKey} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <button
              onClick={() => toggleCategory(categoryKey)}
              className="w-full flex items-center justify-between p-4 hover:bg-slate-50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-lg ${colors.bg} flex items-center justify-center`}>
                  <Icon className={`w-5 h-5 ${colors.text}`} />
                </div>
                <div className="text-left">
                  <div className="text-sm font-bold text-slate-900">{CONNECTOR_CATEGORIES[categoryKey]}</div>
                  <div className="text-xs text-slate-500">
                    {connectors.length} connector{connectors.length !== 1 ? 's' : ''}
                    {connectedInCat > 0 && <span className="text-emerald-600 ml-1">({connectedInCat} connected)</span>}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex -space-x-1">
                  {connectors.slice(0, 4).map((c) => {
                    const st = STATUS_STYLES[c.status];
                    return <div key={c.id} className={`w-2.5 h-2.5 rounded-full ${colors.dot} ring-2 ring-white`} />;
                  })}
                  {connectors.length > 4 && (
                    <div className="w-5 h-5 rounded-full bg-slate-200 ring-2 ring-white flex items-center justify-center">
                      <span className="text-[8px] font-bold text-slate-600">+{connectors.length - 4}</span>
                    </div>
                  )}
                </div>
                {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
              </div>
            </button>

            {isExpanded && (
              <div className="border-t border-slate-100 p-4">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  {connectors.map((conn) => {
                    const st = STATUS_STYLES[conn.status];
                    return (
                      <div
                        key={conn.id}
                        className={`p-4 rounded-lg border ${colors.border} ${colors.bg} bg-opacity-30 hover:shadow-md transition-all`}
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-semibold text-slate-900">{conn.name}</div>
                            <div className="text-xs text-slate-500">{conn.vendor}</div>
                          </div>
                          <span className={`flex-shrink-0 ml-2 px-2 py-0.5 rounded-full text-[10px] font-semibold ${st.bg} ${st.text}`}>
                            {st.label}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 leading-relaxed mb-3">{conn.description}</p>
                        <div className="flex items-center gap-2">
                          <BarChart3 className="w-3 h-3 text-slate-400 flex-shrink-0" />
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
          <Search className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <div className="text-lg font-medium text-slate-500">No connectors found</div>
          <div className="text-sm text-slate-400 mt-1">Try adjusting your search or filters</div>
        </div>
      )}
    </div>
  );
}
