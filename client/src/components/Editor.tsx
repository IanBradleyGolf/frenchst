import { useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../api';
import { useFloor, useStore } from '../store';
import { exportExcel, exportPdf } from '../export';
import { uid } from '../geometry';
import { LeftPanel } from './LeftPanel';
import { Splitter, usePanelWidth } from './Splitter';
import { createRoom } from '../rooms';
import { RightPanel, mirrorCopy } from './RightPanel';
import { PlanCanvas, isTyping } from './PlanCanvas';
import type { Tool } from '../types';

function useAutosave() {
  const project = useStore((s) => s.project);
  const saveState = useStore((s) => s.saveState);
  const timer = useRef<number>();
  const inflight = useRef(false);

  useEffect(() => {
    if (!project || saveState !== 'dirty') return;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      if (inflight.current) return;
      const { project: p, setSaveState, markSaved } = useStore.getState();
      if (!p) return;
      inflight.current = true;
      setSaveState('saving');
      const sent = p.data;
      try {
        const r = await api.saveProject(p.id, p.name, sent, p.version);
        markSaved(r.version, r.updatedAt);
        // If edits arrived while saving, stay dirty so the next save picks them up.
        setSaveState(useStore.getState().project?.data === sent ? 'saved' : 'dirty');
      } catch (e) {
        if (e instanceof ApiError && e.status === 409) setSaveState('conflict', e.message);
        else setSaveState('error', (e as Error).message);
      } finally {
        inflight.current = false;
      }
    }, 1200);
    return () => window.clearTimeout(timer.current);
  }, [project, saveState]);

  // Warn before leaving with unsaved changes
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      const s = useStore.getState().saveState;
      if (s === 'dirty' || s === 'saving') e.preventDefault();
    };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, []);
}

function useShortcuts() {
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (isTyping()) return;
      const st = useStore.getState();
      const floor = st.project?.data.floors.find((f) => f.id === st.floorId);
      const mod = e.ctrlKey || e.metaKey;
      const selIds = st.selection.kind === 'items' ? new Set(st.selection.ids) : new Set<string>();
      const k = e.key.toLowerCase();

      if (mod && k === 'z') {
        e.preventDefault();
        e.shiftKey ? st.redo() : st.undo();
        return;
      }
      if (mod && k === 'y') {
        e.preventDefault();
        st.redo();
        return;
      }
      if (e.key === 'Escape') {
        st.setDraft([]);
        st.setTool('select');
        st.select({ kind: 'none' });
        return;
      }
      if (e.key === 'Enter' && st.tool === 'room' && st.draft.length >= 6 && floor) {
        createRoom(floor, st.draft);
        return;
      }
      if (!floor) return;
      if (mod && k === 'a') {
        e.preventDefault();
        st.select({ kind: 'items', ids: floor.items.map((i) => i.id) });
        return;
      }
      if (mod && k === 'c' && selIds.size) {
        st.setClipboard({ items: floor.items.filter((i) => selIds.has(i.id)) });
        return;
      }
      if (mod && (k === 'v' || k === 'd')) {
        e.preventDefault();
        const src = k === 'd' ? floor.items.filter((i) => selIds.has(i.id)) : st.clipboard?.items ?? [];
        if (!src.length) return;
        const off = 4 * st.project!.data.symbolSize;
        const copies = src.map((i) => ({ ...i, id: uid(), x: i.x + off, y: i.y + off }));
        st.mutate((d) => d.floors.find((f) => f.id === floor.id)!.items.push(...copies));
        st.select({ kind: 'items', ids: copies.map((c) => c.id) });
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selIds.size) {
        e.preventDefault();
        st.mutate((d) => {
          const f = d.floors.find((x) => x.id === floor.id)!;
          f.items = f.items.filter((i) => !selIds.has(i.id));
        });
        st.select({ kind: 'none' });
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && st.selection.kind === 'room') {
        e.preventDefault();
        const rid = st.selection.id;
        st.mutate((d) => {
          const f = d.floors.find((x) => x.id === floor.id)!;
          f.rooms = f.rooms.filter((r) => r.id !== rid);
        });
        st.select({ kind: 'none' });
        return;
      }
      if (e.key.startsWith('Arrow') && selIds.size) {
        e.preventDefault();
        const step = (e.shiftKey ? 5 : 0.5) * st.project!.data.symbolSize * 0.5;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        st.mutate((d) => {
          for (const i of d.floors.find((f) => f.id === floor.id)!.items) if (selIds.has(i.id)) {
            i.x += dx;
            i.y += dy;
          }
        }, 'nudge');
        return;
      }
      if (mod) return;
      if (k === 'r' && selIds.size) {
        st.mutate((d) => {
          for (const i of d.floors.find((f) => f.id === floor.id)!.items) if (selIds.has(i.id)) i.rot = (i.rot + (e.shiftKey ? 315 : 45)) % 360;
        }, 'rotate');
        return;
      }
      if (k === 'm' && selIds.size) return mirrorCopy(floor);
      if (k === 'v') return st.setTool('select');
      if (k === 'h') return st.setTool('pan');
      if (k === 'n') return st.setTool('room');
      if (k === 'f') return st.requestFit();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);
}

const TOOLS: { t: Tool; label: string; key: string; icon: string }[] = [
  { t: 'select', label: 'Select', key: 'V', icon: 'M4 2l12 8-5 1.5L8.5 17z' },
  { t: 'pan', label: 'Pan', key: 'H', icon: 'M10 2v16M2 10h16M10 2l-2.5 2.5M10 2l2.5 2.5M10 18l-2.5-2.5M10 18l2.5-2.5M2 10l2.5-2.5M2 10l2.5 2.5M18 10l-2.5-2.5M18 10l-2.5 2.5' },
  { t: 'room', label: 'Room', key: 'N', icon: 'M3 3h14v14H3z M3 10h6v7' },
];

export function Editor({ onBack }: { onBack: () => void }) {
  useAutosave();
  useShortcuts();
  const project = useStore((s) => s.project!);
  const saveState = useStore((s) => s.saveState);
  const saveError = useStore((s) => s.saveError);
  const tool = useStore((s) => s.tool);
  const past = useStore((s) => s.past.length);
  const future = useStore((s) => s.future.length);
  const floor = useFloor();
  const { setTool, undo, redo, rename } = useStore.getState();
  const [showLabels, setShowLabels] = useState(true);
  const [showRooms, setShowRooms] = useState(true);
  const [exporting, setExporting] = useState<string | null>(null);
  const [leftW, setLeftW, leftDef] = usePanelWidth('fs.leftWidth', 270, 180, 560);
  const [rightW, setRightW, rightDef] = usePanelWidth('fs.rightWidth', 330, 240, 720);

  async function doPdf() {
    setExporting('Building PDF…');
    try {
      await exportPdf(project, { labels: showLabels, rooms: false });
    } catch (e) {
      alert(`PDF export failed: ${(e as Error).message}`);
    } finally {
      setExporting(null);
    }
  }

  const saveLabel = { saved: 'Saved', dirty: 'Unsaved changes', saving: 'Saving…', error: 'Save failed', conflict: 'Saved elsewhere' }[saveState];

  return (
    <div className="editor">
      <header className="topbar">
        <button className="ghost" onClick={onBack} title="All projects">←</button>
        <input className="proj-name" value={project.name} onChange={(e) => rename(e.target.value)} aria-label="Project name" />
        <span className={`save ${saveState}`} title={saveError ?? ''}>{saveLabel}</span>
        <div className="tools" role="toolbar" aria-label="Tools">
          {TOOLS.map((x) => (
            <button key={x.t} className={tool === x.t ? 'sel' : ''} onClick={() => setTool(x.t)} title={`${x.label} (${x.key})`} disabled={!floor}>
              <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"><path d={x.icon} /></svg>
              <span>{x.label}</span>
            </button>
          ))}
          <span className="sep" />
          <button onClick={undo} disabled={!past} title="Undo (Ctrl+Z)">Undo</button>
          <button onClick={redo} disabled={!future} title="Redo (Ctrl+Y)">Redo</button>
        </div>
        <span className="grow" />
        <button onClick={() => exportExcel(project)} disabled={!project.data.floors.length}>Export Excel</button>
        <button className="primary" onClick={doPdf} disabled={!project.data.floors.length || !!exporting}>{exporting ?? 'Export PDF'}</button>
      </header>
      {saveState === 'conflict' && (
        <div className="banner">
          This project was saved from another window since you opened it. Your latest changes are not saved.
          <button onClick={() => window.location.reload()}>Reload latest</button>
          <button
            onClick={async () => {
              const p = useStore.getState().project!;
              const cur = await api.getProject(p.id);
              useStore.setState({ project: { ...p, version: cur.version }, saveState: 'dirty' });
            }}
          >
            Overwrite with mine
          </button>
        </div>
      )}
      {saveState === 'error' && <div className="banner warn">Could not save: {saveError}. Retrying on your next change.</div>}
      <div className="workspace" style={{ gridTemplateColumns: `${leftW}px 6px minmax(0, 1fr) 6px ${rightW}px` }}>
        <LeftPanel />
        <Splitter side="left" width={leftW} setWidth={setLeftW} def={leftDef} />
        <main className="center">
          {floor ? (
            <PlanCanvas key={floor.id} floor={floor} showLabels={showLabels} showRooms={showRooms} />
          ) : (
            <div className="empty">
              <h2>No floor selected</h2>
              <p>Add a floor from your architectural PDF using <b>+ Add</b> under Floors.</p>
            </div>
          )}
        </main>
        <Splitter side="right" width={rightW} setWidth={setRightW} def={rightDef} />
        <RightPanel showLabels={showLabels} setShowLabels={setShowLabels} showRooms={showRooms} setShowRooms={setShowRooms} />
      </div>
    </div>
  );
}
