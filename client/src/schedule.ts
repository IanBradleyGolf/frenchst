import { compareComponents } from './library';
import { isVisible } from './layers';
import { roomAt } from './geometry';
import type { Component, Floor, ProjectData } from './types';

export interface Placed {
  floor: Floor;
  itemId: string;
  code: string;
  room: string; // room name or "(no room)"
  dwelling: string; // room dwelling or "(unassigned)"
  circuit: string;
  len?: number; // mm
}

export const NO_ROOM = '(no room)';
export const NO_DWELLING = '(unassigned)';

export function placedItems(data: ProjectData, floors: Floor[] = data.floors): Placed[] {
  const out: Placed[] = [];
  for (const f of floors) {
    for (const it of f.items) {
      if (!isVisible(data, it)) continue;
      const r = roomAt(f, it.x, it.y);
      out.push({ floor: f, itemId: it.id, code: it.code, room: r?.name ?? NO_ROOM, dwelling: r?.dwelling ?? NO_DWELLING, circuit: it.circuit ?? '', len: it.len });
    }
  }
  return out;
}

export interface Line {
  component: Component;
  qty: number;
  supply: number;
  install: number;
  total: number;
}

export function libraryMap(data: ProjectData) {
  return new Map(data.library.map((c) => [c.code, c]));
}

export function unknownComponent(code: string): Component {
  return { code, name: '(not in library)', category: 'Unknown', symbol: 'generic', color: '#64748b', control: 'Other', supplier: '', supplyRate: 0, installRate: 0 };
}

export function totals(data: ProjectData, items: Placed[]): Line[] {
  const lib = libraryMap(data);
  const counts = new Map<string, number>();
  for (const p of items) {
    const c = lib.get(p.code);
    // Length-drawn components are counted in metres.
    const q = c?.symbol === 'profile' ? (p.len ?? c.defaultLen ?? 1200) / 1000 : 1;
    counts.set(p.code, (counts.get(p.code) ?? 0) + q);
  }
  const order = new Map([...data.library].sort(compareComponents).map((c, i) => [c.code, i]));
  return [...counts.entries()]
    .map(([code, raw]) => {
      const c = lib.get(code) ?? unknownComponent(code);
      const qty = Math.round(raw * 100) / 100;
      const supply = qty * c.supplyRate;
      const install = qty * c.installRate;
      return { component: c, qty, supply, install, total: supply + install };
    })
    .sort((a, b) => (order.get(a.component.code) ?? 999) - (order.get(b.component.code) ?? 999));
}

export interface RoomLine {
  floor: string;
  dwelling: string;
  room: string;
  counts: Map<string, number>;
  qty: number;
}

export function byRoom(items: Placed[]): RoomLine[] {
  const m = new Map<string, RoomLine>();
  for (const p of items) {
    const key = `${p.floor.id}|${p.dwelling}|${p.room}`;
    let r = m.get(key);
    if (!r) {
      r = { floor: p.floor.name, dwelling: p.dwelling, room: p.room, counts: new Map(), qty: 0 };
      m.set(key, r);
    }
    r.counts.set(p.code, (r.counts.get(p.code) ?? 0) + 1);
    r.qty++;
  }
  return [...m.values()];
}

export const copiesOf = (data: ProjectData) => Math.max(1, Math.round(data.copies ?? 2));

export const money = (n: number) => n.toLocaleString('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 });
