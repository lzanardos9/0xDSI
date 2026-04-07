import { useState, useEffect } from 'react';
import { Calculator, TrendingUp, Shield, Server, AlertTriangle, Settings, X, Plus, Users, Brain } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { ThreatEscalationEngine, ThreatEscalationInput } from '../lib/threatEscalation';

const ThreatEscalationPanel = () => {
  const [activeTab, setActiveTab] = useState<'calculator' | 'assets' | 'formula' | 'userrisk'>('calculator');
  const [calculation, setCalculation] = useState<any>(null);
  const [assets, setAssets] = useState<any[]>([]);
  const [formulas, setFormulas] = useState<any[]>([]);
  const [showCalculator, setShowCalculator] = useState(false);

  const [calcInput, setCalcInput] = useState<ThreatEscalationInput>({
    initialSeverity: 'medium',
    targetAssetIp: '',
    sourceIp: '',
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const [assetsRes, formulasRes] = await Promise.all([
      supabase.from('asset_registry').select('*').eq('is_active', true).limit(20),
      supabase.from('threat_escalation_formulas').select('*'),
    ]);

    setAssets(assetsRes.data || []);
    setFormulas(formulasRes.data || []);
  };

  const handleCalculate = async () => {
    const result = await ThreatEscalationEngine.calculateAndStore(
      `event-${Date.now()}`,
      calcInput,
      supabase
    );
    setCalculation(result);
  };

  return (
    <div className="space-y-6">
      <div className="bg-slate-900/50 backdrop-blur-lg rounded-xl border border-slate-800 p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-semibold text-white flex items-center space-x-2">
              <Calculator className="w-6 h-6 text-green-500" />
              <span>Threat Escalation Engine</span>
            </h2>
            <p className="text-slate-400 text-sm mt-1">
              Priority = Severity × MCR × ThreatWeight × AssetCriticality
            </p>
          </div>
          <button
            onClick={() => setShowCalculator(true)}
            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition-colors flex items-center space-x-2"
          >
            <Calculator className="w-5 h-5" />
            <span>Calculate Priority</span>
          </button>
        </div>

        <div className="flex space-x-2 mb-6 border-b border-slate-800">
          <button
            onClick={() => setActiveTab('calculator')}
            className={`px-4 py-2 transition-colors ${
              activeTab === 'calculator'
                ? 'text-green-400 border-b-2 border-green-400'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Live Calculator
          </button>
          <button
            onClick={() => setActiveTab('assets')}
            className={`px-4 py-2 transition-colors ${
              activeTab === 'assets'
                ? 'text-green-400 border-b-2 border-green-400'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Asset Registry ({assets.length})
          </button>
          <button
            onClick={() => setActiveTab('formula')}
            className={`px-4 py-2 transition-colors ${
              activeTab === 'formula'
                ? 'text-green-400 border-b-2 border-green-400'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Formula Config
          </button>
          <button
            onClick={() => setActiveTab('userrisk')}
            className={`px-4 py-2 transition-colors ${
              activeTab === 'userrisk'
                ? 'text-green-400 border-b-2 border-green-400'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            User Risk Scoring
          </button>
        </div>

        {activeTab === 'calculator' && (
          <div className="space-y-6">
            <div className="bg-slate-800/50 rounded-lg p-6 border border-slate-700">
              <h3 className="text-white font-semibold mb-4">How It Works</h3>
              <div className="space-y-3 text-sm text-slate-300">
                <div>
                  <span className="text-green-400 font-semibold">Severity (S):</span> Initial event severity from detection system (0-10 scale)
                </div>
                <div>
                  <span className="text-blue-400 font-semibold">Model Confidence (MC):</span> How well-defined the asset is (0-10). Higher for manually added assets.
                </div>
                <div>
                  <span className="text-purple-400 font-semibold">Relevance (R):</span> Whether event matches known vulnerabilities or exposed ports (0-1).
                </div>
                <div>
                  <span className="text-orange-400 font-semibold">Threat Weight (TW):</span> Multiplier based on threat intelligence (1 + severity × 3/100).
                </div>
                <div>
                  <span className="text-red-400 font-semibold">Asset Criticality (AC):</span> Business importance (0.5 to 2.0 multiplier).
                </div>
              </div>
              <div className="mt-4 p-4 bg-green-500/10 border border-green-500/30 rounded-lg">
                <p className="text-green-300 font-mono text-sm">
                  Priority = S × (MC/10 × R) × TW × AC
                </p>
              </div>
            </div>

            <RecentCalculations />
          </div>
        )}

        {activeTab === 'assets' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between mb-4">
              <p className="text-slate-400 text-sm">
                Registered assets with criticality scores for priority calculation
              </p>
              <button className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-sm flex items-center space-x-2">
                <Plus className="w-4 h-4" />
                <span>Add Asset</span>
              </button>
            </div>
            {assets.length === 0 ? (
              <div className="text-center py-12">
                <Server className="w-16 h-16 text-slate-600 mx-auto mb-4" />
                <p className="text-slate-400">No assets registered</p>
              </div>
            ) : (
              assets.map((asset) => (
                <div key={asset.id} className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-2">
                        <Server className="w-5 h-5 text-blue-500" />
                        <span className="text-white font-semibold">{asset.asset_name}</span>
                        <span className={`px-2 py-1 rounded text-xs font-semibold border ${getCriticalityColor(asset.criticality)}`}>
                          {asset.criticality.replace('_', ' ')}
                        </span>
                      </div>
                      <div className="grid grid-cols-4 gap-3 text-sm">
                        <div>
                          <p className="text-slate-500">IP Address</p>
                          <p className="text-slate-300">{asset.ip_address || 'N/A'}</p>
                        </div>
                        <div>
                          <p className="text-slate-500">Type</p>
                          <p className="text-slate-300 capitalize">{asset.asset_type}</p>
                        </div>
                        <div>
                          <p className="text-slate-500">Model Confidence</p>
                          <p className="text-slate-300">{asset.model_confidence}/10</p>
                        </div>
                        <div>
                          <p className="text-slate-500">Criticality Score</p>
                          <p className="text-slate-300">{asset.criticality_score}x</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'formula' && (
          <div className="space-y-4">
            {formulas.map((formula) => (
              <div key={formula.id} className="bg-slate-800/50 border border-slate-700 rounded-lg p-6">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-white font-semibold flex items-center space-x-2">
                      <span>{formula.name}</span>
                      {formula.is_active && (
                        <span className="px-2 py-1 bg-green-500/20 text-green-400 rounded text-xs">Active</span>
                      )}
                    </h3>
                    <p className="text-slate-400 text-sm mt-1">{formula.description}</p>
                  </div>
                  <button className="text-slate-400 hover:text-white">
                    <Settings className="w-5 h-5" />
                  </button>
                </div>
                <div className="bg-slate-900/50 rounded p-4 mb-4">
                  <p className="text-green-300 font-mono text-sm">{formula.formula_expression}</p>
                </div>
                <div className="grid grid-cols-4 gap-4 text-sm">
                  <div className="bg-slate-900/50 rounded p-3">
                    <p className="text-slate-500 mb-1">Severity Weight</p>
                    <p className="text-white font-semibold">{formula.severity_weight}</p>
                  </div>
                  <div className="bg-slate-900/50 rounded p-3">
                    <p className="text-slate-500 mb-1">MCR Weight</p>
                    <p className="text-white font-semibold">{formula.mcr_weight}</p>
                  </div>
                  <div className="bg-slate-900/50 rounded p-3">
                    <p className="text-slate-500 mb-1">Threat Multiplier</p>
                    <p className="text-white font-semibold">{formula.threat_weight_multiplier}</p>
                  </div>
                  <div className="bg-slate-900/50 rounded p-3">
                    <p className="text-slate-500 mb-1">Asset Weight</p>
                    <p className="text-white font-semibold">{formula.asset_weight}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'userrisk' && (
          <div className="space-y-6">
            <div className="bg-slate-800/50 rounded-lg p-6 border border-slate-700">
              <h3 className="text-white font-semibold mb-4 flex items-center space-x-2">
                <Users className="w-5 h-5 text-blue-500" />
                <span>User Risk Scoring Formula</span>
              </h3>
              <div className="space-y-4">
                <div className="bg-slate-900/50 rounded-lg p-4">
                  <p className="text-blue-300 font-mono text-sm mb-4">
                    User Risk Score = Σ(Behavioral Risk) + Σ(LLM Risk) + Σ(Communication Risk)
                  </p>
                  <p className="text-slate-300 text-sm">
                    User risk is calculated by analyzing physical/logical behaviors, LLM interactions, and communication patterns across email, Slack, Teams, and meetings. Each dimension contributes weighted risk factors based on severity and confidence.
                  </p>
                </div>

                <div>
                  <h4 className="text-white font-semibold mb-3">Risk Factor Components</h4>
                  <div className="space-y-3">
                    <div className="bg-slate-900/50 rounded-lg p-4">
                      <div className="flex items-start space-x-3">
                        <div className="flex-shrink-0 w-2 h-2 bg-red-400 rounded-full mt-2"></div>
                        <div className="flex-1">
                          <h5 className="text-red-400 font-semibold mb-1">Physical Security Events</h5>
                          <p className="text-slate-400 text-sm mb-2">Badge access attempts, camera detections, physical presence anomalies</p>
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div className="bg-slate-800/50 p-2 rounded">
                              <span className="text-slate-500">Unauthorized access attempt:</span>
                              <span className="text-white font-semibold ml-2">+15-25</span>
                            </div>
                            <div className="bg-slate-800/50 p-2 rounded">
                              <span className="text-slate-500">Restricted area loitering:</span>
                              <span className="text-white font-semibold ml-2">+8-15</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="bg-slate-900/50 rounded-lg p-4">
                      <div className="flex items-start space-x-3">
                        <div className="flex-shrink-0 w-2 h-2 bg-orange-400 rounded-full mt-2"></div>
                        <div className="flex-1">
                          <h5 className="text-orange-400 font-semibold mb-1">Data Access Anomalies</h5>
                          <p className="text-slate-400 text-sm mb-2">File access patterns, data exfiltration indicators, unauthorized resource access</p>
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div className="bg-slate-800/50 p-2 rounded">
                              <span className="text-slate-500">Mass file downloads:</span>
                              <span className="text-white font-semibold ml-2">+20-30</span>
                            </div>
                            <div className="bg-slate-800/50 p-2 rounded">
                              <span className="text-slate-500">Unauthorized access:</span>
                              <span className="text-white font-semibold ml-2">+10-20</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="bg-slate-900/50 rounded-lg p-4">
                      <div className="flex items-start space-x-3">
                        <div className="flex-shrink-0 w-2 h-2 bg-yellow-400 rounded-full mt-2"></div>
                        <div className="flex-1">
                          <h5 className="text-yellow-400 font-semibold mb-1">Administrative Actions</h5>
                          <p className="text-slate-400 text-sm mb-2">Privilege escalation, system changes, account modifications</p>
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div className="bg-slate-800/50 p-2 rounded">
                              <span className="text-slate-500">Unscheduled admin action:</span>
                              <span className="text-white font-semibold ml-2">+15-25</span>
                            </div>
                            <div className="bg-slate-800/50 p-2 rounded">
                              <span className="text-slate-500">No ticket reference:</span>
                              <span className="text-white font-semibold ml-2">+5-10</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="bg-slate-900/50 rounded-lg p-4">
                      <div className="flex items-start space-x-3">
                        <div className="flex-shrink-0 w-2 h-2 bg-blue-400 rounded-full mt-2"></div>
                        <div className="flex-1">
                          <h5 className="text-blue-400 font-semibold mb-1">Temporal & Location Anomalies</h5>
                          <p className="text-slate-400 text-sm mb-2">After-hours access, unusual locations, impossible travel</p>
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div className="bg-slate-800/50 p-2 rounded">
                              <span className="text-slate-500">After-hours VPN:</span>
                              <span className="text-white font-semibold ml-2">+10-20</span>
                            </div>
                            <div className="bg-slate-800/50 p-2 rounded">
                              <span className="text-slate-500">Unusual geo-location:</span>
                              <span className="text-white font-semibold ml-2">+8-15</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="bg-slate-900/50 rounded-lg p-4">
                      <div className="flex items-start space-x-3">
                        <div className="flex-shrink-0 w-2 h-2 bg-purple-400 rounded-full mt-2"></div>
                        <div className="flex-1">
                          <h5 className="text-purple-400 font-semibold mb-1">Behavior Correlations</h5>
                          <p className="text-slate-400 text-sm mb-2">Physical-logical event correlation multipliers</p>
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div className="bg-slate-800/50 p-2 rounded">
                              <span className="text-slate-500">Location mismatch:</span>
                              <span className="text-white font-semibold ml-2">×1.5</span>
                            </div>
                            <div className="bg-slate-800/50 p-2 rounded">
                              <span className="text-slate-500">Time proximity:</span>
                              <span className="text-white font-semibold ml-2">×1.3</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="bg-gradient-to-r from-cyan-900/30 to-blue-900/30 rounded-lg p-4 border border-cyan-500/30">
                      <div className="flex items-start space-x-3">
                        <div className="flex-shrink-0 w-2 h-2 bg-cyan-400 rounded-full mt-2"></div>
                        <div className="flex-1">
                          <h5 className="text-cyan-400 font-semibold mb-1 flex items-center space-x-2">
                            <Brain className="w-4 h-4" />
                            <span>LLM Interaction Risk (AI-Powered)</span>
                          </h5>
                          <p className="text-slate-400 text-sm mb-2">Risk from corporate LLM usage, prompt analysis, and AI tool interactions</p>
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div className="bg-slate-800/50 p-2 rounded">
                              <span className="text-slate-500">PII exposure in prompts:</span>
                              <span className="text-white font-semibold ml-2">+15-30</span>
                            </div>
                            <div className="bg-slate-800/50 p-2 rounded">
                              <span className="text-slate-500">Credential sharing:</span>
                              <span className="text-white font-semibold ml-2">+25-40</span>
                            </div>
                            <div className="bg-slate-800/50 p-2 rounded">
                              <span className="text-slate-500">Proprietary data leakage:</span>
                              <span className="text-white font-semibold ml-2">+20-35</span>
                            </div>
                            <div className="bg-slate-800/50 p-2 rounded">
                              <span className="text-slate-500">Jailbreak attempts:</span>
                              <span className="text-white font-semibold ml-2">+10-20</span>
                            </div>
                            <div className="bg-slate-800/50 p-2 rounded">
                              <span className="text-slate-500">Data exfiltration patterns:</span>
                              <span className="text-white font-semibold ml-2">+30-50</span>
                            </div>
                            <div className="bg-slate-800/50 p-2 rounded">
                              <span className="text-slate-500">Policy violations:</span>
                              <span className="text-white font-semibold ml-2">+10-25</span>
                            </div>
                          </div>
                          <div className="mt-3 pt-3 border-t border-cyan-500/20">
                            <p className="text-cyan-300 text-xs font-semibold mb-1">AI Analysis Capabilities:</p>
                            <ul className="text-slate-400 text-xs space-y-1">
                              <li>• Real-time prompt classification and entity extraction</li>
                              <li>• Sentiment analysis and intent detection</li>
                              <li>• Pattern matching for data exfiltration behaviors</li>
                              <li>• Context-aware risk scoring based on role and clearance</li>
                            </ul>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="bg-gradient-to-r from-indigo-900/30 to-violet-900/30 rounded-lg p-4 border border-indigo-500/30">
                      <div className="flex items-start space-x-3">
                        <div className="flex-shrink-0 w-2 h-2 bg-indigo-400 rounded-full mt-2"></div>
                        <div className="flex-1">
                          <h5 className="text-indigo-400 font-semibold mb-1">Communication Pattern Analysis</h5>
                          <p className="text-slate-400 text-sm mb-3">AI-powered analysis of email, Slack, Teams, and meeting communications</p>

                          <div className="space-y-3">
                            <div className="bg-slate-800/50 rounded p-3">
                              <p className="text-white text-xs font-semibold mb-2">Email Behavioral Analysis</p>
                              <div className="grid grid-cols-2 gap-2 text-xs">
                                <div className="flex justify-between">
                                  <span className="text-slate-500">Aggressive tone:</span>
                                  <span className="text-white font-semibold">+8-15</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-slate-500">External forwarding:</span>
                                  <span className="text-white font-semibold">+15-25</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-slate-500">Unusual recipients:</span>
                                  <span className="text-white font-semibold">+10-20</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-slate-500">Defensive language:</span>
                                  <span className="text-white font-semibold">+5-12</span>
                                </div>
                              </div>
                            </div>

                            <div className="bg-slate-800/50 rounded p-3">
                              <p className="text-white text-xs font-semibold mb-2">Slack/Teams Monitoring</p>
                              <div className="grid grid-cols-2 gap-2 text-xs">
                                <div className="flex justify-between">
                                  <span className="text-slate-500">Confrontational tone:</span>
                                  <span className="text-white font-semibold">+10-18</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-slate-500">Channel bypassing:</span>
                                  <span className="text-white font-semibold">+8-15</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-slate-500">Social isolation:</span>
                                  <span className="text-white font-semibold">+12-20</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-slate-500">Sensitive info sharing:</span>
                                  <span className="text-white font-semibold">+15-30</span>
                                </div>
                              </div>
                            </div>

                            <div className="bg-slate-800/50 rounded p-3">
                              <p className="text-white text-xs font-semibold mb-2">Psychological Profiling</p>
                              <div className="grid grid-cols-2 gap-2 text-xs">
                                <div className="flex justify-between">
                                  <span className="text-slate-500">High narcissism:</span>
                                  <span className="text-white font-semibold">+5-12</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-slate-500">Manipulation tendency:</span>
                                  <span className="text-white font-semibold">+10-20</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-slate-500">Deception likelihood:</span>
                                  <span className="text-white font-semibold">+15-25</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-slate-500">Insider threat markers:</span>
                                  <span className="text-white font-semibold">+20-35</span>
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="mt-3 pt-3 border-t border-indigo-500/20">
                            <p className="text-indigo-300 text-xs font-semibold mb-1">Multi-Source Integration:</p>
                            <ul className="text-slate-400 text-xs space-y-1">
                              <li>• Cross-platform pattern detection (email + Slack + Teams + LLM)</li>
                              <li>• Sentiment trending analysis across 90-day windows</li>
                              <li>• Dark Triad personality assessment (Narcissism, Machiavellianism, Psychopathy)</li>
                              <li>• Burnout, stress, and frustration level monitoring</li>
                              <li>• Leadership influence vs social isolation scoring</li>
                            </ul>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
                  <h4 className="text-blue-300 font-semibold mb-3">Risk Level Classification</h4>
                  <div className="grid grid-cols-4 gap-3 text-sm">
                    <div className="bg-slate-900/50 p-3 rounded border-l-4 border-green-500">
                      <p className="text-green-400 font-semibold mb-1">Low</p>
                      <p className="text-slate-400 text-xs">0-20</p>
                    </div>
                    <div className="bg-slate-900/50 p-3 rounded border-l-4 border-yellow-500">
                      <p className="text-yellow-400 font-semibold mb-1">Medium</p>
                      <p className="text-slate-400 text-xs">20-50</p>
                    </div>
                    <div className="bg-slate-900/50 p-3 rounded border-l-4 border-orange-500">
                      <p className="text-orange-400 font-semibold mb-1">High</p>
                      <p className="text-slate-400 text-xs">50-70</p>
                    </div>
                    <div className="bg-slate-900/50 p-3 rounded border-l-4 border-red-500">
                      <p className="text-red-400 font-semibold mb-1">Critical</p>
                      <p className="text-slate-400 text-xs">70-100</p>
                    </div>
                  </div>
                </div>

                <div className="bg-slate-900/50 rounded-lg p-4">
                  <h4 className="text-white font-semibold mb-3">Comprehensive Example Calculation</h4>
                  <div className="space-y-3 text-sm">
                    <div className="bg-slate-800/50 rounded p-3">
                      <p className="text-red-400 font-semibold mb-2 text-xs">Physical/Logical Behaviors:</p>
                      <div className="space-y-1">
                        <div className="flex justify-between items-center">
                          <span className="text-slate-400 text-xs">Attempted unauthorized server room access</span>
                          <span className="text-white font-semibold">+25</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-slate-400 text-xs">Mass file downloads from finance share</span>
                          <span className="text-white font-semibold">+30</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-slate-400 text-xs">Unauthorized access attempts to HR data</span>
                          <span className="text-white font-semibold">+15</span>
                        </div>
                        <div className="flex justify-between items-center pb-2 border-b border-slate-700">
                          <span className="text-slate-400 text-xs">Unusual presence in restricted areas</span>
                          <span className="text-white font-semibold">+10</span>
                        </div>
                        <div className="flex justify-between items-center pt-1">
                          <span className="text-red-400 font-semibold text-xs">Subtotal:</span>
                          <span className="text-red-400 font-bold">80</span>
                        </div>
                      </div>
                    </div>

                    <div className="bg-slate-800/50 rounded p-3">
                      <p className="text-cyan-400 font-semibold mb-2 text-xs">LLM Interaction Risk:</p>
                      <div className="space-y-1">
                        <div className="flex justify-between items-center">
                          <span className="text-slate-400 text-xs">Shared credentials in ChatGPT prompt</span>
                          <span className="text-white font-semibold">+35</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-slate-400 text-xs">Proprietary code uploaded to LLM</span>
                          <span className="text-white font-semibold">+28</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-slate-400 text-xs">Customer PII exposed in prompts (3 incidents)</span>
                          <span className="text-white font-semibold">+22</span>
                        </div>
                        <div className="flex justify-between items-center pb-2 border-b border-slate-700">
                          <span className="text-slate-400 text-xs">Policy violation (unauthorized LLM usage)</span>
                          <span className="text-white font-semibold">+15</span>
                        </div>
                        <div className="flex justify-between items-center pt-1">
                          <span className="text-cyan-400 font-semibold text-xs">Subtotal:</span>
                          <span className="text-cyan-400 font-bold">100</span>
                        </div>
                      </div>
                    </div>

                    <div className="bg-slate-800/50 rounded p-3">
                      <p className="text-indigo-400 font-semibold mb-2 text-xs">Communication Pattern Risk:</p>
                      <div className="space-y-1">
                        <div className="flex justify-between items-center">
                          <span className="text-slate-400 text-xs">Aggressive emails to management (7 instances)</span>
                          <span className="text-white font-semibold">+12</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-slate-400 text-xs">External email forwarding (sensitive data)</span>
                          <span className="text-white font-semibold">+20</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-slate-400 text-xs">Social isolation score (low engagement)</span>
                          <span className="text-white font-semibold">+18</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-slate-400 text-xs">High manipulation tendency detected</span>
                          <span className="text-white font-semibold">+15</span>
                        </div>
                        <div className="flex justify-between items-center pb-2 border-b border-slate-700">
                          <span className="text-slate-400 text-xs">Insider threat psychological markers</span>
                          <span className="text-white font-semibold">+25</span>
                        </div>
                        <div className="flex justify-between items-center pt-1">
                          <span className="text-indigo-400 font-semibold text-xs">Subtotal:</span>
                          <span className="text-indigo-400 font-bold">90</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex justify-between items-center py-3 bg-gradient-to-r from-red-500/20 to-orange-500/20 rounded border border-red-500/50">
                      <div>
                        <p className="text-white font-bold text-lg">Total Composite Risk Score</p>
                        <p className="text-slate-400 text-xs">Behavioral (80) + LLM (100) + Communication (90)</p>
                      </div>
                      <span className="text-red-400 font-bold text-3xl">270</span>
                    </div>

                    <div className="bg-red-500/10 border border-red-500/30 rounded p-3">
                      <div className="flex items-center space-x-2 mb-2">
                        <AlertTriangle className="w-4 h-4 text-red-400" />
                        <span className="text-red-400 font-semibold text-sm">CRITICAL - IMMEDIATE ESCALATION</span>
                      </div>
                      <p className="text-slate-300 text-xs">
                        This user presents a severe insider threat with multi-dimensional risk indicators.
                        Recommend immediate access suspension, SOC escalation, and HR investigation.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {showCalculator && (
        <PriorityCalculatorModal
          input={calcInput}
          setInput={setCalcInput}
          onCalculate={handleCalculate}
          calculation={calculation}
          onClose={() => {
            setShowCalculator(false);
            setCalculation(null);
          }}
        />
      )}
    </div>
  );
};

const RecentCalculations = () => {
  const [calculations, setCalculations] = useState<any[]>([]);

  useEffect(() => {
    loadCalculations();
  }, []);

  const loadCalculations = async () => {
    const { data } = await supabase
      .from('event_priority_calculations')
      .select('*')
      .order('calculated_at', { ascending: false })
      .limit(10);
    setCalculations(data || []);
  };

  return (
    <div className="bg-slate-800/50 rounded-lg p-6 border border-slate-700">
      <h3 className="text-white font-semibold mb-4 flex items-center space-x-2">
        <TrendingUp className="w-5 h-5 text-green-500" />
        <span>Recent Priority Calculations</span>
      </h3>
      <div className="space-y-2">
        {calculations.length === 0 ? (
          <p className="text-slate-400 text-center py-4">No calculations yet</p>
        ) : (
          calculations.map((calc) => (
            <div key={calc.id} className="bg-slate-900/50 rounded p-3 flex items-center justify-between">
              <div className="flex-1">
                <div className="flex items-center space-x-3">
                  <span className="text-slate-300 text-sm font-mono">{calc.event_id}</span>
                  <span className={`px-2 py-1 rounded text-xs font-semibold border ${ThreatEscalationEngine.getSeverityColor(calc.priority_level)}`}>
                    {calc.priority_level.replace('_', ' ')}
                  </span>
                  <span className="text-slate-500 text-xs">
                    {new Date(calc.calculated_at).toLocaleString()}
                  </span>
                </div>
              </div>
              <div className="text-right">
                <p className="text-white font-bold text-lg">{calc.final_priority}</p>
                <p className="text-slate-500 text-xs">Priority Score</p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

const PriorityCalculatorModal = ({ input, setInput, onCalculate, calculation, onClose }: any) => {
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-6 max-w-3xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-semibold text-white">Priority Calculator</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="space-y-4 mb-6">
          <div>
            <label className="block text-slate-400 text-sm mb-2">Initial Severity</label>
            <select
              value={input.initialSeverity}
              onChange={(e) => setInput({ ...input, initialSeverity: e.target.value })}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white"
            >
              <option value="very_low">Very Low</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="very_high">Very High</option>
            </select>
          </div>

          <div>
            <label className="block text-slate-400 text-sm mb-2">Target Asset IP (optional)</label>
            <input
              type="text"
              value={input.targetAssetIp}
              onChange={(e) => setInput({ ...input, targetAssetIp: e.target.value })}
              placeholder="192.168.1.100"
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white"
            />
          </div>

          <div>
            <label className="block text-slate-400 text-sm mb-2">Source IP (optional)</label>
            <input
              type="text"
              value={input.sourceIp}
              onChange={(e) => setInput({ ...input, sourceIp: e.target.value })}
              placeholder="10.0.0.45"
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white"
            />
          </div>

          <button
            onClick={onCalculate}
            className="w-full bg-green-600 hover:bg-green-700 text-white px-4 py-3 rounded-lg transition-colors font-semibold"
          >
            Calculate Priority
          </button>
        </div>

        {calculation && (
          <div className="space-y-4">
            <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-6">
              <div className="text-center mb-4">
                <p className="text-slate-400 text-sm mb-2">Final Priority Score</p>
                <p className="text-green-400 text-5xl font-bold">{calculation.finalPriority}</p>
                <span className={`inline-block px-3 py-1 rounded mt-2 text-sm font-semibold border ${ThreatEscalationEngine.getSeverityColor(calculation.priorityLevel)}`}>
                  {calculation.priorityLevel.replace('_', ' ').toUpperCase()}
                </span>
              </div>
            </div>

            <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
              <h4 className="text-white font-semibold mb-3">Calculation Breakdown</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-400">Severity Score:</span>
                  <span className="text-white font-semibold">{calculation.severityScore}/10</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Model Confidence:</span>
                  <span className="text-white font-semibold">{calculation.modelConfidence}/10</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Relevance Score:</span>
                  <span className="text-white font-semibold">{calculation.relevanceScore}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">MCR Factor:</span>
                  <span className="text-white font-semibold">{calculation.mcrFactor.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Threat Weight:</span>
                  <span className="text-white font-semibold">{calculation.threatWeight.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Asset Criticality:</span>
                  <span className="text-white font-semibold">{calculation.assetCriticality}x</span>
                </div>
              </div>
            </div>

            <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
              <h4 className="text-white font-semibold mb-3">Explanation</h4>
              <div className="space-y-2 text-sm text-slate-300">
                {Object.values(calculation.details).map((detail: any, idx) => (
                  <p key={idx}>• {detail}</p>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const getCriticalityColor = (criticality: string) => {
  switch (criticality) {
    case 'very_high':
      return 'bg-red-500/20 text-red-400 border-red-500/50';
    case 'high':
      return 'bg-orange-500/20 text-orange-400 border-orange-500/50';
    case 'medium':
      return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50';
    case 'low':
      return 'bg-blue-500/20 text-blue-400 border-blue-500/50';
    case 'very_low':
      return 'bg-slate-500/20 text-slate-400 border-slate-500/50';
    default:
      return 'bg-slate-500/20 text-slate-400 border-slate-500/50';
  }
};

export default ThreatEscalationPanel;
