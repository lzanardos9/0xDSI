import { useState } from 'react';
import {
  Navigation, Radar, Anchor, ShieldCheck, Satellite, Cpu, Radio, Ticket,
  Globe, Boxes, Target, Skull, BookOpen, Plane,
} from 'lucide-react';
import AviationThreats from './AviationThreats';
import AirlineThreats from './AirlineThreats';

type TabId =
  | 'adsb' | 'atc' | 'maritime' | 'compliance'
  | 'live' | 'connected' | 'datalink' | 'enterprise'
  | 'webapi' | 'ground' | 'gnss' | 'incidents' | 'research';

const AVIATION_TABS: TabId[] = ['adsb', 'atc', 'maritime', 'compliance'];

const TAB_GROUPS: { group: string; tabs: { id: TabId; label: string; icon: typeof Plane }[] }[] = [
  {
    group: 'Airspace, Maritime & Compliance',
    tabs: [
      { id: 'adsb', label: 'ADS-B Threats', icon: Navigation },
      { id: 'atc', label: 'ATC Systems', icon: Radar },
      { id: 'maritime', label: 'Maritime VSAT', icon: Anchor },
      { id: 'compliance', label: 'AVSEC Compliance', icon: ShieldCheck },
    ],
  },
  {
    group: 'Airlines, Fleet & Live Sky',
    tabs: [
      { id: 'live', label: 'Live Sky', icon: Satellite },
      { id: 'connected', label: 'Connected Fleet', icon: Cpu },
      { id: 'datalink', label: 'ACARS / SATCOM', icon: Radio },
      { id: 'enterprise', label: 'Booking / Loyalty', icon: Ticket },
      { id: 'webapi', label: 'Web / Mobile / API', icon: Globe },
      { id: 'ground', label: 'Airport / Ground IoT', icon: Boxes },
      { id: 'gnss', label: 'GNSS / Nav Spoof', icon: Target },
      { id: 'incidents', label: 'Campaigns & Incidents', icon: Skull },
      { id: 'research', label: 'Research Library', icon: BookOpen },
    ],
  },
];

export default function AviationMaritimeThreats() {
  const [tab, setTab] = useState<TabId>('live');
  const isAviation = AVIATION_TABS.includes(tab);

  return (
    <div className="p-6 space-y-6">
      {/* Unified header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-sky-500/20 to-blue-500/20 border border-sky-500/30 flex items-center justify-center">
            <Plane size={20} className="text-sky-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Aviation &amp; Maritime Threat Intelligence</h2>
            <p className="text-xs text-slate-500">Live sky feed, connected fleet, ADS-B/ATC, maritime VSAT, booking, loyalty &amp; AVSEC compliance</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-500/10 border border-red-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
            <span className="text-[10px] font-bold font-mono text-red-400 tracking-wider">ELEVATED</span>
          </span>
          <span className="px-3 py-1 rounded-full bg-sky-500/10 border border-sky-500/20 text-[10px] font-mono font-bold text-sky-400 tracking-wider">
            0xDSI AVIATION
          </span>
        </div>
      </div>

      {/* Unified grouped tab bar */}
      <div className="flex items-stretch gap-4 border-b border-[#1e293b] overflow-x-auto">
        {TAB_GROUPS.map((g, gi) => (
          <div key={g.group} className={`flex flex-col ${gi > 0 ? 'pl-4 border-l border-[#1e293b]' : ''}`}>
            <span className="text-[9px] uppercase tracking-wider text-slate-600 font-semibold px-2 pt-1">{g.group}</span>
            <div className="flex items-center gap-1">
              {g.tabs.map((t) => {
                const Icon = t.icon;
                const active = tab === t.id;
                return (
                  <button key={t.id} onClick={() => setTab(t.id)}
                    className={`flex items-center gap-2 px-3 py-2 text-xs font-medium transition-all border-b-2 whitespace-nowrap ${active ? 'text-sky-300 border-sky-400 bg-sky-500/5' : 'text-slate-500 border-transparent hover:text-slate-300'}`}>
                    <Icon size={14} />{t.label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Delegated content */}
      {isAviation
        ? <AviationThreats embeddedTab={tab} />
        : <AirlineThreats embeddedTab={tab} />}
    </div>
  );
}
