import type { Axis, Floor, Item, Room } from './types';

export const uid = () => crypto.randomUUID();

export function pointInPolygon(x: number, y: number, pts: number[]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 2; i < pts.length; j = i, i += 2) {
    const xi = pts[i], yi = pts[i + 1], xj = pts[j], yj = pts[j + 1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function polygonArea(pts: number[]): number {
  let a = 0;
  for (let i = 0, j = pts.length - 2; i < pts.length; j = i, i += 2) a += (pts[j] + pts[i]) * (pts[j + 1] - pts[i + 1]);
  return Math.abs(a / 2);
}

export function centroid(pts: number[]): { x: number; y: number } {
  let x = 0, y = 0;
  const n = pts.length / 2;
  for (let i = 0; i < pts.length; i += 2) {
    x += pts[i];
    y += pts[i + 1];
  }
  return { x: x / n, y: y / n };
}

/** The smallest room containing the point, so a cupboard inside a bedroom wins. */
export function roomAt(floor: Floor, x: number, y: number): Room | undefined {
  let best: Room | undefined;
  let bestArea = Infinity;
  for (const r of floor.rooms) {
    if (r.points.length >= 6 && pointInPolygon(x, y, r.points)) {
      const a = polygonArea(r.points);
      if (a < bestArea) {
        best = r;
        bestArea = a;
      }
    }
  }
  return best;
}

export function reflect(x: number, y: number, a: Axis): { x: number; y: number } {
  const dx = a.x2 - a.x1, dy = a.y2 - a.y1;
  const len2 = dx * dx + dy * dy || 1;
  const t = ((x - a.x1) * dx + (y - a.y1) * dy) / len2;
  const px = a.x1 + t * dx, py = a.y1 + t * dy;
  return { x: 2 * px - x, y: 2 * py - y };
}

export function reflectAngle(rot: number, a: Axis): number {
  const axisDeg = (Math.atan2(a.y2 - a.y1, a.x2 - a.x1) * 180) / Math.PI;
  return norm(2 * axisDeg - rot);
}

export function norm(deg: number) {
  return ((deg % 360) + 360) % 360;
}

export function mirrorItems(items: Item[], a: Axis): Item[] {
  return items.map((it) => {
    const p = reflect(it.x, it.y, a);
    return { ...it, id: uid(), x: p.x, y: p.y, rot: reflectAngle(it.rot, a) };
  });
}

export function mirrorRoom(r: Room, a: Axis, dwelling: string): Room {
  const pts: number[] = [];
  for (let i = 0; i < r.points.length; i += 2) {
    const p = reflect(r.points[i], r.points[i + 1], a);
    pts.push(p.x, p.y);
  }
  let label = r.label;
  if (label) {
    const c = centroid(r.points);
    const from = reflect(c.x, c.y, a);
    const to = reflect(c.x + label.dx, c.y + label.dy, a);
    label = { dx: to.x - from.x, dy: to.y - from.y };
  }
  return { ...r, id: uid(), points: pts, dwelling, label };
}

export function distance(x1: number, y1: number, x2: number, y2: number) {
  return Math.hypot(x2 - x1, y2 - y1);
}
