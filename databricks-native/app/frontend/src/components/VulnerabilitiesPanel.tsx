import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Shield, AlertTriangle, TrendingUp, Database, Search, ExternalLink } from 'lucide-react';

interface AssetVulnerability {
  id: string;
  asset_id: string;
  cve_id: string;
  severity: string;
  cvss_score: number;
  title: string;
  description: string;
  affected_component: string;
  remediation: string;
  status: string;
  discovered_at: string;
  patched_at?: string;
}

interface NVDVulnerability {
  id: number;
  cve_id: string;
  vulnerability_description: string;
  cvss_v3_score: number;
  cvss_v3_severity: string;
  published_date: string;
  last_modified_date: string;
  affected_products: any;
  remediation_guidance: string;
}

export default function VulnerabilitiesPanel() {
  const [assetVulns, setAssetVulns] = useState<AssetVulnerability[]>([]);
  const [nvdVulns, setNVDVulns] = useState<NVDVulnerability[]>([]);
  const [physicalVulns, setPhysicalVulns] = useState<any[]>([]);
  const [stats, setStats] = useState({
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    total: 0,
    patched: 0,
    open: 0
  });
  const [filter, setFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadVulnerabilities();
  }, []);

  const loadVulnerabilities = async () => {
    try {
      setLoading(true);

      const [assetRes, nvdRes, physicalRes] = await Promise.all([
        supabase.from('asset_vulnerabilities').select('*').order('cvss_score', { ascending: false }),
        supabase.from('nist_nvd_vulnerabilities').select('*').order('cvss_v3_score', { ascending: false }).limit(50),
        supabase.from('physical_asset_vulnerabilities').select('*').limit(20)
      ]);

      console.log('Asset Vulns:', assetRes);
      console.log('NVD Vulns:', nvdRes);

      if (assetRes.error) {
        console.error('Asset vulnerabilities error:', assetRes.error);
      }

      if (assetRes.data) {
        setAssetVulns(assetRes.data);

        const critical = assetRes.data.filter(v => v.severity === 'critical').length;
        const high = assetRes.data.filter(v => v.severity === 'high').length;
        const medium = assetRes.data.filter(v => v.severity === 'medium').length;
        const low = assetRes.data.filter(v => v.severity === 'low').length;
        const patchedCount = assetRes.data.filter(v => v.status === 'patched').length;
        const openCount = assetRes.data.filter(v => v.status === 'open').length;

        setStats({
          critical,
          high,
          medium,
          low,
          total: assetRes.data.length,
          patched: patchedCount,
          open: openCount
        });
      }

      if (nvdRes.data) setNVDVulns(nvdRes.data);
      if (physicalRes.data) setPhysicalVulns(physicalRes.data);
    } catch (error) {
      console.error('Error loading vulnerabilities:', error);
    } finally {
      setLoading(false);
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity?.toLowerCase()) {
      case 'critical': return 'text-red-700 bg-red-100 border-red-300';
      case 'high': return 'text-orange-700 bg-orange-100 border-orange-300';
      case 'medium': return 'text-yellow-700 bg-yellow-100 border-yellow-300';
      case 'low': return 'text-blue-700 bg-blue-100 border-blue-300';
      default: return 'text-slate-700 bg-slate-100 border-slate-300';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'patched': return 'text-green-700 bg-green-100';
      case 'in_progress': return 'text-blue-700 bg-blue-100';
      case 'open': return 'text-red-700 bg-red-100';
      case 'accepted': return 'text-slate-700 bg-slate-200';
      default: return 'text-slate-700 bg-slate-100';
    }
  };

  const filteredVulns = assetVulns.filter(v => {
    const matchesFilter = filter === 'all' || v.severity === filter;
    const matchesSearch = !searchTerm ||
      v.cve_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      v.title.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-slate-600">Loading vulnerabilities...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Vulnerability Management</h2>
          <p className="text-slate-600 mt-1">CVE tracking, NIST NVD integration, and asset vulnerability assessment</p>
        </div>
        <div className="flex gap-2">
          <span className="px-3 py-1 bg-red-100 text-red-800 rounded-full text-sm font-medium">
            <AlertTriangle className="inline w-4 h-4 mr-1" />
            {stats.critical} Critical
          </span>
          <span className="px-3 py-1 bg-orange-100 text-orange-800 rounded-full text-sm font-medium">
            {stats.high} High
          </span>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-600">Total Vulnerabilities</p>
              <p className="text-3xl font-bold text-slate-900 mt-1">{stats.total}</p>
            </div>
            <Shield className="w-12 h-12 text-slate-500" />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-600">Critical Severity</p>
              <p className="text-3xl font-bold text-red-600 mt-1">{stats.critical}</p>
            </div>
            <AlertTriangle className="w-12 h-12 text-red-500" />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-600">Patched</p>
              <p className="text-3xl font-bold text-green-600 mt-1">{stats.patched}</p>
            </div>
            <TrendingUp className="w-12 h-12 text-green-500" />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-600">Open</p>
              <p className="text-3xl font-bold text-slate-900 mt-1">{stats.open}</p>
            </div>
            <Database className="w-12 h-12 text-slate-600" />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-slate-200">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-slate-900">Asset Vulnerabilities ({filteredVulns.length})</h3>
            <div className="flex gap-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search CVE or title..."
                  className="pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-slate-500"
                />
              </div>
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="px-4 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-slate-500"
              >
                <option value="all">All Severities</option>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
          </div>
        </div>
        <div className="p-6">
          {filteredVulns.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              No vulnerabilities found matching your criteria
            </div>
          ) : (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {filteredVulns.map((vuln) => (
                <div key={vuln.id} className="border border-slate-200 rounded-lg p-4 hover:border-slate-400 transition">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <span className={`px-3 py-1 rounded-full text-xs font-bold border ${getSeverityColor(vuln.severity)}`}>
                        {vuln.severity.toUpperCase()}
                      </span>
                      <span className="font-mono font-semibold text-slate-900">{vuln.cve_id}</span>
                      <span className="text-sm text-slate-600">CVSS: {vuln.cvss_score?.toFixed(1)}</span>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(vuln.status)}`}>
                      {vuln.status?.replace('_', ' ').toUpperCase()}
                    </span>
                  </div>

                  <h4 className="font-semibold text-slate-900 mb-2">{vuln.title}</h4>
                  <p className="text-sm text-slate-700 mb-3">{vuln.description}</p>

                  <div className="grid grid-cols-3 gap-4 text-sm pt-3 border-t border-slate-100">
                    <div>
                      <span className="text-slate-600">Component:</span>
                      <span className="ml-2 font-medium text-slate-900">{vuln.affected_component}</span>
                    </div>
                    <div>
                      <span className="text-slate-600">Discovered:</span>
                      <span className="ml-2 text-slate-900">{new Date(vuln.discovered_at).toLocaleDateString()}</span>
                    </div>
                    <div>
                      <span className="text-slate-600">Remediation:</span>
                      <span className="ml-2 text-slate-900 text-xs">{vuln.remediation?.substring(0, 40)}...</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-slate-200">
            <h3 className="text-lg font-semibold text-slate-900">NIST NVD Database</h3>
            <p className="text-sm text-slate-600 mt-1">National Vulnerability Database ({nvdVulns.length} CVEs)</p>
          </div>
          <div className="p-6">
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {nvdVulns.slice(0, 10).map((vuln) => (
                <div key={vuln.id} className="border border-slate-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono font-semibold text-slate-900">{vuln.cve_id}</span>
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-1 rounded text-xs font-bold ${getSeverityColor(vuln.cvss_v3_severity)}`}>
                        {vuln.cvss_v3_severity}
                      </span>
                      <span className="text-sm font-semibold text-slate-900">{vuln.cvss_v3_score?.toFixed(1)}</span>
                    </div>
                  </div>
                  <p className="text-sm text-slate-700 mb-2 line-clamp-2">{vuln.vulnerability_description}</p>
                  <div className="flex items-center justify-between text-xs text-slate-600">
                    <span>Published: {new Date(vuln.published_date).toLocaleDateString()}</span>
                    <a
                      href={`https://nvd.nist.gov/vuln/detail/${vuln.cve_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-slate-900 hover:text-slate-700 flex items-center gap-1 font-medium"
                    >
                      View NVD <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-slate-200">
            <h3 className="text-lg font-semibold text-slate-900">Physical Asset Vulnerabilities</h3>
            <p className="text-sm text-slate-600 mt-1">Facilities and physical security ({physicalVulns.length})</p>
          </div>
          <div className="p-6">
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {physicalVulns.map((vuln) => (
                <div key={vuln.id} className="border border-slate-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-slate-900">{vuln.vulnerability_type?.replace('_', ' ')}</span>
                    <span className={`px-2 py-1 rounded text-xs font-bold ${getSeverityColor(vuln.severity)}`}>
                      {vuln.severity}
                    </span>
                  </div>
                  <p className="text-sm text-slate-600 mb-2">{vuln.description}</p>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-600">Risk: {vuln.risk_score?.toFixed(1)}</span>
                    <span className={`px-2 py-1 rounded ${getStatusColor(vuln.status)}`}>
                      {vuln.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-slate-50 rounded-lg p-6 border border-slate-200">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">Severity Distribution</h3>
        <div className="grid grid-cols-4 gap-4">
          <div className="text-center">
            <div className="text-4xl font-bold text-red-600 mb-1">{stats.critical}</div>
            <div className="text-sm text-slate-600 mb-2">Critical</div>
            <div className="w-full bg-red-200 rounded-full h-2">
              <div
                className="bg-red-600 h-2 rounded-full transition-all"
                style={{ width: stats.total > 0 ? `${(stats.critical / stats.total) * 100}%` : '0%' }}
              />
            </div>
          </div>
          <div className="text-center">
            <div className="text-4xl font-bold text-orange-600 mb-1">{stats.high}</div>
            <div className="text-sm text-slate-600 mb-2">High</div>
            <div className="w-full bg-orange-200 rounded-full h-2">
              <div
                className="bg-orange-600 h-2 rounded-full transition-all"
                style={{ width: stats.total > 0 ? `${(stats.high / stats.total) * 100}%` : '0%' }}
              />
            </div>
          </div>
          <div className="text-center">
            <div className="text-4xl font-bold text-yellow-600 mb-1">{stats.medium}</div>
            <div className="text-sm text-slate-600 mb-2">Medium</div>
            <div className="w-full bg-yellow-200 rounded-full h-2">
              <div
                className="bg-yellow-600 h-2 rounded-full transition-all"
                style={{ width: stats.total > 0 ? `${(stats.medium / stats.total) * 100}%` : '0%' }}
              />
            </div>
          </div>
          <div className="text-center">
            <div className="text-4xl font-bold text-blue-600 mb-1">{stats.low}</div>
            <div className="text-sm text-slate-600 mb-2">Low</div>
            <div className="w-full bg-blue-200 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all"
                style={{ width: stats.total > 0 ? `${(stats.low / stats.total) * 100}%` : '0%' }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}