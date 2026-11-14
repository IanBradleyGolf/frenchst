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
