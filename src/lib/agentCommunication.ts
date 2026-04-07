export interface AgentCommunication {
  id: string;
  from: string;
  to: string;
  fromAgent: string;
  toAgent: string;
  message: string;
  type: string;
  timestamp: number;
  narrative: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  actionType: string;
}

type CommunicationListener = (comm: AgentCommunication) => void;

class AgentCommunicationBus {
  private listeners: CommunicationListener[] = [];
  private communications: AgentCommunication[] = [];

  subscribe(listener: CommunicationListener) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  emit(communication: AgentCommunication) {
    this.communications.push(communication);
    this.listeners.forEach(listener => listener(communication));
  }

  getRecentCommunications(count: number = 10): AgentCommunication[] {
    return this.communications.slice(-count);
  }
}

export const communicationBus = new AgentCommunicationBus();

const narrativeTemplates = {
  triage_to_enrichment: [
    '🔍 Detected {severity} priority threat. Forwarding IP {ip} to Enrichment Agent for intel lookup.',
    '⚠️ Alert classified as {severity}. Requesting threat intelligence on {ip} from Enrichment Agent.',
    '🎯 Suspicious activity identified. Sending {ip} for enrichment analysis.'
  ],
  enrichment_to_investigation: [
    '📊 Threat intel gathered on {ip}. Confirmed malicious. Escalating to Investigation Agent for deep analysis.',
    '🌐 OSINT completed: {ip} linked to known botnet. Investigation Agent requested for full scope.',
    '💡 Enrichment complete: High-confidence threat. Passing to Investigation for behavioral analysis.'
  ],
  investigation_to_response: [
    '🔎 Investigation confirmed: Active C2 communication detected. Triggering Response Agent for containment.',
    '🚨 Critical findings: Lateral movement attempt identified. Response Agent executing isolation protocols.',
    '⚡ Attack chain reconstructed. Multiple compromised endpoints. Response Agent initiating automated remediation.'
  ],
  response_to_orchestrator: [
    '✅ Containment successful: IP blocked at firewall. Endpoint quarantined. Reporting back to Orchestrator.',
    '🛡️ Automated response executed: Threat neutralized in {time}s. Status update sent to Orchestrator.',
    '⚡ Emergency response complete: Systems secured. Full incident report transmitted to Orchestrator.'
  ],
  orchestrator_to_triage: [
    '🎯 New alert batch received from SIEM. Assigning {count} alerts to Triage Agent for classification.',
    '📋 Orchestrating workflow: High-priority alerts detected. Dispatching to Triage Agent Alpha.',
    '🔄 Continuous monitoring active. Routing new security events to Triage for initial assessment.'
  ],
  triage_to_orchestrator: [
    '📊 Triage complete: {processed} alerts processed, {filtered} false positives filtered. Awaiting next batch.',
    '✅ Classification finished: {critical} critical, {high} high priority alerts escalated. Ready for more.',
    '🎯 Auto-triage cycle complete. {confidence}% confidence. Reporting metrics to Orchestrator.'
  ]
};

const mockIPs = [
  '185.220.101.42', '203.45.78.91', '91.234.56.12', '45.142.212.61',
  '104.244.78.53', '192.168.1.50', '10.0.0.125', '172.16.5.89'
];

function getRandomTemplate(key: string): string {
  const templates = narrativeTemplates[key as keyof typeof narrativeTemplates];
  if (!templates) return '';
  return templates[Math.floor(Math.random() * templates.length)];
}

function formatNarrative(template: string, data: any): string {
  return template
    .replace('{severity}', data.severity || 'high')
    .replace('{ip}', data.ip || mockIPs[Math.floor(Math.random() * mockIPs.length)])
    .replace('{count}', data.count || Math.floor(Math.random() * 20 + 10).toString())
    .replace('{processed}', data.processed || Math.floor(Math.random() * 50 + 100).toString())
    .replace('{filtered}', data.filtered || Math.floor(Math.random() * 30 + 20).toString())
    .replace('{critical}', data.critical || Math.floor(Math.random() * 5 + 2).toString())
    .replace('{high}', data.high || Math.floor(Math.random() * 15 + 5).toString())
    .replace('{confidence}', data.confidence || (Math.random() * 10 + 90).toFixed(1))
    .replace('{time}', data.time || (Math.random() * 2 + 0.5).toFixed(1));
}

export const communicationScenarios: Array<{
  from: string;
  to: string;
  fromAgent: string;
  toAgent: string;
  templateKey: string;
  type: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  actionType: string;
}> = [
  {
    from: 'agent-1',
    to: 'agent-2',
    fromAgent: 'Triage Agent Alpha',
    toAgent: 'Enrichment Agent Beta',
    templateKey: 'triage_to_enrichment',
    type: 'threat_detection',
    severity: 'high',
    actionType: 'analysis'
  },
  {
    from: 'agent-2',
    to: 'agent-3',
    fromAgent: 'Enrichment Agent Beta',
    toAgent: 'Investigation Agent Gamma',
    templateKey: 'enrichment_to_investigation',
    type: 'intelligence_sharing',
    severity: 'high',
    actionType: 'enrichment'
  },
  {
    from: 'agent-3',
    to: 'agent-4',
    fromAgent: 'Investigation Agent Gamma',
    toAgent: 'Response Agent Delta',
    templateKey: 'investigation_to_response',
    type: 'escalation',
    severity: 'critical',
    actionType: 'investigation'
  },
  {
    from: 'agent-4',
    to: 'agent-5',
    fromAgent: 'Response Agent Delta',
    toAgent: 'Orchestrator Agent',
    templateKey: 'response_to_orchestrator',
    type: 'status_update',
    severity: 'medium',
    actionType: 'response'
  },
  {
    from: 'agent-5',
    to: 'agent-1',
    fromAgent: 'Orchestrator Agent',
    toAgent: 'Triage Agent Alpha',
    templateKey: 'orchestrator_to_triage',
    type: 'task_assignment',
    severity: 'low',
    actionType: 'orchestration'
  },
  {
    from: 'agent-1',
    to: 'agent-5',
    fromAgent: 'Triage Agent Alpha',
    toAgent: 'Orchestrator Agent',
    templateKey: 'triage_to_orchestrator',
    type: 'status_report',
    severity: 'low',
    actionType: 'triage'
  }
];

export function generateMockCommunication(): AgentCommunication {
  const scenario = communicationScenarios[Math.floor(Math.random() * communicationScenarios.length)];
  const template = getRandomTemplate(scenario.templateKey);
  const narrative = formatNarrative(template, {
    severity: scenario.severity,
    ip: mockIPs[Math.floor(Math.random() * mockIPs.length)]
  });

  return {
    id: `comm-${Date.now()}-${Math.random()}`,
    from: scenario.from,
    to: scenario.to,
    fromAgent: scenario.fromAgent,
    toAgent: scenario.toAgent,
    message: narrative,
    type: scenario.type,
    timestamp: Date.now(),
    narrative: narrative,
    severity: scenario.severity,
    actionType: scenario.actionType
  };
}
