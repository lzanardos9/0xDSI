import { AGENT_DEFS, type AgentDef } from './soc3dHelpers';

export interface AgentUtterance {
  agentId: string;
  agentName: string;
  agentColor: string;
  text: string;
  timestamp: number;
}

export type VoiceEventListener = (utterance: AgentUtterance) => void;

const AGENT_ACTIVITY_LINES: Record<string, string[]> = {
  triage: [
    'Incoming batch of 14 alerts. Running classification now.',
    'Severity scoring complete. Three criticals flagged for immediate review.',
    'False positive confidence is high on the port scan cluster. Filtering.',
    'Escalating alert 2847 to enrichment. MITRE mapping suggests credential access.',
    'Triage queue is clear. Monitoring for new events.',
    'Detected a burst of authentication failures from Eastern Europe.',
    'Correlating this phishing cluster with last weeks campaign.',
  ],
  enrichment: [
    'Cross-referencing indicators against 12 threat intel feeds.',
    'Match found in AlienVault OTX. IP is associated with APT41 infrastructure.',
    'Enrichment complete. Adding WHOIS data and geo-location context.',
    'No hits on VirusTotal for this hash. Could be a zero-day sample.',
    'Pulling OSINT data on the registrant of this suspicious domain.',
    'Threat Fox confirms this C2 server. Tagging all related events.',
    'CIRCL feed just updated. Checking for new matches in our telemetry.',
  ],
  orchestrator: [
    'Dispatching investigation task to Nova. Attack chain needs deep analysis.',
    'All agents reporting healthy. Pipeline throughput is nominal.',
    'Re-prioritizing queue. The lateral movement finding takes precedence.',
    'Coordinating response across triage and investigation teams.',
    'Sending enrichment request for the new DNS tunneling indicators.',
    'Workflow complete. Updating the case with all agent findings.',
    'Adjusting agent workload. Atlas is at 92% capacity.',
  ],
  investigation: [
    'Building attack graph for the lateral movement chain.',
    'Confirmed. The attacker moved from workstation to domain controller.',
    'Analyzing process tree. PowerShell spawned from a Word macro.',
    'Network analysis shows beaconing every 60 seconds to the C2 server.',
    'Persistence mechanism found. Scheduled task registered in SYSTEM context.',
    'Data exfiltration path identified. 400 megabytes over DNS tunneling.',
    'Investigation complete. Packaging findings for the response team.',
  ],
  response: [
    'Executing IP block on 185.220.101.34. Firewall rule pushed.',
    'Host isolation initiated for the compromised endpoint.',
    'Containment confirmed. The C2 beacon has stopped.',
    'Rolling out emergency firewall rules across all edge devices.',
    'Account disabled for the compromised service account.',
    'Quarantine complete. Forensic image is being captured.',
    'Response actions verified. Generating incident summary.',
  ],
};

const VOICE_PITCH_MAP: Record<string, number> = {
  triage: 1.1,
  enrichment: 0.9,
  orchestrator: 1.0,
  investigation: 0.85,
  response: 1.15,
};

const VOICE_RATE_MAP: Record<string, number> = {
  triage: 1.05,
  enrichment: 0.95,
  orchestrator: 1.0,
  investigation: 0.9,
  response: 1.1,
};

class VoiceConversationEngine {
  private enabled = false;
  private speaking = false;
  private queue: AgentUtterance[] = [];
  private listeners: VoiceEventListener[] = [];
  private recognition: SpeechRecognition | null = null;
  private listening = false;
  private voices: SpeechSynthesisVoice[] = [];
  private voicesLoaded = false;
  private activityTimer: ReturnType<typeof setInterval> | null = null;
  private lastAgentIndex = -1;
  private userMessageCallback: ((text: string) => void) | null = null;

  constructor() {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      this.loadVoices();
      window.speechSynthesis.addEventListener('voiceschanged', () => this.loadVoices());
    }
  }

  private loadVoices() {
    this.voices = window.speechSynthesis.getVoices();
    this.voicesLoaded = this.voices.length > 0;
  }

  private pickVoice(agentType: string): SpeechSynthesisVoice | null {
    if (!this.voicesLoaded || this.voices.length === 0) return null;
    const english = this.voices.filter(v => v.lang.startsWith('en'));
    if (english.length === 0) return this.voices[0];

    const agentIndex = AGENT_DEFS.findIndex(a => a.type === agentType);
    const idx = agentIndex >= 0 ? agentIndex % english.length : 0;
    return english[idx];
  }

  subscribe(listener: VoiceEventListener) {
    this.listeners.push(listener);
    return () => { this.listeners = this.listeners.filter(l => l !== listener); };
  }

  private notify(utterance: AgentUtterance) {
    this.listeners.forEach(fn => fn(utterance));
  }

  enable() {
    this.enabled = true;
    this.startAgentActivity();
  }

  disable() {
    this.enabled = false;
    this.stopListening();
    this.stopAgentActivity();
    window.speechSynthesis?.cancel();
    this.speaking = false;
    this.queue = [];
  }

  isEnabled() { return this.enabled; }
  isListening() { return this.listening; }
  isSpeaking() { return this.speaking; }

  private startAgentActivity() {
    if (this.activityTimer) return;
    this.scheduleNext();
  }

  private scheduleNext() {
    const delay = 4000 + Math.random() * 6000;
    this.activityTimer = setTimeout(() => {
      if (!this.enabled) return;
      this.speakRandomActivity();
      this.scheduleNext();
    }, delay);
  }

  private stopAgentActivity() {
    if (this.activityTimer) {
      clearTimeout(this.activityTimer);
      this.activityTimer = null;
    }
  }

  private speakRandomActivity() {
    if (this.speaking) return;
    let idx: number;
    do {
      idx = Math.floor(Math.random() * AGENT_DEFS.length);
    } while (idx === this.lastAgentIndex && AGENT_DEFS.length > 1);
    this.lastAgentIndex = idx;

    const agent = AGENT_DEFS[idx];
    const lines = AGENT_ACTIVITY_LINES[agent.type] || AGENT_ACTIVITY_LINES['triage'];
    const text = lines[Math.floor(Math.random() * lines.length)];
    this.speak(agent, text);
  }

  speak(agent: AgentDef, text: string) {
    if (!this.enabled) return;

    const utterance: AgentUtterance = {
      agentId: agent.id,
      agentName: agent.name,
      agentColor: agent.color,
      text,
      timestamp: Date.now(),
    };

    if (this.speaking) {
      this.queue.push(utterance);
      return;
    }

    this.performSpeak(utterance);
  }

  private performSpeak(utterance: AgentUtterance) {
    this.speaking = true;
    this.notify(utterance);

    if (!window.speechSynthesis) {
      setTimeout(() => this.onSpeechEnd(), 2000);
      return;
    }

    const agentDef = AGENT_DEFS.find(a => a.id === utterance.agentId);
    const agentType = agentDef?.type || 'orchestrator';

    const su = new SpeechSynthesisUtterance(utterance.text);
    const voice = this.pickVoice(agentType);
    if (voice) su.voice = voice;
    su.pitch = VOICE_PITCH_MAP[agentType] ?? 1.0;
    su.rate = VOICE_RATE_MAP[agentType] ?? 1.0;
    su.volume = 0.8;

    su.onend = () => this.onSpeechEnd();
    su.onerror = () => this.onSpeechEnd();

    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(su);
  }

  private onSpeechEnd() {
    this.speaking = false;
    if (this.queue.length > 0) {
      const next = this.queue.shift()!;
      setTimeout(() => this.performSpeak(next), 600);
    }
  }

  onUserMessage(callback: (text: string) => void) {
    this.userMessageCallback = callback;
  }

  startListening() {
    if (this.listening) return;
    const SpeechRecognitionAPI = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) return;

    window.speechSynthesis?.cancel();
    this.speaking = false;

    this.recognition = new SpeechRecognitionAPI();
    this.recognition.continuous = false;
    this.recognition.interimResults = false;
    this.recognition.lang = 'en-US';

    this.recognition.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = event.results[0]?.[0]?.transcript;
      if (transcript && this.userMessageCallback) {
        this.userMessageCallback(transcript);
      }
    };

    this.recognition.onend = () => { this.listening = false; };
    this.recognition.onerror = () => { this.listening = false; };

    this.recognition.start();
    this.listening = true;
  }

  stopListening() {
    if (this.recognition) {
      this.recognition.abort();
      this.recognition = null;
    }
    this.listening = false;
  }

  respondToUser(userText: string): { agent: AgentDef; response: string } {
    const lower = userText.toLowerCase();
    let agent = AGENT_DEFS[2];
    let response = '';

    if (lower.includes('triage') || lower.includes('alert') || lower.includes('atlas')) {
      agent = AGENT_DEFS[0];
    } else if (lower.includes('enrich') || lower.includes('intel') || lower.includes('sage') || lower.includes('ioc')) {
      agent = AGENT_DEFS[1];
    } else if (lower.includes('invest') || lower.includes('nova') || lower.includes('attack chain') || lower.includes('lateral')) {
      agent = AGENT_DEFS[3];
    } else if (lower.includes('respond') || lower.includes('block') || lower.includes('isolat') || lower.includes('contain') || lower.includes('vanguard')) {
      agent = AGENT_DEFS[4];
    }

    if (lower.includes('status') || lower.includes('how are') || lower.includes('report')) {
      response = `${agent.name} here. I'm currently ${agent.status}. ${agent.task}. My accuracy is at ${agent.metrics.accuracy}% with ${agent.metrics.tasksCompleted} tasks completed.`;
    } else if (lower.includes('threat') || lower.includes('critical') || lower.includes('danger')) {
      response = `${agent.name} reporting. We have active threat indicators across multiple vectors. The triage queue has high-severity items and our correlation engine flagged several cross-domain patterns. I recommend escalating the investigation.`;
    } else if (lower.includes('block') || lower.includes('isolat') || lower.includes('contain') || lower.includes('stop')) {
      response = `Understood. Vanguard here. I can execute containment actions immediately. Ready to block IPs, isolate hosts, or disable accounts on your command. Awaiting explicit authorization.`;
    } else if (lower.includes('summary') || lower.includes('overview') || lower.includes('brief')) {
      response = `Commander here. All five agents are operational. We've processed over ${(AGENT_DEFS.reduce((s, a) => s + a.metrics.tasksCompleted, 0)).toLocaleString()} tasks with an average accuracy above 97%. Current threat level is elevated. Three investigation items require your attention.`;
    } else if (lower.includes('hello') || lower.includes('hi') || lower.includes('hey')) {
      response = `${agent.name} here. Welcome to the SOC Operations Center. All agents are at your service. How can I assist you?`;
    } else {
      response = `${agent.name} acknowledging. I'm processing your request regarding "${userText.slice(0, 50)}". Let me coordinate with the team and surface relevant findings.`;
    }

    return { agent, response };
  }

  destroy() {
    this.disable();
    this.listeners = [];
    this.userMessageCallback = null;
  }
}

export const voiceEngine = new VoiceConversationEngine();
