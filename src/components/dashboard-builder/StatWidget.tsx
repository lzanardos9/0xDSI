import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface StatWidgetProps {
  value: string | number;
  label?: string;
  trend?: number;
  color?: string;
  unitFormat?: string;
}

function formatValue(val: string | number, unit?: string): string {
  if (typeof val === 'string') return val;
  if (Math.abs(val) >= 1_000_000) return (val / 1_000_000).toFixed(1) + 'M';
  if (Math.abs(val) >= 1_000) return (val / 1_000).toFixed(1) + 'K';
  if (unit === 'percent') return val.toFixed(1) + '%';
  if (unit === 'ms') return val.toFixed(0) + 'ms';
  if (unit === 's') return val.toFixed(1) + 's';
  if (Number.isInteger(val)) return String(val);
  return val.toFixed(2);
}

export default function StatWidget({ value, label, trend, color = '#3B82F6', unitFormat }: StatWidgetProps) {
  const TrendIcon = trend && trend > 0 ? TrendingUp : trend && trend < 0 ? TrendingDown : Minus;
  const trendColor = trend && trend > 0 ? 'text-emerald-400' : trend && trend < 0 ? 'text-red-400' : 'text-slate-500';

  return (
    <div className="flex flex-col items-center justify-center h-full px-4">
      <div className="text-3xl font-bold tracking-tight" style={{ color }}>
        {formatValue(value, unitFormat)}
      </div>
      {label && (
        <div className="text-xs text-slate-400 mt-1 text-center truncate max-w-full">
          {label}
        </div>
      )}
      {trend !== undefined && (
        <div className={`flex items-center gap-1 mt-2 text-xs ${trendColor}`}>
          <TrendIcon className="w-3 h-3" />
          <span>{Math.abs(trend).toFixed(1)}%</span>
        </div>
      )}
    </div>
  );
}
