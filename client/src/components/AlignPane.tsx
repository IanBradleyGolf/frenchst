import { useEffect, useRef, useState } from 'react';
import { Circle, Group, Image as KImage, Layer, Rect, Stage, Text } from 'react-konva';
import type Konva from 'konva';
import { renderPage } from '../pdf';
import type { Pt } from '../importer';

interface Props {
  planId: string;
  page: number;
  width: number; // page points
  height: number;
  points: Pt[]; // up to 2: A, B
  onPick: (p: Pt) => void;
  preview?: { x: number; y: number; color: string }[];
  title: string;
  areaMode?: boolean; // drag draws a rectangle instead of panning
  area?: { x1: number; y1: number; x2: number; y2: number } | null;
  onArea?: (a: { x1: number; y1: number; x2: number; y2: number }) => void;
}

const MARK = ['#dc2626', '#2563eb'];

export function AlignPane({ planId, page, width, height, points, onPick, preview, title, areaMode, area, onArea }: Props) {
  const [rect, setRect] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const stage = useRef<Konva.Stage>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [img, setImg] = useState<HTMLCanvasElement | null>(null);
  const [v, setV] = useState({ zoom: 1, x: 0, y: 0 });
  const drag = useRef<{ sx: number; sy: number; vx: number; vy: number; moved: boolean } | null>(null);

  useEffect(() => {
    const el = wrap.current!;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    let live = true;
    setImg(null);
    renderPage(planId, page, 2).then((c) => live && setImg(c));
    return () => {
      live = false;
    };
  }, [planId, page]);

  useEffect(() => {
    if (size.w < 50) return;
    const z = Math.min((size.w - 16) / width, (size.h - 16) / height);
    setV({ zoom: z, x: (size.w - width * z) / 2, y: (size.h - height * z) / 2 });
  }, [size.w, size.h, width, height]);

  const toPage = (sx: number, sy: number) => ({ x: (sx - v.x) / v.zoom, y: (sy - v.y) / v.zoom });

  return (
    <div className="align-pane">
      <div className="align-title">{title}</div>
      <div ref={wrap} className={`align-canvas ${areaMode ? 'area' : ''}`}>
        <Stage
          ref={stage}
          width={size.w}
          height={size.h}
          onWheel={(e) => {
            e.evt.preventDefault();
            const p = stage.current!.getPointerPosition()!;
            const zoom = Math.min(40, Math.max(0.05, v.zoom * Math.exp(-e.evt.deltaY * 0.0015)));
            const b = toPage(p.x, p.y);
            setV({ zoom, x: p.x - b.x * zoom, y: p.y - b.y * zoom });
          }}
          onMouseDown={() => {
            const p = stage.current!.getPointerPosition()!;
            if (areaMode) {
              const q = toPage(p.x, p.y);
              setRect({ x1: q.x, y1: q.y, x2: q.x, y2: q.y });
              return;
            }
            drag.current = { sx: p.x, sy: p.y, vx: v.x, vy: v.y, moved: false };
          }}
          onMouseMove={() => {
            if (rect) {
              const p = stage.current!.getPointerPosition()!;
              const q = toPage(p.x, p.y);
              setRect({ ...rect, x2: q.x, y2: q.y });
              return;
            }
            const d = drag.current;
            if (!d) return;
            const p = stage.current!.getPointerPosition()!;
            if (Math.abs(p.x - d.sx) + Math.abs(p.y - d.sy) > 4) d.moved = true;
            if (d.moved) setV((cur) => ({ ...cur, x: d.vx + p.x - d.sx, y: d.vy + p.y - d.sy }));
          }}
          onMouseUp={(e) => {
            if (rect) {
              const r = { x1: Math.min(rect.x1, rect.x2), y1: Math.min(rect.y1, rect.y2), x2: Math.max(rect.x1, rect.x2), y2: Math.max(rect.y1, rect.y2) };
              setRect(null);
              if (r.x2 - r.x1 > 5 && r.y2 - r.y1 > 5) onArea?.(r);
              return;
            }
            const d = drag.current;
            drag.current = null;
            if (!d || d.moved || e.evt.button !== 0) return;
            const p = stage.current!.getPointerPosition()!;
            onPick(toPage(p.x, p.y));
          }}
          onMouseLeave={() => (drag.current = null)}
        >
          <Layer>
            <Group x={v.x} y={v.y} scaleX={v.zoom} scaleY={v.zoom}>
              <Rect width={width} height={height} fill="#fff" />
              {img && <KImage image={img} width={width} height={height} />}
              {(rect ?? area) && (() => {
                const r = rect ?? area!;
                return <Rect x={Math.min(r.x1, r.x2)} y={Math.min(r.y1, r.y2)} width={Math.abs(r.x2 - r.x1)} height={Math.abs(r.y2 - r.y1)} stroke="#16a34a" strokeWidth={2 / v.zoom} dash={[8 / v.zoom, 4 / v.zoom]} fill="rgba(22,163,74,0.06)" listening={false} />;
              })()}
              {preview?.map((p, i) => (
                <Circle key={i} x={p.x} y={p.y} radius={3 / v.zoom} fill={p.color} opacity={0.85} listening={false} />
              ))}
              {points.map((p, i) => (
                <Group key={i} x={p.x} y={p.y} listening={false}>
                  <Circle radius={9 / v.zoom} stroke={MARK[i]} strokeWidth={2 / v.zoom} />
                  <Circle radius={1.5 / v.zoom} fill={MARK[i]} />
                  <Text x={10 / v.zoom} y={-18 / v.zoom} text={i ? 'B' : 'A'} fontSize={14 / v.zoom} fontStyle="bold" fill={MARK[i]} />
                </Group>
              ))}
            </Group>
          </Layer>
        </Stage>
      </div>
    </div>
  );
}
