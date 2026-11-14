import { OPS } from 'pdfjs-dist';
import { loadDoc } from './pdf';

export interface Wire {
  a: { x: number; y: number };
  b: { x: number; y: number };
}

type M = [number, number, number, number, number, number];
const mul = (m: M, n: M): M => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
];
const ap = (m: M, x: number, y: number) => ({ x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] });

function isRed(c: unknown): boolean {
  if (!c) return false;
  if (typeof c === 'string') {
    const n = parseInt(c.replace('#', ''), 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return r > 170 && g < 90 && b < 90;
  }
  const a = c as ArrayLike<number>;
  const scale = a[0] > 1 || a[1] > 1 || a[2] > 1 ? 255 : 1;
  return a[0] / scale > 0.67 && a[1] / scale < 0.35 && a[2] / scale < 0.35;
}

/**
 * Open red dashed paths on a page — the switching/wiring arcs on LA Lounge style lighting plans —
 * as start/end points in editor coordinates (page points, origin top-left).
 */
export async function pageWires(planId: string, page: number): Promise<Wire[]> {
  const doc = await loadDoc(planId);
  const pg = await doc.getPage(page);
  const vp = pg.getViewport({ scale: 1 });
  const ol = await pg.getOperatorList();
  const base = vp.transform as M;
  let ctm: M = [1, 0, 0, 1, 0, 0];
  const stack: { ctm: M; stroke: unknown; dash: boolean }[] = [];
  let stroke: unknown = null;
  let dash = false;
  const out: Wire[] = [];

  for (let i = 0; i < ol.fnArray.length; i++) {
    const fn = ol.fnArray[i];
    const args = ol.argsArray[i] as any[];
    switch (fn) {
      case OPS.save:
        stack.push({ ctm, stroke, dash });
        break;
      case OPS.restore: {
        const s = stack.pop();
        if (s) ({ ctm, stroke, dash } = s);
        break;
      }
      case OPS.transform:
        ctm = mul(ctm, args as M);
        break;
      case OPS.paintFormXObjectBegin:
        stack.push({ ctm, stroke, dash });
        if (Array.isArray(args[0]) && args[0].length === 6) ctm = mul(ctm, args[0] as M);
        break;
      case OPS.paintFormXObjectEnd: {
        const s = stack.pop();
        if (s) ({ ctm, stroke, dash } = s);
        break;
      }
      case OPS.setStrokeRGBColor:
        stroke = args.length === 1 ? args[0] : args;
        break;
      case OPS.setDash:
        dash = Array.isArray(args[0]) && args[0].length > 0;
        break;
      case OPS.constructPath: {
        if (!dash || !isRed(stroke)) break;
        const ops: number[] = args[0];
        const c: number[] = args[1];
        let k = 0;
        let start: { x: number; y: number } | null = null;
        let last: { x: number; y: number } | null = null;
        let closed = false;
        const flush = () => {
          if (start && last && !closed && Math.hypot(start.x - last.x, start.y - last.y) > 4) {
            const m = mul(base, ctm);
            out.push({ a: ap(m, start.x, start.y), b: ap(m, last.x, last.y) });
          }
          start = last = null;
          closed = false;
        };
        for (const op of ops) {
          if (op === OPS.moveTo) {
            flush();
            start = last = { x: c[k], y: c[k + 1] };
            k += 2;
          } else if (op === OPS.lineTo) {
            last = { x: c[k], y: c[k + 1] };
            k += 2;
          } else if (op === OPS.curveTo) {
            last = { x: c[k + 4], y: c[k + 5] };
            k += 6;
          } else if (op === OPS.curveTo2 || op === OPS.curveTo3) {
            last = { x: c[k + 2], y: c[k + 3] };
            k += 4;
          } else if (op === OPS.closePath) {
            closed = true;
          } else if (op === OPS.rectangle) {
            k += 4;
            closed = true;
          }
        }
        flush();
        break;
      }
    }
  }
  return out;
}

/** Union-find over item indices. */
export function groupsFromLinks(n: number, links: [number, number][]): number[] {
  const p = Array.from({ length: n }, (_, i) => i);
  const f = (i: number): number => (p[i] === i ? i : (p[i] = f(p[i])));
  for (const [a, b] of links) p[f(a)] = f(b);
  return p.map((_, i) => f(i));
}
