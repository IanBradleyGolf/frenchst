import type { SymbolKind } from './types';

/**
 * Each symbol is a list of primitives in a unit box (-1..1, y down).
 * The same definition drives the canvas, the palette (SVG) and the PDF export.
 */
export type Prim =
  | { t: 'circle'; cx: number; cy: number; r: number; fill?: boolean; w?: number }
  | { t: 'rect'; x: number; y: number; w: number; h: number; fill?: boolean; sw?: number }
  | { t: 'poly'; pts: number[]; fill?: boolean; closed?: boolean; w?: number }
  | { t: 'text'; x: number; y: number; s: string; size: number };

const ring = (r = 1, w = 0.18): Prim => ({ t: 'circle', cx: 0, cy: 0, r, w });
const dot = (r: number): Prim => ({ t: 'circle', cx: 0, cy: 0, r, fill: true });
const label = (s: string, size = 0.9): Prim => ({ t: 'text', x: 0, y: 0, s, size });

export const SYMBOLS: Record<SymbolKind, Prim[]> = {
  downlight: [ring(), dot(0.45)],
  pinlight: [ring(0.6), dot(0.3)],
  adjustable: [ring(), dot(0.4), { t: 'poly', pts: [0.5, -0.5, 1.2, -1.2], w: 0.18 }],
  wall: [{ t: 'poly', pts: [-1, 0.4, 1, 0.4, 0, -0.9], fill: true, closed: true }],
  pendant: [ring(), { t: 'poly', pts: [-0.7, -0.7, 0.7, 0.7], w: 0.18 }, { t: 'poly', pts: [-0.7, 0.7, 0.7, -0.7], w: 0.18 }],
  linear: [{ t: 'rect', x: -1.6, y: -0.35, w: 3.2, h: 0.7, fill: true }],
  strip: [{ t: 'rect', x: -1.8, y: -0.22, w: 3.6, h: 0.44, fill: true }],
  lowlevel: [{ t: 'rect', x: -0.8, y: -0.5, w: 1.6, h: 1, sw: 0.18 }, { t: 'rect', x: -0.8, y: 0.1, w: 1.6, h: 0.4, fill: true }],
  uplight: [ring(0.8), { t: 'poly', pts: [-0.5, 0.3, 0, -0.5, 0.5, 0.3], w: 0.18 }],
  spike: [{ t: 'poly', pts: [-0.9, 0.8, 0.9, 0.8, 0, -1], closed: true, w: 0.2 }, dot(0.3)],
  spot: [ring(0.75), { t: 'poly', pts: [0.6, -0.2, 1.4, -0.7, 1.4, 0.3], fill: true, closed: true }],
  panel: [{ t: 'rect', x: -1, y: -1, w: 2, h: 2, sw: 0.18 }, { t: 'poly', pts: [-1, -1, 1, 1], w: 0.12 }, { t: 'poly', pts: [-1, 1, 1, -1], w: 0.12 }],
  surface: [ring(), ring(0.55, 0.14)],
  fan: [ring(), label('F', 1.1)],
  keypad: [{ t: 'rect', x: -0.8, y: -1, w: 1.6, h: 2, fill: true }, { t: 'rect', x: -0.45, y: -0.65, w: 0.9, h: 0.35, fill: false, sw: 0.12 }],
  sensor: [ring(), label('MS', 0.8)],
  touchscreen: [{ t: 'rect', x: -1.1, y: -0.8, w: 2.2, h: 1.6, sw: 0.18 }, label('TS', 0.8)],
  gpo: [{ t: 'rect', x: -1, y: -0.6, w: 2, h: 1.2, sw: 0.18 }, { t: 'circle', cx: -0.45, cy: 0, r: 0.18, fill: true }, { t: 'circle', cx: 0.45, cy: 0, r: 0.18, fill: true }],
  usb: [{ t: 'rect', x: -1, y: -0.6, w: 2, h: 1.2, sw: 0.18 }, label('USB', 0.6)],
  'gpo-wp': [{ t: 'rect', x: -1, y: -0.6, w: 2, h: 1.2, fill: true }, label('WP', 0.7)],
  data: [{ t: 'poly', pts: [-0.9, -0.7, 0.9, -0.7, 0, 0.9], closed: true, w: 0.18 }, label('D', 0.7)],
  tv: [{ t: 'rect', x: -1.1, y: -0.7, w: 2.2, h: 1.4, sw: 0.18 }, label('TV', 0.75)],
  wap: [ring(), { t: 'circle', cx: 0, cy: 0, r: 0.5, w: 0.14 }, dot(0.18)],
  camera: [{ t: 'poly', pts: [-1, -0.5, 0.6, -0.5, 0.6, 0.5, -1, 0.5], closed: true, fill: true }, { t: 'poly', pts: [0.6, -0.2, 1.2, -0.6, 1.2, 0.6, 0.6, 0.2], closed: true, fill: true }],
  intercom: [{ t: 'rect', x: -0.8, y: -1, w: 1.6, h: 2, sw: 0.18 }, label('IC', 0.7)],
  speaker: [ring(), ring(0.45, 0.14)],
  exhaust: [ring(), label('EF', 0.8)],
  towel: [{ t: 'rect', x: -1, y: -0.7, w: 2, h: 1.4, sw: 0.18 }, label('HT', 0.7)],
  smoke: [ring(), label('S', 1)],
  circuit: [{ t: 'poly', pts: [0, -1, 1, 0, 0, 1, -1, 0], closed: true, w: 0.18 }, label('C', 0.8)],
  rack: [{ t: 'rect', x: -1.1, y: -1.1, w: 2.2, h: 2.2, sw: 0.22 }, { t: 'rect', x: -0.8, y: -0.8, w: 1.6, h: 1.6, sw: 0.1 }, label('RACK', 0.45)],
  profile: [{ t: 'rect', x: -1.8, y: -0.28, w: 3.6, h: 0.56, sw: 0.14 }, { t: 'rect', x: -1.65, y: -0.12, w: 3.3, h: 0.24, fill: true }],
  driver: [{ t: 'rect', x: -1, y: -0.7, w: 2, h: 1.4, sw: 0.18 }, label('DRV', 0.55)],
  occsensor: [ring(), ring(0.62, 0.1), label('OS', 0.6)],
  pirswitch: [{ t: 'rect', x: -0.8, y: -1, w: 1.6, h: 2, sw: 0.18 }, { t: 'poly', pts: [-0.45, -0.1, 0, -0.55, 0.45, -0.1], w: 0.16 }, { t: 'poly', pts: [-0.3, 0.45, 0.3, 0.45], w: 0.16 }],
  pushbutton: [{ t: 'rect', x: -0.8, y: -1, w: 1.6, h: 2, sw: 0.18 }, { t: 'circle', cx: 0, cy: 0, r: 0.38, fill: true }],
  alarm: [{ t: 'rect', x: -1, y: -1, w: 2, h: 2, sw: 0.18 }, label('AK', 0.75)],
  access: [{ t: 'rect', x: -1, y: -1, w: 2, h: 2, sw: 0.18 }, label('AC', 0.75)],
  strike: [{ t: 'rect', x: -1, y: -1, w: 2, h: 2, sw: 0.18 }, label('ES', 0.75)],
  doorctl: [{ t: 'rect', x: -1, y: -1, w: 2, h: 2, sw: 0.18 }, label('DC', 0.75)],
  soundbar: [{ t: 'rect', x: -1.4, y: -0.6, w: 2.8, h: 1.2, sw: 0.18 }, label('SB', 0.7)],
  sub: [{ t: 'rect', x: -1, y: -1, w: 2, h: 2, sw: 0.18 }, label('SW', 0.75)],
  generic: [{ t: 'poly', pts: [0, -1, 1, 0, 0, 1, -1, 0], closed: true, fill: true }],
};

/** Approximate half-extent of a symbol in unit coordinates, for hit areas and labels. */
export const EXTENT: Partial<Record<SymbolKind, number>> = { linear: 1.6, strip: 1.8, spot: 1.4, adjustable: 1.2, camera: 1.2, touchscreen: 1.1, tv: 1.1, soundbar: 1.4, rack: 1.1, profile: 1.8 };

export function svgFor(kind: SymbolKind, color: string, size = 22): string {
  const s = size / 2 / 1.9;
  const parts = SYMBOLS[kind].map((p) => {
    switch (p.t) {
      case 'circle':
        return p.fill
          ? `<circle cx="${p.cx}" cy="${p.cy}" r="${p.r}" fill="${color}"/>`
          : `<circle cx="${p.cx}" cy="${p.cy}" r="${p.r}" fill="none" stroke="${color}" stroke-width="${p.w ?? 0.18}"/>`;
      case 'rect':
        return p.fill
          ? `<rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" fill="${color}"/>`
          : `<rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" fill="none" stroke="${color}" stroke-width="${p.sw ?? 0.18}"/>`;
      case 'poly': {
        const pts = [];
        for (let i = 0; i < p.pts.length; i += 2) pts.push(`${p.pts[i]},${p.pts[i + 1]}`);
        const tag = p.closed || p.fill ? 'polygon' : 'polyline';
        return p.fill
          ? `<${tag} points="${pts.join(' ')}" fill="${color}"/>`
          : `<${tag} points="${pts.join(' ')}" fill="none" stroke="${color}" stroke-width="${p.w ?? 0.18}" stroke-linejoin="round"/>`;
      }
      case 'text':
        return `<text x="${p.x}" y="${p.y}" font-size="${p.size}" font-family="IBM Plex Mono, monospace" font-weight="600" text-anchor="middle" dominant-baseline="central" fill="${color}">${p.s}</text>`;
    }
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${-size / 2 / s} ${-size / 2 / s} ${size / s} ${size / s}">${parts.join('')}</svg>`;
}

/** Fallback when a floor has no scale: assume a 1:100 drawing (1 pt = 0.3528 mm on paper). */
export const DEFAULT_MM_PER_PT = 35.28;

/** Half-length, in symbol units (multiples of the symbol size), of a length-drawn item. */
export function halfUnits(lenMm: number, mmPerPt: number | undefined, size: number) {
  return lenMm / (mmPerPt || DEFAULT_MM_PER_PT) / 2 / size;
}

/** Primitives for a symbol; a 'profile' is stretched to the given half-length (symbol units). */
export function primsFor(kind: SymbolKind, half?: number): Prim[] {
  if (kind !== 'profile' || !half) return SYMBOLS[kind];
  return [
    { t: 'rect', x: -half, y: -0.28, w: half * 2, h: 0.56, sw: 0.14 },
    { t: 'rect', x: -half + 0.15, y: -0.12, w: Math.max(0.1, half * 2 - 0.3), h: 0.24, fill: true },
  ];
}
