import { useMemo, useState } from 'react';
import { useStore } from '../store';
import { svgFor } from '../symbols';
import { FloorDialog } from './FloorDialog';
import { ComponentDialog } from './ComponentDialog';
import { inCrop, layerCounts, layerOf } from '../layers';
import { duplicateFloor } from '../floors';
import { DEFAULT_LIBRARY, compareComponents } from '../library';

function useCollapsed() {
  const [set, setSet] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem('fs.collapsed') ?? '[]'));
    } catch {
      return new Set();
    }
  });
  const toggle = (k: string) =>
    setSet((cur) => {
      const n = new Set(cur);
      n.has(k) ? n.delete(k) : n.add(k);
      try {
        localStorage.setItem('fs.collapsed', JSON.stringify([...n]));
      } catch {
        /* storage unavailable */
      }
      return n;
    });
  return { is: (k: string) => set.has(k), toggle };
}

function SecTitle({ title, open, onToggle, extra }: { title: string; open: boolean; onToggle: () => void; extra?: string }) {
  return (
    <button className="sec-toggle" onClick={onToggle} aria-expanded={open} title={open ? 'Collapse' : 'Expand'}>
      <span className={`chev ${open ? 'open' : ''}`}>▸</span>
      <h3>{title}</h3>
      {!open && extra && <span className="sec-extra">{extra}</span>}
    </button>
  );
}

export function LeftPanel() {
  const col = useCollapsed();
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
    for (const it of f?.items ?? []) if (inCrop(f!, it)) m.set(it.code, (m.get(it.code) ?? 0) + 1);
    return m;
  }, [data, floorId]);

  const groups = useMemo(() => {
    const ql = q.trim().toLowerCase();
    const g = new Map<string, typeof data.library>();
    for (const c of [...data.library].sort(compareComponents)) {
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
          <SecTitle title="Floors" open={!col.is('floors')} onToggle={() => col.toggle('floors')} extra={data.floors.find((f) => f.id === floorId)?.name} />
          <button className="mini" onClick={() => setAddFloor(true)}>+ Add</button>
        </div>
        {!col.is('floors') && data.floors.length === 0 && <p className="muted small">Add a floor from your architectural PDF to begin.</p>}
        {!col.is('floors') && <ul className="floor-list">
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
                  <span className="count">{f.items.filter((it) => inCrop(f, it)).length}</span>
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
        </ul>}
      </section>

      {layers.length > 0 && (
        <section className="panel-sec">
          <div className="sec-head">
            <SecTitle title="Layers" open={!col.is('layers')} onToggle={() => col.toggle('layers')} extra={`${layers.length}`} />
          </div>
          {!col.is('layers') && <>
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
          </>}
        </section>
      )}

      <section className="panel-sec grow">
        <div className="sec-head">
          <SecTitle title="Components" open={!col.is('components')} onToggle={() => col.toggle('components')} />
          <span className="row gap">
            {!col.is('components') && (
              <button className="mini" title="Collapse or expand every category" onClick={() => {
                const cats = groups.map(([c]) => 'cat:' + c);
                const allClosed = cats.every((c) => col.is(c));
                for (const c of cats) if (col.is(c) === allClosed) col.toggle(c);
              }}>{groups.every(([c]) => col.is('cat:' + c)) ? 'Expand all' : 'Collapse all'}</button>
            )}
            <button className="mini" onClick={() => setEditCode(null)}>+ New</button>
          </span>
        </div>
        {!col.is('components') && <>
        {(() => {
          const have = new Set(data.library.map((c) => c.code));
          const missing = DEFAULT_LIBRARY.filter((c) => !have.has(c.code));
          return missing.length ? (
            <button className="mini" title={missing.map((c) => `${c.code} – ${c.name}`).join('\n')} onClick={() => mutate((d) => d.library.push(...structuredClone(missing)))}>
              Add {missing.length} new standard component{missing.length > 1 ? 's' : ''} ({missing.slice(0, 4).map((c) => c.code).join(', ')}{missing.length > 4 ? '…' : ''})
            </button>
          ) : null;
        })()}
        <input className="search" placeholder="Search code or name" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search components" />
        <div className="lib">
          {groups.map(([cat, list]) => (
            <div key={cat} className="lib-group">
              <button className="lib-cat" onClick={() => col.toggle('cat:' + cat)} aria-expanded={q !== '' || !col.is('cat:' + cat)}>
                <span className={`chev ${q !== '' || !col.is('cat:' + cat) ? 'open' : ''}`}>▸</span>
                {cat}
                <span className="lib-cat-n">{list.length}</span>
              </button>
              {(q !== '' || !col.is('cat:' + cat)) && list.map((c) => (
                <div key={c.code} className={`lib-item ${tool === 'place' && activeCode === c.code ? 'active' : ''}`}>
                  <button className="lib-pick" onClick={() => setActiveCode(tool === 'place' && activeCode === c.code ? null : c.code)} title={`Place ${c.code} – ${c.name}\nSupply $${c.supplyRate} + install $${c.installRate} = $${c.supplyRate + c.installRate}${c.symbol === 'profile' || c.symbol === 'loop' ? ' per metre' : ' each'}`}>
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
        </>}
      </section>
      {addFloor && <FloorDialog onClose={() => setAddFloor(false)} />}
      {editCode !== undefined && <ComponentDialog code={editCode} onClose={() => setEditCode(undefined)} />}
    </aside>
  );
}
