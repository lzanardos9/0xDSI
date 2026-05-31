import React, { useRef, useEffect, useState, useCallback } from "react";
import { Shield, Activity, Clock, AlertTriangle } from "lucide-react";

interface ResponseDecision {
  decision_id: string;
  action: string;
  trigger_type: string;
  risk_score: number;
  outcome: string;
  response_time_ms: number;
  responded_by: string;
  created_at: string;
}

interface Props {
  decisions: ResponseDecision[];
}

const ACTION_COLORS: Record<string, string> = {
  block: "#f87171",
  freeze_account: "#fb923c",
  step_up_auth: "#fbbf24",
  alert_soc: "#22d3ee",
  delay: "#a78bfa",
  allow: "#34d399",
};

const CANVAS_BG = "#080c16";
const GRID_COLOR = "rgba(255,255,255,0.06)";
const AXIS_COLOR = "rgba(255,255,255,0.25)";
const TEXT_COLOR = "rgba(255,255,255,0.6)";
const LABEL_COLOR = "rgba(255,255,255,0.45)";

const PADDING = { top: 28, right: 24, bottom: 32, left: 56 };
const SCATTER_HEIGHT = 200;
const HEATMAP_HEIGHT = 200;
const TOTAL_HEIGHT = SCATTER_HEIGHT + HEATMAP_HEIGHT;

interface DotState {
  x: number;
  y: number;
  opacity: number;
  targetOpacity: number;
  radius: number;
  color: string;
  decision: ResponseDecision;
  pulsePhase: number;
}

interface ConnectionLine {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  opacity: number;
  targetOpacity: number;
  color: string;
}

interface HeatmapCell {
  col: number;
  row: number;
  value: number;
  maxValue: number;
  fillProgress: number;
  count: number;
}

function formatTime(date: Date): string {
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function formatDate(date: Date): string {
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${m}/${d}`;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * Math.min(t, 1);
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

const ResponseTimelineGraph: React.FC<Props> = ({ decisions }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animFrameRef = useRef<number>(0);
  const dotsRef = useRef<DotState[]>([]);
  const linesRef = useRef<ConnectionLine[]>([]);
  const heatmapRef = useRef<HeatmapCell[]>([]);
  const startTimeRef = useRef<number>(0);
  const mouseRef = useRef<{ x: number; y: number } | null>(null);
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    decision: ResponseDecision;
  } | null>(null);
  const [canvasWidth, setCanvasWidth] = useState(900);

  const sortedDecisions = React.useMemo(() => {
    return [...decisions].sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
  }, [decisions]);

  const timeRange = React.useMemo(() => {
    if (sortedDecisions.length === 0)
      return { min: Date.now() - 3600000, max: Date.now() };
    const times = sortedDecisions.map((d) => new Date(d.created_at).getTime());
    const min = Math.min(...times);
    const max = Math.max(...times);
    const pad = Math.max((max - min) * 0.05, 60000);
    return { min: min - pad, max: max + pad };
  }, [sortedDecisions]);

  const actionTypes = React.useMemo(() => {
    const set = new Set<string>();
    for (const d of sortedDecisions) set.add(d.action);
    const order = [
      "block",
      "freeze_account",
      "step_up_auth",
      "alert_soc",
      "delay",
      "allow",
    ];
    return order.filter((a) => set.has(a));
  }, [sortedDecisions]);

  const stats = React.useMemo(() => {
    if (decisions.length === 0)
      return { total: 0, avgRisk: 0, avgResponse: 0, overridden: 0 };
    const total = decisions.length;
    const avgRisk = Math.round(
      decisions.reduce((s, d) => s + d.risk_score, 0) / total
    );
    const avgResponse = Math.round(
      decisions.reduce((s, d) => s + d.response_time_ms, 0) / total
    );
    const overridden = decisions.filter(
      (d) => d.outcome === "overridden"
    ).length;
    return { total, avgRisk, avgResponse, overridden };
  }, [decisions]);

  const mapScatterX = useCallback(
    (time: number, width: number): number => {
      const plotW = width - PADDING.left - PADDING.right;
      const t = (time - timeRange.min) / (timeRange.max - timeRange.min || 1);
      return PADDING.left + t * plotW;
    },
    [timeRange]
  );

  const mapScatterY = useCallback((riskScore: number): number => {
    const plotH = SCATTER_HEIGHT - PADDING.top - PADDING.bottom;
    return PADDING.top + plotH * (1 - riskScore / 100);
  }, []);

  // Build dots, lines, heatmap when data or width changes
  useEffect(() => {
    startTimeRef.current = performance.now();

    // Build dots
    const dots: DotState[] = sortedDecisions.map((d, i) => {
      const time = new Date(d.created_at).getTime();
      return {
        x: mapScatterX(time, canvasWidth),
        y: mapScatterY(d.risk_score),
        opacity: 0,
        targetOpacity: 1,
        radius: d.outcome === "overridden" ? 6 : 4.5,
        color: ACTION_COLORS[d.action] || "#888",
        decision: d,
        pulsePhase: i * 0.7,
      };
    });
    dotsRef.current = dots;

    // Build connection lines (same trigger_type within 5 min)
    const lines: ConnectionLine[] = [];
    for (let i = 0; i < sortedDecisions.length; i++) {
      for (let j = i + 1; j < sortedDecisions.length; j++) {
        const a = sortedDecisions[i];
        const b = sortedDecisions[j];
        if (a.trigger_type !== b.trigger_type) continue;
        const ta = new Date(a.created_at).getTime();
        const tb = new Date(b.created_at).getTime();
        if (Math.abs(tb - ta) > 5 * 60 * 1000) break;
        lines.push({
          fromX: dots[i].x,
          fromY: dots[i].y,
          toX: dots[j].x,
          toY: dots[j].y,
          opacity: 0,
          targetOpacity: 0.25,
          color: ACTION_COLORS[a.action] || "#888",
        });
      }
    }
    linesRef.current = lines;

    // Build heatmap
    const numBins = Math.max(
      1,
      Math.min(24, Math.ceil(sortedDecisions.length / 2))
    );
    const binWidth = (timeRange.max - timeRange.min) / numBins;
    const cellMap: Record<string, { total: number; count: number }> = {};
    for (const d of sortedDecisions) {
      const t = new Date(d.created_at).getTime();
      const col = Math.min(
        numBins - 1,
        Math.floor((t - timeRange.min) / binWidth)
      );
      const row = actionTypes.indexOf(d.action);
      if (row < 0) continue;
      const key = `${col}_${row}`;
      if (!cellMap[key]) cellMap[key] = { total: 0, count: 0 };
      cellMap[key].total += d.response_time_ms;
      cellMap[key].count += 1;
    }

    let maxAvg = 0;
    const cells: HeatmapCell[] = [];
    for (const [key, val] of Object.entries(cellMap)) {
      const [colStr, rowStr] = key.split("_");
      const avg = val.total / val.count;
      if (avg > maxAvg) maxAvg = avg;
      cells.push({
        col: parseInt(colStr),
        row: parseInt(rowStr),
        value: avg,
        maxValue: 0,
        fillProgress: 0,
        count: val.count,
      });
    }
    for (const c of cells) c.maxValue = maxAvg || 1;
    heatmapRef.current = cells;
  }, [
    sortedDecisions,
    canvasWidth,
    timeRange,
    actionTypes,
    mapScatterX,
    mapScatterY,
  ]);

  // Resize observer
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = entry.contentRect.width;
        if (w > 0) setCanvasWidth(Math.floor(w));
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Canvas rendering loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvasWidth * dpr;
    canvas.height = TOTAL_HEIGHT * dpr;
    canvas.style.width = `${canvasWidth}px`;
    canvas.style.height = `${TOTAL_HEIGHT}px`;
    ctx.scale(dpr, dpr);

    let running = true;

    const numBins = Math.max(
      1,
      Math.min(24, Math.ceil(sortedDecisions.length / 2))
    );

    function drawGrid(
      ctx: CanvasRenderingContext2D,
      yOffset: number,
      height: number
    ) {
      const plotX = PADDING.left;
      const plotW = canvasWidth - PADDING.left - PADDING.right;
      const plotY = yOffset + PADDING.top;
      const plotH = height - PADDING.top - PADDING.bottom;

      ctx.strokeStyle = GRID_COLOR;
      ctx.lineWidth = 1;
      for (let i = 0; i <= 5; i++) {
        const y = plotY + (plotH / 5) * i;
        ctx.beginPath();
        ctx.moveTo(plotX, y);
        ctx.lineTo(plotX + plotW, y);
        ctx.stroke();
      }
      for (let i = 0; i <= 6; i++) {
        const x = plotX + (plotW / 6) * i;
        ctx.beginPath();
        ctx.moveTo(x, plotY);
        ctx.lineTo(x, plotY + plotH);
        ctx.stroke();
      }
    }

    function drawScatterAxes(ctx: CanvasRenderingContext2D) {
      const plotX = PADDING.left;
      const plotW = canvasWidth - PADDING.left - PADDING.right;
      const plotY = PADDING.top;
      const plotH = SCATTER_HEIGHT - PADDING.top - PADDING.bottom;

      // Y-axis labels (risk score)
      ctx.fillStyle = LABEL_COLOR;
      ctx.font = "10px monospace";
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      for (let i = 0; i <= 5; i++) {
        const val = Math.round((i / 5) * 100);
        const y = plotY + plotH - (plotH / 5) * i;
        ctx.fillText(String(val), plotX - 8, y);
      }

      // Y-axis title
      ctx.save();
      ctx.translate(12, plotY + plotH / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.textAlign = "center";
      ctx.fillStyle = TEXT_COLOR;
      ctx.font = "10px monospace";
      ctx.fillText("RISK", 0, 0);
      ctx.restore();

      // X-axis labels (time)
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillStyle = LABEL_COLOR;
      ctx.font = "9px monospace";
      for (let i = 0; i <= 6; i++) {
        const t = timeRange.min + ((timeRange.max - timeRange.min) / 6) * i;
        const date = new Date(t);
        const x = plotX + (plotW / 6) * i;
        ctx.fillText(formatTime(date), x, SCATTER_HEIGHT - PADDING.bottom + 4);
        ctx.fillText(
          formatDate(date),
          x,
          SCATTER_HEIGHT - PADDING.bottom + 16
        );
      }

      // Axes lines
      ctx.strokeStyle = AXIS_COLOR;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(plotX, plotY);
      ctx.lineTo(plotX, plotY + plotH);
      ctx.lineTo(plotX + plotW, plotY + plotH);
      ctx.stroke();
    }

    function drawHeatmapAxes(ctx: CanvasRenderingContext2D) {
      const yOffset = SCATTER_HEIGHT;
      const plotX = PADDING.left;
      const plotW = canvasWidth - PADDING.left - PADDING.right;
      const plotY = yOffset + PADDING.top;
      const plotH = HEATMAP_HEIGHT - PADDING.top - PADDING.bottom;

      // Y-axis labels (action types)
      ctx.fillStyle = LABEL_COLOR;
      ctx.font = "9px monospace";
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      const rowH = actionTypes.length > 0 ? plotH / actionTypes.length : plotH;
      for (let i = 0; i < actionTypes.length; i++) {
        const y = plotY + rowH * i + rowH / 2;
        const label = actionTypes[i].replace(/_/g, " ").toUpperCase();
        ctx.fillStyle = ACTION_COLORS[actionTypes[i]] || LABEL_COLOR;
        ctx.fillText(label, plotX - 6, y);
      }

      // X-axis labels
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillStyle = LABEL_COLOR;
      ctx.font = "9px monospace";
      const tickCount = Math.min(numBins, 8);
      for (let i = 0; i <= tickCount; i++) {
        const t =
          timeRange.min +
          ((timeRange.max - timeRange.min) / tickCount) * i;
        const date = new Date(t);
        const x = plotX + (plotW / tickCount) * i;
        ctx.fillText(
          formatTime(date),
          x,
          yOffset + HEATMAP_HEIGHT - PADDING.bottom + 4
        );
      }

      // Y-axis title
      ctx.save();
      ctx.translate(12, plotY + plotH / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.textAlign = "center";
      ctx.fillStyle = TEXT_COLOR;
      ctx.font = "10px monospace";
      ctx.fillText("ACTION", 0, 0);
      ctx.restore();

      // Section divider
      ctx.strokeStyle = "rgba(255,255,255,0.1)";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(PADDING.left, yOffset);
      ctx.lineTo(canvasWidth - PADDING.right, yOffset);
      ctx.stroke();
      ctx.setLineDash([]);

      // Axes lines
      ctx.strokeStyle = AXIS_COLOR;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(plotX, plotY);
      ctx.lineTo(plotX, plotY + plotH);
      ctx.lineTo(plotX + plotW, plotY + plotH);
      ctx.stroke();
    }

    function render() {
      if (!running || !ctx) return;
      const now = performance.now();
      const elapsed = (now - startTimeRef.current) / 1000;

      // Clear
      ctx.fillStyle = CANVAS_BG;
      ctx.fillRect(0, 0, canvasWidth, TOTAL_HEIGHT);

      // Section labels
      ctx.fillStyle = TEXT_COLOR;
      ctx.font = "bold 11px monospace";
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText("DECISION SCATTER", PADDING.left + 4, 6);
      ctx.fillText("RESPONSE TIME HEATMAP", PADDING.left + 4, SCATTER_HEIGHT + 6);

      // Grids
      drawGrid(ctx, 0, SCATTER_HEIGHT);
      drawGrid(ctx, SCATTER_HEIGHT, HEATMAP_HEIGHT);

      // Axes
      drawScatterAxes(ctx);
      drawHeatmapAxes(ctx);

      // Animate connection lines
      const lines = linesRef.current;
      for (const line of lines) {
        line.opacity = lerp(line.opacity, line.targetOpacity, 0.03);
        if (line.opacity < 0.01) continue;
        ctx.strokeStyle = hexToRgba(line.color, line.opacity);
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(line.fromX, line.fromY);
        ctx.lineTo(line.toX, line.toY);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Animate dots
      const dots = dotsRef.current;
      for (let i = 0; i < dots.length; i++) {
        const dot = dots[i];
        const delay = i * 0.06;
        if (elapsed < delay) continue;

        dot.opacity = lerp(dot.opacity, dot.targetOpacity, 0.08);

        const isOverridden = dot.decision.outcome === "overridden";
        let r = dot.radius;
        if (isOverridden) {
          const pulse = Math.sin(now * 0.004 + dot.pulsePhase) * 0.5 + 0.5;
          r = dot.radius + pulse * 3;
          // Pulsing glow
          ctx.beginPath();
          ctx.arc(dot.x, dot.y, r + 4, 0, Math.PI * 2);
          ctx.fillStyle = hexToRgba(dot.color, dot.opacity * pulse * 0.15);
          ctx.fill();
        }

        // Shadow/glow
        ctx.beginPath();
        ctx.arc(dot.x, dot.y, r + 2, 0, Math.PI * 2);
        ctx.fillStyle = hexToRgba(dot.color, dot.opacity * 0.2);
        ctx.fill();

        // Dot
        ctx.beginPath();
        ctx.arc(dot.x, dot.y, r, 0, Math.PI * 2);
        ctx.fillStyle = hexToRgba(dot.color, dot.opacity);
        ctx.fill();

        // Overridden ring
        if (isOverridden) {
          ctx.strokeStyle = hexToRgba("#ffffff", dot.opacity * 0.6);
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(dot.x, dot.y, r + 1, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      // Animate heatmap cells
      const cells = heatmapRef.current;
      const yOffset = SCATTER_HEIGHT;
      const plotX = PADDING.left;
      const plotW = canvasWidth - PADDING.left - PADDING.right;
      const plotY = yOffset + PADDING.top;
      const plotH = HEATMAP_HEIGHT - PADDING.top - PADDING.bottom;
      const rowH = actionTypes.length > 0 ? plotH / actionTypes.length : plotH;
      const colW = numBins > 0 ? plotW / numBins : plotW;

      for (const cell of cells) {
        cell.fillProgress = lerp(cell.fillProgress, 1, 0.04);
        const intensity = (cell.value / cell.maxValue) * cell.fillProgress;
        const actionName = actionTypes[cell.row];
        const baseColor = ACTION_COLORS[actionName] || "#888";
        const alpha = 0.15 + intensity * 0.75;

        const cx = plotX + cell.col * colW;
        const cy = plotY + cell.row * rowH;
        const cw = colW - 1;
        const ch = rowH - 1;

        ctx.fillStyle = hexToRgba(baseColor, alpha * cell.fillProgress);
        ctx.fillRect(cx + 0.5, cy + 0.5, cw, ch);

        // Border
        ctx.strokeStyle = hexToRgba(baseColor, 0.15);
        ctx.lineWidth = 0.5;
        ctx.strokeRect(cx + 0.5, cy + 0.5, cw, ch);

        // Cell value text
        if (cw > 28 && ch > 14 && cell.fillProgress > 0.5) {
          ctx.fillStyle = `rgba(255,255,255,${0.5 * cell.fillProgress})`;
          ctx.font = "8px monospace";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(
            `${Math.round(cell.value)}ms`,
            cx + cw / 2,
            cy + ch / 2
          );
        }
      }

      // Hover highlight on scatter
      const mouse = mouseRef.current;
      if (mouse) {
        let hoveredDot: DotState | null = null;
        let minDist = 20;
        for (const dot of dots) {
          const dx = mouse.x - dot.x;
          const dy = mouse.y - dot.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < minDist) {
            minDist = dist;
            hoveredDot = dot;
          }
        }
        if (hoveredDot) {
          // Highlight ring
          ctx.beginPath();
          ctx.arc(hoveredDot.x, hoveredDot.y, hoveredDot.radius + 5, 0, Math.PI * 2);
          ctx.strokeStyle = "rgba(255,255,255,0.5)";
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      }

      animFrameRef.current = requestAnimationFrame(render);
    }

    animFrameRef.current = requestAnimationFrame(render);

    return () => {
      running = false;
      cancelAnimationFrame(animFrameRef.current);
    };
  }, [
    canvasWidth,
    sortedDecisions,
    timeRange,
    actionTypes,
  ]);

  // Mouse move handler
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      mouseRef.current = { x, y };

      // Check dot proximity
      let found: DotState | null = null;
      let minDist = 20;
      for (const dot of dotsRef.current) {
        const dx = x - dot.x;
        const dy = y - dot.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < minDist) {
          minDist = dist;
          found = dot;
        }
      }

      if (found) {
        setTooltip({
          x: e.clientX - (containerRef.current?.getBoundingClientRect().left ?? 0),
          y: e.clientY - (containerRef.current?.getBoundingClientRect().top ?? 0),
          decision: found.decision,
        });
      } else {
        setTooltip(null);
      }
    },
    []
  );

  const handleMouseLeave = useCallback(() => {
    mouseRef.current = null;
    setTooltip(null);
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        position: "relative",
        width: "100%",
        height: `${TOTAL_HEIGHT}px`,
        background: CANVAS_BG,
        borderRadius: "8px",
        overflow: "hidden",
        fontFamily: "monospace",
      }}
    >
      <canvas
        ref={canvasRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        style={{
          display: "block",
          width: "100%",
          height: `${TOTAL_HEIGHT}px`,
          cursor: tooltip ? "crosshair" : "default",
        }}
      />

      {/* Stats overlay */}
      <div
        style={{
          position: "absolute",
          top: 4,
          right: 8,
          display: "flex",
          gap: "14px",
          alignItems: "center",
          padding: "4px 10px",
          background: "rgba(8,12,22,0.85)",
          borderRadius: "6px",
          border: "1px solid rgba(255,255,255,0.08)",
          fontSize: "10px",
          color: TEXT_COLOR,
          pointerEvents: "none",
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <Shield size={11} color="#34d399" />
          <span style={{ color: "#e2e8f0" }}>{stats.total}</span> decisions
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <Activity size={11} color="#fbbf24" />
          avg risk{" "}
          <span style={{ color: "#e2e8f0" }}>{stats.avgRisk}</span>
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <Clock size={11} color="#22d3ee" />
          avg{" "}
          <span style={{ color: "#e2e8f0" }}>{stats.avgResponse}ms</span>
        </span>
        {stats.overridden > 0 && (
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <AlertTriangle size={11} color="#f87171" />
            <span style={{ color: "#f87171" }}>{stats.overridden}</span>{" "}
            overridden
          </span>
        )}
      </div>

      {/* Legend */}
      <div
        style={{
          position: "absolute",
          bottom: 4,
          right: 8,
          display: "flex",
          gap: "10px",
          flexWrap: "wrap",
          padding: "4px 10px",
          background: "rgba(8,12,22,0.85)",
          borderRadius: "6px",
          border: "1px solid rgba(255,255,255,0.08)",
          fontSize: "9px",
          color: LABEL_COLOR,
          pointerEvents: "none",
        }}
      >
        {Object.entries(ACTION_COLORS).map(([action, color]) => (
          <span
            key={action}
            style={{ display: "flex", alignItems: "center", gap: 4 }}
          >
            <span
              style={{
                display: "inline-block",
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: color,
                flexShrink: 0,
              }}
            />
            {action.replace(/_/g, " ")}
          </span>
        ))}
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          style={{
            position: "absolute",
            left: Math.min(tooltip.x + 12, canvasWidth - 220),
            top: Math.min(tooltip.y - 10, TOTAL_HEIGHT - 130),
            background: "rgba(10,15,30,0.95)",
            border: `1px solid ${ACTION_COLORS[tooltip.decision.action] || "#555"}`,
            borderRadius: "6px",
            padding: "8px 12px",
            fontSize: "10px",
            color: "#e2e8f0",
            pointerEvents: "none",
            zIndex: 10,
            minWidth: "180px",
            boxShadow: `0 4px 20px rgba(0,0,0,0.5), 0 0 8px ${hexToRgba(ACTION_COLORS[tooltip.decision.action] || "#555", 0.3)}`,
          }}
        >
          <div
            style={{
              fontWeight: "bold",
              color: ACTION_COLORS[tooltip.decision.action] || "#ccc",
              marginBottom: 4,
              textTransform: "uppercase",
              letterSpacing: "0.5px",
            }}
          >
            {tooltip.decision.action.replace(/_/g, " ")}
          </div>
          <div style={{ opacity: 0.7, marginBottom: 2 }}>
            ID: {tooltip.decision.decision_id}
          </div>
          <div>
            Trigger:{" "}
            <span style={{ color: "#94a3b8" }}>
              {tooltip.decision.trigger_type}
            </span>
          </div>
          <div>
            Risk:{" "}
            <span
              style={{
                color:
                  tooltip.decision.risk_score > 70
                    ? "#f87171"
                    : tooltip.decision.risk_score > 40
                      ? "#fbbf24"
                      : "#34d399",
              }}
            >
              {tooltip.decision.risk_score}
            </span>
          </div>
          <div>
            Outcome:{" "}
            <span
              style={{
                color:
                  tooltip.decision.outcome === "overridden"
                    ? "#f87171"
                    : "#94a3b8",
              }}
            >
              {tooltip.decision.outcome}
            </span>
          </div>
          <div>
            Response:{" "}
            <span style={{ color: "#22d3ee" }}>
              {tooltip.decision.response_time_ms}ms
            </span>
          </div>
          <div>
            By:{" "}
            <span style={{ color: "#94a3b8" }}>
              {tooltip.decision.responded_by}
            </span>
          </div>
          <div style={{ opacity: 0.5, marginTop: 2 }}>
            {new Date(tooltip.decision.created_at).toLocaleString()}
          </div>
        </div>
      )}
    </div>
  );
};

export default ResponseTimelineGraph;
