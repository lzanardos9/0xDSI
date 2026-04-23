import React, { useState, useEffect } from "react";
import { FileText, BarChart3, PieChart, Table, Type, Minus, Plus, ChevronUp, ChevronDown, ChevronRight, Download, Send, Clock, Calendar, Mail, Eye, CreditCard as Edit3, Trash2, Settings, Save, Search, Filter, CheckCircle2, Printer, X } from "lucide-react";

const tabs = ["Templates", "Builder", "Preview", "Schedule", "History"] as const;
type Tab = (typeof tabs)[number];

const templates = [
  { name: "Weekly Executive Summary", desc: "High-level KPIs, trends, and top incidents for C-suite review.", pages: 4 },
  { name: "Monthly Compliance", desc: "Regulatory posture across NIST, SOC2, HIPAA, and PCI-DSS frameworks.", pages: 12 },
  { name: "Incident Response", desc: "Full IR timeline, containment actions, root cause, and lessons learned.", pages: 8 },
  { name: "Threat Landscape", desc: "Emerging threat actors, TTPs, and intelligence feed correlations.", pages: 6 },
  { name: "SOC Performance", desc: "MTTD, MTTR, analyst workload, alert-to-case ratios, and efficiency.", pages: 5 },
  { name: "Data Source Health", desc: "Ingestion rates, parser errors, latency, and coverage gaps.", pages: 7 },
  { name: "Risk Assessment Quarterly", desc: "Asset risk scoring, vulnerability trends, and remediation tracking.", pages: 10 },
  { name: "Board Security Brief", desc: "Business-aligned security posture for board-level presentation.", pages: 3 },
];

const widgetTypes = [
  { type: "KPI", icon: BarChart3, color: "#3B82F6" },
  { type: "Bar Chart", icon: BarChart3, color: "#10B981" },
  { type: "Pie Chart", icon: PieChart, color: "#8B5CF6" },
  { type: "Table", icon: Table, color: "#F59E0B" },
  { type: "Text", icon: Type, color: "#EC4899" },
  { type: "Header", icon: FileText, color: "#06B6D4" },
  { type: "Divider", icon: Minus, color: "#6B7280" },
];

const mockSchedules = [
  { id: 1, name: "Weekly Executive Summary", freq: "Weekly", day: "Monday", time: "08:00", format: "PDF", recipients: ["ciso@corp.com", "vp-eng@corp.com"], active: true },
  { id: 2, name: "Monthly Compliance", freq: "Monthly", day: "1st", time: "06:00", format: "PDF", recipients: ["compliance@corp.com"], active: true },
  { id: 3, name: "SOC Performance", freq: "Daily", day: "Every day", time: "07:00", format: "HTML", recipients: ["soc-leads@corp.com"], active: false },
  { id: 4, name: "Board Security Brief", freq: "Monthly", day: "15th", time: "09:00", format: "PDF", recipients: ["board@corp.com", "ciso@corp.com"], active: true },
];

const historyEntries = [
  { date: "2026-04-23 08:01", template: "Weekly Executive Summary", pages: 4, size: "2.1 MB", status: "delivered" },
  { date: "2026-04-23 07:00", template: "SOC Performance", pages: 5, size: "1.8 MB", status: "delivered" },
  { date: "2026-04-22 14:32", template: "Incident Response", pages: 8, size: "3.4 MB", status: "delivered" },
  { date: "2026-04-22 08:00", template: "Weekly Executive Summary", pages: 4, size: "2.0 MB", status: "generating" },
  { date: "2026-04-21 06:00", template: "Monthly Compliance", pages: 12, size: "5.6 MB", status: "delivered" },
  { date: "2026-04-20 09:15", template: "Threat Landscape", pages: 6, size: "2.9 MB", status: "failed" },
  { date: "2026-04-19 08:00", template: "Weekly Executive Summary", pages: 4, size: "2.1 MB", status: "delivered" },
  { date: "2026-04-18 07:00", template: "SOC Performance", pages: 5, size: "1.7 MB", status: "delivered" },
  { date: "2026-04-17 11:20", template: "Risk Assessment Quarterly", pages: 10, size: "4.8 MB", status: "delivered" },
  { date: "2026-04-16 08:00", template: "Board Security Brief", pages: 3, size: "1.2 MB", status: "delivered" },
];

const exportFormats = [
  { name: "PDF", icon: FileText, color: "#EF4444" },
  { name: "HTML", icon: FileText, color: "#3B82F6" },
  { name: "CSV", icon: Table, color: "#10B981" },
  { name: "Databricks", icon: BarChart3, color: "#FF6F00" },
  { name: "Slack", icon: Send, color: "#611F69" },
  { name: "Email", icon: Mail, color: "#06B6D4" },
];

type Section = { id: number; type: string; title: string; color: string };

export default function ReportBuilder() {
  const [activeTab, setActiveTab] = useState<Tab>("Templates");
  const [fade, setFade] = useState(true);
  const [generating, setGenerating] = useState<string | null>(null);
  const [genProgress, setGenProgress] = useState(0);
  const [hoveredTpl, setHoveredTpl] = useState<number | null>(null);

  // Builder state
  const [sections, setSections] = useState<Section[]>([
    { id: 1, type: "Header", title: "Executive Summary Header", color: "#06B6D4" },
    { id: 2, type: "KPI", title: "Key Metrics Overview", color: "#3B82F6" },
    { id: 3, type: "Bar Chart", title: "Alert Trend (7 Days)", color: "#10B981" },
  ]);
  const [reportTitle, setReportTitle] = useState("SOC Weekly Report");
  const [reportSubtitle, setReportSubtitle] = useState("April 17 - April 23, 2026");
  const [nextId, setNextId] = useState(4);
  const [editingSection, setEditingSection] = useState<number | null>(null);

  // Schedule state
  const [freq, setFreq] = useState("Weekly");
  const [day, setDay] = useState("Monday");
  const [time, setTime] = useState("08:00");
  const [format, setFormat] = useState("PDF");
  const [recipients, setRecipients] = useState(["ciso@corp.com"]);
  const [newEmail, setNewEmail] = useState("");

  const switchTab = (t: Tab) => {
    setFade(false);
    setTimeout(() => { setActiveTab(t); setFade(true); }, 150);
  };

  const handleGenerate = (name: string) => {
    setGenerating(name);
    setGenProgress(0);
  };

  useEffect(() => {
    if (!generating) return;
    if (genProgress >= 100) { setTimeout(() => { setGenerating(null); setGenProgress(0); }, 600); return; }
    const t = setTimeout(() => setGenProgress((p) => Math.min(p + Math.random() * 18 + 4, 100)), 120);
    return () => clearTimeout(t);
  }, [generating, genProgress]);

  const addSection = (w: typeof widgetTypes[number]) => {
    setSections((s) => [...s, { id: nextId, type: w.type, title: `New ${w.type}`, color: w.color }]);
    setNextId((n) => n + 1);
  };
  const removeSection = (id: number) => setSections((s) => s.filter((x) => x.id !== id));
  const moveSection = (id: number, dir: -1 | 1) => {
    setSections((s) => {
      const i = s.findIndex((x) => x.id === id);
      if ((dir === -1 && i === 0) || (dir === 1 && i === s.length - 1)) return s;
      const arr = [...s]; [arr[i], arr[i + dir]] = [arr[i + dir], arr[i]]; return arr;
    });
  };
  const updateTitle = (id: number, title: string) => setSections((s) => s.map((x) => (x.id === id ? { ...x, title } : x)));
  const addRecipient = () => { if (newEmail && newEmail.includes("@")) { setRecipients((r) => [...r, newEmail]); setNewEmail(""); } };

  const statusBadge = (s: string) => {
    const map: Record<string, string> = { delivered: "bg-emerald-500/20 text-emerald-400", generating: "bg-amber-500/20 text-amber-400", failed: "bg-red-500/20 text-red-400" };
    return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${map[s] || ""}`}>{s}</span>;
  };

  const TemplatesTab = () => (
    <div>
      {generating && (
        <div className="mb-6 bg-[#111E36] border border-cyan-500/30 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2"><Settings className="w-4 h-4 text-cyan-400 animate-spin" /><span className="text-cyan-300 text-sm font-medium">Assembling: {generating}</span></div>
          <div className="w-full bg-[#0A1628] rounded-full h-2.5 overflow-hidden">
            <div className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full transition-all duration-150" style={{ width: `${genProgress}%` }} />
          </div>
          <p className="text-xs text-slate-500 mt-1">{genProgress < 30 ? "Querying data sources..." : genProgress < 60 ? "Building visualizations..." : genProgress < 90 ? "Formatting pages..." : "Finalizing PDF..."}</p>
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {templates.map((t, i) => (
          <div key={i} onMouseEnter={() => setHoveredTpl(i)} onMouseLeave={() => setHoveredTpl(null)}
            className="bg-[#111E36] border border-slate-700/50 rounded-lg overflow-hidden transition-all duration-300 hover:border-cyan-500/40 hover:shadow-lg hover:shadow-cyan-500/10"
            style={{ transform: hoveredTpl === i ? "scale(1.04)" : "scale(1)" }}>
            <div className="h-24 bg-gradient-to-br from-slate-800 to-slate-900 p-3 flex flex-col gap-1">
              <div className="h-2 w-3/4 bg-slate-700 rounded" /><div className="h-1.5 w-1/2 bg-slate-700/60 rounded" />
              <div className="flex gap-1 mt-auto"><div className="h-8 w-8 bg-cyan-500/10 rounded" /><div className="h-8 w-8 bg-blue-500/10 rounded" /><div className="h-8 w-8 bg-emerald-500/10 rounded" /></div>
            </div>
            <div className="p-3">
              <h3 className="text-sm font-semibold text-slate-200 mb-1">{t.name}</h3>
              <p className="text-xs text-slate-500 mb-2 line-clamp-2">{t.desc}</p>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-600">{t.pages} pages</span>
                <button onClick={() => handleGenerate(t.name)} disabled={!!generating}
                  className="px-3 py-1 text-xs bg-cyan-500/20 text-cyan-400 rounded hover:bg-cyan-500/30 transition disabled:opacity-40">Generate</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const BuilderTab = () => (
    <div className="flex gap-4 h-[520px]">
      <div className="w-48 shrink-0 bg-[#111E36] border border-slate-700/50 rounded-lg p-3 space-y-2">
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Widgets</h3>
        {widgetTypes.map((w) => (
          <button key={w.type} onClick={() => addSection(w)}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-slate-300 hover:bg-slate-700/40 transition group">
            <w.icon className="w-4 h-4" style={{ color: w.color }} />
            <span>{w.type}</span>
            <Plus className="w-3 h-3 ml-auto opacity-0 group-hover:opacity-100 text-slate-500 transition" />
          </button>
        ))}
      </div>
      <div className="flex-1 bg-[#111E36] border border-slate-700/50 rounded-lg p-4 overflow-y-auto">
        <div className="mb-4 space-y-2">
          <input value={reportTitle} onChange={(e) => setReportTitle(e.target.value)}
            className="w-full bg-transparent text-xl font-bold text-slate-100 border-b border-transparent hover:border-slate-700 focus:border-cyan-500 outline-none pb-1 transition" />
          <input value={reportSubtitle} onChange={(e) => setReportSubtitle(e.target.value)}
            className="w-full bg-transparent text-sm text-slate-400 border-b border-transparent hover:border-slate-700 focus:border-cyan-500 outline-none pb-1 transition" />
        </div>
        {sections.length === 0 && <div className="text-center py-16 text-slate-600 text-sm">Click a widget to add sections</div>}
        <div className="space-y-2">
          {sections.map((s) => (
            <div key={s.id} className="flex items-center gap-2 bg-[#0D1A2E] border border-slate-700/40 rounded-lg px-3 py-2.5 group hover:border-cyan-500/30 transition">
              <div className="w-2 h-8 rounded-full" style={{ background: s.color }} />
              <span className="text-xs text-slate-500 w-16 shrink-0">{s.type}</span>
              {editingSection === s.id ? (
                <input autoFocus value={s.title} onChange={(e) => updateTitle(s.id, e.target.value)} onBlur={() => setEditingSection(null)} onKeyDown={(e) => e.key === "Enter" && setEditingSection(null)}
                  className="flex-1 bg-transparent text-sm text-slate-200 outline-none border-b border-cyan-500" />
              ) : (
                <span className="flex-1 text-sm text-slate-300 truncate cursor-pointer" onClick={() => setEditingSection(s.id)}>{s.title}</span>
              )}
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition">
                <button onClick={() => setEditingSection(s.id)} className="p-1 hover:bg-slate-700 rounded"><Edit3 className="w-3 h-3 text-slate-500" /></button>
                <button onClick={() => moveSection(s.id, -1)} className="p-1 hover:bg-slate-700 rounded"><ChevronUp className="w-3 h-3 text-slate-500" /></button>
                <button onClick={() => moveSection(s.id, 1)} className="p-1 hover:bg-slate-700 rounded"><ChevronDown className="w-3 h-3 text-slate-500" /></button>
                <button onClick={() => removeSection(s.id)} className="p-1 hover:bg-red-500/20 rounded"><X className="w-3 h-3 text-red-400" /></button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const PreviewTab = () => (
    <div className="flex justify-center">
      <div className="w-full max-w-2xl bg-white text-gray-900 rounded-lg shadow-2xl shadow-black/40 overflow-hidden" style={{ fontFamily: "Georgia, serif" }}>
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-800 to-slate-900 text-white px-8 py-5 flex justify-between items-start">
          <div><div className="flex items-center gap-2 mb-1"><div className="w-8 h-8 rounded bg-cyan-500 flex items-center justify-center text-xs font-bold">SC</div><span className="text-lg font-bold">SecureCore SOC</span></div>
            <p className="text-xs text-slate-400">{reportTitle}</p></div>
          <div className="text-right text-xs"><p className="text-slate-400">April 23, 2026</p><p className="mt-1 px-2 py-0.5 bg-red-500/20 text-red-300 rounded text-[10px] font-semibold uppercase tracking-wider">Confidential</p></div>
        </div>
        <div className="p-8 space-y-6">
          {/* KPIs */}
          <div><h2 className="text-sm font-bold text-gray-700 border-b border-gray-200 pb-1 mb-3 uppercase tracking-wider">Key Performance Indicators</h2>
            <div className="grid grid-cols-4 gap-3">
              {[{ label: "Total Alerts", val: "14,208", chg: "-8%" }, { label: "MTTD", val: "4.2 min", chg: "-12%" }, { label: "MTTR", val: "18 min", chg: "-5%" }, { label: "Cases Closed", val: "342", chg: "+15%" }].map((k, i) => (
                <div key={i} className="bg-gray-50 rounded p-2.5 text-center border border-gray-100">
                  <p className="text-[10px] text-gray-500 uppercase">{k.label}</p>
                  <p className="text-lg font-bold text-gray-900">{k.val}</p>
                  <p className={`text-[10px] font-semibold ${k.chg.startsWith("-") ? "text-emerald-600" : "text-blue-600"}`}>{k.chg} vs prior</p>
                </div>
              ))}
            </div>
          </div>
          {/* Bar Chart */}
          <div><h2 className="text-sm font-bold text-gray-700 border-b border-gray-200 pb-1 mb-3 uppercase tracking-wider">Alert Volume by Day</h2>
            <div className="flex items-end gap-2 h-28 px-2">
              {[65, 48, 72, 55, 80, 42, 60].map((h, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full rounded-t" style={{ height: `${h}%`, background: `linear-gradient(to top, #3B82F6, #06B6D4)` }} />
                  <span className="text-[9px] text-gray-500">{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][i]}</span>
                </div>
              ))}
            </div>
          </div>
          {/* Pie + Table row */}
          <div className="grid grid-cols-2 gap-6">
            <div><h2 className="text-sm font-bold text-gray-700 border-b border-gray-200 pb-1 mb-3 uppercase tracking-wider">Severity Distribution</h2>
              <div className="flex items-center justify-center">
                <svg viewBox="0 0 36 36" className="w-28 h-28">
                  <circle cx="18" cy="18" r="16" fill="none" stroke="#EF4444" strokeWidth="3" strokeDasharray="30 70" strokeDashoffset="25" />
                  <circle cx="18" cy="18" r="16" fill="none" stroke="#F59E0B" strokeWidth="3" strokeDasharray="25 75" strokeDashoffset="95" />
                  <circle cx="18" cy="18" r="16" fill="none" stroke="#3B82F6" strokeWidth="3" strokeDasharray="30 70" strokeDashoffset="70" />
                  <circle cx="18" cy="18" r="16" fill="none" stroke="#6B7280" strokeWidth="3" strokeDasharray="15 85" strokeDashoffset="40" />
                </svg>
                <div className="ml-4 space-y-1 text-[10px]">
                  {[["Critical", "#EF4444", "30%"], ["High", "#F59E0B", "25%"], ["Medium", "#3B82F6", "30%"], ["Low", "#6B7280", "15%"]].map(([l, c, p]) => (
                    <div key={l} className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full" style={{ background: c as string }} /><span className="text-gray-600">{l} ({p})</span></div>
                  ))}
                </div>
              </div>
            </div>
            <div><h2 className="text-sm font-bold text-gray-700 border-b border-gray-200 pb-1 mb-3 uppercase tracking-wider">Top Incidents</h2>
              <table className="w-full text-[10px]">
                <thead><tr className="text-gray-500 uppercase"><th className="text-left pb-1">Type</th><th className="text-right pb-1">Count</th><th className="text-right pb-1">Status</th></tr></thead>
                <tbody>
                  {[["Phishing", "89", "Resolved"], ["Malware", "54", "Active"], ["Brute Force", "37", "Resolved"], ["Data Exfil", "12", "Investigating"]].map(([t, c, s], i) => (
                    <tr key={i} className={i % 2 === 0 ? "bg-gray-50" : ""}><td className="py-1 px-1 text-gray-800">{t}</td><td className="py-1 px-1 text-right font-semibold">{c}</td><td className="py-1 px-1 text-right text-gray-500">{s}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="flex justify-between items-center border-t border-gray-200 pt-3 mt-4">
            <p className="text-[9px] text-gray-400">SecureCore SOC -- Confidential</p>
            <p className="text-[9px] text-gray-400">Page 1 of {sections.length > 0 ? Math.max(4, sections.length) : 4}</p>
          </div>
        </div>
      </div>
    </div>
  );

  const ScheduleTab = () => (
    <div className="space-y-6">
      <div className="bg-[#111E36] border border-slate-700/50 rounded-lg p-5">
        <h3 className="text-sm font-semibold text-slate-200 mb-4 flex items-center gap-2"><Calendar className="w-4 h-4 text-cyan-400" />New Schedule</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <div><label className="text-xs text-slate-500 block mb-1">Frequency</label>
            <select value={freq} onChange={(e) => setFreq(e.target.value)} className="w-full bg-[#0A1628] border border-slate-700 rounded px-3 py-2 text-sm text-slate-300 outline-none focus:border-cyan-500">
              {["Daily", "Weekly", "Monthly"].map((f) => <option key={f}>{f}</option>)}
            </select></div>
          <div><label className="text-xs text-slate-500 block mb-1">Day</label>
            <select value={day} onChange={(e) => setDay(e.target.value)} className="w-full bg-[#0A1628] border border-slate-700 rounded px-3 py-2 text-sm text-slate-300 outline-none focus:border-cyan-500">
              {(freq === "Weekly" ? ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"] : freq === "Monthly" ? ["1st", "15th", "Last"] : ["Every day"]).map((d) => <option key={d}>{d}</option>)}
            </select></div>
          <div><label className="text-xs text-slate-500 block mb-1">Time</label>
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="w-full bg-[#0A1628] border border-slate-700 rounded px-3 py-2 text-sm text-slate-300 outline-none focus:border-cyan-500" /></div>
          <div><label className="text-xs text-slate-500 block mb-1">Format</label>
            <div className="flex gap-1">
              {["PDF", "HTML", "CSV"].map((f) => (
                <button key={f} onClick={() => setFormat(f)} className={`flex-1 py-2 text-xs rounded ${format === f ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/40" : "bg-[#0A1628] border border-slate-700 text-slate-500"} transition`}>{f}</button>
              ))}
            </div></div>
        </div>
        <div className="mb-4"><label className="text-xs text-slate-500 block mb-1">Recipients</label>
          <div className="flex flex-wrap gap-2 mb-2">
            {recipients.map((r, i) => (
              <span key={i} className="flex items-center gap-1 bg-[#0A1628] border border-slate-700 rounded-full px-3 py-1 text-xs text-slate-300">
                <Mail className="w-3 h-3 text-slate-500" />{r}
                <button onClick={() => setRecipients((rs) => rs.filter((_, j) => j !== i))}><X className="w-3 h-3 text-slate-600 hover:text-red-400" /></button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input value={newEmail} onChange={(e) => setNewEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addRecipient()} placeholder="Add email..."
              className="flex-1 bg-[#0A1628] border border-slate-700 rounded px-3 py-1.5 text-sm text-slate-300 outline-none focus:border-cyan-500" />
            <button onClick={addRecipient} className="px-3 py-1.5 bg-cyan-500/20 text-cyan-400 rounded text-sm hover:bg-cyan-500/30 transition"><Plus className="w-4 h-4" /></button>
          </div>
        </div>
        <button className="px-4 py-2 bg-cyan-600 text-white rounded text-sm font-medium hover:bg-cyan-500 transition flex items-center gap-2"><Save className="w-4 h-4" />Save Schedule</button>
      </div>
      <div className="bg-[#111E36] border border-slate-700/50 rounded-lg overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-700/50"><h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2"><Clock className="w-4 h-4 text-cyan-400" />Active Schedules</h3></div>
        <table className="w-full text-sm">
          <thead><tr className="text-xs text-slate-500 uppercase border-b border-slate-700/30">
            <th className="text-left px-5 py-2">Report</th><th className="text-left px-3 py-2">Frequency</th><th className="text-left px-3 py-2">Time</th><th className="text-left px-3 py-2">Format</th><th className="text-left px-3 py-2">Recipients</th><th className="text-left px-3 py-2">Status</th>
          </tr></thead>
          <tbody>
            {mockSchedules.map((s) => (
              <tr key={s.id} className="border-b border-slate-700/20 hover:bg-slate-800/30">
                <td className="px-5 py-2.5 text-slate-300">{s.name}</td>
                <td className="px-3 py-2.5 text-slate-400">{s.freq} -- {s.day}</td>
                <td className="px-3 py-2.5 text-slate-400">{s.time}</td>
                <td className="px-3 py-2.5"><span className="px-2 py-0.5 bg-slate-700/50 rounded text-xs text-slate-300">{s.format}</span></td>
                <td className="px-3 py-2.5 text-slate-500 text-xs">{s.recipients.length} recipient{s.recipients.length > 1 ? "s" : ""}</td>
                <td className="px-3 py-2.5">{s.active ? <span className="flex items-center gap-1 text-xs text-emerald-400"><CheckCircle2 className="w-3 h-3" />Active</span> : <span className="text-xs text-slate-600">Paused</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  const HistoryTab = () => (
    <div className="bg-[#111E36] border border-slate-700/50 rounded-lg overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-700/50 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-200">Report History</h3>
        <div className="flex gap-2">
          <div className="flex items-center gap-1 bg-[#0A1628] border border-slate-700 rounded px-2 py-1"><Search className="w-3 h-3 text-slate-500" /><input placeholder="Search..." className="bg-transparent text-xs text-slate-300 outline-none w-24" /></div>
          <button className="flex items-center gap-1 bg-[#0A1628] border border-slate-700 rounded px-2 py-1 text-xs text-slate-400 hover:border-slate-600 transition"><Filter className="w-3 h-3" />Filter</button>
        </div>
      </div>
      <table className="w-full text-sm">
        <thead><tr className="text-xs text-slate-500 uppercase border-b border-slate-700/30">
          <th className="text-left px-5 py-2">Date</th><th className="text-left px-3 py-2">Report</th><th className="text-right px-3 py-2">Pages</th><th className="text-right px-3 py-2">Size</th><th className="text-left px-3 py-2">Status</th><th className="text-right px-5 py-2">Actions</th>
        </tr></thead>
        <tbody>
          {historyEntries.map((h, i) => (
            <tr key={i} className="border-b border-slate-700/20 hover:bg-slate-800/30">
              <td className="px-5 py-2.5 text-slate-400 text-xs font-mono">{h.date}</td>
              <td className="px-3 py-2.5 text-slate-300">{h.template}</td>
              <td className="px-3 py-2.5 text-right text-slate-400">{h.pages}</td>
              <td className="px-3 py-2.5 text-right text-slate-400">{h.size}</td>
              <td className="px-3 py-2.5">{statusBadge(h.status)}</td>
              <td className="px-5 py-2.5 text-right">
                <div className="flex gap-1 justify-end">
                  <button className="p-1 hover:bg-slate-700 rounded" title="View"><Eye className="w-3.5 h-3.5 text-slate-500" /></button>
                  <button className="p-1 hover:bg-slate-700 rounded" title="Download"><Download className="w-3.5 h-3.5 text-slate-500" /></button>
                  <button className="p-1 hover:bg-slate-700 rounded" title="Print"><Printer className="w-3.5 h-3.5 text-slate-500" /></button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const tabContent: Record<Tab, React.ReactNode> = {
    Templates: <TemplatesTab />, Builder: <BuilderTab />, Preview: <PreviewTab />, Schedule: <ScheduleTab />, History: <HistoryTab />,
  };

  return (
    <div className="min-h-screen bg-[#0A1628] text-slate-100 p-6">
      <div className="max-w-7xl mx-auto space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div><h1 className="text-2xl font-bold text-white flex items-center gap-2"><FileText className="w-6 h-6 text-cyan-400" />Report Builder</h1>
            <p className="text-sm text-slate-500 mt-0.5">Scheduled delivery and custom report generation</p></div>
          <div className="flex gap-2">
            <button className="px-3 py-2 bg-[#111E36] border border-slate-700/50 rounded text-sm text-slate-400 hover:border-slate-600 transition flex items-center gap-1.5"><Settings className="w-4 h-4" />Settings</button>
            <button className="px-3 py-2 bg-cyan-600 rounded text-sm text-white font-medium hover:bg-cyan-500 transition flex items-center gap-1.5"><Plus className="w-4 h-4" />New Report</button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-[#111E36] rounded-lg p-1 border border-slate-700/50 w-fit">
          {tabs.map((t) => (
            <button key={t} onClick={() => switchTab(t)}
              className={`px-4 py-2 text-sm rounded-md transition font-medium ${activeTab === t ? "bg-cyan-500/20 text-cyan-400 shadow-sm" : "text-slate-500 hover:text-slate-300 hover:bg-slate-800/50"}`}>
              {t}
            </button>
          ))}
        </div>

        {/* Tab Content with crossfade */}
        <div className={`transition-opacity duration-150 ${fade ? "opacity-100" : "opacity-0"}`}>
          {tabContent[activeTab]}
        </div>

        {/* Export Bar */}
        <div className="bg-[#111E36] border border-slate-700/50 rounded-lg p-4">
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Export & Share</h3>
          <div className="flex gap-3">
            {exportFormats.map((f) => (
              <button key={f.name} className="flex-1 flex flex-col items-center gap-2 py-3 rounded-lg border border-slate-700/40 hover:border-cyan-500/30 hover:bg-slate-800/30 transition group">
                <f.icon className="w-5 h-5 transition group-hover:scale-110" style={{ color: f.color }} />
                <span className="text-xs text-slate-400 group-hover:text-slate-300 transition">{f.name}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
