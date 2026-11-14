import { useMemo, useState } from 'react';
import { useStore } from '../store';
import { svgFor } from '../symbols';
import { FloorDialog } from './FloorDialog';
import { ComponentDialog } from './ComponentDialog';
import { layerCounts, layerOf } from '../layers';
import { duplicateFloor } from '../floors';

export function LeftPanel() {
  const data = useStore((s) => s.project!.data);
  const floorId = useStore((s) => s.floorId);
  const activeCode = useStore((s) => s.activeCode);
  const tool = useStore((s) => s.tool);
  const { setFloor, setActiveCode, mutate } = useStore.getState();
  const [addFloor, setAddFloor] = useState(false);
  const [editCode, setEditCode] = useState<string | null | undefined>(undefined);
  const [q, setQ] = useState('');
  const [renaming, setRenaming] = useState<string | null>(null);

  const layers = useMemo(() => layerCounts(data), [data]);
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    const f = data.floors.find((x) => x.id === floorId);
    for (const it of f?.items ?? []) m.set(it.code, (m.get(it.code) ?? 0) + 1);
    return m;
  }, [data, floorId]);

  const groups = useMemo(() => {
    const ql = q.trim().toLowerCase();
    const g = new Map<string, typeof data.library>();
    for (const c of data.library) {
      if (ql && !`${c.code} ${c.name} ${c.category}`.toLowerCase().includes(ql)) continue;
      if (!g.has(c.category)) g.set(c.category, []);
      g.get(c.category)!.push(c);
    }
    return [...g.entries()];
  }, [data.library, q]);

  return (
    <aside className="left">
      <section className="panel-sec">
        <div className="sec-head">
          <h3>Floors</h3>
          <button className="mini" onClick={() => setAddFloor(true)}>+ Add</button>
        </div>
        {data.floors.length === 0 && <p className="muted small">Add a floor from your architectural PDF to begin.</p>}
        <ul className="floor-list">
          {data.floors.map((f, i) => (
            <li key={f.id} className={f.id === floorId ? 'sel' : ''}>
              {renaming === f.id ? (
                <input
                  autoFocus
                  defaultValue={f.name}
                  aria-label="Floor name"
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v && v !== f.name) mutate((d) => (d.floors.find((x) => x.id === f.id)!.name = v));
                    setRenaming(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                    if (e.key === 'Escape') setRenaming(null);
                  }}
                />
              ) : (
                <button onClick={() => setFloor(f.id)} onDoubleClick={() => setRenaming(f.id)} title="Double-click to rename">
                  <span>{f.name}</span>
                  <span className="count">{f.items.length}</span>
                </button>
              )}
              <span className="floor-actions">
                <button className="icon" title="Copy this floor (items, wiring, rooms, erasures and text)" onClick={() => duplicateFloor(f.id)}>⧉</button>
                <button className="icon" title="Move up" disabled={i === 0} onClick={() => mutate((d) => d.floors.splice(i - 1, 0, d.floors.splice(i, 1)[0]))}>↑</button>
                <button
                  className="icon"
                  title="Remove floor"
                  onClick={() => {
                    if (f.items.length || f.rooms.length) {
                      if (!window.confirm(`Remove ${f.name} and its ${f.items.length} items and ${f.rooms.length} rooms? You can undo this.`)) return;
                    }
                    mutate((d) => (d.floors = d.floors.filter((x) => x.id !== f.id)));
                    if (floorId === f.id) setFloor(data.floors.find((x) => x.id !== f.id)?.id ?? null);
                  }}
                >
                  ×
                </button>
              </span>
            </li>
          ))}
        </ul>
      </section>

      {layers.length > 0 && (
        <section className="panel-sec">
          <div className="sec-head">
            <h3>Layers</h3>
          </div>
          <ul className="layer-list">
            {layers.map((l) => (
              <li key={l.name} className={l.hidden ? 'off' : ''}>
                <button className="icon eye" title={l.hidden ? 'Show layer' : 'Hide layer'} onClick={() => mutate((d) => { const h = new Set(d.hiddenLayers ?? []); h.has(l.name) ? h.delete(l.name) : h.add(l.name); d.hiddenLayers = [...h]; })}>
                  {l.hidden ? '◌' : '●'}
                </button>
                <span className="layer-name" title={l.name}>{l.name}</span>
                <span className="count">{l.count}</span>
                <button className="icon" title="Delete this layer's items on every floor" onClick={() => { if (window.confirm(`Delete all ${l.count} items in "${l.name}"? You can undo this.`)) mutate((d) => { for (const f of d.floors) f.items = f.items.filter((i) => layerOf(i) !== l.name); d.hiddenLayers = (d.hiddenLayers ?? []).filter((h) => h !== l.name); }); }}>×</button>
              </li>
            ))}
          </ul>
          <p className="muted small">Hidden layers are left out of the plan, schedule and exports.</p>
        </section>
      )}

      <section className="panel-sec grow">
        <div className="sec-head">
          <h3>Components</h3>
          <button className="mini" onClick={() => setEditCode(null)}>+ New</button>
        </div>
        <input className="search" placeholder="Search code or name" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search components" />
        <div className="lib">
          {groups.map(([cat, list]) => (
            <div key={cat} className="lib-group">
              <div className="lib-cat">{cat}</div>
              {list.map((c) => (
                <div key={c.code} className={`lib-item ${tool === 'place' && activeCode === c.code ? 'active' : ''}`}>
                  <button className="lib-pick" onClick={() => setActiveCode(tool === 'place' && activeCode === c.code ? null : c.code)} title={`Place ${c.code}`}>
                    <span className="lib-sym" dangerouslySetInnerHTML={{ __html: svgFor(c.symbol, c.color, 22) }} />
                    <span className="lib-code">{c.code}</span>
                    <span className="lib-name">{c.name}</span>
                    {counts.get(c.code) ? <span className="count">{counts.get(c.code)}</span> : null}
                  </button>
                  <button className="icon lib-edit" title={`Edit ${c.code}`} onClick={() => setEditCode(c.code)}>✎</button>
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>
      {addFloor && <FloorDialog onClose={() => setAddFloor(false)} />}
      {editCode !== undefined && <ComponentDialog code={editCode} onClose={() => setEditCode(undefined)} />}
    </aside>
  );
}
