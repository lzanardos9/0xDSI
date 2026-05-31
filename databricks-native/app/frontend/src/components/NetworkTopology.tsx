import { useState, useEffect } from 'react';
import { Network, Server, Database, Shield, Globe, Cloud, HardDrive, Layers, Cpu, Zap, Wind, Thermometer, Power, Camera, AlertTriangle, User, Upload, Plus, FileText, Trash2, Check, X, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { callFunction } from '../lib/llmGateway';
import DPIInspection from './DPIInspection';

const NetworkTopology = () => {
  const [view, setView] = useState<'logical' | 'physical' | 'dpi' | 'manage'>('logical');
  const [assets, setAssets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [personnel, setPersonnel] = useState<any[]>([]);
  const [cameras, setCameras] = useState<any[]>([]);
  const [securityEvents, setSecurityEvents] = useState<any[]>([]);
  const [zones, setZones] = useState<any[]>([]);
  const [vulnerabilities, setVulnerabilities] = useState<any[]>([]);
  const [physicalVulns, setPhysicalVulns] = useState<any[]>([]);

  useEffect(() => {
    loadAssets();
    const interval = setInterval(loadAssets, 15000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (view === 'physical') {
      loadPhysicalSecurity();
      const interval = setInterval(loadPhysicalSecurity, 5000);
      return () => clearInterval(interval);
    }
  }, [view]);

  const loadAssets = async () => {
    const [assetsData, vulnsData] = await Promise.all([
      supabase
        .from('asset_registry')
        .select('*')
        .eq('is_active', true)
        .order('location'),
      supabase
        .from('asset_vulnerabilities')
        .select('*')
        .order('cvss_score', { ascending: false })
    ]);

    setAssets(assetsData.data || []);
    setVulnerabilities(vulnsData.data || []);
    setLoading(false);
  };

  const loadPhysicalSecurity = async () => {
    const [personnelData, camerasData, eventsData, zonesData, physicalVulnsData] = await Promise.all([
      supabase.from('personnel_tracking').select('*').order('last_seen', { ascending: false }),
      supabase.from('cctv_cameras').select('*'),
      supabase.from('physical_security_events').select('*, physical_zones(zone_name)').eq('status', 'active').order('created_at', { ascending: false }),
      supabase.from('physical_zones').select('*'),
      supabase.from('physical_asset_vulnerabilities').select('*').order('severity', { ascending: false })
    ]);

    setPersonnel(personnelData.data || []);
    setCameras(camerasData.data || []);
    setSecurityEvents(eventsData.data || []);
    setZones(zonesData.data || []);
    setPhysicalVulns(physicalVulnsData.data || []);
  };

  const groupByLocation = () => {
    const grouped: Record<string, any[]> = {};
    assets.forEach((asset) => {
      const loc = asset.location || 'Unknown';
      if (!grouped[loc]) grouped[loc] = [];
      grouped[loc].push(asset);
    });
    return grouped;
  };

  const getAssetIcon = (type: string) => {
    switch (type) {
      case 'server':
        return <Server className="w-6 h-6" />;
      case 'database':
        return <Database className="w-6 h-6" />;
      case 'network_device':
        return <Network className="w-6 h-6" />;
      case 'application':
        return <Cpu className="w-6 h-6" />;
      case 'cloud_service':
        return <Cloud className="w-6 h-6" />;
      case 'workstation':
        return <HardDrive className="w-6 h-6" />;
      default:
        return <Server className="w-6 h-6" />;
    }
  };

  const getCriticalityColor = (criticality: string) => {
    switch (criticality) {
      case 'very_high':
        return 'border-red-500 bg-red-500/10 text-red-400';
      case 'high':
        return 'border-orange-500 bg-orange-500/10 text-orange-400';
      case 'medium':
        return 'border-yellow-500 bg-yellow-500/10 text-yellow-400';
      case 'low':
        return 'border-blue-500 bg-blue-500/10 text-blue-400';
      default:
        return 'border-slate-500 bg-slate-500/10 text-slate-400';
    }
  };

  const groupedAssets = groupByLocation();

  return (
    <div className="space-y-6">
      <div className="bg-slate-900/50 backdrop-blur-lg rounded-xl border border-slate-800 p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-semibold text-white flex items-center space-x-2">
              <Layers className="w-6 h-6 text-blue-500" />
              <span>Network Topology</span>
              <div className="flex items-center space-x-2 px-3 py-1 bg-green-500/10 border border-green-500/20 rounded-lg ml-4">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <span className="text-green-400 text-xs font-medium">LIVE MONITORING</span>
              </div>
            </h2>
            <p className="text-slate-400 text-sm mt-1">
              Visualize your infrastructure assets and security zones
            </p>
          </div>
          <div className="flex space-x-2">
            <button
              onClick={() => setView('logical')}
              className={`px-4 py-2 rounded-lg transition-colors ${
                view === 'logical'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              Logical View
            </button>
            <button
              onClick={() => setView('physical')}
              className={`px-4 py-2 rounded-lg transition-colors ${
                view === 'physical'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              Physical View
            </button>
            <button
              onClick={() => setView('dpi')}
              className={`px-4 py-2 rounded-lg transition-colors ${
                view === 'dpi'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              DPI / DLP
            </button>
            <button
              onClick={() => setView('manage')}
              className={`px-4 py-2 rounded-lg transition-colors ${
                view === 'manage'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              <span className="flex items-center space-x-1"><Plus className="w-4 h-4" /><span>Manage Assets</span></span>
            </button>
          </div>
        </div>

        {view === 'logical' && <LogicalTopology assets={groupedAssets} getAssetIcon={getAssetIcon} getCriticalityColor={getCriticalityColor} vulnerabilities={vulnerabilities} />}
        {view === 'physical' && <PhysicalTopology assets={groupedAssets} getAssetIcon={getAssetIcon} getCriticalityColor={getCriticalityColor} personnel={personnel} cameras={cameras} securityEvents={securityEvents} zones={zones} physicalVulns={physicalVulns} />}
        {view === 'dpi' && <DPIInspection />}
        {view === 'manage' && <AssetManager assets={assets} zones={zones} cameras={cameras} personnel={personnel} onRefresh={() => { loadAssets(); loadPhysicalSecurity(); }} />}
      </div>
    </div>
  );
};

const LogicalTopology = ({ assets, getAssetIcon, getCriticalityColor, vulnerabilities }: any) => {
  const externalAssets = assets['External'] || [];
  const dmzAssets = assets['DMZ'] || [];
  const prodAssets = assets['Production'] || [];
  const internalAssets = assets['Internal'] || [];
  const officeAssets = assets['Office'] || [];

  const getAssetVulns = (assetId: string) => {
    return vulnerabilities.filter((v: any) => v.asset_id === assetId);
  };

  const getTotalVulns = (assetList: any[]) => {
    return assetList.reduce((total, asset) => {
      return total + getAssetVulns(asset.id).length;
    }, 0);
  };

  const allAssets = [...externalAssets, ...dmzAssets, ...prodAssets, ...internalAssets, ...officeAssets];
  const totalVulnerabilities = vulnerabilities.length;
  const assetsWithVulns = allAssets.filter(asset => getAssetVulns(asset.id).length > 0).length;

  return (
    <div className="space-y-6">
      {/* Vulnerability Summary */}
      {totalVulnerabilities > 0 && (
        <div className="bg-red-900/20 border-2 border-red-500/50 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <AlertTriangle className="w-8 h-8 text-red-400" />
              <div>
                <h3 className="text-white font-bold text-lg">Asset Vulnerabilities Detected</h3>
                <p className="text-red-300 text-sm">{assetsWithVulns} assets have known vulnerabilities requiring attention</p>
              </div>
            </div>
            <div className="text-right">
              <div className="text-3xl font-bold text-red-400">{totalVulnerabilities}</div>
              <div className="text-red-300 text-sm">Total CVEs</div>
            </div>
          </div>
        </div>
      )}

      {/* 2D Network Map Visualization */}
      <div className="bg-slate-900/50 backdrop-blur-lg rounded-xl border border-slate-700 p-6">
        <h3 className="text-white font-semibold text-lg mb-4 flex items-center space-x-2">
          <Network className="w-6 h-6 text-blue-500" />
          <span>Network Security Zones - 2D Topology</span>
        </h3>

        <div className="relative bg-slate-950 rounded-lg p-8 border-2 border-slate-800" style={{ minHeight: '600px' }}>
          <svg className="w-full h-full" viewBox="0 0 1000 600" preserveAspectRatio="xMidYMid meet">
            {/* Background Grid */}
            <defs>
              <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#1e293b" strokeWidth="0.5"/>
              </pattern>
            </defs>
            <rect width="1000" height="600" fill="url(#grid)" />

            {/* Internet Zone - Top */}
            <rect x="50" y="30" width="900" height="80" fill="#7f1d1d" fillOpacity="0.2" stroke="#dc2626" strokeWidth="2" rx="8" />
            <text x="500" y="60" fill="#ef4444" fontSize="18" fontWeight="bold" textAnchor="middle">INTERNET (EXTERNAL)</text>
            <text x="500" y="85" fill="#fca5a5" fontSize="12" textAnchor="middle">Trust Level: Untrusted | {externalAssets.length} assets</text>

            {/* Flow Arrow: Internet to DMZ */}
            <path d="M 500 110 L 500 140" stroke="#dc2626" strokeWidth="3" markerEnd="url(#arrowRed)" />

            {/* DMZ Zone */}
            <rect x="50" y="140" width="900" height="100" fill="#ea580c" fillOpacity="0.15" stroke="#f97316" strokeWidth="2" rx="8" />
            <text x="500" y="170" fill="#fb923c" fontSize="18" fontWeight="bold" textAnchor="middle">DMZ (DEMILITARIZED ZONE)</text>
            <text x="500" y="195" fill="#fdba74" fontSize="12" textAnchor="middle">Trust Level: Low | {dmzAssets.length} assets | Public-Facing Services</text>

            {/* Firewall Icon between Internet and DMZ */}
            <rect x="480" y="115" width="40" height="20" fill="#dc2626" rx="3" />
            <text x="500" y="128" fill="white" fontSize="10" fontWeight="bold" textAnchor="middle">FW</text>

            {/* Flow Arrows: DMZ to Production and Internal */}
            <path d="M 350 240 L 350 280" stroke="#f97316" strokeWidth="3" markerEnd="url(#arrowOrange)" />
            <path d="M 650 240 L 650 280" stroke="#f97316" strokeWidth="3" markerEnd="url(#arrowOrange)" />

            {/* Production Zone - Left Side */}
            <rect x="50" y="280" width="420" height="110" fill="#1e3a8a" fillOpacity="0.2" stroke="#3b82f6" strokeWidth="2" rx="8" />
            <text x="260" y="310" fill="#60a5fa" fontSize="18" fontWeight="bold" textAnchor="middle">PRODUCTION</text>
            <text x="260" y="335" fill="#93c5fd" fontSize="12" textAnchor="middle">Trust Level: High | {prodAssets.length} assets</text>
            <text x="260" y="355" fill="#93c5fd" fontSize="11" textAnchor="middle">Critical Infrastructure</text>

            {/* Firewall Icon between DMZ and Production */}
            <rect x="330" y="245" width="40" height="20" fill="#f97316" rx="3" />
            <text x="350" y="258" fill="white" fontSize="10" fontWeight="bold" textAnchor="middle">FW</text>

            {/* Internal Zone - Right Side */}
            <rect x="530" y="280" width="420" height="110" fill="#166534" fillOpacity="0.2" stroke="#22c55e" strokeWidth="2" rx="8" />
            <text x="740" y="310" fill="#4ade80" fontSize="18" fontWeight="bold" textAnchor="middle">INTERNAL</text>
            <text x="740" y="335" fill="#86efac" fontSize="12" textAnchor="middle">Trust Level: Medium | {internalAssets.length} assets</text>
            <text x="740" y="355" fill="#86efac" fontSize="11" textAnchor="middle">Corporate Services</text>

            {/* Firewall Icon between DMZ and Internal */}
            <rect x="630" y="245" width="40" height="20" fill="#f97316" rx="3" />
            <text x="650" y="258" fill="white" fontSize="10" fontWeight="bold" textAnchor="middle">FW</text>

            {/* Flow Arrows: Production/Internal to Office */}
            <path d="M 260 390 L 260 430" stroke="#3b82f6" strokeWidth="3" markerEnd="url(#arrowBlue)" />
            <path d="M 740 390 L 740 430" stroke="#22c55e" strokeWidth="3" markerEnd="url(#arrowGreen)" />

            {/* Office Zone - Bottom */}
            <rect x="50" y="430" width="900" height="110" fill="#6b21a8" fillOpacity="0.15" stroke="#a855f7" strokeWidth="2" rx="8" />
            <text x="500" y="460" fill="#c084fc" fontSize="18" fontWeight="bold" textAnchor="middle">OFFICE NETWORK</text>
            <text x="500" y="485" fill="#d8b4fe" fontSize="12" textAnchor="middle">Trust Level: Medium | {officeAssets.length} assets | End-User Systems</text>

            {/* Network Device Icons */}
            {/* DMZ - Load Balancers */}
            <circle cx="450" cy="210" r="6" fill="#f97316" stroke="#fb923c" strokeWidth="2" />
            <circle cx="550" cy="210" r="6" fill="#f97316" stroke="#fb923c" strokeWidth="2" />

            {/* Production - Servers */}
            <rect x="160" y="360" width="12" height="15" fill="#3b82f6" stroke="#60a5fa" strokeWidth="1" rx="2" />
            <rect x="220" y="360" width="12" height="15" fill="#3b82f6" stroke="#60a5fa" strokeWidth="1" rx="2" />
            <rect x="280" y="360" width="12" height="15" fill="#3b82f6" stroke="#60a5fa" strokeWidth="1" rx="2" />
            <rect x="340" y="360" width="12" height="15" fill="#3b82f6" stroke="#60a5fa" strokeWidth="1" rx="2" />

            {/* Internal - Servers */}
            <rect x="640" y="360" width="12" height="15" fill="#22c55e" stroke="#4ade80" strokeWidth="1" rx="2" />
            <rect x="700" y="360" width="12" height="15" fill="#22c55e" stroke="#4ade80" strokeWidth="1" rx="2" />
            <rect x="760" y="360" width="12" height="15" fill="#22c55e" stroke="#4ade80" strokeWidth="1" rx="2" />
            <rect x="820" y="360" width="12" height="15" fill="#22c55e" stroke="#4ade80" strokeWidth="1" rx="2" />

            {/* Office - Workstations */}
            <rect x="200" y="505" width="10" height="12" fill="#a855f7" stroke="#c084fc" strokeWidth="1" rx="1" />
            <rect x="300" y="505" width="10" height="12" fill="#a855f7" stroke="#c084fc" strokeWidth="1" rx="1" />
            <rect x="400" y="505" width="10" height="12" fill="#a855f7" stroke="#c084fc" strokeWidth="1" rx="1" />
            <rect x="500" y="505" width="10" height="12" fill="#a855f7" stroke="#c084fc" strokeWidth="1" rx="1" />
            <rect x="600" y="505" width="10" height="12" fill="#a855f7" stroke="#c084fc" strokeWidth="1" rx="1" />
            <rect x="700" y="505" width="10" height="12" fill="#a855f7" stroke="#c084fc" strokeWidth="1" rx="1" />
            <rect x="800" y="505" width="10" height="12" fill="#a855f7" stroke="#c084fc" strokeWidth="1" rx="1" />

            {/* Arrow Markers */}
            <defs>
              <marker id="arrowRed" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto">
                <polygon points="0 0, 10 3, 0 6" fill="#dc2626" />
              </marker>
              <marker id="arrowOrange" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto">
                <polygon points="0 0, 10 3, 0 6" fill="#f97316" />
              </marker>
              <marker id="arrowBlue" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto">
                <polygon points="0 0, 10 3, 0 6" fill="#3b82f6" />
              </marker>
              <marker id="arrowGreen" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto">
                <polygon points="0 0, 10 3, 0 6" fill="#22c55e" />
              </marker>
            </defs>
          </svg>
        </div>

        {/* Legend */}
        <div className="mt-4 grid grid-cols-2 md:grid-cols-5 gap-4 text-xs">
          <div className="flex items-center space-x-2">
            <div className="w-4 h-4 bg-red-500 rounded"></div>
            <span className="text-slate-400">External / Internet</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-4 h-4 bg-orange-500 rounded"></div>
            <span className="text-slate-400">DMZ (Low Trust)</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-4 h-4 bg-blue-500 rounded"></div>
            <span className="text-slate-400">Production (High Trust)</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-4 h-4 bg-green-500 rounded"></div>
            <span className="text-slate-400">Internal (Medium Trust)</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-4 h-4 bg-purple-500 rounded"></div>
            <span className="text-slate-400">Office (Medium Trust)</span>
          </div>
        </div>
      </div>

      {/* Detailed Zone Assets */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* External Zone */}
        {externalAssets.length > 0 && (
          <div className="bg-red-900/10 rounded-lg border-2 border-red-500/30 p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-3">
                <Shield className="w-6 h-6 text-red-500" />
                <div>
                  <h3 className="text-white font-semibold">External Perimeter</h3>
                  <p className="text-red-400 text-sm">{externalAssets.length} assets | Untrusted Zone</p>
                </div>
              </div>
              {getTotalVulns(externalAssets) > 0 && (
                <div className="flex items-center space-x-2 bg-red-500/20 border border-red-500/50 rounded px-3 py-1">
                  <AlertTriangle className="w-4 h-4 text-red-400" />
                  <span className="text-red-400 text-sm font-bold">{getTotalVulns(externalAssets)} Vulnerabilities</span>
                </div>
              )}
            </div>
            <div className="space-y-2">
              {externalAssets.map((asset: any) => (
                <AssetCard key={asset.id} asset={asset} getAssetIcon={getAssetIcon} getCriticalityColor={getCriticalityColor} vulnerabilities={getAssetVulns(asset.id)} />
              ))}
            </div>
          </div>
        )}

        {/* DMZ Zone */}
        {dmzAssets.length > 0 && (
          <div className="bg-orange-900/10 rounded-lg border-2 border-orange-500/30 p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-3">
                <Shield className="w-6 h-6 text-orange-500" />
                <div>
                  <h3 className="text-white font-semibold">DMZ</h3>
                  <p className="text-orange-400 text-sm">{dmzAssets.length} assets | Low Trust Zone</p>
                </div>
              </div>
              {getTotalVulns(dmzAssets) > 0 && (
                <div className="flex items-center space-x-2 bg-red-500/20 border border-red-500/50 rounded px-3 py-1">
                  <AlertTriangle className="w-4 h-4 text-red-400" />
                  <span className="text-red-400 text-sm font-bold">{getTotalVulns(dmzAssets)} Vulnerabilities</span>
                </div>
              )}
            </div>
            <div className="space-y-2">
              {dmzAssets.map((asset: any) => (
                <AssetCard key={asset.id} asset={asset} getAssetIcon={getAssetIcon} getCriticalityColor={getCriticalityColor} vulnerabilities={getAssetVulns(asset.id)} />
              ))}
            </div>
          </div>
        )}

        {/* Production Zone */}
        {prodAssets.length > 0 && (
          <div className="bg-blue-900/10 rounded-lg border-2 border-blue-500/30 p-5">
            <div className="flex items-center space-x-3 mb-4">
              <Shield className="w-6 h-6 text-blue-500" />
              <div>
                <h3 className="text-white font-semibold">Production</h3>
                <p className="text-blue-400 text-sm">{prodAssets.length} assets | High Trust Zone</p>
              </div>
            </div>
            <div className="space-y-2">
              {prodAssets.map((asset: any) => (
                <AssetCard key={asset.id} asset={asset} getAssetIcon={getAssetIcon} getCriticalityColor={getCriticalityColor} vulnerabilities={getAssetVulns(asset.id)} />
              ))}
            </div>
          </div>
        )}

        {/* Internal Zone */}
        {internalAssets.length > 0 && (
          <div className="bg-green-900/10 rounded-lg border-2 border-green-500/30 p-5">
            <div className="flex items-center space-x-3 mb-4">
              <Shield className="w-6 h-6 text-green-500" />
              <div>
                <h3 className="text-white font-semibold">Internal</h3>
                <p className="text-green-400 text-sm">{internalAssets.length} assets | Medium Trust Zone</p>
              </div>
            </div>
            <div className="space-y-2">
              {internalAssets.map((asset: any) => (
                <AssetCard key={asset.id} asset={asset} getAssetIcon={getAssetIcon} getCriticalityColor={getCriticalityColor} vulnerabilities={getAssetVulns(asset.id)} />
              ))}
            </div>
          </div>
        )}

        {/* Office Zone */}
        {officeAssets.length > 0 && (
          <div className="bg-purple-900/10 rounded-lg border-2 border-purple-500/30 p-5 lg:col-span-2">
            <div className="flex items-center space-x-3 mb-4">
              <Shield className="w-6 h-6 text-purple-500" />
              <div>
                <h3 className="text-white font-semibold">Office Network</h3>
                <p className="text-purple-400 text-sm">{officeAssets.length} assets | Medium Trust Zone</p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {officeAssets.map((asset: any) => (
                <AssetCard key={asset.id} asset={asset} getAssetIcon={getAssetIcon} getCriticalityColor={getCriticalityColor} vulnerabilities={getAssetVulns(asset.id)} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Network Flow Information */}
      <div className="bg-slate-800/50 rounded-lg p-5 border border-slate-700">
        <h4 className="text-white font-semibold mb-4 flex items-center space-x-2">
          <Zap className="w-5 h-5 text-yellow-500" />
          <span>Network Traffic Flow & Security Controls</span>
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 rounded-full bg-red-500"></div>
              <span className="text-slate-400">Internet → DMZ</span>
              <span className="text-slate-500 text-xs">(Perimeter Firewall)</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 rounded-full bg-orange-500"></div>
              <span className="text-slate-400">DMZ → Production</span>
              <span className="text-slate-500 text-xs">(Internal Firewall)</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 rounded-full bg-orange-500"></div>
              <span className="text-slate-400">DMZ → Internal</span>
              <span className="text-slate-500 text-xs">(Internal Firewall)</span>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 rounded-full bg-blue-500"></div>
              <span className="text-slate-400">Production → Office</span>
              <span className="text-slate-500 text-xs">(Access Control)</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 rounded-full bg-green-500"></div>
              <span className="text-slate-400">Internal → Office</span>
              <span className="text-slate-500 text-xs">(Direct Connection)</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
              <span className="text-slate-400">All Zones Monitored</span>
              <span className="text-slate-500 text-xs">(SIEM Integration)</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const PhysicalTopology = ({ assets, getAssetIcon, getCriticalityColor, personnel, cameras, securityEvents, zones, physicalVulns }: any) => {
  const criticalPhysicalVulns = physicalVulns.filter((v: any) => v.severity === 'critical' || v.severity === 'high');
  const datacenterRacks = [
    {
      id: 'A01',
      name: 'Rack A01',
      position: 'Row A - Position 1',
      powerDraw: 4.2,
      maxPower: 7.2,
      temperature: 23.5,
      devices: [
        { name: 'PDU-A01-01', type: 'PDU', status: 'operational', uPosition: '1U' },
        { name: 'SW-CORE-01', type: 'Core Switch', status: 'operational', uPosition: '2-3U' },
        { name: 'FW-PRIMARY', type: 'Firewall', status: 'operational', uPosition: '4-5U' },
        { name: 'SRV-WEB-01', type: 'Web Server', status: 'operational', uPosition: '6-7U' },
        { name: 'SRV-WEB-02', type: 'Web Server', status: 'operational', uPosition: '8-9U' },
        { name: 'SRV-APP-01', type: 'App Server', status: 'operational', uPosition: '10-11U' },
        { name: 'PDU-A01-02', type: 'PDU', status: 'operational', uPosition: '42U' },
      ],
    },
    {
      id: 'A02',
      name: 'Rack A02',
      position: 'Row A - Position 2',
      powerDraw: 5.8,
      maxPower: 7.2,
      temperature: 24.8,
      devices: [
        { name: 'PDU-A02-01', type: 'PDU', status: 'operational', uPosition: '1U' },
        { name: 'SW-DIST-01', type: 'Distribution Switch', status: 'operational', uPosition: '2-3U' },
        { name: 'FW-SECONDARY', type: 'Firewall', status: 'operational', uPosition: '4-5U' },
        { name: 'SRV-DB-01', type: 'Database Server', status: 'operational', uPosition: '6-9U' },
        { name: 'SRV-DB-02', type: 'Database Server', status: 'operational', uPosition: '10-13U' },
        { name: 'SRV-CACHE-01', type: 'Cache Server', status: 'operational', uPosition: '14-15U' },
        { name: 'PDU-A02-02', type: 'PDU', status: 'operational', uPosition: '42U' },
      ],
    },
    {
      id: 'B01',
      name: 'Rack B01',
      position: 'Row B - Position 1',
      powerDraw: 3.6,
      maxPower: 7.2,
      temperature: 22.1,
      devices: [
        { name: 'PDU-B01-01', type: 'PDU', status: 'operational', uPosition: '1U' },
        { name: 'SW-ACCESS-01', type: 'Access Switch', status: 'operational', uPosition: '2-3U' },
        { name: 'SRV-LOG-01', type: 'SIEM Server', status: 'operational', uPosition: '4-7U' },
        { name: 'SRV-MON-01', type: 'Monitor Server', status: 'operational', uPosition: '8-9U' },
        { name: 'SRV-BACKUP-01', type: 'Backup Server', status: 'operational', uPosition: '10-13U' },
        { name: 'STORAGE-SAN-01', type: 'Storage Array', status: 'operational', uPosition: '14-17U' },
        { name: 'PDU-B01-02', type: 'PDU', status: 'operational', uPosition: '42U' },
      ],
    },
    {
      id: 'B02',
      name: 'Rack B02',
      position: 'Row B - Position 2',
      powerDraw: 2.1,
      maxPower: 7.2,
      temperature: 21.8,
      devices: [
        { name: 'PDU-B02-01', type: 'PDU', status: 'operational', uPosition: '1U' },
        { name: 'SW-ACCESS-02', type: 'Access Switch', status: 'operational', uPosition: '2-3U' },
        { name: 'SRV-VPN-01', type: 'VPN Gateway', status: 'operational', uPosition: '4-5U' },
        { name: 'SRV-DNS-01', type: 'DNS Server', status: 'operational', uPosition: '6-7U' },
        { name: 'SRV-DHCP-01', type: 'DHCP Server', status: 'operational', uPosition: '8-9U' },
        { name: 'UPS-MODULE-01', type: 'UPS', status: 'operational', uPosition: '10-15U' },
        { name: 'PDU-B02-02', type: 'PDU', status: 'operational', uPosition: '42U' },
      ],
    },
  ];

  const infrastructure = {
    power: {
      main: { status: 'operational', load: 87, voltage: 480 },
      backup: { status: 'standby', load: 0, runtime: 240 },
      ups: { status: 'online', charge: 100, load: 45 },
    },
    cooling: {
      crac1: { status: 'operational', temp: 18.5, flow: 95 },
      crac2: { status: 'operational', temp: 18.2, flow: 93 },
      crac3: { status: 'standby', temp: 20.0, flow: 0 },
    },
    environmental: {
      ambientTemp: 22.3,
      humidity: 45,
      airflow: 'optimal',
    },
  };

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 rounded-xl border border-slate-700 p-6">
        <h3 className="text-white font-semibold text-lg mb-4 flex items-center space-x-2">
          <Server className="w-6 h-6 text-blue-500" />
          <span>Primary Data Center - Building A</span>
        </h3>
        <p className="text-slate-400 text-sm mb-6">123 Enterprise Blvd, San Jose, CA 95134</p>

        <div className="bg-slate-900/70 rounded-lg p-6 border border-slate-700 mb-6">
          <h4 className="text-white font-semibold mb-4 text-sm">Floor Plan - 2D Layout</h4>
          <div className="relative bg-slate-950 rounded-lg p-8 border-2 border-slate-800" style={{ height: '400px' }}>
            <div className="absolute top-4 left-4 text-slate-500 text-xs font-mono">North ↑</div>

            <div className="absolute top-4 right-4 bg-slate-800/80 rounded px-3 py-2 text-xs">
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-1">
                  <div className="w-3 h-3 bg-blue-500 rounded"></div>
                  <span className="text-slate-400">Server Racks</span>
                </div>
                <div className="flex items-center space-x-1">
                  <div className="w-3 h-3 bg-cyan-500 rounded"></div>
                  <span className="text-slate-400">CRAC</span>
                </div>
                <div className="flex items-center space-x-1">
                  <div className="w-3 h-3 bg-orange-500 rounded"></div>
                  <span className="text-slate-400">Power</span>
                </div>
              </div>
            </div>

            <svg className="w-full h-full" viewBox="0 0 800 350" preserveAspectRatio="xMidYMid meet">
              <rect x="20" y="20" width="760" height="310" fill="none" stroke="#334155" strokeWidth="2" strokeDasharray="5,5" />
              <text x="30" y="15" fill="#64748b" fontSize="12">Perimeter Wall</text>

              <rect x="40" y="40" width="140" height="40" fill="#1e40af" fillOpacity="0.3" stroke="#3b82f6" strokeWidth="2" rx="4" />
              <text x="110" y="55" fill="#93c5fd" fontSize="11" textAnchor="middle" fontWeight="bold">Row A</text>
              <rect x="50" y="60" width="25" height="15" fill="#1e40af" fillOpacity="0.6" stroke="#3b82f6" strokeWidth="1" rx="2" />
              <text x="62.5" y="70" fill="#dbeafe" fontSize="8" textAnchor="middle">A01</text>
              <rect x="80" y="60" width="25" height="15" fill="#1e40af" fillOpacity="0.6" stroke="#3b82f6" strokeWidth="1" rx="2" />
              <text x="92.5" y="70" fill="#dbeafe" fontSize="8" textAnchor="middle">A02</text>
              <rect x="110" y="60" width="25" height="15" fill="#1e40af" fillOpacity="0.4" stroke="#3b82f6" strokeWidth="1" rx="2" />
              <text x="122.5" y="70" fill="#dbeafe" fontSize="8" textAnchor="middle">A03</text>
              <rect x="140" y="60" width="25" height="15" fill="#1e40af" fillOpacity="0.4" stroke="#3b82f6" strokeWidth="1" rx="2" />
              <text x="152.5" y="70" fill="#dbeafe" fontSize="8" textAnchor="middle">A04</text>

              <rect x="40" y="100" width="140" height="40" fill="#1e40af" fillOpacity="0.3" stroke="#3b82f6" strokeWidth="2" rx="4" />
              <text x="110" y="115" fill="#93c5fd" fontSize="11" textAnchor="middle" fontWeight="bold">Row B</text>
              <rect x="50" y="120" width="25" height="15" fill="#1e40af" fillOpacity="0.6" stroke="#3b82f6" strokeWidth="1" rx="2" />
              <text x="62.5" y="130" fill="#dbeafe" fontSize="8" textAnchor="middle">B01</text>
              <rect x="80" y="120" width="25" height="15" fill="#1e40af" fillOpacity="0.6" stroke="#3b82f6" strokeWidth="1" rx="2" />
              <text x="92.5" y="130" fill="#dbeafe" fontSize="8" textAnchor="middle">B02</text>
              <rect x="110" y="120" width="25" height="15" fill="#1e40af" fillOpacity="0.4" stroke="#3b82f6" strokeWidth="1" rx="2" />
              <text x="122.5" y="130" fill="#dbeafe" fontSize="8" textAnchor="middle">B03</text>
              <rect x="140" y="120" width="25" height="15" fill="#1e40af" fillOpacity="0.4" stroke="#3b82f6" strokeWidth="1" rx="2" />
              <text x="152.5" y="130" fill="#dbeafe" fontSize="8" textAnchor="middle">B04</text>

              <rect x="40" y="160" width="140" height="40" fill="#1e40af" fillOpacity="0.3" stroke="#3b82f6" strokeWidth="2" rx="4" />
              <text x="110" y="175" fill="#93c5fd" fontSize="11" textAnchor="middle" fontWeight="bold">Row C</text>
              <rect x="50" y="180" width="25" height="15" fill="#1e40af" fillOpacity="0.4" stroke="#3b82f6" strokeWidth="1" rx="2" />
              <text x="62.5" y="190" fill="#dbeafe" fontSize="8" textAnchor="middle">C01</text>
              <rect x="80" y="180" width="25" height="15" fill="#1e40af" fillOpacity="0.4" stroke="#3b82f6" strokeWidth="1" rx="2" />
              <text x="92.5" y="190" fill="#dbeafe" fontSize="8" textAnchor="middle">C02</text>
              <rect x="110" y="180" width="25" height="15" fill="#1e40af" fillOpacity="0.4" stroke="#3b82f6" strokeWidth="1" rx="2" />
              <text x="122.5" y="190" fill="#dbeafe" fontSize="8" textAnchor="middle">C03</text>
              <rect x="140" y="180" width="25" height="15" fill="#1e40af" fillOpacity="0.4" stroke="#3b82f6" strokeWidth="1" rx="2" />
              <text x="152.5" y="190" fill="#dbeafe" fontSize="8" textAnchor="middle">C04</text>

              <rect x="40" y="220" width="140" height="40" fill="#1e40af" fillOpacity="0.3" stroke="#3b82f6" strokeWidth="2" rx="4" />
              <text x="110" y="235" fill="#93c5fd" fontSize="11" textAnchor="middle" fontWeight="bold">Row D</text>
              <rect x="50" y="240" width="25" height="15" fill="#1e40af" fillOpacity="0.4" stroke="#3b82f6" strokeWidth="1" rx="2" />
              <text x="62.5" y="250" fill="#dbeafe" fontSize="8" textAnchor="middle">D01</text>
              <rect x="80" y="240" width="25" height="15" fill="#1e40af" fillOpacity="0.4" stroke="#3b82f6" strokeWidth="1" rx="2" />
              <text x="92.5" y="250" fill="#dbeafe" fontSize="8" textAnchor="middle">D02</text>
              <rect x="110" y="240" width="25" height="15" fill="#1e40af" fillOpacity="0.4" stroke="#3b82f6" strokeWidth="1" rx="2" />
              <text x="122.5" y="250" fill="#dbeafe" fontSize="8" textAnchor="middle">D03</text>
              <rect x="140" y="240" width="25" height="15" fill="#1e40af" fillOpacity="0.4" stroke="#3b82f6" strokeWidth="1" rx="2" />
              <text x="152.5" y="250" fill="#dbeafe" fontSize="8" textAnchor="middle">D04</text>

              <rect x="220" y="40" width="60" height="50" fill="#0e7490" fillOpacity="0.3" stroke="#06b6d4" strokeWidth="2" rx="4" />
              <text x="250" y="60" fill="#67e8f9" fontSize="10" textAnchor="middle" fontWeight="bold">CRAC-1</text>
              <text x="250" y="75" fill="#a5f3fc" fontSize="8" textAnchor="middle">Active</text>

              <rect x="220" y="110" width="60" height="50" fill="#0e7490" fillOpacity="0.3" stroke="#06b6d4" strokeWidth="2" rx="4" />
              <text x="250" y="130" fill="#67e8f9" fontSize="10" textAnchor="middle" fontWeight="bold">CRAC-2</text>
              <text x="250" y="145" fill="#a5f3fc" fontSize="8" textAnchor="middle">Active</text>

              <rect x="220" y="180" width="60" height="50" fill="#0e7490" fillOpacity="0.2" stroke="#06b6d4" strokeWidth="2" strokeDasharray="3,3" rx="4" />
              <text x="250" y="200" fill="#67e8f9" fontSize="10" textAnchor="middle" fontWeight="bold">CRAC-3</text>
              <text x="250" y="215" fill="#64748b" fontSize="8" textAnchor="middle">Standby</text>

              <rect x="320" y="40" width="70" height="80" fill="#c2410c" fillOpacity="0.3" stroke="#f97316" strokeWidth="2" rx="4" />
              <text x="355" y="60" fill="#fdba74" fontSize="10" textAnchor="middle" fontWeight="bold">Main PDU</text>
              <text x="355" y="75" fill="#fed7aa" fontSize="8" textAnchor="middle">480V</text>
              <text x="355" y="88" fill="#fed7aa" fontSize="8" textAnchor="middle">3-Phase</text>
              <text x="355" y="108" fill="#4ade80" fontSize="9" textAnchor="middle" fontWeight="bold">87% Load</text>

              <rect x="320" y="140" width="70" height="60" fill="#c2410c" fillOpacity="0.3" stroke="#f97316" strokeWidth="2" rx="4" />
              <text x="355" y="160" fill="#fdba74" fontSize="10" textAnchor="middle" fontWeight="bold">UPS Bank</text>
              <text x="355" y="175" fill="#fed7aa" fontSize="8" textAnchor="middle">100% Charge</text>
              <text x="355" y="190" fill="#4ade80" fontSize="9" textAnchor="middle" fontWeight="bold">Online</text>

              <rect x="320" y="220" width="70" height="60" fill="#c2410c" fillOpacity="0.2" stroke="#f97316" strokeWidth="2" strokeDasharray="3,3" rx="4" />
              <text x="355" y="240" fill="#fdba74" fontSize="10" textAnchor="middle" fontWeight="bold">Generator</text>
              <text x="355" y="255" fill="#fed7aa" fontSize="8" textAnchor="middle">2x 2MW</text>
              <text x="355" y="270" fill="#64748b" fontSize="9" textAnchor="middle" fontWeight="bold">Standby</text>

              <rect x="420" y="60" width="100" height="40" fill="#1e293b" fillOpacity="0.5" stroke="#64748b" strokeWidth="2" rx="4" />
              <text x="470" y="80" fill="#94a3b8" fontSize="10" textAnchor="middle">Network Operations</text>
              <text x="470" y="93" fill="#64748b" fontSize="8" textAnchor="middle">Center (NOC)</text>

              <rect x="420" y="120" width="100" height="40" fill="#1e293b" fillOpacity="0.5" stroke="#64748b" strokeWidth="2" rx="4" />
              <text x="470" y="140" fill="#94a3b8" fontSize="10" textAnchor="middle">Storage Area</text>
              <text x="470" y="153" fill="#64748b" fontSize="8" textAnchor="middle">Equipment</text>

              <rect x="550" y="60" width="210" height="200" fill="#374151" fillOpacity="0.2" stroke="#6b7280" strokeWidth="2" rx="4" />
              <text x="655" y="80" fill="#9ca3af" fontSize="11" textAnchor="middle" fontWeight="bold">Hot/Cold Aisle Configuration</text>

              <rect x="560" y="90" width="90" height="30" fill="#dc2626" fillOpacity="0.2" stroke="#ef4444" strokeWidth="1" rx="2" />
              <text x="605" y="108" fill="#fca5a5" fontSize="9" textAnchor="middle">Hot Aisle</text>

              <rect x="560" y="125" width="90" height="30" fill="#2563eb" fillOpacity="0.2" stroke="#3b82f6" strokeWidth="1" rx="2" />
              <text x="605" y="143" fill="#93c5fd" fontSize="9" textAnchor="middle">Cold Aisle</text>

              <rect x="560" y="160" width="90" height="30" fill="#dc2626" fillOpacity="0.2" stroke="#ef4444" strokeWidth="1" rx="2" />
              <text x="605" y="178" fill="#fca5a5" fontSize="9" textAnchor="middle">Hot Aisle</text>

              <rect x="560" y="195" width="90" height="30" fill="#2563eb" fillOpacity="0.2" stroke="#3b82f6" strokeWidth="1" rx="2" />
              <text x="605" y="213" fill="#93c5fd" fontSize="9" textAnchor="middle">Cold Aisle</text>

              <path d="M 655 100 L 670 100 L 670 115 L 655 115" fill="none" stroke="#06b6d4" strokeWidth="2" markerEnd="url(#arrowhead)" />
              <path d="M 655 135 L 670 135 L 670 150 L 655 150" fill="none" stroke="#06b6d4" strokeWidth="2" markerEnd="url(#arrowhead)" />

              <defs>
                <marker id="arrowhead" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto">
                  <polygon points="0 0, 10 3, 0 6" fill="#06b6d4" />
                </marker>
              </defs>

              <rect x="40" y="290" width="80" height="30" fill="#7c3aed" fillOpacity="0.2" stroke="#8b5cf6" strokeWidth="2" rx="4" />
              <text x="80" y="308" fill="#c4b5fd" fontSize="10" textAnchor="middle">Main Entrance</text>

              <rect x="650" y="290" width="110" height="30" fill="#dc2626" fillOpacity="0.2" stroke="#ef4444" strokeWidth="2" rx="4" />
              <text x="705" y="308" fill="#fca5a5" fontSize="10" textAnchor="middle">Emergency Exit</text>

              {cameras.map((camera: any) => {
                const pos = camera.position;
                return (
                  <g key={camera.camera_id}>
                    <circle
                      cx={pos.x}
                      cy={pos.y}
                      r={camera.coverage_radius}
                      fill="#06b6d4"
                      fillOpacity="0.05"
                      stroke="#06b6d4"
                      strokeWidth="1"
                      strokeDasharray="3,3"
                    />
                    <circle
                      cx={pos.x}
                      cy={pos.y}
                      r="6"
                      fill="#0e7490"
                      stroke="#06b6d4"
                      strokeWidth="2"
                    />
                    <text
                      x={pos.x}
                      y={pos.y - 12}
                      fill="#67e8f9"
                      fontSize="7"
                      textAnchor="middle"
                      fontWeight="bold"
                    >
                      {camera.camera_id}
                    </text>
                  </g>
                );
              })}

              {personnel.map((person: any) => {
                const pos = person.position;
                const isUnknown = person.badge_type === 'unknown';
                const isVisitor = person.badge_type === 'visitor';
                const color = isUnknown ? '#ef4444' : isVisitor ? '#f59e0b' : '#10b981';
                const pulseColor = isUnknown ? '#dc2626' : isVisitor ? '#d97706' : '#059669';

                return (
                  <g key={person.person_id}>
                    <circle
                      cx={pos.x}
                      cy={pos.y}
                      r="12"
                      fill={pulseColor}
                      fillOpacity="0.2"
                      className="animate-pulse"
                    />
                    <circle
                      cx={pos.x}
                      cy={pos.y}
                      r="5"
                      fill={color}
                      stroke="white"
                      strokeWidth="1.5"
                    />
                    <text
                      x={pos.x}
                      y={pos.y + 18}
                      fill={color}
                      fontSize="7"
                      textAnchor="middle"
                      fontWeight="bold"
                    >
                      {person.person_name.split(' ')[0]}
                    </text>
                  </g>
                );
              })}

              {securityEvents.map((event: any) => {
                const pos = event.position;
                const alertColor = event.severity === 'critical' ? '#dc2626' : event.severity === 'high' ? '#f59e0b' : '#f59e0b';

                return (
                  <g key={event.id}>
                    <circle
                      cx={pos.x}
                      cy={pos.y}
                      r="15"
                      fill={alertColor}
                      fillOpacity="0.15"
                      className="animate-pulse"
                    />
                    <polygon
                      points={`${pos.x},${pos.y - 8} ${pos.x - 7},${pos.y + 8} ${pos.x + 7},${pos.y + 8}`}
                      fill={alertColor}
                      stroke="white"
                      strokeWidth="1.5"
                    />
                    <text
                      x={pos.x}
                      y={pos.y + 2}
                      fill="white"
                      fontSize="10"
                      textAnchor="middle"
                      fontWeight="bold"
                    >
                      !
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
          <div className="mt-4 grid grid-cols-2 md:grid-cols-6 gap-3 text-xs">
            <div className="flex items-center space-x-2">
              <div className="w-4 h-4 bg-blue-500 rounded"></div>
              <span className="text-slate-400">Server Racks</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-4 h-4 bg-cyan-500 rounded"></div>
              <span className="text-slate-400">CCTV Cameras</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 bg-green-500 rounded-full"></div>
              <span className="text-slate-400">Authorized</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 bg-orange-500 rounded-full"></div>
              <span className="text-slate-400">Visitor</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 bg-red-500 rounded-full"></div>
              <span className="text-slate-400">Unauthorized</span>
            </div>
            <div className="flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 text-red-500" />
              <span className="text-slate-400">Security Alert</span>
            </div>
          </div>
        </div>

        {securityEvents.length > 0 && (
          <div className="bg-red-900/20 backdrop-blur-lg rounded-xl border-2 border-red-500/50 p-6">
            <div className="flex items-center space-x-3 mb-4">
              <AlertTriangle className="w-6 h-6 text-red-500" />
              <div>
                <h4 className="text-white font-semibold text-lg">Active Security Threats</h4>
                <p className="text-red-400 text-sm">{securityEvents.length} active incident(s) requiring attention</p>
              </div>
            </div>
            <div className="space-y-3">
              {securityEvents.map((event: any) => (
                <div key={event.id} className="bg-slate-900/70 rounded-lg p-4 border-l-4 border-red-500">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-start space-x-3">
                      <div className={`px-3 py-1 rounded-full text-xs font-semibold ${
                        event.severity === 'critical'
                          ? 'bg-red-500/20 text-red-400'
                          : event.severity === 'high'
                          ? 'bg-orange-500/20 text-orange-400'
                          : 'bg-yellow-500/20 text-yellow-400'
                      }`}>
                        {event.severity.toUpperCase()}
                      </div>
                      <div>
                        <div className="text-white font-semibold">{event.event_type.replace(/_/g, ' ').toUpperCase()}</div>
                        <div className="text-slate-400 text-sm mt-1">{event.description}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-slate-400 text-xs">
                        {new Date(event.created_at).toLocaleTimeString()}
                      </div>
                      {event.physical_zones && (
                        <div className="text-cyan-400 text-xs mt-1">
                          {event.physical_zones.zone_name}
                        </div>
                      )}
                    </div>
                  </div>
                  {event.person_id && (
                    <div className="mt-3 pt-3 border-t border-slate-700">
                      <div className="text-slate-400 text-xs">
                        <span className="text-slate-500">Person ID:</span> <span className="text-orange-400 font-mono">{event.person_id}</span>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="bg-slate-900/50 backdrop-blur-lg rounded-xl border border-slate-700 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-3">
              <User className="w-6 h-6 text-blue-500" />
              <div>
                <h4 className="text-white font-semibold text-lg">Live Personnel Tracking</h4>
                <p className="text-slate-400 text-sm">{personnel.length} person(s) detected in facility</p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Camera className="w-5 h-5 text-cyan-500" />
              <span className="text-cyan-400 text-sm font-semibold">{cameras.length} cameras online</span>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {personnel.map((person: any) => {
              const isUnauthorized = person.badge_type === 'unknown';
              const isVisitor = person.badge_type === 'visitor';
              const borderColor = isUnauthorized ? 'border-red-500' : isVisitor ? 'border-orange-500' : 'border-green-500';
              const bgColor = isUnauthorized ? 'bg-red-500/10' : isVisitor ? 'bg-orange-500/10' : 'bg-green-500/10';
              const textColor = isUnauthorized ? 'text-red-400' : isVisitor ? 'text-orange-400' : 'text-green-400';

              return (
                <div key={person.person_id} className={`${bgColor} rounded-lg p-4 border-2 ${borderColor}`}>
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center space-x-2">
                      <User className={`w-5 h-5 ${textColor}`} />
                      <div>
                        <div className="text-white font-semibold">{person.person_name}</div>
                        <div className="text-slate-400 text-xs font-mono">{person.person_id}</div>
                      </div>
                    </div>
                    <div className={`px-2 py-1 rounded text-xs font-semibold ${
                      isUnauthorized ? 'bg-red-500/20 text-red-400' :
                      isVisitor ? 'bg-orange-500/20 text-orange-400' :
                      'bg-green-500/20 text-green-400'
                    }`}>
                      {person.badge_type.toUpperCase()}
                    </div>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Clearance:</span>
                      <span className={textColor}>{person.clearance_level}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Last Seen:</span>
                      <span className="text-slate-300">
                        {Math.floor((Date.now() - new Date(person.last_seen).getTime()) / 1000)}s ago
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Position:</span>
                      <span className="text-slate-300 font-mono text-xs">
                        ({person.position.x}, {person.position.y})
                      </span>
                    </div>
                  </div>
                  {isUnauthorized && (
                    <div className="mt-3 pt-3 border-t border-red-500/30">
                      <div className="flex items-center space-x-2 text-red-400 text-xs">
                        <AlertTriangle className="w-4 h-4" />
                        <span className="font-semibold">UNAUTHORIZED ACCESS</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-green-500/10 rounded-lg p-4 border border-green-500/30">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center space-x-2">
                <Power className="w-5 h-5 text-green-400" />
                <span className="text-green-400 font-semibold text-sm">Main Power</span>
              </div>
            </div>
            <div className="text-2xl font-bold text-green-400">{infrastructure.power.main.load}%</div>
            <div className="text-slate-400 text-xs mt-1">{infrastructure.power.main.voltage}V / 3-Phase</div>
          </div>

          <div className="bg-blue-500/10 rounded-lg p-4 border border-blue-500/30">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center space-x-2">
                <Zap className="w-5 h-5 text-blue-400" />
                <span className="text-blue-400 font-semibold text-sm">UPS System</span>
              </div>
            </div>
            <div className="text-2xl font-bold text-blue-400">{infrastructure.power.ups.charge}%</div>
            <div className="text-slate-400 text-xs mt-1">Load: {infrastructure.power.ups.load}% / Online</div>
          </div>

          <div className="bg-cyan-500/10 rounded-lg p-4 border border-cyan-500/30">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center space-x-2">
                <Wind className="w-5 h-5 text-cyan-400" />
                <span className="text-cyan-400 font-semibold text-sm">CRAC Units</span>
              </div>
            </div>
            <div className="text-2xl font-bold text-cyan-400">2/3</div>
            <div className="text-slate-400 text-xs mt-1">Active / Optimal Airflow</div>
          </div>

          <div className="bg-orange-500/10 rounded-lg p-4 border border-orange-500/30">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center space-x-2">
                <Thermometer className="w-5 h-5 text-orange-400" />
                <span className="text-orange-400 font-semibold text-sm">Temperature</span>
              </div>
            </div>
            <div className="text-2xl font-bold text-orange-400">{infrastructure.environmental.ambientTemp}°C</div>
            <div className="text-slate-400 text-xs mt-1">Humidity: {infrastructure.environmental.humidity}%</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {datacenterRacks.map((rack) => {
          const powerPercent = (rack.powerDraw / rack.maxPower) * 100;
          const powerColor = powerPercent > 80 ? 'text-red-400' : powerPercent > 60 ? 'text-orange-400' : 'text-green-400';
          const tempColor = rack.temperature > 25 ? 'text-red-400' : rack.temperature > 23 ? 'text-orange-400' : 'text-green-400';

          return (
            <div key={rack.id} className="bg-slate-800/50 rounded-xl border border-slate-700 p-5 hover:border-slate-600 transition-all">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h4 className="text-white font-semibold text-lg">{rack.name}</h4>
                  <p className="text-slate-400 text-xs">{rack.position}</p>
                </div>
                <div className="text-right">
                  <div className={`text-sm font-semibold ${powerColor}`}>
                    {rack.powerDraw}kW / {rack.maxPower}kW
                  </div>
                  <div className={`text-xs ${tempColor}`}>
                    {rack.temperature}°C
                  </div>
                </div>
              </div>

              <div className="bg-slate-900/70 rounded-lg p-3 mb-3">
                <div className="flex items-center space-x-2 mb-2">
                  <Server className="w-4 h-4 text-blue-400" />
                  <span className="text-white font-semibold text-sm">Equipment ({rack.devices.length} devices)</span>
                </div>
                <div className="space-y-1.5 max-h-64 overflow-y-auto">
                  {rack.devices.map((device, idx) => (
                    <div key={idx} className="flex items-center justify-between bg-slate-800/50 rounded px-3 py-2 border border-slate-700">
                      <div className="flex items-center space-x-2">
                        <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                        <span className="text-slate-200 text-xs font-medium">{device.name}</span>
                      </div>
                      <div className="flex items-center space-x-3">
                        <span className="text-slate-400 text-xs">{device.type}</span>
                        <span className="text-slate-500 text-xs font-mono">{device.uPosition}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="bg-slate-900/50 rounded px-2 py-1.5 border border-slate-700">
                  <div className="text-slate-400 text-xs">U Space</div>
                  <div className="text-white text-sm font-semibold">{rack.devices.length}/42U</div>
                </div>
                <div className="bg-slate-900/50 rounded px-2 py-1.5 border border-slate-700">
                  <div className="text-slate-400 text-xs">Power %</div>
                  <div className={`text-sm font-semibold ${powerColor}`}>{powerPercent.toFixed(0)}%</div>
                </div>
                <div className="bg-slate-900/50 rounded px-2 py-1.5 border border-slate-700">
                  <div className="text-slate-400 text-xs">Status</div>
                  <div className="text-green-400 text-sm font-semibold">Online</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-6">
        <h4 className="text-white font-semibold mb-4">Environmental Control Systems</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Object.entries(infrastructure.cooling).map(([key, crac]: [string, any]) => (
            <div key={key} className="bg-slate-900/50 rounded-lg p-4 border border-slate-700">
              <div className="flex items-center justify-between mb-3">
                <span className="text-slate-300 font-semibold text-sm uppercase">{key}</span>
                <span className={`px-2 py-1 rounded text-xs font-semibold ${
                  crac.status === 'operational' ? 'bg-green-500/20 text-green-400' : 'bg-slate-700 text-slate-400'
                }`}>
                  {crac.status}
                </span>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-400">Supply Temp:</span>
                  <span className="text-cyan-400 font-semibold">{crac.temp}°C</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Airflow:</span>
                  <span className="text-cyan-400 font-semibold">{crac.flow}%</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-gradient-to-br from-slate-800/50 to-slate-900/50 rounded-xl border border-slate-700 p-6">
        <h4 className="text-white font-semibold mb-4">Facility Information</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <div className="text-slate-400 mb-1">Tier Rating</div>
            <div className="text-white font-semibold">Tier III</div>
          </div>
          <div>
            <div className="text-slate-400 mb-1">Total Racks</div>
            <div className="text-white font-semibold">48 Racks</div>
          </div>
          <div>
            <div className="text-slate-400 mb-1">Raised Floor</div>
            <div className="text-white font-semibold">24 inches</div>
          </div>
          <div>
            <div className="text-slate-400 mb-1">Fire Suppression</div>
            <div className="text-white font-semibold">FM-200</div>
          </div>
          <div>
            <div className="text-slate-400 mb-1">Security Level</div>
            <div className="text-white font-semibold">ISO 27001</div>
          </div>
          <div>
            <div className="text-slate-400 mb-1">Backup Generator</div>
            <div className="text-white font-semibold">2x 2MW</div>
          </div>
          <div>
            <div className="text-slate-400 mb-1">Fuel Reserve</div>
            <div className="text-white font-semibold">72 hours</div>
          </div>
          <div>
            <div className="text-slate-400 mb-1">Uptime SLA</div>
            <div className="text-white font-semibold">99.982%</div>
          </div>
        </div>
      </div>

      {/* Physical Security Vulnerabilities */}
      {physicalVulns && physicalVulns.length > 0 && (
        <div className="bg-gradient-to-br from-red-900/20 to-slate-900 rounded-xl border-2 border-red-600/50 p-6 mt-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-3">
              <div className="p-3 rounded-xl bg-red-500/20 border border-red-500/30">
                <AlertTriangle className="w-6 h-6 text-red-400" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-white">Physical Security Vulnerabilities</h3>
                <p className="text-red-300 text-sm">{physicalVulns.length} issues detected | {criticalPhysicalVulns.length} critical/high priority</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {physicalVulns.map((vuln: any) => (
              <div key={vuln.id} className={`bg-slate-900/50 rounded-lg p-5 border-2 ${
                vuln.severity === 'critical' ? 'border-red-500/50' :
                vuln.severity === 'high' ? 'border-orange-500/50' :
                vuln.severity === 'medium' ? 'border-yellow-500/50' :
                'border-blue-500/50'
              }`}>
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center space-x-2">
                    {vuln.vulnerability_type === 'environmental' && <Thermometer className="w-5 h-5 text-cyan-400" />}
                    {vuln.vulnerability_type === 'power_failure' && <Power className="w-5 h-5 text-orange-400" />}
                    {vuln.vulnerability_type === 'access_control_breach' && <Shield className="w-5 h-5 text-red-400" />}
                    {vuln.vulnerability_type === 'surveillance_gap' && <Camera className="w-5 h-5 text-yellow-400" />}
                    {vuln.vulnerability_type === 'fire_hazard' && <AlertTriangle className="w-5 h-5 text-red-400" />}
                    {vuln.vulnerability_type === 'physical_tampering' && <AlertTriangle className="w-5 h-5 text-purple-400" />}
                    {vuln.vulnerability_type === 'equipment_failure' && <Server className="w-5 h-5 text-orange-400" />}
                    {vuln.vulnerability_type === 'cooling_failure' && <Wind className="w-5 h-5 text-cyan-400" />}
                    {vuln.vulnerability_type === 'unauthorized_access' && <User className="w-5 h-5 text-red-400" />}
                    <span className={`px-2 py-1 rounded text-xs font-bold ${
                      vuln.severity === 'critical' ? 'bg-red-500/20 text-red-400 border border-red-500/30' :
                      vuln.severity === 'high' ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30' :
                      vuln.severity === 'medium' ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' :
                      'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                    }`}>
                      {vuln.severity.toUpperCase()}
                    </span>
                  </div>
                  <span className={`px-2 py-1 rounded text-xs font-semibold ${
                    vuln.status === 'resolved' ? 'bg-green-500/20 text-green-400' :
                    vuln.status === 'in_progress' ? 'bg-yellow-500/20 text-yellow-400' :
                    'bg-red-500/20 text-red-400'
                  }`}>
                    {vuln.status.replace('_', ' ')}
                  </span>
                </div>

                <h4 className="text-white font-semibold mb-2">{vuln.title}</h4>
                <p className="text-slate-300 text-sm mb-3">{vuln.description}</p>

                <div className="mb-3">
                  <div className="text-slate-400 text-xs mb-1">Location:</div>
                  <div className="text-white text-sm font-semibold">{vuln.location}</div>
                </div>

                {vuln.affected_systems && vuln.affected_systems.length > 0 && (
                  <div className="mb-3">
                    <div className="text-slate-400 text-xs mb-1">Affected Systems:</div>
                    <div className="flex flex-wrap gap-1">
                      {vuln.affected_systems.map((system: string, idx: number) => (
                        <span key={idx} className="px-2 py-0.5 bg-slate-700 text-slate-300 rounded text-xs">
                          {system}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="pt-3 border-t border-slate-700">
                  <div className="text-slate-400 text-xs mb-1">Remediation:</div>
                  <p className="text-slate-300 text-sm">{vuln.remediation}</p>
                </div>

                <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                  <span>Discovered: {new Date(vuln.discovered_at).toLocaleDateString()}</span>
                  {vuln.resolved_at && (
                    <span className="text-green-400">Resolved: {new Date(vuln.resolved_at).toLocaleDateString()}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const AssetCard = ({ asset, getAssetIcon, getCriticalityColor, vulnerabilities }: any) => {
  const [showVulns, setShowVulns] = useState(false);
  const vulns = vulnerabilities || [];
  const criticalVulns = vulns.filter((v: any) => v.severity === 'critical').length;
  const highVulns = vulns.filter((v: any) => v.severity === 'high').length;

  console.log('AssetCard for', asset.asset_name, 'has', vulns.length, 'vulnerabilities', vulns);

  return (
    <div className={`bg-slate-900/50 rounded-lg p-4 border-2 ${getCriticalityColor(asset.criticality)} relative`}>
      {vulns.length > 0 && (
        <div className="absolute top-2 right-2">
          <div className="flex items-center space-x-1 bg-red-500/20 border border-red-500/50 rounded px-2 py-1">
            <AlertTriangle className="w-3 h-3 text-red-400" />
            <span className="text-red-400 text-xs font-bold">{vulns.length}</span>
          </div>
        </div>
      )}
      <div className="flex items-start space-x-3">
        <div className={`p-2 rounded ${getCriticalityColor(asset.criticality)}`}>
          {getAssetIcon(asset.asset_type)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-white font-semibold text-sm truncate">{asset.asset_name}</div>
          <div className="text-slate-400 text-xs mb-2">{asset.ip_address}</div>
          <div className="flex flex-wrap gap-1 mb-2">
            {asset.exposed_ports && asset.exposed_ports.slice(0, 3).map((port: number, idx: number) => (
              <span key={idx} className="px-1.5 py-0.5 bg-slate-700 text-slate-300 rounded text-xs">
                :{port}
              </span>
            ))}
          </div>

          {vulns.length > 0 && (
            <div className="mt-2">
              <button
                onClick={() => setShowVulns(!showVulns)}
                className="flex items-center space-x-2 text-xs hover:bg-slate-800 px-2 py-1 rounded transition-colors w-full"
              >
                <AlertTriangle className="w-3 h-3 text-red-400" />
                <span className="text-red-400 font-semibold">{vulns.length} Vulnerabilities</span>
                {criticalVulns > 0 && (
                  <span className="ml-auto px-1.5 py-0.5 bg-red-500/20 text-red-400 rounded text-xs border border-red-500/30">
                    {criticalVulns} Critical
                  </span>
                )}
              </button>

              {showVulns && (
                <div className="mt-2 space-y-2 pl-2 border-l-2 border-red-500/30">
                  {vulns.map((vuln: any) => (
                    <div key={vuln.id} className="bg-slate-800/50 rounded p-2 border border-slate-700">
                      <div className="flex items-start justify-between mb-1">
                        <span className="text-xs font-mono text-blue-400">{vuln.cve_id}</span>
                        <span className={`px-1.5 py-0.5 rounded text-xs ${
                          vuln.severity === 'critical' ? 'bg-red-500/20 text-red-400 border border-red-500/30' :
                          vuln.severity === 'high' ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30' :
                          vuln.severity === 'medium' ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' :
                          'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                        }`}>
                          {vuln.severity.toUpperCase()}
                        </span>
                      </div>
                      <p className="text-xs text-white mb-1">{vuln.title}</p>
                      <p className="text-xs text-slate-400 mb-1">{vuln.description}</p>
                      <div className="flex items-center space-x-2 text-xs">
                        <span className="text-slate-500">CVSS: {vuln.cvss_score}</span>
                        <span className={`px-1.5 py-0.5 rounded ${
                          vuln.status === 'patched' ? 'bg-green-500/20 text-green-400' :
                          vuln.status === 'in_progress' ? 'bg-yellow-500/20 text-yellow-400' :
                          'bg-red-500/20 text-red-400'
                        }`}>
                          {vuln.status.replace('_', ' ')}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// ASSET MANAGER - Dynamic CRUD + Document Import
// ═══════════════════════════════════════════════════════════════

const AssetManager = ({ assets, zones, cameras, personnel, onRefresh }: any) => {
  const [tab, setTab] = useState<'import' | 'add' | 'inventory'>('inventory');
  const [importMode, setImportMode] = useState<'document' | 'json' | 'csv'>('document');
  const [importCategory, setImportCategory] = useState('network');
  const [importText, setImportText] = useState('');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<any>(null);
  const [addForm, setAddForm] = useState<Record<string, string>>({});
  const [addCategory, setAddCategory] = useState('network');
  const [saving, setSaving] = useState(false);

  const handleImport = async () => {
    if (!importText.trim()) return;
    setImporting(true);
    setImportResult(null);
    try {
      let items: any[] = [];
      let sourceType = importMode;

      if (importMode === 'json') {
        items = JSON.parse(importText);
        if (!Array.isArray(items)) items = [items];
        sourceType = 'json';
      } else if (importMode === 'csv') {
        const lines = importText.trim().split('\n');
        const headers = lines[0].split(',').map(h => h.trim());
        items = lines.slice(1).map(line => {
          const values = line.split(',').map(v => v.trim());
          const obj: any = {};
          headers.forEach((h, i) => { obj[h] = values[i] || ''; });
          return obj;
        });
        sourceType = 'json';
      }

      const { data, error } = await callFunction('import-assets', {
        source_type: sourceType,
        asset_category: importCategory,
        items: sourceType !== 'document' ? items : [],
        source_text: importMode === 'document' ? importText : '',
        source_label: `${importMode}_import_${new Date().toISOString().split('T')[0]}`,
      });

      if (error) {
        setImportResult({ success: false, error: String(error) });
      } else {
        setImportResult(data);
        if ((data as any)?.success) {
          onRefresh();
        }
      }
    } catch (e: any) {
      setImportResult({ success: false, error: e.message });
    } finally {
      setImporting(false);
    }
  };

  const handleManualAdd = async () => {
    setSaving(true);
    try {
      const { data, error } = await callFunction('import-assets', {
        source_type: 'json',
        asset_category: addCategory,
        items: [addForm],
        source_label: 'manual_add',
      });
      if (!error && (data as any)?.success) {
        setAddForm({});
        onRefresh();
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (table: string, id: string) => {
    await supabase.from(table).update({ is_active: false }).eq('id', id);
    onRefresh();
  };

  const categoryFields: Record<string, string[]> = {
    network: ['hostname', 'ip_address', 'mac_address', 'asset_type', 'os', 'criticality', 'zone', 'location', 'owner', 'department'],
    physical_zone: ['zone_name', 'zone_type', 'security_level', 'floor', 'building', 'max_occupancy'],
    camera: ['camera_id', 'camera_name', 'zone_name', 'camera_type', 'resolution', 'ip_address'],
    personnel: ['person_name', 'clearance_level', 'badge_type', 'department', 'title'],
    rack: ['rack_id', 'rack_name', 'row_label', 'total_units', 'power_capacity_kw'],
    segment: ['segment_name', 'segment_type', 'vlan_id', 'cidr', 'gateway', 'zone', 'security_level'],
  };

  return (
    <div className="space-y-6">
      {/* Sub-tabs */}
      <div className="flex items-center space-x-3 border-b border-slate-700 pb-3">
        {[
          { key: 'inventory', label: 'Current Inventory', icon: Server },
          { key: 'import', label: 'Import from Document', icon: Upload },
          { key: 'add', label: 'Add Manually', icon: Plus },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key as any)}
            className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-colors ${
              tab === t.key ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/40' : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <t.icon className="w-4 h-4" />
            <span className="text-sm font-medium">{t.label}</span>
          </button>
        ))}
      </div>

      {/* INVENTORY TAB */}
      {tab === 'inventory' && (
        <div className="space-y-4">
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-blue-400">{assets.length}</div>
              <div className="text-slate-400 text-xs mt-1">Network Assets</div>
            </div>
            <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-emerald-400">{zones.length}</div>
              <div className="text-slate-400 text-xs mt-1">Physical Zones</div>
            </div>
            <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-cyan-400">{cameras.length}</div>
              <div className="text-slate-400 text-xs mt-1">CCTV Cameras</div>
            </div>
            <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-amber-400">{personnel.length}</div>
              <div className="text-slate-400 text-xs mt-1">Personnel Tracked</div>
            </div>
          </div>

          <div className="bg-slate-900/50 border border-slate-700 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-800/80">
                <tr className="text-slate-300">
                  <th className="px-4 py-3 text-left font-medium">Asset</th>
                  <th className="px-4 py-3 text-left font-medium">Type</th>
                  <th className="px-4 py-3 text-left font-medium">IP</th>
                  <th className="px-4 py-3 text-left font-medium">Zone</th>
                  <th className="px-4 py-3 text-left font-medium">Criticality</th>
                  <th className="px-4 py-3 text-left font-medium">Source</th>
                  <th className="px-4 py-3 text-left font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {assets.slice(0, 30).map((asset: any) => (
                  <tr key={asset.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="px-4 py-3 text-white font-medium">{asset.hostname || asset.asset_name || '-'}</td>
                    <td className="px-4 py-3 text-slate-300">{asset.asset_type || '-'}</td>
                    <td className="px-4 py-3 text-slate-400 font-mono text-xs">{asset.ip_address || '-'}</td>
                    <td className="px-4 py-3 text-slate-300">{asset.zone || asset.location || '-'}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        asset.criticality === 'critical' || asset.criticality === 'very_high' ? 'bg-red-500/20 text-red-400' :
                        asset.criticality === 'high' ? 'bg-orange-500/20 text-orange-400' :
                        asset.criticality === 'medium' ? 'bg-yellow-500/20 text-yellow-400' :
                        'bg-blue-500/20 text-blue-400'
                      }`}>{asset.criticality || 'medium'}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{asset.imported_from || 'seed'}</td>
                    <td className="px-4 py-3">
                      <button onClick={() => handleDelete('asset_registry', asset.id)} className="text-red-400/60 hover:text-red-400 transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
                {assets.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-12 text-center text-slate-500">No assets yet. Import from a document or add manually.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* IMPORT TAB */}
      {tab === 'import' && (
        <div className="space-y-4">
          <div className="bg-slate-900/50 border border-slate-700 rounded-xl p-6">
            <h3 className="text-white font-semibold mb-4 flex items-center space-x-2">
              <FileText className="w-5 h-5 text-emerald-400" />
              <span>Import Assets from Document</span>
            </h3>
            <p className="text-slate-400 text-sm mb-4">
              Paste a CMDB export, network diagram description, Excel/CSV data, or any infrastructure document.
              The AI will extract and structure asset information automatically.
            </p>

            <div className="flex items-center space-x-3 mb-4">
              <label className="text-slate-300 text-sm">Format:</label>
              {(['document', 'json', 'csv'] as const).map(m => (
                <button key={m} onClick={() => setImportMode(m)}
                  className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                    importMode === m ? 'bg-emerald-600/30 text-emerald-400 border border-emerald-500/50' : 'bg-slate-800 text-slate-400 hover:text-white'
                  }`}>{m.toUpperCase()}</button>
              ))}
              <div className="w-px h-6 bg-slate-700" />
              <label className="text-slate-300 text-sm">Category:</label>
              <select value={importCategory} onChange={e => setImportCategory(e.target.value)}
                className="bg-slate-800 border border-slate-700 text-white text-sm rounded px-3 py-1.5">
                <option value="network">Network Devices</option>
                <option value="physical_zone">Physical Zones</option>
                <option value="camera">CCTV Cameras</option>
                <option value="personnel">Personnel</option>
                <option value="rack">Datacenter Racks</option>
                <option value="segment">Network Segments</option>
              </select>
            </div>

            <textarea
              value={importText}
              onChange={e => setImportText(e.target.value)}
              placeholder={importMode === 'document'
                ? "Paste your infrastructure document here...\n\nExample:\nOur datacenter has 4 racks in Row A.\n- Rack A01: Core switch (10.0.1.1), 2x web servers (10.0.1.10, 10.0.1.11)\n- Rack A02: Database cluster (10.0.2.1-3), running PostgreSQL on Ubuntu 22.04\n- Firewall: Palo Alto PA-5250 at 10.0.0.1 (DMZ facing)\n..."
                : importMode === 'csv'
                ? "hostname,ip_address,asset_type,os,criticality,zone\nweb-prod-01,10.0.1.10,server,Ubuntu 22.04,high,Production\ndb-master,10.0.2.1,database,PostgreSQL 15,critical,Internal\n..."
                : '[{"hostname": "web-prod-01", "ip_address": "10.0.1.10", "asset_type": "server", "os": "Ubuntu 22.04", "criticality": "high", "zone": "Production"}]'}
              className="w-full h-48 bg-slate-950 border border-slate-700 rounded-lg p-4 text-white text-sm font-mono placeholder:text-slate-600 focus:border-emerald-500/50 focus:outline-none resize-none"
            />

            <div className="flex items-center justify-between mt-4">
              <div className="text-slate-500 text-xs">
                {importMode === 'document' && 'AI will extract structured assets from freeform text'}
                {importMode === 'json' && 'Provide a JSON array of asset objects'}
                {importMode === 'csv' && 'First row must be headers'}
              </div>
              <button onClick={handleImport} disabled={importing || !importText.trim()}
                className="flex items-center space-x-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-lg font-medium text-sm transition-colors">
                {importing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                <span>{importing ? 'Importing...' : 'Import Assets'}</span>
              </button>
            </div>

            {importResult && (
              <div className={`mt-4 p-4 rounded-lg border ${importResult.success ? 'bg-emerald-900/20 border-emerald-500/40' : 'bg-red-900/20 border-red-500/40'}`}>
                {importResult.success ? (
                  <div className="flex items-center space-x-2">
                    <Check className="w-5 h-5 text-emerald-400" />
                    <span className="text-emerald-300 font-medium">
                      Successfully imported {importResult.imported} of {importResult.total_submitted} assets
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center space-x-2">
                    <X className="w-5 h-5 text-red-400" />
                    <span className="text-red-300">{importResult.error || 'Import failed'}</span>
                  </div>
                )}
                {importResult.errors?.length > 0 && (
                  <div className="mt-2 text-xs text-red-400">
                    {importResult.errors.map((e: any, i: number) => <div key={i}>{e.item}: {e.error}</div>)}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ADD MANUALLY TAB */}
      {tab === 'add' && (
        <div className="bg-slate-900/50 border border-slate-700 rounded-xl p-6">
          <h3 className="text-white font-semibold mb-4 flex items-center space-x-2">
            <Plus className="w-5 h-5 text-blue-400" />
            <span>Add Asset Manually</span>
          </h3>

          <div className="flex items-center space-x-3 mb-6">
            <label className="text-slate-300 text-sm">Asset Type:</label>
            <select value={addCategory} onChange={e => { setAddCategory(e.target.value); setAddForm({}); }}
              className="bg-slate-800 border border-slate-700 text-white text-sm rounded px-3 py-2">
              <option value="network">Network Device</option>
              <option value="physical_zone">Physical Zone</option>
              <option value="camera">CCTV Camera</option>
              <option value="personnel">Personnel</option>
              <option value="rack">Datacenter Rack</option>
              <option value="segment">Network Segment</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {(categoryFields[addCategory] || []).map(field => (
              <div key={field}>
                <label className="text-slate-400 text-xs font-medium block mb-1">{field.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</label>
                <input
                  type="text"
                  value={addForm[field] || ''}
                  onChange={e => setAddForm(prev => ({ ...prev, [field]: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-white text-sm focus:border-blue-500/50 focus:outline-none"
                  placeholder={field === 'criticality' ? 'critical/high/medium/low' : field === 'zone' ? 'External/DMZ/Production/Internal/Office' : ''}
                />
              </div>
            ))}
          </div>

          <div className="flex justify-end mt-6">
            <button onClick={handleManualAdd} disabled={saving}
              className="flex items-center space-x-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white rounded-lg font-medium text-sm transition-colors">
              {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              <span>{saving ? 'Saving...' : 'Add Asset'}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default NetworkTopology;
