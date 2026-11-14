import { pointInPolygon, uid } from './geometry';
import { guessRoomName, pageLabels } from './pdftext';
import { useStore } from './store';
import type { Floor } from './types';

/** Adds a room, selects it, and names it from the drawing text inside it when possible. */
export function createRoom(floor: Floor, pts: number[]) {
  const st = useStore.getState();
  const id = uid();
  st.mutate((d) => {
    const f = d.floors.find((x) => x.id === floor.id)!;
    f.rooms.push({ id, name: `Room ${f.rooms.length + 1}`, dwelling: guessDwelling(d.dwellings, f, pts), points: pts });
  });
  st.setDraft([]);
  st.setTool('select');
  st.select({ kind: 'room', id });
  pageLabels(floor.planId, floor.page)
    .then((labels) => {
      const name = guessRoomName(labels, (x, y) => pointInPolygon(x, y, pts));
      if (!name) return;
      const cur = useStore.getState();
      const f = cur.project?.data.floors.find((x) => x.id === floor.id);
      const r = f?.rooms.find((x) => x.id === id);
      if (r && /^Room \d+$/.test(r.name)) cur.mutate((d) => (d.floors.find((x) => x.id === floor.id)!.rooms.find((x) => x.id === id)!.name = name), 'roomname-auto');
    })
    .catch(() => undefined);
}

/** If a party wall is set, pick the dwelling by which side of it the room sits on, matching existing rooms. */
function guessDwelling(dwellings: string[], f: Floor, pts: number[]): string {
  const first = dwellings[0] ?? 'Dwelling 1';
  if (!f.axis) return first;
  const side = (x: number, y: number) => Math.sign((f.axis!.x2 - f.axis!.x1) * (y - f.axis!.y1) - (f.axis!.y2 - f.axis!.y1) * (x - f.axis!.x1));
  let cx = 0, cy = 0;
  for (let i = 0; i < pts.length; i += 2) { cx += pts[i]; cy += pts[i + 1]; }
  cx /= pts.length / 2; cy /= pts.length / 2;
  const s = side(cx, cy);
  for (const r of f.rooms) {
    let rx = 0, ry = 0;
    for (let i = 0; i < r.points.length; i += 2) { rx += r.points[i]; ry += r.points[i + 1]; }
    rx /= r.points.length / 2; ry /= r.points.length / 2;
    if (r.dwelling !== 'Common' && side(rx, ry) === s) return r.dwelling;
  }
  return s >= 0 ? first : (dwellings[1] ?? first);
}
