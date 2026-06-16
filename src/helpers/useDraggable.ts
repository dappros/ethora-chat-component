import { useCallback, useRef, useState } from 'react';

export interface DraggablePosition {
  x: number;
  y: number;
}

/**
 * Minimal pointer-based drag hook (no deps). Returns the current offset and a
 * pointer-down handler to attach to a drag handle. The consumer decides how to
 * apply `pos` (e.g. as `left/top`, or as a delta from a default corner).
 *
 * `onChange` fires while dragging so callers can clamp to bounds. Works with
 * mouse and touch via Pointer Events. `null` position means "not yet dragged"
 * (use your default layout until the user moves it).
 */
export const useDraggable = (
  clamp?: (pos: DraggablePosition) => DraggablePosition
) => {
  const [pos, setPos] = useState<DraggablePosition | null>(null);
  const dragging = useRef<{
    startX: number;
    startY: number;
    baseX: number;
    baseY: number;
  } | null>(null);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      // Ignore drags that start on an interactive control (buttons etc.) so
      // clicking mute/hangup inside the handle still works.
      const target = e.target as HTMLElement;
      if (target.closest('button, a, input, [role="button"]')) return;
      e.preventDefault();

      const startX = e.clientX;
      const startY = e.clientY;
      const base = pos ?? { x: 0, y: 0 };
      dragging.current = {
        startX,
        startY,
        baseX: base.x,
        baseY: base.y,
      };

      const move = (ev: PointerEvent) => {
        if (!dragging.current) return;
        const next = {
          x: dragging.current.baseX + (ev.clientX - dragging.current.startX),
          y: dragging.current.baseY + (ev.clientY - dragging.current.startY),
        };
        setPos(clamp ? clamp(next) : next);
      };
      const up = () => {
        dragging.current = null;
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    },
    [pos, clamp]
  );

  return { pos, onPointerDown, setPos };
};
