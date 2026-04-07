interface TableWidgetProps {
  data: any[];
  maxRows?: number;
}

export default function TableWidget({ data, maxRows = 50 }: TableWidgetProps) {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-slate-500 text-sm">
        No data available
      </div>
    );
  }

  const columns = Object.keys(data[0]);
  const rows = data.slice(0, maxRows);

  return (
    <div className="h-full overflow-auto custom-scrollbar">
      <table className="w-full text-xs">
        <thead className="sticky top-0 z-10">
          <tr className="bg-slate-800/90 backdrop-blur-sm">
            {columns.map(col => (
              <th
                key={col}
                className="text-left px-3 py-2 text-slate-300 font-semibold border-b border-slate-700/50 whitespace-nowrap"
              >
                {col.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={i}
              className="border-b border-slate-800/40 hover:bg-slate-800/30 transition-colors"
            >
              {columns.map(col => {
                const val = row[col];
                const isSeverity = col === 'severity' || col === 'priority' || col === 'risk_level';
                const severityColors: Record<string, string> = {
                  critical: 'bg-red-500/20 text-red-300',
                  high: 'bg-orange-500/20 text-orange-300',
                  medium: 'bg-yellow-500/20 text-yellow-300',
                  low: 'bg-emerald-500/20 text-emerald-300',
                };

                return (
                  <td key={col} className="px-3 py-1.5 text-slate-400 whitespace-nowrap max-w-[200px] truncate">
                    {isSeverity && severityColors[String(val).toLowerCase()] ? (
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${severityColors[String(val).toLowerCase()]}`}>
                        {String(val)}
                      </span>
                    ) : (
                      <span title={String(val ?? '')}>{String(val ?? '-')}</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {data.length > maxRows && (
        <div className="text-center py-2 text-slate-500 text-[10px]">
          Showing {maxRows} of {data.length} rows
        </div>
      )}
    </div>
  );
}
