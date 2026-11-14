import { uid } from './geometry';
import { useStore } from './store';
import type { Floor } from './types';

/** Copy a floor with everything on it (items, wires, arcs, rooms, erasures, text), placed right after it. */
export function duplicateFloor(floorId: string) {
  const st = useStore.getState();
  const newId = uid();
  st.mutate((d) => {
    const i = d.floors.findIndex((f) => f.id === floorId);
    if (i < 0) return;
    const src: Floor = JSON.parse(JSON.stringify(d.floors[i]));
    const ids = new Map<string, string>();
    for (const it of src.items) {
      const n = uid();
      ids.set(it.id, n);
      it.id = n;
    }
    for (const r of src.rooms) r.id = uid();
    for (const r of src.erase ?? []) r.id = uid();
    for (const t of src.texts ?? []) t.id = uid();
    if (src.links) src.links = src.links.filter(([a, b]) => ids.has(a) && ids.has(b)).map(([a, b]) => [ids.get(a)!, ids.get(b)!]);
    if (src.bends) {
      const out: Record<string, number> = {};
      for (const [k, v] of Object.entries(src.bends)) {
        const [a, b] = k.split('|');
        const na = ids.get(a), nb = ids.get(b);
        if (!na || !nb) continue;
        // keys are ordered by id; keep the arc on the same side if the order flips
        out[na < nb ? `${na}|${nb}` : `${nb}|${na}`] = na < nb ? v : -v;
      }
      src.bends = out;
    }
    const names = new Set(d.floors.map((f) => f.name));
    let name = `${src.name} (copy)`;
    for (let k = 2; names.has(name); k++) name = `${src.name} (copy ${k})`;
    d.floors.splice(i + 1, 0, { ...src, id: newId, name });
  });
  const v = st.views[floorId];
  if (v) st.setView(newId, v);
  st.setFloor(newId);
}
