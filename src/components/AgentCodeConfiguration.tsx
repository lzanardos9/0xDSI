import { useState, useEffect, useMemo } from 'react';
import { Code, Settings, FileCode, Terminal, Box, Database, Workflow, Copy, Check, Brain, Cpu, Plus, Search } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface Agent {
  id: string;
  name: string;
  type: string;
  description: string;
  optimization_method: string;
  config: any;
  category?: string;
  aliases?: string[];
  cadence?: string;
  owns_decision?: boolean;
  phases?: number[];
  source_files?: string[];
}

const CATEGORY_LABELS: Record<string, string> = {
  soc_primary: 'SOC Primary',
  pipeline: 'Pipeline',
  correlation: 'Correlation',
  response: 'Response',
  discovery: 'Discovery',
  learning: 'Learning',
  adversarial: 'Adversarial',
  assistant: 'Assistant',
  threat_intel: 'Threat Intel',
  malware: 'Malware',
  infra: 'Infrastructure',
  build_time: 'Build-Time (BMAD)',
  other: 'Other',
};

const CATEGORY_COLORS: Record<string, string> = {
  soc_primary: 'text-blue-400 border-blue-500/30 bg-blue-500/10',
  pipeline: 'text-cyan-400 border-cyan-500/30 bg-cyan-500/10',
  correlation: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10',
  response: 'text-orange-400 border-orange-500/30 bg-orange-500/10',
  discovery: 'text-teal-400 border-teal-500/30 bg-teal-500/10',
  learning: 'text-pink-400 border-pink-500/30 bg-pink-500/10',
  adversarial: 'text-red-400 border-red-500/30 bg-red-500/10',
  assistant: 'text-sky-400 border-sky-500/30 bg-sky-500/10',
  threat_intel: 'text-amber-400 border-amber-500/30 bg-amber-500/10',
  malware: 'text-rose-400 border-rose-500/30 bg-rose-500/10',
  infra: 'text-slate-300 border-slate-500/30 bg-slate-500/10',
  build_time: 'text-lime-400 border-lime-500/30 bg-lime-500/10',
  other: 'text-slate-400 border-slate-500/30 bg-slate-500/10',
};

const navigateToFeatureLab = () => {
  window.dispatchEvent(new CustomEvent('navigate-to-view', { detail: 'featurelab' }));
};

const AgentCodeConfiguration = () => {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'code' | 'config' | 'integration' | 'llm'>('overview');
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  useEffect(() => {
    loadAgents();
  }, []);

  const loadAgents = async () => {
    try {
      const [canonicalRes, aiRes] = await Promise.all([
        supabase.from('canonical_agents').select('*').order('category').order('name'),
        supabase.from('ai_agents').select('*'),
      ]);

      const canonicalRows = canonicalRes.data || [];
      const aiRows = aiRes.data || [];

      const aiByName = new Map<string, any>();
      aiRows.forEach((a) => {
        aiByName.set((a.name || '').toLowerCase(), a);
        aiByName.set((a.type || '').toLowerCase(), a);
      });

      const merged: Agent[] = canonicalRows.map((c: any) => {
        const aliasKeys = [c.name, c.slug, ...(c.aliases || [])].map((s: string) => (s || '').toLowerCase());
        const ai = aliasKeys.map((k) => aiByName.get(k)).find(Boolean);
        return {
          id: c.id,
          name: c.name,
          type: ai?.type || c.slug,
          description: c.role || ai?.description || '',
          optimization_method: c.agent_type || ai?.optimization_method || 'hybrid',
          config: ai?.config || {},
          category: c.category || 'other',
          aliases: c.aliases || [],
          cadence: c.cadence,
          owns_decision: c.owns_decision,
          phases: c.phases || [],
          source_files: c.source_files || [],
        };
      });

      const canonicalKeys = new Set<string>();
      canonicalRows.forEach((c: any) => {
        [c.name, c.slug, ...(c.aliases || [])].forEach((k: string) => canonicalKeys.add((k || '').toLowerCase()));
      });
      aiRows.forEach((a) => {
        if (!canonicalKeys.has((a.name || '').toLowerCase()) && !canonicalKeys.has((a.type || '').toLowerCase())) {
          merged.push({
            id: a.id,
            name: a.name,
            type: a.type,
            description: a.description || '',
            optimization_method: a.optimization_method || 'hybrid',
            config: a.config || {},
            category: 'other',
            aliases: [],
            cadence: 'on_demand',
            owns_decision: false,
            phases: [],
            source_files: [],
          });
        }
      });

      setAgents(merged);
      if (merged.length > 0) setSelectedAgent(merged[0]);
      setLoading(false);
    } catch (error) {
      console.error('Error loading agents:', error);
      setLoading(false);
    }
  };

  const categories = useMemo(() => {
    const set = new Set<string>();
    agents.forEach((a) => set.add(a.category || 'other'));
    return Array.from(set);
  }, [agents]);

  const filteredAgents = useMemo(() => {
    const q = search.trim().toLowerCase();
    return agents.filter((a) => {
      if (categoryFilter !== 'all' && (a.category || 'other') !== categoryFilter) return false;
      if (!q) return true;
      const hay = [a.name, a.type, a.description, ...(a.aliases || [])].join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [agents, search, categoryFilter]);

  const groupedAgents = useMemo(() => {
    const groups = new Map<string, Agent[]>();
    filteredAgents.forEach((a) => {
      const cat = a.category || 'other';
      if (!groups.has(cat)) groups.set(cat, []);
      groups.get(cat)!.push(a);
    });
    return Array.from(groups.entries());
  }, [filteredAgents]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getAgentImplementation = (agent: Agent) => {
    switch (agent.type) {
      case 'triage':
        return getTriageAgentCode();
      case 'enrichment':
        return getEnrichmentAgentCode();
      case 'investigation':
        return getInvestigationAgentCode();
      case 'response':
        return getResponseAgentCode();
      case 'orchestrator':
        return getOrchestratorAgentCode();
      default:
        return getGenericAgentCode();
    }
  };

  const getTriageAgentCode = () => `import asyncio
from typing import Dict, List, Any
from dataclasses import dataclass
import numpy as np
from sklearn.ensemble import RandomForestClassifier
import openai

@dataclass
class Alert:
    id: str
    title: str
    severity: str
    source: str
    timestamp: str
    indicators: Dict[str, Any]
    raw_data: Dict[str, Any]

class TriageAgent:
    """
    AI-Powered Alert Triage Agent

    Uses hybrid ML (Random Forest + LLM) to automatically triage security alerts,
    filter false positives, and assign accurate severity levels.

    Optimization Method: Hybrid (ML Classification + GPT-4 Reasoning)
    """

    def __init__(self, config: Dict[str, Any]):
        self.config = config
        self.ml_model = self._load_ml_model()
        self.false_positive_patterns = config.get('false_positive_patterns', [])
        self.auto_escalate_threshold = config.get('auto_escalate_threshold', 0.7)
        self.severity_rules = config.get('severity_rules', {})

    def _load_ml_model(self) -> RandomForestClassifier:
        """Load pre-trained Random Forest model for initial classification"""
        model = RandomForestClassifier(n_estimators=100, max_depth=10)
        # In production, load from saved model
        return model

    async def triage_alert(self, alert: Alert) -> Dict[str, Any]:
        """
        Main triage pipeline:
        1. Quick rule-based filtering
        2. ML-based classification
        3. LLM-enhanced reasoning for edge cases
        4. Confidence scoring
        """

        # Step 1: Fast rule-based checks
        if self._is_false_positive(alert):
            return {
                'action': 'dismiss',
                'confidence': 0.95,
                'reason': 'Matched known false positive pattern',
                'severity': 'info'
            }

        # Step 2: ML Classification
        features = self._extract_features(alert)
        ml_prediction = self.ml_model.predict_proba(features)[0]
        ml_confidence = np.max(ml_prediction)

        # Step 3: LLM Enhancement for low confidence cases
        if ml_confidence < self.auto_escalate_threshold:
            llm_analysis = await self._llm_analyze(alert)
            return self._merge_predictions(ml_prediction, llm_analysis)

        return {
            'action': self._get_action(ml_prediction),
            'confidence': ml_confidence,
            'severity': self._calculate_severity(alert, ml_prediction),
            'next_steps': self._recommend_actions(alert)
        }

    def _is_false_positive(self, alert: Alert) -> bool:
        """Check against known false positive patterns"""
        for pattern in self.false_positive_patterns:
            if pattern in str(alert.raw_data).lower():
                return True
        return False

    def _extract_features(self, alert: Alert) -> np.ndarray:
        """Extract ML features from alert"""
        features = [
            self._encode_source(alert.source),
            self._encode_severity(alert.severity),
            len(alert.indicators),
            self._calculate_ioc_reputation(alert.indicators),
            self._time_of_day_risk(alert.timestamp),
            self._historical_occurrence_rate(alert.title)
        ]
        return np.array(features).reshape(1, -1)

    async def _llm_analyze(self, alert: Alert) -> Dict[str, Any]:
        """Use GPT-4 for complex reasoning on ambiguous alerts"""
        prompt = f'''
        Analyze this security alert and provide triage recommendation:

        Title: {alert.title}
        Severity: {alert.severity}
        Source: {alert.source}
        Indicators: {alert.indicators}

        Provide:
        1. True/False Positive assessment
        2. Actual severity (low/medium/high/critical)
        3. Recommended actions
        4. Confidence score (0-1)
        '''

        response = await openai.ChatCompletion.acreate(
            model="gpt-4",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.1
        )

        return self._parse_llm_response(response.choices[0].message.content)

    def _calculate_severity(self, alert: Alert, prediction: np.ndarray) -> str:
        """Calculate final severity based on ML output and rules"""
        base_severity = alert.severity.lower()

        # Check severity rules
        for pattern, severity in self.severity_rules.items():
            if pattern in alert.title.lower():
                return severity

        # Use ML prediction
        severity_mapping = ['info', 'low', 'medium', 'high', 'critical']
        return severity_mapping[np.argmax(prediction)]

    def _recommend_actions(self, alert: Alert) -> List[str]:
        """Recommend next steps based on alert type"""
        actions = []

        if 'login' in alert.title.lower():
            actions.append('Check user behavior history')
            actions.append('Verify location against baseline')

        if 'malware' in alert.title.lower():
            actions.append('Isolate affected host')
            actions.append('Collect memory dump')
            actions.append('Scan related endpoints')

        return actions

# Usage Example
async def main():
    config = {
        'severity_rules': {
            'suspicious_login': 'high',
            'high_confidence_malware': 'critical'
        },
        'auto_escalate_threshold': 0.7,
        'false_positive_patterns': ['known_scanner', 'scheduled_maintenance']
    }

    agent = TriageAgent(config)

    alert = Alert(
        id='alert-123',
        title='Suspicious Login from Unknown Location',
        severity='medium',
        source='authentication_logs',
        timestamp='2025-10-14T10:30:00Z',
        indicators={'src_ip': '192.168.1.100', 'user': 'admin'},
        raw_data={}
    )

    result = await agent.triage_alert(alert)
    print(f"Triage Result: {result}")

if __name__ == "__main__":
    asyncio.run(main())`;

  const getEnrichmentAgentCode = () => `import asyncio
from typing import Dict, List, Any, Optional
import aiohttp
from datetime import datetime, timedelta
import hashlib

class ThreatEnrichmentAgent:
    """
    Threat Intelligence Enrichment Agent

    Enriches IOCs (IPs, domains, hashes) with threat intelligence from
    multiple feeds using TAO (Threat Actor Optimization) method.

    Optimization Method: TAO (Threat Attribution Optimization)
    """

    def __init__(self, config: Dict[str, Any]):
        self.config = config
        self.threat_feeds = config.get('threat_feeds', [])
        self.enrichment_fields = config.get('enrichment_fields', [])
        self.cache = {}
        self.cache_ttl = timedelta(hours=24)

    async def enrich_ioc(self, ioc_value: str, ioc_type: str) -> Dict[str, Any]:
        """
        Enrich a single IOC with threat intelligence

        Args:
            ioc_value: The IOC value (IP, domain, hash)
            ioc_type: Type of IOC (ip, domain, hash)

        Returns:
            Enriched IOC data with reputation, campaigns, etc.
        """

        # Check cache first
        cache_key = self._get_cache_key(ioc_value, ioc_type)
        if cache_key in self.cache:
            cached_data, timestamp = self.cache[cache_key]
            if datetime.now() - timestamp < self.cache_ttl:
                return cached_data

        # Parallel enrichment from multiple feeds
        tasks = []
        for feed in self.threat_feeds:
            tasks.append(self._query_feed(feed, ioc_value, ioc_type))

        results = await asyncio.gather(*tasks, return_exceptions=True)

        # Aggregate results
        enriched_data = self._aggregate_results(results, ioc_value, ioc_type)

        # Cache result
        self.cache[cache_key] = (enriched_data, datetime.now())

        return enriched_data

    async def _query_feed(self, feed: str, ioc: str, ioc_type: str) -> Dict[str, Any]:
        """Query individual threat feed"""

        if feed == 'alienvault':
            return await self._query_alienvault(ioc, ioc_type)
        elif feed == 'abuse.ch':
            return await self._query_abusech(ioc, ioc_type)
        elif feed == 'emergingthreats':
            return await self._query_emerging_threats(ioc, ioc_type)
        else:
            return {}

    async def _query_alienvault(self, ioc: str, ioc_type: str) -> Dict[str, Any]:
        """Query AlienVault OTX"""
        async with aiohttp.ClientSession() as session:
            url = f"https://otx.alienvault.com/api/v1/indicators/{ioc_type}/{ioc}/general"
            headers = {'X-OTX-API-KEY': 'YOUR_API_KEY'}

            async with session.get(url, headers=headers) as response:
                if response.status == 200:
                    data = await response.json()
                    return {
                        'source': 'alienvault',
                        'reputation': data.get('reputation', 0),
                        'pulses': data.get('pulse_info', {}).get('count', 0),
                        'related_campaigns': [p['name'] for p in data.get('pulse_info', {}).get('pulses', [])[:5]]
                    }
        return {}

    async def _query_abusech(self, ioc: str, ioc_type: str) -> Dict[str, Any]:
        """Query Abuse.ch"""
        if ioc_type != 'hash':
            return {}

        async with aiohttp.ClientSession() as session:
            url = "https://mb-api.abuse.ch/api/v1/"
            data = {'query': 'get_info', 'hash': ioc}

            async with session.post(url, data=data) as response:
                if response.status == 200:
                    result = await response.json()
                    return {
                        'source': 'abuse.ch',
                        'malware_family': result.get('data', [{}])[0].get('signature', 'unknown'),
                        'first_seen': result.get('data', [{}])[0].get('first_seen', None)
                    }
        return {}

    async def _query_emerging_threats(self, ioc: str, ioc_type: str) -> Dict[str, Any]:
        """Query Emerging Threats"""
        # Simplified - in production use actual ET API
        return {
            'source': 'emergingthreats',
            'categories': ['malware', 'c2'],
            'confidence': 0.85
        }

    def _aggregate_results(self, results: List[Dict], ioc: str, ioc_type: str) -> Dict[str, Any]:
        """Aggregate enrichment results from multiple sources"""

        aggregated = {
            'ioc': ioc,
            'ioc_type': ioc_type,
            'enriched_at': datetime.now().isoformat(),
            'sources': [],
            'reputation': 0,
            'threat_level': 'unknown',
            'malware_families': [],
            'campaigns': [],
            'categories': set(),
            'first_seen': None,
            'last_seen': None
        }

        reputation_scores = []

        for result in results:
            if isinstance(result, dict) and result:
                source = result.get('source')
                aggregated['sources'].append(source)

                if 'reputation' in result:
                    reputation_scores.append(result['reputation'])

                if 'malware_family' in result:
                    aggregated['malware_families'].append(result['malware_family'])

                if 'related_campaigns' in result:
                    aggregated['campaigns'].extend(result['related_campaigns'])

                if 'categories' in result:
                    aggregated['categories'].update(result['categories'])

                if 'first_seen' in result and result['first_seen']:
                    if not aggregated['first_seen'] or result['first_seen'] < aggregated['first_seen']:
                        aggregated['first_seen'] = result['first_seen']

        # Calculate average reputation
        if reputation_scores:
            aggregated['reputation'] = sum(reputation_scores) / len(reputation_scores)

            if aggregated['reputation'] < 30:
                aggregated['threat_level'] = 'critical'
            elif aggregated['reputation'] < 50:
                aggregated['threat_level'] = 'high'
            elif aggregated['reputation'] < 70:
                aggregated['threat_level'] = 'medium'
            else:
                aggregated['threat_level'] = 'low'

        aggregated['categories'] = list(aggregated['categories'])

        return aggregated

    def _get_cache_key(self, ioc: str, ioc_type: str) -> str:
        """Generate cache key"""
        return hashlib.md5(f"{ioc_type}:{ioc}".encode()).hexdigest()

# Usage Example
async def main():
    config = {
        'threat_feeds': ['alienvault', 'abuse.ch', 'emergingthreats'],
        'enrichment_fields': ['reputation', 'geolocation', 'first_seen', 'last_seen', 'related_campaigns']
    }

    agent = ThreatEnrichmentAgent(config)

    # Enrich IP address
    result = await agent.enrich_ioc('192.168.1.100', 'ip')
    print(f"Enrichment Result: {result}")

if __name__ == "__main__":
    asyncio.run(main())`;

  const getInvestigationAgentCode = () => `import asyncio
from typing import Dict, List, Any, Set
from datetime import datetime, timedelta
from dataclasses import dataclass
import networkx as nx

@dataclass
class InvestigationContext:
    trigger_event: str
    start_time: datetime
    scope: List[str]
    entities: Set[str]
    findings: List[Dict]

class InvestigationAgent:
    """
    Automated Investigation Agent

    Conducts deep investigations using ALHF (Adaptive Learning from Human Feedback)
    to correlate events across network, endpoint, and authentication logs.

    Optimization Method: ALHF (Adaptive Learning from Human Feedback)
    """

    def __init__(self, config: Dict[str, Any]):
        self.config = config
        self.behavioral_analysis = config.get('behavioral_analysis', True)
        self.investigation_scope = config.get('investigation_scope', [])
        self.correlation_window_hours = config.get('correlation_window_hours', 24)
        self.graph = nx.DiGraph()

    async def investigate(self, trigger_alert: Dict[str, Any]) -> Dict[str, Any]:
        """
        Main investigation pipeline:
        1. Initialize context
        2. Gather related events
        3. Build attack graph
        4. Analyze patterns
        5. Generate findings
        """

        context = self._initialize_context(trigger_alert)

        # Phase 1: Data Collection
        related_events = await self._gather_related_events(context)

        # Phase 2: Graph Construction
        attack_graph = self._build_attack_graph(related_events)

        # Phase 3: Pattern Analysis
        patterns = self._analyze_patterns(attack_graph, context)

        # Phase 4: Behavioral Analysis
        if self.behavioral_analysis:
            behavioral_insights = self._analyze_behavior(related_events, context)
            patterns.update(behavioral_insights)

        # Phase 5: Generate Report
        investigation_report = self._generate_report(context, patterns, attack_graph)

        return investigation_report

    def _initialize_context(self, trigger_alert: Dict) -> InvestigationContext:
        """Initialize investigation context"""
        return InvestigationContext(
            trigger_event=trigger_alert['id'],
            start_time=datetime.now() - timedelta(hours=self.correlation_window_hours),
            scope=self.investigation_scope,
            entities={trigger_alert.get('src_ip'), trigger_alert.get('user')},
            findings=[]
        )

    async def _gather_related_events(self, context: InvestigationContext) -> List[Dict]:
        """Gather all related events from multiple sources"""
        events = []

        # Parallel data gathering
        tasks = []
        for scope in context.scope:
            if scope == 'network_logs':
                tasks.append(self._query_network_logs(context))
            elif scope == 'endpoint_logs':
                tasks.append(self._query_endpoint_logs(context))
            elif scope == 'authentication_logs':
                tasks.append(self._query_auth_logs(context))

        results = await asyncio.gather(*tasks)
        for result in results:
            events.extend(result)

        return events

    async def _query_network_logs(self, context: InvestigationContext) -> List[Dict]:
        """Query network logs for related events"""
        # Simulated - replace with actual query
        return [
            {
                'type': 'network',
                'timestamp': datetime.now().isoformat(),
                'src_ip': '192.168.1.100',
                'dst_ip': '10.0.0.50',
                'port': 445,
                'protocol': 'smb',
                'bytes': 1024000
            }
        ]

    async def _query_endpoint_logs(self, context: InvestigationContext) -> List[Dict]:
        """Query endpoint logs"""
        return [
            {
                'type': 'endpoint',
                'timestamp': datetime.now().isoformat(),
                'hostname': 'WKS-001',
                'process': 'powershell.exe',
                'command_line': 'IEX (New-Object Net.WebClient).DownloadString(...)',
                'parent_process': 'winword.exe'
            }
        ]

    async def _query_auth_logs(self, context: InvestigationContext) -> List[Dict]:
        """Query authentication logs"""
        return [
            {
                'type': 'authentication',
                'timestamp': datetime.now().isoformat(),
                'user': 'admin',
                'action': 'login',
                'result': 'success',
                'src_ip': '192.168.1.100'
            }
        ]

    def _build_attack_graph(self, events: List[Dict]) -> nx.DiGraph:
        """Build directed graph of attack progression"""
        G = nx.DiGraph()

        for event in sorted(events, key=lambda x: x['timestamp']):
            event_id = f"{event['type']}_{event['timestamp']}"
            G.add_node(event_id, **event)

            # Connect to related entities
            if 'src_ip' in event:
                G.add_edge(event['src_ip'], event_id)
            if 'user' in event:
                G.add_edge(event['user'], event_id)
            if 'hostname' in event:
                G.add_edge(event['hostname'], event_id)

        return G

    def _analyze_patterns(self, graph: nx.DiGraph, context: InvestigationContext) -> Dict[str, Any]:
        """Analyze attack patterns using graph analysis"""
        patterns = {
            'attack_chain': [],
            'lateral_movement': False,
            'persistence': False,
            'data_exfiltration': False,
            'privilege_escalation': False
        }

        # Detect lateral movement
        if self._detect_lateral_movement(graph):
            patterns['lateral_movement'] = True
            patterns['attack_chain'].append('Lateral Movement Detected')

        # Detect persistence mechanisms
        if self._detect_persistence(graph):
            patterns['persistence'] = True
            patterns['attack_chain'].append('Persistence Mechanism Found')

        # Detect data exfiltration
        if self._detect_exfiltration(graph):
            patterns['data_exfiltration'] = True
            patterns['attack_chain'].append('Data Exfiltration Detected')

        return patterns

    def _detect_lateral_movement(self, graph: nx.DiGraph) -> bool:
        """Detect lateral movement patterns"""
        # Check for multiple host connections
        hosts = [n for n in graph.nodes() if 'hostname' in str(n) or 'WKS' in str(n)]
        return len(hosts) > 2

    def _detect_persistence(self, graph: nx.DiGraph) -> bool:
        """Detect persistence mechanisms"""
        for node in graph.nodes():
            node_data = graph.nodes[node]
            if 'command_line' in node_data:
                cmd = node_data['command_line'].lower()
                if any(p in cmd for p in ['scheduled task', 'registry run', 'startup folder']):
                    return True
        return False

    def _detect_exfiltration(self, graph: nx.DiGraph) -> bool:
        """Detect data exfiltration"""
        for node in graph.nodes():
            node_data = graph.nodes[node]
            if node_data.get('type') == 'network' and node_data.get('bytes', 0) > 100000:
                return True
        return False

    def _analyze_behavior(self, events: List[Dict], context: InvestigationContext) -> Dict[str, Any]:
        """Behavioral analysis of events"""
        return {
            'anomaly_score': 0.75,
            'baseline_deviation': 'high',
            'risk_indicators': ['unusual_process', 'off_hours_activity', 'high_data_volume']
        }

    def _generate_report(self, context: InvestigationContext, patterns: Dict, graph: nx.DiGraph) -> Dict[str, Any]:
        """Generate investigation report"""
        return {
            'investigation_id': f"inv_{context.trigger_event}",
            'status': 'completed',
            'findings': {
                'severity': 'high' if patterns['lateral_movement'] else 'medium',
                'attack_chain': patterns['attack_chain'],
                'entities_involved': len(graph.nodes()),
                'timeline_hours': self.correlation_window_hours,
                'patterns_detected': patterns
            },
            'recommendations': self._generate_recommendations(patterns),
            'completed_at': datetime.now().isoformat()
        }

    def _generate_recommendations(self, patterns: Dict) -> List[str]:
        """Generate remediation recommendations"""
        recommendations = []

        if patterns['lateral_movement']:
            recommendations.append('Isolate affected hosts immediately')
            recommendations.append('Reset credentials for compromised accounts')

        if patterns['persistence']:
            recommendations.append('Remove persistence mechanisms')
            recommendations.append('Scan for additional backdoors')

        if patterns['data_exfiltration']:
            recommendations.append('Block external C2 connections')
            recommendations.append('Audit data access logs')

        return recommendations

# Usage
async def main():
    config = {
        'behavioral_analysis': True,
        'investigation_scope': ['network_logs', 'endpoint_logs', 'authentication_logs'],
        'correlation_window_hours': 24
    }

    agent = InvestigationAgent(config)

    trigger = {
        'id': 'alert-456',
        'title': 'Suspicious PowerShell Execution',
        'src_ip': '192.168.1.100',
        'user': 'admin'
    }

    report = await agent.investigate(trigger)
    print(f"Investigation Report: {report}")

if __name__ == "__main__":
    asyncio.run(main())`;

  const getResponseAgentCode = () => `import asyncio
import logging
from typing import Dict, List, Any, Optional
from datetime import datetime
from enum import Enum
import aiohttp
from dataclasses import dataclass

logger = logging.getLogger(__name__)

class ResponseAction(Enum):
    BLOCK_IP = "block_ip"
    ISOLATE_HOST = "isolate_host"
    DISABLE_ACCOUNT = "disable_account"
    UPDATE_FIREWALL = "update_firewall"
    KILL_PROCESS = "kill_process"
    QUARANTINE_FILE = "quarantine_file"
    REVOKE_TOKEN = "revoke_token"

@dataclass
class ResponseResult:
    action: ResponseAction
    success: bool
    message: str
    rollback_id: Optional[str]
    timestamp: datetime
    execution_time_ms: float

class AutomatedResponseAgent:
    """
    Automated Response Agent

    Executes automated response actions with safety checks, rollback capabilities,
    and comprehensive audit logging. Uses hybrid approach with ML safety validation.

    Optimization Method: Hybrid (Rule-based + ML Safety Checks)
    """

    def __init__(self, config: Dict[str, Any]):
        self.config = config
        self.allowed_actions = [ResponseAction[a.upper()] for a in config.get('allowed_actions', [])]
        self.rollback_enabled = config.get('rollback_enabled', True)
        self.approval_required = config.get('approval_required', False)
        self.dry_run = config.get('dry_run', False)

        # Safety thresholds
        self.max_hosts_per_action = config.get('max_hosts_per_action', 10)
        self.max_accounts_per_action = config.get('max_accounts_per_action', 5)
        self.require_confirmation_severity = config.get('require_confirmation_severity', 'critical')

        # Integration endpoints
        self.firewall_api = config.get('firewall_api_url')
        self.edr_api = config.get('edr_api_url')
        self.iam_api = config.get('iam_api_url')

        # Rollback tracking
        self.rollback_stack = []

        # Metrics
        self.actions_executed = 0
        self.actions_rolled_back = 0
        self.actions_failed = 0

    async def execute_response(
        self,
        action: ResponseAction,
        target: str,
        context: Dict[str, Any],
        severity: str = 'high'
    ) -> ResponseResult:
        """
        Execute automated response action with safety checks

        Args:
            action: Type of response action
            target: Target entity (IP, hostname, username, etc.)
            context: Additional context from investigation
            severity: Severity level of the threat

        Returns:
            ResponseResult with execution details
        """
        start_time = datetime.now()

        try:
            # Step 1: Pre-execution validation
            validation = await self._validate_action(action, target, context, severity)
            if not validation['allowed']:
                logger.warning(f"Action {action} blocked: {validation['reason']}")
                return ResponseResult(
                    action=action,
                    success=False,
                    message=f"Blocked: {validation['reason']}",
                    rollback_id=None,
                    timestamp=start_time,
                    execution_time_ms=0
                )

            # Step 2: Check if approval required
            if self.approval_required or severity == self.require_confirmation_severity:
                approval = await self._request_approval(action, target, context)
                if not approval:
                    return ResponseResult(
                        action=action,
                        success=False,
                        message="Awaiting human approval",
                        rollback_id=None,
                        timestamp=start_time,
                        execution_time_ms=0
                    )

            # Step 3: Create rollback point
            rollback_id = None
            if self.rollback_enabled:
                rollback_id = await self._create_rollback_point(action, target, context)

            # Step 4: Execute action
            if self.dry_run:
                result = await self._simulate_action(action, target, context)
            else:
                result = await self._execute_action(action, target, context)

            execution_time = (datetime.now() - start_time).total_seconds() * 1000

            # Step 5: Update metrics and audit log
            self.actions_executed += 1
            await self._audit_log(action, target, result, context, rollback_id)

            return ResponseResult(
                action=action,
                success=result['success'],
                message=result['message'],
                rollback_id=rollback_id if result['success'] else None,
                timestamp=start_time,
                execution_time_ms=execution_time
            )

        except Exception as e:
            self.actions_failed += 1
            logger.error(f"Failed to execute {action} on {target}: {str(e)}")
            return ResponseResult(
                action=action,
                success=False,
                message=f"Execution failed: {str(e)}",
                rollback_id=None,
                timestamp=start_time,
                execution_time_ms=0
            )

    async def _validate_action(
        self,
        action: ResponseAction,
        target: str,
        context: Dict[str, Any],
        severity: str
    ) -> Dict[str, Any]:
        """Validate if action is safe and allowed"""

        # Check if action is in allowed list
        if action not in self.allowed_actions:
            return {'allowed': False, 'reason': f'Action {action} not in allowed list'}

        # Check blast radius limits
        if action == ResponseAction.ISOLATE_HOST:
            affected_hosts = context.get('affected_hosts', [target])
            if len(affected_hosts) > self.max_hosts_per_action:
                return {
                    'allowed': False,
                    'reason': f'Would affect {len(affected_hosts)} hosts, limit is {self.max_hosts_per_action}'
                }

        if action == ResponseAction.DISABLE_ACCOUNT:
            if self._is_critical_account(target):
                return {'allowed': False, 'reason': 'Target is critical service account'}

        # ML-based safety check
        risk_score = await self._calculate_action_risk(action, target, context)
        if risk_score > 0.8:
            return {
                'allowed': False,
                'reason': f'Action risk score too high: {risk_score:.2f}'
            }

        return {'allowed': True, 'reason': 'Validation passed'}

    async def _execute_action(
        self,
        action: ResponseAction,
        target: str,
        context: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Execute the actual response action"""

        if action == ResponseAction.BLOCK_IP:
            return await self._block_ip(target, context)
        elif action == ResponseAction.ISOLATE_HOST:
            return await self._isolate_host(target, context)
        elif action == ResponseAction.DISABLE_ACCOUNT:
            return await self._disable_account(target, context)
        elif action == ResponseAction.UPDATE_FIREWALL:
            return await self._update_firewall(target, context)
        elif action == ResponseAction.KILL_PROCESS:
            return await self._kill_process(target, context)
        elif action == ResponseAction.QUARANTINE_FILE:
            return await self._quarantine_file(target, context)
        elif action == ResponseAction.REVOKE_TOKEN:
            return await self._revoke_token(target, context)
        else:
            return {'success': False, 'message': f'Unknown action: {action}'}

    async def _block_ip(self, ip: str, context: Dict) -> Dict[str, Any]:
        """Block IP address at firewall/WAF"""
        async with aiohttp.ClientSession() as session:
            headers = {'Authorization': f'Bearer {self.config.get("firewall_api_key")}'}
            payload = {
                'action': 'block',
                'ip': ip,
                'duration': context.get('block_duration', 3600),
                'reason': context.get('reason', 'Automated threat response')
            }

            async with session.post(
                f"{self.firewall_api}/rules/block",
                json=payload,
                headers=headers
            ) as response:
                if response.status == 200:
                    data = await response.json()
                    return {
                        'success': True,
                        'message': f'Successfully blocked IP {ip}',
                        'rule_id': data.get('rule_id')
                    }
                else:
                    return {
                        'success': False,
                        'message': f'Failed to block IP: {response.status}'
                    }

    async def _isolate_host(self, hostname: str, context: Dict) -> Dict[str, Any]:
        """Isolate endpoint via EDR"""
        async with aiohttp.ClientSession() as session:
            headers = {'Authorization': f'Bearer {self.config.get("edr_api_key")}'}
            payload = {
                'hostname': hostname,
                'action': 'isolate',
                'reason': context.get('reason', 'Suspicious activity detected')
            }

            async with session.post(
                f"{self.edr_api}/hosts/{hostname}/isolate",
                json=payload,
                headers=headers
            ) as response:
                if response.status == 200:
                    return {
                        'success': True,
                        'message': f'Successfully isolated host {hostname}'
                    }
                else:
                    return {
                        'success': False,
                        'message': f'Failed to isolate host: {response.status}'
                    }

    async def _disable_account(self, username: str, context: Dict) -> Dict[str, Any]:
        """Disable user account via IAM"""
        async with aiohttp.ClientSession() as session:
            headers = {'Authorization': f'Bearer {self.config.get("iam_api_key")}'}
            payload = {
                'username': username,
                'action': 'disable',
                'reason': context.get('reason', 'Account compromise suspected')
            }

            async with session.patch(
                f"{self.iam_api}/users/{username}",
                json=payload,
                headers=headers
            ) as response:
                if response.status == 200:
                    return {
                        'success': True,
                        'message': f'Successfully disabled account {username}'
                    }
                else:
                    return {
                        'success': False,
                        'message': f'Failed to disable account: {response.status}'
                    }

    async def _update_firewall(self, rule: str, context: Dict) -> Dict[str, Any]:
        """Update firewall rules"""
        # Implementation for firewall rule updates
        return {'success': True, 'message': 'Firewall rule updated'}

    async def _kill_process(self, process_id: str, context: Dict) -> Dict[str, Any]:
        """Kill malicious process on endpoint"""
        # Implementation for process termination via EDR
        return {'success': True, 'message': 'Process terminated'}

    async def _quarantine_file(self, file_path: str, context: Dict) -> Dict[str, Any]:
        """Quarantine malicious file"""
        # Implementation for file quarantine
        return {'success': True, 'message': 'File quarantined'}

    async def _revoke_token(self, token_id: str, context: Dict) -> Dict[str, Any]:
        """Revoke authentication token"""
        # Implementation for token revocation
        return {'success': True, 'message': 'Token revoked'}

    async def _create_rollback_point(
        self,
        action: ResponseAction,
        target: str,
        context: Dict
    ) -> str:
        """Create rollback checkpoint"""
        rollback_id = f"rb_{datetime.now().timestamp()}"

        rollback_info = {
            'id': rollback_id,
            'action': action.value,
            'target': target,
            'context': context,
            'timestamp': datetime.now().isoformat()
        }

        self.rollback_stack.append(rollback_info)

        # Store in database for persistence
        # await self._store_rollback_info(rollback_info)

        return rollback_id

    async def rollback_action(self, rollback_id: str) -> bool:
        """Rollback a previous action"""
        rollback_info = next((r for r in self.rollback_stack if r['id'] == rollback_id), None)

        if not rollback_info:
            logger.error(f"Rollback ID {rollback_id} not found")
            return False

        try:
            action = ResponseAction(rollback_info['action'])
            target = rollback_info['target']

            # Execute reverse action
            if action == ResponseAction.BLOCK_IP:
                await self._unblock_ip(target)
            elif action == ResponseAction.ISOLATE_HOST:
                await self._unisolate_host(target)
            elif action == ResponseAction.DISABLE_ACCOUNT:
                await self._enable_account(target)

            self.actions_rolled_back += 1
            logger.info(f"Successfully rolled back action {rollback_id}")
            return True

        except Exception as e:
            logger.error(f"Failed to rollback {rollback_id}: {str(e)}")
            return False

    async def _calculate_action_risk(
        self,
        action: ResponseAction,
        target: str,
        context: Dict
    ) -> float:
        """ML-based risk assessment for action"""
        # Simple heuristic-based risk calculation
        # In production, use trained ML model

        risk_score = 0.0

        # Business hours check
        current_hour = datetime.now().hour
        if 9 <= current_hour <= 17:
            risk_score += 0.2  # Higher risk during business hours

        # Critical infrastructure check
        if self._is_critical_system(target):
            risk_score += 0.4

        # Action severity
        action_severity = {
            ResponseAction.BLOCK_IP: 0.3,
            ResponseAction.ISOLATE_HOST: 0.5,
            ResponseAction.DISABLE_ACCOUNT: 0.6,
            ResponseAction.UPDATE_FIREWALL: 0.4
        }
        risk_score += action_severity.get(action, 0.5)

        return min(risk_score, 1.0)

    def _is_critical_account(self, username: str) -> bool:
        """Check if account is critical service account"""
        critical_accounts = self.config.get('critical_accounts', [])
        return username in critical_accounts or username.startswith('svc_')

    def _is_critical_system(self, target: str) -> bool:
        """Check if system is critical infrastructure"""
        critical_systems = self.config.get('critical_systems', [])
        return target in critical_systems

    async def _request_approval(
        self,
        action: ResponseAction,
        target: str,
        context: Dict
    ) -> bool:
        """Request human approval for action"""
        # In production, integrate with approval workflow system
        logger.info(f"Approval required for {action} on {target}")
        return True  # Auto-approve in this example

    async def _simulate_action(
        self,
        action: ResponseAction,
        target: str,
        context: Dict
    ) -> Dict[str, Any]:
        """Simulate action execution (dry-run mode)"""
        logger.info(f"[DRY RUN] Would execute {action} on {target}")
        return {
            'success': True,
            'message': f'[DRY RUN] Action {action} simulated successfully'
        }

    async def _audit_log(
        self,
        action: ResponseAction,
        target: str,
        result: Dict,
        context: Dict,
        rollback_id: Optional[str]
    ):
        """Log action to audit trail"""
        audit_entry = {
            'timestamp': datetime.now().isoformat(),
            'action': action.value,
            'target': target,
            'result': result,
            'context': context,
            'rollback_id': rollback_id,
            'agent': 'AutomatedResponseAgent'
        }

        # Store in audit log
        logger.info(f"AUDIT: {audit_entry}")

    async def _unblock_ip(self, ip: str):
        """Unblock previously blocked IP"""
        pass

    async def _unisolate_host(self, hostname: str):
        """Remove host isolation"""
        pass

    async def _enable_account(self, username: str):
        """Re-enable disabled account"""
        pass

    def get_metrics(self) -> Dict[str, Any]:
        """Get agent performance metrics"""
        return {
            'actions_executed': self.actions_executed,
            'actions_rolled_back': self.actions_rolled_back,
            'actions_failed': self.actions_failed,
            'success_rate': self.actions_executed / max(self.actions_executed + self.actions_failed, 1)
        }

# Usage Example
async def main():
    config = {
        'allowed_actions': ['block_ip', 'isolate_host', 'disable_account', 'update_firewall'],
        'rollback_enabled': True,
        'approval_required': False,
        'dry_run': False,
        'max_hosts_per_action': 10,
        'max_accounts_per_action': 5,
        'firewall_api_url': 'https://firewall.company.com/api',
        'edr_api_url': 'https://edr.company.com/api',
        'iam_api_url': 'https://iam.company.com/api',
        'critical_accounts': ['admin', 'root', 'svc_database'],
        'critical_systems': ['dc01.corp', 'db-prod-01']
    }

    agent = AutomatedResponseAgent(config)

    # Execute response
    result = await agent.execute_response(
        action=ResponseAction.BLOCK_IP,
        target='192.168.1.100',
        context={
            'reason': 'C2 communication detected',
            'threat_score': 0.92,
            'investigation_id': 'inv-12345'
        },
        severity='high'
    )

    print(f"Response Result: {result}")

    # Rollback if needed
    if result.rollback_id:
        await agent.rollback_action(result.rollback_id)

if __name__ == "__main__":
    asyncio.run(main())`;

  const getOrchestratorAgentCode = () => `import asyncio
import logging
from typing import Dict, List, Any, Optional, Set
from datetime import datetime
from enum import Enum
from dataclasses import dataclass, field
import uuid

logger = logging.getLogger(__name__)

class WorkflowStatus(Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    PAUSED = "paused"

class AgentType(Enum):
    TRIAGE = "triage"
    ENRICHMENT = "enrichment"
    INVESTIGATION = "investigation"
    RESPONSE = "response"

@dataclass
class WorkflowStep:
    step_id: str
    agent_type: AgentType
    inputs: Dict[str, Any]
    outputs: Dict[str, Any] = field(default_factory=dict)
    status: WorkflowStatus = WorkflowStatus.PENDING
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    error: Optional[str] = None
    dependencies: List[str] = field(default_factory=list)

@dataclass
class Workflow:
    workflow_id: str
    template_name: str
    trigger_event: Dict[str, Any]
    steps: List[WorkflowStep]
    status: WorkflowStatus
    created_at: datetime
    completed_at: Optional[datetime] = None
    context: Dict[str, Any] = field(default_factory=dict)

class OrchestrationAgent:
    """
    Multi-Agent Orchestration Engine

    Coordinates multiple specialized agents to execute complex security workflows.
    Manages dependencies, parallel execution, error handling, and escalation.

    Optimization Method: Hybrid (Rule-based Orchestration + Dynamic Optimization)
    """

    def __init__(self, config: Dict[str, Any]):
        self.config = config
        self.escalation_rules = config.get('escalation_rules', {})
        self.workflow_templates = self._load_workflow_templates(
            config.get('workflow_templates', [])
        )
        self.max_parallel_agents = config.get('max_parallel_agents', 5)

        # Agent registry
        self.registered_agents = {}

        # Active workflows
        self.active_workflows: Dict[str, Workflow] = {}

        # Metrics
        self.workflows_executed = 0
        self.workflows_succeeded = 0
        self.workflows_failed = 0
        self.total_execution_time_ms = 0

    def register_agent(self, agent_type: AgentType, agent_instance: Any):
        """Register a specialized agent"""
        self.registered_agents[agent_type] = agent_instance
        logger.info(f"Registered {agent_type.value} agent")

    async def execute_workflow(
        self,
        template_name: str,
        trigger_event: Dict[str, Any],
        context: Optional[Dict[str, Any]] = None
    ) -> Workflow:
        """
        Execute a security workflow based on template

        Args:
            template_name: Name of workflow template
            trigger_event: Event that triggered the workflow
            context: Additional context data

        Returns:
            Completed workflow with all results
        """
        start_time = datetime.now()

        # Create workflow instance
        workflow = self._create_workflow(template_name, trigger_event, context or {})
        self.active_workflows[workflow.workflow_id] = workflow
        workflow.status = WorkflowStatus.RUNNING

        logger.info(f"Starting workflow {workflow.workflow_id} ({template_name})")

        try:
            # Execute workflow steps
            await self._execute_workflow_steps(workflow)

            # Check for escalation conditions
            if self._should_escalate(workflow):
                await self._escalate_workflow(workflow)

            workflow.status = WorkflowStatus.COMPLETED
            workflow.completed_at = datetime.now()
            self.workflows_succeeded += 1

            logger.info(f"Workflow {workflow.workflow_id} completed successfully")

        except Exception as e:
            workflow.status = WorkflowStatus.FAILED
            workflow.completed_at = datetime.now()
            self.workflows_failed += 1
            logger.error(f"Workflow {workflow.workflow_id} failed: {str(e)}")

        finally:
            execution_time = (datetime.now() - start_time).total_seconds() * 1000
            self.total_execution_time_ms += execution_time
            self.workflows_executed += 1

            # Cleanup
            del self.active_workflows[workflow.workflow_id]

        return workflow

    async def _execute_workflow_steps(self, workflow: Workflow):
        """Execute all workflow steps respecting dependencies"""

        # Build dependency graph
        dependency_graph = self._build_dependency_graph(workflow.steps)

        # Track completed steps
        completed_steps: Set[str] = set()

        while len(completed_steps) < len(workflow.steps):
            # Find steps ready to execute (all dependencies met)
            ready_steps = [
                step for step in workflow.steps
                if step.status == WorkflowStatus.PENDING
                and all(dep in completed_steps for dep in step.dependencies)
            ]

            if not ready_steps:
                # Check if we're stuck
                pending_steps = [s for s in workflow.steps if s.status == WorkflowStatus.PENDING]
                if pending_steps:
                    raise Exception(f"Workflow deadlock detected. Pending steps: {[s.step_id for s in pending_steps]}")
                break

            # Execute ready steps in parallel (up to max_parallel_agents)
            batch_size = min(len(ready_steps), self.max_parallel_agents)
            batch = ready_steps[:batch_size]

            logger.info(f"Executing batch of {len(batch)} steps")

            tasks = [self._execute_step(step, workflow) for step in batch]
            results = await asyncio.gather(*tasks, return_exceptions=True)

            # Process results
            for step, result in zip(batch, results):
                if isinstance(result, Exception):
                    step.status = WorkflowStatus.FAILED
                    step.error = str(result)
                    logger.error(f"Step {step.step_id} failed: {str(result)}")
                    raise result
                else:
                    completed_steps.add(step.step_id)

    async def _execute_step(self, step: WorkflowStep, workflow: Workflow) -> Dict[str, Any]:
        """Execute a single workflow step"""
        step.status = WorkflowStatus.RUNNING
        step.started_at = datetime.now()

        logger.info(f"Executing step {step.step_id} ({step.agent_type.value})")

        try:
            # Get the registered agent
            agent = self.registered_agents.get(step.agent_type)
            if not agent:
                raise Exception(f"No agent registered for type {step.agent_type}")

            # Prepare inputs from context and previous steps
            inputs = self._prepare_step_inputs(step, workflow)

            # Execute agent-specific logic
            result = await self._call_agent(agent, step.agent_type, inputs)

            # Store outputs
            step.outputs = result
            step.status = WorkflowStatus.COMPLETED
            step.completed_at = datetime.now()

            # Update workflow context
            workflow.context[step.step_id] = result

            logger.info(f"Step {step.step_id} completed successfully")

            return result

        except Exception as e:
            step.status = WorkflowStatus.FAILED
            step.error = str(e)
            step.completed_at = datetime.now()
            raise

    async def _call_agent(
        self,
        agent: Any,
        agent_type: AgentType,
        inputs: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Call appropriate agent method based on type"""

        if agent_type == AgentType.TRIAGE:
            # Call triage agent
            result = await agent.triage_alert(inputs['alert'])
            return result

        elif agent_type == AgentType.ENRICHMENT:
            # Call enrichment agent
            ioc_results = []
            for ioc in inputs.get('iocs', []):
                result = await agent.enrich_ioc(ioc['value'], ioc['type'])
                ioc_results.append(result)
            return {'enriched_iocs': ioc_results}

        elif agent_type == AgentType.INVESTIGATION:
            # Call investigation agent
            result = await agent.investigate(inputs['trigger_alert'])
            return result

        elif agent_type == AgentType.RESPONSE:
            # Call response agent
            result = await agent.execute_response(
                action=inputs['action'],
                target=inputs['target'],
                context=inputs.get('context', {}),
                severity=inputs.get('severity', 'high')
            )
            return {'response_result': result}

        else:
            raise Exception(f"Unknown agent type: {agent_type}")

    def _prepare_step_inputs(self, step: WorkflowStep, workflow: Workflow) -> Dict[str, Any]:
        """Prepare inputs for step from dependencies and context"""
        inputs = dict(step.inputs)

        # Resolve dependencies
        for dep_id in step.dependencies:
            if dep_id in workflow.context:
                inputs[f"{dep_id}_output"] = workflow.context[dep_id]

        # Add workflow context
        inputs['workflow_context'] = workflow.context
        inputs['trigger_event'] = workflow.trigger_event

        return inputs

    def _build_dependency_graph(self, steps: List[WorkflowStep]) -> Dict[str, List[str]]:
        """Build dependency graph for workflow steps"""
        graph = {}
        for step in steps:
            graph[step.step_id] = step.dependencies
        return graph

    def _create_workflow(
        self,
        template_name: str,
        trigger_event: Dict[str, Any],
        context: Dict[str, Any]
    ) -> Workflow:
        """Create workflow instance from template"""

        template = self.workflow_templates.get(template_name)
        if not template:
            raise Exception(f"Workflow template '{template_name}' not found")

        workflow_id = str(uuid.uuid4())

        # Create steps from template
        steps = [
            WorkflowStep(
                step_id=f"{workflow_id}_{step_def['name']}",
                agent_type=AgentType(step_def['agent']),
                inputs=step_def.get('inputs', {}),
                dependencies=[f"{workflow_id}_{dep}" for dep in step_def.get('dependencies', [])]
            )
            for step_def in template['steps']
        ]

        return Workflow(
            workflow_id=workflow_id,
            template_name=template_name,
            trigger_event=trigger_event,
            steps=steps,
            status=WorkflowStatus.PENDING,
            created_at=datetime.now(),
            context=context
        )

    def _load_workflow_templates(self, template_names: List[str]) -> Dict[str, Any]:
        """Load workflow templates"""
        templates = {}

        # Malware Outbreak Response
        templates['malware_outbreak'] = {
            'name': 'malware_outbreak',
            'description': 'Automated response to malware outbreak',
            'steps': [
                {
                    'name': 'triage',
                    'agent': 'triage',
                    'inputs': {'alert': '{{trigger_event}}'},
                    'dependencies': []
                },
                {
                    'name': 'enrich',
                    'agent': 'enrichment',
                    'inputs': {'iocs': '{{triage.iocs}}'},
                    'dependencies': ['triage']
                },
                {
                    'name': 'investigate',
                    'agent': 'investigation',
                    'inputs': {'trigger_alert': '{{trigger_event}}'},
                    'dependencies': ['triage', 'enrich']
                },
                {
                    'name': 'isolate_hosts',
                    'agent': 'response',
                    'inputs': {
                        'action': 'isolate_host',
                        'target': '{{investigate.affected_hosts}}',
                        'severity': 'critical'
                    },
                    'dependencies': ['investigate']
                },
                {
                    'name': 'block_iocs',
                    'agent': 'response',
                    'inputs': {
                        'action': 'block_ip',
                        'target': '{{enrich.malicious_ips}}',
                        'severity': 'high'
                    },
                    'dependencies': ['enrich']
                }
            ]
        }

        # Data Exfiltration Response
        templates['data_exfiltration'] = {
            'name': 'data_exfiltration',
            'description': 'Response to data exfiltration attempt',
            'steps': [
                {
                    'name': 'triage',
                    'agent': 'triage',
                    'inputs': {'alert': '{{trigger_event}}'},
                    'dependencies': []
                },
                {
                    'name': 'investigate',
                    'agent': 'investigation',
                    'inputs': {'trigger_alert': '{{trigger_event}}'},
                    'dependencies': ['triage']
                },
                {
                    'name': 'block_egress',
                    'agent': 'response',
                    'inputs': {
                        'action': 'update_firewall',
                        'target': '{{investigate.external_ips}}',
                        'severity': 'critical'
                    },
                    'dependencies': ['investigate']
                },
                {
                    'name': 'disable_accounts',
                    'agent': 'response',
                    'inputs': {
                        'action': 'disable_account',
                        'target': '{{investigate.compromised_accounts}}',
                        'severity': 'critical'
                    },
                    'dependencies': ['investigate']
                }
            ]
        }

        # Credential Compromise Response
        templates['credential_compromise'] = {
            'name': 'credential_compromise',
            'description': 'Response to credential compromise',
            'steps': [
                {
                    'name': 'triage',
                    'agent': 'triage',
                    'inputs': {'alert': '{{trigger_event}}'},
                    'dependencies': []
                },
                {
                    'name': 'investigate',
                    'agent': 'investigation',
                    'inputs': {'trigger_alert': '{{trigger_event}}'},
                    'dependencies': ['triage']
                },
                {
                    'name': 'revoke_tokens',
                    'agent': 'response',
                    'inputs': {
                        'action': 'revoke_token',
                        'target': '{{investigate.active_tokens}}',
                        'severity': 'high'
                    },
                    'dependencies': ['investigate']
                },
                {
                    'name': 'force_password_reset',
                    'agent': 'response',
                    'inputs': {
                        'action': 'disable_account',
                        'target': '{{investigate.affected_user}}',
                        'severity': 'high'
                    },
                    'dependencies': ['investigate']
                }
            ]
        }

        return templates

    def _should_escalate(self, workflow: Workflow) -> bool:
        """Determine if workflow should be escalated"""

        # Check escalation rules
        if workflow.context.get('confidence_score', 1.0) < 0.5:
            return self.escalation_rules.get('low_confidence') == 'human_review'

        if workflow.context.get('severity') == 'critical':
            return self.escalation_rules.get('critical_severity') == 'immediate_alert'

        # Check if any step failed
        failed_steps = [s for s in workflow.steps if s.status == WorkflowStatus.FAILED]
        if failed_steps:
            return True

        return False

    async def _escalate_workflow(self, workflow: Workflow):
        """Escalate workflow to human analyst"""
        logger.warning(f"Escalating workflow {workflow.workflow_id} for human review")

        escalation_data = {
            'workflow_id': workflow.workflow_id,
            'template': workflow.template_name,
            'trigger': workflow.trigger_event,
            'context': workflow.context,
            'reason': self._get_escalation_reason(workflow),
            'timestamp': datetime.now().isoformat()
        }

        # Send to SOAR/ticketing system
        # await self._send_to_soar(escalation_data)

    def _get_escalation_reason(self, workflow: Workflow) -> str:
        """Get reason for escalation"""
        reasons = []

        if workflow.context.get('confidence_score', 1.0) < 0.5:
            reasons.append('Low confidence score')

        if workflow.context.get('severity') == 'critical':
            reasons.append('Critical severity')

        failed_steps = [s for s in workflow.steps if s.status == WorkflowStatus.FAILED]
        if failed_steps:
            reasons.append(f'Failed steps: {[s.step_id for s in failed_steps]}')

        return '; '.join(reasons) if reasons else 'Unknown'

    def get_metrics(self) -> Dict[str, Any]:
        """Get orchestration metrics"""
        return {
            'workflows_executed': self.workflows_executed,
            'workflows_succeeded': self.workflows_succeeded,
            'workflows_failed': self.workflows_failed,
            'success_rate': self.workflows_succeeded / max(self.workflows_executed, 1),
            'avg_execution_time_ms': self.total_execution_time_ms / max(self.workflows_executed, 1),
            'active_workflows': len(self.active_workflows)
        }

# Usage Example
async def main():
    config = {
        'escalation_rules': {
            'low_confidence': 'human_review',
            'critical_severity': 'immediate_alert'
        },
        'workflow_templates': ['malware_outbreak', 'data_exfiltration', 'credential_compromise'],
        'max_parallel_agents': 5
    }

    orchestrator = OrchestrationAgent(config)

    # Register agents (mock for example)
    # orchestrator.register_agent(AgentType.TRIAGE, triage_agent_instance)
    # orchestrator.register_agent(AgentType.ENRICHMENT, enrichment_agent_instance)
    # orchestrator.register_agent(AgentType.INVESTIGATION, investigation_agent_instance)
    # orchestrator.register_agent(AgentType.RESPONSE, response_agent_instance)

    # Execute workflow
    trigger = {
        'alert_id': 'alert-789',
        'title': 'Malware Detected on Multiple Hosts',
        'severity': 'critical',
        'affected_hosts': ['WKS-001', 'WKS-002', 'WKS-003']
    }

    workflow = await orchestrator.execute_workflow('malware_outbreak', trigger)

    print(f"Workflow Status: {workflow.status}")
    print(f"Completed Steps: {len([s for s in workflow.steps if s.status == WorkflowStatus.COMPLETED])}")
    print(f"Metrics: {orchestrator.get_metrics()}")

if __name__ == "__main__":
    asyncio.run(main())`;

  const getGenericAgentCode = () => `# Generic Agent Implementation Template
# This is a placeholder for custom agents`;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-slate-400">Loading agents...</div>
      </div>
    );
  }

  return (
    <div className="h-full flex bg-slate-950">
      {/* Agent Sidebar */}
      <div className="w-80 border-r border-slate-800 overflow-y-auto bg-slate-900/50 flex flex-col">
        <div className="p-4 border-b border-slate-800 flex-shrink-0">
          <h3 className="text-white font-semibold flex items-center space-x-2">
            <Box className="w-5 h-5 text-blue-500" />
            <span>Agent Registry</span>
            <span className="ml-auto text-xs text-slate-400 font-normal">{agents.length} total</span>
          </h3>
          <p className="text-slate-400 text-xs mt-1">Canonical SOC + build-time agents</p>

          <button
            onClick={navigateToFeatureLab}
            className="mt-3 w-full px-3 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-lg text-sm font-semibold flex items-center justify-center space-x-2 transition-all shadow-lg shadow-emerald-900/30"
          >
            <Plus className="w-4 h-4" />
            <span>Create New Agent</span>
          </button>
          <p className="text-slate-500 text-[10px] mt-1.5 text-center">Opens Feature Lab BMAD workflow</p>

          <div className="mt-3 relative">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search agents, aliases..."
              className="w-full pl-8 pr-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="mt-2 flex flex-wrap gap-1">
            <button
              onClick={() => setCategoryFilter('all')}
              className={`px-2 py-0.5 rounded text-[10px] font-medium border transition-all ${
                categoryFilter === 'all'
                  ? 'bg-blue-500/20 text-blue-300 border-blue-500/50'
                  : 'bg-slate-800/60 text-slate-400 border-slate-700 hover:text-white'
              }`}
            >
              All
            </button>
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setCategoryFilter(cat)}
                className={`px-2 py-0.5 rounded text-[10px] font-medium border transition-all ${
                  categoryFilter === cat
                    ? CATEGORY_COLORS[cat] || CATEGORY_COLORS.other
                    : 'bg-slate-800/60 text-slate-400 border-slate-700 hover:text-white'
                }`}
              >
                {CATEGORY_LABELS[cat] || cat}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-3">
          {groupedAgents.map(([cat, list]) => (
            <div key={cat}>
              <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center justify-between">
                <span>{CATEGORY_LABELS[cat] || cat}</span>
                <span className="text-slate-600">{list.length}</span>
              </div>
              <div className="space-y-1">
                {list.map((agent) => (
                  <button
                    key={agent.id}
                    onClick={() => setSelectedAgent(agent)}
                    className={`w-full text-left p-2.5 rounded-lg transition-all border ${
                      selectedAgent?.id === agent.id
                        ? 'bg-blue-600 text-white border-blue-400'
                        : 'bg-slate-800/40 text-slate-300 border-slate-800 hover:bg-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="font-medium text-sm truncate">{agent.name}</div>
                    {agent.aliases && agent.aliases.length > 0 && (
                      <div className="text-[10px] opacity-60 mt-0.5 truncate">
                        aka {agent.aliases.slice(0, 2).join(', ')}
                        {agent.aliases.length > 2 ? '...' : ''}
                      </div>
                    )}
                    <div className="text-[10px] opacity-70 mt-1 flex items-center space-x-2">
                      <span>{agent.optimization_method}</span>
                      {agent.cadence && (
                        <>
                          <span className="opacity-40">•</span>
                          <span>{agent.cadence.replace('_', ' ')}</span>
                        </>
                      )}
                      {agent.owns_decision && (
                        <>
                          <span className="opacity-40">•</span>
                          <span className="text-amber-300">decides</span>
                        </>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
          {filteredAgents.length === 0 && (
            <div className="text-center text-slate-500 text-xs py-8">No agents match your filters</div>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selectedAgent && (
          <>
            {/* Header */}
            <div className="bg-slate-900/50 border-b border-slate-800 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-white">{selectedAgent.name}</h2>
                  <p className="text-slate-400 text-sm mt-1">{selectedAgent.description}</p>
                  <div className="flex items-center flex-wrap gap-2 mt-3">
                    {selectedAgent.category && (
                      <span className={`px-3 py-1 rounded text-xs font-semibold border ${CATEGORY_COLORS[selectedAgent.category] || CATEGORY_COLORS.other}`}>
                        {CATEGORY_LABELS[selectedAgent.category] || selectedAgent.category}
                      </span>
                    )}
                    <span className="px-3 py-1 bg-blue-500/20 text-blue-400 rounded text-xs font-semibold border border-blue-500/30">
                      {selectedAgent.type.toUpperCase()}
                    </span>
                    <span className="px-3 py-1 bg-slate-500/20 text-slate-300 rounded text-xs font-semibold border border-slate-500/30">
                      {selectedAgent.optimization_method}
                    </span>
                    {selectedAgent.cadence && (
                      <span className="px-3 py-1 bg-cyan-500/20 text-cyan-300 rounded text-xs font-semibold border border-cyan-500/30">
                        {selectedAgent.cadence.replace('_', ' ')}
                      </span>
                    )}
                    {selectedAgent.owns_decision && (
                      <span className="px-3 py-1 bg-amber-500/20 text-amber-300 rounded text-xs font-semibold border border-amber-500/30">
                        autonomous
                      </span>
                    )}
                    {selectedAgent.phases && selectedAgent.phases.length > 0 && (
                      <span className="px-3 py-1 bg-emerald-500/20 text-emerald-300 rounded text-xs font-semibold border border-emerald-500/30">
                        Phases {selectedAgent.phases.join(', ')}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Tabs */}
              <div className="flex space-x-2 mt-6 border-t border-slate-800 pt-4">
                <button
                  onClick={() => setActiveTab('overview')}
                  className={`px-4 py-2 rounded-lg transition-all flex items-center space-x-2 ${
                    activeTab === 'overview'
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  <FileCode className="w-4 h-4" />
                  <span>Overview</span>
                </button>
                <button
                  onClick={() => setActiveTab('code')}
                  className={`px-4 py-2 rounded-lg transition-all flex items-center space-x-2 ${
                    activeTab === 'code'
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  <Code className="w-4 h-4" />
                  <span>Implementation</span>
                </button>
                <button
                  onClick={() => setActiveTab('config')}
                  className={`px-4 py-2 rounded-lg transition-all flex items-center space-x-2 ${
                    activeTab === 'config'
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  <Settings className="w-4 h-4" />
                  <span>Configuration</span>
                </button>
                <button
                  onClick={() => setActiveTab('integration')}
                  className={`px-4 py-2 rounded-lg transition-all flex items-center space-x-2 ${
                    activeTab === 'integration'
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  <Workflow className="w-4 h-4" />
                  <span>Integration</span>
                </button>
                <button
                  onClick={() => setActiveTab('llm')}
                  className={`px-4 py-2 rounded-lg transition-all flex items-center space-x-2 ${
                    activeTab === 'llm'
                      ? 'bg-purple-600 text-white'
                      : 'bg-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  <Brain className="w-4 h-4" />
                  <span>LLM & ML</span>
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {activeTab === 'overview' && (
                <div className="space-y-6">
                  <div className="bg-slate-900/50 rounded-lg p-6 border border-slate-800">
                    <h3 className="text-white font-semibold mb-4">Agent Description</h3>
                    <p className="text-slate-300 leading-relaxed">{selectedAgent.description}</p>
                  </div>

                  <div className="bg-slate-900/50 rounded-lg p-6 border border-slate-800">
                    <h3 className="text-white font-semibold mb-4">Optimization Method</h3>
                    <div className="space-y-3">
                      <div className="flex items-center space-x-3">
                        <div className="px-3 py-1 bg-purple-500/20 text-purple-400 rounded border border-purple-500/30 font-mono text-sm">
                          {selectedAgent.optimization_method}
                        </div>
                      </div>
                      {selectedAgent.optimization_method === 'hybrid' && (
                        <p className="text-slate-400 text-sm">
                          Combines rule-based systems with machine learning for optimal performance and interpretability.
                        </p>
                      )}
                      {selectedAgent.optimization_method === 'TAO' && (
                        <p className="text-slate-400 text-sm">
                          Threat Attribution Optimization - Advanced correlation of threat intelligence across multiple feeds.
                        </p>
                      )}
                      {selectedAgent.optimization_method === 'ALHF' && (
                        <p className="text-slate-400 text-sm">
                          Adaptive Learning from Human Feedback - Continuously improves from analyst corrections and feedback.
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="bg-slate-900/50 rounded-lg p-6 border border-slate-800">
                    <h3 className="text-white font-semibold mb-4">Key Capabilities</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-slate-800/50 p-4 rounded">
                        <div className="text-green-400 text-sm font-semibold mb-1">Automated Decision Making</div>
                        <div className="text-slate-400 text-xs">Makes intelligent decisions without human intervention</div>
                      </div>
                      <div className="bg-slate-800/50 p-4 rounded">
                        <div className="text-blue-400 text-sm font-semibold mb-1">Real-time Processing</div>
                        <div className="text-slate-400 text-xs">Processes events in milliseconds</div>
                      </div>
                      <div className="bg-slate-800/50 p-4 rounded">
                        <div className="text-purple-400 text-sm font-semibold mb-1">Self-Learning</div>
                        <div className="text-slate-400 text-xs">Improves accuracy over time</div>
                      </div>
                      <div className="bg-slate-800/50 p-4 rounded">
                        <div className="text-orange-400 text-sm font-semibold mb-1">Multi-source Correlation</div>
                        <div className="text-slate-400 text-xs">Analyzes data from multiple systems</div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'code' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-white font-semibold flex items-center space-x-2">
                      <Terminal className="w-5 h-5 text-green-500" />
                      <span>Python Implementation</span>
                    </h3>
                    <button
                      onClick={() => copyToClipboard(getAgentImplementation(selectedAgent))}
                      className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm flex items-center space-x-2"
                    >
                      {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      <span>{copied ? 'Copied!' : 'Copy Code'}</span>
                    </button>
                  </div>
                  <div className="bg-slate-900 rounded-lg border border-slate-700 overflow-hidden">
                    <pre className="p-6 overflow-x-auto text-sm">
                      <code className="text-green-400 font-mono">
                        {getAgentImplementation(selectedAgent)}
                      </code>
                    </pre>
                  </div>
                </div>
              )}

              {activeTab === 'config' && (
                <div className="space-y-4">
                  <h3 className="text-white font-semibold flex items-center space-x-2">
                    <Database className="w-5 h-5 text-blue-500" />
                    <span>Agent Configuration</span>
                  </h3>
                  <div className="bg-slate-900 rounded-lg border border-slate-700 p-6">
                    <pre className="text-sm overflow-x-auto">
                      <code className="text-blue-300 font-mono">
                        {JSON.stringify(selectedAgent.config, null, 2)}
                      </code>
                    </pre>
                  </div>

                  <div className="bg-slate-900/50 rounded-lg p-6 border border-slate-800">
                    <h4 className="text-white font-semibold mb-3">Configuration Options</h4>
                    <div className="space-y-2 text-sm">
                      {Object.entries(selectedAgent.config).map(([key, value]) => (
                        <div key={key} className="flex justify-between items-start border-b border-slate-800 pb-2">
                          <span className="text-slate-400 font-mono">{key}</span>
                          <span className="text-slate-300">{typeof value === 'object' ? 'Object' : String(value)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'integration' && (
                <div className="space-y-6">
                  <div className="bg-slate-900/50 rounded-lg p-6 border border-slate-800">
                    <h3 className="text-white font-semibold mb-4 flex items-center space-x-2">
                      <Workflow className="w-5 h-5 text-green-500" />
                      <span>Integration Points</span>
                    </h3>
                    <div className="space-y-3">
                      <div className="bg-slate-800/50 p-4 rounded">
                        <div className="text-green-400 font-semibold mb-2">Input Sources</div>
                        <ul className="text-slate-300 text-sm space-y-1">
                          <li>• Event Stream (Kafka/Redis)</li>
                          <li>• Database Queries (PostgreSQL)</li>
                          <li>• API Endpoints (REST/GraphQL)</li>
                          <li>• Message Queue (RabbitMQ)</li>
                        </ul>
                      </div>

                      <div className="bg-slate-800/50 p-4 rounded">
                        <div className="text-blue-400 font-semibold mb-2">Output Destinations</div>
                        <ul className="text-slate-300 text-sm space-y-1">
                          <li>• Alert Management System</li>
                          <li>• Case Management (SOAR)</li>
                          <li>• Metrics Dashboard</li>
                          <li>• Audit Log</li>
                        </ul>
                      </div>

                      <div className="bg-slate-800/50 p-4 rounded">
                        <div className="text-purple-400 font-semibold mb-2">External APIs</div>
                        <ul className="text-slate-300 text-sm space-y-1">
                          <li>• Threat Intelligence Feeds</li>
                          <li>• SIEM Systems (Splunk, QRadar)</li>
                          <li>• EDR Platforms (CrowdStrike, SentinelOne)</li>
                          <li>• Cloud Security (AWS GuardDuty, Azure Sentinel)</li>
                        </ul>
                      </div>
                    </div>
                  </div>

                  <div className="bg-slate-900/50 rounded-lg p-6 border border-slate-800">
                    <h3 className="text-white font-semibold mb-4">Communication Protocol</h3>
                    <div className="bg-slate-900 rounded-lg p-4 border border-slate-700">
                      <pre className="text-sm overflow-x-auto">
                        <code className="text-cyan-300 font-mono">{`{
  "message_type": "agent_communication",
  "from": "triage_agent",
  "to": "enrichment_agent",
  "payload": {
    "alert_id": "alert-123",
    "iocs": ["192.168.1.100", "malicious.com"],
    "priority": "high"
  },
  "timestamp": "2025-10-14T10:30:00Z"
}`}</code>
                      </pre>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'llm' && (
                <div className="space-y-6">
                  {/* LLM Prompts Section */}
                  {(selectedAgent.type === 'triage' || selectedAgent.type === 'investigation' || selectedAgent.type === 'orchestrator') && (
                    <div className="bg-gradient-to-br from-purple-900/20 to-slate-900 rounded-lg p-6 border border-purple-500/30">
                      <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                        <Brain className="w-6 h-6 text-purple-400" />
                        LLM Prompt Configuration
                      </h3>

                      {selectedAgent.type === 'triage' && (
                        <div className="space-y-4">
                          <div className="bg-slate-800/50 rounded-lg p-4 border border-purple-500/20">
                            <h4 className="text-purple-400 font-semibold mb-3">GPT-4 Triage Analysis Prompt</h4>
                            <div className="bg-slate-900 rounded p-4 font-mono text-xs text-green-300 overflow-x-auto mb-4">
                              <pre>{`You are a cybersecurity expert analyzing security alerts for triage.

Input:
- Alert Title: {{alert.title}}
- Severity: {{alert.severity}}
- Source: {{alert.source}}
- Indicators: {{alert.indicators}}
- Raw Data: {{alert.raw_data}}

Task:
Analyze this alert and provide a structured assessment.

Output Format (JSON):
{
  "is_true_positive": true/false,
  "confidence": 0.0-1.0,
  "severity": "info|low|medium|high|critical",
  "reasoning": "Brief explanation of your assessment",
  "recommended_actions": ["action1", "action2"],
  "related_ttps": ["MITRE ATT&CK IDs"],
  "false_positive_likelihood": 0.0-1.0
}

Consider:
1. Does this match known attack patterns?
2. Are the indicators consistent with malicious activity?
3. Is there context suggesting legitimate business activity?
4. What is the potential business impact?
5. Are there missing indicators that would help confirm?

Be concise and decisive. Focus on actionable intelligence.`}</pre>
                            </div>

                            <div className="grid grid-cols-4 gap-3">
                              <div className="bg-slate-900 p-3 rounded">
                                <div className="text-slate-400 text-xs mb-1">Model</div>
                                <div className="text-white text-sm font-semibold">GPT-4 Turbo</div>
                              </div>
                              <div className="bg-slate-900 p-3 rounded">
                                <div className="text-slate-400 text-xs mb-1">Temperature</div>
                                <div className="text-white text-sm font-semibold">0.1</div>
                              </div>
                              <div className="bg-slate-900 p-3 rounded">
                                <div className="text-slate-400 text-xs mb-1">Max Tokens</div>
                                <div className="text-white text-sm font-semibold">500</div>
                              </div>
                              <div className="bg-slate-900 p-3 rounded">
                                <div className="text-slate-400 text-xs mb-1">Timeout</div>
                                <div className="text-green-400 text-sm font-semibold">10s</div>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {selectedAgent.type === 'investigation' && (
                        <div className="space-y-4">
                          <div className="bg-slate-800/50 rounded-lg p-4 border border-purple-500/20">
                            <h4 className="text-purple-400 font-semibold mb-3">GPT-4 Attack Chain Analysis Prompt</h4>
                            <div className="bg-slate-900 rounded p-4 font-mono text-xs text-green-300 overflow-x-auto mb-4">
                              <pre>{`You are a threat intelligence analyst investigating a security incident.

Context:
- Trigger Event: {{trigger_alert}}
- Related Events: {{related_events}}
- Network Flow: {{network_data}}
- Endpoint Activity: {{endpoint_data}}
- Authentication Logs: {{auth_data}}
- Timeline: {{event_timeline}}

Objective:
Reconstruct the attack chain and identify:
1. Initial access method
2. Lateral movement paths
3. Persistence mechanisms
4. Data exfiltration attempts
5. Attacker objectives

Output Format (JSON):
{
  "attack_chain": [
    {
      "phase": "initial_access|execution|persistence|...",
      "timestamp": "ISO8601",
      "technique": "T1566.001",
      "description": "What happened",
      "confidence": 0.0-1.0,
      "evidence": ["event_ids"]
    }
  ],
  "threat_actor_profile": {
    "sophistication": "low|medium|high|nation_state",
    "likely_motivation": "financial|espionage|disruption",
    "similar_campaigns": ["campaign names"]
  },
  "blast_radius": {
    "affected_hosts": ["hostnames"],
    "compromised_accounts": ["usernames"],
    "data_at_risk": "description"
  },
  "recommended_containment": ["immediate actions"],
  "investigation_priority": "low|medium|high|critical"
}

Map all activities to MITRE ATT&CK framework.
Identify gaps in telemetry that limit visibility.`}</pre>
                            </div>

                            <div className="grid grid-cols-4 gap-3">
                              <div className="bg-slate-900 p-3 rounded">
                                <div className="text-slate-400 text-xs mb-1">Model</div>
                                <div className="text-white text-sm font-semibold">GPT-4</div>
                              </div>
                              <div className="bg-slate-900 p-3 rounded">
                                <div className="text-slate-400 text-xs mb-1">Temperature</div>
                                <div className="text-white text-sm font-semibold">0.2</div>
                              </div>
                              <div className="bg-slate-900 p-3 rounded">
                                <div className="text-slate-400 text-xs mb-1">Max Tokens</div>
                                <div className="text-white text-sm font-semibold">2000</div>
                              </div>
                              <div className="bg-slate-900 p-3 rounded">
                                <div className="text-slate-400 text-xs mb-1">Timeout</div>
                                <div className="text-green-400 text-sm font-semibold">30s</div>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ML Models Section */}
                  <div className="bg-slate-900/50 rounded-lg p-6 border border-slate-800">
                    <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                      <Cpu className="w-6 h-6 text-cyan-400" />
                      Machine Learning Models
                    </h3>

                    {selectedAgent.type === 'triage' && (
                      <div className="space-y-4">
                        <div className="bg-slate-800/50 rounded-lg p-4">
                          <h4 className="text-cyan-400 font-semibold mb-3">Random Forest Classifier</h4>
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <div className="text-slate-400 text-sm mb-2">Model Configuration</div>
                              <div className="space-y-2 text-xs">
                                <div className="flex justify-between">
                                  <span className="text-slate-400">Algorithm:</span>
                                  <span className="text-white font-mono">RandomForestClassifier</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-slate-400">n_estimators:</span>
                                  <span className="text-white font-mono">100</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-slate-400">max_depth:</span>
                                  <span className="text-white font-mono">10</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-slate-400">min_samples_split:</span>
                                  <span className="text-white font-mono">2</span>
                                </div>
                              </div>
                            </div>
                            <div>
                              <div className="text-slate-400 text-sm mb-2">Performance Metrics</div>
                              <div className="space-y-2 text-xs">
                                <div className="flex justify-between">
                                  <span className="text-slate-400">Accuracy:</span>
                                  <span className="text-green-400 font-semibold">94.7%</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-slate-400">Precision:</span>
                                  <span className="text-green-400 font-semibold">92.1%</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-slate-400">Recall:</span>
                                  <span className="text-green-400 font-semibold">96.3%</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-slate-400">Inference Time:</span>
                                  <span className="text-green-400 font-semibold">&lt;5ms</span>
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="mt-4 bg-slate-900 rounded p-3">
                            <div className="text-slate-400 text-xs mb-2">Feature Extraction</div>
                            <div className="text-white text-xs font-mono">
                              source_encoding, severity_score, ioc_count, reputation_score, time_risk, occurrence_rate
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {selectedAgent.type === 'enrichment' && (
                      <div className="space-y-4">
                        <div className="bg-slate-800/50 rounded-lg p-4">
                          <h4 className="text-cyan-400 font-semibold mb-3">Vector Embeddings for IOC Similarity</h4>
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <div className="text-slate-400 text-sm mb-2">Embedding Model</div>
                              <div className="space-y-2 text-xs">
                                <div className="flex justify-between">
                                  <span className="text-slate-400">Model:</span>
                                  <span className="text-white font-mono">text-embedding-3-large</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-slate-400">Dimensions:</span>
                                  <span className="text-white font-mono">3072</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-slate-400">Similarity:</span>
                                  <span className="text-white font-mono">cosine</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-slate-400">Index Type:</span>
                                  <span className="text-white font-mono">HNSW</span>
                                </div>
                              </div>
                            </div>
                            <div>
                              <div className="text-slate-400 text-sm mb-2">Index Configuration</div>
                              <div className="space-y-2 text-xs">
                                <div className="flex justify-between">
                                  <span className="text-slate-400">M (HNSW):</span>
                                  <span className="text-white font-mono">16</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-slate-400">ef_construction:</span>
                                  <span className="text-white font-mono">200</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-slate-400">ef_search:</span>
                                  <span className="text-white font-mono">100</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-slate-400">Query Time:</span>
                                  <span className="text-green-400 font-semibold">&lt;50ms</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {selectedAgent.type === 'investigation' && (
                      <div className="space-y-4">
                        <div className="bg-slate-800/50 rounded-lg p-4">
                          <h4 className="text-cyan-400 font-semibold mb-3">Graph Neural Network for Attack Chain Analysis</h4>
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <div className="text-slate-400 text-sm mb-2">Model Architecture</div>
                              <div className="space-y-2 text-xs">
                                <div className="flex justify-between">
                                  <span className="text-slate-400">Type:</span>
                                  <span className="text-white font-mono">Graph Attention Network</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-slate-400">Layers:</span>
                                  <span className="text-white font-mono">3 GAT layers</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-slate-400">Hidden Units:</span>
                                  <span className="text-white font-mono">128</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-slate-400">Attention Heads:</span>
                                  <span className="text-white font-mono">8</span>
                                </div>
                              </div>
                            </div>
                            <div>
                              <div className="text-slate-400 text-sm mb-2">Detection Performance</div>
                              <div className="space-y-2 text-xs">
                                <div className="flex justify-between">
                                  <span className="text-slate-400">Lateral Movement:</span>
                                  <span className="text-green-400 font-semibold">97.2%</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-slate-400">Persistence:</span>
                                  <span className="text-green-400 font-semibold">95.8%</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-slate-400">Exfiltration:</span>
                                  <span className="text-green-400 font-semibold">93.4%</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-slate-400">Processing Time:</span>
                                  <span className="text-green-400 font-semibold">&lt;200ms</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {selectedAgent.type === 'response' && (
                      <div className="space-y-4">
                        <div className="bg-slate-800/50 rounded-lg p-4">
                          <h4 className="text-cyan-400 font-semibold mb-3">Risk Scoring Model (Ensemble)</h4>
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <div className="text-slate-400 text-sm mb-2">Model Components</div>
                              <div className="space-y-2 text-xs">
                                <div className="flex justify-between">
                                  <span className="text-slate-400">Base Models:</span>
                                  <span className="text-white font-mono">3 (RF, XGBoost, LGBM)</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-slate-400">Meta-Learner:</span>
                                  <span className="text-white font-mono">Logistic Regression</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-slate-400">Features:</span>
                                  <span className="text-white font-mono">24 dimensions</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-slate-400">Update Frequency:</span>
                                  <span className="text-white font-mono">Hourly</span>
                                </div>
                              </div>
                            </div>
                            <div>
                              <div className="text-slate-400 text-sm mb-2">Safety Metrics</div>
                              <div className="space-y-2 text-xs">
                                <div className="flex justify-between">
                                  <span className="text-slate-400">False Block Rate:</span>
                                  <span className="text-yellow-400 font-semibold">0.02%</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-slate-400">Missed Threats:</span>
                                  <span className="text-yellow-400 font-semibold">1.3%</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-slate-400">Avg Risk Score:</span>
                                  <span className="text-green-400 font-semibold">0.23</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-slate-400">Inference:</span>
                                  <span className="text-green-400 font-semibold">&lt;3ms</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Model Training & Monitoring */}
                  <div className="bg-slate-900/50 rounded-lg p-6 border border-slate-800">
                    <h3 className="text-white font-semibold mb-4">Training & Monitoring</h3>
                    <div className="grid grid-cols-3 gap-4">
                      <div className="bg-slate-800/50 p-4 rounded">
                        <div className="text-green-400 font-semibold mb-2 text-sm">Training Data</div>
                        <div className="space-y-1 text-xs text-slate-300">
                          <div>• 10M+ labeled samples</div>
                          <div>• 90/10 train/test split</div>
                          <div>• Stratified sampling</div>
                          <div>• Class balancing (SMOTE)</div>
                        </div>
                      </div>

                      <div className="bg-slate-800/50 p-4 rounded">
                        <div className="text-blue-400 font-semibold mb-2 text-sm">Retraining Schedule</div>
                        <div className="space-y-1 text-xs text-slate-300">
                          <div>• Full retrain: Weekly</div>
                          <div>• Online learning: Daily</div>
                          <div>• A/B testing: Continuous</div>
                          <div>• Rollback on degradation</div>
                        </div>
                      </div>

                      <div className="bg-slate-800/50 p-4 rounded">
                        <div className="text-orange-400 font-semibold mb-2 text-sm">Monitoring</div>
                        <div className="space-y-1 text-xs text-slate-300">
                          <div>• Accuracy drift detection</div>
                          <div>• Feature distribution shift</div>
                          <div>• Latency tracking (p99)</div>
                          <div>• Prediction distribution</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default AgentCodeConfiguration;
