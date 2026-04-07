import { useState } from 'react';
import { Network, Activity, Wifi, WifiOff, MapPin, HardDrive, ArrowUpDown, Clock, Zap, Shield } from 'lucide-react';

const MOCK_TAP_DEVICES = [
  { id: 'tap1', name: 'DC-East Core TAP', location: 'Data Center East - Core Switch', interface_a: 'eth0/1 (10GbE)', interface_b: 'eth0/2 (10GbE)', mode: 'full-duplex', status: 'capturing', packets_captured: 847293847, bytes_captured: 1284729384728, uptime_hours: 2184, protocols_detected: 47, avg_throughput_gbps: 6.8, peak_throughput_gbps: 9.2 },
  { id: 'tap2', name: 'DMZ Perimeter TAP', location: 'DMZ - Firewall Segment A', interface_a: 'ge-0/0/1 (1GbE)', interface_b: 'ge-0/0/2 (1GbE)', mode: 'full-duplex', status: 'capturing', packets_captured: 293847293, bytes_captured: 384729384728, uptime_hours: 2184, protocols_detected: 31, avg_throughput_gbps: 0.8, peak_throughput_gbps: 0.95 },
  { id: 'tap3', name: 'SPAN Port Mirror - Floor 3', location: 'Office Building - Floor 3 IDF', interface_a: 'Fa0/24 (SPAN)', interface_b: 'Monitor Port', mode: 'rx-only', status: 'capturing', packets_captured: 129384729, bytes_captured: 98472938472, uptime_hours: 720, protocols_detected: 22, avg_throughput_gbps: 0.3, peak_throughput_gbps: 0.6 },
  { id: 'tap4', name: 'Cloud Gateway TAP', location: 'Virtual - AWS VPC Flow Mirror', interface_a: 'eni-0a1b2c3d4e', interface_b: 'eni-mirror-target', mode: 'full-duplex', status: 'capturing', packets_captured: 582937482, bytes_captured: 729384729384, uptime_hours: 1440, protocols_detected: 38, avg_throughput_gbps: 3.2, peak_throughput_gbps: 7.8 },
  { id: 'tap5', name: 'ICS/SCADA TAP', location: 'Plant Floor - PLC Network Segment', interface_a: 'Serial-0/1 (Modbus)', interface_b: 'eth1 (Mirror)', mode: 'passive', status: 'capturing', packets_captured: 48293847, bytes_captured: 12847293847, uptime_hours: 4380, protocols_detected: 8, avg_throughput_gbps: 0.05, peak_throughput_gbps: 0.1 },
  { id: 'tap6', name: 'Wireless Controller TAP', location: 'Building A - Wireless Controller', interface_a: 'wlan-monitor', interface_b: 'eth2 (Mirror)', mode: 'rx-only', status: 'degraded', packets_captured: 38472938, bytes_captured: 8472938472, uptime_hours: 168, protocols_detected: 15, avg_throughput_gbps: 0.4, peak_throughput_gbps: 0.7 },
];

const PROTOCOL_DISTRIBUTION = [
  { protocol: 'TLS 1.3', percentage: 34.2, packets: 289472938, color: 'bg-emerald-500' },
  { protocol: 'HTTPS', percentage: 28.7, packets: 242938472, color: 'bg-blue-500' },
  { protocol: 'DNS', percentage: 12.1, packets: 102384729, color: 'bg-cyan-500' },
  { protocol: 'SSH', percentage: 8.3, packets: 70129384, color: 'bg-amber-500' },
  { protocol: 'SMB/CIFS', percentage: 5.9, packets: 49847293, color: 'bg-orange-500' },
  { protocol: 'LDAP/Kerberos', percentage: 4.2, packets: 35472938, color: 'bg-teal-500' },
  { protocol: 'SNMP', percentage: 2.8, packets: 23647293, color: 'bg-slate-500' },
  { protocol: 'Modbus/ICS', percentage: 1.6, packets: 13529384, color: 'bg-red-500' },
  { protocol: 'Other', percentage: 2.2, packets: 18584729, color: 'bg-slate-600' },
];

const RECENT_CAPTURES = [
  { time: '14:32:18.847', src: '10.0.1.45', dst: '172.16.0.12', protocol: 'TLS 1.3', size: 1420, flags: 'PSH,ACK', tap: 'DC-East Core TAP', alert: false },
  { time: '14:32:18.849', src: '192.168.3.22', dst: '8.8.8.8', protocol: 'DNS', size: 72, flags: 'Q', tap: 'DMZ Perimeter TAP', alert: false },
  { time: '14:32:18.851', src: '10.100.0.5', dst: '10.100.0.254', protocol: 'Modbus', size: 256, flags: 'WRITE', tap: 'ICS/SCADA TAP', alert: true },
  { time: '14:32:18.853', src: '172.16.5.100', dst: '172.16.0.1', protocol: 'Kerberos', size: 890, flags: 'AS-REQ', tap: 'SPAN Port Mirror', alert: false },
  { time: '14:32:18.856', src: '10.0.2.78', dst: '52.94.237.11', protocol: 'HTTPS', size: 1380, flags: 'PSH,ACK', tap: 'Cloud Gateway TAP', alert: false },
  { time: '14:32:18.858', src: '192.168.1.55', dst: '192.168.1.1', protocol: 'SSH', size: 564, flags: 'PSH,ACK', tap: 'SPAN Port Mirror', alert: true },
  { time: '14:32:18.861', src: '10.0.1.12', dst: '10.0.1.200', protocol: 'SMB', size: 4096, flags: 'WRITE', tap: 'DC-East Core TAP', alert: false },
  { time: '14:32:18.864', src: '172.16.100.3', dst: '172.16.100.254', protocol: 'SNMP', size: 148, flags: 'GET', tap: 'ICS/SCADA TAP', alert: false },
];

function formatBytes(bytes: number): string {
  if (bytes >= 1e12) return (bytes / 1e12).toFixed(1) + ' TB';
  if (bytes >= 1e9) return (bytes / 1e9).toFixed(1) + ' GB';
  if (bytes >= 1e6) return (bytes / 1e6).toFixed(1) + ' MB';
  return (bytes / 1e3).toFixed(1) + ' KB';
}

function formatNumber(n: number): string {
  if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return n.toString();
}

export default function NetworkTapsTab() {
  const [selectedTap, setSelectedTap] = useState(MOCK_TAP_DEVICES[0]);

  const totalPackets = MOCK_TAP_DEVICES.reduce((s, t) => s + t.packets_captured, 0);
  const totalBytes = MOCK_TAP_DEVICES.reduce((s, t) => s + t.bytes_captured, 0);
  const avgThroughput = MOCK_TAP_DEVICES.reduce((s, t) => s + t.avg_throughput_gbps, 0);

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-slate-800 to-slate-700 rounded-xl p-6 text-white">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xl font-bold flex items-center gap-2">
              <Network className="w-7 h-7 text-cyan-400" />
              Network TAP Infrastructure
            </h3>
            <p className="text-slate-300 mt-1 text-sm">Passive full-duplex traffic capture across all network segments</p>
          </div>
          <div className="flex gap-8">
            <div className="text-center">
              <div className="text-2xl font-bold text-cyan-400">{MOCK_TAP_DEVICES.length}</div>
              <div className="text-xs text-slate-400">Active TAPs</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-emerald-400">{formatNumber(totalPackets)}</div>
              <div className="text-xs text-slate-400">Packets Captured</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-amber-400">{formatBytes(totalBytes)}</div>
              <div className="text-xs text-slate-400">Data Captured</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-400">{avgThroughput.toFixed(1)} Gbps</div>
              <div className="text-xs text-slate-400">Aggregate Throughput</div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {MOCK_TAP_DEVICES.map((tap) => (
          <button
            key={tap.id}
            onClick={() => setSelectedTap(tap)}
            className={`text-left p-4 rounded-xl border-2 transition-all ${
              selectedTap.id === tap.id
                ? 'border-cyan-500 bg-cyan-50 shadow-lg'
                : 'border-slate-200 bg-white hover:border-cyan-300'
            }`}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                {tap.status === 'capturing' ? (
                  <Wifi className="w-4 h-4 text-emerald-500" />
                ) : (
                  <WifiOff className="w-4 h-4 text-amber-500" />
                )}
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  tap.status === 'capturing' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                }`}>{tap.status}</span>
              </div>
              <span className="text-xs text-slate-500">{tap.mode}</span>
            </div>
            <div className="text-sm font-semibold text-slate-900 mb-1">{tap.name}</div>
            <div className="flex items-center gap-1 text-xs text-slate-500 mb-3">
              <MapPin className="w-3 h-3" />
              {tap.location}
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-slate-50 rounded-lg p-2">
                <div className="text-slate-500">Packets</div>
                <div className="font-bold text-slate-900">{formatNumber(tap.packets_captured)}</div>
              </div>
              <div className="bg-slate-50 rounded-lg p-2">
                <div className="text-slate-500">Throughput</div>
                <div className="font-bold text-cyan-600">{tap.avg_throughput_gbps} Gbps</div>
              </div>
            </div>
            <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
              <HardDrive className="w-3 h-3" />
              {tap.interface_a}
              <ArrowUpDown className="w-3 h-3" />
              {tap.interface_b}
            </div>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-5">
          <h4 className="font-bold text-slate-900 mb-4 flex items-center gap-2">
            <Activity className="w-5 h-5 text-cyan-600" />
            Protocol Distribution
          </h4>
          <div className="space-y-3">
            {PROTOCOL_DISTRIBUTION.map((p) => (
              <div key={p.protocol} className="flex items-center gap-3">
                <div className="w-24 text-xs font-medium text-slate-700">{p.protocol}</div>
                <div className="flex-1 bg-slate-100 rounded-full h-5 overflow-hidden">
                  <div className={`h-full ${p.color} rounded-full transition-all flex items-center justify-end pr-2`} style={{ width: `${Math.max(p.percentage * 2.5, 8)}%` }}>
                    <span className="text-[10px] font-bold text-white">{p.percentage}%</span>
                  </div>
                </div>
                <div className="w-16 text-xs text-slate-500 text-right">{formatNumber(p.packets)}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-5">
          <h4 className="font-bold text-slate-900 mb-4 flex items-center gap-2">
            <Zap className="w-5 h-5 text-amber-600" />
            TAP Device Details: {selectedTap.name}
          </h4>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Total Packets', value: formatNumber(selectedTap.packets_captured), icon: Activity },
              { label: 'Data Captured', value: formatBytes(selectedTap.bytes_captured), icon: HardDrive },
              { label: 'Avg Throughput', value: `${selectedTap.avg_throughput_gbps} Gbps`, icon: ArrowUpDown },
              { label: 'Peak Throughput', value: `${selectedTap.peak_throughput_gbps} Gbps`, icon: Zap },
              { label: 'Protocols Detected', value: selectedTap.protocols_detected.toString(), icon: Network },
              { label: 'Uptime', value: `${(selectedTap.uptime_hours / 24).toFixed(0)} days`, icon: Clock },
            ].map(({ label, value, icon: Icon }) => (
              <div key={label} className="bg-slate-50 rounded-lg p-3 flex items-center gap-3">
                <Icon className="w-4 h-4 text-slate-400 flex-shrink-0" />
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
                  <div className="text-sm font-bold text-slate-900">{value}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 p-3 bg-cyan-50 border border-cyan-200 rounded-lg">
            <div className="flex items-center gap-2 text-xs font-medium text-cyan-700 mb-1">
              <Shield className="w-3 h-3" /> Capture Mode
            </div>
            <div className="text-xs text-cyan-600">
              {selectedTap.mode === 'full-duplex' ? 'Full-duplex passive capture - zero packet loss guaranteed' :
               selectedTap.mode === 'rx-only' ? 'Receive-only mirror port - monitoring inbound traffic' :
               'Passive non-intrusive monitoring - no network impact'}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-lg border border-slate-200">
        <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <h4 className="font-bold text-slate-900 flex items-center gap-2">
            <Activity className="w-5 h-5 text-emerald-600" />
            Live Packet Capture Stream
          </h4>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs text-emerald-600 font-medium">Live</span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase">Time</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase">Source</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase">Destination</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase">Protocol</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase">Size</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase">Flags</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase">TAP Source</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {RECENT_CAPTURES.map((cap, i) => (
                <tr key={i} className={`hover:bg-slate-50 ${cap.alert ? 'bg-red-50' : ''}`}>
                  <td className="px-4 py-2.5 text-xs font-mono text-slate-600">{cap.time}</td>
                  <td className="px-4 py-2.5 text-xs font-mono text-blue-600">{cap.src}</td>
                  <td className="px-4 py-2.5 text-xs font-mono text-slate-900">{cap.dst}</td>
                  <td className="px-4 py-2.5">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-cyan-100 text-cyan-700 font-medium">{cap.protocol}</span>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-slate-600">{cap.size}B</td>
                  <td className="px-4 py-2.5 text-xs font-mono text-slate-500">{cap.flags}</td>
                  <td className="px-4 py-2.5 text-xs text-slate-500">{cap.tap}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
