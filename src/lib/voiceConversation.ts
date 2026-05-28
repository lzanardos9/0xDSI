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
    "Alright, I've got a fresh batch of fourteen alerts coming in -- let me run them through classification real quick.",
    "Okay, severity scoring's done. Three criticals jumped out, so I'm flagging those for immediate review.",
    "That port scan cluster looks like noise to me. High false-positive confidence, so I'm filtering it out.",
    "Alert twenty-eight forty-seven is interesting. The MITRE mapping's pointing toward credential access, so I'm kicking it over to enrichment.",
    "Triage queue is clear for now. I'll keep watching, but things are pretty quiet at the moment.",
    "Heads up -- I'm seeing a burst of auth failures coming out of Eastern Europe. Could be something, could be nothing.",
    "This phishing cluster looks a lot like what we saw last week. Let me pull up that campaign and cross-reference.",
    "Got a weird one here -- SSH brute force attempts, but they're rotating through known leaked credentials. Escalating.",
    "Just finished re-scoring the backlog. Moved two alerts up to high priority based on the latest threat context.",
  ],
  enrichment: [
    "Running this indicator against all twelve of our threat intel feeds now. Give me a second.",
    "Okay, got a hit in AlienVault OTX. This IP's been tied to APT41 infrastructure -- that's not good.",
    "Enrichment's wrapped up. I've added WHOIS records and geo context so Investigation has the full picture.",
    "Nothing on VirusTotal for this hash, which honestly makes me more suspicious. Could be a zero-day sample.",
    "I'm pulling OSINT on the domain registrant. The WHOIS data looks intentionally obscured.",
    "ThreatFox just confirmed this is a known C2 server. I'm tagging every event that touched it.",
    "CIRCL pushed an update to their feed a few minutes ago. Let me check if anything matches our telemetry.",
    "Cross-referencing this domain against passive DNS -- it's been resolving to three different IPs in the past week.",
    "The reputation score on this IP is tanking fast. Multiple feeds are flagging it now.",
  ],
  orchestrator: [
    "I'm sending this one over to Nova. The attack chain's complex enough that it needs a deep dive.",
    "All agents are healthy and throughput looks good. Nothing bottlenecked right now.",
    "I need to re-prioritize the queue. That lateral movement finding should jump to the front.",
    "Coordinating between triage and investigation on this one -- there are overlapping signals.",
    "Just dispatched an enrichment request for those DNS tunneling indicators we spotted earlier.",
    "Workflow's wrapped up. I've updated the case file with findings from all the agents.",
    "Atlas is running at ninety-two percent capacity. I might need to redistribute some of that workload.",
    "Shifting priorities -- we've got two concurrent investigations now, so I'm balancing the load across the team.",
    "Good news -- the pipeline cleared a backlog of forty events in the last cycle without any drops.",
  ],
  investigation: [
    "I'm building out the attack graph for this lateral movement chain. The picture's getting clearer.",
    "Yeah, confirmed -- the attacker pivoted from a workstation straight to the domain controller.",
    "Looking at the process tree now. PowerShell got spawned from a Word macro, which is classic.",
    "Network analysis is showing a beacon every sixty seconds back to the C2. Pretty textbook interval.",
    "Found the persistence mechanism. They registered a scheduled task under the SYSTEM context.",
    "I've traced the exfiltration path. Looks like about four hundred megs went out over DNS tunneling.",
    "Investigation's done on my end. I'm packaging everything up for the response team.",
    "There's something off about this process lineage. Let me dig deeper into the parent chain.",
    "Reconstructed the full attack timeline. Initial access was about three hours before we caught it.",
  ],
  response: [
    "Pushing an IP block on one-eighty-five-two-twenty-one-oh-one-thirty-four now. Firewall rule's going out.",
    "I'm isolating the compromised endpoint. Should be cut off from the network in a few seconds.",
    "Containment's confirmed -- the C2 beacon has gone silent. That's what I like to see.",
    "Rolling emergency firewall rules out across all the edge devices. This should close the gap.",
    "Disabled the compromised service account. They won't be able to use those creds anymore.",
    "Quarantine's complete and I've kicked off a forensic image capture for the investigation record.",
    "All response actions are verified. Generating the incident summary now.",
    "Just pushed updated block rules to the proxy tier as well. Belt and suspenders on this one.",
    "Recovery playbook's running. I'll have the affected systems back in production within the hour.",
  ],
};

const VOICE_PITCH_MAP: Record<string, number> = {
  triage: 1.0,
  enrichment: 0.95,
  orchestrator: 0.92,
  investigation: 0.88,
  response: 1.02,
};

const VOICE_RATE_MAP: Record<string, number> = {
  triage: 0.92,
  enrichment: 0.88,
  orchestrator: 0.9,
  investigation: 0.85,
  response: 0.95,
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

    // Prefer natural/premium voices over robotic ones
    const naturalKeywords = ['natural', 'premium', 'enhanced', 'neural', 'google', 'samantha', 'daniel', 'karen', 'moira', 'alex', 'tom', 'fiona', 'tessa'];
    const roboticKeywords = ['espeak', 'festival', 'mbrola'];

    const naturalVoices = english.filter(v => {
      const name = v.name.toLowerCase();
      if (roboticKeywords.some(k => name.includes(k))) return false;
      return naturalKeywords.some(k => name.includes(k)) || v.localService === false;
    });

    const pool = naturalVoices.length >= 3 ? naturalVoices : english;

    // Assign different voices to each agent for distinct personalities
    const voicePrefs: Record<string, string[]> = {
      triage: ['zira', 'samantha', 'karen', 'google us', 'female'],
      enrichment: ['daniel', 'alex', 'google uk', 'male'],
      orchestrator: ['david', 'tom', 'james', 'google us', 'male'],
      investigation: ['moira', 'fiona', 'tessa', 'google uk', 'female'],
      response: ['aaron', 'fred', 'lee', 'google us', 'male'],
    };

    const prefs = voicePrefs[agentType] || [];
    for (const pref of prefs) {
      const match = pool.find(v => v.name.toLowerCase().includes(pref));
      if (match) return match;
    }

    // Fallback: assign by index to ensure each agent sounds different
    const agentIndex = AGENT_DEFS.findIndex(a => a.type === agentType);
    const idx = agentIndex >= 0 ? agentIndex % pool.length : 0;
    return pool[idx];
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
    const delay = 6000 + Math.random() * 8000;
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
    su.rate = VOICE_RATE_MAP[agentType] ?? 0.9;
    su.volume = 0.85;

    su.onend = () => this.onSpeechEnd();
    su.onerror = () => this.onSpeechEnd();

    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(su);
  }

  private onSpeechEnd() {
    this.speaking = false;
    if (this.queue.length > 0) {
      const next = this.queue.shift()!;
      setTimeout(() => this.performSpeak(next), 1200);
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
      response = `Hey, it's ${agent.name}. I'm ${agent.status} right now -- ${agent.task}. Accuracy's sitting at ${agent.metrics.accuracy}% and I've knocked out ${agent.metrics.tasksCompleted} tasks so far. Everything's running smooth on my end.`;
    } else if (lower.includes('threat') || lower.includes('critical') || lower.includes('danger')) {
      response = `${agent.name} here. So yeah, we've got active threat indicators lighting up across multiple vectors right now. The triage queue has some high-severity items and the correlation engine picked up a few cross-domain patterns that are worth digging into. I'd recommend we escalate the investigation.`;
    } else if (lower.includes('block') || lower.includes('isolat') || lower.includes('contain') || lower.includes('stop')) {
      response = `Copy that. Vanguard here -- I can move on containment right away. I'm ready to block IPs, isolate hosts, or disable accounts, just say the word. Standing by for your go-ahead.`;
    } else if (lower.includes('summary') || lower.includes('overview') || lower.includes('brief')) {
      response = `Commander here. Quick rundown -- all five agents are up and running. We've pushed through over ${(AGENT_DEFS.reduce((s, a) => s + a.metrics.tasksCompleted, 0)).toLocaleString()} tasks with accuracy holding above ninety-seven percent. Threat level's elevated at the moment, and there are three investigation items that could use your eyes.`;
    } else if (lower.includes('hello') || lower.includes('hi') || lower.includes('hey')) {
      response = `Hey there, ${agent.name} here. Welcome to the SOC. The whole team's online and ready to go -- what can I help you with?`;
    } else {
      response = `Got it -- ${agent.name} here. I'm looking into that now. Let me loop in the rest of the team and pull together whatever we've got on "${userText.slice(0, 50)}".`;
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
