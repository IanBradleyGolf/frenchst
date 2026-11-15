import { useEffect, useMemo, useRef, useState } from 'react';
import { Circle, Group, Image as KImage, Layer, Line, Rect, Stage, Text, Transformer } from 'react-konva';
import type Konva from 'konva';
import { renderPage } from '../pdf';
import { useStore, type View } from '../store';
import { centroid, distance, roomAt, uid } from '../geometry';
import { libraryMap, unknownComponent } from '../schedule';
import { EXTENT } from '../symbols';
import type { Floor, Item } from '../types';
import { SymbolShape } from './SymbolShape';
import { createRoom } from '../rooms';
import { isVisible } from '../layers';
import { addText } from '../marks';
import { openQuestions } from './RoomNotes';
import { DEFAULT_MM_PER_PT, halfUnits } from '../symbols';
import { bendFor, circuitColor, circuitLinks, circuitsOf, wireGeom, wireTogether } from '../circuits';

const RENDER_SCALE = 3;
const DWELLING_COLORS = ['#2563eb', '#db2777', '#059669', '#d97706', '#7c3aed'];

export function dwellingColor(dwellings: string[], d: string) {
  const i = dwellings.indexOf(d);
  return DWELLING_COLORS[(i < 0 ? 4 : i) % DWELLING_COLORS.length];
}

export function PlanCanvas({ floor, showLabels, showRooms, showWires = true }: { floor: Floor; showLabels: boolean; showRooms: boolean; showWires?: boolean }) {
  const [wireFrom, setWireFrom] = useState<Item | null>(null);
  const [rotPrev, setRotPrev] = useState<{ delta: number } | null>(null);
  const [bendPrev, setBendPrev] = useState<{ key: string; bend: number } | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [lenPrev, setLenPrev] = useState<{ id: string; len: number; x: number; y: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [bg, setBg] = useState<HTMLCanvasElement | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [pan, setPan] = useState<{ sx: number; sy: number; vx: number; vy: number } | null>(null);
  const [marquee, setMarquee] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const [drag, setDrag] = useState<{ id: string; dx: number; dy: number } | null>(null);
  const [space, setSpace] = useState(false);
  const trRef = useRef<Konva.Transformer>(null);

  const data = useStore((s) => s.project!.data);
  const tool = useStore((s) => s.tool);
  const activeCode = useStore((s) => s.activeCode);
  const selection = useStore((s) => s.selection);
  const draft = useStore((s) => s.draft);
  const view = useStore((s) => s.views[floor.id]);
  const fitNonce = useStore((s) => s.fitNonce);
  const { mutate, select, setDraft, setView, setTool } = useStore.getState();

  const lib = useMemo(() => libraryMap(data), [data]);
  const sz = data.symbolSize;
  const shown = useMemo(() => floor.items.filter((it) => isVisible(data, it)), [floor.items, data]);
  const selectedIds = selection.kind === 'items' ? new Set(selection.ids) : new Set<string>();

  // Container size
  useEffect(() => {
    const el = wrapRef.current!;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  // Background page
  useEffect(() => {
    let live = true;
    setBg(null);
    setLoadError(null);
    renderPage(floor.planId, floor.page, RENDER_SCALE)
      .then((c) => live && setBg(c))
      .catch((e) => live && setLoadError(String(e.message ?? e)));
    return () => {
      live = false;
    };
  }, [floor.planId, floor.page]);

  // Fit on first open
  useEffect(() => {
    if ((!view || !(view.zoom > 0.01)) && size.w > 100) fit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [floor.id, size.w, size.h]);

  // Fit when asked (F, Fit button, after cropping) — not when this floor is reopened.
  const lastNonce = useRef(fitNonce);
  useEffect(() => {
    if (fitNonce === lastNonce.current) return;
    lastNonce.current = fitNonce;
    fit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitNonce]);

  // Space bar = temporary pan
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !isTyping()) {
        setSpace(true);
        e.preventDefault();
      }
    };
    const up = (e: KeyboardEvent) => e.code === 'Space' && setSpace(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setWireFrom(null);
    window.addEventListener('keydown', esc);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('keydown', esc);
    };
  }, []);

  useEffect(() => {
    if (tool !== 'wire') setWireFrom(null);
  }, [tool]);

  const markId = selection.kind === 'erase' || selection.kind === 'text' ? selection.id : null;
  useEffect(() => {
    const tr = trRef.current;
    if (!tr) return;
    const node = markId && (tool === 'select' || (tool === 'erase' && selection.kind === 'erase')) ? stageRef.current?.findOne('#m-' + markId) : null;
    tr.nodes(node ? [node] : []);
    tr.getLayer()?.batchDraw();
  });

  const v: View = view ?? { zoom: 1, x: 0, y: 0 };

  function fit() {
    if (size.w < 100 || size.h < 100) return;
    const pad = 24;
    const c = floor.crop ?? { x1: 0, y1: 0, x2: floor.width, y2: floor.height };
    const cw = c.x2 - c.x1, ch = c.y2 - c.y1;
    const zoom = Math.min((size.w - pad * 2) / cw, (size.h - pad * 2) / ch);
    setView(floor.id, { zoom, x: (size.w - cw * zoom) / 2 - c.x1 * zoom, y: (size.h - ch * zoom) / 2 - c.y1 * zoom });
  }

  const toPage = (sx: number, sy: number) => ({ x: (sx - v.x) / v.zoom, y: (sy - v.y) / v.zoom });

  // Snap room vertices to existing room corners within 7 screen px.
  function snap(p: { x: number; y: number }) {
    if (tool !== 'room') return p;
    const tol = 7 / v.zoom;
    let best = p;
    let bd = tol;
    for (const r of floor.rooms) {
      for (let i = 0; i < r.points.length; i += 2) {
        const d = distance(p.x, p.y, r.points[i], r.points[i + 1]);
        if (d < bd) {
          bd = d;
          best = { x: r.points[i], y: r.points[i + 1] };
        }
      }
    }
    // Snap to horizontal/vertical from the previous draft point
    if (best === p && draft.length >= 2) {
      const lx = draft[draft.length - 2], ly = draft[draft.length - 1];
      if (Math.abs(p.x - lx) < tol) best = { x: lx, y: p.y };
      else if (Math.abs(p.y - ly) < tol) best = { x: p.x, y: ly };
    }
    return best;
  }

  function onWheel(e: Konva.KonvaEventObject<WheelEvent>) {
    e.evt.preventDefault();
    const p = stageRef.current!.getPointerPosition()!;
    const factor = Math.exp(-e.evt.deltaY * 0.0015);
    const zoom = Math.min(40, Math.max(0.05, v.zoom * factor));
    const before = toPage(p.x, p.y);
    setView(floor.id, { zoom, x: p.x - before.x * zoom, y: p.y - before.y * zoom });
  }

  function closeRoom(raw: number[]) {
    // Drop consecutive duplicate points (a double-click adds the same corner twice).
    const tol = 3 / v.zoom;
    const pts: number[] = [];
    for (let i = 0; i < raw.length; i += 2) {
      const n = pts.length;
      if (n && distance(raw[i], raw[i + 1], pts[n - 2], pts[n - 1]) < tol) continue;
      pts.push(raw[i], raw[i + 1]);
    }
    if (pts.length >= 4 && distance(pts[0], pts[1], pts[pts.length - 2], pts[pts.length - 1]) < tol) pts.splice(-2);
    if (pts.length < 6) return;
    createRoom(floor, pts);
  }

  function onMouseDown(e: Konva.KonvaEventObject<MouseEvent>) {
    const sp = stageRef.current!.getPointerPosition()!;
    const isBackground = e.target === e.target.getStage() || e.target.name() === 'bg' || e.target.name() === 'room';
    if (e.evt.button === 1 || e.evt.button === 2 || tool === 'pan' || space) {
      setPan({ sx: sp.x, sy: sp.y, vx: v.x, vy: v.y });
      return;
    }
    if (e.evt.button !== 0) return;
    const p = toPage(sp.x, sp.y);
    if (tool === 'place' && activeCode) {
      const comp = lib.get(activeCode);
      const item: Item = { id: uid(), code: activeCode, x: p.x, y: p.y, rot: 0, ...(comp?.symbol === 'profile' ? { len: comp.defaultLen ?? 1200 } : {}) };
      mutate((d) => d.floors.find((x) => x.id === floor.id)!.items.push(item));
      select({ kind: 'items', ids: [item.id] });
      return;
    }
    if (tool === 'room') {
      const q = snap(p);
      if (draft.length >= 6 && distance(q.x, q.y, draft[0], draft[1]) < 8 / v.zoom) return closeRoom(draft);
      setDraft([...draft, q.x, q.y]);
      return;
    }
    if (tool === 'calibrate' || tool === 'axis') {
      const next = draft.length >= 4 ? [p.x, p.y] : [...draft, p.x, p.y];
      setDraft(next);
      if (tool === 'axis' && next.length === 4) {
        mutate((d) => {
          d.floors.find((x) => x.id === floor.id)!.axis = { x1: next[0], y1: next[1], x2: next[2], y2: next[3] };
        });
        setDraft([]);
        setTool('select');
      }
      return;
    }
    if (tool === 'crop' || tool === 'erase') {
      setMarquee({ x1: p.x, y1: p.y, x2: p.x, y2: p.y });
      return;
    }
    if (tool === 'text') {
      addText(floor.id, p.x, p.y - sz * 1.25, Math.round(sz * 2.5 * 10) / 10);
      setTool('select');
      setTimeout(() => (document.getElementById('text-edit') as HTMLTextAreaElement | null)?.select(), 50);
      return;
    }
    if (tool === 'select' && isBackground) {
      setMarquee({ x1: p.x, y1: p.y, x2: p.x, y2: p.y });
      if (!e.evt.shiftKey) select({ kind: 'none' });
    }
  }

  function onMouseMove() {
    const sp = stageRef.current!.getPointerPosition();
    if (!sp) return;
    if (pan) {
      setView(floor.id, { zoom: v.zoom, x: pan.vx + sp.x - pan.sx, y: pan.vy + sp.y - pan.sy });
      return;
    }
    const p = toPage(sp.x, sp.y);
    setCursor(tool === 'room' ? snap(p) : p);
    if (marquee) setMarquee({ ...marquee, x2: p.x, y2: p.y });
  }

  function onMouseUp(e: Konva.KonvaEventObject<MouseEvent>) {
    if (pan) setPan(null);
    if (marquee && tool === 'crop') {
      const c = { x1: Math.max(0, Math.min(marquee.x1, marquee.x2)), y1: Math.max(0, Math.min(marquee.y1, marquee.y2)), x2: Math.min(floor.width, Math.max(marquee.x1, marquee.x2)), y2: Math.min(floor.height, Math.max(marquee.y1, marquee.y2)) };
      setMarquee(null);
      if (c.x2 - c.x1 > 20 && c.y2 - c.y1 > 20) {
        mutate((d) => (d.floors.find((f) => f.id === floor.id)!.crop = c));
        setTool('select');
        setTimeout(() => useStore.getState().requestFit(), 0);
      }
      return;
    }
    if (marquee && tool === 'erase') {
      const r = { x: Math.min(marquee.x1, marquee.x2), y: Math.min(marquee.y1, marquee.y2), w: Math.abs(marquee.x2 - marquee.x1), h: Math.abs(marquee.y2 - marquee.y1) };
      setMarquee(null);
      if (r.w < 4 / v.zoom && r.h < 4 / v.zoom) {
        const hit = [...(floor.erase ?? [])].reverse().find((q) => r.x >= q.x && r.x <= q.x + q.w && r.y >= q.y && r.y <= q.y + q.h);
        select(hit ? { kind: 'erase', id: hit.id } : { kind: 'none' });
        return;
      }
      {
        const id = uid();
        mutate((d) => {
          const f = d.floors.find((x) => x.id === floor.id)!;
          f.erase = [...(f.erase ?? []), { id, ...r }];
        });
      }
      return;
    }
    if (marquee) {
      const x1 = Math.min(marquee.x1, marquee.x2), x2 = Math.max(marquee.x1, marquee.x2);
      const y1 = Math.min(marquee.y1, marquee.y2), y2 = Math.max(marquee.y1, marquee.y2);
      if (x2 - x1 > 2 / v.zoom || y2 - y1 > 2 / v.zoom) {
        const hit = shown.filter((it) => it.x >= x1 && it.x <= x2 && it.y >= y1 && it.y <= y2).map((it) => it.id);
        const prev = e.evt.shiftKey && selection.kind === 'items' ? selection.ids : [];
        select(hit.length || prev.length ? { kind: 'items', ids: [...new Set([...prev, ...hit])] } : { kind: 'none' });
      }
      setMarquee(null);
    }
  }

  function onDblClick() {
    // Konva fires dblclick for any two quick clicks, so only treat it as "finish"
    // when the last two points are on top of each other.
    const d = useStore.getState().draft;
    if (tool !== 'room' || d.length < 8) return;
    const n = d.length;
    if (distance(d[n - 2], d[n - 1], d[n - 4], d[n - 3]) < 4 / v.zoom) closeRoom(d);
  }

  function itemDown(e: Konva.KonvaEventObject<MouseEvent>, it: Item) {
    if (tool === 'wire' && e.evt.button === 0) {
      e.cancelBubble = true;
      if (!wireFrom) setWireFrom(it);
      else {
        wireTogether(floor, wireFrom, it);
        setWireFrom(e.evt.shiftKey ? wireFrom : it); // keep chaining from the last light
      }
      return;
    }
    if (tool !== 'select' || space || e.evt.button !== 0) return;
    e.cancelBubble = true;
    if (e.evt.shiftKey) {
      const ids = selection.kind === 'items' ? selection.ids : [];
      select({ kind: 'items', ids: ids.includes(it.id) ? ids.filter((x) => x !== it.id) : [...ids, it.id] });
    } else if (!selectedIds.has(it.id)) select({ kind: 'items', ids: [it.id] });
  }

  function dragEnd(it: Item, node: Konva.Node) {
    const dx = node.x() - it.x, dy = node.y() - it.y;
    const ids = selectedIds.has(it.id) ? selectedIds : new Set([it.id]);
    setDrag(null);
    if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) return;
    mutate((d) => {
      for (const x of d.floors.find((f) => f.id === floor.id)!.items) if (ids.has(x.id)) {
        x.x += dx;
        x.y += dy;
      }
    });
  }

  const roomSel = selection.kind === 'room' ? floor.rooms.find((r) => r.id === selection.id) : undefined;
  const cursorStyle = pan ? 'grabbing' : tool === 'pan' || space ? 'grab' : tool === 'select' ? 'default' : 'crosshair';
  const ghost = tool === 'place' && activeCode && cursor ? lib.get(activeCode) : undefined;

  return (
    <div ref={wrapRef} className="canvas-wrap" style={{ cursor: cursorStyle }} onContextMenu={(e) => e.preventDefault()}>
      {!bg && !loadError && <div className="canvas-msg">Rendering plan…</div>}
      {loadError && <div className="canvas-msg error">Could not render this plan: {loadError}</div>}
      <Stage
        ref={stageRef}
        width={size.w}
        height={size.h}
        onWheel={onWheel}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={() => {
          setCursor(null);
          setPan(null);
        }}
        onDblClick={onDblClick}
      >
        <Layer>
          <Group x={v.x} y={v.y} scaleX={v.zoom} scaleY={v.zoom}>
            {(() => {
              const c = tool === 'crop' || !floor.crop ? { x1: 0, y1: 0, x2: floor.width, y2: floor.height } : floor.crop;
              return (
                <Group clipX={c.x1} clipY={c.y1} clipWidth={c.x2 - c.x1} clipHeight={c.y2 - c.y1}>
                  <Rect name="bg" x={c.x1} y={c.y1} width={c.x2 - c.x1} height={c.y2 - c.y1} fill="#fff" shadowColor="#0f172a" shadowBlur={12 / v.zoom} shadowOpacity={0.15} />
                  {bg && <KImage name="bg" image={bg} x={0} y={0} width={floor.width} height={floor.height} />}
                  {(floor.erase ?? []).map((r) => {
                    const sel = selection.kind === 'erase' && selection.id === r.id;
                    return (
                      <Rect
                        key={r.id}
                        id={'m-' + r.id}
                        x={r.x}
                        y={r.y}
                        width={r.w}
                        height={r.h}
                        fill="#fff"
                        stroke={sel || tool === 'erase' ? '#f97316' : undefined}
                        strokeWidth={0.8 / v.zoom}
                        dash={[4 / v.zoom, 3 / v.zoom]}
                        strokeScaleEnabled={false}
                        listening={tool === 'erase'}
                        draggable={tool === 'erase' && sel}
                        onMouseDown={(e) => {
                          if (tool !== 'erase' || space || e.evt.button !== 0 || !sel) return;
                          e.cancelBubble = true; // drag the selected box; other clicks draw / pick
                        }}
                        onClick={(e) => {
                          if (tool !== 'erase' || sel) return;
                          e.cancelBubble = true;
                          select({ kind: 'erase', id: r.id });
                        }}
                        onDragEnd={(e) => {
                          const nx = e.target.x(), ny = e.target.y();
                          mutate((d) => {
                            const x = d.floors.find((f) => f.id === floor.id)!.erase!.find((q) => q.id === r.id)!;
                            x.x = nx;
                            x.y = ny;
                          });
                        }}
                        onTransformEnd={(e) => {
                          const n = e.target;
                          const nr = { x: n.x(), y: n.y(), w: Math.abs(n.width() * n.scaleX()), h: Math.abs(n.height() * n.scaleY()) };
                          n.scaleX(1);
                          n.scaleY(1);
                          mutate((d) => Object.assign(d.floors.find((f) => f.id === floor.id)!.erase!.find((q) => q.id === r.id)!, nr));
                        }}
                      />
                    );
                  })}
                </Group>
              );
            })()}
            {tool === 'crop' && floor.crop && <Rect x={floor.crop.x1} y={floor.crop.y1} width={floor.crop.x2 - floor.crop.x1} height={floor.crop.y2 - floor.crop.y1} stroke="#64748b" strokeWidth={1 / v.zoom} dash={[6 / v.zoom, 4 / v.zoom]} listening={false} />}

            {showRooms &&
              floor.rooms.map((r) => {
                const col = dwellingColor(data.dwellings, r.dwelling);
                const c = centroid(r.points);
                const sel = roomSel?.id === r.id;
                const q = openQuestions(r);
                const fs = Math.max(3, 10 / v.zoom);
                return (
                  <Group key={r.id}>
                    {q > 0 && (
                      <Group
                        x={c.x}
                        y={c.y + fs * 1.3}
                        onMouseDown={(e) => {
                          if (tool !== 'select') return;
                          e.cancelBubble = true;
                          select({ kind: 'room', id: r.id });
                        }}
                      >
                        <Rect x={-fs * 1.6} y={-fs * 0.1} width={fs * 3.2} height={fs * 1.25} cornerRadius={fs * 0.6} fill="#f97316" />
                        <Text x={-fs * 1.6} y={fs * 0.08} width={fs * 3.2} align="center" text={`${q} ?`} fontSize={fs * 0.9} fontStyle="700" fill="#fff" fontFamily="IBM Plex Sans" />
                      </Group>
                    )}
                    <Line name="room" points={r.points} closed fill={col + (sel ? '30' : '14')} stroke={col} strokeWidth={(sel ? 2 : 1) / v.zoom} dash={sel ? undefined : [4 / v.zoom, 3 / v.zoom]} listening={false} />
                    <Text
                      x={c.x - 60}
                      y={c.y - 5 / v.zoom}
                      width={120}
                      align="center"
                      text={r.name}
                      fontSize={Math.max(3, 10 / v.zoom)}
                      fontFamily="IBM Plex Sans"
                      fontStyle="600"
                      fill={col}
                      opacity={0.9}
                      onMouseDown={(e) => {
                        if (tool !== 'select') return;
                        e.cancelBubble = true;
                        select({ kind: 'room', id: r.id });
                      }}
                    />
                  </Group>
                );
              })}

            {roomSel &&
              Array.from({ length: roomSel.points.length / 2 }, (_, i) => (
                <Circle
                  key={i}
                  x={roomSel.points[i * 2]}
                  y={roomSel.points[i * 2 + 1]}
                  radius={5 / v.zoom}
                  fill="#fff"
                  stroke={dwellingColor(data.dwellings, roomSel.dwelling)}
                  strokeWidth={2 / v.zoom}
                  draggable={tool === 'select'}
                  onMouseDown={(e) => (e.cancelBubble = true)}
                  onDragEnd={(e) => {
                    const nx = e.target.x(), ny = e.target.y();
                    mutate((d) => {
                      const r = d.floors.find((f) => f.id === floor.id)!.rooms.find((x) => x.id === roomSel.id)!;
                      r.points[i * 2] = nx;
                      r.points[i * 2 + 1] = ny;
                    });
                  }}
                />
              ))}

            {floor.importArea && (
              <Rect x={floor.importArea.x1} y={floor.importArea.y1} width={floor.importArea.x2 - floor.importArea.x1} height={floor.importArea.y2 - floor.importArea.y1} stroke="#16a34a" strokeWidth={1.2 / v.zoom} dash={[8 / v.zoom, 4 / v.zoom]} listening={false} />
            )}
            {floor.axis && (
              <Line points={[floor.axis.x1, floor.axis.y1, floor.axis.x2, floor.axis.y2]} stroke="#e11d48" strokeWidth={1.5 / v.zoom} dash={[10 / v.zoom, 4 / v.zoom, 2 / v.zoom, 4 / v.zoom]} listening={false} />
            )}

            {showWires &&
              [...circuitsOf({ ...floor, items: shown }).entries()].map(([name, list]) => {
                const col = circuitColor(name);
                const live = list.map((it) => (drag && selectedIds.has(it.id) ? { ...it, x: it.x + drag.dx, y: it.y + drag.dy } : it));
                const allSel = list.every((it) => selectedIds.has(it.id));
                return circuitLinks(live, floor.links).map(([p, q], k) => {
                  const g = wireGeom(floor, p, q, bendPrev);
                  const { a, b } = g;
                  const wSel = selection.kind === 'wire' && ((selection.a === a.id && selection.b === b.id) || (selection.a === b.id && selection.b === a.id));
                  const setBend = (bend: number | null) =>
                    mutate((d) => {
                      const f = d.floors.find((x) => x.id === floor.id)!;
                      f.bends = { ...(f.bends ?? {}) };
                      if (bend === null) delete f.bends[g.key];
                      else f.bends[g.key] = Math.round(bend * 1000) / 1000;
                    });
                  return (
                    <Group key={`${name}-${k}`}>
                      <Line
                        points={[a.x, a.y, g.apex.x, g.apex.y, b.x, b.y]}
                        tension={0.5}
                        stroke={col}
                        strokeWidth={(wSel ? 3 : allSel ? 2.2 : 1.3) / v.zoom}
                        dash={[6 / v.zoom, 4 / v.zoom]}
                        hitStrokeWidth={10 / v.zoom}
                        shadowColor={wSel ? '#f97316' : undefined}
                        shadowBlur={wSel ? 6 / v.zoom : 0}
                        shadowOpacity={wSel ? 0.9 : 0}
                        onMouseEnter={(e) => tool === 'select' && (e.target.getStage()!.container().style.cursor = 'pointer')}
                        onMouseLeave={(e) => (e.target.getStage()!.container().style.cursor = '')}
                        onMouseDown={(e) => {
                          if (tool !== 'select' || space || e.evt.button !== 0) return;
                          e.cancelBubble = true;
                          select({ kind: 'wire', a: a.id, b: b.id });
                        }}
                        onDblClick={(e) => {
                          if (tool !== 'select') return;
                          e.cancelBubble = true;
                          select({ kind: 'items', ids: list.map((i) => i.id) });
                        }}
                      />
                      {(allSel || wSel) && tool === 'select' && !drag && (
                        <Circle
                          x={g.apex.x}
                          y={g.apex.y}
                          radius={4.5 / v.zoom}
                          fill="#fff"
                          stroke={col}
                          strokeWidth={1.5 / v.zoom}
                          hitStrokeWidth={6 / v.zoom}
                          draggable
                          onMouseDown={(e) => (e.cancelBubble = true)}
                          onMouseEnter={(e) => (e.target.getStage()!.container().style.cursor = 'grab')}
                          onMouseLeave={(e) => (e.target.getStage()!.container().style.cursor = '')}
                          onDragMove={(e) => setBendPrev({ key: g.key, bend: bendFor(a, b, { x: e.target.x(), y: e.target.y() }) })}
                          onDragEnd={(e) => {
                            const bend = bendFor(a, b, { x: e.target.x(), y: e.target.y() });
                            setBendPrev(null);
                            setBend(Math.abs(bend) < 0.015 ? 0 : bend);
                          }}
                          onDblClick={(e) => {
                            e.cancelBubble = true;
                            setBend(g.bend === 0 ? null : 0);
                          }}
                        />
                      )}
                    </Group>
                  );
                });
              })}
            {tool === 'wire' && wireFrom && cursor && (
              <Line points={[wireFrom.x, wireFrom.y, cursor.x, cursor.y]} stroke="#dc2626" strokeWidth={1.5 / v.zoom} dash={[6 / v.zoom, 4 / v.zoom]} listening={false} />
            )}
            {shown.map((it) => {
              const c = lib.get(it.code) ?? unknownComponent(it.code);
              const sel = selectedIds.has(it.id);
              const off = drag && sel && drag.id !== it.id ? drag : null;
              const half = c.symbol === 'profile' ? halfUnits((lenPrev && lenPrev.id === it.id ? lenPrev.len : it.len) ?? c.defaultLen ?? 1200, floor.mmPerPt, sz) : undefined;
              const ext = half ? half * sz : (EXTENT[c.symbol] ?? 1) * sz;
              const lenTxt = half ? ` ${(((lenPrev && lenPrev.id === it.id ? lenPrev.len : it.len) ?? c.defaultLen ?? 1200) / 1000).toFixed(1)}m` : '';
              return (
                <Group
                  key={it.id}
                  x={lenPrev && lenPrev.id === it.id ? lenPrev.x : it.x + (off?.dx ?? 0)}
                  y={lenPrev && lenPrev.id === it.id ? lenPrev.y : it.y + (off?.dy ?? 0)}
                  draggable={tool === 'select' && !space}
                  onMouseDown={(e) => itemDown(e, it)}
                  onMouseEnter={() => setHoverId(it.id)}
                  onMouseLeave={() => setHoverId((h) => (h === it.id ? null : h))}
                  onDragStart={() => setDrag({ id: it.id, dx: 0, dy: 0 })}
                  onDragMove={(e) => setDrag({ id: it.id, dx: e.target.x() - it.x, dy: e.target.y() - it.y })}
                  onDragEnd={(e) => dragEnd(it, e.target)}
                >
                  <Group rotation={sel && rotPrev ? it.rot + rotPrev.delta : it.rot}>
                    <Rect x={-ext - 1} y={-sz - 1} width={(ext + 1) * 2} height={(sz + 1) * 2} fill="transparent" />
                    {sel && <Rect x={-ext - 1.5} y={-sz - 1.5} width={(ext + 1.5) * 2} height={(sz + 1.5) * 2} stroke="#f97316" strokeWidth={1.2 / v.zoom} dash={[3 / v.zoom, 2 / v.zoom]} />}
                    <SymbolShape kind={c.symbol} color={c.color} size={sz} half={half} />
                  </Group>
                  {showLabels && (
                    <Text x={half ? -ext : ext + 1} y={half ? -sz * 1.6 : -sz * 0.9} text={(it.circuit ? `${it.code}·${it.circuit}` : it.code) + lenTxt} fontSize={sz * 0.95} fontFamily="IBM Plex Mono" fontStyle="500" fill={c.color} listening={false} />
                  )}
                </Group>
              );
            })}

            {tool === 'select' && selection.kind === 'items' && selection.ids.length === 1 && !rotPrev && (() => {
              const it = shown.find((i) => i.id === selection.ids[0]);
              const c = it && lib.get(it.code);
              if (!it || !c || c.symbol !== 'profile') return null;
              const mpp = floor.mmPerPt || DEFAULT_MM_PER_PT;
              const len = it.len ?? c.defaultLen ?? 1200;
              const th = (it.rot * Math.PI) / 180, ux = Math.cos(th), uy = Math.sin(th);
              const cur = lenPrev && lenPrev.id === it.id ? lenPrev : { len, x: it.x, y: it.y };
              const halfPt = cur.len / mpp / 2;
              const ends = [-1, 1].map((sgn) => ({ sgn, x: cur.x + ux * halfPt * sgn, y: cur.y + uy * halfPt * sgn }));
              const fixedEnd = (sgn: number) => ({ x: it.x - ux * (len / mpp / 2) * sgn, y: it.y - uy * (len / mpp / 2) * sgn });
              const calc = (sgn: number, px: number, py: number, free: boolean) => {
                const f = fixedEnd(sgn);
                let l = ((px - f.x) * ux + (py - f.y) * uy) * sgn * mpp; // mm along the axis
                l = Math.max(100, free ? l : Math.round(l / 100) * 100);
                const h = l / mpp / 2;
                return { id: it.id, len: l, x: f.x + ux * h * sgn, y: f.y + uy * h * sgn };
              };
              return ends.map((e) => (
                <Rect
                  key={e.sgn}
                  x={e.x - 4 / v.zoom}
                  y={e.y - 4 / v.zoom}
                  width={8 / v.zoom}
                  height={8 / v.zoom}
                  fill="#fff"
                  stroke="#f97316"
                  strokeWidth={2 / v.zoom}
                  draggable
                  onMouseDown={(ev) => (ev.cancelBubble = true)}
                  onMouseEnter={(ev) => (ev.target.getStage()!.container().style.cursor = 'ew-resize')}
                  onMouseLeave={(ev) => (ev.target.getStage()!.container().style.cursor = '')}
                  onDragMove={(ev) => setLenPrev(calc(e.sgn, ev.target.x() + 4 / v.zoom, ev.target.y() + 4 / v.zoom, ev.evt.shiftKey))}
                  onDragEnd={(ev) => {
                    const r = calc(e.sgn, ev.target.x() + 4 / v.zoom, ev.target.y() + 4 / v.zoom, ev.evt.shiftKey);
                    setLenPrev(null);
                    mutate((d) => {
                      const x = d.floors.find((f) => f.id === floor.id)!.items.find((q) => q.id === it.id)!;
                      x.len = Math.round(r.len);
                      x.x = r.x;
                      x.y = r.y;
                    });
                  }}
                />
              ));
            })()}
            {tool === 'select' && selection.kind === 'items' && (() => {
              const anchor = shown.find((i) => i.id === selection.ids[selection.ids.length - 1]);
              if (!anchor) return null;
              const c = lib.get(anchor.code) ?? unknownComponent(anchor.code);
              const r = (c.symbol === 'profile' ? sz : Math.max((EXTENT[c.symbol] ?? 1) * sz, sz)) + 14 / v.zoom;
              const ang = ((anchor.rot + (rotPrev?.delta ?? 0) - 90) * Math.PI) / 180;
              const hx = anchor.x + Math.cos(ang) * r, hy = anchor.y + Math.sin(ang) * r;
              return (
                <>
                  <Line points={[anchor.x, anchor.y, hx, hy]} stroke="#f97316" strokeWidth={1 / v.zoom} listening={false} />
                  <Circle
                    x={hx}
                    y={hy}
                    radius={5 / v.zoom}
                    fill="#fff"
                    stroke="#f97316"
                    strokeWidth={2 / v.zoom}
                    draggable
                    onMouseDown={(e) => (e.cancelBubble = true)}
                    onMouseEnter={(e) => (e.target.getStage()!.container().style.cursor = 'grab')}
                    onMouseLeave={(e) => (e.target.getStage()!.container().style.cursor = '')}
                    onDragMove={(e) => {
                      const raw = (Math.atan2(e.target.y() - anchor.y, e.target.x() - anchor.x) * 180) / Math.PI + 90;
                      const target = e.evt.shiftKey ? raw : Math.round(raw / 15) * 15;
                      setRotPrev({ delta: target - anchor.rot });
                    }}
                    onDragEnd={(e) => {
                      e.target.position({ x: hx, y: hy });
                      const delta = rotPrev?.delta ?? 0;
                      setRotPrev(null);
                      if (!delta) return;
                      mutate((d) => {
                        for (const x of d.floors.find((f) => f.id === floor.id)!.items) if (selectedIds.has(x.id)) x.rot = (((x.rot + delta) % 360) + 360) % 360;
                      });
                    }}
                  />
                </>
              );
            })()}
            {(floor.texts ?? []).map((t) => (
              <Text
                key={t.id}
                id={'m-' + t.id}
                x={t.x}
                y={t.y}
                text={t.text || ' '}
                fontSize={t.size}
                fontFamily="Helvetica, Arial, sans-serif"
                fontStyle={t.bold ? 'bold' : 'normal'}
                fill={t.color}
                rotation={t.rot ?? 0}
                lineHeight={1.15}
                listening={tool === 'select'}
                draggable={tool === 'select'}
                onMouseDown={(e) => {
                  if (tool !== 'select' || space || e.evt.button !== 0) return;
                  e.cancelBubble = true;
                  select({ kind: 'text', id: t.id });
                }}
                onDblClick={(e) => {
                  e.cancelBubble = true;
                  select({ kind: 'text', id: t.id });
                  setTimeout(() => (document.getElementById('text-edit') as HTMLTextAreaElement | null)?.select(), 30);
                }}
                onDragEnd={(e) => {
                  const nx = e.target.x(), ny = e.target.y();
                  mutate((d) => {
                    const x = d.floors.find((f) => f.id === floor.id)!.texts!.find((q) => q.id === t.id)!;
                    x.x = nx;
                    x.y = ny;
                  });
                }}
                onTransformEnd={(e) => {
                  const n = e.target;
                  const k = Math.max(Math.abs(n.scaleX()), Math.abs(n.scaleY()));
                  const nt = { x: n.x(), y: n.y(), rot: Math.round(n.rotation() * 10) / 10, size: Math.max(1, Math.round(t.size * k * 10) / 10) };
                  n.scaleX(1);
                  n.scaleY(1);
                  mutate((d) => Object.assign(d.floors.find((f) => f.id === floor.id)!.texts!.find((q) => q.id === t.id)!, nt));
                }}
              />
            ))}
            <Transformer
              ref={trRef}
              rotateEnabled={selection.kind === 'text'}
              keepRatio={selection.kind === 'text'}
              enabledAnchors={selection.kind === 'text' ? ['top-left', 'top-right', 'bottom-left', 'bottom-right'] : undefined}
              rotationSnaps={[0, 45, 90, 135, 180, 225, 270, 315]}
              anchorSize={7}
              borderStroke="#f97316"
              anchorStroke="#f97316"
              ignoreStroke
              flipEnabled={false}
            />
            {ghost && cursor && (
              <Group x={cursor.x} y={cursor.y} opacity={0.55} listening={false}>
                <SymbolShape kind={ghost.symbol} color={ghost.color} size={sz} half={ghost.symbol === 'profile' ? halfUnits(ghost.defaultLen ?? 1200, floor.mmPerPt, sz) : undefined} />
              </Group>
            )}

            {draft.length > 0 && (
              <>
                <Line
                  points={cursor && !(tool !== 'room' && draft.length >= 4) ? [...draft, cursor.x, cursor.y] : draft}
                  stroke={tool === 'room' ? '#0ea5e9' : tool === 'axis' ? '#e11d48' : '#16a34a'}
                  strokeWidth={1.5 / v.zoom}
                  dash={[6 / v.zoom, 3 / v.zoom]}
                  listening={false}
                />
                {Array.from({ length: draft.length / 2 }, (_, i) => (
                  <Circle key={i} x={draft[i * 2]} y={draft[i * 2 + 1]} radius={3.5 / v.zoom} fill={i === 0 ? '#0ea5e9' : '#fff'} stroke="#0ea5e9" strokeWidth={1.5 / v.zoom} listening={false} />
                ))}
              </>
            )}
            {tool === 'room' && cursor && <Circle x={cursor.x} y={cursor.y} radius={3 / v.zoom} stroke="#0ea5e9" strokeWidth={1 / v.zoom} listening={false} />}

            {marquee && (
              <Rect
                x={Math.min(marquee.x1, marquee.x2)}
                y={Math.min(marquee.y1, marquee.y2)}
                width={Math.abs(marquee.x2 - marquee.x1)}
                height={Math.abs(marquee.y2 - marquee.y1)}
                fill="rgba(249,115,22,0.08)"
                stroke="#f97316"
                strokeWidth={1 / v.zoom}
                listening={false}
              />
            )}
          </Group>
        </Layer>
      </Stage>
      {(() => {
        const id = hoverId ?? (tool === 'select' && selection.kind === 'items' && selection.ids.length === 1 ? selection.ids[0] : null);
        const it = id ? floor.items.find((i) => i.id === id) : undefined;
        if (!it || drag || pan || rotPrev || lenPrev || marquee || tool === 'pan') return null;
        const c = lib.get(it.code) ?? unknownComponent(it.code);
        const room = roomAt(floor, it.x, it.y);
        const left = it.x * v.zoom + v.x + 16, top = it.y * v.zoom + v.y + 16;
        const len = c.symbol === 'profile' ? ((it.len ?? c.defaultLen ?? 1200) / 1000).toFixed(1) + ' m' : null;
        return (
          <div className="item-card" style={{ left: Math.min(left, size.w - 290), top: Math.min(top, size.h - 150) }}>
            <div className="item-card-head">
              <span className="item-card-sym" style={{ background: c.color }} />
              <b>{c.code}</b>
              <span>{c.name}</span>
            </div>
            <div className="item-card-meta">
              {[c.category, c.control, len, it.circuit && `circuit ${it.circuit}`, room && room.name].filter(Boolean).join(' · ')}
            </div>
            {it.note && <div className="item-card-note">{it.note}</div>}
            {c.notes && <div className="item-card-desc">{c.notes.length > 180 ? c.notes.slice(0, 177) + '…' : c.notes}</div>}
          </div>
        );
      })()}
      <div className="canvas-hud">
        <button onClick={fit} title="Fit to window (F)">Fit</button>
        <span>{Math.round(v.zoom * 100)}%</span>
        {floor.mmPerPt && cursor ? <span className="muted">scale set</span> : null}
        {!floor.mmPerPt && <span className="warn">Scale not set</span>}
      </div>
      {tool === 'room' && <div className="canvas-tip">Click corners. Click the first point, double-click or press Enter to finish. Esc cancels.</div>}
      {tool === 'calibrate' && draft.length < 4 && <div className="canvas-tip">Click two points a known distance apart, e.g. the ends of a dimensioned wall.</div>}
      {tool === 'axis' && <div className="canvas-tip">Click two points along the party wall. Items are mirrored across this line.</div>}
      {tool === 'wire' && <div className="canvas-tip">{wireFrom ? `Click the next light to wire it to ${wireFrom.code}${wireFrom.circuit ? ' on ' + wireFrom.circuit : ''}. Esc to finish.` : 'Click a light to start a wire, then click the lights to join to it.'}</div>}
      {tool === 'crop' && <div className="canvas-tip">Drag a box around the part of the sheet to keep, e.g. just the dwelling. Esc cancels.</div>}
      {tool === 'erase' && <div className="canvas-tip">Drag a box over anything on the drawing to white it out. Click a box to select it, then drag, resize or press Delete to restore what was under it.</div>}
      {tool === 'text' && <div className="canvas-tip">Click where the text should go, then type it in the panel on the right.</div>}
      {tool === 'place' && <div className="canvas-tip">Click to place. Esc or V to stop placing.</div>}
    </div>
  );
}

export function isTyping() {
  const el = document.activeElement as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
}
