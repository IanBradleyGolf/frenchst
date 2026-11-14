import { useEffect, useRef, useState } from 'react';

const read = (key: string, def: number) => {
  try {
    const v = Number(localStorage.getItem(key));
    return v > 0 ? v : def;
  } catch {
    return def;
  }
};
const write = (key: string, v: number) => {
  try {
    localStorage.setItem(key, String(Math.round(v)));
  } catch {
    /* storage unavailable */
  }
};

/** A sidebar width that the user can drag, remembered per browser. */
export function usePanelWidth(key: string, def: number, min: number, max: number) {
  const [w, setW] = useState(() => Math.min(max, Math.max(min, read(key, def))));
  useEffect(() => write(key, w), [key, w]);
  return [w, (v: number) => setW(Math.min(max, Math.max(min, v))), def] as const;
}

/**
 * Vertical drag handle. `side` says which panel it resizes: 'left' grows as you drag right,
 * 'right' grows as you drag left. Double-click resets to the default width.
 */
export function Splitter({ side, width, setWidth, def }: { side: 'left' | 'right'; width: number; setWidth: (v: number) => void; def: number }) {
  const start = useRef<{ x: number; w: number } | null>(null);
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (!active) return;
    const move = (e: PointerEvent) => {
      if (!start.current) return;
      const dx = e.clientX - start.current.x;
      setWidth(start.current.w + (side === 'left' ? dx : -dx));
    };
    const up = () => {
      start.current = null;
      setActive(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [active, side, setWidth]);

  return (
    <div
      className={`splitter ${active ? 'active' : ''}`}
      role="separator"
      aria-orientation="vertical"
      aria-label={side === 'left' ? 'Resize left panel' : 'Resize right panel'}
      tabIndex={0}
      title="Drag to resize · double-click to reset"
      onPointerDown={(e) => {
        start.current = { x: e.clientX, w: width };
        setActive(true);
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
      }}
      onDoubleClick={() => setWidth(def)}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 40 : 10;
        if (e.key === 'ArrowLeft') setWidth(width + (side === 'left' ? -step : step));
        if (e.key === 'ArrowRight') setWidth(width + (side === 'left' ? step : -step));
      }}
    />
  );
}
