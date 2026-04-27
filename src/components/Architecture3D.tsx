import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  Database, Layers, Brain, Workflow, ShieldCheck, Sparkles, Cloud,
  Zap, X, ChevronRight, Activity, FileCode, Network, Cpu
} from 'lucide-react';

type LayerKey = 'sources' | 'bronze' | 'silver' | 'gold' | 'ai' | 'serving' | 'governance';

type Node = {
  id: string;
  layer: LayerKey;
  name: string;
  product: string;
  blurb: string;
  details: string[];
  metrics: { label: string; value: string }[];
  docs: string;
  col: number;
};

type LayerDef = {
  key: LayerKey;
  title: string;
  tagline: string;
  color: number;
  hex: string;
  y: number;
  icon: any;
};

const LAYERS: LayerDef[] = [
  { key: 'sources',    title: 'Data Sources',          tagline: 'Logs, telemetry, intel feeds, sensors',                   color: 0x64748B, hex: '#64748B', y:  9, icon: Cloud      },
  { key: 'bronze',     title: 'Bronze · Raw Ingest',   tagline: 'Auto Loader, Delta Live Tables, Lakeflow Connect',         color: 0xCD7F32, hex: '#CD7F32', y:  6, icon: Database   },
  { key: 'silver',     title: 'Silver · Curated',      tagline: 'DLT pipelines, Photon, Structured Streaming',              color: 0xC0C0C0, hex: '#C0C0C0', y:  3, icon: Layers     },
  { key: 'gold',       title: 'Gold · Analytical',     tagline: 'SQL Warehouse, Materialized Views, OCSF marts',            color: 0xF59E0B, hex: '#F59E0B', y:  0, icon: Sparkles   },
  { key: 'ai',         title: 'AI · Mosaic AI',        tagline: 'Agent Bricks, Vector Search, Model Serving, MLflow 3.0',   color: 0x06B6D4, hex: '#06B6D4', y: -3, icon: Brain      },
  { key: 'serving',    title: 'Serving · Apps',        tagline: 'Lakebase, Databricks Apps, Genie, AI/BI Dashboards',       color: 0x10B981, hex: '#10B981', y: -6, icon: Workflow   },
  { key: 'governance', title: 'Governance · Unity',    tagline: 'Unity Catalog, Lineage, Clean Rooms, Audit Logs',          color: 0x3B82F6, hex: '#3B82F6', y: -9, icon: ShieldCheck },
];

const LAYER_BY_KEY = Object.fromEntries(LAYERS.map(l => [l.key, l])) as Record<LayerKey, LayerDef>;

const NODES: Node[] = [
  // Sources
  { id: 'src-edr',   layer: 'sources', name: 'EDR Telemetry',     product: 'CrowdStrike / SentinelOne', blurb: 'Endpoint detection events streamed via Kafka',
    details: ['Process, file, network, registry events', 'Kafka topics partitioned by tenant', 'Schema evolution handled by Auto Loader'],
    metrics: [{label:'EPS', value:'48k'}, {label:'Sources', value:'12'}], docs: 'docs/sources/edr', col: 0 },
  { id: 'src-net',   layer: 'sources', name: 'Network Logs',      product: 'NetFlow / Zeek / DPI',      blurb: 'East-west and perimeter flow records',
    details: ['Zeek conn/dns/http/ssl/files', 'Flow telemetry from core switches', 'DPI metadata for L7 enrichment'],
    metrics: [{label:'Flows/s', value:'120k'}, {label:'Sensors', value:'34'}], docs: 'docs/sources/network', col: 1 },
  { id: 'src-cloud', layer: 'sources', name: 'Cloud Audit',       product: 'CloudTrail / Azure Activity', blurb: 'Multi-cloud control-plane events',
    details: ['AWS CloudTrail (org trails)', 'Azure Activity + Entra sign-ins', 'GCP Audit Logs sink'],
    metrics: [{label:'Accounts', value:'418'}, {label:'Lag', value:'<60s'}], docs: 'docs/sources/cloud', col: 2 },
  { id: 'src-intel', layer: 'sources', name: 'Threat Intel',      product: 'STIX/TAXII · MISP · OSINT', blurb: 'IOC, TTP and adversary feeds',
    details: ['STIX 2.1 over TAXII 2.1', 'Commercial + open-source IOC streams', 'Vector-embedded for semantic match'],
    metrics: [{label:'Feeds', value:'27'}, {label:'IOCs', value:'4.2M'}], docs: 'docs/sources/intel', col: 3 },

  // Bronze
  { id: 'br-autoloader', layer: 'bronze', name: 'Auto Loader',     product: 'cloudFiles + schemaHints',  blurb: 'Incremental file ingest with schema inference',
    details: ['Schema inference + evolution', 'Exactly-once via RocksDB checkpoints', 'Notification mode on cloud queues'],
    metrics: [{label:'Files/min', value:'18k'}, {label:'Mode', value:'Notification'}], docs: 'docs/bronze/auto-loader', col: 0 },
  { id: 'br-dlt',        layer: 'bronze', name: 'DLT Bronze',      product: 'Delta Live Tables',          blurb: 'Declarative bronze pipelines with expectations',
    details: ['CHECK expectations enforced', 'Streaming and batch in one pipeline', 'Automatic recovery + retries'],
    metrics: [{label:'Pipelines', value:'14'}, {label:'Quality', value:'99.7%'}], docs: 'docs/bronze/dlt', col: 1 },
  { id: 'br-lakeflow',   layer: 'bronze', name: 'Lakeflow Connect', product: 'Managed Connectors',        blurb: 'Native connectors for SaaS + DBs',
    details: ['Salesforce, Workday, ServiceNow', 'Postgres / SQL Server CDC', 'Schedule + monitor in Workspace'],
    metrics: [{label:'Connectors', value:'9'}, {label:'CDC lag', value:'45s'}], docs: 'docs/bronze/lakeflow', col: 2 },
  { id: 'br-zerobus',    layer: 'bronze', name: 'Zerobus Stream',   product: 'Direct Kafka → Delta',      blurb: 'Sub-second hot path for telemetry',
    details: ['Kafka → Delta with no intermediate hop', 'Photon-accelerated writes', 'Backed by Delta Universal Format'],
    metrics: [{label:'p99 lag', value:'380ms'}, {label:'Topics', value:'42'}], docs: 'docs/bronze/zerobus', col: 3 },

  // Silver
  { id: 'sl-dlt',     layer: 'silver', name: 'DLT Silver',         product: 'CDF + SCD2 + Photon',       blurb: 'Cleaned, conformed, history-preserving',
    details: ['Change Data Feed for downstream', 'SCD2 dimensions for entities', 'Photon vectorized execution'],
    metrics: [{label:'Tables', value:'118'}, {label:'Speedup', value:'12x'}], docs: 'docs/silver/dlt', col: 0 },
  { id: 'sl-stream',  layer: 'silver', name: 'Structured Stream',  product: 'Spark Structured Streaming', blurb: 'Real-time joins + enrichment',
    details: ['Stateful stream-stream joins', 'Watermarking + late data handling', 'Foreach sinks to Lakebase'],
    metrics: [{label:'Streams', value:'31'}, {label:'p99', value:'1.4s'}], docs: 'docs/silver/streaming', col: 1 },
  { id: 'sl-ocsf',    layer: 'silver', name: 'OCSF Normalizer',    product: 'Open Cybersecurity Schema',  blurb: 'Vendor-neutral schema mapping',
    details: ['OCSF v1.3 class mapping', 'Pluggable parsers per source', 'Validated by JSON Schema'],
    metrics: [{label:'Classes', value:'47'}, {label:'Coverage', value:'92%'}], docs: 'docs/silver/ocsf', col: 2 },
  { id: 'sl-cdc',     layer: 'silver', name: 'CDC + Merge',        product: 'Delta MERGE INTO',           blurb: 'Idempotent upserts with deduplication',
    details: ['MERGE INTO with deletion vectors', 'Z-ORDER on common predicates', 'Liquid Clustering on large tables'],
    metrics: [{label:'Upserts/s', value:'14k'}, {label:'Tables', value:'62'}], docs: 'docs/silver/cdc', col: 3 },

  // Gold
  { id: 'gd-warehouse', layer: 'gold', name: 'SQL Warehouse',      product: 'Serverless SQL',             blurb: 'Sub-second BI queries',
    details: ['Serverless start in ~5s', 'Photon-only execution', 'Predictive Optimization on tables'],
    metrics: [{label:'p50 query', value:'420ms'}, {label:'Concurrency', value:'200'}], docs: 'docs/gold/warehouse', col: 0 },
  { id: 'gd-mv',        layer: 'gold', name: 'Materialized Views', product: 'DLT MVs',                    blurb: 'Incrementally maintained marts',
    details: ['Incremental MV refresh on writes', 'Cost-aware planner', 'Backed by Delta'],
    metrics: [{label:'MVs', value:'46'}, {label:'Refresh', value:'~12s'}], docs: 'docs/gold/mv', col: 1 },
  { id: 'gd-ocsf-mart', layer: 'gold', name: 'OCSF Marts',         product: 'Detection-as-Data',          blurb: 'Pre-aggregated detection surfaces',
    details: ['Per-tenant marts', 'Materialized for sub-100ms hits', 'Driven by versioned rules'],
    metrics: [{label:'Marts', value:'18'}, {label:'Hit rate', value:'94%'}], docs: 'docs/gold/marts', col: 2 },
  { id: 'gd-feature',   layer: 'gold', name: 'Feature Store',      product: 'Unity Catalog Features',     blurb: 'Online + offline ML features',
    details: ['Online store on Lakebase', 'Time-travel for backfills', 'Lineage tracked in UC'],
    metrics: [{label:'Features', value:'1.2k'}, {label:'Online ms', value:'8'}], docs: 'docs/gold/features', col: 3 },

  // AI
  { id: 'ai-agents', layer: 'ai', name: 'Agent Bricks',          product: 'Mosaic AI Agent Framework',   blurb: 'Production agents with tool calling',
    details: ['ReAct + tool calling on DBRX', 'Evaluated with Agent Evaluation', 'Deployed via Model Serving'],
    metrics: [{label:'Agents', value:'35'}, {label:'p95 latency', value:'2.1s'}], docs: 'docs/ai/agent-bricks', col: 0 },
  { id: 'ai-vector', layer: 'ai', name: 'Vector Search',         product: 'Mosaic AI Vector Search',     blurb: 'Hybrid lexical + semantic search',
    details: ['Real-time index sync on Delta', 'BGE / E5 / OpenAI embeddings', 'Hybrid BM25 + ANN retrieval'],
    metrics: [{label:'Indexes', value:'9'}, {label:'Recall@10', value:'0.91'}], docs: 'docs/ai/vector-search', col: 1 },
  { id: 'ai-mlflow', layer: 'ai', name: 'MLflow 3.0',            product: 'Tracking + Models + Eval',    blurb: 'GenAI observability and lineage',
    details: ['Trace every LLM call', 'GenAI evaluation suites', 'Model registry tied to UC'],
    metrics: [{label:'Experiments', value:'214'}, {label:'Traces/day', value:'1.4M'}], docs: 'docs/ai/mlflow', col: 2 },
  { id: 'ai-serving', layer: 'ai', name: 'Model Serving',         product: 'GPU + Provisioned Throughput', blurb: 'Real-time inference endpoints',
    details: ['Foundation Model APIs (DBRX, Llama, Claude)', 'Provisioned throughput for SLA', 'Auto-scale + rate limits'],
    metrics: [{label:'Endpoints', value:'18'}, {label:'p99', value:'640ms'}], docs: 'docs/ai/serving', col: 3 },

  // Serving
  { id: 'sv-apps',   layer: 'serving', name: 'Databricks Apps',   product: 'Managed App Hosting',        blurb: 'Host SOC frontend + edge functions',
    details: ['Run any Python/Node app', 'OBO auth tied to UC', 'Secrets via Databricks Secrets'],
    metrics: [{label:'Apps', value:'7'}, {label:'Cold start', value:'< 3s'}], docs: 'docs/serving/apps', col: 0 },
  { id: 'sv-genie',  layer: 'serving', name: 'AI/BI Genie',       product: 'Natural Language to SQL',    blurb: 'Conversational analytics for analysts',
    details: ['Self-serve NL → SQL', 'Grounded in UC metadata', 'Auto-generated visualizations'],
    metrics: [{label:'Spaces', value:'12'}, {label:'Success', value:'88%'}], docs: 'docs/serving/genie', col: 1 },
  { id: 'sv-lakebase', layer: 'serving', name: 'Lakebase',        product: 'Managed Postgres + Delta',   blurb: 'Operational store synced to Delta',
    details: ['Postgres-compatible OLTP', 'Reverse-ETL to Delta in seconds', 'Powers low-latency app reads'],
    metrics: [{label:'Tables', value:'84'}, {label:'OLTP qps', value:'24k'}], docs: 'docs/serving/lakebase', col: 2 },
  { id: 'sv-dash',   layer: 'serving', name: 'AI/BI Dashboards',  product: 'Lakeview Dashboards',        blurb: 'CISO + analyst dashboards',
    details: ['Native to UC permissions', 'Embedded in Apps with deep links', 'Versioned via Asset Bundles'],
    metrics: [{label:'Dashboards', value:'34'}, {label:'Views/day', value:'9.2k'}], docs: 'docs/serving/dashboards', col: 3 },

  // Governance
  { id: 'gv-uc',       layer: 'governance', name: 'Unity Catalog',   product: 'Single Catalog of Assets',  blurb: 'Tables, models, files, functions',
    details: ['3-level namespace catalog.schema.object', 'Fine-grained ABAC + row/column masks', 'Tags + attributes for policy'],
    metrics: [{label:'Objects', value:'18.4k'}, {label:'Catalogs', value:'8'}], docs: 'docs/gov/unity-catalog', col: 0 },
  { id: 'gv-lineage',  layer: 'governance', name: 'Lineage',         product: 'Column-Level Lineage',     blurb: 'End-to-end data + AI lineage',
    details: ['Auto-captured for SQL/Python', 'Includes notebooks, jobs, pipelines', 'Surface impact of any change'],
    metrics: [{label:'Edges', value:'9.2M'}, {label:'Coverage', value:'97%'}], docs: 'docs/gov/lineage', col: 1 },
  { id: 'gv-cleanroom', layer: 'governance', name: 'Clean Rooms',    product: 'Privacy-Safe Sharing',     blurb: 'Multi-party threat collab',
    details: ['Run jointly without sharing raw data', 'Approved compute templates', 'Backed by Delta Sharing'],
    metrics: [{label:'Partners', value:'14'}, {label:'Rooms', value:'5'}], docs: 'docs/gov/cleanrooms', col: 2 },
  { id: 'gv-audit',    layer: 'governance', name: 'Audit Logs',      product: 'System Tables · access',   blurb: 'Compliance-grade audit trail',
    details: ['Every UC action logged', 'Queryable as Delta tables', 'Powers SOC2 / ISO / FedRAMP evidence'],
    metrics: [{label:'Events/day', value:'12M'}, {label:'Retention', value:'13mo'}], docs: 'docs/gov/audit', col: 3 },
];

const LAYER_FLOWS: [LayerKey, LayerKey][] = [
  ['sources', 'bronze'],
  ['bronze', 'silver'],
  ['silver', 'gold'],
  ['gold', 'ai'],
  ['ai', 'serving'],
];

const BLOCK_W = 4.2;
const BLOCK_H = 1.6;
const BLOCK_D = 3.4;
const COL_GAP = 5.4;
const COL_OFFSET = -((4 - 1) * COL_GAP) / 2;

export default function Architecture3D() {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const rafRef = useRef<number>();
  const meshIndex = useRef<Map<string, THREE.Mesh>>(new Map());

  const [labels, setLabels] = useState<{ id: string; name: string; product: string; x: number; y: number; hex: string }[]>([]);
  const [layerLabels, setLayerLabels] = useState<{ key: LayerKey; title: string; tagline: string; x: number; y: number; hex: string }[]>([]);
  const [hoverNode, setHoverNode] = useState<Node | null>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [selected, setSelected] = useState<Node | null>(null);
  const [selectedLayer, setSelectedLayer] = useState<LayerKey | null>(null);

  const filteredNodes = useMemo(() => selectedLayer ? NODES.filter(n => n.layer === selectedLayer) : NODES, [selectedLayer]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth;
    const height = container.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050912);
    scene.fog = new THREE.FogExp2(0x050912, 0.012);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 200);
    camera.position.set(28, 16, 32);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    scene.add(new THREE.AmbientLight(0xffffff, 0.35));
    const key = new THREE.DirectionalLight(0xffffff, 0.8); key.position.set(20, 30, 20); scene.add(key);
    const rim = new THREE.PointLight(0x06b6d4, 1.4, 80); rim.position.set(-20, 8, -10); scene.add(rim);
    const fill = new THREE.PointLight(0xf59e0b, 0.6, 60); fill.position.set(15, -10, 5); scene.add(fill);

    // Star field
    const starsGeo = new THREE.BufferGeometry();
    const starPos = new Float32Array(800 * 3);
    for (let i = 0; i < 800; i++) {
      starPos[i*3] = (Math.random() - 0.5) * 120;
      starPos[i*3+1] = (Math.random() - 0.5) * 80;
      starPos[i*3+2] = (Math.random() - 0.5) * 120;
    }
    starsGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    scene.add(new THREE.Points(starsGeo, new THREE.PointsMaterial({ color: 0x334155, size: 0.05, transparent: true, opacity: 0.6 })));

    // Build layers
    const slabMeshes: THREE.Mesh[] = [];
    LAYERS.forEach((layer) => {
      // Layer slab (translucent platform)
      const slabGeo = new THREE.BoxGeometry(28, 0.18, 16);
      const slabMat = new THREE.MeshStandardMaterial({
        color: layer.color,
        emissive: layer.color,
        emissiveIntensity: 0.15,
        transparent: true,
        opacity: 0.18,
        metalness: 0.2,
        roughness: 0.6,
      });
      const slab = new THREE.Mesh(slabGeo, slabMat);
      slab.position.set(0, layer.y - 1.2, 0);
      (slab as any).userData = { type: 'slab', layer: layer.key };
      scene.add(slab);
      slabMeshes.push(slab);

      // Slab edge ring
      const ringGeo = new THREE.EdgesGeometry(slabGeo);
      const ringMat = new THREE.LineBasicMaterial({ color: layer.color, transparent: true, opacity: 0.5 });
      const ring = new THREE.LineSegments(ringGeo, ringMat);
      ring.position.copy(slab.position);
      scene.add(ring);
    });

    // Build node blocks
    NODES.forEach((node) => {
      const layer = LAYER_BY_KEY[node.layer];
      const x = COL_OFFSET + node.col * COL_GAP;
      const y = layer.y;
      const z = 0;

      const geo = new THREE.BoxGeometry(BLOCK_W, BLOCK_H, BLOCK_D);
      const mat = new THREE.MeshPhysicalMaterial({
        color: layer.color,
        emissive: layer.color,
        emissiveIntensity: 0.45,
        metalness: 0.5,
        roughness: 0.25,
        transparent: true,
        opacity: 0.92,
        clearcoat: 0.6,
        clearcoatRoughness: 0.15,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, z);
      (mesh as any).userData = { type: 'node', id: node.id };
      scene.add(mesh);
      meshIndex.current.set(node.id, mesh);

      // Wireframe outline
      const outlineGeo = new THREE.EdgesGeometry(geo);
      const outlineMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.3 });
      const outline = new THREE.LineSegments(outlineGeo, outlineMat);
      outline.position.copy(mesh.position);
      scene.add(outline);

      // Pulse base ring
      const baseRingGeo = new THREE.RingGeometry(BLOCK_W * 0.55, BLOCK_W * 0.62, 48);
      const baseRingMat = new THREE.MeshBasicMaterial({
        color: layer.color, transparent: true, opacity: 0.6, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      });
      const baseRing = new THREE.Mesh(baseRingGeo, baseRingMat);
      baseRing.rotation.x = -Math.PI / 2;
      baseRing.position.set(x, y - BLOCK_H / 2 - 0.05, z);
      (baseRing as any).userData = { pulse: true, t: Math.random() * Math.PI * 2 };
      scene.add(baseRing);
    });

    // Inter-layer flow particles
    const flowGroup = new THREE.Group();
    scene.add(flowGroup);
    type Particle = { mesh: THREE.Mesh; from: THREE.Vector3; to: THREE.Vector3; t: number; speed: number };
    const particles: Particle[] = [];
    LAYER_FLOWS.forEach(([fromKey, toKey]) => {
      const fromY = LAYER_BY_KEY[fromKey].y;
      const toY = LAYER_BY_KEY[toKey].y;
      for (let col = 0; col < 4; col++) {
        const x = COL_OFFSET + col * COL_GAP;
        for (let i = 0; i < 3; i++) {
          const pgeo = new THREE.SphereGeometry(0.12, 12, 12);
          const pmat = new THREE.MeshBasicMaterial({ color: LAYER_BY_KEY[toKey].color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending });
          const pmesh = new THREE.Mesh(pgeo, pmat);
          flowGroup.add(pmesh);
          particles.push({
            mesh: pmesh,
            from: new THREE.Vector3(x, fromY - BLOCK_H/2, 0),
            to:   new THREE.Vector3(x, toY + BLOCK_H/2, 0),
            t: Math.random(),
            speed: 0.004 + Math.random() * 0.004,
          });
        }
      }
    });

    // Raycasting
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    const onMove = (e: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects([...meshIndex.current.values(), ...slabMeshes], false);
      if (intersects.length) {
        const ud = (intersects[0].object as any).userData;
        if (ud?.type === 'node') {
          const n = NODES.find(x => x.id === ud.id);
          if (n) {
            setHoverNode(n);
            setHoverPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
            renderer.domElement.style.cursor = 'pointer';
            return;
          }
        }
        if (ud?.type === 'slab') {
          renderer.domElement.style.cursor = 'pointer';
        }
      } else {
        setHoverNode(null);
        renderer.domElement.style.cursor = 'grab';
      }
    };
    const onClick = (e: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects([...meshIndex.current.values(), ...slabMeshes], false);
      if (!intersects.length) return;
      const ud = (intersects[0].object as any).userData;
      if (ud?.type === 'node') {
        const n = NODES.find(x => x.id === ud.id);
        if (n) setSelected(n);
      } else if (ud?.type === 'slab') {
        setSelectedLayer(prev => prev === ud.layer ? null : ud.layer);
      }
    };
    renderer.domElement.addEventListener('mousemove', onMove);
    renderer.domElement.addEventListener('click', onClick);

    // Drag rotate
    let dragging = false;
    let lastX = 0, lastY = 0;
    let rotY = 0, rotX = 0;
    const onDown = (e: MouseEvent) => { dragging = true; lastX = e.clientX; lastY = e.clientY; renderer.domElement.style.cursor = 'grabbing'; };
    const onUp = () => { dragging = false; renderer.domElement.style.cursor = 'grab'; };
    const onDrag = (e: MouseEvent) => {
      if (!dragging) return;
      rotY += (e.clientX - lastX) * 0.005;
      rotX = Math.max(-0.6, Math.min(0.6, rotX + (e.clientY - lastY) * 0.003));
      lastX = e.clientX; lastY = e.clientY;
    };
    renderer.domElement.addEventListener('mousedown', onDown);
    renderer.domElement.addEventListener('mouseup', onUp);
    renderer.domElement.addEventListener('mouseleave', onUp);
    renderer.domElement.addEventListener('mousemove', onDrag);

    // Wheel zoom
    let zoom = 1;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoom = Math.max(0.55, Math.min(1.8, zoom + (e.deltaY > 0 ? 0.06 : -0.06)));
    };
    renderer.domElement.addEventListener('wheel', onWheel, { passive: false });

    // Animation loop
    const baseRingMeshes: THREE.Mesh[] = [];
    scene.traverse(o => { if ((o as any).userData?.pulse) baseRingMeshes.push(o as THREE.Mesh); });

    const tick = () => {
      const r = 42 * zoom;
      camera.position.x = Math.sin(rotY) * Math.cos(rotX) * r;
      camera.position.y = Math.sin(rotX) * r + 4;
      camera.position.z = Math.cos(rotY) * Math.cos(rotX) * r;
      camera.lookAt(0, 0, 0);

      // pulse rings
      baseRingMeshes.forEach(m => {
        const ud = (m as any).userData;
        ud.t += 0.03;
        const s = 1 + Math.sin(ud.t) * 0.18;
        m.scale.set(s, s, 1);
        (m.material as THREE.MeshBasicMaterial).opacity = 0.35 + (Math.sin(ud.t) + 1) * 0.15;
      });

      // particles
      particles.forEach(p => {
        p.t += p.speed;
        if (p.t > 1) p.t = 0;
        p.mesh.position.lerpVectors(p.from, p.to, p.t);
      });

      // dim filtered-out nodes
      meshIndex.current.forEach((mesh, id) => {
        const node = NODES.find(n => n.id === id)!;
        const dim = selectedLayer && node.layer !== selectedLayer;
        const mat = mesh.material as THREE.MeshPhysicalMaterial;
        mat.opacity += ((dim ? 0.18 : 0.92) - mat.opacity) * 0.15;
        mat.emissiveIntensity += ((dim ? 0.08 : (hoverNode?.id === id ? 0.95 : 0.45)) - mat.emissiveIntensity) * 0.15;
        const targetScale = hoverNode?.id === id ? 1.12 : 1.0;
        mesh.scale.x += (targetScale - mesh.scale.x) * 0.18;
        mesh.scale.y += (targetScale - mesh.scale.y) * 0.18;
        mesh.scale.z += (targetScale - mesh.scale.z) * 0.18;
      });

      renderer.render(scene, camera);

      // Project labels to 2D
      const project = (v: THREE.Vector3) => {
        const p = v.clone().project(camera);
        return {
          x: (p.x * 0.5 + 0.5) * width,
          y: (-p.y * 0.5 + 0.5) * height,
          z: p.z,
        };
      };
      const newLabels = NODES.map(n => {
        const layer = LAYER_BY_KEY[n.layer];
        const pos = new THREE.Vector3(COL_OFFSET + n.col * COL_GAP, layer.y + BLOCK_H/2 + 0.4, 0);
        const proj = project(pos);
        return { id: n.id, name: n.name, product: n.product, x: proj.x, y: proj.y, hex: layer.hex };
      });
      setLabels(newLabels);

      const newLayerLabels = LAYERS.map(l => {
        const proj = project(new THREE.Vector3(-15, l.y - 0.5, 7));
        return { key: l.key, title: l.title, tagline: l.tagline, x: proj.x, y: proj.y, hex: l.hex };
      });
      setLayerLabels(newLayerLabels);

      rafRef.current = requestAnimationFrame(tick);
    };
    tick();

    const onResize = () => {
      if (!container) return;
      const w = container.clientWidth, h = container.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
      renderer.domElement.removeEventListener('mousemove', onMove);
      renderer.domElement.removeEventListener('click', onClick);
      renderer.domElement.removeEventListener('mousedown', onDown);
      renderer.domElement.removeEventListener('mouseup', onUp);
      renderer.domElement.removeEventListener('mouseleave', onUp);
      renderer.domElement.removeEventListener('mousemove', onDrag);
      renderer.domElement.removeEventListener('wheel', onWheel);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      renderer.dispose();
      if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
      meshIndex.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="relative w-full h-full bg-[#050912] overflow-hidden">
      <div ref={containerRef} className="absolute inset-0" />

      {/* Layer rail (left) */}
      <div className="absolute top-4 left-4 z-10 space-y-1.5 max-w-[260px]">
        <div className="px-3 py-2 rounded-lg bg-slate-900/80 border border-slate-700 backdrop-blur-md">
          <div className="flex items-center gap-2 text-[11px] text-slate-200 font-semibold">
            <Network className="w-3.5 h-3.5 text-cyan-400" />
            Databricks Lakehouse for SOC
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">Click a layer to focus, click a block to drill down</div>
        </div>
        {LAYERS.map(l => {
          const Icon = l.icon;
          const active = selectedLayer === l.key;
          return (
            <button
              key={l.key}
              onClick={() => setSelectedLayer(prev => prev === l.key ? null : l.key)}
              className={`w-full text-left px-3 py-2 rounded-lg border backdrop-blur-md transition-all flex items-center gap-2 ${
                active
                  ? 'bg-slate-900/90 border-white/30 shadow-lg'
                  : 'bg-slate-900/60 border-slate-700/60 hover:bg-slate-900/80'
              }`}
              style={active ? { boxShadow: `0 0 18px ${l.hex}55` } : undefined}
            >
              <span className="w-6 h-6 rounded flex items-center justify-center" style={{ background: `${l.hex}22`, color: l.hex }}>
                <Icon className="w-3.5 h-3.5" />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-[11px] font-semibold text-slate-100 truncate">{l.title}</span>
                <span className="block text-[10px] text-slate-500 truncate">{l.tagline}</span>
              </span>
              {active && <ChevronRight className="w-3 h-3 text-slate-400" />}
            </button>
          );
        })}
        {selectedLayer && (
          <button
            onClick={() => setSelectedLayer(null)}
            className="w-full text-[10px] text-slate-400 hover:text-slate-100 px-3 py-1.5 rounded-lg bg-slate-900/40 border border-slate-800"
          >
            Clear focus
          </button>
        )}
      </div>

      {/* Legend (right) */}
      <div className="absolute top-4 right-4 z-10 px-4 py-3 bg-slate-900/80 border border-slate-700 rounded-lg backdrop-blur-md">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
          <span className="text-[11px] font-semibold text-slate-100">Hover · Click · Drag · Scroll</span>
        </div>
        <div className="space-y-1 text-[10px] text-slate-400">
          <div><span className="text-slate-200">Hover</span> a block · see what it does</div>
          <div><span className="text-slate-200">Click</span> a block · open spec drawer</div>
          <div><span className="text-slate-200">Click</span> a layer · focus that tier</div>
          <div><span className="text-slate-200">Drag</span> · rotate · <span className="text-slate-200">Scroll</span> · zoom</div>
        </div>
        <div className="mt-3 pt-2 border-t border-slate-800">
          <div className="text-[10px] text-slate-500 mb-1.5">Counters</div>
          <div className="flex items-center gap-3 text-[11px]">
            <span className="flex items-center gap-1 text-cyan-300"><Database className="w-3 h-3" />{NODES.length} services</span>
            <span className="flex items-center gap-1 text-emerald-300"><Layers className="w-3 h-3" />{LAYERS.length} layers</span>
          </div>
        </div>
      </div>

      {/* Layer labels (left side, projected) */}
      {layerLabels.map(l => (
        <div
          key={l.key}
          className="absolute z-0 pointer-events-none"
          style={{ left: l.x, top: l.y, transform: 'translate(-100%, -50%)' }}
        >
          <div
            className="px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider whitespace-nowrap"
            style={{ color: l.hex, textShadow: `0 0 12px ${l.hex}99` }}
          >
            {l.title}
          </div>
        </div>
      ))}

      {/* Block labels */}
      {labels.map(lab => {
        const dim = selectedLayer && NODES.find(n => n.id === lab.id)?.layer !== selectedLayer;
        return (
          <div
            key={lab.id}
            className={`absolute pointer-events-none transition-opacity ${dim ? 'opacity-30' : 'opacity-100'}`}
            style={{ left: lab.x, top: lab.y, transform: 'translate(-50%, -100%)' }}
          >
            <div
              className="px-2 py-0.5 rounded bg-slate-950/85 border text-[10px] font-semibold whitespace-nowrap"
              style={{ borderColor: lab.hex + '66', color: '#f1f5f9' }}
            >
              {lab.name}
            </div>
            <div className="text-[9px] text-slate-400 text-center mt-0.5 whitespace-nowrap" style={{ textShadow: '0 0 6px #000' }}>
              {lab.product}
            </div>
          </div>
        );
      })}

      {/* Hover tooltip */}
      {hoverNode && (
        <div
          className="absolute z-20 pointer-events-none"
          style={{
            left: Math.min(hoverPos.x + 16, (containerRef.current?.clientWidth || 800) - 320),
            top: Math.min(hoverPos.y + 16, (containerRef.current?.clientHeight || 600) - 200),
          }}
        >
          <div className="w-80 p-4 rounded-xl bg-slate-950/95 border-2 backdrop-blur-md shadow-2xl"
            style={{ borderColor: LAYER_BY_KEY[hoverNode.layer].hex + '88', boxShadow: `0 0 24px ${LAYER_BY_KEY[hoverNode.layer].hex}44` }}
          >
            <div className="flex items-center gap-2 mb-1.5">
              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider"
                style={{ background: LAYER_BY_KEY[hoverNode.layer].hex + '22', color: LAYER_BY_KEY[hoverNode.layer].hex }}>
                {LAYER_BY_KEY[hoverNode.layer].title}
              </span>
              <span className="text-[10px] text-slate-500">click to drill down</span>
            </div>
            <div className="text-sm font-bold text-slate-100">{hoverNode.name}</div>
            <div className="text-[11px] mt-0.5" style={{ color: LAYER_BY_KEY[hoverNode.layer].hex }}>{hoverNode.product}</div>
            <p className="text-xs text-slate-300 mt-2 leading-relaxed">{hoverNode.blurb}</p>
            <div className="grid grid-cols-2 gap-2 mt-3">
              {hoverNode.metrics.map(m => (
                <div key={m.label} className="px-2 py-1 rounded bg-slate-900/60 border border-slate-800">
                  <div className="text-[9px] uppercase text-slate-500 tracking-wider">{m.label}</div>
                  <div className="text-xs font-bold text-slate-100">{m.value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Drill-down drawer */}
      {selected && (
        <div className="absolute inset-0 z-30 flex justify-end" onClick={() => setSelected(null)}>
          <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-xl h-full bg-[#0A1628] border-l-2 overflow-y-auto"
            style={{ borderLeftColor: LAYER_BY_KEY[selected.layer].hex }}
            onClick={e => e.stopPropagation()}
          >
            <div
              className="relative p-6 border-b border-slate-800"
              style={{ background: `linear-gradient(135deg, ${LAYER_BY_KEY[selected.layer].hex}22 0%, transparent 60%)` }}
            >
              <button onClick={() => setSelected(null)} className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-slate-900/40 text-slate-300">
                <X className="w-4 h-4" />
              </button>
              <div className="flex items-center gap-2 mb-2">
                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider"
                  style={{ background: LAYER_BY_KEY[selected.layer].hex + '22', color: LAYER_BY_KEY[selected.layer].hex }}>
                  {LAYER_BY_KEY[selected.layer].title}
                </span>
              </div>
              <h2 className="text-2xl font-bold text-slate-50">{selected.name}</h2>
              <div className="text-sm font-mono mt-1" style={{ color: LAYER_BY_KEY[selected.layer].hex }}>{selected.product}</div>
              <p className="text-sm text-slate-300 mt-3 leading-relaxed">{selected.blurb}</p>
            </div>

            <div className="p-6 space-y-6">
              <div className="grid grid-cols-2 gap-3">
                {selected.metrics.map(m => (
                  <div key={m.label} className="p-3 rounded-lg bg-slate-900/40 border border-slate-800">
                    <div className="text-[10px] uppercase text-slate-500 tracking-wider">{m.label}</div>
                    <div className="text-lg font-bold text-slate-100 mt-0.5">{m.value}</div>
                  </div>
                ))}
              </div>

              <div>
                <div className="flex items-center gap-2 mb-3">
                  <FileCode className="w-4 h-4" style={{ color: LAYER_BY_KEY[selected.layer].hex }} />
                  <h3 className="text-sm font-bold text-slate-100">Capabilities</h3>
                </div>
                <ul className="space-y-2">
                  {selected.details.map((d, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-slate-300">
                      <ChevronRight className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" style={{ color: LAYER_BY_KEY[selected.layer].hex }} />
                      <span>{d}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Activity className="w-4 h-4 text-emerald-400" />
                  <h3 className="text-sm font-bold text-slate-100">Upstream &amp; Downstream</h3>
                </div>
                <FlowMini node={selected} />
              </div>

              <div className="p-4 rounded-lg bg-slate-900/40 border border-slate-800">
                <div className="flex items-center gap-2 mb-2">
                  <Cpu className="w-4 h-4 text-cyan-400" />
                  <span className="text-xs font-bold text-slate-100">Powered by Databricks</span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  This component runs natively on the Databricks Data Intelligence Platform — governed end-to-end by Unity Catalog,
                  observable through MLflow + System Tables, and accelerated by Photon. No bolt-ons, no external state.
                </p>
                <code className="block mt-2 text-[10px] text-cyan-300 font-mono break-all">{selected.docs}</code>
              </div>

              <button
                onClick={() => { setSelectedLayer(selected.layer); setSelected(null); }}
                className="w-full py-2.5 rounded-lg text-xs font-semibold border transition-colors"
                style={{
                  background: LAYER_BY_KEY[selected.layer].hex + '15',
                  borderColor: LAYER_BY_KEY[selected.layer].hex + '55',
                  color: LAYER_BY_KEY[selected.layer].hex,
                }}
              >
                Focus on {LAYER_BY_KEY[selected.layer].title} layer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Status bar */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 px-4 py-2 rounded-full bg-slate-900/85 border border-slate-700 backdrop-blur-md flex items-center gap-3 text-[11px]">
        <span className="flex items-center gap-1.5 text-emerald-300">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Live
        </span>
        <span className="text-slate-500">·</span>
        <span className="text-slate-300">{filteredNodes.length} of {NODES.length} services in view</span>
        <span className="text-slate-500">·</span>
        <span className="flex items-center gap-1 text-cyan-300"><Zap className="w-3 h-3" />Photon-accelerated</span>
      </div>
    </div>
  );
}

function FlowMini({ node }: { node: Node }) {
  const layerIdx = LAYERS.findIndex(l => l.key === node.layer);
  const upstream = layerIdx > 0 ? LAYERS[layerIdx - 1] : null;
  const downstream = layerIdx < LAYERS.length - 1 ? LAYERS[layerIdx + 1] : null;
  return (
    <div className="space-y-1.5">
      {upstream && (
        <FlowChip label="Upstream" layer={upstream} />
      )}
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg border-2"
        style={{ background: LAYER_BY_KEY[node.layer].hex + '15', borderColor: LAYER_BY_KEY[node.layer].hex }}>
        <span className="w-2 h-2 rounded-full" style={{ background: LAYER_BY_KEY[node.layer].hex }} />
        <span className="text-xs font-bold text-slate-100">{node.name}</span>
        <span className="text-[10px] text-slate-400 ml-auto">{LAYER_BY_KEY[node.layer].title}</span>
      </div>
      {downstream && (
        <FlowChip label="Downstream" layer={downstream} />
      )}
    </div>
  );
}

function FlowChip({ label, layer }: { label: string; layer: LayerDef }) {
  const Icon = layer.icon;
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900/40 border border-slate-800">
      <span className="w-5 h-5 rounded flex items-center justify-center" style={{ background: layer.hex + '22', color: layer.hex }}>
        <Icon className="w-3 h-3" />
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
        <div className="text-xs text-slate-200 truncate">{layer.title}</div>
      </div>
    </div>
  );
}
