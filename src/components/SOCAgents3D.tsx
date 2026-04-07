import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { Users, Zap, Brain, Target, Activity, Shield, X, Radio, AlertTriangle, TrendingUp, Glasses, Send, Loader2, MessageSquare } from 'lucide-react';
import {
  AGENT_DEFS, AgentDef, BuiltAgent, DataPacket, VRSeatParts,
  buildCharacter, buildWorkstation, buildEnvironment, buildLabel,
  spawnDataPacket, updateDataPacket, disposePacket, animateScene,
  buildThoughtBubble, updateThoughtBubble, buildVRSeat, animateVRSeat,
} from '../lib/soc3dHelpers';
import {
  EnergyBeam, FloorPulse, FloatingLabel, HologramParts,
  spawnEnergyBeam, updateEnergyBeam, disposeBeam,
  spawnFloorPulse, updateFloorPulse, disposeFloorPulse,
  spawnFloatingLabel, updateFloatingLabel, disposeFloatingLabel,
  buildFloorConnections, buildCentralHologram, animateHologram,
  buildAgentAura, animateAuras
} from '../lib/soc3dEffects';
import VRImmersiveHUD from './VRImmersiveHUD';
import SOCCommandScreen from './vr/SOCCommandScreen';

interface ChatMessage { role: 'user' | 'assistant'; content: string; agent?: string }

const AGENT_TYPE_MAP: Record<string, string> = {
  triage: 'triage', enrich: 'enrichment', orch: 'orchestrator',
  invest: 'investigation', respond: 'response',
};

const QUICK_PROMPTS: Record<string, string[]> = {
  triage: ['What alerts are you seeing?', 'Any critical threats right now?', 'Status report'],
  enrichment: ['What intel do you have on the latest IOCs?', 'Any APT matches?', 'Run enrichment on 185.220.101.34'],
  orchestrator: ['Give me a pipeline status', 'What are the agents working on?', 'Prioritize the lateral movement'],
  investigation: ['Walk me through the kill chain', 'What TTPs are we dealing with?', 'What did the attacker do after initial access?'],
  response: ['What containment actions have you taken?', 'Block the C2 IP now', 'Status on host isolation?'],
};

const AGENT_ANGLES = [-60, -30, 0, 30, 60];
const RADIUS = 5.2;
const ICON_MAP: Record<string, typeof Shield> = {
  triage: Target, enrichment: Brain, orchestrator: Shield,
  investigation: Activity, response: Zap,
};

const STATUS_MESSAGES = [
  { from: 0, to: 2, msg: 'Forwarding triaged alert batch #2847 to Orchestrator', severity: 'medium' as const },
  { from: 2, to: 1, msg: 'Requesting IOC enrichment for 185.220.101.34', severity: 'high' as const },
  { from: 1, to: 3, msg: 'Enriched data ready - APT41 correlation found', severity: 'critical' as const },
  { from: 3, to: 2, msg: 'Investigation complete - lateral movement confirmed', severity: 'critical' as const },
  { from: 2, to: 4, msg: 'Dispatching containment action for compromised host', severity: 'critical' as const },
  { from: 4, to: 2, msg: 'IP block executed successfully - threat contained', severity: 'high' as const },
  { from: 0, to: 1, msg: 'New phishing IOCs detected - requesting enrichment', severity: 'medium' as const },
  { from: 3, to: 4, msg: 'Escalating critical finding - immediate response needed', severity: 'critical' as const },
  { from: 1, to: 3, msg: 'Threat intel match: Lazarus Group TTPs identified', severity: 'high' as const },
  { from: 4, to: 0, msg: 'Response complete - resuming alert monitoring', severity: 'low' as const },
  { from: 0, to: 3, msg: 'Suspicious PowerShell execution chain detected', severity: 'high' as const },
  { from: 2, to: 0, msg: 'Reassigning priority: brute-force cluster identified', severity: 'medium' as const },
  { from: 1, to: 4, msg: 'C2 beacon identified - recommend immediate isolation', severity: 'critical' as const },
  { from: 3, to: 1, msg: 'Requesting additional context for DNS tunneling IOCs', severity: 'medium' as const },
  { from: 4, to: 3, msg: 'Host quarantined - forensic snapshot initiated', severity: 'high' as const },
];

interface FeedItem { msg: string; color: string; time: string; severity: string }

export default function SOCAgents3D() {
  const containerRef = useRef<HTMLDivElement>(null);
  const agentsRef = useRef<BuiltAgent[]>([]);
  const packetsRef = useRef<DataPacket[]>([]);
  const beamsRef = useRef<EnergyBeam[]>([]);
  const pulsesRef = useRef<FloorPulse[]>([]);
  const labelsRef = useRef<FloatingLabel[]>([]);
  const aurasRef = useRef<THREE.Points[]>([]);
  const holoRef = useRef<HologramParts | null>(null);
  const vrSeatRef = useRef<VRSeatParts | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const timeRef = useRef(0);
  const [selected, setSelected] = useState<AgentDef | null>(null);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [liveStats, setLiveStats] = useState({ events: 24567, threats: 156, packets: 0, alertLevel: 'ELEVATED' });
  const [alertFlash, setAlertFlash] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [chatHistory, setChatHistory] = useState<Record<string, ChatMessage[]>>({});
  const [chatLoading, setChatLoading] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  const [vrMode, setVrMode] = useState<'orbital' | 'role-select' | 'immersive'>('orbital');
  const [vrRole, setVrRole] = useState<string | null>(null);
  const [xrSupported, setXrSupported] = useState(false);
  const vrCameraMode = useRef<'orbital' | 'entering' | 'firstperson' | 'exiting'>('orbital');
  const vrTransition = useRef(0);
  const fpYaw = useRef(0);
  const fpPitch = useRef(0);

  const addFeedItem = useCallback((msg: string, color: string, severity: string) => {
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setFeed(prev => [{ msg, color, time, severity }, ...prev].slice(0, 16));
  }, []);

  const sendChat = useCallback(async (text: string) => {
    if (!selected || !text.trim() || chatLoading) return;
    const agentType = AGENT_TYPE_MAP[selected.id] || selected.type;
    const agentId = selected.id;
    const agentColor = selected.color;
    const agentName = selected.name;

    const userMsg: ChatMessage = { role: 'user', content: text.trim() };
    setChatHistory(prev => ({ ...prev, [agentId]: [...(prev[agentId] || []), userMsg] }));
    setChatInput('');
    setChatLoading(true);

    addFeedItem(`You -> ${agentName}: ${text.trim()}`, '#94a3b8', 'medium');

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      const history = (chatHistory[agentId] || []).slice(-6);

      const res = await fetch(`${supabaseUrl}/functions/v1/agent-chat`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${anonKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentType, message: text.trim(), conversationHistory: history }),
      });

      const data = await res.json();
      const answer = data.answer || data.error || 'Comms down. Try again.';

      const assistantMsg: ChatMessage = { role: 'assistant', content: answer, agent: agentName };
      setChatHistory(prev => ({ ...prev, [agentId]: [...(prev[agentId] || []), userMsg, assistantMsg] }));
      addFeedItem(`${agentName}: ${answer}`, agentColor, 'high');
    } catch {
      const errMsg: ChatMessage = { role: 'assistant', content: 'Signal lost. Retrying comms link...', agent: agentName };
      setChatHistory(prev => ({ ...prev, [agentId]: [...(prev[agentId] || []), userMsg, errMsg] }));
    }
    setChatLoading(false);
    setTimeout(() => chatScrollRef.current?.scrollTo({ top: chatScrollRef.current.scrollHeight, behavior: 'smooth' }), 100);
  }, [selected, chatLoading, chatHistory, addFeedItem]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050810);
    scene.fog = new THREE.FogExp2(0x050810, 0.028);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(55, el.clientWidth / el.clientHeight, 0.1, 120);
    camera.position.set(0, 7, 12);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(el.clientWidth, el.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.3;
    el.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.25));
    const keyLight = new THREE.DirectionalLight(0xffffff, 0.5);
    keyLight.position.set(5, 10, 5);
    scene.add(keyLight);
    const rimLight = new THREE.DirectionalLight(0x06b6d4, 0.3);
    rimLight.position.set(-5, 3, -5);
    scene.add(rimLight);

    const { particles } = buildEnvironment(scene);
    const holoParts = buildCentralHologram(scene);
    holoRef.current = holoParts;

    const agents: BuiltAgent[] = [];
    AGENT_DEFS.forEach((def, i) => {
      const agent = buildCharacter(def, AGENT_ANGLES[i], RADIUS);
      buildWorkstation(def, agent.group);
      const label = buildLabel(def.name, def.role, def.color);
      label.position.y = 1.85;
      agent.group.add(label);
      scene.add(agent.group);
      agents.push(agent);
    });
    agents.forEach(agent => {
      const { sprite, canvas } = buildThoughtBubble(agent);
      agent.thoughtSprite = sprite;
      agent.thoughtCanvas = canvas;
    });
    agentsRef.current = agents;

    buildFloorConnections(agents, scene);
    const auras = agents.map(a => buildAgentAura(a, scene));
    aurasRef.current = auras;

    const vrSeat = buildVRSeat(scene, RADIUS);
    vrSeatRef.current = vrSeat;

    if ('xr' in navigator) {
      (navigator as unknown as { xr: { isSessionSupported: (m: string) => Promise<boolean> } })
        .xr.isSessionSupported('immersive-vr')
        .then(s => setXrSupported(s))
        .catch(() => {});
    }

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    const allMeshes = agents.flatMap(a => a.bodyMeshes);

    const onClick = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      const hits = raycaster.intersectObjects(allMeshes, true);
      if (hits.length > 0) {
        let obj: THREE.Object3D | null = hits[0].object;
        while (obj && obj.parent !== scene) obj = obj.parent;
        const idx = agents.findIndex(a => a.group === obj);
        if (idx >= 0) setSelected(agents[idx].def);
      } else {
        setSelected(null);
      }
    };
    el.addEventListener('click', onClick);

    let isDragging = false;
    let prevX = 0;
    let prevY = 0;
    let cameraAngle = 0;
    let cameraVertical = 0;
    let cameraZoom = 12;
    const onDown = (e: MouseEvent) => { isDragging = true; prevX = e.clientX; prevY = e.clientY; };
    const onUp = () => { isDragging = false; };
    const onMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const dx = (e.clientX - prevX) * 0.004;
      const dy = (e.clientY - prevY) * 0.004;
      prevX = e.clientX;
      prevY = e.clientY;
      if (vrCameraMode.current === 'firstperson') {
        fpYaw.current = Math.max(-1.2, Math.min(1.2, fpYaw.current + dx));
        fpPitch.current = Math.max(-0.4, Math.min(0.4, fpPitch.current - dy));
      } else {
        cameraAngle += dx;
        cameraVertical += dy * 3.75;
        cameraVertical = Math.max(-3, Math.min(6, cameraVertical));
      }
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      cameraZoom += e.deltaY * 0.008;
      cameraZoom = Math.max(5, Math.min(22, cameraZoom));
    };
    el.addEventListener('mousedown', onDown);
    window.addEventListener('mouseup', onUp);
    el.addEventListener('mousemove', onMove);
    el.addEventListener('wheel', onWheel, { passive: false });

    const seatTargetPos = new THREE.Vector3(0, 1.5, -RADIUS);
    const basePitch = Math.atan2(-0.7, RADIUS);

    let animId: number;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      timeRef.current += 0.012;
      const t = timeRef.current;

      const cm = vrCameraMode.current;
      if (cm === 'entering') {
        camera.position.lerp(seatTargetPos, 0.045);
        camera.lookAt(0, 0.8, 0);
        vrTransition.current += 0.018;
        if (vrTransition.current >= 1) vrCameraMode.current = 'firstperson';
      } else if (cm === 'firstperson') {
        camera.position.copy(seatTargetPos);
        const yaw = fpYaw.current;
        const pitch = basePitch + fpPitch.current;
        camera.lookAt(
          seatTargetPos.x + Math.sin(yaw) * Math.cos(pitch) * 10,
          seatTargetPos.y + Math.sin(pitch) * 10,
          seatTargetPos.z + Math.cos(yaw) * Math.cos(pitch) * 10,
        );
      } else if (cm === 'exiting') {
        const orbPos = new THREE.Vector3(
          Math.sin(cameraAngle) * cameraZoom,
          5 + cameraZoom * 0.35 + cameraVertical,
          Math.cos(cameraAngle) * cameraZoom,
        );
        camera.position.lerp(orbPos, 0.045);
        camera.lookAt(0, 0.8, 0);
        vrTransition.current += 0.02;
        if (vrTransition.current >= 1) {
          vrCameraMode.current = 'orbital';
          setVrMode('orbital');
          setVrRole(null);
        }
      } else {
        const camR = cameraZoom;
        camera.position.x = Math.sin(cameraAngle) * camR;
        camera.position.z = Math.cos(cameraAngle) * camR;
        camera.position.y = 5 + camR * 0.35 + cameraVertical;
        camera.lookAt(0, 0.8, 0);
      }

      animateScene(agents, t, particles);
      if (holoRef.current) animateHologram(holoRef.current, t);
      animateAuras(aurasRef.current, agents, t);
      if (vrSeatRef.current) animateVRSeat(vrSeatRef.current, t, cm === 'firstperson' || cm === 'entering');

      packetsRef.current = packetsRef.current.filter(p => {
        const done = updateDataPacket(p);
        if (done) disposePacket(p, scene);
        return !done;
      });

      beamsRef.current = beamsRef.current.filter(b => {
        const done = updateEnergyBeam(b);
        if (done) disposeBeam(b, scene);
        return !done;
      });

      pulsesRef.current = pulsesRef.current.filter(p => {
        const done = updateFloorPulse(p);
        if (done) disposeFloorPulse(p, scene);
        return !done;
      });

      labelsRef.current = labelsRef.current.filter(l => {
        const done = updateFloatingLabel(l);
        if (done) disposeFloatingLabel(l, scene);
        return !done;
      });

      renderer.render(scene, camera);
    };
    animate();

    const onResize = () => {
      if (!el) return;
      camera.aspect = el.clientWidth / el.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(el.clientWidth, el.clientHeight);
    };
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('mouseup', onUp);
      el.removeEventListener('click', onClick);
      el.removeEventListener('mousedown', onDown);
      el.removeEventListener('mousemove', onMove);
      el.removeEventListener('wheel', onWheel);
      renderer.dispose();
      if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement);
    };
  }, []);

  useEffect(() => {
    const commInterval = setInterval(() => {
      const agents = agentsRef.current;
      const scene = sceneRef.current;
      if (agents.length === 0 || !scene) return;

      const scenario = STATUS_MESSAGES[Math.floor(Math.random() * STATUS_MESSAGES.length)];
      const packet = spawnDataPacket(agents[scenario.from], agents[scenario.to], scene);
      packetsRef.current.push(packet);

      const beam = spawnEnergyBeam(agents[scenario.from], agents[scenario.to], scene);
      beamsRef.current.push(beam);

      agents[scenario.to].reactionTime = timeRef.current + 1.5;

      addFeedItem(
        `${agents[scenario.from].def.name} -> ${agents[scenario.to].def.name}: ${scenario.msg}`,
        agents[scenario.from].def.color,
        scenario.severity
      );

      setLiveStats(prev => ({
        ...prev,
        events: prev.events + Math.floor(Math.random() * 50) + 10,
        packets: prev.packets + 1,
        threats: prev.threats + (scenario.severity === 'critical' ? 1 : 0),
      }));
    }, 1600);

    const pulseInterval = setInterval(() => {
      const scene = sceneRef.current;
      if (!scene) return;
      const colors = [0x06b6d4, 0x3b82f6, 0x14b8a6, 0xf59e0b, 0xef4444];
      const pulse = spawnFloorPulse(scene, colors[Math.floor(Math.random() * colors.length)]);
      pulsesRef.current.push(pulse);
    }, 3000);

    const labelInterval = setInterval(() => {
      const scene = sceneRef.current;
      if (!scene) return;
      if (labelsRef.current.length < 6) {
        labelsRef.current.push(spawnFloatingLabel(scene));
      }
    }, 4000);

    const alertInterval = setInterval(() => {
      if (Math.random() > 0.6) {
        setAlertFlash(true);
        setLiveStats(prev => ({ ...prev, alertLevel: 'CRITICAL' }));
        setTimeout(() => {
          setAlertFlash(false);
          setLiveStats(prev => ({ ...prev, alertLevel: Math.random() > 0.5 ? 'ELEVATED' : 'HIGH' }));
        }, 2000);
      }
    }, 8000);

    const thoughtInterval = setInterval(() => {
      const agents = agentsRef.current;
      if (agents.length === 0) return;
      const idx = Math.floor(Math.random() * agents.length);
      updateThoughtBubble(agents[idx]);
    }, 2800);

    return () => {
      clearInterval(commInterval);
      clearInterval(pulseInterval);
      clearInterval(labelInterval);
      clearInterval(alertInterval);
      clearInterval(thoughtInterval);
    };
  }, [addFeedItem]);

  const handleEnterVR = useCallback(() => {
    setVrMode('role-select');
    setSelected(null);
  }, []);

  const handleSelectRole = useCallback((role: string) => {
    setVrRole(role);
    setVrMode('immersive');
    vrCameraMode.current = 'entering';
    vrTransition.current = 0;
    fpYaw.current = 0;
    fpPitch.current = 0;
  }, []);

  const handleExitVR = useCallback(() => {
    if (vrCameraMode.current === 'firstperson' || vrCameraMode.current === 'entering') {
      vrCameraMode.current = 'exiting';
      vrTransition.current = 0;
    } else {
      setVrMode('orbital');
      setVrRole(null);
    }
  }, []);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    if (vrMode === 'orbital' || vrMode === 'role-select') {
      scene.background = new THREE.Color(0x050810);
    } else {
      scene.background = null;
    }
  }, [vrMode]);

  const Icon = selected ? (ICON_MAP[selected.type] || Shield) : Shield;

  const isOrbital = vrMode === 'orbital';

  return (
    <div className="relative w-full h-[calc(100vh-180px)] rounded-xl overflow-hidden border border-slate-700/50">
      {!isOrbital && (
        <div className="absolute inset-0 z-[5]">
          <SOCCommandScreen feed={feed} />
        </div>
      )}
      <div ref={containerRef} className="absolute inset-0 z-10" style={{ cursor: vrMode === 'immersive' ? 'crosshair' : 'grab', pointerEvents: isOrbital ? 'auto' : 'none' }} />

      {alertFlash && isOrbital && (
        <div className="absolute inset-0 z-5 pointer-events-none animate-pulse" style={{
          background: 'radial-gradient(ellipse at center, rgba(239,68,68,0.12) 0%, transparent 70%)',
          borderColor: 'rgba(239,68,68,0.3)',
          borderWidth: 2,
          borderRadius: '0.75rem',
        }} />
      )}

      {isOrbital && (
        <>
          <div className="absolute top-4 left-4 z-10 pointer-events-none space-y-2">
            <div className="flex items-center gap-3 bg-slate-900/85 backdrop-blur-xl px-4 py-2.5 rounded-lg border border-slate-700/50 shadow-lg shadow-black/20">
              <Users className="w-5 h-5 text-cyan-400" />
              <span className="text-white font-semibold text-sm tracking-wide">3D SOC Operations Center</span>
              <span className="text-[10px] text-slate-500 ml-1">Drag to orbit | Scroll to zoom | Click agents</span>
            </div>
            <div className="flex gap-2">
              <div className="bg-slate-900/85 backdrop-blur-xl px-3 py-2 rounded-lg border border-slate-700/50 shadow-lg shadow-black/20">
                <div className="text-[10px] text-slate-500 uppercase tracking-wider">Events</div>
                <div className="text-sm font-bold text-cyan-400 tabular-nums">{liveStats.events.toLocaleString()}</div>
              </div>
              <div className="bg-slate-900/85 backdrop-blur-xl px-3 py-2 rounded-lg border border-slate-700/50 shadow-lg shadow-black/20">
                <div className="text-[10px] text-slate-500 uppercase tracking-wider">Threats</div>
                <div className="text-sm font-bold text-red-400 tabular-nums">{liveStats.threats}</div>
              </div>
              <div className="bg-slate-900/85 backdrop-blur-xl px-3 py-2 rounded-lg border border-slate-700/50 shadow-lg shadow-black/20">
                <div className="text-[10px] text-slate-500 uppercase tracking-wider">Comms</div>
                <div className="text-sm font-bold text-emerald-400 tabular-nums">{liveStats.packets}</div>
              </div>
              <div className={`bg-slate-900/85 backdrop-blur-xl px-3 py-2 rounded-lg border shadow-lg shadow-black/20 ${
                liveStats.alertLevel === 'CRITICAL' ? 'border-red-500/50' : 'border-slate-700/50'
              }`}>
                <div className="text-[10px] text-slate-500 uppercase tracking-wider">Threat Level</div>
                <div className={`text-sm font-bold tabular-nums flex items-center gap-1 ${
                  liveStats.alertLevel === 'CRITICAL' ? 'text-red-400' :
                  liveStats.alertLevel === 'HIGH' ? 'text-amber-400' : 'text-amber-300'
                }`}>
                  {liveStats.alertLevel === 'CRITICAL' && <AlertTriangle className="w-3 h-3 animate-pulse" />}
                  {liveStats.alertLevel}
                </div>
              </div>
            </div>
          </div>

          <div className="absolute top-4 right-4 z-10 flex flex-col gap-1.5">
            {AGENT_DEFS.map(d => {
              const I = ICON_MAP[d.type] || Shield;
              return (
                <button
                  key={d.id}
                  onClick={() => setSelected(selected?.id === d.id ? null : d)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all border backdrop-blur-xl shadow-lg shadow-black/20 ${
                    selected?.id === d.id
                      ? 'bg-slate-800/90 border-slate-500'
                      : 'bg-slate-900/80 border-slate-700/50 hover:bg-slate-800/80 hover:border-slate-600/50'
                  }`}
                  style={{ color: d.color }}
                >
                  <I className="w-3.5 h-3.5" />
                  <span className="w-20 text-left">{d.name}</span>
                  <span className="text-[10px] text-slate-500 w-16">{d.role.split(' ')[0]}</span>
                  <span className={`w-2 h-2 rounded-full ${
                    d.status === 'alert' ? 'bg-red-400 animate-pulse shadow-red-400/50 shadow-sm' :
                    d.status === 'busy' ? 'bg-amber-400 animate-pulse shadow-amber-400/50 shadow-sm' : 'bg-emerald-400 shadow-emerald-400/50 shadow-sm'
                  }`} />
                </button>
              );
            })}
          </div>

          {selected && (() => {
            const agentMessages = chatHistory[selected.id] || [];
            const agentType = AGENT_TYPE_MAP[selected.id] || selected.type;
            const quickPrompts = QUICK_PROMPTS[agentType] || QUICK_PROMPTS.triage;
            return (
            <div className="absolute bottom-4 left-4 z-10 w-96 bg-slate-900/95 backdrop-blur-xl rounded-xl border border-slate-700/50 shadow-2xl shadow-black/30 flex flex-col overflow-hidden" style={{ maxHeight: 'calc(100% - 100px)' }}>
              <div className="flex items-center justify-between p-3 border-b border-slate-800/50">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-lg" style={{ backgroundColor: selected.color + '18', boxShadow: `0 0 12px ${selected.color}30` }}>
                    <Icon className="w-5 h-5" style={{ color: selected.color }} />
                  </div>
                  <div>
                    <h3 className="text-white font-bold text-sm">{selected.name}</h3>
                    <p className="text-[11px]" style={{ color: selected.color }}>{selected.role}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${
                    selected.status === 'alert' ? 'bg-red-500/15 text-red-400 ring-1 ring-red-500/30' :
                    selected.status === 'busy' ? 'bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/30' :
                    'bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30'
                  }`}>
                    {selected.status}
                  </span>
                  <button onClick={() => setSelected(null)} className="text-slate-500 hover:text-white transition p-1 rounded hover:bg-slate-800">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-1.5 p-2.5 border-b border-slate-800/30">
                {[
                  { label: 'Accuracy', value: `${selected.metrics.accuracy}%`, color: 'text-cyan-400' },
                  { label: 'Events/s', value: selected.metrics.throughput.toString(), color: 'text-emerald-400' },
                  { label: 'Completed', value: selected.metrics.tasksCompleted.toLocaleString(), color: 'text-amber-400' },
                ].map(s => (
                  <div key={s.label} className="bg-slate-800/40 rounded-lg p-1.5 text-center">
                    <div className={`font-bold text-xs ${s.color}`}>{s.value}</div>
                    <div className="text-slate-600 text-[9px]">{s.label}</div>
                  </div>
                ))}
              </div>

              <div ref={chatScrollRef} className="flex-1 overflow-y-auto p-3 space-y-2 min-h-[80px] max-h-[240px]">
                {agentMessages.length === 0 ? (
                  <div className="text-center py-4">
                    <MessageSquare className="w-5 h-5 mx-auto mb-2" style={{ color: selected.color + '60' }} />
                    <p className="text-[11px] text-slate-500">Talk to <span className="font-bold" style={{ color: selected.color }}>{selected.name}</span></p>
                    <p className="text-[10px] text-slate-600 mt-0.5">{selected.task}</p>
                  </div>
                ) : (
                  agentMessages.map((msg, i) => (
                    <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[85%] rounded-xl px-3 py-2 ${
                        msg.role === 'user'
                          ? 'bg-slate-700/60 text-slate-200'
                          : 'border text-slate-200'
                      }`}
                        style={msg.role === 'assistant' ? { borderColor: selected.color + '30', backgroundColor: selected.color + '08' } : undefined}
                      >
                        {msg.role === 'assistant' && (
                          <div className="text-[9px] font-bold mb-0.5 tracking-wider" style={{ color: selected.color }}>{selected.name}</div>
                        )}
                        <p className="text-[11px] leading-relaxed">{msg.content}</p>
                      </div>
                    </div>
                  ))
                )}
                {chatLoading && (
                  <div className="flex justify-start">
                    <div className="flex items-center gap-2 px-3 py-2 rounded-xl border" style={{ borderColor: selected.color + '30', backgroundColor: selected.color + '08' }}>
                      <div className="flex gap-1">
                        <div className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ backgroundColor: selected.color, animationDelay: '0ms' }} />
                        <div className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ backgroundColor: selected.color, animationDelay: '150ms' }} />
                        <div className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ backgroundColor: selected.color, animationDelay: '300ms' }} />
                      </div>
                      <span className="text-[10px]" style={{ color: selected.color }}>{selected.name} is analyzing...</span>
                    </div>
                  </div>
                )}
              </div>

              {agentMessages.length === 0 && !chatLoading && (
                <div className="px-3 pb-2 flex gap-1.5 flex-wrap">
                  {quickPrompts.map((prompt) => (
                    <button
                      key={prompt}
                      onClick={() => sendChat(prompt)}
                      className="text-[10px] px-2.5 py-1.5 rounded-lg border border-slate-700/50 text-slate-400 hover:text-white hover:border-slate-500 transition bg-slate-800/30 hover:bg-slate-800/60"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              )}

              <div className="p-2.5 border-t border-slate-800/50">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={e => setChatInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(chatInput); } }}
                    placeholder={`Talk to ${selected.name}...`}
                    disabled={chatLoading}
                    className="flex-1 bg-slate-800/50 border border-slate-700/40 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-slate-500 disabled:opacity-50"
                  />
                  <button
                    onClick={() => sendChat(chatInput)}
                    disabled={chatLoading || !chatInput.trim()}
                    className="p-2 rounded-lg transition-all disabled:opacity-30"
                    style={{ backgroundColor: chatInput.trim() && !chatLoading ? selected.color + '20' : 'transparent', color: selected.color }}
                  >
                    {chatLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>
            );
          })()}

          <div className="absolute bottom-4 right-4 z-10 w-[420px] max-h-72 overflow-hidden">
            <div className="bg-slate-900/85 backdrop-blur-xl rounded-xl border border-slate-700/50 p-3 shadow-2xl shadow-black/30">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Radio className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
                  <span className="text-xs font-semibold text-slate-300 tracking-wide">Agent Communication Feed</span>
                </div>
                <span className="text-[10px] text-slate-600">{feed.length} messages</span>
              </div>
              <div className="space-y-0.5 max-h-52 overflow-y-auto custom-scrollbar">
                {feed.length === 0 && (
                  <p className="text-xs text-slate-600 italic py-2">Initializing agent mesh network...</p>
                )}
                {feed.map((item, i) => (
                  <div key={i} className={`text-[11px] leading-relaxed py-1.5 px-2.5 rounded-lg transition-all duration-300 ${
                    i === 0 ? 'bg-slate-800/70 border border-slate-700/30' : i < 3 ? 'bg-slate-800/30 opacity-85' : 'opacity-50'
                  }`}>
                    <div className="flex items-center gap-1.5">
                      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                        item.severity === 'critical' ? 'bg-red-400 animate-pulse' :
                        item.severity === 'high' ? 'bg-amber-400' :
                        item.severity === 'medium' ? 'bg-blue-400' : 'bg-slate-500'
                      }`} />
                      <span className="text-slate-500 flex-shrink-0">{item.time}</span>
                      <span style={{ color: item.color }} className="truncate">{item.msg}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <button
            onClick={handleEnterVR}
            className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 group flex items-center gap-3 px-6 py-3 rounded-xl bg-slate-900/90 backdrop-blur-xl border border-cyan-500/30 hover:border-cyan-400/60 transition-all duration-300 hover:scale-105 shadow-lg shadow-cyan-500/5 hover:shadow-cyan-500/15"
          >
            <div className="relative">
              <Glasses className="w-5 h-5 text-cyan-400 group-hover:text-cyan-300 transition" />
              <div className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
            </div>
            <div className="text-left">
              <div className="text-sm font-bold text-white tracking-wide">ENTER VR MODE</div>
              <div className="text-[9px] text-slate-500 tracking-wider">
                {xrSupported ? 'APPLE VISION PRO DETECTED' : 'BROWSER & APPLE VISION PRO'}
              </div>
            </div>
            <div className="w-px h-6 bg-slate-700/50" />
            <div className="text-[9px] text-cyan-400/70 font-medium tracking-widest">
              HUMAN<br />IN LOOP
            </div>
          </button>
        </>
      )}

      {vrMode !== 'orbital' && (
        <VRImmersiveHUD
          mode={vrMode === 'role-select' ? 'role-select' : 'immersive'}
          selectedRole={vrRole}
          onSelectRole={handleSelectRole}
          onExit={handleExitVR}
          xrSupported={xrSupported}
          feed={feed}
        />
      )}
    </div>
  );
}
