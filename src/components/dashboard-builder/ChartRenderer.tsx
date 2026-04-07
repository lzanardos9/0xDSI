import { useRef, useEffect, useCallback } from 'react';
import type { ChartType, ChartConfig } from '../../lib/dashboardSchema';

interface ChartRendererProps {
  chartType: ChartType;
  data: any[];
  config: ChartConfig;
  width: number;
  height: number;
  title?: string;
}

const DEFAULT_COLORS = [
  '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
  '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1',
];

function getColor(index: number, config: ChartConfig): string {
  const colors = config.colors && config.colors.length > 0 ? config.colors : DEFAULT_COLORS;
  return colors[index % colors.length];
}

function drawLine(
  ctx: CanvasRenderingContext2D,
  data: any[],
  config: ChartConfig,
  area: { x: number; y: number; w: number; h: number }
) {
  if (data.length === 0) return;

  const keys = Object.keys(data[0]).filter(k => k !== 'label' && k !== 'time' && k !== 'time_bucket' && k !== 'category');
  const labelKey = Object.keys(data[0]).find(k => k === 'label' || k === 'time' || k === 'time_bucket' || k === 'category') || Object.keys(data[0])[0];
  const valueKeys = keys.length > 0 ? keys : [Object.keys(data[0])[1] || Object.keys(data[0])[0]];

  let allValues: number[] = [];
  for (const key of valueKeys) {
    for (const d of data) {
      const v = Number(d[key]);
      if (!isNaN(v)) allValues.push(v);
    }
  }
  if (allValues.length === 0) return;

  const minVal = Math.min(0, ...allValues);
  const maxVal = Math.max(...allValues) * 1.1 || 1;

  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(area.x, area.y + area.h);
  ctx.lineTo(area.x + area.w, area.y + area.h);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(area.x, area.y);
  ctx.lineTo(area.x, area.y + area.h);
  ctx.stroke();

  const gridLines = 4;
  ctx.fillStyle = '#64748B';
  ctx.font = '10px system-ui';
  ctx.textAlign = 'right';
  for (let i = 0; i <= gridLines; i++) {
    const y = area.y + area.h - (i / gridLines) * area.h;
    const val = minVal + (i / gridLines) * (maxVal - minVal);
    ctx.strokeStyle = '#1E293B';
    ctx.beginPath();
    ctx.moveTo(area.x, y);
    ctx.lineTo(area.x + area.w, y);
    ctx.stroke();
    ctx.fillText(formatNumber(val), area.x - 4, y + 3);
  }

  for (let ki = 0; ki < valueKeys.length; ki++) {
    const key = valueKeys[ki];
    const color = getColor(ki, config);

    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    if (config.smooth) {
      ctx.lineJoin = 'round';
    }

    ctx.beginPath();
    let firstPoint = true;
    const points: { x: number; y: number }[] = [];

    for (let i = 0; i < data.length; i++) {
      const v = Number(data[i][key]);
      if (isNaN(v)) continue;
      const px = area.x + (i / Math.max(data.length - 1, 1)) * area.w;
      const py = area.y + area.h - ((v - minVal) / (maxVal - minVal)) * area.h;
      points.push({ x: px, y: py });
      if (firstPoint) {
        ctx.moveTo(px, py);
        firstPoint = false;
      } else {
        ctx.lineTo(px, py);
      }
    }
    ctx.stroke();

    if (config.fill) {
      ctx.fillStyle = color + '30';
      ctx.beginPath();
      if (points.length > 0) {
        ctx.moveTo(points[0].x, area.y + area.h);
        for (const p of points) ctx.lineTo(p.x, p.y);
        ctx.lineTo(points[points.length - 1].x, area.y + area.h);
        ctx.closePath();
        ctx.fill();
      }
    }

    for (const p of points) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.fillStyle = '#94A3B8';
  ctx.font = '9px system-ui';
  ctx.textAlign = 'center';
  const labelStep = Math.max(1, Math.floor(data.length / 6));
  for (let i = 0; i < data.length; i += labelStep) {
    const px = area.x + (i / Math.max(data.length - 1, 1)) * area.w;
    const label = String(data[i][labelKey] || i).substring(0, 12);
    ctx.fillText(label, px, area.y + area.h + 14);
  }
}

function drawBar(
  ctx: CanvasRenderingContext2D,
  data: any[],
  config: ChartConfig,
  area: { x: number; y: number; w: number; h: number },
  stacked = false
) {
  if (data.length === 0) return;

  const keys = Object.keys(data[0]);
  const labelKey = keys.find(k => typeof data[0][k] === 'string') || keys[0];
  const valueKeys = keys.filter(k => k !== labelKey && typeof data[0][k] === 'number');
  if (valueKeys.length === 0) {
    const numKey = keys.find(k => !isNaN(Number(data[0][k])) && k !== labelKey);
    if (numKey) valueKeys.push(numKey);
  }
  if (valueKeys.length === 0) return;

  let maxVal = 0;
  if (stacked) {
    for (const d of data) {
      let sum = 0;
      for (const k of valueKeys) sum += Math.abs(Number(d[k]) || 0);
      maxVal = Math.max(maxVal, sum);
    }
  } else {
    for (const d of data) {
      for (const k of valueKeys) maxVal = Math.max(maxVal, Math.abs(Number(d[k]) || 0));
    }
  }
  maxVal = maxVal * 1.1 || 1;

  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(area.x, area.y + area.h);
  ctx.lineTo(area.x + area.w, area.y + area.h);
  ctx.stroke();

  const gridLines = 4;
  ctx.fillStyle = '#64748B';
  ctx.font = '10px system-ui';
  ctx.textAlign = 'right';
  for (let i = 0; i <= gridLines; i++) {
    const y = area.y + area.h - (i / gridLines) * area.h;
    const val = (i / gridLines) * maxVal;
    ctx.strokeStyle = '#1E293B';
    ctx.beginPath();
    ctx.moveTo(area.x, y);
    ctx.lineTo(area.x + area.w, y);
    ctx.stroke();
    ctx.fillText(formatNumber(val), area.x - 4, y + 3);
  }

  const barGroupWidth = area.w / data.length;
  const gap = Math.max(2, barGroupWidth * 0.15);
  const barWidth = stacked
    ? barGroupWidth - gap
    : (barGroupWidth - gap) / valueKeys.length;

  for (let i = 0; i < data.length; i++) {
    let stackY = 0;
    for (let ki = 0; ki < valueKeys.length; ki++) {
      const v = Math.abs(Number(data[i][valueKeys[ki]]) || 0);
      const barH = (v / maxVal) * area.h;
      const color = getColor(ki, config);

      let bx: number, by: number;
      if (stacked) {
        bx = area.x + i * barGroupWidth + gap / 2;
        by = area.y + area.h - stackY - barH;
        stackY += barH;
      } else {
        bx = area.x + i * barGroupWidth + gap / 2 + ki * barWidth;
        by = area.y + area.h - barH;
      }

      ctx.fillStyle = color;
      const radius = Math.min(3, barWidth / 4);
      roundRect(ctx, bx, by, stacked ? barGroupWidth - gap : barWidth, barH, radius);
    }

    ctx.fillStyle = '#94A3B8';
    ctx.font = '9px system-ui';
    ctx.textAlign = 'center';
    const label = String(data[i][labelKey] || i).substring(0, 10);
    ctx.fillText(label, area.x + i * barGroupWidth + barGroupWidth / 2, area.y + area.h + 14);
  }
}

function drawPie(
  ctx: CanvasRenderingContext2D,
  data: any[],
  config: ChartConfig,
  area: { x: number; y: number; w: number; h: number },
  donut = false
) {
  if (data.length === 0) return;

  const keys = Object.keys(data[0]);
  const labelKey = keys.find(k => typeof data[0][k] === 'string') || keys[0];
  const valueKey = keys.find(k => typeof data[0][k] === 'number' && k !== labelKey) || keys[1];
  if (!valueKey) return;

  const total = data.reduce((sum, d) => sum + Math.abs(Number(d[valueKey]) || 0), 0);
  if (total === 0) return;

  const cx = area.x + area.w / 2;
  const cy = area.y + area.h / 2;
  const radius = Math.min(area.w, area.h) / 2 - 20;

  let startAngle = -Math.PI / 2;
  for (let i = 0; i < data.length; i++) {
    const v = Math.abs(Number(data[i][valueKey]) || 0);
    const sliceAngle = (v / total) * Math.PI * 2;
    const color = getColor(i, config);

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, radius, startAngle, startAngle + sliceAngle);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = '#0A1628';
    ctx.lineWidth = 2;
    ctx.stroke();

    if (sliceAngle > 0.2) {
      const midAngle = startAngle + sliceAngle / 2;
      const labelR = radius * 0.65;
      const lx = cx + Math.cos(midAngle) * labelR;
      const ly = cy + Math.sin(midAngle) * labelR;
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 10px system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${Math.round(v / total * 100)}%`, lx, ly);
    }

    startAngle += sliceAngle;
  }

  if (donut) {
    ctx.fillStyle = '#0A1628';
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 0.55, 0, Math.PI * 2);
    ctx.fill();
  }

  const legendX = area.x + 4;
  let legendY = area.y + 4;
  ctx.font = '10px system-ui';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  for (let i = 0; i < Math.min(data.length, 8); i++) {
    ctx.fillStyle = getColor(i, config);
    ctx.fillRect(legendX, legendY, 8, 8);
    ctx.fillStyle = '#CBD5E1';
    ctx.fillText(String(data[i][labelKey] || i).substring(0, 16), legendX + 12, legendY);
    legendY += 14;
  }
}

function drawGauge(
  ctx: CanvasRenderingContext2D,
  data: any[],
  config: ChartConfig,
  area: { x: number; y: number; w: number; h: number }
) {
  const value = data.length > 0 ? Number(Object.values(data[0])[0]) || 0 : 0;
  const max = config.yAxis?.max || 100;
  const pct = Math.min(Math.max(value / max, 0), 1);

  const cx = area.x + area.w / 2;
  const cy = area.y + area.h * 0.65;
  const radius = Math.min(area.w, area.h) * 0.4;

  const startAngle = Math.PI * 0.8;
  const endAngle = Math.PI * 2.2;

  ctx.strokeStyle = '#1E293B';
  ctx.lineWidth = 12;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(cx, cy, radius, startAngle, endAngle);
  ctx.stroke();

  let color = '#10B981';
  if (pct > 0.8) color = '#EF4444';
  else if (pct > 0.6) color = '#F59E0B';

  ctx.strokeStyle = color;
  ctx.lineWidth = 12;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(cx, cy, radius, startAngle, startAngle + (endAngle - startAngle) * pct);
  ctx.stroke();

  ctx.fillStyle = '#F1F5F9';
  ctx.font = `bold ${Math.max(16, radius * 0.4)}px system-ui`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(formatNumber(value), cx, cy);

  ctx.fillStyle = '#64748B';
  ctx.font = '11px system-ui';
  ctx.fillText(`/ ${formatNumber(max)}`, cx, cy + 20);
}

function drawHeatmap(
  ctx: CanvasRenderingContext2D,
  data: any[],
  config: ChartConfig,
  area: { x: number; y: number; w: number; h: number }
) {
  if (data.length === 0) return;

  const keys = Object.keys(data[0]);
  const xKey = keys[0];
  const yKey = keys[1];
  const vKey = keys[2] || keys[1];

  const xLabels = [...new Set(data.map(d => String(d[xKey])))];
  const yLabels = [...new Set(data.map(d => String(d[yKey])))];

  const cellW = area.w / Math.max(xLabels.length, 1);
  const cellH = area.h / Math.max(yLabels.length, 1);

  const values = data.map(d => Number(d[vKey]) || 0);
  const maxVal = Math.max(...values) || 1;

  for (const d of data) {
    const xi = xLabels.indexOf(String(d[xKey]));
    const yi = yLabels.indexOf(String(d[yKey]));
    const v = Number(d[vKey]) || 0;
    const intensity = v / maxVal;

    const r = Math.round(16 + intensity * 200);
    const g = Math.round(50 + (1 - intensity) * 120);
    const b = Math.round(100 - intensity * 60);
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(area.x + xi * cellW + 1, area.y + yi * cellH + 1, cellW - 2, cellH - 2);
  }
}

function drawScatter(
  ctx: CanvasRenderingContext2D,
  data: any[],
  config: ChartConfig,
  area: { x: number; y: number; w: number; h: number }
) {
  if (data.length === 0) return;

  const keys = Object.keys(data[0]).filter(k => !isNaN(Number(data[0][k])));
  if (keys.length < 2) return;

  const xKey = keys[0];
  const yKey = keys[1];

  const xVals = data.map(d => Number(d[xKey]));
  const yVals = data.map(d => Number(d[yKey]));
  const xMin = Math.min(...xVals);
  const xMax = Math.max(...xVals) || 1;
  const yMin = Math.min(...yVals);
  const yMax = Math.max(...yVals) || 1;

  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(area.x, area.y + area.h);
  ctx.lineTo(area.x + area.w, area.y + area.h);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(area.x, area.y);
  ctx.lineTo(area.x, area.y + area.h);
  ctx.stroke();

  for (let i = 0; i < data.length; i++) {
    const px = area.x + ((Number(data[i][xKey]) - xMin) / (xMax - xMin || 1)) * area.w;
    const py = area.y + area.h - ((Number(data[i][yKey]) - yMin) / (yMax - yMin || 1)) * area.h;
    const color = getColor(i % 5, config);

    ctx.fillStyle = color + '80';
    ctx.beginPath();
    ctx.arc(px, py, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  if (h <= 0 || w <= 0) return;
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x, y + h);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.fill();
}

function formatNumber(n: number): string {
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (Math.abs(n) >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(1);
}

export default function ChartRenderer({ chartType, data, config, width, height, title }: ChartRendererProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const padding = { top: 8, right: 16, bottom: 24, left: 48 };
    const area = {
      x: padding.left,
      y: padding.top,
      w: width - padding.left - padding.right,
      h: height - padding.top - padding.bottom,
    };

    if (!data || data.length === 0) {
      ctx.fillStyle = '#475569';
      ctx.font = '13px system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('No data available', width / 2, height / 2);
      return;
    }

    switch (chartType) {
      case 'line':
        drawLine(ctx, data, config, area);
        break;
      case 'area':
        drawLine(ctx, data, { ...config, fill: true }, area);
        break;
      case 'bar':
      case 'stacked_bar':
        drawBar(ctx, data, config, area, chartType === 'stacked_bar' || config.stacked);
        break;
      case 'pie':
        drawPie(ctx, data, config, { ...area, x: area.x - 20, w: area.w + 20 });
        break;
      case 'donut':
        drawPie(ctx, data, config, { ...area, x: area.x - 20, w: area.w + 20 }, true);
        break;
      case 'gauge':
        drawGauge(ctx, data, config, area);
        break;
      case 'heatmap':
        drawHeatmap(ctx, data, config, area);
        break;
      case 'scatter':
        drawScatter(ctx, data, config, area);
        break;
      case 'funnel': {
        const sorted = [...data].sort((a, b) => {
          const vk = Object.keys(a).find(k => typeof a[k] === 'number') || '';
          return (Number(b[vk]) || 0) - (Number(a[vk]) || 0);
        });
        drawBar(ctx, sorted, config, area);
        break;
      }
      case 'radar':
      case 'treemap':
      case 'stacked_area':
        drawLine(ctx, data, { ...config, fill: true, stacked: true }, area);
        break;
      default:
        drawBar(ctx, data, config, area);
    }
  }, [chartType, data, config, width, height]);

  useEffect(() => {
    draw();
  }, [draw]);

  return <canvas ref={canvasRef} className="block" />;
}
