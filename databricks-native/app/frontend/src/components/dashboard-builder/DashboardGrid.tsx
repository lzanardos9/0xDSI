import { useState, useCallback } from 'react';
import type { UniversalWidget } from '../../lib/dashboardSchema';
import WidgetCard from './WidgetCard';

interface DashboardGridProps {
  widgets: UniversalWidget[];
  columns?: number;
  rowHeight?: number;
  editing: boolean;
  onWidgetsChange?: (widgets: UniversalWidget[]) => void;
  onEditWidget?: (widget: UniversalWidget) => void;
}

export default function DashboardGrid({
  widgets,
  columns = 12,
  rowHeight = 80,
  editing,
  onWidgetsChange,
  onEditWidget,
}: DashboardGridProps) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<number | null>(null);

  const maxRow = widgets.reduce((max, w) => Math.max(max, (w.position.y || 0) + (w.position.h || 4)), 0);
  const gridRows = Math.max(maxRow + 2, 8);

  const handleDragStart = useCallback((index: number) => (e: React.DragEvent) => {
    setDragIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  const handleDragOver = useCallback((index: number) => (e: React.DragEvent) => {
    e.preventDefault();
    setDropTarget(index);
  }, []);

  const handleDrop = useCallback((targetIndex: number) => (_e: React.DragEvent) => {
    if (dragIndex === null || dragIndex === targetIndex || !onWidgetsChange) return;

    const newWidgets = [...widgets];
    const dragWidget = newWidgets[dragIndex];
    const targetWidget = newWidgets[targetIndex];

    const tempPos = { ...dragWidget.position };
    dragWidget.position = { ...targetWidget.position };
    targetWidget.position = tempPos;

    onWidgetsChange(newWidgets);
    setDragIndex(null);
    setDropTarget(null);
  }, [dragIndex, widgets, onWidgetsChange]);

  const handleRemove = useCallback((index: number) => {
    if (!onWidgetsChange) return;
    const newWidgets = widgets.filter((_, i) => i !== index);
    onWidgetsChange(newWidgets);
  }, [widgets, onWidgetsChange]);

  const colWidth = `calc((100% - ${(columns - 1) * 8}px) / ${columns})`;

  return (
    <div
      className="relative w-full"
      style={{ minHeight: gridRows * rowHeight }}
    >
      {editing && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: `
              linear-gradient(to right, rgba(51,65,85,0.15) 1px, transparent 1px),
              linear-gradient(to bottom, rgba(51,65,85,0.15) 1px, transparent 1px)
            `,
            backgroundSize: `calc(100% / ${columns}) ${rowHeight}px`,
          }}
        />
      )}

      {widgets.map((widget, index) => {
        const { x, y, w, h } = widget.position;
        const left = `calc(${x} * (100% / ${columns}) + ${x > 0 ? 4 : 0}px)`;
        const top = y * rowHeight + 4;
        const width = `calc(${w} * (100% / ${columns}) - 8px)`;
        const height = h * rowHeight - 8;

        return (
          <div
            key={widget.id}
            className={`absolute transition-all duration-200 ${
              dropTarget === index ? 'ring-2 ring-cyan-400/50 rounded-lg' : ''
            }`}
            style={{
              left,
              top,
              width,
              height,
            }}
            onDragOver={editing ? handleDragOver(index) : undefined}
            onDrop={editing ? handleDrop(index) : undefined}
          >
            <WidgetCard
              widget={widget}
              editing={editing}
              onRemove={() => handleRemove(index)}
              onEdit={() => onEditWidget?.(widget)}
              onDragStart={handleDragStart(index)}
              style={{ width: '100%', height: '100%' }}
            />
          </div>
        );
      })}
    </div>
  );
}
