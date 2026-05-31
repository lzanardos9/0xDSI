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
    "Hey Enrichment, I've got a {severity} priority hit here. Can you run intel on {ip}? Something doesn't look right.",
    "Flagged {ip} as {severity} -- sending it your way for a deeper look. Let me know what the feeds say.",
    "Heads up, suspicious traffic from {ip}. I've classified it but I need you to pull the threat context on this one.",
    "Got another one for you -- {ip} triggered a {severity} alert. Kicking it over for enrichment before I escalate."
  ],
  enrichment_to_investigation: [
    "Investigation, I've got bad news on {ip}. Intel confirms it's malicious. You'll want to take a closer look at this.",
    "OSINT came back and {ip} is tied to a known botnet. Sending the full context over -- this needs a deep dive.",
    "Enrichment's done and it's not pretty. High-confidence threat on {ip}. Handing off to you for behavioral analysis.",
    "Multiple feeds are flagging {ip} now. I've packaged up everything I found -- over to you for the investigation."
  ],
  investigation_to_response: [
    "Response, we've confirmed active C2 comms on the affected host. Need you to move on containment now.",
    "Found lateral movement -- this is spreading. Can you get isolation protocols running while I finish the timeline?",
    "I've mapped out the full attack chain and it's hitting multiple endpoints. We need automated remediation on this ASAP.",
    "The investigation's painting a clear picture and it's not good. Triggering containment -- please lock this down."
  ],
  response_to_orchestrator: [
    "Containment's done -- blocked the IP at the firewall and quarantined the endpoint. Sending the full report your way.",
    "Threat neutralized in {time} seconds. Everything's locked down and I'm writing up the incident summary now.",
    "All clear on my end. Systems are secured and the forensic capture is running. Updating you with the full details.",
    "Response complete. I've verified all the containment actions and nothing slipped through. Case is yours to close."
  ],
  orchestrator_to_triage: [
    "Atlas, new batch just came in from the SIEM -- {count} alerts need classification. Take a look when you're ready.",
    "We've got high-priority alerts stacking up. Sending them to Triage now -- let's get these sorted.",
    "Routing a fresh set of security events your way. Nothing flagged as critical yet, but give them a good look.",
    "Another {count} alerts in the queue. I've pre-sorted by source -- should make your triage pass faster."
  ],
  triage_to_orchestrator: [
    "Triage is done -- processed {processed} alerts and filtered out {filtered} false positives. Ready for the next batch.",
    "Classification's wrapped up. Escalated {critical} criticals and {high} highs. The rest were noise.",
    "Cycle complete at {confidence}% confidence. Metrics are looking solid -- send me more whenever you've got them.",
    "Just cleared the queue. {processed} alerts processed, nothing got stuck. Standing by for the next round."
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
