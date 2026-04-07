import { useState, useEffect } from 'react';
import { Activity, AlertTriangle, Shield, FileText, Image, Video, Database, Lock, Mail, CheckCircle, XCircle, AlertOctagon, Eye } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface PacketCapture {
  id: string;
  capture_time: string;
  source_ip: string;
  destination_ip: string;
  source_port: number;
  destination_port: number;
  protocol: string;
  packet_size: number;
  content_type: string;
  reconstructed_content: any;
  flow_id: string;
  status: string;
}

interface DLPDetection {
  id: string;
  packet_id: string;
  flow_id: string;
  risk_level: string;
  violation_type: string;
  detected_patterns: string[];
  content_classification: string;
  action_taken: string;
  confidence_score: number;
  details: any;
  detected_at: string;
}

interface DPIFlow {
  id: string;
  flow_id: string;
  source_ip: string;
  destination_ip: string;
  source_zone: string;
  destination_zone: string;
  protocol: string;
  total_packets: number;
  total_bytes: number;
  start_time: string;
  status: string;
  content_summary: any;
}

const DPIInspection = () => {
  const [flows, setFlows] = useState<DPIFlow[]>([]);
  const [packets, setPackets] = useState<PacketCapture[]>([]);
  const [detections, setDetections] = useState<DLPDetection[]>([]);
  const [selectedFlow, setSelectedFlow] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDPIData();
    const interval = setInterval(loadDPIData, 5000);
    return () => clearInterval(interval);
  }, []);

  const loadDPIData = async () => {
    const [flowsData, packetsData, detectionsData] = await Promise.all([
      supabase.from('dpi_flows').select('*').order('start_time', { ascending: false }),
      supabase.from('packet_captures').select('*').order('capture_time', { ascending: false }).limit(50),
      supabase.from('dlp_detections').select('*').order('detected_at', { ascending: false })
    ]);

    setFlows(flowsData.data || []);
    setPackets(packetsData.data || []);
    setDetections(detectionsData.data || []);
    setLoading(false);
  };

  const getContentIcon = (contentType: string) => {
    switch (contentType) {
      case 'email': return <Mail className="w-5 h-5" />;
      case 'image': return <Image className="w-5 h-5" />;
      case 'video': return <Video className="w-5 h-5" />;
      case 'document': return <FileText className="w-5 h-5" />;
      case 'database': return <Database className="w-5 h-5" />;
      case 'encrypted': return <Lock className="w-5 h-5" />;
      default: return <Activity className="w-5 h-5" />;
    }
  };

  const getRiskColor = (riskLevel: string) => {
    switch (riskLevel) {
      case 'critical': return 'border-red-500 bg-red-500/10 text-red-400';
      case 'high': return 'border-orange-500 bg-orange-500/10 text-orange-400';
      case 'medium': return 'border-yellow-500 bg-yellow-500/10 text-yellow-400';
      case 'low': return 'border-blue-500 bg-blue-500/10 text-blue-400';
      default: return 'border-slate-500 bg-slate-500/10 text-slate-400';
    }
  };

  const getActionIcon = (action: string) => {
    switch (action) {
      case 'block': return <XCircle className="w-5 h-5 text-red-500" />;
      case 'quarantine': return <AlertOctagon className="w-5 h-5 text-orange-500" />;
      case 'alert': return <AlertTriangle className="w-5 h-5 text-yellow-500" />;
      case 'allow': return <CheckCircle className="w-5 h-5 text-green-500" />;
      default: return <Eye className="w-5 h-5 text-slate-400" />;
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  const renderReconstructedContent = (contentType: string, content: any) => {
    switch (contentType) {
      case 'email':
        return (
          <div className="bg-slate-900/70 rounded-lg border border-slate-700 overflow-hidden">
            <div className="bg-slate-800 px-4 py-2 border-b border-slate-700">
              <div className="flex items-center space-x-2">
                <Mail className="w-4 h-4 text-blue-400" />
                <span className="text-white font-semibold">Email Message</span>
              </div>
            </div>
            <div className="p-4 space-y-3">
              <div className="space-y-2 text-sm">
                <div className="flex">
                  <span className="text-slate-500 w-20">From:</span>
                  <span className="text-slate-300">{content.from || 'unknown@example.com'}</span>
                </div>
                <div className="flex">
                  <span className="text-slate-500 w-20">To:</span>
                  <span className="text-slate-300">{content.to || 'recipient@example.com'}</span>
                </div>
                <div className="flex">
                  <span className="text-slate-500 w-20">Subject:</span>
                  <span className="text-white font-semibold">{content.subject || 'No Subject'}</span>
                </div>
              </div>

              {content.body_preview && (
                <div className="bg-slate-950 rounded p-4 border border-slate-700">
                  <div className="text-slate-400 text-xs mb-2">Email Body:</div>
                  <div className="text-slate-300 text-sm whitespace-pre-wrap">{content.body_preview}</div>
                </div>
              )}

              {content.contains && Array.isArray(content.contains) && (
                <div className="bg-red-900/20 rounded p-3 border border-red-500/50">
                  <div className="flex items-center space-x-2 mb-2">
                    <AlertTriangle className="w-4 h-4 text-red-400" />
                    <span className="text-red-400 font-semibold text-sm">Sensitive Data Detected:</span>
                  </div>
                  <div className="space-y-1">
                    {content.contains.map((item: string, idx: number) => (
                      <div key={idx} className="text-red-300 text-xs font-mono bg-red-950/50 px-2 py-1 rounded">
                        {item}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {content.attachment_name && (
                <div className="flex items-center justify-between bg-slate-800 rounded p-3 border border-slate-700">
                  <div className="flex items-center space-x-2">
                    <FileText className="w-4 h-4 text-cyan-400" />
                    <span className="text-slate-300 text-sm">{content.attachment_name}</span>
                  </div>
                  <span className="text-slate-500 text-xs">{formatBytes(content.attachment_size || 0)}</span>
                </div>
              )}
            </div>
          </div>
        );

      case 'image':
        return (
          <div className="bg-slate-900/70 rounded-lg border border-slate-700 overflow-hidden">
            <div className="bg-slate-800 px-4 py-2 border-b border-slate-700">
              <div className="flex items-center space-x-2">
                <Image className="w-4 h-4 text-purple-400" />
                <span className="text-white font-semibold">Image File</span>
              </div>
            </div>
            <div className="p-4 space-y-3">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">Filename:</span>
                  <span className="text-slate-300">{content.filename || 'image.png'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Format:</span>
                  <span className="text-slate-300">{content.format || 'PNG'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Resolution:</span>
                  <span className="text-slate-300">{content.resolution || '1920x1080'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Size:</span>
                  <span className="text-slate-300">{formatBytes(content.size_bytes || 0)}</span>
                </div>
              </div>

              {/* Mock Image Preview */}
              <div className="bg-slate-950 rounded-lg p-4 border border-slate-700">
                <div className="text-slate-400 text-xs mb-3">Image Preview:</div>
                <div className="aspect-video bg-gradient-to-br from-slate-800 to-slate-900 rounded-lg flex items-center justify-center border border-slate-600 relative overflow-hidden">
                  {/* Fake Dashboard Screenshot */}
                  {content.filename?.includes('dashboard') && (
                    <div className="w-full h-full p-4">
                      <div className="bg-slate-950/50 rounded p-3 border border-cyan-500/30">
                        <div className="flex items-center justify-between mb-3">
                          <div className="h-4 w-32 bg-cyan-500/30 rounded"></div>
                          <div className="h-4 w-20 bg-slate-700 rounded"></div>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          <div className="bg-blue-500/20 rounded p-2 border border-blue-500/30">
                            <div className="h-3 w-16 bg-blue-400/50 rounded mb-1"></div>
                            <div className="h-6 w-12 bg-blue-400/70 rounded"></div>
                          </div>
                          <div className="bg-green-500/20 rounded p-2 border border-green-500/30">
                            <div className="h-3 w-16 bg-green-400/50 rounded mb-1"></div>
                            <div className="h-6 w-12 bg-green-400/70 rounded"></div>
                          </div>
                          <div className="bg-red-500/20 rounded p-2 border border-red-500/30">
                            <div className="h-3 w-16 bg-red-400/50 rounded mb-1"></div>
                            <div className="h-6 w-12 bg-red-400/70 rounded"></div>
                          </div>
                        </div>
                        <div className="mt-3 space-y-1">
                          <div className="h-2 bg-slate-700 rounded"></div>
                          <div className="h-2 bg-slate-700 rounded w-3/4"></div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Fake Network Diagram */}
                  {content.filename?.includes('network') && (
                    <div className="w-full h-full p-4">
                      <svg className="w-full h-full" viewBox="0 0 200 120">
                        <rect x="20" y="10" width="40" height="30" fill="#1e40af" stroke="#3b82f6" strokeWidth="1" rx="2" />
                        <text x="40" y="28" fill="#93c5fd" fontSize="8" textAnchor="middle">Router</text>

                        <rect x="80" y="10" width="40" height="30" fill="#166534" stroke="#22c55e" strokeWidth="1" rx="2" />
                        <text x="100" y="28" fill="#86efac" fontSize="8" textAnchor="middle">Switch</text>

                        <rect x="140" y="10" width="40" height="30" fill="#7c2d12" stroke="#f97316" strokeWidth="1" rx="2" />
                        <text x="160" y="28" fill="#fdba74" fontSize="8" textAnchor="middle">Firewall</text>

                        <line x1="60" y1="25" x2="80" y2="25" stroke="#3b82f6" strokeWidth="2" />
                        <line x1="120" y1="25" x2="140" y2="25" stroke="#22c55e" strokeWidth="2" />

                        <rect x="20" y="70" width="30" height="25" fill="#4c1d95" stroke="#a855f7" strokeWidth="1" rx="2" />
                        <text x="35" y="85" fill="#c084fc" fontSize="6" textAnchor="middle">PC-01</text>

                        <rect x="60" y="70" width="30" height="25" fill="#4c1d95" stroke="#a855f7" strokeWidth="1" rx="2" />
                        <text x="75" y="85" fill="#c084fc" fontSize="6" textAnchor="middle">PC-02</text>

                        <rect x="100" y="70" width="30" height="25" fill="#4c1d95" stroke="#a855f7" strokeWidth="1" rx="2" />
                        <text x="115" y="85" fill="#c084fc" fontSize="6" textAnchor="middle">Server</text>

                        <line x1="35" y1="40" x2="35" y2="70" stroke="#3b82f6" strokeWidth="1" strokeDasharray="2,2" />
                        <line x1="100" y1="40" x2="75" y2="70" stroke="#22c55e" strokeWidth="1" strokeDasharray="2,2" />
                        <line x1="100" y1="40" x2="115" y2="70" stroke="#22c55e" strokeWidth="1" strokeDasharray="2,2" />
                      </svg>
                    </div>
                  )}

                  {!content.filename?.includes('dashboard') && !content.filename?.includes('network') && (
                    <div className="text-slate-500 text-center">
                      <Image className="w-16 h-16 mx-auto mb-2 opacity-30" />
                      <div className="text-sm">Image Placeholder</div>
                    </div>
                  )}
                </div>
              </div>

              {content.contains_text && (
                <div className="bg-yellow-900/20 rounded p-3 border border-yellow-500/50">
                  <div className="flex items-center space-x-2">
                    <AlertTriangle className="w-4 h-4 text-yellow-400" />
                    <span className="text-yellow-400 font-semibold text-sm">Contains Sensitive Text (OCR Detected)</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        );

      case 'video':
        return (
          <div className="bg-slate-900/70 rounded-lg border border-slate-700 overflow-hidden">
            <div className="bg-slate-800 px-4 py-2 border-b border-slate-700">
              <div className="flex items-center space-x-2">
                <Video className="w-4 h-4 text-pink-400" />
                <span className="text-white font-semibold">Video File</span>
              </div>
            </div>
            <div className="p-4 space-y-3">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">Filename:</span>
                  <span className="text-slate-300">{content.filename || 'video.mp4'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Codec:</span>
                  <span className="text-slate-300">{content.codec || 'H.264'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Duration:</span>
                  <span className="text-slate-300">{Math.floor((content.duration_seconds || 0) / 60)}m {(content.duration_seconds || 0) % 60}s</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Resolution:</span>
                  <span className="text-slate-300">{content.resolution || '1920x1080'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Bitrate:</span>
                  <span className="text-slate-300">{content.bitrate || '8 Mbps'}</span>
                </div>
              </div>

              {/* Mock Video Player */}
              <div className="bg-slate-950 rounded-lg overflow-hidden border border-slate-700">
                <div className="aspect-video bg-gradient-to-br from-slate-900 to-slate-950 flex items-center justify-center relative">
                  <div className="absolute inset-0 bg-black/40"></div>
                  <div className="relative z-10 text-center">
                    <Video className="w-20 h-20 mx-auto mb-3 text-slate-600" />
                    <div className="text-slate-400 text-sm">Video Content</div>
                    <div className="text-slate-500 text-xs mt-1">{content.filename || 'Recording'}</div>
                  </div>
                  {/* Fake progress bar */}
                  <div className="absolute bottom-0 left-0 right-0 bg-slate-900/80 p-2">
                    <div className="h-1 bg-slate-700 rounded-full overflow-hidden">
                      <div className="h-full w-1/3 bg-pink-500 rounded-full"></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );

      case 'document':
        return (
          <div className="bg-slate-900/70 rounded-lg border border-slate-700 overflow-hidden">
            <div className="bg-slate-800 px-4 py-2 border-b border-slate-700">
              <div className="flex items-center space-x-2">
                <FileText className="w-4 h-4 text-orange-400" />
                <span className="text-white font-semibold">Document File</span>
              </div>
            </div>
            <div className="p-4 space-y-3">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">Filename:</span>
                  <span className="text-slate-300">{content.filename || 'document.pdf'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Format:</span>
                  <span className="text-slate-300">{content.format || 'PDF'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Pages:</span>
                  <span className="text-slate-300">{content.pages || 1}</span>
                </div>
              </div>

              {content.classification_header && (
                <div className="bg-red-900/30 rounded p-3 border-2 border-red-500">
                  <div className="text-red-400 font-bold text-center text-sm">
                    {content.classification_header}
                  </div>
                </div>
              )}

              {/* Mock Document Preview */}
              <div className="bg-white rounded-lg p-6 border border-slate-700">
                <div className="space-y-3">
                  <div className="text-center border-b border-slate-300 pb-3">
                    <div className="text-slate-900 font-bold text-lg">
                      {content.filename?.includes('Merger') ? 'MERGER AGREEMENT' : 'CONFIDENTIAL DOCUMENT'}
                    </div>
                    <div className="text-slate-600 text-sm mt-1">Business Transaction Document</div>
                  </div>

                  <div className="text-slate-800 text-sm space-y-2">
                    <p>This Agreement is entered into as of January 15, 2025, by and between:</p>
                    <p className="font-semibold">TechCorp Industries Inc. ("Acquirer")</p>
                    <p>and</p>
                    <p className="font-semibold">InnovateSoft LLC ("Target")</p>

                    <div className="bg-slate-100 p-3 rounded border-l-4 border-red-500 my-3">
                      <p className="text-red-700 font-bold text-xs">CONFIDENTIAL - ATTORNEY-CLIENT PRIVILEGED</p>
                    </div>

                    <p className="font-semibold mt-3">Transaction Terms:</p>
                    <ul className="list-disc ml-5 space-y-1">
                      <li>Purchase Price: $50,000,000 USD</li>
                      <li>Closing Date: March 31, 2025</li>
                      <li>Payment Structure: Cash consideration</li>
                    </ul>

                    <p className="mt-3">The parties acknowledge that this transaction involves proprietary technology, trade secrets, and confidential business information...</p>
                  </div>
                </div>
              </div>

              {content.contains_keywords && Array.isArray(content.contains_keywords) && (
                <div className="bg-orange-900/20 rounded p-3 border border-orange-500/50">
                  <div className="flex items-center space-x-2 mb-2">
                    <AlertTriangle className="w-4 h-4 text-orange-400" />
                    <span className="text-orange-400 font-semibold text-sm">Sensitive Keywords Detected:</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {content.contains_keywords.map((keyword: string, idx: number) => (
                      <span key={idx} className="px-2 py-1 bg-orange-950/50 text-orange-300 rounded text-xs font-semibold border border-orange-700">
                        {keyword}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        );

      case 'compressed':
        return (
          <div className="bg-slate-900/70 rounded-lg border border-slate-700 overflow-hidden">
            <div className="bg-slate-800 px-4 py-2 border-b border-slate-700">
              <div className="flex items-center space-x-2">
                <Database className="w-4 h-4 text-cyan-400" />
                <span className="text-white font-semibold">Compressed Archive</span>
              </div>
            </div>
            <div className="p-4 space-y-3">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">Filename:</span>
                  <span className="text-slate-300">{content.filename || 'archive.zip'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Compression:</span>
                  <span className="text-slate-300">{content.compression || 'ZIP'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Size:</span>
                  <span className="text-slate-300">{formatBytes(content.size_bytes || 0)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Encrypted:</span>
                  <span className={content.encrypted ? 'text-red-400' : 'text-green-400'}>
                    {content.encrypted ? 'Yes' : 'No'}
                  </span>
                </div>
              </div>

              {content.contains_tables && (
                <div className="bg-slate-950 rounded p-3 border border-slate-700">
                  <div className="text-slate-400 text-xs mb-2">Archive Contents:</div>
                  <div className="space-y-1">
                    {content.contains_tables.map((table: string, idx: number) => (
                      <div key={idx} className="flex items-center space-x-2 text-xs">
                        <Database className="w-3 h-3 text-cyan-400" />
                        <span className="text-slate-300 font-mono">{table}_table.sql</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="bg-red-900/20 rounded p-3 border border-red-500/50">
                <div className="flex items-center space-x-2">
                  <AlertTriangle className="w-4 h-4 text-red-400" />
                  <span className="text-red-400 font-semibold text-sm">Database Backup - Sensitive Data</span>
                </div>
              </div>
            </div>
          </div>
        );

      default:
        return (
          <div className="bg-slate-900/70 rounded-lg p-4 border border-slate-700 font-mono text-xs">
            <div className="text-cyan-400 mb-2">Reconstructed Content:</div>
            <pre className="text-slate-300 whitespace-pre-wrap overflow-x-auto">
              {JSON.stringify(content, null, 2)}
            </pre>
          </div>
        );
    }
  };

  const flowPackets = selectedFlow ? packets.filter(p => p.flow_id === selectedFlow) : [];
  const flowDetections = selectedFlow ? detections.filter(d => d.flow_id === selectedFlow) : detections;

  if (loading) {
    return <div className="text-white">Loading DPI data...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-slate-900/50 backdrop-blur-lg rounded-xl border border-slate-700 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-semibold text-white flex items-center space-x-2">
              <Shield className="w-6 h-6 text-cyan-500" />
              <span>Deep Packet Inspection (DPI) & Data Loss Prevention (DLP)</span>
            </h2>
            <p className="text-slate-400 text-sm mt-1">
              Real-time packet reconstruction, content analysis, and policy enforcement
            </p>
          </div>
          <div className="flex space-x-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-cyan-400">{flows.length}</div>
              <div className="text-slate-400 text-xs">Active Flows</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-orange-400">{detections.filter(d => d.risk_level === 'critical' || d.risk_level === 'high').length}</div>
              <div className="text-slate-400 text-xs">High Risk</div>
            </div>
          </div>
        </div>

        {/* Statistics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700">
            <div className="flex items-center space-x-2 mb-2">
              <Activity className="w-4 h-4 text-cyan-400" />
              <span className="text-slate-400 text-xs">Total Packets</span>
            </div>
            <div className="text-xl font-bold text-white">{packets.length}</div>
          </div>
          <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700">
            <div className="flex items-center space-x-2 mb-2">
              <AlertTriangle className="w-4 h-4 text-red-400" />
              <span className="text-slate-400 text-xs">Critical Threats</span>
            </div>
            <div className="text-xl font-bold text-red-400">{detections.filter(d => d.risk_level === 'critical').length}</div>
          </div>
          <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700">
            <div className="flex items-center space-x-2 mb-2">
              <XCircle className="w-4 h-4 text-orange-400" />
              <span className="text-slate-400 text-xs">Blocked</span>
            </div>
            <div className="text-xl font-bold text-orange-400">{detections.filter(d => d.action_taken === 'block').length}</div>
          </div>
          <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700">
            <div className="flex items-center space-x-2 mb-2">
              <CheckCircle className="w-4 h-4 text-green-400" />
              <span className="text-slate-400 text-xs">Allowed</span>
            </div>
            <div className="text-xl font-bold text-green-400">{detections.filter(d => d.action_taken === 'allow').length}</div>
          </div>
        </div>
      </div>

      {/* Network Flows */}
      <div className="bg-slate-900/50 backdrop-blur-lg rounded-xl border border-slate-700 p-6">
        <h3 className="text-white font-semibold text-lg mb-4 flex items-center space-x-2">
          <Activity className="w-5 h-5 text-cyan-500" />
          <span>Active Network Flows</span>
        </h3>
        <div className="space-y-3">
          {flows.map((flow) => {
            const flowDLP = detections.find(d => d.flow_id === flow.flow_id);
            const isSelected = selectedFlow === flow.flow_id;

            return (
              <div
                key={flow.id}
                onClick={() => setSelectedFlow(isSelected ? null : flow.flow_id)}
                className={`bg-slate-800/50 rounded-lg p-4 border-2 cursor-pointer transition-all hover:border-cyan-500/50 ${
                  isSelected ? 'border-cyan-500' : flowDLP ? getRiskColor(flowDLP.risk_level).split(' ')[0] : 'border-slate-700'
                }`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center space-x-3">
                    <div className={`p-2 rounded ${flow.content_summary?.content_type ? 'bg-cyan-500/20' : 'bg-slate-700'}`}>
                      {getContentIcon(flow.content_summary?.content_type || 'unknown')}
                    </div>
                    <div>
                      <div className="text-white font-semibold">{flow.flow_id}</div>
                      <div className="text-slate-400 text-sm">
                        {flow.source_ip}:{flow.source_port || '?'} → {flow.destination_ip}
                      </div>
                      <div className="text-slate-500 text-xs mt-1">
                        {flow.source_zone} → {flow.destination_zone} | {flow.protocol}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    {flowDLP && (
                      <div className={`px-3 py-1 rounded-full text-xs font-semibold mb-2 ${getRiskColor(flowDLP.risk_level)}`}>
                        {flowDLP.risk_level.toUpperCase()}
                      </div>
                    )}
                    <div className="text-slate-400 text-xs">{formatBytes(flow.total_bytes)}</div>
                    <div className="text-slate-500 text-xs">{flow.total_packets} packets</div>
                  </div>
                </div>

                {/* Content Summary */}
                {flow.content_summary && Object.keys(flow.content_summary).length > 0 && (
                  <div className="bg-slate-900/50 rounded p-3 mt-3 border border-slate-700">
                    <div className="text-slate-300 text-xs font-semibold mb-2">Content Analysis</div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      {Object.entries(flow.content_summary).slice(0, 4).map(([key, value]) => (
                        <div key={key}>
                          <span className="text-slate-500">{key.replace(/_/g, ' ')}:</span>
                          <span className="text-slate-300 ml-1">{String(value)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* DLP Detection Summary */}
                {flowDLP && (
                  <div className={`mt-3 p-3 rounded border-2 ${getRiskColor(flowDLP.risk_level)}`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center space-x-2">
                        {getActionIcon(flowDLP.action_taken)}
                        <span className="text-white font-semibold text-sm">{flowDLP.violation_type.replace(/_/g, ' ').toUpperCase()}</span>
                      </div>
                      <span className="text-xs text-slate-400">{flowDLP.confidence_score.toFixed(1)}% confidence</span>
                    </div>
                    <div className="text-slate-300 text-sm">{flowDLP.content_classification}</div>
                    {flowDLP.detected_patterns.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {flowDLP.detected_patterns.map((pattern, idx) => (
                          <span key={idx} className="px-2 py-1 bg-slate-700 text-slate-300 rounded text-xs">
                            {pattern}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Packet Reconstruction Details */}
      {selectedFlow && flowPackets.length > 0 && (
        <div className="bg-slate-900/50 backdrop-blur-lg rounded-xl border border-cyan-500/50 p-6">
          <h3 className="text-white font-semibold text-lg mb-4 flex items-center space-x-2">
            <Eye className="w-5 h-5 text-cyan-500" />
            <span>Packet Reconstruction - {selectedFlow}</span>
          </h3>
          <div className="space-y-3">
            {flowPackets.map((packet, idx) => (
              <div key={packet.id} className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center space-x-3">
                    <div className="bg-cyan-500/20 px-3 py-1 rounded text-cyan-400 text-sm font-mono">
                      #{idx + 1}
                    </div>
                    <div>
                      <div className="text-white font-semibold">{packet.content_type.toUpperCase()}</div>
                      <div className="text-slate-400 text-sm">
                        {new Date(packet.capture_time).toLocaleTimeString()}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-slate-400 text-sm">{formatBytes(packet.packet_size)}</div>
                    <div className={`px-2 py-1 rounded text-xs font-semibold mt-1 ${
                      packet.status === 'completed' ? 'bg-green-500/20 text-green-400' :
                      packet.status === 'reconstructing' ? 'bg-yellow-500/20 text-yellow-400' :
                      'bg-blue-500/20 text-blue-400'
                    }`}>
                      {packet.status}
                    </div>
                  </div>
                </div>

                {/* Reconstructed Content */}
                {packet.reconstructed_content && Object.keys(packet.reconstructed_content).length > 0 && (
                  <div className="space-y-3">
                    {renderReconstructedContent(packet.content_type, packet.reconstructed_content)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* DLP Detections */}
      <div className="bg-slate-900/50 backdrop-blur-lg rounded-xl border border-slate-700 p-6">
        <h3 className="text-white font-semibold text-lg mb-4 flex items-center space-x-2">
          <AlertTriangle className="w-5 h-5 text-orange-500" />
          <span>DLP Detections & Risk Analysis</span>
        </h3>
        <div className="space-y-3">
          {flowDetections.map((detection) => (
            <div key={detection.id} className={`rounded-lg p-4 border-2 ${getRiskColor(detection.risk_level)}`}>
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center space-x-3">
                  {getActionIcon(detection.action_taken)}
                  <div>
                    <div className="text-white font-semibold">{detection.violation_type.replace(/_/g, ' ').toUpperCase()}</div>
                    <div className="text-slate-300 text-sm mt-1">{detection.content_classification}</div>
                    <div className="text-slate-500 text-xs mt-1">Flow: {detection.flow_id}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className={`px-3 py-1 rounded-full text-xs font-semibold mb-2 ${getRiskColor(detection.risk_level)}`}>
                    {detection.risk_level.toUpperCase()}
                  </div>
                  <div className="text-slate-400 text-xs">{detection.confidence_score.toFixed(1)}% confidence</div>
                  <div className="text-slate-500 text-xs mt-1">
                    {new Date(detection.detected_at).toLocaleString()}
                  </div>
                </div>
              </div>

              {/* Detected Patterns */}
              {detection.detected_patterns.length > 0 && (
                <div className="mb-3">
                  <div className="text-slate-400 text-xs mb-2">Detected Patterns:</div>
                  <div className="flex flex-wrap gap-2">
                    {detection.detected_patterns.map((pattern, idx) => (
                      <span key={idx} className="px-2 py-1 bg-slate-800 text-slate-300 rounded text-xs font-semibold border border-slate-600">
                        {pattern}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Action Taken */}
              <div className="bg-slate-900/70 rounded p-3 border border-slate-700">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-slate-400 text-sm font-semibold">Action Taken:</span>
                  <span className={`px-3 py-1 rounded text-xs font-semibold ${
                    detection.action_taken === 'block' ? 'bg-red-500/20 text-red-400' :
                    detection.action_taken === 'quarantine' ? 'bg-orange-500/20 text-orange-400' :
                    detection.action_taken === 'alert' ? 'bg-yellow-500/20 text-yellow-400' :
                    'bg-green-500/20 text-green-400'
                  }`}>
                    {detection.action_taken.toUpperCase()}
                  </span>
                </div>
                {detection.details?.recommendation && (
                  <div className="text-slate-300 text-sm mt-2">
                    <span className="text-slate-500">Recommendation:</span> {detection.details.recommendation}
                  </div>
                )}
              </div>

              {/* Additional Details */}
              {detection.details && Object.keys(detection.details).length > 0 && (
                <details className="mt-3">
                  <summary className="text-slate-400 text-sm cursor-pointer hover:text-slate-300">
                    View Technical Details
                  </summary>
                  <div className="bg-slate-950 rounded-lg p-3 mt-2 border border-slate-700">
                    <pre className="text-slate-400 text-xs whitespace-pre-wrap overflow-x-auto">
                      {JSON.stringify(detection.details, null, 2)}
                    </pre>
                  </div>
                </details>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default DPIInspection;
