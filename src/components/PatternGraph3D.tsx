import { useEffect, useRef } from 'react';
import * as THREE from 'three';

interface PatternNode {
  id: string;
  type: string;
  position: [number, number, number];
  size: number;
  color: string;
  connections: string[];
}

interface Pattern3DGraphProps {
  patterns: any[];
  selectedPattern?: string;
  onPatternClick?: (patternId: string) => void;
}

const PatternGraph3D = ({ patterns, selectedPattern, onPatternClick }: Pattern3DGraphProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const nodesRef = useRef<Map<string, THREE.Mesh>>(new Map());
  const mouseRef = useRef({ x: 0, y: 0, isDragging: false, lastX: 0, lastY: 0 });
  const cameraRotationRef = useRef({ theta: 0, phi: Math.PI / 6 });
  const floatingEventsRef = useRef<THREE.Mesh[]>([]);

  useEffect(() => {
    if (!containerRef.current) return;

    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0e1a);
    scene.fog = new THREE.Fog(0x0a0e1a, 50, 200);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    camera.position.set(0, 30, 60);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambientLight);

    const directionalLight1 = new THREE.DirectionalLight(0x60a5fa, 1);
    directionalLight1.position.set(50, 50, 50);
    scene.add(directionalLight1);

    const directionalLight2 = new THREE.DirectionalLight(0xf472b6, 0.6);
    directionalLight2.position.set(-50, -20, -50);
    scene.add(directionalLight2);

    const pointLight = new THREE.PointLight(0x8b5cf6, 2, 100);
    pointLight.position.set(0, 20, 0);
    scene.add(pointLight);



    renderPatterns(patterns);

    let time = 0;
    const animate = () => {
      requestAnimationFrame(animate);
      time += 0.005;

      if (!mouseRef.current.isDragging) {
        cameraRotationRef.current.theta += 0.0005;
      }

      const radius = 60;
      camera.position.x = radius * Math.sin(cameraRotationRef.current.theta) * Math.cos(cameraRotationRef.current.phi);
      camera.position.y = radius * Math.sin(cameraRotationRef.current.phi);
      camera.position.z = radius * Math.cos(cameraRotationRef.current.theta) * Math.cos(cameraRotationRef.current.phi);
      camera.lookAt(0, 0, 0);

      pointLight.position.x = Math.sin(time) * 30;
      pointLight.position.z = Math.cos(time) * 30;

      nodesRef.current.forEach((node, id) => {
        if (id === selectedPattern) {
          node.scale.setScalar(1.5 + Math.sin(time * 3) * 0.2);
        } else {
          node.scale.setScalar(1);
        }

        node.rotation.y += 0.002;
        node.position.y += Math.sin(time * 0.5 + node.position.x) * 0.01;
      });

      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      if (!containerRef.current) return;
      const newWidth = containerRef.current.clientWidth;
      const newHeight = containerRef.current.clientHeight;
      camera.aspect = newWidth / newHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(newWidth, newHeight);
    };

    const handleMouseDown = (e: MouseEvent) => {
      mouseRef.current.isDragging = true;
      mouseRef.current.lastX = e.clientX;
      mouseRef.current.lastY = e.clientY;
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!mouseRef.current.isDragging) return;

      const deltaX = e.clientX - mouseRef.current.lastX;
      const deltaY = e.clientY - mouseRef.current.lastY;

      cameraRotationRef.current.theta -= deltaX * 0.005;
      cameraRotationRef.current.phi += deltaY * 0.005;

      cameraRotationRef.current.phi = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, cameraRotationRef.current.phi));

      mouseRef.current.lastX = e.clientX;
      mouseRef.current.lastY = e.clientY;
    };

    const handleMouseUp = () => {
      mouseRef.current.isDragging = false;
    };

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const zoomSpeed = 0.1;
      const currentRadius = Math.sqrt(
        camera.position.x ** 2 + camera.position.y ** 2 + camera.position.z ** 2
      );
      const newRadius = Math.max(20, Math.min(100, currentRadius + e.deltaY * zoomSpeed));
      const scale = newRadius / currentRadius;
      camera.position.multiplyScalar(scale);
    };

    renderer.domElement.addEventListener('mousedown', handleMouseDown);
    renderer.domElement.addEventListener('mousemove', handleMouseMove);
    renderer.domElement.addEventListener('mouseup', handleMouseUp);
    renderer.domElement.addEventListener('mouseleave', handleMouseUp);
    renderer.domElement.addEventListener('wheel', handleWheel);
    window.addEventListener('resize', handleResize);

    return () => {
      renderer.domElement.removeEventListener('mousedown', handleMouseDown);
      renderer.domElement.removeEventListener('mousemove', handleMouseMove);
      renderer.domElement.removeEventListener('mouseup', handleMouseUp);
      renderer.domElement.removeEventListener('mouseleave', handleMouseUp);
      renderer.domElement.removeEventListener('wheel', handleWheel);
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
      if (containerRef.current?.contains(renderer.domElement)) {
        containerRef.current.removeChild(renderer.domElement);
      }
    };
  }, []);

  useEffect(() => {
    if (sceneRef.current) {
      renderPatterns(patterns);
    }
  }, [patterns]);

  const renderPatterns = (patterns: any[]) => {
    if (!sceneRef.current) return;

    nodesRef.current.forEach(node => {
      sceneRef.current?.remove(node);
    });
    nodesRef.current.clear();

    const radius = 35;
    const levels = 5;

    patterns.forEach((pattern, index) => {
      const level = index % levels;
      const angleStep = (Math.PI * 2) / Math.max(1, Math.floor(patterns.length / levels));
      const angle = angleStep * Math.floor(index / levels);

      const x = Math.cos(angle) * (radius - level * 5);
      const y = level * 8 - 15;
      const z = Math.sin(angle) * (radius - level * 5);

      const threatColor = getThreatColor(pattern.threat_level);
      const nodeSize = pattern.is_anomaly ? 2 : 1.5;

      const geometry = pattern.pattern_type === 'zero_day_indicator'
        ? new THREE.OctahedronGeometry(nodeSize, 0)
        : new THREE.SphereGeometry(nodeSize, 32, 32);

      const material = new THREE.MeshPhongMaterial({
        color: new THREE.Color(threatColor),
        emissive: new THREE.Color(threatColor),
        emissiveIntensity: 0.5,
        shininess: 100,
        transparent: true,
        opacity: 0.9,
      });

      const node = new THREE.Mesh(geometry, material);
      node.position.set(x, y, z);
      node.userData = { id: pattern.id, pattern };



      sceneRef.current?.add(node);
      nodesRef.current.set(pattern.id, node);

      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      canvas.width = 512;
      canvas.height = 128;

      if (context) {
        context.fillStyle = 'rgba(15, 23, 42, 0.85)';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.strokeStyle = threatColor;
        context.lineWidth = 2;
        context.strokeRect(2, 2, canvas.width - 4, canvas.height - 4);

        context.font = 'Bold 32px system-ui';
        context.fillStyle = 'white';
        context.textAlign = 'center';
        const patternName = pattern.pattern_name.length > 25
          ? pattern.pattern_name.substring(0, 25) + '...'
          : pattern.pattern_name;
        context.fillText(patternName, canvas.width / 2, 50);

        context.font = '24px system-ui';
        context.fillStyle = '#94a3b8';
        context.fillText(`Count: ${pattern.occurrence_count} | Confidence: ${pattern.confidence_score}%`, canvas.width / 2, 90);
      }

      const texture = new THREE.CanvasTexture(canvas);
      const spriteMaterial = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthTest: false
      });
      const sprite = new THREE.Sprite(spriteMaterial);
      sprite.position.set(x, y + nodeSize + 4, z);
      sprite.scale.set(16, 4, 1);
      sceneRef.current?.add(sprite);

      if (index > 0 && Math.random() > 0.4) {
        const prevPattern = patterns[Math.floor(Math.random() * index)];
        const prevNode = nodesRef.current.get(prevPattern.id);

        if (prevNode) {
          const points = [
            node.position,
            prevNode.position,
          ];

          const lineGeometry = new THREE.BufferGeometry().setFromPoints(points);
          const lineMaterial = new THREE.LineBasicMaterial({
            color: new THREE.Color(threatColor),
            transparent: true,
            opacity: 0.3,
            linewidth: 2,
          });

          const line = new THREE.Line(lineGeometry, lineMaterial);
          sceneRef.current?.add(line);
        }
      }

    });
  };

  const getThreatColor = (level: string): string => {
    switch (level) {
      case 'critical':
        return '#ef4444';
      case 'high':
        return '#f97316';
      case 'medium':
        return '#eab308';
      case 'low':
        return '#22c55e';
      default:
        return '#60a5fa';
    }
  };

  return <div ref={containerRef} className="w-full h-full" />;
};

export default PatternGraph3D;
