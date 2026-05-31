import React, { useRef, useEffect, useCallback, useState } from "react";
import { Network } from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EvidenceNode {
  id: string;
  label: string;
  type: string;
  risk: number;
}

interface EvidenceEdge {
  source: string;
  target: string;
  type: string;
  weight: number;
}

interface Props {
  nodes: EvidenceNode[];
  edges: EvidenceEdge[];
  title?: string;
}

// ---------------------------------------------------------------------------
// Internal simulation types
// ---------------------------------------------------------------------------

interface SimNode extends EvidenceNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  pinned: boolean;
}

interface SimEdge {
  source: SimNode;
  target: SimNode;
  type: string;
  weight: number;
  particles: EdgeParticle[];
}

interface EdgeParticle {
  t: number; // 0-1 progress along edge
  speed: number;
}

interface AmbientParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  alpha: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BG_COLOR = "#080c16";
const REPULSION = 3500;
const ATTRACTION = 0.006;
const DAMPING = 0.86;
const CENTER_PULL = 0.01;
const CANVAS_HEIGHT = 400;

const NODE_COLORS: Record<string, string> = {
  threat_actor: "#f87171",
  marketplace: "#fbbf24",
  tool: "#fb923c",
  malware: "#fb923c",
  target: "#22d3ee",
  system: "#22d3ee",
  victim: "#3b82f6",
  financial: "#34d399",
  mule_network: "#34d399",
  c2: "#ef4444",
  insider: "#f87171",
  device: "#94a3b8",
  exfil: "#94a3b8",
  credential: "#22d3ee",
  bot_network: "#fb923c",
  evidence: "#60a5fa",
  suspicious: "#fbbf24",
};

const NODE_TYPE_LABELS: Record<string, string> = {
  threat_actor: "Threat Actor",
  marketplace: "Marketplace",
  tool: "Tool",
  malware: "Malware",
  target: "Target",
  system: "System",
  victim: "Victim",
  financial: "Financial",
  mule_network: "Mule Network",
  c2: "C2 Server",
  insider: "Insider",
  device: "Device",
  exfil: "Exfiltration",
  credential: "Credential",
  bot_network: "Bot Network",
  evidence: "Evidence",
  suspicious: "Suspicious",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ];
}

function nodeColor(type: string): string {
  return NODE_COLORS[type] ?? "#94a3b8";
}

function nodeRadius(risk: number): number {
  return 12 + (risk / 100) * 12;
}

// ---------------------------------------------------------------------------
// Shape drawers
// ---------------------------------------------------------------------------

function drawPentagon(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
) {
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
    const px = x + r * Math.cos(angle);
    const py = y + r * Math.sin(angle);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function drawHexagon(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const angle = -Math.PI / 6 + (i * 2 * Math.PI) / 6;
    const px = x + r * Math.cos(angle);
    const py = y + r * Math.sin(angle);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function drawTriangle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.lineTo(x + r * 0.866, y + r * 0.5);
  ctx.lineTo(x - r * 0.866, y + r * 0.5);
  ctx.closePath();
}

function drawDiamond(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.lineTo(x + r * 0.75, y);
  ctx.lineTo(x, y + r);
  ctx.lineTo(x - r * 0.75, y);
  ctx.closePath();
}

function drawDocumentShape(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
) {
  const w = r * 0.8;
  const h = r;
  ctx.beginPath();
  ctx.moveTo(x - w, y - h);
  ctx.lineTo(x + w, y - h);
  ctx.lineTo(x + w, y + h * 0.6);
  ctx.quadraticCurveTo(x, y + h * 0.3, x - w, y + h * 0.6);
  ctx.closePath();
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
) {
  const w = r * 1.2;
  const h = r * 0.8;
  const cr = 4;
  ctx.beginPath();
  ctx.moveTo(x - w + cr, y - h);
  ctx.lineTo(x + w - cr, y - h);
  ctx.arcTo(x + w, y - h, x + w, y - h + cr, cr);
  ctx.lineTo(x + w, y + h - cr);
  ctx.arcTo(x + w, y + h, x + w - cr, y + h, cr);
  ctx.lineTo(x - w + cr, y + h);
  ctx.arcTo(x - w, y + h, x - w, y + h - cr, cr);
  ctx.lineTo(x - w, y - h + cr);
  ctx.arcTo(x - w, y - h, x - w + cr, y - h, cr);
  ctx.closePath();
}

// ---------------------------------------------------------------------------
// Node rendering
// ---------------------------------------------------------------------------

function drawNode(
  ctx: CanvasRenderingContext2D,
  node: SimNode,
  time: number,
  hovered: boolean,
) {
  const { x, y, radius: r, color, type, risk } = node;

  ctx.save();

  // Glow for high-risk nodes
  if (risk > 70 || type === "threat_actor" || type === "c2") {
    const pulsePhase = Math.sin(time * 0.003 + node.x * 0.01) * 0.5 + 0.5;
    const glowRadius = r * (1.8 + pulsePhase * 0.8);
    const [cr, cg, cb] = hexToRgb(color);
    const grad = ctx.createRadialGradient(x, y, r * 0.3, x, y, glowRadius);
    grad.addColorStop(0, `rgba(${cr},${cg},${cb},${0.25 + pulsePhase * 0.15})`);
    grad.addColorStop(0.5, `rgba(${cr},${cg},${cb},${0.08 + pulsePhase * 0.06})`);
    grad.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, glowRadius, 0, Math.PI * 2);
    ctx.fill();
  }

  // Hover highlight
  if (hovered) {
    const [cr, cg, cb] = hexToRgb(color);
    const grad = ctx.createRadialGradient(x, y, r, x, y, r * 2.5);
    grad.addColorStop(0, `rgba(${cr},${cg},${cb},0.3)`);
    grad.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r * 2.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // Fill + stroke based on type
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;

  switch (type) {
    case "threat_actor": {
      drawPentagon(ctx, x, y, r);
      const [cr, cg, cb] = hexToRgb(color);
      const innerGrad = ctx.createRadialGradient(x, y - r * 0.3, 0, x, y, r);
      innerGrad.addColorStop(0, `rgba(${cr},${cg},${cb},0.9)`);
      innerGrad.addColorStop(1, `rgba(${cr},${cg},${cb},0.5)`);
      ctx.fillStyle = innerGrad;
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.stroke();
      break;
    }
    case "marketplace": {
      drawHexagon(ctx, x, y, r);
      const [cr, cg, cb] = hexToRgb(color);
      const innerGrad = ctx.createRadialGradient(x, y - r * 0.3, 0, x, y, r);
      innerGrad.addColorStop(0, `rgba(${cr},${cg},${cb},0.85)`);
      innerGrad.addColorStop(1, `rgba(${cr},${cg},${cb},0.45)`);
      ctx.fillStyle = innerGrad;
      ctx.fill();
      ctx.stroke();
      break;
    }
    case "tool":
    case "malware": {
      drawTriangle(ctx, x, y, r);
      const [cr, cg, cb] = hexToRgb(color);
      const innerGrad = ctx.createRadialGradient(x, y, 0, x, y, r);
      innerGrad.addColorStop(0, `rgba(${cr},${cg},${cb},0.85)`);
      innerGrad.addColorStop(1, `rgba(${cr},${cg},${cb},0.45)`);
      ctx.fillStyle = innerGrad;
      ctx.fill();
      ctx.stroke();
      break;
    }
    case "target":
    case "system": {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      const [cr, cg, cb] = hexToRgb(color);
      const innerGrad = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r);
      innerGrad.addColorStop(0, `rgba(${cr},${cg},${cb},0.9)`);
      innerGrad.addColorStop(1, `rgba(${cr},${cg},${cb},0.4)`);
      ctx.fillStyle = innerGrad;
      ctx.fill();
      ctx.stroke();
      break;
    }
    case "victim": {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      const [cr, cg, cb] = hexToRgb(color);
      const innerGrad = ctx.createRadialGradient(x, y, 0, x, y, r);
      innerGrad.addColorStop(0, `rgba(${cr},${cg},${cb},0.8)`);
      innerGrad.addColorStop(1, `rgba(${cr},${cg},${cb},0.35)`);
      ctx.fillStyle = innerGrad;
      ctx.fill();
      ctx.stroke();
      // Cross
      ctx.beginPath();
      ctx.moveTo(x - r * 0.5, y);
      ctx.lineTo(x + r * 0.5, y);
      ctx.moveTo(x, y - r * 0.5);
      ctx.lineTo(x, y + r * 0.5);
      ctx.strokeStyle = `rgba(${cr},${cg},${cb},0.9)`;
      ctx.lineWidth = 2;
      ctx.stroke();
      break;
    }
    case "financial":
    case "mule_network": {
      drawDiamond(ctx, x, y, r);
      const [cr, cg, cb] = hexToRgb(color);
      const innerGrad = ctx.createRadialGradient(x, y, 0, x, y, r);
      innerGrad.addColorStop(0, `rgba(${cr},${cg},${cb},0.85)`);
      innerGrad.addColorStop(1, `rgba(${cr},${cg},${cb},0.4)`);
      ctx.fillStyle = innerGrad;
      ctx.fill();
      ctx.stroke();
      break;
    }
    case "c2": {
      const pulseScale = 1 + Math.sin(time * 0.005) * 0.15;
      const pr = r * 0.7 * pulseScale;
      ctx.beginPath();
      ctx.arc(x, y, pr, 0, Math.PI * 2);
      const [cr, cg, cb] = hexToRgb(color);
      const innerGrad = ctx.createRadialGradient(x, y, 0, x, y, pr);
      innerGrad.addColorStop(0, `rgba(${cr},${cg},${cb},1)`);
      innerGrad.addColorStop(1, `rgba(${cr},${cg},${cb},0.5)`);
      ctx.fillStyle = innerGrad;
      ctx.fill();
      // Concentric ring
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(${cr},${cg},${cb},0.3)`;
      ctx.lineWidth = 1;
      ctx.stroke();
      break;
    }
    case "insider": {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      const [cr, cg, cb] = hexToRgb(color);
      const innerGrad = ctx.createRadialGradient(x, y, 0, x, y, r);
      innerGrad.addColorStop(0, `rgba(${cr},${cg},${cb},0.85)`);
      innerGrad.addColorStop(1, `rgba(${cr},${cg},${cb},0.4)`);
      ctx.fillStyle = innerGrad;
      ctx.fill();
      ctx.stroke();
      // Exclamation mark
      ctx.fillStyle = "#fff";
      ctx.font = `bold ${r * 0.9}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("!", x, y + 1);
      break;
    }
    case "device":
    case "exfil": {
      drawRoundedRect(ctx, x, y, r);
      const [cr, cg, cb] = hexToRgb(color);
      const innerGrad = ctx.createRadialGradient(x, y, 0, x, y, r);
      innerGrad.addColorStop(0, `rgba(${cr},${cg},${cb},0.7)`);
      innerGrad.addColorStop(1, `rgba(${cr},${cg},${cb},0.3)`);
      ctx.fillStyle = innerGrad;
      ctx.fill();
      ctx.stroke();
      break;
    }
    case "credential": {
      drawDiamond(ctx, x, y, r);
      ctx.fillStyle = "transparent";
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.stroke();
      // Inner smaller diamond
      drawDiamond(ctx, x, y, r * 0.55);
      ctx.strokeStyle = `${color}88`;
      ctx.lineWidth = 1;
      ctx.stroke();
      break;
    }
    case "bot_network": {
      const [cr, cg, cb] = hexToRgb(color);
      const offsets = [
        { dx: 0, dy: -r * 0.4 },
        { dx: -r * 0.35, dy: r * 0.3 },
        { dx: r * 0.35, dy: r * 0.3 },
      ];
      for (const off of offsets) {
        ctx.beginPath();
        ctx.arc(x + off.dx, y + off.dy, r * 0.35, 0, Math.PI * 2);
        const innerGrad = ctx.createRadialGradient(
          x + off.dx,
          y + off.dy,
          0,
          x + off.dx,
          y + off.dy,
          r * 0.35,
        );
        innerGrad.addColorStop(0, `rgba(${cr},${cg},${cb},0.9)`);
        innerGrad.addColorStop(1, `rgba(${cr},${cg},${cb},0.4)`);
        ctx.fillStyle = innerGrad;
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      // Connecting lines
      ctx.beginPath();
      ctx.strokeStyle = `rgba(${cr},${cg},${cb},0.3)`;
      ctx.lineWidth = 1;
      ctx.moveTo(x + offsets[0].dx, y + offsets[0].dy);
      ctx.lineTo(x + offsets[1].dx, y + offsets[1].dy);
      ctx.lineTo(x + offsets[2].dx, y + offsets[2].dy);
      ctx.lineTo(x + offsets[0].dx, y + offsets[0].dy);
      ctx.stroke();
      break;
    }
    case "evidence": {
      drawDocumentShape(ctx, x, y, r);
      const [cr, cg, cb] = hexToRgb(color);
      const innerGrad = ctx.createRadialGradient(x, y, 0, x, y, r);
      innerGrad.addColorStop(0, `rgba(${cr},${cg},${cb},0.8)`);
      innerGrad.addColorStop(1, `rgba(${cr},${cg},${cb},0.35)`);
      ctx.fillStyle = innerGrad;
      ctx.fill();
      ctx.stroke();
      break;
    }
    case "suspicious": {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.setLineDash([]);
      // Faint fill
      const [cr, cg, cb] = hexToRgb(color);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${cr},${cg},${cb},0.15)`;
      ctx.fill();
      break;
    }
    default: {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      const [cr, cg, cb] = hexToRgb(color);
      const innerGrad = ctx.createRadialGradient(x, y, 0, x, y, r);
      innerGrad.addColorStop(0, `rgba(${cr},${cg},${cb},0.7)`);
      innerGrad.addColorStop(1, `rgba(${cr},${cg},${cb},0.3)`);
      ctx.fillStyle = innerGrad;
      ctx.fill();
      ctx.stroke();
      break;
    }
  }

  // Node label
  ctx.fillStyle = "#e2e8f0";
  ctx.font = `${Math.max(9, r * 0.55)}px "Inter", system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText(node.label, x, y + r + 5, 100);

  ctx.restore();
}

// ---------------------------------------------------------------------------
// Edge rendering
// ---------------------------------------------------------------------------

function bezierPoint(
  x0: number,
  y0: number,
  cx: number,
  cy: number,
  x1: number,
  y1: number,
  t: number,
): [number, number] {
  const u = 1 - t;
  return [
    u * u * x0 + 2 * u * t * cx + t * t * x1,
    u * u * y0 + 2 * u * t * cy + t * t * y1,
  ];
}

function bezierTangent(
  x0: number,
  y0: number,
  cx: number,
  cy: number,
  x1: number,
  y1: number,
  t: number,
): [number, number] {
  const u = 1 - t;
  return [
    2 * u * (cx - x0) + 2 * t * (x1 - cx),
    2 * u * (cy - y0) + 2 * t * (y1 - cy),
  ];
}

function drawEdge(
  ctx: CanvasRenderingContext2D,
  edge: SimEdge,
  time: number,
  highlighted: boolean,
) {
  const { source, target, weight } = edge;
  const sx = source.x;
  const sy = source.y;
  const tx = target.x;
  const ty = target.y;

  // Control point perpendicular to midpoint
  const mx = (sx + tx) / 2;
  const my = (sy + ty) / 2;
  const dx = tx - sx;
  const dy = ty - sy;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const curvature = Math.min(len * 0.15, 40);
  const cx = mx + nx * curvature;
  const cy = my + ny * curvature;

  const [cr, cg, cb] = hexToRgb(source.color);
  const baseAlpha = highlighted ? 0.8 : 0.15 + weight * 0.35;
  const lineWidth = highlighted ? 2 + weight * 3 : 1 + weight * 3;

  // Edge path
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.quadraticCurveTo(cx, cy, tx, ty);
  ctx.strokeStyle = `rgba(${cr},${cg},${cb},${baseAlpha})`;
  ctx.lineWidth = lineWidth;
  ctx.stroke();

  // Arrow head at target end
  const arrowT = 1 - target.radius / len;
  const [ax, ay] = bezierPoint(sx, sy, cx, cy, tx, ty, Math.max(0.5, arrowT));
  const [adx, ady] = bezierTangent(sx, sy, cx, cy, tx, ty, Math.max(0.5, arrowT));
  const aLen = Math.sqrt(adx * adx + ady * ady) || 1;
  const anx = adx / aLen;
  const any = ady / aLen;
  const arrowSize = 6 + weight * 4;

  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(
    ax - anx * arrowSize + any * arrowSize * 0.4,
    ay - any * arrowSize - anx * arrowSize * 0.4,
  );
  ctx.lineTo(
    ax - anx * arrowSize - any * arrowSize * 0.4,
    ay - any * arrowSize + anx * arrowSize * 0.4,
  );
  ctx.closePath();
  ctx.fillStyle = `rgba(${cr},${cg},${cb},${baseAlpha + 0.1})`;
  ctx.fill();

  // Particles flowing along edge
  for (const particle of edge.particles) {
    const [px, py] = bezierPoint(sx, sy, cx, cy, tx, ty, particle.t);
    const particleAlpha = Math.sin(particle.t * Math.PI) * 0.9;
    const pr = 1.5 + weight * 1.5;
    ctx.beginPath();
    ctx.arc(px, py, pr, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${cr},${cg},${cb},${particleAlpha})`;
    ctx.fill();
  }

  // Edge label on hover
  if (highlighted) {
    const [lx, ly] = bezierPoint(sx, sy, cx, cy, tx, ty, 0.5);
    ctx.font = '10px "Inter", system-ui, sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const labelText = edge.type.replace(/_/g, " ");
    const tm = ctx.measureText(labelText);
    const pad = 4;
    ctx.fillStyle = "rgba(8,12,22,0.85)";
    ctx.beginPath();
    ctx.roundRect(
      lx - tm.width / 2 - pad,
      ly - 7 - pad,
      tm.width + pad * 2,
      14 + pad * 2,
      3,
    );
    ctx.fill();
    ctx.fillStyle = `rgba(${cr},${cg},${cb},0.95)`;
    ctx.fillText(labelText, lx, ly);
  }

  ctx.restore();
}

// ---------------------------------------------------------------------------
// Background effects
// ---------------------------------------------------------------------------

function drawBackground(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  time: number,
  ambientParticles: AmbientParticle[],
) {
  // Fill bg
  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, w, h);

  // Grid lines
  ctx.save();
  ctx.strokeStyle = "rgba(148,163,184,0.04)";
  ctx.lineWidth = 1;
  const gridSize = 40;
  const offsetX = (time * 0.01) % gridSize;
  const offsetY = (time * 0.008) % gridSize;
  for (let x = -gridSize + offsetX; x < w + gridSize; x += gridSize) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let y = -gridSize + offsetY; y < h + gridSize; y += gridSize) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  ctx.restore();

  // Ambient particles
  ctx.save();
  for (const p of ambientParticles) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(148,163,184,${p.alpha})`;
    ctx.fill();
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Tooltip
// ---------------------------------------------------------------------------

function drawTooltip(
  ctx: CanvasRenderingContext2D,
  node: SimNode,
  canvasW: number,
) {
  ctx.save();
  const padding = 10;
  const lineHeight = 16;
  const lines = [
    node.label,
    `Type: ${NODE_TYPE_LABELS[node.type] ?? node.type}`,
    `Risk: ${node.risk}%`,
  ];
  ctx.font = '11px "Inter", system-ui, sans-serif';
  const maxWidth = Math.max(...lines.map((l) => ctx.measureText(l).width));
  const boxW = maxWidth + padding * 2;
  const boxH = lines.length * lineHeight + padding * 2;
  let tx = node.x + node.radius + 12;
  let ty = node.y - boxH / 2;
  if (tx + boxW > canvasW - 10) {
    tx = node.x - node.radius - 12 - boxW;
  }
  if (ty < 10) ty = 10;

  // Box shadow
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.beginPath();
  ctx.roundRect(tx + 2, ty + 2, boxW, boxH, 6);
  ctx.fill();

  // Box
  ctx.fillStyle = "rgba(15,23,42,0.95)";
  ctx.beginPath();
  ctx.roundRect(tx, ty, boxW, boxH, 6);
  ctx.fill();
  ctx.strokeStyle = `${node.color}44`;
  ctx.lineWidth = 1;
  ctx.stroke();

  // Text
  const [cr, cg, cb] = hexToRgb(node.color);
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  for (let i = 0; i < lines.length; i++) {
    ctx.fillStyle =
      i === 0 ? node.color : `rgba(${cr},${cg},${cb},0.7)`;
    ctx.font =
      i === 0
        ? 'bold 11px "Inter", system-ui, sans-serif'
        : '11px "Inter", system-ui, sans-serif';
    ctx.fillText(lines[i], tx + padding, ty + padding + i * lineHeight);
  }

  ctx.restore();
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

const CaseEvidenceGraph: React.FC<Props> = ({ nodes, edges, title }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const simNodesRef = useRef<SimNode[]>([]);
  const simEdgesRef = useRef<SimEdge[]>([]);
  const ambientRef = useRef<AmbientParticle[]>([]);
  const animRef = useRef<number>(0);
  const mouseRef = useRef<{ x: number; y: number }>({ x: -1000, y: -1000 });
  const dragRef = useRef<{ node: SimNode | null; offsetX: number; offsetY: number }>({
    node: null,
    offsetX: 0,
    offsetY: 0,
  });
  const hoveredRef = useRef<SimNode | null>(null);
  const [legendTypes, setLegendTypes] = useState<string[]>([]);

  // Initialize simulation
  const initSimulation = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;

    const nodeMap = new Map<string, SimNode>();
    const angle_step = (2 * Math.PI) / Math.max(nodes.length, 1);

    nodes.forEach((n, i) => {
      const angle = angle_step * i;
      const spread = Math.min(w, h) * 0.25;
      const simNode: SimNode = {
        ...n,
        x: w / 2 + Math.cos(angle) * spread + (Math.random() - 0.5) * 60,
        y: h / 2 + Math.sin(angle) * spread + (Math.random() - 0.5) * 60,
        vx: 0,
        vy: 0,
        radius: nodeRadius(n.risk),
        color: nodeColor(n.type),
        pinned: false,
      };
      nodeMap.set(n.id, simNode);
    });

    simNodesRef.current = Array.from(nodeMap.values());

    simEdgesRef.current = edges
      .map((e) => {
        const s = nodeMap.get(e.source);
        const t = nodeMap.get(e.target);
        if (!s || !t) return null;
        const numParticles = 2 + Math.round(e.weight);
        const particles: EdgeParticle[] = [];
        for (let i = 0; i < numParticles; i++) {
          particles.push({
            t: i / numParticles,
            speed: 0.002 + Math.random() * 0.003,
          });
        }
        return { source: s, target: t, type: e.type, weight: e.weight, particles };
      })
      .filter(Boolean) as SimEdge[];

    // Initialize ambient particles
    const ambient: AmbientParticle[] = [];
    for (let i = 0; i < 30; i++) {
      ambient.push({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        radius: 0.5 + Math.random() * 1.5,
        alpha: 0.02 + Math.random() * 0.06,
      });
    }
    ambientRef.current = ambient;

    // Legend
    const types = [...new Set(nodes.map((n) => n.type))];
    setLegendTypes(types);
  }, [nodes, edges]);

  // Physics step
  const physicsStep = useCallback(
    (canvasW: number, canvasH: number) => {
      const simNodes = simNodesRef.current;
      const simEdges = simEdgesRef.current;

      // Repulsion between all pairs
      for (let i = 0; i < simNodes.length; i++) {
        for (let j = i + 1; j < simNodes.length; j++) {
          const a = simNodes[i];
          const b = simNodes[j];
          let dx = a.x - b.x;
          let dy = a.y - b.y;
          let dist = Math.sqrt(dx * dx + dy * dy) || 1;
          if (dist < 1) dist = 1;
          const force = REPULSION / (dist * dist);
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          if (!a.pinned) {
            a.vx += fx;
            a.vy += fy;
          }
          if (!b.pinned) {
            b.vx -= fx;
            b.vy -= fy;
          }
        }
      }

      // Attraction along edges
      for (const edge of simEdges) {
        const { source, target, weight } = edge;
        const dx = target.x - source.x;
        const dy = target.y - source.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = dist * ATTRACTION * (0.5 + weight * 0.5);
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        if (!source.pinned) {
          source.vx += fx;
          source.vy += fy;
        }
        if (!target.pinned) {
          target.vx -= fx;
          target.vy -= fy;
        }
      }

      // Center pull & velocity update
      const centerX = canvasW / 2;
      const centerY = canvasH / 2;
      for (const node of simNodes) {
        if (node.pinned) continue;
        node.vx += (centerX - node.x) * CENTER_PULL;
        node.vy += (centerY - node.y) * CENTER_PULL;
        node.vx *= DAMPING;
        node.vy *= DAMPING;
        node.x += node.vx;
        node.y += node.vy;
        // Bounds
        const margin = node.radius + 5;
        node.x = Math.max(margin, Math.min(canvasW - margin, node.x));
        node.y = Math.max(margin, Math.min(canvasH - margin, node.y));
      }

      // Update edge particles
      for (const edge of simEdges) {
        for (const p of edge.particles) {
          p.t += p.speed;
          if (p.t > 1) p.t -= 1;
        }
      }

      // Update ambient particles
      for (const p of ambientRef.current) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0) p.x = canvasW;
        if (p.x > canvasW) p.x = 0;
        if (p.y < 0) p.y = canvasH;
        if (p.y > canvasH) p.y = 0;
      }
    },
    [],
  );

  // Find node at mouse position
  const findNodeAt = useCallback((mx: number, my: number): SimNode | null => {
    const simNodes = simNodesRef.current;
    for (let i = simNodes.length - 1; i >= 0; i--) {
      const n = simNodes[i];
      const dx = mx - n.x;
      const dy = my - n.y;
      if (dx * dx + dy * dy <= (n.radius + 4) * (n.radius + 4)) {
        return n;
      }
    }
    return null;
  }, []);

  // Mouse handlers
  const getCanvasCoords = useCallback(
    (e: MouseEvent | React.MouseEvent): { x: number; y: number } => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
    },
    [],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleMouseMove = (e: MouseEvent) => {
      const coords = getCanvasCoords(e);
      mouseRef.current = coords;

      if (dragRef.current.node) {
        dragRef.current.node.x = coords.x + dragRef.current.offsetX;
        dragRef.current.node.y = coords.y + dragRef.current.offsetY;
        canvas.style.cursor = "grabbing";
        return;
      }

      const node = findNodeAt(coords.x, coords.y);
      hoveredRef.current = node;
      canvas.style.cursor = node ? "grab" : "default";
    };

    const handleMouseDown = (e: MouseEvent) => {
      const coords = getCanvasCoords(e);
      const node = findNodeAt(coords.x, coords.y);
      if (node) {
        dragRef.current = {
          node,
          offsetX: node.x - coords.x,
          offsetY: node.y - coords.y,
        };
        node.pinned = true;
        canvas.style.cursor = "grabbing";
      }
    };

    const handleMouseUp = () => {
      if (dragRef.current.node) {
        dragRef.current.node.pinned = false;
        dragRef.current.node = null;
        canvas.style.cursor = "default";
      }
    };

    const handleMouseLeave = () => {
      mouseRef.current = { x: -1000, y: -1000 };
      hoveredRef.current = null;
      if (dragRef.current.node) {
        dragRef.current.node.pinned = false;
        dragRef.current.node = null;
      }
    };

    canvas.addEventListener("mousemove", handleMouseMove);
    canvas.addEventListener("mousedown", handleMouseDown);
    canvas.addEventListener("mouseup", handleMouseUp);
    canvas.addEventListener("mouseleave", handleMouseLeave);

    return () => {
      canvas.removeEventListener("mousemove", handleMouseMove);
      canvas.removeEventListener("mousedown", handleMouseDown);
      canvas.removeEventListener("mouseup", handleMouseUp);
      canvas.removeEventListener("mouseleave", handleMouseLeave);
    };
  }, [getCanvasCoords, findNodeAt]);

  // Main animation loop
  useEffect(() => {
    initSimulation();

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let running = true;

    const resizeCanvas = () => {
      const container = containerRef.current;
      if (!container || !canvas) return;
      const dpr = window.devicePixelRatio || 1;
      const w = container.clientWidth;
      const h = CANVAS_HEIGHT;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);

    const render = (timestamp: number) => {
      if (!running) return;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;

      physicsStep(w, h);

      // Draw background
      drawBackground(ctx, w, h, timestamp, ambientRef.current);

      // Determine highlighted edges (connected to hovered node)
      const hovered = hoveredRef.current;
      const highlightedEdgeSet = new Set<SimEdge>();
      if (hovered) {
        for (const edge of simEdgesRef.current) {
          if (edge.source === hovered || edge.target === hovered) {
            highlightedEdgeSet.add(edge);
          }
        }
      }

      // Draw edges
      for (const edge of simEdgesRef.current) {
        drawEdge(ctx, edge, timestamp, highlightedEdgeSet.has(edge));
      }

      // Draw nodes
      for (const node of simNodesRef.current) {
        drawNode(ctx, node, timestamp, node === hovered);
      }

      // Tooltip
      if (hovered && !dragRef.current.node) {
        drawTooltip(ctx, hovered, w);
      }

      animRef.current = requestAnimationFrame(render);
    };

    animRef.current = requestAnimationFrame(render);

    return () => {
      running = false;
      cancelAnimationFrame(animRef.current);
      window.removeEventListener("resize", resizeCanvas);
    };
  }, [initSimulation, physicsStep]);

  // ---------------------------------------------------------------------------
  // Legend rendering helper
  // ---------------------------------------------------------------------------

  const renderLegendItem = (type: string) => {
    const color = nodeColor(type);
    const label = NODE_TYPE_LABELS[type] ?? type;
    let shapeEl: React.ReactNode;

    switch (type) {
      case "threat_actor":
        shapeEl = (
          <svg width="12" height="12" viewBox="0 0 12 12">
            <polygon
              points="6,1 11,4.5 9.5,10 2.5,10 1,4.5"
              fill={color}
              opacity={0.8}
            />
          </svg>
        );
        break;
      case "marketplace":
        shapeEl = (
          <svg width="12" height="12" viewBox="0 0 12 12">
            <polygon
              points="6,1 10.5,3.5 10.5,8.5 6,11 1.5,8.5 1.5,3.5"
              fill={color}
              opacity={0.8}
            />
          </svg>
        );
        break;
      case "tool":
      case "malware":
        shapeEl = (
          <svg width="12" height="12" viewBox="0 0 12 12">
            <polygon points="6,1 11,10 1,10" fill={color} opacity={0.8} />
          </svg>
        );
        break;
      case "financial":
      case "mule_network":
      case "credential":
        shapeEl = (
          <svg width="12" height="12" viewBox="0 0 12 12">
            <polygon
              points="6,1 10,6 6,11 2,6"
              fill={type === "credential" ? "none" : color}
              stroke={color}
              strokeWidth={1.5}
              opacity={0.8}
            />
          </svg>
        );
        break;
      case "device":
      case "exfil":
        shapeEl = (
          <svg width="12" height="12" viewBox="0 0 12 12">
            <rect
              x="1"
              y="2"
              width="10"
              height="8"
              rx="2"
              fill={color}
              opacity={0.6}
            />
          </svg>
        );
        break;
      case "evidence":
        shapeEl = (
          <svg width="12" height="12" viewBox="0 0 12 12">
            <path d="M3,1 L9,1 L9,9 Q6,8 3,9 Z" fill={color} opacity={0.7} />
          </svg>
        );
        break;
      case "suspicious":
        shapeEl = (
          <svg width="12" height="12" viewBox="0 0 12 12">
            <circle
              cx="6"
              cy="6"
              r="4.5"
              fill="none"
              stroke={color}
              strokeWidth={1.5}
              strokeDasharray="2,2"
              opacity={0.8}
            />
          </svg>
        );
        break;
      case "bot_network":
        shapeEl = (
          <svg width="12" height="12" viewBox="0 0 12 12">
            <circle cx="6" cy="3" r="2" fill={color} opacity={0.8} />
            <circle cx="3" cy="9" r="2" fill={color} opacity={0.6} />
            <circle cx="9" cy="9" r="2" fill={color} opacity={0.6} />
          </svg>
        );
        break;
      default:
        shapeEl = (
          <svg width="12" height="12" viewBox="0 0 12 12">
            <circle cx="6" cy="6" r="5" fill={color} opacity={0.7} />
          </svg>
        );
        break;
    }

    return (
      <div
        key={type}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "4px",
          fontSize: "10px",
          color: "#94a3b8",
          whiteSpace: "nowrap",
        }}
      >
        {shapeEl}
        <span>{label}</span>
      </div>
    );
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        background: BG_COLOR,
        borderRadius: "8px",
        overflow: "hidden",
        border: "1px solid rgba(148,163,184,0.1)",
      }}
    >
      {title && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "12px 16px 0 16px",
            color: "#e2e8f0",
            fontSize: "13px",
            fontWeight: 600,
            fontFamily: '"Inter", system-ui, sans-serif',
          }}
        >
          <Network size={16} style={{ color: "#60a5fa" }} />
          <span>{title}</span>
        </div>
      )}

      <canvas
        ref={canvasRef}
        style={{
          display: "block",
          width: "100%",
          height: `${CANVAS_HEIGHT}px`,
        }}
      />

      {legendTypes.length > 0 && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "10px",
            padding: "8px 16px 12px 16px",
            fontFamily: '"Inter", system-ui, sans-serif',
          }}
        >
          {legendTypes.map((type) => renderLegendItem(type))}
        </div>
      )}
    </div>
  );
};

export default CaseEvidenceGraph;
