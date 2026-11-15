import { loadDoc } from './pdf';

export interface Label {
  str: string;
  x: number; // centre, page points, y down (same space as the editor)
  y: number;
  h: number; // text height in points
  len?: number; // mm, from a 'CODE|len|rot' label
  rot?: number; // degrees, from a 'CODE|len|rot' label
  note?: string; // from a 'CODE|len|rot|note' label
}

const cache = new Map<string, Promise<Label[]>>();

/** Every non-empty text run on a page, positioned at its centre in editor coordinates. */
export function pageLabels(planId: string, page: number): Promise<Label[]> {
  const key = `${planId}:${page}`;
  let p = cache.get(key);
  if (!p) {
    p = (async () => {
      const doc = await loadDoc(planId);
      const pg = await doc.getPage(page);
      const vp = pg.getViewport({ scale: 1 });
      const tc = await pg.getTextContent();
      const out: Label[] = [];
      for (const it of tc.items as any[]) {
        const str = String(it.str ?? '').trim();
        if (!str) continue;
        const [a, b, , , e, f] = it.transform as number[];
        const len = Math.hypot(a, b) || 1;
        const ux = a / len, uy = b / len; // text direction in PDF space
        const w = it.width ?? 0, h = it.height ?? len;
        // centre of the run: half the width along the baseline, half the height up from it
        const cx = e + ux * (w / 2) - uy * (h / 2);
        const cy = f + uy * (w / 2) + ux * (h / 2);
        const [x, y] = vp.convertToViewportPoint(cx, cy);
        out.push({ str, x, y, h });
      }
      return out;
    })();
    cache.set(key, p);
  }
  return p;
}

const STOP = new Set(['STEP', 'SEAT', 'VOID', 'LIFT', 'ROBE', 'DESK', 'BAR', 'DOOR', 'WHEN', 'PLANTER', 'UP', 'DN', 'RL', 'FFL', 'SSL', 'AC', 'DW', 'FW', 'WM', 'REF', 'HWS', 'NORTH', 'FENCE', 'WALL']);

/** Best guess at a room name from the drawing text inside a polygon. */
export function guessRoomName(labels: Label[], inside: (x: number, y: number) => boolean): string | null {
  const cands = labels.filter((l) => /^[A-Za-z][A-Za-z /&'-]{2,30}$/.test(l.str) && !STOP.has(l.str.toUpperCase()) && inside(l.x, l.y));
  if (!cands.length) return null;
  cands.sort((a, b) => b.h - a.h || b.str.length - a.str.length);
  const s = cands[0].str;
  return s === s.toUpperCase() ? s.charAt(0) + s.slice(1).toLowerCase() : s;
}
