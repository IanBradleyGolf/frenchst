import { useEffect, useMemo, useRef, useState } from 'react';
import { Circle, Group, Image as KImage, Layer, Line, Rect, Stage, Text } from 'react-konva';
import type Konva from 'konva';
import { renderPage } from '../pdf';
import { useStore, type View } from '../store';
import { centroid, distance, uid } from '../geometry';
import { libraryMap, unknownComponent } from '../schedule';
import { EXTENT } from '../symbols';
import type { Floor, Item } from '../types';
import { SymbolShape } from './SymbolShape';
import { createRoom } from '../rooms';

const RENDER_SCALE = 3;
const DWELLING_COLORS = ['#2563eb', '#db2777', '#059669', '#d97706', '#7c3aed'];

export function dwellingColor(dwellings: string[], d: string) {
  const i = dwellings.indexOf(d);
  return DWELLING_COLORS[(i < 0 ? 4 : i) % DWELLING_COLORS.length];
}

export function PlanCanvas({ floor, showLabels, showRooms }: { floor: Floor; showLabels: boolean; showRooms: boolean }) {
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
    if (!view && size.w > 100) fit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [floor.id, size.w, size.h]);

  useEffect(() => {
    if (fitNonce) fit();
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
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  const v: View = view ?? { zoom: 1, x: 0, y: 0 };

  function fit() {
    const pad = 24;
    const zoom = Math.min((size.w - pad * 2) / floor.width, (size.h - pad * 2) / floor.height);
    setView(floor.id, { zoom, x: (size.w - floor.width * zoom) / 2, y: (size.h - floor.height * zoom) / 2 });
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
      const item: Item = { id: uid(), code: activeCode, x: p.x, y: p.y, rot: 0 };
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
    if (marquee) {
      const x1 = Math.min(marquee.x1, marquee.x2), x2 = Math.max(marquee.x1, marquee.x2);
      const y1 = Math.min(marquee.y1, marquee.y2), y2 = Math.max(marquee.y1, marquee.y2);
      if (x2 - x1 > 2 / v.zoom || y2 - y1 > 2 / v.zoom) {
        const hit = floor.items.filter((it) => it.x >= x1 && it.x <= x2 && it.y >= y1 && it.y <= y2).map((it) => it.id);
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
            <Rect name="bg" x={0} y={0} width={floor.width} height={floor.height} fill="#fff" shadowColor="#0f172a" shadowBlur={12 / v.zoom} shadowOpacity={0.15} />
            {bg && <KImage name="bg" image={bg} x={0} y={0} width={floor.width} height={floor.height} />}

            {showRooms &&
              floor.rooms.map((r) => {
                const col = dwellingColor(data.dwellings, r.dwelling);
                const c = centroid(r.points);
                const sel = roomSel?.id === r.id;
                return (
                  <Group key={r.id}>
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

            {floor.axis && (
              <Line points={[floor.axis.x1, floor.axis.y1, floor.axis.x2, floor.axis.y2]} stroke="#e11d48" strokeWidth={1.5 / v.zoom} dash={[10 / v.zoom, 4 / v.zoom, 2 / v.zoom, 4 / v.zoom]} listening={false} />
            )}

            {floor.items.map((it) => {
              const c = lib.get(it.code) ?? unknownComponent(it.code);
              const sel = selectedIds.has(it.id);
              const off = drag && sel && drag.id !== it.id ? drag : null;
              const ext = (EXTENT[c.symbol] ?? 1) * sz;
              return (
                <Group
                  key={it.id}
                  x={it.x + (off?.dx ?? 0)}
                  y={it.y + (off?.dy ?? 0)}
                  draggable={tool === 'select' && !space}
                  onMouseDown={(e) => itemDown(e, it)}
                  onDragStart={() => setDrag({ id: it.id, dx: 0, dy: 0 })}
                  onDragMove={(e) => setDrag({ id: it.id, dx: e.target.x() - it.x, dy: e.target.y() - it.y })}
                  onDragEnd={(e) => dragEnd(it, e.target)}
                >
                  <Group rotation={it.rot}>
                    <Rect x={-ext - 1} y={-sz - 1} width={(ext + 1) * 2} height={(sz + 1) * 2} fill="transparent" />
                    {sel && <Rect x={-ext - 1.5} y={-sz - 1.5} width={(ext + 1.5) * 2} height={(sz + 1.5) * 2} stroke="#f97316" strokeWidth={1.2 / v.zoom} dash={[3 / v.zoom, 2 / v.zoom]} />}
                    <SymbolShape kind={c.symbol} color={c.color} size={sz} />
                  </Group>
                  {showLabels && (
                    <Text x={ext + 1} y={-sz * 0.9} text={it.circuit ? `${it.code}·${it.circuit}` : it.code} fontSize={sz * 0.95} fontFamily="IBM Plex Mono" fontStyle="500" fill={c.color} listening={false} />
                  )}
                </Group>
              );
            })}

            {ghost && cursor && (
              <Group x={cursor.x} y={cursor.y} opacity={0.55} listening={false}>
                <SymbolShape kind={ghost.symbol} color={ghost.color} size={sz} />
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
      <div className="canvas-hud">
        <button onClick={fit} title="Fit to window (F)">Fit</button>
        <span>{Math.round(v.zoom * 100)}%</span>
        {floor.mmPerPt && cursor ? <span className="muted">scale set</span> : null}
        {!floor.mmPerPt && <span className="warn">Scale not set</span>}
      </div>
      {tool === 'room' && <div className="canvas-tip">Click corners. Click the first point, double-click or press Enter to finish. Esc cancels.</div>}
      {tool === 'calibrate' && draft.length < 4 && <div className="canvas-tip">Click two points a known distance apart, e.g. the ends of a dimensioned wall.</div>}
      {tool === 'axis' && <div className="canvas-tip">Click two points along the party wall. Items are mirrored across this line.</div>}
      {tool === 'place' && <div className="canvas-tip">Click to place. Esc or V to stop placing.</div>}
    </div>
  );
}

export function isTyping() {
  const el = document.activeElement as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
}
