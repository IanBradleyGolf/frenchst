import { create } from 'zustand';
import type { Floor, Project, ProjectData, Tool } from './types';

export type Selection = { kind: 'items'; ids: string[] } | { kind: 'room'; id: string } | { kind: 'erase'; id: string } | { kind: 'wall'; id: string } | { kind: 'text'; id: string } | { kind: 'wire'; a: string; b: string } | { kind: 'none' };
export type SaveState = 'saved' | 'dirty' | 'saving' | 'error' | 'conflict';

export interface View {
  zoom: number;
  x: number;
  y: number;
}

interface State {
  project: Project | null;
  saveState: SaveState;
  saveError: string | null;
  past: ProjectData[];
  future: ProjectData[];
  lastKey: string | null;
  lastAt: number;

  floorId: string | null;
  tool: Tool;
  activeCode: string | null;
  selection: Selection;
  draft: number[]; // in-progress points for room / calibrate / axis tools
  views: Record<string, View>;
  clipboard: { items: Floor['items'] } | null;
  rightTab: 'properties' | 'schedule' | 'rooms';
  fitNonce: number;
  requestFit(): void;
  /** Pending request to show items on the plan: switch floor, frame them and flash a marker. */
  focus: { floorId: string; ids: string[]; nonce: number } | null;
  focusItems(floorId: string, ids: string[]): void;
  clearFocus(): void;

  setProject(p: Project | null): void;
  mutate(fn: (d: ProjectData) => void, key?: string): void;
  undo(): void;
  redo(): void;
  markSaved(version: number, updatedAt: string): void;
  setSaveState(s: SaveState, err?: string | null): void;
  rename(name: string): void;

  setFloor(id: string | null): void;
  setTool(t: Tool): void;
  setActiveCode(code: string | null): void;
  select(s: Selection): void;
  setDraft(pts: number[]): void;
  setView(floorId: string, v: View): void;
  setClipboard(c: State['clipboard']): void;
  setRightTab(t: State['rightTab']): void;
}

const HISTORY = 150;

// Remember each floor's zoom and position in this browser.
const VIEWS_KEY = 'fs.views';
function loadViews(): Record<string, View> {
  try {
    const v = JSON.parse(localStorage.getItem(VIEWS_KEY) ?? '{}');
    const out: Record<string, View> = {};
    for (const [k, x] of Object.entries(v as Record<string, View>)) if (x && x.zoom > 0.01 && Number.isFinite(x.x) && Number.isFinite(x.y)) out[k] = x;
    return out;
  } catch {
    return {};
  }
}
let saveTimer: ReturnType<typeof setTimeout> | undefined;
function saveViews(v: Record<string, View>) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(VIEWS_KEY, JSON.stringify(v));
    } catch {
      /* storage unavailable */
    }
  }, 300);
}

export const useStore = create<State>((set, get) => ({
  project: null,
  saveState: 'saved',
  saveError: null,
  past: [],
  future: [],
  lastKey: null,
  lastAt: 0,
  floorId: null,
  tool: 'select',
  activeCode: null,
  selection: { kind: 'none' },
  draft: [],
  views: loadViews(),
  clipboard: null,
  rightTab: 'properties',
  fitNonce: 0,
  requestFit: () => set({ fitNonce: get().fitNonce + 1 }),
  focus: null,
  // Selects the items without leaving the current right-hand tab, so the schedule stays open.
  focusItems: (floorId, ids) =>
    set({ floorId, tool: 'select', draft: [], selection: { kind: 'items', ids }, focus: { floorId, ids, nonce: (get().focus?.nonce ?? 0) + 1 } }),
  clearFocus: () => set({ focus: null }),

  setProject: (p) =>
    set({
      project: p,
      past: [],
      future: [],
      saveState: 'saved',
      saveError: null,
      floorId: p?.data.floors[0]?.id ?? null,
      selection: { kind: 'none' },
      tool: 'select',
      draft: [],
    }),

  mutate: (fn, key) => {
    const { project, past, lastKey, lastAt } = get();
    if (!project) return;
    const before = project.data;
    const next = structuredClone(before);
    fn(next);
    const t = Date.now();
    const coalesce = key && key === lastKey && t - lastAt < 800;
    set({
      project: { ...project, data: next },
      past: coalesce ? past : [...past.slice(-HISTORY + 1), before],
      future: [],
      lastKey: key ?? null,
      lastAt: t,
      saveState: get().saveState === 'conflict' ? 'conflict' : 'dirty',
    });
  },

  undo: () => {
    const { project, past, future } = get();
    if (!project || past.length === 0) return;
    const prev = past[past.length - 1];
    set({
      project: { ...project, data: prev },
      past: past.slice(0, -1),
      future: [project.data, ...future],
      lastKey: null,
      saveState: 'dirty',
      selection: { kind: 'none' },
    });
  },

  redo: () => {
    const { project, past, future } = get();
    if (!project || future.length === 0) return;
    set({
      project: { ...project, data: future[0] },
      past: [...past, project.data],
      future: future.slice(1),
      lastKey: null,
      saveState: 'dirty',
      selection: { kind: 'none' },
    });
  },

  markSaved: (version, updatedAt) => {
    const p = get().project;
    if (p) set({ project: { ...p, version, updatedAt } });
  },
  setSaveState: (s, err = null) => set({ saveState: s, saveError: err }),
  rename: (name) => {
    const p = get().project;
    if (p) set({ project: { ...p, name }, saveState: 'dirty' });
  },

  setFloor: (id) => set({ floorId: id, selection: { kind: 'none' }, draft: [] }),
  setTool: (t) => set({ tool: t, draft: [], ...(t !== 'place' ? {} : {}) }),
  setActiveCode: (code) => set({ activeCode: code, tool: code ? 'place' : 'select', draft: [] }),
  select: (s) => set({ selection: s, rightTab: s.kind === 'room' ? 'rooms' : s.kind !== 'none' ? 'properties' : get().rightTab }),
  setDraft: (pts) => set({ draft: pts }),
  setView: (floorId, v) => {
    const views = { ...get().views, [floorId]: v };
    set({ views });
    saveViews(views);
  },
  setClipboard: (c) => set({ clipboard: c }),
  setRightTab: (t) => set({ rightTab: t }),
}));

export function useFloor(): Floor | undefined {
  return useStore((s) => s.project?.data.floors.find((f) => f.id === s.floorId));
}
