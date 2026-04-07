import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

interface ComponentNode {
  name: string;
  subtitle: string;
  position: THREE.Vector3;
  color: number;
  sphere?: THREE.Mesh;
  glow?: THREE.Mesh;
  ring?: THREE.Mesh;
}

interface FlowParticle {
  position: THREE.Vector3;
  from: number;
  to: number;
  progress: number;
  speed: number;
  mesh?: THREE.Mesh;
  trail?: THREE.Line;
}

const Architecture3D = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const animationFrameRef = useRef<number>();
  const [labels, setLabels] = useState<Array<{ name: string; subtitle: string; x: number; y: number; color: string; visible: boolean }>>([]);

  useEffect(() => {
    if (!containerRef.current) return;

    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;

    // Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050A15);
    scene.fog = new THREE.FogExp2(0x050A15, 0.015);
    sceneRef.current = scene;

    // Camera setup
    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 1000);
    camera.position.set(20, 15, 35);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    // Renderer setup
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.2);
    scene.add(ambientLight);

    const pointLight1 = new THREE.PointLight(0x60A5FA, 2, 100);
    pointLight1.position.set(15, 15, 15);
    scene.add(pointLight1);

    const pointLight2 = new THREE.PointLight(0x10B981, 1.5, 100);
    pointLight2.position.set(-15, 10, -15);
    scene.add(pointLight2);

    const pointLight3 = new THREE.PointLight(0xF59E0B, 1, 80);
    pointLight3.position.set(0, -10, 10);
    scene.add(pointLight3);

    // Define component nodes arranged in a beautiful pattern
    const components: ComponentNode[] = [
      {
        name: 'SOC Dashboard',
        subtitle: 'Real-time Monitoring & Analytics',
        position: new THREE.Vector3(0, 10, 0),
        color: 0x3B82F6,
      },
      {
        name: 'AI/ML Engine',
        subtitle: 'AgentBricks, DBRX, MLflow',
        position: new THREE.Vector3(-8, 6, -6),
        color: 0xEC4899,
      },
      {
        name: 'Threat Intelligence',
        subtitle: 'Vector Search & IOCs',
        position: new THREE.Vector3(8, 6, -6),
        color: 0x8B5CF6,
      },
      {
        name: 'SOAR Automation',
        subtitle: 'Response & Orchestration',
        position: new THREE.Vector3(-10, 2, 4),
        color: 0x06B6D4,
      },
      {
        name: 'Event Processing',
        subtitle: 'CEP & Stream Analytics',
        position: new THREE.Vector3(10, 2, 4),
        color: 0x10B981,
      },
      {
        name: 'Data Lake',
        subtitle: 'Delta Lake & Unity Catalog',
        position: new THREE.Vector3(-6, -2, -2),
        color: 0xF59E0B,
      },
      {
        name: 'SQL Warehouse',
        subtitle: 'Serverless Analytics',
        position: new THREE.Vector3(6, -2, -2),
        color: 0x14B8A6,
      },
      {
        name: 'Infrastructure',
        subtitle: 'Databricks Lakehouse Platform',
        position: new THREE.Vector3(0, -6, 0),
        color: 0xEF4444,
      },
    ];

    // Create beautiful component spheres
    components.forEach((component, index) => {
      // Main glowing sphere
      const sphereGeometry = new THREE.SphereGeometry(1.5, 64, 64);
      const sphereMaterial = new THREE.MeshPhysicalMaterial({
        color: component.color,
        emissive: component.color,
        emissiveIntensity: 0.6,
        metalness: 0.3,
        roughness: 0.2,
        transparent: true,
        opacity: 0.9,
        clearcoat: 1.0,
        clearcoatRoughness: 0.1,
      });
      const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
      sphere.position.copy(component.position);
      scene.add(sphere);
      component.sphere = sphere;

      // Outer glow halo
      const glowGeometry = new THREE.SphereGeometry(2.5, 32, 32);
      const glowMaterial = new THREE.MeshBasicMaterial({
        color: component.color,
        transparent: true,
        opacity: 0.15,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
      });
      const glow = new THREE.Mesh(glowGeometry, glowMaterial);
      glow.position.copy(component.position);
      scene.add(glow);
      component.glow = glow;

      // Rotating ring
      const ringGeometry = new THREE.TorusGeometry(2.2, 0.05, 16, 100);
      const ringMaterial = new THREE.MeshBasicMaterial({
        color: component.color,
        transparent: true,
        opacity: 0.6,
        blending: THREE.AdditiveBlending,
      });
      const ring = new THREE.Mesh(ringGeometry, ringMaterial);
      ring.position.copy(component.position);
      ring.rotation.x = Math.PI / 2 + (index * 0.3);
      scene.add(ring);
      component.ring = ring;

      // Inner core particles
      const coreParticlesGeometry = new THREE.BufferGeometry();
      const coreCount = 30;
      const corePositions = new Float32Array(coreCount * 3);

      for (let i = 0; i < coreCount; i++) {
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.random() * Math.PI;
        const r = 0.8 + Math.random() * 0.5;

        corePositions[i * 3] = component.position.x + r * Math.sin(phi) * Math.cos(theta);
        corePositions[i * 3 + 1] = component.position.y + r * Math.sin(phi) * Math.sin(theta);
        corePositions[i * 3 + 2] = component.position.z + r * Math.cos(phi);
      }

      coreParticlesGeometry.setAttribute('position', new THREE.BufferAttribute(corePositions, 3));
      const coreParticlesMaterial = new THREE.PointsMaterial({
        size: 0.08,
        color: component.color,
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending,
      });
      const coreParticles = new THREE.Points(coreParticlesGeometry, coreParticlesMaterial);
      scene.add(coreParticles);
    });

    // Create elegant connection lines
    const connections = [
      [0, 1], [0, 2], [0, 3], [0, 4],
      [1, 3], [1, 5], [2, 4], [2, 6],
      [3, 5], [4, 6], [5, 7], [6, 7],
      [1, 2], [3, 4], [5, 6]
    ];

    const connectionLines: THREE.Line[] = [];
    connections.forEach(([from, to]) => {
      const curve = new THREE.CatmullRomCurve3([
        components[from].position,
        new THREE.Vector3().lerpVectors(
          components[from].position,
          components[to].position,
          0.5
        ).add(new THREE.Vector3(0, 2, 0)),
        components[to].position,
      ]);

      const points = curve.getPoints(50);
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const material = new THREE.LineBasicMaterial({
        color: 0x60A5FA,
        transparent: true,
        opacity: 0.2,
        linewidth: 2,
        blending: THREE.AdditiveBlending,
      });
      const line = new THREE.Line(geometry, material);
      scene.add(line);
      connectionLines.push(line);
    });

    // Create flowing data particles
    const flowParticles: FlowParticle[] = [];
    const particleCount = 150;

    for (let i = 0; i < particleCount; i++) {
      const connectionIndex = Math.floor(Math.random() * connections.length);
      const [from, to] = connections[connectionIndex];

      const particleGeometry = new THREE.SphereGeometry(0.12, 16, 16);
      const particleColor = new THREE.Color().setHSL(0.5 + Math.random() * 0.3, 1, 0.6);
      const particleMaterial = new THREE.MeshBasicMaterial({
        color: particleColor,
        transparent: true,
        opacity: 1,
        blending: THREE.AdditiveBlending,
      });
      const particleMesh = new THREE.Mesh(particleGeometry, particleMaterial);
      scene.add(particleMesh);

      // Create trail effect
      const trailGeometry = new THREE.BufferGeometry();
      const trailPositions = new Float32Array(15);
      trailGeometry.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));
      const trailMaterial = new THREE.LineBasicMaterial({
        color: particleColor,
        transparent: true,
        opacity: 0.5,
        blending: THREE.AdditiveBlending,
      });
      const trail = new THREE.Line(trailGeometry, trailMaterial);
      scene.add(trail);

      const particle: FlowParticle = {
        position: new THREE.Vector3(),
        from,
        to,
        progress: Math.random(),
        speed: 0.002 + Math.random() * 0.004,
        mesh: particleMesh,
        trail,
      };
      flowParticles.push(particle);
    }

    // Add starfield background
    const starsGeometry = new THREE.BufferGeometry();
    const starsCount = 1000;
    const starsPositions = new Float32Array(starsCount * 3);

    for (let i = 0; i < starsCount * 3; i++) {
      starsPositions[i] = (Math.random() - 0.5) * 200;
    }

    starsGeometry.setAttribute('position', new THREE.BufferAttribute(starsPositions, 3));
    const starsMaterial = new THREE.PointsMaterial({
      size: 0.15,
      color: 0x60A5FA,
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending,
    });

    const stars = new THREE.Points(starsGeometry, starsMaterial);
    scene.add(stars);

    // Animation
    let time = 0;
    const animate = () => {
      time += 0.01;

      // Animate component spheres
      components.forEach((component, index) => {
        if (component.sphere) {
          component.sphere.rotation.y += 0.003;
          component.sphere.rotation.x += 0.002;
          const bobOffset = Math.sin(time * 1.5 + index * 0.8) * 0.2;
          component.sphere.position.y = component.position.y + bobOffset;
        }

        if (component.glow) {
          component.glow.position.copy(component.sphere!.position);
          const pulseScale = 1 + Math.sin(time * 2 + index * 0.7) * 0.15;
          component.glow.scale.set(pulseScale, pulseScale, pulseScale);
          (component.glow.material as THREE.MeshBasicMaterial).opacity = 0.12 + Math.sin(time * 3 + index) * 0.08;
        }

        if (component.ring) {
          component.ring.position.copy(component.sphere!.position);
          component.ring.rotation.z += 0.01;
          (component.ring.material as THREE.MeshBasicMaterial).opacity = 0.4 + Math.sin(time * 2 + index) * 0.2;
        }
      });

      // Animate flowing particles with smooth curves
      flowParticles.forEach((particle, idx) => {
        particle.progress += particle.speed;

        if (particle.progress >= 1) {
          particle.progress = 0;
          const connectionIndex = Math.floor(Math.random() * connections.length);
          [particle.from, particle.to] = connections[connectionIndex];
        }

        const fromPos = components[particle.from].sphere!.position;
        const toPos = components[particle.to].sphere!.position;

        // Use curved path
        const midPoint = new THREE.Vector3().lerpVectors(fromPos, toPos, 0.5);
        midPoint.y += 2;

        const t = particle.progress;
        const t2 = t * t;
        const t3 = t2 * t;

        // Quadratic bezier curve
        particle.position.x = (1 - t) * (1 - t) * fromPos.x + 2 * (1 - t) * t * midPoint.x + t2 * toPos.x;
        particle.position.y = (1 - t) * (1 - t) * fromPos.y + 2 * (1 - t) * t * midPoint.y + t2 * toPos.y;
        particle.position.z = (1 - t) * (1 - t) * fromPos.z + 2 * (1 - t) * t * midPoint.z + t2 * toPos.z;

        if (particle.mesh) {
          particle.mesh.position.copy(particle.position);

          // Enhanced fade effect
          const fadeIn = Math.min(particle.progress * 8, 1);
          const fadeOut = Math.min((1 - particle.progress) * 8, 1);
          const opacity = Math.min(fadeIn, fadeOut);
          (particle.mesh.material as THREE.MeshBasicMaterial).opacity = opacity;

          // Pulsing scale
          const scale = 1 + Math.sin(particle.progress * Math.PI * 2 + time * 5) * 0.4;
          particle.mesh.scale.set(scale, scale, scale);
        }
      });

      // Rotate stars slowly
      stars.rotation.y += 0.00015;
      stars.rotation.x += 0.00005;

      // Pulse connection lines
      connectionLines.forEach((line, index) => {
        const material = line.material as THREE.LineBasicMaterial;
        material.opacity = 0.15 + Math.sin(time * 2 + index * 0.5) * 0.1;
      });

      // Smooth camera orbit
      const radius = 35;
      const cameraSpeed = 0.08;
      camera.position.x = Math.sin(time * cameraSpeed) * radius;
      camera.position.z = Math.cos(time * cameraSpeed) * radius;
      camera.position.y = 15 + Math.sin(time * 0.05) * 3;
      camera.lookAt(0, 1, 0);

      // Update labels with visibility
      const newLabels = components.map((component) => {
        const vector = component.sphere!.position.clone();
        const distance = vector.distanceTo(camera.position);
        vector.project(camera);

        const x = (vector.x * 0.5 + 0.5) * width;
        const y = (-(vector.y) * 0.5 + 0.5) * height;

        // Check if behind camera
        const visible = vector.z < 1 && distance < 50;

        return {
          name: component.name,
          subtitle: component.subtitle,
          x,
          y,
          color: `#${component.color.toString(16).padStart(6, '0')}`,
          visible,
        };
      });
      setLabels(newLabels);

      renderer.render(scene, camera);
      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animate();

    // Handle resize
    const handleResize = () => {
      if (!containerRef.current) return;
      const newWidth = containerRef.current.clientWidth;
      const newHeight = containerRef.current.clientHeight;

      camera.aspect = newWidth / newHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(newWidth, newHeight);
    };

    window.addEventListener('resize', handleResize);

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (containerRef.current && renderer.domElement) {
        containerRef.current.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, []);

  return (
    <div className="w-full h-full relative bg-gradient-to-b from-[#050A15] via-[#0A1628] to-[#050A15]">
      <div ref={containerRef} className="w-full h-full" />

      {/* Floating 3D Labels */}
      {labels.map((label, index) => (
        label.visible && (
          <div
            key={index}
            className="absolute pointer-events-none transition-all duration-200"
            style={{
              left: `${label.x}px`,
              top: `${label.y}px`,
              transform: 'translate(-50%, -50%)',
              opacity: label.visible ? 1 : 0,
            }}
          >
            <div
              className="relative bg-gradient-to-br from-slate-900/95 to-slate-950/95 backdrop-blur-xl border-2 rounded-2xl px-5 py-3 shadow-2xl min-w-[300px]"
              style={{
                borderColor: label.color,
                boxShadow: `0 0 30px ${label.color}40, 0 0 60px ${label.color}20`,
              }}
            >
              <div className="flex items-center gap-3 mb-1.5">
                <div
                  className="w-3 h-3 rounded-full animate-pulse shadow-lg"
                  style={{
                    backgroundColor: label.color,
                    boxShadow: `0 0 10px ${label.color}, 0 0 20px ${label.color}80`,
                  }}
                ></div>
                <p className="text-white font-bold text-base tracking-wide" style={{ color: label.color }}>
                  {label.name}
                </p>
              </div>
              <p className="text-slate-400 text-sm ml-6 font-medium">{label.subtitle}</p>
            </div>
          </div>
        )
      ))}

      {/* Enhanced Legend */}
      <div className="absolute top-6 left-6 bg-gradient-to-br from-slate-900/95 to-slate-950/90 backdrop-blur-xl border border-blue-500/30 rounded-2xl p-6 max-w-sm shadow-2xl">
        <h3 className="text-white font-bold text-lg mb-5 flex items-center gap-3">
          <div className="w-2.5 h-2.5 rounded-full bg-gradient-to-r from-orange-500 to-red-500 animate-pulse shadow-lg shadow-orange-500/50"></div>
          Live Architecture
        </h3>
        <div className="space-y-3 text-sm">
          <div className="flex items-center gap-3 text-slate-300">
            <div className="w-4 h-4 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 shadow-lg shadow-blue-500/50"></div>
            <span>Component Nodes</span>
          </div>
          <div className="flex items-center gap-3 text-slate-300">
            <div className="w-12 h-0.5 bg-gradient-to-r from-blue-400/50 to-cyan-400/50 rounded-full"></div>
            <span>Data Pathways</span>
          </div>
          <div className="flex items-center gap-3 text-slate-300">
            <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse shadow-lg shadow-cyan-400/50"></div>
            <span>150+ Live Data Flows</span>
          </div>
        </div>
      </div>

      {/* Stats Panel */}
      <div className="absolute bottom-6 right-6 bg-gradient-to-br from-slate-900/95 to-slate-950/90 backdrop-blur-xl border border-emerald-500/30 rounded-2xl px-6 py-4 shadow-2xl">
        <div className="flex items-center gap-6 text-sm">
          <div className="flex items-center gap-2.5">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shadow-lg shadow-emerald-400/50"></div>
            <span className="text-slate-300 font-medium">8 Components</span>
          </div>
          <div className="h-5 w-px bg-slate-700"></div>
          <div className="flex items-center gap-2.5">
            <div className="w-2.5 h-2.5 rounded-full bg-blue-400 animate-pulse shadow-lg shadow-blue-400/50"></div>
            <span className="text-slate-300 font-medium">15 Connections</span>
          </div>
        </div>
      </div>

      {/* Title */}
      <div className="absolute top-6 right-6 bg-gradient-to-br from-slate-900/95 to-slate-950/90 backdrop-blur-xl border border-orange-500/40 rounded-2xl px-6 py-4 shadow-2xl">
        <p className="text-orange-400 text-sm font-bold tracking-wide">Databricks Lakehouse Platform</p>
        <p className="text-slate-400 text-xs mt-1.5 font-medium">Interactive 3D Architecture Visualization</p>
      </div>
    </div>
  );
};

export default Architecture3D;
