import { useStore } from './store';
import type { Floor, Item } from './types';

/** Minimum spanning tree over item positions: the drawn "wires" of a circuit. */
export function spanningLinks(items: Item[]): [Item, Item][] {
  if (items.length < 2) return [];
  const inTree = new Set([0]);
  const best = items.map((it) => Math.hypot(it.x - items[0].x, it.y - items[0].y));
  const from = items.map(() => 0);
  const out: [Item, Item][] = [];
  while (inTree.size < items.length) {
    let k = -1;
    for (let i = 0; i < items.length; i++) if (!inTree.has(i) && (k < 0 || best[i] < best[k])) k = i;
    inTree.add(k);
    out.push([items[from[k]], items[k]]);
    for (let i = 0; i < items.length; i++) {
      if (inTree.has(i)) continue;
      const d = Math.hypot(items[i].x - items[k].x, items[i].y - items[k].y);
      if (d < best[i]) {
        best[i] = d;
        from[i] = k;
      }
    }
  }
  return out;
}

/**
 * The wires drawn for one circuit: the floor's explicit links between its items, plus the
 * shortest joins needed to connect anything left unconnected (e.g. a circuit typed by hand,
 * or projects from before wires were stored).
 */
export function circuitLinks(list: Item[], links: [string, string][] | undefined): [Item, Item][] {
  const idx = new Map(list.map((it, k) => [it.id, k]));
  const p = list.map((_, k) => k);
  const find = (k: number): number => (p[k] === k ? k : (p[k] = find(p[k])));
  const out: [Item, Item][] = [];
  const seen = new Set<string>();
  for (const [a, b] of links ?? []) {
    const i = idx.get(a), j = idx.get(b);
    if (i === undefined || j === undefined || i === j) continue;
    const key = a < b ? a + '|' + b : b + '|' + a;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push([list[i], list[j]]);
    p[find(i)] = find(j);
  }
  if (list.length < 2) return out;
  const roots = new Set(list.map((_, k) => find(k)));
  if (roots.size === 1) return out;
  const pairs: [number, number, number][] = [];
  for (let i = 0; i < list.length; i++)
    for (let j = i + 1; j < list.length; j++) pairs.push([Math.hypot(list[i].x - list[j].x, list[i].y - list[j].y), i, j]);
  pairs.sort((x, y) => x[0] - y[0]);
  for (const [, i, j] of pairs) {
    if (find(i) === find(j)) continue;
    p[find(i)] = find(j);
    out.push([list[i], list[j]]);
  }
  return out;
}

/** Store a circuit's currently drawn wires as explicit links, so later edits change only what is asked. */
function materialize(f: Floor, name: string | undefined) {
  if (!name) return;
  const list = f.items.filter((i) => i.circuit === name);
  const ids = new Set(list.map((i) => i.id));
  const keep = (f.links ?? []).filter(([a, b]) => !(ids.has(a) && ids.has(b)));
  f.links = [...keep, ...circuitLinks(list, f.links).map(([a, b]) => [a.id, b.id] as [string, string])];
}

/** Give each connected part of a circuit (by explicit links) its own name; lone lights lose it. */
function splitByLinks(f: Floor, name: string) {
  const list = f.items.filter((i) => i.circuit === name);
  const idx = new Map(list.map((it, k) => [it.id, k]));
  const p = list.map((_, k) => k);
  const find = (k: number): number => (p[k] === k ? k : (p[k] = find(p[k])));
  for (const [a, b] of f.links ?? []) {
    const i = idx.get(a), j = idx.get(b);
    if (i !== undefined && j !== undefined) p[find(i)] = find(j);
  }
  const groups = new Map<number, Item[]>();
  list.forEach((it, k) => {
    const r = find(k);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r)!.push(it);
  });
  [...groups.values()].sort((g, h) => h.length - g.length).forEach((g, gi) => {
    if (g.length === 1) delete g[0].circuit;
    else if (gi > 0) {
      const n = nextCircuit(f);
      for (const it of g) it.circuit = n;
    }
  });
}

export function circuitsOf(floor: Floor): Map<string, Item[]> {
  const m = new Map<string, Item[]>();
  for (const it of floor.items) {
    if (!it.circuit) continue;
    if (!m.has(it.circuit)) m.set(it.circuit, []);
    m.get(it.circuit)!.push(it);
  }
  return m;
}

export function nextCircuit(floor: Floor): string {
  let n = 0;
  for (const it of floor.items) {
    const m = it.circuit?.match(/^C(\d+)$/);
    if (m) n = Math.max(n, Number(m[1]));
  }
  return `C${String(n + 1).padStart(2, '0')}`;
}

const PALETTE = ['#dc2626', '#ea580c', '#c026d3', '#0891b2', '#16a34a', '#9333ea', '#be123c', '#0d9488', '#b45309', '#4f46e5'];
export function circuitColor(name: string): string {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

/** Put the selected items on one circuit (the one most of them already share, or a new one). */
export function linkSelected(floor: Floor) {
  const st = useStore.getState();
  if (st.selection.kind !== 'items' || st.selection.ids.length < 1) return;
  const ids = new Set(st.selection.ids);
  const sel = floor.items.filter((i) => ids.has(i.id));
  const counts = new Map<string, number>();
  for (const it of sel) if (it.circuit) counts.set(it.circuit, (counts.get(it.circuit) ?? 0) + 1);
  const name = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? nextCircuit(floor);
  st.mutate((d) => {
    const f = d.floors.find((f) => f.id === floor.id)!;
    for (const c of new Set(f.items.filter((i) => ids.has(i.id)).map((i) => i.circuit))) materialize(f, c);
    for (const it of f.items) if (ids.has(it.id)) it.circuit = name;
  });
}

export function unlinkSelected(floor: Floor) {
  const st = useStore.getState();
  if (st.selection.kind !== 'items') return;
  const ids = new Set(st.selection.ids);
  st.mutate((d) => {
    const f = d.floors.find((f) => f.id === floor.id)!;
    const olds = new Set(f.items.filter((i) => ids.has(i.id)).map((i) => i.circuit).filter(Boolean) as string[]);
    for (const c of olds) materialize(f, c);
    for (const it of f.items) if (ids.has(it.id)) delete it.circuit;
    f.links = (f.links ?? []).filter(([a, b]) => !ids.has(a) && !ids.has(b));
    for (const c of olds) splitByLinks(f, c);
  });
}

/** Wire tool: join item b to item a's circuit (creating one if a has none). */
export function wireTogether(floor: Floor, a: Item, b: Item) {
  const st = useStore.getState();
  if (a.id === b.id) return;
  st.mutate((d) => {
    const f = d.floors.find((x) => x.id === floor.id)!;
    const A = f.items.find((i) => i.id === a.id), B = f.items.find((i) => i.id === b.id);
    if (!A || !B) return;
    materialize(f, A.circuit);
    if (B.circuit !== A.circuit) materialize(f, B.circuit);
    const name = A.circuit ?? B.circuit ?? nextCircuit(f);
    const old = B.circuit && B.circuit !== name ? B.circuit : null;
    for (const it of f.items) if (it.id === A.id || it.id === B.id || (old && it.circuit === old)) it.circuit = name;
    if (!(f.links ?? []).some(([x, y]) => (x === A.id && y === B.id) || (x === B.id && y === A.id))) f.links = [...(f.links ?? []), [A.id, B.id]];
  });
}

export const DEFAULT_BEND = 0.18;

/** Stable key and orientation for the wire between two items. */
export function bendKey(a: Item, b: Item): { key: string; a: Item; b: Item } {
  return a.id < b.id ? { key: `${a.id}|${b.id}`, a, b } : { key: `${b.id}|${a.id}`, a: b, b: a };
}

/**
 * Geometry of one wire: it passes through `apex`, offset from the midpoint by bend × length,
 * perpendicular to the chord. `ctrl` is the matching quadratic Bézier control point.
 */
export function wireGeom(floor: Floor, p: Item, q: Item, override?: { key: string; bend: number } | null) {
  const { key, a, b } = bendKey(p, q);
  const bend = override && override.key === key ? override.bend : floor.bends?.[key] ?? DEFAULT_BEND;
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, dx = b.x - a.x, dy = b.y - a.y;
  const apex = { x: mx - dy * bend, y: my + dx * bend };
  return { key, a, b, bend, mid: { x: mx, y: my }, apex, ctrl: { x: 2 * apex.x - mx, y: 2 * apex.y - my } };
}

/** Bend that puts the wire's apex nearest to point p. */
export function bendFor(a: Item, b: Item, p: { x: number; y: number }): number {
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, dx = b.x - a.x, dy = b.y - a.y;
  const L2 = dx * dx + dy * dy || 1;
  return ((p.x - mx) * -dy + (p.y - my) * dx) / L2;
}

/** Remove the drawn wire between items a and b: the circuit splits where the wire was. */
export function deleteWire(floorId: string, aId: string, bId: string) {
  const st = useStore.getState();
  st.mutate((d) => {
    const f = d.floors.find((x) => x.id === floorId)!;
    const a = f.items.find((i) => i.id === aId), b = f.items.find((i) => i.id === bId);
    if (!a?.circuit || a.circuit !== b?.circuit) return;
    materialize(f, a.circuit);
    f.links = (f.links ?? []).filter(([x, y]) => !((x === aId && y === bId) || (x === bId && y === aId)));
    splitByLinks(f, a.circuit);
    if (f.bends) delete f.bends[bendKey(a, b).key];
  });
  st.select({ kind: 'none' });
}
