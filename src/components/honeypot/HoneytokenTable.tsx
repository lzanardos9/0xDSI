import { useState } from 'react';
import { Key, FileText, Globe, Mail, Award, Database, Link, Lock, ChevronRight } from 'lucide-react';

interface Props {
  honeytokens: any[];
}

const TYPE_ICONS: Record<string, typeof Key> = {
  credential: Key,
  file: FileText,
  api_key: Lock,
  dns_record: Globe,
  aws_key: Award,
  database_entry: Database,
  email: Mail,
  url: Link,
  certificate: Award,
};

const STATUS_STYLES: Record<string, string> = {
  active: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  triggered: 'bg-red-500/15 text-red-400 border-red-500/30',
  expired: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
  disabled: 'bg-slate-600/15 text-slate-500 border-slate-600/30',
};

const SEVERITY_STYLES: Record<string, string> = {
  critical: 'bg-red-500/10 text-red-400 border-red-500/20',
  high: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  medium: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  low: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
};

const HoneytokenTable = ({ honeytokens }: Props) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const sorted = [...honeytokens].sort((a, b) => {
    if (a.status === 'triggered' && b.status !== 'triggered') return -1;
    if (b.status === 'triggered' && a.status !== 'triggered') return 1;
    return b.trigger_count - a.trigger_count;
  });

  const timeAgo = (dt: string | null) => {
    if (!dt) return 'Never';
    const diff = Date.now() - new Date(dt).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  return (
    <div className="rounded-xl border border-slate-700/50 bg-slate-800/40 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-700/50 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-200">Deployed HoneyTokens</h3>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1 text-[10px] text-red-400">
            <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
            {honeytokens.filter(t => t.status === 'triggered').length} triggered
          </span>
          <span className="text-xs text-slate-500">{honeytokens.length} deployed</span>
        </div>
      </div>
      <div className="divide-y divide-slate-700/20">
        {sorted.map(token => {
          const Icon = TYPE_ICONS[token.token_type] || Key;
          const expanded = expandedId === token.id;
          const isTriggered = token.status === 'triggered';

          return (
            <div key={token.id}>
              <div
                className={`px-4 py-3 cursor-pointer hover:bg-slate-700/20 transition-colors ${
                  isTriggered ? 'bg-red-500/5' : ''
                }`}
                onClick={() => setExpandedId(expanded ? null : token.id)}
              >
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-lg flex-shrink-0 ${isTriggered ? 'bg-red-500/10 border border-red-500/20' : 'bg-slate-700/50'}`}>
                    <Icon className={`w-4 h-4 ${isTriggered ? 'text-red-400' : 'text-cyan-400'}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-sm text-slate-200 truncate">{token.name}</span>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${STATUS_STYLES[token.status]}`}>
                        {isTriggered && <span className="w-1.5 h-1.5 rounded-full bg-red-400 mr-1 animate-pulse" />}
                        {token.status}
                      </span>
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${SEVERITY_STYLES[token.alert_severity]}`}>
                        {token.alert_severity}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-slate-400">
                      <span className="font-mono text-[11px] text-slate-500 truncate max-w-[250px]">{token.token_value_masked}</span>
                      <span>{token.placement_location}</span>
                    </div>
                    <div className="flex items-center gap-4 mt-1 text-[10px] text-slate-500">
                      <span>Triggers: <span className="text-slate-300 font-semibold">{token.trigger_count}</span></span>
                      <span>Last: <span className="text-slate-300">{timeAgo(token.last_triggered_at)}</span></span>
                      {token.triggered_by_ip && (
                        <span>From: <span className="text-red-400 font-mono">{token.triggered_by_ip}</span></span>
                      )}
                      {token.triggered_by_user && (
                        <span>User: <span className="text-amber-400">{token.triggered_by_user}</span></span>
                      )}
                    </div>
                  </div>
                  <ChevronRight className={`w-4 h-4 text-slate-500 flex-shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`} />
                </div>
              </div>

              {expanded && (
                <div className="px-4 py-3 bg-slate-900/50 border-t border-slate-700/20">
                  <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-2 font-medium">Breadcrumb Trail</p>
                  <div className="relative pl-4">
                    <div className="absolute left-1.5 top-0 bottom-0 w-[1px] bg-gradient-to-b from-cyan-500/40 via-amber-500/40 to-red-500/40" />
                    {(token.breadcrumb_trail || []).map((step: string, i: number) => {
                      const isLast = i === (token.breadcrumb_trail || []).length - 1;
                      return (
                        <div key={i} className="relative flex items-start gap-2 mb-2 last:mb-0">
                          <div className={`absolute -left-[14px] mt-1 w-2 h-2 rounded-full border ${
                            isLast ? 'bg-red-500 border-red-400' : i === 0 ? 'bg-cyan-500 border-cyan-400' : 'bg-amber-500 border-amber-400'
                          }`} />
                          <span className={`text-xs ${isLast ? 'text-red-300 font-medium' : 'text-slate-400'}`}>{step}</span>
                        </div>
                      );
                    })}
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

export default HoneytokenTable;
