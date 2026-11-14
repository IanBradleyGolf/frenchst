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
    for (const it of d.floors.find((f) => f.id === floor.id)!.items) if (ids.has(it.id)) it.circuit = name;
  });
}

export function unlinkSelected(floor: Floor) {
  const st = useStore.getState();
  if (st.selection.kind !== 'items') return;
  const ids = new Set(st.selection.ids);
  st.mutate((d) => {
    for (const it of d.floors.find((f) => f.id === floor.id)!.items) if (ids.has(it.id)) delete it.circuit;
  });
}

/** Wire tool: join item b to item a's circuit (creating one if a has none). */
export function wireTogether(floor: Floor, a: Item, b: Item) {
  const st = useStore.getState();
  if (a.id === b.id) return;
  const name = a.circuit ?? b.circuit ?? nextCircuit(floor);
  const old = b.circuit && b.circuit !== name ? b.circuit : null;
  st.mutate((d) => {
    for (const it of d.floors.find((f) => f.id === floor.id)!.items) {
      if (it.id === a.id || it.id === b.id || (old && it.circuit === old)) it.circuit = name;
    }
  });
}
