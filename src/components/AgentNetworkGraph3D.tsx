import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Activity, Zap, Brain, Target, Shield, Cpu } from 'lucide-react';
import { communicationBus, generateMockCommunication, type AgentCommunication } from '../lib/agentCommunication';

interface AgentNode {
  id: string;
  name: string;
  type: string;
  position: THREE.Vector3;
  color: string;
  activity: number;
}

interface Communication {
  id: string;
  from: string;
  to: string;
  message: string;
  type: string;
  timestamp: number;
  progress: number;
}

const AgentNetworkGraph3D = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const [hoveredAgent, setHoveredAgent] = useState<AgentNode | null>(null);
  const [hoveredComm, setHoveredComm] = useState<Communication | null>(null);
  const [communications, setCommunications] = useState<Communication[]>([]);
  const agentNodesRef = useRef<Map<string, THREE.Mesh>>(new Map());
  const agentDataRef = useRef<AgentNode[]>([]);
  const mouseRef = useRef({ x: 0, y: 0 });

  // Initialize agents (matching database IDs)
  const agents: AgentNode[] = [
    {
      id: 'agent-5',
      name: 'Orchestrator Agent',
      type: 'orchestrator',
      position: new THREE.Vector3(0, 0, 0),
      color: '#06b6d4',
      activity: 0.9
    },
    {
      id: 'agent-1',
      name: 'Triage Agent Alpha',
      type: 'triage',
      position: new THREE.Vector3(-3, 2, 1),
      color: '#f59e0b',
      activity: 0.85
    },
    {
      id: 'agent-2',
      name: 'Enrichment Agent Beta',
      type: 'enrichment',
      position: new THREE.Vector3(3, 2, -1),
      color: '#8b5cf6',
      activity: 0.75
    },
    {
      id: 'agent-3',
      name: 'Investigation Agent Gamma',
      type: 'investigation',
      position: new THREE.Vector3(-3, -2, -1),
      color: '#3b82f6',
      activity: 0.92
    },
    {
      id: 'agent-4',
      name: 'Response Agent Delta',
      type: 'response',
      position: new THREE.Vector3(3, -2, 1),
      color: '#ef4444',
      activity: 0.88
    },
    {
      id: 'ml-model',
      name: 'ML Model Engine',
      type: 'ml',
      position: new THREE.Vector3(0, 3, 2),
      color: '#10b981',
      activity: 0.95
    }
  ];

  useEffect(() => {
    if (!containerRef.current) return;

    agentDataRef.current = agents;

    // Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0f172a);
    sceneRef.current = scene;

    // Camera setup
    const camera = new THREE.PerspectiveCamera(
      75,
      containerRef.current.clientWidth / containerRef.current.clientHeight,
      0.1,
      1000
    );
    camera.position.z = 8;
    camera.position.y = 2;
    cameraRef.current = camera;

    // Renderer setup
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    const pointLight1 = new THREE.PointLight(0x06b6d4, 1, 50);
    pointLight1.position.set(5, 5, 5);
    scene.add(pointLight1);

    const pointLight2 = new THREE.PointLight(0x8b5cf6, 0.8, 50);
    pointLight2.position.set(-5, -5, 5);
    scene.add(pointLight2);

    // Create agent nodes with labels
    agents.forEach(agent => {
      const geometry = new THREE.SphereGeometry(0.3, 32, 32);
      const material = new THREE.MeshPhongMaterial({
        color: agent.color,
        emissive: agent.color,
        emissiveIntensity: 0.3,
        shininess: 100
      });
      const sphere = new THREE.Mesh(geometry, material);
      sphere.position.copy(agent.position);
      sphere.userData = agent;
      scene.add(sphere);
      agentNodesRef.current.set(agent.id, sphere);

      // Add glow ring
      const ringGeometry = new THREE.RingGeometry(0.4, 0.5, 32);
      const ringMaterial = new THREE.MeshBasicMaterial({
        color: agent.color,
        transparent: true,
        opacity: 0.3,
        side: THREE.DoubleSide
      });
      const ring = new THREE.Mesh(ringGeometry, ringMaterial);
      ring.position.copy(agent.position);
      ring.lookAt(camera.position);
      scene.add(ring);

      // Create text label using canvas
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      if (context) {
        canvas.width = 512;
        canvas.height = 128;

        context.fillStyle = 'rgba(15, 23, 42, 0.9)';
        context.fillRect(0, 0, canvas.width, canvas.height);

        context.font = 'bold 48px Arial';
        context.fillStyle = agent.color;
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(agent.name, canvas.width / 2, canvas.height / 2);

        const texture = new THREE.CanvasTexture(canvas);
        const spriteMaterial = new THREE.SpriteMaterial({
          map: texture,
          transparent: true,
          opacity: 0.9
        });
        const sprite = new THREE.Sprite(spriteMaterial);
        sprite.position.set(agent.position.x, agent.position.y + 0.6, agent.position.z);
        sprite.scale.set(2, 0.5, 1);
        scene.add(sprite);
      }
    });

    // Create static connection lines
    const lineMaterial = new THREE.LineBasicMaterial({
      color: 0x334155,
      transparent: true,
      opacity: 0.2
    });

    agents.forEach(agent => {
      if (agent.id !== 'agent-5') {
        const points = [];
        points.push(agents[0].position);
        points.push(agent.position);
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const line = new THREE.Line(geometry, lineMaterial);
        scene.add(line);
      }
    });

    // Mouse interaction
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const onMouseMove = (event: MouseEvent) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;

      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      mouseRef.current = { x: event.clientX, y: event.clientY };

      raycaster.setFromCamera(mouse, camera);
      const meshes = Array.from(agentNodesRef.current.values());
      const intersects = raycaster.intersectObjects(meshes);

      if (intersects.length > 0) {
        const agent = intersects[0].object.userData as AgentNode;
        setHoveredAgent(agent);
      } else {
        setHoveredAgent(null);
      }
    };

    containerRef.current.addEventListener('mousemove', onMouseMove);

    // Animation loop
    let animationId: number;
    let time = 0;

    const animate = () => {
      animationId = requestAnimationFrame(animate);
      time += 0.01;

      // Rotate camera slowly
      camera.position.x = Math.sin(time * 0.2) * 8;
      camera.position.z = Math.cos(time * 0.2) * 8;
      camera.lookAt(0, 0, 0);

      // Pulse agent nodes
      agentNodesRef.current.forEach((mesh, id) => {
        const agent = agentDataRef.current.find(a => a.id === id);
        if (agent) {
          const scale = 1 + Math.sin(time * 3 + agent.activity * 10) * 0.1 * agent.activity;
          mesh.scale.set(scale, scale, scale);
        }
      });

      renderer.render(scene, camera);
    };

    animate();

    // Generate communications and emit to bus
    const generateCommunication = () => {
      const agentComm = generateMockCommunication();

      const newComm: Communication = {
        id: agentComm.id,
        from: agentComm.from,
        to: agentComm.to,
        message: agentComm.message,
        type: agentComm.type,
        timestamp: agentComm.timestamp,
        progress: 0
      };

      setCommunications(prev => [...prev, newComm]);
      communicationBus.emit(agentComm);
    };

    const commInterval = setInterval(generateCommunication, 3000);

    // Handle resize
    const handleResize = () => {
      if (!containerRef.current || !camera || !renderer) return;
      camera.aspect = containerRef.current.clientWidth / containerRef.current.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    };

    window.addEventListener('resize', handleResize);

    // Cleanup
    return () => {
      cancelAnimationFrame(animationId);
      clearInterval(commInterval);
      window.removeEventListener('resize', handleResize);
      containerRef.current?.removeEventListener('mousemove', onMouseMove);
      if (containerRef.current && renderer.domElement) {
        containerRef.current.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, []);

  // Update communications animation
  useEffect(() => {
    if (!sceneRef.current) return;

    const scene = sceneRef.current;
    const activeCommunications: Map<string, THREE.Line> = new Map();

    const animateComm = () => {
      setCommunications(prev => {
        const updated = prev.map(comm => {
          if (comm.progress >= 1) return null;

          const fromAgent = agentDataRef.current.find(a => a.id === comm.from);
          const toAgent = agentDataRef.current.find(a => a.id === comm.to);

          if (!fromAgent || !toAgent) return null;

          // Create or update line
          if (!activeCommunications.has(comm.id)) {
            const points = [fromAgent.position.clone(), toAgent.position.clone()];
            const geometry = new THREE.BufferGeometry().setFromPoints(points);

            const typeColors: { [key: string]: number } = {
              alert: 0xff4444,
              task: 0xfbbf24,
              result: 0x10b981,
              command: 0xef4444,
              insight: 0x8b5cf6,
              training: 0x06b6d4,
              update: 0x3b82f6,
              data: 0x10b981,
              escalation: 0xff0000
            };

            const material = new THREE.LineBasicMaterial({
              color: typeColors[comm.type] || 0x06b6d4,
              transparent: true,
              opacity: 0.8,
              linewidth: 2
            });

            const line = new THREE.Line(geometry, material);
            scene.add(line);
            activeCommunications.set(comm.id, line);
          }

          // Update progress
          const newProgress = comm.progress + 0.02;

          // Update line opacity based on progress
          const line = activeCommunications.get(comm.id);
          if (line) {
            (line.material as THREE.LineBasicMaterial).opacity = Math.max(0, 1 - newProgress);
          }

          // Check hover
          const fromAgent2D = agentDataRef.current.find(a => a.id === comm.from);
          const toAgent2D = agentDataRef.current.find(a => a.id === comm.to);

          if (fromAgent2D && toAgent2D && hoveredAgent) {
            if (hoveredAgent.id === comm.from || hoveredAgent.id === comm.to) {
              setHoveredComm(comm);
            }
          }

          return { ...comm, progress: newProgress };
        }).filter(Boolean) as Communication[];

        // Clean up completed communications
        prev.forEach(comm => {
          if (comm.progress >= 1 && activeCommunications.has(comm.id)) {
            const line = activeCommunications.get(comm.id);
            if (line) {
              scene.remove(line);
              line.geometry.dispose();
              (line.material as THREE.Material).dispose();
            }
            activeCommunications.delete(comm.id);
          }
        });

        return updated;
      });
    };

    const interval = setInterval(animateComm, 50);

    return () => {
      clearInterval(interval);
      activeCommunications.forEach(line => {
        scene.remove(line);
        line.geometry.dispose();
        (line.material as THREE.Material).dispose();
      });
    };
  }, [hoveredAgent]);

  const getAgentIcon = (type: string) => {
    switch (type) {
      case 'triage': return Target;
      case 'enrichment': return Brain;
      case 'investigation': return Activity;
      case 'response': return Zap;
      case 'orchestrator': return Cpu;
      case 'ml': return Shield;
      default: return Activity;
    }
  };

  const getCommTypeColor = (type: string) => {
    const colors: { [key: string]: string } = {
      alert: 'text-red-400 bg-red-400/10',
      task: 'text-yellow-400 bg-yellow-400/10',
      result: 'text-green-400 bg-green-400/10',
      command: 'text-red-400 bg-red-400/10',
      insight: 'text-purple-400 bg-purple-400/10',
      training: 'text-cyan-400 bg-cyan-400/10',
      update: 'text-blue-400 bg-blue-400/10',
      data: 'text-green-400 bg-green-400/10',
      escalation: 'text-red-500 bg-red-500/20'
    };
    return colors[type] || 'text-slate-400 bg-slate-400/10';
  };

  return (
    <div className="space-y-4">
      <div className="bg-gradient-to-r from-cyan-600 to-blue-600 rounded-xl p-6 shadow-lg">
        <div className="flex items-center space-x-3">
          <Activity className="w-8 h-8 text-white" />
          <div>
            <h1 className="text-2xl font-bold text-white">Agent Communication Network</h1>
            <p className="text-cyan-100 text-sm">
              Real-time 3D visualization of AI agent interactions and data flows
            </p>
          </div>
        </div>
      </div>

      <div className="relative bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div
          ref={containerRef}
          className="w-full h-[600px]"
          style={{ cursor: hoveredAgent ? 'pointer' : 'default' }}
        />

        {/* Fixed hover information panel */}
        {hoveredAgent ? (
          <div className="absolute top-4 left-4 z-10 bg-slate-900/95 backdrop-blur-sm border border-slate-700 rounded-lg p-4 shadow-xl w-80">
            <div className="flex items-start space-x-3">
              <div className="p-2 rounded-lg" style={{ backgroundColor: `${hoveredAgent.color}20` }}>
                {(() => {
                  const Icon = getAgentIcon(hoveredAgent.type);
                  return <Icon className="w-5 h-5" style={{ color: hoveredAgent.color }} />;
                })()}
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-white mb-1">{hoveredAgent.name}</h3>
                <p className="text-xs text-slate-400 mb-2 uppercase tracking-wide">{hoveredAgent.type}</p>
                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <span className="text-xs text-slate-500">Activity Level:</span>
                    <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full"
                        style={{ width: `${hoveredAgent.activity * 100}%` }}
                      />
                    </div>
                    <span className="text-xs text-white font-medium">
                      {(hoveredAgent.activity * 100).toFixed(0)}%
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Show active communications */}
            <div className="mt-3 pt-3 border-t border-slate-700">
              <div className="text-xs text-slate-500 mb-2">Active Communications:</div>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {communications
                  .filter(c => c.from === hoveredAgent.id || c.to === hoveredAgent.id)
                  .slice(0, 4)
                  .map(comm => (
                    <div key={comm.id} className="text-xs">
                      <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${getCommTypeColor(comm.type)}`}>
                        {comm.type}
                      </span>
                      <span className="text-slate-400 ml-2">{comm.message.substring(0, 35)}...</span>
                    </div>
                  ))}
                {communications.filter(c => c.from === hoveredAgent.id || c.to === hoveredAgent.id).length === 0 && (
                  <p className="text-xs text-slate-500 italic">No active communications</p>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="absolute top-4 left-4 z-10 bg-slate-900/95 backdrop-blur-sm border border-slate-700 rounded-lg p-4 shadow-xl w-80">
            <div className="flex items-center space-x-2">
              <Activity className="w-5 h-5 text-cyan-400" />
              <h3 className="font-semibold text-white">Agent Network</h3>
            </div>
            <p className="text-sm text-slate-400 mt-2">
              Hover over any agent node to view detailed information and active communications
            </p>
          </div>
        )}

        {/* Legend */}
        <div className="absolute bottom-4 left-4 bg-slate-900/90 backdrop-blur-sm border border-slate-700 rounded-lg p-4">
          <div className="text-xs font-semibold text-slate-400 mb-2">Communication Types</div>
          <div className="space-y-1">
            {[
              { type: 'alert', label: 'Alert' },
              { type: 'task', label: 'Task Assignment' },
              { type: 'result', label: 'Result' },
              { type: 'command', label: 'Command' },
              { type: 'insight', label: 'ML Insight' },
              { type: 'escalation', label: 'Escalation' }
            ].map(item => (
              <div key={item.type} className="flex items-center space-x-2">
                <div
                  className="w-8 h-0.5 rounded"
                  style={{
                    backgroundColor: item.type === 'alert' ? '#ff4444' :
                      item.type === 'task' ? '#fbbf24' :
                      item.type === 'result' ? '#10b981' :
                      item.type === 'command' ? '#ef4444' :
                      item.type === 'insight' ? '#8b5cf6' :
                      '#ff0000'
                  }}
                />
                <span className="text-xs text-slate-400">{item.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Agent count */}
        <div className="absolute top-4 right-4 bg-slate-900/90 backdrop-blur-sm border border-slate-700 rounded-lg px-3 py-2">
          <div className="flex items-center space-x-2">
            <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
            <span className="text-sm text-slate-300">{agentDataRef.current.length} Agents Active</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AgentNetworkGraph3D;
