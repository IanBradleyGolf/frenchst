import type { Label } from './pdftext';
import type { Component } from './types';

export interface Pt {
  x: number;
  y: number;
}

/** Similarity transform (scale, rotation, translation) that maps a1→a2 and b1→b2. */
export function similarity(a1: Pt, b1: Pt, a2: Pt, b2: Pt) {
  const v1 = { x: b1.x - a1.x, y: b1.y - a1.y };
  const v2 = { x: b2.x - a2.x, y: b2.y - a2.y };
  const l1 = Math.hypot(v1.x, v1.y) || 1;
  const s = Math.hypot(v2.x, v2.y) / l1;
  const theta = Math.atan2(v2.y, v2.x) - Math.atan2(v1.y, v1.x);
  const c = Math.cos(theta) * s, d = Math.sin(theta) * s;
  return {
    scale: s,
    rotationDeg: (theta * 180) / Math.PI,
    apply: (p: Pt): Pt => {
      const x = p.x - a1.x, y = p.y - a1.y;
      return { x: a2.x + c * x - d * y, y: a2.y + d * x + c * y };
    },
  };
}

/**
 * Turns raw page text into importable keys.
 * - Plain fitting codes (DL1, WL2, LL1, GS1…) are their own key.
 * - Switch device tags like "205-WAP" become "WAP".
 * - Switch keypad tags like "204.A" become "KEYPAD", or "SENSOR" when a "CTS" label sits beside them.
 * - Circuit tags like "204.4.1" and other text are ignored.
 */
export function classify(labels: Label[]): Map<string, Label[]> {
  const cts = labels.filter((l) => l.str === 'CTS');
  const out = new Map<string, Label[]>();
  const add = (k: string, l: Label) => {
    if (!out.has(k)) out.set(k, []);
    out.get(k)!.push(l);
  };
  for (const l of labels) {
    const s = l.str;
    let m: RegExpMatchArray | null;
    if ((m = s.match(/^\d{3}-([A-Z][A-Z0-9]{1,5})$/))) add(m[1], l);
    else if (/^\d{3}\.[A-Z]$/.test(s)) {
      const near = cts.some((c) => Math.hypot(c.x - l.x, c.y - l.y) < Math.max(12, l.h * 6));
      add(near ? 'SENSOR' : 'KEYPAD', l);
    } else if (/^[A-Z]{1,4}\d{0,2}$/.test(s) && /\d/.test(s)) add(s, l); // DL1, LED2, GS1, UP1, P2…
    else if (/^(LP|TV|WAP|PIR|EXF|HTR|GPO|USB|DATA|SPK|CAM)$/.test(s)) add(s, l);
  }
  return out;
}

const ALIASES: Record<string, string> = {
  KEYPAD: 'KP',
  SENSOR: 'MS',
  LS: 'SPK',
  TS: 'TS',
  CAM: 'CAM',
  CS: 'CAM',
  AK: 'INT',
  ACK: 'INT',
};

/** Default library code for an import key, or '' to skip. */
export function defaultMapping(key: string, library: Component[]): string {
  const codes = new Set(library.map((c) => c.code));
  if (codes.has(key)) return key;
  const a = ALIASES[key];
  return a && codes.has(a) ? a : '';
}

export interface SnapResult {
  pos: Pt[]; // per label: snapped source position (symbol) or the label position
  snapped: boolean[];
  links: [number, number][]; // label index pairs joined by a wire
}

/**
 * Moves each label onto the wire endpoint at its symbol and turns wires into links between labels.
 * Endpoints within 3 pt are one fitting; each fitting is given to its nearest free label within `tol`.
 */
export function snapToWires(labels: Pt[], wires: { a: Pt; b: Pt }[], tol = 26): SnapResult {
  const clusters: { x: number; y: number; n: number }[] = [];
  const endCluster: number[] = [];
  for (const w of wires) {
    for (const e of [w.a, w.b]) {
      let ci = clusters.findIndex((c) => Math.hypot(c.x - e.x, c.y - e.y) < 3);
      if (ci < 0) {
        clusters.push({ x: e.x, y: e.y, n: 1 });
        ci = clusters.length - 1;
      } else {
        const c = clusters[ci];
        c.x = (c.x * c.n + e.x) / (c.n + 1);
        c.y = (c.y * c.n + e.y) / (c.n + 1);
        c.n++;
      }
      endCluster.push(ci);
    }
  }
  const pairs: { d: number; l: number; c: number }[] = [];
  labels.forEach((l, li) => clusters.forEach((c, ci) => {
    const d = Math.hypot(c.x - l.x, c.y - l.y);
    if (d < tol) pairs.push({ d, l: li, c: ci });
  }));
  pairs.sort((a, b) => a.d - b.d);
  const labelOf = new Map<number, number>();
  const used = new Set<number>();
  for (const p of pairs) {
    if (used.has(p.l) || labelOf.has(p.c)) continue;
    used.add(p.l);
    labelOf.set(p.c, p.l);
  }
  const pos = labels.map((l) => ({ x: l.x, y: l.y }));
  const snapped = labels.map(() => false);
  for (const [ci, li] of labelOf) {
    pos[li] = { x: clusters[ci].x, y: clusters[ci].y };
    snapped[li] = true;
  }
  const links: [number, number][] = [];
  for (let i = 0; i < wires.length; i++) {
    const la = labelOf.get(endCluster[i * 2]), lb = labelOf.get(endCluster[i * 2 + 1]);
    if (la !== undefined && lb !== undefined && la !== lb) links.push([la, lb]);
  }
  return { pos, snapped, links };
}
