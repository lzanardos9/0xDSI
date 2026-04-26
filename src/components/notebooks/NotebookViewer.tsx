import { useState } from 'react';
import { ArrowLeft, Download, Copy, Check, FileCode, Database, BookOpen, Clock, Cpu, Tag } from 'lucide-react';
import { DatabricksNotebook, NotebookCell } from '../../lib/databricksNotebooks';
import { downloadNotebook } from './NotebookExportUtils';

interface NotebookViewerProps {
  notebook: DatabricksNotebook;
  onBack: () => void;
}

const cellTypeConfig = {
  markdown: { label: 'Markdown', icon: BookOpen, color: 'text-blue-400 bg-blue-500/10 border-blue-500/30' },
  code: { label: 'Python', icon: FileCode, color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' },
  sql: { label: 'SQL', icon: Database, color: 'text-amber-400 bg-amber-500/10 border-amber-500/30' },
};

function CellRenderer({ cell, index }: { cell: NotebookCell; index: number }) {
  const [copied, setCopied] = useState(false);
  const config = cellTypeConfig[cell.type];

  const handleCopy = () => {
    navigator.clipboard.writeText(cell.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="border border-slate-700/50 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 bg-slate-800/80 border-b border-slate-700/50">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-slate-600 font-mono">
            [{index + 1}]
          </span>
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded border ${config.color}`}>
            <config.icon className="w-3 h-3" />
            {config.label}
          </span>
        </div>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 px-2 py-0.5 text-[10px] text-slate-500 hover:text-slate-300 transition-colors"
        >
          {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <div className="p-4 bg-slate-900/50 overflow-x-auto">
        {cell.type === 'markdown' ? (
          <div className="prose prose-invert prose-sm max-w-none">
            <pre className="whitespace-pre-wrap text-xs text-slate-300 font-sans leading-relaxed">
              {cell.content}
            </pre>
          </div>
        ) : (
          <pre className="text-xs text-slate-300 font-mono leading-relaxed whitespace-pre-wrap">
            <code>{cell.content}</code>
          </pre>
        )}
      </div>
    </div>
  );
}

export default function NotebookViewer({ notebook, onBack }: NotebookViewerProps) {
  const categoryColors: Record<string, string> = {
    correlation: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    ml: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    streaming: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    'threat-intel': 'bg-red-500/10 text-red-400 border-red-500/20',
    behavioral: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
    'mock-data': 'bg-slate-500/10 text-slate-400 border-slate-500/20',
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="flex items-center gap-2 px-3 py-1.5 text-sm text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Notebooks
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={() => downloadNotebook(notebook, 'py')}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 rounded-lg text-xs font-medium hover:bg-emerald-600/30 transition-colors"
          >
            <Download className="w-3.5 h-3.5" /> Download .py
          </button>
          <button
            onClick={() => downloadNotebook(notebook, 'ipynb')}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600/20 text-blue-400 border border-blue-500/30 rounded-lg text-xs font-medium hover:bg-blue-600/30 transition-colors"
          >
            <Download className="w-3.5 h-3.5" /> Download .ipynb
          </button>
        </div>
      </div>

      <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-6">
        <div className="flex items-center gap-2 mb-2">
          <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${categoryColors[notebook.category] || ''}`}>
            {notebook.category.replace('-', ' ')}
          </span>
        </div>
        <h2 className="text-xl font-bold text-white mb-1">{notebook.title}</h2>
        <p className="text-sm text-slate-400 mb-4">{notebook.subtitle}</p>
        <p className="text-xs text-slate-500 mb-4">{notebook.description}</p>
        <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500">
          <span className="flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" /> {notebook.estimatedRuntime}
          </span>
          <span className="flex items-center gap-1">
            <Cpu className="w-3.5 h-3.5" /> {notebook.clusterRequirements}
          </span>
          <span className="flex items-center gap-1">
            <FileCode className="w-3.5 h-3.5" /> {notebook.cells.length} cells
          </span>
        </div>
        <div className="flex flex-wrap gap-1 mt-3">
          {notebook.tags.map(tag => (
            <span key={tag} className="inline-flex items-center gap-0.5 px-2 py-0.5 bg-slate-700/50 text-slate-400 text-[10px] rounded">
              <Tag className="w-2.5 h-2.5" /> {tag}
            </span>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        {notebook.cells.map((cell, index) => (
          <CellRenderer key={index} cell={cell} index={index} />
        ))}
      </div>
    </div>
  );
}
