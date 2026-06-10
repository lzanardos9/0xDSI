import { useState, useEffect } from 'react';
import {
  Coins, TrendingUp, AlertTriangle, Users, Building2,
  Brain, AppWindow, ChevronDown, ChevronUp, Clock, Zap,
  Plus, X, Save, Trash2, CreditCard as Edit2, RotateCcw
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { TokenBudget } from '../../lib/guardrailsData';

const SCOPE_CONFIG: Record<string, { label: string; icon: any; color: string }> = {
  user: { label: 'Users', icon: Users, color: 'text-blue-400' },
  department: { label: 'Departments', icon: Building2, color: 'text-emerald-400' },
  model: { label: 'Models', icon: Brain, color: 'text-cyan-400' },
  application: { label: 'Applications', icon: AppWindow, color: 'text-amber-400' },
};

const STATUS_CONFIG: Record<string, { label: string; color: string; bgColor: string; borderColor: string }> = {
  active: { label: 'Active', color: 'text-emerald-400', bgColor: 'bg-emerald-500/10', borderColor: 'border-emerald-500/20' },
  warning: { label: 'Warning', color: 'text-amber-400', bgColor: 'bg-amber-500/10', borderColor: 'border-amber-500/20' },
  throttled: { label: 'Throttled', color: 'text-orange-400', bgColor: 'bg-orange-500/10', borderColor: 'border-orange-500/20' },
  blocked: { label: 'Blocked', color: 'text-red-400', bgColor: 'bg-red-500/10', borderColor: 'border-red-500/20' },
};

const BUDGET_TEMPLATES = [
  { name: 'Standard User', data: { scope_type: 'user' as const, daily_limit: 50000, weekly_limit: 250000, monthly_limit: 1000000, cost_limit_usd: 25, alert_threshold_pct: 80, hard_limit_pct: 100 } },
  { name: 'Power User', data: { scope_type: 'user' as const, daily_limit: 200000, weekly_limit: 1000000, monthly_limit: 4000000, cost_limit_usd: 100, alert_threshold_pct: 75, hard_limit_pct: 95 } },
  { name: 'Engineering Dept', data: { scope_type: 'department' as const, scope_name: 'Engineering', scope_id: 'dept-eng', daily_limit: 500000, weekly_limit: 2500000, monthly_limit: 10000000, cost_limit_usd: 500, alert_threshold_pct: 70, hard_limit_pct: 90 } },
  { name: 'GPT-4 Model Cap', data: { scope_type: 'model' as const, scope_name: 'GPT-4 Turbo', scope_id: 'gpt-4-turbo', daily_limit: 1000000, weekly_limit: 5000000, monthly_limit: 20000000, cost_limit_usd: 2000, alert_threshold_pct: 60, hard_limit_pct: 85 } },
  { name: 'Internal App', data: { scope_type: 'application' as const, scope_name: 'Internal Chatbot', scope_id: 'app-chatbot', daily_limit: 300000, weekly_limit: 1500000, monthly_limit: 6000000, cost_limit_usd: 300, alert_threshold_pct: 75, hard_limit_pct: 95 } },
  { name: 'Restricted Tier', data: { scope_type: 'user' as const, daily_limit: 10000, weekly_limit: 50000, monthly_limit: 200000, cost_limit_usd: 5, alert_threshold_pct: 90, hard_limit_pct: 100 } },
];

const REAL_USERS = [
  { id: 'sarah.chen', name: 'Sarah Chen', email: 'sarah.chen@0xdsi.com' },
  { id: 'david.kim', name: 'David Kim', email: 'david.kim@0xdsi.com' },
  { id: 'marcus.rodriguez', name: 'Marcus Rodriguez', email: 'marcus.rodriguez@0xdsi.com' },
  { id: 'aisha.patel', name: 'Aisha Patel', email: 'aisha.patel@0xdsi.com' },
  { id: 'james.park', name: 'James Park', email: 'james.park@0xdsi.com' },
  { id: 'emily.watson', name: 'Emily Watson', email: 'emily.watson@0xdsi.com' },
];

const EMPTY_FORM = { scope_type: 'user' as const, scope_id: '', scope_name: '', daily_limit: 50000, weekly_limit: 250000, monthly_limit: 1000000, cost_limit_usd: 25, alert_threshold_pct: 80, hard_limit_pct: 100 };

const TokenBudgetControls = () => {
  const [budgets, setBudgets] = useState<TokenBudget[]>([]);
  const [activeScope, setActiveScope] = useState<string>('user');
  const [expandedBudget, setExpandedBudget] = useState<string | null>(null);
  const [animatedBudgets, setAnimatedBudgets] = useState<Set<string>>(new Set());
  const [showModal, setShowModal] = useState(false);
  const [editingBudget, setEditingBudget] = useState<TokenBudget | null>(null);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [resetConfirm, setResetConfirm] = useState<string | null>(null);

  useEffect(() => { loadBudgets(); }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setBudgets(prev => prev.map(b => {
        const increment = Math.floor(Math.random() * 500);
        const costIncrement = increment * 0.00005;
        const newDailyUsed = Math.min(b.daily_used + increment, b.daily_limit * 1.1);
        const newCostUsed = Math.min(b.cost_used_usd + costIncrement, b.cost_limit_usd * 1.1);
        const pct = (newDailyUsed / b.daily_limit) * 100;
        let newStatus = b.status;
        if (pct >= 100) newStatus = 'throttled';
        else if (pct >= 80) newStatus = 'warning';
        else newStatus = 'active';
        if (newStatus !== b.status && newStatus === 'throttled') {
          setAnimatedBudgets(prev => new Set(prev).add(b.id));
          setTimeout(() => setAnimatedBudgets(prev => { const next = new Set(prev); next.delete(b.id); return next; }), 2000);
        }
        return { ...b, daily_used: newDailyUsed, cost_used_usd: Number(newCostUsed.toFixed(2)), status: newStatus };
      }));
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const loadBudgets = async () => {
    const { data } = await supabase.from('token_budgets').select('*').order('scope_type').order('scope_name');
    if (data) setBudgets(data);
  };

  const openCreate = (tpl?: any) => {
    setEditingBudget(null);
    setFormData(tpl ? { ...EMPTY_FORM, ...tpl } : EMPTY_FORM);
    setShowModal(true);
  };

  const openEdit = (budget: TokenBudget) => {
    setEditingBudget(budget);
    setFormData({ scope_type: budget.scope_type, scope_id: budget.scope_id, scope_name: budget.scope_name, daily_limit: budget.daily_limit, weekly_limit: budget.weekly_limit, monthly_limit: budget.monthly_limit, cost_limit_usd: budget.cost_limit_usd, alert_threshold_pct: budget.alert_threshold_pct, hard_limit_pct: budget.hard_limit_pct });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!formData.scope_name.trim() || !formData.scope_id.trim()) return;
    setSaving(true);
    const payload = { scope_type: formData.scope_type, scope_id: formData.scope_id.trim(), scope_name: formData.scope_name.trim(), daily_limit: formData.daily_limit, weekly_limit: formData.weekly_limit, monthly_limit: formData.monthly_limit, cost_limit_usd: formData.cost_limit_usd, alert_threshold_pct: formData.alert_threshold_pct, hard_limit_pct: formData.hard_limit_pct };
    if (editingBudget) {
      const { data } = await supabase.from('token_budgets').update(payload).eq('id', editingBudget.id).select().single();
      if (data) setBudgets(prev => prev.map(b => b.id === data.id ? data : b));
    } else {
      const { data } = await supabase.from('token_budgets').insert({ ...payload, daily_used: 0, weekly_used: 0, monthly_used: 0, cost_used_usd: 0, status: 'active', last_reset_at: new Date().toISOString() }).select().single();
      if (data) setBudgets(prev => [data, ...prev]);
    }
    setSaving(false);
    setShowModal(false);
  };

  const handleDelete = async (id: string) => {
    await supabase.from('token_budgets').delete().eq('id', id);
    setBudgets(prev => prev.filter(b => b.id !== id));
    setDeleteConfirm(null);
  };

  const handleResetUsage = async (id: string) => {
    const { data } = await supabase.from('token_budgets').update({ daily_used: 0, weekly_used: 0, monthly_used: 0, cost_used_usd: 0, status: 'active', last_reset_at: new Date().toISOString() }).eq('id', id).select().single();
    if (data) setBudgets(prev => prev.map(b => b.id === data.id ? data : b));
    setResetConfirm(null);
  };

  const filteredBudgets = budgets.filter(b => b.scope_type === activeScope);
  const scopeCounts = budgets.reduce<Record<string, { total: number; warning: number; throttled: number }>>((acc, b) => {
    if (!acc[b.scope_type]) acc[b.scope_type] = { total: 0, warning: 0, throttled: 0 };
    acc[b.scope_type].total++;
    if (b.status === 'warning') acc[b.scope_type].warning++;
    if (b.status === 'throttled' || b.status === 'blocked') acc[b.scope_type].throttled++;
    return acc;
  }, {});

  const totalCostUsed = budgets.reduce((s, b) => s + b.cost_used_usd, 0);
  const totalCostLimit = budgets.reduce((s, b) => s + b.cost_limit_usd, 0);
  const totalDailyUsed = budgets.filter(b => b.scope_type === 'user').reduce((s, b) => s + b.daily_used, 0);
  const totalDailyLimit = budgets.filter(b => b.scope_type === 'user').reduce((s, b) => s + b.daily_limit, 0);
  const throttledCount = budgets.filter(b => b.status === 'throttled' || b.status === 'blocked').length;

  return (
    <div className="space-y-6">
      {/* CRUD Header */}
      <div className="rounded-xl border border-emerald-500/20 bg-gradient-to-r from-emerald-500/5 to-cyan-500/5 p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Coins className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-semibold text-slate-200">Quick Deploy Templates</h3>
            <span className="px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/20 rounded text-[10px] text-emerald-400 font-medium">COST GOVERNANCE</span>
          </div>
          <button onClick={() => openCreate()} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg transition-all flex items-center gap-2">
            <Plus className="w-4 h-4" /> New Budget
          </button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
          {BUDGET_TEMPLATES.map((tpl) => (
            <button key={tpl.name} onClick={() => openCreate(tpl.data)} className="px-3 py-2 bg-slate-800/50 hover:bg-slate-700/50 border border-slate-700/40 hover:border-emerald-500/30 rounded-lg text-[11px] text-slate-300 hover:text-white transition-all text-left">
              {tpl.name}
            </button>
          ))}
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="rounded-xl border border-slate-700/50 bg-slate-800/20 p-4">
          <div className="flex items-center gap-2 mb-3"><Coins className="w-4 h-4 text-emerald-400" /><span className="text-xs font-medium text-slate-400">Total Cost (All Scopes)</span></div>
          <p className="text-2xl font-bold text-white tabular-nums">${totalCostUsed.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          <div className="mt-2 h-2 bg-slate-700/50 rounded-full overflow-hidden"><div className={`h-full rounded-full transition-all duration-1000 ${(totalCostUsed / totalCostLimit) >= 0.9 ? 'bg-red-500' : (totalCostUsed / totalCostLimit) >= 0.7 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${Math.min(100, (totalCostUsed / totalCostLimit) * 100)}%` }} /></div>
          <p className="text-[10px] text-slate-500 mt-1">of ${totalCostLimit.toLocaleString()} budget</p>
        </div>
        <div className="rounded-xl border border-slate-700/50 bg-slate-800/20 p-4">
          <div className="flex items-center gap-2 mb-3"><Zap className="w-4 h-4 text-blue-400" /><span className="text-xs font-medium text-slate-400">Daily Token Usage</span></div>
          <p className="text-2xl font-bold text-white tabular-nums">{(totalDailyUsed / 1000).toFixed(0)}K</p>
          <div className="mt-2 h-2 bg-slate-700/50 rounded-full overflow-hidden"><div className="h-full bg-blue-500 rounded-full transition-all duration-1000" style={{ width: `${Math.min(100, (totalDailyUsed / totalDailyLimit) * 100)}%` }} /></div>
          <p className="text-[10px] text-slate-500 mt-1">of {(totalDailyLimit / 1000).toFixed(0)}K daily limit</p>
        </div>
        <div className={`rounded-xl border p-4 ${throttledCount > 0 ? 'border-orange-500/30 bg-orange-500/5' : 'border-slate-700/50 bg-slate-800/20'}`}>
          <div className="flex items-center gap-2 mb-3"><AlertTriangle className={`w-4 h-4 ${throttledCount > 0 ? 'text-orange-400' : 'text-slate-400'}`} /><span className="text-xs font-medium text-slate-400">Throttled</span></div>
          <p className={`text-2xl font-bold ${throttledCount > 0 ? 'text-orange-400' : 'text-white'}`}>{throttledCount}</p>
          <p className="text-[10px] text-slate-500 mt-2">entities over budget</p>
        </div>
        <div className="rounded-xl border border-slate-700/50 bg-slate-800/20 p-4">
          <div className="flex items-center gap-2 mb-3"><TrendingUp className="w-4 h-4 text-cyan-400" /><span className="text-xs font-medium text-slate-400">Cost Trend</span></div>
          <p className="text-2xl font-bold text-white">+12.4%</p>
          <p className="text-[10px] text-slate-500 mt-2">vs last week</p>
        </div>
      </div>

      {/* Scope Tabs */}
      <div className="flex gap-2">
        {Object.entries(SCOPE_CONFIG).map(([key, config]) => {
          const Icon = config.icon;
          const counts = scopeCounts[key] || { total: 0, warning: 0, throttled: 0 };
          return (
            <button key={key} onClick={() => setActiveScope(key)} className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium border transition-all ${activeScope === key ? 'bg-slate-700/50 border-slate-600/50 text-white' : 'bg-slate-800/30 border-slate-700/30 text-slate-400 hover:border-slate-600/50 hover:text-slate-300'}`}>
              <Icon className={`w-4 h-4 ${activeScope === key ? config.color : ''}`} />
              {config.label}
              <span className="text-xs text-slate-500">({counts.total})</span>
              {counts.throttled > 0 && <span className="w-2 h-2 bg-orange-400 rounded-full animate-pulse" />}
            </button>
          );
        })}
      </div>

      {/* Budget List */}
      <div className="space-y-3">
        {filteredBudgets.map((budget) => {
          const statusConfig = STATUS_CONFIG[budget.status] || STATUS_CONFIG.active;
          const dailyPct = budget.daily_limit > 0 ? (budget.daily_used / budget.daily_limit) * 100 : 0;
          const weeklyPct = budget.weekly_limit > 0 ? (budget.weekly_used / budget.weekly_limit) * 100 : 0;
          const monthlyPct = budget.monthly_limit > 0 ? (budget.monthly_used / budget.monthly_limit) * 100 : 0;
          const costPct = budget.cost_limit_usd > 0 ? (budget.cost_used_usd / budget.cost_limit_usd) * 100 : 0;
          const isExpanded = expandedBudget === budget.id;
          const isAnimated = animatedBudgets.has(budget.id);

          return (
            <div key={budget.id} className={`rounded-xl border overflow-hidden transition-all duration-500 ${isAnimated ? 'border-orange-500/50 bg-orange-500/5 ring-1 ring-orange-500/20' : budget.status === 'throttled' ? 'border-orange-500/30 bg-orange-500/5' : budget.status === 'warning' ? 'border-amber-500/20 bg-amber-500/5' : 'border-slate-700/50 bg-slate-800/20'}`}>
              <div className="px-5 py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 flex-1 cursor-pointer" onClick={() => setExpandedBudget(isExpanded ? null : budget.id)}>
                    <span className={`px-2.5 py-1 rounded text-[10px] font-bold border ${statusConfig.bgColor} ${statusConfig.color} ${statusConfig.borderColor}`}>{statusConfig.label.toUpperCase()}</span>
                    <div>
                      <p className="text-sm font-semibold text-slate-200">{budget.scope_name}</p>
                      <p className="text-[10px] text-slate-500">{budget.scope_type} / {budget.scope_id}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="hidden md:block w-48">
                      <div className="flex items-center justify-between mb-1"><span className="text-[10px] text-slate-500">Daily</span><span className={`text-[10px] font-bold tabular-nums ${dailyPct >= 90 ? 'text-red-400' : dailyPct >= 70 ? 'text-amber-400' : 'text-emerald-400'}`}>{dailyPct.toFixed(1)}%</span></div>
                      <div className="h-2 bg-slate-700/50 rounded-full overflow-hidden"><div className={`h-full rounded-full transition-all duration-1000 ${dailyPct >= 90 ? 'bg-gradient-to-r from-red-500 to-red-400' : dailyPct >= 70 ? 'bg-gradient-to-r from-amber-500 to-amber-400' : 'bg-gradient-to-r from-emerald-500 to-emerald-400'}`} style={{ width: `${Math.min(100, dailyPct)}%` }} /></div>
                    </div>
                    <div className="text-right hidden lg:block"><p className="text-sm font-bold text-white tabular-nums">${budget.cost_used_usd.toFixed(2)}</p><p className="text-[10px] text-slate-500">of ${budget.cost_limit_usd.toFixed(2)}</p></div>
                    <button onClick={() => openEdit(budget)} className="p-1.5 hover:bg-slate-700/50 rounded-lg text-slate-400 hover:text-cyan-400 transition-colors" title="Edit"><Edit2 className="w-3.5 h-3.5" /></button>
                    <button onClick={() => setResetConfirm(budget.id)} className="p-1.5 hover:bg-slate-700/50 rounded-lg text-slate-400 hover:text-amber-400 transition-colors" title="Reset Usage"><RotateCcw className="w-3.5 h-3.5" /></button>
                    <button onClick={() => setDeleteConfirm(budget.id)} className="p-1.5 hover:bg-slate-700/50 rounded-lg text-slate-400 hover:text-red-400 transition-colors" title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
                    <button onClick={() => setExpandedBudget(isExpanded ? null : budget.id)} className="p-1.5 hover:bg-slate-700/50 rounded-lg transition-colors">{isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}</button>
                  </div>
                </div>
              </div>

              {isExpanded && (
                <div className="px-5 pb-5 border-t border-slate-700/30 pt-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {[{ label: 'Daily', used: budget.daily_used, limit: budget.daily_limit, pct: dailyPct }, { label: 'Weekly', used: budget.weekly_used, limit: budget.weekly_limit, pct: weeklyPct }, { label: 'Monthly', used: budget.monthly_used, limit: budget.monthly_limit, pct: monthlyPct }].map((period) => (
                      <div key={period.label} className="p-3 bg-slate-900/40 rounded-lg">
                        <div className="flex items-center justify-between mb-2"><span className="text-xs font-medium text-slate-300">{period.label} Tokens</span><span className={`text-xs font-bold tabular-nums ${period.pct >= 90 ? 'text-red-400' : period.pct >= 70 ? 'text-amber-400' : 'text-emerald-400'}`}>{period.pct.toFixed(1)}%</span></div>
                        <div className="h-3 bg-slate-700/50 rounded-full overflow-hidden mb-2"><div className={`h-full rounded-full transition-all duration-700 ${period.pct >= 90 ? 'bg-gradient-to-r from-red-600 to-red-400' : period.pct >= 70 ? 'bg-gradient-to-r from-amber-600 to-amber-400' : 'bg-gradient-to-r from-emerald-600 to-emerald-400'}`} style={{ width: `${Math.min(100, period.pct)}%` }} /></div>
                        <div className="flex justify-between text-[10px] text-slate-500"><span>{(period.used / 1000).toFixed(0)}K used</span><span>{(period.limit / 1000).toFixed(0)}K limit</span></div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 p-3 bg-slate-900/40 rounded-lg">
                    <div className="flex items-center justify-between mb-2"><span className="text-xs font-medium text-slate-300">Cost Budget (USD)</span><span className={`text-xs font-bold tabular-nums ${costPct >= 90 ? 'text-red-400' : costPct >= 70 ? 'text-amber-400' : 'text-emerald-400'}`}>{costPct.toFixed(1)}%</span></div>
                    <div className="h-3 bg-slate-700/50 rounded-full overflow-hidden mb-2"><div className={`h-full rounded-full transition-all duration-700 ${costPct >= 90 ? 'bg-gradient-to-r from-red-600 to-red-400' : costPct >= 70 ? 'bg-gradient-to-r from-amber-600 to-amber-400' : 'bg-gradient-to-r from-emerald-600 to-emerald-400'}`} style={{ width: `${Math.min(100, costPct)}%` }} /></div>
                    <div className="flex justify-between text-[10px] text-slate-500"><span>${budget.cost_used_usd.toFixed(2)} spent</span><span>Alert at {budget.alert_threshold_pct}% | Hard limit at {budget.hard_limit_pct}%</span><span>${budget.cost_limit_usd.toFixed(2)} budget</span></div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-2xl bg-[#0f1a2e] border border-slate-700/60 rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-[#0f1a2e] border-b border-slate-700/40 px-6 py-4 flex items-center justify-between z-10">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center"><Coins className="w-4 h-4 text-emerald-400" /></div>
                <h2 className="text-lg font-bold text-white">{editingBudget ? 'Edit Budget' : 'Create New Budget'}</h2>
              </div>
              <button onClick={() => setShowModal(false)} className="p-2 hover:bg-slate-700/50 rounded-lg transition-colors"><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <div className="p-6 space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-1.5 block">Scope Type</label>
                  <select value={formData.scope_type} onChange={(e) => setFormData(p => ({ ...p, scope_type: e.target.value as any }))} className="w-full px-4 py-2.5 bg-slate-800/60 border border-slate-700/50 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-emerald-500/50">
                    <option value="user">User</option><option value="department">Department</option><option value="model">Model</option><option value="application">Application</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-1.5 block">Scope Name</label>
                  {formData.scope_type === 'user' ? (
                    <select value={formData.scope_name} onChange={(e) => { const user = REAL_USERS.find(u => u.name === e.target.value); setFormData(p => ({ ...p, scope_name: e.target.value, scope_id: user?.id || '' })); }} className="w-full px-4 py-2.5 bg-slate-800/60 border border-slate-700/50 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-emerald-500/50">
                      <option value="">Select user...</option>
                      {REAL_USERS.map(u => <option key={u.id} value={u.name}>{u.name} ({u.email})</option>)}
                    </select>
                  ) : (
                    <input type="text" value={formData.scope_name} onChange={(e) => setFormData(p => ({ ...p, scope_name: e.target.value }))} className="w-full px-4 py-2.5 bg-slate-800/60 border border-slate-700/50 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20" placeholder="e.g., Engineering, GPT-4 Turbo" />
                  )}
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-1.5 block">Scope ID</label>
                <input type="text" value={formData.scope_id} onChange={(e) => setFormData(p => ({ ...p, scope_id: e.target.value }))} className="w-full px-4 py-2.5 bg-slate-800/60 border border-slate-700/50 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20" placeholder="e.g., sarah.chen, dept-eng, gpt-4-turbo" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-1.5 block">Daily Limit (tokens)</label>
                  <input type="number" value={formData.daily_limit} onChange={(e) => setFormData(p => ({ ...p, daily_limit: Number(e.target.value) }))} className="w-full px-4 py-2.5 bg-slate-800/60 border border-slate-700/50 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-emerald-500/50" />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-1.5 block">Weekly Limit (tokens)</label>
                  <input type="number" value={formData.weekly_limit} onChange={(e) => setFormData(p => ({ ...p, weekly_limit: Number(e.target.value) }))} className="w-full px-4 py-2.5 bg-slate-800/60 border border-slate-700/50 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-emerald-500/50" />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-1.5 block">Monthly Limit (tokens)</label>
                  <input type="number" value={formData.monthly_limit} onChange={(e) => setFormData(p => ({ ...p, monthly_limit: Number(e.target.value) }))} className="w-full px-4 py-2.5 bg-slate-800/60 border border-slate-700/50 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-emerald-500/50" />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-1.5 block">Cost Limit (USD)</label>
                  <input type="number" step="0.01" value={formData.cost_limit_usd} onChange={(e) => setFormData(p => ({ ...p, cost_limit_usd: Number(e.target.value) }))} className="w-full px-4 py-2.5 bg-slate-800/60 border border-slate-700/50 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-emerald-500/50" />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-1.5 block">Alert Threshold (%)</label>
                  <input type="number" min={1} max={100} value={formData.alert_threshold_pct} onChange={(e) => setFormData(p => ({ ...p, alert_threshold_pct: Number(e.target.value) }))} className="w-full px-4 py-2.5 bg-slate-800/60 border border-slate-700/50 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-emerald-500/50" />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-1.5 block">Hard Limit (%)</label>
                  <input type="number" min={1} max={100} value={formData.hard_limit_pct} onChange={(e) => setFormData(p => ({ ...p, hard_limit_pct: Number(e.target.value) }))} className="w-full px-4 py-2.5 bg-slate-800/60 border border-slate-700/50 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-emerald-500/50" />
                </div>
              </div>
            </div>
            <div className="sticky bottom-0 bg-[#0f1a2e] border-t border-slate-700/40 px-6 py-4 flex items-center justify-end gap-3">
              <button onClick={() => setShowModal(false)} className="px-5 py-2.5 bg-slate-700/50 hover:bg-slate-700 text-slate-300 text-sm font-medium rounded-lg transition-colors">Cancel</button>
              <button onClick={handleSave} disabled={saving || !formData.scope_name.trim() || !formData.scope_id.trim()} className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 text-white text-sm font-medium rounded-lg transition-all flex items-center gap-2">
                {saving ? <><div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Saving...</> : <><Save className="w-4 h-4" /> {editingBudget ? 'Update Budget' : 'Create Budget'}</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-[#0f1a2e] border border-red-500/30 rounded-xl p-6 max-w-sm w-full">
            <h3 className="text-lg font-bold text-white mb-2">Delete Budget?</h3>
            <p className="text-sm text-slate-400 mb-5">This action cannot be undone. The budget allocation will be permanently removed.</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setDeleteConfirm(null)} className="px-4 py-2 bg-slate-700/50 hover:bg-slate-700 text-slate-300 text-sm rounded-lg">Cancel</button>
              <button onClick={() => handleDelete(deleteConfirm)} className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-sm rounded-lg flex items-center gap-2"><Trash2 className="w-3.5 h-3.5" /> Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Reset Confirmation */}
      {resetConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-[#0f1a2e] border border-amber-500/30 rounded-xl p-6 max-w-sm w-full">
            <h3 className="text-lg font-bold text-white mb-2">Reset Usage Counters?</h3>
            <p className="text-sm text-slate-400 mb-5">This will reset all daily, weekly, monthly, and cost counters to zero and restore status to active.</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setResetConfirm(null)} className="px-4 py-2 bg-slate-700/50 hover:bg-slate-700 text-slate-300 text-sm rounded-lg">Cancel</button>
              <button onClick={() => handleResetUsage(resetConfirm)} className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white text-sm rounded-lg flex items-center gap-2"><RotateCcw className="w-3.5 h-3.5" /> Reset</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TokenBudgetControls;
