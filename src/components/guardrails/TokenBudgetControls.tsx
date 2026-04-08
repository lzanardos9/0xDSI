import { useState, useEffect } from 'react';
import {
  Coins, TrendingUp, AlertTriangle, Users, Building2,
  Brain, AppWindow, ChevronDown, ChevronUp, Clock, Zap
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

const TokenBudgetControls = () => {
  const [budgets, setBudgets] = useState<TokenBudget[]>([]);
  const [activeScope, setActiveScope] = useState<string>('user');
  const [expandedBudget, setExpandedBudget] = useState<string | null>(null);
  const [animatedBudgets, setAnimatedBudgets] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadBudgets();
  }, []);

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
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="rounded-xl border border-slate-700/50 bg-slate-800/20 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Coins className="w-4 h-4 text-emerald-400" />
            <span className="text-xs font-medium text-slate-400">Total Cost (All Scopes)</span>
          </div>
          <p className="text-2xl font-bold text-white tabular-nums">${totalCostUsed.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          <div className="mt-2 h-2 bg-slate-700/50 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-1000 ${
                (totalCostUsed / totalCostLimit) >= 0.9 ? 'bg-red-500' :
                (totalCostUsed / totalCostLimit) >= 0.7 ? 'bg-amber-500' : 'bg-emerald-500'
              }`}
              style={{ width: `${Math.min(100, (totalCostUsed / totalCostLimit) * 100)}%` }}
            />
          </div>
          <p className="text-[10px] text-slate-500 mt-1">of ${totalCostLimit.toLocaleString()} budget</p>
        </div>

        <div className="rounded-xl border border-slate-700/50 bg-slate-800/20 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Zap className="w-4 h-4 text-blue-400" />
            <span className="text-xs font-medium text-slate-400">Daily Token Usage</span>
          </div>
          <p className="text-2xl font-bold text-white tabular-nums">{(totalDailyUsed / 1000).toFixed(0)}K</p>
          <div className="mt-2 h-2 bg-slate-700/50 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full transition-all duration-1000"
              style={{ width: `${Math.min(100, (totalDailyUsed / totalDailyLimit) * 100)}%` }}
            />
          </div>
          <p className="text-[10px] text-slate-500 mt-1">of {(totalDailyLimit / 1000).toFixed(0)}K daily limit</p>
        </div>

        <div className={`rounded-xl border p-4 ${
          throttledCount > 0 ? 'border-orange-500/30 bg-orange-500/5' : 'border-slate-700/50 bg-slate-800/20'
        }`}>
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className={`w-4 h-4 ${throttledCount > 0 ? 'text-orange-400' : 'text-slate-400'}`} />
            <span className="text-xs font-medium text-slate-400">Throttled</span>
          </div>
          <p className={`text-2xl font-bold ${throttledCount > 0 ? 'text-orange-400' : 'text-white'}`}>{throttledCount}</p>
          <p className="text-[10px] text-slate-500 mt-2">entities over budget</p>
        </div>

        <div className="rounded-xl border border-slate-700/50 bg-slate-800/20 p-4">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-4 h-4 text-cyan-400" />
            <span className="text-xs font-medium text-slate-400">Cost Trend</span>
          </div>
          <p className="text-2xl font-bold text-white">+12.4%</p>
          <p className="text-[10px] text-slate-500 mt-2">vs last week</p>
        </div>
      </div>

      <div className="flex gap-2">
        {Object.entries(SCOPE_CONFIG).map(([key, config]) => {
          const Icon = config.icon;
          const counts = scopeCounts[key] || { total: 0, warning: 0, throttled: 0 };
          return (
            <button
              key={key}
              onClick={() => setActiveScope(key)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium border transition-all ${
                activeScope === key
                  ? 'bg-slate-700/50 border-slate-600/50 text-white'
                  : 'bg-slate-800/30 border-slate-700/30 text-slate-400 hover:border-slate-600/50 hover:text-slate-300'
              }`}
            >
              <Icon className={`w-4 h-4 ${activeScope === key ? config.color : ''}`} />
              {config.label}
              <span className="text-xs text-slate-500">({counts.total})</span>
              {counts.throttled > 0 && (
                <span className="w-2 h-2 bg-orange-400 rounded-full animate-pulse" />
              )}
            </button>
          );
        })}
      </div>

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
            <div
              key={budget.id}
              className={`rounded-xl border overflow-hidden transition-all duration-500 ${
                isAnimated ? 'border-orange-500/50 bg-orange-500/5 ring-1 ring-orange-500/20' :
                budget.status === 'throttled' ? 'border-orange-500/30 bg-orange-500/5' :
                budget.status === 'warning' ? 'border-amber-500/20 bg-amber-500/5' :
                'border-slate-700/50 bg-slate-800/20'
              }`}
            >
              <div
                className="px-5 py-4 cursor-pointer"
                onClick={() => setExpandedBudget(isExpanded ? null : budget.id)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className={`px-2.5 py-1 rounded text-[10px] font-bold border ${statusConfig.bgColor} ${statusConfig.color} ${statusConfig.borderColor}`}>
                      {statusConfig.label.toUpperCase()}
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-slate-200">{budget.scope_name}</p>
                      <p className="text-[10px] text-slate-500">{budget.scope_type} / {budget.scope_id}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="hidden md:block w-48">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] text-slate-500">Daily</span>
                        <span className={`text-[10px] font-bold tabular-nums ${
                          dailyPct >= 90 ? 'text-red-400' : dailyPct >= 70 ? 'text-amber-400' : 'text-emerald-400'
                        }`}>{dailyPct.toFixed(1)}%</span>
                      </div>
                      <div className="h-2 bg-slate-700/50 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-1000 ${
                            dailyPct >= 90 ? 'bg-gradient-to-r from-red-500 to-red-400' :
                            dailyPct >= 70 ? 'bg-gradient-to-r from-amber-500 to-amber-400' :
                            'bg-gradient-to-r from-emerald-500 to-emerald-400'
                          }`}
                          style={{ width: `${Math.min(100, dailyPct)}%` }}
                        />
                      </div>
                    </div>
                    <div className="text-right hidden lg:block">
                      <p className="text-sm font-bold text-white tabular-nums">${budget.cost_used_usd.toFixed(2)}</p>
                      <p className="text-[10px] text-slate-500">of ${budget.cost_limit_usd.toFixed(2)}</p>
                    </div>
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                  </div>
                </div>
              </div>

              {isExpanded && (
                <div className="px-5 pb-5 border-t border-slate-700/30 pt-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {[
                      { label: 'Daily', used: budget.daily_used, limit: budget.daily_limit, pct: dailyPct },
                      { label: 'Weekly', used: budget.weekly_used, limit: budget.weekly_limit, pct: weeklyPct },
                      { label: 'Monthly', used: budget.monthly_used, limit: budget.monthly_limit, pct: monthlyPct },
                    ].map((period) => (
                      <div key={period.label} className="p-3 bg-slate-900/40 rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-medium text-slate-300">{period.label} Tokens</span>
                          <span className={`text-xs font-bold tabular-nums ${
                            period.pct >= 90 ? 'text-red-400' : period.pct >= 70 ? 'text-amber-400' : 'text-emerald-400'
                          }`}>{period.pct.toFixed(1)}%</span>
                        </div>
                        <div className="h-3 bg-slate-700/50 rounded-full overflow-hidden mb-2">
                          <div
                            className={`h-full rounded-full transition-all duration-700 ${
                              period.pct >= 90 ? 'bg-gradient-to-r from-red-600 to-red-400' :
                              period.pct >= 70 ? 'bg-gradient-to-r from-amber-600 to-amber-400' :
                              'bg-gradient-to-r from-emerald-600 to-emerald-400'
                            }`}
                            style={{ width: `${Math.min(100, period.pct)}%` }}
                          />
                        </div>
                        <div className="flex justify-between text-[10px] text-slate-500">
                          <span>{(period.used / 1000).toFixed(0)}K used</span>
                          <span>{(period.limit / 1000).toFixed(0)}K limit</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 p-3 bg-slate-900/40 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium text-slate-300">Cost Budget (USD)</span>
                      <span className={`text-xs font-bold tabular-nums ${
                        costPct >= 90 ? 'text-red-400' : costPct >= 70 ? 'text-amber-400' : 'text-emerald-400'
                      }`}>{costPct.toFixed(1)}%</span>
                    </div>
                    <div className="h-3 bg-slate-700/50 rounded-full overflow-hidden mb-2">
                      <div
                        className={`h-full rounded-full transition-all duration-700 ${
                          costPct >= 90 ? 'bg-gradient-to-r from-red-600 to-red-400' :
                          costPct >= 70 ? 'bg-gradient-to-r from-amber-600 to-amber-400' :
                          'bg-gradient-to-r from-emerald-600 to-emerald-400'
                        }`}
                        style={{ width: `${Math.min(100, costPct)}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[10px] text-slate-500">
                      <span>${budget.cost_used_usd.toFixed(2)} spent</span>
                      <span>Alert at {budget.alert_threshold_pct}% | Hard limit at {budget.hard_limit_pct}%</span>
                      <span>${budget.cost_limit_usd.toFixed(2)} budget</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default TokenBudgetControls;
