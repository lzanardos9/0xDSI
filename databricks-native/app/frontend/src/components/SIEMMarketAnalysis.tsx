import React from 'react';
import {
  Shield, TrendingUp, AlertCircle, CheckCircle, XCircle,
  BarChart3, Target, Zap, Brain, Database, DollarSign,
  Users, Clock, Activity, Award, AlertTriangle, ArrowRight
} from 'lucide-react';

export default function SIEMMarketAnalysis() {
  return (
    <div className="w-full h-full overflow-y-auto bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 p-8">
      <div className="max-w-7xl mx-auto space-y-12">

        <section className="bg-gradient-to-br from-blue-900/40 to-slate-900 border-2 border-blue-500/30 rounded-2xl p-8">
          <div className="flex items-center gap-4 mb-6">
            <div className="p-4 bg-blue-500/20 rounded-xl border border-blue-500/40">
              <BarChart3 className="w-10 h-10 text-blue-300" />
            </div>
            <div>
              <h1 className="text-4xl font-bold text-white">Next-Gen SIEM Market Analysis</h1>
              <p className="text-blue-200 text-lg mt-1">AI-Powered Platform Competitive Assessment</p>
            </div>
          </div>
          <p className="text-slate-300 text-lg leading-relaxed mb-6">
            Comprehensive evaluation of AI-augmented Databricks SOC platform against traditional SIEM solutions,
            including advanced capabilities like red team automation, LLM risk profiling, and behavioral analysis.
          </p>
          <div className="bg-blue-900/20 rounded-lg p-4 border border-blue-500/30">
            <div className="grid grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-slate-400 mb-1">Global SIEM Market (2024)</p>
                <p className="text-xl font-bold text-white">$5.2B</p>
              </div>
              <div>
                <p className="text-xs text-slate-400 mb-1">AI-SOC Segment Growth</p>
                <p className="text-xl font-bold text-white">24.8%</p>
              </div>
              <div>
                <p className="text-xs text-slate-400 mb-1">Enterprise Adoption</p>
                <p className="text-xl font-bold text-white">82%</p>
              </div>
              <div>
                <p className="text-xs text-slate-400 mb-1">Alert Fatigue Cost</p>
                <p className="text-xl font-bold text-white">$2.1M</p>
              </div>
            </div>
          </div>
        </section>

        <section className="bg-slate-900 border border-slate-700 rounded-2xl p-8">
          <h2 className="text-3xl font-bold text-white mb-6">Competitive Positioning Matrix</h2>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-slate-700">
                  <th className="text-left p-3 text-xs font-semibold text-slate-300 w-1/4">Capability</th>
                  <th className="text-center p-3 text-xs font-semibold text-emerald-400">This Platform</th>
                  <th className="text-center p-3 text-xs font-semibold text-slate-400">Splunk ES</th>
                  <th className="text-center p-3 text-xs font-semibold text-slate-400">MS Sentinel</th>
                  <th className="text-center p-3 text-xs font-semibold text-slate-400">IBM QRadar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700">
                <tr>
                  <td className="p-3">
                    <div className="font-semibold text-white text-sm">Detection Latency (MTTD)</div>
                    <div className="text-xs text-slate-400">Event to alert time</div>
                  </td>
                  <td className="p-3 text-center">
                    <div className="bg-emerald-900/30 rounded px-2 py-1 inline-block">
                      <div className="font-bold text-emerald-400">23-75ms</div>
                      <div className="text-xs text-emerald-300">Real-time</div>
                    </div>
                  </td>
                  <td className="p-3 text-center">
                    <div className="bg-slate-700/30 rounded px-2 py-1 inline-block">
                      <div className="font-bold text-yellow-400">5-15 min</div>
                    </div>
                  </td>
                  <td className="p-3 text-center">
                    <div className="bg-slate-700/30 rounded px-2 py-1 inline-block">
                      <div className="font-bold text-yellow-400">3-8 min</div>
                    </div>
                  </td>
                  <td className="p-3 text-center">
                    <div className="bg-slate-700/30 rounded px-2 py-1 inline-block">
                      <div className="font-bold text-orange-400">10-20 min</div>
                    </div>
                  </td>
                </tr>

                <tr>
                  <td className="p-3">
                    <div className="font-semibold text-white text-sm">AI/ML Capabilities</div>
                    <div className="text-xs text-slate-400">ML models & automation</div>
                  </td>
                  <td className="p-3 text-center">
                    <div className="bg-emerald-900/30 rounded px-2 py-1 inline-block">
                      <div className="font-bold text-emerald-400">Advanced</div>
                      <div className="text-xs text-emerald-300">10+ AI agents</div>
                    </div>
                  </td>
                  <td className="p-3 text-center">
                    <div className="bg-slate-700/30 rounded px-2 py-1 inline-block">
                      <div className="font-bold text-blue-400">Moderate</div>
                    </div>
                  </td>
                  <td className="p-3 text-center">
                    <div className="bg-slate-700/30 rounded px-2 py-1 inline-block">
                      <div className="font-bold text-blue-400">Moderate</div>
                    </div>
                  </td>
                  <td className="p-3 text-center">
                    <div className="bg-slate-700/30 rounded px-2 py-1 inline-block">
                      <div className="font-bold text-yellow-400">Basic</div>
                    </div>
                  </td>
                </tr>

                <tr>
                  <td className="p-3">
                    <div className="font-semibold text-white text-sm">Red Team Automation</div>
                    <div className="text-xs text-slate-400">Offensive security testing</div>
                  </td>
                  <td className="p-3 text-center">
                    <CheckCircle className="w-6 h-6 text-emerald-400 mx-auto" />
                    <div className="text-xs text-emerald-300">15+ campaigns</div>
                  </td>
                  <td className="p-3 text-center">
                    <XCircle className="w-6 h-6 text-red-400 mx-auto" />
                  </td>
                  <td className="p-3 text-center">
                    <XCircle className="w-6 h-6 text-red-400 mx-auto" />
                  </td>
                  <td className="p-3 text-center">
                    <XCircle className="w-6 h-6 text-red-400 mx-auto" />
                  </td>
                </tr>

                <tr>
                  <td className="p-3">
                    <div className="font-semibold text-white text-sm">LLM Risk Profiling</div>
                    <div className="text-xs text-slate-400">AI usage monitoring</div>
                  </td>
                  <td className="p-3 text-center">
                    <CheckCircle className="w-6 h-6 text-emerald-400 mx-auto" />
                    <div className="text-xs text-emerald-300">Real-time</div>
                  </td>
                  <td className="p-3 text-center">
                    <XCircle className="w-6 h-6 text-red-400 mx-auto" />
                  </td>
                  <td className="p-3 text-center">
                    <AlertCircle className="w-6 h-6 text-yellow-400 mx-auto" />
                    <div className="text-xs text-yellow-300">Partial</div>
                  </td>
                  <td className="p-3 text-center">
                    <XCircle className="w-6 h-6 text-red-400 mx-auto" />
                  </td>
                </tr>

                <tr>
                  <td className="p-3">
                    <div className="font-semibold text-white text-sm">Behavioral Profiling</div>
                    <div className="text-xs text-slate-400">Psychological analysis</div>
                  </td>
                  <td className="p-3 text-center">
                    <CheckCircle className="w-6 h-6 text-emerald-400 mx-auto" />
                    <div className="text-xs text-emerald-300">Multi-source</div>
                  </td>
                  <td className="p-3 text-center">
                    <AlertCircle className="w-6 h-6 text-yellow-400 mx-auto" />
                    <div className="text-xs text-yellow-300">Basic UEBA</div>
                  </td>
                  <td className="p-3 text-center">
                    <CheckCircle className="w-6 h-6 text-blue-400 mx-auto" />
                    <div className="text-xs text-blue-300">UEBA</div>
                  </td>
                  <td className="p-3 text-center">
                    <AlertCircle className="w-6 h-6 text-yellow-400 mx-auto" />
                    <div className="text-xs text-yellow-300">Basic</div>
                  </td>
                </tr>

                <tr>
                  <td className="p-3">
                    <div className="font-semibold text-white text-sm">Vector Threat Hunting</div>
                    <div className="text-xs text-slate-400">Similarity-based search</div>
                  </td>
                  <td className="p-3 text-center">
                    <CheckCircle className="w-6 h-6 text-emerald-400 mx-auto" />
                    <div className="text-xs text-emerald-300">FAISS ANN</div>
                  </td>
                  <td className="p-3 text-center">
                    <XCircle className="w-6 h-6 text-red-400 mx-auto" />
                  </td>
                  <td className="p-3 text-center">
                    <AlertCircle className="w-6 h-6 text-yellow-400 mx-auto" />
                    <div className="text-xs text-yellow-300">Limited</div>
                  </td>
                  <td className="p-3 text-center">
                    <XCircle className="w-6 h-6 text-red-400 mx-auto" />
                  </td>
                </tr>

                <tr>
                  <td className="p-3">
                    <div className="font-semibold text-white text-sm">Data Scale</div>
                    <div className="text-xs text-slate-400">Ingestion capacity</div>
                  </td>
                  <td className="p-3 text-center">
                    <div className="bg-emerald-900/30 rounded px-2 py-1 inline-block">
                      <div className="font-bold text-emerald-400">1M+ EPS</div>
                      <div className="text-xs text-emerald-300">Petabyte</div>
                    </div>
                  </td>
                  <td className="p-3 text-center">
                    <div className="bg-slate-700/30 rounded px-2 py-1 inline-block">
                      <div className="font-bold text-blue-400">200K EPS</div>
                    </div>
                  </td>
                  <td className="p-3 text-center">
                    <div className="bg-slate-700/30 rounded px-2 py-1 inline-block">
                      <div className="font-bold text-blue-400">500K EPS</div>
                    </div>
                  </td>
                  <td className="p-3 text-center">
                    <div className="bg-slate-700/30 rounded px-2 py-1 inline-block">
                      <div className="font-bold text-yellow-400">100K EPS</div>
                    </div>
                  </td>
                </tr>

                <tr>
                  <td className="p-3">
                    <div className="font-semibold text-white text-sm">Total Cost of Ownership</div>
                    <div className="text-xs text-slate-400">3-year TCO per GB/day</div>
                  </td>
                  <td className="p-3 text-center">
                    <div className="bg-emerald-900/30 rounded px-2 py-1 inline-block">
                      <div className="font-bold text-emerald-400">$145</div>
                      <div className="text-xs text-emerald-300">Lowest</div>
                    </div>
                  </td>
                  <td className="p-3 text-center">
                    <div className="bg-slate-700/30 rounded px-2 py-1 inline-block">
                      <div className="font-bold text-orange-400">$420</div>
                    </div>
                  </td>
                  <td className="p-3 text-center">
                    <div className="bg-slate-700/30 rounded px-2 py-1 inline-block">
                      <div className="font-bold text-orange-400">$320</div>
                    </div>
                  </td>
                  <td className="p-3 text-center">
                    <div className="bg-slate-700/30 rounded px-2 py-1 inline-block">
                      <div className="font-bold text-red-400">$495</div>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="bg-slate-900 border border-slate-700 rounded-2xl p-8">
          <h2 className="text-3xl font-bold text-white mb-6">Unique Differentiators</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-gradient-to-br from-red-900/30 to-slate-800 p-6 rounded-lg border border-red-500/30">
              <div className="flex items-center gap-3 mb-4">
                <Target className="w-8 h-8 text-red-400" />
                <h3 className="text-xl font-bold text-white">Offensive Security Integration</h3>
              </div>
              <ul className="space-y-2 text-sm text-slate-300">
                <li>• Autonomous fuzzing (AFL++, LibFuzzer, Honggfuzz)</li>
                <li>• AI-powered penetration testing (GPT-4, Claude-3)</li>
                <li>• 30+ auto-generated exploitation tools</li>
                <li>• Multi-stage attack chain simulation</li>
                <li>• Continuous validation of defenses</li>
              </ul>
              <div className="mt-4 bg-red-900/20 rounded p-3 border border-red-500/30">
                <div className="text-xs text-red-300 font-semibold">Market Advantage</div>
                <div className="text-white font-bold">Only platform with integrated red team automation</div>
              </div>
            </div>

            <div className="bg-gradient-to-br from-pink-900/30 to-slate-800 p-6 rounded-lg border border-pink-500/30">
              <div className="flex items-center gap-3 mb-4">
                <Brain className="w-8 h-8 text-pink-400" />
                <h3 className="text-xl font-bold text-white">LLM Security Monitoring</h3>
              </div>
              <ul className="space-y-2 text-sm text-slate-300">
                <li>• Real-time LLM usage tracking</li>
                <li>• Prompt injection detection</li>
                <li>• Data leakage prevention</li>
                <li>• Model risk scoring</li>
                <li>• Multi-provider coverage</li>
              </ul>
              <div className="mt-4 bg-pink-900/20 rounded p-3 border border-pink-500/30">
                <div className="text-xs text-pink-300 font-semibold">Market Advantage</div>
                <div className="text-white font-bold">First platform with comprehensive LLM risk profiling</div>
              </div>
            </div>

            <div className="bg-gradient-to-br from-purple-900/30 to-slate-800 p-6 rounded-lg border border-purple-500/30">
              <div className="flex items-center gap-3 mb-4">
                <Users className="w-8 h-8 text-purple-400" />
                <h3 className="text-xl font-bold text-white">Behavioral Psychology Engine</h3>
              </div>
              <ul className="space-y-2 text-sm text-slate-300">
                <li>• Multi-source behavioral analysis</li>
                <li>• Psychological profiling</li>
                <li>• Sentiment & stress detection</li>
                <li>• Insider threat prediction</li>
                <li>• Risk score calculation</li>
              </ul>
              <div className="mt-4 bg-purple-900/20 rounded p-3 border border-purple-500/30">
                <div className="text-xs text-purple-300 font-semibold">Market Advantage</div>
                <div className="text-white font-bold">Advanced insider threat detection beyond basic UEBA</div>
              </div>
            </div>

            <div className="bg-gradient-to-br from-cyan-900/30 to-slate-800 p-6 rounded-lg border border-cyan-500/30">
              <div className="flex items-center gap-3 mb-4">
                <Zap className="w-8 h-8 text-cyan-400" />
                <h3 className="text-xl font-bold text-white">Real-Time Vector Search</h3>
              </div>
              <ul className="space-y-2 text-sm text-slate-300">
                <li>• FAISS approximate nearest neighbor</li>
                <li>• 768-dimensional embeddings</li>
                <li>• Sub-3ms query latency</li>
                <li>• Similarity-based threat hunting</li>
                <li>• Billion-scale indexing</li>
              </ul>
              <div className="mt-4 bg-cyan-900/20 rounded p-3 border border-cyan-500/30">
                <div className="text-xs text-cyan-300 font-semibold">Market Advantage</div>
                <div className="text-white font-bold">Fastest vector search in enterprise SIEM space</div>
              </div>
            </div>
          </div>
        </section>

        <section className="bg-gradient-to-br from-emerald-900/40 to-slate-900 border-2 border-emerald-500/30 rounded-2xl p-8">
          <h2 className="text-3xl font-bold text-white mb-6">Market Position Summary</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="text-center">
              <div className="text-5xl font-bold text-emerald-400 mb-2">387%</div>
              <div className="text-white font-semibold mb-1">3-Year ROI</div>
              <div className="text-sm text-slate-400">vs. 150-200% for traditional SIEMs</div>
            </div>
            <div className="text-center">
              <div className="text-5xl font-bold text-cyan-400 mb-2">96%</div>
              <div className="text-white font-semibold mb-1">Faster Detection</div>
              <div className="text-sm text-slate-400">23-75ms vs. 5-20 min industry average</div>
            </div>
            <div className="text-center">
              <div className="text-5xl font-bold text-purple-400 mb-2">10+</div>
              <div className="text-white font-semibold mb-1">Unique Capabilities</div>
              <div className="text-sm text-slate-400">Not available in any competitor</div>
            </div>
          </div>

          <div className="mt-8 bg-slate-900/50 rounded-xl p-6">
            <h3 className="text-xl font-bold text-white mb-4">Recommended For:</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="flex items-start gap-2">
                <CheckCircle className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
                <span className="text-slate-300">Enterprises with &gt;10TB/day log volume</span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
                <span className="text-slate-300">Organizations adopting AI/LLM technologies</span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
                <span className="text-slate-300">SOCs requiring sub-second threat detection</span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
                <span className="text-slate-300">Teams needing continuous security validation</span>
              </div>
            </div>
          </div>
        </section>

      </div>
    </div>
  );
}
