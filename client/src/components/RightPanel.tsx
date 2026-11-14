import { useEffect, useMemo, useState } from 'react';
import { useFloor, useStore } from '../store';
import { distance, mirrorItems, mirrorRoom, roomAt, polygonArea } from '../geometry';
import { byRoom, copiesOf, libraryMap, money, NO_DWELLING, placedItems, totals } from '../schedule';
import { svgFor } from '../symbols';
import { api } from '../api';
import type { Floor, ProjectData, Revision } from '../types';
import { dwellingColor } from './PlanCanvas';
import { ImportDialog } from './ImportDialog';
import { linkSelected, unlinkSelected } from '../circuits';

export function RightPanel({ showLabels, setShowLabels, showRooms, setShowRooms, showWires, setShowWires }: { showLabels: boolean; setShowLabels: (v: boolean) => void; showRooms: boolean; setShowRooms: (v: boolean) => void; showWires: boolean; setShowWires: (v: boolean) => void }) {
  const tab = useStore((s) => s.rightTab);
  const { setRightTab } = useStore.getState();
  const floor = useFloor();
  return (
    <aside className="right">
      <nav className="tabs" role="tablist">
        {(['properties', 'rooms', 'schedule', 'revisions'] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'sel' : ''} onClick={() => setRightTab(t)}>
            {t === 'properties' ? 'Properties' : t === 'rooms' ? 'Rooms' : t === 'schedule' ? 'Schedule' : 'Revisions'}
          </button>
        ))}
      </nav>
      <div className="tab-body">
        {tab === 'properties' && (floor ? <Properties floor={floor} showLabels={showLabels} setShowLabels={setShowLabels} showRooms={showRooms} setShowRooms={setShowRooms} showWires={showWires} setShowWires={setShowWires} /> : <p className="muted pad">Add a floor to begin.</p>)}
        {tab === 'rooms' && (floor ? <Rooms floor={floor} /> : <p className="muted pad">Add a floor to begin.</p>)}
        {tab === 'schedule' && <Schedule />}
        {tab === 'revisions' && <Revisions />}
      </div>
    </aside>
  );
}

/* ---------------- Properties ---------------- */

function Properties({ floor, showLabels, setShowLabels, showRooms, setShowRooms, showWires, setShowWires }: { floor: Floor; showLabels: boolean; setShowLabels: (v: boolean) => void; showRooms: boolean; setShowRooms: (v: boolean) => void; showWires: boolean; setShowWires: (v: boolean) => void }) {
  const data = useStore((s) => s.project!.data);
  const selection = useStore((s) => s.selection);
  const tool = useStore((s) => s.tool);
  const draft = useStore((s) => s.draft);
  const { mutate, setTool, setDraft, select } = useStore.getState();
  const lib = useMemo(() => libraryMap(data), [data]);
  const [importing, setImporting] = useState(false);

  if (tool === 'calibrate' && draft.length === 4) return <Calibrate floor={floor} pts={draft} done={() => { setDraft([]); setTool('select'); }} />;

  const items = selection.kind === 'items' ? floor.items.filter((i) => selection.ids.includes(i.id)) : [];
  const updateSel = (fn: (it: Floor['items'][number]) => void, key?: string) =>
    mutate((d) => {
      const ids = new Set(items.map((i) => i.id));
      for (const it of d.floors.find((f) => f.id === floor.id)!.items) if (ids.has(it.id)) fn(it);
    }, key);

  if (items.length) {
    const codes = [...new Set(items.map((i) => i.code))];
    const circuits = [...new Set(items.map((i) => i.circuit ?? ''))];
    const notes = [...new Set(items.map((i) => i.note ?? ''))];
    const one = items.length === 1 ? items[0] : null;
    const room = one ? roomAt(floor, one.x, one.y) : undefined;
    return (
      <div className="pad stack">
        <h4>{items.length === 1 ? `${one!.code} – ${lib.get(one!.code)?.name ?? ''}` : `${items.length} items selected`}</h4>
        {one && <p className="muted small">{room ? `${room.name} · ${room.dwelling}` : 'Not inside a room'}</p>}
        <label htmlFor="pp-code">Component</label>
        <select id="pp-code" value={codes.length === 1 ? codes[0] : ''} onChange={(e) => updateSel((it) => (it.code = e.target.value))}>
          {codes.length > 1 && <option value="">(mixed)</option>}
          {data.library.map((c) => (
            <option key={c.code} value={c.code}>
              {c.code} – {c.name}
            </option>
          ))}
        </select>
        <div className="row gap wrap">
          <button onClick={() => linkSelected(floor)} title="Put the selected lights on one circuit (L)">Wire together</button>
          <button onClick={() => unlinkSelected(floor)} disabled={!items.some((i) => i.circuit)} title="Take the selected lights off their circuit (U)">Remove wiring</button>
        </div>
        {circuits.length === 1 && circuits[0] && <p className="muted small">Circuit {circuits[0]} has {floor.items.filter((i) => i.circuit === circuits[0]).length} lights.</p>}
        <label htmlFor="pp-cct">Circuit</label>
        <input id="pp-cct" placeholder={circuits.length > 1 ? '(mixed)' : 'e.g. K1-2 or C04'} value={circuits.length === 1 ? circuits[0] : ''} onChange={(e) => updateSel((it) => (it.circuit = e.target.value || undefined), 'circuit')} />
        <label htmlFor="pp-note">Note</label>
        <textarea id="pp-note" rows={2} placeholder={notes.length > 1 ? '(mixed)' : ''} value={notes.length === 1 ? notes[0] : ''} onChange={(e) => updateSel((it) => (it.note = e.target.value || undefined), 'note')} />
        <div className="row gap wrap">
          <button onClick={() => updateSel((it) => (it.rot = (it.rot + 315) % 360))} title="Rotate left (Shift+R)">⟲ 45°</button>
          <button onClick={() => updateSel((it) => (it.rot = (it.rot + 45) % 360))} title="Rotate right (R)">⟳ 45°</button>
          <button onClick={() => updateSel((it) => (it.rot = 0))}>Reset</button>
        </div>
        <div className="row gap wrap">
          <button disabled={!floor.axis} title={floor.axis ? 'Copy mirrored across the party wall (M)' : 'Set the party wall line first'} onClick={() => mirrorCopy(floor)}>
            Mirror copy
          </button>
          <button className="danger" onClick={() => { mutate((d) => { const f = d.floors.find((x) => x.id === floor.id)!; const ids = new Set(items.map((i) => i.id)); f.items = f.items.filter((i) => !ids.has(i.id)); }); select({ kind: 'none' }); }}>
            Delete
          </button>
        </div>
      </div>
    );
  }

  const calibrated = floor.mmPerPt ? `1:${Math.round((floor.mmPerPt / 0.3528) * 1)} at this paper size (1 pt = ${floor.mmPerPt.toFixed(2)} mm)` : 'Not set';
  return (
    <div className="pad stack">
      <h4>{floor.name}</h4>
      <label htmlFor="fl-name">Floor name</label>
      <input id="fl-name" value={floor.name} onChange={(e) => mutate((d) => (d.floors.find((f) => f.id === floor.id)!.name = e.target.value), 'floorname')} />
      <div className="kv">
        <span>Visible area</span>
        <span>{floor.crop ? 'Cropped' : 'Whole sheet'}</span>
      </div>
      <div className="row gap wrap">
        <button onClick={() => setTool('crop')}>{floor.crop ? 'Re-crop sheet' : 'Crop to dwelling'}</button>
        {floor.crop && <button onClick={() => { mutate((d) => delete d.floors.find((f) => f.id === floor.id)!.crop); setTimeout(() => useStore.getState().requestFit(), 0); }}>Show whole sheet</button>}
      </div>
      <div className="kv">
        <span>Scale</span>
        <span>{calibrated}</span>
      </div>
      <button onClick={() => setTool('calibrate')}>Set scale from a known dimension</button>
      <div className="kv">
        <span>Party wall</span>
        <span>{floor.axis ? 'Set' : 'Not set'}</span>
      </div>
      <div className="row gap wrap">
        <button onClick={() => setTool('axis')}>{floor.axis ? 'Redraw party wall' : 'Draw party wall line'}</button>
        {floor.axis && <button onClick={() => mutate((d) => delete d.floors.find((f) => f.id === floor.id)!.axis)}>Clear</button>}
      </div>
      <p className="muted small">The party wall line lets you lay out one dwelling, then mirror-copy items and rooms to the other.</p>
      <hr />
      <button onClick={() => setImporting(true)}>Import components from another PDF…</button>
      <p className="muted small">Reads fitting labels (DL1, WL2, LL1…) and Switch device tags from LA Lounge or Switch drawings and places them on this floor.</p>
      {importing && <ImportDialog floor={floor} onClose={() => setImporting(false)} />}
      <hr />
      <label htmlFor="sym-size">Symbol size</label>
      <input id="sym-size" type="range" min={1.5} max={10} step={0.5} value={data.symbolSize} onChange={(e) => mutate((d) => (d.symbolSize = Number(e.target.value)), 'symsize')} />
      <label className="check"><input type="checkbox" checked={showLabels} onChange={(e) => setShowLabels(e.target.checked)} /> Show codes</label>
      <label className="check"><input type="checkbox" checked={showWires} onChange={(e) => setShowWires(e.target.checked)} /> Show wiring</label>
      <label className="check"><input type="checkbox" checked={showRooms} onChange={(e) => setShowRooms(e.target.checked)} /> Show rooms</label>
      <hr />
      <p className="muted small">
        <b>Shortcuts</b><br />V select · H pan (or hold Space) · W wire · L wire selected together · U remove wiring · C crop · N new room · R rotate · Del delete · Ctrl+C / Ctrl+V copy and paste · Ctrl+D duplicate · M mirror copy · arrows nudge · Ctrl+Z / Ctrl+Y undo and redo · F fit
      </p>
    </div>
  );
}

export function mirrorCopy(floor: Floor) {
  const { selection, mutate, select } = useStore.getState();
  if (!floor.axis || selection.kind !== 'items') return;
  const src = floor.items.filter((i) => selection.ids.includes(i.id));
  const copies = mirrorItems(src, floor.axis);
  mutate((d) => d.floors.find((f) => f.id === floor.id)!.items.push(...copies));
  select({ kind: 'items', ids: copies.map((c) => c.id) });
}

function Calibrate({ floor, pts, done }: { floor: Floor; pts: number[]; done: () => void }) {
  const [mm, setMm] = useState('');
  const { mutate } = useStore.getState();
  const d = distance(pts[0], pts[1], pts[2], pts[3]);
  return (
    <form
      className="pad stack"
      onSubmit={(e) => {
        e.preventDefault();
        const v = Number(mm);
        if (!v || v <= 0) return;
        mutate((x) => (x.floors.find((f) => f.id === floor.id)!.mmPerPt = v / d));
        done();
      }}
    >
      <h4>Set scale</h4>
      <p className="muted small">You picked two points {d.toFixed(1)} pt apart on the page. Enter the real distance between them.</p>
      <label htmlFor="cal-mm">Real distance (mm)</label>
      <input id="cal-mm" autoFocus type="number" min="1" value={mm} onChange={(e) => setMm(e.target.value)} placeholder="e.g. 3600" />
      <div className="row gap">
        <button type="button" onClick={done}>Cancel</button>
        <button className="primary">Set scale</button>
      </div>
    </form>
  );
}

/* ---------------- Rooms ---------------- */

function Rooms({ floor }: { floor: Floor }) {
  const data = useStore((s) => s.project!.data);
  const selection = useStore((s) => s.selection);
  const { mutate, select, setTool } = useStore.getState();
  const sel = selection.kind === 'room' ? floor.rooms.find((r) => r.id === selection.id) : undefined;
  const countIn = (rid: string) => floor.items.filter((it) => roomAt(floor, it.x, it.y)?.id === rid).length;
  const area = (pts: number[]) => (floor.mmPerPt ? `${((polygonArea(pts) * floor.mmPerPt ** 2) / 1e6).toFixed(1)} m²` : '');
  const upd = (fn: (r: Floor['rooms'][number]) => void, key?: string) => sel && mutate((d) => fn(d.floors.find((f) => f.id === floor.id)!.rooms.find((r) => r.id === sel.id)!), key);

  return (
    <div className="pad stack">
      <div className="row gap">
        <button className="primary" onClick={() => setTool('room')}>+ Draw room (N)</button>
      </div>
      {sel && (
        <div className="card-inset stack">
          <label htmlFor="rm-name">Room name</label>
          <input id="rm-name" autoFocus value={sel.name} onChange={(e) => upd((r) => (r.name = e.target.value), 'roomname')} onFocus={(e) => e.target.select()} />
          <label htmlFor="rm-dw">Dwelling</label>
          <select id="rm-dw" value={sel.dwelling} onChange={(e) => upd((r) => (r.dwelling = e.target.value))}>
            {data.dwellings.map((d) => <option key={d}>{d}</option>)}
          </select>
          <p className="muted small">Drag the corner handles on the plan to adjust. {area(sel.points)}</p>
          <div className="row gap wrap">
            <button
              disabled={!floor.axis}
              title={floor.axis ? 'Mirror this room and its items to the other side of the party wall' : 'Set the party wall line first'}
              onClick={() => {
                const other = data.dwellings.find((d) => d !== sel.dwelling && d !== 'Common') ?? sel.dwelling;
                const room = mirrorRoom(sel, floor.axis!, other);
                const inside = floor.items.filter((it) => roomAt(floor, it.x, it.y)?.id === sel.id);
                const copies = mirrorItems(inside, floor.axis!);
                mutate((d) => {
                  const f = d.floors.find((x) => x.id === floor.id)!;
                  f.rooms.push(room);
                  f.items.push(...copies);
                });
                select({ kind: 'room', id: room.id });
              }}
            >
              Mirror room + items
            </button>
            <button className="danger" onClick={() => { mutate((d) => { const f = d.floors.find((x) => x.id === floor.id)!; f.rooms = f.rooms.filter((r) => r.id !== sel.id); }); select({ kind: 'none' }); }}>
              Delete room
            </button>
          </div>
        </div>
      )}
      <table className="tbl">
        <thead>
          <tr><th>Room</th><th>Dwelling</th><th className="num">Items</th></tr>
        </thead>
        <tbody>
          {[...floor.rooms].sort((a, b) => a.dwelling.localeCompare(b.dwelling) || a.name.localeCompare(b.name)).map((r) => (
            <tr key={r.id} className={sel?.id === r.id ? 'sel' : ''} onClick={() => select({ kind: 'room', id: r.id })}>
              <td>{r.name}</td>
              <td><span className="dot" style={{ background: dwellingColor(data.dwellings, r.dwelling) }} />{r.dwelling}</td>
              <td className="num">{countIn(r.id)}</td>
            </tr>
          ))}
          {floor.rooms.length === 0 && <tr><td colSpan={3} className="muted">No rooms yet. Draw rooms so every item is counted against a room and dwelling.</td></tr>}
        </tbody>
      </table>
      <DwellingEditor />
    </div>
  );
}

function DwellingEditor() {
  const dwellings = useStore((s) => s.project!.data.dwellings);
  const { mutate } = useStore.getState();
  const [name, setName] = useState('');
  return (
    <details>
      <summary className="small">Dwellings</summary>
      <ul className="plain small">
        {dwellings.map((d) => <li key={d}>{d}</li>)}
      </ul>
      <form className="row gap" onSubmit={(e) => { e.preventDefault(); const v = name.trim(); if (v && !dwellings.includes(v)) mutate((x) => x.dwellings.push(v)); setName(''); }}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Add dwelling or zone" aria-label="New dwelling" />
        <button>Add</button>
      </form>
    </details>
  );
}

/* ---------------- Schedule ---------------- */

function Schedule() {
  const data = useStore((s) => s.project!.data);
  const floorId = useStore((s) => s.floorId);
  const [scope, setScope] = useState<'floor' | 'project'>('project');
  const [dwelling, setDwelling] = useState('all');
  const [view, setView] = useState<'totals' | 'rooms'>('totals');

  const items = useMemo(() => {
    const floors = scope === 'floor' ? data.floors.filter((f) => f.id === floorId) : data.floors;
    const all = placedItems(data, floors);
    return dwelling === 'all' ? all : all.filter((p) => p.dwelling === dwelling);
  }, [data, floorId, scope, dwelling]);
  const tot = useMemo(() => totals(data, items), [data, items]);
  const rooms = useMemo(() => byRoom(items), [items]);
  const unassigned = items.filter((p) => p.dwelling === NO_DWELLING).length;
  const sum = (k: 'qty' | 'supply' | 'install' | 'total') => tot.reduce((a, l) => a + l[k], 0);
  const lib = libraryMap(data);
  const n = copiesOf(data);
  const { mutate } = useStore.getState();

  return (
    <div className="pad stack">
      <div className="row gap">
        <label htmlFor="copies" className="small" style={{ margin: 0 }}>Identical dwellings built from this layout</label>
        <input id="copies" type="number" min={1} max={20} value={n} style={{ width: 60 }} onChange={(e) => mutate((d) => (d.copies = Math.max(1, Number(e.target.value) || 1)), 'copies')} />
      </div>
      <div className="row gap wrap">
        <select value={scope} onChange={(e) => setScope(e.target.value as any)} aria-label="Scope">
          <option value="project">All floors</option>
          <option value="floor">This floor</option>
        </select>
        <select value={dwelling} onChange={(e) => setDwelling(e.target.value)} aria-label="Dwelling">
          <option value="all">All dwellings</option>
          {data.dwellings.map((d) => <option key={d}>{d}</option>)}
          <option value={NO_DWELLING}>Not in a room</option>
        </select>
        <div className="seg">
          <button className={view === 'totals' ? 'sel' : ''} onClick={() => setView('totals')}>Totals</button>
          <button className={view === 'rooms' ? 'sel' : ''} onClick={() => setView('rooms')}>By room</button>
        </div>
      </div>
      {unassigned > 0 && dwelling === 'all' && data.floors.some((f) => f.rooms.length > 0) && <p className="warn small">{unassigned} items are not inside a room yet.</p>}
      {view === 'totals' ? (
        <table className="tbl">
          <thead>
            <tr><th></th><th>Code</th><th className="num">Per dw.</th><th className="num">×{n} qty</th><th className="num">Supply</th><th className="num">Install</th><th className="num">Total</th></tr>
          </thead>
          <tbody>
            {tot.map((l) => (
              <tr key={l.component.code} title={l.component.name}>
                <td><span dangerouslySetInnerHTML={{ __html: svgFor(l.component.symbol, l.component.color, 16) }} /></td>
                <td className="mono">{l.component.code}</td>
                <td className="num">{l.qty}</td>
                <td className="num">{l.qty * n}</td>
                <td className="num">{money(l.supply * n)}</td>
                <td className="num">{money(l.install * n)}</td>
                <td className="num">{money(l.total * n)}</td>
              </tr>
            ))}
            {tot.length === 0 && <tr><td colSpan={7} className="muted">Nothing placed yet.</td></tr>}
          </tbody>
          {tot.length > 0 && (
            <tfoot>
              <tr><td></td><td>Total</td><td className="num">{sum('qty')}</td><td className="num">{sum('qty') * n}</td><td className="num">{money(sum('supply') * n)}</td><td className="num">{money(sum('install') * n)}</td><td className="num">{money(sum('total') * n)}</td></tr>
            </tfoot>
          )}
        </table>
      ) : (
        <div className="rooms-sched">
          {rooms.map((r) => (
            <div key={`${r.floor}|${r.dwelling}|${r.room}`} className="room-block">
              <div className="room-head">
                <span>{r.room}</span>
                <span className="muted small">{scope === 'project' ? `${r.floor} · ` : ''}{r.dwelling} · {r.qty}</span>
              </div>
              <div className="chips">
                {[...r.counts.entries()].map(([code, n]) => (
                  <span key={code} className="chip" style={{ borderColor: lib.get(code)?.color }}>
                    <b>{n}</b> {code}
                  </span>
                ))}
              </div>
            </div>
          ))}
          {rooms.length === 0 && <p className="muted">Nothing placed yet.</p>}
        </div>
      )}
      <p className="muted small">Costs are for all {n} dwellings, ex GST. Edit rates in the component library.</p>
    </div>
  );
}

/* ---------------- Revisions ---------------- */

function Revisions() {
  const project = useStore((s) => s.project!);
  const [list, setList] = useState<Revision[] | null>(null);
  const [label, setLabel] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [compare, setCompare] = useState<{ rev: Revision; data: ProjectData } | null>(null);

  const load = () => api.listRevisions(project.id).then(setList).catch((e) => setError(e.message));
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!label.trim()) return;
    setBusy(true);
    try {
      await api.createRevision(project.id, label.trim(), note.trim(), project.data);
      setLabel('');
      setNote('');
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const diff = useMemo(() => {
    if (!compare) return [];
    const a = totals(compare.data, placedItems(compare.data));
    const b = totals(project.data, placedItems(project.data));
    const codes = [...new Set([...a, ...b].map((l) => l.component.code))];
    return codes
      .map((c) => ({ code: c, was: a.find((l) => l.component.code === c)?.qty ?? 0, now: b.find((l) => l.component.code === c)?.qty ?? 0 }))
      .filter((r) => r.was !== r.now);
  }, [compare, project.data]);

  return (
    <div className="pad stack">
      <form className="stack" onSubmit={save}>
        <p className="muted small">Save a named copy of the whole layout when you issue drawings, e.g. “Rev B – to electrician”.</p>
        <input placeholder="Label, e.g. Rev B" value={label} onChange={(e) => setLabel(e.target.value)} aria-label="Revision label" />
        <input placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Revision note" />
        <button className="primary" disabled={busy || !label.trim()}>{busy ? 'Saving…' : 'Save revision'}</button>
      </form>
      {error && <p className="error">{error}</p>}
      <ul className="rev-list">
        {list?.map((r) => (
          <li key={r.id}>
            <div>
              <b>{r.label}</b> <span className="muted small">{new Date(r.createdAt).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })}</span>
              {r.note && <div className="small">{r.note}</div>}
            </div>
            <button className="mini" onClick={async () => setCompare({ rev: r, data: (await api.getRevision(r.id)).data })}>Compare</button>
          </li>
        ))}
        {list?.length === 0 && <li className="muted small">No revisions saved yet.</li>}
      </ul>
      {compare && (
        <div className="card-inset">
          <div className="row between"><b>Changes since {compare.rev.label}</b><button className="icon" onClick={() => setCompare(null)} aria-label="Close">×</button></div>
          {diff.length === 0 ? (
            <p className="muted small">No quantity changes.</p>
          ) : (
            <table className="tbl">
              <thead><tr><th>Code</th><th className="num">Was</th><th className="num">Now</th><th className="num">Change</th></tr></thead>
              <tbody>
                {diff.map((r) => (
                  <tr key={r.code}><td className="mono">{r.code}</td><td className="num">{r.was}</td><td className="num">{r.now}</td><td className={`num ${r.now > r.was ? 'up' : 'down'}`}>{r.now > r.was ? '+' : ''}{r.now - r.was}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

