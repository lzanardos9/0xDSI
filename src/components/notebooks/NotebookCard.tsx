import { useState } from 'react';
import { Clock, Cpu, Download, ChevronDown, ChevronUp, Tag, FileCode } from 'lucide-react';
import { DatabricksNotebook } from '../../lib/databricksNotebooks';
import { downloadNotebook } from './NotebookExportUtils';

interface NotebookCardProps {
  notebook: DatabricksNotebook;
  onSelect: (notebook: DatabricksNotebook) => void;
}

const categoryColors: Record<string, string> = {
  correlation: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  ml: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  streaming: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  'threat-intel': 'bg-red-500/10 text-red-400 border-red-500/20',
  behavioral: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
  'mock-data': 'bg-slate-500/10 text-slate-400 border-slate-500/20',
};

export default function NotebookCard({ notebook, onSelect }: NotebookCardProps) {
  const [expanded, setExpanded] = useState(false);
  const colorClass = categoryColors[notebook.category] || categoryColors['ml'];

  return (
    <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl overflow-hidden hover:border-slate-600 transition-all duration-200 group">
      <div className="p-5">
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${colorClass}`}>
                {notebook.category.replace('-', ' ')}
              </span>
              <span className="text-[10px] text-slate-500">
                {notebook.cells.length} cells
              </span>
            </div>
            <h3 className="text-sm font-semibold text-white truncate group-hover:text-blue-400 transition-colors cursor-pointer"
                onClick={() => onSelect(notebook)}>
              {notebook.title}
            </h3>
            <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">{notebook.subtitle}</p>
          </div>
        </div>

        <p className={`text-xs text-slate-500 mb-3 ${expanded ? '' : 'line-clamp-2'}`}>
          {notebook.description}
        </p>

        <div className="flex items-center gap-3 text-[10px] text-slate-500 mb-3">
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" /> {notebook.estimatedRuntime}
          </span>
          <span className="flex items-center gap-1">
            <Cpu className="w-3 h-3" /> {notebook.clusterRequirements}
          </span>
        </div>

        <div className="flex flex-wrap gap-1 mb-3">
          {notebook.tags.slice(0, expanded ? undefined : 4).map(tag => (
            <span key={tag} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-slate-700/50 text-slate-400 text-[10px] rounded">
              <Tag className="w-2.5 h-2.5" /> {tag}
            </span>
          ))}
          {!expanded && notebook.tags.length > 4 && (
            <span className="text-[10px] text-slate-500">+{notebook.tags.length - 4}</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => onSelect(notebook)}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-blue-600/20 text-blue-400 border border-blue-500/30 rounded-lg text-xs font-medium hover:bg-blue-600/30 transition-colors"
          >
            <FileCode className="w-3.5 h-3.5" /> View Notebook
          </button>
          <button
            onClick={() => downloadNotebook(notebook, 'py')}
            className="flex items-center gap-1 px-3 py-1.5 bg-slate-700/50 text-slate-300 rounded-lg text-xs hover:bg-slate-700 transition-colors"
          >
            <Download className="w-3.5 h-3.5" /> .py
          </button>
          <button
            onClick={() => downloadNotebook(notebook, 'json')}
            className="flex items-center gap-1 px-3 py-1.5 bg-slate-700/50 text-slate-300 rounded-lg text-xs hover:bg-slate-700 transition-colors"
          >
            <Download className="w-3.5 h-3.5" /> .json
          </button>
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-1.5 text-slate-500 hover:text-slate-300 transition-colors"
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}
