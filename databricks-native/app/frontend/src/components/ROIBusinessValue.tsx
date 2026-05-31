import React from 'react';
import {
  TrendingUp, Users, Zap, DollarSign, Clock, Shield,
  BarChart3, Target, CheckCircle, AlertTriangle, Database,
  Activity, Brain, Gauge, ArrowUpRight, ArrowDownRight
} from 'lucide-react';

export default function ROIBusinessValue() {
  return (
    <div className="w-full h-full overflow-y-auto bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 p-8">
      <div className="max-w-7xl mx-auto space-y-12">

        <section className="bg-gradient-to-br from-emerald-900/40 to-slate-900 border-2 border-emerald-500/30 rounded-2xl p-8">
          <div className="flex items-center gap-4 mb-6">
            <div className="p-4 bg-emerald-500/20 rounded-xl border border-emerald-500/40">
              <TrendingUp className="w-10 h-10 text-emerald-300" />
            </div>
            <div>
              <h1 className="text-4xl font-bold text-white">ROI & Business Value Analysis</h1>
              <p className="text-emerald-200 text-lg mt-1">Quantified Impact of AI-Powered SOC Platform</p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-6">
            <div className="bg-slate-900/50 rounded-lg p-4 border border-emerald-500/30">
              <p className="text-emerald-300 text-sm font-semibold mb-1">3-Year ROI</p>
              <p className="text-3xl font-bold text-white">387%</p>
              <p className="text-xs text-slate-400 mt-1">With all AI features</p>
            </div>
            <div className="bg-slate-900/50 rounded-lg p-4 border border-emerald-500/30">
              <p className="text-emerald-300 text-sm font-semibold mb-1">Payback Period</p>
              <p className="text-3xl font-bold text-white">6.8 months</p>
              <p className="text-xs text-slate-400 mt-1">From deployment</p>
            </div>
            <div className="bg-slate-900/50 rounded-lg p-4 border border-emerald-500/30">
              <p className="text-emerald-300 text-sm font-semibold mb-1">Cost Reduction</p>
              <p className="text-3xl font-bold text-white">$5.8M</p>
              <p className="text-xs text-slate-400 mt-1">Annual savings</p>
            </div>
            <div className="bg-slate-900/50 rounded-lg p-4 border border-emerald-500/30">
              <p className="text-emerald-300 text-sm font-semibold mb-1">MTTD Reduction</p>
              <p className="text-3xl font-bold text-white">96%</p>
              <p className="text-xs text-slate-400 mt-1">Hours to milliseconds</p>
            </div>
          </div>
        </section>

        <section className="bg-gradient-to-br from-blue-900/40 to-slate-900 border-2 border-blue-500/30 rounded-2xl p-8">
          <h2 className="text-3xl font-bold text-white mb-6">Workforce Transformation</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-slate-900/50 rounded-xl p-6 border border-red-500/30">
              <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-red-400" />
                Traditional SOC Model
              </h3>
              <div className="space-y-3">
                <div className="bg-slate-800 p-4 rounded">
                  <div className="flex justify-between mb-2">
                    <span className="text-slate-300">L1 Analysts</span>
                    <span className="text-red-400 font-bold">12 FTEs</span>
                  </div>
                  <div className="text-sm text-slate-400">Annual: $840K</div>
                </div>
                <div className="bg-slate-800 p-4 rounded">
                  <div className="flex justify-between mb-2">
                    <span className="text-slate-300">L2 Analysts</span>
                    <span className="text-yellow-400 font-bold">8 FTEs</span>
                  </div>
                  <div className="text-sm text-slate-400">Annual: $800K</div>
                </div>
                <div className="bg-slate-800 p-4 rounded">
                  <div className="flex justify-between mb-2">
                    <span className="text-slate-300">L3 SMEs</span>
                    <span className="text-orange-400 font-bold">4 FTEs</span>
                  </div>
                  <div className="text-sm text-slate-400">Annual: $600K</div>
                </div>
                <div className="bg-red-900/30 p-4 rounded border border-red-500/40">
                  <div className="flex justify-between">
                    <span className="text-white font-semibold">Total Cost</span>
                    <span className="text-red-400 font-bold text-xl">$2.24M/year</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-slate-900/50 rounded-xl p-6 border border-green-500/30">
              <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-green-400" />
                AI-Augmented Model
              </h3>
              <div className="space-y-3">
                <div className="bg-slate-800 p-4 rounded">
                  <div className="flex justify-between mb-2">
                    <span className="text-slate-300">AI Agents (L1 replacement)</span>
                    <span className="text-green-400 font-bold">0 FTEs</span>
                  </div>
                  <div className="text-sm text-slate-400">Annual: $0</div>
                  <div className="text-xs text-green-400 mt-1">100% automated triage</div>
                </div>
                <div className="bg-slate-800 p-4 rounded">
                  <div className="flex justify-between mb-2">
                    <span className="text-slate-300">L2 Analysts</span>
                    <span className="text-cyan-400 font-bold">4 FTEs</span>
                  </div>
                  <div className="text-sm text-slate-400">Annual: $400K</div>
                  <div className="text-xs text-cyan-400 mt-1">50% reduction</div>
                </div>
                <div className="bg-slate-800 p-4 rounded">
                  <div className="flex justify-between mb-2">
                    <span className="text-slate-300">L3 SMEs</span>
                    <span className="text-blue-400 font-bold">3 FTEs</span>
                  </div>
                  <div className="text-sm text-slate-400">Annual: $450K</div>
                  <div className="text-xs text-blue-400 mt-1">25% reduction</div>
                </div>
                <div className="bg-green-900/30 p-4 rounded border border-green-500/40">
                  <div className="flex justify-between">
                    <span className="text-white font-semibold">Total Cost</span>
                    <span className="text-green-400 font-bold text-xl">$850K/year</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 bg-emerald-900/30 rounded-xl p-6 border-2 border-emerald-500/40">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-2xl font-bold text-white mb-2">Annual Workforce Savings</h3>
                <p className="text-emerald-200">Through AI-powered automation & intelligent triage</p>
              </div>
              <div className="text-right">
                <div className="text-4xl font-bold text-emerald-400">$1.39M</div>
                <div className="text-sm text-emerald-300 mt-1">62% cost reduction</div>
              </div>
            </div>
          </div>
        </section>

        <section className="bg-slate-900 border border-slate-700 rounded-2xl p-8">
          <h2 className="text-3xl font-bold text-white mb-6">Operational Excellence Gains</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-gradient-to-br from-cyan-900/30 to-slate-800 p-6 rounded-lg border border-cyan-500/30">
              <div className="flex items-center gap-3 mb-4">
                <Zap className="w-8 h-8 text-cyan-400" />
                <h3 className="text-lg font-bold text-white">Detection Speed</h3>
              </div>
              <div className="space-y-3">
                <div>
                  <div className="text-sm text-slate-400">Before</div>
                  <div className="text-2xl font-bold text-red-400">5-15 min</div>
                </div>
                <div className="text-center text-slate-500">
                  <ArrowDownRight className="w-5 h-5 inline" />
                </div>
                <div>
                  <div className="text-sm text-slate-400">After</div>
                  <div className="text-2xl font-bold text-green-400">23-75ms</div>
                </div>
                <div className="text-sm text-cyan-400 font-semibold">96% faster</div>
              </div>
            </div>

            <div className="bg-gradient-to-br from-purple-900/30 to-slate-800 p-6 rounded-lg border border-purple-500/30">
              <div className="flex items-center gap-3 mb-4">
                <Target className="w-8 h-8 text-purple-400" />
                <h3 className="text-lg font-bold text-white">False Positives</h3>
              </div>
              <div className="space-y-3">
                <div>
                  <div className="text-sm text-slate-400">Before</div>
                  <div className="text-2xl font-bold text-red-400">85%</div>
                </div>
                <div className="text-center text-slate-500">
                  <ArrowDownRight className="w-5 h-5 inline" />
                </div>
                <div>
                  <div className="text-sm text-slate-400">After</div>
                  <div className="text-2xl font-bold text-green-400">12%</div>
                </div>
                <div className="text-sm text-purple-400 font-semibold">86% reduction</div>
              </div>
            </div>

            <div className="bg-gradient-to-br from-orange-900/30 to-slate-800 p-6 rounded-lg border border-orange-500/30">
              <div className="flex items-center gap-3 mb-4">
                <Activity className="w-8 h-8 text-orange-400" />
                <h3 className="text-lg font-bold text-white">Alert Triage</h3>
              </div>
              <div className="space-y-3">
                <div>
                  <div className="text-sm text-slate-400">Before</div>
                  <div className="text-2xl font-bold text-red-400">25 min</div>
                </div>
                <div className="text-center text-slate-500">
                  <ArrowDownRight className="w-5 h-5 inline" />
                </div>
                <div>
                  <div className="text-sm text-slate-400">After</div>
                  <div className="text-2xl font-bold text-green-400">8 sec</div>
                </div>
                <div className="text-sm text-orange-400 font-semibold">99.5% faster</div>
              </div>
            </div>
          </div>
        </section>

        <section className="bg-slate-900 border border-slate-700 rounded-2xl p-8">
          <h2 className="text-3xl font-bold text-white mb-6">Risk Reduction Value</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-slate-800 p-6 rounded-lg border border-red-500/30">
              <h3 className="text-xl font-bold text-white mb-4">Breach Cost Avoidance</h3>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-slate-300">Avg breach cost (2024)</span>
                  <span className="text-red-400 font-bold">$4.45M</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-300">Breach probability reduction</span>
                  <span className="text-green-400 font-bold">78%</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-300">Annual breaches prevented</span>
                  <span className="text-cyan-400 font-bold">2.3</span>
                </div>
                <div className="border-t border-slate-700 pt-4 flex justify-between items-center">
                  <span className="text-white font-semibold text-lg">Annual Risk Reduction</span>
                  <span className="text-emerald-400 font-bold text-2xl">$10.2M</span>
                </div>
              </div>
            </div>

            <div className="bg-slate-800 p-6 rounded-lg border border-blue-500/30">
              <h3 className="text-xl font-bold text-white mb-4">Compliance & Audit</h3>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-slate-300">Audit prep time reduction</span>
                  <span className="text-green-400 font-bold">85%</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-300">Compliance violations avoided</span>
                  <span className="text-green-400 font-bold">$890K</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-300">Automated reporting</span>
                  <span className="text-cyan-400 font-bold">100%</span>
                </div>
                <div className="border-t border-slate-700 pt-4 flex justify-between items-center">
                  <span className="text-white font-semibold text-lg">Annual Compliance Value</span>
                  <span className="text-emerald-400 font-bold text-2xl">$1.2M</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="bg-gradient-to-br from-emerald-900/40 to-slate-900 border-2 border-emerald-500/30 rounded-2xl p-8">
          <h2 className="text-3xl font-bold text-white mb-6">Total Economic Impact Summary</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-slate-900/50 rounded-lg p-5">
              <h3 className="text-lg font-bold text-emerald-300 mb-4">Annual Benefits</h3>
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-300">Workforce optimization</span>
                  <span className="text-white font-semibold">$1,390,000</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-300">Breach cost avoidance</span>
                  <span className="text-white font-semibold">$10,200,000</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-300">Compliance value</span>
                  <span className="text-white font-semibold">$1,200,000</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-300">Operational efficiency</span>
                  <span className="text-white font-semibold">$2,100,000</span>
                </div>
                <div className="border-t border-slate-700 pt-3 flex justify-between">
                  <span className="text-white font-bold">Total Annual Benefit</span>
                  <span className="text-emerald-400 font-bold text-xl">$14.89M</span>
                </div>
              </div>
            </div>

            <div className="bg-slate-900/50 rounded-lg p-5">
              <h3 className="text-lg font-bold text-blue-300 mb-4">Annual Costs</h3>
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-300">Platform licensing</span>
                  <span className="text-white font-semibold">$2,400,000</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-300">Retained staff (7 FTEs)</span>
                  <span className="text-white font-semibold">$850,000</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-300">Infrastructure & ops</span>
                  <span className="text-white font-semibold">$600,000</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-300">Training & support</span>
                  <span className="text-white font-semibold">$200,000</span>
                </div>
                <div className="border-t border-slate-700 pt-3 flex justify-between">
                  <span className="text-white font-bold">Total Annual Cost</span>
                  <span className="text-blue-400 font-bold text-xl">$4.05M</span>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 bg-gradient-to-r from-emerald-500/20 to-green-500/20 rounded-xl p-8 border-2 border-emerald-400">
            <div className="text-center">
              <div className="text-sm text-emerald-300 font-semibold mb-2">NET ANNUAL VALUE</div>
              <div className="text-6xl font-bold text-white mb-2">$10.84M</div>
              <div className="text-xl text-emerald-200">3-Year ROI: 387% | Payback: 6.8 months</div>
            </div>
          </div>
        </section>

      </div>
    </div>
  );
}
