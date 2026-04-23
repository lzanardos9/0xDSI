import { useState, useEffect } from 'react';
import {
  Heart, Activity, AlertTriangle, Shield, FileText, Users, Lock,
  Wifi, Server, Eye, Clock, Zap, MapPin, Database
} from 'lucide-react';

interface MedicalDeviceThreat {
  id: string;
  device: string;
  manufacturer: string;
  type: string;
  location: string;
  severity: 'critical' | 'high' | 'medium';
  cve: string;
  description: string;
  patientRisk: string;
  status: 'active' | 'mitigated' | 'patching';
  fdaClass: string;
}

interface PHIBreachEvent {
  id: string;
  type: string;
  records: number;
  dataTypes: string[];
  source: string;
  destination: string;
  severity: 'critical' | 'high' | 'medium';
  hipaaViolation: string;
  timestamp: string;
  status: 'blocked' | 'investigating' | 'reported';
}

interface RansomwareTarget {
  id: string;
  system: string;
  department: string;
  encryption: string;
  filesAffected: number;
  ransom: string;
  strain: string;
  entryVector: string;
  patientImpact: string;
  status: 'contained' | 'active' | 'recovered';
}

const MED_DEVICE_THREATS: MedicalDeviceThreat[] = [
  { id: 'md-001', device: 'Medtronic MiniMed 780G', manufacturer: 'Medtronic', type: 'Insulin Pump', location: 'ICU Floor 3', severity: 'critical', cve: 'CVE-2026-41562', description: 'BLE command injection allows remote insulin bolus modification. Attacker can alter basal rate without user interaction via crafted GATT write.', patientRisk: 'Life-threatening - hypoglycemia risk', status: 'active', fdaClass: 'Class III' },
  { id: 'md-002', device: 'Philips IntelliVue MX800', manufacturer: 'Philips', type: 'Patient Monitor', location: 'OR Suite 2', severity: 'critical', cve: 'CVE-2026-38901', description: 'DICOM injection via unencrypted HL7v2 ADT feed allows falsification of vital signs display. Heart rate and SpO2 values can be spoofed.', patientRisk: 'Critical - false vitals lead to delayed intervention', status: 'mitigated', fdaClass: 'Class II' },
  { id: 'md-003', device: 'BD Alaris Infusion System', manufacturer: 'BD', type: 'IV Pump', location: 'Peds Ward B', severity: 'high', cve: 'CVE-2026-44287', description: 'Drug library bypass via network exploit allows unauthorized dose rate modification. FHIR integration endpoint exposed without TLS mutual auth.', patientRisk: 'High - incorrect medication dosing', status: 'patching', fdaClass: 'Class II' },
  { id: 'md-004', device: 'Siemens MAGNETOM Vida', manufacturer: 'Siemens Healthineers', type: 'MRI Scanner', location: 'Radiology Dept', severity: 'high', cve: 'CVE-2026-35678', description: 'Windows Embedded OS unpatched - EternalBlue variant allows RCE. DICOM store containing 34,000 patient scans accessible via SMB.', patientRisk: 'Data exposure - PHI in imaging data', status: 'patching', fdaClass: 'Class II' },
  { id: 'md-005', device: 'Abbott Gallant ICD', manufacturer: 'Abbott', type: 'Implantable Defibrillator', location: 'Cardiology', severity: 'critical', cve: 'CVE-2026-47123', description: 'RF telemetry protocol weakness allows unauthorized therapy modification within 10m range. Shock parameters can be altered.', patientRisk: 'Life-threatening - cardiac device manipulation', status: 'investigating', fdaClass: 'Class III' },
];

const PHI_BREACHES: PHIBreachEvent[] = [
  { id: 'phi-001', type: 'Unauthorized EHR Access', records: 12_847, dataTypes: ['SSN', 'DOB', 'Diagnosis', 'Medications'], source: 'Registration Terminal T-42', destination: 'ext:185.234.xx.xx (Tor)', severity: 'critical', hipaaViolation: '164.312(a)(1) - Access Control', timestamp: '3m ago', status: 'investigating' },
  { id: 'phi-002', type: 'DICOM Data Exfiltration', records: 34_521, dataTypes: ['Patient Images', 'Study Reports', 'Physician Notes'], source: 'PACS Server pacs-01', destination: 'ftp://anon-share.xyz', severity: 'critical', hipaaViolation: '164.312(e)(1) - Transmission Security', timestamp: '12m ago', status: 'blocked' },
  { id: 'phi-003', type: 'Prescription Fraud', records: 89, dataTypes: ['DEA Number', 'Prescriptions', 'Controlled Substances'], source: 'CPOE Module', destination: 'Unknown pharmacy API', severity: 'high', hipaaViolation: '164.312(d) - Authentication', timestamp: '28m ago', status: 'reported' },
  { id: 'phi-004', type: 'Genetic Data Theft', records: 4_230, dataTypes: ['Genomic Sequences', 'Genetic Risk Scores', 'Family History'], source: 'Genetics Lab LIMS', destination: 'cloud-sync-proxy', severity: 'critical', hipaaViolation: '164.502(a) - GINA Genetic Information', timestamp: '1h ago', status: 'investigating' },
  { id: 'phi-005', type: 'Mental Health Records Leak', records: 1_847, dataTypes: ['Therapy Notes', 'Psychiatric Evaluations', 'Substance Abuse'], source: 'Behavioral Health EHR', destination: 'Personal cloud storage', severity: 'high', hipaaViolation: '164.508 - 42 CFR Part 2 Substance Abuse', timestamp: '2h ago', status: 'blocked' },
];

const RANSOM_TARGETS: RansomwareTarget[] = [
  { id: 'rw-001', system: 'Epic Hyperspace (Production)', department: 'Enterprise EHR', encryption: 'AES-256 + RSA-4096', filesAffected: 2_340_000, ransom: '$4.5M BTC', strain: 'BlackCat/ALPHV v4', entryVector: 'Citrix NetScaler CVE-2026-XXXX', patientImpact: 'Hospital on diversion - 340 beds affected', status: 'contained' },
  { id: 'rw-002', system: 'Laboratory Information System', department: 'Pathology', encryption: 'ChaCha20-Poly1305', filesAffected: 890_000, ransom: '$1.2M Monero', strain: 'LockBit 4.0', entryVector: 'Phishing -> lateral movement', patientImpact: 'Lab results delayed 72+ hrs', status: 'active' },
  { id: 'rw-003', system: 'Pharmacy Dispensing System', department: 'Inpatient Pharmacy', encryption: 'AES-128-CTR', filesAffected: 156_000, ransom: '$800K BTC', strain: 'Royal Ransomware', entryVector: 'Compromised vendor VPN', patientImpact: 'Manual medication dispensing required', status: 'recovered' },
];

export default function HealthcareThreats() {
  const [tab, setTab] = useState<'devices' | 'phi' | 'ransomware' | 'compliance'>('devices');
  const [pulsePhase, setPulsePhase] = useState(0);

  useEffect(() => {
    const iv = setInterval(() => setPulsePhase(p => p + 1), 1500);
    return () => clearInterval(iv);
  }, []);

  const TABS = [
    { id: 'devices' as const, label: 'Medical Devices', icon: Heart },
    { id: 'phi' as const, label: 'PHI/HIPAA Breaches', icon: FileText },
    { id: 'ransomware' as const, label: 'Ransomware Threats', icon: Lock },
    { id: 'compliance' as const, label: 'FDA / HIPAA Status', icon: Shield },
  ];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-red-500/20 to-rose-500/20 border border-red-500/30 flex items-center justify-center">
            <Heart size={20} className="text-red-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Healthcare & Life Sciences Threats</h2>
            <p className="text-xs text-slate-500">Medical device security, PHI protection, FDA compliance monitoring</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-500/10 border border-red-500/30">
            <Heart size={12} className="text-red-400 animate-pulse" />
            <span className="text-[10px] font-bold font-mono text-red-400 tracking-wider">PATIENT SAFETY</span>
          </span>
          <span className="px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-[10px] font-mono font-bold text-cyan-400 tracking-wider">0xDSI HEALTH</span>
        </div>
      </div>

      {/* Critical Stats */}
      <div className="grid grid-cols-5 gap-3">
        {[
          { l: 'Vulnerable Devices', v: '247', c: 'text-red-400', bg: 'from-red-500/5 to-red-500/0' },
          { l: 'PHI Records at Risk', v: '53,534', c: 'text-orange-400', bg: 'from-orange-500/5 to-orange-500/0' },
          { l: 'Active Incidents', v: '3', c: 'text-amber-400', bg: 'from-amber-500/5 to-amber-500/0' },
          { l: 'HIPAA Violations', v: '12', c: 'text-red-400', bg: 'from-red-500/5 to-red-500/0' },
          { l: 'FDA Alerts', v: '8', c: 'text-cyan-400', bg: 'from-cyan-500/5 to-cyan-500/0' },
        ].map((s, i) => (
          <div key={i} className={`bg-gradient-to-b ${s.bg} border border-[#1e293b] rounded-xl p-3 text-center`}>
            <div className="text-[10px] text-slate-500">{s.l}</div>
            <div className={`text-2xl font-bold ${s.c}`}>{s.v}</div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-1 border-b border-[#1e293b]">
        {TABS.map(t => {
          const Icon = t.icon;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium transition-all border-b-2 ${tab === t.id ? 'text-red-300 border-red-400 bg-red-500/5' : 'text-slate-500 border-transparent hover:text-slate-300'}`}>
              <Icon size={14} />{t.label}
            </button>
          );
        })}
      </div>

      {tab === 'devices' && (
        <div className="space-y-3">
          {MED_DEVICE_THREATS.map(d => (
            <div key={d.id} className={`bg-[#0b0f1e] border rounded-xl p-4 ${d.severity === 'critical' ? 'border-red-500/30' : 'border-[#1e293b]'}`}>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <Heart size={14} className="text-red-400" />
                    <span className="text-sm font-bold text-white">{d.device}</span>
                    <span className="text-[10px] text-slate-500">{d.manufacturer}</span>
                    <span className="px-2 py-0.5 text-[10px] rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">{d.fdaClass}</span>
                    <span className={`px-2 py-0.5 text-[10px] rounded-full border ${d.severity === 'critical' ? 'bg-red-500/10 text-red-400 border-red-500/30' : 'bg-orange-500/10 text-orange-400 border-orange-500/30'}`}>{d.severity}</span>
                  </div>
                  <div className="text-xs text-slate-500 mb-1">{d.type} -- {d.location}</div>
                  <p className="text-xs text-slate-400 leading-relaxed">{d.description}</p>
                  <div className="mt-2 flex items-center gap-3 text-[10px]">
                    <span className="text-red-400 font-semibold">{d.patientRisk}</span>
                    <span className="text-cyan-400 font-mono">{d.cve}</span>
                    <span className={`px-2 py-0.5 rounded border ${d.status === 'active' ? 'bg-red-500/10 text-red-400 border-red-500/20' : d.status === 'mitigated' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border-amber-500/20'}`}>{d.status}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'phi' && (
        <div className="space-y-3">
          {PHI_BREACHES.map(b => (
            <div key={b.id} className="bg-[#0b0f1e] border border-[#1e293b] rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <FileText size={14} className="text-amber-400" />
                  <span className="text-sm font-bold text-white">{b.type}</span>
                  <span className={`px-2 py-0.5 text-[10px] rounded-full border ${b.severity === 'critical' ? 'bg-red-500/10 text-red-400 border-red-500/30' : 'bg-orange-500/10 text-orange-400 border-orange-500/30'}`}>{b.severity}</span>
                </div>
                <span className={`px-2 py-0.5 text-[10px] rounded border ${b.status === 'blocked' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : b.status === 'reported' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' : 'bg-amber-500/10 text-amber-400 border-amber-500/20'}`}>{b.status}</span>
              </div>
              <div className="grid grid-cols-2 gap-3 text-[11px] mb-2">
                <div><span className="text-slate-500">Records:</span> <span className="text-red-400 font-bold">{b.records.toLocaleString()}</span></div>
                <div><span className="text-slate-500">HIPAA:</span> <span className="text-amber-400">{b.hipaaViolation}</span></div>
                <div><span className="text-slate-500">Source:</span> <span className="text-slate-300">{b.source}</span></div>
                <div><span className="text-slate-500">Dest:</span> <span className="text-red-400 font-mono">{b.destination}</span></div>
              </div>
              <div className="flex flex-wrap gap-1">
                {b.dataTypes.map(dt => (
                  <span key={dt} className="px-2 py-0.5 text-[10px] rounded bg-red-500/10 text-red-400 border border-red-500/20">{dt}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'ransomware' && (
        <div className="space-y-4">
          {RANSOM_TARGETS.map(r => (
            <div key={r.id} className={`bg-[#0b0f1e] border rounded-xl p-5 ${r.status === 'active' ? 'border-red-500/40' : 'border-[#1e293b]'}`}>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h4 className="text-sm font-bold text-white">{r.system}</h4>
                  <span className="text-[10px] text-slate-500">{r.department}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-lg font-bold text-red-400">{r.ransom}</span>
                  <span className={`px-2 py-0.5 text-[10px] rounded-full border ${r.status === 'active' ? 'bg-red-500/10 text-red-400 border-red-500/30' : r.status === 'contained' ? 'bg-amber-500/10 text-amber-400 border-amber-500/30' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'}`}>{r.status}</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-[11px]">
                <div><span className="text-slate-500">Strain:</span> <span className="text-red-400 font-mono">{r.strain}</span></div>
                <div><span className="text-slate-500">Encryption:</span> <span className="text-slate-300">{r.encryption}</span></div>
                <div><span className="text-slate-500">Entry Vector:</span> <span className="text-amber-400">{r.entryVector}</span></div>
                <div><span className="text-slate-500">Files:</span> <span className="text-slate-300">{r.filesAffected.toLocaleString()}</span></div>
              </div>
              <div className="mt-3 px-3 py-2 bg-red-500/5 border border-red-500/20 rounded-lg">
                <span className="text-[10px] text-red-400 font-semibold">PATIENT IMPACT: </span>
                <span className="text-[10px] text-red-300">{r.patientImpact}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'compliance' && (
        <div className="grid grid-cols-2 gap-4">
          {[
            { framework: 'HIPAA Security Rule', score: 78, findings: 23, critical: 4, color: 'text-amber-400', sections: ['Access Control', 'Audit Controls', 'Integrity', 'Transmission Security', 'Authentication'] },
            { framework: 'FDA Pre-Market Cyber', score: 65, findings: 34, critical: 8, color: 'text-red-400', sections: ['SBOM Compliance', 'Threat Modeling', 'Vulnerability Mgmt', 'Patch Policy', 'Incident Response'] },
            { framework: 'HITRUST CSF v11', score: 84, findings: 15, critical: 2, color: 'text-emerald-400', sections: ['Information Protection', 'Endpoint Protection', 'Network Protection', 'Portable Media', 'Data Protection'] },
            { framework: '42 CFR Part 2', score: 71, findings: 18, critical: 5, color: 'text-cyan-400', sections: ['Consent Management', 'Segmented Access', 'Substance Abuse Records', 'Re-Disclosure', 'Breach Notice'] },
          ].map((f, i) => (
            <div key={i} className="bg-[#0b0f1e] border border-[#1e293b] rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-bold text-white">{f.framework}</h4>
                <div className={`text-2xl font-bold ${f.color}`}>{f.score}%</div>
              </div>
              <div className="h-2 bg-slate-800 rounded-full overflow-hidden mb-3">
                <div className={`h-full rounded-full ${f.score >= 80 ? 'bg-emerald-500' : f.score >= 70 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${f.score}%` }} />
              </div>
              <div className="flex items-center gap-4 text-[10px] text-slate-500 mb-3">
                <span>{f.findings} findings</span>
                <span className="text-red-400">{f.critical} critical</span>
              </div>
              <div className="space-y-1.5">
                {f.sections.map((s, j) => {
                  const val = f.score + (j * 7 - 15) % 20;
                  return (
                    <div key={j} className="flex items-center gap-2 text-[10px]">
                      <span className="w-32 text-slate-400 truncate">{s}</span>
                      <div className="flex-1 h-1 bg-slate-800 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${val >= 80 ? 'bg-emerald-500' : val >= 60 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${Math.min(100, Math.max(30, val))}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
