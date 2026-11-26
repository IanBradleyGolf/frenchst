import type { Floor, Item, ProjectData } from './types';

export const MANUAL = 'Added by hand';
export const layerOf = (it: Item) => it.layer ?? MANUAL;
/** Inside the kept part of the sheet. Anything outside the crop is not drawn, so it is not counted or exported either. */
export const inCrop = (f: Floor, it: Item) => !f.crop || (it.x >= f.crop.x1 && it.x <= f.crop.x2 && it.y >= f.crop.y1 && it.y <= f.crop.y2);
export const isVisible = (data: ProjectData, it: Item) => !(data.hiddenLayers ?? []).includes(layerOf(it));

export function layerCounts(data: ProjectData): { name: string; count: number; hidden: boolean }[] {
  const m = new Map<string, number>();
  for (const f of data.floors) for (const it of f.items) m.set(layerOf(it), (m.get(layerOf(it)) ?? 0) + 1);
  const hidden = new Set(data.hiddenLayers ?? []);
  return [...m.entries()].map(([name, count]) => ({ name, count, hidden: hidden.has(name) })).sort((a, b) => (a.name === MANUAL ? 1 : b.name === MANUAL ? -1 : a.name.localeCompare(b.name)));
}
