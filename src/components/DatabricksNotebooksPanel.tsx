import { useState, useMemo } from 'react';
import {
  Brain, Zap, Shield, Users, Database, Layers, Search,
  Download, GitBranch, BookOpen, BarChart3, ArrowDownToLine,
} from 'lucide-react';
import { getNotebookCategories } from '../lib/databricksNotebooks';
import { allNotebooks } from '../lib/notebooks';
import { downloadAllNotebooks } from './notebooks/NotebookExportUtils';
import NotebookCard from './notebooks/NotebookCard';
import NotebookViewer from './notebooks/NotebookViewer';
import type { DatabricksNotebook } from '../lib/databricksNotebooks';

const iconMap: Record<string, typeof Brain> = {
  Layers, GitBranch, Brain, Zap, Shield, Users, Database,
};

export default function DatabricksNotebooksPanel() {
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedNotebook, setSelectedNotebook] = useState<DatabricksNotebook | null>(null);

  const categories = useMemo(() => getNotebookCategories(allNotebooks), []);

  const filteredNotebooks = useMemo(() => {
    let filtered = allNotebooks;
    if (selectedCategory !== 'all') {
      filtered = filtered.filter(n => n.category === selectedCategory);
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(n =>
        n.title.toLowerCase().includes(q) ||
        n.subtitle.toLowerCase().includes(q) ||
        n.tags.some(t => t.toLowerCase().includes(q)) ||
        n.description.toLowerCase().includes(q)
      );
    }
    return filtered;
  }, [selectedCategory, searchQuery]);

  if (selectedNotebook) {
    return (
      <div className="p-6">
        <NotebookViewer
          notebook={selectedNotebook}
          onBack={() => setSelectedNotebook(null)}
        />
      </div>
    );
  }

  const totalCells = allNotebooks.reduce((sum, n) => sum + n.cells.length, 0);
  const totalRuntime = allNotebooks.reduce((sum, n) => {
    const mins = parseInt(n.estimatedRuntime) || 0;
    return sum + mins;
  }, 0);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2.5 bg-gradient-to-br from-orange-500 to-red-600 rounded-xl">
              <BookOpen className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Databricks Solution Accelerator Notebooks</h1>
              <p className="text-sm text-slate-400">Production-ready security analytics notebooks for Databricks</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => downloadAllNotebooks(allNotebooks, 'py')}
            className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 rounded-lg text-sm font-medium hover:bg-emerald-600/30 transition-colors"
          >
            <ArrowDownToLine className="w-4 h-4" /> Download All (.py)
          </button>
          <button
            onClick={() => downloadAllNotebooks(allNotebooks, 'json')}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600/20 text-blue-400 border border-blue-500/30 rounded-lg text-sm font-medium hover:bg-blue-600/30 transition-colors"
          >
            <ArrowDownToLine className="w-4 h-4" /> Download All (.json)
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Total Notebooks', value: allNotebooks.length, icon: BookOpen, color: 'from-blue-500 to-cyan-500' },
          { label: 'Total Cells', value: totalCells, icon: BarChart3, color: 'from-emerald-500 to-teal-500' },
          { label: 'Categories', value: categories.length - 1, icon: Layers, color: 'from-amber-500 to-orange-500' },
          { label: 'Est. Total Runtime', value: `${totalRuntime}m`, icon: Zap, color: 'from-red-500 to-rose-500' },
        ].map(stat => (
          <div key={stat.label} className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-slate-500">{stat.label}</span>
              <div className={`p-1.5 bg-gradient-to-br ${stat.color} rounded-lg`}>
                <stat.icon className="w-3.5 h-3.5 text-white" />
              </div>
            </div>
            <div className="text-2xl font-bold text-white">{stat.value}</div>
          </div>
        ))}
      </div>

      {/* Search & Filter */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search notebooks by name, tag, or description..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        <div className="text-xs text-slate-500">
          {filteredNotebooks.length} notebook{filteredNotebooks.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Category Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {categories.map(cat => {
          const IconComp = iconMap[cat.icon] || Layers;
          const isActive = selectedCategory === cat.id;
          return (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                isActive
                  ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                  : 'bg-slate-800/60 text-slate-400 border border-slate-700/50 hover:border-slate-600 hover:text-slate-300'
              }`}
            >
              <IconComp className="w-3.5 h-3.5" />
              {cat.label}
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${
                isActive ? 'bg-blue-500/20 text-blue-400' : 'bg-slate-700/50 text-slate-500'
              }`}>
                {cat.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Notebook Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filteredNotebooks.map(notebook => (
          <NotebookCard
            key={notebook.id}
            notebook={notebook}
            onSelect={setSelectedNotebook}
          />
        ))}
      </div>

      {filteredNotebooks.length === 0 && (
        <div className="text-center py-16">
          <Database className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-500 text-sm">No notebooks match your search criteria</p>
        </div>
      )}

      {/* Databricks Logo */}
      <div className="flex items-center justify-center gap-3 pt-4 border-t border-slate-800">
        <img src="/dbricks.png" alt="Databricks" className="h-6 opacity-40" />
        <span className="text-xs text-slate-600">Powered by Databricks Solution Accelerators</span>
      </div>
    </div>
  );
}
