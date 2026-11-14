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
}

const MARK = ['#dc2626', '#2563eb'];

export function AlignPane({ planId, page, width, height, points, onPick, preview, title }: Props) {
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
      <div ref={wrap} className="align-canvas">
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
            drag.current = { sx: p.x, sy: p.y, vx: v.x, vy: v.y, moved: false };
          }}
          onMouseMove={() => {
            const d = drag.current;
            if (!d) return;
            const p = stage.current!.getPointerPosition()!;
            if (Math.abs(p.x - d.sx) + Math.abs(p.y - d.sy) > 4) d.moved = true;
            if (d.moved) setV((cur) => ({ ...cur, x: d.vx + p.x - d.sx, y: d.vy + p.y - d.sy }));
          }}
          onMouseUp={(e) => {
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
