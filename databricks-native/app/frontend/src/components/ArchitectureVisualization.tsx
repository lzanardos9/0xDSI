import React, { useState } from 'react';
import { Network, FileText, TrendingUp, BarChart3, Layers, Box, Code } from 'lucide-react';
import Architecture3D from './Architecture3D';
import Architecture2D from './Architecture2D';
import ArchitectureDocumentation from './ArchitectureDocumentation';
import ROIBusinessValue from './ROIBusinessValue';
import SIEMMarketAnalysis from './SIEMMarketAnalysis';
import AgentCodeConfiguration from './AgentCodeConfiguration';

const ArchitectureVisualization: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'3d' | '2d' | 'documentation' | 'agents' | 'roi' | 'market'>('3d');

  return (
    <div className="h-full flex flex-col bg-slate-950">
      <div className="bg-gradient-to-r from-slate-900 via-blue-900 to-slate-900 border-b border-slate-800 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-gradient-to-br from-orange-500 to-red-600 rounded-xl">
              <Network className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white">Platform Architecture</h2>
              <p className="text-slate-400 text-sm">Comprehensive documentation of the AI-powered SOC platform</p>
            </div>
          </div>
        </div>

        <div className="flex gap-2 mt-4 border-t border-slate-800 pt-4 overflow-x-auto">
          <button
            onClick={() => setActiveTab('3d')}
            className={`px-4 py-2 rounded-lg font-medium transition-all whitespace-nowrap flex items-center gap-2 ${
              activeTab === '3d'
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/50'
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'
            }`}
          >
            <Box className="w-4 h-4" />
            3D Architecture
          </button>
          <button
            onClick={() => setActiveTab('2d')}
            className={`px-4 py-2 rounded-lg font-medium transition-all whitespace-nowrap flex items-center gap-2 ${
              activeTab === '2d'
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/50'
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'
            }`}
          >
            <Layers className="w-4 h-4" />
            2D Diagram
          </button>
          <button
            onClick={() => setActiveTab('documentation')}
            className={`px-4 py-2 rounded-lg font-medium transition-all whitespace-nowrap flex items-center gap-2 ${
              activeTab === 'documentation'
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/50'
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'
            }`}
          >
            <FileText className="w-4 h-4" />
            Technical Documentation
          </button>
          <button
            onClick={() => setActiveTab('agents')}
            className={`px-4 py-2 rounded-lg font-medium transition-all whitespace-nowrap flex items-center gap-2 ${
              activeTab === 'agents'
                ? 'bg-green-600 text-white shadow-lg shadow-green-600/50'
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'
            }`}
          >
            <Code className="w-4 h-4" />
            Agent Code & Config
          </button>
          <button
            onClick={() => setActiveTab('roi')}
            className={`px-4 py-2 rounded-lg font-medium transition-all whitespace-nowrap flex items-center gap-2 ${
              activeTab === 'roi'
                ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/50'
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'
            }`}
          >
            <TrendingUp className="w-4 h-4" />
            ROI & Business Value
          </button>
          <button
            onClick={() => setActiveTab('market')}
            className={`px-4 py-2 rounded-lg font-medium transition-all whitespace-nowrap flex items-center gap-2 ${
              activeTab === 'market'
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/50'
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            Market Analysis
          </button>
        </div>
      </div>

      <div className="flex-1 relative overflow-hidden">
        {activeTab === '3d' && (
          <div className="w-full h-full">
            <Architecture3D />
          </div>
        )}

        {activeTab === '2d' && (
          <div className="w-full h-full overflow-y-auto bg-slate-950 p-8">
            <Architecture2D />
          </div>
        )}

        {activeTab === 'documentation' && (
          <ArchitectureDocumentation />
        )}

        {activeTab === 'agents' && (
          <div className="w-full h-full">
            <AgentCodeConfiguration />
          </div>
        )}

        {activeTab === 'roi' && (
          <ROIBusinessValue />
        )}

        {activeTab === 'market' && (
          <SIEMMarketAnalysis />
        )}
      </div>
    </div>
  );
};

export default ArchitectureVisualization;
