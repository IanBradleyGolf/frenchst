import { useStore } from './store';
import { uid } from './geometry';
import type { TextNote } from './types';

export function deleteMark(floorId: string, sel: { kind: 'erase' | 'text'; id: string }) {
  const st = useStore.getState();
  st.mutate((d) => {
    const f = d.floors.find((x) => x.id === floorId)!;
    if (sel.kind === 'erase') f.erase = (f.erase ?? []).filter((r) => r.id !== sel.id);
    else f.texts = (f.texts ?? []).filter((t) => t.id !== sel.id);
  });
  st.select({ kind: 'none' });
}

export function addText(floorId: string, x: number, y: number, size: number) {
  const st = useStore.getState();
  const t: TextNote = { id: uid(), x, y, text: 'Text', size, color: '#0f172a' };
  st.mutate((d) => {
    const f = d.floors.find((f) => f.id === floorId)!;
    f.texts = [...(f.texts ?? []), t];
  });
  st.select({ kind: 'text', id: t.id });
  return t;
}

export function updateText(floorId: string, id: string, fn: (t: TextNote) => void, key?: string) {
  useStore.getState().mutate((d) => {
    const t = d.floors.find((f) => f.id === floorId)!.texts?.find((x) => x.id === id);
    if (t) fn(t);
  }, key);
}

/** Characters the PDF's standard Helvetica can draw (WinAnsi). */
export function pdfSafe(s: string) {
  return s.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"').replace(/[\u2013\u2014]/g, '-').replace(/[^\x20-\x7E\xA0-\xFF\n]/g, '?');
}
